/* Cosmic Library · Mars landing — Mars 2020 Perseverance Entry, Descent and Landing (EDL)
 * ---------------------------------------------------------------------------
 * The flight is computed up front by mars-physics.js (the whole EDL takes a
 * fraction of a second), recorded at 10 Hz, and played back here, so the
 * timeline can be scrubbed and every choice in engineer mode re-flies the
 * physics from scratch.
 *
 * Rendering: floating origin (the camera sits at the origin and the world is
 * shifted by the camera's double-precision position), logarithmic depth, a
 * procedural Mars globe + three nested terrain patches of Jezero Crater, an
 * analytic dusty-sky shader, procedural vehicles (aeroshell, disk-gap-band
 * parachute, descent stage, rover), additive plasma / wake / plume shaders,
 * CPU particles for sparks and dust, UnrealBloom.
 *
 * No NASA insignia or logotypes are drawn anywhere. The parachute pattern is
 * inspired by Perseverance's binary-coded canopy ("Dare Mighty Things").
 * ------------------------------------------------------------------------- */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as P from './mars-physics.js';

const Codex = window.Codex || { fmt: (v, d) => (+v).toFixed(d ?? 2), webgl: () => true, reducedMotion: false };
const gsap = window.gsap;
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;
const R = P.R_SITE;
const OWLT = P.OWLT;
const params = new URLSearchParams(location.search);
const STILL = params.has('still');
if (STILL) document.body.classList.add('ml-still');
const REDUCED = Codex.reducedMotion;

/* ------------------------------------------------------------------ quality */
const QUALITY = {
  low: { pr: 0.75, bloom: false, reg: 110, loc: 150, mic: 72, sphere: [160, 80], dust: 500, sparks: 120, rocks: 180 },
  high: { pr: 1.0, bloom: true, reg: 150, loc: 220, mic: 110, sphere: [256, 128], dust: 1400, sparks: 260, rocks: 420 },
  ultra: { pr: 2.0, bloom: true, reg: 200, loc: 300, mic: 150, sphere: [320, 160], dust: 2400, sparks: 400, rocks: 700 }
};
let qName = params.get('q') || (() => { try { return localStorage.getItem('cx-mars-q') || 'high'; } catch (e) { return 'high'; } })();
if (!QUALITY[qName]) qName = 'high';
let Q = QUALITY[qName];

/* ------------------------------------------------------------------ boot */
if (!Codex.webgl()) { Codex.noGL && Codex.noGL(); throw new Error('WebGL unavailable'); }
const stageEl = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
const pixelRatio = () => Math.min(2, Math.min(devicePixelRatio, 2) * Q.pr);
renderer.setPixelRatio(pixelRatio());
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stageEl.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', stageEl.getAttribute('aria-label'));

const scene = new THREE.Scene();
const world = new THREE.Group();   // everything with a fixed position on Mars; shifted by −camera position each frame
scene.add(world);
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.05, 3e7);
scene.add(camera);
function viewOffset() {
  // on wide screens the telemetry panel covers the right 372 px (and, before take-off, the title
  // card the left 416 px): aim the view at the free area between them
  const flying = document.body.classList.contains('ml-flying');
  const shift = innerWidth > 820 ? (flying || innerWidth <= 1100 ? 186 : -22) : 0;
  if (shift) camera.setViewOffset(innerWidth, innerHeight, shift, 0, innerWidth, innerHeight); else camera.clearViewOffset();
}
viewOffset();

/* Sun at Jezero at touchdown: mid-afternoon (≈15:53 local mean solar time), solar
 * declination ≈ +2° (Ls ≈ 5°): elevation ≈ 31°, azimuth ≈ 250° (west-south-west).
 * Site frame: +x east (downrange), +y up, +z south. */
const SUN_EL = 31 * DEG, SUN_AZ = 250 * DEG;
const SUN = new THREE.Vector3(Math.cos(SUN_EL) * Math.sin(SUN_AZ), Math.sin(SUN_EL), -Math.cos(SUN_EL) * Math.cos(SUN_AZ)).normalize();
const LAT = 18.4447 * DEG;
const POLE = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT)).normalize();   // Mars' north pole direction in the site frame

const sunLight = new THREE.DirectionalLight(0xfff1e0, 3.2);
sunLight.position.copy(SUN).multiplyScalar(100);
scene.add(sunLight, sunLight.target);
const hemi = new THREE.HemisphereLight(0xd9a47a, 0x8a5a3c, 1.1);
scene.add(hemi);

/* ------------------------------------------------------------------ double-precision helpers */
// site coordinates (down = arc length east of the target, h = altitude, z = crossrange south) → world (m)
function siteWorld(down, h, z, out = [0, 0, 0]) {
  const phi = down / R, rr = R + h;
  out[0] = Math.sin(phi) * rr; out[1] = Math.cos(phi) * rr - R; out[2] = z; return out;
}
function basis(down) { const phi = down / R, s = Math.sin(phi), c = Math.cos(phi); return { U: [s, c, 0], E: [c, -s, 0], Z: [0, 0, 1] }; }
const CAM = [0, 0, 0];                    // camera world position (double precision)
function rel(w, out) { return out.set(w[0] - CAM[0], w[1] - CAM[1], w[2] - CAM[2]); }
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const add3 = (a, b, s = 1) => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const len3 = (a) => Math.hypot(a[0], a[1], a[2]);

/* ================================================================== SHARED GLSL */
const NOISE_GLSL = /* glsl */`
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z); }
float vnoise2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a*vnoise(p); p = p*2.03 + 1.7; a *= 0.5; } return s; }
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*vnoise2(p); p = p*2.02 + 17.1; a *= 0.5; } return s; }
`;
// Mars albedo on the globe: bright dusty regions and darker basaltic ones, north polar cap.
const MARS_GLSL = /* glsl */`
uniform vec3 uPole;
vec3 marsAlbedo(vec3 n){
  vec3 w = n * 4.0 + 11.0; w += 0.6 * vec3(vnoise(w * 1.7), vnoise(w * 1.7 + 5.2), vnoise(w * 1.7 + 9.4));
  float a = fbm3(w);
  float b = fbm3(n * 23.0 + 3.1);
  float dark = smoothstep(0.44, 0.6, a * 0.85 + b * 0.3);
  vec3 col = mix(vec3(0.66, 0.32, 0.15), vec3(0.25, 0.13, 0.08), dark * 0.9);
  col *= 0.78 + 0.42 * b;
  // regional streaks and patches (tens of km down to a few km)
  float c = fbm3(n * 260.0 + 1.3), d = vnoise(n * 1400.0);
  col *= 0.74 + 0.4 * c + 0.12 * d;
  col = mix(col, col * vec3(0.8, 0.85, 0.95), smoothstep(0.55, 0.7, c) * 0.6);
  float lat = dot(n, uPole);
  col = mix(col, vec3(0.93, 0.91, 0.88), smoothstep(0.955, 0.975, lat + 0.03 * (b - 0.5)));
  return col;
}
`;
// Impact craters on the globe: a cellular field of bowls with raised rims (relief for bump shading)
const CRATER_GLSL = /* glsl */`
float craterField(vec3 p){
  vec3 i = floor(p), f = fract(p); float h = 0.0;
  for (int x = -1; x <= 1; x++) for (int y = -1; y <= 1; y++) for (int z = -1; z <= 1; z++) {
    vec3 g = vec3(float(x), float(y), float(z));
    float s = hash13(i + g);
    if (s > 0.55) continue;
    vec3 o = vec3(hash13(i + g + 13.1), hash13(i + g + 27.7), hash13(i + g + 41.3));
    float r = 0.18 + 0.32 * hash13(i + g + 5.3);
    float d = length(g + o - f) / r;
    h += d < 1.0 ? (d * d - 1.0) * 0.5 : 0.18 * exp(-(d - 1.0) * (d - 1.0) * 30.0);
  }
  return h;
}
`;
// Aerial perspective through the exponential dusty atmosphere: mean density along the
// camera→point segment, vertical dust optical depth uTau0 (≈0.6, a clear-ish afternoon).
const HAZE_GLSL = /* glsl */`
uniform vec3 uCamP; uniform float uR, uH, uTau0; uniform vec3 uHaze;
vec3 applyHaze(vec3 col, vec3 wp){
  float h1 = length(uCamP) - uR, h2 = length(wp) - uR;
  float d = length(wp - uCamP), dh = h2 - h1;
  float e1 = exp(-max(h1, -3000.0) / uH), e2 = exp(-max(h2, -3000.0) / uH);
  float avg = abs(dh) > 30.0 ? (e1 - e2) * uH / dh : 0.5 * (e1 + e2);
  float tau = uTau0 / uH * d * avg;
  float T = exp(-tau);
  return col * T + uHaze * (1.0 - T);
}
`;
const hazeUniforms = () => ({ uCamP: { value: new THREE.Vector3() }, uR: { value: R }, uH: { value: 11100 }, uTau0: { value: 0.42 }, uHaze: { value: new THREE.Color(0.45, 0.28, 0.17) } });
const U_SUN = { value: SUN.clone() };
const U_POLE = { value: POLE.clone() };
const U_TIME = { value: 0 };
const SHARED_HAZE = hazeUniforms();

/* ================================================================== SKY */
// The view ray is un-projected from the NEAR plane: with near 0.05 m and far 3e7 m the
// far plane's w cancels to ~0 in float32 and the directions blow up.
const skyMat = new THREE.ShaderMaterial({
  uniforms: Object.assign({ uInvProj: { value: new THREE.Matrix4() }, uCamRot: { value: new THREE.Matrix4() }, uSun: U_SUN, uSunE: { value: 2.2 } }, SHARED_HAZE),
  vertexShader: /* glsl */`
    uniform mat4 uInvProj; uniform mat4 uCamRot; varying vec3 vDir;
    void main(){ vec4 v = uInvProj * vec4(position.xy, -1.0, 1.0); v /= v.w; vDir = (uCamRot * vec4(v.xyz, 0.0)).xyz; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform vec3 uSun, uCamP, uHaze; uniform float uR, uH, uTau0, uSunE;
    varying vec3 vDir;
    // Chapman grazing-incidence function (Schüler, GPU Pro 3, 2012): column density factor incl. exp(-h)
    float chapman(float X, float h, float cz){
      float c = sqrt(X + h);
      if (cz >= 0.0) return c / (c * cz + 1.0) * exp(-h);
      float x0 = sqrt(1.0 - cz * cz) * (X + h), c0 = sqrt(x0);
      return 2.0 * c0 * exp(min(X - x0, 60.0)) - c / (1.0 - c * cz) * exp(-h);
    }
    void main(){
      vec3 d = normalize(vDir);
      float r = length(uCamP); vec3 up = uCamP / r;
      float cz = dot(d, up);
      float h = max(r - uR, 0.0) / uH, X = uR / uH;
      float b = dot(uCamP, d), c = r * r - uR * uR * 0.9998;
      bool hit = (b * b - c) > 0.0 && b < 0.0;
      float col = hit ? 40.0 : chapman(X, h, cz);
      float tau = uTau0 * col;
      float a = 1.0 - exp(-tau);
      float mu = dot(d, uSun);
      float sunUp = clamp(dot(up, uSun) * 3.0 + 0.35, 0.0, 1.0);
      vec3 dust = vec3(0.80, 0.54, 0.34);
      vec3 blue = vec3(0.45, 0.62, 0.95);
      float fw = pow(max(mu, 0.0), 10.0);
      vec3 sky = a * dust * (0.42 + 0.9 * fw + 0.22 * mu) * uSunE;
      sky += blue * pow(max(mu, 0.0), 90.0) * 2.2 * a * (1.0 - 0.6 * a) * uSunE;   // Mars' blue sun-glow from forward-scattering dust
      sky *= sunUp;
      // the Sun: 0.35° across from Mars, dimmed by the dust column
      float disk = smoothstep(0.999975, 0.999992, mu);
      sky += vec3(1.0, 0.94, 0.84) * disk * 45.0 * exp(-tau * 0.9);
      sky += vec3(1.0, 0.85, 0.65) * pow(max(mu, 0.0), 800.0) * 1.5 * exp(-tau * 0.5);
      if (any(isnan(sky)) || any(isinf(sky))) sky = vec3(0.0);
      #ifdef SKYDBG
      sky = vec3(fract(tau), a, hit ? 1.0 : 0.0); if (any(isnan(vDir))) sky = vec3(1.0, 0.0, 1.0);
      #endif
      gl_FragColor = vec4(min(sky, vec3(200.0)), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`,
  depthWrite: false, depthTest: false
});
if (params.has('skydbg')) skyMat.defines = { SKYDBG: '' };
const skyQuad = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3)), skyMat);
skyQuad.frustumCulled = false; skyQuad.renderOrder = -10;
scene.add(skyQuad);

