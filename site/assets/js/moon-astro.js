/* Cosmic Library · Moon explorer: lunar positional astronomy as pure functions.
 *
 * No DOM, no Three.js: runs in the browser (moon.js) and in Node
 * (scripts/test_moon.mjs). Every formula names its source.
 *
 * References
 *   [M]  J. Meeus, "Astronomical Algorithms", 2nd ed. (Willmann-Bell, 1998)
 *        ch. 22 nutation (low-accuracy form), ch. 25 Sun (low accuracy, 0.01 deg),
 *        ch. 47 Moon (ELP-2000/82 main terms, about 10" in longitude),
 *        ch. 48 illuminated fraction, ch. 53 ephemeris for physical observations
 *        of the Moon (optical + physical libration, position angle of the axis,
 *        selenographic position of the Sun).
 *   [D]  A. Danjon (1951): Earth's shadow enlarged by 1/85 for the atmosphere,
 *        the method of the NASA/Espenak eclipse canons since 2009.
 *
 * Conventions
 *   Times are Julian Days on the UTC scale (jd); the ephemeris is evaluated at
 *   JDE = jd + (TT - UTC) with TT - UTC = 69.184 s (valid 2017 onward; UT1 ~ UTC).
 *   Angles in degrees unless a name ends in "Rad".
 *   Selenographic longitude is positive EAST (IAU), toward Mare Crisium.
 *   Selenographic vector: x -> lon 0, lat 0 (mean sub-Earth point),
 *                         y -> lon 90 E, z -> lunar north pole.
 */
import { julianDay, jdToMs, J2000 } from "./ephemeris.js";

export { julianDay, jdToMs, J2000 };
export const D2R = Math.PI / 180, R2D = 180 / Math.PI;
export const TT_MINUS_UTC = 69.184;           // s: TAI - UTC = 37 s (since 2017) + 32.184 s
export const MOON_RADIUS_KM = 1737.4;         // mean radius, NASA Moon Fact Sheet
export const EARTH_RADIUS_KM = 6378.14;       // [M] equatorial radius used in ch. 47/54
export const SUN_RADIUS_KM = 695700;          // IAU 2015 nominal solar radius
export const AU_KM = 149597870.7;
export const SYNODIC_MONTH = 29.530588853;    // days, [M] eq. 49.1
export const INCLINATION_I = 1.54242;         // deg, lunar equator to ecliptic, IAU value used in [M] ch. 53
export const ORBIT_TILT = 5.145;              // deg, lunar orbit to ecliptic (mean)

const norm360 = x => ((x % 360) + 360) % 360;
export const wrap360 = norm360;
export const wrap180 = x => norm360(x + 180) - 180;
const sin = d => Math.sin(d * D2R), cos = d => Math.cos(d * D2R);

/** JDE (TT) from a UTC Julian Day, and Julian centuries of TT since J2000. */
export const jde = jd => jd + TT_MINUS_UTC / 86400;
export const centuriesTT = jd => (jde(jd) - J2000) / 36525;

/* ------------------------------------------------------------ nutation --- */
/** Nutation in longitude and obliquity, [M] ch. 22 low-accuracy form (0.5" / 0.1").
 *  Returns degrees: { dpsi, deps, eps0 (mean obliquity), eps (true obliquity), omega }. */
export function nutation(jd) {
  const T = centuriesTT(jd);
  const om = norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T + T ** 3 / 450000);
  const Ls = 280.4665 + 36000.7698 * T, Lm = 218.3165 + 481267.8813 * T;
  const dpsi = (-17.20 * sin(om) - 1.32 * sin(2 * Ls) - 0.23 * sin(2 * Lm) + 0.21 * sin(2 * om)) / 3600;
  const deps = (9.20 * cos(om) + 0.57 * cos(2 * Ls) + 0.10 * cos(2 * Lm) - 0.09 * cos(2 * om)) / 3600;
  // mean obliquity, [M] eq. 22.2
  const eps0 = 23.439291111 - (46.8150 * T + 0.00059 * T * T - 0.001813 * T ** 3) / 3600;
  return { dpsi, deps, eps0, eps: eps0 + deps, omega: om };
}

/* ----------------------------------------------------------------- Sun --- */
/** Geocentric Sun, [M] ch. 25 (low accuracy, 0.01 deg).
 *  { lon: true geometric longitude (mean equinox of date), app: apparent longitude
 *    (nutation + aberration), R: distance in AU }. Latitude is taken as 0. */
