/* Cosmic Library planetarium: positional astronomy, as pure functions.
 *
 * No DOM, no Three.js: this module runs in the browser (sky.js) and in Node
 * (scripts/test_sky.mjs). Every formula names its source.
 *
 * Frames used throughout
 *   "J2000 equatorial"  x -> March equinox of J2000, z -> celestial pole of J2000
 *   "equatorial of date" the same after precession to the observing date
 *   "horizontal"        [east, north, up] unit vectors for the observer
 *   Angles in degrees unless a name ends in "Rad".
 *
 * Main references
 *   [M]   J. Meeus, "Astronomical Algorithms", 2nd ed. (Willmann-Bell, 1998)
 *   [AA]  The Astronomical Almanac (US Naval Observatory / HM Nautical Almanac Office)
 *   [IERS] IERS Conventions (2010), Technical Note 36, chapter 5 (Earth Rotation Angle, GMST)
 *   [Lieske] J. H. Lieske et al. 1977, A&A 58, 1 (IAU 1976 precession)
 */
import {
  heliocentric, earthPosition, moonGeocentric, julianDay, jdToMs,
  OBLIQUITY_J2000, AU_KM, C_KM_S, J2000
} from "./ephemeris.js";

export { julianDay, jdToMs, J2000 };
export const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const TT_MINUS_UTC = 69.184;               // s, TAI-UTC = 37 s since 2017 + 32.184 s
export const SIDEREAL_DAY_S = 86164.0905;         // mean sidereal day in SI seconds
export const EARTH_RADIUS_KM = 6378.137;          // WGS84 equatorial radius

const norm360 = x => ((x % 360) + 360) % 360;
export const wrap360 = norm360;
export const wrap180 = x => norm360(x + 180) - 180;

