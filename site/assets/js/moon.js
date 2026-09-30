/* Cosmic Library · Moon explorer (moon.html).
 *
 * Positions, phase and libration: ./moon-astro.js (J. Meeus, "Astronomical Algorithms",
 * 2nd ed., chapters 22, 25, 47, 48, 53). The 3-D Moon is built in selenographic
 * coordinates and turned so that, seen from the camera, it shows exactly the sub-Earth
 * point (the total libration l, b) with its axis at position angle P from celestial north.
 * The Sun direction is the selenographic sub-solar point from the same chapter, so the
 * terminator, phase and libration are all mutually consistent.
 *
 * Frames
 *   Moon local (Three.js axes): +Z -> selenographic lon 0 / lat 0 (mean sub-Earth point),
 *                               +X -> lon 90 E, +Y -> lunar north pole.
 *   World ("sky" frame for the Earth view): +Z toward the observer on Earth,
 *                               +Y celestial north, +X celestial WEST (east is on the left).
 *
 * Surface: procedural albedo and height maps (scripts/build_moon_textures.py). Photometry:
 * lunar-Lambert function (A. McEwen 1991, Icarus 92) so the full Moon shows no limb darkening.
 *
 * URL flags: ?still (freeze animations for screenshots), ?q=low (fewer triangles, no
 * close-up detail), ?t=2026-10-26T04:12Z (start time), #apollo11 (open a site).
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as MA from "./moon-astro.js";

const Codex = window.Codex || { reducedMotion: false, webgl: () => true, noGL() {}, fmt: (v) => String(v) };
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const Q = new URLSearchParams(location.search);
const STILL = Q.has("still"), LOW = Q.get("q") === "low";
const REDUCE = !!Codex.reducedMotion;
const HOUR = 3600e3, DAY = 86400e3, D2R = Math.PI / 180, R2D = 180 / Math.PI;
const phoneMQ = matchMedia("(max-width: 820px)");
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ------------------------------------------------------------- state --- */
const t0 = Q.get("t") ? Date.parse(Q.get("t")) : NaN;
const REAL_NOW = Math.round((isFinite(t0) ? t0 : Date.now()) / 60e3) * 60e3;
const S = {
  base: REAL_NOW, offH: 0, playing: false, speed: 6,
  mode: "earth", modeF: 0, hemi: "N", sel: null, filter: "all", country: "",
  showPins: true, names: false, earthshine: true, relief: true,
  calY: 0, calM: 0, tab: "now",
  ecl: { kind: "lunar", idx: -1, t: 0.35, playing: !STILL && !REDUCE },
  dirty: true
};
const simMs = () => S.base + S.offH * HOUR;
let DATA = null, SITES = [], FEATS = [];
let astro = null;                            // cached ephemeris for the current time

/* ------------------------------------------------------ small helpers --- */
const selVec = (lon, lat, out = new THREE.Vector3()) => {       // selenographic -> Moon local
  const c = Math.cos(lat * D2R);
  return out.set(c * Math.sin(lon * D2R), Math.sin(lat * D2R), c * Math.cos(lon * D2R));
};
const fmtDeg = (v, pos, neg, d = 2) => `${Math.abs(v).toFixed(d)}° ${v >= 0 ? pos : neg}`;
const tzShort = (() => { try { return new Intl.DateTimeFormat("en-GB", { timeZoneName: "short" }).formatToParts(new Date()).find(p => p.type === "timeZoneName").value; } catch (e) { return ""; } })();
const fmtDate = (ms, withTime = true, opts = {}) => new Date(ms).toLocaleString("en-GB", Object.assign({ day: "numeric", month: "short", year: "numeric" }, withTime ? { hour: "2-digit", minute: "2-digit" } : {}, opts));
const fmtUTC = ms => new Date(ms).toISOString().slice(11, 16) + " UTC";
function fmtSpan(ms) {
  const hrs = Math.round(Math.abs(ms) / HOUR), d = Math.floor(hrs / 24), h = hrs - d * 24;   // round once, so 26 d 23.6 h reads "27 d", not "26 d 24 h"
  if (d === 0 && h === 0) return "now";
  return (ms < 0 ? "−" : "+") + ((d ? d + " d " : "") + (h ? h + " h" : "")).trim();
}

/** The rotation taking Moon-local vectors to the world (sky) frame, from the libration
 *  (l, b), position angle P, observer hemisphere and the free-orbit blend f (0..1). */
const _m1 = new THREE.Matrix4(), _m2 = new THREE.Matrix4();
function moonRotation(lib, hemi, f, out = new THREE.Quaternion()) {
  const e = selVec(lib.l, lib.b);
  const n = new THREE.Vector3(0, 1, 0).addScaledVector(e, -e.y).normalize();   // pole projected on the disc
  const t = new THREE.Vector3().crossVectors(n, e);
  let P = lib.P + (hemi === "S" ? 180 : 0);
  P = P * (1 - f);                                                                // free orbit: north up
  const s = Math.sin(P * D2R), c = Math.cos(P * D2R);
  _m1.makeBasis(n, t, e);                                                         // local basis (columns)
  _m2.makeBasis(new THREE.Vector3(-s, c, 0), new THREE.Vector3(c, s, 0), new THREE.Vector3(0, 0, 1));
  return out.setFromRotationMatrix(_m2.multiply(_m1.transpose()));
}

function computeAstro(ms) {
  const jd = MA.julianDay(ms);
  const lib = MA.libration(jd), ph = MA.phase(jd);
  return { ms, jd, lib, ph, sunL: selVec(lib.sunLon, lib.sunLat), earthL: selVec(lib.l, lib.b) };
}

/* ------------------------------------------------------------ WebGL --- */
const stage = $("#stage");
if (!Codex.webgl()) { Codex.noGL(); $("#loading").classList.add("done"); throw new Error("no WebGL"); }
const renderer = new THREE.WebGLRenderer({ antialias: !LOW, powerPreference: "high-performance" });
let PR = Math.min(devicePixelRatio || 1, LOW ? 1 : 2);
renderer.setPixelRatio(PR);
renderer.setClearColor(0x010207, 1);
stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute("aria-label", stage.getAttribute("aria-label"));
renderer.domElement.tabIndex = 0;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 3000);
camera.position.set(0, 0, 5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = !REDUCE; controls.dampingFactor = 0.08;
controls.enablePan = false; controls.enableRotate = false;
controls.minDistance = 1.12; controls.maxDistance = 14; controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.8;

/* stars: a fixed random sky (not a catalogue) */
{
  const n = LOW ? 1500 : 3200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let rnd = 12345; const r = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
  const tints = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.9, 0.78], [0.75, 0.83, 1], [1, 0.84, 0.66]];
  for (let i = 0; i < n; i++) {
    const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z);
    pos.set([900 * s * Math.cos(a), 900 * s * Math.sin(a), 900 * z], i * 3);
    const b = Math.pow(r(), 5) * 0.9 + 0.08, t = tints[(r() * tints.length) | 0];
    col.set([b * t[0], b * t[1], b * t[2]], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.6 * PR, sizeAttenuation: false, vertexColors: true, depthWrite: false })));
}

