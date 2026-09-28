/* Cosmic Library · Booster landing — bring a Falcon 9-class first stage home.
 *
 * Physics lives in booster-physics.js (sources in its header; tested by
 * scripts/test_booster.mjs). This file draws the scene, runs the controls,
 * the cameras and the HUD.
 *
 * Rendering frame ("local frame"): the origin sits on the sea surface directly
 * under the booster and moves with it (a floating origin), +x points down-range,
 * +y up, +z sideways toward the default camera. Earth's centre is (0, −R, 0), so
 * the ship, the landing zone and the ocean patch are placed on the curved
 * surface by their down-range distance. One full-screen shader draws the sky,
 * the far ocean, land and clouds with single scattering (after launch.js);
 * a logarithmic depth buffer covers 0.3 m to 3,000 km.
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  BoosterSim, Autopilot, DT, VEH, ENG, AERO, SCENARIOS, SHIP, WAVES, LIMITS, RE, G0,
  shipMotion, predict, burnHeight, thrustPerEngine, wrapPi, AP_TAU
} from './booster-physics.js';

const Codex = window.Codex || { fmt: (v, d) => (+v).toFixed(d ?? 2), webgl: () => true, reducedMotion: false };
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;
const fmt = (v, d = 0) => Codex.fmt(v, d);

/* ------------------------------------------------------------------ options */
const params = new URLSearchParams(location.search);
const STILL = params.has('still');                         // test hook: no idle motion, start paused
const QUALITY = {
  low: { pr: 0.75, shadow: 0, bloom: false, ocean: 110, steps: 6, seg: 20, puffs: 500 },
  high: { pr: 1.0, shadow: 2048, bloom: true, ocean: 200, steps: 10, seg: 36, puffs: 1400 }
};
let qName = params.get('q') || (() => { try { return localStorage.getItem('cx-booster-q'); } catch (e) { return null; } })() || (matchMedia('(max-width: 820px)').matches ? 'low' : 'high');
if (!QUALITY[qName]) qName = 'high';
const Q = QUALITY[qName];
if (params.has('pr')) Q.pr = clamp(+params.get('pr') || 1, 0.25, 2);   // test hook: render scale

/* ------------------------------------------------------------------ boot */
if (!Codex.webgl()) { Codex.noGL && Codex.noGL(); throw new Error('WebGL unavailable'); }
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, Math.min(devicePixelRatio, 2) * Q.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', stage.getAttribute('aria-label'));
renderer.domElement.setAttribute('role', 'img');

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.3, 3.2e6);

/* Sun: 24° above the horizon, from the camera side and slightly up-range, so the
 * default side view shows a lit booster with soft shading (artistic choice). */
const SUN = new THREE.Vector3(-0.42, 0.41, 0.81).normalize();

/* ------------------------------------------------------------------ shared GLSL */
const NOISE_GLSL = /* glsl */`
float hash13(vec3 p){ p = fract(p*0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash13(i), hash13(i+vec3(1,0,0)), f.x), mix(hash13(i+vec3(0,1,0)), hash13(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)), hash13(i+vec3(1,0,1)), f.x), mix(hash13(i+vec3(0,1,1)), hash13(i+vec3(1,1,1)), f.x), f.y), f.z); }
float vnoise2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(hash12(i), hash12(i+vec2(1,0)), f.x), mix(hash12(i+vec2(0,1)), hash12(i+vec2(1,1)), f.x), f.y); }
float fbm3(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a*vnoise(p); p *= 2.03; a *= 0.5; } return s; }
float fbm2(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++){ s += a*vnoise2(p); p = p*2.02 + 17.1; a *= 0.5; } return s; }
`;
// Swell components shared with the physics (booster-physics.js WAVES), so the
// deck moves with the waves on screen.
const W_UNI = {
  uWa: { value: WAVES.map(w => new THREE.Vector4(w.a, w.k, w.dir, w.ph)) },
  uWw: { value: WAVES.map(w => w.w) },
  uSea: { value: 1 }
};
const WAVE_GLSL = /* glsl */`
uniform vec4 uWa[5]; uniform float uWw[5]; uniform float uSea;
// height and slope of the swell at (x, z) (metres from the ship / site), time t
vec3 swell(vec2 p, float t, float fade){
  float h = 0.0; vec2 g = vec2(0.0);
  for (int i = 0; i < 5; i++){
    vec4 w = uWa[i]; vec2 D = vec2(cos(w.z), sin(w.z));
    float ph = w.y * dot(D, p) - uWw[i] * t + w.w;
    float a = w.x * uSea;
    h += a * sin(ph); g += a * w.y * cos(ph) * D;
  }
  return vec3(h, g * fade);
}
`;
const WATER_GLSL = /* glsl */`
// sea colour: dark body + Fresnel sky reflection + sun glitter (same model near and far)
vec3 waterShade(vec3 n, vec3 v, float dist, vec3 sun, float sunE, float skyGain, vec3 Ts, float cz){
  vec3 E = sunE * max(cz, 0.0) * Ts + sunE * vec3(0.10, 0.14, 0.22) * (0.35 + 0.65*clamp(cz*1.5 + 0.2, 0.0, 1.0));
  vec3 body = vec3(0.006, 0.030, 0.048) * E * 0.95;
  vec3 r = reflect(-v, n);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(v, n), 0.0), 5.0);
  vec3 sky = mix(vec3(0.20, 0.27, 0.36), vec3(0.06, 0.12, 0.24), clamp(r.y * 1.6, 0.0, 1.0)) * sunE * skyGain * 0.42 * Ts;
  float shin = mix(1400.0, 110.0, clamp(dist / 120000.0, 0.0, 1.0));
  float spec = pow(max(dot(r, sun), 0.0), shin) * mix(26.0, 3.0, clamp(dist / 120000.0, 0.0, 1.0));
  return mix(body, sky, fres) + sunE * Ts * spec;
}
`;

/* ================================================================== PLANET + SKY */
// Single-scattering sky after Nishita et al. (1993), Rayleigh coefficients from
// Bruneton & Neyret (2008), Chapman-function sun transmittance (Schüler, 2012) —
// the same model as launch.js, with this page's sea, coast and clouds.
const planetMat = new THREE.ShaderMaterial({
  uniforms: {
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    uUp: { value: new THREE.Vector3(0, 1, 0) }, uH: { value: 2 }, uCam: { value: new THREE.Vector3() },
    uSun: { value: SUN.clone() }, uTime: { value: 0 }, uLogFC: { value: 1 }, uCamFwd: { value: new THREE.Vector3() },
    uSunE: { value: 3.2 }, uSkyGain: { value: 2.6 }, uSteps: { value: Q.steps },
    uXb: { value: 0 }, uCoast: { value: -1e9 }, uSite: { value: new THREE.Vector4(0, 0, 0, 0) }, uCloud: { value: 0.5 }, uPix: { value: 0.001 },
    ...W_UNI
  },
  vertexShader: /* glsl */`
    uniform mat4 uInvProj; uniform mat4 uCamWorld;
    varying vec3 vDir;
    void main(){
      vec4 v = uInvProj * vec4(position.xy, -1.0, 1.0); v /= v.w;
      vDir = (uCamWorld * vec4(v.xyz, 0.0)).xyz;
      gl_Position = vec4(position.xy, 0.999, 1.0);
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform vec3 uUp, uCam, uSun, uCamFwd; uniform float uH, uTime, uLogFC, uSunE, uSkyGain, uSteps, uXb, uCoast, uCloud, uPix;
    uniform vec4 uSite; // xyz: site (ship or landing zone) in the local frame, w: near-field radius
    varying vec3 vDir;
    const float R = 6371000.0, HA = 100000.0, HR = 8000.0, HM = 1200.0, PI = 3.14159265;
    const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
    const float BM = 9e-6;
    ${NOISE_GLSL}
    ${WAVE_GLSL}
    ${WATER_GLSL}
    float chapman(float X, float h, float cz){
      float c = sqrt(X + h);
      if (cz >= 0.0) return c / (c * cz + 1.0) * exp(-h);
      float x0 = sqrt(1.0 - cz*cz) * (X + h);
      float c0 = sqrt(x0);
      return 2.0 * c0 * exp(X - x0) - c / (1.0 - c * cz) * exp(-h);
    }
    vec3 sunTrans(float h, float cz){
      float r = R + h;
      float disc = r*r*cz*cz - h*(2.0*R + h);
      if (cz < 0.0 && disc > 0.0) return vec3(0.0);
      float cR = chapman(R/HR, h/HR, cz);
      float geo = cR * exp(h/HR);
      return exp(-(BR * HR * cR + BM * 1.1 * HM * exp(-h/HM) * min(geo, 40.0)));
    }
    // land (RTLS only): coastline running north–south, scrub, a lagoon
    float coastAt(float z){ return uCoast + 140.0*sin(z/2100.0) + 70.0*sin(z/730.0 + 1.3) + 900.0*sin(z/23000.0); }
    vec4 land(float xs, float zs, float dist){
      float c = coastAt(zs);
      if (uCoast < -1e8 || xs > c) return vec4(0.0, 0.0, 0.0, 1.0);
      float lag = xs - c;
      if (lag < -5200.0 - 400.0*sin(zs/5000.0) && lag > -7600.0 - 500.0*sin(zs/6100.0)) return vec4(0.0, 0.0, 0.0, 0.6);
      vec2 p = vec2(xs, zs);
      float g = fbm2(p / 420.0), g2 = fbm2(p / 60.0 + 3.0), big = fbm2(p / 7000.0);
      vec3 scrub = mix(vec3(0.09, 0.12, 0.05), vec3(0.20, 0.20, 0.10), g) * (0.85 + 0.3*g2);
      scrub = mix(scrub, vec3(0.06, 0.10, 0.05), smoothstep(0.55, 0.75, big));
      vec3 col = mix(scrub, vec3(0.56, 0.51, 0.41), smoothstep(c - 110.0, c - 25.0, xs));   // beach
      // a coast road and a few pads/buildings as light specks far away
      col = mix(col, vec3(0.33, 0.32, 0.30), 1.0 - smoothstep(4.0, 8.0, abs(xs - (c - 420.0 + 60.0*sin(zs/1900.0)))));
      return vec4(col, 0.0);
    }
    float clouds(vec2 p){
      float c = fbm2(p / 4600.0 + vec2(3.1, 7.7));
      float d = fbm2(p / 800.0);
      return smoothstep(0.62 - 0.12*uCloud, 0.82, c*0.85 + d*0.25) * uCloud;
    }
    void main(){
      vec3 d = normalize(vDir);
      float h = max(uH, 0.5);
      float Rh = R + h;
      float mu = dot(uUp, d);
      float c0 = h * (2.0*R + h);
      float disc = Rh*Rh*mu*mu - c0;
      bool hit = mu < 0.0 && disc > 0.0;
      float tG = hit ? c0 / (-Rh*mu + sqrt(disc)) : 0.0;
      float cT = (h - HA) * (2.0*R + h + HA);
      float discT = Rh*Rh*mu*mu - cT;
      float t0 = 0.0, t1 = 0.0;
      if (h < HA){ t1 = hit ? tG : (-Rh*mu + sqrt(max(discT, 0.0))); }
      else if (discT > 0.0 && mu < 0.0){ t0 = cT / (-Rh*mu + sqrt(discT)); t1 = hit ? tG : (-Rh*mu + sqrt(discT)); }
      float nu = dot(d, uSun);
      float pR = 3.0/(16.0*PI) * (1.0 + nu*nu);
      float g = 0.76;
      float pM = 3.0/(8.0*PI) * ((1.0-g*g)*(1.0+nu*nu)) / ((2.0+g*g) * pow(1.0 + g*g - 2.0*g*nu, 1.5));
      vec3 sumR = vec3(0.0), sumM = vec3(0.0), tau = vec3(0.0);
      int N = int(uSteps);
      float seg = max(t1 - t0, 0.0);
      for (int i = 0; i < 16; i++){
        if (i >= N) break;
        float f = (float(i) + 0.5) / float(N);
        float s = t0 + seg * f * f;
        float fn = (float(i) + 1.0) / float(N);
        float ds = seg * (fn*fn - (float(i)/float(N))*(float(i)/float(N)));
        float rs = sqrt(Rh*Rh + 2.0*s*Rh*mu + s*s);
        float hs = max((c0 + 2.0*s*Rh*mu + s*s) / (rs + R), 0.0);
        vec3 us = (uUp*Rh + d*s) / rs;
        float dR = exp(-hs/HR), dM = exp(-hs/HM);
        vec3 st = (BR*dR + BM*1.1*dM) * ds;
        vec3 tMid = exp(-(tau + st*0.5));
        tau += st;
        vec3 ts = sunTrans(hs, dot(us, uSun));
        sumR += tMid * ts * dR * ds; sumM += tMid * ts * dM * ds;
      }
      vec3 T = exp(-tau);
      vec3 inscatter = uSunE * uSkyGain * (sumR * BR * pR + sumM * BM * pM);
      vec3 col; float depth = 0.99999;
      if (hit){
        vec3 P = uCam + d * tG;
        vec3 nrm = normalize(uUp*Rh + d*tG);
        float xs = uXb + R * atan(P.x, P.y + R), zs = P.z;
        float cz = dot(nrm, uSun);
        vec3 Ts = sunTrans(0.0, cz);
        vec4 sf = land(xs, zs, tG);
        if (sf.a > 0.5){
          // sea: swell normals (fading with distance) + fine ripples
          // fade detail once a pixel covers more than a few metres of sea (no moiré)
          float foot = tG * uPix / max(-mu, 0.05);
          float fade = 1.0 - smoothstep(4.0, 14.0, foot);
          vec3 sw = swell(vec2(P.x - uSite.x, P.z), uTime, fade);
          vec2 rp = vec2(xs, zs) * 0.09;
          float rf = (1.0 - smoothstep(0.6, 2.5, foot)) * 0.06;
          vec2 rip = vec2(vnoise2(rp + uTime*0.4) - 0.5, vnoise2(rp.yx*1.3 - uTime*0.3) - 0.5) * rf;
          vec3 wn = normalize(nrm + vec3(-sw.y - rip.x, 0.0, -sw.z - rip.y));
          col = waterShade(wn, -d, tG, uSun, uSunE, uSkyGain, Ts, cz);
          if (sf.a < 0.8) col *= vec3(0.8, 1.0, 0.9);
          // surf line along the beach
          float c = coastAt(zs);
          if (uCoast > -1e8){ float sl = (1.0 - smoothstep(0.0, 45.0, xs - c)) * (0.5 + 0.5*vnoise2(vec2(zs*0.03, xs*0.08 - uTime*0.6)));
            col = mix(col, vec3(0.8) * uSunE * max(cz, 0.1) * Ts / PI, sl * 0.6 * (1.0 - smoothstep(2000.0, 12000.0, tG))); }
        } else {
          vec3 E = uSunE * max(cz, 0.0) * Ts + uSunE * vec3(0.10, 0.14, 0.22) * (0.35 + 0.65*clamp(cz*1.5 + 0.2, 0.0, 1.0));
          col = sf.rgb * E / PI;
        }
        float cl = clouds(vec2(xs, zs) + vec2(uTime*3.0, 0.0));
        float cloudVis = smoothstep(1300.0, 2400.0, h) + smoothstep(6000.0, 30000.0, tG) * smoothstep(0.003, 0.03, -mu);
        col = mix(col, vec3(0.93, 0.95, 0.98) * (uSunE * Ts * max(cz, 0.0) + uSunE * vec3(0.15, 0.18, 0.24)) / PI, cl * clamp(cloudVis, 0.0, 1.0) * 0.95);
        col = col * T + inscatter;
        // inside the near-field patch the mesh ocean / land draws over this: write far depth there
        float near = length(vec2(P.x, P.z) - uSite.xz);
        float w = tG * max(dot(d, uCamFwd), 1e-4);
        depth = near < uSite.w ? 0.99999 : log2(1.0 + w) * uLogFC * 0.5;
      } else {
        col = inscatter;
        float sd = acos(clamp(nu, -1.0, 1.0));
        vec3 Tsun = sunTrans(h, mu);
        col += Tsun * uSunE * (smoothstep(0.0052, 0.0044, sd) * 60.0 + 0.6 * exp(-sd * 40.0));
        float skyLum = dot(inscatter, vec3(0.2126, 0.7152, 0.0722));
        float starVis = clamp(1.0 - skyLum * 8.0, 0.0, 1.0) * smoothstep(0.0, 0.15, mu + 0.3) * smoothstep(18000.0, 45000.0, h);
        if (starVis > 0.0){
          vec3 sp = d * 320.0; vec3 cell = floor(sp);
          float hsh = hash13(cell);
          if (hsh > 0.985){
            vec3 fc = fract(sp) - 0.5 - (vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5) * 0.6;
            float st = exp(-dot(fc, fc) * 90.0) * pow((hsh - 0.985) / 0.015, 3.0) * 6.0;
            col += st * mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash13(cell + 3.3)) * starVis;
          }
        }
        // cumulus deck seen from below
        if (h < 1800.0 && mu > 0.0){
          float tc = (1800.0 - h) / max(mu, 0.02);
          vec3 Pc = uCam + d * tc;
          float cl = clouds(vec2(uXb + Pc.x, Pc.z) + vec2(uTime*3.0, 0.0));
          vec3 ccol = vec3(0.95, 0.96, 1.0) * uSunE * (0.35 + 0.35 * nu) * sunTrans(1800.0, dot(uUp, uSun)) / PI + inscatter * 0.3;
          col = mix(col, ccol, cl * exp(-tc / 60000.0) * 0.9);
        }
      }
      gl_FragColor = vec4(col, 1.0);
      gl_FragDepth = depth;
    }`,
  depthWrite: true, depthTest: true
});
{
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  const planet = new THREE.Mesh(g, planetMat);
  planet.frustumCulled = false; planet.renderOrder = -100;
  scene.add(planet);
}