/* ------------------------------------------------------------ vectors --- */
export function raDecToVec(ra, dec) {
  const a = ra * D2R, d = dec * D2R, c = Math.cos(d);
  return [c * Math.cos(a), c * Math.sin(a), Math.sin(d)];
}
export function vecToRaDec(v) {
  const r = Math.hypot(v[0], v[1], v[2]);
  return { ra: norm360(Math.atan2(v[1], v[0]) * R2D), dec: Math.asin(Math.max(-1, Math.min(1, v[2] / r))) * R2D };
}
export function mulMV(m, v) {                      // m: row-major 9 numbers
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
          m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
          m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
export function mulMM(a, b) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
}
export function transpose(m) { return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]; }
const rotZ = t => { const c = Math.cos(t), s = Math.sin(t); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
const rotY = t => { const c = Math.cos(t), s = Math.sin(t); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
export function angularSep(a, b) {                 // unit vectors -> degrees (robust atan2 form)
  const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.hypot(cx, cy, cz), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * R2D;
}

/* --------------------------------------------------------------- time --- */
/** Julian centuries of Terrestrial Time (TT) since J2000.0, from a UTC Julian Day. */
export function centuriesTT(jdUTC) { return (jdUTC + TT_MINUS_UTC / 86400 - J2000) / 36525; }

/** Greenwich Mean Sidereal Time, IAU 1982 (Aoki et al. 1982; [M] eq. 12.4), degrees.
 *  UT1 is taken equal to UTC (|UT1 - UTC| < 0.9 s by definition). */
export function gmst1982(jdUT) {
  const T = (jdUT - J2000) / 36525;
  return norm360(280.46061837 + 360.98564736629 * (jdUT - J2000) + 0.000387933 * T * T - T * T * T / 38710000);
}
/** Earth Rotation Angle, IAU 2000 ([IERS] eq. 5.15), degrees. */
export function earthRotationAngle(jdUT) {
  const Du = jdUT - J2000;
  return norm360(360 * (0.7790572732640 + 0.00273781191135448 * Du + (Du % 1)));
}
/** Greenwich Mean Sidereal Time, IAU 2006 ([IERS] eq. 5.32, Capitaine et al. 2003), degrees. */
export function gmst2006(jdUT) {
  const t = centuriesTT(jdUT);
  const arcsec = 0.014506 + 4612.156534 * t + 1.3915817 * t * t - 0.00000044 * t ** 3 - 0.000029956 * t ** 4 - 3.68e-8 * t ** 5;
  return norm360(earthRotationAngle(jdUT) + arcsec / 3600);
}
/** Local Mean Sidereal Time (degrees) for east-positive longitude. */
export function lst(jdUT, lonDeg) { return norm360(gmst2006(jdUT) + lonDeg); }

/* ---------------------------------------------------------- precession --- */
/** IAU 1976 precession matrix, J2000 equatorial -> mean equatorial of date ([Lieske], [M] eq. 21.3).
 *  Rotation P = Rz(-z) . Ry(theta) . Rz(-zeta). */
export function precessionMatrix(jdUTC) {
  const T = centuriesTT(jdUTC);
  const zeta = (2306.2181 * T + 0.30188 * T * T + 0.017998 * T ** 3) / 3600 * D2R;
  const z = (2306.2181 * T + 1.09468 * T * T + 0.018203 * T ** 3) / 3600 * D2R;
  const th = (2004.3109 * T - 0.42665 * T * T - 0.041833 * T ** 3) / 3600 * D2R;
  return mulMM(rotZ(z), mulMM(rotY(-th), rotZ(zeta)));
}
/** Precess J2000 (ra, dec) to the mean equator and equinox of date. */
export function precess(ra, dec, jdUTC) { return vecToRaDec(mulMV(precessionMatrix(jdUTC), raDecToVec(ra, dec))); }

/* -------------------------------------------------- equatorial <-> horizontal --- */
/** Matrix taking a J2000 equatorial unit vector to horizontal [east, north, up]
 *  for an observer at latitude lat, east longitude lon, at UTC Julian Day jd.
 *  H = LST - ra;  up = sin(phi) sin(dec) + cos(phi) cos(dec) cos(H)  ([M] eq. 13.6). */
export function horizontalMatrix(jd, lat, lon, P) {
  const L = lst(jd, lon) * D2R, f = lat * D2R, sf = Math.sin(f), cf = Math.cos(f);
  const A = [0, 1, 0, -sf, 0, cf, cf, 0, sf];     // rows: east, north, up (from [cosH, -sinH, sin dec])
  return mulMM(A, mulMM(rotZ(-L), P || precessionMatrix(jd)));
}
/** Horizontal vector -> { alt, az } in degrees, azimuth from north through east. */
export function vecToAltAz(h) {
  return { alt: Math.asin(Math.max(-1, Math.min(1, h[2]))) * R2D, az: norm360(Math.atan2(h[0], h[1]) * R2D) };
}
export function altAzToVec(alt, az) {
  const a = alt * D2R, z = az * D2R, c = Math.cos(a);
  return [c * Math.sin(z), c * Math.cos(z), Math.sin(a)];
}
/** Classic textbook form, for the tests and the Learn panel: equatorial of date -> alt/az. */
export function eqToAltAzClassic(raDate, decDate, lat, lstDeg) {
  const H = (lstDeg - raDate) * D2R, d = decDate * D2R, f = lat * D2R;
  const alt = Math.asin(Math.sin(f) * Math.sin(d) + Math.cos(f) * Math.cos(d) * Math.cos(H));
  const az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(f) - Math.cos(d) * Math.cos(H) * Math.sin(f));
  return { alt: alt * R2D, az: norm360(az * R2D) };
}

/* ---------------------------------------------------------- refraction --- */
/** Refraction (degrees) to ADD to a true (airless) altitude, Saemundsson 1986 ([M] eq. 16.4),
 *  standard 1010 hPa and 10 C. Tapered to zero well below the horizon. */
export function refractionFromTrue(h) {
  const hh = Math.max(h, -1.9);
  let R = 1.02 / Math.tan((hh + 10.3 / (hh + 5.11)) * D2R) / 60;
  if (h < -1.9) R *= Math.max(0, 1 + (h + 1.9) / 3);
  return Math.max(0, R);
}
/** Refraction (degrees) to SUBTRACT from an apparent altitude, Bennett 1982 ([M] eq. 16.3). */
export function refractionFromApparent(h0) {
  const hh = Math.max(h0, -1.5);
  return Math.max(0, 1 / Math.tan((hh + 7.31 / (hh + 4.4)) * D2R) / 60);
}
/** Relative air mass, Kasten & Young 1989 (true altitude in degrees). */
export function airmass(h) {
  if (h <= -1) return 40;
  return 1 / (Math.sin(Math.max(h, 0) * D2R) + 0.50572 * Math.pow(Math.max(h, 0) + 6.07995, -1.6364));
}

/* -------------------------------------------- Sun, Moon and planets ---- */
const EPS = OBLIQUITY_J2000 * D2R, CE = Math.cos(EPS), SE = Math.sin(EPS);
/** Ecliptic J2000 {x,y,z} -> J2000 equatorial array. */
export function eclToEq(p) { return [p.x, p.y * CE - p.z * SE, p.y * SE + p.z * CE]; }

export const PLANETS = ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"];
export const BODY_NAMES = { sun: "Sun", moon: "Moon", mercury: "Mercury", venus: "Venus", mars: "Mars",
  jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune" };
/* Equatorial radii (km), NASA Planetary Fact Sheet, for apparent diameters. */
export const RADIUS_KM = { sun: 695700, moon: 1737.4, mercury: 2439.7, venus: 6051.8, mars: 3396.2,
  jupiter: 71492, saturn: 60268, uranus: 25559, neptune: 24764 };

/** Geocentric state of a body at UTC Julian Day jd:
 *  { v: J2000 equatorial unit vector (light-time corrected), au: distance, helio: heliocentric
 *    distance (AU), phaseAngle (deg), illum (0..1), elong (deg from Sun), mag, diam (arcsec) }. */
export function body(id, jd) {
  const E = earthPosition(jd);
  let g, r = 1, lightDays = 0;
  if (id === "sun") {
    const Ed = earthPosition(jd - 0.00577);          // ~8.3 min light-time: Earth where the light left, gives aberration
    g = { x: -Ed.x, y: -Ed.y, z: -Ed.z }; r = 0;
  } else if (id === "moon") {
    const m = moonGeocentric(jd); g = m;
    const mh = { x: E.x + m.x, y: E.y + m.y, z: E.z + m.z }; r = Math.hypot(mh.x, mh.y, mh.z);
  } else {
    let P = heliocentric(id, jd);
    for (let k = 0; k < 2; k++) {                  // light-time iteration ([M] ch. 33)
      const d = Math.hypot(P.x - E.x, P.y - E.y, P.z - E.z);
      lightDays = d * AU_KM / C_KM_S / 86400;
      P = heliocentric(id, jd - lightDays);
    }
    g = { x: P.x - E.x, y: P.y - E.y, z: P.z - E.z }; r = Math.hypot(P.x, P.y, P.z);
  }
  const au = Math.hypot(g.x, g.y, g.z);
  const v = eclToEq(g).map(c => c / au);
  const out = { id, v, au, helio: r, lightSeconds: au * AU_KM / C_KM_S };
  const sunV = id === "sun" ? v : eclToEq({ x: -E.x, y: -E.y, z: -E.z }).map(c => c / Math.hypot(E.x, E.y, E.z));
  out.elong = id === "sun" ? 0 : angularSep(v, sunV);
  out.diam = 2 * Math.atan(RADIUS_KM[id] / (au * AU_KM)) * R2D * 3600;
  if (id === "sun") { out.phaseAngle = 0; out.illum = 1; out.mag = -26.74; return out; }
  // phase angle i: angle Sun-body-Earth, from the triangle ([M] eq. 41.2)
  const R = Math.hypot(E.x, E.y, E.z);
  let cosi = (r * r + au * au - R * R) / (2 * r * au);
  const i = Math.acos(Math.max(-1, Math.min(1, cosi))) * R2D;
  out.phaseAngle = i; out.illum = (1 + Math.cos(i * D2R)) / 2;   // [M] eq. 41.1
  out.mag = magnitude(id, r, au, i, v);
  return out;
}

/** Apparent visual magnitude. Planets: [M] ch. 41 (Astronomical Almanac 1984 expressions);
 *  Moon: Allen's "Astrophysical Quantities" (-12.73 + 0.026|i| + 4e-9 i^4). */
export function magnitude(id, r, d, i, v) {
  const L = 5 * Math.log10(r * d);
  switch (id) {
    case "moon": return -12.73 + 0.026 * Math.abs(i) + 4e-9 * i ** 4;
    case "mercury": return -0.42 + L + 0.0380 * i - 0.000273 * i * i + 0.000002 * i ** 3;
    case "venus": return -4.40 + L + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i ** 3;
    case "mars": return -1.52 + L + 0.016 * i;
    case "jupiter": return -9.40 + L + 0.005 * i;
    case "saturn": {
      // Ring tilt B toward Earth: Saturn's pole at RA 40.589, Dec 83.537 (IAU WGCCRE 2015).
      const pole = raDecToVec(40.589, 83.537);
      const sinB = -(pole[0] * v[0] + pole[1] * v[1] + pole[2] * v[2]);
      const B = Math.abs(Math.asin(sinB));
      return -8.88 + L - 2.60 * Math.sin(B) + 1.25 * Math.sin(B) ** 2;
    }
    case "uranus": return -7.19 + L;
    case "neptune": return -6.87 + L;
  }
  return 99;
}
/** Saturn's ring opening angle B (deg) as seen from Earth, for the info card. */
export function saturnRingTilt(v) {
  const pole = raDecToVec(40.589, 83.537);
  return Math.asin(-(pole[0] * v[0] + pole[1] * v[1] + pole[2] * v[2])) * R2D;
}

/* ---------------------------------------------------------------- Moon --- */
/** Moon phase: elongation-based age and name, illuminated fraction, and the position
 *  angle of the bright limb chi ([M] eq. 48.5), measured from celestial north through east. */
export function moonPhase(jd) {
  const m = body("moon", jd), s = body("sun", jd);
  // ecliptic longitude difference (0 = new, 180 = full), J2000 ecliptic
  const ecl = v => { const y = v[1] * CE + v[2] * SE, x = v[0]; return norm360(Math.atan2(y, x) * R2D); };
  const D = norm360(ecl(m.v) - ecl(s.v));
  const sm = vecToRaDec(m.v), ss = vecToRaDec(s.v);
  const a0 = ss.ra * D2R, d0 = ss.dec * D2R, a = sm.ra * D2R, d = sm.dec * D2R;
  const chi = norm360(Math.atan2(Math.cos(d0) * Math.sin(a0 - a),
    Math.sin(d0) * Math.cos(d) - Math.cos(d0) * Math.sin(d) * Math.cos(a0 - a)) * R2D);
  const names = ["New Moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full Moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  const name = names[Math.floor(norm360(D + 22.5) / 45) % 8];
  return { illum: m.illum, phaseAngle: m.phaseAngle, elongLon: D, ageDays: D / 360 * 29.530589, name, chi, waxing: D < 180, distKm: m.au * AU_KM };
}
/** Topocentric altitude correction for the Moon's parallax (degrees to subtract), [M] ch. 40 (altitude form). */
export function moonParallaxAlt(altDeg, distKm) {
  const p = Math.asin(EARTH_RADIUS_KM / distKm);
  return Math.asin(Math.sin(p) * Math.cos(altDeg * D2R)) * R2D;
}

/* -------------------------------------------------- rise / set / transit --- */
/** Standard altitudes of the centre at rise/set ([M] ch. 15): refraction 34' plus semi-diameter. */
export function standardAltitude(id, distKm) {
  if (id === "sun") return -0.8333;
  if (id === "moon") return 0.7275 * Math.asin(EARTH_RADIUS_KM / (distKm || 384400)) * R2D - 0.5667;
  return -0.5667;
}

/** Geometric (airless) altitude and azimuth of a body or a fixed J2000 vector.
 *  target: a body id string, or a J2000 unit vector. Moon includes topocentric parallax. */
export function altAzOf(target, jd, lat, lon) {
  const M = horizontalMatrix(jd, lat, lon);
  let v, dist = 0;
  if (typeof target === "string") { const b = body(target, jd); v = b.v; dist = b.au * AU_KM; }
  else v = target;
  const h = vecToAltAz(mulMV(M, v));
  if (target === "moon") h.alt -= moonParallaxAlt(h.alt, dist);
  h.distKm = dist;
  return h;
}

/** Every crossing of altitude h0 and every upper transit in [jd0, jd0 + span].
 *  Samples every `step` days then refines by bisection to about a second.
 *  Returns { rises: [jd], sets: [jd], transits: [{jd, alt}], alwaysUp, neverUp }. */
export function riseSetTransit(target, jd0, lat, lon, h0, span = 1, step = 1 / 72) {
  const id = typeof target === "string" ? target : null;
  const fAlt = jd => { const a = altAzOf(target, jd, lat, lon); return a.alt - (h0 != null ? h0 : standardAltitude(id, a.distKm)); };
  // hour angle via azimuth-free form: sign of east component tells east/west of meridian
  const fHA = jd => {
    const M = horizontalMatrix(jd, lat, lon);
    const v = id ? body(id, jd).v : target;
    const p = mulMV(M, v); return -p[0];          // >0 west of meridian (H>0), <0 east
  };
  const rises = [], sets = [], transits = [];
  let t = jd0, a = fAlt(t), hA = fHA(t), anyUp = a > 0, anyDown = a <= 0;
  const n = Math.ceil(span / step);
  for (let k = 1; k <= n; k++) {
    const t2 = jd0 + k * step, a2 = fAlt(t2), hA2 = fHA(t2);
    if (a2 > 0) anyUp = true; else anyDown = true;
    if ((a <= 0) !== (a2 <= 0)) {
      let lo = t, hi = t2, flo = a;
      for (let j = 0; j < 22; j++) { const m = (lo + hi) / 2, fm = fAlt(m); if ((fm <= 0) === (flo <= 0)) { lo = m; flo = fm; } else hi = m; }
      (a <= 0 ? rises : sets).push((lo + hi) / 2);
    }
    if (hA < 0 && hA2 >= 0) {                      // east -> west crossing of the meridian = upper culmination
      let lo = t, hi = t2;
      for (let j = 0; j < 22; j++) { const m = (lo + hi) / 2; if (fHA(m) < 0) lo = m; else hi = m; }
      const tj = (lo + hi) / 2, alt = altAzOf(target, tj, lat, lon);
      transits.push({ jd: tj, alt: alt.alt, az: alt.az });
    }
    t = t2; a = a2; hA = hA2;
  }
  return { rises, sets, transits, alwaysUp: !anyDown, neverUp: !anyUp };
}

/** Upper-culmination-only filter helper: the transit with the highest altitude. */
export function bestTransit(r) { return r.transits.reduce((b, x) => (!b || x.alt > b.alt ? x : b), null); }

/** For a fixed star: circumpolar / never rises tests ([M] ch. 13). */
export function circumpolarState(dec, lat) {
  if (lat >= 0) { if (dec > 90 - lat) return "circumpolar"; if (dec < -(90 - lat)) return "never"; }
  else { if (dec < -90 - lat) return "circumpolar"; if (dec > 90 + lat) return "never"; }
  return "normal";
}

/** Sun event times for a day starting at jd0 (UTC JD of local midnight): sunrise/sunset and
 *  civil (-6), nautical (-12) and astronomical (-18) twilight, plus solar transit. */
export function sunEvents(jd0, lat, lon, span = 1) {
  const r = riseSetTransit("sun", jd0, lat, lon, -0.8333, span, 1 / 96);
  const tw = h => riseSetTransit("sun", jd0, lat, lon, h, span, 1 / 96);
  return { rise: r.rises, set: r.sets, transit: r.transits, civil: tw(-6), nautical: tw(-12), astro: tw(-18), alwaysUp: r.alwaysUp, neverUp: r.neverUp };
}

/* ------------------------------------------------------------- colours --- */
/** Effective temperature from B-V, Ballesteros 2012 (EPL 97, 34008). */
export function bvToTemp(bv) { return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)); }
/** Approximate sRGB (0..1) of a blackbody, fit to the CIE 1931 colours of Planck spectra
 *  (Tanner Helland's piecewise approximation of Mitchell Charity's blackbody table). */
export function tempToRGB(T) {
  const t = T / 100; let r, g, b;
  if (t <= 66) { r = 255; g = 99.4708025861 * Math.log(t) - 161.1195681661; }
  else { r = 329.698727446 * Math.pow(t - 60, -0.1332047592); g = 288.1221695283 * Math.pow(t - 60, -0.0755148492); }
  if (t >= 66) b = 255; else if (t <= 19) b = 0; else b = 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const c = x => Math.max(0, Math.min(255, x)) / 255;
  return [c(r), c(g), c(b)];
}
/** Rough spectral class from temperature (Morgan-Keenan boundaries, main sequence). */
export function spectralClass(T) {
  return T >= 30000 ? "O" : T >= 10000 ? "B" : T >= 7500 ? "A" : T >= 6000 ? "F" : T >= 5200 ? "G" : T >= 3700 ? "K" : "M";
}

/* -------------------------------------------------------- galactic frame --- */
/** J2000 equatorial -> galactic rotation (Hipparcos catalogue, vol. 1, sec. 1.5.3). */
export const EQ_TO_GAL = [-0.0548755604, -0.8734370902, -0.4838350155,
                           0.4941094279, -0.4448296300,  0.7469822445,
                          -0.8676661490, -0.1980763734,  0.4559837762];
export function galactic(v) { const g = mulMV(EQ_TO_GAL, v); return { l: norm360(Math.atan2(g[1], g[0]) * R2D), b: Math.asin(g[2]) * R2D }; }

/* ------------------------------------------------ constellation lookup --- */
/** Is the J2000 unit vector p inside a spherical polygon ([ra,dec] vertices)?
 *  Sums the turning of the great-circle bearings from p to each vertex: +-360 inside, 0 outside.
 *  Polygons are much smaller than a hemisphere, so vertices more than 100 deg away rule it out. */
export function inSphericalPolygon(p, poly) {
  let sum = 0, prev = null, first = null, near = false;
  const bearing = q => {                            // bearing of q seen from p, in p's tangent plane
    const nl = Math.hypot(p[0], p[1]);
    const e = nl < 1e-9 ? [0, 1, 0] : [-p[1] / nl, p[0] / nl, 0];   // local east at p
    const u = [p[1] * e[2] - p[2] * e[1], p[2] * e[0] - p[0] * e[2], p[0] * e[1] - p[1] * e[0]]; // north
    return Math.atan2(q[0] * e[0] + q[1] * e[1] + q[2] * e[2], q[0] * u[0] + q[1] * u[1] + q[2] * u[2]);
  };
  for (let i = 0; i <= poly.length; i++) {
    const q = raDecToVec(...poly[i % poly.length]);
    if (i < poly.length && q[0] * p[0] + q[1] * p[1] + q[2] * p[2] > -0.17) near = true;
    const b = bearing(q);
    if (prev != null) { let d = b - prev; if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; sum += d; }
    prev = b; if (first == null) first = b;
  }
  return near && Math.abs(sum) > Math.PI;
}
