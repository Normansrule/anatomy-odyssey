/* Cosmic Library · Mars 2020 "Perseverance" Entry, Descent and Landing (EDL) physics
 * ---------------------------------------------------------------------------
 * Pure JavaScript, no DOM: imported by the page and by scripts/test_mars_edl.mjs.
 *
 *   entry + parachute: 2-D point mass in the flight plane (Mars-centred, inverse-
 *     square gravity) plus a small flat crossrange axis, fourth-order Runge–Kutta.
 *     Forces: drag, lift from the centre-of-mass offset (L/D) rotated by the bank
 *     angle, parachute drag. Atmosphere: NASA Glenn Mars model (exponential,
 *     scale height 11.1 km). Mars rotation and winds aloft are ignored.
 *   entry guidance: a numerical predictor–corrector stands in for the Apollo-
 *     derived Mars Science Laboratory (MSL) / Mars 2020 entry guidance. It uses
 *     the real phase logic: range control once drag exceeds 0.2 g, bank
 *     reversals to keep crossrange inside a corridor, heading alignment below
 *     1,100 m/s with |bank| ≤ 30°, then "Straighten Up and Fly Right" (SUFR).
 *   powered descent: 3-D flat-ground point mass, eight throttled Mars Landing
 *     Engines (MLEs), zero-effort-miss / zero-effort-velocity (ZEM/ZEV) feedback
 *     guidance (a stand-in for the real polynomial guidance), constant-velocity
 *     descent, sky crane with a pendulum rover on bridles, flyaway.
 *
 * Sources (numbers are commented where used):
 *   [PK]   Mars 2020 Perseverance Landing Press Kit, NASA/JPL, Feb 2021
 *          (jpl.nasa.gov/news/press_kits/mars_2020/landing/mission/)
 *   [FM]   "Assessment of the Mars 2020 Entry, Descent, and Landing Simulation",
 *          NASA NTRS 20210024480 (as-flown EDL performance table)
 *   [MEADS] "Mars Entry, Descent, and Landing Instrumentation 2 (MEDLI2) …
 *          MEADS reconstruction", NASA NTRS 20210024320
 *   [EG]   McGrew et al., "Entry Guidance Design and Post-Flight Performance of
 *          the Mars 2020 Mission", AIAA/AAS 2025, NTRS 20240015538
 *   [WP]   Wikipedia, "Mars 2020" (component masses, parachute, ellipse)
 *   [GRC]  NASA Glenn Research Center, "Mars Atmosphere Model – Metric Units"
 *   [FS]   NASA Mars Fact Sheet (GM, radius, scale height 11.1 km)
 *   [SG]   Sutton & Graves (1971) stagnation-point heating, Mars constant
 *   [BM]   Braun & Manning, "Mars Exploration Entry, Descent and Landing
 *          Challenges", IEEE Aerospace Conf. 2006 (Table 1, heritage landers)
 * This is an educational model: with the default settings it lands within
 * roughly ten percent of the flown values at the key events, not on top of them.
 * ------------------------------------------------------------------------- */

export const DEG = Math.PI / 180;
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
export const G0 = 9.80665;                 // standard Earth gravity (for "g" readouts)
export const MU = 4.282837e13;             // Mars GM, m³/s² [FS]
export const R_AREOID_SITE = 3393.98e3;    // areoid radius at Jezero: 3522.2 km EI radius − 128.22 km EI altitude [MEADS]
export const SITE_ELEV = -2570;            // landing-site elevation below the MOLA areoid, m (≈ −2.57 km)
export const R_SITE = R_AREOID_SITE + SITE_ELEV; // local surface radius used as "0 m altitude"
export const G_SITE = MU / (R_SITE * R_SITE);    // 3.72 m/s² at Jezero (3.71 at the equator [FS])
export const OWLT = 682;                   // one-way light time on landing day: 11 min 22 s [PK]
// Spacecraft event time of entry interface, derived from touchdown received on
// Earth at ≈20:55 UTC [WP] minus 11 min 22 s light time [PK] minus E+6:59 [FM].
// Press releases round to the minute, so these clocks are good to about ±30 s.
export const EI_SCET_MS = Date.UTC(2021, 1, 18, 20, 36, 39);

/* ---------------- vehicle ---------------- */
export const VEH = {
  rEI: 3522.2e3,           // entry interface radius [EG, MEADS]
  vEI: 5324.7,             // entry speed, m/s (5.3247 km/s) [FM]
  gammaEI: -15.48,         // entry flight-path angle, deg [FM]
  crossEI: 3300,           // crosstrack error at entry, m (3.3 km) [FM]
  diam: 4.5,               // aeroshell diameter, m [PK]
  LD: 0.24,                // hypersonic lift-to-drag ratio [EG]
  noseR: 1.125,            // heat-shield nose radius, m (70° sphere-cone, Rn = D/4, MSL heritage)
  // Masses (kg). Rover 1,025, descent stage 1,070 fuelled (400 propellant),
  // heat shield 440, backshell 575 [WP]. Entry mass derived: 4,060.5 kg launch
  // − 539 kg cruise stage − two 75 kg cruise balance masses ≈ 3,370 kg.
  mEntry: 3370,
  ebmN: 6, ebmM: 25,       // six 25 kg tungsten entry balance masses (MSL heritage design [WP "Mars Science Laboratory"])
  cbmN: 2, cbmM: 75,       // two 75 kg tungsten cruise balance masses, ejected after cruise stage separation
  mHeatShield: 440,        // [WP]
  mRover: 1025,            // [WP]
  mDSDry: 670,             // descent stage 1,070 kg fuelled − 400 kg propellant [WP]
  mProp: 400,              // [WP]
  // everything else (backshell 575 kg + parachute, harness, instruments…)
  get mBackshell() { return this.mEntry - this.ebmN * this.ebmM - this.mHeatShield - this.mRover - this.mDSDry - this.mProp; }
};
VEH.area = Math.PI * (VEH.diam / 2) ** 2;  // 15.9 m² reference area

// Capsule drag coefficient vs Mach: 70° sphere-cone at its ≈16° trim angle.
// Hypersonic ≈1.52: the flown peak dynamic pressure and deceleration (14.87 kPa
// [MEADS], 10.7 g [FM]) imply a ballistic coefficient m/(C_D·A) ≈ 142 kg/m².
// Like Viking's and MSL's aeroshells it rises in the low-supersonic range and
// drops to ≈1.05 subsonic (trend of the Viking/MSL aerodynamic databases; the
// exact values here are a simplified fit).
export let CD_CAP = [[0, 1.05], [0.6, 1.05], [0.8, 1.12], [1.0, 1.32], [1.2, 1.5], [1.5, 1.62], [2, 1.68], [3, 1.66], [5, 1.58], [8, 1.53], [12, 1.52], [60, 1.52]];
export function setCdTable(t) { CD_CAP = t; }
export function cdCapsule(M) { return interp(CD_CAP, M); }

/* ---------------- parachute: 21.5 m supersonic disk-gap-band [PK] ---------------- */
export const CHUTE = {
  D: 21.5,
  cdSup: 0.60, cdSub: 0.66,   // supersonic / subsonic drag coefficient (disk-gap-band); subsonic value set so the
                              // descent speed at 2.2 km matches the flown 81 m/s [FM]
  tLineStretch: 1.1,          // mortar fire → line stretch ≈ 1.1 s (MSL reconstruction: 1.135 s)
  tInflate: 0.65,             // line stretch → first peak load ≈ 0.6 s (MSL: 0.635 s)
  overshoot: 1.32,            // opening-load factor on peak (peak load ≈ q·Cd·A·1.3 matches 34.2 kips at q = 504 Pa [FM])
  loadLimit: 298e3,           // ≈67,000 lbf, the strongest load the Mars 2020 canopy was tested to (ASPIRE sounding-rocket test)
  machMax: 2.2,               // Range Trigger never opens the parachute faster than Mach 2.2 [EG]
  machFloor: 1.45,            // model: Range Trigger opens anyway once this slow
  machFail: 2.3               // model: beyond the tested Mach range the canopy is assumed to fail
};
CHUTE.area = Math.PI * (CHUTE.D / 2) ** 2;  // 363 m²

