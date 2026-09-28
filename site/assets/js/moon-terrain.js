/* Cosmic Library · Moon landing — procedural terrain for Mare Tranquillitatis
 *
 * One height function, written twice: GLSL for the GPU (vertex displacement +
 * per-pixel normals, crater shadows and lighting) and JavaScript for the physics
 * (footpad contact, slope, boulders). Both use the same integer hash (PCG /
 * "lowbias32" mixing by Chris Wellons and Melissa O'Neill's PCG), so the craters
 * the lunar module lands in are exactly the craters you see.
 *
 * Site frame: x = downrange (the approach flew west, so +x is west), z = cross
 * range, metres from the automatic guidance target. The scene uses a floating
 * origin O (a multiple of 20,480 m along x) so float32 stays precise 480 km out.
 *
 * Surface photometry: Lommel–Seeliger law blended with a little Lambert, plus the
 * opposition surge (shadow hiding, after Hapke 1981/1986). That is why the ground
 * glows around the lunar module's own shadow, as in the Apollo 16-mm film.
 *
 * Landing-site features (approximate, after the Apollo 11 Mission Report and the
 * Apollo Lunar Surface Journal): the automatic target lay in a boulder field
 * around a sharp-rimmed crater later named West crater; Armstrong flew about
 * 1,100 ft past it to a clear area; Little West crater lies ≈60 m east of the
 * landing point.
 */
import * as THREE from 'three';

export const R_MOON = 1737400;
export const ORIGIN_STEP = 20480;                 // floating-origin quantum (all cell sizes divide it)
export const SITE = {
  west: { x: 100, z: -10, r: 95 },               // West crater (≈190 m across)
  clear: { x: 335, z: 0, r: 22 },                // Armstrong's clear landing area
  target: { x: 0, z: 0 }                          // where the automatic P64 was heading
};
// fixed craters near the site: x, z, radius, freshness (0 = old and soft, 1 = sharp)
export const FIXED_CRATERS = [
  [SITE.west.x, SITE.west.z, SITE.west.r, 0.95],
  [275, 12, 15, 0.55],     // Little West
  [-420, 60, 40, 0.35],
  [180, 150, 28, 0.3],
  [540, -95, 34, 0.5],
  [-160, -125, 22, 0.6],
  [372, -34, 6, 0.6],
  [-900, -260, 70, 0.25]
];
// crater populations: cell size S (m), probability, radius range (m), seed
export const LAYERS = [
  { S: 20480, p: 0.5, r0: 1500, r1: 6500, seed: 11 },
  { S: 5120, p: 0.62, r0: 250, r1: 1650, seed: 23 },
  { S: 1280, p: 0.6, r0: 50, r1: 420, seed: 37 },
  { S: 320, p: 0.66, r0: 12, r1: 104, seed: 41 },
  { S: 80, p: 0.72, r0: 3, r1: 26, seed: 53 },
  { S: 20, p: 0.78, r0: 0.8, r1: 6.5, seed: 67 },
  { S: 5, p: 0.8, r0: 0.2, r1: 1.6, seed: 79 }
];