/* stars (fade out inside the atmosphere) */
const stars = (() => {
  const n = 4200, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const rnd = P.mulberry32(99);
  for (let i = 0; i < n; i++) {
    const u = rnd() * 2 - 1, th = rnd() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    pos.set([s * Math.cos(th) * 1e7, u * 1e7, s * Math.sin(th) * 1e7], i * 3);
    const b = Math.pow(rnd(), 3) * 0.9 + 0.1, w = rnd();
    col.set([b * (0.85 + 0.15 * w), b * 0.9, b * (1.05 - 0.2 * w)], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.renderOrder = -9;
  scene.add(p); return p;
})();

/* ================================================================== PLANET */
const planetMat = new THREE.ShaderMaterial({
  defines: {},
  uniforms: Object.assign({ uSun: U_SUN, uPole: U_POLE, uCenter: { value: new THREE.Vector3() } }, SHARED_HAZE),
  vertexShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    uniform vec3 uCenter; varying vec3 vN; varying vec3 vWP;
    void main(){
      vN = normalize(position);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWP = position;           // relative to the planet centre (site-frame axes)
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform vec3 uSun; varying vec3 vN; varying vec3 vWP;
    ${NOISE_GLSL}
    ${MARS_GLSL}
    ${CRATER_GLSL}
    ${HAZE_GLSL}
    void main(){
      #include <logdepthbuf_fragment>
      vec3 n = normalize(vN);
      vec3 alb = marsAlbedo(n);
      // relief: craters at two scales (≈100 km and ≈15 km) as a screen-space bump
      vec3 N = n;
      #ifdef CRATERS
      float hc = craterField(n * 60.0) * 0.8 + craterField(n * 420.0 + 7.0) * 0.25 + fbm3(n * 900.0) * 0.3;
      vec3 dpdx = dFdx(vWP), dpdy = dFdy(vWP);
      float dhx = dFdx(hc), dhy = dFdy(hc);
      vec3 r1 = cross(dpdy, n), r2 = cross(n, dpdx);
      float det = dot(dpdx, r1);
      vec3 nb = abs(det) * n - sign(det) * (dhx * r1 + dhy * r2) * 9000.0;
      if (abs(det) > 1e-10 && dot(nb, nb) > 1e-20) N = normalize(nb);
      alb *= 0.92 + 0.16 * clamp(hc + 0.4, 0.0, 1.0);
      #endif
      float mu = dot(N, uSun), mu0 = dot(n, uSun);
      float dif = smoothstep(-0.05, 0.25, mu0) * max(mu, 0.0);
      // same lighting as the terrain patches so the two blend seamlessly
      vec3 col = alb * (vec3(1.0, 0.93, 0.84) * 2.1 * dif + vec3(0.46, 0.30, 0.21) * 0.42 * smoothstep(-0.2, 0.2, mu0));
      col = applyHaze(col, vWP) * (smoothstep(-0.25, 0.05, mu0) * 0.95 + 0.05);
      if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
});
let planet = null;
function buildPlanet() {
  if (planet) { world.remove(planet); planet.geometry.dispose(); }
  if (qName === 'low') delete planetMat.defines.CRATERS; else planetMat.defines.CRATERS = '';
  planetMat.needsUpdate = true;
  planet = new THREE.Mesh(new THREE.SphereGeometry(R - 380, Q.sphere[0], Q.sphere[1]), planetMat);
  planet.frustumCulled = false;
  world.add(planet);
}
buildPlanet();

/* ================================================================== TERRAIN (Jezero) */
const U_DETAIL = { value: 1 };
const TERRAIN_SHADER = {
  vertexShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    attribute vec3 aSite; attribute vec4 aInfo; attribute vec3 aPC;
    varying vec3 vSite; varying vec4 vInfo; varying vec3 vN; varying vec3 vWP; varying vec3 vRel;
    void main(){
      vSite = aSite; vInfo = aInfo; vWP = aPC;
      vN = normalize(mat3(modelMatrix) * normal);
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vRel = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform vec3 uSun; uniform float uDetail; uniform vec4 uHole;
    varying vec3 vSite; varying vec4 vInfo; varying vec3 vN; varying vec3 vWP; varying vec3 vRel;
    ${NOISE_GLSL}
    ${MARS_GLSL}
    ${HAZE_GLSL}
    void main(){
      #include <logdepthbuf_fragment>
      vec2 p = vSite.xy;
      if (uHole.w > 0.5 && max(abs(p.x - uHole.x), abs(p.y - uHole.y)) < uHole.z) discard;   // a finer patch covers this
      float dist = length(vRel);
      float n1 = fbm2(p / 1400.0), n2 = fbm2(p / 170.0 + 3.0), n3 = fbm2(p / 21.0 + 9.0), n4 = vnoise2(p / 2.3);
      // dust-mantled basaltic crater floor
      // crisp-edged bright (dusty) and dark (basaltic) units, ridged wind streaks and bedrock
      float unit = smoothstep(0.47, 0.53, n1 + 0.2 * (n2 - 0.5));
      vec3 base = mix(vec3(0.50, 0.31, 0.18), vec3(0.28, 0.17, 0.11), unit * 0.85);
      float rid = 1.0 - abs(2.0 * n2 - 1.0);
      base *= 0.86 + 0.24 * smoothstep(0.62, 0.95, rid) - 0.14 * smoothstep(0.55, 0.8, n3);
      // the delta: paler, layered sediment
      vec3 deltaC = vec3(0.58, 0.40, 0.27) * (0.88 + 0.14 * sin(vSite.z * 0.9 + n2 * 7.0));
      base = mix(base, deltaC, vInfo.x);
      // Séítah: dark sand ripples between bedrock ridges
      base = mix(base, vec3(0.20, 0.13, 0.10) * (0.8 + 0.4 * n3), vInfo.y * 0.85);
      // boulder fields: dark speckle
      base = mix(base, vec3(0.16, 0.11, 0.09), smoothstep(0.45, 0.85, vInfo.z) * smoothstep(0.5, 0.8, n4) * 0.85 * uDetail);
      base = mix(base, base * 0.7, smoothstep(0.5, 0.9, vInfo.z) * 0.6);
      // steep slopes: exposed, redder bedrock
      base = mix(base, vec3(0.52, 0.28, 0.16), smoothstep(0.18, 0.45, vInfo.w));
      base *= 0.86 + 0.28 * n3;
      // far away: hand over to the globe's albedo
      vec3 nG = normalize(vWP);
      float farK = smoothstep(60000.0, 125000.0, length(p));
      if (farK > 0.0) base = mix(base, marsAlbedo(nG), farK);
      // micro-relief bump (fades with distance)
      vec3 N = normalize(mix(normalize(vN), nG, farK));
      float bumpK = smoothstep(3000.0, 30.0, dist) * uDetail;
      if (bumpK > 0.001) {
        float hn = (fbm2(p / 3.1) * 0.55 + vnoise2(p / 0.6) * 0.12 + n3 * 1.6) * bumpK;
        vec3 dpdx = dFdx(vRel), dpdy = dFdy(vRel);
        float dhx = dFdx(hn), dhy = dFdy(hn);
        vec3 r1 = cross(dpdy, N), r2 = cross(N, dpdx);
        float det = dot(dpdx, r1);
        vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
        vec3 nb = abs(det) * N - grad;
        if (abs(det) > 1e-10 && dot(nb, nb) > 1e-20) N = normalize(nb);
      }
      float mu = dot(N, uSun);
      vec3 up = normalize(vWP);
      float sky = 0.55 + 0.45 * dot(N, up);
      vec3 col = base * (vec3(1.0, 0.93, 0.84) * 2.1 * max(mu, 0.0) * smoothstep(-0.05, 0.25, dot(up, uSun)) + vec3(0.46, 0.30, 0.21) * 0.42 * sky);
      col = applyHaze(col, vWP);
      if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
};
function terrainMaterial(hole) {
  return new THREE.ShaderMaterial({ uniforms: Object.assign({ uSun: U_SUN, uPole: U_POLE, uDetail: U_DETAIL, uHole: { value: hole || new THREE.Vector4(0, 0, 0, 0) } }, SHARED_HAZE), vertexShader: TERRAIN_SHADER.vertexShader, fragmentShader: TERRAIN_SHADER.fragmentShader });
}
const MICRO_HOLE = new THREE.Vector4(0, 0, 0, 0);
const patches = [];
function makePatch(cx, cz, size, n, holeHalf, skirt) {
  const N1 = n + 1, cnt = N1 * N1;
  const pos = new Float32Array(cnt * 3), site = new Float32Array(cnt * 3), info = new Float32Array(cnt * 4), pc = new Float32Array(cnt * 3);
  const O = siteWorld(cx, 0, cz), tmp = [0, 0, 0];
  const H = new Float32Array(cnt);
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
    const x = cx - size / 2 + i * size / n, z = cz - size / 2 + j * size / n, k = j * N1 + i;
    H[k] = P.terrainHeight(x, z);
  }
  const cell = size / n;
  for (let j = 0; j < N1; j++) for (let i = 0; i < N1; i++) {
    const k = j * N1 + i, x = cx - size / 2 + i * cell, z = cz - size / 2 + j * cell;
    let h = H[k];
    const hx = (H[j * N1 + Math.min(i + 1, n)] - H[j * N1 + Math.max(i - 1, 0)]) / (2 * cell);
    const hz = (H[Math.min(j + 1, n) * N1 + i] - H[Math.max(j - 1, 0) * N1 + i]) / (2 * cell);
    const slope = Math.atan(Math.hypot(hx, hz));
    const df = P.deltaField(x, z);
    info.set([df.top, P.seitahMask(x, z), P.rockDensity(x, z), slope], k * 4);
    site.set([x, z, h], k * 3);
    // hide this coarse patch under a finer one
    if (typeof holeHalf === 'number' && holeHalf > 0) { const m = Math.max(Math.abs(x - 0), Math.abs(z - 0)); h -= 45 * smooth(holeHalf, holeHalf - 2 * cell, m); }
    if (skirt && (i === 0 || j === 0 || i === n || j === n)) h -= skirt;
    siteWorld(x, h, z, tmp);
    pos.set([tmp[0] - O[0], tmp[1] - O[1], tmp[2] - O[2]], k * 3);
    pc.set([tmp[0], tmp[1] + R, tmp[2]], k * 3);
  }
  const idx = new (cnt > 65535 ? Uint32Array : Uint16Array)(n * n * 6);
  let q = 0;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * N1 + i, b = a + 1, c = a + N1, d = c + 1;
    idx[q++] = a; idx[q++] = c; idx[q++] = b; idx[q++] = b; idx[q++] = c; idx[q++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aSite', new THREE.BufferAttribute(site, 3));
  g.setAttribute('aInfo', new THREE.BufferAttribute(info, 4));
  g.setAttribute('aPC', new THREE.BufferAttribute(pc, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, terrainMaterial(holeHalf === 'micro' ? MICRO_HOLE : null));
  m.userData.O = O; m.frustumCulled = false;
  world.add(m); patches.push(m);
  return m;
}
let microPatch = null, microCentre = [1e9, 1e9];
function buildTerrain() {
  patches.forEach(m => { world.remove(m); m.geometry.dispose(); m.material.dispose(); }); patches.length = 0; microPatch = null; microCentre = [1e9, 1e9];
  makePatch(0, 0, 250000, Q.reg, 8000, 900);
  makePatch(0, 0, 16800, Q.loc, 'micro', 0);
}
function buildMicro(x, z) {
  // a fine 720 m patch around the touchdown point, lifted a few cm over the 16.8 km patch
  x = Math.round(x / 20) * 20; z = Math.round(z / 20) * 20;
  if (Math.abs(x - microCentre[0]) < 1 && Math.abs(z - microCentre[1]) < 1) return;
  if (microPatch) { world.remove(microPatch); microPatch.geometry.dispose(); microPatch.material.dispose(); patches.splice(patches.indexOf(microPatch), 1); }
  microCentre = [x, z];
  microPatch = makePatch(x, z, 720, Q.mic, 0, 0);
  MICRO_HOLE.set(x, z, 350, 1);     // the 16.8 km patch steps aside inside the fine one
  buildRocks(x, z);
}

/* boulders near the landing site */
let rocks = null;
function buildRocks(cx, cz) {
  if (rocks) { world.remove(rocks); rocks.geometry.dispose(); }
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const p = geo.attributes.position, rnd = P.mulberry32(5);
  for (let i = 0; i < p.count; i++) { const s = 0.75 + rnd() * 0.5; p.setXYZ(i, p.getX(i) * s, p.getY(i) * s * 0.7, p.getZ(i) * s); }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: 0x5a3a2a, roughness: 0.95, metalness: 0 });
  const n = Q.rocks;
  rocks = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
  const O = siteWorld(cx, 0, cz), tmp = [0, 0, 0];
  let k = 0, tries = 0;
  while (k < n && tries++ < n * 30) {
    const x = cx + (rnd() - 0.5) * 700, z = cz + (rnd() - 0.5) * 700;
    const dens = P.rockDensity(x, z);
    if (rnd() > dens * 0.9 + 0.08) continue;
    if (Math.hypot(x - cx, z - cz) < 6) continue;
    const size = 0.08 + Math.pow(rnd(), 4) * (0.5 + dens * 1.6);
    siteWorld(x, P.terrainHeight(x, z) + size * 0.25, z, tmp);
    pos.set(tmp[0] - O[0], tmp[1] - O[1], tmp[2] - O[2]);
    q.setFromEuler(new THREE.Euler(rnd() * 0.6, rnd() * 6.28, rnd() * 0.6));
    s.set(size, size, size);
    m4.compose(pos, q, s); rocks.setMatrixAt(k++, m4);
  }
  rocks.count = k;
  rocks.userData.O = O; rocks.frustumCulled = false;
  world.add(rocks);
}

/* ================================================================== TEXTURES */
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const spriteTex = canvasTex(64, 64, (g, w, h) => {
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
// heat shield: PICA tiles (radial and ring seams)
const heatTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#6a4a36'; g.fillRect(0, 0, w, h);
  const rnd = P.mulberry32(4);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${40 + rnd() * 50},${25 + rnd() * 30},${18 + rnd() * 20},.35)`; g.fillRect(rnd() * w, rnd() * h, 6 + rnd() * 20, 3 + rnd() * 10); }
  g.strokeStyle = 'rgba(20,12,8,.8)'; g.lineWidth = 2;
  for (let r = 0; r < 6; r++) { const y = h * (0.2 + r * 0.14); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  for (let r = 0; r < 6; r++) { const n = 6 + r * 5; for (let i = 0; i < n; i++) { const x = (i + (r % 2) * 0.5) / n * w; const y0 = h * (0.2 + r * 0.14 - 0.14), y1 = h * (0.2 + r * 0.14); g.beginPath(); g.moveTo(x, Math.max(0, y0)); g.lineTo(x, y1); g.stroke(); } }
});
// emission map for the glowing heat shield: hot tiles, cooler seams
const heatEmTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
  const rnd = P.mulberry32(6);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(255,${200 + rnd() * 55},${150 + rnd() * 90},.5)`; g.fillRect(rnd() * w, rnd() * h, 8 + rnd() * 30, 4 + rnd() * 14); }
  g.strokeStyle = 'rgba(90,40,20,.9)'; g.lineWidth = 3;
  for (let r = 0; r < 6; r++) { const y = h * (0.2 + r * 0.14); g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  for (let r = 0; r < 6; r++) { const n = 6 + r * 5; for (let i = 0; i < n; i++) { const x = (i + (r % 2) * 0.5) / n * w; const y0 = h * (0.2 + r * 0.14 - 0.14), y1 = h * (0.2 + r * 0.14); g.beginPath(); g.moveTo(x, Math.max(0, y0)); g.lineTo(x, y1); g.stroke(); } }
});
const backTex = canvasTex(512, 256, (g, w, h) => {
  g.fillStyle = '#d9d4cb'; g.fillRect(0, 0, w, h);
  const rnd = P.mulberry32(8);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(150,140,130,${0.05 + rnd() * 0.08})`; g.fillRect(rnd() * w, rnd() * h, 10 + rnd() * 40, 4 + rnd() * 12); }
  g.strokeStyle = 'rgba(90,85,80,.55)'; g.lineWidth = 1.5;
  for (let i = 0; i < 16; i++) { const x = i / 16 * w; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
  for (let r = 1; r < 5; r++) { const y = r / 5 * h; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
});
// Parachute gores: 80 around; three disk rings spell DARE / MIGHTY / THINGS as 7-bit
// letter numbers (A = 1), the band carries a coordinate code, inspired by the real canopy.
const chuteTex = (() => {
  const W = 80, rows = ['DARE', 'MIGHTY', 'THINGS'];
  const bitsFor = (word) => { let b = ''; for (const ch of word) b += (ch.charCodeAt(0) - 64).toString(2).padStart(7, '0') + '111'; return b; };
  const band = [34, 11, 58, 118, 10, 31].map(n => n.toString(2).padStart(7, '0') + '1').join('');
  const t = canvasTex(W, 8, (g) => {
    const O = '#e2582a', Wt = '#f1ede4';
    for (let r = 0; r < 8; r++) for (let i = 0; i < W; i++) {
      let on = false;
      if (r < 3) { const b = bitsFor(rows[r]); on = b[i % b.length] === '0' ? false : b[i % b.length] === '1' && ((i % 10) < 7); if ((i % 10) >= 7) on = false; }
      else if (r === 3) on = false;
      else if (r >= 4 && r <= 6) { on = band[i % band.length] === '1'; if (i % 8 === 7) on = r === 5; }
      g.fillStyle = on ? O : Wt; g.fillRect(i, r, 1, 1);
    }
  });
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
  return t;
})();

/* ================================================================== MATERIALS */
const M = {
  heat: new THREE.MeshStandardMaterial({ map: heatTex, roughness: 0.9, metalness: 0, emissive: new THREE.Color(0), emissiveMap: heatEmTex, emissiveIntensity: 1 }),
  back: new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.75, metalness: 0.05 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe9e6df, roughness: 0.6, metalness: 0.05 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd4a441, roughness: 0.32, metalness: 0.85 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.28, metalness: 0.9 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2b2d31, roughness: 0.55, metalness: 0.4 }),
  black: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.6, metalness: 0.3 }),
  alu: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.45, metalness: 0.75 }),
  solar: new THREE.MeshStandardMaterial({ map: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#1b2447'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(160,175,220,.35)'; g.lineWidth = 1;
    for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo(i * w / 16, 0); g.lineTo(i * w / 16, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 16); g.lineTo(w, i * h / 16); g.stroke(); }
    g.strokeStyle = 'rgba(210,215,230,.6)'; g.lineWidth = 3;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); }
  }), roughness: 0.3, metalness: 0.55 }),
  tungsten: new THREE.MeshStandardMaterial({ color: 0x6f7178, roughness: 0.4, metalness: 0.9 }),
  canopy: new THREE.MeshStandardMaterial({ map: chuteTex, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }),
  line: new THREE.LineBasicMaterial({ color: 0xe8e2d8, transparent: true, opacity: 0.55 })
};

/* ================================================================== VEHICLE MODELS */
const lathe = (pts, seg = 64) => new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(p[0], p[1])), seg);
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; }

// Aeroshell frame: +Y points aft (from the heat-shield nose toward the backshell apex).
function buildHeatShield() {
  const g = new THREE.Group();
  const pts = [[0, -0.9]];
  for (let i = 1; i <= 6; i++) { const a = i / 6 * 20 * DEG; pts.push([1.125 * Math.sin(a), -0.9 + 1.125 * (1 - Math.cos(a))]); }
  pts.push([2.2, -0.2], [2.25, -0.16], [2.25, -0.12], [2.15, -0.1], [0.3, -0.1], [0, -0.1]);
  mesh(lathe(pts, 72), M.heat, g);
  return g;
}
function buildBackshell() {
  const g = new THREE.Group();
  mesh(lathe([[2.24, -0.12], [2.2, -0.05], [1.36, 1.3], [1.3, 1.42], [1.12, 1.48], [0.8, 2.12], [0.74, 2.2], [0.5, 2.24], [0, 2.26]], 72), M.back, g);
  // four reaction-control thruster pods (roll control for bank reversals)
  const thr = [];
  for (let k = 0; k < 4; k++) {
    const a = (k + 0.5) * Math.PI / 2, r = 1.72;
    const pod = mesh(new THREE.BoxGeometry(0.28, 0.22, 0.22), M.dark, g, Math.cos(a) * r, 0.62, Math.sin(a) * r);
    pod.lookAt(0, 0.62, 0);
    thr.push(new THREE.Vector3(Math.cos(a) * (r + 0.15), 0.62, Math.sin(a) * (r + 0.15)));
  }
  // low-gain antenna and closeout details on the parachute cone
  mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.35, 12), M.white, g, 0.45, 2.3, 0.2);
  mesh(new THREE.TorusGeometry(0.72, 0.03, 8, 48), M.dark, g, 0, 2.18, 0).rotation.x = Math.PI / 2;
  g.userData.thrusters = thr;
  return g;
}
function buildCruiseStage() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(2.0, 2.0, 0.34, 48), M.white, g, 0, 0.17, 0);
  const ring = mesh(new THREE.RingGeometry(0.75, 1.98, 48, 1), M.solar, g, 0, 0.345, 0); ring.rotation.x = -Math.PI / 2;
  for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2; const f = mesh(new THREE.BoxGeometry(0.04, 0.3, 0.5), M.silver, g, Math.cos(a) * 2.05, 0.17, Math.sin(a) * 2.05); f.rotation.y = -a; }
  mesh(new THREE.CylinderGeometry(0.72, 0.6, 0.5, 32), M.gold, g, 0, 0.55, 0);
  mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 16), M.silver, g, 0, 0.9, 0);
  return g;
}
const NOZZLES = [];
function buildDescentStage() {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.2, 8), M.gold, g, 0, 0, 0).rotation.y = Math.PI / 8;
  mesh(new THREE.CylinderGeometry(1.2, 1.35, 0.25, 8), M.dark, g, 0, -0.2, 0).rotation.y = Math.PI / 8;
  for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + 0.3; mesh(new THREE.SphereGeometry(0.42, 24, 16), M.silver, g, Math.cos(a) * 0.78, 0.46, Math.sin(a) * 0.78); }
  for (let k = 0; k < 2; k++) { const a = k * Math.PI + 1.4; mesh(new THREE.SphereGeometry(0.24, 20, 12), M.alu, g, Math.cos(a) * 0.95, 0.34, Math.sin(a) * 0.95); }
  mesh(new THREE.BoxGeometry(0.7, 0.3, 0.5), M.gold, g, 0, 0.3, 0);
  // four engine clusters, two Mars Landing Engines each
  NOZZLES.length = 0;
  for (let k = 0; k < 4; k++) {
    const a = (k + 0.5) * Math.PI / 2, r = 1.72;
    const mod = mesh(new THREE.BoxGeometry(0.55, 0.36, 0.42), M.dark, g, Math.cos(a) * r, -0.05, Math.sin(a) * r); mod.rotation.y = -a;
    mesh(new THREE.BoxGeometry(0.5, 0.08, 0.6), M.gold, g, Math.cos(a) * 1.35, 0.05, Math.sin(a) * 1.35).rotation.y = -a;
    for (let e = -1; e <= 1; e += 2) {
      const b = a + e * 0.14;
      const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 0.32, 16, 1, true), M.black);
      nz.position.set(Math.cos(b) * (r + 0.05), -0.36, Math.sin(b) * (r + 0.05));
      nz.material = M.black; nz.material.side = THREE.DoubleSide;
      g.add(nz);
      NOZZLES.push({ pos: new THREE.Vector3(Math.cos(b) * (r + 0.1), -0.55, Math.sin(b) * (r + 0.1)), dir: new THREE.Vector3(Math.cos(b) * 0.22, -1, Math.sin(b) * 0.22).normalize() });
    }
  }
  // terminal descent radar: six antennas on an angled plate
  const rad = new THREE.Group(); rad.position.set(0.2, -0.3, 1.25); rad.rotation.x = -0.5; g.add(rad);
  mesh(new THREE.BoxGeometry(0.9, 0.06, 0.5), M.alu, rad);
  for (let i = 0; i < 6; i++) mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 12), M.white, rad, -0.35 + (i % 3) * 0.35, -0.05, i < 3 ? -0.12 : 0.12);
  // bridle and umbilical device
  mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.3, 20), M.alu, g, 0, -0.45, 0);
  return g;
}
const WHEELS = [];
function buildRover() {
  const g = new THREE.Group();   // origin: top of the deck at the bridle attach; wheels ≈1.1 m below when deployed
  mesh(new THREE.BoxGeometry(2.2, 0.55, 1.55), M.white, g, 0, -0.3, 0);
  mesh(new THREE.BoxGeometry(2.24, 0.06, 1.6), M.alu, g, 0, -0.02, 0);
  // MMRTG (radioisotope power source) at the back, finned, tilted
  const rtg = new THREE.Group(); rtg.position.set(-1.25, -0.1, 0); rtg.rotation.z = -0.75; g.add(rtg);
  mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.7, 16), M.black, rtg);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; const f = mesh(new THREE.BoxGeometry(0.02, 0.66, 0.22), M.black, rtg, Math.cos(a) * 0.36, 0, Math.sin(a) * 0.36); f.rotation.y = -a; }
  // stowed remote-sensing mast lying on the deck, with its head
  mesh(new THREE.BoxGeometry(1.3, 0.1, 0.12), M.white, g, 0.1, 0.07, 0.55);
  mesh(new THREE.BoxGeometry(0.34, 0.24, 0.3), M.white, g, 0.8, 0.12, 0.55);
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), M.black, g, 0.99, 0.12, 0.47).rotation.z = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.05, 12), M.black, g, 0.99, 0.12, 0.63).rotation.z = Math.PI / 2;
  // high-gain antenna, stowed arm and turret at the front
  mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.05, 6), M.alu, g, -0.55, 0.06, -0.5);
  mesh(new THREE.BoxGeometry(0.12, 0.12, 1.3), M.alu, g, 1.18, -0.3, 0);
  mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), M.dark, g, 1.25, -0.35, -0.55);
  mesh(new THREE.BoxGeometry(0.2, 0.2, 0.3), M.gold, g, 0.3, 0.05, -0.2);
  // hazard cameras, UHF antenna, sample-handling belly pan, deck equipment
  for (const z of [-0.35, 0.35]) mesh(new THREE.BoxGeometry(0.08, 0.1, 0.16), M.black, g, 1.12, -0.18, z);
  mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.32, 8), M.alu, g, -0.2, 0.18, 0.5);
  mesh(new THREE.BoxGeometry(1.6, 0.12, 1.2), M.alu, g, 0.1, -0.62, 0);
  mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5), M.white, g, -0.5, 0.08, 0.1);
  mesh(new THREE.BoxGeometry(0.28, 0.1, 0.28), M.gold, g, 0.55, 0.06, 0.05);
  const arm = new THREE.Group(); arm.position.set(1.18, -0.3, 0); g.add(arm);
  mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.4, 10), M.alu, arm, 0, 0, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 12), M.dark, arm, 0, 0, 0.72).rotation.x = Math.PI / 2;
  // rocker-bogie suspension + six wheels
  WHEELS.length = 0;
  for (const side of [-1, 1]) {
    const susp = new THREE.Group(); susp.position.set(0, -0.35, side * 0.85); g.add(susp);
    susp.userData.side = side;
    const legs = [];
    for (const wx of [1.05, 0, -1.05]) {
      const leg = new THREE.Group(); susp.add(leg);
      const strut = mesh(new THREE.BoxGeometry(0.07, 0.55, 0.07), M.alu, leg, 0, -0.27, 0);
      const wheel = new THREE.Group(); wheel.position.set(0, -0.55, side * 0.17); leg.add(wheel);
      const tire = mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.25, 24), M.alu, wheel); tire.rotation.x = Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.27, 12), M.dark, wheel).rotation.x = Math.PI / 2;
      for (let c = 0; c < 12; c++) { const a = c / 12 * Math.PI * 2; const cl = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.25), M.dark, wheel, Math.cos(a) * 0.265, Math.sin(a) * 0.265, 0); cl.rotation.z = a; }
      leg.userData.x = wx; leg.position.set(wx, 0, 0);
      legs.push(leg);
      WHEELS.push({ leg, strut, wheel, side, wx });
    }
    mesh(new THREE.BoxGeometry(2.2, 0.08, 0.08), M.alu, susp, 0, -0.02, 0);
  }
  return g;
}
function setWheelFold(f) {
  // f = 0 stowed (tucked up and in), 1 deployed for landing
  for (const w of WHEELS) {
    w.leg.position.set(w.wx * lerp(0.82, 1, f), lerp(0.25, 0, f), 0);
    w.leg.rotation.x = lerp(-w.side * 0.5, 0, f);
  }
}
function buildChute() {
  // local frame: origin at the backshell attach, +Y up the riser toward the canopy
  const g = new THREE.Group();
  const riser = 7, lines = 36, band = 2.8, gap = 1.1;
  const skirtR = 7.0, bandR = 7.35, rimR = 7.6;
  const yBand0 = riser + lines, yBand1 = yBand0 + band, yDisk0 = yBand1 + gap;
  // band (tag rows 4–6), disk rings (rows 0–2, outer→inner = THINGS, MIGHTY, DARE)
  const bandPts = [[skirtR, yBand0], [bandR, yBand0 + band * 0.5], [bandR * 0.99, yBand1]];
  const diskPts = [];
  const vent = 0.8, cap = 3.6;
  const ringRow = (r) => r > 5.4 ? 2 : r > 3.1 ? 1 : 0;
  const rs = [rimR, 6.6, 5.4, 5.4, 4.3, 3.1, 3.1, 2.0, vent];
  for (const r of rs) diskPts.push([r, yDisk0 + cap * (1 - Math.pow(r / rimR, 2)) * 0.95]);
  const build = (pts, rowOf) => {
    const geo = lathe(pts, 240);
    const pos = geo.attributes.position, uv = geo.attributes.uv;
    const n = pts.length;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), y = pos.getY(i);
      const r = Math.hypot(x, z), th = Math.atan2(z, x);
      const fr = ((th / (2 * Math.PI) * 80) % 1 + 1) % 1;
      const bulge = 1 + 0.035 * Math.sin(Math.PI * fr);
      pos.setXYZ(i, x * bulge, y, z * bulge);
      const pi = i % n;
      uv.setY(i, 1 - (rowOf(pi, r) + 0.5) / 8);   // canvas textures are flipped in Y
    }
    geo.computeVertexNormals();
    return geo;
  };
  const canopy = new THREE.Group(); g.add(canopy);
  const diskRows = [2, 2, 2, 1, 1, 1, 0, 0, 0];
  canopy.add(new THREE.Mesh(build(bandPts, (pi) => pi < 1 ? 4 : 5), M.canopy));
  canopy.add(new THREE.Mesh(build(diskPts, (pi) => diskRows[pi]), M.canopy));
  // suspension lines (80) + riser
  const lp = [];
  for (let i = 0; i < 80; i++) { const a = i / 80 * Math.PI * 2; lp.push(Math.cos(a) * skirtR, yBand0, Math.sin(a) * skirtR, 0, riser, 0); }
  lp.push(0, riser, 0, 0, 0, 0);
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
  const linesMesh = new THREE.LineSegments(lg, M.line); g.add(linesMesh);
  // deployment bag
  const bag = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.9, 16), M.white, g, 0, 0, 0);
  g.userData = { canopy, lines: linesMesh, bag, riser, yBand0, lineGeo: lg, skirtR };
  return g;
}

/* ---- effect shaders ---- */
const plasmaMat = new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 }, uTime: U_TIME },
  vertexShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec3 vN; varying vec3 vV; varying vec3 vP;
    void main(){ vP = position; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform float uI, uTime; varying vec3 vN; varying vec3 vV; varying vec3 vP;
    ${NOISE_GLSL}
    void main(){
      #include <logdepthbuf_fragment>
      float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      float n = fbm3(vP * 1.6 + vec3(0.0, uTime * 7.0, 0.0));
      float r = length(vP.xz) / 2.55;
      float core = (1.0 - r * r) * smoothstep(0.2, -1.2, vP.y);          // hottest at the stagnation point
      float rim = pow(f, 2.5) * smoothstep(0.9, -0.2, vP.y);             // glowing edge of the shock layer
      float a = uI * (0.22 * core + 0.75 * rim) * (0.45 + 0.8 * n) * smoothstep(0.9, 0.2, vP.y);
      vec3 c = mix(vec3(1.0, 0.32, 0.06), vec3(1.0, 0.72, 0.42), core) + vec3(0.7, 0.1, 0.5) * rim * 0.35;
      gl_FragColor = vec4(c * a * 1.1, 1.0);
    }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
});
const glowMat = new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 }, uCol: { value: new THREE.Color(1, 0.55, 0.25) } },
  vertexShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform float uI; uniform vec3 uCol; varying vec2 vUv;
    void main(){
      #include <logdepthbuf_fragment>
      float r = length(vUv - 0.5) * 2.0; float a = pow(max(1.0 - r, 0.0), 3.0) * uI;
      gl_FragColor = vec4(uCol * a * 0.7 + vec3(1.0, 0.8, 0.6) * pow(max(1.0 - r * 2.2, 0.0), 4.0) * uI * 0.5, 1.0);
    }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
});
const wakeMat = new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 }, uTime: U_TIME, uLen: { value: 60 } },
  vertexShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform float uI, uTime, uLen; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    ${NOISE_GLSL}
    void main(){
      #include <logdepthbuf_fragment>
      float along = vUv.y;                       // 0 at the shoulder → 1 at the tail
      float edge = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      float streak = fbm2(vec2(vUv.x * 22.0, along * uLen * 0.25 - uTime * 30.0));
      float st = smoothstep(0.3, 0.8, streak);
      float a = uI * pow(1.0 - along, 1.6) * (0.12 + 1.1 * st) * (0.25 + 0.75 * pow(edge, 1.2)) * smoothstep(0.0, 0.04, along);
      vec3 c = mix(vec3(1.0, 0.45, 0.16), vec3(0.8, 0.2, 0.42), smoothstep(0.0, 0.7, along));
      gl_FragColor = vec4(c * a * 0.75, 1.0);
    }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
});
const plumeMat = new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 }, uTime: U_TIME },
  vertexShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_fragment>
    uniform float uI, uTime; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
    ${NOISE_GLSL}
    void main(){
      #include <logdepthbuf_fragment>
      float along = 1.0 - vUv.y;
      float face = abs(dot(normalize(vN), normalize(vV)));
      float n = vnoise2(vec2(vUv.x * 9.0, along * 7.0 - uTime * 40.0));
      // hydrazine exhaust is almost transparent: a faint hot core and shimmer
      float a = uI * pow(1.0 - along, 2.0) * (0.45 + 0.55 * n) * pow(face, 1.5);
      gl_FragColor = vec4(vec3(1.0, 0.72, 0.45) * a * 0.9 + vec3(0.5, 0.65, 1.0) * a * pow(1.0 - along, 8.0), 1.0);
    }`,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide
});

/* ---- assemble ---- */
const stack = new THREE.Group(); world.add(stack);          // aeroshell frame (moves as one until the heat shield goes)
const heatShield = buildHeatShield(); stack.add(heatShield);
const backshell = buildBackshell(); stack.add(backshell);
const cruise = buildCruiseStage(); cruise.position.y = 2.26; stack.add(cruise);
const dsGroup = buildDescentStage(); dsGroup.scale.setScalar(0.88);
const rover = buildRover();
const dsHolder = new THREE.Group(); world.add(dsHolder); dsHolder.add(dsGroup);
const roverHolder = new THREE.Group(); world.add(roverHolder); roverHolder.add(rover);
const chute = buildChute(); world.add(chute);
const cbms = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.2), M.tungsten); world.add(m); return m; });
const ebms = [0, 1, 2, 3, 4, 5].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.26, 10), M.tungsten); world.add(m); return m; });
// plasma sheath, bow glow and wake (children of the stack)
const plasma = (() => {
  // shock layer: a shell standing off in front of the heat shield, wrapping round the shoulder
  const pts = [[0, -1.35]];
  for (let i = 1; i <= 10; i++) { const u = i / 10; pts.push([2.55 * Math.sin(u * Math.PI * 0.5), -1.35 + 1.15 * (1 - Math.cos(u * Math.PI * 0.5)) + 0.35 * u * u]); }
  pts.push([2.5, 0.35], [2.2, 0.9]);
  const m = new THREE.Mesh(lathe(pts, 64), plasmaMat); stack.add(m); return m;
})();
const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), glowMat); stack.add(glow);
const wake = (() => {
  const pts = []; for (let i = 0; i <= 24; i++) { const u = i / 24; pts.push(new THREE.Vector2(2.2 + 1.4 * Math.sin(Math.min(u * 3, 1) * Math.PI / 2) - 2.8 * Math.pow(u, 1.6), u)); }
  pts.forEach(p => { p.x = Math.max(p.x, 0.25); });
  const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 48), wakeMat); m.position.y = -0.1; stack.add(m); return m;
})();
// descent-stage plumes
const plumes = NOZZLES.map(nz => {
  const geo = new THREE.CylinderGeometry(0.1, 0.55, 1, 20, 1, true); geo.translate(0, -0.5, 0);
  const m = new THREE.Mesh(geo, plumeMat); m.position.copy(nz.pos);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), nz.dir);
  dsGroup.add(m); return m;
});
// bridles (three + umbilical) as lines between the descent stage and the rover
const bridleGeo = new THREE.BufferGeometry(); bridleGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(24), 3));
const bridles = new THREE.LineSegments(bridleGeo, new THREE.LineBasicMaterial({ color: 0xf2eee6 })); bridles.frustumCulled = false; world.add(bridles);
// blob shadows for the last hundred metres
const shadowTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(.6, 'rgba(0,0,0,.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }, false);
const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.8 });
const shadows = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat.clone()); m.rotation.x = -Math.PI / 2; m.renderOrder = 2; world.add(m); return m; });

