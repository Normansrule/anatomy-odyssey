/* Cosmic Scale (scale.html): one continuous zoom from a proton to the
 * observable universe, 42 powers of ten.
 *
 * How it works
 *   - The zoom state is z = log10(width of the reference square in metres).
 *     The reference square is the largest square that fits the free part of
 *     the screen, the "frame" of the Powers of Ten film.
 *   - Objects from data/scale.json are lined up side by side in order of size
 *     (Scale-of-the-Universe style). Each has an "anchor" zoom where it fills
 *     about 65% of the frame. Between two anchors the camera slides linearly
 *     in field-of-view WIDTH (not in z), which keeps the previous object in
 *     frame while the next one arrives.
 *   - Every object is drawn procedurally on a 2D canvas: vectors for
 *     silhouettes and diagrams, cached offscreen "sprites" (noise textures,
 *     particle galaxies) for the rest. Nothing is downloaded.
 *
 * Constants and sources
 *   c  = 299,792,458 m/s (exact, SI definition)
 *   AU = 149,597,870,700 m (exact, IAU 2012 Resolution B2)
 *   ly = 9,460,730,472,580,800 m (IAU: Julian year × c)
 *   pc = 3.0856775814913673e16 m (IAU 2015 Resolution B2)
 *   Cosmology: Planck Collaboration 2020, A&A 641, A6 (TT,TE,EE+lowE+lensing):
 *              H0 = 67.66 km/s/Mpc, Ωm = 0.3111, ΩΛ = 0.6889, z* = 1089.9.
 *              Radiation Ωr h² = 4.15e-5 (photons + 3 massless neutrinos).
 *   Planet mean longitudes: Standish, JPL "Keplerian Elements for Approximate
 *              Positions of the Major Planets", Table 1 (J2000 + rates).
 *   Object sizes: see "src" on each entry of data/scale.json.
 */

const C = 299792458;
const AU = 149597870700;
const LY = 9460730472580800;
const PC = 3.0856775814913673e16;
const MILE = 1609.344;
const Z_MIN = -15.4, Z_MAX = 27.6;

const $ = (s) => document.querySelector(s);
const reduce = !!(window.Codex && window.Codex.reducedMotion);
const gsap = window.gsap;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const TAU = Math.PI * 2;

/* ============================== random & noise ============================== */
function rng(seed) { // mulberry32
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v); };

const PERM = new Uint8Array(1024), VAL = new Float32Array(256);
(function () {
  const r = rng(1969);
  const p = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 1024; i++) PERM[i] = p[i & 255];
  for (let i = 0; i < 256; i++) VAL[i] = r();
})();
// 3D value noise (after Inigo Quilez), range 0..1
function noise3(x, y, z) {
  const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
  const xf = x - X, yf = y - Y, zf = z - Z;
  const xi = X & 255, yi = Y & 255, zi = Z & 255;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const A = PERM[xi] + yi, AA = PERM[A] + zi, AB = PERM[A + 1] + zi;
  const B = PERM[xi + 1] + yi, BA = PERM[B] + zi, BB = PERM[B + 1] + zi;
  const x1 = lerp(VAL[PERM[AA]], VAL[PERM[BA]], u), x2 = lerp(VAL[PERM[AB]], VAL[PERM[BB]], u);
  const x3 = lerp(VAL[PERM[AA + 1]], VAL[PERM[BA + 1]], u), x4 = lerp(VAL[PERM[AB + 1]], VAL[PERM[BB + 1]], u);
  return lerp(lerp(x1, x2, v), lerp(x3, x4, v), w);
}
function fbm(x, y, z, oct = 4) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); n += a; x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; z = z * 2.03 + 9.2; a *= 0.5; }
  return s / n;
}

/* ============================== formatting ============================== */
const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "-": "⁻", ".": "·" };
const supStr = (s) => String(s).split("").map((ch) => SUP[ch] || ch).join("");
function nice(x) { // three significant figures, thousands separators
  const a = Math.abs(x);
  if (a >= 100) return Math.round(x).toLocaleString("en-US");
  if (a >= 10) return (+x.toFixed(1)).toLocaleString("en-US");
  return String(+x.toFixed(a >= 1 ? 2 : 3));
}
function sciParts(v, sig = 3) {
  if (v === 0) return ["0", 0];
  let e = Math.floor(Math.log10(Math.abs(v)));
  let m = v / Math.pow(10, e);
  let ms = m.toFixed(sig - 1);
  if (Math.abs(+ms) >= 10) { e += 1; ms = (m / 10).toFixed(sig - 1); }
  ms = String(+ms);
  return [ms, e];
}
function sciTxt(v, sig = 3) { const [m, e] = sciParts(v, sig); return (m === "1" ? "" : m + " × ") + "10" + supStr(e); }
function sciHTML(v, sig = 3) {
  const a = Math.abs(v);
  if (a >= 0.01 && a < 1e6) return nice(v);
  const [m, e] = sciParts(v, sig);
  return (m === "1" ? "" : m + "&thinsp;×&thinsp;") + "10<sup>" + String(e).replace("-", "−") + "</sup>";
}
// Friendly length: [number string, unit]
function lenParts(m) {
  const a = Math.abs(m);
  if (a < 1e-12) return [nice(m / 1e-15), "fm"];
  if (a < 1e-9) return [nice(m / 1e-12), "pm"];
  if (a < 1e-6) return [nice(m / 1e-9), "nm"];
  if (a < 1e-3) return [nice(m / 1e-6), "µm"];
  if (a < 1e-2) return [nice(m / 1e-3), "mm"];
  if (a < 1) return [nice(m / 1e-2), "cm"];
  if (a < 1e4) return [nice(m), "m"];
  if (a < 1.5e10) return [nice(m / 1e3), "km"];
  if (a < 0.05 * LY) return [nice(m / AU), "AU"];
  const l = m / LY;
  if (l < 1e4) return [nice(l), "ly"];
  if (l < 1e6) return [nice(l / 1e3), "thousand ly"];
  if (l < 1e9) return [nice(l / 1e6), "million ly"];
  return [nice(l / 1e9), "billion ly"];
}
const lenTxt = (m) => { const [n, u] = lenParts(m); return n + " " + u; };
function timeTxt(s) {
  const a = Math.abs(s);
  const pre = [[1e-24, "ys"], [1e-21, "zs"], [1e-18, "as"], [1e-15, "fs"], [1e-12, "ps"], [1e-9, "ns"], [1e-6, "µs"], [1e-3, "ms"]];
  if (a < 1) {
    for (let i = pre.length - 1; i >= 0; i--) if (a >= pre[i][0] || i === 0) return nice(s / pre[i][0]) + " " + pre[i][1];
  }
  if (a < 60) return nice(s) + " s";
  if (a < 3600) { const mnt = Math.floor(a / 60), sec = Math.round(a - mnt * 60); return mnt + " min" + (sec ? " " + sec + " s" : ""); }
  if (a < 86400 * 2) return nice(a / 3600) + " hours";
  const yr = a / 31557600;
  if (yr < 1) return nice(a / 86400) + " days";
  if (yr < 1e4) return nice(yr) + " years";
  if (yr < 1e6) return nice(yr / 1e3) + " thousand years";
  if (yr < 1e9) return nice(yr / 1e6) + " million years";
  return nice(yr / 1e9) + " billion years";
}
const PREFIX_NAME = { ys: "yoctoseconds", zs: "zeptoseconds", as: "attoseconds", fs: "femtoseconds", ps: "picoseconds", ns: "nanoseconds", "µs": "microseconds", ms: "milliseconds" };
// Deep-time landmarks for the light-time line (years ago; rounded, widely cited values)
const EPOCHS = [
  [5.2e3, "the first writing appeared in Mesopotamia"],
  [1.2e4, "the last ice age ended and farming began"],
  [7e4, "modern humans began spreading out of Africa"],
  [3e5, "the first Homo sapiens lived in Africa"],
  [2.6e6, "our ancestors made the first stone tools"],
  [6.5e6, "our lineage split from the chimpanzees'"],
  [6.6e7, "an asteroid ended the age of the dinosaurs"],
  [5.4e8, "complex animals first appeared, in the Cambrian"],
  [4.54e9, "Earth formed"]
];
function lightContext(t, L) {
  const yr = t / 31557600;
  if (t < 0.25) {
    const n = 1 / t;
    return "In one second, light could cross " + (n < 1e6 ? nice(n) : sciTxt(n)) + " of these laid end to end.";
  }
  if (t < 60) return "About " + nice(t / 0.86) + " heartbeats. A radio \"hello?\" and its reply would need " + timeTxt(2 * t) + ".";
  if (yr < 1) return "A question sent across by radio would get its answer back after " + timeTxt(2 * t) + ".";
  if (yr < 1500) {
    const y = new Date().getFullYear() - yr;
    return "Light arriving from the far side now set out around the year " + Math.round(y) + ".";
  }
  if (yr > 13.8e9) return "Longer than the universe has existed (13.8 billion years). In an expanding universe the real story is stranger: see Big ideas.";
  let best = EPOCHS[0], bd = 1e9;
  for (const e of EPOCHS) { const d = Math.abs(Math.log10(e[0] / yr)); if (d < bd) { bd = d; best = e; } }
  return "Light now arriving from the far side set out roughly when " + best[1] + ".";
}
function writtenOut(m) { // full decimal with thin grouping, capped length
  if (m >= 1e21 || m < 1e-18) return sciTxt(m, 3).replace(/ /g, " ") + " m";
  const [mm, e] = sciParts(m, 3);
  const digits = mm.replace(".", "");
  let s;
  if (e >= 0) {
    const intLen = e + 1;
    const d = digits.padEnd(intLen, "0");
    s = d.slice(0, intLen).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (d.length > intLen ? "." + d.slice(intLen) : "");
  } else {
    s = "0." + ("0".repeat(-e - 1) + digits).replace(/(\d{3})(?=\d)/g, "$1 ");
  }
  return s + " m";
}

/* ============================== cosmology ============================== */
// Comoving distance and age in flat ΛCDM with radiation (Planck 2020 values, see header).
const COSMO = (function () {
  const H0 = 67.66e3 / (PC * 1e6); // s^-1
  const h = 0.6766, Or = 4.15e-5 / (h * h), Om = 0.3111, OL = 1 - Om - Or;
  const f = (a) => 1 / Math.sqrt(Or + Om * a + OL * a * a * a * a); // dD/da in units of c/H0
  const g = (a) => a / Math.sqrt(Or + Om * a + OL * a * a * a * a); // dt/da in units of 1/H0
  function simpson(fn, a, b, n) { const hh = (b - a) / n; let s = fn(a) + fn(b); for (let i = 1; i < n; i++) s += fn(a + i * hh) * (i % 2 ? 4 : 2); return s * hh / 3; }
  const Dh = C / H0;
  const horizon = simpson(f, 0, 1, 20000) * Dh;
  const aStar = 1 / (1 + 1089.9);
  const cmb = simpson(f, aStar, 1, 20000) * Dh;
  const age = simpson(g, 0, 1, 20000) / H0;
  return { horizon, cmb, cmbThen: cmb * aStar, age };
})();

/* ============================== state ============================== */
const state = {
  z: 0.23, zt: 0.23, flying: null, t: 0, frame: 0,
  hover: null, focus: null, touring: false
};
let DATA = null, OBJ = [], BY = {}, CATS = {}, ANCH = [];
const view = { W: 0, H: 0, dpr: 1, cx: 0, cy: 0, ref: 600, ppm: 1, left: 0, right: 0, top: 0, bottom: 0, portrait: false, axis: [1, 0] };
const cv = $("#cv"), ctx = cv.getContext("2d");
let SPR = 768; // sprite resolution, set at init from screen size
let PSPR = 640; // resolution for per-pixel (noise) sprites, which cost more to generate

/* ============================== layout ============================== */
const ANCHOR_K = 1.55;   // object's largest dimension fills 1/1.55 of the frame at its anchor
const GAP = 1.3;         // centre-to-centre spacing, in half-extents
function layout() {
  const sorted = OBJ.slice().sort((a, b) => a.D - b.D);
  let s = 0, prevE = 0;
  sorted.forEach((o, i) => {
    const e = view.portrait ? o.h : o.w;
    if (i) s += GAP * (prevE / 2 + e / 2);
    o.s = s; prevE = e;
    o.za = Math.log10(o.D * (view.portrait ? 1.22 : ANCHOR_K));
  });
  ANCH = sorted.map((o) => ({ z: o.za, s: o.s, o }));
  for (let i = 1; i < ANCH.length; i++) if (ANCH[i].z <= ANCH[i - 1].z) ANCH[i].z = ANCH[i - 1].z + 1e-3;
}
function camS(z) {
  if (z <= ANCH[0].z) return ANCH[0].s;
  const n = ANCH.length;
  if (z >= ANCH[n - 1].z) return ANCH[n - 1].s;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (ANCH[m].z <= z) lo = m; else hi = m; }
  const a = ANCH[lo], b = ANCH[hi];
  const W = Math.pow(10, z), Wa = Math.pow(10, a.z), Wb = Math.pow(10, b.z);
  const f = clamp((W - Wa) / (Wb - Wa), 0, 1);
  return a.s + (b.s - a.s) * f;
}

/* ============================== sprites ============================== */
const sprites = new Map();
let genBudget = 1;
function mk(w, h) { const c = document.createElement("canvas"); c.width = w; c.height = h || w; return c; }
function sprite(key, gen) {
  const e = sprites.get(key);
  if (e) { e.used = state.frame; return e.cv; }
  if (genBudget <= 0) return null;
  genBudget--;
  let c = null;
  try { c = gen(); } catch (err) { console.warn("sprite", key, err); c = mk(2); }
  sprites.set(key, { cv: c, used: state.frame });
  if (sprites.size > 26) { // evict least-recently used
    let old = null, ou = Infinity;
    for (const [k, v] of sprites) if (v.used < ou && state.frame - v.used > 90) { ou = v.used; old = k; }
    if (old) sprites.delete(old);
  }
  return c;
}
function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mixc(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
const rgba = (c, a) => "rgba(" + (c[0] | 0) + "," + (c[1] | 0) + "," + (c[2] | 0) + "," + a + ")";

// Equirectangular texture: fn(lat, lon, x, y, z) -> [r,g,b]; x,y,z point on unit sphere
function makeTex(w, h, fn) {
  const d = new Uint8ClampedArray(w * h * 3);
  for (let j = 0; j < h; j++) {
    const lat = Math.PI / 2 - (j + 0.5) / h * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < w; i++) {
      const lon = (i + 0.5) / w * TAU - Math.PI;
      const c = fn(lat, lon, cl * Math.sin(lon), sl, cl * Math.cos(lon), i, j);
      const k = (j * w + i) * 3; d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2];
    }
  }
  return { w, h, d };
}
function sampleTex(t, lat, lon, out) {
  let u = ((lon + Math.PI) / TAU) * t.w - 0.5; u = ((u % t.w) + t.w) % t.w;
  let v = (0.5 - lat / Math.PI) * t.h - 0.5; v = clamp(v, 0, t.h - 1.001);
  const i0 = Math.floor(u), j0 = Math.floor(v), i1 = (i0 + 1) % t.w, j1 = j0 + 1, fu = u - i0, fv = v - j0;
  for (let c = 0; c < 3; c++) {
    const a = t.d[(j0 * t.w + i0) * 3 + c], b = t.d[(j0 * t.w + i1) * 3 + c];
    const e = t.d[(j1 * t.w + i0) * 3 + c], f = t.d[(j1 * t.w + i1) * 3 + c];
    out[c] = (a + (b - a) * fu) * (1 - fv) + (e + (f - e) * fu) * fv;
  }
  return out;
}
// Lit sphere from an equirectangular texture
function sphereSprite(size, tex, opt = {}) {
  const c = mk(size), g = c.getContext("2d"), img = g.createImageData(size, size), d = img.data;
  let L = opt.light || [-0.62, 0.38, 0.69]; const ln = Math.hypot(...L); L = L.map((v) => v / ln);
  const tilt = opt.tilt ?? 0.32, ct = Math.cos(tilt), st = Math.sin(tilt), rot = opt.rot || 0;
  const amb = opt.ambient ?? 0.035, out = [0, 0, 0];
  for (let y = 0; y < size; y++) {
    const ny = -((y + 0.5) / size * 2 - 1);
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2 - 1, r2 = nx * nx + ny * ny;
      if (r2 > 1) continue;
      const r = Math.sqrt(r2), nz = Math.sqrt(1 - r2);
      const edge = Math.min(1, (1 - r) * size * 0.5);
      const by = ny * ct + nz * st, bz = -ny * st + nz * ct;
      const lat = Math.asin(clamp(by, -1, 1)), lon = Math.atan2(nx, bz) + rot;
      sampleTex(tex, lat, lon, out);
      const dif = nx * L[0] + ny * L[1] + nz * L[2];
      let sh = smooth(-0.14, 0.42, dif) * (1 - amb) + amb;
      if (opt.limb) sh *= 0.55 + 0.45 * Math.pow(nz, 0.5);
      let rr = out[0] * sh, gg = out[1] * sh, bb = out[2] * sh;
      if (opt.spec && opt.spec(out)) { // ocean glint
        const hz = L[2] + 1, hx = L[0], hy = L[1], hl = Math.hypot(hx, hy, hz);
        const sp = Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 60) * 120;
        rr += sp * 0.8; gg += sp * 0.9; bb += sp;
      }
      if (opt.rim) { // atmospheric scattering near the limb, on the day side
        const rim = Math.pow(1 - nz, 3) * smooth(-0.3, 0.5, dif);
        rr += opt.rim[0] * rim; gg += opt.rim[1] * rim; bb += opt.rim[2] * rim;
      }
      const k = (y * size + x) * 4;
      d[k] = rr; d[k + 1] = gg; d[k + 2] = bb; d[k + 3] = 255 * edge;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/* ------------------------------ textures ------------------------------ */
let LAND = null; // {w,h,m: Uint8Array, blur: Float32Array}
function loadLand(src) {
  return new Promise((res) => {
    const im = new Image();
    im.onload = () => {
      const w = im.width, h = im.height, c = mk(w, h), g = c.getContext("2d");
      g.drawImage(im, 0, 0);
      const px = g.getImageData(0, 0, w, h).data, m = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) m[i] = px[i * 4] > 127 ? 1 : 0;
      // separable box blur (radius 6) for shallow seas and coastal colour
      const tmp = new Float32Array(w * h), bl = new Float32Array(w * h), R = 6;
      for (let y = 0; y < h; y++) { let s = 0; for (let x = -R; x <= R; x++) s += m[y * w + ((x + w) % w)]; for (let x = 0; x < w; x++) { tmp[y * w + x] = s / (2 * R + 1); s += m[y * w + ((x + R + 1) % w)] - m[y * w + ((x - R + w) % w)]; } }
      for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) { let s = 0, n = 0; for (let k = -R; k <= R; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } } bl[y * w + x] = s / n; }
      LAND = { w, h, m, blur: bl };
      res();
    };
    im.onerror = () => res();
    im.src = src;
  });
}
function earthTex(w) {
  const h = w / 2, deg = 180 / Math.PI;
  return makeTex(w, h, (lat, lon, x, y, z) => {
    let land = 0, coast = 0;
    if (LAND) {
      const i = clamp(Math.floor((lon + Math.PI) / TAU * LAND.w), 0, LAND.w - 1), j = clamp(Math.floor((0.5 - lat / Math.PI) * LAND.h), 0, LAND.h - 1);
      land = LAND.m[j * LAND.w + i]; coast = LAND.blur[j * LAND.w + i];
    }
    const alat = Math.abs(lat * deg), n = fbm(x * 5, y * 5, z * 5, 4), n2 = fbm(x * 18 + 5, y * 18, z * 18, 3);
    let c;
    if (land) {
      const dry = Math.exp(-Math.pow((alat - 24) / 9, 2)) * smooth(0.35, 0.6, n + 0.15 * (1 - coast));
      const cold = smooth(50, 68, alat + (n - 0.5) * 12);
      let base = mixc([44, 86, 38], [88, 104, 52], smooth(0.3, 0.7, n2));
      base = mixc(base, [196, 164, 112], dry);
      base = mixc(base, [112, 108, 92], cold * 0.8);
      const ice = alat > 72 || lat * deg < -62 || (lon * deg > -55 && lon * deg < -18 && lat * deg > 62) ? 1 : smooth(70, 76, alat);
      c = mixc(base, [236, 240, 246], ice);
      c = mixc(c, [0, 0, 0], (n2 - 0.5) * 0.25);
    } else {
      c = mixc([6, 24, 66], [22, 74, 124], smooth(0.05, 0.6, coast));
      c = mixc(c, [4, 16, 44], (n - 0.5) * 0.6);
      if (alat > 76) c = mixc(c, [220, 230, 240], smooth(76, 82, alat + n * 6));
    }
    // clouds: bands at the Intertropical Convergence Zone and in the storm tracks
    const band = 0.55 + 0.35 * Math.exp(-Math.pow(alat / 7, 2)) + 0.45 * Math.exp(-Math.pow((alat - 55) / 14, 2)) - 0.3 * Math.exp(-Math.pow((alat - 25) / 8, 2));
    const wx = fbm(x * 3 + 11, y * 6, z * 3, 3) * 1.4;
    const cl = smooth(0.5, 0.74, fbm(x * 4 + wx, y * 7, z * 4 - wx, 5) * band + 0.08);
    return mixc(c, [246, 248, 252], cl * 0.92);
  });
}
function moonTex(w) {
  const h = w / 2, r = rng(4);
  const t = makeTex(w, h, (lat, lon, x, y, z) => {
    const n = fbm(x * 6, y * 6, z * 6, 5);
    const mare = smooth(0.52, 0.6, fbm(x * 1.6 + 3, y * 1.6, z * 1.6 + 1, 3) + (z > 0.2 ? 0.05 : -0.08));
    const v = 150 + (n - 0.5) * 90 - mare * 62;
    return [v, v * 0.985, v * 0.96];
  });
  // craters: floor darker, bright rim
  for (let k = 0; k < 420; k++) {
    const lat = Math.asin(r() * 2 - 1), lon = r() * TAU - Math.PI, rad = Math.pow(r(), 3) * 0.08 + 0.006;
    const ci = (lon + Math.PI) / TAU * w, cj = (0.5 - lat / Math.PI) * h, ry = rad / Math.PI * h, rx = ry / Math.max(0.2, Math.cos(lat));
    for (let j = Math.floor(cj - ry * 1.4); j <= cj + ry * 1.4; j++) {
      if (j < 0 || j >= h) continue;
      for (let i = Math.floor(ci - rx * 1.4); i <= ci + rx * 1.4; i++) {
        const dx = (i - ci) / rx, dy = (j - cj) / ry, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd > 1.4) continue;
        const ii = ((i % w) + w) % w, kk = (j * w + ii) * 3;
        let dv = 0;
        if (dd < 0.85) dv = -18 + dx * 14; else if (dd < 1.08) dv = 26 - dx * 10; else dv = 8 * (1.4 - dd);
        t.d[kk] += dv; t.d[kk + 1] += dv; t.d[kk + 2] += dv;
      }
    }
  }
  return t;
}
function jupiterTex(w) {
  const h = w / 2, deg = 180 / Math.PI;
  const bands = [[-90, [120, 110, 100]], [-60, [150, 130, 110]], [-40, [196, 168, 132]], [-30, [226, 208, 180]], [-22, [180, 128, 90]], [-14, [214, 192, 160]], [-6, [238, 226, 206]], [0, [232, 206, 170]], [7, [242, 232, 214]], [13, [176, 118, 80]], [19, [212, 176, 136]], [26, [236, 222, 196]], [33, [190, 150, 110]], [42, [222, 204, 176]], [55, [160, 140, 120]], [90, [120, 112, 104]]];
  function bandCol(lat) {
    for (let i = 1; i < bands.length; i++) if (lat <= bands[i][0]) { const a = bands[i - 1], b = bands[i]; return mixc(a[1], b[1], smooth(0, 1, (lat - a[0]) / (b[0] - a[0]))); }
    return bands[bands.length - 1][1];
  }
  return makeTex(w, h, (lat, lon, x, y, z) => {
    const L = lat * deg;
    const turb = (fbm(x * 4, y * 22, z * 4, 4) - 0.5) * 7 * (0.4 + 0.6 * Math.abs(Math.sin(lat * 5)));
    let c = bandCol(L + turb);
    c = mixc(c, [255, 250, 240], (fbm(x * 9, y * 40, z * 9, 3) - 0.5) * 0.5);
    // Great Red Spot at 22° S
    const dl = (lon * deg - 40) / 11, dp = (L + 22) / 5.5, dd = dl * dl + dp * dp;
    if (dd < 1.6) {
      const sw = fbm(dl * 2 + dp, dp * 2 - dl, 3, 3);
      c = mixc(c, mixc([196, 92, 60], [230, 150, 110], sw), smooth(1.6, 0.6, dd));
    }
    return c;
  });
}
// Emissive star disc with limb darkening and convection cells
function starSprite(size, o) {
  const c = mk(size), g = c.getContext("2d"), img = g.createImageData(size, size), d = img.data;
  const c1 = hex(o.c1), c2 = hex(o.c2), c3 = hex(o.c3), cells = o.cells, seed = o.seed || 0;
  for (let y = 0; y < size; y++) {
    const ny = (y + 0.5) / size * 2 - 1;
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5) / size * 2 - 1;
      const ang = Math.atan2(ny, nx);
      const wob = o.wobble ? 1 - o.wobble * fbm(Math.cos(ang) * 2 + seed, Math.sin(ang) * 2, 1, 3) : 1;
      const r = Math.hypot(nx, ny) / wob;
      if (r > 1) continue;
      const mu = Math.sqrt(1 - r * r);
      const edge = Math.min(1, (1 - r) * size * 0.35);
      const px = nx / wob, py = ny / wob, pz = mu;
      const n1 = noise3(px * cells + seed, py * cells, pz * cells);
      const n2 = fbm(px * cells * 4, py * cells * 4 + seed, pz * cells * 4, 3);
      const gran = 1 - Math.abs(n2 * 2 - 1); // ridged: bright cells, dark lanes
      const I = (1 - 0.62 * (1 - mu) - 0.18 * (1 - mu * mu)) * (0.82 + 0.1 * n1 + 0.16 * gran);
      const col = mu > 0.55 ? mixc(c2, c1, (mu - 0.55) / 0.45) : mixc(c3, c2, mu / 0.55);
      const k = (y * size + x) * 4;
      d[k] = col[0] * I * 1.08; d[k + 1] = col[1] * I * 1.04; d[k + 2] = col[2] * I; d[k + 3] = 255 * edge;
    }
  }
  g.putImageData(img, 0, 0);
  if (o.spots) { // sunspots: penumbra + umbra
    const r = rng(7);
    g.globalCompositeOperation = "multiply";
    for (let k = 0; k < o.spots; k++) {
      const a = r() * TAU, rad = Math.sqrt(r()) * 0.6, s = (0.012 + r() * 0.02) * size;
      const x = size / 2 + Math.cos(a) * rad * size / 2, y = size / 2 + (Math.sin(a) * 0.35 + (r() < 0.5 ? -0.28 : 0.28)) * size / 2;
      const gr = g.createRadialGradient(x, y, 0, x, y, s);
      gr.addColorStop(0, "rgba(60,20,0,1)"); gr.addColorStop(0.45, "rgba(90,40,10,.95)"); gr.addColorStop(0.55, "rgba(170,90,30,.6)"); gr.addColorStop(1, "rgba(255,200,120,0)");
      g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, s * 1.3, s, 0, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = "source-over";
  }
  return c;
}

