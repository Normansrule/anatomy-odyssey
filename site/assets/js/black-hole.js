/* Cosmic Codex — Black Hole
 * Real-time ray tracer for a non-rotating (Schwarzschild) black hole with a thin accretion disk.
 *
 * Physics, in geometric units G = c = M = 1 (so lengths are in GM/c² and times in GM/c³):
 *   - Null geodesics: the Schwarzschild photon orbit equation u'' + u = 3M u² (u = 1/r) is integrated in
 *     its equivalent Cartesian form  x'' = -3 M h² x / r⁵  with h = |x × v| conserved, using RK4.
 *     (The often-quoted "-1.5 h² x / r⁵" is the same law in units where r_s = 2M = 1.)
 *     Ref: e.g. R. Antonelli, "Starless" ray tracer notes (rantonels.github.io/starless); any GR text, e.g.
 *     Hartle, "Gravity" (2003) ch. 9.
 *   - Horizon r = 2M, photon sphere r = 3M, ISCO r = 6M, critical impact parameter b_c = √27 M.
 *   - Disk: Shakura & Sunyaev (1973) / Novikov–Thorne (1973) zero-torque thin disk,
 *     F(r) ∝ r⁻³ (1 − √(r_in/r)),  T ∝ F^{1/4} = r^{-3/4}(1 − √(6/r))^{1/4}, peak at r = (49/36) r_in.
 *   - Frequency shift for gas on circular geodesics seen by a static observer at r_cam:
 *       g = ν_obs/ν_emit = √(1−2/r) / (γ (1 − Ω b_z)) / √(1−2/r_cam),  Ω = r^{-3/2},  γ = √((r−2)/(r−3)).
 *     Observed bolometric intensity I_obs = g⁴ I_emit (I_ν/ν³ is invariant, Liouville's theorem).
 *     Ref: Luminet, "Image of a spherical black hole with thin accretion disk", A&A 75, 228 (1979);
 *          James, von Tunzelmann, Franklin & Thorne, "Gravitational lensing by spinning black holes in
 *          astrophysics, and in the movie Interstellar", Class. Quantum Grav. 32, 065001 (2015).
 *   - Blackbody colours: Planck's law integrated against the CIE 1931 colour-matching functions
 *     (analytic multi-lobe fit of Wyman, Sloan & Shirley, JCGT 2(2), 2013), converted to linear sRGB.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

const $ = (s) => document.querySelector(s);
const Codex = window.Codex || { fmt: (v) => String(v), webgl: () => true, noGL() {}, reducedMotion: false };

/* =============================================================================================
 * 1. Physical constants (CODATA 2018; IAU 2015 Resolution B3 nominal solar values)
 * ============================================================================================= */
const G = 6.6743e-11;            // m³ kg⁻¹ s⁻²
const C = 299792458;             // m s⁻¹
const HBAR = 1.054571817e-34;    // J s
const KB = 1.380649e-23;         // J K⁻¹
const GM_SUN = 1.3271244e20;     // m³ s⁻² (IAU 2015 nominal)
const M_SUN = GM_SUN / G;        // ≈ 1.98841e30 kg
const AU = 1.495978707e11;       // m (IAU 2012)
const YEAR = 3.15576e7;          // Julian year, s
const PC = 3.0856775814913673e16;// m
const T_CMB = 2.7255;            // K (Fixsen 2009)
const AGE_UNIVERSE_YR = 13.8e9;  // Planck 2018
const G0 = 9.80665;              // standard gravity, m s⁻²

// Masses in solar masses
const MASS_PRESETS = {
  earth: { m: 3.986004418e14 / GM_SUN, label: "Earth", note: "Earth, if it were squeezed inside its own horizon (GM⊕ = 3.986 × 10¹⁴ m³/s²). Its horizon would be the size of a marble." },
  sun: { m: 1, label: "Sun", note: "The Sun. It will never become a black hole — it is far too light — but this is the size it would need to be." },
  stellar: { m: 10, label: "10 M☉", note: "A typical stellar-mass black hole, left behind when a massive star collapses — the kind the Laser Interferometer Gravitational-Wave Observatory (LIGO) hears merging." },
  sgra: { m: 4.297e6, label: "Sgr A*", note: "Sagittarius A* (Sgr A*), the black hole at the centre of the Milky Way. Mass from decades of stellar orbits: 4.30 × 10⁶ M☉ (GRAVITY Collaboration 2022)." },
  m87: { m: 6.5e9, label: "M87*", note: "M87*, in the giant elliptical galaxy Messier 87 — the first black hole ever imaged (Event Horizon Telescope Collaboration 2019, Paper VI: 6.5 × 10⁹ M☉)." },
  ton618: { m: 4.07e10, label: "TON 618", note: "The quasar TON 618 hosts one of the most massive black holes known: about 4.07 × 10¹⁰ M☉ (Ge et al. 2019, from the C IV emission line)." },
};

/* =============================================================================================
 * 2. Blackbody colour lookup table (Planck × CIE 1931 → linear sRGB, luminance-normalised)
 * ============================================================================================= */
const BB_TMIN = 1000, BB_TMAX = 40000, BB_N = 256;
function cieFit(l) { // Wyman, Sloan & Shirley 2013, multi-lobe Gaussian fit to CIE 1931 2° observer
  const g = (x, mu, s1, s2) => { const t = (x - mu) / (x < mu ? s1 : s2); return Math.exp(-0.5 * t * t); };
  return [
    1.056 * g(l, 599.8, 37.9, 31.0) + 0.362 * g(l, 442.0, 16.0, 26.7) - 0.065 * g(l, 501.1, 20.4, 26.2),
    0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1),
    1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8),
  ];
}
function blackbodyRGB(T) {
  const h = 6.62607015e-34, k = KB;
  let X = 0, Y = 0, Z = 0;
  for (let l = 380; l <= 780; l += 5) {
    const lm = l * 1e-9;
    const B = 1 / (Math.pow(lm, 5) * (Math.exp((h * C) / (lm * k * T)) - 1));
    const [x, y, z] = cieFit(l);
    X += B * x; Y += B * y; Z += B * z;
  }
  X /= Y; Z /= Y; Y = 1;
  // XYZ → linear sRGB (IEC 61966-2-1, D65)
  let r = 3.2406 * X - 1.5372 * Y - 0.4986 * Z;
  let g = -0.9689 * X + 1.8758 * Y + 0.0415 * Z;
  let b = 0.0557 * X - 0.204 * Y + 1.057 * Z;
  const m = Math.min(r, g, b);
  if (m < 0) { r -= m; g -= m; b -= m; } // push out-of-gamut colours towards white
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return [r / lum, g / lum, b / lum];
}
const bbTable = [];
for (let i = 0; i < BB_N; i++) bbTable.push(blackbodyRGB(BB_TMIN * Math.pow(BB_TMAX / BB_TMIN, i / (BB_N - 1))));
function bbLookup(T) {
  const u = Math.min(1, Math.max(0, Math.log(T / BB_TMIN) / Math.log(BB_TMAX / BB_TMIN)));
  return bbTable[Math.round(u * (BB_N - 1))];
}

