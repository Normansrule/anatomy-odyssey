/* Cosmic Library · The Rocket Hangar — 26 rockets side by side, to scale.
 *
 * Every rocket is built procedurally from a station table (metres above the
 * nozzle exits), approximated from public reference drawings, then merged into
 * one mesh per material so a whole vehicle costs only a handful of draw calls.
 * Each model is finally scaled vertically by the few percent needed to match
 * the height in data/rockets.json exactly; diameters are built from the same
 * file. Paint schemes are simplified and no company logos are drawn; national
 * flags appear only where they were painted on the real vehicles.
 *
 * Numbers on screen come from data/rockets.json (each with its source) or are
 * computed from it: thrust-to-weight = F / (m0 · g0), payload fraction = m_LEO / m0.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const gsap = window.gsap;
gsap.ticker.lagSmoothing(0);     // keep tweens on wall-clock time even when a slow GPU drops frames
const $ = (id) => document.getElementById(id);
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;
const G0 = 9.80665;              // standard gravity, m/s² (exact by definition)
const DV_LEO = 9400;             // m/s to low Earth orbit including losses (docs/EQUATIONS.md)
const params = new URLSearchParams(location.search);
const STILL = params.has('still');
const REDUCED = STILL || !!(window.Codex && Codex.reducedMotion);
const D = (s) => (REDUCED ? 0 : s);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const isPhone = () => innerWidth <= 820;

/* ------------------------------------------------------------------ quality */
const QUALITY = {
  low: { pr: 0.75, shadow: 0, seg: 20 },
  high: { pr: 1.0, shadow: 2048, seg: 32 },
  ultra: { pr: 2.0, shadow: 4096, seg: 44 }
};
let qName = params.get('q') || (() => { try { return localStorage.getItem('cx-hangar-q'); } catch (e) { return null; } })() || 'high';
if (!QUALITY[qName]) qName = 'high';
let Q = QUALITY[qName];

/* ------------------------------------------------------------------ boot */
if (!window.Codex || !Codex.webgl()) { window.Codex && Codex.noGL && Codex.noGL(); throw new Error('WebGL unavailable'); }
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
function setPR() { renderer.setPixelRatio(Math.min(2, Math.min(devicePixelRatio, 2) * Q.pr)); }
setPR();
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false;       // shadows only re-render when the line-up moves
stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', stage.getAttribute('aria-label'));
renderer.domElement.setAttribute('role', 'img');
const maxAniso = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 1.2, 14000);
camera.position.set(-60, 60, 1400);

/* Late-afternoon sun low on the left: elevation 17°, 68° left of the view axis. */
const SUN = new THREE.Vector3().setFromSphericalCoords(1, 73 * DEG, -68 * DEG);
const HORIZON = '#f5caa0', MIDSKY = '#6f9fd8', ZENITH = '#1d4a8c', SKY_GAIN = 1.2;
const ARC_R = 900;   // the line-up stands on a gentle arc, so every rocket is about equally far from the overview camera

/* ------------------------------------------------------------------ deterministic noise for textures */
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function canvasEl(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c; }
function texFrom(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = Math.min(8, maxAniso);
  return t;
}

/* ================================================================== DETAIL TEXTURES
 * Near-white tiling maps that multiply a material's colour: panel seams, foam
 * mottling, welded steel rings, heat-shield tiles. UVs are in metres / TILE. */
const TILE = 4;
const DETAIL = {
  panel: () => canvasEl(512, 512, (g, w, h) => {
    g.fillStyle = '#f5f5f3'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(110,100,90,${0.01 + rnd() * 0.018})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 10 + rnd() * 60, 8 + rnd() * 40, 0, 0, 7); g.fill(); }
    for (let i = 0; i < 110; i++) { g.fillStyle = `rgba(80,74,68,${0.015 + rnd() * 0.035})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 20 + rnd() * 180); }
    g.fillStyle = 'rgba(40,40,40,.16)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h / 2, w, 1);
    g.fillStyle = 'rgba(40,40,40,.09)'; g.fillRect(0, 0, 2, h); g.fillRect(w / 2, 0, 1, h);
    g.fillStyle = 'rgba(40,40,40,.14)'; for (let x = 4; x < w; x += 9) { g.fillRect(x, 5, 2, 2); g.fillRect(x, h / 2 + 4, 2, 2); }
  }),
  foam: () => canvasEl(512, 512, (g, w, h) => {
    g.fillStyle = '#ececec'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) { const l = rnd() > 0.5; g.fillStyle = l ? `rgba(255,255,255,${0.04 + rnd() * 0.06})` : `rgba(60,40,20,${0.03 + rnd() * 0.05})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 3 + rnd() * 22, 3 + rnd() * 16, rnd() * 3, 0, 7); g.fill(); }
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(70,40,20,${0.03 + rnd() * 0.04})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 3, 40 + rnd() * 200); }
    g.fillStyle = 'rgba(60,40,20,.10)'; g.fillRect(0, 0, w, 2);
  }),
  steel: () => canvasEl(512, 512, (g, w, h) => {
    g.fillStyle = '#ebecee'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 700; i++) { g.fillStyle = rnd() > 0.5 ? `rgba(255,255,255,${0.05 + rnd() * 0.08})` : `rgba(70,70,80,${0.03 + rnd() * 0.05})`; g.fillRect(rnd() * w, rnd() * h, 1, 30 + rnd() * 220); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(160,110,60,${0.02 + rnd() * 0.04})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 50, 10 + rnd() * 30, 0, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(30,30,35,.28)'; g.fillRect(0, 0, w, 2); g.fillRect(0, h * 0.46, w, 2);   // weld rings ≈ 1.8 m apart
    g.fillStyle = 'rgba(30,30,35,.12)'; g.fillRect(0, 0, 1, h); g.fillRect(w * 0.5, 0, 1, h);
  }),
  hex: () => canvasEl(512, 512, (g, w, h) => {
    g.fillStyle = '#6a6a6a'; g.fillRect(0, 0, w, h);
    const r = 16, dx = r * Math.sqrt(3), dy = r * 1.5;
    for (let row = -1; row * dy < h + r; row++) for (let col = -1; col * dx < w + r; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy;
      const v = 225 + Math.floor(rnd() * 30);
      g.fillStyle = `rgb(${v},${v},${v})`; g.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * (r - 1.6), cy + Math.sin(a) * (r - 1.6)); }
      g.fill();
    }
  }),
  tile: () => canvasEl(512, 512, (g, w, h) => {
    g.fillStyle = '#f4f4f2'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 26) for (let x = 0; x < w; x += 26) { const v = 232 + Math.floor(rnd() * 22); g.fillStyle = `rgb(${v},${v},${v - 3})`; g.fillRect(x + 1, y + 1, 24, 24); }
  }),
  carbon: () => canvasEl(256, 256, (g, w, h) => {
    g.fillStyle = '#f0f0f0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,.08)';
    for (let i = -h; i < w; i += 6) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + h, h); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, 0, w, 1);
  }),
  // Flight-proven Falcon first stage: soot from re-entry burns, heavy at the bottom (normalised UVs)
  soot: () => canvasEl(256, 1024, (g, w, h) => {
    g.fillStyle = '#f6f5f2'; g.fillRect(0, 0, w, h);
    let gr = g.createLinearGradient(0, h, 0, h * 0.62);
    gr.addColorStop(0, 'rgba(34,30,26,.72)'); gr.addColorStop(0.35, 'rgba(50,45,40,.28)'); gr.addColorStop(1, 'rgba(60,55,50,0)');
    g.fillStyle = gr; g.fillRect(0, h * 0.62, w, h * 0.38);
    for (let i = 0; i < 260; i++) { const len = Math.pow(rnd(), 2) * h * 0.75; g.fillStyle = `rgba(40,36,32,${0.03 + rnd() * 0.07})`; g.fillRect(rnd() * w, h - len, 1 + rnd() * 3, len); }
    gr = g.createLinearGradient(0, 0, 0, h * 0.12);
    gr.addColorStop(0, 'rgba(40,36,32,.35)'); gr.addColorStop(1, 'rgba(40,36,32,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h * 0.12);
    for (let i = 0; i < 80; i++) { g.fillStyle = `rgba(40,36,32,${0.03 + rnd() * 0.06})`; g.fillRect(rnd() * w, 0, 1 + rnd() * 2, rnd() * h * 0.3); }
  })
};
const detailTex = {};
function getDetail(k) {
  if (!detailTex[k]) { const t = texFrom(DETAIL[k]()); if (k === 'soot') { t.wrapT = THREE.ClampToEdgeWrapping; } detailTex[k] = t; }
  return detailTex[k];
}

/* ================================================================== DECALS: flags and painted lettering */
function star(g, cx, cy, r, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5, rr = i % 2 ? r * 0.4 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
const FLAGS = {
  usa: (g, w, h) => { // 13 stripes, canton 7 stripes tall and 0.4 of the fly (U.S. Code, Title 4)
    for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#b22234'; g.fillRect(0, i * h / 13, w, h / 13 + 0.5); }
    const cw = w * 0.4, ch = h * 7 / 13; g.fillStyle = '#3c3b6e'; g.fillRect(0, 0, cw, ch); g.fillStyle = '#f4f1ea';
    for (let r = 0; r < 9; r++) { const n = r % 2 ? 5 : 6; for (let c = 0; c < n; c++) star(g, cw * ((c * 2 + (r % 2 ? 2 : 1)) / 12), ch * ((r + 1) / 10), ch * 0.04); }
  },
  ussr: (g, w, h) => {
    g.fillStyle = '#cc1f1f'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f6c945'; g.strokeStyle = '#f6c945';
    const s = h / 10; g.lineWidth = s * 0.28;
    star(g, s * 2.5, s * 1.3, s * 0.55);
    g.beginPath(); g.arc(s * 2.5, s * 3.5, s * 1.1, -2.6, 1.3); g.stroke();                  // sickle
    g.save(); g.translate(s * 2.4, s * 3.6); g.rotate(-0.78); g.fillRect(-s * 0.12, -s * 1.3, s * 0.24, s * 2.4); g.fillRect(-s * 0.55, -s * 1.35, s * 1.1, s * 0.4); g.restore(); // hammer
  },
  russia: (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h / 3); g.fillStyle = '#1c3f94'; g.fillRect(0, h / 3, w, h / 3 + 1); g.fillStyle = '#d52b1e'; g.fillRect(0, 2 * h / 3, w, h / 3 + 1); },
  china: (g, w, h) => {
    g.fillStyle = '#de2910'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffde00';
    const u = h / 20; star(g, 5 * u, 5 * u, 3 * u);
    [[10, 2], [12, 4], [12, 7], [10, 9]].forEach(([x, y]) => star(g, x * u, y * u, u, Math.atan2(5 - y, 5 - x)));
  },
  japan: (g, w, h) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); g.fillStyle = '#bc002d'; g.beginPath(); g.arc(w / 2, h / 2, h * 0.3, 0, 7); g.fill(); },
  india: (g, w, h) => {
    g.fillStyle = '#ff9933'; g.fillRect(0, 0, w, h / 3); g.fillStyle = '#ffffff'; g.fillRect(0, h / 3, w, h / 3 + 1); g.fillStyle = '#138808'; g.fillRect(0, 2 * h / 3, w, h / 3 + 1);
    g.strokeStyle = '#000080'; g.lineWidth = h * 0.02; const r = h * 0.14;
    g.beginPath(); g.arc(w / 2, h / 2, r, 0, 7); g.stroke();
    for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r); g.lineWidth = h * 0.008; g.stroke(); }
  }
};
const decalTex = {};
function getDecal(key) {
  if (decalTex[key]) return decalTex[key];
  let c;
  if (key.startsWith('flag-')) c = canvasEl(192, 128, FLAGS[key.slice(5)]);
  else { // 'txt-<colour>-<TEXT>': letters stacked top to bottom, as painted on Saturn and Mercury boosters
    const [, col, text] = key.match(/^txt-(\w+)-(.*)$/);
    const n = text.length;
    c = canvasEl(96, 104 * n, (g) => {
      g.fillStyle = col === 'w' ? '#f2f1ec' : '#17181b';
      g.font = '900 92px "Arial Black", "Helvetica Neue", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      [...text].forEach((ch, i) => { if (ch !== ' ') g.fillText(ch, 48, i * 104 + 6); });
    });
  }
  const t = texFrom(c, { repeat: false });
  decalTex[key] = t;
  return t;
}

/* ================================================================== MATERIALS */
const PAL = {
  white: { c: '#eeece6', r: 0.52, t: 'panel' }, cream: { c: '#e7e0cf', r: 0.58, t: 'panel' },
  lgrey: { c: '#c4c7cb', r: 0.5, m: 0.1, t: 'panel' }, grey: { c: '#9a9ea4', r: 0.55, m: 0.15, t: 'panel' },
  dgrey: { c: '#45484d', r: 0.6, m: 0.2, t: 'panel' }, black: { c: '#1b1c1f', r: 0.55, t: 'panel' },
  sgrey: { c: '#a9b1a3', r: 0.6, t: 'panel' },
  steelA: { c: '#d3d6da', r: 0.38, m: 0.6, t: 'panel' }, steel: { c: '#dde2e8', r: 0.36, m: 0.9, t: 'steel' },
  tiles: { c: '#242528', r: 0.85, t: 'hex' }, orbW: { c: '#ecebe5', r: 0.7, t: 'tile' }, orbB: { c: '#202022', r: 0.8, t: 'tile' },
  foamET: { c: '#b9642d', r: 0.86, t: 'foam' }, foamETd: { c: '#9c5227', r: 0.86, t: 'foam' },
  foamSLS: { c: '#d57a36', r: 0.8, t: 'foam' }, foamDelta: { c: '#dc803a', r: 0.8, t: 'foam' },
  salmon: { c: '#c98f6c', r: 0.72, t: 'foam' }, vulcan: { c: '#c97a40', r: 0.75, t: 'foam' },
  carbon: { c: '#1d1e21', r: 0.36, m: 0.25, t: 'carbon' }, soot: { c: '#efede7', r: 0.55, t: 'soot' },
  nozzle: { c: '#2e2c2a', r: 0.4, m: 0.85 }, nozzleL: { c: '#8f8b86', r: 0.3, m: 0.95 }, copper: { c: '#8d5b3b', r: 0.42, m: 0.9 },
  red: { c: '#b8432a', r: 0.6, m: 0.3 }, gold: { c: '#e2b04e', r: 0.28, m: 1.0, e: '#6b4406' },
  patina: { c: '#82b6a4', r: 0.74, m: 0.08, t: 'panel' }, granite: { c: '#c4b8aa', r: 0.9, t: 'panel' }, stone: { c: '#a99f91', r: 0.95, t: 'panel' },
  person: { c: '#ff7a3d', r: 0.6 }, glass: { c: '#0c0f15', r: 0.12, m: 0.6 }
};
const matCache = {};
function MAT(key) {
  if (matCache[key]) return matCache[key];
  let m;
  if (key.startsWith('decal:')) {
    m = new THREE.MeshStandardMaterial({ map: getDecal(key.slice(6)), alphaTest: 0.5, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  } else {
    const p = PAL[key] || PAL.white;
    m = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.c), roughness: p.r, metalness: p.m || 0 });
    if (p.t) m.map = getDetail(p.t);
    if (p.e) { m.emissive = new THREE.Color(p.e); }
  }
  m.name = key;
  matCache[key] = m;
  return m;
}

/* ================================================================== GEOMETRY BUILDER */
const V3 = THREE.Vector3;
function flipGeo(g) { // reversed winding + normals: a cheap second side without DoubleSide shader variants
  const f = g.index ? g.toNonIndexed() : g.clone();
  const pos = f.attributes.position, nrm = f.attributes.normal, uv = f.attributes.uv;
  for (let i = 0; i < pos.count; i += 3) for (const a of [pos, nrm, uv].filter(Boolean)) for (let c = 0; c < a.itemSize; c++) {
    const t = a.getComponent(i + 1, c); a.setComponent(i + 1, c, a.getComponent(i + 2, c)); a.setComponent(i + 2, c, t);
  }
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  return f;
}

