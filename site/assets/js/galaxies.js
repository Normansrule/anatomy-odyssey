/* Cosmic Library — Galaxy Collision
 * The Milky Way and Andromeda (and three famous collisions) as a restricted N-body simulation on the GPU.
 * Physics lives in galaxies-physics.js (cores, initial conditions, units); GPU integrator and shaders in
 * galaxies-gpu.js. This file: scene, camera, bloom, the "view from the Sun", timeline and panel UI.
 *
 * URL flags (for testing and slow machines):
 *   ?n=20000       star particles        ?q=low     low quality (pixel ratio 1, no dust pass)
 *   ?still         start paused, no camera drift            ?preset=antennae|mice|cartwheel|mw
 *   ?view=sky|a|b|edge|overview                              ?t=4.2  jump to 4.2 billion years at load
 * Test hook: window.__sim.step(n) advances n leapfrog steps synchronously and redraws.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import * as P from "./galaxies-physics.js";
import { StarIntegrator, makeStarMaterial, makeStarGeometry, makeBackground, makePath } from "./galaxies-gpu.js";

const $ = (id) => document.getElementById(id);
const Codex = window.Codex || { fmt: (v) => String(v), webgl: () => true, noGL() {}, reducedMotion: false };
const Q = new URLSearchParams(location.search);
const STILL = Q.has("still");
const LOWQ = Q.get("q") === "low";
const REDUCE = Codex.reducedMotion;
const COUNTS = [16384, 32768, 65536, 131072, 262144];
const V = P.V_KMS, GYR = P.GYR;

/* ============================================================================================ presets */
/* Inclinations / arguments ω are in degrees (see diskBasis). MW–M31 starting point: distance 770 kpc and
 * Galactocentric radial velocity −109.3 km/s (van der Marel et al. 2012, paper II); the tangential velocity is
 * solved so the first pericentre has the chosen distance (31 kpc in 2012, ≈130 kpc with Gaia DR2 in 2019).
 * Disk orientations relative to the (poorly known) orbital plane are illustrative. */
const PRESETS = {
  mw: {
    names: ["Milky Way", "Andromeda (M31)"], short: ["Milky Way", "Andromeda"],
    // MW tilt 21.6° about the axis ⟂ to the line of centres puts Andromeda at Galactic latitude b = −21.6°, as today.
    A: { model: "mw", inc: 22, omega: 90, spin: 1, sun: true }, B: { model: "m31", inc: 60, omega: 30, spin: 1 },
    d0: 770, vr: -109.3 / V, rPeri: 31, tEnd: 10 * GYR, dt: 0.15, df: 0.2, ratio: 1.5, ratioLabel: "Andromeda : Milky Way mass",
    fromNow: true, warp: 0.55, quick: true,
    lede: "The Milky Way and the Andromeda Galaxy (Messier 31, M31) are falling toward each other at about 110 km/s. Every dot is a cluster of stars moving through the pull of both galaxies — tidal tails, bridges and, maybe, a merger.",
  },
  antennae: {
    names: ["NGC 4038", "NGC 4039"], short: ["NGC 4038", "NGC 4039"],
    A: { model: "tt", inc: 60, omega: -30, spin: 1 }, B: { model: "tt", inc: 60, omega: -30, spin: 1 },
    d0: 80, energy: 0.8, rPeri: 10, tEnd: 1.6 * GYR, dt: 0.12, df: 0.3, ratio: 1, ratioLabel: "Mass ratio (second : first)",
    warp: 0.35, viewDir: [0.2, 0.45, 1],
    lede: "Two equal spirals on a bound orbit, both spinning with the orbit and tilted 60° — the geometry Toomre & Toomre used for the Antennae. Watch two long curved tails unroll after the first pass.",
  },
  mice: {
    names: ["NGC 4676 A", "NGC 4676 B"], short: ["Mouse A", "Mouse B"],
    A: { model: "tt", inc: 15, omega: -30, spin: 1 }, B: { model: "tt", inc: 75, omega: 60, spin: 1 },
    d0: 80, energy: 0.9, rPeri: 14, tEnd: 1.6 * GYR, dt: 0.12, df: 0.3, ratio: 1, ratioLabel: "Mass ratio (second : first)",
    warp: 0.35,
    lede: "Two equal spirals on a nearly parabolic, prograde orbit, one seen almost face-on and one nearly edge-on to the orbit. Each throws out a single long, straight tail — the Mice.",
  },
  cartwheel: {
    names: ["Target disk", "Intruder"], short: ["Target", "Intruder"],
    A: { model: "sp", inc: 90, omega: 90, spin: 1 }, B: { model: "cmp", inc: 30, omega: 0, spin: 1 },
    d0: 70, energy: 1.6, rPeri: 2, tEnd: 1.0 * GYR, dt: 0.1, df: 0.2, ratio: 0.3, ratioLabel: "Intruder : target mass",
    warp: 0.25, startView: "a",
    lede: "A compact galaxy dives almost exactly through the centre of a big disk, along its spin axis. The disk is yanked inward, rebounds, and a ring of stars ripples outward like a wave on a pond.",
  },
};

/* ============================================================================================ renderer */
const stage = $("stage");
if (!Codex.webgl()) { Codex.noGL(); throw new Error("WebGL unavailable"); }
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
if (!renderer.capabilities.isWebGL2 || !renderer.extensions.has("EXT_color_buffer_float")) {
  Codex.noGL("This simulation stores every star’s position in floating-point textures, which needs WebGL 2 with floating-point render targets. Try a recent Chrome, Edge, Firefox or Safari.");
  $("loading").classList.add("done");
  throw new Error("float render targets unavailable");
}
const glInfo = (() => {
  try { const gl = renderer.getContext(); const e = gl.getExtension("WEBGL_debug_renderer_info"); return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : ""; } catch (e) { return ""; }
})();
const SOFTWARE = /swiftshader|llvmpipe|software/i.test(glInfo);
const MOBILE = matchMedia("(max-width: 820px)").matches || matchMedia("(pointer: coarse)").matches;
const PR = LOWQ || SOFTWARE ? 1 : Math.min(devicePixelRatio || 1, MOBILE ? 1.5 : 2);
renderer.setPixelRatio(PR);
renderer.setClearColor(0x000000, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute("aria-label", stage.getAttribute("aria-label"));

let N = +Q.get("n") || (SOFTWARE ? 16384 : MOBILE ? 49152 : 131072);
N = Math.max(1024, Math.min(262144, Math.round(N)));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 20000);
const skyCam = new THREE.PerspectiveCamera(95, 1, 0.01, 20000);
camera.position.set(0, 260, 900);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.minDistance = 4; controls.maxDistance = 3000;
controls.zoomSpeed = 0.9; controls.rotateSpeed = 0.6;

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType }));
const renderPass = new RenderPass(scene, camera);
composer.addPass(renderPass);
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.95, 0.62, 0.05);
composer.addPass(bloom);
/* Astronomical "asinh stretch" (Lupton et al. 2004, PASP 116, 133): lifts faint tidal tails without blowing out
 * the bright centres — the same trick used to make deep images of interacting galaxies. Colour is preserved. */