/* =============================================================================================
 * 3. Shaders
 * ============================================================================================= */
const FULLSCREEN_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const NOISE_GLSL = /* glsl */ `
float hash13(vec3 p) {                // Inigo Quilez style hash (MIT)
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i + vec3(0,0,0)), hash13(i + vec3(1,0,0)), f.x),
                 mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x),
                 mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}`;

/* ---- Procedural sky, rendered once into a cube map (so it can be mip-mapped and is cheap to lens) ---- */
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
${NOISE_GLSL}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = p * 2.07 + vec3(3.1, 7.7, 1.3); a *= 0.5; } return s; }
void main() {
  vec3 n = normalize(vDir);
  // A Milky-Way-like band along a tilted great circle
  vec3 pole = normalize(vec3(0.32, 1.0, -0.42));
  float b = dot(n, pole);
  float warp = fbm(n * 3.0 + 2.0);
  float bw = b + (warp - 0.5) * 0.16;
  float band = exp(-bw * bw / 0.018);
  float halo = exp(-b * b / 0.16);
  float f2 = fbm(n * 7.0 + 3.1);
  float dust = smoothstep(0.42, 0.72, fbm(n * 5.0 + vec3(5.2, 1.3, 2.8)));
  vec3 c = vec3(0.0025, 0.0032, 0.0075);
  c += vec3(0.95, 0.82, 0.68) * band * (0.035 + 0.09 * f2 * f2) * (1.0 - 0.9 * dust * smoothstep(0.1, 0.8, band));
  c += vec3(0.30, 0.40, 0.75) * halo * 0.010;
  // coloured nebulae
  float n1 = smoothstep(0.52, 0.86, fbm(n * 1.6 + 11.0));
  float n2 = smoothstep(0.55, 0.90, fbm(n * 2.3 + 4.0));
  c += vec3(0.42, 0.14, 0.62) * n1 * (0.03 + 0.05 * f2);
  c += vec3(0.08, 0.32, 0.62) * n2 * (0.025 + 0.04 * f2);
  // an emission nebula and a small background galaxy placed behind the hole in the default view,
  // so the Einstein ring is easy to see
  vec3 nebDir = normalize(vec3(0.16, 0.10, -1.0));
  float dn = distance(n, nebDir);
  c += vec3(1.0, 0.32, 0.46) * exp(-dn * dn / 0.012) * (0.12 + 0.35 * f2 * warp);
  vec3 galDir = normalize(vec3(-0.012, 0.02, -1.0));
  vec3 gx = normalize(cross(galDir, vec3(0.3, 1.0, 0.0)));
  vec3 gy = cross(galDir, gx);
  vec2 q = vec2(dot(n - galDir, gx), dot(n - galDir, gy));
  q = mat2(0.82, -0.57, 0.57, 0.82) * q;
  float rg = length(q * vec2(1.0, 2.4));
  float arms = 0.6 + 0.4 * sin(atan(q.y * 2.4, q.x) * 2.0 - log(rg + 1e-4) * 5.0);
  c += vec3(1.0, 0.86, 0.66) * (exp(-rg * rg / 0.00008) * 3.0 + exp(-rg / 0.022) * 0.45 * arms);
  gl_FragColor = vec4(c, 1.0);
}`;
const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
varying vec3 vCol;
void main() { vCol = aColor; gl_PointSize = aSize; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = exp(-dot(c, c) * 14.0);
  gl_FragColor = vec4(vCol * a, 1.0);
}`;