class Builder {
  constructor(seg) { this.seg = seg; this.lists = {}; this.m = new THREE.Matrix4(); this.stack = []; }
  at(x, y, z, fn, { ry = 0, rx = 0, rz = 0, s = 1 } = {}) {
    this.stack.push(this.m.clone());
    this.m.multiply(new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new V3(s, s, s)));
    fn(); this.m = this.stack.pop();
  }
  add(geo, mat, flat = false) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (flat) g.computeVertexNormals();
    g.applyMatrix4(this.m);
    (this.lists[mat] || (this.lists[mat] = [])).push(g);
    return g;
  }
  /* Frustum from (r0 at y0) to (r1 at y1). Options: t0/tl angular range (0 faces +z, the camera),
   * seg, norm (keep 0..1 UVs), flat, capB/capT. */
  tube(r0, r1, y0, y1, mat, o = {}) {
    const h = y1 - y0, tl = o.tl ?? TAU, t0 = o.t0 ?? 0;
    const seg = o.seg || Math.max(4, Math.round((this.seg * tl) / TAU));
    const g = new THREE.CylinderGeometry(r1, r0, h, seg, 1, true, t0, tl);
    if (!o.norm) { const uv = g.attributes.uv, circ = tl * (r0 + r1) / 2; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * circ / TILE, (y0 + uv.getY(i) * h) / TILE); }
    g.translate(0, (y0 + y1) / 2, 0);
    this.add(g, mat, o.flat);
    if (o.capB) this.disc(r0, y0, mat, -1, o.seg);
    if (o.capT) this.disc(r1, y1, mat, 1, o.seg);
  }
  disc(r, y, mat, dir = 1, seg) {
    const g = new THREE.CircleGeometry(r, seg || this.seg); g.rotateX(dir > 0 ? -Math.PI / 2 : Math.PI / 2); g.translate(0, y, 0);
    const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * r / TILE, uv.getY(i) * 2 * r / TILE);
    this.add(g, mat);
  }
  lathe(pts, mat, o = {}) { // pts: [[r, y], …] bottom → top (outward normals)
    const g = new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(p[0], 0.0001), p[1])), o.seg || this.seg, o.t0 ?? 0, o.tl ?? TAU);
    const uv = g.attributes.uv, pos = g.attributes.position; const rmax = Math.max(...pts.map(p => p[0]));
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * rmax / TILE, pos.getY(i) / TILE);
    this.add(o.two ? mergeGeometries([g.toNonIndexed(), flipGeo(g)]) : g, mat);
  }
  /* Nose: tangent ogive (default), cone or ellipse from radius r at y0, length len, optional blunt tip radius. */
  nose(r, y0, len, mat, o = {}) {
    const n = o.n || 10, tip = o.tip || 0, shape = o.shape || 'ogive', pts = [];
    const rho = (r * r + len * len) / (2 * r);
    for (let i = 0; i <= n; i++) {
      const t = i / n, y = t * len;
      const rr = shape === 'cone' ? r * (1 - t) : shape === 'ellipse' ? r * Math.sqrt(Math.max(0, 1 - t * t)) : Math.sqrt(Math.max(0, rho * rho - y * y)) + r - rho;
      pts.push([Math.max(rr, tip), y0 + y]);
    }
    if (tip > 0) pts.push([0, y0 + len + tip * 0.5]);
    this.lathe(pts, mat, o);
  }
  dome(r, y, h, mat, up = true) {
    const pts = []; for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push([r * Math.cos(a), y + (up ? 1 : -1) * h * Math.sin(a)]); }
    this.lathe(up ? pts : pts.reverse(), mat, { seg: Math.max(12, this.seg >> 1) });
  }
  /* Engine bell: exit radius rExit at yExit, throat and a short chamber above; visible inside too. */
  bell(x, z, yExit, rExit, len, mat = 'nozzle', o = {}) {
    const rt = rExit * (o.throat || 0.34), pts = [];
    for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push([rt + (rExit - rt) * Math.pow(1 - t, 1.7), t * len * 0.8]); }
    pts.push([rExit * 0.46, len * 0.9], [rExit * 0.3, len]);
    this.at(x, yExit, z, () => this.lathe(pts, mat, { seg: o.seg || 14, two: true }), { rx: o.tx || 0, rz: o.tz || 0 });
  }
  ring(r, y, tube, mat) { const g = new THREE.TorusGeometry(r, tube, 6, this.seg); g.rotateX(Math.PI / 2); g.translate(0, y, 0); this.add(g, mat); }
  box(w, h, d, x, y, z, mat, o = {}) { const g = new THREE.BoxGeometry(w, h, d); this.at(x, y, z, () => this.add(g, mat), o); }
  sphere(r, x, y, z, mat, sy = 1) { const g = new THREE.SphereGeometry(r, 16, 10); g.scale(1, sy, 1); g.translate(x, y, z); this.add(g, mat); }
  capsule(r, len, x, y, z, mat, o = {}) { const g = new THREE.CapsuleGeometry(r, len, 3, 8); this.at(x, y, z, () => this.add(g, mat), o); }
  strut(p0, p1, r, mat, seg = 5) {
    const a = new V3(...p0), b = new V3(...p1), l = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r, r, l, seg, 1, true);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize()));
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    this.add(g, mat);
  }
  /* Open lattice (zig-zag) between two rings: N1 interstages, Proton and Soyuz trusses, escape towers. */
  truss(r0, r1, y0, y1, n, rr, mat, rings = true) {
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 0.5) / n) * TAU, a2 = ((i + 1) / n) * TAU;
      const P = (r, a, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
      this.strut(P(r0, a0, y0), P(r1, a1, y1), rr, mat); this.strut(P(r1, a1, y1), P(r0, a2, y0), rr, mat);
    }
    if (rings) { this.ring(r0, y0, rr * 1.4, mat); this.ring(r1, y1, rr * 1.4, mat); }
  }
  /* Fin: pts are [radial distance, y] in the fin plane; th thickness; at angle a (0 faces the camera). */
  fin(a, pts, th, mat) {
    const s = new THREE.Shape(); pts.forEach((p, i) => (i ? s.lineTo(p[0], p[1]) : s.moveTo(p[0], p[1])));
    const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false }); g.translate(0, 0, -th / 2);
    this.at(0, 0, 0, () => this.add(g, mat), { ry: a - Math.PI / 2 });
  }
  /* Alternating paint segments (the black-and-white 'roll pattern' used to read a rocket's roll on film). */
  roll(r0, r1, y0, y1, n, matA, matB, off = 0) {
    for (let i = 0; i < n; i++) this.tube(r0, r1, y0, y1, i % 2 ? matB : matA, { t0: (i / n + off) * TAU, tl: TAU / n });
  }
  /* Curved decal on a cylinder, centred on angle a (0 = facing the camera). */
  decal(key, r, yc, h, a, w) {
    const tl = w / r;
    const g = new THREE.CylinderGeometry(r + 0.03, r + 0.03, h, 10, 1, true, a - tl / 2, tl);
    g.translate(0, yc, 0); this.add(g, 'decal:' + key);
  }
  planeDecal(key, w, h, x, y, z, ry) { const g = new THREE.PlaneGeometry(w, h); this.at(x, y, z, () => this.add(g, 'decal:' + key), { ry }); }
  /* Grid fin: a lattice panel. deployed → horizontal, sticking out radially; else folded flat against the body. */
  gridFin(a, r, y, w, l, mat, deployed = true) {
    this.at(Math.sin(a) * r, y, Math.cos(a) * r, () => {
      const t = 0.08, d = 0.35, n = 5;
      if (deployed) {
        for (let i = 0; i <= n; i++) { const z = (i / n) * l; this.box(w, d, t, 0, 0, z, mat); }
        for (let i = 0; i <= n; i++) { const x = -w / 2 + (i / n) * w; this.box(t, d, l, x, 0, l / 2, mat); }
      } else {
        for (let i = 0; i <= n; i++) { const yy = -l / 2 + (i / n) * l; this.box(w, t, 0.3, 0, yy, 0.25, mat); }
        for (let i = 0; i <= n; i++) { const x = -w / 2 + (i / n) * w; this.box(t, l, 0.3, x, 0, 0.25, mat); }
      }
    }, { ry: a });
  }
  finish() {
    const grp = new THREE.Group();
    for (const [k, list] of Object.entries(this.lists)) {
      const geo = mergeGeometries(list, false);
      list.forEach(g => g.dispose());
      const mesh = new THREE.Mesh(geo, MAT(k));
      const decal = k.startsWith('decal:');
      mesh.castShadow = !decal; mesh.receiveShadow = true;
      grp.add(mesh);
    }
    this.lists = {};
    return grp;
  }
}

/* ================================================================== SHARED SUB-ASSEMBLIES */
const ring4 = (off = 45) => [0, 90, 180, 270].map(a => (a + off) * DEG);

/* Apollo spacecraft on top of a Saturn: adapter (8.53 m), service module, command module under
 * its boost protective cover, and the launch escape tower — 24.93 m in all (Saturn V stations). */
function apolloStack(B, y0, rBot) {
  const RSM = 1.956;
  B.tube(rBot, RSM, y0, y0 + 8.53, 'white');
  B.tube(RSM, RSM, y0 + 8.53, y0 + 12.43, 'steelA');
  B.lathe([[RSM + 0.04, y0 + 12.4], [RSM + 0.04, y0 + 12.7], [0.6, y0 + 15.35], [0.45, y0 + 15.62], [0, y0 + 15.68]], 'white');
  B.truss(0.95, 0.42, y0 + 15.35, y0 + 18.75, 4, 0.06, 'red', false);
  B.tube(0.33, 0.33, y0 + 18.75, y0 + 23.15, 'white');
  B.lathe([[0.45, y0 + 18.75], [0.6, y0 + 19.2], [0.33, y0 + 19.6]], 'dgrey', { seg: 12 });
  B.lathe([[0.33, y0 + 23.15], [0.3, y0 + 23.7], [0.22, y0 + 24.1], [0.1, y0 + 24.8], [0, y0 + 24.93]], 'black', { seg: 12 });
}
/* Mercury capsule + red escape tower, from the capsule's heat shield at y0 (≈ 5.5 m). */
function mercuryStack(B, y0, r = 0.945) {
  B.lathe([[r, y0], [r, y0 + 0.12], [0.42, y0 + 2.0], [0.42, y0 + 2.75], [0.3, y0 + 2.75], [0.3, y0 + 3.1], [0.001, y0 + 3.12]], 'black', { seg: 20 });
  B.truss(0.4, 0.16, y0 + 3.0, y0 + 4.75, 3, 0.045, 'red', false);
  B.tube(0.19, 0.19, y0 + 4.75, y0 + 5.35, 'red', { seg: 12 });
  B.nose(0.19, y0 + 5.35, 0.45, 'red', { seg: 12, n: 5 });
}
function fairing(B, r, y0, cylTop, top, mat = 'white', o = {}) {
  let y = y0;
  if (o.boat) { B.tube(o.boat, r, y0, y0 + (o.boatLen || 1.2), mat); y = y0 + (o.boatLen || 1.2); }
  B.tube(r, r, y, cylTop, mat);
  B.nose(r, cylTop, top - cylTop, mat, { tip: o.tip ?? 0.12, shape: o.shape || 'ogive' });
}
/* Strap-on solid booster at (x, z). */
function booster(B, x, z, r, len, noseLen, o = {}) {
  B.at(x, 0, z, () => {
    const y0 = o.y0 || 0, nz = o.nozzle ?? r * 0.75, nl = o.nozzleLen || r * 1.3;
    B.bell(0, 0, y0, nz, nl, o.nozzleMat || 'nozzle', { throat: 0.45 });
    if (o.skirt) B.tube(o.skirt, r, y0 + nl * 0.5, y0 + nl * 0.5 + (o.skirtLen || r), o.skirtMat || o.mat || 'white');
    const b0 = y0 + nl * 0.5 + (o.skirt ? (o.skirtLen || r) : 0);
    B.tube(r, r, b0, y0 + len - noseLen, o.mat || 'white');
    B.nose(r, y0 + len - noseLen, noseLen, o.noseMat || o.mat || 'white', { shape: o.noseShape || 'ogive', tip: o.tip ?? 0.08 });
  });
}
function person(B, x, z, ry = 0) { // 1.80 m, safety orange so you can spot them
  B.at(x, 0, z, () => {
    B.capsule(0.085, 0.72, -0.1, 0.45, 0, 'person'); B.capsule(0.085, 0.72, 0.1, 0.45, 0, 'person');
    B.capsule(0.19, 0.42, 0, 1.17, 0, 'person');
    B.capsule(0.06, 0.52, -0.28, 1.1, 0, 'person', { rz: 0.12 }); B.capsule(0.06, 0.52, 0.28, 1.1, 0, 'person', { rz: -0.12 });
    B.sphere(0.115, 0, 1.685, 0, 'person', 1.12);
  }, { ry });
}

/* Space-plane orbiter, nose up, belly facing −z at z = 0, wings along ±x; base at y = 0.
 * Space Shuttle orbiter 37.24 m long, 23.79 m span; Buran 36.37 m, 23.92 m (Wikipedia). */
function orbiter(B, L, span, o = {}) {
  const R = 2.6, zc = 2.6, fwd = L - 8;
  B.at(0, 0, zc, () => {
    // mid/aft fuselage: white top, black belly arc
    B.tube(R, R, 1.0, fwd, 'orbW', { t0: Math.PI + 1.1, tl: TAU - 2.2, seg: 26 });
    B.tube(R, R, 1.0, fwd, 'orbB', { t0: Math.PI - 1.1, tl: 2.2, seg: 10 });
    // nose: lathe, sheared so the tip sits low like the real orbiter; black nose cap
    const pts = [[R, fwd], [2.55, fwd + 2], [2.3, fwd + 4], [1.85, fwd + 5.8], [1.1, fwd + 7.1], [0.35, fwd + 7.85], [0, L]];
    const g = new THREE.LatheGeometry(pts.slice(0, 5).map(p => new THREE.Vector2(p[0], p[1])), 24);
    const gc = new THREE.LatheGeometry(pts.slice(4).map(p => new THREE.Vector2(Math.max(p[0], 0.001), p[1])), 24);
    for (const gg of [g, gc]) { const p = gg.attributes.position; for (let i = 0; i < p.count; i++) { const k = clamp((p.getY(i) - fwd) / 8, 0, 1); p.setZ(i, p.getZ(i) * (1 - 0.18 * k) - 1.25 * k * k); } gg.computeVertexNormals(); }
    B.add(g, 'orbW'); B.add(gc, 'orbB');
    B.box(2.6, 0.7, 0.4, 0, fwd + 2.4, 2.25, 'glass', { rx: -0.55 });      // cockpit windows
    B.disc(R, 1.0, 'orbB', -1);
  });
  // wings (double delta); bottom black, top white
  const half = span / 2;
  const wing = [[2.2, 0.8], [half, 1.6], [half, 3.2], [5.4, 12.2], [2.2, 21.5]];
  for (const sx of [1, -1]) {
    const s = new THREE.Shape(); wing.forEach((p, i) => (i ? s.lineTo(sx * p[0], p[1]) : s.moveTo(sx * p[0], p[1])));
    const gb = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: false }); gb.translate(0, 0, 0.2);
    const gt = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: false }); gt.translate(0, 0, 0.65);
    B.add(gb, 'orbB'); B.add(gt, 'orbW');
  }
  // vertical tail in the y–z plane
  const tail = [[1.0, 5.0], [9.6, 5.0], [4.0, 13.6], [1.4, 13.6]];
  const ts = new THREE.Shape(); tail.forEach((p, i) => (i ? ts.lineTo(-p[1], p[0]) : ts.moveTo(-p[1], p[0])));
  const tg = new THREE.ExtrudeGeometry(ts, { depth: 0.5, bevelEnabled: false }); tg.rotateY(Math.PI / 2); tg.translate(-0.25, 0, 0);
  B.add(tg, 'orbW');
  // orbital manoeuvring system pods
  for (const sx of [1, -1]) B.at(sx * 1.75, 0, 4.7, () => B.lathe([[0.01, 0.9], [0.85, 1.6], [1.0, 4], [0.9, 8.5], [0.35, 10.8], [0.01, 11.4]], 'orbW', { seg: 14 }));
  B.box(4.6, 0.5, 3.0, 0, 0.55, 1.6, 'orbB');                       // body flap
  if (o.engines) { // three RS-25: 2.3 m exit, one above two
    B.bell(0, 3.9, -1.9, 1.15, 3.1, 'nozzleL'); B.bell(1.35, 1.8, -1.9, 1.15, 3.1, 'nozzleL'); B.bell(-1.35, 1.8, -1.9, 1.15, 3.1, 'nozzleL');
  }
  for (const sx of [1, -1]) B.bell(sx * 1.75, 5.0, 0.0, 0.45, 1.0, 'nozzleL', { seg: 10 });
  if (o.flag) for (const sx of [1, -1]) B.planeDecal('flag-' + o.flag, 2.1, 1.4, sx * (R + 0.04), L - 13.5, zc + 0.6, sx * Math.PI / 2);
  if (o.text) for (const sx of [1, -1]) B.planeDecal(o.text, 1.1, 1.1 * 4, sx * (R + 0.04), L - 17.5, zc + 0.6, sx * Math.PI / 2);
}

/* ================================================================== THE ROCKETS
 * Stations in metres above the lowest nozzle exit, approximated from public drawings.
 * Each builder returns { yaw } — the model's turn about its axis for display. */
