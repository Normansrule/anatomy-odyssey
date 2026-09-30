/* Space Academy — a self-paced course: star-map course view, lessons with
 * one interactive widget each, quick checks, XP, badges, a progress code
 * and a printable completion certificate.
 *
 * Structure
 *   1. Pure functions (no DOM): physics for the widgets, grading, progress
 *      encoding, statistics. Exported so scripts/test_academy.mjs can check
 *      them in Node.
 *   2. The page (only runs in a browser): state, course map, lesson view,
 *      widgets, certificate.
 *
 * Every number a widget shows is computed either by the Equation Atlas
 * calculators (equations-core.js + data/equations.json) or by the small,
 * commented models below. Sources are cited next to the constants.
 */
import { makeScope, compile, displayValues, evaluate, formatOutput, fmt } from "./equations-core.js";
import { solveKepler, heliocentric, julianDay, jdToMs, AU_KM } from "./ephemeris.js";

/* ============================================================== 1. PURE === */

const TAU = 2 * Math.PI;
const G0 = 9.80665;                        // standard gravity, m/s² (exact, CGPM 1901)
const GM_SUN = 1.3271244e20;               // m³/s², IAU 2015 nominal (as in equations.json)
const AU_M = AU_KM * 1000;
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/* ---- Lambert's problem, two dimensions, prograde, zero revolutions -------
 * Universal-variable formulation (H. D. Curtis, "Orbital Mechanics for
 * Engineering Students", Algorithm 5.2) with bisection on z instead of
 * Newton steps, which is slower but cannot diverge. */
function stumpC(z) {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + z * z / 720;
}
function stumpS(z) {
  if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6 - z / 120 + z * z / 5040;
}
/** r1, r2: [x, y]; tof > 0; mu in matching units. Returns { v1, v2 } or null. */
export function lambert2D(r1, r2, tof, mu) {
  const R1 = Math.hypot(r1[0], r1[1]), R2 = Math.hypot(r2[0], r2[1]);
  const cross = r1[0] * r2[1] - r1[1] * r2[0];
  let dth = Math.acos(clamp((r1[0] * r2[0] + r1[1] * r2[1]) / (R1 * R2), -1, 1));
  if (cross < 0) dth = TAU - dth;                       // prograde = counter-clockwise
  const A = Math.sin(dth) * Math.sqrt(R1 * R2 / (1 - Math.cos(dth)));
  if (!isFinite(A) || Math.abs(A) < 1e-9 * Math.sqrt(R1 * R2)) return null;
  const y = (z) => R1 + R2 + A * (z * stumpS(z) - 1) / Math.sqrt(stumpC(z));
  const sm = Math.sqrt(mu) * tof;
  const F = (z) => {
    const yz = y(z);
    if (!(yz > 0)) return -Infinity;                    // below the physical branch
    return Math.pow(yz / stumpC(z), 1.5) * stumpS(z) + A * Math.sqrt(yz) - sm;
  };
  let lo = -100, hi = TAU * TAU - 1e-9;
  while (F(lo) > 0 && lo > -1e4) lo *= 2;
  if (F(lo) > 0 || !(F(hi) > 0)) return null;
  for (let i = 0; i < 90; i++) {
    const mid = (lo + hi) / 2;
    if (F(mid) > 0) hi = mid; else lo = mid;
  }
  const z = (lo + hi) / 2, yz = y(z);
  const f = 1 - yz / R1, g = A * Math.sqrt(yz / mu), gd = 1 - yz / R2;
  return {
    v1: [(r2[0] - f * r1[0]) / g, (r2[1] - f * r1[1]) / g],
    v2: [(gd * r2[0] - r1[0]) / g, (gd * r2[1] - r1[1]) / g]
  };
}

/** Planet state in the ecliptic plane (AU, AU/day) from ephemeris.js; z is dropped. */
function planet2D(id, jd) {
  const p = heliocentric(id, jd), a = heliocentric(id, jd - 0.5), b = heliocentric(id, jd + 0.5);
  return { r: [p.x, p.y], v: [b.x - a.x, b.y - a.y] };
}
const MU_AU_DAY = GM_SUN * 86400 * 86400 / (AU_M * AU_M * AU_M);
const AUD_TO_KMS = AU_KM / 86400;

/** One porkchop cell: Earth→Mars, departure JD, time of flight in days. Δv = |v∞ departure| + |v∞ arrival| in km/s. */
export function porkchopCell(jdDep, tof) {
  const E = planet2D("emb", jdDep), M = planet2D("mars", jdDep + tof);
  const L = lambert2D(E.r, M.r, tof, MU_AU_DAY);
  if (!L) return null;
  const dep = Math.hypot(L.v1[0] - E.v[0], L.v1[1] - E.v[1]) * AUD_TO_KMS;
  const arr = Math.hypot(L.v2[0] - M.v[0], L.v2[1] - M.v[1]) * AUD_TO_KMS;
  return { dep, arr, total: dep + arr };
}

/* ---- Booster hoverslam ----------------------------------------------------
 * One Merlin-class engine at minimum throttle: 482 kN, Isp 282 s (sea level),
 * from site/data/booster.json. Landing mass ≈ 26 t (22.2 t dry + a few tonnes
 * of propellant). No air drag, vertical fall. */
export const BOOSTER = { F: 482e3, m0: 26000, isp: 282 };
export function landingSim({ h0, v0, F = BOOSTER.F, m0 = BOOSTER.m0, isp = BOOSTER.isp, g = G0, dt = 0.004 }) {
  const mdot = F / (isp * G0);
  let h = h0, v = v0, m = m0, t = 0;                    // v is downward speed
  const path = [[0, h, v]];
  let next = 0.05;
  while (t < 300) {
    const a = F / m - g;                                // net upward deceleration
    const vn = v - a * dt;
    if (vn <= 0) {                                      // stopped in mid-air (or exactly at the pad)
      const f = v / (v - vn);
      h -= v * f * dt / 2; t += f * dt;
      path.push([t, h, 0]);
      return { stopped: true, hStop: h, vImpact: 0, t, path, mEnd: m - mdot * f * dt };
    }
    const hn = h - (v + vn) / 2 * dt;
    if (hn <= 0) {                                      // hit the pad while still falling
      const f = h / (h - hn);
      const vi = v + (vn - v) * f;
      t += f * dt;
      path.push([t, 0, vi]);
      return { stopped: false, hStop: 0, vImpact: vi, t, path, mEnd: m - mdot * f * dt };
    }
    v = vn; h = hn; m -= mdot * dt; t += dt;
    if (t >= next) { path.push([t, h, v]); next += 0.05; }
  }
  return { stopped: true, hStop: h, vImpact: 0, t, path, mEnd: m };
}
/** Ignition height at which the booster stops exactly at the ground. */
export function idealIgnition(v0, opts = {}) {
  let lo = 1, hi = 30000;
  const G = (h) => { const r = landingSim({ ...opts, h0: h, v0 }); return r.stopped ? r.hStop : -r.vImpact; };
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (G(mid) > 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

/* ---- Max-Q toy ascent -----------------------------------------------------
 * Vertical flight, constant thrust. Normalised liftoff mass 1 falls to 0.35
 * after 160 s at full throttle (a first stage that is 65 % propellant).
 * Dynamic pressure q = ½ ρ v² with ρ = 1.225 e^(−h / 8.5 km): the same model
 * as the Equation Atlas "dynamic-pressure" calculator (the page passes that
 * calculator in as qfn). Throttle bucket: 65 % thrust for 30 s once q first
 * passes 22 kPa. */
export function ascent({ tw = 1.4, bucket = false, qfn = (h, v) => 0.5 * 1.225 * Math.exp(-h / 8500) * v * v, dt = 0.1 }) {
  let t = 0, h = 0, v = 0, m = 1, trig = -1;
  const out = [];
  let peak = { q: 0 };
  while (t < 170 && h < 45000) {
    let thr = 1;
    if (bucket && trig >= 0 && t - trig < 30) thr = 0.65;
    const a = thr * tw * G0 / m - G0;
    v = Math.max(0, v + a * dt); h += v * dt; m -= thr * (0.65 / 160) * dt; t += dt;
    const q = qfn(h, v);
    if (bucket && trig < 0 && q > 22000) trig = t;
    const s = { t, h, v, q, thr };
    out.push(s);
    if (q > peak.q) peak = s;
    if (m <= 0.35) break;
  }
  return { samples: out, peak };
}

/* ---- Gravity assist (patched conics) -------------------------------------- */
export const JUPITER = { mu: 1.26686534e8, R: 71492, U: 13.07 };   // km³/s² (JPL), km (equatorial), km/s (mean orbital speed)
/** Turn angle of a hyperbolic flyby: sin(δ/2) = 1 / (1 + rp v∞² / μ). */
export function flybyTurn(vinf, rp, mu) { return 2 * Math.asin(1 / (1 + rp * vinf * vinf / mu)); }
/** Heliocentric speeds before/after a flyby. phi: v∞-in direction (rad); sign: +1 rotates the v∞ vector counter-clockwise. */
export function flyby({ vinf, rp, mu = JUPITER.mu, U = JUPITER.U, phi = Math.PI / 2, sign = -1 }) {
  const delta = flybyTurn(vinf, rp, mu);
  const vin = [U + vinf * Math.cos(phi), vinf * Math.sin(phi)];
  const po = phi + sign * delta;
  const vout = [U + vinf * Math.cos(po), vinf * Math.sin(po)];
  return { delta, e: 1 + rp * vinf * vinf / mu, vin, vout, sIn: Math.hypot(...vin), sOut: Math.hypot(...vout), dv: 2 * vinf * Math.sin(delta / 2), phiOut: po };
}

/* ---- Light -------------------------------------------------------------- */
const H_PL = 6.62607015e-34, C_L = 299792458, K_B = 1.380649e-23;   // exact SI values
/** Planck spectral radiance B_λ(T), W·sr⁻¹·m⁻³. */
export function planck(lam, T) { return 2 * H_PL * C_L * C_L / Math.pow(lam, 5) / Math.expm1(H_PL * C_L / (lam * K_B * T)); }
/* CIE 1931 2° colour-matching functions, multi-lobe Gaussian fit:
 * Wyman, Sloan & Shirley (2013), "Simple Analytic Approximations to the CIE XYZ
 * Color Matching Functions", Journal of Computer Graphics Techniques 2(2). */
const gp = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
const cieX = (l) => 1.056 * gp(l, 599.8, 37.9, 31.0) + 0.362 * gp(l, 442.0, 16.0, 26.7) - 0.065 * gp(l, 501.1, 20.4, 26.2);
const cieY = (l) => 0.821 * gp(l, 568.8, 46.9, 40.5) + 0.286 * gp(l, 530.9, 16.3, 31.1);
const cieZ = (l) => 1.217 * gp(l, 437.0, 11.8, 36.0) + 0.681 * gp(l, 459.0, 26.0, 13.8);
const gammaSRGB = (c) => c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
/** Colour of a blackbody at temperature T as [r, g, b] 0-255, brightness normalised. */
export function blackbodyRGB(T) {
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) { const B = planck(l * 1e-9, T); X += B * cieX(l); Y += B * cieY(l); Z += B * cieZ(l); }
  // XYZ → linear sRGB (IEC 61966-2-1, D65)
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  r = Math.max(0, r); g = Math.max(0, g); b = Math.max(0, b);
  const mx = Math.max(r, g, b) || 1;
  return [r, g, b].map((c) => Math.round(255 * gammaSRGB(c / mx)));
}
/** Visible colour of a wavelength (nm), for drawing the rainbow band. */
export function wavelengthRGB(l) {
  const X = cieX(l), Y = cieY(l), Z = cieZ(l);
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z, g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z, b = 0.0557 * X - 0.2040 * Y + 1.0570 * Z;
  const k = Math.max(r, g, b, 1e-6); r = Math.max(0, r / k); g = Math.max(0, g / k); b = Math.max(0, b / k);
  const fade = l < 420 ? 0.3 + 0.7 * (l - 380) / 40 : l > 700 ? 0.3 + 0.7 * (780 - l) / 80 : 1;
  return [r, g, b].map((c) => Math.round(255 * gammaSRGB(c) * clamp(fade, 0, 1)));
}
/** Bessel J1 (Numerical Recipes, 2nd ed., §6.5 rational approximations). */
export function besselJ1(x) {
  const ax = Math.abs(x);
  if (ax < 8) {
    const y = x * x;
    const a1 = x * (72362614232.0 + y * (-7895059235.0 + y * (242396853.1 + y * (-2972611.439 + y * (15704.48260 + y * -30.16036606)))));
    const a2 = 144725228442.0 + y * (2300535178.0 + y * (18583304.74 + y * (99447.43394 + y * (376.9991397 + y))));
    return a1 / a2;
  }
  const z = 8 / ax, y = z * z, xx = ax - 2.356194491;
  const a1 = 1 + y * (0.183105e-2 + y * (-0.3516396496e-4 + y * (0.2457520174e-5 + y * -0.240337019e-6)));
  const a2 = 0.04687499995 + y * (-0.2002690873e-3 + y * (0.8449199096e-5 + y * (-0.88228987e-6 + y * 0.105787412e-6)));
  const ans = Math.sqrt(0.636619772 / ax) * (Math.cos(xx) * a1 - z * Math.sin(xx) * a2);
  return x < 0 ? -ans : ans;
}
/** Airy pattern intensity (peak 1) at x = π D sin θ / λ. */
export function airy(x) { if (Math.abs(x) < 1e-6) return 1; const j = 2 * besselJ1(x) / x; return j * j; }

/** Area of overlap of two circles (radii R, r, centre distance d). */
export function circleOverlap(d, R, r) {
  if (d >= R + r) return 0;
  if (d <= Math.abs(R - r)) return Math.PI * Math.min(R, r) ** 2;
  const a1 = r * r * Math.acos(clamp((d * d + r * r - R * R) / (2 * d * r), -1, 1));
  const a2 = R * R * Math.acos(clamp((d * d + R * R - r * r) / (2 * d * R), -1, 1));
  return a1 + a2 - 0.5 * Math.sqrt(Math.max(0, (-d + r + R) * (d + r - R) * (d - r + R) * (d + r + R)));
}

/* ---- Newton's cannonball (two-body, RK4) --------------------------------- */
export const EARTH = { mu: 398600.4, R: 6371 };         // km³/s² (as in equations.json), mean radius km
export function cannon(vKms, altKm, { mu = EARTH.mu, R = EARTH.R } = {}) {
  const r0 = R + altKm;
  const eps = vKms * vKms / 2 - mu / r0;
  const a = eps < 0 ? -mu / (2 * eps) : Infinity;
  const ecc = Math.abs(r0 * vKms * vKms / mu - 1);
  const rp = eps < 0 ? a * (1 - ecc) : r0;
  const ra = eps < 0 ? a * (1 + ecc) : Infinity;
  let outcome = eps >= 0 ? "escape" : rp < R ? "crash" : Math.abs(ecc) < 0.01 ? "circular" : "orbit";
  // integrate for the drawing
  let x = 0, y = r0, vx = vKms, vy = 0, ang = 0, prev = Math.PI / 2;
  const pts = [[x, y]];
  const acc = (px, py) => { const r = Math.hypot(px, py), k = -mu / (r * r * r); return [k * px, k * py]; };
  for (let i = 0; i < 6000; i++) {
    const r = Math.hypot(x, y);
    const dt = 0.004 * Math.sqrt(r * r * r / mu);       // ~1/250 of a local orbital period
    const [a1x, a1y] = acc(x, y);
    const [a2x, a2y] = acc(x + vx * dt / 2, y + vy * dt / 2);
    const [a3x, a3y] = acc(x + (vx + a1x * dt / 2) * dt / 2, y + (vy + a1y * dt / 2) * dt / 2);
    const [a4x, a4y] = acc(x + (vx + a2x * dt / 2) * dt, y + (vy + a2y * dt / 2) * dt);
    // classical RK4 on (position, velocity)
    const k1 = [vx, vy, a1x, a1y];
    const k2 = [vx + a1x * dt / 2, vy + a1y * dt / 2, a2x, a2y];
    const k3 = [vx + a2x * dt / 2, vy + a2y * dt / 2, a3x, a3y];
    const k4 = [vx + a3x * dt, vy + a3y * dt, a4x, a4y];
    x += dt / 6 * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += dt / 6 * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    vx += dt / 6 * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    vy += dt / 6 * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
    const th = Math.atan2(y, x);
    let d = prev - th; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
    ang += d; prev = th;
    const rr = Math.hypot(x, y);
    if (rr < R) { const f = R / rr; pts.push([x * f, y * f]); break; }
    pts.push([x, y]);
    if (ang >= TAU || rr > 8 * R) break;
  }
  return { outcome, rp, ra, a, ecc, vc: Math.sqrt(mu / r0), vesc: Math.sqrt(2 * mu / r0), T: eps < 0 ? TAU * Math.sqrt(a * a * a / mu) : Infinity, groundArc: ang * R, pts };
}

/* ---- Grading, progress, statistics --------------------------------------- */
/** Parse a typed number: "2,500", "7.67", "7,67", "1.2e3", "−3". NaN if not a number. */
export function parseNumber(str) {
  let s = String(str).trim().replace(/[−–]/g, "-").replace(/[\s  _]/g, "");
  s = s.replace(/[×x]10\^?([-+]?\d+)$/i, "e$1");
  if (/^[-+]?\d+,\d+$/.test(s) && !/^[-+]?\d{1,3},\d{3}$/.test(s)) s = s.replace(",", ".");   // decimal comma
  s = s.replace(/,(?=\d{3}(\D|$))/g, "");                                                        // thousands commas
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return NaN;
  return parseFloat(s);
}
/** true / false, or null when the input is not a number. */
export function gradeNumeric(input, q) {
  const v = parseNumber(input);
  if (!isFinite(v)) return null;
  return Math.abs(v - q.answer) <= q.tol + 1e-9 * Math.max(1, Math.abs(q.answer));
}

export function allLessons(course) {
  const out = [];
  course.tracks.forEach((t, ti) => t.lessons.forEach((l, li) => out.push({ ...l, track: t, ti, li, num: `${t.n}.${li + 1}` })));
  return out;
}
export function emptyState() { return { v: 1, p: {}, last: "", name: "" }; }

export function isDone(course, rec) { return !!rec && rec.n > 0 && rec.c / rec.n >= course.passMark - 1e-9; }

/** XP, rank, completed lessons, tracks and badges from the saved state. */
export function stats(course, state) {
  const L = allLessons(course);
  let xp = 0, done = 0, perfect = 0;
  const doneSet = new Set();
  for (const l of L) {
    const r = state.p[l.id];
    if (!r) continue;
    xp += r.c * course.xp.perCorrect;
    if (isDone(course, r)) { xp += course.xp.complete; done++; doneSet.add(l.id); }
    if (r.n > 0 && r.c === r.n) perfect++;
  }
  const tracks = {};
  for (const t of course.tracks) tracks[t.id] = t.lessons.filter((l) => doneSet.has(l.id)).length;
  const badges = course.badges.filter((b) => {
    const r = b.rule;
    if (r.lessons != null) return done >= r.lessons;
    if (r.track) return tracks[r.track] === course.tracks.find((t) => t.id === r.track).lessons.length;
    if (r.perfect != null) return perfect >= r.perfect;
    return false;
  }).map((b) => b.id);
  let rank = course.ranks[0];
  for (const k of course.ranks) if (xp >= k.xp) rank = k;
  return { xp, done, total: L.length, perfect, doneSet, tracks, badges, rank };
}

const b64enc = (str) => { const bytes = new TextEncoder().encode(str); let bin = ""; for (const b of bytes) bin += String.fromCharCode(b); return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const b64dec = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; const bin = atob(s); return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))); };
/** Progress → a short text code "SA1-…" (base64url of compact JSON). */
export function encodeProgress(state) {
  const p = {};
  for (const [k, r] of Object.entries(state.p)) p[k] = [r.c, r.n, Math.round((r.t || 0) / 1000)];
  return "SA1-" + b64enc(JSON.stringify({ v: 1, p, l: state.last || "", n: state.name || "" }));
}
/** Code → sanitised state, or throws with a friendly message. */
export function decodeProgress(code, course) {
  const s = String(code).trim().replace(/\s+/g, "");
  if (!s.startsWith("SA1-")) throw new Error("That does not look like a Space Academy code (they start with SA1-).");
  let o;
  try { o = JSON.parse(b64dec(s.slice(4))); } catch (e) { throw new Error("That code is damaged: check that you copied all of it."); }
  if (!o || o.v !== 1 || typeof o.p !== "object") throw new Error("That code is from an unknown version.");
  const byId = new Map(allLessons(course).map((l) => [l.id, l]));
  const st = emptyState();
  for (const [k, r] of Object.entries(o.p)) {
    const l = byId.get(k);
    if (!l || !Array.isArray(r)) continue;
    const n = l.quiz.length, c = Math.round(+r[0]);
    if (!(c >= 0 && c <= n)) continue;
    st.p[k] = { c, n, t: Math.max(0, +r[2] || 0) * 1000 };
  }
  st.last = byId.has(o.l) ? o.l : "";
  st.name = typeof o.n === "string" ? o.n.slice(0, 60) : "";
  return st;
}
/** Merge two states, keeping the best score for every lesson. */
export function mergeStates(a, b) {
  const out = { v: 1, p: { ...a.p }, last: b.last || a.last, name: b.name || a.name };
  for (const [k, r] of Object.entries(b.p)) if (!out.p[k] || r.c > out.p[k].c) out.p[k] = r;
  return out;
}

