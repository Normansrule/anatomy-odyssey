/* Orbit Lab — five interactive orbital-mechanics experiments drawn on one
 * high-DPI 2D canvas.
 *
 *   1 Newton's cannonball   velocity-Verlet integration around Earth
 *   2 Kepler's laws         exact Kepler-equation motion + equal-area wedges
 *   3 Hohmann transfer      vis-viva Δv, animated transfer (and bi-elliptic)
 *   4 Gravity assist        leapfrog through a Jupiter flyby, two frames
 *   5 Lagrange points       circular restricted three-body problem (CR3BP)
 *
 * Constants and their sources:
 *   μ_Earth  = 398,600.4418 km³/s²      IERS Conventions (2010), GM of Earth
 *   R_Earth  = 6,371.0 km (mean)        IUGG mean radius; 6,378.137 km equatorial (WGS 84)
 *   μ_Sun    = 1.32712440018e11 km³/s²  JPL DE405 / IAU 2009 system of constants
 *   1 AU     = 149,597,870.7 km          IAU 2012 Resolution B2
 *   μ_Jupiter= 1.26686534e8 km³/s²      NASA Jupiter Fact Sheet (GM)
 *   R_Jupiter= 71,492 km (equatorial)   NASA Jupiter Fact Sheet
 *   V_Jupiter= 13.06 km/s (mean orbital) NASA Jupiter Fact Sheet
 *   Moon/(Earth+Moon) = 0.012150585     JPL DE430 Earth/Moon mass ratio 81.30056907
 *   (Earth+Moon)/(Sun+Earth+Moon) ≈ 3.0404e-6   from the GM values above
 *   r_GEO    = 42,164 km                 geostationary radius
 *   Planet elements (a, e): JPL Solar System Dynamics, J2000 mean elements.
 */

const TAU = Math.PI * 2;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const REDUCE = !!(window.Codex && window.Codex.reducedMotion);
const K = window.katex;

/* ---------------- physical constants ---------------- */
const MU_E = 398600.4418;          // km^3/s^2
const R_E = 6371.0;                // km, mean radius (cannonball "surface")
const R_E_EQ = 6378.137;           // km, WGS 84 equatorial radius (orbit altitudes)
const MU_S = 1.32712440018e11;     // km^3/s^2
const AU = 149597870.7;            // km
const MU_J = 1.26686534e8;         // km^3/s^2
const R_J = 71492;                 // km
const V_J = 13.06;                 // km/s
const R_GEO = 42164.0;             // km
const MU_EM = 0.012150585;         // Moon / (Earth + Moon)
const MU_SE = 3.0404e-6;           // (Earth + Moon) / total
const A_EM = 384400;               // km, mean Earth–Moon distance
const YEAR = 365.25 * 86400;       // s, Julian year

/* ---------------- formatting ---------------- */
function fmt(v, d = 2) {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
}
const tn = (v, d = 2) => fmt(v, d).replace(/,/g, "{,}");
function fmtDur(s) {
  if (!Number.isFinite(s)) return "∞";
  const d = s / 86400, y = d / 365.25, h = s / 3600, m = s / 60;
  if (y >= 2) return fmt(y, y < 20 ? 1 : 0) + " yr";
  if (d >= 2) return fmt(d, d < 20 ? 1 : 0) + " days";
  if (h >= 2) return fmt(h, 2) + " h";
  if (m >= 1) return fmt(m, 0) + " min";
  return fmt(s, 0) + " s";
}
function setV(id, html) { const el = typeof id === "string" ? document.getElementById(id) : id; if (el && el._h !== html) { el._h = html; el.innerHTML = html; } }
const u = (x) => `<small>${x}</small>`;

/* KaTeX helpers ----------------------------------------------------------- */
function tex(el, s, display = false) {
  if (!el || el._tex === s) return;
  el._tex = s;
  if (K) K.render(s, el, { throwOnError: false, displayMode: display });
  else el.textContent = s;
}
function renderStaticTex() {
  $$(".tex").forEach((el) => tex(el, el.getAttribute("data-tex")));
}
function live(id, rows, verdict, color) {
  const box = document.getElementById(id);
  if (!box) return;
  while (box.children.length < rows.length + 1) {
    const d = document.createElement("div");
    d.className = box.children.length < rows.length ? "row-eq" : "verdict";
    box.appendChild(d);
  }
  // make sure the last child is the verdict
  const kids = box.children;
  for (let i = 0; i < rows.length; i++) { kids[i].className = "row-eq"; tex(kids[i], rows[i]); }
  const v = kids[rows.length];
  v.className = "verdict";
  if (v._t !== verdict) { v._t = verdict; v.innerHTML = verdict || ""; }
  v.style.color = color || "";
  for (let i = rows.length + 1; i < kids.length; i++) kids[i].remove();
}

