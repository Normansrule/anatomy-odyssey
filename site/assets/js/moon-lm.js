/* Cosmic Library · procedural Apollo Lunar Module (LM-5 "Eagle")
 *
 * Built from primitives after public reference drawings and photographs
 * (Apollo Operations Handbook LM-5 profile drawings; NASA TN D-6850 landing
 * gear geometry; Apollo 11 surface photography). Model frame: footpads at
 * y = 0, +x = the LM's +Z axis (forward: windows, hatch, ladder), +y = the
 * thrust (+X) axis, +z = the LM's +Y axis (right). Metres.
 *
 * Dimensions used (rounded): overall height ≈7.0 m; tread radius 4.26 m
 * (footpad centres); footpads ≈0.94 m; contact probes 1.71 m under three pads
 * (none under the ladder leg); descent stage ≈4.2 m across, 1.9 m tall;
 * ascent stage ≈2.8 m tall, ≈4.3 m wide across the thruster quads.
 * No insignia or lettering is drawn.
 */
import * as THREE from 'three';

/* ------------------------------------------------------------------ textures */
function rng(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Crinkled Kapton / Mylar foil: Voronoi facets + creases → tangent-space normal map. */
function foilNormalMap(size = 512, seed = 5) {
  const R = rng(seed);
  // 1) creases painted on a canvas and blurred
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.fillStyle = '#808080'; c.fillRect(0, 0, size, size);
  for (let i = 0; i < 420; i++) {
    const x = R() * size, y = R() * size, a = R() * Math.PI, L = 10 + R() * 60;
    const light = R() < 0.5;
    c.strokeStyle = light ? `rgba(255,255,255,${0.25 + R() * 0.35})` : `rgba(0,0,0,${0.25 + R() * 0.35})`;
    c.lineWidth = 0.8 + R() * 2.4;
    for (let ox = -size; ox <= size; ox += size) for (let oy = -size; oy <= size; oy += size) {
      c.beginPath(); c.moveTo(x + ox, y + oy);
      let px = x, py = y, aa = a;
      for (let k = 0; k < 4; k++) { aa += (R() - 0.5) * 0.9; px += Math.cos(aa) * L / 4; py += Math.sin(aa) * L / 4; c.lineTo(px + ox, py + oy); }
      c.stroke();
    }
  }
  const raw = c.getImageData(0, 0, size, size).data;
  // one separable 5-tap blur on the torus (canvas filters are very slow per stroke)
  const H0 = new Float32Array(size * size), H1 = new Float32Array(size * size), H = new Float32Array(size * size * 4);
  for (let i = 0; i < size * size; i++) H0[i] = raw[i * 4];
  const wts = [1, 4, 6, 4, 1];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let a = 0; for (let k = -2; k <= 2; k++) a += wts[k + 2] * H0[y * size + ((x + k + size) % size)]; H1[y * size + x] = a / 16; }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let a = 0; for (let k = -2; k <= 2; k++) a += wts[k + 2] * H1[((y + k + size) % size) * size + x]; H[(y * size + x) * 4] = a / 16; }
  // 2) facets: one jittered point per cell of a 9 × 9 torus grid (Voronoi, 3 × 3 neighbourhood)
  const G = 9, cs = size / G, pts = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) pts.push([(i + 0.15 + R() * 0.7) * cs, (j + 0.15 + R() * 0.7) * cs, (R() - 0.5) * 0.5, (R() - 0.5) * 0.5]);
  const out = document.createElement('canvas'); out.width = out.height = size;
  const o = out.getContext('2d'); const img = o.createImageData(size, size);
  const h = (x, y) => H[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let best = 1e9, tx = 0, ty = 0;
    const ci = Math.floor(x / cs), cj = Math.floor(y / cs);
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const ii = (ci + di + G) % G, jj = (cj + dj + G) % G, p = pts[jj * G + ii];
      let dx = Math.abs(x - p[0]), dy = Math.abs(y - p[1]);
      if (dx > size / 2) dx = size - dx; if (dy > size / 2) dy = size - dy;
      const d = dx * dx + dy * dy;
      if (d < best) { best = d; tx = p[2]; ty = p[3]; }
    }
    const gx = (h(x + 1, y) - h(x - 1, y)) * 3.2 + tx;
    const gy = (h(x, y + 1) - h(x, y - 1)) * 3.2 + ty;
    const l = Math.hypot(gx, gy, 1);
    const i = (y * size + x) * 4;
    img.data[i] = (-gx / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-gy / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  o.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

/** Ascent-stage skin: panels with seams, a few darker blankets. Returns [color, roughness] maps. */
function panelMaps(size = 512, seed = 9) {
  const R = rng(seed);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.fillStyle = '#9a9ca0'; c.fillRect(0, 0, size, size);
  const cells = [];
  const split = (x, y, w, h, d) => {
    if (d > 3 || (d > 1 && R() < 0.3)) { cells.push([x, y, w, h]); return; }
    if (w > h) { const k = w * (0.35 + R() * 0.3); split(x, y, k, h, d + 1); split(x + k, y, w - k, h, d + 1); }
    else { const k = h * (0.35 + R() * 0.3); split(x, y, w, k, d + 1); split(x, y + k, w, h - k, d + 1); }
  };
  split(0, 0, size, size, 0);
  for (const [x, y, w, h] of cells) {
    const v = 130 + R() * 40;
    c.fillStyle = `rgb(${v},${v + 2},${v + 5})`;
    c.fillRect(x + 1, y + 1, w - 2, h - 2);
    c.strokeStyle = 'rgba(40,40,45,.7)'; c.lineWidth = 1.5; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
    // rivet rows
    c.fillStyle = 'rgba(60,60,64,.55)';
    for (let k = 6; k < w - 4; k += 9) { c.fillRect(x + k, y + 4, 1.4, 1.4); c.fillRect(x + k, y + h - 5, 1.4, 1.4); }
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

/* ------------------------------------------------------------------ helpers */
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function cylBetween(a, b, r, mat, seg = 10) {
  const d = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), seg, 1), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
  return m;
}
/** Planar polygon with subdivision + slight pillowing (foil blankets bulge). */
function pillowPanel(w, h, mat, bulge = 0.035, seed = 1, sx = 10, sy = 8) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy);
  const p = g.attributes.position, R = rng(seed);
  const ph = R() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const ex = 1 - Math.pow(Math.abs(x) / (w / 2), 4), ey = 1 - Math.pow(Math.abs(y) / (h / 2), 4);
    const n = Math.sin(x * 5.1 + ph) * Math.sin(y * 4.3 - ph) * 0.4 + (R() - 0.5) * 0.35;
    p.setZ(i, bulge * Math.max(0, ex * ey) * (0.8 + n));
  }
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

