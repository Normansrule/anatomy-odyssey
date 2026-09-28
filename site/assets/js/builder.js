/* Cosmic Library · Rocket Builder — design a rocket from real parts, see at once
 * whether it can reach orbit (and why not), then fly it.
 *
 * Physics, parts model, analysis and the flight computer live in
 * builder-physics.js (runs in Node too: scripts/test_builder.mjs). This file is
 * the page: the parts palette and stack editor (drag and drop, undo/redo,
 * presets, share links in the URL hash), the live analysis panel, and a
 * Three.js scene that builds the rocket procedurally from the chosen parts and
 * flies it. The sky and planet are the single-scattering atmosphere shader from
 * launch.js with a generic coastline, so the sky darkens to black as you climb.
 *
 * Frames: "pad frame" = Earth-fixed, origin on the ground at the pad, +x east
 * (down-range), +y up, +z south. The `world` group holds everything fixed to the
 * Earth and is rotated/translated every frame so the rocket sits at the origin
 * with its local vertical along +y (floating origin, level horizon).
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  G0, MU, RE, DT, KARMAN, ORBIT_MIN_PERI, makeCatalogue, buildVehicle, analyse, plan, FlightSim,
  encodeDesign, decodeDesign, cloneDesign, PRESETS, interstageHeight, clusterLayout, fmt, stageName, tsiolkovsky
} from './builder-physics.js';

const Codex = window.Codex || { fmt: (v, d) => (+v).toFixed(d ?? 2), webgl: () => true, reducedMotion: false };
const gsap = window.gsap;
if (gsap) gsap.ticker.lagSmoothing(0);
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const DEG = Math.PI / 180;
const params = new URLSearchParams(location.search);
const STILL = params.has('still');
const REDUCED = STILL || !!Codex.reducedMotion;
const D = (s) => (REDUCED ? 0 : s);
const isPhone = () => innerWidth <= 820;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const nf = (v, d = 0) => (v == null || !isFinite(v)) ? '—' : v.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
const STAGE_C = ['#ff7a3d', '#7cc8ff', '#b18cff', '#4ef0b8', '#ffc24b', '#ff4f9a', '#9ef', '#fc9'];
const BOOST_C = '#ffd98a';
const FAM_C = { kerolox: '#f2f0ea', hydrolox: '#e98a3c', methalox: '#aeb6c2' };

/* ------------------------------------------------------------------ quality */
const QUALITY = {
  low: { pr: 0.75, shadow: 0, bloom: false, steps: 6, seg: 20, puffs: 500 },
  high: { pr: 1.0, shadow: 2048, bloom: true, steps: 10, seg: 32, puffs: 1400 }
};
let qName = params.get('q') || (isPhone() ? 'low' : 'high');
if (!QUALITY[qName]) qName = 'high';
const Q = QUALITY[qName];

/* ================================================================== BOOT */
if (!Codex.webgl()) { Codex.noGL && Codex.noGL(); throw new Error('WebGL unavailable'); }
const stageEl = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(2, Math.min(devicePixelRatio, 2) * Q.pr));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = THREE.PCFShadowMap;
stageEl.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', stageEl.getAttribute('aria-label'));
renderer.domElement.setAttribute('role', 'img');

const scene = new THREE.Scene();
const world = new THREE.Group();            // Earth-fixed things (pad, debris, smoke): floating origin
scene.add(world);
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.5, 2.5e7);
camera.position.set(72, 20, 200);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.53;
controls.minDistance = 8; controls.maxDistance = 4000;
controls.autoRotate = !REDUCED; controls.autoRotateSpeed = 0.35;
let userCam = 0;
controls.addEventListener('start', () => { controls.autoRotate = false; userCam = performance.now(); });

/* Afternoon sun from the south-west, 30° high: the rocket is side-lit from the default camera. */
const SUN = new THREE.Vector3(-0.55, 0.5, 0.67).normalize();

/* ------------------------------------------------------------------ shared GLSL (value noise; Dave Hoskins' "hash without sine", MIT) */
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

/* ================================================================== PLANET + ATMOSPHERE
 * Adapted from launch.js: single-scattering sky after Nishita et al. (1993),
 * Rayleigh coefficients from Bruneton & Neyret (2008), Chapman-function sun
 * transmittance (Schüler, GPU Pro 3, 2012). Drawn as one full-screen triangle
 * that writes logarithmic depth, so the rocket and pad sort correctly. */
const planetMat = new THREE.ShaderMaterial({
  uniforms: {
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() },
    uUp: { value: new THREE.Vector3(0, 1, 0) }, uH: { value: 2 }, uCamPad: { value: new THREE.Vector3() },
    uSun: { value: SUN.clone() }, uTime: { value: 0 }, uLogFC: { value: 1 }, uCamFwd: { value: new THREE.Vector3() },
    uSunE: { value: 3.3 }, uSkyGain: { value: 2.6 }, uSteps: { value: Q.steps }
  },
  vertexShader: /* glsl */`
    uniform mat4 uInvProj; uniform mat4 uCamWorld;
    varying vec3 vDir;
    void main(){
      vec4 v = uInvProj * vec4(position.xy, -1.0, 1.0);
      v /= v.w;
      vDir = (uCamWorld * vec4(v.xyz, 0.0)).xyz;
      gl_Position = vec4(position.xy, 0.999, 1.0);
    }`,
  fragmentShader: /* glsl */`
    precision highp float;
    uniform vec3 uUp, uCamPad, uSun, uCamFwd; uniform float uH, uTime, uLogFC, uSunE, uSkyGain, uSteps;
    varying vec3 vDir;
    const float R = 6371000.0, HA = 100000.0, HR = 8000.0, HM = 1200.0, PI = 3.14159265;
    const vec3 BR = vec3(5.8e-6, 13.5e-6, 33.1e-6);
    const float BM = 9e-6;
    ${NOISE_GLSL}
    // Chapman grazing-incidence function (Schüler 2012): returns column density factor
    float chapman(float X, float h, float cz){
      float c = sqrt(X + h);
      if (cz >= 0.0) return c / (c * cz + 1.0) * exp(-h);
      float x0 = sqrt(1.0 - cz*cz) * (X + h);
      float c0 = sqrt(x0);
      return 2.0 * c0 * exp(X - x0) - c / (1.0 - c * cz) * exp(-h);
    }
    vec3 sunTrans(float h, float cz){
      // planet shadow
      float r = R + h;
      float disc = r*r*cz*cz - h*(2.0*R + h);
      if (cz < 0.0 && disc > 0.0) return vec3(0.0);
      float cR = chapman(R/HR, h/HR, cz);            // column factor incl. exp(-h/HR)
      float geo = cR * exp(h/HR);                     // pure geometric air-mass factor
      float tR = HR * cR;
      float tM = HM * exp(-h/HM) * min(geo, 40.0);    // reuse the air mass for aerosols
      return exp(-(BR * tR + BM * 1.1 * tM));
    }
    // ---- surface: a generic coastline east of the pad (e = east, n = north, metres from the pad)
    float coastE(float n){
      return 1700.0 + 650.0*sin(n/5300.0) + 260.0*sin(n/1700.0 + 1.3) + 5200.0*(fbm2(vec2(n/16000.0, 3.7)) - 0.5)
             - 0.10*max(0.0, abs(n) - 60000.0);
    }
    float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return length(pa - ba*h); }
    // returns albedo in rgb, water flag in a
    vec4 surface(vec2 p, float dist){
      float e = p.x, n = p.y;
      float ce = coastE(n);
      float big = fbm2(p / 9000.0);
      if (e > ce) return vec4(0.0, 0.0, 0.0, 1.0);                           // ocean
      float lake = fbm2(p / 5200.0 + 11.0);
      if (lake > 0.70 && length(p) > 1500.0 && e < ce - 1500.0) return vec4(0.0, 0.0, 0.0, 0.6);   // lagoons and lakes
      float beach = smoothstep(ce - 90.0, ce - 20.0, e);
      float g = fbm2(p / 380.0), g2 = fbm2(p / 55.0 + 3.0);
      vec3 scrub = mix(vec3(0.075, 0.095, 0.045), vec3(0.16, 0.16, 0.085), g);
      scrub = mix(scrub, vec3(0.05, 0.075, 0.05), smoothstep(0.55, 0.75, big));
      scrub = mix(scrub, vec3(0.20, 0.18, 0.12), smoothstep(-40000.0, -160000.0, e) * 0.55);  // drier inland
      scrub *= 0.85 + 0.3*g2;
      vec3 col = mix(scrub, vec3(0.55, 0.50, 0.40), beach);
      if (dist < 60000.0){
        float pr = length(p);
        vec3 mowed = vec3(0.13, 0.15, 0.07) * (0.9 + 0.2*g2);
        col = mix(col, mowed, 1.0 - smoothstep(380.0, 470.0, pr));
        col = mix(col, vec3(0.34, 0.33, 0.31), 1.0 - smoothstep(4.0, 7.0, abs(pr - 430.0)));      // perimeter road
        float rd = segDist(p, vec2(-430.0, 0.0), vec2(-7000.0, -1800.0));
        col = mix(col, vec3(0.30, 0.30, 0.29), 1.0 - smoothstep(4.0, 6.0, rd));                  // access road
        col = mix(col, vec3(0.42, 0.41, 0.39), 1.0 - smoothstep(55.0, 62.0, pr));                // concrete hardstand
      }
      return vec4(col, 0.0);
    }
    float clouds(vec2 p){
      float c = fbm2(p / 5200.0 + vec2(3.1, 7.7));
      float d = fbm2(p / 900.0);
      return smoothstep(0.60, 0.80, c*0.85 + d*0.25);
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
      // atmosphere shell
      float cT = (h - HA) * (2.0*R + h + HA);
      float discT = Rh*Rh*mu*mu - cT;
      float t0 = 0.0, t1 = 0.0;
      if (h < HA){ t1 = hit ? tG : (-Rh*mu + sqrt(max(discT, 0.0))); }
      else if (discT > 0.0 && mu < 0.0){ t0 = cT / (-Rh*mu + sqrt(discT)); t1 = hit ? tG : (-Rh*mu + sqrt(discT)); }
      float nu = dot(d, uSun);
      float pR = 3.0/(16.0*PI) * (1.0 + nu*nu);
      float g = 0.76;
      float pM = 3.0/(8.0*PI) * ((1.0-g*g)*(1.0+nu*nu)) / ((2.0+g*g) * pow(1.0 + g*g - 2.0*g*nu, 1.5));
      vec3 sumR = vec3(0.0), sumM = vec3(0.0);
      vec3 tau = vec3(0.0);
      int N = int(uSteps);
      float seg = max(t1 - t0, 0.0);
      float prevS = t0;
      for (int i = 0; i < 16; i++){
        if (i >= N) break;
        float f = (float(i) + 0.5) / float(N);
        float s = t0 + seg * f * f;                     // denser samples near the camera
        float fn = (float(i) + 1.0) / float(N);
        float ds = seg * (fn*fn - (float(i)/float(N))*(float(i)/float(N)));
        float rs2 = Rh*Rh + 2.0*s*Rh*mu + s*s;
        float rs = sqrt(rs2);
        float hs = (c0 + 2.0*s*Rh*mu + s*s) / (rs + R);
        hs = max(hs, 0.0);
        vec3 us = (uUp*Rh + d*s) / rs;
        float dR = exp(-hs/HR), dM = exp(-hs/HM);
        vec3 stepTau = (BR*dR + BM*1.1*dM) * ds;
        vec3 tMid = exp(-(tau + stepTau*0.5));
        tau += stepTau;
        vec3 ts = sunTrans(hs, dot(us, uSun));
        sumR += tMid * ts * dR * ds;
        sumM += tMid * ts * dM * ds;
      }
      vec3 T = exp(-tau);
      vec3 inscatter = uSunE * uSkyGain * (sumR * BR * pR + sumM * BM * pM);
      vec3 col;
      float depth = 0.99999;
      if (hit){
        vec3 P = uCamPad + d * tG;                       // pad-frame hit point
        vec3 nrm = normalize(uUp*Rh + d*tG);
        vec2 en = vec2(P.x, -P.z);
        vec4 sf = surface(en, tG);
        float cz = dot(nrm, uSun);
        vec3 Ts = sunTrans(0.0, cz);
        vec3 Eamb = uSunE * vec3(0.10, 0.14, 0.22) * (0.35 + 0.65*clamp(cz*1.5 + 0.2, 0.0, 1.0));
        vec3 E = uSunE * max(cz, 0.0) * Ts + Eamb;
        if (sf.a > 0.5){
          // water: dark blue body + Fresnel sky reflection + sun glint on noisy waves
          float dist = tG;
          vec2 wp = en * 0.05;
          float wn = vnoise2(wp + uTime*0.3) + 0.5*vnoise2(wp*2.7 - uTime*0.2);
          float amp = 0.10 / (1.0 + dist/2500.0);
          vec3 wnrm = normalize(nrm + (uUp.zxy*0.0) + vec3((wn-0.75)*amp, 0.0, (vnoise2(wp.yx*1.3)-0.5)*amp));
          vec3 rdir = reflect(d, wnrm);
          float fres = 0.02 + 0.98*pow(1.0 - max(dot(-d, wnrm), 0.0), 5.0);
          vec3 body = (sf.a > 0.8 ? vec3(0.010, 0.035, 0.060) : vec3(0.02, 0.05, 0.05)) * E / PI * 3.0;
          vec3 skyRef = uSunE * uSkyGain * vec3(0.06, 0.10, 0.18) * Ts;
          float spec = pow(max(dot(rdir, uSun), 0.0), mix(900.0, 90.0, clamp(dist/300000.0, 0.0, 1.0)));
          col = mix(body, skyRef, fres) + uSunE * Ts * spec * mix(18.0, 2.5, clamp(dist/300000.0, 0.0, 1.0));
          // surf line near the beach
          float ce = coastE(en.y);
          float surfL = (1.0 - smoothstep(0.0, 45.0, en.x - ce)) * (0.5 + 0.5*sin(en.x*0.25 - uTime*1.4 + wn*3.0));
          if (sf.a > 0.8) col += surfL * 0.5 * E / PI * (1.0 - smoothstep(4000.0, 12000.0, dist));
        } else {
          col = sf.rgb * E / PI;
        }
        // cloud layer (seen from above or from far away)
        float cl = clouds(en + vec2(-uTime*4.0, 0.0));
        float cloudVis = smoothstep(1500.0, 2500.0, h) + smoothstep(8000.0, 30000.0, tG) * smoothstep(0.004, 0.03, -mu);
        col = mix(col, vec3(0.92, 0.94, 0.97) * (uSunE * Ts * max(cz, 0.0) + Eamb * 1.5) / PI, cl * clamp(cloudVis, 0.0, 1.0) * 0.95);
        col = col * T + inscatter;
        float w = tG * max(dot(d, uCamFwd), 1e-4);
        depth = log2(1.0 + w) * uLogFC * 0.5;
      } else {
        col = inscatter;
        // sun disk + aureole
        float sd = acos(clamp(nu, -1.0, 1.0));
        vec3 Tsun = sunTrans(h, mu);
        col += Tsun * uSunE * (smoothstep(0.0052, 0.0044, sd) * 60.0 + 0.6 * exp(-sd * 40.0));
        // stars: fade in as the sky darkens
        float skyLum = dot(inscatter, vec3(0.2126, 0.7152, 0.0722));
        float starVis = clamp(1.0 - skyLum * 8.0, 0.0, 1.0) * smoothstep(0.0, 0.15, mu + 0.3);
        if (starVis > 0.0){
          vec3 sp = d * 320.0;
          vec3 cell = floor(sp);
          float hsh = hash13(cell);
          if (hsh > 0.985){
            vec3 fc = fract(sp) - 0.5 - (vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5) * 0.6;
            float st = exp(-dot(fc, fc) * 90.0) * pow((hsh - 0.985) / 0.015, 3.0) * 6.0;
            vec3 sc = mix(vec3(1.0, 0.85, 0.7), vec3(0.75, 0.85, 1.0), hash13(cell + 3.3));
            col += st * sc * starVis;
          }
          // faint Milky Way band
          float band = exp(-pow(dot(d, normalize(vec3(0.3, 0.5, 0.81))) * 4.0, 2.0));
          col += vec3(0.010, 0.011, 0.016) * band * (0.6 + 0.8 * fbm3(d * 18.0)) * starVis;
        }
        // cumulus overhead when standing below the cloud deck
        if (h < 1600.0 && mu > 0.0){
          float tc = (1600.0 - h) / max(mu, 0.02);
          vec3 Pc = uCamPad + d * tc;
          float cl = clouds(vec2(Pc.x, -Pc.z) + vec2(-uTime*4.0, 0.0));
          float fade = exp(-tc / 60000.0);
          vec3 ccol = vec3(0.95, 0.96, 1.0) * uSunE * (0.35 + 0.35 * nu) * sunTrans(1600.0, dot(uUp, uSun)) / PI + inscatter * 0.3;
          col = mix(col, ccol, cl * fade * 0.9);
        }
      }
      gl_FragColor = vec4(col, 1.0);
      gl_FragDepth = depth;
    }`,
  depthWrite: true, depthTest: true
});

const planetGeo = new THREE.BufferGeometry();
planetGeo.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const planet = new THREE.Mesh(planetGeo, planetMat);
planet.frustumCulled = false; planet.renderOrder = -100;
scene.add(planet);