/* ---------------- colour ---------------- */
const COL = { ice: "#7cc8ff", flame: "#ff7a3d", nebula: "#b18cff", plasma: "#ff4f9a", aurora: "#4ef0b8", sol: "#ffc24b", text: "#e9edff", text2: "#c3cae6", muted: "#8f98bd", faint: "#5d6589" };
function rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgba(h, a) { const c = rgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }
function ramp(stops, t) {
  t = clamp(t, 0, 1);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const k = (t - a[0]) / (b[0] - a[0] || 1);
      const ca = a[2] || (a[2] = rgb(a[1])), cb = b[2] || (b[2] = rgb(b[1]));
      return [lerp(ca[0], cb[0], k), lerp(ca[1], cb[1], k), lerp(ca[2], cb[2], k)];
    }
  }
  const l = stops[stops.length - 1]; return l[2] || (l[2] = rgb(l[1]));
}
const rampCss = (stops, t, a = 1) => { const c = ramp(stops, t); return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`; };
const SPEED_RAMP = [[0, "#ff5a3d"], [0.3, "#ff8a3d"], [0.46, "#ffc24b"], [0.5, "#4ef0b8"], [0.56, "#6fe0e8"], [0.66, "#7cc8ff"], [0.84, "#b18cff"], [0.87, "#ff4f9a"], [1, "#ff8ad8"]];
const FLOW_RAMP = [[0, "#3d7bff"], [0.35, "#7cc8ff"], [0.6, "#4ef0b8"], [0.8, "#ffc24b"], [1, "#ff5a3d"]];
const FIELD_RAMP = [[0, "#ffe2a0"], [0.1, "#ffb067"], [0.24, "#f06a7a"], [0.4, "#b24aa8"], [0.56, "#6a3db8"], [0.72, "#2f2f8f"], [0.86, "#121a4e"], [1, "#05071a"]];

/* ---------------- canvas ---------------- */
const cv = $("#cv");
// Headless test browsers (SwiftShader) rasterise GPU canvases very slowly; use a CPU canvas there.
const ctx = cv.getContext("2d", navigator.webdriver ? { willReadFrequently: true } : undefined);
let W = 0, H = 0, DPR = 1, sky = null;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cv.style.width = W + "px"; cv.style.height = H + "px";
  buildSky();
  measure(true);
}

function buildSky() {
  const c = document.createElement("canvas");
  c.width = cv.width; c.height = cv.height;
  const g = c.getContext("2d");
  g.scale(DPR, DPR);
  const bg = g.createRadialGradient(W * 0.55, H * 0.5, 0, W * 0.55, H * 0.5, Math.max(W, H) * 0.85);
  bg.addColorStop(0, "#0a0f22"); bg.addColorStop(0.55, "#060913"); bg.addColorStop(1, "#020308");
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const blobs = [[0.18, 0.3, 0.55, "#3a2a8f", 0.2], [0.82, 0.75, 0.6, "#0f3a6b", 0.22], [0.62, 0.15, 0.35, "#5a1d5e", 0.12], [0.45, 0.9, 0.4, "#123f4a", 0.1]];
  for (const [x, y, r, col, a] of blobs) {
    const gr = g.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * Math.max(W, H));
    gr.addColorStop(0, rgba(col, a)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
  }
  let seed = 1337;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pal = ["#ffffff", "#cfe6ff", "#ffe9c7", "#bcd4ff", "#ffd2a6"];
  // faint Milky-Way band
  const nb = Math.round((W * H) / 700);
  for (let i = 0; i < nb; i++) {
    const t = rnd();
    const gx = (rnd() + rnd() + rnd() - 1.5) * 0.12;
    const x = t * W + gx * H * 0.4, y = H * (0.95 - t * 0.9) + gx * W * 0.35;
    g.globalAlpha = 0.12 + rnd() * 0.25;
    g.fillStyle = pal[(rnd() * pal.length) | 0];
    g.fillRect(x, y, 0.7, 0.7);
  }
  const n = Math.round((W * H) / 1500);
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H, z = Math.pow(rnd(), 3);
    const r = 0.3 + z * 1.2;
    g.globalAlpha = 0.25 + 0.75 * z;
    g.fillStyle = pal[(rnd() * pal.length) | 0];
    g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    if (z > 0.8) {
      const gl = g.createRadialGradient(x, y, 0, x, y, r * 7);
      gl.addColorStop(0, "rgba(200,225,255,.35)"); gl.addColorStop(1, "rgba(200,225,255,0)");
      g.fillStyle = gl; g.globalAlpha = 0.7; g.fillRect(x - r * 7, y - r * 7, r * 14, r * 14);
    }
  }
  g.globalAlpha = 1;
  sky = c;
}

/* ---------------- procedural planet sprites ---------------- */
function hash3(x, y, z) {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x3c6ef372);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const a = xf * xf * (3 - 2 * xf), b = yf * yf * (3 - 2 * yf), c = zf * zf * (3 - 2 * zf);
  const n000 = hash3(xi, yi, zi), n100 = hash3(xi + 1, yi, zi), n010 = hash3(xi, yi + 1, zi), n110 = hash3(xi + 1, yi + 1, zi);
  const n001 = hash3(xi, yi, zi + 1), n101 = hash3(xi + 1, yi, zi + 1), n011 = hash3(xi, yi + 1, zi + 1), n111 = hash3(xi + 1, yi + 1, zi + 1);
  return lerp(lerp(lerp(n000, n100, a), lerp(n010, n110, a), b), lerp(lerp(n001, n101, a), lerp(n011, n111, a), b), c);
}
function fbm(x, y, z, o) {
  let s = 0, amp = 0.5, f = 1, n = 0;
  for (let i = 0; i < o; i++) { s += amp * vnoise(x * f + i * 17.31, y * f - i * 9.7, z * f + i * 3.3); n += amp; f *= 2.03; amp *= 0.5; }
  return s / n;
}
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const SPRITE_LIGHT = Math.atan2(0.32, 0.8); // screen angle of the light baked into sprites
const LVEC = (() => { const v = [0.8, 0.32, 0.5]; const l = Math.hypot(...v); return v.map((x) => x / l); })();
const CRATERS = (() => {
  let s = 99; const r = () => ((s = (s * 48271) % 2147483647) / 2147483647);
  const out = [];
  for (let i = 0; i < 70; i++) {
    const z = r() * 2 - 1, p = r() * TAU, q = Math.sqrt(1 - z * z);
    out.push([q * Math.cos(p), q * Math.sin(p), z, 0.03 + Math.pow(r(), 2.5) * 0.2]);
  }
  return out;
})();
const spriteCache = new Map();
function sprite(kind, px) {
  const S = px <= 64 ? 96 : px <= 150 ? 192 : px <= 320 ? 384 : 640;
  const key = kind + S;
  let c = spriteCache.get(key);
  if (c) return c;
  c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d");
  const img = g.createImageData(S, S); const d = img.data;
  const [lx, ly, lz] = LVEC;
  const hx = lx, hy = ly, hz = lz + 1, hl = Math.hypot(hx, hy, hz);
  for (let j = 0; j < S; j++) {
    for (let i = 0; i < S; i++) {
      const nx = ((i + 0.5) / S) * 2 - 1, ny = -(((j + 0.5) / S) * 2 - 1);
      const r2 = nx * nx + ny * ny;
      const dist = Math.sqrt(r2);
      const alpha = clamp((1 - dist) * S * 0.5 + 0.5, 0, 1);
      if (alpha <= 0) continue;
      const nz = Math.sqrt(Math.max(0, 1 - r2));
      const nl = nx * lx + ny * ly + nz * lz;
      let col, emissive = false, spec = 0, rimCol = null;
      if (kind === "earth") {
        const n = fbm(nx * 1.7 + 3.1, ny * 1.7, nz * 1.7, 6);
        const lat = Math.abs(ny);
        let ocean = false;
        if (n > 0.535) {
          const e = (n - 0.535) / 0.18;
          const dry = fbm(nx * 3 + 9, ny * 3, nz * 3, 3);
          col = mix3([58, 118, 60], [168, 146, 96], clamp(e * 1.2 + (dry - 0.5) * 2.2 + (lat < 0.4 ? 0.3 : -0.1), 0, 1));
          col = mix3(col, [128, 118, 108], clamp(e - 0.7, 0, 1));
        } else {
          ocean = true;
          col = mix3([38, 118, 178], [10, 36, 92], clamp((0.535 - n) / 0.12, 0, 1));
        }
        if (lat > 0.87 + (n - 0.5) * 0.3) { col = [236, 243, 250]; ocean = false; }
        const cl = fbm(nx * 2.4 + 11, ny * 4.2, nz * 2.4, 5);
        const ca = smooth(0.5, 0.68, cl) * 0.9;
        col = mix3(col, [248, 250, 255], ca);
        if (ocean) spec = (1 - ca) * Math.pow(Math.max(0, (nx * hx + ny * hy + nz * hz) / hl), 60) * 0.9;
        rimCol = [90, 160, 255];
      } else if (kind === "moon") {
        let b = 0.5 + (fbm(nx * 2.2 + 5, ny * 2.2, nz * 2.2, 5) - 0.5) * 0.7;
        b *= 1 - 0.32 * smooth(0.5, 0.6, fbm(nx * 1.2 + 20, ny * 1.2, nz * 1.2, 4));
        for (const cr of CRATERS) {
          const dd = Math.hypot(nx - cr[0], ny - cr[1], nz - cr[2]);
          if (dd < cr[3] * 1.2) {
            if (dd < cr[3]) b *= 0.84 + 0.16 * (dd / cr[3]);
            else b *= 1.12;
          }
        }
        col = [b * 232, b * 226, b * 218];
      } else if (kind === "mars") {
        const n = fbm(nx * 2 + 7, ny * 2, nz * 2, 5);
        col = mix3([200, 98, 56], [112, 46, 30], smooth(0.46, 0.62, n));
        col = mix3(col, [226, 156, 108], smooth(0.55, 0.72, fbm(nx * 4 + 2, ny * 4, nz * 4, 3)) * 0.45);
        if (ny > 0.9 + (n - 0.5) * 0.2) col = [240, 236, 230];
        rimCol = [255, 170, 120];
      } else if (kind === "jupiter") {
        const t = fbm(nx * 2.5 + 1, ny * 9, nz * 2.5, 4);
        const y = ny + (t - 0.5) * 0.14;
        const b1 = Math.sin(y * 19) * 0.5 + 0.5;
        const b2 = Math.sin(y * 47 + t * 6) * 0.5 + 0.5;
        col = mix3([232, 214, 180], [170, 112, 72], b1 * 0.8);
        col = mix3(col, [244, 232, 210], b2 * 0.22);
        const lon = Math.atan2(nx, nz);
        const dl = (ny + 0.36) / 0.075, dp = (lon - 0.35) / 0.17, q = dl * dl + dp * dp;
        if (q < 1.4) col = mix3(col, [200, 96, 62], clamp(1.2 - q, 0, 1) * 0.9);
        rimCol = [255, 220, 170];
      } else { // sun
        emissive = true;
        const gran = fbm(nx * 13, ny * 13, nz * 13, 3);
        const limb = 0.45 + 0.55 * Math.pow(nz, 0.55);
        col = mix3([255, 150, 50], [255, 246, 222], Math.pow(nz, 0.7));
        const k = limb * (0.92 + (gran - 0.5) * 0.28);
        col = [col[0] * k, col[1] * k, col[2] * k];
      }
      let R, G, B;
      if (emissive) { R = col[0]; G = col[1]; B = col[2]; }
      else {
        const lam = Math.max(0, nl);
        const lit = 0.035 + 1.0 * Math.pow(lam, 0.8);
        R = col[0] * lit + spec * 255; G = col[1] * lit + spec * 255; B = col[2] * lit + spec * 255;
        if (rimCol) {
          const rim = Math.pow(1 - nz, 2.6) * clamp(nl + 0.35, 0, 1) * 0.9;
          R += rimCol[0] * rim; G += rimCol[1] * rim; B += rimCol[2] * rim;
        }
      }
      const o = (j * S + i) * 4;
      d[o] = clamp(R, 0, 255); d[o + 1] = clamp(G, 0, 255); d[o + 2] = clamp(B, 0, 255); d[o + 3] = alpha * 255;
    }
  }
  g.putImageData(img, 0, 0);
  spriteCache.set(key, c);
  return c;
}

/* ---------------- drawing helpers ---------------- */
function drawBody(kind, x, y, r, lightAngle = SPRITE_LIGHT) {
  const img = sprite(kind, r * 2 * DPR);
  if (kind === "sun") {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    const g = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 5);
    g.addColorStop(0, "rgba(255,200,110,.55)"); g.addColorStop(0.25, "rgba(255,150,60,.16)"); g.addColorStop(1, "rgba(255,120,40,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 5, 0, TAU); ctx.fill();
    ctx.restore();
  } else if (kind === "earth") {
    const g = ctx.createRadialGradient(x, y, r * 0.92, x, y, r * 1.22);
    g.addColorStop(0, "rgba(110,180,255,.45)"); g.addColorStop(0.35, "rgba(90,150,255,.14)"); g.addColorStop(1, "rgba(80,140,255,0)");
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.22, 0, TAU); ctx.fill();
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(-(lightAngle - SPRITE_LIGHT));
  ctx.drawImage(img, -r, -r, 2 * r, 2 * r);
  ctx.restore();
}
function glowDot(x, y, r, col, core = "#fff") {
  ctx.save(); ctx.globalCompositeOperation = "lighter";
  const g = ctx.createRadialGradient(x, y, 0, x, y, r * 5);
  g.addColorStop(0, rgba(col, 0.9)); g.addColorStop(0.22, rgba(col, 0.32)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 5, 0, TAU); ctx.fill();
  ctx.restore();
  ctx.fillStyle = core; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function font(size, weight = 500, fam = "JetBrains Mono") { return `${weight} ${size}px "${fam}", ui-monospace, Consolas, monospace`; }
function pill(text, x, y, col = COL.text2, opts = {}) {
  const size = opts.size || 11.5;
  ctx.font = font(size, opts.weight || 500);
  const w = ctx.measureText(text).width, ph = size + 9, pw = w + 14;
  let ax = x, ay = y;
  const al = opts.align || "center";
  if (al === "center") ax = x - pw / 2; else if (al === "right") ax = x - pw;
  if (opts.valign === "top") ay = y; else if (opts.valign === "bottom") ay = y - ph; else ay = y - ph / 2;
  // keep inside the scene
  ax = clamp(ax, S.x + 4, S.x + S.w - pw - 4); ay = clamp(ay, S.y + 4, S.y + S.h - ph - 4);
  ctx.fillStyle = "rgba(6,9,20,.78)";
  ctx.strokeStyle = rgba(opts.border || col, 0.4); ctx.lineWidth = 1;
  roundRect(ax, ay, pw, ph, ph / 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = col; ctx.textBaseline = "middle"; ctx.textAlign = "left";
  ctx.fillText(text, ax + 7, ay + ph / 2 + 0.5);
  return { x: ax, y: ay, w: pw, h: ph };
}
function text(t, x, y, col, size = 11, align = "left", weight = 500, fam) {
  ctx.font = font(size, weight, fam); ctx.fillStyle = col; ctx.textAlign = align; ctx.textBaseline = "middle"; ctx.fillText(t, x, y);
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function arrow(x1, y1, x2, y2, col, w = 2, head = 8, glow = true) {
  const a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return;
  head = Math.min(head, len * 0.5);
  ctx.save();
  if (glow) { ctx.shadowColor = col; ctx.shadowBlur = 8; }
  ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = w; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2 - Math.cos(a) * head * 0.7, y2 - Math.sin(a) * head * 0.7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - Math.cos(a - 0.42) * head, y2 - Math.sin(a - 0.42) * head);
  ctx.lineTo(x2 - Math.cos(a + 0.42) * head, y2 - Math.sin(a + 0.42) * head);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
function strokePts(pts, toS, col, width = 1.6, glowW = 6, alpha = 1) {
  if (pts.length < 4) return;
  ctx.beginPath();
  let p = toS(pts[0], pts[1]); ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < pts.length; i += 2) { p = toS(pts[i], pts[i + 1]); ctx.lineTo(p[0], p[1]); }
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  if (glowW) {
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(col, 0.13 * alpha); ctx.lineWidth = glowW; ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = rgba(col, 0.95 * alpha); ctx.lineWidth = width; ctx.stroke();
}
function scaleBar(kmPerPx, unit = "km", scale = 1) {
  const target = 110 * kmPerPx;
  const p = Math.pow(10, Math.floor(Math.log10(target)));
  const nice = [1, 2, 5, 10].map((m) => m * p).filter((v) => v <= target).pop() || p;
  const px = nice / kmPerPx;
  const x = S.x + 18, y = S.y + S.h - 18;
  ctx.strokeStyle = "rgba(195,202,230,.6)"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y); ctx.lineTo(x + px, y); ctx.lineTo(x + px, y - 4); ctx.stroke();
  const v = nice / scale;
  text((v >= 1e6 ? fmt(v / 1e6, v / 1e6 < 10 ? 1 : 0) + " million " : fmt(v, v < 10 ? 1 : 0) + " ") + unit, x, y - 11, COL.muted, 10.5);
}
function setRange(el, v) {
  el.value = v;
  const min = +el.min || 0, max = +el.max || 100;
  el.style.setProperty("--fill", ((el.value - min) / (max - min)) * 100 + "%");
}
const logMap = (x, lo, hi) => lo * Math.pow(hi / lo, x / 1000);
const logInv = (v, lo, hi) => (1000 * Math.log(v / lo)) / Math.log(hi / lo);

/* ---------------- Kepler's equation ---------------- */
function keplerE(M, e) {
  M = ((M % TAU) + TAU) % TAU;
  let E = e < 0.8 ? M : Math.PI;
  for (let i = 0; i < 50; i++) {
    const f = E - e * Math.sin(E) - M, dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  return E;
}

/* ---------------- layout: the free "scene" rectangle between the HUD cards ---------------- */
const leftCol = $("#leftCol"), head = $("#head"), explain = $("#explain"), explainSlot = $("#explainSlot"), panel = $("#panel"), bar = $("#bar");
const S = { x: 0, y: 0, w: 100, h: 100, cx: 50, cy: 50 };
const ST = { x: 0, y: 0, w: 100, h: 100 };
let mobile = false, wide = true;
function measure(snap) {
  const w = innerWidth, h = innerHeight, nav = 60;
  wide = w > 1180; mobile = w <= 820;
  const want = wide ? leftCol : explainSlot;
  if (explain.parentElement !== want) want.appendChild(explain);
  const hr = head.getBoundingClientRect(), pr = panel.getBoundingClientRect();
  let x0, x1, y0, y1;
  if (mobile) {
    bar.style.top = hr.bottom + 8 + "px"; bar.style.left = "50%";
    const br = bar.getBoundingClientRect();
    x0 = 0; x1 = w; y0 = br.bottom + 2; y1 = pr.top - 2;
  } else {
    bar.style.top = "";
    const lr = explain.getBoundingClientRect();
    x0 = wide ? Math.max(hr.right, lr.right) + 6 : 0;
    y0 = wide ? nav + 6 : hr.bottom + 4;
    x1 = pr.left - 6;
    y1 = h - bar.offsetHeight - 26;
    bar.style.left = (x0 + x1) / 2 + "px";
  }
  ST.x = x0; ST.y = y0; ST.w = Math.max(120, x1 - x0); ST.h = Math.max(120, y1 - y0);
  if (snap) Object.assign(S, ST);
  S.cx = S.x + S.w / 2; S.cy = S.y + S.h / 2;
}
function easeScene(dt) {
  const k = 1 - Math.exp(-dt * 12);
  for (const key of ["x", "y", "w", "h"]) { S[key] = Math.abs(ST[key] - S[key]) < 0.3 ? ST[key] : lerp(S[key], ST[key], k); }
  S.cx = S.x + S.w / 2; S.cy = S.y + S.h / 2;
}
const sceneStable = () => Math.abs(S.w - ST.w) < 0.5 && Math.abs(S.h - ST.h) < 0.5 && Math.abs(S.x - ST.x) < 0.5 && Math.abs(S.y - ST.y) < 0.5;

/* =====================================================================
 * 1 · NEWTON'S CANNONBALL
 * ===================================================================== */
const cannon = (() => {
  const st = { v: 8.4, h: 400, warp: 1, pred: true, shots: [], box: null, flash: 0, last: null, demo: false, pending: [] };
  const el = { v: $("#cV"), vo: $("#cVo"), h: $("#cH"), ho: $("#cHo"), w: $("#cW"), wo: $("#cWo"), ticks: $("#cTicks"), pred: $("#cPred") };
  const BASE = 900; // simulated seconds per real second at the surface
  const r0 = () => R_E + st.h;
  const vc = () => Math.sqrt(MU_E / r0());
  const ve = () => Math.SQRT2 * vc();
  // colour keyed to the physics: orange = falls back, green = circular, blue→violet = ellipse, pink = escape
  const speedCol = (v) => { const c = vc(), e = ve(); const t = v < c ? 0.46 * (v / c) : v < e ? 0.5 + 0.34 * ((v - c) / (e - c)) : 0.87 + 0.13 * clamp((v - e) / 2, 0, 1); return ramp(SPEED_RAMP, Math.abs(v - c) < 0.012 ? 0.5 : t); };
  const colHex = (c) => "#" + c.map((x) => (x | 0).toString(16).padStart(2, "0")).join("");

  function classify(v) {
    const r = r0(), c = vc(), e = ve();
    if (v < 0.05) return { k: "drop", label: "Falls straight down", col: COL.flame, bound: true };
    if (Math.abs(v - e) < 0.012) return { k: "para", label: "Escape · parabolic (ε = 0)", col: COL.plasma, bound: false };
    if (v > e) return { k: "hyper", label: "Escape · hyperbolic", col: COL.plasma, bound: false };
    const a = 1 / (2 / r - (v * v) / MU_E);
    if (Math.abs(v - c) < 0.012) return { k: "circ", label: "Circular orbit", col: COL.aurora, bound: true, a, rp: r, ra: r };
    if (v < c) {
      const rp = 2 * a - r;
      if (rp < R_E) return { k: "sub", label: "Suborbital · falls back", col: COL.flame, bound: true, a, rp, ra: r };
      return { k: "ell", label: "Elliptical orbit (dips below summit)", col: COL.ice, bound: true, a, rp, ra: r };
    }
    return { k: "ell", label: "Elliptical orbit", col: COL.ice, bound: true, a, rp: r, ra: 2 * a - r };
  }

  // exact conic through the launch state (0, r0), velocity (v, 0)
  function conic(v) {
    const r = r0();
    if (v < 0.05) return { pts: [0, r, 0, R_E], hit: true, range: 0 };
    const p = (r * v) ** 2 / MU_E;
    const ey = ((v * v - MU_E / r) / MU_E) * r; // e-vector (0, ey): r·v = 0 at launch
    const e = Math.abs(ey), om = Math.atan2(ey, 0);
    const pts = [0, r];
    const lim = e >= 1 - 1e-9 ? 9 * R_E : 60 * R_E;
    let prevR = r, prevPhi = Math.PI / 2, hit = false, range = NaN;
    const N = 900;
    for (let i = 1; i <= N; i++) {
      const phi = Math.PI / 2 - (i / N) * TAU;
      const den = 1 + e * Math.cos(phi - om);
      if (den <= 1e-5) break;
      const rr = p / den;
      if (rr > lim) break;
      if (rr < R_E) {
        const f = (prevR - R_E) / (prevR - rr), ph = lerp(prevPhi, phi, f);
        pts.push(R_E * Math.cos(ph), R_E * Math.sin(ph));
        hit = true; range = R_E * (Math.PI / 2 - ph); break;
      }
      pts.push(rr * Math.cos(phi), rr * Math.sin(phi));
      prevR = rr; prevPhi = phi;
    }
    return { pts, hit, range };
  }
  let pred = null, predV = -1, predH = -1;
  function getPred() {
    if (predV !== st.v || predH !== st.h) { pred = conic(st.v); predV = st.v; predH = st.h; }
    return pred;
  }

  function acc(s) {
    const r2 = s.x * s.x + s.y * s.y, r = Math.sqrt(r2), k = -MU_E / (r2 * r);
    s.ax = k * s.x; s.ay = k * s.y; return r;
  }
  function fire(v = st.v) {
    const r = r0();
    const s = { x: 0, y: r, vx: v, vy: 0, ax: 0, ay: 0, t: 0, v0: v, cls: classify(v), col: colHex(speedCol(v)), pts: [0, r],
      rec: true, alive: true, swept: 0, ang: Math.PI / 2, end: null, bb: [0, 0, r, r], born: performance.now() };
    acc(s);
    st.shots.push(s);
    if (st.shots.length > 9) st.shots.shift();
    st.flash = 1; st.last = s;
  }
  function grow(s, r) {
    const lim = s.cls.bound ? 8 * R_E : 2.4 * R_E;
    if (r > lim) return;
    const b = s.bb;
    if (s.x < b[0]) b[0] = s.x; if (s.x > b[1]) b[1] = s.x; if (s.y < b[2]) b[2] = s.y; if (s.y > b[3]) b[3] = s.y;
  }
  function step(s, T) {
    let r = Math.hypot(s.x, s.y), left = T, guard = 0;
    while (left > 1e-9 && s.alive && guard++ < 8000) {
      const h = Math.min(left, 2 * Math.pow(r / R_E, 1.5), 400);
      // velocity Verlet
      s.x += s.vx * h + 0.5 * s.ax * h * h;
      s.y += s.vy * h + 0.5 * s.ay * h * h;
      const ax0 = s.ax, ay0 = s.ay;
      r = acc(s);
      s.vx += 0.5 * (ax0 + s.ax) * h; s.vy += 0.5 * (ay0 + s.ay) * h;
      s.t += h; left -= h;
      if (r < R_E && s.t > 1) {
        s.x *= R_E / r; s.y *= R_E / r; s.alive = false; s.end = "impact";
        if (s.rec) s.pts.push(s.x, s.y); s.rec = false; s.impactAt = performance.now();
        break;
      }
      const a = Math.atan2(s.y, s.x);
      let d = a - s.ang; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU;
      s.swept -= d; s.ang = a;
      if (s.rec) {
        if (s.swept >= TAU) { s.rec = false; s.end = "orbit"; s.pts.push(s.pts[0], s.pts[1]); }
        else {
          const n = s.pts.length, dx = s.x - s.pts[n - 2], dy = s.y - s.pts[n - 1];
          if (dx * dx + dy * dy > (R_E * 0.005) ** 2) { s.pts.push(s.x, s.y); grow(s, r); }
        }
      }
      if (r > 40 * R_E) { s.alive = false; s.end = "escape"; }
    }
  }

  function targetBox() {
    const b = [-1.3 * R_E, 1.3 * R_E, -1.3 * R_E, 1.3 * R_E];
    const add = (bb) => { b[0] = Math.min(b[0], bb[0]); b[1] = Math.max(b[1], bb[1]); b[2] = Math.min(b[2], bb[2]); b[3] = Math.max(b[3], bb[3]); };
    for (const s of st.shots) add(s.bb);
    if (st.pred) {
      const p = getPred(), c = classify(st.v);
      const lim = c.bound ? 8 * R_E : 2.4 * R_E;
      const bb = [0, 0, r0(), r0()];
      for (let i = 0; i < p.pts.length; i += 2) {
        const x = p.pts[i], y = p.pts[i + 1];
        if (x * x + y * y > lim * lim) continue;
        bb[0] = Math.min(bb[0], x); bb[1] = Math.max(bb[1], x); bb[2] = Math.min(bb[2], y); bb[3] = Math.max(bb[3], y);
      }
      add(bb);
    }
    // keep the box roughly centred on Earth horizontally (the ellipses are symmetric left-right)
    const mx = Math.max(-b[0], b[1]); b[0] = -mx; b[1] = mx;
    const padX = (b[1] - b[0]) * 0.06, padY = (b[3] - b[2]) * 0.08;
    return [b[0] - padX, b[1] + padX, b[2] - padY, b[3] + padY * 1.6];
  }
  let view = { sc: 1, bx: 0, by: 0 };
  function updateView(dt, snap) {
    const t = targetBox();
    if (!st.box || snap) st.box = t.slice();
    else { const k = 1 - Math.exp(-dt * 3.5); for (let i = 0; i < 4; i++) st.box[i] = lerp(st.box[i], t[i], k); }
    const b = st.box;
    view.sc = Math.min(S.w / (b[1] - b[0]), S.h / (b[3] - b[2]));
    view.bx = (b[0] + b[1]) / 2; view.by = (b[2] + b[3]) / 2;
  }
  const toS = (x, y) => [S.cx + (x - view.bx) * view.sc, S.cy - (y - view.by) * view.sc];

  function update(dt) {
    for (const p of st.pending) p.t -= dt;
    while (st.pending.length && st.pending[0].t <= 0) { const p = st.pending.shift(); fire(p.v); }
    for (const s of st.shots) {
      if (!s.alive) continue;
      const r = Math.hypot(s.x, s.y);
      step(s, dt * BASE * st.warp * Math.pow(r / R_E, 1.5));
    }
    st.flash = Math.max(0, st.flash - dt * 2.5);
    updateView(dt);
  }

  function drawMountain() {
    const h = st.h, phb = (h * 1.7 + 140) / R_E;
    const N = 40;
    const prof = (f) => h * Math.pow(1 - Math.abs(f), 1.5) * (1 + 0.07 * Math.sin(f * 23));
    const pt = (f) => { const ph = Math.PI / 2 + f * phb, r = R_E - 40 + prof(f) + 40 * (1 - Math.abs(f)); return toS(r * Math.cos(ph), r * Math.sin(ph)); };
    // lit (left, sun from upper-left) and shaded faces
    for (const side of [1, -1]) {
      ctx.beginPath();
      const base = toS(0, R_E - 60);
      ctx.moveTo(base[0], base[1]);
      for (let i = 0; i <= N; i++) { const p = pt((side * i) / N); ctx.lineTo(p[0], p[1]); }
      ctx.closePath();
      const top = toS(0, R_E + h), bot = toS(0, R_E);
      const g = ctx.createLinearGradient(top[0], top[1], bot[0], bot[1]);
      if (side > 0) { g.addColorStop(0, "#9aa3b8"); g.addColorStop(0.3, "#5d6479"); g.addColorStop(1, "#2b3142"); }
      else { g.addColorStop(0, "#c9d1e4"); g.addColorStop(0.3, "#7d8599"); g.addColorStop(1, "#3a4154"); }
      ctx.fillStyle = g; ctx.fill();
    }
    // snow cap
    ctx.beginPath();
    for (let i = -12; i <= 12; i++) { const p = pt(i / 60); i === -12 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
    ctx.closePath(); ctx.fillStyle = "rgba(240,246,255,.9)"; ctx.fill();
  }
  function drawCannon() {
    const [x, y] = toS(0, r0());
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = "#1b2133"; ctx.strokeStyle = "#8fa0c8"; ctx.lineWidth = 1;
    roundRect(-4, -8, 17, 6, 2.5); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -2.5, 3.2, 0, TAU); ctx.fillStyle = "#3a4561"; ctx.fill(); ctx.stroke();
    if (st.flash > 0) {
      ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(15, -5, 0, 15, -5, 26 * st.flash + 4);
      g.addColorStop(0, `rgba(255,240,200,${st.flash})`); g.addColorStop(0.3, `rgba(255,140,60,${0.6 * st.flash})`); g.addColorStop(1, "rgba(255,90,30,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(15, -5, 26 * st.flash + 4, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function draw() {
    updateView(0);
    const sc = view.sc;
    // reference circle: a circular orbit from the summit
    const [ex, ey] = toS(0, 0);
    ctx.setLineDash([2, 6]); ctx.strokeStyle = rgba(COL.aurora, 0.22); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ex, ey, r0() * sc, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    drawBody("earth", ex, ey, R_E * sc, (150 * Math.PI) / 180);
    drawMountain();
    // predicted path
    if (st.pred) {
      const p = getPred(), c = classify(st.v);
      ctx.setLineDash([5, 6]);
      strokePts(p.pts, toS, c.col, 1.3, 0, 0.55);
      ctx.setLineDash([]);
    }
    // trails
    for (const s of st.shots) strokePts(s.pts, toS, s.col, s === st.last ? 2 : 1.6, 7, s.alive || s.end ? 1 : 0.6);
    // heads, impacts, labels
    const now = performance.now();
    for (const s of st.shots) {
      const [x, y] = toS(s.x, s.y);
      if (s.alive) glowDot(x, y, 3.2, s.col);
      if (s.end === "impact") {
        const age = (now - s.impactAt) / 1000;
        if (age < 1.2) { ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = rgba(COL.flame, 1 - age / 1.2); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 4 + age * 26, 0, TAU); ctx.stroke(); ctx.restore(); }
        ctx.fillStyle = s.col; ctx.beginPath(); ctx.arc(x, y, 3, 0, TAU); ctx.fill();
      }
    }
    // speed labels at a characteristic point of each trail
    for (const s of st.shots) {
      if (s.pts.length < 6) continue;
      let lx, ly;
      if (s.end === "impact" || s.cls.k === "drop") { lx = s.x; ly = s.y; }
      else if (s.cls.bound) { // lowest screen point = apoapsis side for fast shots, periapsis for slow ones
        let best = 0, by = Infinity;
        for (let i = 0; i < s.pts.length; i += 2) if (s.pts[i + 1] < by) { by = s.pts[i + 1]; best = i; }
        lx = s.pts[best]; ly = s.pts[best + 1];
      } else {
        let best = 2;
        for (let i = 2; i < s.pts.length; i += 2) { const p = toS(s.pts[i], s.pts[i + 1]); if (p[0] > S.x + 10 && p[0] < S.x + S.w - 10 && p[1] > S.y + 10 && p[1] < S.y + S.h - 10) best = i; }
        lx = s.pts[best]; ly = s.pts[best + 1];
      }
      const rr = Math.hypot(lx, ly) || 1;
      const [px, py] = toS(lx, ly);
      const off = 18, ux = lx / rr, uy = -ly / rr;
      pill(fmt(s.v0, 2) + " km/s", px + ux * off, py + uy * off, s.col, { size: 10.5 });
    }
    drawCannon();
    // summit label
    const [mx, my] = toS(0, r0());
    const c = classify(st.v);
    pill(`${fmt(st.v, 2)} km/s → ${c.label}`, mx, my - 30, c.col, { size: 11.5, weight: 600 });
    text(`Newton's mountain · ${fmt(st.h, 0)} km`, mx - 14, my - 8, COL.muted, 10.5, "right");
    scaleBar(1 / sc);
  }

  function readouts() {
    const c = classify(st.v), r = r0();
    setV("cOut", `<span style="color:${c.col}">${c.label}</span>`);
    setV("cVc", fmt(vc(), 2) + u("km/s"));
    setV("cVe", fmt(ve(), 2) + u("km/s"));
    const eps = 0.5 * st.v * st.v - MU_E / r;
    setV("cEps", fmt(eps, 1) + u("km²/s²"));
    if (c.bound && c.a) {
      const T = TAU * Math.sqrt(c.a ** 3 / MU_E);
      setV("cT", c.k === "sub" ? "—" + u("hits ground") : fmtDur(T));
      setV("cApo", fmt(c.ra - R_E, 0) + u("km alt"));
      const p = getPred();
      setV("cPer", c.k === "sub" ? fmt(p.range, 0) + u("km range") : fmt(c.rp - R_E, 0) + u("km alt"));
    } else if (c.k === "drop") { setV("cT", "—"); setV("cApo", fmt(st.h, 0) + u("km alt")); setV("cPer", "0" + u("km range")); }
    else { setV("cT", "∞" + u("never returns")); setV("cApo", "∞"); setV("cPer", fmt(st.h, 0) + u("km alt")); }
    const s = st.last;
    if (s) {
      const rr = Math.hypot(s.x, s.y), vv = Math.hypot(s.vx, s.vy);
      setV("cAlt", s.end === "impact" ? "0" + u("landed") : fmt(rr - R_E, 0) + u("km"));
      setV("cSpd", s.end === "impact" ? "—" : fmt(vv, 2) + u("km/s · " + fmtDur(s.t)));
    } else { setV("cAlt", "—"); setV("cSpd", "—"); }
    const verdict = eps < -0.05 ? `ε &lt; 0 → bound: <b>${c.label}</b>` : eps > 0.05 ? `ε &gt; 0 → unbound: <b>${c.label}</b>` : `ε ≈ 0 → just escapes: <b>${c.label}</b>`;
    live("cLive", [
      `r=R_\\oplus+h=${tn(R_E, 0)}+${tn(st.h, 0)}=${tn(r, 0)}\\ \\text{km}`,
      `v_{\\text{circ}}=\\sqrt{\\tfrac{${tn(MU_E, 1)}}{${tn(r, 0)}}}=${tn(vc(), 2)},\\ \\ v_{\\text{esc}}=${tn(ve(), 2)}\\ \\text{km/s}`,
      `\\varepsilon=\\tfrac12(${tn(st.v, 2)})^2-\\tfrac{${tn(MU_E, 1)}}{${tn(r, 0)}}=${tn(eps, 1)}\\ \\tfrac{\\text{km}^2}{\\text{s}^2}`,
    ], verdict, c.col);
  }

  function layoutTicks() {
    const max = +el.v.max;
    el.ticks.innerHTML = "";
    const mk = (v, cls, lab) => {
      const b = document.createElement("button"); b.type = "button"; b.className = cls;
      b.style.left = `calc(8px + (100% - 16px) * ${v / max})`;
      b.textContent = lab; b.title = "Set launch speed to " + fmt(v, 2) + " km/s";
      b.addEventListener("click", () => { setSpeed(v); });
      el.ticks.appendChild(b);
    };
    mk(vc(), "circ end", `orbit ${fmt(vc(), 2)}`);
    mk(ve(), "esc end", `esc ${fmt(ve(), 2)}`);
  }
  function setSpeed(v) { st.v = Math.round(v * 100) / 100; setRange(el.v, st.v); el.vo.textContent = fmt(st.v, 2) + " km/s"; }
  el.v.addEventListener("input", () => setSpeed(+el.v.value));
  el.h.addEventListener("input", () => { st.h = +el.h.value; el.ho.textContent = fmt(st.h, 0) + " km"; layoutTicks(); });
  el.w.addEventListener("input", () => { st.warp = Math.pow(2, +el.w.value); el.wo.textContent = "×" + fmt(st.warp, st.warp < 1 ? 2 : 1); });
  el.pred.addEventListener("change", () => { st.pred = el.pred.checked; });
  $$("#cPresets .chip").forEach((b) => b.addEventListener("click", () => {
    const d = b.dataset.v; const v = d === "circ" ? vc() : d === "esc" ? ve() + 0.3 : +d;
    setSpeed(v); fire(st.v);
  }));
  layoutTicks();

  return {
    id: "cannon",
    enter() {
      if (!st.demo) {
        st.demo = true;
        if (!REDUCE) [6.4, 7.25, vc(), 8.6].forEach((v, i) => st.pending.push({ t: 0.25 + i * 0.35, v: Math.round(v * 100) / 100 }));
        else [6.4, 7.25, vc(), 8.6].forEach((v) => fire(v));
      }
      updateView(0, true);
    },
    update, draw, readouts,
    primary() { fire(); },
    secondary() { st.shots = []; st.last = null; st.pending = []; },
    bar: () => ({ p: "Fire", s: "Clear", space: "fire", pClass: "flame" }),
    click() { fire(); },
    label: "Newton's cannonball: Earth with a tall mountain; cannonballs fired sideways at different speeds either fall back, orbit or escape.",
  };
})();

