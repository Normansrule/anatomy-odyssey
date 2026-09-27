/* Cosmic Codex · Launch — the Apollo 11 Saturn V from Pad 39A to Earth orbit.
 *
 * Rendering: Three.js r186 (vendored). One full-screen shader draws the planet,
 * ocean and a single-scattering atmosphere (so the sky fades to black with
 * altitude and the curved limb appears); the pad, rocket, exhaust plumes and
 * smoke are regular meshes on top. A floating origin keeps the rocket near
 * (0,0,0) so nothing jitters at 2,000 km downrange; a logarithmic depth buffer
 * handles the 0.5 m … 20,000 km depth range.
 *
 * Physics lives in launch-physics.js (see its header for sources).
 *
 * World frame ("pad frame"): origin at the pad on the ground under the rocket,
 * +x east, +y up, +z south. Earth's centre is at (0, −RE, 0).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { AscentSim, runTo, SEQ, MASS, RE, MU, G0, ENGINES, AZIMUTH, V_ROT, engineLevels, TARGET_ALT } from './launch-physics.js';

const Codex = window.Codex || { fmt: (v, d) => (+v).toFixed(d ?? 2), webgl: () => true, reducedMotion: false };
const gsap = window.gsap;
const $ = (id) => document.getElementById(id);
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const DEG = Math.PI / 180;

/* ------------------------------------------------------------------ geometry constants */
// Pad and mobile launcher (approximate, from public drawings of LC-39A and the
// Apollo Mobile Launcher: 49 × 41 × 7.6 m base on 6.7 m pedestals; tower 116 m above the deck).
const PAD_H = 12;                 // hardstand height above surrounding ground, m
const ML_BOTTOM = PAD_H + 6.7;    // bottom of the launcher base
const DECK = ML_BOTTOM + 7.6;     // launcher deck
const BASE_Y = DECK - 1.0;        // rocket nozzle-exit plane (engines hang into the deck opening)
const TOWER_H = 116;              // Launch Umbilical Tower (LUT) height above deck
const TOWER_Z = -19;              // tower centre (north of the vehicle)
// Saturn V stations (m above the F-1 nozzle exits), 110.6 m total, 10.06 m diameter.
const R1 = 5.03, R3 = 3.302, RSM = 1.956;
const ST = {
  heat: 5.6, sicTop: 42.06, ringTop: 47.6, siiTop: 66.9, flareTop: 72.6,
  sivbTop: 84.76, iuTop: 85.67, slaTop: 94.2, smTop: 98.1, cmTop: 101.3, top: 110.6
};

/* Sun at Apollo 11 launch: 13:32 UTC, 16 July 1969, 28.61° N 80.60° W →
 * solar elevation ≈ 36.5°, azimuth ≈ 84° (computed from the solar declination
 * +21.3° and hour angle −59°). */
const SUN_EL = 36.5 * DEG, SUN_AZ = 84 * DEG;
const SUN = new THREE.Vector3(Math.cos(SUN_EL) * Math.sin(SUN_AZ), Math.sin(SUN_EL), -Math.cos(SUN_EL) * Math.cos(SUN_AZ)).normalize();
const FLIGHT_DIR = new THREE.Vector3(Math.sin(AZIMUTH * DEG), 0, -Math.cos(AZIMUTH * DEG)); // D
const PLANE_N = new THREE.Vector3(FLIGHT_DIR.z, 0, -FLIGHT_DIR.x);                        // K = Y × D

/* ------------------------------------------------------------------ quality */
const QUALITY = {
  low: { pr: 0.75, shadow: 0, bloom: false, puffs: 700, trail: 350, steps: 6, seg: 24 },
  high: { pr: 1.0, shadow: 2048, bloom: true, puffs: 1500, trail: 800, steps: 10, seg: 40 },
  ultra: { pr: 2.0, shadow: 4096, bloom: true, puffs: 2400, trail: 1200, steps: 14, seg: 64 }
};
let qName = (() => { try { return localStorage.getItem('cx-launch-q') || 'high'; } catch (e) { return 'high'; } })();
if (!QUALITY[qName]) qName = 'high';
let Q = QUALITY[qName];

/* ------------------------------------------------------------------ boot */
if (!Codex.webgl()) { Codex.noGL && Codex.noGL(); throw new Error('WebGL unavailable'); }
const stage = $('stage');
const renderer = new THREE.WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2) * Q.pr > 2 ? 2 : Math.min(devicePixelRatio, 2) * Q.pr);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = Q.shadow > 0;
renderer.shadowMap.type = THREE.PCFShadowMap;
stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute('aria-label', stage.getAttribute('aria-label'));

const scene = new THREE.Scene();
const world = new THREE.Group();           // everything fixed to the Earth (floating origin)
scene.add(world);
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 2.2e7);
const fog = new THREE.FogExp2(0xa9c3dc, 0.000022);
scene.fog = fog;

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

