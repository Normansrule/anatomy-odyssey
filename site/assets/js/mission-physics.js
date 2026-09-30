/* Cosmic Library · Mission Designer physics.
 *
 * Pure ES module (no DOM): runs in the browser and in Node
 * (scripts/test_mission.mjs). Everything a Pre-Phase A mission study needs:
 *
 *   1. Lambert's problem (universal variables, Curtis Algorithm 5.2),
 *      checked against Curtis Example 5.2 and the Python toolkit
 *      (simulations/cosmic/transfers.py uses the same formulation).
 *   2. Planet states from E. M. Standish's JPL Keplerian elements
 *      (via ephemeris.js), porkchop grids, window search, Hohmann baseline.
 *   3. Patched conics: departure C3 and declination, capture Δv, entry speed,
 *      and a patched-conic Earth -> Moon transfer.
 *   4. Launch-vehicle payload versus C3 from the rocket equation, calibrated
 *      to one published payload figure per vehicle (see mission-designer.json).
 *   5. Spacecraft budgets: mass (typical subsystem fractions + contingency),
 *      power (solar array equation or radioisotope generators), link budget
 *      (Friis + Deep Space Network data-rate equation), propulsion (rocket
 *      equation), thermal (radiative equilibrium).
 *   6. A compact URL-hash encoding of the whole design.
 *
 * Units: km, s, km/s, kg, W unless a name says otherwise. Frames: heliocentric
 * ecliptic J2000 (same as ephemeris.js).
 */

import { elementsAt, solveKepler, moonGeocentric, earthPosition, heliocentric, AU_KM, C_KM_S, OBLIQUITY_J2000 } from "./ephemeris.js";

/* ------------------------------------------------------------ constants --- */
export const MU_SUN = 1.32712440018e11;      // km³/s², IAU 2009 / JPL DE405 (same as orbits.js)
export const MU_EARTH = 398600.4418;         // km³/s², WGS 84
export const R_EARTH = 6378.137;             // km, WGS 84 equatorial
export const PARK_ALT = 185;                 // km: the parking-orbit altitude launch-vehicle C3 curves assume (NASA LSP convention)
export const R_PARK = R_EARTH + PARK_ALT;
export const G0 = 9.80665;                   // m/s², standard gravity (exact)
export const S_EARTH = 1361;                 // W/m², total solar irradiance at 1 AU (Kopp & Lean 2011)
export const SIGMA = 5.670374419e-8;         // W m⁻² K⁻⁴, Stefan–Boltzmann (CODATA 2018, exact)
export const K_B = 1.380649e-23;             // J/K, Boltzmann (exact)
export const DAY = 86400;
export const MOON_A = 384400;                // km, mean Earth–Moon distance
export const MU_MOON = 4902.800;             // km³/s², JPL DE440
const D2R = Math.PI / 180, R2D = 180 / Math.PI, TAU = 2 * Math.PI;
export { AU_KM };

/* Destination bodies. GM and radii: JPL Solar System Dynamics, "Planetary
 * physical parameters" and "Astrodynamic parameters" (https://ssd.jpl.nasa.gov).
 * The near-Earth asteroid is ILLUSTRATIVE: Bennu-like size and orbit shape
 * (JPL Small-Body Database, rounded), but the mean anomaly at epoch is chosen
 * for teaching, so its launch windows are not those of the real Bennu. */
export const BODIES = {
  moon:     { mu: 4902.800, R: 1737.4, color: "#cfd3dc" },
  venus:    { mu: 324858.592, R: 6051.8, color: "#f3d9a4" },
  earth:    { mu: MU_EARTH, R: R_EARTH, color: "#6fb4ff" },
  mars:     { mu: 42828.37, R: 3389.5, color: "#e0764a" },
  jupiter:  { mu: 126686531.9, R: 71492, color: "#e3c39a" },
  saturn:   { mu: 37931206.2, R: 60268, color: "#ecd9a8" },
  asteroid: { mu: 4.892e-9, R: 0.245, color: "#b6aa98" }
};
export const ASTEROID_ELEMENTS = { a: 1.1260, e: 0.2037, I: 6.035, Omega: 2.061, w: 66.22, M0: 101.7, epochJD: 2461000.5 };

/* ------------------------------------------------------------- vectors --- */
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => Math.hypot(a[0], a[1], a[2]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const vec = { dot, norm, cross, sub, scale };

/* ------------------------------------------------------ Stumpff, Lambert --- */
export function stumpffC(z) {
  if (z > 1e-8) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-8) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 0.5 - z / 24;
}
export function stumpffS(z) {
  if (z > 1e-8) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-8) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6 - z / 120;
}

/**
 * Lambert's problem, zero revolutions, universal variables (Curtis Algorithm
 * 5.2; Bate, Mueller & White ch. 5). With A = sin Δθ √(r1 r2 / (1 − cos Δθ)),
 * y(z) = r1 + r2 + A (z S − 1)/√C and F(z) = (y/C)^{3/2} S + A √y − √μ Δt,
 * time of flight grows monotonically with z, so bracketing bisection always
 * converges (same scheme as the Python toolkit), then a few Newton steps polish.
 * r1, r2: [x,y,z] km; dt: s. Returns { v1, v2 } (km/s) or null.
 */