export function sun(jd) {
  const T = centuriesTT(jd);
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M)
    + (0.019993 - 0.000101 * T) * sin(2 * M) + 0.000289 * sin(3 * M);
  const lon = norm360(L0 + C), v = M + C;
  const R = 1.000001018 * (1 - e * e) / (1 + e * cos(v));
  const om = 125.04 - 1934.136 * T;
  const app = norm360(lon - 0.00569 - 0.00478 * sin(om));   // [M] 25.8: nutation + aberration
  return { lon, app, R, M: norm360(M) };
}

/* ---------------------------------------------------------------- Moon --- */
/* [M] Table 47.A: multiples of D, M, M', F and coefficients of sum-l (1e-6 deg)
 * and sum-r (1e-3 km). Table 47.B: the same for sum-b. */
const T47A = [
  [0, 0, 1, 0, 6288774, -20905355], [2, 0, -1, 0, 1274027, -3699111], [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925], [0, 1, 0, 0, -185116, 48888], [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158], [2, -1, -1, 0, 57066, -152138], [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586], [0, 1, -1, 0, -40923, -129620], [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755], [2, 0, 0, -2, 15327, 10321], [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661], [4, 0, -1, 0, 10675, -34782], [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636], [2, 1, -1, 0, -7888, 24208], [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379], [1, 1, 0, 0, 4987, -16675], [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445], [4, 0, 0, 0, 3861, -11650], [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003], [2, 0, -1, 2, -2602, 0], [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322], [2, -2, 0, 0, 2236, -9884], [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0], [2, -2, -1, 0, 2048, -4950], [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0], [4, -1, -1, 0, 1215, -3958], [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258], [2, 1, 1, 0, -810, 2616], [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117], [2, 2, -1, 0, -700, 2354], [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0], [4, 0, 1, 0, 549, -1423], [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571], [1, 0, -2, 0, -487, -1739], [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421], [1, 1, 1, 0, 351, 0], [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0], [2, -1, 2, 0, 327, 0], [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0], [2, 0, 3, 0, 294, 0], [2, 0, -1, -2, 0, 8752]
];
const T47B = [
  [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693], [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271], [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266], [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463], [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065], [0, 1, -1, -1, -1870], [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749], [0, 1, -1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335], [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833], [0, 0, 1, -3, 777], [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607], [2, 0, 2, -1, 596], [2, -1, 1, -1, 491], [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439], [2, 0, 2, 1, 422], [2, 0, -3, -1, 421], [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351], [4, 0, 0, 1, 331], [2, -1, 1, 1, 315], [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283], [2, 1, 1, -1, -229], [1, 1, 0, -1, 223], [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220], [2, 1, -1, -1, -220], [1, 0, 1, 1, -185], [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177], [4, 0, -2, -1, 176], [4, -1, -1, -1, 166], [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132], [1, 0, -1, -1, -119], [4, -1, 0, -1, 115], [2, -2, 0, 1, 107]
];

/** Fundamental arguments of the lunar theory, [M] eqs. 47.1-47.5 (degrees). */
export function lunarArgs(jd) {
  const T = centuriesTT(jd), T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  return {
    T,
    Lp: norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T2 + T3 / 538841 - T4 / 65194000),
    D: norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T2 + T3 / 545868 - T4 / 113065000),
    M: norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T2 + T3 / 24490000),
    Mp: norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T2 + T3 / 69699 - T4 / 14712000),
    F: norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T2 - T3 / 3526000 + T4 / 863310000),
    E: 1 - 0.002516 * T - 0.0000074 * T2
  };
}

/** Geocentric Moon, [M] ch. 47. Returns degrees / km:
 *  { lon (geometric, mean equinox of date), lat, distKm, app (apparent longitude = lon + dpsi),
 *    parallax (equatorial horizontal parallax, deg), args }. */