/* ---- particles ---- */
function makePoints(n, color, blending, size) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  g.setAttribute('aA', new THREE.BufferAttribute(new Float32Array(n), 1));
  g.setAttribute('aS', new THREE.BufferAttribute(new Float32Array(n), 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uTex: { value: spriteTex }, uCol: { value: new THREE.Color(color) }, uScale: { value: innerHeight * 0.5 }, uSize: { value: size } },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute float aA; attribute float aS; uniform float uScale, uSize; varying float vA;
      void main(){ vA = aA; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = clamp(uSize * aS * uScale / max(-mv.z, 0.1), 0.0, 160.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uTex; uniform vec3 uCol; varying float vA;
      void main(){
        #include <logdepthbuf_fragment>
        vec4 t = texture2D(uTex, gl_PointCoord); if (vA * t.a < 0.004) discard; gl_FragColor = vec4(uCol, vA * t.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending
  });
  const p = new THREE.Points(g, m); p.frustumCulled = false; p.userData.n = n; p.userData.parts = [];
  return p;
}
let sparks, dust;
function buildParticles() {
  if (sparks) { stack.remove(sparks); sparks.geometry.dispose(); }
  if (dust) { world.remove(dust); dust.geometry.dispose(); }
  sparks = makePoints(Q.sparks, 0xffa860, THREE.AdditiveBlending, 0.16); stack.add(sparks);
  dust = makePoints(Q.dust, 0xd9b48a, THREE.NormalBlending, 2.6); world.add(dust);
  dust.userData.O = siteWorld(0, 0, 0);
}
buildParticles();
const rcsPuffs = backshell.userData.thrusters.map(p => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: spriteTex, color: 0xdfe8ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); s.position.copy(p); s.scale.setScalar(0.9); backshell.add(s); return s; });

/* ================================================================== FLIGHT DATA */
let DATA = null;
const INFO = {};   // id → {label, text, real, src}
const FALLBACK = { cruiseSep: 'Cruise stage separation', cbm: 'Cruise balance masses ejected', ei: 'Entry interface', guidance: 'Guided entry begins', peakHeat: 'Peak heating', peakDecel: 'Peak deceleration', bankRev1: 'Bank reversal 1', bankRev2: 'Bank reversal 2', bankRev3: 'Bank reversal 3', heading: 'Heading alignment', sufr: 'Straighten Up and Fly Right (SUFR)', chute: 'Parachute deploy', hsSep: 'Heat shield separation', lvs: 'Lander Vision System starts', trnFix: 'TRN fix, safe target chosen', bsSep: 'Backshell separation', mle: 'Powered descent', divert: 'Divert', cv: 'Constant-velocity descent', skyCrane: 'Sky crane', bridleFull: 'Bridles fully out', touchdown: 'Touchdown', bridleCut: 'Bridles cut', flyaway: 'Flyaway', dsImpact: 'Descent stage impact', crash: 'Impact', chuteFail: 'Parachute failure', fuelOut: 'Propellant exhausted' };
const MAJOR = new Set(['cruiseSep', 'ei', 'peakHeat', 'peakDecel', 'chute', 'hsSep', 'trnFix', 'bsSep', 'skyCrane', 'touchdown', 'crash', 'flyaway']);
const QUIET = new Set(['divert', 'bridleFull', 'bridleCut', 'guidance', 'cbm', 'mle']);   // no caption, still on the timeline
function info(id) { return INFO[id] || { label: FALLBACK[id] || id, text: '', real: '' }; }

let flight = null;       // {samples, events, E(id), tStart, tEnd, tEarthEnd, opts, result}
const NOMINAL = {};
function computeFlight(opts) {
  const sim = new P.EDLSim(opts); sim.run(0.1);
  const pre = P.approachTrack(opts, 610, 1).filter(s => s.t < 0);
  const samples = pre.concat(sim.samples);
  const events = [{ id: 'cruiseSep', t: -600 }, { id: 'cbm', t: -588 }].concat(sim.events.map(e => Object.assign({}, e)));
  // the peak events are fired a little after the peak; place them at the peak itself
  events.forEach(e => { if ((e.id === 'peakDecel' || e.id === 'peakHeat') && e.t != null) { /* keep event time as fired: the recorded extra.t is the peak */ if (e.id === 'peakDecel') e.t = sim.max.gT; } });
  events.sort((a, b) => a.t - b.t);
  const E = (id) => events.find(e => e.id === id);
  const last = samples[samples.length - 1].t;
  const tEnd = Math.max(last, (E('touchdown') || E('crash') || { t: last }).t + 12);
  const lastMars = Math.max(...events.map(e => e.t));
  const f = { samples, events, E, tStart: -610, tEnd: Math.max(tEnd, lastMars + 6), opts, result: sim.result, sim };
  f.tEarthEnd = Math.min(Math.max(...events.map(e => e.t)) + OWLT + 14, f.tEnd + OWLT + 20);
  f.td = sim.td ? { x: sim.td.x, z: sim.td.z } : null;
  f.trn = E('trnFix');
  f.crashAt = E('crash') ? [E('crash').t] : null;
  return f;
}

