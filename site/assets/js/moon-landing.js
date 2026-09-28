/* Cosmic Library · Moon landing — Apollo 11 Lunar Module "Eagle", powered descent
 *
 * Physics: moon-physics.js (2-D descent, Apollo-style guidance, DPS throttle band).
 * Terrain: moon-terrain.js (one crater height function in GLSL and JS).
 * Model:   moon-lm.js (procedural LM with foil, legs, probes, RCS quads).
 *
 * Scene frame: the local tangent frame under the LM (+x downrange = west,
 * +y up, +z cross range), with a floating origin O along x so float32 stays
 * precise 480 km from the site; the terrain drops by d²/2R around the LM's
 * ground point so the horizon curves correctly.
 *
 * Sun and Earth directions at Tranquility Base (0.67° N, 23.47° E):
 *   Sun: elevation 10.9° in the east at the planned landing time (Bennett,
 *        NASA TN D-6846) — behind the westbound LM.
 *   Earth: the sub-Earth point is near 0° N 0° E, so from 23.5° E the Earth
 *        stands ≈66.5° high in the west (libration ignored).
 *   Both are rotated by the LM's angle around the Moon (x / R), so at PDI,
 *   15.9° further east, the Sun is ≈27° high and the Earth ≈51°.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Descent, nominal, LM, DPS, FT, NMI, DEG, G_SURF, TARGETS, GEAR, EAGLE_TOUCHDOWN, R_MOON, ROD_STEP, P64_TO_P65_H } from './moon-physics.js';
import { createTerrain, groundAt, makeBoulders, bakeBoulderShadows, rockGeometries, curveMaterial, SITE, ORIGIN_STEP } from './moon-terrain.js';
import { buildLM, createPuffs } from './moon-lm.js';

// Let the page finish loading before the heavy set-up (procedural textures, rocks, shaders).
await new Promise(r => setTimeout(r, 30));

const Codex = window.Codex || { fmt: (v, d) => (+v).toFixed(d ?? 2), webgl: () => true, reducedMotion: false };
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const fmt = (v, d = 0) => Codex.fmt(Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v, d);
const params = new URLSearchParams(location.search);

/* ================================================================== quality */
const QUALITY = {
  low: { pr: 0.6, rings: 170, segs: 128, shadow: 0, bloom: false, boulders: true },
  high: { pr: 1.0, rings: 300, segs: 256, shadow: 1024, bloom: true, boulders: true },
  ultra: { pr: 1.6, rings: 420, segs: 384, shadow: 2048, bloom: true, boulders: true }
};
let qName = params.get('q') || (() => { try { return localStorage.getItem('cx-moon-q'); } catch (e) { return null; } })() || (matchMedia('(max-width: 820px)').matches ? 'low' : 'high');
if (!QUALITY[qName]) qName = 'high';
let Q = QUALITY[qName];

/* ================================================================== directions */
const SUN_EL = 10.9 * DEG;                                  // planned sun elevation [TN D-6846]
const SUN_SITE = new THREE.Vector3(-Math.cos(SUN_EL), Math.sin(SUN_EL), 0.06).normalize(); // east, slightly off-track
const EARTH_EL = 66.5 * DEG;
const EARTH_SITE = new THREE.Vector3(Math.cos(EARTH_EL), Math.sin(EARTH_EL), -0.08).normalize(); // west, high
function toLocal(vSite, x, out) {                           // rotate a site-frame direction into the LM's tangent frame
  const phi = x / R_MOON, c = Math.cos(phi), s = Math.sin(phi);
  return out.set(vSite.x * c - vSite.y * s, vSite.x * s + vSite.y * c, vSite.z);
}
const sunL = new THREE.Vector3(), earthL = new THREE.Vector3();

/* ================================================================== renderer */
if (!Codex.webgl()) { Codex.noGL && Codex.noGL(); throw new Error('WebGL unavailable'); }
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
const pixelRatio = () => Math.min(2, Math.min(devicePixelRatio, 2) * Q.pr);
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', stage.getAttribute('aria-label'));
renderer.domElement.setAttribute('role', 'img');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 2.0e6);
camera.position.set(-30, 14880, 12);

/* environment for the metallic foil: black sky, sunlit grey ground, the Sun */
function makeEnv() {
  const envScene = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: SUN_SITE.clone() } },
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vD;
      void main(){
        vec3 d = normalize(vD);
        float g = smoothstep(0.02, -0.08, d.y);
        vec3 ground = vec3(0.36, 0.34, 0.31) * (0.55 + 0.45 * smoothstep(0.0, -0.6, d.y));
        vec3 c = mix(vec3(0.0), ground, g);
        float s = max(dot(d, uSun), 0.0);
        c += vec3(1.0, 0.96, 0.9) * (pow(s, 900.0) * 14.0 + pow(s, 40.0) * 0.25);
        gl_FragColor = vec4(c, 1.0);
      }`
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), m));
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(envScene, 0.0);
  pm.dispose();
  return rt.texture;
}
const envMap = makeEnv();

/* ================================================================== lights (for the LM and rocks) */
const sun = new THREE.DirectionalLight(0xfff6ea, 3.6);
scene.add(sun, sun.target);
sun.shadow.mapSize.set(Q.shadow || 512, Q.shadow || 512);
sun.shadow.camera.left = -7; sun.shadow.camera.right = 7; sun.shadow.camera.top = 7; sun.shadow.camera.bottom = -7;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 60;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
sun.castShadow = Q.shadow > 0;
// light scattered up from the bright regolith (lights the LM's underside)
const bounce = new THREE.HemisphereLight(0x000000, 0x6d665c, 0.9);
scene.add(bounce);

/* ================================================================== terrain + rocks */
const boulders = makeBoulders();
const bShadow = bakeBoulderShadows(boulders.list, SUN_SITE);
let terrain = createTerrain({ rings: Q.rings, segs: Q.segs, boulderTex: bShadow.tex, boulderRegion: bShadow.region });
scene.add(terrain.mesh);
const curveU = { value: terrain.uniforms.uCurve.value };

const siteGroup = new THREE.Group();          // everything fixed in the site frame (moved by the floating origin)
scene.add(siteGroup);
const rockMat = curveMaterial(new THREE.MeshStandardMaterial({ color: 0x8f877c, roughness: 0.92, metalness: 0.0, flatShading: false }), curveU);
// rocks: big ones (≥ 0.2 m) always near the site; small ones only when the camera is low
const rockSmall = [];
{
  const geos = rockGeometries();
  const lowGeo = new THREE.IcosahedronGeometry(1, 0);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
  const sets = [[], [], [], []];
  boulders.list.forEach(b => sets[b.s >= 0.2 ? b.k : 3].push(b));
  sets.forEach((arr, k) => {
    if (!arr.length) return;
    const im = new THREE.InstancedMesh(k < 3 ? geos[k] : lowGeo, rockMat, arr.length);
    arr.forEach((b, i) => {
      e.set((b.rot * 7 % 1 - 0.5) * 0.4, b.rot, (b.rot * 13 % 1 - 0.5) * 0.4);
      q.setFromEuler(e);
      s.set(b.s, b.h, b.s * (0.8 + (b.rot * 3 % 1) * 0.4));
      p.set(b.x, b.g + 0.12 * b.h, b.z);
      m4.compose(p, q, s);
      im.setMatrixAt(i, m4);
      const c = 0.85 + (b.rot * 17 % 1) * 0.3;
      im.setColorAt(i, new THREE.Color(c, c * 0.97, c * 0.93));
    });
    im.frustumCulled = false;
    siteGroup.add(im);
    if (k === 3) rockSmall.push(im);
  });
}

/* ================================================================== the Lunar Module */
const lm = buildLM({ envMap, quality: qName });
const pivot = new THREE.Group();              // at the centre of mass; rotation = pitch ∘ yaw
lm.model.position.y = -LM.cgHeight;
pivot.add(lm.model);
scene.add(pivot);
lm.model.traverse(o => { if (o.isMesh) { o.castShadow = Q.shadow > 0; o.receiveShadow = Q.shadow > 0; } });
const puffs = createPuffs(96);
scene.add(puffs.points);

/* dust sheet blown radially by the descent engine */
const dustMat = new THREE.ShaderMaterial({
  uniforms: { uT: { value: 0 }, uI: { value: 0 }, uR: { value: 1 }, uW: { value: 40 }, uLift: { value: 0.035 }, uSun: { value: new THREE.Vector3() }, uCam: { value: new THREE.Vector3() } },
  vertexShader: `varying vec2 vP; varying vec3 vW; uniform float uLift;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main(){ vP = position.xy; vec3 p = position; p.z += length(p.xy) * uLift; vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `uniform float uT, uI, uR, uW; uniform vec3 uSun, uCam; varying vec2 vP; varying vec3 vW;
    #include <logdepthbuf_pars_fragment>
    float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
    void main(){
      #include <logdepthbuf_fragment>
      float r = length(vP);
      float a = atan(vP.y, vP.x);
      float rr = r / uR;
      // radial streaks racing outward (the dust flew out at hundreds of m/s, nearly parallel to the ground)
      float rw = r * uW;
      float s1 = n2(vec2(a * 46.0, rw * 0.05 - uT * 5.0));
      float s2 = n2(vec2(a * 140.0 + 3.0, rw * 0.11 - uT * 9.0));
      float streak = 0.45 * s1 + 0.55 * s2;
      float body = smoothstep(0.0, 0.06, rr) * (1.0 - smoothstep(0.35, 1.0, rr));
      float alpha = uI * body * (0.25 + 0.95 * streak * streak);
      vec3 v = normalize(uCam - vW);
      float fwd = pow(max(dot(-v, uSun), 0.0), 6.0);
      vec3 col = vec3(0.62, 0.58, 0.53) * (0.7 + 1.6 * fwd);
      gl_FragColor = vec4(col * alpha, alpha);
    }`,
  transparent: true, depthWrite: false, blending: THREE.NormalBlending, premultipliedAlpha: true
});
// two thin sheets leaving the ground at ≈2° and ≈5°: the dust flew out almost flat
const dust = new THREE.Group();
for (const lift of [0.035, 0.09]) {
  const m = dustMat.clone(); m.uniforms = THREE.UniformsUtils.clone(dustMat.uniforms); m.uniforms.uLift.value = lift;
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 128, 0, Math.PI * 2), m);
  mesh.rotation.x = -Math.PI / 2; mesh.frustumCulled = false; mesh.renderOrder = 2;
  dust.add(mesh);
}
const dustMats = dust.children.map(c => c.material);
scene.add(dust);

