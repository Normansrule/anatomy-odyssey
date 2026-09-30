/* Deep Space Network, live: the 3D Earth, the three complexes and their beams (three.js r186).
 *
 * World frame: Earth-Centred Inertial (ECI) mapped to three.js as (x, y, z) = (x, z, −y)_ECI in Earth
 * radii, exactly as earth-globe.js does (+Y is the north pole; the Earth-fixed group turns about +Y by
 * Greenwich Mean Sidereal Time). The Earth itself (textures, clouds, atmosphere, stars, Sun) is the
 * site's shared globe from earth-globe.js.
 *
 * Beams: each dish's azimuth/elevation from the DSN Now feed is turned into a sky direction (right
 * ascension and declination) at the feed's timestamp. A deep-space target is so far away that this
 * direction is fixed among the stars, so the beam keeps pointing there while the dish rides Earth's
 * rotation, and fades out if the target sets. Beam LENGTH is logarithmic in range (Moon ≈ 1.4 R⊕,
 * Voyager ≈ 3 R⊕): nothing here is to scale. Pulses run outward for the uplink and inward for the
 * downlink; their travel time grows with log10(one-way light time) so the Moon flickers and Voyager crawls.
 *
 * Coverage ring: in the equatorial plane, each complex's arc is the slice of the equatorial sky it sees
 * above the elevation mask (hour angle within ±acos(sin e / cos φ)); where arcs overlap, both can track.
 */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import * as G from "./earth-globe.js";
import * as D from "./dsn-data.js";

const D2R = Math.PI / 180;
const Y = new THREE.Vector3(0, 1, 0);

/** Equatorial RA/Dec (deg) → world unit vector (ECI → three mapping). */
export function raDecToWorld(ra, dec, out = new THREE.Vector3()) {
  const a = ra * D2R, d = dec * D2R;
  return out.set(Math.cos(d) * Math.cos(a), Math.sin(d), -Math.cos(d) * Math.sin(a));
}

/* ------------------------------------------------------------------ beam material (billboarded ribbon) */
const BEAM_VS = /* glsl */`
  attribute float aT; attribute float aS;
  uniform vec3 uA; uniform vec3 uDir; uniform float uLen; uniform float uWidth; uniform float uHi;
  varying float vT; varying float vS;
  void main() {
    vec3 P = uA + uDir * (aT * uLen);
    vec3 toCam = normalize(cameraPosition - P);
    vec3 side = cross(uDir, toCam);
    float sl = length(side);
    side = sl > 1e-4 ? side / sl : vec3(0.0, 1.0, 0.0);
    float w = uWidth * (1.0 + aT * 3.0) * (1.0 + uHi * 0.6);
    P += side * aS * w;
    vT = aT; vS = aS;
    gl_Position = projectionMatrix * viewMatrix * vec4(P, 1.0);
  }`;
const BEAM_FS = /* glsl */`
  uniform vec3 uColor; uniform float uTime; uniform float uSpd; uniform float uUp; uniform float uDown;
  uniform float uFade; uniform float uHi; uniform float uIdle;
  varying float vT; varying float vS;
  void main() {
    float across = 1.0 - abs(vS);
    float core = pow(across, 7.0);
    float glow = pow(across, 1.6);
    float along = smoothstep(0.0, 0.035, vT) * (1.0 - smoothstep(0.55, 1.0, vT));
    float sp = 0.2;
    float uu = fract((vT - uTime * uSpd) / sp);             // outward: head at uu → 1
    float ud = fract((vT + uTime * uSpd + 0.37) / sp);      // inward: head at ud → 0
    float pUp = uUp * pow(uu, 14.0) * smoothstep(0.0, 0.04, vT);
    float pDn = uDown * pow(1.0 - ud, 10.0) * 0.8;
    float dash = uIdle > 0.5 ? step(0.5, fract(vT * 18.0)) : 1.0;
    vec3 base = uColor * (glow * (0.22 + 0.3 * uHi) + core * (0.7 + 0.8 * uHi)) * along * dash;
    vec3 up = vec3(1.0, 0.86, 0.62) * pUp * (core * 2.4 + glow * 0.6) * (1.0 - smoothstep(0.8, 1.0, vT));
    vec3 dn = mix(uColor, vec3(1.0), 0.55) * pDn * (core * 2.2 + glow * 0.5) * smoothstep(0.0, 0.08, vT) * (1.0 - smoothstep(0.85, 1.0, vT));
    vec3 c = (base + up + dn) * uFade;
    gl_FragColor = vec4(c, 1.0);
  }`;