/* the Moon */
const pivot = new THREE.Object3D(); scene.add(pivot);
const moonUniforms = {
  albedoMap: { value: null }, heightMap: { value: null },
  sunL: { value: new THREE.Vector3(0, 0, 1) }, earthL: { value: new THREE.Vector3(0, 0, 1) }, camL: { value: new THREE.Vector3(0, 0, 5) },
  hMin: { value: -5.7 }, hMax: { value: 8.3 }, relief: { value: 1.6 }, earthshine: { value: 0 }, exposure: { value: 0.95 }, fill: { value: 0 },
  detail: { value: 0 }, texSize: { value: new THREE.Vector2(2048, 1024) }
};
const moonMat = new THREE.ShaderMaterial({
  uniforms: moonUniforms,
  vertexShader: /* glsl */`
    varying vec3 vP;
    void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform sampler2D albedoMap, heightMap;
    uniform vec3 sunL, earthL, camL;
    uniform float hMin, hMax, relief, earthshine, exposure, detail, fill;
    uniform vec2 texSize;
    varying vec3 vP;
    const float PI = 3.141592653589793;
    const float R_KM = 1737.4;
    vec3 hash33(vec3 p) {
      p = vec3(dot(p, vec3(127.1, 311.7, 74.7)), dot(p, vec3(269.5, 183.3, 246.1)), dot(p, vec3(113.5, 271.9, 124.6)));
      return fract(sin(p) * 43758.5453123);
    }
    // Small illustrative craters for close-ups: bowl + raised rim around jittered 3-D cell points.
    // Returns the gradient of the height (in cell units) and a rim brightness term in w.
    vec4 craters(vec3 q) {
      vec3 i = floor(q), f = fract(q); vec3 g = vec3(0.0); float rim = 0.0;
      for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
        vec3 c = vec3(float(x), float(y), float(z));
        vec3 o = hash33(i + c);
        if (o.y < 0.45) continue;
        float r = 0.16 + 0.32 * o.x * o.x;
        vec3 d = c + o - f; float L = length(d) + 1e-5, s = L / r;
        float dh = s < 1.0 ? 1.4 * s : -0.5 * exp(-(s - 1.0) * 5.0);   // d(height)/d(s): bowl, then rim falloff
        g -= dh * (d / L) / r * (0.6 + 0.4 * o.z);
        rim += exp(-pow((s - 1.0) * 6.0, 2.0)) * o.z;
      }
      return vec4(g, rim);
    }
    void main() {
      vec3 p = normalize(vP);
      float lon = atan(p.x, p.z), lat = asin(clamp(p.y, -1.0, 1.0));
      vec2 uv = vec2(lon / (2.0 * PI) + 0.5, lat / PI + 0.5);
      vec2 dx = dFdx(uv), dy = dFdy(uv);
      dx.x -= floor(dx.x + 0.5); dy.x -= floor(dy.x + 0.5);              // no seam at lon 180
      float a = 1.12 * pow(textureGrad(albedoMap, uv, dx, dy).r, 2.6);     // photographic contrast
      // relief from the height map: finite differences at >= 1 texel (or the pixel footprint)
      vec2 ex = vec2(max(1.0 / texSize.x, abs(dx.x) + abs(dy.x)), 0.0);
      vec2 ey = vec2(0.0, max(1.0 / texSize.y, abs(dx.y) + abs(dy.y)));
      float range = hMax - hMin;
      float hE = textureGrad(heightMap, uv + ex, dx, dy).r, hW = textureGrad(heightMap, uv - ex, dx, dy).r;
      float hN = textureGrad(heightMap, uv + ey, dx, dy).r, hS = textureGrad(heightMap, uv - ey, dx, dy).r;
      float cl = max(cos(lat), 0.03);
      float sx = (hE - hW) * range / (2.0 * ex.x * 2.0 * PI * R_KM * cl);
      float sy = (hN - hS) * range / (2.0 * ey.y * PI * R_KM);
      vec3 east = normalize(vec3(cos(lon), 0.0, -sin(lon)));
      vec3 north = cross(p, east);
      vec3 n = normalize(p - relief * (sx * east + sy * north));
      if (detail > 0.001) {
        vec4 c1 = craters(p * 90.0), c2 = craters(p * 260.0 + 7.3);
        vec3 g = c1.xyz * 0.9 + c2.xyz * 0.35;
        g -= p * dot(g, p);
        n = normalize(n + detail * 0.06 * relief * g);
        a *= 1.0 + detail * (0.10 * c1.w + 0.06 * c2.w);
      }
      vec3 V = normalize(camL - p);
      float mu0 = dot(n, sunL), mu = max(dot(n, V), 0.0), mu0s = dot(p, sunL);
      float alpha = degrees(acos(clamp(dot(sunL, V), -1.0, 1.0)));
      // lunar-Lambert: L(alpha) from McEwen (1991); L = 1 is pure Lommel-Seeliger (flat full Moon)
      float Lw = clamp(1.0 - 0.019 * alpha + 2.42e-4 * alpha * alpha - 1.46e-6 * alpha * alpha * alpha, 0.0, 1.0);
      float ls = mu0 > 0.0 ? 2.0 * mu0 / (mu0 + mu + 1e-4) : 0.0;
      float I = a * (Lw * ls + (1.0 - Lw) * max(mu0, 0.0) * 1.6);
      I *= smoothstep(-0.025, 0.02, mu0s + 0.35 * (mu0 - mu0s));
      I *= 1.0 + 0.25 * exp(-alpha / 5.0);                                  // opposition surge
      float mare = smoothstep(0.4, 0.15, a);
      vec3 tint = mix(vec3(1.0, 0.972, 0.935), vec3(0.93, 0.955, 1.02), mare);
      // Earthshine: sunlight reflected by the Earth; its phase seen from the Moon is 1 - k.
      float es = earthshine * a * max(dot(n, earthL), 0.0) * (1.0 - smoothstep(-0.08, 0.06, mu0s));
      // photographers expose crescents longer: lift the exposure as the phase angle grows
      float expo = exposure * (1.0 + 1.3 * smoothstep(50.0, 165.0, alpha));
      vec3 col = I * expo * tint + es * vec3(0.62, 0.72, 1.0) + fill * a * (0.35 + 0.65 * max(dot(n, V), 0.0)) * vec3(0.55, 0.62, 0.8);
      gl_FragColor = vec4(pow(max(col, 0.0), vec3(1.0 / 2.2)), 1.0);
    }`
});
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(1, LOW ? 96 : 224, LOW ? 48 : 112), moonMat);
pivot.add(moonMesh);

/* free-orbit extras: the Earth (not to scale in distance) and a Sun glow */
const extras = new THREE.Group(); extras.visible = false; scene.add(extras);
const sunLight = new THREE.DirectionalLight(0xffffff, 2.2); extras.add(sunLight);
extras.add(new THREE.AmbientLight(0x223355, 0.25));
const earthMat = new THREE.MeshStandardMaterial({ color: 0x3a6ea8, roughness: 0.85, metalness: 0 });
const earth = new THREE.Mesh(new THREE.SphereGeometry(3.67, 64, 32), earthMat);   // radius ratio 6371 / 1737.4
earth.position.set(0, 0, 60); extras.add(earth);
let earthTexLoaded = false;
function loadEarthTexture() {
  if (earthTexLoaded) return; earthTexLoaded = true;
  new THREE.TextureLoader().load("assets/img/earth/earth-albedo.jpg", t => {
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; earthMat.map = t; earthMat.color.set(0xffffff); earthMat.needsUpdate = true;
  }, undefined, () => {});
}
const sunSprite = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, "rgba(255,255,245,1)"); gr.addColorStop(0.12, "rgba(255,244,214,.95)"); gr.addColorStop(0.35, "rgba(255,200,120,.25)"); gr.addColorStop(1, "rgba(255,160,80,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), blending: THREE.AdditiveBlending, depthWrite: false }));
  s.scale.setScalar(60); return s;
})();
extras.add(sunSprite);

/* ----------------------------------------------------- textures load --- */
const texLoader = new THREE.TextureLoader();
function loadTex(url, srgb) {
  return new Promise((res, rej) => texLoader.load(url, t => {
    t.colorSpace = THREE.NoColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy()); t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter; res(t);
  }, undefined, rej));
}
let albedoPixels = null;          // 512 x 256 grey levels for the drawn calendar Moons
function readAlbedoPixels(img) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 256;
  const g = c.getContext("2d"); g.drawImage(img, 0, 0, 512, 256);
  const d = g.getImageData(0, 0, 512, 256).data, out = new Float32Array(512 * 256);
  for (let i = 0; i < out.length; i++) out[i] = 1.12 * Math.pow(d[i * 4] / 255, 2.6);
  albedoPixels = out;
}

/* --------------------------------------------------------- viewport --- */
const V = { W: 1, H: 1, cx: 0, cy: 0, rPx: 100, earthDist: 5, offX: 0, offY: 0 };
function layout() {
  const W = innerWidth, H = innerHeight;
  V.W = W; V.H = H;
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  // The free area for the Moon: between the title and the panel on desktop; between the
  // title/time bar and the bottom sheet on phones.
  const nav = 60, tb = $("#title").getBoundingClientRect(), pb = $("#panel").getBoundingClientRect(), bb = $("#timebar").getBoundingClientRect();
  let x0, x1, y0, y1;
  if (phoneMQ.matches) {
    x0 = 0; x1 = W; y0 = tb.bottom + 4; y1 = Math.min(bb.top, pb.top) - 4;
    const card = $("#card"); if (!card.hidden) y1 = Math.min(y1, card.getBoundingClientRect().top - 4);
  }
  else {
    x1 = pb.left - 8; y1 = bb.top - 8;
    if (x1 - (tb.right + 8) >= 440) { x0 = tb.right + 8; y0 = nav; }      // room beside the title
    else { x0 = 0; y0 = tb.bottom + 4; }                                   // otherwise below it
  }
  if (x1 - x0 < 200) { x0 = 0; x1 = W; }
  if (y1 - y0 < 160) { y0 = nav; y1 = H; }
  document.body.style.setProperty("--mn-title-b", Math.round(tb.bottom) + "px");
  V.cx = (x0 + x1) / 2; V.cy = (y0 + y1) / 2;
  const want = Math.max(70, Math.min(x1 - x0, y1 - y0) * (phoneMQ.matches ? 0.44 : 0.42));
  V.offX = W / 2 - V.cx; V.offY = H / 2 - V.cy;
  camera.setViewOffset(W, H, V.offX, V.offY, W, H);
  // distance so the Moon's radius covers `want` pixels: sin(ang) = 1/d, tan(ang) = want / (H/2) tan(fov/2)
  const ang = Math.atan(want / (H / 2) * Math.tan(camera.fov / 2 * D2R));
  V.earthDist = 1 / Math.sin(ang);
  camera.updateProjectionMatrix();
  if (S.mode === "earth" && !fly) camera.position.set(0, 0, V.earthDist);
  controls.maxDistance = Math.max(14, V.earthDist * 2.5);
}