/* ---- The black hole ray tracer ---- */
const BH_FRAG = /* glsl */ `
uniform vec2 uRes;
uniform vec2 uCenter;
uniform vec3 uCamPos;
uniform mat3 uCamRot;
uniform float uTanHalf;
uniform float uPixAng;
uniform float uTime;
uniform float uRin;
uniform float uRout;
uniform float uFpk;
uniform float uTpeak;
uniform float uStepK;
uniform int uMaxSteps;
uniform float uDoppler;
uniform float uGrav;
uniform float uInter;
uniform vec3 uShow;
uniform float uBright;
uniform float uGcam;
uniform float uSkyGain;
uniform samplerCube uSky;
uniform sampler2D uBB;
varying vec2 vUv;

#define MAX_STEPS 640
${NOISE_GLSL}

float fbm4(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.13 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }

vec3 blackbody(float T) {
  float u = clamp(log(T / 1000.0) / 3.6888794541, 0.0, 1.0);   // log(40000/1000)
  return textureLod(uBB, vec2(u * (255.0 / 256.0) + 0.5 / 256.0, 0.5), 0.0).rgb;
}

// Turbulent disk texture, advected at the local Keplerian angular speed Ω = r^-3/2.
// Differential rotation would wind any pattern into ever-tighter spirals, so two phases of the
// pattern are cross-faded ("flow map" trick) and each is re-seeded while invisible.
float diskTexture(float r, float phi) {
  const float P = 110.0;                 // cycle length in units of GM/c³
  float om = pow(r, -1.5);
  float c1 = uTime / P;
  float f1 = fract(c1), f2 = fract(c1 + 0.5);
  float w1 = 1.0 - abs(2.0 * f1 - 1.0);
  float lr = log(r);
  // material moves towards −φ (angular momentum along +y), so the pattern coordinate is φ + Ωt
  float a1 = phi + om * f1 * P, a2 = phi + om * f2 * P;
  float s1 = floor(c1) * 7.31, s2 = floor(c1 + 0.5) * 7.31 + 3.7;
  vec3 q1 = vec3(lr * 9.0, cos(a1) * 2.1, sin(a1) * 2.1 + s1);
  vec3 q2 = vec3(lr * 9.0, cos(a2) * 2.1, sin(a2) * 2.1 + s2);
  float t = w1 * fbm4(q1) + (1.0 - w1) * fbm4(q2);
  // restore contrast lost by blending two independent patterns
  t = 0.47 + (t - 0.47) * (1.0 + 0.45 * (1.0 - abs(2.0 * w1 - 1.0)));
  return t;
}

vec4 shadeDisk(vec3 p, float r, float by) {
  float phi = atan(p.z, p.x);
  float F = (1.0 - sqrt(uRin / r)) / (r * r * r);
  float Fn = max(F / uFpk, 0.0);                        // flux relative to the disk's peak
  float T = uTpeak * pow(Fn, 0.25);                     // T ∝ r^-3/4 (1-√(6/r))^1/4
  float om = pow(r, -1.5);                              // Keplerian Ω (Schwarzschild coordinate time)
  float gam = sqrt((r - 2.0) / (r - 3.0));              // Lorentz factor of the orbiting gas (local static frame)
  float gD = 1.0 / (gam * (1.0 - om * by));             // Doppler + transverse Doppler
  float gG = sqrt(1.0 - 2.0 / r) * uGcam;               // gravitational shift, emitter → static camera
  float g = mix(1.0, gD, uDoppler) * mix(1.0, gG, uGrav);

  float tex = diskTexture(r, phi);
  float dens = smoothstep(0.22, 0.78, tex);
  float edge = smoothstep(uRin, uRin + 0.35, r) * (1.0 - smoothstep(uRout * 0.62, uRout, r));

  vec3 col;
  if (uInter > 0.5) {
    // "Interstellar" look: no Doppler, no colour shift, warm uniform palette
    col = mix(blackbody(clamp(uTpeak * 0.62 * pow(Fn, 0.18), 1500.0, 9000.0)) * vec3(1.0, 0.86, 0.66), vec3(1.0, 0.93, 0.82), 0.3 * Fn);
    col *= 0.25 + 1.1 * pow(Fn, 0.7);
  } else {
    float g2 = g * g;
    col = blackbody(g * T) * (Fn * g2 * g2);            // I_obs = g⁴ I_emit, colour at T_obs = g T
  }
  col *= (0.12 + 1.9 * dens * dens) * uBright * 0.85;
  float alpha = edge * clamp(0.38 + 0.7 * dens, 0.0, 1.0);
  return vec4(col * alpha, alpha);
}

vec3 overlay(vec3 p, float rp) {
  float lw = 1.8 * uPixAng * length(p - uCamPos) + 0.01;
  vec3 o = vec3(0.0);
  o += uShow.x * vec3(0.95) * (1.0 - smoothstep(0.0, lw, abs(rp - 2.0)));
  o += uShow.y * vec3(0.12, 0.62, 1.25) * (1.0 - smoothstep(0.0, lw, abs(rp - 3.0)));
  float dash = step(0.4, fract(atan(p.z, p.x) * 40.0 / 6.2831853));
  o += uShow.z * vec3(0.12, 1.1, 0.55) * dash * (1.0 - smoothstep(0.0, lw * 1.2, abs(rp - 6.0)));
  return o;
}

vec3 accel(vec3 x, float h2) { float r2 = dot(x, x); return -3.0 * h2 * x / (r2 * r2 * sqrt(r2)); }

void main() {
  vec2 sc = (vUv - uCenter) * 2.0;
  sc.x *= uRes.x / uRes.y;
  vec3 d = normalize(uCamRot * vec3(sc * uTanHalf, -1.0));
  vec3 x = uCamPos;
  float r0 = length(x);

  // The camera is a static (hovering) observer. Convert its local viewing angle α to the ray's
  // coordinate direction so that the impact parameter is exact: b = r sinα / √(1 − 2/r).
  vec3 rh = x / r0;
  float ca = dot(d, rh);
  vec3 tv = d - ca * rh;
  float S = dot(tv, tv);
  if (S > 1e-10) {
    float s = clamp(S / (1.0 - 2.0 * (1.0 - S) / r0), 0.0, 1.0);
    d = (ca < 0.0 ? -1.0 : 1.0) * sqrt(1.0 - s) * rh + sqrt(s) * tv * inversesqrt(S);
  }
  vec3 v = d;
  vec3 L = cross(x, v);
  float h2 = dot(L, L);
  float vinf = sqrt(max(1.0 - 2.0 * h2 / (r0 * r0 * r0), 1e-6));
  float by = -L.y / vinf;             // physical photon's impact parameter about the disk axis (L_z/E)
  float rEsc = max(max(r0 * 1.3, uRout * 1.6), 45.0);

  vec3 col = vec3(0.0);
  float trans = 1.0;
  float state = 0.0;                  // 0 running, 1 escaped, 2 captured, 3 opaque

  for (int i = 0; i < MAX_STEPS; i++) {
    if (i >= uMaxSteps) break;
    float r = length(x);
    float dt = uStepK * r;
    vec3 x0 = x;
    // classic fourth-order Runge–Kutta
    vec3 k1x = v,                   k1v = accel(x, h2);
    vec3 k2x = v + 0.5 * dt * k1v,  k2v = accel(x + 0.5 * dt * k1x, h2);
    vec3 k3x = v + 0.5 * dt * k2v,  k3v = accel(x + 0.5 * dt * k2x, h2);
    vec3 k4x = v + dt * k3v,        k4v = accel(x + dt * k3x, h2);
    x += dt / 6.0 * (k1x + 2.0 * k2x + 2.0 * k3x + k4x);
    v += dt / 6.0 * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);

    if (x0.y * x.y < 0.0) {           // crossed the equatorial (disk) plane
      float f = x0.y / (x0.y - x.y);
      vec3 p = mix(x0, x, f);
      float rp = length(p.xz);
      col += trans * overlay(p, rp);
      if (rp > uRin && rp < uRout) {
        vec4 dk = shadeDisk(p, rp, by);
        col += trans * dk.rgb;
        trans *= 1.0 - dk.a;
        if (trans < 0.01) { state = 3.0; break; }
      }
    }
    float rn = length(x);
    if (rn < 2.0) { state = 2.0; break; }
    if (rn > rEsc && dot(x, v) > 0.0) { state = 1.0; break; }
  }

  vec3 sky = texture(uSky, normalize(v)).rgb;
  float esc = state == 1.0 ? 1.0 : 0.0;
  // starlight falling onto a hovering observer is blueshifted: I ∝ g⁴ with g = 1/√(1−2/r_cam)
  float gs = (uGrav > 0.5 && uInter < 0.5) ? min(pow(uGcam, 4.0), 12.0) : 1.0;
  col += trans * esc * sky * uSkyGain * gs;
  // gentle highlight compression so the most beamed pixels do not flood the bloom into the shadow
  float m = max(max(col.r, col.g), col.b);
  col *= 1.0 / (1.0 + m / 10.0);
  gl_FragColor = vec4(col, 1.0);
}`;