/* =====================================================================
 * 2 · KEPLER'S LAWS
 * ===================================================================== */
const kepler = (() => {
  const PRE = {
    demo: { a: 1, e: 0.6, body: "earth", name: "Demo planet" },
    mercury: { a: 0.387098, e: 0.20563, body: "moon", name: "Mercury" },
    earth: { a: 1.000001, e: 0.016709, body: "earth", name: "Earth" },
    mars: { a: 1.523679, e: 0.0934, body: "mars", name: "Mars" },
    halley: { a: 17.834, e: 0.96714, body: "comet", name: "Halley's Comet" },
  };
  const st = { a: 1, e: 0.6, N: 12, speed: 1, M: 0.35, playing: !REDUCE, body: "earth", name: "Demo planet", wedges: null, key: "" };
  const el = { a: $("#kA"), ao: $("#kAo"), e: $("#kE"), eo: $("#kEo"), s: $("#kS"), so: $("#kSo") };
  const A_LO = 0.3, A_HI = 40;
  const SCREEN_PERIOD = 8; // seconds per orbit at ×1
  const b = () => st.a * Math.sqrt(1 - st.e * st.e);
  const Tyr = () => Math.pow(st.a, 1.5); // Kepler III in AU / years (μ☉ normalised)
  const TsecExact = () => TAU * Math.sqrt((st.a * AU) ** 3 / MU_S);
  const pos = (M) => { const E = keplerE(M, st.e); return [st.a * (Math.cos(E) - st.e), b() * Math.sin(E), E]; };
  const speedAt = (r) => Math.sqrt(MU_S * (2 / (r * AU) - 1 / (st.a * AU)));

  function buildWedges() {
    const key = st.a + "|" + st.e + "|" + st.N;
    if (key === st.key) return;
    st.key = key; st.wedges = [];
    for (let k = 0; k < st.N; k++) {
      const pts = [0, 0];
      for (let j = 0; j <= 28; j++) { const [x, y] = pos(((k + j / 28) / st.N) * TAU); pts.push(x, y); }
      st.wedges.push(pts);
    }
  }
  let view = { sc: 1, cx: 0, cy: 0 };
  function updateView() {
    const x0 = -st.a * (1 + st.e), x1 = st.a * (1 - st.e), bb = b();
    const w = x1 - x0, h = 2 * bb;
    view.sc = Math.min((S.w * 0.8) / w, (S.h * 0.74) / h);
    view.cx = (x0 + x1) / 2; view.cy = 0;
  }
  const toS = (x, y) => [S.cx + (x - view.cx) * view.sc, S.cy + 10 - (y - view.cy) * view.sc];

  function update(dt) {
    if (st.playing) st.M = (st.M + (dt * TAU * st.speed) / SCREEN_PERIOD) % TAU;
  }
  function draw() {
    updateView(); buildWedges();
    const sc = view.sc;
    const [fx, fy] = toS(0, 0);
    // equal-area wedges
    if (st.N) {
      const cur = Math.floor(st.M / (TAU / st.N));
      st.wedges.forEach((pts, k) => {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i += 2) { const p = toS(pts[i], pts[i + 1]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); }
        ctx.closePath();
        const c = k % 2 ? COL.nebula : COL.ice;
        ctx.fillStyle = rgba(c, k === cur ? 0.05 : 0.12); ctx.fill();
        ctx.strokeStyle = rgba(c, 0.28); ctx.lineWidth = 1; ctx.stroke();
      });
      // wedge being swept right now
      const m0 = cur * (TAU / st.N);
      ctx.beginPath(); ctx.moveTo(fx, fy);
      const n = 30;
      for (let j = 0; j <= n; j++) { const [x, y] = pos(lerp(m0, st.M, j / n)); const p = toS(x, y); ctx.lineTo(p[0], p[1]); }
      ctx.closePath();
      ctx.fillStyle = rgba(COL.aurora, 0.28); ctx.fill();
      ctx.strokeStyle = rgba(COL.aurora, 0.8); ctx.lineWidth = 1.2; ctx.stroke();
    }
    // ellipse + axes
    const [cx, cy] = toS(-st.a * st.e, 0);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = rgba(COL.ice, 0.18); ctx.lineWidth = 6;
    ctx.beginPath(); ctx.ellipse(cx, cy, st.a * sc, b() * sc, 0, 0, TAU); ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = rgba(COL.ice, 0.85); ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.ellipse(cx, cy, st.a * sc, b() * sc, 0, 0, TAU); ctx.stroke();
    const [px, py] = toS(st.a * (1 - st.e), 0), [ax, ay] = toS(-st.a * (1 + st.e), 0);
    ctx.setLineDash([3, 6]); ctx.strokeStyle = "rgba(195,202,230,.3)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]);
    // empty focus + centre
    const [f2x, f2y] = toS(-2 * st.a * st.e, 0);
    ctx.strokeStyle = "rgba(195,202,230,.55)"; ctx.beginPath(); ctx.arc(f2x, f2y, 3.5, 0, TAU); ctx.stroke();
    if (st.e > 0.05) text("empty focus", f2x, f2y + 14, COL.faint, 10, "center");
    ctx.fillStyle = "rgba(195,202,230,.5)"; ctx.fillRect(cx - 1.5, cy - 1.5, 3, 3);
    // apsides
    ctx.fillStyle = COL.flame; ctx.beginPath(); ctx.arc(px, py, 3, 0, TAU); ctx.fill();
    ctx.fillStyle = COL.ice; ctx.beginPath(); ctx.arc(ax, ay, 3, 0, TAU); ctx.fill();
    const q = st.a * (1 - st.e), Q = st.a * (1 + st.e);
    const [plx, ply] = toS(...pos(st.M));
    const near = (x, y) => clamp((Math.hypot(plx - x, ply - y) - 30) / 60, 0.08, 1);
    ctx.globalAlpha = near(px, py);
    pill(`perihelion q = ${fmt(q, q < 1 ? 3 : 2)} AU`, px + 12, py + 24, COL.flame, { align: "left", size: 10.5 });
    ctx.globalAlpha = near(ax, ay);
    pill(`aphelion Q = ${fmt(Q, Q < 1 ? 3 : 2)} AU`, ax - 12, ay + 24, COL.ice, { align: "right", size: 10.5 });
    ctx.globalAlpha = 1;
    // Sun
    drawBody("sun", fx, fy, clamp(sc * 0.05, 9, 16));
    // short fading trail
    for (let j = 0; j < 40; j++) {
      const [x1, y1] = pos(st.M - ((j + 1) / 40) * 0.5), [x2, y2] = pos(st.M - (j / 40) * 0.5);
      const p1 = toS(x1, y1), p2 = toS(x2, y2);
      ctx.strokeStyle = rgba(COL.text, 0.55 * (1 - j / 40)); ctx.lineWidth = 2.2 * (1 - j / 40) + 0.4;
      ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    }
    // planet, radius vector, velocity vector
    const [x, y, E] = pos(st.M), r = Math.hypot(x, y);
    const [sx, sy] = toS(x, y);
    ctx.strokeStyle = rgba(COL.aurora, 0.7); ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(sx, sy); ctx.stroke();
    const v = speedAt(r), vp = speedAt(q);
    const dx = -st.a * Math.sin(E), dy = b() * Math.cos(E), dl = Math.hypot(dx, dy);
    const L = 26 + 70 * (v / vp);
    arrow(sx, sy, sx + (dx / dl) * L, sy - (dy / dl) * L, COL.flame, 2, 9);
    pill(`v = ${fmt(v, 1)} km/s`, sx + (dx / dl) * (L + 34), sy - (dy / dl) * (L + 22), COL.flame, { size: 10.5 });
    if (st.body === "comet") {
      const ux = x / r, uy = y / r, tl = clamp(60 / Math.max(r, 0.3), 8, 150);
      const g = ctx.createLinearGradient(sx, sy, sx + ux * tl, sy - uy * tl);
      g.addColorStop(0, "rgba(200,235,255,.8)"); g.addColorStop(1, "rgba(124,200,255,0)");
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.strokeStyle = g; ctx.lineCap = "round";
      for (const w of [7, 3]) { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + ux * tl + uy * tl * 0.08, sy - uy * tl + ux * tl * 0.08); ctx.stroke(); }
      ctx.restore();
      glowDot(sx, sy, 2.6, COL.ice);
    } else {
      glowDot(sx, sy, 0.1, st.body === "mars" ? COL.flame : COL.ice);
      drawBody(st.body, sx, sy, 10, Math.atan2(sy - fy, fx - sx));
    }
    // name below the planet, or above it when the velocity arrow points down
    text(st.name, sx, sy + (dy / dl < -0.5 ? -22 : 24), COL.text2, 11, "center", 600);
    // legend
    if (st.N) {
      const days = TsecExact() / 86400 / st.N;
      const dd = days >= 800 ? fmt(days / 365.25, 1) + " yr" : fmt(days, 1) + " days";
      pill(S.w > 560 ? `${st.N} wedges · each swept in T/${st.N} = ${dd} · all the same area` : `${st.N} wedges · ${dd} each · equal areas`, S.cx, S.y + 22, COL.aurora, { size: 11 });
    }
    text("Sun and planet sizes not to scale", S.x + S.w - 14, S.y + S.h - 14, COL.faint, 10, "right");
    scaleBar(AU / sc / AU, "AU");
  }

  function readouts() {
    const q = st.a * (1 - st.e), Q = st.a * (1 + st.e);
    const vp = speedAt(q), va = speedAt(Q);
    const T = Tyr();
    setV("kT", T < 2 ? fmt(TsecExact() / 86400, 1) + u("days") : fmt(T, 2) + u("years"));
    const wa = (Math.PI * st.a * b()) / (st.N || 12);
    setV("kWA", fmt(wa, wa < 0.1 ? 4 : 3) + u("AU²"));
    setV("kQ1", fmt(q, 3) + u("AU"));
    setV("kQ2", fmt(Q, 3) + u("AU"));
    setV("kVp", fmt(vp, 2) + u("km/s"));
    setV("kVa", fmt(va, 2) + u("km/s"));
    const [x, y] = pos(st.M), r = Math.hypot(x, y);
    setV("kR", fmt(r, 3) + u("AU"));
    setV("kV", fmt(speedAt(r), 2) + u("km/s"));
    live("kLive", [
      `T=\\sqrt{a^3}\\ \\text{yr}=\\sqrt{${tn(st.a, 3)}^3}=${tn(T, 3)}\\ \\text{yr}`,
      `\\dfrac{v_q}{v_Q}=\\dfrac{1+e}{1-e}=\\dfrac{${tn(1 + st.e, 3)}}{${tn(1 - st.e, 3)}}=${tn(vp / va, 2)}`,
      `\\text{vis-viva: } r=${tn(r, 3)}\\ \\text{AU}\\ \\Rightarrow\\ v=${tn(speedAt(r), 2)}\\ \\text{km/s}`,
    ], `In astronomical units (AU) and years, μ☉ = 4π², so T² = a³ exactly.`, COL.text2);
  }

  function drawChart() {
    const c = $("#kChart"); if (!c || !c.offsetWidth) return;
    const w = c.offsetWidth, h = c.offsetHeight, d = DPR;
    if (c.width !== Math.round(w * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
    const g = c.getContext("2d"); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, w, h);
    const L = 40, R = 10, T = 10, B = 26;
    const ax0 = Math.log10(0.2), ax1 = Math.log10(60), ay0 = Math.log10(0.05), ay1 = Math.log10(600);
    const X = (a) => L + ((Math.log10(a) - ax0) / (ax1 - ax0)) * (w - L - R);
    const Y = (t) => h - B - ((Math.log10(t) - ay0) / (ay1 - ay0)) * (h - T - B);
    g.font = font(9.5); g.fillStyle = COL.faint; g.strokeStyle = "rgba(150,170,255,.1)"; g.lineWidth = 1;
    g.textAlign = "center"; g.textBaseline = "top";
    for (const a of [0.3, 1, 3, 10, 30]) { g.beginPath(); g.moveTo(X(a), T); g.lineTo(X(a), h - B); g.stroke(); g.fillText(a + "", X(a), h - B + 4); }
    g.textAlign = "right"; g.textBaseline = "middle";
    for (const t of [0.1, 1, 10, 100]) { g.beginPath(); g.moveTo(L, Y(t)); g.lineTo(w - R, Y(t)); g.stroke(); g.fillText(t + "", L - 5, Y(t)); }
    g.fillStyle = COL.muted; g.textAlign = "right"; g.textBaseline = "bottom"; g.fillText("a (AU)", w - R, h - B - 2);
    g.save(); g.translate(10, T + 4); g.rotate(-Math.PI / 2); g.textAlign = "right"; g.textBaseline = "top"; g.fillText("T (yr)", 0, 0); g.restore();
    g.strokeStyle = rgba(COL.aurora, 0.7); g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(X(0.2), Y(Math.pow(0.2, 1.5))); g.lineTo(X(60), Y(Math.pow(60, 1.5))); g.stroke();
    const P = [["Me", 0.387, 0.2408], ["V", 0.723, 0.6152], ["E", 1, 1], ["Ma", 1.524, 1.8809], ["J", 5.203, 11.862], ["S", 9.537, 29.457], ["U", 19.19, 84.02], ["N", 30.07, 164.8], ["Halley", 17.83, 75.3]];
    g.font = font(9); g.textAlign = "left"; g.textBaseline = "middle";
    for (const [n, a, t] of P) {
      g.fillStyle = n === "Halley" ? COL.ice : COL.sol;
      g.beginPath(); g.arc(X(a), Y(t), 2.6, 0, TAU); g.fill();
      g.fillStyle = COL.muted; g.fillText(n, X(a) + (n === "Halley" ? -34 : 5), Y(t) + (n === "Halley" ? -8 : 6));
    }
    g.strokeStyle = "#fff"; g.lineWidth = 1.6; g.beginPath(); g.arc(X(st.a), Y(Tyr()), 5.5, 0, TAU); g.stroke();
  }

  function apply(p) {
    st.a = p.a; st.e = p.e; st.body = p.body; st.name = p.name;
    setRange(el.a, logInv(st.a, A_LO, A_HI)); setRange(el.e, st.e);
    el.ao.textContent = fmt(st.a, 3) + " AU"; el.eo.textContent = fmt(st.e, 3);
    drawChart();
  }
  function custom() {
    st.name = "Custom orbit"; if (st.body === "comet" && st.e < 0.5) st.body = "earth";
    $$("#kPresets .chip").forEach((c) => c.setAttribute("aria-pressed", "false"));
  }
  el.a.addEventListener("input", () => { st.a = logMap(+el.a.value, A_LO, A_HI); el.ao.textContent = fmt(st.a, 3) + " AU"; custom(); drawChart(); });
  el.e.addEventListener("input", () => { st.e = +el.e.value; el.eo.textContent = fmt(st.e, 3); custom(); });
  el.s.addEventListener("input", () => { st.speed = Math.pow(2, +el.s.value); el.so.textContent = "×" + fmt(st.speed, st.speed < 1 ? 2 : 1); });
  $$("#kPresets .chip").forEach((c) => c.addEventListener("click", () => {
    $$("#kPresets .chip").forEach((x) => x.setAttribute("aria-pressed", String(x === c)));
    apply(PRE[c.dataset.p]); st.M = 0.3;
  }));
  $$("#kN button").forEach((bt) => bt.addEventListener("click", () => {
    $$("#kN button").forEach((x) => x.setAttribute("aria-pressed", String(x === bt)));
    st.N = +bt.dataset.n;
  }));
  apply(PRE.demo);

  return {
    id: "kepler", update, draw, readouts,
    enter() { drawChart(); },
    resize: drawChart,
    primary() { st.playing = !st.playing; },
    secondary() { st.M = 0; },
    bar: () => ({ p: st.playing ? "Pause" : "Play", s: "Perihelion", space: "play / pause", pClass: "primary" }),
    label: "Kepler's laws: a planet on an ellipse around the Sun, sweeping equal-area wedges in equal times.",
  };
})();