/* ---------------- descent stage [PK] ---------------- */
export const DS = {
  nEng: 8,               // eight throttleable Mars Landing Engines [PK]
  thrust: 3100,          // max thrust per engine, N (MSL / Mars 2020 MLE: 400–3,100 N)
  isp: 220,              // s, monopropellant hydrazine
  minThrottle: 0.13,     // 400 N / 3,100 N
  vCV: 0.75,             // constant-velocity descent and touchdown speed, m/s (1.7 mph [PK])
  bridle: 7.6,           // bridle length, m (25 ft [PK])
  craneAlt: 20,          // sky crane starts ≈ 20 m above the surface [PK]
  spoolRate: 1.0,        // bridle pay-out rate with the descent brake, m/s (model)
  roverH: 1.1,           // rover deck (bridle attach) above wheel bottoms, m
  tDetect: 1.6,          // touchdown detection: sustained low thrust, s (model)
  divertMax: 600         // model: largest TRN divert we allow, m (the real capability is a few hundred metres)
};

/* ---------------- entry guidance parameters ---------------- */
export const GUID = {
  dragStart: 1.96,       // range control starts at 0.2 Earth g drag [EG]
  vHeading: 1100,        // heading alignment below 1,100 m/s [EG]
  bankHA: 30,            // |bank| ≤ 30° during heading alignment [EG]
  rollRate: 20,          // deg/s bank rate limit (model)
  sufrLead: 17,          // SUFR ≈17 s before deploy (E+224 s vs E+241 s [MEADS])
  hsSepDelay: 20,        // heat shield separates 20 s after parachute deploy [PK]
  lvsTop: 4200, lvsBottom: 2200, lvsFix: 8, // Lander Vision System works 4.2 → 2.2 km, fix in < 10 s [PK]
  bsSepAlt: 2100,        // backshell separation ≈ 2.1 km [PK]
  revTau: 20,            // crossrange look-ahead used by the bank-reversal logic, s (model)
  dbLow: 300, dbHigh: 4500, // crossrange corridor at low / entry speed, m (model; gives the flown three reversals)
  haKz: 0.004, haKv: 0.12,  // heading-alignment gains (model)
  aggrOff: 20,           // 'aggressive' profile: bank this many degrees steeper than the reference (model)
  vPredEnd: 430,         // predictor aims the range at this speed (≈ the flown deploy speed, 433 m/s [FM])
  // Pre-flight planned parachute-deploy point, metres uprange of the landing
  // target (the Range Trigger's aim point). Found by running this simulator.
  deployUprange: 7500,
  // Where entry interface sits, metres uprange of the target (model geometry).
  eiUprange: 630000
};

/* ---------------- atmosphere ----------------
 * Exponential atmosphere, ρ = ρ₀·exp(−∫dh/H), whose local scale height
 * H = R·T/g follows the NASA Glenn Mars temperature profile [GRC]: ≈12 km near
 * the ground, ≈11 km (the Fact Sheet's average 11.1 km [FS]) around 10–20 km and
 * ≈8–9 km in the cold upper air where peak deceleration happens. The Glenn
 * formula is written for altitude above the areoid, so we shift by the site
 * elevation; above ~45 km we hold T at T_TOP (the real upper atmosphere is
 * roughly isothermal around 130–170 K).
 * ρ₀ is the Glenn surface pressure times a season factor: the Glenn fit
 * (≈0.88 kPa at Jezero's elevation) is a yearly-average profile, while
 * Perseverance's weather station (MEDA) read roughly 0.72–0.75 kPa in its first
 * sols (northern spring, Ls ≈ 5°), so we scale by 0.83. */
export const R_GAS = 192.1;   // specific gas constant, J/(kg·K) (0.1921 kJ/kg·K [GRC])
export const GAMMA = 1.29;    // ratio of specific heats for Mars' CO₂ atmosphere
export const H_SCALE = 11100; // average scale height, m [FS] (shown in the equations panel)
export const P_SEASON = 0.83;
export let T_TOP = 150;       // K, upper-atmosphere temperature floor (model)
function glennT(h) {
  const ha = h + SITE_ELEV;
  const Tc = ha < 7000 ? -31 - 0.000998 * ha : -23.4 - 0.00222 * ha;
  return Math.max(Tc + 273.15, T_TOP);
}
export const P_SITE = 699 * Math.exp(-0.00009 * SITE_ELEV) * P_SEASON;   // Pa at the landing site (≈733 Pa)
export const RHO0 = P_SITE / (R_GAS * glennT(0));                         // ≈0.0156 kg/m³
// integrate ∫dh/H once into a table (250 m steps, −3 → 250 km)
const ATM_DH = 250, ATM_H0 = -3000, ATM_N = Math.ceil((250000 - ATM_H0) / ATM_DH) + 1;
const ATM_COL = new Float64Array(ATM_N);
function buildAtm() {
  let acc = 0; const i0 = Math.round(-ATM_H0 / ATM_DH);
  const Hs = (h) => R_GAS * glennT(h) / (MU / ((R_SITE + h) ** 2));
  for (let i = i0; i < ATM_N - 1; i++) { ATM_COL[i] = acc; const h = ATM_H0 + (i + 0.5) * ATM_DH; acc += ATM_DH / Hs(h); }
  ATM_COL[ATM_N - 1] = acc; acc = 0;
  for (let i = i0; i > 0; i--) { ATM_COL[i] = acc; const h = ATM_H0 + (i - 0.5) * ATM_DH; acc -= ATM_DH / Hs(h); }
  ATM_COL[0] = acc;
}
buildAtm();
export function setTopTemperature(T) { T_TOP = T; buildAtm(); }
export function scaleHeight(h) { return R_GAS * glennT(h) / (MU / ((R_SITE + h) ** 2)); }
export function atmosphere(h, scale = 1) {
  const T = glennT(Math.max(h, -3000));
  const f = clamp((h - ATM_H0) / ATM_DH, 0, ATM_N - 1.001), i = Math.floor(f), u = f - i;
  const col = ATM_COL[i] + (ATM_COL[i + 1] - ATM_COL[i]) * u;
  const rho = RHO0 * Math.exp(-col) * scale;
  return { T, p: rho * R_GAS * T, rho, a: Math.sqrt(GAMMA * R_GAS * T) };
}