const MODELS = {
  v2(B) { // 14 m, 1.65 m, fin span 3.56 m: black-and-white test paint
    const R = 0.825;
    B.bell(0, 0, 0, 0.36, 0.55);
    B.tube(0.42, 0.58, 0.3, 1.1, 'black');
    B.roll(0.58, R, 1.1, 3.7, 4, 'white', 'black', -0.125);
    B.roll(R, R, 3.7, 7.7, 4, 'black', 'white', -0.125);
    B.nose(R, 7.7, 6.3, 'white', { tip: 0.04 });
    for (let i = 0; i < 4; i++) B.fin(i * Math.PI / 2, [[0.5, 0.35], [1.78, 0.02], [1.78, 1.3], [0.78, 3.65]], 0.1, i % 2 ? 'black' : 'white');
    return { yaw: 20 };
  },
  redstone(B) { // 25.41 m with Mercury capsule and tower; 1.78 m
    const R = 0.89;
    B.bell(0, 0, 0, 0.42, 0.9);
    B.tube(0.8, R, 0.4, 1.4, 'black');
    B.tube(R, R, 1.4, 17.6, 'white');
    B.tube(R, R, 17.6, 18.3, 'black');
    B.tube(R, R, 18.3, 19.3, 'white');
    B.decal('txt-b-UNITED STATES', R, 10.4, 7.8, 0, 0.62);
    for (let i = 0; i < 4; i++) B.fin(i * Math.PI / 2 + Math.PI / 4, [[0.75, 0.35], [1.6, 0.3], [1.6, 1.25], [0.85, 2.6]], 0.12, 'black');
    B.tube(R, 0.945, 19.3, 19.9, 'lgrey');
    mercuryStack(B, 19.9);
    return { yaw: 0 };
  },
  'atlas-lv3b'(B) { // 29.06 m; 3.05 m stainless 'balloon' tank; 4.9 m over the boost fairings
    const R = 1.525;
    B.bell(1.0, 0, 0, 0.55, 1.6); B.bell(-1.0, 0, 0, 0.55, 1.6); B.bell(0, 0.3, 0.5, 0.42, 1.3);
    for (const s of [-1, 1]) B.at(s * 1.6, 0, 0, () => { B.tube(0.85, 0.85, 1.1, 3.6, 'steelA'); B.nose(0.85, 3.6, 1.5, 'steelA', { tip: 0.1 }); });
    B.tube(R, R, 1.1, 19.4, 'steelA');
    B.decal('txt-b-UNITED STATES', R, 11.8, 8.0, 0, 0.64);
    B.tube(R, 0.95, 19.4, 22.2, 'steelA');
    B.tube(0.95, 0.945, 22.2, 22.8, 'white');
    mercuryStack(B, 22.8);
    B.tube(0.15, 0.15, 28.15, 28.9, 'red', { seg: 10 });
    return { yaw: 0 };
  },
  'titan2-glv'(B) { // 33 m, 3.05 m; Gemini spacecraft on top
    const R = 1.525;
    B.bell(0.62, 0, 0, 0.62, 2.2); B.bell(-0.62, 0, 0, 0.62, 2.2);
    B.tube(R, R, 1.6, 3.2, 'black');
    B.tube(R, R, 3.2, 21.3, 'white');
    B.decal('txt-b-UNITED STATES', R, 12.0, 8.6, 0, 0.7);
    B.roll(R + 0.005, R + 0.005, 20.2, 21.3, 8, 'white', 'black', -1 / 16);
    B.tube(R, R, 21.3, 22.3, 'dgrey');
    B.tube(R, R, 22.3, 28.2, 'white');
    B.tube(R, 1.15, 28.2, 29.9, 'white');
    B.lathe([[1.15, 29.9], [0.62, 31.8], [0.52, 31.85], [0.45, 32.55], [0.2, 32.95], [0.001, 33.0]], 'black', { seg: 24 });
    return { yaw: 0 };
  },
  'saturn-ib'(B) { // 68.3 m with Apollo; 6.61 m; eight Redstone-size tanks around one Jupiter-size tank
    const R = 3.305;
    for (let i = 0; i < 4; i++) { const a = (i * 90 + 45) * DEG; B.bell(Math.sin(a) * 0.95, Math.cos(a) * 0.95, 0.3, 0.5, 1.7); }
    for (let i = 0; i < 4; i++) { const a = i * 90 * DEG; B.bell(Math.sin(a) * 2.2, Math.cos(a) * 2.2, 0, 0.5, 1.8); }
    B.disc(3.1, 1.7, 'dgrey', -1);
    B.roll(3.1, R, 1.7, 4.3, 8, 'white', 'black', -1 / 16);
    for (let i = 0; i < 8; i++) B.fin((i * 45 + 22.5) * DEG, [[3.0, 1.5], [4.9, 1.1], [4.9, 2.6], [3.1, 7.6]], 0.16, 'white');
    B.tube(1.335, 1.335, 4.3, 21.9, 'white');
    for (let i = 0; i < 8; i++) {
      const a = i * 45 * DEG;
      B.at(Math.sin(a) * 2.415, 0, Math.cos(a) * 2.415, () => { B.tube(0.89, 0.89, 4.3, 21.2, i % 2 ? 'white' : 'lgrey'); B.dome(0.89, 21.2, 0.55, 'white'); });
    }
    B.tube(R, R, 21.6, 24.5, 'black');
    B.decal('txt-w-USA', R, 23.05, 2.6, 0, 0.9);
    B.tube(R, R, 24.5, 27.2, 'white');
    B.roll(R, R, 27.2, 29.6, 8, 'white', 'black', -1 / 16);
    B.tube(R, R, 29.6, 42.3, 'white');
    B.decal('flag-usa', R, 36.5, 2.1, 0, 3.2);
    B.tube(R, R, 42.3, 43.2, 'lgrey');
    apolloStack(B, 43.2, R);
    return { yaw: 0 };
  },
  'saturn-v'(B) { // 110.6 m, 10.06 m (stations as on the Launch page, from NASA drawings)
    const R1 = 5.03, R3 = 3.302;
    B.bell(0, 0, 0.1, 1.88, 5.6);
    for (const a of ring4()) B.bell(Math.sin(a) * 3.25, Math.cos(a) * 3.25, 0, 1.88, 5.8);
    B.disc(R1 - 0.05, 5.6, 'dgrey', -1);
    for (const a of ring4()) {
      B.at(Math.sin(a) * 4.45, 0, Math.cos(a) * 4.45, () => { B.tube(2.2, 0.95, 3.2, 11.6, 'white', { seg: 20 }); B.disc(2.2, 3.2, 'dgrey', -1, 20); });
      B.fin(a, [[6.1, 1.4], [6.1, 8.6], [9.65, 3.1], [9.65, 0.7]], 0.36, 'white');
      B.fin(a, [[4.9, 2.0], [6.2, 1.4], [6.2, 8.6], [4.9, 11.0]], 0.36, 'white');
    }
    B.roll(R1, R1, 5.6, 20.0, 8, 'white', 'black', -1 / 16);
    B.tube(R1, R1, 20.0, 25.5, 'white');
    B.tube(R1, R1, 25.5, 31.6, 'black');
    B.tube(R1, R1, 31.6, 38.8, 'white');
    B.roll(R1, R1, 38.8, 42.06, 8, 'white', 'black', -1 / 16);
    B.decal('txt-b-UNITED STATES', R1, 13.2, 17.8, 0, 1.95);
    B.decal('flag-usa', R1, 34.9, 2.9, 0, 4.6);
    B.tube(R1 + 0.02, R1 + 0.02, 42.06, 47.6, 'white');
    for (let i = 0; i < 4; i++) { const a = (i * 90 + 22) * DEG; B.at(Math.sin(a) * (R1 + 0.24), 0, Math.cos(a) * (R1 + 0.24), () => B.tube(0.22, 0.26, 44.0, 46.6, 'black', { seg: 8 })); }
    B.tube(R1, R1, 47.6, 64.4, 'white');
    B.roll(R1, R1, 64.4, 66.9, 8, 'white', 'black', 0);
    B.tube(R1, R3, 66.9, 72.6, 'white');
    B.roll(R3, R3, 72.6, 75.4, 8, 'white', 'black', -1 / 16);
    B.tube(R3, R3, 75.4, 84.76, 'white');
    for (const s of [1, -1]) B.box(1.1, 2.0, 1.4, s * (R3 + 0.45), 73.9, 0, 'white', { ry: s * Math.PI / 2 });
    B.tube(R3, R3, 84.76, 85.67, 'lgrey');
    apolloStack(B, 85.67, R3);
    return { yaw: 0 };
  },
  n1(B) { // 105.3 m, 17 m at the base: a cone of five stages, 30 engines, lattice fins
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; B.bell(Math.sin(a) * 7.0, Math.cos(a) * 7.0, 0, 0.62, 1.9, 'nozzle', { seg: 10 }); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; B.bell(Math.sin(a) * 2.6, Math.cos(a) * 2.6, 0, 0.62, 1.9, 'nozzle', { seg: 10 }); }
    B.disc(8.0, 1.7, 'dgrey', -1);
    B.tube(8.1, 8.5, 1.7, 3.6, 'grey');
    B.tube(8.5, 6.35, 3.6, 30.1, 'white');
    B.roll(8.53, 8.13, 3.6, 7.2, 12, 'white', 'grey', 0);
    for (let i = 0; i < 4; i++) { // external cable raceways along the conical first stage
      const a = (i * 90 + 20) * DEG, lean = Math.atan2(8.5 - 6.35, 26.5);
      B.at(Math.sin(a) * 7.45, 16.85, Math.cos(a) * 7.45, () => B.box(0.7, 26.8, 0.5, 0, 0, 0.12, 'grey'), { ry: a, rx: lean });
    }
    // four lattice stabilisers at the base
    for (const a of ring4()) {
      B.at(0, 0, 0, () => {
        const r0 = 8.3, r1 = 11.0, y0 = 1.2, y1 = 9.0;
        B.box(0.25, y1 - y0, 0.25, 0, (y0 + y1) / 2, r1, 'dgrey'); B.box(0.25, 0.25, r1 - r0, 0, y0, (r0 + r1) / 2, 'dgrey'); B.box(0.25, 0.25, r1 - r0, 0, y1 - 2, (r0 + r1) / 2, 'dgrey');
        for (let k = 1; k < 6; k++) B.box(0.12, y1 - y0 - 1.5, 0.12, 0, (y0 + y1) / 2 - 0.7, r0 + (r1 - r0) * k / 6, 'dgrey');
        for (let k = 1; k < 6; k++) B.box(0.12, 0.12, r1 - r0, 0, y0 + (y1 - 2 - y0) * k / 6, (r0 + r1) / 2, 'dgrey');
      }, { ry: a });
    }
    B.truss(6.35, 5.95, 30.1, 33.3, 16, 0.12, 'dgrey');
    B.tube(5.4, 5.4, 30.2, 33.2, 'lgrey');
    B.tube(5.95, 4.35, 33.3, 50.6, 'white');
    B.truss(4.35, 4.25, 50.6, 52.7, 12, 0.1, 'dgrey');
    B.tube(3.6, 3.6, 50.7, 52.6, 'lgrey');
    B.tube(4.25, 3.35, 52.7, 63.6, 'white');
    B.tube(3.35, 2.95, 63.6, 66.3, 'grey');
    B.tube(2.95, 2.95, 66.3, 78.0, 'white');
    B.tube(2.95, 2.2, 78.0, 83.0, 'white');
    B.tube(2.2, 2.2, 83.0, 88.5, 'white');
    B.nose(2.2, 88.5, 6.0, 'white', { tip: 0.5, shape: 'cone' });
    B.truss(0.55, 0.3, 94.2, 97.6, 4, 0.08, 'dgrey', false);
    B.tube(0.42, 0.42, 97.6, 102.8, 'grey', { seg: 12 });
    B.nose(0.42, 102.8, 2.5, 'dgrey', { seg: 12, tip: 0.05 });
    return { yaw: 0 };
  },
  shuttle(B) { // 56.1 m stack: external tank 46.9 × 8.4 m, SRBs 45.46 × 3.71 m, orbiter 37.24 m
    const RE = 4.2;
    B.lathe([[0.01, 9.2], [2.2, 9.45], [3.6, 10.3], [RE, 11.8], [RE, 36.2]], 'foamET');
    B.tube(RE + 0.03, RE + 0.03, 36.2, 40.6, 'foamETd');
    B.lathe([[RE, 40.6], [4.05, 44.0], [3.5, 48.0], [2.6, 51.5], [1.45, 54.2], [0.5, 55.6], [0.12, 56.1], [0.001, 56.12]], 'foamET');
    for (const s of [1, -1]) {
      B.at(s * 6.4, 0, 0, () => {
        B.bell(0, 0, 0, 1.9, 3.2, 'nozzle', { throat: 0.5 });
        B.tube(2.6, 1.855, 1.5, 5.0, 'white');
        B.tube(1.855, 1.855, 5.0, 41.0, 'white');
        [12.6, 20.6, 28.6, 36.2].forEach(y => B.ring(1.87, y, 0.06, 'grey'));
        B.tube(1.855, 1.3, 41.0, 42.6, 'white');
        B.nose(1.3, 42.6, 2.86, 'white', { tip: 0.18 });
      });
      B.strut([s * 4.2, 12.0, 0], [s * 4.55, 12.0, 0], 0.25, 'dgrey'); B.strut([s * 4.2, 50.0, 0], [s * 4.55, 42.0, 0], 0.2, 'dgrey');
    }
    B.at(0, 8.3, RE + 1.25, () => orbiter(B, 37.24, 23.79, { engines: true, flag: 'usa' }));
    B.strut([0, 44.5, RE - 0.1], [0, 42.0, RE + 1.6], 0.2, 'dgrey');
    return { yaw: -68 };
  },
  energia(B) { // Energia 58.765 m; core 7.75 m, four 3.92 m boosters; Buran 36.37 m on the side
    const RC = 3.875, RB = 1.96;
    for (const [x, z] of [[1.3, 1.3], [-1.3, 1.3], [1.3, -1.3], [-1.3, -1.3]]) B.bell(x, z, 1.4, 0.95, 3.0, 'nozzleL');
    B.tube(3.3, RC, 3.9, 6.5, 'dgrey', { capB: true });
    B.tube(RC, RC, 6.5, 50.6, 'cream');
    B.tube(RC + 0.01, RC + 0.01, 30.0, 31.2, 'dgrey');
    B.nose(RC, 50.6, 8.165, 'cream', { tip: 0.3 });
    const angs = [67.5, 112.5, -67.5, -112.5].map(a => a * DEG), rc = RC + RB + 0.15;
    for (const a of angs) {
      B.at(Math.sin(a) * rc, 0, Math.cos(a) * rc, () => {
        for (let k = 0; k < 4; k++) { const b = (k * 90 + 45) * DEG; B.bell(Math.sin(b) * 0.75, Math.cos(b) * 0.75, 0, 0.55, 2.0); }
        B.tube(1.7, RB, 1.6, 5.2, 'dgrey', { capB: true });
        B.tube(RB, RB, 5.2, 34.5, 'white');
        B.tube(RB + 0.01, RB + 0.01, 20.0, 21.0, 'lgrey');
        B.nose(RB, 34.5, 4.8, 'white', { tip: 0.25, shape: 'cone' });
      });
    }
    B.at(0, 11.0, RC + 1.3, () => orbiter(B, 36.37, 23.92, { engines: false, flag: 'ussr', text: 'txt-b-СССР' }));
    return { yaw: -68 };
  },
  soyuz2(B) { // 47 m; 2.95 m core; four conical strap-ons (the 'Korolev cross')
    const nozzles = () => { for (let i = 0; i < 4; i++) { const b = (i * 90 + 45) * DEG; B.bell(Math.sin(b) * 0.5, Math.cos(b) * 0.5, 0.2, 0.34, 1.3, 'nozzle', { seg: 10 }); } };
    nozzles();
    B.lathe([[1.0, 1.4], [1.05, 3.0], [1.3, 12.0], [1.45, 21.0], [1.475, 25.0], [1.36, 27.6]], 'sgrey');
    B.disc(1.0, 1.4, 'dgrey', -1);
    B.truss(1.36, 1.33, 27.6, 29.0, 10, 0.06, 'dgrey');
    B.tube(1.3, 1.3, 27.7, 28.9, 'dgrey');
    B.tube(1.33, 1.33, 29.0, 35.3, 'sgrey');
    B.tube(1.33, 1.36, 35.3, 36.4, 'dgrey');
    fairing(B, 1.86, 36.4, 42.4, 47.0, 'white', { boat: 1.36, boatLen: 1.3, tip: 0.2 });
    B.decal('flag-russia', 1.86, 40.2, 1.3, 0, 1.95);
    for (const a of ring4()) {
      B.at(Math.sin(a) * 2.42, 0, Math.cos(a) * 2.42, () => {
        nozzles();
        B.lathe([[1.15, 1.3], [1.34, 2.4], [1.34, 3.4]], 'dgrey', { seg: 24 });
        B.lathe([[1.34, 3.4], [1.3, 6.0], [1.17, 10.0], [0.97, 14.0], [0.72, 17.0], [0.42, 18.9], [0.14, 19.7], [0.001, 19.9]], 'sgrey', { seg: 24 });
        B.disc(1.15, 1.3, 'dgrey', -1, 16);
        B.fin(0, [[1.2, 1.2], [2.2, 1.2], [2.2, 2.4], [1.3, 3.4]], 0.12, 'sgrey');
      }, { ry: a, rx: -2.0 * DEG });
    }
    return { yaw: 0 };
  },
  'proton-m'(B) { // 58.2 m; 4.1 m central tank, six 1.6 m outboard tanks (7.4 m across)
    const RC = 2.075;
    for (let i = 0; i < 6; i++) { const a = (i * 60 + 30) * DEG; B.bell(Math.sin(a) * 2.85, Math.cos(a) * 2.85, 0, 0.72, 2.0); }
    B.tube(RC, RC, 2.0, 21.2, 'white', { capB: true });
    for (let i = 0; i < 6; i++) {
      const a = (i * 60 + 30) * DEG;
      B.at(Math.sin(a) * 2.85, 0, Math.cos(a) * 2.85, () => { B.tube(0.8, 0.8, 1.9, 19.4, 'white'); B.dome(0.8, 19.4, 0.7, 'white'); B.dome(0.8, 1.9, 0.4, 'dgrey', false); });
    }
    B.truss(RC, RC, 21.2, 22.6, 14, 0.07, 'dgrey');
    B.tube(RC - 0.1, RC - 0.1, 21.2, 22.6, 'dgrey');
    B.tube(RC, RC, 22.6, 39.4, 'white');
    B.decal('flag-russia', RC, 34.0, 1.6, 0, 2.4);
    B.tube(RC, RC, 39.4, 40.2, 'grey');
    B.tube(RC, RC, 40.2, 44.8, 'white');
    B.tube(RC, RC, 44.8, 46.3, 'grey');
    fairing(B, 2.15, 46.3, 53.4, 58.2, 'white', { tip: 0.2 });
    return { yaw: 0 };
  },
  ariane5(B) { // 52 m (ECA, long fairing); 5.4 m core; two P241 solid boosters
    const R = 2.7;
    B.bell(0, 0, 0.6, 1.05, 3.2, 'nozzleL');
    B.tube(2.3, R, 3.4, 5.0, 'lgrey', { capB: true });
    B.tube(R, R, 5.0, 30.6, 'white');
    B.tube(R, R, 30.6, 33.0, 'lgrey');
    B.tube(R, R, 33.0, 34.3, 'black');
    fairing(B, R, 34.3, 46.3, 52.0, 'white', { tip: 0.25 });
    for (const s of [1, -1]) {
      booster(B, s * 4.55, 0, 1.525, 31.6, 4.2, { nozzle: 1.15, nozzleLen: 2.8, skirt: 1.9, skirtLen: 1.6, skirtMat: 'dgrey', tip: 0.2 });
      B.box(0.35, 0.35, 0.3, s * 3.0, 4.5, 0, 'dgrey'); B.box(0.35, 0.35, 0.3, s * 3.0, 26.5, 0, 'dgrey');
    }
    return { yaw: 0 };
  },
  ariane6(B) { // 63 m; 5.4 m; four P120C boosters (Ariane 64)
    const R = 2.7;
    B.bell(0, 0, 0.8, 1.05, 3.4, 'nozzleL');
    B.tube(2.3, R, 3.6, 5.2, 'lgrey', { capB: true });
    B.tube(R, R, 5.2, 31.5, 'white');
    B.tube(R, R, 31.5, 33.5, 'dgrey');
    B.tube(R, R, 33.5, 43.0, 'lgrey');
    B.tube(R, R, 43.0, 44.0, 'black');
    fairing(B, R, 44.0, 55.6, 63.0, 'white', { tip: 0.25 });
    for (const a of ring4()) booster(B, Math.sin(a) * 4.55, Math.cos(a) * 4.55, 1.7, 20.5, 4.0, { nozzle: 1.1, nozzleLen: 2.4, tip: 0.25 });
    return { yaw: 0 };
  },
  delta4h(B) { // 70.7 m; three 5.1 m common booster cores, orange foam
    const R = 2.55;
    for (const x of [-5.12, 0, 5.12]) {
      B.at(x, 0, 0, () => {
        B.bell(0, 0, 0, 1.2, 3.4, 'copper', { throat: 0.4 });
        B.tube(2.2, R, 3.0, 6.2, 'white', { capB: true });
        B.tube(R, R, 6.2, 40.8, 'foamDelta');
        if (x !== 0) B.nose(R, 40.8, 6.0, 'white', { tip: 0.2, shape: 'cone' });
      });
    }
    B.tube(R, R, 40.8, 44.0, 'black');
    B.tube(R, R, 44.0, 51.8, 'white');
    fairing(B, 2.57, 51.8, 64.0, 70.7, 'white', { tip: 0.25 });
    return { yaw: 0 };
  },
  atlas5(B) { // Atlas V 551: 58.3 m; 3.81 m bronze core; five solids; 5.4 m fairing over Centaur
    const R = 1.905;
    B.bell(0.55, 0, 0, 0.75, 3.0, 'nozzle'); B.bell(-0.55, 0, 0, 0.75, 3.0, 'nozzle');
    B.tube(1.7, R, 2.6, 4.6, 'dgrey', { capB: true });
    B.tube(R, R, 4.6, 32.5, 'salmon');
    B.tube(R, 2.0, 32.5, 34.2, 'white');
    fairing(B, 2.7, 34.2, 51.6, 58.3, 'white', { boat: 2.0, boatLen: 1.6, tip: 0.2 });
    for (let i = 0; i < 5; i++) { const a = (i * 72 + 36) * DEG; booster(B, Math.sin(a) * 2.8, Math.cos(a) * 2.8, 0.79, 21.5, 2.6, { nozzle: 0.55, nozzleLen: 1.6, tip: 0.1, noseShape: 'cone' }); }
    return { yaw: 0 };
  },
  vulcan(B) { // VC6: 61.6 m; 5.4 m orange-tan booster; six GEM 63XL; Centaur V; 5.4 m fairing
    const R = 2.7;
    B.bell(0.95, 0, 0, 0.8, 3.0, 'copper'); B.bell(-0.95, 0, 0, 0.8, 3.0, 'copper');
    B.tube(2.4, R, 2.6, 4.6, 'dgrey', { capB: true });
    B.tube(R, R, 4.6, 33.3, 'vulcan');
    B.tube(R, R, 33.3, 35.4, 'white');
    B.tube(R, R, 35.4, 46.4, 'lgrey');
    fairing(B, R, 46.4, 55.2, 61.6, 'white', { tip: 0.25 });
    for (const d of [30, 90, 150, -30, -90, -150]) { const a = d * DEG; booster(B, Math.sin(a) * 3.6, Math.cos(a) * 3.6, 0.8, 22.0, 2.6, { nozzle: 0.6, nozzleLen: 1.7, tip: 0.1, noseShape: 'cone' }); }
    return { yaw: 0 };
  },
  falcon9(B) { f9core(B, true); return { yaw: 20 }; },
  'falcon-heavy'(B) { // 70 m; three 3.66 m cores, 12.2 m wide
    f9core(B, true, false);
    for (const s of [1, -1]) B.at(s * 4.2, 0, 0, () => {
      f9core(B, false);
      B.tube(1.83, 1.83, 41.2, 42.2, 'black');
      B.nose(1.83, 42.2, 6.0, 'white', { tip: 0.2 });
      for (let i = 0; i < 4; i++) B.gridFin(i * Math.PI / 2 + Math.PI / 4, 1.88, 41.2, 1.25, 1.5, 'dgrey', false);
    });
    return { yaw: 0 };
  },
  electron(B) { // 18 m, 1.2 m, black carbon composite
    const R = 0.6;
    B.bell(0, 0, 0.05, 0.14, 0.45, 'nozzle', { seg: 8 });
    for (let i = 0; i < 8; i++) { const a = i * 45 * DEG; B.bell(Math.sin(a) * 0.38, Math.cos(a) * 0.38, 0, 0.13, 0.42, 'nozzle', { seg: 8 }); }
    B.tube(R, R, 0.35, 12.1, 'carbon', { capB: true });
    B.tube(R, R, 12.1, 12.7, 'dgrey');
    B.tube(R, R, 12.7, 14.5, 'carbon');
    fairing(B, R, 14.5, 16.2, 18.0, 'carbon', { tip: 0.05 });
    return { yaw: 0 };
  },
  'long-march-5'(B) { // 56.97 m; 5 m core; four 3.35 m kerosene boosters
    const R = 2.5;
    B.bell(0.85, 0, 0.8, 0.72, 2.4, 'nozzleL'); B.bell(-0.85, 0, 0.8, 0.72, 2.4, 'nozzleL');
    B.tube(2.2, R, 2.8, 4.4, 'lgrey', { capB: true });
    B.tube(R, R, 4.4, 33.0, 'white');
    B.decal('flag-china', R, 28.2, 1.9, 0, 2.85);
    B.tube(R, R, 33.0, 34.0, 'dgrey');
    B.tube(R, R, 34.0, 44.6, 'white');
    fairing(B, 2.6, 44.6, 51.2, 56.97, 'white', { tip: 0.2, boat: R, boatLen: 0.6 });
    for (const a of ring4()) booster(B, Math.sin(a) * 4.3, Math.cos(a) * 4.3, 1.675, 27.6, 5.0, { nozzle: 0.55, nozzleLen: 1.8, noseShape: 'cone', tip: 0.15 });
    return { yaw: 0 };
  },
  h3(B) { // H3-24L: 63 m; 5.27 m; four SRB-3
    const R = 2.635;
    B.bell(1.0, 0, 0.4, 0.9, 2.8, 'nozzleL'); B.bell(-1.0, 0, 0.4, 0.9, 2.8, 'nozzleL');
    B.tube(2.3, R, 2.8, 4.6, 'lgrey', { capB: true });
    B.tube(R, R, 4.6, 37.5, 'white');
    B.decal('flag-japan', R, 31.0, 1.8, 0, 2.7);
    B.tube(R, R, 37.5, 39.5, 'dgrey');
    B.tube(R, R, 39.5, 46.6, 'white');
    fairing(B, R, 46.6, 57.0, 63.0, 'white', { tip: 0.25 });
    for (const a of ring4()) booster(B, Math.sin(a) * 4.0, Math.cos(a) * 4.0, 1.25, 17.0, 2.8, { nozzle: 0.8, nozzleLen: 1.6, tip: 0.15 });
    return { yaw: 0 };
  },
  pslv(B) { // PSLV-XL: 44 m; 2.8 m; six 1 m strap-ons; bulbous 3.2 m heat shield
    const R = 1.4;
    B.bell(0, 0, 0.3, 1.0, 2.0);
    B.tube(1.2, R, 1.8, 3.0, 'lgrey', { capB: true });
    B.tube(R, R, 3.0, 20.2, 'white');
    B.tube(R, R, 20.2, 21.2, 'dgrey');
    B.tube(R, R, 21.2, 32.4, 'white');
    B.decal('flag-india', R, 27.5, 1.2, 0, 1.8);
    fairing(B, 1.6, 32.4, 39.6, 44.0, 'white', { boat: R, boatLen: 1.0, tip: 0.2 });
    for (let i = 0; i < 6; i++) { const a = (i * 60 + 30) * DEG; booster(B, Math.sin(a) * 1.93, Math.cos(a) * 1.93, 0.5, 14.7, 1.6, { nozzle: 0.4, nozzleLen: 1.0, noseShape: 'cone', tip: 0.05 }); }
    return { yaw: 0 };
  },
  lvm3(B) { // 43.43 m; 4 m core; two S200 boosters (3.2 m); 5 m ogive fairing
    const R = 2.0;
    B.bell(0.7, 0, 2.2, 0.5, 1.7); B.bell(-0.7, 0, 2.2, 0.5, 1.7);
    B.tube(1.8, R, 3.6, 4.6, 'lgrey', { capB: true });
    B.tube(R, R, 4.6, 21.6, 'white');
    B.decal('flag-india', R, 17.0, 1.4, 0, 2.1);
    B.tube(R, R, 21.6, 22.4, 'dgrey');
    B.tube(R, R, 22.4, 29.8, 'white');
    fairing(B, 2.5, 29.8, 37.3, 43.43, 'white', { boat: R, boatLen: 1.2, tip: 0.25 });
    for (const s of [1, -1]) booster(B, s * 3.75, 0, 1.6, 25.0, 4.4, { nozzle: 1.15, nozzleLen: 2.4, noseShape: 'cone', noseMat: 'lgrey', tip: 0.2 });
    return { yaw: 0 };
  },
  sls(B) { // SLS Block 1: 98 m; 8.4 m orange core with four RS-25; two five-segment boosters; Orion
    const R = 4.2;
    for (const [x, z] of [[1.4, 1.4], [-1.4, 1.4], [1.4, -1.4], [-1.4, -1.4]]) B.bell(x, z, 0.3, 1.15, 3.1, 'nozzleL');
    B.tube(3.3, R, 3.2, 6.5, 'foamSLS', { capB: true });
    B.tube(R, R, 6.5, 65.0, 'foamSLS');
    B.tube(R + 0.02, R + 0.02, 47.0, 49.5, 'foamETd');
    B.tube(R, 2.55, 65.0, 73.3, 'white');
    B.tube(2.55, 2.5, 73.3, 76.0, 'lgrey');
    B.tube(2.5, 2.5, 76.0, 82.3, 'white');
    B.tube(2.5, 1.1, 82.3, 86.0, 'white');
    B.tube(0.55, 0.55, 86.0, 92.4, 'white', { seg: 14 });
    B.tube(0.56, 0.56, 88.6, 89.4, 'black', { seg: 14 });
    for (let i = 0; i < 4; i++) { const a = (i * 90 + 45) * DEG; B.bell(Math.sin(a) * 0.62, Math.cos(a) * 0.62, 88.0, 0.22, 0.6, 'dgrey', { seg: 8, tz: -Math.sin(a) * 0.9, tx: Math.cos(a) * 0.9 }); }
    B.nose(0.55, 92.4, 5.6, 'white', { tip: 0.08, shape: 'cone' });
    for (const s of [1, -1]) {
      B.at(s * 6.85, 0, 0, () => {
        B.bell(0, 0, 0, 1.85, 3.2, 'nozzle', { throat: 0.5 });
        B.tube(2.6, 1.855, 1.6, 5.2, 'white');
        B.tube(1.855, 1.855, 5.2, 48.6, 'white');
        [13, 21.8, 30.6, 39.4].forEach(y => B.ring(1.87, y, 0.07, 'dgrey'));
        B.tube(1.855, 1.3, 48.6, 50.4, 'white');
        B.nose(1.3, 50.4, 3.6, 'white', { tip: 0.15 });
      });
      B.strut([s * 4.2, 8, 0], [s * 5.0, 8, 0], 0.3, 'dgrey'); B.strut([s * 4.2, 46, 0], [s * 5.0, 46, 0], 0.3, 'dgrey');
    }
    return { yaw: 0 };
  },
  'new-glenn'(B) { // 98 m; 7 m; seven BE-4; fins at the top of the first stage; strakes at the base
    const R = 3.5;
    B.bell(0, 0, 0.2, 0.8, 2.7, 'copper');
    for (let i = 0; i < 6; i++) { const a = i * 60 * DEG; B.bell(Math.sin(a) * 2.25, Math.cos(a) * 2.25, 0, 0.8, 2.7, 'copper'); }
    B.tube(3.2, R, 2.3, 4.9, 'dgrey', { capB: true });
    B.tube(R, R, 4.9, 57.5, 'white');
    for (let i = 0; i < 6; i++) { const a = (i * 60 + 30) * DEG; B.at(0, 0, 0, () => B.box(0.7, 8.5, 0.35, 0, 5.8, R + 0.18, 'dgrey'), { ry: a }); }
    for (const a of [80 * DEG, -80 * DEG]) B.fin(a, [[R - 0.1, 3.0], [R + 1.1, 3.4], [R + 1.1, 14.0], [R - 0.1, 17.0]], 0.3, 'white');
    for (const a of ring4()) B.fin(a, [[R - 0.1, 50.0], [R + 1.9, 51.5], [R + 1.9, 54.5], [R - 0.1, 56.6]], 0.3, 'white');
    B.tube(R, R, 57.5, 60.0, 'dgrey');
    B.tube(R, R, 60.0, 76.1, 'white');
    fairing(B, R, 76.1, 87.8, 98.0, 'white', { tip: 0.35 });
    return { yaw: 0 };
  },
  starship(B) { // Block 3: 124.4 m (Super Heavy 72.3 m + Ship 52.1 m); 9 m stainless steel
    const R = 4.5;
    const rings = [[3, 0.95], [10, 2.45], [20, 3.8]];
    for (const [n, r] of rings) for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (n === 10 ? 0.3 : 0); B.bell(Math.sin(a) * r, Math.cos(a) * r, n === 20 ? 0.9 : 0.4, 0.62, 1.7, 'nozzle', { seg: 10 }); }
    B.disc(R - 0.05, 2.1, 'dgrey', -1);
    B.tube(R, R, 1.2, 69.4, 'steel');
    for (let i = 0; i < 3; i++) B.gridFin(i * TAU / 3 + Math.PI / 3, R, 66.2, 3.6, 3.2, 'dgrey', true);
    B.tube(R, R, 69.4, 69.9, 'steel');
    B.roll(R, R, 69.9, 71.7, 24, 'steel', 'black', 0);
    B.tube(R, R, 71.7, 72.3, 'steel');
    // Ship: heat-shield tiles on the windward half (facing front-left), bare steel on the lee side
    const t0 = -60 * DEG - Math.PI / 2;
    B.tube(R, R, 72.3, 109.4, 'tiles', { t0, tl: Math.PI });
    B.tube(R, R, 72.3, 109.4, 'steel', { t0: t0 + Math.PI, tl: Math.PI });
    const nose = [], n = 12, L = 15.0, rho = (R * R + L * L) / (2 * R);
    for (let i = 0; i <= n; i++) { const y = (i / n) * L; nose.push([Math.max(0.35, Math.sqrt(Math.max(0, rho * rho - y * y)) + R - rho), 109.4 + y]); }
    nose.push([0, 109.4 + L + 0.15]);
    B.lathe(nose, 'tiles', { t0, tl: Math.PI });
    B.lathe(nose, 'steel', { t0: t0 + Math.PI, tl: Math.PI });
    for (const a of [t0, t0 + Math.PI]) {
      B.fin(a, [[R - 0.2, 73.4], [R + 2.6, 73.9], [R + 2.6, 81.5], [R - 0.2, 84.5]], 0.35, 'tiles');
      B.fin(a, [[R - 0.9, 110.2], [R + 1.0, 110.8], [R + 0.4, 116.5], [R - 1.8, 118.5]], 0.3, 'tiles');
    }
    return { yaw: 0 };
  }
};
function f9core(B, full, soot = true) { // Falcon 9 Block 5 first stage (+ upper stage and fairing): 70 m, 3.66 m, 5.2 m fairing
  const R = 1.83;
  B.bell(0, 0, 0.1, 0.46, 1.7, 'nozzle', { seg: 10 });
  for (let i = 0; i < 8; i++) { const a = (i * 45 + 22.5) * DEG; B.bell(Math.sin(a) * 1.18, Math.cos(a) * 1.18, 0, 0.46, 1.7, 'nozzle', { seg: 10 }); }
  B.tube(1.65, R, 1.2, 1.9, 'dgrey', { capB: true });
  B.tube(R, R, 1.9, 41.2, soot ? 'soot' : 'white', { norm: true });
  for (let i = 0; i < 4; i++) {
    const a = (i * 90 + 45) * DEG;
    B.at(0, 0, 0, () => { B.box(0.55, 9.6, 0.32, 0, 5.6, R + 0.18, 'black'); B.box(0.8, 0.5, 0.5, 0, 0.6, R + 0.3, 'black'); }, { ry: a });
  }
  if (full) {
    B.tube(R, R, 41.2, 47.7, 'black');
    for (let i = 0; i < 4; i++) B.gridFin(i * Math.PI / 2 + Math.PI / 4, R + 0.05, 42.6, 1.25, 1.5, 'dgrey', false);
    B.tube(R, R, 47.7, 56.0, 'white');
    fairing(B, 2.6, 56.0, 63.6, 70.0, 'white', { boat: R, boatLen: 1.4, tip: 0.2 });
  }
}