/* ------------------------------------------------------------------ model */
export function buildLM({ envMap = null, quality = 'high' } = {}) {
  const foilN = foilNormalMap(quality === 'low' ? 256 : 512);
  const panel = panelMaps();
  const gold = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(1.0, 0.66, 0.24), metalness: 1.0, roughness: 0.27, normalMap: foilN,
    normalScale: new THREE.Vector2(0.9, 0.9), envMap, envMapIntensity: 1.2, clearcoat: 0.15, clearcoatRoughness: 0.35
  });
  const goldPale = gold.clone(); goldPale.color = new THREE.Color(0.95, 0.78, 0.45); goldPale.roughness = 0.3;
  const blackFoil = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0c, metalness: 0.55, roughness: 0.38, normalMap: foilN, normalScale: new THREE.Vector2(0.8, 0.8), envMap, envMapIntensity: 0.9, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  const silverFoil = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd2, metalness: 1.0, roughness: 0.22, normalMap: foilN, normalScale: new THREE.Vector2(0.7, 0.7), envMap, envMapIntensity: 1.1 });
  const skin = new THREE.MeshStandardMaterial({ map: panel, color: 0xc4c6cb, metalness: 0.22, roughness: 0.55, envMap, envMapIntensity: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, metalness: 0.3, roughness: 0.5, envMap, envMapIntensity: 0.7 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xa8abb0, metalness: 0.85, roughness: 0.38, envMap, envMapIntensity: 1.0 });
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x3a3632, metalness: 0.7, roughness: 0.45, envMap, envMapIntensity: 0.6, side: THREE.DoubleSide });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x080a10, metalness: 0.0, roughness: 0.05, envMap, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.03 });
  const rcsMat = new THREE.MeshStandardMaterial({ color: 0x8d8f93, metalness: 0.8, roughness: 0.35, envMap });

  const model = new THREE.Group();
  model.name = 'LM';
  const add = (m, parent = model) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

  /* ---------- descent stage: octagonal box wrapped in foil ---------- */
  const ds = new THREE.Group(); ds.name = 'descent'; model.add(ds);
  const A = 2.11, D = 2.35, y0 = 1.33, y1 = 3.23, H = y1 - y0, yc = (y0 + y1) / 2;
  const zc = D * Math.SQRT2 - A;                         // main-face half width (≈1.21 m)
  const mainW = 2 * zc, diagW = Math.SQRT2 * (A - zc);
  for (let k = 0; k < 4; k++) {
    const ang = k * Math.PI / 2;
    // main face (legs attach here)
    const f = add(pillowPanel(mainW, H, k === 2 ? goldPale : gold, 0.05, 10 + k), ds);
    f.position.set(Math.cos(ang) * A, yc, -Math.sin(ang) * A);
    f.rotation.y = ang + Math.PI / 2;
    // diagonal (quad bay) faces: black upper blanket, gold lower
    const da = ang + Math.PI / 4, r = D;
    const up = add(pillowPanel(diagW, H * 0.42, k % 2 ? blackFoil : goldPale, 0.04, 20 + k, 6, 4), ds);
    up.position.set(Math.cos(da) * r, y1 - H * 0.21, -Math.sin(da) * r); up.rotation.y = da + Math.PI / 2;
    const lo = add(pillowPanel(diagW, H * 0.58, gold, 0.05, 30 + k, 6, 5), ds);
    lo.position.set(Math.cos(da) * r, y0 + H * 0.29, -Math.sin(da) * r); lo.rotation.y = da + Math.PI / 2;
  }
  // top deck and bottom heat shield (octagon shapes)
  const oct = new THREE.Shape();
  const octPts = [];
  for (let k = 0; k < 8; k++) {
    const base = Math.floor(k / 2) * Math.PI / 2;
    const s = k % 2 === 0 ? -1 : 1;
    const x = A, z = s * zc;
    octPts.push([x * Math.cos(base) - z * Math.sin(base), x * Math.sin(base) + z * Math.cos(base)]);
  }
  octPts.forEach(([x, z], i) => (i ? oct.lineTo(x, z) : oct.moveTo(x, z)));
  const topG = new THREE.ShapeGeometry(oct); topG.rotateX(Math.PI / 2);
  const top = add(new THREE.Mesh(topG, silverFoil), ds); top.position.y = y1 + 0.01;
  top.material = silverFoil.clone(); top.material.side = THREE.DoubleSide;
  const bot = add(new THREE.Mesh(topG.clone(), dark), ds); bot.position.y = y0; bot.material = dark.clone(); bot.material.side = THREE.DoubleSide;
  // thin black band along the top edge
  const band = add(new THREE.Mesh(new THREE.CylinderGeometry(2.33, 2.33, 0.08, 8, 1, true), blackFoil), ds);
  band.rotation.y = Math.PI / 8; band.position.y = y1 - 0.04; band.scale.set(0.985, 1, 0.985);
  // MESA (stowed equipment bay) on the front face, left of the ladder
  const mesa = add(pillowPanel(0.85, 1.25, goldPale, 0.07, 44, 6, 6), ds);
  mesa.position.set(A + 0.06, yc + 0.05, -0.55); mesa.rotation.y = Math.PI / 2;

  /* ---------- descent engine ---------- */
  const prof = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    prof.push(new THREE.Vector2(0.24 + 0.52 * Math.pow(t, 0.62), 1.62 - 0.72 * t));
  }
  const bell = add(new THREE.Mesh(new THREE.LatheGeometry(prof, 36), nozzleMat), ds);
  // engine glow: inner disc + faint cone (a hypergolic plume is nearly invisible in vacuum)
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffa060, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  // the glow lines the inside of the bell, so it is only seen when looking up into the nozzle
  const glowDisc = new THREE.Mesh(new THREE.LatheGeometry(prof.map(v => new THREE.Vector2(v.x * 0.96, v.y)), 36), glowMat);
  glowMat.side = THREE.BackSide;
  ds.add(glowDisc);
  const plumeMat = new THREE.ShaderMaterial({
    uniforms: { uI: { value: 0 }, uT: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;
      #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `uniform float uI, uT; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        float along = 1.0 - vUv.y;                     // 0 at the nozzle exit
        float rim = pow(1.0 - abs(dot(vN, vV)), 1.5);
        float a = uI * (1.0 - smoothstep(0.0, 1.0, along)) * (0.35 + 0.65 * (1.0 - rim)) * (0.9 + 0.1 * sin(uT * 60.0 + along * 20.0));
        gl_FragColor = vec4(vec3(0.75, 0.62, 1.0) * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const plume = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 2.6, 5.5, 28, 1, true), plumeMat);
  plume.position.y = 0.9 - 2.75; ds.add(plume);

  /* ---------- landing gear ---------- */
  const legs = [];
  const padProf = [V(0, 0, 0), V(0.3, 0.02, 0), V(0.44, 0.07, 0), V(0.47, 0.16, 0), V(0.43, 0.2, 0)].map(v => new THREE.Vector2(v.x, v.y));
  const padG = new THREE.LatheGeometry(padProf, 28);
  for (let k = 0; k < 4; k++) {
    const ang = k * Math.PI / 2;                         // 0 = +x forward (ladder leg)
    const g = new THREE.Group(); g.rotation.y = -ang; model.add(g);
    // outrigger on top of the stage, primary strut down to the footpad
    const topPt = V(2.02, 3.05, 0), padPt = V(4.26, 0.2, 0);
    const primUpper = add(cylBetween(topPt, V(3.25, 1.49, 0), 0.115, k === 0 ? gold : blackFoil), g);
    const primLower = add(cylBetween(V(3.2, 1.55, 0), padPt, 0.085, gold), g);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.3, 0.4), gold), g).position.set(2.08, 3.0, 0);
    // secondary struts from the lower stage corners to the primary strut
    for (const s of [-1, 1]) {
      add(cylBetween(V(2.1, 1.42, s * 1.05), V(3.36, 1.35, 0), 0.05, gold), g);
      add(cylBetween(V(2.1, 2.2, s * 0.6), V(2.9, 1.62, s * 0.04), 0.03, alu), g);
    }
    // footpad
    const pad = add(new THREE.Mesh(padG, goldPale), g); pad.position.copy(padPt).setY(0);
    // contact probe (not on the ladder leg)
    let probe = null;
    if (k !== 0) {
      probe = add(cylBetween(V(4.3, 0.04, 0), V(4.44, -1.66, 0), 0.016, alu, 6), g);
    }
    legs.push({ group: g, pad, probe, primUpper, primLower });
  }
  // ladder on the forward strut + porch in front of the hatch
  {
    const g = legs[0].group;
    const a = V(2.28, 2.86, 0), b = V(3.62, 0.72, 0);
    for (const s of [-1, 1]) add(cylBetween(a.clone().setZ(s * 0.25).add(V(0.1, 0, 0)), b.clone().setZ(s * 0.25).add(V(0.1, 0, 0)), 0.022, alu, 6), g);
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9;
      const p = a.clone().lerp(b, t).add(V(0.1, 0, 0));
      add(cylBetween(p.clone().setZ(-0.25), p.clone().setZ(0.25), 0.014, alu, 6), g);
    }
    const porch = add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.05, 0.92), alu), model); porch.position.set(2.46, 3.22, 0);
    for (const s of [-1, 1]) {
      add(cylBetween(V(2.2, 3.24, s * 0.45), V(2.72, 3.95, s * 0.45), 0.018, alu, 6));
      add(cylBetween(V(2.72, 3.95, s * 0.45), V(2.72, 3.24, s * 0.45), 0.018, alu, 6));
    }
  }

  /* ---------- ascent stage ---------- */
  const as = new THREE.Group(); as.name = 'ascent'; model.add(as);
  // midsection (vertical cylinder) and forward cabin
  const mid = add(new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.25, 1.95, 28), skin), as); mid.position.set(-0.45, 4.62, 0);
  const cabin = add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.1, 2.3), skin), as); cabin.position.set(0.55, 4.72, 0);
  // faceted front "face"
  const face = new THREE.Shape();
  [[-1.15, 3.66], [1.15, 3.66], [1.22, 4.95], [0.72, 5.86], [-0.72, 5.86], [-1.22, 4.95]].forEach(([z, y], i) => (i ? face.lineTo(z, y) : face.moveTo(z, y)));
  const faceG = new THREE.ExtrudeGeometry(face, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 2 });
  faceG.rotateY(Math.PI / 2);
  const faceM = add(new THREE.Mesh(faceG, dark), as); faceM.position.set(1.2, 0, 0);
  // triangular windows (canted in real life; drawn flush here) + frames
  const winL = new THREE.Shape(); winL.moveTo(-1.02, 5.72); winL.lineTo(-0.2, 5.72); winL.lineTo(-1.04, 4.98); winL.lineTo(-1.02, 5.72);
  const winR = new THREE.Shape(); winR.moveTo(1.02, 5.72); winR.lineTo(0.2, 5.72); winR.lineTo(1.04, 4.98); winR.lineTo(1.02, 5.72);
  for (const w of [winL, winR]) {
    const wg = new THREE.ShapeGeometry(w); wg.rotateY(Math.PI / 2);
    const m = add(new THREE.Mesh(wg, glass), as); m.position.x = 1.49;
    const fr = new THREE.Mesh(new THREE.ShapeGeometry(w), alu); fr.geometry.rotateY(Math.PI / 2); fr.position.x = 1.485; fr.scale.set(1, 1.02, 1.04); as.add(fr);
  }
  // forward hatch
  const hatch = add(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.82, 0.82), skin), as); hatch.position.set(1.47, 4.1, 0);
  add(cylBetween(V(1.53, 4.1, -0.25), V(1.53, 4.1, 0.25), 0.015, alu, 6), as);
  // propellant-tank "cheeks"
  for (const s of [-1, 1]) {
    const t = add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), skin), as);
    t.position.set(-0.55, 4.05, s * 1.3); t.scale.set(1.05, 0.95, 0.75);
  }
  // aft equipment bay
  const aft = add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.1, 2.3), skin), as); aft.position.set(-1.68, 4.22, 0);
  const aftBlk = add(pillowPanel(2.2, 1.0, blackFoil, 0.03, 61, 6, 4), as); aftBlk.position.set(-2.16, 4.22, 0); aftBlk.rotation.y = -Math.PI / 2;
  for (const s2 of [-1, 1]) { const sideBlk = add(pillowPanel(0.85, 0.95, blackFoil, 0.03, 62 + s2, 4, 4), as); sideBlk.position.set(-1.68, 4.22, s2 * 1.16); sideBlk.rotation.y = s2 > 0 ? 0 : Math.PI; }
  for (const s of [-1, 1]) add(cylBetween(V(-2.05, 3.7, s * 1.2), V(-0.9, 3.35, s * 0.9), 0.035, alu, 6), as);
  // docking tunnel, drogue ring, ascent engine cover
  const tun = add(new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.38, 24), skin), as); tun.position.set(-0.35, 5.78, 0);
  add(new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 8, 24), alu), as).position.set(-0.35, 5.98, 0);
  add(new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.04, 8, 24), alu), as).rotation.x = Math.PI / 2;
  as.children[as.children.length - 1].position.set(-0.35, 5.98, 0);
  // overhead docking window + docking target post
  const ow = add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.03, 0.26), glass), as); ow.position.set(0.55, 5.79, -0.5);
  add(cylBetween(V(0.2, 5.75, -0.95), V(0.2, 6.25, -0.95), 0.02, alu, 6), as);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.3, 0.04), dark), as).position.set(0.2, 6.3, -0.95);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), dark), as).position.set(0.2, 6.3, -0.95);
  // rendezvous radar dish on the forward top
  add(cylBetween(V(0.85, 5.8, 0), V(0.9, 6.12, 0), 0.06, alu, 8), as);
  const rr = add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 10, 0, Math.PI * 2, 0, 0.9), alu), as);
  rr.material = alu.clone(); rr.material.side = THREE.DoubleSide;
  rr.position.set(1.0, 6.2, 0); rr.rotation.z = -Math.PI / 2 + 0.5;
  // steerable S-band antenna on its boom (aimed at the Earth each frame)
  add(cylBetween(V(-0.9, 5.3, 1.05), V(-1.0, 5.95, 1.62), 0.045, alu, 8), as);
  const sband = new THREE.Group(); sband.position.set(-1.0, 6.02, 1.68); as.add(sband);
  const dish = add(new THREE.Mesh(new THREE.SphereGeometry(0.34, 20, 10, 0, Math.PI * 2, 0, 0.85), alu.clone()), sband);
  dish.material.side = THREE.DoubleSide; dish.rotation.x = -Math.PI / 2; dish.position.z = -0.08;
  add(cylBetween(V(0, 0, -0.08), V(0, 0, 0.18), 0.012, alu, 5), sband);
  // VHF antennas
  add(cylBetween(V(-0.1, 5.9, -0.75), V(0.35, 6.75, -1.05), 0.012, alu, 5), as);
  add(cylBetween(V(-2.1, 4.6, 0.7), V(-2.75, 4.2, 1.0), 0.012, alu, 5), as);

  /* ---------- Reaction Control System quads ---------- */
  const nozzles = [];      // {pos: Vector3 (model), dir: exhaust unit vector (model), quad, kind}
  const quadPos = [[1.05, 1.66], [1.05, -1.66], [-1.5, 1.66], [-1.5, -1.66]];
  const nozG = new THREE.CylinderGeometry(0.035, 0.075, 0.2, 10, 1, true);
  quadPos.forEach(([qx, qz], qi) => {
    const q = new THREE.Group(); q.position.set(qx, 5.02, qz); as.add(q);
    add(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.3, 0.34), rcsMat), q);
    add(cylBetween(V(0, 0, 0), V(qx > 0 ? -0.35 : 0.35, -0.1, -Math.sign(qz) * 0.5), 0.05, alu, 6), q);
    const dirs = [[0, 1, 0, 'up'], [0, -1, 0, 'down'], [Math.sign(qx), 0, 0, 'x'], [0, 0, Math.sign(qz), 'z']];
    for (const [dx, dy, dz, kind] of dirs) {
      const d = V(dx, dy, dz);
      const n = add(new THREE.Mesh(nozG, rcsMat), q);
      n.material = rcsMat.clone(); n.material.side = THREE.DoubleSide;
      n.position.copy(d).multiplyScalar(0.25);
      n.quaternion.setFromUnitVectors(V(0, -1, 0), d);   // wide end outward
      nozzles.push({ pos: V(qx, 5.02, qz).add(d.clone().multiplyScalar(0.36)), dir: d, quad: qi, kind });
    }
    // plume deflector under the down-firing jet
    const def = add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.42), silverFoil), q);
    def.position.set(0, -0.62, 0); def.rotation.z = qx > 0 ? -0.35 : 0.35;
  });

  const shadowCasters = [];
  model.traverse(o => { if (o.isMesh) shadowCasters.push(o); });
  return { model, parts: { ds, as, bell, glowDisc, glowMat, plume, plumeMat, legs, sband, nozzles }, materials: { gold, blackFoil, skin } };
}

