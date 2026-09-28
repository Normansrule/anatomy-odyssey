/* Cosmic Library — Galaxy Collision: GPU pieces
 *   1. StarIntegrator — every star's position and velocity live in two RGBA32F textures (one MRT render target,
 *      ping-ponged). One full-screen pass per time step does a symplectic kick–drift leapfrog for all stars:
 *          v ← v + a(x, t)·Δt ;  x ← x + v·Δt
 *      where a is the pull of both moving galaxy potentials (Hernquist bulge + Plummer disk + Hernquist halo).
 *      Same idea as GPGPU fluid solvers (e.g. PavelDoGreat/WebGL-Fluid-Simulation) — the GPU is the physics engine.
 *   2. Star, dust and background-galaxy materials.
 */
import * as THREE from "three";

/* -------------------------------------------------------------------------------------------- integrator */
const QUAD_VERT = /* glsl */ `
in vec3 position;
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const STEP_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
uniform sampler2D uPos, uVel;
uniform vec3 uCA, uCB;      // galaxy centres at time t
uniform vec4 uGA, uGB;      // (M_bulge, a_bulge, M_disk, b_disk)  [10^10 Msun, kpc]
uniform vec2 uHA, uHB;      // (M_halo, a_halo)
uniform float uDt;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;
// Hernquist:  g = M/(r+a)^2      Plummer:  g = M r/(r^2+b^2)^(3/2)      (G = 1)
vec3 accel(vec3 x, vec3 c, vec4 g, vec2 h) {
  vec3 d = x - c;
  float r = length(d) + 1e-5;
  float rb = r + g.y, rh = r + h.y, q = r * r + g.w * g.w;
  float gm = g.x / (rb * rb) + g.z * r / (q * sqrt(q)) + h.x / (rh * rh);
  return -(gm / r) * d;
}
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 p = texelFetch(uPos, ij, 0);
  vec4 v = texelFetch(uVel, ij, 0);
  vec3 a = accel(p.xyz, uCA, uGA, uHA) + accel(p.xyz, uCB, uGB, uHB);
  v.xyz += a * uDt;           // kick  (v at t+dt/2)
  p.xyz += v.xyz * uDt;       // drift (x at t+dt)
  oPos = p; oVel = v;
}`;

const COPY_FRAG = /* glsl */ `
precision highp float;
precision highp sampler2D;
uniform sampler2D uPos, uVel;
layout(location = 0) out vec4 oPos;
layout(location = 1) out vec4 oVel;
void main() { ivec2 ij = ivec2(gl_FragCoord.xy); oPos = texelFetch(uPos, ij, 0); oVel = texelFetch(uVel, ij, 0); }`;