/* Statue of Liberty, 93 m to the torch (Wikipedia: Statue of Liberty):
 * 20 m foundation, 27 m pedestal (19 m square at the base, 12 m at the top), 46 m copper statue. */
function buildStatue(B) {
  const sq = (w) => w / Math.SQRT2;
  B.tube(sq(26), sq(24), 0, 8, 'stone', { seg: 4, t0: Math.PI / 4, flat: true, capT: true });
  B.tube(sq(22), sq(20), 8, 20, 'stone', { seg: 4, t0: Math.PI / 4, flat: true, capT: true });
  B.tube(sq(19), sq(18.4), 20, 27, 'granite', { seg: 4, t0: Math.PI / 4, flat: true, capT: true });
  B.tube(sq(16.2), sq(13.4), 27, 42.5, 'granite', { seg: 4, t0: Math.PI / 4, flat: true });
  B.tube(sq(15.4), sq(15.4), 42.5, 44.2, 'granite', { seg: 4, t0: Math.PI / 4, flat: true, capB: true, capT: true });
  B.tube(sq(12.2), sq(12.0), 44.2, 47, 'granite', { seg: 4, t0: Math.PI / 4, flat: true, capT: true });
  // robe (draped figure), shoulders ≈ 74 m, head top ≈ 81 m (heel to head 34 m)
  B.lathe([[4.9, 47], [4.9, 48.0], [4.3, 51], [3.7, 57], [3.2, 63], [3.05, 67], [3.2, 71], [3.35, 73.2], [2.6, 74.6], [1.2, 75.3], [0.95, 76.4]], 'patina', { seg: 28 });
  for (let i = 0; i < 9; i++) { const a = (i / 9) * TAU + 0.2; B.at(Math.sin(a) * 4.0, 0, Math.cos(a) * 4.0, () => B.tube(0.5, 0.25, 47.2, 60 - (i % 3) * 4, 'patina', { seg: 6 }), { rx: Math.cos(a) * 0.06, rz: -Math.sin(a) * 0.06 }); }
  B.sphere(1.75, 0, 78.4, 0.2, 'patina', 1.3);
  B.ring(1.8, 79.8, 0.35, 'patina');
  for (let i = 0; i < 7; i++) { const a = (-60 + i * 20) * DEG; B.at(Math.sin(a) * 1.8, 79.9, Math.cos(a) * 1.8, () => B.nose(0.32, 0, 2.7, 'patina', { seg: 6, shape: 'cone' }), { ry: a, rx: 1.05 }); }
  // raised right arm with the torch (arm 12.8 m)
  B.strut([2.4, 73.2, 0], [3.9, 86.4, 0.3], 0.9, 'patina', 10);
  B.sphere(0.95, 3.9, 86.5, 0.3, 'patina');
  B.at(3.95, 86.8, 0.3, () => {
    B.tube(0.55, 0.62, 0, 2.9, 'patina', { seg: 12 });
    B.lathe([[0.62, 2.9], [1.45, 3.4], [1.45, 3.9], [0.9, 4.05]], 'patina', { seg: 16 });
    B.lathe([[0.9, 3.9], [1.05, 4.6], [0.8, 5.4], [0.3, 6.1], [0.001, 6.25]], 'gold', { seg: 16 });
  });
  // left arm holding the tablet
  B.strut([-2.5, 73.2, 0], [-3.6, 67.5, 0.3], 0.8, 'patina', 10);
  B.strut([-3.6, 67.5, 0.3], [-2.6, 69.6, 1.6], 0.6, 'patina', 10);
  B.box(1.1, 7.2, 4.2, -3.5, 70.2, 0.7, 'patina', { rx: -0.25, rz: 0.1 });
}
function buildPole(B) { // survey pole: alternating 10 m red and white bands, 0–130 m
  for (let i = 0; i < 13; i++) {
    B.tube(0.6, 0.6, i * 10, (i + 1) * 10, i % 2 ? 'white' : 'red', { seg: 16 });
    B.box(3.2, 0.25, 0.25, 1.0, (i + 1) * 10, 0, 'white');
  }
  B.nose(0.6, 130, 2.0, 'red', { seg: 16, shape: 'cone' });
  B.tube(1.6, 1.4, 0, 0.8, 'dgrey', { seg: 16, capT: true });
}