/* ============================== drawing helpers ============================== */
// Every draw function works in "object units": the context is translated to the
// object's centre and scaled so 1 unit = the object's largest dimension (o.D).
// v = { sx, sy (screen centre, CSS px), px (1 unit in CSS px), u (1 CSS px in units), t (s), a (alpha) }
const DRAW = {};
function glow(g, x, y, r, col, a) {
  if (!(r > 0)) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.35, rgba(col, a * 0.45)); gr.addColorStop(1, rgba(col, 0));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
function ball(g, x, y, r, col, hi, lo) { // shaded sphere, light from upper left
  const gr = g.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x, y, r);
  gr.addColorStop(0, hi || "#ffffff"); gr.addColorStop(0.35, col); gr.addColorStop(1, lo || "#000000");
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
const FONT_S = '500 11px "JetBrains Mono", ui-monospace, monospace';
const FONT_L = '600 12px "Space Grotesk", system-ui, sans-serif';
function txt(g, v, xu, yu, s, o = {}) {
  if (v.f === false && !o.always) return;
  const x = v.sx + xu * v.px + (o.dx || 0), y = v.sy + yu * v.px + (o.dy || 0);
  g.save(); g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  g.globalAlpha = (o.a ?? 1) * v.a; g.font = o.font || FONT_S;
  g.textAlign = o.align || "left"; g.textBaseline = o.base || "middle";
  if (o.shadow !== false) { g.shadowColor = "rgba(0,0,0,.85)"; g.shadowBlur = 6; }
  const tw = g.measureText(s).width, al = g.textAlign;
  let xx = x; const lo = al === "center" ? tw / 2 + 4 : al === "right" ? tw + 4 : 4, hi = al === "center" ? tw / 2 + 4 : al === "right" ? 4 : tw + 4;
  if (xx - lo < 0) xx = lo; if (xx + hi > view.W) xx = view.W - hi;
  g.fillStyle = o.color || "rgba(220,228,255,.85)"; g.fillText(s, xx, y);
  g.restore();
}
function tick(g, v, x1, y1, x2, y2, col, w = 1, dash) {
  g.save(); g.strokeStyle = col; g.lineWidth = w * v.u; if (dash) g.setLineDash(dash.map((d) => d * v.u));
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); g.restore();
}
function ring(g, v, r, col, w = 1, dash) {
  g.save(); g.strokeStyle = col; g.lineWidth = w * v.u; if (dash) g.setLineDash(dash.map((d) => d * v.u));
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); g.restore();
}
function blobPath(g, cx, cy, R, seed, amp = 0.18, n = 64) {
  g.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = i / n * TAU, r = R * (1 + amp * (fbm(Math.cos(a) * 1.3 + seed, Math.sin(a) * 1.3, seed * 0.7, 3) - 0.5) * 2);
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    i ? g.lineTo(x, y) : g.moveTo(x, y);
  }
  g.closePath();
}

/* ------------------------------ geometry: truncated icosahedron (C60 and the football) ------------------------------ */
const TI = (function () {
  const p = (1 + Math.sqrt(5)) / 2, V = [];
  const base = [[0, 1, 3 * p], [1, 2 + p, 2 * p], [p, 2, p * p * p]];
  for (const b of base) for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    if ((b[0] === 0 && sx < 0)) continue;
    const q = [b[0] * sx, b[1] * sy, b[2] * sz];
    for (let k = 0; k < 3; k++) V.push([q[k % 3], q[(k + 1) % 3], q[(k + 2) % 3]]);
  }
  const R = Math.hypot(...V[0]); const Vn = V.map((v) => v.map((c) => c / R));
  const E = [];
  for (let i = 0; i < 60; i++) for (let j = i + 1; j < 60; j++) if (Math.abs(Math.hypot(V[i][0] - V[j][0], V[i][1] - V[j][1], V[i][2] - V[j][2]) - 2) < 1e-6) E.push([i, j]);
  const ico = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) { const q = [0, sx, sy * p]; for (let k = 0; k < 3; k++) ico.push([q[k % 3], q[(k + 1) % 3], q[(k + 2) % 3]]); }
  const P = ico.map((c) => {
    const cn = c.map((x) => x / Math.hypot(...c));
    const idx = Vn.map((v, i) => [v[0] * cn[0] + v[1] * cn[1] + v[2] * cn[2], i]).sort((a, b) => b[0] - a[0]).slice(0, 5).map((x) => x[1]);
    // order around the centre
    const ux = Math.abs(cn[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    const a1 = [cn[1] * ux[2] - cn[2] * ux[1], cn[2] * ux[0] - cn[0] * ux[2], cn[0] * ux[1] - cn[1] * ux[0]];
    const a2 = [cn[1] * a1[2] - cn[2] * a1[1], cn[2] * a1[0] - cn[0] * a1[2], cn[0] * a1[1] - cn[1] * a1[0]];
    idx.sort((i, j) => Math.atan2(Vn[i][0] * a2[0] + Vn[i][1] * a2[1] + Vn[i][2] * a2[2], Vn[i][0] * a1[0] + Vn[i][1] * a1[1] + Vn[i][2] * a1[2]) - Math.atan2(Vn[j][0] * a2[0] + Vn[j][1] * a2[1] + Vn[j][2] * a2[2], Vn[j][0] * a1[0] + Vn[j][1] * a1[1] + Vn[j][2] * a1[2]));
    return { c: cn, idx };
  });
  const inPent = new Set(); P.forEach((pp) => { for (let k = 0; k < 5; k++) { const a = pp.idx[k], b = pp.idx[(k + 1) % 5]; inPent.add(Math.min(a, b) * 100 + Math.max(a, b)); } });
  return { V: Vn, E, P, inPent };
})();
function rotV(v, ax, ay) {
  const ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay);
  const y = v[1] * ca - v[2] * sa, z = v[1] * sa + v[2] * ca;
  return [v[0] * cb + z * sb, y, -v[0] * sb + z * cb];
}