/* ---------------- helpers ---------------- */
function interp(tab, x) {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) {
    if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  }
  return tab[tab.length - 1][1];
}
const smooth01 = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
export function mulberry32(a) {
  return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

/* Sutton–Graves stagnation-point convective heating for a CO₂ atmosphere:
 * q̇ = k·√(ρ/Rn)·v³, k = 1.9027×10⁻⁴ kg^0.5/m [SG]. Radiative-equilibrium wall
 * temperature: εσT⁴ = q̇ with emissivity ε = 0.9. */
export const K_SG = 1.9027e-4;
export function heatFlux(rho, v) { return K_SG * Math.sqrt(rho / VEH.noseR) * v * v * v; }
export function wallTemp(q) { return Math.pow(Math.max(q, 0) / (0.9 * 5.670374e-8), 0.25); }

/* ======================================================================
 * JEZERO TERRAIN (site frame: x east = downrange, z south = crossrange, m)
 * Stylised from public maps: 45 km crater, western delta fan fed through
 * Neretva Vallis, Séítah ridges and dunes south-west of the landing site.
 * The landing target is (0, 0); Perseverance landed ≈2 km south-east of the
 * delta front. This is a teaching model, not a survey-grade map.
 * ==================================================================== */
export const JEZ = {
  center: [7300, 3800],     // crater centre relative to the landing site (18.38°N 77.58°E vs 18.44°N 77.45°E)
  radius: 22500,            // ≈45 km diameter
  rimH: 620,                // rim above the floor, m (model)
  apex: [-15200, -1900],    // delta apex where Neretva Vallis enters (model)
  deltaR: 13000,            // fan radius, m
  deltaH: 95,               // delta top above the crater floor, m (model)
  seitah: [-1600, 1900]     // Séítah centre (model)
};
function h32(ix, iz, s) { let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(s, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, z, s = 0) {
  const ix = Math.floor(x), iz = Math.floor(z); let fx = x - ix, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
  const a = h32(ix, iz, s), b = h32(ix + 1, iz, s), c = h32(ix, iz + 1, s), d = h32(ix + 1, iz + 1, s);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export function fbm(x, z, oct = 5, s = 0) { let a = 0.5, t = 0; for (let i = 0; i < oct; i++) { t += a * vnoise(x, z, s + i * 17); x = x * 2.03 + 7.1; z = z * 2.03 - 3.3; a *= 0.5; } return t; }

// small craters, deterministic
const CRATERS = (() => {
  const rng = mulberry32(2021), out = [];
  for (let i = 0; i < 260; i++) {
    const r = 15 + Math.pow(rng(), 3.4) * 520;
    const x = -9000 + rng() * 20000, z = -9000 + rng() * 18000;
    if (Math.hypot(x, z) < 380 + r) continue;       // keep the actual touchdown neighbourhood clear
    out.push([x, z, r]);
  }
  out.push([-6100, -2600, 450]);                     // a Belva-like crater on the delta top
  return out;
})();
export function craterList() { return CRATERS; }

export function deltaField(x, z) {
  // returns {top: 0..1 inside fan, edge: scarp proximity}
  const dx = x - JEZ.apex[0], dz = z - JEZ.apex[1];
  const rho = Math.hypot(dx, dz), ang = Math.atan2(dz, dx); // 0 = east
  if (Math.abs(ang) > 1.25) return { top: 0, rho, ang, rf: 0 };
  const lobes = 0.8 + 0.12 * Math.cos(ang * 5.3 + 0.7) + 0.08 * Math.cos(ang * 11.0) + 0.18 * (fbm(ang * 3.2, 1.7, 3, 40) - 0.5);
  const rf = JEZ.deltaR * lobes * (1 - 0.35 * Math.pow(Math.abs(ang) / 1.25, 2));
  const top = smooth01((rf - rho) / 140);            // ~140 m wide scarp (cliffs)
  return { top, rho, ang, rf };
}
export function seitahMask(x, z) {
  const dx = (x - JEZ.seitah[0]) / 1700, dz = (z - JEZ.seitah[1]) / 1100;
  const d = Math.hypot(dx * 0.9 + dz * 0.3, dz) + 0.25 * (fbm(x / 600, z / 600, 3, 90) - 0.5);
  return smooth01((1 - d) / 0.18);
}
export function rockDensity(x, z) {
  const d = deltaField(x, z);
  const nearFront = d.rf > 0 ? Math.exp(-Math.pow((d.rho - d.rf - 250) / 450, 2)) : 0; // debris apron below the scarp
  // patchy boulder fields (hundreds of metres across) plus a rubble apron below the delta scarp
  return clamp((fbm(x / 1100, z / 1100, 4, 55) - 0.5) * 2.1 + 0.46 + (fbm(x / 240, z / 240, 3, 56) - 0.5) * 0.35 + nearFront * 0.55, 0, 1);
}

export function terrainHeight(x, z) {
  const cx = x - JEZ.center[0], cz = z - JEZ.center[1];
  const ang = Math.atan2(cz, cx);
  const rn = Math.hypot(cx, cz) / (JEZ.radius * (1 + 0.07 * (fbm(ang * 1.6 + 4, 0.5, 3, 5) - 0.5) * 2));
  // crater bowl: flat floor, steep inner wall, raised rim, ejecta apron
  const rimVar = 1 + 0.28 * (fbm(ang * 4.0, 3.1, 4, 7) - 0.5) * 2;
  let h;
  if (rn < 0.8) h = 0;
  else if (rn < 1.0) h = JEZ.rimH * rimVar * Math.pow(smooth01((rn - 0.8) / 0.2), 1.6);
  else h = JEZ.rimH * rimVar * (0.45 + 0.55 * Math.exp(-(rn - 1) / 0.12));
  // Neretva Vallis breaches the western rim and feeds the delta
  const nv = Math.exp(-Math.pow((z - JEZ.apex[1] + 0.12 * (x - JEZ.apex[0]) + 600 * Math.sin(x / 3100)) / 900, 2)) * smooth01((JEZ.apex[0] + 1500 - x) / 3000);
  h -= nv * Math.max(0, h - 40) * 0.92;
  // Pliva Vallis outlet on the east rim
  const pv = Math.exp(-Math.pow((z - JEZ.center[1] - 2000) / 1100, 2)) * smooth01((x - JEZ.center[0] - 17000) / 3000);
  h -= pv * Math.max(0, h) * 0.7;
  // broad undulation of the floor + fine roughness
  h += (fbm(x / 5200, z / 5200, 4, 3) - 0.5) * 60 * smooth01((0.95 - rn) / 0.2);
  h += (fbm(x / 380, z / 380, 4, 11) - 0.5) * 7;
  // delta fan
  const d = deltaField(x, z);
  if (d.top > 0) {
    const rise = JEZ.deltaH * (0.85 + 0.6 * (1 - d.rho / Math.max(d.rf, 1)));
    // inverted channels on the fan top (ridges)
    const ridge = Math.pow(Math.abs(Math.sin(d.ang * 38 + 2.5 * fbm(x / 1500, z / 1500, 3, 21))), 6) * 9;
    h += d.top * (rise + ridge + (fbm(x / 700, z / 700, 3, 31) - 0.5) * 18);
  }
  // Séítah: sand ripples and bedrock ridges
  const sm = seitahMask(x, z);
  if (sm > 0) {
    const u = x * 0.8 + z * 0.6;
    h += sm * (Math.pow(Math.abs(Math.sin(u / 22 + 3 * fbm(x / 300, z / 300, 2, 70))), 3) * 5 + (fbm(x / 250, z / 250, 3, 71) - 0.4) * 22);
  }
  // small impact craters
  for (let i = 0; i < CRATERS.length; i++) {
    const c = CRATERS[i], dx = x - c[0], dz = z - c[1];
    if (Math.abs(dx) > c[2] * 1.8 || Math.abs(dz) > c[2] * 1.8) continue;
    const q = Math.hypot(dx, dz) / c[2];
    if (q < 1) h += c[2] * (0.2 * (q * q - 1) + 0.045);
    else if (q < 1.8) h += c[2] * 0.045 * Math.pow(1 - (q - 1) / 0.8, 2);
  }
  return h;
}

/* Hazard test used by Terrain-Relative Navigation's safe-target map and by
 * the outcome check. Model thresholds: slope over 15° across ~24 m, dense
 * rocks, or dune/ridge terrain. Returns a label or null (safe). */
export function hazardAt(x, z) {
  const e = 12;
  const sx = (terrainHeight(x + e, z) - terrainHeight(x - e, z)) / (2 * e);
  const sz = (terrainHeight(x, z + e) - terrainHeight(x, z - e)) / (2 * e);
  const slope = Math.atan(Math.hypot(sx, sz)) / DEG;
  const d = deltaField(x, z);
  if (slope > 15) return d.top > 0.02 && d.top < 0.98 ? 'cliff' : (Math.hypot(x - JEZ.center[0], z - JEZ.center[1]) > JEZ.radius * 0.78 ? 'crater wall' : 'steep slope');
  if (seitahMask(x, z) > 0.45) return 'dunes';
  if (rockDensity(x, z) > 0.58) return 'boulders';
  return null;
}

/* Safe-target map: grid of hazard flags around the target, evaluated lazily
 * (cells are computed the first time they are asked for). */
let HAZ = null;
export function hazardGrid(half = 7000, cell = 50) {
  if (HAZ && HAZ.half === half && HAZ.cell === cell) return HAZ;
  const n = Math.round(2 * half / cell);
  const state = new Int8Array(n * n).fill(-1), kind = new Array(n * n);
  const get = (i, j) => {
    const k = j * n + i;
    if (state[k] < 0) { const h = hazardAt(-half + (i + 0.5) * cell, -half + (j + 0.5) * cell); kind[k] = h; state[k] = h ? 1 : 0; }
    return state[k];
  };
  HAZ = { half, cell, n, get, kind, state };
  return HAZ;
}
/* Nearest safe cell to (x, z) whose neighbours are also safe, within maxR. */
export function safeTarget(x, z, maxR = DS.divertMax) {
  const G = hazardGrid(), { n, cell, half } = G;
  const ci = Math.floor((x + half) / cell), cj = Math.floor((z + half) / cell);
  const R = Math.ceil(maxR / cell);
  let best = null, bd = Infinity;
  for (let j = cj - R; j <= cj + R; j++) for (let i = ci - R; i <= ci + R; i++) {
    if (i < 1 || j < 1 || i >= n - 1 || j >= n - 1) continue;
    const px = -half + (i + 0.5) * cell, pz = -half + (j + 0.5) * cell, d = Math.hypot(px - x, pz - z);
    if (d >= bd || d > maxR) continue;
    let ok = true;
    for (let b = -1; b <= 1 && ok; b++) for (let a = -1; a <= 1; a++) if (G.get(i + a, j + b)) { ok = false; break; }
    if (ok) { bd = d; best = [px, pz]; }
  }
  return best;
}

/* ======================================================================
 * THE SIMULATOR
 * ==================================================================== */
export const DEFAULTS = {
  bank: 'guided',          // 'guided' | 'aggressive' | 'liftUp' | 'liftDown' | 'ballistic'
  trigger: 'range',        // 'range' (Range Trigger) | 'mach' (velocity/Mach trigger, MSL style)
  triggerMach: 1.8,
  trn: true,               // Terrain-Relative Navigation
  bridle: DS.bridle,
  craneAlt: DS.craneAlt,
  // dispersions (Monte Carlo)
  atmScale: 1, dGamma: 0, ldScale: 1, cdScale: 1, chuteScale: 1, wind: [0, 0], cross0: VEH.crossEI,
  stopAt: 'end'            // 'end' | 'bsSep' (Monte Carlo stops at backshell separation)
};

export class EDLSim {
  constructor(opts = {}) {
    this.o = Object.assign({}, DEFAULTS, opts);
    const o = this.o;
    this.t = 0;
    const phi0 = -GUID.eiUprange / R_SITE;       // polar angle from the target
    const g0 = (VEH.gammaEI + o.dGamma) * DEG;
    const r = VEH.rEI;
    const ux = Math.sin(phi0), uy = Math.cos(phi0), ex = uy, ey = -ux;   // up, downrange
    this.x = r * ux; this.y = r * uy;
    this.vx = VEH.vEI * (Math.cos(g0) * ex + Math.sin(g0) * ux);
    this.vy = VEH.vEI * (Math.cos(g0) * ey + Math.sin(g0) * uy);
    this.z = o.cross0; this.vz = 0;               // crossrange (flat), + south
    this.m = VEH.mEntry;
    this.LD = o.bank === 'ballistic' ? 0 : VEH.LD * o.ldScale;
    this.bank = 0; this.bankCmd = 0; this.bankSign = o.cross0 > 0 ? 1 : -1; // start banking toward the crossrange error
    this.phase = 'entry';     // entry → chute → powered → cv → crane → landed → done ; 'crash'
    this.flags = {}; this.events = [];
    this.max = { g: 0, gT: 0, q: 0, qT: 0, heat: 0, heatT: 0, Tw: 0 };
    this.Tw = 250;            // heat-shield surface temperature (K), lagged
    this.chuteT = null; this.chuteLoad = 0; this.chuteFailed = false;
    this.nRev = 0; this.guideTimer = 0; this.predMag = 60 * DEG;
    this.outcome = null; this.notes = [];
    this.bodies = [];         // separated hardware: {id, t0, pts: []}
    this.samples = [];
    this.nextSample = 0;
    this.derived();
    this.fire('ei');
  }

  /* ---- geometry ---- */
  derived() {
    const r = Math.hypot(this.x, this.y), h = r - R_SITE;
    const ux = this.x / r, uy = this.y / r, ex = uy, ey = -ux;
    const vr = this.vx * ux + this.vy * uy, vh = this.vx * ex + this.vy * ey;
    const w = this.o.wind;
    const vah = vh - w[0], vaz = this.vz - w[1];
    const vair = Math.sqrt(vr * vr + vah * vah + vaz * vaz);
    const atm = atmosphere(h, this.o.atmScale);
    const phi = Math.atan2(this.x, this.y);
    this.d = { r, h, ux, uy, ex, ey, vr, vh, vair, atm, M: vair / atm.a, q: 0.5 * atm.rho * vair * vair,
      v: Math.sqrt(vr * vr + vh * vh + this.vz * this.vz), gamma: Math.atan2(vr, vh), down: R_SITE * phi };
    return this.d;
  }

  fire(id, extra) {
    if (this.flags[id] != null) return false;
    this.flags[id] = this.t;
    const d = this.d || {};
    let h = d.h, v = d.v, M = d.M;
    if (this.P) { h = this.P[1]; v = Math.hypot(this.V[0], this.V[1], this.V[2]); M = v / atmosphere(h).a; }
    this.events.push(Object.assign({ id, t: this.t, h, v, M }, extra || {}));
    return true;
  }

  /* ---- aerodynamics: acceleration (planar x, y, and crossrange z) ---- */
  aero(s, t) {
    const [x, y, vx, vy, z, vz] = s;
    const r = Math.hypot(x, y), h = r - R_SITE;
    const ux = x / r, uy = y / r, ex = uy, ey = -ux;
    const w = this.o.wind;
    // air-relative velocity in local (up, downrange, cross) components
    const vr = vx * ux + vy * uy, vh = vx * ex + vy * ey - w[0], vc = vz - w[1];
    const v = Math.sqrt(vr * vr + vh * vh + vc * vc) || 1e-6;
    const atm = atmosphere(h, this.o.atmScale);
    const q = 0.5 * atm.rho * v * v, M = v / atm.a;
    let cdA = cdCapsule(M) * VEH.area * this.o.cdScale;
    let chuteF = 0;
    if (this.chuteT != null && !this.chuteFailed) {
      const cd = M > 1 ? CHUTE.cdSup : M < 0.8 ? CHUTE.cdSub : CHUTE.cdSub + (CHUTE.cdSup - CHUTE.cdSub) * (M - 0.8) / 0.2;
      chuteF = cd * CHUTE.area * this.o.chuteScale * this.chuteShape(t - this.chuteT);
      cdA += chuteF;
      if (this.flags.hsSep != null) cdA -= 0.35 * VEH.area; // heat shield gone: a little less capsule drag
    }
    const D = q * cdA;
    // unit vectors: along air velocity (a), "lift up" in the vertical plane (n), crossrange (c)
    const ar = vr / v, ah = vh / v, ac = vc / v;
    let Lr = 0, Lh = 0, Lc = 0;
    const L = (this.chuteT == null ? this.LD : 0) * D;
    if (L > 0) {
      // lift-up direction: perpendicular to v, in the plane containing v and local up
      let nr = 1 - ar * ar, nh = -ar * ah, nc = -ar * ac; const nn = Math.hypot(nr, nh, nc) || 1; nr /= nn; nh /= nn; nc /= nn;
      // side direction: v × n (approximately crossrange)
      let sr = ah * nc - ac * nh, sh = ac * nr - ar * nc, sc = ar * nh - ah * nr;
      const cb = Math.cos(this.bank), sb = Math.sin(this.bank);
      // sign so a positive bank pushes toward +z
      if (sc < 0) { sr = -sr; sh = -sh; sc = -sc; }
      Lr = L * (cb * nr + sb * sr); Lh = L * (cb * nh + sb * sh); Lc = L * (cb * nc + sb * sc);
    }
    const aR = (-D * ar + Lr) / this.m, aH = (-D * ah + Lh) / this.m, aC = (-D * ac + Lc) / this.m;
    return { ax: aR * ux + aH * ex, ay: aR * uy + aH * ey, az: aC, D, q, M, h, v, atm, chuteF: q * chuteF, sensed: Math.hypot(aR, aH, aC) };
  }

  chuteShape(tau) {
    // mortar fire → line stretch → inflation with an opening-load overshoot → steady
    if (tau < CHUTE.tLineStretch) return 0;
    const u = tau - CHUTE.tLineStretch;
    if (u < CHUTE.tInflate) return CHUTE.overshoot * smooth01(u / CHUTE.tInflate) ** 1.5;
    const k = u - CHUTE.tInflate;
    return 1 + (CHUTE.overshoot - 1) * Math.exp(-k / 0.35) * Math.cos(k * 5.5);
  }

  deriv(s, t) {
    const [x, y, vx, vy, z, vz] = s;
    const r = Math.hypot(x, y), g = MU / (r * r);
    const A = this.aero(s, t);
    return [vx, vy, A.ax - g * x / r, A.ay - g * y / r, vz, A.az];
  }

  rk4(dt) {
    const s0 = [this.x, this.y, this.vx, this.vy, this.z, this.vz], t = this.t;
    const k1 = this.deriv(s0, t);
    const s1 = s0.map((v, i) => v + k1[i] * dt / 2); const k2 = this.deriv(s1, t + dt / 2);
    const s2 = s0.map((v, i) => v + k2[i] * dt / 2); const k3 = this.deriv(s2, t + dt / 2);
    const s3 = s0.map((v, i) => v + k3[i] * dt); const k4 = this.deriv(s3, t + dt);
    const n = s0.map((v, i) => v + (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]) * dt / 6);
    [this.x, this.y, this.vx, this.vy, this.z, this.vz] = n;
  }

  /* ---- entry guidance ---- */
  // Reference bank magnitude vs speed: 75° at 6,000 m/s → 45° at 2,500 m/s [EG];
  // the guidance solves for one offset added to the whole profile.
  static refBank(v) { return (45 + 30 * clamp((v - 2500) / 3500, 0, 1)) * DEG; }
  // Planar predictor (no crossrange): integrates the reference bank profile shifted
  // by `off` (rad) until the parachute-deploy speed, returns the final downrange (m).
  predict(off) {
    let r = this.d.r, th = Math.atan2(this.x, this.y), v = this.d.v, gm = this.d.gamma;
    const m = this.m, LD = this.LD, dt = 2, vEnd = GUID.vPredEnd, sc = this.o.atmScale;
    const f = (r, v, gm) => {
      const atm = atmosphere(r - R_SITE, sc), D = 0.5 * atm.rho * v * v * cdCapsule(v / atm.a) * VEH.area / m;
      const g = MU / (r * r);
      // below 1,100 m/s heading alignment limits |bank| to 30° (≈ lift up), and SUFR removes lift near deploy
      const c = v < GUID.vHeading ? 0.94 : Math.cos(clamp(EDLSim.refBank(v) + off, 0, Math.PI)), ld = v < GUID.vPredEnd + 120 ? 0 : LD;
      return [v * Math.sin(gm), v * Math.cos(gm) / r, -D - g * Math.sin(gm), (ld * D * c) / v + (v / r - g / v) * Math.cos(gm)];
    };
    for (let i = 0; i < 400 && v > vEnd && r > R_SITE + 3000; i++) {
      const a = f(r, v, gm), b = f(r + a[0] * dt, v + a[2] * dt, gm + a[3] * dt);
      r += (a[0] + b[0]) * dt / 2; th += (a[1] + b[1]) * dt / 2; v += (a[2] + b[2]) * dt / 2; gm += (a[3] + b[3]) * dt / 2;
    }
    return R_SITE * th;
  }

  guideEntry(dt) {
    const o = this.o, d = this.d;
    if (o.bank === 'liftUp' || o.bank === 'ballistic') { this.bankCmd = 0; }
    else if (o.bank === 'liftDown') { this.bankCmd = 180 * DEG * (this.bankSign || 1); }
    else {
      const closed = o.bank !== 'aggressive';   // 'aggressive': open-loop, reference profile + GUID.aggrOff (over-banking)
      const drag = d.q * cdCapsule(d.M) * VEH.area / this.m;
      if (!this.flags.guidance && drag >= GUID.dragStart) this.fire('guidance');
      if (d.v < GUID.vHeading && this.flags.guidance != null) {
        this.fire('heading');
        // heading alignment: null crossrange with a limited bank
        const aL = this.LD * drag;
        const want = -GUID.haKz * this.z - GUID.haKv * this.vz;
        const s = clamp(want / Math.max(aL, 1e-3), -Math.sin(GUID.bankHA * DEG), Math.sin(GUID.bankHA * DEG));
        this.bankCmd = Math.asin(s);
      } else {
        this.guideTimer -= dt;
        if (!closed) this.predOff = GUID.aggrOff * DEG;
        else if (this.flags.guidance != null && this.guideTimer <= 0) {
          this.guideTimer = 1.0;
          // bisection on the profile offset to hit the planned deploy point
          const target = -GUID.deployUprange;
          let a = -80 * DEG, b = 140 * DEG;               // a → more lift up (longer), b → more lift down
          const ra = this.predict(a), rb = this.predict(b);
          let off;
          if (target >= ra) off = a; else if (target <= rb) off = b;
          else {
            for (let i = 0; i < 9; i++) { const c = (a + b) / 2; if (this.predict(c) > target) a = c; else b = c; }
            off = (a + b) / 2;
          }
          this.predOff = off;
        }
        this.predMag = clamp(EDLSim.refBank(d.v) + (this.predOff || 0), 0, Math.PI);
        if (this.flags.guidance == null) this.predMag = 70 * DEG; // pre-bank before guidance starts
        // lateral logic: reverse the bank when crossrange leaves a corridor that narrows with speed
        const db = GUID.dbLow + (GUID.dbHigh - GUID.dbLow) * Math.pow(clamp(d.v / VEH.vEI, 0, 1), 2);
        const zErr = this.z + this.vz * GUID.revTau;
        if (this.flags.guidance != null && Math.abs(zErr) > db && Math.sign(zErr) === Math.sign(Math.sin(this.bank) || this.bankSign) && Math.abs(this.bank - this.bankCmd) < 5 * DEG) {
          this.bankSign = -Math.sign(zErr);
          this.nRev++;
          this.fire('bankRev' + this.nRev, { from: this.bank / DEG });
        }
        if (this.flags.guidance == null) this.bankSign = -Math.sign(this.z) || 1;
        this.bankCmd = this.bankSign * Math.max(this.predMag, 1 * DEG);
      }
    }
    // roll-rate-limited bank; reversals roll through lift-up (the short way round via 0)
    const rate = GUID.rollRate * DEG * dt;
    const err = this.bankCmd - this.bank;
    this.bank += clamp(err, -rate, rate);
  }

  /* ---- parachute trigger ---- */
  shouldDeploy() {
    const d = this.d, o = this.o;
    if (o.trigger === 'mach') return d.M <= o.triggerMach;
    // Range Trigger: open at the planned point, never faster than Mach 2.2,
    // and never wait below the low-Mach floor (a vehicle that is short opens anyway)
    if (d.M > CHUTE.machMax) return false;
    return d.down >= -GUID.deployUprange || d.M < CHUTE.machFloor;
  }
  timeToDeploy() {
    const d = this.d, o = this.o;
    const drag = d.q * cdCapsule(d.M) * VEH.area / this.m + 1e-6;
    if (o.trigger === 'mach') return (d.v - o.triggerMach * d.atm.a) / drag;
    const tr = (-GUID.deployUprange - d.down) / Math.max(d.vh, 1);
    const tm = (d.v - CHUTE.machMax * d.atm.a) / drag;
    return Math.max(tr, tm);
  }

  /* ---- step for entry and parachute phases ---- */
  stepAtmo(dt) {
    const o = this.o;
    if (this.phase === 'entry') {
      if (!this.flags.sufr) this.guideEntry(dt);
      else this.bank += clamp(0 - this.bank, -GUID.rollRate * DEG * dt, GUID.rollRate * DEG * dt);
      // SUFR: eject the six entry balance masses so the centre of mass returns to the axis (L/D → 0)
      if (!this.flags.sufr && this.d.v < 1400 && (this.timeToDeploy() <= GUID.sufrLead)) {
        this.fire('sufr'); this.m -= VEH.ebmN * VEH.ebmM; this.LD = 0;
        this.spawnBody('ebm', 0, -3);
      }
      if (this.shouldDeploy() && this.d.v < 1400) {
        if (!this.flags.sufr) { this.fire('sufr'); this.m -= VEH.ebmN * VEH.ebmM; this.LD = 0; this.spawnBody('ebm', 0, -3); }
        this.chuteT = this.t; this.phase = 'chute';
        this.fire('chute', { q: this.d.q });
        if (this.d.M > CHUTE.machFail) { this.chuteFailed = true; this.notes.push('mach'); }
      }
    }
    this.rk4(dt);
    this.t += dt;
    const d = this.derived();
    const A = this.aero([this.x, this.y, this.vx, this.vy, this.z, this.vz], this.t);
    if (this.phase === 'chute' && !this.chuteFailed) {
      this.chuteLoad = Math.max(this.chuteLoad, A.chuteF);
      if (A.chuteF > CHUTE.loadLimit) { this.chuteFailed = true; this.notes.push('load'); this.fire('chuteFail', { load: A.chuteF }); }
    }
    this.sensed = A.sensed;
    // heating (stagnation point), wall temperature with a thermal lag
    const qdot = this.flags.hsSep == null ? heatFlux(d.atm.rho, d.vair) : 0;
    const Teq = Math.max(wallTemp(qdot), d.atm.T);
    this.Tw += (Teq - this.Tw) * (1 - Math.exp(-dt / 4));
    this.qdot = qdot;
    if (qdot > this.max.heat) { this.max.heat = qdot; this.max.heatT = this.t; }
    if (this.Tw > this.max.Tw) this.max.Tw = this.Tw;
    if (this.t > 20 && qdot < this.max.heat * 0.97 && this.max.heat > 1e5) this.fire('peakHeat', { t: this.max.heatT, qdot: this.max.heat });
    const gl = A.sensed / G0;
    if (gl > this.max.g && this.phase === 'entry') { this.max.g = gl; this.max.gT = this.t; }
    if (gl > (this.max.gAll || 0)) this.max.gAll = gl;
    if (this.t > 20 && gl < this.max.g * 0.97 && this.max.g > 3 && this.phase === 'entry') this.fire('peakDecel', { t: this.max.gT, g: this.max.g });
    if (d.q > this.max.q) { this.max.q = d.q; this.max.qT = this.t; }
    if (this.phase === 'chute') {
      const hAgl = d.h - terrainHeight(d.down, this.z);
      if (!this.flags.hsSep && this.t >= this.chuteT + GUID.hsSepDelay && !this.chuteFailed) {
        this.fire('hsSep'); this.m -= VEH.mHeatShield; this.spawnBody('heatShield', 0, -2);
      }
      if (this.flags.hsSep != null && hAgl <= GUID.lvsTop) this.fire('lvs');
      if (this.flags.lvs != null && !this.flags.trnFix && this.t >= this.flags.lvs + GUID.lvsFix) this.trnFix();
      if (hAgl <= GUID.bsSepAlt && !this.chuteFailed) this.backshellSep();
      if (hAgl <= 0) this.crash('parachute');
    } else if (d.h - terrainHeight(d.down, this.z) <= 0) this.crash('entry');
  }

  /* LVS/TRN: position fix + safe target from the onboard hazard map */
  trnFix() {
    // predict where the powered-descent vehicle would land without a divert
    const zdp = this.predictZDP();
    this.zdp = zdp;
    let tgt = zdp;
    if (this.o.trn) {
      const st = safeTarget(zdp[0], zdp[1]);
      if (st) tgt = st;
      this.fire('trnFix', { zdp, target: tgt });
    } else {
      this.fire('trnFix', { zdp, target: tgt, off: true });
    }
    this.pdTarget = tgt;
  }
  predictZDP() {
    // fast look-ahead of the parachute descent to the backshell-separation altitude
    const save = [this.x, this.y, this.vx, this.vy, this.z, this.vz, this.t];
    let n = 0;
    while (n++ < 4000) {
      this.rk4(0.1); this.t += 0.1; const d = this.derived();
      if (d.h - terrainHeight(d.down, this.z) <= GUID.bsSepAlt) break;
    }
    const d = this.d;
    // the descent stage carries its horizontal speed a little further before it stops it
    const out = [d.down + d.vh * 6, this.z + this.vz * 6];
    [this.x, this.y, this.vx, this.vy, this.z, this.vz, this.t] = save; this.derived();
    return out;
  }

  backshellSep() {
    if (this.flags.bsSep != null) return;
    if (!this.flags.trnFix) this.trnFix();
    this.fire('bsSep');
    const d = this.d;
    this.spawnBody('backshell', 0, 0);
    // switch to local flat coordinates for powered flight
    this.P = [d.down, d.h, this.z];
    this.V = [d.vh, d.vr, this.vz];
    this.m = VEH.mRover + VEH.mDSDry + VEH.mProp; this.fuel = VEH.mProp;
    this.phase = 'powered'; this.throttle = 0; this.mleOn = false;
    this.tgo = null;
    if (this.o.stopAt === 'bsSep') this.phase = 'done';
  }

  /* ---- powered descent / sky crane ---- */
  stepPowered(dt) {
    const o = this.o, P = this.P, V = this.V;
    const tgt = this.pdTarget, gH = terrainHeight(tgt[0], tgt[1]);
    let a = [0, 0, 0];          // commanded non-gravitational acceleration
    const g = G_SITE;
    if (this.phase === 'powered') {
      if (!this.mleOn && this.t >= this.flags.bsSep + 1.0) { this.mleOn = true; this.fire('mle'); }
      if (this.mleOn) {
        const gate = gH + Math.max(o.craneAlt + 2.5, 22);  // end of the approach: just above the sky-crane altitude
        if (this.tgo == null) {
          const dh = P[1] - gate;
          this.tgo = clamp(2 * dh / (Math.abs(V[1]) + DS.vCV) * 1.05, 25, 70);
          this.fire('divert', { dist: Math.hypot(tgt[0] - P[0], tgt[1] - P[2]) });
        }
        const tg = Math.max(this.tgo, 1.0);
        const rf = [tgt[0], gate, tgt[1]], vf = [0, -DS.vCV, 0];
        for (let i = 0; i < 3; i++) a[i] = 6 * (rf[i] - P[i] - V[i] * tg) / (tg * tg) - 2 * (vf[i] - V[i]) / tg;
        a[1] += g;
        // keep the engines pointing mostly down: limit tilt to 35°
        const ahz = Math.hypot(a[0], a[2]), maxH = Math.max(a[1], 0.5) * Math.tan(35 * DEG);
        if (ahz > maxH) { a[0] *= maxH / ahz; a[2] *= maxH / ahz; }
        this.tgo -= dt;
        if (this.tgo <= 0.4) { this.phase = 'cv'; this.fire('cv'); }
      }
    } else if (this.phase === 'cv' || this.phase === 'crane' || this.phase === 'landed') {
      // constant-velocity descent, holding over the target
      const vref = this.phase === 'landed' && this.tdDetect ? 0 : -DS.vCV;
      a[1] = g + 2.5 * (vref - V[1]);
      a[0] = 0.8 * (tgt[0] - P[0]) - 1.6 * V[0];
      a[2] = 0.8 * (tgt[1] - P[2]) - 1.6 * V[2];
      if (this.phase === 'cv' && P[1] - gH <= o.craneAlt) { this.phase = 'crane'; this.fire('skyCrane'); this.L = 0.6; this.Ld = 0; this.sw = [0, 0, 0, 0]; }
    }
    // thrust
    let T = this.m * Math.hypot(a[0], a[1], a[2]);
    const Tmax = DS.nEng * DS.thrust;
    if (!this.mleOn || this.fuel <= 0) T = 0;
    else T = clamp(T, DS.minThrottle * Tmax, Tmax);
    const an = Math.hypot(a[0], a[1], a[2]) || 1;
    const acc = [a[0] / an * T / this.m, a[1] / an * T / this.m - g, a[2] / an * T / this.m];
    // rover hanging on the bridles adds its weight until touchdown (already in this.m)
    const mdot = T / (DS.isp * G0);
    this.fuel -= mdot * dt; this.m -= mdot * dt;
    if (this.fuel <= 0 && !this.flags.fuelOut) { this.fuel = 0; this.fire('fuelOut'); }
    this.throttle = T / Tmax; this.thrustDir = [a[0] / an, a[1] / an, a[2] / an];
    for (let i = 0; i < 3; i++) { V[i] += acc[i] * dt; P[i] += V[i] * dt; }
    this.sensed = T / this.m;
    this.t += dt;
    // sky crane: pay out the bridles, swing the rover as a damped pendulum
    if (this.phase === 'crane' || (this.phase === 'landed' && !this.flags.bridleCut)) {
      if (this.phase === 'crane') {
        if (this.L < o.bridle) { this.Ld = DS.spoolRate; this.L = Math.min(o.bridle, this.L + DS.spoolRate * dt); if (this.L >= o.bridle) this.fire('bridleFull'); }
        else this.Ld = 0;
        const L = this.L, s = this.sw;  // [ax angle, ax rate, az angle, az rate]
        for (let k = 0; k < 2; k++) {
          const ah = acc[k === 0 ? 0 : 2];
          const dd = -(g / L) * s[2 * k] - (2 * this.Ld / L) * s[2 * k + 1] - ah / L - 0.35 * s[2 * k + 1];
          s[2 * k + 1] += dd * dt; s[2 * k] += s[2 * k + 1] * dt;
        }
        // rover wheels vs ground
        const rx = P[0] + L * Math.sin(s[0]), rz = P[2] + L * Math.sin(s[2]);
        const ry = P[1] - L * Math.cos(s[0]) * Math.cos(s[2]) - DS.roverH;
        if (ry <= terrainHeight(rx, rz)) {
          this.phase = 'landed';
          this.td = { x: rx, z: rz, vz: -V[1] + this.Ld, vh: Math.hypot(V[0] + L * s[1], V[2] + L * s[3]), L, nozzle: P[1] - terrainHeight(rx, rz), fuel: this.fuel };
          this.fire('touchdown', this.td);
          this.m -= VEH.mRover;       // weight comes off the bridles
          this.tdT = this.t;
        }
      } else if (this.phase === 'landed') {
        if (!this.tdDetect && this.t >= this.tdT + DS.tDetect) {
          this.tdDetect = true;
          const clear = P[1] - (terrainHeight(this.td.x, this.td.z) + DS.roverH);
          this.td.clearance = clear;
          this.fire('bridleCut', { clearance: clear });
          this.fly = { t0: this.t };
        }
      }
    }
    if (this.fly) this.fire('flyaway');
    // crash checks for the descent stage itself
    const gh = terrainHeight(P[0], P[2]);
    if (!this.flags.touchdown && P[1] - gh <= 0.4 + (this.L || 0) * 0 + DS.roverH) this.crash('powered', { v: Math.hypot(V[0], V[1], V[2]) });
  }

  crash(where, extra) {
    if (this.phase === 'crash' || this.phase === 'done') return;
    this.fire('crash', Object.assign({ where }, extra || {}));
    this.phase = 'crash';
  }

  spawnBody(id, dvAlong, dvUp) {
    const d = this.d;
    this.bodies.push({ id, t0: this.t, x: this.x, y: this.y, vx: this.vx + d.ux * dvUp, vy: this.vy + d.uy * dvUp, z: this.z, vz: this.vz, pts: [] });
  }

  stepBodies(dt) {
    for (const b of this.bodies) {
      if (b.done) continue;
      const r = Math.hypot(b.x, b.y), h = r - R_SITE;
      const atm = atmosphere(h, this.o.atmScale);
      const v = Math.hypot(b.vx, b.vy, b.vz) || 1e-6;
      // ballistic coefficients (m / CdA): heat shield ≈ 440/(1.1·15.9); backshell with its parachute;
      // entry balance masses are dense tungsten blocks
      const beta = b.id === 'heatShield' ? 25 : b.id === 'backshell' ? (675 / (0.52 * CHUTE.area + 15)) : b.id === 'ebm' ? 900 : 500;
      const Dm = 0.5 * atm.rho * v * v / beta;
      const g = MU / (r * r);
      b.vx += (-Dm * b.vx / v - g * b.x / r) * dt; b.vy += (-Dm * b.vy / v - g * b.y / r) * dt; b.vz += (-Dm * b.vz / v) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      const down = R_SITE * Math.atan2(b.x, b.y);
      if (h <= terrainHeight(down, b.z)) { b.done = true; b.tImpact = this.t; }
    }
  }

  sample() {
    const d = this.d, powered = !!this.P;
    const s = {
      t: this.t, phase: this.phase,
      down: powered ? this.P[0] : d.down, h: powered ? this.P[1] : d.h, z: powered ? this.P[2] : this.z,
      v: powered ? Math.hypot(...this.V) : d.v, vh: powered ? Math.hypot(this.V[0], this.V[2]) : d.vh, vr: powered ? this.V[1] : d.vr,
      gamma: powered ? Math.atan2(this.V[1], Math.hypot(this.V[0], this.V[2])) : d.gamma,
      M: d.M, q: d.q, g: (this.sensed || 0) / G0, Tw: this.Tw, qdot: this.qdot || 0,
      bank: this.bank / DEG, LD: this.LD, m: this.m,
      chute: this.chuteT == null ? 0 : (this.chuteFailed ? -1 : this.chuteShape(this.t - this.chuteT)),
      thr: this.throttle || 0, fuel: this.fuel == null ? VEH.mProp : this.fuel,
      tdir: this.thrustDir ? this.thrustDir.slice() : null,
      L: this.L || 0, sw: this.sw ? [this.sw[0], this.sw[2]] : [0, 0],
      bodies: this.bodies.map(b => [b.id, R_SITE * Math.atan2(b.x, b.y), Math.hypot(b.x, b.y) - R_SITE, b.z, b.done ? 1 : 0]),
      ds: this.flyP ? this.flyP.slice() : null
    };
    if (powered) {
      // air data for the powered phase
      const atm = atmosphere(this.P[1], this.o.atmScale); s.M = s.v / atm.a; s.q = 0.5 * atm.rho * s.v * s.v;
    }
    this.samples.push(s);
  }

  /* run the whole EDL; returns this */
  run(sampleDt = 0.1) {
    const o = this.o;
    this.sample(); this.nextSample = sampleDt;
    let guard = 0;
    while (guard++ < 400000) {
      if (this.phase === 'entry' || this.phase === 'chute') {
        const dt = this.phase === 'chute' && this.t - this.chuteT < 4 ? 0.01 : 0.05;
        this.stepAtmo(dt);
        this.stepBodies(dt);
      } else if (this.phase === 'powered' || this.phase === 'cv' || this.phase === 'crane' || this.phase === 'landed') {
        const dt = 0.02;
        if (this.fly) { this.flyawayPhysics(dt); this.t += dt; }
        else this.stepPowered(dt);
        this.stepBodies(dt);
        if (this.flyDone || this.t > (this.fly ? this.fly.t0 + 60 : 1e9)) { this.phase = 'done'; }
      } else break;
      if (this.t >= this.nextSample - 1e-9) { this.sample(); this.nextSample += sampleDt; }
      if (this.t > 900) break;
    }
    this.sample();
    this.evaluate();
    return this;
  }

  flyawayPhysics(dt) {
    // descent stage alone (rover cut free): simple scripted burn then ballistic fall
    if (!this.flyP) { this.flyP = this.P.slice(); this.flyV = this.V.slice(); this.flyM = this.m; }
    const k = this.t - this.fly.t0, g = G_SITE;
    const P = this.flyP, V = this.flyV;
    let ax = 0, ay = -g, a = 0;
    if (this.fuel > 0) {
      if (k < 2.2) { a = 12; ay += 12; }                        // climb straight up first, clear of the rover
      else if (k < 4.95) { a = 14.85; ax += 10.5; ay += 10.5; } // tilt ≈45° and burn away [flyaway ≈17–22 s, 694 m, FM]
      const dm = this.flyM * a / (DS.isp * G0) * dt; this.fuel = Math.max(0, this.fuel - dm); this.flyM -= dm;
      this.throttle = this.flyM * a / (DS.nEng * DS.thrust);
      this.thrustDir = a > 0 ? (k < 2.2 ? [0, 1, 0] : [Math.SQRT1_2, Math.SQRT1_2, 0]) : null;
    } else this.throttle = 0;
    if (k >= 4.95) this.throttle = 0;
    V[0] += ax * dt; V[1] += ay * dt; P[0] += V[0] * dt; P[1] += V[1] * dt; P[2] += V[2] * dt;
    if (k > 3 && P[1] <= terrainHeight(P[0], P[2])) {
      this.flyDone = true;
      this.fire('dsImpact', { dist: Math.hypot(P[0] - this.td.x, P[2] - this.td.z) });
    }
  }

  /* ---- outcome ---- */
  evaluate() {
    const o = this.o, ev = this.flags, res = { ok: true, issues: [], warnings: [] };
    const E = (id) => this.events.find(e => e.id === id);
    if (this.chuteFailed) { res.ok = false; res.issues.push(this.notes.includes('mach') ? 'chuteMach' : 'chuteLoad'); }
    if (ev.crash != null) { res.ok = false; res.issues.push('crash'); }
    if (ev.fuelOut != null && (ev.touchdown == null || ev.fuelOut < ev.touchdown)) { res.ok = false; res.issues.push('fuel'); }
    const imp = this.events.find(e => e.id === 'dsImpact');
    if (imp) { res.flyaway = imp.dist; if (imp.dist < 200) res.warnings.push('flyawayShort'); }
    if (this.td && this.td.fuel < 25) res.warnings.push('fuelLow');
    const td = this.td;
    if (td) {
      res.td = td;
      res.hazard = hazardAt(td.x, td.z);
      if (res.hazard) { res.ok = false; res.issues.push('hazard'); }
      if (td.vz > 1.5) { res.ok = false; res.issues.push('hardLanding'); }     // model limit for the suspension
      else if (td.vz > 1.1) res.warnings.push('firmLanding');
      if (td.clearance != null && td.clearance < 1.0) { res.ok = false; res.issues.push('collision'); }
      // engine plumes: closer than ≈4.5 m they scour the ground and blast debris into the rover (model threshold)
      if (td.nozzle < 4.5) { res.ok = false; res.issues.push('plumeDamage'); }
      else if (td.nozzle < 6) res.warnings.push('plume');
      if (td.vh > 0.5) res.warnings.push('swing');
      res.miss = Math.hypot(td.x, td.z);
    }
    const ch = E('chute');
    if (ch) { res.chuteMach = ch.M; res.chuteAlt = ch.h; res.chuteV = ch.v; res.chuteLoad = this.chuteLoad; }
    if (ch && ch.M < 1.35) res.warnings.push('lowDeploy');
    res.peakG = this.max.g; res.peakGT = this.max.gT; res.peakTw = this.max.Tw; res.peakHeat = this.max.heat;
    res.nRev = this.nRev;
    this.result = res;
    return res;
  }
}

/* Pre-entry approach (t < 0): gravity-only coast integrated backwards from the
 * entry-interface state, for the cruise-stage-separation part of the story. */
export function approachTrack(opts = {}, tBack = 610, dt = 1) {
  const s = new EDLSim(opts);
  let x = s.x, y = s.y, vx = s.vx, vy = s.vy;
  const out = [];
  const acc = (x, y) => { const r = Math.hypot(x, y), g = MU / (r * r * r); return [-g * x, -g * y]; };
  for (let t = 0; t >= -tBack; t -= dt) {
    const r = Math.hypot(x, y), ux = x / r, uy = y / r, ex = uy, ey = -ux;
    const vr = vx * ux + vy * uy, vh = vx * ex + vy * ey;
    out.push({ t, phase: 'coast', down: R_SITE * Math.atan2(x, y), h: r - R_SITE, z: s.z, v: Math.hypot(vx, vy), vh, vr, gamma: Math.atan2(vr, vh),
      M: 0, q: 0, g: 0, Tw: 200, qdot: 0, bank: 0, LD: s.LD, m: VEH.mEntry + (t < -588 ? VEH.cbmN * VEH.cbmM : 0), chute: 0, thr: 0, fuel: VEH.mProp, tdir: null, L: 0, sw: [0, 0], bodies: [], ds: null });
    // RK4 step backwards in time
    const h = -dt;
    const k1 = acc(x, y), k1v = [vx, vy];
    const k2 = acc(x + k1v[0] * h / 2, y + k1v[1] * h / 2), k2v = [vx + k1[0] * h / 2, vy + k1[1] * h / 2];
    const k3 = acc(x + k2v[0] * h / 2, y + k2v[1] * h / 2), k3v = [vx + k2[0] * h / 2, vy + k2[1] * h / 2];
    const k4 = acc(x + k3v[0] * h, y + k3v[1] * h), k4v = [vx + k3[0] * h, vy + k3[1] * h];
    x += (k1v[0] + 2 * k2v[0] + 2 * k3v[0] + k4v[0]) * h / 6; y += (k1v[1] + 2 * k2v[1] + 2 * k3v[1] + k4v[1]) * h / 6;
    vx += (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) * h / 6; vy += (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) * h / 6;
  }
  return out.reverse();
}

/* Convenience: run a full EDL with options */
export function runEDL(opts) { return new EDLSim(opts).run(); }

/* Monte Carlo generator (yields one landing per iteration so a page can
 * spread the work over frames). Dispersions are illustrative (model) values. */
export function* monteCarlo(opts, n = 40, seed = 7) {
  const rng = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const disp = {
      atmScale: Math.exp(gauss(rng) * 0.15),        // ±15 % density (1σ); the flown upper atmosphere was up to 150 % of nominal [MEADS]
      dGamma: gauss(rng) * 0.12,                    // entry flight-path angle ±0.12° (1σ)
      ldScale: 1 + gauss(rng) * 0.06,
      cdScale: 1 + gauss(rng) * 0.02,
      chuteScale: 1 + gauss(rng) * 0.04,
      wind: [gauss(rng) * 7, gauss(rng) * 7],       // near-surface wind ±7 m/s (1σ)
      cross0: VEH.crossEI + gauss(rng) * 2500
    };
    const s = new EDLSim(Object.assign({}, opts, disp, { stopAt: 'bsSep' }));
    s.run(1.0);
    const tr = s.events.find(e => e.id === 'trnFix');
    const zdp = tr ? tr.zdp : [s.d.down, s.z];
    const tgt = tr ? tr.target : zdp;
    const ch = s.events.find(e => e.id === 'chute');
    yield { i, zdp, land: tgt, hazard: hazardAt(tgt[0], tgt[1]), chuteFailed: s.chuteFailed, crashed: s.flags.crash != null, chuteM: ch ? ch.M : NaN, chuteH: ch ? ch.h : NaN, peakG: s.max.g };
  }
}
/* 2-σ-style ellipse (99 % for 2 degrees of freedom: k = 3.035) from points */
export function ellipseOf(pts, k = 3.035) {
  const n = pts.length; if (n < 3) return null;
  let mx = 0, mz = 0; for (const p of pts) { mx += p[0]; mz += p[1]; } mx /= n; mz /= n;
  let sxx = 0, szz = 0, sxz = 0;
  for (const p of pts) { const a = p[0] - mx, b = p[1] - mz; sxx += a * a; szz += b * b; sxz += a * b; }
  sxx /= n - 1; szz /= n - 1; sxz /= n - 1;
  const tr = sxx + szz, det = sxx * szz - sxz * sxz, disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc, l2 = tr / 2 - disc;
  const ang = Math.atan2(l1 - sxx, sxz || 1e-9);
  return { cx: mx, cz: mz, a: k * Math.sqrt(Math.max(l1, 0)), b: k * Math.sqrt(Math.max(l2, 0)), ang };
}