/* ------------------------------------------------------------ modes --- */
let fly = null;                        // camera flight { from, dist0, dist1, t, dur, target: fn }
function setMode(m, opts = {}) {
  S.mode = m;
  $$("#mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.mode === m)));
  document.body.classList.toggle("mn-free", m === "free");
  controls.enableRotate = m === "free";
  if (m === "free") { loadEarthTexture(); }
  if (m === "earth" && !opts.keepCamera) flyTo(() => new THREE.Vector3(0, 0, 1), V.earthDist, 1.4);
  S.dirty = true;
}
function flyTo(dirFn, dist, dur = 2.2) {
  const from = camera.position.clone();
  fly = { from: from.clone().normalize(), dist0: from.length(), dist1: dist, t: 0, dur: REDUCE ? 0.01 : dur, dirFn };
}
function stepFly(dt) {
  if (!fly) return;
  fly.t = Math.min(1, fly.t + dt / fly.dur);
  const k = ease(fly.t), to = fly.dirFn().normalize();
  // great-circle interpolation of the viewing direction, eased distance with a gentle lift midway
  const ang = fly.from.angleTo(to);
  let dir;
  if (ang < 1e-4) dir = to.clone();
  else {
    const axis = new THREE.Vector3().crossVectors(fly.from, to);
    if (axis.lengthSq() < 1e-10) axis.set(0, 1, 0);
    dir = fly.from.clone().applyAxisAngle(axis.normalize(), ang * k);
  }
  const lift = Math.sin(Math.PI * k) * Math.min(1.2, ang * 0.9);
  const d = fly.dist0 + (fly.dist1 - fly.dist0) * k + lift;
  camera.position.copy(dir.multiplyScalar(d));
  camera.lookAt(0, 0, 0);
  if (fly.t >= 1) fly = null;
}

/* ------------------------------------------------------------ update --- */
const qMoon = new THREE.Quaternion(), qInv = new THREE.Quaternion();
function update() {
  const ms = simMs();
  if (!astro || astro.ms !== ms) { astro = computeAstro(ms); S.dirty = true; }
  if (!S.dirty) return;
  S.dirty = false;
  moonRotation(astro.lib, S.hemi, S.modeF, qMoon);
  pivot.quaternion.copy(qMoon);
  moonUniforms.sunL.value.copy(astro.sunL);
  moonUniforms.earthL.value.copy(astro.earthL);
  // Earthshine: proportional to the Earth's illuminated fraction seen from the Moon, brightened
  // strongly for visibility: real earthshine is thousands of times fainter than the sunlit crescent.
  moonUniforms.earthshine.value = S.earthshine ? 0.03 * Math.pow(astro.ph.earthIllumFromMoon, 1.5) : 0;
  moonUniforms.relief.value = S.relief ? 1.6 : 0;
  moonUniforms.fill.value = 0.05 * S.modeF;                        // free orbit: faint fill so the night side reads
  // free-orbit extras in the world frame
  const sunW = astro.sunL.clone().applyQuaternion(qMoon);
  sunLight.position.copy(sunW).multiplyScalar(100);
  sunSprite.position.copy(sunW).multiplyScalar(800);
  // Earth turned so the sub-lunar meridian faces the Moon: lon = RA(Moon) - GMST ([M] eq. 12.4)
  const T = (astro.jd - 2451545) / 36525;
  const gmst = MA.wrap360(280.46061837 + 360.98564736629 * (astro.jd - 2451545) + 0.000387933 * T * T);
  const subLon = MA.wrap180(astro.lib.ra - gmst);
  earth.rotation.set(0, Math.PI / 2 - subLon * D2R + (S.hemi === "S" ? Math.PI : 0), 0);
  updateReadouts();
}

/* ------------------------------------------------------- the overlay --- */
const pinsEl = $("#pins"), featsEl = $("#feats"), compass = $("#compass");
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _c = new THREE.Vector3();
function project(local, out) {
  _v.copy(local).applyQuaternion(pivot.quaternion);
  _n.copy(_v);                                             // surface normal = position on the unit sphere
  _c.copy(camera.position).sub(_v).normalize();
  const facing = _n.dot(_c);
  _v.project(camera);
  out.x = (_v.x + 1) / 2 * V.W; out.y = (1 - _v.y) / 2 * V.H; out.facing = facing;
  return out;
}
const P2 = { x: 0, y: 0, facing: 0 };
function updateOverlay() {
  const showPins = S.showPins;
  for (const s of SITES) {
    const el = s.el; if (!el) continue;
    const ok = showPins && s.match;
    if (!ok) { if (!el.classList.contains("hide")) el.classList.add("hide"); continue; }
    project(s.local, P2);
    const vis = P2.facing > 0.02;
    el.classList.toggle("hide", !vis);
    if (vis) {
      el.style.transform = `translate(${P2.x.toFixed(1)}px, ${P2.y.toFixed(1)}px)`;
      el.style.opacity = String(clamp(P2.facing * 6, 0.25, 1));
    }
  }
  if (S.names) {
    for (const f of FEATS) {
      project(f.local, P2);
      const vis = P2.facing > 0.2;
      f.el.style.opacity = vis ? String(clamp((P2.facing - 0.2) * 3, 0, 0.95)) : "0";
      if (vis) f.el.style.transform = `translate(${P2.x.toFixed(1)}px, ${P2.y.toFixed(1)}px) translate(-50%, -50%)`;
    }
  }
  // compass (Earth view): celestial N/E/S/W around the disc and the lunar north pole tick
  if (S.mode === "earth") {
    const c = new THREE.Vector3(0, 0, 0).project(camera);
    const cx = (c.x + 1) / 2 * V.W, cy = (1 - c.y) / 2 * V.H;
    const e = new THREE.Vector3(1, 0, 0).project(camera);
    const rPx = Math.abs((e.x + 1) / 2 * V.W - cx);
    V.rPx = rPx;
    const k = S.hemi === "S" ? -1 : 1, rr = rPx + (phoneMQ.matches ? 13 : 22);
    const put = (name, x, y) => { const el = compass.querySelector(`[data-c="${name}"]`); el.style.left = clamp(x, 10, V.W - 10) + "px"; el.style.top = y + "px"; };
    put("N", cx, cy - k * rr); put("S", cx, cy + k * rr); put("E", cx - k * rr, cy); put("W", cx + k * rr, cy);
    project(new THREE.Vector3(0, 1, 0), P2);
    const ax = $("#axisTick"), dxp = P2.x - cx, dyp = P2.y - cy, L = Math.hypot(dxp, dyp) || 1;
    ax.style.left = (cx + dxp / L * (rPx + 9)) + "px"; ax.style.top = (cy + dyp / L * (rPx + 9)) + "px";
    ax.style.transform = `rotate(${Math.atan2(dxp, -dyp) * R2D}deg)`;
    ax.title = "Lunar north pole";
  }
  const zoomed = camera.position.length() < 2.3;
  document.body.classList.toggle("mn-zoomed", zoomed);
  moonUniforms.detail.value = LOW ? 0 : clamp((2.6 - camera.position.length()) / 1.0, 0, 1);
}

/* --------------------------------------------------------- readouts --- */
function drawDisc(canvas, lib, ph, opts = {}) {
  // Orthographic drawing of the Moon as seen from Earth (north up) from the albedo map,
  // lit with the same lunar-Lambert photometry as the 3-D view.
  const size = canvas.width, g = canvas.getContext("2d");
  const img = g.createImageData(size, size), d = img.data;
  const q = moonRotation(lib, opts.hemi || S.hemi, 0, new THREE.Quaternion()).invert();
  const sun = selVec(lib.sunLon, lib.sunLat);
  const v = new THREE.Vector3(), r = size / 2 - 0.5, es = opts.earthshine != null ? opts.earthshine : 0.06 * (1 - ph.illum);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const X = (x + 0.5 - size / 2) / r, Y = -(y + 0.5 - size / 2) / r, rr = X * X + Y * Y;
    const i = (y * size + x) * 4;
    if (rr > 1) { d[i + 3] = 0; continue; }
    const Z = Math.sqrt(1 - rr);
    v.set(X, Y, Z).applyQuaternion(q);                    // world -> Moon local
    let a = 0.55;
    if (albedoPixels) {
      const lon = Math.atan2(v.x, v.z), lat = Math.asin(clamp(v.y, -1, 1));
      const u = Math.min(511, Math.floor((lon / (2 * Math.PI) + 0.5) * 512)), w = Math.min(255, Math.floor((0.5 - lat / Math.PI) * 256));
      a = albedoPixels[w * 512 + u];
    }
    const mu0 = v.x * sun.x + v.y * sun.y + v.z * sun.z, mu = Z;
    let I = mu0 > 0 ? a * 2 * mu0 / (mu0 + mu) : 0;
    I *= clamp((mu0 + 0.02) / 0.04, 0, 1);
    const e = mu0 < 0.05 ? es * a * Z : 0;
    const edge = clamp((1 - Math.sqrt(rr)) * r * 1.2, 0, 1);    // anti-aliased rim
    d[i] = 255 * Math.pow(Math.min(1, I * 1.05 + e * 0.8), 1 / 2.2);
    d[i + 1] = 255 * Math.pow(Math.min(1, I * 1.03 + e * 0.95), 1 / 2.2);
    d[i + 2] = 255 * Math.pow(Math.min(1, I * 1.0 + e * 1.3), 1 / 2.2);
    d[i + 3] = 255 * edge;
  }
  g.putImageData(img, 0, 0);
}