/* sample interpolation */
const NUM = ['down', 'h', 'z', 'v', 'vh', 'vr', 'gamma', 'M', 'q', 'g', 'Tw', 'qdot', 'bank', 'LD', 'm', 'thr', 'fuel', 'L'];
function sampleAt(t) {
  const s = flight.samples;
  if (t <= s[0].t) return Object.assign({}, s[0], { t });
  if (t >= s[s.length - 1].t) return Object.assign({}, s[s.length - 1], { t });
  let lo = 0, hi = s.length - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (s[mid].t <= t) lo = mid; else hi = mid; }
  const a = s[lo], b = s[hi], u = (t - a.t) / Math.max(b.t - a.t, 1e-9);
  const o = { t, phase: a.phase };
  for (const k of NUM) o[k] = a[k] + (b[k] - a[k]) * u;
  o.chute = (a.chute < 0 || b.chute < 0) ? -1 : a.chute + (b.chute - a.chute) * u;
  o.sw = [lerp(a.sw[0], b.sw[0], u), lerp(a.sw[1], b.sw[1], u)];
  o.tdir = a.tdir && b.tdir ? [lerp(a.tdir[0], b.tdir[0], u), lerp(a.tdir[1], b.tdir[1], u), lerp(a.tdir[2], b.tdir[2], u)] : (a.tdir || b.tdir);
  o.ds = a.ds && b.ds ? mix3(a.ds, b.ds, u) : (a.ds || null);
  o.bodies = a.bodies.map((ba, i) => { const bb = b.bodies[i] || ba; return [ba[0], lerp(ba[1], bb[1], u), lerp(ba[2], bb[2], u), lerp(ba[3], bb[3], u), ba[4]]; });
  return o;
}
function evT(id, fb = 1e9) { const e = flight && flight.E(id); return e ? e.t : fb; }

/* ================================================================== POSE THE VEHICLES */
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4();
const pose = {
  stackW: [0, 0, 0], dsW: [0, 0, 0], roverW: [0, 0, 0], vdir: [1, 0, 0], U: [0, 1, 0], E: [1, 0, 0], agl: 1e5,
  chuteTopW: [0, 0, 0], target: [0, 0], tdW: [0, 0, 0], hsW: null, bsW: null, focusW: [0, 0, 0]
};
function orient(obj, yAxis, xHint) {
  const Y = tmpV.set(yAxis[0], yAxis[1], yAxis[2]).normalize();
  const X = tmpV2.set(xHint[0], xHint[1], xHint[2]);
  X.addScaledVector(Y, -X.dot(Y));
  if (X.lengthSq() < 1e-6) X.set(1, 0, 0).addScaledVector(Y, -Y.x);
  X.normalize();
  const Z = new THREE.Vector3().crossVectors(X, Y);
  tmpM.makeBasis(X, Y, Z);
  obj.quaternion.setFromRotationMatrix(tmpM);
}
let S = null, lastBank = 0, bankRate = 0;
function updatePose(dt) {
  const t = S.t, b = basis(S.down);
  pose.U = b.U; pose.E = b.E;
  const vd = add3(add3([0, 0, 0], b.E, Math.cos(S.gamma)), b.U, Math.sin(S.gamma));
  pose.vdir = vd;
  const tHS = evT('hsSep'), tBS = evT('bsSep'), tTD = evT('touchdown'), tCut = evT('bridleCut'), tSufr = evT('sufr'), tChute = evT('chute');
  const tCS = -600;
  const powered = t >= tBS;
  // ---- the aeroshell stack / parachute descent
  const posW = siteWorld(S.down, S.h, S.z);
  pose.agl = S.h - P.terrainHeight(S.down, S.z);
  // capsule attitude: heat shield into the flow, trimmed ≈16° by the centre-of-mass offset, rolled by the bank angle
  const nUp = add3(add3([0, 0, 0], b.E, -Math.sin(S.gamma)), b.U, Math.cos(S.gamma));
  const bank = S.bank * DEG;
  const liftDir = add3(add3([0, 0, 0], nUp, Math.cos(bank)), b.Z, Math.sin(bank));
  const trim = (t > -560 && t < tSufr ? 16 * DEG * smooth(-590, -560, t) : 0) * (S.LD > 0 ? 1 : 0);
  let aft = add3(add3([0, 0, 0], vd, -Math.cos(trim)), liftDir, -Math.sin(trim));
  if (t >= tChute) {
    // under the parachute the stack hangs below the canopy and swings a little
    const sw = Math.sin(t * 1.3) * 0.06 + Math.sin(t * 0.47) * 0.04;
    aft = add3(add3([0, 0, 0], vd, -1), b.E, sw);
  }
  // before the entry turn the stack flies with its axis along the velocity as well
  bankRate = lerp(bankRate, (S.bank - lastBank) / Math.max(dt, 1e-3), 0.2); lastBank = S.bank;
  if (!powered) {
    pose.stackW = posW;
    stack.visible = true;
    orient(stack, aft, liftDir);
  }
  // ---- heat shield
  if (t < tHS) { heatShield.parent !== stack && stack.add(heatShield); heatShield.position.set(0, 0, 0); heatShield.quaternion.identity(); pose.hsW = null; }
  else {
    const bd = S.bodies.find(x => x[0] === 'heatShield');
    if (heatShield.parent !== world) world.add(heatShield);
    if (bd) { pose.hsW = siteWorld(bd[1], bd[2], bd[3]); const k = t - tHS; orient(heatShield, add3(b.U, b.E, Math.sin(k * 0.8) * 0.15), b.E); }
  }
  // ---- cruise stage and cruise balance masses (drift away from the stack after separation)
  const kC = t - tCS;
  cruise.visible = t < tCS + 400;
  if (t < tCS) { cruise.parent !== stack && stack.add(cruise); cruise.position.set(0, 2.26, 0); cruise.quaternion.identity(); }
  else if (cruise.visible) {
    if (cruise.parent !== world) world.add(cruise);
    const w = add3(add3(posW, aft, 2.26 + 0.35 * kC), b.Z, 0.08 * kC);
    cruise.userData.W = w; orient(cruise, aft, b.Z); cruise.rotateY(kC * 0.2);
  }
  cbms.forEach((m, i) => {
    const k = t - evT('cbm', -588); m.visible = k > 0 && k < 300;
    if (m.visible) { m.userData.W = add3(add3(posW, b.Z, (i ? 1 : -1) * (2.2 + 0.5 * k)), aft, 0.6 + 0.05 * k); m.rotation.set(k * 1.3, k * (i ? 0.7 : -0.9), 0); }
  });
  ebms.forEach((m, i) => {
    const k = t - tSufr; m.visible = k > 0 && k < 50 && !powered;
    if (m.visible) {
      const a = i / 6 * Math.PI * 2;
      const side = add3(add3([0, 0, 0], b.Z, Math.cos(a)), nUp, Math.sin(a));
      const bd = S.bodies.find(x => x[0] === 'ebm');
      const base = bd ? siteWorld(bd[1], bd[2], bd[3]) : posW;
      m.userData.W = add3(add3(base, side, 2.3 + 1.6 * k), vd, -0.8 * k * (i % 2 ? 1 : 0.7));
      m.rotation.set(k * (2 + i), k * 1.4, 0);
    }
  });
  // ---- backshell (+ parachute) after separation
  if (powered) {
    const bd = S.bodies.find(x => x[0] === 'backshell');
    if (bd) {
      pose.bsW = siteWorld(bd[1], bd[2], bd[3]);
      stack.visible = !bd[4] || t < tBS + 200;
      pose.stackW = pose.bsW;
      orient(stack, add3(basis(bd[1]).U, b.E, Math.sin(t * 0.9) * 0.08), b.E);
    }
  }
  heatShield.visible = true;
  // ---- descent stage + rover
  let dsW;
  if (!powered) {
    // stowed inside the backshell: descent stage above, rover below (stack frame)
    dsHolder.visible = t >= tHS; roverHolder.visible = t >= tHS - 0.01;
    tmpV.set(0, 0.95, 0).applyQuaternion(stack.quaternion);
    dsW = add3(posW, [tmpV.x, tmpV.y, tmpV.z]);
    dsHolder.quaternion.copy(stack.quaternion);
    tmpV.set(0, 0.36, 0).applyQuaternion(stack.quaternion);
    pose.roverW = add3(posW, [tmpV.x, tmpV.y, tmpV.z]);
    roverHolder.quaternion.copy(stack.quaternion);
    setWheelFold(0);
  } else {
    dsHolder.visible = true; roverHolder.visible = true;
    dsW = (t >= tCut && S.ds) ? siteWorld(S.ds[0], S.ds[1], S.ds[2]) : posW;
    const up = S.tdir && S.thr > 0.001 ? S.tdir : [0, 1, 0];
    const bw = basis(S.ds ? S.ds[0] : S.down);
    const upW = add3(add3(add3([0, 0, 0], bw.E, up[0]), bw.U, up[1]), bw.Z, up[2]);
    orient(dsHolder, upW, bw.E);
    const tCr = evT('skyCrane');
    if (t < tCr) {
      tmpV.set(0, -0.62, 0).applyQuaternion(dsHolder.quaternion);
      pose.roverW = add3(dsW, [tmpV.x, tmpV.y, tmpV.z]);
      roverHolder.quaternion.copy(dsHolder.quaternion);
      setWheelFold(0);
    } else if (t < tTD || !flight.td) {
      const L = Math.max(S.L, 0.62);
      const off = [L * Math.sin(S.sw[0]), -L * Math.cos(S.sw[0]) * Math.cos(S.sw[1]), L * Math.sin(S.sw[1])];
      pose.roverW = add3(add3(add3(dsW, bw.E, off[0]), bw.U, off[1]), bw.Z, off[2]);
      orient(roverHolder, add3(bw.U, bw.E, -S.sw[0] * 0.5), bw.E);
      setWheelFold(smooth(tCr + 0.5, tCr + 5.5, t));
    } else {
      const g = P.terrainHeight(flight.td.x, flight.td.z);
      pose.roverW = siteWorld(flight.td.x, g + P.DS.roverH, flight.td.z);
      orient(roverHolder, basis(flight.td.x).U, basis(flight.td.x).E);
      setWheelFold(1);
    }
  }
  pose.dsW = dsW;
  // ---- the parachute
  updateChute(t, tChute, powered);
  // ---- focus point for cameras
  pose.focusW = powered ? (t < evT('skyCrane') ? dsW : mix3(dsW, pose.roverW, t < tTD ? 0.5 : 0.85)) : posW;
}

function updateChute(t, tChute, powered) {
  const u = chute.userData;
  if (t < tChute || !(S.chute !== 0 || t >= tChute)) { chute.visible = false; return; }
  chute.visible = true;
  // attach at the top of the backshell, pointing up (away from the flow)
  tmpV.set(0, 2.25, 0).applyQuaternion(stack.quaternion);
  const top = add3(pose.stackW, [tmpV.x, tmpV.y, tmpV.z]);
  chute.userData.W = top;
  chute.quaternion.copy(stack.quaternion);
  const tau = t - tChute;
  const failed = S.chute < 0;
  const inflate = failed ? 0.12 : clamp(S.chute / P.CHUTE.overshoot, 0, 1.15);
  const shown = tau >= P.CHUTE.tLineStretch;
  // mortar: the bag leaves at ≈40 m/s and pulls the lines out
  const reach = Math.min(1, tau * 40 / (u.riser + 36 + 4));
  u.bag.visible = !shown && !failed;
  u.bag.position.set(0, reach * (u.riser + 36), 0);
  u.canopy.visible = shown;
  u.lines.visible = shown;
  if (shown) {
    const breathe = S.M > 0.9 && !failed ? 1 + 0.045 * Math.sin(t * 11) + 0.02 * Math.sin(t * 23) : 1;
    const xs = Math.max(0.08, Math.pow(inflate, 0.8)) * breathe, ys = lerp(2.4, 1, clamp(inflate * 1.5, 0, 1));
    u.canopy.scale.set(xs, 1, xs);
    u.canopy.position.y = 0;
    u.canopy.children.forEach(c => { c.scale.set(1, ys, 1); c.position.y = (1 - ys) * (u.yBand0 + 2); });
    // lines follow the skirt radius
    const p = u.lineGeo.attributes.position;
    for (let i = 0; i < 80; i++) { const a = i / 80 * Math.PI * 2; p.setXYZ(i * 2, Math.cos(a) * u.skirtR * xs, u.yBand0 * 1.0 + (1 - ys) * (u.yBand0 + 2) * 0 , Math.sin(a) * u.skirtR * xs); }
    p.needsUpdate = true;
    if (failed) { u.canopy.rotation.z = Math.sin(t * 7) * 0.25; }
  }
  // riser wobble: the canopy trails a few degrees off the stack axis
  chute.rotateX(Math.sin(t * 0.9) * 0.05); chute.rotateZ(Math.cos(t * 0.7) * 0.04);
  chute.visible = !(powered && t > evT('bsSep') + 220);
}

/* ================================================================== EFFECTS */
const PEAK_Q = 5.6e5;
let dustAcc = 0;
function updateEffects(dt, tReal) {
  U_TIME.value = tReal;
  const t = S.t;
  // plasma: brightness follows the stagnation heating
  const I = Math.max(clamp(Math.pow(S.qdot / PEAK_Q, 0.7), 0, 1.2) - 0.08, 0) / 0.92 * (t < evT('hsSep') ? 1 : 0);
  plasmaMat.uniforms.uI.value = I * 0.9;
  plasma.visible = wake.visible = glow.visible = I > 0.01;
  glowMat.uniforms.uI.value = I;
  // bow glow faces the camera, in front of the heat shield
  glow.position.set(0, -1.3, 0);
  glow.quaternion.copy(stack.quaternion).invert().multiply(camera.quaternion);
  glow.scale.setScalar(9 + 5 * I);
  wakeMat.uniforms.uI.value = I * 0.85;
  wake.scale.set(1, 18 + 70 * I, 1);
  wakeMat.uniforms.uLen.value = wake.scale.y;
  // heat shield: blackbody-ish emission from the surface temperature
  const Tk = t < evT('hsSep') ? S.Tw : 250;
  const glowK = clamp((Tk - 800) / 1000, 0, 1.2);
  M.heat.emissive.setRGB(1.0, 0.26 + 0.2 * clamp(glowK, 0, 1), 0.05 + 0.05 * clamp(glowK, 0, 1));
  M.heat.emissiveIntensity = 0.7 * glowK * glowK;
  // sparks shed from the shoulder into the wake
  const sp = sparks.userData, pp = sparks.geometry.attributes.position, pa = sparks.geometry.attributes.aA, ps = sparks.geometry.attributes.aS;
  const rnd = Math.random;
  if (sp.parts.length === 0) for (let i = 0; i < sp.n; i++) sp.parts.push({ life: 0 });
  for (let i = 0; i < sp.n; i++) {
    const q = sp.parts[i];
    q.life -= dt;
    if (q.life <= 0 && I > 0.15 && rnd() < I * 0.5) {
      const a = rnd() * Math.PI * 2;
      q.p = [Math.cos(a) * 2.25, -0.12, Math.sin(a) * 2.25];
      q.v = [Math.cos(a) * (0.5 + rnd() * 2), 40 + rnd() * 120, Math.sin(a) * (0.5 + rnd() * 2)];
      q.life = q.max = 0.3 + rnd() * 0.7;
    }
    if (q.life > 0) {
      q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
      pp.setXYZ(i, q.p[0], q.p[1], q.p[2]); pa.setX(i, (q.life / q.max) * I); ps.setX(i, 0.4 + rnd() * 0.3);
    } else pa.setX(i, 0);
  }
  pp.needsUpdate = pa.needsUpdate = ps.needsUpdate = true;
  // reaction-control thruster puffs during bank reversals
  const rc = Math.abs(bankRate) > 2 && t < evT('sufr') ? clamp(Math.abs(bankRate) / 20, 0, 1) : 0;
  rcsPuffs.forEach((s, i) => { s.material.opacity = rc * (0.5 + 0.5 * Math.random()) * ((i + (bankRate > 0 ? 0 : 1)) % 2 ? 1 : 0.2); s.scale.setScalar(0.6 + rc * 1.2); });
  // descent-stage plumes
  const thr = S.thr || 0;
  plumeMat.uniforms.uI.value = thr > 0.001 ? 0.18 + 0.3 * thr : 0;
  plumes.forEach(m => { m.visible = thr > 0.001; m.scale.set(1, 1.2 + 5 * thr, 1); });
  // dust: kicked up where the plumes hit the ground
  const dd = dust.userData, dpos = dust.geometry.attributes.position, da = dust.geometry.attributes.aA, ds = dust.geometry.attributes.aS;
  if (dd.parts.length === 0) for (let i = 0; i < dd.n; i++) dd.parts.push({ life: 0 });
  const dsSite = S.ds && t >= evT('bridleCut') ? S.ds : [S.down, S.h, S.z];
  const gH = P.terrainHeight(dsSite[0], dsSite[2]);
  const agl = dsSite[1] - gH;
  let rate = t >= evT('bsSep') && t < evT('bridleCut') + 3 ? thr * clamp((40 - agl) / 30, 0, 1) * 900 : 0;
  // touchdown puff and the descent stage's crash
  const tTd = evT('touchdown'), tImp = evT('dsImpact');
  const burst = [];
  if (t >= tTd && t < tTd + 0.6 && flight.td) burst.push([flight.td.x, flight.td.z, 60, 3]);
  const imp = flight.E('dsImpact');
  if (imp && t >= tImp && t < tImp + 3 && S.ds) burst.push([S.ds[0], S.ds[2], 300, 12]);
  const O = [0, 0];     // dust positions are site (x, z) relative to the target, y above datum
  dustAcc += rate * dt;
  for (let i = 0; i < dd.n; i++) {
    const q = dd.parts[i];
    q.life -= dt;
    if (q.life <= 0) {
      let src = null;
      if (dustAcc >= 1) { dustAcc -= 1; src = [dsSite[0] + (rnd() - 0.5) * 6, dsSite[2] + (rnd() - 0.5) * 6, 3 + rnd() * 9, 0.8]; }
      else for (const b of burst) if (rnd() < b[2] * dt / 10) { src = [b[0], b[1], b[3] * (0.5 + rnd()), 2.2]; break; }
      if (src) {
        const a = rnd() * Math.PI * 2, sp0 = src[2];
        q.p = [src[0] + Math.cos(a) * 1.5, gH + 0.3, src[1] + Math.sin(a) * 1.5];
        q.v = [Math.cos(a) * sp0, (0.5 + rnd() * 2.5) * src[3], Math.sin(a) * sp0];
        q.life = q.max = 1.5 + rnd() * 3.5; q.s = 0.6 + rnd() * 0.8;
      }
    }
    if (q.life > 0) {
      const k = Math.exp(-dt * 1.2);
      q.v[0] *= k; q.v[2] *= k; q.v[1] = q.v[1] * k - 0.3 * dt;
      q.p[0] += q.v[0] * dt; q.p[1] += q.v[1] * dt; q.p[2] += q.v[2] * dt;
      const age = 1 - q.life / q.max;
      dpos.setXYZ(i, q.p[0] - O[0], q.p[1], q.p[2] - O[1]);
      da.setX(i, Math.sin(Math.PI * Math.min(age * 3, 1)) * (1 - age * 0.8) * 0.7); ds.setX(i, q.s * (1 + age * 3));
    } else da.setX(i, 0);
  }
  dpos.needsUpdate = da.needsUpdate = ds.needsUpdate = true;
  // blob shadows under the descent stage and the rover
  const shade = (m, W, size) => {
    // project along the Sun onto the local ground (flat approximation near the site)
    const siteX = S.down, siteZ = S.z;
    const hAbove = W[1] - siteWorld(siteX, P.terrainHeight(siteX, siteZ), siteZ)[1];
    m.visible = hAbove < 140 && hAbove > -2 && t >= evT('bsSep');
    if (!m.visible) return;
    const gx = W[0] - SUN.x / SUN.y * hAbove, gz = W[2] - SUN.z / SUN.y * hAbove;
    const gy = siteWorld(gx, P.terrainHeight(gx, gz), gz)[1] + 0.08;
    m.userData.W = [gx, gy, gz];
    m.scale.setScalar(size * (1 + hAbove * 0.01));
    m.material.opacity = 0.85 * (1 - hAbove / 140);
  };
  shade(shadows[0], pose.dsW, 5.2);
  shade(shadows[1], pose.roverW, 3.6);
  // bridles
  const bp = bridleGeo.attributes.position;
  const showB = t >= evT('skyCrane') && t < evT('bridleCut');
  bridles.visible = showB;
  if (showB) {
    const dsA = add3(pose.dsW, pose.U, -0.55);
    const pts = [[0.6, 0.5], [0.6, -0.5], [-0.7, 0], [0.1, 0.1]];
    pts.forEach((o, i) => {
      tmpV.set(o[0], 0.02, o[1]).applyQuaternion(roverHolder.quaternion);
      const r = add3(pose.roverW, [tmpV.x, tmpV.y, tmpV.z]);
      const a = add3(dsA, [tmpV.x * 0.3, 0, tmpV.z * 0.3]);
      bp.setXYZ(i * 2, a[0] - CAM[0], a[1] - CAM[1], a[2] - CAM[2]);
      bp.setXYZ(i * 2 + 1, r[0] - CAM[0], r[1] - CAM[1], r[2] - CAM[2]);
    });
    bp.needsUpdate = true;
  }
}

