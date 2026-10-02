/* Cosmic Library · Telescope simulator ("what would I actually see?")
 *
 * Page logic: builds the instrument / eyepiece / target pickers, computes tonight's sky for
 * the chosen place, and renders the eyepiece view on a 2D canvas.
 *
 * Rendering, in two stages:
 *   1. buildScene(): every pixel of the field is given the naked-eye surface brightness of
 *      the target there (V mag/arcsec^2, as linear radiance and a colour), then the telescope
 *      (exit pupil, transmission), the sky glow (Bortle class) and a simple eye model
 *      (adaptation to the brightest thing in view, detection threshold, loss of colour vision
 *      in dim light) turn it into pixels. Rebuilt only when something changes.
 *   2. drawFrame(): the scene is blurred by the real point-spread width (diffraction + seeing
 *      + your eye's acuity / magnification), shifted by seeing-driven image motion, flipped as
 *      the instrument flips it, and the stars are drawn on top with twinkle and, where the
 *      aperture allows, their Airy rings and diffraction spikes.
 * All formulas live in eyepiece-optics.js (pure, tested in scripts/test_eyepiece.mjs).
 */
import * as O from "./eyepiece-optics.js";
import { julianDay, jdToMs } from "./ephemeris.js";
import { body, vecToRaDec, bvToTemp, tempToRGB } from "./sky-astro.js";
import * as MA from "./moon-astro.js";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const D2R = Math.PI / 180, R2D = 180 / Math.PI;
const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
const amp = sb => Math.pow(10, -0.4 * sb);              // surface brightness -> linear radiance
const fmt = (v, d = 1) => (window.Codex ? Codex.fmt(v, d) : (+v).toFixed(d));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ------------------------------------------------------------ noise --- */
function hash2(x, y, s) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, s) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, s, oct = 4) {
  let a = 0.5, f = 1, t = 0, n = 0;
  for (let i = 0; i < oct; i++) { t += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return t / n;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function gauss(r) { const u = Math.max(1e-9, r()), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
const strSeed = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function lumOf(c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
function normCol(c) { const l = lumOf(c) || 1; return [c[0] / l, c[1] / l, c[2] / l]; }
function starRGB(bv) { const c = tempToRGB(bvToTemp(bv)); return Array.isArray(c) ? c : [c.r, c.g, c.b].map(v => v > 1 ? v / 255 : v); }

/* ------------------------------------------------------------ state --- */
const LA = { name: "Los Angeles", lat: 34.0522, lon: -118.2437, tz: "America/Los_Angeles" };
const state = {
  inst: "dob8", ep: 1, barlow: false,
  instB: "binoculars", epB: 1, barlowB: false,
  target: "moon", seeing: 1.5, bortle: 6, dark: 30, mode: "eye", correct: false, compare: false,
  when: "now", loc: { ...LA }, custom: { aperture: 150, focal: 750 },
  pan: { xi: 0, eta: 0 }, solarOK: false, loupe: false
};
let DATA = null, STARS = null, MOONTEX = null;
const astro = {};                // tonight's sky: jd, moon, planets, galilean, sun, visibility

/* ------------------------------------------------------ instruments --- */
const ICONS = {
  eye: '<path d="M5 20Q32 1 59 20Q32 39 5 20Z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="32" cy="20" r="9" fill="var(--ice)" opacity=".35"/><circle cx="32" cy="20" r="4.5" fill="currentColor"/>',
  binoculars: '<rect x="27" y="14" width="10" height="8" rx="2" fill="currentColor" opacity=".55"/><circle cx="18" cy="21" r="12" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="46" cy="21" r="12" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="18" cy="21" r="7.5" fill="var(--ice)" opacity=".3"/><circle cx="46" cy="21" r="7.5" fill="var(--ice)" opacity=".3"/>',
  refractor70: '<g transform="rotate(-18 32 18)"><rect x="8" y="14" width="40" height="7" rx="2" fill="currentColor" opacity=".85"/><rect x="46" y="12" width="9" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><rect x="4" y="15.5" width="5" height="4" fill="currentColor"/></g><path d="M31 24L21 39M31 24L41 39M31 24V39" stroke="currentColor" stroke-width="1.8" fill="none"/>',
  reflector130: '<g transform="rotate(-24 32 16)"><rect x="10" y="9" width="40" height="13" rx="2.5" fill="currentColor" opacity=".85"/><rect x="42" y="6" width="3" height="4" fill="currentColor"/></g><path d="M30 25V36M22 39h16M30 26l12 5" stroke="currentColor" stroke-width="2" fill="none"/><circle cx="44" cy="32" r="3" fill="currentColor"/>',
  dob8: '<g transform="rotate(-38 30 22)"><rect x="8" y="14" width="44" height="15" rx="3" fill="currentColor" opacity=".85"/><rect x="45" y="11" width="4" height="4" fill="currentColor"/></g><path d="M18 39h26l-2-13h-22z" fill="none" stroke="currentColor" stroke-width="2"/>',
  sct11: '<rect x="20" y="6" width="24" height="18" rx="4" fill="currentColor" opacity=".85"/><circle cx="32" cy="15" r="4" fill="var(--bg)"/><path d="M18 14v14h28V14M32 28v8M24 39h16" fill="none" stroke="currentColor" stroke-width="2"/>',
  obs1m: '<path d="M9 38h46V25a23 23 0 0 0-46 0z" fill="currentColor" opacity=".85"/><path d="M28 3.5h8V25h-8z" fill="var(--bg)"/><path d="M5 38h54" stroke="currentColor" stroke-width="2"/>',
  hubble: '<rect x="3" y="13" width="15" height="9" rx="1" fill="var(--ice)" opacity=".55"/><rect x="46" y="13" width="15" height="9" rx="1" fill="var(--ice)" opacity=".55"/><rect x="18" y="11" width="28" height="14" rx="3" fill="currentColor" opacity=".9"/><path d="M46 12l6-5" stroke="currentColor" stroke-width="2"/><path d="M18 17h28" stroke="var(--bg)" stroke-width="1"/>',
  webb: '<path d="M8 33l24 5 24-5-24-6z" fill="var(--nebula)" opacity=".55"/><g fill="var(--sol)" stroke="var(--bg)" stroke-width=".8"><polygon points="32,4 37,7 37,13 32,16 27,13 27,7"/><polygon points="22,10 27,13 27,19 22,22 17,19 17,13"/><polygon points="42,10 47,13 47,19 42,22 37,19 37,13"/><polygon points="32,16 37,19 37,25 32,28 27,25 27,19"/><polygon points="22,22 27,25 22,28 17,25"/><polygon points="42,22 47,25 42,28 37,25"/></g>',
  custom: '<path d="M10 12h44M10 22h44M10 32h44" stroke="currentColor" stroke-width="2" opacity=".5"/><circle cx="22" cy="12" r="4" fill="currentColor"/><circle cx="42" cy="22" r="4" fill="var(--ice)"/><circle cx="30" cy="32" r="4" fill="currentColor"/>'
};
function instById(id) {
  const i = DATA.instruments.find(x => x.id === id);
  if (i && i.custom) return { ...i, aperture: state.custom.aperture, focal: state.custom.focal };
  return i;
}
function instSpec(i) {
  if (i.kind === "eye") return "7 mm pupil";
  if (i.kind === "binocular") return `${i.aperture} mm · ${i.fixedMag}×`;
  if (i.kind === "camera") return `${i.aperture / 1000} m · ${i.infrared ? "infrared" : "visible"}`;
  return `${Math.round(i.aperture)} mm · f/${fmt(i.focal / i.aperture, 1)}`;
}
function readoutFor(which) {
  const inst = instById(which === "B" ? state.instB : state.inst);
  const ep = DATA.eyepieces[which === "B" ? state.epB : state.ep];
  const bar = inst.kind === "telescope" && (which === "B" ? state.barlowB : state.barlow) ? 2 : 1;
  const r = O.instrumentReadout(inst, ep, { barlow: bar, seeing: state.seeing, bortleClass: state.bortle, minutesInDark: state.dark });
  r.inst = inst; r.ep = ep; r.barlow = bar;
  return r;
}

/* ----------------------------------------------------- tonight's sky --- */
function tzOffsetMin(date, tz) {
  try {
    const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(date);
    const g = t => +p.find(x => x.type === t).value;
    return (Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second")) - date.getTime()) / 60000;
  } catch (e) { return -date.getTimezoneOffset(); }
}
function whenDate() {
  const now = new Date();
  if (state.when === "now") return now;
  const off = tzOffsetMin(now, state.loc.tz);
  const local = new Date(now.getTime() + off * 60000);
  let t = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 21, 0) - off * 60000;
  if (local.getUTCHours() < 5) t -= 86400000;          // after midnight: "tonight" was yesterday evening
  return new Date(t);
}
function localTime(ms) {
  try { return new Intl.DateTimeFormat("en-US", { timeZone: state.loc.tz, hour: "numeric", minute: "2-digit" }).format(new Date(ms)); }
  catch (e) { return new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }); }
}

function computeSky() {
  const date = whenDate(), jd = julianDay(date);
  astro.jd = jd; astro.date = date;
  const ph = MA.phase(jd), lib = MA.libration(jd);
  astro.moon = {
    Rarc: ph.diamArcmin * 30, P: lib.P, l: lib.l, b: lib.b, illum: ph.illum, name: ph.name,
    sun: MA.selenoVec(lib.sunLon, lib.sunLat), earthIllum: ph.earthIllumFromMoon, ra: lib.ra, dec: lib.dec, diamArcmin: ph.diamArcmin
  };
  astro.planets = {};
  for (const id of ["venus", "mars", "jupiter", "saturn"]) astro.planets[id] = O.planetView(id, jd);
  astro.gal = O.galileanPositions(jd);
  const sun = body("sun", jd);
  astro.sunDiam = sun.diam;
  astro.sunRaDec = vecToRaDec(sun.v);
  astro.vis = {};
  const { lat, lon } = state.loc;
  for (const t of DATA.targets) {
    const tgt = t.ra != null ? { ra: t.ra, dec: t.dec } : t.id;
    try { astro.vis[t.id] = O.visibility(tgt, jd, lat, lon); } catch (e) { astro.vis[t.id] = null; }
  }
  astro.sunAlt = astro.vis.sun ? astro.vis.sun.alt : -90;
  // centre of each target on the sky (for background stars)
  astro.center = {};
  for (const t of DATA.targets) {
    if (t.ra != null) astro.center[t.id] = { ra: t.ra, dec: t.dec };
    else if (t.id === "moon") astro.center.moon = { ra: lib.ra, dec: lib.dec };
    else if (t.id === "sun") astro.center.sun = astro.sunRaDec;
    else astro.center[t.id] = vecToRaDec(astro.planets[t.id].v);
  }
  starCache.clear();
}

/* ------------------------------------------------------ star catalogue --- */
const starCache = new Map();
/** Real stars (Hipparcos, to mag 6) around a target, in tangent-plane arcsec, plus the target's own stars. */
function catalogStars(tid) {
  if (starCache.has(tid)) return starCache.get(tid);
  const c = astro.center[tid], out = [];
  const t = DATA.targets.find(x => x.id === tid);
  const explicit = [];
  if (t.kind === "double") {
    const base = [];
    t.stars.forEach((s, i) => {
      let ra, dec;
      if (s.ra != null) { ra = s.ra; dec = s.dec; }
      else {
        const b0 = s.of != null ? base[s.of] : base[0] || { ra: t.ra, dec: t.dec };
        const b = b0 || { ra: t.ra, dec: t.dec };
        ra = b.ra + s.sep / 3600 * Math.sin(s.pa * D2R) / Math.cos(b.dec * D2R);
        dec = b.dec + s.sep / 3600 * Math.cos(s.pa * D2R);
      }
      if (i === 0 && s.ra == null) { ra = t.ra; dec = t.dec; }
      base[i] = { ra, dec };
      explicit.push({ ra, dec, m: s.mag, bv: s.bv, name: s.name });
    });
  }
  if (tid === "m42") DATA.trapezium.forEach(s => explicit.push({ ra: s.ra, dec: s.dec, m: s.mag, bv: s.bv, name: s.name }));
  for (const e of explicit) { const p = O.tangentPlane(e.ra, e.dec, c.ra, c.dec); out.push({ xi: p.xi, eta: p.eta, m: e.m, bv: e.bv, real: true }); }
  const R = 7.5 * 3600;
  for (const s of STARS) {
    const p = O.tangentPlane(s[1], s[2], c.ra, c.dec);
    if (!p.front || Math.abs(p.xi) > R || Math.abs(p.eta) > R) continue;
    if (explicit.some(e => { const q = O.tangentPlane(e.ra, e.dec, c.ra, c.dec); return Math.hypot(q.xi - p.xi, q.eta - p.eta) < 90; })) continue;
    out.push({ xi: p.xi, eta: p.eta, m: s[3], bv: s[4], real: true });
  }
  // cluster members fainter than the catalogue (seeded, realistic numbers and spread)
  if (tid === "m45" || tid === "m42") {
    const r = rng(strSeed(tid + "members"));
    const n = tid === "m45" ? 240 : 70, sig = tid === "m45" ? 2000 : 260;
    for (let k = 0; k < n; k++) {
      const m = tid === "m45" ? 6.2 + 7 * Math.pow(r(), 0.75) : 9.5 + 5 * r();
      out.push({ xi: gauss(r) * sig, eta: gauss(r) * sig, m, bv: tid === "m45" ? 0.1 + 0.9 * r() * r() : 0.2 + r() * 1.2 });
    }
  }
  if (tid === "m42") {                        // the embedded cluster only infrared light gets out of
    const r = rng(strSeed("m42ir"));
    for (let k = 0; k < 420; k++) out.push({ xi: gauss(r) * 170 - 20, eta: gauss(r) * 190 - 30, m: 11 + 7 * Math.pow(r(), 0.6), bv: 1.4, irOnly: true });
  }
  starCache.set(tid, out);
  return out;
}
/** Faint field stars fainter than the catalogue, placed at random but with the real average
 *  number per square degree ([HNSKY] counts), on a fixed grid of seeded cells so they stay put. */
function fieldStars(tid, cx, cy, radiusArcsec, mlim) {
  const out = [], seed = strSeed(tid), mmax = Math.min(mlim, 16.5);
  for (let k = 6; k < mmax; k++) {
    const dens = O.starsPerSqDeg(k + 1) - O.starsPerSqDeg(k);   // per sq deg in [k, k+1)
    const cell = Math.sqrt(3 / dens) * 3600;                         // ~3 stars per cell
    const i0 = Math.floor((cx - radiusArcsec) / cell), i1 = Math.floor((cx + radiusArcsec) / cell);
    const j0 = Math.floor((cy - radiusArcsec) / cell), j1 = Math.floor((cy + radiusArcsec) / cell);
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > 9000) continue;
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const r = rng(Math.imul(seed ^ (k * 7919), 2654435761) ^ Math.imul(i, 73856093) ^ Math.imul(j, 19349663));
      const n = Math.floor(r() * 6.99);                            // mean 3
      for (let q = 0; q < n; q++) {
        const m = k + r(), x = (i + r()) * cell, y = (j + r()) * cell;
        if (m > mmax) continue;
        out.push({ xi: x, eta: y, m, bv: 0.35 + 0.9 * r() * r() + (r() < 0.1 ? -0.3 : 0) });
      }
    }
  }
  return out;
}