function ribbonGeometry(n = 64) {
  const pos = new Float32Array((n + 1) * 2 * 3), t = new Float32Array((n + 1) * 2), s = new Float32Array((n + 1) * 2);
  const idx = [];
  for (let i = 0; i <= n; i++) {
    t[i * 2] = t[i * 2 + 1] = i / n; s[i * 2] = -1; s[i * 2 + 1] = 1;
    if (i < n) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("aT", new THREE.BufferAttribute(t, 1));
  g.setAttribute("aS", new THREE.BufferAttribute(s, 1));
  g.setIndex(idx);
  return g;
}

/* ------------------------------------------------------------------ glowing tips (one Points object) */
function makeTips(maxN) {
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(maxN * 3), col = new Float32Array(maxN * 3), a = new Float32Array(maxN);
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aColor", new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("aA", new THREE.BufferAttribute(a, 1).setUsage(THREE.DynamicDrawUsage));
  g.setDrawRange(0, 0);
  const m = new THREE.ShaderMaterial({
    uniforms: { uPx: { value: 1 }, uTime: { value: 0 } },
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec3 aColor; attribute float aA; uniform float uPx; uniform float uTime;
      varying vec3 vC; varying float vA;
      void main() {
        vC = aColor; vA = aA;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (16.0 + 3.0 * sin(uTime * 2.0 + position.x * 7.0)) * clamp(6.0 / -mv.z, 0.6, 1.6);
      }`,
    fragmentShader: /* glsl */`
      varying vec3 vC; varying float vA;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p);
        if (r > 1.0) discard;
        float c = smoothstep(0.32, 0.0, r) * 1.3 + exp(-r * r * 6.0) * 0.55;
        gl_FragColor = vec4(mix(vC, vec3(1.0), smoothstep(0.2, 0.0, r) * 0.7) * c * vA, 1.0);
      }`
  });
  const pts = new THREE.Points(g, m);
  pts.frustumCulled = false; pts.renderOrder = 6;
  return { pts, pos, col, a, geo: g, mat: m };
}

/* ------------------------------------------------------------------ the scene */
export function createScene(stage, opt) {
  const { tex, starData, complexes, clock, still, reduced } = opt;
  const mobile = () => innerWidth <= 820;
  const BURST = still ? 4 : 40;              // frames rendered after a change in ?still mode (cheap screenshots)
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
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
  renderer.domElement.setAttribute("aria-label", "3D Earth turning in real time with NASA's three Deep Space Network complexes, Goldstone, Madrid and Canberra. Glowing beams leave each busy dish towards the spacecraft it is talking to, with pulses running out for commands and in for data. A coloured ring around the equator shows the slice of sky each complex can see. Drag to rotate, scroll to zoom.");
  stage.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010207);
  const camera = new THREE.PerspectiveCamera(36, stage.clientWidth / stage.clientHeight, 0.01, 4000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.enablePan = false; controls.rotateSpeed = 0.5; controls.zoomSpeed = 0.8;
  controls.minDistance = 1.8; controls.maxDistance = 22;
  controls.autoRotate = !reduced && !still; controls.autoRotateSpeed = 0.35;

  /* stars, Sun, Earth */
  const stars = G.makeStars(starData);
  stars.material.uniforms.uPx.value = renderer.getPixelRatio();
  scene.add(stars);
  const sun = G.makeSun();
  scene.add(sun);
  const E = G.makeEarth(tex);
  scene.add(E.group);
  scene.add(E.atmo);
  scene.add(new THREE.AmbientLight(0x6070a0, 0.4));

  /* complexes: pulsing markers + coverage arcs, inside the Earth-fixed group */
  const markers = G.makeMarkers(complexes.length);
  markers.mat.uniforms.uPx.value = renderer.getPixelRatio();
  E.group.add(markers.points);
  const cxLocal = {}, cxColor = {};
  complexes.forEach((c, i) => {
    const p = G.llToLocal(c.lat, c.lon, 1.004);
    cxLocal[c.id] = p.clone();
    const col = new THREE.Color(c.color);
    cxColor[c.id] = col;
    markers.pos.set([p.x, p.y, p.z], i * 3);
    markers.col.set([col.r, col.g, col.b], i * 3);
    markers.phase[i] = i / complexes.length;
    markers.hot[i] = 0;
  });
  markers.geo.setDrawRange(0, complexes.length);
  markers.geo.attributes.position.needsUpdate = true;

  const mask = opt.mask ?? 10;
  const cover = new THREE.Group();
  E.group.add(cover);
  const coverArcs = {};
  const RING_R0 = 1.34, RING_R1 = 1.39;
  // faint full ring
  const baseRing = new THREE.Mesh(new THREE.RingGeometry(RING_R0 - 0.004, RING_R0, 256), new THREE.MeshBasicMaterial({ color: 0x8fa6ff, transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  baseRing.rotation.x = -Math.PI / 2; cover.add(baseRing);
  complexes.forEach((c, i) => {
    const half = D.hourAngleLimit(c.lat, 0, mask);                     // degrees of hour angle each side
    const r0 = RING_R0 + i * 0.012, r1 = RING_R1 + i * 0.012;
    const g = new THREE.RingGeometry(r0, r1, 160, 1, (c.lon - half) * D2R, 2 * half * D2R);
    // soft ends: fade the last few degrees via a vertex colour ramp
    const posA = g.attributes.position, colA = new Float32Array(posA.count * 3);
    for (let k = 0; k < posA.count; k++) {
      const ang = Math.atan2(posA.getY(k), posA.getX(k)) / D2R;
      const d = Math.abs(D.wrap180(ang - c.lon));
      const f = Math.max(0, Math.min(1, (half - d) / 6));
      colA[k * 3] = colA[k * 3 + 1] = colA[k * 3 + 2] = f;
    }
    g.setAttribute("color", new THREE.BufferAttribute(colA, 3));
    const m = new THREE.MeshBasicMaterial({ color: cxColor[c.id], vertexColors: true, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
    const arc = new THREE.Mesh(g, m);
    arc.rotation.x = -Math.PI / 2;
    cover.add(arc);
    coverArcs[c.id] = { arc, half };
    // a tick from the complex up to its arc centre
    const tickG = new THREE.BufferGeometry().setFromPoints([G.llToLocal(c.lat, c.lon, 1.01), G.llToLocal(0, c.lon, r0)]);
    const tick = new THREE.Line(tickG, new THREE.LineDashedMaterial({ color: cxColor[c.id], transparent: true, opacity: 0.45, dashSize: 0.025, gapSize: 0.02, depthWrite: false }));
    tick.computeLineDistances(); cover.add(tick);
  });

  /* beams */
  const beamGroup = new THREE.Group();
  scene.add(beamGroup);
  const ribbon = ribbonGeometry();
  let beams = [];
  const tips = makeTips(64);
  tips.mat.uniforms.uPx.value = renderer.getPixelRatio();
  scene.add(tips.pts);
  let selected = null;

  function makeBeamMesh(b) {
    const col = cxColor[b.station] || new THREE.Color(0x7cc8ff);
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uA: { value: new THREE.Vector3() }, uDir: { value: new THREE.Vector3() }, uLen: { value: 1 },
        uWidth: { value: 0.0065 }, uColor: { value: col.clone() }, uTime: { value: 0 },
        uSpd: { value: 1 }, uUp: { value: 0 }, uDown: { value: 0 },
        uFade: { value: 0 }, uHi: { value: 0 }, uIdle: { value: 0 }
      },
      vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const mesh = new THREE.Mesh(ribbon, mat);
    mesh.frustumCulled = false; mesh.renderOrder = 5;
    beamGroup.add(mesh);
    return mesh;
  }
  /** Update beams in place, keyed by dish, so a 5-second refresh never restarts their fade or pulses. */
  function setBeams(list) {
    const old = new Map(beams.map((b) => [b.key, b]));
    beams = list.map((b) => {
      const prev = old.get(b.key);
      old.delete(b.key);
      const mesh = prev && prev.station === b.station ? prev.mesh : makeBeamMesh(b);
      if (prev && prev.mesh !== mesh) { beamGroup.remove(prev.mesh); prev.mesh.material.dispose(); }
      const u = mesh.material.uniforms;
      raDecToWorld(b.ra, b.dec, u.uDir.value);
      u.uLen.value = b.len; u.uSpd.value = 1 / b.tvis;
      u.uUp.value = b.up ? 1 : 0; u.uDown.value = b.down ? 1 : 0; u.uIdle.value = b.up || b.down ? 0 : 1;
      u.uHi.value = selected === b.key ? 1 : 0;
      return { ...b, mesh, dir: u.uDir.value, origin: new THREE.Vector3(), tip: new THREE.Vector3(), fade: prev && prev.mesh === mesh ? prev.fade : 0, fadeT: 0 };
    });
    for (const b of old.values()) { beamGroup.remove(b.mesh); b.mesh.material.dispose(); }
    const hot = {};
    for (const b of beams) if (b.up || b.down) hot[b.station] = 1;
    complexes.forEach((c, i) => { markers.hot[i] = hot[c.id] ? 1 : 0; });
    markers.geo.attributes.aHot.needsUpdate = true;
    tips.geo.setDrawRange(0, Math.min(64, beams.length));
    budget = BURST;
  }

  /* camera framing: Earth sits left of centre on wide screens, beams fan out to the right */
  function frameView() {
    const w = stage.clientWidth, h = stage.clientHeight;
    camera.aspect = w / h;
    if (!mobile() && w > 900) {
      const shift = Math.round(w * 0.1);
      camera.setViewOffset(w + shift, h, shift, 0, w, h);
    } else if (mobile()) {
      camera.setViewOffset(w, h * 1.08, 0, h * 0.08, w, h);
    } else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }
  const camDist = () => (mobile() ? 10.2 : 9.2);
  function lookFrom(dirWorld, dist = camDist(), lift = 0.32) {
    const d = dirWorld.clone().normalize();
    d.y += lift; d.normalize();
    return d.multiplyScalar(dist);
  }
  function flyTo(pos, dur = 1.6) {
    const g = window.gsap;
    if (!g || reduced || still) { camera.position.copy(pos); controls.update(); budget = BURST; return; }
    g.killTweensOf(camera.position);
    const start = camera.position.clone(), r0 = start.length(), r1 = pos.length();
    const a = start.clone().normalize(), b = pos.clone().normalize();
    const o = { k: 0 };
    g.to(o, { k: 1, duration: dur, ease: "power2.inOut", onUpdate() {
      const v = a.clone().lerp(b, o.k);
      if (v.lengthSq() < 1e-6) v.copy(b);
      camera.position.copy(v.normalize().multiplyScalar(r0 + (r1 - r0) * o.k));
      budget = 10;
    } });
  }
  function complexWorld(id, out = new THREE.Vector3()) {
    return out.copy(cxLocal[id]).applyAxisAngle(Y, E.group.rotation.y);
  }
  function focusComplex(id, instant) {
    if (!cxLocal[id]) return;
    E.group.rotation.y = D.gmstDeg(clock()) * D2R;          // the loop may not have run yet
    E.group.updateMatrixWorld();
    const p = complexWorld(id);
    // look at the complex from the side (east or west, whichever is more sunlit) so its beams fan across the view
    const s = D.sunRaDec(clock());
    const toSun = raDecToWorld(s.ra, s.dec);
    const side = new THREE.Vector3().crossVectors(Y, p).normalize();
    if (side.dot(toSun) < 0) side.negate();
    side.multiplyScalar(0.95);
    const dir = p.clone().normalize().add(side);
    const pos = lookFrom(dir, camDist(), cxLocal[id].y * 0.35 + 0.18);
    if (instant) { camera.position.copy(pos); controls.update(); } else flyTo(pos);
  }
  function focusBeam(key) {
    selected = key;
    const b = beams.find((x) => x.key === key);
    for (const x of beams) x.mesh.material.uniforms.uHi.value = x.key === key ? 1 : 0;
    budget = BURST;
    if (!b) return;
    E.group.updateMatrixWorld();
    const p = complexWorld(b.station);
    const mid = p.clone().add(b.dir.clone().multiplyScalar(b.len * 0.45));
    const side = new THREE.Vector3().crossVectors(b.dir, Y).normalize();
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    const pos = mid.clone().normalize().add(side.multiplyScalar(0.9));
    flyTo(lookFrom(pos, camDist() * 0.95, 0.15));
  }

  /* labels */
  const proj = new THREE.Vector3();
  function screenOf(v) {
    proj.copy(v).project(camera);
    const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
    const x = (proj.x * 0.5 + 0.5) * w, y = (-proj.y * 0.5 + 0.5) * h;
    return { x, y, vis: proj.z < 1 && x > 4 && x < w - 4 && y > 4 && y < h - 4 };
  }
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function occluded(p) {                 // is the Earth (radius 1) between the camera and p?
    const c = camera.position;
    tmp.copy(p).sub(c);
    const L = tmp.length(); tmp.divideScalar(L);
    const t = -c.dot(tmp);
    if (t <= 0 || t >= L) return false;
    tmp2.copy(c).addScaledVector(tmp, t);
    return tmp2.length() < 0.995;
  }

  /* loop */
  let lastDraw = 0, budget = still ? 12 : 40, last = performance.now(), running = true, onFrame = null, frames = 0, simT = 0;
  const sunDir = new THREE.Vector3();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!running || (still && budget <= 0)) { last = now; return; }
    if (software && !still && now - lastDraw < 250) return;
    lastDraw = now;
    if (still) budget--;
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); last = now;
    if (!still) simT += dt;
    frames++;
    const ms = clock();
    // Earth orientation and the real Sun
    E.group.rotation.y = D.gmstDeg(ms) * D2R;
    const s = D.sunRaDec(ms);
    raDecToWorld(s.ra, s.dec, sunDir);
    E.uniforms.uSunDir.value.copy(sunDir);
    sun.position.copy(sunDir).multiplyScalar(500);
    E.uniforms.uCloudPhase.value = (ms / 3.6e6 / 24) % 1000;
    E.group.updateMatrixWorld();
    markers.mat.uniforms.uTime.value = simT;
    tips.mat.uniforms.uTime.value = simT;

    // beams ride the rotating Earth; fade when the target is below the horizon
    let n = 0;
    for (const b of beams) {
      complexWorld(b.station, b.origin);
      const up = tmp.copy(b.origin).normalize();
      const sinEl = b.dir.dot(up);
      b.fadeT = sinEl > -0.02 ? Math.min(1, (sinEl + 0.02) / 0.08) : 0;
      b.fade += (b.fadeT - b.fade) * (still ? 1 : Math.min(1, dt * 3));
      const u = b.mesh.material.uniforms;
      u.uA.value.copy(b.origin).addScaledVector(up, 0.004);
      u.uTime.value = simT;
      u.uFade.value = b.fade * (selected && selected !== b.key ? 0.45 : 1);
      b.tip.copy(u.uA.value).addScaledVector(b.dir, b.len * 0.52);
      if (n < 64) {
        tips.pos.set([b.tip.x, b.tip.y, b.tip.z], n * 3);
        const c = u.uColor.value;
        tips.col.set([c.r, c.g, c.b], n * 3);
        tips.a[n] = b.fade * (b.up || b.down ? 1 : 0.4) * (selected && selected !== b.key ? 0.5 : 1);
        n++;
      }
    }
    tips.geo.attributes.position.needsUpdate = true;
    tips.geo.attributes.aColor.needsUpdate = true;
    tips.geo.attributes.aA.needsUpdate = true;

    const cd = camera.position.length();
    E.update(cd);
    controls.update();
    renderer.render(scene, camera);

    if (onFrame) {
      const L = { cx: {}, beams: [] };
      for (const c of complexes) {
        const p = complexWorld(c.id, new THREE.Vector3()).multiplyScalar(1.02);
        const sc = screenOf(p);
        sc.vis = sc.vis && p.dot(camera.position) > 0.15 * cd;
        L.cx[c.id] = sc;
      }
      for (const b of beams) {
        const sc = screenOf(b.tip);
        sc.vis = sc.vis && b.fade > 0.3 && !occluded(b.tip);
        sc.key = b.key;
        L.beams.push(sc);
      }
      onFrame(L, { camD: cd, frames });
    }
  }

  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h);
    frameView();
    stars.material.uniforms.uPx.value = renderer.getPixelRatio();
    budget = BURST;
  }
  new ResizeObserver(() => resize()).observe(stage);
  controls.addEventListener("change", () => { if (budget < 5) budget = 5; });
  controls.addEventListener("start", () => {
    if (window.gsap) window.gsap.killTweensOf(camera.position);
    controls.autoRotate = false;
    if (opt.onUserMove) opt.onUserMove();
  });

  frameView();
  camera.position.set(0, 2.2, camDist());
  requestAnimationFrame(frame);

  return {
    renderer, camera, controls, scene, E,
    setBeams, focusComplex, focusBeam,
    clearFocus() { selected = null; for (const x of beams) x.mesh.material.uniforms.uHi.value = 0; budget = BURST; },
    setAutoRotate(on) { controls.autoRotate = !!on && !reduced; budget = BURST; },
    get autoRotate() { return controls.autoRotate; },
    kick() { budget = BURST; },
    setRunning(r) { running = r; },
    onFrame(fn) { onFrame = fn; },
    get beams() { return beams; },
    get software() { return software; }
  };
}