/* ================================================================== LIGHTS + ENVIRONMENT */
const sunLight = new THREE.DirectionalLight(0xfff1dc, 3.2);
sunLight.castShadow = Q.shadow > 0;
sunLight.shadow.mapSize.set(Q.shadow || 1024, Q.shadow || 1024);
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.5;
world.add(sunLight); world.add(sunLight.target);
function aimSun(h) {
  const sc = sunLight.shadow.camera, w = Math.max(40, h * 0.75);
  sc.left = -w; sc.right = w; sc.top = h * 1.1 + 20; sc.bottom = -30; sc.near = 10; sc.far = 2000; sc.updateProjectionMatrix();
  sunLight.target.position.set(0, h * 0.45, 0);
  sunLight.position.copy(sunLight.target.position).addScaledVector(SUN, 900);
}
const hemi = new THREE.HemisphereLight(0x9cc4ff, 0x3d403b, 0.55);
scene.add(hemi);
const flameLight = new THREE.PointLight(0xff8a3a, 0, 0, 2);
scene.add(flameLight);
function buildEnv() {
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: { uSun: { value: SUN } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 uSun; varying vec3 vP; void main(){ vec3 d = normalize(vP);
      vec3 sky = mix(vec3(0.55,0.72,0.95), vec3(0.16,0.32,0.72), pow(max(d.y,0.0), 0.5));
      vec3 gnd = mix(vec3(0.20,0.21,0.20), vec3(0.09,0.10,0.08), clamp(-d.y*3.0,0.0,1.0));
      vec3 c = d.y > 0.0 ? sky : gnd;
      c += vec3(1.0,0.9,0.75) * pow(max(dot(d,uSun),0.0), 64.0) * 6.0;
      gl_FragColor = vec4(c, 1.0); }`
  });
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m));
  const rt = pm.fromScene(envScene, 0.02);
  pm.dispose();
  return rt.texture;
}
scene.environmentIntensity = 0.6;

/* ================================================================== TEXTURES */
const maxAniso = renderer.capabilities.getMaxAnisotropy();
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = Math.min(8, maxAniso);
  return t;
}
// one tile = 8 m × 8 m of skin
const TEX = {
  paint: canvasTex(512, 512, (g, w, h) => {           // white paint over aluminium panels
    g.fillStyle = '#f1f0ec'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '255,255,255'},${0.012 + rnd() * 0.02})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 30, 1 + rnd() * 3); }
    g.strokeStyle = 'rgba(60,60,70,0.22)'; g.lineWidth = 2;
    for (let y = 0; y <= h; y += h / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x <= w; x += w / 3) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.fillStyle = 'rgba(50,50,60,0.25)';
    for (let y = h / 8; y < h; y += h / 4) for (let x = 6; x < w; x += 22) g.fillRect(x, y, 2, 2);
  }),
  foam: canvasTex(512, 512, (g, w, h) => {            // sprayed-on foam insulation (hydrogen tanks)
    g.fillStyle = '#d17632'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const r = 1 + rnd() * 5; g.fillStyle = `rgba(${rnd() < 0.5 ? '90,35,5' : '255,190,120'},${0.03 + rnd() * 0.07})`; g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, 6.3); g.fill(); }
    g.strokeStyle = 'rgba(120,50,10,0.18)'; g.lineWidth = 3;
    for (let y = 0; y <= h; y += h / 2) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  }),
  steel: canvasTex(512, 512, (g, w, h) => {           // brushed stainless steel with welded rings (methane stages)
    const gr = g.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 8; i++) gr.addColorStop(i / 8, i % 2 ? '#c9ced6' : '#b4bac4');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,40,50' : '255,255,255'},${0.02 + rnd() * 0.04})`; g.fillRect(rnd() * w, rnd() * h, 1, 20 + rnd() * 90); }
    g.strokeStyle = 'rgba(70,60,50,0.45)'; g.lineWidth = 2.5;
    for (let y = 0; y <= h; y += h / 4) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(110,80,50,0.18)'; g.lineWidth = 7;
    for (let y = 0; y <= h; y += h / 4) { g.beginPath(); g.moveTo(0, y + 5); g.lineTo(w, y + 5); g.stroke(); }
  }),
  carbon: canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#26292f'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { g.fillStyle = ((x + y) / 4) % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.06)'; g.fillRect(x, y, 4, 4); }
  }),
  srb: canvasTex(256, 512, (g, w, h) => {
    g.fillStyle = '#e7e4dc'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${0.015 + rnd() * 0.025})`; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 20, 1 + rnd() * 2); }
    g.fillStyle = 'rgba(60,60,60,0.35)'; g.fillRect(0, 0, w, 6);
  })
};
const MAT = {
  kerolox: new THREE.MeshStandardMaterial({ map: TEX.paint, color: 0xffffff, roughness: 0.5, metalness: 0.05 }),
  hydrolox: new THREE.MeshStandardMaterial({ map: TEX.foam, color: 0xffffff, roughness: 0.92, metalness: 0.0 }),
  methalox: new THREE.MeshStandardMaterial({ map: TEX.steel, color: 0xffffff, roughness: 0.3, metalness: 0.85 }),
  carbon: new THREE.MeshStandardMaterial({ map: TEX.carbon, color: 0xffffff, roughness: 0.62, metalness: 0.2 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x1d2025, roughness: 0.55, metalness: 0.4 }),
  band: new THREE.MeshStandardMaterial({ color: 0x15171b, roughness: 0.5, metalness: 0.2 }),
  bell: new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.38, metalness: 0.85, side: THREE.DoubleSide }),
  bellHot: new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.38, metalness: 0.85, side: THREE.DoubleSide, emissive: 0xff5a10, emissiveIntensity: 0 }),
  power: new THREE.MeshStandardMaterial({ color: 0x2b2e34, roughness: 0.5, metalness: 0.7 }),
  fairing: new THREE.MeshStandardMaterial({ map: TEX.paint, color: 0xffffff, roughness: 0.42, metalness: 0.05, side: THREE.DoubleSide }),
  srb: new THREE.MeshStandardMaterial({ map: TEX.srb, color: 0xffffff, roughness: 0.6, metalness: 0.05 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.35, metalness: 0.9 }),
  panel: new THREE.MeshStandardMaterial({ color: 0x1b2a55, roughness: 0.3, metalness: 0.6, emissive: 0x0a1433, emissiveIntensity: 0.4 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xd8dde4, roughness: 0.25, metalness: 0.9 }),
  ghost: new THREE.MeshBasicMaterial({ color: 0x7cc8ff, wireframe: true, transparent: true, opacity: 0.35 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x8f8d88, roughness: 0.95 }),
  steelGrey: new THREE.MeshStandardMaterial({ color: 0x6d737c, roughness: 0.6, metalness: 0.6 }),
  towerRed: new THREE.MeshStandardMaterial({ color: 0x9c3b2c, roughness: 0.7, metalness: 0.3 })
};
// scale a geometry's UVs so one texture tile covers `tile` metres
function tileUV(geo, uLen, vLen, tile = 8) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * uLen / tile, uv.getY(i) * vLen / tile);
  uv.needsUpdate = true; return geo;
}

/* ================================================================== GEOMETRY HELPERS */
function lathe(pts, seg = Q.seg, phiStart = 0, phiLength = Math.PI * 2) {
  return new THREE.LatheGeometry(pts.map(p => new THREE.Vector2(Math.max(0.0001, p[0]), p[1])), seg, phiStart, phiLength);
}
function cyl(rt, rb, h, seg = Q.seg, open = false) { const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); g.translate(0, h / 2, 0); return g; }
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = Q.shadow > 0; m.receiveShadow = Q.shadow > 0;
  if (parent) parent.add(m); return m;
}
/* rocket engine: origin at the nozzle exit plane, pointing up; overall length L.
 * Bell ≈ 62 % of the length (a bell contour: radius falls fast toward the throat),
 * then combustion chamber and a powerhead (turbopumps, valves). */
const engineGeoCache = new Map();
function engineParts(e) {
  if (engineGeoCache.has(e.id)) return engineGeoCache.get(e.id);
  const L = e.length, R = e.exitD / 2 / ((e.chambers || 1) > 1 ? 1 : 1), rt = R * 0.3;
  const Lb = L * (e.vacuumOnly ? 0.72 : 0.6);
  const pts = [];
  for (let i = 0; i <= 18; i++) { const t = i / 18; pts.push([rt + (R - rt) * Math.pow(1 - t, 1.9), t * Lb]); }
  const bell = lathe(pts, Math.max(16, Q.seg - 8));
  const ch = cyl(rt * 1.35, rt * 1.1, L * 0.16, 16); ch.translate(0, Lb, 0);
  const ph = cyl(rt * 1.2, rt * 1.7, L * 0.24, 12); ph.translate(0, Lb + L * 0.16, 0);
  const tp = new THREE.BoxGeometry(rt * 1.4, L * 0.16, rt * 1.4); tp.translate(rt * 1.6, Lb + L * 0.22, 0);
  const power = mergeGeometries([ch, ph, tp]);
  const out = { bell, power, R, Lb, twin: (e.chambers || 1) > 1 };
  engineGeoCache.set(e.id, out);
  return out;
}

/* ================================================================== PLUMES (shader adapted from launch.js) */
const plumeVS = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uLen, uR0, uR1, uK;
  varying float vS; varying vec3 vN; varying vec3 vV; varying float vAng;
  void main(){
    float s = clamp(-position.y, 0.0, 1.0);
    float grow = (1.0 - exp(-s*uK)) / (1.0 - exp(-uK));
    float r = mix(uR0, uR1, grow);
    vec3 p = vec3(position.x * r, -s*uLen, position.z * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normalize(vec3(position.x, (uR1-uR0)/uLen*0.5, position.z)));
    vV = -mv.xyz; vS = s; vAng = atan(position.z, position.x);
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const plumeFS = /* glsl */`
  #include <logdepthbuf_pars_fragment>
  uniform float uTime, uI, uSoot, uSeed, uCore, uFade, uDiamond;
  uniform vec3 uC0, uC1, uC2;
  varying float vS; varying vec3 vN; varying vec3 vV; varying float vAng;
  ${NOISE_GLSL}
  void main(){
    #include <logdepthbuf_fragment>
    float e = abs(dot(normalize(vN), normalize(vV)));
    float core = pow(e, uCore);
    float s = vS;
    float n = fbm3(vec3(cos(vAng)*2.0 + uSeed, sin(vAng)*2.0, s*9.0 - uTime*7.0));
    float n2 = vnoise(vec3(vAng*3.0, s*30.0 - uTime*22.0, uSeed));
    vec3 col = mix(uC0, uC1, smoothstep(0.02, 0.35, s));
    col = mix(col, uC2, smoothstep(0.35, 0.95, s));
    float soot = uSoot * (1.0 - smoothstep(0.004, 0.03, s));
    float shock = 1.0 + uDiamond * smoothstep(0.55, 1.0, sin(s * 58.0)) * (1.0 - smoothstep(0.1, 0.5, s));  // shock diamonds near the nozzle
    float I = uI * smoothstep(0.0, 0.01, s) * (1.0 - smoothstep(uFade, 1.0, s)) * (0.5 + 0.9*n + 0.12*n2) * core * shock;
    I *= 1.0 - soot * 0.92;
    gl_FragColor = vec4(col * I, 1.0);
  }`;
const plumeGeo = (() => { const g = new THREE.CylinderGeometry(1, 1, 1, 28, 40, true); g.translate(0, -0.5, 0); return g; })();
/* exhaust colours by propellant: kerosene is fuel-rich and sooty (yellow-orange), hydrogen almost
 * invisible (faint blue-violet), methane clean blue-violet with a pink core, solids brilliant white-yellow */
const PLUME_C = {
  kerolox: { c0: [1.0, 0.86, 0.55], c1: [1.0, 0.52, 0.16], c2: [0.8, 0.22, 0.04], soot: 0.8, core: 1.1, diamond: 0.25, gain: 1 },
  hydrolox: { c0: [0.85, 0.85, 1.0], c1: [0.45, 0.5, 1.0], c2: [0.22, 0.2, 0.7], soot: 0, core: 1.5, diamond: 0.9, gain: 0.5 },
  methalox: { c0: [0.95, 0.75, 1.0], c1: [0.55, 0.45, 1.0], c2: [0.3, 0.25, 0.8], soot: 0, core: 1.3, diamond: 0.7, gain: 0.75 },
  solid: { c0: [1.0, 0.97, 0.88], c1: [1.0, 0.78, 0.42], c2: [0.9, 0.45, 0.16], soot: 0, core: 0.9, diamond: 0, gain: 1.5 }
};
function makePlume(kind, r0, len) {
  const C = PLUME_C[kind];
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uLen: { value: len }, uR0: { value: r0 }, uR1: { value: r0 * 1.5 }, uK: { value: 2 }, uTime: { value: 0 }, uI: { value: 0 },
      uSoot: { value: C.soot }, uSeed: { value: Math.random() * 10 }, uCore: { value: C.core }, uFade: { value: 0.25 }, uDiamond: { value: C.diamond },
      uC0: { value: new THREE.Color(...C.c0) }, uC1: { value: new THREE.Color(...C.c1) }, uC2: { value: new THREE.Color(...C.c2) }
    },
    vertexShader: plumeVS, fragmentShader: plumeFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const p = new THREE.Mesh(plumeGeo, m);
  p.frustumCulled = false; p.renderOrder = 5; p.visible = false;
  p.userData = { kind, r0, len, gain: C.gain };
  return p;
}

/* ================================================================== THE ROCKET, BUILT FROM THE DESIGN */
const shellMat = new THREE.ShaderMaterial({
  uniforms: { uC: { value: new THREE.Color(0x7cc8ff) }, uA: { value: 0 }, uT: { value: 0 } },
  vertexShader: `#include <common>
    #include <logdepthbuf_pars_vertex>
    varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = -mv.xyz; vY = position.y; gl_Position = projectionMatrix*mv;
    #include <logdepthbuf_vertex>
    }`,
  fragmentShader: `#include <logdepthbuf_pars_fragment>
    uniform vec3 uC; uniform float uA, uT; varying vec3 vN; varying vec3 vV; varying float vY;
    void main(){
      #include <logdepthbuf_fragment>
      float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
      float scan = 0.5 + 0.5*sin(vY*3.0 - uT*4.0);
      gl_FragColor = vec4(uC * (pow(f, 2.2)*1.8 + 0.12 + 0.14*scan) * uA, 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
});

function buildRocket(veh) {
  const root = new THREE.Group(); root.name = 'rocket';
  const S = veh.stages;
  const R = { root, stages: [], boosters: [], fairing: [], payload: null, payloadG: null, tower: null, H: 0, W: 1, plumes: [], shells: [] };
  let y = 0;
  S.forEach((s, i) => {
    const g = new THREE.Group(); g.name = 'stage' + i; root.add(g);
    const st = { g, i, y0: y, y1: y, engines: [], plumes: [], shell: null, fam: s.eng ? s.eng.family : null };
    const eng = s.eng, L = eng ? eng.length : 0;
    const tankBase = i === 0 ? (eng ? L * 0.62 : 0.6) : y;
    if (i === 0) st.y0 = 0;
    if (eng) {
      const P = engineParts(eng);
      const hot = MAT.bellHot.clone();
      st.hotMat = hot;
      for (const [px, pz] of s.layout.pts) {
        const eg = new THREE.Group(); eg.position.set(px, tankBase - L, pz); g.add(eg);
        const offs = P.twin ? [[-P.R * 1.02, 0], [P.R * 1.02, 0]] : [[0, 0]];
        for (const [ox, oz] of offs) {
          mesh(P.bell, hot, eg, ox, 0, oz);
          const pl = makePlume(eng.family, P.R * 0.92, Math.max(6, P.R * (eng.family === 'hydrolox' ? 16 : 24)));
          pl.position.set(ox, 0.02, oz); eg.add(pl); st.plumes.push(pl);
        }
        mesh(P.power, MAT.power, eg);
        st.engines.push(eg);
      }
      if (i === 0) { // thrust section skirt hides the powerheads
        const d = (s.dBot || s.d || eng.exitD) / 2;
        const hk = L * 0.34;
        const sk = cyl(d, d * 1.02, hk, Q.seg, true);
        mesh(sk, MAT.dark, g, 0, tankBase - hk, 0);
        const plate = new THREE.CircleGeometry(d * 0.99, Q.seg); plate.rotateX(Math.PI / 2);
        mesh(plate, MAT.dark, g, 0, tankBase - hk + 0.02, 0);
      }
    }
    // tanks
    let ty = tankBase, prevD = null;
    if (!s.tanks.length) { mesh(cyl(1.5, 1.5, 3, 16, true), MAT.ghost, g, 0, ty, 0); ty += 3; }
    s.tanks.forEach((t) => {
      if (prevD != null && Math.abs(prevD - t.d) > 0.01) {
        const ah = Math.min(4, Math.abs(prevD - t.d) * 0.7 + 0.3);
        mesh(tileUV(cyl(t.d / 2, prevD / 2, ah, Q.seg, true), Math.PI * Math.max(t.d, prevD), ah), MAT.carbon, g, 0, ty, 0);
        ty += ah;
      }
      const r = t.d / 2;
      const geo = tileUV(cyl(r, r, t.len, Q.seg, true), Math.PI * t.d, t.len);
      mesh(geo, MAT[t.fam], g, 0, ty, 0);
      // weld / roll rings at both ends of the tank and a dark band on kerosene tanks
      const ring = cyl(r * 1.006, r * 1.006, Math.min(0.35, t.len * 0.05), Q.seg, true);
      mesh(ring, t.fam === 'hydrolox' ? MAT.carbon : MAT.band, g, 0, ty, 0);
      if (t.fam === 'kerolox' && t.len > 6) mesh(cyl(r * 1.004, r * 1.004, Math.min(2.2, t.len * 0.08), Q.seg, true), MAT.band, g, 0, ty + t.len * 0.62, 0);
      ty += t.len; prevD = t.d;
    });
    if (prevD) { const cap = new THREE.CircleGeometry(prevD / 2, Q.seg); cap.rotateX(-Math.PI / 2); mesh(cap, MAT.dark, g, 0, ty, 0); }
    // interstage (drops with this stage) covers the next stage's engines
    if (i < S.length - 1) {
      const up = S[i + 1];
      const ih = interstageHeight(up);
      const dA = s.dTop || s.d || 2, dB = up.dBot || up.d || dA;
      mesh(tileUV(cyl(dB / 2 * 1.002, dA / 2 * 1.002, ih, Q.seg, true), Math.PI * Math.max(dA, dB), ih), MAT.carbon, g, 0, ty, 0);
      ty += ih;
    }
    st.y1 = ty; st.d = Math.max(s.d || 1, eng ? s.layout.need : 0);
    y = ty;
    R.stages.push(st);
  });
  if (!S.length) y = 0;
  // ---------------- payload
  const P = veh.payload, def = P.def;
  const topD = S.length ? (S[S.length - 1].dTop || S[S.length - 1].d || 3) : 3;
  const pg = new THREE.Group(); pg.name = 'payload'; pg.position.y = y; root.add(pg); R.payloadG = pg;
  let ph = 0;
  const content = new THREE.Group(); pg.add(content); R.payload = content;
  if (P.fairing) {
    const fd = P.fairing.d, fl = P.fairing.len, fr = fd / 2;
    if (fd > topD + 0.05) { const bh = (fd - topD) * 0.9 + 0.3; mesh(cyl(fr, topD / 2, bh, Q.seg, true), MAT.carbon, pg, 0, 0, 0); ph = bh; }
    else { mesh(cyl(fr, topD / 2, 0.8, Q.seg, true), MAT.carbon, pg, 0, 0, 0); ph = 0.8; }
    content.position.y = ph;
    buildPayloadShape(def, content, fr * 0.92);
    // fairing: cylinder + tangent ogive, split into two halves hinged at the base
    const cylL = fl * 0.52, ogL = fl - cylL;
    const pts = [[fr, 0], [fr, cylL]];
    const rho = (fr * fr + ogL * ogL) / (2 * fr);
    for (let k = 1; k <= 16; k++) { const yy = ogL * k / 16; pts.push([Math.sqrt(Math.max(0, rho * rho - yy * yy)) - (rho - fr), cylL + yy]); }
    pts.push([0.001, fl]);
    for (let h = 0; h < 2; h++) {
      const hg = new THREE.Group(); hg.position.set(0, ph, 0); pg.add(hg);
      const geo = tileUV(lathe(pts, Q.seg, h * Math.PI + Math.PI / 2, Math.PI), fd * Math.PI / 2, fl);
      mesh(geo, MAT.fairing, hg);
      R.fairing.push(hg);
    }
    ph += fl;
  } else if (def.shape === 'apollo') {
    // spacecraft/LM adapter (cone), service module, command module, escape tower
    const sla = 8.5; mesh(tileUV(cyl(1.96, topD / 2, sla, Q.seg, true), Math.PI * topD, sla), MAT.fairing, pg); ph = sla;
    mesh(cyl(1.96, 1.96, 7.5, Q.seg), MAT.silver, pg, 0, ph, 0); ph += 7.5;
    mesh(lathe([[1.96, 0], [1.6, 0.9], [0.9, 2.3], [0.35, 3.2], [0.001, 3.25]]), MAT.silver, pg, 0, ph, 0); ph += 3.2;
    const tw = new THREE.Group(); tw.position.y = ph; pg.add(tw); R.tower = tw;
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; const b = mesh(cyl(0.06, 0.06, 4.6, 6), MAT.towerRed, tw, Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55); b.rotation.z = Math.cos(a) * -0.09; b.rotation.x = Math.sin(a) * 0.09; }
    mesh(cyl(0.33, 0.33, 4.3, 16), MAT.fairing, tw, 0, 4.4, 0);
    mesh(lathe([[0.33, 0], [0.2, 0.9], [0.001, 1.5]], 16), MAT.towerRed, tw, 0, 8.7, 0);
    ph += 10.2;
  } else if (def.noFairing) {
    // capsule with its trunk (Dragon-class)
    const cr = Math.min(def.d, 4) / 2;
    if (Math.abs(topD / 2 - cr) > 0.05) { const ah = Math.abs(topD / 2 - cr) * 1.2 + 0.4; mesh(cyl(cr, topD / 2, ah, Q.seg, true), MAT.carbon, pg); ph = ah; }
    mesh(tileUV(cyl(cr, cr, 3.1, Q.seg, true), Math.PI * cr * 2, 3.1), MAT.fairing, pg, 0, ph, 0);
    const pv = mesh(cyl(cr * 1.004, cr * 1.004, 1.6, Q.seg, true), MAT.panel, pg, 0, ph + 0.9, 0); pv.castShadow = false;
    ph += 3.1;
    mesh(lathe([[cr, 0], [cr * 0.98, 0.4], [cr * 0.56, 3.2], [cr * 0.42, 3.9], [0.001, 4.1]]), MAT.fairing, pg, 0, ph, 0);
    mesh(cyl(cr * 1.003, cr * 1.003, 0.35, Q.seg, true), MAT.dark, pg, 0, ph, 0);
    ph += 4.1;
  }
  R.payloadTop = y + ph;
  // ---------------- strap-on boosters
  if (veh.boosters && S.length) {
    const b = veh.boosters.def, n = veh.boosters.n, br = b.diameter / 2;
    const R0 = (S[0].dBot || S[0].d || 2) / 2 + br + 0.15;
    const noseL = b.length * 0.1, nozL = b.diameter * 0.75, bodyL = b.length - noseL - nozL;
    for (let k = 0; k < n; k++) {
      const a = k / n * Math.PI * 2;
      const bg = new THREE.Group(); bg.position.set(Math.cos(a) * R0, 0, Math.sin(a) * R0); root.add(bg);
      bg.userData.dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const bell = lathe([[br * 0.8, 0], [br * 0.55, nozL * 0.5], [br * 0.38, nozL]], 20);
      mesh(bell, MAT.bell, bg);
      mesh(tileUV(cyl(br, br, bodyL, 24, true), Math.PI * b.diameter, bodyL, 6), MAT.srb, bg, 0, nozL, 0);
      mesh(cyl(br * 1.02, br * 1.05, nozL * 0.35, 24, true), MAT.dark, bg, 0, nozL * 0.7, 0);
      const nose = lathe([[br, 0], [br * 0.8, noseL * 0.45], [br * 0.35, noseL * 0.9], [0.001, noseL]], 24);
      mesh(nose, MAT.srb, bg, 0, nozL + bodyL, 0);
      for (const f of [0.18, 0.82]) { const st = mesh(new THREE.BoxGeometry(0.25, 0.25, 0.3), MAT.dark, bg, -Math.cos(a) * 0.0, nozL + bodyL * f, 0); st.scale.set(1, 1, 1); }
      const pl = makePlume('solid', br * 0.78, Math.max(20, b.diameter * 20)); pl.position.set(0, 0.02, 0); bg.add(pl);
      R.boosters.push({ g: bg, plume: pl, a });
    }
    R.W = R0 * 2 + b.diameter;
  }
  R.H = Math.max(R.payloadTop, 2);
  R.W = Math.max(R.W, ...R.stages.map(s => s.d), P.fairing ? P.fairing.d : 0, 1);
  // highlight shells (hover / selection in the stack)
  R.stages.forEach(st => {
    const h = Math.max(1, st.y1 - st.y0), r = st.d / 2 + 0.5;
    const sh = new THREE.Mesh(cyl(r, r, h, 40, true), shellMat.clone()); sh.position.y = st.y0; sh.renderOrder = 8; sh.visible = false; st.g.add(sh); st.shell = sh;
  });
  {
    const h = Math.max(1, R.payloadTop - y), r = (P.fairing ? P.fairing.d : def.d) / 2 + 0.5;
    const sh = new THREE.Mesh(cyl(r, r, h, 40, true), shellMat.clone()); sh.position.y = 0; sh.renderOrder = 8; sh.visible = false; pg.add(sh); R.payloadShell = sh;
  }
  R.boosters.forEach(bb => {
    const b = veh.boosters.def;
    const sh = new THREE.Mesh(cyl(b.diameter / 2 + 0.4, b.diameter / 2 + 0.4, b.length, 24, true), shellMat.clone()); sh.renderOrder = 8; sh.visible = false; bb.g.add(sh); bb.shell = sh;
  });
  return R;
}