/* ---------------------------------------------------- scene painting --- */
/* Each painter adds naked-eye radiance (linear units, amp(sb)) times a colour whose luminance is 1
 * into buf at pixel k. Coordinates: xi (arcsec, +east) and eta (arcsec, +north) about the target. */

function paintMoon(buf, N, px, pan, S) {
  const M = astro.moon, R = M.Rarc, T = MOONTEX;
  const P = M.P * D2R, cP = Math.cos(P), sP = Math.sin(P);
  const l = M.l * D2R, b = M.b * D2R, cl = Math.cos(l), sl = Math.sin(l), cb = Math.cos(b), sb = Math.sin(b);
  const E0 = -sl, E1 = cl, N0 = -sb * cl, N1 = -sb * sl, N2 = cb, S0 = cb * cl, S1 = cb * sl, S2 = sb;
  const sun = M.sun, base = amp(3.3) / (T.mean * 0.5), esh = amp(12.6) * M.earthIllum / T.mean;
  const col = normCol([1.0, 0.975, 0.93]);
  const k = 2.2;                                             // relief exaggeration for the coarse map
  // mip level: about one texel per screen pixel (Rarc / 1737.4 km = arcsec per km on the Moon)
  const lvl = clamp(Math.floor(Math.log2(Math.max(1, px / (T.levels[0].texKm * M.Rarc / 1737.4)) * 1.2)), 0, T.levels.length - 1);
  const { W, H, alb, hgt, texKm } = T.levels[lvl], hScale = T.hScale;
  const sampleA = (u, v) => {
    u = ((u % W) + W) % W; v = clamp(v, 0, H - 1.001);
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, i2 = (i + 1) % W, j2 = Math.min(j + 1, H - 1);
    return (alb[j * W + i] * (1 - fu) + alb[j * W + i2] * fu) * (1 - fv) + (alb[j2 * W + i] * (1 - fu) + alb[j2 * W + i2] * fu) * fv;
  };
  const sampleH = (u, v) => { u = ((Math.round(u) % W) + W) % W; v = clamp(Math.round(v), 0, H - 1); return hgt[v * W + u]; };
  const half = N / 2, rpx = R / px;
  const i0 = Math.max(0, Math.floor(half + pan.xi / px - rpx - 2)), i1 = Math.min(N - 1, Math.ceil(half + pan.xi / px + rpx + 2));
  const j0 = Math.max(0, Math.floor(half + pan.eta / px - rpx - 2)), j1 = Math.min(N - 1, Math.ceil(half + pan.eta / px + rpx + 2));
  for (let j = j0; j <= j1; j++) {
    const eta = pan.eta - (j + 0.5 - half) * px;
    for (let i = i0; i <= i1; i++) {
      const xi = pan.xi - (i + 0.5 - half) * px;
      const xL = (-xi * cP + eta * sP) / R, yL = (xi * sP + eta * cP) / R;
      const rr = xL * xL + yL * yL;
      const d = Math.sqrt(rr), cov = clamp((1 - d) * rpx + 0.5, 0, 1);
      if (cov <= 0) continue;
      const z = Math.sqrt(Math.max(0, 1 - Math.min(rr, 1)));
      const qx = xL * E0 + yL * N0 + z * S0, qy = xL * E1 + yL * N1 + z * S1, qz = yL * N2 + z * S2;
      const lon = Math.atan2(qy, qx), lat = Math.asin(clamp(qz, -1, 1));
      const u = (lon / (2 * Math.PI) + 0.5) * W - 0.5, v = (0.5 - lat / Math.PI) * H - 0.5;
      const a = sampleA(u, v) / 255;
      const clat = Math.max(Math.cos(lat), 0.08);
      const sE = (sampleH(u + 1, v) - sampleH(u - 1, v)) * hScale / (2 * texKm * clat);
      const sN = (sampleH(u, v - 1) - sampleH(u, v + 1)) * hScale / (2 * texKm);
      const slon = Math.sin(lon), clon = Math.cos(lon), slat = Math.sin(lat);
      let nx = qx - k * (sE * -slon + sN * -slat * clon), ny = qy - k * (sE * clon + sN * -slat * slon), nz = qz - k * sN * clat;
      const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const mu0 = nx * sun[0] + ny * sun[1] + nz * sun[2];
      const mu = Math.max(0.04, nx * S0 + ny * S1 + nz * S2);
      const geo = qx * sun[0] + qy * sun[1] + qz * sun[2];      // smooth sphere: soften the terminator
      let L = mu0 > 0 ? base * a * mu0 / (mu0 + mu) * smooth(-0.06, 0.02, geo) : 0;
      L += esh * a * Math.pow(z, 0.3);                          // earthshine on the night side
      L *= cov;
      const o = (j * N + i) * 3;
      buf[o] += L * col[0]; buf[o + 1] += L * col[1]; buf[o + 2] += L * col[2];
    }
  }
}

/* Jupiter's belts and zones (planetographic latitude, deg) - an illustrative average appearance. */
const JUP_BANDS = [
  [90, [0.62, 0.6, 0.56]], [52, [0.66, 0.62, 0.55]], [44, [0.84, 0.8, 0.72]], [34, [0.72, 0.62, 0.5]], [29, [0.9, 0.86, 0.78]],
  [22, [0.92, 0.88, 0.8]], [19, [0.62, 0.45, 0.33]], [9, [0.66, 0.5, 0.38]], [7, [0.95, 0.9, 0.8]], [-6, [0.94, 0.88, 0.76]],
  [-8, [0.66, 0.5, 0.38]], [-19, [0.64, 0.47, 0.35]], [-21, [0.93, 0.88, 0.8]], [-27, [0.92, 0.87, 0.78]], [-30, [0.72, 0.63, 0.52]],
  [-35, [0.76, 0.67, 0.56]], [-40, [0.85, 0.81, 0.73]], [-50, [0.7, 0.66, 0.58]], [-90, [0.62, 0.6, 0.56]]
];
function bandColor(tab, lat) {
  for (let i = 0; i < tab.length - 1; i++) {
    if (lat <= tab[i][0] && lat >= tab[i + 1][0]) {
      const f = smooth(tab[i][0], tab[i + 1][0], lat);
      const a = tab[i][1], b = tab[i + 1][1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return tab[tab.length - 1][1];
}
function planetTexture(id, lat, lon) {
  if (id === "jupiter") {
    const t = fbm(lon * 2.2, lat * 0.16, 7, 4);
    const lp = lat + (t - 0.5) * 4 + Math.sin(lon * 7 + lat * 0.5) * 0.5;
    let c = bandColor(JUP_BANDS, lp);
    const fest = Math.abs(lat) < 7 ? smooth(0.62, 0.8, fbm(lon * 5, lat * 0.5, 11, 3)) * 0.18 : 0;
    const g = Math.hypot(((lon + 0.6) % (2 * Math.PI) - Math.PI + Math.PI) * R2D / 8.5, (lat + 22.5) / 5.5);   // Great Red Spot (illustrative longitude)
    const grs = Math.exp(-Math.pow(Math.max(0, g), 4) * 0.8);
    c = [c[0] - fest * 0.3, c[1] - fest * 0.4, c[2] - fest * 0.45];
    return [c[0] * (1 - grs) + 0.82 * grs, c[1] * (1 - grs) + 0.5 * grs, c[2] * (1 - grs) + 0.38 * grs];
  }
  if (id === "saturn") {
    const t = fbm(lon * 1.5, lat * 0.12, 3, 3);
    const lp = lat + (t - 0.5) * 2;
    const band = 0.06 * Math.sin(lp * 0.32) + (Math.abs(lp) > 60 ? -0.12 : 0) + (Math.abs(lp) < 12 ? 0.05 : 0);
    return [0.93 + band, 0.84 + band, 0.62 + band * 0.7];
  }
  if (id === "mars") {
    if (Math.abs(lat) > 72 + 4 * vnoise(lon * 3, 0, 5)) return [1.0, 0.98, 0.96];
    const d = smooth(0.52, 0.66, fbm(lon * 1.3 + 4, lat * 0.03 + 2, 21, 4)) * (1 - smooth(40, 60, Math.abs(lat)) * 0.6);
    return [0.95 - 0.38 * d, 0.56 - 0.24 * d, 0.34 - 0.13 * d];
  }
  if (id === "venus") { const t = fbm(lon * 1.2, lat * 0.05, 9, 3); return [1.0, 0.97 - 0.02 * t, 0.86 - 0.04 * t]; }
  return [1, 1, 1];
}
function paintPlanet(buf, N, px, pan, id) {
  const P = astro.planets[id], t = DATA.targets.find(x => x.id === id);
  const flat = { jupiter: 0.9351, saturn: 0.9020, mars: 0.9941, venus: 1 }[id];
  const R = P.diam / 2, pa = (P.PA || 0) * D2R, cP = Math.cos(pa), sP = Math.sin(pa);
  const inc = P.phaseAngle * D2R, chi = P.chi * D2R;
  const s0 = Math.sin(inc) * Math.sin(chi), s1 = Math.sin(inc) * Math.cos(chi), s2 = Math.cos(inc);
  const kMin = { jupiter: 0.9, saturn: 0.9, mars: 0.85, venus: 0.62 }[id];
  const cm = (astro.jd * { jupiter: 870.27, saturn: 810.79, mars: 350.89, venus: -1.48 }[id]) % 360 * D2R;  // rotation (deg/day)
  const ringB = id === "saturn" ? P.ringTilt * D2R : 0, sB = Math.sin(ringB);
  const ext = id === "saturn" ? 2.35 : 1.05;
  const half = N / 2, rpx = R * ext / px;
  const ci = half + pan.xi / px, cj = half + pan.eta / px;
  const i0 = Math.max(0, Math.floor(ci - rpx - 2)), i1 = Math.min(N - 1, Math.ceil(ci + rpx + 2));
  const j0 = Math.max(0, Math.floor(cj - rpx - 2)), j1 = Math.min(N - 1, Math.ceil(cj + rpx + 2));
  const ss = rpx < 60 ? 3 : 2, base = amp(t.sb);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    let r = 0, g = 0, bl = 0;
    for (let sj = 0; sj < ss; sj++) for (let si = 0; si < ss; si++) {
      const xi = pan.xi - (i + (si + 0.5) / ss - half) * px, eta = pan.eta - (j + (sj + 0.5) / ss - half) * px;
      const xL = (-xi * cP + eta * sP) / R, yL = (xi * sP + eta * cP) / R;
      const yy = yL / flat, rr = xL * xL + yy * yy;
      let c = null;
      if (rr < 1) {
        const z = Math.sqrt(1 - rr);
        const nxi = -xL * cP + yy * sP, neta = xL * sP + yy * cP;
        const mu0 = nxi * s0 + neta * s1 + z * s2, mu = z;
        if (mu0 > 0) {
          const lat = Math.asin(clamp(yy, -1, 1)) * R2D, lon = Math.atan2(xL, z) + cm;
          const tex = planetTexture(id, lat, lon);
          const I = Math.pow(mu0, kMin) * Math.pow(mu, kMin - 1) * smooth(0, 0.08, mu0);
          c = [tex[0] * I, tex[1] * I, tex[2] * I];
        } else c = [0, 0, 0];
      }
      if (id === "saturn") {
        const sb = Math.abs(sB) < 0.004 ? (sB < 0 ? -0.004 : 0.004) : sB;
        const Z = -yL / sb, rho = Math.hypot(xL, Z);
        let op = 0, br = 0;
        if (rho > 1.239 && rho < 1.527) { op = 0.12; br = 0.35; }
        else if (rho >= 1.527 && rho < 1.95) { op = 0.95; br = 0.78 + 0.22 * smooth(1.53, 1.75, rho); }
        else if (rho >= 1.95 && rho < 2.025) { op = 0.08; br = 0.2; }
        else if (rho >= 2.025 && rho < 2.27) { op = Math.abs(rho - 2.214) < 0.006 ? 0.1 : 0.62; br = 0.72; }
        if (op > 0) {
          // planet's shadow across the rings behind it (sun direction ~ observer, small phase)
          const rc = [0.93 * br, 0.88 * br, 0.76 * br];
          if (Z > 0 || rr >= 1) c = c ? [c[0] * (1 - op) + rc[0] * op, c[1] * (1 - op) + rc[1] * op, c[2] * (1 - op) + rc[2] * op] : rc.map(v => v * op);
        }
      }
      if (c) { r += c[0]; g += c[1]; bl += c[2]; }
    }
    const n = ss * ss, o = (j * N + i) * 3;
    buf[o] += r / n * base; buf[o + 1] += g / n * base; buf[o + 2] += bl / n * base;
  }
}

function paintSun(buf, N, px, pan) {
  const R = astro.sunDiam / 2, half = N / 2, rpx = R / px;
  const day = Math.floor(astro.jd - 0.5);
  const r = rng(day * 2654435761);
  const spots = [];                          // illustrative sunspot groups, new each day
  const groups = 2 + Math.floor(r() * 5);
  for (let g = 0; g < groups; g++) {
    const lat = (r() < 0.5 ? -1 : 1) * (6 + r() * 24) * D2R, lon = (r() * 150 - 75) * D2R;
    const n = 1 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) spots.push({ lat: lat + (r() - 0.5) * 0.05, lon: lon + (k - n / 2) * 0.035 + (r() - 0.5) * 0.02, rad: (k === 0 ? 0.012 : 0.006) * (0.6 + r()) });
  }
  const sv = spots.map(s => [Math.cos(s.lat) * Math.sin(s.lon), Math.sin(s.lat), Math.cos(s.lat) * Math.cos(s.lon), s.rad]);
  const ci = half + pan.xi / px, cj = half + pan.eta / px;
  const i0 = Math.max(0, Math.floor(ci - rpx - 2)), i1 = Math.min(N - 1, Math.ceil(ci + rpx + 2));
  const j0 = Math.max(0, Math.floor(cj - rpx - 2)), j1 = Math.min(N - 1, Math.ceil(cj + rpx + 2));
  const base = amp(2.5);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const xi = pan.xi - (i + 0.5 - half) * px, eta = pan.eta - (j + 0.5 - half) * px;
    const x = -xi / R, y = eta / R, rr = x * x + y * y, d = Math.sqrt(rr);
    const cov = clamp((1 - d) * rpx + 0.5, 0, 1);
    if (cov <= 0) continue;
    const mu = Math.sqrt(Math.max(0, 1 - Math.min(rr, 1)));
    let I = 1 - 0.6 * (1 - mu) - 0.1 * (1 - mu) * (1 - mu);       // limb darkening
    I *= 1 + 0.07 * (vnoise(xi / 0.9, eta / 0.9, 3) - 0.5) * 2;    // granulation, ~1" cells
    if (mu < 0.35) I *= 1 + 0.12 * smooth(0.55, 0.8, fbm(xi / 25, eta / 25, 8, 3)) * (1 - mu / 0.35);   // faculae
    for (const s of sv) {
      const dd = Math.hypot(x - s[0], y - s[1]) / (s[3] * (0.4 + 0.6 * Math.max(s[2], 0.1)));
      if (s[2] > 0 && dd < 2.4) I *= dd < 1 ? 0.22 : 0.22 + 0.5 * smooth(1, 1.15, dd) + 0.28 * smooth(2.1, 2.4, dd);
    }
    const L = base * I * cov, o = (j * N + i) * 3;
    buf[o] += L; buf[o + 1] += L; buf[o + 2] += L;
  }
}

