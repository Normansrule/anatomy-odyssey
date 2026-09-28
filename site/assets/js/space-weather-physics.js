/* Space Weather, live: the physics and bookkeeping behind every number.
 *
 * Pure functions, no DOM, no three.js, so they can be unit-tested with Node
 * (scripts/test_space_weather.mjs). Every formula cites its source.
 */

export const DEG = Math.PI / 180;
export const RE_KM = 6371;                    // mean Earth radius (km), used for R⊕
export const AU_KM = 149597870.7;             // astronomical unit (IAU 2012)
export const L1_KM = 1.5e6;                   // Sun–Earth L1, where DSCOVR / ACE / SWFO-L1 sit (≈1.5 million km)
const MP_KG = 1.67262192e-27;                 // proton mass (CODATA 2018)
const KB = 1.380649e-23;                      // Boltzmann constant
const MU0 = 4e-7 * Math.PI;                   // vacuum permeability

/* ------------------------------------------------------------------ solar wind */

/** Solar-wind dynamic (ram) pressure p = ρv² in nanopascals.
 *  ρ = n·m_p (protons only, n in cm⁻³), v in km/s:
 *  p[nPa] = 1.6726e-27 kg · n·1e6 m⁻³ · (v·1e3 m/s)² · 1e9 = 1.6726e-6 · n · v². */
export function dynPressure(n, v) {
  if (!(n > 0) || !(v > 0)) return NaN;
  return MP_KG * 1e21 * n * v * v;
}

/** Shue et al. (1998), J. Geophys. Res. 103(A8), 17691–17700:
 *  r0 = (10.22 + 1.29 tanh[0.184 (Bz + 8.14)]) · Dp^(−1/6.6)   [R⊕]
 *  α  = (0.58 − 0.007 Bz) · (1 + 0.024 ln Dp)
 *  r(θ) = r0 · (2 / (1 + cos θ))^α,  θ = angle from the Sun–Earth line. */
export function shue(bz, dp) {
  const B = isFinite(bz) ? Math.max(-60, Math.min(60, bz)) : 0;
  const D = isFinite(dp) && dp > 0 ? Math.max(0.05, Math.min(120, dp)) : 2;
  const r0 = (10.22 + 1.29 * Math.tanh(0.184 * (B + 8.14))) * Math.pow(D, -1 / 6.6);
  const alpha = (0.58 - 0.007 * B) * (1 + 0.024 * Math.log(D));
  return { r0, alpha };
}
export const shueR = (r0, alpha, theta) => r0 * Math.pow(2 / (1 + Math.cos(theta)), alpha);

/** Fast magnetosonic Mach number of the solar wind.
 *  Alfvén speed v_A = B/√(μ0 ρ); sound speed c_s = √(γ k (T_p + T_e) / m_p) with T_e ≈ T_p, γ = 5/3. */
export function machMS(v, n, bt, T) {
  if (!(v > 0) || !(n > 0)) return NaN;
  const rho = n * 1e6 * MP_KG;
  const vA = (isFinite(bt) && bt > 0 ? bt * 1e-9 : 5e-9) / Math.sqrt(MU0 * rho) / 1e3;   // km/s
  const cs = Math.sqrt((5 / 3) * KB * 2 * (isFinite(T) && T > 0 ? T : 1e5) / MP_KG) / 1e3; // km/s
  return v / Math.sqrt(vA * vA + cs * cs);
}

/** Bow-shock nose distance from the magnetopause nose.
 *  Farris & Russell (1994), J. Geophys. Res. 99(A9), 17681: stand-off Δ/D = 1.1 · [(γ−1)M² + 2] / [(γ+1)(M² − 1)],
 *  γ = 5/3, applied here with the magnetopause stand-off distance D (a common simplification). */
export function bowShock(r0, M) {
  const g = 5 / 3;
  const m2 = isFinite(M) ? Math.max(1.6, M) ** 2 : 64;
  return r0 * (1 + 1.1 * ((g - 1) * m2 + 2) / ((g + 1) * (m2 - 1)));
}
/** Bow-shock shape: a conic r = R_bs (1+ε)/(1+ε cos θ) with ε ≈ 0.81 (Farris, Petrinec & Russell 1991, GRL 18, 1821). */
export const BS_ECC = 0.81;
export const bowR = (rbs, theta) => rbs * (1 + BS_ECC) / (1 + BS_ECC * Math.cos(theta));