export class StarIntegrator {
  constructor(renderer, N) {
    this.renderer = renderer;
    this.N = N;
    this.w = Math.min(1024, Math.ceil(Math.sqrt(N)));
    this.h = Math.ceil(N / this.w);
    const opts = { count: 2, type: THREE.FloatType, format: THREE.RGBAFormat, minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false };
    this.rt = [new THREE.WebGLRenderTarget(this.w, this.h, opts), new THREE.WebGLRenderTarget(this.w, this.h, opts)];
    this.cur = 0;
    this.scene = new THREE.Scene();
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.stepMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: QUAD_VERT, fragmentShader: STEP_FRAG,
      uniforms: { uPos: { value: null }, uVel: { value: null }, uCA: { value: new THREE.Vector3() }, uCB: { value: new THREE.Vector3() },
        uGA: { value: new THREE.Vector4() }, uGB: { value: new THREE.Vector4() }, uHA: { value: new THREE.Vector2() }, uHB: { value: new THREE.Vector2() },
        uDt: { value: 0.15 } },
      depthTest: false, depthWrite: false,
    });
    this.copyMat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: QUAD_VERT, fragmentShader: COPY_FRAG,
      uniforms: { uPos: { value: null }, uVel: { value: null } }, depthTest: false, depthWrite: false,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.stepMat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
    this._px = new Float32Array(4);
  }
  get posTex() { return this.rt[this.cur].textures[0]; }
  get velTex() { return this.rt[this.cur].textures[1]; }

  /* Upload initial conditions (Float32Array, 4 floats per star). */
  load(pos, vel) {
    const size = this.w * this.h * 4;
    const P = new Float32Array(size), V = new Float32Array(size);
    P.set(pos); V.set(vel);
    for (let i = pos.length; i < size; i += 4) { P[i] = 1e6; P[i + 3] = -1; }   // unused texels: park far away
    const tp = new THREE.DataTexture(P, this.w, this.h, THREE.RGBAFormat, THREE.FloatType);
    const tv = new THREE.DataTexture(V, this.w, this.h, THREE.RGBAFormat, THREE.FloatType);
    tp.needsUpdate = tv.needsUpdate = true;
    this.copyMat.uniforms.uPos.value = tp; this.copyMat.uniforms.uVel.value = tv;
    this.quad.material = this.copyMat;
    const r = this.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(this.rt[0]); r.render(this.scene, this.cam);
    r.setRenderTarget(prev);
    this.quad.material = this.stepMat;
    this.cur = 0;
    tp.dispose(); tv.dispose();
  }

  setGalaxies(A, B, dt) {
    const u = this.stepMat.uniforms;
    u.uGA.value.set(A.Mb, A.ab, A.Md, A.bd); u.uHA.value.set(A.Mh, A.ah);
    u.uGB.value.set(B.Mb, B.ab, B.Md, B.bd); u.uHB.value.set(B.Mh, B.ah);
    u.uDt.value = dt;
  }

  /* Advance one step with the cores at the positions they have at the start of the step. */
  step(coreA, coreB) {
    const u = this.stepMat.uniforms;
    u.uCA.value.set(coreA[0], coreA[1], coreA[2]);
    u.uCB.value.set(coreB[0], coreB[1], coreB[2]);
    u.uPos.value = this.rt[this.cur].textures[0];
    u.uVel.value = this.rt[this.cur].textures[1];
    const r = this.renderer, prev = r.getRenderTarget();
    r.setRenderTarget(this.rt[1 - this.cur]);
    r.render(this.scene, this.cam);
    r.setRenderTarget(prev);
    this.cur = 1 - this.cur;
  }

  /* Read one star's position (synchronous; used for the Sun, a single texel). */
  readStar(i, out) {
    const x = i % this.w, y = Math.floor(i / this.w);
    this.renderer.readRenderTargetPixels(this.rt[this.cur], x, y, 1, 1, this._px, undefined, 0);
    out[0] = this._px[0]; out[1] = this._px[1]; out[2] = this._px[2];
    return out;
  }

  /* Non-blocking read (WebGL 2 fence): resolves a frame or two later without stalling the GPU pipeline. */
  readStarAsync(i) {
    const x = i % this.w, y = Math.floor(i / this.w), buf = new Float32Array(4);
    return this.renderer.readRenderTargetPixelsAsync(this.rt[this.cur], x, y, 1, 1, buf, undefined, 0).then(() => [buf[0], buf[1], buf[2]]);
  }

  dispose() { this.rt.forEach(t => t.dispose()); this.stepMat.dispose(); this.copyMat.dispose(); this.quad.geometry.dispose(); }
}