function G(x, y, cx, cy, sx, sy, paDeg) {           // elongated gaussian; paDeg: major axis PA (north through east)
  const a = (paDeg || 0) * D2R, dx = x - cx, dy = y - cy;
  const u = dx * Math.sin(a) + dy * Math.cos(a), v = dx * Math.cos(a) - dy * Math.sin(a);
  return Math.exp(-0.5 * (u * u / (sy * sy) + v * v / (sx * sx)));
}
/* Orion Nebula model, arcminutes about the Trapezium (x east, y north). Surface brightnesses
 * (V mag/arcsec^2) for the Huygens region ~17, the wings ~20-21, the outer glow ~22. */
function m42(x, y, ir) {
  const n = fbm(x * 0.42 + 3, y * 0.42 + 7, 3, 5), n2 = fbm(x * 1.4 + 1, y * 1.4, 9, 3);
  const core = amp(16.9) * G(x, y, -0.5, -0.9, 1.5, 2.0, 20);
  const inner = amp(18.4) * G(x, y, -1.0, -2.6, 3.6, 4.8, 10);
  const bar = amp(17.9) * G(x, y, 1.4, -1.9, 0.45, 2.8, 60);
  const wings = amp(19.9) * (G(x, y, -5.5, -0.5, 2.8, 5, -20) + 0.8 * G(x, y, -8, -7, 3.5, 5, -10) + 0.6 * G(x, y, -9.5, -13, 4, 6, 0)
    + 0.95 * G(x, y, 6.5, -2.5, 2.6, 4.5, 30) + 0.75 * G(x, y, 9.5, -8, 3.4, 5, 15) + 0.55 * G(x, y, 10, -14, 4.5, 5.5, 0));
  const glow = amp(21.2) * G(x, y, 0, -9, 11, 13, 0) + amp(22.3) * G(x, y, 0, -6, 20, 22, 0);
  let dust = 1 - 0.88 * G(x, y, 2.4, 2.4, 1.3, 2.8, 35) - 0.75 * G(x, y, 3.8, 5.0, 3.2, 1.3, 70) - 0.5 * G(x, y, -2.8, 4.2, 2, 1.4, -30);
  dust = Math.max(0.03, dust) * (ir ? 0.7 + 0.3 * dust : 1);
  const m43 = amp(19.4) * G(x, y, 4.9, 7.4, 1.5, 1.8, 0) * (1 - 0.8 * G(x, y, 6.4, 7.4, 0.7, 2.4, 0));
  const tex = 0.45 + 1.1 * n * (0.8 + 0.4 * n2);
  const L = ((core + inner + bar) * (0.75 + 0.5 * n2) + (wings + glow) * tex) * dust + m43 * (0.7 + 0.6 * n);
  const wO = clamp((core * 1.1 + inner * 0.5 + bar * 0.4) / Math.max(L, 1e-30), 0, 1);
  return { L, wO };
}
/* Andromeda: Sersic bulge (n = 2.2, Re = 4.4') and exponential disk (Rd ~ 22') after
 * Courteau et al. 2011, ApJ 739, 20 (3.6 um structure, V-band levels estimated), inclined 77 deg at PA 38 deg. */
function m31(x, y) {
  const pa = 38 * D2R, u = x * Math.sin(pa) + y * Math.cos(pa), v = x * Math.cos(pa) - y * Math.sin(pa);
  const rb = Math.hypot(u, v / 0.72) + 0.02;
  const bulge = amp(19.6) * Math.exp(-4.07 * (Math.pow(rb / 4.4, 1 / 2.2) - 1));
  const rd = Math.hypot(u, v / 0.24);
  let disk = rd < 100 ? amp(20.4) * Math.exp(-rd / 22) * (1 - smooth(85, 100, rd)) : 0;
  const n = fbm(u * 0.25 + 9, v * 0.9, 13, 4);
  disk *= 0.75 + 0.5 * n;
  const ring = Math.exp(-Math.pow((rd - 55) / 7, 2)) * smooth(0.5, 0.75, fbm(u * 0.5, v * 1.5, 31, 3));
  disk *= 1 + 0.9 * ring;
  const near = v < 0 ? 1 : 0.35;
  const dust = 1 - near * (0.55 * Math.exp(-Math.pow((rd - 27) / 2.2, 2)) + 0.45 * Math.exp(-Math.pow((rd - 44) / 2.6, 2))) * (0.6 + 0.6 * n);
  const r32 = Math.hypot(x + 0.47, (y + 24.2) / 0.8) + 0.01;
  const m32 = amp(17.6) * Math.exp(-3.67 * (Math.pow(r32 / 0.5, 1 / 2) - 1));
  const a110 = 170 * D2R, u2 = (x + 26.8) * Math.sin(a110) + (y - 24.9) * Math.cos(a110), v2 = (x + 26.8) * Math.cos(a110) - (y - 24.9) * Math.sin(a110);
  const r110 = Math.hypot(u2, v2 / 0.55) + 0.01;
  const m110 = amp(21.8) * Math.exp(-2.67 * (Math.pow(r110 / 2.6, 1 / 1.5) - 1));
  return { bulge: bulge * dust + m32 + m110, disk: disk * dust, ring: ring * disk };
}
/* Pleiades reflection nebulosity (~21.5-23 mag/arcsec^2), streaky, around the brightest stars. */
let M45NEB = null;
function m45(x, y) {
  if (!M45NEB) {
    const c = { ra: 56.75, dec: 24.117 }, list = [[56.5816, 23.9484, 1.0, -2, -3], [56.4567, 24.3677, 0.55], [56.2189, 24.1133, 0.5], [56.8712, 24.1051, 0.45], [56.3021, 24.4673, 0.35], [57.2906, 24.0534, 0.25]];
    M45NEB = list.map(s => { const p = O.tangentPlane(s[0], s[1], c.ra, c.dec); return [p.xi / 60 + (s[3] || 0), p.eta / 60 + (s[4] || 0), s[2]]; });
  }
  const a = 145 * D2R, u = x * Math.sin(a) + y * Math.cos(a), v = x * Math.cos(a) - y * Math.sin(a);
  const streak = 0.35 + 1.3 * fbm(u * 0.08, v * 0.7, 41, 4);
  let L = 0;
  for (const s of M45NEB) L += s[2] * Math.exp(-((x - s[0]) ** 2 + (y - s[1]) ** 2) / (2 * 11 * 11));
  L += 0.9 * Math.exp(-((x - M45NEB[0][0] + 1) ** 2 + (y - M45NEB[0][1] + 2) ** 2) / (2 * 4 * 4));
  return amp(21.9) * L * streak;
}

function paintDeepSky(buf, N, px, pan, tid, ir, photo) {
  const half = N / 2;
  const oc = normCol([0.72, 1.0, 0.86]), ha = normCol([1.0, 0.3, 0.42]), o3 = normCol([0.45, 0.95, 0.92]);
  const bulgeC = normCol([1.0, 0.86, 0.66]), diskC = normCol([0.82, 0.88, 1.0]), ringC = normCol([0.55, 0.7, 1.0]);
  const blue = normCol([0.45, 0.62, 1.0]);
  const irC = normCol([1.0, 0.62, 0.35]), irC2 = normCol([1.0, 0.85, 0.7]);
  for (let j = 0; j < N; j++) {
    const y = (pan.eta - (j + 0.5 - half) * px) / 60;
    for (let i = 0; i < N; i++) {
      const x = (pan.xi - (i + 0.5 - half) * px) / 60;
      const o = (j * N + i) * 3;
      if (tid === "m42") {
        const { L, wO } = m42(x, y, ir);
        let c;
        if (ir) c = [irC[0] * (1 - wO) + irC2[0] * wO, irC[1] * (1 - wO) + irC2[1] * wO, irC[2] * (1 - wO) + irC2[2] * wO];
        else if (photo) c = [ha[0] * (1 - wO) + o3[0] * wO, ha[1] * (1 - wO) + o3[1] * wO, ha[2] * (1 - wO) + o3[2] * wO];
        else c = oc;
        buf[o] += L * c[0]; buf[o + 1] += L * c[1]; buf[o + 2] += L * c[2];
      } else if (tid === "m31") {
        const m = m31(x, y);
        const d = ir ? irC2 : diskC, bgc = ir ? irC : bulgeC;
        buf[o] += m.bulge * bgc[0] + m.disk * d[0] + (photo ? m.ring * (ringC[0] - d[0]) : 0);
        buf[o + 1] += m.bulge * bgc[1] + m.disk * d[1] + (photo ? m.ring * (ringC[1] - d[1]) : 0);
        buf[o + 2] += m.bulge * bgc[2] + m.disk * d[2] + (photo ? m.ring * (ringC[2] - d[2]) : 0);
      } else if (tid === "m45") {
        const L = m45(x, y) * (ir ? 0.4 : 1), c = ir ? irC : blue;
        buf[o] += L * c[0]; buf[o + 1] += L * c[1]; buf[o + 2] += L * c[2];
      }
    }
  }
}

/* ------------------------------------------------------------ views --- */
const views = [];
let sprite = null;
const spriteCache = new Map();
function makeSprite(rgb) {
  const key = rgb.map(v => Math.round(clamp(v, 0, 1) * 15)).join(",");
  if (spriteCache.has(key)) return spriteCache.get(key);
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d"), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  const [r, gg, b] = key.split(",").map(v => Math.round(+v / 15 * 255));
  for (let k = 0; k <= 10; k++) { const t = k / 10; grd.addColorStop(t, `rgba(${Math.min(255, r + 70 * Math.exp(-t * 8))},${Math.min(255, gg + 70 * Math.exp(-t * 8))},${Math.min(255, b + 70 * Math.exp(-t * 8))},${Math.exp(-t * t * 4.6).toFixed(3)})`); }
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  spriteCache.set(key, c);
  return c;
}

