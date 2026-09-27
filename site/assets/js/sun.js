/* The Sun: an interactive 3D model of our star.
 *
 * Everything on the disc is procedural (no textures): granulation from animated
 * 3D Worley noise, supergranulation, sunspots, faculae, filaments, coronal holes,
 * differential rotation, and five wavelength "filters" that change what the
 * shader shows. Prominences and coronal loops are tube meshes along magnetic
 * arch curves; the corona is a screen-aligned shell shader; eruptions are
 * particle systems. Bloom via UnrealBloomPass.
 *
 * Physical numbers and their sources:
 *   Mass 1.9885e30 kg, mean density 1408 kg/m3, surface gravity 274 m/s2,
 *   escape velocity 617.6 km/s, central temperature 1.571e7 K, central density
 *   1.622e5 kg/m3, solar constant 1361 W/m2   <- NASA Sun Fact Sheet (nssdc.gsfc.nasa.gov)
 *   R = 6.957e8 m, L = 3.828e26 W, Teff = 5772 K  <- IAU 2015 Resolution B3 (Prsa et al. 2016)
 *   Differential rotation  Omega = A + B sin^2(lat) + C sin^4(lat),
 *     A = 14.713, B = -2.396, C = -1.787 deg/day (sidereal)  <- Snodgrass & Ulrich 1990, ApJ 351, 309
 *   Limb darkening, quadratic law  I(mu)/I(1) = 1 - a(1-mu) - b(1-mu)^2,
 *     a = 0.47, b = 0.23 near 500 nm  <- Allen's Astrophysical Quantities (Cox 2000)
 *   White-light corona radial profile  <- Baumbach (1937) K-corona formula
 *   AIA channel temperatures: 171 A Fe IX logT 5.8; 193 A Fe XII 6.2 / Fe XXIV 7.3;
 *     304 A He II logT 4.7  <- Lemen et al. 2012, Solar Physics 275, 17
 *   Photon diffusion time ~1.7e5 yr  <- Mitalas & Sills 1992, ApJ 401, 759
 *   Earth mean radius 6371 km  <- NASA Earth Fact Sheet
 *   Planet mean distances  <- NASA Planetary Fact Sheet
 *   CME speeds 250-3000 km/s  <- NOAA Space Weather Prediction Center
 *
 * GLSL noise: simplex noise by Ian McEwan & Stefan Gustavson (Ashima Arts, MIT);
 * hash33 by Dave Hoskins ("Hash without Sine", MIT).
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

const $ = (s) => document.querySelector(s);
const Codex = window.Codex || { fmt: (v) => String(v), webgl: () => true, noGL() {}, reducedMotion: false };
const gsap = window.gsap;
const REDUCE = !!Codex.reducedMotion;
const PHONE = window.matchMedia("(max-width: 820px)").matches;

/* ---------------------------------------------------------------------------
 * Physical constants (SI)
 * ------------------------------------------------------------------------- */
const PHYS = {
  M: 1.9885e30,          // kg, NASA Sun Fact Sheet
  R: 6.957e8,            // m, IAU nominal solar radius
  L: 3.828e26,           // W, IAU nominal luminosity
  Teff: 5772,            // K, IAU nominal effective temperature
  sigma: 5.670374419e-8, // W m^-2 K^-4, CODATA 2018
  b: 2.897771955e-3,     // m K, Wien displacement constant (CODATA 2018)
  c: 299792458,          // m/s
  Rearth: 6.371e6,       // m, NASA Earth Fact Sheet (volumetric mean)
};
const EARTH_R = PHYS.Rearth / PHYS.R; // 1/109.2 solar radii
// Mean orbital distances, 10^6 km (NASA Planetary Fact Sheet)
const PLANETS = [
  ["Parker Solar Probe, closest (Dec 2024)", 6.86],
  ["Mercury", 57.9], ["Venus", 108.2], ["Earth", 149.6], ["Mars", 228.0],
  ["Jupiter", 778.5], ["Saturn", 1432.0], ["Uranus", 2867.0], ["Neptune", 4515.0], ["Pluto", 5906.4],
];

// Differential rotation (Snodgrass & Ulrich 1990), sidereal, degrees/day
const DR = { A: 14.713, B: -2.396, C: -1.787 };
function omegaDeg(latRad) { const s = Math.sin(latRad) ** 2; return DR.A + DR.B * s + DR.C * s * s; }
function omegaRad(latRad) { return THREE.MathUtils.degToRad(omegaDeg(latRad)); }

/* ---------------------------------------------------------------------------
 * Wavelength filters
 * ------------------------------------------------------------------------- */
const FILTERS = [
  { name: "White light", meta: "400–700 nm · photosphere · ≈5,772 K", color: "#ffd79a", bloom: 0.62,
    text: "The photosphere, the layer where the gas turns transparent and sunlight escapes. The bright-centred cells with dark edges are granules, the tops of convection currents: each is about 1,000 km across and lives 5–20 minutes. Sunspots look dark because strong magnetic fields choke off convection, so the umbra cools to about 3,700 K. Toward the edge we see higher, cooler gas, so the disc darkens and reddens (limb darkening) and bright magnetic faculae stand out." },
  { name: "Hydrogen-alpha (Hα) 656.3 nm", meta: "chromosphere · ≈10,000 K", color: "#ff4a2a", bloom: 0.7,
    text: "Deep-red light emitted when a hydrogen electron drops from level 3 to level 2. It samples the chromosphere, a thin layer above the photosphere. You see the chromospheric network tracing the edges of supergranules (≈30,000 km convection cells), bright plage around sunspots, dark snaking filaments, and the same cool clouds glowing as prominences where they hang over the limb. Flares appear as two bright ribbons." },
  { name: "Extreme ultraviolet (EUV) 171 Å", meta: "Fe IX · upper transition region, quiet corona · ≈630,000 K", color: "#ffc233", bloom: 0.85,
    text: "The gold channel of the Atmospheric Imaging Assembly (AIA) on NASA's Solar Dynamics Observatory (SDO). The light comes from iron atoms missing eight electrons (Fe IX). The disc is dim, but hot plasma trapped on magnetic field lines lights up coronal loops arching over active regions: a direct picture of the Sun's magnetic field. The corona is transparent, so the limb brightens where we look through more of it." },
  { name: "Extreme ultraviolet (EUV) 304 Å", meta: "He II · chromosphere, transition region · ≈50,000 K", color: "#ff6a1a", bloom: 0.85,
    text: "Singly ionised helium (He II) at about 50,000 K images the upper chromosphere and transition region, where temperature leaps from thousands to millions of kelvin in a few thousand kilometres. This is the best EUV channel for prominences and filaments; the mottled texture is the chromospheric network." },
  { name: "Extreme ultraviolet (EUV) 193 Å", meta: "Fe XII ≈1.6 MK · Fe XXIV ≈20 MK in flares", color: "#c9a26a", bloom: 0.85,
    text: "Iron missing eleven electrons (Fe XII) shows the corona at about 1.6 million K, and Fe XXIV shows 20-million-K flare plasma. Coronal holes appear dark: there the magnetic field opens into space and plasma streams away as the fast solar wind (≈750 km/s), leaving little hot gas to shine." },
];

/* ---------------------------------------------------------------------------
 * GLSL
 * ------------------------------------------------------------------------- */
const GLSL_NOISE = /* glsl */ `
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }
// Simplex noise 3D, Ian McEwan & Stefan Gustavson (Ashima Arts), MIT licence
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
// Hash without Sine, Dave Hoskins, MIT licence
vec3 hash33(vec3 p3){
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
// Animated Worley (cellular) noise: returns (F1, F2). Feature points orbit
// slowly inside their cells so the cells "boil" like real granulation.
vec2 worley(vec3 x, float t){
  vec3 i = floor(x);
  vec3 f = fract(x);
  float d1 = 8.0, d2 = 8.0;
  for (int k = -1; k <= 1; k++)
  for (int j = -1; j <= 1; j++)
  for (int l = -1; l <= 1; l++) {
    vec3 g = vec3(float(l), float(j), float(k));
    vec3 h = hash33(i + g);
    vec3 o = 0.5 + 0.38 * sin(t * (0.6 + h.zxy) + 6.2831 * h);
    vec3 r = g + o - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
  }
  return sqrt(vec2(d1, d2));
}
`;

const GLSL_COMMON = /* glsl */ `
#define PI 3.14159265359
// Snodgrass & Ulrich (1990) sidereal differential rotation, radians/day; s2 = sin^2(latitude)
float omegaR(float s2){ return radians(14.713 - 2.396*s2 - 1.787*s2*s2); }
// Same convention as THREE.Matrix4.makeRotationY
vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c); }
// Approximations of the SDO/AIA false-colour tables
vec3 aia171(float x){ x = clamp(x, 0.0, 4.0); return vec3(pow(x, 0.75)*1.25, pow(x, 1.08)*0.92, pow(x, 2.1)*0.42); }
vec3 aia193(float x){ x = clamp(x, 0.0, 4.0); return vec3(pow(x, 0.85)*1.12, pow(x, 1.05)*0.86, pow(x, 1.7)*0.52); }
vec3 aia304(float x){ x = clamp(x, 0.0, 4.0); return vec3(pow(x, 0.8)*1.55, pow(x, 1.9)*0.62, pow(x, 3.4)*0.30); }
`;

const PHOTO_VERT = /* glsl */ `
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vNw;
void main(){
  vObj = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PHOTO_FRAG = /* glsl */ `
uniform float uDays;
uniform float uVis;
uniform int uFilter;
uniform float uFade;
uniform float uCut;
uniform vec3 uN1;
uniform vec3 uN2;
uniform vec3 uN3;
uniform vec4 uSpots[16];
uniform int uNSpots;
uniform vec4 uAR[4];
uniform vec3 uCH;
uniform vec4 uFlare;
uniform vec3 uFlareE1;
uniform float uMarkT;
uniform float uMarkOn;
varying vec3 vObj;
varying vec3 vWorld;
varying vec3 vNw;
${GLSL_NOISE}
${GLSL_COMMON}
#define GF 72.0     // granulation frequency on the unit sphere (≈2× real granule size)
#define SF 13.0     // supergranulation frequency

vec3 seedOf(float k){ return vec3(fract(k*0.3183)*97.0, fract(k*0.7071)*89.0, fract(k*0.5772)*83.0); }

// x: granulation (0 lane .. 1 bright centre), y: network, z: mesoscale, w: filament
vec4 fields(vec3 q, vec3 sd){
  vec2 g = worley(q*GF + sd, uVis*0.25);
  float lane = smoothstep(0.0, 0.16, g.y - g.x);
  float body = 1.0 - smoothstep(0.1, 0.95, g.x);          // bright, domed granule centres
  float gran = lane * (0.55 + 0.45*body) * (0.9 + 0.2*hash33(floor(q*GF + sd) + 3.0).x);
  vec2 s = worley(q*SF + sd*0.37 + 11.0, uVis*0.03);
  float net = 1.0 - smoothstep(0.0, 0.17, s.y - s.x);
  float meso = snoise(q*26.0 + sd);
  float fil = 0.0;
  if (uFilter == 1 || uFilter == 3) {
    float ridge = abs(snoise(q*3.1 + sd*0.1));
    fil = (1.0 - smoothstep(0.0, 0.05, ridge)) * smoothstep(0.15, 0.55, snoise(q*1.6 + 5.0 + sd*0.1));
  }
  return vec4(gran, net, meso, fil);
}