const stretch = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uBeta: { value: 14.0 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uBeta; varying vec2 vUv;
    float asinh_(float x) { return log(x + sqrt(x * x + 1.0)); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float L = max(dot(c.rgb, vec3(0.2126, 0.7152, 0.0722)), 1e-6);
      float Ls = asinh_(L * uBeta) / asinh_(uBeta);
      gl_FragColor = vec4(c.rgb * (Ls / L), 1.0);
    }`,
});
composer.addPass(stretch);
composer.addPass(new OutputPass());

const bg = makeBackground(11, MOBILE ? 2600 : 4200);
scene.add(bg);
const starMat = makeStarMaterial(false), dustMat = makeStarMaterial(true);
let starPts = null, dustPts = null, sim = null, pathA = null, pathB = null;

/* ============================================================================================ state */
const S = {
  preset: PRESETS[Q.get("preset")] ? Q.get("preset") : "mw",
  ratio: 1.5, peri: 31, incA: 30, incB: 60, spinA: 1, spinB: 1,
  step: 0, playing: !STILL && !REDUCE, warp: 0.55, target: -1,
  view: "overview", userAt: -1e9, drift: !STILL && !REDUCE,
  scn: null, cfg: null, stars: null, sunIdx: -1,
  sun: [0, 0, 0], sunValid: false, sunReadAt: -1,
  arms: true, tail: true, dust: !LOWQ, paths: false, labels: true, exposure: 1,
  fps: 60, frames: 0, fpsT: performance.now(),
  skyYaw: 0, skyPitch: 0,
};

/* ============================================================================================ build a run */
function composeCfg() {
  const p = PRESETS[S.preset];
  const baseRatio = P.totalMass(P.MODELS[p.B.model]) / P.totalMass(P.MODELS[p.A.model]);
  return {
    A: { ...p.A, inc: S.incA, spin: S.spinA, massScale: 1 },
    B: { ...p.B, inc: S.incB, spin: S.spinB, massScale: S.ratio / baseRatio },
    d0: p.d0, vr: p.vr, energy: p.energy, rPeri: S.peri, tEnd: p.tEnd, dt: p.dt, df: p.df,
  };
}

function build() {
  const t0 = performance.now();
  const cfg = composeCfg();
  const scn = P.buildScenario(cfg);
  const stars = P.makeStars(scn, cfg, N, 20260928);
  S.cfg = cfg; S.scn = scn; S.stars = stars; S.sunIdx = stars.sunIndex;
  S.extent = P.tracerExtent(scn, cfg);
  if (!sim || sim.N !== N) {
    if (sim) sim.dispose();
    sim = new StarIntegrator(renderer, N);
  }
  sim.setGalaxies(scn.A, scn.B, scn.setup.dt);
  sim.load(stars.pos, stars.vel);
  if (starPts) { scene.remove(starPts, dustPts); starPts.geometry.dispose(); }
  const geo = makeStarGeometry(N, sim.w, sim.h, stars.pop, stars.host, 99);
  starPts = new THREE.Points(geo, starMat); dustPts = new THREE.Points(geo, dustMat);
  starPts.frustumCulled = dustPts.frustumCulled = false;
  dustPts.renderOrder = 2; starPts.renderOrder = 1;
  scene.add(starPts, dustPts);
  dustPts.visible = S.dust;
  // Disk bases for the density-wave pattern
  for (const [k, b] of [["0", stars.basisA], ["1", stars.basisB]]) {
    for (const m of [starMat, dustMat]) {
      m.uniforms["uX" + k].value.fromArray(b.ex); m.uniforms["uY" + k].value.fromArray(b.ey); m.uniforms["uZ" + k].value.fromArray(b.ez);
    }
  }
  for (const m of [starMat, dustMat]) {
    m.uniforms.uSpin.value.set(cfg.A.spin, cfg.B.spin);
    m.uniforms.uRd.value.set(scn.A.Rd, scn.B.Rd);
  }
  // Orbit paths
  if (pathA) { scene.remove(pathA, pathB); pathA.geometry.dispose(); pathB.geometry.dispose(); }
  pathA = makePath(scn.cores.pos, 0, 8, 0x7cc8ff); pathB = makePath(scn.cores.pos, 1, 8, 0xff7a3d);
  pathA.visible = pathB.visible = S.paths;
  scene.add(pathA, pathB);
  S.step = 0; S.target = -1; S.sunValid = false;
  drawTimeline();
  updateStatic();
  console.info(`[galaxies] built ${N} stars in ${(performance.now() - t0).toFixed(0)} ms · first pericentre ${(scn.cores.tPeri / GYR).toFixed(2)} Gyr at ${scn.cores.rPeri.toFixed(0)} kpc · merger ${scn.cores.tMerge ? (scn.cores.tMerge / GYR).toFixed(2) + " Gyr" : "none"}`);
}

/* ============================================================================================ stepping */
const coreAt = (k, which, out) => {
  const c = S.scn.cores, j = Math.min(k, c.nSteps) * 6 + which * 3;
  out[0] = c.pos[j]; out[1] = c.pos[j + 1]; out[2] = c.pos[j + 2]; return out;
};
const _ca = [0, 0, 0], _cb = [0, 0, 0];
function advance(n) {
  const c = S.scn.cores;
  n = Math.min(n, c.nSteps - S.step);
  for (let i = 0; i < n; i++) {
    coreAt(S.step, 0, _ca); coreAt(S.step, 1, _cb);
    sim.step(_ca, _cb);
    S.step++;
  }
  if (n > 0) S.sunValid = false;
  if (S.step >= c.nSteps) { S.playing = false; S.target = -1; syncPlay(); }
  return n;
}
/* The Sun's position lives on the GPU. The Sun's-sky camera needs it every frame (one-texel synchronous read);
 * labels and read-outs use a non-blocking read every few frames. */
let sunPending = false;
function sunNow(sync) {
  if (S.sunIdx < 0) return S.sun;
  if (sync) { if (!S.sunValid) { sim.readStar(S.sunIdx, S.sun); S.sunValid = true; } return S.sun; }
  if (!S.sunValid && !sunPending) {
    sunPending = true;
    const step = S.step;
    sim.readStarAsync(S.sunIdx).then((p) => { sunPending = false; if (S.step === step) { S.sun[0] = p[0]; S.sun[1] = p[1]; S.sun[2] = p[2]; S.sunValid = true; } else if (!S.sunValid) { S.sun[0] = p[0]; S.sun[1] = p[1]; S.sun[2] = p[2]; } })
      .catch(() => { sunPending = false; sim.readStar(S.sunIdx, S.sun); S.sunValid = true; });
  }
  return S.sun;
}
const tGyr = () => S.step * S.scn.setup.dt / GYR;
const stepOfGyr = (g) => Math.max(0, Math.min(S.scn.cores.nSteps, Math.round(g * GYR / S.scn.setup.dt)));

/* Jump: forward runs extra steps each frame; backward restarts and fast-forwards. */
function seekGyr(g) {
  const k = stepOfGyr(g);
  if (k < S.step) { sim.load(S.stars.pos, S.stars.vel); S.step = 0; S.sunValid = false; }
  S.target = k;
}

/* ============================================================================================ camera */
/* Every view defines a wanted camera target and position. The camera is carried along with the moving target
 * exactly (so it never lags at high time warp) and eases its offset toward the wanted one. Far apart, the
 * overview becomes an "over the shoulder" shot from behind the first galaxy toward the second. */
const V3 = THREE.Vector3, Y = new V3(0, 1, 0);
const tmp = new V3(), tmp2 = new V3(), cA = new V3(), cB = new V3();
const wantT = new V3(), wantP = new V3(), lastT = new V3();
let driftAng = 0, snapUntil = 0;

function coresNow() { coreAt(S.step, 0, _ca); coreAt(S.step, 1, _cb); cA.fromArray(_ca); cB.fromArray(_cb); }
function sep() { return cA.distanceTo(cB); }
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function desiredPose(outT, outP) {
  const sc = S.scn, s = sep();
  const narrow = camera.aspect < 1 ? 1.45 : 1;
  if (S.view === "a" || S.view === "b") {
    const isA = S.view === "a", c = isA ? cA : cB, b = isA ? S.stars.basisA : S.stars.basisB, R = (isA ? sc.A : sc.B).Rmax;
    const n = new V3().fromArray(b.ey);
    const dir = new V3().fromArray(b.ex).multiplyScalar(-0.5).addScaledVector(n, 0.85).addScaledVector(Y, 0.12).normalize().applyAxisAngle(n, driftAng);
    outT.copy(c);
    outP.copy(c).addScaledVector(dir, Math.max(42, R * 2.5) * narrow);
    return;
  }
  const MA = sc.cores.MA, MB = sc.cores.MB;
  const mid = new V3().copy(cA).multiplyScalar(MA).addScaledVector(cB, MB).divideScalar(MA + MB).lerp(tmp2.copy(cA).add(cB).multiplyScalar(0.5), 0.5);
  const rmax = Math.max(sc.A.Rmax, sc.B.Rmax);
  const ex = S.extent ? S.extent.ext[Math.min(S.extent.ext.length - 1, Math.floor(S.step / S.extent.every))] : 0;
  const fit = Math.min(Math.max(camera.aspect, 0.55), 1.2);
  const dist = Math.max(rmax * 3.6 * narrow, (s + rmax * 2.6) * 1.1 / fit, ex * 2.2 / fit);
  const pv = PRESETS[S.preset].viewDir;
  const dir = (S.view === "edge" ? new V3(0.12, 0.05, 1) : pv ? new V3(...pv) : new V3(-0.35, 0.72, 0.62)).normalize().applyAxisAngle(Y, driftAng);
  outT.copy(mid); outP.copy(mid).addScaledVector(dir, dist);
  const w = S.view === "overview" ? smooth(110, 330, s) : 0;
  if (w > 0) {
    // over the shoulder: just behind and above the first galaxy, looking past it toward its partner
    const u = tmp.copy(cB).sub(cA).normalize();
    const side = new V3().crossVectors(u, Y).normalize();
    const tall = camera.aspect < 1;   // portrait: stack the two galaxies vertically instead of side by side
    const back = new V3().copy(u).multiplyScalar(tall ? -105 : -78).addScaledVector(side, tall ? 3 : 20).applyAxisAngle(Y, driftAng * 0.25).addScaledVector(Y, tall ? 34 : 13);
    const shT = new V3().copy(cA).addScaledVector(u, s * 0.5);
    const shP = new V3().copy(cA).add(back);
    outT.lerp(shT, w); outP.lerp(shP, w);
  }
}
function setView(v, instant) {
  S.view = v;
  document.querySelectorAll("#views button").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === v ? "true" : "false"));
  $("skyBtn").setAttribute("aria-pressed", v === "sky" ? "true" : "false");
  $("skyBtn").textContent = v === "sky" ? "☀ Back to the overview" : "☀ View from the Sun";
  document.body.classList.toggle("gx-skyview", v === "sky");
  controls.enabled = v !== "sky";
  if (v === "sky") { S.skyYaw = 0; S.skyPitch = 0; return; }
  coresNow();
  desiredPose(wantT, wantP);
  lastT.copy(wantT);
  if (instant) { controls.target.copy(wantT); camera.position.copy(wantP); }
  snapUntil = performance.now() + 2500;
  S.userAt = -1e9;
}

function updateCamera(dt, now) {
  coresNow();
  if (S.view === "sky") return;
  const auto = S.drift ? now - S.userAt > 6000 : S.userAt < 0;
  if (auto && S.playing && S.drift) driftAng += dt * 0.03;
  desiredPose(wantT, wantP);
  // carry the camera with the moving focus
  const delta = tmp.copy(wantT).sub(lastT);
  camera.position.add(delta); controls.target.add(delta);
  lastT.copy(wantT);
  if (!auto) return;
  const k = 1 - Math.exp(-dt * (now < snapUntil ? 2.2 : 0.9));
  controls.target.lerp(wantT, k);
  const off = tmp.copy(camera.position).sub(controls.target);
  const want = tmp2.copy(wantP).sub(wantT);
  const L = off.length(), Lw = want.length();
  off.divideScalar(L || 1).lerp(want.divideScalar(Lw || 1), k).normalize().multiplyScalar(L + (Lw - L) * k);
  camera.position.copy(controls.target).add(off);
}
controls.enablePan = false;
controls.addEventListener("start", () => { S.userAt = performance.now(); });
controls.addEventListener("end", () => { S.userAt = performance.now(); });

/* ----- view from the Sun: camera at the tagged star, looking at Andromeda (or the remnant's centre) ----- */
function updateSkyCam() {
  if (S.sunIdx < 0) return false;
  const sp = tmp.fromArray(sunNow(true));
  skyCam.position.copy(sp);
  const merged = S.scn.cores.tMerge != null && S.step * S.scn.setup.dt > S.scn.cores.tMerge;
  const look = merged ? cA.clone().lerp(cB, 0.5) : cB.clone();
  const up = new V3().fromArray(S.stars.basisA.ey);
  const fwd = look.sub(sp).normalize();
  if (Math.abs(fwd.dot(up)) > 0.97) up.set(0, 0, 1);
  // look direction with user yaw / pitch
  const right = new V3().crossVectors(fwd, up).normalize();
  const up2 = new V3().crossVectors(right, fwd).normalize();
  const dir = fwd.clone().applyAxisAngle(up2, S.skyYaw).applyAxisAngle(right, S.skyPitch);
  skyCam.up.copy(up2);
  skyCam.lookAt(tmp2.copy(skyCam.position).add(dir));
  return true;
}
let skyDrag = null;
renderer.domElement.addEventListener("pointerdown", (e) => { if (S.view === "sky") { skyDrag = { x: e.clientX, y: e.clientY, yaw: S.skyYaw, pitch: S.skyPitch }; renderer.domElement.setPointerCapture(e.pointerId); } });
renderer.domElement.addEventListener("pointermove", (e) => {
  if (!skyDrag) return;
  const k = (skyCam.fov * Math.PI / 180) / renderer.domElement.clientHeight;
  S.skyYaw = skyDrag.yaw + (e.clientX - skyDrag.x) * k;
  S.skyPitch = Math.max(-1.4, Math.min(1.4, skyDrag.pitch + (e.clientY - skyDrag.y) * k));
});
renderer.domElement.addEventListener("pointerup", () => { skyDrag = null; });
renderer.domElement.addEventListener("wheel", (e) => { if (S.view === "sky") { skyCam.fov = Math.max(30, Math.min(120, skyCam.fov + e.deltaY * 0.04)); skyCam.updateProjectionMatrix(); } }, { passive: true });

/* ============================================================================================ resize */
function resize() {
  const w = stage.clientWidth || innerWidth, h = stage.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  composer.setPixelRatio(PR); composer.setSize(w, h);
  bloom.resolution.set(w * PR * 0.5, h * PR * 0.5);
  for (const c of [camera, skyCam]) { c.aspect = w / h; c.updateProjectionMatrix(); }
  camera.fov = w < h ? 62 : 50;
  frameOffset(w, h);
  drawTimeline();
}
addEventListener("resize", resize);

/* Centre the action in the part of the screen not covered by the panel and the dock. */
function frameOffset(w, h) {
  w = w || stage.clientWidth; h = h || stage.clientHeight;
  const panel = $("panel").getBoundingClientRect(), dock = $("dock").getBoundingClientRect();
  let ox = 0, oy = 0;
  if (w > 820) {
    ox = (w - panel.left) / 2;                           // free area is left of the panel
    oy = -((h - dock.top) - 60) / 2;                     // and between the nav bar and the dock
  } else {
    oy = -((h - dock.top) - 110) / 2;
  }
  camera.setViewOffset(w, h, ox * 0.9, -oy * 0.9, w, h);
  camera.updateProjectionMatrix();
  skyCam.setViewOffset(w, h, ox * 0.9, -oy * 0.9, w, h);
  skyCam.updateProjectionMatrix();
}

/* ============================================================================================ render */
function render() {
  const sky = S.view === "sky" && updateSkyCam();
  const cam = sky ? skyCam : camera;
  const H = renderer.domElement.height;
  const scale = H / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2));
  const t = S.step * S.scn.setup.dt;
  // Arms fade once the first close pass has torn up the disks (they are a painted pattern, not self-gravity)
  const tp = S.scn.cores.tPeri ?? 1e9, rp = S.scn.cores.rPeri;
  const hit = rp < 80 ? 1 : 0.4;
  const fade = S.arms ? 1 - hit * THREE.MathUtils.smoothstep(t, tp - 60, tp + 90) : 0;
  // Surface-brightness normalisation: disk-centre particle density Σ ≈ 0.0076·N per kpc² and a Gaussian sprite
  // covers ≈ 0.175·s² kpc², so I·Σ·0.175·s² ≈ 0.8 (pre-tone-mapping) at any particle count.
  const sz = 0.34 * Math.pow(131072 / N, 0.3);
  const gain = 0.22 / (0.0076 * N * 0.175 * sz * sz);
  for (const m of [starMat, dustMat]) {
    const u = m.uniforms;
    u.uPos.value = sim.posTex;
    u.uScale.value = scale; u.uPR.value = PR;
    u.uSize.value = sz;
    u.uGain.value = gain;
    u.uDustK.value = gain * 380 * (S.dustMul || 1);   // tuned so an edge-on disk shows a lane like NGC 891
    u.uMinPx.value = 1.25 * PR;
    u.uTime.value = t;
    u.uSky.value = sky ? 1 : 0;
    u.uC0.value.copy(cA); u.uC1.value.copy(cB);
    u.uArm.value.set(fade, fade);
    u.uTail.value = S.tail ? 1 : 0;
  }
  bg.material.uniforms.uPR.value = PR;
  bg.material.uniforms.uDim.value = sky ? 0.3 : 1;
  bg.position.copy(cam.position);
  if (pathA) { pathA.material.uniforms.uNow.value = S.step; pathB.material.uniforms.uNow.value = S.step; pathA.visible = pathB.visible = S.paths && !sky; }
  dustPts.visible = S.dust && !sky;
  renderPass.camera = cam;
  renderer.toneMappingExposure = S.exposure * (sky ? 0.8 : 1);
  bloom.enabled = $("optBloom").checked;
  composer.render();
  placeLabels(cam, sky);
}

/* ----- labels ----- */
const labA = $("labA"), labB = $("labB"), labSun = $("labSun");
function place(el, p, cam, show) {
  if (!show) { el.style.opacity = "0"; el._xy = null; return; }
  tmp.copy(p).project(cam);
  const vis = tmp.z < 1 && tmp.z > -1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1;
  el.style.opacity = vis ? "1" : "0";
  el._xy = vis ? [(tmp.x + 1) / 2 * innerWidth, (1 - tmp.y) / 2 * innerHeight] : null;
  if (vis) el.style.transform = `translate3d(${el._xy[0].toFixed(1)}px, ${el._xy[1].toFixed(1)}px, 0)`;
}
function placeLabels(cam, sky) {
  const merged = S.scn.cores.tMerge != null && S.step * S.scn.setup.dt > S.scn.cores.tMerge + 50;
  const on = S.labels;
  const d = sep();
  // Keep labels off each other when the centres are close on screen
  place(labA, tmp2.copy(cA), cam, on && !merged && !sky);
  place(labB, tmp2.copy(cB), cam, on && !merged && (sky || d > 6));
  const la = labA._xy, lb = labB._xy;
  labB.classList.toggle("quiet", !sky && !!(la && lb && Math.hypot(la[0] - lb[0], la[1] - lb[1]) < 70));
  if (S.sunIdx >= 0 && on && !sky) {
    place(labSun, tmp2.fromArray(sunNow(false)), cam, true);
    // hide the Sun's name tag (not its ring) when it would sit on top of the Milky Way's
    const a = labA._xy, b = labSun._xy;
    labSun.classList.toggle("quiet", !!(a && b && Math.hypot(a[0] - b[0], a[1] - b[1]) < 90));
  } else labSun.style.opacity = "0";
}

/* ============================================================================================ UI: readouts */
const fmtG = (g) => (Math.abs(g) < 0.995 ? (g * 1000).toFixed(0) + " Myr" : g.toFixed(2) + " Gyr");
function phaseText() {
  const c = S.scn.cores, t = S.step * S.scn.setup.dt, p = PRESETS[S.preset];
  const tp = c.tPeri, tm = c.tMerge, d = sep();
  const peris = c.peris.filter(x => tm == null || x.t < tm - 5);
  const second = peris[1];
  const mwy = S.preset === "mw";
  if (tp == null || t < tp - 0.12 * (tp || 1)) return mwy ? (d > 450 ? "Approach · Andromeda closes in at ~110 km/s" : d > 150 ? "Approach · the dark halos overlap" : "Approach · falling faster and faster") : "Approach";
  if (t < tp + 0.06 * GYR * (mwy ? 2 : 1)) return "First close pass · tides peak";
  if (tm != null && t >= tm) return mwy ? "Merged · “Milkomeda”, a young elliptical galaxy, settles" : "Merged · the remnant settles into an elliptical";
  if (second && Math.abs(t - second.t) < 0.1 * GYR) return "Second pass · centres plunge together";
  if (tm != null && t > tm - 0.25 * GYR) return "Final plunge · the centres spiral together";
  if (tm == null && d > c.rPeri * 1.5 && t > tp + 0.4 * GYR) return mwy ? "Drifting apart · no merger in this run" : "Drifting apart";
  if (S.preset === "cartwheel") return t < tp + 0.35 * GYR ? "Ring wave spreads outward" : "Rings fade · the disk settles";
  return "Tidal tails and bridges unroll";
}
let phaseLast = "";
function updateReadouts() {
  const c = S.scn.cores, k = Math.min(S.step, c.nSteps), p = PRESETS[S.preset];
  const g = tGyr();
  $("tNow").textContent = g < 0.995 && !p.fromNow ? (g * 1000).toFixed(0) : g.toFixed(2);
  $("tUnit").textContent = p.fromNow ? "billion years from now" : g < 0.995 ? "million years" : "billion years";
  $("rSep").innerHTML = sep().toFixed(sep() < 10 ? 1 : 0) + "<small>kpc</small>";
  // relative speed from the stored track (central difference)
  const k0 = Math.max(0, k - 1), k1 = Math.min(c.nSteps, k + 1);
  const dx = (c.pos[k1 * 6 + 3] - c.pos[k1 * 6]) - (c.pos[k0 * 6 + 3] - c.pos[k0 * 6]);
  const dy = (c.pos[k1 * 6 + 4] - c.pos[k1 * 6 + 1]) - (c.pos[k0 * 6 + 4] - c.pos[k0 * 6 + 1]);
  const dz = (c.pos[k1 * 6 + 5] - c.pos[k1 * 6 + 2]) - (c.pos[k0 * 6 + 5] - c.pos[k0 * 6 + 2]);
  const v = Math.hypot(dx, dy, dz) / ((k1 - k0) * S.scn.setup.dt || 1) * V;
  $("rVel").innerHTML = v.toFixed(0) + "<small>km/s</small>";
  const E = c.energy[k] * V * V;
  $("rEn").innerHTML = (E / 1e4).toFixed(2) + "<small>×10⁴ (km/s)²</small>";
  if (S.sunIdx >= 0) {
    sunNow(!S.playing);
    const merged = c.tMerge != null && S.step * S.scn.setup.dt > c.tMerge;
    const centre = merged ? tmp.copy(cA).lerp(cB, 0.5) : tmp.copy(cA);
    $("rSun").innerHTML = centre.distanceTo(tmp2.fromArray(S.sun)).toFixed(1) + "<small>kpc</small>";
    const dB = cB.distanceTo(tmp2.fromArray(S.sun));
    $("sDist").innerHTML = (dB < 100 ? dB.toFixed(1) : dB.toFixed(0)) + "<small>kpc</small>";
    const ang = 2 * Math.atan(21 / Math.max(dB, 1e-3)) * 180 / Math.PI;
    $("sAng").innerHTML = ang.toFixed(ang < 10 ? 1 : 0) + "<small>°</small>";
    $("sMoon").innerHTML = (ang / 0.52).toFixed(ang < 5 ? 1 : 0) + "<small>full Moons (" + (dB * 3261.56 / 1e6).toFixed(2) + " million light-years away)</small>";
  } else { $("rSun").textContent = "—"; $("sDist").textContent = "—"; $("sAng").textContent = "—"; $("sMoon").textContent = "—"; }
  const ph = phaseText();
  if (ph !== phaseLast) { $("phaseTxt").textContent = ph; phaseLast = ph; }
  $("rFps").innerHTML = S.fps.toFixed(0) + "<small>fps</small>";
  // timeline cursor
  const frac = S.step / c.nSteps;
  $("tlCursor").style.left = (frac * 100).toFixed(3) + "%";
  $("timeline").setAttribute("aria-valuenow", g.toFixed(2));
  if (S.target >= 0) $("loadMsg").textContent = "Fast-forwarding…";
}
function updateStatic() {
  const c = S.scn.cores, p = PRESETS[S.preset];
  $("rPeri").innerHTML = c.tPeri != null ? fmtG(c.tPeri / GYR).replace(/ (\w+)$/, "<small>$1</small>") + "<small> · " + c.rPeri.toFixed(0) + " kpc</small>" : "none";
  $("rMerge").innerHTML = c.tMerge != null ? fmtG(c.tMerge / GYR).replace(/ (\w+)$/, "<small>$1</small>") : "<small>not within " + fmtG(p.tEnd / GYR) + "</small>";
  $("rDt").innerHTML = (S.scn.setup.dt * P.T_MYR).toFixed(2) + "<small>Myr</small>";
  $("timeline").setAttribute("aria-valuemax", (p.tEnd / GYR).toFixed(1));
}

/* ----- timeline: separation of the two centres through the whole run (log scale), with events ----- */
function drawTimeline() {
  if (!S.scn) return;
  const cv = $("tlCanvas"), box = cv.parentElement;
  const w = box.clientWidth, h = box.clientHeight;
  if (!w || !h) return;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = w * dpr; cv.height = h * dpr; cv.style.width = w + "px"; cv.style.height = h + "px";
  const g = cv.getContext("2d");
  g.scale(dpr, dpr);
  const c = S.scn.cores, n = c.nSteps;
  const rmax = Math.max(...[0, 0.25, 0.5, 0.75, 1].map(f => c.sep[Math.floor(f * n)])) * 1.05, rmin = 1;
  const y = (r) => h - 3 - (h - 6) * Math.log(Math.max(r, rmin) / rmin) / Math.log(rmax / rmin);
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, "rgba(124,200,255,.9)"); grad.addColorStop(0.55, "rgba(177,140,255,.9)"); grad.addColorStop(1, "rgba(255,122,61,.9)");
  g.beginPath();
  for (let x = 0; x <= w; x++) { const k = Math.floor(x / w * n); const yy = y(c.sep[k]); x ? g.lineTo(x, yy) : g.moveTo(x, yy); }
  g.strokeStyle = grad; g.lineWidth = 1.5; g.stroke();
  g.lineTo(w, h); g.lineTo(0, h); g.closePath();
  const fill = g.createLinearGradient(0, 0, 0, h); fill.addColorStop(0, "rgba(124,200,255,.12)"); fill.addColorStop(1, "rgba(124,200,255,0)");
  g.fillStyle = fill; g.fill();
  // event marks
  const T = n * S.scn.setup.dt;
  const marks = [];
  const peris = c.peris.filter(x => c.tMerge == null || x.t < c.tMerge - 5).slice(0, 3);
  peris.forEach((p, i) => marks.push({ t: p.t, label: i === 0 ? "1st pass" : i === 1 ? "2nd pass" : "3rd", cls: "ice" }));
  if (c.tMerge != null) marks.push({ t: c.tMerge, label: "merger", cls: "flame" });
  // merge labels that would overlap (e.g. a second pass followed quickly by the merger)
  const out = [];
  for (const m of marks) {
    const prev = out[out.length - 1];
    if (prev && (m.t - prev.t) / T * w < 90) { prev.label += " · " + m.label; prev.cls = m.cls; } else out.push({ ...m });
  }
  $("tlMarks").innerHTML = out.map(m => `<span class="${m.cls}" style="left:${Math.max(4, Math.min(96, m.t / T * 100)).toFixed(2)}%">${m.label}</span>`).join("");
}
function timelineSeek(e) {
  const r = $("timeline").getBoundingClientRect();
  const f = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
  seekGyr(f * S.scn.cores.nSteps * S.scn.setup.dt / GYR);
}
let tlDrag = false;
$("timeline").addEventListener("pointerdown", (e) => { tlDrag = true; $("timeline").setPointerCapture(e.pointerId); timelineSeek(e); });
$("timeline").addEventListener("pointermove", (e) => { if (tlDrag) timelineSeek(e); });
$("timeline").addEventListener("pointerup", () => { tlDrag = false; });
$("timeline").addEventListener("keydown", (e) => {
  const d = e.key === "ArrowRight" ? 0.25 : e.key === "ArrowLeft" ? -0.25 : 0;
  if (d) { e.preventDefault(); seekGyr(Math.max(0, tGyr() + d)); }
});

/* ============================================================================================ UI: controls */
function warpMyrPerSec() { return 10 * Math.pow(100, S.warp); }   // 10 → 1000 Myr per second (log slider)
function syncWarp() { $("warpOut").textContent = Math.round(warpMyrPerSec()) + " Myr/s"; }
function syncPlay() {
  $("play").setAttribute("aria-pressed", S.playing ? "true" : "false");
  $("play").setAttribute("aria-label", S.playing ? "Pause" : "Play");
  $("play").querySelector(".ic").textContent = S.playing ? "❚❚" : "▶";
}
function syncCount() { $("countOut").textContent = N.toLocaleString("en-US").replace(/,/g, " "); $("count").value = Math.max(0, COUNTS.findIndex(c => c >= N)); paintRange($("count")); }
function paintRange(r) { r.style.setProperty("--fill", ((r.value - r.min) / (r.max - r.min) * 100) + "%"); }

function applyPresetUI(name, keepView) {
  const p = PRESETS[name];
  S.preset = name;
  S.ratio = p.ratio; S.peri = p.rPeri; S.incA = p.A.inc; S.incB = p.B.inc; S.spinA = p.A.spin; S.spinB = p.B.spin;
  S.warp = p.warp; $("warp").value = p.warp; syncWarp(); paintRange($("warp"));
  document.querySelectorAll("#presets button").forEach(b => b.setAttribute("aria-pressed", b.dataset.preset === name ? "true" : "false"));
  $("ratioLbl").textContent = p.ratioLabel;
  $("nameA").textContent = p.names[0]; $("nameB").textContent = p.names[1];
  labA.querySelector("span").textContent = p.short[0]; labB.querySelector("span").textContent = p.short[1];
  $("spinA").setAttribute("aria-label", p.names[0] + " spin direction"); $("spinB").setAttribute("aria-label", p.names[1] + " spin direction");
  $("periQuick").hidden = !p.quick;
  $("gxLede").textContent = p.lede;
  document.querySelectorAll("#views button")[1].textContent = p.short[0];
  document.querySelectorAll("#views button")[2].textContent = p.short[1];
  document.body.classList.toggle("gx-nosun", !p.A.sun);
  syncSliders();
  if (!p.A.sun && S.view === "sky") S.view = "overview";
}
function syncSliders() {
  const set = (id, v, txt) => { const r = $(id); r.value = v; paintRange(r); $(id + "Out").textContent = txt; };
  set("ratio", S.ratio, S.ratio.toFixed(2).replace(/0$/, ""));
  set("peri", S.peri, S.peri + " kpc" + (S.peri === 0 ? " (head-on)" : ""));
  set("incA", S.incA, S.incA + "°"); set("incB", S.incB, S.incB + "°");
  for (const [id, s] of [["spinA", S.spinA], ["spinB", S.spinB]]) $(id).querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.spin === s ? "true" : "false"));
}

let rebuildTimer = 0;
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  $("loading").classList.remove("done"); $("loadMsg").textContent = "Recomputing the orbit…";
  rebuildTimer = setTimeout(() => {
    build();
    if (S.view !== "sky") setView(S.view, false);
    $("loading").classList.add("done");
  }, 260);
}

function bindUI() {
  $("presets").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-preset]"); if (!b) return;
    applyPresetUI(b.dataset.preset);
    clearTimeout(rebuildTimer);
    $("loading").classList.remove("done"); $("loadMsg").textContent = "Placing stars on the graphics card…";
    setTimeout(() => { build(); setView(S.view === "sky" && PRESETS[S.preset].A.sun ? "sky" : (PRESETS[S.preset].startView || "overview"), true); $("loading").classList.add("done"); S.playing = !REDUCE; syncPlay(); }, 30);
  });
  const slider = (id, key, fmt) => $(id).addEventListener("input", (e) => { S[key] = +e.target.value; $(id + "Out").textContent = fmt(S[key]); scheduleRebuild(); });
  slider("ratio", "ratio", v => v.toFixed(2).replace(/0$/, ""));
  slider("peri", "peri", v => v + " kpc" + (v === 0 ? " (head-on)" : ""));
  slider("incA", "incA", v => v + "°");
  slider("incB", "incB", v => v + "°");
  $("periQuick").addEventListener("click", (e) => { const b = e.target.closest("[data-peri]"); if (!b) return; S.peri = +b.dataset.peri; syncSliders(); scheduleRebuild(); });
  for (const [id, key] of [["spinA", "spinA"], ["spinB", "spinB"]]) {
    $(id).addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; S[key] = +b.dataset.spin; syncSliders(); scheduleRebuild(); });
  }
  $("count").addEventListener("input", (e) => { N = COUNTS[+e.target.value]; syncCount(); scheduleRebuild(); });
  $("optArms").addEventListener("change", (e) => { S.arms = e.target.checked; });
  $("optDust").addEventListener("change", (e) => { S.dust = e.target.checked; });
  $("optTail").addEventListener("change", (e) => { S.tail = e.target.checked; });
  $("optPaths").addEventListener("change", (e) => { S.paths = e.target.checked; });
  $("optLabels").addEventListener("change", (e) => { S.labels = e.target.checked; });
  $("optDrift").addEventListener("change", (e) => { S.drift = e.target.checked; });
  $("exposure").addEventListener("input", (e) => { S.exposure = +e.target.value; $("exposureOut").textContent = S.exposure.toFixed(2).replace(/0$/, "") + "×"; });
  $("warp").addEventListener("input", (e) => { S.warp = +e.target.value; syncWarp(); });
  $("play").addEventListener("click", () => { S.playing = !S.playing; if (S.step >= S.scn.cores.nSteps) { sim.load(S.stars.pos, S.stars.vel); S.step = 0; } syncPlay(); });
  $("reset").addEventListener("click", () => { sim.load(S.stars.pos, S.stars.vel); S.step = 0; S.target = -1; S.sunValid = false; setView(S.view, false); });
  $("views").addEventListener("click", (e) => { const b = e.target.closest("button[data-view]"); if (b) setView(b.dataset.view); });
  $("skyBtn").addEventListener("click", () => setView(S.view === "sky" ? "overview" : "sky"));
  $("jumps").addEventListener("click", (e) => {
    const b = e.target.closest("[data-jump]"); if (!b) return;
    const c = S.scn.cores, j = b.dataset.jump;
    let g = parseFloat(j);
    if (j === "peri") g = (c.tPeri ?? 0) / GYR;
    else if (j === "peri+0.5") g = (c.tPeri ?? 0) / GYR + 0.5;
    else if (j === "merge") g = c.tMerge != null ? c.tMerge / GYR + 0.3 : 9.5;
    seekGyr(g); setView("sky"); S.playing = false; syncPlay();
  });
  // tabs
  document.querySelectorAll(".gx-tabs button").forEach(b => b.addEventListener("click", () => {
    document.querySelectorAll(".gx-tabs button").forEach(x => { x.setAttribute("aria-pressed", x === b ? "true" : "false"); x.setAttribute("aria-selected", x === b ? "true" : "false"); });
    document.querySelectorAll(".gx-tab").forEach(s => { s.hidden = s.dataset.panel !== b.dataset.tab; });
    $("panel").scrollTop = 0;
  }));
  // keyboard
  addEventListener("keydown", (e) => {
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    if (e.key === " ") { e.preventDefault(); $("play").click(); }
    else if (e.key === "r" || e.key === "R") $("reset").click();
    else if ("12345".includes(e.key) && e.key.length === 1) {
      const v = ["overview", "a", "b", "edge", "sky"][+e.key - 1];
      if (v !== "sky" || PRESETS[S.preset].A.sun) setView(v);
    } else if (e.key === "]" || e.key === "[") { S.warp = Math.max(0, Math.min(1, S.warp + (e.key === "]" ? 0.08 : -0.08))); $("warp").value = S.warp; paintRange($("warp")); syncWarp(); }
  });
  collisionCalc();
  $("cN").addEventListener("input", collisionCalc); $("cV").addEventListener("input", collisionCalc);
}

/* ----- "why stars don't collide" calculator ----- */
function collisionCalc() {
  const PC_M = 3.0856775814913673e16, RSUN = 6.957e8, GMSUN = 1.3271244e20;   // IAU 2015 nominal values
  const n = Math.pow(10, +$("cN").value);                      // stars per pc³
  const v = +$("cV").value * 1000;                             // m/s
  $("cNOut").textContent = (n < 1 ? n.toPrecision(2) : n.toFixed(1)) + " per pc³";
  $("cVOut").textContent = $("cV").value + " km/s";
  const d = Math.pow(n, -1 / 3);                               // pc
  const ratio = d * PC_M / (2 * RSUN);
  const vesc2 = 2 * GMSUN * 2 / (2 * RSUN);                    // two Suns touching
  const sigma = Math.PI * Math.pow(2 * RSUN / PC_M, 2) * (1 + vesc2 / (v * v));   // pc²
  const hits = 1e11 * n * sigma * 1000;                        // path length 1 kpc
  $("cSep").innerHTML = d.toFixed(2) + "<small>pc = " + (d * 3.26156).toFixed(1) + " ly</small>";
  $("cRatio").innerHTML = (ratio / 1e6).toFixed(0) + "<small>million ×</small>";
  $("cSand").innerHTML = (ratio * 1e-3 / 1000).toFixed(0) + "<small>km between grains</small>";
  $("cHits").innerHTML = (hits < 0.1 ? hits.toFixed(3) : hits.toFixed(1)) + "<small>collisions out of 100 000 000 000 stars</small>";
}

/* ----- sources and real pairs from data/galaxies.json ----- */
async function loadData() {
  try {
    const d = await (await fetch("data/galaxies.json")).json();
    $("sources").innerHTML = d.sources.map(s => `<li><a href="${s.url}" rel="noopener">${s.cite}</a><span>${s.used}</span></li>`).join("");
    $("pairs").innerHTML = d.pairs.map(p => `
      <article class="card gx-pair">
        <div class="gx-pair-h"><h3>${p.name}</h3><span class="chip">${p.ids}</span></div>
        <p class="gx-dist">${p.distance}</p>
        <p>${p.what}</p>
        <div class="gx-links">${p.links.map(l => `<a href="${l.url}" rel="noopener">${l.label} ↗</a>`).join("")}</div>
        ${p.preset ? `<button class="btn small" data-load="${p.preset}">Run the ${PRESETS[p.preset] ? p.name.replace(/^The /, "") : ""} preset</button>` : ""}
      </article>`).join("");
    $("pairs").addEventListener("click", (e) => {
      const b = e.target.closest("[data-load]"); if (!b) return;
      document.querySelector(`#presets button[data-preset="${b.dataset.load}"]`).click();
      document.querySelector('.gx-tabs button[data-tab="controls"]').click();
    });
  } catch (e) {
    $("sources").innerHTML = '<li>Toomre &amp; Toomre 1972, ApJ 178, 623 · van der Marel et al. 2012, ApJ 753, 9 · van der Marel et al. 2019, ApJ 872, 24 · Sawala et al. 2025, Nature Astronomy 9, 1206. (Full list in data/galaxies.json.)</li>';
    $("pairs").innerHTML = '<p class="muted">Open this page through a web server to load the gallery of real galaxy pairs.</p>';
  }
}
function renderTeX() {
  if (!window.katex) return;
  document.querySelectorAll(".gx-eq[data-tex]").forEach(el => { try { katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false }); } catch (e) { el.textContent = el.dataset.tex; } });
}