/* =====================================================================
 * 3 · HOHMANN TRANSFER (+ bi-elliptic comparison)
 * ===================================================================== */
const hohmann = (() => {
  const st = { pre: "leo-geo", alt: 400, ratio: 13, rbk: 3, bi: false, speed: 1, t: 0, playing: true, d: null };
  const el = { r1: $("#hR1"), r1o: $("#hR1o"), rat: $("#hRat"), rato: $("#hRato"), bi: $("#hBi"), rb: $("#hRb"), rbo: $("#hRbo"), rbF: $("#hRbF"), s: $("#hS"), so: $("#hSo"), custom: $("#hCustom"), ticks: $("#hTicks") };
  const RAT_LO = 1.2, RAT_HI = 80, RB_LO = 1, RB_HI = 40;

  function derive() {
    let mu, r1, r2, center, n1, n2;
    if (st.pre === "earth-mars") { mu = MU_S; r1 = AU; r2 = 1.523679 * AU; center = "sun"; n1 = "Earth's orbit"; n2 = "Mars's orbit"; }
    else if (st.pre === "leo-geo") { mu = MU_E; r1 = R_E_EQ + 400; r2 = R_GEO; center = "earth"; n1 = "LEO · 400 km"; n2 = "GEO · 35,786 km"; }
    else { mu = MU_E; r1 = R_E_EQ + st.alt; r2 = r1 * st.ratio; center = "earth"; n1 = `start · ${fmt(st.alt, 0)} km`; n2 = `target · ${fmt(r2 - R_E_EQ, 0)} km`; }
    const at = (r1 + r2) / 2, et = (r2 - r1) / (r2 + r1);
    const v1 = Math.sqrt(mu / r1), v2 = Math.sqrt(mu / r2);
    const vp = Math.sqrt(mu * (2 / r1 - 1 / at)), va = Math.sqrt(mu * (2 / r2 - 1 / at));
    const dv1 = vp - v1, dv2 = v2 - va, tH = Math.PI * Math.sqrt(at ** 3 / mu);
    const rb = st.rbk * r2;
    const a1 = (r1 + rb) / 2, a2 = (r2 + rb) / 2;
    const b1 = Math.sqrt(2 * mu / r1 - 2 * mu / (r1 + rb)) - v1;
    const b2 = Math.sqrt(2 * mu / rb - 2 * mu / (r2 + rb)) - Math.sqrt(2 * mu / rb - 2 * mu / (r1 + rb));
    const b3 = Math.sqrt(2 * mu / r2 - 2 * mu / (r2 + rb)) - v2;
    const t1 = Math.PI * Math.sqrt(a1 ** 3 / mu), t2 = Math.PI * Math.sqrt(a2 ** 3 / mu);
    st.d = { mu, r1, r2, center, n1, n2, at, et, v1, v2, dv1, dv2, tH, rb, a1, a2, e1: (rb - r1) / (rb + r1), e2: (rb - r2) / (rb + r2), b1, b2, b3, t1, t2, tB: t1 + t2 };
    const d = st.d;
    d.rate = Math.max(d.tH / 4.2, st.bi ? d.tB / 13 : 0);
    d.lead = 1.4 * d.rate; d.end = Math.max(d.tH, st.bi ? d.tB : 0) + 1.8 * d.rate;
    return d;
  }

  // position on an ellipse with periapsis on +x (CCW), from mean anomaly
  const ell = (a, e, M) => { const E = keplerE(M, e); return [a * (Math.cos(E) - e), a * Math.sqrt(1 - e * e) * Math.sin(E), E]; };
  function hohPos(t) {
    const d = st.d;
    if (t < 0) { const th = Math.sqrt(d.mu / d.r1 ** 3) * t; return { x: d.r1 * Math.cos(th), y: d.r1 * Math.sin(th), ph: 0 }; }
    if (t <= d.tH) { const [x, y] = ell(d.at, d.et, (t / d.tH) * Math.PI); return { x, y, ph: 1, f: t / d.tH }; }
    const th = Math.PI + Math.sqrt(d.mu / d.r2 ** 3) * (t - d.tH); return { x: d.r2 * Math.cos(th), y: d.r2 * Math.sin(th), ph: 2 };
  }
  function biPos(t) {
    const d = st.d;
    if (t < 0) return hohPos(t);
    if (t <= d.t1) { const [x, y] = ell(d.a1, d.e1, (t / d.t1) * Math.PI); return { x, y, ph: 1, f: t / d.t1 }; }
    if (t <= d.tB) { const [x, y] = ell(d.a2, d.e2, Math.PI + ((t - d.t1) / d.t2) * Math.PI); return { x, y, ph: 2, f: (t - d.t1) / d.t2 }; }
    const th = Math.sqrt(d.mu / d.r2 ** 3) * (t - d.tB); return { x: d.r2 * Math.cos(th), y: d.r2 * Math.sin(th), ph: 3 };
  }
  let view = { sc: 1 };
  const toS = (x, y) => [S.cx + x * view.sc, S.cy - y * view.sc];

  function update(dt) {
    const d = st.d || derive();
    if (!st.playing) return;
    st.t += dt * d.rate * st.speed;
    if (st.t > d.end) st.t = -d.lead;
  }
  function arcPts(a, e, M0, M1, n = 120) {
    const pts = [];
    for (let i = 0; i <= n; i++) { const [x, y] = ell(a, e, lerp(M0, M1, i / n)); pts.push(x, y); }
    return pts;
  }
  function craft(x, y, vxs, vys, col, burning) {
    const [sx, sy] = toS(x, y), a = Math.atan2(-vys, vxs);
    if (burning) {
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22);
      g.addColorStop(0, "rgba(255,210,150,.9)"); g.addColorStop(0.4, "rgba(255,120,50,.35)"); g.addColorStop(1, "rgba(255,90,30,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 22, 0, TAU); ctx.fill(); ctx.restore();
    }
    glowDot(sx, sy, 3, col);
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(a);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(9, 0); ctx.lineTo(1, -3.5); ctx.lineTo(1, 3.5); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function draw() {
    const d = st.d || derive();
    const ext = Math.max(d.r2, st.bi ? d.rb : 0) * 1.08;
    view.sc = Math.min(S.w, S.h * 0.92) / 2 / ext;
    const sc = view.sc;
    const [cx, cy] = toS(0, 0);
    // circular orbits
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = rgba(COL.ice, 0.55); ctx.beginPath(); ctx.arc(cx, cy, d.r1 * sc, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(st.pre === "earth-mars" ? COL.flame : COL.sol, 0.55); ctx.beginPath(); ctx.arc(cx, cy, d.r2 * sc, 0, TAU); ctx.stroke();
    // central body
    if (d.center === "sun") drawBody("sun", cx, cy, clamp(d.r1 * sc * 0.08, 8, 15));
    else drawBody("earth", cx, cy, Math.max(R_E_EQ * sc, 4), (150 * Math.PI) / 180);
    // full transfer ellipse (faint) + travelled part (bright)
    const t = st.t;
    const full = arcPts(d.at, d.et, 0, TAU, 240);
    ctx.setLineDash([3, 6]); strokePts(full, toS, COL.aurora, 1, 0, 0.35); ctx.setLineDash([]);
    strokePts(arcPts(d.at, d.et, 0, Math.PI), toS, COL.aurora, 1.2, 0, 0.45);
    if (t > 0) strokePts(arcPts(d.at, d.et, 0, Math.min(1, t / d.tH) * Math.PI), toS, COL.aurora, 2.2, 8);
    if (st.bi) {
      strokePts(arcPts(d.a1, d.e1, 0, Math.PI), toS, COL.nebula, 1.1, 0, 0.45);
      strokePts(arcPts(d.a2, d.e2, Math.PI, TAU), toS, COL.nebula, 1.1, 0, 0.45);
      if (t > 0) {
        strokePts(arcPts(d.a1, d.e1, 0, Math.min(1, t / d.t1) * Math.PI), toS, COL.nebula, 2, 8);
        if (t > d.t1) strokePts(arcPts(d.a2, d.e2, Math.PI, Math.PI + Math.min(1, (t - d.t1) / d.t2) * Math.PI), toS, COL.nebula, 2, 8);
      }
    }
    // planets for Earth → Mars
    if (st.pre === "earth-mars") {
      const nE = Math.sqrt(MU_S / d.r1 ** 3), nM = Math.sqrt(MU_S / d.r2 ** 3), phi0 = Math.PI - nM * d.tH;
      const thE = nE * t, thM = phi0 + nM * t;
      // phase-angle wedge at launch
      const [e0x, e0y] = toS(d.r1, 0), [m0x, m0y] = toS(d.r2 * Math.cos(phi0), d.r2 * Math.sin(phi0));
      ctx.strokeStyle = rgba(COL.sol, 0.4); ctx.setLineDash([2, 4]);
      ctx.beginPath(); ctx.moveTo(e0x, e0y); ctx.lineTo(cx, cy); ctx.lineTo(m0x, m0y); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(cx, cy, d.r1 * sc * 0.42, -phi0, 0); ctx.stroke();
      text(`φ = ${fmt((phi0 * 180) / Math.PI, 1)}°`, cx + Math.cos(phi0 / 2) * d.r1 * sc * 0.52, cy - Math.sin(phi0 / 2) * d.r1 * sc * 0.52, COL.sol, 10.5, "center", 600);
      ctx.globalAlpha = 0.35; drawBody("mars", m0x, m0y, 5, Math.PI + phi0); ctx.globalAlpha = 1;
      const [ex, ey] = toS(d.r1 * Math.cos(thE), d.r1 * Math.sin(thE));
      const [mx, my] = toS(d.r2 * Math.cos(thM), d.r2 * Math.sin(thM));
      glowDot(ex, ey, 0.1, COL.ice); drawBody("earth", ex, ey, 9, Math.PI + thE); text("Earth", ex, ey + 20, COL.ice, 10.5, "center", 600);
      glowDot(mx, my, 0.1, COL.flame); drawBody("mars", mx, my, 7.5, Math.PI + thM); text("Mars", mx, my + 19, COL.flame, 10.5, "center", 600);
    } else {
      const la = -2.2, lr = d.r1 * sc, lx = cx + lr * Math.cos(la), ly = cy - lr * Math.sin(la);
      ctx.strokeStyle = rgba(COL.ice, 0.5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - 22, ly + 30); ctx.stroke();
      pill(d.n1, lx - 22, ly + 38, COL.ice, { size: 10.5, valign: "top" });
      pill(d.n2, cx + d.r2 * sc * Math.cos(-2.3), cy - d.r2 * sc * Math.sin(-2.3) + 14, COL.sol, { size: 10.5 });
    }
    // burn labels
    const [b1x, b1y] = toS(d.r1, 0), [b2x, b2y] = toS(-d.r2, 0);
    pill(`Δv₁ = +${fmt(d.dv1, 2)} km/s`, b1x + 10, b1y - 18, COL.aurora, { align: "left", size: 10.5 });
    if (st.bi) pill(`Δv₂ = +${fmt(d.dv2, 2)} km/s`, b2x, b2y + 22, COL.aurora, { size: 10.5 });
    else pill(`Δv₂ = +${fmt(d.dv2, 2)} km/s`, b2x - 10, b2y - 18, COL.aurora, { align: "right", size: 10.5 });
    if (st.bi) {
      const [c2x, c2y] = toS(-d.rb, 0), [c3x, c3y] = toS(d.r2 * Math.cos(-0.55), d.r2 * Math.sin(-0.55));
      pill(`Δv₁ = +${fmt(d.b1, 2)}`, b1x + 10, b1y + 20, COL.nebula, { align: "left", size: 10.5 });
      pill(`Δv₂ = +${fmt(d.b2, 2)}`, c2x + 10, c2y - 18, COL.nebula, { align: "left", size: 10.5 });
      pill(`Δv₃ = −${fmt(Math.abs(d.b3), 2)} (brake at r₂)`, c3x + 10, c3y + 16, COL.nebula, { align: "left", size: 10.5 });
    }
    // spacecraft
    const burnWin = 0.28 * d.rate;
    const h = hohPos(t), h2 = hohPos(t + d.rate * 0.02);
    const hb = Math.abs(t) < burnWin || Math.abs(t - d.tH) < burnWin;
    craft(h.x, h.y, h2.x - h.x, h2.y - h.y, COL.aurora, hb);
    if (hb) {
      const [sx, sy] = toS(h.x, h.y);
      const dir = Math.atan2(-(h2.y - h.y), h2.x - h.x);
      arrow(sx, sy, sx + Math.cos(dir) * 34, sy + Math.sin(dir) * 34, COL.flame, 2, 8);
    }
    if (st.bi) {
      const q = biPos(t), q2 = biPos(t + d.rate * 0.02);
      const qb = t > 0 && (Math.abs(t) < burnWin || Math.abs(t - d.t1) < burnWin || Math.abs(t - d.tB) < burnWin);
      craft(q.x, q.y, q2.x - q.x, q2.y - q.y, COL.nebula, qb);
    }
    // clock
    const tt = Math.max(0, t);
    pill(`mission clock  ${fmtDur(tt)}${t > d.tH ? "  · Hohmann arrived" : ""}${st.bi && t > d.tB ? " · bi-elliptic arrived" : ""}`, S.cx, S.y + 22, COL.text2, { size: 11 });
    if (d.center === "sun") text("Sun and planet sizes not to scale", S.x + S.w - 14, S.y + S.h - 14, COL.faint, 10, "right");
    scaleBar(1 / sc, d.center === "sun" ? "km" : "km");
  }

  function readouts() {
    const d = st.d || derive();
    setV("hDv1", fmt(d.dv1, 3) + u("km/s")); setV("hDv2", fmt(d.dv2, 3) + u("km/s"));
    setV("hDv", fmt(d.dv1 + d.dv2, 3) + u("km/s")); setV("hT", fmtDur(d.tH));
    setV("hE", fmt(d.et, 4));
    const R = d.r2 / d.r1;
    if (st.pre === "earth-mars") {
      const nE = Math.sqrt(MU_S / d.r1 ** 3), nM = Math.sqrt(MU_S / d.r2 ** 3);
      const syn = TAU / (nE - nM) / 86400;
      $("#hXk").textContent = "Launch window every";
      setV("hX", fmt(syn, 0) + u("days"));
    } else { $("#hXk").textContent = "r₂ / r₁"; setV("hX", fmt(R, 2)); }
    const biBox = $(".ol-bi"); biBox.hidden = !st.bi;
    const tot = d.dv1 + d.dv2, btot = d.b1 + d.b2 + Math.abs(d.b3);
    if (st.bi) setV("hBiV", `${fmt(btot, 3)}${u("km/s")} · ${fmtDur(d.tB)}`);
    let verdict, col = COL.text2;
    if (st.bi) {
      const diff = tot - btot;
      verdict = diff > 0 ? `Bi-elliptic saves <b>${fmt(diff * 1000, 0)} m/s</b> but takes ${fmt(d.tB / d.tH, 1)}× longer.` : `Hohmann is cheaper by <b>${fmt(-diff * 1000, 0)} m/s</b>${R < 11.94 ? " (always true for r₂/r₁ < 11.94)" : ""}.`;
      col = diff > 0 ? COL.nebula : COL.aurora;
    } else if (st.pre === "earth-mars") {
      const nM = Math.sqrt(MU_S / d.r2 ** 3);
      verdict = `Launch when Mars leads Earth by <b>${fmt(((Math.PI - nM * d.tH) * 180) / Math.PI, 1)}°</b>, so both arrive at the far side together.`;
      col = COL.sol;
    } else verdict = R > 11.94 ? `r₂/r₁ = ${fmt(R, 1)} &gt; 11.94: switch on the bi-elliptic comparison.` : `r₂/r₁ = ${fmt(R, 2)}: Hohmann beats any bi-elliptic transfer here.`;
    const unit = d.center === "sun" ? "\\text{AU}" : "\\text{km}";
    const k = d.center === "sun" ? AU : 1;
    live("hLive", [
      `a_t=\\tfrac{r_1+r_2}{2}=\\tfrac{${tn(d.r1 / k, k > 1 ? 3 : 0)}+${tn(d.r2 / k, k > 1 ? 3 : 0)}}{2}=${tn(d.at / k, k > 1 ? 3 : 0)}\\ ${unit}`,
      `\\Delta v=${tn(d.dv1, 3)}+${tn(d.dv2, 3)}=${tn(tot, 3)}\\ \\text{km/s}`,
      `t_H=\\pi\\sqrt{a_t^3/\\mu}=\\text{${fmtDur(d.tH)}}`,
    ], verdict, col);
  }

  function drawChart() {
    const c = $("#hChart"); if (!c || !c.offsetWidth) return;
    const w = c.offsetWidth, h = c.offsetHeight, dd = DPR;
    if (c.width !== Math.round(w * dd)) { c.width = Math.round(w * dd); c.height = Math.round(h * dd); }
    const g = c.getContext("2d"); g.setTransform(dd, 0, 0, dd, 0, 0); g.clearRect(0, 0, w, h);
    const L = 36, R = 10, T = 10, B = 24;
    const x0 = 0, x1 = Math.log10(80), y0 = 0, y1 = 0.6;
    const X = (r) => L + ((Math.log10(r) - x0) / (x1 - x0)) * (w - L - R);
    const Y = (v) => h - B - ((v - y0) / (y1 - y0)) * (h - T - B);
    const fH = (r) => Math.sqrt((2 * r) / (1 + r)) - 1 + 1 / Math.sqrt(r) - Math.sqrt(2 / (r * (1 + r)));
    const fB = (r, rb) => Math.sqrt(2 - 2 / (1 + rb)) - 1 + Math.sqrt(2 / rb - 2 / (r + rb)) - Math.sqrt(2 / rb - 2 / (1 + rb)) + Math.sqrt(2 / r - 2 / (r + rb)) - Math.sqrt(1 / r);
    const fInf = (r) => (Math.SQRT2 - 1) * (1 + 1 / Math.sqrt(r));
    g.font = font(9.5); g.strokeStyle = "rgba(150,170,255,.1)"; g.fillStyle = COL.faint; g.lineWidth = 1;
    g.textAlign = "center"; g.textBaseline = "top";
    for (const r of [1, 2, 5, 10, 20, 50]) { g.beginPath(); g.moveTo(X(r), T); g.lineTo(X(r), h - B); g.stroke(); g.fillText(r + "", X(r), h - B + 4); }
    g.textAlign = "right"; g.textBaseline = "middle";
    for (const v of [0, 0.2, 0.4, 0.6]) { g.beginPath(); g.moveTo(L, Y(v)); g.lineTo(w - R, Y(v)); g.stroke(); g.fillText(v.toFixed(1), L - 5, Y(v)); }
    for (const [r, lab] of [[11.94, "11.94"], [15.58, "15.58"]]) {
      g.strokeStyle = rgba(COL.nebula, 0.4); g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(r), T); g.lineTo(X(r), h - B); g.stroke(); g.setLineDash([]);
      g.fillStyle = COL.nebula; g.textAlign = "center"; g.textBaseline = "top"; g.fillText(lab, X(r) + (r > 13 ? 14 : -14), T);
    }
    const plot = (f, col, dash, wdt = 1.6) => {
      g.strokeStyle = col; g.lineWidth = wdt; g.setLineDash(dash || []); g.beginPath();
      for (let i = 0; i <= 200; i++) { const r = Math.pow(10, x0 + ((x1 - x0) * i) / 200); const v = f(r); i ? g.lineTo(X(r), Y(v)) : g.moveTo(X(r), Y(v)); }
      g.stroke(); g.setLineDash([]);
    };
    plot(fH, COL.aurora);
    plot(fInf, rgba(COL.nebula, 0.6), [4, 4], 1.2);
    plot((r) => fB(r, st.rbk * r), COL.nebula, null, 1.4);
    const d = st.d || derive(), Rn = d.r2 / d.r1;
    g.fillStyle = COL.aurora; g.beginPath(); g.arc(X(Rn), Y(fH(Rn)), 4, 0, TAU); g.fill();
    if (st.bi) { g.strokeStyle = "#fff"; g.lineWidth = 1.4; g.beginPath(); g.arc(X(Rn), Y(fB(Rn, st.rbk * Rn)), 4.5, 0, TAU); g.stroke(); }
    g.font = font(9.5); g.textAlign = "left"; g.textBaseline = "middle";
    g.fillStyle = COL.aurora; g.fillText("Hohmann", L + 8, T + 8);
    g.fillStyle = COL.nebula; g.fillText(`bi-elliptic, r_b = ${fmt(st.rbk, 1)}·r₂`, L + 8, T + 21);
    g.fillStyle = rgba(COL.nebula, 0.7); g.fillText("bi-elliptic, r_b → ∞", L + 8, T + 34);
    g.fillStyle = COL.muted; g.textAlign = "right"; g.textBaseline = "bottom"; g.fillText("r₂ / r₁", w - R, h - B - 2);
  }

  function layoutTicks() {
    el.ticks.innerHTML = "";
    for (const [v, lab] of [[11.94, "11.94"], [15.58, "15.58"]]) {
      const b = document.createElement("button"); b.type = "button"; b.className = v < 13 ? "bi end" : "bi start"; b.textContent = lab;
      b.style.left = `calc(8px + (100% - 16px) * ${logInv(v, RAT_LO, RAT_HI) / 1000})`;
      b.addEventListener("click", () => { st.ratio = v; setRange(el.rat, logInv(v, RAT_LO, RAT_HI)); el.rato.textContent = fmt(v, 2); changed(); });
      el.ticks.appendChild(b);
    }
  }
  function changed(restart) { derive(); drawChart(); if (restart) st.t = -st.d.lead; }
  $$("#hPre button").forEach((b) => b.addEventListener("click", () => {
    $$("#hPre button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    st.pre = b.dataset.p; el.custom.hidden = st.pre !== "custom";
    if (st.pre === "custom") layoutTicks();
    changed(true);
  }));
  el.r1.addEventListener("input", () => { st.alt = +el.r1.value; el.r1o.textContent = fmt(st.alt, 0) + " km"; changed(); });
  el.rat.addEventListener("input", () => { st.ratio = logMap(+el.rat.value, RAT_LO, RAT_HI); el.rato.textContent = fmt(st.ratio, 2); changed(); });
  el.bi.addEventListener("change", () => { st.bi = el.bi.checked; el.rbF.hidden = !st.bi; changed(true); });
  el.rb.addEventListener("input", () => { st.rbk = logMap(+el.rb.value, RB_LO, RB_HI); el.rbo.textContent = fmt(st.rbk, 2); changed(); });
  el.s.addEventListener("input", () => { st.speed = Math.pow(2, +el.s.value); el.so.textContent = "×" + fmt(st.speed, st.speed < 1 ? 2 : 1); });
  setRange(el.rat, logInv(st.ratio, RAT_LO, RAT_HI)); el.rato.textContent = fmt(st.ratio, 2);
  setRange(el.rb, logInv(st.rbk, RB_LO, RB_HI)); el.rbo.textContent = fmt(st.rbk, 2);
  derive(); st.t = REDUCE ? 0.5 * st.d.tH : -st.d.lead; st.playing = !REDUCE;

  return {
    id: "hohmann", update, draw, readouts,
    enter() { drawChart(); },
    resize: drawChart,
    primary() { st.playing = !st.playing; },
    secondary() { st.t = -st.d.lead; st.playing = true; },
    bar: () => ({ p: st.playing ? "Pause" : "Play", s: "Replay", space: "play / pause", pClass: "primary" }),
    set(o) { Object.assign(st, o); el.bi.checked = st.bi; el.rbF.hidden = !st.bi; $$("#hPre button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.p === st.pre))); el.custom.hidden = st.pre !== "custom"; if (st.pre === "custom") layoutTicks(); changed(); },
    label: "Hohmann transfer: a spacecraft moves from an inner circular orbit to an outer one along half an ellipse, with two engine burns.",
  };
})();

/* =====================================================================
 * 4 · GRAVITY ASSIST
 * ===================================================================== */
const assist = (() => {
  const st = { side: "behind", rp: 3, vinf: 8, speed: 1, u: 0.35, hold: 0, playing: !REDUCE, path: null };
  const el = { rp: $("#aRp"), rpo: $("#aRpo"), vi: $("#aVi"), vio: $("#aVio"), s: $("#aS"), so: $("#aSo") };
  const RP_LO = 1.05, RP_HI = 40;
  // direction of v∞,in in Jupiter's frame: perpendicular to Jupiter's motion, so passing behind always
  // adds speed and passing ahead always removes it, whatever the turn angle (|v_out|² = V² + v∞² ± 2 V v∞ sin δ)
  const PHI_IN = Math.PI / 2;
  const VJ = [-V_J, 0];                   // Jupiter moves to the left; the Sun is "below", 5.2 AU away

  function compute() {
    const vinf = st.vinf, rp = st.rp * R_J, sg = st.side === "behind" ? 1 : -1;
    const e = 1 + (rp * vinf * vinf) / MU_J, p = rp * (1 + e), k = Math.sqrt(MU_J / p);
    const delta = 2 * Math.asin(1 / e);
    const D = Math.max(40 * R_J, 14 * rp);
    const nuD = Math.acos(clamp((p / D - 1) / e, -1, 1));
    const nuInf = Math.acos(-1 / e);
    const aIn = Math.atan2(sg * k * (e - 1 / e), k * Math.sin(nuInf));
    const rot = PHI_IN - aIn, cr = Math.cos(rot), sr = Math.sin(rot);
    const R = (x, y) => [x * cr - y * sr, x * sr + y * cr];
    const nu0 = -nuD, r0 = p / (1 + e * Math.cos(nu0));
    let [x, y] = R(r0 * Math.cos(nu0), sg * r0 * Math.sin(nu0));
    let [vx, vy] = R(-k * Math.sin(nu0), sg * k * (e + Math.cos(nu0)));
    // leapfrog (kick–drift–kick), adaptive step 0.4 % of r/v
    const acc = (x, y) => { const r2 = x * x + y * y, r = Math.sqrt(r2), f = -MU_J / (r2 * r); return [f * x, f * y]; };
    const T = [0], X = [x], Y = [y], VX = [vx], VY = [vy];
    let t = 0, [ax, ay] = acc(x, y), guard = 0, minR = Infinity, iMin = 0;
    while (guard++ < 200000) {
      const r = Math.hypot(x, y), v = Math.hypot(vx, vy);
      const h = (0.004 * r) / v;
      vx += 0.5 * ax * h; vy += 0.5 * ay * h;
      x += vx * h; y += vy * h;
      [ax, ay] = acc(x, y);
      vx += 0.5 * ax * h; vy += 0.5 * ay * h;
      t += h;
      const rr = Math.hypot(x, y);
      if (rr < minR) { minR = rr; iMin = T.length; }
      T.push(t); X.push(x); Y.push(y); VX.push(vx); VY.push(vy);
      if (rr > D && x * vx + y * vy > 0) break;
    }
    const tp = T[iMin];
    for (let i = 0; i < T.length; i++) T[i] -= tp; // t = 0 at closest approach
    const phiOut = PHI_IN + sg * delta;
    const vIn = [VJ[0] + vinf * Math.cos(PHI_IN), VJ[1] + vinf * Math.sin(PHI_IN)];
    const vOut = [VJ[0] + vinf * Math.cos(phiOut), VJ[1] + vinf * Math.sin(phiOut)];
    // hyperbola centre: |a|·e from the focus toward periapsis
    const pd = [X[iMin] / minR, Y[iMin] / minR], aa = MU_J / (vinf * vinf);
    st.path = { T, X, Y, VX, VY, e, delta, D, rp, vinf, phiOut, vIn, vOut, sg, iMin, vp: Math.sqrt(vinf * vinf + (2 * MU_J) / rp), C: [pd[0] * aa * e, pd[1] * aa * e], numericR: minR };
    // Sun-frame speeds along the path for colouring
    const hs = []; let lo = Infinity, hi = 0;
    for (let i = 0; i < T.length; i++) { const s = Math.hypot(VX[i] + VJ[0], VY[i] + VJ[1]); hs.push(s); lo = Math.min(lo, s); hi = Math.max(hi, s); }
    Object.assign(st.path, { hs, hlo: lo, hhi: hi });
  }

  function update(dt) {
    if (!st.path) compute();
    if (!st.playing) return;
    if (st.u >= 1) { st.hold += dt; if (st.hold > 1.6) { st.u = 0; st.hold = 0; } return; }
    st.u = Math.min(1, st.u + (dt * st.speed) / 7);
  }
  // time mapping that slows near periapsis so the swing is visible
  function tAt(uu) { const P = st.path, t0 = P.T[0], t1 = P.T[P.T.length - 1]; const s = Math.sinh(lerp(Math.asinh(t0 / 3e4), Math.asinh(t1 / 3e4), uu)) * 3e4; return s; }
  function idxAt(t) { const T = st.path.T; let lo = 0, hi = T.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (T[m] < t) lo = m; else hi = m; } return hi; }

  function frame(r, title, sub, col) {
    ctx.save();
    roundRect(r.x, r.y, r.w, r.h, 14);
    ctx.fillStyle = "rgba(6,9,20,.35)"; ctx.fill();
    ctx.strokeStyle = "rgba(150,170,255,.14)"; ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    text(title, r.x + 14, r.y + 16, col, 10.5, "left", 600);
    if (sub) text(sub, r.x + 14, r.y + 31, COL.muted, 10, "left");
  }
  // draw the first n samples as ~90 short polylines, each in its own colour (a cheap gradient stroke)
  function segPath(pts, n, toS, colorAt, w) {
    ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = w;
    const k = Math.max(1, Math.ceil(pts.X.length / 90));
    for (let i0 = 0; i0 < n - 1; i0 += k) {
      const i1 = Math.min(n - 1, i0 + k);
      ctx.beginPath();
      for (let i = i0; i <= i1; i++) { const p = toS(pts.X[i], pts.Y[i], i); i === i0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]); }
      ctx.strokeStyle = colorAt((i0 + i1) >> 1); ctx.stroke();
    }
  }

  function draw() {
    if (!st.path) compute();
    const P = st.path;
    const gap = 12, side = S.w / S.h > 1.25;
    const A = side ? { x: S.x, y: S.y, w: (S.w - gap) / 2, h: S.h } : { x: S.x, y: S.y, w: S.w, h: (S.h - gap) * 0.5 };
    const B = side ? { x: S.x + A.w + gap, y: S.y, w: A.w, h: S.h } : { x: S.x, y: S.y + A.h + gap, w: S.w, h: S.h - A.h - gap };
    const t = tAt(st.u), iNow = idxAt(t);
    const N = P.T.length;

    /* ---- Jupiter's frame ---- */
    frame(A, "JUPITER'S FRAME", "symmetric hyperbola · speed in = speed out", COL.ice);
    const half = Math.max(9 * R_J, 5.5 * P.rp);
    const scA = Math.min(A.w, A.h - 30) / 2 / half;
    // centre the view a little away from periapsis, where the two arms of the hyperbola go
    const pr = Math.hypot(P.X[P.iMin], P.Y[P.iMin]), sh = 0.32 * half;
    const ax = A.x + A.w / 2 + (P.X[P.iMin] / pr) * sh * scA, ay = A.y + A.h / 2 + 12 - (P.Y[P.iMin] / pr) * sh * scA;
    const tA = (x, y) => [ax + x * scA, ay - y * scA];
    ctx.save(); roundRect(A.x, A.y, A.w, A.h, 14); ctx.clip();
    drawBody("jupiter", ax, ay, Math.max(R_J * scA, 3), -Math.PI / 2);
    // path: future faint, past coloured by planet-frame speed
    ctx.setLineDash([2, 5]); ctx.strokeStyle = "rgba(195,202,230,.3)"; ctx.lineWidth = 1;
    ctx.beginPath(); for (let i = 0; i < N; i += 3) { const p = tA(P.X[i], P.Y[i]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke(); ctx.setLineDash([]);
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    segPath(P, iNow + 1, (x, y) => tA(x, y), (i) => rampCss(FLOW_RAMP, (Math.hypot(P.VX[i], P.VY[i]) - P.vinf) / (P.vp - P.vinf), 0.25), 6);
    ctx.restore();
    segPath(P, iNow + 1, (x, y) => tA(x, y), (i) => rampCss(FLOW_RAMP, (Math.hypot(P.VX[i], P.VY[i]) - P.vinf) / (P.vp - P.vinf), 1), 1.8);
    // periapsis marker
    const [pxp, pyp] = tA(P.X[P.iMin], P.Y[P.iMin]);
    ctx.strokeStyle = rgba(COL.sol, 0.7); ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(pxp, pyp); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    const dirp = Math.atan2(pyp - ay, pxp - ax);
    pill(`closest approach ${fmt(st.rp, 2)} R_J · turned ${fmt((P.delta * 180) / Math.PI, 0)}°`, pxp + Math.cos(dirp) * 70, pyp + Math.sin(dirp) * 26, COL.sol, { size: 10.5 });
    // entry / exit arrows where the path crosses into the view (same speed in and out)
    const inside = (i) => { const q = tA(P.X[i], P.Y[i]); return q[0] > A.x + 24 && q[0] < A.x + A.w - 24 && q[1] > A.y + 48 && q[1] < A.y + A.h - 26; };
    let i0 = 0; while (i0 < P.iMin && !inside(i0)) i0++;
    let i1 = N - 1; while (i1 > P.iMin && !inside(i1)) i1--;
    // the flyby is time-symmetric about closest approach: use mirror-image points so both show the same speed
    // pick the pair of points at equal distance from Jupiter (energy conservation ⇒ equal speeds)
    const rAt = (i) => Math.hypot(P.X[i], P.Y[i]);
    const rr = Math.min(rAt(i0), rAt(i1));
    while (i0 < P.iMin && rAt(i0) > rr) i0++;
    while (i1 > P.iMin && rAt(i1) > rr) i1--;
    const vl = Math.min(A.w, A.h) * 0.12;
    for (const [i, lab, back] of [[i0, "in", false], [i1, "out", true]]) {
      const q = tA(P.X[i], P.Y[i]), a = Math.atan2(-P.VY[i], P.VX[i]);
      const n = [Math.sin(a), -Math.cos(a)]; // screen-space normal
      const off = 16, ox = q[0] + n[0] * off * (back ? -1 : 1), oy = q[1] + n[1] * off * (back ? -1 : 1);
      const x0 = back ? ox - Math.cos(a) * vl : ox, y0 = back ? oy - Math.sin(a) * vl : oy;
      arrow(x0, y0, x0 + Math.cos(a) * vl, y0 + Math.sin(a) * vl, COL.ice, 2, 8);
      const lx = back ? x0 + Math.cos(a) * (vl + 10) : x0 - Math.cos(a) * 10, ly = back ? y0 + Math.sin(a) * (vl + 10) : y0 - Math.sin(a) * 10;
      const goesRight = back ? Math.cos(a) > 0 : Math.cos(a) < 0;
      pill(`${lab} ${fmt(Math.hypot(P.VX[i], P.VY[i]), 1)} km/s`, lx, ly, COL.ice, { size: 10, align: goesRight ? "left" : "right" });
    }
    const [cxs, cys] = tA(P.X[iNow], P.Y[iNow]);
    if (cxs > A.x && cxs < A.x + A.w && cys > A.y && cys < A.y + A.h) glowDot(cxs, cys, 3.2, COL.text);
    text(`now ${fmt(Math.hypot(P.VX[iNow], P.VY[iNow]), 1)} km/s relative to Jupiter`, A.x + A.w - 14, A.y + 16, COL.text2, 10.5, "right");

    /* ---- Sun's frame ---- */
    frame(B, "SUN'S FRAME", "Jupiter moves at 13.06 km/s · Sun ↓ 5.2 AU away", COL.sol);
    const dsplit = B.w / B.h > 1.35;
    const Bp = dsplit ? { x: B.x, y: B.y + 36, w: B.w * 0.6, h: B.h - 36 } : { x: B.x, y: B.y + 36, w: B.w, h: (B.h - 36) * 0.6 };
    const Bd = dsplit ? { x: B.x + B.w * 0.6, y: B.y + 20, w: B.w * 0.4, h: B.h - 20 } : { x: B.x, y: Bp.y + Bp.h, w: B.w, h: B.h - 36 - Bp.h };
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < N; i += 4) { const X = P.X[i] + VJ[0] * P.T[i], Y = P.Y[i]; x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y); }
    const jx0 = VJ[0] * P.T[0], jx1 = VJ[0] * P.T[N - 1];
    x0 = Math.min(x0, jx1); x1 = Math.max(x1, jx0);
    const scB = Math.min((Bp.w - 30) / (x1 - x0), (Bp.h - 24) / (y1 - y0 || 1));
    const bxc = Bp.x + Bp.w / 2, byc = Bp.y + Bp.h / 2;
    const tB = (x, y) => [bxc + (x - (x0 + x1) / 2) * scB, byc - (y - (y0 + y1) / 2) * scB];
    ctx.save(); roundRect(B.x, B.y, B.w, B.h, 14); ctx.clip();
    // Jupiter's track
    const [j0x, j0y] = tB(jx0, 0), [j1x, j1y] = tB(jx1, 0);
    ctx.setLineDash([3, 6]); ctx.strokeStyle = rgba(COL.sol, 0.35); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(j0x, j0y); ctx.lineTo(j1x, j1y); ctx.stroke(); ctx.setLineDash([]);
    ctx.setLineDash([2, 5]); ctx.strokeStyle = "rgba(195,202,230,.25)";
    ctx.beginPath(); for (let i = 0; i < N; i += 3) { const p = tB(P.X[i] + VJ[0] * P.T[i], P.Y[i]); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); } ctx.stroke(); ctx.setLineDash([]);
    const hcol = (i, a) => rampCss(FLOW_RAMP, (P.hs[i] - P.hlo) / (P.hhi - P.hlo || 1), a);
    const toB = (x, y, i) => tB(x + VJ[0] * P.T[i], y);
    ctx.save(); ctx.globalCompositeOperation = "lighter"; segPath(P, iNow + 1, toB, (i) => hcol(i, 0.25), 6); ctx.restore();
    segPath(P, iNow + 1, toB, (i) => hcol(i, 1), 1.8);
    const [jx, jy] = tB(VJ[0] * t, 0);
    drawBody("jupiter", jx, jy, Math.max(R_J * scB, 4.5), -Math.PI / 2);
    arrow(jx - 10, jy + 16, jx - 44, jy + 16, COL.sol, 1.6, 7, false);
    const [kx, ky] = toB(P.X[iNow], P.Y[iNow], iNow);
    glowDot(kx, ky, 3.2, COL.text);
    ctx.restore();
    const [sx0, sy0] = toB(P.X[0], P.Y[0], 0), [sx1, sy1] = toB(P.X[N - 1], P.Y[N - 1], N - 1);
    pill(`in ${fmt(Math.hypot(...P.vIn), 1)} km/s`, sx0, sy0 + 14, rampCss(FLOW_RAMP, 0.1), { size: 10.5, valign: "top" });
    pill(`out ${fmt(Math.hypot(...P.vOut), 1)} km/s`, sx1, sy1 - 14, rampCss(FLOW_RAMP, P.sg > 0 ? 0.95 : 0.05), { size: 10.5, valign: "bottom" });

    /* ---- velocity triangle ---- */
    const pts = [[0, 0], VJ, P.vIn, P.vOut];
    for (let k = 0; k < 24; k++) pts.push([VJ[0] + P.vinf * Math.cos((k / 24) * TAU), VJ[1] + P.vinf * Math.sin((k / 24) * TAU)]);
    let vx0 = Infinity, vx1 = -Infinity, vy0 = Infinity, vy1 = -Infinity;
    for (const [x, y] of pts) { vx0 = Math.min(vx0, x); vx1 = Math.max(vx1, x); vy0 = Math.min(vy0, y); vy1 = Math.max(vy1, y); }
    const pad = 26;
    const scV = Math.min((Bd.w - pad * 2) / (vx1 - vx0), (Bd.h - pad * 2 - 14) / (vy1 - vy0));
    const vcx = Bd.x + Bd.w / 2, vcy = Bd.y + Bd.h / 2 + 8;
    const tV = (x, y) => [vcx + (x - (vx0 + vx1) / 2) * scV, vcy - (y - (vy0 + vy1) / 2) * scV];
    text("VELOCITY TRIANGLE (km/s)", Bd.x + (dsplit ? 4 : 14), Bd.y + (dsplit ? 0 : 12), COL.muted, 9.5, "left", 600);
    const [ox, oy] = tV(0, 0), [tx, ty] = tV(VJ[0], VJ[1]);
    ctx.setLineDash([3, 4]); ctx.strokeStyle = "rgba(195,202,230,.35)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(tx, ty, P.vinf * scV, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    arrow(ox, oy, tx, ty, COL.sol, 2, 8, false);
    const [ix, iy] = tV(...P.vIn), [qx, qy] = tV(...P.vOut);
    arrow(tx, ty, ix, iy, rgba(COL.ice, 0.8), 1.4, 7, false);
    arrow(tx, ty, qx, qy, rgba(COL.ice, 0.8), 1.4, 7, false);
    arrow(ox, oy, ix, iy, rampCss(FLOW_RAMP, 0.1), 2, 8);
    arrow(ox, oy, qx, qy, rampCss(FLOW_RAMP, P.sg > 0 ? 0.95 : 0.05), 2, 8);
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ox, oy, 2.5, 0, TAU); ctx.fill();
    text("V_J", (ox + tx) / 2, (oy + ty) / 2 + 12, COL.sol, 10, "center", 600);
    const aa0 = -PHI_IN, aa1 = -P.phiOut, ar = Math.min(22, P.vinf * scV * 0.45);
    ctx.strokeStyle = rgba(COL.sol, 0.9); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(tx, ty, ar, Math.min(aa0, aa1), Math.max(aa0, aa1)); ctx.stroke();
    const am = (aa0 + aa1) / 2;
    text(`δ ${fmt((P.delta * 180) / Math.PI, 0)}°`, tx + Math.cos(am) * (ar + 16), ty + Math.sin(am) * (ar + 10), COL.sol, 10, "center", 600);
    text("v_in", ix + 6, iy - 8, rampCss(FLOW_RAMP, 0.1), 10, "left", 600);
    text("v_out", qx + (qx < tx ? -6 : 6), qy + 10, rampCss(FLOW_RAMP, P.sg > 0 ? 0.95 : 0.05), 10, qx < tx ? "right" : "left", 600);
  }

  function readouts() {
    if (!st.path) compute();
    const P = st.path, vi = Math.hypot(...P.vIn), vo = Math.hypot(...P.vOut), dv = vo - vi;
    setV("aVin", fmt(vi, 2) + u("km/s")); setV("aVout", fmt(vo, 2) + u("km/s"));
    setV("aDv", `<span style="color:${dv >= 0 ? COL.aurora : COL.flame}">${dv >= 0 ? "+" : "−"}${fmt(Math.abs(dv), 2)}</span>${u("km/s " + (dv >= 0 ? "gained from" : "given to") + " Jupiter")}`);
    setV("aDel", fmt((P.delta * 180) / Math.PI, 1) + u("°"));
    setV("aVp", fmt(P.vp, 1) + u("km/s"));
    setV("aAlt", fmt(P.rp - R_J, 0) + u("km"));
    setV("aE", fmt(P.e, 3));
    const de = VJ[0] * (P.vinf * Math.cos(P.phiOut) - P.vinf * Math.cos(PHI_IN)) + VJ[1] * (P.vinf * Math.sin(P.phiOut) - P.vinf * Math.sin(PHI_IN));
    live("aLive", [
      `e=1+\\dfrac{(${tn(P.rp, 0)})(${tn(P.vinf, 1)})^2}{1.26687\\times10^{8}}=${tn(P.e, 3)}`,
      `\\delta=2\\arcsin\\tfrac1e=${tn((P.delta * 180) / Math.PI, 1)}^\\circ,\\quad \\Delta\\varepsilon=${tn(de, 1)}\\ \\tfrac{\\text{km}^2}{\\text{s}^2}`,
      `|\\mathbf v_{\\text{in}}|=${tn(vi, 2)}\\ \\to\\ |\\mathbf v_{\\text{out}}|=${tn(vo, 2)}\\ \\text{km/s}`,
    ], `${st.side === "behind" ? "Passing behind Jupiter" : "Passing ahead of Jupiter"}: <b>${dv >= 0 ? "+" : "−"}${fmt(Math.abs(dv), 2)} km/s</b>, ${dv >= 0 ? "free speed without fuel" : "a free brake"}.`, dv >= 0 ? COL.aurora : COL.flame);
  }

  el.rp.addEventListener("input", () => { st.rp = logMap(+el.rp.value, RP_LO, RP_HI); el.rpo.innerHTML = fmt(st.rp, 2) + " R<sub>J</sub>"; compute(); });
  el.vi.addEventListener("input", () => { st.vinf = +el.vi.value; el.vio.textContent = fmt(st.vinf, 1) + " km/s"; compute(); });
  el.s.addEventListener("input", () => { st.speed = Math.pow(2, +el.s.value); el.so.textContent = "×" + fmt(st.speed, st.speed < 1 ? 2 : 1); });
  $$("#aSide button").forEach((b) => b.addEventListener("click", () => {
    $$("#aSide button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    st.side = b.dataset.s; compute();
  }));
  setRange(el.rp, logInv(st.rp, RP_LO, RP_HI)); el.rpo.innerHTML = fmt(st.rp, 2) + " R<sub>J</sub>";
  if (REDUCE) st.u = 1;

  return {
    id: "assist", update, draw, readouts,
    primary() { st.playing = !st.playing; if (st.playing && st.u >= 1) { st.u = 0; st.hold = 0; } },
    secondary() { st.u = 0; st.hold = 0; st.playing = true; },
    bar: () => ({ p: st.playing ? "Pause" : "Play", s: "Replay", space: "play / pause", pClass: "primary" }),
    set(o) { Object.assign(st, o); $$("#aSide button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.s === st.side))); compute(); },
    label: "Gravity assist: a spacecraft swings past Jupiter. Left: Jupiter's frame, a symmetric hyperbola. Right: the Sun's frame, where the spacecraft leaves faster.",
  };
})();

/* =====================================================================
 * 5 · LAGRANGE POINTS (circular restricted three-body problem)
 * ===================================================================== */
const lagrange = (() => {
  const SYS = {
    em: { mu: MU_EM, a: A_EM, big: "earth", small: "moon", bigN: "Earth", smallN: "Moon", Rb: 6371 / A_EM, Rs: 1737.4 / A_EM, base: 2.2, unitDays: 27.321661 / TAU },
    se: { mu: MU_SE, a: AU, big: "sun", small: "earth", bigN: "Sun", smallN: "Earth", Rb: 695700 / AU, Rs: 6371 / AU, base: 6, unitDays: 365.25 / TAU },
  };
  const st = { sys: "em", zoom: 1, warp: 1, t: 0, parts: [], playing: !REDUCE, cont: true, L: null, field: null, fkey: "", pending: null };
  const el = { z: $("#lZ"), zo: $("#lZo"), s: $("#lS"), so: $("#lSo"), cont: $("#lCont") };
  const PCOLS = [COL.ice, COL.aurora, COL.sol, COL.plasma, COL.nebula, COL.flame, "#9ff0ff", "#ffe08a"];
  let pc = 0;
  const sys = () => SYS[st.sys];

  const Omega = (x, y, mu) => { const r1 = Math.hypot(x + mu, y), r2 = Math.hypot(x - 1 + mu, y); return 0.5 * (x * x + y * y) + (1 - mu) / r1 + mu / r2; };
  function lpoints(mu) {
    const f = (x) => x - ((1 - mu) * (x + mu)) / Math.abs(x + mu) ** 3 - (mu * (x - 1 + mu)) / Math.abs(x - 1 + mu) ** 3;
    const bis = (a, b) => { let fa = f(a); for (let i = 0; i < 200; i++) { const m = 0.5 * (a + b), fm = f(m); if ((fm > 0) === (fa > 0)) { a = m; fa = fm; } else b = m; } return 0.5 * (a + b); };
    const L1 = bis(-mu + 1e-9, 1 - mu - 1e-12), L2 = bis(1 - mu + 1e-12, 2), L3 = bis(-2, -mu - 1e-9);
    return [[L1, 0], [L2, 0], [L3, 0], [0.5 - mu, Math.sqrt(3) / 2], [0.5 - mu, -Math.sqrt(3) / 2]];
  }
  let view = { sc: 1, cx: 0 };
  function updateView() {
    const s = sys();
    view.sc = (Math.min(S.w, S.h) / 2 / 1.3) * st.zoom;
    const zc = smooth(1, 6, st.zoom);
    view.cx = lerp(0, 1 - s.mu, zc);
  }
  const toS = (x, y) => [S.cx + (x - view.cx) * view.sc, S.cy - y * view.sc];
  const toW = (px, py) => [(px - S.cx) / view.sc + view.cx, -(py - S.cy) / view.sc];

  function buildField(force) {
    const key = [st.sys, st.zoom.toFixed(4), Math.round(ST.w), Math.round(ST.h), st.cont, DPR].join("|");
    if (!force && key === st.fkey) return;
    if (!force && st.field && !sceneStable()) return; // rebuild once the layout settles
    st.fkey = key;
    const mu = sys().mu, L = st.L;
    const step = 2; // css px per sample
    const gw = Math.ceil(S.w / step) + 1, gh = Math.ceil(S.h / step) + 1;
    const vals = new Float32Array(gw * gh);
    const oL4 = Omega(L[3][0], L[3][1], mu);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const [x, y] = toW(S.x + i * step, S.y + j * step);
      const v = Math.log(Math.max(Omega(x, y, mu) - oL4, 1e-14));
      vals[j * gw + i] = v; if (v < lo) lo = v; if (v > hi) hi = v;
    }
    // histogram equalisation
    const NB = 2048, hist = new Float32Array(NB);
    const bin = (v) => clamp(Math.floor(((v - lo) / (hi - lo || 1)) * (NB - 1)), 0, NB - 1);
    for (let k = 0; k < vals.length; k++) hist[bin(vals[k])]++;
    for (let k = 1; k < NB; k++) hist[k] += hist[k - 1];
    const tot = hist[NB - 1];
    const c = document.createElement("canvas"); c.width = gw; c.height = gh;
    const g = c.getContext("2d"), img = g.createImageData(gw, gh), d = img.data;
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
      const k = j * gw + i, tq = hist[bin(vals[k])] / tot;
      const col = ramp(FIELD_RAMP, tq);
      const band = 0.93 + 0.07 * Math.cos(tq * TAU * 12);
      const ex = Math.min(i * step, S.w - i * step, j * step, S.h - j * step);
      const al = smooth(0, 40, ex) * 0.92;
      d[k * 4] = col[0] * band; d[k * 4 + 1] = col[1] * band; d[k * 4 + 2] = col[2] * band; d[k * 4 + 3] = al * 255;
    }
    g.putImageData(img, 0, 0);
    // contour lines (marching squares) at equal-area levels + the critical L1/L2/L3 levels
    const quant = (q) => { let k = 0; while (k < NB - 1 && hist[k] / tot < q) k++; return lo + (k / (NB - 1)) * (hi - lo); };
    const levels = [];
    for (let q = 1; q < 14; q++) levels.push({ v: quant(q / 14), col: "rgba(255,255,255,.10)", w: 1 });
    [[0, COL.ice], [1, COL.aurora], [2, COL.nebula]].forEach(([k, col]) => levels.push({ v: Math.log(Math.max(Omega(L[k][0], L[k][1], mu) - oL4, 1e-14)), col: rgba(col, 0.75), w: 1.3, crit: true }));
    // bake image + contour lines into one device-resolution bitmap: a single blit per frame
    const full = document.createElement("canvas");
    full.width = Math.round(S.w * DPR); full.height = Math.round(S.h * DPR);
    const fg = full.getContext("2d");
    fg.imageSmoothingEnabled = true; fg.imageSmoothingQuality = "high";
    fg.drawImage(c, 0, 0, gw * step * DPR, gh * step * DPR);
    if (st.cont) {
      fg.setTransform(DPR, 0, 0, DPR, 0, 0);
      for (const lv of levels) {
        const a = march(vals, gw, gh, lv.v, step);
        fg.strokeStyle = lv.col; fg.lineWidth = lv.w; fg.beginPath();
        for (let i = 0; i < a.length; i += 4) { fg.moveTo(a[i], a[i + 1]); fg.lineTo(a[i + 2], a[i + 3]); }
        fg.stroke();
      }
    }
    st.field = { full, sw: S.w, sh: S.h };
  }
  function march(g, gw, gh, lev, step) {
    const out = [];
    const P = (i, j, v0, v1, dx, dy) => { const t = (lev - v0) / (v1 - v0); return [(i + dx * t) * step, (j + dy * t) * step]; };
    for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
      const a = g[j * gw + i], b = g[j * gw + i + 1], c = g[(j + 1) * gw + i + 1], d = g[(j + 1) * gw + i];
      const idx = (a > lev ? 1 : 0) | (b > lev ? 2 : 0) | (c > lev ? 4 : 0) | (d > lev ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const e0 = () => P(i, j, a, b, 1, 0), e1 = () => { const t = (lev - b) / (c - b); return [(i + 1) * step, (j + t) * step]; };
      const e2 = () => { const t = (lev - d) / (c - d); return [(i + t) * step, (j + 1) * step]; }, e3 = () => P(i, j, a, d, 0, 1);
      const add = (p, q) => out.push(p[0], p[1], q[0], q[1]);
      switch (idx) {
        case 1: case 14: add(e3(), e0()); break;
        case 2: case 13: add(e0(), e1()); break;
        case 3: case 12: add(e3(), e1()); break;
        case 4: case 11: add(e1(), e2()); break;
        case 6: case 9: add(e0(), e2()); break;
        case 7: case 8: add(e3(), e2()); break;
        case 5: add(e3(), e0()); add(e1(), e2()); break;
        case 10: add(e0(), e1()); add(e2(), e3()); break;
      }
    }
    return new Float32Array(out);
  }

  // ---- particles: leapfrog in the inertial frame, displayed in the rotating frame ----
  function accI(X, Y, t, mu) {
    const c = Math.cos(t), s = Math.sin(t);
    const dx1 = X + mu * c, dy1 = Y + mu * s, dx2 = X - (1 - mu) * c, dy2 = Y - (1 - mu) * s;
    const r1 = Math.hypot(dx1, dy1), r2 = Math.hypot(dx2, dy2);
    const k1 = -(1 - mu) / (r1 * r1 * r1), k2 = -mu / (r2 * r2 * r2);
    return [k1 * dx1 + k2 * dx2, k1 * dy1 + k2 * dy2, r1, r2];
  }
  function rotState(p) { // inertial → rotating position & velocity
    const c = Math.cos(st.t), s = Math.sin(st.t);
    const x = p.X * c + p.Y * s, y = -p.X * s + p.Y * c;
    const vx = p.VX + p.Y, vy = p.VY - p.X; // subtract ω × r (ω = 1)
    return [x, y, vx * c + vy * s, -vx * s + vy * c];
  }
  const jacobi = (p) => { const [x, y, vx, vy] = rotState(p); return 2 * Omega(x, y, sys().mu) - (vx * vx + vy * vy); };
  function drop(x, y, jitter = 0) {
    const c = Math.cos(st.t), s = Math.sin(st.t);
    x += (Math.random() - 0.5) * jitter; y += (Math.random() - 0.5) * jitter;
    const X = x * c - y * s, Y = x * s + y * c;
    const p = { X, Y, VX: -Y, VY: X, col: PCOLS[pc++ % PCOLS.length], trail: [x, y], alive: true, born: st.t };
    p.C0 = jacobi(p);
    st.parts.push(p);
    if (st.parts.length > 40) st.parts.shift();
    return p;
  }
  function update(dt) {
    if (!st.playing) return;
    const s = sys(), mu = s.mu;
    const Dt = dt * s.base * st.warp;
    const t0 = st.t;
    const thr = 1.2 / view.sc;
    for (const p of st.parts) {
      if (!p.alive) continue;
      let t = t0, left = Dt, n = 0;
      let [ax, ay, r1, r2] = accI(p.X, p.Y, t, mu);
      while (left > 1e-12 && n++ < 9000) {
        let h = Math.min(0.002, 0.01 * Math.min(Math.sqrt(r1 ** 3 / (1 - mu)), Math.sqrt(r2 ** 3 / mu)), left);
        h = Math.max(h, Dt / 9000);
        p.VX += 0.5 * ax * h; p.VY += 0.5 * ay * h;
        p.X += p.VX * h; p.Y += p.VY * h; t += h; left -= h;
        [ax, ay, r1, r2] = accI(p.X, p.Y, t, mu);
        p.VX += 0.5 * ax * h; p.VY += 0.5 * ay * h;
        if (r1 < s.Rb || r2 < s.Rs) { p.alive = false; p.end = "hit"; break; }
        const c = Math.cos(t), sn = Math.sin(t);
        const x = p.X * c + p.Y * sn, y = -p.X * sn + p.Y * c;
        const tl = p.trail.length;
        if (Math.abs(x - p.trail[tl - 2]) + Math.abs(y - p.trail[tl - 1]) > thr) { p.trail.push(x, y); if (p.trail.length > 7000) p.trail.splice(0, 1000); }
        if (x * x + y * y > 9) { p.alive = false; p.end = "escaped"; break; }
      }
    }
    st.t = t0 + Dt;
  }

  function draw() {
    const s = sys(), mu = s.mu, L = st.L;
    updateView(); buildField();
    const F = st.field;
    if (F) ctx.drawImage(F.full, S.x, S.y, S.w, S.h);
    // the smaller body's orbit (circle about the barycentre) for reference
    const [ox, oy] = toS(0, 0);
    ctx.setLineDash([2, 6]); ctx.strokeStyle = "rgba(255,255,255,.18)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(ox, oy, (1 - mu) * view.sc, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    // particles
    for (const p of st.parts) {
      const tr = p.trail;
      if (tr.length >= 4) {
        const n = tr.length / 2, chunks = 5;
        // dark under-stroke keeps bright trails readable on the bright ridges of the map
        ctx.beginPath();
        for (let i = 0; i < n; i++) { const q = toS(tr[i * 2], tr[i * 2 + 1]); i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]); }
        ctx.strokeStyle = "rgba(4,5,14,.55)"; ctx.lineWidth = 3.2; ctx.lineJoin = "round"; ctx.stroke();
        for (let c = 0; c < chunks; c++) {
          const i0 = Math.floor((c * n) / chunks), i1 = Math.min(n - 1, Math.floor(((c + 1) * n) / chunks) + 1);
          ctx.beginPath();
          for (let i = i0; i <= i1; i++) { const q = toS(tr[i * 2], tr[i * 2 + 1]); i === i0 ? ctx.moveTo(q[0], q[1]) : ctx.lineTo(q[0], q[1]); }
          ctx.strokeStyle = rgba(p.col, 0.15 + 0.75 * ((c + 1) / chunks)); ctx.lineWidth = 1.3; ctx.stroke();
        }
      }
      const [x, y] = p.alive ? rotState(p) : [tr[tr.length - 2], tr[tr.length - 1]];
      const q = toS(x, y);
      if (p.alive) glowDot(q[0], q[1], 2.6, p.col); else { ctx.strokeStyle = rgba(p.col, 0.8); ctx.beginPath(); ctx.arc(q[0], q[1], 3, 0, TAU); ctx.stroke(); }
    }
    // bodies (enlarged)
    const [bx, by] = toS(-mu, 0), [sx, sy] = toS(1 - mu, 0);
    const rb = Math.max(s.Rb * view.sc, st.sys === "se" ? 13 : 10), rs = Math.max(s.Rs * view.sc, st.sys === "se" ? 5.5 : 5);
    if (bx > S.x - 60 && bx < S.x + S.w + 60) drawBody(s.big, bx, by, rb, (150 * Math.PI) / 180);
    drawBody(s.small, sx, sy, rs, Math.PI);
    text(s.bigN, bx, by + rb + 14, COL.text2, 11, "center", 600);
    text(s.smallN, sx, sy + rs + 14, COL.text2, 11, "center", 600);
    // Lagrange points
    const names = ["L1", "L2", "L3", "L4", "L5"], cols = [COL.ice, COL.aurora, COL.nebula, COL.sol, COL.sol];
    const tags = ["unstable saddle", "unstable saddle", "unstable saddle", "stable (tadpoles)", "stable (tadpoles)"];
    L.forEach(([x, y], k) => {
      const [px, py] = toS(x, y);
      if (px < S.x - 10 || px > S.x + S.w + 10 || py < S.y - 10 || py > S.y + S.h + 10) return;
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const g = ctx.createRadialGradient(px, py, 0, px, py, 14); g.addColorStop(0, rgba(cols[k], 0.8)); g.addColorStop(1, rgba(cols[k], 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, 14, 0, TAU); ctx.fill(); ctx.restore();
      ctx.strokeStyle = cols[k]; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px - 5, py); ctx.lineTo(px + 5, py); ctx.moveTo(px, py - 5); ctx.lineTo(px, py + 5); ctx.stroke();
      if (k === 0 || k === 1) {
        // L1 and L2 flank the smaller body: short tags left/right of it, one shared caption
        const tight = Math.abs(toS(L[1][0], 0)[0] - toS(L[0][0], 0)[0]) < 260;
        const lab = tight ? names[k] : `${names[k]} · ${tags[k]}`;
        pill(lab, px + (k === 0 ? -8 : 8), py - 20, cols[k], { size: 10, align: k === 0 ? "right" : "left" });
        if (tight && k === 1) pill("L1, L2 · unstable saddles", (px + toS(L[0][0], 0)[0]) / 2, py + rs + 32, COL.text2, { size: 10 });
      } else pill(`${names[k]} · ${tags[k]}`, px, py + (k === 4 ? 20 : -20), cols[k], { size: 10 });
    });
    // JWST at Sun–Earth L2, SOHO at L1
    if (st.sys === "se") {
      const [l2x, l2y] = toS(L[1][0], L[1][1]), [l1x, l1y] = toS(L[0][0], L[0][1]);
      if (Math.abs(l2x - sx) > 30) {
        ctx.strokeStyle = rgba(COL.sol, 0.55); ctx.setLineDash([2, 3]);
        ctx.beginPath(); ctx.ellipse(l2x, l2y, Math.abs(l2x - sx) * 0.3, Math.abs(l2x - sx) * 0.5, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
        hexGlyph(l2x + Math.abs(l2x - sx) * 0.3, l2y, 5);
        pill("JWST · halo orbit around L2 (schematic)", l2x, l2y + Math.abs(l2x - sx) * 0.5 + 16, COL.sol, { size: 10 });
        glowDot(l1x, l1y - Math.abs(l2x - sx) * 0.25, 2.2, COL.ice);
        pill("SOHO", l1x, l1y - Math.abs(l2x - sx) * 0.25 - 16, COL.ice, { size: 10 });
      } else {
        pill("JWST at L2 · zoom in to see it", sx, sy - 50, COL.sol, { size: 10 });
      }
    }
    // clock & hint
    const days = st.t * s.unitDays;
    const tt = days > 700 ? fmt(days / 365.25, 1) + " yr" : fmt(days, 0) + " days";
    pill(S.w > 520 ? `rotating frame · t = ${tt} · click the map to drop a particle` : `rotating frame · t = ${tt} · tap to drop`, S.cx, S.y + 22, COL.text2, { size: 10.5 });
    text(`${s.bigN} and ${s.smallN} drawn enlarged`, S.x + S.w - 14, S.y + S.h - 14, COL.faint, 10, "right");
    scaleBar(s.a / view.sc, "km");
  }
  function hexGlyph(x, y, r) {
    ctx.save(); ctx.fillStyle = "#ffcf5a"; ctx.shadowColor = "#ffc24b"; ctx.shadowBlur = 10;
    ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU + Math.PI / 6; ctx[k ? "lineTo" : "moveTo"](x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.closePath(); ctx.fill(); ctx.restore();
  }

  function readouts() {
    const s = sys(), mu = s.mu, L = st.L;
    setV("lMu", mu < 1e-3 ? mu.toExponential(4) : fmt(mu, 6));
    const days = st.t * s.unitDays;
    setV("lN", `${st.parts.filter((p) => p.alive).length}${u("alive · " + (days > 700 ? fmt(days / 365.25, 1) + " yr" : fmt(days, 0) + " d"))}`);
    $("#lL1k").textContent = `L1 from ${s.smallN}`; $("#lL2k").textContent = `L2 from ${s.smallN}`;
    const d1 = (1 - mu - L[0][0]) * s.a, d2 = (L[1][0] - 1 + mu) * s.a;
    setV("lL1", d1 > 1e6 ? fmt(d1 / 1e6, 3) + u("million km") : fmt(d1, 0) + u("km"));
    setV("lL2", d2 > 1e6 ? fmt(d2 / 1e6, 3) + u("million km") : fmt(d2, 0) + u("km"));
    const last = st.parts.filter((p) => p.alive).pop();
    if (last) { const C = jacobi(last); setV("lC", `${fmt(C, 6)}${u("drift " + (C - last.C0).toExponential(1))}`); }
    else setV("lC", "—");
    const O = (k) => 2 * Omega(L[k][0], L[k][1], mu);
    const routh = (1 - Math.sqrt(23 / 27)) / 2;
    live("lLive", [
      `\\mu=\\tfrac{m_2}{m_1+m_2}=${mu < 1e-3 ? "3.0404\\times10^{-6}" : tn(mu, 6)}`,
      `x_{L1}=${tn(L[0][0], 5)},\\quad x_{L2}=${tn(L[1][0], 5)}`,
      `x_{L3}=${tn(L[2][0], 5)},\\quad L_{4,5}=\\left(\\tfrac12-\\mu,\\,\\pm\\tfrac{\\sqrt3}{2}\\right)`,
      `C_{L1}=${tn(O(0), mu < 1e-3 ? 6 : 4)},\\quad C_{L2}=${tn(O(1), mu < 1e-3 ? 6 : 4)}`,
    ], `μ = ${mu < 1e-3 ? "3.04 × 10⁻⁶" : fmt(mu, 4)} &lt; ${fmt(routh, 4)} (Routh's criterion) → L4 and L5 are stable.`, COL.sol);
  }

  function setSys(k) {
    st.sys = k; st.L = lpoints(sys().mu); st.parts = []; st.t = 0; st.fkey = ""; st.field = null;
    $$("#lSys button").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.s === k)));
    // Sun–Earth: default zoom toward Earth so L1/L2 separate; Earth–Moon: whole system
    const z = k === "se" ? 1 : 1;
    st.zoom = z; setRange(el.z, logInv(z, 1, 80)); el.zo.textContent = "×" + fmt(z, 1);
    st.warp = k === "se" ? 8 : 1; setRange(el.s, Math.log(st.warp) / Math.log(4)); el.so.textContent = "×" + fmt(st.warp, 1);
  }
  function dropAt(k) {
    const L = st.L, eps = st.sys === "se" ? 0.0006 : 0.003;
    if (k === "swarm") { for (let i = 0; i < 10; i++) drop(L[3][0], L[3][1], st.sys === "se" ? 0.012 : 0.05); return; }
    const [x, y] = L[+k];
    drop(x + eps * (k < 3 ? 1 : 0.8), y + (k >= 3 ? eps : 0), 0);
  }
  $$("#lSys button").forEach((b) => b.addEventListener("click", () => setSys(b.dataset.s)));
  $$("#lDrop .chip").forEach((b) => b.addEventListener("click", () => dropAt(b.dataset.l === "swarm" ? "swarm" : +b.dataset.l)));
  el.z.addEventListener("input", () => { st.zoom = logMap(+el.z.value, 1, 80); el.zo.textContent = "×" + fmt(st.zoom, 1); for (const p of st.parts) p.trail = p.trail.slice(-2); });
  el.s.addEventListener("input", () => { st.warp = Math.pow(4, +el.s.value); el.so.textContent = "×" + fmt(st.warp, st.warp < 1 ? 2 : 1); });
  el.cont.addEventListener("change", () => { st.cont = el.cont.checked; });
  setSys("em");

  return {
    id: "lagrange", update, draw, readouts,
    enter() {
      st.fkey = "";
      if (!st.demoed) { st.demoed = true; dropAt(3); dropAt(4); const L = st.L; drop(L[3][0] + 0.06, L[3][1] - 0.02); drop(L[0][0] - 0.004, 0.0); drop(L[2][0] + 0.004, 0.0); }
    },
    primary() { st.playing = !st.playing; },
    secondary() { st.parts = []; },
    click(px, py) { const [x, y] = toW(px, py); drop(x, y); },
    resize() { st.fkey = ""; },
    bar: () => ({ p: st.playing ? "Pause" : "Play", s: "Clear", space: "play / pause", pClass: "primary" }),
    set(o) { if (o.sys) setSys(o.sys); if (o.zoom) { st.zoom = o.zoom; setRange(el.z, logInv(o.zoom, 1, 80)); el.zo.textContent = "×" + fmt(o.zoom, 1); } if (o.warp) st.warp = o.warp; if (o.demo) this.enter(); },
    get st() { return st; },
    label: "Lagrange points: the effective potential of a rotating two-body system as a colour map, with L1 to L5 marked and test particles you can drop.",
  };
})();