/* simple payload shapes (seen after the fairing opens) */
function buildPayloadShape(def, g, rMax) {
  const s = def.shape, d = Math.min(def.d, rMax * 2), h = def.h;
  if (s === 'cube') {
    mesh(cyl(0.35, 0.45, 0.5, 12), MAT.dark, g);
    mesh(new THREE.BoxGeometry(0.1, 0.34, 0.1), MAT.silver, g, 0, 0.5, 0);
  } else if (s === 'sat') {
    const w = d * 0.62;
    mesh(cyl(w * 0.35, w * 0.45, 0.4, 16), MAT.dark, g);
    mesh(new THREE.BoxGeometry(w, h * 0.55, w), MAT.gold, g, 0, 0.4, 0);
    const pn = new THREE.BoxGeometry(w * 0.1, h * 0.36, w * 0.8);
    mesh(pn, MAT.panel, g, w * 0.58, 0.4 + h * 0.08, 0); mesh(pn, MAT.panel, g, -w * 0.58, 0.4 + h * 0.08, 0);
    mesh(lathe([[w * 0.3, 0], [w * 0.22, w * 0.1], [0.001, w * 0.16]], 16), MAT.silver, g, 0, 0.4 + h * 0.55, 0);
  } else if (s === 'scope') {
    mesh(cyl(d * 0.3, d * 0.4, 0.6, 16), MAT.dark, g);
    mesh(cyl(d * 0.46, d * 0.46, h * 0.28, 6), MAT.gold, g, 0, 0.6, 0);            // folded sunshield
    mesh(cyl(d * 0.22, d * 0.3, h * 0.45, 6), MAT.gold, g, 0, 0.6 + h * 0.28, 0);   // folded mirror wings
    mesh(cyl(0.08, 0.08, h * 0.18, 8), MAT.silver, g, 0, 0.6 + h * 0.73, 0);
  } else if (s === 'module') {
    mesh(cyl(d * 0.35, d * 0.45, 0.8, 16), MAT.dark, g);
    mesh(tileUV(cyl(d / 2, d / 2, h * 0.8, Q.seg), Math.PI * d, h * 0.8), MAT.silver, g, 0, 0.8, 0);
    mesh(lathe([[d / 2, 0], [d * 0.3, h * 0.12], [d * 0.15, h * 0.15]], Q.seg), MAT.silver, g, 0, 0.8 + h * 0.8, 0);
  } else if (s === 'aeroshell') {
    mesh(cyl(d * 0.35, d * 0.45, 0.6, 16), MAT.dark, g);
    mesh(cyl(d / 2, d / 2, 0.5, Q.seg), MAT.silver, g, 0, 0.6, 0);
    mesh(lathe([[d / 2, 0], [d * 0.38, h * 0.35], [d * 0.18, h * 0.55], [0.001, h * 0.6]], Q.seg), MAT.fairing, g, 0, 1.1, 0);
  } else if (s === 'ballast') {
    mesh(cyl(d * 0.35, d * 0.4, 0.6, 16), MAT.dark, g);
    mesh(cyl(d * 0.45, d * 0.45, h * 0.6, 8), MAT.steelGrey, g, 0, 0.6, 0);
  } else {
    mesh(cyl(d * 0.4, d * 0.4, h * 0.6, 16), MAT.silver, g);
  }
}

/* ================================================================== THE PAD */
const PAD_Y = 6;                                   // hardstand height above the surrounding ground, m
const padG = new THREE.Group(); world.add(padG);
const padDyn = new THREE.Group(); world.add(padDyn); // parts that are resized with the rocket
(function buildPad() {
  const hs = cyl(60, 72, PAD_Y, 48); mesh(hs, MAT.concrete, padG);
  const padTex = canvasTex(1024, 1024, (g, w, h) => {      // concrete slabs, expansion joints, scorching around the flame trench
    g.fillStyle = '#9a978f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,38,34' : '255,255,250'},${0.02 + rnd() * 0.05})`; const r = 2 + rnd() * 14; g.beginPath(); g.arc(rnd() * w, rnd() * h, r, 0, 6.3); g.fill(); }
    g.strokeStyle = 'rgba(50,48,44,0.35)'; g.lineWidth = 2;
    for (let x = 0; x <= w; x += w / 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); g.beginPath(); g.moveTo(0, x); g.lineTo(w, x); g.stroke(); }
    const sc = g.createRadialGradient(w * 0.62, h / 2, 10, w * 0.62, h / 2, w * 0.3);
    sc.addColorStop(0, 'rgba(25,22,20,0.75)'); sc.addColorStop(1, 'rgba(25,22,20,0)');
    g.fillStyle = sc; g.fillRect(0, 0, w, h);
    const s2 = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w * 0.12);
    s2.addColorStop(0, 'rgba(20,18,16,0.8)'); s2.addColorStop(1, 'rgba(20,18,16,0)');
    g.fillStyle = s2; g.fillRect(0, 0, w, h);
  });
  padTex.wrapS = padTex.wrapT = THREE.ClampToEdgeWrapping;
  const top = new THREE.CircleGeometry(60, 64); top.rotateX(-Math.PI / 2);
  mesh(top, new THREE.MeshStandardMaterial({ map: padTex, roughness: 0.95 }), padG, 0, PAD_Y + 0.01, 0);
  // flame trench, opening down-range
  const tr = new THREE.BoxGeometry(46, 0.4, 9); mesh(tr, MAT.dark, padG, 22, PAD_Y - 0.1, 0);
  // lightning masts
  for (const [x, z] of [[-55, -48], [52, -44], [-70, 30]]) {
    mesh(cyl(0.6, 1.0, 95, 10), MAT.steelGrey, padG, x, 0, z);
    mesh(cyl(0.05, 0.05, 12, 6), MAT.steelGrey, padG, x, 95, z);
  }
})();
let padBaseY = PAD_Y + 6;                         // nozzle-exit plane of the current rocket (set per design)
function buildPadDyn(R, veh) {
  padDyn.clear();
  const S = veh.stages;
  const L0 = S.length && S[0].eng ? S[0].eng.length : 1;
  const small = R.W < 3;
  const mountH = Math.max(small ? 2.5 : 5, L0 * 0.45 + (small ? 1.5 : 3.5));
  padBaseY = PAD_Y + mountH;
  const half = Math.max(small ? 2.2 : 5, R.W * 0.62 + (small ? 1 : 2));
  const parts = [];
  // launch mount: four pillars and a deck with an exhaust hole
  const leg = small ? 0.6 : 1.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const b = new THREE.BoxGeometry(leg, mountH, leg); b.translate(sx * (half - leg / 2), PAD_Y + mountH / 2, sz * (half - leg / 2)); parts.push(b); }
  const hole = Math.max(R.W * 0.5 + 0.5, small ? 1 : 3);
  for (const [w, dz, x, z] of [[half * 2, half - hole, 0, (half + hole) / 2], [half * 2, half - hole, 0, -(half + hole) / 2], [half - hole, hole * 2, (half + hole) / 2, 0], [half - hole, hole * 2, -(half + hole) / 2, 0]]) {
    const b = new THREE.BoxGeometry(w, 1.4, dz); b.translate(x, PAD_Y + mountH - 0.7, z); parts.push(b);
  }
  mesh(mergeGeometries(parts), MAT.steelGrey, padDyn);
  // service tower: lattice, a little taller than the rocket, behind it (north)
  const H = R.H + padBaseY + (small ? 3 : 6), tw = Math.max(small ? 3.5 : 7, Math.min(14, R.W * 0.9 + (small ? 2 : 4))), tz = -(half + tw / 2 + (small ? 1.5 : 3));
  const tp = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const c = new THREE.BoxGeometry(0.7, H, 0.7); c.translate(sx * tw / 2, H / 2, tz + sz * tw / 2); tp.push(c); }
  const lvl = Math.max(5, Math.round(H / 14)), dy = H / lvl;
  for (let k = 1; k <= lvl; k++) {
    const yy = k * dy;
    for (const sz of [-1, 1]) { const b = new THREE.BoxGeometry(tw, 0.45, 0.45); b.translate(0, yy, tz + sz * tw / 2); tp.push(b); }
    for (const sx of [-1, 1]) { const b = new THREE.BoxGeometry(0.45, 0.45, tw); b.translate(sx * tw / 2, yy, tz); tp.push(b); }
    const fl = new THREE.BoxGeometry(tw, 0.15, tw); fl.translate(0, yy - 0.3, tz); tp.push(fl);
    // X-braces on the faces
    const diag = Math.hypot(tw, dy), ang = Math.atan2(dy, tw);
    for (const sz of [-1, 1]) { const x = new THREE.BoxGeometry(diag, 0.22, 0.22); x.rotateZ((k % 2 ? 1 : -1) * ang); x.translate(0, yy - dy / 2, tz + sz * tw / 2); tp.push(x); }
    for (const sx of [-1, 1]) { const x = new THREE.BoxGeometry(0.22, 0.22, diag); x.rotateX((k % 2 ? 1 : -1) * ang); x.translate(sx * tw / 2, yy - dy / 2, tz); tp.push(x); }
  }
  mesh(mergeGeometries(tp), MAT.towerRed, padDyn);
  // crew / payload access arm near the top of the rocket
  const armY = padBaseY + R.H * 0.86, armL = -tz - tw / 2 - (R.W / 2) + 0.4;
  const arm = mesh(new THREE.BoxGeometry(2.4, 2.4, armL), MAT.steelGrey, padDyn, 0, armY, tz + tw / 2 + armL / 2);
  padDyn.userData.arm = arm; padDyn.userData.armL = armL;
  // beacon on top
  const bc = mesh(new THREE.SphereGeometry(0.5, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3020 }), padDyn, 0, H + 0.5, tz);
  bc.castShadow = false; padDyn.userData.beacon = bc;
  padDyn.userData.towerH = H;
  aimSun(H);
}

/* ================================================================== SMOKE (instanced billboards in the Earth-fixed frame) */
const smokeTex = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  let sd = 11; const r = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 30; i++) {
    const a = r() * 6.28, rr = Math.pow(r(), 0.7) * 62, x = 128 + Math.cos(a) * rr, y = 128 + Math.sin(a) * rr * 0.9, s = 24 + r() * 40;
    const gr = g.createRadialGradient(x - s * 0.25, y - s * 0.25, 0, x, y, s);
    gr.addColorStop(0, `rgba(255,255,255,${0.26 + r() * 0.2})`); gr.addColorStop(0.55, 'rgba(210,210,210,0.12)'); gr.addColorStop(1, 'rgba(150,150,150,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, s, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(c); return t;
})();
const MAX_PUFFS = Q.puffs;
const puffGeo = new THREE.InstancedBufferGeometry();
puffGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
puffGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
puffGeo.setIndex([0, 1, 2, 0, 2, 3]);
const aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 3), 3).setUsage(THREE.DynamicDrawUsage);
const aDat = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage); // size, alpha, rot, glow
puffGeo.setAttribute('iPos', aPos); puffGeo.setAttribute('iDat', aDat);
puffGeo.instanceCount = 0;
const puffMat = new THREE.ShaderMaterial({
  uniforms: { uMap: { value: smokeTex }, uLit: { value: new THREE.Color(1, 0.97, 0.92) }, uAmb: { value: new THREE.Color(0.42, 0.47, 0.56) } },
  vertexShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    attribute vec3 iPos; attribute vec4 iDat;
    varying vec2 vUv; varying float vA; varying float vGlow; varying float vShade;
    void main(){
      vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
      float c = cos(iDat.z), s = sin(iDat.z);
      vec2 q = position.xy;
      mv.xy += vec2(c*q.x - s*q.y, s*q.x + c*q.y) * iDat.x;
      gl_Position = projectionMatrix * mv;
      vUv = uv; vA = iDat.y * smoothstep(iDat.x * 0.2, iDat.x * 1.2, length(mv.xyz)); vGlow = iDat.w; vShade = 0.72 + 0.28 * q.y;
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <logdepthbuf_pars_fragment>
    uniform sampler2D uMap; uniform vec3 uLit, uAmb;
    varying vec2 vUv; varying float vA; varying float vGlow; varying float vShade;
    void main(){
      #include <logdepthbuf_fragment>
      vec4 t = texture2D(uMap, vUv);
      float a = t.a * vA;
      if (a < 0.004) discard;
      vec3 col = mix(uAmb, uLit, vShade) * (0.75 + 0.25 * t.r);
      col += vec3(1.0, 0.55, 0.2) * vGlow * 2.5;
      gl_FragColor = vec4(col, a);
    }`,
  transparent: true, depthWrite: false
});
const puffs = new THREE.Mesh(puffGeo, puffMat);
puffs.frustumCulled = false; puffs.renderOrder = 4;
world.add(puffs);
const P = [];   // particles: {x,y,z,vx,vy,vz,age,life,s0,s1,a,rot,glow}
function spawnPuff(p) { if (P.length >= MAX_PUFFS) P.shift(); P.push(p); }
function updatePuffs(dt) {
  let n = 0;
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i];
    p.age += dt;
    if (p.age > p.life) { P.splice(i, 1); continue; }
    const drag = Math.exp(-dt * (p.drag || 0.6));
    p.vx *= drag; p.vy = p.vy * drag + (p.rise || 0.4) * dt; p.vz *= drag;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
  }
  for (let i = 0; i < P.length && n < MAX_PUFFS; i++, n++) {
    const p = P[i], k = p.age / p.life;
    aPos.array[n * 3] = p.x; aPos.array[n * 3 + 1] = p.y; aPos.array[n * 3 + 2] = p.z;
    aDat.array[n * 4] = lerp(p.s0, p.s1, 1 - Math.pow(1 - k, 2.2));
    aDat.array[n * 4 + 1] = p.a * smooth(0, 0.06, k) * (1 - smooth(0.45, 1, k));
    aDat.array[n * 4 + 2] = p.rot + p.age * 0.05;
    aDat.array[n * 4 + 3] = (p.glow || 0) * Math.max(0, 1 - p.age * 3);
  }
  puffGeo.instanceCount = n;
  aPos.needsUpdate = true; aDat.needsUpdate = true;
}

/* ================================================================== STATE */
let cat = null, design = null, veh = null, an = null, R = null;
let mode = 'build';
let sel = { stage: null, edit: null, hover: null };
let exploded = false;
const undo = { list: [], i: -1 };
const planCache = new Map();
let planKey = null, planBusy = false;
let palTab = 'engines', boosterN = 2;
const hostDiv = document.body;

/* ================================================================== FLIGHT COMPUTER (web worker; main thread fallback) */
let worker = null, workerPending = null, workerBusy = false;
function initWorker(json) {
  try {
    const url = new URL('./builder-physics.js', import.meta.url).href;
    const src = `import { makeCatalogue, buildVehicle, plan } from '${url}';
      let cat = null;
      onmessage = (e) => { const m = e.data; if (m.cat) cat = makeCatalogue(m.cat);
        if (m.design) { let p = null; try { p = plan(buildVehicle(m.design, cat)); } catch (err) { p = null; }
          postMessage({ key: m.key, plan: p && { params: p.params, result: p.result, ispEff: p.ispEff, losses: p.losses, tries: p.tries } }); } };`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })), { type: 'module' });
    worker.postMessage({ cat: json });
    worker.onmessage = (e) => { workerBusy = false; onPlan(e.data.key, e.data.plan); if (workerPending) { const w = workerPending; workerPending = null; sendPlan(w.key, w.design); } };
    worker.onerror = () => { worker = null; workerBusy = false; if (planKey) requestPlan(true); };
  } catch (e) { worker = null; }
}
function sendPlan(key, d) { workerBusy = true; worker.postMessage({ key, design: d }); }
function requestPlan(force = false) {
  const key = encodeDesign(design);
  planKey = key;
  if (planCache.has(key)) { planBusy = false; return; }
  if (!veh.stages.length || veh.stages.some(s => !s.eng)) { planBusy = false; return; }
  planBusy = true;
  if (worker && !force) { if (workerBusy) workerPending = { key, design: cloneDesign(design) }; else sendPlan(key, cloneDesign(design)); }
  else setTimeout(() => { if (planKey !== key) return; let p = null; try { p = plan(buildVehicle(design, cat)); } catch (e) { p = null; } onPlan(key, p); }, 30);
}
function onPlan(key, p) {
  planCache.set(key, p);
  if (planCache.size > 60) planCache.delete(planCache.keys().next().value);
  if (key !== planKey) return;
  planBusy = false;
  an = analyse(veh, p);
  renderAnalysis(true);
  updateStackSubs();
}
function currentPlan() { return planCache.get(encodeDesign(design)) || null; }