class View {
  constructor(slot) {
    this.slot = slot;
    const el = document.createElement("figure");
    el.className = "ep-view";
    el.innerHTML = `
      <div class="ep-view-head" ${slot === "A" ? "hidden" : ""}>
        <select class="ep-vsel" aria-label="Instrument ${slot}"></select>
        <select class="ep-esel" aria-label="Eyepiece ${slot}"></select>
      </div>
      <div class="ep-scope">
        <canvas role="img" aria-label="Simulated eyepiece view"></canvas>
        <div class="ep-flags" aria-live="polite"></div>
        <div class="ep-block" hidden></div>
        <svg class="ep-compass" viewBox="-30 -30 60 60" aria-hidden="true"><g class="cg"><path d="M0 0V-20" /><path d="M0 0H-20"/><text x="0" y="-23">N</text><text x="-25" y="3">E</text></g></svg>
        <div class="ep-drag" hidden>Drag to look around</div>
        <button class="ep-loupe" type="button" aria-pressed="false" title="Draw the view 4× bigger on your screen"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15 15l6 6M7 10h6M10 7v6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span>Enlarge ×4</span></button>
      </div>
      <figcaption class="ep-cap"><b class="ep-cap-t"></b><span class="ep-cap-o"></span></figcaption>
      <button class="btn small ep-suggest" type="button" hidden></button>`;
    this.el = el;
    this.canvas = $("canvas", el); this.ctx = this.canvas.getContext("2d");
    this.scene = document.createElement("canvas"); this.sctx = this.scene.getContext("2d");
    this.flags = $(".ep-flags", el); this.block = $(".ep-block", el); this.cap = $(".ep-cap", el);
    this.compass = $(".ep-compass .cg", el); this.drag = $(".ep-drag", el); this.head = $(".ep-view-head", el);
    this.jx = 0; this.jy = 0; this.vx = 0; this.vy = 0; this.boil = 0; this.stars = []; this.dirty = true;
    this.N = 0;
    this.bindPan();
  }
  get which() { return this.slot; }
  size() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const N = Math.max(120, Math.min(820, Math.round(r.width * dpr)));
    if (N !== this.N) { this.N = N; this.canvas.width = this.canvas.height = N; this.dirty = true; }
    return N;
  }
  orientation() {
    const inst = this.r.inst;
    if (state.correct) return "correct";
    return inst.orientation || "correct";
  }
  bindPan() {
    let down = null;
    this.canvas.addEventListener("pointerdown", e => { if (!this.r || this.r.pannable === false) return; down = { x: e.clientX, y: e.clientY, pan: { ...state.pan } }; this.canvas.setPointerCapture(e.pointerId); interacting(true); });
    this.canvas.addEventListener("pointermove", e => {
      if (!down) return;
      const rect = this.canvas.getBoundingClientRect(), k = this.N / rect.width * this.px;
      let dx = (e.clientX - down.x) * k, dy = (e.clientY - down.y) * k;
      const o = this.orientation();
      if (o === "mirror") dx = -dx; if (o === "rotate") { dx = -dx; dy = -dy; }
      state.pan.xi = down.pan.xi + dx; state.pan.eta = down.pan.eta + dy;
      clampPan(); markDirty();
    });
    const up = () => { if (down) { down = null; interacting(false); } };
    this.canvas.addEventListener("pointerup", up); this.canvas.addEventListener("pointercancel", up);
    this.canvas.addEventListener("dblclick", () => { state.pan = { xi: 0, eta: 0 }; markDirty(); });
  }
}
function clampPan() {
  const t = DATA.targets.find(x => x.id === state.target);
  let lim = 0;
  if (t.id === "moon") lim = astro.moon.Rarc;
  else if (t.id === "sun") lim = astro.sunDiam / 2;
  else if (t.kind === "planet") lim = astro.planets[t.id].diam * (t.id === "saturn" ? 1.3 : 0.6) + (t.id === "jupiter" ? 28 * astro.planets.jupiter.diam / 2 : 0);
  else if (t.extent) lim = t.extent * 60 * 0.6;
  else lim = 300;
  const r = Math.hypot(state.pan.xi, state.pan.eta);
  if (r > lim) { state.pan.xi *= lim / r; state.pan.eta *= lim / r; }
}

let draft = false, draftTimer = 0;
function interacting(on) {
  clearTimeout(draftTimer);
  if (on) draft = true;
  else draftTimer = setTimeout(() => { draft = false; markDirty(); }, 160);
}
function markDirty() { views.forEach(v => { v.dirty = true; }); }

/* Build the tone-mapped scene of one view. */
function buildScene(view) {
  const Nfull = view.size();
  const N = draft ? Math.max(100, Math.round(Nfull / 2)) : Nfull;
  const r = readoutFor(view.slot);
  view.r = r;
  const t = DATA.targets.find(x => x.id === state.target);
  const inst = r.inst, camera = r.camera, ir = !!inst.infrared;
  const photo = camera || state.mode === "photo";
  // "enlarge for your screen": same optics, drawn bigger. Both views of a comparison share one factor,
  // so their sizes stay in the true ratio of their magnifications.
  const zoom = state.loupe ? loupeZoom(t, state.compare ? readoutFor("A") : r) : 1;
  view.zoom = zoom;
  const fieldArcsec = r.field * 3600 / zoom;
  const px = fieldArcsec / N;                       // arcsec per pixel
  view.px = fieldArcsec / Nfull;
  view.fieldArcsec = fieldArcsec;
  const pan = state.pan;
  const buf = new Float32Array(N * N * 3);
  const blocked = blockReason(t, inst);
  view.blocked = blocked;
  if (!blocked) {
    if (t.kind === "moon") paintMoon(buf, N, px, pan);
    else if (t.kind === "planet") paintPlanet(buf, N, px, pan, t.id);
    else if (t.kind === "sun") paintSun(buf, N, px, pan);
    else if (t.kind === "nebula" || t.kind === "galaxy" || t.kind === "cluster") paintDeepSky(buf, N, px, pan, t.id, ir, photo);
  }
  // ---- instrument, sky and eye --------------------------------------------------------------
  const sky = O.bortle(state.bortle);
  const f = camera ? 1 : r.tau * Math.min(1, (r.exit / O.EYE_PUPIL_MM) ** 2);   // surface-brightness factor
  const skySB = r.space ? 23.3 : sky.sb;                   // space: zodiacal light only
  const skyC = r.space ? [0.9, 0.95, 1.0] : state.bortle >= 5 ? normCol([1.0, 0.86, 0.72]) : normCol([0.85, 0.9, 1.0]);
  const skyL = amp(skySB) * (photo ? (r.space ? 0.25 : 0.1) : 1);
  // the eye (and a camera's auto-exposure) adapts to the brightest part of the view: take the 99.5th percentile
  const lums = [];
  const stepK = Math.max(3, Math.floor(buf.length / 3 / 6000) * 3);
  for (let k = 0; k < buf.length; k += stepK) { const l = 0.2126 * buf[k] + 0.7152 * buf[k + 1] + 0.0722 * buf[k + 2]; if (l > 0) lums.push(l); }
  lums.sort((a, b) => a - b);
  const maxL = lums.length ? lums[Math.min(lums.length - 1, Math.floor(lums.length * 0.995))] : 0;
  const bright = t.kind === "moon" || t.kind === "planet" || t.kind === "sun";
  const penalty = O.adaptationPenalty(state.dark);
  const img = view.sctx.createImageData(N, N), d = img.data;
  let W, gamma = 1 / 1.7, th = 0, stretch = 0;
  if (photo) {
    W = Math.max(maxL, bright ? 0 : amp(15.8));
    stretch = bright ? 1.5 : camera ? 2.5 : 14;          // a tiny camera field sits inside the bright core: stretch gently
  } else {
    W = Math.max((maxL + skyL) * f, amp(15.6));              // the eye adapts to the brightest thing in view
    const Lth = amp(23.0 - 1.8 * penalty);                   // faintest glow the eye can pick out (dark-adapted ~23)
    th = Math.pow(Lth / W, gamma);
  }
  const asin = x => Math.log(x + Math.sqrt(x * x + 1)), aS = asin(stretch || 1);
  view.whiteSB = -2.5 * Math.log10(W);
  const sR = skyL * skyC[0], sG = skyL * skyC[1], sBc = skyL * skyC[2];
  for (let p = 0, k = 0; p < N * N; p++, k += 3) {
    let R = buf[k] + sR, Gc = buf[k + 1] + sG, B = buf[k + 2] + sBc;
    let yr, yg, yb;
    if (photo) {
      yr = asin(stretch * R / W) / aS; yg = asin(stretch * Gc / W) / aS; yb = asin(stretch * B / W) / aS;
      if (ir) { const y = 0.2126 * yr + 0.7152 * yg + 0.0722 * yb; yr = Math.min(1, y * 1.25 + 0.05 * y); yg = y * 0.78; yb = y * 0.5 + 0.12 * Math.max(0, yb - yr); }
      else { const y = 0.2126 * yr + 0.7152 * yg + 0.0722 * yb, s = 1.2; yr = y + (yr - y) * s; yg = y + (yg - y) * s; yb = y + (yb - y) * s; }
    } else {
      R *= f; Gc *= f; B *= f;
      const L = 0.2126 * R + 0.7152 * Gc + 0.0722 * B;
      const SBabs = -2.5 * Math.log10(Math.max(L, 1e-30));
      const sat = clamp((19.3 - SBabs) / 4.8, 0, 1);          // cones need light: colour fades below ~15-19 mag/arcsec^2
      R = L + (R - L) * sat; Gc = L + (Gc - L) * sat; B = L + (B - L) * sat;
      if (sat < 1) { const tint = (1 - sat) * 0.06; R *= 1 - tint; B *= 1 + tint; }   // dim light looks slightly blue-grey
      yr = (Math.pow(R / W, gamma) - th) / (1 - th); yg = (Math.pow(Gc / W, gamma) - th) / (1 - th); yb = (Math.pow(B / W, gamma) - th) / (1 - th);
    }
    const q = p * 4;
    d[q] = clamp(yr, 0, 1) * 255; d[q + 1] = clamp(yg, 0, 1) * 255; d[q + 2] = clamp(yb, 0, 1) * 255; d[q + 3] = 255;
  }
  view.scene.width = view.scene.height = N;
  view.sctx.putImageData(img, 0, 0);
  view.skyColor = `rgb(${d[0]},${d[1]},${d[2]})`;
  view.sceneN = N;
  // ---- stars --------------------------------------------------------------------------------
  view.stars = [];
  if (!blocked) {
    const mlimEye = camera ? 99 : r.mlim;
    let mlimDraw = camera ? Math.min(inst.cameraLimit, 20) : mlimEye;
    if (!camera && view.whiteSB < 9) mlimDraw = Math.min(mlimDraw, 3 + (view.whiteSB - 3) * 0.6); // glare of the Moon or a planet
    if (!camera && t.kind === "planet") mlimDraw = Math.max(mlimDraw, 6.5);
    const rad = fieldArcsec * 0.72;
    let list = catalogStars(state.target).filter(s => !s.irOnly || ir);
    list = list.concat(fieldStars(state.target, pan.xi, pan.eta, rad, mlimDraw));
    if (t.id === "jupiter") {
      const g = astro.gal, R = g.diam / 2, pa = g.PA * D2R, cP = Math.cos(pa), sP = Math.sin(pa);
      const J = g.jupiter, fac = 5 * Math.log10(J.helio * J.au / (5.2 * 4.2));
      g.moons.forEach((m, i) => {
        if (m.hidden) return;
        const xL = m.X * R, yL = m.Y * R;
        list.push({ xi: -xL * cP + yL * sP, eta: xL * sP + yL * cP, m: DATA.galilean.mag0[i] + fac + (m.transit ? 1.5 : 0), bv: [1.17, 0.87, 0.83, 0.86][i], moon: m.name, transit: m.transit });
      });
    }
    const half = Nfull / 2, pxs = view.px;
    for (const s of list) {
      const x = half - (s.xi - pan.xi) / pxs, y = half - (s.eta - pan.eta) / pxs;
      if (Math.hypot(x - half, y - half) > half * 1.05 + 20) continue;
      const lim = camera ? mlimDraw : mlimDraw;
      if (s.m > lim) continue;
      view.stars.push({ x, y, m: s.m, rgb: starRGB(s.bv), ph: hash2(Math.round(s.xi), Math.round(s.eta), 5) * 6.283, moon: s.moon, transit: s.transit });
    }
    view.mlimDraw = mlimDraw;
  }
  // blur (FWHM in arcsec) and image motion
  const bl = O.totalBlurArcsec({ apertureMm: inst.aperture, M: camera ? 1e6 : r.M, seeingArcsec: state.seeing, space: r.space, camera, lambdaNm: r.lambdaNm });
  view.blur = bl;
  view.tiltPx = r.space ? 0 : O.tiltRmsArcsec(inst.aperture, state.seeing) / view.px;
  view.dirty = false;
  updateViewChrome(view, t);
}

/** How much to enlarge a view for a screen: planets to ~1/5 of the circle, double stars so the
 *  pair spans ~1/12 of it, everything else 4x. A screen circle is much smaller than an eyepiece field looks. */
function loupeZoom(t, r) {
  const field = r.field * 3600;
  let z = 4;
  if (t.kind === "planet") z = 0.2 * field / astro.planets[t.id].diam;
  else if (t.kind === "double") z = field / 12 / Math.min(...t.stars.filter(s => s.sep).map(s => s.sep));
  return Math.round(clamp(z, 2, 16));
}
function blockReason(t, inst) {
  if (t.id === "sun") {
    if (inst.id === "hubble") return { title: "Hubble never looks at the Sun", text: "Pointing within about 50° of the Sun would cook its optics. Hubble's cameras are kept well away from it." };
    if (inst.id === "webb") return { title: "Webb can never face the Sun", text: "Webb's tennis-court-sized sunshield always stays between the Sun and the mirror, which must be kept at about −230 °C to see infrared light." };
    if (!state.solarOK) return { sun: true };
  }
  if (inst.id === "webb" && t.id === "moon") return { title: "Webb cannot observe the Moon", text: "The Moon crosses the sky too fast for Webb to track (it follows targets moving up to about 0.03″ per second), and it is far too bright." };
  if (inst.id === "webb" && t.id === "venus") return { title: "Venus is too close to the Sun for Webb", text: "Webb can only point between 85° and 135° away from the Sun. Venus never gets more than 47° from it." };
  return null;
}