/* =====================================================================
 * app shell: mode switching, bar, keyboard, loop
 * ===================================================================== */
const MODES = { cannon, kepler, hohmann, assist, lagrange };
const ORDER = ["cannon", "kepler", "hohmann", "assist", "lagrange"];
let cur = null;
const btnP = $("#primary"), btnS = $("#secondary"), spaceHint = $("#spaceHint");

function refreshBar() {
  const b = cur.bar();
  btnP.textContent = b.p; btnS.textContent = b.s; spaceHint.textContent = b.space;
  btnP.className = "btn small " + (b.pClass || "primary");
}
function setMode(id, push = true) {
  if (!MODES[id]) id = "cannon";
  cur = MODES[id];
  $$(".ol-modes button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === id)));
  $$("#explain .ol-x, #panel .ol-c").forEach((s) => { s.hidden = s.dataset.mode !== id; });
  cv.setAttribute("aria-label", cur.label);
  document.title = `Orbit Lab · ${{ cannon: "Newton's Cannonball", kepler: "Kepler's Laws", hohmann: "Hohmann Transfer", assist: "Gravity Assist", lagrange: "Lagrange Points" }[id]} · Cosmic Library`;
  if (push && location.hash !== "#" + id) history.replaceState(null, "", "#" + id);
  explain.scrollTop = 0;
  measure(false);
  if (cur.enter) cur.enter();
  refreshBar();
  lastRead = 0;
}
$$(".ol-modes button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
btnP.addEventListener("click", () => { cur.primary(); refreshBar(); });
btnS.addEventListener("click", () => { cur.secondary(); refreshBar(); });

addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const tg = e.target;
  if (tg && (tg.tagName === "INPUT" && tg.type !== "range" && tg.type !== "checkbox" || tg.tagName === "TEXTAREA" || tg.tagName === "SELECT")) return;
  if (/^[1-5]$/.test(e.key)) { setMode(ORDER[+e.key - 1]); e.preventDefault(); }
  else if (e.code === "Space") { e.preventDefault(); cur.primary(); refreshBar(); }
  else if (e.key === "c" || e.key === "C") { if (cur === cannon || cur === lagrange) { cur.secondary(); refreshBar(); } }
  else if (e.key === "r" || e.key === "R") { if (cur === hohmann || cur === assist) { cur.secondary(); refreshBar(); } }
});
cv.addEventListener("pointerdown", (e) => {
  if (e.clientX < S.x || e.clientX > S.x + S.w || e.clientY < S.y || e.clientY > S.y + S.h) return;
  if (cur.click) { cur.click(e.clientX, e.clientY); refreshBar(); }
});