/* ------------------------------ subatomic & atomic ------------------------------ */
DRAW.proton = (g, o, v) => {
  const t = v.t;
  g.globalCompositeOperation = "lighter";
  glow(g, 0, 0, 0.66, [255, 79, 154], 0.26);
  glow(g, 0, 0, 0.44, [177, 140, 255], 0.22);
  const q = [0, 1, 2].map((i) => { const a = i * TAU / 3 + t * 0.35 + 0.35 * Math.sin(t * 1.3 + i * 2); const r = 0.19 + 0.035 * Math.sin(t * 2.1 + i); return [Math.cos(a) * r, Math.sin(a) * r]; });
  g.lineCap = "round";
  for (let i = 0; i < 3; i++) {
    const a = q[i], b = q[(i + 1) % 3], dx = b[1] - a[1], dy = a[0] - b[0], L = Math.hypot(dx, dy) || 1;
    g.beginPath();
    for (let k = 0; k <= 48; k++) {
      const f = k / 48, w = Math.sin(f * Math.PI * 9 - t * 9) * 0.026 * Math.sin(f * Math.PI);
      const x = lerp(a[0], b[0], f) + dx / L * w, y = lerp(a[1], b[1], f) + dy / L * w;
      k ? g.lineTo(x, y) : g.moveTo(x, y);
    }
    g.strokeStyle = "rgba(255,226,160,.5)"; g.lineWidth = 0.014; g.stroke();
  }
  const r = rng(Math.floor(t * 7));
  for (let k = 0; k < 16; k++) { const a = r() * TAU, rr = Math.sqrt(r()) * 0.4; glow(g, Math.cos(a) * rr, Math.sin(a) * rr, 0.035, [200, 220, 255], 0.55 * r()); }
  const cols = [[255, 70, 90], [70, 255, 140], [90, 140, 255]];
  q.forEach((p, i) => { glow(g, p[0], p[1], 0.14, cols[i], 0.95); glow(g, p[0], p[1], 0.05, [255, 255, 255], 0.95); });
  g.globalCompositeOperation = "source-over";
  if (v.px > 180) {
    ["u", "u", "d"].forEach((s, i) => txt(g, v, q[i][0], q[i][1], s, { align: "center", font: '600 13px "Space Grotesk", sans-serif', color: "#fff", dy: -0.1 * v.px }));
    if (v.px > 320) txt(g, v, 0, -0.6, "two up quarks, one down · the colours label 'colour charge', not real colour", { align: "center", color: "rgba(233,237,255,.6)" });
  }
};
DRAW.nucleus = (g, o, v) => {
  const s = sprite("nucleus", () => {
    const S = SPR, c = mk(S), x = c.getContext("2d"), r = rng(238), N = 238;
    const rb = 0.5 * Math.cbrt(0.62 / N), Rm = 0.5 - rb;
    const P = [];
    for (let i = 0; i < N; i++) { let p; do { p = [r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]; } while (Math.hypot(...p) > 1); P.push(p.map((q) => q * Rm)); }
    for (let it = 0; it < 40; it++) for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        const dx = P[j][0] - P[i][0], dy = P[j][1] - P[i][1], dz = P[j][2] - P[i][2], d = Math.hypot(dx, dy, dz);
        if (d < 2 * rb && d > 1e-9) { const k = (2 * rb - d) / d * 0.5; P[i][0] -= dx * k; P[i][1] -= dy * k; P[i][2] -= dz * k; P[j][0] += dx * k; P[j][1] += dy * k; P[j][2] += dz * k; }
      }
      const d = Math.hypot(...P[i]); if (d > Rm) P[i] = P[i].map((q) => q * Rm / d);
    }
    const kind = P.map((_, i) => (i < 92 ? 1 : 0)); // 92 protons
    for (let i = N - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [kind[i], kind[j]] = [kind[j], kind[i]]; }
    const ord = P.map((p, i) => i).sort((a, b) => P[a][2] - P[b][2]);
    x.translate(S / 2, S / 2);
    glow(x, 0, 0, S * 0.56, [255, 90, 150], 0.25);
    for (const i of ord) {
      const p = P[i], fade = 0.55 + 0.45 * (p[2] / Rm + 1) / 2;
      const col = kind[i] ? [255 * fade, 86 * fade, 110 * fade] : [100 * fade, 150 * fade, 255 * fade];
      ball(x, p[0] * S, p[1] * S, rb * S * 1.02, rgba(col, 1), rgba(mixc(col, [255, 255, 255], 0.6), 1), rgba(mixc(col, [0, 0, 0], 0.7), 1));
    }
    return c;
  });
  g.globalCompositeOperation = "lighter"; glow(g, 0, 0, 0.7, [255, 79, 154], 0.18); g.globalCompositeOperation = "source-over";
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 220) txt(g, v, 0, -0.58, "92 protons (pink) · 146 neutrons (blue)", { align: "center", color: "rgba(233,237,255,.6)" });
};
DRAW.wave = (g, o, v) => {
  const w = o.w / o.D, h = o.h / o.D, col = hex(o.wave.color), n = o.wave.n, A = h * 0.34, ph = reduce ? 0 : v.t * 3;
  const y = (f, amp) => -amp * Math.sin(TAU * n * f - ph) * Math.pow(Math.sin(Math.PI * f), 0.35);
  g.lineCap = "round"; g.globalCompositeOperation = "lighter";
  tick(g, v, -w / 2, 0, w / 2, 0, "rgba(255,255,255,.12)", 1);
  g.save(); g.setLineDash([3 * v.u, 4 * v.u]);
  g.beginPath(); for (let k = 0; k <= 240; k++) { const f = k / 240; const x = -w / 2 + f * w; const yy = y(f, A * 0.42) * 0.6; k ? g.lineTo(x + yy * 0.5, yy) : g.moveTo(x, yy); }
  g.strokeStyle = "rgba(255,255,255,.28)"; g.lineWidth = 1.2 * v.u; g.stroke(); g.restore();
  for (const [al, lw] of [[0.07, 14], [0.22, 5], [0.95, 1.8]]) {
    g.beginPath(); for (let k = 0; k <= 240; k++) { const f = k / 240; k ? g.lineTo(-w / 2 + f * w, y(f, A)) : g.moveTo(-w / 2, y(f, A)); }
    g.strokeStyle = rgba(col, al); g.lineWidth = lw * v.u; g.stroke();
  }
  g.globalCompositeOperation = "source-over";
  if (v.px > 120) {
    const f0 = 0.5 - 0.5 / n, yb = -h / 2 + 0.02;
    tick(g, v, -w / 2 + f0 * w, yb, -w / 2 + (f0 + 1 / n) * w, yb, "rgba(233,237,255,.7)", 1);
    tick(g, v, -w / 2 + f0 * w, yb - 0.02, -w / 2 + f0 * w, yb + 0.02, "rgba(233,237,255,.7)", 1);
    tick(g, v, -w / 2 + (f0 + 1 / n) * w, yb - 0.02, -w / 2 + (f0 + 1 / n) * w, yb + 0.02, "rgba(233,237,255,.7)", 1);
    txt(g, v, 0, yb, "λ = " + lenTxt(o.size), { align: "center", dy: -10 });
    if (v.px > 260) txt(g, v, 0, h / 2, "electric field (solid) · magnetic field (dashed)", { align: "center", color: "rgba(233,237,255,.5)" });
  }
};
DRAW.hydrogen = (g, o, v) => {
  const a0 = 5.29177e-11 / o.D;
  const s = sprite("hydrogen", () => {
    const S = SPR, c = mk(S), x = c.getContext("2d"), r = rng(1);
    x.translate(S / 2, S / 2); x.globalCompositeOperation = "lighter";
    const A = a0 * S;
    const gr = x.createRadialGradient(0, 0, 0, 0, 0, A * 4.2);
    for (let k = 0; k <= 10; k++) { const rr = k / 10 * 4.2; gr.addColorStop(k / 10, "rgba(150,130,255," + (0.75 * Math.exp(-1.5 * rr)).toFixed(3) + ")"); }
    x.fillStyle = gr; x.beginPath(); x.arc(0, 0, A * 4.2, 0, TAU); x.fill();
    for (let i = 0; i < 50000; i++) {
      const rr = -0.5 * A * Math.log(r() * r() * r() + 1e-12), ct = r() * 2 - 1, ph = r() * TAU, st = Math.sqrt(1 - ct * ct);
      const px = rr * st * Math.cos(ph), py = rr * st * Math.sin(ph), pr = Math.hypot(px, py);
      if (pr > S * 0.47) continue;
      const f = clamp(rr / (A * 3), 0, 1);
      x.fillStyle = rgba(mixc([235, 240, 255], [124, 110, 255], f), 0.3 * smooth(S * 0.47, S * 0.3, pr));
      x.fillRect(px, py, 1.3, 1.3);
    }
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  g.globalCompositeOperation = "lighter";
  const r = rng(state.frame >> 1);
  for (let i = 0; i < 40; i++) { const rr = -0.5 * a0 * Math.log(r() * r() * r() + 1e-12), a = r() * TAU; glow(g, Math.cos(a) * rr * 0.8, Math.sin(a) * rr * 0.8, 2.5 * v.u, [220, 230, 255], 0.8); }
  glow(g, 0, 0, 5 * v.u, [255, 120, 180], 1);
  g.globalCompositeOperation = "source-over";
  ring(g, v, a0, "rgba(233,237,255,.35)", 1, [4, 5]);
  if (v.px > 160) {
    txt(g, v, a0 * 0.71, -a0 * 0.71, "Bohr radius a₀ = 52.9 pm", { dx: 6, dy: -4 });
    if (v.px > 300) txt(g, v, 0, 0, "nucleus: one proton, 63,000× narrower (under a pixel)", { dx: 10, dy: 18, color: "rgba(255,180,210,.8)" });
  }
};
DRAW.water = (g, o, v) => {
  const U = 1e-10 / o.D; // 1 ångström in units
  const b = 0.9584 * U, ang = 104.45 / 2 * Math.PI / 180, rO = 1.22 * U, rH = 0.92 * U, oy = -0.3 * U;
  const H1 = [-Math.sin(ang) * b, oy + Math.cos(ang) * b], H2 = [Math.sin(ang) * b, oy + Math.cos(ang) * b];
  g.globalCompositeOperation = "lighter"; glow(g, 0, 0.02, 0.62, [124, 200, 255], 0.2); g.globalCompositeOperation = "source-over";
  const wob = reduce ? 0 : Math.sin(v.t * 2.2) * 0.06;
  g.save(); g.rotate(wob);
  ball(g, 0, oy, rO, "#e8434a", "#ffb0a8", "#5a0a10");
  ball(g, H1[0], H1[1], rH, "#dfe6f2", "#ffffff", "#5d6a80");
  ball(g, H2[0], H2[1], rH, "#dfe6f2", "#ffffff", "#5d6a80");
  g.restore();
  if (v.px > 200) {
    txt(g, v, 0, oy, "O", { align: "center", font: '700 14px "Space Grotesk", sans-serif', color: "#fff" });
    txt(g, v, H1[0], H1[1], "H", { align: "center", font: '700 13px "Space Grotesk", sans-serif', color: "#223" , shadow: false});
    txt(g, v, H2[0], H2[1], "H", { align: "center", font: '700 13px "Space Grotesk", sans-serif', color: "#223", shadow: false });
    txt(g, v, 0, H1[1] + rH, "104.5°", { align: "center", dy: 14 });
  }
};
DRAW.c60 = (g, o, v) => {
  const ax = reduce ? 0.5 : v.t * 0.31, ay = reduce ? 0.3 : v.t * 0.23, R = 0.355;
  g.globalCompositeOperation = "lighter"; glow(g, 0, 0, 0.62, [177, 140, 255], 0.22); g.globalCompositeOperation = "source-over";
  const P = TI.V.map((p) => rotV(p, ax, ay));
  const bonds = TI.E.map(([i, j]) => [i, j, (P[i][2] + P[j][2]) / 2]).sort((a, b) => a[2] - b[2]);
  const atoms = P.map((p, i) => [i, p[2]]).sort((a, b) => a[1] - b[1]);
  g.lineCap = "round";
  let ai = 0;
  for (const [i, j, z] of bonds) {
    while (ai < atoms.length && atoms[ai][1] < z) { const p = P[atoms[ai][0]], f = 0.45 + 0.55 * (p[2] + 1) / 2; ball(g, p[0] * R, p[1] * R, 0.03, rgba([200 * f, 205 * f, 220 * f], 1), rgba([255, 255, 255], f), "#101018"); ai++; }
    const f = 0.35 + 0.65 * (z + 1) / 2, dbl = !TI.inPent.has(Math.min(i, j) * 100 + Math.max(i, j));
    g.strokeStyle = rgba([150 * f + 60, 150 * f + 60, 190 * f + 50], 0.9); g.lineWidth = (dbl ? 0.02 : 0.013);
    g.beginPath(); g.moveTo(P[i][0] * R, P[i][1] * R); g.lineTo(P[j][0] * R, P[j][1] * R); g.stroke();
  }
  while (ai < atoms.length) { const p = P[atoms[ai][0]], f = 0.45 + 0.55 * (p[2] + 1) / 2; ball(g, p[0] * R, p[1] * R, 0.03, rgba([200 * f, 205 * f, 220 * f], 1), rgba([255, 255, 255], f), "#101018"); ai++; }
  if (v.px > 240) txt(g, v, 0, 0.5, "60 carbon atoms · 12 pentagons · 20 hexagons", { align: "center", color: "rgba(233,237,255,.6)" });
};

/* ------------------------------ life ------------------------------ */
DRAW.dna = (g, o, v) => {
  const w = o.w / o.D, turn = 3.4e-9 / o.D, R = 1e-9 / o.D, ph = reduce ? 0 : v.t * 0.8;
  const pairs = [["#ff7a3d", "#ffc24b"], ["#4ef0b8", "#7cc8ff"]];
  const N = 180, off = TAU * 0.38;
  const pt = (x, k) => { const a = (x + w / 2) / turn * TAU + ph + k * off; return [x, R * Math.sin(a), Math.cos(a)]; };
  g.globalCompositeOperation = "lighter"; glow(g, 0, 0, 0.5, [78, 240, 184], 0.08); g.globalCompositeOperation = "source-over";
  // back halves first, then rungs, then front halves
  const strand = (k, front) => {
    for (let i = 0; i < N; i++) {
      const x1 = -w / 2 + i / N * w, x2 = -w / 2 + (i + 1) / N * w, p1 = pt(x1, k), p2 = pt(x2, k), z = (p1[2] + p2[2]) / 2;
      if ((z >= 0) !== front) continue;
      const f = 0.4 + 0.6 * (z + 1) / 2, fade = smooth(0, 0.06, x1 + w / 2) * smooth(0, 0.06, w / 2 - x2);
      g.strokeStyle = k ? rgba([124 * f + 40, 200 * f + 20, 255 * f], fade) : rgba([177 * f + 40, 140 * f + 40, 255 * f], fade);
      g.lineWidth = 0.028 + 0.012 * z; g.lineCap = "round";
      g.beginPath(); g.moveTo(p1[0], p1[1]); g.lineTo(p2[0], p2[1]); g.stroke();
    }
  };
  strand(0, false); strand(1, false);
  const step = turn / 10.5, r = rng(3);
  for (let x = -w / 2 + step / 2; x < w / 2; x += step) {
    const a = pt(x, 0), b = pt(x, 1), pr = pairs[(r() * 2) | 0], fl = r() < 0.5, fade = smooth(0, 0.06, x + w / 2) * smooth(0, 0.06, w / 2 - x);
    const zf = 0.45 + 0.55 * ((a[2] + b[2]) / 2 + 1) / 2;
    g.lineWidth = 0.016; g.globalAlpha = v.a * fade * zf;
    g.strokeStyle = fl ? pr[0] : pr[1]; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(a[0], (a[1] + b[1]) / 2); g.stroke();
    g.strokeStyle = fl ? pr[1] : pr[0]; g.beginPath(); g.moveTo(a[0], (a[1] + b[1]) / 2); g.lineTo(b[0], b[1]); g.stroke();
    g.globalAlpha = v.a;
  }
  strand(0, true); strand(1, true);
  if (v.px > 200) {
    const x0 = -w / 2 + turn * 1.0;
    tick(g, v, x0, -o.h / o.D / 2, x0 + turn, -o.h / o.D / 2, "rgba(233,237,255,.6)", 1);
    txt(g, v, x0 + turn / 2, -o.h / o.D / 2, "one turn = 3.4 nm", { align: "center", dy: -10 });
    txt(g, v, w / 2, 0, "2 nm", { dx: 8, color: "rgba(233,237,255,.7)" });
  }
};
DRAW.ribosome = (g, o, v) => {
  const s = sprite("ribosome", () => {
    const S = SPR, c = mk(S), x = c.getContext("2d"), r = rng(80);
    x.translate(S / 2, S / 2); x.scale(S, S); x.lineJoin = "round";
    const outline = "#3a1830";
    const surface = (cx, cy, R, seed, col, dark) => {
      blobPath(x, cx, cy, R, seed, 0.16); x.fillStyle = col; x.fill(); x.save(); x.clip();
      for (let i = 0; i < 520; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * R * 1.1, bx = cx + Math.cos(a) * rr, by = cy + Math.sin(a) * rr, br = (0.008 + r() * 0.014); x.fillStyle = r() < 0.5 ? dark : col; x.beginPath(); x.arc(bx, by, br, 0, TAU); x.fill(); x.strokeStyle = "rgba(58,24,48,.35)"; x.lineWidth = 0.002; x.stroke(); }
      const sh = x.createRadialGradient(cx - R * 0.4, cy - R * 0.4, R * 0.1, cx, cy, R * 1.2); sh.addColorStop(0, "rgba(255,255,255,.25)"); sh.addColorStop(1, "rgba(40,0,30,.35)");
      x.fillStyle = sh; x.fillRect(cx - R * 1.3, cy - R * 1.3, R * 2.6, R * 2.6); x.restore();
      blobPath(x, cx, cy, R, seed, 0.16); x.strokeStyle = outline; x.lineWidth = 0.006; x.stroke();
    };
    // messenger RNA threading between the subunits
    x.strokeStyle = "#ffe36e"; x.lineWidth = 0.022; x.lineCap = "round"; x.beginPath();
    for (let i = 0; i <= 60; i++) { const t = i / 60, px = -0.5 + t, py = 0.13 + Math.sin(t * 13) * 0.03; i ? x.lineTo(px, py) : x.moveTo(px, py); } x.stroke();
    surface(-0.05, 0.2, 0.2, 5, "#f7b58a", "#e99a70");
    surface(0.04, -0.07, 0.29, 1, "#f28db2", "#dc6f98");
    // transfer RNAs in the cleft
    for (const tx of [-0.06, 0.05]) { x.fillStyle = "#8fe39a"; x.beginPath(); x.ellipse(tx, 0.06, 0.035, 0.06, 0.3, 0, TAU); x.fill(); x.strokeStyle = outline; x.lineWidth = 0.004; x.stroke(); }
    // new protein chain emerging from the exit tunnel
    let px = 0.12, py = -0.33; x.fillStyle = "#9fe6ff";
    for (let i = 0; i < 26; i++) { x.beginPath(); x.arc(px, py, 0.014, 0, TAU); x.fill(); x.strokeStyle = outline; x.lineWidth = 0.003; x.stroke(); px += 0.022 * Math.cos(i * 0.7) + 0.008; py -= 0.012 + 0.006 * Math.sin(i); }
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 240) {
    txt(g, v, 0.3, -0.12, "large subunit", {}); txt(g, v, -0.3, 0.34, "small subunit", { align: "center" });
    txt(g, v, 0.45, 0.13, "mRNA", { color: "#ffe36e" }); txt(g, v, 0.24, -0.44, "new protein", { color: "#9fe6ff" });
  }
};
DRAW.virus = (g, o, v) => {
  const s = sprite("virus", () => {
    const S = SPR, c = mk(S), x = c.getContext("2d"), r = rng(19);
    x.translate(S / 2, S / 2); x.scale(S, S);
    const R = 0.5e-7 / o.D, L = 0.13;
    const dirs = [];
    const N = 74; for (let i = 0; i < N; i++) { const y = 1 - (i + 0.5) / N * 2, rr = Math.sqrt(1 - y * y), a = i * 2.39996 + r() * 0.2; dirs.push([Math.cos(a) * rr, y, Math.sin(a) * rr]); }
    const spike = (d) => {
      const bx = d[0] * R, by = d[1] * R, tx = d[0] * (R + L), ty = d[1] * (R + L), f = 0.55 + 0.45 * (d[2] + 1) / 2;
      x.strokeStyle = rgba([226 * f, 90 * f, 68 * f], 1); x.lineWidth = 0.014; x.lineCap = "round";
      x.beginPath(); x.moveTo(bx, by); x.lineTo(tx, ty); x.stroke();
      ball(x, tx, ty, 0.03 * (0.7 + 0.3 * Math.hypot(d[0], d[1])), rgba([255 * f, 122 * f, 90 * f], 1), rgba([255, 200, 170], f), "#3a0c06");
    };
    dirs.filter((d) => d[2] < 0).forEach(spike);
    const gr = x.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    gr.addColorStop(0, "#b9d8e2"); gr.addColorStop(0.5, "#6f9aae"); gr.addColorStop(1, "#1f3442");
    x.fillStyle = gr; x.beginPath(); x.arc(0, 0, R, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.arc(0, 0, R, 0, TAU); x.clip();
    for (let i = 0; i < 260; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * R, bx = Math.cos(a) * rr, by = Math.sin(a) * rr, sh = 1 - rr / R * 0.5; x.fillStyle = rgba([150 * sh, 200 * sh, 214 * sh], 0.55); x.beginPath(); x.arc(bx, by, 0.009 + r() * 0.008, 0, TAU); x.fill(); }
    x.restore();
    dirs.filter((d) => d[2] >= 0).sort((a, b) => a[2] - b[2]).forEach(spike);
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 240) txt(g, v, 0.36, -0.4, "spike proteins", { color: "#ff9a7a" });
};
DRAW.ecoli = (g, o, v) => {
  const U = 1e-6 / o.D, L = 2 * U, Wd = 0.8 * U, x0 = -0.5 + 0.03, x1 = x0 + L, t = reduce ? 0 : v.t;
  // flagella
  g.lineCap = "round";
  for (let k = 0; k < 5; k++) {
    const ay = (k - 2) * 0.18 * Wd, ph = k * 1.3;
    g.beginPath();
    for (let i = 0; i <= 90; i++) { const f = i / 90, xx = x1 - 0.02 * U + f * (0.5 - x1), yy = ay * (1 + f * 2.2) + Math.sin(f * 16 - t * 8 + ph) * 0.03 * Math.min(1, f * 4); i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); }
    g.strokeStyle = "rgba(160,240,210,.55)"; g.lineWidth = 1.4 * v.u + 0.004; g.stroke();
  }
  // pili
  const r = rng(12); g.strokeStyle = "rgba(160,240,210,.35)"; g.lineWidth = 0.8 * v.u + 0.0015;
  for (let i = 0; i < 60; i++) { const f = r(), top = r() < 0.5, xx = x0 + Wd / 2 + f * (L - Wd), yy = top ? -Wd / 2 : Wd / 2, ln = 0.02 + r() * 0.03; g.beginPath(); g.moveTo(xx, yy); g.lineTo(xx + (r() - 0.5) * 0.02, yy + (top ? -ln : ln)); g.stroke(); }
  // body (capsule)
  const body = () => { g.beginPath(); g.moveTo(x0 + Wd / 2, -Wd / 2); g.lineTo(x1 - Wd / 2, -Wd / 2); g.arc(x1 - Wd / 2, 0, Wd / 2, -Math.PI / 2, Math.PI / 2); g.lineTo(x0 + Wd / 2, Wd / 2); g.arc(x0 + Wd / 2, 0, Wd / 2, Math.PI / 2, Math.PI * 1.5); g.closePath(); };
  const gr = g.createLinearGradient(0, -Wd / 2, 0, Wd / 2); gr.addColorStop(0, "#9ff5cf"); gr.addColorStop(0.45, "#3fbf8f"); gr.addColorStop(1, "#135c46");
  body(); g.fillStyle = gr; g.fill();
  g.save(); body(); g.clip();
  for (let i = 0; i < 90; i++) { g.fillStyle = r() < 0.5 ? "rgba(220,255,240,.18)" : "rgba(10,60,40,.18)"; g.beginPath(); g.arc(x0 + r() * L, (r() - 0.5) * Wd, 0.004 + r() * 0.01, 0, TAU); g.fill(); }
  g.strokeStyle = "rgba(255,255,220,.45)"; g.lineWidth = 0.01; g.beginPath();
  for (let i = 0; i <= 40; i++) { const f = i / 40, xx = x0 + Wd * 0.6 + f * (L - Wd * 1.2), yy = Math.sin(f * 19) * Wd * 0.18 + Math.sin(f * 7) * Wd * 0.1; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); } g.stroke();
  g.restore();
  body(); g.strokeStyle = "#0d3a2c"; g.lineWidth = 1.5 * v.u + 0.004; g.stroke();
  if (v.px > 240) { txt(g, v, 0.3, 0.2, "flagella", { color: "rgba(160,240,210,.9)" }); txt(g, v, (x0 + x1) / 2, Wd / 2, "2 µm", { align: "center", dy: 16 }); }
};
DRAW.rbc = (g, o, v) => {
  const R = 3.9e-6 / o.D, h = o.h / o.D;
  // edge-on cell (Evans & Fung 1972 biconcave profile), behind and to the right
  const ex = 0.27;
  g.beginPath();
  const prof = (rho) => { const q = rho * rho; return 0.5 * R * Math.sqrt(Math.max(0, 1 - q)) * (0.207 + 2.003 * q - 1.123 * q * q); };
  g.moveTo(ex, -R);
  for (let i = 0; i <= 60; i++) { const rho = -1 + i / 30; g.lineTo(ex + prof(Math.min(1, Math.abs(rho))), rho * R); if (i === 60) break; }
  for (let i = 60; i >= 0; i--) { const rho = -1 + i / 30; g.lineTo(ex - prof(Math.min(1, Math.abs(rho))), rho * R); }
  g.closePath();
  const ge = g.createLinearGradient(ex - R * 0.3, 0, ex + R * 0.3, 0); ge.addColorStop(0, "#6a0a12"); ge.addColorStop(0.45, "#d8323a"); ge.addColorStop(1, "#5a0810");
  g.fillStyle = ge; g.fill();
  // face-on cell
  const fx = -0.17, gr = g.createRadialGradient(fx - R * 0.1, -R * 0.1, 0, fx, 0, R);
  gr.addColorStop(0, "#b0212b"); gr.addColorStop(0.3, "#b82530"); gr.addColorStop(0.62, "#e8505a"); gr.addColorStop(0.86, "#c9303a"); gr.addColorStop(1, "#6a0a12");
  g.fillStyle = gr; g.beginPath(); g.arc(fx, 0, R, 0, TAU); g.fill();
  const hl = g.createRadialGradient(fx - R * 0.45, -R * 0.45, 0, fx - R * 0.45, -R * 0.45, R * 0.6); hl.addColorStop(0, "rgba(255,210,210,.35)"); hl.addColorStop(1, "rgba(255,210,210,0)");
  g.fillStyle = hl; g.beginPath(); g.arc(fx, 0, R, 0, TAU); g.fill();
  if (v.px > 220) { txt(g, v, fx, R, "7.8 µm across", { align: "center", dy: 14 }); txt(g, v, ex, R, "side view: 2.5 µm thick", { align: "center", dy: 14 }); }
};
DRAW.egg = (g, o, v) => {
  const s = sprite("egg", () => {
    const S = PSPR, c = mk(S), x = c.getContext("2d"), img = x.createImageData(S, S), d = img.data, r = rng(9);
    const Rc = 0.5 * 1.2e-4 / o.D, Rz = Rc + 0.05;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S - 0.5, w = (j + 0.5) / S - 0.5, rr = Math.hypot(u, w), k = (j * S + i) * 4;
      if (rr < Rc) {
        const n = fbm(u * 40, w * 40, 2, 3), mu = Math.sqrt(1 - (rr / Rc) ** 2);
        const sh = 0.55 + 0.45 * mu;
        d[k] = (236 + (n - 0.5) * 60) * sh; d[k + 1] = (190 + (n - 0.5) * 60) * sh; d[k + 2] = (170 + (n - 0.5) * 50) * sh; d[k + 3] = 255 * Math.min(1, (Rc - rr) * S);
      } else if (rr < Rz) {
        const f = (rr - Rc) / (Rz - Rc), n = noise3(u * 60, w * 60, 1);
        d[k] = 230; d[k + 1] = 236; d[k + 2] = 255; d[k + 3] = 255 * (0.18 + 0.3 * Math.sin(f * Math.PI) + 0.1 * n);
      }
    }
    x.putImageData(img, 0, 0);
    x.translate(S / 2, S / 2); x.scale(S, S);
    x.fillStyle = "rgba(255,240,200,.55)"; x.beginPath(); x.arc(0.07, -0.05, 0.065, 0, TAU); x.fill();
    x.strokeStyle = "rgba(120,60,40,.5)"; x.lineWidth = 0.004; x.stroke();
    x.fillStyle = "rgba(200,110,90,.8)"; x.beginPath(); x.arc(0.085, -0.06, 0.016, 0, TAU); x.fill();
    for (let i = 0; i < 230; i++) { // corona radiata cells
      const a = r() * TAU, rr = Rz + 0.012 + r() * (0.5 - Rz - 0.03), ex = Math.cos(a) * rr, ey = Math.sin(a) * rr, sz = 0.012 + r() * 0.012;
      x.fillStyle = "rgba(250,210,180," + (0.25 + r() * 0.3).toFixed(2) + ")"; x.beginPath(); x.ellipse(ex, ey, sz * 1.3, sz, a, 0, TAU); x.fill();
      x.fillStyle = "rgba(190,110,110,.5)"; x.beginPath(); x.arc(ex, ey, sz * 0.35, 0, TAU); x.fill();
    }
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 260) { txt(g, v, 0.07, -0.05, "nucleus", { dx: 36, dy: -30 }); txt(g, v, 0, -0.5, "zona pellucida and corona radiata", { align: "center", dy: 8 }); }
};
DRAW.hair = (g, o, v) => {
  const h = o.h / o.D;
  const s = sprite("hair", () => {
    const S = SPR, Hh = Math.round(S * h), c = mk(S, Hh), x = c.getContext("2d");
    const gr = x.createLinearGradient(0, 0, 0, Hh);
    gr.addColorStop(0, "#1a0e06"); gr.addColorStop(0.22, "#8a5a32"); gr.addColorStop(0.32, "#c49064"); gr.addColorStop(0.5, "#5a3518"); gr.addColorStop(1, "#140a04");
    x.fillStyle = gr; x.fillRect(0, 0, S, Hh);
    const step = S * 6.5e-6 / o.D, r = rng(5);
    x.lineWidth = Math.max(1, S / 700);
    for (let px = -step; px < S + step; px += step * (0.8 + r() * 0.4)) {
      x.strokeStyle = "rgba(255,220,180," + (0.18 + r() * 0.2).toFixed(2) + ")"; x.beginPath();
      for (let k = 0; k <= 20; k++) { const yy = k / 20 * Hh, xx = px + Math.sin(k / 20 * Math.PI) * step * 0.9 + (r() - 0.5) * step * 0.15; k ? x.lineTo(xx, yy) : x.moveTo(xx, yy); }
      x.stroke();
    }
    x.globalCompositeOperation = "destination-in";
    const m = x.createLinearGradient(0, 0, S, 0); m.addColorStop(0, "rgba(0,0,0,0)"); m.addColorStop(0.12, "#000"); m.addColorStop(0.88, "#000"); m.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = m; x.fillRect(0, 0, S, Hh);
    return c;
  });
  if (s) g.drawImage(s, -0.5, -h / 2, 1, h);
  if (v.px > 200) txt(g, v, 0, h / 2, "cuticle scales", { align: "center", dy: 14 });
};
DRAW.sand = (g, o, v) => {
  const s = sprite("sand", () => {
    const S = SPR, c = mk(S), x = c.getContext("2d"), r = rng(22);
    x.translate(S / 2, S / 2); x.scale(S, S);
    const pts = []; for (let i = 0; i < 13; i++) { const a = i / 13 * TAU + (r() - 0.5) * 0.3, rr = 0.38 + r() * 0.1; pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.86]); }
    x.beginPath(); pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; i ? x.quadraticCurveTo(p[0], p[1], mx, my) : x.moveTo(mx, my); }); x.quadraticCurveTo(pts[0][0], pts[0][1], (pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2); x.closePath();
    const gr = x.createRadialGradient(-0.12, -0.14, 0.02, 0, 0, 0.5); gr.addColorStop(0, "#fff4dc"); gr.addColorStop(0.45, "#e2c897"); gr.addColorStop(1, "#7a5e36");
    x.fillStyle = gr; x.fill(); x.save(); x.clip();
    for (let i = 0; i < 9; i++) { x.strokeStyle = "rgba(255,255,255,.18)"; x.lineWidth = 0.004; x.beginPath(); x.moveTo((r() - 0.5) * 0.8, (r() - 0.5) * 0.8); x.lineTo((r() - 0.5) * 0.8, (r() - 0.5) * 0.8); x.stroke(); }
    for (let i = 0; i < 160; i++) { x.fillStyle = r() < 0.5 ? "rgba(90,60,30,.25)" : "rgba(255,250,235,.3)"; x.beginPath(); x.arc((r() - 0.5) * 0.9, (r() - 0.5) * 0.9, 0.003 + r() * 0.008, 0, TAU); x.fill(); }
    const sp = x.createRadialGradient(-0.16, -0.2, 0, -0.16, -0.2, 0.14); sp.addColorStop(0, "rgba(255,255,255,.55)"); sp.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = sp; x.fillRect(-0.5, -0.5, 1, 1);
    x.restore(); x.strokeStyle = "rgba(60,40,20,.6)"; x.lineWidth = 0.004; x.stroke();
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
};
DRAW.ant = (g, o, v) => {
  const h = o.h / o.D, gy = h / 2 - 0.02;
  const body = g.createLinearGradient(0, -0.17, 0, 0.06); body.addColorStop(0, "#7a5238"); body.addColorStop(0.45, "#2e1c13"); body.addColorStop(1, "#0f0806");
  const legC = "#24160f", rim = "rgba(255,205,160,.6)";
  g.lineCap = "round"; g.lineJoin = "round";
  const leg = (pts, w = 0.012) => { g.beginPath(); pts.forEach((p, k) => (k ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = legC; g.lineWidth = w; g.stroke(); };
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(0.02, gy + 0.005, 0.42, 0.012, 0, 0, TAU); g.fill();
  g.globalAlpha = v.a * 0.55;
  leg([[0.17, -0.03], [0.27, 0.03], [0.37, gy]]); leg([[0.1, -0.02], [0.13, 0.06], [0.06, gy]]); leg([[0.04, -0.02], [-0.03, 0.06], [-0.16, gy]]);
  g.globalAlpha = v.a;
  const parts = () => {
    g.beginPath(); g.ellipse(-0.25, -0.06, 0.15, 0.1, -0.12, 0, TAU);
    g.moveTo(-0.06, -0.06); g.ellipse(-0.085, -0.06, 0.025, 0.042, 0.1, 0, TAU);
    g.moveTo(-0.06, -0.06); g.bezierCurveTo(-0.02, -0.15, 0.12, -0.16, 0.2, -0.1); g.bezierCurveTo(0.23, -0.06, 0.2, -0.02, 0.12, -0.02); g.bezierCurveTo(0.05, -0.015, -0.03, -0.03, -0.06, -0.06);
    g.moveTo(0.38, -0.09); g.ellipse(0.3, -0.09, 0.085, 0.068, -0.3, 0, TAU);
  };
  parts(); g.fillStyle = body; g.fill();
  g.save(); g.shadowColor = "rgba(255,190,140,.6)"; g.shadowBlur = Math.min(10, v.px * 0.01); parts(); g.strokeStyle = rim; g.lineWidth = 1.2 * v.u; g.stroke(); g.restore();
  g.beginPath(); g.moveTo(0.37, -0.05); g.quadraticCurveTo(0.43, -0.03, 0.41, 0.0); g.strokeStyle = legC; g.lineWidth = 0.014; g.stroke();
  g.beginPath(); g.moveTo(0.33, -0.15); g.lineTo(0.39, -0.25); g.quadraticCurveTo(0.47, -0.22, 0.5, -0.12); g.lineWidth = 0.009; g.stroke();
  leg([[0.16, -0.04], [0.23, 0.05], [0.31, gy]]); leg([[0.09, -0.03], [0.09, 0.07], [0.0, gy]]); leg([[0.03, -0.03], [-0.07, 0.07], [-0.23, gy]]);
  g.fillStyle = "#0a0604"; g.beginPath(); g.ellipse(0.325, -0.1, 0.022, 0.017, -0.3, 0, TAU); g.fill();
  g.fillStyle = "rgba(255,255,255,.55)"; g.beginPath(); g.arc(0.318, -0.106, 0.006, 0, TAU); g.fill();
};
DRAW.bee = (g, o, v) => {
  const h = o.h / o.D, gy = h / 2 - 0.02, flap = reduce ? 0 : Math.sin(v.t * 40) * 0.12;
  g.lineCap = "round";
  const legC = "#2a1c0c";
  const leg = (pts) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.strokeStyle = legC; g.lineWidth = 0.01; g.stroke(); };
  leg([[0.22, 0.1], [0.27, 0.2], [0.3, gy]]); leg([[0.15, 0.12], [0.13, 0.22], [0.1, gy]]); leg([[0.08, 0.12], [0.0, 0.24], [-0.06, gy]]);
  g.fillStyle = "#ff9b2a"; g.beginPath(); g.ellipse(0.02, 0.2, 0.03, 0.022, 0.5, 0, TAU); g.fill(); // pollen basket
  // abdomen with stripes
  g.save(); g.translate(-0.15, 0.08); g.rotate(0.22);
  g.beginPath(); g.ellipse(0, 0, 0.24, 0.14, 0, 0, TAU); g.save(); g.clip();
  g.fillStyle = "#e5a93a"; g.fillRect(-0.3, -0.2, 0.6, 0.4);
  g.fillStyle = "#2a1a08"; for (let k = 0; k < 4; k++) g.fillRect(-0.2 + k * 0.1, -0.2, 0.045, 0.4);
  const sh = g.createLinearGradient(0, -0.14, 0, 0.14); sh.addColorStop(0, "rgba(255,255,255,.25)"); sh.addColorStop(1, "rgba(0,0,0,.45)"); g.fillStyle = sh; g.fillRect(-0.3, -0.2, 0.6, 0.4);
  g.restore(); g.restore();
  // thorax (fuzzy)
  const tg = g.createRadialGradient(0.15, -0.0, 0.01, 0.17, 0.03, 0.13); tg.addColorStop(0, "#e8c070"); tg.addColorStop(1, "#6a4a18");
  g.fillStyle = tg; g.beginPath(); g.ellipse(0.17, 0.03, 0.12, 0.11, 0, 0, TAU); g.fill();
  const r = rng(3); g.strokeStyle = "rgba(240,210,140,.55)"; g.lineWidth = 0.004;
  for (let i = 0; i < 80; i++) { const a = r() * TAU, x0 = 0.17 + Math.cos(a) * 0.11, y0 = 0.03 + Math.sin(a) * 0.1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + Math.cos(a) * 0.02, y0 + Math.sin(a) * 0.02); g.stroke(); }
  // head
  g.fillStyle = "#2b1d0c"; g.beginPath(); g.ellipse(0.33, 0.06, 0.07, 0.085, 0.2, 0, TAU); g.fill();
  g.fillStyle = "#0e0906"; g.beginPath(); g.ellipse(0.33, 0.04, 0.035, 0.06, 0.2, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(0.36, -0.01); g.quadraticCurveTo(0.44, -0.08, 0.48, -0.03); g.strokeStyle = "#2b1d0c"; g.lineWidth = 0.008; g.stroke();
  // wings
  const wing = (cx, cy, rx, ry, rot) => {
    g.save(); g.translate(0.13, -0.05); g.rotate(rot + flap); g.translate(-0.13, 0.05);
    g.beginPath(); g.ellipse(cx, cy, rx, ry, rot, 0, TAU);
    g.fillStyle = "rgba(210,230,255,.28)"; g.fill(); g.strokeStyle = "rgba(230,240,255,.6)"; g.lineWidth = 1 * v.u + 0.002; g.stroke();
    g.beginPath(); g.moveTo(cx + rx * 0.9, cy); g.lineTo(cx - rx * 0.7, cy - ry * 0.3); g.moveTo(cx + rx * 0.5, cy + ry * 0.4); g.lineTo(cx - rx * 0.3, cy - ry * 0.6); g.stroke();
    g.restore();
  };
  wing(-0.12, -0.2, 0.26, 0.085, -0.28); wing(-0.06, -0.12, 0.17, 0.06, -0.12);
};
DRAW.ball = (g, o, v) => {
  const R = 0.5, ax = 0.5, ay = reduce ? 0.4 : v.t * 0.35;
  ball(g, 0, 0, R, "#e9ecf2", "#ffffff", "#6c7280");
  g.save(); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.clip();
  const P = TI.V.map((p) => rotV(p, ax, ay));
  g.lineJoin = "round";
  for (const pe of TI.P) {
    const cc = rotV(pe.c, ax, ay); if (cc[2] < -0.3) continue;
    g.beginPath();
    pe.idx.forEach((i, k) => { const p = P[i], n = Math.hypot(...p); k ? g.lineTo(p[0] / n * R, p[1] / n * R) : g.moveTo(p[0] / n * R, p[1] / n * R); });
    g.closePath();
    const f = 0.25 + 0.75 * clamp(cc[2], 0, 1);
    g.fillStyle = rgba([20 + 40 * f, 22 + 40 * f, 30 + 45 * f], 1); g.fill();
  }
  g.strokeStyle = "rgba(60,64,76,.55)"; g.lineWidth = 1 * v.u + 0.002;
  for (const [i, j] of TI.E) { const a = P[i], b = P[j]; if (a[2] < 0 || b[2] < 0) continue; const na = Math.hypot(...a), nb = Math.hypot(...b); g.beginPath(); g.moveTo(a[0] / na * R, a[1] / na * R); g.lineTo(b[0] / nb * R, b[1] / nb * R); g.stroke(); }
  const sh = g.createRadialGradient(-0.18, -0.2, 0.02, 0, 0, R); sh.addColorStop(0, "rgba(255,255,255,.35)"); sh.addColorStop(0.5, "rgba(255,255,255,0)"); sh.addColorStop(1, "rgba(0,0,20,.55)");
  g.fillStyle = sh; g.fillRect(-R, -R, 2 * R, 2 * R);
  g.restore();
};

/* ------------------------------ people & things we built ------------------------------ */
const HUMAN = (function () { // right half outline, metres, origin at the feet, y up
  return [[0, 1.448], [0.052, 1.44], [0.058, 1.405], [0.13, 1.385], [0.19, 1.36], [0.215, 1.31], [0.228, 1.2], [0.236, 1.06], [0.24, 0.96], [0.25, 0.84], [0.258, 0.77], [0.262, 0.71], [0.248, 0.655], [0.228, 0.66], [0.214, 0.72], [0.205, 0.83], [0.195, 0.95], [0.182, 1.08], [0.17, 1.19], [0.158, 1.14], [0.142, 1.02], [0.158, 0.92], [0.168, 0.84], [0.162, 0.7], [0.146, 0.56], [0.118, 0.47], [0.108, 0.38], [0.104, 0.27], [0.086, 0.12], [0.08, 0.075], [0.118, 0.03], [0.118, 0.0], [0.03, 0.0], [0.032, 0.08], [0.038, 0.2], [0.04, 0.33], [0.036, 0.47], [0.022, 0.64], [0.0, 0.78]];
})();
DRAW.human = (g, o, v) => {
  const S = 1 / o.D, ox = 0, oy = o.h / o.D / 2; // feet at bottom of box
  const P = (x, y) => [ox + x * S, oy - y * S];
  g.fillStyle = "rgba(0,0,0,.35)"; g.beginPath(); g.ellipse(0, oy, 0.2, 0.012, 0, 0, TAU); g.fill();
  const path = () => {
    g.beginPath();
    HUMAN.forEach((p, i) => { const q = P(p[0], p[1]); i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]); });
    for (let i = HUMAN.length - 1; i >= 0; i--) { const q = P(-HUMAN[i][0], HUMAN[i][1]); g.lineTo(q[0], q[1]); }
    g.closePath();
    const hc = P(0, 1.575); g.moveTo(hc[0] + 0.078 * S, hc[1]); g.ellipse(hc[0], hc[1], 0.078 * S, 0.112 * S, 0, 0, TAU);
  };
  const gr = g.createLinearGradient(-0.2, -0.5, 0.2, 0.5); gr.addColorStop(0, "rgba(160,215,255,.34)"); gr.addColorStop(1, "rgba(60,90,170,.18)");
  path(); g.fillStyle = gr; g.fill();
  g.shadowColor = "rgba(124,200,255,.9)"; g.shadowBlur = Math.min(24, v.px * 0.02);
  path(); g.strokeStyle = "#a9dcff"; g.lineWidth = 1.6 * v.u; g.stroke(); g.shadowBlur = 0;
  if (v.px > 160) {
    const x = 0.4, t0 = P(0, 1.7)[1], b0 = P(0, 0)[1];
    tick(g, v, x, t0, x, b0, "rgba(255,194,75,.8)", 1); tick(g, v, x - 0.03, t0, x + 0.03, t0, "rgba(255,194,75,.8)", 1); tick(g, v, x - 0.03, b0, x + 0.03, b0, "rgba(255,194,75,.8)", 1);
    txt(g, v, x, 0, "1.7 m", { dx: 8, color: "#ffc24b" });
  }
};
DRAW.whale = (g, o, v) => {
  const path = () => {
    g.beginPath(); g.moveTo(0.5, 0.0);
    g.bezierCurveTo(0.47, -0.075, 0.33, -0.1, 0.1, -0.088);
    g.bezierCurveTo(-0.05, -0.082, -0.18, -0.075, -0.27, -0.066);
    g.lineTo(-0.3, -0.092); g.lineTo(-0.315, -0.06);
    g.bezierCurveTo(-0.37, -0.045, -0.41, -0.025, -0.43, -0.018);
    g.bezierCurveTo(-0.46, -0.04, -0.49, -0.08, -0.5, -0.09);
    g.bezierCurveTo(-0.5, -0.04, -0.48, -0.012, -0.465, 0.0);
    g.bezierCurveTo(-0.48, 0.012, -0.5, 0.05, -0.5, 0.1);
    g.bezierCurveTo(-0.49, 0.08, -0.46, 0.04, -0.43, 0.018);
    g.bezierCurveTo(-0.3, 0.035, -0.1, 0.075, 0.15, 0.078);
    g.bezierCurveTo(0.32, 0.075, 0.44, 0.05, 0.5, 0.0);
    g.closePath();
  };
  const gr = g.createLinearGradient(0, -0.1, 0, 0.08); gr.addColorStop(0, "#3d5a78"); gr.addColorStop(0.55, "#6f8ba8"); gr.addColorStop(1, "#b9c9da");
  path(); g.fillStyle = gr; g.fill();
  g.save(); path(); g.clip();
  const r = rng(6); for (let i = 0; i < 140; i++) { g.fillStyle = "rgba(220,235,250,.14)"; g.beginPath(); g.ellipse(-0.45 + r() * 0.9, -0.08 + r() * 0.1, 0.004 + r() * 0.01, 0.003 + r() * 0.005, 0, 0, TAU); g.fill(); }
  g.strokeStyle = "rgba(40,60,80,.35)"; g.lineWidth = 0.9 * v.u + 0.0006;
  for (let k = 0; k < 9; k++) { g.beginPath(); g.moveTo(0.46 - k * 0.005, 0.02 + k * 0.006); g.quadraticCurveTo(0.3, 0.055 + k * 0.004, 0.14, 0.066 + k * 0.0015); g.stroke(); }
  g.restore();
  g.fillStyle = "#4e6b88"; g.beginPath(); g.moveTo(0.26, 0.05); g.quadraticCurveTo(0.2, 0.12, 0.12, 0.125); g.quadraticCurveTo(0.2, 0.09, 0.22, 0.052); g.fill();
  g.fillStyle = "#0b1320"; g.beginPath(); g.arc(0.37, 0.012, 0.004, 0, TAU); g.fill();
  path(); g.strokeStyle = "rgba(200,225,255,.35)"; g.lineWidth = 1 * v.u; g.stroke();
};
DRAW.shuttle = (g, o, v) => {
  const L = 37.24, X = (m) => (18.62 - m) / L, Y = (m) => m / L;
  const half = [[0, 0], [0.6, 1.05], [1.6, 1.75], [3.2, 2.3], [5.5, 2.62], [10.5, 2.64], [22.2, 4.5], [29.6, 11.9], [31.9, 11.9], [33.9, 3.5], [34.1, 3.1], [37.24, 2.3], [37.24, 0]];
  const out = () => { g.beginPath(); half.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); for (let i = half.length - 1; i >= 0; i--) g.lineTo(X(half[i][0]), -Y(half[i][1])); g.closePath(); };
  g.save(); g.translate(0.02, 0.03); out(); g.fillStyle = "rgba(0,0,0,.35)"; g.fill(); g.restore();
  const gr = g.createLinearGradient(0, -0.35, 0, 0.35); gr.addColorStop(0, "#f7f9fc"); gr.addColorStop(0.5, "#dfe4ec"); gr.addColorStop(1, "#b9c0cc");
  out(); g.fillStyle = gr; g.fill();
  g.strokeStyle = "#2a2e38"; g.lineWidth = 0.009; g.lineCap = "round";
  for (const s of [1, -1]) { g.beginPath(); g.moveTo(X(10.5), s * Y(2.64)); g.lineTo(X(22.2), s * Y(4.5)); g.lineTo(X(29.6), s * Y(11.9)); g.stroke(); }
  g.fillStyle = "#1c2028"; g.beginPath(); g.moveTo(X(0), 0); g.lineTo(X(0.6), Y(1.05)); g.lineTo(X(1.3), Y(1.5)); g.lineTo(X(1.3), -Y(1.5)); g.lineTo(X(0.6), -Y(1.05)); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(X(3.4), -Y(1.7)); g.lineTo(X(3.4), Y(1.7)); g.lineTo(X(5.0), Y(2.0)); g.lineTo(X(5.0), -Y(2.0)); g.closePath(); g.fill();
  g.strokeStyle = "rgba(60,70,90,.55)"; g.lineWidth = 1 * v.u + 0.0015;
  for (const s of [1, -1]) { g.beginPath(); g.moveTo(X(6.8), s * Y(2.2)); g.lineTo(X(25.3), s * Y(2.2)); g.stroke(); }
  g.beginPath(); g.moveTo(X(6.8), 0); g.lineTo(X(25.3), 0); for (let k = 1; k < 5; k++) { g.moveTo(X(6.8 + k * 3.7), -Y(2.2)); g.lineTo(X(6.8 + k * 3.7), Y(2.2)); } g.stroke();
  for (const s of [1, -1]) { g.beginPath(); g.moveTo(X(30.2), s * Y(11.6)); g.lineTo(X(32.8), s * Y(6.5)); g.lineTo(X(33.6), s * Y(3.6)); g.stroke(); }
  g.fillStyle = "#c7ccd6"; for (const s of [1, -1]) { g.beginPath(); g.ellipse(X(32.5), s * Y(2.2), 4.3 / L, 1.15 / L, 0, 0, TAU); g.fill(); g.stroke(); }
  g.fillStyle = "#9aa2b0"; g.fillRect(X(37.24), -Y(0.4), 10.5 / L, Y(0.8));
  if (v.px > 200) txt(g, v, 0, 0.5, "seen from above · 37.2 m long, 23.8 m wingspan", { align: "center", dy: 4 });
};
DRAW.liberty = (g, o, v) => {
  const H = 93 / o.D, X = (m) => m / o.D, Y = (m) => H / 2 - m / o.D;
  const poly = (pts, fill) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(X(p[0]), Y(p[1])) : g.moveTo(X(p[0]), Y(p[1])))); g.closePath(); g.fillStyle = fill; g.fill(); };
  const stone = g.createLinearGradient(X(-22), 0, X(22), 0); stone.addColorStop(0, "#6f6a60"); stone.addColorStop(0.4, "#b3ac9e"); stone.addColorStop(1, "#5a564e");
  poly([[-22, 0], [22, 0], [21, 6], [16, 6], [15.5, 20], [-15.5, 20], [-16, 6], [-21, 6]], stone);
  poly([[-9.5, 20], [9.5, 20], [8.6, 30], [9.4, 31], [8.2, 32], [8.2, 43], [9.2, 44.2], [8.4, 47], [-8.4, 47], [-9.2, 44.2], [-8.2, 43], [-8.2, 32], [-9.4, 31], [-8.6, 30]], stone);
  g.fillStyle = "rgba(0,0,0,.18)"; for (let k = 0; k < 3; k++) g.fillRect(X(-6 + k * 4.6), Y(40), X(1.4), X(5));
  const cu = g.createLinearGradient(X(-6), 0, X(7), 0); cu.addColorStop(0, "#3f8a74"); cu.addColorStop(0.45, "#8ccdb4"); cu.addColorStop(1, "#2f6e5c");
  poly([[-4.8, 47], [4.6, 47], [4.4, 52], [3.9, 60], [3.8, 68], [4.1, 73.2], [2.6, 74.8], [1.2, 75.6], [1.1, 77.2], [-0.8, 77.2], [-1.0, 75.6], [-2.8, 74.6], [-4.2, 72.8], [-4.4, 68], [-4.2, 60], [-4.9, 52]], cu);
  g.strokeStyle = "#8ccdb4"; g.lineCap = "round"; g.lineWidth = X(2.1);
  g.beginPath(); g.moveTo(X(2.9), Y(73.6)); g.lineTo(X(4.6), Y(80.5)); g.lineTo(X(5.3), Y(87.0)); g.stroke();
  poly([[4.3, 86.6], [6.4, 86.6], [6.7, 88.6], [4.0, 88.6]], "#a7d8c3");
  const fl = g.createLinearGradient(0, Y(88.6), 0, Y(93)); fl.addColorStop(0, "#ffb347"); fl.addColorStop(1, "#fff2b0");
  g.beginPath(); g.moveTo(X(4.1), Y(88.6)); g.quadraticCurveTo(X(4.4), Y(91.5), X(5.35), Y(93)); g.quadraticCurveTo(X(6.3), Y(91.5), X(6.6), Y(88.6)); g.closePath(); g.fillStyle = fl; g.fill();
  g.fillStyle = "#7cc3aa"; g.beginPath(); g.ellipse(X(0.15), Y(79.0), X(1.6), X(2.0), 0, 0, TAU); g.fill();
  g.strokeStyle = "#8ccdb4"; g.lineWidth = X(0.55);
  for (let k = 0; k < 7; k++) { const a = Math.PI * (0.12 + k * 0.127); g.beginPath(); g.moveTo(X(0.15 + Math.cos(a) * 1.7), Y(79.9 + Math.sin(a) * 1.4)); g.lineTo(X(0.15 + Math.cos(a) * 4.0), Y(79.9 + Math.sin(a) * 3.3)); g.stroke(); }
  g.save(); g.translate(X(-4.1), Y(67)); g.rotate(-0.28); g.fillStyle = "#6fb89f"; g.fillRect(X(-1.4), X(-4.2), X(2.6), X(7.2)); g.restore();
  g.strokeStyle = "rgba(20,60,50,.45)"; g.lineWidth = 1 * v.u + X(0.12);
  for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(X(-3.4 + k * 1.6), Y(48)); g.quadraticCurveTo(X(-3 + k * 1.5), Y(58), X(-2.4 + k * 1.2), Y(70)); g.stroke(); }
  if (v.px > 200) { txt(g, v, X(12), Y(70), "statue 46 m", { color: "#8ccdb4" }); txt(g, v, X(12), Y(33), "pedestal 27 m"); txt(g, v, X(23), Y(4), "fort 20 m"); }
};
DRAW.saturnv = (g, o, v) => {
  const X = (m) => m / o.D, Y = (m) => 0.5 - m / o.D;
  const sec = (y0, y1, r0, r1, fill) => { g.beginPath(); g.moveTo(X(-r0), Y(y0)); g.lineTo(X(r0), Y(y0)); g.lineTo(X(r1), Y(y1)); g.lineTo(X(-r1), Y(y1)); g.closePath(); g.fillStyle = fill; g.fill(); };
  const white = g.createLinearGradient(X(-5.1), 0, X(5.1), 0); white.addColorStop(0, "#9aa1ad"); white.addColorStop(0.35, "#ffffff"); white.addColorStop(0.7, "#e2e6ec"); white.addColorStop(1, "#7d8490");
  const black = "#16181d", silver = g.createLinearGradient(X(-3.3), 0, X(3.3), 0);
  silver.addColorStop(0, "#6c717b"); silver.addColorStop(0.4, "#dde1e8"); silver.addColorStop(1, "#5e636d");
  for (const ex of [-3.3, 0, 3.3]) { g.fillStyle = "#3a3d44"; g.beginPath(); g.moveTo(X(ex - 0.9), Y(5.8)); g.lineTo(X(ex + 0.9), Y(5.8)); g.lineTo(X(ex + 1.88), Y(0)); g.lineTo(X(ex - 1.88), Y(0)); g.closePath(); g.fill(); }
  for (const s of [-1, 1]) { g.fillStyle = "#1d2027"; g.beginPath(); g.moveTo(X(s * 5.03), Y(13)); g.lineTo(X(s * 9.75), Y(6.8)); g.lineTo(X(s * 9.75), Y(4.6)); g.lineTo(X(s * 5.03), Y(4.6)); g.closePath(); g.fill(); }
  sec(4.6, 42, 5.03, 5.03, white);
  sec(4.6, 10.5, 5.03, 5.03, black);
  g.fillStyle = black; g.fillRect(X(-5.03), Y(27.2), X(5.03), X(3)); g.fillRect(X(0), Y(42), X(5.03), X(4));
  sec(42, 47.4, 5.03, 5.03, white); g.fillStyle = black; g.fillRect(X(-5.03), Y(44.2), X(10.06), X(0.6));
  sec(47.4, 66.9, 5.03, 5.03, white); g.fillStyle = "rgba(0,0,0,.18)"; g.fillRect(X(-5.03), Y(57.5), X(10.06), X(0.4));
  sec(66.9, 71.5, 5.03, 3.3, white);
  sec(71.5, 88.6, 3.3, 3.3, white); g.fillStyle = black; g.fillRect(X(-3.3), Y(75.5), X(3.3), X(4)); g.fillRect(X(0), Y(79.5), X(3.3), X(4));
  sec(88.6, 89.5, 3.3, 3.3, "#44484f");
  sec(89.5, 98.0, 3.3, 1.95, silver);
  sec(98.0, 101.7, 1.95, 1.95, silver);
  sec(101.7, 104.9, 1.95, 0.35, white);
  g.strokeStyle = "#c33a22"; g.lineWidth = X(0.18);
  g.beginPath(); for (let k = 0; k < 5; k++) { const y0 = 104.9 + k * 0.66, y1 = y0 + 0.66; g.moveTo(X(-0.55), Y(y0)); g.lineTo(X(0.55), Y(y1)); g.moveTo(X(0.55), Y(y0)); g.lineTo(X(-0.55), Y(y1)); } g.stroke();
  sec(108.2, 110.1, 0.33, 0.33, "#d8492a"); sec(110.1, 110.6, 0.33, 0.05, "#d8492a");
  g.strokeStyle = "rgba(0,0,0,.25)"; g.lineWidth = 1 * v.u;
  for (const y of [42, 47.4, 66.9, 71.5, 88.6, 89.5, 98, 101.7]) { g.beginPath(); g.moveTo(X(-6), Y(y)); g.lineTo(X(6), Y(y)); g.stroke(); }
  if (v.px > 220) {
    const lab = [[23, "S-IC first stage"], [57, "S-II second stage"], [80, "S-IVB third stage"], [93.5, "Apollo spacecraft"], [108, "launch escape tower"]];
    lab.forEach(([y, s]) => txt(g, v, X(7), Y(y), s, { color: "rgba(233,237,255,.7)" }));
  }
};
DRAW.burj = (g, o, v) => {
  const X = (m) => m / o.D, Y = (m) => 0.5 - m / o.D;
  const tiers = [[20, 34, 34], [140, 30, 34], [230, 30, 30], [310, 26, 30], [380, 26, 26], [440, 22, 26], [500, 22, 22], [555, 18, 22], [600, 18, 18], [640, 14, 18], [675, 11, 14]];
  const gl = g.createLinearGradient(X(-40), 0, X(40), 0); gl.addColorStop(0, "#44536c"); gl.addColorStop(0.45, "#c9d6e8"); gl.addColorStop(0.6, "#8fa3bf"); gl.addColorStop(1, "#2e3a4e");
  g.fillStyle = "#3a4152"; g.fillRect(X(-80), Y(18), X(160), X(18));
  g.beginPath(); g.moveTo(X(-34), Y(0));
  tiers.forEach((t, i) => { const top = i + 1 < tiers.length ? tiers[i + 1][0] : 700; g.lineTo(X(-t[1]), Y(t[0])); g.lineTo(X(-t[1]), Y(top)); });
  g.lineTo(X(-6), Y(700)); g.lineTo(X(-0.6), Y(828)); g.lineTo(X(0.6), Y(828)); g.lineTo(X(6), Y(700));
  for (let i = tiers.length - 1; i >= 0; i--) { const t = tiers[i], top = i + 1 < tiers.length ? tiers[i + 1][0] : 700; g.lineTo(X(t[2]), Y(top)); g.lineTo(X(t[2]), Y(t[0])); }
  g.lineTo(X(34), Y(0)); g.closePath(); g.fillStyle = gl; g.fill();
  g.strokeStyle = "rgba(255,255,255,.12)"; g.lineWidth = 1 * v.u;
  if (v.px > 120) for (let y = 30; y < 700; y += (v.px > 400 ? 12 : 36)) { g.beginPath(); g.moveTo(X(-34), Y(y)); g.lineTo(X(34), Y(y)); g.stroke(); }
  g.fillStyle = "#ff5a3d"; g.beginPath(); g.arc(X(0), Y(828), 2.5 * v.u, 0, TAU); g.fill();
  if (v.px > 200) txt(g, v, X(10), Y(828), "828 m", { color: "#ffc24b" });
};
DRAW.everest = (g, o, v) => {
  const h = o.h / o.D, Y = (m) => h / 2 - m / o.D;
  const s = sprite("everest", () => {
    const S = PSPR, Hs = Math.round(S * h), c = mk(S, Hs), x = c.getContext("2d"), r = rng(8849);
    const N = 513, prof = new Float32Array(N);
    const key = [[0, 700], [0.08, 1900], [0.18, 4200], [0.28, 6300], [0.34, 7861], [0.4, 6900], [0.47, 7700], [0.52, 8848.86], [0.58, 8100], [0.64, 8516], [0.7, 7300], [0.8, 5600], [0.9, 3300], [1, 1100]];
    for (let i = 0; i < N; i++) { const f = i / (N - 1); let k = 1; while (key[k][0] < f) k++; const a = key[k - 1], b = key[k]; prof[i] = lerp(a[1], b[1], smooth(0, 1, (f - a[0]) / (b[0] - a[0]))); }
    for (let st = 128, amp = 700; st >= 1; st >>= 1, amp *= 0.55) for (let i = st; i < N - 1; i += st * 2) if (Math.abs(i - 266) > 3) prof[i] = (prof[i - st] + prof[i + st]) / 2 * 0.5 + prof[i] * 0.5 + (r() - 0.5) * amp;
    const sx = (i) => i / (N - 1) * S, sy = (m) => Hs - m / 8848.86 * Hs * 0.999;
    x.beginPath(); x.moveTo(0, Hs); for (let i = 0; i < N; i++) x.lineTo(sx(i), sy(prof[i])); x.lineTo(S, Hs); x.closePath(); x.fillStyle = "#fff"; x.fill();
    const img = x.getImageData(0, 0, S, Hs), d = img.data;
    for (let j = 0; j < Hs; j++) for (let i = 0; i < S; i++) {
      const k = (j * S + i) * 4, cov = d[k + 3]; if (!cov) continue;
      const alt = (Hs - j) / Hs * 8848.86, u = i / S, w = j / S;
      const gully = fbm(u * 70, w * 9, 1, 4), n = fbm(u * 20, w * 20, 3, 4);
      const lit = 0.55 + 0.9 * (gully - 0.5) + 0.35 * (u < 0.52 ? 0.15 : -0.1);
      const snow = smooth(4800, 6000, alt + (n - 0.5) * 1800) * smooth(0.3, 0.55, gully + (alt > 7600 ? 0.25 : 0));
      let R = 70 * lit + 20, G = 72 * lit + 22, B = 84 * lit + 30;
      R = lerp(R, 236 * (0.7 + 0.3 * lit), snow); G = lerp(G, 242 * (0.7 + 0.3 * lit), snow); B = lerp(B, 252 * (0.75 + 0.25 * lit), snow);
      const haze = smooth(4000, 300, alt);
      d[k] = lerp(R, 40, haze * 0.7); d[k + 1] = lerp(G, 56, haze * 0.7); d[k + 2] = lerp(B, 90, haze * 0.7); d[k + 3] = cov * (1 - 0.75 * haze);
    }
    x.putImageData(img, 0, 0);
    return c;
  });
  if (s) g.drawImage(s, -0.5, -h / 2, 1, h);
  if (v.px > 180) {
    const px = -0.5 + 0.52;
    txt(g, v, px, Y(8848.86), "summit 8,848.86 m", { dx: 10, dy: -6, color: "#fff" });
    tick(g, v, -0.5, Y(5364), 0.5, Y(5364), "rgba(255,194,75,.35)", 1, [4, 6]); txt(g, v, -0.5, Y(5364), "base camp 5,364 m", { dx: 4, dy: -9, color: "rgba(255,194,75,.8)" });
    tick(g, v, -0.5, Y(0), 0.5, Y(0), "rgba(124,200,255,.5)", 1); txt(g, v, -0.5, Y(0), "sea level", { dx: 4, dy: -9, color: "rgba(124,200,255,.8)" });
    const ay = Y(10700), ax = 0.3;
    g.fillStyle = "#e9edff"; g.beginPath(); g.moveTo(ax - 0.018, ay); g.lineTo(ax + 0.018, ay - 0.002); g.lineTo(ax + 0.02, ay + 0.002); g.lineTo(ax - 0.018, ay + 0.003); g.fill();
    g.beginPath(); g.moveTo(ax, ay); g.lineTo(ax - 0.008, ay + 0.012); g.lineTo(ax - 0.004, ay); g.fill();
    txt(g, v, ax, ay, "airliner cruising at ~11 km (enlarged)", { dx: 16, color: "rgba(233,237,255,.65)" });
  }
};
// Los Angeles: equirectangular projection around the basin centre
const LA = { lon0: -118.25, lat0: 33.935, kx: 92.37e3, ky: 110.95e3 };
function laXY(o, lon, lat) { return [(lon - LA.lon0) * LA.kx / o.D, -(lat - LA.lat0) * LA.ky / o.D]; }
DRAW.la = (g, o, v) => {
  const w = o.w / o.D, h = o.h / o.D;
  const s = sprite("la", () => {
    const S = PSPR, Hs = Math.round(S * h), c = mk(S, Hs), x = c.getContext("2d"), r = rng(90731);
    const P = (lon, lat) => { const q = laXY(o, lon, lat); return [(q[0] + w / 2) * S, (q[1] + h / 2) * S]; };
    const sea = x.createLinearGradient(0, Hs, S * 0.3, 0); sea.addColorStop(0, "#020612"); sea.addColorStop(1, "#06122a");
    x.fillStyle = sea; x.fillRect(0, 0, S, Hs);
    const rings = DATA.geo.la;
    const landPath = () => {
      x.beginPath();
      rings.forEach((ringPts, k) => {
        ringPts.forEach((p, i) => { const q = P(p[0], p[1]); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); });
        if (k === 0) { const e = P(-116.5, 33.0), ne = P(-116.5, 35.5), nw = P(-119.6, 35.5); x.lineTo(nw[0], nw[1]); x.lineTo(ne[0], ne[1]); x.lineTo(e[0], e[1]); }
        x.closePath();
      });
    };
    landPath(); x.fillStyle = "#07080d"; x.fill();
    // relief and lights, pixel by pixel inside the land
    const img = x.getImageData(0, 0, S, Hs), d = img.data;
    const mts = [ // [lon, lat, radius°, strength] rough ridges (illustrative)
      [-118.72, 34.1, 0.13, 1], [-118.55, 34.1, 0.12, 1], [-118.4, 34.12, 0.08, 0.8], [-118.25, 34.3, 0.12, 1.2], [-118.0, 34.3, 0.14, 1.4], [-117.75, 34.3, 0.15, 1.4],
      [-118.28, 34.23, 0.05, 0.7], [-118.36, 33.765, 0.055, 0.9], [-117.95, 33.97, 0.07, 0.6], [-117.8, 33.93, 0.06, 0.6], [-117.8, 33.6, 0.08, 0.9], [-117.62, 33.72, 0.09, 1.2], [-118.37, 34.0, 0.02, 0.4]];
    for (let j = 0; j < Hs; j++) for (let i = 0; i < S; i++) {
      const k = (j * S + i) * 4; if (d[k] > 20 || d[k + 2] > 14) continue; // not land
      const lon = LA.lon0 + ((i + 0.5) / S - w / 2) * o.D / LA.kx, lat = LA.lat0 - ((j + 0.5) / S - h / 2) * o.D / LA.ky;
      let m = 0; for (const t of mts) { const dd = Math.hypot((lon - t[0]) * 0.83, lat - t[1]) / t[2]; if (dd < 1.6) m = Math.max(m, t[3] * Math.exp(-dd * dd * 1.4)); }
      const n = fbm(lon * 30, lat * 30, 0, 5), ridge = 1 - Math.abs(fbm(lon * 18, lat * 18, 5, 4) * 2 - 1);
      const relief = m * (0.35 + 0.65 * ridge);
      let R = 9 + relief * 30, G = 11 + relief * 28, B = 18 + relief * 34;
      const city = clamp(1 - m * 1.8, 0, 1) * smooth(0.2, 0.6, n + 0.1);
      const gx = Math.abs(Math.sin((lon + 118.3) * 420)), gy = Math.abs(Math.sin((lat - 34) * 510));
      const grid = Math.pow(Math.max(1 - gx, 1 - gy), 24) * (0.5 + noise3(lon * 90, lat * 90, 3));
      const spark = r() < 0.16 * city ? 0.5 + r() : 0;
      const L = city * (0.16 + 0.55 * grid) * (0.6 + 0.8 * n) + spark * 0.55;
      R += 255 * L; G += 176 * L; B += 92 * L;
      d[k] = R; d[k + 1] = G; d[k + 2] = B; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    // freeways (approximate, illustrative)
    const fw = [
      [[-118.49, 34.015], [-118.38, 34.03], [-118.24, 34.04], [-118.1, 34.07], [-117.9, 34.07], [-117.65, 34.07]],
      [[-118.25, 34.06], [-118.28, 33.95], [-118.285, 33.85], [-118.29, 33.75]],
      [[-118.48, 34.3], [-118.47, 34.12], [-118.42, 34.0], [-118.37, 33.9], [-118.28, 33.85], [-118.15, 33.8], [-118.0, 33.74], [-117.85, 33.68], [-117.72, 33.62]],
      [[-118.45, 34.32], [-118.3, 34.16], [-118.23, 34.06], [-118.1, 33.95], [-117.95, 33.84], [-117.85, 33.76], [-117.7, 33.62]],
      [[-118.2, 34.06], [-118.2, 33.95], [-118.19, 33.8]]
    ];
    x.lineCap = "round"; x.lineJoin = "round";
    for (const [col, lw] of [["rgba(255,170,80,.18)", S / 180], ["rgba(255,214,150,.75)", S / 700]]) {
      x.strokeStyle = col; x.lineWidth = lw;
      for (const line of fw) { x.beginPath(); line.forEach((p, i) => { const q = P(p[0], p[1]); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); }); x.stroke(); }
    }
    // port cranes and ship lights at San Pedro / Long Beach
    for (let i = 0; i < 90; i++) { const q = P(-118.27 + r() * 0.12, 33.73 + r() * 0.04); x.fillStyle = r() < 0.5 ? "rgba(255,255,230,.9)" : "rgba(180,220,255,.8)"; x.fillRect(q[0], q[1], 1.5, 1.5); }
    landPath(); x.strokeStyle = "rgba(124,200,255,.45)"; x.lineWidth = Math.max(1, S / 600); x.stroke();
    return c;
  });
  if (s) g.drawImage(s, -w / 2, -h / 2, w, h);
  g.strokeStyle = "rgba(124,200,255,.25)"; g.lineWidth = 1 * v.u; g.strokeRect(-w / 2, -h / 2, w, h);
  if (v.px > 260) {
    const pts = [[-118.292, 33.736, "San Pedro · Port of Los Angeles", "#4ef0b8", 8, 14, "left"], [-118.245, 34.052, "Downtown", "#ffc24b", 7, 0, "left"], [-118.408, 33.942, "LAX", "#ffc24b", 7, 0, "left"], [-118.49, 34.02, "Santa Monica", "#ffc24b", -7, 0, "right"], [-118.19, 33.77, "Long Beach", "#ffc24b", 7, -10, "left"], [-118.36, 33.77, "Palos Verdes", "rgba(233,237,255,.75)", -7, -4, "right"], [-118.1, 34.3, "San Gabriel Mountains", "rgba(233,237,255,.7)", 7, 0, "left"]];
    for (const [lon, lat, name, col, dx, dy, al] of pts) {
      const q = laXY(o, lon, lat);
      g.fillStyle = col; g.beginPath(); g.arc(q[0], q[1], 2.5 * v.u, 0, TAU); g.fill();
      txt(g, v, q[0], q[1], name, { dx, dy, align: al, color: col, font: name.startsWith("San Pedro") ? FONT_L : FONT_S });
    }
  }
};
DRAW.canyon = (g, o, v) => {
  const w = o.w / o.D, h = o.h / o.D;
  const s = sprite("canyon", () => {
    const S = PSPR, Hs = Math.round(S * h), c = mk(S, Hs), x = c.getContext("2d"), r = rng(1869);
    const img = x.createImageData(S, Hs), d = img.data;
    for (let j = 0; j < Hs; j++) for (let i = 0; i < S; i++) {
      const n = fbm(i / S * 12, j / S * 12, 2, 5), nn = fbm(i / S * 40, j / S * 40, 7, 3), north = smooth(0.55, 0.3, j / Hs + (n - 0.5) * 0.3);
      const col = mixc(mixc([150, 122, 86], [196, 160, 110], nn), [52, 82, 50], north * smooth(0.4, 0.6, n));
      const k = (j * S + i) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255;
    }
    x.putImageData(img, 0, 0);
    const path = []; const N = 400;
    for (let i = 0; i <= N; i++) { const f = i / N; path.push([f * S, Hs * (0.52 + 0.14 * Math.sin(f * 7.1 + 0.6) + 0.07 * Math.sin(f * 19 + 2) + 0.03 * Math.sin(f * 47))]); }
    const widthAt = (f) => (0.25 + 0.75 * Math.pow(Math.sin(Math.PI * clamp(f * 1.05, 0, 1)), 0.6)) * (0.55 + 0.45 * noise3(f * 9, 0, 0));
    const stroke = (pts, wmax, col, wf = widthAt) => { for (let i = 1; i < pts.length; i++) { const f = i / (pts.length - 1); x.strokeStyle = col; x.lineWidth = Math.max(1, wmax * wf(f)); x.lineCap = "round"; x.beginPath(); x.moveTo(pts[i - 1][0], pts[i - 1][1]); x.lineTo(pts[i][0], pts[i][1]); x.stroke(); } };
    const maxW = S * 29e3 / o.D;
    const side = [];
    for (let k = 0; k < 26; k++) { const i0 = 20 + ((r() * (N - 40)) | 0), p0 = path[i0], ang = (r() < 0.5 ? -1 : 1) * (Math.PI / 2 + (r() - 0.5) * 0.9), len = S * (0.02 + r() * 0.05); const pts = []; for (let q = 0; q <= 12; q++) { const t = q / 12; pts.push([p0[0] + Math.cos(ang + Math.sin(t * 5 + k) * 0.4) * len * t, p0[1] + Math.sin(ang + Math.sin(t * 5 + k) * 0.4) * len * t]); } side.push(pts); }
    for (const [mul, col] of [[1, "#d7864c"], [0.78, "#b9562e"], [0.55, "#8e3a22"], [0.34, "#5e2616"], [0.16, "#3a1a10"]]) {
      stroke(path, maxW * mul, col);
      for (const sp of side) stroke(sp, maxW * 0.28 * mul, col, (f) => 1 - f * 0.8);
    }
    stroke(path, Math.max(1.2, S / 500), "#3fa3c4", () => 1);
    return c;
  });
  if (s) g.drawImage(s, -w / 2, -h / 2, w, h);
  g.strokeStyle = "rgba(255,194,75,.25)"; g.lineWidth = 1 * v.u; g.strokeRect(-w / 2, -h / 2, w, h);
  if (v.px > 220) { txt(g, v, -w / 2, -h / 2, "North Rim (forest)", { dx: 8, dy: 12, color: "rgba(233,237,255,.8)" }); txt(g, v, 0.44, 0.1, "Colorado River", { align: "right", color: "#7cd6f0" }); }
};
DRAW.iss = (g, o, v) => {
  const w = o.w / o.D, h = o.h / o.D, R = 6371e3 / o.D, top = h / 2 - 0.1, cy = top + R, km = 1e3 / o.D;
  g.save(); g.beginPath(); g.rect(-w / 2, -h / 2, w, h); g.clip();
  const sky = g.createLinearGradient(0, -h / 2, 0, top); sky.addColorStop(0, "#01030a"); sky.addColorStop(1, "#030a1c"); g.fillStyle = sky; g.fillRect(-w / 2, -h / 2, w, h);
  const atm = g.createRadialGradient(0, cy, R, 0, cy, R + 120 * km);
  atm.addColorStop(0, "rgba(90,170,255,.85)"); atm.addColorStop(0.2, "rgba(70,140,255,.45)"); atm.addColorStop(0.6, "rgba(40,80,200,.12)"); atm.addColorStop(1, "rgba(40,80,200,0)");
  g.fillStyle = atm; g.beginPath(); g.arc(0, cy, R + 120 * km, 0, TAU); g.fill();
  const ground = g.createRadialGradient(0, cy - R * 0.9, 0, 0, cy, R); ground.addColorStop(0.9, "#0b1d3c"); ground.addColorStop(1, "#1d3f78");
  g.fillStyle = ground; g.beginPath(); g.arc(0, cy, R, 0, TAU); g.fill();
  const r = rng(51); g.fillStyle = "rgba(255,200,120,.7)";
  for (let i = 0; i < 260; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 0.28, dd = R - r() * 0.05; g.fillRect(Math.cos(a) * dd, cy + Math.sin(a) * dd, 1.2 * v.u, 1.2 * v.u); }
  g.strokeStyle = "rgba(120,255,170,.55)"; g.lineWidth = 1.4 * v.u; g.beginPath(); g.arc(0, cy, R + 95 * km, -Math.PI / 2 - 0.2, -Math.PI / 2 + 0.2); g.stroke();
  g.setLineDash([2 * v.u, 5 * v.u]); g.strokeStyle = "rgba(233,237,255,.35)"; g.lineWidth = 1 * v.u; g.beginPath(); g.arc(0, cy, R + 100 * km, -Math.PI / 2 - 0.2, -Math.PI / 2 + 0.2); g.stroke();
  g.setLineDash([6 * v.u, 6 * v.u]); g.strokeStyle = "rgba(255,194,75,.8)"; g.lineWidth = 1.4 * v.u; g.beginPath(); g.arc(0, cy, R + 410 * km, -Math.PI / 2 - 0.2, -Math.PI / 2 + 0.2); g.stroke(); g.setLineDash([]);
  const ph = reduce ? 0 : (v.t / 20) % 1, ia = -Math.PI / 2 - 0.12 + ph * 0.24, ix = Math.cos(ia) * (R + 410 * km), iy = cy + Math.sin(ia) * (R + 410 * km);
  g.globalCompositeOperation = "lighter"; glow(g, ix, iy, 9 * v.u, [255, 220, 150], 0.9); g.globalCompositeOperation = "source-over";
  g.restore();
  g.strokeStyle = "rgba(124,200,255,.25)"; g.lineWidth = 1 * v.u; g.strokeRect(-w / 2, -h / 2, w, h);
  if (v.px > 180) {
    txt(g, v, ix, iy, "ISS · 410 km up (station enlarged)", { dx: 12, dy: -10, color: "#ffc24b" });
    txt(g, v, 0.42, top - 100 * km, "Kármán line, 100 km: where space is usually said to begin", { align: "right", dy: -8, color: "rgba(233,237,255,.7)" });
    txt(g, v, -0.42, top - 95 * km, "green airglow", { dy: 10, color: "rgba(120,255,170,.8)" });
  }
};