/* -------------------------------------------------------------------------------------------- star sprites */
const STAR_VERT = /* glsl */ `
uniform sampler2D uPos;
uniform float uScale, uSize, uGain, uMinPx, uTime, uSky, uSkyGain, uPR;
uniform vec3 uC0, uC1;                // galaxy centres
uniform vec3 uX0, uY0, uZ0, uX1, uY1, uZ1;   // disk bases (x, normal, z)
uniform vec2 uSpin;                   // +1 / −1
uniform vec2 uArm;                    // density-wave arm visibility per galaxy
uniform vec2 uRd;                     // disk scale lengths
uniform float uDust;                  // 1 = this is the dust pass
uniform float uTail;                  // faint-tail enhancement 0/1
uniform float uDustK;                 // dust opacity normalisation
attribute vec2 aRef;
attribute float aPop, aRnd, aHost;
varying vec3 vCol;
varying float vI;

vec3 popColor(float pop, float rnd) {
  if (pop < 0.5) return mix(vec3(1.0, 0.78, 0.55), vec3(1.0, 0.9, 0.78), rnd);         // old disk: warm white
  if (pop < 1.5) return mix(vec3(0.32, 0.52, 1.0), vec3(0.6, 0.76, 1.0), rnd);         // young disk: blue
  if (pop < 2.5) return mix(vec3(1.0, 0.55, 0.22), vec3(1.0, 0.72, 0.38), rnd);        // bulge: yellow-orange
  if (pop < 3.5) return mix(vec3(1.0, 0.42, 0.68), vec3(0.95, 0.55, 1.0), rnd);        // H II knots: pink
  if (pop < 4.5) return vec3(0.0);
  return vec3(1.0, 0.95, 0.7);                                                         // the Sun
}

void main() {
  vec4 P = texture2D(uPos, aRef);
  float pop = aPop;
  bool dust = pop > 3.5 && pop < 4.5;
  if ((uDust > 0.5) != dust || P.w < -0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }

  // ---- density-wave spiral pattern (Lin & Shu 1964): young stars light up where the pattern sweeps past.
  float h = aHost;
  vec3 c = mix(uC0, uC1, h);
  vec3 d = P.xyz - c;
  vec3 ex = mix(uX0, uX1, h), ey = mix(uY0, uY1, h), ez = mix(uZ0, uZ1, h);
  vec3 l = vec3(dot(d, ex), dot(d, ey), dot(d, ez));
  float R = length(l.xz) + 1e-3;
  float s = mix(uSpin.x, uSpin.y, h);
  float rd = mix(uRd.x, uRd.y, h);
  float phi = atan(l.z, l.x);
  // trailing logarithmic spiral, pitch ≈ 14°, pattern speed ≈ 25 km/s/kpc (0.12 in model units)
  float arm = 0.5 + 0.5 * cos(2.0 * (phi - s * (4.0 * log(R / rd) - 0.12 * uTime)) + aRnd * 1.3);
  arm = pow(arm, 4.0) * exp(-l.y * l.y / 0.8) * smoothstep(0.4 * rd, 1.3 * rd, R) * exp(-R / (7.0 * rd));
  arm *= mix(uArm.x, uArm.y, h);

  vec3 col = popColor(pop, aRnd);
  float armOn = mix(uArm.x, uArm.y, h);
  float I = 0.75 + 0.9 * arm;                              // old disk: a hint of the arms (they are density waves)
  if (pop > 0.5 && pop < 1.5) I = mix(1.0, 0.18, armOn) + 4.5 * arm;   // young blue stars live in the arms
  else if (pop > 2.5 && pop < 3.5) I = 0.2 + 12.0 * arm;
  else if (pop > 1.5 && pop < 2.5) I = 0.7;
  else if (pop > 4.5) I = 1.6;
  if (dust) I = 0.35 + 1.8 * arm;                          // dust lanes hug the arms
  // Faint-feature stretch: stars flung beyond ~1.2 disk radii (tails, bridges, shells) are drawn brighter, like
  // the deep exposures that reveal real tidal tails. Toggle: "Enhance faint tails".
  float r3 = length(d) / (6.0 * rd);
  I *= 1.0 + uTail * 3.5 * smoothstep(1.0, 2.2, r3);
  float wsize = uSize * (pop > 1.5 && pop < 2.5 ? 0.85 : 1.0) * (pop > 2.5 && pop < 3.5 ? 0.8 : 1.0) * (dust ? 2.0 : 1.0);

  vec4 mv = modelViewMatrix * vec4(P.xyz, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = -mv.z;
  if (uSky > 0.5) {
    // Looking out from the Sun. Surface brightness does not depend on distance (flux ∝ 1/d², area ∝ 1/d²), so the
    // same world-sized sprites give the right sky: a bright band for our own disk, a patch for Andromeda.
    if (length(mv.xyz) < 0.06) { gl_PointSize = 0.0; gl_Position = vec4(2.0); return; }
    wsize *= 2.2;
  }
  float px = wsize * uScale / max(dist, 1e-3);
  float ps = max(px, uMinPx);
  if (uSky > 0.5) {
    // Nearby particles stand for a smooth spread of ~10⁵–10⁶ stars around us: cap their size and let them fade
    // instead of drawing giant blobs.
    float cap = 30.0 * uPR;
    gl_PointSize = min(ps, cap);
    vI = 3.0 * I * uGain * (px * px) / (ps * ps) * (ps > cap ? pow(cap / ps, 1.5) : 1.0);
  } else {
    gl_PointSize = min(ps, 64.0);
    vI = I * (dust ? uDustK : uGain) * (px * px) / (ps * ps) * (ps > 64.0 ? (ps * ps) / 4096.0 : 1.0);
  }
  vCol = col;
}`;