let lastReadKey = "";
function updateReadouts() {
  const { lib, ph, ms } = astro;
  $("#nowName").textContent = ph.name;
  $("#nowSub").textContent = `${(ph.illum * 100).toFixed(1)}% lit · ${ph.ageDays.toFixed(1)} d old · ${(ph.distKm / 1000).toFixed(1)}k km`;
  $("#rIllum").innerHTML = `${(ph.illum * 100).toFixed(1)}<small>%</small>`;
  $("#rAge").innerHTML = `${ph.ageDays.toFixed(1)}<small>days</small>`;
  $("#rDist").innerHTML = `${Math.round(ph.distKm).toLocaleString("en-US")}<small>km</small>`;
  $("#rSize").innerHTML = `${(ph.diamArcmin).toFixed(1)}<small>arcmin</small>`;
  $("#rLibL").innerHTML = `${lib.l >= 0 ? "+" : "−"}${Math.abs(lib.l).toFixed(2)}<small>°</small>`;
  $("#rLibB").innerHTML = `${lib.b >= 0 ? "+" : "−"}${Math.abs(lib.b).toFixed(2)}<small>°</small>`;
  $("#rP").innerHTML = `${MA.wrap360(lib.P).toFixed(1)}<small>°</small>`;
  $("#rColong").innerHTML = `${lib.colongitude.toFixed(1)}<small>°</small>`;
  const lw = Math.abs(lib.l) < 1 ? "Face-on in longitude" : lib.l > 0 ? `East limb (Mare Crisium side) turned ${Math.abs(lib.l).toFixed(1)}° toward us` : `West limb (Grimaldi side) turned ${Math.abs(lib.l).toFixed(1)}° toward us`;
  const bw = Math.abs(lib.b) < 1 ? "the poles face-on." : lib.b > 0 ? `north pole tipped ${lib.b.toFixed(1)}° toward us.` : `south pole tipped ${(-lib.b).toFixed(1)}° toward us.`;
  $("#libHint").textContent = `${lw}; ${bw}`;
  // time bar
  $("#dateOut").textContent = phoneMQ.matches ? fmtDate(ms, true, { year: undefined }) : fmtDate(ms) + (tzShort ? " " + tzShort : "");
  const off = ms - Date.now();
  const o = $("#offsetOut");
  o.textContent = Math.abs(off) < 5 * 60e3 ? "live · now" : fmtSpan(off) + (off > 0 ? " ahead of now" : " before now");
  o.classList.toggle("live", Math.abs(off) < 5 * 60e3);
  const sl = $("#timeSlider"); sl.value = String(Math.round(S.offH));
  sl.style.setProperty("--fill", ((+sl.value - +sl.min) / (+sl.max - +sl.min) * 100) + "%");
  // title disc: redraw at most every 2 simulated hours
  const key = Math.round(ms / (2 * HOUR)) + S.hemi;
  if (key !== lastReadKey && albedoPixels) { lastReadKey = key; drawDisc($("#nowDisc"), lib, ph); }
  // calendar follows the simulated month
  const d = new Date(ms);
  if (d.getFullYear() !== S.calY || d.getMonth() !== S.calM) { S.calY = d.getFullYear(); S.calM = d.getMonth(); buildCalendar(); }
  else markCalendar();
  updateNextPhases();
  if (S.sel) updateCardNow();
}

/* --------------------------------------------------------- calendar --- */
let calCells = [];
function buildCalendar() {
  const cal = $("#cal"); cal.innerHTML = ""; calCells = [];
  const y = S.calY, m = S.calM, first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate();
  $("#calTitle").textContent = first.toLocaleString("en-GB", { month: "long", year: "numeric" });
  const pad = (first.getDay() + 6) % 7;
  for (let i = 0; i < pad; i++) { const s = document.createElement("span"); s.className = "pad"; cal.appendChild(s); }
  const jd0 = MA.julianDay(first.getTime()), jd1 = MA.julianDay(new Date(y, m + 1, 1).getTime());
  const quarters = MA.phaseTimes(jd0, jd1);
  for (let day = 1; day <= days; day++) {
    const t = new Date(y, m, day).getTime();
    const b = document.createElement("button"); b.type = "button";
    const c = document.createElement("canvas"); c.width = c.height = 44;
    const jd = MA.julianDay(t), lib = MA.libration(jd), ph = MA.phase(jd);
    if (albedoPixels) drawDisc(c, lib, ph, { earthshine: 0.02 });
    b.appendChild(c); b.appendChild(document.createTextNode(String(day)));
    const qd = quarters.find(p => new Date(MA.jdToMs(p.jd)).getDate() === day && new Date(MA.jdToMs(p.jd)).getMonth() === m);
    let label = `${first.toLocaleString("en-GB", { month: "long" })} ${day}: ${(ph.illum * 100).toFixed(0)}% illuminated, ${ph.name.toLowerCase()}`;
    if (qd) { const q = document.createElement("i"); q.className = "q"; b.appendChild(q); label += `. ${MA.PHASE_NAMES[qd.type]} at ${new Date(MA.jdToMs(qd.jd)).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`; }
    b.title = label; b.setAttribute("aria-label", label);
    b.addEventListener("click", () => setTime(qd ? MA.jdToMs(qd.jd) : t + 21 * HOUR));
    cal.appendChild(b); calCells.push({ b, t });
  }
  markCalendar();
}
function markCalendar() {
  const ms = simMs(), today = new Date(Date.now());
  for (const c of calCells) {
    const d = new Date(c.t);
    c.b.classList.toggle("cur", ms >= c.t && ms < c.t + DAY);
    c.b.classList.toggle("today", d.toDateString() === today.toDateString());
  }
}
let nextKey = "";
function updateNextPhases() {
  const jd = MA.julianDay(simMs()), key = Math.floor(jd * 4);
  if (key === nextKey) return; nextKey = key;
  const list = MA.phaseTimes(jd, jd + 31).slice(0, 4), ol = $("#nextPhases"); ol.innerHTML = "";
  for (const p of list) {
    const ms = MA.jdToMs(p.jd), li = document.createElement("li"); li.tabIndex = 0;
    const c = document.createElement("canvas"); c.width = c.height = 52;
    if (albedoPixels) drawDisc(c, MA.libration(p.jd), MA.phase(p.jd), { earthshine: 0.02 });
    li.appendChild(c);
    const tx = document.createElement("div");
    tx.innerHTML = `<b>${MA.PHASE_NAMES[p.type]}</b><span>${fmtDate(ms)} ${esc(tzShort)}</span>`;
    li.appendChild(tx);
    const em = document.createElement("em"); em.textContent = "in " + fmtSpan(ms - simMs()).replace("+", ""); li.appendChild(em);
    const go = () => setTime(ms);
    li.addEventListener("click", go); li.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    ol.appendChild(li);
  }
}