/* ============================================================================================ main loop */
let last = performance.now(), acc = 0, rafId = 0;
function frame(now) {
  rafId = requestAnimationFrame(frame);
  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;   // rAF time can predate `last`
  if (document.hidden) return;
  S.frames++;
  if (now - S.fpsT > 700) { S.fps = S.frames * 1000 / (now - S.fpsT); S.frames = 0; S.fpsT = now; }
  const stepMyr = S.scn.setup.dt * P.T_MYR;
  if (S.target >= 0) {
    // fast-forward toward the target in bursts sized to the GPU's speed
    const burst = SOFTWARE ? 12 : Math.max(40, Math.min(400, Math.round(160 * 60 / Math.max(S.fps, 10))));
    const n = Math.min(burst, S.target - S.step);
    if (n > 0) advance(n);
    if (S.step >= S.target) { S.target = -1; }
    $("loading").classList.toggle("done", S.target < 0 || S.target - S.step < burst * 3);
  } else if (S.playing) {
    acc += warpMyrPerSec() * dt / stepMyr;
    let n = Math.floor(acc); acc -= n;
    const cap = SOFTWARE ? 6 : S.fps < 30 ? 24 : S.fps < 45 ? 48 : 90;   // keep the frame rate up on slower GPUs
    if (n > cap) { n = cap; acc = 0; }
    advance(n);
  }
  updateCamera(dt, now);
  controls.update();
  render();
  if (S.frames % 3 === 0 || S.target >= 0) updateReadouts();
}
document.addEventListener("visibilitychange", () => { last = performance.now(); });