/* ================================================================== PLANET + ATMOSPHERE */
// Single-scattering sky after Nishita et al. (1993) with Rayleigh coefficients
// for 680/550/440 nm (Bruneton & Neyret 2008) and a Chapman-function sun
// transmittance (approximation by Schüler, GPU Pro 3, 2012).
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
    // ---- surface: coastline, lagoons, pad area, clouds (east e, north n, metres from Pad 39A)
    float coastE(float n){
      return 1050.0 + 170.0*sin(n/2300.0) + 90.0*sin(n/830.0 + 1.0) + 9000.0*exp(-pow((n + 24000.0)/9000.0, 2.0))
             + 0.18*max(0.0, -n - 40000.0) - 0.12*max(0.0, n - 30000.0);
    }
    float segDist(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba)/dot(ba, ba), 0.0, 1.0); return length(pa - ba*h); }
    // returns albedo in rgb, water flag in a
    vec4 surface(vec2 p, float dist){
      float e = p.x, n = p.y;
      float ce = coastE(n);
      float big = fbm2(p / 9000.0);
      if (e > ce) return vec4(0.0, 0.0, 0.0, 1.0);                           // Atlantic
      // lagoons west of the pad: Banana River, Indian River, Mosquito Lagoon
      float wig = 700.0*sin(n/4100.0) + 400.0*(big - 0.5);
      bool lag = (e > -8200.0 + wig && e < -5600.0 + wig && n < 3500.0) ||
                 (e > -17500.0 + wig && e < -13200.0 + wig) ||
                 (e > -4200.0 + wig && e < -900.0 + wig && n > 9000.0 && n < 60000.0);
      if (lag) return vec4(0.0, 0.0, 0.0, 0.6);
      float beach = smoothstep(ce - 90.0, ce - 20.0, e);
      float g = fbm2(p / 380.0), g2 = fbm2(p / 55.0 + 3.0);
      vec3 scrub = mix(vec3(0.075, 0.095, 0.045), vec3(0.16, 0.16, 0.085), g);
      scrub = mix(scrub, vec3(0.05, 0.075, 0.05), smoothstep(0.55, 0.75, big));
      scrub *= 0.85 + 0.3*g2;
      vec3 col = mix(scrub, vec3(0.55, 0.50, 0.40), beach);
      // pad area (fades out with distance so it does not alias)
      if (dist < 60000.0){
        float pr = length(p);
        vec3 mowed = vec3(0.13, 0.15, 0.07) * (0.9 + 0.2*g2);
        col = mix(col, mowed, 1.0 - smoothstep(420.0, 520.0, pr));
        // perimeter road (octagon) and crawlerway to the Vehicle Assembly Building (VAB) 5 km west-southwest
        float oct = max(max(abs(p.x), abs(p.y)), (abs(p.x) + abs(p.y)) * 0.7071);
        col = mix(col, vec3(0.34, 0.33, 0.31), 1.0 - smoothstep(4.0, 7.0, abs(oct - 470.0)));
        float cw = segDist(p, vec2(-250.0, 0.0), vec2(-4700.0, -2350.0));
        float lanes = (1.0 - smoothstep(5.0, 7.0, abs(cw - 13.0))) + (1.0 - smoothstep(5.0, 7.0, abs(cw + 13.0)));
        col = mix(col, vec3(0.50, 0.48, 0.44), clamp(lanes, 0.0, 1.0));
        col = mix(col, vec3(0.28, 0.27, 0.25), (1.0 - smoothstep(3.0, 4.5, abs(cw))) * 0.8);
        float rd = segDist(p, vec2(-60.0, 480.0), vec2(-1400.0, 3200.0));
        col = mix(col, vec3(0.30, 0.30, 0.29), 1.0 - smoothstep(3.0, 5.0, rd));
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
planet.frustumCulled = false;
planet.renderOrder = -100;
scene.add(planet);

/* ================================================================== LIGHTS + ENVIRONMENT */
const sunLight = new THREE.DirectionalLight(0xfff3e2, 3.3);
sunLight.castShadow = Q.shadow > 0;
sunLight.shadow.mapSize.set(Q.shadow || 1024, Q.shadow || 1024);
const sc = sunLight.shadow.camera;
sc.left = -150; sc.right = 150; sc.top = 170; sc.bottom = -120; sc.near = 10; sc.far = 1400;
sunLight.shadow.bias = -0.0004; sunLight.shadow.normalBias = 0.6;
world.add(sunLight); world.add(sunLight.target);
sunLight.target.position.set(-40, 60, 0);
sunLight.position.copy(sunLight.target.position).addScaledVector(SUN, 700);
const hemi = new THREE.HemisphereLight(0x9cc4ff, 0x3d403b, 0.55);
scene.add(hemi);
const flameLight = new THREE.PointLight(0xff8a3a, 0, 0, 2);
scene.add(flameLight);

// Image-based lighting: a simple sky-over-ground gradient baked to a PMREM.
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
scene.environment = buildEnv();
scene.environmentIntensity = 0.55;

/* ================================================================== CANVAS TEXTURES */
const maxAniso = renderer.capabilities.getMaxAnisotropy();
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAniso);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
function drawFlag(g, x, y, w, h) {
  // 13 stripes, canton 7 stripes tall and 0.76·height wide (U.S. Code, Title 4)
  for (let i = 0; i < 13; i++) { g.fillStyle = i % 2 ? '#f4f1ea' : '#b22234'; g.fillRect(x, y + i * h / 13, w, h / 13 + 0.5); }
  const cw = w * 0.4, ch = h * 7 / 13;
  g.fillStyle = '#3c3b6e'; g.fillRect(x, y, cw, ch);
  g.fillStyle = '#f4f1ea';
  for (let r = 0; r < 9; r++) {
    const n = r % 2 ? 5 : 6;
    for (let c = 0; c < n; c++) {
      const sx = x + cw * ((c * 2 + (r % 2 ? 2 : 1)) / 12), sy = y + ch * ((r + 1) / 10);
      star(g, sx, sy, ch * 0.035);
    }
  }
}
function star(g, cx, cy, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
  g.fill();
}
/* Stage skin: u runs around the circumference (u = 0 faces +z/south, 0.25 east,
 * 0.5 north, 0.75 west), v from the bottom (0) to the top (1) of the segment. */
function stageSkin({ height, radius, bands = [], letters, flags = [], seams = 8, stringers = 0, dirt = 0 }) {
  const circ = 2 * Math.PI * radius;
  const W = 2048, H = Math.min(4096, Math.round(W * height / circ / 2) * 2 || 64);
  const px = W / circ, py = H / height;
  const Y = (y) => H - y * py; // metres from segment bottom → canvas y
  const map = canvasTex(W, H, (g) => {
    g.fillStyle = '#eceae4'; g.fillRect(0, 0, W, H);
    for (const b of bands) {
      if (b.type === 'black') { g.fillStyle = '#16171a'; g.fillRect(0, Y(b.y1), W, (b.y1 - b.y0) * py); }
      else if (b.type === 'roll') {
        g.fillStyle = '#16171a';
        const n = b.n || 8, off = b.off || 0;
        for (let i = 0; i < n; i += 2) g.fillRect(((i / n + off) % 1) * W, Y(b.y1), W / n, (b.y1 - b.y0) * py);
      } else if (b.type === 'grey') { g.fillStyle = b.c || '#b9bcc2'; g.fillRect(0, Y(b.y1), W, (b.y1 - b.y0) * py); }
      else if (b.type === 'line') { g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(0, Y(b.y0) - 2, W, 3); }
    }
    // panel seams
    g.fillStyle = 'rgba(40,40,40,.10)';
    for (let i = 0; i < seams; i++) g.fillRect((i / seams) * W, 0, 2, H);
    // subtle weathering / streaks
    for (let i = 0; i < 260 * dirt; i++) {
      g.fillStyle = `rgba(90,80,70,${0.02 + Math.random() * 0.03})`;
      g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 3, 20 + Math.random() * 160);
    }
    for (const f of flags) {
      const fw = f.w * px, fh = f.h * py;
      drawFlag(g, f.u * W - fw / 2, Y(f.y + f.h), fw, fh);
    }
    if (letters) {
      const { text, u, yTop, size, gap } = letters;
      g.fillStyle = '#16171a';
      g.font = `900 ${Math.round(size * py)}px "Arial Black", "Helvetica Neue", Arial, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'top';
      for (const uu of [].concat(u)) {
        let y = yTop;
        for (const ch of text) {
          if (ch !== ' ') {
            g.save(); g.translate(uu * W, Y(y)); g.scale(1.45, 1); g.fillText(ch, 0, 0); g.restore();
          }
          y -= size + gap;
        }
      }
    }
  });
  const bump = canvasTex(W / 2, Math.max(2, H / 2), (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    // stringers / corrugations as fine vertical ridges
    for (const b of bands.filter(b => b.corr)) {
      const y0 = h - b.y1 * py / 2, hh = (b.y1 - b.y0) * py / 2;
      for (let x = 0; x < w; x += 4) { g.fillStyle = (x / 4) % 2 ? '#9a9a9a' : '#666'; g.fillRect(x, y0, 2, hh); }
    }
    if (stringers) { g.fillStyle = '#8c8c8c'; for (let i = 0; i < stringers; i++) g.fillRect((i / stringers) * w, 0, 1, h); }
    g.fillStyle = '#5a5a5a';
    for (const b of bands.filter(b => b.type === 'line' || b.ring)) g.fillRect(0, h - b.y0 * py / 2 - 1, w, 2);
  }, false);
  return { map, bump };
}

const FLAT_BUMP = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1); FLAT_BUMP.needsUpdate = true;
/* ================================================================== MATERIALS */
const MAT = {
  paint: (skin) => new THREE.MeshStandardMaterial({ map: skin.map, bumpMap: skin.bump, bumpScale: 1.2, roughness: 0.52, metalness: 0.0 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.55 }),
  black: new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.5 }),
  nozzle: new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.42, metalness: 0.85 }),
  nozzleExt: new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.6, metalness: 0.6 }),
  j2: new THREE.MeshStandardMaterial({ color: 0x5c5650, roughness: 0.38, metalness: 0.9 }),
  inner: new THREE.MeshStandardMaterial({ color: 0x2b2c2e, roughness: 0.8 }),
  heat: new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.9, metalness: 0.2 }),
  silver: new THREE.MeshStandardMaterial({ color: 0xd8dbe0, roughness: 0.22, metalness: 1.0 }),
  mylar: new THREE.MeshStandardMaterial({ color: 0xe0dcd0, roughness: 0.15, metalness: 1.0 }),
  grey: new THREE.MeshStandardMaterial({ color: 0x8e9196, roughness: 0.6, metalness: 0.3 }),
  darkMetal: new THREE.MeshStandardMaterial({ color: 0x3b3d40, roughness: 0.5, metalness: 0.7 }),
  lut: new THREE.MeshStandardMaterial({ color: 0x9e3a22, roughness: 0.78, metalness: 0.25 }),
  mlGrey: new THREE.MeshStandardMaterial({ color: 0x7c7f82, roughness: 0.85, metalness: 0.2 }),
  concrete: new THREE.MeshStandardMaterial({ color: 0x9c988e, roughness: 0.95 }),
  tank: new THREE.MeshStandardMaterial({ color: 0xe9e8e3, roughness: 0.4, metalness: 0.1 }),
  soot: new THREE.MeshStandardMaterial({ color: 0x1b1a18, roughness: 1 })
};

/* ================================================================== SATURN V */
function lathe(points, seg = Q.seg) { return new THREE.LatheGeometry(points.map(p => new THREE.Vector2(p[0], p[1])), seg); }
/* Fewer shader variants compile faster: instead of side: DoubleSide / BackSide
 * materials we add an explicitly flipped copy of the geometry. */
function flipGeo(g) {
  const f = g.index ? g.toNonIndexed() : g.clone();
  const pos = f.attributes.position, nrm = f.attributes.normal, uv = f.attributes.uv;
  for (let i = 0; i < pos.count; i += 3) {
    for (const a of [pos, nrm, uv].filter(Boolean)) {
      for (let c = 0; c < a.itemSize; c++) { const t = a.getComponent(i + 1, c); a.setComponent(i + 1, c, a.getComponent(i + 2, c)); a.setComponent(i + 2, c, t); }
    }
  }
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, -nrm.getX(i), -nrm.getY(i), -nrm.getZ(i));
  return f;
}
function twoSided(g) { const a = g.index ? g.toNonIndexed() : g; return mergeGeometries([a, flipGeo(a)]); }
function cyl(rt, rb, h, seg = Q.seg, open = false) { return new THREE.CylinderGeometry(rt, rb, h, seg, 1, open); }
function mesh(geo, mat, parent, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  if (parent) parent.add(m);
  return m;
}
/* F-1: 3.76 m exit diameter, 5.8 m long; tube-wall upper nozzle, dark nozzle
 * extension below the turbine-exhaust manifold (the torus). */
function makeF1() {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 16; i++) { const y = i / 16 * 4.8; prof.push([0.47 + 1.41 * Math.pow(1 - y / 4.8, 1.7), y]); }
  const ext = prof.filter(p => p[1] <= 2.3), up = prof.filter(p => p[1] >= 2.25);
  mesh(twoSided(lathe(ext.slice().reverse())), MAT.nozzleExt, g);
  mesh(twoSided(lathe(up.slice().reverse())), MAT.nozzle, g);
  mesh(lathe([[0.55, 4.7], [0.62, 5.2], [0.62, 5.6], [0.3, 5.9]]), MAT.darkMetal, g);
  const manifold = mesh(new THREE.TorusGeometry(0.98, 0.13, 10, Q.seg), MAT.darkMetal, g, 0, 2.3, 0); manifold.rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(1.88, 0.05, 6, Q.seg), MAT.darkMetal, g, 0, 0.02, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.7, 1.2, 0.7), MAT.darkMetal, g, 0.8, 5.0, 0.2); // turbopump (hint)
  return g;
}
/* J-2: 2.0 m exit diameter, 3.4 m long. */
function makeJ2() {
  const g = new THREE.Group();
  const prof = [];
  for (let i = 0; i <= 12; i++) { const y = i / 12 * 2.6; prof.push([0.26 + 0.74 * Math.pow(1 - y / 2.6, 1.8), y]); }
  mesh(twoSided(lathe(prof.slice().reverse())), MAT.j2, g);
  mesh(lathe([[0.3, 2.55], [0.34, 2.9], [0.2, 3.3]]), MAT.darkMetal, g);
  mesh(new THREE.TorusGeometry(1.0, 0.03, 6, Q.seg), MAT.darkMetal, g, 0, 0.02, 0).rotation.x = Math.PI / 2;
  return g;
}
const OUTER4 = [45, 135, 225, 315].map(a => a * DEG);

function buildSaturnV() {
  const rocket = new THREE.Group(); rocket.name = 'SaturnV';
  const parts = {};

  /* ---------- S-IC ---------- */
  const sic = new THREE.Group(); parts.sic = sic; rocket.add(sic);
  const sicSkin = stageSkin({
    height: ST.sicTop - ST.heat, radius: R1, seams: 16, dirt: 1,
    bands: [
      { type: 'roll', y0: 0, y1: 14.4, n: 8, off: 0 },                 // lower roll pattern
      { type: 'line', y0: 6.4 }, { type: 'line', y0: 19.9 },
      { type: 'black', y0: 19.9, y1: 26.0, corr: true },               // intertank
      { type: 'roll', y0: 33.2, y1: 36.46, n: 8, off: 0.0, corr: true },// forward skirt
      { type: 'line', y0: 33.2 }
    ],
    // "UNITED STATES" stacked on the white quarter-panels, flag above (as on AS-506)
    letters: { text: 'UNITED STATES', u: [0.6875, 0.1875], yTop: 20.6, size: 1.42, gap: 0.12 },
    flags: [{ u: 0.6875, y: 27.6, w: 4.6, h: 2.9 }, { u: 0.1875, y: 27.6, w: 4.6, h: 2.9 }]
  });
  const sicBody = mesh(cyl(R1, R1, ST.sicTop - ST.heat, Q.seg * 2, true), MAT.paint(sicSkin), sic, 0, (ST.sicTop + ST.heat) / 2, 0);
  sicBody.name = 'sicBody';
  mesh(cyl(R1 - 0.05, R1 - 0.05, 0.4, Q.seg), MAT.heat, sic, 0, ST.heat, 0);            // base heat shield
  mesh(cyl(R1 * 0.98, R1 * 0.98, 0.1, Q.seg), MAT.black, sic, 0, ST.sicTop - 0.05, 0);   // top closure
  // engines
  const f1c = makeF1(); sic.add(f1c); f1c.position.set(0, 0.25, 0);
  parts.f1 = [f1c];
  for (const a of OUTER4) {
    const e = makeF1(); e.position.set(Math.sin(a) * 3.25, 0, Math.cos(a) * 3.25); sic.add(e); parts.f1.push(e);
    // engine fairing: cone blending into the thrust structure
    const fair = mesh(cyl(0.95, 2.2, 8.4, 28), MAT.white, sic, Math.sin(a) * 4.45, 7.4, Math.cos(a) * 4.45);
    fair.rotation.y = a;
    mesh(cyl(2.2, 2.2, 0.25, 28), MAT.heat, sic, Math.sin(a) * 4.45, 3.2, Math.cos(a) * 4.45);
    // fin: swept leading edge, 3.6 m span beyond the fairing (fin-tip span ≈ 19 m)
    const s = new THREE.Shape();
    s.moveTo(0, 1.4); s.lineTo(0, 8.6); s.lineTo(3.55, 3.1); s.lineTo(3.55, 0.7); s.lineTo(0, 1.4);
    const fg = new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
    fg.translate(0, 0, -0.15);
    const fin = new THREE.Mesh(fg, MAT.white); fin.castShadow = true; fin.receiveShadow = true;
    const fr = new THREE.Group(); fr.rotation.y = a - Math.PI / 2; fr.add(fin); fin.position.set(6.1, 0, 0);
    sic.add(fr);
  }

  /* ---------- S-II aft interstage (drops 30 s after staging) ---------- */
  const ring = new THREE.Group(); parts.ring = ring; rocket.add(ring);
  const ringSkin = stageSkin({ height: ST.ringTop - ST.sicTop, radius: R1 + 0.02, seams: 16, dirt: 0.4, stringers: 96,
    bands: [{ type: 'line', y0: 0.2, ring: true }, { type: 'line', y0: 5.3, ring: true }] });
  mesh(cyl(R1 + 0.02, R1 + 0.02, ST.ringTop - ST.sicTop, Q.seg * 2, true), MAT.paint(ringSkin), ring, 0, (ST.ringTop + ST.sicTop) / 2, 0);
  for (let i = 0; i < 4; i++) { // ullage rockets
    const a = (i * 90 + 22) * DEG;
    mesh(cyl(0.22, 0.26, 2.6, 10), MAT.black, ring, Math.sin(a) * (R1 + 0.24), ST.sicTop + 2.6, Math.cos(a) * (R1 + 0.24));
  }
  ring.inner = mesh(flipGeo(cyl(R1 - 0.03, R1 - 0.03, ST.ringTop - ST.sicTop - 0.1, Q.seg, true)), MAT.inner, ring, 0, (ST.ringTop + ST.sicTop) / 2, 0);

  /* ---------- S-II ---------- */
  const sii = new THREE.Group(); parts.sii = sii; rocket.add(sii);
  const siiSkin = stageSkin({ height: ST.siiTop - ST.ringTop, radius: R1, seams: 12, dirt: 0.5,
    bands: [{ type: 'line', y0: 1.2 }, { type: 'line', y0: 16.8 }, { type: 'roll', y0: 16.8, y1: 19.3, n: 8, off: 0.0625, corr: true }] });
  mesh(cyl(R1, R1, ST.siiTop - ST.ringTop, Q.seg * 2, true), MAT.paint(siiSkin), sii, 0, (ST.siiTop + ST.ringTop) / 2, 0);
  mesh(cyl(R1 - 0.05, R1 - 0.05, 0.3, Q.seg), MAT.heat, sii, 0, ST.ringTop - 0.8, 0);
  mesh(lathe([[R1 - 0.1, ST.ringTop - 0.75], [3.6, ST.ringTop - 0.3], [1.5, ST.ringTop + 0.4], [0.01, ST.ringTop + 0.5]]), MAT.heat, sii);
  parts.j2ii = [];
  const j2c = makeJ2(); j2c.position.set(0, ST.sicTop + 1.35, 0); sii.add(j2c); parts.j2ii.push(j2c);
  for (const a of OUTER4) { const e = makeJ2(); e.position.set(Math.sin(a) * 2.65, ST.sicTop + 1.35, Math.cos(a) * 2.65); sii.add(e); parts.j2ii.push(e); }
  // S-II/S-IVB interstage flare (stays with the S-II)
  const flareSkin = stageSkin({ height: ST.flareTop - ST.siiTop, radius: 4.2, seams: 16, stringers: 80, bands: [] });
  mesh(cyl(R3, R1, ST.flareTop - ST.siiTop, Q.seg * 2, true), MAT.paint(flareSkin), sii, 0, (ST.flareTop + ST.siiTop) / 2, 0);
  mesh(flipGeo(cyl(R3 - 0.02, R1 - 0.05, ST.flareTop - ST.siiTop - 0.05, Q.seg, true)), MAT.inner, sii, 0, (ST.flareTop + ST.siiTop) / 2, 0);

  /* ---------- S-IVB + Instrument Unit + adapter + spacecraft ---------- */
  const sivb = new THREE.Group(); parts.sivb = sivb; rocket.add(sivb);
  const sivbSkin = stageSkin({ height: ST.sivbTop - ST.flareTop, radius: R3, seams: 8, dirt: 0.3,
    bands: [{ type: 'roll', y0: 0, y1: 2.8, n: 8, off: 0, corr: true }, { type: 'line', y0: 2.8 }, { type: 'line', y0: 10.6 }] });
  mesh(cyl(R3, R3, ST.sivbTop - ST.flareTop, Q.seg * 2, true), MAT.paint(sivbSkin), sivb, 0, (ST.sivbTop + ST.flareTop) / 2, 0);
  const j2iv = makeJ2(); j2iv.position.set(0, ST.siiTop + 1.1, 0); sivb.add(j2iv); parts.j2iv = [j2iv];
  mesh(lathe([[R3 - 0.05, ST.siiTop + 4.0], [2.2, ST.siiTop + 4.4], [0.01, ST.siiTop + 4.9]]), MAT.heat, sivb);
  mesh(flipGeo(cyl(R3 - 0.02, R3 - 0.02, 4.5, Q.seg, true)), MAT.inner, sivb, 0, ST.siiTop + 3.5, 0);
  for (const a of [Math.PI / 2, -Math.PI / 2]) { // auxiliary propulsion system (APS) modules
    const aps = mesh(new THREE.BoxGeometry(1.1, 2.0, 1.4), MAT.white, sivb, Math.sin(a) * (R3 + 0.45), ST.flareTop + 1.3, Math.cos(a) * (R3 + 0.45));
    aps.rotation.y = a;
  }
  const iuSkin = stageSkin({ height: ST.iuTop - ST.sivbTop, radius: R3, seams: 24, bands: [{ type: 'grey', y0: 0, y1: 0.91, c: '#c9cbce' }], stringers: 60 });
  mesh(cyl(R3, R3, ST.iuTop - ST.sivbTop, Q.seg * 2, true), MAT.paint(iuSkin), sivb, 0, (ST.iuTop + ST.sivbTop) / 2, 0);
  const slaSkin = stageSkin({ height: ST.slaTop - ST.iuTop, radius: 2.7, seams: 4, bands: [{ type: 'line', y0: 4.2 }], dirt: 0.2 });
  mesh(cyl(RSM, R3, ST.slaTop - ST.iuTop, Q.seg * 2, true), MAT.paint(slaSkin), sivb, 0, (ST.slaTop + ST.iuTop) / 2, 0);
  // Service Module: aluminium with white radiator panels
  const smTex = canvasTex(1024, 256, (g, w, h) => {
    g.fillStyle = '#c8ccd2'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#f2f2ee'; for (let i = 0; i < 6; i++) g.fillRect(i / 6 * w + 30, 30, w / 6 - 60, h - 60);
    g.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 24; i++) g.fillRect(i / 24 * w, 0, 1, h);
  });
  mesh(cyl(RSM, RSM, ST.smTop - ST.slaTop, Q.seg * 2, true), new THREE.MeshStandardMaterial({ map: smTex, bumpMap: FLAT_BUMP, bumpScale: 0, roughness: 0.3, metalness: 0.75 }), sivb, 0, (ST.smTop + ST.slaTop) / 2, 0);
  for (let i = 0; i < 4; i++) { // RCS quads
    const a = (i * 90 + 7) * DEG;
    const q = mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), MAT.silver, sivb, Math.sin(a) * (RSM + 0.2), ST.slaTop + 2.6, Math.cos(a) * (RSM + 0.2));
    q.rotation.y = a;
  }
  // Command Module (reflective Mylar-taped), hidden under the boost protective cover until tower jettison
  mesh(lathe([[RSM - 0.02, ST.smTop], [RSM - 0.02, ST.smTop + 0.2], [0.55, ST.cmTop - 0.35], [0.42, ST.cmTop - 0.2], [0.01, ST.cmTop - 0.1]]), MAT.mylar, sivb);
  mesh(cyl(RSM, RSM, 0.06, Q.seg), MAT.black, sivb, 0, ST.smTop, 0);

  /* ---------- Launch Escape System (tower + boost protective cover) ---------- */
  const les = new THREE.Group(); parts.les = les; rocket.add(les);
  mesh(lathe([[RSM + 0.04, ST.smTop - 0.05], [RSM + 0.04, ST.smTop + 0.25], [0.6, ST.cmTop - 0.25], [0.45, ST.cmTop + 0.05], [0.01, ST.cmTop + 0.1]]), MAT.white, les);
  // tower truss: four legs, tapering
  const trussMat = new THREE.MeshStandardMaterial({ color: 0xb8432a, roughness: 0.6, metalness: 0.35 });
  const legY0 = ST.cmTop - 0.2, legY1 = ST.cmTop + 3.2;
  for (let i = 0; i < 4; i++) {
    const a = (i * 90 + 45) * DEG;
    const p0 = new THREE.Vector3(Math.sin(a) * 0.95, legY0, Math.cos(a) * 0.95), p1 = new THREE.Vector3(Math.sin(a) * 0.42, legY1, Math.cos(a) * 0.42);
    const l = p0.distanceTo(p1);
    const leg = mesh(cyl(0.06, 0.06, l, 6), trussMat, les);
    leg.position.copy(p0).add(p1).multiplyScalar(0.5);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p1.clone().sub(p0).normalize());
    for (let k = 0; k < 3; k++) { // cross braces
      const f0 = k / 3, f1 = (k + 1) / 3;
      const b = (j) => { const aa = ((i + j) * 90 + 45) * DEG, f = j ? f1 : f0, r = lerp(0.95, 0.42, f); return new THREE.Vector3(Math.sin(aa) * r, lerp(legY0, legY1, f), Math.cos(aa) * r); };
      const q0 = b(0), q1 = b(1);
      const br = mesh(cyl(0.035, 0.035, q0.distanceTo(q1), 5), trussMat, les);
      br.position.copy(q0).add(q1).multiplyScalar(0.5);
      br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q1.clone().sub(q0).normalize());
    }
  }
  mesh(lathe([[0.45, legY1], [0.62, legY1 + 0.5], [0.33, legY1 + 1.0]]), MAT.darkMetal, les);    // motor skirt with 4 nozzles
  for (let i = 0; i < 4; i++) { const a = i * 90 * DEG; const n = mesh(cyl(0.09, 0.16, 0.5, 8), MAT.darkMetal, les, Math.sin(a) * 0.52, legY1 + 0.35, Math.cos(a) * 0.52); n.rotation.set(Math.cos(a) * 0.5, 0, -Math.sin(a) * 0.5); }
  mesh(cyl(0.33, 0.33, 4.4, 20), MAT.white, les, 0, legY1 + 3.2, 0);                                 // escape motor
  mesh(lathe([[0.33, legY1 + 5.4], [0.3, legY1 + 6.0], [0.24, legY1 + 6.4], [0.12, ST.top - 0.15], [0.01, ST.top]]), MAT.black, les); // canard section + Q-ball nose
  for (let i = 0; i < 2; i++) { const c = mesh(new THREE.BoxGeometry(0.04, 0.5, 0.35), MAT.black, les, (i ? 1 : -1) * 0.33, legY1 + 5.8, 0); }

  // separable groups pivot at their own centre so they tumble naturally
  const pivot = (g, y) => { g.children.forEach(c => c.position.y -= y); g.position.y = y; g.userData.pivot = y; };
  pivot(sic, 18); pivot(ring, (ST.sicTop + ST.ringTop) / 2); pivot(sii, 55); pivot(sivb, 80); pivot(les, 104);

  rocket.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return { rocket, parts };
}
const SV = buildSaturnV();
scene.add(SV.rocket);

/* ================================================================== PAD 39A + MOBILE LAUNCHER */
const pad = new THREE.Group(); world.add(pad);
const armPivots = [];
const holdArms = [], tsms = [];
function buildPad() {
  // ---- hardstand mound with flame trench (heightfield) ----
  const X0 = -330, X1 = 190, Z0 = -170, Z1 = 170, STEP = 2.5;
  const nx = Math.round((X1 - X0) / STEP) + 1, nz = Math.round((Z1 - Z0) / STEP) + 1;
  const pos = new Float32Array(nx * nz * 3), col = new Float32Array(nx * nz * 3);
  const hgt = (x, z) => {
    // rounded rectangle 130 × 120 m plateau, 1:3 slopes; 5 % crawler ramp to the west
    const dx = Math.max(Math.abs(x + 5) - 65, 0), dz = Math.max(Math.abs(z) - 60, 0);
    const dist = Math.hypot(dx, dz);
    let h = PAD_H * (1 - smooth(0, 38, dist));
    if (x < -60 && Math.abs(z) < 16) h = Math.max(h, clamp(PAD_H - (-60 - x) * 0.05, 0, PAD_H) * (1 - smooth(12, 16, Math.abs(z))));
    // flame trench: 18 m wide, open to the north and south
    const tr = (1 - smooth(8.5, 10.5, Math.abs(x))) * (1 - smooth(120, 135, Math.abs(z)));
    h = lerp(h, 0.2, tr);
    return Math.max(h, 0.15);
  };
  const c = new THREE.Color();
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = X0 + i * STEP, z = Z0 + j * STEP, k = (j * nx + i) * 3;
    const h = hgt(x, z);
    pos[k] = x; pos[k + 1] = h; pos[k + 2] = z;
    const n = Math.sin(x * 0.13) * Math.cos(z * 0.11) * 0.5 + Math.sin(x * 0.031 + z * 0.047) * 0.5;
    const top = smooth(PAD_H - 0.6, PAD_H - 0.05, h);
    const ramp = (x < -60 && Math.abs(z) < 13) ? 1 : 0;
    const trench = (Math.abs(x) < 10 && Math.abs(z) < 130) ? 1 : 0;
    const edge = 1 - smooth(0.2, 2.0, h);
    c.setRGB(0.12 + n * 0.02, 0.15 + n * 0.025, 0.07);                  // grass slopes
    c.lerp(new THREE.Color(0.13, 0.15, 0.075), edge);
    if (top > 0) c.lerp(new THREE.Color(0.47 + n * 0.03, 0.46 + n * 0.03, 0.42), top);
    if (ramp) c.lerp(new THREE.Color(0.46, 0.43, 0.38), Math.min(1, 0.4 + h / PAD_H));
    if (trench) c.setRGB(0.20, 0.19, 0.17);
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, d = a + nx, e = d + 1;
    idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const uvs = new Float32Array(nx * nz * 2), tex = new Uint8Array(nx * nz * 4);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i;
    uvs[k * 2] = (i + 0.5) / nx; uvs[k * 2 + 1] = (j + 0.5) / nz;
    for (let ch = 0; ch < 3; ch++) tex[k * 4 + ch] = Math.round(255 * Math.pow(clamp(col[k * 3 + ch], 0, 1), 1 / 2.2));
    tex[k * 4 + 3] = 255;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const gtex = new THREE.DataTexture(tex, nx, nz); gtex.colorSpace = THREE.SRGBColorSpace; gtex.magFilter = THREE.LinearFilter; gtex.needsUpdate = true;
  const ground = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: gtex, bumpMap: FLAT_BUMP, bumpScale: 0, roughness: 0.95 }));
  ground.receiveShadow = true; pad.add(ground);
  // trench walls + flame deflector (inverted V under the vehicle)
  const defl = new THREE.Shape(); defl.moveTo(-18, 0); defl.lineTo(0, 10.5); defl.lineTo(18, 0);
  const dg = new THREE.ExtrudeGeometry(defl, { depth: 17, bevelEnabled: false }); dg.translate(0, 0.2, -8.5);
  const dm = mesh(dg, MAT.soot, pad); dm.rotation.y = Math.PI / 2;

  // ---- Mobile Launcher base on six pedestals ----
  const ml = new THREE.Group(); pad.add(ml);
  const mlW = 48.8, mlD = 41.1, mlH = 7.6, zc = -5.5, hole = 13.7;
  const mlY = ML_BOTTOM + mlH / 2;
  const xs = (mlW - hole) / 2, zsN = (mlD / 2 - zc) - hole / 2, zsS = (mlD / 2 + zc) - hole / 2;
  mesh(new THREE.BoxGeometry(xs, mlH, mlD), MAT.mlGrey, ml, -(hole / 2 + xs / 2), mlY, zc);
  mesh(new THREE.BoxGeometry(xs, mlH, mlD), MAT.mlGrey, ml, (hole / 2 + xs / 2), mlY, zc);
  mesh(new THREE.BoxGeometry(hole, mlH, zsN), MAT.mlGrey, ml, 0, mlY, -hole / 2 - zsN / 2);
  mesh(new THREE.BoxGeometry(hole, mlH, zsS), MAT.mlGrey, ml, 0, mlY, hole / 2 + zsS / 2);
  mesh(new THREE.BoxGeometry(hole, 0.4, hole), MAT.soot, ml, 0, ML_BOTTOM + 0.3, 0).visible = false;
  // deck edge trim and details
  const trim = new THREE.MeshStandardMaterial({ color: 0x5b5e61, roughness: 0.7, metalness: 0.4 });
  mesh(new THREE.BoxGeometry(mlW + 0.4, 0.5, mlD + 0.4), trim, ml, 0, DECK + 0.2, zc).scale.y = 1;
  ml.children[ml.children.length - 1].visible = false;
  for (const [px, pz] of [[-20, -22], [20, -22], [-20, 0], [20, 0], [-20, 12], [20, 12]]) mesh(new THREE.BoxGeometry(3, 6.7, 3), MAT.darkMetal, ml, px, PAD_H + 3.35, pz);
  // hold-down arms (4) and tail service masts (3)
  for (const a of OUTER4) {
    const pv = new THREE.Group(); pv.position.set(Math.sin(a) * 7.2, DECK, Math.cos(a) * 7.2); pv.rotation.y = a; ml.add(pv);
    mesh(new THREE.BoxGeometry(1.6, 3.4, 2.6), MAT.darkMetal, pv, 0, 1.7, -0.6);
    const arm = new THREE.Group(); arm.position.set(0, 3.2, -1.2); pv.add(arm);
    mesh(new THREE.BoxGeometry(1.0, 0.9, 2.2), MAT.darkMetal, arm, 0, 0, -1.0);
    holdArms.push(arm);
  }
  for (const a of [0, 120, 240].map(d => (d + 90) * DEG)) {
    const pv = new THREE.Group(); pv.position.set(Math.sin(a) * 8.6, DECK, Math.cos(a) * 8.6); pv.rotation.y = a; ml.add(pv);
    mesh(new THREE.BoxGeometry(2.4, 1.2, 2.4), MAT.lut, pv, 0, 0.6, 0);
    const mast = new THREE.Group(); mast.position.set(0, 1.2, 0); pv.add(mast);
    mesh(new THREE.BoxGeometry(0.9, 8.5, 0.9), MAT.lut, mast, 0, 4.25, 0);
    mesh(new THREE.BoxGeometry(1.2, 1.0, 2.2), MAT.lut, mast, 0, 8.0, -0.8);
    tsms.push(mast);
  }

  // ---- Launch Umbilical Tower: instanced truss ----
  const T = 12.2, levels = 19, dy = TOWER_H / levels;
  const beam = new THREE.BoxGeometry(1, 1, 1);
  const trs = [];
  const add = (x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0) => trs.push({ x, y, z, sx, sy, sz, rx, ry, rz });
  for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(cx * T / 2, DECK + TOWER_H / 2, TOWER_Z + cz * T / 2, 0.9, TOWER_H, 0.9);
  for (let l = 1; l <= levels; l++) {
    const y = DECK + l * dy;
    add(0, y, TOWER_Z - T / 2, T, 0.55, 0.55); add(0, y, TOWER_Z + T / 2, T, 0.55, 0.55);
    add(-T / 2, y, TOWER_Z, 0.55, 0.55, T); add(T / 2, y, TOWER_Z, 0.55, 0.55, T);
    // floor grating hint
    if (l % 2 === 0) add(0, y - 0.2, TOWER_Z, T - 1, 0.12, T - 1);
    // X bracing on each face
    const dl = Math.hypot(T, dy), ang = Math.atan2(dy, T);
    for (const s of [-1, 1]) {
      add(0, y - dy / 2, TOWER_Z - T / 2, dl, 0.3, 0.3, 0, 0, s * ang);
      add(0, y - dy / 2, TOWER_Z + T / 2, dl, 0.3, 0.3, 0, 0, s * ang);
      add(-T / 2, y - dy / 2, TOWER_Z, 0.3, 0.3, dl, s * ang, 0, 0);
      add(T / 2, y - dy / 2, TOWER_Z, 0.3, 0.3, dl, s * ang, 0, 0);
    }
  }
  // hammerhead crane on top
  add(0, DECK + TOWER_H + 3, TOWER_Z, 4, 6, 4);
  add(0, DECK + TOWER_H + 6.5, TOWER_Z + 3, 3, 2, 24);
  add(0, DECK + TOWER_H + 8.5, TOWER_Z - 6, 2.4, 2.4, 3);
  add(0, DECK + TOWER_H + 12, TOWER_Z, 0.3, 6, 0.3); // lightning mast
  // merged into one geometry (one draw call, no instancing shader variant)
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
  const beams = trs.map((b) => { e.set(b.rx, b.ry, b.rz); q.setFromEuler(e); m4.compose(v.set(b.x, b.y, b.z), q, s3.set(b.sx, b.sy, b.sz)); return beam.clone().applyMatrix4(m4); });
  mesh(mergeGeometries(beams), MAT.lut, pad);
  // elevator core
  mesh(new THREE.BoxGeometry(4, TOWER_H, 4), new THREE.MeshStandardMaterial({ color: 0x6a6d70, roughness: 0.9 }), pad, 0, DECK + TOWER_H / 2, TOWER_Z - 1.5);

  // ---- swing arms (9). Heights are rocket stations (m above the nozzle exits). ----
  const arms = [
    { y: 27.5, r: R1, t: SEQ.arm1 }, { y: 40.5, r: R1, t: 0 }, { y: 45.0, r: R1, t: 0 }, { y: 56.0, r: R1, t: 0 },
    { y: 65.5, r: R1, t: 0 }, { y: 74.5, r: R3, t: 0 }, { y: 85.0, r: R3, t: 0 }, { y: 96.0, r: RSM, t: 0 },
    { y: 99.3, r: RSM, t: 'cm', white: true }
  ];
  for (const a of arms) {
    const face = TOWER_Z + T / 2;
    const len = -a.r - face + 0.2;
    const pv = new THREE.Group(); pv.position.set(T / 2 - 0.6, BASE_Y + a.y, face); pad.add(pv);
    const armG = new THREE.Group(); pv.add(armG);
    const w = a.white ? 2.4 : 1.9, hh = a.white ? 2.6 : 2.2;
    // truss box: four chords + panels
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) mesh(new THREE.BoxGeometry(0.22, 0.22, len), MAT.lut, armG, -(T / 2 - 0.6) + cx * w / 2, cy * hh / 2, len / 2);
    for (let k = 0; k <= Math.floor(len / 2.2); k++) {
      mesh(new THREE.BoxGeometry(w, 0.14, 0.14), MAT.lut, armG, -(T / 2 - 0.6), hh / 2, k * 2.2);
      mesh(new THREE.BoxGeometry(0.14, hh, 0.14), MAT.lut, armG, -(T / 2 - 0.6) - w / 2, 0, k * 2.2 + 1.1);
      mesh(new THREE.BoxGeometry(0.14, hh, 0.14), MAT.lut, armG, -(T / 2 - 0.6) + w / 2, 0, k * 2.2 + 1.1);
    }
    mesh(new THREE.BoxGeometry(w, 0.12, len), MAT.darkMetal, armG, -(T / 2 - 0.6), -hh / 2, len / 2);
    // umbilical lines
    for (let k = 0; k < 2; k++) mesh(cyl(0.12, 0.12, len * 0.9, 6), MAT.black, armG, -(T / 2 - 0.6) + (k - 0.5) * 0.7, -hh / 2 - 0.35, len * 0.5).rotation.x = Math.PI / 2;
    if (a.white) mesh(new THREE.BoxGeometry(3.2, 3.2, 3.0), MAT.white, armG, -(T / 2 - 0.6), 0.2, len - 1.2);
    armPivots.push({ g: armG, t: a.t });
  }

  // ---- propellant storage spheres and other pad furniture ----
  const sph = (x, z, r, h) => {
    mesh(new THREE.SphereGeometry(r, Q.seg, Q.seg / 2), MAT.tank, pad, x, h + r, z);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; mesh(cyl(0.35, 0.35, h + r * 0.5, 6), MAT.grey, pad, x + Math.sin(a) * r * 0.8, (h + r * 0.5) / 2, z + Math.cos(a) * r * 0.8); }
  };
  sph(-205, -225, 10.7, 3);   // liquid-oxygen sphere (north-west)
  sph(215, -210, 11.5, 3);    // liquid-hydrogen sphere (north-east)
  for (let i = 0; i < 3; i++) mesh(cyl(5, 5, 14, 24), MAT.tank, pad, -300 + i * 14, 7, -40);  // RP-1 tanks
  mesh(new THREE.BoxGeometry(30, 6, 18), MAT.concrete, pad, 150, 3, 120);                 // pad terminal connection room (hint)
  mesh(new THREE.BoxGeometry(12, 5, 12), MAT.concrete, pad, -120, 3, -150);
}
buildPad();
SV.rocket.traverse(o => { if (o.isMesh) o.castShadow = Q.shadow > 0; });

/* ================================================================== PLUMES */
const plumeVS = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  uniform float uLen, uR0, uR1, uK;
  varying float vS; varying vec3 vN; varying vec3 vV; varying float vAng; varying float vR;
  void main(){
    float s = clamp(-position.y, 0.0, 1.0);
    float grow = (1.0 - exp(-s*uK)) / (1.0 - exp(-uK));
    float r = mix(uR0, uR1, grow);
    vec3 p = vec3(position.x * r, -s*uLen, position.z * r);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vN = normalize(normalMatrix * normalize(vec3(position.x, (uR1-uR0)/uLen*0.5, position.z)));
    vV = -mv.xyz; vS = s; vAng = atan(position.z, position.x); vR = r;
    gl_Position = projectionMatrix * mv;
    #include <logdepthbuf_vertex>
  }`;
const plumeFS = /* glsl */`
  #include <logdepthbuf_pars_fragment>
  uniform float uTime, uI, uSoot, uSeed, uCore, uFade;
  uniform vec3 uC0, uC1, uC2;
  varying float vS; varying vec3 vN; varying vec3 vV; varying float vAng; varying float vR;
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
    float I = uI * smoothstep(0.0, 0.01, s) * (1.0 - smoothstep(uFade, 1.0, s)) * (0.5 + 0.9*n + 0.12*n2) * core;
    I *= 1.0 - soot * 0.92;
    gl_FragColor = vec4(col * I, 1.0);
  }`;
const plumeGeoCache = {};
function plumeGeo(seg) {
  if (!plumeGeoCache[seg]) { const g = new THREE.CylinderGeometry(1, 1, 1, seg, 48, true); g.translate(0, -0.5, 0); plumeGeoCache[seg] = g; }
  return plumeGeoCache[seg];
}
function makePlume(opts) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uLen: { value: opts.len }, uR0: { value: opts.r0 }, uR1: { value: opts.r1 }, uK: { value: opts.k || 2 },
      uTime: { value: 0 }, uI: { value: 0 }, uSoot: { value: opts.soot || 0 }, uSeed: { value: Math.random() * 10 },
      uCore: { value: opts.core || 1.4 }, uFade: { value: opts.fade ?? 0.3 },
      uC0: { value: new THREE.Color(...opts.c0) }, uC1: { value: new THREE.Color(...opts.c1) }, uC2: { value: new THREE.Color(...opts.c2) }
    },
    vertexShader: plumeVS, fragmentShader: plumeFS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const p = new THREE.Mesh(plumeGeo(opts.seg || 32), m);
  p.frustumCulled = false; p.renderOrder = 5;
  return p;
}
// F-1 (RP-1/LOX, fuel-rich): dark gas-generator exhaust film right at the exit, then brilliant yellow-orange.
const F1C = { c0: [1.0, 0.86, 0.55], c1: [1.0, 0.52, 0.16], c2: [0.8, 0.22, 0.04] };
// J-2 (LH2/LOX): almost transparent, faint blue-violet with a pale core.
const J2C = { c0: [0.75, 0.8, 1.0], c1: [0.35, 0.42, 0.95], c2: [0.18, 0.18, 0.6] };
const plumes = { f1: [], f1Env: null, j2ii: [], j2iiEnv: null, j2iv: null, retro: [], ullage: [], lesJ: null, sivbUllage: [] };
function buildPlumes() {
  const P = SV.parts;
  P.f1.forEach((e, i) => {
    const p = makePlume({ len: 40, r0: 1.75, r1: 2.8, k: 2, soot: 1, ...F1C, core: 1.1, fade: 0.25 });
    p.position.set(e.position.x, e.position.y + 0.02, e.position.z); P.sic.add(p); plumes.f1.push(p);
  });
  plumes.f1Env = makePlume({ len: 120, r0: 6.5, r1: 9, k: 1, soot: 0.5, c0: [1, 0.75, 0.4], c1: [1, 0.5, 0.15], c2: [0.6, 0.2, 0.05], core: 2.2, fade: 0.12, seg: 48 });
  plumes.f1Env.position.set(0, 0.3, 0); P.sic.add(plumes.f1Env);
  P.j2ii.forEach((e) => {
    const p = makePlume({ len: 14, r0: 0.98, r1: 1.4, k: 3, ...J2C, core: 1.6, fade: 0.2 });
    p.position.copy(e.position); P.sii.add(p); plumes.j2ii.push(p);
  });
  plumes.j2iiEnv = makePlume({ len: 90, r0: 4.2, r1: 30, k: 3, c0: [0.7, 0.75, 1.0], c1: [0.4, 0.45, 0.95], c2: [0.2, 0.2, 0.6], core: 0.7, fade: 0.1, seg: 48 });
  plumes.j2iiEnv.position.set(0, ST.sicTop + 1.4 - SV.parts.sii.userData.pivot, 0); P.sii.add(plumes.j2iiEnv);
  plumes.j2iv = makePlume({ len: 50, r0: 0.98, r1: 18, k: 3, ...J2C, core: 1.2, fade: 0.1 });
  plumes.j2iv.position.copy(P.j2iv[0].position); P.sivb.add(plumes.j2iv);
  // S-IC retro-rockets: two per fairing, firing forward (up) at separation
  for (const a of OUTER4) for (const s of [-1, 1]) {
    const p = makePlume({ len: 14, r0: 0.3, r1: 2.5, k: 2, c0: [1, 0.95, 0.8], c1: [1, 0.6, 0.25], c2: [0.7, 0.3, 0.1], core: 1.0, fade: 0.2, seg: 16 });
    p.rotation.x = Math.PI; // pointing up
    p.position.set(Math.sin(a + s * 0.12) * 5.2, 11.3 - SV.parts.sic.userData.pivot, Math.cos(a + s * 0.12) * 5.2);
    P.sic.add(p); plumes.retro.push(p);
  }
  // S-II ullage rockets (aft-pointing)
  for (let i = 0; i < 4; i++) {
    const a = (i * 90 + 22) * DEG;
    const p = makePlume({ len: 7, r0: 0.22, r1: 1.1, k: 2, c0: [1, 0.95, 0.8], c1: [1, 0.6, 0.25], c2: [0.7, 0.3, 0.1], core: 1.0, fade: 0.2, seg: 16 });
    p.position.set(Math.sin(a) * (R1 + 0.24), ST.sicTop + 1.3 - SV.parts.ring.userData.pivot, Math.cos(a) * (R1 + 0.24));
    P.ring.add(p); plumes.ullage.push(p);
  }
  // LES tower-jettison motor
  plumes.lesJ = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const p = makePlume({ len: 9, r0: 0.12, r1: 1.8, k: 2, c0: [1, 0.95, 0.85], c1: [1, 0.65, 0.3], c2: [0.7, 0.3, 0.1], core: 1.0, fade: 0.2, seg: 16 });
    p.rotation.z = (i ? 1 : -1) * 0.55; plumes.lesJ.add(p);
  }
  plumes.lesJ.position.set(0, ST.cmTop + 3.6 - SV.parts.les.userData.pivot, 0);
  P.les.add(plumes.lesJ);
  // S-IVB auxiliary propulsion ullage engines
  for (const a of [Math.PI / 2, -Math.PI / 2]) {
    const p = makePlume({ len: 6, r0: 0.08, r1: 0.9, k: 2, ...J2C, core: 1.0, fade: 0.2, seg: 12 });
    p.position.set(Math.sin(a) * (R3 + 0.45), ST.flareTop + 0.3 - SV.parts.sivb.userData.pivot, Math.cos(a) * (R3 + 0.45));
    P.sivb.add(p); plumes.sivbUllage.push(p);
  }
}
buildPlumes();
// bright glow sprite at the engine cluster (feeds the bloom)
const glowTex = canvasTex(128, 128, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,220,160,0.7)'); gr.addColorStop(0.5, 'rgba(255,140,60,0.18)'); gr.addColorStop(1, 'rgba(255,100,40,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc080, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
glow.scale.set(40, 40, 1); glow.renderOrder = 6; scene.add(glow);

/* ================================================================== SMOKE (pad clouds + contrail) */
const smokeTex = canvasTex(512, 512, (g, w, h) => {
  // 2 × 2 atlas of soft cumulus puffs built from overlapping radial gradients
  for (let t = 0; t < 4; t++) {
    const ox = (t % 2) * 256, oy = Math.floor(t / 2) * 256;
    let seed = t * 97 + 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 38; i++) {
      const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.7) * 70;
      const x = ox + 128 + Math.cos(a) * r, y = oy + 128 + Math.sin(a) * r * 0.9, rr = 26 + rnd() * 46;
      const gr = g.createRadialGradient(x - rr * 0.25, y - rr * 0.25, 0, x, y, rr);
      // bright core, darker rim: overlapping blobs leave darker creases = billowy detail
      gr.addColorStop(0, `rgba(255,255,255,${0.24 + rnd() * 0.2})`); gr.addColorStop(0.55, 'rgba(210,210,210,0.12)'); gr.addColorStop(1, 'rgba(150,150,150,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
  }
}, false);
smokeTex.wrapS = THREE.ClampToEdgeWrapping;
const MAX_PUFFS = 3600;
const puffGeo = new THREE.InstancedBufferGeometry();
puffGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
puffGeo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
puffGeo.setIndex([0, 1, 2, 0, 2, 3]);
const aPos = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 3), 3).setUsage(THREE.DynamicDrawUsage);
const aData = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage); // size, alpha, rot, tile
const aShade = new THREE.InstancedBufferAttribute(new Float32Array(MAX_PUFFS * 4), 4).setUsage(THREE.DynamicDrawUsage); // tint rgb, glow
puffGeo.setAttribute('iPos', aPos); puffGeo.setAttribute('iData', aData); puffGeo.setAttribute('iShade', aShade);
puffGeo.instanceCount = 0;
const puffMat = new THREE.ShaderMaterial({
  uniforms: { uMap: { value: smokeTex }, uSunV: { value: new THREE.Vector3() }, uSunC: { value: new THREE.Color(1, 0.96, 0.9) }, uAmb: { value: new THREE.Color(0.35, 0.42, 0.55) }, uFlame: { value: new THREE.Color(1.0, 0.58, 0.26) } },
  vertexShader: /* glsl */`
    #include <common>
    #include <logdepthbuf_pars_vertex>
    attribute vec3 iPos; attribute vec4 iData; attribute vec4 iShade;
    varying vec2 vUv; varying vec2 vQ; varying float vA; varying vec4 vShade; varying float vRot;
    void main(){
      vec4 mv = modelViewMatrix * vec4(iPos, 1.0);
      float c = cos(iData.z), s = sin(iData.z);
      vec2 q = position.xy;
      vec2 p = vec2(c*q.x - s*q.y, s*q.x + c*q.y);
      mv.xy += p * iData.x;
      gl_Position = projectionMatrix * mv;
      float t = iData.w;
      vUv = (uv + vec2(mod(t, 2.0), floor(t / 2.0))) * 0.5;
      vQ = q * 2.0; vShade = iShade; vRot = iData.z;
      float dist = length((modelViewMatrix * vec4(iPos, 1.0)).xyz);
      vA = iData.y * smoothstep(iData.x * 0.25, iData.x * 1.1, dist);   // soft near fade (camera inside a cloud)
      #include <logdepthbuf_vertex>
    }`,
  fragmentShader: /* glsl */`
    #include <logdepthbuf_pars_fragment>
    uniform sampler2D uMap; uniform vec3 uSunV, uSunC, uAmb, uFlame;
    varying vec2 vUv; varying vec2 vQ; varying float vA; varying vec4 vShade; varying float vRot;
    void main(){
      #include <logdepthbuf_fragment>
      vec4 tx = texture2D(uMap, vUv);
      float a = tx.a * vA;
      if (a < 0.003) discard;
      // fake sphere normal (rotated back into view space)
      float c = cos(-vRot), s = sin(-vRot);
      vec2 q = vQ;
      float z = sqrt(max(0.0, 1.0 - dot(q, q)));
      vec3 n = normalize(vec3(q, z + 0.35));
      float diff = clamp(dot(n, uSunV) * 0.6 + 0.45, 0.0, 1.0);
      vec3 lit = vShade.rgb * (uSunC * diff * 1.1 + uAmb * 0.5) * (0.45 + 0.65 * tx.r);
      lit += uFlame * vShade.a * (0.5 + 0.5 * clamp(-n.y + 0.3, 0.0, 1.0));
      gl_FragColor = vec4(lit * a, a);
    }`,
  transparent: true, depthWrite: false, blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor
});
const puffs = new THREE.Mesh(puffGeo, puffMat);
puffs.frustumCulled = false; puffs.renderOrder = 4;
scene.add(puffs);