/* ================================================================== LIGHTS */
const sunLight = new THREE.DirectionalLight(0xfff1dc, 3.1);
sunLight.castShadow = Q.shadow > 0;
if (Q.shadow) {
  sunLight.shadow.mapSize.set(Q.shadow, Q.shadow);
  const sc = sunLight.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 600;
  sunLight.shadow.bias = -0.0008; sunLight.shadow.normalBias = 0.4;
}
scene.add(sunLight); scene.add(sunLight.target);
const hemi = new THREE.HemisphereLight(0x9cc4ff, 0x2a3440, 0.5);
scene.add(hemi);
const flameLight = new THREE.PointLight(0xffb070, 0, 0, 2);
scene.add(flameLight);
function buildEnv() {
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: { uSun: { value: SUN } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vP; void main(){ vec3 d = normalize(vP);
      vec3 sky = mix(vec3(0.55,0.70,0.92), vec3(0.14,0.30,0.66), pow(max(d.y,0.0), 0.5));
      vec3 sea = mix(vec3(0.10,0.16,0.22), vec3(0.03,0.07,0.11), clamp(-d.y*3.0,0.0,1.0));
      vec3 c = d.y > 0.0 ? sky : sea;
      c += vec3(1.0,0.9,0.75) * pow(max(dot(d,uSun),0.0), 64.0) * 6.0;
      gl_FragColor = vec4(c, 1.0); }`
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
  const rt = pm.fromScene(envScene, 0.02);
  pm.dispose();
  return rt.texture;
}
scene.environment = buildEnv();
scene.environmentIntensity = 0.6;

/* ================================================================== CANVAS TEXTURES */
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAniso);
  return t;
}
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

/* Booster body skin: u around the circumference (u = 0 faces +z, 0.25 faces +x),
 * v from the heat shield (0) to the interstage joint (1). Soot from the engines
 * and re-entry streaks up the lower body, heaviest on one side; the four
 * rectangles where the legs lay folded stay cleaner — a signature of a flown booster. */
const BODY0 = 1.1, BODY1 = 36.6, IST1 = VEH.length;   // heat shield, interstage joint, top (m)
// The soot pattern is generated once as a list of streaks and drawn twice: in colour
// for the paint, and in grey for a roughness map (soot is matte). Solid fills only,
// so it stays quick even where the 2-D canvas is software-rendered.
const SOOT = (() => {
  const r = rng(7), list = [];
  const sootSide = (u) => 0.45 + 0.55 * Math.pow(0.5 + 0.5 * Math.cos((u - 0.1) * Math.PI * 2), 1.5);
  for (let i = 0; i < 1300; i++) {
    const u = r(), side = sootSide(u);
    list.push({ u, len: Math.pow(r(), 1.6) * (6 + 24 * side) + 1.5, w: 1 + r() * r() * 14, a: (0.04 + r() * 0.11) * side, warm: r() < 0.5 });
  }
  const drips = [];
  for (let i = 0; i < 300; i++) drips.push({ u: r(), y0: BODY1 - r() * 4, len: 2 + r() * 12, w: 1 + r() * 2, a: 0.02 + r() * 0.04 });
  return { list, drips };
})();
function drawBody(g, W, H, rough) {
  const Y = (y) => H - (y - BODY0) / (BODY1 - BODY0) * H;
  const px = W / 1024;
  const soot = (a, warm) => rough ? `rgba(255,255,255,${a * 1.3})` : `rgba(${warm ? '52,40,30' : '28,22,17'},${a})`;
  g.fillStyle = rough ? '#6b6b6b' : '#e6e4de'; g.fillRect(0, 0, W, H);
  if (!rough) {
    g.fillStyle = 'rgba(60,60,60,.08)';
    for (let i = 0; i < 8; i++) g.fillRect(i / 8 * W, 0, 2 * px, H);
    for (const y of [3.6, 12.2, 19.8, 21.4, 28.6, 34.9]) { g.fillStyle = 'rgba(40,40,40,.22)'; g.fillRect(0, Y(y), W, 3 * px); }
  }
  const grad = g.createLinearGradient(0, H, 0, Y(7));
  grad.addColorStop(0, soot(0.97, false)); grad.addColorStop(0.35, soot(0.8, false)); grad.addColorStop(1, soot(0, false));
  g.fillStyle = grad; g.fillRect(0, Y(7), W, H - Y(7));
  // each streak: three stacked solid bands fading upward
  for (const s of SOOT.list) {
    const x = s.u * W, w = s.w * px;
    for (let k = 0; k < 3; k++) {
      const y0 = BODY0 + s.len * k / 3, y1 = BODY0 + s.len * (k + 1) / 3;
      g.fillStyle = soot(s.a * (1.25 - k * 0.4), s.warm);
      g.fillRect(x, Y(y1), w, Y(y0) - Y(y1));
    }
  }
  if (!rough) for (const d of SOOT.drips) { g.fillStyle = `rgba(90,80,70,${d.a})`; g.fillRect(d.u * W, Y(d.y0), d.w * px, d.len / (BODY1 - BODY0) * H); }
  // cleaner rectangles where the legs lay folded
  const lw = 0.95 / (2 * Math.PI * VEH.radius) * W;
  for (const u of [0, 0.25, 0.5, 0.75]) for (const off of [0, W]) {
    const x = u * W - lw / 2 + (u === 0 ? off : 0);
    g.fillStyle = rough ? 'rgba(107,107,107,.7)' : 'rgba(226,224,218,.72)';
    g.fillRect(x, Y(VEH.legHinge + VEH.legLength), lw, VEH.legLength / (BODY1 - BODY0) * H);
  }
  // cable raceway
  g.fillStyle = rough ? 'rgba(120,120,120,.6)' : 'rgba(120,120,118,.55)'; g.fillRect(0.625 * W - 6 * px, Y(BODY1), 12 * px, H);
}
const bodyTex = canvasTex(1024, 2048, (g, W, H) => drawBody(g, W, H, false));
bodyTex.wrapS = THREE.RepeatWrapping;
const bodyRough = canvasTex(256, 512, (g, W, H) => drawBody(g, W, H, true), false);
bodyRough.wrapS = THREE.RepeatWrapping;
const istTex = canvasTex(1024, 256, (g, W, H) => {
  const r = rng(11);
  g.fillStyle = '#17181a'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.012 + r() * 0.03})`; g.fillRect(r() * W, r() * H, 2 + r() * 30, 1 + r() * 3); }
  g.fillStyle = 'rgba(255,255,255,.06)'; for (let i = 0; i < 16; i++) g.fillRect(i / 16 * W, 0, 1, H);
  g.fillStyle = 'rgba(120,110,100,.25)'; g.fillRect(0, H - 6, W, 6);
});
istTex.wrapS = THREE.RepeatWrapping;
const glowTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,220,160,0.7)'); gr.addColorStop(0.5, 'rgba(255,140,60,0.18)'); gr.addColorStop(1, 'rgba(255,100,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const puffTex = canvasTex(256, 256, (g, w, h) => {
  const r = rng(3);
  for (let i = 0; i < 26; i++) {
    const a = r() * Math.PI * 2, rr = Math.pow(r(), 0.7) * 70;
    const x = 128 + Math.cos(a) * rr, y = 128 + Math.sin(a) * rr * 0.9, s = 26 + r() * 44;
    const gr = g.createRadialGradient(x, y, 0, x, y, s);
    gr.addColorStop(0, `rgba(255,255,255,${0.22 + r() * 0.2})`); gr.addColorStop(0.6, 'rgba(220,220,220,0.1)'); gr.addColorStop(1, 'rgba(200,200,200,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill();
  }
}, false);

/* ================================================================== MATERIALS */
const MAT = {
  body: new THREE.MeshStandardMaterial({ map: bodyTex, roughnessMap: bodyRough, roughness: 1.0, metalness: 0.0 }),
  ist: new THREE.MeshStandardMaterial({ map: istTex, roughness: 0.55, metalness: 0.15 }),
  inner: new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.9 }),
  heat: new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.95, metalness: 0.1, emissive: new THREE.Color(0xff5a1c), emissiveIntensity: 0 }),
  nozzle: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.38, metalness: 0.85, emissive: new THREE.Color(0xff6a2a), emissiveIntensity: 0 }),
  leg: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.5, metalness: 0.25 }),
  legEdge: new THREE.MeshStandardMaterial({ color: 0x55585c, roughness: 0.4, metalness: 0.8 }),
  piston: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 1.0 }),
  ti: new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 0.45, metalness: 0.9, emissive: new THREE.Color(0xff5020), emissiveIntensity: 0 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x2c2e31, roughness: 0.6, metalness: 0.5 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.55 }),
  grey: new THREE.MeshStandardMaterial({ color: 0x74777c, roughness: 0.7, metalness: 0.3 })
};
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
function flipGeo(g) {
  const f = g.index ? g.toNonIndexed() : g.clone();
  const pos = f.attributes.position, nrm = f.attributes.normal, uv = f.attributes.uv, col = f.attributes.color;
  for (let i = 0; i < pos.count; i += 3) for (const a of [pos, nrm, uv, col].filter(Boolean))
    for (let c = 0; c < a.itemSize; c++) { const t = a.getComponent(i + 1, c); a.setComponent(i + 1, c, a.getComponent(i + 2, c)); a.setComponent(i + 2, c, t); }
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  return f;
}
function twoSided(g) { const a = g.index ? g.toNonIndexed() : g; return mergeGeometries([a, flipGeo(a)]); }

/* ================================================================== THE BOOSTER */
// Group origin = centre of the nozzle-exit plane; +y along the axis.
const R0 = VEH.radius;
const OUTER = [...Array(8)].map((_, i) => (i * 45 + 22.5) * DEG);   // outer ring of eight engines
const ENGINE_POS = [[0, 0]].concat(OUTER.map(a => [Math.sin(a) * 1.22, Math.cos(a) * 1.22]));
// lit sets: 1 → centre; 3 → centre + two opposite outer; 9 → all
const LIT = { 1: [0], 3: [0, 3, 7], 9: [0, 1, 2, 3, 4, 5, 6, 7, 8] };
const B = { root: new THREE.Group(), legs: [], fins: [], plumes: [], nozzles: [] };
function merlin() {
  // bell: throat r 0.13 at y = 1.05, exit r 0.46 at y = 0 (ESTIMATE from photographs)
  const pts = [];
  for (let i = 0; i <= 14; i++) { const t = i / 14; pts.push(new THREE.Vector2(0.46 - 0.33 * Math.pow(t, 0.55), t * 1.05)); }
  const g = new THREE.LatheGeometry(pts, Q.seg);
  const col = [];
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getY(i) / 1.05;
    // heat-tinted: bronze/blue near the exit, dark steel above
    const c = new THREE.Color().setRGB(lerp(0.40, 0.16, t), lerp(0.30, 0.15, t), lerp(0.30, 0.15, t));
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return twoSided(g);
}
function buildBooster() {
  const root = B.root;
  // body (white, sooty)
  mesh(new THREE.CylinderGeometry(R0, R0, BODY1 - BODY0, Q.seg * 2, 1, true), MAT.body, root, 0, (BODY0 + BODY1) / 2, 0);
  // interstage (black composite), open at the top
  mesh(new THREE.CylinderGeometry(R0 + 0.01, R0 + 0.01, IST1 - BODY1, Q.seg * 2, 1, true), MAT.ist, root, 0, (BODY1 + IST1) / 2, 0);
  mesh(flipGeo(new THREE.CylinderGeometry(R0 - 0.03, R0 - 0.03, IST1 - BODY1 - 0.05, Q.seg, 1, true)), MAT.inner, root, 0, (BODY1 + IST1) / 2, 0);
  mesh(new THREE.CylinderGeometry(R0 - 0.02, R0 - 0.02, 0.08, Q.seg), MAT.inner, root, 0, BODY1 + 0.6, 0);         // forward dome (seen from above)
  mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.2, 16), MAT.dark, root, 0, BODY1 + 1.2, 0);                        // stage-separation pusher
  mesh(new THREE.TorusGeometry(R0 + 0.01, 0.05, 6, Q.seg * 2), MAT.dark, root, 0, IST1, 0).rotation.x = Math.PI / 2;
  // raceway (cable tray)
  const rw = mesh(new THREE.BoxGeometry(0.16, BODY1 - BODY0 - 1, 0.1), MAT.grey, root, 0, (BODY0 + BODY1) / 2, 0);
  const aR = 0.625 * Math.PI * 2; rw.position.set(Math.sin(aR) * (R0 + 0.04), (BODY0 + BODY1) / 2, Math.cos(aR) * (R0 + 0.04)); rw.rotation.y = aR;
  // engine section: heat shield + octaweb skirt + nine engines
  B.heat = mesh(new THREE.CylinderGeometry(R0 - 0.02, R0 - 0.06, 0.3, Q.seg * 2), MAT.heat, root, 0, BODY0 - 0.05, 0);
  const nz = merlin();
  ENGINE_POS.forEach(([x, z]) => {
    const n = mesh(nz, MAT.nozzle, root, x, 0, z); B.nozzles.push(n);
    mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.25, 12), MAT.dark, root, x, 1.02, z);                          // flexible boot
  });
  // RCS thruster pods at the top of the interstage, facing ±x (the pitch plane)
  for (const s of [-1, 1]) {
    const p = mesh(new THREE.BoxGeometry(0.35, 0.55, 0.5), MAT.dark, root, s * (R0 + 0.12), IST1 - 1.2, 0);
    p.userData.rcs = s;
  }
  // onboard camera housing (the view down the side toward the legs)
  mesh(new THREE.BoxGeometry(0.25, 0.3, 0.25), MAT.dark, root, 0, BODY1 + 1.6, R0 + 0.12);
  mesh(new THREE.BoxGeometry(0.12, 0.12, 0.9), MAT.dark, root, 0, BODY1 + 1.35, R0 + 0.6);   // camera boom
  /* legs: hinge at station 2.4 m, 8 m long, folded flat along the body; in the
   * pitch plane (±x) and across it (±z) */
  for (let i = 0; i < 4; i++) {
    const psi = i * Math.PI / 2;                            // 0 = +z, π/2 = +x …
    const mount = new THREE.Group(); mount.rotation.y = psi;
    mount.position.set(Math.sin(psi) * (R0 + 0.22), VEH.legHinge, Math.cos(psi) * (R0 + 0.22));
    root.add(mount);
    const pivot = new THREE.Group(); mount.add(pivot);      // rotates about local x: outward (+z) = deploy
    const L = VEH.legLength;
    // leg: tapered box (0.95 m wide at the hinge, 0.6 m at the foot), carbon-fibre black
    const lg = new THREE.BoxGeometry(0.8, L, 0.36, 1, 4, 1);
    const p = lg.attributes.position;
    for (let k = 0; k < p.count; k++) { const t = p.getY(k) / L + 0.5; p.setX(k, p.getX(k) * lerp(1.18, 0.72, t)); }
    lg.computeVertexNormals(); lg.translate(0, L / 2, 0);
    mesh(lg, MAT.leg, pivot);
    mesh(new THREE.BoxGeometry(0.06, L * 0.96, 0.38), MAT.legEdge, pivot, 0.33, L * 0.5, 0).rotation.z = 0.02;
    mesh(new THREE.BoxGeometry(0.06, L * 0.96, 0.38), MAT.legEdge, pivot, -0.33, L * 0.5, 0).rotation.z = -0.02;
    const foot = mesh(new THREE.CylinderGeometry(0.5, 0.55, 0.2, 16), MAT.dark, pivot, 0, L, 0);
    foot.rotation.x = -114 * DEG;          // flat on the ground once the leg is fully down
    // telescoping strut: body anchor at station 11 m, leg attach 60 % along
    const struts = [0.16, 0.12, 0.09].map((r, k) => mesh(new THREE.CylinderGeometry(r, r, 1, 10), k ? MAT.piston : MAT.dark, root));
    B.legs.push({ psi, mount, pivot, struts, attach: 0.6 * L });
  }
  /* grid fins: four in an X at station 40.2 m; folded flat pointing up, they swing
   * out 90° about their lower hinge, then twist about their span to steer */
  const finGeo = gridFinGeo();
  for (let i = 0; i < 4; i++) {
    const psi = (45 + i * 90) * DEG;
    const mount = new THREE.Group(); mount.rotation.y = psi;
    mount.position.set(Math.sin(psi) * (R0 + 0.16), VEH.yFins - 0.2, Math.cos(psi) * (R0 + 0.16));
    root.add(mount);
    const hinge = new THREE.Group(); mount.add(hinge);
    mesh(new THREE.BoxGeometry(0.5, 0.35, 0.3), MAT.dark, mount, 0, 0, -0.05);   // actuator housing
    const defl = new THREE.Group(); hinge.add(defl); defl.position.y = 0.12;
    mesh(finGeo, MAT.ti, defl);
    B.fins.push({ psi, hinge, defl });
  }
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(root);
}
function gridFinGeo() {
  // 1.2 m wide × 1.5 m span × 0.24 m deep frame with a 45° lattice of thin blades
  const Wd = 1.2, S = 1.5, Dp = 0.24, t = 0.035;
  const parts = [];
  const box = (w, h, x, y, rz = 0) => { const b = new THREE.BoxGeometry(w, h, Dp); b.rotateZ(rz); b.translate(x, y, 0); parts.push(b); };
  box(Wd, 0.07, 0, 0.035); box(Wd, 0.07, 0, S - 0.035); box(0.07, S, -Wd / 2 + 0.035, S / 2); box(0.07, S, Wd / 2 - 0.035, S / 2);
  const step = 0.16;
  for (const sgn of [1, -1]) for (let c = -S; c < Wd + S; c += step) {
    // line x·sgn + y = c', clipped to the rectangle [-W/2, W/2] × [0, S]
    const pts = [];
    const x0 = -Wd / 2, x1 = Wd / 2;
    const f = (x) => c - Wd / 2 - sgn * x;           // y on the line
    for (const x of [x0, x1]) { const y = f(x); if (y >= 0 && y <= S) pts.push([x, y]); }
    for (const y of [0, S]) { const x = (c - Wd / 2 - y) * sgn; if (x >= x0 && x <= x1) pts.push([x, y]); }
    if (pts.length < 2) continue;
    const [a, b] = pts; const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 0.05) continue;
    box(t, len, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(b[0] - a[0], b[1] - a[1]) * -1);
  }
  return mergeGeometries(parts);
}
buildBooster();