/* ================================================================== JS twin */
function hash2(cx, cy, seed) {
  let x = (Math.imul(cx >>> 0, 1597334677) ^ Math.imul(cy >>> 0, 3812015801 | 0) ^ Math.imul(seed, 2654435761 | 0)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d) >>> 0;
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b | 0) >>> 0;
  x ^= x >>> 16;
  return x >>> 0;
}
function makeRng(h) {
  let s = h >>> 0;
  return () => {
    s = (Math.imul(s, 747796405) + 2891336453) >>> 0;
    let w = Math.imul(((s >>> ((s >>> 28) + 4)) ^ s) >>> 0, 277803737) >>> 0;
    w = ((w >>> 22) ^ w) >>> 0;
    return (w & 0xFFFFFF) / 16777216;
  };
}
// allocation-free variant for the hot path (physics calls this every 20 ms step)
let _s = 0;
function rs(h) { _s = h >>> 0; }
function rn() {
  _s = (Math.imul(_s, 747796405) + 2891336453) >>> 0;
  let w = Math.imul(((_s >>> ((_s >>> 28) + 4)) ^ _s) >>> 0, 277803737) >>> 0;
  w = ((w >>> 22) ^ w) >>> 0;
  return (w & 0xFFFFFF) / 16777216;
}
function hv(a, b, seed) { rs(hash2(a, b, seed)); return rn(); }
function suppressed(li, cx, cz) {
  const d0 = Math.hypot(cx, cz);
  if (li === 0) return d0 < 9000;
  if (li <= 2) return d0 < 2600;
  if (li <= 4) return Math.hypot(cx - SITE.clear.x, cz - SITE.clear.z) < 48 || Math.hypot(cx - SITE.west.x, cz - SITE.west.z) < 140;
  if (li === 5) return Math.hypot(cx - SITE.clear.x, cz - SITE.clear.z) < 16;
  return false;
}
function craterH(dx, dz, r, fresh) {
  const d = Math.sqrt(dx * dx + dz * dz) / r;
  if (d >= 1.5) return 0;
  const depth = r * (0.06 + 0.34 * fresh), rim = r * (0.008 + 0.067 * fresh);
  if (d < 1) return -depth + (depth + rim) * d * d;
  const k = 1 - (d - 1) * 2;
  return rim * k * k;
}
function vnoise(x, z, S, seed) {
  const fx = x / S, fz = z / S, ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const ux = tx * tx * tx * (tx * (tx * 6 - 15) + 10), uz = tz * tz * tz * (tz * (tz * 6 - 15) + 10);
  const a = hv(ix, iz, seed), b = hv(ix + 1, iz, seed), c = hv(ix, iz + 1, seed), d = hv(ix + 1, iz + 1, seed);
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}
const UND = [[5120, 30, 101], [1280, 9, 103], [320, 2.2, 107]];
/** Terrain height (m) at site-frame (x, z), no curvature. Layers with cells
 *  smaller than minS are skipped (the physics does that high above the ground). */
export function terrainHeight(x, z, minS = 0) {
  let h = 0;
  for (const [S, A, sd] of UND) if (S >= minS) h += A * (vnoise(x, z, S, sd) - 0.5);
  for (let li = 0; li < LAYERS.length; li++) {
    const L = LAYERS[li];
    if (L.S < minS) break;
    const bx = Math.floor(x / L.S - 0.5), bz = Math.floor(z / L.S - 0.5);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      rs(hash2(bx + i, bz + j, L.seed));
      if (rn() > L.p) continue;
      const cx = (bx + i + rn()) * L.S, cz = (bz + j + rn()) * L.S;
      const rr = rn(), rf = rn();
      const dx = x - cx, dz = z - cz;
      if (dx * dx + dz * dz > (1.5 * L.r1) * (1.5 * L.r1)) continue;
      const r = L.r0 + (L.r1 - L.r0) * Math.pow(rr, 2.5);
      if (suppressed(li, cx, cz)) continue;
      h += craterH(dx, dz, r, Math.pow(rf, 2.6));
    }
  }
  if (minS <= 320) for (const c of FIXED_CRATERS) h += craterH(x - c[0], z - c[1], c[2], c[3]);
  return h;
}
export const HEIGHT_OFFSET = -terrainHeight(0, 0);  // put the guidance target at h = 0
export function groundAt(x, z, minS = 0) { return terrainHeight(x, z, minS) + HEIGHT_OFFSET; }