/* ------------------------------------------------------------------ RCS puffs */
/** Brief, faint jet puffs (sprites) at the RCS nozzles. Visible for ≈0.15 s. */
export function createPuffs(max = 64) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(max * 3), dir = new Float32Array(max * 3), age = new Float32Array(max).fill(9);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
  geo.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: `attribute vec3 aDir; attribute float aAge; varying float vA; uniform float uScale;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main(){
        float k = aAge / 0.22;
        vA = aAge < 0.22 ? (1.0 - k) * (1.0 - k) : 0.0;
        vec3 p = position + aDir * (0.1 + 1.6 * k);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = vA > 0.0 ? uScale * (0.25 + 0.9 * k) / -mv.z : 0.0;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `varying float vA;
      #include <logdepthbuf_pars_fragment>
      void main(){
        #include <logdepthbuf_fragment>
        vec2 c = gl_PointCoord - 0.5; float r = length(c);
        float a = vA * smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vec3(1.0, 0.97, 0.9) * a * 1.4, a * 0.8);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  let next = 0;
  return {
    points: pts,
    fire(p, d) {
      const i = next; next = (next + 1) % max;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      dir[i * 3] = d.x; dir[i * 3 + 1] = d.y; dir[i * 3 + 2] = d.z;
      age[i] = 0;
      geo.attributes.position.needsUpdate = true; geo.attributes.aDir.needsUpdate = true;
    },
    update(dt) {
      for (let i = 0; i < max; i++) age[i] += dt;
      geo.attributes.aAge.needsUpdate = true;
    }
  };
}