/* ------------------------------ planets, moons, stars ------------------------------ */
function planetSprite(key, texFn, opt) { return sprite(key, () => sphereSprite(PSPR, texFn(Math.min(1024, PSPR + 128)), opt)); }
DRAW.moon = (g, o, v) => {
  const s = planetSprite("moon", moonTex, { light: [-0.7, 0.3, 0.65], tilt: 0.05, rot: 0.2, ambient: 0.02 });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1); else ball(g, 0, 0, 0.5, "#888", "#ccc", "#111");
};
DRAW.earth = (g, o, v) => {
  g.globalCompositeOperation = "lighter"; glow(g, 0, 0, 0.56, [80, 150, 255], 0.35); g.globalCompositeOperation = "source-over";
  const s = planetSprite("earth", earthTex, { light: [-0.62, 0.38, 0.69], tilt: 0.3, rot: 2.25, spec: (c) => c[2] > c[0] * 1.6 && c[2] > 60, rim: [60, 110, 255] });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1); else ball(g, 0, 0, 0.5, "#2a5aa0", "#8ac", "#012");
  g.strokeStyle = "rgba(140,200,255,.55)"; g.lineWidth = 1.5 * v.u; g.beginPath(); g.arc(0, 0, 0.5 + 0.8 * v.u, Math.PI * 0.7, Math.PI * 1.75); g.stroke();
};
DRAW.jupiter = (g, o, v) => {
  const s = planetSprite("jupiter", jupiterTex, { light: [-0.6, 0.3, 0.74], tilt: 0.05, rot: 0.3, limb: true });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1); else ball(g, 0, 0, 0.5, "#c9a27a", "#f1dcc0", "#2a1a10");
};
DRAW.earthmoon = (g, o, v) => {
  const w = o.w / o.D, Re = 6371e3 / o.D, Rm = 1737.4e3 / o.D, d = 3.844e8 / o.D, ex = -w / 2 + Re, mx = ex + d;
  g.save(); g.setLineDash([3 * v.u, 6 * v.u]); g.strokeStyle = "rgba(233,237,255,.28)"; g.lineWidth = 1 * v.u;
  g.beginPath(); g.arc(ex, 0, d, -0.14, 0.14); g.stroke(); g.restore();
  tick(g, v, ex + Re, 0, mx - Rm, 0, "rgba(124,200,255,.25)", 1);
  const es = sprites.get("earth"), ms = sprites.get("moon");
  g.globalCompositeOperation = "lighter"; glow(g, ex, 0, Math.max(Re * 2.4, 6 * v.u), [80, 150, 255], 0.5); glow(g, mx, 0, Math.max(Rm * 2.4, 4 * v.u), [200, 200, 200], 0.4); g.globalCompositeOperation = "source-over";
  if (es) g.drawImage(es.cv, ex - Re, -Re, 2 * Re, 2 * Re); else ball(g, ex, 0, Re, "#2a5aa0");
  if (ms) g.drawImage(ms.cv, mx - Rm, -Rm, 2 * Rm, 2 * Rm); else ball(g, mx, 0, Rm, "#999");
  const T = 1.2822, f = reduce ? 0.5 : (v.t % (T + 0.8)) / T;
  if (f <= 1) { g.globalCompositeOperation = "lighter"; glow(g, lerp(ex + Re, mx - Rm, f), 0, 10 * v.u, [255, 240, 180], 1); g.globalCompositeOperation = "source-over"; }
  if (v.px > 160) {
    txt(g, v, 0, 0, "384,400 km · light takes 1.28 s", { align: "center", dy: -14, color: "rgba(233,237,255,.8)" });
    txt(g, v, ex, Re, "Earth", { align: "center", dy: 14 }); txt(g, v, mx, Rm, "Moon", { align: "center", dy: 14 });
  }
};
DRAW.sun = (g, o, v) => {
  const t = reduce ? 0 : v.t;
  const cor = sprite("corona", () => {
    const S = 384, c = mk(S), x = c.getContext("2d"), img = x.createImageData(S, S), d = img.data;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S - 0.5, w = (j + 0.5) / S - 0.5, r = Math.hypot(u, w) / 0.5 * 3.2, a = Math.atan2(w, u);
      if (r < 0.98) continue;
      const streak = fbm(Math.cos(a) * 3 + 2, Math.sin(a) * 3, r * 0.35, 4), fine = noise3(Math.cos(a) * 40, Math.sin(a) * 40, r * 0.8);
      const I = Math.pow(r, -2.6) * (0.35 + 1.4 * Math.pow(streak, 2.2) + 0.25 * fine) * (0.6 + 0.4 * Math.abs(Math.cos(a)));
      const k = (j * S + i) * 4, A = clamp(I * 1.3, 0, 1);
      d[k] = 255; d[k + 1] = 225 - 40 * (1 - A); d[k + 2] = 180 - 80 * (1 - A); d[k + 3] = 255 * A * smooth(3.2, 2.2, r);
    }
    x.putImageData(img, 0, 0); return c;
  });
  g.globalCompositeOperation = "lighter";
  glow(g, 0, 0, 1.5, [255, 150, 60], 0.14); glow(g, 0, 0, 0.8, [255, 200, 120], 0.35);
  if (cor) { g.save(); g.rotate(t * 0.004); g.drawImage(cor, -1.6, -1.6, 3.2, 3.2); g.restore(); }
  g.globalCompositeOperation = "source-over";
  const s = sprite("sun", () => starSprite(PSPR, { c1: "#fff6de", c2: "#ffc766", c3: "#e0621c", cells: 9, spots: 5, seed: 3 }));
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1); else ball(g, 0, 0, 0.5, "#ffcc66", "#fff", "#e06020");
  g.globalCompositeOperation = "lighter"; g.lineCap = "round";
  for (const [a, sz] of [[2.45, 0.035], [5.7, 0.025], [4.1, 0.02]]) {
    const cx = Math.cos(a) * 0.5, cy = Math.sin(a) * 0.5;
    for (const [lw, al] of [[0.012, 0.25], [0.004, 0.8]]) { g.strokeStyle = "rgba(255,110,70," + al + ")"; g.lineWidth = lw; g.beginPath(); g.arc(cx, cy, sz, a - 1.6, a + 1.6); g.stroke(); }
  }
  g.globalCompositeOperation = "source-over";
};
DRAW.star = (g, o, v) => {
  const st = o.star, gcol = hex(st.glow), R = o.size / 2 / o.D;
  if (st.dust) {
    const ds = sprite("dust-" + o.id, () => {
      const S = 512, c = mk(S), x = c.getContext("2d"), img = x.createImageData(S, S), d = img.data;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const u = i / S - 0.5, w = j / S - 0.5, rr = Math.hypot(u, w); const n = fbm(u * 5 + 1, w * 5, 3, 5), a = clamp((n - 0.35) * 2.2, 0, 1) * smooth(0.5, 0.2, rr) * smooth(0.12, 0.22, rr); const k = (j * S + i) * 4; d[k] = 190; d[k + 1] = 80 + n * 60; d[k + 2] = 40; d[k + 3] = 200 * a; }
      x.putImageData(img, 0, 0); return c;
    });
    if (ds) { g.globalAlpha = v.a * 0.8; g.drawImage(ds, -1.1, -1.1, 2.2, 2.2); g.globalAlpha = v.a; }
  }
  g.globalCompositeOperation = "lighter"; glow(g, 0, 0, R * 2.4, gcol, 0.35); g.globalCompositeOperation = "source-over";
  const s = sprite("star-" + o.id, () => starSprite(PSPR, { ...st, seed: o.id.length * 3.1, wobble: o.id === "arcturus" ? 0 : 0.06 }));
  if (s) g.drawImage(s, -R, -R, 2 * R, 2 * R); else ball(g, 0, 0, R, st.c2, st.c1, st.c3);
  if (st.ring) {
    const rr = st.ring[0] * AU / o.D;
    ring(g, v, rr, "rgba(233,237,255,.55)", 1.2, [5, 5]);
    if (v.px > 140) txt(g, v, 0, -rr, st.ring[1] + " for comparison", { align: "center", dy: -9, color: "rgba(233,237,255,.85)" });
    ring(g, v, AU / o.D, "rgba(124,200,255,.5)", 1, [2, 4]);
    if (v.px > 200) txt(g, v, 0, AU / o.D, "Earth's orbit", { align: "center", dy: 10, color: "#cfe9ff" });
    g.globalCompositeOperation = "lighter"; glow(g, 0, 0, Math.max(4 * v.u, 0.6957e9 / o.D), [255, 240, 200], 0.9); g.globalCompositeOperation = "source-over";
  }
};