/* ================================================================== SKY, GROUND, SEA */
const NOISE = /* glsl */`
float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*n2(p); p = p*2.03 + 7.1; a *= 0.5; } return s; }`;
const toLin = (hex) => new THREE.Color(hex);  // THREE.Color stores linear values
function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN }, uHor: { value: toLin(HORIZON) }, uMid: { value: toLin(MIDSKY) }, uZen: { value: toLin(ZENITH) }, uGain: { value: SKY_GAIN } },
    vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: NOISE + `
      uniform vec3 uSun, uHor, uMid, uZen; uniform float uGain; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir); float h = d.y;
        float t = pow(max(h, 0.0), 0.5);
        vec3 c = mix(uHor, uMid, smoothstep(0.02, 0.36, t)); c = mix(c, uZen, smoothstep(0.36, 0.95, t));
        float sd = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.55, 0.22) * pow(sd, 5.0) * 0.55 * (1.0 - 0.6 * t);
        c += vec3(1.0, 0.8, 0.5) * pow(sd, 90.0) * 1.2;
        c += vec3(1.0, 0.95, 0.85) * smoothstep(0.99955, 0.9998, sd) * 30.0;
        if (h > 0.0) {
          vec2 p = d.xz / (h + 0.08);
          float n = fbm(p * vec2(0.55, 1.9) + vec2(3.0, 1.0));
          float cl = smoothstep(0.52, 0.86, n) * smoothstep(0.015, 0.14, h) * (1.0 - smoothstep(0.35, 0.8, h));
          vec3 cc = mix(vec3(1.0, 0.9, 0.8), vec3(1.0, 0.72, 0.5), pow(sd, 3.0)) * 1.05;
          c = mix(c, cc, cl * 0.55);
        }
        c = mix(c, uHor * 1.04, exp(-abs(h) * 30.0) * 0.5);
        if (h < 0.0) c = mix(uHor, uHor * 0.72, smoothstep(0.0, -0.25, h));
        gl_FragColor = vec4(c * uGain, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
}
const sky = new THREE.Mesh(new THREE.SphereGeometry(9000, 48, 24), skyMaterial());
sky.renderOrder = -1; sky.frustumCulled = false;
scene.add(sky);
scene.fog = new THREE.FogExp2(toLin(HORIZON).multiplyScalar(SKY_GAIN * 1.02), 0.00026);

// Image-based light: the same sky baked to a PMREM
(function buildEnv() {
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene();
  const m = skyMaterial(); m.uniforms.uGain.value = 1.0;
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), m));
  scene.environment = pm.fromScene(es, 0.04, 0.1, 200).texture;
  scene.environmentIntensity = 0.62;
  pm.dispose();
})();

const sunLight = new THREE.DirectionalLight(0xffdcb4, 3.4);
sunLight.castShadow = Q.shadow > 0;
sunLight.shadow.mapSize.set(Q.shadow || 1024, Q.shadow || 1024);
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.35;
scene.add(sunLight, sunLight.target);
const fillLight = new THREE.DirectionalLight(0x9cbcff, 0.55);           // cool bounce from the sky opposite the sun
fillLight.position.set(300, 200, -250);
scene.add(fillLight);
scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x8a7654, 0.5));

/* ground: dry grass inland, a concrete launch field under the line-up, the sea behind it */
const groundTex = texFrom(canvasEl(512, 512, (g, w, h) => {
  g.fillStyle = '#8a8360'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { const v = rnd(); g.fillStyle = v > 0.6 ? `rgba(170,160,110,${0.1 + rnd() * 0.15})` : v > 0.3 ? `rgba(80,90,50,${0.1 + rnd() * 0.15})` : `rgba(60,55,40,${0.08 + rnd() * 0.1})`; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 4); }
}));
groundTex.repeat.set(260, 260);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, color: 0xd8d2c0 }));
ground.rotation.x = -Math.PI / 2; ground.position.set(0, -1.2, 8000 - 320); ground.receiveShadow = true;
scene.add(ground);

const concTex = texFrom(canvasEl(1024, 1024, (g, w, h) => {  // 40 m × 40 m, slabs 10 m
  g.fillStyle = '#a19c92'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const v = -10 + rnd() * 20; g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 250 : 0},${v > 0 ? 240 : 0},${Math.abs(v) / 180})`; g.fillRect(x * 256, y * 256, 256, 256); }
  for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); }
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(60,55,50,${0.03 + rnd() * 0.05})`; g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 20 + rnd() * 90, 10 + rnd() * 50, rnd() * 3, 0, 7); g.fill(); }
  g.fillStyle = 'rgba(70,65,58,.55)'; for (let k = 0; k < 4; k++) { g.fillRect(k * 256, 0, 3, h); g.fillRect(0, k * 256, w, 3); }
}));
const APRON_W = 2400, APRON_D = 1900, SEA_Z = -300;
concTex.repeat.set(APRON_W / 40, APRON_D / 40);
// polygon offset keeps the apron above the grass even with a 16-bit depth buffer at grazing angles
const apron = new THREE.Mesh(new THREE.PlaneGeometry(APRON_W, APRON_D), new THREE.MeshStandardMaterial({ map: concTex, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
apron.rotation.x = -Math.PI / 2; apron.position.set(0, 0, SEA_Z + APRON_D / 2); apron.receiveShadow = true;
scene.add(apron);
{ // sea wall along the back of the launch field
  const wall = new THREE.Mesh(new THREE.BoxGeometry(APRON_W, 3.2, 6), new THREE.MeshStandardMaterial({ map: concTex, color: 0xb9b3a8, roughness: 0.95 }));
  wall.position.set(0, -1.1, SEA_Z + 1); wall.receiveShadow = true; scene.add(wall);
}
/* the sea: a glossy surface that reflects the sky (image-based light), with a rippled normal map */
const seaNormal = texFrom(canvasEl(256, 256, (g, w, h) => {
  const img = g.createImageData(w, h), H = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) H[y * w + x] = Math.sin(x / w * TAU * 6 + Math.sin(y / h * TAU * 3) * 1.5) * 0.5 + Math.sin(y / h * TAU * 9 + x / w * TAU * 2) * 0.35 + (rnd() - 0.5) * 0.25;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = H[y * w + (x + 1) % w] - H[y * w + (x + w - 1) % w], dy = H[((y + 1) % h) * w + x] - H[((y + h - 1) % h) * w + x];
    const i = (y * w + x) * 4; img.data[i] = 128 - dx * 60; img.data[i + 1] = 128 - dy * 60; img.data[i + 2] = 255; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}), { srgb: false });
seaNormal.repeat.set(160, 60);
const sea = new THREE.Mesh(new THREE.PlaneGeometry(16000, 7000), new THREE.MeshStandardMaterial({ color: 0x0f2a3f, roughness: 0.16, metalness: 0.0, normalMap: seaNormal, normalScale: new THREE.Vector2(0.35, 0.35), envMapIntensity: 1.6 }));
sea.rotation.x = -Math.PI / 2; sea.position.set(0, -1.5, SEA_Z - 3500);
scene.add(sea);
{ // painted guide lines following the arc of the line-up
  const m = new THREE.MeshStandardMaterial({ color: 0xe9b43c, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
  for (const dr of [-28, 26]) { const l = new THREE.Mesh(new THREE.RingGeometry(ARC_R + dr - 0.25, ARC_R + dr + 0.25, 220, 1, Math.PI / 2 - 0.62, 1.24), m); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.02, ARC_R); l.receiveShadow = true; scene.add(l); }
}
/* distant hills on the land side, fogged into the horizon */
{
  const pos = [], N = 180, rIn = 3200;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * TAU, a1 = ((i + 1) / N) * TAU;
    if (Math.cos(a0) < 0.05) continue;          // open sea horizon on the −z side
    const hh = (a) => 40 + 110 * Math.pow(Math.abs(Math.sin(a * 3.1) * 0.6 + Math.sin(a * 7.3 + 1) * 0.3 + Math.sin(a * 17.9) * 0.1), 1.4);
    const P = (a, r, y) => [Math.sin(a) * r, y, Math.cos(a) * r];
    pos.push(...P(a0, rIn, -1), ...P(a1, rIn, -1), ...P(a1, rIn + 400, hh(a1)), ...P(a0, rIn, -1), ...P(a1, rIn + 400, hh(a1)), ...P(a0, rIn + 400, hh(a0)));
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x7f8a7a, roughness: 1, side: THREE.DoubleSide })));
}

/* ================================================================== LINE-UP */
const lineup = new THREE.Group(); scene.add(lineup);
const padTex = texFrom(canvasEl(512, 512, (g, w, h) => {
  const c = w / 2;
  const gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, 'rgba(22,20,18,.5)'); gr.addColorStop(0.45, 'rgba(40,36,32,.22)'); gr.addColorStop(0.8, 'rgba(60,55,50,.06)'); gr.addColorStop(1, 'rgba(60,55,50,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(233,180,60,.85)'; g.lineWidth = 6; g.setLineDash([22, 14]); g.beginPath(); g.arc(c, c, c * 0.9, 0, 7); g.stroke();
  g.setLineDash([]); g.strokeStyle = 'rgba(245,245,240,.5)'; g.lineWidth = 2; g.beginPath(); g.arc(c, c, c * 0.95, 0, 7); g.stroke();
}), { repeat: false });
const padMat = new THREE.MeshStandardMaterial({ map: padTex, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
const padGeo = new THREE.PlaneGeometry(2, 2); padGeo.rotateX(-Math.PI / 2);
const proxyMat = new THREE.MeshBasicMaterial({ visible: false });

// shared 1.8 m person mesh (cloned per rocket)
const personMesh = (() => { const B = new Builder(12); person(B, 0, 0); return B.finish().children[0]; })();

// selection ring and height line
const selRing = new THREE.Mesh(new THREE.RingGeometry(0.93, 1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffc24b, transparent: true, opacity: 0.9, depthWrite: false, fog: false }));
selRing.visible = false; scene.add(selRing);
const hLine = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xffc24b, transparent: true, opacity: 0.85, fog: false }));
hLine.visible = false; scene.add(hLine);

let DATA = null;
const rockets = [];        // { id, d, holder, inner, h, w, rad, tag, shown, … }
const refs = {};           // statue, pole
const byId = {};

/* ================================================================== STATE */
const state = {
  sort: params.get('sort') || 'year', sel: null, tab: 'rocket', cmp: [], cmpSolo: true, tags: true, line: true,
  filters: { era: 'all', country: 'all', status: 'all' }
};
const ERA = (y) => (y <= 1960 ? 'pioneers' : y <= 1975 ? 'race' : y <= 2009 ? 'shuttle' : 'new');
const REGION_COL = { usa: 'var(--ice)', ussr: 'var(--flame)', europe: 'var(--nebula)', china: 'var(--plasma)', japan: 'var(--sol)', india: 'var(--aurora)', oceania: '#9fb3ff' };
const REGION_NAME = { usa: 'US', ussr: 'USSR/Russia', europe: 'Europe', china: 'China', japan: 'Japan', india: 'India', oceania: 'NZ' };
const CMP_COL = ['var(--ice)', 'var(--flame)', 'var(--nebula)'];
const val = (f) => (f && typeof f === 'object' ? f.value : f ?? null);
const year = (d) => +d.firstFlight.slice(0, 4);
const tw = (d) => (val(d.thrust) && val(d.mass) ? (val(d.thrust) * 1000) / (val(d.mass) * G0) : null);
const pfrac = (d) => (d.payload && val(d.payload.leo) && val(d.mass) ? val(d.payload.leo) / val(d.mass) : null);
const SORTS = {
  year: (d) => +new Date(d.firstFlight), height: (d) => val(d.height),
  thrust: (d) => val(d.thrust) ?? 0, leo: (d) => (d.payload && val(d.payload.leo)) ?? 0
};
if (!SORTS[state.sort]) state.sort = 'year';

/* ================================================================== BUILD */
function buildModel(r) {
  const B = new Builder(Q.seg);
  const meta = MODELS[r.id](B) || {};
  const model = B.finish();
  const bb = new THREE.Box3().setFromObject(model);
  const sy = r.d.height.value / bb.max.y;          // exact height from the data file
  r.scaleErr = sy - 1;
  model.scale.y = sy;
  const inner = new THREE.Group(); inner.add(model); inner.rotation.y = (meta.yaw || 0) * DEG;
  return inner;
}
function measure(r) { // footprint in the holder's own frame (independent of where the holder stands)
  const model = r.inner.children[0];
  const m = new THREE.Matrix4().compose(new V3(), new THREE.Quaternion().setFromEuler(r.inner.rotation), new V3(1, model.scale.y, 1));
  const bb = new THREE.Box3();
  model.children.forEach(o => { o.geometry.computeBoundingBox(); bb.union(o.geometry.boundingBox.clone().applyMatrix4(m)); });
  r.w = bb.max.x - bb.min.x; r.cx = (bb.max.x + bb.min.x) / 2;
  r.front = bb.max.z; r.back = bb.min.z;
  r.rad = Math.max(Math.abs(bb.min.x - r.cx), bb.max.x - r.cx, Math.abs(bb.min.z), bb.max.z);
}
function attach(r) {
  r.holder.add(r.inner);
  measure(r);
  r.inner.position.x = -r.cx;               // centre the footprint on the holder
  r.pad.scale.setScalar(r.rad + 3.5);
  r.proxy.geometry.dispose();
  r.proxy.geometry = new THREE.BoxGeometry(r.w + 1, r.h, (r.front - r.back) + 1).translate(0, r.h / 2, (r.front + r.back) / 2);
  r.person.position.set(Math.min(r.w / 2 + 1.5, r.rad + 1.5), 0, r.front + 2.5);
}
async function buildAll() {
  const msg = $('loadMsg');
  for (const d of DATA.rockets) {
    const r = { id: d.id, d, h: d.height.value, shown: true };
    msg.textContent = `Stacking ${d.name}… ${rockets.length + 1}/${DATA.rockets.length}`;
    await new Promise(res => setTimeout(res, 0));
    r.holder = new THREE.Group(); r.holder.name = d.id;
    r.inner = buildModel(r);
    r.pad = new THREE.Mesh(padGeo, padMat); r.pad.position.y = 0.03; r.pad.receiveShadow = true; r.pad.renderOrder = 1;
    r.proxy = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), proxyMat); r.proxy.userData.rocket = r;
    r.person = personMesh.clone(); r.person.castShadow = true;
    r.holder.add(r.pad, r.proxy, r.person);
    attach(r);
    lineup.add(r.holder);
    rockets.push(r); byId[d.id] = r;
  }
  // reference objects
  let B = new Builder(Q.seg); buildStatue(B);
  refs.statue = { holder: new THREE.Group(), w: 26, h: 93 };
  refs.statue.holder.add(B.finish());
  B = new Builder(Q.seg); buildPole(B);
  refs.pole = { holder: new THREE.Group(), w: 6, h: 130 };
  refs.pole.holder.add(B.finish());
  const pp = personMesh.clone(); pp.position.set(3.5, 0, 16); refs.statue.holder.add(pp);
  lineup.add(refs.statue.holder, refs.pole.holder);
}
async function rebuildModels() {
  $('loading').classList.remove('done'); $('loadMsg').textContent = 'Rebuilding models…';
  for (const r of rockets) {
    await new Promise(res => setTimeout(res, 0));
    const hs = r.inner.scale.y;
    r.holder.remove(r.inner);
    r.inner.traverse(o => o.geometry && o.geometry.dispose());
    r.inner = buildModel(r); r.inner.scale.y = hs;
    attach(r);
  }
  $('loading').classList.add('done'); markShadows();
}

/* ================================================================== LAYOUT (on an arc) */
const GAP = 6;
let lineBounds = { l: -200, r: 200, hmax: 130 };
function visibleList() {
  let list;
  if (state.tab === 'compare' && state.cmpSolo && state.cmp.length >= 2) list = state.cmp.map(id => byId[id]);
  else list = rockets.filter(r => {
    const f = state.filters, d = r.d;
    return (f.era === 'all' || ERA(year(d)) === f.era) && (f.country === 'all' || d.region === f.country) && (f.status === 'all' || d.status === f.status);
  });
  const key = SORTS[state.sort];
  return list.sort((a, b) => (key(a.d) - key(b.d)) || (SORTS.year(a.d) - SORTS.year(b.d)));
}
let order = [];
function place(it) {
  const th = it.holder.userData.s / ARC_R;
  it.holder.position.set(Math.sin(th) * ARC_R, 0, ARC_R - Math.cos(th) * ARC_R);
  it.holder.rotation.y = -th;                      // face the centre of the arc
}
const arcPoint = (s, y = 0, dr = 0, out = new V3()) => { const th = s / ARC_R, rr = ARC_R - dr; return out.set(Math.sin(th) * rr, y, ARC_R - Math.cos(th) * rr); };
function layout(animate = true) {
  const vis = visibleList();
  order = vis;
  // statue, pole, then rockets, measured along the arc and centred on s = 0
  const items = [refs.statue, refs.pole, ...vis];
  let x = 0; const xs = [];
  items.forEach((it, i) => { xs.push(x + it.w / 2); x += it.w + (i === 0 ? 10 : i === 1 ? 8 : GAP); });
  const total = x - GAP, shift = -total / 2;
  const hmax = Math.max(93, ...vis.map(r => r.h));
  lineBounds = { l: shift - 4, r: shift + total + 4, hmax };
  const dur = animate ? D(1.25) : 0;
  items.forEach((it, i) => {
    const ts = xs[i] + shift, u = it.holder.userData;
    gsap.killTweensOf(u);
    if (dur && u.s != null && (it === refs.statue || it === refs.pole || it.shown)) gsap.to(u, { s: ts, duration: dur, ease: 'power3.inOut', delay: i * 0.012, onUpdate: () => { place(it); markShadows(); } });
    else { u.s = ts; place(it); }
  });
  for (const r of rockets) {
    const want = vis.includes(r);
    if (want === r.shown && (r.holder.visible === want)) continue;
    r.shown = want;
    gsap.killTweensOf(r.inner.scale);
    if (want) {
      r.holder.visible = true;
      if (dur) { r.inner.scale.y = 0.001; gsap.to(r.inner.scale, { y: 1, duration: D(0.9), delay: dur * 0.55, ease: 'power2.out', onUpdate: markShadows }); } else r.inner.scale.y = 1;
    } else if (dur) {
      gsap.to(r.inner.scale, { y: 0.001, duration: D(0.5), ease: 'power2.in', onUpdate: markShadows, onComplete: () => { if (!r.shown) r.holder.visible = false; } });
    } else { r.inner.scale.y = 0.001; r.holder.visible = false; }
  }
  $('countLbl').textContent = vis.length;
  updateShadowFrustum();
  markShadows();
  if (dur) gsap.delayedCall(dur + 0.95, () => { markShadows(); positionMarkers(); });
  renderTimeline();
  positionMarkers();
}
function markShadows() { renderer.shadowMap.needsUpdate = true; dirty = true; }
function updateShadowFrustum() {
  const cs = (lineBounds.l + lineBounds.r) / 2;
  arcPoint(cs, 0, 0, sunLight.target.position);
  sunLight.position.copy(sunLight.target.position).addScaledVector(SUN, 900);
  const m = new THREE.Matrix4().lookAt(sunLight.position, sunLight.target.position, new V3(0, 1, 0));
  m.setPosition(sunLight.position); const inv = m.clone().invert();
  const b = new THREE.Box3(), p = new V3();
  for (let k = 0; k <= 8; k++) {
    const ss = lineBounds.l - 20 + (lineBounds.r - lineBounds.l + 40) * k / 8;
    for (const y of [0, lineBounds.hmax + 2]) for (const dr of [-30, 30]) b.expandByPoint(arcPoint(ss, y, dr, p).applyMatrix4(inv));
  }
  const sc = sunLight.shadow.camera;
  sc.left = b.min.x - 2; sc.right = b.max.x + 2; sc.bottom = b.min.y - 2; sc.top = b.max.y + 2; sc.near = 10; sc.far = 2400;
  sc.updateProjectionMatrix();
}
let hLineKey = '';
function positionMarkers() {
  const r = state.sel && byId[state.sel];
  if (r && r.shown) {
    selRing.visible = true; selRing.position.copy(r.holder.position).setY(0.06); selRing.scale.setScalar(r.rad + 4.2);
    hLine.visible = state.line;
    const key = `${lineBounds.l.toFixed(1)}|${lineBounds.r.toFixed(1)}|${r.h}`;
    if (key !== hLineKey) { // a thin glowing arc at the selected rocket's height, through the whole line-up
      hLineKey = key;
      const pts = []; for (let k = 0; k <= 60; k++) pts.push(arcPoint(lineBounds.l - 14 + (lineBounds.r - lineBounds.l + 28) * k / 60, r.h));
      hLine.geometry.dispose(); hLine.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.16, 5, false);
    }
  } else { selRing.visible = false; hLine.visible = false; }
  dirty = true;
}

/* ================================================================== CAMERA */
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = 88 * DEG; controls.minDistance = 4; controls.maxDistance = 3200;
controls.screenSpacePanning = true; controls.zoomToCursor = true;
controls.target.set(0, 40, 0);
controls.addEventListener('change', () => { dirty = true; });
controls.addEventListener('start', () => { if (flight) { flight.kill(); flight = null; controls.enabled = true; } });

let insets = { l: 16, r: 16, t: 70, b: 16 };
let hudRects = [];
function measureInsets() {
  const W = innerWidth, H = innerHeight;
  const panel = $('panel').getBoundingClientRect(), tl = $('timeline').getBoundingClientRect(), title = $('title').getBoundingClientRect();
  if (isPhone()) insets = { l: 0, r: 0, t: Math.max(tl.bottom, title.bottom) + 6, b: Math.max(0, H - panel.top) };
  else insets = { l: 16, r: Math.max(16, W - panel.left + 8), t: 66, b: Math.max(16, H - tl.top + 6) };
  const dx = (insets.l - insets.r) / 2, dy = (insets.t - insets.b) / 2;
  const fw = W + 2 * Math.abs(dx), fh = H + 2 * Math.abs(dy);
  camera.aspect = W / H;
  camera.setViewOffset(fw, fh, dx < 0 ? 2 * Math.abs(dx) : 0, dy < 0 ? 2 * Math.abs(dy) : 0, W, H);
  camera.updateProjectionMatrix();
  hudRects = ['title', 'panel', 'timeline'].map(id => { const r = $(id).getBoundingClientRect(); return [r.left, r.top, r.right, r.bottom]; });
  dirty = true;
}
const pv = new V3();
const tmpCam = new THREE.PerspectiveCamera();
/* Pull back along dir until every point fits inside the free part of the screen (a few Newton-like steps). */
function fitPose(target, dir, pts, pad = 1.08, d = 300, lowAnchor = null) {
  const fw = innerWidth - insets.l - insets.r, fh = innerHeight - insets.t - insets.b;
  const cx = insets.l + fw / 2, cy = insets.t + fh / 2;
  const measureAt = (dd, tgt) => {
    tmpCam.copy(camera); tmpCam.position.copy(tgt).addScaledVector(dir, dd); tmpCam.lookAt(tgt); tmpCam.updateMatrixWorld(true);
    let m = 0.01;
    for (const p of pts) {
      pv.copy(p).project(tmpCam);
      if (pv.z > 1) { m = Math.max(m, 3); continue; }
      const sx = (pv.x + 1) / 2 * innerWidth, sy = (1 - pv.y) / 2 * innerHeight;
      m = Math.max(m, Math.abs(sx - cx) / (fw / 2), Math.abs(sy - cy) / (fh / 2));
    }
    return m;
  };
  for (let it = 0; it < 6; it++) d *= Math.max(0.3, measureAt(d, target) * pad);
  let tgt = target;
  if (lowAnchor) { // slide the view so the line-up's feet sit near the bottom of the free area
    tmpCam.copy(camera); tmpCam.position.copy(target).addScaledVector(dir, d); tmpCam.lookAt(target); tmpCam.updateMatrixWorld(true);
    pv.copy(lowAnchor).project(tmpCam);
    const sy = (1 - pv.y) / 2 * innerHeight, want = insets.t + fh * 0.9;
    const wpp = (2 * d * Math.tan(camera.fov * DEG / 2)) / (camera.view ? camera.view.fullHeight : innerHeight);
    const shift = (want - sy) * wpp;
    for (let k = 0; k < 5; k++) { // but keep the tallest point in frame
      const t2 = target.clone(); t2.y += shift * (1 - k * 0.2);
      if (measureAt(d, t2) <= 1 / pad + 0.02) { tgt = t2; break; }
    }
  }
  return { pos: tgt.clone().addScaledVector(dir, d), target: tgt };
}
function overviewPose() {
  const cs = (lineBounds.l + lineBounds.r) / 2, h = lineBounds.hmax, th = cs / ARC_R;
  const target = arcPoint(cs, h * 0.5);
  // phones (portrait): look diagonally along the arc so the whole line-up fits; wide screens: face it square on
  const dir = isPhone() && innerHeight > innerWidth && order.length > 5 ? new V3(-0.86, 0.3, 0.42).normalize() : new V3(-Math.sin(th), 0.07, Math.cos(th)).normalize();
  const pts = [];
  for (let k = 0; k <= 10; k++) { const ss = lineBounds.l + (lineBounds.r - lineBounds.l) * k / 10; pts.push(arcPoint(ss, 0), arcPoint(ss, 0, 14)); }
  for (const it of [refs.statue, refs.pole, ...order]) pts.push(it.holder.position.clone().setY(it.h + 5));
  return fitPose(target, dir, pts, 1.03, ARC_R * 0.8, arcPoint(cs, 0, 14));
}
function focusPose(r) {
  const h = r.h, th = r.holder.userData.s / ARC_R;
  const target = r.holder.position.clone().setY(h * 0.5);
  const dir = new V3(0.34, 0.1, 1).normalize().applyAxisAngle(new V3(0, 1, 0), -th);
  const pts = [];
  const hw = Math.max(r.w / 2, 2) * 1.5, side = new V3(Math.cos(th), 0, Math.sin(th));
  for (const y of [0, h + 1.5]) for (const s of [-hw, hw]) pts.push(r.holder.position.clone().addScaledVector(side, s).setY(y));
  const res = fitPose(target, dir, pts, 1.14, h * 2);
  if (res.pos.distanceTo(res.target) < 16) res.pos.copy(res.target).addScaledVector(dir, 16);
  return res;
}
let flight = null;
function flyTo({ pos, target }, dur = 1.6) {
  if (flight) flight.kill();
  dur = D(dur);
  if (!dur) { camera.position.copy(pos); controls.target.copy(target); controls.update(); dirty = true; return; }
  const p0 = camera.position.clone(), t0 = controls.target.clone();
  const dist = p0.distanceTo(pos), arc = Math.min(160, dist * 0.18);
  const o = { t: 0 };
  controls.enabled = false;
  flight = gsap.to(o, {
    t: 1, duration: dur, ease: 'power2.inOut',
    onUpdate: () => {
      const t = o.t;
      camera.position.lerpVectors(p0, pos, t); camera.position.y += Math.sin(Math.PI * t) * arc;
      controls.target.lerpVectors(t0, target, t);
      camera.lookAt(controls.target); dirty = true;
    },
    onComplete: () => { flight = null; controls.enabled = true; controls.update(); }
  });
}

/* ================================================================== NAME TAGS */
const tagsEl = $('tags');
const tagFor = (html, cls, onClick) => {
  const b = document.createElement('button'); b.className = 'hg-tag ' + (cls || ''); b.innerHTML = html; b.tabIndex = -1;
  if (onClick) b.addEventListener('click', onClick);
  tagsEl.appendChild(b); return b;
};
const refTags = {};
let hoverId = null;
function makeTags() {
  for (const r of rockets) {
    r.tag = tagFor(`${r.d.name}<small>${fmtNum(r.h, 1)} m</small>`, '', () => select(r.id));
    r.tag.addEventListener('pointerenter', () => { hoverId = r.id; dirty = true; });
    r.tag.addEventListener('pointerleave', () => { hoverId = null; dirty = true; });
  }
  refTags.statue = tagFor('Statue of Liberty<small>93 m to the torch</small>', 'ref');
  refTags.pole = tagFor('Survey pole<small>10 m bands · 130 m</small>', 'ref');
  refTags.line = tagFor('<small></small>', 'ref');
  refTags.person = tagFor('Person<small>1.8 m</small>', 'ref');
  for (const el of tagsEl.children) { el._w = el.offsetWidth; el._h = el.offsetHeight; }
}
function screenOf(x, y, z) {
  pv.set(x, y, z).project(camera);
  if (pv.z > 1 || pv.z < -1) return null;
  return [(pv.x + 1) / 2 * innerWidth, (1 - pv.y) / 2 * innerHeight];
}
const overlaps = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
function updateTags() {
  const placed = hudRects.slice();
  const W = innerWidth, H = innerHeight;
  const cand = [];
  const selR = state.sel && byId[state.sel];
  for (const r of rockets) {
    if (!r.shown || r.inner.scale.y < 0.5) { r.tag.classList.add('off'); continue; }
    const hp = r.holder.position, s = screenOf(hp.x, r.h * r.inner.scale.y + 1.0, hp.z);
    const pri = r.id === state.sel ? 1e6 : state.cmp.includes(r.id) && state.tab === 'compare' ? 1e5 : r.id === hoverId ? 5e4 : r.h;
    cand.push({ el: r.tag, s, pri });
    r.tag.classList.toggle('sel', r.id === state.sel);
    r.tag.classList.toggle('hover', r.id === hoverId);
    const ci = state.cmp.indexOf(r.id); for (let k = 0; k < 3; k++) r.tag.classList.toggle('cmp' + k, ci === k && state.tab === 'compare');
  }
  { const a = refs.statue.holder.position, b = refs.pole.holder.position; cand.push({ el: refTags.statue, s: screenOf(a.x, 94.5, a.z), pri: 60 }); cand.push({ el: refTags.pole, s: screenOf(b.x, 133, b.z), pri: 59 }); }
  if (selR && selR.shown && state.line) {
    refTags.line.querySelector('small').textContent = `${selR.d.name} · ${fmtNum(selR.h, 1)} m`;
    const p = arcPoint(lineBounds.l - 8, selR.h + 1.2); cand.push({ el: refTags.line, s: screenOf(p.x, p.y, p.z), pri: 2e5 });
  } else refTags.line.classList.add('off');
  if (selR && selR.shown && camera.position.distanceTo(controls.target) < 120) {
    const p = selR.holder.localToWorld(selR.person.position.clone()); cand.push({ el: refTags.person, s: screenOf(p.x, 2.3, p.z), pri: 1.5e5 });
  } else refTags.person.classList.add('off');
  cand.sort((a, b) => b.pri - a.pri);
  for (const c of cand) {
    const el = c.el;
    if (!c.s || c.s[0] < -80 || c.s[0] > W + 80 || c.s[1] < 64 + (el._h || 30) || c.s[1] > H + 40) { el.classList.add('off'); continue; }
    const w = el._w || 80, h = el._h || 30;
    const rect = [c.s[0] - w / 2 - 3, c.s[1] - h - 9, c.s[0] + w / 2 + 3, c.s[1] - 6];
    if (placed.some(p => overlaps(rect, p))) { el.classList.add('off'); continue; }
    placed.push(rect);
    el.classList.remove('off');
    const tx = Math.round(c.s[0]), ty = Math.round(c.s[1] - 7);
    if (el._tx !== tx || el._ty !== ty) { el.style.transform = `translate(${tx}px, ${ty}px) translate(-50%, -100%)`; el._tx = tx; el._ty = ty; }
  }
  tagsEl.classList.toggle('hidden', !state.tags);
}

/* ================================================================== FORMATTING */
function fmtNum(v, d = 0) { if (v == null || !isFinite(v)) return '—'; return v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }); }
function fmtMassHTML(kg) { if (kg == null) return '—'; if (kg < 1000) return `${fmtNum(kg)}<small>kg</small>`; return `${fmtNum(kg / 1000, kg >= 100000 ? 0 : kg >= 10000 ? 1 : 2)}<small>t</small>`; }
function fmtThrustHTML(kN) { if (kN == null) return '—'; return kN >= 10000 ? `${fmtNum(kN / 1000, 1)}<small>MN</small>` : `${fmtNum(kN, kN < 1000 ? 1 : 0)}<small>kN</small>`; }
function fmtDate(s) { const d = new Date(s + 'T12:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function unv(f) { return f && f.verified === false ? `<abbr class="hg-unv" title="Not verified against a source for this edition${f.note ? ': ' + esc(f.note) : ''}">≈</abbr>` : ''; }
const STATUS = { retired: ['Retired', ''], active: ['Flying', 'aurora'], development: ['In development', 'sol'] };

/* dataset maxima for the mini context bars */
let MAX = {};
function computeMax() {
  const ds = DATA.rockets;
  MAX = {
    height: Math.max(...ds.map(d => val(d.height))), mass: Math.max(...ds.map(d => val(d.mass) || 0)),
    thrust: Math.max(...ds.map(d => val(d.thrust) || 0)), leo: Math.max(...ds.map(d => (d.payload && val(d.payload.leo)) || 0)),
    tw: Math.max(...ds.map(d => tw(d) || 0)), pf: Math.max(...ds.map(d => pfrac(d) || 0))
  };
}

/* ================================================================== PANEL: ROCKET CARD */
function readout(k, v, frac, hl, sub) {
  return `<div class="readout${hl ? ' hl' : ''}"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="hg-sub">${sub}</div>` : ''}${frac != null ? `<div class="hg-bar-mini"><i style="width:${clamp(frac * 100, 1.5, 100).toFixed(1)}%"></i></div>` : ''}</div>`;
}
function renderCard() {
  const el = $('tab-rocket');
  const r = state.sel && byId[state.sel];
  if (!r) { el.innerHTML = overviewHTML(); bindFacts(el); return; }
  const d = r.d, P = d.payload || {};
  const T = tw(d), PF = pfrac(d);
  const leo = P.leo, second = P.tli ? ['To the Moon', P.tli, 'Trans-lunar injection (TLI)'] : P.gto ? ['Geostationary transfer', P.gto, 'Geostationary transfer orbit (GTO)'] : P.sso ? ['Sun-synchronous orbit', P.sso, 'Sun-synchronous orbit (SSO)'] : P.suborbital ? ['Suborbital', P.suborbital, 'Suborbital'] : null;
  const st = STATUS[d.status];
  const L = d.launches;
  const asOf = L.asOf === 'final' ? 'final record' : 'as of ' + esc(/^\d{4}-\d\d-\d\d/.test(L.asOf) ? fmtDate(L.asOf.slice(0, 10)) + L.asOf.slice(10) : L.asOf);
  const launches = L.total == null ? esc(L.note || '—')
    : `${fmtNum(L.total)} launches · ${fmtNum(L.successes)} successful${L.failures ? ` · ${L.failures} failed` : ''}${L.partial ? ` · ${L.partial} partial` : ''} <span class="muted">(${asOf})</span>${unv(L)}${L.note ? `<br><span class="muted">${esc(L.note)}</span>` : ''}`;
  const notes = [];
  const addNote = (lbl, f) => { if (f && f.note) notes.push(`<li><b>${lbl}:</b> ${esc(f.note)}</li>`); };
  addNote('Height', d.height); addNote('Diameter', d.diameter); addNote('Width', d.width); addNote('Mass', d.mass); addNote('Thrust', d.thrust);
  addNote('Payload to low Earth orbit (LEO)', leo); if (second) addNote(second[2], second[1]);
  if (d.firstFlightNote) notes.push(`<li><b>First flight:</b> ${esc(d.firstFlightNote)}</li>`);
  if (d.massNote) notes.push(`<li><b>Mass:</b> ${esc(d.massNote)}</li>`);
  if (d.statusNote) notes.push(`<li><b>Status:</b> ${esc(d.statusNote)}</li>`);
  const idx = order.indexOf(r);
  el.innerHTML = `<article class="hg-card">
    <div class="hg-card-head"><h3>${esc(d.name)}</h3><div class="hg-var">${esc(d.variant)}</div></div>
    <div class="hg-chips"><span class="chip" style="color:${REGION_COL[d.region]};border-color:currentColor">${esc(d.country)}</span><span class="chip ${st[1]}">${st[0]}</span><span class="chip">First flight ${year(d)}</span></div>
    <div class="readouts">
      ${readout('Height', `${fmtNum(val(d.height), 2)}<small>m</small>${unv(d.height)}`, val(d.height) / MAX.height, true)}
      ${readout('Diameter', `${fmtNum(val(d.diameter), 2)}<small>m</small>${unv(d.diameter)}`, null, false, d.width ? `${fmtNum(val(d.width), 1)} m across${unv(d.width)}` : '')}
      ${readout('Liftoff mass', `${fmtMassHTML(val(d.mass))}${unv(d.mass)}`, d.mass ? val(d.mass) / MAX.mass : null)}
      ${readout('Liftoff thrust', `${fmtThrustHTML(val(d.thrust))}${unv(d.thrust)}`, val(d.thrust) / MAX.thrust)}
      ${readout('Low Earth orbit', leo ? `${fmtMassHTML(val(leo))}${unv(leo)}` : '<small>none (suborbital)</small>', leo ? val(leo) / MAX.leo : null)}
      ${readout(second ? second[0] : 'Other orbits', second ? `${fmtMassHTML(val(second[1]))}${unv(second[1])}` : '—', null)}
      ${readout('Thrust ÷ weight', T ? `${T.toFixed(2)}${unv(d.thrust.verified === false ? d.thrust : d.mass)}` : '—', T ? T / MAX.tw : null)}
      ${readout('Payload fraction', PF ? `${(PF * 100).toFixed(2)}<small>%</small>` : '—', PF ? PF / MAX.pf : null)}
    </div>
    <p class="hg-story">${esc(d.story)}</p>
    <div class="hg-rows">
      <div class="hg-row"><span>First flight</span><span>${fmtDate(d.firstFlight)}${d.lastFlight && d.status === 'retired' ? ` · last ${fmtDate(d.lastFlight)}` : ''}</span></div>
      <div class="hg-row"><span>Operator</span><span>${esc(d.operator)}</span></div>
      <div class="hg-row"><span>Stages</span><span>${d.stages} · ${esc(d.engines)}</span></div>
      <div class="hg-row"><span>Propellants</span><span>${esc(d.propellants)}</span></div>
      <div class="hg-row"><span>Record</span><span>${launches}</span></div>
      <div class="hg-row"><span>Reuse</span><span>${esc(d.reusability)}</span></div>
    </div>
    <div class="hg-card-btns">
      <button class="btn small" data-act="prev" ${idx <= 0 ? 'disabled' : ''}>← ${idx > 0 ? esc(order[idx - 1].d.name) : ''}</button>
      <button class="btn small" data-act="next" ${idx < 0 || idx >= order.length - 1 ? 'disabled' : ''}>${idx >= 0 && idx < order.length - 1 ? esc(order[idx + 1].d.name) : ''} →</button>
      <button class="btn small" data-act="cmp">+ Compare</button>
      <button class="btn small" data-act="ov">Overview</button>
    </div>
    ${notes.length ? `<details><summary class="hint" style="cursor:pointer;margin:6px 0">Notes on these figures (${notes.length})</summary><ul class="hg-notes">${notes.join('')}</ul></details>` : ''}
    <ul class="hg-srcs">${d.sources.map(s => `<li>Source: <a href="${esc(s.url)}" rel="noopener" target="_blank">${esc(s.label)}</a></li>`).join('')}</ul>
  </article>`;
  el.querySelectorAll('[data-act]').forEach(b => b.addEventListener('click', () => {
    const a = b.dataset.act;
    if (a === 'prev') step(-1); else if (a === 'next') step(1); else if (a === 'ov') select(null);
    else if (a === 'cmp') { addCompare(r.id); setTab('compare'); }
  }));
}
function facts() {
  const ds = DATA.rockets;
  const best = (f, min = false) => ds.filter(d => f(d) != null && f(d) > 0).sort((a, b) => (min ? f(a) - f(b) : f(b) - f(a)))[0];
  const t = best(d => val(d.height)), s = best(d => val(d.height), true), th = best(d => val(d.thrust)), hv = best(d => val(d.mass));
  const lp = best(d => d.payload && val(d.payload.leo)), ln = best(d => d.launches.total);
  const rel = ds.filter(d => d.launches.total >= 20 && d.launches.successes != null).sort((a, b) => b.launches.successes / b.launches.total - a.launches.successes / a.launches.total || b.launches.total - a.launches.total)[0];
  const T = best(d => tw(d));
  return [
    ['Tallest', t, `${fmtNum(val(t.height), 1)} m`], ['Most thrust', th, `${fmtNum(val(th.thrust) / 1000, 1)} MN`],
    ['Most payload to orbit', lp, `${fmtNum(val(lp.payload.leo) / 1000, 0)} t`], ['Heaviest', hv, `${fmtNum(val(hv.mass) / 1000, 0)} t`],
    ['Most launches', ln, `${fmtNum(ln.launches.total)}`], ['Most reliable (20+ flights)', rel, `${(rel.launches.successes / rel.launches.total * 100).toFixed(1)} %`],
    ['Highest thrust ÷ weight', T, tw(T).toFixed(2)], ['Smallest', s, `${fmtNum(val(s.height), 1)} m`]
  ];
}
function factsHTML(n = 8) { return `<div class="hg-facts">${facts().slice(0, n).map(([k, d, v]) => `<button class="hg-fact" data-id="${d.id}"><div class="k">${k}</div><div class="v">${esc(d.name)}</div><div class="s">${v}</div></button>`).join('')}</div>`; }
function bindFacts(el) { el.querySelectorAll('[data-id]').forEach(b => b.addEventListener('click', () => select(b.dataset.id))); }
function overviewHTML() {
  return `<div class="hg-ov"><p>Every rocket stands at its real height beside the Statue of Liberty (93 m to the torch). The survey pole's red and white bands are each 10 m, and the orange figure at each rocket's feet is a 1.8 m person.</p>
  <p>Select a rocket in the scene, from the list above or on the timeline to fly to it; <b>Sort</b> rearranges the line-up, and <b>Compare</b> stands two or three side by side.</p>
  <p class="hint" style="margin:0">Biggest ever, computed from this page's data:</p>${factsHTML(4)}</div>`;
}