/* ------------------------------------------------------------- time --- */
function setTime(ms) {
  if (Math.abs(ms - REAL_NOW) <= 30 * DAY) { S.base = REAL_NOW; S.offH = (ms - REAL_NOW) / HOUR; }
  else { S.base = ms; S.offH = 0; }
  S.dirty = true;
}
function setPlaying(on) {
  S.playing = on;
  const b = $("#playBtn"); b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "Pause" : "Play time");
  b.innerHTML = on ? '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9-5.5z" fill="currentColor"/></svg>';
}

/* ------------------------------------------------------------ sites --- */
const KIND_LABEL = { crewed: "Crewed landing", lander: "Robotic lander", rover: "Lander + rover", sample: "Sample return", impact: "Impact", crash: "Crash (failed landing)", planned: "Planned" };
function siteMatches(s) {
  const f = S.filter, t = s.tags;
  let ok = f === "all" ? true
    : f === "robotic" ? t.includes("robotic")
    : f === "impact" ? t.includes("impact")
    : t.includes(f);
  if (S.country && s.country !== S.country) ok = false;
  return ok;
}
function buildSites() {
  pinsEl.innerHTML = "";
  for (const s of SITES) {
    s.local = selVec(s.lon, s.lat);
    s.farside = Math.abs(s.lon) > 90;
    if (s.farside && !s.tags.includes("farside")) s.tags.push("farside");
    const b = document.createElement("button");
    b.className = `mn-pin k-${s.kind}` + (s.tags.includes("llr") ? " llr" : "");
    b.type = "button";
    b.setAttribute("aria-label", `${s.name}, ${KIND_LABEL[s.kind]}, ${s.date === "planned" ? "planned" : s.date.slice(0, 4)}`);
    b.innerHTML = `<span class="lbl">${esc(s.name)}<small>${s.date === "planned" ? "planned" : s.date.slice(0, 4)}</small></span>` + (s.tags.includes("lrv") ? '<span class="lrv" title="Lunar Roving Vehicle">LRV</span>' : "");
    b.addEventListener("click", e => { e.stopPropagation(); select(s.id, { fly: false }); });
    pinsEl.appendChild(b); s.el = b;
  }
  const countries = [...new Set(SITES.map(s => s.country))].sort();
  const sel = $("#country");
  for (const c of countries) { const o = document.createElement("option"); o.value = c; o.textContent = c === "USSR" ? "Soviet Union (USSR)" : c; sel.appendChild(o); }
  applyFilter();
}
function applyFilter() {
  const ol = $("#siteList"); ol.innerHTML = "";
  let n = 0;
  const sorted = SITES.slice().sort((a, b) => (a.date === "planned" ? "9999" : a.date).localeCompare(b.date === "planned" ? "9999" : b.date));
  for (const s of sorted) {
    s.match = siteMatches(s);
    if (!s.match) continue; n++;
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button"; if (S.sel === s.id) b.classList.add("sel");
    b.innerHTML = `<i class="dot k-${s.kind}"></i><span><span class="nm">${esc(s.name)}${s.approx ? " ≈" : ""}</span><span class="sb">${esc(s.agency.split(" (")[0])} · ${esc(s.site || fmtDeg(s.lat, "N", "S", 1) + " " + fmtDeg(s.lon, "E", "W", 1))}</span></span><span class="yr">${s.date === "planned" ? "—" : s.date.slice(0, 4)}</span>`;
    b.addEventListener("click", () => select(s.id, { fly: true }));
    b.dataset.id = s.id;
    li.appendChild(b); ol.appendChild(li);
  }
  $("#siteCount").textContent = `${n} of ${SITES.length} sites`;
  document.body.classList.toggle("mn-llr", S.filter === "llr");
}
function chip(text, cls) { return `<span class="chip ${cls || ""}">${esc(text)}</span>`; }
function select(id, opts = {}) {
  const s = SITES.find(x => x.id === id);
  S.sel = s ? s.id : null;
  SITES.forEach(x => x.el && x.el.classList.toggle("sel", x.id === S.sel));
  $$("#siteList button").forEach(b => b.classList.toggle("sel", b.dataset.id === S.sel));
  const card = $("#card");
  if (!s) { card.hidden = true; if (phoneMQ.matches) layout(); return; }
  card.hidden = false; card.classList.toggle("planned", s.kind === "planned");
  if (phoneMQ.matches) {                         // phones: fold the sheet away so the Moon and the card share the screen
    const p = $("#panel"); if (!p.classList.contains("collapsed")) p.querySelector(".hud-collapse").click();
    setTimeout(layout, 30);
  }
  $("#cardEyebrow").textContent = `${KIND_LABEL[s.kind]} · ${s.country === "USSR" ? "Soviet Union" : s.country}`;
  $("#cardName").textContent = s.name;
  const chips = [];
  if (s.tags.includes("crewed")) chips.push(chip(s.kind === "planned" ? "Crewed · planned" : "Crewed", "sol"));
  if (s.tags.includes("robotic")) chips.push(chip("Robotic", "ice"));
  if (s.tags.includes("sample")) chips.push(chip("Sample return", "aurora"));
  if (s.tags.includes("rover")) chips.push(chip("Rover", "ice"));
  if (s.tags.includes("lrv")) chips.push(chip("Lunar Roving Vehicle", "sol"));
  if (s.tags.includes("farside")) chips.push(chip("Far side", "nebula"));
  if (s.tags.includes("impact")) chips.push(chip(s.kind === "crash" ? "Crash site" : "Impact", "flame"));
  if (s.tags.includes("llr")) chips.push(chip("Laser retroreflector", "aurora"));
  $("#cardChips").innerHTML = chips.join("");
  const rows = [["Agency", s.agency], ["Date", s.date === "planned" ? "Planned (not yet flown)" : new Date(s.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) + (s.time ? " · " + s.time : "")]];
  if (s.site) rows.push(["Where", s.site]);
  if (s.crew) rows.push(["Crew", s.crew]);
  rows.push(["Coordinates", `${s.approx ? "≈ " : ""}${fmtDeg(s.lat, "N", "S", s.approx ? 1 : 3)}, ${fmtDeg(s.lon, "E", "W", s.approx ? 1 : 3)}`]);
  if (s.rover) rows.push([s.rover.name, `Drove ≈${s.rover.km} km; ended at ${fmtDeg(s.rover.lat, "N", "S", 2)}, ${fmtDeg(s.rover.lon, "E", "W", 2)}`]);
  $("#cardDl").innerHTML = rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("");
  $("#cardText").textContent = s.summary;
  const link = $("#cardLink"); link.href = s.link; link.textContent = /wikipedia/.test(s.link) ? "Wikipedia ↗" : "NASA ↗";
  updateCardNow();
  if (opts.fly) flyToSite(s);
  if (location.hash.slice(1) !== s.id && !opts.noHash) history.replaceState(null, "", "#" + s.id);
}
function updateCardNow() {
  const s = SITES.find(x => x.id === S.sel); if (!s || !astro) return;
  const v = s.local;
  const sunAlt = 90 - v.angleTo(astro.sunL) * R2D, earthAlt = 90 - v.angleTo(astro.earthL) * R2D;
  const sunTxt = sunAlt > 0 ? `Sun <b>${sunAlt.toFixed(0)}°</b> up (lunar day)` : `Sun ${(-sunAlt).toFixed(0)}° below the horizon (lunar night)`;
  const earthTxt = earthAlt > 0 ? `Earth ${earthAlt.toFixed(0)}° up` : "Earth below the horizon";
  $("#cardNow").innerHTML = `At this date: ${sunTxt} · ${earthTxt}`;
}
function flyToSite(s) {
  if (S.mode !== "free") setMode("free", { keepCamera: true });
  flyTo(() => s.local.clone().applyQuaternion(pivot.quaternion), 2.05, 2.4);
}

/* --------------------------------------------------------- features --- */
function buildFeatures() {
  featsEl.innerHTML = "";
  FEATS = DATA.features.map(f => {
    const el = document.createElement("span"); el.className = "mn-feat " + f.t; el.textContent = f.n;
    featsEl.appendChild(el);
    return { ...f, el, local: selVec(f.lon, f.lat) };
  });
  featsEl.hidden = !S.names;
}