/* ------------------------------ the Solar System ------------------------------ */
// J2000 mean longitude L0 (deg), rate (deg/day), semi-major axis (AU): Standish Table 1
const PLANETS = [
  ["Mercury", 252.2503, 4.09233445, 0.3871, "#b8b2a8"], ["Venus", 181.9791, 1.60213034, 0.7233, "#f2d49b"], ["Earth", 100.4646, 0.98560910, 1.0, "#6fb3ff"],
  ["Mars", 355.4533, 0.52402068, 1.5237, "#e2603c"], ["Jupiter", 34.3964, 0.08308529, 5.2029, "#d9b48c"], ["Saturn", 49.9549, 0.03344414, 9.5367, "#e8d39a"],
  ["Uranus", 313.2381, 0.01172834, 19.189, "#9fe6f0"], ["Neptune", 304.8800, 0.00598103, 30.070, "#6f8dff"]
];
function planetAngle(p) { const d = (Date.now() - Date.UTC(2000, 0, 1, 12)) / 86400000; return ((p[1] + p[2] * d) % 360) * Math.PI / 180; }
let BELTS = null;
function belts() {
  if (BELTS) return BELTS;
  const r = rng(314), ast = [], kui = [];
  for (let i = 0; i < 1400; i++) { const a = r() * TAU, rr = 2.15 + r() * 1.15 + gauss(r) * 0.08; ast.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  for (let i = 0; i < 1600; i++) { const a = r() * TAU, rr = 30 + Math.abs(gauss(r)) * 8 + r() * 12; kui.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
  return (BELTS = { ast, kui });
}
DRAW.orbits = (g, o, v) => {
  const k = AU / o.D, n = o.orbits;
  g.globalCompositeOperation = "lighter";
  glow(g, 0, 0, Math.max(10 * v.u, 0.3 * k), [255, 200, 110], 0.9); glow(g, 0, 0, 4 * v.u, [255, 255, 240], 1);
  const B = belts();
  if (n > 4) {
    g.fillStyle = "rgba(200,190,170,.22)"; const sz = 1 * v.u;
    for (const p of B.ast) g.fillRect(p[0] * k, -p[1] * k, sz, sz);
    g.fillStyle = "rgba(150,190,255,.22)";
    for (const p of B.kui) g.fillRect(p[0] * k, -p[1] * k, sz, sz);
  }
  g.globalCompositeOperation = "source-over";
  for (let i = 0; i < n; i++) {
    const p = PLANETS[i], R = p[3] * k, a = planetAngle(p), col = hex(p[4]);
    if (R * v.px < 3) continue;
    ring(g, v, R, rgba(col, 0.38), 1);
    const x = Math.cos(a) * R, y = -Math.sin(a) * R;
    g.globalCompositeOperation = "lighter"; glow(g, x, y, 8 * v.u, col, 0.8); g.globalCompositeOperation = "source-over";
    g.fillStyle = p[4]; g.beginPath(); g.arc(x, y, 2.6 * v.u, 0, TAU); g.fill();
    if (R * v.px > 22 && v.px > 120) txt(g, v, x, y, p[0], { dx: 8, dy: -8, color: p[4] });
  }
  if (v.px > 200) txt(g, v, 0, 0.5, n > 4 ? "positions for today (circular orbits) · planets not to scale" : "positions for today · planets not to scale", { align: "center", dy: 2, color: "rgba(233,237,255,.5)" });
  if (n <= 4 && v.px > 160) { tick(g, v, 0, 0, k, 0, "rgba(124,200,255,.6)", 1, [3, 3]); txt(g, v, k / 2, 0, "1 AU", { align: "center", dy: 10, color: "#7cc8ff" }); }
};
// Voyager distances: EarthSky 26 June 2026 (V1: 173.14 AU = 1 light-day on 2026-11-18; V2 ≈ 148.7 AU on 2026-06-26);
// outward speeds ≈ 3.57 and 3.25 AU/yr (NASA/JPL Voyager mission status).
function voyagerAU(which) {
  const yr = (Date.now() - (which === 1 ? Date.UTC(2026, 10, 18) : Date.UTC(2026, 5, 26))) / 31557600000;
  return which === 1 ? 173.14 + 3.57 * yr : 148.7 + 3.25 * yr;
}
DRAW.helio = (g, o, v) => {
  const k = AU / o.D, nose = Math.PI; // interstellar wind arrives from the left
  const shape = (R0, stretch) => { g.beginPath(); for (let i = 0; i <= 120; i++) { const a = i / 120 * TAU, c = Math.cos(a - nose), r = R0 * (1 + stretch * Math.pow((1 - c) / 2, 1.6)); const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.92; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); };
  const hp = 121.6 * k;
  shape(hp, 1.5); const gr = g.createRadialGradient(0, 0, 0, 0, 0, hp * 2.2); gr.addColorStop(0, "rgba(255,190,90,.14)"); gr.addColorStop(0.45, "rgba(124,140,255,.12)"); gr.addColorStop(1, "rgba(177,140,255,.02)"); g.fillStyle = gr; g.fill();
  shape(hp, 1.5); g.strokeStyle = "rgba(177,140,255,.75)"; g.lineWidth = 1.6 * v.u; g.stroke();
  shape(94 * k, 0.8); g.strokeStyle = "rgba(255,194,75,.45)"; g.lineWidth = 1 * v.u; g.setLineDash([4 * v.u, 5 * v.u]); g.stroke(); g.setLineDash([]);
  g.strokeStyle = "rgba(124,200,255,.25)"; g.lineWidth = 1 * v.u;
  for (let j = -3; j <= 3; j++) { const y = j * 0.07, x0 = -0.5; g.beginPath(); g.moveTo(x0, y); g.lineTo(-hp * 1.2 - Math.abs(y) * 0.4, y); g.stroke(); }
  ring(g, v, 30.07 * k, "rgba(111,141,255,.4)", 1); ring(g, v, 5.2 * k, "rgba(217,180,140,.35)", 1);
  g.globalCompositeOperation = "lighter"; glow(g, 0, 0, Math.max(8 * v.u, 3 * k), [255, 210, 120], 1); g.globalCompositeOperation = "source-over";
  const craft = [[1, 145, "#ffc24b"], [2, 212, "#4ef0b8"]];
  for (const [id, ang, col] of craft) {
    const d = voyagerAU(id) * k, a = ang * Math.PI / 180, x = Math.cos(a) * d, y = -Math.sin(a) * d * 0.92;
    g.strokeStyle = rgba(hex(col), 0.55); g.lineWidth = 1.2 * v.u; g.setLineDash([2 * v.u, 4 * v.u]); g.beginPath(); g.moveTo(0, 0); g.lineTo(x, y); g.stroke(); g.setLineDash([]);
    g.globalCompositeOperation = "lighter"; glow(g, x, y, 9 * v.u, hex(col), 1); g.globalCompositeOperation = "source-over";
    if (v.px > 140) txt(g, v, x, y, "Voyager " + id + " · " + nice(voyagerAU(id)) + " AU", { dx: id === 1 ? 10 : 10, dy: id === 1 ? -10 : 12, color: col });
  }
  if (v.px > 200) {
    txt(g, v, -hp, 0, "heliopause", { align: "right", dx: -8, dy: 18, color: "#b18cff" });
    txt(g, v, -94 * k * 0.9, 94 * k * 0.5, "termination shock", { align: "right", dy: 10, color: "rgba(255,194,75,.8)" });
    txt(g, v, -0.48, 0.3, "interstellar wind →", { color: "rgba(124,200,255,.7)" });
    txt(g, v, 30.07 * k, 0, "Neptune", { dx: 4, color: "rgba(111,141,255,.8)" });
  }
};
DRAW.sedna = (g, o, v) => {
  const k = AU / o.D, a = 506.5 * k, e = 0.8496, b = a * Math.sqrt(1 - e * e), c = a * e, fx = -c; // Sun at the left focus
  g.strokeStyle = "rgba(177,140,255,.75)"; g.lineWidth = 1.5 * v.u; g.beginPath(); g.ellipse(0, 0, a, b, 0, 0, TAU); g.stroke();
  g.save(); g.translate(fx, 0);
  ring(g, v, 121.6 * k, "rgba(177,140,255,.35)", 1, [3, 4]); ring(g, v, 30.07 * k, "rgba(111,141,255,.45)", 1);
  g.globalCompositeOperation = "lighter"; glow(g, 0, 0, 8 * v.u, [255, 210, 120], 1); g.globalCompositeOperation = "source-over";
  g.restore();
  // Sedna now: about 83 AU and inbound, near perihelion (2076)
  const ang = Math.PI - 0.55, rr = 83 * k, sx = fx + Math.cos(ang) * rr, sy = -Math.sin(ang) * rr;
  g.globalCompositeOperation = "lighter"; glow(g, sx, sy, 7 * v.u, [255, 120, 90], 1); g.globalCompositeOperation = "source-over";
  if (v.px > 160) {
    txt(g, v, sx, sy, "Sedna today (~83 AU)", { dx: 8, dy: -8, color: "#ff8a6a" });
    txt(g, v, a, 0, "aphelion ≈ 937 AU", { dx: 6, color: "rgba(177,140,255,.9)" });
    txt(g, v, fx, 121.6 * k, "heliopause", { align: "center", dy: 10, color: "rgba(177,140,255,.7)" });
  }
};

/* ------------------------------ among the stars ------------------------------ */
DRAW.lightyear = (g, o, v) => {
  const w = o.w / o.D, x0 = -w / 2, per = (d) => d / o.D;
  g.globalCompositeOperation = "lighter";
  const oo = g.createLinearGradient(x0 + per(2000 * AU), 0, x0 + per(20000 * AU), 0); oo.addColorStop(0, "rgba(124,200,255,0)"); oo.addColorStop(1, "rgba(124,200,255,.1)");
  g.fillStyle = oo; g.beginPath(); g.ellipse(x0, 0, w * 1.02, 0.09, 0, -Math.PI / 2, Math.PI / 2); g.fill();
  const beam = g.createLinearGradient(x0, 0, x0 + w, 0); beam.addColorStop(0, "rgba(255,230,160,.9)"); beam.addColorStop(1, "rgba(255,230,160,.35)");
  g.fillStyle = beam; g.fillRect(x0, -1 * v.u, w, 2 * v.u);
  glow(g, x0, 0, 10 * v.u, [255, 210, 120], 1);
  const f = reduce ? 0.6 : (v.t % 7) / 6;
  if (f <= 1) glow(g, x0 + f * w, 0, 12 * v.u, [255, 245, 200], 1);
  g.globalCompositeOperation = "source-over";
  const marks = [[173.1 * AU, "1 light-day (Voyager 1)"], [LY / 52.18, "1 light-week"], [LY / 12, "1 light-month"], [LY / 4, "3 months"], [LY / 2, "6 months"], [LY, "1 light-year"]];
  marks.forEach(([d, s], i) => {
    const x = x0 + per(d); tick(g, v, x, -0.03, x, 0.03, "rgba(233,237,255,.6)", 1);
    if (v.px > 180 && (per(d) * v.px > 26 || i === marks.length - 1)) txt(g, v, x, i % 2 ? 0.03 : -0.03, s, { align: "center", dy: i % 2 ? 12 : -12 });
  });
  if (v.px > 200) { txt(g, v, x0, 0, "Sun", { align: "right", dx: -12 }); txt(g, v, 0, 0.1, "inner edge of the Oort cloud, ~2,000–5,000 AU", { align: "center", color: "rgba(124,200,255,.7)" }); txt(g, v, 0, -0.1, "a pulse of light, one year compressed into six seconds", { align: "center", color: "rgba(255,230,160,.7)" }); }
};
DRAW.oort = (g, o, v) => {
  const s = sprite("oort", () => {
    const S = SPR, c = mk(S), x = c.getContext("2d"), r = rng(1950);
    x.translate(S / 2, S / 2); x.globalCompositeOperation = "lighter";
    for (let i = 0; i < 26000; i++) {
      let rr, px, py;
      if (i < 9000) { rr = 0.012 + Math.pow(r(), 1.6) * 0.1; const a = r() * TAU; px = Math.cos(a) * rr; py = Math.sin(a) * rr * (0.35 + 0.65 * r()) + gauss(r) * 0.01; }
      else { rr = 0.1 + Math.pow(r(), 0.8) * 0.4; const ct = r() * 2 - 1, ph = r() * TAU, st = Math.sqrt(1 - ct * ct); px = rr * st * Math.cos(ph); py = rr * st * Math.sin(ph); }
      const f = Math.hypot(px, py) / 0.5;
      x.fillStyle = rgba(mixc([200, 230, 255], [124, 140, 255], f), 0.18 + 0.3 * (1 - f));
      x.fillRect(px * S, py * S, 1.2, 1.2);
    }
    glow(x, 0, 0, S * 0.02, [255, 220, 150], 1);
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 200) { txt(g, v, 0, 0, "Sun (and every planet) inside this dot", { dx: 14, dy: 10, color: "rgba(255,210,150,.85)" }); txt(g, v, 0, -0.5, "outer edge ~100,000 AU (1.6 light-years)", { align: "center", dy: 6 }); }
};
DRAW.alphacen = (g, o, v) => {
  const w = o.w / o.D, x0 = -w / 2 + 0.01, x1 = x0 + 4.37 * LY / o.D, xp = x0 + 4.24 * LY / o.D;
  tick(g, v, x0, 0, x1, 0, "rgba(233,237,255,.35)", 1, [4, 6]);
  g.globalCompositeOperation = "lighter";
  glow(g, x0, 0, 12 * v.u, [255, 220, 150], 1);
  glow(g, x1, 0.004, 13 * v.u, [255, 236, 190], 1); glow(g, x1 + 5 * v.u, -0.004, 9 * v.u, [255, 190, 120], 1);
  glow(g, xp, 0.13, 6 * v.u, [255, 90, 70], 1);
  g.globalCompositeOperation = "source-over";
  if (v.px > 140) {
    txt(g, v, x0, 0, "Sun", { align: "center", dy: 18 }); txt(g, v, x1, 0, "Alpha Centauri A & B", { align: "right", dy: 18 });
    txt(g, v, xp, 0.13, "Proxima Centauri, 4.24 ly", { align: "right", dx: -10 });
    txt(g, v, 0, 0, "4.37 light-years · 41 trillion km", { align: "center", dy: -12, color: "rgba(233,237,255,.85)" });
  }
};
function nebulaSprite(key, fn, size = 512) {
  return sprite(key, () => {
    const S = size, c = mk(S), x = c.getContext("2d"), img = x.createImageData(S, S), d = img.data;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const u = (i + 0.5) / S - 0.5, w = (j + 0.5) / S - 0.5, col = fn(u, w), k = (j * S + i) * 4;
      d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = col[3];
    }
    x.putImageData(img, 0, 0);
    return c;
  });
}
function starDots(x, S, n, seed, rad, colf) {
  const r = rng(seed); x.globalCompositeOperation = "lighter";
  for (let i = 0; i < n; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * rad, px = S / 2 + Math.cos(a) * rr * S, py = S / 2 + Math.sin(a) * rr * S, b = Math.pow(r(), 4); glow(x, px, py, 1 + b * S * 0.012, colf(r), 0.5 + 0.5 * b); }
}
DRAW.orion = (g, o, v) => {
  const base = nebulaSprite("orion", (u, w) => {
    const r = Math.hypot(u - 0.02, w - 0.04);
    const qx = fbm(u * 3 + 1.7, w * 3, 1.3, 4), qy = fbm(u * 3 + 5.2, w * 3 + 1.3, 2.1, 4);
    const n = fbm(u * 4 + qx * 2, w * 4 + qy * 2, 0.5, 5);
    const fall = smooth(0.5, 0.02, r * (1 + 0.5 * (qx - 0.5)));
    const e = Math.pow(clamp(n * 1.35 - 0.2, 0, 1), 1.6) * fall;
    const core = smooth(0.22, 0, r);
    const dust = smooth(0.52, 0.72, fbm(u * 7 + 3, w * 7, 4, 4));
    let col = mixc([255, 60, 90], [255, 150, 170], core);
    col = mixc(col, [90, 230, 220], core * 0.6 * smooth(0.3, 0.8, n));
    const I = clamp(e * 2.2 + core * core * 0.6, 0, 1) * (1 - dust * 0.8);
    return [col[0], col[1], col[2], 255 * I];
  });
  if (base) g.drawImage(base, -0.5, -0.5, 1, 1);
  const s = sprite("orion-stars", () => { const S = 512, c = mk(S), x = c.getContext("2d"); starDots(x, S, 160, 42, 0.5, (r) => (r() < 0.5 ? [200, 220, 255] : [255, 240, 220])); x.globalCompositeOperation = "lighter"; [[0.02, 0.04], [0.035, 0.03], [0.01, 0.055], [0.04, 0.06]].forEach(([a, b]) => glow(x, S / 2 + a * S, S / 2 + b * S, S * 0.03, [210, 230, 255], 1)); return c; });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 220) txt(g, v, 0.03, 0.05, "Trapezium cluster", { dx: 18, dy: 14, color: "rgba(233,237,255,.8)" });
};
const PLEIADES = [[0, 0, 1], [-0.3, 0.02, 0.8], [-0.31, -0.05, 0.55], [0.3, 0.09, 0.8], [0.19, 0.2, 0.7], [0.18, -0.07, 0.75], [0.26, -0.2, 0.65], [0.36, -0.03, 0.5], [0.28, -0.3, 0.45]];
DRAW.pleiades = (g, o, v) => {
  const base = nebulaSprite("pleiades", (u, w) => {
    let I = 0; for (const s of PLEIADES) { const d = Math.hypot(u - s[0] * 0.8, w - s[1] * 0.8); I += s[2] * Math.exp(-d * d / 0.006); }
    const streak = fbm(u * 3 + w * 8, w * 2 - u * 1, 1, 5);
    I *= 0.4 + 1.3 * Math.pow(streak, 2);
    return [120, 170, 255, 255 * clamp(I * 0.8, 0, 0.85)];
  });
  if (base) g.drawImage(base, -0.5, -0.5, 1, 1);
  const s = sprite("pleiades-stars", () => {
    const S = 768, c = mk(S), x = c.getContext("2d"); starDots(x, S, 260, 7, 0.5, () => [200, 215, 255]);
    x.globalCompositeOperation = "lighter";
    for (const st of PLEIADES) { const px = S / 2 + st[0] * 0.8 * S, py = S / 2 + st[1] * 0.8 * S, R = S * 0.03 * st[2]; glow(x, px, py, R, [190, 215, 255], 1); glow(x, px, py, R * 0.3, [255, 255, 255], 1); x.strokeStyle = "rgba(200,220,255,.45)"; x.lineWidth = 1.2; x.beginPath(); x.moveTo(px - R * 2.2, py); x.lineTo(px + R * 2.2, py); x.moveTo(px, py - R * 2.2); x.lineTo(px, py + R * 2.2); x.stroke(); }
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 220) { txt(g, v, 0, 0, "Alcyone", { dx: 18, dy: 14 }); txt(g, v, 0.19 * 0.8, 0.2 * 0.8, "Merope", { dx: 14, dy: 10 }); }
};
DRAW.globular = (g, o, v) => {
  const s = sprite("globular", () => {
    const S = SPR, c = mk(S), x = c.getContext("2d"), r = rng(5139); x.translate(S / 2, S / 2); x.globalCompositeOperation = "lighter";
    glow(x, 0, 0, S * 0.22, [255, 220, 170], 0.5);
    for (let i = 0; i < 16000; i++) {
      const u = r(), rr = 0.045 / Math.sqrt(Math.pow(u, -2 / 3) - 1 + 1e-9); if (rr > 0.5) continue;
      const ct = r() * 2 - 1, ph = r() * TAU, st = Math.sqrt(1 - ct * ct), px = rr * st * Math.cos(ph) * S, py = rr * st * Math.sin(ph) * S;
      const giant = r() < 0.04, col = giant ? [255, 180, 110] : r() < 0.7 ? [255, 236, 200] : [200, 215, 255];
      x.fillStyle = rgba(col, giant ? 0.9 : 0.45); const sz = giant ? 2.2 : 1.2; x.fillRect(px, py, sz, sz);
    }
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
};
function spiralSprite(S, o) {
  const c = mk(S), x = c.getContext("2d"), r = rng(o.seed || 1); x.translate(S / 2, S / 2);
  x.globalCompositeOperation = "lighter";
  glow(x, 0, 0, S * 0.5, [120, 140, 220], 0.16); glow(x, 0, 0, S * 0.3, [200, 190, 230], 0.12); glow(x, 0, 0, S * 0.14, [255, 214, 160], 0.55);
  const arms = o.arms || 2, tp = Math.tan((o.pitch || 13) * Math.PI / 180), N = o.n || 60000, bar = o.bar || 0.0;
  for (let i = 0; i < N; i++) {
    const q = r(); let px, py, col, al = 0.5, sz = 1.1;
    if (q < 0.16) { const rr = Math.abs(gauss(r)) * 0.05; const a = r() * TAU; px = Math.cos(a) * rr; py = Math.sin(a) * rr * 0.85; col = [255, 214, 160]; al = 0.6; }
    else if (q < 0.16 + bar) { const t = gauss(r) * 0.07; px = t; py = gauss(r) * 0.018; const ca = Math.cos(o.barA || 0.5), sa = Math.sin(o.barA || 0.5); [px, py] = [px * ca - py * sa, px * sa + py * ca]; col = [255, 220, 170]; al = 0.55; }
    else {
      const rr = clamp(0.03 - Math.log(1 - r() * 0.97) * 0.14, 0, 0.5), arm = (r() * arms) | 0;
      const inArm = r() < 0.72, spread = inArm ? gauss(r) * (0.16 + 0.05 / (rr + 0.05)) : r() * TAU;
      const a = arm * TAU / arms + Math.log(rr / 0.035 + 1e-3) / tp + spread;
      px = Math.cos(a) * rr; py = Math.sin(a) * rr;
      const f = rr / 0.5; col = mixc([255, 226, 190], [170, 200, 255], clamp(f * 1.6, 0, 1)); al = 0.35 + 0.35 * (inArm ? 1 : 0.3);
      if (inArm && r() < 0.018) { col = [255, 110, 170]; al = 0.9; sz = 2; }
      if (inArm && r() < 0.01) { col = [200, 225, 255]; al = 1; sz = 1.8; }
    }
    x.fillStyle = rgba(col, al); x.fillRect(px * S, py * S, sz, sz);
  }
  x.globalCompositeOperation = "source-over";
  for (let i = 0; i < 3500; i++) { // dust lanes on the inner edge of the arms
    const rr = 0.05 + r() * 0.36, arm = (r() * arms) | 0, a = arm * TAU / arms + Math.log(rr / 0.035) / tp - 0.22 + gauss(r) * 0.06;
    x.fillStyle = "rgba(12,6,14,.09)"; x.beginPath(); x.arc(Math.cos(a) * rr * S, Math.sin(a) * rr * S, S * (0.003 + r() * 0.005), 0, TAU); x.fill();
  }
  x.globalCompositeOperation = "lighter"; glow(x, 0, 0, S * 0.05, [255, 240, 210], 0.9);
  return c;
}
DRAW.milkyway = (g, o, v) => {
  const s = sprite("milkyway", () => spiralSprite(Math.min(1024, SPR * 1.25) | 0, { arms: 4, pitch: 12, bar: 0.1, barA: 0.45, seed: 26, n: 70000 }));
  g.save(); g.rotate(reduce ? 0 : -v.t * 0.004);
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1); else glow(g, 0, 0, 0.5, [200, 180, 255], 0.5);
  g.restore();
  if (v.px > 140) {
    const rr = 26670 * LY / o.D, a = 2.2 - (reduce ? 0 : v.t * 0.004), x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    g.strokeStyle = "#4ef0b8"; g.lineWidth = 1.5 * v.u; g.beginPath(); g.arc(x, y, 7 * v.u, 0, TAU); g.stroke();
    txt(g, v, x, y, "You are here · 26,700 ly from the centre", { dx: 12, color: "#4ef0b8", font: FONT_L });
  }
};
DRAW.andromeda = (g, o, v) => {
  const h = o.h / o.D;
  const s = sprite("andromeda", () => spiralSprite(Math.min(1024, SPR * 1.25) | 0, { arms: 2, pitch: 8, bar: 0.02, seed: 31, n: 70000 }));
  if (s) g.drawImage(s, -0.5, -h / 2 * 1.02, 1, h * 1.02); else glow(g, 0, 0, 0.5, [220, 200, 255], 0.5);
  g.globalCompositeOperation = "lighter"; glow(g, 0.08, 0.1, 0.02, [255, 230, 200], 0.9); glow(g, -0.12, -0.14, 0.03, [255, 230, 200], 0.6); g.globalCompositeOperation = "source-over";
  if (v.px > 240) { txt(g, v, 0.08, 0.1, "M32", { dx: 8 }); txt(g, v, -0.12, -0.14, "M110", { dx: 10 }); }
};
DRAW.lmc = (g, o, v) => {
  const s = sprite("lmc", () => {
    const S = SPR, c = mk(S), x = c.getContext("2d"), r = rng(1987); x.translate(S / 2, S / 2); x.globalCompositeOperation = "lighter";
    glow(x, 0, 0, S * 0.45, [150, 170, 255], 0.14);
    for (let i = 0; i < 40000; i++) {
      let px, py; const q = r();
      if (q < 0.35) { px = gauss(r) * 0.13; py = gauss(r) * 0.035; const ca = Math.cos(-0.35), sa = Math.sin(-0.35); [px, py] = [px * ca - py * sa, px * sa + py * ca]; }
      else if (q < 0.55) { const a = -0.6 + r() * 2.4, rr = 0.2 + gauss(r) * 0.03; px = Math.cos(a) * rr + 0.02; py = -Math.sin(a) * rr * 0.8; }
      else { px = gauss(r) * 0.17 + 0.03; py = gauss(r) * 0.15; }
      if (Math.hypot(px, py) > 0.5) continue;
      x.fillStyle = r() < 0.5 ? "rgba(200,215,255,.4)" : "rgba(255,236,210,.35)"; x.fillRect(px * S, py * S, 1.2, 1.2);
    }
    glow(x, 0.13 * S, -0.12 * S, S * 0.06, [255, 90, 150], 0.9); glow(x, 0.13 * S, -0.12 * S, S * 0.015, [255, 220, 240], 1);
    for (let k = 0; k < 14; k++) glow(x, (r() - 0.5) * 0.6 * S, (r() - 0.5) * 0.5 * S, S * (0.008 + r() * 0.015), [255, 110, 170], 0.7);
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 220) txt(g, v, 0.13, -0.12, "Tarantula Nebula", { dx: 16, color: "#ff8ab8" });
};
DRAW.m31dist = (g, o, v) => {
  const w = o.w / o.D, mw = 9.46e20 / o.D, an = 1.44e21 / o.D, x0 = -w / 2 + mw / 2, x1 = w / 2 - an / 2;
  tick(g, v, x0 + mw / 2, 0, x1 - an / 2, 0, "rgba(233,237,255,.35)", 1, [4, 6]);
  const a = sprites.get("milkyway"), b = sprites.get("andromeda");
  g.globalCompositeOperation = "lighter"; glow(g, x0, 0, Math.max(mw, 8 * v.u), [200, 190, 255], 0.5); glow(g, x1, 0, Math.max(an * 0.7, 8 * v.u), [230, 210, 255], 0.5); g.globalCompositeOperation = "source-over";
  if (a) g.drawImage(a.cv, x0 - mw / 2, -mw / 2, mw, mw);
  if (b) g.drawImage(b.cv, x1 - an / 2, -an * 0.16, an, an * 0.32);
  const f = reduce ? 0.5 : (v.t % 9) / 8;
  if (f <= 1) { g.globalCompositeOperation = "lighter"; glow(g, lerp(x1 - an / 2, x0 + mw / 2, f), 0, 9 * v.u, [255, 240, 200], 1); g.globalCompositeOperation = "source-over"; }
  if (v.px > 140) {
    txt(g, v, x0, mw / 2, "Milky Way", { align: "center", dy: 14 }); txt(g, v, x1, an * 0.16, "Andromeda", { align: "center", dy: 14 });
    txt(g, v, 0, 0, "2.5 million light-years", { align: "center", dy: -12, color: "rgba(233,237,255,.85)" });
  }
};
const LG = [[-0.12, 0.02, "Milky Way", 9.46e20, "milkyway"], [0.13, -0.03, "Andromeda", 1.44e21, "andromeda"], [0.19, 0.035, "Triangulum", 5.8e20, "milkyway"]];
DRAW.localgroup = (g, o, v) => {
  ring(g, v, 0.5, "rgba(177,140,255,.35)", 1, [3, 6]);
  g.globalCompositeOperation = "lighter";
  const r = rng(42);
  for (let i = 0; i < 80; i++) {
    const host = i < 30 ? LG[0] : i < 58 ? LG[1] : null, rr = host ? Math.abs(gauss(r)) * 0.035 : 0.12 + r() * 0.3, a = r() * TAU;
    const x = (host ? host[0] : 0) + Math.cos(a) * rr, y = (host ? host[1] : 0) + Math.sin(a) * rr;
    glow(g, x, y, (2 + r() * 2) * v.u, [220, 210, 255], 0.55);
  }
  for (const [x, y, , D] of LG) glow(g, x, y, Math.max(D / o.D * 1.5, 10 * v.u), [200, 190, 255], 0.5);
  glow(g, -0.128, 0.034, 3 * v.u, [230, 230, 255], 0.9); glow(g, -0.132, 0.038, 2.5 * v.u, [230, 230, 255], 0.8);
  g.globalCompositeOperation = "source-over";
  for (const [x, y, name, D, key] of LG) {
    const sp = sprites.get(key), d = D / o.D;
    if (sp) { if (name === "Andromeda") g.drawImage(sp.cv, x - d / 2, y - d * 0.16, d, d * 0.32); else g.drawImage(sp.cv, x - d / 2, y - d / 2, d, d); }
    if (v.px > 160) txt(g, v, x, y, name, { dx: 10, dy: -10, color: "rgba(233,237,255,.85)" });
  }
  if (v.px > 200) { txt(g, v, -0.128, 0.034, "Magellanic Clouds", { dx: 8, dy: 12, color: "rgba(233,237,255,.6)" }); txt(g, v, 0, 0.5, "about 10 million light-years across · 80+ dwarf galaxies", { align: "center", dy: 12, color: "rgba(233,237,255,.6)" }); }
};
DRAW.virgo = (g, o, v) => {
  const s = sprite("virgo", () => {
    const S = SPR, c = mk(S), x = c.getContext("2d"), r = rng(87); x.translate(S / 2, S / 2); x.globalCompositeOperation = "lighter";
    glow(x, 0, 0, S * 0.45, [180, 150, 255], 0.12);
    const clumps = [[0, 0, 0.13, 0.55], [0.05, 0.26, 0.07, 0.2], [-0.12, -0.05, 0.06, 0.15], [0.2, -0.15, 0.08, 0.1]];
    for (let i = 0; i < 1500; i++) {
      const cl = r(); let acc = 0, k = 0; for (; k < clumps.length - 1; k++) { acc += clumps[k][3]; if (cl < acc) break; }
      const C = clumps[k], px = C[0] + gauss(r) * C[2], py = C[1] + gauss(r) * C[2]; if (Math.hypot(px, py) > 0.49) continue;
      const dens = Math.exp(-Math.hypot(px, py) / 0.12), ell = r() < 0.3 + 0.6 * dens, sz = S * (0.002 + Math.pow(r(), 6) * 0.012);
      if (ell) glow(x, px * S, py * S, sz * 1.8, [255, 220, 170], 0.7);
      else { x.save(); x.translate(px * S, py * S); x.rotate(r() * TAU); x.scale(1, 0.3 + r() * 0.7); glow(x, 0, 0, sz * 1.6, [170, 200, 255], 0.75); x.restore(); }
    }
    glow(x, 0, 0, S * 0.035, [255, 225, 180], 0.95); glow(x, 0, 0, S * 0.008, [255, 255, 240], 1);
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 220) txt(g, v, 0, 0, "M87 and its black hole", { dx: 16, dy: -12, color: "rgba(255,225,180,.9)" });
};
function webSprite(S, seed, voidR) {
  const c = mk(S), x = c.getContext("2d"), r = rng(seed); x.translate(S / 2, S / 2);
  const nodes = [];
  for (let i = 0; i < 150; i++) {
    let p = [(r() - 0.5) * 1.15, (r() - 0.5) * 1.15];
    if (voidR) { const d = Math.hypot(...p); if (d < voidR) { const k = (voidR + r() * 0.05) / (d || 1); p = [p[0] * k, p[1] * k]; } }
    nodes.push({ p, m: Math.pow(r(), 2) });
  }
  const pts = [];
  for (const n of nodes) {
    const near = nodes.filter((q) => q !== n).map((q) => [Math.hypot(q.p[0] - n.p[0], q.p[1] - n.p[1]), q]).sort((a, b) => a[0] - b[0]).slice(0, 3);
    for (const [d, q] of near) {
      if (d > 0.3) continue;
      const mx = (n.p[0] + q.p[0]) / 2 + gauss(r) * 0.04, my = (n.p[1] + q.p[1]) / 2 + gauss(r) * 0.04, cnt = Math.round(d * 900);
      for (let k = 0; k < cnt; k++) { const t = r(), a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, cc = t * t; pts.push([a * n.p[0] + b * mx + cc * q.p[0] + gauss(r) * 0.004, a * n.p[1] + b * my + cc * q.p[1] + gauss(r) * 0.004, 0]); }
    }
    const cn = 20 + n.m * 260; for (let k = 0; k < cn; k++) pts.push([n.p[0] + gauss(r) * 0.007 * (1 + n.m), n.p[1] + gauss(r) * 0.007 * (1 + n.m), 1]);
  }
  for (let k = 0; k < 2500; k++) { const p = [(r() - 0.5), (r() - 0.5)]; if (!voidR || Math.hypot(...p) > voidR * 0.8 || r() < 0.03) pts.push([p[0], p[1], 0]); }
  x.globalCompositeOperation = "lighter";
  for (const p of pts) { if (Math.abs(p[0]) > 0.5 || Math.abs(p[1]) > 0.5) continue; x.fillStyle = "rgba(140,100,255,.03)"; x.beginPath(); x.arc(p[0] * S, p[1] * S, S * 0.006, 0, TAU); x.fill(); }
  for (const p of pts) { if (Math.abs(p[0]) > 0.5 || Math.abs(p[1]) > 0.5) continue; x.fillStyle = p[2] ? "rgba(255,220,170,.75)" : "rgba(205,195,255,.45)"; x.fillRect(p[0] * S, p[1] * S, p[2] ? 1.4 : 1, p[2] ? 1.4 : 1); }
  return c;
}
DRAW.void = (g, o, v) => {
  const s = sprite("void", () => webSprite(SPR, 77, 0.3));
  if (s) { g.save(); g.beginPath(); g.arc(0, 0, 0.5, 0, TAU); g.clip(); g.drawImage(s, -0.5, -0.5, 1, 1); g.restore(); }
  ring(g, v, 0.3, "rgba(255,79,154,.35)", 1, [3, 6]);
  if (v.px > 200) txt(g, v, 0, 0, "almost empty: about 60 galaxies found inside", { align: "center", color: "rgba(233,237,255,.65)" });
};
DRAW.laniakea = (g, o, v) => {
  const s = sprite("laniakea", () => {
    const S = SPR, c = mk(S), x = c.getContext("2d"), r = rng(2014); x.translate(S / 2, S / 2);
    const A = [0.06, 0.04], bound = (a) => 0.43 * (1 + 0.22 * (fbm(Math.cos(a) * 1.5 + 4, Math.sin(a) * 1.5, 2, 3) - 0.5) * 2);
    x.globalCompositeOperation = "lighter";
    for (let i = 0; i < 4000; i++) { const a = r() * TAU, rr = Math.sqrt(r()) * bound(a) * 1.1, px = Math.cos(a) * rr, py = Math.sin(a) * rr; const d = fbm(px * 6, py * 6, 1, 3); if (d < 0.45) continue; const col = d > 0.62 ? [255, 170, 90] : d > 0.55 ? [124, 220, 160] : [124, 170, 255]; x.fillStyle = rgba(col, 0.55); x.fillRect(px * S, py * S, 1.6, 1.6); }
    x.lineWidth = Math.max(1, S / 600); x.lineCap = "round";
    for (let i = 0; i < 420; i++) {
      const a = r() * TAU, rr = Math.sqrt(r()) * bound(a); let px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      x.beginPath(); x.moveTo(px * S, py * S);
      for (let k = 0; k < 70; k++) {
        const dx = A[0] - px, dy = A[1] - py, d = Math.hypot(dx, dy) + 1e-3; if (d < 0.02) break;
        const cx = (fbm(px * 5, py * 5, 9, 2) - 0.5) * 1.2, cy = (fbm(px * 5 + 3, py * 5, 9, 2) - 0.5) * 1.2;
        px += (dx / d + cx) * 0.006; py += (dy / d + cy) * 0.006; x.lineTo(px * S, py * S);
      }
      x.strokeStyle = "rgba(235,240,255,.16)"; x.stroke();
    }
    x.beginPath(); for (let i = 0; i <= 160; i++) { const a = i / 160 * TAU, b = bound(a); i ? x.lineTo(Math.cos(a) * b * S, Math.sin(a) * b * S) : x.moveTo(Math.cos(a) * b * S, Math.sin(a) * b * S); }
    x.strokeStyle = "rgba(255,170,80,.75)"; x.lineWidth = Math.max(1.5, S / 400); x.stroke();
    glow(x, A[0] * S, A[1] * S, S * 0.05, [255, 220, 170], 0.8);
    return c;
  });
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 160) {
    const mx = -0.3, my = 0.18;
    g.strokeStyle = "#4ef0b8"; g.lineWidth = 1.5 * v.u; g.beginPath(); g.arc(mx, my, 6 * v.u, 0, TAU); g.stroke();
    txt(g, v, mx, my, "Milky Way", { dx: 10, color: "#4ef0b8", font: FONT_L });
    txt(g, v, 0.06, 0.04, "Great Attractor", { dx: 14, dy: -12, color: "rgba(255,225,180,.9)" });
  }
};
DRAW.web = (g, o, v) => {
  const s = sprite("web", () => webSprite(Math.min(1024, SPR * 1.25) | 0, 13, 0));
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  g.strokeStyle = "rgba(255,79,154,.2)"; g.lineWidth = 1 * v.u; g.strokeRect(-0.5, -0.5, 1, 1);
  if (v.px > 200) txt(g, v, -0.5, -0.5, "each dot is a galaxy group or cluster", { dx: 6, dy: -10, color: "rgba(233,237,255,.6)" });
};
const PLANCK_CMAP = [[0, [10, 30, 140]], [0.28, [40, 120, 255]], [0.5, [236, 236, 220]], [0.72, [255, 170, 60]], [1, [190, 30, 20]]];
function cmap(t) { t = clamp(t, 0, 1); for (let i = 1; i < PLANCK_CMAP.length; i++) if (t <= PLANCK_CMAP[i][0]) { const a = PLANCK_CMAP[i - 1], b = PLANCK_CMAP[i]; return mixc(a[1], b[1], (t - a[0]) / (b[0] - a[0])); } return PLANCK_CMAP[4][1]; }
DRAW.universe = (g, o, v) => {
  const s = sprite("universe", () => {
    const S = PSPR, c = mk(S), x = c.getContext("2d"), img = x.createImageData(S, S), d = img.data;
    for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
      const nx = (i + 0.5) / S * 2 - 1, ny = (j + 0.5) / S * 2 - 1, r2 = nx * nx + ny * ny; if (r2 > 1) continue;
      const nz = Math.sqrt(1 - r2), rr = Math.sqrt(r2);
      const n = fbm(nx * 9 + 3, ny * 9, nz * 9, 5) * 0.7 + fbm(nx * 30, ny * 30, nz * 30 + 5, 3) * 0.3;
      const col = cmap((n - 0.5) * 3.2 + 0.5), rim = smooth(0.8, 1, rr);
      const k = (j * S + i) * 4; d[k] = col[0]; d[k + 1] = col[1]; d[k + 2] = col[2]; d[k + 3] = 255 * (0.16 + 0.84 * rim) * Math.min(1, (1 - rr) * S * 0.5);
    }
    x.putImageData(img, 0, 0);
    const wsp = webSprite(S >> 1, 99, 0), tmp = mk(S), t = tmp.getContext("2d");
    t.globalAlpha = 0.55; t.drawImage(wsp, S * 0.12, S * 0.12, S * 0.76, S * 0.76); t.globalAlpha = 1;
    t.globalCompositeOperation = "destination-in";
    const m = t.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.4); m.addColorStop(0, "rgba(0,0,0,1)"); m.addColorStop(0.7, "rgba(0,0,0,.7)"); m.addColorStop(1, "rgba(0,0,0,0)");
    t.fillStyle = m; t.fillRect(0, 0, S, S);
    x.globalCompositeOperation = "lighter"; x.drawImage(tmp, 0, 0);
    glow(x, S / 2, S / 2, S * 0.03, [255, 255, 255], 1);
    return c;
  });
  g.globalCompositeOperation = "lighter"; glow(g, 0, 0, 0.62, [255, 140, 80], 0.2); g.globalCompositeOperation = "source-over";
  if (s) g.drawImage(s, -0.5, -0.5, 1, 1);
  if (v.px > 180) {
    g.strokeStyle = "#4ef0b8"; g.lineWidth = 1.5 * v.u; g.beginPath(); g.arc(0, 0, 7 * v.u, 0, TAU); g.stroke();
    txt(g, v, 0, 0, "You are here (the centre of your own observable universe)", { dx: 12, dy: 12, color: "#4ef0b8", font: FONT_L });
    txt(g, v, 0, -0.5, "the edge glows with the Cosmic Microwave Background (CMB): light from 380,000 years after the Big Bang", { align: "center", dy: -14, color: "rgba(255,200,150,.9)" });
    tick(g, v, 9 * v.u, 0, 0.5, 0, "rgba(233,237,255,.55)", 1, [4, 5]);
    txt(g, v, 0.27, 0, nice(COSMO.horizon / LY / 1e9) + " billion light-years to the edge (comoving)", { align: "center", dy: -10 });
  }
};

/* ============================== background ============================== */
// Colour of empty space per realm [z, base, glow]: purely decorative
const REALM_BG = [
  [-15.5, "#0e0314", "#3a0d3e"], [-11, "#050720", "#1c1a5e"], [-8.5, "#02121a", "#0a3a48"], [-5.5, "#03130e", "#0b3528"],
  [-2.5, "#061019", "#15263a"], [0.5, "#081122", "#1b2c4c"], [3.5, "#050b18", "#122544"], [6.5, "#020409", "#0a1530"],
  [9.5, "#020307", "#0f0c18"], [14, "#020206", "#0d0818"], [20, "#030209", "#140c2a"], [24, "#040309", "#170c22"], [27.6, "#080304", "#2c0f0a"]
];
const REALMS = [ // ruler bands
  [-15.5, -12, "Subatomic", "#ff4f9a"], [-12, -8.6, "Atoms", "#b18cff"], [-8.6, -6, "Molecules", "#7cc8ff"], [-6, -3.3, "Cells", "#4ef0b8"],
  [-3.3, 2.7, "Human scale", "#ffc24b"], [2.7, 6.3, "Landscapes", "#ff7a3d"], [6.3, 10.2, "Planets", "#9fd3ff"], [10.2, 15.2, "Solar System", "#4ef0b8"],
  [15.2, 19.8, "Stars", "#ffc24b"], [19.8, 23.6, "Galaxies", "#b18cff"], [23.6, 27.6, "Cosmic web", "#ff4f9a"]
];
function realmAt(z) { for (const r of REALMS) if (z < r[1]) return r; return REALMS[REALMS.length - 1]; }
function bgAt(z) {
  for (let i = 1; i < REALM_BG.length; i++) if (z <= REALM_BG[i][0]) { const a = REALM_BG[i - 1], b = REALM_BG[i], t = smooth(0, 1, (z - a[0]) / (b[0] - a[0])); return [mixc(hex(a[1]), hex(b[1]), t), mixc(hex(a[2]), hex(b[2]), t)]; }
  const l = REALM_BG[REALM_BG.length - 1]; return [hex(l[1]), hex(l[2])];
}
const DUST = (function () { const r = rng(77), a = []; for (let i = 0; i < 3 * 260; i++) { const ang = r() * TAU, rr = Math.sqrt(r()); a.push([Math.cos(ang) * rr, Math.sin(ang) * rr, r(), r()]); } return a; })();
const MOTE = [[177, 140, 255], [78, 240, 184]].map((col) => { const c = mk(32), x = c.getContext("2d"); glow(x, 16, 16, 16, col, 0.28); return c; });
function drawBackground(z) {
  const [b, gl] = bgAt(z), W = view.W, H = view.H;
  ctx.fillStyle = rgba(b, 1); ctx.fillRect(0, 0, W, H);
  const R = Math.max(W, H) * 0.75, gr = ctx.createRadialGradient(view.cx, view.cy, 0, view.cx, view.cy, R);
  gr.addColorStop(0, rgba(gl, 0.75)); gr.addColorStop(1, rgba(gl, 0)); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
  // Infinite-zoom particles: three layers, each cycling through one decade
  const wStars = smooth(6, 8.5, z) * (1 - 0.6 * smooth(24, 26.5, z)), wMotes = 1 - smooth(-4.5, -2, z);
  if (wStars < 0.01 && wMotes < 0.01) return;
  const R0 = Math.max(W, H) * 0.22;
  ctx.globalCompositeOperation = "lighter";
  for (let L = 0; L < 3; L++) {
    const q = ((-z + L / 3) % 1 + 1) % 1, sc = Math.pow(10, q), fade = Math.pow(Math.sin(Math.PI * q), 1.2);
    for (let i = L * 260; i < (L + 1) * 260; i++) {
      const p = DUST[i], x = view.cx + p[0] * sc * R0 * 2.2, y = view.cy + p[1] * sc * R0 * 2.2;
      if (x < -20 || y < -20 || x > W + 20 || y > H + 20) continue;
      if (wStars > 0.01) { const a = wStars * fade * (0.25 + 0.75 * p[2]); ctx.fillStyle = p[3] < 0.3 ? "rgba(255,226,190," + a + ")" : "rgba(210,225,255," + a + ")"; const s = 0.6 + p[2] * 1.3 * (0.6 + 0.4 * sc / 10); ctx.fillRect(x, y, s, s); }
      if (wMotes > 0.01 && p[3] < 0.35) { const rr = (2 + p[2] * 7) * (0.5 + sc * 0.2); ctx.globalAlpha = wMotes * fade * 0.5; ctx.drawImage(p[3] < 0.15 ? MOTE[0] : MOTE[1], x - rr, y - rr, rr * 2, rr * 2); ctx.globalAlpha = 1; }
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

/* ============================== overlays ============================== */
function drawSquares(z) {
  const { cx, cy, ref } = view;
  ctx.lineWidth = 1;
  for (let n = Math.floor(z) - 1; n <= Math.floor(z) + 1; n++) {
    const side = ref * Math.pow(10, n - z), a = smooth(ref * 0.05, ref * 0.2, side) * (1 - smooth(ref * 0.92, ref * 1.25, side)) * 0.5;
    if (a < 0.02) continue;
    const x0 = cx - side / 2, y0 = cy - side / 2, k = Math.min(18, side * 0.12);
    ctx.strokeStyle = "rgba(233,237,255," + a + ")"; ctx.beginPath();
    for (const [x, y, dx, dy] of [[x0, y0, 1, 1], [x0 + side, y0, -1, 1], [x0, y0 + side, 1, -1], [x0 + side, y0 + side, -1, -1]]) { ctx.moveTo(x + dx * k, y); ctx.lineTo(x, y); ctx.lineTo(x, y + dy * k); }
    ctx.stroke();
    ctx.font = '500 11px "JetBrains Mono", monospace'; ctx.fillStyle = "rgba(233,237,255," + a * 1.4 + ")"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
    ctx.fillText("10" + supStr(n) + " m", x0 + 2, y0 - 4);
  }
}
function drawScaleBar() {
  const ppm = view.ppm, target = 150 / ppm, e = Math.floor(Math.log10(target)), base = Math.pow(10, e);
  let L = base; for (const m of [1, 2, 5, 10]) if (m * base <= target * 1.3) L = m * base;
  const px = L * ppm, x = view.right - 22 - L * ppm, y = view.bottom - 18;
  ctx.strokeStyle = "rgba(233,237,255,.75)"; ctx.lineWidth = 1.5; ctx.beginPath();
  ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 5); ctx.stroke();
  ctx.font = '500 11px "JetBrains Mono", monospace'; ctx.fillStyle = "rgba(233,237,255,.85)"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0,0,0,.8)"; ctx.shadowBlur = 4; ctx.fillText(lenTxt(L), x, y - 7); ctx.shadowBlur = 0;
}
function drawLabels(vis) {
  const placed = [], L = view.left + 8, Rt = view.right - 8, T = view.top + 8, B = view.bottom - 30;
  const cand = vis.filter((q) => q.a > 0.45 && q.Dpx >= 2.5 && q.onScreen).sort((a, b) => (b === state.focusV) - (a === state.focusV) || b.Dpx - a.Dpx);
  for (const q of cand) {
    const o = q.o, big = q.Dpx >= 24, hpx = o.h * view.ppm;
    const name = o.name, size = lenTxt(o.size);
    const fn = big ? '600 13px "Space Grotesk", system-ui, sans-serif' : '500 11px "Space Grotesk", system-ui, sans-serif';
    ctx.font = fn; const tw = Math.max(ctx.measureText(name).width, big ? size.length * 6.6 : 0);
    let x = clamp(q.sx, L + tw / 2, Rt - tw / 2), y = q.sy + (big ? hpx / 2 + 18 : 12);
    if (y > B) y = big && q.sy - hpx / 2 - 30 > T ? q.sy - hpx / 2 - 30 : B;
    y = clamp(y, T + 10, B);
    const rect = [x - tw / 2 - 4, y - 10, x + tw / 2 + 4, y + (big ? 20 : 6)];
    if (placed.some((p) => rect[0] < p[2] && rect[2] > p[0] && rect[1] < p[3] && rect[3] > p[1])) continue;
    placed.push(rect);
    const col = CATS[o.cat] ? CATS[o.cat].color : "#fff";
    ctx.globalAlpha = q.a * (big ? 1 : 0.8);
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.shadowColor = "rgba(0,0,0,.9)"; ctx.shadowBlur = 6;
    ctx.fillStyle = q === state.focusV ? "#ffffff" : "rgba(233,237,255,.88)"; ctx.fillText(name, x, y);
    if (big) { ctx.font = '500 11px "JetBrains Mono", monospace'; ctx.fillStyle = col; ctx.fillText(size, x, y + 15); }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
}
function drawHover(q) {
  if (!q) return;
  const hw = q.o.w * view.ppm / 2 + 8, hh = q.o.h * view.ppm / 2 + 8, k = Math.min(14, hw * 0.4, hh * 0.4), col = CATS[q.o.cat].color;
  ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85; ctx.beginPath();
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { const x = q.sx + sx * hw, y = q.sy + sy * hh; ctx.moveTo(x - sx * k, y); ctx.lineTo(x, y); ctx.lineTo(x, y - sy * k); }
  ctx.stroke(); ctx.globalAlpha = 1;
}

/* ============================== render ============================== */
let VIS = [], lastT = performance.now(), dummy = null;
function render(now) {
  requestAnimationFrame(render);
  if (document.hidden) { lastT = now; return; }
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  state.t += dt; state.frame++;
  if (!state.flying) state.z += (state.zt - state.z) * (1 - Math.exp(-dt * 9));
  const z = state.z;
  view.ppm = view.ref / Math.pow(10, z);
  const sc = camS(z), ppm = view.ppm, maxDim = Math.max(view.W, view.H), ax = view.axis;
  genBudget = state.frame < 4 ? 3 : 1;
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.globalAlpha = 1;
  drawBackground(z);
  const vis = [];
  for (const o of OBJ) {
    const Dpx = o.D * ppm; if (Dpx < 1.2) continue;
    const aOut = 1 - smooth(2.2 * maxDim, 7 * maxDim, Dpx); if (aOut <= 0.01) continue;
    const off = (o.s - sc) * ppm, sx = view.cx + ax[0] * off, sy = view.cy + ax[1] * off;
    const bw = o.w * ppm * 0.8 + 30, bh = o.h * ppm * 0.8 + 30;
    if (sx + bw < 0 || sx - bw > view.W || sy + bh < 0 || sy - bh > view.H) continue;
    const onScreen = sx > view.left - 10 && sx < view.right + 10 && sy > view.top - 10 && sy < view.bottom + 10;
    vis.push({ o, sx, sy, Dpx, a: smooth(1.2, 5, Dpx) * aOut, onScreen });
  }
  vis.sort((a, b) => b.Dpx - a.Dpx);
  for (const q of vis) {
    const o = q.o, full = smooth(7, 14, q.Dpx), col = CATS[o.cat] ? hex(CATS[o.cat].color) : [255, 255, 255];
    if (full < 1) {
      ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = q.a * (1 - full); glow(ctx, q.sx, q.sy, 5 + q.Dpx * 0.4, col, 0.9);
      ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    }
    if (full > 0 && DRAW[o.draw]) {
      ctx.setTransform(view.dpr * q.Dpx, 0, 0, view.dpr * q.Dpx, view.dpr * q.sx, view.dpr * q.sy);
      const a = q.a * full; ctx.globalAlpha = a;
      try { DRAW[o.draw](ctx, o, { sx: q.sx, sy: q.sy, px: q.Dpx, u: 1 / q.Dpx, t: state.t, a, f: o === state.focus }); } catch (err) { if (!o._err) { o._err = 1; console.warn(o.id, err); } }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over"; ctx.setLineDash([]); ctx.shadowBlur = 0;
    }
  }
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  // focus: the on-screen object nearest its own anchor zoom
  let best = null, bd = Infinity;
  for (const q of vis) { if (!q.onScreen || q.a < 0.5 || q.Dpx < 16) continue; const d = Math.abs(q.o.za - z); if (d < bd) { bd = d; best = q; } }
  state.focusV = best; state.focus = best ? best.o : null;
  VIS = vis;
  drawSquares(z);
  drawHover(state.hover && vis.find((q) => q.o === state.hover.o));
  drawLabels(vis);
  drawScaleBar();
  if (!vis.some((q) => q.Dpx > 20 && q.onScreen)) {
    ctx.font = '500 13px "Space Grotesk", sans-serif'; ctx.textAlign = "center"; ctx.fillStyle = "rgba(233,237,255,.45)";
    ctx.fillText("Empty space at this scale · keep zooming", view.cx, view.cy);
  }
  // pre-generate sprites for objects about to appear
  if (genBudget > 0) {
    if (!dummy) dummy = mk(2).getContext("2d");
    for (const a of ANCH) {
      if (Math.abs(a.z - z) > 1.6 || a.o._warm) continue;
      a.o._warm = 1;
      try { DRAW[a.o.draw](dummy, a.o, { sx: 0, sy: 0, px: 1, u: 1, t: 0, a: 1 }); } catch (e) { /* ignore */ }
      if (genBudget <= 0) break;
    }
  }
  ui(z);
  state.ms = performance.now() - now;
  if (state.frame === 1) { const l = $("#loading"); if (l) { l.classList.add("done"); setTimeout(() => { l.style.display = "none"; }, 700); } }
}

/* ============================== UI ============================== */
const EL = {};
let lastUI = 0, lastFocus = null, lastHash = "", sliderHeld = false;
function ui(z) {
  const now = performance.now();
  // slider and ruler every frame (cheap)
  if (!sliderHeld) { EL.slider.value = z.toFixed(2); EL.slider.style.setProperty("--fill", ((z - Z_MIN) / (Z_MAX - Z_MIN) * 100) + "%"); }
  EL.sval.textContent = "10" + supStr(z.toFixed(1)) + " m";
  drawRuler(z);
  if (now - lastUI < 140) return;
  lastUI = now;
  const fovW = view.W / view.ppm;
  const fv = [["Metres", sciHTML(fovW) + " <small>m</small>"], ["Everyday units", lenParts(fovW).join(" <small>") + "</small>"],
    ["Kilometres", sciHTML(fovW / 1e3) + " <small>km</small>"], ["Miles", sciHTML(fovW / MILE) + " <small>mi</small>"],
    ["Astronomical units", sciHTML(fovW / AU) + " <small>AU</small>"], ["Light-years", sciHTML(fovW / LY) + " <small>ly</small>"],
    ["Parsecs", sciHTML(fovW / PC) + " <small>pc</small>"], ["Light crosses it in", timeTxt(fovW / C)]];
  EL.fov.innerHTML = fv.map(([k, v]) => '<div class="readout"><div class="k">' + k + '</div><div class="v">' + v + "</div></div>").join("");
  EL.written.textContent = writtenOut(fovW);
  { const [mm, ee] = sciParts(fovW, 4); EL.sciNow.innerHTML = mm + " × 10<sup>" + String(ee).replace("-", "−") + "</sup> m"; }
  if (state.focus !== lastFocus) { lastFocus = state.focus; updateFocus(state.focus); }
  updateAlso();
  // ruler aria + bubble
  const r = realmAt(z);
  EL.ruler.setAttribute("aria-valuenow", z.toFixed(1)); EL.ruler.setAttribute("aria-valuetext", "10 to the " + z.toFixed(1) + " metres, " + r[2]);
  const side = Math.pow(10, z);
  EL.bubPow.innerHTML = '<span class="sc-bub-realm" style="color:' + r[3] + '">' + r[2] + "</span>10<sup>" + z.toFixed(2).replace("-", "−") + "</sup> m";
  EL.bubRows.innerHTML = [["m", sciHTML(side)], ["km", sciHTML(side / 1e3)], ["AU", sciHTML(side / AU)], ["ly", sciHTML(side / LY)]].map(([u, v]) => "<div><span>" + u + "</span><b>" + v + "</b></div>").join("");
  // hash (when settled)
  if (!state.flying && Math.abs(state.z - state.zt) < 0.002 && !tour.on) {
    const hsh = "#" + Math.pow(10, z).toExponential(2).replace("e+", "e");
    if (hsh !== lastHash) { lastHash = hsh; try { history.replaceState(null, "", hsh); } catch (e) { /* file:// */ } }
  }
  EL.sheetTxt.textContent = state.focus ? "In view: " + state.focus.name + " · " + lenTxt(state.focus.size) : "10" + supStr(Math.round(z)) + " m";
}
function neighbours(o) { const i = ANCH.findIndex((a) => a.o === o); return [ANCH[i - 1] && ANCH[i - 1].o, ANCH[i + 1] && ANCH[i + 1].o]; }
function fitLine(n, what) { return (n >= 1e6 ? sciTxt(n, 2) : nice(n)) + " " + what; }
function updateFocus(o) {
  if (!o) { EL.focus.innerHTML = '<p class="hint">Nothing in focus at this scale. Keep zooming, or pick a landmark below.</p>'; EL.light.hidden = true; return; }
  EL.light.hidden = false;
  const cat = CATS[o.cat], [lp, nx] = neighbours(o), L = o.size;
  const fits = [];
  if (o.id !== "human") fits.push(L < 1.7 ? "≈ " + fitLine(1.7 / L, "of these in a row would match a 1.7 m person") : "≈ " + fitLine(L / 1.7, "people lying head to toe to span it"));
  if (nx) fits.push(nx.name + ": ≈ " + fitLine(nx.size / L, "times bigger"));
  if (lp) fits.push(lp.name + ": ≈ " + fitLine(L / lp.size, "times smaller"));
  EL.focus.innerHTML =
    '<div class="sc-f-head"><span class="sc-dot" style="--c:' + cat.color + '"></span><span class="sc-f-cat" style="color:' + cat.color + '">' + cat.label + "</span></div>" +
    "<h3>" + o.name + "</h3>" +
    '<div class="sc-f-size"><b>' + lenTxt(L) + "</b><span>" + o.what + "</span></div>" +
    '<div class="sc-f-sci">' + sciHTML(L, 4) + " m</div>" +
    "<p>" + o.text + "</p>" +
    '<ul class="sc-fit">' + fits.map((f) => "<li>" + f + "</li>").join("") + "</ul>" +
    '<p class="hint sc-src">Source: <a href="' + o.src.url + '" rel="noopener" target="_blank">' + o.src.label + "</a></p>";
  // light race
  const t = L / C;
  EL.lightT.textContent = timeTxt(t);
  EL.lightName.textContent = o.name.replace(/^The /, "the ").replace(/^(Distance|Width|Wavelength)/, (m) => m.toLowerCase());
  const pre = timeTxt(t).split(" ").pop();
  EL.lightFull.textContent = PREFIX_NAME[pre] ? "(" + PREFIX_NAME[pre] + ")" : "";
  let dur, sub;
  if (t >= 0.3 && t <= 8) { dur = t; sub = "Shown in real time."; }
  else { dur = 2.4; const f = t / dur; sub = f > 1 ? "Shown sped up " + sciTxt(f, 2) + " times." : "Shown slowed down " + sciTxt(1 / f, 2) + " times."; }
  EL.lightSub.textContent = sub;
  EL.lightCtx.textContent = lightContext(t, L);
  EL.photon.style.setProperty("--dur", dur.toFixed(3) + "s");
  EL.photon.classList.remove("run"); void EL.photon.offsetWidth; if (!reduce) EL.photon.classList.add("run");
}
let lastAlsoKey = "";
function updateAlso() {
  const list = VIS.filter((q) => q.onScreen && q.a > 0.4 && q.Dpx >= 6 && q.o !== state.focus).sort((a, b) => a.o.D - b.o.D).slice(-7);
  const key = list.map((q) => q.o.id).join(",");
  if (key === lastAlsoKey) return; lastAlsoKey = key;
  EL.alsoH.hidden = !list.length;
  const f = state.focus;
  EL.also.innerHTML = list.map((q) => {
    const o = q.o, c = CATS[o.cat].color, rel = f ? (o.size > f.size ? nice(o.size / f.size) + "× bigger" : nice(f.size / o.size) + "× smaller") : "";
    return '<li><button data-id="' + o.id + '"><span class="sc-dot" style="--c:' + c + '"></span><span class="n">' + o.name + '</span><span class="s">' + lenTxt(o.size) + '</span><span class="r">' + (rel ? rel + " · " : "") + "light: " + timeTxt(o.size / C) + "</span></button></li>";
  }).join("");
}

/* ------------------------------ ruler ------------------------------ */
let rulerH = 0, rulerW = 0;
const rz2y = (z) => rulerPad + (Z_MAX - z) / (Z_MAX - Z_MIN) * (rulerH - 2 * rulerPad);
const ry2z = (y) => Z_MAX - (y - rulerPad) / (rulerH - 2 * rulerPad) * (Z_MAX - Z_MIN);
let rulerPad = 14, rulerLast = null;
function drawRuler(z) {
  const c = EL.rulerCv, g = c.getContext("2d");
  if (rulerLast !== null && Math.abs(rulerLast - z) < 1e-4) return;
  rulerLast = z;
  g.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); g.clearRect(0, 0, rulerW, rulerH);
  const narrow = rulerW < 60;
  for (const r of REALMS) { const y0 = rz2y(r[1]), y1 = rz2y(r[0]); g.fillStyle = r[3]; g.globalAlpha = z >= r[0] && z < r[1] ? 0.95 : 0.35; g.fillRect(6, y0 + 1, 3, y1 - y0 - 2); }
  g.globalAlpha = 1;
  g.font = '500 10px "JetBrains Mono", monospace'; g.textBaseline = "middle"; g.textAlign = "left";
  for (let n = Math.ceil(Z_MIN); n <= Math.floor(Z_MAX); n++) {
    const y = rz2y(n), major = n % 3 === 0, near = Math.abs(n - z) < 0.5;
    g.strokeStyle = near ? "rgba(255,255,255,.9)" : "rgba(200,210,255," + (major ? 0.5 : 0.25) + ")"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(13, y + 0.5); g.lineTo(13 + (major ? 9 : 5), y + 0.5); g.stroke();
    if (major && !narrow) { g.fillStyle = near ? "#fff" : "rgba(200,210,255,.6)"; g.fillText("10" + supStr(n), 26, y); }
  }
  if (!narrow) for (const a of ANCH) { const y = rz2y(Math.log10(a.o.size)); g.fillStyle = CATS[a.o.cat].color; g.globalAlpha = a.o === state.focus ? 1 : 0.55; g.beginPath(); g.arc(rulerW - 9, y, a.o === state.focus ? 3 : 1.8, 0, TAU); g.fill(); }
  g.globalAlpha = 1;
  const y = rz2y(z);
  const gr = g.createLinearGradient(0, 0, rulerW, 0); gr.addColorStop(0, "rgba(124,200,255,0)"); gr.addColorStop(0.3, "rgba(124,200,255,.9)"); gr.addColorStop(1, "rgba(177,140,255,.9)");
  g.fillStyle = gr; g.fillRect(2, y - 1, rulerW - 4, 2);
  g.shadowColor = "#7cc8ff"; g.shadowBlur = 10; g.fillStyle = "#fff"; g.beginPath(); g.moveTo(rulerW - 2, y); g.lineTo(rulerW - 9, y - 5); g.lineTo(rulerW - 9, y + 5); g.closePath(); g.fill(); g.shadowBlur = 0;
  EL.bubble.style.transform = "translateY(" + (y - 0) + "px) translateY(-50%)";
}

/* ============================== controls ============================== */
function clampZ(z) { return clamp(z, Z_MIN, Z_MAX); }
function stopFly() { if (state.flying) { state.flying.kill(); state.flying = null; } }
function fly(z, dur) {
  stopFly(); z = clampZ(z);
  const d = dur ?? clamp(0.9 + Math.abs(z - state.z) * 0.22, 1, 5);
  if (reduce || !gsap) { state.z = state.zt = z; return Promise.resolve(); }
  return new Promise((res) => {
    const o = { z: state.z };
    state.flying = gsap.to(o, { z, duration: d, ease: "power2.inOut", onUpdate() { state.z = state.zt = o.z; }, onComplete() { state.flying = null; res(); } });
  });
}
function flyTo(id) { const o = BY[id]; if (o) fly(o.za); }
function userInput() { stopFly(); if (tour.on) endTour(); }
function pick(x, y) {
  let best = null;
  for (const q of VIS) {
    if (q.a < 0.3 || q.Dpx < 10) continue;
    const hw = Math.max(q.o.w * view.ppm / 2, 8), hh = Math.max(q.o.h * view.ppm / 2, 8);
    if (Math.abs(x - q.sx) <= hw && Math.abs(y - q.sy) <= hh && (!best || q.o.D < best.o.D)) best = q;
  }
  return best;
}
function bindControls() {
  const stage = $("#stage");
  stage.addEventListener("wheel", (e) => {
    e.preventDefault(); userInput();
    const k = e.deltaMode === 1 ? 0.05 : e.deltaMode === 2 ? 1 : 0.0016;
    state.zt = clampZ(state.zt + clamp(e.deltaY, -240, 240) * k * (e.ctrlKey ? 3 : 1));
  }, { passive: false });
  const ptrs = new Map(); let pinch = null, drag = null;
  stage.addEventListener("pointerdown", (e) => {
    stage.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: state.z }; drag = null; userInput(); }
    else drag = { x: e.clientX, y: e.clientY, z: state.zt, moved: false };
  });
  stage.addEventListener("pointermove", (e) => {
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size >= 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]); state.z = state.zt = clampZ(pinch.z - Math.log10(d / pinch.d)); return; }
    if (drag && ptrs.size === 1) {
      const dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(e.clientX - drag.x, dy) > 6) { drag.moved = true; userInput(); }
      if (drag.moved) state.zt = clampZ(drag.z + dy * 0.008);
      return;
    }
    const q = pick(e.clientX, e.clientY); state.hover = q; stage.style.cursor = q ? "pointer" : "";
  });
  const up = (e) => {
    ptrs.delete(e.pointerId);
    if (ptrs.size < 2) pinch = null;
    if (drag && !drag.moved && ptrs.size === 0) { const q = pick(e.clientX, e.clientY); if (q) { userInput(); fly(q.o.za); } }
    if (ptrs.size === 0) drag = null;
  };
  stage.addEventListener("pointerup", up); stage.addEventListener("pointercancel", up);
  stage.addEventListener("pointerleave", () => { state.hover = null; });

  document.addEventListener("keydown", (e) => {
    const tg = e.target;
    if (tg && (tg.tagName === "INPUT" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT" || tg.isContentEditable)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    let d = 0;
    if (k === "ArrowUp" || k === "ArrowRight" || k === "+" || k === "=") d = 1;
    else if (k === "ArrowDown" || k === "ArrowLeft" || k === "-" || k === "_") d = -1;
    else if (k === "PageUp") d = 10; else if (k === "PageDown") d = -10;
    if (d) {
      if (tg && tg.closest && tg.closest(".sc-fly, .sc-index, .sc-also, .sc-tabs, .codex-nav")) { if (k.startsWith("Arrow")) return; }
      e.preventDefault(); userInput();
      if (e.shiftKey || Math.abs(d) === 10) fly(Math.round(state.zt) + Math.sign(d), 0.9); else state.zt = clampZ(state.zt + d * 0.1);
      return;
    }
    if (k === "Home") { e.preventDefault(); userInput(); flyTo("human"); }
    else if (k === "t" || k === "T") { tour.on ? endTour() : startTour(0); }
    else if (k === " " && tour.on) { e.preventDefault(); pauseTour(); }
    else if (k === "Escape" && tour.on) endTour();
  });
  EL.slider.addEventListener("pointerdown", () => { sliderHeld = true; userInput(); });
  window.addEventListener("pointerup", () => { sliderHeld = false; });
  EL.slider.addEventListener("input", () => { userInput(); state.zt = +EL.slider.value; });
  EL.slider.addEventListener("change", () => { sliderHeld = false; });
  // ruler: drag to scrub
  let rd = false;
  const rset = (e) => { const r = EL.rulerCv.getBoundingClientRect(); state.zt = clampZ(ry2z(e.clientY - r.top)); };
  EL.rulerCv.addEventListener("pointerdown", (e) => { rd = true; EL.rulerCv.setPointerCapture(e.pointerId); userInput(); rset(e); });
  EL.rulerCv.addEventListener("pointermove", (e) => { if (rd) rset(e); });
  EL.rulerCv.addEventListener("pointerup", () => { rd = false; });
  // panel lists
  const onPick = (e) => { const b = e.target.closest("button[data-id]"); if (b) { userInput(); flyTo(b.dataset.id); } };
  EL.also.addEventListener("click", onPick); $("#index").addEventListener("click", onPick); $("#fly").addEventListener("click", onPick);
  // tabs
  document.querySelectorAll(".sc-tabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".sc-tabs button").forEach((x) => { const on = x === b; x.setAttribute("aria-pressed", on); x.setAttribute("aria-selected", on); });
    document.querySelectorAll(".sc-tab").forEach((s) => { s.hidden = s.dataset.panel !== b.dataset.tab; });
  }));
  $("#sheetBtn").addEventListener("click", () => { const p = $("#panel"), c = p.classList.toggle("collapsed"); $("#sheetBtn").setAttribute("aria-expanded", !c); });
  $("#tourBtn").addEventListener("click", () => (tour.on ? endTour() : startTour(0)));
  $("#capPrev").addEventListener("click", () => goStep(Math.max(0, tour.i - 1)));
  $("#capNext").addEventListener("click", () => goStep(tour.i + 1));
  $("#capPause").addEventListener("click", pauseTour);
  $("#capStop").addEventListener("click", endTour);
  window.addEventListener("hashchange", () => { const z = parseHash(); if (z !== null) fly(z); });
  window.addEventListener("resize", resize);
}
function parseHash() {
  const h = decodeURIComponent(location.hash.slice(1)).trim();
  if (!h) return null;
  if (BY[h]) return BY[h].za;
  const m = h.match(/^z=(-?[\d.]+)$/); if (m) return clampZ(+m[1]);
  const v = parseFloat(h.replace(/^1e/i, "1e"));
  if (isFinite(v) && v > 0 && /^[\d.]+(e[+-]?\d+(\.\d+)?)?$/i.test(h)) {
    const mm = h.match(/^([\d.]+)e([+-]?\d+(?:\.\d+)?)$/i);
    return clampZ(mm ? Math.log10(+mm[1]) + +mm[2] : Math.log10(v));
  }
  return null;
}