/** Newell et al. (2007), J. Geophys. Res. 112, A01206: the "universal" solar wind–magnetosphere coupling function
 *  dΦ_MP/dt = v^(4/3) · B_T^(2/3) · sin^(8/3)(θ_c/2), θ_c = atan2(B_y, B_z) the IMF clock angle.
 *  Returned in units of (km/s)^(4/3) nT^(2/3); a quiet day is a few thousand, big storms exceed 20,000. */
export function newell(v, by, bz) {
  if (!(v > 0) || !isFinite(bz)) return NaN;
  const y = isFinite(by) ? by : 0;
  const bt = Math.hypot(y, bz);
  const th = Math.atan2(y, bz);
  return Math.pow(v, 4 / 3) * Math.pow(bt, 2 / 3) * Math.pow(Math.abs(Math.sin(th / 2)), 8 / 3);
}

/** Travel time of a disturbance at constant speed v (km/s) over distance d (km), in hours. */
export const travelHours = (v, d = AU_KM) => (v > 0 ? d / v / 3600 : NaN);

/* ------------------------------------------------------------------ NOAA scales */

/** Kp → NOAA G-scale (G1 Kp=5, G2 6, G3 7, G4 8 incl. 9−, G5 9). Fractional Kp from the feed: 8.67 = 9−. */
export function gFromKp(kp) {
  if (!isFinite(kp)) return 0;
  const t = Math.round(kp * 3);              // in thirds: 5− = 14, 5 = 15, 9− = 26, 9 = 27
  if (t >= 27) return 5;
  if (t >= 23) return 4;                     // 8−, 8, 8+, 9−
  if (t >= 20) return 3;
  if (t >= 17) return 2;
  if (t >= 14) return 1;
  return 0;
}
/** Peak soft X-ray flux (0.1–0.8 nm, W/m²) → NOAA R-scale: R1 M1, R2 M5, R3 X1, R4 X10, R5 X20. */
export function rFromFlux(f) {
  if (!(f > 0)) return 0;
  if (f >= 2e-3) return 5;
  if (f >= 1e-3) return 4;
  if (f >= 1e-4) return 3;
  if (f >= 5e-5) return 2;
  if (f >= 1e-5) return 1;
  return 0;
}
/** Flare class from flux: A < 1e-7 ≤ B < 1e-6 ≤ C < 1e-5 ≤ M < 1e-4 ≤ X (W/m², GOES 0.1–0.8 nm). */
export function flareClass(f) {
  if (!(f > 0)) return "—";
  const L = ["A", "B", "C", "M", "X"];
  let i = Math.floor(Math.log10(f)) + 8;
  i = Math.max(0, Math.min(4, i));
  const base = Math.pow(10, i - 8);
  const m = f / base;
  return L[i] + (m >= 9.95 && i < 4 ? "9.9" : m.toFixed(1));
}
export const SCALE_WORDS = ["none", "minor", "moderate", "strong", "severe", "extreme"];

/** Kp status bands used for colour + label (never colour alone). */
export function kpBand(kp) {
  const g = gFromKp(kp);
  if (g > 0) return { key: g >= 3 ? "g3" : "g1", label: `G${g} ${SCALE_WORDS[g]} storm` };
  const t = Math.round(kp * 3);
  if (t >= 11) return { key: "active", label: "Active" };
  return { key: "quiet", label: t >= 8 ? "Unsettled" : "Quiet" };
}
/** Kp as the traditional thirds notation: 5.33 → "5+", 5.67 → "6−". */
export function kpText(kp) {
  if (!isFinite(kp)) return "—";
  const t = Math.round(kp * 3);
  const w = Math.round(t / 3), r = t - w * 3;
  return w + (r === 1 ? "+" : r === -1 ? "−" : "");
}

/* ------------------------------------------------------------------ astronomy (low precision) */