/* ================================================================== GLSL */
const GLSL_COMMON = /* glsl */`
uniform vec2 uOrigin;           // site coordinates of the scene origin (x multiple of 20480)
uniform float uHOffset;
uint hash2(ivec2 c, uint seed){
  uint x = (uint(c.x) * 1597334677u) ^ (uint(c.y) * 3812015801u) ^ (seed * 2654435761u);
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u;
  return x;
}
float rnd(inout uint s){
  s = s * 747796405u + 2891336453u;
  uint w = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
  w = (w >> 22u) ^ w;
  return float(w & 0xFFFFFFu) / 16777216.0;
}
float hv(ivec2 c, uint seed){ uint s = hash2(c, seed); return rnd(s); }
// value noise with analytic derivatives (Inigo Quilez), lattice S, returns (v, dv/dx, dv/dz) in metres
vec3 vnoised(vec2 p, float S, uint seed){
  vec2 q = p / S; vec2 i = floor(q); vec2 f = q - i;
  vec2 u = f*f*f*(f*(f*6.0 - 15.0) + 10.0);
  vec2 du = 30.0*f*f*(f*(f - 2.0) + 1.0);
  ivec2 c = ivec2(i) + ivec2(round(uOrigin / S));
  float a = hv(c, seed), b = hv(c + ivec2(1,0), seed), cc = hv(c + ivec2(0,1), seed), d = hv(c + ivec2(1,1), seed);
  float k1 = b - a, k2 = cc - a, k4 = a - b - cc + d;
  return vec3(a + k1*u.x + k2*u.y + k4*u.x*u.y, du * vec2(k1 + k4*u.y, k2 + k4*u.x) / S);
}
struct TOut { float h; vec2 g; float sh; float alb; float fresh; };
uniform vec2 uSunH; uniform float uTanEl;
void crater(vec2 rel, float r, float fresh, float w, inout TOut o, bool shadows, float pen){
  float dist = length(rel);
  float d = dist / r;
  if (d >= 1.5 || w <= 0.0) return;
  float depth = r * (0.06 + 0.34 * fresh), rim = r * (0.008 + 0.067 * fresh);
  float hh, dh;
  if (d < 1.0){ hh = -depth + (depth + rim) * d * d; dh = 2.0 * (depth + rim) * d; }
  else { float k = 1.0 - (d - 1.0) * 2.0; hh = rim * k * k; dh = -4.0 * rim * k; }
  o.h += w * hh;
  if (dist > 1e-4) o.g += w * (dh / r) * (rel / dist);
  float fr3 = fresh * fresh * fresh;
  o.alb += w * fr3 * 0.9 * (1.0 - smoothstep(0.55, 1.5, d));
  o.fresh = max(o.fresh, w * fr3 * (1.0 - smoothstep(0.9, 1.3, d)));
  if (shadows && d < 1.0){
    float b = dot(rel, uSunH);
    float c = dot(rel, rel) - r * r;
    float t = -b + sqrt(max(b * b - c, 0.0));
    float occ = (rim - hh) / max(t, 1e-3);
    float p = pen;
    o.sh *= 1.0 - w * w * w * smoothstep(uTanEl - p, uTanEl + p, occ);
  }
}
bool suppressed(int li, vec2 c){
  float d0 = length(c);
  if (li == 0) return d0 < 9000.0;
  if (li <= 2) return d0 < 2600.0;
  if (li <= 4) return length(c - vec2(${SITE.clear.x.toFixed(1)}, ${SITE.clear.z.toFixed(1)})) < 48.0 || length(c - vec2(${SITE.west.x.toFixed(1)}, ${SITE.west.z.toFixed(1)})) < 140.0;
  if (li == 5) return length(c - vec2(${SITE.clear.x.toFixed(1)}, ${SITE.clear.z.toFixed(1)})) < 16.0;
  return false;
}
void layer(int li, vec2 p, float S, float prob, float r0, float r1, uint seed, float w, inout TOut o, bool shadows, float pen){
  if (w <= 0.001) return;
  vec2 q = p / S - 0.5;
  vec2 b = floor(q);
  ivec2 base = ivec2(b) + ivec2(round(uOrigin / S));
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++){
    uint s = hash2(base + ivec2(i, j), seed);
    if (rnd(s) > prob) continue;
    float ux = rnd(s); float uz = rnd(s);
    vec2 cl = (b + vec2(float(i), float(j)) + vec2(ux, uz)) * S;   // local centre
    float rr = rnd(s); float rf = rnd(s);
    float r = r0 + (r1 - r0) * pow(rr, 2.5);
    float fresh = pow(rf, 2.6);
    if (suppressed(li, cl + uOrigin)) continue;
    crater(p - cl, r, fresh, w, o, shadows, pen);
  }
}
uniform vec4 uFixed[${FIXED_CRATERS.length}];
TOut terrain(vec2 p, float lod, float lodA, float lodB, bool shadows){
  TOut o; o.h = 0.0; o.g = vec2(0.0); o.sh = 1.0; o.alb = 0.0; o.fresh = 0.0;
  float pen = 0.0047 + 0.02 * smoothstep(0.2, 20.0, lod);
  ${UND.map(([S, A, sd]) => `{ vec3 n = vnoised(p, ${S.toFixed(1)}, ${sd}u); o.h += ${A.toFixed(2)} * (n.x - 0.5); o.g += ${A.toFixed(2)} * n.yz; }`).join('\n  ')}
  ${LAYERS.map((L, i) => `layer(${i}, p, ${L.S.toFixed(1)}, ${L.p.toFixed(3)}, ${L.r0.toFixed(2)}, ${L.r1.toFixed(2)}, ${L.seed}u, smoothstep(lodA, lodB, ${L.S.toFixed(1)} / lod), o, shadows, pen);`).join('\n  ')}
  for (int k = 0; k < ${FIXED_CRATERS.length}; k++){
    vec4 c = uFixed[k];
    crater(p - (c.xy - uOrigin), c.z, c.w, smoothstep(lodA, lodB, c.z * 3.0 / lod), o, shadows, pen);
  }
  o.h += uHOffset;
  return o;
}
`;