/* ================================================================== PANEL: COMPARE */
function addCompare(id) {
  if (!id || state.cmp.includes(id)) return;
  if (state.cmp.length >= 3) state.cmp.shift();
  state.cmp.push(id);
  renderCompare();
  if (state.tab === 'compare' && state.cmpSolo) { layout(true); gsap.delayedCall(D(0.3), () => flyTo(overviewPose(), 1.5)); }
}
function removeCompare(id) {
  state.cmp = state.cmp.filter(x => x !== id); renderCompare();
  if (state.tab === 'compare' && state.cmpSolo) { layout(true); gsap.delayedCall(D(0.3), () => flyTo(overviewPose(), 1.5)); }
}
function renderCompare() {
  const list = state.cmp.map(id => byId[id].d);
  $('cmpChips').innerHTML = list.map((d, i) => `<span class="hg-cmp-chip" style="--c:${CMP_COL[i]}"><i></i>${esc(d.name)}<button data-rm="${d.id}" aria-label="Remove ${esc(d.name)}">×</button></span>`).join('');
  $('cmpChips').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => removeCompare(b.dataset.rm)));
  const bars = $('cmpBars');
  if (list.length < 2) { bars.innerHTML = `<p class="hg-empty">${list.length ? 'Add one or two more rockets.' : 'Nothing picked yet. Try the Saturn V against Starship, or the V-2 against Electron.'}</p>`; return; }
  const metrics = [
    ['Height', d => val(d.height), v => `${fmtNum(v, 1)} m`],
    ['Liftoff mass', d => val(d.mass), v => `${fmtNum(v / 1000, 0)} t`],
    ['Liftoff thrust', d => val(d.thrust), v => (v >= 10000 ? `${fmtNum(v / 1000, 1)} MN` : `${fmtNum(v, 0)} kN`)],
    ['Payload to low Earth orbit', d => d.payload && val(d.payload.leo), v => (v >= 1000 ? `${fmtNum(v / 1000, 1)} t` : `${fmtNum(v)} kg`)],
    ['Payload fraction', d => pfrac(d), v => `${(v * 100).toFixed(2)} %`]
  ];
  let html = '';
  for (const [name, f, fmt] of metrics) {
    const vs = list.map(f), mx = Math.max(...vs.filter(v => v != null), 1e-9);
    html += `<div class="hg-metric"><div class="hg-metric-h"><span>${name}</span></div>`;
    list.forEach((d, i) => {
      const v = vs[i];
      html += `<div class="hg-bar" style="--c:${CMP_COL[i]}"><div class="t"><i style="width:${v != null ? clamp(v / mx * 100, 1, 100).toFixed(1) : 0}%"></i><em>${esc(d.name)}</em></div><div class="n">${v != null ? fmt(v) : '—'}</div></div>`;
    });
    html += '</div>';
  }
  html += `<div class="hg-metric-h" style="margin-top:14px"><span>Thrust-to-weight at liftoff</span></div><div class="hg-tw">`;
  list.forEach((d, i) => {
    const T = tw(d);
    html += `<div class="hg-tw-row" style="--c:${CMP_COL[i]}"><i></i><span>${esc(d.name)}<small>${T ? `${fmtNum(val(d.thrust))} kN ÷ (${fmtNum(val(d.mass) / 1000, 1)} t × 9.81 m/s²)` : 'liftoff mass not published'}</small></span><b>${T ? T.toFixed(2) : '—'}</b></div>`;
  });
  html += `</div><p class="hint" style="margin-top:10px">Above 1.0 the rocket can lift itself; most leave the pad between 1.2 and 1.5 and speed up as they burn propellant.</p>`;
  bars.innerHTML = html;
}