export const jd = (ms) => ms / 86400000 + 2440587.5;
/** Sun position, Astronomical Almanac low-precision formulae (≈0.01° 1950–2050). */
export function sunRaDec(ms) {
  const n = jd(ms) - 2451545.0;
  const L = (280.460 + 0.9856474 * n) * DEG;
  const g = (357.528 + 0.9856003 * n) * DEG;
  const lam = L + (1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * DEG;
  const eps = (23.439 - 4e-7 * n) * DEG;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lam));
  return { ra, dec, lam, eps };
}
/** Greenwich Mean Sidereal Time (radians), IAU 1982 linear term. */
export function gmst(ms) {
  const d = jd(ms) - 2451545.0;
  let g = (280.46061837 + 360.98564736629 * d) % 360;
  if (g < 0) g += 360;
  return g * DEG;
}
/** Sun altitude (degrees) at latitude/longitude (degrees). */
export function sunAlt(ms, lat, lon) {
  const s = sunRaDec(ms);
  const H = gmst(ms) + lon * DEG - s.ra;
  const la = lat * DEG;
  return Math.asin(Math.sin(la) * Math.sin(s.dec) + Math.cos(la) * Math.cos(s.dec) * Math.cos(H)) / DEG;
}
/** The next dark window (Sun below −12°, nautical twilight) starting within 24 h. */
export function darkWindow(ms, lat, lon, limit = -12) {
  const step = 10 * 60000;
  let start = null, end = null;
  for (let t = ms; t <= ms + 36 * 3600000; t += step) {
    const dark = sunAlt(t, lat, lon) < limit;
    if (dark && start === null) { if (t > ms + 24 * 3600000) break; start = t; }
    if (!dark && start !== null) { end = t; break; }
  }
  if (start !== null && end === null) end = start + 12 * 3600000;       // polar night
  return start === null ? null : { start, end, now: start === ms };
}

/** Geomagnetic latitude in a centred-dipole model. Dipole north pole ≈ 80.8° N, 72.7° W
 *  (International Geomagnetic Reference Field, IGRF, epoch 2025). */
export const DIPOLE = { lat: 80.8, lon: -72.7 };
export function magLat(lat, lon) {
  const p = DIPOLE.lat * DEG, l = lat * DEG;
  const s = Math.sin(l) * Math.sin(p) + Math.cos(l) * Math.cos(p) * Math.cos((lon - DIPOLE.lon) * DEG);
  return Math.asin(Math.max(-1, Math.min(1, s))) / DEG;
}
/** Great-circle angle between two points (degrees). */
export function angDist(la1, lo1, la2, lo2) {
  const a = la1 * DEG, b = la2 * DEG, d = (lo2 - lo1) * DEG;
  const c = Math.sin(a) * Math.sin(b) + Math.cos(a) * Math.cos(b) * Math.cos(d);
  return Math.acos(Math.max(-1, Math.min(1, c))) / DEG;
}
/** How far away (ground angle, degrees) can you see aurora at height h km, e degrees above the horizon?
 *  Spherical Earth geometry: tan e = (cos φ − R/(R+h)) / sin φ, solved for φ by bisection. */
export function auroraReach(hKm = 150, eDeg = 5) {
  const k = RE_KM / (RE_KM + hKm), te = Math.tan(eDeg * DEG);
  let lo = 0.0001, hi = Math.acos(k);
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    const f = (Math.cos(m) - k) / Math.sin(m);
    if (f > te) lo = m; else hi = m;
  }
  return lo / DEG;
}
/** Rule of thumb: the auroral oval's equatorward edge sits near geomagnetic latitude 66.5° − 2.05° × Kp
 *  (the linear relation behind NOAA's Kp aurora-latitude maps; approximate). */
export const ovalEdge = (kp) => 66.5 - 2.05 * kp;
export const kpNeeded = (absMagLat, reachDeg = 0) => Math.max(0, (66.5 - absMagLat - reachDeg) / 2.05);

/** A smooth auroral-oval probability model used ONLY when the OVATION grid is unavailable:
 *  a ring centred on each geomagnetic pole, displaced ~4° towards the night side, whose
 *  equatorward edge follows ovalEdge(Kp). Returns 0–100 like OVATION. */
export function ovalModel(kp, glat, glon, utMs) {
  const ml = magLat(glat, glon);
  const hemi = ml >= 0 ? 1 : -1;
  // magnetic local time: angle from the subsolar magnetic meridian (approximate, via solar hour angle)
  const s = sunRaDec(utMs);
  const H = gmst(utMs) + glon * DEG - s.ra;              // 0 at local noon
  const night = -Math.cos(H);                             // +1 at midnight, −1 at noon
  const edge = ovalEdge(kp) - 3.5 * night;                // oval reaches further equatorward at night
  const width = 5 + 0.9 * kp;
  const centre = edge + width * 0.55;
  const d = Math.abs(ml * hemi) - centre;
  const peak = Math.min(95, 18 + 8.5 * kp) * (0.62 + 0.38 * (night * 0.5 + 0.5));
  return Math.max(0, peak * Math.exp(-(d * d) / (2 * (width * 0.42) ** 2)));
}