/* ------------------------------------------------------ frame drawing --- */
let lastT = performance.now();
function drawView(view, now, dt) {
  if (view.dirty) buildScene(view);
  const N = view.N, ctx = view.ctx, h = N / 2, r = view.r;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, N, N);
  if (view.blocked) return;
  const camera = r.camera;
  // seeing: image motion (Ornstein-Uhlenbeck random walk, ~0.1 s correlation) and boiling
  const animate = !reduce && !r.space;
  if (animate) {
    const tau = 0.09, sig = view.tiltPx, k = Math.sqrt(2 * dt / tau);
    view.jx += (-view.jx / tau) * dt + sig * k * gaussRand();
    view.jy += (-view.jy / tau) * dt + sig * k * gaussRand();
    view.boil = 0.8 * view.boil + 0.2 * (gaussRand() * 0.5);
  } else { view.jx = view.jy = 0; view.boil = 0; }
  const o = view.orientation();
  ctx.save();
  if (!camera) { ctx.beginPath(); ctx.arc(h, h, h, 0, Math.PI * 2); ctx.clip(); }
  ctx.fillStyle = view.skyColor; ctx.fillRect(0, 0, N, N);
  ctx.translate(h, h);
  if (o === "mirror") ctx.scale(-1, 1);
  if (o === "rotate") ctx.rotate(Math.PI);
  ctx.translate(-h + view.jx, -h + view.jy);
  const bl = view.blur, seeFrac = bl.total > 0 ? bl.see / bl.total : 0;
  const fw = bl.total * (1 + view.boil * seeFrac * 0.6);
  const sigmaPx = Math.max(0, fw / 2.355 / view.px);
  const ssc = N / view.sceneN;
  ctx.imageSmoothingEnabled = true;
  if (sigmaPx > 0.35) ctx.filter = `blur(${sigmaPx.toFixed(2)}px)`;
  ctx.drawImage(view.scene, 0, 0, view.sceneN, view.sceneN, 0, 0, N, N);
  ctx.filter = "none";
  void ssc;
  // stars
  ctx.globalCompositeOperation = "lighter";
  const scale = Math.max(0.8, N / 700);
  const diffPx = r.lambdaNm ? O.rayleighArcsec(r.inst.aperture, r.lambdaNm) / view.px : 0;
  const airy = diffPx > 3 && bl.diff > bl.see * 1.1 && bl.diff > bl.eye * 0.6;
  const scint = r.space ? 0 : 0.55 * (state.seeing / 1.5) * Math.pow(7 / r.inst.aperture, 0.55);
  const spikes = r.inst.spider || 0;
  const photo = camera || state.mode === "photo";
  const tt = now / 1000;
  for (const s of view.stars) {
    const dm = view.mlimDraw - s.m;
    let a = clamp(0.2 + dm * 0.3, 0, 1);
    if (scint > 0 && animate) a *= clamp(1 + scint * (Math.sin(tt * 11.3 + s.ph) * 0.6 + Math.sin(tt * 17.9 + s.ph * 2.1) * 0.4), 0.15, 1.8);
    if (s.transit) a *= 0.35;
    const sat = photo ? 1 : clamp((dm - 2.2) / 3.5, 0, 1);
    const c = s.rgb.map(v => 1 - (1 - v) * sat);
    const core = Math.max(sigmaPx * 2.6, 1.8 * scale) + clamp(dm - 2, 0, 10) * (photo ? 0.6 : 0.45) * scale;
    const spr = makeSprite(c);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.drawImage(spr, s.x - core, s.y - core, core * 2, core * 2);
    if (dm > 4.5) { ctx.globalAlpha = clamp((dm - 4.5) * 0.05, 0, 0.22); const g = core * 3.2; ctx.drawImage(spr, s.x - g, s.y - g, g * 2, g * 2); }
    if (airy && dm > 2.5) {
      ctx.globalAlpha = clamp(0.05 + (dm - 2.5) * 0.03, 0, 0.22);
      ctx.strokeStyle = `rgb(${c.map(v => Math.round(v * 255)).join(",")})`; ctx.lineWidth = Math.max(1, diffPx * 0.35);
      ctx.beginPath(); ctx.arc(s.x, s.y, diffPx * 1.34, 0, Math.PI * 2); ctx.stroke();
    }
    if (spikes && dm > (camera ? 5 : 6)) {
      const L = core * (1.2 + (dm - 5) * (camera ? 0.9 : 0.5));
      ctx.globalAlpha = clamp((dm - 5) * 0.06, 0, 0.35);
      ctx.strokeStyle = `rgb(${c.map(v => Math.round(v * 255)).join(",")})`; ctx.lineWidth = Math.max(0.8, scale * 0.9);
      ctx.beginPath();
      const n = spikes, off = spikes === 6 ? Math.PI / 2 : Math.PI / 4;
      for (let q = 0; q < n; q++) { const ang = off + q * Math.PI * 2 / n; ctx.moveTo(s.x, s.y); ctx.lineTo(s.x + Math.cos(ang) * L, s.y + Math.sin(ang) * L); }
      if (spikes === 6) { ctx.moveTo(s.x - L * 0.55, s.y); ctx.lineTo(s.x + L * 0.55, s.y); }
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
  ctx.restore();
  // field stop: soft vignette at the edge of the circle
  if (!camera) {
    const g = ctx.createRadialGradient(h, h, h * 0.86, h, h, h);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.85, "rgba(0,0,0,.45)"); g.addColorStop(1, "rgba(0,0,0,1)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(h, h, h + 1, 0, Math.PI * 2); ctx.fill();
  }
}
let spare = null;
function gaussRand() { if (spare != null) { const s = spare; spare = null; return s; } const u = Math.max(1e-9, Math.random()), v = Math.random(), m = Math.sqrt(-2 * Math.log(u)); spare = m * Math.sin(2 * Math.PI * v); return m * Math.cos(2 * Math.PI * v); }

function loop(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (!document.hidden) views.forEach(v => { if (v.el.isConnected && v.el.offsetParent !== null) drawView(v, now, dt); });
  if (!reduce) requestAnimationFrame(loop);
}
function redrawStatic() { if (reduce) views.forEach(v => drawView(v, performance.now(), 0.016)); }

/* -------------------------------------------------- per-view overlays --- */
function updateViewChrome(view, t) {
  const r = view.r, inst = r.inst;
  const shape = r.camera ? "square" : "round";
  view.el.dataset.shape = shape;
  view.el.dataset.slot = view.slot;
  // caption
  const fieldTxt = fieldLabel(r.field);
  $(".ep-cap-t", view.el).textContent = `${t.short || t.name} · ${inst.short}`;
  $(".ep-cap-o", view.el).textContent = (r.camera ? `camera · ${fieldTxt} field` : `${fmt(r.M, 0)}× · ${fieldTxt} field`) + (view.zoom > 1 ? ` · shown ${view.zoom}× larger` : "");
  view.canvas.setAttribute("aria-label", `Simulated view of ${t.name} through ${inst.name}${r.camera ? "" : " at " + fmt(r.M, 0) + " times"}, ${fieldTxt} field of view.`);
  // compass (after the instrument's flips)
  const o = view.orientation();
  view.compass.setAttribute("transform", o === "mirror" ? "scale(-1,1)" : o === "rotate" ? "rotate(180)" : "");
  $$("text", view.compass).forEach(tx => tx.setAttribute("transform", o === "mirror" ? `scale(-1,1) translate(${-2 * +tx.getAttribute("x")},0)` : o === "rotate" ? `rotate(180 ${tx.getAttribute("x")} ${tx.getAttribute("y")})` : ""));
  // flags
  const flags = [];
  const vis = astro.vis[t.id];
  if (vis && !vis.up && !r.space) flags.push(["warn", `Below the horizon ${state.when === "now" ? "right now" : "at 9 pm"}`]);
  if (r.tooMuch) flags.push(["flame", `Past the useful limit (${fmt(r.maxUseful, 0)}×): bigger, not sharper`]);
  else if (!r.camera && r.exitVerdict && r.exitVerdict.key === "wasted") flags.push(["warn", `Exit pupil ${fmt(r.exit, 1)} mm: some light misses your eye`]);
  if (r.camera && !view.blocked) flags.push(["ice", inst.infrared ? `${inst.cameraName} photo in infrared, shown in false colour` : `${inst.cameraName}: a photo, not an eyepiece view`]);
  if (t.id === "moon" && view.px < 1.6 && !view.blocked) flags.push(["muted", "Our Moon map runs out of detail here: a real view is sharper"]);
  if (view.zoom > 1) flags.push(["ice", `Enlarged ${view.zoom}× for your screen: the real view is smaller`]);
  const big = t.id === "moon" ? astro.moon.Rarc * 2 : t.id === "sun" ? astro.sunDiam : t.extent ? t.extent * 60 : 0;
  if (view.zoom === 1 && !r.camera && big > view.fieldArcsec * 1.25 && !view.blocked) flags.push(["muted", `Only part fits: ${t.name} is ${fmt(big / view.fieldArcsec, 1)}× wider than this view`]);
  view.flags.innerHTML = flags.map(f => `<span class="chip ${f[0]}">${esc(f[1])}</span>`).join("");
  // a friendly nudge toward a better eyepiece or instrument
  const sug = $(".ep-suggest", view.el), tk = t.kind;
  let tip = null;
  if (!view.blocked && view.slot === "A") {
    if ((tk === "planet" || t.id === "epslyr") && inst.kind === "telescope" && r.M < 400) {
      const goal = Math.min(r.maxUseful, 60 / state.seeing * 4.2, 260);
      let best = 0; DATA.eyepieces.forEach((e, k) => { const M = O.magnification(inst.focal, e.focal, r.barlow); if (Math.abs(Math.log(M / goal)) < Math.abs(Math.log(O.magnification(inst.focal, DATA.eyepieces[best].focal, r.barlow) / goal))) best = k; });
      const M = O.magnification(inst.focal, DATA.eyepieces[best].focal, r.barlow);
      if (M <= r.M * 1.3 && !state.loupe) tip = { text: "Still tiny? That's normal: planets are small even at high power. Enlarge it for your screen", act: () => { state.loupe = true; refresh(); } };
      if (M > r.M * 1.3) tip = { text: `Too small at ${fmt(r.M, 0)}×? Zoom in: ${DATA.eyepieces[best].name} eyepiece (${fmt(M, 0)}×)`, act: () => { state.ep = best; state.pan = { xi: 0, eta: 0 }; refresh(); } };
    } else if ((tk === "planet" || t.id === "epslyr") && (inst.kind === "eye" || inst.kind === "binocular")) {
      tip = { text: "Too small for binoculars: see it in the 8-inch Dobsonian", act: () => { state.inst = "dob8"; state.ep = 3; refresh(); } };
    } else if ((tk === "nebula" || tk === "galaxy" || tk === "cluster") && inst.kind === "telescope" && r.M > 70) {
      const M = O.magnification(inst.focal, 32, 1);
      tip = { text: `Faint and cramped at ${fmt(r.M, 0)}×? Zoom out: 32 mm eyepiece (${fmt(M, 0)}×)`, act: () => { state.ep = 0; state.barlow = false; $("#barlow").checked = false; state.pan = { xi: 0, eta: 0 }; refresh(); } };
    }
  }
  sug.hidden = !tip;
  if (tip) { sug.textContent = tip.text; sug.onclick = tip.act; }
  // drag hint
  const pannable = big > view.fieldArcsec * 0.9 || (t.id === "jupiter" && astro.gal.diam * 28 > view.fieldArcsec);
  r.pannable = true;
  view.drag.hidden = !pannable || view.blocked;
  const lp = $(".ep-loupe", view.el); lp.setAttribute("aria-pressed", String(state.loupe)); lp.hidden = !!view.blocked;
  $("span", lp).textContent = state.loupe ? "Real size" : `Enlarge ×${loupeZoom(t, r)}`;
  view.canvas.style.cursor = "grab";
  // blocked panel
  const b = view.blocked;
  if (b) {
    view.block.hidden = false;
    if (b.sun) {
      view.block.className = "ep-block ep-sunwarn";
      view.block.innerHTML = `<svg viewBox="0 0 48 48" width="44" height="44" aria-hidden="true"><path d="M24 4L45 42H3z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/><path d="M24 17v12" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/><circle cx="24" cy="35" r="2.2" fill="currentColor"/></svg>
        <h3>Never look at the Sun without a certified solar filter</h3>
        <p>Through binoculars or a telescope, even a split second of sunlight burns the retina permanently, and it does not hurt while it happens. Only use a <b>full-aperture solar filter</b> made for your instrument, fitted securely over the <b>front</b> end, never a filter that screws into the eyepiece. For eyes alone: eclipse glasses meeting ISO 12312-2. Cover or remove the finder scope too.</p>
        <button class="btn flame" type="button" data-solar="ok">I have a certified solar filter on the front</button>`;
    } else {
      view.block.className = "ep-block";
      view.block.innerHTML = `<h3>${esc(b.title)}</h3><p>${esc(b.text)}</p>`;
    }
  } else view.block.hidden = true;
  // compare-mode selects
  if (view.slot === "B" || state.compare) {
    view.head.hidden = !state.compare;
    const vs = $(".ep-vsel", view.el), es = $(".ep-esel", view.el);
    const cur = view.slot === "B" ? state.instB : state.inst, ce = view.slot === "B" ? state.epB : state.ep;
    if (!vs.options.length) vs.innerHTML = DATA.instruments.filter(i => !i.custom).map(i => `<option value="${i.id}">${esc(i.name)}</option>`).join("");
    vs.value = cur;
    const fixed = inst.kind !== "telescope";
    es.innerHTML = fixed ? `<option>${inst.kind === "camera" ? "camera" : inst.kind === "eye" ? "no eyepiece" : "fixed 10×"}</option>` :
      DATA.eyepieces.map((e, k) => `<option value="${k}">${e.name} · ${fmt(O.magnification(inst.focal, e.focal), 0)}×</option>`).join("");
    es.disabled = fixed; if (!fixed) es.value = String(ce);
  }
}
function fieldLabel(deg) {
  if (deg >= 1) return `${fmt(deg, deg >= 10 ? 0 : 1)}°`;
  if (deg * 60 >= 1) return `${fmt(deg * 60, deg * 60 >= 10 ? 0 : 1)}′`;
  return `${fmt(deg * 3600, 0)}″`;
}

/* ------------------------------------------------------ UI builders --- */
function buildInstruments() {
  const g = $("#instGrid");
  g.innerHTML = DATA.instruments.map(i => `
    <button type="button" class="ep-inst" role="radio" data-inst="${i.id}" aria-checked="false">
      <svg viewBox="0 0 64 40" aria-hidden="true">${ICONS[i.id] || ""}</svg>
      <span class="ep-inst-n">${esc(i.short)}</span>
      <span class="ep-inst-s" data-spec="${i.id}">${esc(instSpec(i))}</span>
    </button>`).join("");
  g.addEventListener("click", e => {
    const b = e.target.closest(".ep-inst"); if (!b) return;
    state.inst = b.dataset.inst; state.pan = { xi: 0, eta: 0 };
    if (instById(state.inst).kind === "camera" && state.target === "sun") state.target = "moon";
    refresh();
  });
  g.addEventListener("keydown", e => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const ids = DATA.instruments.map(i => i.id), k = ids.indexOf(state.inst);
    const n = (k + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + ids.length) % ids.length;
    state.inst = ids[n]; refresh(); $(`.ep-inst[data-inst="${ids[n]}"]`).focus(); e.preventDefault();
  });
}
function buildEyepieces() {
  const row = $("#epRow");
  row.innerHTML = DATA.eyepieces.map((e, k) => `
    <button type="button" class="ep-ep" role="radio" data-ep="${k}" aria-checked="false">
      <svg viewBox="0 0 30 40" aria-hidden="true"><rect x="${15 - (8 + e.focal / 6)}" y="4" width="${2 * (8 + e.focal / 6)}" height="${10 + e.focal / 3}" rx="3" fill="currentColor" opacity=".8"/><rect x="11" y="${14 + e.focal / 3}" width="8" height="${22 - e.focal / 3}" rx="1.5" fill="currentColor" opacity=".45"/></svg>
      <span class="ep-ep-f">${e.name}</span><span class="ep-ep-m" data-epm="${k}"></span>
    </button>`).join("");
  row.addEventListener("click", e => { const b = e.target.closest(".ep-ep"); if (!b || b.disabled) return; state.ep = +b.dataset.ep; refresh(); });
  radioKeys(row, ".ep-ep");
}
/** Arrow keys move the choice inside a role="radiogroup" of buttons, like the instrument grid. */
function radioKeys(row, sel) {
  row.addEventListener("keydown", e => {
    if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
    const bs = $$(sel, row).filter(b => !b.disabled);
    if (!bs.length) return;
    const k = Math.max(0, bs.findIndex(b => b.getAttribute("aria-checked") === "true"));
    const n = bs[(k + (e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length];
    n.click(); n.focus(); e.preventDefault();
  });
}
const TGT_ICON = {
  moon: '<circle cx="12" cy="12" r="9" fill="#d9d4c7"/><path d="M12 3a9 9 0 0 1 0 18a5.5 9 0 0 0 0-18z" fill="#1a1d2c" opacity=".85"/><circle cx="8" cy="9" r="1.6" fill="#b3ad9f"/><circle cx="10" cy="15" r="1.1" fill="#b3ad9f"/>',
  jupiter: '<circle cx="9" cy="12" r="7" fill="#d9c3a2"/><path d="M2.5 10h13M2.3 13.8h13.4" stroke="#8a5a3c" stroke-width="1.5"/><circle cx="19" cy="12" r="1" fill="#fff"/><circle cx="22" cy="12" r="1" fill="#fff"/>',
  saturn: '<ellipse cx="12" cy="12" rx="11" ry="2.4" fill="none" stroke="#e6d6a8" stroke-width="1.6" transform="rotate(-8 12 12)"/><circle cx="12" cy="12" r="5.5" fill="#e3cf9b"/>',
  mars: '<circle cx="12" cy="12" r="7" fill="#e07a45"/><path d="M8 11c2 1 4-1 6 1" stroke="#8c3a1e" stroke-width="1.6" fill="none"/><path d="M9.5 6a7 7 0 0 1 5 0" stroke="#fff" stroke-width="1.6"/>',
  venus: '<circle cx="12" cy="12" r="8" fill="#1a1d2c"/><path d="M12 4a8 8 0 0 1 0 16a3 8 0 0 0 0-16z" fill="#fff6dc"/>',
  m42: '<ellipse cx="12" cy="13" rx="9" ry="7" fill="url(#g42)"/><circle cx="12" cy="11" r="1.1" fill="#fff"/><defs><radialGradient id="g42"><stop offset="0" stop-color="#b6ffe0" stop-opacity=".9"/><stop offset=".5" stop-color="#ff7aa2" stop-opacity=".5"/><stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></radialGradient></defs>',
  m31: '<ellipse cx="12" cy="12" rx="11" ry="3.4" transform="rotate(-35 12 12)" fill="url(#g31)"/><defs><radialGradient id="g31"><stop offset="0" stop-color="#fff2d6"/><stop offset=".35" stop-color="#cfd9ff" stop-opacity=".7"/><stop offset="1" stop-color="#7c8cff" stop-opacity="0"/></radialGradient></defs>',
  m45: '<g fill="#cfe2ff"><circle cx="7" cy="9" r="1.6"/><circle cx="12" cy="7" r="1.2"/><circle cx="15" cy="11" r="2"/><circle cx="9" cy="14" r="1.3"/><circle cx="18" cy="15" r="1.1"/><circle cx="13" cy="16" r="1"/></g>',
  albireo: '<circle cx="9" cy="14" r="3.4" fill="#ffc66b"/><circle cx="16" cy="9" r="2.2" fill="#8fb4ff"/>',
  epslyr: '<g fill="#fff"><circle cx="7" cy="7" r="1.8"/><circle cx="9.3" cy="5.4" r="1.3"/><circle cx="15" cy="17" r="1.7"/><circle cx="17.6" cy="17.6" r="1.6"/></g>',
  sun: '<circle cx="12" cy="12" r="8" fill="#fff" stroke="var(--sol)" stroke-width="1.5"/><circle cx="9" cy="10" r="1.2" fill="#555"/><circle cx="14" cy="14" r=".8" fill="#555"/>'
};
function buildTargets() {
  const row = $("#tgtRow");
  row.innerHTML = DATA.targets.map(t => `
    <button type="button" class="ep-tgt${t.id === "sun" ? " ep-tgt-sun" : ""}" role="radio" data-tgt="${t.id}" aria-checked="false">
      <svg viewBox="0 0 24 24" aria-hidden="true">${TGT_ICON[t.id] || ""}</svg>
      <span class="ep-tgt-n">${esc(t.chip || t.name)}</span>
      <span class="ep-tgt-s" data-vis="${t.id}">…</span>
    </button>`).join("");
  row.addEventListener("click", e => {
    const b = e.target.closest(".ep-tgt"); if (!b) return;
    if (state.target !== b.dataset.tgt) selectTarget(b.dataset.tgt);
    refresh();
  });
  radioKeys(row, ".ep-tgt");
}

function selectTarget(id) {
  state.target = id; state.pan = { xi: 0, eta: 0 }; state.solarOK = false;
  const tk = DATA.targets.find(x => x.id === id).kind;   // planets and doubles are tiny on a screen: start enlarged
  state.loupe = (tk === "planet" || tk === "double") && instById(state.inst).kind === "telescope";
}
/** First visit: show the evening sky if it is daytime, and start on something that is up. */
function pickDefaults() {
  if (astro.sunAlt > -6) {
    state.when = "tonight";
    $$("#whenSeg button").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.when === "tonight")));
    computeSky();
  }
  const order = ["moon", "saturn", "jupiter", "venus", "mars", "m31", "m45", "m42", "albireo", "epslyr"];
  const up = order.find(id => astro.vis[id] && astro.vis[id].alt > (id === "moon" ? 5 : 15));
  selectTarget(up || "moon");
}