/* ============================================================================================ boot */
applyPresetUI(S.preset);
syncCount(); syncWarp(); syncPlay();
$("optDust").checked = S.dust; $("optDrift").checked = S.drift;
bindUI();
renderTeX();
loadData();
// Phones: start with the control sheet folded so the galaxies get the screen.
if (matchMedia("(max-width: 820px)").matches) {
  $("panel").classList.add("collapsed");
  const hc = $("panel").querySelector(".hud-collapse"); if (hc) hc.textContent = "▲ CONTROLS";
}
$("panel").querySelector(".hud-collapse")?.addEventListener("click", () => setTimeout(() => { frameOffset(); drawTimeline(); }, 320));
// Let the page paint its loader first; building a quarter of a million stars takes a moment.
function boot() {
  resize();
  build();
  setView(Q.get("view") && ["overview", "a", "b", "edge", "sky"].includes(Q.get("view")) ? Q.get("view") : (PRESETS[S.preset].startView || "overview"), true);
  if (Q.has("t")) { advance(stepOfGyr(+Q.get("t"))); setView(S.view, true); }
  resize();
  render(); updateReadouts();
  $("loading").classList.add("done");
  if (REDUCE && !STILL) $("phaseTxt").textContent = "Paused (reduced motion) · press play";
  window.__sim.ready = true;
  rafId = requestAnimationFrame(frame);
}
setTimeout(boot, 30);