/* ================================================================== PLUMES AND GLOWS */
const plumeVS = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uLen, uR0, uR1, uK, uNeck;
  varying float vS; varying vec3 vN; varying vec3 vV; varying float vAng;
  void main(){
    float s = clamp(-position.y, 0.0, 1.0);
    float grow = (1.0 - exp(-s*uK)) / (1.0 - exp(-uK));
    float r = mix(uR0, uR1, grow) * (1.0 - uNeck * sin(s * 3.14159) * 0.35);
    vec3 p = vec3(position.x * r, -s*uLen, position.z * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normalize(vec3(position.x, (uR1-uR0)/uLen*0.5, position.z)));
    vV = -mv.xyz; vS = s; vAng = atan(position.z, position.x);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const plumeFS = /* glsl */`
  #include <logdepthbuf_pars_fragment>
  uniform float uTime, uI, uSeed, uCore, uFade, uDiam, uCells;
  uniform vec3 uC0, uC1, uC2;
  varying float vS; varying vec3 vN; varying vec3 vV; varying float vAng;
  ${NOISE_GLSL}
  void main(){
    #include <logdepthbuf_fragment>
    float e = abs(dot(normalize(vN), normalize(vV)));
    float core = pow(e, uCore);
    float s = vS;
    float n = fbm3(vec3(cos(vAng)*2.0 + uSeed, sin(vAng)*2.0, s*9.0 - uTime*9.0));
    vec3 col = mix(uC0, uC1, smoothstep(0.02, 0.3, s));
    col = mix(col, uC2, smoothstep(0.3, 0.95, s));
    // shock diamonds (dense air): periodic bright cells that fade down-stream
    float dia = uDiam * pow(0.5 + 0.5*cos(s * uCells * 6.2832), 6.0) * (1.0 - smoothstep(0.05, 0.6, s));
    float I = uI * smoothstep(0.0, 0.015, s) * (1.0 - smoothstep(uFade, 1.0, s)) * (0.45 + 0.85*n) * core;
    I += uI * dia * core * 1.6;
    gl_FragColor = vec4(col * I, 1.0);
  }`;
const plumeGeo = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 28, 40, true); g.translate(0, -0.5, 0); return g; })();
function plumeMat(o) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uLen: { value: o.len }, uR0: { value: o.r0 }, uR1: { value: o.r1 }, uK: { value: o.k || 2 }, uNeck: { value: 0 },
      uTime: { value: 0 }, uI: { value: 0 }, uSeed: { value: Math.random() * 10 }, uCore: { value: o.core || 1.3 }, uFade: { value: o.fade ?? 0.3 },
      uDiam: { value: 0 }, uCells: { value: 5 },
      uC0: { value: new THREE.Color(...o.c0) }, uC1: { value: new THREE.Color(...o.c1) }, uC2: { value: new THREE.Color(...o.c2) }
    },
    vertexShader: plumeVS, fragmentShader: plumeFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
}
// Kerosene/oxygen exhaust: a white-yellow core turning orange; sooty at the edges.
const KERO = { c0: [1.0, 0.92, 0.7], c1: [1.0, 0.6, 0.22], c2: [0.75, 0.25, 0.06] };
ENGINE_POS.forEach(([x, z]) => {
  const p = new THREE.Mesh(plumeGeo, plumeMat({ len: 14, r0: 0.44, r1: 0.7, ...KERO }));
  p.position.set(x, 0.02, z); p.frustumCulled = false; p.renderOrder = 5; p.visible = false;
  B.root.add(p); B.plumes.push(p);
});
// the whole-cluster envelope (high altitude: exhaust expands enormously in thin air)
const envPlume = new THREE.Mesh(plumeGeo, plumeMat({ len: 90, r0: 1.6, r1: 30, k: 3, c0: [1, 0.85, 0.6], c1: [1, 0.55, 0.2], c2: [0.6, 0.2, 0.05], core: 0.8, fade: 0.1 }));
envPlume.frustumCulled = false; envPlume.renderOrder = 4; envPlume.visible = false; B.root.add(envPlume);
/* Entry-burn "cushion": in supersonic retro-propulsion the oncoming air stops the
 * exhaust a few body diameters ahead and folds it back around the stage. Drawn
 * as a glowing bell that opens up past the vehicle. */
const shellVS = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vN; varying vec3 vV; varying float vY; varying float vA;
  void main(){
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vN = normalize(normalMatrix * normal); vV = -mv.xyz; vY = position.y; vA = atan(position.z, position.x);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const shellFS = /* glsl */`
  #include <logdepthbuf_pars_fragment>
  uniform float uI, uTime, uY0, uY1; uniform vec3 uC0, uC1;
  varying vec3 vN; varying vec3 vV; varying float vY; varying float vA;
  ${NOISE_GLSL}
  void main(){
    #include <logdepthbuf_fragment>
    float e = abs(dot(normalize(vN), normalize(vV)));
    float rim = pow(1.0 - e, 1.6) * 0.8 + 0.25;
    float t = clamp((vY - uY0) / (uY1 - uY0), 0.0, 1.0);
    float n = fbm3(vec3(cos(vA)*2.5, sin(vA)*2.5, vY*0.12 - uTime*3.0));
    float I = uI * rim * (0.35 + 0.9*n) * smoothstep(0.0, 0.1, t) * (1.0 - smoothstep(0.35, 1.0, t));
    gl_FragColor = vec4(mix(uC0, uC1, t) * I, 1.0);
  }`;
function bell(y0, y1, rMax, pow = 0.5) {
  const pts = [];
  for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(new THREE.Vector2(0.02 + rMax * Math.pow(t, pow), y0 + (y1 - y0) * t)); }
  return new THREE.LatheGeometry(pts, 40);
}
// teardrop: widest a little above the engines, closing around the upper body
function bulb(y0, y1, rMax) {
  const pts = [];
  for (let i = 0; i <= 28; i++) { const t = i / 28; pts.push(new THREE.Vector2(0.05 + rMax * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.8) * (1 - 0.35 * t), y0 + (y1 - y0) * t)); }
  return new THREE.LatheGeometry(pts, 40);
}
const cushion = new THREE.Mesh(bulb(-10, 30, 9.5), new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 }, uTime: { value: 0 }, uY0: { value: -10 }, uY1: { value: 30 }, uC0: { value: new THREE.Color(1, 0.62, 0.26) }, uC1: { value: new THREE.Color(0.95, 0.32, 0.08) } },
  vertexShader: shellVS, fragmentShader: shellFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
}));
cushion.frustumCulled = false; cushion.renderOrder = 6; cushion.visible = false; B.root.add(cushion);
// bow-shock glow ahead of the engines during unpowered re-entry (heating)
const shock = new THREE.Mesh(bell(-4.5, 6, 3.4, 0.5), new THREE.ShaderMaterial({
  uniforms: { uI: { value: 0 }, uTime: { value: 0 }, uY0: { value: -4.5 }, uY1: { value: 6 }, uC0: { value: new THREE.Color(1, 0.55, 0.3) }, uC1: { value: new THREE.Color(0.8, 0.3, 0.4) } },
  vertexShader: shellVS, fragmentShader: shellFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
}));
shock.frustumCulled = false; shock.renderOrder = 6; shock.visible = false; B.root.add(shock);
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
glow.renderOrder = 7; glow.visible = false; scene.add(glow);

/* ================================================================== THE SECOND STAGE (illustrative) */
// Only for the first seconds of the drone-ship and RTLS scenarios: the upper
// stage pulls away and lights its vacuum engine. Dimensions approximate.
const S2 = new THREE.Group();
{
  mesh(new THREE.CylinderGeometry(R0, R0, 12.6, Q.seg * 2, 1, true), MAT.white, S2, 0, 6.3 + 1.6, 0);
  const fair = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; fair.push(new THREE.Vector2(2.6 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 2.2))) + 0.02, 14.2 + t * 13)); }
  mesh(new THREE.LatheGeometry([new THREE.Vector2(R0, 14.2), new THREE.Vector2(2.6, 15.6), ...fair.slice(1)], Q.seg), MAT.white, S2);
  mesh(new THREE.CylinderGeometry(R0, 2.6, 1.4, Q.seg, 1, true), MAT.white, S2, 0, 14.9, 0);
  const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new THREE.Vector2(1.6 - 1.35 * Math.pow(t, 0.6), -1.6 + t * 3.2)); }
  mesh(twoSided(new THREE.LatheGeometry(pts, Q.seg)), new THREE.MeshStandardMaterial({ color: 0x2b2826, roughness: 0.35, metalness: 0.9 }), S2);
  S2.plume = new THREE.Mesh(plumeGeo, plumeMat({ len: 80, r0: 1.55, r1: 26, k: 3, c0: [1, 0.85, 0.6], c1: [1, 0.55, 0.25], c2: [0.5, 0.2, 0.08], core: 0.9, fade: 0.1 }));
  S2.plume.position.y = -1.6; S2.plume.frustumCulled = false; S2.plume.renderOrder = 5; S2.add(S2.plume);
  S2.traverse(o => { if (o.isMesh && o !== S2.plume) o.castShadow = true; });
  scene.add(S2);
}

/* ================================================================== THE DRONE SHIP */
// 91 m × 52 m deck (ESTIMATE from photographs of the recovery barges). Hull, wing
// extensions, blast walls, four thruster units, a scorched deck with a plain
// painted target ring. No names or markings.
const ship = new THREE.Group();
const shipMove = new THREE.Group(); ship.add(shipMove);
const deckTex = canvasTex(2048, 1170, (g, W, H) => {
  const r = rng(21), sx = W / SHIP.length, sz = H / SHIP.width;
  g.fillStyle = '#3a3c3e'; g.fillRect(0, 0, W, H);
  // steel plates
  for (let i = 0; i < 1200; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},${0.015 + r() * 0.03})`; g.fillRect(r() * W, r() * H, 20 + r() * 90, 10 + r() * 50); }
  g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2;
  for (let x = 0; x < W; x += 3 * sx) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 2 * sz) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  // rust streaks
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(110,60,30,${0.05 + r() * 0.08})`; g.fillRect(r() * W, r() * H, 3 + r() * 8, 20 + r() * 80); }
  const cx = W / 2, cy = H / 2;
  // scorch: many landings leave a black, blistered centre
  g.save(); g.translate(cx, cy); g.scale(1, sz / sx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 17 * sx);
  gr.addColorStop(0, 'rgba(8,7,6,.95)'); gr.addColorStop(0.55, 'rgba(14,12,10,.75)'); gr.addColorStop(1, 'rgba(20,18,16,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 17 * sx, 0, 6.2832); g.fill(); g.restore();
  for (let i = 0; i < 400; i++) { const a = r() * 6.28, d = Math.pow(r(), 0.6) * 22 * sx; g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '70,60,50'},${0.1 + r() * 0.2})`; g.beginPath(); g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * sz / sx, 3 + r() * 12, 0, 6.28); g.fill(); }
  // painted target ring (faded white), plain
  g.strokeStyle = 'rgba(225,220,205,.55)'; g.lineWidth = 0.9 * sx;
  g.beginPath(); g.arc(cx, cy, 20 * sx, 0, 6.28); g.stroke();
  g.lineWidth = 0.5 * sx; g.strokeStyle = 'rgba(225,220,205,.35)';
  g.beginPath(); g.arc(cx, cy, 6 * sx, 0, 6.28); g.stroke();
  // hazard edges
  for (let x = 0; x < W; x += 1.6 * sx) { g.fillStyle = (x / (1.6 * sx)) % 2 < 1 ? 'rgba(210,170,40,.8)' : 'rgba(20,20,20,.8)'; g.fillRect(x, 0, 1.6 * sx, 0.5 * sz); g.fillRect(x, H - 0.5 * sz, 1.6 * sx, 0.5 * sz); }
});
{
  const L = SHIP.length, Wd = SHIP.width, hullW = 30.5, hullD = 6.2, free = SHIP.deck;
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x23272b, roughness: 0.75, metalness: 0.35 });
  const redMat = new THREE.MeshStandardMaterial({ color: 0x6b2219, roughness: 0.8 });
  mesh(new THREE.BoxGeometry(L, hullD, hullW), hullMat, shipMove, 0, free - 0.45 - hullD / 2, 0);   // top sits under the deck plate
  mesh(new THREE.BoxGeometry(L + 0.2, 0.9, hullW + 0.2), redMat, shipMove, 0, free - hullD + 2.4, 0);   // boot-top at the waterline
  const deck = mesh(new THREE.BoxGeometry(L, 0.4, Wd), [MAT.dark, MAT.dark, new THREE.MeshStandardMaterial({ map: deckTex, roughness: 0.85, metalness: 0.35 }), MAT.dark, MAT.dark, MAT.dark], shipMove, 0, free - 0.2, 0);
  deck.receiveShadow = true;
  // wing supports under the cantilevered deck
  for (const s of [-1, 1]) for (let i = -4; i <= 4; i++) {
    const b = mesh(new THREE.BoxGeometry(0.4, 0.4, (Wd - hullW) / 2 * 1.25), MAT.grey, shipMove, i * 10, free - 1.6, s * (hullW / 2 + (Wd - hullW) / 4));
    b.rotation.x = s * 0.55;
  }
  // blast walls along the aft edge and thruster units on the corners
  mesh(new THREE.BoxGeometry(1.2, 3.2, Wd * 0.62), MAT.grey, shipMove, -L / 2 + 1.2, free + 1.6, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const u = mesh(new THREE.BoxGeometry(12, 2.8, 2.5), new THREE.MeshStandardMaterial({ color: 0xcfd2d4, roughness: 0.6 }), shipMove, sx * (L / 2 - 8), free + 1.4, sz * (Wd / 2 - 1.8));
    u.userData.unit = true;
  }
  // railings
  const railMat = new THREE.MeshStandardMaterial({ color: 0xc9a33a, roughness: 0.5, metalness: 0.4 });
  for (const sz of [-1, 1]) mesh(new THREE.BoxGeometry(L - 26, 0.06, 0.06), railMat, shipMove, 0, free + 1.0, sz * (Wd / 2 - 0.2));
  shipMove.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false; } });
  deck.castShadow = false;
  scene.add(ship);
}

/* ================================================================== THE LANDING ZONE */
// A round concrete pad 800 m from the beach, scrub around it, a service road and
// a few low buildings. Generic, no markings but a painted ring.
const lz = new THREE.Group();
const LZ_SIZE = 4000;
const lzTex = canvasTex(1024, 1024, (g, W, H) => {
  const r = rng(5), s = W / LZ_SIZE;
  const X = (x) => (x + LZ_SIZE / 2) * s;         // metres from the pad (x down-range) → px
  g.fillStyle = '#3b4527'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2500; i++) { const c = r(); g.fillStyle = c < 0.4 ? `rgba(28,40,18,${0.25 + r() * 0.3})` : c < 0.8 ? `rgba(92,94,52,${0.15 + r() * 0.2})` : `rgba(150,138,100,${0.12 + r() * 0.15})`; g.beginPath(); g.arc(r() * W, r() * H, 2 + r() * 16, 0, 6.28); g.fill(); }
  // coast: beach then sea (transparent — the sky shader draws the sea there)
  const coast = SCENARIOS.rtls.coastX - SCENARIOS.rtls.targetX;      // +800 m
  g.clearRect(X(coast), 0, W - X(coast), H);
  const bg = g.createLinearGradient(X(coast - 120), 0, X(coast), 0);
  bg.addColorStop(0, 'rgba(120,110,85,0)'); bg.addColorStop(0.3, 'rgba(150,138,108,1)'); bg.addColorStop(1, 'rgba(170,160,130,1)');
  g.fillStyle = bg; g.fillRect(X(coast - 120), 0, X(coast) - X(coast - 120), H);
  // service roads
  g.strokeStyle = '#6d695f'; g.lineWidth = 7 * s;
  g.beginPath(); g.moveTo(X(-50), H / 2); g.lineTo(X(-900), H / 2 + 60 * s); g.lineTo(X(-2000), H / 2 + 140 * s); g.stroke();
  g.beginPath(); g.moveTo(X(coast - 400), 0); g.lineTo(X(coast - 430), H); g.stroke();
  // cleared apron around the pad
  g.fillStyle = 'rgba(120,112,90,.55)'; g.beginPath(); g.arc(W / 2, H / 2, 95 * s, 0, 6.28); g.fill();
});
{
  const land = new THREE.Mesh(new THREE.PlaneGeometry(LZ_SIZE, LZ_SIZE), new THREE.MeshStandardMaterial({ map: lzTex, roughness: 0.95, transparent: true, alphaTest: 0.5 }));
  land.rotation.x = -Math.PI / 2; land.receiveShadow = true; lz.add(land);
  const padTex = canvasTex(1024, 1024, (g, W, H) => {
    const r = rng(9), cx = W / 2;
    g.fillStyle = '#a9a69d'; g.beginPath(); g.arc(cx, cx, cx, 0, 6.28); g.fill();
    for (let i = 0; i < 3000; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.02 + r() * 0.04})`; g.fillRect(r() * W, r() * H, 2 + r() * 20, 2 + r() * 20); }
    g.strokeStyle = 'rgba(0,0,0,.2)'; g.lineWidth = 2; for (let x = 0; x < W; x += W / 14) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(W, x); g.stroke(); }
    const gr = g.createRadialGradient(cx, cx, 0, cx, cx, cx * 0.55); gr.addColorStop(0, 'rgba(10,9,8,.9)'); gr.addColorStop(1, 'rgba(20,18,16,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(240,238,230,.8)'; g.lineWidth = 14; g.beginPath(); g.arc(cx, cx, cx * 0.62, 0, 6.28); g.stroke();
    g.lineWidth = 8; g.beginPath(); g.arc(cx, cx, cx * 0.16, 0, 6.28); g.stroke();
    g.globalCompositeOperation = 'destination-in'; g.beginPath(); g.arc(cx, cx, cx - 2, 0, 6.28); g.fill();
  });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(43, 64), new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.9, transparent: true }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.08; pad.receiveShadow = true; lz.add(pad);
  const bmat = new THREE.MeshStandardMaterial({ color: 0xd4d2cb, roughness: 0.8 });
  for (const [x, z, w, h, d] of [[-420, 180, 40, 9, 24], [-470, 230, 18, 6, 14], [-380, -260, 26, 7, 16], [-150, 320, 10, 14, 10]]) mesh(new THREE.BoxGeometry(w, h, d), bmat, lz, x, h / 2, z);
  // four light towers around the pad
  for (let i = 0; i < 4; i++) { const a = (i * 90 + 45) * DEG; mesh(new THREE.CylinderGeometry(0.25, 0.35, 30, 8), MAT.grey, lz, Math.cos(a) * 110, 15, Math.sin(a) * 110); mesh(new THREE.BoxGeometry(3, 1.5, 0.6), MAT.dark, lz, Math.cos(a) * 110, 30, Math.sin(a) * 110); }
  lz.traverse(o => { if (o.isMesh) { o.receiveShadow = true; o.castShadow = false; } });
  scene.add(lz);
}