// Analytic shadow of the lunar module on the ground (model frame: footpads at y = 0, +x forward).
const GLSL_LMSHADOW = /* glsl */`
uniform mat4 uLmInv; uniform vec3 uSunM; uniform float uLmOn;
bool slab(vec3 o, vec3 d, vec3 n, float lo, float hi, inout float t0, inout float t1){
  float on = dot(o, n), dn = dot(d, n);
  if (abs(dn) < 1e-6) return on >= lo && on <= hi;
  float a = (lo - on) / dn, b = (hi - on) / dn;
  t0 = max(t0, min(a, b)); t1 = min(t1, max(a, b));
  return t0 <= t1;
}
bool hitPrism(vec3 o, vec3 d){
  float t0 = 0.0, t1 = 1e4;
  if (!slab(o, d, vec3(0.0, 1.0, 0.0), 1.30, 3.23, t0, t1)) return false;
  if (!slab(o, d, vec3(1.0, 0.0, 0.0), -2.11, 2.11, t0, t1)) return false;
  if (!slab(o, d, vec3(0.0, 0.0, 1.0), -2.11, 2.11, t0, t1)) return false;
  if (!slab(o, d, vec3(0.7071, 0.0, 0.7071), -2.35, 2.35, t0, t1)) return false;
  return slab(o, d, vec3(0.7071, 0.0, -0.7071), -2.35, 2.35, t0, t1);
}
bool hitEll(vec3 o, vec3 d, vec3 c, vec3 r){
  vec3 oo = (o - c) / r, dd = d / r;
  float a = dot(dd, dd), b = dot(oo, dd), cc = dot(oo, oo) - 1.0;
  float disc = b * b - a * cc;
  return disc > 0.0 && (-b + sqrt(disc)) > 0.0;
}
bool hitCap(vec3 o, vec3 d, vec3 a, vec3 b, float r){
  // closest approach between the ray and the segment
  vec3 u = d, v = b - a, w = o - a;
  float A = dot(u,u), B = dot(u,v), C = dot(v,v), D = dot(u,w), E = dot(v,w);
  float den = A*C - B*B;
  float sc = den > 1e-6 ? (B*E - C*D) / den : 0.0;
  float tc = den > 1e-6 ? (A*E - B*D) / den : E / C;
  tc = clamp(tc, 0.0, 1.0); sc = max(sc, 0.0);
  vec3 dp = w + sc * u - tc * v;
  return dot(dp, dp) < r * r;
}
float lmHit(vec3 o, vec3 d){
  if (hitPrism(o, d)) return 1.0;
  if (hitEll(o, d, vec3(-0.15, 4.62, 0.0), vec3(1.75, 1.35, 1.95))) return 1.0;
  if (hitEll(o, d, vec3(-0.2, 6.05, 0.0), vec3(0.45, 0.3, 0.45))) return 1.0;
  if (hitCap(o, d, vec3( 2.0, 2.9, 0.0), vec3( 4.26, 0.3, 0.0), 0.13)) return 1.0;
  if (hitCap(o, d, vec3(-2.0, 2.9, 0.0), vec3(-4.26, 0.3, 0.0), 0.13)) return 1.0;
  if (hitCap(o, d, vec3(0.0, 2.9,  2.0), vec3(0.0, 0.3,  4.26), 0.13)) return 1.0;
  if (hitCap(o, d, vec3(0.0, 2.9, -2.0), vec3(0.0, 0.3, -4.26), 0.13)) return 1.0;
  if (hitEll(o, d, vec3( 4.26, 0.12, 0.0), vec3(0.47, 0.12, 0.47))) return 1.0;
  if (hitEll(o, d, vec3(-4.26, 0.12, 0.0), vec3(0.47, 0.12, 0.47))) return 1.0;
  if (hitEll(o, d, vec3(0.0, 0.12,  4.26), vec3(0.47, 0.12, 0.47))) return 1.0;
  if (hitEll(o, d, vec3(0.0, 0.12, -4.26), vec3(0.47, 0.12, 0.47))) return 1.0;
  return 0.0;
}
float lmShadow(vec3 wp){
  if (uLmOn < 0.5) return 1.0;
  vec3 o = (uLmInv * vec4(wp, 1.0)).xyz;
  vec3 d = normalize(uSunM);
  // bounding sphere around the LM (centre 3.5 m up, radius 6.5 m)
  vec3 oc = o - vec3(0.0, 3.4, 0.0);
  float b = dot(oc, d);
  float c = dot(oc, oc) - b * b;
  if (b > 0.0 || c > 6.6 * 6.6 + (-b) * (-b) * 0.0001) return 1.0;
  // four rays across the solar disc (0.27° radius) give the penumbra
  vec3 t1 = normalize(cross(d, vec3(0.0, 1.0, 0.0001)));
  vec3 t2 = cross(d, t1);
  float k = 0.0047;
  float s = lmHit(o, normalize(d + k * t1)) + lmHit(o, normalize(d - k * t1)) + lmHit(o, normalize(d + k * t2)) + lmHit(o, normalize(d - k * t2));
  return 1.0 - 0.25 * s;
}
`;