export function lambert(r1, r2, dt, mu = MU_SUN, prograde = true) {
  if (!(dt > 0)) return null;
  const R1 = norm(r1), R2 = norm(r2);
  const cz = r1[0] * r2[1] - r1[1] * r2[0];
  const cosd = Math.max(-1, Math.min(1, dot(r1, r2) / (R1 * R2)));
  let dth = Math.acos(cosd);
  if (prograde ? cz < 0 : cz >= 0) dth = TAU - dth;
  const A = Math.sin(dth) * Math.sqrt(R1 * R2 / (1 - cosd));
  if (!isFinite(A) || Math.abs(A) < 1e-9) return null;
  const smu = Math.sqrt(mu), target = smu * dt;
  const yOf = (z, C, S) => R1 + R2 + A * (z * S - 1) / Math.sqrt(C);
  let lo = -60, hi = TAU * TAU - 1e-9;
  // grow the lower bound for very short (hyperbolic) transfers
  for (let k = 0; k < 20; k++) {
    const C = stumpffC(lo), S = stumpffS(lo), y = yOf(lo, C, S);
    if (y > 0 && Math.pow(y / C, 1.5) * S + A * Math.sqrt(y) > target) lo *= 2; else break;
  }
  let z = 0;
  for (let k = 0; k < 64; k++) {
    z = 0.5 * (lo + hi);
    const C = stumpffC(z), S = stumpffS(z), y = yOf(z, C, S);
    if (y < 0) { lo = z; continue; }
    const F = Math.pow(y / C, 1.5) * S + A * Math.sqrt(y) - target;
    if (F < 0) lo = z; else hi = z;
    if (hi - lo < 1e-11) break;
  }
  z = 0.5 * (lo + hi);
  const C = stumpffC(z), S = stumpffS(z), y = yOf(z, C, S);
  if (!(y > 0)) return null;
  const f = 1 - y / R1, g = A * Math.sqrt(y / mu), gd = 1 - y / R2;
  if (!isFinite(g) || g === 0) return null;
  const v1 = [(r2[0] - f * r1[0]) / g, (r2[1] - f * r1[1]) / g, (r2[2] - f * r1[2]) / g];
  const v2 = [(gd * r2[0] - r1[0]) / g, (gd * r2[1] - r1[1]) / g, (gd * r2[2] - r1[2]) / g];
  return { v1, v2, z, dtheta: dth };
}

/**
 * Two-body propagation with the universal anomaly χ (Curtis Algorithms 3.3
 * and 3.4): Newton on Kepler's universal equation, then Lagrange f, g.
 */
export function propagate(r0, v0, dt, mu = MU_SUN) {
  const R0 = norm(r0), V0 = norm(v0), vr0 = dot(r0, v0) / R0, smu = Math.sqrt(mu);
  const alpha = 2 / R0 - V0 * V0 / mu;
  let chi = smu * Math.abs(alpha) * dt;
  if (!isFinite(chi) || chi === 0) chi = smu * dt / R0;
  for (let k = 0; k < 60; k++) {
    const z = alpha * chi * chi, C = stumpffC(z), S = stumpffS(z);
    const F = R0 * vr0 / smu * chi * chi * C + (1 - alpha * R0) * chi * chi * chi * S + R0 * chi - smu * dt;
    const dF = R0 * vr0 / smu * chi * (1 - alpha * chi * chi * S) + (1 - alpha * R0) * chi * chi * C + R0;
    const d = F / dF;
    chi -= d;
    if (Math.abs(d) < 1e-10 * Math.max(1, Math.abs(chi))) break;
  }
  const z = alpha * chi * chi, C = stumpffC(z), S = stumpffS(z);
  const f = 1 - chi * chi / R0 * C, g = dt - chi * chi * chi / smu * S;
  const r = [f * r0[0] + g * v0[0], f * r0[1] + g * v0[1], f * r0[2] + g * v0[2]];
  const R = norm(r);
  const fd = smu / (R * R0) * (alpha * chi * chi * chi * S - chi), gd = 1 - chi * chi / R * C;
  return { r, v: [fd * r0[0] + gd * v0[0], fd * r0[1] + gd * v0[1], fd * r0[2] + gd * v0[2]] };
}

/* ------------------------------------------------------------ ephemeris --- */
function asteroidElementsAt(jd) {
  const A = ASTEROID_ELEMENTS;
  const n = 0.9856076686 / Math.pow(A.a, 1.5);                 // deg/day (Gaussian constant)
  const varpi = A.Omega + A.w;
  return { a: A.a, e: A.e, I: A.I, L: varpi + A.M0 + n * (jd - A.epochJD), varpi, Omega: A.Omega };
}
/** Orbital elements (Standish Table 1; Earth = Earth–Moon barycentre as in the Python toolkit). */
export function elements(id, jd) {
  if (id === "asteroid") return asteroidElementsAt(jd);
  return elementsAt(id === "earth" ? "emb" : id, jd);
}
/** Heliocentric state { r:[km], v:[km/s] } from the osculating elements. */
export function stateOf(id, jd) {
  const el = elements(id, jd);
  const a = el.a * AU_KM, e = el.e;
  const E = solveKepler((el.L - el.varpi) * D2R, e);
  const cE = Math.cos(E), sE = Math.sin(E), q = Math.sqrt(1 - e * e);
  const n = Math.sqrt(MU_SUN / (a * a * a)), den = 1 - e * cE;
  const xp = a * (cE - e), yp = a * q * sE, vxp = -a * n * sE / den, vyp = a * n * q * cE / den;
  const w = (el.varpi - el.Omega) * D2R, O = el.Omega * D2R, I = el.I * D2R;
  const cw = Math.cos(w), sw = Math.sin(w), cO = Math.cos(O), sO = Math.sin(O), cI = Math.cos(I), sI = Math.sin(I);
  const P = [cw * cO - sw * sO * cI, cw * sO + sw * cO * cI, sw * sI];
  const Q = [-sw * cO - cw * sO * cI, -sw * sO + cw * cO * cI, cw * sI];
  return {
    r: [P[0] * xp + Q[0] * yp, P[1] * xp + Q[1] * yp, P[2] * xp + Q[2] * yp],
    v: [P[0] * vxp + Q[0] * vyp, P[1] * vxp + Q[1] * vyp, P[2] * vxp + Q[2] * vyp]
  };
}
/** Display position in AU {x,y,z}: ephemeris.js for planets, our elements for the asteroid. */
export function positionAU(id, jd) {
  if (id === "asteroid") { const s = stateOf(id, jd); return { x: s.r[0] / AU_KM, y: s.r[1] / AU_KM, z: s.r[2] / AU_KM }; }
  return heliocentric(id, jd);
}
/** Earth–body distance (AU) and one-way light time (s). */
export function earthDistance(id, jd) {
  if (id === "moon") { const m = moonGeocentric(jd); const d = Math.hypot(m.x, m.y, m.z); return { au: d, lightSeconds: d * AU_KM / C_KM_S }; }
  const p = positionAU(id, jd), e = earthPosition(jd);
  const d = Math.hypot(p.x - e.x, p.y - e.y, p.z - e.z);
  return { au: d, lightSeconds: d * AU_KM / C_KM_S };
}
export function sunDistanceAU(id, jd) {
  if (id === "moon") return Math.hypot(...Object.values(earthPosition(jd)));
  const p = positionAU(id, jd); return Math.hypot(p.x, p.y, p.z);
}
/** Orbital period (days) and synodic period with Earth (days). */
export function periodDays(id, jd = 2451545) { const a = elements(id, jd).a; return 365.256898 * Math.pow(a, 1.5); }
export function synodicDays(id) { const T = periodDays(id), E = periodDays("earth"); return 1 / Math.abs(1 / E - 1 / T); }