// deterministic pad-cloud particle list (positions are functions of time → jump-safe)
let seedN = 12345;
const rnd = () => (seedN = (seedN * 16807) % 2147483647) / 2147483647;
let padParticles = [];
function buildPadParticles() {
  seedN = 12345;
  padParticles = [];
  const N = Q.puffs;
  for (let i = 0; i < N; i++) {
    const u = rnd();
    let e;
    if (u < 0.46) {                                  // flame trench exits (north / south): the big billows
      const side = rnd() < 0.5 ? -1 : 1;
      const tb = lerp(-7.2, 24, Math.pow(rnd(), 1.35));
      const sp = lerp(45, 120, rnd()) * (tb < 12 ? 1 : 0.6);
      const spread = (rnd() - 0.5) * 1.1;
      e = { tb, p0: [(rnd() - 0.5) * 18, 2 + rnd() * 6, side * 126], v0: [Math.sin(spread) * sp * 0.7, 6 + rnd() * 22, side * Math.cos(spread) * sp],
        k: 0.16 + rnd() * 0.12, buoy: 2 + rnd() * 5, s0: 16 + rnd() * 14, sg: 60 + rnd() * 70, life: 70 + rnd() * 80, a0: 0.7 + rnd() * 0.3,
        tint: tb < -3 ? 0.74 + rnd() * 0.12 : 0.86 + rnd() * 0.12, warm: 1 };
    } else if (u < 0.66) {                           // water-deluge steam around the launcher base
      const a = rnd() * Math.PI * 2, r = 22 + rnd() * 16;
      const tb = lerp(-7.5, 30, Math.pow(rnd(), 1.1));
      e = { tb, p0: [Math.sin(a) * r, ML_BOTTOM - 3 + rnd() * 10, Math.cos(a) * r - 5], v0: [Math.sin(a) * (10 + rnd() * 25), 3 + rnd() * 8, Math.cos(a) * (10 + rnd() * 25)],
        k: 0.12, buoy: 2 + rnd() * 4, s0: 12 + rnd() * 10, sg: 40 + rnd() * 40, life: 60 + rnd() * 60, a0: 0.6 + rnd() * 0.3, tint: 0.9 + rnd() * 0.08, warm: 0.8 };
    } else if (u < 0.82) {                           // plume hitting the deck right after release
      const a = rnd() * Math.PI * 2;
      const tb = lerp(0.1, 10, rnd());
      const sp = 30 + rnd() * 55;
      e = { tb, p0: [Math.sin(a) * 9, DECK + 1, Math.cos(a) * 9], v0: [Math.sin(a) * sp, 4 + rnd() * 10, Math.cos(a) * sp],
        k: 0.24, buoy: 3 + rnd() * 4, s0: 12 + rnd() * 8, sg: 45 + rnd() * 40, life: 60 + rnd() * 60, a0: 0.65 + rnd() * 0.3, tint: 0.85 + rnd() * 0.12, warm: 1 };
    } else {                                         // ground cloud spreading as the vehicle climbs off the pad
      const a = rnd() * Math.PI * 2;
      const tb = lerp(4, 26, rnd());
      const sp = 25 + rnd() * 50;
      e = { tb, p0: [Math.sin(a) * 25, PAD_H + 4, Math.cos(a) * 25], v0: [Math.sin(a) * sp, 6 + rnd() * 12, Math.cos(a) * sp],
        k: 0.12, buoy: 3 + rnd() * 5, s0: 20 + rnd() * 14, sg: 70 + rnd() * 60, life: 70 + rnd() * 70, a0: 0.55 + rnd() * 0.3, tint: 0.88 + rnd() * 0.1, warm: 1 };
    }
    e.rot = rnd() * 6.28; e.spin = (rnd() - 0.5) * 0.06; e.tile = Math.floor(rnd() * 4);
    padParticles.push(e);
  }
}
buildPadParticles();
const WIND = [2.2, 0, 1.4]; // light breeze, m/s (towards east-south-east)
const padPos = (e, age, out) => {
  const k = e.k, f = (1 - Math.exp(-k * age)) / k;
  out[0] = e.p0[0] + e.v0[0] * f + WIND[0] * age;
  out[1] = e.p0[1] + e.v0[1] * f + e.buoy * age * (1 - Math.exp(-age / 6));
  out[2] = e.p0[2] + e.v0[2] * f + WIND[2] * age;
  if (out[1] < 1) out[1] = 1;
  return out;
};