/* ============================================================== 2. PAGE === */

if (typeof document !== "undefined") boot();

function boot() {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const reduce = !!(window.Codex && window.Codex.reducedMotion) || matchMedia("(prefers-reduced-motion: reduce)").matches;
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const COL = { flame: "#ff7a3d", ice: "#7cc8ff", sol: "#ffc24b", nebula: "#b18cff", aurora: "#4ef0b8", plasma: "#ff4f9a" };
  let uid = 0;

  const tex = (s) => {
    if (window.katex) { try { return window.katex.renderToString(s, { throwOnError: false }); } catch (e) { /* fall through */ } }
    return `<code>${esc(s)}</code>`;
  };
  const rich = (s) => String(s).split(/(\$[^$]+\$)/g).map((part) =>
    part.length > 2 && part[0] === "$" && part[part.length - 1] === "$" ? tex(part.slice(1, -1)) : esc(part).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")).join("");

  /* ---------------- state (localStorage wrapped: the page works without it) ---------------- */
  const KEY = "cosmic-library.academy.v1";
  let storageOK = true;
  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return emptyState();
      const o = JSON.parse(raw);
      if (!o || o.v !== 1 || typeof o.p !== "object") return emptyState();
      return { v: 1, p: o.p, last: o.last || "", name: o.name || "" };
    } catch (e) { storageOK = false; return emptyState(); }
  }
  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); storageOK = true; } catch (e) { storageOK = false; }
    const note = $("#storeNote"); if (note) note.hidden = storageOK;
  }
  let state = loadState();
  try { const k = "__ac_probe"; localStorage.setItem(k, "1"); localStorage.removeItem(k); } catch (e) { storageOK = false; }

  let COURSE = null, LESSONS = [], BYID = new Map(), EQ = {}, K = null;
  const runs = new Map();
  function eqRun(id) {
    if (!runs.has(id)) runs.set(id, compile(EQ[id], K));
    return runs.get(id);
  }
  /** Evaluate an Equation Atlas calculator with display-unit inputs. */
  function calc(id, set) {
    const eq = EQ[id];
    return evaluate(eq, eqRun(id), displayValues(eq, set), K).shown;
  }
  const outDef = (id, oid) => EQ[id].calc.outputs.find((o) => o.id === oid);
  const showOut = (id, oid, v) => { const f = formatOutput(outDef(id, oid), v, "text"); return `${f.num}${f.unit ? " " + f.unit : ""}`; };

  let justDone = null;          // lesson id completed in this visit (animate its star)
  let live = [];                // widgets to destroy on navigation

  Promise.all([
    fetch("data/academy.json").then((r) => { if (!r.ok) throw new Error("academy.json " + r.status); return r.json(); }),
    fetch("data/equations.json").then((r) => { if (!r.ok) throw new Error("equations.json " + r.status); return r.json(); })
  ]).then(([course, eqs]) => {
    COURSE = course;
    LESSONS = allLessons(course);
    BYID = new Map(LESSONS.map((l) => [l.id, l]));
    for (const e of eqs.equations) EQ[e.id] = e;
    K = makeScope(eqs.constants);
    // Keep only known lessons from storage
    for (const k of Object.keys(state.p)) if (!BYID.has(k)) delete state.p[k];
    setupStatic();
    route();
    addEventListener("hashchange", route);
  }).catch((err) => {
    console.error(err);
    $("#viewMap").insertAdjacentHTML("afterbegin", `<div class="shell"><p class="callout">The course data could not be loaded (${esc(err.message)}). If you opened this file directly, run a local server: <code>python3 -m http.server 8000 --directory site</code>.</p></div>`);
  });

  /* ---------------- routing ---------------- */
  function route() {
    live.forEach((w) => { try { w.destroy && w.destroy(); } catch (e) { /* ignore */ } });
    live = [];
    const h = decodeURIComponent(location.hash.slice(1));
    const vm = $("#viewMap"), vl = $("#viewLesson"), vc = $("#viewCert");
    if (h.startsWith("lesson/") && BYID.has(h.slice(7))) {
      vm.hidden = true; vc.hidden = true; vl.hidden = false;
      openLesson(BYID.get(h.slice(7)));
      return;
    }
    if (h === "certificate") {
      vm.hidden = true; vl.hidden = true; vc.hidden = false;
      renderCert();
      document.title = "Certificate · Space Academy · Cosmic Library";
      scrollTo(0, 0);
      return;
    }
    const wasHidden = vm.hidden;
    vm.hidden = false; vl.hidden = true; vc.hidden = true;
    document.title = "Space Academy · Cosmic Library";
    renderMapView();
    if (h && document.getElementById(h)) document.getElementById(h).scrollIntoView();
    else if (wasHidden) {
      // Coming back from a lesson: show the map with the star that just lit up
      const m = $(".ac-mapsec");
      if (justDone && m) m.scrollIntoView({ block: "start" }); else scrollTo(0, 0);
    }
  }

  /* ---------------- static bits (progress code, reset) ---------------- */
  function setupStatic() {
    $("#storeNote").hidden = storageOK;
    $("#copyCode").addEventListener("click", async () => {
      const ta = $("#codeOut");
      let ok = false;
      try { await navigator.clipboard.writeText(ta.value); ok = true; } catch (e) {
        try { ta.select(); ok = document.execCommand("copy"); } catch (e2) { ok = false; }
      }
      $("#copyMsg").textContent = ok ? "Copied." : "Select the code and copy it by hand.";
    });
    $("#loadCode").addEventListener("click", () => {
      const msg = $("#loadMsg");
      try {
        const st = decodeProgress($("#codeIn").value, COURSE);
        state = mergeStates(state, st);
        saveState();
        const s = stats(COURSE, state);
        msg.textContent = `Loaded: ${s.done} of ${s.total} lessons complete.`;
        $("#codeIn").value = "";
        renderMapView();
      } catch (e) { msg.textContent = e.message; }
    });
    $("#resetBtn").addEventListener("click", () => {
      if (!confirm("Erase all Space Academy progress in this browser? Copy your progress code first if you might want it back.")) return;
      state = emptyState(); saveState(); renderMapView();
    });
    // certificate controls
    const cn = $("#certName"), cd = $("#certDate");
    cn.addEventListener("input", () => { state.name = cn.value.slice(0, 60); saveState(); fillCert(); });
    cd.addEventListener("input", fillCert);
    $("#printBtn").addEventListener("click", () => print());
    // reading progress bar on lessons
    addEventListener("scroll", () => {
      if ($("#viewLesson").hidden) return;
      const a = $("#lesson"); const r = a.getBoundingClientRect();
      const p = clamp((-r.top + innerHeight * 0.3) / Math.max(1, r.height - innerHeight * 0.5), 0, 1);
      $("#readFill").style.transform = `scaleX(${p})`;
    }, { passive: true });
  }

  /* ---------------- map view ---------------- */
  function nextLesson() {
    const s = stats(COURSE, state);
    if (s.done === s.total) return null;
    const last = BYID.get(state.last);
    if (last && !s.doneSet.has(last.id)) return last;
    const start = last ? LESSONS.indexOf(last) : -1;
    for (let k = 1; k <= LESSONS.length; k++) {
      const l = LESSONS[(start + k + LESSONS.length) % LESSONS.length];
      if (!s.doneSet.has(l.id)) return l;
    }
    return null;
  }

  function renderMapView() {
    const s = stats(COURSE, state);
    $("#stLessons").textContent = s.done;
    $("#stXp").textContent = s.xp.toLocaleString("en-US");
    $("#stRank").textContent = s.rank.name;
    $("#stBadges").textContent = s.badges.length;
    const nx = nextLesson(), cb = $("#continueBtn");
    if (!nx) { cb.href = "#certificate"; cb.textContent = "View your certificate"; }
    else if (!Object.keys(state.p).length && !state.last) { cb.href = "#lesson/" + nx.id; cb.textContent = `Start: ${nx.num} ${nx.title}`; }
    else { cb.href = "#lesson/" + nx.id; cb.textContent = `Continue: ${nx.num} ${nx.title}`; }
    renderStarMap(s, nx);
    renderTracks(s, nx);
    renderBadges(s);
    $("#codeOut").value = encodeProgress(state);
  }

  // Deterministic pseudo-random numbers for the background stars
  function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }

  function renderStarMap(s, nx) {
    const svg = $("#starMap");
    const R = rng(7);
    let bg = "";
    for (let i = 0; i < 170; i++) {
      const x = R() * 1000, y = R() * 640, r = 0.4 + R() * R() * 1.4, o = 0.15 + R() * 0.45;
      bg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(2)}" fill="#cfe0ff" opacity="${o.toFixed(2)}"/>`;
    }
    let bridges = "", lines = "", stars = "", labels = "";
    COURSE.tracks.forEach((t, ti) => {
      const c = COL[t.color];
      const L = t.lessons;
      if (ti > 0) {
        const a = COURSE.tracks[ti - 1].lessons.at(-1).star, b = L[0].star;
        bridges += `<line class="ac-bridge" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`;
      }
      for (let i = 0; i < L.length - 1; i++) {
        const a = L[i].star, b = L[i + 1].star;
        const lit = s.doneSet.has(L[i].id) && s.doneSet.has(L[i + 1].id);
        const fresh = lit && (justDone === L[i].id || justDone === L[i + 1].id);
        lines += `<line class="ac-seg-base" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c}"/>` +
          `<line class="ac-seg${lit && !fresh ? " lit" : ""}${fresh ? " fresh" : ""}" pathLength="1" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${c}"/>`;
      }
      labels += `<text class="ac-tlabel" x="${t.label[0]}" y="${t.label[1]}" text-anchor="${t.label[2] || "start"}" fill="${c}">${t.n} · ${esc(t.title.toUpperCase())}</text>`;
      L.forEach((l, li) => {
        const L2 = BYID.get(l.id);
        const done = s.doneSet.has(l.id), rec = state.p[l.id];
        const isNext = nx && nx.id === l.id;
        const status = done ? `completed, best ${rec.c} of ${rec.n}` : rec ? `started, best ${rec.c} of ${rec.n}` : "not started";
        stars += `<g class="ac-star${done ? " done" : ""}${isNext ? " next" : ""}${justDone === l.id ? " fresh" : ""}" data-id="${l.id}" tabindex="0" role="link" style="--c:${c}"
            aria-label="Lesson ${L2.num}: ${esc(l.title)} (${status})" transform="translate(${l.star[0]} ${l.star[1]})">
            <circle class="hit" r="26"/>
            <circle class="ring" r="15"/>
            <circle class="halo" r="12"/>
            <path class="core" d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z"/>
            <text class="num" y="27">${L2.num}</text>
          </g>`;
      });
    });
    svg.innerHTML = `<defs><radialGradient id="acGlow"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
      <g class="ac-bg" aria-hidden="true">${bg}</g><g aria-hidden="true">${bridges}${lines}</g><g aria-hidden="true">${labels}</g><g>${stars}</g>`;
    // animate fresh constellation lines
    if (justDone) {
      const fresh = $$(".ac-seg.fresh", svg);
      requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(() => fresh.forEach((l) => l.classList.add("lit")), reduce ? 0 : 450)));
      setTimeout(() => { justDone = null; }, 100);
    }
    const tip = $("#mapTip"), wrap = $("#mapWrap");
    const sc = $("#mapScroll");
    if (sc.scrollWidth > sc.clientWidth + 4) {
      const focusId = justDone || (nx && nx.id);
      const L0 = focusId && BYID.get(focusId);
      if (L0) sc.scrollLeft = L0.star[0] / 1000 * sc.scrollWidth - sc.clientWidth / 2;
    }
    const gs = $$(".ac-star", svg);
    function showTip(g) {
      const l = BYID.get(g.dataset.id), rec = state.p[l.id], done = s.doneSet.has(l.id);
      tip.innerHTML = `<span class="k" style="color:${COL[l.track.color]}">Lesson ${l.num} · ${l.minutes} min</span><strong>${esc(l.title)}</strong><span class="s">${done ? `✓ Complete · best ${rec.c}/${rec.n}` : rec ? `Best so far ${rec.c}/${rec.n}` : "Not started"}</span>`;
      tip.hidden = false;
      const wr = wrap.getBoundingClientRect(), gr = g.querySelector(".halo").getBoundingClientRect();
      const x = gr.left + gr.width / 2 - wr.left, y = gr.top - wr.top;
      const tw = tip.offsetWidth;
      tip.style.left = clamp(x - tw / 2, 4, wr.width - tw - 4) + "px";
      tip.style.top = Math.max(4, y - tip.offsetHeight - 10) + "px";
    }
    gs.forEach((g, i) => {
      const open = () => { location.hash = "lesson/" + g.dataset.id; };
      g.addEventListener("click", open);
      g.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); }
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); gs[(i + 1) % gs.length].focus(); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); gs[(i - 1 + gs.length) % gs.length].focus(); }
      });
      g.addEventListener("pointerenter", () => showTip(g));
      g.addEventListener("pointerleave", () => { tip.hidden = true; });
      g.addEventListener("focus", () => {
        // keep the focused star visible when the map scrolls sideways (phones)
        const sc = $("#mapScroll"), r = g.getBoundingClientRect(), sr = sc.getBoundingClientRect();
        if (r.left < sr.left + 20 || r.right > sr.right - 20) sc.scrollLeft += r.left - sr.left - sr.width / 2;
        showTip(g);
      });
      g.addEventListener("blur", () => { tip.hidden = true; });
    });
  }

  function renderTracks(s, nx) {
    $("#trackList").innerHTML = COURSE.tracks.map((t) => {
      const c = COL[t.color], n = s.tracks[t.id], badge = COURSE.badges.find((b) => b.rule.track === t.id);
      return `<div class="card ac-track" style="--c:${c}">
        <div class="ac-trackhead"><span class="chip ${t.color}">Track ${t.n}</span><span class="ac-trackbadge${s.badges.includes(badge.id) ? " got" : ""}">${badgeIcon(badge.icon)}${esc(badge.name)}</span></div>
        <h3>${esc(t.title)}</h3><p>${esc(t.blurb)}</p>
        <div class="ac-bar" role="progressbar" aria-label="${esc(t.title)} progress" aria-valuemin="0" aria-valuemax="${t.lessons.length}" aria-valuenow="${n}"><span style="width:${(n / t.lessons.length) * 100}%"></span></div>
        <ol class="ac-lessonlist">${t.lessons.map((l) => {
          const L = BYID.get(l.id), rec = state.p[l.id], done = s.doneSet.has(l.id);
          return `<li><a href="#lesson/${l.id}" class="${done ? "done" : ""}${nx && nx.id === l.id ? " next" : ""}">
            <span class="n">${L.num}</span><span class="t">${esc(l.title)}</span>
            <span class="st">${done ? `<span class="ok" aria-label="complete">✓</span>` : rec ? `${rec.c}/${rec.n}` : `${l.minutes} min`}</span></a></li>`;
        }).join("")}</ol></div>`;
    }).join("");
  }

  function badgeIcon(k) {
    const P = {
      rocket: '<path d="M12 2c3 3 4 6 4 10l-1.5 5h-5L8 12c0-4 1-7 4-10zM9.5 17l-2 4M14.5 17l2 4M12 18v3"/><circle cx="12" cy="9" r="1.6"/>',
      orbit: '<ellipse cx="12" cy="12" rx="10" ry="4.5" transform="rotate(-25 12 12)"/><circle cx="12" cy="12" r="3.2"/><circle cx="20" cy="7.6" r="1.3" fill="currentColor"/>',
      slingshot: '<circle cx="15" cy="12" r="4"/><path d="M2 20C8 18 10 15 11 12s2-7 9-9"/><path d="M17 3h3v3"/>',
      telescope: '<path d="M3 11l14-6 2 5-14 6zM9 14l-3 7M12 13l3 8M19 6l2-1"/>',
      satellite: '<rect x="9" y="9" width="6" height="6" rx="1"/><path d="M2 5l5 5M7 2L2 7M17 22l5-5M22 17l-5-5M9 9L6 6M15 15l3 3"/>',
      target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/>',
      star: '<path d="M12 2l2.9 6.3 6.9.8-5.1 4.7 1.4 6.8L12 17.2 5.9 20.6l1.4-6.8L2.2 9.1l6.9-.8z"/>'
    };
    return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${P[k] || P.star}</svg>`;
  }

  function renderBadges(s) {
    $("#badgeGrid").innerHTML = COURSE.badges.map((b) => {
      const got = s.badges.includes(b.id);
      const tr = b.rule.track && COURSE.tracks.find((t) => t.id === b.rule.track);
      const c = tr ? COL[tr.color] : b.id === "mission-specialist" ? COL.sol : b.id === "sharpshooter" ? COL.aurora : COL.flame;
      return `<div class="ac-badge${got ? " got" : ""}" style="--c:${c}">
        <div class="ac-patch">${badgeIcon(b.icon)}</div>
        <div><strong>${esc(b.name)}</strong><span>${esc(b.desc)}</span><em>${got ? "Earned" : "Locked"}</em></div></div>`;
    }).join("");
  }

  /* ---------------- lesson view ---------------- */
  function openLesson(l) {
    state.last = l.id; saveState();
    const t = l.track, c = COL[t.color];
    const s = stats(COURSE, state);
    const idx = LESSONS.indexOf(l), prev = LESSONS[idx - 1], next = LESSONS[idx + 1];
    document.title = `${l.num} ${l.title} · Space Academy · Cosmic Library`;
    const art = $("#lesson");
    art.style.setProperty("--c", c);
    art.innerHTML = `
      <nav class="ac-crumbs" aria-label="Breadcrumb"><a href="#">← Course map</a><span>Track ${t.n} · ${esc(t.title)}</span></nav>
      <header class="ac-lhead">
        <div class="ac-dots" role="list" aria-label="Lessons in this track">${t.lessons.map((x) => {
          const L = BYID.get(x.id), d = s.doneSet.has(x.id);
          return `<a role="listitem" href="#lesson/${x.id}" class="${d ? "done" : ""}${x.id === l.id ? " cur" : ""}" aria-label="Lesson ${L.num}: ${esc(x.title)}${d ? " (complete)" : ""}"${x.id === l.id ? ' aria-current="page"' : ""}></a>`;
        }).join("")}</div>
        <p class="ac-kicker"><span class="chip ${t.color}">Lesson ${l.num}</span><span class="muted">${l.minutes} min · ${l.quiz.length} questions</span>${s.doneSet.has(l.id) ? '<span class="chip aurora">✓ Complete</span>' : ""}</p>
        <h1 id="lessonTitle" tabindex="-1">${esc(l.title)}</h1>
      </header>
      <div class="ac-read">${l.body.map((p) => `<p>${rich(p)}</p>`).join("")}</div>
      <section class="ac-try" aria-labelledby="tryH">
        <h2 class="ac-h" id="tryH"><span>Try it</span></h2>
        <div class="card ac-widget" id="widget"></div>
        <p class="hint ac-cap">${rich(l.widget.caption || "")}</p>
      </section>
      <section class="ac-deeper" aria-labelledby="deepH">
        <h2 class="ac-h" id="deepH"><span>Go deeper</span></h2>
        <div class="ac-links">${l.links.map((k) => `<a class="card spot ac-link" href="${esc(k.href)}"><span>${esc(k.label)}</span><span class="go" aria-hidden="true">→</span></a>`).join("")}</div>
      </section>
      <section class="ac-check" id="check" aria-labelledby="checkH">
        <h2 class="ac-h" id="checkH"><span>Check yourself</span><span class="ac-qdots" id="qdots" aria-hidden="true"></span></h2>
        <p class="muted ac-checknote">Get ${Math.ceil(COURSE.passMark * l.quiz.length)} of ${l.quiz.length} right to complete the lesson. Answers are checked instantly.</p>
        <div id="quiz"></div>
        <div id="result" class="ac-result" aria-live="polite"></div>
      </section>
      <nav class="ac-pn" aria-label="Lesson navigation">
        ${prev ? `<a class="btn" href="#lesson/${prev.id}">← ${prev.num} ${esc(prev.title)}</a>` : `<a class="btn" href="#">← Course map</a>`}
        ${next ? `<a class="btn" href="#lesson/${next.id}">${next.num} ${esc(next.title)} →</a>` : `<a class="btn" href="#certificate">Certificate →</a>`}
      </nav>`;
    const w = mountWidget(l.widget, $("#widget"));
    if (w) live.push(w);
    renderQuiz(l);
    scrollTo(0, 0);
    $("#readFill").style.transform = "scaleX(0)";
    $("#lessonTitle").focus({ preventScroll: true });
  }

  function shuffle(a) { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; }

  function renderQuiz(l) {
    const box = $("#quiz"), res = $("#result"), dots = $("#qdots");
    res.innerHTML = "";
    const answers = new Array(l.quiz.length).fill(null);
    dots.innerHTML = l.quiz.map(() => "<i></i>").join("");
    box.innerHTML = l.quiz.map((q, i) => {
      const head = `<p class="ac-qq"><span class="ac-qn">${i + 1}</span><span>${rich(q.q)}</span></p>`;
      if (q.type === "mc") {
        const order = shuffle(q.options.map((o, k) => k));
        return `<div class="ac-q" data-i="${i}">${head}<div class="ac-opts" role="group" aria-label="Question ${i + 1} answers">${order.map((k) =>
          `<button type="button" class="ac-opt" data-k="${k}"><span class="mk" aria-hidden="true"></span><span>${rich(q.options[k].t)}</span></button>`).join("")}</div><div class="ac-fb" hidden></div></div>`;
      }
      const iid = "num" + (++uid);
      return `<div class="ac-q" data-i="${i}">${head}<form class="ac-num" novalidate>
          <label class="sr-only" for="${iid}">Your answer${q.unit ? " in " + esc(q.unit) : ""}</label>
          <input id="${iid}" type="text" inputmode="decimal" autocomplete="off" placeholder="Your answer">
          ${q.unit ? `<span class="u">${esc(q.unit)}</span>` : ""}
          <button class="btn small primary" type="submit">Check</button></form><div class="ac-fb" hidden></div></div>`;
    }).join("");

    function feedback(i, ok, html) {
      answers[i] = ok;
      const qd = box.querySelector(`.ac-q[data-i="${i}"]`), fb = qd.querySelector(".ac-fb");
      qd.classList.add(ok ? "right" : "wrong");
      fb.hidden = false;
      fb.innerHTML = `<strong>${ok ? "Correct." : "Not quite."}</strong> ${html}`;
      dots.children[i].className = ok ? "ok" : "no";
      if (answers.every((a) => a !== null)) finish();
    }
    box.querySelectorAll(".ac-q").forEach((qd) => {
      const i = +qd.dataset.i, q = l.quiz[i];
      if (q.type === "mc") {
        qd.querySelectorAll(".ac-opt").forEach((b) => b.addEventListener("click", () => {
          if (answers[i] !== null) return;
          const k = +b.dataset.k, ok = !!q.options[k].ok;
          qd.querySelectorAll(".ac-opt").forEach((o) => {
            o.disabled = true;
            if (q.options[+o.dataset.k].ok) o.classList.add("correct");
          });
          b.classList.add(ok ? "correct" : "chosen-wrong");
          b.setAttribute("aria-pressed", "true");
          feedback(i, ok, rich(q.explain));
        }));
      } else {
        const form = qd.querySelector("form"), inp = form.querySelector("input");
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          if (answers[i] !== null) return;
          const g = gradeNumeric(inp.value, q);
          const fb = qd.querySelector(".ac-fb");
          if (g === null) { fb.hidden = false; fb.innerHTML = "Type a number, for example <code>7.5</code> or <code>2500</code>."; return; }
          inp.disabled = true; form.querySelector("button").disabled = true;
          const tolTxt = q.tol > 0 ? ` (anything within ±${fmt(q.tol, 3)} counts)` : "";
          feedback(i, g, `The answer is <strong>${fmt(q.answer, 4)}${q.unit ? " " + esc(q.unit) : ""}</strong>${tolTxt}. ${rich(q.explain)}`);
        });
      }
    });

    function finish() {
      const c = answers.filter(Boolean).length, n = answers.length;
      const before = stats(COURSE, state);
      const wasDone = before.doneSet.has(l.id);
      const prevRec = state.p[l.id];
      if (!prevRec || c > prevRec.c) state.p[l.id] = { c, n, t: Date.now() };
      saveState();
      const after = stats(COURSE, state);
      const passed = c / n >= COURSE.passMark - 1e-9;
      const gained = after.xp - before.xp;
      const newBadges = after.badges.filter((b) => !before.badges.includes(b));
      const idx = LESSONS.indexOf(l), next = LESSONS[idx + 1];
      if (passed && !wasDone) justDone = l.id;
      res.innerHTML = `
        <div class="ac-res ${passed ? "pass" : "fail"}">
          ${passed ? rocketSVG() : ""}
          <div class="ac-resbody">
            <p class="ac-score"><strong>${c} / ${n}</strong> ${passed ? (wasDone ? "Complete (again)." : "Lesson complete!") : `You need ${Math.ceil(COURSE.passMark * n)} to complete it.`}</p>
            <p class="muted">${gained > 0 ? `+${gained} XP · ` : ""}${after.xp.toLocaleString("en-US")} XP total · ${after.done} of ${after.total} lessons</p>
            ${newBadges.map((id) => { const b = COURSE.badges.find((x) => x.id === id); return `<p class="ac-newbadge">${badgeIcon(b.icon)} Badge earned: <strong>${esc(b.name)}</strong></p>`; }).join("")}
            <div class="row">
              ${passed ? (next ? `<a class="btn primary" href="#lesson/${next.id}">Next: ${next.num} ${esc(next.title)} →</a>` : `<a class="btn primary" href="#certificate">See your certificate →</a>`) : `<button class="btn primary" type="button" id="retry">Try again</button>`}
              <a class="btn" href="#">Back to the map</a>
              ${passed ? `<button class="btn small" type="button" id="retry">Retry the check</button>` : ""}
            </div>
          </div>
        </div>`;
      $("#retry", res).addEventListener("click", () => { renderQuiz(l); $("#check").scrollIntoView({ behavior: reduce ? "auto" : "smooth" }); });
      if (passed) {
        const rk = res.querySelector(".ac-rocket");
        if (rk && !reduce) requestAnimationFrame(() => rk.classList.add("go"));
        const kick = res.querySelector(".chip") ; void kick;
        const head = $(".ac-kicker");
        if (head && !head.querySelector(".chip.aurora")) head.insertAdjacentHTML("beforeend", '<span class="chip aurora">✓ Complete</span>');
        const d = $(`.ac-dots a.cur`); if (d) d.classList.add("done");
      }
      newBadges.forEach((id, k) => { const b = COURSE.badges.find((x) => x.id === id); setTimeout(() => toast(`${badgeIcon(b.icon)}<span>Badge earned: <strong>${esc(b.name)}</strong></span>`), 900 + k * 700); });
      if (after.done === after.total && before.done < after.total) setTimeout(() => toast(`${badgeIcon("star")}<span>All 20 lessons done. <a href="#certificate">Claim your certificate →</a></span>`, 9000), 1600);
    }
  }

  function rocketSVG() {
    return `<div class="ac-launchpad" aria-hidden="true"><svg class="ac-rocket" viewBox="0 0 40 120">
      <g class="ship"><path d="M20 4c7 7 9 16 9 28v26H11V32c0-12 2-21 9-28z" fill="#e9edff"/><circle cx="20" cy="30" r="4.5" fill="#7cc8ff" stroke="#04050a" stroke-width="1.5"/>
      <path d="M11 44l-7 14v6l7-4zM29 44l7 14v6l-7-4z" fill="#ff7a3d"/><rect x="15" y="58" width="10" height="5" fill="#8f98bd"/>
      <path class="flame" d="M14 63c0 12 3 20 6 28 3-8 6-16 6-28z" fill="url(#acFl)"/></g>
      <defs><linearGradient id="acFl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c2"/><stop offset=".4" stop-color="#ffc24b"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></linearGradient></defs>
      </svg><span class="smoke"></span><span class="smoke s2"></span><span class="smoke s3"></span></div>`;
  }

  function toast(html, ms = 5000) {
    const t = document.createElement("div");
    t.className = "ac-toast"; t.innerHTML = html;
    $("#toasts").appendChild(t);
    requestAnimationFrame(() => t.classList.add("in"));
    setTimeout(() => { t.classList.remove("in"); setTimeout(() => t.remove(), 400); }, ms);
  }

  /* ---------------- certificate ---------------- */
  function renderCert() {
    const s = stats(COURSE, state);
    const ok = s.done === s.total;
    $("#certName").value = state.name || "";
    if (!$("#certDate").value) $("#certDate").value = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    $("#certLede").innerHTML = ok
      ? "All twenty lessons complete. Type your name the way you want it printed, then print it or save it as a PDF."
      : `Complete all twenty lessons to unlock it. You have finished <strong>${s.done}</strong> so far. <a href="${nextLesson() ? "#lesson/" + nextLesson().id : "#"}">Carry on →</a>`;
    $("#certCtl").hidden = !ok;
    $("#viewCert").classList.toggle("locked", !ok);
    fillCert();
  }
  function fillCert() {
    const s = stats(COURSE, state), ok = s.done === s.total;
    const name = ($("#certName").value || "").trim();
    const date = ($("#certDate").value || "").trim();
    // miniature of the star map: all constellations lit
    let mini = "";
    COURSE.tracks.forEach((t) => {
      const c = COL[t.color];
      mini += `<polyline points="${t.lessons.map((l) => l.star.join(",")).join(" ")}" fill="none" stroke="${c}" stroke-width="3" stroke-linejoin="round" opacity=".85"/>`;
      mini += t.lessons.map((l) => `<circle cx="${l.star[0]}" cy="${l.star[1]}" r="8" fill="${c}"/><circle cx="${l.star[0]}" cy="${l.star[1]}" r="3.5" fill="#fff"/>`).join("");
    });
    $("#cert").innerHTML = `
      <div class="ac-certin">
        <svg class="ac-certmap" viewBox="0 0 1000 640" aria-hidden="true">${mini}</svg>
        <p class="ac-certkind">Cosmic Library completion certificate</p>
        <h2 class="ac-certtitle">Mission Specialist</h2>
        <p class="ac-certsub">This certifies that</p>
        <p class="ac-certname">${name ? esc(name) : '<span class="ph">Your name</span>'}</p>
        <p class="ac-certtext">completed all twenty lessons of <strong>Space Academy</strong>, a free self-paced course in spaceflight and space science, across four tracks:</p>
        <p class="ac-certtracks">${COURSE.tracks.map((t) => `<span style="--c:${COL[t.color]}">${esc(t.title)}</span>`).join("")}</p>
        <div class="ac-certfoot">
          <div><span class="k">Date</span><span class="v">${esc(date)}</span></div>
          <div class="seal" aria-hidden="true">${badgeIcon("star")}</div>
          <div><span class="k">Experience</span><span class="v">${s.xp.toLocaleString("en-US")} XP · ${s.badges.length} badges</span></div>
        </div>
        <p class="ac-certfine">Self-issued from the learner's own progress in the Cosmic Library open-source website. This is not an academic credential and is not endorsed by, or affiliated with, NASA or any space agency, school or company.</p>
        ${ok ? "" : '<div class="ac-certlock"><span>Locked · preview</span></div>'}
      </div>`;
  }

  /* ================================================================ WIDGETS */

  function mountWidget(cfg, host) {
    const make = {
      calc: wCalc, cannon: wCannon, rocket: wRocket, staging: wStaging, maxq: wMaxQ, landing: wLanding,
      kepler: wKepler, porkchop: wPorkchop, flyby: wFlyby, blackbody: wBlackbody, airy: wAiry, transit: wTransit,
      link: wLink, order: wOrder
    }[cfg.type];
    if (!make) { host.textContent = "Unknown widget " + cfg.type; return null; }
    try { return make(cfg, host) || null; } catch (e) { console.error(e); host.innerHTML = `<p class="callout">This widget failed to start: ${esc(e.message)}</p>`; return null; }
  }

  /** Range slider with a live value label; log sliders map 0..1000 geometrically. */
  function slider({ label, unit = "", min, max, value, log = false, step, digits = 3, format }) {
    const wrap = document.createElement("div");
    wrap.className = "field ac-field";
    const id = "sl" + (++uid);
    wrap.innerHTML = `<label for="${id}"><span>${esc(label)}</span><output for="${id}"></output></label><input type="range" id="${id}">`;
    const input = wrap.querySelector("input"), out = wrap.querySelector("output");
    const N = 1000;
    if (log) { input.min = 0; input.max = N; input.step = 1; } else { input.min = min; input.max = max; input.step = step ?? (max - min) / 400; }
    const toVal = (p) => log ? min * Math.pow(max / min, p / N) : +p;
    const toPos = (v) => log ? N * Math.log(v / min) / Math.log(max / min) : v;
    let exact = value;
    const api = {
      el: wrap, input,
      get value() { return exact; },
      set(v) { exact = clamp(v, min, max); input.value = toPos(exact); paint(); },
      onInput: null
    };
    function paint() {
      const f = (input.value - input.min) / (input.max - input.min) * 100;
      input.style.setProperty("--fill", f + "%");
      out.textContent = (format ? format(exact) : fmt(exact, digits)) + (unit ? " " + unit : "");
      input.setAttribute("aria-valuetext", out.textContent);
    }
    input.addEventListener("input", () => { exact = toVal(+input.value); paint(); api.onInput && api.onInput(exact); });
    api.set(value);
    return api;
  }
  function seg(options, value, onChange, label) {
    const d = document.createElement("div");
    d.className = "seg ac-seg"; d.setAttribute("role", "group"); d.setAttribute("aria-label", label);
    d.innerHTML = options.map((o) => `<button type="button" data-v="${esc(o.v)}" aria-pressed="${String(o.v) === String(value)}">${esc(o.label)}</button>`).join("");
    d.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      d.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      onChange(b.dataset.v);
    });
    d.setValue = (v) => d.querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.v === String(v))));
    return d;
  }
  /** HiDPI canvas that redraws on width changes. draw(ctx, w, h). */
  function canvas(host, aspect, label, draw, { maxH = 520 } = {}) {
    const c = document.createElement("canvas");
    c.setAttribute("role", "img"); c.setAttribute("aria-label", label);
    c.className = "ac-cv";
    host.appendChild(c);
    const ctx = c.getContext("2d");
    let W = 0, H = 0;
    function size() {
      const w = Math.max(200, Math.round(c.parentElement.clientWidth || 320));
      if (w === W) return false;
      const h = Math.min(maxH, Math.round(w / aspect));
      const d = Math.min(devicePixelRatio || 1, 2);
      c.width = Math.round(w * d); c.height = Math.round(h * d);
      c.style.width = w + "px"; c.style.height = h + "px";
      ctx.setTransform(d, 0, 0, d, 0, 0);
      W = w; H = h;
      return true;
    }
    size();
    const ro = new ResizeObserver(() => { if (size()) draw(ctx, W, H); });
    ro.observe(c.parentElement);
    return { c, ctx, get W() { return W; }, get H() { return H; }, redraw() { draw(ctx, W, H); }, destroy() { ro.disconnect(); } };
  }
  function readouts(items) {
    return `<div class="readouts ac-ro">${items.map(([k, v, id]) => `<div class="readout"><div class="k">${k}</div><div class="v"${id ? ` id="${id}"` : ""}>${v}</div></div>`).join("")}</div>`;
  }
  function loop(fn) {
    let raf = 0, last = performance.now(), on = true;
    const step = (t) => { if (!on) return; const dt = clamp((t - last) / 1000, 0, 0.05); last = t; if (!document.hidden) fn(dt, t / 1000); raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => { on = false; cancelAnimationFrame(raf); };
  }
  function arrow(ctx, x0, y0, x1, y1, col, w = 2) {
    const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), hl = Math.min(9, L * 0.4);
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1 - Math.cos(a) * hl * 0.6, y1 - Math.sin(a) * hl * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - hl * Math.cos(a - 0.4), y1 - hl * Math.sin(a - 0.4));
    ctx.lineTo(x1 - hl * Math.cos(a + 0.4), y1 - hl * Math.sin(a + 0.4)); ctx.closePath(); ctx.fill();
  }
  const FONT = (px, w = 500) => `${w} ${px}px "JetBrains Mono", ui-monospace, monospace`;

  /* ---- 1. calc: sliders → Equation Atlas calculator ---- */
  function wCalc(cfg, host) {
    const eq = EQ[cfg.eq];
    const vals = displayValues(eq, cfg.fixed || {});
    host.innerHTML = `<div class="ac-eqline"><span class="ac-eqname">${esc(eq.title)}</span><span class="ac-eqtex">${tex(eq.latex)}</span></div>
      <div class="ac-calc"><div class="ac-ctl"></div><div class="ac-outcol"><div class="ac-diag"></div><div class="ac-outs"></div><p class="ac-fate" hidden></p></div></div>`;
    const ctl = $(".ac-ctl", host), outs = $(".ac-outs", host), fate = $(".ac-fate", host), diagHost = $(".ac-diag", host);
    const sl = {};
    let presetSeg = null;
    if (cfg.presets) {
      presetSeg = seg(cfg.presets.map((p, i) => ({ v: i, label: p.label })), -1, (i) => {
        Object.assign(vals, cfg.presets[+i].set);
        for (const [id, s] of Object.entries(sl)) s.set(vals[id]);
        update();
      }, "Presets");
      ctl.appendChild(presetSeg);
    }
    for (const id of cfg.sliders) {
      const inp = eq.calc.inputs.find((x) => x.id === id);
      const o = (cfg.slider && cfg.slider[id]) || {};
      const s = slider({ label: inp.label, unit: inp.unit, min: o.min ?? inp.min, max: o.max ?? inp.max, value: vals[id], log: o.log ?? !!inp.log, step: inp.step });
      s.onInput = (v) => { vals[id] = v; presetSeg && presetSeg.setValue(-1); update(); };
      sl[id] = s; ctl.appendChild(s.el);
    }
    let diag = null;
    if (cfg.diagram === "hohmann") diag = canvas(diagHost, 1.6, "Diagram of the starting orbit, target orbit and transfer ellipse", drawHohmann, { maxH: 240 });
    else diagHost.remove();
    function drawHohmann(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      const r1 = vals.r1, r2 = vals.r2, big = Math.max(r1, r2), small = Math.min(r1, r2);
      const cx = W / 2, cy = H / 2, S = (Math.min(W, H) / 2 - 16) / big;
      const a = (r1 + r2) / 2, c = a - small, b = Math.sqrt(a * a - c * c);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(124,200,255,.55)"; ctx.beginPath(); ctx.arc(cx, cy, r1 * S, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "rgba(177,140,255,.55)"; ctx.beginPath(); ctx.arc(cx, cy, r2 * S, 0, TAU); ctx.stroke();
      // transfer half-ellipse: periapsis at the smaller radius on the right
      const dir = r2 >= r1 ? 1 : -1;
      ctx.strokeStyle = COL.sol; ctx.setLineDash([6, 5]); ctx.lineWidth = 2;
      ctx.beginPath();
      for (let k = 0; k <= 64; k++) {
        const E = Math.PI * k / 64;
        const x = (a * Math.cos(E) - c) * S, y = -b * Math.sin(E) * S;
        k ? ctx.lineTo(cx + x * dir, cy + y) : ctx.moveTo(cx + x * dir, cy + y);
      }
      ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ffe6a8"; ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, Math.min(10, 6371 * S)), 0, TAU); ctx.fill();
      const p1 = [cx + small * S * dir, cy], p2 = [cx - big * S * dir, cy];
      const burn = (p, t) => { ctx.fillStyle = COL.flame; ctx.beginPath(); ctx.arc(p[0], p[1], 5, 0, TAU); ctx.fill(); ctx.font = FONT(11); ctx.fillStyle = "#e9edff"; ctx.fillText(t, p[0] + (p[0] > cx ? -14 : 8), p[1] - 10); };
      burn(r2 >= r1 ? p1 : p2, "1"); burn(r2 >= r1 ? p2 : p1, "2");
    }
    function update() {
      const r = calc(cfg.eq, vals);
      outs.innerHTML = readouts(cfg.show.map((id) => [esc(outDef(cfg.eq, id).label), esc(showOut(cfg.eq, id, r[id]))]));
      if (cfg.fates) {
        const v = vals[cfg.sliders[0]];
        const f = cfg.fates.find((x) => v <= x.max);
        fate.hidden = !f; if (f) fate.textContent = f.text;
      }
      diag && diag.redraw();
    }
    update();
    return { destroy() { diag && diag.destroy(); } };
  }

  /* ---- 2. cannon: Newton's mountain, drag to set speed ---- */
  function wCannon(cfg, host) {
    host.innerHTML = `<div class="ac-cvwrap"></div><div class="ac-2col ac-below"><div class="ac-ctl"></div><div class="ac-outs"></div></div><p class="ac-verdict"></p>`;
    const alt = cfg.alt;
    let v = cfg.v, res = null, anim = 0;
    const s = slider({ label: "Launch speed", unit: "km/s", min: 3, max: 12, value: v, step: 0.01, format: (x) => x.toFixed(2) });
    $(".ac-ctl", host).appendChild(s.el);
    const view = canvas($(".ac-cvwrap", host), 1.55, "Newton's cannonball fired sideways from a 400-kilometre mountain", draw, { maxH: 440 });
    function compute() { res = cannon(v, alt); anim = 0; }
    function draw(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      if (!res) return;
      const R = EARTH.R, cx = W / 2, cy = H * 0.56;
      const S = Math.min(W, H) * 0.27 / R;
      // Earth
      const g = ctx.createRadialGradient(cx - R * S * 0.3, cy - R * S * 0.4, R * S * 0.2, cx, cy, R * S);
      g.addColorStop(0, "#3a74c9"); g.addColorStop(1, "#0c2350");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, R * S, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(124,200,255,.35)"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, (R + 100) * S, 0, TAU); ctx.stroke();
      // mountain to 400 km (to scale)
      const top = cy - (R + alt) * S;
      ctx.fillStyle = "#6b5a4a"; ctx.beginPath(); ctx.moveTo(cx - 10, cy - R * S + 2); ctx.lineTo(cx, top); ctx.lineTo(cx + 10, cy - R * S + 2); ctx.closePath(); ctx.fill();
      // reference: the circular orbit at the mountain top
      ctx.strokeStyle = "rgba(78,240,184,.22)"; ctx.setLineDash([3, 6]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(cx, cy, (R + alt) * S, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      // path
      const pts = res.pts;
      const col = res.outcome === "crash" ? COL.flame : res.outcome === "escape" ? COL.nebula : COL.aurora;
      ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.shadowColor = col; ctx.shadowBlur = 8;
      ctx.beginPath();
      const n = Math.max(2, Math.floor(pts.length * Math.min(1, anim)));
      for (let i = 0; i < n; i++) { const X = cx + pts[i][0] * S, Y = cy - pts[i][1] * S; i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke(); ctx.shadowBlur = 0;
      const p = pts[n - 1];
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx + p[0] * S, cy - p[1] * S, 4, 0, TAU); ctx.fill();
      // launch arrow (drag handle)
      const L = 18 + (v - 3) * 9;
      arrow(ctx, cx, top, cx + L, top, COL.sol, 2.5);
      ctx.fillStyle = COL.sol; ctx.beginPath(); ctx.arc(cx + L, top, 6, 0, TAU); ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1;
      ctx.font = FONT(11); ctx.fillStyle = "#c3cae6"; ctx.fillText(`${v.toFixed(2)} km/s →`, cx + L + 10, top + 4);
      ctx.fillStyle = "#8f98bd"; ctx.fillText("Earth, to scale", 10, H - 12);
    }
    function update() {
      compute();
      const o = res.outcome;
      const txt = {
        crash: `Falls back and hits the ground ${Math.round(res.groundArc).toLocaleString("en-US")} km away.`,
        orbit: `In orbit! Lowest point ${Math.round(res.rp - EARTH.R).toLocaleString("en-US")} km, highest ${Math.round(res.ra - EARTH.R).toLocaleString("en-US")} km, once round every ${fmt(res.T / 60, 3)} min.`,
        circular: `A circular orbit: falling all the way round at a steady 400 km, every ${fmt(res.T / 60, 3)} min.`,
        escape: "Escapes! Fast enough to fall away from Earth forever."
      }[o];
      $(".ac-verdict", host).innerHTML = `<span class="chip ${o === "crash" ? "flame" : o === "escape" ? "nebula" : "aurora"}">${{ crash: "Crash", orbit: "Orbit", circular: "Circular orbit", escape: "Escape" }[o]}</span> ${txt}`;
      const cv = calc("circular-velocity", { mu: 398600400000000, r: EARTH.R + alt }).vc;
      const ev = calc("escape-velocity", { mu: 398600400000000, r: EARTH.R + alt }).vesc;
      $(".ac-outs", host).innerHTML = readouts([["Circular speed here", `${cv.toFixed(2)} km/s`], ["Escape speed here", `${ev.toFixed(2)} km/s`]]);
    }
    s.onInput = (x) => { v = x; update(); };
    // drag horizontally on the canvas to set speed
    let drag = null;
    view.c.style.touchAction = "none";
    view.c.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, v }; view.c.setPointerCapture(e.pointerId); });
    view.c.addEventListener("pointermove", (e) => { if (!drag) return; v = clamp(drag.v + (e.clientX - drag.x) / 28, 3, 12); s.set(v); update(); });
    view.c.addEventListener("pointerup", () => { drag = null; });
    update();
    const stop = loop((dt) => { if (anim < 1) { anim = Math.min(1, anim + dt / (reduce ? 0.01 : 2.2)); view.redraw(); } });
    return { destroy() { stop(); view.destroy(); } };
  }

  /* ---- 3. rocket equation bar ---- */
  function wRocket(cfg, host) {
    host.innerHTML = `<div class="ac-2col"><div class="ac-rkviz"></div><div class="ac-side"><div class="ac-ctl"></div><div class="ac-outs"></div></div></div><div class="ac-dvbar"></div><p class="ac-verdict"></p>`;
    let isp = cfg.isp, frac = cfg.frac;
    const ctl = $(".ac-ctl", host);
    const pre = seg([{ v: 268, label: "Solid 268 s" }, { v: 311, label: "Kerosene 311 s" }, { v: 452, label: "Hydrogen 452 s" }], isp, (x) => { isp = +x; si.set(isp); update(); }, "Engine type");
    ctl.appendChild(pre);
    const si = slider({ label: "Specific impulse (Isp)", unit: "s", min: 200, max: 470, value: isp, step: 1, format: (x) => Math.round(x) });
    const sf = slider({ label: "Propellant share of liftoff mass", unit: "%", min: 50, max: 96, value: frac, step: 0.5, format: (x) => x.toFixed(1) });
    si.onInput = (x) => { isp = x; pre.setValue(-1); update(); };
    sf.onInput = (x) => { frac = x; update(); };
    ctl.append(si.el, sf.el);
    function update() {
      const R = 1 / (1 - frac / 100);
      const r = calc("tsiolkovsky", { isp, R });
      $(".ac-outs", host).innerHTML = readouts([["Mass ratio", fmt(R, 3)], ["Exhaust speed", `${fmt(r.ve, 3)} km/s`], ["Ideal Δv", `<b>${fmt(r.dv, 3)} km/s</b>`]]);
      // rocket fill
      const fh = 150 * frac / 100;
      $(".ac-rkviz", host).innerHTML = `<svg viewBox="0 0 120 220" role="img" aria-label="Rocket: ${frac.toFixed(0)} percent propellant">
        <defs><clipPath id="rkc"><path d="M60 10c14 14 20 32 20 56v124H40V66c0-24 6-42 20-56z"/></clipPath></defs>
        <g clip-path="url(#rkc)"><rect x="30" y="0" width="60" height="200" fill="#2a3150"/><rect x="30" y="${190 - fh}" width="60" height="${fh}" fill="url(#rkf)"/></g>
        <linearGradient id="rkf" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffc24b"/><stop offset="1" stop-color="#ff7a3d"/></linearGradient>
        <path d="M60 10c14 14 20 32 20 56v124H40V66c0-24 6-42 20-56z" fill="none" stroke="#c3cae6" stroke-width="2"/>
        <path d="M40 150l-16 30v14l16-8zM80 150l16 30v14l-16-8z" fill="#8f98bd"/><path d="M50 190h20l4 14H46z" fill="#5d6589"/>
        <text x="60" y="${Math.min(180, 196 - fh / 2)}" text-anchor="middle" font-family="JetBrains Mono" font-size="11" fill="#140700">${frac.toFixed(0)}%</text>
        <text x="60" y="216" text-anchor="middle" font-family="JetBrains Mono" font-size="9" fill="#8f98bd">propellant</text></svg>`;
      const max = 15, pct = (x) => clamp(x / max * 100, 0, 100);
      $(".ac-dvbar", host).innerHTML = `<div class="ac-scale"><div class="fill" style="width:${pct(r.dv)}%"></div><div class="mark" style="left:${pct(9.4)}%"><span>LEO ≈ 9.4 km/s</span></div></div>
        <div class="ac-ticks">${[0, 3, 6, 9, 12, 15].map((x) => `<span style="left:${pct(x)}%">${x}</span>`).join("")}</div>`;
      $(".ac-verdict", host).innerHTML = r.dv >= 9.4
        ? `<span class="chip aurora">Orbit on paper</span> …but a single stage that is ${frac.toFixed(0)} % propellant must carry its engines, tanks and payload in the other ${(100 - frac).toFixed(0)} %. Real stages manage about 90–95 %, with almost nothing left for payload.`
        : `<span class="chip flame">Short by ${fmt(9.4 - r.dv, 2)} km/s</span> Push the propellant share or the Isp. Notice how the last few percent of propellant add the most.`;
    }
    update();
    return null;
  }

  /* ---- 4. staging ---- */
  function wStaging(cfg, host) {
    host.innerHTML = `<div class="ac-ctl ac-ctlrow"></div><div class="ac-stagev"></div><div class="ac-outs"></div><p class="ac-verdict"></p>`;
    let n = cfg.stages, share = cfg.share;
    const ctl = $(".ac-ctl", host);
    const sg = seg([{ v: 1, label: "1 stage" }, { v: 2, label: "2 stages" }, { v: 3, label: "3 stages" }], n, (x) => { n = +x; update(); }, "Number of stages");
    const ss = slider({ label: "First stage's share of the propellant", unit: "%", min: 50, max: 95, value: share, step: 1, format: (x) => Math.round(x) });
    ss.onInput = (x) => { share = x; update(); };
    ctl.append(sg, ss.el);
    // Model: payload 10 t, 400 t of propellant in total, structure = 10 % of each stage's propellant, Isp 340 s everywhere.
    const PAY = 10, PROP = 400, DRY = 0.1, ISP = 340;
    function update() {
      ss.el.hidden = n === 1;
      let p = [PROP, 0, 0];
      if (n === 2) p = [PROP * share / 100, PROP * (1 - share / 100), 0];
      if (n === 3) { const rest = PROP * (1 - share / 100); p = [PROP * share / 100, rest * 0.75, rest * 0.25]; }
      const set = { pay: PAY, p1: p[0], d1: p[0] * DRY, i1: ISP, p2: p[1], d2: p[1] * DRY, i2: ISP, p3: p[2], d3: p[2] * DRY, i3: ISP };
      const r = calc("multistage", set);
      const dvs = [r.dv1, r.dv2, r.dv3].slice(0, n);
      const cols = [COL.flame, COL.sol, COL.ice];
      // stack drawing: heights ∝ mass
      const masses = [...p.slice(0, n).map((x) => x * (1 + DRY)), PAY];
      const tot = masses.reduce((a, b) => a + b, 0);
      let y = 196, blocks = "";
      masses.forEach((m, i) => {
        const h = Math.max(10, 180 * m / tot); y -= h;
        const isPay = i === masses.length - 1;
        const w = isPay ? 24 : 44 - i * 6;
        blocks += `<rect x="${60 - w / 2}" y="${y}" width="${w}" height="${h - 2}" rx="3" fill="${isPay ? "#e9edff" : cols[i]}" opacity="${isPay ? 1 : 0.85}"/>` +
          `<text x="${60 + w / 2 + 6}" y="${y + h / 2 + 4}" font-family="JetBrains Mono" font-size="10" fill="#c3cae6">${isPay ? "payload 10 t" : `stage ${i + 1}: ${Math.round(m)} t`}</text>`;
      });
      const max = 12, pct = (x) => clamp(x / max * 100, 0, 100);
      let acc = 0;
      const segs = dvs.map((d, i) => { const s = `<div class="seg" style="left:${pct(acc)}%;width:${pct(d)}%;background:${cols[i]}" title="Stage ${i + 1}: ${fmt(d, 3)} km/s"></div>`; acc += d; return s; }).join("");
      $(".ac-stagev", host).innerHTML = `<svg viewBox="0 0 200 200" class="ac-stack" role="img" aria-label="${n}-stage rocket, masses to scale">${blocks}</svg>
        <div class="ac-dvbar"><div class="ac-scale">${segs}<div class="mark" style="left:${pct(9.4)}%"><span>LEO ≈ 9.4</span></div></div>
        <div class="ac-ticks">${[0, 3, 6, 9, 12].map((x) => `<span style="left:${pct(x)}%">${x}</span>`).join("")}</div>
        <p class="hint">Δv by stage (km/s): ${dvs.map((d, i) => `<span style="color:${cols[i]}">stage ${i + 1}: ${fmt(d, 3)}</span>`).join(" · ")}</p></div>`;
      $(".ac-outs", host).innerHTML = readouts([["Liftoff mass", `${fmt(r.m01, 3)} t`], ["Payload fraction", `${fmt(r.pf, 3)} %`], ["Total ideal Δv", `<b>${fmt(r.dvt, 3)} km/s</b>`]]);
      $(".ac-verdict", host).innerHTML = r.dvt >= 9.4 ? `<span class="chip aurora">Reaches orbit</span> Same propellant, same engines: dropping empty stages did it.` : `<span class="chip flame">${fmt(9.4 - r.dvt, 2)} km/s short</span> ${n === 1 ? "One stage hauls 40 t of empty tank all the way up. Try two." : "Try a different split between the stages."}`;
    }
    update();
    return null;
  }

  /* ---- 5. max-Q ---- */
  function wMaxQ(cfg, host) {
    host.innerHTML = `<div class="ac-ctl ac-ctlrow"></div><div class="ac-cvwrap"></div><div class="ac-outs"></div><p class="ac-verdict"></p>`;
    let tw = cfg.tw, bucket = cfg.bucket;
    const LIMIT = 32000;   // toy structural limit, Pa
    const qfn = (h, v) => calc("dynamic-pressure", { alt: h / 1000, v }).q * 1000;
    const st = slider({ label: "Thrust-to-weight at liftoff", unit: "", min: 1.15, max: 2.2, value: tw, step: 0.01, format: (x) => x.toFixed(2) });
    const sw = document.createElement("label"); sw.className = "switch"; sw.innerHTML = `<span>Throttle bucket (65 % for 30 s)</span><input type="checkbox" ${bucket ? "checked" : ""}>`;
    st.onInput = (x) => { tw = x; update(); };
    sw.querySelector("input").addEventListener("change", (e) => { bucket = e.target.checked; update(); });
    $(".ac-ctl", host).append(st.el, sw);
    let A = null, B = null;
    const view = canvas($(".ac-cvwrap", host), 2.1, "Dynamic pressure against altitude during a toy ascent", draw, { maxH: 320 });
    function draw(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      if (!A) return;
      const L = 44, Rr = 12, T = 12, Bm = 30, X = (h) => L + (W - L - Rr) * h / 40000, Y = (q) => H - Bm - (H - Bm - T) * q / 50000;
      ctx.font = FONT(10); ctx.fillStyle = "#8f98bd"; ctx.strokeStyle = "rgba(150,170,255,.12)"; ctx.lineWidth = 1;
      for (let q = 0; q <= 50000; q += 10000) { ctx.beginPath(); ctx.moveTo(L, Y(q)); ctx.lineTo(W - Rr, Y(q)); ctx.stroke(); ctx.fillText(`${q / 1000}`, 8, Y(q) + 3); }
      for (let h = 0; h <= 40000; h += 10000) ctx.fillText(`${h / 1000} km`, X(h) - 12, H - 10);
      ctx.save(); ctx.translate(12, T + 4); ctx.fillText("kPa", 0, 0); ctx.restore();
      // limit
      ctx.strokeStyle = "rgba(255,79,154,.8)"; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.moveTo(L, Y(LIMIT)); ctx.lineTo(W - Rr, Y(LIMIT)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = "#ff4f9a"; ctx.fillText("toy structural limit", W - Rr - 140, Y(LIMIT) - 6);
      const curve = (S, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); S.samples.forEach((s, i) => { if (s.h > 40000) return; i ? ctx.lineTo(X(s.h), Y(s.q)) : ctx.moveTo(X(s.h), Y(s.q)); }); ctx.stroke(); };
      if (B) curve(B, "rgba(195,202,230,.35)", 1.5);
      curve(A, COL.ice, 2.5);
      const p = A.peak;
      ctx.fillStyle = p.q > LIMIT ? COL.plasma : COL.sol;
      ctx.beginPath(); ctx.arc(X(p.h), Y(p.q), 5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#e9edff"; ctx.font = FONT(11, 600);
      const lx = X(p.h) + 10 > W - 170 ? X(p.h) - 170 : X(p.h) + 10;
      ctx.fillText(`max-Q ${fmt(p.q / 1000, 3)} kPa`, lx, Y(p.q) - 8);
    }
    function update() {
      A = ascent({ tw, bucket, qfn });
      B = bucket ? ascent({ tw, bucket: false, qfn }) : null;
      const p = A.peak;
      $(".ac-outs", host).innerHTML = readouts([["Max-Q", `${fmt(p.q / 1000, 3)} kPa`], ["Reached at", `${fmt(p.h / 1000, 3)} km`], ["Time after liftoff", `T+${Math.round(p.t)} s`], ["Speed there", `${Math.round(p.v)} m/s`]]);
      $(".ac-verdict", host).innerHTML = p.q > LIMIT
        ? `<span class="chip flame">Over the limit</span> Too much push low down. Lower the thrust, or switch on the throttle bucket.`
        : `<span class="chip aurora">Within limits</span> ${bucket ? "The bucket shaved the peak (grey curve: without it)." : "Now try a punchier rocket, and see why many throttle down."}`;
      view.redraw();
    }
    update();
    return { destroy() { view.destroy(); } };
  }

  /* ---- 6. booster landing ---- */
  function wLanding(cfg, host) {
    host.innerHTML = `<div class="ac-2col ac-land"><div class="ac-cvwrap"></div><div class="ac-side"><div class="ac-ctl"></div>
      <div class="row"><button type="button" class="btn primary small" data-go>Drop it</button><button type="button" class="btn small" data-ideal>Show the perfect height</button></div>
      <div class="ac-outs"></div><p class="ac-verdict" aria-live="polite">Pick an ignition height and press Drop it.</p></div></div>`;
    let h0 = cfg.h, v0 = cfg.v0, sim = null, t = 0, playing = false;
    const sh = slider({ label: "Engine lights at", unit: "m", min: 500, max: 6000, value: h0, step: 10, format: (x) => Math.round(x).toLocaleString("en-US") });
    const sv = slider({ label: "Falling speed at that height", unit: "m/s", min: 150, max: 300, value: v0, step: 1, format: (x) => Math.round(x) });
    sh.onInput = (x) => { h0 = x; reset(); };
    sv.onInput = (x) => { v0 = x; reset(); };
    $(".ac-ctl", host).append(sh.el, sv.el);
    const view = canvas($(".ac-cvwrap", host), 0.62, "A booster falling toward a landing pad", draw, { maxH: 420 });
    function reset() { sim = landingSim({ h0, v0 }); t = -1.2; playing = false; view.redraw(); outs(false); }
    function outs(done) {
      const aNet = BOOSTER.F / BOOSTER.m0 - G0;
      $(".ac-outs", host).innerHTML = readouts([["Braking at ignition", `${fmt(aNet, 3)} m/s²`], ["Estimate at ignition braking", `${Math.round(v0 * v0 / (2 * aNet)).toLocaleString("en-US")} m`]]);
      if (!done) return;
      const v = $(".ac-verdict", host);
      if (sim.stopped && sim.hStop < 2) v.innerHTML = `<span class="chip aurora">Perfect hoverslam</span> Zero speed at ${fmt(sim.hStop, 2)} m. The Falcon team would like a word.`;
      else if (!sim.stopped && sim.vImpact < 3) v.innerHTML = `<span class="chip aurora">Touchdown</span> Landed at ${fmt(sim.vImpact, 2)} m/s: legs can take that.`;
      else if (sim.stopped) v.innerHTML = `<span class="chip sol">Too early</span> It stopped ${Math.round(sim.hStop).toLocaleString("en-US")} m up, and at minimum throttle it now climbs again. Light it lower.`;
      else v.innerHTML = `<span class="chip flame">Too late</span> Hit the pad at ${Math.round(sim.vImpact)} m/s (${Math.round(sim.vImpact * 3.6)} km/h). Light it higher.`;
    }
    function draw(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      if (!sim) return;
      const top = 24, ground = H - 34, hMax = 6500;
      const Y = (h) => ground - (ground - top) * clamp(h, 0, hMax) / hMax;
      // altitude ruler
      ctx.font = FONT(10); ctx.fillStyle = "#8f98bd"; ctx.strokeStyle = "rgba(150,170,255,.12)";
      for (let h = 0; h <= 6000; h += 1000) { ctx.beginPath(); ctx.moveTo(40, Y(h)); ctx.lineTo(W - 8, Y(h)); ctx.stroke(); ctx.fillText(h ? `${h / 1000} km` : "0", 4, Y(h) + 3); }
      // ignition marker
      ctx.strokeStyle = "rgba(255,194,75,.7)"; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(40, Y(h0)); ctx.lineTo(W - 8, Y(h0)); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = COL.sol; ctx.fillText("ignition", W - 64, Y(h0) - 5);
      // pad
      ctx.fillStyle = "#1a2038"; ctx.fillRect(0, ground, W, H - ground);
      ctx.fillStyle = "#8f98bd"; ctx.fillRect(W / 2 - 34, ground - 3, 68, 4);
      // booster state at time t (before ignition: 1.2 s of coasting shown above the line)
      let h, v, burning;
      if (t < 0) { h = h0 - v0 * t; v = v0; burning = false; }
      else {
        const P = sim.path; let k = 0; while (k < P.length - 1 && P[k + 1][0] < t) k++;
        const a = P[k], b = P[Math.min(k + 1, P.length - 1)], f = b[0] > a[0] ? clamp((t - a[0]) / (b[0] - a[0]), 0, 1) : 0;
        h = a[1] + (b[1] - a[1]) * f; v = a[2] + (b[2] - a[2]) * f; burning = t < sim.t;
      }
      const x = W / 2, y = Y(h);
      if (burning && t >= 0) { const fl = 14 + Math.random() * 8; const g = ctx.createLinearGradient(0, y, 0, y + fl + 6); g.addColorStop(0, "#fff6c2"); g.addColorStop(1, "rgba(255,122,61,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + fl + 6); ctx.fill(); }
      ctx.fillStyle = "#e9edff"; ctx.fillRect(x - 4, y - 44, 8, 44);
      ctx.fillStyle = "#5d6589"; ctx.fillRect(x - 4, y - 44, 8, 4);
      ctx.strokeStyle = "#c3cae6"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(x - 4, y - 6); ctx.lineTo(x - 10, y); ctx.moveTo(x + 4, y - 6); ctx.lineTo(x + 10, y); ctx.stroke();
      ctx.fillStyle = "#e9edff"; ctx.font = FONT(11, 600);
      ctx.fillText(`${Math.round(h).toLocaleString("en-US")} m`, x + 16, y - 26);
      ctx.fillText(`${Math.round(v)} m/s ${v > 0.5 ? "↓" : ""}`, x + 16, y - 12);
    }
    $("[data-go]", host).addEventListener("click", () => { sim = landingSim({ h0, v0 }); t = -1.2; playing = true; $(".ac-verdict", host).textContent = "Falling…"; if (reduce) { t = sim.t; playing = false; view.redraw(); outs(true); } });
    $("[data-ideal]", host).addEventListener("click", () => {
      const hi = idealIgnition(v0);
      sh.set(hi); h0 = sh.value;
      sim = landingSim({ h0, v0 }); t = sim.t; view.redraw(); outs(true);
      $(".ac-verdict", host).insertAdjacentHTML("beforeend", ` <span class="muted">Light at ${Math.round(hi).toLocaleString("en-US")} m: a little lower than v²/2a, because the booster gets lighter as it burns.</span>`);
    });
    reset();
    const stop = loop((dt) => {
      if (!playing) return;
      t += dt * 5;                     // five times real time
      if (t >= sim.t) { t = sim.t; playing = false; outs(true); }
      view.redraw();
    });
    return { destroy() { stop(); view.destroy(); } };
  }

  /* ---- 7. Kepler's equal areas ---- */
  function wKepler(cfg, host) {
    host.innerHTML = `<div class="ac-2col"><div class="ac-cvwrap"></div><div class="ac-side"><div class="ac-ctl"></div><div class="ac-outs"></div><p class="hint">Twelve wedges, each swept in exactly one-twelfth of the orbit. Wide and short near the Sun, long and thin far away: the same area.</p></div></div>`;
    let e = cfg.e, M = 0;
    const se = slider({ label: "Eccentricity e", unit: "", min: 0, max: 0.9, value: e, step: 0.01, format: (x) => x.toFixed(2) });
    se.onInput = (x) => { e = x; outs(); };
    $(".ac-ctl", host).appendChild(se.el);
    const view = canvas($(".ac-cvwrap", host), 1.35, "An elliptical orbit divided into twelve equal-time wedges", draw, { maxH: 380 });
    const N = 12;
    function pos(Mk, a, b, S) { const E = solveKepler(Mk, e); return [(a * (Math.cos(E) - e)) * S, (b * Math.sin(E)) * S]; }
    function draw(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      const a = 1, b = Math.sqrt(1 - e * e);
      const S = Math.min((W - 30) / 2, (H - 30) / (2 * b)) * 0.95;
      const cx = W / 2 + a * e * S, cy = H / 2;        // Sun (focus) position so the ellipse is centred
      for (let k = 0; k < N; k++) {
        ctx.beginPath(); ctx.moveTo(cx, cy);
        for (let j = 0; j <= 16; j++) { const p = pos(TAU * (k + j / 16) / N, a, b, S); ctx.lineTo(cx + p[0], cy - p[1]); }
        ctx.closePath();
        ctx.fillStyle = k % 2 ? "rgba(124,200,255,.10)" : "rgba(124,200,255,.24)"; ctx.fill();
      }
      ctx.strokeStyle = "rgba(124,200,255,.8)"; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let j = 0; j <= 120; j++) { const E = TAU * j / 120; const X = cx + (a * (Math.cos(E) - e)) * S, Y = cy - b * Math.sin(E) * S; j ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
      ctx.stroke();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 16); g.addColorStop(0, "#fff6c2"); g.addColorStop(0.5, "#ffc24b"); g.addColorStop(1, "rgba(255,194,75,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, 16, 0, TAU); ctx.fill();
      const p = pos(M, a, b, S);
      ctx.fillStyle = "#e9edff"; ctx.beginPath(); ctx.arc(cx + p[0], cy - p[1], 5, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(233,237,255,.5)"; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + p[0], cy - p[1]); ctx.stroke();
      ctx.font = FONT(10); ctx.fillStyle = "#8f98bd";
      ctx.fillText("perihelion", cx + (1 - e) * S - 64, cy + 16); ctx.fillText("aphelion", cx - (1 + e) * S + 4, cy + 16);
    }
    function outs() {
      const r = calc("kepler-second", { a: 1, e, M: 1 });
      $(".ac-outs", host).innerHTML = readouts([["Perihelion speed", `${fmt(r.vp, 3)} km/s`], ["Aphelion speed", `${fmt(r.va, 3)} km/s`], ["Fast ÷ slow", `${fmt(r.ratio, 3)}×`], ["Period (a = 1 AU)", "1 year"]]);
    }
    outs();
    const stop = loop((dt) => { M = (M + dt * TAU / (reduce ? 1e9 : 9)) % TAU; view.redraw(); });
    if (reduce) { M = 0.6; view.redraw(); }
    return { destroy() { stop(); view.destroy(); } };
  }

  /* ---- 8. porkchop ---- */
  function wPorkchop(cfg, host) {
    host.innerHTML = `<div class="ac-cvwrap ac-pork"></div><div class="ac-outs"></div><div class="ac-legend" aria-hidden="true"><span>cheap: 5.5 km/s</span><i></i><span>20+ km/s</span></div>`;
    const jd0 = julianDay(Date.UTC(2026, 4, 1)), days = 1096, NX = 96, NY = 48, T0 = 90, T1 = 450;
    const grid = new Float32Array(NX * NY), parts = [];
    for (let i = 0; i < NX; i++) for (let j = 0; j < NY; j++) {
      const r = porkchopCell(jd0 + days * i / (NX - 1), T0 + (T1 - T0) * j / (NY - 1));
      grid[j * NX + i] = r ? r.total : NaN; parts[j * NX + i] = r;
    }
    let best = [];   // best cell per ~26-month window
    for (let w = 0; w < 2; w++) {
      let bi = -1, bv = Infinity;
      for (let i = w * NX / 2; i < (w + 1) * NX / 2; i++) for (let j = 0; j < NY; j++) { const v = grid[j * NX + i]; if (v < bv) { bv = v; bi = j * NX + i; } }
      if (bi >= 0) best.push(bi);
    }
    let cur = best[0] ?? 0;
    const stops = [[0, [255, 246, 194]], [0.12, [255, 194, 75]], [0.3, [255, 122, 61]], [0.55, [177, 140, 255]], [0.8, [44, 58, 122]], [1, [12, 16, 36]]];
    const cmap = (v) => {
      if (!isFinite(v)) return [8, 11, 22];
      const t = clamp((v - 5.5) / (20 - 5.5), 0, 1);
      let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [ta, ca] = stops[k], [tb, cb] = stops[k + 1], f = (t - ta) / (tb - ta);
      return ca.map((c, m) => Math.round(c + (cb[m] - c) * f));
    };
    const img = document.createElement("canvas"); img.width = NX; img.height = NY;
    const ix = img.getContext("2d"), id = ix.createImageData(NX, NY);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { const c = cmap(grid[j * NX + i]), o = ((NY - 1 - j) * NX + i) * 4; id.data[o] = c[0]; id.data[o + 1] = c[1]; id.data[o + 2] = c[2]; id.data[o + 3] = 255; }
    ix.putImageData(id, 0, 0);
    const L = 52, R = 10, T = 10, B = 34;
    const view = canvas($(".ac-cvwrap", host), 1.9, "Porkchop plot of Earth to Mars trips from May 2026 to May 2029", draw, { maxH: 380 });
    view.c.tabIndex = 0;
    const date = (jd) => new Date(jdToMs(jd)).toISOString().slice(0, 10);
    function draw(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      const pw = W - L - R, ph = H - T - B;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, L, T, pw, ph);
      ctx.font = FONT(10); ctx.fillStyle = "#8f98bd";
      for (let y = 2026; y <= 2029; y++) for (const m of [0, 6]) {
        const jd = julianDay(Date.UTC(y, m, 1)), f = (jd - jd0) / days;
        if (f < 0 || f > 1) continue;
        const x = L + f * pw;
        ctx.fillStyle = "rgba(255,255,255,.25)"; ctx.fillRect(x, T + ph, 1, 5);
        ctx.fillStyle = "#8f98bd"; ctx.fillText(m ? "Jul" : String(y), x - 10, T + ph + 17);
      }
      ctx.fillText("launch date →", W - R - 90, H - 4);
      ctx.textAlign = "right";
      for (let d = 100; d <= 450; d += 100) { const y = T + ph - (d - T0) / (T1 - T0) * ph; ctx.fillText(String(d), L - 8, y + 3); ctx.fillStyle = "rgba(255,255,255,.2)"; ctx.fillRect(L - 5, y, 5, 1); ctx.fillStyle = "#8f98bd"; }
      ctx.textAlign = "center"; ctx.save(); ctx.translate(10, T + ph / 2); ctx.rotate(-Math.PI / 2); ctx.fillText("days of flight", 0, 0); ctx.restore(); ctx.textAlign = "left";
      const cell = (k) => [L + ((k % NX) + 0.5) / NX * pw, T + ph - (Math.floor(k / NX) + 0.5) / NY * ph];
      best.forEach((k) => { const [x, y] = cell(k); ctx.strokeStyle = "#04050a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.stroke(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.stroke(); });
      const [x, y] = cell(cur);
      ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke(); ctx.setLineDash([]);
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(x - 5, y - 5, 10, 10);
    }
    function outs() {
      const i = cur % NX, j = Math.floor(cur / NX), jd = jd0 + days * i / (NX - 1), tof = T0 + (T1 - T0) * j / (NY - 1), p = parts[cur];
      $(".ac-outs", host).innerHTML = readouts([
        ["Launch", date(jd)], ["Arrive", `${date(jd + tof)} (${Math.round(tof)} d)`],
        ["Leaving Earth (v∞)", p ? `${fmt(p.dep, 3)} km/s` : "—"], ["Arriving at Mars (v∞)", p ? `${fmt(p.arr, 3)} km/s` : "—"],
        ["Total", p ? `<b>${fmt(p.total, 3)} km/s</b>${best.includes(cur) ? " ★ best in window" : ""}` : "—"]
      ]);
      view.c.setAttribute("aria-label", `Porkchop plot. Cursor: launch ${date(jd)}, ${Math.round(tof)} days, ${p ? fmt(p.total, 3) + " km/s" : "no solution"}. Arrow keys move the cursor.`);
    }
    function pick(e) {
      const r = view.c.getBoundingClientRect(), pw = view.W - L - R, ph = view.H - T - B;
      const i = Math.floor(clamp((e.clientX - r.left - L) / pw, 0, 0.9999) * NX), j = Math.floor(clamp(1 - (e.clientY - r.top - T) / ph, 0, 0.9999) * NY);
      cur = j * NX + i; view.redraw(); outs();
    }
    view.c.addEventListener("pointermove", pick);
    view.c.addEventListener("pointerdown", pick);
    view.c.addEventListener("keydown", (e) => {
      const i = cur % NX, j = Math.floor(cur / NX);
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (!d) return; e.preventDefault();
      cur = clamp(j + d[1], 0, NY - 1) * NX + clamp(i + d[0], 0, NX - 1); view.redraw(); outs();
    });
    view.redraw(); outs();
    return { destroy() { view.destroy(); } };
  }

  /* ---- 9. gravity assist ---- */
  function wFlyby(cfg, host) {
    host.innerHTML = `<div class="ac-ctl ac-ctlrow"></div><div class="ac-flyv"><figure><div class="ac-cvwrap" data-a></div><figcaption>Seen from Jupiter</figcaption></figure><figure><div class="ac-cvwrap" data-b></div><figcaption>Seen from the Sun</figcaption></figure></div><div class="ac-outs"></div><p class="ac-verdict"></p>`;
    let vinf = cfg.vinf, rp = cfg.rp, side = "behind";
    const sv = slider({ label: "Approach speed v∞", unit: "km/s", min: 3, max: 15, value: vinf, step: 0.1, format: (x) => x.toFixed(1) });
    const sr = slider({ label: "Closest approach (Jupiter radii)", unit: "", min: 1.1, max: 30, value: rp, log: true, format: (x) => x.toFixed(1) });
    const sg = seg([{ v: "behind", label: "Pass behind" }, { v: "front", label: "Pass in front" }], side, (x) => { side = x; upd(); }, "Which side of Jupiter");
    sv.onInput = (x) => { vinf = x; upd(); }; sr.onInput = (x) => { rp = x; upd(); };
    $(".ac-ctl", host).append(sg, sv.el, sr.el);
    let F = null, sign = -1;
    const va = canvas($("[data-a]", host), 1.1, "Hyperbolic flyby path around Jupiter", drawA, { maxH: 300 });
    const vb = canvas($("[data-b]", host), 1.1, "Velocity vectors before and after the flyby, seen from the Sun", drawB, { maxH: 300 });
    function solve() {
      const opts = { vinf, rp: rp * JUPITER.R };
      const a = flyby({ ...opts, sign: -1 }), b = flyby({ ...opts, sign: 1 });
      // "Behind" (trailing side) is the pass that turns v∞ toward Jupiter's motion: it always gains speed
      const behind = a.sOut >= b.sOut ? a : b;
      F = side === "behind" ? behind : (behind === a ? b : a);
      sign = F === a ? -1 : 1;
    }
    function drawA(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      const e = F.e, nu = Math.acos(-1 / e), rpk = rp * JUPITER.R, p = rpk * (1 + e);
      const S = Math.min(W, H) * 0.16 / rpk;
      const cx = W / 2, cy = H / 2;
      const psi = Math.atan2(e - 1 / e, Math.sin(nu));
      const phi = Math.PI / 2;           // v∞ in: crossing Jupiter's orbit, perpendicular to its motion
      const rot = sign > 0 ? phi - psi : phi + psi, mir = sign > 0 ? 1 : -1;
      ctx.fillStyle = "#c9a27a"; ctx.beginPath(); ctx.arc(cx, cy, Math.max(3, JUPITER.R * S), 0, TAU); ctx.fill();
      ctx.strokeStyle = COL.ice; ctx.lineWidth = 2; ctx.beginPath();
      let first = true;
      for (let k = -200; k <= 200; k++) {
        const v = nu * 0.995 * k / 200, r = p / (1 + e * Math.cos(v));
        if (r * S > Math.max(W, H)) continue;
        let x = r * Math.cos(v), y = mir * r * Math.sin(v);
        const X = x * Math.cos(rot) - y * Math.sin(rot), Y = x * Math.sin(rot) + y * Math.cos(rot);
        const px = cx + X * S, py = cy - Y * S;
        first ? ctx.moveTo(px, py) : ctx.lineTo(px, py); first = false;
      }
      ctx.stroke();
      const U = 26;
      arrow(ctx, 14, H - 16, 14 + U * 1.6, H - 16, "#8f98bd", 1.5);
      ctx.font = FONT(10); ctx.fillStyle = "#8f98bd"; ctx.fillText("Jupiter's motion", 14, H - 24);
      ctx.fillText(`turned ${Math.round(F.delta * 180 / Math.PI)}°`, W - 88, 16);
    }
    function drawB(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      const S = Math.min(W, H) * 0.8 / 28, ox = W * 0.12, oy = H * 0.72;
      const P = (v) => [ox + v[0] * S, oy - v[1] * S];
      const U = [JUPITER.U, 0];
      const [ux, uy] = P(U);
      arrow(ctx, ox, oy, ux, uy, "#8f98bd", 2);
      const [ix, iy] = P(F.vin), [qx, qy] = P(F.vout);
      ctx.setLineDash([3, 4]); ctx.strokeStyle = "rgba(124,200,255,.5)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(ux, uy, vinf * S, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      arrow(ctx, ux, uy, ix, iy, "rgba(124,200,255,.6)", 1.5);
      arrow(ctx, ux, uy, qx, qy, COL.ice, 1.5);
      arrow(ctx, ox, oy, ix, iy, "#c3cae6", 2);
      arrow(ctx, ox, oy, qx, qy, F.sOut > F.sIn ? COL.aurora : COL.flame, 2.5);
      ctx.font = FONT(10); ctx.fillStyle = "#8f98bd"; ctx.fillText("Jupiter", ux - 20, uy + 14);
      ctx.fillStyle = "#c3cae6"; ctx.fillText(`before ${F.sIn.toFixed(1)}`, ix + 4, iy - 4);
      ctx.fillStyle = F.sOut > F.sIn ? COL.aurora : COL.flame; ctx.fillText(`after ${F.sOut.toFixed(1)} km/s`, qx + 4, qy - 4);
    }
    function upd() {
      solve();
      $(".ac-outs", host).innerHTML = readouts([["Path bent by", `${fmt(F.delta * 180 / Math.PI, 3)}°`], ["Speed change from Jupiter's view", "0 km/s"], ["Sun-frame speed before", `${fmt(F.sIn, 3)} km/s`], ["Sun-frame speed after", `<b>${fmt(F.sOut, 3)} km/s</b>`]]);
      const d = F.sOut - F.sIn;
      $(".ac-verdict", host).innerHTML = d >= 0 ? `<span class="chip aurora">+${fmt(d, 3)} km/s</span> Free speed, borrowed from Jupiter's orbit.` : `<span class="chip flame">${fmt(d, 3)} km/s</span> Passing in front brakes the craft: handy for falling inward.`;
      va.redraw(); vb.redraw();
    }
    upd();
    return { destroy() { va.destroy(); vb.destroy(); } };
  }

  /* ---- 10. blackbody spectrum ---- */
  function wBlackbody(cfg, host) {
    host.innerHTML = `<div class="ac-ctl ac-ctlrow"></div><div class="ac-bb"><div class="ac-swatch" aria-hidden="true"><i></i></div><div class="ac-cvwrap"></div></div><div class="ac-outs"></div>`;
    let T = cfg.T;
    const st = slider({ label: "Surface temperature", unit: "K", min: 1500, max: 30000, value: T, log: true, format: (x) => Math.round(x).toLocaleString("en-US") });
    const pr = seg([{ v: 3600, label: "Betelgeuse 3,600 K" }, { v: 5772, label: "Sun 5,772 K" }, { v: 9940, label: "Sirius 9,940 K" }, { v: 12100, label: "Rigel 12,100 K" }], T, (x) => { T = +x; st.set(T); upd(); }, "Stars");
    st.onInput = (x) => { T = x; pr.setValue(-1); upd(); };
    $(".ac-ctl", host).append(pr, st.el);
    const view = canvas($(".ac-cvwrap", host), 2.2, "Planck blackbody spectrum with the visible band", draw, { maxH: 280 });
    const lam0 = 100, lam1 = 2000;
    function draw(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      const L = 10, R = 10, Tp = 14, B = 26, pw = W - L - R, ph = H - Tp - B;
      const X = (l) => L + (l - lam0) / (lam1 - lam0) * pw;
      const peak = (t) => planck(2.897771955e-3 / t, t);
      const norm = Math.max(peak(T), peak(5772));
      const Y = (v) => Tp + ph - ph * v / norm;
      // rainbow under the curve
      ctx.save(); ctx.beginPath(); ctx.moveTo(X(380), Y(0));
      for (let l = 380; l <= 750; l += 2) ctx.lineTo(X(l), Y(planck(l * 1e-9, T)));
      ctx.lineTo(X(750), Y(0)); ctx.closePath(); ctx.clip();
      for (let l = 380; l <= 750; l += 2) { const c = wavelengthRGB(l); ctx.fillStyle = `rgb(${c})`; ctx.fillRect(X(l), Tp, X(l + 2) - X(l) + 0.5, ph); }
      ctx.restore();
      // Sun reference
      if (Math.abs(T - 5772) > 30) { ctx.strokeStyle = "rgba(255,194,75,.45)"; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.2; ctx.beginPath(); for (let l = lam0; l <= lam1; l += 5) { const y = Y(planck(l * 1e-9, 5772)); l === lam0 ? ctx.moveTo(X(l), y) : ctx.lineTo(X(l), y); } ctx.stroke(); ctx.setLineDash([]); }
      ctx.strokeStyle = "#e9edff"; ctx.lineWidth = 2; ctx.beginPath();
      for (let l = lam0; l <= lam1; l += 4) { const y = Y(planck(l * 1e-9, T)); l === lam0 ? ctx.moveTo(X(l), y) : ctx.lineTo(X(l), y); }
      ctx.stroke();
      const lp = 2.897771955e6 / T;
      if (lp >= lam0 && lp <= lam1) { ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(X(lp), Tp); ctx.lineTo(X(lp), Tp + ph); ctx.stroke(); ctx.setLineDash([]); }
      ctx.font = FONT(10); ctx.fillStyle = "#8f98bd";
      for (let l = 250; l <= 2000; l += 250) ctx.fillText(l >= 1000 ? `${l / 1000} µm` : `${l} nm`, X(l) - 14, H - 8);
      ctx.fillText("ultraviolet", X(130), Tp + 10); ctx.fillText("infrared", X(1500), Tp + 10);
      if (Math.abs(T - 5772) > 30) { ctx.fillStyle = "rgba(255,194,75,.8)"; ctx.fillText("- - the Sun", W - 90, Tp + 24); }
    }
    function upd() {
      const r = calc("wien", { T });
      const [cr, cg, cb] = blackbodyRGB(T);
      $(".ac-swatch i", host).style.background = `radial-gradient(circle at 40% 35%, #fff, rgb(${cr},${cg},${cb}) 45%, rgba(${cr},${cg},${cb},0) 72%)`;
      const band = r.lam < 380 ? "ultraviolet" : r.lam > 750 ? "infrared" : r.lam < 450 ? "violet-blue" : r.lam < 495 ? "blue" : r.lam < 570 ? "green" : r.lam < 590 ? "yellow" : r.lam < 620 ? "orange" : "red";
      $(".ac-outs", host).innerHTML = readouts([["Peak wavelength", `${fmt(r.lam, 3)} nm`], ["Peak falls in the", band], ["Each m² shines, vs the Sun", `${fmt(Math.pow(T / 5772, 4), 3)}×`]]);
      view.redraw();
    }
    upd();
    return { destroy() { view.destroy(); } };
  }

  /* ---- 11. Airy disk resolver ---- */
  function wAiry(cfg, host) {
    host.innerHTML = `<div class="ac-2col"><div class="ac-airy"><div class="ac-cvwrap" data-img></div><div class="ac-cvwrap" data-prof></div></div><div class="ac-side"><div class="ac-ctl"></div><div class="ac-outs"></div><p class="ac-verdict"></p></div></div>`;
    let D = cfg.D, sep = cfg.sep, lam = cfg.lam;
    const sd = slider({ label: "Aperture D", unit: "", min: 0.02, max: 10, value: D, log: true, format: (x) => x < 1 ? `${Math.round(x * 100)} cm` : `${x.toFixed(2)} m`, });
    const ss = slider({ label: "Star separation", unit: "″", min: 0.02, max: 5, value: sep, log: true, format: (x) => x.toFixed(x < 0.1 ? 3 : 2) });
    const sl = seg([{ v: 450, label: "Blue 450 nm" }, { v: 550, label: "Green 550 nm" }, { v: 700, label: "Red 700 nm" }], lam, (x) => { lam = +x; upd(); }, "Wavelength");
    sd.onInput = (x) => { D = x; upd(); }; ss.onInput = (x) => { sep = x; upd(); };
    $(".ac-ctl", host).append(sl, sd.el, ss.el);
    const N = 150;
    const buf = document.createElement("canvas"); buf.width = N; buf.height = N;
    const bctx = buf.getContext("2d"), bid = bctx.createImageData(N, N);
    let fov = 1, r = null;
    const vi = canvas($("[data-img]", host), 1, "Simulated image of two stars through a telescope", drawImg, { maxH: 300 });
    const vp = canvas($("[data-prof]", host), 3, "Brightness along the line joining the two stars", drawProf, { maxH: 110 });
    const RAD = Math.PI / 648000;
    const I = (thArc) => airy(Math.PI * D * thArc * RAD / (lam * 1e-9));
    function render() {
      const thR = 1.22 * lam * 1e-9 / D / RAD;
      fov = Math.max(5 * thR, 2.4 * sep);
      const tint = wavelengthRGB(lam);
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const x = (i / (N - 1) - 0.5) * fov, y = (j / (N - 1) - 0.5) * fov;
        const v = I(Math.hypot(x - sep / 2, y)) + I(Math.hypot(x + sep / 2, y));
        const s = Math.asinh(v * 30) / Math.asinh(60);
        const o = (j * N + i) * 4;
        bid.data[o] = Math.min(255, s * (tint[0] * 0.6 + 110)); bid.data[o + 1] = Math.min(255, s * (tint[1] * 0.6 + 110)); bid.data[o + 2] = Math.min(255, s * (tint[2] * 0.6 + 110)); bid.data[o + 3] = 255;
      }
      bctx.putImageData(bid, 0, 0);
    }
    function drawImg(ctx, W, H) {
      ctx.fillStyle = "#000"; ctx.fillRect(0, 0, W, H);
      ctx.imageSmoothingEnabled = true; ctx.drawImage(buf, 0, 0, W, H);
      ctx.font = FONT(10); ctx.fillStyle = "rgba(233,237,255,.7)";
      const bar = fov / 4; ctx.fillRect(10, H - 14, W / 4, 2); ctx.fillText(`${fmt(bar, 2)}″`, 10, H - 20);
    }
    function drawProf(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      const X = (x) => (x / fov + 0.5) * W, Y = (v) => H - 6 - (H - 14) * v / 1.25;
      const line = (f, col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); for (let k = 0; k <= 240; k++) { const x = (k / 240 - 0.5) * fov; const y = Y(f(x)); k ? ctx.lineTo(X(x), y) : ctx.moveTo(X(x), y); } ctx.stroke(); };
      line((x) => I(Math.abs(x - sep / 2)), "rgba(124,200,255,.4)", 1);
      line((x) => I(Math.abs(x + sep / 2)), "rgba(124,200,255,.4)", 1);
      line((x) => I(Math.abs(x - sep / 2)) + I(Math.abs(x + sep / 2)), "#e9edff", 2);
    }
    function upd() {
      r = calc("rayleigh", { lam, D, sep });
      render(); vi.redraw(); vp.redraw();
      $(".ac-outs", host).innerHTML = readouts([["Rayleigh limit 1.22 λ/D", `${fmt(r.th, 3)}″`], ["Separation ÷ limit", `${fmt(r.ratio, 3)}×`]]);
      $(".ac-verdict", host).innerHTML = r.ratio >= 1 ? `<span class="chip aurora">Resolved</span> Two stars, with a dip between them.` : r.ratio >= 0.8 ? `<span class="chip sol">Only just</span> A peanut shape: a trained eye might split it.` : `<span class="chip flame">Blended</span> It looks like one star. A bigger mirror would split them: at least ${fmt(r.Dmin, 3)} m.`;
    }
    upd();
    return { destroy() { vi.destroy(); vp.destroy(); } };
  }

  /* ---- 12. transit light curve ---- */
  function wTransit(cfg, host) {
    host.innerHTML = `<div class="ac-ctl ac-ctlrow"></div><div class="ac-cvwrap"></div><div class="ac-outs"></div>`;
    let Rp = cfg.Rp, Rs = cfg.Rs, ph = -1.2;
    const pr = seg([{ v: "1,1", label: "Earth & Sun" }, { v: "11.2,1", label: "Jupiter & Sun" }, { v: "1,0.12", label: "Earth-size & red dwarf" }], `${Rp},${Rs}`, (x) => { [Rp, Rs] = x.split(",").map(Number); sp.set(Rp); ss.set(Rs); upd(); }, "Examples");
    const sp = slider({ label: "Planet radius", unit: "R⊕", min: 0.5, max: 15, value: Rp, log: true, format: (x) => x.toFixed(2) });
    const ss = slider({ label: "Star radius", unit: "R☉", min: 0.1, max: 2, value: Rs, log: true, format: (x) => x.toFixed(2) });
    sp.onInput = (x) => { Rp = x; pr.setValue(-1); upd(); }; ss.onInput = (x) => { Rs = x; pr.setValue(-1); upd(); };
    $(".ac-ctl", host).append(pr, sp.el, ss.el);
    const view = canvas($(".ac-cvwrap", host), 1.7, "A planet crossing its star and the resulting light curve", draw, { maxH: 380 });
    let k = 0, depth = 0;
    function draw(ctx, W, H) {
      ctx.clearRect(0, 0, W, H);
      const sr = Math.min(W * 0.2, H * 0.24), cx = W / 2, cy = sr + 12, pr_ = Math.max(0.6, sr * k);
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, sr);
      g.addColorStop(0, "#fff4d6"); g.addColorStop(0.75, "#ffd27a"); g.addColorStop(1, "#ff9c3d");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, sr, 0, TAU); ctx.fill();
      const px = cx + ph * sr;
      ctx.fillStyle = "#04050a"; ctx.beginPath(); ctx.arc(px, cy, pr_, 0, TAU); ctx.fill();
      // light curve
      const top = cy + sr + 22, bot = H - 22, L = 40, R = 12;
      const flux = (p) => 1 - circleOverlap(Math.abs(p), 1, k) / Math.PI;
      const lo = 1 - Math.max(depth * 1.35, 1e-5), hi = 1 + Math.max(depth * 0.25, 2e-6);
      const Y = (f) => top + (bot - top) * (hi - f) / (hi - lo), X = (p) => L + (p + 1.6) / 3.2 * (W - L - R);
      ctx.strokeStyle = "rgba(150,170,255,.15)"; ctx.beginPath(); ctx.moveTo(L, Y(1)); ctx.lineTo(W - R, Y(1)); ctx.moveTo(L, Y(1 - depth)); ctx.lineTo(W - R, Y(1 - depth)); ctx.stroke();
      ctx.strokeStyle = COL.sol; ctx.lineWidth = 2; ctx.beginPath();
      for (let j = 0; j <= 300; j++) { const p = -1.6 + 3.2 * j / 300; const y = Y(flux(p)); j ? ctx.lineTo(X(p), y) : ctx.moveTo(X(p), y); }
      ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(X(clamp(ph, -1.6, 1.6)), Y(flux(ph)), 4, 0, TAU); ctx.fill();
      ctx.font = FONT(10); ctx.fillStyle = "#8f98bd"; ctx.fillText("brightness (axis zoomed to the dip)", L, top - 6);
      ctx.fillText("100 %", 2, Y(1) + 3); ctx.fillText("time →", W - R - 44, bot + 16);
    }
    function upd() {
      k = Rp * EARTH.R / (Rs * 695700);
      const r = calc("transit-depth", { Rp, Rs });
      depth = r.pct / 100;
      $(".ac-outs", host).innerHTML = readouts([["Planet ÷ star size", fmt(k, 3)], ["Transit depth", `${showOut("transit-depth", "pct", r.pct)}`], ["In parts per million", `${fmt(r.ppm, 3)} ppm`]]);
      view.redraw();
    }
    upd();
    const stop = loop((dt) => { ph += dt * 0.45; if (ph > 1.6) ph = -1.6; view.redraw(); });
    if (reduce) { ph = 0; view.redraw(); }
    return { destroy() { stop(); view.destroy(); } };
  }

  /* ---- 13. link budget ---- */
  function wLink(cfg, host) {
    host.innerHTML = `<div class="ac-ctl"></div><div class="ac-marks"></div><div class="ac-linkw"><div class="ac-rate"><span class="k">Data rate</span><span class="v" data-rate></span><div class="ac-meter"><span></span></div><span class="hint">1 bit/s ← → 1 Gbit/s</span></div><div class="ac-outs"></div></div><p class="hint ac-fine"></p>`;
    let d = cfg.d, Dr = 34;
    const sd = slider({ label: "Distance from Earth", unit: "AU", min: 0.00257, max: 200, value: d, log: true, format: (x) => x < 0.01 ? x.toFixed(4) : x < 10 ? x.toFixed(2) : Math.round(x) });
    const sg = seg([{ v: 34, label: "34 m dish" }, { v: 70, label: "70 m dish" }], Dr, (x) => { Dr = +x; upd(); }, "Ground antenna");
    sd.onInput = (x) => { d = x; upd(); };
    $(".ac-ctl", host).append(sg, sd.el);
    const marks = [["Moon", 0.00257], ["Mars", 1.5], ["Jupiter", 5.2], ["Pluto", 34], ["Voyager 1", 170]];
    $(".ac-marks", host).innerHTML = marks.map(([n, v]) => `<button type="button" class="chip" data-d="${v}" style="left:${(Math.log(v / 0.00257) / Math.log(200 / 0.00257)) * 100}%">${n}</button>`).join("");
    $(".ac-marks", host).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; d = +b.dataset.d; sd.set(d); upd(); });
    // Toy spacecraft: 20 W X-band transmitter, 3.7 m high-gain antenna (Voyager-class); receiver 25 K, Eb/N0 7 dB incl. margin.
    const SC = { Pt: 20, Dt: 3.7, f: 8.42, Tsys: 25, EbN0: 7 };
    function upd() {
      const r = calc("dsn-data-rate", { ...SC, Dr, d });
      const L = calc("fspl", { d: d * AU_KM, f: SC.f });
      const rate = r.Rb;
      const rs = rate >= 1e9 ? `${fmt(rate / 1e9, 3)} Gbit/s` : rate >= 1e6 ? `${fmt(rate / 1e6, 3)} Mbit/s` : rate >= 1e3 ? `${fmt(rate / 1e3, 3)} kbit/s` : `${fmt(rate, 3)} bit/s`;
      $("[data-rate]", host).textContent = rs;
      $(".ac-meter span", host).style.width = `${clamp(Math.log10(Math.max(rate, 1)) / 9 * 100, 0, 100)}%`;
      $(".ac-outs", host).innerHTML = readouts([["Path loss", `${fmt(L.L, 4)} dB`], ["Received power", `${fmt(10 * Math.log10(r.Pr / 1e-3), 4)} dBm`], ["Spacecraft antenna gain", `${fmt(r.Gt, 3)} dBi`], ["One-way light time", esc(showOut("fspl", "tl", L.tl))]]);
      $(".ac-fine", host).textContent = d > 120 ? "For comparison, Voyager 1 really does send about 160 bit/s to a 70 m antenna." : "Real missions also switch to lower data rates as they fly away, for exactly this reason.";
    }
    upd();
    return null;
  }

  /* ---- 14. ordering: V-model and TRL ladder (drag and drop, or tap and place) ---- */
  function wOrder(cfg, host) {
    const set = COURSE.orderSets[cfg.set];
    const n = set.items.length;
    let placed = new Array(n).fill(-1);          // slot -> item index
    let sel = null;                              // { item, from: slot | -1 }
    const R = rng(cfg.set === "trl" ? 11 : 5);
    let tray = set.items.map((_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [tray[i], tray[j]] = [tray[j], tray[i]]; }
    const ladder = cfg.layout === "ladder";
    host.innerHTML = `<div class="ac-order ${ladder ? "ladder" : "vee"}">
      <div class="ac-tray" aria-label="Unplaced steps"></div>
      <div class="ac-slots" aria-label="${ladder ? "The ladder, TRL 1 at the bottom" : "The V"}"></div></div>
      <div class="row ac-orderbtns"><button class="btn small primary" type="button" data-check>Check</button><button class="btn small" type="button" data-reset>Start again</button><button class="btn small" type="button" data-show>Show the answer</button><span class="hint" data-msg aria-live="polite">Tap a card, then tap a slot. Or drag it.</span></div>`;
    const trayEl = $(".ac-tray", host), slotsEl = $(".ac-slots", host), msg = $("[data-msg]", host);
    const vLabel = (s) => s < 4 ? "Define" : s === 4 ? "Build" : "Integrate & verify";
    function slotHTML(s) {
      const it = placed[s];
      const lab = ladder ? `TRL ${s + 1}` : `${s + 1} · ${vLabel(s)}`;
      return `<button type="button" class="ac-slot${it >= 0 ? " full" : ""}" data-slot="${s}" aria-label="${ladder ? "Rung" : "Slot"} ${lab}${it >= 0 ? ": " + esc(set.items[it]) : ", empty"}">
        <span class="lab">${lab}</span>${it >= 0 ? `<span class="ac-card" data-item="${it}">${esc(set.items[it])}</span>` : `<span class="empty">empty</span>`}</button>`;
    }
    function render() {
      trayEl.innerHTML = tray.length ? tray.map((i) => `<button type="button" class="ac-card${sel && sel.item === i ? " sel" : ""}" data-item="${i}" aria-pressed="${!!(sel && sel.item === i)}">${esc(set.items[i])}</button>`).join("") : `<p class="hint">All placed. Press Check.</p>`;
      if (ladder) slotsEl.innerHTML = Array.from({ length: n }, (_, k) => slotHTML(n - 1 - k)).join("");
      else {
        const rows = [[0, 8], [1, 7], [2, 6], [3, 5], [4]];
        slotsEl.innerHTML = `<svg class="ac-vbg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d="M8 6 L50 94 L92 6" fill="none" stroke="url(#vgr)" stroke-width="1.2" vector-effect="non-scaling-stroke"/><defs><linearGradient id="vgr" x1="0" x2="1"><stop offset="0" stop-color="#7cc8ff"/><stop offset=".5" stop-color="#b18cff"/><stop offset="1" stop-color="#ff7a3d"/></linearGradient></defs></svg>` +
          rows.map((r, k) => `<div class="vrow r${k}">${r.map(slotHTML).join("")}</div>`).join("");
      }
      if (sel) { const s = slotsEl.querySelector(`.ac-card[data-item="${sel.item}"]`); if (s) s.classList.add("sel"); }
    }
    function place(item, slot) {
      const from = placed.indexOf(item);
      const prev = placed[slot];
      if (from >= 0) placed[from] = -1; else tray = tray.filter((x) => x !== item);
      if (prev >= 0 && prev !== item) { if (from >= 0) placed[from] = prev; else tray.push(prev); }
      placed[slot] = item; sel = null;
      slotsEl.querySelectorAll(".ac-slot").forEach((e) => e.classList.remove("ok", "bad"));
      render();
    }
    function toTray(item) { const from = placed.indexOf(item); if (from >= 0) { placed[from] = -1; tray.push(item); } sel = null; render(); }
    host.addEventListener("click", (e) => {
      if (host._dragged) { host._dragged = false; return; }
      const card = e.target.closest(".ac-card"), slot = e.target.closest(".ac-slot");
      if (slot && sel && (!card || +card.dataset.item !== sel.item)) { place(sel.item, +slot.dataset.slot); focusSlot(+slot.dataset.slot); return; }
      if (card) { const it = +card.dataset.item; sel = sel && sel.item === it ? null : { item: it }; render(); msg.textContent = sel ? "Now tap a slot for it." : ""; return; }
      if (e.target.closest(".ac-tray") && sel) { toTray(sel.item); }
    });
    function focusSlot(s) { const b = slotsEl.querySelector(`.ac-slot[data-slot="${s}"]`); b && b.focus(); }
    // pointer drag
    let drag = null;
    host.addEventListener("pointerdown", (e) => {
      const card = e.target.closest(".ac-card"); if (!card || e.button > 0) return;
      drag = { item: +card.dataset.item, x: e.clientX, y: e.clientY, ghost: null, el: card };
    });
    addEventListener("pointermove", onMove);
    addEventListener("pointerup", onUp);
    function onMove(e) {
      if (!drag) return;
      if (!drag.ghost) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
        const g = drag.el.cloneNode(true); g.classList.add("ac-ghost"); g.style.width = drag.el.offsetWidth + "px";
        document.body.appendChild(g); drag.ghost = g; drag.el.classList.add("dragging");
      }
      drag.ghost.style.transform = `translate(${e.clientX - 20}px, ${e.clientY - 16}px)`;
      slotsEl.querySelectorAll(".ac-slot").forEach((s) => s.classList.remove("over"));
      const t = document.elementFromPoint(e.clientX, e.clientY), s = t && t.closest(".ac-slot");
      if (s && host.contains(s)) s.classList.add("over");
    }
    function onUp(e) {
      if (!drag) return;
      const d = drag; drag = null;
      if (!d.ghost) return;
      d.ghost.remove(); host._dragged = true; setTimeout(() => { host._dragged = false; }, 50);
      const t = document.elementFromPoint(e.clientX, e.clientY);
      const s = t && t.closest(".ac-slot");
      if (s && host.contains(s)) place(d.item, +s.dataset.slot);
      else if (t && t.closest(".ac-tray") && host.contains(t)) toTray(d.item);
      else render();
    }
    $("[data-check]", host).addEventListener("click", () => {
      let good = 0;
      slotsEl.querySelectorAll(".ac-slot").forEach((b) => {
        const s = +b.dataset.slot, ok = placed[s] === s;
        b.classList.toggle("ok", ok); b.classList.toggle("bad", placed[s] >= 0 && !ok);
        if (ok) good++;
      });
      msg.innerHTML = good === n ? `<strong class="ac-good">All ${n} in the right place!</strong>` : `${good} of ${n} right. ${tray.length ? `${tray.length} still to place.` : "Swap the red ones."}`;
    });
    $("[data-reset]", host).addEventListener("click", () => { placed.fill(-1); tray = set.items.map((_, i) => i); for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [tray[i], tray[j]] = [tray[j], tray[i]]; } sel = null; render(); msg.textContent = "Tap a card, then tap a slot. Or drag it."; });
    $("[data-show]", host).addEventListener("click", () => { placed = set.items.map((_, i) => i); tray = []; sel = null; render(); slotsEl.querySelectorAll(".ac-slot").forEach((b) => b.classList.add("ok")); msg.textContent = set.note; });
    render();
    return { destroy() { removeEventListener("pointermove", onMove); removeEventListener("pointerup", onUp); } };
  }

  /* ---------------- test hook (scripts/shot.py --eval) ---------------- */
  window.Academy = {
    get state() { return state; },
    complete(ids, frac = 1) {
      (ids === "all" ? LESSONS.map((l) => l.id) : [].concat(ids)).forEach((id) => { const l = BYID.get(id); const n = l.quiz.length; state.p[id] = { c: Math.round(n * frac), n, t: Date.now() }; });
      saveState(); route(); return stats(COURSE, state).done;
    },
    flash(id) { justDone = id; route(); return id; },
    reset() { state = emptyState(); saveState(); route(); return 0; },
    ready: () => !!COURSE
  };
}
