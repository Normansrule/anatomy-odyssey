/* Cosmic Library ephemeris: where the planets are, from Kepler's laws.
 *
 * A small, dependency-free ES module (works in the browser and in Node) that
 * other pages may import:
 *
 *   import { heliocentric, earthPosition, julianDay } from "./ephemeris.js";
 *   const mars = heliocentric("mars", julianDay(new Date()));   // {x,y,z} AU
 *
 * Frame: heliocentric, ecliptic and equinox of J2000 (x toward the March
 * equinox, z toward the north ecliptic pole). Units: astronomical units (AU)
 * and Julian Days (JD).
 *
 * PRIMARY SOURCE
 *   E. M. Standish (JPL Solar System Dynamics), "Keplerian Elements for
 *   Approximate Positions of the Major Planets", Table 1 (valid 1800 AD to
 *   2050 AD). https://ssd.jpl.nasa.gov/planets/approx_pos.html
 *   Stated accuracy over that interval: a few arcminutes for most planets
 *   (Mars about 1 to 2 arcminutes, Saturn up to about 10 arcminutes).
 *
 * The method is the one described on that page:
 *   1. each element = value at J2000 + rate x T, with T in Julian centuries
 *      of Barycentric Dynamical Time (TDB) since J2000.0 (JD 2451545.0);
 *   2. argument of perihelion w = varpi - Omega, mean anomaly M = L - varpi;
 *   3. solve Kepler's equation M = E - e sin E by Newton iteration;
 *   4. position in the orbital plane, then three rotations into the ecliptic.
 */

export const AU_KM = 149597870.7;            // IAU 2012 Resolution B2 (exact)
export const C_KM_S = 299792.458;            // speed of light (exact, SI)
export const J2000 = 2451545.0;              // JD of 2000-01-01 12:00 TT
export const OBLIQUITY_J2000 = 23.4392911;   // deg, IAU 1980 mean obliquity at J2000
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

/* Table 1 of Standish, verbatim.
 * Columns: a [AU], e [-], I [deg], L [deg], varpi (long. of perihelion) [deg],
 * Omega (long. of ascending node) [deg]; second row = rate per Julian century.
 * "emb" is the Earth-Moon barycentre. */