export function moon(jd) {
  const a = lunarArgs(jd), { T, Lp, D, M, Mp, F, E } = a;
  const A1 = 119.75 + 131.849 * T, A2 = 53.09 + 479264.290 * T, A3 = 313.45 + 481266.484 * T;
  let sl = 0, sr = 0, sb = 0;
  for (const [d, m, mp, f, cl, cr] of T47A) {
    const arg = d * D + m * M + mp * Mp + f * F, e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sl += cl * e * sin(arg); sr += cr * e * cos(arg);
  }
  for (const [d, m, mp, f, cb] of T47B) {
    const e = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sb += cb * e * sin(d * D + m * M + mp * Mp + f * F);
  }
  sl += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
  sb += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) + 175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
  const lon = norm360(Lp + sl / 1e6), lat = sb / 1e6, distKm = 385000.56 + sr / 1000;
  const nu = nutation(jd);
  return { lon, lat, distKm, app: norm360(lon + nu.dpsi), parallax: Math.asin(EARTH_RADIUS_KM / distKm) * R2D, args: a, nut: nu };
}

/** Ecliptic (of date) -> equatorial, [M] eqs. 13.3/13.4. Degrees. */
export function eclToEqu(lon, lat, eps) {
  const ra = Math.atan2(sin(lon) * cos(eps) - Math.tan(lat * D2R) * sin(eps), cos(lon)) * R2D;
  const dec = Math.asin(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon)) * R2D;
  return { ra: norm360(ra), dec };
}

/* ----------------------------------------------------- phase and light --- */
/** Illuminated fraction and phase, [M] ch. 48 (eqs. 48.2, 48.3, 48.1).
 *  elong: apparent elongation in longitude Moon - Sun (0 new, 90 first quarter, 180 full). */
export function phase(jd) {
  const m = moon(jd), s = sun(jd);
  const psi = Math.acos(cos(m.lat) * cos(m.app - s.app)) * R2D;           // geocentric elongation
  const Rkm = s.R * AU_KM;
  const i = Math.atan2(Rkm * sin(psi), m.distKm - Rkm * cos(psi)) * R2D;  // phase angle
  const k = (1 + cos(i)) / 2;
  const elong = norm360(m.app - s.app);
  const names = ["New Moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full Moon", "Waning gibbous", "Last quarter", "Waning crescent"];
  // principal phases are instants: name the day-long windows around them (+-6.1 deg of elongation ~ +-12 h)
  let name;
  const near = [0, 90, 180, 270].findIndex(p => Math.abs(wrap180(elong - p)) < 6.1);
  if (near >= 0) name = names[near * 2];
  else name = names[(Math.floor(elong / 90) * 2 + 1) % 8];
  return {
    illum: k, phaseAngle: i, elong, waxing: elong < 180, name,
    ageDays: elong / 360 * SYNODIC_MONTH, distKm: m.distKm,
    diamArcmin: 2 * Math.asin(MOON_RADIUS_KM / m.distKm) * R2D * 60,
    earthIllumFromMoon: 1 - k                                              // Earth's phase seen from the Moon
  };
}

/** Apparent elongation Moon - Sun in longitude, -180..180 relative to `target` (deg). */
function elongFrom(jd, target) { const m = moon(jd), s = sun(jd); return wrap180(m.app - s.app - target); }

/** Instants of the principal phases between jd0 and jd1 (UTC JD), by bracketing and secant
 *  iteration on the apparent elongation in longitude ([M] ch. 49 defines the phases this way).
 *  Returns [{ jd, type: 0 | 1 | 2 | 3 }] for new, first quarter, full, last quarter. */
export function phaseTimes(jd0, jd1) {
  const out = [];
  for (let q = 0; q < 4; q++) {
    const target = q * 90;
    let t = jd0 - 1, f = elongFrom(t, target);
    while (t < jd1 + 1) {
      const t2 = t + 0.5, f2 = elongFrom(t2, target);
      if (f < 0 && f2 >= 0 && f2 - f < 90) {                     // an upward crossing (not the +-180 wrap)
        let a = t, b = t2, fa = f, fb = f2;
        for (let k = 0; k < 30; k++) {
          const m = b - fb * (b - a) / (fb - fa), fm = elongFrom(m, target);
          if (Math.abs(fm) < 1e-7) { a = b = m; break; }
          if (fm < 0) { a = m; fa = fm; } else { b = m; fb = fm; }
          if (b - a < 1e-6) break;
        }
        const r = (a + b) / 2;
        if (r >= jd0 && r < jd1) out.push({ jd: r, type: q });
      }
      t = t2; f = f2;
    }
  }
  return out.sort((x, y) => x.jd - y.jd);
}
export const PHASE_NAMES = ["New Moon", "First quarter", "Full Moon", "Last quarter"];