/* Earth: procedural globe lit by the Sun (angular diameter 1.9° from the Moon) */
const EARTH_D = 300000, EARTH_R = EARTH_D * Math.tan(0.95 * DEG);
const earthMat = new THREE.ShaderMaterial({
  uniforms: { uSun: { value: new THREE.Vector3() } },
  vertexShader: `varying vec3 vN, vO; varying vec3 vV;
    #include <common>
    #include <logdepthbuf_pars_vertex>
    void main(){ vO = normalize(position); vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix * viewMatrix * w;
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `uniform vec3 uSun; varying vec3 vN, vO, vV;
    #include <logdepthbuf_pars_fragment>
    float h3(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
    float n3(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
      return mix(mix(mix(h3(i), h3(i+vec3(1,0,0)), f.x), mix(h3(i+vec3(0,1,0)), h3(i+vec3(1,1,0)), f.x), f.y),
                 mix(mix(h3(i+vec3(0,0,1)), h3(i+vec3(1,0,1)), f.x), mix(h3(i+vec3(0,1,1)), h3(i+vec3(1,1,1)), f.x), f.y), f.z); }
    float fbm(vec3 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n3(p); p *= 2.07; a *= 0.5; } return s; }
    void main(){
      #include <logdepthbuf_fragment>
      vec3 o = vO;
      float land = smoothstep(0.54, 0.585, fbm(o * 2.1 + vec3(3.1, 1.7, 0.4)));
      float dry = fbm(o * 4.0 + 7.0);
      vec3 landC = mix(vec3(0.10, 0.16, 0.06), vec3(0.42, 0.33, 0.18), smoothstep(0.45, 0.62, dry));
      vec3 col = mix(vec3(0.015, 0.05, 0.16), landC, land);
      col = mix(col, vec3(0.95), smoothstep(0.78, 0.9, abs(o.y)));
      float cl = smoothstep(0.5, 0.72, fbm(o * 5.0 + vec3(0.0, 9.0, 2.0)) * 0.7 + fbm(o * 13.0) * 0.4);
      col = mix(col, vec3(1.0), cl * 0.92);
      vec3 n = normalize(vN);
      float d = dot(n, uSun);
      float lit = smoothstep(-0.05, 0.25, d);
      float rim = pow(1.0 - max(dot(n, vV), 0.0), 3.0);
      vec3 c = col * lit * 1.35 + vec3(0.25, 0.5, 1.0) * rim * smoothstep(-0.2, 0.3, d) * 0.8;
      gl_FragColor = vec4(c, 1.0);
    }`
});
const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 64, 32), earthMat);
earth.frustumCulled = false;
scene.add(earth);

/* the Sun: a small disc with a glare halo */
function glowTex(stops) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex([[0, 'rgba(255,255,255,1)'], [0.06, 'rgba(255,252,240,1)'], [0.1, 'rgba(255,240,210,.5)'], [0.3, 'rgba(255,220,170,.08)'], [1, 'rgba(0,0,0,0)']]), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, color: new THREE.Color(3, 3, 3) }));
scene.add(sunSprite);

/* ================================================================== post-processing */
let composer, bloom;
function setupComposer() {
  // multisampled target: the composer bypasses the canvas's own antialiasing
  const rt = new THREE.WebGLRenderTarget(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio(), { type: THREE.HalfFloatType, samples: qName === 'low' ? 0 : 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.14, 0.35, 1.2);
  bloom.enabled = Q.bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
}
setupComposer();
const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false; controls.enableDamping = true; controls.minDistance = 8; controls.maxDistance = 400;

/* ================================================================== simulation */
// Terrain under the LM for the physics. High up, craters smaller than a few percent of
// the altitude are skipped (they cannot change the altitude reading); boulders count near the site.
const physGround = (x, z, h) => {
  const minS = h == null ? 0 : h > 6000 ? 1280 : h > 800 ? 320 : h > 120 ? 20 : 0;
  const t = groundAt(x, z, minS);
  if (Math.abs(x - 150) > 1500 || minS > 20) return t;
  return Math.max(t, boulders.boulderTop(x, z));
};
const NOM = nominal({}, 1);                                  // the automatic descent from PDI over a smooth Moon (plot, High Gate)
const NOM_T = { hg: NOM.at('p64'), lg: NOM.at('lowgate'), td: NOM.sim.t };

let sim, scenario = params.get('start') || 'pdi', who = params.get('mode') === 'watch' ? 'watch' : 'fly';
if (!['pdi', 'high', 'low'].includes(scenario)) scenario = 'pdi';
let running = false, paused = false, warp = 1, started = false;
let history = [], histT = -1, O = 0, resultShown = false, resultTimer = 0, landedAt = null;
const shownEvents = new Set();

function makeSim(s) {
  let d;
  if (s === 'pdi') d = new Descent({ ground: physGround });
  else if (s === 'high') {
    d = new Descent({ ground: physGround });
    d.runTo(NOM_T.hg - 1.5);
  } else {
    // Apollo 11 at 102:43:26: "400 feet, down at 9, 58 forward" [ALSJ]; propellant from
    // Aldrin's "Eight percent" 34 s later plus ≈4 kg/s of burn (estimate).
    const x = -120;
    d = new Descent({ ground: physGround, mode: 'P66', x, h: 400 * FT + LM.cgHeight + groundAt(x, 0), vx: 58 * FT, vh: -9 * FT, theta: 5 * DEG, m: LM.dry + 800, prop: 800, t: 621, auto: false });
    d.flags.ignition = d.flags.ftp = d.flags.throttledown = d.flags.p64 = d.flags.lowgate = true;
    d.rodCmd = -9 * FT;
  }
  return d;
}
function resetRun() {
  sim = makeSim(scenario);
  history = []; histT = -1; shownEvents.clear();
  sim.events.forEach(e => shownEvents.add(e.id + e.t));
  resultShown = false; resultTimer = 0; landedAt = null; firedCalls.clear();
  $('result').hidden = true; document.body.classList.remove('ml-result-open');
  $('log').innerHTML = ''; $('callouts').innerHTML = '';
  alarmState.active = null; $('alarm').hidden = true; alarmState.done.clear();
  if (scenario === 'low') { sim.mode = 'P66'; sim.auto = false; sim.armstrong = who === 'watch'; if (who === 'watch') sim.takeOver(true); else sim.takeOver(false); sim.rodCmd = -9 * FT; }
  camState.init = false;
  updateVisuals(0);
  updateHUD(true);
}

/* ================================================================== call-outs */
// Real Apollo 11 lines tied to moments in this flight (ALSJ / Mission Report, public domain).
const REAL = [
  { id: 'long', t: 193, who: 'Armstrong', text: 'Our position checks down range show us to be a little long.', get: '102:36:18', only: 'pdi' },
  { id: 'roll', t: 221, who: 'Armstrong', text: 'Rolling over.', get: '102:36:46', only: 'pdi' },
  { id: 'goCont', t: 257, who: 'Duke', text: 'You are Go to continue powered descent.', get: '102:37:22', capcom: true, only: 'pdi' },
  { id: 'thdn', ev: 'throttledown', who: 'Armstrong', text: 'Throttle down on time.', get: '102:39:35' },
  { id: 'p64', ev: 'p64', who: 'Armstrong', text: 'P64.', get: '102:41:35' },
  { id: 'goLand', evDelay: ['p64', 33], who: 'Duke', text: "You're Go for landing. Over.", get: '102:42:08', capcom: true },
  { id: 'rocky', ev: 'p66arm', who: 'Armstrong', text: 'Pretty rocky area.', get: '102:43:10' },
  { id: 'fuel', altFt: 270, who: 'Armstrong', text: "Okay, how's the fuel?", get: '102:43:58', lowOnly: true },
  { id: 'shadow', altFt: 250, who: 'Aldrin', text: 'I got the shadow out there.', get: '102:44:04' },
  { id: 'qty', ev: 'lowlevel', who: 'Aldrin', text: 'Quantity light.', get: '≈102:44:45' },
  { id: 'b60', ev: 'bingo60', who: 'Duke', text: '60 seconds.', get: '≈102:45:02', capcom: true },
  { id: 'b30', ev: 'bingo30', who: 'Duke', text: '30 seconds.', get: '≈102:45:31', capcom: true },
  { id: 'contact', ev: 'contact', who: 'Aldrin', text: 'Contact Light.', get: '102:45:40' },
];
const firedCalls = new Set();
const ALT_CALLS = [2000, 1000, 750, 540, 400, 350, 300, 200, 160, 100, 75, 60, 50, 40, 30, 20, 10];
let lastAltCall = Infinity, dustCalled = false;

function sayNum(v) { const a = Math.abs(v); const r = Math.round(a * 2) / 2; return (r % 1 ? (Math.floor(r) ? Math.floor(r) + ' 1/2' : '1/2') : String(r)); }
function callout(who, text, cls = '', tag = '') {
  if (!$('calls').checked && cls !== 'sys' && cls !== 'warn') return;
  const box = $('callouts');
  const el = document.createElement('div');
  el.className = 'ml-co ' + cls;
  const body = cls.includes('sys') ? `<span class="txt">${text}</span>` : `<q>${text}</q>`;
  el.innerHTML = `<span class="who">${who}</span>${body}${tag ? `<span class="tag">${tag}</span>` : ''}`;
  box.appendChild(el);
  while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => el.classList.add('out'), 5200);
  setTimeout(() => el.remove(), 6300);
  logLine(cls.includes('sys') ? `<b>${who}:</b> ${text}` : `<b>${who}:</b> “${text}”`, cls === 'capcom' ? 'capcom' : cls.includes('warn') ? 'warn' : 'crew', tag);
  if (cls === 'capcom') audio.quindar();
}
function logLine(html, cls = '', real = '') {
  const li = document.createElement('li');
  li.className = cls + ' new';
  li.innerHTML = `<time>${getStr(sim.t)}${real ? `<span class="real">${real}</span>` : ''}</time>${html}`;
  const log = $('log');
  log.prepend(li);
  while (log.children.length > 80) log.removeChild(log.lastChild);
}
function checkCallouts() {
  const d = sim.d, t = sim.t;
  for (const c of REAL) {
    if (firedCalls.has(c.id)) continue;
    let go = false;
    if (c.t != null) go = scenario === 'pdi' && t >= c.t && t < c.t + 5;
    else if (c.ev) go = !!sim.flags[c.ev === 'p66arm' ? 'p66' : c.ev] && (c.ev !== 'p66arm' || sim.armstrong);
    else if (c.evDelay) { const e = sim.events.find(x => x.id === c.evDelay[0]); go = e && t >= e.t + c.evDelay[1] && t < e.t + c.evDelay[1] + 5 && !sim.touchdown; }
    else if (c.altFt) go = d.alt / FT < c.altFt && d.alt / FT > c.altFt - 60 && !sim.touchdown && (sim.mode === 'P66' || sim.mode === 'P65' || sim.mode === 'P64') && (!c.lowOnly || sim.lowLevel || d.propPct < 12);
    if (c.ev && sim.flags[c.ev === 'p66arm' ? 'p66' : c.ev]) {
      const e = sim.events.find(x => x.id === (c.ev === 'p66arm' ? 'p66' : c.ev));
      if (e && t - e.t > 6) { firedCalls.add(c.id); continue; }   // happened before this start
    }
    if (go) { firedCalls.add(c.id); callout(c.who, c.text, c.capcom ? 'capcom' : '', 'Apollo 11 · ' + c.get); }
  }
  // Aldrin-style altitude call-outs from this flight's own numbers
  if (!sim.touchdown && (sim.mode === 'P64' || sim.mode === 'P65' || sim.mode === 'P66')) {
    const aft = d.alt / FT;
    for (const a of ALT_CALLS) {
      if (aft < a && lastAltCall > a && aft > a - 40) {
        lastAltCall = a;
        const down = -d.vh / FT, fwd = d.vx / FT;
        let s = `${a} feet, down ${sayNum(down)}`;
        if (Math.abs(fwd) >= 1) s += `, ${Math.round(Math.abs(fwd))} ${fwd >= 0 ? 'forward' : 'back'}`;
        if (a <= 100 && d.propPct < 12) s += `. ${Math.round(d.propPct)} percent`;
        callout('Call-out', s + '.', '', 'your numbers, Aldrin\'s style');
        break;
      }
    }
    if (!dustCalled && d.alt < 13 && d.thrust > 0) { dustCalled = true; callout('Aldrin', 'Picking up some dust.', '', 'Apollo 11 · ≈102:45:11'); }
  }
}

/* ================================================================== program alarms (optional) */
const alarmState = { active: null, until: 0, done: new Set() };
const ALARMS = [
  { code: 1202, t: 321, go: 348, get: '102:38:26', text: 'Executive overflow: the computer ran out of <i>core sets</i> for new jobs. The rendezvous radar interface, powered by a mis-phased supply, was stealing about 13 % of the computer\'s time. The Executive restarted, shed low-priority work and kept flying the landing. In Houston, Jack Garman confirmed it was safe; Steve Bales called "Go".' },
  { code: 1201, t: 554, go: 560, get: '102:42:19', text: 'The same overload in another form: no free <i>Vector Accumulator (VAC)</i> areas. By now Mission Control knew it: "We\'re Go. Same type. We\'re Go." Guidance never stopped.' }
];
function checkAlarms() {
  if (!$('alarms').checked || scenario === 'low') return;
  for (const a of ALARMS) {
    if (alarmState.done.has(a.code)) continue;
    if (sim.t >= a.t && sim.t < a.t + 4 && !sim.touchdown) {
      alarmState.done.add(a.code);
      alarmState.active = a; alarmState.until = sim.t + 5;
      $('alarmCode').textContent = a.code;
      $('alarmText').innerHTML = a.text;
      $('alarm').hidden = false;
      callout(a.code === 1202 ? 'Armstrong' : 'Aldrin', a.code === 1202 ? "Program Alarm. It's a 1202." : 'Program Alarm. 1201.', 'warn', 'Apollo 11 · ' + a.get);
      audio.alarm();
      setTimeout(() => { if (alarmState.active === a) callout('Duke', a.code === 1202 ? "We're Go on that alarm." : "We're Go. Same type. We're Go.", 'capcom', 'Apollo 11'); }, Math.max(1500, (a.go - a.t) * 1000 / Math.max(1, warp)));
      setTimeout(() => { if (alarmState.active === a) $('alarm').hidden = true; }, 16000);
    }
  }
  if (alarmState.active && sim.t > alarmState.until) alarmState.active = null;
}
$('alarmGo').addEventListener('click', () => { $('alarm').hidden = true; });

/* ================================================================== events → UI */
function processEvents() {
  for (const e of sim.events) {
    const key = e.id + e.t;
    if (shownEvents.has(key)) continue;
    shownEvents.add(key);
    const warn = ['lowlevel', 'bingo60', 'bingo30', 'bingo', 'depleted'].includes(e.id);
    logLine(`<b>${e.text}</b>`, warn ? 'warn' : '');
    if (e.id === 'p64') { if (warp > 2) setWarp(2); if (camMode === 'auto') camState.init = false; }
    if (e.id === 'lowgate') { setWarp(1); if (who === 'fly' && sim.mode === 'P64') callout('Computer', 'Low Gate. Press P (or Take over) to fly P66 yourself.', 'sys'); }
    if (e.id === 'bingo') { callout('Flight rule', 'Bingo: land within 20 seconds or abort.', 'sys warn'); audio.alarm(); }
    if (e.id === 'depleted') callout('Eagle', 'Descent propellant depleted: the engine has stopped.', 'sys warn');
    if (e.id === 'touchdown') onTouchdown();
    if (e.id === 'p66' && sim.armstrong) callout('Eagle', 'P66: Armstrong takes semi-manual control to fly past the boulder field.', 'sys', 'Apollo 11 · 102:43:22');
  }
}

function onTouchdown() {
  landedAt = performance.now();
  const td = sim.touchdown;
  callout('Armstrong', 'Shutdown.', '', 'Apollo 11 · ≈102:45:43');
  setTimeout(() => callout('Aldrin', 'Okay. Engine Stop.', '', 'Apollo 11 · ≈102:45:44'), 900);
  if (td.grade !== 'fail') {
    setTimeout(() => callout('Armstrong', 'Houston, Tranquility Base here. The Eagle has landed.', '', 'Apollo 11 · 20 July 1969'), 3200);
    setTimeout(() => callout('Duke', 'Roger, Twan... Tranquility. We copy you on the ground. You got a bunch of guys about to turn blue. We\'re breathing again. Thanks a lot.', 'capcom', 'Apollo 11'), 6200);
  } else audio.alarm();
  resultTimer = 4.5;
}

/* ================================================================== visuals per frame */
let yawAngle = Math.PI, glowLevel = 0, puffAcc = 0, limitCycleT = 2;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const qPitch = new THREE.Quaternion(), qYaw = new THREE.Quaternion();
const Z_AXIS = new THREE.Vector3(0, 0, 1), Y_AXIS = new THREE.Vector3(0, 1, 0);

function yawFor(t) {
  // Apollo 11 flew the start of the braking phase windows-down for landmark sightings and
  // yawed to windows-up at 102:36:46 ("Rolling over") so the landing radar could see the ground.
  if (scenario === 'low' || t > 262) return 0;
  if (t < 221) return Math.PI;
  return Math.PI * (1 - smooth(221, 257, t));
}
function lmPos(out) { return out.set(sim.d.x - O, sim.d.h, 0); }

function updateVisuals(dt) {
  const d = sim.d;
  // floating origin
  const Onew = Math.round(d.x / ORIGIN_STEP) * ORIGIN_STEP;
  if (Onew !== O) { O = Onew; camState.init = camMode !== 'orbit' ? false : camState.init; if (camMode === 'orbit') { /* re-anchor */ controls.target.set(d.x - O, d.h, 0); } }
  siteGroup.position.x = -O;
  siteGroup.visible = Math.abs(d.x) < 7000;
  rockSmall.forEach(m => { m.visible = camera.position.y - (d.ground ?? 0) < 250; });
  toLocal(SUN_SITE, d.x, sunL); toLocal(EARTH_SITE, d.x, earthL);

  // LM pose
  yawAngle = yawFor(sim.t);
  qPitch.setFromAxisAngle(Z_AXIS, sim.theta);
  qYaw.setFromAxisAngle(Y_AXIS, yawAngle);
  pivot.quaternion.copy(qPitch).multiply(qYaw);
  lmPos(pivot.position);
  pivot.updateMatrixWorld(true);

  // engine: faint glow + nearly invisible plume
  const thr = d.thrust > 0 ? sim.throttle : 0;
  glowLevel += ((thr > 0 ? 0.25 + thr : 0) - glowLevel) * (1 - Math.exp(-dt * 12));
  lm.parts.glowMat.opacity = clamp(glowLevel * 0.22, 0, 0.3) * (0.93 + 0.07 * Math.sin(performance.now() * 0.05));
  lm.parts.plumeMat.uniforms.uI.value = glowLevel * 0.05;
  lm.parts.plumeMat.uniforms.uT.value = performance.now() / 1000;

  // S-band antenna tracks the Earth
  const sb = lm.parts.sband;
  sb.getWorldPosition(tmpV);
  tmpV2.copy(tmpV).addScaledVector(earthL, 100);
  sb.parent.worldToLocal(tmpV2);
  sb.lookAt(tmpV2);

  // RCS puffs: pitch jets from the attitude loop, plus the autopilot's occasional deadband pulses
  puffs.update(dt);
  if (d.thrust > 0 || sim.jet) {
    if (sim.jet && sim.t - sim.jetTime < 0.05) {
      puffAcc += dt * 14;
      while (puffAcc > 1) { puffAcc -= 1; firePitchJets(sim.jet); }
    }
    limitCycleT -= dt * (warp > 5 ? 0 : 1);
    if (limitCycleT <= 0 && !sim.touchdown) {
      limitCycleT = 1.5 + Math.random() * 3.5;
      const n = lm.parts.nozzles[(Math.random() * lm.parts.nozzles.length) | 0];
      fireNozzle(n); audio.thump();
    }
  }

  // dust sheet
  const g = d.ground ?? 0;
  const agl = d.alt;
  const dustI = d.thrust > 0 ? clamp(sim.throttle / 0.26, 0, 1.4) * smooth(32, 3, agl) : 0;
  const dI = lerp(dustMats[0].uniforms.uI.value, dustI * 0.75, 1 - Math.exp(-dt * 3));
  dustMats.forEach((m, i) => {
    m.uniforms.uI.value = dI * (i ? 0.55 : 1);
    m.uniforms.uR.value = 1; m.uniforms.uW.value = dustMat.uniforms.uR.value;
    m.uniforms.uT.value += dt * (0.6 + sim.throttle);
    m.uniforms.uSun.value.copy(sunL);
    m.uniforms.uCam.value.copy(camera.position);
  });
  dust.visible = dI > 0.003;
  dustMat.uniforms.uR.value = clamp(18 + agl * 2.2, 18, 90);
  // the engine axis meets the ground ahead of/behind the LM when tilted
  const hitX = d.x + Math.tan(-sim.theta) * Math.max(0, d.h - g) * 0.5;
  dust.position.set(hitX - O, g + 0.18, 0);
  dust.scale.setScalar(dustMat.uniforms.uR.value);

  // lighting
  sun.position.copy(pivot.position).addScaledVector(sunL, 30);
  sun.target.position.copy(pivot.position);
  terrain.uniforms.uGlow.value.set(d.x - O, 0, d.thrust > 0 ? glowLevel * 0.06 * smooth(20, 2, agl) : 0);
}
const _nw = new THREE.Vector3(), _nd = new THREE.Vector3();
function fireNozzle(n) {
  _nw.copy(n.pos); lm.model.localToWorld(_nw);
  _nd.copy(n.dir).transformDirection(lm.model.matrixWorld);
  puffs.fire(_nw, _nd);
}
function firePitchJets(dir) {
  // +1 raises the nose-back pitch: forward quads push up (exhaust down), aft quads push down (exhaust up).
  // With the ascent stage yawed, "forward" in the pitch plane follows the model.
  const flip = Math.cos(yawAngle) >= 0 ? 1 : -1;
  for (const n of lm.parts.nozzles) {
    const fwd = n.pos.x > 0 ? 1 : -1;
    const want = dir * fwd * flip > 0 ? 'down' : 'up';
    if (n.kind === want && Math.random() < 0.7) fireNozzle(n);
  }
  audio.thump();
}

/* ================================================================== cameras */
let camMode = params.get('cam') || 'auto';
const camState = { init: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50, shot: 'chase', shotT: 0, lastLM: new THREE.Vector3() };
function directorShot() {
  const t = sim.t, d = sim.d;
  if (sim.touchdown) return 'hero';
  if (sim.mode === 'P63') return (t > 212 && t < 268) ? 'side' : (t > 70 && t < 200) ? 'earth' : 'chase';
  if (sim.mode === 'P64') { const e = sim.events.find(x => x.id === 'p64'); return e && t - e.t < 34 && d.alt > 250 ? 'window' : (d.alt > 200 ? 'chase' : 'side'); }
  if (d.alt < 40) return 'chase';
  return d.alt < 150 ? 'side' : 'chase';
}
const EYE = new THREE.Vector3(1.0, 5.15, -0.5);     // commander's eye in the model frame
const LOOK_A = 40 * DEG;                            // window view centred 40° from "straight down" toward +Z
function computeCamera(dt) {
  const d = sim.d;
  camera.aspect = innerWidth / innerHeight;
  let shot = camMode === 'auto' ? directorShot() : camMode;
  if (shot === 'plot') shot = 'chase';
  if (shot !== camState.shot) { camState.shot = shot; camState.init = false; }
  document.body.classList.toggle('cam-window', shot === 'window');
  lm.model.visible = shot !== 'window';               // the camera sits inside the cabin
  document.body.classList.toggle('cam-plot', camMode === 'plot');
  const lp = lmPos(tmpV);
  const k = camState.init ? 1 - Math.exp(-dt * 5) : 1;
  controls.enabled = shot === 'orbit';
  if (shot === 'window') {
    const eye = EYE.clone(); lm.model.localToWorld(eye);
    const dirM = new THREE.Vector3(Math.sin(LOOK_A), -Math.cos(LOOK_A), 0);
    const upM = new THREE.Vector3(Math.cos(LOOK_A), Math.sin(LOOK_A), 0);
    const q = lm.model.getWorldQuaternion(tmpQ);
    dirM.applyQuaternion(q); upM.applyQuaternion(q);
    camera.position.copy(eye);
    camera.up.copy(upM);
    camera.lookAt(eye.clone().add(dirM));
    camera.fov = 64; camera.near = 0.05;
    camState.init = true;
  } else if (shot === 'orbit') {
    if (!camState.init) {
      camera.up.set(0, 1, 0);
      const off = sim.touchdown ? new THREE.Vector3(-16, 5, 20) : new THREE.Vector3(-22, 6, 18);
      camera.position.copy(lp).add(off);
      controls.target.copy(lp).add(new THREE.Vector3(0, sim.touchdown ? -0.5 : 0, 0));
      camState.lastLM.copy(lp);
      camState.init = true;
    }
    const delta = tmpV2.copy(lp).sub(camState.lastLM);
    camera.position.add(delta); controls.target.add(delta);
    camState.lastLM.copy(lp);
    controls.autoRotate = !!sim.touchdown && camMode === 'auto';
    controls.autoRotateSpeed = 0.35;
    controls.update();
    camera.fov = 45;
  } else {
    camera.up.set(0, 1, 0);
    const pos = new THREE.Vector3(), look = new THREE.Vector3();
    const agl = d.alt;
    const aspK = clamp(1.3 / camera.aspect, 1, 2.1);      // portrait screens need the camera further back
    if (shot === 'chase') {
      const dist = (agl > 3000 ? 27 : agl > 300 ? 25 : 21) * aspK;
      pos.set(lp.x - dist * 0.72, lp.y + dist * 0.16, lp.z + dist * 0.66);
      look.set(lp.x + 2.5, lp.y - 1.0, lp.z);
      camera.fov = 48;
    } else if (shot === 'side') {
      pos.set(lp.x + 3, lp.y + 1.0, lp.z + 24 * aspK);
      look.set(lp.x + 1, lp.y - 0.8, lp.z);
      camera.fov = 44;
    } else if (shot === 'low') {
      // a camera on the ground behind the landing point: the dust sheet races toward it
      if (!camState.init) camState.lowX = d.x + Math.max(0, d.vx) * 5 - 42 * aspK;
      const gy = d.ground ?? 0;
      pos.set(camState.lowX - O, gy + 4.2, 14);
      look.set(lp.x, gy + (lp.y - gy) * 0.5 + 1, lp.z - 1);
      camera.fov = 52;
    } else if (shot === 'earth') {
      // below and beside Eagle, looking up: the LM on one side of the frame, the Earth on the other
      const v = new THREE.Vector3(20, 18, 12).normalize();
      pos.copy(lp).addScaledVector(v, -30 * aspK);
      look.copy(pos).addScaledVector(v.clone().multiplyScalar(1.3).add(earthL).normalize(), 30);
      camera.fov = 68;
    } else if (shot === 'hero') {
      // on the surface south of Tranquility Base: Eagle side-lit by the morning Sun, its shadow stretching west
      if (!camState.init) camState.heroT = 0;
      camState.heroT += dt;
      const gy = d.ground ?? 0;
      const a = 0.35 + Math.sin(camState.heroT * 0.04) * 0.12;
      pos.set(lp.x + Math.sin(a) * 25 * aspK, gy + 2.8, lp.z + Math.cos(a) * 25 * aspK);
      look.set(lp.x + 3.5, gy + 2.2, lp.z);
      camera.fov = 42;
    }
    // keep the camera above the ground
    const gy = groundAt(pos.x + O, pos.z) + 1.2;
    if (pos.y < gy) pos.y = gy;
    if (!camState.init) { camState.pos.copy(pos); camState.look.copy(look); camState.init = true; }
    else {
      // follow the LM rigidly along the track (it moves 1.7 km/s at PDI), smooth only the offset
      const rigid = shot === 'low' || shot === 'earth' || shot === 'hero';
      camState.pos.lerp(pos, rigid ? 1 : k); camState.look.lerp(look, rigid ? 1 : k);
      if (!rigid) { camState.pos.x = pos.x; camState.look.x = look.x; }
    }
    camera.position.copy(camState.pos);
    camera.lookAt(camState.look);
  }
  camera.aspect = innerWidth / innerHeight;
  // centre the subject in the part of the screen the panels leave free
  const wide = innerWidth > 820;
  const ox = wide ? 178 : 0, oy = document.body.classList.contains('ml-flying') ? (wide ? 70 : 110) : 0;
  if (ox || oy) camera.setViewOffset(innerWidth, innerHeight, ox, oy, innerWidth, innerHeight); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}

/* ================================================================== per-frame uniforms */
function updateUniforms() {
  const u = terrain.uniforms, d = sim.d;
  u.uOrigin.value.set(O, 0);
  u.uMeshCenter.value.set(camera.position.x, camera.position.z);
  u.uCurve.value.set(d.x - O, 0);
  u.uSun.value.copy(sunL);
  u.uSunH.value.set(sunL.x, sunL.z).normalize();
  u.uTanEl.value = sunL.y / Math.hypot(sunL.x, sunL.z);
  u.uPixAngle.value = 2 * Math.tan(camera.fov * DEG / 2) / (innerHeight * renderer.getPixelRatio());
  lm.model.updateMatrixWorld(true);
  u.uLmInv.value.copy(lm.model.matrixWorld).invert();
  tmpQ.copy(lm.model.getWorldQuaternion(new THREE.Quaternion())).invert();
  u.uSunM.value.copy(sunL).applyQuaternion(tmpQ);
  // the Sun and the Earth ride with the camera (they are effectively at infinity)
  earth.position.copy(camera.position).addScaledVector(earthL, EARTH_D);
  earth.rotation.y = 1.2;
  earthMat.uniforms.uSun.value.copy(sunL);
  const SD = 1.2e6;
  sunSprite.position.copy(camera.position).addScaledVector(sunL, SD);
  sunSprite.scale.setScalar(SD * Math.tan(4.2 * DEG));
  sun.intensity = 3.6;
  bounce.intensity = 0.55 + 0.6 * clamp(sunL.y * 3, 0, 1);
}

/* ================================================================== commander's window overlay */
const winSvg = $('winSvg');
function drawWindow() {
  if (!document.body.classList.contains('cam-window')) return;
  const W = innerWidth, H = innerHeight;
  const cx = W / 2;
  // window outline: the LM's triangular-ish forward window, generously sized
  const pts = [[W * 0.1, H * 0.1], [W * 0.9, H * 0.08], [W * 0.95, H * 0.62], [W * 0.62, H * 0.97], [W * 0.2, H * 0.95], [W * 0.05, H * 0.55]];
  const poly = pts.map(p => p.join(',')).join(' ');
  let s = `<path class="frame" fill-rule="evenodd" d="M0 0H${W}V${H}H0Z M${pts.map(p => p.join(' ')).join(' L')} Z"/><polygon class="rim" points="${poly}"/>`;
  // Landing Point Designator scale: marks every 2°, labelled every 10°, measured from the thrust axis
  const q = lm.model.getWorldQuaternion(tmpQ);
  const eye = EYE.clone(); lm.model.localToWorld(eye);
  const pts2 = [];
  let lpd = '<g class="lpd">';
  for (let a = 0; a <= 80; a += 2) {
    const dm = new THREE.Vector3(Math.sin(a * DEG), -Math.cos(a * DEG), 0).applyQuaternion(q);
    const p = eye.clone().addScaledVector(dm, 1000).project(camera);
    if (p.z > 1 || Math.abs(p.y) > 1.1) continue;
    const y = (1 - p.y) / 2 * H, x = (p.x + 1) / 2 * W;
    pts2.push([x, y]);
    const L = a % 10 === 0 ? 26 : 10;
    lpd += `<line x1="${x - L}" y1="${y}" x2="${x + (a % 10 === 0 ? 8 : 0)}" y2="${y}"/>`;
    if (a % 10 === 0) lpd += `<text x="${x - L - 26}" y="${y + 4}">${a}</text>`;
  }
  if (pts2.length > 1) lpd += `<line x1="${pts2[0][0]}" y1="${pts2[0][1]}" x2="${pts2[pts2.length - 1][0]}" y2="${pts2[pts2.length - 1][1]}"/>`;
  lpd += '</g>';
  s += lpd;
  // the computer's landing point (P64) with the LPD angle it displayed on the DSKY
  if (sim.mode === 'P64' || sim.mode === 'P65') {
    const tp = new THREE.Vector3(sim.lpdX - O, groundAt(sim.lpdX, 0), 0);
    const dropd = (sim.lpdX - sim.d.x) ** 2 / (2 * R_MOON);
    tp.y -= dropd;
    const p = tp.project(camera);
    if (p.z < 1 && Math.abs(p.x) < 1.2 && Math.abs(p.y) < 1.2) {
      const x = (p.x + 1) / 2 * W, y = (1 - p.y) / 2 * H;
      s += `<path class="tgt" d="M${x} ${y - 11}L${x + 11} ${y}L${x} ${y + 11}L${x - 11} ${y}Z"/><line class="tgt" x1="${x - 22}" y1="${y}" x2="${x - 14}" y2="${y}"/><line class="tgt" x1="${x + 14}" y1="${y}" x2="${x + 22}" y2="${y}"/>`;
      s += `<text class="tgt-t" x="${x + 26}" y="${y + 4}">LPD ${Math.round(sim.d.lpdAngle)}°</text>`;
    }
  }
  if (pts2.length > 3) s += `<text class="wtxt" x="${pts2[pts2.length - 3][0] + 14}" y="${pts2[pts2.length - 3][1] + 4}">LPD scale · degrees from the thrust axis</text>`;
  winSvg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  winSvg.innerHTML = s;
}

/* ================================================================== Mission Control plot */
function drawPlot(cv, big) {
  const W = cv.width, H = cv.height, c = cv.getContext('2d');
  c.clearRect(0, 0, W, H);
  const f = big ? Math.min(devicePixelRatio, 2) * 1.15 : (W / (cv.getBoundingClientRect().width || 300)) * 0.95;
  const pad = 36 * f;
  const panels = big
    ? [{ x: 0, y: 0, w: W * 0.5, h: H, xmax: 270, ymax: 50000, xt: 50, yt: 10000, title: 'POWERED DESCENT' },
       { x: W * 0.5, y: 0, w: W * 0.5, h: H, xmax: 6, ymax: 8000, xt: 1, yt: 1000, title: 'APPROACH AND LANDING' }]
    : (sim && -sim.d.x / NMI > 6.5
      ? [{ x: 0, y: 0, w: W, h: H, xmax: 270, ymax: 50000, xt: 50, yt: 10000, title: 'POWERED DESCENT' }]
      : [{ x: 0, y: 0, w: W, h: H, xmax: 6, ymax: 8000, xt: 1, yt: 2000, title: 'APPROACH AND LANDING' }]);
  c.font = `${11 * f}px "JetBrains Mono", monospace`;
  for (const P of panels) {
    const x0 = P.x + pad * 1.6, x1 = P.x + P.w - pad * 0.6, y0 = P.y + pad * 0.8, y1 = P.y + P.h - pad * 0.9;
    // range to go increases to the left, as on the flight controllers' plotboards
    const X = (nmi) => x1 - (nmi / P.xmax) * (x1 - x0);
    const Y = (ft) => y1 - (ft / P.ymax) * (y1 - y0);
    c.strokeStyle = 'rgba(150,170,255,.10)'; c.lineWidth = 1;
    c.fillStyle = 'rgba(143,152,189,.8)';
    for (let v = 0; v <= P.xmax + 1e-6; v += P.xt) { c.beginPath(); c.moveTo(X(v), y0); c.lineTo(X(v), y1); c.stroke(); c.textAlign = 'center'; c.fillText(String(v), X(v), y1 + 14 * f); }
    for (let v = 0; v <= P.ymax + 1e-6; v += P.yt) { c.beginPath(); c.moveTo(x0, Y(v)); c.lineTo(x1, Y(v)); c.stroke(); c.textAlign = 'right'; c.fillText(v >= 1000 ? (v / 1000) + 'k' : String(v), x0 - 5 * f, Y(v) + 4 * f); }
    c.textAlign = 'left'; c.fillStyle = 'rgba(124,200,255,.9)'; c.fillText(P.title, x0 + 4 * f, y0 + 12 * f);
    c.fillStyle = 'rgba(93,101,137,1)'; c.textAlign = 'right'; c.fillText('altitude ft ↑ · range nmi ←', x1, y0 + 12 * f);
    c.save(); c.beginPath(); c.rect(x0, y0 - 4, x1 - x0 + 4, y1 - y0 + 4); c.clip();
    // planned
    c.setLineDash([5 * f, 4 * f]); c.strokeStyle = 'rgba(143,152,189,.7)'; c.lineWidth = 1.4 * f; c.beginPath();
    NOM.samples.forEach((s, i) => { const px = X(-s.x / NMI), py = Y(Math.max(0, s.alt) / FT); i ? c.lineTo(px, py) : c.moveTo(px, py); });
    c.stroke(); c.setLineDash([]);
    // gates
    c.fillStyle = '#4ef0b8';
    for (const g of [NOM_T.hg, NOM_T.lg]) {
      const s = NOM.samples.find(q => q.t >= g); if (!s) continue;
      c.beginPath(); c.arc(X(-s.x / NMI), Y(s.alt / FT), 3.5 * f, 0, 6.3); c.fill();
      c.fillText(g === NOM_T.hg ? 'High Gate' : 'Low Gate', X(-s.x / NMI) + (big ? 62 : 58) * f, Y(s.alt / FT) - 6 * f);
    }
    // flown
    if (history.length > 1) {
      c.strokeStyle = '#ffc24b'; c.lineWidth = 2 * f; c.beginPath();
      history.forEach((s, i) => { const px = X(-s[0] / NMI), py = Y(Math.max(0, s[1]) / FT); i ? c.lineTo(px, py) : c.moveTo(px, py); });
      c.stroke();
    }
    if (sim) {
      const px = X(-sim.d.x / NMI), py = Y(Math.max(0, sim.d.alt) / FT);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(px, py - 6 * f); c.lineTo(px + 5 * f, py + 4 * f); c.lineTo(px - 5 * f, py + 4 * f); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(255,194,75,.5)'; c.beginPath(); c.arc(px, py, 10 * f, 0, 6.3); c.stroke();
    }
    c.restore();
    // target
    c.fillStyle = '#ff7a3d'; c.beginPath(); c.arc(X(0), Y(0), 3 * f, 0, 6.3); c.fill();
  }
}

/* ================================================================== HUD */
const START_GET = 102 * 3600 + 33 * 60 + 5;                // PDI at 102:33:05 [MR]
function getStr(t) {
  let s = Math.floor(START_GET + t);
  const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); s -= m * 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function reg(v) { const a = Math.min(99999, Math.round(Math.abs(v))); return (v < 0 ? '−' : '+') + String(a).padStart(5, '0'); }
const PHASE = { P63: 'P63 · braking phase', P64: 'P64 · approach phase', P65: 'P65 · automatic vertical descent', P66: 'P66 · rate of descent (manual)', P68: 'P68 · landing confirmation' };
let compT = 0;
function setLamp(id, on) { $(id).classList.toggle('on', !!on); }
function updateHUD(force) {
  const d = sim.d, t = sim.t;
  $('get').textContent = getStr(t);
  const landed = !!sim.touchdown;
  const prog = landed ? 'P68' : sim.mode;
  $('phase').textContent = !started ? (scenario === 'pdi' ? 'Awaiting Powered Descent Initiation' : scenario === 'high' ? 'Approaching High Gate' : 'Low Gate · 400 ft') :
    (paused ? 'Paused · ' : '') + PHASE[prog] + (sim.mode === 'P63' && t < DPS.startLow ? ' · 10 % trim' : '');
  const altM = Math.max(0, d.alt);
  $('mAlt').textContent = altM > 1000 ? fmt(altM / 1000, 1) + ' km' : fmt(altM, 0) + ' m';
  $('mRate').textContent = fmt(d.vh, 1) + ' m/s';
  $('mFuel').textContent = fmt(d.propPct, 1) + ' %';
  // instruments
  $('iAlt').textContent = altM > 1000 ? fmt(altM / 1000, 2) : fmt(altM, altM < 100 ? 1 : 0);
  $('iAltU').textContent = altM > 1000 ? 'km' : 'm';
  $('iAltFt').textContent = fmt(altM / FT, 0) + ' ft';
  $('iRate').textContent = fmt(d.vh, 1); $('iRateFt').textContent = fmt(d.vh / FT, 1) + ' ft/s';
  $('iFwd').textContent = fmt(d.vx, Math.abs(d.vx) < 100 ? 1 : 0); $('iFwdFt').textContent = fmt(d.vx / FT, 0) + ' ft/s';
  $('iPitch').textContent = fmt(sim.theta / DEG, 1);
  $('attG').setAttribute('transform', `rotate(${(-sim.theta / DEG).toFixed(1)})`);
  $('attThr').style.opacity = d.thrust > 0 ? 0.9 : 0;
  const thrPct = d.thrust > 0 ? sim.throttle * 100 : 0;
  $('iThr').style.width = thrPct.toFixed(1) + '%';
  $('iThrTxt').textContent = fmt(thrPct, 0) + ' %' + (sim.ftpMode && d.thrust > 0 && t >= DPS.startLow ? ' · FTP' : '');
  $('iFuel').style.width = clamp(d.propPct, 0, 100).toFixed(1) + '%';
  $('iFuel').parentNode.classList.toggle('low', sim.lowLevel);
  $('iFuelTxt').textContent = fmt(d.propPct, 1) + ' % · ' + fmt(sim.prop, 0) + ' kg';
  const b = $('iBingo');
  if (sim.lowLevel && !landed) { b.textContent = d.toBingo > 0 ? `Bingo in ${Math.ceil(d.toBingo)} s` : `BINGO +${Math.floor(-d.toBingo)} s`; b.classList.toggle('hot', d.toBingo < 30); }
  else b.textContent = landed ? '' : `${fmt(d.hoverLeft, 0)} s of hover`;
  $('iMode').textContent = landed ? 'Landed · engine off' : (sim.auto ? 'AUTO · ' : sim.armstrong ? 'Armstrong · ' : 'YOU · ') + PHASE[sim.mode];
  $('iRod').textContent = sim.mode === 'P66' && !landed ? `ROD ${fmt((sim.rodCmd ?? 0) / FT, 0)} ft/s` : '';
  // DSKY
  let verb = 16, noun = 63, R1 = 0, R2 = 0, R3 = 0, caps = ['range 0.1 nmi', 'alt rate 0.1 ft/s', 'altitude ft'];
  let r1s = null;
  if (alarmState.active) { verb = 5; noun = 9; r1s = '+01' + alarmState.active.code.toString().slice(1).padStart(3, '0'); r1s = '+0' + alarmState.active.code; caps = ['alarm code', '', '']; }
  else if (landed) { verb = 6; noun = 43; R1 = 67; R2 = 2347; R3 = 0; caps = ['lat 0.01°', 'long 0.01°', 'alt']; }
  else if (sim.mode === 'P63') { R1 = -d.x / NMI * 10; R2 = d.vh / FT * 10; R3 = altM / FT; }
  else if (sim.mode === 'P64') {
    noun = 64; const tt = clamp(Math.round(sim.tgo ?? 0), 0, 99), ang = clamp(Math.round(d.lpdAngle), 0, 99);
    r1s = '+' + String(tt).padStart(2, '0') + ' ' + String(ang).padStart(2, '0');
    R2 = d.vh / FT * 10; R3 = altM / FT; caps = ['LPD time · angle', 'alt rate 0.1 ft/s', 'altitude ft'];
  } else { noun = 60; R1 = d.vx / FT * 10; R2 = d.vh / FT * 10; R3 = altM / FT; caps = ['fwd vel 0.1 ft/s', 'alt rate 0.1 ft/s', 'altitude ft']; }
  $('dProg').textContent = prog.slice(1); $('dVerb').textContent = String(verb).padStart(2, '0'); $('dNoun').textContent = String(noun).padStart(2, '0');
  $('dR1').textContent = r1s ?? reg(R1); $('dR2').textContent = alarmState.active ? '' : reg(R2); $('dR3').textContent = alarmState.active ? '' : reg(R3);
  $('cR1').textContent = caps[0]; $('cR2').textContent = caps[1]; $('cR3').textContent = caps[2];
  document.querySelector('.ml-el').classList.toggle('flash', !!alarmState.active);
  setLamp('lProg', !!alarmState.active);
  setLamp('lRestart', !!alarmState.active && (performance.now() % 1000 < 500));
  // landing radar: no data until the yaw to windows-up (≈102:37) [MR]
  const lrOff = sim.mode === 'P63' && t < 245 && scenario === 'pdi';
  setLamp('lAlt', lrOff); setLamp('lVel', lrOff);
  setLamp('lQty', sim.lowLevel);
  setLamp('lContact', !!sim.contact);
  setLamp('lMaster', (!!alarmState.active || (sim.lowLevel && d.toBingo <= 0 && !landed) || sim.outcome === 'fail') && performance.now() % 700 < 420);
  // buttons
  const take = $('takeBtn');
  const canTake = started && !landed && (sim.mode === 'P64' || sim.mode === 'P65' || (sim.mode === 'P66' && (sim.auto || sim.armstrong)) || d.alt < 3000);
  const inP66Manual = sim.mode === 'P66' && !sim.auto && !sim.armstrong;
  take.disabled = !(canTake || inP66Manual);
  take.textContent = inP66Manual ? 'Give it back · AUTO' : 'Take over · P66';
  take.classList.toggle('auto', inP66Manual);
  take.classList.toggle('pulse', !inP66Manual && sim.mode === 'P64' && d.alt < 500 * FT && who === 'fly');
  document.body.classList.toggle('ml-manual', started && inP66Manual && !landed);
  document.body.classList.toggle('ml-p64', started && sim.mode === 'P64' && who === 'fly' && !landed);
  $('acaBackS').textContent = sim.mode === 'P64' ? 'nearer' : 'back';
  $('acaFwdS').textContent = sim.mode === 'P64' ? 'further' : 'fwd';
  $('padAcaL').textContent = sim.mode === 'P64' ? 'Landing point' : 'Pitch';
  $('now').innerHTML = nowText();
}
function nowText() {
  const d = sim.d, t = sim.t;
  if (sim.touchdown) {
    const td = sim.touchdown;
    return td.grade === 'fail' ? '<b>Touchdown outside the gear\'s limits.</b> See the numbers in the result card; try P66 again with a slower final descent.' :
      `<b>Landed.</b> ${fmt(td.x - SITE.clear.x, 0)} m from Armstrong's clear area, ${fmt(td.hoverLeft, 0)} s of hover propellant left. Mission Control's next call would be the "stay / no stay" decision for the first minutes on the surface.`;
  }
  if (!started) return scenario === 'pdi' ? '<b>Powered Descent Initiation.</b> Eagle is 15 km above the Moon, moving at 1.7 km/s — nearly orbital speed, so it barely falls. The Descent Propulsion System (DPS) will burn for about twelve minutes to cancel that speed.'
    : scenario === 'high' ? '<b>High Gate.</b> The braking phase is over: 2.3 km up, 9 km from the target, descending at 38 m/s. P64 now pitches Eagle toward upright so the crew can see where the computer is taking them.'
    : '<b>102:43:26 — "400 feet, down at 9, 58 forward."</b> The computer was heading for a boulder field around a large crater. Armstrong has taken semi-manual control (P66) to fly past it. Propellant: about 10 %.';
  switch (sim.mode) {
    case 'P63':
      if (t < DPS.startLow) return '<b>Ignition at 10 % throttle.</b> For 26 seconds the engine runs low while its gimbal trims the thrust through the centre of mass, then it goes to the Fixed Throttle Point (FTP), 92.5 %.';
      if (t < 221 && scenario === 'pdi') return '<b>Braking, windows down.</b> The engine points almost straight ahead along the flight path. Armstrong times landmarks through the window to check the trajectory: "a little long".';
      if (t < 262 && scenario === 'pdi') return '<b>Rolling over.</b> Eagle yaws to windows-up so the landing radar, under the descent stage, can see the ground and correct the computer\'s altitude.';
      if (sim.ftpMode) return `<b>Full throttle braking.</b> The guidance wants less thrust than FTP gives, but the engine cannot throttle between 60 % and 92.5 %, so the computer steers the attitude instead and waits. Speed ${fmt(d.vx, 0)} m/s.`;
      return '<b>Throttle down.</b> The commanded thrust fell below 57 %, so the DPS left FTP and now follows the guidance. Next: High Gate, where the approach phase begins.';
    case 'P64':
      return who === 'fly' ? `<b>Approach (P64).</b> The diamond in the window view is the computer's landing point, ${fmt(d.lpdAngle, 0)}° from straight down on the Landing Point Designator (LPD) scale. Press ← → to move it 2° per click. Below 500 ft press <b>P</b> to take over.`
        : `<b>Approach (P64).</b> Eagle descends along a 16° glide so the crew can see the target ahead: LPD ${fmt(d.lpdAngle, 0)}°. The target lies in a boulder field; Armstrong will take over at about 460 ft.`;
    case 'P65': return '<b>Automatic vertical descent (P65).</b> Never used on a real landing: the computer nulls the forward speed over the target and descends at 3 ft/s. If the target is a boulder field, so be it.';
    case 'P66':
      if (sim.armstrong) return `<b>P66, Armstrong flying.</b> He pitches almost upright to keep ${fmt(d.vx / FT, 0)} ft/s of forward speed over the boulders, then slows and lets down at 1–4 ft/s. Propellant ${fmt(d.propPct, 1)} %.`;
      return '<b>You have control (P66).</b> ↑ ↓: descent rate ±1 ft/s per press (the computer throttles to hold it). Hold ← → to pitch: back brakes, forward accelerates. Land slower than 3 ft/s, with the forward speed near zero, on level ground.';
  }
  return '';
}