/* ------------------------------------------------------------- transfers --- */
/** Hohmann between circular coplanar orbits r1 -> r2 (km). dv in km/s, tof in days. */
export function hohmann(r1, r2, mu = MU_SUN) {
  const at = (r1 + r2) / 2;
  const dv1 = Math.abs(Math.sqrt(mu / r1) * (Math.sqrt(2 * r2 / (r1 + r2)) - 1));
  const dv2 = Math.abs(Math.sqrt(mu / r2) * (1 - Math.sqrt(2 * r1 / (r1 + r2))));
  return { dv1, dv2, dv: dv1 + dv2, tof: Math.PI * Math.sqrt(at * at * at / mu) / DAY, c3: dv1 * dv1 };
}
/** Hohmann baseline between the mean orbits (semi-major axes at jd) of two bodies. */
export function hohmannBodies(from, to, jd = 2451545) {
  return hohmann(elements(from, jd).a * AU_KM, elements(to, jd).a * AU_KM);
}

/** One interplanetary trajectory: launch C3, departure v∞ vector, arrival v∞. */
export function transfer(origin, target, jdDep, tofDays) {
  const s1 = stateOf(origin, jdDep), s2 = stateOf(target, jdDep + tofDays);
  const L = lambert(s1.r, s2.r, tofDays * DAY);
  if (!L) return null;
  const vinfD = sub(L.v1, s1.v), vinfA = sub(L.v2, s2.v);
  const c3 = dot(vinfD, vinfD), va = norm(vinfA);
  return { jdDep, tof: tofDays, jdArr: jdDep + tofDays, c3, vinfDep: Math.sqrt(c3), vinfArr: va, vinfDepVec: vinfD, vinfArrVec: vinfA,
           r1: s1.r, v1: L.v1, r2: s2.r, v2: L.v2, dtheta: L.dtheta * R2D, dla: declination(vinfD) };
}
/** Declination of the launch asymptote (deg): the v∞ vector rotated from ecliptic to equatorial. */
export function declination(v) {
  const e = OBLIQUITY_J2000 * D2R;
  const zq = v[1] * Math.sin(e) + v[2] * Math.cos(e);
  return Math.asin(zq / norm(v)) * R2D;
}

/**
 * Porkchop grid (departure date × time of flight). Returned object has the
 * arrays and a fill(i0, i1) method computing departure columns [i0, i1), so a
 * page can compute it in slices and keep the interface responsive.
 * Cell (i, j): c3[j * nDep + i], NaN where Lambert fails.
 */
export function makePorkchop(origin, target, dep0, dep1, nDep, tof0, tof1, nTof) {
  const dep = new Float64Array(nDep), tof = new Float64Array(nTof);
  for (let i = 0; i < nDep; i++) dep[i] = dep0 + (dep1 - dep0) * i / (nDep - 1);
  for (let j = 0; j < nTof; j++) tof[j] = tof0 + (tof1 - tof0) * j / (nTof - 1);
  const c3 = new Float32Array(nDep * nTof).fill(NaN), vinf = new Float32Array(nDep * nTof).fill(NaN);
  const pc = { origin, target, nDep, nTof, dep, tof, c3, vinf, done: 0 };
  pc.fill = (i0, i1) => {
    for (let i = i0; i < Math.min(i1, nDep); i++) {
      const s1 = stateOf(origin, dep[i]);
      for (let j = 0; j < nTof; j++) {
        const s2 = stateOf(target, dep[i] + tof[j]);
        const L = lambert(s1.r, s2.r, tof[j] * DAY);
        if (!L) continue;
        const k = j * nDep + i;
        const dx = L.v1[0] - s1.v[0], dy = L.v1[1] - s1.v[1], dz = L.v1[2] - s1.v[2];
        c3[k] = dx * dx + dy * dy + dz * dz;
        vinf[k] = Math.hypot(L.v2[0] - s2.v[0], L.v2[1] - s2.v[1], L.v2[2] - s2.v[2]);
      }
      pc.done = i + 1;
    }
    return pc.done;
  };
  return pc;
}
export function porkchop(origin, target, dep0, dep1, nDep, tof0, tof1, nTof) {
  const pc = makePorkchop(origin, target, dep0, dep1, nDep, tof0, tof1, nTof); pc.fill(0, nDep); return pc;
}
/** Cell with the smallest value of cost(c3, vinf) (default: C3). */
export function gridMin(pc, cost = (c3) => c3) {
  let best = Infinity, bi = -1, bj = -1;
  for (let j = 0; j < pc.nTof; j++) for (let i = 0; i < pc.nDep; i++) {
    const k = j * pc.nDep + i, c = pc.c3[k];
    if (!(c >= 0)) continue;
    const v = cost(c, pc.vinf[k]);
    if (v < best) { best = v; bi = i; bj = j; }
  }
  return bi < 0 ? null : { i: bi, j: bj, jdDep: pc.dep[bi], tof: pc.tof[bj], c3: pc.c3[bj * pc.nDep + bi], vinf: pc.vinf[bj * pc.nDep + bi], cost: best };
}
/** Continuous minimum near (jdDep, tof) by a shrinking pattern search. */
export function refineMin(origin, target, jdDep, tof, cost = (t) => t.c3, step = 8, bounds = null) {
  const f = (d, t) => {
    if (bounds && (d < bounds.d0 || d > bounds.d1 || t < bounds.t0 || t > bounds.t1)) return Infinity;
    const tr = transfer(origin, target, d, t); return tr ? cost(tr) : Infinity;
  };
  let d = jdDep, t = tof, best = f(d, t), s = step;
  while (s > 0.01) {
    let moved = false;
    for (const [a, b] of [[s, 0], [-s, 0], [0, s], [0, -s], [s, s], [-s, -s], [s, -s], [-s, s]]) {
      const v = f(d + a, t + b);
      if (v < best) { best = v; d += a; t += b; moved = true; break; }
    }
    if (!moved) s /= 2;
  }
  return transfer(origin, target, d, t);
}