/* ------------------------------------------------------------ libration --- */
/** Physical libration terms rho, sigma, tau ([M] ch. 53), degrees. */
function physicalTerms(a, om) {
  const { T, D, M, Mp, F, E } = a;
  const K1 = 119.75 + 131.849 * T, K2 = 72.56 + 20.186 * T;
  const rho = -0.02752 * cos(Mp) - 0.02245 * sin(F) + 0.00684 * cos(Mp - 2 * F) - 0.00293 * cos(2 * F)
    - 0.00085 * cos(2 * F - 2 * D) - 0.00054 * cos(Mp - 2 * D) - 0.00020 * sin(Mp + F) - 0.00020 * cos(Mp + 2 * F)
    - 0.00020 * cos(Mp - F) + 0.00014 * cos(Mp + 2 * F - 2 * D);
  const sigma = -0.02816 * sin(Mp) + 0.02244 * cos(F) - 0.00682 * sin(Mp - 2 * F) - 0.00279 * sin(2 * F)
    - 0.00083 * sin(2 * F - 2 * D) + 0.00069 * sin(Mp - 2 * D) + 0.00040 * cos(Mp + F) - 0.00025 * sin(2 * Mp)
    - 0.00023 * sin(Mp + 2 * F) + 0.00020 * cos(Mp - F) + 0.00019 * sin(Mp - F) + 0.00013 * sin(Mp + 2 * F - 2 * D)
    - 0.00010 * cos(Mp - 3 * F);
  const tau = 0.02520 * E * sin(M) + 0.00473 * sin(2 * Mp - 2 * F) - 0.00467 * sin(Mp) + 0.00396 * sin(K1)
    + 0.00276 * sin(2 * Mp - 2 * D) + 0.00196 * sin(om) - 0.00183 * cos(Mp - F) + 0.00115 * sin(Mp - 2 * D)
    - 0.00096 * sin(Mp - D) + 0.00046 * sin(2 * F - 2 * D) - 0.00039 * sin(Mp - F) - 0.00032 * sin(Mp - M - D)
    + 0.00027 * sin(2 * Mp - M - 2 * D) + 0.00023 * sin(K2) - 0.00014 * sin(2 * D) + 0.00014 * cos(2 * Mp - 2 * F)
    - 0.00012 * sin(Mp - 2 * F) - 0.00012 * sin(2 * Mp) + 0.00011 * sin(2 * Mp - 2 * M - 2 * D);
  return { rho, sigma, tau };
}

/** Selenographic coordinates of the point that faces a direction given by ecliptic (of date)
 *  longitude lam (apparent) and latitude bet, [M] eqs. 53.1 + physical libration. */
function selenographic(lam, bet, a, nu, phys) {
  const I = INCLINATION_I;
  const W = lam - nu.dpsi - nu.omega;
  const A = Math.atan2(sin(W) * cos(bet) * cos(I) - sin(bet) * sin(I), cos(W) * cos(bet)) * R2D;
  const l1 = wrap180(A - a.F);
  const b1 = Math.asin(-sin(W) * cos(bet) * sin(I) - sin(bet) * cos(I)) * R2D;
  const l2 = -phys.tau + (phys.rho * cos(A) + phys.sigma * sin(A)) * Math.tan(b1 * D2R);
  const b2 = phys.sigma * cos(A) - phys.rho * sin(A);
  return { lOpt: l1, bOpt: b1, lPhys: l2, bPhys: b2, l: wrap180(l1 + l2), b: b1 + b2, A };
}

/** Libration and orientation of the Moon as seen from the centre of the Earth, [M] ch. 53.
 *  { l, b: total libration = selenographic lon/lat of the sub-Earth point;
 *    lOpt, bOpt, lPhys, bPhys; P: position angle of the lunar axis (north pole) measured
 *    from celestial north toward east; sunLon, sunLat: selenographic sub-solar point;
 *    colongitude; ra, dec (apparent, deg) }. */