/* ================================================================== result card */
function showResult() {
  const td = sim.touchdown; if (!td) return;
  resultShown = true;
  const vvLim = GEAR.vvMax, vhLim = GEAR.vhMax(td.vv);
  const cls = (v, good, lim) => v <= good ? 'ok' : v <= lim ? 'meh' : 'bad';
  let title, eyebrow = 'Touchdown · ' + getStr(td.t), note = '';
  if (td.grade === 'good') title = 'The Eagle has landed';
  else if (td.grade === 'hard') title = 'Down — firmly, but within the landing gear\'s limits';
  else {
    title = td.vv > vvLim ? `Too fast: ${fmt(td.vv, 1)} m/s down` : td.vh > vhLim ? `Sliding sideways at ${fmt(td.vh, 1)} m/s` : td.slope > GEAR.slopeMax ? `A ${fmt(td.slope, 0)}° tilt: a footpad hit a rock or a crater wall` : `Touchdown attitude ${fmt(td.attitude, 1)}° off vertical`;
    eyebrow = 'Outside the landing-gear envelope';
    note = 'The gear was certified for 10 ft/s (3.05 m/s) down, 4 ft/s (1.2 m/s) sideways, 6° attitude and 12° slopes (NASA TN D-6850). Beyond that the LM might tip or damage the descent stage, and the ascent stage needs to be near level to lift off.';
  }
  if (sim.flags.depleted) note = 'The propellant ran out before touchdown. On the real flight the rule was to abort at Bingo + 20 s: fire the ascent stage and return to orbit.';
  $('resEyebrow').textContent = eyebrow;
  $('resTitle').textContent = title;
  $('resQuote').innerHTML = td.grade !== 'fail' ? '"Houston, Tranquility Base here. The Eagle has landed."<cite>Neil Armstrong, 20 July 1969, 20:17 Coordinated Universal Time (UTC)</cite>' : '';
  const dist = td.x - SITE.clear.x;
  $('resTab').innerHTML = `<tr><th></th><th>You</th><th>Eagle, 1969</th><th>Gear limit</th></tr>
    <tr><td>Vertical speed</td><td class="${cls(td.vv, GEAR.goodVv, vvLim)}">${fmt(td.vv, 2)} m/s</td><td>≈${fmt(EAGLE_TOUCHDOWN.vv, 2)} m/s</td><td>3.05 m/s</td></tr>
    <tr><td>Horizontal speed</td><td class="${cls(td.vh, GEAR.goodVh, vhLim)}">${fmt(td.vh, 2)} m/s</td><td>≈${fmt(EAGLE_TOUCHDOWN.vLateral, 2)} m/s</td><td>${fmt(vhLim, 2)} m/s</td></tr>
    <tr><td>Attitude at contact</td><td class="${cls(td.attitude, 3, GEAR.attitudeMax)}">${fmt(td.attitude, 1)}°</td><td>0.8° pitch, 2.6° roll</td><td>6°</td></tr>
    <tr><td>Ground slope under the pads</td><td class="${cls(td.slope, 6, GEAR.slopeMax)}">${fmt(td.slope, 1)}°</td><td>—</td><td>12°</td></tr>
    <tr><td>Propellant left (hover time)</td><td class="${td.hoverLeft > 40 ? 'ok' : td.hoverLeft > 20 ? 'meh' : 'bad'}">${fmt(td.hoverLeft, 0)} s</td><td>≈45–63 s</td><td>Bingo = 20 s</td></tr>
    <tr><td>Time from PDI</td><td>${Math.floor(td.t / 60)}:${String(Math.round(td.t % 60)).padStart(2, '0')}</td><td>12:35</td><td></td></tr>
    <tr><td>From Armstrong's clear area</td><td>${Math.abs(dist) < 3 ? 'on it' : fmt(Math.abs(dist), 0) + ' m ' + (dist >= 0 ? 'beyond' : 'short')}</td><td>—</td><td></td></tr>`;
  $('resNote').textContent = note || 'Eagle figures: NASA TN D-6850 (touchdown), NASA TN D-7143 and the Apollo Lunar Surface Journal (propellant), Apollo 11 Mission Report (timeline).';
  $('result').hidden = false;
  document.body.classList.add('ml-result-open');
  $('resAgain').focus({ preventScroll: true });
}
$('resAgain').addEventListener('click', () => { restart(); begin(); });
$('resLow').addEventListener('click', () => { setScenario('low'); restart(); begin(); });
$('resLook').addEventListener('click', () => { $('result').hidden = true; document.body.classList.remove('ml-result-open'); setCam('orbit'); });