/* ================================================================== mesh */
export function createTerrain({ rings = 300, segs = 256, maxR = 320000, minR = 0.25, boulderTex = null, boulderRegion = null } = {}) {
  // Concentric rings, geometric spacing: dense under the camera, sparse at the horizon.
  const q = Math.pow(maxR / minR, 1 / (rings - 1));
  const pos = new Float32Array((rings * segs + 1) * 3);
  pos[0] = 0; pos[1] = 0; pos[2] = 0;
  let k = 3;
  for (let i = 0; i < rings; i++) {
    const r = minR * Math.pow(q, i);
    const off = (i % 2) * 0.5;
    for (let j = 0; j < segs; j++) {
      const a = (j + off) / segs * Math.PI * 2;
      pos[k++] = r * Math.cos(a); pos[k++] = 0; pos[k++] = r * Math.sin(a);
    }
  }
  const idx = [];
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 0; i < rings - 1; i++) {
    const a0 = 1 + i * segs, b0 = 1 + (i + 1) * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      if (i % 2 === 0) { idx.push(a0 + j, a0 + j1, b0 + j); idx.push(a0 + j1, b0 + j1, b0 + j); }
      else { idx.push(a0 + j, a0 + j1, b0 + j1); idx.push(a0 + j, b0 + j1, b0 + j); }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), maxR);

  const uniforms = {
    uOrigin: { value: new THREE.Vector2() },
    uHOffset: { value: HEIGHT_OFFSET },
    uMeshCenter: { value: new THREE.Vector2() },
    uCurve: { value: new THREE.Vector2() },
    uSpacingK: { value: (q - 1) },
    uMinSp: { value: minR },
    uSun: { value: new THREE.Vector3(0, 1, 0) },
    uSunH: { value: new THREE.Vector2(-1, 0) },
    uTanEl: { value: Math.tan(10.9 * Math.PI / 180) },
    uSunI: { value: 2.6 },
    uPixAngle: { value: 0.001 },
    uFixed: { value: FIXED_CRATERS.map(c => new THREE.Vector4(c[0], c[1], c[2], c[3])) },
    uLmInv: { value: new THREE.Matrix4() },
    uSunM: { value: new THREE.Vector3(0, 1, 0) },
    uLmOn: { value: 1 },
    uBTex: { value: boulderTex },
    uBReg: { value: boulderRegion || new THREE.Vector4(0, 0, 1, 1) },
    uBOn: { value: boulderTex ? 1 : 0 },
    uDetail: { value: 1 },
    uExposure: { value: 1 },
    uGlow: { value: new THREE.Vector3() },   // engine glow on the ground: xz + strength
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_vertex>
      ${GLSL_COMMON}
      uniform vec2 uMeshCenter, uCurve; uniform float uSpacingK, uMinSp;
      varying vec3 vWorld; varying vec2 vLocal;
      void main(){
        vec2 local = position.xz + uMeshCenter;
        float sp = max(uMinSp, length(position.xz) * uSpacingK);
        TOut o = terrain(local, sp, 2.5, 6.0, false);
        vec2 dc = local - uCurve;
        float drop = dot(dc, dc) / ${(2 * R_MOON).toFixed(1)};
        vWorld = vec3(local.x, o.h - drop, local.y);
        vLocal = local;
        gl_Position = projectionMatrix * viewMatrix * vec4(vWorld, 1.0);
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: /* glsl */`
      #include <common>
      #include <logdepthbuf_pars_fragment>
      ${GLSL_COMMON}
      ${GLSL_LMSHADOW}
      uniform vec3 uSun; uniform float uSunI, uPixAngle, uDetail, uExposure;
      uniform vec2 uCurve;
      uniform sampler2D uBTex; uniform vec4 uBReg; uniform float uBOn;
      uniform vec3 uGlow;
      varying vec3 vWorld; varying vec2 vLocal;
      void main(){
        #include <logdepthbuf_fragment>
        float dist = distance(cameraPosition, vWorld);
        float foot = max(dist * uPixAngle, 1e-3);
        TOut o = terrain(vLocal, foot, 5.0, 14.0, true);
        vec2 G = o.g - (vLocal - uCurve) / ${R_MOON.toFixed(1)};
        // regolith micro-relief (fades out with distance)
        float mw = uDetail * (1.0 - smoothstep(0.05, 0.6, foot));
        if (mw > 0.0){
          vec3 n1 = vnoised(vLocal, 1.25, 211u);
          vec3 n2 = vnoised(vLocal, 0.3125, 223u);
          G += mw * (0.05 * n1.yz + 0.012 * n2.yz);
        }
        vec3 n = normalize(vec3(-G.x, 1.0, -G.y));
        vec3 v = normalize(cameraPosition - vWorld);
        float mu0 = dot(n, uSun);
        float mu = max(dot(n, v), 0.03);
        float ls = mu0 > 0.0 ? mu0 / (mu0 + mu) : 0.0;
        float cosA = clamp(dot(uSun, v), -1.0, 1.0);
        float halfA = 0.5 * acos(cosA);
        float B = 0.85 / (1.0 + tan(halfA) / 0.055);             // opposition surge (Hapke shadow hiding)
        float brdf = (1.75 * ls + 0.25 * max(mu0, 0.0)) * (1.0 + B);
        float sh = o.sh * lmShadow(vWorld);
        if (uBOn > 0.5){
          vec2 site = vLocal + uOrigin;
          vec2 uv = (site - uBReg.xy) / uBReg.zw;
          if (uv.x > 0.0 && uv.y > 0.0 && uv.x < 1.0 && uv.y < 1.0) sh *= 1.0 - 0.92 * texture2D(uBTex, uv).a * (1.0 - smoothstep(0.5, 2.5, foot));
        }
        // albedo: mare regolith ≈ 0.07–0.12, fresh ejecta and crater walls brighter
        vec3 big = vnoised(vLocal, 5120.0, 301u);
        vec3 mid = vnoised(vLocal, 320.0, 307u);
        vec3 huge = vnoised(vLocal, 20480.0, 311u);
        float a = 0.095 * (0.62 + 0.45 * huge.x + 0.3 * big.x + 0.22 * (mid.x - 0.5)) * (1.0 + o.alb);
        vec3 tint = mix(vec3(0.93, 0.89, 0.84), vec3(1.0, 0.98, 0.95), clamp(o.fresh * 1.5, 0.0, 1.0));
        vec3 alb = a * tint;
        vec3 col = alb * uSunI * brdf * sh;
        col += alb * 0.035;                                         // light scattered from the surrounding sunlit ground
        // engine glow reflected onto the ground (faint)
        if (uGlow.z > 0.0){ float gd = distance(vLocal, uGlow.xy); col += vec3(1.0, 0.72, 0.45) * uGlow.z * alb * 6.0 / (1.0 + gd * gd * 0.2); }
        gl_FragColor = vec4(col * uExposure, 1.0);
      }`
  });
  mat.extensions = { derivatives: false };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1;
  return { mesh, uniforms, q };
}