/* Readout rows: built once, updated in place (so an open "show the maths" stays open). */
const READS = [
  ["mag", "Magnification"], ["field", "Field of view"], ["res", "Sharpest detail"], ["faint", "Faintest star"],
  ["grasp", "Light gathering"], ["exit", "Exit pupil"], ["range", "Useful magnification"]
];
function buildReads() {
  $("#reads").innerHTML = READS.map(([k, label]) => `
    <div class="ep-read" data-k="${k}">
      <div class="ep-read-top"><span class="ep-read-k">${label}</span><span class="ep-read-v" data-v></span></div>
      <div class="ep-read-viz" data-viz></div>
      <p class="ep-read-p" data-p></p>
      <details class="ep-math"><summary>Show the maths</summary><div class="ep-tex" data-tex></div><p class="ep-math-n" data-n></p></details>
    </div>`).join("");
  $$("#reads details").forEach(d => d.addEventListener("toggle", () => { if (d.open) renderTex(d); }));
}
function renderTex(scope) {
  $$("[data-tex]", scope).forEach(el => {
    const tex = el.dataset.texSrc; if (!tex) return;
    if (el.dataset.done === tex) return;
    if (window.katex) { try { katex.render(tex, el, { displayMode: true, throwOnError: false }); } catch (e) { el.textContent = tex; } }
    else el.textContent = tex;
    el.dataset.done = tex;
  });
}
function setRead(k, { v, p, viz, tex, note, state: st, hide }) {
  const row = $(`.ep-read[data-k="${k}"]`);
  row.hidden = !!hide; if (hide) return;
  row.dataset.state = st || "";
  $("[data-v]", row).innerHTML = v; $("[data-p]", row).innerHTML = p || "";
  $("[data-viz]", row).innerHTML = viz || ""; $("[data-viz]", row).hidden = !viz;
  // thousands separators as {,} so KaTeX does not add a space; several formulas go on separate lines
  let tx = (tex || "").replace(/(\d),(\d)/g, "$1{,}$2");
  if (tx.includes("\\qquad")) tx = "\\begin{gathered}" + tx.split("\\qquad").join("\\\\") + "\\end{gathered}";
  const te = $("[data-tex]", row); te.dataset.texSrc = tx;
  $("[data-n]", row).innerHTML = note || "";
  $(".ep-math", row).hidden = !tex;
  if ($(".ep-math", row).open) renderTex(row);
}
const n0 = v => fmt(v, 0), n1 = v => fmt(v, 1), n2 = v => fmt(v, 2);
function updateReads() {
  const r = readoutFor("A"), inst = r.inst, D = inst.aperture;
  const cam = r.camera, eye = inst.kind === "eye";
  // magnification
  if (cam) setRead("mag", { v: "no eyepiece", p: `${esc(inst.name)} has cameras, not eyepieces: nobody looks through it. Its pictures are what you see here.` });
  else if (eye) setRead("mag", { v: "1×", p: "Your eyes, unaided: the starting point." });
  else if (inst.kind === "binocular") setRead("mag", { v: `${inst.fixedMag}×`, p: `Things look ${inst.fixedMag} times closer. Binocular eyepieces are fixed.`, tex: `M = ${inst.fixedMag}\\times` });
  else setRead("mag", {
    v: `${n0(r.M)}×`, p: `Things look ${n0(r.M)} times closer (or bigger) than with your eyes alone.`,
    tex: `M = \\frac{f_{\\text{telescope}}${r.barlow > 1 ? "\\times 2" : ""}}{f_{\\text{eyepiece}}} = \\frac{${n0(inst.focal)}\\,\\text{mm}${r.barlow > 1 ? "\\times 2" : ""}}{${r.ep.focal}\\,\\text{mm}} = ${n0(r.M)}\\times`,
    note: `Swap the eyepiece to change it: shorter eyepiece, more magnification. <a href="equations.html#magnification">Equation page</a>`
  });
  // field
  const moons = O.moonsAcross(r.field);
  const fr = 18, mr = clamp(fr / Math.max(moons, 0.05), 1.2, 60);
  setRead("field", {
    v: fieldLabel(r.field) + (cam ? " square" : ""),
    p: moons >= 1 ? `About <b>${n1(moons)} full Moons</b> across.` : `About <b>${fmt(1 / moons, moons > 0.2 ? 1 : 0)}×</b> smaller than the full Moon: only part of the Moon fits.`,
    viz: `<svg viewBox="0 0 200 40" class="ep-fov-viz" aria-hidden="true"><defs><clipPath id="fovc"><circle cx="20" cy="20" r="${fr}"/></clipPath></defs><circle cx="20" cy="20" r="${fr}" fill="#0a0f1e" stroke="var(--ice)" stroke-width="1.2"/><g clip-path="url(#fovc)">${moons >= 1 ? Array.from({ length: Math.min(Math.ceil(moons), 24) }, (_, q) => `<circle cx="${20 - fr + mr + q * 2 * mr}" cy="20" r="${mr}" fill="#d9d4c7" opacity="${q < Math.floor(moons) ? .85 : .35}"/>`).join("") : `<circle cx="20" cy="20" r="${mr}" fill="#d9d4c7" opacity=".85"/>`}</g><text x="46" y="17" class="ep-viz-t">your view</text><text x="46" y="31" class="ep-viz-t2">full Moon = 0.5°</text></svg>`,
    tex: cam ? `\\theta = ${inst.cameraFieldArcsec}'' = ${n2(inst.cameraFieldArcsec / 60)}'` : eye ? "" : inst.kind === "binocular" ? `\\theta_{\\text{true}} = ${inst.fixedField}^\\circ` : `\\theta_{\\text{true}} = \\frac{\\theta_{\\text{apparent}}}{M} = \\frac{${r.ep.afov}^\\circ}{${n0(r.M)}} = ${n2(r.field)}^\\circ`,
    note: cam ? "The camera's detector is a square." : `The apparent field (${r.ep ? r.ep.afov : "—"}°) is printed on the eyepiece: how wide the circle looks to your eye.`
  });
  // resolution
  const res = r.resolution, air = r.space ? 0 : res.see, eyeL = cam ? 0 : res.eye, tel = r.dawes;
  const worst = Math.max(tel, air, eyeL);
  const lim = worst === tel ? "telescope" : worst === air ? "air" : "eye";
  const bar = (lbl, val, cls) => { const w = val > 0 ? clamp(18 + 30 * Math.log10(val / 0.03), 4, 100) : 0; return `<div class="ep-rb ${cls}${(lbl === lim) ? " on" : ""}"><span>${lbl === "telescope" ? (cam ? "optics" : "telescope") : lbl === "air" ? "the air" : "your eye"}</span><i style="width:${w}%"></i><b>${val > 0 ? fmtArc(val) : lbl === "air" && r.tilt > 0 ? "jiggles" : "none"}</b></div>`; };
  const limTxt = { telescope: r.space ? "The optics are the limit: no air in space." : "The telescope's size is the limit tonight.", air: "The air is the limit: a bigger telescope wouldn't show more tonight.", eye: "Your eye is the limit at this power: more magnification would show more." }[lim];
  setRead("res", {
    v: fmtArc(worst), state: lim === "eye" ? "warn" : "",
    p: `${cam ? "" : `Stars closer than ${fmtArc(tel)} merge into one (Dawes limit). `}${limTxt}`,
    viz: `<div class="ep-rbars">${bar("telescope", tel, "t")}${r.space ? "" : bar("air", air, "a")}${cam ? "" : bar("eye", eyeL, "e")}</div>`,
    tex: `\\theta_{\\text{Rayleigh}} = 1.22\\,\\frac{\\lambda}{D} = 1.22\\times\\frac{${r.lambdaNm}\\,\\text{nm}}{${n0(D)}\\,\\text{mm}} = ${fmtArcTex(r.rayleigh)} \\qquad \\theta_{\\text{Dawes}} = \\frac{115.8''}{D_{\\text{mm}}}${r.lambdaNm !== 550 ? "\\times\\frac{\\lambda}{550\\,\\text{nm}}" : ""} = ${fmtArcTex(tel)}${cam ? "" : `\\qquad \\theta_{\\text{eye}} = \\frac{60''}{M} = ${fmtArcTex(eyeL)}`}`,
    note: `${r.space ? "" : `Seeing ${state.seeing.toFixed(1)}″ is how much the air smears a star; a ${n0(D)} mm aperture sees it as ${fmtArc(air)} of blur plus ${fmtArc(2.355 * r.tilt)} of dancing. `}<a href="equations.html#rayleigh">Rayleigh criterion</a> · <a href="equations.html#seeing-limit">seeing</a>`
  });
  // faintest star
  const ratio = Math.pow(10, 0.4 * (r.mlim - r.nelm)), nf = O.starsInField(r.mlim, r.field);
  setRead("faint", cam ? {
    v: `mag ~${n1(r.mlim)}`, p: `In a long exposure (tens of minutes) the camera records stars about <b>${fmtBig(Math.pow(10, 0.4 * (r.mlim - 6)))}×</b> fainter than the faintest your eye can see.`,
    tex: `\\frac{I_{6}}{I_{${n1(r.mlim)}}} = 10^{0.4\\,(${n1(r.mlim)} - 6)}`
  } : {
    v: `mag ${n1(r.mlim)}`,
    p: eye ? `The faintest star you can see here (${esc(O.bortle(state.bortle).name.toLowerCase())}${state.dark < 20 ? ", eyes not yet adapted" : ""}). About <b>${fmtBig(Math.round(O.starsPerSqDeg(r.mlim) * 20626))}</b> stars could be visible across the half of the sky above you.` :
      `<b>${fmtBig(ratio)}×</b> fainter than your naked eye can manage here (mag ${n1(r.nelm)}). About <b>${fmtBig(Math.round(nf))}</b> stars in this field.`,
    tex: eye ? `m_{\\text{eye}} = ${n1(r.nelm)}` : `m_{\\text{lim}} = m_{\\text{eye}} + 5\\log_{10}\\frac{D}{7\\,\\text{mm}} + 2.5\\log_{10}\\tau = ${n1(r.nelm)} + 5\\log_{10}\\frac{${n0(D)}}{7} + 2.5\\log_{10}${r.tau} = ${n1(r.mlim)}`,
    note: `A rule of thumb (light-gathering gain applied to your eye; experienced observers beat it by about a magnitude). Star counts from Gaia and Tycho-2 averages. <a href="equations.html#limiting-magnitude">Equation page</a>`
  });
  // light grasp
  const pupil = 7;
  setRead("grasp", {
    v: `${fmtBig(r.grasp)}×`, p: eye ? "Your 7 mm pupil: the baseline." : `Collects <b>${fmtBig(r.grasp)} times</b> more light than your 7 mm pupil.`,
    viz: eye ? "" : `<svg viewBox="0 0 200 40" aria-hidden="true" class="ep-grasp-viz"><circle cx="20" cy="20" r="${clamp(18 * pupil / Math.max(D, pupil), 0.9, 18)}" fill="var(--ice)"/><circle cx="20" cy="20" r="18" fill="none" stroke="var(--ice)" stroke-width="1.2" opacity=".6"/><text x="46" y="17" class="ep-viz-t">aperture ${D >= 1000 ? fmt(D / 1000, 1) + " m" : n0(D) + " mm"}</text><text x="46" y="31" class="ep-viz-t2">filled dot: your pupil</text></svg>`,
    tex: `\\text{gain} = \\left(\\frac{D}{d_{\\text{eye}}}\\right)^2 = \\left(\\frac{${n0(D)}}{7}\\right)^2 = ${fmtTex(r.grasp)}`,
    note: `Twice the width, four times the light. <a href="equations.html#light-gathering">Equation page</a>`
  });
  // exit pupil
  if (cam) setRead("exit", { hide: true });
  else {
    const ev = r.exitVerdict, pr = 18, er = clamp(pr * r.exit / 7, 0.8, 26);
    setRead("exit", {
      v: `${n1(r.exit)} mm`, state: ev.key,
      p: `<span class="ep-pill" data-k="${ev.key}">${ev.label}</span> ${ev.tip}`,
      viz: `<svg viewBox="0 0 200 40" aria-hidden="true" class="ep-exit-viz"><circle cx="20" cy="20" r="${pr}" fill="#0a0f1e" stroke="var(--muted)" stroke-width="1.2" stroke-dasharray="3 2"/><circle cx="20" cy="20" r="${er}" class="ep-beam" data-k="${ev.key}"/><text x="46" y="17" class="ep-viz-t">beam into your eye</text><text x="46" y="31" class="ep-viz-t2">dashed: 7 mm pupil</text></svg>`,
      tex: eye ? "" : `d_{\\text{exit}} = \\frac{D}{M} = \\frac{${n0(D)}\\,\\text{mm}}{${n0(r.M)}} = ${n2(r.exit)}\\,\\text{mm}`,
      note: "The exit pupil is the little disc of light floating behind the eyepiece. Its size also sets how bright nebulae look: never brighter than to the naked eye."
    });
  }
  // useful range
  if (inst.kind !== "telescope") setRead("range", { hide: true });
  else {
    const lo = O.minUsefulMagnification(D), hi = r.maxUseful, pos = clamp(Math.log(r.M / (lo * 0.5)) / Math.log(hi * 2.2 / (lo * 0.5)), 0, 1);
    const pl = clamp(Math.log(lo / (lo * 0.5)) / Math.log(hi * 2.2 / (lo * 0.5)), 0, 1), ph = clamp(Math.log(hi / (lo * 0.5)) / Math.log(hi * 2.2 / (lo * 0.5)), 0, 1);
    const airLim = Math.min(hi, 300 / state.seeing * 1.2);
    setRead("range", {
      v: `${n0(lo)}×–${n0(hi)}×`, state: r.tooMuch ? "flame" : "",
      p: r.tooMuch ? `<b>${n0(r.M)}× is past the useful maximum</b> of about 2× the aperture in mm. The image gets bigger but dimmer and blurrier: no new detail ("empty magnification").` :
        `Below ${n0(lo)}× light is wasted; above ${n0(hi)}× (2× the aperture in mm) you only magnify blur.${state.seeing >= 1.5 && hi > airLim ? ` Tonight's air limits you to about ${n0(airLim)}×.` : ""}`,
      viz: `<div class="ep-range"><i class="ok" style="left:${pl * 100}%;width:${(ph - pl) * 100}%"></i><b style="left:${pos * 100}%"></b></div>`,
      tex: `M_{\\min} = \\frac{D}{7\\,\\text{mm}} = ${n0(lo)}\\times \\qquad M_{\\max} \\approx 2\\times D_{\\text{mm}} = ${n0(hi)}\\times`,
      note: `Magnification claims on telescope boxes often ignore this. <a href="equations.html#magnification">Equation page</a>`
    });
  }
  // compare table
  const ct = $("#cmpTable");
  ct.hidden = !state.compare;
  if (state.compare) {
    const a = r, b = readoutFor("B");
    const row = (lbl, fa, fb) => `<tr><th>${lbl}</th><td>${fa(a)}</td><td>${fb ? fb(b) : fa(b)}</td></tr>`;
    ct.innerHTML = `<table class="data ep-cmp-t"><thead><tr><th></th><th>${esc(a.inst.short)}</th><th>${esc(b.inst.short)}</th></tr></thead><tbody>
      ${row("Aperture", x => x.aperture >= 1000 ? fmt(x.aperture / 1000, 1) + " m" : n0(x.aperture) + " mm")}
      ${row("Magnification", x => x.camera ? "camera" : n0(x.M) + "×")}
      ${row("Field", x => fieldLabel(x.field))}
      ${row("Sharpest detail", x => fmtArc(x.resolution.arcsec) + (x.lambdaNm !== 550 ? ` <small>at ${x.lambdaNm >= 1000 ? fmt(x.lambdaNm / 1000, 1) + " µm" : x.lambdaNm + " nm"}</small>` : ""))}
      ${row("Faintest star", x => "mag " + n1(x.mlim))}
      ${row("Light vs eye", x => fmtBig(x.grasp) + "×")}
    </tbody></table>`;
  }
}
function fmtArc(a) { if (!isFinite(a)) return "—"; if (a >= 60) return `${fmt(a / 60, a >= 600 ? 0 : 1)}′`; if (a >= 10) return `${fmt(a, 0)}″`; if (a >= 1) return `${fmt(a, 1)}″`; return `${fmt(a, a < 0.1 ? 3 : 2)}″`; }
function fmtArcTex(a) { return fmtArc(a).replace("″", "''").replace("′", "'"); }
function fmtBig(v) { if (v >= 1e6) return fmt(v / 1e6, 1) + " million"; if (v >= 100) return Math.round(v).toLocaleString("en-US"); if (v >= 10) return fmt(v, 0); return fmt(v, 1); }
function fmtTex(v) { return fmtBig(v).replace(/,/g, "{,}").replace(" million", "\\text{ million}"); }