/* ================================================================== SIMULATION STATE */
let sim = new AscentSim();
let running = false, paused = false, warp = 1, launched = false;
const origin = [0, BASE_Y, 0];          // floating origin (pad frame, float64)
const rocketPose = { pos: [0, BASE_Y, 0], q: new THREE.Quaternion(), axis: new THREE.Vector3(0, 1, 0), phi: 0 };
const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), qC = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

// 2-D sim (inertial) → 3-D pad frame. Earth-fixed polar angle φ along the flight plane.
function toPad(phi, r, out) {
  const s = Math.sin(phi), c = Math.cos(phi);
  out[0] = FLIGHT_DIR.x * r * s; out[1] = r * c - RE; out[2] = FLIGHT_DIR.z * r * s;
  return out;
}
function updatePose() {
  const t = sim.t;
  const ef = sim.earthFixed(sim.x, sim.y);
  const hBase = ef.r - RE; // sim altitude (0 at the pad)
  toPad(ef.phi, RE + BASE_Y + hBase, rocketPose.pos);
  rocketPose.phi = ef.phi;
  // roll program 13.2–31.1 s: pad azimuth 90° → flight azimuth 72°
  const roll = -18 * DEG * smooth(SEQ.rollStart, SEQ.rollEnd, t);
  // yaw manoeuvre away from the tower (1.25°) between T+1.7 s and T+9.7 s
  const yaw = 1.25 * DEG * (smooth(1.7, 3.2, t) - smooth(9.7, 11.5, t));
  qA.setFromAxisAngle(PLANE_N, ef.phi + sim.pitch);
  qB.setFromAxisAngle(FLIGHT_DIR, yaw);
  qC.setFromAxisAngle(UP, roll);
  rocketPose.q.copy(qA).multiply(qB).multiply(qC);
  rocketPose.axis.copy(UP).applyQuaternion(rocketPose.q);
}