/* place world-fixed things relative to the camera (floating origin) */
function placeWorld() {
  rel(pose.stackW, stack.position);
  if (heatShield.parent === world && pose.hsW) rel(pose.hsW, heatShield.position);
  if (cruise.parent === world && cruise.userData.W) rel(cruise.userData.W, cruise.position);
  cbms.forEach(m => m.visible && rel(m.userData.W, m.position));
  ebms.forEach(m => m.visible && rel(m.userData.W, m.position));
  rel(pose.dsW, dsHolder.position);
  rel(pose.roverW, roverHolder.position);
  if (chute.visible && chute.userData.W) rel(chute.userData.W, chute.position);
  shadows.forEach(m => m.visible && m.userData.W && rel(m.userData.W, m.position));
  planet.position.set(-CAM[0], -R - CAM[1], -CAM[2]);
  patches.forEach(p => rel(p.userData.O, p.position));
  if (rocks) rel(rocks.userData.O, rocks.position);
  rel(dust.userData.O, dust.position);
  // the dust origin is the target at datum; dust particle coords are (site x, y, site z) in a flat frame there
  bridles.position.set(0, 0, 0);
}

/* ================================================================== CAMERA DIRECTOR */
const cam = {
  mode: params.get('cam') || 'auto', shot: null, prev: null, blend: { w: 1 }, fov: 50,
  free: { yaw: 0.8, pitch: 0.25, dist: 18 }, lastT: null, shake: 0
};
// each shot returns {pos, look (world, double), fov, up?}
function chuteAxis() { tmpV2.set(0, 1, 0).applyQuaternion(stack.quaternion); return [tmpV2.x, tmpV2.y, tmpV2.z]; }
function frameAt(o) { return { U: pose.U, E: pose.E, Z: [0, 0, 1], V: pose.vdir }; }
// horizon dip below the local horizontal at the vehicle's altitude: aim high shots so Mars' limb is in frame
function dip() { const h = Math.max(pose.agl, 1); return Math.acos(R / (R + h)); }
function downLook(f, a, d) { return add3(add3(pose.focusW, f.E, Math.cos(a) * d), f.U, -Math.sin(a) * d); }
const SHOTS = {
  idle: (tr) => {
    // above and beside the stack, looking down past it at Mars: the planet fills the lower part of the frame
    const f = frameAt(); const a = 0.6 + tr * 0.035, dp = dip();
    const el = Math.min(dp * 0.85, 40 * DEG), d = 18;
    const pos = add3(add3(add3(pose.focusW, f.Z, Math.cos(a) * d * Math.cos(el)), f.E, -Math.sin(a) * d * Math.cos(el)), f.U, d * Math.sin(el));
    return { pos, look: add3(pose.focusW, f.U, -1.2), fov: 50 };
  },
  cruise: () => { const f = frameAt(), dp = dip(); return { pos: add3(add3(add3(pose.focusW, f.E, -12), f.U, 8), f.Z, 10), look: downLook(f, dp * 0.75, 12), fov: 55 }; },
  coast: () => { const f = frameAt(), dp = dip(); return { pos: add3(add3(add3(pose.focusW, f.V, -24), f.U, 12), f.Z, -12), look: downLook(f, dp * 0.8, 30), fov: 55 }; },
  approach: () => { const f = frameAt(); return { pos: add3(add3(add3(pose.focusW, f.V, -20), f.U, 5), f.Z, 8), look: add3(add3(pose.focusW, f.V, 25), f.U, -4), fov: 50 }; },
  plasma: () => { const f = frameAt(); return { pos: add3(add3(add3(pose.focusW, f.V, 7.5), f.Z, 8.5), f.U, 2.2), look: add3(add3(pose.focusW, f.V, -2.5), f.U, -0.6), fov: 50 }; },
  trail: () => { const f = frameAt(); return { pos: add3(add3(add3(pose.focusW, f.V, -16), f.U, 6.5), f.Z, 5), look: add3(add3(pose.focusW, f.E, 40), f.U, -9), fov: 55 }; },
  high: () => { const f = frameAt(), dp = dip(); return { pos: add3(add3(add3(pose.focusW, f.Z, 55), f.U, 20), f.V, -60), look: downLook(f, dp + 4 * DEG, 120), fov: 55 }; },
  mortar: () => { const f = frameAt(); return { pos: add3(add3(add3(pose.focusW, f.V, 5), f.Z, 15), f.U, 2.5), look: add3(pose.focusW, f.V, -9), fov: 58 }; },
  canopy: () => {
    // look up the riser at the canopy, from beside and a little below the backshell
    const A = chuteAxis(), f = frameAt();
    return { pos: add3(add3(add3(pose.focusW, f.Z, 64), A, 12), f.E, -20), look: add3(pose.focusW, A, 21), fov: 56 };
  },
  shield: () => {
    // frame the backshell and the falling heat shield together
    const f = frameAt(), mid = pose.hsW ? mix3(pose.focusW, pose.hsW, 0.5) : add3(pose.focusW, f.U, -6);
    const sep = pose.hsW ? len3(add3(pose.hsW, pose.focusW, -1)) : 10;
    return { pos: add3(add3(add3(mid, f.Z, 22 + sep * 1.1), f.U, -4), f.E, -8), look: mid, fov: 55 };
  },
  descent: () => { const f = frameAt(); return { pos: add3(add3(add3(pose.focusW, f.Z, 150), f.U, 8), f.E, -70), look: add3(add3(pose.focusW, f.U, -8), f.E, 25), fov: 55 }; },
  lvs: () => { const f = frameAt(); return { pos: add3(add3(pose.focusW, f.U, -2.5), f.Z, 0.5), look: add3(add3(pose.focusW, f.U, -1000), f.E, 260), fov: 42, up: f.E }; },
  bsSep: () => {
    const f = frameAt(), up = pose.bsW ? len3(add3(pose.bsW, pose.dsW, -1)) : 10;
    const mid = pose.bsW ? mix3(pose.dsW, pose.bsW, 0.45) : pose.focusW;
    return { pos: add3(add3(add3(mid, f.Z, 18 + up * 1.5), f.U, -6), f.E, -8), look: add3(mid, f.U, -up * 0.08), fov: 58 };
  },
  powered: () => { const f = frameAt(); return { pos: add3(add3(add3(pose.focusW, f.E, -15), f.U, 7), f.Z, 9), look: add3(add3(pose.focusW, f.U, -8), f.E, 6), fov: 55 }; },
  crane: () => {
    const f = frameAt(); const td = flight.td || { x: S.down, z: S.z };
    const g = P.terrainHeight(td.x - 19, td.z + 9);
    return { pos: siteWorld(td.x - 19, g + 2.6, td.z + 9), look: add3(mix3(pose.dsW, pose.roverW, 0.6), pose.U, 1), fov: 58 };
  },
  flyaway: () => {
    const td = flight.td || { x: S.down, z: S.z };
    // behind the rover, looking downrange: the descent stage climbs away over it
    const g = P.terrainHeight(td.x - 14, td.z + 5);
    const k = clamp((S.t - evT('bridleCut')) / 8, 0, 1);
    const hDS = len3(add3(pose.dsW, pose.roverW, -1));
    const look = add3(add3(pose.roverW, pose.E, 14), pose.U, 2 + Math.min(hDS * 0.22, 5.5) * k);
    return { pos: siteWorld(td.x - 14, g + 1.9, td.z + 5), look, fov: 64 };
  },
  rest: (tr) => {
    const td = flight.td || { x: S.down, z: S.z }; const a = 2.75 + Math.sin(tr * 0.05) * 0.9;
    const x = td.x + Math.cos(a) * 11.5, z = td.z + Math.sin(a) * 11.5;
    return { pos: siteWorld(x, P.terrainHeight(x, z) + 1.7, z), look: add3(pose.roverW, pose.U, 0.2), fov: 50 };
  },
  crash: () => { const f = frameAt(); return { pos: add3(add3(pose.focusW, f.Z, 60), f.U, 25), look: pose.focusW, fov: 55 }; }
};
function directorShot(t) {
  if (!started) return 'idle';
  const E = (id, fb) => evT(id, fb);
  const tCr = E('crash', 1e9);
  if (t >= tCr - 2 && !flight.td) return t < tCr + 1 ? 'crash' : 'crash';
  if (t < -585) return 'cruise';
  if (t < -22) return 'coast';
  if (t < 42) return 'approach';
  if (t < E('bankRev2', 108)) return 'plasma';
  if (t < E('heading', 150) + 12) return 'trail';
  if (t < E('sufr', 225) - 4) return 'high';
  if (t < E('chute', 244) + 3) return 'mortar';
  if (t < E('hsSep', 264) - 3) return 'canopy';
  if (t < E('hsSep', 264) + 9) return 'shield';
  if (t < E('lvs', 327)) return 'descent';
  if (t < E('bsSep', 351) - 2) return 'lvs';
  if (t < E('bsSep', 351) + 5) return 'bsSep';
  if (t < E('skyCrane', 404) - 4) return 'powered';
  if (t < E('touchdown', 419) + 2.5) return 'crane';
  if (t < E('dsImpact', 448) + 4) return 'flyaway';
  return 'rest';
}
function userShot(mode, tr) {
  const f = frameAt();
  // once the rover is parked, "chase" and "side" orbit it instead of following a vehicle that has stopped
  if ((mode === 'chase' || mode === 'side') && flight.td && S.t > evT('touchdown') + 1) return SHOTS.rest(tr);
  if (mode === 'chase') return { pos: add3(add3(pose.focusW, f.V, -24), f.U, 7), look: add3(pose.focusW, f.V, 20), fov: 52 };
  if (mode === 'side') return { pos: add3(add3(pose.focusW, f.Z, 34), f.U, 3), look: pose.focusW, fov: 50 };
  if (mode === 'ground') {
    // a tracking telescope near the landing site: zooms to keep the spacecraft framed
    const tx = (flight.td ? flight.td.x : 0) + 140, tz = (flight.td ? flight.td.z : 0) + 90;
    const pos = siteWorld(tx, P.terrainHeight(tx, tz) + 1.8, tz);
    const d = len3(add3(pose.focusW, pos, -1));
    const fov = clamp(2 * Math.atan(60 / d) / DEG, 0.6, 60);
    return { pos, look: pose.focusW, fov };
  }
  if (mode === 'free') {
    const F = cam.free, fr = frameAt();
    const dir = add3(add3(add3([0, 0, 0], fr.E, Math.cos(F.pitch) * Math.cos(F.yaw)), fr.Z, Math.cos(F.pitch) * Math.sin(F.yaw)), fr.U, Math.sin(F.pitch));
    return { pos: add3(pose.focusW, dir, F.dist), look: pose.focusW, fov: 50 };
  }
  return SHOTS[directorShot(S.t)](tr);
}
const camState = { pos: null, look: null, fov: 50, up: [0, 1, 0] };
function computeCamera(dt, tr) {
  let name = cam.mode === 'auto' ? directorShot(S.t) : cam.mode;
  if (name !== cam.shot) {
    const jump = cam.lastT != null && Math.abs(S.t - cam.lastT) > 4;
    cam.prev = cam.shot; cam.shot = name;
    if (cam.prev && gsap && !REDUCED && !jump && !STILL) {
      cam.blend.w = 0; gsap.killTweensOf(cam.blend);
      gsap.to(cam.blend, { w: 1, duration: name === 'lvs' || cam.prev === 'lvs' ? 1.0 : 2.2, ease: 'power2.inOut' });
    } else cam.blend.w = 1;
  }
  cam.lastT = S.t;
  const get = (n) => SHOTS[n] ? SHOTS[n](tr) : userShot(n, tr);
  let s = get(name);
  if (cam.blend.w < 1 && cam.prev) {
    const p = get(cam.prev), w = cam.blend.w;
    // blend around the focus so the camera swings rather than cutting through the vehicle
    s = { pos: mix3(p.pos, s.pos, w), look: mix3(p.look, s.look, w), fov: lerp(p.fov, s.fov, w), up: s.up };
  }
  camState.fov = s.fov;
  CAM[0] = s.pos[0]; CAM[1] = s.pos[1]; CAM[2] = s.pos[2];
  camera.position.set(0, 0, 0);
  // up: local vertical at the camera
  const upL = s.up || [CAM[0] / (R + 1e-9) * 0 + (CAM[0]) / Math.hypot(CAM[0], CAM[1] + R, CAM[2]), (CAM[1] + R) / Math.hypot(CAM[0], CAM[1] + R, CAM[2]), CAM[2] / Math.hypot(CAM[0], CAM[1] + R, CAM[2])];
  camera.up.set(upL[0], upL[1], upL[2]);
  const ld = tmpV.set(s.look[0] - CAM[0], s.look[1] - CAM[1], s.look[2] - CAM[2]);
  if (ld.lengthSq() < 1e-6) ld.set(pose.E[0], pose.E[1], pose.E[2]);
  // looking (almost) straight up or down: use the downrange direction as "up" to keep lookAt well defined
  if (Math.abs(ld.clone().normalize().dot(camera.up)) > 0.985) camera.up.set(pose.E[0], pose.E[1], pose.E[2]);
  camera.lookAt(ld);
  // portrait screens: widen the vertical field of view so the shot keeps most of its horizontal framing
  const asp = innerWidth / innerHeight;
  const k = asp < 1.25 ? clamp(Math.pow(1.3 / asp, 0.62), 1, 1.95) : 1;
  const fovEff = Math.min(2 * Math.atan(Math.tan(s.fov * DEG / 2) * k) / DEG, 100);
  if (Math.abs(camera.fov - fovEff) > 0.01) { camera.fov = fovEff; camera.updateProjectionMatrix(); }
  // shake: deceleration, parachute snatch, engines close by
  let shakeA = 0;
  if (shakeOn && !REDUCED && playing) {
    const tc = S.t - evT('chute');
    shakeA = clamp((S.g - 1.5) / 9, 0, 1) * 0.012 + (tc > 1 && tc < 3.5 ? 0.02 * (1 - (tc - 1) / 2.5) : 0);
    if (cam.shot === 'crane' || cam.shot === 'powered' || cam.shot === 'bsSep') shakeA += (S.thr || 0) * 0.004;
    if (cam.shot === 'lvs' || cam.shot === 'crane' || cam.shot === 'rest') shakeA *= 0.3;
  }
  if (shakeA > 0) { camera.rotateX((Math.sin(tr * 31) + Math.sin(tr * 53) * 0.5) * shakeA); camera.rotateY((Math.sin(tr * 27 + 1) + Math.sin(tr * 47) * 0.5) * shakeA); }
  camera.updateMatrixWorld();
}

/* free-camera drag */
(() => {
  let drag = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { if (cam.mode !== 'free') return; drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; cam.free.yaw += (e.clientX - drag.x) * 0.006; cam.free.pitch = clamp(cam.free.pitch + (e.clientY - drag.y) * 0.005, -1.4, 1.4); drag = { x: e.clientX, y: e.clientY }; });
  el.addEventListener('pointerup', () => { drag = null; });
  el.addEventListener('wheel', (e) => { if (cam.mode !== 'free') return; e.preventDefault(); cam.free.dist = clamp(cam.free.dist * Math.exp(e.deltaY * 0.001), 4, 3000); }, { passive: false });
})();