/* ================================================================== NEAR-FIELD OCEAN */
const OCEAN_R = 900;
const oceanMat = new THREE.ShaderMaterial({
  uniforms: {
    uTime: { value: 0 }, uSun: { value: SUN }, uSunE: { value: 3.2 }, uSkyGain: { value: 2.6 }, uCamL: { value: new THREE.Vector3() },
    uR: { value: OCEAN_R }, uHull: { value: new THREE.Vector2(SHIP.length / 2, 15.25) }, uShip: { value: 1 }, uHaze: { value: new THREE.Color(0.5, 0.6, 0.7) },
    ...W_UNI
  },
  vertexShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    ${WAVE_GLSL}
    uniform float uTime, uR;
    varying vec3 vW; varying vec3 vN; varying float vH; varying vec2 vP;
    void main(){
      vec2 p = position.xz;
      // Gerstner: points also move sideways (steepness 0.55) so crests sharpen
      vec3 d = vec3(0.0); vec3 n = vec3(0.0, 1.0, 0.0);
      float h = 0.0;
      for (int i = 0; i < 5; i++){
        vec4 w = uWa[i]; vec2 D = vec2(cos(w.z), sin(w.z));
        float ph = w.y * dot(D, p) - uWw[i] * uTime + w.w;
        float a = w.x * uSea, q = 0.55 / (w.y * a * 5.0 + 1e-4);
        q = min(q, 1.0);
        d.xz -= q * a * D * cos(ph);
        h += a * sin(ph);
        n.xz -= D * w.y * a * cos(ph);
        n.y -= q * w.y * a * sin(ph);
      }
      vec3 pos = vec3(p.x + d.x, h, p.y + d.z);
      vH = h; vP = p;
      vN = normalize(n);
      vec4 wp = modelMatrix * vec4(pos, 1.0);
      vW = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <logdepthbuf_pars_fragment>
    uniform vec3 uSun, uCamL, uHaze; uniform float uSunE, uSkyGain, uTime, uR, uShip; uniform vec2 uHull;
    varying vec3 vW; varying vec3 vN; varying float vH; varying vec2 vP;
    ${NOISE_GLSL}
    ${WATER_GLSL}
    void main(){
      #include <logdepthbuf_fragment>
      vec3 v = normalize(uCamL - vW);
      float dist = length(uCamL - vW);
      vec2 rp = vP * 0.35;
      vec3 n = normalize(vN + vec3(vnoise2(rp + uTime*0.6) - 0.5, 0.0, vnoise2(rp.yx*1.3 - uTime*0.5) - 0.5) * 0.12 * (1.0 - smoothstep(60.0, 700.0, dist)));
      vec3 Ts = vec3(1.0, 0.96, 0.9);
      vec3 col = waterShade(n, v, dist, uSun, uSunE, uSkyGain, Ts, uSun.y);
      // foam: crests, and churned water along the hull
      float crest = smoothstep(0.7, 1.1, vH) * smoothstep(0.45, 0.8, vnoise2(vP * 0.25 + uTime * 0.15)) * 0.5;
      vec2 q = abs(vP) - uHull;
      float dh = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
      float hull = uShip * (1.0 - smoothstep(0.0, 7.0, dh)) * (0.5 + 0.5 * vnoise2(vP * 0.5 + uTime * 0.7));
      float foam = clamp(crest * 0.5 + hull, 0.0, 1.0);
      col = mix(col, vec3(0.85, 0.88, 0.9) * uSunE * max(uSun.y, 0.1) * 0.35, foam * 0.8);
      col = mix(col, uHaze, 1.0 - exp(-dist / 90000.0));
      float r = length(vP);
      float a = 1.0 - smoothstep(uR * 0.65, uR * 0.98, r);
      gl_FragColor = vec4(col, a);
    }`,
  transparent: true, depthWrite: true
});
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(OCEAN_R * 2, OCEAN_R * 2, Q.ocean, Q.ocean).rotateX(-Math.PI / 2), oceanMat);
ocean.frustumCulled = false; ocean.renderOrder = -50;
scene.add(ocean);

/* ================================================================== PARTICLES */
// CPU particles, drawn as instanced soft billboards. World coordinates are
// stored relative to the sim (down-range x, altitude h, side z) so they stay put
// while the floating origin moves.
function makeParticles(max, additive) {
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geo.setIndex([0, 1, 2, 0, 2, 3]);
  const aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const aDat = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('iPos', aPos); geo.setAttribute('iDat', aDat); geo.setAttribute('iCol', aCol);
  geo.instanceCount = 0;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uMap: { value: puffTex } },
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 iPos; attribute vec4 iDat; attribute vec3 iCol;
      varying vec2 vUv; varying float vA; varying vec3 vC;
      void main(){
        vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
        float c = cos(iDat.z), s = sin(iDat.z);
        mv.xy += vec2(c*position.x - s*position.y, s*position.x + c*position.y) * iDat.x;
        gl_Position = projectionMatrix * mv;
        vUv = uv; vC = iCol;
        vA = iDat.y * smoothstep(iDat.x * 0.3, iDat.x * 1.2, -mv.z);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <logdepthbuf_pars_fragment>
      uniform sampler2D uMap; varying vec2 vUv; varying float vA; varying vec3 vC;
      void main(){
        #include <logdepthbuf_fragment>
        float a = texture2D(uMap, vUv).a * vA;
        if (a < 0.004) discard;
        gl_FragColor = vec4(vC * ${additive ? 'a' : '1.0'}, ${additive ? '1.0' : 'a'});
      }`,
    transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = additive ? 9 : 8;
  scene.add(m);
  return { max, geo, aPos, aDat, aCol, list: [], m };
}
const smokeP = makeParticles(Q.puffs, false);
const fireP = makeParticles(Math.round(Q.puffs / 3), true);
function emit(ps, o) { if (ps.list.length >= ps.max) ps.list.shift(); ps.list.push({ age: 0, rot: Math.random() * 6.28, spin: (Math.random() - 0.5) * 0.6, ...o }); }
function updateParticles(ps, dt, xb) {
  const L = ps.list;
  for (let i = L.length - 1; i >= 0; i--) {
    const p = L[i]; p.age += dt;
    if (p.age > p.life) { L.splice(i, 1); continue; }
    const drag = Math.exp(-dt * (p.drag ?? 1.2));
    p.vx *= drag; p.vy = p.vy * drag + (p.lift ?? 0) * dt; p.vz *= drag;
    p.x += p.vx * dt; p.h += p.vy * dt; p.z += p.vz * dt;
    if (p.floor != null && p.h < p.floor) { p.h = p.floor; p.vy = Math.abs(p.vy) * 0.1; }
    p.rot += p.spin * dt;
  }
  const n = Math.min(L.length, ps.max);
  for (let i = 0; i < n; i++) {
    const p = L[i], k = p.age / p.life;
    ps.aPos.setXYZ(i, p.x - xb, p.h, p.z);
    ps.aDat.setXYZ(i, p.s0 + (p.s1 - p.s0) * Math.sqrt(k), p.a * (1 - k) * Math.min(1, p.age * 6), p.rot);
    ps.aCol.setXYZ(i, p.c[0], p.c[1], p.c[2]);
  }
  ps.geo.instanceCount = n;
  ps.aPos.needsUpdate = ps.aDat.needsUpdate = ps.aCol.needsUpdate = true;
}

/* ================================================================== LINES AND MARKERS */
const TRAIL_MAX = 2000;
const trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL_MAX * 3), 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x7cc8ff, transparent: true, opacity: 0.55, depthWrite: false }));
trail.frustumCulled = false; scene.add(trail);
const predGeo = new THREE.BufferGeometry();
predGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(1200 * 3), 3));
const predLine = new THREE.Line(predGeo, new THREE.LineDashedMaterial({ color: 0xffc24b, dashSize: 60, gapSize: 40, transparent: true, opacity: 0.8, depthWrite: false }));
predLine.frustumCulled = false; scene.add(predLine);
function ring(r0, r1, color, op) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 64).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending }));
  m.renderOrder = 3; m.frustumCulled = false; scene.add(m); return m;
}
const predRing = ring(14, 18, 0xffc24b, 0.7);
const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 1, 16, 1, true).translate(0, 0.5, 0), new THREE.ShaderMaterial({
  uniforms: { uO: { value: 0.3 } },
  vertexShader: `#include <common>
    #include <logdepthbuf_pars_vertex>
    varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `#include <logdepthbuf_pars_fragment>
    uniform float uO; varying float vY; void main(){
    #include <logdepthbuf_fragment>
    gl_FragColor = vec4(vec3(0.3, 0.95, 0.72) * uO * (1.0 - vY) * (1.0 - vY), 1.0); }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
}));
beacon.frustumCulled = false; beacon.renderOrder = 3; scene.add(beacon);

/* ================================================================== STATE */
let sim = null, ap = null, apOn = false, scenKey = 'ship', started = false, paused = STILL, warp = 1;
let flying = false, apWatch = false, outShown = false;
let hudPred = null, hudPredT = -1, tReal = 0, lastEvents = 0;
let retroHold = false, holdOff = 0;
const keys = new Set();
const snd = { on: false, ctx: null };

function scenarioBlurb(k) { return SCENARIOS[k].blurb; }