/* separated hardware: visuals follow the sim's debris list */
const debrisVis = new Map();
function attachDebris() {
  for (const b of sim.debris) {
    if (debrisVis.has(b)) continue;
    const g = b.kind === 'S-IC' ? SV.parts.sic : b.kind === 'interstage' ? SV.parts.ring : b.kind === 'S-II' ? SV.parts.sii : SV.parts.les;
    // offset of the part's own centre from the vehicle base, fixed at the moment of separation
    const axis0 = UP.clone().applyAxisAngle(PLANE_N, b.phi0 + b.pitch0);
    SV.rocket.remove(g); scene.add(g);
    const tumbleAxis = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    debrisVis.set(b, { g, rel: axis0.multiplyScalar(g.userData.pivot), tumbleAxis, tumble: (b.kind === 'LES' ? 0.05 : 0.015) * (Math.random() + 0.5) });
  }
}
function updateDebris() {
  const roll = -18 * DEG;
  for (const [b, v] of debrisVis) {
    const ef = sim.earthFixed(b.x, b.y);
    const p = toPad(ef.phi, RE + BASE_Y + ef.r - RE, tmpArr);
    const age = sim.t - b.t0;
    v.g.position.set(p[0] + v.rel.x - origin[0], p[1] + v.rel.y - origin[1], p[2] + v.rel.z - origin[2]);
    qA.setFromAxisAngle(PLANE_N, ef.phi + b.pitch);
    qB.setFromAxisAngle(UP, roll);
    qC.setFromAxisAngle(v.tumbleAxis, v.tumble * age);
    v.g.quaternion.copy(qA).multiply(qB).multiply(qC);
    const far = Math.hypot(v.g.position.x, v.g.position.y, v.g.position.z);
    v.g.visible = far < 60000 && b.h > -100;
  }
}
function reattachAll() {
  for (const [b, v] of debrisVis) { scene.remove(v.g); SV.rocket.add(v.g); v.g.position.set(0, v.g.userData.pivot, 0); v.g.quaternion.identity(); v.g.visible = true; }
  debrisVis.clear();
}

/* ================================================================== CAMERA */
let camMode = 'auto';
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enabled = false;
controls.minDistance = 20; controls.maxDistance = 4000;
const camState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 45, init: false, shot: '', shotT: 0 };
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();
const TRACK_SITE = [-2600, 4, 4700];   // ground tracking camera ≈ 5.4 km south-west of the pad
const PAD_CAM = [-150, PAD_H + 1.7, 100];     // camera on the edge of the hardstand, looking up
function rocketCenterLocal(frac = 0.45) { return tmpV3.copy(rocketPose.axis).multiplyScalar(110.6 * frac); }
function camFixed(site, lookFrac, zoomSize) {
  // a camera fixed on the ground (pad frame) looking at the rocket
  const p = tmpV.set(site[0] - origin[0], site[1] - origin[1], site[2] - origin[2]);
  const look = rocketCenterLocal(lookFrac).clone();
  let fov = 45;
  if (zoomSize) {
    const dist = p.distanceTo(look);
    fov = clamp(2 * Math.atan(zoomSize / dist) / DEG, 0.25, 55);
  }
  return { pos: p.clone(), look, fov };
}
function chaseCam(t, variant = 0) {
  // offsets in the rocket's frame: axis A (nose), side K (normal to the flight plane),
  // belly B = A × K. A sunward side is chosen so the camera sees the lit face.
  const A = rocketPose.axis, K = PLANE_N, B = tmpV2.crossVectors(A, K).normalize();
  const sideSign = K.dot(SUN) >= 0 ? 1 : -1;
  const h = sim.d.h;
  const hi = smooth(20000, 120000, h);
  let dist = lerp(200, 280, hi), fwd = lerp(20, 60, hi), belly = lerp(-0.25, 0.45, hi);
  if (variant === 1) { dist = 90; fwd = 30; belly = -0.1; }                        // close, staging
  if (variant === 2) { dist = 75; fwd = 125; belly = -0.3; }                       // front quarter, tower jettison
  if (variant === 3) { dist = 72; fwd = -30; belly = 0.25; }                       // in orbit: behind, above
  const pos = new THREE.Vector3().addScaledVector(A, fwd).addScaledVector(K, dist * sideSign).addScaledVector(B, dist * belly);
  pos.addScaledVector(A, Math.sin(t * 0.07) * 12).addScaledVector(B, Math.sin(t * 0.05) * 14);
  const look = rocketCenterLocal(variant === 2 ? 0.8 : 0.35).clone();
  if (hi > 0 && (variant === 0 || variant === 3)) { // look a little toward the Earth so the limb shows
    const toEarth = tmpV.set(-origin[0], -RE - origin[1], -origin[2]).normalize();
    look.addScaledVector(toEarth, dist * (variant === 3 ? 0.08 : 0.16) * hi);
  }
  return { pos, look, fov: variant ? 45 : 40 };
}
function onboardCam() {
  // a film camera on the interstage flange looking aft along the skin (like the Saturn V
  // onboard cameras), mounted on the side that sees both the Earth and the horizon
  const A = rocketPose.axis;
  const toEarth = tmpV.set(-origin[0], -RE - origin[1], -origin[2]).normalize();
  const eP = toEarth.clone().addScaledVector(A, -toEarth.dot(A)).normalize();
  const sideSign = PLANE_N.dot(SUN) >= 0 ? 1 : -1;
  const out = PLANE_N.clone().multiplyScalar(sideSign).addScaledVector(eP, 0.7).normalize();
  const afterSII = sim.flags.siiSep != null;
  const y = afterSII ? ST.flareTop + 1.2 : ST.flareTop - 0.6;
  const r = afterSII ? R3 + 1.4 : R1 + 1.6;
  const pos = new THREE.Vector3().addScaledVector(A, y).addScaledVector(out, r);
  const look = pos.clone().addScaledVector(A, -60).addScaledVector(out, 12);
  return { pos, look, fov: 66, up: out.clone().negate() };
}
function freeTarget() { return rocketCenterLocal(0.45).clone(); }

function directorShot(t) {
  if (!launched || t < SEQ.countStart) return 'idle';
  if (t < -10) return 'approach';
  if (t < 3.5) return 'wide';
  if (t < 12) return 'padcam';
  if (t < 40) return 'track';
  if (t < 70) return 'chaseLow';
  if (t < 118) return 'track2';
  if (t < 157) return 'chase';
  if (t < 186) return 'staging';
  if (t < 195.5) return 'onboard';
  if (t < 212) return 'les';
  if (t < 280) return 'chase';
  if (t < 320) return 'onboard';
  if (t < 540) return 'chase';
  if (t < 575) return 'staging';
  if (sim.insertT != null && t > sim.insertT + 3) return 'orbit';
  return 'chase';
}
let idleAngle = 0.6;
function computeCamera(dt, tReal) {
  const t = sim.t;
  let shot = camMode;
  if (camMode === 'auto') shot = directorShot(t);
  let c;
  switch (shot) {
    case 'idle': {
      idleAngle += dt * (Codex.reducedMotion ? 0.0 : 0.045);
      const r = 300 + Math.sin(tReal * 0.05) * 40;
      const a = idleAngle;
      c = { pos: new THREE.Vector3(Math.cos(a) * r - 10, 14 + Math.sin(tReal * 0.07) * 16, Math.sin(a) * r + 20), look: new THREE.Vector3(0, 40, -6), fov: 38 };
      break;
    }
    case 'approach': { const k = smooth(-30, -10, t); c = { pos: new THREE.Vector3(lerp(150, 95, k), lerp(20, 2, k), lerp(160, 105, k)), look: new THREE.Vector3(0, lerp(55, 35, k), 0), fov: 46 }; break; }
    case 'wide': { c = camFixed([-250, PAD_H + 1.7, 340], 0.4, null); c.fov = 40; break; }
    case 'padcam': case 'pad': { c = camFixed(PAD_CAM, 0.3, null); c.fov = 50; break; }
    case 'track': case 'track2': {
      const h = sim.d.h;
      c = camFixed(TRACK_SITE, 0.3, lerp(70, 150, smooth(0, 30000, h))); break;
    }
    case 'chaseLow': c = chaseCam(tReal, 0); break;
    case 'chase': c = chaseCam(tReal, 0); break;
    case 'staging': c = chaseCam(tReal, 1); break;
    case 'les': c = chaseCam(tReal, 2); break;
    case 'onboard': c = onboardCam(); break;
    case 'orbit': c = chaseCam(tReal, 3); break;
    default: c = chaseCam(tReal, 0);
  }
  if (camMode === 'free') {
    controls.enabled = true;
    const tg = freeTarget();
    const delta = tg.clone().sub(controls.target);
    controls.target.copy(tg); camera.position.add(delta);
    controls.update();
    camera.fov = lerp(camera.fov, 45, 0.1); camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0);
    return;
  }
  controls.enabled = false;
  const cut = shot !== camState.shot;
  if (cut || !camState.init) {
    camState.pos.copy(c.pos); camState.look.copy(c.look); camState.fov = c.fov; camState.init = true;
    camState.shot = shot; camState.shotT = tReal;
  } else {
    const fixedShot = shot === 'wide' || shot === 'padcam' || shot === 'pad' || shot === 'track' || shot === 'track2';
    const k = fixedShot ? 1 : 1 - Math.exp(-dt * 2.2);
    camState.pos.lerp(c.pos, shot === 'onboard' ? 1 : k);
    camState.look.lerp(c.look, fixedShot || shot === 'onboard' ? 1 : 1 - Math.exp(-dt * 4));
    camState.fov = lerp(camState.fov, c.fov, 1 - Math.exp(-dt * 3));
  }
  camera.position.copy(camState.pos);
  camera.up.copy(c.up || UP);
  if (!c.up) {
    // keep "up" as local vertical at the camera (matters 1,000 km downrange)
    const cp = [camera.position.x + origin[0], camera.position.y + origin[1] + RE, camera.position.z + origin[2]];
    const l = Math.hypot(cp[0], cp[1], cp[2]);
    camera.up.set(cp[0] / l, cp[1] / l, cp[2] / l);
  }
  camera.lookAt(camState.look);
  camera.fov = camState.fov;
  camera.updateProjectionMatrix();
}