void main(){
  if (uCut > 0.5 && dot(vWorld, uN1) > 0.0 && dot(vWorld, uN2) > 0.0 && dot(vWorld, uN3) > 0.0) discard;
  vec3 p = normalize(vObj);
  vec3 N = normalize(vNw);
  vec3 V = normalize(cameraPosition - vWorld);
  float mu = clamp(dot(N, V), 0.0, 1.0);
  float s2 = p.y*p.y;
  float om = omegaR(s2);

#if QUALITY > 0
  // Two-phase "flow map": each phase is sampled in a frame rotating at the local
  // (latitude-dependent) rate and restarts every T days with a new seed; phases
  // cross-fade so the shear from differential rotation never piles up.
  const float T = 8.0;
  float tA = mod(uDays, T);
  float tB = mod(uDays + 0.5*T, T);
  float kA = floor(uDays / T);
  float kB = floor((uDays + 0.5*T) / T) + 0.5;
  float wA = 1.0 - abs(2.0*tA/T - 1.0);
  vec4 fA = fields(rotY(p, -om*tA), seedOf(kA));
  vec4 fB = fields(rotY(p, -om*tB), seedOf(kB));
  vec4 F = mix(fB, fA, wA);
  const vec4 M = vec4(0.62, 0.30, 0.0, 0.12);
  F = M + (F - M) / sqrt(wA*wA + (1.0 - wA)*(1.0 - wA));
  F.xyw = clamp(F.xyw, 0.0, 1.0);
#else
  vec4 F = fields(rotY(p, -radians(14.713)*uDays), vec3(0.0));
#endif

  // Fade granulation where it would alias (far away) so the disc stays smooth
  float aa = 1.0 - smoothstep(0.55, 1.25, length(fwidth(p)) * GF);
  float gran = mix(0.62, F.x, aa);

  // Sunspots: umbra ≈ 40% of the spot radius, penumbra with radial filaments
  float umb = 0.0, pen = 0.0, penFil = 0.0;
  for (int i = 0; i < 16; i++) {
    if (i >= uNSpots) break;
    vec4 S = uSpots[i];
    if (dot(p, S.xyz) < 0.95) continue;
    vec3 e1 = normalize(cross(vec3(0.0, 1.0, 0.0), S.xyz));
    vec3 e2 = cross(S.xyz, e1);
    vec3 v = p - S.xyz;
    vec2 l = vec2(dot(v, e1), dot(v, e2)) / S.w;
    float r = length(l);
    if (r > 1.4) continue;
    float a = atan(l.y, l.x);
    float fi = float(i);
    float rr = r * (1.0 + 0.10*sin(a*3.0 + fi*1.7) + 0.06*sin(a*7.0 + fi*4.1));
    float u = 1.0 - smoothstep(0.36, 0.45, rr);
    float pn = 1.0 - smoothstep(0.90, 1.06, rr);
    umb = max(umb, u);
    if (pn > pen) {
      pen = pn;
      vec2 dir = l / max(r, 1e-4);
      penFil = snoise(vec3(dir*17.0, r*1.3 + fi*7.0));
    }
  }

  // Active regions (plage / faculae / EUV brightening) and coronal holes
  float ar = 0.0;
  for (int i = 0; i < 4; i++) {
    float d = acos(clamp(dot(p, uAR[i].xyz), -1.0, 1.0)) / uAR[i].w;
    ar = max(ar, exp(-d*d));
  }
  float chPolar = smoothstep(0.80, 0.90, abs(p.y) + 0.05*F.z);
  float chLow = 1.0 - smoothstep(0.15, 0.27, acos(clamp(dot(p, uCH), -1.0, 1.0)) * (1.0 + 0.35*F.z));
  float ch = max(chPolar, chLow) * (1.0 - ar);

  // Flare: two bright ribbons either side of the polarity inversion line
  float fl = 0.0;
  if (uFlare.w > 0.001) {
    vec3 c = uFlare.xyz;
    vec3 f1 = uFlareE1;
    vec3 f2 = normalize(cross(c, f1));
    vec3 v = p - c;
    float x = dot(v, f1) / 0.07;
    float y = dot(v, f2) / 0.07;
    float rib = exp(-pow((abs(x) - 0.30 - 0.08*sin(y*6.0 + x)) / 0.08, 2.0)) * exp(-y*y*1.1);
    float kern = exp(-(x*x + y*y) * 1.4);
    fl = uFlare.w * (rib * (0.75 + 0.5*F.z) + 0.55*kern);
  }

  vec3 col;
  if (uFilter == 0) {
    // ---- white light ----
    float I = mix(0.66, 1.1, gran) * (1.0 + 0.08*F.z) * (1.0 + 0.05*F.y);
    I *= mix(1.0, 0.70 + 0.14*penFil, pen);
    I *= mix(1.0, 0.24, umb);
    // quadratic limb darkening, a = 0.47, b = 0.23 near 500 nm (G); R and B
    // bracket it so the limb reddens as observed
    float m1 = 1.0 - mu;
    vec3 LD = 1.0 - vec3(0.40, 0.47, 0.55)*m1 - vec3(0.22, 0.23, 0.22)*m1*m1;
    float fac = ar * (0.35 + F.y) * pow(m1, 1.2) * 0.6 * (1.0 - pen);
    // Solar photographs map intensity linearly to pixel value; our output is
    // sRGB-encoded, so square the law to make the limb look as it does in images.
    LD = LD * LD;
    col = vec3(1.0, 0.5, 0.16) * 1.45 * I * LD * (1.0 + fac);
    col *= mix(vec3(1.0), vec3(1.0, 0.72, 0.52), umb);
    col += vec3(1.0, 0.92, 0.8) * fl * 1.3;
  } else if (uFilter == 1) {
    // ---- H-alpha ----
    float netH = F.y * (0.35 + 0.65*smoothstep(-0.4, 0.6, F.z));
    float I = 0.48 + 0.07*(gran - 0.5) + 0.30*netH + 0.10*F.z;
    I += 0.75 * ar * (0.65 + 0.35*F.z);
    I *= 1.0 - 0.72 * F.w * (1.0 - ar*0.7);
    I *= mix(1.0, 0.62, pen);
    I *= mix(1.0, 0.35, umb);
    I *= 0.62 + 0.38*pow(mu, 0.35);
    I += fl * 3.0;
    col = vec3(1.0, 0.16, 0.06)*I*1.7 + vec3(1.0, 0.55, 0.3)*pow(max(I - 0.55, 0.0), 1.5)*1.6;
  } else if (uFilter == 2) {
    // ---- AIA 171 ----
    float speck = pow(F.y, 3.0) * smoothstep(-0.2, 0.7, F.z);
    float I = 0.13 + 0.22*speck + 0.05*F.z;
    I += 0.85 * ar * (0.45 + 0.55*smoothstep(-0.3, 0.8, F.z)) * (1.0 - 0.5*umb);
    I *= 1.0 - 0.6*ch;
    I *= 1.0 + 1.5*pow(1.0 - mu, 3.0);
    I += fl * 4.0;
    col = aia171(I) * 0.8;
  } else if (uFilter == 3) {
    // ---- AIA 304 ----
    float net3 = F.y * (0.3 + 0.7*smoothstep(-0.5, 0.6, F.z));
    float I = 0.30 + 0.34*net3 + 0.10*F.z + 0.05*(gran - 0.5);
    I += 0.7 * ar * (0.6 + 0.4*F.z);
    I *= 1.0 - 0.5 * F.w * (1.0 - ar);
    I *= 1.0 - 0.25*ch;
    I *= mix(1.0, 0.6, umb);
    I *= 0.9 + 0.8*pow(1.0 - mu, 4.0);
    I += fl * 4.0;
    col = aia304(I) * 0.75;
  } else {
    // ---- AIA 193 ----
    float I = 0.2 + 0.08*F.y*smoothstep(-0.3, 0.7, F.z) + 0.08*F.z;
    I += 0.95 * ar * (0.45 + 0.55*smoothstep(-0.3, 0.8, F.z));
    I *= 1.0 - 0.85*ch;
    I *= 1.0 + 1.4*pow(1.0 - mu, 3.0);
    I += fl * 5.0;
    col = aia193(I) * 0.8;
  }

  // Rotation markers: meridians painted at uMarkT, advected by differential rotation
  if (uMarkOn > 0.001) {
    vec3 m = rotY(p, -om*(uDays - uMarkT));
    float lon = atan(m.z, m.x);
    float cl = sqrt(max(1.0 - s2, 0.0));
    float dm = abs(sin(6.0*lon)) / 6.0 * cl;
    float dl = abs(sin(6.0*asin(clamp(p.y, -1.0, 1.0)))) / 6.0;
    float d0 = abs(sin(0.5*lon)) * 2.0 * cl;
    float lm = 1.0 - smoothstep(0.0014, 0.0016 + fwidth(dm)*1.5, dm);
    float ll = 1.0 - smoothstep(0.0012, 0.0014 + fwidth(dl)*1.5, dl);
    float l0 = 1.0 - smoothstep(0.0035, 0.0038 + fwidth(d0)*1.5, d0);
    float polarFade = 1.0 - smoothstep(0.9, 0.97, abs(p.y));
    col = mix(col, vec3(0.55, 0.85, 1.4)*1.3, clamp(max(lm, ll*0.55)*0.75*polarFade, 0.0, 1.0) * uMarkOn);
    col = mix(col, vec3(1.9, 1.4, 0.45)*1.4, l0 * polarFade * uMarkOn);
  }

  gl_FragColor = vec4(max(col, vec3(0.0)) * uFade, 1.0);
}`;

const CORONA_VERT = /* glsl */ `
varying vec2 vP;
void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const CORONA_FRAG = /* glsl */ `
uniform int uFilter;
uniform float uFade;
uniform float uAxis;
uniform float uVis;
uniform float uOn;
uniform float uFlareW;
varying vec2 vP;
${GLSL_NOISE}
${GLSL_COMMON}
void main(){
  float r = length(vP);
  if (r < 0.99) discard;
  float a = atan(vP.y, vP.x) - uAxis;
  vec2 d = vec2(cos(a), sin(a));
  float eq = abs(d.y);                    // 1 at the solar equator, 0 over the poles
  float lr = log(r);
  // Baumbach (1937) K-corona brightness, normalised to 1 at the limb
  float K = (0.0532*pow(r, -2.5) + 1.425*pow(r, -7.0) + 2.565*pow(r, -17.0)) / 4.0425;
  float big  = snoise(vec3(d*1.8, lr*0.5 - uVis*0.004 + 3.0));
  float mid  = snoise(vec3(d*7.0, lr*0.9 - uVis*0.010));
  float fine = snoise(vec3(d*38.0, lr*1.6 - uVis*0.020));
  float streamer = smoothstep(-0.25, 0.85, big) * (0.45 + 0.55*smoothstep(0.1, 0.8, eq));
  float plumes = (1.0 - smoothstep(0.35, 0.6, eq)) * (0.5 + 0.5*fine);
  float S = 0.22 + 2.4*streamer*streamer*(0.75 + 0.25*mid) + 0.35*plumes + 0.10*fine*(0.4 + streamer);
  float I = K * S;
  float rim = exp(-(r - 1.0) / 0.010);
  float halo = exp(-(r - 1.0) * 2.2);
  vec3 col;
  if (uFilter == 0) {
    col = vec3(1.0, 0.84, 0.66)*I*0.6 + vec3(1.0, 0.45, 0.16)*halo*0.12 + vec3(1.0, 0.3, 0.3)*rim*0.2;
  } else if (uFilter == 1) {
    // spicules: a ragged fringe of chromospheric jets ≈ 5,000–10,000 km tall
    float sp = 0.008 + 0.014*max(0.0, snoise(vec3(d*170.0, uVis*0.15))) + 0.006*max(0.0, mid);
    float spic = 1.0 - smoothstep(0.0, sp, r - 1.0);
    col = vec3(1.0, 0.18, 0.08)*spic*1.8 + vec3(1.0, 0.2, 0.1)*halo*0.06 + vec3(0.9, 0.2, 0.1)*I*0.15;
  } else if (uFilter == 2) {
    float E = pow(K, 1.3) * (0.35 + 1.4*streamer*(0.6 + 0.4*mid) + 0.5*plumes*(0.5 + 0.5*fine) + 0.25*max(fine, 0.0));
    col = aia171(E*1.1) + vec3(1.0, 0.7, 0.2)*halo*0.04;
  } else if (uFilter == 3) {
    float tr = 1.0 - smoothstep(0.0, 0.018 + 0.012*max(0.0, snoise(vec3(d*120.0, uVis*0.1))), r - 1.0);
    col = aia304(tr*0.9 + pow(K, 1.5)*0.3*(0.5 + streamer)) * 0.8;
  } else {
    float E = pow(K, 1.25) * (0.3 + 1.5*streamer*(0.6 + 0.4*mid) + 0.3*max(fine, 0.0)) * (0.35 + 0.65*smoothstep(0.2, 0.6, eq));
    col = aia193(E*1.1) + vec3(0.8, 0.6, 0.35)*halo*0.04;
  }
  col *= 1.0 + uFlareW*1.5;
  gl_FragColor = vec4(col * uFade * uOn, 1.0);
}`;