export function libration(jd) {
  const m = moon(jd), a = m.args, nu = m.nut;
  const phys = physicalTerms(a, nu.omega);
  const earth = selenographic(m.app, m.lat, a, nu, phys);
  // Position angle of the axis, [M] ch. 53
  const I = INCLINATION_I;
  const V = nu.omega + nu.dpsi + phys.sigma / sin(I);
  const X = sin(I + phys.rho) * sin(V);
  const Y = sin(I + phys.rho) * cos(V) * cos(nu.eps) - cos(I + phys.rho) * sin(nu.eps);
  const om = Math.atan2(X, Y) * R2D;
  const eq = eclToEqu(m.app, m.lat, nu.eps);
  const P = Math.asin(Math.hypot(X, Y) * cos(eq.ra - om) / cos(earth.b)) * R2D;
  // Selenographic position of the Sun, [M] ch. 53: heliocentric direction of the Moon
  const s = sun(jd), R = s.R * AU_KM, ratio = m.distKm / R;
  const lamH = s.app + 180 + ratio * R2D * cos(m.lat) * sin(s.app - m.app);
  const betH = ratio * m.lat;
  const sol = selenographic(lamH, betH, a, nu, phys);
  return {
    l: earth.l, b: earth.b, lOpt: earth.lOpt, bOpt: earth.bOpt, lPhys: earth.lPhys, bPhys: earth.bPhys, P,
    sunLon: sol.l, sunLat: sol.b, colongitude: norm360(90 - sol.l),
    ra: eq.ra, dec: eq.dec, lon: m.app, lat: m.lat, distKm: m.distKm
  };
}

/** Selenographic lon/lat (deg) -> unit vector [x (lon 0), y (lon 90 E), z (north)]. */
export function selenoVec(lon, lat) {
  const c = cos(lat);
  return [c * cos(lon), c * sin(lon), sin(lat)];
}
/** Great-circle distance between two selenographic points, km on the mean sphere. */
export function surfaceDistanceKm(lon1, lat1, lon2, lat2) {
  const a = selenoVec(lon1, lat1), b = selenoVec(lon2, lat2);
  const cx = a[1] * b[2] - a[2] * b[1], cy = a[2] * b[0] - a[0] * b[2], cz = a[0] * b[1] - a[1] * b[0];
  return Math.atan2(Math.hypot(cx, cy, cz), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * MOON_RADIUS_KM;
}

/* ------------------------------------------------------------- eclipses --- */
/** Moon relative to the centre of Earth's shadow (the anti-solar point), degrees on the sky:
 *  x = (lon difference) cos(lat) (positive east), y = latitude difference (positive north);
 *  with the Danjon radii of the umbra and penumbra and the Moon's semi-diameter ([D]; [M] ch. 54). */
export function shadowGeometry(jd) {
  const m = moon(jd), s = sun(jd);
  const pi1 = m.parallax * 0.998340;                          // Moon's parallax on the mean Earth radius
  const pi2 = 8.794 / 3600 / s.R;                             // Sun's parallax
  const sS = 959.63 / 3600 / s.R;                             // Sun's semi-diameter
  const sm = Math.asin(MOON_RADIUS_KM / m.distKm) * R2D;       // Moon's semi-diameter (geocentric)
  const x = wrap180(m.app - (s.app + 180)) * cos(m.lat), y = m.lat;
  return {
    x, y, sep: Math.hypot(x, y), moonR: sm,
    umbra: 1.01 * pi1 - sS + pi2,                             // Danjon: 1/85 enlargement ~ 1.01 x parallax
    penumbra: 1.01 * pi1 + sS + pi2
  };
}

function minimize(f, a, b, tol = 1e-6) {                     // golden-section search
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a), fc = f(c), fd = f(d);
  while (b - a > tol) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}
function bisect(f, a, b, it = 40) {
  let fa = f(a);
  for (let k = 0; k < it; k++) { const m = (a + b) / 2, fm = f(m); if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else b = m; }
  return (a + b) / 2;
}

/** Circumstances of a lunar eclipse near the full Moon closest to jdGuess:
 *  greatest eclipse, umbral magnitude, gamma-like minimum separation (in Earth radii),
 *  contact times P1 U1 U2 U3 U4 P4 (UTC JD, null when the phase does not occur), durations in minutes. */