/* ================================================================== rocks */
/** Deterministic boulder field: dense around West crater, sparse elsewhere.
 *  Returns [{x, z, s (radius, m), h (height above ground), rot}], and a grid for lookups. */
export function makeBoulders(seedBase = 7) {
  const rng = makeRng(hash2(1, 2, seedBase));
  const list = [];
  const W = SITE.west;
  const clearD = (x, z) => Math.hypot(x - SITE.clear.x, z - SITE.clear.z);
  const add = (x, z, s) => {
    if (clearD(x, z) < SITE.clear.r && s > 0.06) return;
    const hgt = s * (0.6 + 0.5 * rng());
    list.push({ x, z, s, h: hgt, rot: rng() * Math.PI * 2, k: (rng() * 3) | 0, g: groundAt(x, z) });
  };
  // ejecta blocks around West crater: concentrated at the rim, decaying outward
  for (let i = 0; i < 2600; i++) {
    const a = rng() * Math.PI * 2;
    const rr = W.r * (0.75 + Math.min(1.9, -Math.log(1 - rng() * 0.985) * 0.42));
    const big = rr < W.r * 1.35 ? 1 : 0.55;
    const s = (0.18 + 1.4 * Math.pow(rng(), 3.2)) * big * (rng() < 0.012 ? 1.9 : 1);
    add(W.x + Math.cos(a) * rr, W.z + Math.sin(a) * rr, s);
  }
  // blocks on the crater walls and floor
  for (let i = 0; i < 260; i++) {
    const a = rng() * Math.PI * 2, rr = W.r * Math.sqrt(rng()) * 0.8;
    add(W.x + Math.cos(a) * rr, W.z + Math.sin(a) * rr, 0.2 + 0.9 * Math.pow(rng(), 2.5));
  }
  // scattered rocks over the landing area
  for (let i = 0; i < 2600; i++) {
    const x = -450 + rng() * 1100, z = -500 + rng() * 1000;
    add(x, z, 0.08 + 0.5 * Math.pow(rng(), 4));
  }
  // pebbles near the clear area (scale cues at touchdown)
  for (let i = 0; i < 1400; i++) {
    const a = rng() * Math.PI * 2, rr = 2 + 70 * Math.sqrt(rng());
    add(SITE.clear.x + Math.cos(a) * rr, SITE.clear.z + Math.sin(a) * rr, 0.03 + 0.1 * Math.pow(rng(), 3));
  }
  // spatial hash for physics
  const cell = 8, grid = new Map();
  for (const b of list) {
    const key = Math.floor(b.x / cell) + ',' + Math.floor(b.z / cell);
    (grid.get(key) || grid.set(key, []).get(key)).push(b);
  }
  const boulderTop = (x, z) => {
    let top = -Infinity;
    const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const arr = grid.get((cx + i) + ',' + (cz + j));
      if (!arr) continue;
      for (const b of arr) {
        if (b.s < 0.12) continue;
        const d = Math.hypot(x - b.x, z - b.z);
        if (d < b.s) top = Math.max(top, b.g + b.h * Math.sqrt(1 - (d / b.s) ** 2));
      }
    }
    return top;
  };
  return { list, boulderTop };
}