function load(key, { auto = false } = {}) {
  scenKey = key;
  sim = new BoosterSim(key);
  ap = new Autopilot();
  apOn = auto; apWatch = auto;
  retroHold = key !== 'rtls';
  holdOff = 0;
  warp = 1; setWarpUI();
  outShown = false; $('out').hidden = true;
  hudPred = null; hudPredT = -1; lastEvents = 0; coachSeen.clear();
  smokeP.list.length = 0; fireP.list.length = 0;
  $('caption').innerHTML = '';
  crash.t = -1;
  planetMat.uniforms.uCoast.value = SCENARIOS[key].coastX ?? -1e9;
  W_UNI.uSea.value = sim.sea;
  S2.visible = key !== 'final';
  S2.userData = { x: sim.x, h: sim.h + (VEH.length - sim.yCg) * Math.cos(sim.theta) + 1, vx: sim.vx, vy: sim.vy, th: sim.theta };
  document.querySelectorAll('#scen button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.s === key)));
  document.querySelectorAll('#chips i').forEach(i => {
    i.className = '';
    if (i.dataset.p === 'boostback' && key !== 'rtls') i.classList.add('hide');
    if (key === 'final' && ['flip', 'coast', 'entry', 'boostback'].includes(i.dataset.p)) i.classList.add('hide');
  });
  cam.init = false; cam.shotT = -99;
  syncButtons();
  updateHUD(true);
}
function start(auto) {
  load(scenKey, { auto });
  started = true; flying = true; paused = false;
  document.body.classList.add('bx-flying');
  setPauseUI();
  caption(auto ? 'Autopilot' : 'You have control', auto ? 'Watching the guidance law fly it' : SCENARIOS[scenKey].name,
    auto ? 'Every decision it makes is a formula shown on the HUD. Press P or any flight key to take over.' : scenarioBlurb(scenKey), auto ? 'aurora' : 'ice');
  if (scenKey === 'ship' || scenKey === 'rtls') setTimeout(() => caption('Stage separation', 'The upper stage flies on to orbit', 'The first stage is now a 40 m-tall empty can with a few tonnes of propellant left, falling up to its apogee.', 'ice'), 3500);
}

/* ================================================================== CONTROLS */
function takeOver() {
  if (!apOn) return;
  apOn = false; apWatch = false; syncButtons();
  caption('Manual', 'You have control', 'The autopilot is off. Press P to hand it back at any time.', 'ice');
}
function toggleAP() {
  if (!sim || sim.done) return;
  apOn = !apOn;
  if (apOn) { ap = Autopilot.resume ? Autopilot.resume(sim) : resumeAP(sim); caption('Autopilot', 'Autopilot engaged', 'Guidance picks up from the current state: phase “' + phaseName(ap.phase) + '”.', 'aurora'); }
  else caption('Manual', 'You have control', 'Autopilot off.', 'ice');
  syncButtons();
}
/* hand control back to the autopilot mid-flight: infer the phase from the state */
function resumeAP(s) {
  const a = new Autopilot();
  const S = s.S, V = Math.hypot(s.vx, s.vy);
  const p = predict(s, { entryAlt: S.entryAlt, entryEnd: S.entryEnd, landingTau: AP_TAU, surfaceH: S.target === 'ship' ? 3 : 0 });
  const miss = p.x - s.targetX;
  if (s.engOn && s.h < 15000 && V < 400) a.phase = 'landing';
  else if (S.practice || (s.h < (S.entryAlt ?? 0) - 6000 && s.vy < 0) || s.h < 15000) a.phase = 'aero';
  else if (S.target === 'pad' && Math.abs(miss) > 3000 && (s.h > (S.entryAlt ?? 0) || s.vy > 0)) a.phase = 'flip';
  else a.phase = s.vy > 0 || s.h > (S.entryAlt ?? 0) || V > (S.entryEnd ?? 0) + 30 ? 'coast' : 'aero';
  if (a.phase === 'landing') { s.setEngines(1); }
  return a;
}
function flightKey(fn) { return (...a) => { if (!flying || !sim || sim.done) return; takeOver(); fn(...a); syncButtons(); }; }
const doIgnite = flightKey(() => { if (sim.engOn) sim.cutoff(); else sim.ignite(); });
const doLegs = flightKey(() => sim.deployLegs());
const doEngines = flightKey((n) => sim.setEngines(n));
const doHold = flightKey(() => { retroHold = !retroHold; holdOff = retroHold ? 0 : 0; if (!retroHold) sim.attCmd = sim.theta; });
function setWarp(w) { warp = w; setWarpUI(); }
function setWarpUI() {
  document.querySelectorAll('#warp button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.w === warp)));
  const tb = document.querySelector('#touch [data-k="warp"]'); if (tb) tb.textContent = warp + '×';
}
function setPauseUI() { const b = $('pauseBtn'); b.setAttribute('aria-pressed', String(paused)); b.textContent = paused ? 'Resume' : 'Pause'; }
function syncButtons() {
  $('apBtn').setAttribute('aria-pressed', String(apOn));
  $('apState').classList.toggle('on', apOn);
  const lit = sim && sim.engOn;
  $('ignBtn').textContent = lit ? 'Cut off' : 'Ignite'; $('ignBtn').classList.toggle('lit', !!lit);
  $('legBtn').disabled = !!(sim && sim.legCmd);
  $('holdBtn').setAttribute('aria-pressed', String(retroHold));
  document.querySelectorAll('#engs button').forEach(b => b.setAttribute('aria-pressed', String(sim && +b.dataset.n === sim.nEng)));
  const ti = document.querySelector('#touch .bx-ign'); if (ti) { ti.textContent = lit ? 'CUT OFF' : 'IGNITE'; ti.classList.toggle('lit', !!lit); }
  const ta = document.querySelector('#touch [data-k="ap"]'); if (ta) ta.classList.toggle('on', apOn);
}
$('flyBtn').addEventListener('click', () => start(false));
$('autoBtn').addEventListener('click', () => start(true));
document.querySelectorAll('#scen button').forEach(b => b.addEventListener('click', () => { load(b.dataset.s); if (flying) start(false); }));
$('apBtn').addEventListener('click', () => { if (!flying) start(true); else toggleAP(); });
$('ignBtn').addEventListener('click', () => { if (!flying) start(false); doIgnite(); });
$('legBtn').addEventListener('click', () => doLegs());
$('holdBtn').addEventListener('click', () => doHold());
document.querySelectorAll('#engs button').forEach(b => b.addEventListener('click', () => doEngines(+b.dataset.n)));
document.querySelectorAll('#warp button').forEach(b => b.addEventListener('click', () => setWarp(+b.dataset.w)));
document.querySelectorAll('#cams button').forEach(b => b.addEventListener('click', () => setCam(b.dataset.c)));
$('pauseBtn').addEventListener('click', () => { paused = !paused; setPauseUI(); });
$('restartBtn').addEventListener('click', () => start(apWatch));
$('againBtn').addEventListener('click', () => start(false));
$('watchBtn').addEventListener('click', () => { setCam('auto'); start(true); });
$('closeOut').addEventListener('click', () => { $('out').hidden = true; });
$('showPred').addEventListener('change', (e) => { predLine.visible = e.target.checked; });
let shakeOn = true; $('shake').addEventListener('change', (e) => { shakeOn = e.target.checked; });
document.querySelectorAll('#quality button').forEach(b => {
  b.setAttribute('aria-pressed', String(b.dataset.q === qName));
  b.addEventListener('click', () => { try { localStorage.setItem('cx-booster-q', b.dataset.q); } catch (e) { /* storage unavailable */ } const u = new URL(location.href); u.searchParams.set('q', b.dataset.q); location.href = u.toString(); });
});
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (['w', 's', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) {
    if (!flying) { if (k === 'w' || k === 's') return; }
    e.preventDefault(); keys.add(k); if (flying) takeOver(); return;
  }
  if (e.target.closest && e.target.closest('button') && (k === ' ' || k === 'enter')) return;
  if (k === ' ') { e.preventDefault(); if (!flying) start(false); else doIgnite(); }
  else if (k === 'g') doLegs();
  else if (k === '1' || k === '3' || k === '9') doEngines(+k);
  else if (k === 'h') doHold();
  else if (k === 'p') { if (!flying) start(true); else toggleAP(); }
  else if (k === 'c') cycleCam();
  else if (k === 'r') start(apWatch);
  else if (k === ']' || k === '[') { const W = [1, 3, 10, 30]; const i = W.indexOf(warp); setWarp(W[clamp(i + (k === ']' ? 1 : -1), 0, W.length - 1)]); }
  else if (k === 'escape') { if (!$('out').hidden) $('out').hidden = true; else { paused = !paused; setPauseUI(); } }
});
addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
// touch controls: hold buttons map to keys
document.querySelectorAll('#touch button').forEach(b => {
  const k = b.dataset.k;
  const map = { left: 'a', right: 'd', up: 'w', down: 's' };
  if (map[k]) {
    const on = (e) => { e.preventDefault(); keys.add(map[k]); b.classList.add('held'); takeOver(); };
    const off = () => { keys.delete(map[k]); b.classList.remove('held'); };
    b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
  } else b.addEventListener('click', () => {
    if (k === 'ign') doIgnite(); else if (k === 'legs') doLegs(); else if (k === 'ap') toggleAP(); else if (k === 'cam') cycleCam();
    else if (k === 'warp') { const W = [1, 3, 10, 30]; setWarp(W[(W.indexOf(warp) + 1) % W.length]); }
  });
});
function manualInput(dtReal) {
  if (!flying || !sim || sim.done || apOn) return;
  const up = keys.has('w') || keys.has('arrowup'), dn = keys.has('s') || keys.has('arrowdown');
  const lf = keys.has('a') || keys.has('arrowleft'), rt = keys.has('d') || keys.has('arrowright');
  if (up) sim.throttleCmd = clamp(sim.throttleCmd + 0.6 * dtReal, ENG.minThrottle, 1);
  if (dn) sim.throttleCmd = clamp(sim.throttleCmd - 0.6 * dtReal, ENG.minThrottle, 1);
  const rate = 16 * DEG * dtReal * ((lf ? -1 : 0) + (rt ? 1 : 0));
  // screen direction: +x (down-range) is to the right in the chase and wide views
  const dirSign = camSideSign();
  if (retroHold) holdOff = clamp(holdOff + rate * dirSign, -35 * DEG, 35 * DEG);
  else sim.attCmd = wrapPi(sim.attCmd + rate * dirSign);
}
function applyHold() {
  if (!sim || apOn || sim.done || !retroHold) return;
  // high up: point the engines where the entry burn will need them; lower down: into the
  // airflow; slow or climbing near the ground: stand upright (never flip over)
  const V = Math.hypot(sim.vx, sim.vy);
  let tgt = 0;
  if (sim.h > 30000 && !sim.S.practice && sim.S.entryAlt) tgt = ap.entryAttitude(sim);
  else if (V > 40 && sim.vy < -5) tgt = Math.atan2(-sim.vx, -sim.vy);
  sim.attCmd = wrapPi(tgt + holdOff);
}

/* ================================================================== CAMERAS */
let camMode = params.get('cam') || 'auto';
const cam = { init: false, pos: new THREE.Vector3(), look: new THREE.Vector3(), yaw: 0, pitch: 0.12, dist: 120, fov: 40, shot: 'chase', shotT: -99, drag: null, userYaw: 0, userPitch: 0, userZoom: 1 };
const CAMS = ['auto', 'chase', 'deck', 'wide', 'onboard'];
function setCam(c) {
  camMode = c; cam.init = false;
  document.querySelectorAll('#cams button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === c)));
}
function cycleCam() { setCam(CAMS[(CAMS.indexOf(camMode) + 1) % CAMS.length]); caption('Camera', camLabel(camMode), '', 'ice', 1800); }
function camLabel(c) { return { auto: 'Director', chase: 'Chase', deck: sim && sim.S.target === 'pad' ? 'Pad camera' : 'Deck camera', wide: 'Wide shot', onboard: 'Onboard, looking down' }[c]; }
function camSideSign() { return 1; }
renderer.domElement.addEventListener('pointerdown', (e) => { cam.drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { cam.drag = null; });
addEventListener('pointermove', (e) => {
  if (!cam.drag) return;
  cam.userYaw -= (e.clientX - cam.drag.x) * 0.005; cam.userPitch = clamp(cam.userPitch + (e.clientY - cam.drag.y) * 0.004, -1.2, 1.2);
  cam.drag = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault(); cam.userZoom = clamp(cam.userZoom * Math.exp(e.deltaY * 0.001), 0.3, 6); }, { passive: false });

/* ================================================================== FRAME: placement */
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion();
const bAxis = new THREE.Vector3(), bNorm = new THREE.Vector3(), base = new THREE.Vector3(), com = new THREE.Vector3();
// a point at down-range xs, height hUp, side z → local frame (curved Earth)
function toLocal(xs, hUp, z, out = new THREE.Vector3()) {
  const phi = (xs - sim.x) / RE;
  return out.set(Math.sin(phi) * (RE + hUp), Math.cos(phi) * (RE + hUp) - RE, z);
}
function placeOnEarth(obj, xs, hUp = 0) { toLocal(xs, hUp, 0, obj.position); obj.rotation.set(0, 0, -(xs - sim.x) / RE); }
const crash = { t: -1, tip: 0, dir: 1 };

function updateScene(dtReal, dtSim) {
  const t = sim.t;
  const th = sim.theta;
  bAxis.set(Math.sin(th), Math.cos(th), 0);
  bNorm.set(Math.cos(th), -Math.sin(th), 0);
  com.set(0, sim.h, 0);
  base.copy(com).addScaledVector(bAxis, -sim.yCg);
  // booster pose (tips over after a failed landing)
  B.root.position.copy(base);
  B.root.rotation.set(0, 0, -th);
  if (crash.t >= 0) {
    const k = smooth(0, 3.2, tReal - crash.t);
    const ang = crash.tip * k;
    B.root.rotation.z = -th - crash.dir * ang;
    // pivot about the low foot: approximate by lowering and shifting
    B.root.position.x += crash.dir * Math.sin(ang) * 12;
    B.root.position.y -= (1 - Math.cos(ang)) * 12 + (crash.sink || 0) * k;
  }
  // legs and fins
  const legA = smooth(0, 1, sim.legDep) * 114 * DEG;
  B.legs.forEach((L) => {
    L.pivot.rotation.x = legA;
    // strut from the body anchor (station 11 m) to 60 % along the leg
    const psi = L.psi, rOut = new THREE.Vector3(Math.sin(psi), 0, Math.cos(psi));
    const hingeP = new THREE.Vector3().copy(rOut).multiplyScalar(R0 + 0.22).setY(VEH.legHinge);
    const legDir = new THREE.Vector3().copy(rOut).multiplyScalar(Math.sin(legA)).setY(Math.cos(legA));
    const attach = hingeP.clone().addScaledVector(legDir, L.attach).addScaledVector(rOut, 0.2);
    const anchor = new THREE.Vector3().copy(rOut).multiplyScalar(R0 + 0.12).setY(VEH.legHinge + VEH.legLength + 0.6);
    const d = attach.clone().sub(anchor), len = d.length(); d.normalize();
    tmpQ.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
    L.struts.forEach((s, k) => {
      const segL = len * (k === 0 ? 0.45 : 0.4);
      const off = k === 0 ? segL / 2 : k === 1 ? len * 0.35 + segL / 2 : len - segL / 2;
      s.position.copy(anchor).addScaledVector(d, off); s.quaternion.copy(tmpQ); s.scale.set(1, segL, 1);
    });
  });
  const finA = smooth(0, 1, sim.finDep) * 90 * DEG;
  B.fins.forEach((F) => {
    F.hinge.rotation.x = finA;
    // pitch-plane control: fins on the +x side twist one way, −x the other (X layout)
    F.defl.rotation.y = sim.finDefl * Math.sign(Math.sin(F.psi)) * 0.9;
  });
  // gimbal: tilt the lit engines
  const lit = LIT[sim.nEng] || [0];
  B.nozzles.forEach((n, i) => { n.rotation.z = lit.includes(i) ? -sim.gimbal : 0; });

  // environment objects on the curved Earth
  const S = sim.S;
  const siteX = sim.targetX;
  const siteDist = Math.abs(siteX - sim.x);
  if (S.target === 'ship') {
    ship.visible = siteDist < 250000; lz.visible = false;
    placeOnEarth(ship, siteX, 0);
    const sm = shipMotion(t, sim.sea);
    shipMove.position.y = sm.heave;
    shipMove.rotation.set(sm.roll, 0, sm.pitch);
    ocean.visible = siteDist < 60000 && camH < 60000; placeOnEarth(ocean, siteX, 0);
    oceanMat.uniforms.uShip.value = 1;
  } else {
    ship.visible = false; lz.visible = siteDist < 250000;
    placeOnEarth(lz, siteX, 0);
    ocean.visible = false;
  }
  planetMat.uniforms.uSite.value.set(toLocal(siteX, 0, 0, tmpV).x, 0, 0, S.target === 'ship' ? (ocean.visible ? OCEAN_R * 0.95 : 0) : (lz.visible ? LZ_SIZE * 0.45 : 0));
  // second stage (illustrative): coasts away, lights its engine after 3 s
  if (S2.visible) {
    const u = S2.userData, tt = t;
    const tp = Math.max(0, tt - 3);                       // ≈ 9 m/s² after its engine lights (illustrative)
    const x = u.x + u.vx * tt + 0.5 * Math.sin(u.th) * 9 * tp * tp;
    const h = u.h + u.vy * tt - 4.75 * tt * tt + 0.5 * Math.cos(u.th) * 9 * tp * tp + 1.5 * tt;
    toLocal(x, h, 0, S2.position); S2.rotation.set(0, 0, -u.th);
    S2.plume.visible = tt > 3;
    const pm = S2.plume.material.uniforms; pm.uI.value = smooth(3, 4, tt) * 0.9; pm.uTime.value = tReal;
    if (tt > 120) S2.visible = false;
  }
  // markers
  const tl = toLocal(siteX, S.target === 'ship' ? SHIP.deck + shipMotion(t, sim.sea).heave + 0.3 : 0.2, 0, tmpV);
  beacon.position.copy(tl); beacon.rotation.set(0, 0, -(siteX - sim.x) / RE);
  const bh = clamp(sim.h * 0.6, 200, 20000);
  beacon.scale.set(clamp(sim.h / 400, 1, 20), bh, clamp(sim.h / 400, 1, 20));
  beacon.material.uniforms.uO.value = sim.done ? 0 : 0.35 * smooth(800, 4000, sim.h);
  beacon.visible = !sim.done && siteDist < 400000;
}

/* plumes, glows and particles */
const PE = 70e3; // Pa, Merlin exit pressure — ESTIMATE (not published); sets how fast the plume balloons with altitude
function updateEffects(dtReal, dtSim) {
  const d = sim.d, p = d.atm.p;
  const lvl = sim.level;
  const lit = LIT[sim.nEng] || [0];
  const ratio = PE / Math.max(p, 1);
  const V = d.V;
  // retro-propulsion: engines pointing into the flow with real dynamic pressure
  const retroDot = V > 1 ? -(Math.sin(sim.theta) * sim.vx + Math.cos(sim.theta) * sim.vy) / V : 0;
  const retro = clamp(retroDot, 0, 1);
  const push = smooth(250, 6000, d.q) * smooth(1.1, 2.5, d.M) * retro;   // supersonic oncoming flow squeezes the plume
  const thin = smooth(1.5, 60, ratio);                       // under-expanded in thin air
  B.plumes.forEach((pl, i) => {
    const on = lit.includes(i) && lvl > 0.01;
    pl.visible = on;
    if (!on) return;
    const u = pl.material.uniforms;
    const L0 = lerp(24, 42, thin) * (1 - 0.72 * push);
    u.uLen.value = L0 * (0.55 + 0.45 * lvl) * (0.7 + 0.3 * sim.throttle);
    u.uR0.value = 0.43;
    u.uR1.value = lerp(1.05, 5.5, thin) * (1 + 1.6 * push);
    u.uK.value = lerp(1.2, 4.5, thin);
    u.uNeck.value = (1 - thin) * 0.6;                         // over-expanded at sea level: slight neck
    u.uI.value = lvl * lerp(1.7, 0.6, thin) * (0.7 + 0.3 * sim.throttle);
    u.uDiam.value = (1 - smooth(1.2, 3.5, ratio)) * 0.9;     // shock diamonds only near sea level
    u.uCells.value = 5.5;
    u.uFade.value = lerp(0.35, 0.15, thin);
    u.uTime.value = tReal;
  });
  const anyLit = lvl > 0.01 && sim.prop > 0;
  // a soft halo around the cluster: tight at sea level, a vast faint bloom in near-vacuum
  envPlume.visible = anyLit;
  if (envPlume.visible) {
    const u = envPlume.material.uniforms;
    u.uLen.value = lerp(30, 160, thin) * (1 - 0.8 * push);
    u.uR0.value = sim.nEng > 1 ? 1.6 : 0.9;
    u.uR1.value = lerp(3.2, 55, thin) * (sim.nEng > 1 ? 1.2 : 0.8);
    u.uI.value = lvl * lerp(0.3, 0.22 * thin, thin) * (sim.nEng === 1 ? 0.7 : 1) * (1 - push * 0.85);
    u.uTime.value = tReal;
  }
  cushion.visible = anyLit && push > 0.02;
  if (cushion.visible) {
    const u = cushion.material.uniforms;
    u.uI.value = lvl * push * (sim.nEng > 1 ? 0.62 : 0.3);
    u.uTime.value = tReal;
    const sc = (sim.nEng > 1 ? 1 : 0.65) * (0.8 + 0.4 * thin);
    cushion.scale.set(sc, 0.8 + 0.4 * thin, sc);
  }
  // re-entry heating: bow-shock glow + hot base and fins
  const heat = smooth(4e3, 45e3, d.heat) * (anyLit ? 0.35 : 1);
  shock.visible = heat > 0.01 && retro > 0.5;
  shock.material.uniforms.uI.value = heat * 0.9; shock.material.uniforms.uTime.value = tReal;
  const hot = Math.max(heat, anyLit ? 0.25 * lvl : 0);
  MAT.heat.emissiveIntensity = lerp(MAT.heat.emissiveIntensity, hot * 1.4, 1 - Math.exp(-dtReal * 2));
  MAT.nozzle.emissiveIntensity = lerp(MAT.nozzle.emissiveIntensity, anyLit ? 0.9 * lvl : heat * 0.6, 1 - Math.exp(-dtReal * 1.5));
  MAT.ti.emissiveIntensity = lerp(MAT.ti.emissiveIntensity, heat * 0.5, 1 - Math.exp(-dtReal * 1.5));
  // engine glow sprite + light
  glow.visible = anyLit;
  if (anyLit) {
    glow.position.copy(base).addScaledVector(bAxis, -2.5);
    glow.scale.setScalar((10 + 8 * sim.nEng ** 0.5) * (1 + 1.5 * thin));
    glow.material.opacity = lvl * (0.75 + 0.1 * Math.sin(tReal * 41)) * (1 - 0.4 * thin) * (1 - 0.45 * push);
    glow.material.color.setHex(push > 0.2 ? 0xffa050 : 0xffc080);
  }
  flameLight.position.copy(base).addScaledVector(bAxis, -6);
  flameLight.intensity = anyLit ? lvl * (sim.nEng ** 0.6) * 2.6e3 * (1 - 0.7 * thin) : 0;
  // particles (sim coordinates)
  if (dtSim > 0 && !paused) {
    const nx = Math.sin(sim.theta), ny = Math.cos(sim.theta);
    const bx = sim.x + (0 - sim.yCg) * nx, bh = sim.h + (0 - sim.yCg) * ny;
    const surf = sim.surface(sim.x, sim.t);
    const hAG = bh - surf.h;
    // exhaust smoke in the lower atmosphere (kerosene leaves a brownish trail)
    if (anyLit && sim.h < 30000) {
      const n = Math.min(6, Math.ceil(dtSim * 40));
      for (let k = 0; k < n; k++) {
        const dist = 6 + Math.random() * 18;
        emit(smokeP, { x: bx - nx * dist + (Math.random() - 0.5) * 3, h: bh - ny * dist, z: (Math.random() - 0.5) * 3,
          vx: sim.vx * 0.2 - nx * 30, vy: sim.vy * 0.2 - ny * 30, vz: (Math.random() - 0.5) * 6, life: 5 + Math.random() * 5,
          s0: 4, s1: 26 + Math.random() * 20, a: 0.28 * smooth(30000, 5000, sim.h), c: [0.42, 0.38, 0.34], drag: 0.8, lift: 1.5, floor: surf.h + 1 });
      }
    }
    // plume hitting the deck or pad: a ring of steam and exhaust racing outward
    if (anyLit && hAG < 60) {
      const k = 1 - hAG / 60;
      const n = Math.ceil(10 * k * Math.min(1, dtSim * 60));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = 25 + Math.random() * 35;
        emit(smokeP, { x: bx + Math.cos(a) * 3, h: surf.h + 1.5, z: Math.sin(a) * 3, vx: Math.cos(a) * sp, vy: 2 + Math.random() * 4, vz: Math.sin(a) * sp,
          life: 2.5 + Math.random() * 2.5, s0: 5, s1: 22 + Math.random() * 18, a: 0.5 * k, c: S_COL, drag: 0.9, lift: 2, floor: surf.h + 0.5 });
        if (Math.random() < 0.35) emit(fireP, { x: bx + Math.cos(a) * 2, h: surf.h + 1, z: Math.sin(a) * 2, vx: Math.cos(a) * sp * 0.7, vy: 1, vz: Math.sin(a) * sp * 0.7,
          life: 0.35 + Math.random() * 0.3, s0: 4, s1: 12, a: 0.55 * k, c: [1, 0.55, 0.2], drag: 2, floor: surf.h + 0.5 });
      }
    }
    // cold-gas thruster puffs (reaction control) — white jets at the top
    if (Math.abs(sim.rcs) > 1000 && Math.random() < 0.6) {
      const s = Math.sign(sim.rcs);             // + torque → push the top toward +x → jet fires toward −x
      const tx = sim.x + (VEH.length - 1.2 - sim.yCg) * nx, th2 = sim.h + (VEH.length - 1.2 - sim.yCg) * ny;
      const jx = -s * Math.cos(sim.theta), jy = s * Math.sin(sim.theta);
      emit(smokeP, { x: tx + jx * 2.2, h: th2 + jy * 2.2, z: 0, vx: sim.vx + jx * 40, vy: sim.vy + jy * 40, vz: 0, life: 0.7, s0: 1, s1: 7, a: 0.5, c: [0.95, 0.97, 1], drag: 0.2 });
    }
  }
  updateParticles(smokeP, paused ? 0 : dtSim, sim.x);
  updateParticles(fireP, paused ? 0 : dtSim, sim.x);
}
const S_COL = [0.78, 0.77, 0.75];

/* ================================================================== CAMERA */
let camH = 0;
function computeCamera(dtReal) {
  const S = sim.S;
  let mode = camMode;
  const hAG = sim.clearance();
  if (mode === 'auto') {
    // Director: pick a shot for the phase; hold each shot at least 5 s
    const ph = apOn ? ap.phase : guessPhase();
    let want = 'chase';
    if (sim.done) want = tReal - (crash.t >= 0 ? crash.t : doneAt) < 7 ? 'deck' : 'orbit';
    else if (ph === 'landing') want = hAG < 380 ? 'deck' : 'chase';
    else if (ph === 'aero' && sim.h < 7000 && !S.practice) want = 'wide';
    else if (ph === 'aero' && sim.h < 14000) want = 'chase';
    else if (ph === 'entry') want = 'chaseLow';
    if (!flying) want = 'orbit';
    if (want !== cam.shot && (tReal - cam.shotT > 5 || sim.done || want === 'deck' || !flying)) { cam.shot = want; cam.shotT = tReal; cam.init = false; }
    mode = cam.shot;
  }
  const target = tmpV2.copy(com).addScaledVector(bAxis, 5);
  let pos = new THREE.Vector3(), look = new THREE.Vector3().copy(target), fov = 40, up = new THREE.Vector3(0, 1, 0);
  const side = sim.vx >= 0 ? -1 : 1;              // camera trails the motion
  if (mode === 'chase' || mode === 'chaseLow' || mode === 'orbit') {
    // chase: trailing, above, the sea as the backdrop; chaseLow (entry burn): from the
    // side at the booster's level so the exhaust cushion and the horizon show; orbit: after landing
    const baseYaw = mode === 'orbit' ? (flying ? 0.9 : -0.35) + tReal * (Codex.reducedMotion ? 0 : 0.05) : mode === 'chaseLow' ? side * 1.2 : side * 0.62;
    const yaw = baseYaw + cam.userYaw;
    const upright = smooth(0.9, 0.3, Math.abs(wrapPi(sim.theta)));   // falling engines-first, nearly vertical
    const nearG = mode === 'chase' ? smooth(220, 25, hAG) : 0;           // last 200 m: rise to show the deck
    const pitch = clamp((mode === 'chaseLow' ? 0.1 : mode === 'orbit' ? 0.2 : lerp(0.34, 0.1, upright) + 0.22 * nearG) + cam.userPitch, -1.2, 1.35);
    const portrait = innerWidth < innerHeight ? (flying ? 1.3 : 1.6) : 1;
    const dist = (mode === 'orbit' ? 125 : mode === 'chaseLow' ? 150 : lerp(118, 132, upright)) * cam.userZoom * portrait;
    pos.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist).add(target);
    const floor = (S.target === 'ship' ? 8 : 3);
    if (pos.y < floor) pos.y = floor;
    if (mode === 'chase') look.y -= lerp(14, -3, upright) + 16 * nearG;   // frame the stage a little high, the sea below
    if (mode === 'orbit') look.copy(com).setY(com.y - 4 + (!flying && portrait > 1 ? 34 : 0));   // phones: keep the stage below the title card
    fov = mode === 'chaseLow' ? 44 : 40;
  } else if (mode === 'deck') {
    // on the ship's deck corner (or on a tripod 250 m from the pad), looking up
    if (S.target === 'ship') {
      const sm = shipMotion(sim.t, sim.sea);
      const loc = new THREE.Vector3(-SHIP.length / 2 + 9, SHIP.deck + 2.2 + sm.heave, SHIP.width / 2 - 5);
      loc.applyEuler(new THREE.Euler(sm.roll, 0, sm.pitch));
      loc.y += sm.heave * 0; pos.copy(ship.position).add(loc);
      up.set(Math.sin(-sm.pitch) * 0.5, 1, Math.sin(sm.roll) * 0.5).normalize();
    } else {
      toLocal(sim.targetX - 240, 2.5, 60, pos);
    }
    const dist = pos.distanceTo(target);
    // look up at the stage, but keep a sliver of the deck or pad in the frame near the end
    const siteP = S.target === 'ship' ? ship.position.clone().setY(ship.position.y + SHIP.deck) : toLocal(sim.targetX, 0, 0);
    const a = target.clone().sub(pos).normalize(), b = siteP.sub(pos).normalize();
    const ang = Math.acos(clamp(a.dot(b), -1, 1)) / DEG;
    const fStage = 2 * Math.atan(54 / Math.max(dist, 1)) / DEG;
    if (ang * 1.25 + fStage * 0.5 < 70 && hAG < 160) { look.copy(pos).addScaledVector(a.clone().multiplyScalar(0.75).add(b.multiplyScalar(0.25)).normalize(), 50); fov = clamp(Math.max(fStage, ang * 1.2 + fStage * 0.4), 0.6, 70); }
    else { look.copy(target).lerp(com, 0.3); fov = clamp(fStage, 0.6, 66); }
  } else if (mode === 'wide') {
    // long lens from a support boat 2 km off the landing site: tracks the stage, and
    // widens to bring the site into the frame for the last few hundred metres
    toLocal(sim.targetX - side * 600, 12, 1900, pos);
    const siteP = toLocal(sim.targetX, 8, 0);
    const dT = pos.distanceTo(target);
    const fovTrack = clamp(2 * Math.atan(26 / dT) / DEG / 0.32, 1.2, 60);
    const a = target.clone().sub(pos).normalize(), b = siteP.clone().sub(pos).normalize();
    const ang = Math.acos(clamp(a.dot(b), -1, 1)) / DEG;
    const both = ang * 1.3 + 2 * Math.atan(24 / dT) / DEG;
    if (both < 26) { look.copy(pos).addScaledVector(a.add(b).normalize(), 100); fov = Math.max(fovTrack, both); }
    else { look.copy(target); fov = fovTrack; }
  } else if (mode === 'onboard') {
    // bolted to the interstage, 1 m off the skin, looking down along the body at the legs and engines
    const out = new THREE.Vector3(0, 0, 1);
    pos.copy(base).addScaledVector(bAxis, BODY1 + 1.2).addScaledVector(out, R0 + 1.0);
    look.copy(base).addScaledVector(bAxis, -14).addScaledVector(out, R0 + 2.2);
    up.copy(out);
    fov = 70;
  }
  // smooth in the booster's frame (offsets from its centre of mass), because the
  // booster itself moves at up to 2 km/s
  pos.sub(com); look.sub(com);
  if (!cam.init || mode === 'onboard') {
    cam.pos.copy(pos); cam.look.copy(look); cam.fov = fov; cam.init = true;
  } else if (mode === 'deck' || mode === 'wide') {
    cam.pos.copy(pos);
    cam.look.lerp(look, 1 - Math.exp(-dtReal * 6)); cam.fov = lerp(cam.fov, fov, 1 - Math.exp(-dtReal * 5));
  } else {
    const k = 1 - Math.exp(-dtReal * 3);
    cam.pos.lerp(pos, k); cam.look.lerp(look, 1 - Math.exp(-dtReal * 8)); cam.fov = lerp(cam.fov, fov, k);
  }
  pos.copy(cam.pos).add(com); look.copy(cam.look).add(com);
  camera.position.copy(pos);
  camera.up.copy(up);
  camera.lookAt(look);
  camera.fov = cam.fov; camera.updateProjectionMatrix();
  // shake with engine thrust (not in the onboard view: that camera is bolted on)
  const lvl = sim.level * (sim.prop > 0 ? 1 : 0);
  if (shakeOn && !Codex.reducedMotion && lvl > 0.05 && !paused) {
    const dist = camera.position.distanceTo(base);
    const a = lvl * Math.sqrt(sim.nEng) * (mode === 'onboard' ? 0.06 : 0.35 / (1 + dist / 150)) * (cam.fov < 10 ? cam.fov / 10 : 1);
    camera.position.x += (Math.sin(tReal * 31.1) + Math.sin(tReal * 47.7) * 0.5) * a;
    camera.position.y += (Math.sin(tReal * 27.3 + 1) + Math.sin(tReal * 39.1) * 0.5) * a;
    camera.rotateZ(Math.sin(tReal * 17.3) * a * 0.002);
  }
  camera.updateMatrixWorld();
}
let doneAt = 0;
function guessPhase() {
  if (sim.done) return 'done';
  const V = Math.hypot(sim.vx, sim.vy);
  if (sim.engOn && sim.nEng === 1 && sim.h < 15000) return 'landing';
  if (sim.engOn && sim.vy < 0 && sim.h < 80000 && V > 700) return 'entry';
  if (sim.engOn && sim.S.target === 'pad' && sim.h > 50000) return 'boostback';
  if (sim.S.practice || (sim.h < 45000 && sim.vy < 0)) return 'aero';
  if (sim.t < 25) return 'flip';
  return 'coast';
}
function phaseName(p) {
  return { flip: 'Flip', boostback: 'Boostback burn', coast: 'Coast to entry', entry: 'Entry burn', aero: 'Aerodynamic descent · grid fins', landing: 'Landing burn · hoverslam', done: 'Touchdown' }[p] || p;
}

/* atmosphere uniforms + exposure for the camera altitude */
function updateAtmosphere() {
  const c = [camera.position.x, camera.position.y + RE, camera.position.z];
  const r = Math.hypot(c[0], c[1], c[2]);
  const h = r - RE; camH = h;
  const u = planetMat.uniforms;
  u.uUp.value.set(c[0] / r, c[1] / r, c[2] / r);
  u.uH.value = h;
  u.uCam.value.copy(camera.position);
  u.uTime.value = sim.t;
  u.uXb.value = sim.x;
  u.uInvProj.value.copy(camera.projectionMatrixInverse);
  u.uCamWorld.value.copy(camera.matrixWorld);
  u.uLogFC.value = 2.0 / (Math.log(camera.far + 1.0) / Math.LN2);
  u.uPix.value = (camera.fov * DEG) / (innerHeight * renderer.getPixelRatio());
  camera.getWorldDirection(u.uCamFwd.value);
  const thin = Math.exp(-Math.max(h, 0) / 8000);
  hemi.intensity = 0.12 + 0.42 * thin;
  scene.environmentIntensity = 0.2 + 0.45 * thin;
  // ocean
  oceanMat.uniforms.uTime.value = sim.t;
  oceanMat.uniforms.uCamL.value.copy(camera.position);
  // shadows: only near the landing site, following the booster
  // the shadow camera follows the stage; it only matters near the landing site
  sunLight.castShadow = Q.shadow > 0;
  sunLight.target.position.copy(com).setY(Math.max(0, com.y - 20));
  sunLight.position.copy(sunLight.target.position).addScaledVector(SUN, 300);
  renderer.toneMappingExposure = lerp(1.12, 1.15, smooth(15000, 80000, h));
}

/* manual flights: one short hint per stage of the flight */
const coachSeen = new Set();
function coach() {
  if (!flying || apOn || !sim || sim.done) return;
  const S = sim.S, V = Math.hypot(sim.vx, sim.vy), hAG = sim.clearance();
  const say = (id, title, text) => { if (coachSeen.has(id)) return; coachSeen.add(id); caption('Your move', title, text, 'sol', 9000); };
  if (S.target === 'pad' && sim.t > 6 && sim.t < 60 && !sim.flags.bbend && sim.vx > 300)
    say('bb', 'Boost back', 'Hold A to turn the nose back toward the launch site (lying almost flat), press 3, then Space. Cut off with Space when “Predicted touchdown” reads close to zero.');
  if (S.target === 'pad' && !retroHold && sim.vx < -150 && !sim.engOn && sim.t > 20)
    say('hold', 'Retrograde hold', 'Press H: the flight computer keeps the engines pointed along the direction of travel, ready for the entry burn.');
  if (S.target === 'ship' && sim.t > 8 && sim.t < 30) say('flip', 'Retrograde hold is on', 'The cold-gas thrusters are turning the engines toward the direction of travel for you. Press ] to speed up time while you coast.');
  if (!S.practice && sim.vy < 0 && sim.h < S.entryAlt + 6000 && sim.h > 30000 && V > S.entryEnd + 100 && !sim.engOn)
    say('entry', 'Entry burn', `Press 3, then Space. Cut off (Space) near ${fmt(S.entryEnd, 0)} m/s: the heating and the load in the thick air drop sharply.`);
  if (!S.practice && sim.h < 30000 && sim.h > 8000 && sim.vy < 0 && !sim.engOn)
    say('fins', 'Steer with the grid fins', 'A and D tilt the stage. With the engine off, tilt the TOP AWAY from the target to glide toward it. Watch “Predicted touchdown”.');
  if (sim.h < 6000 && sim.vy < -30 && !sim.engOn && hAG > 800)
    say('lb', 'Get ready for the hoverslam', 'Press 1 for a single engine. Light it (Space) when your altitude meets the amber “burn” line on the tape.');
  if (sim.engOn && hAG < 900 && !sim.legCmd) say('legs', 'Legs!', 'Press G now: they need about three seconds to lock.');
}

/* ================================================================== SIM STEP */
function stepSim(dtReal) {
  if (!flying || paused || !sim) return 0;
  // time warp is limited while it matters
  let w = warp;
  const hAG = sim.h;
  if (!sim.done && (sim.engOn || hAG < 6000)) w = Math.min(w, hAG < 6000 ? 1 : 3);
  if (w !== warp && warp > 1 && hAG < 6000 && !sim.done) { setWarp(1); caption('Time warp', 'Back to real time', 'Below 6 km everything happens fast.', 'sol', 2500); }
  const target = sim.t + dtReal * w;
  let n = 0;
  const t0 = sim.t;
  while (sim.t < target - 1e-9 && n < 4000) {
    if (apOn) ap.update(sim); else applyHold();
    sim.step(DT); n++;
    if (sim.done) break;
  }
  return sim.t - t0;
}

/* ================================================================== HUD */
const logEl = $('caption');
function caption(tag, title, text, cls = '', ms = 6500) {
  const el = document.createElement('div');
  el.className = 'bx-cap ' + cls;
  el.innerHTML = `<div class="t">${tag}</div><h3>${title}</h3>${text ? `<p>${text}</p>` : ''}`;
  logEl.innerHTML = ''; logEl.appendChild(el);
  clearTimeout(caption._t);
  caption._t = setTimeout(() => { if (el.parentNode) el.remove(); }, ms);
}
const EVENT_TEXT = {
  flipdone: ['Flip complete', 'Cold-gas thrusters at the top have turned the stage around: the engines now face the direction of travel.', 'ice'],
  boostback: ['Boostback burn', 'Three engines fire against the down-range velocity to send the stage back toward the coast.', ''],
  bbend: ['Boostback complete', 'The predicted impact point is now the landing zone. The stage coasts up to about 150 km and falls back.', 'ice'],
  entry: ['Entry burn', 'Three engines slow the stage before the thick air, cutting the heating and the aerodynamic load. The exhaust wraps back around the vehicle.', ''],
  entryend: ['Entry burn complete', 'Now it glides: the grid fins steer, the body acts as a wing.', 'ice'],
  landing: ['Landing burn', 'One engine, the hoverslam. It cannot hover: it must reach zero speed exactly at the deck.', ''],
  legs: ['Legs deploying', 'Helium pistons swing four legs down in about three seconds.', 'sol'],
  fins: ['Grid fins out', 'They do nothing up here in near-vacuum, but they will be ready when the air thickens.', 'ice'],
  flameout: ['Flame-out', 'The tanks are empty.', 'sol']
};
function pushEvents() {
  for (let i = lastEvents; i < sim.events.length; i++) {
    const e = sim.events[i];
    const tx = EVENT_TEXT[e.id];
    if (tx && e.id !== 'touch') caption('T+' + mmss(e.t), tx[0], tx[1], tx[2]);
    if (e.id === 'touch') { doneAt = tReal; onTouchdown(); }
  }
  lastEvents = sim.events.length;
}
function mmss(t) { const s = Math.max(0, Math.floor(t)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
function setV(id, v, unit) { const el = $(id); el.innerHTML = v + (unit ? `<small>${unit}</small>` : ''); }

function updateHUD(force) {
  if (!sim) return;
  const d = sim.d;
  const hAG = Math.max(0, sim.clearance());
  // HUD predictor (a few times per second of real time)
  if (force || tReal - hudPredT > 0.25) {
    hudPredT = tReal;
    const S = sim.S;
    const phase = apOn ? ap.phase : guessPhase();
    hudPred = sim.done ? null : predict(sim, {
      path: true,
      entryAlt: ['flip', 'boostback', 'coast'].includes(phase) ? S.entryAlt : null, entryEnd: S.entryEnd,
      landingTau: AP_TAU, surfaceH: S.target === 'ship' ? SHIP.deck : 0
    });
  }
  setV('rAlt', hAG < 10000 ? fmt(hAG, 0) : fmt(hAG / 1000, 1), hAG < 10000 ? 'm' : 'km');
  setV('rVy', fmt(sim.vy, Math.abs(sim.vy) < 10 ? 1 : 0), 'm/s');
  setV('rVx', fmt(sim.vx, Math.abs(sim.vx) < 10 ? 1 : 0), 'm/s');
  $('rAtt').textContent = `${fmt(sim.theta / DEG, 0)}° · ${fmt(d.aoa / DEG, 0)}°`;
  setV('rThr', fmt(sim.throttle * 100, 0), '%');
  $('rEng').innerHTML = sim.level > 0.01 ? `${sim.nEng}<small>lit</small>` : `0<small>of ${sim.nEng} armed</small>`;
  setV('rProp', fmt(sim.prop, 0), `kg · ${fmt(sim.prop / sim.S.prop * 100, 0)} % of load`);
  $('propBar').style.width = clamp(sim.prop / sim.S.prop * 100, 0, 100) + '%';
  $('rTW').innerHTML = `${fmt(d.tw, 2)}<small>min ${fmt(d.twMin, 2)}</small>`;
  setV('rQ', (d.q / 1000).toFixed(d.q < 10000 ? 2 : 1), 'kPa');
  $('rMach').textContent = d.M.toFixed(2);
  setV('rHeat', (d.heat / 1000).toFixed(1), 'kW/m²');
  const tti = hudPred ? hudPred.t : NaN;
  $('rTti').textContent = sim.done ? '—' : isFinite(tti) ? (tti > 90 ? mmss(tti) : fmt(tti, 1) + ' s') : '—';
  const bh = burnHeight(sim, sim.throttleCmd, sim.nEng);
  $('rBurn').textContent = sim.vy < -1 && isFinite(bh.h) ? (bh.h < 10000 ? fmt(bh.h, 0) + ' m' : fmt(bh.h / 1000, 1) + ' km') : '—';
  if (hudPred && !sim.done) {
    const miss = hudPred.x - sim.targetX;
    const dirWord = (miss > 0) === (sim.vx >= 0 || sim.S.target !== 'pad') ? 'long' : 'short';
    $('rPred').innerHTML = Math.abs(miss) < 5000 ? `${fmt(Math.abs(miss), 0)}<small>m ${dirWord}</small>` : `${fmt(Math.abs(miss) / 1000, 1)}<small>km ${dirWord}</small>`;
  } else $('rPred').textContent = '—';
  // clock + phase chips
  $('tVal').textContent = mmss(sim.t);
  const ph = sim.done ? 'done' : apOn ? ap.phase : guessPhase();
  $('phase').textContent = (apOn ? 'Autopilot · ' : flying ? 'Manual · ' : '') + phaseName(ph);
  $('clock').classList.toggle('hot', sim.level > 0.05);
  const order = ['flip', 'boostback', 'coast', 'entry', 'aero', 'landing', 'done'];
  const pi = order.indexOf(ph);
  document.querySelectorAll('#chips i').forEach(i => { const k = order.indexOf(i.dataset.p); i.classList.toggle('on', k === pi); i.classList.toggle('done', k < pi); });
  $('mAlt').textContent = hAG < 10000 ? fmt(hAG, 0) : fmt(hAG / 1000, 1) + 'k';
  $('mVy').textContent = fmt(-sim.vy, 0); $('mVx').textContent = fmt(Math.abs(sim.vx), 0);
  $('mProp').textContent = fmt(sim.prop / sim.S.prop * 100, 0);
  // live hoverslam equation
  if (sim.vy < -1) {
    $('eqLive').textContent = `v = ${fmt(-sim.vy, 0)} m/s, ${sim.nEng} × F(${fmt(sim.throttleCmd * 100, 0)} %) / ${fmt(sim.m / 1000, 1)} t − g + D/2m = ${fmt(bh.aNet, 1)} m/s²  →  h = ${isFinite(bh.h) ? fmt(bh.h, 0) + ' m' : '∞'}, burn ≈ ${isFinite(bh.t) ? fmt(bh.t, 1) + ' s' : '—'}`;
  } else $('eqLive').textContent = 'Climbing — the formula applies once the stage falls.';
  $('twMinTxt').textContent = '≈ ' + fmt(thrustPerEngine(ENG.minThrottle, 101325) / ((VEH.dryMass + 1500) * G0), 1);
  const P = ap.profile(sim);
  $('apPlan').textContent = `a₂ = ${fmt(P.a2, 1)} m/s², a₁ = ${fmt(P.a1, 1)} m/s², touchdown ${P.vtd} m/s`;
  drawProfile();
  syncButtons();
}

/* flight display: altitude tape with the burn marker, attitude ball, throttle */
const fdc = $('fdc'), fdg = fdc.getContext('2d');
const MONO = '"JetBrains Mono", ui-monospace, monospace';
function drawFD() {
  const g = fdg, W = fdc.width, H = fdc.height;
  g.clearRect(0, 0, W, H);
  const hAG = Math.max(0, sim.clearance());
  // --- altitude tape (square-root scale) ---
  const top = hAG > 8000 ? Math.max(20000, Math.ceil(hAG / 20000) * 20000) : hAG > 2500 ? 8000 : 3000;
  const x0 = 62, y0 = 40, y1 = H - 40, tw = 26;
  const Y = (h) => y1 - Math.sqrt(clamp(h / top, 0, 1)) * (y1 - y0);
  g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x0, y0, tw, y1 - y0);
  g.strokeStyle = 'rgba(150,170,255,.3)'; g.lineWidth = 1.5;
  g.fillStyle = '#8f98bd'; g.font = `500 16px ${MONO}`; g.textAlign = 'right';
  for (const f of [0, 0.05, 0.2, 0.5, 1]) {
    const h = f * top, y = Y(h);
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 7, y); g.stroke();
    g.fillText(h >= 1000 ? (h / 1000).toFixed(h % 1000 ? 1 : 0) + 'k' : h.toFixed(0), x0 - 6, y + 5);
  }
  // ideal burn start at the current throttle (amber) and the last chance at 100 % (red zone below)
  const bh = burnHeight(sim, sim.throttleCmd, sim.nEng), bhMax = burnHeight(sim, 1, sim.nEng);
  const falling = sim.vy < -5 && !sim.done && !(sim.level > 0.5);
  if (falling && isFinite(bh.h)) {
    const yb = Y(bh.h), yl = Y(bhMax.h);
    g.fillStyle = 'rgba(255,79,154,.35)'; g.fillRect(x0, yl, tw, y1 - yl);
    g.fillStyle = 'rgba(255,194,75,.3)'; g.fillRect(x0, yb, tw, Math.max(0, yl - yb));
    g.strokeStyle = '#ffc24b'; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 - 5, yb); g.lineTo(x0 + tw + 5, yb); g.stroke();
    const now = hAG <= bh.h * 1.02;
    g.textAlign = 'left'; g.fillStyle = '#ffc24b'; g.font = `700 17px ${MONO}`;
    if (!now || Math.floor(tReal * 4) % 2 === 0) g.fillText(now ? 'BURN NOW' : 'burn', x0 + tw + 20, clamp(yb + 6, y0 + 10, y1));
  }
  const ya = Y(hAG);
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x0 + tw + 2, ya); g.lineTo(x0 + tw + 15, ya - 8); g.lineTo(x0 + tw + 15, ya + 8); g.fill();
  g.fillStyle = '#e9edff'; g.textAlign = 'left'; g.font = `700 24px ${MONO}`;
  g.fillText(hAG < 10000 ? hAG.toFixed(0) + ' m' : (hAG / 1000).toFixed(1) + ' km', 10, H - 10);
  g.fillStyle = '#5d6589'; g.font = `600 13px ${MONO}`; g.fillText('ALTITUDE', 10, 26);
  // --- attitude ball ---
  const cx = 250, cy = 128, R = 84;
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.clip();
  const gs = g.createLinearGradient(0, cy - R, 0, cy + R);
  gs.addColorStop(0, '#0b1a38'); gs.addColorStop(0.5, '#1d3560'); gs.addColorStop(0.5, '#2a2118'); gs.addColorStop(1, '#130f0b');
  g.fillStyle = gs; g.fillRect(cx - R, cy - R, 2 * R, 2 * R);
  g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1;
  for (const a of [-60, -30, 30, 60]) { g.save(); g.translate(cx, cy); g.rotate(a * DEG); g.beginPath(); g.moveTo(0, -R); g.lineTo(0, -R + 10); g.stroke(); g.restore(); }
  const drawStage = (th, body, alpha, ghost) => {
    g.save(); g.translate(cx, cy); g.rotate(th); g.globalAlpha = alpha;
    const w = 13, h0 = -58, h1 = 50;
    if (!ghost && sim.level > 0.05) {
      const fl = 18 + 30 * sim.level * sim.throttle;
      const gr = g.createLinearGradient(0, h1, 0, h1 + fl); gr.addColorStop(0, 'rgba(255,230,170,.95)'); gr.addColorStop(1, 'rgba(255,110,40,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(-5, h1); g.lineTo(5, h1); g.lineTo(0, h1 + fl); g.fill();
    }
    g.fillStyle = body; g.fillRect(-w / 2, h0, w, h1 - h0);
    if (!ghost) { g.fillStyle = '#16171a'; g.fillRect(-w / 2, h0, w, 11); g.fillStyle = '#3a342e'; g.fillRect(-w / 2, h1 - 12, w, 12); }
    const la = smooth(0, 1, sim.legDep) * 114 * DEG;
    g.strokeStyle = ghost ? body : '#1b1b1e'; g.lineWidth = 3.5;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * w / 2, h1 - 2); g.lineTo(s * (w / 2 + Math.sin(la) * 26), h1 - 2 - Math.cos(la) * 26 * -1 * -1 * (1) + (1 - Math.cos(la)) * 0); g.stroke(); }
    const fa = smooth(0, 1, sim.finDep);
    g.lineWidth = 3; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * w / 2, h0 + 6); g.lineTo(s * (w / 2 + 9 * fa), h0 + 6); g.stroke(); }
    g.restore();
  };
  drawStage(sim.attCmd, '#7cc8ff', 0.4, true);
  drawStage(sim.theta, '#ebe8e2', 1, false);
  const V = Math.hypot(sim.vx, sim.vy);
  if (V > 2) {   // direction of travel (engines should point here when braking)
    const ang = Math.atan2(sim.vx, sim.vy);
    const px = cx + Math.sin(ang) * R * 0.8, py = cy - Math.cos(ang) * R * 0.8;
    g.strokeStyle = '#4ef0b8'; g.lineWidth = 2.5; g.beginPath(); g.arc(px, py, 8, 0, 6.28); g.stroke();
    g.beginPath(); g.moveTo(px - 14, py); g.lineTo(px - 8, py); g.moveTo(px + 8, py); g.lineTo(px + 14, py); g.moveTo(px, py - 14); g.lineTo(px, py - 8); g.stroke();
  }
  g.restore();
  g.strokeStyle = 'rgba(150,190,255,.4)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R, 0, 6.28); g.stroke();
  g.textAlign = 'center'; g.font = `600 16px ${MONO}`; g.fillStyle = '#c3cae6';
  g.fillText(`tilt ${(sim.theta / DEG).toFixed(sim.done || Math.abs(sim.theta) < 0.2 ? 1 : 0)}°`, cx, H - 12);
  g.font = `700 13px ${MONO}`;
  if (apOn) { g.fillStyle = '#4ef0b8'; g.fillText('AUTOPILOT', cx, 26); }
  else if (retroHold && flying) { g.fillStyle = '#7cc8ff'; g.fillText('RETRO HOLD', cx, 26); }
  else if (flying) { g.fillStyle = '#8f98bd'; g.fillText('MANUAL', cx, 26); }
  // --- throttle + propellant ---
  const bx = 358, by = 40, bw = 22, bH = H - 82;
  const bar = (x, frac, col, label, mark, cmd) => {
    g.fillStyle = 'rgba(255,255,255,.07)'; g.fillRect(x, by, bw, bH);
    g.fillStyle = col; g.fillRect(x, by + bH * (1 - frac), bw, bH * frac);
    if (mark != null) { g.fillStyle = '#ff4f9a'; g.fillRect(x - 3, by + bH * (1 - mark) - 1, bw + 6, 3); }
    if (cmd != null) { g.fillStyle = '#fff'; g.beginPath(); const yy = by + bH * (1 - cmd); g.moveTo(x - 2, yy); g.lineTo(x - 10, yy - 6); g.lineTo(x - 10, yy + 6); g.fill(); }
    g.fillStyle = '#8f98bd'; g.textAlign = 'center'; g.font = `600 13px ${MONO}`; g.fillText(label, x + bw / 2, by + bH + 18);
  };
  bar(bx, sim.level > 0.01 ? sim.throttle * sim.level : 0, '#ff7a3d', 'THR', ENG.minThrottle, sim.throttleCmd);
  bar(bx + 36, clamp(sim.prop / sim.S.prop, 0, 1), '#ffc24b', 'PROP');
  g.textAlign = 'right'; g.fillStyle = '#e9edff'; g.font = `700 20px ${MONO}`;
  g.fillText(`${Math.max(0, -sim.vy).toFixed(Math.abs(sim.vy) < 20 ? 1 : 0)}↓`, W - 6, 60);
  g.fillText(`${Math.abs(sim.vx).toFixed(Math.abs(sim.vx) < 20 ? 1 : 0)}→`, W - 6, 88);
  g.font = `500 13px ${MONO}`; g.fillStyle = '#8f98bd'; g.fillText('m/s', W - 6, 106);
  g.font = `700 16px ${MONO}`;
  g.fillStyle = sim.level > 0.05 ? '#ff7a3d' : '#8f98bd'; g.fillText(`${sim.nEng} ENG`, W - 6, 150);
  g.fillStyle = sim.legDep > 0.97 ? '#4ef0b8' : sim.legCmd ? '#ffc24b' : '#5d6589'; g.fillText(sim.legDep > 0.97 ? 'LEGS' : sim.legCmd ? 'LEGS…' : 'LEGS', W - 6, 176);
  g.fillStyle = sim.finDep > 0.97 ? '#4ef0b8' : '#5d6589'; g.fillText('FINS', W - 6, 202);
}