/* ================================================================== PANEL: THE NUMBERS */
function katexInto(el, s) { if (window.katex) katex.render(s, el, { throwOnError: false, displayMode: true }); else el.textContent = s; }
function renderLearn() {
  const el = $('tab-learn');
  const sv = byId['saturn-v'].d, f9 = byId.falcon9.d;
  const isp = 350, mr = Math.exp(DV_LEO / (isp * G0)), prop = 1 - 1 / mr;
  const rank = (f) => DATA.rockets.filter(d => f(d)).sort((a, b) => f(b) - f(a));
  const pfs = rank(pfrac), tws = rank(tw);
  const pfMax = pfrac(pfs[0]), twMax = tw(tws[0]);
  el.innerHTML = `<div class="hg-learn">
    <h3>Payload fraction</h3>
    <p>How much of the rocket on the pad actually reaches orbit. It is tiny for every launcher ever built: most of a rocket is propellant, and the rest is tanks and engines.</p>
    <div class="hg-eq" data-tex="\\lambda = \\frac{m_\\text{payload}}{m_0}"></div>
    <p>Saturn V: ${fmtNum(val(sv.payload.leo) / 1000)} t ÷ ${fmtNum(val(sv.mass) / 1000)} t = <b>${(pfrac(sv) * 100).toFixed(1)} %</b>. Falcon 9 (expendable): ${fmtNum(val(f9.payload.leo) / 1000, 1)} t ÷ ${fmtNum(val(f9.mass) / 1000)} t = <b>${(pfrac(f9) * 100).toFixed(1)} %</b>.</p>
    <div class="hg-rank" aria-label="Payload fraction ranking">${pfs.map(d => `<button data-id="${d.id}" class="${d.id === state.sel ? 'sel' : ''}"><span>${esc(d.name)}</span><span class="t"><i style="width:${(pfrac(d) / pfMax * 100).toFixed(1)}%"></i></span><span class="n">${(pfrac(d) * 100).toFixed(1)} %</span></button>`).join('')}</div>
    <p class="hint">The Space Shuttle looks worst because its roughly 80-tonne orbiter is not counted as payload. Payload to low Earth orbit (LEO) is quoted for different orbits and recovery modes, so compare classes, not decimals.</p>

    <h3>Thrust-to-weight at liftoff</h3>
    <p>Thrust must beat weight before a rocket moves at all. The margin above 1 is the upward acceleration in units of <i>g</i>, and it grows as propellant burns away.</p>
    <div class="hg-eq" data-tex="\\frac{T}{W} = \\frac{F_\\text{liftoff}}{m_0\\, g_0},\\qquad a_0 = \\left(\\frac{T}{W} - 1\\right) g_0"></div>
    <div class="hg-rank" aria-label="Thrust-to-weight ranking">${tws.map(d => `<button data-id="${d.id}" class="${d.id === state.sel ? 'sel' : ''}"><span>${esc(d.name)}</span><span class="t"><i style="width:${(tw(d) / twMax * 100).toFixed(1)}%"></i></span><span class="n">${tw(d).toFixed(2)}</span></button>`).join('')}</div>
    <p class="hint">g₀ = 9.80665 m/s². Computed from each rocket's liftoff thrust and mass; for Ariane 5 and 6 only the boosters' thrust is counted, so they are slightly understated.</p>

    <h3>Why stages?</h3>
    <p>The rocket equation links the speed change Δv to the exhaust velocity (specific impulse I<sub>sp</sub> times g₀) and the ratio of full to empty mass:</p>
    <div class="hg-eq" data-tex="\\Delta v = I_\\text{sp}\\, g_0 \\ln\\frac{m_0}{m_f}"></div>
    <p>Reaching orbit takes about ${fmtNum(DV_LEO / 1000, 1)} km/s including gravity and drag losses. With a good kerosene engine (I<sub>sp</sub> ≈ ${isp} s) a single stage needs m₀/m<sub>f</sub> = e<sup>${(DV_LEO / (isp * G0)).toFixed(2)}</sup> ≈ <b>${mr.toFixed(1)}</b>, so ${(prop * 100).toFixed(1)} % of it must be propellant before any payload is added. Staging throws the empty tanks and heavy first-stage engines away on the way up, so each stage only has to accelerate what is left: that is why almost every rocket here has two or more.</p>

    <h3>Biggest ever, from this data</h3>
    ${factsHTML(8)}
    <p class="hint">Computed live from <a href="data/rockets.json">rockets.json</a>. Launch counts for active rockets are as of each source's date and will keep changing.</p>
  </div>`;
  el.querySelectorAll('[data-tex]').forEach(e => katexInto(e, e.dataset.tex));
  bindFacts(el);
}