/**
 * Launch windows: minimum C3 over the time-of-flight range for every
 * departure date, then the local minima of that curve (one per synodic period).
 */
export function findWindows(origin, target, jdFrom, years, tof0, tof1, stepDays = 3) {
  const nT = 36, out = [], series = [];
  for (let d = jdFrom; d <= jdFrom + years * 365.25; d += stepDays) {
    const s1 = stateOf(origin, d);
    let best = Infinity, bt = 0;
    for (let j = 0; j < nT; j++) {
      const t = tof0 + (tof1 - tof0) * j / (nT - 1), s2 = stateOf(target, d + t);
      const L = lambert(s1.r, s2.r, t * DAY);
      if (!L) continue;
      const c = (L.v1[0] - s1.v[0]) ** 2 + (L.v1[1] - s1.v[1]) ** 2 + (L.v1[2] - s1.v[2]) ** 2;
      if (c < best) { best = c; bt = t; }
    }
    series.push({ jd: d, c3: best, tof: bt });
  }
  const syn = synodicDays(target), half = Math.max(20, Math.round(syn * 0.35 / stepDays));
  for (let k = 0; k < series.length; k++) {
    const c = series[k].c3;
    if (!isFinite(c)) continue;
    let isMin = true;
    for (let m = Math.max(0, k - half); m <= Math.min(series.length - 1, k + half); m++) if (series[m].c3 < c) { isMin = false; break; }
    if (isMin && k > 0 && k < series.length - 1) out.push(series[k]);
  }
  return { windows: out, series };
}

/* -------------------------------------------------------- patched conics --- */
/** Δv from a circular parking orbit (radius rp) to a hyperbola of energy C3. */
export function departureDv(c3, rp = R_PARK, mu = MU_EARTH) { return Math.sqrt(c3 + 2 * mu / rp) - Math.sqrt(mu / rp); }
/** Single periapsis burn from a hyperbola (v∞) into an orbit rp × ra (km, radii). ra = Infinity: flyby (0). */
export function captureDv(vinf, mu, rp, ra) {
  if (!isFinite(ra)) return 0;
  const a = (rp + ra) / 2;
  return Math.sqrt(vinf * vinf + 2 * mu / rp) - Math.sqrt(mu * (2 / rp - 1 / a));
}
/** Apoapsis radius of an orbit with periapsis rp and period P (days). */
export function apoapsisFromPeriod(mu, rp, periodDays) {
  const a = Math.cbrt(mu * Math.pow(periodDays * DAY / TAU, 2));
  return 2 * a - rp;
}
/** Speed at atmospheric entry interface r (km) for a hyperbolic arrival. */
export function entrySpeed(vinf, mu, r) { return Math.sqrt(vinf * vinf + 2 * mu / r); }

/**
 * Patched-conic Earth -> Moon transfer from the 185 km parking orbit, coplanar
 * with the Moon's orbit: find the launch energy whose conic reaches the Moon's
 * mean distance in tofDays; the Moon's gravity is ignored until arrival (its
 * sphere of influence is then entered at v∞ relative to the Moon).
 */
export function lunarTransfer(tofDays, rp = R_PARK, rm = MOON_A) {
  const mu = MU_EARTH, tofS = tofDays * DAY;
  const timeTo = (c3) => {
    const vp2 = c3 + 2 * mu / rp, h = rp * Math.sqrt(vp2), e = rp * vp2 / mu - 1;
    const cosnu = (h * h / (mu * rm) - 1) / e;
    if (cosnu < -1 || cosnu > 1) return { t: Infinity };
    const nu = Math.acos(cosnu);
    let t;
    if (e < 1) {
      const a = -mu / c3, E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
      t = (E - e * Math.sin(E)) / Math.sqrt(mu / (a * a * a));
    } else {
      const a = mu / c3, F = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
      t = (e * Math.sinh(F) - F) / Math.sqrt(mu / (a * a * a));
    }
    return { t, e, h, nu };
  };
  const c3H = -2 * mu / (rp + rm);
  let lo = c3H + 1e-7, hi = 12;
  if (tofS >= timeTo(lo).t) hi = lo;
  else for (let k = 0; k < 80; k++) { const m = 0.5 * (lo + hi); if (Math.abs(m) < 1e-6) { lo = m; continue; } if (timeTo(m).t > tofS) lo = m; else hi = m; }
  const c3 = Math.abs(hi) < 1e-6 ? 1e-6 : hi, T = timeTo(c3);
  const vr = mu / T.h * T.e * Math.sin(T.nu), vt = T.h / rm, vMoon = Math.sqrt((mu + MU_MOON) / rm);
  return { c3, tof: T.t / DAY, vinfArr: Math.hypot(vr, vt - vMoon), nu: T.nu * R2D, e: T.e, vp: Math.sqrt(c3 + 2 * mu / rp), c3Hohmann: c3H };
}