/* Deterministic test hook: advance n leapfrog steps synchronously, then redraw. */
window.__sim = {
  ready: false,
  step(n = 1) { advance(n); setView(S.view, true); render(); updateReadouts(); return { step: S.step, gyr: +tGyr().toFixed(3) }; },
  seek(g) { const k = stepOfGyr(g); if (k < S.step) { sim.load(S.stars.pos, S.stars.vel); S.step = 0; } advance(k - S.step); setView(S.view, true); render(); updateReadouts(); return +tGyr().toFixed(3); },
  view(v) { setView(v, true); render(); return v; },
  preset(p) { applyPresetUI(p); build(); setView(PRESETS[p].startView || "overview", true); render(); updateReadouts(); return p; },
  pause() { S.playing = false; syncPlay(); },
  set(k, v) { S[k] = v; render(); return S[k]; },
  // look at galaxy A from a direction given in its own disk frame (e.g. edge-on: [1, 0.05, 0])
  lookA(lx, ly, lz, dist = 40) {
    const b = S.stars.basisA; coresNow();
    const d = new V3().fromArray(b.ex).multiplyScalar(lx).addScaledVector(new V3().fromArray(b.ey), ly).addScaledVector(new V3().fromArray(b.ez), lz).normalize();
    S.userAt = performance.now() + 1e9; controls.target.copy(cA); camera.position.copy(cA).addScaledVector(d, dist); render(); return "ok";
  },
  state() { const c = S.scn.cores; return { N, step: S.step, gyr: tGyr(), sep: sep(), tPeri: c.tPeri / GYR, rPeri: c.rPeri, tMerge: c.tMerge && c.tMerge / GYR, sun: S.sun.slice(), software: SOFTWARE, gl: glInfo }; },
};