/* ================================================================== AUDIO (optional, synthesised) */
const audio = { ctx: null, on: false, nodes: null, hist: [] };
function initAudio() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const len = ctx.sampleRate * 3;
  const mk = (fn) => { const b = ctx.createBuffer(1, len, ctx.sampleRate); const d = b.getChannelData(0); fn(d); const s = ctx.createBufferSource(); s.buffer = b; s.loop = true; return s; };
  let last = 0;
  const brown = mk(d => { for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } });
  const crackle = mk(d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() < 0.0016 ? (Math.random() * 2 - 1) : d[i - 1] * 0.86 || 0; });
  const white = mk(d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; });
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
  const lp2 = ctx.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 700;
  const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6;
  const gR = ctx.createGain(), gM = ctx.createGain(), gC = ctx.createGain(), master = ctx.createGain();
  gR.gain.value = gM.gain.value = gC.gain.value = 0; master.gain.value = 0.9;
  brown.connect(lp).connect(gR).connect(master);
  white.connect(lp2).connect(gM).connect(master);
  crackle.connect(bp).connect(gC).connect(master);
  const comp = ctx.createDynamicsCompressor(); master.connect(comp).connect(ctx.destination);
  brown.start(); white.start(); crackle.start();
  audio.ctx = ctx; audio.nodes = { gR, gM, gC };
}
function updateAudio(loud) {
  if (!audio.on || !audio.ctx) return;
  const n = audio.nodes, t = audio.ctx.currentTime;
  n.gR.gain.setTargetAtTime(loud * 1.0, t, 0.15);
  n.gM.gain.setTargetAtTime(loud * 0.22, t, 0.15);
  n.gC.gain.setTargetAtTime(loud * 0.9, t, 0.1);
}