/* --------------------------------------------------- launch-vehicle model --- */
/**
 * A vehicle is a list of burn phases { prop, drop, isp }: each phase burns
 * `prop` kg at `isp` s and then jettisons `drop` kg of hardware. Parallel
 * staging (boosters + core) is written as successive phases. A recoverable
 * variant holds back a fraction `reserve[i]` of a phase's propellant for the
 * landing burns: it is carried, not burned, and dropped with the stage.
 *
 *   Δv(payload) = Σ Isp_i g0 ln(M_i / (M_i − burned_i))        (Tsiolkovsky)
 *
 * The vehicle must supply the perigee speed of the departure hyperbola from a
 * 185 km parking orbit, √(C3 + 2μ/r), plus gravity, drag and steering losses
 * (minus Earth's rotation). That net loss term is the one free parameter: it
 * is fitted so the model reproduces one published payload (`calib`). The
 * resulting curve is an ESTIMATE; the NASA Launch Services Program (LSP)
 * performance website (https://elvperf.ksc.nasa.gov) is the authoritative source.
 */
export function vehicleDv(veh, payload) {
  let M = payload;
  for (const p of veh.phases) M += p.prop + p.drop;
  let dv = 0;
  veh.phases.forEach((p, i) => {
    const burn = p.prop * (1 - ((veh.reserve || [])[i] || 0));
    dv += p.isp * G0 * Math.log(M / (M - burn));
    M -= p.prop + p.drop;
  });
  return dv / 1000;                                        // km/s
}
export const perigeeSpeed = (c3, rp = R_PARK) => Math.sqrt(c3 + 2 * MU_EARTH / rp);
/** Loss term (km/s) that makes the model deliver `mass` kg at `c3`. */
export function fitLoss(veh, c3, mass) { return vehicleDv(veh, mass) - perigeeSpeed(c3); }
/** Maximum payload (kg) at launch energy c3 (km²/s²); 0 if the vehicle cannot reach it. */
export function payloadAtC3(veh, c3, loss = veh.loss) {
  const need = perigeeSpeed(c3) + loss;
  if (!isFinite(need) || vehicleDv(veh, 0) < need) return 0;
  let lo = 0, hi = 400000;
  if (vehicleDv(veh, hi) >= need) return hi;
  for (let k = 0; k < 60; k++) { const m = 0.5 * (lo + hi); if (vehicleDv(veh, m) >= need) lo = m; else hi = m; }
  return lo;
}
/** Highest C3 at which the vehicle still lifts `mass` kg. */
export function maxC3(veh, mass, loss = veh.loss) {
  const v = vehicleDv(veh, mass) - loss;
  return v * v - 2 * MU_EARTH / R_PARK;
}
/** Resolve a catalogue: inherit phases from `base`, fit `loss` from `calib`. */
export function prepareVehicles(list) {
  const byId = Object.fromEntries(list.map(v => [v.id, v]));
  for (const v of list) {
    if (v.base) { const b = byId[v.base]; v.phases = v.phases || b.phases; }
  }
  for (const v of list) if (v.lossFixed != null) v.loss = v.lossFixed; else if (v.calib) v.loss = fitLoss(v, v.calib.c3, v.calib.mass);
  for (const v of list) if (v.loss == null && v.base) v.loss = byId[v.base].loss;
  return byId;
}

/* ------------------------------------------------------------- budgets --- */
/** Deep Space Network data-rate equation (atlas entry "dsn-data-rate"): Friis
 * received power over the energy per bit needed, with dish gains
 * G = η (πD/λ)² and an extra system-loss allowance (dB). */
export function dataRate({ pt, dt, dr, fGHz, dAU, tsys, ebn0dB, lossDB = 0, etaT = 0.55, etaR = 0.6 }) {
  const lam = 0.299792458 / fGHz;                          // m
  const Gt = etaT * (Math.PI * dt / lam) ** 2, Gr = etaR * (Math.PI * dr / lam) ** 2;
  const d = dAU * AU_KM * 1000;
  const Pr = pt * Gt * Gr * (lam / (4 * Math.PI * d)) ** 2 / 10 ** (lossDB / 10);
  return { rb: Pr / (K_B * tsys * 10 ** (ebn0dB / 10)), pr: Pr, gtDB: 10 * Math.log10(Gt), grDB: 10 * Math.log10(Gr), fsplDB: 20 * Math.log10(4 * Math.PI * d / lam) };
}
/** Solar array output (atlas "solar-array-power"): P = η A S⊕/r² cos θ. */
export function solarPower(area, rAU, eta, cosT = 1) { return eta * area * S_EARTH / (rAU * rAU) * cosT; }
/** Equilibrium temperature (atlas "spacecraft-temperature") of a body of absorptivity α, emissivity ε. */
export function equilibriumT(rAU, alpha, eps, geom = 0.25, qInt = 0) {
  return Math.pow((alpha * S_EARTH / (rAU * rAU) * geom + qInt) / (eps * SIGMA), 0.25);
}
/** Propellant for Δv (km/s) from the final (dry) mass, Tsiolkovsky. */
export function propellantFor(dvKms, isp, mDry) { return mDry * (Math.exp(dvKms * 1000 / (isp * G0)) - 1); }