/* ------------------------------------------------------------ refresh --- */
function refresh() {
  const inst = instById(state.inst);
  $$(".ep-inst").forEach(b => b.setAttribute("aria-checked", String(b.dataset.inst === state.inst)));
  $$(".ep-inst").forEach(b => { b.tabIndex = b.dataset.inst === state.inst ? 0 : -1; });
  const cus = $("[data-spec=custom]"); if (cus) cus.textContent = instSpec(instById("custom"));
  $("#customBox").hidden = !inst.custom;
  $("#instNote").textContent = inst.note;
  // eyepieces
  const fixed = inst.kind !== "telescope";
  $$(".ep-ep").forEach((b, k) => {
    b.setAttribute("aria-checked", String(!fixed && k === state.ep));
    b.disabled = fixed; b.tabIndex = k === state.ep ? 0 : -1;
    const M = fixed ? NaN : O.magnification(inst.focal, DATA.eyepieces[k].focal, state.barlow ? 2 : 1);
    $(`[data-epm="${k}"]`).textContent = fixed ? "" : `${fmt(M, 0)}×`;
    b.dataset.over = !fixed && M > O.maxUsefulMagnification(inst.aperture) ? "1" : "";
  });
  $("#barlow").disabled = fixed;
  const ep = DATA.eyepieces[state.ep];
  $("#epNote").innerHTML = fixed ? (inst.kind === "camera" ? "Space telescopes have cameras, not eyepieces." : inst.kind === "binocular" ? "Binocular eyepieces are built in: always 10×." : "No eyepiece: just your eyes.")
    : `${ep.name} ${ep.type}, ${ep.afov}° apparent field: ${ep.role.toLowerCase()}.`;
  // photo/eye mode
  const camera = inst.kind === "camera";
  $$("#modeSeg button").forEach(b => { b.setAttribute("aria-pressed", String(camera ? b.dataset.mode === "photo" : b.dataset.mode === state.mode)); b.disabled = camera; });
  // targets
  $$(".ep-tgt").forEach(b => { b.setAttribute("aria-checked", String(b.dataset.tgt === state.target)); b.tabIndex = b.dataset.tgt === state.target ? 0 : -1; });
  updateVisChips();
  updateTargetInfo();
  // compare mode
  $("#presets").hidden = !state.compare;
  ensureViews();
  markDirty();
  updateReads();
  redrawStatic();
}
function ensureViews() {
  const host = $("#views");
  const want = state.compare ? 2 : 1;
  host.dataset.n = want;
  while (views.length < want) { const v = new View(views.length ? "B" : "A"); views.push(v); host.appendChild(v.el); bindViewHead(v); }
  views.forEach((v, k) => { v.el.hidden = k >= want; v.head.hidden = !state.compare; });
}
function bindViewHead(v) {
  $(".ep-vsel", v.el).addEventListener("change", e => {
    if (v.slot === "B") state.instB = e.target.value; else state.inst = e.target.value;
    refresh();
  });
  $(".ep-esel", v.el).addEventListener("change", e => {
    const k = +e.target.value; if (isNaN(k)) return;
    if (v.slot === "B") state.epB = k; else state.ep = k;
    refresh();
  });
  $(".ep-loupe", v.el).addEventListener("click", () => { state.loupe = !state.loupe; refresh(); });
  v.block.addEventListener("click", e => { if (e.target.closest("[data-solar]")) { state.solarOK = true; refresh(); } });
}
function updateVisChips() {
  for (const t of DATA.targets) {
    const el = $(`[data-vis="${t.id}"]`), b = el && el.closest(".ep-tgt");
    const v = astro.vis[t.id];
    if (!el || !v) continue;
    let txt;
    if (v.up) txt = `up ${Math.round(v.alt)}°`;
    else if (v.neverUp) txt = "not visible here";
    else if (v.nextRise) txt = `rises ${localTime(jdToMs(v.nextRise)).replace(/\s?([AP])M$/i, (_, a) => a.toLowerCase() + "m")}`;
    else txt = "below horizon";
    el.textContent = t.id === "sun" && v.up ? `up ${Math.round(v.alt)}° · filter!` : txt;
    b.dataset.up = v.up ? "1" : "0";
  }
}
function updateTargetInfo() {
  const t = DATA.targets.find(x => x.id === state.target), v = astro.vis[t.id];
  let live = "";
  if (t.id === "moon") { const m = astro.moon; live = `${m.name}, ${Math.round(m.illum * 100)}% lit, ${fmt(m.diamArcmin, 1)}′ across.`; }
  else if (t.kind === "planet") {
    const p = astro.planets[t.id];
    live = `${fmt(p.diam, 1)}″ across${p.illum < 0.97 ? `, ${Math.round(p.illum * 100)}% lit` : ""}, magnitude ${fmt(p.mag, 1)}.`;
    if (t.id === "saturn") live += ` Rings tilted ${fmt(Math.abs(p.ringTilt), 1)}° (${p.ringTilt < 0 ? "southern" : "northern"} face).`;
    if (t.id === "jupiter") {
      const ms = astro.gal.moons, side = m => m.hidden ? "hidden behind Jupiter" : m.transit ? "crossing in front" : `${fmt(Math.abs(m.X), 1)} Jupiter-widths ${m.X > 0 ? "west" : "east"}`;
      live += " " + ms.map(m => `${m.name}: ${side({ ...m, X: m.X / 2 })}`).join(" · ") + ".";
    }
    if (t.id === "mars" && p.diam < 10) live += " Too small for much detail now; at the February 2027 opposition it reaches about 14″.";
  } else if (t.id === "sun") live = `${fmt(astro.sunDiam / 60, 1)}′ across. Sunspots here are illustrative; see the <a href="solar-observatory.html">Solar observatory</a> for today's real Sun.`;
  let when = "";
  if (v) {
    if (v.up) when = `<span class="ep-up on">Up now, ${Math.round(v.alt)}° above the horizon</span>`;
    else if (v.neverUp) when = `<span class="ep-up">Never rises from here</span>`;
    else when = `<span class="ep-up">Below the horizon${v.nextRise ? `; rises at ${localTime(jdToMs(v.nextRise))}` : ""}</span>`;
  }
  const photo = state.mode === "photo" || instById(state.inst).kind === "camera";
  $("#tgtInfo").innerHTML = `
    <div class="ep-ti-h"><h3>${esc(t.name)}</h3>${when}</div>
    ${live ? `<p class="ep-ti-live">${live}</p>` : ""}
    <p>${esc(photo ? t.photo : t.eye)}</p>
    <p class="ep-ti-tip"><b>Tip:</b> ${esc(t.tip)}</p>`;
}
function updateWhen() {
  const sunUp = astro.sunAlt > -6;
  const place = state.loc.name;
  const at = state.when === "now" ? "now" : `at ${localTime(astro.date.getTime())}`;
  $("#whenNote").innerHTML = sunUp ? `It's daylight in ${esc(place)} ${at} (Sun ${Math.round(astro.sunAlt)}° up). The view shows a dark night sky; switch to <b>Tonight 9 pm</b> to see what will be up.`
    : state.when === "now" ? `Sky for ${esc(place)} right now, ${localTime(astro.date.getTime())} local time.` : `Sky for ${esc(place)} tonight at ${localTime(astro.date.getTime())} local time.`;
}

