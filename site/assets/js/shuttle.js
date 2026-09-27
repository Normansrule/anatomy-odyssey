/* Space Shuttle Endeavour (OV-105) — Cosmic Codex
 *
 * A procedural orbiter built from public reference dimensions (length 37.24 m,
 * span 23.79 m, double-delta wing 81°/45°, 18.3 × 4.6 m payload bay — see
 * data/endeavour.json → sources). Three display modes:
 *   museum : horizontal on stands, as in the Samuel Oschin Pavilion (2012–2023)
 *   stack  : vertical on External Tank ET-94 between two solid rocket boosters,
 *            as inside the Samuel Oschin Air and Space Center (opens 13 Nov 2026)
 *   orbit  : payload bay doors open over Earth's limb
 *
 * Coordinates: metres. Orbiter local frame: +Z = nose, +Y = top of fuselage,
 * +X = port (left) wing. The model is an educational approximation, not a
 * scale drawing; agency insignia are deliberately omitted.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const $ = (s) => document.querySelector(s);
const Codex = window.Codex;
const gsap = window.gsap;
const REDUCE = !!(Codex && Codex.reducedMotion);
const D = (s) => (REDUCE ? 0.001 : s); // durations collapse under reduced motion
const TAU = Math.PI * 2;

if (!Codex || !Codex.webgl()) {
  if (Codex) Codex.noGL();
  const l = $('#loading'); if (l) l.remove();
} else {
  init().catch((e) => { console.error(e); const l = $('#loading'); if (l) l.textContent = 'Could not start the simulation.'; });
}

/* ========================================================================== */
/* small helpers                                                                */
/* ========================================================================== */
function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function hash2(a, b) { let h = (a * 374761393 + b * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
const lerp = (a, b, k) => a + (b - a) * k;
const frac = (x) => x - Math.floor(x);
function tiledBox(w, h, d, unit = 1.6) { // BoxGeometry with UVs in metres / unit, so tile textures keep their real size
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv;
  const spans = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * spans[f][0] / unit, uv.getY(i) * spans[f][1] / unit); }
  return g;
}
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d', { willReadFrequently: true }); return c; } // CPU-backed: fast pixel work
let MAX_ANISO = 4;
function tex(c, { srgb = true, repeat = null, flip = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO; t.flipY = flip;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function monotone(xs, ys) { // Fritsch–Carlson monotone cubic: smooth, no overshoot
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]);
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) m[i] = 0;
    else { const h0 = xs[i] - xs[i - 1], h1 = xs[i + 1] - xs[i]; const w1 = 2 * h1 + h0, w2 = h1 + 2 * h0; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]); }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0; while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

/* ========================================================================== */
/* fuselage cross-sections                                                      */
/* Superellipse sections: flat tiled belly (high exponent), rounded top.        */
/* ========================================================================== */
const ZMIN = -15.6, ZMAX = 19.0;   // aft bulkhead → nose tip (fuselage only)
const BAY0 = -8.8, BAY1 = 9.6;     // payload bay: 18.4 m long (bay 18.3 m / 60 ft)
const SEC = [
  //  z      hw    yb    yc    yt    nb   nt
  [-15.6, 2.72, 0.10, 2.70, 5.65, 7.0, 3.8],
  [-13.0, 2.72, 0.00, 2.70, 5.65, 7.0, 3.8],
  [  9.6, 2.70, 0.00, 2.70, 5.65, 7.0, 3.8],
  [ 10.8, 2.70, 0.00, 2.62, 6.02, 7.0, 3.6],
  [ 12.0, 2.68, 0.00, 2.52, 6.28, 6.5, 3.4],
  [ 13.4, 2.65, 0.00, 2.42, 6.30, 6.0, 3.2],
  [ 14.4, 2.60, 0.00, 2.32, 6.02, 5.6, 2.95],
  [ 15.2, 2.47, 0.02, 2.22, 5.45, 5.0, 2.75],
  [ 16.0, 2.30, 0.10, 2.12, 4.78, 4.2, 2.6],
  [ 17.0, 2.00, 0.30, 2.04, 4.12, 3.4, 2.45],
  [ 17.9, 1.52, 0.64, 1.98, 3.46, 2.8, 2.35],
  [ 18.3, 1.22, 0.90, 1.96, 3.06, 2.5, 2.3],
  [ 18.6, 0.90, 1.20, 1.96, 2.74, 2.35, 2.25],
  [ 18.8, 0.60, 1.46, 1.96, 2.46, 2.2, 2.2],
  [ 18.93, 0.33, 1.70, 1.96, 2.22, 2.1, 2.1],
  [ 19.0, 0.02, 1.93, 1.96, 1.99, 2.0, 2.0],
];
const secFns = [1, 2, 3, 4, 5, 6].map((k) => monotone(SEC.map((r) => r[0]), SEC.map((r) => r[k])));
function secAt(z, shrink = 0) {
  return { hw: secFns[0](z) - shrink, yb: secFns[1](z) + shrink * 1.2, yc: secFns[2](z), yt: secFns[3](z) - shrink, nb: secFns[4](z), nt: secFns[5](z) };
}
// t ∈ [-0.5, 0.5]: 0 = belly centre, 0.25 = port side (+X), ±0.5 = top centre, -0.25 = starboard
function ringPt(S, t, out) {
  const phi = TAU * t - Math.PI / 2, c = Math.cos(phi), s = Math.sin(phi);
  if (s < 0) { const e = 2 / S.nb; out.x = S.hw * Math.sign(c) * Math.pow(Math.abs(c), e); out.y = S.yc - (S.yc - S.yb) * Math.pow(-s, e); }
  else { const e = 2 / S.nt; out.x = S.hw * Math.sign(c) * Math.pow(Math.abs(c), e); out.y = S.yc + (S.yt - S.yc) * Math.pow(s, e); }
  return out;
}
// door hinge on the midbody section (sill line at y = 4.3)
const MID = secAt(0);
const HINGE_Y = 4.3;
const T_HINGE = (() => { const e = 2 / MID.nt; const s = Math.pow((HINGE_Y - MID.yc) / (MID.yt - MID.yc), 1 / e); return (Math.asin(s) + Math.PI / 2) / TAU; })();
const HINGE_X = ringPt(MID, T_HINGE, {}).x;