/**
 * The spacecraft: solve the coupled budgets by fixed-point iteration.
 * `c` = constants from mission-designer.json ("spacecraft"), `x` = inputs:
 *   payload, payloadPower, dataGbitDay, band ("X"|"Ka"), dish, rf, dsn (34|70),
 *   powerSource ("solar"|"rtg"), areaScale (1 = auto-sized), isp, finish,
 *   contingency (fraction), years (science), cruiseYears, rSun (AU at target),
 *   rSunMin (closest to Sun), commAU (max Earth distance), dvCapture, dvTcm,
 *   dvOps (km/s), eclipse (battery recharge factor).
 */
export function spacecraft(c, x) {
  const fr = c.fractions, fsum = Object.values(fr).reduce((a, b) => a + b.f, 0);
  const band = c.bands[x.band], ant = c.dsn[String(x.dsn)];
  const fin = c.finishes[x.finish] || c.finishes.white;
  const life = x.years + x.cruiseYears;
  let dry = x.payload * 4, prop = 0, heater = 0, out = null;
  for (let it = 0; it < 60; it++) {
    // --- thermal: bare equilibrium temperatures, heater power to keep the bus at T_min
    const Tcold = equilibriumT(x.rSun, fin.alpha, fin.eps), Thot = equilibriumT(x.rSunMin, fin.alpha, fin.eps);
    const side = Math.cbrt(Math.max(dry, 1) / c.thermal.density), area = 6 * side * side;   // m², bus as a cube
    const bus = c.power.busK * Math.pow(Math.max(dry, 1), c.power.busExp);                   // W, bus electronics
    const leak = area * c.thermal.mliEps * SIGMA * (c.thermal.tMin ** 4 - Tcold ** 4);        // W lost through the blanket
    heater = Math.max(0, leak - c.thermal.selfHeat * bus);                                   // electronics warm the bus too
    // --- power
    const rfDC = x.rf / band.ampEff;
    const load = x.payloadPower + bus + rfDC + heater;
    const need = load * x.eclipse;                                   // the source must also recharge the battery
    let avail, area_ = 0, nRtg = 0, srcMass, degr;
    if (x.powerSource === "rtg") {
      degr = Math.pow(1 - c.power.rtg.decay, life);
      const per = c.power.rtg.watts * degr;
      nRtg = x.rtgCount > 0 ? x.rtgCount : Math.max(1, Math.ceil(need * (1 + c.power.target) / per));
      avail = nRtg * per; srcMass = nRtg * c.power.rtg.mass;
    } else {
      const lilt = x.rSun > c.power.solar.liltFromAU ? c.power.solar.lilt : 1;
      degr = Math.pow(1 - c.power.solar.decay, life);
      const perM2 = solarPower(1, x.rSun, c.power.solar.eta) * degr * lilt;
      const auto = need * (1 + c.power.target) / perM2;
      area_ = auto * (x.areaScale || 1);
      avail = area_ * perM2; srcMass = area_ * c.power.solar.kgPerM2;
      out = out || {};
      out.autoArea = auto;
    }
    const battery = load * c.power.batteryHours / (c.power.dod * c.power.whPerKg);
    const pmad = c.power.pmadKgPerW * load;
    const powerMass = srcMass + battery + pmad;
    // --- telecom
    const small = Math.min(1, Math.max(0.05, dry / 500));                       // CubeSats carry miniature radios
    const telecomMass = c.telecom.baseKg * small + c.telecom.dishKgPerM2 * x.dish * x.dish + c.telecom.kgPerRfW * x.rf;
    // --- propulsion
    const dvTotal = x.dvCapture + x.dvTcm + x.dvOps;
    const propDryMass = prop * c.propulsion.tankFraction + (dvTotal > 0 ? c.propulsion.engineKg * Math.min(1, dry / 500) + 0.5 : 0);
    // --- dry mass: computed items + fixed fractions of dry mass
    const extra = x.extra ? x.extra.kg : 0;
    const computed = x.payload + powerMass + telecomMass + propDryMass + extra;
    const newDry = computed / (1 - fsum);
    const dryCont = newDry * (1 + x.contingency);
    const mr = Math.exp(dvTotal * 1000 / (x.isp * G0)), maxMR = c.propulsion.maxMassRatio || 12;
    const newProp = dryCont * (Math.min(mr, maxMR) - 1) * (1 + c.propulsion.residual);   // capped: beyond this no stage could be built
    if (!isFinite(newDry) || newDry > 1e7) { dry = 1e7; prop = 1e7; break; }
    const conv = Math.abs(newDry - dry) < 1e-6 * newDry && Math.abs(newProp - prop) < 1e-6 * (newProp + 1);
    dry = newDry; prop = newProp;
    const items = [
      { id: "payload", label: "Payload (science instruments)", kg: x.payload, how: "your input" },
      { id: "power", label: "Power", kg: powerMass, how: x.powerSource === "rtg" ? `${nRtg} radioisotope generator${nRtg > 1 ? "s" : ""} + battery + power electronics` : `${area_.toFixed(1)} m² array + battery + power electronics` },
      { id: "telecom", label: "Telecommunications", kg: telecomMass, how: `${x.dish} m dish, ${x.rf} W amplifier, transponders` },
      ...(x.extra ? [{ id: "extra", label: x.extra.label, kg: extra, how: x.extra.how }] : []),
      { id: "propulsion", label: "Propulsion (dry)", kg: propDryMass, how: "tanks ≈ " + Math.round(c.propulsion.tankFraction * 100) + " % of propellant + engine" },
      ...Object.entries(fr).map(([id, v]) => ({ id, label: v.label, kg: dry * v.f, how: Math.round(v.f * 100) + " % of dry mass (typical)" }))
    ];
    const rateMax = dataRate({ pt: x.rf, dt: x.dish, dr: ant.D, fGHz: band.f, dAU: x.commAU, tsys: ant.tsys[x.band], ebn0dB: c.link.ebn0dB, lossDB: band.lossDB, etaT: c.link.etaT, etaR: ant.eta });
    const rateArr = dataRate({ pt: x.rf, dt: x.dish, dr: ant.D, fGHz: band.f, dAU: x.commAUArrival || x.commAU, tsys: ant.tsys[x.band], ebn0dB: c.link.ebn0dB, lossDB: band.lossDB, etaT: c.link.etaT, etaR: ant.eta });
    const rateReq = x.dataGbitDay * 1e9 / (c.link.passHours * 3600);
    out = Object.assign(out || {}, {
      dry, dryCont, contingencyKg: dry * x.contingency, prop, wet: dryCont + prop, items, dvTotal,
      power: { load, need, avail, margin: avail / need - 1, area: area_, nRtg, degr, bus, rfDC, heater, payload: x.payloadPower, mass: powerMass, source: x.powerSource },
      comm: { rateMax: rateMax.rb, rateArr: rateArr.rb, rateReq, marginDB: 10 * Math.log10(rateMax.rb / rateReq), link: rateMax, mass: telecomMass },
      thermal: { Tcold, Thot, heater, area, leak: area * c.thermal.mliEps * SIGMA * (c.thermal.tMin ** 4 - Tcold ** 4), finish: fin },
      propulsion: { dv: dvTotal, prop, fraction: prop / (dryCont + prop), isp: x.isp, infeasible: Math.exp(dvTotal * 1000 / (x.isp * G0)) > (c.propulsion.maxMassRatio || 12) }
    });
    if (conv) break;
  }
  return out;
}