/* ================================================================== landings table */
fetch('data/apollo11-descent.json').then(r => r.json()).then(j => {
  const tb = $('landings');
  for (const L of j.landings) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${L.mission}<br><span class="muted">${L.date}</span></td><td>${L.lm}</td><td>${L.site}</td><td>${L.margin ?? '<span class="muted">not verified here</span>'}</td>`;
    tb.appendChild(tr);
  }
}).catch(() => { /* the table is optional */ });

/* ================================================================== audio (synthesised, off by default) */
const audio = {
  ctx: null, on: false, eng: null, engGain: null,
  init() {
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), ch = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = last * 3.5; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 180;
    this.engGain = ctx.createGain(); this.engGain.gain.value = 0;
    src.connect(lp).connect(this.engGain).connect(ctx.destination); src.start();
    this.noise = buf;
  },
  set(level) { if (this.on && this.engGain) this.engGain.gain.setTargetAtTime(level * 0.35, this.ctx.currentTime, 0.1); },
  tone(f, dur, vol = 0.08, type = 'sine', t0 = 0) {
    if (!this.on || !this.ctx) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(), t = this.ctx.currentTime + t0;
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.setTargetAtTime(0, t + dur, 0.02);
    o.connect(g).connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.2);
  },
  quindar() { this.tone(2525, 0.25, 0.04); },                        // Quindar intro tone on CAPCOM calls
  alarm() { for (let i = 0; i < 4; i++) { this.tone(750, 0.12, 0.05, 'square', i * 0.3); this.tone(2500, 0.12, 0.02, 'square', i * 0.3 + 0.15); } },
  thump() {
    if (!this.on || !this.ctx) return;
    const s = this.ctx.createBufferSource(), g = this.ctx.createGain(), f = this.ctx.createBiquadFilter();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 300; g.gain.value = 0.12;
    g.gain.setTargetAtTime(0, this.ctx.currentTime + 0.03, 0.02);
    s.connect(f).connect(g).connect(this.ctx.destination); s.start(0, Math.random()); s.stop(this.ctx.currentTime + 0.12);
  }
};
$('audio').addEventListener('change', (e) => {
  audio.on = e.target.checked;
  if (audio.on && !audio.ctx) { try { audio.init(); } catch (err) { audio.on = false; e.target.checked = false; } }
  if (audio.ctx) { if (audio.on) audio.ctx.resume(); else { audio.engGain.gain.value = 0; audio.ctx.suspend(); } }
});

/* ================================================================== controls */
function setScenario(s) {
  scenario = s;
  document.querySelectorAll('#starts button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === s)));
  $('goBtn').textContent = s === 'pdi' ? 'Begin descent' : s === 'high' ? 'Start at High Gate' : 'Take the controls';
}
function setWho(w) { who = w; document.querySelectorAll('#who button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.w === w))); }
function begin() {
  if (started) return;
  resetRun();
  started = true; running = true; setPaused(false);
  document.body.classList.add('ml-flying');
  $('pauseBtn').disabled = false;
  lastAltCall = sim.d.alt / FT; dustCalled = false;
  if (scenario === 'low') callout('Aldrin', 'Okay, 400 feet, down at 9. 58 forward.', '', 'Apollo 11 · 102:43:26');
  if (scenario === 'pdi') logLine('<b>DPS ignition</b> — 10 % throttle', '', 'Apollo 11 · 102:33:05');
}
function restart() {
  started = false; running = false; setPaused(false);
  document.body.classList.remove('ml-flying', 'ml-manual', 'ml-p64');
  $('pauseBtn').disabled = true;
  resetRun();
  setWarp(1);
  lastAltCall = Infinity; dustCalled = false;
}
function setPaused(p) { paused = p; $('pauseBtn').setAttribute('aria-pressed', String(p)); $('pauseBtn').textContent = p ? 'Resume' : 'Pause'; }
function setWarp(w) { warp = w; document.querySelectorAll('#warp button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.w === w))); }
function setCam(c) {
  camMode = c; camState.init = false;
  document.querySelectorAll('#cams button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === c)));
  if (c === 'plot') resizePlot();
}
function takeOverToggle() {
  if (!started || sim.touchdown) return;
  if (sim.mode === 'P66' && !sim.auto && !sim.armstrong) { sim.engageAuto(); logLine('<b>Back to the computer</b> — ' + sim.mode); return; }
  if (sim.mode === 'P63' && sim.d.alt > 3000) return;
  who = 'fly'; setWho('fly');
  sim.takeOver(false);
  callout('You', `P66 selected. Rate of descent ${fmt(sim.rodCmd / FT, 0)} ft/s; ↑ ↓ change it, ← → pitch.`, 'sys');
}
function setQuality(q) {
  qName = q; Q = QUALITY[q];
  try { localStorage.setItem('cx-moon-q', q); } catch (e) { /* storage unavailable */ }
  document.querySelectorAll('#quality button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.q === q)));
  const pr = pixelRatio();
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  bloom.enabled = Q.bloom;
  renderer.shadowMap.enabled = Q.shadow > 0; sun.castShadow = Q.shadow > 0;
  if (Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  // rebuild the terrain mesh at the new resolution, keeping its uniforms
  const old = terrain;
  const t2 = createTerrain({ rings: Q.rings, segs: Q.segs, boulderTex: bShadow.tex, boulderRegion: bShadow.region });
  t2.mesh.material.uniforms = old.uniforms; t2.uniforms = old.uniforms;
  scene.remove(old.mesh); old.mesh.geometry.dispose(); old.mesh.material.dispose();
  t2.mesh.material.uniformsNeedUpdate = true;
  const u = t2.mesh.material;
  u.uniforms.uSpacingK.value = t2.q - 1;
  terrain = { mesh: t2.mesh, uniforms: old.uniforms, q: t2.q };
  scene.add(terrain.mesh);
  scene.traverse(o => { if (o.material && o.material.isMeshStandardMaterial) o.material.needsUpdate = true; });
}

document.querySelectorAll('#starts button').forEach(b => b.addEventListener('click', () => { setScenario(b.dataset.s); if (!started) resetRun(); }));
document.querySelectorAll('#who button').forEach(b => b.addEventListener('click', () => setWho(b.dataset.w)));
$('goBtn').addEventListener('click', begin);
$('pauseBtn').addEventListener('click', () => setPaused(!paused));
$('restartBtn').addEventListener('click', restart);
$('takeBtn').addEventListener('click', takeOverToggle);
document.querySelectorAll('#warp button').forEach(b => b.addEventListener('click', () => setWarp(+b.dataset.w)));
document.querySelectorAll('#cams button').forEach(b => b.addEventListener('click', () => setCam(b.dataset.c)));
document.querySelectorAll('#quality button').forEach(b => b.addEventListener('click', () => setQuality(b.dataset.q)));
document.querySelectorAll('#quality button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.q === qName)));

// crew inputs
const held = { back: false, fwd: false };
function applyAca() {
  const v = (held.fwd ? 1 : 0) - (held.back ? 1 : 0);
  if (sim && sim.mode === 'P66' && !sim.auto) { if (sim.armstrong && v !== 0) { sim.armstrong = false; sim.thetaCmd = null; setWho('fly'); callout('You', 'You have the controls.', 'sys'); } sim.setAca(v); }
}
function lpdClick(dir) {
  if (sim && sim.redesignate(dir)) { logLine(`<b>LPD redesignated</b> ${dir > 0 ? 'further' : 'nearer'} — target ${fmt(sim.lpdX, 0)} m`); audio.tone(1200, 0.04, 0.03); }
}
function rodClick(dir) {
  if (!sim || sim.mode !== 'P66' || sim.touchdown) return;
  if (sim.armstrong) { sim.armstrong = false; sim.thetaCmd = null; setWho('fly'); }
  if (sim.auto) return;
  sim.rod(dir); audio.tone(900, 0.03, 0.03);
}
function pressPitch(which, down) {
  if (sim && sim.mode === 'P64' && down) { lpdClick(which === 'fwd' ? 1 : -1); return; }
  held[which] = down; applyAca();
}
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  const k = e.key;
  if (e.code === 'Space') { e.preventDefault(); if (!started) begin(); else setPaused(!paused); return; }
  if (e.target.closest && e.target.closest('button') && (k === 'Enter')) return;
  if (k === 'r' || k === 'R') restart();
  else if (k === 'p' || k === 'P') takeOverToggle();
  else if (k === 'x' || k === 'X') { if (sim.mode === 'P66' && !sim.auto) sim.shutdown(); }
  else if (k >= '1' && k <= '6') setCam(['auto', 'window', 'chase', 'side', 'plot', 'orbit'][+k - 1]);
  else if (k === ']' || k === '[') { const W = [1, 2, 5, 10, 20]; const i = W.indexOf(warp); setWarp(W[clamp(i + (k === ']' ? 1 : -1), 0, W.length - 1)]); }
  else if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); if (!e.repeat) rodClick(+1); }
  else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); if (!e.repeat) rodClick(-1); }
  else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); if (!e.repeat) pressPitch('back', true); }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); if (!e.repeat) pressPitch('fwd', true); }
});
addEventListener('keyup', (e) => {
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') pressPitch('back', false);
  if (k === 'ArrowRight' || k === 'd' || k === 'D') pressPitch('fwd', false);
});
function bindHold(id, which) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('on'); el.setPointerCapture && el.setPointerCapture(e.pointerId); pressPitch(which, true); });
  const up = () => { el.classList.remove('on'); pressPitch(which, false); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
}
bindHold('acaBack', 'back'); bindHold('acaFwd', 'fwd');
$('rodUp').addEventListener('click', () => rodClick(+1));
$('rodDn').addEventListener('click', () => rodClick(-1));

// phones: start with the explanation sheet collapsed
if (matchMedia('(max-width: 820px)').matches) {
  const p = $('panel'); p.classList.add('collapsed'); $('collapse').textContent = '▲ DATA & NOTES';
  $('collapse').addEventListener('click', () => { setTimeout(() => { const c = p.classList.contains('collapsed'); $('collapse').textContent = c ? '▲ DATA & NOTES' : '▼ HIDE'; document.body.classList.toggle('ml-sheet-open', !c); }, 0); });
}
function resizePlot() {
  const cv = $('plotFull'), r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio, 2);
  cv.width = Math.max(300, r.width * dpr); cv.height = Math.max(200, r.height * dpr);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  if (camMode === 'plot') resizePlot();
});

/* ================================================================== loop */
let lastNow = performance.now();
const clock = { getDelta() { const n = performance.now(), d = (n - lastNow) / 1000; lastNow = n; return d; } };
let hudTimer = 0, plotTimer = 0;
const STILL = params.has('still');
function frame() {
  const dtReal = Math.min(clock.getDelta(), 0.1);
  if (running && !paused && !STILL && !sim.touchdown) {
    const before = sim.t;
    sim.runTo(sim.t + dtReal * warp);
    // automatic take-over in "Watch" mode, as on Apollo 11 (P66 at ≈460 ft)
    if (who === 'watch' && sim.mode === 'P64' && sim.d.alt < 140) { sim.takeOver(true); }
    if (sim.t - histT >= 0.5) { history.push([sim.d.x, sim.d.alt]); histT = sim.t; }
    checkAlarms();
    processEvents();
    checkCallouts();
    audio.set(sim.d.thrust > 0 ? 0.35 + sim.throttle : 0);
    if (before === sim.t) { /* nothing */ }
  } else if (sim.touchdown && running) {
    processEvents();
    audio.set(0);
    if (!resultShown) { resultTimer -= dtReal; if (resultTimer <= 0) showResult(); }
  }
  updateVisuals(dtReal);
  computeCamera(dtReal);
  updateUniforms();
  // exposure: a touch brighter at high altitude where the ground is a small, dim bowl
  renderer.toneMappingExposure = lerp(1.0, 1.25, smooth(200, 8000, sim.d.alt));
  terrain.mesh.material.uniforms = terrain.uniforms;
  composer.render();
  drawWindow();
  hudTimer -= dtReal; plotTimer -= dtReal;
  if (hudTimer <= 0) { updateHUD(); hudTimer = 0.1; }
  if (plotTimer <= 0) { drawPlot($('plot'), false); if (camMode === 'plot') drawPlot($('plotFull'), true); plotTimer = 0.25; }
  compT += dtReal;
  if (sim.mode !== 'P66' || sim.auto) { $('compActy').classList.toggle('on', (compT % 2) < 0.18 || (!!alarmState.active && compT % 0.3 < 0.15)); }
  else $('compActy').classList.toggle('on', compT % 0.5 < 0.08);
}
let rafId = 0;
function loop() { rafId = requestAnimationFrame(loop); frame(); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
  else if (!rafId) { clock.getDelta(); loop(); }
});

setScenario(scenario); setWho(who); setCam(camMode);
resetRun();
if (params.has('t')) { begin(); jumpTo(+params.get('t')); }
async function warmUp() {
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (e) { /* compile lazily */ }
}
warmUp().then(() => requestAnimationFrame(() => { clock.getDelta(); loop(); requestAnimationFrame(() => $('loading').classList.add('done')); }));

/* ================================================================== debug hook */
// window.__sim.start('pdi'|'high'|'low'), .jump(seconds since PDI), .cam('window'), .state()
function jumpTo(t) {
  if (!started) begin();
  if (t < sim.t) { resetRun(); started = true; }
  sim.runTo(t);
  if (who === 'watch' && sim.mode === 'P64' && sim.d.alt < 140) sim.takeOver(true);
  history = NOM.samples.filter(s => s.t <= t).map(s => [s.x, s.alt]);
  processEvents();
  checkAlarms();
  camState.init = false;
  return sim.t;
}
window.__sim = {
  start(s, w) { if (s) setScenario(s); if (w) setWho(w); restart(); begin(); return scenario; },
  jump: jumpTo,
  toAlt(altM) { if (!started) begin(); let g = 0; while (sim.d.alt > altM && !sim.touchdown && g++ < 2e6) { sim.step(); if (who === 'watch' && sim.mode === 'P64' && sim.d.alt < 140) sim.takeOver(true); } processEvents(); camState.init = false; return sim.snapshot(); },
  cam: (c) => setCam(c),
  warp: (w) => setWarp(w),
  pause: (p = true) => setPaused(p),
  quality: (q) => setQuality(q),
  take: () => takeOverToggle(),
  result: () => showResult(),
  state: () => ({ ...sim.snapshot(), lpd: sim.d.lpdAngle, tgo: sim.tgo, td: sim.touchdown, events: sim.events.map(e => e.id + '@' + e.t.toFixed(0)) }),
  get sim() { return sim; }
};