/* ================================================================== HUD */
const EV = {
  count: { c: 'ice', t: 'Terminal count', d: 'The automatic ground launch sequencer runs the last seconds. The Saturn V is on internal power; its tanks are topped off and pressurised.' },
  ignition: { c: 'flame', t: '“Ignition sequence start”', d: 'The centre F-1 lights first, then the outer engines in opposing pairs 0.3 s apart. Four hold-down arms keep the rocket on the pad while thrust builds.' },
  allrunning: { c: 'flame', t: 'All engines running', d: 'Five F-1s at full power. Water deluge floods the launcher and the flame deflector throws the exhaust north and south along the trench.' },
  liftoff: { c: 'flame', t: 'Liftoff!', d: '' },
  tower: { c: 'flame', t: 'Tower clear', d: 'The engines pass the top of the tower. Control switches from the Launch Control Center at Kennedy to Mission Control in Houston.' },
  roll: { c: 'ice', t: 'Roll and pitch program', d: 'The vehicle rolls from the pad\'s 90° orientation to the 72° flight azimuth and starts leaning downrange over the Atlantic.' },
  rollEnd: { c: 'ice', t: 'Roll complete', d: 'Now the pitch program tilts the rocket so gravity bends the path toward horizontal: a gravity turn, with almost no sideways load on the airframe.' },
  mach1: { c: 'sol', t: 'Mach 1', d: '' },
  maxq: { c: 'sol', t: 'Maximum dynamic pressure (Max Q)', d: '' },
  ceco: { c: 'flame', t: 'S-IC centre engine cutoff', d: '' },
  oeco: { c: 'flame', t: 'S-IC outboard engine cutoff', d: '' },
  sicSep: { c: 'flame', t: 'Staging: S-IC separation', d: 'Explosive charges cut the first stage free. Eight solid retro-rockets in its engine fairings brake it while ullage rockets on the S-II settle the propellant at the tank bottoms.' },
  siiIgn: { c: 'ice', t: 'S-II ignition', d: 'Five J-2 engines burning liquid hydrogen and liquid oxygen. Hydrogen\'s light exhaust is fast: specific impulse (Isp) 424 s vs 304 s for the kerosene F-1, and the flame is nearly invisible.' },
  interstage: { c: 'ice', t: 'Interstage jettison', d: 'Thirty seconds after staging, once the flight is steady, the 5.5 m skirt around the J-2s drops away — it must slide past the running engines with little clearance.' },
  les: { c: 'ice', t: 'Launch Escape System (LES) jettison', d: 'The escape tower is no longer needed. Its jettison motor pulls the tower and the boost protective cover away, uncovering the Command Module\'s windows.' },
  igm: { c: 'ice', t: 'Closed-loop guidance', d: 'The Instrument Unit switches to Iterative Guidance Mode (IGM), steering for orbit. (Here: a simplified altitude-and-speed guidance law.)' },
  siiCeco: { c: 'ice', t: 'S-II centre engine cutoff', d: 'Shut down early to damp "pogo" — a longitudinal oscillation between the engines and the propellant feed lines.' },
  siiOeco: { c: 'ice', t: 'S-II cutoff', d: '' },
  siiSep: { c: 'ice', t: 'S-II separation', d: 'The second stage and the flared interstage fall away; the S-IVB\'s auxiliary propulsion system fires small ullage engines.' },
  sivbIgn: { c: 'ice', t: 'S-IVB ignition', d: 'One J-2 finishes the job. On Apollo 11 the same engine restarted 2 h 44 min after launch for Trans-Lunar Injection (TLI), the burn toward the Moon.' },
  sivbCut: { c: 'aurora', t: 'S-IVB cutoff', d: '' },
  insertion: { c: 'aurora', t: 'Earth parking orbit', d: '' }
};
const REAL = { mach1: 66.3, maxq: 83.0, ceco: 135.2, oeco: 161.63, sicSep: 162.3, siiIgn: 163.0, interstage: 192.3, les: 197.9, siiCeco: 460.62, siiOeco: 548.22, sivbIgn: 552.2, sivbCut: 699.33, insertion: 709.33, tower: null, roll: 13.2 };
function fmtClock(t) {
  const a = Math.floor(Math.abs(t) + (t < 0 ? 0.999 : 0)), m = Math.floor(a / 60), s = a - m * 60, h = Math.floor(m / 60);
  return `${String(h).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
function fmtT(t) { const sgn = t < 0 ? 'T−' : 'T+'; const a = Math.abs(t); return a >= 60 ? `${sgn}${Math.floor(a / 60)}:${(a % 60).toFixed(1).padStart(4, '0')}` : `${sgn}${a.toFixed(1)} s`; }
const fmt = (v, d = 0) => (isFinite(v) ? (Math.abs(v) < 0.5 * Math.pow(10, -d) ? 0 : v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) : '—');
function eventText(id) {
  const d = sim.d, e = EV[id];
  let text = e.d;
  if (id === 'liftoff') {
    const F = sim._F || 0, W = sim.m * G0;
    text = `Hold-down arms release. Thrust ${fmt(F / 1e6, 1)} MN beats weight ${fmt(W / 1e6, 1)} MN — thrust-to-weight only ${fmt(F / W, 2)}, so the ${fmt(sim.m / 1000, 0)}-tonne rocket creeps upward at ${fmt((F - W) / sim.m, 1)} m/s². Tapered pins drawn through dies soften the release over the first 15 cm.`;
  }
  if (id === 'mach1') text = `Faster than sound: ${fmt(d.vrel, 0)} m/s at ${fmt(d.h / 1000, 1)} km, where the air is ${fmt(d.atm.T - 273.15, 0)} °C and sound travels at ${fmt(d.atm.a, 0)} m/s. Shock waves now ride on the vehicle.`;
  if (id === 'maxq') text = `q = ½ρv² peaks at ${fmt(sim.max.q / 1000, 1)} kPa (${fmt(sim.max.qAlt / 1000, 1)} km): the air thins exponentially while speed grows, so their product has a maximum. This is the hardest moment for the structure.`;
  if (id === 'ceco') text = `The centre F-1 shuts down to cap the acceleration as the rocket gets lighter — it is already pulling ${fmt(sim.accelG(), 2)} g with ${fmt(sim.m / 1000, 0)} t left of ${fmt(MASS.ignition / 1000, 0)} t.`;
  if (id === 'oeco') text = `First stage done after burning ${fmt(sim.propUsed[0] / 1000, 0)} t of kerosene and oxygen: ${fmt(d.h / 1000, 1)} km up, ${fmt(d.downrange / 1000, 0)} km downrange, ${fmt(d.vrel, 0)} m/s. The crew are thrown forward in their straps as ${fmt(sim.max.g, 1)} g drops to almost zero.`;
  if (id === 'siiOeco') text = `The five J-2s have burned ${fmt(sim.propUsed[1] / 1000, 0)} t of hydrogen and oxygen. Altitude ${fmt(d.h / 1000, 0)} km, ${fmt(d.vin, 0)} m/s inertial — about ${fmt(d.vin / Math.sqrt(MU / d.r) * 100, 0)} % of orbital speed.`;
  if (id === 'sivbCut') text = `Guidance cuts the engine when the inertial speed reaches circular-orbit speed v = √(μ/r) = ${fmt(Math.sqrt(MU / d.r), 0)} m/s at ${fmt(d.h / 1000, 0)} km.`;
  if (id === 'insertion') { const o = sim.orbit(); text = `Orbit ${fmt(o.apo / 1000, 0)} × ${fmt(o.peri / 1000, 0)} km, one lap every ${fmt(2 * Math.PI * Math.sqrt(Math.pow(o.a, 3) / MU) / 60, 0)} min. Apollo 11 reached 185.9 × 183.2 km. Total Δv from the engines: ${fmt(sim.dvThrust, 0)} m/s.`; }
  const real = REAL[id];
  const realTxt = real != null ? `Apollo 11: ${fmtT(real)}` : '';
  return { text, realTxt };
}
const logEl = $('log'), capEl = $('caption');
let logged = 0, capTimer = null;
function pushEvent(ev, quiet) {
  const e = EV[ev.id]; if (!e) return;
  const { text, realTxt } = eventText(ev.id);
  const li = document.createElement('li');
  li.innerHTML = `<time>${fmtT(ev.t)}</time><b>${e.t}</b>${text}${realTxt ? `<span class="lx-real">${realTxt}</span>` : ''}`;
  if (!quiet) li.classList.add('new');
  logEl.prepend(li);
  if (!quiet) showCaption(e, ev, text);
}
function showCaption(e, ev, text) {
  capEl.innerHTML = `<div class="lx-cap ${e.c}"><div class="lx-cap-t">${fmtT(ev.t)}</div><h3>${e.t}</h3><p>${text}</p></div>`;
  const card = capEl.firstChild;
  if (gsap && !Codex.reducedMotion) gsap.fromTo(card, { opacity: 0, x: -24, filter: 'blur(6px)' }, { opacity: 1, x: 0, filter: 'blur(0px)', duration: 0.6, ease: 'power3.out' });
  clearTimeout(capTimer);
  capTimer = setTimeout(() => { if (gsap) gsap.to(card, { opacity: 0, duration: 0.8 }); else card.remove(); }, Math.max(6000, 9000 / Math.sqrt(warp)));
}

const R = { alt: $('rAlt'), vel: $('rVel'), mach: $('rMach'), q: $('rQ'), g: $('rG'), dr: $('rDr'), m: $('rM'), f: $('rF'), vin: $('rVin'), stage: $('rStage') };
const STAGE_NAMES = ['S-IC · 5 F-1', 'S-II · 5 J-2', 'S-IVB · J-2', 'S-IVB · orbit'];
function phaseText() {
  const t = sim.t, f = sim.flags;
  if (!launched) return 'On the pad · awaiting launch';
  if (t < SEQ.ignition) return 'Terminal count';
  if (t < 0) return 'Ignition · hold-down';
  if (sim.stage === 0 && t < SEQ.oeco) return f.maxq != null ? 'First stage · thinning air' : 'First stage · dense air';
  if (sim.stage === 0 || t < SEQ.siiIgn + 2) return 'Staging';
  if (sim.stage === 1) return 'Second stage · gaining speed';
  if (sim.stage === 2 && sim.cutoffT == null) return 'Third stage · to orbit';
  if (sim.stage === 2) return 'Cutoff · coasting';
  return 'Earth parking orbit';
}
function setText(el, html) { if (el._v !== html) { el.innerHTML = html; el._v = html; } }
function updateHUD() {
  const d = sim.d, t = sim.t;
  $('tSign').textContent = t < 0 ? 'T−' : 'T+';
  $('tVal').textContent = fmtClock(t);
  $('clock').classList.toggle('lx-hot', t >= SEQ.ignition && t < SEQ.oeco + 2 && launched);
  setText($('phase'), phaseText());
  const released = sim.released;
  const alt = released ? d.h : 0;
  setText(R.alt, `${fmt(alt / 1000, alt < 10000 ? 2 : 1)}<small>km</small>`);
  setText(R.vel, `${fmt(released ? d.vrel : 0, 0)}<small>m/s</small>`);
  setText(R.mach, fmt(released ? d.M : 0, 2));
  setText(R.q, `${fmt(released ? d.q / 1000 : 0, 1)}<small>kPa</small>`);
  const g = sim.accelG();
  setText(R.g, `${fmt(g, 2)}<small>g</small>`);
  setText(R.dr, `${fmt(Math.max(0, d.downrange) / 1000, d.downrange < 100000 ? 1 : 0)}<small>km</small>`);
  setText(R.m, `${fmt(sim.m / 1000, 0)}<small>t</small>`);
  setText(R.f, `${fmt((sim._F || 0) / 1e6, 2)}<small>MN</small>`);
  setText(R.vin, `${fmt(d.vin, 0)}<small>m/s</small>`);
  setText(R.stage, STAGE_NAMES[sim.stage]);
  $('mAlt').textContent = fmt(alt / 1000, 1); $('mVel').textContent = fmt(released ? d.vrel : 0, 0); $('mG').textContent = fmt(g, 2);
  document.querySelectorAll('#stagebar i').forEach(i => { const s = +i.dataset.s; i.classList.toggle('on', launched && s === sim.stage); i.classList.toggle('done', s < sim.stage); });
  // rocket equation panel
  const E = sim.stage === 0 ? ENGINES.F1 : ENGINES.J2;
  const nm = ['S-IC', 'S-II', 'S-IVB'][Math.min(2, sim.stage)];
  if (sim.stage <= 2) setText($('eqNow'), `${nm}: ${E.ispVac} s × 9.81 m/s² × ln(${fmt(sim.stageStart.m / 1000, 0)} t / ${fmt(sim.m / 1000, 0)} t) = ${fmt(sim.dvTsiol - sim.dvTsiolDone, 0)} m/s<br>all stages so far: ${fmt(sim.dvTsiol, 0)} m/s`);
  else setText($('eqNow'), `Three stages delivered ${fmt(sim.dvThrust, 0)} m/s of Δv to reach ${fmt(d.vin, 0)} m/s.`);
  const gained = released ? d.vin - V_ROT : 0;
  setText($('bTs'), fmt(sim.dvTsiol, 0)); setText($('bP'), fmt(sim.dvPress, 0)); setText($('bG'), fmt(sim.dvGrav, 0));
  setText($('bS'), fmt(sim.dvSteer, 0)); setText($('bD'), fmt(sim.dvDrag, 0)); setText($('bV'), fmt(gained, 0));
  drawCharts();
}
function prepCanvas(c) {
  const dpr = Math.min(devicePixelRatio, 2), w = c.clientWidth || 300, h = Math.round(w * c.height / c.width);
  if (c._w !== w) { c._w = w; c.width = w * dpr; c.height = h * dpr; c._h = h; c._dpr = dpr; }
  const g = c.getContext('2d'); g.setTransform(c._dpr, 0, 0, c._dpr, 0, 0); g.clearRect(0, 0, w, c._h);
  return [g, w, c._h];
}
const css = getComputedStyle(document.documentElement);
const COL = { ice: css.getPropertyValue('--ice').trim() || '#7cc8ff', flame: css.getPropertyValue('--flame').trim() || '#ff7a3d', nebula: css.getPropertyValue('--nebula').trim() || '#b18cff', aurora: css.getPropertyValue('--aurora').trim() || '#4ef0b8', muted: '#5d6589', line: 'rgba(150,170,255,.13)', text: '#c3cae6' };
function drawCharts() {
  const H = sim.hist;
  // altitude vs downrange
  {
    const c = $('profile'); if (!c.offsetParent) return;
    const [g, w, h] = prepCanvas(c);
    const maxX = Math.max(200, ...(H.length ? [H[H.length - 1].dr / 1000 * 1.1] : [0])), maxY = 220;
    const X = (x) => 30 + (w - 40) * x / maxX, Y = (y) => h - 18 - (h - 28) * y / maxY;
    g.strokeStyle = COL.line; g.lineWidth = 1; g.fillStyle = COL.muted; g.font = '10px JetBrains Mono, monospace';
    for (const y of [0, 50, 100, 150, 200]) { g.beginPath(); g.moveTo(30, Y(y)); g.lineTo(w - 6, Y(y)); g.stroke(); g.fillText(String(y), 2, Y(y) + 3); }
    g.fillText('km altitude', 34, 12); g.textAlign = 'right'; g.fillText(`${fmt(maxX, 0)} km downrange`, w - 6, h - 4); g.textAlign = 'left';
    // target orbit
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(78,240,184,.4)'; g.beginPath(); g.moveTo(30, Y(TARGET_ALT / 1000)); g.lineTo(w - 6, Y(TARGET_ALT / 1000)); g.stroke(); g.setLineDash([]);
    if (H.length > 1) {
      const gr = g.createLinearGradient(0, h, 0, 0); gr.addColorStop(0, COL.flame); gr.addColorStop(1, COL.ice);
      g.strokeStyle = gr; g.lineWidth = 2; g.beginPath();
      H.forEach((p, i) => { const x = X(p.dr / 1000), y = Y(p.h / 1000); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
      const L = H[H.length - 1]; g.fillStyle = '#fff'; g.beginPath(); g.arc(X(L.dr / 1000), Y(L.h / 1000), 3, 0, 7); g.fill();
      // staging markers
      g.fillStyle = COL.text;
      for (const [id, lab] of [['sicSep', 'S-IC sep'], ['siiSep', 'S-II sep'], ['insertion', 'orbit']]) {
        const ft = sim.flags[id]; if (ft == null) continue;
        const p = H.find(q => q.t >= ft); if (!p) continue;
        g.beginPath(); g.arc(X(p.dr / 1000), Y(p.h / 1000), 2.5, 0, 7); g.fill(); g.fillText(lab, X(p.dr / 1000) + 5, Y(p.h / 1000) + 12);
      }
    }
  }
  // Δv chart
  {
    const c = $('dvChart'); const [g, w, h] = prepCanvas(c);
    const maxT = Math.max(200, H.length ? H[H.length - 1].t * 1.05 : 0), maxV = Math.max(3000, H.length ? H[H.length - 1].ts * 1.1 : 0);
    const X = (x) => 34 + (w - 42) * x / maxT, Y = (y) => h - 18 - (h - 26) * y / maxV;
    g.strokeStyle = COL.line; g.fillStyle = COL.muted; g.font = '10px JetBrains Mono, monospace';
    const stepV = maxV > 6000 ? 2000 : 1000;
    for (let v = 0; v <= maxV; v += stepV) { g.beginPath(); g.moveTo(34, Y(v)); g.lineTo(w - 6, Y(v)); g.stroke(); g.fillText(`${v / 1000}k`, 4, Y(v) + 3); }
    g.textAlign = 'right'; g.fillText(`T+${fmt(maxT, 0)} s`, w - 6, h - 4); g.textAlign = 'left'; g.fillText('m/s', 36, 10);
    const line = (key, color, f) => { if (H.length < 2) return; g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); H.forEach((p, i) => { const v = f ? f(p) : p[key]; i ? g.lineTo(X(p.t), Y(v)) : g.moveTo(X(p.t), Y(v)); }); g.stroke(); };
    line('ts', COL.nebula); line('dv', COL.flame); line(null, COL.aurora, p => p.vin - V_ROT);
    for (const id of ['sicSep', 'siiSep']) { const ft = sim.flags[id]; if (ft == null) continue; g.strokeStyle = 'rgba(255,255,255,.18)'; g.setLineDash([2, 3]); g.beginPath(); g.moveTo(X(ft), 6); g.lineTo(X(ft), h - 18); g.stroke(); g.setLineDash([]); }
  }
}

/* ================================================================== FRAME UPDATE */
const clock = { last: performance.now(), getDelta() { const n = performance.now(), d = (n - this.last) / 1000; this.last = n; return d; } };
let tReal = 0, hudTimer = 0, shakeOn = true;
const shake = new THREE.Vector3();
const tmpArr = [0, 0, 0];
let sortIdx = new Uint32Array(MAX_PUFFS), sortKey = new Float32Array(MAX_PUFFS);
const puffTmp = { pos: new Float32Array(MAX_PUFFS * 3), data: new Float32Array(MAX_PUFFS * 4), shade: new Float32Array(MAX_PUFFS * 4) };

function flameState() {
  // overall F-1 thrust level 0..1 for lighting/smoke
  if (sim.stage !== 0 || sim.t < SEQ.ignition) return 0;
  const L = engineLevels(sim, sim.t); return L.reduce((a, b) => a + b, 0) / 5;
}

function updatePlumes(t) {
  const d = sim.d;
  const p = d.atm.p;
  const ex = clamp(Math.log10(101325 / Math.max(p, 1e-3)) / 3, 0, 1.7);   // plume expansion with falling ambient pressure
  const time = tReal;
  // F-1s
  const Lf = sim.stage === 0 ? engineLevels(sim, t) : [0, 0, 0, 0, 0];
  plumes.f1.forEach((pl, i) => {
    const l = Lf[i] || 0;
    const u = pl.material.uniforms;
    u.uTime.value = time + i * 3.1;
    u.uI.value = l * (1.15 - 0.4 * clamp(ex, 0, 1)) * (0.93 + 0.07 * Math.sin(time * 37 + i));
    u.uLen.value = (26 + 18 * ex) * (0.35 + 0.65 * l);
    u.uR1.value = 2.4 + 5.5 * ex * ex;
    u.uK.value = 1.5 + 3 * ex;
    pl.visible = l > 0.002;
  });
  {
    const fl = sim.stage === 0 ? flameState() : 0;
    const u = plumes.f1Env.material.uniforms;
    u.uTime.value = time; u.uI.value = fl * (0.65 - 0.32 * clamp(ex, 0, 1.4));
    u.uLen.value = (95 + 260 * ex) * (0.3 + 0.7 * fl);
    u.uR0.value = 6.2; u.uR1.value = 8.5 + 34 * ex * ex; u.uK.value = 1 + 3 * ex;
    u.uCore.value = 1.2 + 1.4 * clamp(ex, 0, 1);
    plumes.f1Env.visible = fl > 0.002;
    // the exhaust has nowhere to go but sideways while held down: shorten the visible flame
    if (sim.t < 1.5) u.uLen.value *= 0.55;
  }
  // S-II
  const Lii = sim.stage === 1 ? engineLevels(sim, t) : [0, 0, 0, 0, 0];
  plumes.j2ii.forEach((pl, i) => {
    const l = Lii[i] || 0, u = pl.material.uniforms;
    u.uTime.value = time + i; u.uI.value = l * 0.32; u.uLen.value = 12 + 12 * ex; u.uR1.value = 1.3 + 3 * ex; pl.visible = l > 0.002;
  });
  {
    const l = Lii.reduce((a, b) => a + b, 0) / 5, u = plumes.j2iiEnv.material.uniforms;
    u.uTime.value = time; u.uI.value = l * 0.05; u.uLen.value = 70 + 40 * ex; u.uR1.value = 16 + 14 * ex; plumes.j2iiEnv.visible = l > 0.002;
  }
  {
    const l = sim.stage === 2 ? engineLevels(sim, t)[0] : 0, u = plumes.j2iv.material.uniforms;
    u.uTime.value = time; u.uI.value = l * 0.3; u.uLen.value = 55; u.uR1.value = 16; plumes.j2iv.visible = l > 0.002;
  }
  // short-lived separation motors
  const pulse = (t0, dur) => { const a = t - t0; return a > 0 && a < dur ? Math.min(1, a * 8) * (1 - smooth(dur * 0.6, dur, a)) : 0; };
  const retro = pulse(SEQ.sicSep, 0.9);
  plumes.retro.forEach(p => { p.material.uniforms.uI.value = retro * 2.2; p.material.uniforms.uTime.value = time; p.visible = retro > 0; });
  const ull = pulse(SEQ.sicSep - 0.2, 3.9);
  plumes.ullage.forEach(p => { p.material.uniforms.uI.value = ull * 0.8; p.material.uniforms.uTime.value = time; p.visible = ull > 0; });
  const lj = pulse(SEQ.les, 1.4);
  plumes.lesJ.children.forEach(p => { p.material.uniforms.uI.value = lj * 1.1; p.material.uniforms.uTime.value = time; });
  plumes.lesJ.visible = lj > 0;
  const aps = pulse(SEQ.siiSep - 0.3, 4.5);
  plumes.sivbUllage.forEach(p => { p.material.uniforms.uI.value = aps * 1.4; p.material.uniforms.uTime.value = time; p.visible = aps > 0; });
  return ex;
}

function updateSmoke(camPos) {
  const t = sim.t;
  let n = 0;
  const P = puffTmp.pos, D = puffTmp.data, S = puffTmp.shade;
  const fl = flameState();
  const flameSrc = [rocketPose.pos[0] - rocketPose.axis.x * 12, rocketPose.pos[1] - rocketPose.axis.y * 12, rocketPose.pos[2] - rocketPose.axis.z * 12];
  const nearGround = fl * (1 - smooth(150, 700, sim.released ? sim.d.h : 0));
  // ---- pad clouds ----
  if (t > SEQ.ignition) for (const e of padParticles) {
    const age = t - e.tb; if (age <= 0 || age > e.life) continue;
    padPos(e, age, tmpArr);
    const size = e.s0 + e.sg * (1 - Math.exp(-age / 10)) + age * 0.45;
    const a = e.a0 * smooth(0, 0.8, age) * Math.pow(1 - age / e.life, 1.3);
    const k = n * 3, k4 = n * 4;
    P[k] = tmpArr[0] - origin[0]; P[k + 1] = tmpArr[1] - origin[1]; P[k + 2] = tmpArr[2] - origin[2];
    D[k4] = size; D[k4 + 1] = a; D[k4 + 2] = e.rot + e.spin * age; D[k4 + 3] = e.tile;
    S[k4] = e.tint; S[k4 + 1] = e.tint * 0.97; S[k4 + 2] = e.tint * 0.93;
    const dx = tmpArr[0] - flameSrc[0], dy = tmpArr[1] - flameSrc[1], dz = tmpArr[2] - flameSrc[2];
    S[k4 + 3] = nearGround * e.warm * 0.9 / (1 + (dx * dx + dy * dy + dz * dz) / 2500);
    if (++n >= MAX_PUFFS - Q.trail) break;
  }
  // ---- contrail from the trajectory history ----
  const H = sim.hist;
  if (sim.released && H.length > 1) {
    const maxN = Math.min(Q.trail, MAX_PUFFS - n);
    let cnt = 0;
    const pts = H.concat([{ t, h: sim.d.h, dr: sim.d.downrange }]);
    let carry = 0;
    for (let i = 1; i < pts.length && cnt < maxN; i++) {
      const a = pts[i - 1], b = pts[i];
      if (a.h > 52000) break;
      const segLen = Math.hypot(b.h - a.h, b.dr - a.dr);
      const hh = (a.h + b.h) / 2;
      const baseSize = 22 + hh * 0.004;
      const spacing = baseSize * 0.42;
      let s = carry;
      while (s < segLen && cnt < maxN) {
        const f = s / segLen;
        const h = lerp(a.h, b.h, f), dr = lerp(a.dr, b.dr, f), tb = lerp(a.t, b.t, f);
        const age = t - tb;
        const phi = dr / RE;
        toPad(phi, RE + BASE_Y + h - 30, tmpArr);
        // wind shear twists the column
        const wx = 7 * Math.sin(h / 2600) + 3, wz = 5 * Math.cos(h / 4100) + 1.5 + 12 * smooth(8000, 14000, h);
        const sz = baseSize + 2.2 * Math.sqrt(Math.max(age, 0)) * (1 + h / 15000);
        const alpha = 0.6 * (1 - smooth(9000, 42000, h)) * smooth(0, 0.6, age) * (1 - smooth(120, 260, age)) * (h < 60 ? smooth(20, 60, h) : 1);
        if (alpha > 0.004) {
          const k = n * 3, k4 = n * 4;
          P[k] = tmpArr[0] + wx * age - origin[0]; P[k + 1] = tmpArr[1] + age * 0.8 - origin[1]; P[k + 2] = tmpArr[2] + wz * age - origin[2];
          D[k4] = sz; D[k4 + 1] = alpha; D[k4 + 2] = (tb * 1.7) % 6.28; D[k4 + 3] = Math.floor(tb * 4) % 4;
          const tint = 0.74 + 0.08 * Math.sin(tb * 3.1) + 0.12 * smooth(3000, 20000, h);
          S[k4] = tint; S[k4 + 1] = tint * 0.97; S[k4 + 2] = tint * 0.94;
          S[k4 + 3] = age < 3 ? fl * (1 - age / 3) * 1.2 : 0;
          n++; cnt++;
        }
        s += spacing;
      }
      carry = s - segLen;
    }
  }
  // ---- sort back to front ----
  const cx = camPos.x, cy = camPos.y, cz = camPos.z;
  for (let i = 0; i < n; i++) {
    const dx = P[i * 3] - cx, dy = P[i * 3 + 1] - cy, dz = P[i * 3 + 2] - cz;
    sortKey[i] = -(dx * dx + dy * dy + dz * dz); sortIdx[i] = i;
  }
  const idx = Array.prototype.slice.call(sortIdx, 0, n).sort((a, b) => sortKey[a] - sortKey[b]);
  const op = aPos.array, od = aData.array, os = aShade.array;
  for (let j = 0; j < n; j++) {
    const i = idx[j];
    op[j * 3] = P[i * 3]; op[j * 3 + 1] = P[i * 3 + 1]; op[j * 3 + 2] = P[i * 3 + 2];
    for (let c = 0; c < 4; c++) { od[j * 4 + c] = D[i * 4 + c]; os[j * 4 + c] = S[i * 4 + c]; }
  }
  aPos.needsUpdate = aData.needsUpdate = aShade.needsUpdate = true;
  aPos.addUpdateRange(0, n * 3); aData.addUpdateRange(0, n * 4); aShade.addUpdateRange(0, n * 4);
  puffGeo.instanceCount = n;
}

function updateScene(dt) {
  const t = sim.t;
  updatePose();
  // floating origin at the rocket base
  origin[0] = rocketPose.pos[0]; origin[1] = rocketPose.pos[1]; origin[2] = rocketPose.pos[2];
  world.position.set(-origin[0], -origin[1], -origin[2]);
  SV.rocket.position.set(0, 0, 0);
  SV.rocket.quaternion.copy(rocketPose.q);
  attachDebris(); updateDebris();
  // swing arms, hold-down arms, tail service masts
  for (const a of armPivots) {
    let k;
    if (a.t === 'cm') k = launched ? smooth(SEQ.countStart, SEQ.countStart + 12, t) : 0;
    else k = smooth(a.t, a.t + (a.t < 0 ? 5 : 4), t);
    a.g.rotation.y = -k * 80 * DEG;
  }
  const rel = smooth(0, 1.2, t);
  holdArms.forEach(a => { a.rotation.x = -rel * 55 * DEG; });
  tsms.forEach(m => { m.rotation.x = -smooth(0.1, 2.0, t) * 38 * DEG; });
  // plumes and light
  const ex = updatePlumes(t);
  const fl = flameState();
  const hAlt = sim.released ? sim.d.h : 0;
  const near = 1 - smooth(200, 3000, hAlt);
  flameLight.intensity = fl * (90000 + 20000 * Math.sin(tReal * 31)) * (1 - smooth(0, 400, hAlt));
  flameLight.position.set(-origin[0], DECK - 4 - origin[1], -origin[2]);
  glow.position.copy(rocketPose.axis).multiplyScalar(sim.stage === 0 ? -6 : 40);
  const glowI = sim.stage === 0 ? fl * (1 - 0.5 * smooth(20000, 60000, hAlt)) : (sim.stage === 1 ? engineLevels(sim, t).reduce((a, b) => a + b, 0) / 5 * 0.16 : sim.stage === 2 ? engineLevels(sim, t)[0] * 0.14 : 0);
  glow.material.opacity = glowI * (0.9 + 0.1 * Math.sin(tReal * 43));
  glow.scale.setScalar(sim.stage === 0 ? 34 + 40 * ex : 16 + 8 * ex);
  glow.material.color.set(sim.stage === 0 ? 0xffc080 : 0xa8b8ff);
  glow.visible = glowI > 0.002;
  if (sim.stage > 0) glow.position.copy(rocketPose.axis).multiplyScalar(sim.stage === 1 ? ST.sicTop + 0.5 : ST.siiTop + 0.8);
}

function updateAtmosphereUniforms() {
  const cp = [camera.position.x + origin[0], camera.position.y + origin[1], camera.position.z + origin[2]];
  const c = [cp[0], cp[1] + RE, cp[2]];
  const r = Math.hypot(c[0], c[1], c[2]);
  const h = r - RE;
  const u = planetMat.uniforms;
  u.uUp.value.set(c[0] / r, c[1] / r, c[2] / r);
  u.uH.value = h;
  u.uCamPad.value.set(cp[0], cp[1], cp[2]);
  u.uTime.value = tReal;
  u.uInvProj.value.copy(camera.projectionMatrixInverse);
  u.uCamWorld.value.copy(camera.matrixWorld);
  u.uLogFC.value = 2.0 / (Math.log(camera.far + 1.0) / Math.LN2);
  camera.getWorldDirection(u.uCamFwd.value);
  // fog + ambient fade with the camera's altitude
  const thin = Math.exp(-Math.max(h, 0) / 8000);
  fog.density = 0.000022 * thin;
  hemi.intensity = 0.15 + 0.4 * thin;
  scene.environmentIntensity = 0.18 + 0.37 * thin;
  // smoke lighting
  const sv = SUN.clone().transformDirection(camera.matrixWorldInverse);
  puffMat.uniforms.uSunV.value.copy(sv);
  puffMat.uniforms.uAmb.value.setRGB(0.42 * thin + 0.08, 0.46 * thin + 0.09, 0.54 * thin + 0.11);
  // shadows only matter near the pad
  sunLight.castShadow = Q.shadow > 0 && Math.hypot(origin[0], origin[1]) < 3000;
  return h;
}

function frame() {
  const dtReal = Math.min(clock.getDelta(), 0.1);
  tReal += dtReal;
  if (running && !paused) {
    const target = sim.t + dtReal * warp;
    const before = sim.events.length;
    runTo(sim, target);
    for (let i = before; i < sim.events.length; i++) pushEvent(sim.events[i], warp > 10 && sim.events.length - i > 2);
    if (sim.insertT != null && sim.t > sim.insertT + 60 && warp > 1) setWarp(1);
  }
  updateScene(dtReal);
  computeCamera(dtReal, tReal);
  // camera shake: loudness ∝ thrust / distance; low-frequency noise
  const fl = flameState();
  const camDist = camera.position.length();
  let loud = sim.stage === 0 ? fl / (1 + camDist / 400) : 0;
  if (camMode === 'onboard' || (camMode === 'auto' && camState.shot === 'onboard')) loud = sim.stage <= 2 ? 0.35 * (sim._F > 0 ? 1 : 0) : 0;
  if (shakeOn && !Codex.reducedMotion && loud > 0.01 && !paused) {
    const a = loud * (camDist < 300 ? 0.9 : 0.35) * (camState.fov < 10 ? camState.fov / 10 : 1);
    shake.set(Math.sin(tReal * 23.1) + Math.sin(tReal * 37.7) * 0.5, Math.sin(tReal * 29.3 + 1) + Math.sin(tReal * 41.3) * 0.5, Math.sin(tReal * 19.7 + 2)).multiplyScalar(a);
    camera.position.add(shake);
    camera.rotateZ(Math.sin(tReal * 17.3) * a * 0.0015);
  }
  camera.updateMatrixWorld();
  const camH = updateAtmosphereUniforms();
  updateSmoke(camera.position);
  updateAudio(Math.min(1, loud * 2.2));
  // exposure: brighter daylight near ground, open up slightly in space so Earth stays readable
  renderer.toneMappingExposure = lerp(0.88, 1.12, smooth(20000, 100000, camH));
  if (composer) composer.render(); else renderer.render(scene, camera);
  hudTimer -= dtReal;
  if (hudTimer <= 0) { updateHUD(); hudTimer = 0.1; }
}

/* ================================================================== POST */
let composer = null, bloom = null;
function setupComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.32, 0.12, 1.0);
  bloom.enabled = Q.bloom;
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(innerWidth, innerHeight);
}
setupComposer();

/* ================================================================== CONTROLS */
const launchBtn = $('launchBtn'), pauseBtn = $('pauseBtn');
launchBtn.classList.add('pulse');
function doLaunch() {
  if (launched) return;
  launched = true; running = true; paused = false;
  launchBtn.disabled = true; launchBtn.classList.remove('pulse'); pauseBtn.disabled = false;
  document.body.classList.add('lx-flying');
  camState.init = false;
}
function setPaused(p) { paused = p; pauseBtn.setAttribute('aria-pressed', String(p)); pauseBtn.textContent = p ? 'Resume' : 'Pause'; }
function restart() {
  reattachAll();
  sim = new AscentSim();
  launched = false; running = false; setPaused(false);
  launchBtn.disabled = false; launchBtn.classList.add('pulse'); pauseBtn.disabled = true;
  document.body.classList.remove('lx-flying');
  logEl.innerHTML = ''; capEl.innerHTML = '';
  camState.init = false; idleAngle = 0.6;
  setWarp(1);
}
function setWarp(w) {
  warp = w;
  document.querySelectorAll('#warp button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.w === w)));
}
function setCam(c) {
  camMode = c;
  document.querySelectorAll('#cams button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.c === c)));
  camState.init = false;
  if (c === 'free') { controls.target.copy(freeTarget()); if (camera.position.length() < 30) camera.position.set(160, 60, 160); }
}
function setQuality(q) {
  qName = q; Q = QUALITY[q];
  try { localStorage.setItem('cx-launch-q', q); } catch (e) { /* storage unavailable */ }
  document.querySelectorAll('#quality button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.q === q)));
  const pr = Math.min(2, Math.min(devicePixelRatio, 2) * Q.pr);
  renderer.setPixelRatio(pr); composer.setPixelRatio(pr); composer.setSize(innerWidth, innerHeight);
  bloom.enabled = Q.bloom;
  planetMat.uniforms.uSteps.value = Q.steps;
  renderer.shadowMap.enabled = Q.shadow > 0; sunLight.castShadow = Q.shadow > 0;
  if (Q.shadow) { sunLight.shadow.mapSize.set(Q.shadow, Q.shadow); if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; } }
  scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
  buildPadParticles();
}
launchBtn.addEventListener('click', doLaunch);
pauseBtn.addEventListener('click', () => setPaused(!paused));
$('restartBtn').addEventListener('click', restart);
document.querySelectorAll('#warp button').forEach(b => b.addEventListener('click', () => setWarp(+b.dataset.w)));
document.querySelectorAll('#cams button').forEach(b => b.addEventListener('click', () => setCam(b.dataset.c)));
document.querySelectorAll('#quality button').forEach(b => b.addEventListener('click', () => setQuality(b.dataset.q)));
document.querySelectorAll('#quality button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.q === qName)));
$('shake').addEventListener('change', (e) => { shakeOn = e.target.checked; });
$('audio').addEventListener('change', (e) => {
  audio.on = e.target.checked;
  if (audio.on && !audio.ctx) { try { initAudio(); } catch (err) { audio.on = false; e.target.checked = false; } }
  if (audio.ctx) { if (audio.on) audio.ctx.resume(); else audio.ctx.suspend(); }
});
addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea, button')) return;
  if (e.code === 'Space') { e.preventDefault(); if (!launched) doLaunch(); else setPaused(!paused); }
  else if (e.key === 'r' || e.key === 'R') restart();
  else if (e.key >= '1' && e.key <= '6') setCam(['auto', 'pad', 'track', 'chase', 'onboard', 'free'][+e.key - 1]);
  else if (e.key === ']' || e.key === '[') { const W = [1, 2, 5, 10, 50]; const i = W.indexOf(warp); setWarp(W[clamp(i + (e.key === ']' ? 1 : -1), 0, W.length - 1)]); }
});
// phones: start with the telemetry sheet collapsed so the rocket is visible
if (matchMedia('(max-width: 820px)').matches) {
  const p = $('panel'); p.classList.add('collapsed'); $('collapse').textContent = '▲ TELEMETRY';
  $('collapse').addEventListener('click', () => { setTimeout(() => { const c = p.classList.contains('collapsed'); $('collapse').textContent = c ? '▲ TELEMETRY' : '▼ HIDE'; document.body.classList.toggle('lx-sheet-open', !c); }, 0); });
}
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
});

/* ================================================================== LOOP */
let rafId = 0;
function loop() { rafId = requestAnimationFrame(loop); frame(); }
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAnimationFrame(rafId); rafId = 0; }
  else if (!rafId) { clock.getDelta(); loop(); }
});
updatePose(); updateHUD();
// Compile every shader up front (plumes and smoke are hidden at first) so the
// launch itself never stutters; KHR_parallel_shader_compile keeps the page responsive.
async function warmUp() {
  const hidden = [];
  scene.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  puffGeo.instanceCount = 1;
  try { if (renderer.compileAsync) await renderer.compileAsync(scene, camera); } catch (e) { /* compile lazily instead */ }
  hidden.forEach(o => { o.visible = false; });
  puffGeo.instanceCount = 0;
}
{
  warmUp().then(() => requestAnimationFrame(() => { clock.getDelta(); loop(); requestAnimationFrame(() => $('loading').classList.add('done')); }));
}

/* ================================================================== DEBUG HOOK */
// window.__sim.jump(150) → re-simulate to T+150 s; .cam('chase'); .state()
window.__sim = {
  jump(t) {
    reattachAll();
    if (!launched) doLaunch();
    sim = new AscentSim();
    runTo(sim, t);
    logEl.innerHTML = '';
    sim.events.forEach(ev => pushEvent(ev, true));
    camState.init = false;
    updateScene(0);
    return sim.t;
  },
  cam: (c) => setCam(c),
  warp: (w) => setWarp(w),
  pause: (p = true) => setPaused(p),
  quality: (q) => setQuality(q),
  state: () => ({ t: sim.t, h: sim.d.h, v: sim.d.vrel, vin: sim.d.vin, q: sim.d.q, M: sim.d.M, stage: sim.stage, m: sim.m, dr: sim.d.downrange, shot: camState.shot, events: sim.events.map(e => e.id + '@' + e.t.toFixed(1)) }),
  get sim() { return sim; }
};
