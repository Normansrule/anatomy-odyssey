/* Space Weather, live: the Sun–Earth scene (three.js r186).
 *
 * World frame ("GSE-like"): +X points AWAY from the Sun (downstream), +Y is ecliptic north,
 * 1 unit = 1 Earth radius (R⊕). Near Earth everything is to scale (Earth, magnetopause,
 * bow shock, geostationary orbit). The Sun and the Sun–Earth distance are NOT: the Sun sits
 * 230 R⊕ away instead of 23,500 R⊕, and is drawn 22 R⊕ across instead of 109.
 *
 *  magnetopause  Shue et al. (1998) surface of revolution, evaluated in the vertex shader
 *  bow shock     conic with eccentricity 0.81 (Farris, Petrinec & Russell 1991), nose from Farris & Russell (1994)
 *  solar wind    streaks advected along analytic streamlines ρ² = b² + ρ_mp(x)² that wrap the magnetopause
 *  aurora        NOAA SWPC OVATION grid (probability, 0–100 %) as a texture on two glowing shells
 *  Earth         reused from earth-globe.js (procedural shader Earth, real Sun direction and sidereal time)
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as G from "./earth-globe.js";
import * as P from "./space-weather-physics.js";

export const SUN_X = -230, SUN_R = 11;
const XS = -80, XE = 72;                 // solar-wind streak box along x (R⊕)
const NPROF = 64;

export function createScene(stage, opt) {
  const { tex, starData, still, reduced } = opt;
  const mobile = () => innerWidth <= 820;
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  // Software rasterisers (no GPU: SwiftShader, llvmpipe) get a lighter render: half resolution, ~4 fps.
  let software = false;
  try {
    const gl = renderer.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info");
    software = /swiftshader|llvmpipe|software/i.test(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "");
  } catch (e) { /* ignore */ }
  renderer.setPixelRatio(software && !still ? 0.5 : Math.min(devicePixelRatio || 1, 2));
  renderer.setSize(stage.clientWidth, stage.clientHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", "3D view of the solar wind flowing from the Sun past Earth. Earth's magnetosphere is drawn as a glowing bow shock and magnetopause whose size follows the live solar-wind pressure, with the aurora forecast glowing around the poles. Drag to rotate, scroll to zoom.");
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010207);
  const camera = new THREE.PerspectiveCamera(40, stage.clientWidth / stage.clientHeight, 0.01, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.9;
  controls.minDistance = 1.6; controls.maxDistance = 700;
  controls.enableZoom = true;

  const U = {                               // shared uniforms
    uTime: { value: 0 },
    uR0: { value: 10 }, uAlpha: { value: 0.58 }, uRbs: { value: 12.8 },
    uThMP: { value: 2.6 }, uThBS: { value: 2.3 }, uRhoMax: { value: 25 },
    uRhoMP: { value: new Float32Array(NPROF) }, uRhoBS: { value: new Float32Array(NPROF) },
    uX0: { value: -10 }, uXb: { value: -12.8 }, uX1: { value: XE },
    uSpd: { value: 10 }, uFrac: { value: 0.4 }, uSouth: { value: 0 }, uPx: { value: 1 },
    uSunDir: { value: new THREE.Vector3(-1, 0, 0) }, uBoost: { value: 1 }, uNear: { value: 1 }
  };

  /* ---------------- stars */
  const stars = G.makeStars(starData);
  stars.material.uniforms.uPx.value = renderer.getPixelRatio();
  scene.add(stars);

  /* ---------------- Earth, oriented so the real Sun lies along −X */
  const earthRoot = new THREE.Group();
  scene.add(earthRoot);
  const E = G.makeEarth(tex);
  E.uniforms.uSunDir.value.set(-1, 0, 0);
  earthRoot.add(E.group);
  scene.add(E.atmo);
  scene.add(new THREE.AmbientLight(0x6070a0, 0.4));

  function orientEarth(ms) {
    const s = P.sunRaDec(ms);
    const e = s.eps, l = s.lam;
    // Sun and ecliptic-north unit vectors in the three.js ECI mapping (x, z, −y) used by earth-globe.js
    const sun = new THREE.Vector3(Math.cos(l), Math.sin(e) * Math.sin(l), -Math.cos(e) * Math.sin(l));
    const eclN = new THREE.Vector3(0, Math.cos(e), Math.sin(e));
    const X = sun.clone().negate();
    const Y = eclN.sub(X.clone().multiplyScalar(eclN.dot(X))).normalize();
    const Z = new THREE.Vector3().crossVectors(X, Y);
    const m = new THREE.Matrix4().makeBasis(X, Y, Z).transpose();   // rows = world axes in ECI → ECI→world
    earthRoot.quaternion.setFromRotationMatrix(m);
    E.group.rotation.y = P.gmst(ms);
    E.uniforms.uCloudPhase.value = (ms / 3.6e6 / 24) % 1000;
  }

  /* ---------------- aurora shells from the OVATION grid */
  const gridData = new Uint8Array(360 * 181);
  const gridTex = new THREE.DataTexture(gridData, 360, 181, THREE.RedFormat, THREE.UnsignedByteType);
  gridTex.magFilter = THREE.LinearFilter; gridTex.minFilter = THREE.LinearFilter;
  gridTex.wrapS = THREE.RepeatWrapping; gridTex.needsUpdate = true;
  function auroraMat(red) {
    return new THREE.ShaderMaterial({
      uniforms: { uGrid: { value: gridTex }, uSunDir: U.uSunDir, uTime: U.uTime, uBoost: U.uBoost },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        varying vec3 vL; varying vec3 vN; varying vec3 vP;
        void main() {
          vL = position; vN = normalize(mat3(modelMatrix) * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uGrid; uniform vec3 uSunDir; uniform float uTime, uBoost;
        varying vec3 vL; varying vec3 vN; varying vec3 vP;
        float h1(float x) { return fract(sin(x * 127.1) * 43758.5453); }
        float n1(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(h1(i), h1(i + 1.0), f); }
        void main() {
          vec3 q = normalize(vL);
          float lat = degrees(asin(clamp(q.y, -1.0, 1.0)));
          float lon = degrees(atan(-q.z, q.x));
          float p = texture2D(uGrid, vec2(fract((lon + 0.5) / 360.0), (lat + 90.5) / 181.0)).r * 2.55;   // 0..1 = 0..100 %
          p = min(1.0, p * uBoost);
          float a = smoothstep(${red ? "0.12, 0.75" : "0.03, 0.55"}, p);
          if (a < 0.002) discard;
          // curtains: rays that drift slowly along the oval
          float ray = 0.55 + 0.45 * n1(lon * 1.7 + uTime * 0.35) * (0.6 + 0.4 * n1(lon * 6.3 - uTime * 0.9));
          vec3 N = normalize(vN), V = normalize(cameraPosition - vP);
          float night = smoothstep(0.12, -0.2, dot(N, uSunDir));
          float limb = 1.0 / (0.3 + abs(dot(N, V)));
          vec3 col = ${red ? "vec3(1.0, 0.22, 0.34)" : "mix(vec3(0.2, 1.0, 0.55), vec3(0.55, 1.0, 0.75), p)"};
          float k = a * ray * (0.1 + 0.9 * night) * limb * ${red ? "0.35" : "0.55"};
          gl_FragColor = vec4(col * k, 1.0);
        }`
    });
  }
  const auroraG = new THREE.Mesh(new THREE.SphereGeometry(1.012, 180, 90), auroraMat(false));
  const auroraR = new THREE.Mesh(new THREE.SphereGeometry(1.032, 160, 80), auroraMat(true));
  auroraG.renderOrder = 3; auroraR.renderOrder = 4;
  E.group.add(auroraG, auroraR);

  /* ---------------- observer pin + reach circle (Earth-fixed) */
  const pinTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.25, "rgba(255,210,120,1)"); g.addColorStop(0.5, "rgba(255,160,60,.35)"); g.addColorStop(1, "rgba(255,140,60,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const pin = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTex, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }));
  pin.scale.setScalar(0.09);
  E.group.add(pin);
  const reachGeo = new THREE.BufferGeometry();
  reachGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(129 * 3), 3));
  const reach = new THREE.Line(reachGeo, new THREE.LineDashedMaterial({ color: 0xffc24b, dashSize: 0.02, gapSize: 0.014, transparent: true, opacity: 0.8, depthWrite: false }));
  E.group.add(reach);
  const obs = { lat: 34.05, lon: -118.24, reach: 8 };
  function setObserver(lat, lon, reachDeg) {
    budget = 40;
    obs.lat = lat; obs.lon = lon; obs.reach = reachDeg;
    G.llToLocal(lat, lon, 1.004, pin.position);
    const c = G.llToLocal(lat, lon, 1), up = new THREE.Vector3(0, 1, 0);
    const e1 = new THREE.Vector3().crossVectors(up, c); if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0); e1.normalize();
    const e2 = new THREE.Vector3().crossVectors(c, e1);
    const a = reachDeg * P.DEG, arr = reachGeo.attributes.position.array;
    for (let i = 0; i <= 128; i++) {
      const t = i / 128 * Math.PI * 2;
      const v = c.clone().multiplyScalar(Math.cos(a)).addScaledVector(e1, Math.sin(a) * Math.cos(t)).addScaledVector(e2, Math.sin(a) * Math.sin(t)).multiplyScalar(1.006);
      arr[i * 3] = v.x; arr[i * 3 + 1] = v.y; arr[i * 3 + 2] = v.z;
    }
    reachGeo.attributes.position.needsUpdate = true;
    reach.computeLineDistances();
  }

  /* ---------------- geostationary orbit ring (6.62 R⊕, Earth's equatorial plane) */
  const geoPts = [];
  for (let i = 0; i <= 160; i++) { const t = i / 160 * Math.PI * 2; geoPts.push(new THREE.Vector3(6.62 * Math.cos(t), 0, 6.62 * Math.sin(t))); }
  const geoRing = new THREE.Line(new THREE.BufferGeometry().setFromPoints(geoPts),
    new THREE.LineDashedMaterial({ color: 0x9fb4ff, dashSize: 0.35, gapSize: 0.25, transparent: true, opacity: 0.45, depthWrite: false }));
  geoRing.computeLineDistances();
  earthRoot.add(geoRing);

  /* ---------------- magnetopause + bow shock surfaces (shape computed in the vertex shader) */
  function shellGeo(nt, np) {
    const g = new THREE.BufferGeometry();
    const tp = new Float32Array((nt + 1) * (np + 1) * 2), idx = [];
    for (let i = 0; i <= nt; i++) for (let j = 0; j <= np; j++) { const k = (i * (np + 1) + j) * 2; tp[k] = i / nt; tp[k + 1] = j / np * Math.PI * 2; }
    for (let i = 0; i < nt; i++) for (let j = 0; j < np; j++) {
      const a = i * (np + 1) + j, b = a + np + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array((nt + 1) * (np + 1) * 3), 3));
    g.setAttribute("aTP", new THREE.BufferAttribute(tp, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(20, 0, 0), 120);
    return g;
  }
  const SHAPE = {
    mp: "float r = uR0 * pow(2.0 / (1.0 + cos(th)), uAlpha);",
    bs: "float r = uRbs * 1.81 / (1.0 + 0.81 * cos(th));"
  };
  function shellMat(kind) {
    const mp = kind === "mp";
    return new THREE.ShaderMaterial({
      uniforms: U, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */`
        uniform float uR0, uAlpha, uRbs, uThMP, uThBS, uRhoMax;
        attribute vec2 aTP;
        varying vec3 vP; varying vec3 vN; varying float vTh; varying float vX;
        vec3 at(float th, float ph) {
          ${mp ? SHAPE.mp : SHAPE.bs}
          float rho = r * sin(th);
          ${mp ? "rho = rho < uRhoMax * 0.8 ? rho : uRhoMax * 0.8 + (uRhoMax * 0.2) * tanh((rho - uRhoMax * 0.8) / (uRhoMax * 0.2));" : ""}
          return vec3(-r * cos(th), rho * cos(ph), rho * sin(ph));
        }
        void main() {
          float th = aTP.x * ${mp ? "uThMP" : "uThBS"}, ph = aTP.y;
          vec3 p = at(th, ph);
          vec3 dT = at(th + 0.01, ph) - p, dP = at(max(th, 0.02), ph + 0.01) - at(max(th, 0.02), ph);
          vN = normalize(mat3(modelMatrix) * cross(dT, dP));
          vTh = th; vX = p.x;
          vec4 wp = modelMatrix * vec4(p, 1.0); vP = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: /* glsl */`
        uniform float uTime, uSouth, uSpd, uR0;
        varying vec3 vP; varying vec3 vN; varying float vTh; varying float vX;
        void main() {
          vec3 V = normalize(cameraPosition - vP);
          float f = 1.0 - abs(dot(normalize(vN), V));
          float rim = pow(f, ${mp ? "2.6" : "3.4"});
          float fadeTail = 1.0 - smoothstep(${mp ? "18.0, 44.0" : "6.0, 34.0"}, vX);
          float nose = exp(-vTh * vTh / ${mp ? "0.35" : "0.5"});
          // flow striations sliding tailward along the surface
          float s = 0.5 + 0.5 * sin(vTh * ${mp ? "38.0" : "26.0"} - uTime * uSpd * 0.25);
          vec3 base = ${mp ? "mix(vec3(0.35, 0.55, 1.0), vec3(0.62, 0.45, 1.0), smoothstep(0.3, 1.8, vTh))" : "mix(vec3(1.0, 0.72, 0.35), vec3(0.95, 0.5, 0.35), smoothstep(0.2, 1.4, vTh))"};
          float k = (rim * ${mp ? "0.62" : "0.42"} + nose * ${mp ? "0.1" : "0.07"}) * (0.72 + 0.28 * s) * fadeTail;
          vec3 col = base * k;
          ${mp ? "col += vec3(1.0, 0.25, 0.5) * uSouth * exp(-vTh * vTh / 0.08) * (0.6 + 0.6 * rim) * (0.75 + 0.25 * sin(uTime * 3.0));" : ""}
          gl_FragColor = vec4(col, 1.0);
        }`
    });
  }
  const mpMesh = new THREE.Mesh(shellGeo(110, 96), shellMat("mp"));
  const bsMesh = new THREE.Mesh(shellGeo(90, 96), shellMat("bs"));
  mpMesh.renderOrder = 5; bsMesh.renderOrder = 6;
  mpMesh.frustumCulled = bsMesh.frustumCulled = false;
  scene.add(mpMesh, bsMesh);

  /* ---------------- dipole field lines, squeezed on the dayside and stretched into the tail */
  const fieldMat = new THREE.LineBasicMaterial({ color: 0x7cc8ff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending });
  const lobeMat = new THREE.LineBasicMaterial({ color: 0xb18cff, transparent: true, opacity: 0.26, depthWrite: false, blending: THREE.AdditiveBlending });
  const fieldGroup = new THREE.Group();
  scene.add(fieldGroup);
  function buildField(r0, alpha) {
    for (const c of fieldGroup.children.slice()) { c.geometry.dispose(); fieldGroup.remove(c); }
    const squeeze = Math.min(1.15, Math.max(0.45, r0 / 10.5));
    const phis = [0, Math.PI];               // noon–midnight meridian …
    for (const ph of [0.55, -0.55, Math.PI - 0.55, Math.PI + 0.55]) phis.push(ph);   // … and a few off-plane
    for (const ph of phis) {
      const main = Math.abs(Math.sin(ph)) < 0.1;
      for (const L of main ? [2, 3, 4.4, 6, 7.6] : [3, 5]) {
        const lm = Math.acos(Math.sqrt(1 / L));
        const pts = [];
        for (let i = 0; i <= 90; i++) {
          const lat = -lm + (2 * lm) * i / 90;
          const r = L * Math.cos(lat) ** 2;
          const rho = r * Math.cos(lat), y = r * Math.sin(lat);
          let x = -rho * Math.cos(ph), z = rho * Math.sin(ph);
          if (x < 0) x *= Math.min(1, squeeze * (1 + 0.04 * (8 - L)));
          else x *= 1 + 0.1 * Math.max(0, L - 3) * (1 + 0.4 * (1 - squeeze));
          pts.push(new THREE.Vector3(x, y, z));
        }
        fieldGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), fieldMat));
      }
    }
    // open "lobe" field lines from the polar caps into the magnetotail
    const tailR = Math.min(30, 1.5 * P.shueR(r0, alpha, Math.PI / 2)) * 0.95;
    for (const hemi of [1, -1]) for (const [k, zz] of [[0.35, 0], [0.55, 0], [0.75, 0], [0.5, 4], [0.5, -4]]) {
      const colat = (10 + 9 * k) * P.DEG;
      const p0 = new THREE.Vector3(Math.sin(colat) * 0.2, hemi * Math.cos(colat), zz * 0.02);
      const p1 = new THREE.Vector3(1.5 + 3 * k, hemi * (4 + 6 * k), zz * 0.4);
      const p2 = new THREE.Vector3(18, hemi * tailR * (0.3 + 0.35 * k), zz * 0.8);
      const p3 = new THREE.Vector3(70, hemi * tailR * (0.22 + 0.4 * k) * 1.05, zz);
      const cv = new THREE.CubicBezierCurve3(p0, p1, p2, p3);
      fieldGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(cv.getPoints(60)), lobeMat));
    }
  }

  /* ---------------- solar-wind streaks along analytic streamlines */
  const NW = mobile() ? 5200 : 9000;
  const windMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uSpd, uFrac, uNear, uX0, uXb, uX1, uRhoMP[${NPROF}], uRhoBS[${NPROF}];
      attribute vec4 aW;           // b, phi, phase, seed
      attribute float aEnd;        // 0 = head, 1 = tail
      varying float vA; varying float vHot;
      float prof(float x, float x0, float arr[${NPROF}]) {
        if (x <= x0) return 0.0;
        float f = clamp((x - x0) / (uX1 - x0), 0.0, 1.0) * float(${NPROF - 1});
        int i = int(floor(f)); int j = min(i + 1, ${NPROF - 1});
        return mix(arr[i], arr[j], fract(f));
      }
      void main() {
        float L = ${(XE - XS).toFixed(1)};
        float seed = aW.w;
        float spd = uSpd * (0.85 + 0.3 * fract(seed * 7.13));
        float xh = ${XS.toFixed(1)} + mod(aW.z * L + uTime * spd, L);
        float len = clamp(spd * 0.11, 0.6, 6.0);
        float x = xh - aEnd * len;
        float b = aW.x;
        float rmp = prof(x, uX0, uRhoMP);
        float rbs = prof(x, uXb, uRhoBS);
        float rho = sqrt(b * b + rmp * rmp * 1.02);
        float hot = step(uXb, x) * step(rho, rbs);            // inside the magnetosheath
        vec3 p = vec3(x, rho * cos(aW.y), rho * sin(aW.y));
        vHot = hot;
        float edge = smoothstep(${XS.toFixed(1)}, ${(XS + 12).toFixed(1)}, x) * (1.0 - smoothstep(${(XE - 18).toFixed(1)}, ${XE.toFixed(1)}, x));
        vA = (1.0 - aEnd) * edge * step(seed, uFrac) * (0.55 + 0.45 * fract(seed * 13.7)) * uNear * (1.0 - smoothstep(24.0, 34.0, b));
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      varying float vA; varying float vHot;
      void main() {
        vec3 c = mix(vec3(1.0, 0.86, 0.62), vec3(1.0, 0.55, 0.35), vHot);
        gl_FragColor = vec4(c * vA * (0.55 + 0.6 * vHot), 1.0);
      }`
  });
  {
    const g = new THREE.BufferGeometry();
    const aW = new Float32Array(NW * 2 * 4), aEnd = new Float32Array(NW * 2), pos = new Float32Array(NW * 2 * 3);
    for (let i = 0; i < NW; i++) {
      // impact parameters weighted towards the axis so the flow around the magnetosphere reads clearly
      const b = 34 * Math.pow(Math.random(), 0.72), ph = Math.random() * Math.PI * 2, z = Math.random(), s = Math.random();
      for (let e = 0; e < 2; e++) { aW.set([b, ph, z, s], (i * 2 + e) * 4); aEnd[i * 2 + e] = e; }
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aW", new THREE.BufferAttribute(aW, 4));
    g.setAttribute("aEnd", new THREE.BufferAttribute(aEnd, 1));
    const ls = new THREE.LineSegments(g, windMat);
    ls.frustumCulled = false; ls.renderOrder = 2;
    scene.add(ls);
  }

  /* ---------------- the Sun (not to scale) with radial outflow */
  const sunGroup = new THREE.Group();
  sunGroup.position.set(SUN_X, 0, 0);
  scene.add(sunGroup);
  const sunMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime },
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vL; varying vec3 vP;
      void main() { vN = normalize(mat3(modelMatrix) * normal); vL = position; vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; varying vec3 vN; varying vec3 vL; varying vec3 vP;
      float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      float vn(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                   mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z); }
      void main() {
        vec3 q = normalize(vL) * 3.0;
        float g = vn(q * 4.0 + uTime * 0.05) * 0.55 + vn(q * 11.0 - uTime * 0.08) * 0.3 + vn(q * 27.0) * 0.15;
        float spots = smoothstep(0.78, 0.86, vn(q * 1.3 + 4.0));
        float mu = abs(dot(normalize(vN), normalize(cameraPosition - vP)));
        float limb = 0.35 + 0.65 * pow(mu, 0.5);                      // limb darkening
        vec3 col = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.72, 0.3), g) * limb * (1.0 - 0.6 * spots) * 1.25;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  sunGroup.add(new THREE.Mesh(new THREE.SphereGeometry(SUN_R, 96, 64), sunMat));
  const glow = G.makeSun(); glow.scale.setScalar(SUN_R * 14); sunGroup.add(glow);
  const glow2 = G.makeSun(); glow2.scale.setScalar(SUN_R * 40); glow2.material.opacity = 0.35; sunGroup.add(glow2);
  const NS = mobile() ? 2400 : 4200;
  const outMat = new THREE.ShaderMaterial({
    uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      uniform float uTime, uSpd, uFrac;
      attribute vec4 aD; attribute float aEnd;
      varying float vA;
      void main() {
        float L = ${(Math.abs(SUN_X) + 40).toFixed(1)};
        float d = ${(SUN_R * 1.05).toFixed(2)} + mod(aD.w * L + uTime * uSpd * 1.6, L);
        float len = clamp(uSpd * 0.25, 2.0, 12.0);
        d -= aEnd * len;
        vec3 p = normalize(aD.xyz) * max(d, ${(SUN_R * 1.02).toFixed(2)});
        vA = (1.0 - aEnd) * (1.0 - smoothstep(L * 0.55, L, d)) * step(fract(aD.w * 91.7), uFrac * 0.8 + 0.2) * 0.55;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`varying float vA; void main() { gl_FragColor = vec4(vec3(1.0, 0.8, 0.5) * vA, 1.0); }`
  });
  {
    const g = new THREE.BufferGeometry();
    const aD = new Float32Array(NS * 2 * 4), aEnd = new Float32Array(NS * 2);
    for (let i = 0; i < NS; i++) {
      const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
      const d = [s * Math.cos(t), u * 0.7, s * Math.sin(t)], w = Math.random();
      for (let e = 0; e < 2; e++) { aD.set([...d, w], (i * 2 + e) * 4); aEnd[i * 2 + e] = e; }
    }
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NS * 2 * 3), 3));
    g.setAttribute("aD", new THREE.BufferAttribute(aD, 4));
    g.setAttribute("aEnd", new THREE.BufferAttribute(aEnd, 1));
    const ls = new THREE.LineSegments(g, outMat); ls.frustumCulled = false;
    sunGroup.add(ls);
  }

  let clock = 0;               // IMF clock angle (radians, 0 = northward)

  /* ---------------- L1 monitor marker (drawn far closer than reality) */
  const l1 = new THREE.Sprite(new THREE.SpriteMaterial({ map: pinTex, color: 0x9fd8ff, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, toneMapped: false }));
  l1.position.set(-60, 0, 0); l1.scale.setScalar(1.6);
  scene.add(l1);

  /* ---------------- CME cloud */
  const cmeMat = new THREE.ShaderMaterial({
    uniforms: { uTime: U.uTime, uA: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */`varying vec3 vN; varying vec3 vP; varying vec3 vL;
      void main() { vN = normalize(mat3(modelMatrix) * normal); vL = position; vec4 wp = modelMatrix * vec4(position, 1.0); vP = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`uniform float uTime, uA; varying vec3 vN; varying vec3 vP; varying vec3 vL;
      float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
      void main() {
        float f = 1.0 - abs(dot(normalize(vN), normalize(cameraPosition - vP)));
        float front = smoothstep(-0.2, 0.9, normalize(vL).x);        // bright leading edge
        float n = 0.7 + 0.3 * sin(vL.y * 9.0 + uTime * 2.0) * sin(vL.z * 7.0 - uTime);
        vec3 col = mix(vec3(1.0, 0.45, 0.25), vec3(1.0, 0.8, 0.55), front) * pow(f, 1.6) * (0.35 + 0.9 * front) * n * uA;
        gl_FragColor = vec4(col, 1.0);
      }`
  });
  const cme = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 40), cmeMat);
  cme.visible = false;
  scene.add(cme);

  /* ================================================================ state + physics coupling */
  const S = { v: 400, n: 5, bz: 0, by: 0, bt: 5, T: 1e5, r0: 10, alpha: 0.58, rbs: 12.8, dp: 1.3, mach: 8 };
  const shown = { r0: 10, alpha: 0.58, rbs: 12.8, spd: 10, frac: 0.4, south: 0 };   // eased values actually drawn
  let target = { ...shown };
  let override = null;          // CME demo override of the live values
  let lastField = { r0: 0, alpha: 0 };

  function thetaForX(xmax, f) {           // θ where the surface reaches x = xmax (bisection)
    let lo = 1.2, hi = Math.PI - 1e-3;
    for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (-f(m) * Math.cos(m) < xmax) lo = m; else hi = m; }
    return lo;
  }
  function profiles() {
    const r0 = shown.r0, al = shown.alpha, rbs = shown.rbs;
    const fm = (t) => P.shueR(r0, al, t), fb = (t) => P.bowR(rbs, t);
    U.uR0.value = r0; U.uAlpha.value = al; U.uRbs.value = rbs;
    U.uThMP.value = thetaForX(46, fm); U.uThBS.value = thetaForX(36, fb);
    const rhoMax = Math.min(30, 1.5 * P.shueR(r0, al, Math.PI / 2)); U.uRhoMax.value = rhoMax;
    U.uX0.value = -r0; U.uXb.value = -rbs; U.uX1.value = XE;
    const solve = (f, x, x0) => {   // cylindrical radius of the surface at axial position x
      if (x <= x0) return 0;
      let lo = 0, hi = Math.PI - 1e-3;
      for (let i = 0; i < 30; i++) { const m = (lo + hi) / 2; if (-f(m) * Math.cos(m) < x) lo = m; else hi = m; }
      return f(lo) * Math.sin(lo);
    };
    for (let i = 0; i < NPROF; i++) {
      const rm = solve(fm, -r0 + (XE + r0) * i / (NPROF - 1), -r0);
      U.uRhoMP.value[i] = rm < rhoMax * 0.8 ? rm : rhoMax * 0.8 + rhoMax * 0.2 * Math.tanh((rm - rhoMax * 0.8) / (rhoMax * 0.2));
      U.uRhoBS.value[i] = solve(fb, -rbs + (XE + rbs) * i / (NPROF - 1), -rbs);
    }
  }

  function computeTarget() {
    const w = override || S;
    const dp = P.dynPressure(w.n, w.v);
    const sh = P.shue(w.bz, dp);
    const mach = P.machMS(w.v, w.n, w.bt, w.T);
    const rbs = P.bowShock(sh.r0, mach);
    Object.assign(S, override ? {} : { dp, r0: sh.r0, alpha: sh.alpha, rbs, mach });
    target = {
      r0: sh.r0, alpha: sh.alpha, rbs,
      spd: Math.max(3, Math.min(40, (w.v || 400) / 400 * 9)),
      frac: Math.max(0.12, Math.min(1, (w.n || 5) / 22 + 0.1)),
      south: Math.max(0, Math.min(1, -(w.bz || 0) / 15))
    };
    clock = Math.atan2(w.by || 0, w.bz || 0);
    return { dp, ...sh, rbs, mach };
  }
  const kick = () => { budget = 40; };
  function setWind(w) { Object.assign(S, w); kick(); return computeTarget(); }

  function setAurora(u8) { if (u8 && u8.length === gridData.length) { gridData.set(u8); gridTex.needsUpdate = true; kick(); } }

  /* ================================================================ views */
  const VIEWS = {
    magnetosphere: { t: [9, 0, 0], p: [-26, 38, 118] },
    system: { t: [-112, 0, 0], p: [-60, 128, 352] },
    aurora: null
  };
  let view = "magnetosphere";
  function auroraPose() {
    // look down at the observer from above their pole, so their sky and the oval share the frame
    const hemi = obs.lat < 0 ? -1 : 1;
    const up = new THREE.Vector3(0, hemi, 0).applyQuaternion(earthRoot.quaternion);
    const o = pin.getWorldPosition(new THREE.Vector3()).normalize();
    const p = o.clone().multiplyScalar(0.75).addScaledVector(up, 0.85).normalize().multiplyScalar(4.3);
    return { t: [0, 0, 0], p: p.toArray() };
  }
  function fit(p, t) {                  // pull the camera back on tall/narrow screens
    const asp = camera.aspect;
    const k = asp < 1.1 ? Math.min(2.2, 0.95 / asp) : 1;
    const d = new THREE.Vector3(...p).sub(new THREE.Vector3(...t)).multiplyScalar(k);
    return new THREE.Vector3(...t).add(d);
  }
  function setView(name, instant) {
    view = name; kick();
    const v = name === "aurora" ? auroraPose() : VIEWS[name];
    const to = fit(v.p, v.t), tt = new THREE.Vector3(...v.t);
    const gsap = window.gsap;
    if (instant || !gsap || reduced) { camera.position.copy(to); controls.target.copy(tt); controls.update(); return; }
    gsap.killTweensOf(camera.position); gsap.killTweensOf(controls.target);
    gsap.to(camera.position, { x: to.x, y: to.y, z: to.z, duration: 2.2, ease: "power3.inOut" });
    gsap.to(controls.target, { x: tt.x, y: tt.y, z: tt.z, duration: 2.2, ease: "power3.inOut" });
  }

  /* ================================================================ CME demo */
  const cmeState = { on: false, t0: 0, dur: 9, v: 1500, arrived: false, onUpdate: null, onDone: null };
  function launchCME(v, cbs = {}) {
    budget = 1e9;
    Object.assign(cmeState, { on: true, t0: simT, v, arrived: false, onUpdate: cbs.onUpdate, onDone: cbs.onDone, onArrive: cbs.onArrive });
    cmeState.dur = Math.max(4, Math.min(12, P.travelHours(v) / 7));   // seconds of animation
    cme.visible = true;
    setView("system");
  }
  function stepCME() {
    if (!cmeState.on) return;
    const k = (simT - cmeState.t0) / cmeState.dur;                  // 0 at launch … 1 when the front reaches Earth
    const span = Math.abs(SUN_X) - SUN_R;
    const front = SUN_R + span * Math.min(k, 1.25);                 // distance of the leading edge from the Sun
    const rad = Math.max(2, front * 0.4);
    cme.position.set(SUN_X + front - rad * 0.75, 0, 0);
    cme.scale.set(rad * 0.75, rad, rad);
    cmeMat.uniforms.uA.value = Math.min(1, k * 6) * (1 - Math.max(0, (k - 1) / 0.25));
    if (cmeState.onUpdate) cmeState.onUpdate(Math.min(1, k), P.travelHours(cmeState.v) * Math.min(1, k));
    if (!cmeState.arrived && SUN_X + front >= -S.rbs) {
      cmeState.arrived = true;
      override = { v: cmeState.v, n: 32, bz: -28, by: 5, bt: 35, T: 4e5 };   // a typical fast-CME sheath, for the demo
      computeTarget();
      U.uBoost.value = 2.6;
      setView("magnetosphere");
      if (cmeState.onArrive) cmeState.onArrive(target);
    }
    if (k > 1.25) { cme.visible = false; }
    if (k > 2.6) {
      cmeState.on = false; cme.visible = false; override = null; computeTarget(); U.uBoost.value = 1;
      if (cmeState.onDone) cmeState.onDone();
    }
  }

  /* ================================================================ labels + loop */
  const anchors = {
    bow: new THREE.Vector3(), mp: new THREE.Vector3(), tail: new THREE.Vector3(38, 0, 0), wind: new THREE.Vector3(-46, 16, 0),
    l1: l1.position, geo: new THREE.Vector3(), sun: new THREE.Vector3(SUN_X, SUN_R * 1.5, 0), earth: new THREE.Vector3(0, -1.3, 0), obs: new THREE.Vector3()
  };
  const proj = new THREE.Vector3();
  function screenOf(v) {
    proj.copy(v).project(camera);
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const x = (proj.x * 0.5 + 0.5) * w, y = (-proj.y * 0.5 + 0.5) * h;
    return { x, y, vis: proj.z < 1 && x > 8 && x < w - 60 && y > 8 && y < h - 20 };
  }

  let lastDraw = 0, budget = 40, simT = 0, last = performance.now(), running = true, raf = 0, onFrame = null, simMs = Date.now(), frames = 0;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!running || (still && budget <= 0)) { last = now; return; }
    if (software && now - lastDraw < 250) return;
    lastDraw = now;
    if (still) budget--;          // ?still: render a burst of frames after each change, then idle (cheap screenshots)
    // clamp at 0: the first rAF timestamp can predate `last` after a long scene build, and a negative dt makes the easing overshoot wildly
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    if (!still || cmeState.on) simT += dt;
    frames++;
    U.uTime.value = simT;
    // ease the drawn values towards the physics
    const e = still ? 1 : 1 - Math.exp(-dt * (override ? 2.2 : 1.4));
    let moved = false;
    for (const k of ["r0", "alpha", "rbs", "spd", "frac", "south"]) {
      const d = target[k] - shown[k];
      if (Math.abs(d) > 1e-4) { shown[k] += d * e; moved = true; }
    }
    if (moved || frames === 1) profiles();
    U.uSpd.value = shown.spd; U.uFrac.value = shown.frac; U.uSouth.value = shown.south;
    if (Math.abs(shown.r0 - lastField.r0) > 0.25 || Math.abs(shown.alpha - lastField.alpha) > 0.02) {
      buildField(shown.r0, shown.alpha); lastField = { r0: shown.r0, alpha: shown.alpha };
    }
    if (!override && U.uBoost.value > 1) U.uBoost.value = Math.max(1, U.uBoost.value - dt * 0.4);
    // per-view fades: near-Earth streaks and field lines give way to the globe in the aurora view
    const wantNear = view === "aurora" ? 0.12 : view === "system" ? 0.45 : 1;
    U.uNear.value += (wantNear - U.uNear.value) * Math.min(1, dt * 3 + (still ? 1 : 0));
    fieldMat.opacity = 0.32 * (view === "aurora" ? 0.15 : 1); lobeMat.opacity = 0.26 * (view === "aurora" ? 0.1 : 1);
    stepCME();
    // Earth orientation follows real time (or the sample's moment)
    orientEarth(simMs + (still ? 0 : simT * 1000));
    const camD = camera.position.length();
    E.update(camD);
    geoRing.material.color.set(shown.r0 < 6.62 ? 0xff6a6a : 0x9fb4ff);
    geoRing.material.opacity = shown.r0 < 6.62 ? 0.85 : 0.4;
    pin.scale.setScalar(Math.max(0.05, Math.min(0.5, camD * 0.02)));
    reach.visible = camD < 12;
    controls.update();
    renderer.render(scene, camera);
    if (onFrame) {
      const rb = P.bowR(shown.rbs, 1.05), rm = P.shueR(shown.r0, shown.alpha, 1.25);
      anchors.bow.set(-rb * Math.cos(1.05), rb * Math.sin(1.05), 0);
      anchors.mp.set(-rm * Math.cos(1.25), -rm * Math.sin(1.25), 0);
      // label the geostationary ring on its night-side (downwind) point
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(earthRoot.quaternion);
      anchors.geo.set(1, 0, 0.35).addScaledVector(up, -new THREE.Vector3(1, 0, 0.35).dot(up)).setLength(6.62);
      pin.getWorldPosition(anchors.obs);
      const L = {};
      for (const k in anchors) L[k] = screenOf(anchors[k]);
      L.obs.vis = L.obs.vis && camD < 12 && anchors.obs.clone().sub(camera.position).dot(anchors.obs) < 0;   // facing us
      onFrame(L, { camD, view, shown });
    }
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h);
    budget = 40;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    stars.material.uniforms.uPx.value = renderer.getPixelRatio();
  }
  new ResizeObserver(() => resize()).observe(stage);

  controls.addEventListener("change", () => { if (budget < 5) budget = 5; });
  controls.addEventListener("start", () => { if (window.gsap) { window.gsap.killTweensOf(camera.position); window.gsap.killTweensOf(controls.target); } });

  setObserver(obs.lat, obs.lon, obs.reach);
  computeTarget();
  Object.assign(shown, target);
  profiles(); buildField(shown.r0, shown.alpha); lastField = { r0: shown.r0, alpha: shown.alpha };
  setView("magnetosphere", true);
  raf = requestAnimationFrame(frame);

  return {
    renderer, camera, controls, S, shown, U, scene,
    setWind, setAurora, setObserver, setView, launchCME,
    get view() { return view; },
    get cmeOn() { return cmeState.on; },
    setTime(ms) { simMs = ms; budget = 40; },
    kick,
    setRunning(r) { running = r; },
    onFrame(fn) { onFrame = fn; },
    target: () => target
  };
}