/* altitude vs distance-to-target profile */
const prof = $('profile'), pg = prof.getContext('2d');
function drawProfile() {
  const g = pg, W = prof.width, H = prof.height;
  g.clearRect(0, 0, W, H);
  const S = sim.S;
  const sgn = S.target === 'pad' ? -1 : 1;
  const hist = sim.hist;
  let xMin = 0, xMax = 1, hMax = 1;
  const pts = hist.concat([[sim.x, sim.h]]);
  const all = pts.concat(hudPred && hudPred.path ? hudPred.path : []);
  for (const [x, h] of all) { const dx = (sim.targetX - x) * sgn; xMin = Math.min(xMin, -dx); xMax = Math.max(xMax, -dx); hMax = Math.max(hMax, h); }
  xMin = Math.min(xMin, -1); xMax = Math.max(xMax, 1);
  const pad = 34;
  const X = (x) => pad + ((-(sim.targetX - x) * sgn) - xMin) / (xMax - xMin) * (W - pad - 14);
  const Yh = (h) => H - 24 - h / hMax * (H - 44);
  g.strokeStyle = 'rgba(150,170,255,.12)'; g.lineWidth = 1;
  for (let i = 1; i <= 3; i++) { const y = Yh(hMax * i / 3); g.beginPath(); g.moveTo(pad, y); g.lineTo(W - 10, y); g.stroke(); }
  g.fillStyle = '#5d6589'; g.font = '500 16px "JetBrains Mono", monospace'; g.textAlign = 'right';
  g.fillText(hMax > 5000 ? (hMax / 1000).toFixed(0) + ' km' : hMax.toFixed(0) + ' m', pad + 60, 18);
  g.textAlign = 'right'; g.fillText(`${(Math.max(-xMin, xMax) / 1000).toFixed(xMax - xMin > 5000 ? 0 : 1)} km to target`, W - 10, H - 4);
  // flown
  g.strokeStyle = '#7cc8ff'; g.lineWidth = 3; g.beginPath();
  pts.forEach(([x, h], i) => { i ? g.lineTo(X(x), Yh(h)) : g.moveTo(X(x), Yh(h)); }); g.stroke();
  // predicted
  if (hudPred && hudPred.path) {
    g.setLineDash([8, 7]); g.strokeStyle = '#ffc24b'; g.lineWidth = 2; g.beginPath();
    hudPred.path.forEach(([x, h], i) => { i ? g.lineTo(X(x), Yh(h)) : g.moveTo(X(x), Yh(h)); }); g.stroke(); g.setLineDash([]);
  }
  // target
  const xt = X(sim.targetX);
  g.fillStyle = '#4ef0b8'; g.beginPath(); g.moveTo(xt, H - 24); g.lineTo(xt - 8, H - 10); g.lineTo(xt + 8, H - 10); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(X(sim.x), Yh(sim.h), 5, 0, 6.28); g.fill();
}