/* ================================================================== ICONS (inline SVG) */
function engineIcon(e) {
  const c = FAM_C[e.family];
  const w = e.vacuumOnly ? 13 : 9;
  return `<svg viewBox="0 0 34 34" aria-hidden="true"><rect x="12" y="3" width="10" height="7" rx="2" fill="#3a3f48"/><rect x="14.5" y="10" width="5" height="4" fill="#555b66"/>
    <path d="M15 14 C15 20 ${17 - w} 26 ${17 - w} 31 L${17 + w} 31 C${17 + w} 26 19 20 19 14 Z" fill="url(#rbg-${e.family})" stroke="${c}" stroke-opacity=".55"/>
    <defs><linearGradient id="rbg-${e.family}" x1="0" x2="1"><stop offset="0" stop-color="#40444c"/><stop offset=".5" stop-color="#8c929c"/><stop offset="1" stop-color="#40444c"/></linearGradient></defs>
    ${(e.chambers || 1) > 1 ? `<path d="M4 31h26" stroke="${c}" stroke-width="1.5" stroke-dasharray="2 2"/>` : ''}</svg>`;
}
function tankIcon(fam) {
  const c = FAM_C[fam];
  return `<svg viewBox="0 0 34 34" aria-hidden="true"><rect x="9" y="3" width="16" height="28" rx="3" fill="${c}"/><rect x="9" y="3" width="16" height="28" rx="3" fill="url(#rbt)"/>
    <path d="M9 11h16M9 23h16" stroke="rgba(0,0,0,.25)"/><defs><linearGradient id="rbt" x1="0" x2="1"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset=".45" stop-color="#fff" stop-opacity=".25"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient></defs></svg>`;
}
function boosterIcon() {
  return `<svg viewBox="0 0 34 34" aria-hidden="true"><path d="M13 9 Q17 1 21 9 V28 H13Z" fill="#e7e4dc"/><path d="M13 9 Q17 1 21 9 V28 H13Z" fill="url(#rbt)"/><path d="M14 28 L12.5 32 H21.5 L20 28Z" fill="#555b66"/><path d="M13 12h8M13 20h8" stroke="rgba(0,0,0,.2)"/></svg>`;
}
function payloadIcon(p) {
  const s = p.shape;
  const g = '#c9a24a', w = '#e9eaee', b = '#28407a';
  const body = {
    cube: `<rect x="13" y="8" width="8" height="20" rx="1" fill="${w}"/><path d="M13 15h8M13 21h8" stroke="#667"/>`,
    sat: `<rect x="12" y="10" width="10" height="14" fill="${g}"/><rect x="2" y="13" width="9" height="8" fill="${b}"/><rect x="23" y="13" width="9" height="8" fill="${b}"/><path d="M14 10 L17 5 L20 10" fill="${w}"/>`,
    scope: `<path d="M17 3 L27 9 V21 L17 27 L7 21 V9 Z" fill="${g}"/><path d="M17 9 L22 12 V18 L17 21 L12 18 V12Z" fill="#8a6b22"/><rect x="9" y="27" width="16" height="4" fill="#9aa"/>`,
    aeroshell: `<path d="M5 20 Q17 4 29 20 Z" fill="${w}"/><rect x="6" y="20" width="22" height="5" fill="#8b6a4a"/>`,
    capsule: `<path d="M11 19 L14 6 H20 L23 19 Z" fill="${w}"/><rect x="10" y="19" width="14" height="11" fill="${w}"/><rect x="10" y="21" width="14" height="5" fill="${b}"/>`,
    module: `<rect x="10" y="6" width="14" height="24" rx="2" fill="#d9dde4"/><path d="M10 12h14M10 24h14" stroke="#889"/>`,
    apollo: `<path d="M16 2h2v7h-2z" fill="#c33"/><path d="M13 16 L16 9 H18 L21 16Z" fill="#d8dde4"/><rect x="13" y="16" width="8" height="7" fill="#b9bec6"/><path d="M13 23 L9 32 H25 L21 23Z" fill="${w}"/>`,
    ballast: `<path d="M9 30 L12 12 H22 L25 30 Z" fill="#7a808a"/><circle cx="17" cy="9" r="4" fill="none" stroke="#7a808a" stroke-width="2.5"/>`
  }[s] || '';
  return `<svg viewBox="0 0 34 34" aria-hidden="true">${body}</svg>`;
}
const partIcon = (kind, obj) => kind === 'engine' ? engineIcon(obj) : kind === 'tank' ? tankIcon(obj) : kind === 'booster' ? boosterIcon() : payloadIcon(obj);
function estMark(obj, field) { return obj.estimated && obj.estimated.includes(field) ? `<abbr class="rb-est" title="Estimate: not published or not confirmed for this edition">≈</abbr>` : ''; }
function srcList(obj) { return (obj.sources || []).map(id => cat.sources[id]).filter(Boolean).map(s => s.label).join('; '); }

/* ================================================================== PALETTE */
function renderPalette() {
  const L = $('palList');
  let h = '';
  if (palTab === 'engines') {
    for (const fam of ['kerolox', 'hydrolox', 'methalox']) {
      const P_ = cat.props[fam];
      h += `<div class="rb-fam" style="--fc:${FAM_C[fam]}"><i></i>${esc(P_.name)}</div>`;
      for (const e of Object.values(cat.engines).filter(x => x.family === fam)) {
        const sl = e.vacuumOnly ? `<span title="Vacuum engine: at sea level the exhaust would separate from its huge bell">vacuum</span>` : `<b>${nf(e.fSLN / 1000)}</b>${estMark(e, 'fSL')}`;
        h += `<button class="rb-part" data-kind="engine" data-id="${e.id}" style="--fc:${FAM_C[fam]}" title="${esc(`${e.name}: ${e.cycle} cycle. Sea level ${e.vacuumOnly ? '—' : nf(e.fSLN / 1000) + ' kN'}, vacuum ${nf(e.fVacN / 1000)} kN; Isp ${e.vacuumOnly ? '—' : Math.round(e.ispSLEff)} / ${e.ispVac} s; ${nf(e.mass)} kg; exit ${e.exitD} m. Flew on: ${e.flew}. Sources: ${srcList(e)}${e.estimated && e.estimated.length ? '. Estimated: ' + e.estimated.join(', ') : ''}`)}">
          ${engineIcon(e)}<div><div class="nm">${esc(e.name)}<i>${e.vacuumOnly ? 'VAC' : 'SL'}</i></div>
          <div class="st">${sl} / ${nf(e.fVacN / 1000)} kN · ${e.vacuumOnly ? '' : Math.round(e.ispSLEff) + estMark(e, 'ispSL') + '–'}${e.ispVac}${estMark(e, 'ispVac')} s · ${e.mass >= 1000 ? nf(e.mass / 1000, 1) + ' t' : nf(e.mass) + ' kg'}${estMark(e, 'mass')}</div>
          <div class="fl">${esc(e.flew)}</div></div></button>`;
      }
    }
  } else if (palTab === 'tanks') {
    for (const fam of ['kerolox', 'hydrolox', 'methalox']) {
      const P_ = cat.props[fam];
      h += `<div class="rb-fam" style="--fc:${FAM_C[fam]}"><i></i>${esc(P_.short)}</div><p class="rb-famwhy">${esc(P_.why)}</p>`;
      h += `<button class="rb-part" data-kind="tank" data-id="${fam}" style="--fc:${FAM_C[fam]}" title="${esc(`${P_.name}: bulk density ${Math.round(P_.bulk)} kg/m³ at a ${P_.mixture}:1 oxidizer-to-fuel ratio. Structure ${(P_.sigma * 100).toFixed(1)} % of the propellant (× size factor). ${P_.sigmaNote} Sources: ${srcList(P_)}`)}">
        ${tankIcon(fam)}<div><div class="nm">${esc(P_.name)} tank</div>
        <div class="st"><b>${nf(P_.bulk)}</b> kg/m³ · structure <b>${(P_.sigma * 100).toFixed(1)}</b> %</div>
        <div class="fl">A 3.7 × 10 m tank holds ${fmt.tonnes(0.8 * Math.PI * 1.85 * 1.85 * 10 * P_.bulk)}</div></div></button>`;
    }
    h += `<p class="rb-famwhy" style="margin-top:6px">${esc(cat.tanks.usableNote)}</p>`;
  } else if (palTab === 'boosters') {
    h += `<div class="rb-fam">Radial symmetry</div><div class="seg" id="bSym" role="group" aria-label="Number of boosters">${[2, 4, 6].map(n => `<button data-n="${n}" aria-pressed="${n === boosterN}">${n} around</button>`).join('')}</div>`;
    h += `<p class="rb-famwhy" style="margin-top:6px">Strap-on solid boosters burn alongside the first stage and drop off when empty: parallel staging. They cannot be throttled or shut down.</p>`;
    for (const b of Object.values(cat.boosters)) {
      h += `<button class="rb-part" data-kind="booster" data-id="${b.id}" style="--fc:${BOOST_C}" title="${esc(`${b.fullName}: ${nf(b.gross / 1000, 1)} t loaded, ${nf(b.prop / 1000, 1)} t propellant, burns ${b.burn} s; Isp ${b.ispSL}/${b.ispVac} s. ${b.profileNote} Sources: ${srcList(b)}`)}">
        ${boosterIcon()}<div><div class="nm">${esc(b.name)}<i>SOLID</i></div>
        <div class="st"><b>${nf(b.peakSL)}</b> kN peak · ${b.ispSL}${estMark(b, 'ispSL')}–${b.ispVac}${estMark(b, 'ispVac')} s · ${fmt.tonnes(b.gross)}</div>
        <div class="fl">${esc(b.flew)}</div></div></button>`;
    }
  } else {
    for (const p of Object.values(cat.payloads)) {
      const d = cat.dest[p.dest];
      h += `<button class="rb-part${design && design.payload.id === p.id ? ' on' : ''}" data-kind="payload" data-id="${p.id}" style="--fc:var(--sol)" title="${esc(`${p.name}. ${p.note} Sources: ${srcList(p)}`)}">
        ${payloadIcon(p)}<div><div class="nm">${esc(p.name)}</div>
        <div class="st"><b>${p.custom ? 'you choose' : fmt.tonnes(p.mass)}</b>${estMark(p, 'mass')} · to ${esc(d.short)}</div></div></button>`;
    }
  }
  L.innerHTML = h;
  const bs = $('bSym');
  if (bs) bs.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    boosterN = +b.dataset.n;
    bs.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    if (design.boosters) { const d = cloneDesign(design); d.boosters.n = boosterN; commit(d, 'boosters'); }
  });
}

/* ================================================================== DESIGN OPERATIONS */
const FAM_SHORT = { kerolox: 'RP-1', hydrolox: 'LH₂', methalox: 'CH₄' };
function stageD(d, i) { const s = d.stages[i]; return s && s.tanks.length ? s.tanks[s.tanks.length - 1].d : (d.stages[i - 1] && d.stages[i - 1].tanks.length ? d.stages[i - 1].tanks[d.stages[i - 1].tanks.length - 1].d : 3.7); }
function snapD(x) { return cat.diameters.reduce((a, b) => Math.abs(b - x) < Math.abs(a - x) ? b : a); }
/* a sensible first tank for an engine: wide enough for one engine, about 12 s of burn per metre… */
function defaultTankFor(eng, n = 1, d0 = null) {
  const need = clusterLayout(n, eng.foot).need;
  const d = d0 || cat.diameters.find(x => x * 1.12 + 0.05 >= need) || cat.diameters[cat.diameters.length - 1];
  const perM = 0.8 * Math.PI * (d / 2) ** 2 * cat.props[eng.family].bulk;
  const len = clamp(Math.round((eng.mdot * n * 150) / perM * 10) / 10, 2, 50);   // ≈ 150 s of burn
  return { fam: eng.family, d, len };
}
function targetStage(d, kind) {
  if (sel.stage != null && d.stages[sel.stage]) return sel.stage;
  if (kind === 'engine') { const k = d.stages.findIndex(s => !s.engine); if (k >= 0) return k; }
  return d.stages.length ? d.stages.length - 1 : null;
}
function applyPart(kind, id, target) {
  const d = cloneDesign(design);
  let msg = '', flashStage = null;
  if (kind === 'payload') { d.payload = { id }; if (cat.payloads[id].custom) d.payload.mass = cat.payloads[id].mass; msg = cat.payloads[id].name; }
  else if (kind === 'booster') { d.boosters = { id, n: d.boosters && d.boosters.id === id ? d.boosters.n : boosterN }; msg = `${d.boosters.n} × ${cat.boosters[id].name}`; flashStage = 0; if (!d.stages.length) d.stages.push({ tanks: [{ fam: 'kerolox', d: 3.7, len: 30 }], engine: 'merlin', n: 9 }); }
  else {
    let si = target && target.type === 'stage' ? target.i : null;
    let insertAt = target && target.type === 'new' ? target.i : null;
    if (si == null && insertAt == null) { si = targetStage(d, kind); if (si == null) insertAt = 0; }
    if (insertAt != null) {
      const dd = stageD(d, Math.max(0, insertAt - 1));
      const st = kind === 'engine' ? { tanks: [defaultTankFor(cat.engines[id], 1, insertAt > 0 ? dd : null)], engine: id, n: 1 } : { tanks: [{ fam: id, d: dd, len: 3 * dd }], engine: null, n: 0 };
      d.stages.splice(insertAt, 0, st);
      si = insertAt; msg = `New stage ${insertAt + 1}`;
    } else if (kind === 'engine') {
      const s = d.stages[si], e = cat.engines[id];
      s.engine = id; s.n = s.n || 1;
      if (!s.tanks.length) s.tanks.push(defaultTankFor(e, s.n));
      msg = `${s.n} × ${e.name} on stage ${si + 1}`;
    } else {
      const s = d.stages[si], dd = stageD(d, si);
      s.tanks.push({ fam: id, d: dd, len: Math.round(Math.min(12, 3 * dd) * 10) / 10 });
      msg = `${cat.props[id].short} tank on stage ${si + 1}`;
    }
    flashStage = si; sel.stage = si;
  }
  commit(d, 'part', flashStage);
  toast(msg);
}
function commit(d, why = '', flashStage = null) {
  design = d;
  undo.list = undo.list.slice(0, undo.i + 1); undo.list.push(JSON.stringify(d)); undo.i = undo.list.length - 1;
  if (undo.list.length > 200) { undo.list.shift(); undo.i--; }
  designChanged({ flashStage });
}
function softUpdate(d) { design = d; designChanged({ soft: true }); }
/* a slider was released: remember the state without re-rendering the editor under the pointer */
function recordHistory() {
  const j = JSON.stringify(design);
  if (undo.list[undo.i] === j) return;
  undo.list = undo.list.slice(0, undo.i + 1); undo.list.push(j); undo.i = undo.list.length - 1;
  $('undoBtn').disabled = undo.i <= 0; $('redoBtn').disabled = true;
}
function doUndo(dir) {
  const j = undo.i + dir;
  if (j < 0 || j >= undo.list.length) return;
  undo.i = j; design = JSON.parse(undo.list[j]);
  if (sel.stage != null && sel.stage >= design.stages.length) sel.stage = null;
  sel.edit = null;
  designChanged({});
}
function loadDesign(d, pushHist = true) {
  sel = { stage: null, edit: null, hover: null };
  if (pushHist) commit(d); else { design = d; undo.list = [JSON.stringify(d)]; undo.i = 0; designChanged({}); }
}
let hashTimer = 0;
function writeHash() { clearTimeout(hashTimer); hashTimer = setTimeout(() => { try { history.replaceState(null, '', '#' + encodeDesign(design)); } catch (e) { /* file:// */ } }, 150); }

let rebuildRaf = 0, lastSig = null;
function designChanged({ soft = false, flashStage = null } = {}) {
  veh = buildVehicle(design, cat);
  an = analyse(veh, currentPlan());
  requestPlan();
  if (!soft) renderStack(flashStage); else updateStackSubs();
  renderAnalysis();
  writeHash();
  $('undoBtn').disabled = undo.i <= 0; $('redoBtn').disabled = undo.i >= undo.list.length - 1;
  document.querySelectorAll('.rb-part[data-kind="payload"]').forEach(b => b.classList.toggle('on', b.dataset.id === design.payload.id));
  cancelAnimationFrame(rebuildRaf);
  if (!soft) { tagEls = []; $('tags').innerHTML = ''; }
  rebuildRaf = requestAnimationFrame(() => rebuild3D(flashStage));
}