/* ================================================================== LVS OVERLAY */
const lvsEl = $('lvs'), lvsCtx = lvsEl.getContext('2d');
function drawLVS() {
  const on = cam.shot === 'lvs' && cam.mode === 'auto';
  lvsEl.classList.toggle('on', on);
  if (!on) return;
  const dpr = Math.min(devicePixelRatio, 2), W = innerWidth, H = innerHeight;
  if (lvsEl.width !== W * dpr) { lvsEl.width = W * dpr; lvsEl.height = H * dpr; }
  const g = lvsCtx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const t = S.t, t0 = evT('lvs'), fix = evT('trnFix');
  const prog = clamp((t - t0) / Math.max(fix - t0, 1), 0, 1);
  // vignette + reticle
  const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(78,240,184,.8)'; g.lineWidth = 1.2; g.font = '600 12px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(78,240,184,.95)';
  const m = 60; [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]].forEach(([x, y, sx, sy]) => { g.beginPath(); g.moveTo(x, y + 26 * sy); g.lineTo(x, y); g.lineTo(x + 26 * sx, y); g.stroke(); });
  g.beginPath(); g.moveTo(W / 2 - 14, H / 2); g.lineTo(W / 2 + 14, H / 2); g.moveTo(W / 2, H / 2 - 14); g.lineTo(W / 2, H / 2 + 14); g.stroke();
  // landmarks: small craters from the onboard map, projected into the view
  const cr = P.craterList();
  let shown = 0, matched = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < cr.length && shown < 24; i++) {
    const c = cr[i]; if (c[2] < 30) continue;
    const w = siteWorld(c[0], P.terrainHeight(c[0], c[1]), c[1]);
    rel(w, v); v.project(camera);
    if (v.z > 1 || Math.abs(v.x) > 0.9 || Math.abs(v.y) > 0.85) continue;
    const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
    const ok = (i * 0.137) % 1 < prog;
    shown++; if (ok) matched++;
    const s = 10 + Math.min(40, c[2] / Math.max(pose.agl, 500) * 900);
    g.strokeStyle = ok ? 'rgba(78,240,184,.9)' : 'rgba(255,194,75,.7)';
    g.strokeRect(x - s, y - s, 2 * s, 2 * s);
    if (ok) { g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.stroke(); }
  }
  // the chosen safe target
  const tr = flight.trn;
  if (tr && t >= fix) {
    const tg = tr.target; const w = siteWorld(tg[0], P.terrainHeight(tg[0], tg[1]), tg[1]);
    rel(w, v); v.project(camera);
    if (v.z < 1) {
      const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H;
      g.strokeStyle = tr.off ? 'rgba(255,194,75,.95)' : 'rgba(124,200,255,.95)'; g.lineWidth = 2;
      g.beginPath(); g.arc(x, y, 18, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x - 28, y); g.lineTo(x - 20, y); g.moveTo(x + 20, y); g.lineTo(x + 28, y); g.moveTo(x, y - 28); g.lineTo(x, y - 20); g.moveTo(x, y + 20); g.lineTo(x, y + 28); g.stroke();
      g.fillStyle = tr.off ? 'rgba(255,194,75,.95)' : 'rgba(124,200,255,.95)';
      g.fillText(tr.off ? 'NO TRN · LANDING WHERE WE DRIFT' : 'SAFE TARGET', x + 32, y + 4);
    }
  }
  g.fillStyle = 'rgba(78,240,184,.95)';
  const lines = ['LANDER VISION SYSTEM · TERRAIN-RELATIVE NAVIGATION', `ALT ${Math.round(pose.agl)} m   LANDMARKS ${matched}/${shown}`, t >= fix ? (flight.trn && flight.trn.off ? 'TRN OFF: NO MAP-RELATIVE FIX' : 'MAP-RELATIVE FIX · ERROR < 40 m') : 'MATCHING IMAGES TO THE ONBOARD MAP…'];
  lines.forEach((l, i) => g.fillText(l, m + 8, m + 44 + i * 18));
}

/* ================================================================== HUD */
const els = { rAlt: $('rAlt'), rVel: $('rVel'), rMach: $('rMach'), rG: $('rG'), rT: $('rT'), rQ: $('rQ'), rBank: $('rBank'), rRange: $('rRange'), rMass: $('rMass'), rFuel: $('rFuel'),
  cMars: $('cMars'), cMarsUtc: $('cMarsUtc'), cEarth: $('cEarth'), cEarthUtc: $('cEarthUtc'), phase: $('phase'), knows: $('knows'), wire: $('wire') };
function setText(el, html) { if (el._v !== html) { el.innerHTML = html; el._v = html; } }
const fmt = (v, d = 0) => isFinite(v) ? (+v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—';
function fmtE(t) { const s = t < 0 ? '−' : '+'; const a = Math.abs(t); const m = Math.floor(a / 60), ss = Math.floor(a % 60); return `E${s}${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`; }
function fmtUtc(ms) { return new Date(ms).toISOString().slice(11, 19) + ' UTC'; }
function phaseText(t) {
  const E = (id, fb) => evT(id, fb);
  if (flight.E('crash') && t >= E('crash')) return 'Impact · mission lost';
  if (t < -600) return 'Cruise · stack still attached';
  if (t < -30) return `Coasting · ${Math.ceil(-t / 60)} min to the atmosphere`;
  if (t < 0) return 'Seconds from the atmosphere';
  if (t < E('guidance', 50)) return 'Entry · the air is still almost nothing';
  if (t < E('heading', 150)) return 'Guided entry · steering with lift';
  if (t < E('sufr', 225)) return 'Heading alignment';
  if (t < E('chute', 244)) return 'Straighten Up and Fly Right';
  if (t < E('hsSep', 264)) return 'Supersonic parachute';
  if (t < E('lvs', 327)) return 'Parachute descent';
  if (t < E('bsSep', 351)) return 'Terrain-Relative Navigation';
  if (t < E('skyCrane', 404)) return 'Powered descent';
  if (t < E('touchdown', 419)) return 'Sky crane';
  if (t < E('dsImpact', 448)) return 'Touchdown · flyaway';
  if (t < E('touchdown', 419) + OWLT) return 'On Mars · Earth still waiting';
  return 'Landed · signal received on Earth';
}
let hudTimer = 0;
function updateHUD() {
  const t = S.t, powered = t >= evT('bsSep');
  const landed = flight.td && t >= evT('touchdown');
  const hAgl = landed ? 0 : pose.agl;
  if (landed) S = Object.assign({}, S, { v: 0, M: 0, q: 0, g: P.G_SITE / P.G0, m: P.VEH.mRover });
  setText(els.rAlt, hAgl > 10000 ? `${fmt(hAgl / 1000, 1)}<small>km</small>` : `${fmt(Math.max(hAgl, 0), 0)}<small>m</small>`);
  setText(els.rVel, `${fmt(S.v, S.v < 10 ? 2 : 0)}<small>m/s</small>`);
  setText(els.rMach, t < 0 ? '—' : fmt(S.M, 2));
  setText(els.rG, t < 0 ? '0.00<small>g</small>' : `${fmt(S.g, 2)}<small>g</small>`);
  setText(els.rT, t >= evT('hsSep') ? '<span class="ml-sub">jettisoned</span>' : `${fmt(S.Tw - 273.15, 0)}<small>°C</small>`);
  setText(els.rQ, S.q > 1000 ? `${fmt(S.q / 1000, 2)}<small>kPa</small>` : `${fmt(S.q, 0)}<small>Pa</small>`);
  setText(els.rBank, powered || t >= evT('sufr') || t < 0 ? '—' : `${fmt(S.bank, 0)}<small>°</small>`);
  const tg = flight.trn && t >= evT('trnFix') ? flight.trn.target : [0, 0];
  const rng = Math.hypot(S.down - tg[0], S.z - tg[1]);
  setText(els.rRange, rng > 10000 ? `${fmt(rng / 1000, 0)}<small>km</small>` : rng > 1000 ? `${fmt(rng / 1000, 2)}<small>km</small>` : `${fmt(rng, 0)}<small>m</small>`);
  setText(els.rMass, `${fmt(S.m, 0)}<small>kg</small>`);
  setText(els.rFuel, `${fmt(S.fuel, 0)}<small>kg</small>`);
  // clocks
  setText(els.cMars, fmtE(t)); setText(els.cMarsUtc, fmtUtc(P.EI_SCET_MS + t * 1000));
  setText(els.cEarth, fmtE(t - OWLT)); setText(els.cEarthUtc, 'showing ' + fmtUtc(P.EI_SCET_MS + (t - OWLT) * 1000));
  setText(els.phase, phaseText(t));
  let heard = null;
  for (const e of flight.events) if (e.t + OWLT <= t && !QUIET.has(e.id)) heard = e;
  setText(els.knows, heard ? `Earth last heard: <b>${info(heard.id).label}</b>` : 'Earth last heard: cruise, all systems normal');
  // signals in flight between Mars and Earth
  const wires = flight.events.filter(e => !QUIET.has(e.id) && e.t <= t && e.t + OWLT > t);
  let html = '';
  for (const e of wires.slice(-8)) html += `<i style="left:${((t - e.t) / OWLT * 100).toFixed(1)}%"></i>`;
  setText(els.wire, html);
  drawChart();
  updateTimelineHead();
}

/* altitude–speed chart with flown markers */
const chartEl = $('chart'), chartCtx = chartEl.getContext('2d');
let chartBase = null;
function drawChart() {
  const g = chartCtx, W = chartEl.width, H = chartEl.height, pad = { l: 44, r: 12, t: 12, b: 30 };
  const X = (v) => pad.l + (W - pad.l - pad.r) * Math.sqrt(clamp(v, 0, 5600) / 5600);
  const Y = (h) => H - pad.b - (H - pad.t - pad.b) * clamp(h / 130000, 0, 1) ** 0.5;
  if (!chartBase || chartBase.f !== flight) {
    const c = document.createElement('canvas'); c.width = W; c.height = H; const b = c.getContext('2d');
    b.font = '500 18px "JetBrains Mono", monospace'; b.fillStyle = '#8f98bd'; b.strokeStyle = 'rgba(150,170,255,.12)'; b.lineWidth = 1;
    [0, 100, 500, 1000, 2000, 3500, 5000].forEach(v => { b.beginPath(); b.moveTo(X(v), pad.t); b.lineTo(X(v), H - pad.b); b.stroke(); b.fillText(v >= 1000 ? v / 1000 + 'k' : v, X(v) - 10, H - 8); });
    [0, 2000, 10000, 30000, 60000, 120000].forEach(h => { b.beginPath(); b.moveTo(pad.l, Y(h)); b.lineTo(W - pad.r, Y(h)); b.stroke(); b.fillText(h / 1000 + '', 6, Y(h) + 6); });
    b.save(); b.fillStyle = '#5d6589'; b.font = '500 15px "JetBrains Mono", monospace'; b.fillText('km', 8, pad.t + 12); b.fillText('m/s →', W - 70, H - 36); b.restore();
    b.strokeStyle = '#ff7a3d'; b.lineWidth = 2.5; b.beginPath();
    let first = true;
    for (const s of flight.samples) { if (s.t < 0) continue; const x = X(s.v), y = Y(s.h); if (first) { b.moveTo(x, y); first = false; } else b.lineTo(x, y); }
    b.stroke();
    // flown values (FM reconstruction): parachute, heat shield, backshell
    const fl = [[433, 12200, 'chute'], [158, 10400, 'heat shield'], [81, 2200, 'backshell']];
    b.strokeStyle = '#ffffff'; b.lineWidth = 2; b.fillStyle = '#c3cae6'; b.font = '500 15px "JetBrains Mono", monospace';
    const lo = [[10, -10], [-150, 30], [-138, 6]];
    fl.forEach(([v, h, l], i) => { b.beginPath(); b.arc(X(v), Y(h), 7, 0, Math.PI * 2); b.stroke(); b.fillText(l, X(v) + lo[i][0], Y(h) + lo[i][1]); });
    chartBase = { f: flight, c };
  }
  g.clearRect(0, 0, W, H); g.drawImage(chartBase.c, 0, 0);
  if (S.t >= 0) {
    const x = X(S.v), y = Y(Math.max(S.h, 0));
    g.fillStyle = '#fff'; g.shadowColor = '#ff7a3d'; g.shadowBlur = 16; g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
  }
}

/* captions + toasts */
const capEl = $('caption'), toastEl = $('toasts');
let capTimer = 0, capsOn = true;
function showCaption(e, earth) {
  if (!capsOn) return;
  const inf = info(e.id);
  const bad = ['crash', 'chuteFail', 'fuelOut'].includes(e.id);
  const cls = bad ? 'bad' : earth ? 'ice' : (e.id === 'touchdown' ? 'aurora' : '');
  let text = inf.text || '';
  if (e.id === 'crash') text = crashText();
  if (e.id === 'trnFix' && e.off) text = 'Terrain-Relative Navigation is switched off, so the spacecraft does not know where it is relative to the map. It will land wherever the parachute drift takes it.';
  const card = document.createElement('div');
  card.className = 'ml-cap ' + cls;
  const real = inf.real ? `<span class="ml-cap-real">flown: ${inf.real}</span>` : '';
  card.innerHTML = `<div class="ml-cap-t">${earth ? 'Earth receives · ' : ''}${fmtE(e.t)}</div><h3>${inf.label}</h3><p>${text}</p>${earth ? '' : real}`;
  capEl.innerHTML = ''; capEl.appendChild(card);
  if (gsap && !REDUCED) gsap.fromTo(card, { opacity: 0, x: -24, filter: 'blur(6px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.6, ease: 'power3.out' });
  clearTimeout(capTimer);
  capTimer = setTimeout(() => { if (gsap) gsap.to(card, { opacity: 0, duration: 0.8 }); else card.remove(); }, Math.max(6500, 9000 / Math.sqrt(speed)));
}
function toast(e) {
  const d = document.createElement('div'); d.className = 'ml-toast';
  d.innerHTML = `<b>EARTH</b>${info(e.id).label}`;
  toastEl.appendChild(d);
  while (toastEl.children.length > 3) toastEl.firstChild.remove();
  if (gsap && !REDUCED) gsap.fromTo(d, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4 });
  setTimeout(() => { if (gsap) gsap.to(d, { opacity: 0, duration: 0.6, onComplete: () => d.remove() }); else d.remove(); }, 4200);
}
function crashText() {
  const r = flight.result, o = flight.opts || {};
  if (r.issues.includes('chuteMach') || r.issues.includes('chuteLoad')) return 'Without a working parachute the backshell and descent stage hit the ground far too fast.';
  if (o.bank === 'ballistic') return 'With no lift the heavy capsule plunged too deep: it never slowed to parachute speed above the ground.';
  if (o.bank === 'liftDown' || o.bank === 'aggressive') return 'Banked too steeply, the capsule dived before the air could slow it.';
  if (o.trigger === 'mach' && o.triggerMach < 1.4) return 'Waiting for such a low Mach number left too little altitude for the parachute to do its job.';
  return 'The spacecraft ran out of altitude before it ran out of speed.';
}
function handleEvents(t0, t1) {
  if (t1 <= t0 || t1 - t0 > 5) return;
  for (const e of flight.events) {
    if (e.t > t0 && e.t <= t1 && !QUIET.has(e.id)) showCaption(e, false);
    const te = e.t + OWLT;
    if (te > t0 && te <= t1 && !QUIET.has(e.id)) {
      if (e.id === 'touchdown') showCaption(Object.assign({}, e, { id: 'touchdown' }), true);
      else if (t1 > evT('dsImpact', 450) + 6 || MAJOR.has(e.id)) toast(e);
    }
  }
}

/* ================================================================== TIMELINE */
const tlEl = $('timeline'), tlMars = $('tlMars'), tlEarth = $('tlEarth'), tlHead = $('tlHead'), tlTip = $('tlTip');
let SEG = null;
function buildTimeline() {
  const tMid0 = -40, tMid1 = flight.tEnd, tE = flight.tEarthEnd;
  SEG = [[flight.tStart, tMid0, 0, 0.1], [tMid0, tMid1, 0.1, 0.63], [tMid1, tE, 0.63, 1]];
  [tlMars, tlEarth].forEach(el => el.querySelectorAll('.ml-tick, .ml-tl-seg').forEach(n => n.remove()));
  const segLbl = ['cruise ×20', 'entry, descent and landing', 'waiting for Earth ×18'];
  SEG.forEach((s, i) => { const d = document.createElement('div'); d.className = 'ml-tl-seg'; d.style.left = (s[2] * 100) + '%'; d.innerHTML = `<span>${segLbl[i]}</span>`; tlMars.appendChild(d); });
  flight.events.forEach(e => {
    if (e.id === 'divert' || e.id === 'bridleFull') return;
    const bad = ['crash', 'chuteFail', 'fuelOut'].includes(e.id);
    const mk = (row, tt) => { const d = document.createElement('i'); d.className = 'ml-tick' + (MAJOR.has(e.id) ? ' major' : '') + (bad ? ' bad' : ''); d.style.left = (tToX(tt) * 100) + '%'; d.dataset.id = e.id; d.dataset.t = e.t; row.appendChild(d); return d; };
    e._tick = mk(tlMars, e.t);
    if (e.t + OWLT <= tE) e._tickE = mk(tlEarth, e.t + OWLT);
  });
  tlEl.setAttribute('aria-valuemin', flight.tStart); tlEl.setAttribute('aria-valuemax', Math.round(tE));
}
function tToX(t) { for (const s of SEG) if (t <= s[1]) return s[2] + (s[3] - s[2]) * clamp((t - s[0]) / (s[1] - s[0]), 0, 1); return 1; }
function xToT(x) { for (const s of SEG) if (x <= s[3]) return s[0] + (s[1] - s[0]) * clamp((x - s[2]) / (s[3] - s[2]), 0, 1); return SEG[2][1]; }
function segFactor(t) { return t < -40 ? 20 : t > flight.tEnd ? 18 : 1; }
function updateTimelineHead() {
  const x = tToX(S.t);
  $('tlFill').style.width = (x * 100) + '%'; $('tlFillE').style.width = (x * 100) + '%';
  const r = tlMars.getBoundingClientRect(), r0 = tlEl.getBoundingClientRect();
  tlHead.style.marginLeft = '0px';
  tlHead.style.left = (r.left - r0.left + x * r.width) + 'px';
  flight.events.forEach(e => { if (e._tick) e._tick.classList.toggle('on', e.t <= S.t); if (e._tickE) e._tickE.classList.toggle('on', e.t + OWLT <= S.t); });
  tlEl.setAttribute('aria-valuenow', Math.round(S.t)); tlEl.setAttribute('aria-valuetext', fmtE(S.t) + ', ' + phaseText(S.t));
}
(() => {
  let dragging = false, wasPlaying = false;
  const toT = (e) => { const r = tlMars.getBoundingClientRect(); return xToT(clamp((e.clientX - r.left) / r.width, 0, 1)); };
  tlEl.addEventListener('pointerdown', (e) => { dragging = true; wasPlaying = playing; setPlaying(false); tlEl.setPointerCapture(e.pointerId); seek(toT(e)); started = true; });
  tlEl.addEventListener('pointermove', (e) => {
    if (dragging) { seek(toT(e)); return; }
    // tooltip for the nearest tick
    const tk = e.target.closest && e.target.closest('.ml-tick');
    if (!tk) { tlTip.hidden = true; return; }
    const id = tk.dataset.id, inf = info(id), isE = tk.parentElement === tlEarth;
    tlTip.innerHTML = `<time>${isE ? 'Earth hears at ' + fmtE(+tk.dataset.t + OWLT) : fmtE(+tk.dataset.t)}</time><b>${inf.label}</b>${inf.real ? 'flown: ' + inf.real : ''}`;
    const r0 = tlEl.getBoundingClientRect(), r = tk.getBoundingClientRect();
    tlTip.style.left = clamp(r.left + r.width / 2 - r0.left, 100, r0.width - 100) + 'px'; tlTip.hidden = false;
  });
  tlEl.addEventListener('pointerleave', () => { tlTip.hidden = true; });
  const end = () => { if (dragging) { dragging = false; if (wasPlaying) setPlaying(true); } };
  tlEl.addEventListener('pointerup', end); tlEl.addEventListener('pointercancel', end);
  tlEl.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); jumpEvent(e.key === 'ArrowRight' ? 1 : -1); }
    else if (e.key === 'Home') { seek(flight.tStart); } else if (e.key === 'End') { seek(flight.tEarthEnd); }
  });
})();
function jumpEvent(dir) {
  const evs = flight.events.filter(e => !QUIET.has(e.id));
  const cur = S ? S.t : 0;
  const nxt = dir > 0 ? evs.find(e => e.t > cur + 0.6) : [...evs].reverse().find(e => e.t < cur - 0.6);
  if (nxt) { started = true; seek(nxt.t - (dir > 0 ? 3 : 3)); if (!playing) showCaption(nxt, false); }
}