/* ------------------------------------------------------------------ alerts in plain English */
const ALERT_RULES = [
  [/Geomagnetic K-index of (\d)/i, (m, kind) => {
    const k = +m[1], g = gFromKp(k);
    const verb = /WARNING/.test(kind) ? "is expected to reach" : /SUMMARY|ALERT/.test(kind) ? "reached" : "may reach";
    return `Earth's magnetic field is disturbed: Kp ${verb} ${k}${g ? ` (G${g} ${SCALE_WORDS[g]} storm)` : ""}. ${k >= 7 ? "Aurora may be visible far from the poles; power grids and satellite operators are on watch." : k >= 5 ? "Aurora likely at high latitudes; small effects on power grids and satellites." : "Mostly a high-latitude aurora event."}`;
  }],
  [/Geomagnetic Storm Category (G\d) Predicted/i, (m) => `Storm watch: forecasters expect a ${m[1]} (${SCALE_WORDS[+m[1][1]]}) geomagnetic storm, usually because a Coronal Mass Ejection (CME) is on its way.`],
  [/Geomagnetic Sudden Impulse/i, () => "A solar-wind shock just struck the magnetosphere, a sharp jump in Earth's magnetic field that often marks a Coronal Mass Ejection (CME) arriving."],
  [/X-ray Flux exceeded M5/i, () => "A strong solar flare (M5 or bigger) is under way. High-frequency radio can fade out on the sunlit side of Earth (R2 or more)."],
  [/X-ray Event exceeded X(\d+)/i, (m) => `A major X-class solar flare (X${m[1]} or bigger). Expect high-frequency radio blackouts on the sunlit side of Earth.`],
  [/Type II Radio Emission/i, () => "A radio burst sweeping down in frequency: a shock wave is racing out through the Sun's corona, often the leading edge of a Coronal Mass Ejection (CME)."],
  [/Type IV Radio Emission/i, () => "A long-lasting broadband radio burst, typical of big eruptions that launch Coronal Mass Ejections (CMEs)."],
  [/Electron 2MeV Integral Flux/i, () => "Energetic electrons (above 2 million electron-volts) are high at geostationary orbit. Satellites can build up internal charge and suffer glitches."],
  [/Proton 10MeV Integral Flux exceeded (\d+)/i, (m) => `Solar radiation storm: energetic protons above 10 MeV passed ${m[1]} particle flux units (S${m[1] === "10" ? 1 : m[1] === "100" ? 2 : m[1] === "1000" ? 3 : 4}). Polar flights and astronauts may receive extra radiation; polar high-frequency radio suffers.`],
  [/Proton 100MeV Integral Flux/i, () => "Very energetic protons (above 100 MeV) are arriving: the kind that can reach aircraft altitudes."],
  [/10cm Radio Burst/i, () => "A burst of radio noise at 10.7 cm wavelength from a flare. It can briefly interfere with GPS and satellite links on the sunlit side."],
  [/CANCEL/i, () => "A previous watch or warning has been cancelled."]
];
/** Turn an SWPC alert message into { kind, headline, plain, scale }. */
export function explainAlert(msg) {
  const lines = String(msg || "").split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const head = lines.find((l) => /^(ALERT|WARNING|WATCH|SUMMARY|CONTINUED ALERT|EXTENDED WARNING|CANCEL[A-Z ]*):/i.test(l)) || lines[3] || lines[0] || "";
  const kind = (head.split(":")[0] || "").toUpperCase();
  const scaleLine = lines.find((l) => /^NOAA Scale:/i.test(l)) || "";
  const sm = scaleLine.match(/\b([GRS])(\d)\b/);
  let plain = "";
  for (const [re, fn] of ALERT_RULES) {
    const m = head.match(re);
    if (m) { plain = fn(m, kind); break; }
  }
  if (!plain) plain = head.replace(/^[A-Z ]+:\s*/, "");
  return { kind: kind || "NOTICE", headline: head.replace(/^[A-Z ]+:\s*/, ""), plain, scale: sm ? sm[1] + sm[2] : "" };
}