/** Rock shadow mask baked once into a canvas (the Sun hardly moves during the descent). */
export function bakeBoulderShadows(list, sunDir, { size = 2048, region = [-350, -520, 1050, 1040] } = {}) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const [x0, z0, w, hgt] = region;
  const sx = size / w, sz = size / hgt;
  const hx = -sunDir.x, hz = -sunDir.z, hl = Math.hypot(hx, hz) || 1;
  const tanEl = sunDir.y / Math.hypot(sunDir.x, sunDir.z);
  ctx.fillStyle = 'rgba(0,0,0,1)';
  for (const b of list) {
    if (b.s < 0.1) continue;
    const L = b.h / tanEl;
    const cx = (b.x - x0) * sx, cz = (b.z - z0) * sz;
    const ang = Math.atan2(hz / hl, hx / hl);
    ctx.save();
    ctx.translate(cx, cz); ctx.rotate(ang);
    ctx.beginPath();
    ctx.ellipse(L * sx * 0.5, 0, Math.max(0.6, L * sx * 0.5 + b.s * sx * 0.3), Math.max(0.5, b.s * sz * 0.85), 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.flipY = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { tex, region: new THREE.Vector4(x0, z0, w, hgt) };
}

/** Three irregular rock shapes (displaced icosahedra). */
export function rockGeometries() {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    const rng = makeRng(hash2(k, 9, 3));
    const lobes = [];
    for (let i = 0; i < 6; i++) lobes.push([rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1, 0.1 + rng() * 0.25]);
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i).normalize();
      let r = 1;
      for (const l of lobes) r += l[3] * Math.max(0, v.x * l[0] + v.y * l[1] + v.z * l[2]);
      r *= 0.8 + 0.12 * Math.sin(v.x * 7 + k) * Math.sin(v.z * 5 - k);
      // flatten the base and facet slightly
      const y = v.y * r;
      p.setXYZ(i, v.x * r, y < -0.2 ? -0.2 - (y + 0.2) * 0.3 : y, v.z * r);
    }
    g.computeVertexNormals();
    out.push(g);
  }
  return out;
}

/** Inject the lunar-curvature drop into a standard material (instanced rocks, props). */
export function curveMaterial(mat, curveUniform) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uCurve = curveUniform;
    sh.vertexShader = 'uniform vec2 uCurve;\n' + sh.vertexShader.replace('#include <project_vertex>', `
      vec4 wpos = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        wpos = instanceMatrix * wpos;
      #endif
      wpos = modelMatrix * wpos;
      vec2 dcv = wpos.xz - uCurve;
      wpos.y -= dot(dcv, dcv) / ${(2 * R_MOON).toFixed(1)};
      vec4 mvPosition = viewMatrix * wpos;
      gl_Position = projectionMatrix * mvPosition;`);
  };
  return mat;
}