/* 3-D → screen labels */
function projLabel(el, p, text) {
  tmpV.copy(p).project(camera);
  const vis = tmpV.z < 1 && Math.abs(tmpV.x) < 1.05 && Math.abs(tmpV.y) < 1.05;
  el.classList.toggle('show', vis && flying);
  if (!vis) return;
  el.style.transform = `translate(${((tmpV.x + 1) / 2 * innerWidth - 7).toFixed(1)}px, ${((1 - tmpV.y) / 2 * innerHeight - 7).toFixed(1)}px)`;
  el.querySelector('b').textContent = text;
}
function updateLines() {
  // flown trail (sim coordinates → local)
  const hist = sim.hist; const pos = trailGeo.attributes.position;
  const n = Math.min(hist.length + 1, TRAIL_MAX);
  const s = Math.max(0, hist.length + 1 - TRAIL_MAX);
  for (let i = 0; i < n; i++) {
    const [x, h] = i + s < hist.length ? hist[i + s] : [sim.x, sim.h];
    toLocal(x, h, 0, tmpV); pos.setXYZ(i, tmpV.x, tmpV.y, tmpV.z);
  }
  trailGeo.setDrawRange(0, n); pos.needsUpdate = true;
  trail.visible = flying && !sim.S.practice;
  // predicted path
  const pp = hudPred && hudPred.path;
  if (pp && pp.length > 1 && !sim.done) {
    const pa = predGeo.attributes.position;
    const m = Math.min(pp.length, 1200);
    for (let i = 0; i < m; i++) { toLocal(pp[i][0], pp[i][1], 0, tmpV); pa.setXYZ(i, tmpV.x, tmpV.y, tmpV.z); }
    predGeo.setDrawRange(0, m); pa.needsUpdate = true;
    predLine.computeLineDistances();
    predLine.material.dashSize = clamp(sim.h * 0.02, 4, 2000); predLine.material.gapSize = predLine.material.dashSize * 0.7;
    predLine.visible = $('showPred').checked && flying && sim.clearance() > 400;
    const px = hudPred.x;
    placeOnEarth(predRing, px, (sim.S.target === 'ship' && Math.abs(px - sim.targetX) < SHIP.length / 2 ? SHIP.deck : 0) + 0.3);
    predRing.rotation.x = 0;
    const sc = clamp(Math.abs(px - sim.x) / 1500 + sim.h / 3000, 1, 60);
    predRing.scale.set(sc, 1, sc);
    predRing.visible = $('showPred').checked && flying && sim.clearance() > 400;
  } else { predLine.visible = false; predRing.visible = false; }
}