function zSamples(z0, z1, n, clusterEnd = false) {
  const a = [];
  for (let i = 0; i <= n; i++) { let k = i / n; if (clusterEnd) k = Math.sin(k * Math.PI / 2); a.push(z0 + (z1 - z0) * k); }
  return a;
}
function loftGeometry(zs, t0, t1, nt, { shrink = 0, flip = false, uv = 'atlas' } = {}) {
  const pos = [], uvs = [], idx = [], p = {};
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i], S = secAt(z, shrink);
    for (let j = 0; j <= nt; j++) {
      const t = t0 + (t1 - t0) * j / nt;
      ringPt(S, t, p); pos.push(p.x, p.y, z);
      if (uv === 'atlas') uvs.push(t + 0.5, (z - ZMIN) / (ZMAX - ZMIN));
      else uvs.push(j / nt, (z - zs[0]) / (zs[zs.length - 1] - zs[0]));
    }
  }
  const W = nt + 1;
  for (let i = 0; i < zs.length - 1; i++) for (let j = 0; j < nt; j++) {
    const a = i * W + j, b = a + 1, c = a + W, d = c + 1;
    if (!flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function sectionShape(z, shrink = 0, n = 96) {
  const S = secAt(z, shrink), p = {}, sh = new THREE.Shape();
  for (let j = 0; j < n; j++) { ringPt(S, -0.5 + j / n, p); if (j === 0) sh.moveTo(p.x, p.y); else sh.lineTo(p.x, p.y); }
  sh.closePath(); return sh;
}

/* ========================================================================== */
/* wing: double delta (81° glove, 45° outer panel), 3.5° dihedral               */
/* ========================================================================== */
const WING = { xr: 2.55, xb: 4.5, xt: 11.9, zGlove: 8.0, zRootTE: -15.3, zTipTE: -14.6 };
WING.zBreak = WING.zGlove - (WING.xb - WING.xr) / Math.tan(THREE.MathUtils.degToRad(9));   // 81° sweep
WING.zTipLE = WING.zBreak - (WING.xt - WING.xb);                                            // 45° sweep
const WZ0 = -15.6, WZ1 = 8.0;
function wingLE(x) { return x <= WING.xb ? WING.zGlove - (x - WING.xr) / Math.tan(THREE.MathUtils.degToRad(9)) : WING.zBreak - (x - WING.xb); }
function wingTE(x) { return lerp(WING.zRootTE, WING.zTipTE, (x - WING.xr) / (WING.xt - WING.xr)); }
function naca(v) { return Math.max(0, (0.2969 * Math.sqrt(v) - 0.1260 * v - 0.3516 * v * v + 0.2843 * v * v * v - 0.1036 * v * v * v * v) / 0.1); }
function wingY0(x) { return 0.62 + (x - WING.xr) * Math.tan(THREE.MathUtils.degToRad(3.5)); }
function wingT(x) { const u = (x - WING.xr) / (WING.xt - WING.xr); return lerp(1.45, 0.22, Math.pow(u, 0.8)); }
function wingSurfY(x, z, top) {
  const zl = wingLE(x), zt = wingTE(x); const v = THREE.MathUtils.clamp((zl - z) / (zl - zt), 0, 1);
  const h = wingT(x) / 2 * naca(v); return top ? wingY0(x) + 1.25 * h : wingY0(x) - 0.75 * h;
}
function wingGeometry(side) {
  const NU = 30, NV = 36, vR = 0.03;
  const pos = [], uv = [], rows = 2 * NV + 1;
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, x = lerp(WING.xr, WING.xt, u), zl = wingLE(x), zt = wingTE(x), c = zl - zt;
    for (let j = 0; j < rows; j++) {
      const w = j / NV; // 0..2 : bottom TE → LE → top TE
      const top = w > 1; const vv = top ? w - 1 : 1 - w; const v = (1 - Math.cos(Math.PI * vv)) / 2;
      const z = zl - v * c; const h = wingT(x) / 2 * naca(v);
      let y = top ? wingY0(x) + 1.25 * h : wingY0(x) - 0.75 * h;
      pos.push(side * x, y, z);
      if (top) uv.push((x - WING.xr) / (WING.xt - WING.xr), (z - WZ0) / (WZ1 - WZ0));
      else uv.push(x / 1.6, z / 1.6);
    }
  }
  // bands by chordwise index: bottom | leading edge (RCC) | top
  const jLE0 = Math.round(NV * (1 - 0)) - Math.max(1, Math.round(Math.acos(1 - 2 * vR) / Math.PI * NV));
  const jLE1 = 2 * NV - jLE0;
  const bands = [[0, jLE0], [jLE0, jLE1], [jLE1, 2 * NV]];
  const idx = []; const g = new THREE.BufferGeometry();
  let start = 0;
  bands.forEach(([j0, j1], mi) => {
    const s0 = idx.length;
    for (let i = 0; i < NU; i++) for (let j = j0; j < j1; j++) {
      const a = i * rows + j, b = a + rows, c = a + 1, d = b + 1;
      if (side > 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
    if (mi === 0) { // tip cap (double sided so winding does not matter)
      const i = NU;
      for (let k = 0; k < NV; k++) {
        const b0 = i * rows + k, b1 = b0 + 1, t0 = i * rows + (2 * NV - k), t1 = t0 - 1;
        idx.push(b0, b1, t0, b1, t1, t0, b0, t0, b1, b1, t0, t1);
      }
    }
    g.addGroup(s0, idx.length - s0, mi);
    start = idx.length;
  });
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/* ========================================================================== */
/* procedural textures                                                          */
/* ========================================================================== */
function tileTextures() { // black High-temperature Reusable Surface Insulation tiles, 8×8 per 1.6 m
  const N = 1024, n = 8, s = N / n, rnd = mulberry32(7);
  const c = makeCanvas(N, N), g = c.getContext('2d');
  const b = makeCanvas(N, N), gb = b.getContext('2d');
  g.fillStyle = '#060606'; g.fillRect(0, 0, N, N);
  gb.fillStyle = '#202020'; gb.fillRect(0, 0, N, N);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const r = rnd(); let v = 20 + rnd() * 12; let tint = [0, 0, 0];
    if (r < 0.08) v += 18; else if (r < 0.13) tint = [7, 3, 0];
    g.fillStyle = `rgb(${v + tint[0]},${v + tint[1]},${v + 2 + tint[2]})`;
    g.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
    const gr = gb.createLinearGradient(i * s, j * s, i * s + s, j * s + s);
    gr.addColorStop(0, '#f0f0f0'); gr.addColorStop(1, '#c8c8c8');
    gb.fillStyle = gr; gb.fillRect(i * s + 3, j * s + 3, s - 6, s - 6);
  }
  const id = g.getImageData(0, 0, N, N), d = id.data;
  for (let k = 0; k < d.length; k += 4) { const e = (rnd() - 0.5) * 7; d[k] += e; d[k + 1] += e; d[k + 2] += e; }
  g.putImageData(id, 0, 0);
  return { map: c, bump: b };
}
function blanketTextures() { // quilted white Advanced Flexible Reusable Surface Insulation, panels 0.8 m
  const N = 1024, n = 4, s = N / n, rnd = mulberry32(11);
  const c = makeCanvas(N, N), g = c.getContext('2d');
  const b = makeCanvas(N, N), gb = b.getContext('2d');
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const v = 208 + rnd() * 14;
    g.fillStyle = `rgb(${v},${v - 1},${v - 5})`; g.fillRect(i * s, j * s, s, s);
    const rg = gb.createRadialGradient(i * s + s / 2, j * s + s / 2, 4, i * s + s / 2, j * s + s / 2, s * 0.7);
    rg.addColorStop(0, '#e8e8e8'); rg.addColorStop(1, '#a8a8a8'); gb.fillStyle = rg; gb.fillRect(i * s, j * s, s, s);
  }
  g.strokeStyle = 'rgba(80,78,70,.10)'; gb.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = gb.lineWidth = 1;
  for (let k = 0; k <= N; k += 32) { [g, gb].forEach((x) => { x.beginPath(); x.moveTo(k + .5, 0); x.lineTo(k + .5, N); x.moveTo(0, k + .5); x.lineTo(N, k + .5); x.stroke(); }); }
  g.strokeStyle = 'rgba(60,58,50,.35)'; gb.strokeStyle = 'rgba(0,0,0,.9)'; g.lineWidth = gb.lineWidth = 3;
  for (let k = 0; k <= N; k += s) { [g, gb].forEach((x) => { x.beginPath(); x.moveTo(k, 0); x.lineTo(k, N); x.moveTo(0, k); x.lineTo(N, k); x.stroke(); }); }
  return { map: c, bump: b };
}
function noiseCanvas(w, h, base, amp, seed = 3, blotches = 0) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), rnd = mulberry32(seed);
  g.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`; g.fillRect(0, 0, w, h);
  for (let i = 0; i < blotches; i++) {
    const x = rnd() * w, y = rnd() * h, r = 6 + rnd() * 50, a = rnd() * 0.12;
    const rg = g.createRadialGradient(x, y, 0, x, y, r); const dk = rnd() < 0.5;
    rg.addColorStop(0, dk ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a * 0.6})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let k = 0; k < d.length; k += 4) { const e = (rnd() - 0.5) * amp; d[k] += e; d[k + 1] += e; d[k + 2] += e; }
  g.putImageData(id, 0, 0); return c;
}
function drawFlag(g, x, y, w, h, mirror) { // 13 stripes, 50 stars; canton toward the nose
  g.save(); g.translate(x, y);
  if (mirror) { g.translate(w, 0); g.scale(-1, 1); }
  const sh = h / 13;
  for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f3f1ec' : '#b22234'; g.fillRect(0, i * sh, w, sh + 0.5); }
  const cw = w * 0.4, ch = sh * 7; g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, cw, ch);
  g.fillStyle = '#f3f1ec';
  for (let r = 0; r < 9; r++) { const cols = r % 2 ? 5 : 6; for (let k = 0; k < cols; k++) {
    const sx = cw * ((r % 2 ? 2 : 1) + k * 2) / 12, sy = ch * (r + 1) / 10, R = Math.min(cw / 24, ch / 20) * 1.1;
    g.beginPath(); for (let p = 0; p < 10; p++) { const a = -Math.PI / 2 + p * Math.PI / 5, rr = p % 2 ? R * 0.42 : R; g.lineTo(sx + Math.cos(a) * rr, sy + Math.sin(a) * rr); } g.fill();
  } }
  g.restore();
}
const LETTER_FONT = '700 1px "Helvetica Neue", Helvetica, Arial, sans-serif';
function fontPx(px) { return LETTER_FONT.replace('1px', px + 'px'); }

/* The fuselage atlas is painted texel by texel from the SAME loft maths that
 * builds the mesh, so every boundary (chine line, window mask, nose cap, door
 * seams) is placed in real 3D coordinates. u = t + 0.5, v = along the body. */
function fuselageAtlas(W, H) {
  const map = new ImageData(W, H), rb = new ImageData(W, H), M = map.data, R = rb.data;
  const rows = [];
  for (let r = 0; r < H; r++) {
    const v = 1 - (r + 0.5) / H, z = ZMIN + v * (ZMAX - ZMIN), S = secAt(z);
    const P = 2 * (2 * S.hw + (S.yt - S.yb)) * 0.93;
    let chine = 1.12; if (z > 11.5) chine = 1.12 + smooth(11.5, 17.4, z) * 2.2; if (z > 17.4) chine = 3.32 + (z - 17.4) * 0.6;
    rows.push({ z, S, P, chine });
  }
  const colC = new Float32Array(W), colS = new Float32Array(W), colT = new Float32Array(W);
  for (let q = 0; q < W; q++) { const t = (q + 0.5) / W - 0.5, phi = TAU * t - Math.PI / 2; colT[q] = t; colC[q] = Math.cos(phi); colS[q] = Math.sin(phi); }
  const panes = [ // forward windshields: [|x|min, |x|max, zmin, zmax]
    [0.07, 0.64, 14.98, 15.78], [0.76, 1.40, 14.86, 15.66], [1.52, 2.16, 14.68, 15.46],
  ];
  const X = new Float32Array(W), Y = new Float32Array(W); let lastKey = '';
  for (let r = 0; r < H; r++) {
    const { z, S, P, chine } = rows[r];
    const key = [S.hw, S.yb, S.yc, S.yt, S.nb, S.nt].map((n) => n.toFixed(4)).join();
    if (key !== lastKey) { // recompute ring only when the section changes (the midbody is constant)
      lastKey = key; const eb = 2 / S.nb, et = 2 / S.nt;
      for (let q = 0; q < W; q++) { const c = colC[q], s = colS[q]; X[q] = S.hw * Math.sign(c) * Math.pow(Math.abs(c), s < 0 ? eb : et); Y[q] = s < 0 ? S.yc - (S.yc - S.yb) * Math.pow(-s, eb) : S.yc + (S.yt - S.yc) * Math.pow(s, et); }
    }
    const fwd = z > 12.7, hatch = z > 11.65 && z < 12.75, rcs = z > 17.0 && z < 17.95, doorsRow = z > BAY0 && z < BAY1;
    const zs0 = [BAY0, -5.12, -1.44, 2.24, 5.92, BAY1].some((w) => Math.abs(z - w) < 0.035);
    const gz = frac(z / 0.2), groutZ = gz < 0.06 || gz > 0.96, tz = Math.floor(z / 0.2) + 999;
    const pz = frac(z / 0.8), seamZ = pz < 0.012, stZ = frac(z / 0.1) < 0.04, pzI = Math.floor(z / 0.8);
    for (let q = 0; q < W; q++) {
      const t = colT[q], x = X[q], y = Y[q];
      const ax = Math.abs(x);
      let kind = y < chine ? 1 : 0;              // 0 white blanket, 1 black tile, 2 RCC, 3 window, 4 dark port
      if (fwd) {
        if (z > 14.25 && z < 16.2 && y > S.yc + 0.3 && ax < 2.45) kind = 1;       // windscreen mask
        if (z > 12.75 && z < 14.1 && ax < 1.05 && y > S.yt - 0.35) kind = 1;       // overhead window mask
        for (let i = 0; i < 3; i++) { const pn = panes[i]; if (ax > pn[0] && ax < pn[1] && z > pn[2] && z < pn[3] && y > S.yc + 0.55) kind = 3; }
        if (z > 13.0 && z < 13.85 && ax > 0.18 && ax < 0.9 && y > S.yt - 0.25) kind = 3;
        if (rcs && ((Math.abs(y - 2.35) < 0.09 && Math.abs(z - 17.3) < 0.09) || (Math.abs(y - 2.72) < 0.09 && Math.abs(z - 17.32) < 0.09) || (Math.abs(y - 2.54) < 0.09 && Math.abs(z - 17.6) < 0.09))) kind = 4;
        if (z > 18.66) kind = 2;                                                  // Reinforced Carbon-Carbon nose cap
      }
      if (hatch && x > 0) { const d = Math.hypot(z - 12.2, y - 2.35); if (d < 0.5) { if (d > 0.45) kind = 4; if (d < 0.12) kind = 3; } }
      const a = (t + 0.5) * P, k = (r * W + q) * 4;
      let cr, cg, cb, bump = 200, rough = 225;
      if (kind === 1) {
        const ga = frac(a / 0.2), grout = groutZ || ga < 0.06 || ga > 0.96;
        const h = hash2(Math.floor(a / 0.2), tz); let v = 20 + h * 12; if (h > 0.93) v += 16;
        if (grout) { v = 7; bump = 40; } else bump = 210;
        cr = v + (h > 0.88 && h < 0.93 ? 6 : 0); cg = v + (h > 0.88 && h < 0.93 ? 3 : 0); cb = v + 2; rough = 205;
      } else if (kind === 0) {
        const pa = frac(a / 0.8), seam = seamZ || pa < 0.012;
        const st = stZ || frac(a / 0.1) < 0.04;
        const h = hash2(Math.floor(a / 0.8) + 77, pzI);
        let v = 206 + h * 14; if (seam) v -= 46; else if (st) v -= 8;
        const grime = smooth(chine + 0.9, chine, y) * 16;
        cr = v - grime * 0.6; cg = v - 1 - grime * 0.8; cb = v - 5 - grime; bump = seam ? 30 : st ? 150 : 205; rough = 238;
        if (doorsRow && y > HINGE_Y - 0.03) { // payload bay doors: segment and centre seams
          if (zs0 || Math.abs(t) > 0.4975 || Math.abs(y - HINGE_Y) < 0.03) { cr = cg = cb = 95; bump = 10; }
        }
      } else if (kind === 2) {
        const h = hash2(Math.floor(a / 0.04), Math.floor(z / 0.04)); const v = 78 + h * 12;
        cr = v; cg = v + 2; cb = v + 5; rough = 150; bump = 170 + h * 40;
      } else if (kind === 3) {
        const g2 = 34 + (y - S.yc) * 5; cr = g2 * 0.75; cg = g2 * 0.9; cb = g2 * 1.12; rough = 10; bump = 235;
      } else { cr = cg = cb = 10; rough = 200; bump = 60; }
      M[k] = cr; M[k + 1] = cg; M[k + 2] = cb; M[k + 3] = 255;
      R[k] = bump; R[k + 1] = rough; R[k + 2] = 0; R[k + 3] = 255;
    }
  }
  const cm = makeCanvas(W, H); cm.getContext('2d').putImageData(map, 0, 0);
  const cr = makeCanvas(W, H); cr.getContext('2d').putImageData(rb, 0, 0);
  return { map: cm, rb: cr };
}
function wingTopCanvas(side, blanket) {
  const W = 1024, H = 2048, c = makeCanvas(W, H), g = c.getContext('2d');
  const px = (x) => (x - WING.xr) / (WING.xt - WING.xr) * W, py = (z) => (1 - (z - WZ0) / (WZ1 - WZ0)) * H;
  const pat = g.createPattern(blanket, 'repeat'); const m = new DOMMatrix(); m.scaleSelf(W / (WING.xt - WING.xr) / (1024 / 3.2), H / (WZ1 - WZ0) / (1024 / 3.2));
  pat.setTransform(m); g.fillStyle = pat; g.fillRect(0, 0, W, H);
  // work in a "seen from above" frame: port wing's u axis runs toward screen-left
  g.save(); if (side > 0) { g.translate(W, 0); g.scale(-1, 1); }
  const X = side > 0 ? (x) => W - px(x) : px; // screen-x of a span station
  // elevons: two per wing along the trailing edge
  g.strokeStyle = 'rgba(70,70,70,.8)'; g.lineWidth = 3;
  [[3.1, 7.3], [7.45, 11.5]].forEach(([a, b]) => {
    g.beginPath(); g.moveTo(X(a), py(wingTE(a) + 2.1)); g.lineTo(X(b), py(wingTE(b) + 1.7)); g.lineTo(X(b), py(wingTE(b))); g.moveTo(X(a), py(wingTE(a) + 2.1)); g.lineTo(X(a), py(wingTE(a))); g.stroke();
  });
  // light grey band of white Low-temperature Reusable Surface Insulation tiles behind the leading edge
  g.fillStyle = 'rgba(160,165,172,.18)';
  g.beginPath(); for (let x = WING.xr; x <= WING.xt; x += 0.25) g.lineTo(X(x), py(wingLE(x) - 0.25)); for (let x = WING.xt; x >= WING.xr; x -= 0.25) g.lineTo(X(x), py(wingLE(x) - 1.1)); g.fill();
  // markings — seen from above with the nose up, text reads nose → tail
  if (side > 0) { // port wing: "USA" above the flag
    const cx = X(7.4), cz = -6.9;
    g.save(); g.translate(cx, py(cz)); g.rotate(Math.PI / 2);
    g.fillStyle = '#141414'; g.font = fontPx(150); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('USA', 0, -40); drawFlag(g, -150, 55, 300, 158, false);
    g.restore();
  } else {        // starboard wing: orbiter name
    g.save(); g.translate(X(7.3), py(-6.6)); g.rotate(Math.PI / 2);
    g.fillStyle = '#141414'; g.font = fontPx(112); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('Endeavour', 0, 0); g.restore();
  }
  g.restore();
  return c;
}
function decalCanvas(kind, mirror) {
  if (kind === 'name') {
    const c = makeCanvas(1024, 256), g = c.getContext('2d');
    g.fillStyle = '#111'; g.font = fontPx(150); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('Endeavour', 512, 132); return c;
  }
  const c = makeCanvas(2048, 256), g = c.getContext('2d');
  g.fillStyle = '#111'; g.font = fontPx(170); g.textBaseline = 'middle';
  if (!mirror) { drawFlag(g, 10, 38, 340, 180, false); g.textAlign = 'left'; g.fillText('United States', 410, 134); }
  else { drawFlag(g, 2048 - 350, 38, 340, 180, true); g.textAlign = 'right'; g.fillText('United States', 2048 - 410, 134); }
  return c;
}
function stripesCanvas() { // RS-25 nozzle: brazed coolant tubes + hatband stiffeners
  const c = makeCanvas(1024, 256), g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#6f6863'); gr.addColorStop(1, '#948a80');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 256);
  for (let x = 0; x < 1024; x += 4) { g.fillStyle = `rgba(0,0,0,${0.18 + Math.random() * 0.1})`; g.fillRect(x, 0, 1, 256); g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x + 2, 0, 1, 256); }
  [70, 132, 190].forEach((y) => { g.fillStyle = '#4a4541'; g.fillRect(0, y, 1024, 7); g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(0, y, 1024, 1); });
  return c;
}
function radiatorCanvas() { // silver-Teflon radiator panels on the inside of the doors
  const c = makeCanvas(512, 1024), g = c.getContext('2d');
  g.fillStyle = '#cfd3d6'; g.fillRect(0, 0, 512, 1024);
  const panelTop = 0, panelBot = 1024 * 0.76; // forward ~3/4 of the door carries radiators (v=1 is forward)
  for (let p = 0; p < 4; p++) {
    const y0 = panelTop + p * (panelBot - panelTop) / 4 + 6, y1 = panelTop + (p + 1) * (panelBot - panelTop) / 4 - 6;
    const gr = g.createLinearGradient(0, y0, 512, y1); gr.addColorStop(0, '#f4f7fa'); gr.addColorStop(0.5, '#dfe6ec'); gr.addColorStop(1, '#f7f9fb');
    g.fillStyle = gr; g.fillRect(14, y0, 484, y1 - y0);
    g.fillStyle = 'rgba(120,130,140,.35)'; for (let x = 24; x < 498; x += 10) g.fillRect(x, y0 + 4, 1, y1 - y0 - 8);
    g.strokeStyle = 'rgba(90,96,104,.7)'; g.lineWidth = 2; g.strokeRect(14, y0, 484, y1 - y0);
  }
  g.fillStyle = '#b9b8b0'; g.fillRect(0, panelBot, 512, 1024 - panelBot);
  return c;
}
function linerCanvas() {
  const c = makeCanvas(512, 1024), g = c.getContext('2d');
  g.fillStyle = '#bdbbb4'; g.fillRect(0, 0, 512, 1024);
  for (let y = 0; y < 1024; y += 64) { g.fillStyle = 'rgba(40,40,40,.35)'; g.fillRect(0, y, 512, 6); g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(0, y + 6, 512, 2); }
  for (let x = 0; x < 512; x += 128) { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(x, 0, 3, 1024); }
  return c;
}
function etCanvas() { // External Tank spray-on foam insulation; v = 0 aft dome → 1 nose spike
  const W = 512, H = 2048, c = noiseCanvas(W, H, [196, 104, 44], 16, 21, 2600), g = c.getContext('2d');
  // streaks
  const rnd = mulberry32(5);
  for (let i = 0; i < 380; i++) { const x = rnd() * W, y = rnd() * H, l = 30 + rnd() * 240; g.fillStyle = `rgba(${rnd() < 0.5 ? '90,40,10' : '255,190,120'},${0.05 + rnd() * 0.06})`; g.fillRect(x, y, 1 + rnd() * 2, l); }
  // intertank (y 27.0 – 33.6 of 46.9 m): darker with stringers
  const y0 = H * (1 - 33.6 / 46.9), y1 = H * (1 - 27.0 / 46.9);
  g.fillStyle = 'rgba(95,45,15,.42)'; g.fillRect(0, y0, W, y1 - y0);
  for (let x = 0; x < W; x += 8) { g.fillStyle = 'rgba(40,18,5,.45)'; g.fillRect(x, y0, 2, y1 - y0); g.fillStyle = 'rgba(255,170,100,.12)'; g.fillRect(x + 3, y0, 1, y1 - y0); }
  g.fillStyle = 'rgba(40,18,5,.6)'; g.fillRect(0, y0, W, 4); g.fillRect(0, y1 - 4, W, 4);
  // faint ring frames on the hydrogen barrel
  for (let yy = 3; yy < 27; yy += 2.6) { g.fillStyle = 'rgba(80,35,10,.12)'; g.fillRect(0, H * (1 - yy / 46.9), W, 3); }
  return c;
}
function srbCanvas() {
  const W = 512, H = 2048, c = noiseCanvas(W, H, [226, 226, 222], 7, 31, 900), g = c.getContext('2d');
  const L = 45.46;
  [11.2, 18.4, 25.6, 32.8].forEach((y) => { const py = H * (1 - y / L); g.fillStyle = '#7d7f84'; g.fillRect(0, py - 5, W, 10); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(0, py + 5, W, 2); });
  const gr = g.createLinearGradient(0, H, 0, H * (1 - 9 / L)); gr.addColorStop(0, 'rgba(90,80,70,.35)'); gr.addColorStop(1, 'rgba(90,80,70,0)'); g.fillStyle = gr; g.fillRect(0, H * (1 - 9 / L), W, H * 9 / L);
  return c;
}
function floorCanvas() {
  const N = 1024, c = noiseCanvas(N, N, [58, 60, 66], 14, 41, 500), g = c.getContext('2d');
  g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 3; for (let k = 0; k <= N; k += 256) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, N); g.moveTo(0, k); g.lineTo(N, k); g.stroke(); }
  return c;
}
function glowSprite(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,220,170,.35)') {
  const c = makeCanvas(256, 256), g = c.getContext('2d'); const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  rg.addColorStop(0, inner); rg.addColorStop(0.12, inner); rg.addColorStop(0.3, mid); rg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 256, 256); return c;
}

/* ========================================================================== */
/* shaders                                                                      */
/* ========================================================================== */
const NOISE_GLSL = /* glsl */`
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+10.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){ // Ashima Arts / Stefan Gustavson simplex noise (MIT)
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy; i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx; vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_); vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw); vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3))); p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.5-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 105.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<6;i++){ s+=a*snoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;
// One-time GPU bake of a procedural Earth into equirectangular textures.
const EARTH_BAKE_FRAG = /* glsl */`
varying vec2 vUv; ${NOISE_GLSL}
// Bakes raw fields; the runtime shader thresholds them with fine noise so coastlines and cloud edges stay crisp up close.
void main(){
  float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.1415927;
  vec3 p = vec3(cos(lat) * sin(lon), sin(lat), cos(lat) * cos(lon));
  float h = fbm(p * 1.55 + vec3(1.7, 3.1, 0.4)) + 0.28 * fbm(p * 4.6 + 11.0);
  float alat = abs(p.y);
  float dry = smoothstep(0.35, 0.75, fbm(p * 2.4 + 7.0) * 0.5 + 0.5 + 0.25 - abs(alat - 0.33) * 1.3);
  #ifdef CLOUDS
    vec3 q = p * 2.6;
    float c = fbm(q + 0.8 * vec3(fbm(q * 1.3), fbm(q * 1.3 + 5.2), 0.0));
    c += 0.12 * (1.0 - smoothstep(0.0, 0.3, abs(alat - 0.1))) - 0.06;
    float land = smoothstep(0.06, 0.1, h);
    float city = pow(clamp(snoise(p * 70.0) * 0.5 + 0.5, 0.0, 1.0), 7.0) * smoothstep(0.1, 0.5, fbm(p * 6.0 + 3.0) * 0.5 + 0.5);
    city *= land * (1.0 - smoothstep(0.78, 0.86, alat)) * (1.0 - dry * 0.7) * 3.0;
    gl_FragColor = vec4(clamp(c * 0.5 + 0.5, 0.0, 1.0), clamp(city, 0.0, 1.0), 0.0, 1.0);
  #else
    vec3 green = vec3(0.05, 0.1, 0.035), desert = vec3(0.36, 0.26, 0.15), rock = vec3(0.17, 0.15, 0.12);
    vec3 lc = mix(green, desert, dry); lc = mix(lc, rock, smoothstep(0.28, 0.5, h)) * (0.85 + 0.3 * snoise(p * 40.0));
    gl_FragColor = vec4(lc, clamp(h * 0.5 + 0.5, 0.0, 1.0));
  #endif
}`;
const EARTH_VERT = /* glsl */`
varying vec3 vN; varying vec3 vW; varying vec3 vO;
void main(){ vO = normalize(position); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const EARTH_FRAG = /* glsl */`
uniform sampler2D uSurf; uniform sampler2D uCloud; uniform vec3 uSun; uniform float uTime;
varying vec3 vN; varying vec3 vW; varying vec3 vO;
${NOISE_GLSL}
vec2 eq(vec3 p){ return vec2(atan(p.x, p.z) / 6.2831853 + 0.5, asin(clamp(p.y, -1.0, 1.0)) / 3.1415927 + 0.5); }
void main(){
  vec3 n = normalize(vN), v = normalize(cameraPosition - vW), p = normalize(vO);
  float d1 = snoise(p * 95.0), d2 = snoise(p * 310.0);
  float detail = d1 * 0.6 + d2 * 0.4;
  vec4 s = texture2D(uSurf, eq(p));
  float h = s.a * 2.0 - 1.0 + detail * 0.035;
  float aw = max(fwidth(h) * 1.5, 0.004);
  float land = smoothstep(0.08 - aw, 0.08 + aw, h);
  vec3 ocean = mix(vec3(0.004, 0.026, 0.075), vec3(0.014, 0.1, 0.21), smoothstep(-0.1, 0.075, h));
  vec3 surf = mix(ocean, s.rgb * (0.9 + 0.2 * d2), land);
  float ice = smoothstep(0.8, 0.88, abs(p.y) + 0.04 * detail);
  surf = mix(surf, vec3(0.8, 0.85, 0.9), ice);
  vec2 cu = eq(p); cu.x += uTime * 0.0016;
  vec4 cl = texture2D(uCloud, cu);
  float craw = cl.r * 2.0 - 1.0 + detail * 0.09;
  float clouds = smoothstep(0.02, 0.42, craw) * 0.94;
  float ndl = dot(n, uSun);
  float day = smoothstep(-0.1, 0.22, ndl);
  vec3 col = surf * (max(ndl, 0.0) * 1.6 + 0.012);
  vec3 r = reflect(-uSun, n);
  float spec = pow(max(dot(r, v), 0.0), 140.0) * (1.0 - land) * (1.0 - clouds) * step(0.0, ndl);
  col += vec3(1.0, 0.86, 0.66) * spec * 1.3;
  vec3 cloudCol = vec3(1.0, 0.99, 0.97) * (max(ndl, 0.0) * 1.3 + 0.01) * (0.86 + 0.14 * d1);
  col = mix(col, cloudCol, clouds);
  col += vec3(1.0, 0.62, 0.28) * cl.g * (1.0 - day) * 1.3 * (1.0 - clouds * 0.75);
  float fr = pow(1.0 - max(dot(n, v), 0.0), 5.0);
  float sunF = smoothstep(-0.3, 0.35, ndl);
  col = mix(col, vec3(0.28, 0.55, 1.0) * sunF * 1.1, fr * 0.7);
  col += vec3(1.0, 0.42, 0.16) * exp(-abs(ndl) * 12.0) * 0.1 * fr;
  gl_FragColor = vec4(col, 1.0);
}`;
const ATMO_VERT = /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ATMO_FRAG = /* glsl */`
uniform vec3 uSun; uniform vec3 uCenter; uniform float uR; uniform float uRa; varying vec3 vW;
void main(){
  vec3 rd = normalize(vW - cameraPosition), oc = cameraPosition - uCenter;
  float tca = -dot(oc, rd); vec3 pc = cameraPosition + rd * max(tca, 0.0);
  float b = length(pc - uCenter);
  float h = clamp((b - uR) / (uRa - uR), 0.0, 1.0);
  float dens = exp(-h * 4.5) * (1.0 - h);
  float sunF = dot(normalize(pc - uCenter), uSun);
  float lit = smoothstep(-0.32, 0.25, sunF);
  vec3 col = mix(vec3(1.0, 0.42, 0.14), vec3(0.32, 0.6, 1.0), smoothstep(-0.12, 0.3, sunF));
  gl_FragColor = vec4(col * dens * lit * 1.9, 1.0);
}`;
function beamMaterial(color, strength, up = false) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uStr: { value: strength } },
    vertexShader: 'varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv=uv; vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); vN=normalize(normalMatrix*normal); gl_Position=projectionMatrix*mv; }',
    fragmentShader: `uniform vec3 uColor; uniform float uStr; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ float e = pow(abs(dot(normalize(vN), normalize(vV))), 2.0); float a = ${up ? '1.0 - vUv.y' : 'vUv.y'}; a = pow(a, 1.8); gl_FragColor = vec4(uColor * uStr * e * a, 1.0); }`,
  });
}

/* ========================================================================== */
/* init                                                                         */
/* ========================================================================== */
async function init() {
  const data = await (await fetch('data/endeavour.json')).json();   const stage = $('#stage');
  const isPhone = matchMedia('(max-width: 820px)').matches || matchMedia('(pointer: coarse)').matches;
  let quality = 'high';
  try { quality = localStorage.getItem('cx-shuttle-q') || (isPhone ? 'medium' : 'high'); } catch (e) { quality = isPhone ? 'medium' : 'high'; }
  const Q = { high: { pr: 2, shadow: 2048, bloom: true, samples: 4, atlas: 2048 }, medium: { pr: 1.5, shadow: 1024, bloom: true, samples: 0, atlas: 2048 }, low: { pr: 1, shadow: 0, bloom: false, samples: 0, atlas: 1024 } };
  const qp = new URLSearchParams(location.search).get('q'); if (qp && Q[qp]) quality = qp;
  if (!Q[quality]) quality = 'high';

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, Q[quality].pr));
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = Q[quality].shadow > 0; renderer.shadowMap.type = THREE.PCFShadowMap;
  stage.appendChild(renderer.domElement);
  renderer.domElement.setAttribute('aria-label', 'Space Shuttle Endeavour 3D view');
  MAX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.3, 40000);
  camera.position.set(34, 13, 32);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04, 0.1, 100, { size: 64 }).texture;
  scene.environmentIntensity = 0.5;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.07; controls.rotateSpeed = 0.6; controls.zoomSpeed = 0.8;
  controls.target.set(0, 7, 0); controls.enablePan = true; controls.panSpeed = 0.5;
  controls.autoRotateSpeed = 0.5;

  /* ---------------- materials ---------------- */
  const tiles = tileTextures(), blank = blanketTextures();   const tileMap = tex(tiles.map, { repeat: [1, 1] }), tileBump = tex(tiles.bump, { srgb: false, repeat: [1, 1] });
  const blankRep = 1 / 3.2;
  const blankMap = tex(blank.map, { repeat: [blankRep, blankRep] }), blankBump = tex(blank.bump, { srgb: false, repeat: [blankRep, blankRep] });
  const atlas = fuselageAtlas(Q[quality].atlas, Q[quality].atlas);   const atlasMap = tex(atlas.map), atlasRB = tex(atlas.rb, { srgb: false });
  const M = {
    fuselage: new THREE.MeshStandardMaterial({ map: atlasMap, roughnessMap: atlasRB, bumpMap: atlasRB, bumpScale: 0.6, roughness: 1, metalness: 0 }),
    tile: new THREE.MeshStandardMaterial({ map: tileMap, bumpMap: tileBump, bumpScale: 0.8, roughness: 0.82, metalness: 0 }),
    blanket: new THREE.MeshStandardMaterial({ map: blankMap, bumpMap: blankBump, bumpScale: 0.5, roughness: 0.9, metalness: 0 }),
    rcc: new THREE.MeshStandardMaterial({ map: tex(noiseCanvas(256, 256, [88, 90, 94], 22, 9, 40), { repeat: [2, 2] }), roughness: 0.6, metalness: 0.05 }),
    base: new THREE.MeshStandardMaterial({ color: 0x2a2a2e, roughness: 0.7, metalness: 0.3 }),
    engine: new THREE.MeshStandardMaterial({ map: tex(stripesCanvas()), color: 0xd8d0c8, roughness: 0.38, metalness: 0.85 }),
    engineIn: new THREE.MeshStandardMaterial({ color: 0x2e2a28, roughness: 0.55, metalness: 0.7, side: THREE.BackSide }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.35, metalness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.6, metalness: 0.4 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    white: new THREE.MeshStandardMaterial({ color: 0xeeeeea, roughness: 0.75 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xd9a948, roughness: 0.32, metalness: 0.95 }),
    radiator: new THREE.MeshStandardMaterial({ map: tex(radiatorCanvas()), roughness: 0.22, metalness: 0.35, side: THREE.DoubleSide }),
    liner: new THREE.MeshStandardMaterial({ map: tex(linerCanvas()), roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1018, roughness: 0.05, metalness: 0.2 }),
  };
  M.blanket2 = M.blanket.clone(); M.blanket2.side = THREE.DoubleSide;
  const wingTop = [1, -1].map((s) => new THREE.MeshStandardMaterial({ map: tex(wingTopCanvas(s, blank.map)), roughness: 0.9, bumpMap: blankBump, bumpScale: 0.3 }));

  /* ---------------- orbiter ---------------- */
  const orbiter = new THREE.Group(); orbiter.name = 'orbiter';
  const tag = (o, part) => { o.traverse((m) => { if (m.isMesh) { m.userData.part = part; m.castShadow = true; m.receiveShadow = true; } }); return o; };
  const add = (parent, geo, mat, part, pos, rot) => { const m = new THREE.Mesh(geo, mat); if (pos) m.position.set(...pos); if (rot) m.rotation.set(...rot); parent.add(m); tag(m, part); return m; };

  // fuselage: forward (nose + crew cabin), midbody tub, aft; doors separate
  add(orbiter, loftGeometry(zSamples(BAY1, ZMAX, 90, true), -0.5, 0.5, 120), M.fuselage, 'nose-body');
  add(orbiter, loftGeometry(zSamples(BAY0, BAY1, 24), -T_HINGE, T_HINGE, 72), M.fuselage, 'tiles');
  add(orbiter, loftGeometry(zSamples(ZMIN, BAY0, 12), -0.5, 0.5, 120), M.fuselage, 'tiles');
  const cap = add(orbiter, new THREE.ShapeGeometry(sectionShape(ZMIN)), M.base, 'engines', [0, 0, ZMIN - 0.001], [0, Math.PI, 0]);
  cap.castShadow = false;
  // nose cap & window hotspot geometry parts are painted in the atlas; re-tag the forward mesh by region on pick
  // payload bay interior
  const bay = new THREE.Group(); orbiter.add(bay);
  add(bay, loftGeometry(zSamples(BAY0, BAY1, 24), -T_HINGE, T_HINGE, 72, { shrink: 0.12, flip: true, uv: 'local' }), M.liner, 'bay');
  [BAY0 + 0.02, BAY1 - 0.02].forEach((z, i) => { const b = add(bay, new THREE.ShapeGeometry(sectionShape(z, 0.1)), M.liner, 'bay', [0, 0, z]); if (i === 1) b.rotation.y = Math.PI; });
  [-1, 1].forEach((s) => add(bay, new THREE.BoxGeometry(0.26, 0.2, BAY1 - BAY0), M.metal, 'bay', [s * (HINGE_X - 0.12), HINGE_Y - 0.08, (BAY0 + BAY1) / 2]));
  [-0.55, 0.55].forEach((x) => add(bay, new THREE.PlaneGeometry(0.62, 0.42), M.glass, 'windows', [x, 4.95, BAY1 - 0.06], [0, Math.PI, 0])); // two aft flight-deck windows
  // payload: Orbiter Docking System + tunnel + SPACEHAB (museum's STS-118 set-up) + cargo carrier
  add(bay, new THREE.CylinderGeometry(0.85, 0.85, 2.4, 32), M.white, 'bay', [0, 1.75, 7.9]);
  add(bay, new THREE.CylinderGeometry(0.62, 0.8, 0.7, 32), M.metal, 'bay', [0, 3.3, 7.9]);
  add(bay, new THREE.TorusGeometry(0.62, 0.07, 10, 40), M.dark, 'bay', [0, 3.66, 7.9], [Math.PI / 2, 0, 0]);
  add(bay, new THREE.BoxGeometry(3.9, 0.25, 1.9), M.metal, 'bay', [0, 0.62, 7.9]);
  add(bay, new THREE.CylinderGeometry(0.55, 0.55, 3.4, 24), M.blanket, 'bay', [0, 2.15, 4.9], [Math.PI / 2, 0, 0]);
  const sh = add(bay, new RoundedBoxGeometry(3.9, 3.0, 3.2, 4, 0.55), M.blanket, 'bay', [0, 2.15, 1.55]);
  add(bay, new THREE.BoxGeometry(2.6, 0.08, 2.4), M.gold, 'bay', [0, 3.68, 1.55]);
  add(bay, new THREE.BoxGeometry(4.2, 0.28, 3.2), M.metal, 'bay', [0, 2.0, -4.6]);
  [[-1.1, -4.0, 1.4, 0.9, 1.2], [0.9, -4.9, 1.6, 1.1, 1.5], [-0.2, -3.6, 1.0, 0.7, 0.8]].forEach(([x, z, w, h, d]) => add(bay, new THREE.BoxGeometry(w, h, d), M.gold, 'bay', [x, 2.14 + h / 2, z]));
  [[-1.6, -4.6], [1.6, -4.6]].forEach(([x, z]) => add(bay, new THREE.BoxGeometry(0.2, 1.6, 0.2), M.metal, 'bay', [x, 1.0, z]));

  // payload bay doors (5 segments painted), hinged along the sill
  const doorPivots = [];
  [1, -1].forEach((side) => {
    const pivot = new THREE.Group(); pivot.position.set(side * HINGE_X, HINGE_Y, 0); orbiter.add(pivot);
    const tA = side > 0 ? T_HINGE : -0.5, tB = side > 0 ? 0.5 : -T_HINGE;
    const outer = loftGeometry(zSamples(BAY0, BAY1, 24), tA, tB, 28); outer.translate(-side * HINGE_X, -HINGE_Y, 0);
    const inner = loftGeometry(zSamples(BAY0, BAY1, 24), tA, tB, 28, { shrink: 0.07, flip: true, uv: 'local' }); inner.translate(-side * HINGE_X, -HINGE_Y, 0);
    add(pivot, outer, M.fuselage, 'bay'); add(pivot, inner, M.radiator, 'bay');
    doorPivots.push({ pivot, side });
  });

  // wings
  [1, -1].forEach((s) => {
    const w = add(orbiter, wingGeometry(s), [M.tile, M.rcc, wingTop[s > 0 ? 0 : 1]], 'wing');
    w.userData.partTop = 'blankets';
  });

  // vertical stabilizer + split rudder / speed brake + drag chute housing
  const finShape = new THREE.Shape();
  [[-6.5, 5.4], [-14.7, 13.9], [-17.4, 13.9], [-17.4, 13.45], [-16.05, 13.45], [-13.3, 6.6], [-15.85, 6.6], [-15.85, 5.4]].forEach(([z, y], i) => (i ? finShape.lineTo(z, y) : finShape.moveTo(z, y)));
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.36, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.12, bevelSegments: 3, curveSegments: 4 });
  finGeo.rotateY(-Math.PI / 2); finGeo.translate(0.18, 0, 0);
  add(orbiter, finGeo, M.blanket, 'tail');
  const rudder = new THREE.Group(); rudder.position.set(0, 6.6, -13.3); rudder.rotation.x = -Math.atan2(2.75, 6.85); orbiter.add(rudder);
  const hingeL = Math.hypot(2.75, 6.85);
  const rudderHalves = [1, -1].map((s) => {
    const g = new THREE.BufferGeometry(); const c0 = 2.45, c1 = 1.35, t0 = 0.3, t1 = 0.02;
    const P = [[0, 0, 0], [s * t0, 0, 0], [s * t1, 0, -c0], [0, 0, -c0], [0, hingeL, 0], [s * t0 * 0.7, hingeL, 0], [s * t1, hingeL, -c1], [0, hingeL, -c1]];
    const quads = [[0, 1, 2, 3], [4, 7, 6, 5], [1, 5, 6, 2], [0, 3, 7, 4], [0, 4, 5, 1], [3, 2, 6, 7]];
    const pos = []; quads.forEach((q) => { const [a, b, c, d] = q.map((k) => P[k]); const tri = s > 0 ? [a, b, c, a, c, d] : [a, c, b, a, d, c]; tri.forEach((p) => pos.push(...p)); });
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
    const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i + 2] / 3.2, pos[i + 1] / 3.2); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const h = new THREE.Group(); rudder.add(h); add(h, g, M.blanket2, 'tail'); return { h, s };
  });
  add(orbiter, new THREE.BoxGeometry(1.1, 1.1, 2.0), M.blanket, 'tail', [0, 6.05, -16.3]);
  add(orbiter, new THREE.CylinderGeometry(0.42, 0.42, 0.2, 24), M.dark, 'tail', [0, 6.05, -17.3], [Math.PI / 2, 0, 0]);

  // Orbital Maneuvering System pods
  const podProfile = [[0.001, 0], [0.74, 0.0], [0.92, 0.45], [0.99, 1.4], [1.0, 3.0], [0.98, 4.8], [0.9, 5.9], [0.72, 6.7], [0.44, 7.25], [0.001, 7.55]].map(([r, y]) => new THREE.Vector2(r, y));
  [1, -1].forEach((s) => {
    const g = new THREE.LatheGeometry(podProfile, 48); g.scale(1.0, 1, 0.8); g.rotateX(Math.PI / 2);
    const pod = add(orbiter, g, M.blanket, 'oms', [s * 1.72, 5.45, -16.25]);
    const bell = new THREE.LatheGeometry(Array.from({ length: 16 }, (_, k) => new THREE.Vector2(0.14 + 0.44 * Math.pow(k / 15, 0.62), -1.25 * k / 15)), 32);
    const ob = new THREE.Group(); ob.position.set(s * 1.75, 5.55, -16.1); ob.rotation.set(Math.PI / 2 + 0.08, 0, -s * 0.07); orbiter.add(ob);
    add(ob, bell, M.engine, 'oms'); add(ob, bell, M.engineIn, 'oms');
    for (let k = 0; k < 4; k++) add(orbiter, new THREE.BoxGeometry(0.06, 0.16, 0.16), M.dark, 'oms', [s * (1.72 + 0.93), 5.3 + (k % 2) * 0.25, -15.2 - Math.floor(k / 2) * 0.35]);
    void pod;
  });

  // three RS-25 main engines (replica nozzles on retired orbiters)
  const bellPts = []; for (let k = 0; k <= 30; k++) { const s = k / 30; bellPts.push(new THREE.Vector2(0.2 + 0.95 * Math.pow(s, 0.58), -3.05 * s)); }
  bellPts.push(new THREE.Vector2(1.18, -3.07));
  const bellGeo = new THREE.LatheGeometry(bellPts, 64);
  { const uv = bellGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
  [[0, 4.45], [1.34, 2.35], [-1.34, 2.35]].forEach(([x, y]) => {
    const e = new THREE.Group(); e.position.set(x, y, ZMIN - 0.1); e.rotation.x = Math.PI / 2; orbiter.add(e);
    add(e, bellGeo, M.engine, 'engines'); add(e, bellGeo, M.engineIn, 'engines');
    add(e, new THREE.CylinderGeometry(0.62, 0.95, 0.35, 32), M.dark, 'engines', [0, 0.1, 0]); // flexible heat-shield boot
  });
  add(orbiter, tiledBox(6.0, 0.5, 2.6), M.tile, 'tiles', [0, 0.52, ZMIN - 1.25]); // body flap

  // landing gear (tricycle) + doors
  const gear = { nose: null, mains: [], doors: [] };
  const mkGear = (x, y, z, strut, wheelR, wheelW, spread) => {
    const pivot = new THREE.Group(); pivot.position.set(x, y, z); orbiter.add(pivot);
    add(pivot, new THREE.CylinderGeometry(0.12, 0.14, strut, 14), M.metal, 'gear', [0, -strut / 2, 0]);
    add(pivot, new THREE.CylinderGeometry(0.2, 0.2, 0.9, 14), M.metal, 'gear', [0, -0.45, 0]);
    add(pivot, new THREE.BoxGeometry(spread * 2 + wheelW, 0.14, 0.18), M.metal, 'gear', [0, -strut, 0]);
    [-1, 1].forEach((k) => {
      add(pivot, new THREE.CylinderGeometry(wheelR, wheelR, wheelW, 28), M.rubber, 'gear', [k * spread, -strut, 0], [0, 0, Math.PI / 2]);
      add(pivot, new THREE.CylinderGeometry(wheelR * 0.55, wheelR * 0.55, wheelW + 0.02, 20), M.metal, 'gear', [k * spread, -strut, 0], [0, 0, Math.PI / 2]);
    });
    return pivot;
  };
  // wheel bottoms at y = -2.51 for both gears (sits the orbiter on the museum pedestals)
  gear.nose = mkGear(0, 0.25, 13.4, 2.35, 0.41, 0.28, 0.25);
  gear.mains = [1, -1].map((s) => mkGear(s * 3.45, 0.35, -4.6, 2.3, 0.56, 0.36, 0.33));
  const mkDoor = (hx, y, z, w, l, dir, mat) => { const p = new THREE.Group(); p.position.set(hx, y, z); orbiter.add(p); add(p, tiledBox(w, 0.05, l), mat, 'gear', [-dir * w / 2, 0, 0]); p.userData.dir = dir; gear.doors.push(p); return p; };
  mkDoor(0.55, -0.02, 13.3, 0.54, 2.5, 1, M.tile); mkDoor(-0.55, -0.02, 13.3, 0.54, 2.5, -1, M.tile);
  [1, -1].forEach((s) => mkDoor(s * 4.08, wingSurfY(3.45, -4.6, false) - 0.03, -4.4, 1.25, 3.1, s, M.tile));

  // Canadarm (Shuttle Remote Manipulator System) on the port sill, and the inspection boom on the starboard sill
  const arm = { base: new THREE.Group(), yaw: new THREE.Group(), pitch: new THREE.Group(), elbow: new THREE.Group(), wrist: new THREE.Group() };
  arm.base.position.set(2.2, 4.52, 8.7); orbiter.add(arm.base); arm.base.add(arm.yaw); arm.yaw.add(arm.pitch);
  add(arm.base, new THREE.BoxGeometry(0.5, 0.35, 0.5), M.dark, 'arm', [0, -0.12, 0]);
  add(arm.pitch, new THREE.SphereGeometry(0.27, 20, 14), M.dark, 'arm');
  add(arm.pitch, new THREE.CylinderGeometry(0.19, 0.19, 6.37, 20), M.blanket, 'arm', [0, 0, -3.3], [Math.PI / 2, 0, 0]);
  arm.elbow.position.set(0, 0, -6.55); arm.pitch.add(arm.elbow);
  add(arm.elbow, new THREE.SphereGeometry(0.25, 20, 14), M.dark, 'arm');
  add(arm.elbow, new THREE.BoxGeometry(0.2, 0.22, 0.3), M.metal, 'arm', [0, 0.3, 0.1]); // elbow camera
  add(arm.elbow, new THREE.CylinderGeometry(0.19, 0.19, 7.06, 20), M.blanket, 'arm', [0, 0, -3.65], [Math.PI / 2, 0, 0]);
  arm.wrist.position.set(0, 0, -7.35); arm.elbow.add(arm.wrist);
  add(arm.wrist, new THREE.SphereGeometry(0.23, 18, 12), M.dark, 'arm');
  add(arm.wrist, new THREE.CylinderGeometry(0.22, 0.22, 1.2, 20), M.metal, 'arm', [0, 0, -0.75], [Math.PI / 2, 0, 0]);
  add(arm.wrist, new THREE.CylinderGeometry(0.25, 0.25, 0.25, 20), M.dark, 'arm', [0, 0, -1.4], [Math.PI / 2, 0, 0]);
  [8.2, 2.6, -3.2].forEach((z) => add(bay, new THREE.BoxGeometry(0.2, 0.4, 0.2), M.metal, 'arm', [2.2, 4.2, z]));
  add(bay, new THREE.CylinderGeometry(0.17, 0.17, 15.0, 16), M.white, 'bay', [-2.2, 4.5, 0.9], [Math.PI / 2, 0, 0]);
  add(bay, new THREE.BoxGeometry(0.45, 0.45, 0.7), M.dark, 'bay', [-2.2, 4.5, -6.8]);

  // decals: "United States" + flag above the wing, name behind the cockpit windows
  const decalMat = (c) => new THREE.MeshStandardMaterial({ map: tex(c), transparent: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4, depthWrite: false });
  [1, -1].forEach((s) => {
    const us = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 1.05), decalMat(decalCanvas('us', s < 0)));
    us.position.set(s * 2.708, 2.72, 3.2); us.rotation.y = s * Math.PI / 2; orbiter.add(us); us.userData.part = 'tiles';
    const nm = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 0.82), decalMat(decalCanvas('name')));
    nm.position.set(s * 2.676, 3.62, 11.6); nm.rotation.y = s * Math.PI / 2; orbiter.add(nm); nm.userData.part = 'windows';
  });

  /* ---------------- hotspot anchors (orbiter local) ---------------- */
  const anchors = {};
  const anchor = (id, parent, p) => { const o = new THREE.Object3D(); o.position.set(...p); parent.add(o); anchors[id] = o; };
  anchor('nose', orbiter, [0, 2.1, 18.98]);
  anchor('windows', orbiter, [0.9, 5.55, 15.2]);
  anchor('tiles', orbiter, [2.7, 0.55, 9.1]);
  anchor('wing', orbiter, [8.4, 1.42, -10.6]);
  anchor('blankets', orbiter, [4.9, 1.47, -7.5]);
  anchor('tail', orbiter, [0.3, 11.2, -14.9]);
  anchor('oms', orbiter, [2.5, 6.0, -12.2]);
  anchor('engines', orbiter, [0, 4.45, -18.7]);
  anchor('bay', orbiter, [0, 5.66, 0.5]);
  anchor('gear', gear.mains[0], [0, -2.3, 0]);
  anchor('arm', arm.elbow, [0, 0.3, 0]);

  /* ---------------- stack: External Tank ET-94 + two solid rocket boosters ---------------- */
  const B = 2.0; // top of the display platform
  const stack = new THREE.Group(); stack.visible = false; scene.add(stack);
  const etGroup = new THREE.Group(); stack.add(etGroup);
  const srbs = [];
  {
    const R = 4.2, L = 46.9, prof = [];
    for (let k = 0; k <= 12; k++) { const a = k / 12 * Math.PI / 2; prof.push([R * Math.sin(a) + 0.001, 2.4 - 2.4 * Math.cos(a)]); }
    prof.push([R, 27.0], [R + 0.02, 27.05], [R + 0.02, 33.55], [R, 33.6], [R, 35.6]);
    const Lo = 10.2, rho = (R * R + Lo * Lo) / (2 * R);
    for (let k = 1; k <= 24; k++) { const x = Lo * k / 24; const r = Math.sqrt(rho * rho - x * x) + R - rho; prof.push([Math.max(r, 0.42), 35.6 + x]); }
    const pts = prof.filter((p, i) => i === 0 || p[1] > prof[i - 1][1] - 1e-6).map(([r, y]) => new THREE.Vector2(Math.max(r, 0.001), y));
    const g = new THREE.LatheGeometry(pts, 96);
    const uv = g.attributes.uv, ps = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setY(i, ps.getY(i) / L);
    const etMap = tex(etCanvas());
    const etMat = new THREE.MeshStandardMaterial({ map: etMap, bumpMap: etMap, bumpScale: 1.2, roughness: 0.85, metalness: 0 });
    add(etGroup, g, etMat, 'et', [0, B + 9.2, 0]);
    add(etGroup, new THREE.ConeGeometry(0.42, 1.3, 24), M.metal, 'et', [0, B + 9.2 + 45.85 + 0.6, 0]);
    add(etGroup, new THREE.CylinderGeometry(0.03, 0.03, 1.4, 6), M.metal, 'et', [0, B + 9.2 + 47.3, 0]);
    // liquid-oxygen feedline and cable tray down the tank; attach struts to the orbiter
    const feed = new THREE.CatmullRomCurve3([[3.0, 33.0, 3.05], [3.25, 30, 3.2], [3.25, 16, 3.2], [2.6, 12.5, 3.6], [1.3, 11.8, 4.9]].map(([x, y, z]) => new THREE.Vector3(x, B + y, z)));
    add(etGroup, new THREE.TubeGeometry(feed, 60, 0.22, 12, false), etMat, 'et');
    add(etGroup, new THREE.BoxGeometry(0.35, 22, 0.3), etMat, 'et', [-3.05, B + 22, 2.95], [0, Math.PI / 4, 0]);
    const strut = (a, b, r = 0.14) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b); const m = add(etGroup, new THREE.CylinderGeometry(r, r, A.distanceTo(Bv), 10), M.metal, 'et'); m.position.copy(A).add(Bv).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize()); };
    strut([0.9, B + 36.4, 4.05], [0.55, B + 40.0, 5.42]); strut([-0.9, B + 36.4, 4.05], [-0.55, B + 40.0, 5.42]);
    strut([1.3, B + 14.0, 4.0], [1.5, B + 14.8, 5.42], 0.25); strut([-1.3, B + 14.0, 4.0], [-1.5, B + 14.8, 5.42], 0.25);
    // boosters
    const srbMap = tex(srbCanvas());
    const srbMat = new THREE.MeshStandardMaterial({ map: srbMap, roughness: 0.55, metalness: 0.05 });
    const Ls = 45.46, bp = [[0.001, 0.35], [1.5, 0.0], [1.35, 0.8], [1.2, 1.12], [2.58, 1.14], [2.55, 1.45], [1.87, 5.3], [1.855, 5.4], [1.855, 40.0], [1.87, 40.2], [1.87, 41.4], [1.62, 42.6], [1.25, 43.6], [0.82, 44.4], [0.42, 45.0], [0.12, 45.38], [0.001, Ls]];
    const sg = new THREE.LatheGeometry(bp.map(([r, y]) => new THREE.Vector2(r, y)), 64);
    const su = sg.attributes.uv, sp = sg.attributes.position; for (let i = 0; i < su.count; i++) su.setY(i, sp.getY(i) / Ls);
    [1, -1].forEach((s) => {
      const gB = new THREE.Group(); gB.position.set(s * 6.55, B, 0); stack.add(gB); srbs.push(gB);
      add(gB, sg, srbMat, 'srb');
      add(gB, new THREE.CylinderGeometry(1.46, 1.05, 1.0, 40, 1, true), M.dark, 'srb', [0, 0.5, 0]);
      const st = (a, b, r) => { const A = new THREE.Vector3(...a), Bv = new THREE.Vector3(...b); const m = add(gB, new THREE.CylinderGeometry(r, r, A.distanceTo(Bv), 10), M.metal, 'srb'); m.position.copy(A).add(Bv).multiplyScalar(0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), Bv.clone().sub(A).normalize()); };
      st([-s * 1.8, 9.9, 0], [-s * 2.4, 9.9, 0.1], 0.2); st([-s * 1.8, 10.3, 0.6], [-s * 2.4, 9.6, 0.6], 0.12); st([-s * 1.8, 10.3, -0.6], [-s * 2.4, 9.6, -0.6], 0.12);
      st([-s * 1.84, 38.5, 0], [-s * 2.4, 38.5, 0], 0.3);
      for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; add(gB, new THREE.BoxGeometry(0.5, 1.2, 0.5), M.dark, 'srb', [Math.cos(a) * 2.2, 0.6, Math.sin(a) * 2.2]); }
    });
  }
  anchor('et', etGroup, [3.0, B + 32, 3.0]);
  anchors.srb = new THREE.Object3D(); anchors.srb.position.set(1.95, 26, 0.3); srbs[0].add(anchors.srb);

  /* ---------------- environments ---------------- */
  const envs = {};
  const floorTex = tex(floorCanvas(), { repeat: [18, 18] });
  const floorMat = new THREE.MeshStandardMaterial({ map: floorTex, color: 0x6a6e78, roughness: 0.34, metalness: 0.1, envMapIntensity: 0.6 });
  const mkBeam = (parent, from, to, radius, color, strength, up = false) => {
    const A = new THREE.Vector3(...from), Bv = new THREE.Vector3(...to), len = A.distanceTo(Bv);
    const g = new THREE.CylinderGeometry(up ? radius : 0.35, up ? 0.35 : radius, len, 40, 1, true);
    const m = new THREE.Mesh(g, beamMaterial(color, strength, up)); m.position.copy(A).add(Bv).multiplyScalar(0.5);
    const dir = up ? Bv.clone().sub(A) : A.clone().sub(Bv); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()); parent.add(m); m.renderOrder = 2; return m;
  };
  const mkSpot = (parent, color, intensity, pos, target, angle, penumbra, shadow = false) => {
    const l = new THREE.SpotLight(color, intensity, 0, angle, penumbra, 2); l.position.set(...pos); l.target.position.set(...target);
    parent.add(l); parent.add(l.target); if (shadow) { l.userData.shadow = true; l.castShadow = true; l.shadow.bias = -0.0003; l.shadow.normalBias = 0.03; l.shadow.mapSize.set(2048, 2048); l.shadow.camera.near = 5; l.shadow.camera.far = 200; }
    return l;
  };
  // --- (a) Samuel Oschin Pavilion 2012–2023: horizontal on stands, spot-lit hall
  {
    const g = new THREE.Group(); scene.add(g); envs.museum = g;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const pool = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshBasicMaterial({ map: tex(glowSprite('rgba(255,236,210,.20)', 'rgba(255,220,180,.06)')), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.02; g.add(pool);
    const hall = new THREE.Mesh(new THREE.BoxGeometry(260, 48, 260), new THREE.MeshStandardMaterial({ color: 0x0b0d14, roughness: 0.95, side: THREE.BackSide })); hall.position.y = 23.9; g.add(hall);
    // vertical light slits on the walls, ceiling trusses with downlights
    // tall warm light strips on the walls (bloom turns them into soft glowing columns)
    const slitMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd2a0).multiplyScalar(2.4) });
    const slits = [];
    for (let i = -4; i <= 4; i++) {
      [-129.8, 129.8].forEach((z) => { const b = new THREE.BoxGeometry(0.9, 30, 0.1); b.translate(i * 26, 18, z); slits.push(b); });
      [-129.8, 129.8].forEach((x) => { const b2 = new THREE.BoxGeometry(0.1, 30, 0.9); b2.translate(x, 18, i * 26); slits.push(b2); });
    }
    g.add(new THREE.Mesh(mergeGeometries(slits), slitMat));
    const warmMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc48a).multiplyScalar(2.2) });
    const truss = [], dots = [];
    for (let i = -6; i <= 6; i++) { const b = new THREE.BoxGeometry(150, 0.6, 0.4); b.translate(0, 34, i * 9); truss.push(b); for (let k = -7; k <= 7; k++) { const d = new THREE.CylinderGeometry(0.18, 0.18, 0.1, 10); d.translate(k * 10, 33.6, i * 9); dots.push(d); } }
    g.add(new THREE.Mesh(mergeGeometries(truss), M.dark)); g.add(new THREE.Mesh(mergeGeometries(dots), warmMat));
    // display pedestals under the wheels (wheel bottoms at y = 6.5 - 2.51)
    const pedMat = new THREE.MeshStandardMaterial({ color: 0x3a3e48, roughness: 0.45, metalness: 0.6 });
    [[0, 13.4 - 1.5], [3.45, -4.6 - 1.5], [-3.45, -4.6 - 1.5]].forEach(([x, z]) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 1.15, 3.99, 32), pedMat); p.position.set(x, 3.99 / 2, z); p.castShadow = p.receiveShadow = true; g.add(p);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.7, 0.2, 40), pedMat); base.position.set(x, 0.1, z); base.receiveShadow = true; g.add(base);
    });
    // aft cradle
    const cr = new THREE.Mesh(new THREE.BoxGeometry(1.2, 6.45, 1.2), pedMat); cr.position.set(0, 3.225, -14.6); cr.castShadow = true; g.add(cr);
    // stanchions + ropes
    const posts = [], ropeCurves = [], N = 26;
    for (let i = 0; i < N; i++) { const a = i / N * TAU; const x = Math.cos(a) * 21, z = Math.sin(a) * 27 - 1.5; const p = new THREE.CylinderGeometry(0.05, 0.07, 1.0, 10); p.translate(x, 0.5, z); posts.push(p); const b = new THREE.SphereGeometry(0.09, 10, 8); b.translate(x, 1.02, z); posts.push(b); }
    g.add(new THREE.Mesh(mergeGeometries(posts), M.metal));
    for (let i = 0; i < N; i++) { const a0 = i / N * TAU, a1 = (i + 1) / N * TAU; const p0 = new THREE.Vector3(Math.cos(a0) * 21, 0.95, Math.sin(a0) * 27 - 1.5), p1 = new THREE.Vector3(Math.cos(a1) * 21, 0.95, Math.sin(a1) * 27 - 1.5); const mid = p0.clone().add(p1).multiplyScalar(0.5); mid.y -= 0.25; ropeCurves.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, mid, p1), 10, 0.035, 6)); }
    g.add(new THREE.Mesh(mergeGeometries(ropeCurves), new THREE.MeshStandardMaterial({ color: 0x3a1420, roughness: 0.7 })));
    // lights
    g.add(new THREE.HemisphereLight(0x8fa4d8, 0x14100c, 0.35));
    mkSpot(g, 0xffe2c0, 2300, [22, 32, 26], [0, 5, 0], 0.5, 0.65, true);
    mkSpot(g, 0x9cc4ff, 3000, [-26, 30, -28], [0, 6, -2], 0.45, 0.7);
    mkSpot(g, 0xffffff, 450, [0, 33, 2], [0, 6, 1], 0.35, 0.9);
    mkSpot(g, 0xffd0a0, 700, [-24, 14, 26], [0, 3, 6], 0.4, 0.8);
    mkBeam(g, [22, 32, 26], [0, 0, 0], 13, 0xffd6a8, 0.05);
    mkBeam(g, [-26, 30, -28], [0, 0, -2], 11, 0x8fb8ff, 0.045);
    mkBeam(g, [0, 33, 2], [0, 0, 1], 9, 0xffffff, 0.03);
    Object.assign(g.userData, { bg: 0x05060b, fog: new THREE.FogExp2(0x05060b, 0.0048), envI: 0.45, exposure: 1.0 });
  }
  // --- (b) Samuel Oschin Air and Space Center: vertical launch stack in a tall atrium
  {
    const g = new THREE.Group(); scene.add(g); envs.stack = g; g.visible = false;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), floorMat); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
    const pmat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.55, metalness: 0.4 });
    const plat = new THREE.Mesh(new RoundedBoxGeometry(30, B, 22, 3, 0.4), pmat); plat.position.y = B / 2; plat.receiveShadow = plat.castShadow = true; g.add(plat);
    const edge = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7cc8ff).multiplyScalar(2.2) });
    [[0, 11.05, 30, 0.08], [0, -11.05, 30, 0.08]].forEach(([x, z, w, d]) => { const e = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), edge); e.position.set(x, B - 0.25, z); g.add(e); });
    [[15.05, 0], [-15.05, 0]].forEach(([x, z]) => { const e = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, 22), edge); e.position.set(x, B - 0.25, z); g.add(e); });
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(150, 150, 170, 96, 1, true), new THREE.MeshStandardMaterial({ color: 0x090b12, roughness: 0.95, side: THREE.BackSide })); wall.position.y = 85; g.add(wall);
    const fins = [];
    for (let i = 0; i < 48; i++) { const a = i / 48 * TAU; const f = new THREE.BoxGeometry(0.5, 120, 0.5); f.translate(Math.cos(a) * 149, 66, Math.sin(a) * 149); fins.push(f); }
    g.add(new THREE.Mesh(mergeGeometries(fins), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb070).multiplyScalar(0.7) })));
    const ceil = new THREE.Mesh(new THREE.CircleGeometry(150, 64), new THREE.MeshStandardMaterial({ color: 0x07080d, roughness: 1, side: THREE.DoubleSide })); ceil.rotation.x = Math.PI / 2; ceil.position.y = 168; g.add(ceil);
    // gantry-style elevator tower with a crew access walkway (the museum's 140-foot elevator ride)
    const gm = new THREE.MeshStandardMaterial({ color: 0x3a3f4a, roughness: 0.5, metalness: 0.7 });
    const parts = [], gx = -15.5, gz = 7.5, H = 50, s = 2.6;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { const p = new THREE.BoxGeometry(0.35, H, 0.35); p.translate(gx + a * s, H / 2, gz + b * s); parts.push(p); });
    for (let y = 2; y <= H; y += 4) {
      [[0, -1, 2 * s, 0.25], [0, 1, 2 * s, 0.25]].forEach(([, b, w]) => { const h = new THREE.BoxGeometry(w, 0.25, 0.25); h.translate(gx, y, gz + b * s); parts.push(h); });
      [[-1, 0], [1, 0]].forEach(([a]) => { const h = new THREE.BoxGeometry(0.25, 0.25, 2 * s); h.translate(gx + a * s, y, gz); parts.push(h); });
      if (y + 4 <= H) [-1, 1].forEach((b) => { const d = new THREE.BoxGeometry(0.16, Math.hypot(2 * s, 4), 0.16); d.rotateZ(Math.atan2(2 * s, 4) * (((y / 4) | 0) % 2 ? 1 : -1)); d.translate(gx, y + 2, gz + b * s); parts.push(d); });
    }
    const armW = new THREE.BoxGeometry(11.5, 0.3, 1.6); armW.translate(gx + 7.0, B + 39.6, gz - 0.3); parts.push(armW);
    const g2 = new THREE.Mesh(mergeGeometries(parts), gm); g2.castShadow = true; g2.receiveShadow = true; g.add(g2);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(4.2, 3.2, 4.2), new THREE.MeshStandardMaterial({ color: 0x2b303a, roughness: 0.4, metalness: 0.6 })); cab.position.set(gx, 30, gz); g.add(cab);
    const cabWin = new THREE.Mesh(new THREE.BoxGeometry(4.25, 1.1, 4.25), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffd8a0).multiplyScalar(2.0) })); cabWin.position.set(gx, 30.5, gz); g.add(cabWin);
    envs.stack.userData.cab = cab; envs.stack.userData.cabWin = cabWin;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(11.5, 0.9, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x7cc8ff).multiplyScalar(1.4) })); rail.position.set(gx + 7.0, B + 40.3, gz + 0.5); g.add(rail);
    g.add(new THREE.HemisphereLight(0x8aa0d0, 0x120c08, 0.3));
    mkSpot(g, 0xffd7b0, 11000, [52, 10, 58], [0, 36, 0], 0.36, 0.7, true);
    mkSpot(g, 0x9cc6ff, 9000, [-50, 6, -36], [0, 36, 0], 0.4, 0.7);
    mkSpot(g, 0xffffff, 5000, [14, 120, 36], [0, 28, 0], 0.3, 0.9);
    mkSpot(g, 0xffb888, 4200, [36, 4, -46], [0, 32, 0], 0.35, 0.8);
    mkSpot(g, 0xbfd6ff, 2600, [-40, 40, 50], [0, 30, 4], 0.4, 0.9);
    mkBeam(g, [52, 10, 58], [4, 70, -6], 16, 0xffcfa0, 0.025, true);
    mkBeam(g, [-50, 6, -36], [-2, 70, 4], 14, 0x8ab6ff, 0.03, true);
    Object.assign(g.userData, { bg: 0x05060b, fog: new THREE.FogExp2(0x05060b, 0.0032), envI: 0.4, exposure: 1.0 });
  }
  // --- (c) Low Earth Orbit: payload bay open over Earth's limb
  const earthR = 3000, earthC = new THREE.Vector3(0, -earthR - 190, -600);
  const sunDir = new THREE.Vector3(-0.62, 0.62, -0.48).normalize();
  const earthU = { uSurf: { value: null }, uCloud: { value: null }, uSun: { value: sunDir.clone() }, uTime: { value: 0 } };
  {
    const g = new THREE.Group(); scene.add(g); envs.orbit = g; g.visible = false;
    // bake the procedural Earth once on the GPU
    const bake = (define, w, h) => {
      const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.UnsignedByteType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping });
      const mat = new THREE.ShaderMaterial({ defines: define ? { CLOUDS: 1 } : {}, vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }', fragmentShader: EARTH_BAKE_FRAG, depthTest: false, depthWrite: false });
      const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); const sc = new THREE.Scene(); sc.add(q);
      const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      const prevTM = renderer.toneMapping; renderer.toneMapping = THREE.NoToneMapping;
      renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(null); renderer.toneMapping = prevTM;
      mat.dispose(); q.geometry.dispose(); return rt.texture;
    };
    const eres = quality === 'low' ? 1024 : 2048;
    earthU.uSurf.value = bake(false, eres, eres / 2); earthU.uCloud.value = bake(true, eres, eres / 2);     const earth = new THREE.Mesh(new THREE.SphereGeometry(earthR, 160, 120), new THREE.ShaderMaterial({ uniforms: earthU, vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG }));
    earth.position.copy(earthC); earth.rotation.set(1.22, 2.6, 0.25); g.add(earth); g.userData.earth = earth; // orbiter flies over the tropics
    const atmo = new THREE.Mesh(new THREE.SphereGeometry(earthR * 1.022, 160, 120), new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDir.clone() }, uCenter: { value: earthC.clone() }, uR: { value: earthR }, uRa: { value: earthR * 1.022 } },
      vertexShader: ATMO_VERT, fragmentShader: ATMO_FRAG, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    atmo.position.copy(earthC); g.add(atmo);
    // stars
    const rnd = mulberry32(99), N = 6000, sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { const u = rnd() * 2 - 1, a = rnd() * TAU, r = Math.sqrt(1 - u * u); const d = 16000; sp.set([r * Math.cos(a) * d, u * d, r * Math.sin(a) * d], i * 3); const b = Math.pow(rnd(), 3) * 1.4 + 0.15; const w = rnd(); sc.set([b * (w < 0.2 ? 1 : 0.85 + w * 0.15), b * 0.93, b * (w > 0.8 ? 1.1 : 0.95)], i * 3); }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    g.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })));
    const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(glowSprite('rgba(255,255,255,1)', 'rgba(255,214,160,.35)')), color: new THREE.Color(4, 3.7, 3.3), blending: THREE.AdditiveBlending, depthWrite: false }));
    sun.position.copy(sunDir).multiplyScalar(14000); sun.scale.setScalar(1500); g.add(sun);
    const key = new THREE.DirectionalLight(0xfff4e6, 3.2); key.position.copy(sunDir).multiplyScalar(80); key.target.position.set(0, 0, 0); g.add(key); g.add(key.target);
    key.userData.shadow = true; key.castShadow = true; key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
    Object.assign(key.shadow.camera, { left: -28, right: 28, top: 28, bottom: -28, near: 10, far: 200 });
    g.add(new THREE.HemisphereLight(0x0c1426, 0x2d5a9a, 0.9)); // earthshine from below
    Object.assign(g.userData, { bg: 0x000000, fog: null, envI: 0.12, exposure: 1.05 });
  }
  scene.add(orbiter);

  /* ---------------- post-processing ---------------- */
  const msaa = (P) => (innerWidth <= 820 ? 0 : P.samples); // phones: FXAA instead of multisampling (cheaper, and avoids a bloom artefact seen with MSAA)
  const rt = new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: msaa(Q[quality]) });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.55, 0.86);
  const fxaa = new FXAAPass(); fxaa.enabled = msaa(Q[quality]) === 0;
  composer.addPass(bloom); composer.addPass(new OutputPass()); composer.addPass(fxaa); // FXAA when multisampling is off

  const shadowLights = []; scene.traverse((o) => { if (o.isLight && o.userData.shadow) shadowLights.push(o); });
  function applyQuality(q) {
    quality = q; const P = Q[q];
    renderer.setPixelRatio(Math.min(devicePixelRatio, P.pr));
    renderer.shadowMap.enabled = P.shadow > 0;
    shadowLights.forEach((l) => { l.castShadow = P.shadow > 0; if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } l.shadow.mapSize.set(P.shadow || 512, P.shadow || 512); });
    scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
    bloom.enabled = P.bloom; fxaa.enabled = msaa(P) === 0;
    [composer.renderTarget1, composer.renderTarget2].forEach((t) => { t.samples = msaa(P); t.dispose(); });
    resize(); dirty = 3;
    $('#qualityVal').textContent = { high: 'High', medium: 'Balanced', low: 'Low' }[q];
    try { localStorage.setItem('cx-shuttle-q', q); } catch (e) { /* storage unavailable */ }
  }

  /* ---------------- state + animation ---------------- */
  const state = { mode: 'museum', doors: 0, gear: 1, brake: 0, arm: 0, busy: false };
  const ARM_POSE = { yaw: 0.34, pitch: 1.02, elbow: -0.95, wrist: -0.75 };
  function applyRig() {
    doorPivots.forEach(({ pivot, side }) => { pivot.rotation.z = -side * state.doors * THREE.MathUtils.degToRad(172); });
    const g = state.gear, gd = Math.min(1, g / 0.35), gs = THREE.MathUtils.clamp((g - 0.2) / 0.8, 0, 1);
    gear.doors.forEach((p) => { p.rotation.z = p.userData.dir * gd * 1.45; p.visible = true; });
    gear.nose.rotation.x = -(1 - gs) * Math.PI / 2; gear.nose.visible = g > 0.02;
    gear.mains.forEach((m) => { m.rotation.x = -(1 - gs) * Math.PI / 2; m.visible = g > 0.02; });
    rudderHalves.forEach(({ h, s }) => { h.rotation.y = -s * state.brake * 0.6; });
    const a = state.arm;
    arm.yaw.rotation.y = ARM_POSE.yaw * a; arm.pitch.rotation.x = ARM_POSE.pitch * a; arm.elbow.rotation.x = ARM_POSE.elbow * a; arm.wrist.rotation.x = ARM_POSE.wrist * a;
  }
  applyRig();

  const qStack = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0)));
  const qOrbit = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0.62, -0.1, 'YXZ'));
  const MODES = {
    museum: {
      pos: new THREE.Vector3(0, 6.5, -1.5), quat: new THREE.Quaternion(), cam: new THREE.Vector3(40, 17.5, 43), target: new THREE.Vector3(0, 6.4, -2.2),
      min: 12, max: 70, maxPolar: 1.5, doors: 0, gear: 1, arm: 0,
      tag: 'Samuel Oschin Pavilion · 2012 – 2023',
      lede: 'From 30 October 2012 to 31 December 2023 Endeavour rested horizontally in the Samuel Oschin Pavilion, where visitors could walk right under its tiled belly.',
      hot: ['nose', 'windows', 'tiles', 'wing', 'blankets', 'tail', 'oms', 'engines', 'bay', 'gear'],
    },
    stack: {
      pos: new THREE.Vector3(0, B + 9.0 + 18.55, 5.4), quat: qStack, cam: new THREE.Vector3(84, 17, 70), target: new THREE.Vector3(0, 30.5, 2),
      min: 25, max: 135, maxPolar: 1.56, doors: 0, gear: 0, arm: 0,
      tag: 'Air and Space Center · opens 13 Nov 2026',
      lede: 'Since January 2024 Endeavour has stood upright on External Tank ET-94 between two solid rocket boosters — the only real shuttle stack displayed ready to launch.',
      hot: ['nose', 'windows', 'wing', 'tail', 'oms', 'engines', 'et', 'srb'],
    },
    orbit: {
      pos: new THREE.Vector3(0, 0, 0), quat: qOrbit, cam: new THREE.Vector3(-36, 29, 40), target: new THREE.Vector3(0, 1.5, 0),
      min: 12, max: 160, maxPolar: Math.PI, doors: 1, gear: 0, arm: 1,
      tag: 'Low Earth Orbit · 1992 – 2011',
      lede: 'In Low Earth Orbit (LEO) the doors opened within hours of launch so the radiators could shed heat. Endeavour circled Earth 4,671 times in 25 missions.',
      hot: ['nose', 'windows', 'blankets', 'wing', 'tail', 'oms', 'engines', 'bay', 'arm'],
    },
  };
  function setEnv(name) {
    Object.entries(envs).forEach(([k, g]) => { g.visible = k === name; });
    const u = envs[name].userData;
    scene.background = new THREE.Color(u.bg); scene.fog = u.fog; scene.environmentIntensity = u.envI; renderer.toneMappingExposure = u.exposure;
    stack.visible = name === 'stack';
  }
  orbiter.position.copy(MODES.museum.pos); orbiter.quaternion.copy(MODES.museum.quat);
  setEnv('museum');

  // camera framing: keep the model clear of the side panel (desktop) / bottom sheet (phone)
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w, h);
    camera.aspect = w / h;
    if (w > 820) camera.setViewOffset(w, h, 90, 0, w, h); else camera.setViewOffset(w, h, 0, -h * 0.1, w, h);
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize); resize();
  // wide objects need a longer lens distance on portrait screens; the tall stack does not (and must stay inside the atrium)
  const camScale = (mode = state.mode) => { const a = innerWidth / innerHeight; return mode === 'stack' ? (a < 0.8 ? 1.25 : 1) : a < 0.6 ? (mode === 'orbit' ? 2.25 : 2.0) : a < 0.8 ? 1.75 : a < 1.2 ? 1.3 : 1; };

  const tmpT = new THREE.Vector3(), tmpS = new THREE.Spherical();
  function camTween(toPos, toTarget, dur, extraArc = 0.15) {
    const o = { k: 0 }; let s0, s1, t0, dTheta;
    return gsap.to(o, { k: 1, duration: D(dur), ease: 'power3.inOut',
      onStart() { t0 = controls.target.clone(); s0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(t0)); s1 = new THREE.Spherical().setFromVector3(toPos.clone().sub(toTarget)); dTheta = s1.theta - s0.theta; while (dTheta > Math.PI) dTheta -= TAU; while (dTheta < -Math.PI) dTheta += TAU; },
      onUpdate() { const k = o.k; tmpT.lerpVectors(t0, toTarget, k); tmpS.radius = lerp(s0.radius, s1.radius, k) * (1 + extraArc * Math.sin(Math.PI * k)); tmpS.phi = lerp(s0.phi, s1.phi, k); tmpS.theta = s0.theta + dTheta * k; camera.position.setFromSpherical(tmpS).add(tmpT); controls.target.copy(tmpT); camera.lookAt(tmpT); } });
  }
  function poseTween(toPos, toQuat, dur, arc = new THREE.Vector3(0, 3, 0)) {
    const o = { k: 0 }; let p0, q0;
    return gsap.to(o, { k: 1, duration: D(dur), ease: 'power3.inOut', onStart() { p0 = orbiter.position.clone(); q0 = orbiter.quaternion.clone(); },
      onUpdate() { const k = o.k; orbiter.position.lerpVectors(p0, toPos, k).addScaledVector(arc, Math.sin(Math.PI * k)); orbiter.quaternion.slerpQuaternions(q0, toQuat, k); } });
  }
  let tl = null, introTween = null;
  function goMode(name, instant = false) {
    if (!MODES[name]) return;
    const prev = state.mode, m = MODES[name]; state.mode = name;
    closeInfo();
    document.querySelectorAll('.sh-modes button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === name)));
    const tagEl = $('#modeTag'); tagEl.dataset.mode = name; $('#modeTagText').textContent = m.tag; $('#modeLede').textContent = m.lede;
    if (tl) tl.kill();
    if (introTween) { introTween.kill(); introTween = null; }
    state.busy = true; controls.enabled = false; controls.autoRotate = false;
    const toCam = m.target.clone().add(m.cam.clone().sub(m.target).multiplyScalar(camScale(name)));
    if (instant) {
      setEnv(name); orbiter.position.copy(m.pos); orbiter.quaternion.copy(m.quat); Object.assign(state, { doors: m.doors, gear: m.gear, arm: m.arm }); applyRig();
      etGroup.position.y = 0; srbs.forEach((s) => { s.position.y = B; });
      camera.position.copy(toCam); controls.target.copy(m.target); finish(); return;
    }
    tl = gsap.timeline({ onUpdate: applyRig, onComplete: finish });
    // leaving: stow the arm, lower the stack parts
    if (state.arm > 0 && name !== 'orbit') tl.to(state, { arm: 0, duration: D(0.8), ease: 'power2.inOut' }, 0);
    if (prev === 'stack' && name !== 'stack') { tl.to(etGroup.position, { y: 70, duration: D(0.8), ease: 'power2.in' }, 0); srbs.forEach((s, i) => tl.to(s.position, { y: -60, duration: D(0.8), ease: 'power2.in' }, 0.05 * i)); }
    tl.to('#flash', { opacity: 1, duration: D(0.55), ease: 'power2.in' }, 0.05);
    tl.call(() => {
      setEnv(name);
      if (name === 'stack') { etGroup.position.y = 70; srbs.forEach((s) => { s.position.y = -60; }); }
    }, null, 0.62);
    tl.to('#flash', { opacity: 0, duration: D(0.9), ease: 'power2.out' }, 0.66);
    if (m.doors !== state.doors && !m.doors) tl.to(state, { doors: 0, duration: D(1.3), ease: 'power2.inOut' }, 0);
    tl.to(state, { gear: m.gear, duration: D(1.4), ease: 'power2.inOut' }, name === 'museum' ? 1.6 : 0.1);
    if (name === 'stack') {
      srbs.forEach((s, i) => tl.to(s.position, { y: B, duration: D(1.5), ease: 'power3.out' }, 0.75 + i * 0.18));
      tl.to(etGroup.position, { y: 0, duration: D(1.6), ease: 'power3.out' }, 1.0);
      tl.add(poseTween(m.pos, m.quat, 2.2, new THREE.Vector3(0, 6, 16)), 1.2);
      tl.add(camTween(toCam, m.target, 3.2, 0.1), 0.2);
    } else {
      tl.add(poseTween(m.pos, m.quat, 2.2, prev === 'stack' ? new THREE.Vector3(0, 4, 16) : new THREE.Vector3(0, 3, 0)), 0.4);
      tl.add(camTween(toCam, m.target, 2.8), 0.2);
    }
    if (name === 'orbit') { tl.to(state, { doors: 1, duration: D(2.0), ease: 'power2.inOut' }, 2.0); tl.to(state, { arm: 1, duration: D(2.2), ease: 'power2.inOut' }, 3.3); }
  }
  function finish() {
    const m = MODES[state.mode];
    state.busy = false; controls.enabled = true;
    controls.minDistance = m.min * Math.min(camScale(), 1.3); controls.maxDistance = Math.min(m.max * camScale(), state.mode === 'museum' ? 150 : state.mode === 'stack' ? 140 : 400); controls.maxPolarAngle = m.maxPolar;
    controls.autoRotate = $('#autoRot').checked;
    syncButtons(); hotDirty = true; dirty = 3;
  }
  function syncButtons() {
    $('#btnDoors').setAttribute('aria-pressed', String(state.doors > 0.5));
    $('#btnGear').setAttribute('aria-pressed', String(state.gear > 0.5));
    $('#btnBrake').setAttribute('aria-pressed', String(state.brake > 0.5));
    $('#btnArm').setAttribute('aria-pressed', String(state.arm > 0.5));
    $('#btnArm').disabled = state.mode !== 'orbit';
    $('#btnGear').disabled = state.mode === 'stack';
    $('#btnDoors').disabled = state.mode === 'stack';
  }
  const rigTo = (vals, dur) => gsap.to(state, { ...vals, duration: D(dur), ease: 'power2.inOut', onUpdate: applyRig, onComplete: syncButtons });
  $('#btnDoors').addEventListener('click', () => {
    if (state.busy) return;
    if (state.doors > 0.5) { if (state.arm > 0.02) { gsap.timeline({ onUpdate: applyRig, onComplete: syncButtons }).to(state, { arm: 0, duration: D(1.2) }).to(state, { doors: 0, duration: D(1.8) }); } else rigTo({ doors: 0 }, 1.8); }
    else rigTo({ doors: 1 }, 1.8);
    $('#btnDoors').setAttribute('aria-pressed', String(state.doors <= 0.5));
  });
  $('#btnArm').addEventListener('click', () => {
    if (state.busy || state.mode !== 'orbit') return;
    if (state.arm > 0.5) rigTo({ arm: 0 }, 1.8);
    else if (state.doors < 0.99) gsap.timeline({ onUpdate: applyRig, onComplete: syncButtons }).to(state, { doors: 1, duration: D(1.6) }).to(state, { arm: 1, duration: D(2) });
    else rigTo({ arm: 1 }, 2.0);
    $('#btnArm').setAttribute('aria-pressed', String(state.arm <= 0.5));
  });
  $('#btnGear').addEventListener('click', () => { if (state.busy || state.mode === 'stack') return; rigTo({ gear: state.gear > 0.5 ? 0 : 1 }, 1.6); $('#btnGear').setAttribute('aria-pressed', String(state.gear <= 0.5)); });
  $('#btnBrake').addEventListener('click', () => { rigTo({ brake: state.brake > 0.5 ? 0 : 1 }, 1.1); $('#btnBrake').setAttribute('aria-pressed', String(state.brake <= 0.5)); });
  document.querySelectorAll('.sh-modes button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.mode !== state.mode) goMode(b.dataset.mode); }));
  $('#autoRot').addEventListener('change', (e) => { controls.autoRotate = e.target.checked && !state.busy; });
  $('#showHot').addEventListener('change', (e) => { hotLayer.style.display = e.target.checked ? '' : 'none'; });
  const qSel = $('#quality'); qSel.value = quality; $('#qualityVal').textContent = { high: 'High', medium: 'Balanced', low: 'Low' }[quality];
  qSel.addEventListener('change', () => applyQuality(qSel.value));

  /* ---------------- hotspots + info card ---------------- */
  const hotLayer = $('#hotspots'); const hotEls = {};
  Object.keys(anchors).forEach((id) => {
    const p = data.parts[id]; if (!p) return;
    const b = document.createElement('button'); b.className = 'sh-hot hidden' + (id === 'et' || id === 'engines' ? ' flame' : ''); b.type = 'button';
    b.setAttribute('aria-label', p.title); b.innerHTML = `<span class="lab">${p.title}</span>`;
    b.addEventListener('click', (e) => { e.stopPropagation(); openInfo(id, true); });
    hotLayer.appendChild(b); hotEls[id] = b;
  });
  const srcById = Object.fromEntries(data.sources.map((s) => [s.id, s]));
  let activeId = null;
  function openInfo(id, focus) {
    const p = data.parts[id]; if (!p) return;
    activeId = id;
    $('#infoTag').textContent = p.tag; $('#infoTitle').textContent = p.title; $('#infoText').textContent = p.text;
    $('#infoNums').innerHTML = p.numbers.map(([k, v]) => `<div class="readout"><div class="k">${k}</div><div class="v">${v}</div></div>`).join('');
    const srcs = [].concat(p.src).map((s) => srcById[s]).filter(Boolean);
    $('#infoSrc').innerHTML = 'Source: ' + srcs.map((s) => `<a href="${s.url}" target="_blank" rel="noopener" title="${s.title}">${s.title.split(' — ')[0].split(' / ')[0]}</a>`).join(' · ');
    const card = $('#info'); card.hidden = false;
    if (innerWidth <= 820) { const pn = $('.sh-panel'); if (!pn.classList.contains('collapsed')) { pn.classList.add('collapsed'); const hb = pn.querySelector('.hud-collapse'); if (hb) hb.textContent = '▲ CONTROLS'; } }
    gsap.fromTo(card, { opacity: 0, y: 14, filter: 'blur(6px)' }, { opacity: 1, y: 0, filter: 'blur(0px)', duration: D(0.45), ease: 'power3.out' });
    Object.entries(hotEls).forEach(([k, el]) => el.classList.toggle('active', k === id));
    if (focus && !state.busy && anchors[id]) {
      const wp = anchors[id].getWorldPosition(new THREE.Vector3());
      const dir = camera.position.clone().sub(controls.target).normalize();
      const dist = (id === 'et' || id === 'srb') ? 60 : state.mode === 'stack' ? 34 : 26;
      const tgt = controls.target.clone().lerp(wp, 0.7);
      state.busy = true; controls.enabled = false;
      camTween(tgt.clone().add(dir.multiplyScalar(dist * camScale())), tgt, 1.3, 0.04).eventCallback('onComplete', () => { state.busy = false; controls.enabled = true; hotDirty = true; });
    }
  }
  function closeInfo() { const c = $('#info'); if (!c.hidden) { c.hidden = true; } activeId = null; Object.values(hotEls).forEach((el) => el.classList.remove('active')); }
  $('#infoClose').addEventListener('click', closeInfo);
  addEventListener('keydown', (e) => { if (e.key === 'Escape') closeInfo(); });

  // clicking the model itself also opens the matching card
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let downAt = null;
  const shown = (m) => { for (let o = m; o; o = o.parent) if (!o.visible) return false; return true; };
  const pickables = []; orbiter.traverse((o) => { if (o.isMesh) pickables.push(o); }); stack.traverse((o) => { if (o.isMesh) pickables.push(o); });
  function pickPart(cx, cy) {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(pickables.filter(shown), false)[0];
    if (!hit) return null;
    let part = hit.object.userData.part;
    if (hit.object.userData.partTop && hit.face) { const n = hit.face.normal.clone().transformDirection(hit.object.matrixWorld); const up = new THREE.Vector3(0, 1, 0).applyQuaternion(orbiter.quaternion); if (n.dot(up) > 0.3) part = hit.object.userData.partTop; }
    if (part === 'nose-body') { const lp = orbiter.worldToLocal(hit.point.clone()); part = lp.z > 18.2 ? 'nose' : (lp.y > 4.2 && lp.z > 12.5 ? 'windows' : lp.y < 2.2 ? 'tiles' : 'windows'); }
    return part;
  }
  renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5 || state.busy) return;
    const part = pickPart(e.clientX, e.clientY); if (part && data.parts[part]) openInfo(part, false);
  });
  let lastHover = 0;
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse' || performance.now() - lastHover < 120 || e.buttons) return; lastHover = performance.now();
    renderer.domElement.style.cursor = pickPart(e.clientX, e.clientY) ? 'pointer' : '';
  });

  // hotspot projection + occlusion (occlusion raycasts are throttled)
  const occl = new THREE.Raycaster(); let hotDirty = true, frameN = 0; const wpos = new THREE.Vector3(), proj = new THREE.Vector3();
  function updateHotspots() {
    const vis = MODES[state.mode].hot; const w = innerWidth, h = innerHeight; const doOcc = hotDirty || frameN % 8 === 0; hotDirty = false;
    Object.entries(hotEls).forEach(([id, el]) => {
      const show = vis.includes(id) && !state.busy && !(id === 'arm' && state.arm < 0.9) && !(id === 'gear' && state.gear < 0.9);
      if (!show) { el.classList.add('hidden'); return; }
      anchors[id].getWorldPosition(wpos); proj.copy(wpos).project(camera);
      if (proj.z > 1 || Math.abs(proj.x) > 1.05 || Math.abs(proj.y) > 1.05) { el.classList.add('hidden'); return; }
      el.classList.remove('hidden');
      el.style.transform = `translate(${((proj.x + 1) / 2 * w).toFixed(1)}px, ${((1 - proj.y) / 2 * h).toFixed(1)}px)`;
      if (doOcc) {
        const dir = wpos.clone().sub(camera.position), dist = dir.length(); occl.set(camera.position, dir.normalize()); occl.far = dist - 0.5;
        const hit = occl.intersectObjects(pickables.filter(shown), false).find((x) => !(x.object.userData.part === id && x.distance > dist - 2.5));
        el.classList.toggle('behind', !!hit);
      }
    });
  }

  /* ---------------- side panel ---------------- */
  function ticker(el, target, dec = 0) {
    const fmt = (v) => v.toLocaleString('en-US', { maximumFractionDigits: dec, minimumFractionDigits: dec });
    if (REDUCE) { el.textContent = fmt(target); return; }
    const o = { v: 0 }; gsap.to(o, { v: target, duration: 2.2, ease: 'power4.out', onUpdate: () => { el.textContent = fmt(o.v); } });
  }
  const seats = data.missions.reduce((a, m) => a + m.crew, 0);
  const statsEl = $('#stats');
  const stats = [...data.stats.filter((s) => s.id !== 'miles'), { id: 'seats', label: 'Crew seats launched', value: seats }, data.stats.find((s) => s.id === 'miles')];
  statsEl.innerHTML = stats.map((s) => `<div class="sh-stat${s.id === 'miles' ? ' wide' : ''}"><div class="num" data-v="${s.value}">0</div><div class="lbl">${s.label}</div>${s.alt ? `<div class="alt">${s.alt}</div>` : ''}</div>`).join('');
  const io = new IntersectionObserver((en) => en.forEach((e) => { if (e.isIntersecting) { io.unobserve(e.target); ticker(e.target, +e.target.dataset.v); } }));
  statsEl.querySelectorAll('.num').forEach((n) => io.observe(n));

  const TAGS = { ISS: 'ice', Science: 'nebula', Hubble: 'sol', Earth: 'aurora', Satellite: 'flame', Mir: 'flame' };
  const TAG_LABEL = { ISS: 'Space Station', Science: 'Science', Earth: 'Earth', Satellite: 'Satellites', Hubble: 'Hubble', Mir: 'Mir' };
  const longest = Math.max(...data.missions.map((m) => (new Date(m.landing) - new Date(m.launch)) / 864e5));
  const fmtDate = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const list = $('#missions'); let filter = 'All';
  $('#missionFilter').innerHTML = ['All', 'ISS', 'Science', 'Earth', 'Satellite', 'Hubble', 'Mir'].map((t) => `<button data-t="${t}" aria-pressed="${t === 'All'}">${t === 'All' ? 'All' : TAG_LABEL[t]}</button>`).join('');
  $('#missionFilter').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; filter = b.dataset.t; $('#missionFilter').querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); renderMissions(); });
  function renderMissions() {
    const ms = data.missions.filter((m) => filter === 'All' || m.tag === filter);
    $('#missionCount').textContent = `${ms.length} of ${data.missions.length}`;
    list.innerHTML = ms.map((m) => `<li><button class="sh-mbtn" aria-expanded="false" data-n="${m.n}"><span class="n">${m.n}</span><span><span class="sts">${m.sts}</span><br><span class="yr">${m.launch.slice(0, 4)}</span></span><span class="p">${m.purpose}</span><span class="chip ${TAGS[m.tag]}">${m.tag}</span></button></li>`).join('');
  }
  list.addEventListener('click', (e) => {
    const b = e.target.closest('.sh-mbtn'); if (!b) return;
    const open = b.getAttribute('aria-expanded') === 'true';
    list.querySelectorAll('.sh-mdet').forEach((d) => d.remove()); list.querySelectorAll('.sh-mbtn').forEach((x) => x.setAttribute('aria-expanded', 'false'));
    if (open) return;
    const m = data.missions.find((x) => x.n === +b.dataset.n); const days = Math.round((new Date(m.landing) - new Date(m.launch)) / 864e5);
    const d = document.createElement('div'); d.className = 'sh-mdet';
    d.innerHTML = `<p>${m.purpose}.${m.note ? ' ' + m.note : ''}</p>
      <div class="readouts"><div class="readout"><div class="k">Launch</div><div class="v">${fmtDate(m.launch)}</div></div><div class="readout"><div class="k">Landing</div><div class="v">${fmtDate(m.landing)}</div></div>
      <div class="readout"><div class="k">Crew</div><div class="v">${m.crew}</div></div><div class="readout"><div class="k">Calendar days</div><div class="v">${days}</div></div></div>
      <div class="sh-mbar" aria-hidden="true"><i style="width:0%"></i></div>
      <div class="hint">Landed at ${data.sites[m.site]} (${m.site}). Flight ${m.n} of 25.</div>`;
    b.after(d); b.setAttribute('aria-expanded', 'true');
    gsap.to(d.querySelector('.sh-mbar i'), { width: (days / longest * 100).toFixed(1) + '%', duration: D(0.8), ease: 'power3.out' });
    gsap.from(d, { opacity: 0, y: -6, duration: D(0.3) });
  });
  renderMissions();
  const mh = document.createElement('p'); mh.className = 'hint'; mh.style.margin = '0 0 8px';
  mh.textContent = 'STS = Space Transportation System. ISS = International Space Station. Bar = mission length vs. the longest (STS-67).';
  $('#missionFilter').before(mh);

  const v = data.visit; const open = new Date('2026-11-13T10:00:00-08:00'); const dleft = Math.ceil((open - Date.now()) / 864e5);
  $('#visit').innerHTML = `<h3>${v.venue}</h3><p class="addr">${v.address.replace(', Los', '<br>Los')}</p>
    <div class="soon">${dleft > 0 ? `<b>${dleft} days</b><span>until the Samuel Oschin Air and Space Center opens on 13 November 2026 with Endeavour in launch position.</span>` : `<b>Open</b><span>Endeavour stands in launch position in the Samuel Oschin Air and Space Center (opened 13 November 2026).</span>`}</div>
    <p>${v.admission} ${v.air_space_center.replace(' (opens November 13, 2026)', '')} ${v.hours}</p>
    <p class="hint">${v.transit}</p>
    <a class="btn small primary" href="${v.url}" target="_blank" rel="noopener">californiasciencecenter.org ↗</a>`;
  $('#sources').innerHTML = data.sources.map((s) => `<li><a href="${s.url}" target="_blank" rel="noopener">${s.title}</a></li>`).join('');

  // phone: start with the bottom sheet collapsed so the model has room; keep the info card above the sheet
  const panel = $('.sh-panel');
  if (innerWidth <= 820) { panel.classList.add('collapsed'); document.body.classList.add('sh-sheet-collapsed'); const hb = panel.querySelector('.hud-collapse'); if (hb) hb.textContent = '▲ CONTROLS'; }
  new MutationObserver(() => document.body.classList.toggle('sh-sheet-collapsed', panel.classList.contains('collapsed'))).observe(panel, { attributes: true, attributeFilter: ['class'] });

  /* ---------------- loop ---------------- */
  const timer = new THREE.Timer(); let firstFrame = true;
  // Render on demand: only when the camera, a tween or an idle animation changes the picture.
  const STILL = /[?&]still\b/.test(location.search); // test hook: freeze idle animations, wall-clock tweens
  if (STILL) gsap.ticker.lagSmoothing(0);
  let dirty = 3;
  controls.addEventListener('change', () => { dirty = Math.max(dirty, 2); });
  addEventListener('resize', () => { dirty = 3; });
  const tweening = () => gsap.globalTimeline.getChildren(true, true, false).some((tw) => tw.isActive());
  function frame() {
    requestAnimationFrame(frame);
    if (document.hidden) return;
    timer.update(); const dt = Math.min(timer.getDelta(), 0.05), t = timer.getElapsed();
    if (!state.busy) controls.update(dt);
    const idle = !STILL && !REDUCE && (envs.orbit.visible || envs.stack.visible);
    if (!(dirty > 0 || idle || controls.autoRotate || tweening())) return;
    dirty = Math.max(0, dirty - 1); frameN++;
    if (envs.orbit.visible && idle) {
      earthU.uTime.value = t; envs.orbit.userData.earth.rotation.y += dt * 0.004;
      if (!state.busy) orbiter.position.y = Math.sin(t * 0.35) * 0.25;
    }
    if (envs.stack.visible && idle) { const c = envs.stack.userData; const y = 6 + (Math.sin(t * 0.25) * 0.5 + 0.5) * 32; c.cab.position.y = y; c.cabWin.position.y = y + 0.5; }
    composer.render(dt);
    updateHotspots();
    if (firstFrame) { firstFrame = false; $('#loading').classList.add('done'); setTimeout(() => $('#loading').remove(), 800); }
  }
  // opening shot: dolly in on the pavilion
  const m0 = MODES.museum; const c0 = m0.target.clone().add(m0.cam.clone().sub(m0.target).multiplyScalar(camScale()));
  camera.position.copy(c0.clone().sub(m0.target).multiplyScalar(1.5).add(m0.target).add(new THREE.Vector3(0, 8, 0))); controls.target.copy(m0.target);
  state.busy = true; controls.enabled = false;
  introTween = camTween(c0, m0.target, 2.6, 0).eventCallback('onComplete', finish);
  syncButtons();
  frame();

  // deep links: shuttle.html#stack, #orbit. Test hooks: ?still (freeze idle animation), ?q=low|medium|high, window.__shuttle
  const hashMode = location.hash.replace('#', '');
  if (MODES[hashMode] && hashMode !== 'museum') setTimeout(() => goMode(hashMode), 300);
  window.__shuttle = { goMode, openInfo, hotEls, applyQuality, setInstant: (n) => goMode(n, true), get frames() { return frameN; }, cam: (x, y, z, tx, ty, tz) => { camera.position.set(x, y, z); controls.target.set(tx, ty, tz); controls.maxDistance = Math.max(controls.maxDistance, camera.position.distanceTo(controls.target) + 1); controls.update(); dirty = 3; }, busy: () => state.busy || tweening() };
}