export const STANDISH_TABLE1 = {
  mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
            [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
            [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  emb:     [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
            [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
            [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
            [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
            [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
            [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
            [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  pluto:   [[39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
            [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482]]
};
export const TABLE1_VALID = { fromJD: 2378496.5, toJD: 2470171.5 };   // 1800-01-01 .. 2050-12-31

/* (1) Ceres is not in Standish's table. Approximate osculating elements
 * (J2000 ecliptic) rounded from the JPL Small-Body Database
 * (https://ssd.jpl.nasa.gov/tools/sbdb_lookup.html#/?sstr=1), mean motion from
 * Kepler's third law. Mean anomaly at the epoch set from the perihelion
 * passage of early December 2022; checked against the observed oppositions of
 * 2023-03-21 and 2025-10-02 (see scripts/test_ephemeris.mjs). */
export const CERES = { a: 2.7670, e: 0.0785, I: 10.588, Omega: 80.25, w: 73.30, M0: 146.0, epochJD: 2460600.5 };

/* ---------------------------------------------------------------- time --- */

/** Julian Day (UTC based) of a JS Date or a millisecond timestamp. */
export function julianDay(date) {
  const ms = typeof date === "number" ? date : date.getTime();
  return ms / 86400000 + 2440587.5;
}
/** JS millisecond timestamp for a Julian Day. */
export function jdToMs(jd) { return (jd - 2440587.5) * 86400000; }
/** Julian centuries of TDB since J2000 (TT - UTC = 69.184 s since 2017; fine for display). */
export function centuries(jd) { return (jd + 69.184 / 86400 - J2000) / 36525; }

/* -------------------------------------------------------------- Kepler --- */

/** Solve Kepler's equation M = E - e sin E for E (radians) by Newton iteration. */
export function solveKepler(M, e, tol = 1e-12) {
  M = ((M + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; // wrap to [-pi, pi)
  let E = M + e * Math.sin(M);                      // Standish's starting guess
  for (let k = 0; k < 30; k++) {
    const dE = (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < tol) break;
  }
  return E;
}

/** Osculating elements of a Table 1 body at Julian Day jd (angles in degrees). */
export function elementsAt(id, jd) {
  if (id === "ceres") {
    const n = 0.9856076686 / Math.pow(CERES.a, 1.5);          // deg/day, Gaussian constant
    const M = CERES.M0 + n * (jd - CERES.epochJD);
    const varpi = CERES.Omega + CERES.w;
    return { a: CERES.a, e: CERES.e, I: CERES.I, L: varpi + M, varpi, Omega: CERES.Omega };
  }
  const row = STANDISH_TABLE1[id === "earth" ? "emb" : id];
  if (!row) throw new Error("ephemeris: unknown body " + id);
  const T = centuries(jd), [v, r] = row;
  return { a: v[0] + r[0] * T, e: v[1] + r[1] * T, I: v[2] + r[2] * T,
           L: v[3] + r[3] * T, varpi: v[4] + r[4] * T, Omega: v[5] + r[5] * T };
}

/** Position in the ecliptic frame from elements, given eccentric anomaly E (rad). */
export function positionFromElements(el, E) {
  const { a, e } = el;
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const w = (el.varpi - el.Omega) * D2R, O = el.Omega * D2R, I = el.I * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: (sw * sI) * xp + (cw * sI) * yp
  };
}

/** Heliocentric ecliptic J2000 position {x,y,z} in AU. id: mercury ... pluto, emb, earth, ceres. */
export function heliocentric(id, jd) {
  if (id === "sun") return { x: 0, y: 0, z: 0 };
  if (id === "earth") return earthPosition(jd);
  if (id === "moon") { const e = earthPosition(jd), m = moonGeocentric(jd); return { x: e.x + m.x, y: e.y + m.y, z: e.z + m.z }; }
  const el = elementsAt(id, jd);
  const E = solveKepler((el.L - el.varpi) * D2R, el.e);
  return positionFromElements(el, E);
}

/** Mean anomaly phase (0..1) of a body along its orbit, used to fade orbit trails. */
export function orbitPhase(id, jd) {
  const el = elementsAt(id === "earth" ? "emb" : id, jd);
  const M = (el.L - el.varpi) / 360;
  return M - Math.floor(M);
}

/** Sampled closed orbit (n points) as flat array [x,y,z,phase,...], sampled uniformly in E. */
export function orbitPath(id, jd, n = 360) {
  const el = elementsAt(id === "earth" ? "emb" : id, jd);
  const out = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const E = (i / n) * 2 * Math.PI;
    const p = positionFromElements(el, E);
    const M = E - el.e * Math.sin(E);
    out[i * 4] = p.x; out[i * 4 + 1] = p.y; out[i * 4 + 2] = p.z; out[i * 4 + 3] = M / (2 * Math.PI);
  }
  return out;
}

/* ---------------------------------------------------------- Earth, Moon --- */

/* Earth/Moon mass ratio 81.30057 (IAU 2009 system of constants): the Earth
 * sits 1/(1+81.30057) of the Earth-Moon distance from the barycentre. */
export const EARTH_MOON_MASS_RATIO = 81.30057;

/** Geocentric Moon, ecliptic J2000, AU. Low-precision formula of the
 * Astronomical Almanac (section D, "Low precision formulae for the Moon's
 * coordinates", about 0.3 deg in longitude), then precessed from the equinox
 * of date back to J2000 by the general precession of 1.3970 deg per century. */
export function moonGeocentric(jd) {
  const T = (jd - J2000) / 36525;
  const s = (a, b) => Math.sin((a + b * T) * D2R), c = (a, b) => Math.cos((a + b * T) * D2R);
  const lam = 218.32 + 481267.881 * T
    + 6.29 * s(135.0, 477198.87) - 1.27 * s(259.3, -413335.36) + 0.66 * s(235.7, 890534.22)
    + 0.21 * s(269.9, 954397.74) - 0.19 * s(357.5, 35999.05) - 0.11 * s(186.5, 966404.03)
    - 1.3970 * T;                                  // equinox of date -> J2000
  const bet = 5.13 * s(93.3, 483202.02) + 0.28 * s(228.2, 960400.89)
    - 0.28 * s(318.3, 6003.15) - 0.17 * s(217.6, -407332.21);
  const par = 0.9508 + 0.0518 * c(135.0, 477198.87) + 0.0095 * c(259.3, -413335.36)
    + 0.0078 * c(235.7, 890534.22) + 0.0028 * c(269.9, 954397.74);
  const rKm = 6378.14 / Math.sin(par * D2R);      // horizontal parallax -> distance
  const r = rKm / AU_KM, l = lam * D2R, b = bet * D2R;
  return { x: r * Math.cos(b) * Math.cos(l), y: r * Math.cos(b) * Math.sin(l), z: r * Math.sin(b) };
}

/** Heliocentric Earth = Earth-Moon barycentre minus the Moon's share. */
export function earthPosition(jd) {
  const emb = heliocentric("emb", jd), m = moonGeocentric(jd);
  const k = 1 / (1 + EARTH_MOON_MASS_RATIO);
  return { x: emb.x - m.x * k, y: emb.y - m.y * k, z: emb.z - m.z * k };
}

/* ------------------------------------------------------ Galilean moons --- */

/* Mean longitudes of Io, Europa, Ganymede and Callisto (J. Meeus,
 * "Astronomical Algorithms", 2nd ed., chapter 44, after J. H. Lieske's E5
 * theory): l = l0 + n t, t = JDE - 2443000.5. Distances in Jupiter radii.
 * Circular, equatorial orbits: phases good to a few degrees, which is plenty
 * for a picture, not for predicting eclipses. */
export const GALILEAN = [
  { id: "io",       name: "Io",       l0: 106.07719, n: 203.488955790, a: 5.90563 },
  { id: "europa",   name: "Europa",   l0: 175.73161, n: 101.374724735, a: 9.39725 },
  { id: "ganymede", name: "Ganymede", l0: 120.55883, n: 50.317609207,  a: 14.98936 },
  { id: "callisto", name: "Callisto", l0: 84.44459,  n: 21.571071177,  a: 26.36350 }
];
/** Mean longitude (deg) of each Galilean moon. */
export function galileanLongitudes(jd) {
  const t = jd - 2443000.5;
  return GALILEAN.map(m => (((m.l0 + m.n * t) % 360) + 360) % 360);
}

/* ---------------------------------------------------------- utilities --- */

export function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; }
export function len(a) { return Math.hypot(a.x, a.y, a.z); }
/** Ecliptic longitude (deg, 0..360) and latitude (deg) of a vector. */
export function lonLat(v) {
  let lon = Math.atan2(v.y, v.x) * R2D; if (lon < 0) lon += 360;
  return { lon, lat: Math.atan2(v.z, Math.hypot(v.x, v.y)) * R2D };
}
/** Unit vector from ecliptic longitude/latitude (deg). */
export function fromLonLat(lon, lat) {
  const l = lon * D2R, b = lat * D2R;
  return { x: Math.cos(b) * Math.cos(l), y: Math.cos(b) * Math.sin(l), z: Math.sin(b) };
}
/** Equatorial (right ascension, declination, deg) -> ecliptic J2000 unit vector. */
export function equatorialToEcliptic(raDeg, decDeg) {
  const a = raDeg * D2R, d = decDeg * D2R, e = OBLIQUITY_J2000 * D2R;
  const x = Math.cos(d) * Math.cos(a), y = Math.cos(d) * Math.sin(a), z = Math.sin(d);
  return { x, y: y * Math.cos(e) + z * Math.sin(e), z: -y * Math.sin(e) + z * Math.cos(e) };
}

/** Geocentric distance (AU) and one-way light-time (s) of a body. */
export function fromEarth(id, jd) {
  const d = len(sub(heliocentric(id, jd), earthPosition(jd)));
  return { au: d, km: d * AU_KM, lightSeconds: d * AU_KM / C_KM_S };
}

function wrap180(x) { return ((x + 540) % 360) - 180; }

/* Elongation-type event finder. For an outer planet, opposition is the moment
 * its geocentric ecliptic longitude is 180 deg from the Sun's; for Mercury and
 * Venus an inferior conjunction is when it equals the Sun's (planet nearer
 * than the Sun). f(jd) = wrap(lon_geo(planet) - lon_geo(Sun) - target). */
function eventFn(id, target) {
  return jd => {
    const E = earthPosition(jd), P = heliocentric(id, jd);
    const g = lonLat(sub(P, E)).lon, s = lonLat({ x: -E.x, y: -E.y, z: -E.z }).lon;
    return wrap180(g - s - target);
  };
}
function findRoot(f, jd0, maxDays, step) {
  let a = jd0, fa = f(a);
  for (let t = step; t <= maxDays; t += step) {
    const b = jd0 + t, fb = f(b);
    if (fa <= 0 && fb > 0 && fb - fa < 90) {           // genuine crossing, not the +-180 wrap
      let lo = a, hi = b;
      for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (f(m) <= 0) lo = m; else hi = m; }
      return (lo + hi) / 2;
    }
    if (fa >= 0 && fb < 0 && fa - fb < 90) {
      let lo = a, hi = b;
      for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (f(m) >= 0) lo = m; else hi = m; }
      return (lo + hi) / 2;
    }
    a = b; fa = fb;
  }
  return null;
}
/** Next opposition (outer planets) or inferior conjunction (Mercury, Venus) after jd.
 * Returns { jd, kind, distanceAU } or null. */
export function nextEvent(id, jd) {
  const inner = id === "mercury" || id === "venus";
  const f = eventFn(id, inner ? 0 : 180);
  let from = jd + 0.01;
  for (let tries = 0; tries < 4; tries++) {
    const t = findRoot(f, from, 1200, inner ? 1 : 2);
    if (t == null) return null;
    const d = fromEarth(id, t).au;
    // For Mercury and Venus, skip superior conjunctions (planet beyond the Sun).
    if (inner && d > len(earthPosition(t))) { from = t + 1; continue; }
    return { jd: t, kind: inner ? "inferior conjunction" : "opposition", distanceAU: d };
  }
  return null;
}
/** Closest Earth approach within +-window days of jd (golden-section search). */
export function closestApproach(id, jd, window = 30) {
  let a = jd - window, b = jd + window; const g = 0.6180339887;
  const f = t => fromEarth(id, t).au;
  let c = b - g * (b - a), d = a + g * (b - a);
  for (let k = 0; k < 60; k++) { if (f(c) < f(d)) b = d; else a = c; c = b - g * (b - a); d = a + g * (b - a); }
  const t = (a + b) / 2;
  return { jd: t, distanceAU: f(t) };
}

/** Smallest heliocentric-longitude arc that contains all the given bodies (deg). */
export function alignmentArc(ids, jd) {
  const lons = ids.map(id => lonLat(heliocentric(id, jd)).lon).sort((a, b) => a - b);
  let gap = 360 - lons[lons.length - 1] + lons[0];
  for (let i = 1; i < lons.length; i++) gap = Math.max(gap, lons[i] - lons[i - 1]);
  return 360 - gap;
}