/* ================================================================== PLAYBACK */
let t = -610, playing = false, started = false, speed = 1, shakeOn = true;
const playBtn = $('playBtn');
function setPlaying(p) {
  playing = p; playBtn.textContent = p ? 'Pause' : (t >= (flight ? flight.tEarthEnd : 0) - 0.1 ? 'Replay' : 'Play');
  playBtn.classList.toggle('flame', !p);
  if (p) { started = true; document.body.classList.add('ml-flying'); $('watchBtn').classList.remove('pulse'); viewOffset(); camera.updateProjectionMatrix(); }
}
function seek(tt) {
  t = clamp(tt, flight.tStart, flight.tEarthEnd); S = sampleAt(t); cam.lastT = null; capEl.innerHTML = '';
  // let dust and sparks settle into the state they would have at this moment
  if (sparks) { sparks.userData.parts.forEach(q => { q.life = 0; }); dust.userData.parts.forEach(q => { q.life = 0; }); dustAcc = 0; }
  lastBank = S.bank; bankRate = 0;
  if (camera.matrixWorld) { updatePose(0.016); for (let i = 0; i < 30; i++) updateEffects(0.05, tReal + i * 0.05); }
  lastBank = S.bank; bankRate = 0;
  if (flight && tlMars) updateHUD();
}
playBtn.addEventListener('click', () => { if (!playing && t >= flight.tEarthEnd - 0.1) seek(flight.tStart); setPlaying(!playing); });
$('restartBtn').addEventListener('click', () => { seek(flight.tStart); setPlaying(true); });
$('watchBtn').addEventListener('click', () => { setMode('watch'); seek(flight.tStart); setCam('auto'); setPlaying(true); });
$('engBtn').addEventListener('click', () => setMode('engineer'));
function setSpeed(s) { speed = s; document.querySelectorAll('#speed button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.s === s))); }
document.querySelectorAll('#speed button').forEach(b => b.addEventListener('click', () => setSpeed(+b.dataset.s)));
function setCam(c) { cam.mode = c; document.querySelectorAll('#cams button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === c))); cam.shot = null; }
document.querySelectorAll('#cams button').forEach(b => b.addEventListener('click', () => { started = true; setCam(b.dataset.c); }));
$('shake').addEventListener('change', (e) => { shakeOn = e.target.checked; });
$('caps').addEventListener('change', (e) => { capsOn = e.target.checked; if (!capsOn) capEl.innerHTML = ''; });

/* ================================================================== MODES + ENGINEER */
function setMode(m) {
  document.querySelectorAll('#modes button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.m === m)));
  $('engineer').hidden = m !== 'engineer';
  if (m === 'engineer') {
    const p = $('panel'); p.classList.remove('collapsed'); $('collapse').textContent = '▼ HIDE'; document.body.classList.toggle('ml-sheet-open', matchMedia('(max-width: 820px)').matches);
    $('engineer').scrollIntoView({ block: 'start', behavior: REDUCED ? 'auto' : 'smooth' });
    ensureMapBase();
  } else if (flight !== NOMINAL.f) { useFlight(NOMINAL.f); seek(flight.tStart); }
}
document.querySelectorAll('#modes button').forEach(b => b.addEventListener('click', () => setMode(b.dataset.m)));
const opts = { trigger: 'range', triggerMach: 1.8, bank: 'guided', trn: true, bridle: 7.6, craneAlt: 20 };
const WHY = {
  range: 'The Range Trigger opens the parachute when the capsule reaches the planned point over the ground (never faster than Mach 2.2). Opening at the right place, not at the right speed, cuts the downrange scatter roughly in half.',
  mach: 'Curiosity (2012) opened its parachute at a fixed speed. Wherever the capsule happens to be at that speed is where the parachute starts its drift, so errors in the atmosphere turn straight into landing error. Too fast and the canopy shreds; too slow and there is no altitude left.',
  guided: 'The flown strategy: the guidance continuously predicts where it will end up and adjusts the bank angle, rolling through three reversals to keep sideways drift in check.',
  aggressive: 'Banking 20° steeper than the reference profile with no corrections: more lift points down, the capsule dives deeper, pulls more g and runs out of range early.',
  liftUp: 'Never banking keeps all the lift pointing up: the capsule stretches its glide and flies far past the target.',
  ballistic: 'No lift at all, like the spinning, symmetric capsules of Pathfinder and Spirit & Opportunity. Fine for a 600–800 kg lander; a 3.4-tonne one sinks too deep before it slows.',
  trnOn: 'The Lander Vision System photographs the ground from 4.2 km, matches it against an orbital map in under 10 s, and the descent stage diverts to the nearest spot its hazard map marks as safe.',
  trnOff: 'Without Terrain-Relative Navigation the spacecraft knows its position only from its inertial sensors, so it lands wherever it drifts, cliffs and boulder fields included.',
  crane: (b, c) => `Rope length sets how far the rover hangs below the engines (plume and dust), and how long the lowering takes; the start altitude sets how long the descent stage must hover. The rover must be fully lowered before its wheels reach the ground. With these settings it needs ${fmt((c - b - P.DS.roverH) / P.DS.vCV, 0)} s of hovering at 0.75 m/s.`
};
function syncOpts() {
  document.querySelectorAll('#optTrigger button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === opts.trigger)));
  document.querySelectorAll('#optBank button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === opts.bank)));
  $('machField').hidden = opts.trigger !== 'mach';
  $('optMach').value = opts.triggerMach; $('machOut').textContent = opts.triggerMach.toFixed(2);
  $('optTrn').checked = opts.trn;
  $('optBridle').value = opts.bridle; $('bridleOut').textContent = opts.bridle.toFixed(1) + ' m';
  $('optCrane').value = opts.craneAlt; $('craneOut').textContent = opts.craneAlt + ' m';
  $('whyTrigger').textContent = WHY[opts.trigger];
  $('whyBank').textContent = WHY[opts.bank];
  $('whyTrn').textContent = opts.trn ? WHY.trnOn : WHY.trnOff;
  $('whyCrane').textContent = WHY.crane(opts.bridle, opts.craneAlt);
  document.querySelectorAll('#engineer input[type=range]').forEach(r => r.style.setProperty('--fill', ((r.value - r.min) / (r.max - r.min) * 100) + '%'));
}
document.querySelectorAll('#optTrigger button').forEach(b => b.addEventListener('click', () => { opts.trigger = b.dataset.v; syncOpts(); }));
document.querySelectorAll('#optBank button').forEach(b => b.addEventListener('click', () => { opts.bank = b.dataset.v; syncOpts(); }));
$('optMach').addEventListener('input', (e) => { opts.triggerMach = +e.target.value; syncOpts(); });
$('optTrn').addEventListener('change', (e) => { opts.trn = e.target.checked; syncOpts(); });
$('optBridle').addEventListener('input', (e) => { opts.bridle = +e.target.value; syncOpts(); });
$('optCrane').addEventListener('input', (e) => { opts.craneAlt = +e.target.value; syncOpts(); });
$('resetBtn').addEventListener('click', () => { Object.assign(opts, { trigger: 'range', triggerMach: 1.8, bank: 'guided', trn: true, bridle: 7.6, craneAlt: 20 }); syncOpts(); });
let mcJob = 0, lastMC = null;
$('runBtn').addEventListener('click', runEngineer);
function runEngineer() {
  const job = ++mcJob;
  const resEl = $('result');
  resEl.className = 'ml-result busy';
  resEl.innerHTML = '<h4>Flying your landing…</h4><div class="ml-bar"><i id="mcBar"></i></div>';
  setTimeout(() => {
    const f = computeFlight(Object.assign({}, opts));
    useFlight(f);
    // replay from a telling moment
    const r = f.result;
    let from = -25;
    if (r.issues.includes('chuteMach') || r.issues.includes('chuteLoad') || (f.E('chute') && f.E('chute').h < 5000)) from = evT('chute', 200) - 8;
    else if (f.E('crash') && !f.E('chute')) from = Math.max(-25, evT('crash') - 40);
    else if (r.issues.includes('hazard')) from = evT('lvs', 320) - 4;
    else if (r.issues.some(i => ['fuel', 'hardLanding', 'collision', 'plumeDamage'].includes(i))) from = evT('skyCrane', 400) - 12;
    seek(from); setCam('auto'); setPlaying(true);
    renderResult(f, null, 0);
    // Monte Carlo: 40 dispersed flights, a couple per frame
    const pts = [], it = P.monteCarlo(Object.assign({}, opts), 40, 21);
    const step = () => {
      if (job !== mcJob) return;
      for (let k = 0; k < 2; k++) { const n = it.next(); if (n.done) { lastMC = { pts, opts: Object.assign({}, opts) }; renderResult(f, pts, 1); drawMap(f, pts); return; } pts.push(n.value); }
      const bar = $('mcBar'); if (bar) bar.style.width = (pts.length / 40 * 100) + '%';
      drawMap(f, pts);
      setTimeout(step, 0);
    };
    setTimeout(step, 30);
  }, 30);
}
const ISSUE = {
  chuteMach: (f) => `<b>Parachute destroyed.</b> You opened it at Mach ${fmt(f.result.chuteMach, 2)}. Above about Mach 2.2 the canopy was never tested: shock waves and violent "breathing" tear a disk-gap-band parachute apart.`,
  chuteLoad: (f) => `<b>Parachute torn by its own opening load:</b> ${fmt(f.result.chuteLoad / 1000, 0)} kN, more than the ≈298 kN the canopy survived in testing.`,
  crash: (f) => `<b>Impact.</b> ${crashText()}`,
  hazard: (f) => `<b>Landed on ${f.result.hazard}.</b> The rover touched down on terrain it cannot survive: ${f.result.hazard === 'cliff' ? 'the delta front drops tens of metres in a few hundred' : f.result.hazard === 'dunes' ? 'soft sand ripples between rock ridges can trap or tip a rover' : f.result.hazard === 'boulders' ? 'rocks taller than the belly clearance can puncture it or tip it over' : 'slopes over 15° can tip it over'}.`,
  hardLanding: (f) => `<b>Hard landing at ${fmt(f.result.td.vz, 2)} m/s.</b> ${f.result.td.L < f.opts.bridle - 0.05 ? `The wheels hit the ground while the bridles were still paying out (only ${fmt(f.result.td.L, 1)} m of ${fmt(f.opts.bridle, 1)} m): lowering speed and descent speed add up.` : 'The descent stage could not hold the gentle 0.75 m/s.'}`,
  fuel: (f) => '<b>Out of propellant.</b> The descent stage hovered too long and its tanks ran dry before the rover was down; hovering on Mars burns about 3.5 kg of hydrazine every second.',
  collision: (f) => `<b>Descent stage on top of the rover.</b> Only ${fmt(f.result.td.clearance, 1)} m separated them when the bridles were cut.`,
  plumeDamage: (f) => `<b>Engines too close to the ground.</b> The nozzles were ${fmt(f.result.td.nozzle, 1)} m above the surface at touchdown; the plumes dig craters and sandblast the rover with rocks. That is why the sky crane lowers the rover so far.`
};
const WARN = {
  plume: (f) => `The engines were only ${fmt(f.result.td.nozzle, 1)} m above the ground: expect dust and pebbles on the rover's deck.`,
  fuelLow: (f) => `Only ${fmt(f.result.td.fuel, 0)} kg of propellant left at touchdown: little margin for the flyaway.`,
  flyawayShort: (f) => 'The descent stage crashed close to the rover.',
  lowDeploy: (f) => `The parachute opened low (${fmt(f.result.chuteAlt / 1000, 1)} km): little time left for the heat shield, radar and TRN.`,
  firmLanding: (f) => 'A firm touchdown: the bridles were still paying out as the wheels touched.',
  swing: (f) => 'The rover was still swinging on its bridles at touchdown.'
};
function renderResult(f, pts, done) {
  const r = f.result, el = $('result');
  const ok = r.ok;
  el.className = 'ml-result' + (ok ? '' : ' bad');
  let head = ok ? 'Safe landing' : 'Mission lost';
  if (ok && r.miss != null) head += ` · ${fmt(r.miss >= 1000 ? r.miss / 1000 : r.miss, r.miss >= 1000 ? 1 : 0)} ${r.miss >= 1000 ? 'km' : 'm'} from the target`;
  let li = r.issues.map(i => `<li>${(ISSUE[i] || (() => i))(f)}</li>`).join('');
  li += r.warnings.map(w => `<li>${(WARN[w] || (() => w))(f)}</li>`).join('');
  if (ok && !r.warnings.length) li += '<li>Every step worked: guided entry, parachute, safe-target divert and a gentle 0.75 m/s touchdown.</li>';
  if (r.td && Math.abs(r.td.x) > 12000) li += `<li>You landed ${fmt(Math.abs(r.td.x) / 1000, 0)} km ${r.td.x > 0 ? 'past' : 'short of'} the target, ${Math.hypot(r.td.x - P.JEZ.center[0], r.td.z - P.JEZ.center[1]) > P.JEZ.radius ? 'outside Jezero Crater altogether' : 'far from the delta the science team chose'}.</li>`;
  let mc = '';
  if (pts && pts.length) {
    const bad = pts.filter(p => p.hazard || p.chuteFailed || p.crashed).length;
    const e = P.ellipseOf(pts.map(p => p.land));
    mc = `<span>Monte Carlo <b>${pts.length - bad}/${pts.length}</b> safe</span>` + (e ? `<span>ellipse <b>${fmt(2 * e.a / 1000, 1)} × ${fmt(2 * e.b / 1000, 1)}</b> km</span>` : '');
  }
  el.innerHTML = `<h4>${head}</h4><ul>${li}</ul><div class="ml-stats">` +
    `<span>peak <b>${fmt(r.peakG, 1)} g</b></span><span>shield <b>${fmt(r.peakTw - 273.15, 0)} °C</b></span>` +
    (r.chuteMach ? `<span>chute <b>Mach ${fmt(r.chuteMach, 2)}</b></span><span>at <b>${fmt(r.chuteAlt / 1000, 1)} km</b></span>` : '') +
    (r.td ? `<span>touchdown <b>${fmt(r.td.vz, 2)} m/s</b></span><span>fuel left <b>${fmt(r.td.fuel, 0)} kg</b></span>` : '') + mc + '</div>' +
    (done ? '' : '<div class="ml-bar"><i id="mcBar"></i></div>');
}

/* map: hazards around Jezero's landing ellipse */
const mapEl = $('map'), mapCtx = mapEl.getContext('2d');
const MAPS = {};
function mapBase(half) {
  if (MAPS[half]) return MAPS[half];
  const N = 200, img = mapCtx.createImageData(N, N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = -half + (i + 0.5) * 2 * half / N, z = -half + (j + 0.5) * 2 * half / N;
    const e = half / N * 1.5;
    const h = P.terrainHeight(x, z), hx = P.terrainHeight(x + e, z) - h, hz = P.terrainHeight(x, z + e) - h;
    const sh = clamp(0.62 - (hx * 0.8 + hz * 0.5) / e * 1.8, 0.15, 1.2);
    let c = [150 * sh + 12, 96 * sh + 6, 64 * sh + 4];
    const df = P.deltaField(x, z); if (df.top > 0.5) c = [c[0] * 1.15, c[1] * 1.12, c[2] * 1.05];
    if (half <= 8000) {
      const k = P.hazardAt(x, z);
      if (k === 'cliff' || k === 'steep slope' || k === 'crater wall') c = [c[0] * 0.4 + 150, c[1] * 0.4 + 30, c[2] * 0.4 + 30];
      else if (k === 'boulders') c = [c[0] * 0.5 + 95, c[1] * 0.5 + 40, c[2] * 0.5 + 125];
      else if (k === 'dunes') c = [c[0] * 0.5 + 125, c[1] * 0.5 + 95, c[2] * 0.5 + 20];
    }
    const o = (j * N + i) * 4; img.data[o] = c[0]; img.data[o + 1] = c[1]; img.data[o + 2] = c[2]; img.data[o + 3] = 255;
  }
  const c = document.createElement('canvas'); c.width = N; c.height = N; c.getContext('2d').putImageData(img, 0, 0);
  MAPS[half] = c; return c;
}
function ensureMapBase() { if (!MAPS[7000]) setTimeout(() => { mapBase(7000); drawMap(flight, lastMC ? lastMC.pts : null); }, 60); else drawMap(flight, lastMC ? lastMC.pts : null); }
function drawMap(f, pts) {
  const g = mapCtx, W = mapEl.width, H = mapEl.height;
  const land = f.td ? [f.td.x, f.td.z] : (f.E('crash') ? [f.samples[f.samples.length - 1].down, f.samples[f.samples.length - 1].z] : null);
  let ext = 6500;
  const all = (pts || []).map(p => p.land).concat(land ? [land] : []);
  for (const p of all) ext = Math.max(ext, Math.abs(p[0]) * 1.1, Math.abs(p[1]) * 1.1);
  const half = ext <= 6500 ? 7000 : ext < 30000 ? 32000 : 110000;
  const base = mapBase(half);
  g.imageSmoothingEnabled = true; g.drawImage(base, 0, 0, W, H);
  const X = (x) => (x + half) / (2 * half) * W, Z = (z) => (z + half) / (2 * half) * H, S_ = W / (2 * half);
  g.lineWidth = 2;
  // flown ellipse 7.7 × 6.6 km, long axis along the approach
  g.strokeStyle = '#7cc8ff'; g.setLineDash([8, 6]); g.beginPath(); g.ellipse(X(0), Z(0), 3850 * S_, 3300 * S_, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  if (pts && pts.length) {
    for (const p of pts) { const bad = p.hazard || p.chuteFailed || p.crashed; g.fillStyle = bad ? '#ff4f9a' : '#4ef0b8'; g.beginPath(); g.arc(X(p.land[0]), Z(p.land[1]), 3.2, 0, Math.PI * 2); g.fill(); }
    const e = pts.length > 4 ? P.ellipseOf(pts.map(p => p.land)) : null;
    if (e) { g.strokeStyle = '#4ef0b8'; g.beginPath(); g.ellipse(X(e.cx), Z(e.cz), e.a * S_, Math.max(e.b * S_, 1), e.ang, 0, Math.PI * 2); g.stroke(); }
  }
  // target
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X(0) - 8, Z(0)); g.lineTo(X(0) + 8, Z(0)); g.moveTo(X(0), Z(0) - 8); g.lineTo(X(0), Z(0) + 8); g.stroke();
  // divert: zero-divert point → chosen target
  if (f.trn && half <= 8000) { const a = f.trn.zdp, b = f.trn.target; g.strokeStyle = '#ffc24b'; g.beginPath(); g.moveTo(X(a[0]), Z(a[1])); g.lineTo(X(b[0]), Z(b[1])); g.stroke(); g.fillStyle = '#ffc24b'; g.beginPath(); g.arc(X(a[0]), Z(a[1]), 3, 0, Math.PI * 2); g.fill(); }
  if (land) {
    const x = X(land[0]), y = Z(land[1]);
    g.strokeStyle = f.result.ok ? '#ffffff' : '#ff4f9a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x - 9, y - 9); g.lineTo(x + 9, y + 9); g.moveTo(x + 9, y - 9); g.lineTo(x - 9, y + 9); g.stroke();
  }
  g.font = '600 20px "JetBrains Mono", monospace'; g.fillStyle = 'rgba(255,255,255,.85)';
  g.fillText(`${half >= 1000 ? (2 * half / 1000).toFixed(0) : 2 * half} km across · north up`, 14, H - 16);
  if (half <= 8000) { g.fillText('delta', X(-5600), Z(-3600)); g.fillText('Séítah', X(-2500), Z(2400)); }
  else { g.fillText('Jezero', X(P.JEZ.center[0]) - 30, Z(P.JEZ.center[1])); }
}

/* ================================================================== EDUCATION */
const eduEl = $('edu');
let eduBuilt = false, lastFocus = null;
function openEdu() {
  lastFocus = document.activeElement;
  if (!eduBuilt) buildEdu();
  eduEl.hidden = false; $('eduClose').focus();
  if (gsap && !REDUCED) gsap.fromTo('.ml-edu-in', { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' });
}
function closeEdu() { eduEl.hidden = true; if (lastFocus) lastFocus.focus(); }
$('whyBtn').addEventListener('click', openEdu);
$('eduClose').addEventListener('click', closeEdu);
eduEl.addEventListener('click', (e) => { if (e.target === eduEl) closeEdu(); });
function buildEdu() {
  eduBuilt = true;
  const a0 = P.atmosphere(0), rhoE = 1.225, pE = 101325;
  const mChute = P.VEH.mEntry - P.VEH.ebmN * P.VEH.ebmM - P.VEH.mHeatShield;
  const cdA = P.CHUTE.cdSub * P.CHUTE.area + 1.05 * P.VEH.area;
  const vtMars = Math.sqrt(2 * mChute * P.G_SITE / (P.atmosphere(2000).rho * cdA));
  const vtEarth = Math.sqrt(2 * mChute * 9.81 / (rhoE * cdA));
  const facts = [
    ['Surface pressure', `${fmt(a0.p, 0)}<small>Pa</small>`, `About ${fmt(a0.p / pE * 100, 1)} % of Earth's sea-level pressure at Jezero's floor (our model, matched to the rover's weather station).`],
    ['Air density', `${fmt(a0.rho / rhoE * 100, 1)}<small>% of Earth</small>`, `${fmt(a0.rho, 4)} kg/m³ against 1.225 on Earth. Thick enough to melt an unprotected spacecraft at 5.3 km/s.`],
    ['Same parachute, two planets', `${fmt(vtMars, 0)} vs ${fmt(vtEarth, 0)}<small>m/s</small>`, 'Terminal speed of the backshell, rover and descent stage under the 21.5 m canopy near the ground on Mars vs on Earth. On Mars rockets must do the rest.'],
    ['Entry speed', '19,500<small>km/h</small>', '5.32 km/s at the top of the atmosphere. Most of it must go in the first four minutes.'],
    ['Radio delay', '11:22<small>min:s</small>', 'Signals took 11 min 22 s from Mars to Earth, so the landing ran on autopilot. Earth heard about touchdown when the rover had already been down for over eleven minutes.'],
    ['Gravity', `${fmt(P.G_SITE, 2)}<small>m/s²</small>`, "38 % of Earth's: low enough that a sky crane can hover, high enough that it must burn about 3.5 kg of fuel a second to do it."]
  ];
  $('facts').innerHTML = facts.map(f => `<div class="card ml-fact"><h4>${f[0]}</h4><div class="num">${f[1]}</div><p>${f[2]}</p></div>`).join('');
  const beta = P.VEH.mEntry / (1.52 * P.VEH.area);
  const allen = P.VEH.vEI ** 2 * Math.sin(-P.VEH.gammaEI * DEG) / (2 * Math.E * P.H_SCALE) / 9.80665;
  const simBallistic = new P.EDLSim({ bank: 'ballistic', stopAt: 'bsSep' }).run(1).max.g;
  const EQ = [
    ['Drag', 'D = \\tfrac{1}{2}\\,\\rho\\,v^{2}\\,C_D\\,A', 'Drag grows with the square of speed and linearly with air density ρ. C<sub>D</sub> ≈ 1.5 for the 70° aeroshell at hypersonic speed, A = 15.9 m² for its 4.5 m diameter.', `at peak deceleration here: q = ${fmt(NOMINAL.f.sim.max.q / 1000, 1)} kPa`],
    ['Exponential atmosphere', '\\rho(h) = \\rho_0\\, e^{-h/H},\\qquad H = \\frac{R\\,T}{g} \\approx 11.1\\ \\text{km}', 'Density falls by e every scale height H. Mars has a larger H than Earth (≈8.5 km) because its gravity is weaker, so its thin air reaches high.', `ρ₀ = ${fmt(a0.rho, 4)} kg/m³ at Jezero`],
    ['Ballistic coefficient', '\\beta = \\frac{m}{C_D\\,A}', 'How hard a vehicle is to slow down. Heavy landers have large β and sink deeper before the air stops them, which is why Curiosity and Perseverance needed lift.', `Perseverance: β ≈ ${fmt(beta, 0)} kg/m² (Spirit & Opportunity ≈ 94)`],
    ['Peak deceleration (Allen–Eggers)', 'a_{\\max} = \\frac{v_E^{2}\\,\\sin|\\gamma_E|}{2\\,e\\,H}', 'For a ballistic entry the worst braking depends only on entry speed, entry angle and the scale height, not on the vehicle. Lift spreads the braking out and lowers the peak.', `v = 5.32 km/s, γ = 15.5°, H = 11.1 km: ${fmt(allen, 1)} g ballistic (this simulator, with gravity and a curved planet: ${fmt(simBallistic, 1)} g); flown with lift: 10.7 g`],
    ['Lift and bank angle', 'L = \\left(\\tfrac{L}{D}\\right) D,\\qquad L_{\\text{vertical}} = L\\cos\\sigma', 'The offset centre of mass trims the capsule at ≈16°, giving L/D ≈ 0.24. The spacecraft steers by rolling (bank σ): cos σ of the lift holds it up, sin σ pushes it sideways.', 'three bank reversals keep the sideways part from adding up'],
    ['Stagnation-point heating (Sutton–Graves)', '\\dot q = k\\,\\sqrt{\\frac{\\rho}{R_n}}\\;v^{3},\\qquad \\varepsilon\\sigma T_w^{4} = \\dot q', 'Heating grows with the cube of speed. k = 1.9027×10⁻⁴ kg<sup>½</sup>/m for Mars\' CO₂, R<sub>n</sub> = 1.125 m. Balancing it against thermal radiation gives the surface temperature.', `simulated peak: ${fmt(NOMINAL.f.sim.max.heat / 1e4, 0)} W/cm², ${fmt(NOMINAL.f.sim.max.Tw - 273.15, 0)} °C (flown: ≈1,300–1,600 °C)`],
    ['Terminal velocity under the parachute', 'v_t = \\sqrt{\\frac{2\\,m\\,g}{\\rho\\,C_D\\,A}}', 'When drag equals weight the fall stops speeding up. Mars\' low ρ keeps v<sub>t</sub> high, so the descent stage has to take over at 2.1 km.', `≈ ${fmt(vtMars, 0)} m/s on Mars (flown: 81 m/s at backshell separation)`],
    ['Light time', 't = \\frac{d}{c}', 'On 18 February 2021 Mars was about 204 million km away.', 't = 2.04×10¹¹ m ÷ 3.00×10⁸ m/s ≈ 682 s = 11 min 22 s']
  ];
  $('eqs').innerHTML = EQ.map((q, i) => `<div class="ml-eq"><h4>${q[0]}</h4><div class="tex" id="tex${i}">${q[1]}</div><p>${q[2]}</p><div class="ml-live">${q[3]}</div></div>`).join('');
  const renderTex = () => { if (!window.katex) return false; EQ.forEach((q, i) => { try { window.katex.render(q[1], $('tex' + i), { displayMode: true, throwOnError: false }); } catch (e) { /* leave source */ } }); return true; };
  if (!renderTex()) { let n = 0; const iv = setInterval(() => { if (renderTex() || ++n > 40) clearInterval(iv); }, 150); }
  // comparison table
  const cmp = (DATA && DATA.comparison) || [];
  $('cmp').innerHTML = '<thead><tr><th>Mission</th><th>Year</th><th>Entry mass</th><th>Landed</th><th>Aeroshell</th><th>L/D</th><th>Entry speed</th><th>Parachute</th><th>How it landed</th></tr></thead><tbody>' +
    cmp.map(c => `<tr class="${c.name === 'Perseverance' ? 'us' : ''}"><td>${c.name}</td><td>${c.year}</td><td class="num">${fmt(c.entry_kg, 0)} kg</td><td class="num">${fmt(c.landed_kg, 0)} kg</td><td class="num">${c.aeroshell_m} m</td><td class="num">${c.ld}</td><td class="num">${c.v_kms} km/s</td><td class="num">${c.chute_m} m</td><td class="method">${c.method}</td></tr>`).join('') + '</tbody>';
  $('cmpNote').textContent = 'Landed mass is the rover for Curiosity and Perseverance and the whole lander otherwise. Viking to Phoenix: Braun & Manning (2006), Table 1 (Phoenix pre-flight values). Curiosity and Perseverance: Wikipedia; their entry masses are derived from the published launch masses minus the cruise stage and the two 75 kg cruise balance masses. Landing ellipses shrank from 20 × 7 km (Curiosity) to 7.7 × 6.6 km (Perseverance).';
  const src = (DATA && DATA.sources) || {};
  $('srcs').innerHTML = Object.values(src).map(s => `<li><a href="${s.url}" rel="noopener">${s.title}</a> — ${s.by}${s.year ? ', ' + s.year : ''}</li>`).join('');
}

/* ================================================================== RENDER LOOP */
let composer = null, bloom = null;
function setupComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.5, 0.82);
  bloom.enabled = Q.bloom && !params.has('nobloom');
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
}
setupComposer();
function setQuality(q) {
  qName = q; Q = QUALITY[q];
  try { localStorage.setItem('cx-mars-q', q); } catch (e) { /* storage unavailable */ }
  document.querySelectorAll('#quality button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.q === q)));
  renderer.setPixelRatio(pixelRatio()); composer.setPixelRatio(pixelRatio()); composer.setSize(innerWidth, innerHeight);
  bloom.enabled = Q.bloom;
  buildPlanet(); buildTerrain(); buildParticles();
  if (flight && flight.td) { microCentre = [1e9, 1e9]; buildMicro(flight.td.x, flight.td.z); }
}
document.querySelectorAll('#quality button').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.q === qName)); b.addEventListener('click', () => setQuality(b.dataset.q)); });

const clock = { last: performance.now(), getDelta() { const n = performance.now(), d = (n - this.last) / 1000; this.last = n; return d; } };
let tReal = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 0.1);
  tReal += dt;
  const t0 = t;
  if (playing) {
    t += dt * speed * segFactor(t);
    if (t >= flight.tEarthEnd) { t = flight.tEarthEnd; setPlaying(false); }
  }
  S = sampleAt(t);
  if (playing) handleEvents(t0, t);
  updatePose(dt);
  computeCamera(dt, tReal);
  placeWorld();
  updateEffects(playing ? dt * speed * segFactor(t) : dt * 0.25, tReal);
  // uniforms: camera relative to the planet centre, sky matrices, exposure
  const camP = SHARED_HAZE.uCamP.value.set(CAM[0], CAM[1] + R, CAM[2]);
  skyMat.uniforms.uInvProj.value.copy(camera.projectionMatrixInverse);
  skyMat.uniforms.uCamRot.value.extractRotation(camera.matrixWorld);
  const camH = camP.length() - R;
  stars.material.opacity = smooth(25000, 90000, camH);
  hemi.intensity = lerp(0.9, 0.25, smooth(30000, 120000, camH));
  renderer.toneMappingExposure = lerp(1.0, 1.25, smooth(20000, 200000, camH));
  sunLight.position.copy(SUN).multiplyScalar(100);
  if (composer && Q.bloom) composer.render(); else renderer.render(scene, camera);
  drawLVS();
  hudTimer -= dt;
  if (hudTimer <= 0) { updateHUD(); hudTimer = 0.1; }
}
let rafId = 0, stillFrames = 0;
function loop() {
  rafId = requestAnimationFrame(loop);
  frame();
  if (STILL && ++stillFrames > 3) { cancelAnimationFrame(rafId); rafId = 0; }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
  else if (!rafId && !STILL) { clock.getDelta(); loop(); }
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; viewOffset(); camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  [sparks, dust].forEach(p => p && (p.material.uniforms.uScale.value = innerHeight * 0.5));
  if (S) updateTimelineHead();
});
addEventListener('keydown', (e) => {
  if (!eduEl.hidden) { if (e.key === 'Escape') closeEdu(); return; }
  if (e.target.closest && e.target.closest('input, select, textarea, button, [role=slider]')) return;
  if (e.code === 'Space') { e.preventDefault(); if (!playing && t >= flight.tEarthEnd - 0.1) seek(flight.tStart); setPlaying(!playing); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); jumpEvent(e.key === 'ArrowRight' ? 1 : -1); }
  else if (e.key >= '1' && e.key <= '5') { started = true; setCam(['auto', 'chase', 'side', 'ground', 'free'][+e.key - 1]); }
  else if (e.key === 'e' || e.key === 'E') setMode($('engineer').hidden ? 'engineer' : 'watch');
});
if (matchMedia('(max-width: 820px)').matches) {
  const p = $('panel'); p.classList.add('collapsed'); $('collapse').textContent = '▲ TELEMETRY';
  $('collapse').addEventListener('click', () => { setTimeout(() => { const c = p.classList.contains('collapsed'); $('collapse').textContent = c ? '▲ TELEMETRY' : '▼ HIDE'; document.body.classList.toggle('ml-sheet-open', !c); }, 0); });
}