/* ================================================================== OUTCOME */
function onTouchdown() {
  const r = sim.done;
  const o = r.outcome;
  if (o.fail || o.grade === 'hard') {
    crash.t = tReal; crash.dir = Math.sign(sim.theta || sim.vx || 1);
    crash.tip = o.fail === 'nolegs' || o.fail === 'hard' ? 0.25 : o.fail === 'water' ? 0.9 : o.fail === 'tip' ? Math.PI / 2 - 0.05 : 0;
    crash.sink = o.fail === 'water' ? 20 : 0;
    if (o.fail) explode(r);
  }
  syncButtons();
  setTimeout(() => showOutcome(r), o.fail ? 2600 : 1800);
}
function explode(r) {
  const sf = sim.surface(sim.x, sim.t);
  for (let i = 0; i < (r.surface === 'sea' ? 60 : 120); i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * 0.9, sp = 10 + Math.random() * 40;
    emit(fireP, { x: sim.x + (Math.random() - 0.5) * 8, h: sf.h + 2 + Math.random() * 25, z: (Math.random() - 0.5) * 8,
      vx: Math.cos(a) * Math.cos(e) * sp, vy: Math.sin(e) * sp, vz: Math.sin(a) * Math.cos(e) * sp, life: 0.8 + Math.random() * 1.4,
      s0: 8, s1: 30 + Math.random() * 30, a: 0.9, c: [1, 0.55 + Math.random() * 0.2, 0.2], drag: 1.8, lift: 6 });
    emit(smokeP, { x: sim.x + (Math.random() - 0.5) * 10, h: sf.h + 5 + Math.random() * 25, z: (Math.random() - 0.5) * 10,
      vx: Math.cos(a) * sp * 0.3, vy: 4 + Math.random() * 8, vz: Math.sin(a) * sp * 0.3, life: 8 + Math.random() * 6,
      s0: 10, s1: 60 + Math.random() * 40, a: 0.55, c: r.surface === 'sea' ? [0.85, 0.87, 0.9] : [0.16, 0.15, 0.14], drag: 0.6, lift: 3 });
  }
}
function showOutcome(r) {
  if (outShown) return; outShown = true;
  const o = r.outcome, S = sim.S;
  const card = document.querySelector('.bx-outc');
  card.classList.remove('good', 'bad', 'meh');
  card.classList.add(o.fail ? 'bad' : o.grade === 'perfect' ? 'good' : 'meh');
  $('outEyebrow').textContent = `${S.name} · ${apWatch ? 'autopilot' : 'your landing'} · T+${mmss(r.t)}`;
  $('outTitle').textContent = o.title;
  $('outScore').textContent = o.score;
  const tiltDeg = r.tilt / DEG;
  const rows = [
    [o.checks.vyOk, 'Vertical speed', `${r.vy.toFixed(2)} m/s`, '< 2 m/s', r.vy < LIMITS.vyHard],
    [o.checks.vxOk, 'Horizontal speed', `${Math.abs(r.vx).toFixed(2)} m/s`, '< 1 m/s', Math.abs(r.vx) < 3],
    [o.checks.tiltOk, 'Tilt', `${tiltDeg.toFixed(1)}°`, '< 5°', tiltDeg < 10],
    [o.checks.distOk, 'Distance from target', `${r.dist < 1000 ? r.dist.toFixed(1) + ' m' : (r.dist / 1000).toFixed(2) + ' km'}`, S.target === 'ship' ? '< 10 m' : '< 15 m', r.surface !== 'sea'],
    [r.prop > 300, 'Propellant left', `${fmt(r.prop, 0)} kg`, 'more is better', true]
  ];
  $('outChecks').innerHTML = rows.map(([ok, k, v, lim, meh]) => `<tr><td class="${ok ? 'ok' : meh ? 'meh' : 'no'}">${ok ? '✓' : meh ? '~' : '✗'}</td><td>${k}</td><td class="v">${v}</td><td class="lim">${lim}</td></tr>`).join('');
  $('outText').innerHTML = explain(r);
  $('watchBtn').textContent = apWatch ? 'Watch the autopilot again' : 'Watch the autopilot do it';
  $('out').hidden = false;
  $('againBtn').focus();
}
function explain(r) {
  const o = r.outcome, S = sim.S, out = [];
  if (o.fail === 'hard' && r.vy > 20) out.push(sim.ignitions === 0 || !r.engOn && r.vy > 60
    ? `It hit at ${r.vy.toFixed(0)} m/s: ${sim.ignitions === 0 ? 'the engine never lit' : 'the engine was not running at the end'}. Light one engine when your altitude reaches the amber “burn” line on the tape: that line is h = v²/(2·a_net), live.`
    : `It hit at ${r.vy.toFixed(0)} m/s: the burn started too low${r.hLit != null ? ` (at ${fmt(r.hLit, 0)} m)` : ''} to stop in time. Light earlier, when the altitude meets the amber “burn” line, or throttle up.`);
  if (o.fail === 'nolegs') out.push('The legs were still folded, so the engine bells hit first. Deploy them (G) five to ten seconds before touchdown: the pistons need about three seconds.');
  if (o.fail === 'water') out.push(S.target === 'ship' ? `You came down ${r.dist.toFixed(0)} m from the centre of the deck, off the edge of a ${SHIP.length} m ship. Steer earlier: with the engine off, tilt the top <i>away</i> from the ship to glide toward it; once the engine is lit, tilt <i>toward</i> it.` : 'You came down in the sea.');
  if ((o.fail === 'hard' && r.vy <= 20) || (!o.fail && r.vy >= LIMITS.vy)) out.push(`Touchdown at ${r.vy.toFixed(1)} m/s. The crushable honeycomb in the legs absorbs a firm landing, but not much more than a couple of metres per second. ${r.vy > 4 ? 'Light the engine a little earlier, or throttle up as the amber burn marker catches up with the altitude.' : 'Throttle a touch higher in the last seconds.'}`);
  if (o.fail === 'tip' || (!o.fail && r.tilt >= LIMITS.tilt)) out.push(`It touched down tilted ${(r.tilt / DEG).toFixed(1)}°. Kill the sideways drift with small tilts early, then stand the stage upright for the last 15–20 m.`);
  if (!o.fail && Math.abs(r.vx) >= LIMITS.vx) out.push(`Still sliding sideways at ${Math.abs(r.vx).toFixed(1)} m/s at contact: the legs can catch on the deck and tip the stage.`);
  if (r.prop < 200) out.push('The tanks were nearly dry. A slower, earlier burn wastes propellant fighting gravity (gravity loss); the hoverslam is efficient precisely because it is short.');
  if (!out.length) out.push(`A textbook hoverslam: zero speed at zero height, with ${fmt(r.prop, 0)} kg of propellant to spare. ${apWatch ? 'That was the guidance law on the HUD, nothing more.' : 'The autopilot would be proud.'}`);
  if (r.surface === 'deck') out.push('The deck was heaving at ' + Math.abs(r.heave).toFixed(2) + ' m/s at contact; speeds above are relative to it.');
  return out.join(' ');
}

/* ================================================================== PANEL STATIC CONTENT */
function renderMath() {
  if (!window.katex) return;
  document.querySelectorAll('.bx-eq[data-tex]').forEach((el) => {
    try { window.katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false }); } catch (e) { el.textContent = el.dataset.tex; }
  });
}
renderMath();
{
  const rows = [['Expended', 8300], ['Drone ship', 5500], ['Return to site', 3500]];
  $('pay').innerHTML = rows.map(([k, v]) => `<div class="row2"><span>${k}</span><i style="width:${(v / 8300 * 100).toFixed(0)}%"></i><b>${(v / 1000).toFixed(1)} t</b></div>`).join('');
}
fetch('data/booster.json').then(r => r.json()).then(j => {
  $('vtab').innerHTML = '<tr><th>Item</th><th>Value</th><th>Source</th></tr>' + j.vehicle.rows.map(r =>
    `<tr><td>${r.k}${r.estimate ? '<span class="est">est.</span>' : ''}${r.note ? `<br><span class="muted" style="font-size:.68rem">${r.note}</span>` : ''}</td><td class="num">${typeof r.v === 'number' ? fmt(r.v, 1) : r.v} ${r.unit}</td><td>${j.sources[r.src] && j.sources[r.src].url ? `<a href="${j.sources[r.src].url}" rel="noopener">${j.sources[r.src].publisher}</a>` : r.src}</td></tr>`).join('');
  $('hist').innerHTML = j.history.map(h => `<li class="${h.date.startsWith('2015-12') ? 'key' : ''}"><time>${h.date}</time>${h.text}</li>`).join('');
}).catch(() => { $('vtab').innerHTML = '<tr><td>Vehicle data could not be loaded.</td></tr>'; });
// entry-burn comparison: predicted peak load and heating with and without the burn
function entryCompare() {
  const lines = [];
  for (const k of ['ship', 'rtls']) {
    const s = new BoosterSim(k), S = SCENARIOS[k];
    const a = predict(s, { entryAlt: S.entryAlt, entryEnd: S.entryEnd, surfaceH: 3 });
    const b = predict(s, { surfaceH: 3 });
    lines.push(`${S.short}: peak q ${fmt(a.peakQ / 1000, 0)} kPa with the burn, ${fmt(b.peakQ / 1000, 0)} kPa without; peak heating ${fmt(a.peakHeat / 1000, 0)} vs ${fmt(b.peakHeat / 1000, 0)} kW/m²`);
  }
  $('entryCmp').textContent = 'This model, coasting at zero angle of attack (RTLS figures after an ideal boostback are lower): ' + lines.join('; ') + '.';
}
setTimeout(entryCompare, 1500);

/* ================================================================== AUDIO (optional) */
function initAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
  let last = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
  const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
  const gain = ctx.createGain(); gain.gain.value = 0;
  src.connect(lp); lp.connect(gain); gain.connect(ctx.destination); src.start();
  snd.ctx = ctx; snd.gain = gain; snd.lp = lp;
}
$('audio').addEventListener('change', (e) => {
  snd.on = e.target.checked;
  if (snd.on && !snd.ctx) { try { initAudio(); } catch (err) { snd.on = false; e.target.checked = false; } }
  if (snd.ctx) { if (snd.on) snd.ctx.resume(); else snd.ctx.suspend(); }
});
function updateAudio() {
  if (!snd.ctx || !snd.on) return;
  const dist = camera.position.distanceTo(base);
  const loud = sim.level * Math.sqrt(sim.nEng) * sim.throttle * (camMode === 'onboard' ? 0.5 : 1 / (1 + dist / 300)) * smooth(0, 3000, sim.d.atm.p);
  snd.gain.gain.setTargetAtTime(paused ? 0 : clamp(loud, 0, 1) * 0.9, snd.ctx.currentTime, 0.08);
  snd.lp.frequency.setTargetAtTime(250 + 900 * clamp(loud, 0, 1), snd.ctx.currentTime, 0.1);
}

/* ================================================================== POST + LOOP */
let composer = null, bloom = null;
{
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.45, 0.2, 0.95);
  bloom.enabled = Q.bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});
const clock = { t: performance.now(), getDelta() { const n = performance.now(), d = (n - this.t) / 1000; this.t = n; return d; } };
let hudTimer = 0, fdTimer = 0;
function frame() {
  const dtReal = Math.min(clock.getDelta(), 0.1);
  if (!paused && !STILL) tReal += dtReal;
  else if (STILL) tReal += dtReal * 0.0001;
  manualInput(dtReal);
  const dtSim = stepSim(dtReal);
  if (sim.events.length !== lastEvents) pushEvents();
  coach();
  updateScene(dtReal, dtSim);
  computeCamera(dtReal);
  updateAtmosphere();
  updateEffects(dtReal, dtSim);
  updateAudio();
  composer.render();
  hudTimer -= dtReal; fdTimer -= dtReal;
  if (hudTimer <= 0) { updateHUD(); updateLines(); hudTimer = 0.1; }
  if (fdTimer <= 0) { drawFD(); fdTimer = 1 / 30; }
  if (!sim.done && (Math.abs(sim.targetX - sim.x) > 300 || sim.h > 400)) projLabel($('lblTarget'), toLocal(sim.targetX, 30, 0, new THREE.Vector3()), fmtDist(Math.abs(sim.targetX - sim.x), sim.h));
  else $('lblTarget').classList.remove('show');
  if (hudPred && !sim.done && Math.abs(hudPred.x - sim.targetX) > 40) projLabel($('lblPred'), toLocal(hudPred.x, 30, 0, new THREE.Vector3()), fmtDist(Math.abs(hudPred.x - sim.targetX), null) + ' off');
  else $('lblPred').classList.remove('show');
}
function fmtDist(dx, h) { const d = h != null ? Math.hypot(dx, h) : dx; return d < 2000 ? d.toFixed(0) + ' m' : (d / 1000).toFixed(1) + ' km'; }
let rafId = 0;
function loop() { rafId = requestAnimationFrame(loop); frame(); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
  else if (!rafId && booted) { clock.getDelta(); loop(); }
});
// phones: the telemetry sheet starts collapsed
if (matchMedia('(max-width: 820px)').matches) {
  const p = $('panel'); p.classList.add('collapsed'); $('collapse').textContent = '▲ TELEMETRY';
  $('collapse').addEventListener('click', () => { setTimeout(() => { const c = p.classList.contains('collapsed'); $('collapse').textContent = c ? '▲ TELEMETRY' : '▼ HIDE'; document.body.classList.toggle('bx-sheet-open', !c); }, 0); });
}

const initial = SCENARIOS[params.get('s')] ? params.get('s') : 'ship';
load(initial);
setCam(camMode);
async function warmUp() {
  if (!renderer.compileAsync) return;
  const hidden = [];
  scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  smokeP.geo.instanceCount = 1; fireP.geo.instanceCount = 1;
  updateScene(0, 0); computeCamera(0); updateAtmosphere();
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (e) { /* compile lazily */ }
  hidden.forEach(o => { o.visible = false; });
}
// Start after the page's load event so the heavy first compile never blocks it; if
// the driver cannot report compile progress, do not wait more than a few seconds.
let booted = false;
async function boot() {
  try { await Promise.race([warmUp(), new Promise(r => setTimeout(r, 4000))]); } catch (e) { /* compile lazily */ }
  if (booted) return;
  booted = true;
  requestAnimationFrame(() => {
    clock.getDelta(); if (!rafId) loop();
    requestAnimationFrame(() => { $('loading').classList.add('done'); setTimeout(() => { $('loading').style.display = 'none'; }, 800); });
  });
}
if (document.readyState === 'complete') setTimeout(boot, 0); else addEventListener('load', () => setTimeout(boot, 0), { once: true });

/* ================================================================== DEBUG HOOK */
// window.__sim.start('ship', true); .jump(300) → fly to T+300 s with the autopilot;
// .phase('landing') → fly with the autopilot until that phase; .cam('deck'); .state()
window.__sim = {
  start(key = scenKey, auto = true) { scenKey = key; start(auto); return sim.t; },
  jump(t, auto = true) {
    if (!flying) start(auto);
    const a = apOn ? ap : new Autopilot();
    while (sim.t < t && !sim.done) { a.update(sim); sim.step(DT); }
    if (!apOn) sim.attCmd = sim.theta;
    lastEvents = sim.events.length; cam.init = false; updateHUD(true);
    if (sim.done && !outShown) { doneAt = tReal; onTouchdown(); }
    return this.state();
  },
  phase(name, extra = 0) {
    if (!flying) start(true);
    const a = apOn ? ap : new Autopilot();
    let n = 0;
    while (a.phase !== name && !sim.done && n++ < 60000) { a.update(sim); sim.step(DT); }
    const t1 = sim.t + extra;
    while (sim.t < t1 && !sim.done) { a.update(sim); sim.step(DT); }
    lastEvents = sim.events.length; cam.init = false; updateHUD(true);
    if (sim.done && !outShown) { doneAt = tReal; onTouchdown(); }
    return this.state();
  },
  cam: (c) => setCam(c),
  hideFx: () => { for (const o of [smokeP.m, fireP.m, beacon, trail, predLine, predRing, ocean, envPlume, cushion, shock, glow]) o.visible = false; smokeP.max = 0; fireP.max = 0; smokeP.list.length = 0; fireP.list.length = 0; },
  deckTex: () => deckTex.image.toDataURL('image/png'),
  shadows: (on) => { sunLight.castShadow = !!on; renderer.shadowMap.enabled = !!on; scene.traverse(o => { if (o.material) [].concat(o.material).forEach(m => { m.needsUpdate = true; }); }); },
  pause: (p = true) => { paused = p; setPauseUI(); },
  warp: (w) => setWarp(w),
  orbit: (yaw, pitch, zoom) => { cam.userYaw = yaw ?? cam.userYaw; cam.userPitch = pitch ?? cam.userPitch; cam.userZoom = zoom ?? cam.userZoom; cam.init = false; },
  state: () => ({ t: +sim.t.toFixed(2), h: Math.round(sim.h), x: Math.round(sim.x), vx: +sim.vx.toFixed(1), vy: +sim.vy.toFixed(1), theta: +(sim.theta / DEG).toFixed(1), prop: Math.round(sim.prop), phase: apOn ? ap.phase : guessPhase(), done: sim.done && sim.done.outcome.title, shot: cam.shot }),
  debug: () => ({ cam: camera.position.toArray().map(v => +v.toFixed(1)), look: cam.look.clone().add(com).toArray().map(v => +v.toFixed(1)), fov: +camera.fov.toFixed(2), root: B.root.position.toArray().map(v => +v.toFixed(1)), camH: Math.round(camH), mode: camMode, shot: cam.shot }),
  get sim() { return sim; }
};