/* ================================================================== TIMELINE */
const TL0 = 1940, TL1 = 2030;
function buildTimeline() {
  const tr = $('tlTrack');
  let html = '<div class="hg-tl-axis"></div>';
  [[1940, 'Pioneers'], [1961, 'Space Race'], [1976, 'Shuttle era'], [2010, 'Reusable era']].forEach(([y, n]) => { html += `<div class="hg-tl-era" data-y="${y}">${n}</div>`; });
  for (let y = TL0; y <= TL1; y += 10) html += `<span class="hg-tl-tick" data-y="${y}">${y}</span>`;
  tr.innerHTML = html;
  $('tlLegend').innerHTML = Object.entries(REGION_NAME).map(([k, n]) => `<span><i style="--c:${REGION_COL[k]}"></i>${n}</span>`).join('');
  for (const r of rockets) {
    const b = document.createElement('button'); b.className = 'hg-tl-dot'; b.style.setProperty('--c', REGION_COL[r.d.region]);
    b.setAttribute('aria-label', `${r.d.name}, first flight ${year(r.d)}`);
    b.innerHTML = `<span class="tip">${esc(r.d.name)} · ${year(r.d)}</span>`;
    b.addEventListener('click', () => select(r.id));
    tr.appendChild(b); r.dot = b;
  }
}
function renderTimeline() {
  const tr = $('tlTrack'); if (!tr || !rockets[0] || !rockets[0].dot) return;
  const W = tr.clientWidth || 600, H = tr.clientHeight || 58;
  const X = (y) => ((y - TL0) / (TL1 - TL0)) * W;
  tr.querySelectorAll('[data-y]').forEach(e => { e.style.left = X(+e.dataset.y) + 'px'; });
  const rows = [];
  const sorted = rockets.slice().sort((a, b) => SORTS.year(a.d) - SORTS.year(b.d));
  const small = W < 500, gapX = small ? 10 : 13, rowH = small ? 8 : 11, maxRows = Math.max(1, Math.floor((H - 26) / rowH));
  for (const r of sorted) {
    const t = new Date(r.d.firstFlight); const fy = t.getUTCFullYear() + t.getUTCMonth() / 12;
    const x = X(fy);
    let row = 0; while (row < maxRows - 1 && rows[row] != null && rows[row] > x - gapX) row++;
    rows[row] = x;
    r.dot.style.left = x + 'px'; r.dot.style.top = (H - 14 - 9 - row * rowH) + 'px';
    r.dot.classList.toggle('dim', !r.shown);
    r.dot.classList.toggle('sel', r.id === state.sel);
  }
  const s = state.sel && byId[state.sel];
  $('tlSel').textContent = s ? `${s.d.name} · ${fmtDate(s.d.firstFlight)}` : `${order.length} of ${rockets.length} shown`;
}

/* ================================================================== SELECTION & UI WIRING */
function reframe() { if (state.sel && byId[state.sel].shown) flyTo(focusPose(byId[state.sel]), 1.6); else flyTo(overviewPose(), 1.8); }
function select(id, { fly = true } = {}) {
  if (id && !byId[id]) return;
  if (id && !byId[id].shown) { // bring it back: reset filters (and leave the compare-only view)
    state.filters = { era: 'all', country: 'all', status: 'all' };
    $('fEra').value = $('fCountry').value = $('fStatus').value = 'all';
    if (state.tab === 'compare' && state.cmpSolo && !state.cmp.includes(id)) setTab('rocket', false);
    layout(true);
    state.sel = id;
    if (fly) gsap.delayedCall(D(1.3), () => flyTo(focusPose(byId[id]), 1.6));
  } else {
    state.sel = id;
    if (fly) (id ? flyTo(focusPose(byId[id]), 1.6) : flyTo(overviewPose(), 1.8));
  }
  $('pick').value = id || '';
  if (state.tab === 'learn') renderLearn();
  renderCard(); renderTimeline(); positionMarkers();
  dirty = true;
}
function step(dir) {
  if (!order.length) return;
  let i = state.sel ? order.indexOf(byId[state.sel]) : (dir > 0 ? -1 : order.length);
  i = clamp(i + dir, 0, order.length - 1);
  select(order[i].id);
}
function setTab(t, relayout = true) {
  const was = state.tab; state.tab = t;
  $('tabs').querySelectorAll('button').forEach(b => { const on = b.dataset.tab === t; b.setAttribute('aria-pressed', on); b.setAttribute('aria-selected', on); });
  for (const n of ['rocket', 'compare', 'learn']) $('tab-' + n).hidden = n !== t;
  if (t === 'learn') renderLearn();
  if (t === 'compare') { if (!state.cmp.length && state.sel) state.cmp.push(state.sel); renderCompare(); }
  if (relayout && (was === 'compare') !== (t === 'compare') && state.cmpSolo && state.cmp.length >= 2) {
    layout(true);
    if (t === 'compare') { if (state.sel && !state.cmp.includes(state.sel)) state.sel = null; renderCard(); positionMarkers(); gsap.delayedCall(D(0.4), () => flyTo(overviewPose(), 1.8)); }
    else gsap.delayedCall(D(0.4), reframe);
  }
  dirty = true;
}
function wireUI() {
  const pick = $('pick'), add = $('cmpAdd');
  const opts = DATA.rockets.slice().sort((a, b) => a.name.localeCompare(b.name)).map(d => `<option value="${d.id}">${esc(d.name)} · ${year(d)}</option>`).join('');
  pick.insertAdjacentHTML('beforeend', opts); add.insertAdjacentHTML('beforeend', opts);
  pick.addEventListener('change', () => select(pick.value || null));
  add.addEventListener('change', () => { addCompare(add.value); add.value = ''; });
  $('cmpClear').addEventListener('click', () => { state.cmp = []; renderCompare(); layout(true); flyTo(overviewPose(), 1.6); });
  $('cmpSolo').addEventListener('change', (e) => { state.cmpSolo = e.target.checked; layout(true); gsap.delayedCall(D(0.3), reframe); });
  $('sort').querySelectorAll('button').forEach(b => b.addEventListener('click', () => setSort(b.dataset.k)));
  $('tabs').querySelectorAll('button').forEach(b => b.addEventListener('click', () => setTab(b.dataset.tab)));
  for (const [id, k] of [['fEra', 'era'], ['fCountry', 'country'], ['fStatus', 'status']]) $(id).addEventListener('change', (e) => {
    state.filters[k] = e.target.value;
    if (state.tab === 'compare' && state.cmpSolo) setTab('rocket', false);
    layout(true);
    if (state.sel && !byId[state.sel].shown) { state.sel = null; renderCard(); positionMarkers(); }
    gsap.delayedCall(D(0.35), reframe);
  });
  $('quality').querySelectorAll('button').forEach(b => b.addEventListener('click', () => setQuality(b.dataset.q)));
  $('optTags').addEventListener('change', e => { state.tags = e.target.checked; dirty = true; });
  $('optLine').addEventListener('change', e => { state.line = e.target.checked; positionMarkers(); });
  $('collapse').addEventListener('click', () => setTimeout(measureInsets, 60));
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowRight') { step(1); e.preventDefault(); } else if (e.key === 'ArrowLeft') { step(-1); e.preventDefault(); } else if (e.key === 'Escape') select(null);
  });
}
function setSort(k) {
  if (!SORTS[k]) return;
  state.sort = k;
  $('sort').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === k));
  layout(true);
  if (state.sel) gsap.delayedCall(D(0.2), () => flyTo(focusPose(byId[state.sel]), 1.5)); else gsap.delayedCall(D(0.1), () => flyTo(overviewPose(), 1.5));
  renderCard();
}
function setQuality(q) {
  if (!QUALITY[q]) return;
  const segChanged = QUALITY[q].seg !== Q.seg;
  qName = q; Q = QUALITY[q];
  try { localStorage.setItem('cx-hangar-q', q); } catch (e) { /* private mode */ }
  $('quality').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.q === q));
  setPR(); renderer.setSize(innerWidth, innerHeight);
  const sh = Q.shadow > 0;
  if (renderer.shadowMap.enabled !== sh) { renderer.shadowMap.enabled = sh; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
  sunLight.castShadow = sh;
  if (sh) { sunLight.shadow.mapSize.set(Q.shadow, Q.shadow); if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; } }
  if (segChanged) rebuildModels(); else markShadows();
}

/* pointer picking */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
let downAt = null, hoverDirty = false, lastMove = null;
function pick(ev) {
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.set(((ev.clientX - rect.left) / rect.width) * 2 - 1, -((ev.clientY - rect.top) / rect.height) * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hits = ray.intersectObjects(rockets.filter(r => r.shown).map(r => r.proxy), false);
  return hits.length ? hits[0].object.userData.rocket : null;
}
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt) return;
  const moved = Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]); downAt = null;
  if (moved > 6) return;
  const r = pick(e);
  if (r) select(r.id);
});
renderer.domElement.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { lastMove = e; hoverDirty = true; } });
renderer.domElement.addEventListener('dblclick', (e) => { if (!pick(e)) select(null); });

/* ================================================================== LOOP */
let dirty = true, running = true, frames = 0;
const timer = new THREE.Timer();
function frame() {
  timer.update();
  const dt = Math.min(0.05, timer.getDelta());
  if (controls.enabled && controls.update(dt)) dirty = true;
  if (controls.target.y < 0) { controls.target.y = 0; dirty = true; }
  if (hoverDirty && lastMove && !flight) {
    hoverDirty = false;
    const r = pick(lastMove); const id = r ? r.id : null;
    renderer.domElement.style.cursor = r ? 'pointer' : '';
    if (id !== hoverId) { hoverId = id; dirty = true; }
  }
  if (!dirty) return;
  dirty = false;
  sky.position.copy(camera.position);
  renderer.render(scene, camera);
  updateTags();
  frames++;
}
function loop() { if (running) requestAnimationFrame(loop); frame(); }
document.addEventListener('visibilitychange', () => { const was = running; running = !document.hidden; if (running && !was) { timer.update(); loop(); } });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); measureInsets(); renderTimeline(); dirty = true; });

/* ================================================================== START */
async function start() {
  const res = await fetch('data/rockets.json');
  DATA = await res.json();
  computeMax();
  await buildAll();
  makeTags();
  buildTimeline();
  wireUI();
  $('quality').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.q === qName));
  $('sort').querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b.dataset.k === state.sort));
  if (isPhone()) { $('panel').classList.add('collapsed'); $('collapse').textContent = '▲ CONTROLS'; }
  measureInsets();
  const cmp = (params.get('cmp') || '').split(',').filter(id => byId[id]);
  if (cmp.length) state.cmp = cmp.slice(0, 3);
  const tab = params.get('tab');
  if (tab === 'compare' || tab === 'learn') setTab(tab, false);
  layout(false);
  renderCard();
  const r0 = params.get('r');
  renderer.compile(scene, camera);
  if (r0 && byId[r0]) { select(r0, { fly: false }); flyTo(focusPose(byId[r0]), 0); }
  else {
    const ov = overviewPose();
    if (REDUCED) flyTo(ov, 0);
    else { // opening shot: low beside the Statue of Liberty, then rise to the whole line-up
      const a = refs.statue.holder.position;
      camera.position.set(a.x - 60, 8, a.z + 90); controls.target.set(a.x + 40, 45, a.z); controls.update();
      gsap.delayedCall(0.4, () => flyTo(ov, 3.4));
    }
  }
  markShadows();
  loop();
  requestAnimationFrame(() => $('loading').classList.add('done'));
  window.__sim.ready = true;
}

/* ================================================================== DEBUG / TEST HOOK
 * window.__sim.select('saturn-v'); .sort('height'); .compare(['saturn-v','starship']);
 * .filter({era:'race'}); .tab('learn'); .quality('low'); .overview(); .state() */
window.__sim = {
  ready: false,
  three: { THREE, renderer, scene, camera, sunLight, rockets, refs, markShadows: () => markShadows(), redraw: () => { dirty = true; } },
  select: (id) => select(id || null),
  sort: (k) => setSort(k),
  compare: (ids) => { state.cmp = ids.filter(id => byId[id]).slice(0, 3); renderCompare(); if (state.tab !== 'compare') setTab('compare'); else { layout(true); gsap.delayedCall(D(0.3), () => flyTo(overviewPose(), 1.4)); } },
  filter: (f) => { Object.assign(state.filters, f); $('fEra').value = state.filters.era; $('fCountry').value = state.filters.country; $('fStatus').value = state.filters.status; layout(true); if (state.sel && !byId[state.sel].shown) { state.sel = null; renderCard(); positionMarkers(); } gsap.delayedCall(D(0.3), reframe); },
  tab: (t) => setTab(t),
  quality: (q) => setQuality(q),
  overview: () => select(null),
  cam: (px, py, pz, tx, ty, tz) => { flyTo({ pos: new V3(px, py, pz), target: new V3(tx, ty, tz) }, 0); },
  state: () => ({ sel: state.sel, sort: state.sort, tab: state.tab, cmp: state.cmp.slice(), order: order.map(r => r.id), frames, calls: renderer.info.render.calls, tris: renderer.info.render.triangles,
    scaleErr: Object.fromEntries(rockets.map(r => [r.id, +r.scaleErr.toFixed(3)])) })
};
start().catch(err => { console.error(err); $('loadMsg').textContent = 'Could not build the hangar: ' + err.message; });