const FINAL_FRAG = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uExposure;
uniform float uTime;
uniform vec2 uRes;
varying vec2 vUv;
vec3 aces(vec3 x) {   // Narkowicz 2015 ACES filmic fit
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
  c = aces(c);
  vec2 q = vUv - 0.5;
  c *= 1.0 - dot(q, q) * 0.7;          // gentle lens vignette
  c = toSRGB(c);
  float n = fract(sin(dot(vUv * uRes + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
  c += (n - 0.5) * (2.5 / 255.0);       // dither / film grain: kills banding in the dark halo
  gl_FragColor = vec4(c, 1.0);
}`;

/* =============================================================================================
 * 4. Renderer, sky cube map and post-processing
 * ============================================================================================= */
const stage = $("#stage");
if (!Codex.webgl()) {
  Codex.noGL();
  $("#loading").classList.add("done");
  await new Promise(() => {}); // stop evaluating this module quietly (no uncaught error)
}

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
const DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.domElement.setAttribute("aria-label", stage.getAttribute("aria-label"));
renderer.domElement.setAttribute("tabindex", "0");
stage.appendChild(renderer.domElement);

// A software rasteriser (SwiftShader, llvmpipe — e.g. hardware acceleration switched off) would take
// seconds per frame at full resolution and freeze the tab; start small there and let adaptive take over.
const SOFTWARE_GL = (() => {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return /swiftshader|llvmpipe|softpipe|software/i.test(String(name));
  } catch (e) { return false; }
})();

// Blackbody LUT texture (half float, linear filtering)
const bbData = new Uint16Array(BB_N * 4);
bbTable.forEach((c, i) => {
  bbData[i * 4] = THREE.DataUtils.toHalfFloat(c[0]);
  bbData[i * 4 + 1] = THREE.DataUtils.toHalfFloat(c[1]);
  bbData[i * 4 + 2] = THREE.DataUtils.toHalfFloat(c[2]);
  bbData[i * 4 + 3] = THREE.DataUtils.toHalfFloat(1);
});
const bbTex = new THREE.DataTexture(bbData, BB_N, 1, THREE.RGBAFormat, THREE.HalfFloatType);
bbTex.minFilter = bbTex.magFilter = THREE.LinearFilter;
bbTex.wrapS = bbTex.wrapT = THREE.ClampToEdgeWrapping;
bbTex.needsUpdate = true;

// Seeded random so the sky is the same on every visit
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function buildSky() {
  const size = params.has("sky") ? +params.get("sky") : SOFTWARE_GL ? 512 : (Math.min(innerWidth, innerHeight) < 600 ? 1024 : 1536);
  const cubeRT = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType, generateMipmaps: true,
    minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  });
  const scene = new THREE.Scene();
  const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, depthTest: false });
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(900, 96, 48), skyMat);
  scene.add(sphere);

  // Stars: a uniform population plus a population concentrated in the galactic band.
  const rand = mulberry32(20190410); // seeded with the date of the first EHT image
  const N = 16000, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), siz = new Float32Array(N);
  const pole = new THREE.Vector3(0.32, 1.0, -0.42).normalize();
  const e1 = new THREE.Vector3().crossVectors(pole, new THREE.Vector3(1, 0, 0)).normalize();
  const e2 = new THREE.Vector3().crossVectors(pole, e1);
  const v = new THREE.Vector3();
  const sizeScale = size / 1024;
  for (let i = 0; i < N; i++) {
    if (i < N * 0.55) {
      const z = rand() * 2 - 1, t = rand() * Math.PI * 2, s = Math.sqrt(1 - z * z);
      v.set(s * Math.cos(t), z, s * Math.sin(t));
    } else {
      const t = rand() * Math.PI * 2;
      const gsn = (rand() + rand() + rand() - 1.5) * 0.16; // ~ Gaussian latitude spread
      v.copy(e1).multiplyScalar(Math.cos(t)).addScaledVector(e2, Math.sin(t)).addScaledVector(pole, gsn).normalize();
    }
    pos.set([v.x * 800, v.y * 800, v.z * 800], i * 3);
    // brightness: steep power law, so most stars are faint and a handful are brilliant
    const u = rand();
    const flux = Math.min(6, 0.04 * Math.pow(u + 0.002, -0.9));
    const T = 2800 + 11000 * Math.pow(rand(), 1.8);
    const c = bbLookup(T);
    col.set([c[0] * flux, c[1] * flux, c[2] * flux], i * 3);
    siz[i] = (2.0 + 2.6 * Math.min(1, Math.sqrt(flux / 6))) * sizeScale;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(siz, 1));
  const starMat = new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, depthTest: false });
  const stars = new THREE.Points(g, starMat);
  stars.renderOrder = 1;
  scene.add(stars);

  const cubeCam = new THREE.CubeCamera(1, 2000, cubeRT);
  cubeCam.update(renderer, scene);
  sphere.geometry.dispose(); skyMat.dispose(); g.dispose(); starMat.dispose();
  return cubeRT;
}

const skyRT = buildSky();

const uniforms = {
  uRes: { value: new THREE.Vector2(1, 1) },
  uCenter: { value: new THREE.Vector2(0.5, 0.5) },
  uCamPos: { value: new THREE.Vector3() },
  uCamRot: { value: new THREE.Matrix3() },
  uTanHalf: { value: Math.tan(THREE.MathUtils.degToRad(25)) },
  uPixAng: { value: 0.001 },
  uTime: { value: 0 },
  uRin: { value: 6 },
  uRout: { value: 22 },
  uFpk: { value: 1 },
  uTpeak: { value: 4800 },
  uStepK: { value: 0.075 },
  uMaxSteps: { value: 320 },
  uDoppler: { value: 1 },
  uGrav: { value: 1 },
  uInter: { value: 0 },
  uShow: { value: new THREE.Vector3(0, 0, 0) },
  uBright: { value: 1 },
  uGcam: { value: 1 },
  uSkyGain: { value: 1 },
  uSky: { value: skyRT.texture },
  uBB: { value: bbTex },
};
// Peak of F(r) = r⁻³(1 − √(r_in/r)) is at r = 49/36 r_in
{ const r = (49 / 36) * 6; uniforms.uFpk.value = (1 - Math.sqrt(6 / r)) / (r * r * r); }

const bhScene = new THREE.Scene();
const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const bhMat = new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERT, fragmentShader: BH_FRAG, uniforms, depthTest: false, depthWrite: false });
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bhMat);
quad.frustumCulled = false;
bhScene.add(quad);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(bhScene, orthoCam));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.0, 0.95);
// Weight the small blur mips more than the widest ones: a tight glow around the beamed side,
// without washing a grey veil over the shadow.
bloom.compositeMaterial.uniforms.bloomFactors.value = [1.0, 0.6, 0.3, 0.12, 0.05];
composer.addPass(bloom);
const finalPass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uExposure: { value: 1.0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) } },
  vertexShader: FULLSCREEN_VERT, fragmentShader: FINAL_FRAG,
});
composer.addPass(finalPass);

/* =============================================================================================
 * 5. State, camera and sizing
 * ============================================================================================= */
const QUALITY = [
  { name: "Low", k: 0.16, n: 130 },
  { name: "Medium", k: 0.11, n: 210 },
  { name: "High", k: 0.075, n: 330 },
  { name: "Ultra", k: 0.05, n: 520 },
];
const TIME_SCALE = 15; // GM/c³ of simulated time per real second at "1×" (an ISCO orbit takes ~6 s)

const state = {
  az: -0.35, elev: 10, dist: 30, yaw: 0,
  tAz: -0.35, tElev: 10, tDist: 30,          // targets (smoothed)
  autoOrbit: !Codex.reducedMotion,
  speed: Codex.reducedMotion ? 0.25 : 1,
  quality: 2,
  maxScale: 1, scale: 1, adaptive: true,
  simTime: 400,
  massSun: MASS_PRESETS.sgra.m,
};
const fall = { phase: "idle", t: 0, dur: 20, from: 30, to: 3.2, elevFrom: 10, tau: 0, tFar: 0, back: 30 };
if (params.has("adaptive")) state.adaptive = params.get("adaptive") !== "0";
if (params.has("scale")) state.maxScale = state.scale = +params.get("scale");

function panelOffsetPx() {
  // keep the hole centred in the part of the screen the side panel does not cover
  if (innerWidth <= 820) return 0;
  const p = $("#panel");
  return p ? -(p.offsetWidth + 16) / 2 : 0;
}

function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  composer.setPixelRatio(DPR * state.scale);
  composer.setSize(w, h);
  const rw = Math.max(1, Math.round(w * DPR * state.scale)), rh = Math.max(1, Math.round(h * DPR * state.scale));
  uniforms.uRes.value.set(rw, rh);
  finalPass.uniforms.uRes.value.set(w * DPR, h * DPR);
  // vertical field of view: 50° on landscape screens, wider on portrait phones so the disk fits
  const aspect = w / h;
  const vfov = aspect >= 1 ? 50 : Math.min(84, 2 * THREE.MathUtils.radToDeg(Math.atan(Math.tan(THREE.MathUtils.degToRad(29)) / aspect)));
  uniforms.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(vfov / 2));
  uniforms.uPixAng.value = (2 * uniforms.uTanHalf.value) / rh;
  uniforms.uCenter.value.set(0.5 + panelOffsetPx() / w, aspect < 1 ? 0.45 : 0.5);
  $("#rays").textContent = (rw * rh / 1e6).toFixed(2) + " M";
}

const camPos = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3(), up = new THREE.Vector3();
function updateCamera() {
  const e = THREE.MathUtils.degToRad(state.elev);
  camPos.set(state.dist * Math.cos(e) * Math.sin(state.az), state.dist * Math.sin(e), state.dist * Math.cos(e) * Math.cos(state.az));
  fwd.copy(camPos).multiplyScalar(-1).normalize();
  right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  if (state.yaw) { // look sideways (used when very close, where the shadow covers most of the sky)
    fwd.multiplyScalar(Math.cos(state.yaw)).addScaledVector(right, Math.sin(state.yaw)).normalize();
    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
  }
  up.crossVectors(right, fwd);
  uniforms.uCamPos.value.copy(camPos);
  uniforms.uCamRot.value.set(right.x, up.x, -fwd.x, right.y, up.y, -fwd.y, right.z, up.z, -fwd.z);
  const rc = state.dist;
  uniforms.uGcam.value = 1 / Math.sqrt(1 - 2 / rc);
}

/* =============================================================================================
 * 6. UI: sliders, toggles, tabs, views
 * ============================================================================================= */
function bindRange(id, fmt, onInput) {
  const el = $("#" + id), out = $("#" + id + "Out");
  const apply = () => { const v = +el.value; if (out) out.innerHTML = fmt(v); onInput(v); };
  el.addEventListener("input", apply);
  apply();
  return el;
}
function setRange(id, v) {
  const el = $("#" + id);
  el.value = v;
  el.dispatchEvent(new Event("input"));
}
const nf = (v, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });

let syncingSliders = false;
bindRange("elev", (v) => nf(v, 1) + "°", (v) => { if (!syncingSliders) state.tElev = v; });
bindRange("dist", (v) => nf(v, 1) + " M", (v) => { if (!syncingSliders && fall.phase === "idle") state.tDist = v; });
bindRange("bright", (v) => nf(v, 2) + "×", (v) => { uniforms.uBright.value = v; });
bindRange("rout", (v) => nf(v, 1) + " M", (v) => { uniforms.uRout.value = v; });
bindRange("tpeak", (v) => v.toLocaleString("en-US").replace(",", " ") + " K", (v) => { uniforms.uTpeak.value = v; });
bindRange("speed", (v) => nf(v, 2) + "×", (v) => { state.speed = v; });
bindRange("quality", (v) => QUALITY[v].name, (v) => { state.quality = v; uniforms.uStepK.value = QUALITY[v].k; uniforms.uMaxSteps.value = QUALITY[v].n; });
const scaleEl = bindRange("scale", (v) => Math.round(v * 100) + "%", (v) => { state.maxScale = v; state.scale = v; resize(); });
if (params.has("scale")) setRange("scale", state.maxScale);

if (SOFTWARE_GL && !params.has("scale") && !params.has("adaptive")) {
  setRange("quality", 1);
  state.scale = 0.4; resize();
  $("#scaleOut").textContent = "40% (auto)";
}
if (Codex.reducedMotion) setRange("speed", 0.25);

function bindToggle(id, fn) { const el = $("#" + id); el.addEventListener("change", () => fn(el.checked)); fn(el.checked); return el; }
bindToggle("doppler", (on) => { uniforms.uDoppler.value = on ? 1 : 0; });
bindToggle("grav", (on) => { uniforms.uGrav.value = on ? 1 : 0; });
bindToggle("interstellar", (on) => {
  uniforms.uInter.value = on ? 1 : 0;
  $("#doppler").disabled = on; $("#grav").disabled = on;
});
bindToggle("showEH", (on) => { uniforms.uShow.value.x = on ? 1 : 0; });
bindToggle("showPS", (on) => { uniforms.uShow.value.y = on ? 1 : 0; });
bindToggle("showISCO", (on) => { uniforms.uShow.value.z = on ? 1 : 0; });
const autoEl = bindToggle("autoOrbit", (on) => { state.autoOrbit = on; });
if (Codex.reducedMotion) { autoEl.checked = false; state.autoOrbit = false; }
const adaptiveEl = bindToggle("adaptive", (on) => { state.adaptive = on; if (!on) { state.scale = state.maxScale; resize(); } });
if (params.has("adaptive")) { adaptiveEl.checked = state.adaptive; }
bindToggle("bloom", (on) => { bloom.enabled = on; });

// Tabs
document.querySelectorAll(".bh-tabs button").forEach((b) => {
  b.addEventListener("click", () => {
    document.querySelectorAll(".bh-tabs button").forEach((o) => { o.setAttribute("aria-pressed", o === b ? "true" : "false"); o.setAttribute("aria-selected", o === b ? "true" : "false"); });
    document.querySelectorAll(".bh-tab").forEach((s) => { s.hidden = s.dataset.panel !== b.dataset.tab; });
    $("#panel").scrollTop = 0;
  });
});

// Camera presets
const VIEWS = {
  default: { elev: 10, dist: 30 },
  edge: { elev: 1.2, dist: 26 },
  face: { elev: 84, dist: 34 },
  close: { elev: 5, dist: 11 },
};
document.querySelectorAll("#views button").forEach((b) => {
  b.addEventListener("click", () => {
    const v = VIEWS[b.dataset.view];
    document.querySelectorAll("#views button").forEach((o) => o.setAttribute("aria-pressed", o === b ? "true" : "false"));
    if (fall.phase !== "idle") endFall(true);
    syncingSliders = true; setRange("elev", v.elev); setRange("dist", v.dist); syncingSliders = false;
    state.tElev = v.elev; state.tDist = v.dist;
  });
});

// KaTeX equations
function renderMath() {
  if (!window.katex) return;
  document.querySelectorAll(".bh-eq[data-tex]").forEach((el) => {
    try { window.katex.render(el.dataset.tex, el, { displayMode: true, throwOnError: false }); } catch (e) { el.textContent = el.dataset.tex; }
  });
}
renderMath();

// Mobile: start with the bottom sheet collapsed so the black hole is visible first
if (matchMedia("(max-width: 820px)").matches) {
  $("#panel").classList.add("collapsed");
  const cb = $("#panel .hud-collapse"); if (cb) cb.textContent = "▲ CONTROLS";
}

/* ---------------- Pointer: orbit, wheel & pinch zoom, keyboard ---------------- */
const canvas = renderer.domElement;
const pointers = new Map();
let pinchStart = 0, pinchDist0 = 0;
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  stage.classList.add("dragging");
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStart = Math.hypot(a.x - b.x, a.y - b.y); pinchDist0 = state.tDist;
  }
});
canvas.addEventListener("pointermove", (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  if (pointers.size === 1) {
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    state.tAz -= dx * 0.005;
    state.tElev = THREE.MathUtils.clamp(state.tElev + dy * 0.25, -89, 89);
    syncElevSlider();
  }
  p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2 && fall.phase === "idle") {
    const [a, b] = [...pointers.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinchStart > 0) setDist(pinchDist0 * pinchStart / d);
  }
});
const endPtr = (e) => { pointers.delete(e.pointerId); if (!pointers.size) stage.classList.remove("dragging"); if (pointers.size < 2) pinchStart = 0; };
canvas.addEventListener("pointerup", endPtr);
canvas.addEventListener("pointercancel", endPtr);
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (fall.phase !== "idle") return;
  setDist(state.tDist * Math.exp(e.deltaY * 0.0012));
}, { passive: false });
function setDist(d) {
  state.tDist = THREE.MathUtils.clamp(d, 6, 80);
  syncingSliders = true; setRange("dist", state.tDist); syncingSliders = false;
}
function syncElevSlider() {
  syncingSliders = true; setRange("elev", Math.max(0, Math.abs(state.tElev))); syncingSliders = false;
}
addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest("input, select, textarea, button")) return;
  const k = e.key;
  if (k === "ArrowLeft") state.tAz += 0.08;
  else if (k === "ArrowRight") state.tAz -= 0.08;
  else if (k === "ArrowUp") { state.tElev = Math.min(89, state.tElev + 3); syncElevSlider(); }
  else if (k === "ArrowDown") { state.tElev = Math.max(-89, state.tElev - 3); syncElevSlider(); }
  else if ((k === "+" || k === "=") && fall.phase === "idle") setDist(state.tDist / 1.1);
  else if ((k === "-" || k === "_") && fall.phase === "idle") setDist(state.tDist * 1.1);
  else return;
  e.preventDefault();
});

/* =============================================================================================
 * 7. Calculator (SI units)
 * ============================================================================================= */
const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
function sci(v, d = 3) {
  if (!isFinite(v)) return "—";
  if (v === 0) return "0";
  const a = Math.abs(v);
  if (a >= 1e-3 && a < 1e5) return v.toLocaleString("en-US", { maximumSignificantDigits: d });
  const e = Math.floor(Math.log10(a));
  let m = v / Math.pow(10, e);
  let ms = m.toPrecision(d);
  if (+ms >= 10) { ms = (m / 10).toPrecision(d); return ms.replace(/\.?0+$/, "") + " × 10" + String(e + 1).split("").map((c) => SUP[c]).join(""); }
  return ms.replace(/\.?0+$/, "") + " × 10" + String(e).split("").map((c) => SUP[c]).join("");
}
function fmtLen(m) {
  if (m < 1e-3) return sci(m * 1e6) + " μm";
  if (m < 1) return sci(m * 1e3) + " mm";
  if (m < 1e3) return sci(m) + " m";
  if (m < 0.01 * AU) return sci(m / 1e3) + " km";
  return sci(m / 1e3) + " km · " + sci(m / AU) + " AU";
}
function fmtTime(s) {
  const a = Math.abs(s);
  if (a < 1e-3) return sci(s * 1e6) + " μs";
  if (a < 1) return sci(s * 1e3) + " ms";
  if (a < 120) return sci(s) + " s";
  if (a < 7200) return sci(s / 60) + " min";
  if (a < 172800) return sci(s / 3600) + " h";
  if (a < 2 * YEAR) return sci(s / 86400) + " days";
  return sci(s / YEAR) + " years";
}

function calc() {
  const Msun = state.massSun;
  const M = Msun * M_SUN;
  const GM = Msun * GM_SUN;
  const rs = (2 * GM) / (C * C);
  $("#cRs").textContent = fmtLen(rs);
  $("#cPs").textContent = fmtLen(1.5 * rs);
  $("#cIsco").textContent = fmtLen(3 * rs);
  const rho = M / ((4 / 3) * Math.PI * rs ** 3);
  $("#cRho").innerHTML = sci(rho) + " <small>kg/m³</small>";
  $("#cRho").title = rho > 1000 ? sci(rho / 1000) + " × the density of water" : sci(rho / 1.2) + " × the density of air";
  const tM = GM / C ** 3;                                 // one "M" of time in seconds
  $("#cPer").textContent = fmtTime(2 * Math.PI * Math.pow(6, 1.5) * tM);
  // Radial tidal acceleration difference across ℓ = 2 m at r = r_s:  Δa = 2GMℓ/r³ (exact for radial infall in Schwarzschild)
  const tide = (2 * GM * 2) / rs ** 3;
  $("#cTide").innerHTML = sci(tide) + " <small>m/s²</small> = " + sci(tide / G0) + " <small>g</small>";
  let tn;
  if (tide / G0 < 1) tn = "Gentle: you could cross this horizon without feeling it — and never know the moment you passed the point of no return.";
  else if (tide / G0 < 10) tn = "Noticeable, like a roller-coaster pull — survivable at the horizon, fatal a little further in.";
  else if (tide / G0 < 100) tn = "Beyond human tolerance: lethal stretching before you reach the horizon.";
  else tn = "Spaghettification: head and feet are pulled apart long before the horizon. Small black holes are the deadliest.";
  $("#cTideNote").textContent = tn;
  const TH = (HBAR * C ** 3) / (8 * Math.PI * G * M * KB);
  $("#cTh").innerHTML = sci(TH) + " <small>K</small>";
  const tev = (5120 * Math.PI * G * G * M ** 3) / (HBAR * C ** 4);
  const yr = tev / YEAR;
  $("#cEvap").innerHTML = yr > 1e5 ? sci(yr) + " <small>yr</small>" : fmtTime(tev);
  $("#cHawkNote").textContent = TH < T_CMB
    ? `Colder than the ${T_CMB} K cosmic microwave background (CMB): today it absorbs more radiation than it emits, so it is growing. Its evaporation time is ${sci(yr / AGE_UNIVERSE_YR)} times the age of the Universe.`
    : `Hotter than the ${T_CMB} K cosmic microwave background (CMB), so it is slowly losing mass to Hawking radiation.`;
  calcDilation();
}
function tdRatio() { return 1 + Math.pow(10, 6 * +$("#tdR").value - 3); }
function calcDilation() {
  const x = tdRatio();
  const rs = (2 * state.massSun * GM_SUN) / (C * C);
  $("#tdROut").innerHTML = sci(x, 4) + " r<sub>s</sub>";
  const rate = Math.sqrt(1 - 1 / x);
  $("#cTd").textContent = rate.toPrecision(4);
  $("#cHour").textContent = fmtTime(3600 / rate) + " far away";
  $("#cTdR").textContent = fmtLen(x * rs) + " from the centre";
}
$("#tdR").addEventListener("input", calcDilation);

function setMass(msun, key) {
  state.massSun = msun;
  document.querySelectorAll("#massPresets .chip").forEach((c) => c.setAttribute("aria-pressed", c.dataset.mass === key ? "true" : "false"));
  const lg = Math.log10(msun);
  const ml = $("#massLog");
  ml.value = lg; ml.style.setProperty("--fill", ((lg - +ml.min) / (+ml.max - +ml.min)) * 100 + "%");
  $("#massOut").textContent = sci(msun) + " M☉";
  if (document.activeElement !== $("#massNum")) $("#massNum").value = +msun.toPrecision(5);
  $("#massNote").textContent = key ? MASS_PRESETS[key].note : "Custom mass.";
  calc();
}
document.querySelectorAll("#massPresets .chip").forEach((c) => {
  c.setAttribute("aria-pressed", "false");
  c.addEventListener("click", () => setMass(MASS_PRESETS[c.dataset.mass].m, c.dataset.mass));
});
$("#massLog").addEventListener("input", (e) => setMass(Math.pow(10, +e.target.value), null));
$("#massNum").addEventListener("input", (e) => { const v = +e.target.value; if (v > 0 && isFinite(v)) setMass(v, null); });
$("#tdR").value = (Math.log10(2) + 3) / 6; // start at r = 3 r_s (the ISCO)
setMass(MASS_PRESETS.sgra.m, "sgra");

// Event Horizon Telescope predictions: shadow angular diameter = 2√27 GM/(c² D)
{
  const shadow = (msun, dist) => (2 * Math.sqrt(27) * msun * GM_SUN / (C * C) / dist) * (180 / Math.PI) * 3600 * 1e6;
  $("#ehtM87").textContent = shadow(6.5e9, 16.8e6 * PC).toFixed(0) + " μas";   // distance 16.8 Mpc (EHT 2019 Paper VI)
  $("#ehtSgr").textContent = shadow(4.297e6, 8277 * PC).toFixed(0) + " μas";   // 8.277 kpc (GRAVITY Collaboration 2022)
}

/* =============================================================================================
 * 8. "Fall in": a quasi-static descent by a hovering observer
 * ============================================================================================= */
const fallBtn = $("#fallBtn");
fallBtn.addEventListener("click", () => {
  if (fall.phase === "idle") startFall();
  else if (fall.phase === "in" || fall.phase === "hold") climbOut();
});
function startFall() {
  fall.phase = "in"; fall.t = 0; fall.from = state.dist; fall.back = state.dist; fall.elevFrom = state.elev;
  fall.tau = 0; fall.tFar = 0;
  fallBtn.textContent = "⤒ Climb out"; fallBtn.setAttribute("aria-pressed", "true");
  $("#fallHud").hidden = false;
}
function climbOut() {
  fall.phase = "out"; fall.t = 0; fall.from = state.dist;
  fallBtn.textContent = "⤓ Fall in"; fallBtn.setAttribute("aria-pressed", "false");
}
function endFall(immediate) {
  fall.phase = "idle"; state.yaw = 0;
  fallBtn.textContent = "⤓ Fall in"; fallBtn.setAttribute("aria-pressed", "false");
  if (immediate) $("#fallHud").hidden = true;
  else setTimeout(() => { if (fall.phase === "idle") $("#fallHud").hidden = true; }, 2500);
}
const ease = (x) => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
function updateFall(dt, dtau) {
  if (fall.phase === "idle") return;
  if (fall.phase === "in") {
    fall.t += dt;
    const k = Math.min(1, fall.t / fall.dur);
    const e = ease(k);
    state.dist = state.tDist = Math.exp(Math.log(fall.from) + (Math.log(fall.to) - Math.log(fall.from)) * e);
    state.tElev = fall.elevFrom + (4 - fall.elevFrom) * e;
    if (k >= 1) fall.phase = "hold";
  } else if (fall.phase === "out") {
    fall.t += dt;
    const k = Math.min(1, fall.t / 6);
    const e = ease(k);
    state.dist = state.tDist = Math.exp(Math.log(fall.from) + (Math.log(fall.back) - Math.log(fall.from)) * e);
    state.tElev = 4 + (fall.elevFrom - 4) * e;
    if (k >= 1) { endFall(false); syncingSliders = true; setRange("dist", state.tDist); setRange("elev", state.tElev); syncingSliders = false; }
  }
  // Angular radius of the shadow for a static observer at r: sin α = (√27 M / r) √(1 − 2M/r)  (Synge 1966).
  // Close in it covers most of the sky, so turn to look past the hole: its edge ends up ~10° left of centre.
  const rr = state.dist;
  const alpha = Math.asin(Math.min(1, (Math.sqrt(27) / rr) * Math.sqrt(1 - 2 / rr)));
  const w = THREE.MathUtils.smoothstep(9 - rr, 0, 4.5);   // 0 beyond r = 9M, 1 inside r = 4.5M
  state.yaw = w * (alpha + THREE.MathUtils.degToRad(10));
  $("#distOut").textContent = nf(rr, 1) + " M";
  $("#elevOut").textContent = nf(state.tElev, 1) + "°";
  // clocks: the hovering observer lives dτ; far away, dt = dτ / √(1 − 2M/r) passes
  const r = state.dist;
  const rate = Math.sqrt(1 - 2 / r);
  fall.tau += dtau;
  fall.tFar += dtau / rate;
  const tM = (state.massSun * GM_SUN) / C ** 3;
  $("#fR").innerHTML = nf(r, 2) + "<small>M</small> = " + nf(r / 2, 2) + "<small>r<sub>s</sub></small>";
  $("#fRate").textContent = rate.toFixed(3);
  $("#fTau").textContent = fmtTime(fall.tau * tM);
  $("#fT").textContent = fmtTime(fall.tFar * tM);
  $("#fBar").style.width = Math.min(100, (fall.tau / fall.tFar) * 100) + "%";
  const rsM = (2 * state.massSun * GM_SUN) / (C * C);
  const tide = (2 * state.massSun * GM_SUN * 2) / Math.pow((r / 2) * rsM, 3) / G0;
  $("#fNote").innerHTML = `Mass: ${MASS_PRESETS[Object.keys(MASS_PRESETS).find((k) => MASS_PRESETS[k].m === state.massSun)]?.label || sci(state.massSun) + " M☉"} (set in Calculator). ` +
    `Blueshift of starlight here: ×${(1 / rate).toFixed(2)}. Tidal stretch over 2 m: ${sci(tide)} g. Bar = your clock ÷ far-away clock.`;
}

/* =============================================================================================
 * 9. Main loop with adaptive resolution
 * ============================================================================================= */
const maxFrames = +(params.get("frames") || 0);   // debugging / screenshots: stop after N frames
let framesDone = 0, holding = params.has("hold");
const gl = renderer.getContext();
let fence = null;
let last = performance.now(), lastRender = performance.now(), fpsAcc = 0, fpsN = 0, fpsT = 0, adaptT = 0, slowFrames = 0, fastChecks = 0, firstFrame = true;
function frame(now) {
  requestAnimationFrame(frame);
  if (document.hidden) { last = now; return; }
  const rawDt = (now - last) / 1000;
  last = now;
  const dt = Math.min(rawDt, 0.1);

  // camera smoothing
  if (state.autoOrbit && !pointers.size) state.tAz -= dt * 0.035;
  const s = 1 - Math.exp(-dt * 6);
  state.az += (state.tAz - state.az) * s;
  state.elev += (state.tElev - state.elev) * s;
  if (fall.phase === "idle") state.dist += (state.tDist - state.dist) * s;

  // time: the camera's proper time advances with real time; coordinate time runs faster by 1/√(1−2/r)
  const dtau = dt * state.speed * TIME_SCALE;
  updateFall(dt, dtau);
  updateCamera();
  state.simTime += dtau / Math.sqrt(1 - 2 / state.dist);
  uniforms.uTime.value = state.simTime;
  finalPass.uniforms.uTime.value = now / 1000;

  if (holding || (maxFrames && framesDone >= maxFrames)) return;
  // Never queue more than one frame of GPU work: on a slow GPU that would make input lag pile up
  // (and on a software rasteriser freeze the tab). Poll a fence from the previous frame first.
  if (fence) {
    if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) return;
    gl.deleteSync(fence); fence = null;
  }
  composer.render(dt);
  if (gl.fenceSync) { fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); }
  framesDone++; window.__framesDone = framesDone;

  if (firstFrame) { firstFrame = false; $("#loading").classList.add("done"); }

  // frame statistics
  fpsAcc += Math.min(5, (now - lastRender) / 1000); fpsN++; lastRender = now;
  if (now - fpsT > 500) {
    const fps = fpsN / fpsAcc;
    $("#fps").textContent = fps.toFixed(0) + " fps";
    fpsAcc = 0; fpsN = 0; fpsT = now;
    if (state.adaptive && now - adaptT > 1200) {
      adaptT = now;
      if (fps < 40 && state.scale > 0.34) {
        slowFrames++;
        if (slowFrames >= 1) { state.scale = Math.max(0.33, state.scale * (fps < 20 ? 0.75 : 0.87)); resize(); slowFrames = 0; fastChecks = 0; }
      } else if (fps > 56 && state.scale < state.maxScale) {
        if (++fastChecks >= 3) { state.scale = Math.min(state.maxScale, state.scale * 1.08); resize(); fastChecks = 0; }
      } else { slowFrames = 0; }
      $("#scaleOut").textContent = Math.round(state.scale * 100) + "%" + (state.scale < state.maxScale ? " (auto)" : "");
    }
  }
}

addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => { last = lastRender = performance.now(); });
resize();
updateCamera();
requestAnimationFrame(frame);

// Small hook for automated screenshots / debugging
window.BH = {
  state, uniforms, fall, setMass, startFall, resize,
  go() { holding = false; },
  simulateFall(sec) { startFall(); for (let t = 0; t < sec; t += 1 / 60) { updateFall(1 / 60, (state.speed * TIME_SCALE) / 60); state.elev = state.tElev; } updateCamera(); },
  view(elev, dist, az) { state.elev = state.tElev = elev; state.dist = state.tDist = dist; if (az != null) state.az = state.tAz = az; syncElevSlider(); setDist(dist); },
  fixed(scale) { adaptiveEl.checked = false; state.adaptive = false; state.maxScale = state.scale = scale || 1; setRange("scale", state.scale); },
};