/* ------------------------------------------------------------ controls --- */
function bindControls() {
  const seeing = $("#seeing"), bort = $("#bortle"), dark = $("#dark");
  const upd = () => {
    state.seeing = +seeing.value; state.bortle = +bort.value; state.dark = +dark.value;
    const s = state.seeing;
    $("#seeingV").textContent = `${s.toFixed(1)}″ · ${s <= 0.9 ? "rock steady" : s <= 1.6 ? "good" : s <= 2.5 ? "average" : "boiling"}`;
    const b = O.bortle(state.bortle);
    $("#bortleV").textContent = `Bortle ${b.cls} · ${b.name}`;
    $("#darkV").textContent = state.dark >= 30 ? "30 min · fully adapted" : `${state.dark} min`;
    markDirty(); updateReads(); redrawStatic();
  };
  [seeing, bort, dark].forEach(el => { el.addEventListener("input", () => { interacting(true); upd(); }); el.addEventListener("change", () => interacting(false)); });
  upd();
  $("#barlow").addEventListener("change", e => { state.barlow = e.target.checked; refresh(); });
  $("#correct").addEventListener("change", e => { state.correct = e.target.checked; refresh(); });
  $("#compare").addEventListener("change", e => { state.compare = e.target.checked; refresh(); });
  $$("#modeSeg button").forEach(b => b.addEventListener("click", () => { state.mode = b.dataset.mode; refresh(); }));
  $$("#whenSeg button").forEach(b => b.addEventListener("click", () => {
    state.when = b.dataset.when;
    $$("#whenSeg button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    computeSky(); updateWhen(); refresh();
  }));
  const cd = $("#cusD"), cf = $("#cusF");
  const cu = () => { state.custom.aperture = +cd.value; state.custom.focal = +cf.value; $("#cusDv").textContent = `${cd.value} mm`; $("#cusFv").textContent = `${cf.value} mm · f/${fmt(cf.value / cd.value, 1)}`; refresh(); };
  cd.addEventListener("input", cu); cf.addEventListener("input", cu);
  $("#geoBtn").addEventListener("click", () => {
    const btn = $("#geoBtn");
    if (state.loc.name !== LA.name) {                    // second press: back to the default
      state.loc = { ...LA }; $("#locName").textContent = LA.name; btn.textContent = "Use my location";
      computeSky(); updateWhen(); refresh(); return;
    }
    if (!navigator.geolocation) { btn.textContent = "Location unavailable"; return; }
    btn.textContent = "Locating…"; btn.disabled = true;
    navigator.geolocation.getCurrentPosition(p => {
      let tz = "UTC"; try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch (e) { /* keep UTC */ }
      state.loc = { name: `your location (${p.coords.latitude.toFixed(1)}°, ${p.coords.longitude.toFixed(1)}°)`, lat: p.coords.latitude, lon: p.coords.longitude, tz };
      $("#locName").textContent = "Your location"; btn.textContent = "Back to Los Angeles"; btn.disabled = false;
      computeSky(); updateWhen(); refresh();
    }, () => { btn.textContent = "Location blocked"; btn.disabled = false; }, { timeout: 10000, maximumAge: 600000 });
  });
  // compare presets and "try it" buttons
  const go = (o) => { Object.assign(state, o); state.pan = { xi: 0, eta: 0 }; syncInputs(); refresh(); };
  $$("#presets [data-preset]").forEach(b => b.addEventListener("click", () => {
    const p = b.dataset.preset;
    if (p === "bino-dob") go({ inst: "binoculars", instB: "dob8", epB: 0, target: "m45" });
    if (p === "70-dob") go({ inst: "refractor70", ep: 3, instB: "dob8", epB: 3, barlow: false, barlowB: false, target: "jupiter" });
    if (p === "hst-jwst") go({ inst: "hubble", instB: "webb", target: "m42" });
  }));
  $$("[data-try]").forEach(b => b.addEventListener("click", () => {
    const k = b.dataset.try;
    if (k === "aperture") go({ compare: true, inst: "refractor70", ep: 3, instB: "dob8", epB: 3, barlow: false, target: "jupiter" });
    if (k === "dob") go({ compare: false, inst: "dob8", ep: 0, barlow: false, target: "m42", mode: "eye" });
    if (k === "power") go({ compare: false, inst: "refractor70", ep: 4, barlow: true, target: "saturn" });
    if (k === "bino") go({ compare: false, inst: "binoculars", target: "m45" });
    $("#bench").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }));
}
function syncInputs() {
  $("#compare").checked = state.compare; $("#barlow").checked = state.barlow;
}

/* ------------------------------------------------------------- load --- */
async function loadMoonTex() {
  const load = src => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; });
  const [a, h, meta] = await Promise.all([load("assets/img/moon/moon-albedo.png"), load("assets/img/moon/moon-height.png"), fetch("assets/img/moon/moon-height.json").then(r => r.json())]);
  const W = a.naturalWidth, H = a.naturalHeight, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d", { willReadFrequently: true });
  const grab = im => { g.clearRect(0, 0, W, H); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, W, H).data, o = new Uint8Array(W * H); for (let i = 0; i < W * H; i++) o[i] = d[i * 4]; return o; };
  const alb = grab(a), hgt = grab(h);
  let s = 0, n = 0; for (let j = Math.floor(H * 0.25); j < H * 0.75; j += 2) for (let i = Math.floor(W * 0.25); i < W * 0.75; i += 2) { s += alb[j * W + i]; n++; }
  // mip levels (2x2 box filter) so a small Moon is not aliased
  const levels = [{ W, H, alb, hgt, texKm: 2 * Math.PI * 1737.4 / W }];
  while (levels.length < 5) {
    const p = levels[levels.length - 1], w = p.W >> 1, hh = p.H >> 1, A = new Uint8Array(w * hh), Hh = new Uint8Array(w * hh);
    for (let j = 0; j < hh; j++) for (let i = 0; i < w; i++) {
      const o = 2 * j * p.W + 2 * i;
      A[j * w + i] = (p.alb[o] + p.alb[o + 1] + p.alb[o + p.W] + p.alb[o + p.W + 1] + 2) >> 2;
      Hh[j * w + i] = (p.hgt[o] + p.hgt[o + 1] + p.hgt[o + p.W] + p.hgt[o + p.W + 1] + 2) >> 2;
    }
    levels.push({ W: w, H: hh, alb: A, hgt: Hh, texKm: p.texKm * 2 });
  }
  return { levels, mean: s / n / 255, hScale: (meta.maxKm - meta.minKm) / 255 };
}

async function init() {
  try {
    const [d, s] = await Promise.all([fetch("data/eyepiece.json").then(r => r.json()), fetch("data/sky/stars.json").then(r => r.json())]);
    DATA = d; STARS = s.stars;
    MOONTEX = await loadMoonTex();
  } catch (e) {
    $("#views").innerHTML = `<div class="card ep-err"><h3>Could not load the sky data</h3><p>${esc(e.message || e)}</p></div>`;
    return;
  }
  // bortle slider default matches the markup
  buildInstruments(); buildEyepieces(); buildTargets(); buildReads();
  computeSky(); pickDefaults(); updateWhen();
  bindControls();
  refresh();
  addEventListener("resize", () => { views.forEach(v => { v.N = 0; }); markDirty(); redrawStatic(); });
  if (!reduce) requestAnimationFrame(loop); else redrawStatic();
  setInterval(() => { if (state.when === "now" && !document.hidden) { computeSky(); updateWhen(); updateVisChips(); markDirty(); redrawStatic(); } }, 5 * 60 * 1000);
  document.body.classList.add("ep-ready");
  window.__eyepiece = { state, views, buildScene, drawView, refresh };   // for scripts/shot.py checks
}
init();