/* ---------------------------------------------------------- eclipses --- */
const ECL = { lunar: [], solar: [] };
function buildEclipses() {
  const now = Date.now();
  ECL.lunar = DATA.lunarEclipses.map(e => ({ ...e, calc: MA.lunarEclipse(MA.julianDay(Date.parse(e.date + "T12:00:00Z"))), past: Date.parse(e.date) + DAY < now }));
  ECL.solar = DATA.solarEclipses.map(e => ({ ...e, calc: MA.solarEclipse(MA.julianDay(Date.parse(e.date + "T12:00:00Z"))), past: Date.parse(e.date) + DAY < now }));
  renderEclList();
}
function renderEclList() {
  const k = S.ecl.kind, list = ECL[k], ol = $("#eclList"); ol.innerHTML = "";
  if (S.ecl.idx < 0 || S.ecl.idx >= list.length) S.ecl.idx = Math.max(0, list.findIndex(e => !e.past));
  list.forEach((e, i) => {
    const li = document.createElement("li"), b = document.createElement("button"); b.type = "button";
    if (i === S.ecl.idx) b.classList.add("sel"); if (e.past) b.classList.add("past");
    const d = new Date(e.date + "T12:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    const dur = k === "lunar" ? `totality ${e.totMin} min` : `max ${e.dur.replace("m", " min ").replace("s", " s")}`;
    b.innerHTML = `<span class="d">${d}</span><span class="t ${e.type}">${e.type}${e.past ? " · past" : ""}</span><span class="dur">${dur}</span><span class="w">${esc(e.where)}</span>`;
    b.setAttribute("aria-label", `${e.type} ${k} eclipse, ${d}, ${dur}. Visible from ${e.where}`);
    b.addEventListener("click", () => { S.ecl.idx = i; S.ecl.t = 0; renderEclList(); drawEclipse(); });
    li.appendChild(b); ol.appendChild(li);
  });
  $("#eclSrc").textContent = k === "lunar"
    ? "Dates, totality and visibility: NASA Goddard Space Flight Center (GSFC) eclipse website, Lunar Eclipses 2021–2030 (F. Espenak). The diagram's geometry and contact times are computed here from the Meeus lunar theory with Danjon's shadow radii, and agree with NASA to about a minute."
    : "Dates, type, maximum duration and paths: NASA GSFC eclipse website, Solar Eclipses 2021–2040 (F. Espenak). Gamma is how far the shadow axis passes from Earth's centre, in Earth radii (north positive).";
}
const eclCanvas = $("#eclCanvas"), eg = eclCanvas.getContext("2d", { willReadFrequently: true });
const fullDisc = document.createElement("canvas"); fullDisc.width = fullDisc.height = 96;
let fullDiscReady = false;
let U = 1;                                                   // canvas px per CSS px at 320 px wide
const F = (px, w = 500) => `${w} ${Math.round(px * U)}px 'JetBrains Mono', monospace`;
function drawEclipse() {
  const cssW = eclCanvas.clientWidth || 300, dpr = Math.min(devicePixelRatio || 1, 2);
  if (eclCanvas.width !== Math.round(cssW * dpr)) { eclCanvas.width = Math.round(cssW * dpr); eclCanvas.height = Math.round(cssW * dpr * 0.6); }
  const W = eclCanvas.width, H = eclCanvas.height;
  U = W / 320;
  eg.setTransform(1, 0, 0, 1, 0, 0);
  eg.clearRect(0, 0, W, H);
  const k = S.ecl.kind, e = ECL[k][S.ecl.idx]; if (!e) return;
  // background stars
  eg.fillStyle = "#02030a"; eg.fillRect(0, 0, W, H);
  if (k === "lunar") drawLunar(e); else drawSolar(e);
  $("#eclT").value = String(Math.round(S.ecl.t * 1000));
}
function drawLunar(e) {
  const W = eclCanvas.width, H = eclCanvas.height, c = e.calc;
  const t0 = c.P1 - 12 / 1440, t1 = c.P4 + 12 / 1440, t = t0 + (t1 - t0) * S.ecl.t;
  const g0 = MA.shadowGeometry(c.jdMax);
  const sc = Math.min(W / 3.7, H / 2.25);                    // px per degree
  const cx = W / 2, cy = H / 2 - 6;
  const X = x => cx - x * sc, Y = y => cy - y * sc;          // east to the left, north up
  // penumbra and umbra (radii at greatest eclipse)
  let gr = eg.createRadialGradient(cx, cy, g0.umbra * sc, cx, cy, g0.penumbra * sc);
  gr.addColorStop(0, "rgba(120,130,170,.34)"); gr.addColorStop(1, "rgba(120,130,170,.04)");
  eg.fillStyle = gr; eg.beginPath(); eg.arc(cx, cy, g0.penumbra * sc, 0, 7); eg.fill();
  eg.strokeStyle = "rgba(160,170,220,.35)"; eg.setLineDash([3 * U, 4 * U]); eg.lineWidth = U; eg.stroke(); eg.setLineDash([]);
  gr = eg.createRadialGradient(cx, cy, 0, cx, cy, g0.umbra * sc);
  gr.addColorStop(0, "rgba(70,14,6,.95)"); gr.addColorStop(0.8, "rgba(96,26,10,.9)"); gr.addColorStop(1, "rgba(140,50,20,.85)");
  eg.fillStyle = gr; eg.beginPath(); eg.arc(cx, cy, g0.umbra * sc, 0, 7); eg.fill();
  eg.strokeStyle = "rgba(255,122,61,.55)"; eg.lineWidth = 1.2 * U; eg.stroke();
  eg.font = F(9, 600); eg.fillStyle = "rgba(195,202,230,.75)"; eg.textAlign = "center";
  eg.fillText("PENUMBRA", cx, cy - g0.penumbra * sc + 12 * U); eg.fillStyle = "rgba(255,160,110,.9)"; eg.fillText("UMBRA", cx, cy - g0.umbra * sc + 12 * U);
  // the Moon's path, from the ephemeris
  eg.beginPath();
  for (let i = 0; i <= 60; i++) { const q = MA.shadowGeometry(t0 + (t1 - t0) * i / 60); i ? eg.lineTo(X(q.x), Y(q.y)) : eg.moveTo(X(q.x), Y(q.y)); }
  eg.strokeStyle = "rgba(124,200,255,.5)"; eg.setLineDash([2 * U, 5 * U]); eg.lineWidth = 1.2 * U; eg.stroke(); eg.setLineDash([]);
  // contact ticks
  const contacts = [["P1", c.P1], ["U1", c.U1], ["U2", c.U2], ["U3", c.U3], ["U4", c.U4], ["P4", c.P4]];
  eg.font = F(9); eg.fillStyle = "rgba(143,152,189,.9)";
  for (const [n, tj] of contacts) if (tj) { const q = MA.shadowGeometry(tj); eg.fillText(n, X(q.x), Y(q.y) + (q.y > 0 ? -q.moonR * sc - 4 * U : q.moonR * sc + 9 * U)); }
  // the Moon now: shade each pixel by where it sits in the shadow
  const q = MA.shadowGeometry(t), mx = X(q.x), my = Y(q.y), mr = q.moonR * sc;
  const img = eg.getImageData(Math.floor(mx - mr - 2), Math.floor(my - mr - 2), Math.ceil(2 * mr + 4), Math.ceil(2 * mr + 4));
  const d = img.data, w = img.width, h = img.height, fx = Math.floor(mx - mr - 2), fy = Math.floor(my - mr - 2);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const px = fx + xx + 0.5, py = fy + yy + 0.5, dx = (px - mx) / mr, dy = (py - my) / mr, rr = dx * dx + dy * dy;
    if (rr > 1) continue;
    const u = Math.min(95, Math.max(0, Math.floor((dx + 1) / 2 * 96))), v = Math.min(95, Math.max(0, Math.floor((dy + 1) / 2 * 96)));
    const a = fullDiscReady ? fullDiscPix[(v * 96 + u) * 4] / 255 : 0.8;
    const ds = Math.hypot(px - cx, py - cy) / sc;             // degrees from the shadow axis
    let r, gg, b;
    if (ds < q.umbra) { const k2 = 0.3 + 0.25 * (ds / q.umbra) ** 2; r = a * k2 * 1.25; gg = a * k2 * 0.45; b = a * k2 * 0.24; }
    else if (ds < q.penumbra) { const f = 0.35 + 0.65 * (ds - q.umbra) / (q.penumbra - q.umbra); r = a * f; gg = a * f * 0.97; b = a * f * 0.93; }
    else { r = gg = a; b = a * 0.97; }
    const i = (yy * w + xx) * 4, edge = clamp((1 - Math.sqrt(rr)) * mr * 1.3, 0, 1);
    d[i] = d[i] * (1 - edge) + 255 * Math.min(1, r) * edge; d[i + 1] = d[i + 1] * (1 - edge) + 255 * Math.min(1, gg) * edge; d[i + 2] = d[i + 2] * (1 - edge) + 255 * Math.min(1, b) * edge;
  }
  eg.putImageData(img, fx, fy);
  // labels
  const ms = MA.jdToMs(t);
  let stage = "Outside the shadow";
  if (c.U2 && t >= c.U2 && t <= c.U3) stage = "Totality";
  else if (c.U1 && t >= c.U1 && t <= c.U4) stage = "Partial (umbral)";
  else if (t >= c.P1 && t <= c.P4) stage = "Penumbral";
  eg.textAlign = "left"; eg.font = F(11, 600); eg.fillStyle = stage === "Totality" ? "#ff9a6a" : "#e9edff";
  eg.fillText(stage, 9 * U, 16 * U);
  eg.font = F(9); eg.fillStyle = "rgba(143,152,189,.95)";
  eg.fillText("N ↑  E ←  as in the sky", 9 * U, 28 * U);
  eg.textAlign = "right"; eg.fillText(`umbral mag. ${c.umbralMag.toFixed(3)}`, W - 9 * U, 16 * U);
  eg.fillText(`totality ${c.totalMin.toFixed(0)} min`, W - 9 * U, 28 * U);
  $("#eclCap").innerHTML = `<span><b>${new Date(ms).toISOString().slice(0, 10)} ${fmtUTC(ms)}</b></span><span>greatest ${fmtUTC(MA.jdToMs(c.jdMax))}</span>`;
}
const fullDiscPix = new Uint8ClampedArray(96 * 96 * 4);
function drawSolar(e) {
  const W = eclCanvas.width, H = eclCanvas.height;
  const cx = W / 2, cy = H / 2 - 4, R = Math.min(W, H) * 0.36;
  // Earth seen from the Sun (illustrative): the whole day side, graticule, north up
  const gr = eg.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.05, cx, cy, R);
  gr.addColorStop(0, "#8cc4ff"); gr.addColorStop(0.45, "#3f86d6"); gr.addColorStop(1, "#173d7a");
  eg.fillStyle = gr; eg.beginPath(); eg.arc(cx, cy, R, 0, 7); eg.fill();
  eg.save(); eg.beginPath(); eg.arc(cx, cy, R, 0, 7); eg.clip();
  eg.strokeStyle = "rgba(255,255,255,.18)"; eg.lineWidth = U;
  for (let la = -60; la <= 60; la += 30) { const y = cy - Math.sin(la * D2R) * R, hw = Math.cos(la * D2R) * R; eg.beginPath(); eg.moveTo(cx - hw, y); eg.lineTo(cx + hw, y); eg.stroke(); }
  for (let lo = -60; lo <= 60; lo += 30) { eg.beginPath(); eg.ellipse(cx, cy, Math.abs(Math.sin(lo * D2R)) * R, R, 0, 0, 7); eg.stroke(); }
  // shadow: penumbra radius ~0.55 Earth radii on the fundamental plane; umbra/antumbra tiny
  const gamma = e.gamma, xs = -1.75 + 3.5 * S.ecl.t;
  const sx = cx + xs * R, sy = cy - gamma * R, pr = 0.56 * R;
  const pg = eg.createRadialGradient(sx, sy, 0, sx, sy, pr);
  pg.addColorStop(0, "rgba(0,0,6,.88)"); pg.addColorStop(0.45, "rgba(0,0,10,.55)"); pg.addColorStop(1, "rgba(0,0,10,0)");
  eg.fillStyle = pg; eg.beginPath(); eg.arc(sx, sy, pr, 0, 7); eg.fill();
  // path of the central line across the disc
  eg.strokeStyle = e.type === "annular" ? "rgba(255,194,75,.7)" : "rgba(255,122,61,.8)"; eg.setLineDash([4 * U, 4 * U]); eg.lineWidth = 1.4 * U;
  const hw = Math.sqrt(Math.max(0, 1 - gamma * gamma)) * R; eg.beginPath(); eg.moveTo(cx - hw, sy); eg.lineTo(cx + hw, sy); eg.stroke(); eg.setLineDash([]);
  eg.restore();
  eg.strokeStyle = "rgba(124,200,255,.45)"; eg.lineWidth = 1.2 * U; eg.beginPath(); eg.arc(cx, cy, R, 0, 7); eg.stroke();
  // the umbra (total) or antumbra (annular) spot where it meets the Earth
  const onEarth = Math.hypot(sx - cx, sy - cy) < R;
  if (onEarth) {
    if (e.type === "annular") { eg.strokeStyle = "#ffc24b"; eg.lineWidth = 2 * U; eg.beginPath(); eg.arc(sx, sy, 4 * U, 0, 7); eg.stroke(); }
    else { eg.fillStyle = "#000"; eg.beginPath(); eg.arc(sx, sy, 3.5 * U, 0, 7); eg.fill(); eg.strokeStyle = "#ff7a3d"; eg.lineWidth = 1.5 * U; eg.stroke(); }
  }
  eg.font = F(11, 600); eg.textAlign = "left"; eg.fillStyle = "#e9edff";
  eg.fillText(`${e.type[0].toUpperCase() + e.type.slice(1)} · max ${e.dur}`, 9 * U, 16 * U);
  eg.font = F(9, 600); eg.fillStyle = "rgba(255,194,75,.95)";
  eg.fillText("ILLUSTRATIVE · not a path map", 9 * U, 28 * U);
  eg.font = F(9); eg.fillStyle = "rgba(143,152,189,.95)"; eg.textAlign = "right";
  eg.fillText(`gamma ${gamma >= 0 ? "+" : ""}${gamma.toFixed(3)}`, W - 9 * U, 16 * U);
  eg.fillText("Earth from the Sun, N ↑", W - 9 * U, 28 * U);
  const c = e.calc, ms = MA.jdToMs(c.jdMax);
  $("#eclCap").innerHTML = `<span>shadow moves west → east</span><span>greatest ≈ <b>${fmtUTC(ms)}</b></span>`;
}