/* ================================================================== STACK (top of the rocket first) */
function stageColor(i) { return STAGE_C[i % STAGE_C.length]; }
function tankLabel(t) { return `${FAM_SHORT[t.fam]} ${t.d} × ${fmt.f1(t.len)} m`; }
function renderStack(flashStage = null) {
  const S = design.stages, L = $('stack');
  const pd = cat.payloads[design.payload.id];
  let h = '';
  // payload
  const pm = veh.payload;
  h += `<div class="rb-card payload${sel.edit && sel.edit.type === 'payload' ? ' sel' : ''}" data-drop="payload">
    <div class="rb-card-h" data-edit="payload"><span class="t">Payload</span><span class="sub"><b>${fmt.tonnes(pm.mass)}</b> · to ${esc(cat.dest[pd.dest].short)}</span></div>
    <div class="rb-chips"><button class="rb-chip" data-edit="payload" aria-expanded="${sel.edit && sel.edit.type === 'payload'}" style="--fc:var(--sol)"><i></i>${esc(pd.name)}</button>
    ${pm.fairing ? `<span class="rb-chip empty" title="Chosen automatically: the smallest fairing that fits the payload and the top stage. ${esc(pm.fairing.note || '')}"><i style="background:#fff"></i>${esc(pm.fairing.label)} · ${fmt.tonnes(pm.fairing.mass)}</span>` : ''}
    ${pm.tower ? `<span class="rb-chip empty"><i style="background:#c33"></i>escape tower · ${fmt.tonnes(pm.tower)}</span>` : ''}</div>
    ${sel.edit && sel.edit.type === 'payload' ? editorHTML(sel.edit) : ''}</div>`;
  h += `<div class="rb-dz" data-drop="new:${S.length}">＋ new stage on top</div>`;
  if (!S.length) h += `<p class="rb-empty-hint">No stages yet. Drag an engine or a tank here, or load a preset.</p>`;
  for (let i = S.length - 1; i >= 0; i--) {
    const s = S[i], vs = veh.stages[i], st = an.stages[i];
    const e = s.engine ? cat.engines[s.engine] : null;
    const isSel = sel.stage === i;
    h += `<div class="rb-card${isSel ? ' sel' : ''}${flashStage === i ? ' flash' : ''}" data-drop="stage:${i}" data-stage="${i}" style="--sc:${stageColor(i)}">
      <div class="rb-card-h" data-act="select" data-stage="${i}" tabindex="0" role="button" aria-pressed="${isSel}"><span class="t">${S.length === 1 ? 'Single stage' : 'Stage ' + (i + 1)}</span>
        <span class="sub" data-sub="${i}">${stageSub(i)}</span>
        <span class="rb-mini"><button data-act="up" data-stage="${i}" ${i === S.length - 1 ? 'disabled' : ''} title="Move up" aria-label="Move stage ${i + 1} up">↑</button><button data-act="down" data-stage="${i}" ${i === 0 ? 'disabled' : ''} title="Move down" aria-label="Move stage ${i + 1} down">↓</button><button data-act="dup" data-stage="${i}" title="Duplicate" aria-label="Duplicate stage ${i + 1}">⧉</button><button data-act="del" data-stage="${i}" title="Remove" aria-label="Remove stage ${i + 1}">✕</button></span></div>
      <div class="rb-chips">`;
    for (let k = s.tanks.length - 1; k >= 0; k--) {
      const t = s.tanks[k], ed = sel.edit && sel.edit.type === 'tank' && sel.edit.stage === i && sel.edit.k === k;
      const bad = e && t.fam !== e.family;
      h += `<button class="rb-chip${bad ? ' bad' : ''}" data-edit="tank:${i}:${k}" aria-expanded="${!!ed}" style="--fc:${FAM_C[t.fam]}" title="${esc(`${fmt.tonnes(0.8 * Math.PI * (t.d / 2) ** 2 * t.len * cat.props[t.fam].bulk)} of propellant`)}"><i></i>${tankLabel(t)}</button>`;
    }
    if (!s.tanks.length) h += `<span class="rb-chip empty"><i></i>drop a tank</span>`;
    if (e) { const ed = sel.edit && sel.edit.type === 'engine' && sel.edit.stage === i; h += `<button class="rb-chip${vs.fits ? '' : ' bad'}" data-edit="engine:${i}" aria-expanded="${!!ed}" style="--fc:${FAM_C[e.family]}"><i></i>${s.n} × ${esc(e.name)}</button>`; }
    else h += `<span class="rb-chip empty"><i></i>drop an engine</span>`;
    if (i === 0 && design.boosters) { const b = cat.boosters[design.boosters.id], ed = sel.edit && sel.edit.type === 'boosters'; h += `<button class="rb-chip" data-edit="boosters" aria-expanded="${!!ed}" style="--fc:${BOOST_C}"><i></i>＋ ${design.boosters.n} × ${esc(b.name)}</button>`; }
    h += `</div>`;
    if (sel.edit && sel.edit.stage === i && sel.edit.type !== 'payload') h += editorHTML(sel.edit);
    if (i === 0 && sel.edit && sel.edit.type === 'boosters') h += editorHTML(sel.edit);
    h += `</div>`;
    h += `<div class="rb-dz" data-drop="new:${i}">＋ new stage ${i === 0 ? 'at the bottom' : 'here'}</div>`;
  }
  h += `<button class="rb-add" id="addStage">＋ Add a stage on top</button>`;
  L.innerHTML = h;
  L.querySelectorAll('input[type="range"]').forEach(paintRange);
}
function stageSub(i) {
  const st = an.stages[i];
  if (!st || !veh.stages[i].eng) return '';
  const twrBad = i === 0 ? st.twr < 1 : st.twr < 0.25;
  return `<span title="Δv in km/s · thrust-to-weight ratio">Δv <b>${fmt.kms(st.dv)}</b> · TWR <b style="${twrBad ? 'color:var(--plasma)' : ''}">${fmt.f2(st.twr)}</b></span>`;
}
function updateStackSubs() {
  document.querySelectorAll('[data-sub]').forEach(el => { el.innerHTML = stageSub(+el.dataset.sub); });
  // chip labels that depend on sliders
  document.querySelectorAll('.rb-chip[data-edit^="tank:"]').forEach(el => {
    const [, i, k] = el.dataset.edit.split(':').map(Number); const t = design.stages[i] && design.stages[i].tanks[k];
    if (t) el.lastChild.textContent = tankLabel(t);
  });
  const po = document.querySelector('.rb-card.payload .sub');
  if (po) po.innerHTML = `<b>${fmt.tonnes(veh.payload.mass)}</b> · to ${esc(cat.dest[veh.payload.dest].short)}`;
  const ed = document.querySelector('.rb-editor [data-live]');
  if (ed) ed.innerHTML = editorLive(sel.edit);
}
function paintRange(r) { const min = +r.min || 0, max = +r.max || 100; r.style.setProperty('--fill', ((r.value - min) / (max - min) * 100) + '%'); }
function lenToSlider(len) { return Math.round(Math.log(len / 0.8) / Math.log(90 / 0.8) * 1000); }
function sliderToLen(v) { return Math.round(0.8 * Math.pow(90 / 0.8, v / 1000) * 10) / 10; }
function editorLive(ed) {
  if (!ed) return '';
  if (ed.type === 'tank') {
    const t = design.stages[ed.stage] && design.stages[ed.stage].tanks[ed.k]; if (!t) return '';
    const p = 0.8 * Math.PI * (t.d / 2) ** 2 * t.len * cat.props[t.fam].bulk, dry = cat.props[t.fam].sigma * (1 + cat.tanks.sizePenalty / t.d) * p;
    return `Holds <b>${fmt.tonnes(p)}</b> of propellant; the tank itself weighs <b>${fmt.tonnes(dry)}</b> (${(dry / p * 100).toFixed(1)} %).`;
  }
  if (ed.type === 'engine') {
    const s = veh.stages[ed.stage]; if (!s || !s.eng) return '';
    return `${s.n} × ${esc(s.eng.name)}: <b>${nf(s.fSL / 1000)}</b> kN at sea level, <b>${nf(s.fVac / 1000)}</b> kN in vacuum, ${fmt.tonnes(s.engMass)}. Cluster needs <b>${fmt.f1(s.layout.need)} m</b> across; the stage is ${fmt.f1(s.dBot)} m ${s.fits ? '✓' : '✗ (too wide)'}.`;
  }
  if (ed.type === 'payload') return `${esc(cat.payloads[design.payload.id].note)}`;
  if (ed.type === 'boosters') { const B = veh.boosters; return B ? `${B.n} × ${fmt.tonnes(B.def.gross)} loaded, ${fmt.tonnes(B.n * B.def.dry)} of empty casings dropped after ${B.def.burn} s.` : ''; }
  return '';
}
function editorHTML(ed) {
  let h = `<div class="rb-editor" data-editor="${ed.type}">`;
  if (ed.type === 'tank') {
    const t = design.stages[ed.stage].tanks[ed.k];
    h += `<div class="seg" data-f="fam" role="group" aria-label="Propellant">${['kerolox', 'hydrolox', 'methalox'].map(f => `<button data-v="${f}" aria-pressed="${t.fam === f}">${cat.props[f].short}</button>`).join('')}</div>
      <label class="field"><span class="lbl">Diameter <output>${t.d} m</output></span><select data-f="d">${cat.raw.tanks.diameters.map(x => `<option value="${x.d}" ${x.d === t.d ? 'selected' : ''}>${x.label} · ${esc(x.like)}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Length <output data-o="len">${fmt.f1(t.len)} m</output></span><input type="range" data-f="len" min="0" max="1000" step="1" value="${lenToSlider(t.len)}" aria-label="Tank length"></label>
      <p class="hint" data-live>${editorLive(ed)}</p>
      <div class="row"><button class="btn small rb-del" data-act="deltank">Remove tank</button></div>`;
  } else if (ed.type === 'engine') {
    const s = design.stages[ed.stage];
    h += `<label class="field"><span class="lbl">Engine</span><select data-f="engine">${['kerolox', 'hydrolox', 'methalox'].map(f => `<optgroup label="${esc(cat.props[f].name)}">${Object.values(cat.engines).filter(e => e.family === f).map(e => `<option value="${e.id}" ${e.id === s.engine ? 'selected' : ''}>${esc(e.name)}${e.vacuumOnly ? ' (vacuum)' : ''}</option>`).join('')}</optgroup>`).join('')}</select></label>
      <div class="row"><span class="lbl mono" style="font-size:.78rem;color:var(--muted)">How many</span><span class="rb-step"><button data-act="n-" aria-label="Fewer engines">−</button><output>${s.n}</output><button data-act="n+" aria-label="More engines">＋</button></span></div>
      <p class="hint" data-live>${editorLive(ed)}</p>
      <div class="row"><button class="btn small rb-del" data-act="deleng">Remove engine</button></div>`;
  } else if (ed.type === 'boosters') {
    const b = design.boosters;
    h += `<label class="field"><span class="lbl">Booster</span><select data-f="bid">${Object.values(cat.boosters).map(x => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.fullName)}</option>`).join('')}</select></label>
      <div class="seg" data-f="bn" role="group" aria-label="Boosters around the first stage">${[2, 4, 6].map(n => `<button data-v="${n}" aria-pressed="${b.n === n}">${n} around</button>`).join('')}</div>
      <p class="hint" data-live>${editorLive(ed)}</p>
      <div class="row"><button class="btn small rb-del" data-act="delboost">Remove boosters</button></div>`;
  } else if (ed.type === 'payload') {
    const p = design.payload, def = cat.payloads[p.id];
    h += `<label class="field"><span class="lbl">Payload</span><select data-f="pid">${Object.values(cat.payloads).map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.name)}${x.custom ? '' : ' · ' + fmt.tonnes(x.mass)}</option>`).join('')}</select></label>
      ${def.custom ? `<label class="field"><span class="lbl">Mass <output data-o="pm">${fmt.tonnes(p.mass)}</output></span><input type="range" data-f="pm" min="0" max="200" step="0.5" value="${(p.mass || 0) / 1000}" aria-label="Payload mass in tonnes"></label>` : ''}
      <p class="hint" data-live>${editorLive(ed)}</p>`;
  }
  return h + `</div>`;
}
function parseEdit(s) {
  if (s === 'payload') return { type: 'payload' };
  if (s === 'boosters') return { type: 'boosters', stage: 0 };
  const [type, i, k] = s.split(':');
  return { type, stage: +i, k: k != null ? +k : undefined };
}
function sameEdit(a, b) { return a && b && a.type === b.type && a.stage === b.stage && a.k === b.k; }
function stackClick(e) {
  if (justDragged) return;
  const t = e.target;
  if (t.closest('#addStage')) { applyPart('tank', 'kerolox', { type: 'new', i: design.stages.length }); return; }
  const edBtn = t.closest('[data-edit]');
  const act = t.closest('[data-act]');
  if (act && act.dataset.act !== 'select') {
    const a = act.dataset.act, i = +act.dataset.stage, d = cloneDesign(design);
    if (a === 'up' && i < d.stages.length - 1) { [d.stages[i], d.stages[i + 1]] = [d.stages[i + 1], d.stages[i]]; sel.stage = i + 1; sel.edit = null; commit(d, '', i + 1); }
    else if (a === 'down' && i > 0) { [d.stages[i], d.stages[i - 1]] = [d.stages[i - 1], d.stages[i]]; sel.stage = i - 1; sel.edit = null; commit(d, '', i - 1); }
    else if (a === 'dup') { d.stages.splice(i + 1, 0, cloneDesign(d.stages[i])); sel.stage = i + 1; commit(d, '', i + 1); toast('Stage duplicated'); }
    else if (a === 'del') { d.stages.splice(i, 1); sel.stage = null; sel.edit = null; commit(d); toast(`Stage ${i + 1} removed`); }
    else if (a === 'n-' || a === 'n+') { const s = d.stages[sel.edit.stage]; s.n = clamp(s.n + (a === 'n+' ? 1 : -1), 1, 60); commit(d); refreshEditor(); }
    else if (a === 'deltank') { d.stages[sel.edit.stage].tanks.splice(sel.edit.k, 1); sel.edit = null; commit(d); }
    else if (a === 'deleng') { d.stages[sel.edit.stage].engine = null; d.stages[sel.edit.stage].n = 0; sel.edit = null; commit(d); }
    else if (a === 'delboost') { d.boosters = null; sel.edit = null; commit(d); }
    return;
  }
  if (edBtn && !t.closest('.rb-editor')) {
    const ed = parseEdit(edBtn.dataset.edit);
    sel.edit = sameEdit(sel.edit, ed) ? null : ed;
    if (ed.stage != null) sel.stage = ed.stage;
    renderStack(); highlight3D();
    return;
  }
  const head = t.closest('[data-act="select"]');
  if (head) { const i = +head.dataset.stage; sel.stage = sel.stage === i ? null : i; if (sel.edit && sel.edit.stage !== sel.stage) sel.edit = null; renderStack(); renderStageMeters(); highlight3D(); renderEq(); }
}
function refreshEditor() {
  const card = document.querySelector('.rb-editor');
  if (!card || !sel.edit) return;
  const tmp = document.createElement('div'); tmp.innerHTML = editorHTML(sel.edit);
  card.replaceWith(tmp.firstChild);
  document.querySelectorAll('.rb-editor input[type="range"]').forEach(paintRange);
}
function stackInput(e, final) {
  const f = e.target.closest('[data-f]'); if (!f || !sel.edit) return;
  const key = f.dataset.f, ed = sel.edit;
  const d = cloneDesign(design);
  if (key === 'len') { const t = d.stages[ed.stage].tanks[ed.k]; t.len = sliderToLen(+e.target.value); paintRange(e.target); const o = f.closest('.field').querySelector('output'); if (o) o.textContent = fmt.f1(t.len) + ' m'; }
  else if (key === 'd') { d.stages[ed.stage].tanks[ed.k].d = +e.target.value; final = true; }
  else if (key === 'engine') { d.stages[ed.stage].engine = e.target.value; final = true; }
  else if (key === 'bid') { d.boosters.id = e.target.value; final = true; }
  else if (key === 'pid') { d.payload = { id: e.target.value }; if (cat.payloads[e.target.value].custom) d.payload.mass = cat.payloads[e.target.value].mass; final = true; }
  else if (key === 'pm') { d.payload.mass = +e.target.value * 1000; paintRange(e.target); const o = f.closest('.field').querySelector('output'); if (o) o.textContent = fmt.tonnes(d.payload.mass); }
  else return;
  if (final) { commit(d); if (key === 'pid') { renderStack(); } else refreshEditor(); } else softUpdate(d);
}
function stackSeg(e) {
  const b = e.target.closest('.rb-editor .seg button'); if (!b || !sel.edit) return;
  const key = b.parentNode.dataset.f, d = cloneDesign(design);
  if (key === 'fam') d.stages[sel.edit.stage].tanks[sel.edit.k].fam = b.dataset.v;
  else if (key === 'bn') { d.boosters.n = +b.dataset.v; boosterN = d.boosters.n; }
  else return;
  e.stopPropagation();
  commit(d); renderStack();
}

/* ================================================================== DRAG AND DROP (pointer events: mouse and pen drag, touch taps) */
let drag = null, justDragged = false;
function dropTargetAt(x, y) {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const t = el.closest('[data-drop]');
  if (t) return t;
  if (el === renderer.domElement) return renderer.domElement;
  return null;
}
function accepts(kind, el) {
  if (!el) return false;
  if (el === renderer.domElement) return true;
  const d = el.dataset.drop;
  if (kind === 'payload') return true;
  if (kind === 'booster') return true;
  return d.startsWith('stage:') || d.startsWith('new:');
}
function onPalDown(e) {
  const item = e.target.closest('.rb-part');
  if (!item || e.button !== 0 || e.pointerType === 'touch') return;
  drag = { item, kind: item.dataset.kind, id: item.dataset.id, x: e.clientX, y: e.clientY, on: false, over: null };
}
function onMove(e) {
  if (!drag) return;
  if (!drag.on) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 6) return;
    drag.on = true; hostDiv.classList.add('rb-dragging'); drag.item.classList.add('dragging');
    const g = $('ghost');
    const obj = drag.kind === 'engine' ? cat.engines[drag.id] : drag.kind === 'tank' ? drag.id : drag.kind === 'payload' ? cat.payloads[drag.id] : null;
    g.innerHTML = partIcon(drag.kind, obj) + esc(drag.item.querySelector('.nm').firstChild.textContent);
    g.classList.add('on');
    if (isPhone() || innerWidth <= 1320) { hostDiv.dataset.tab = 'stack'; syncTabs(); }
  }
  const g = $('ghost'); g.style.transform = `translate(${e.clientX + 12}px, ${e.clientY + 10}px)`;
  const t = dropTargetAt(e.clientX, e.clientY);
  const ok = accepts(drag.kind, t) ? t : null;
  if (drag.over !== ok) { if (drag.over && drag.over.classList) drag.over.classList.remove('drop-ok'); drag.over = ok; if (ok && ok.classList && ok !== renderer.domElement) ok.classList.add('drop-ok'); }
}
function onUp(e) {
  if (!drag) return;
  const dd = drag; drag = null;
  if (!dd.on) return;
  hostDiv.classList.remove('rb-dragging'); dd.item.classList.remove('dragging'); $('ghost').classList.remove('on');
  if (dd.over && dd.over.classList) dd.over.classList.remove('drop-ok');
  justDragged = true; setTimeout(() => { justDragged = false; }, 60);
  const t = dd.over;
  if (!t) return;
  let target = null;
  if (t !== renderer.domElement) {
    const d = t.dataset.drop;
    if (d.startsWith('stage:')) target = { type: 'stage', i: +d.slice(6) };
    else if (d.startsWith('new:')) target = { type: 'new', i: +d.slice(4) };
  }
  applyPart(dd.kind, dd.id, target);
}
function onPalClick(e) {
  if (justDragged) return;
  const item = e.target.closest('.rb-part'); if (!item) return;
  applyPart(item.dataset.kind, item.dataset.id, null);
  if (isPhone()) { /* stay on the parts tab so several parts can be added; the toast confirms */ }
}

/* ================================================================== ANALYSIS PANEL */
const ICON = {
  ok: '<svg viewBox="0 0 20 20"><path d="m4 10.5 4 4 8-9" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  fail: '<svg viewBox="0 0 20 20"><path d="M5 5l10 10M15 5 5 15" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  partial: '<svg viewBox="0 0 20 20"><path d="M10 4v7M10 15v.5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>',
  empty: '<svg viewBox="0 0 20 20"><path d="M10 4v12M4 10h12" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
};
let lastIssueKeys = new Set();
function renderAnalysis(fromPlan = false) {
  renderVerdict(); renderDvMap(); renderStageMeters(); renderIssues(fromPlan); renderMass(); renderNums(); renderEq(); renderDims();
}
function flightLine() {
  const p = currentPlan();
  if (!veh.stages.length || veh.stages.some(s => !s.eng)) return `<div class="fc"><span class="dot"></span>Flight check: waiting for a complete rocket</div>`;
  if (!p) return `<div class="fc busy"><span class="dot"></span>Flight check: the flight computer is flying it…</div>`;
  const r = p.result;
  const txt = r.type === 'orbit' ? `orbit ${nf(r.apo / 1000)} × ${nf(r.peri / 1000)} km, ${fmt.kms(r.dvLeft)} km/s left`
    : r.type === 'pad' ? 'never leaves the pad'
    : r.type === 'suborbital' ? `peaks at ${nf(r.apo / 1000)} km and falls back`
    : r.type === 'crash' ? `falls back and crashes (top speed ${fmt.kms(r.vMax)} km/s)` : `tops out at ${nf(r.apo / 1000)} km, below space`;
  return `<div class="fc ${r.type === 'orbit' ? 'ok' : 'bad'}"><span class="dot"></span>Flight check: ${txt}</div>`;
}
function renderVerdict() {
  const v = an.verdict;
  const cls = v.type === 'orbit' ? 'ok' : v.type === 'partial' ? 'partial' : v.type === 'empty' ? 'empty' : 'fail';
  const el = $('verdict');
  el.className = 'rb-verdict ' + cls;
  el.innerHTML = `<div class="ic">${ICON[cls]}</div><h3>${esc(v.title)}</h3><p>${esc(v.text)}</p>${flightLine()}`;
  const mv = $('miniVerdict');
  if (mv) { mv.style.setProperty('--vc', `var(--${cls === 'ok' ? 'aurora' : cls === 'partial' ? 'sol' : cls === 'fail' ? 'plasma' : 'muted'})`); mv.innerHTML = `<b>${esc(v.title)}</b><span>${esc(v.text)}</span>`; }
  $('launchBtn').classList.toggle('pulse', cls === 'ok' || cls === 'partial');
}
function renderDvMap() {
  const el = $('dvmap');
  const ph = an.phases, dv = an.dv;
  const maxDv = Math.max(14000, Math.ceil((dv + 600) / 1000) * 1000);
  const pc = (v) => (v / maxDv * 100).toFixed(3) + '%';
  let segs = '', x = 0;
  ph.forEach((p) => {
    const w = p.dv, c = p.boosters ? BOOST_C : stageColor(p.stage);
    const lab = (p.boosters ? 'B+' : '') + (veh.stages.length === 1 ? 'S' : 'S' + (p.stage + 1));
    segs += `<div class="rb-dvseg${p.boosters ? ' b' : ''}" style="left:${pc(x)};width:${pc(w)};--c:${c}" title="${esc(`${lab}: ${fmt.kms(w)} km/s`)}">${w / maxDv > 0.075 ? `<span>${lab} ${fmt.kms(w)}</span>` : ''}</div>`;
    x += w;
  });
  const D = cat.dest, goal = an.dest;
  const marks = [['leo', D.leo.dv, false], ['gto', D.gto.dv + D.gto.extra, true], [goal === 'l2' ? 'l2' : 'moon', D.moon.dv + D.moon.extra, false], ['mars', D.mars.dv + D.mars.extra, true]];
  let mk = '';
  for (const [k, v, lo] of marks) {
    const isGoal = k === goal || (k === 'moon' && goal === 'moon');
    mk += `<div class="rb-dvmark${isGoal ? ' goal' : ''}${dv >= v ? ' hit' : ''}${lo ? ' lo' : ''}" style="left:${pc(v)}"><b>${D[k].short}<small>${fmt.kms(v)}</small></b></div>`;
  }
  const need = an.need;
  const legend = [...new Set(ph.map(p => p.boosters ? 'B' : p.stage))].map(k => k === 'B' ? `<span><i style="--c:${BOOST_C}"></i>boosters + stage 1</span>` : `<span><i style="--c:${stageColor(k)}"></i>stage ${k + 1}</span>`).join('');
  if (!el.querySelector('.rb-dvtrack')) el.innerHTML = `<div class="rb-dvwrap"><div class="rb-dvtrack"></div><div class="rb-dvmarks"></div></div><div class="rb-dvscale"></div><div class="rb-dvsum"></div><div class="rb-dvlegend"></div><p class="rb-dvnote"></p>`;
  // keep existing segment elements so widths animate
  const tr = el.querySelector('.rb-dvtrack');
  const tmp = document.createElement('div'); tmp.innerHTML = segs;
  const olds = [...tr.children], news = [...tmp.children];
  news.forEach((n, i) => { if (olds[i]) { olds[i].className = n.className; olds[i].setAttribute('style', n.getAttribute('style')); olds[i].title = n.title; olds[i].innerHTML = n.innerHTML; } else { n.classList.add('grow'); tr.appendChild(n); } });
  olds.slice(news.length).forEach(o => o.remove());
  el.querySelector('.rb-dvmarks').innerHTML = mk;
  el.querySelector('.rb-dvscale').innerHTML = `<span>0</span><span>${maxDv / 2000} km/s</span><span>${maxDv / 1000} km/s</span>`;
  el.querySelector('.rb-dvsum').innerHTML = `<div>Your rocket<br><b>${fmt.kms(dv)}</b> km/s</div><div class="need">${esc(an.destInfo.short)} needs<br><b style="color:${dv >= need ? 'var(--aurora)' : 'var(--plasma)'}">${fmt.kms(need)}</b> km/s</div>`;
  el.querySelector('.rb-dvlegend').innerHTML = legend;
  el.querySelector('.rb-dvnote').innerHTML = `Orbit needs about ${fmt.kms(an.needLEO)} km/s: 7.8 km/s of speed plus 1.5–2 km/s lost to gravity and drag on the way up. Beyond orbit (from low Earth orbit): +2.44 km/s to a geostationary transfer orbit (GTO), +3.2 to the Moon, +3.6 to Mars (Wikipedia, "Delta-v budget").`;
}
function meter(label, val, pct, inner, c) {
  return `<div class="rb-meter"><div class="l"><span>${label}</span><b>${val}</b></div><div class="bar" style="--c:${c}">${inner}${pct != null ? `<div class="fill" style="width:${clamp(pct, 0, 100)}%"></div>` : ''}</div></div>`;
}
function renderStageMeters() {
  const el = $('stageMeters');
  if (!veh.stages.length) { el.innerHTML = '<p class="rb-p">No stages yet.</p>'; return; }
  let h = '';
  veh.stages.forEach((s, i) => {
    const st = an.stages[i], c = stageColor(i);
    const e = s.eng;
    const twrMax = 3, lo = i === 0 ? 1 : 0.25, wa = i === 0 ? 1.2 : 0.5;
    const twrBar = `<div class="zone" style="left:0;width:${lo / twrMax * 100}%"></div><div class="zone w" style="left:${lo / twrMax * 100}%;width:${(wa - lo) / twrMax * 100}%"></div><div class="tick" style="left:${1 / twrMax * 100}%"></div>`;
    const twrC = st.twr < lo ? 'var(--plasma)' : st.twr < wa ? 'var(--sol)' : 'var(--aurora)';
    const dvMax = Math.max(st.dvVac, 1) * 1.04;
    const range = `<div class="range" style="left:${st.dvSL / dvMax * 100}%;width:${Math.max(0.5, (st.dvVac - st.dvSL) / dvMax * 100)}%"></div><div class="pin" style="left:calc(${st.dv / dvMax * 100}% - 1.5px)"></div>`;
    const mr = st.mf > 0 ? st.m0 / st.mf : 0;
    const propF = st.m0 > 0 ? (st.m0 - st.mf) / st.m0 : 0;
    h += `<div class="rb-sm${sel.stage === i ? ' sel' : ''}" data-stage="${i}" style="--sc:${c}">
      <div class="rb-sm-h"><span class="t">${veh.stages.length === 1 ? 'Stage' : 'S' + (i + 1)}</span><span class="e">${e ? `${s.n} × ${esc(e.name)} · ${esc(cat.props[e.family].short)}` : 'no engine'}${i === 0 && veh.boosters ? ` + ${veh.boosters.n} boosters` : ''}</span><span class="dv">${fmt.kms(st.dv)}<small>km/s</small></span></div>
      <div class="rb-sm-m">wet <b>${fmt.tonnes(s.wet)}</b> · dry <b>${fmt.tonnes(s.dry)}</b> · propellant ${fmt.tonnes(s.prop)}${i === 0 && veh.boosters ? ` · boosters ${fmt.tonnes(veh.boosters.n * veh.boosters.def.gross)}` : ''}</div>
      <div class="rb-sm-g">
        ${meter(i === 0 ? 'Thrust/weight at liftoff' : 'Thrust/weight at ignition', fmt.f2(st.twr), st.twr / twrMax * 100, twrBar, twrC)}
        ${meter('Burn time', st.burn ? Math.round(st.burn) + ' s' : '—', st.burn / 600 * 100, '', c)}
        ${i === 0 ? meter(`Δv sea level → vacuum${st.measured ? '' : ' (est.)'}`, `${fmt.kms(st.dvSL)}–${fmt.kms(st.dvVac)}`, null, range, c) : meter('Exhaust (vacuum I<sub>sp</sub>)', `${Math.round(st.ispVac)} s`, st.ispVac / 480 * 100, '', c)}
        ${meter('Mass ratio m₀/m<sub>f</sub>', mr ? fmt.f2(mr) : '—', null, `<div class="bar mr" style="height:100%"><i style="width:${propF * 100}%;background:${c}"></i><i style="width:${(1 - propF) * 100}%;background:rgba(255,255,255,.18)"></i></div>`, c)}
      </div></div>`;
  });
  el.innerHTML = h;
}
function renderIssues(fromPlan) {
  const el = $('issues');
  const keys = new Set(an.issues.map(i => i.key));
  el.innerHTML = an.issues.map(i => `<li class="rb-issue ${i.level}${!lastIssueKeys.has(i.key) && lastIssueKeys.size ? ' new' : ''}"><span class="ii">${i.level === 'fail' ? '✕' : i.level === 'warn' ? '!' : i.level === 'ok' ? '✓' : 'i'}</span><div><b>${esc(i.title)}</b><p>${esc(i.text)}</p>${i.tip ? `<div class="tip">→ ${esc(i.tip)}</div>` : ''}</div></li>`).join('') || '<li class="rb-p">Nothing to report.</li>';
  lastIssueKeys = keys;
}
function renderMass() {
  const m0 = an.m0 || 1;
  const pr = an.propTot / m0, pl = an.payload / m0, st = Math.max(0, 1 - pr - pl);
  $('massbar').innerHTML = `<i style="width:${pr * 100}%;background:linear-gradient(90deg,var(--flame),#ffb36b)" title="Propellant"></i><i style="width:${st * 100}%;background:rgba(200,210,235,.4)" title="Structure and engines"></i><i style="width:${Math.max(pl * 100, pl > 0 ? 0.6 : 0)}%;background:var(--aurora)" title="Payload"></i>`;
  let l = $('massbar').nextElementSibling;
  if (!l || !l.classList.contains('rb-massbar-l')) { l = document.createElement('div'); l.className = 'rb-massbar-l'; $('massbar').after(l); }
  l.innerHTML = `<span><i style="background:var(--flame)"></i>propellant ${(pr * 100).toFixed(1)} %</span><span><i style="background:rgba(200,210,235,.5)"></i>tanks, engines ${(st * 100).toFixed(1)} %</span><span><i style="background:var(--aurora)"></i>payload ${(pl * 100).toFixed(2)} %</span>`;
}
function renderNums() {
  const ro = (k, v, u) => `<div class="readout"><div class="k">${k}</div><div class="v">${v}${u ? `<small>${u}</small>` : ''}</div></div>`;
  const t = (kg) => kg >= 1e5 ? [nf(kg / 1000), 't'] : kg >= 1000 ? [nf(kg / 1000, 1), 't'] : [nf(kg), 'kg'];
  const [a, au] = t(an.m0), [c, cu] = t(an.capLEO), [cd, cdu] = t(an.capDest);
  $('nums').innerHTML = ro('Liftoff mass', a, au) + ro('Height', nf(an.height, 1), 'm') + ro('Liftoff thrust', an.F0 >= 1e7 ? nf(an.F0 / 1e6, 1) : nf(an.F0 / 1000), an.F0 >= 1e7 ? 'MN' : 'kN') +
    ro('Payload fraction', (an.payloadFraction * 100).toFixed(2), '%') + ro('Could lift to LEO ≈', c, cu) + ro(`…to ${esc(an.destInfo.short)} ≈`, cd, cdu);
}
function renderEq() {
  const i = sel.stage != null && an.stages[sel.stage] ? sel.stage : an.stages.reduce((b, s, k) => (s.dv > (an.stages[b] ? an.stages[b].dv : -1) ? k : b), 0);
  const st = an.stages[i], s = veh.stages[i];
  const el = $('eqLive');
  if (!st || !s || !s.eng) { el.textContent = ''; return; }
  const ph = an.phases.filter(p => p.stage === i);
  const p = ph[ph.length - 1];
  if (!p) { el.textContent = ''; return; }
  el.innerHTML = `${veh.stages.length === 1 ? 'The stage' : 'Stage ' + (i + 1)}${p.boosters ? ' (with boosters)' : ph.length > 1 ? ' (after the boosters drop)' : ''}: ${Math.round(p.ispEff)} s × 9.81 m/s² × ln(${fmt.tonnes(p.m0)} ÷ ${fmt.tonnes(p.mf)}) = <b style="color:${stageColor(i)}">${fmt.kms(p.dv)} km/s</b>`;
}
function renderDims() {
  $('dims').innerHTML = `<b>${nf(an.height, 1)} m</b> tall · <b>${fmt.tonnes(an.m0)}</b> at liftoff · Δv <b>${fmt.kms(an.dv)} km/s</b>`;
}

/* ================================================================== 3-D: REBUILD, FRAME, HIGHLIGHT */
const camState = { dist: 200, target: new THREE.Vector3(0, 50, 0), dir: new THREE.Vector3(0.36, 0.1, 1).normalize() };
let prevStageSigs = [], prevPayloadSig = '', prevBoostSig = '';
function disposeGroup(g) { g.traverse(o => { if (o.isMesh) { if (o.geometry && !engineGeoCache.has(o.geometry) && o.geometry !== plumeGeo) { /* shared geometries are cached */ } if (o.material && o.material.isShaderMaterial && o.material !== puffMat) o.material.dispose(); } }); }
function rebuild3D(flashStage = null) {
  if (mode !== 'build') return;
  const old = R;
  R = buildRocket(veh);
  scene.add(R.root);
  if (old) { scene.remove(old.root); disposeGroup(old.root); }
  buildPadDyn(R, veh);
  poseBuild();
  // what changed? animate those parts into place (folio-style "assembly")
  const sigs = design.stages.map(s => JSON.stringify(s));
  const pSig = JSON.stringify(design.payload), bSig = JSON.stringify(design.boosters);
  if (!REDUCED && prevStageSigs.length + (prevPayloadSig ? 1 : 0) > 0) {
    R.stages.forEach((st, i) => {
      if (sigs[i] !== prevStageSigs[i] && (flashStage == null || flashStage === i)) {
        gsap.from(st.g.position, { y: 6 + R.H * 0.05, duration: 0.7, ease: 'back.out(1.6)' });
        gsap.from(st.g.scale, { x: 0.9, z: 0.9, duration: 0.5, ease: 'power2.out' });
      }
    });
    if (pSig !== prevPayloadSig && R.payloadG) gsap.from(R.payloadG.position, { y: R.payloadG.position.y + 12, duration: 0.8, ease: 'bounce.out' });
    if (bSig !== prevBoostSig) R.boosters.forEach((b, k) => gsap.from(b.g.position, { x: b.g.position.x * 2.2, z: b.g.position.z * 2.2, duration: 0.7, delay: k * 0.05, ease: 'power3.out' }));
  }
  prevStageSigs = sigs; prevPayloadSig = pSig; prevBoostSig = bSig;
  if (exploded) setExploded(true, true);
  highlight3D();
  makeTags();
  frameCamera(true);
}
function poseBuild() {
  world.rotation.set(0, 0, 0);
  world.position.set(0, -padBaseY, 0);
  if (R) { R.root.position.set(0, 0, 0); R.root.rotation.set(0, 0, 0); }
}
/* the part of the screen not covered by panels, in CSS pixels */
function freeRect() {
  const W = innerWidth, H = innerHeight, nav = 60;
  if (mode === 'flight') {
    if (isPhone()) return { x: 0, y: nav, w: W, h: H * 0.62 - nav };
    const t = $('tele').getBoundingClientRect();
    return { x: t.right, y: nav, w: W - t.right, h: H - nav - 70 };
  }
  if (isPhone()) {
    const l = $('left').getBoundingClientRect();
    return { x: 0, y: nav + 10, w: W, h: Math.max(160, l.top - nav - 70) };
  }
  const l = $('left').getBoundingClientRect(), r = $('analysis').getBoundingClientRect();
  return { x: l.right, y: nav, w: Math.max(200, r.left - l.right), h: H - nav - 110 };
}
function applyViewOffset() {
  const fr = freeRect(), W = innerWidth, H = innerHeight;
  const cx = fr.x + fr.w / 2, cy = fr.y + fr.h / 2;
  camera.setViewOffset(W, H, W / 2 - cx, H / 2 - cy, W, H);
  camera.updateProjectionMatrix();
  return fr;
}
function frameCamera(animate) {
  if (!R || mode !== 'build') return;
  const fr = applyViewOffset();
  const gapE = exploded ? Math.max(3, R.H * 0.1) * R.stages.length : 0;
  const H = R.H + 4 + gapE, Wd = Math.max(R.W, 4) + 6;
  const tv = Math.tan(camera.fov * DEG / 2);
  const fracV = fr.h / innerHeight, fracH = fr.w / innerWidth;
  const dV = H * 1.12 / (2 * tv * fracV);
  const dH = Wd * 1.4 / (2 * tv * camera.aspect * fracH);
  const dist = Math.max(dV, dH, 25);
  const target = new THREE.Vector3(0, (R.H + gapE) * 0.47 - (isPhone() ? 0 : R.H * 0.02), 0);
  controls.maxDistance = dist * 4; controls.minDistance = Math.max(4, R.W * 1.2);
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (!isFinite(dir.x) || dir.lengthSq() < 0.5) dir.copy(camState.dir);
  const pos = target.clone().addScaledVector(dir, dist);
  if (animate && !REDUCED && gsap) {
    gsap.to(controls.target, { x: target.x, y: target.y, z: target.z, duration: 0.9, ease: 'power2.inOut' });
    gsap.to(camera.position, { x: pos.x, y: pos.y, z: pos.z, duration: 0.9, ease: 'power2.inOut' });
  } else { controls.target.copy(target); camera.position.copy(pos); }
  camState.dist = dist;
}
function highlight3D() {
  if (!R) return;
  const on = (sh, v, c) => { if (!sh) return; sh.visible = v; sh.material.uniforms.uC.value.set(c); sh.material.uniforms.uA.value = v ? 1 : 0; };
  const hv = sel.hover;
  R.stages.forEach((st, i) => on(st.shell, sel.stage === i || (hv && hv.type === 'stage' && hv.i === i), stageColor(i)));
  on(R.payloadShell, (sel.edit && sel.edit.type === 'payload') || (hv && hv.type === 'payload'), '#ffc24b');
  R.boosters.forEach(b => on(b.shell, (sel.edit && sel.edit.type === 'boosters') || (hv && hv.type === 'boosters'), BOOST_C));
  document.querySelectorAll('.rb-tag').forEach(t => t.classList.toggle('sel', t.dataset.stage != null && +t.dataset.stage === sel.stage));
}
function setExploded(v, instant = false) {
  exploded = v;
  $('explodeBtn').setAttribute('aria-pressed', String(v));
  if (!R) return;
  const gap = v ? Math.max(3, R.H * 0.1) : 0, dur = instant || REDUCED ? 0 : 0.8;
  R.stages.forEach((st, i) => gsap.to(st.g.position, { y: i * gap, duration: dur, ease: 'power3.inOut' }));
  if (R.payloadG) gsap.to(R.payloadG.position, { y: (R.stages.length ? R.stages[R.stages.length - 1].y1 : 0) + R.stages.length * gap, duration: dur, ease: 'power3.inOut' });
  R.boosters.forEach(b => { const d = b.g.userData.dir, r0 = Math.hypot(b.g.userData.x0 ?? (b.g.userData.x0 = b.g.position.x), b.g.userData.z0 ?? (b.g.userData.z0 = b.g.position.z)); gsap.to(b.g.position, { x: d.x * (r0 + (v ? gap * 0.8 : 0)), z: d.z * (r0 + (v ? gap * 0.8 : 0)), duration: dur, ease: 'power3.inOut' }); });
}
/* stage labels in the 3-D view */
let tagEls = [];
function makeTags() {
  const box = $('tags'); box.innerHTML = ''; tagEls = [];
  if (!R || mode !== 'build') return;
  R.stages.forEach((st, i) => {
    const el = document.createElement('div'); el.className = 'rb-tag'; el.dataset.stage = i; el.dataset.drop = 'stage:' + i; el.style.setProperty('--sc', stageColor(i));
    el.innerHTML = `<i>${i + 1}</i>${veh.stages.length === 1 ? 'STAGE' : 'S' + (i + 1)} <span>${an.stages[i] ? fmt.kms(an.stages[i].dv) + ' km/s' : ''}</span>`;
    box.appendChild(el); tagEls.push({ el, y: () => (st.g.position.y + (st.y0 + st.y1) / 2), r: st.d / 2 });
  });
  if (R.payloadG) {
    const el = document.createElement('div'); el.className = 'rb-tag'; el.dataset.drop = 'payload'; el.dataset.pay = '1'; el.style.setProperty('--sc', '#ffc24b');
    el.innerHTML = `<i>★</i>PAYLOAD <span>${fmt.tonnes(veh.payload.mass)}</span>`;
    box.appendChild(el); tagEls.push({ el, y: () => R.payloadG.position.y + (R.payloadTop - (R.stages.length ? R.stages[R.stages.length - 1].y1 : 0)) * 0.45, r: (veh.payload.fairing ? veh.payload.fairing.d : veh.payload.def.d) / 2 });
  }
  if (R.boosters.length) {
    const b = R.boosters[0];
    const el = document.createElement('div'); el.className = 'rb-tag'; el.dataset.drop = 'boosters'; el.dataset.boost = '1'; el.style.setProperty('--sc', BOOST_C);
    el.innerHTML = `<i>B</i>BOOSTERS <span>${veh.boosters.n} × ${esc(veh.boosters.def.name)}</span>`;
    const bl = veh.boosters.def.length, bd = veh.boosters.def.diameter;
    box.appendChild(el); tagEls.push({ el, y: () => bl * 0.35, r: bd / 2, obj: b.g });
  }
}
const tv3 = new THREE.Vector3(), tv4 = new THREE.Vector3();
function updateTags() {
  if (!tagEls.length) return;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  for (const t of tagEls) {
    if (t.obj) { t.obj.getWorldPosition(tv3); tv3.y = t.y(); tv3.addScaledVector(right, t.r + 0.6); }
    else tv3.set(0, t.y(), 0).addScaledVector(right, t.r + 0.8);
    tv4.copy(tv3).project(camera);
    const x = (tv4.x * 0.5 + 0.5) * innerWidth, y = (-tv4.y * 0.5 + 0.5) * innerHeight;
    const vis = tv4.z < 1 && x > 0 && x < innerWidth - 40 && y > 60 && y < innerHeight;
    t.el.style.transform = `translate(${x + 8}px, ${y}px) translateY(-50%)`;
    t.el.style.opacity = vis ? '1' : '0';
  }
}

/* ================================================================== FLIGHT */
let F = null;
const snap = (s) => ({ t: s.t, x: s.x, y: s.y, pitch: s.pitch });
function startFlight() {
  if (!veh.stages.length || veh.stages.some(s => !s.eng || !s.tanks.length)) { toast('Every stage needs a tank and an engine first'); return; }
  let p = currentPlan();
  if (!p) { p = plan(veh); planCache.set(encodeDesign(design), p); an = analyse(veh, p); }
  mode = 'flight';
  hostDiv.classList.remove('rb-mode-build'); hostDiv.classList.add('rb-mode-flight');
  $('result').hidden = true; $('caption').innerHTML = '';
  if (R) { scene.remove(R.root); }
  R = buildRocket(veh); scene.add(R.root);
  buildPadDyn(R, veh);
  P.length = 0;
  const sim = new FlightSim(veh, p.params, { debris: true, hist: true });
  F = { sim, plan: p, prev: snap(sim), tR: sim.t, warp: 1, paused: false, evI: 0, holders: [], cam: 'chase', resultAt: null, sepVis: {}, hud: 0, userZoom: false, lastPose: null };
  setWarp(1); setPaused(false); setCam('chase', true);
  controls.autoRotate = false;
  // start beside the pad, looking at the rocket from the south-east, a little below its middle
  applyViewOffset();
  const d0 = (R.H * 2.4 + 40) * clamp(1 / (camera.aspect * 1.25), 1, 2.8);
  controls.target.set(0, R.H * 0.5, 0);
  camera.position.set(d0 * 0.45, R.H * 0.32, d0 * 0.9);
  $('stagebar').innerHTML = (veh.boosters ? `<i data-s="b" style="--sc:${BOOST_C}">B</i>` : '') + veh.stages.map((s, i) => `<i data-s="${i}" style="--sc:${stageColor(i)}">S${i + 1}</i>`).join('') + '<i class="orbit" data-s="o">ORBIT</i>';
  $('tVal').textContent = 'T−00:03'; $('phase').textContent = 'Engines starting';
  caption('Ignition', 'Engines starting', `The flight computer picked a ${fmt.f1(p.params.kick)}° pitch-over${p.params.cl0 ? ' and closed-loop steering from 42 km' : ''}: the best of the ${p.tries.length} programs it flew for this design.`, 'var(--sol)');
  resize();
}
function backToBuilder() {
  mode = 'build'; F = null;
  hostDiv.classList.remove('rb-mode-flight'); hostDiv.classList.add('rb-mode-build');
  $('result').hidden = true;
  P.length = 0;
  camera.fov = 34; controls.enabled = true;
  if (R) scene.remove(R.root);
  R = null; prevStageSigs = []; prevPayloadSig = '';
  world.children.filter(c => c.userData && c.userData.debris).forEach(c => world.remove(c));
  rebuild3D();
  renderer.toneMappingExposure = 1;
  resize();
}
function setWarp(w) { if (F) F.warp = w; document.querySelectorAll('#warp button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.w === w))); }
function setPaused(p) { if (F) F.paused = p; $('pauseBtn').setAttribute('aria-pressed', String(p)); $('pauseBtn').textContent = p ? 'Resume' : 'Pause'; }
function setCam(c, quiet) {
  if (F) F.cam = c;
  document.querySelectorAll('#cams button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === c)));
  controls.enabled = c !== 'pad';
  if (c !== 'pad') { camera.fov = 34; camera.updateProjectionMatrix(); if (F) F.userZoom = false; }
}
let capTimer = 0;
function caption(kicker, title, text, color = 'var(--flame)') {
  const el = $('caption');
  el.innerHTML = `<div class="rb-cap" style="--c:${color}"><div class="k">${esc(kicker)}</div><h3>${esc(title)}</h3><p>${text}</p></div>`;
  if (gsap && !REDUCED) gsap.fromTo(el.firstChild, { opacity: 0, x: -16 }, { opacity: 1, x: 0, duration: 0.45, ease: 'power2.out' });
  clearTimeout(capTimer); capTimer = setTimeout(() => { if (el.firstChild && gsap) gsap.to(el.firstChild, { opacity: 0, duration: 0.6 }); }, 9000);
}
function stageName2(i) { return veh.stages.length === 1 ? 'The stage' : 'Stage ' + (i + 1); }
function onEvent(ev) {
  const s = F.sim, d = s.d, vs = veh.stages;
  const h = d.h, v = d.vin;
  switch (ev.id) {
    case 'liftoff': caption('T+0', 'Liftoff', `Thrust-to-weight ${fmt.f2(an.twr)}: it climbs at only ${fmt.f1((an.twr - 1) * G0)} m/s² at first, but gets lighter by ${nf(s._mdot)} kg every second.`, 'var(--flame)'); break;
    case 'boosterIgn': break;
    case 'maxq': caption('Max-q', `Maximum dynamic pressure: ${fmt.f1(ev.q / 1000)} kPa`, `The air pushes hardest here (q = ½ρv²). From now on the air thins faster than the rocket speeds up.`, 'var(--sol)'); break;
    case 'boosterSep': caption(`T+${Math.round(ev.t)} s`, 'Booster separation', `${veh.boosters.n} empty casings, ${fmt.tonnes(veh.boosters.n * veh.boosters.dry)}, fall away: parallel staging.`, BOOST_C); detachBoosters(); break;
    case 'burnout': caption(`T+${Math.round(ev.t)} s`, veh.stages.length === 1 ? 'Burnout' : `Stage ${ev.stage + 1} burnout`, `${fmt.kms(v)} km/s at ${nf(h / 1000, 1)} km. Its ${fmt.tonnes(vs[ev.stage].dry)} of empty tank and engines are now dead weight.`, stageColor(ev.stage)); break;
    case 'separation': caption('Staging', `Stage ${ev.stage + 1} separates`, `Dropping ${fmt.tonnes(vs[ev.stage].dry)} of empty structure: the rocket equation starts afresh with a much better mass ratio.`, stageColor(ev.stage)); detachStage(ev.stage); break;
    case 'ignition': caption(`T+${Math.round(ev.t)} s`, `Stage ${ev.stage + 1} ignition`, `Thrust-to-weight ${fmt.f2(an.stages[ev.stage].twr)}${an.stages[ev.stage].twr < 1 ? ': less than its weight, so it sags at first and relies on the speed it already has' : ''}.`, stageColor(ev.stage)); break;
    case 'fairing': caption(`${nf(h / 1000)} km`, 'Fairing jettison', `The air is too thin to hurt the payload now: ${fmt.tonnes(veh.payload.fairing.mass)} less to carry.`, '#fff'); detachFairing(); break;
    case 'tower': caption('Escape tower', 'Launch escape tower jettisoned', `${fmt.tonnes(veh.payload.tower)} it no longer needs: the crew would now abort with the service module engine.`, '#ff6b6b'); detachTower(); break;
    case 'space': caption('100 km', 'Space', `The Kármán line. Now it needs to go sideways: orbital speed at 200 km is 7.8 km/s; it has ${fmt.kms(v)}.`, 'var(--nebula)'); break;
    case 'cutoff': caption('Engine cutoff', 'In orbit!', `${nf(ev.t ? s.orbit().apo / 1000 : 0)} × ${nf(s.orbit().peri / 1000)} km. Falling around the Earth as fast as it falls toward it.`, 'var(--aurora)'); break;
    case 'abort': caption('Abort', 'Weight wins', `Thrust never exceeded the weight, so the hold-down clamps stayed shut and the engines were cut.`, 'var(--plasma)'); break;
    case 'impact': caption('Impact', 'Back on Earth', 'The flight ends in the ocean down-range.', 'var(--plasma)'); break;
    case 'result': F.resultAt = performance.now() + (ev.result === 'orbit' ? 2600 : ev.result === 'pad' ? 1800 : 3500); break;
  }
}
/* separated hardware follows the sim's debris list */
function holderFor(kind, index) {
  const b = F.sim.debris.slice().reverse().find(x => x.kind === kind && (index == null || x.index === index));
  const g = new THREE.Group(); g.userData.debris = b; g.userData.t0 = F.sim.t; world.add(g); F.holders.push(g);
  return g;
}
function reparent(obj, holder) {
  // keep the object's pose relative to the rocket base; the holder sits where the rocket base was
  holder.add(obj);
}
function detachStage(i) { const st = R.stages[i]; if (!st) return; const g = holderFor('stage', i); reparent(st.g, g); st.plumes.forEach(p => { p.visible = false; }); st.detached = true; }
function detachBoosters() { const g = holderFor('boosters'); R.boosters.forEach(b => { b.plume.visible = false; b.g.userData.base = b.g.position.clone(); reparent(b.g, g); }); g.userData.boost = true; R.boostersGone = true; }
function detachFairing() { const g = holderFor('fairing'); R.fairing.forEach((f, k) => { f.userData.side = k ? 1 : -1; f.position.y += R.payloadG.position.y; reparent(f, g); }); g.userData.fair = true; }
function detachTower() { if (!R.tower) return; const g = holderFor('tower'); R.tower.position.y += R.payloadG.position.y; reparent(R.tower, g); }
const W_ = () => veh.vRot / RE;
function padPose(x, y, t) {
  const phi = Math.atan2(x, y) - W_() * Math.max(0, t), r = Math.hypot(x, y);
  return { phi, px: r * Math.sin(phi), py: r * Math.cos(phi) - RE + padBaseY };
}
function flightStep(dtReal) {
  const s = F.sim;
  if (!F.paused) {
    const target = F.tR + dtReal * F.warp;
    let guard = 0;
    while (s.t < target && guard++ < 4000) {
      F.prev = snap(s); s.step(DT); s.stepDebris(DT);
      while (F.evI < s.events.length) onEvent(s.events[F.evI++]);
    }
    F.tR = Math.min(target, s.t);
  }
  const a = s.t > F.prev.t ? clamp((F.tR - F.prev.t) / (s.t - F.prev.t), 0, 1) : 1;
  const x = lerp(F.prev.x, s.x, a), y = lerp(F.prev.y, s.y, a), pitch = lerp(F.prev.pitch, s.pitch, a), t = F.tR;
  const pp = padPose(x, y, t);
  // floating origin with a level horizon: rotate the Earth-fixed world by φ about the rocket
  world.rotation.set(0, 0, pp.phi);
  const c = Math.cos(pp.phi), sn = Math.sin(pp.phi);
  world.position.set(-(pp.px * c - pp.py * sn), -(pp.px * sn + pp.py * c), 0);
  R.root.rotation.set(0, 0, -pitch);
  // debris holders
  for (const g of F.holders) {
    const b = g.userData.debris; if (!b) continue;
    const dp = padPose(b.x, b.y, t);
    g.position.set(dp.px, dp.py, 0); g.rotation.set(0, 0, -(dp.phi + b.pitch));
    const tau = t - g.userData.t0;
    if (g.userData.boost) g.children.forEach(bg => { const d = bg.userData.dir, base = bg.userData.base; const o = 1.5 * tau + 0.9 * tau * tau; bg.position.set(base.x + d.x * o, base.y - tau * 2, base.z + d.z * o); bg.rotation.set(d.z * Math.min(1.4, tau * 0.35), 0, -d.x * Math.min(1.4, tau * 0.35)); });
    if (g.userData.fair) g.children.forEach(f => { const sd = f.userData.side; f.rotation.x = sd * Math.min(1.7, tau * 0.9); f.position.z = sd * (tau * 3 + tau * tau * 0.8); });
  }
  return { h: s.d.h, pitch };
}
function updatePlumes(time) {
  const s = F ? F.sim : null;
  const p = s ? s.d.atm.p : 101325;
  const ex = clamp(Math.log10(101325 / Math.max(p, 1e-3)) / 3, 0, 1.7);
  R.stages.forEach((st, i) => {
    const on = s && s.si === i && s.engOn && s.level > 0 && s.propLeft[i] > 0;
    const I = on ? s.level * s.throttle : 0;
    if (st.hotMat) st.hotMat.emissiveIntensity = lerp(st.hotMat.emissiveIntensity, I * 0.9, 0.1);
    st.plumes.forEach(pl => {
      const u = pl.material.uniforms, d = pl.userData;
      pl.visible = I > 0.01 && !st.detached;
      u.uI.value = I * d.gain * (0.9 + 0.1 * Math.sin(time * 40 + d.r0));
      u.uTime.value = time;
      u.uLen.value = d.len * (1 + 0.8 * ex); u.uR1.value = d.r0 * (1.25 + 2.6 * ex); u.uFade.value = 0.2 + 0.1 * ex;
    });
  });
  const bOn = s && s.bLit && s.bLeft > 0;
  R.boosters.forEach(b => { const u = b.plume.material.uniforms, d = b.plume.userData; b.plume.visible = !!bOn && !R.boostersGone; u.uI.value = bOn ? d.gain : 0; u.uTime.value = time; u.uLen.value = d.len * (1 + 0.6 * ex); u.uR1.value = d.r0 * (1.3 + 2.2 * ex); });
  return ex;
}
const tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3();
function emitSmoke(dt, h) {
  const s = F.sim;
  if (h > 42000 || F.paused) return;
  const dens = Math.exp(-h / 7000);
  const rate = Math.min(1, 1 / Math.max(1, F.warp * 0.5));
  const emitAt = (lx, ly, lz, kind, strength) => {
    tmpV.set(lx, ly, lz); R.root.localToWorld(tmpV); world.worldToLocal(tmpV);
    const axis = tmpW.set(0, -1, 0).applyQuaternion(R.root.quaternion).applyQuaternion(world.quaternion.clone().invert());
    const n = Math.round((kind === 'solid' ? 7 : kind === 'kerolox' ? 5 : 3) * strength * rate * (1 + dt * 30));
    for (let k = 0; k < n; k++) {
      const sp = 20 + Math.random() * 25, j = () => (Math.random() - 0.5) * 8;
      const big = h < 60 ? 1.8 : 1;
      spawnPuff({ x: tmpV.x + j() * 0.3, y: tmpV.y - Math.random() * 6, z: tmpV.z + j() * 0.3, vx: axis.x * sp + j(), vy: axis.y * sp + j() * 0.5, vz: axis.z * sp + j(),
        age: 0, life: (kind === 'hydrolox' ? 6 : 14) + Math.random() * 8, s0: 3 * big, s1: (kind === 'solid' ? 38 : 26) * big * (0.7 + Math.random() * 0.6) * (1 + h / 8000),
        a: (kind === 'hydrolox' ? 0.18 : kind === 'methalox' ? 0.22 : kind === 'solid' ? 0.6 : 0.42) * (0.4 + 0.6 * dens), rot: Math.random() * 6.3, glow: h < 20000 ? 0.5 : 0.2, drag: 0.9, rise: 0.6 });
    }
    // ground cloud rolling out of the flame trench in the first seconds
    if (h < 150 && s.released) for (let k = 0; k < 6 * rate * Math.min(3, R.W / 4 + 0.5); k++) {
      const a = Math.random() < 0.7 ? 0 : Math.PI; const sp = 25 + Math.random() * 35;
      spawnPuff({ x: (a ? -8 : 8) + Math.random() * 6, y: PAD_Y + 2, z: (Math.random() - 0.5) * 16, vx: Math.cos(a) * sp, vy: 3 + Math.random() * 5, vz: (Math.random() - 0.5) * 18,
        age: 0, life: 18 + Math.random() * 12, s0: 12, s1: (60 + Math.random() * 50) * Math.min(2, 0.5 + R.W / 10), a: 0.7, rot: Math.random() * 6.3, glow: 0.35, drag: 0.35, rise: 1.2 });
    }
  };
  const st = R.stages[s.si];
  if (st && !st.detached && s.engOn && s.level > 0.3) {
    const eg = st.engines[0]; if (eg) emitAt(0, eg.position.y, 0, st.fam, 1 + Math.min(4, st.engines.length / 3));
  }
  if (s.bLit && !R.boostersGone) R.boosters.forEach(b => emitAt(b.g.position.x, 0, b.g.position.z, 'solid', 1));
}
function flightCamera(dt) {
  const s = F.sim;
  // centre of what is left of the stack
  const first = R.stages.find(st => !st.detached);
  const y0 = first ? (first.i === 0 ? 0 : first.y0 - (veh.stages[first.i].eng ? veh.stages[first.i].eng.length : 0)) : R.payloadTop - 4;
  const cy = (y0 + R.payloadTop) / 2, len = Math.max(8, R.payloadTop - y0);
  tmpV.set(0, cy, 0).applyQuaternion(R.root.quaternion);
  if (F.cam === 'pad') {
    const padCam = new THREE.Vector3(-260, 40, 520);
    world.localToWorld(padCam);
    camera.position.copy(padCam);
    camera.lookAt(tmpV);
    const dist = padCam.distanceTo(tmpV);
    camera.fov = clamp(2 * Math.atan(len * 1.6 / dist) / DEG, 0.25, 34); camera.updateProjectionMatrix();
    return;
  }
  const delta = tmpV.clone().sub(controls.target);
  controls.target.add(delta); camera.position.add(delta);
  const h = s.d.h;
  const narrow = clamp(1 / (camera.aspect * 1.25), 1, 2.8);                 // portrait phones need more distance
  const want = (len * 2.4 + 30) * narrow * (1 + 1.6 * smooth(1500, 80000, h)) * (F.cam === 'wide' ? 6 : 1);
  const off = camera.position.clone().sub(controls.target);
  if (performance.now() - userCam > 4000) { const L = off.length(); off.multiplyScalar(lerp(L, want, 1 - Math.exp(-dt * 1.2)) / L); camera.position.copy(controls.target).add(off); }
}

/* ================================================================== FLIGHT HUD */
function fmtClock(t) { const a = Math.abs(t), m = Math.floor(a / 60), s = Math.floor(a % 60); return `T${t < 0 ? '−' : '+'}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`; }
function phaseText() {
  const s = F.sim;
  if (s.result && s.result.type === 'pad') return 'Hold-down · engines cut';
  if (!s.released) return s.t < 0 ? 'Engines starting' : 'Throttling up';
  if (s.state === 'crashed') return 'Impact';
  if (s.result && s.result.type === 'orbit') return 'In orbit · coasting';
  if (s.result) return s.d.vr > 0 ? 'Out of propellant · coasting up' : 'Falling back';
  if (s.sepAt != null || s.ignAt != null) return 'Staging';
  const nm = veh.stages.length === 1 ? 'Stage' : 'Stage ' + (s.si + 1);
  return (s.bLit ? 'Boosters + ' : '') + nm + (s.throttle < 0.98 && s.engOn ? ` · throttled to ${Math.round(s.throttle * 100)} %` : ' burning');
}
function tele(k, v, u, cls = '') { return `<div class="readout ${cls}"><div class="k">${k}</div><div class="v">${v}${u ? `<small>${u}</small>` : ''}</div></div>`; }
function updateHUD() {
  const s = F.sim, d = s.d, o = s.orbit();
  $('tVal').textContent = fmtClock(F.tR);
  $('phase').textContent = phaseText();
  const chips = $('stagebar').children;
  for (const c of chips) {
    const k = c.dataset.s;
    let on = false, done = false;
    if (k === 'b') { on = s.bLit && s.bLeft > 0; done = !!veh.boosters && !s.bOn; }
    else if (k === 'o') on = !!(s.result && s.result.type === 'orbit');
    else { const i = +k; on = s.si === i && s.engOn && !s.result; done = s.si > i || (s.si === i && s.propLeft[i] <= 0); }
    c.classList.toggle('on', on); c.classList.toggle('done', done && !on);
  }
  const inOrbit = o.peri > ORBIT_MIN_PERI;
  $('teleNums').innerHTML =
    tele('Altitude', d.h >= 10000 ? nf(d.h / 1000, 1) : nf(d.h / 1000, 2), 'km') +
    tele('Speed (orbital)', nf(d.vin), 'm/s') +
    tele('Apoapsis', o.apo === Infinity ? 'escape' : o.apo > 0 ? nf(o.apo / 1000) : '—', o.apo > 0 && o.apo !== Infinity ? 'km' : '') +
    tele('Periapsis', o.peri > -RE * 0.99 ? nf(o.peri / 1000) : '—', o.peri > -RE * 0.99 ? 'km' : '', inOrbit ? 'hl' : '') +
    tele('Δv left (vacuum)', nf(s.dvLeft()), 'm/s') +
    tele('Stage', s.result && s.result.type === 'orbit' ? 'orbit' : `${s.si + 1}/${veh.stages.length}${s.bLit ? '+B' : ''}`, '') +
    tele('Thrust accel.', fmt.f2((s._F || 0) / s.m / G0), 'g') +
    tele('Dyn. pressure', nf(d.q / 1000, 1), 'kPa') +
    tele('Downrange', nf(d.downrange / 1000), 'km');
  const L = s.loss, gained = d.vin - veh.vRot;
  const mx = Math.max(s.dvThrust, 1);
  const row = (k, v, c) => `<div class="r"><span>${k}</span><b>${v >= 0 ? '' : '−'}${nf(Math.abs(v))}</b><div class="bar"><i style="width:${Math.min(100, Math.abs(v) / mx * 100)}%;--c:${c}"></i></div></div>`;
  $('budget').innerHTML = row('Engines delivered ∫F/m dt', s.dvThrust, 'var(--flame)') + row('− gravity', -L.grav, 'var(--plasma)') + row('− drag', -L.drag, 'var(--sol)') + row('− steering (thrust off the velocity)', -L.steer, 'var(--nebula)') + row('+ Earth\'s rotation', veh.vRot, 'var(--ice)') + row('= speed now (m/s)', d.vin, 'var(--aurora)');
  void gained;
  drawOrbit();
}
function drawOrbit() {
  const cv = $('orbitCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const s = F.sim, o = s.orbit();
  g.clearRect(0, 0, W, H);
  const ext = Math.max(s.max.h, o.apo !== Infinity && o.apo > 0 ? Math.min(o.apo, 3 * RE) : 0, 250000);
  let want = clamp(ext * 0.9 + 300000, 500000, 2.8 * RE);
  if (o.peri > ORBIT_MIN_PERI || (s.result && s.result.type === 'orbit')) want = (RE + Math.min(o.apo, 3 * RE)) * 1.15;
  F.span = F.span ? F.span + (want - F.span) * 0.08 : want;
  const span = F.span;
  const k = clamp((RE * 1.2 - span) / (RE * 1.2), 0, 1);
  // look at the middle of the path flown so far (launch site → rocket), from the Earth's centre outward
  const h0 = s.hist.length ? s.hist[0] : { x: 0, y: RE };
  let mx = s.x / Math.hypot(s.x, s.y) + h0.x / Math.hypot(h0.x, h0.y), my = s.y / Math.hypot(s.x, s.y) + h0.y / Math.hypot(h0.x, h0.y);
  const ml = Math.hypot(mx, my) || 1; mx /= ml; my /= ml;
  const cx0 = mx * (RE + ext * 0.4) * k, cy0 = my * (RE + ext * 0.4) * k;
  const sc = Math.min(W, H) / (2 * span);
  const X = (x) => W / 2 + (x - cx0) * sc, Y = (y) => H / 2 - (y - cy0) * sc;
  // atmosphere and Earth
  const ex = X(0), ey = Y(0);
  const ag = g.createRadialGradient(ex, ey, RE * sc * 0.98, ex, ey, (RE + 120000) * sc);
  ag.addColorStop(0, 'rgba(124,200,255,0.35)'); ag.addColorStop(1, 'rgba(124,200,255,0)');
  g.fillStyle = ag; g.beginPath(); g.arc(ex, ey, (RE + 120000) * sc, 0, 6.2832); g.fill();
  const eg = g.createRadialGradient(ex - RE * sc * 0.3, ey - RE * sc * 0.3, RE * sc * 0.1, ex, ey, RE * sc);
  eg.addColorStop(0, '#2d6fb0'); eg.addColorStop(1, '#0d2340');
  g.fillStyle = eg; g.beginPath(); g.arc(ex, ey, RE * sc, 0, 6.2832); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.18)'; g.setLineDash([4, 5]); g.lineWidth = 1;
  g.beginPath(); g.arc(ex, ey, (RE + KARMAN) * sc, 0, 6.2832); g.stroke(); g.setLineDash([]);
  // osculating orbit (the path if the engines stopped now)
  if (o.eps < 0 && isFinite(o.a)) {
    const p = o.a * (1 - o.e * o.e);
    g.lineWidth = 2; g.setLineDash([7, 6]);
    for (let pass = 0; pass < 2; pass++) {
      g.beginPath(); let started = false;
      for (let i = 0; i <= 360; i++) {
        const th = i / 360 * Math.PI * 2;
        const rr = p / (1 + o.e * Math.cos(th - o.w));
        const inside = rr < RE;
        if ((pass === 0) !== inside) { started = false; continue; }
        const px = X(Math.sin(th) * rr), py = Y(Math.cos(th) * rr);
        if (!started) { g.moveTo(px, py); started = true; } else g.lineTo(px, py);
      }
      g.strokeStyle = pass === 0 ? 'rgba(124,200,255,0.95)' : 'rgba(124,200,255,0.18)'; g.stroke();
    }
    g.setLineDash([]);
  }
  // path flown, coloured by stage
  const hs = s.hist;
  g.lineWidth = 2.5;
  for (let i = 1; i < hs.length; i++) {
    g.strokeStyle = hs[i].b ? BOOST_C : stageColor(hs[i].si);
    g.beginPath(); g.moveTo(X(hs[i - 1].x), Y(hs[i - 1].y)); g.lineTo(X(hs[i].x), Y(hs[i].y)); g.stroke();
  }
  // the rocket
  const rx = X(s.x), ry = Y(s.y);
  g.fillStyle = '#fff'; g.shadowColor = '#7cc8ff'; g.shadowBlur = 12; g.beginPath(); g.arc(rx, ry, 4.5, 0, 6.2832); g.fill(); g.shadowBlur = 0;
  const vv = Math.hypot(s.vx, s.vy) || 1;
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(rx, ry); g.lineTo(rx + s.vx / vv * 26, ry - s.vy / vv * 26); g.stroke();
  g.font = '500 20px JetBrains Mono, monospace'; g.fillStyle = 'rgba(233,237,255,0.8)';
  g.fillText(o.peri > ORBIT_MIN_PERI ? 'ORBIT' : o.apo > KARMAN ? 'SUBORBITAL' : 'ASCENT', 16, 30);
  g.fillStyle = 'rgba(143,152,189,0.9)'; g.font = '400 16px JetBrains Mono, monospace';
  g.fillText(`view ${nf(span * 2 / 1000)} km across`, 16, H - 16);
}
function showResult() {
  const s = F.sim, r = s.result;
  const card = $('result').firstElementChild;
  const d = an.destInfo;
  let cls = 'fail', kicker = 'Mission result', title = '', text = '';
  if (r.type === 'orbit') {
    const ok = an.need <= an.needLEO || r.dvLeft >= d.extra;
    cls = ok ? '' : 'partial';
    title = ok && an.need > an.needLEO ? `Orbit, with enough left for ${d.short}` : 'Orbit achieved';
    text = `${nf(r.apo / 1000)} × ${nf(r.peri / 1000)} km, after ${Math.floor(r.t / 60)} min ${Math.round(r.t % 60)} s. The rocket spent ${fmt.kms(r.dvUsed)} km/s getting here (${nf(r.losses.grav)} m/s lost to gravity, ${nf(r.losses.drag)} m/s to drag) and has ${fmt.kms(r.dvLeft)} km/s left.`;
  } else if (r.type === 'pad') { title = 'Stayed on the pad'; text = `Liftoff thrust-to-weight was ${fmt.f2(an.twr)}. The engines could not lift the rocket, so the flight computer cut them. Add thrust or remove weight.`; }
  else if (r.type === 'suborbital') { title = 'Reached space, fell back'; text = `It peaked at ${nf(r.apo / 1000)} km with ${fmt.kms(r.vMax)} km/s, short of the ~7.8 km/s it takes to keep missing the ground. ${an.dv < an.needLEO ? `The rocket equation gives it ${fmt.kms(an.dv)} km/s; orbit needs about ${fmt.kms(an.needLEO)}.` : 'Its upper stage pushed too weakly to use its Δv before falling back.'}`; }
  else { title = r.type === 'crash' ? 'Fell back to Earth' : 'Never reached space'; text = `Top speed ${fmt.kms(r.vMax)} km/s, highest point ${nf(Math.max(r.apo, r.hMax) / 1000)} km. ${an.dv < an.needLEO ? `It has ${fmt.kms(an.dv)} km/s of Δv; orbit needs about ${fmt.kms(an.needLEO)}.` : 'A stage with too little thrust spent its propellant fighting gravity.'}`; }
  card.className = 'rb-res-card ' + cls;
  $('resKicker').textContent = kicker; $('resTitle').textContent = title; $('resText').textContent = text;
  const D = cat.dest;
  $('resDest').innerHTML = r.type === 'orbit' ? ['gto', 'moon', 'mars'].map(k => `<span class="${r.dvLeft >= D[k].extra ? 'y' : ''}">${D[k].short} ${r.dvLeft >= D[k].extra ? '✓' : '✗'} <small>${fmt.kms(D[k].extra)}</small></span>`).join('') : '';
  const ro = (k, v, u) => `<div class="readout"><div class="k">${k}</div><div class="v">${v}<small>${u}</small></div></div>`;
  $('resNums').innerHTML = ro('Max-q', nf(r.maxQ / 1000, 1), 'kPa') + ro('Peak acceleration', fmt.f1(r.maxG), 'g') + ro('Gravity loss', nf(r.losses.grav), 'm/s') + ro('Drag loss', nf(r.losses.drag), 'm/s');
  $('result').hidden = false;
  if (gsap && !REDUCED) gsap.fromTo(card, { opacity: 0, y: 20, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: 'power3.out' });
}

/* ================================================================== FRAME */
let lastNow = performance.now();
let tReal = 0, composer = null, bloom = null;
function setupComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.34, 0.14, 1.0);
  bloom.enabled = Q.bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
}
const fog = new THREE.FogExp2(0xa9c3dc, 0.000018);
scene.fog = fog;
const invW = new THREE.Matrix4(), qInv = new THREE.Quaternion();
function atmosphereUniforms() {
  world.updateMatrixWorld(true);
  camera.updateMatrixWorld();
  invW.copy(world.matrixWorld).invert();
  const cp = camera.position.clone().applyMatrix4(invW);          // camera in the pad frame
  const c = new THREE.Vector3(cp.x, cp.y + RE, cp.z), r = c.length(), h = r - RE;
  const u = planetMat.uniforms;
  u.uUp.value.copy(c).divideScalar(r);
  u.uH.value = h; u.uCamPad.value.copy(cp); u.uTime.value = tReal;
  u.uInvProj.value.copy(camera.projectionMatrixInverse);
  u.uCamWorld.value.multiplyMatrices(invW, camera.matrixWorld);
  u.uLogFC.value = 2.0 / (Math.log(camera.far + 1.0) / Math.LN2);
  camera.getWorldDirection(u.uCamFwd.value);
  qInv.copy(world.quaternion).invert(); u.uCamFwd.value.applyQuaternion(qInv);
  const thin = Math.exp(-Math.max(h, 0) / 8000);
  fog.density = 0.000018 * thin;
  hemi.intensity = 0.15 + 0.4 * thin;
  scene.environmentIntensity = 0.2 + 0.4 * thin;
  const pd = Math.hypot(world.position.x, world.position.y);
  sunLight.castShadow = Q.shadow > 0 && pd < 3000;
  puffMat.uniforms.uAmb.value.setRGB(0.4 * thin + 0.1, 0.45 * thin + 0.11, 0.54 * thin + 0.13);
  return h;
}
let paused = false;
function frame() {
  const now = performance.now(), dt = Math.min((now - lastNow) / 1000, 0.1); lastNow = now;
  tReal += dt;
  let h = 0;
  if (mode === 'flight' && F) {
    const st = flightStep(dt);
    h = st.h;
    const ex = updatePlumes(tReal);
    emitSmoke(dt, h);
    flightCamera(dt);
    // flame light on the pad and the tower while close to the ground
    const on = F.sim._F > 0 ? 1 : 0;
    flameLight.intensity = on * 9000 * (1 - smooth(50, 800, h)) * (0.9 + 0.1 * Math.sin(tReal * 37));
    flameLight.position.set(0, -4, 0);
    padDyn.userData.arm && (padDyn.userData.arm.scale.z = F.sim.t > -2 ? Math.max(0.3, 1 - smooth(-2, 0.5, F.sim.t) * 0.7) : 1);
    F.hud -= dt; if (F.hud <= 0) { updateHUD(); F.hud = 0.1; }
    if (F.resultAt && performance.now() > F.resultAt) { F.resultAt = null; showResult(); }
    void ex;
  } else if (R) {
    // build mode: gentle idle life
    R.stages.forEach(st => { if (st.shell && st.shell.visible) st.shell.material.uniforms.uT.value = tReal; });
    if (R.payloadShell && R.payloadShell.visible) R.payloadShell.material.uniforms.uT.value = tReal;
    R.boosters.forEach(b => { if (b.shell && b.shell.visible) b.shell.material.uniforms.uT.value = tReal; });
    updatePlumes(tReal);
  }
  if (padDyn.userData.beacon) padDyn.userData.beacon.visible = (tReal % 1.6) < 0.8;
  updatePuffs(dt);
  if (!(mode === 'flight' && F && F.cam === 'pad')) controls.update();
  const camH = atmosphereUniforms();
  renderer.toneMappingExposure = lerp(0.92, 1.12, smooth(20000, 100000, camH));
  if (mode === 'build') updateTags();
  if (composer) composer.render(); else renderer.render(scene, camera);
}
function loop() { requestAnimationFrame(loop); if (!document.hidden) frame(); }

function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  if (composer) { composer.setSize(innerWidth, innerHeight); }
  applyViewOffset();
  if (mode === 'build') frameCamera(false);
}
addEventListener('resize', resize);

/* ================================================================== UI WIRING */
let toastT = 0;
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 1800); }
function syncTabs() {
  const tab = hostDiv.dataset.tab;
  document.querySelectorAll('#tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === tab)));
}
async function copyLink() {
  const url = location.href.split('#')[0] + '#' + encodeDesign(design);
  try { await navigator.clipboard.writeText(url); toast('Link copied: anyone can open this design'); }
  catch (e) { prompt('Copy this link:', url); }
}
function wireUI() {
  $('palTabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; palTab = b.dataset.k; document.querySelectorAll('#palTabs button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); renderPalette(); });
  const pl = $('palList');
  pl.addEventListener('pointerdown', onPalDown);
  pl.addEventListener('click', onPalClick);
  addEventListener('pointermove', onMove);
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);
  const st = $('stack');
  st.addEventListener('click', stackClick);
  st.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-act="select"]')) { e.preventDefault(); e.target.click(); } });
  st.addEventListener('click', stackSeg, true);
  st.addEventListener('input', (e) => stackInput(e, false));
  st.addEventListener('change', (e) => { if (e.target.matches('input[type="range"]')) recordHistory(); else stackInput(e, true); });
  st.addEventListener('pointerover', (e) => { const c = e.target.closest('.rb-card'); const hv = c ? (c.classList.contains('payload') ? { type: 'payload' } : c.dataset.stage != null ? { type: 'stage', i: +c.dataset.stage } : null) : null; if (JSON.stringify(hv) !== JSON.stringify(sel.hover)) { sel.hover = hv; highlight3D(); } });
  st.addEventListener('pointerleave', () => { sel.hover = null; highlight3D(); });
  $('stageMeters').addEventListener('click', (e) => { const c = e.target.closest('.rb-sm'); if (!c) return; sel.stage = +c.dataset.stage; renderStack(); renderStageMeters(); renderEq(); highlight3D(); if (isPhone() || innerWidth <= 1320) { hostDiv.dataset.tab = 'stack'; syncTabs(); } });
  $('tags').addEventListener('click', (e) => {
    const t = e.target.closest('.rb-tag'); if (!t) return;
    if (t.dataset.stage != null) { sel.stage = +t.dataset.stage; sel.edit = null; }
    else if (t.dataset.pay) sel.edit = { type: 'payload' };
    else if (t.dataset.boost) { sel.edit = { type: 'boosters', stage: 0 }; sel.stage = 0; }
    hostDiv.dataset.tab = 'stack'; syncTabs();
    renderStack(); renderStageMeters(); highlight3D(); renderEq();
  });
  $('undoBtn').addEventListener('click', () => doUndo(-1));
  $('redoBtn').addEventListener('click', () => doUndo(1));
  $('shareBtn').addEventListener('click', copyLink);
  $('resShare').addEventListener('click', copyLink);
  const ps = $('presetSel');
  ps.innerHTML = '<option value="">Load a preset…</option>' + PRESETS.map(p => `<option value="${p.id}">${esc(p.name)} (${esc(p.like)})</option>`).join('');
  ps.addEventListener('change', () => { const p = PRESETS.find(x => x.id === ps.value); if (p) { loadDesign(cloneDesign(p.design)); toast(`${p.name}: ${p.blurb}`); } ps.value = ''; });
  $('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; hostDiv.dataset.tab = b.dataset.tab; syncTabs(); if ($('left').classList.contains('collapsed')) $('collapse').click(); });
  $('collapse').addEventListener('click', () => setTimeout(() => { hostDiv.classList.toggle('rb-sheet-collapsed', $('left').classList.contains('collapsed')); resize(); }, 0));
  $('explodeBtn').addEventListener('click', () => { setExploded(!exploded); frameCamera(true); });
  $('launchBtn').addEventListener('click', startFlight);
  $('backBtn').addEventListener('click', backToBuilder);
  $('resBack').addEventListener('click', backToBuilder);
  $('replayBtn').addEventListener('click', startFlight);
  $('resReplay').addEventListener('click', startFlight);
  $('pauseBtn').addEventListener('click', () => setPaused(!(F && F.paused)));
  $('warp').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setWarp(+b.dataset.w); });
  $('cams').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setCam(b.dataset.c); });
  const mv = $('miniVerdict'); if (mv) mv.addEventListener('click', () => { hostDiv.dataset.tab = 'analysis'; syncTabs(); if ($('left').classList.contains('collapsed')) $('collapse').click(); });
  addEventListener('keydown', (e) => {
    if (e.target.matches('input, select, textarea')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); doUndo(e.shiftKey ? 1 : -1); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); doUndo(1); }
    else if (mode === 'flight' && e.key === ' ') { e.preventDefault(); setPaused(!(F && F.paused)); }
    else if (mode === 'flight' && e.key === 'Escape') backToBuilder();
    else if (mode === 'build' && e.key === 'Enter' && e.shiftKey) startFlight();
  });
  addEventListener('hashchange', () => { const d = decodeDesign(location.hash, cat); if (d && encodeDesign(d) !== encodeDesign(design)) loadDesign(d); });
  // KaTeX formula
  const ek = $('eqTex');
  if (window.katex) katex.render(ek.dataset.tex, ek, { throwOnError: false, displayMode: true }); else ek.textContent = 'Δv = Isp · g0 · ln(m0 / mf)';
}

/* click a part of the 3-D rocket to select its stage (or the payload, or the boosters) */
const picker = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = { x: e.clientX, y: e.clientY }; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || mode !== 'build' || !R || drag) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y); downAt = null;
  if (moved > 5) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  picker.setFromCamera(ndc, camera);
  const hits = picker.intersectObject(R.root, true).filter(h => h.object.visible && !(h.object.material && h.object.material.isShaderMaterial));
  if (!hits.length) return;
  let o = hits[0].object;
  while (o && o !== R.root) {
    const si = R.stages.findIndex(st => st.g === o);
    if (si >= 0) { sel.stage = si; sel.edit = null; break; }
    if (o === R.payloadG) { sel.edit = { type: 'payload' }; break; }
    if (R.boosters.some(b => b.g === o)) { sel.stage = 0; sel.edit = { type: 'boosters', stage: 0 }; break; }
    o = o.parent;
  }
  if (isPhone() || innerWidth <= 1320) { hostDiv.dataset.tab = 'stack'; syncTabs(); }
  renderStack(); renderStageMeters(); highlight3D(); renderEq();
  const card = sel.edit && sel.edit.type === 'payload' ? document.querySelector('.rb-card.payload') : document.querySelector(`.rb-card[data-stage="${sel.stage}"]`);
  if (card) card.scrollIntoView({ block: 'nearest', behavior: REDUCED ? 'auto' : 'smooth' });
});

/* ================================================================== BOOT */
async function boot() {
  const res = await fetch('data/builder-parts.json');
  const json = await res.json();
  cat = makeCatalogue(json);
  initWorker(json);
  const fromHash = decodeDesign(location.hash, cat);
  design = fromHash || cloneDesign((PRESETS.find(p => p.id === (params.get('preset') || 'moon')) || PRESETS[0]).design);
  undo.list = [JSON.stringify(design)]; undo.i = 0;
  wireUI();
  renderPalette();
  scene.environment = buildEnv();
  setupComposer();
  designChanged({});
  rebuild3D();
  resize();
  frameCamera(false);
  $('loading').classList.add('done');
  loop();
}
boot().catch(err => { console.error(err); $('loading').textContent = 'Could not load the parts catalogue.'; });

/* ================================================================== TEST HOOKS (scripts/shot.py --eval) */
window.__sim = {
  get design() { return design; }, get analysis() { return an; }, get plan() { return currentPlan(); }, get flight() { return F && F.sim; },
  preset(id) { const p = PRESETS.find(x => x.id === id); if (p) loadDesign(cloneDesign(p.design)); return !!p; },
  load(hash) { const d = decodeDesign(hash, cat); if (d) loadDesign(d); return !!d; },
  launch() { startFlight(); return !!F; },
  jump(t) { if (!F) return false; while (F.sim.t < t) { F.prev = snap(F.sim); F.sim.step(DT); F.sim.stepDebris(DT); while (F.evI < F.sim.events.length) onEvent(F.sim.events[F.evI++]); } F.prev = snap(F.sim); F.tR = F.sim.t; return F.sim.t; },
  warp: setWarp, back: backToBuilder, explode(v) { setExploded(v); frameCamera(true); },
  select(i) { sel.stage = i; renderStack(); renderStageMeters(); highlight3D(); renderEq(); },
  edit(s) { sel.edit = parseEdit(s); if (sel.edit.stage != null) sel.stage = sel.edit.stage; renderStack(); highlight3D(); },
  tab(t) { hostDiv.dataset.tab = t; syncTabs(); if (t === 'parts' || t === 'stack' || t === 'analysis') { /* for phones */ } },
  pal(k) { palTab = k; document.querySelectorAll('#palTabs button').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.k === k))); renderPalette(); },
  cam(c) { setCam(c); }, result() { if (F && F.sim.result) showResult(); return F && F.sim.result; },
  ready() { return !!currentPlan() || !veh.stages.length; },
  get drag() { return drag && { kind: drag.kind, id: drag.id, on: drag.on }; }
};