// observe HUD size changes (fonts loading, bottom sheet toggling, explanation moves)
if ("ResizeObserver" in window) {
  const ro = new ResizeObserver(() => measure(false));
  [head, explain, panel, bar].forEach((n) => ro.observe(n));
}
addEventListener("resize", () => { resize(); Object.values(MODES).forEach((m) => m.resize && m.resize()); });
document.querySelectorAll(".hud-collapse").forEach((b) => b.addEventListener("click", () => setTimeout(() => measure(false), 30)));

let last = performance.now(), lastRead = 0, frozen = false;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (frozen) { if (frozen === 1) return; frozen = 1; }
  if (!document.hidden) {
    measure(false); easeScene(dt);
    cur.update(dt);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1;
    if (sky) ctx.drawImage(sky, 0, 0, W, H);
    cur.draw();
    if (now - lastRead > 140) { lastRead = now; cur.readouts(); }
  }
  requestAnimationFrame(frame);
}

/* ---------------- boot ---------------- */
function boot() {
  renderStaticTex();
  if (innerWidth <= 820) { panel.classList.add("collapsed"); const b = panel.querySelector(".hud-collapse"); if (b) b.textContent = "▲ CONTROLS"; }
  resize();
  const h = (location.hash || "").slice(1);
  setMode(MODES[h] ? h : "cannon", false);
  measure(true);
  requestAnimationFrame((t) => {
    last = t; frame(t);
    const ld = $("#loading"); ld.classList.add("done");
    setTimeout(() => ld.remove(), 900); // don't depend on the fade transition finishing
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(false); Object.values(MODES).forEach((m) => m.resize && m.resize()); });
}
// Test / debugging hook (used by scripts/shot.py --eval)
window.OrbitLab = {
  setMode, modes: MODES,
  // advance the current simulation by `sec` seconds of wall-clock time at 60 Hz (frame-rate independent testing)
  advance(sec) { for (let t = 0; t < sec; t += 1 / 60) cur.update(1 / 60); lastRead = 0; return "ok"; },
  // draw one last frame and stop the loop (keeps screenshots of a loaded test machine fast)
  freeze() { frozen = 2; requestAnimationFrame(frame); return "frozen"; },
};
boot();