const STAR_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vI;
uniform float uDust;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r2 = dot(q, q);
  float f = exp(-r2 * 18.0);
  if (f < 0.01) discard;
  if (uDust > 0.5) {
    // subtractive: destination × (1 − src); reddened absorption (blue dimmed most)
    gl_FragColor = vec4(vec3(0.55, 0.66, 0.8) * min(vI, 0.3) * f, 1.0);
    return;
  }
  gl_FragColor = vec4(vCol * vI, f);
}`;

export function makeStarMaterial(dust) {
  const m = new THREE.ShaderMaterial({
    vertexShader: STAR_VERT, fragmentShader: STAR_FRAG,
    uniforms: {
      uPos: { value: null }, uScale: { value: 500 }, uSize: { value: 0.35 }, uGain: { value: 1 }, uMinPx: { value: 1.5 },
      uTime: { value: 0 }, uSky: { value: 0 }, uSkyGain: { value: 0.02 }, uPR: { value: 1 },
      uC0: { value: new THREE.Vector3() }, uC1: { value: new THREE.Vector3() },
      uX0: { value: new THREE.Vector3(1, 0, 0) }, uY0: { value: new THREE.Vector3(0, 1, 0) }, uZ0: { value: new THREE.Vector3(0, 0, 1) },
      uX1: { value: new THREE.Vector3(1, 0, 0) }, uY1: { value: new THREE.Vector3(0, 1, 0) }, uZ1: { value: new THREE.Vector3(0, 0, 1) },
      uSpin: { value: new THREE.Vector2(1, 1) }, uArm: { value: new THREE.Vector2(1, 1) }, uRd: { value: new THREE.Vector2(3, 3) },
      uDust: { value: dust ? 1 : 0 }, uTail: { value: 1 }, uDustK: { value: 0.1 },
    },
    transparent: true, depthWrite: false, depthTest: false,
  });
  if (dust) {
    m.blending = THREE.CustomBlending;
    m.blendEquation = THREE.AddEquation;
    m.blendSrc = THREE.ZeroFactor;
    m.blendDst = THREE.OneMinusSrcColorFactor;
  } else m.blending = THREE.AdditiveBlending;
  return m;
}

export function makeStarGeometry(N, texW, texH, pop, host, seed) {
  const g = new THREE.BufferGeometry();
  const ref = new Float32Array(N * 2), p = new Float32Array(N), rnd = new Float32Array(N), hst = new Float32Array(N);
  let s = seed >>> 0;
  for (let i = 0; i < N; i++) {
    ref[i * 2] = ((i % texW) + 0.5) / texW; ref[i * 2 + 1] = (Math.floor(i / texW) + 0.5) / texH;
    p[i] = pop[i]; hst[i] = host[i];
    s = (s * 1664525 + 1013904223) >>> 0; rnd[i] = s / 4294967296;
  }
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));  // unused (positions come from the texture)
  g.setAttribute("aRef", new THREE.BufferAttribute(ref, 2));
  g.setAttribute("aPop", new THREE.BufferAttribute(p, 1));
  g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
  g.setAttribute("aHost", new THREE.BufferAttribute(hst, 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
  return g;
}

/* -------------------------------------------------------------------------------------------- distant galaxies */
const BG_VERT = /* glsl */ `
attribute float aSize, aType, aAng, aAxis, aBright;
attribute vec3 aCol;
uniform float uPR, uDim;
varying float vType, vAng, vAxis, vBright;
varying vec3 vCol2;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPR;
  vType = aType; vAng = aAng; vAxis = aAxis; vBright = aBright * uDim; vCol2 = aCol;
}`;
const BG_FRAG = /* glsl */ `
varying float vType, vAng, vAxis, vBright;
varying vec3 vCol2;
void main() {
  vec2 q = (gl_PointCoord - 0.5) * 2.0;
  float c = cos(vAng), s = sin(vAng);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  if (vType < 0.5) {                      // a plain background star
    float f = exp(-dot(q, q) * 9.0);
    gl_FragColor = vec4(vCol2 * vBright * f, 1.0); return;
  }
  vec2 e = vec2(q.x, q.y / vAxis);
  float r = length(e);
  if (r > 1.0) discard;
  float f;
  if (vType < 1.5) {                      // elliptical: de Vaucouleurs-like core
    f = exp(-7.0 * pow(r, 0.5)) * 12.0;
  } else {                                // spiral: bulge + disk + two arms
    float th = atan(e.y, e.x);
    float arms = 0.5 + 0.5 * cos(2.0 * (th - 3.2 * log(r + 0.05)));
    f = exp(-r * 5.5) * (0.6 + 0.9 * arms) + exp(-r * r * 60.0) * 1.2;
  }
  f *= smoothstep(1.0, 0.7, r);
  gl_FragColor = vec4(vCol2 * vBright * f, 1.0);
}`;

export function makeBackground(seed, count) {
  let s = seed >>> 0;
  const R = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const n = count, pos = new Float32Array(n * 3), size = new Float32Array(n), type = new Float32Array(n),
    ang = new Float32Array(n), axis = new Float32Array(n), bright = new Float32Array(n), col = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.set(R() * 2 - 1, R() * 2 - 1, R() * 2 - 1); if (v.lengthSq() > 1 || v.lengthSq() < 1e-3) { i--; continue; }
    v.normalize().multiplyScalar(4000);
    pos.set([v.x, v.y, v.z], i * 3);
    const gal = i % 7 === 0;
    if (gal) {
      const t = R() < 0.45 ? 1 : 2;
      type[i] = t;
      size[i] = 5 + Math.pow(R(), 4) * 16;
      ang[i] = R() * 6.283; axis[i] = t === 1 ? 0.55 + R() * 0.45 : 0.15 + R() * 0.85;
      bright[i] = (0.05 + R() * 0.12) * (size[i] > 16 ? 1.3 : 1);
      const warm = t === 1 ? 1 : R() * 0.5;
      col.set([1, 0.82 + 0.1 * (1 - warm), 0.62 + 0.36 * (1 - warm)], i * 3);
    } else {
      type[i] = 0; size[i] = 2 + R() * 2.2; bright[i] = 0.04 + Math.pow(R(), 6) * 0.9;
      const t = R();
      col.set(t < 0.3 ? [0.75, 0.85, 1] : t < 0.8 ? [1, 0.97, 0.92] : [1, 0.82, 0.62], i * 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  g.setAttribute("aType", new THREE.BufferAttribute(type, 1));
  g.setAttribute("aAng", new THREE.BufferAttribute(ang, 1));
  g.setAttribute("aAxis", new THREE.BufferAttribute(axis, 1));
  g.setAttribute("aBright", new THREE.BufferAttribute(bright, 1));
  g.setAttribute("aCol", new THREE.BufferAttribute(col, 3));
  const m = new THREE.ShaderMaterial({ vertexShader: BG_VERT, fragmentShader: BG_FRAG, uniforms: { uPR: { value: 1 }, uDim: { value: 1 } },
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false;
  pts.renderOrder = -10;
  return pts;
}

/* -------------------------------------------------------------------------------------------- orbit paths */
const PATH_VERT = /* glsl */ `
attribute float aT;
uniform float uNow;
varying float vPast;
varying float vT;
void main() { vPast = step(aT, uNow); vT = aT; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const PATH_FRAG = /* glsl */ `
uniform vec3 uCol;
uniform float uNow;
varying float vPast;
varying float vT;
void main() {
  float fut = (1.0 - vPast) * (0.5 + 0.5 * step(0.5, fract(vT * 0.06)));   // future: dashed
  float a = vPast > 0.5 ? 0.55 : 0.22 * fut;
  gl_FragColor = vec4(uCol * a, 1.0);
}`;
export function makePath(track, which, stride, color) {
  const n = Math.floor((track.length / 6 - 1) / stride) + 1;
  const pos = new Float32Array(n * 3), t = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const j = k * stride * 6 + which * 3;
    pos[k * 3] = track[j]; pos[k * 3 + 1] = track[j + 1]; pos[k * 3 + 2] = track[j + 2]; t[k] = k * stride;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aT", new THREE.BufferAttribute(t, 1));
  const m = new THREE.ShaderMaterial({ vertexShader: PATH_VERT, fragmentShader: PATH_FRAG,
    uniforms: { uNow: { value: 0 }, uCol: { value: new THREE.Color(color) } },
    blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, transparent: true });
  const line = new THREE.Line(g, m);
  line.frustumCulled = false;
  return line;
}