const PLASMA_VERT = /* glsl */ `
attribute float aSeed;
uniform float uLift;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNw;
varying float vSeed;
void main(){
  vUv = uv;
  vSeed = aSeed;
  vec3 p = position;
  // eruption: stretch the structure outward, footpoints stay anchored
  float h = max(length(p) - 0.99, 0.0);
  p += normalize(p) * uLift * h * 7.0;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vNw = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const PLASMA_FRAG = /* glsl */ `
uniform float uVis;
uniform float uFade;
uniform float uCut;
uniform vec3 uN1;
uniform vec3 uN2;
uniform vec3 uN3;
uniform vec3 uColor;
uniform float uEmis;
uniform float uOnDisc;
uniform float uAbsorb;
uniform float uSpeed;
uniform float uBoost;
uniform float uAlpha;
uniform float uFreq;
varying vec2 vUv;
varying vec3 vWorld;
varying vec3 vNw;
varying float vSeed;
${GLSL_NOISE}
void main(){
  if (uCut > 0.5 && dot(vWorld, uN1) > 0.0 && dot(vWorld, uN2) > 0.0 && dot(vWorld, uN3) > 0.0) discard;
  vec3 V = normalize(cameraPosition - vWorld);
  float facing = abs(dot(normalize(vNw), V));
  float core = pow(facing, 1.4);
  float s = vUv.x;
  float ends = smoothstep(0.0, 0.07, s) * smoothstep(1.0, 0.93, s);
  // plasma knots flowing along the field line (siphon flows / coronal rain)
  float dir = vSeed > 0.5 ? 1.0 : -1.0;
  float flow  = snoise(vec3(s*uFreq - uVis*uSpeed*dir, vSeed*13.0, 0.5));
  float flow2 = snoise(vec3(s*uFreq*2.7 - uVis*uSpeed*1.6*dir, vSeed*7.0, 2.0));
  float k = 0.4 + 0.6*smoothstep(-0.35, 0.8, flow) + 0.25*flow2;
  // Is this fragment in front of the solar disc (line of sight hits the Sun behind it)?
  vec3 cp = cameraPosition;
  vec3 rd = normalize(vWorld - cp);
  float tc = -dot(cp, rd);
  float d2 = dot(cp, cp) - tc*tc;
  float onDisc = (1.0 - smoothstep(0.96, 1.0, d2)) * step(length(vWorld - cp), tc);
  float strand = 0.35 + 0.65*fract(vSeed*7.31);   // strands differ in brightness
  float e = uEmis * k * ends * core * uBoost * strand * mix(1.0, uOnDisc, onDisc);
  float a = uAbsorb * onDisc * ends * core * (0.55 + 0.45*k);
  gl_FragColor = vec4(uColor * e * uFade * uAlpha, a * uFade * uAlpha);
}`;

const FACE_VERT = /* glsl */ `
varying vec2 vP;
varying vec3 vWorld;
void main(){
  vP = position.xy;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FACE_FRAG = /* glsl */ `
uniform float uVis;
uniform float uOpen;
uniform float uFloor;
uniform vec3 uN1;
uniform vec3 uN2;
varying vec2 vP;
varying vec3 vWorld;
${GLSL_NOISE}
float ring(float r, float r0){ float w = fwidth(r)*1.2; return 1.0 - smoothstep(0.0, w + 0.0015, abs(r - r0)); }
void main(){
  if (uFloor > 0.5 && (dot(vWorld, uN1) < 0.0 || dot(vWorld, uN2) < 0.0)) discard;
  float r = length(vP);
  float ang = atan(vP.y, vP.x);
  vec3 col;
  if (r < 0.25) {
    // core: p-p fusion, 15.7 MK
    float k = r / 0.25;
    col = mix(vec3(2.0, 1.65, 1.05), vec3(1.4, 0.8, 0.3), k*k);
    float f = snoise(vec3(vP*34.0, uVis*0.9));
    float f2 = snoise(vec3(vP*80.0, uVis*1.7));
    col += vec3(1.6, 1.3, 0.9) * pow(max(f*0.6 + f2*0.4, 0.0), 4.0) * 5.0;
  } else if (r < 0.70) {
    // radiative zone: energy diffuses outward as light, 7 -> 2 MK
    float k = (r - 0.25) / 0.45;
    col = mix(vec3(1.15, 0.56, 0.17), vec3(0.5, 0.16, 0.04), pow(k, 0.8));
    float rip = 0.5 + 0.5*sin(r*150.0 - uVis*1.6 + 0.6*snoise(vec3(vP*6.0, uVis*0.1)));
    col *= 0.86 + 0.14*rip;
  } else if (r < 0.713) {
    // tachocline: thin shear layer between rigid and differential rotation
    col = vec3(1.3, 0.8, 0.3) * (0.75 + 0.25*sin(ang*140.0 + uVis*4.0));
  } else if (r < 0.994) {
    // convective zone: rising hot plumes, sinking cool lanes
    float k = (r - 0.713) / 0.287;
    float n = 26.0 + 20.0*k;
    float cellPhase = sin(ang*n + 1.3*snoise(vec3(ang*3.0, k*2.0, uVis*0.05)));
    float up = 0.5 + 0.5*cellPhase;
    float adv = snoise(vec3(ang*n*0.35, r*18.0 - uVis*0.5*(cellPhase), uVis*0.05));
    float heat = clamp(up*0.75 + 0.35*adv, 0.0, 1.0);
    col = mix(vec3(0.16, 0.035, 0.008), vec3(1.05, 0.4, 0.09), heat) * (1.0 + 0.3*k);
  } else {
    col = vec3(1.7, 1.1, 0.5);
  }
  // crisp boundaries
  col *= 1.0 - 0.55*ring(r, 0.25) - 0.55*ring(r, 0.70) - 0.45*ring(r, 0.713);
  gl_FragColor = vec4(col * uOpen, 1.0);
}`;

const CME_VERT = /* glsl */ `
attribute vec3 aU;      // x: strand angle 0..1, y: position along the strand 0..1, z: jitter
attribute float aKind;  // 0 = flux-rope shell, 1 = bright prominence core
attribute float aR;
uniform float uS;
uniform float uPx;
uniform float uSize;
varying float vA;
varying float vK;
void main(){
  float s = uS;
  float L = s * 7.5;                      // leading edge height above the surface (solar radii)
  float t = aU.y;
  vec3 p;
  float bright;
  if (aKind < 0.5) {
    // "light-bulb" flux rope: legs anchored in the active region, a bulb that
    // expands self-similarly; particles lie on field-line strands
    float strands = 34.0;
    float th = (floor(aU.x * strands) + 0.5 + (aU.z - 0.5) * 0.25) / strands * 6.2831;
    float tb = pow(t, 0.8);
    float w = L * 0.5 * pow(sin(3.14159 * tb), 0.85) + 0.04 * (1.0 - t);
    p = vec3(cos(th) * w * 1.2, sin(th) * w, 1.0 + L * t);
    p += normalize(vec3(aR - 0.5, aU.z - 0.5, aR * aU.z - 0.25)) * (0.012 + 0.03 * L * 0.1) * aR;
    bright = (0.25 + 0.75 * smoothstep(0.35, 0.85, t)) * (0.55 + 0.9 * step(0.72, fract(aU.x * strands)));
  } else {
    // erupted prominence: a twisted bright core inside the bulb
    float th = aU.x * 6.2831 * 3.0 + t * 9.0;
    float r = L * 0.13 * aR;
    p = vec3(cos(th) * r * 1.3, sin(th) * r, 1.0 + L * (0.32 + 0.3 * t));
    bright = 1.0;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uSize * uPx * (0.5 + aR) / -mv.z, 24.0);
  vA = bright * (1.0 - smoothstep(0.55, 1.0, s)) * smoothstep(0.0, 0.05, s) * smoothstep(0.3, 1.5, -mv.z);
  vK = aKind;
}`;

const CME_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uCore;
uniform float uFade;
varying float vA;
varying float vK;
void main(){
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(mix(uColor, uCore, vK) * a * a * vA * uFade * 0.6, 1.0);
}`;

const WIND_VERT = /* glsl */ `
attribute vec3 aDir;
attribute float aPh;
attribute float aFast;
uniform float uVis;
uniform float uPx;
varying float vA;
void main(){
  float f = fract(aPh + uVis * 0.05 * (aFast > 0.5 ? 1.9 : 1.0));  // fast wind ≈ 750 km/s vs slow ≈ 400 km/s
  float r = 1.03 + f * 11.0;
  vec4 mv = modelViewMatrix * vec4(aDir * r, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(uPx * 1.6 / -mv.z * (1.0 + aFast*0.4), 3.0);
  // fade particles that stream past the camera
  vA = smoothstep(0.0, 0.08, f) * (1.0 - f) * (0.5 + 0.5*aFast) * smoothstep(0.5, 2.0, -mv.z);
}`;

const WIND_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uOn;
varying float vA;
void main(){
  float d = length(gl_PointCoord - 0.5);
  gl_FragColor = vec4(uColor * smoothstep(0.5, 0.0, d) * vA * uOn, 1.0);
}`;

const EARTH_VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
varying vec3 vO;
void main(){
  vO = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const EARTH_FRAG = /* glsl */ `
uniform float uVis;
varying vec3 vN;
varying vec3 vW;
varying vec3 vO;
${GLSL_NOISE}
void main(){
  vec3 n = normalize(vN);
  vec3 L = normalize(-vW);
  vec3 V = normalize(cameraPosition - vW);
  vec3 p = normalize(vO);
  float cont = snoise(p*2.2) + 0.5*snoise(p*4.7) + 0.25*snoise(p*9.5);
  float land = smoothstep(0.12, 0.22, cont);
  vec3 base = mix(vec3(0.02, 0.08, 0.24), mix(vec3(0.10, 0.26, 0.07), vec3(0.45, 0.38, 0.22), smoothstep(0.4, 0.9, cont)), land);
  base = mix(base, vec3(0.9), smoothstep(0.82, 0.9, abs(p.y)));
  float cl = smoothstep(0.15, 0.7, snoise(p*5.0 + vec3(uVis*0.02, 0.0, 0.0)) + 0.4*snoise(p*11.0));
  base = mix(base, vec3(1.0), cl*0.8);
  float diff = max(dot(n, L), 0.0);
  vec3 col = base * (diff*1.5 + 0.015);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  col += vec3(0.3, 0.6, 1.2) * fres * (0.25 + diff) * 0.9;
  gl_FragColor = vec4(col, 1.0);
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize;
attribute vec3 aColor;
uniform float uPx;
varying vec3 vC;
void main(){
  vC = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPx;
}`;
const STAR_FRAG = /* glsl */ `
varying vec3 vC;
void main(){ float d = length(gl_PointCoord - 0.5); gl_FragColor = vec4(vC * smoothstep(0.5, 0.05, d), 1.0); }`;

/* ---------------------------------------------------------------------------
 * Small helpers
 * ------------------------------------------------------------------------- */
const V3 = THREE.Vector3;
const Y = new V3(0, 1, 0);
const D2R = Math.PI / 180;
function dirLatAz(latDeg, azDeg) {
  const la = latDeg * D2R, az = azDeg * D2R;
  return new V3(Math.cos(la) * Math.cos(az), Math.sin(la), Math.cos(la) * Math.sin(az));
}
function slerpV(a, b, t) {
  const th = Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
  if (th < 1e-5) return a.clone();
  const s = Math.sin(th);
  return a.clone().multiplyScalar(Math.sin((1 - t) * th) / s).add(b.clone().multiplyScalar(Math.sin(t * th) / s));
}
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = mulberry32(20240915);
const rr = (a, b) => a + (b - a) * rand();
function jitter(v, amt) { return v.clone().add(new V3(rr(-amt, amt), rr(-amt, amt), rr(-amt, amt))).normalize(); }

/** Magnetic arch from footpoint a to b (unit vectors), apex height h (solar radii) */
function archCurve(a, b, h, side = 0, twist = 0, phase = 0, n = 48) {
  const pts = [];
  const axis = new V3().crossVectors(a, b).normalize();
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const d = slerpV(a, b, t);
    const lift = Math.sin(Math.PI * t);
    const r = 0.992 + h * Math.pow(lift, 0.8);
    const p = d.multiplyScalar(r);
    p.addScaledVector(axis, (side + twist * Math.sin(t * Math.PI * 3 + phase)) * lift * h);
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}
function tubeWithSeed(curve, radius, seed, seg = 64, radial = 6) {
  const g = new THREE.TubeGeometry(curve, seg, radius, radial, false);
  const n = g.attributes.position.count;
  g.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(n).fill(seed), 1));
  return g;
}

/* ---------------------------------------------------------------------------
 * Main
 * ------------------------------------------------------------------------- */
function main() {
  const stage = $("#stage");
  if (!Codex.webgl()) { Codex.noGL(); $("#loading").classList.add("done"); return; }

  const params = new URLSearchParams(location.search);
  let quality = params.has("q") ? +params.get("q") : (PHONE ? 1 : 2);
  $("#quality").value = String(quality);

  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  function effectivePR() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return quality === 2 ? dpr : quality === 1 ? 1 : 0.75;
  }
  renderer.setPixelRatio(effectivePR());
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.75;
  renderer.setClearColor(0x020308, 1);
  renderer.domElement.setAttribute("aria-label", stage.getAttribute("aria-label"));
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(PHONE ? 50 : 38, innerWidth / innerHeight, 0.005, 2000);
  const HOME_DIST = PHONE ? 6.4 : 4.5;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 1.12;
  controls.maxDistance = 40;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.8;
  controls.autoRotate = !REDUCE;
  controls.autoRotateSpeed = 0.18;
  controls.listenToKeyEvents(window);

  /* ---------- shared uniforms ---------- */
  const U = {
    uDays: { value: 0 },
    uVis: { value: 0 },
    uFilter: { value: 0 },
    uFade: { value: 1 },
    uCut: { value: 0 },
    uN1: { value: new V3(1, 0, 0) },
    uN2: { value: new V3(-1, 0, 0) },
    uN3: { value: new V3(0, 1, 0) },
    uFlare: { value: new THREE.Vector4(0, 0, 1, 0) },
    uFlareE1: { value: new V3(1, 0, 0) },
    uPx: { value: innerHeight * effectivePR() },
  };

  /* ---------- sun system (tilted 7.25° to the ecliptic) ---------- */
  const sunSys = new THREE.Group();
  sunSys.rotation.z = -7.25 * D2R;
  scene.add(sunSys);

  // Active regions in the co-rotating frame (azimuth = atan2(z, x), degrees).
  // Leading spot is westward (direction of rotation) and closer to the equator (Joy's law).
  const REGIONS = [
    { lat: 14, az: 100, sep: 10, lead: 0.062, foll: 0.044, loops: 28, prom: true },
    { lat: -11, az: 32, sep: 8, lead: 0.048, foll: 0.034, loops: 22, prom: true },
    { lat: 19, az: 215, sep: 11, lead: 0.056, foll: 0.038, loops: 24, prom: true },
    { lat: -19, az: 300, sep: 7, lead: 0.036, foll: 0.026, loops: 16, prom: true },
  ];
  const QUIET = [
    { lat: 33, az: 176, len: 24, h: 0.2 },
    { lat: -37, az: 8, len: 26, h: 0.17 },
    { lat: 50, az: 285, len: 18, h: 0.13 },
    { lat: -29, az: 245, len: 20, h: 0.19 },
    { lat: 27, az: 62, len: 15, h: 0.14 },
    { lat: -46, az: 140, len: 16, h: 0.12 },
  ];
  const CH_LOW = { lat: -4, az: 160 };

  const spotsU = Array.from({ length: 16 }, () => new THREE.Vector4(0, 0, 1, 0.01));
  const arU = Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 1, 0.1));
  const chU = new V3();

  /* ---------- photosphere ---------- */
  const photoMat = new THREE.ShaderMaterial({
    vertexShader: PHOTO_VERT,
    fragmentShader: PHOTO_FRAG,
    defines: { QUALITY: quality },
    uniforms: {
      uDays: U.uDays, uVis: U.uVis, uFilter: U.uFilter, uFade: U.uFade, uCut: U.uCut, uN1: U.uN1, uN2: U.uN2, uN3: U.uN3,
      uFlare: U.uFlare, uFlareE1: U.uFlareE1,
      uSpots: { value: spotsU }, uNSpots: { value: 0 }, uAR: { value: arU }, uCH: { value: chU },
      uMarkT: { value: 0 }, uMarkOn: { value: 0 },
    },
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(1, 192, 128), photoMat);
  sunSys.add(sun);

  /* ---------- plasma materials (prominences + loops) ---------- */
  // Per-filter appearance. e: emission, on: emission factor in front of the disc,
  // ab: absorption in front of the disc (cool prominence gas seen as a dark filament).
  const PLASMA = {
    prom: [
      { c: [1.0, 0.36, 0.2], e: 0.28, on: 0.0, ab: 0.0 },    // white light: only an eclipse shows them
      { c: [1.0, 0.17, 0.07], e: 1.05, on: 0.0, ab: 0.42 }, // H-alpha
      { c: [1.0, 0.72, 0.25], e: 0.12, on: 0.0, ab: 0.32 }, // 171: cool gas absorbs EUV
      { c: [1.0, 0.42, 0.1], e: 1.5, on: 0.2, ab: 0.35 }, // 304
      { c: [0.95, 0.72, 0.45], e: 0.1, on: 0.0, ab: 0.32 },// 193
    ],
    loops: [
      { c: [1, 0.8, 0.5], e: 0.0, on: 1, ab: 0 },
      { c: [1, 0.3, 0.15], e: 0.05, on: 1, ab: 0 },
      { c: [1.0, 0.72, 0.26], e: 0.55, on: 1, ab: 0 },
      { c: [1, 0.5, 0.2], e: 0.22, on: 1, ab: 0 },
      { c: [0.95, 0.74, 0.5], e: 0.4, on: 1, ab: 0 },
    ],
  };
  const plasmaMats = [];
  function makePlasmaMat(kind, freq, speed) {
    const m = new THREE.ShaderMaterial({
      vertexShader: PLASMA_VERT,
      fragmentShader: PLASMA_FRAG,
      uniforms: {
        uVis: U.uVis, uFade: U.uFade, uCut: U.uCut, uN1: U.uN1, uN2: U.uN2, uN3: U.uN3,
        uColor: { value: new THREE.Color() }, uEmis: { value: 1 }, uOnDisc: { value: 0 }, uAbsorb: { value: 0 },
        uSpeed: { value: speed }, uBoost: { value: 1 }, uAlpha: { value: 1 }, uLift: { value: 0 }, uFreq: { value: freq },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      side: THREE.DoubleSide,
    });
    m.userData.kind = kind;
    plasmaMats.push(m);
    return m;
  }

  function buildProminence(a, b, h, strands, rad, spread) {
    const geos = [];
    const e = new V3().subVectors(b, a).normalize();
    for (let i = 0; i < strands; i++) {
      const fa = jitter(a, spread), fb = jitter(b, spread);
      const hh = h * rr(0.55, 1.12);
      const c = archCurve(fa, fb, hh, rr(-0.18, 0.18), rr(0.02, 0.1), rr(0, 6.28), 56);
      geos.push(tubeWithSeed(c, rad * rr(0.45, 1.1), rand(), 72, 6));
    }
    // a few hanging threads (vertical fine structure of hedgerow prominences)
    for (let i = 0; i < Math.round(strands * 0.6); i++) {
      const t = rr(0.25, 0.75);
      const base = slerpV(a, b, t).normalize();
      const top = base.clone().multiplyScalar(1 + h * rr(0.45, 0.85)).addScaledVector(e, rr(-0.02, 0.02));
      const c = new THREE.CatmullRomCurve3([base.clone().multiplyScalar(0.995), base.clone().multiplyScalar(1 + h * 0.3).addScaledVector(e, rr(-0.012, 0.012)), top]);
      geos.push(tubeWithSeed(c, rad * rr(0.3, 0.6), rand(), 24, 5));
    }
    return mergeGeometries(geos);
  }

  function buildLoops(lead, foll, n) {
    const geos = [];
    const axis = new V3().subVectors(lead, foll).normalize();
    const mid = lead.clone().add(foll).normalize();
    const pil = new V3().crossVectors(mid, axis).normalize();
    for (let i = 0; i < n; i++) {
      const t = n > 1 ? i / (n - 1) - 0.5 : 0;
      const spreadK = rr(0.7, 1.3);
      const a = lead.clone().addScaledVector(pil, t * 0.09 * spreadK).add(new V3(rr(-0.012, 0.012), rr(-0.012, 0.012), rr(-0.012, 0.012))).normalize();
      const b = foll.clone().addScaledVector(pil, t * 0.11 * spreadK).add(new V3(rr(-0.016, 0.016), rr(-0.016, 0.016), rr(-0.016, 0.016))).normalize();
      const sep = a.angleTo(b);
      const big = i % 7 === 3 ? 1.8 : 1;
      const c = archCurve(a, b, sep * rr(0.42, 0.7) * big, rr(-0.06, 0.06), 0, 0, 44);
      geos.push(tubeWithSeed(c, rr(0.0038, 0.0065), rand(), 56, 5));
    }
    // a few long loops to the quiet Sun
    for (let i = 0; i < 4; i++) {
      const a = jitter(lead, 0.03);
      const b = jitter(mid.clone().addScaledVector(pil, (i % 2 ? 1 : -1) * rr(0.2, 0.28)).normalize(), 0.03);
      const c = archCurve(a, b, a.angleTo(b) * rr(0.35, 0.5), 0, 0, 0, 44);
      geos.push(tubeWithSeed(c, 0.004, rand(), 56, 5));
    }
    return mergeGeometries(geos);
  }

  const promMat = makePlasmaMat("prom", 14, 0.22);
  const regions = [];
  let spotCount = 0;
  REGIONS.forEach((R, ri) => {
    const group = new THREE.Group();
    sunSys.add(group);
    const sgn = Math.sign(R.lat);
    const leadDir = dirLatAz(R.lat - 1.5 * sgn, R.az - R.sep / 2);
    const follDir = dirLatAz(R.lat + 1.5 * sgn, R.az + R.sep / 2);
    const centre = dirLatAz(R.lat, R.az);
    const spots = [
      { dir0: leadDir, w: R.lead },
      { dir0: follDir, w: R.foll },
      { dir0: jitter(follDir.clone().add(dirLatAz(R.lat + 3 * sgn, R.az + R.sep * 0.9)).normalize(), 0.01), w: R.foll * 0.4 },
      { dir0: jitter(slerpV(leadDir, follDir, 0.45), 0.012), w: R.foll * 0.3 },
    ];
    spots.forEach((s) => { s.i = spotCount++; });
    // coronal loops
    const loopMat = makePlasmaMat("loops", 9, 0.35);
    const loops = new THREE.Mesh(buildLoops(leadDir, follDir, R.loops), loopMat);
    loops.renderOrder = 3;
    group.add(loops);
    // active-region filament / prominence along the polarity inversion line
    let prom = null, promMatAR = null;
    if (R.prom) {
      const axis = new V3().subVectors(leadDir, follDir).normalize();
      const pil = new V3().crossVectors(centre, axis).normalize();
      const a = centre.clone().addScaledVector(pil, -0.06).addScaledVector(axis, -0.01).normalize();
      const b = centre.clone().addScaledVector(pil, 0.07).addScaledVector(axis, 0.012).normalize();
      promMatAR = makePlasmaMat("prom", 14, 0.25);
      prom = new THREE.Mesh(buildProminence(a, b, 0.075, 7, 0.0075, 0.012), promMatAR);
      prom.renderOrder = 4;
      group.add(prom);
    }
    regions.push({ ...R, ri, group, latRad: R.lat * D2R, lead: leadDir, foll: follDir, centre, spots, loops, loopMat, prom, promMatAR, radius: (R.sep * D2R) * 1.05 });
  });

  const quietGroups = QUIET.map((Q) => {
    const g = new THREE.Group();
    const a = dirLatAz(Q.lat - 2, Q.az - Q.len / 2);
    const b = dirLatAz(Q.lat + 2, Q.az + Q.len / 2);
    const m = new THREE.Mesh(buildProminence(a, b, Q.h, 11, 0.011, 0.02), promMat);
    m.renderOrder = 4;
    g.add(m);
    sunSys.add(g);
    return { g, latRad: Q.lat * D2R };
  });
  const chDir0 = dirLatAz(CH_LOW.lat, CH_LOW.az);
  photoMat.uniforms.uNSpots.value = spotCount;

  /* ---------- corona ---------- */
  const CORONA_EXTENT = 7.5;
  const coronaMat = new THREE.ShaderMaterial({
    vertexShader: CORONA_VERT,
    fragmentShader: CORONA_FRAG,
    uniforms: { uFilter: U.uFilter, uFade: U.uFade, uVis: U.uVis, uAxis: { value: Math.PI / 2 }, uOn: { value: 1 }, uFlareW: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const corona = new THREE.Mesh(new THREE.PlaneGeometry(CORONA_EXTENT * 2, CORONA_EXTENT * 2), coronaMat);
  corona.renderOrder = 1;
  corona.frustumCulled = false;
  scene.add(corona);

  /* ---------- cutaway faces ---------- */
  const faceMat = new THREE.ShaderMaterial({
    vertexShader: FACE_VERT, fragmentShader: FACE_FRAG,
    uniforms: { uVis: U.uVis, uOpen: { value: 0 } }, side: THREE.DoubleSide,
  });
  // Octant-style cutaway: two quarter-disc walls through the rotation axis and
  // an equatorial floor, so the removed wedge is the upper part of an orange slice.
  const wallGeo = new THREE.CircleGeometry(1, 120, 0, Math.PI / 2);
  const face1 = new THREE.Mesh(wallGeo, faceMat);
  const face2 = new THREE.Mesh(wallGeo, faceMat);
  const floorMat = faceMat.clone();
  floorMat.uniforms = { uVis: U.uVis, uOpen: faceMat.uniforms.uOpen, uFloor: { value: 1 }, uN1: U.uN1, uN2: U.uN2 };
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1, 200), floorMat);
  floor.rotation.x = Math.PI / 2;
  faceMat.uniforms.uFloor = { value: 0 };
  faceMat.uniforms.uN1 = U.uN1;
  faceMat.uniforms.uN2 = U.uN2;
  face1.visible = face2.visible = floor.visible = false;
  sunSys.add(face1, face2, floor);

  // A photon's random walk, drawn schematically on face 1
  const walkMat = new LineMaterial({ linewidth: 2.2, vertexColors: true, worldUnits: false, transparent: true, depthWrite: false });
  const walk = (() => {
    const r2 = mulberry32(7);
    const pts = [[0.02, 0.02]];
    let x = 0.02, y = 0.02, steps = 0;
    const step = 0.019;
    while (Math.hypot(x, y) < 0.7 && steps < 3000) {
      const a = r2() * Math.PI * 2;
      const rn = Math.hypot(x, y) + 1e-3;
      x += Math.cos(a) * step + 0.0017 * x / rn;
      y += Math.sin(a) * step + 0.0017 * y / rn;
      if (x < 0.012) x = 0.024 - x;
      if (y < 0.012) y = 0.024 - y;
      pts.push([x, y]); steps++;
    }
    const nWalk = pts.length;
    // then convection carries the energy up in a looping plume
    const [x0, y0] = pts[pts.length - 1];
    const a0 = Math.atan2(y0, x0);
    for (let i = 1; i <= 90; i++) {
      const t = i / 90;
      const r = 0.7 + 0.3 * t;
      const a = a0 + 0.07 * Math.sin(t * Math.PI * 3);
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
    const pos = [], col = [];
    pts.forEach(([px, py], i) => {
      pos.push(px, py, 0.004);
      const k = i / nWalk;
      if (i < nWalk) col.push(0.35 + 0.4 * k, 0.7 + 0.2 * k, 1.5); else col.push(1.8, 1.05, 0.35);
    });
    const g = new LineGeometry();
    g.setPositions(pos);
    g.setColors(col);
    const line = new Line2(g, walkMat);
    line.renderOrder = 7;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.012, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.8, 3.4) }));
    face1.add(line, head);
    return { line, head, pos, n: pts.length };
  })();

  /* ---------- CME particles ---------- */
  const CME_N = quality === 2 ? 16000 : quality === 1 ? 9000 : 5000;
  const cmeGeo = new THREE.BufferGeometry();
  {
    const aU = new Float32Array(CME_N * 3), aK = new Float32Array(CME_N), aR = new Float32Array(CME_N), pos = new Float32Array(CME_N * 3);
    for (let i = 0; i < CME_N; i++) {
      aU.set([rand(), Math.pow(rand(), 0.8), rand()], i * 3);
      aK[i] = rand() < 0.16 ? 1 : 0;
      aR[i] = rand();
    }
    cmeGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    cmeGeo.setAttribute("aU", new THREE.BufferAttribute(aU, 3));
    cmeGeo.setAttribute("aKind", new THREE.BufferAttribute(aK, 1));
    cmeGeo.setAttribute("aR", new THREE.BufferAttribute(aR, 1));
  }
  const cmeMat = new THREE.ShaderMaterial({
    vertexShader: CME_VERT, fragmentShader: CME_FRAG,
    uniforms: { uS: { value: 0 }, uPx: U.uPx, uSize: { value: 0.05 }, uColor: { value: new THREE.Color() }, uCore: { value: new THREE.Color() }, uFade: U.uFade },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const cme = new THREE.Points(cmeGeo, cmeMat);
  cme.frustumCulled = false;
  cme.visible = false;
  cme.renderOrder = 5;
  sunSys.add(cme);
  const CME_COLORS = [
    [[0.75, 0.85, 1.0], [1.4, 1.1, 0.9]],   // white light: Thomson-scattered (coronagraph look)
    [[0.9, 0.2, 0.1], [1.6, 0.35, 0.18]],
    [[1.0, 0.75, 0.3], [1.6, 1.2, 0.5]],
    [[1.0, 0.45, 0.12], [1.8, 0.8, 0.3]],
    [[0.95, 0.75, 0.5], [1.5, 1.1, 0.7]],
  ];

  /* ---------- flare flash (impulsive-phase glow) ---------- */
  const flashTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grd.addColorStop(0, "rgba(255,255,255,1)"); grd.addColorStop(0.12, "rgba(255,255,255,.55)");
    grd.addColorStop(0.35, "rgba(255,255,255,.12)"); grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  flash.scale.setScalar(0.5);
  flash.visible = false;
  flash.renderOrder = 6;
  sunSys.add(flash);
  const FLASH_COLORS = [[2.2, 2.0, 1.8], [3.0, 0.9, 0.5], [3.0, 2.4, 1.2], [3.0, 1.4, 0.5], [2.6, 2.2, 1.6]];

  /* ---------- solar wind ---------- */
  const WIND_N = quality === 2 ? 4000 : 2400;
  const windGeo = new THREE.BufferGeometry();
  {
    const aD = new Float32Array(WIND_N * 3), aP = new Float32Array(WIND_N), aF = new Float32Array(WIND_N);
    for (let i = 0; i < WIND_N; i++) {
      const v = new V3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize();
      aD.set([v.x, v.y, v.z], i * 3);
      aP[i] = rand();
      aF[i] = Math.abs(v.y) > 0.72 ? 1 : 0; // fast wind from the polar coronal holes
    }
    windGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(WIND_N * 3), 3));
    windGeo.setAttribute("aDir", new THREE.BufferAttribute(aD, 3));
    windGeo.setAttribute("aPh", new THREE.BufferAttribute(aP, 1));
    windGeo.setAttribute("aFast", new THREE.BufferAttribute(aF, 1));
  }
  const windMat = new THREE.ShaderMaterial({
    vertexShader: WIND_VERT, fragmentShader: WIND_FRAG,
    uniforms: { uVis: U.uVis, uPx: U.uPx, uColor: { value: new THREE.Color(0.32, 0.45, 0.75) }, uOn: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const wind = new THREE.Points(windGeo, windMat);
  wind.frustumCulled = false;
  wind.visible = false;
  sunSys.add(wind);

  /* ---------- Earth to scale ---------- */
  const earthMat = new THREE.ShaderMaterial({ vertexShader: EARTH_VERT, fragmentShader: EARTH_FRAG, uniforms: { uVis: U.uVis } });
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 48, 32), earthMat);
  earth.visible = false;
  scene.add(earth);

  /* ---------- stars ---------- */
  {
    const n = 6000;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), col = new Float32Array(n * 3);
    const pal = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.92, 0.8], [0.72, 0.8, 1], [1, 0.82, 0.66]];
    const band = new V3(0.3, 0.9, -0.3).normalize();
    for (let i = 0; i < n; i++) {
      let v = new V3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize();
      if (i < n * 0.45) { v.addScaledVector(band, -v.dot(band) * rr(0.75, 1)).normalize(); }  // Milky Way-ish band
      pos.set([v.x * 900, v.y * 900, v.z * 900], i * 3);
      const m = rand();
      size[i] = 0.0011 + Math.pow(m, 9) * 0.0045;
      const c = pal[(rand() * pal.length) | 0];
      const b = 0.25 + Math.pow(rand(), 3) * 0.9;
      col.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
    const stars = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: STAR_VERT, fragmentShader: STAR_FRAG, uniforms: { uPx: U.uPx }, depthWrite: false }));
    stars.frustumCulled = false;
    scene.add(stars);
  }

  /* ---------- post-processing ---------- */
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), FILTERS[0].bloom, 0.5, 1.3);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let bloomBase = FILTERS[0].bloom;
  const bloomFx = { extra: 0 };

  /* ---------- layout: keep the Sun centred in the free space ---------- */
  const panel = $("#panel");
  if (PHONE) {
    panel.classList.add("collapsed");
    const b = panel.querySelector(".hud-collapse");
    if (b) b.textContent = "▲ CONTROLS";
  }
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(effectivePR());
    renderer.setSize(w, h);
    composer.setPixelRatio(effectivePR());
    composer.setSize(w, h);
    camera.aspect = w / h;
    const narrow = w <= 820;
    if (!narrow) camera.setViewOffset(w, h, Math.round((panel.offsetWidth + 16) / 2), 0, w, h);
    else camera.setViewOffset(w, h, 0, Math.round(h * (-0.06 + 0.15 * THREE.MathUtils.clamp(state.cutW / 52, 0, 1))), w, h);
    camera.updateProjectionMatrix();
    U.uPx.value = h * effectivePR();
    walkMat.resolution.set(w, h);
  }
  addEventListener("resize", resize);

  /* ---------- state ---------- */
  const state = {
    days: 0, warp: 1, filter: 0, cutW: 0, cutC: 0, cutOn: false, earthOn: false, flaring: false,
    windOn: false, markOn: false, intro: true,
  };
  const WARPS = [0, 0.01, 0.05, 0.2, 0.5, 1, 2, 4, 8];

  /* ---------- camera placement ---------- */
  const sph = new THREE.Spherical();
  function setCam(d, elDeg, azDeg, target = controls.target) {
    // azDeg measured like the sun frame: position = (cos az, _, sin az)
    const el = elDeg * D2R, az = azDeg * D2R;
    camera.position.set(target.x + d * Math.cos(el) * Math.cos(az), target.y + d * Math.sin(el), target.z + d * Math.cos(el) * Math.sin(az));
    camera.lookAt(target);
  }
  resize();
  if (REDUCE) { setCam(HOME_DIST, 10, 90); state.intro = false; }
  else {
    setCam(26, 34, 40);
    controls.enabled = false;
    const o = { d: 26, el: 34, az: 40 };
    gsap.to(o, {
      d: HOME_DIST, el: 10, az: 90, duration: 4.2, ease: "power3.inOut", delay: 0.25,
      onUpdate: () => setCam(o.d, o.el, o.az),
      onComplete: () => { controls.enabled = true; state.intro = false; },
    });
  }

  /* ---------- filter switching ---------- */
  function applyPlasma() {
    const f = state.filter;
    for (const m of plasmaMats) {
      const P = PLASMA[m.userData.kind][f];
      m.uniforms.uColor.value.setRGB(P.c[0], P.c[1], P.c[2]);
      m.uniforms.uEmis.value = P.e;
      m.uniforms.uOnDisc.value = P.on;
      m.uniforms.uAbsorb.value = P.ab;
    }
    for (const R of regions) R.loops.visible = PLASMA.loops[f].e > 0.01;
    const cc = CME_COLORS[f];
    cmeMat.uniforms.uColor.value.setRGB(...cc[0]);
    cmeMat.uniforms.uCore.value.setRGB(...cc[1]);
    bloomBase = FILTERS[f].bloom;
  }
  function renderFilterCard() {
    const F = FILTERS[state.filter];
    $("#fcName").textContent = F.name;
    $("#fcMeta").textContent = F.meta;
    $("#fcText").textContent = F.text;
    $("#filterCard").style.setProperty("--fc", F.color);
  }
  function setFilter(f, instant) {
    if (f === state.filter && !instant) return;
    document.querySelectorAll("#filters button").forEach((b) => {
      const on = +b.dataset.f === f;
      b.setAttribute("aria-pressed", on); b.setAttribute("aria-checked", on);
      b.style.setProperty("--c-on", FILTERS[+b.dataset.f].color);
    });
    const swap = () => { state.filter = f; U.uFilter.value = f; applyPlasma(); renderFilterCard(); };
    if (instant || REDUCE) { swap(); return; }
    gsap.killTweensOf(U.uFade);
    gsap.to(U.uFade, { value: 0, duration: 0.2, ease: "power2.in", onComplete: () => { swap(); gsap.to(U.uFade, { value: 1, duration: 0.45, ease: "power2.out" }); } });
  }
  document.querySelectorAll("#filters button").forEach((b) => {
    b.style.setProperty("--c-on", FILTERS[+b.dataset.f].color);
    b.addEventListener("click", () => setFilter(+b.dataset.f));
  });
  setFilter(0, true);

  /* ---------- cutaway ---------- */
  const cutLayers = [
    { name: "Core", c: "#fff4c8", r: 0.13, b: 5, d: "0–0.25 R☉ · 15.7 MK", e: "162 g/cm³ · p–p fusion" },
    { name: "Radiative zone", c: "#ffb347", r: 0.48, b: 22, d: "0.25–0.70 R☉ · 7→2 MK", e: "20→0.2 g/cm³" },
    { name: "Tachocline", c: "#ffe08a", r: 0.705, b: 36, d: "≈0.70 R☉ · shear layer", e: "seat of the solar dynamo" },
    { name: "Convective zone", c: "#ff6a1f", r: 0.86, b: 12, d: "0.713–1 R☉ · 2 MK→5,772 K", e: "0.2→2×10⁻⁷ g/cm³" },
    { name: "Photosphere", c: "#ffd79a", r: 1.0, b: 50, d: "1 R☉ · 5,772 K", e: "≈500 km thick" },
    { name: "Chromosphere", c: "#ff5a6a", r: 1.012, b: 62, d: "+2,000 km · 4,000→20,000 K", e: "10⁻⁹→10⁻¹³ g/cm³" },
    { name: "Corona", c: "#bcd8ff", r: 1.4, b: 72, d: "1–3 MK", e: "≈10⁻¹⁵ g/cm³" },
  ];
  const overlay = $("#overlay");
  const svg = $("#leaders");
  const SVGNS = "http://www.w3.org/2000/svg";
  cutLayers.forEach((L) => {
    const el = document.createElement("div");
    el.className = "cut-label";
    el.innerHTML = `<b><i style="--c:${L.c}"></i>${L.name}</b><span>${L.d}</span><br><span class="ld">${L.e}</span>`;
    overlay.appendChild(el);
    L.el = el;
    L.line = document.createElementNS(SVGNS, "line");
    L.dot = document.createElementNS(SVGNS, "circle");
    L.dot.setAttribute("r", "2.5");
    svg.appendChild(L.line); svg.appendChild(L.dot);
    L.line.style.opacity = L.dot.style.opacity = 0;
  });

  function camAzimuthLocal() {
    const p = camera.position.clone().sub(new V3()).applyQuaternion(sunSys.quaternion.clone().invert());
    return Math.atan2(p.z, p.x) / D2R;
  }
  function updateCutGeometry() {
    const w = state.cutW * D2R, c = state.cutC * D2R;
    const p1 = c - w, p2 = c + w;
    face1.rotation.set(0, -p1, 0);
    face2.rotation.set(0, -p2, 0);
    const n1 = new V3(Math.cos(p1 + Math.PI / 2), 0, Math.sin(p1 + Math.PI / 2));
    const n2 = new V3(Math.cos(p2 - Math.PI / 2), 0, Math.sin(p2 - Math.PI / 2));
    U.uN1.value.copy(n1).applyQuaternion(sunSys.quaternion);
    U.uN2.value.copy(n2).applyQuaternion(sunSys.quaternion);
    U.uN3.value.set(0, 1, 0).applyQuaternion(sunSys.quaternion);
    const on = state.cutW > 0.3;
    U.uCut.value = on ? 1 : 0;
    face1.visible = face2.visible = floor.visible = on;
    faceMat.uniforms.uOpen.value = THREE.MathUtils.clamp(state.cutW / 12, 0, 1);
  }
  const cutT = { v: 0 };
  function setCut(on) {
    state.cutOn = on;
    $("#tCut").checked = on;
    const btn = $("#cutBtn");
    btn.setAttribute("aria-pressed", on);
    btn.textContent = on ? "Close the cutaway" : "Open the cutaway";
    if (on) state.cutC = camAzimuthLocal() - 30;
    gsap.killTweensOf(state, "cutW");
    gsap.to(state, { cutW: on ? 52 : 0, duration: REDUCE ? 0 : 1.8, ease: "power3.inOut" });
    if (on && !state.earthOn) {
      // cinematic reframe: slightly higher, a little closer
      const o = { d: camera.position.length(), el: Math.asin(camera.position.y / camera.position.length()) / D2R };
      gsap.to(o, { d: PHONE ? 6.2 : 4.3, el: 26, duration: REDUCE ? 0 : 1.8, ease: "power2.inOut", onUpdate: () => { sph.setFromVector3(camera.position); setCam(o.d, o.el, Math.atan2(camera.position.z, camera.position.x) / D2R); } });
    }
  }
  $("#tCut").addEventListener("change", (e) => setCut(e.target.checked));
  $("#cutBtn").addEventListener("click", () => setCut(!state.cutOn));

  /* ---------- Earth ---------- */
  function setEarth(on) {
    state.earthOn = on;
    $("#tEarth").checked = on;
    earth.visible = on;
    const tgt = controls.target;
    if (on) {
      // put Earth just off the limb, to the right of the current view
      const back = camera.position.clone().sub(tgt).normalize();
      const right = new V3(0, 1, 0).cross(back).normalize();
      const up = back.clone().cross(right).normalize();
      const pos = right.clone().multiplyScalar(1.09).addScaledVector(up, 0.04);
      earth.position.copy(pos);
      const look = right.clone().multiplyScalar(1.0).addScaledVector(up, 0.03);
      const camTo = look.clone().addScaledVector(back, 0.95).addScaledVector(right, 0.05);
      controls.autoRotate = false;
      gsap.to(tgt, { x: look.x, y: look.y, z: look.z, duration: REDUCE ? 0 : 2.2, ease: "power3.inOut" });
      gsap.to(camera.position, { x: camTo.x, y: camTo.y, z: camTo.z, duration: REDUCE ? 0 : 2.2, ease: "power3.inOut" });
      controls.minDistance = 0.05;
    } else {
      const d = camera.position.clone().sub(tgt).normalize().multiplyScalar(HOME_DIST);
      gsap.to(tgt, { x: 0, y: 0, z: 0, duration: REDUCE ? 0 : 1.8, ease: "power3.inOut" });
      gsap.to(camera.position, { x: d.x, y: d.y, z: d.z, duration: REDUCE ? 0 : 1.8, ease: "power3.inOut", onComplete: () => { controls.minDistance = 1.12; controls.autoRotate = $("#tOrbit").checked && !REDUCE; } });
    }
  }
  $("#tEarth").addEventListener("change", (e) => setEarth(e.target.checked));

  /* ---------- toggles ---------- */
  $("#tWind").addEventListener("change", (e) => { state.windOn = e.target.checked; wind.visible = true; gsap.to(windMat.uniforms.uOn, { value: e.target.checked ? 1 : 0, duration: 0.8, onComplete: () => { wind.visible = state.windOn; } }); });
  $("#tMark").addEventListener("change", (e) => {
    state.markOn = e.target.checked;
    if (state.markOn) photoMat.uniforms.uMarkT.value = state.days;
    gsap.to(photoMat.uniforms.uMarkOn, { value: state.markOn ? 1 : 0, duration: 0.5 });
  });
  $("#tCorona").addEventListener("change", (e) => gsap.to(coronaMat.uniforms.uOn, { value: e.target.checked ? 1 : 0, duration: 0.6 }));
  $("#tOrbit").addEventListener("change", (e) => { controls.autoRotate = e.target.checked && !REDUCE && !state.earthOn; });
  const warpEl = $("#warp");
  function fmtWarp(v) {
    if (v === 0) return "Paused";
    if (v < 0.04) return `${Math.round(v * 1440)} min / s`;
    if (v < 1) return `${+(v * 24).toFixed(1)} h / s`;
    return `${v} day${v === 1 ? "" : "s"} / s`;
  }
  function onWarp() { state.warp = WARPS[+warpEl.value]; $("#warpOut").textContent = fmtWarp(state.warp); }
  warpEl.addEventListener("input", onWarp);
  if (REDUCE) warpEl.value = 3;
  onWarp();
  $("#quality").addEventListener("change", (e) => {
    quality = +e.target.value;
    photoMat.defines.QUALITY = quality;
    photoMat.needsUpdate = true;
    resize();
  });

  /* ---------- tabs ---------- */
  let insideOpened = false;
  document.querySelectorAll(".sun-tabs button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".sun-tabs button").forEach((x) => { const on = x === b; x.setAttribute("aria-pressed", on); x.setAttribute("aria-selected", on); });
    document.querySelectorAll(".sun-tab").forEach((s) => { s.hidden = s.dataset.panel !== b.dataset.tab; });
    if (b.dataset.tab === "inside" && !insideOpened && !state.cutOn) { insideOpened = true; setCut(true); }
  }));

  /* ---------- flare + CME ---------- */
  const toast = $("#toast");
  let toastTimer = 0;
  function showToast(html, ms) {
    toast.innerHTML = html;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), ms);
  }
  let flareRegion = null;
  function triggerFlare() {
    if (state.flaring) return;
    state.flaring = true;
    $("#flareBtn").disabled = true;
    // choose the active region that will show the eruption best: on the visible
    // hemisphere, preferably part-way to the limb so the CME is seen in 3D
    const camDir = camera.position.clone().normalize();
    let best = regions[0], bestScore = -9;
    const camRight = new V3().setFromMatrixColumn(camera.matrixWorld, 0);
    const camUp = new V3().setFromMatrixColumn(camera.matrixWorld, 1);
    const narrow = innerWidth <= 820;
    for (const R of regions.filter((r) => r.prom)) {
      const d = R.centre.clone().applyAxisAngle(Y, omegaRad(R.latRad) * state.days).applyQuaternion(sunSys.quaternion);
      const k = d.dot(camDir);
      // near the limb (so the CME is seen side-on), on the near side, and on
      // desktop away from the control panel on the right
      let score = k > -0.35 ? 1 - Math.abs(k - 0.08) * 1.6 : -2 + k;
      score += narrow ? 0.25 * d.dot(camUp) : -0.35 * d.dot(camRight);
      if (score > bestScore) { bestScore = score; best = R; }
    }
    flareRegion = best;
    const dir = best.centre.clone().applyAxisAngle(Y, omegaRad(best.latRad) * state.days);
    cme.quaternion.setFromUnitVectors(new V3(0, 0, 1), dir);
    cme.visible = true;
    cmeMat.uniforms.uS.value = 0;
    const pm = best.promMatAR;
    const tl = gsap.timeline({ onComplete: () => { state.flaring = false; $("#flareBtn").disabled = false; cme.visible = false; flareRegion = null; } });
    // impulsive phase (≈minutes in reality) then gradual decay
    tl.to(U.uFlare.value, { w: 1, duration: 0.55, ease: "power2.out" }, 0)
      .to(bloomFx, { extra: 1.1, duration: 0.35, ease: "power2.out" }, 0)
      .to(coronaMat.uniforms.uFlareW, { value: 1, duration: 0.5 }, 0)
      .to(best.loopMat.uniforms.uBoost, { value: 3.2, duration: 1.2 }, 0.3)
      .to(bloomFx, { extra: 0, duration: 4, ease: "power2.inOut" }, 0.6)
      .to(coronaMat.uniforms.uFlareW, { value: 0, duration: 5 }, 0.8)
      .to(U.uFlare.value, { w: 0, duration: 6.5, ease: "power2.inOut" }, 0.9)
      .to(best.loopMat.uniforms.uBoost, { value: 1, duration: 5 }, 4)
      // the filament lifts off and becomes the bright core of the CME
      .to(pm.uniforms.uLift, { value: 1.6, duration: 3.2, ease: "power2.in" }, 0.15)
      .to(pm.uniforms.uAlpha, { value: 0, duration: 1.4 }, 2.4)
      .to(cmeMat.uniforms.uS, { value: 1, duration: 10, ease: "power1.inOut" }, 0.9)
      .set(pm.uniforms.uLift, { value: 0 }, 12)
      .to(pm.uniforms.uAlpha, { value: 1, duration: 2.5 }, 12.2);
    if (!REDUCE && !state.earthOn && !state.cutOn) {
      const d0 = camera.position.length();
      const o = { d: d0 };
      const dir0 = camera.position.clone().normalize();
      tl.to(o, { d: Math.max(d0, PHONE ? 10 : 7.2), duration: 6, ease: "power2.inOut", onUpdate: () => { const cd = camera.position.clone().normalize(); camera.position.copy(cd.lengthSq() ? cd : dir0).multiplyScalar(o.d); } }, 0.8);
    }
    showToast("<b>Flare.</b> Twisted magnetic field above the active region snaps and reconnects, releasing up to ≈10²⁵ joules in minutes. The ribbons mark where accelerated particles slam into the chromosphere.", 5200);
    setTimeout(() => showToast("<b>Coronal Mass Ejection (CME).</b> Roughly a billion tonnes of magnetised plasma leave at 250–3,000 km/s; a fast CME can reach Earth in 15–18 hours and trigger auroras. Animation ≈1,000× faster than real time.", 7500), 5600);
  }
  $("#flareBtn").addEventListener("click", triggerFlare);

  /* ---------- calculators ---------- */
  const K = window.katex;
  const tex = (id, s) => { const el = document.getElementById(id); if (el && K) K.render(s, el, { displayMode: true, throwOnError: false }); };
  tex("eqPP", String.raw`4\,{}^{1}\mathrm{H} \;\longrightarrow\; {}^{4}\mathrm{He} + 2e^{+} + 2\nu_e + 26.7\ \mathrm{MeV}`);
  tex("eqMass", String.raw`\dot m = \frac{L_\odot}{c^2} = \frac{3.828\times10^{26}\ \mathrm{W}}{(2.998\times10^{8}\ \mathrm{m/s})^2} \approx 4.26\times10^{9}\ \mathrm{kg/s}`);
  tex("eqWalk", String.raw`t \approx \frac{N\ell}{c} = \frac{R^2}{\ell\,c}`);
  tex("eqSB", String.raw`L = 4\pi R^2\,\sigma T^4`);
  tex("eqWien", String.raw`\lambda_{\max} = \frac{b}{T}`);
  tex("eqFlux", String.raw`F = \frac{L_\odot}{4\pi d^2}`);
  tex("eqLight", String.raw`t = \frac{d}{c}`);
  document.querySelectorAll(".eq-inline").forEach((el) => { if (K) K.render(el.dataset.tex, el, { throwOnError: false }); });

  const sci = (v, d = 3) => {
    if (!isFinite(v)) return "—";
    const e = Math.floor(Math.log10(Math.abs(v)));
    const m = v / 10 ** e;
    const sup = String(e).replace(/-/g, "⁻").replace(/\d/g, (x) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[x]);
    return `${m.toFixed(d)}×10${sup}`;
  };
  const fmtNum = (v, d) => v.toLocaleString("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
  function calcSB() {
    const Rs = 10 ** +$("#cR").value, T = +$("#cT").value;
    $("#cROut").textContent = `${Rs < 10 ? Rs.toFixed(2) : Rs.toFixed(1)} R☉`;
    $("#cTOut").textContent = `${fmtNum(T, 0)} K`;
    const L = 4 * Math.PI * (Rs * PHYS.R) ** 2 * PHYS.sigma * T ** 4;
    $("#cL").innerHTML = `${sci(L)}<small>W</small>`;
    const ls = L / PHYS.L;
    $("#cLs").innerHTML = `${ls < 100 ? ls.toFixed(3) : fmtNum(ls, 0)}<small>L☉</small>`;
    const lam = PHYS.b / T * 1e9;
    $("#cW").innerHTML = `${fmtNum(lam, 0)}<small>nm</small>`;
    const band = lam < 400 ? "ultraviolet" : lam < 450 ? "violet" : lam < 495 ? "blue" : lam < 570 ? "green" : lam < 590 ? "yellow" : lam < 620 ? "orange" : lam <= 700 ? "red" : "infrared";
    $("#cWb").textContent = band;
    const pos = (Math.log10(lam) - 2) / (Math.log10(3000) - 2);
    $("#wienMark").style.left = `${THREE.MathUtils.clamp(pos, 0, 1) * 100}%`;
  }
  ["#cR", "#cT"].forEach((s) => $(s).addEventListener("input", calcSB));
  document.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
    // Sirius A: R = 1.711 R☉ (Kervella et al. 2003), Teff ≈ 9,940 K (Adelman 2004)
    const p = b.dataset.preset === "sirius" ? [1.711, 9940] : [1, PHYS.Teff];
    $("#cR").value = Math.log10(p[0]); $("#cT").value = p[1];
    ["#cR", "#cT"].forEach((s) => $(s).dispatchEvent(new Event("input")));
  }));
  const planetSel = $("#planet");
  PLANETS.forEach(([n, d], i) => { const o = document.createElement("option"); o.value = i; o.textContent = `${n} · ${d < 100 ? d.toFixed(2) : fmtNum(d, 1)} million km`; planetSel.appendChild(o); });
  planetSel.value = 3;
  function calcPlanet() {
    const d = PLANETS[+planetSel.value][1] * 1e9; // m
    const F = PHYS.L / (4 * Math.PI * d * d);
    const Fe = PHYS.L / (4 * Math.PI * (149.6e9) ** 2);
    $("#cF").innerHTML = `${F >= 100 ? fmtNum(F, 0) : F.toFixed(2)}<small>W/m²</small>`;
    $("#cFr").innerHTML = `${F / Fe >= 10 ? fmtNum(F / Fe, 0) : (F / Fe).toFixed(3)}<small>×</small>`;
    const t = d / PHYS.c;
    const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = Math.round(t % 60);
    $("#cLt").textContent = h ? `${h} h ${m} min` : `${m} min ${s} s`;
    $("#cD").innerHTML = `${(d / 1.495978707e11).toFixed(3)}<small>AU</small>`;
  }
  planetSel.addEventListener("change", calcPlanet);
  function calcWalk() {
    const lmm = 10 ** +$("#mfp").value;
    $("#mfpOut").textContent = lmm < 1 ? `${lmm.toFixed(2)} mm` : `${lmm.toFixed(1)} mm`;
    const t = PHYS.R ** 2 / ((lmm / 1000) * PHYS.c);
    const yr = t / 3.15576e7;
    $("#walkOut").innerHTML = `${yr >= 1e4 ? fmtNum(Math.round(yr / 1000) * 1000, 0) : fmtNum(yr, 0)}<small>years</small>`;
  }
  $("#mfp").addEventListener("input", calcWalk);
  calcSB(); calcPlanet(); calcWalk();

  /* ---------- per-frame updates ---------- */
  const tmp = new V3(), tmp2 = new V3();
  function updateSunState() {
    const days = state.days;
    for (const R of regions) {
      const th = omegaRad(R.latRad) * days;
      R.group.rotation.y = th;
      for (const s of R.spots) {
        tmp.copy(s.dir0).applyAxisAngle(Y, th);
        spotsU[s.i].set(tmp.x, tmp.y, tmp.z, s.w);
      }
      tmp.copy(R.centre).applyAxisAngle(Y, th);
      arU[R.ri].set(tmp.x, tmp.y, tmp.z, R.radius);
    }
    for (const Q of quietGroups) Q.g.rotation.y = omegaRad(Q.latRad) * days;
    chU.copy(chDir0).applyAxisAngle(Y, omegaRad(CH_LOW.lat * D2R) * days);
    if (flareRegion) {
      const th = omegaRad(flareRegion.latRad) * days;
      tmp.copy(flareRegion.centre).applyAxisAngle(Y, th);
      U.uFlare.value.x = tmp.x; U.uFlare.value.y = tmp.y; U.uFlare.value.z = tmp.z;
      tmp2.subVectors(flareRegion.lead, flareRegion.foll).applyAxisAngle(Y, th).normalize();
      U.uFlareE1.value.copy(tmp2);
      flash.position.copy(tmp).multiplyScalar(1.025);
      const w = U.uFlare.value.w, fc = FLASH_COLORS[state.filter];
      flash.material.color.setRGB(fc[0] * w, fc[1] * w, fc[2] * w);
      flash.scale.setScalar(0.25 + 0.5 * w);
      flash.visible = w > 0.01;
    } else flash.visible = false;
    U.uDays.value = days;
  }

  const projV = new V3();
  function toScreen(v) {
    projV.copy(v).project(camera);
    return [(projV.x * 0.5 + 0.5) * innerWidth, (-projV.y * 0.5 + 0.5) * innerHeight, projV.z];
  }
  function updateLabels() {
    const show = state.cutW > 40;
    const sunC = toScreen(new V3(0, 0, 0));
    const n1 = U.uN1.value;
    const facing = show && camera.position.clone().dot(n1) > 0.05;
    if (!facing) {
      for (const L of cutLayers) { L.el.classList.remove("on"); L.line.style.opacity = L.dot.style.opacity = 0; }
    } else {
      // anchors on face 1, labels stacked in a column beside the Sun (no overlaps)
      const narrow = innerWidth <= 820;
      const sunR = toScreen(new V3().setFromMatrixColumn(camera.matrixWorld, 0).normalize())[0] - sunC[0];
      const rightLimit = narrow ? innerWidth - 8 : innerWidth - panel.offsetWidth - 40;
      for (const L of cutLayers) {
        const b = L.b * D2R;
        const wp = face1.localToWorld(new V3(L.r * Math.cos(b), L.r * Math.sin(b), 0.004));
        [L.ax, L.ay] = toScreen(wp);
        L.w = L.el.offsetWidth; L.h = L.el.offsetHeight;
      }
      if (narrow) {
        // phones: a two-column legend under the Sun, leader lines to the anchors
        const sunBottom = toScreen(new V3().setFromMatrixColumn(camera.matrixWorld, 1).normalize().multiplyScalar(-1.05))[1];
        const colW = (innerWidth - 20) / 2;
        const order = [...cutLayers].sort((a, b) => a.r - b.r);
        order.forEach((L, k) => {
          const lx = 8 + (k % 2) * (colW + 4);
          const ly = Math.min(sunBottom + 10, innerHeight - 70 - 4 * (L.h + 4)) + Math.floor(k / 2) * (L.h + 4);
          L.el.style.transform = `translate(${lx.toFixed(1)}px, ${ly.toFixed(1)}px)`;
          L.el.classList.add("on");
          L.line.setAttribute("x1", L.ax); L.line.setAttribute("y1", L.ay);
          L.line.setAttribute("x2", lx + colW / 2); L.line.setAttribute("y2", ly);
          L.dot.setAttribute("cx", L.ax); L.dot.setAttribute("cy", L.ay);
          L.line.style.opacity = 0.45; L.dot.style.opacity = 1;
        });
      } else {
      const sorted = [...cutLayers].sort((a, b) => a.ay - b.ay);
      const gap = narrow ? 4 : 8;
      let y = -1e9;
      const top = (narrow ? 200 : 80);
      for (const L of sorted) { L.ly = Math.max(L.ay - L.h / 2, y + gap, top); y = L.ly + L.h; }
      // shift the whole column up if it overflows the bottom
      const bottom = innerHeight - (narrow ? 70 : 90);
      const over = y - bottom;
      if (over > 0) for (const L of sorted) L.ly -= over;
      const colX = Math.min(sunC[0] + Math.abs(sunR) * 1.08 + 26, rightLimit - Math.max(...cutLayers.map((L) => L.w)));
      for (const L of cutLayers) {
        const lx = colX;
        L.el.style.transform = `translate(${lx.toFixed(1)}px, ${L.ly.toFixed(1)}px)`;
        L.el.classList.add("on");
        L.line.setAttribute("x1", L.ax); L.line.setAttribute("y1", L.ay);
        L.line.setAttribute("x2", lx); L.line.setAttribute("y2", L.ly + L.h / 2);
        L.dot.setAttribute("cx", L.ax); L.dot.setAttribute("cy", L.ay);
        L.line.style.opacity = L.dot.style.opacity = 1;
      }
      }
    }
    // Earth tag
    const tag = $("#earthTag");
    if (state.earthOn && earth.visible) {
      const [x, y, z] = toScreen(earth.position);
      tag.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      tag.classList.toggle("on", z < 1);
    } else tag.classList.remove("on");
  }

  // walk animation on the cut face
  function updateWalk(t) {
    const period = 9;
    const k = (t % period) / period;
    const n = Math.max(2, Math.floor(Math.min(1, k * 1.15) * walk.n));
    walk.line.geometry.instanceCount = n - 1;
    const i = (n - 1) * 3;
    walk.head.position.set(walk.pos[i], walk.pos[i + 1], walk.pos[i + 2]);
  }

  const loading = $("#loading");
  let first = true;
  let lastCutW = 0;
  let last = performance.now();
  const axisTmp = new V3();
  const qTmp = new THREE.Quaternion();
  function frame(now) {
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000));
    last = now;
    state.days += dt * state.warp;
    U.uVis.value += dt;

    updateSunState();
    updateCutGeometry();
    if (innerWidth <= 820 && state.cutW !== lastCutW) {
      lastCutW = state.cutW;
      const w = innerWidth, h = innerHeight;
      camera.setViewOffset(w, h, 0, Math.round(h * (-0.06 + 0.15 * THREE.MathUtils.clamp(state.cutW / 52, 0, 1))), w, h);
      camera.updateProjectionMatrix();
    }
    if (face1.visible) updateWalk(U.uVis.value);

    // corona billboard: behind the Sun, facing the camera, sized so r = 1 is the limb
    const d = camera.position.length();
    const back = camera.position.clone().normalize().multiplyScalar(-1);
    corona.position.copy(back);
    corona.lookAt(camera.position);          // perpendicular to the line of sight to the Sun's centre
    const Dd = d + 1;
    corona.scale.setScalar(Dd / Math.sqrt(Math.max(d * d - 1, 1e-4)));
    axisTmp.set(0, 1, 0).applyQuaternion(sunSys.quaternion).applyQuaternion(qTmp.copy(corona.quaternion).invert());
    coronaMat.uniforms.uAxis.value = Math.atan2(axisTmp.y, axisTmp.x);

    bloom.strength = bloomBase + bloomFx.extra;

    // readouts
    $("#rDays").innerHTML = `${state.days < 100 ? state.days.toFixed(1) : Math.round(state.days)}<small>days</small>`;
    const lead = ((omegaDeg(0) - omegaDeg(60 * D2R)) * state.days) % 360;
    $("#rLead").innerHTML = `${Math.round(lead)}°<small>vs 60°</small>`;

    controls.update(dt);
    composer.render();
    updateLabels();
    if (first) { first = false; loading.classList.add("done"); }
  }
  requestAnimationFrame(frame);

  // pause auto-orbit while the user drags; resume after a while
  let idleTimer = 0;
  controls.addEventListener("start", () => { controls.autoRotate = false; clearTimeout(idleTimer); });
  controls.addEventListener("end", () => { clearTimeout(idleTimer); idleTimer = setTimeout(() => { controls.autoRotate = $("#tOrbit").checked && !REDUCE && !state.earthOn; }, 9000); });

  // test hooks (used by scripts/shot.py)
  window.__sun = {
    setFilter: (f) => setFilter(f, true),
    cut: (on = true) => { setCut(on); gsap.globalTimeline.getChildren(true, true, false).forEach((t) => t.progress(1)); },
    earth: (on = true) => { setEarth(on); gsap.globalTimeline.getChildren(true, true, false).forEach((t) => t.progress(1)); },
    flare: () => triggerFlare(),
    seek: (sec) => { const tl = gsap.globalTimeline.getChildren(false, false, true).slice(-1)[0]; if (tl) tl.time(sec); },
    skipIntro: () => { gsap.globalTimeline.getChildren(true, true, false).forEach((t) => t.progress(1)); },
    days: (d) => { state.days = d; },
    bloom, camera, controls, U, photoMat, walk,
    state,
  };
}

main();