/** Margin status: "ok" (meets the target), "warn" (positive but thin), "bad". */
export function status(margin, target, warnFloor = 0) { return margin >= target ? "ok" : margin >= warnFloor ? "warn" : "bad"; }

/* ------------------------------------------------------------- URL hash --- */
/* Short keys keep links readable: #d=mars&pl=150&dep=2461343.5&tof=300&lv=vc6 … */
export const HASH_KEYS = {
  dest: "d", goal: "g", name: "n", payload: "pl", orbit: "o", years: "y", dep: "dep", tof: "tof", lv: "lv",
  payloadPower: "pp", dataGbitDay: "dv", band: "b", dish: "ant", rf: "rf", dsn: "dsn", powerSource: "ps",
  areaScale: "as", rtgCount: "rtg", isp: "isp", finish: "fin", maturity: "mat"
};
const NUMERIC = new Set(["payload", "years", "dep", "tof", "payloadPower", "dataGbitDay", "dish", "rf", "dsn", "areaScale", "rtgCount", "isp"]);
export function encodeState(s) {
  const p = new URLSearchParams();
  for (const [k, short] of Object.entries(HASH_KEYS)) if (s[k] != null && s[k] !== "") p.set(short, NUMERIC.has(k) ? String(+(+s[k]).toFixed(k === "dep" ? 2 : 3)) : String(s[k]));
  return p.toString();
}
export function decodeState(str, defaults = {}) {
  const p = new URLSearchParams(String(str || "").replace(/^#/, ""));
  const out = { ...defaults };
  for (const [k, short] of Object.entries(HASH_KEYS)) {
    if (!p.has(short)) continue;
    const v = p.get(short);
    if (NUMERIC.has(k)) { const n = parseFloat(v); if (isFinite(n)) out[k] = n; } else out[k] = v;
  }
  return out;
}

/* ------------------------------------------------------------ date utils --- */
export function jdToDate(jd) { return new Date((jd - 2440587.5) * 86400000); }
export function dateToJd(d) { return (typeof d === "string" ? Date.parse(d + (d.length <= 10 ? "T00:00:00Z" : "")) : d.getTime()) / 86400000 + 2440587.5; }
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function fmtDate(jd, long = false) {
  const d = jdToDate(jd);
  return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}${long ? " " + d.getUTCFullYear() : " " + String(d.getUTCFullYear())}`;
}
export function fmtMonth(jd) { const d = jdToDate(jd); return `${MON[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
export function isoDate(jd) { return jdToDate(jd).toISOString().slice(0, 10); }

/* ------------------------------------------------------ whole mission --- */
/** Capture/insertion geometry for a destination orbit option: { rp, ra } in km (ra = Infinity for flybys). */
export function orbitGeometry(destId, opt) {
  const B = BODIES[destId];
  if (!opt || opt.kind === "flyby" || opt.kind === "entry") return { rp: B.R + (opt && opt.hEntry || 300), ra: Infinity };
  if (opt.kind === "rendezvous") return { rp: 0, ra: 0 };
  const rp = opt.hpR ? opt.hpR * B.R : B.R + opt.hp;
  const ra = opt.periodDays ? apoapsisFromPeriod(B.mu, rp, opt.periodDays) : B.R + opt.ha;
  return { rp, ra };
}

/**
 * Evaluate a complete design. `data` = mission-designer.json (vehicles already
 * prepared with prepareVehicles), `s` = design state (see HASH_KEYS).
 */
export function evaluate(data, vehicles, s) {
  const dest = data.destinations.find(d => d.id === s.dest) || data.destinations[1];
  const opt = dest.orbits.find(o => o.id === s.orbit) || dest.orbits[0];
  const B = BODIES[dest.id];
  // --- trajectory
  let traj;
  if (dest.id === "moon") {
    const lt = lunarTransfer(s.tof);
    traj = { jdDep: s.dep, tof: lt.tof, jdArr: s.dep + lt.tof, c3: lt.c3, vinfDep: 0, vinfArr: lt.vinfArr, dla: null, lunar: lt };
  } else {
    traj = transfer("earth", dest.id, s.dep, s.tof) || { jdDep: s.dep, tof: s.tof, jdArr: s.dep + s.tof, c3: NaN, vinfArr: NaN, dla: NaN };
  }
  // --- arrival
  const geo = orbitGeometry(dest.id, opt);
  let dvCapture = 0, vEntry = null;
  if (opt.kind === "orbit") dvCapture = captureDv(traj.vinfArr, B.mu, geo.rp, geo.ra);
  else if (opt.kind === "rendezvous") dvCapture = traj.vinfArr;
  else if (opt.kind === "entry") vEntry = entrySpeed(traj.vinfArr, B.mu, geo.rp);
  // --- distances (comm and thermal)
  const jdA = traj.jdArr, span = Math.max(s.years, 0.05) * 365.25;
  let commMax = 0;
  for (let k = 0; k <= 48; k++) commMax = Math.max(commMax, earthDistance(dest.id, jdA + span * k / 48).au);
  const commArr = earthDistance(dest.id, jdA).au;
  const rSun = dest.id === "moon" ? 1.0 : elements(dest.id, jdA).a;
  let rSunMin = 0.983;                                    // Earth's perihelion distance
  if (dest.id !== "moon") { const el = elements(dest.id, jdA); rSunMin = Math.min(rSunMin, el.a * (1 - el.e)); }
  const mat = data.spacecraft.maturity.find(m => m.id === s.maturity) || data.spacecraft.maturity[0];
  const sc = spacecraft(data.spacecraft, {
    payload: s.payload, payloadPower: s.payloadPower, dataGbitDay: s.dataGbitDay, band: s.band, dish: s.dish, rf: s.rf,
    dsn: s.band === "Ka" ? 34 : s.dsn, powerSource: s.powerSource, areaScale: s.areaScale, rtgCount: s.rtgCount, isp: s.isp, finish: s.finish,
    contingency: mat.contingency, years: s.years, cruiseYears: traj.tof / 365.25, rSun, rSunMin, commAU: commMax, commAUArrival: commArr,
    dvCapture, dvTcm: dest.dvTcm, extra: dest.extraMass || null, dvOps: opt.kind === "flyby" || opt.kind === "entry" ? 0.01 : dest.dvOps, eclipse: opt.eclipse || 1
  });
  // --- launch vehicle
  const lv = vehicles[s.lv] || Object.values(vehicles)[0];
  const cap = payloadAtC3(lv, traj.c3);
  const launchMass = sc.wet;
  const T = data.spacecraft.targets;
  const launchMargin = cap > 0 ? cap / launchMass - 1 : -1;
  const checks = [
    { id: "launch", label: "Launch mass vs capability", value: launchMargin, target: T.launchMargin, status: status(launchMargin, T.launchMargin, 0) },
    { id: "power", label: "Power margin", value: sc.power.margin, target: T.powerMargin, status: status(sc.power.margin, T.powerMargin - 1e-9, 0) },
    { id: "comm", label: "Data-rate margin", value: sc.comm.marginDB, target: T.linkDB, status: status(sc.comm.marginDB, T.linkDB, 0) },
    { id: "prop", label: "Propellant fraction", value: sc.propulsion.fraction, target: T.propFractionWarn,
      status: sc.propulsion.fraction <= T.propFractionWarn ? "ok" : sc.propulsion.fraction <= T.propFractionBad ? "warn" : "bad" },
    { id: "thermal", label: "Thermal", value: sc.thermal.Thot, target: data.spacecraft.thermal.tMax,
      status: sc.thermal.Thot > data.spacecraft.thermal.tMax ? "bad" : sc.thermal.heater > 0.2 * sc.power.load ? "warn" : "ok" }
  ];
  const closes = checks.every(c => c.status !== "bad");
  return { dest, opt, B, geo, traj, dvCapture, vEntry, commMax, commArr, rSun, rSunMin, sc, lv, cap, launchMass, launchMargin, checks, closes,
           allGreen: checks.every(c => c.status === "ok"), lightArr: earthDistance(dest.id, jdA).lightSeconds, maturity: mat,
           dvDepartLEO: departureDv(traj.c3), totalDv: sc.dvTotal };
}

/**
 * Geocentric points (km) of a patched-conic lunar transfer for drawing:
 * the conic lies in the Moon's orbital plane at arrival, with periapsis placed
 * so that the arrival point is where the Moon will be. Returns { pts, t } with
 * t in seconds after the translunar burn.
 */
export function lunarArc(jdDep, lt, n = 200) {
  const jdA = jdDep + lt.tof, m1 = moonGeocentric(jdA), m2 = moonGeocentric(jdA + 0.01);
  const rm = [m1.x * AU_KM, m1.y * AU_KM, m1.z * AU_KM], rm2 = [m2.x * AU_KM, m2.y * AU_KM, m2.z * AU_KM];
  const vm = scale(sub(rm2, rm), 1 / (0.01 * DAY));
  const h = cross(rm, vm), nh = scale(h, 1 / norm(h)), ua = scale(rm, 1 / norm(rm));
  const nu = lt.nu * D2R, nxu = cross(nh, ua);
  const up = [ua[0] * Math.cos(nu) - nxu[0] * Math.sin(nu), ua[1] * Math.cos(nu) - nxu[1] * Math.sin(nu), ua[2] * Math.cos(nu) - nxu[2] * Math.sin(nu)];
  const r0 = scale(up, R_PARK), v0 = scale(cross(nh, up), lt.vp);
  const pts = [], t = [];
  for (let k = 0; k <= n; k++) { const dt = lt.tof * DAY * k / n; pts.push(k ? propagate(r0, v0, dt, MU_EARTH).r : r0); t.push(dt); }
  return { pts, t };
}