function useFlight(f) {
  flight = f; chartBase = null;
  buildTimeline();
  if (f.td) buildMicro(f.td.x, f.td.z);
  else { const l = f.samples[f.samples.length - 1]; buildMicro(l.down, l.z); }
}

/* ================================================================== START */
async function start() {
  try {
    const r = await fetch('data/mars2020-edl.json');
    if (r.ok) { DATA = await r.json(); DATA.events.forEach(e => { INFO[e.id] = { label: e.label, text: e.text, real: e.real, src: e.src }; }); }
  } catch (e) { /* offline or file:// — built-in labels are used */ }
  buildTerrain();
  NOMINAL.f = computeFlight({});
  useFlight(NOMINAL.f);
  syncOpts();
  const qt = params.get('t');
  seek(qt != null ? +qt : flight.tStart);
  if (qt != null) { started = true; document.body.classList.add('ml-flying'); }
  if (params.get('mode') === 'engineer') setMode('engineer');
  if (params.get('cam')) setCam(params.get('cam'));
  if (params.has('edu')) openEdu();
  $('watchBtn').classList.add('pulse');
  setPlaying(params.has('play'));
  clock.getDelta();
  loop();
  requestAnimationFrame(() => $('loading').classList.add('done'));
}
start();

/* ================================================================== DEBUG HOOK */
// window.__sim.jump(85) → jump to E+85 s; .cam('side'); .state(); .fly({trn:false})
window.__sim = {
  jump(tt) { started = true; document.body.classList.add('ml-flying'); viewOffset(); seek(tt); if (STILL) { frame(); frame(); } return t; },
  render() { frame(); return t; },
  cam: (c) => setCam(c),
  play: (p = true) => setPlaying(p),
  speed: (s) => setSpeed(s),
  quality: (q) => setQuality(q),
  mode: (m) => setMode(m),
  edu: (o = true) => (o ? openEdu() : closeEdu()),
  fly(o) { Object.assign(opts, o || {}); syncOpts(); runEngineer(); return true; },
  state: () => ({ t, shot: cam.shot, h: S && S.h, v: S && S.v, M: S && S.M, g: S && S.g, phase: S && S.phase, events: flight.events.map(e => e.id + '@' + e.t.toFixed(1)), result: flight.result }),
  get flight() { return flight; }
};
if (params.has('dbg')) window.__dbg = { THREE, scene, skyQuad, skyMat, renderer, camera, planet, stars };