/* ------------------------------------------------------------- tabs --- */
function openTab(name) {
  S.tab = name;
  $$(".mn-tabs button").forEach(b => { const on = b.dataset.tab === name; b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-selected", String(on)); });
  $$(".mn-pane").forEach(p => { p.hidden = p.dataset.pane !== name; });
  if (name === "ecl") drawEclipse();
}

/* ------------------------------------------------------------- wire --- */
function wire() {
  $$("#mode button").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
  $$(".mn-tabs button").forEach(b => b.addEventListener("click", () => openTab(b.dataset.tab)));
  $("#playBtn").addEventListener("click", () => setPlaying(!S.playing));
  $("#speed").addEventListener("change", e => { S.speed = +e.target.value; });
  $("#nowBtn").addEventListener("click", () => { S.base = REAL_NOW; S.offH = (Date.now() - REAL_NOW) / HOUR; setPlaying(false); S.dirty = true; });
  $("#timeSlider").addEventListener("input", e => { S.offH = +e.target.value; S.dirty = true; });
  $("#calPrev").addEventListener("click", () => { const d = new Date(S.calY, S.calM - 1, 15, 21); setTime(d.getTime()); });
  $("#calNext").addEventListener("click", () => { const d = new Date(S.calY, S.calM + 1, 15, 21); setTime(d.getTime()); });
  $("#optPins").addEventListener("change", e => { S.showPins = e.target.checked; });
  $("#optNames").addEventListener("change", e => { S.names = e.target.checked; featsEl.hidden = !S.names; });
  $("#optEarthshine").addEventListener("change", e => { S.earthshine = e.target.checked; S.dirty = true; });
  $("#optRelief").addEventListener("change", e => { S.relief = e.target.checked; S.dirty = true; });
  $$("#hemi button").forEach(b => b.addEventListener("click", () => {
    S.hemi = b.dataset.h; $$("#hemi button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    S.dirty = true; lastReadKey = ""; buildCalendar(); nextKey = "";
  }));
  $$("#filters .chip").forEach(b => b.addEventListener("click", () => {
    S.filter = b.dataset.f; $$("#filters .chip").forEach(x => x.setAttribute("aria-pressed", String(x === b))); applyFilter();
  }));
  $("#country").addEventListener("change", e => { S.country = e.target.value; applyFilter(); });
  $("#cardClose").addEventListener("click", () => { select(null); history.replaceState(null, "", location.pathname + location.search); });
  $("#cardFly").addEventListener("click", () => { const s = SITES.find(x => x.id === S.sel); if (s) flyToSite(s); });
  $("#showLLR").addEventListener("click", () => {
    openTab("sites"); $$("#filters .chip").find(x => x.dataset.f === "llr").click();
    if (S.mode !== "earth") setMode("earth");
  });
  $$("#eclKind button").forEach(b => b.addEventListener("click", () => {
    S.ecl.kind = b.dataset.k; S.ecl.idx = -1; S.ecl.t = 0.0;
    $$("#eclKind button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    renderEclList(); drawEclipse();
  }));
  { const b = $("#eclPlay"); b.textContent = S.ecl.playing ? "❚❚" : "▶"; b.setAttribute("aria-pressed", String(S.ecl.playing)); }
  $("#eclPlay").addEventListener("click", () => {
    S.ecl.playing = !S.ecl.playing; const b = $("#eclPlay");
    b.setAttribute("aria-pressed", String(S.ecl.playing)); b.textContent = S.ecl.playing ? "❚❚" : "▶";
    b.setAttribute("aria-label", S.ecl.playing ? "Pause the eclipse animation" : "Play the eclipse animation");
  });
  $("#eclT").addEventListener("input", e => { S.ecl.t = +e.target.value / 1000; S.ecl.playing = false; $("#eclPlay").textContent = "▶"; drawEclipse(); });
  // phones: remember whether the bottom sheet is collapsed (the time bar sits on top of it)
  const col = $("#panel .hud-collapse");
  col.addEventListener("click", () => setTimeout(() => { document.body.classList.toggle("mn-sheet-collapsed", $("#panel").classList.contains("collapsed")); layout(); }, 0));
  addEventListener("resize", () => layout());
  addEventListener("keydown", e => {
    if (e.target.closest("input, select, textarea")) return;
    if (e.key === " " && e.target === document.body) { e.preventDefault(); setPlaying(!S.playing); }
    else if (e.key === "Escape") select(null);
    else if (e.key === "[") { S.offH = clamp(S.offH - 24, -720, 720); S.dirty = true; }
    else if (e.key === "]") { S.offH = clamp(S.offH + 24, -720, 720); S.dirty = true; }
  });
  // double-click the Moon in free orbit: fly toward that point
  renderer.domElement.addEventListener("dblclick", ev => {
    const ray = new THREE.Raycaster(), p = new THREE.Vector2(ev.clientX / V.W * 2 - 1, -(ev.clientY / V.H) * 2 + 1);
    ray.setFromCamera(p, camera); const hit = ray.intersectObject(moonMesh)[0];
    if (!hit) return;
    if (S.mode !== "free") setMode("free", { keepCamera: true });
    const dir = hit.point.clone().normalize();
    flyTo(() => dir.clone(), Math.max(1.35, camera.position.length() * 0.6), 1.2);
  });
}

/* ------------------------------------------------------------- loop --- */
let last = performance.now(), frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.playing && !STILL) {
    S.offH += dt * S.speed;
    if (S.offH > 720) S.offH = -720;
    S.dirty = true;
  }
  // blend between the sky-true orientation and north-up free orbit
  const targetF = S.mode === "free" ? 1 : 0;
  if (S.modeF !== targetF) { S.modeF = REDUCE ? targetF : S.modeF + clamp(targetF - S.modeF, -dt / 1.2, dt / 1.2); S.dirty = true; }
  extras.visible = S.modeF > 0.01;
  update();
  stepFly(dt);
  if (!fly) controls.update();
  qInv.copy(pivot.quaternion).invert();
  moonUniforms.camL.value.copy(camera.position).applyQuaternion(qInv);
  renderer.render(scene, camera);
  updateOverlay();
  if (S.tab === "ecl" && S.ecl.playing && !STILL) { S.ecl.t = (S.ecl.t + dt / 14) % 1; drawEclipse(); }
  frames++;
  if (frames === 2) $("#loading").classList.add("done");
}

/* ------------------------------------------------------------- boot --- */
async function boot() {
  wire();
  layout();
  const [data, alb, hgt, hmeta] = await Promise.all([
    fetch("data/moon.json").then(r => r.json()),
    loadTex("assets/img/moon/moon-albedo.png"), loadTex("assets/img/moon/moon-height.png"),
    fetch("assets/img/moon/moon-height.json").then(r => r.json()).catch(() => ({ minKm: -5.7, maxKm: 8.3 }))
  ]);
  DATA = data; SITES = data.sites.map(s => ({ ...s, tags: s.tags.slice() }));
  moonUniforms.albedoMap.value = alb; moonUniforms.heightMap.value = hgt;
  moonUniforms.hMin.value = hmeta.minKm; moonUniforms.hMax.value = hmeta.maxKm;
  moonUniforms.texSize.value.set(alb.image.width, alb.image.height);
  readAlbedoPixels(alb.image);
  // a full-Moon disc for the eclipse diagram
  drawDisc(fullDisc, { l: 0, b: 0, P: 0, sunLon: 0, sunLat: 0 }, { illum: 1 }, { earthshine: 0, hemi: "N" });
  fullDiscPix.set(fullDisc.getContext("2d").getImageData(0, 0, 96, 96).data); fullDiscReady = true;
  buildSites(); buildFeatures(); buildEclipses();
  const d = new Date(simMs()); S.calY = d.getFullYear(); S.calM = d.getMonth(); buildCalendar();
  astro = null; update();
  if (window.katex) $$(".tex[data-tex]").forEach(el => { try { window.katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false }); } catch (e) { el.textContent = el.dataset.tex; } });
  const h = location.hash.slice(1); if (h && SITES.some(s => s.id === h)) { select(h, { fly: false, noHash: true }); }
  if (phoneMQ.matches && !Q.has("sheet")) { const c = $("#panel .hud-collapse"); if (c && !$("#panel").classList.contains("collapsed")) c.click(); }
  layout();
  requestAnimationFrame(frame);
}
boot().catch(err => { console.error(err); $("#loading").textContent = "Could not load the Moon data: " + err.message; });