/* ============================== tour ============================== */
const tour = { on: false, i: 0, paused: false, timer: null, bar: null };
function clearTourTimers() { if (tour.timer) tour.timer.kill(); if (tour.bar) tour.bar.kill(); tour.timer = tour.bar = null; }
function startTour(i) {
  tour.on = true; tour.paused = false; EL.caption.hidden = false; document.body.classList.add("sc-touring");
  $("#tourBtn").textContent = "■ Stop tour"; $("#capPause").textContent = "Pause";
  goStep(i || 0);
}
function goStep(i) {
  const steps = DATA.tour;
  if (!tour.on) return;
  if (i >= steps.length) { endTour(); return; }
  tour.i = i; tour.paused = false; $("#capPause").textContent = "Pause";
  clearTourTimers();
  const st = steps[i], o = BY[st.id];
  $("#capStep").textContent = (i + 1) + " / " + steps.length;
  EL.capText.textContent = st.text;
  EL.capBar.style.width = "0%";
  if (gsap && !reduce) gsap.fromTo(EL.capText, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" });
  const dz = Math.abs(o.za - state.z);
  fly(o.za, st.fast ? 5 : clamp(1.4 + dz * 0.5, 1.6, 6)).then(() => {
    if (!tour.on || tour.i !== i || tour.paused) return;
    if (!gsap) { tour.timer = { kill() { clearTimeout(this.h); }, h: setTimeout(() => goStep(i + 1), st.hold * 1000) }; return; }
    tour.bar = gsap.fromTo(EL.capBar, { width: "0%" }, { width: "100%", duration: st.hold, ease: "none" });
    tour.timer = gsap.delayedCall(st.hold, () => goStep(i + 1));
  });
}
function pauseTour() {
  if (!tour.on) return;
  if (tour.paused) { goStep(tour.i); return; }
  tour.paused = true; clearTourTimers(); stopFly(); $("#capPause").textContent = "Resume";
}
function endTour() {
  tour.on = false; clearTourTimers(); stopFly();
  EL.caption.hidden = true; document.body.classList.remove("sc-touring");
  $("#tourBtn").textContent = "▶ Tour";
}

/* ============================== setup ============================== */
function measure() {
  view.W = innerWidth; view.H = innerHeight; view.dpr = Math.min(window.devicePixelRatio || 1, 2);
  const mobile = view.W <= 820, nav = 60;
  const title = $(".sc-title").getBoundingClientRect(), dock = $(".sc-dock").getBoundingClientRect(), panel = $("#panel").getBoundingClientRect();
  // ruler geometry
  const rTop = mobile ? title.bottom + 10 : title.bottom + 12;
  const rBottom = mobile ? view.H - dock.top + 10 : 16;
  EL.ruler.style.top = rTop + "px"; EL.ruler.style.bottom = rBottom + "px";
  const rr = EL.ruler.getBoundingClientRect();
  rulerW = rr.width; rulerH = rr.height;
  EL.rulerCv.width = Math.round(rulerW * view.dpr); EL.rulerCv.height = Math.round(rulerH * view.dpr);
  EL.rulerCv.style.width = rulerW + "px"; EL.rulerCv.style.height = rulerH + "px";
  rulerLast = null;
  if (mobile) { view.left = rr.right + 4; view.right = view.W - 6; view.top = title.bottom + 6; view.bottom = dock.top - 6; }
  else { view.left = rr.right + 8; view.right = panel.left - 8; view.top = nav + 4; view.bottom = dock.top - 8; }
  view.cx = (view.left + view.right) / 2; view.cy = (view.top + view.bottom) / 2;
  const fw = view.right - view.left, fh = view.bottom - view.top;
  view.ref = Math.max(120, Math.min(fw, fh) * 0.98);
  view.portrait = fw < fh * 0.8;
  view.axis = view.portrait ? [0, -1] : [1, 0];
  cv.width = Math.round(view.W * view.dpr); cv.height = Math.round(view.H * view.dpr);
  cv.style.width = view.W + "px"; cv.style.height = view.H + "px";
}
function resize() { const wasP = view.portrait; measure(); if (wasP !== view.portrait || !ANCH.length) layout(); }
function buildUI() {
  const fly = OBJ.filter((o) => o.fly).sort((a, b) => a.D - b.D);
  $("#fly").innerHTML = fly.map((o) => '<button class="sc-chip" data-id="' + o.id + '" style="--c:' + CATS[o.cat].color + '" title="Fly to: ' + o.name + '">' + o.fly + "</button>").join("");
  $("#index").innerHTML = OBJ.slice().sort((a, b) => a.size - b.size).map((o) => '<li><button data-id="' + o.id + '"><span class="sc-dot" style="--c:' + CATS[o.cat].color + '"></span><span class="n">' + o.name + '</span><span class="s">' + lenTxt(o.size) + "</span></button></li>").join("");
  // Big ideas: live numbers
  const rp = 0.84075e-15, ra = 5.29177e-11, fAtom = Math.pow(rp / ra, 3);
  $("#emptyAtom").innerHTML = sciHTML(fAtom, 2);
  $("#emptyAtom2").textContent = (100 * (1 - fAtom)).toFixed(13).replace(/0+$/, "") + "%";
  const marbleR = 0.5e-2 / rp * ra; // 1 cm marble for the proton
  $("#marbleAtom").textContent = "Blow a proton up to a 1 cm marble and its hydrogen atom's Bohr radius would be " + nice(marbleR) + " m: the marble would sit alone in a cloud " + lenTxt(marbleR * 2) + " across, wider than six football pitches laid end to end.";
  const vol = (d) => Math.PI / 6 * d * d * d;
  const matter = vol(1.3914e9) + [4879, 12104, 12742, 6779, 139820, 116460, 50724, 49244].reduce((s, d) => s + vol(d * 1e3), 0);
  const fSol = matter / vol(2 * 30.07 * AU);
  $("#emptySol").innerHTML = sciHTML(fSol, 2);
  const k = 0.13 / 1.3914e9; // Sun as a 13 cm grapefruit
  $("#grapeStar").textContent = nice(4.134e16 * k / 1e3) + " km";
  $("#grapeSol").textContent = "Shrink the Sun to a 13 cm grapefruit and Earth becomes a " + nice(1.2742e7 * k * 1e3) + " mm grain " + nice(AU * k) + " m away; Neptune orbits " + nice(30.07 * AU * k) + " m out, and the next grapefruit-sized star, Alpha Centauri, is " + nice(4.134e16 * k / 1e3) + " km away.";
  $("#dHorizon").innerHTML = nice(COSMO.horizon / LY / 1e9) + " <small>billion ly</small>";
  $("#ageU").innerHTML = nice(COSMO.age / 31557600 / 1e9) + " <small>billion yr</small>";
  $("#dCMB").innerHTML = nice(COSMO.cmb / LY / 1e9) + " <small>billion ly</small>";
  $("#dCMBthen").innerHTML = nice(COSMO.cmbThen / LY / 1e6) + " <small>million ly</small>";
  if (window.katex) document.querySelectorAll("[data-tex]").forEach((el) => { try { window.katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false }); } catch (e) { el.textContent = el.dataset.tex; } });
}
async function init() {
  Object.assign(EL, {
    slider: $("#slider"), sval: $("#sval"), fov: $("#fov"), focus: $("#focus"), also: $("#also"), alsoH: $("#alsoH"), light: $("#light"),
    lightT: $("#lightT"), lightSub: $("#lightSub"), lightCtx: $("#lightCtx"), lightName: $("#lightName"), lightFull: $("#lightFull"), photon: $("#photon"),
    written: $("#written"), sciNow: $("#sciNow"), ruler: $("#ruler"), rulerCv: $("#rulerCv"), bubble: $("#bubble"), bubPow: $("#bubPow"), bubRows: $("#bubRows"),
    caption: $("#caption"), capText: $("#capText"), capBar: $("#capBar"), sheetTxt: $("#sheetTxt")
  });
  const res = await fetch("data/scale.json");
  DATA = await res.json();
  CATS = DATA.cats;
  OBJ = DATA.objects.map((o) => { const w = o.w || o.size, h = o.h || o.size; return { ...o, w, h, D: Math.max(w, h) }; });
  OBJ.forEach((o) => (BY[o.id] = o));
  if (BY.sedna) BY.sedna.h = Math.max(BY.sedna.h, 8.0e13), BY.sedna.D = Math.max(BY.sedna.w, BY.sedna.h);
  await loadLand(DATA.geo.earthMask);
  SPR = clamp(Math.pow(2, Math.ceil(Math.log2(Math.min(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2) * 0.8))), 256, 1024);
  PSPR = clamp(Math.round(Math.min(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2) * 0.72 / 64) * 64, 256, 896);
  if (innerWidth <= 820) $("#panel").classList.add("collapsed"), $("#sheetBtn").setAttribute("aria-expanded", "false");
  measure(); layout(); buildUI(); bindControls();
  const hz = parseHash();
  state.z = state.zt = hz !== null ? hz : BY.human.za;
  window.__sim = {
    setScale(z) { stopFly(); state.z = state.zt = clampZ(+z); return state.z; },
    getScale: () => state.z,
    stats: () => ({ frame: state.frame, ms: state.ms, sprites: sprites.size }),
    fly: (x) => (typeof x === "string" ? flyTo(x) : fly(+x)),
    tour: () => startTour(0), endTour, objects: OBJ, view, cosmo: COSMO,
    anchor: (id) => BY[id] && BY[id].za
  };
  requestAnimationFrame(render);
}
init().catch((e) => { console.error(e); const l = $("#loading"); if (l) l.textContent = "Could not load the scale data."; });