export function lunarEclipse(jdGuess) {
  // nearest full Moon
  const full = phaseTimes(jdGuess - 16, jdGuess + 16).filter(p => p.type === 2)
    .sort((a, b) => Math.abs(a.jd - jdGuess) - Math.abs(b.jd - jdGuess))[0];
  const f = t => shadowGeometry(t).sep;
  const tMax = minimize(f, full.jd - 0.25, full.jd + 0.25, 1e-7);
  const g = shadowGeometry(tMax);
  const umag = (g.umbra + g.moonR - g.sep) / (2 * g.moonR);
  const pmag = (g.penumbra + g.moonR - g.sep) / (2 * g.moonR);
  const contact = (limit) => {
    const h = t => shadowGeometry(t).sep - limit(shadowGeometry(t));
    if (h(tMax) >= 0) return [null, null];
    return [bisect(h, tMax - 0.35, tMax), bisect(t => -h(t), tMax, tMax + 0.35)];
  };
  const [P1, P4] = contact(q => q.penumbra + q.moonR);
  const [U1, U4] = contact(q => q.umbra + q.moonR);
  const [U2, U3] = contact(q => q.umbra - q.moonR);
  // gamma: least distance of the Moon's centre from the shadow axis in Earth equatorial radii
  const gamma = Math.sign(g.y) * g.sep / moon(tMax).parallax;
  const type = U2 ? "total" : U1 ? "partial" : P1 ? "penumbral" : "none";
  const mins = (a, b) => (a && b ? (b - a) * 1440 : 0);
  return { type, jdMax: tMax, umbralMag: umag, penumbralMag: pmag, gamma, P1, U1, U2, U3, U4, P4,
    totalMin: mins(U2, U3), partialMin: mins(U1, U4), penumbralMin: mins(P1, P4), geometryAtMax: g };
}

/** Rough circumstances of a solar eclipse near the new Moon closest to jdGuess, from the geometry
 *  of the Moon's shadow axis (Sun and Moon from [M] ch. 25/47, latitude of the Sun neglected):
 *  { jdMax (least distance of the axis from Earth's centre), gamma (Earth radii, + north),
 *    central (axis hits Earth), kind: "total" | "annular" | "partial" at the point nearest the axis }. */
export function solarEclipse(jdGuess) {
  const nm = phaseTimes(jdGuess - 16, jdGuess + 16).filter(p => p.type === 0)
    .sort((a, b) => Math.abs(a.jd - jdGuess) - Math.abs(b.jd - jdGuess))[0];
  const geo = t => {
    const m = moon(t), s = sun(t), nu = m.nut;
    const toXYZ = (lon, lat, r) => { const e = eclToEqu(lon, lat, nu.eps); return [r * cos(e.dec) * cos(e.ra), r * cos(e.dec) * sin(e.ra), r * sin(e.dec)]; };
    const M = toXYZ(m.app, m.lat, m.distKm / EARTH_RADIUS_KM);
    const S = toXYZ(s.app, 0, s.R * AU_KM / EARTH_RADIUS_KM);
    const u = [M[0] - S[0], M[1] - S[1], M[2] - S[2]], L = Math.hypot(...u); u[0] /= L; u[1] /= L; u[2] /= L;
    const c = [M[1] * u[2] - M[2] * u[1], M[2] * u[0] - M[0] * u[2], M[0] * u[1] - M[1] * u[0]];
    const d = Math.hypot(...c);
    const along = -(M[0] * u[0] + M[1] * u[1] + M[2] * u[2]);           // Moon -> foot of perpendicular
    // north/south: sign of z of the foot point
    const foot = [M[0] + u[0] * along, M[1] + u[1] * along, M[2] + u[2] * along];
    return { d, along, L, foot };
  };
  const tMax = minimize(t => geo(t).d, nm.jd - 0.3, nm.jd + 0.3, 1e-7);
  const G = geo(tMax);
  const gamma = Math.sign(G.foot[2]) * G.d;
  const rm = MOON_RADIUS_KM / EARTH_RADIUS_KM, rs = SUN_RADIUS_KM / EARTH_RADIUS_KM;
  const umbraLen = G.L * rm / (rs - rm);                        // Moon to umbral cone vertex
  const toSurface = G.d < 1 ? G.along - Math.sqrt(1 - G.d * G.d) : G.along;
  const kind = G.d > 1 + 0.55 ? "none" : G.d < 0.9972 ? (umbraLen > toSurface ? "total" : "annular") : "partial";
  return { jdMax: tMax, gamma, central: G.d < 0.9972, kind, umbraMinusSurfaceKm: (umbraLen - toSurface) * EARTH_RADIUS_KM };
}

/* ---------------------------------------------------------------- misc --- */
/** Mean Earth-Moon distance and recession ([Williams & Boggs 2016]: 3.8 cm/yr from Lunar Laser Ranging). */
export const MEAN_DISTANCE_KM = 384400;
export const RECESSION_CM_PER_YR = 3.8;