/* ------------------------------------------------- test hooks (shot.py) --- */
window.__sim = {
  setTime(t) { const ms = typeof t === "number" ? t : Date.parse(t); if (isFinite(ms)) { setTime(ms); setPlaying(false); } return new Date(simMs()).toISOString(); },
  play(on = true, speed = 6) { S.speed = speed; setPlaying(on); },
  mode(m) { setMode(m); return S.mode; },
  hemi(h) { const b = $$("#hemi button").find(x => x.dataset.h === h); if (b) b.click(); return S.hemi; },
  select(id, doFly = true) { select(id, { fly: doFly }); return S.sel; },
  jump(id) { setMode("free", { keepCamera: true }); S.modeF = 1; S.dirty = true; update(); select(id, { fly: true }); if (fly) { fly.dur = 0.01; stepFly(1); } return S.sel; },
  tab(name) { openTab(name); const p = $("#panel"); if (p.classList.contains("collapsed")) p.querySelector(".hud-collapse").click(); return name; },
  filter(f) { const b = $$("#filters .chip").find(x => x.dataset.f === f); if (b) b.click(); return S.filter; },
  names(on = true) { const c = $("#optNames"); c.checked = on; c.dispatchEvent(new Event("change")); return on; },
  eclipse(kind, idx, t) { const b = $$("#eclKind button").find(x => x.dataset.k === kind); if (b) b.click(); if (idx != null) { S.ecl.idx = idx; renderEclList(); } if (t != null) S.ecl.t = t; S.ecl.playing = false; drawEclipse(); return ECL[kind][S.ecl.idx] && ECL[kind][S.ecl.idx].date; },
  cam(x, y, z) { camera.position.set(x, y, z); camera.lookAt(0, 0, 0); return camera.position.toArray(); },
  state() {
    if (!astro) return null;
    const { lib, ph } = astro;
    return { time: new Date(simMs()).toISOString(), phase: ph.name, illum: +ph.illum.toFixed(4), ageDays: +ph.ageDays.toFixed(2), distKm: Math.round(ph.distKm),
      libL: +lib.l.toFixed(3), libB: +lib.b.toFixed(3), P: +lib.P.toFixed(2), colong: +lib.colongitude.toFixed(2), mode: S.mode, sel: S.sel,
      sites: SITES.length, visiblePins: SITES.filter(s => s.el && !s.el.classList.contains("hide")).length, frames };
  }
};
