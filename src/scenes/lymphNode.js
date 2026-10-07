// Tier 3: a lymph node, sliced through the middle. 1 scene unit = 1 mm.
// About 15 mm long and bean-shaped, dented at the hilum where the blood
// vessels and the outgoing lymph vessel leave. The front half is removed, so
// the slice shows the layers the way a histology section does: capsule and
// its inward partitions (trabeculae), subcapsular sinus, cortex with
// follicles (B cells), paracortex (T cells) and medulla. The back half bulges
// where follicles sit under its surface. Lymphocytes on the slice are drawn
// about ten times too big and far fewer than the millions in a real node.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, tubeThrough, ellipsoid, disposeTree, seeded } from './kit.js';

const RX = 7.5;
const RY = 4.0;
const RZ = 3.2;
const HILUM_DENT = 0.35; // how deep the hilum indents the outline, as a share of RY

/** A point on the bean outline at angle a, scaled by (sx, sy): an ellipse dented at the bottom. */
export function beanPoint(a, sx = 1, sy = 1, cy = 0) {
  const x = RX * Math.cos(a);
  let y = RY * Math.sin(a);
  if (y < 0) y += HILUM_DENT * RY * Math.exp(-((x / (0.3 * RX)) ** 2)) * (-y / RY);
  return [x * sx, y * sy + cy];
}

function beanShape(sx, sy, cy = 0, n = 120) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n; i++) {
    const [x, y] = beanPoint((i / n) * Math.PI * 2, sx, sy, cy);
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  }
  return s;
}

/** Is (x, y) inside the bean outline scaled by (sx, sy)? */
function insideBean(x, y, sx, sy, cy = 0) {
  const a = Math.atan2((y - cy) / (RY * sy), x / (RX * sx));
  const [bx, by] = beanPoint(a, sx, sy, cy);
  return Math.hypot(x, y - cy) <= Math.hypot(bx, by - cy);
}

export function buildLymphNode() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1515);

  // Follicle positions just inside the capsule (none at the hilum).
  const angles = [18, 40, 62, 90, 118, 140, 162, 196, 222, 318, 342];
  const follicles = angles.map((deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    const [x, y] = beanPoint(a, 0.82, 0.8);
    return { a, x, y, r: deg === 90 ? 1.05 : 0.8 + (deg % 3) * 0.08, deg };
  });

  // Capsule: the back half of the bean, bulging where follicles lie under its surface.
  const shellGeo = new THREE.SphereGeometry(1, 96, 64, Math.PI, Math.PI);
  const bumps = [];
  for (let i = 0; i < 26; i++) {
    const u = rand() * Math.PI * 2;
    const v = Math.acos(-rand()); // back hemisphere (z < 0)
    bumps.push(new THREE.Vector3(Math.sin(v) * Math.cos(u), Math.sin(v) * Math.sin(u), Math.cos(v)));
  }
  const p = shellGeo.attributes.position;
  const n = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    n.fromBufferAttribute(p, i);
    let lift = 0;
    for (const b of bumps) lift += 0.045 * Math.exp(-n.distanceToSquared(b) / 0.03);
    if (n.y > -0.55) lift *= 1; else lift *= 0.3; // smooth around the hilum
    const x = n.x * RX * (1 + lift);
    let y = n.y * RY * (1 + lift);
    const z = n.z * RZ * (1 + lift);
    if (y < 0) y += HILUM_DENT * RY * Math.exp(-((x / (0.3 * RX)) ** 2)) * (-y / RY);
    p.setXYZ(i, x, y, z);
  }
  shellGeo.computeVertexNormals();
  const capsuleMat = M(0xc9bde8, { roughness: 0.45, side: THREE.DoubleSide, tissue: 'fascia', repeat: [3, 2] });
  root.add(pick(new THREE.Mesh(shellGeo, capsuleMat), 'lymph-node', 'Capsule'));
  // The cut edge of the capsule, so the slice reads as a solid organ.
  const rim = [];
  for (let i = 0; i <= 120; i++) {
    const [x, y] = beanPoint((i / 120) * Math.PI * 2);
    rim.push(new THREE.Vector3(x, y, 0.02));
  }
  root.add(pick(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rim, true), 240, 0.11, 8, true), capsuleMat), 'lymph-node', 'Capsule (cut edge)'));

  // The slice face, drawn in layers from the outside in.
  const layer = (sx, sy, cy, color, z, card, label) => {
    const m = new THREE.Mesh(new THREE.ShapeGeometry(beanShape(sx, sy, cy)), M(color, { roughness: 0.75 }));
    m.position.z = z;
    root.add(pick(m, card, label));
  };
  layer(1, 1, 0, 0xece4f8, 0.0, 'lymph-node', 'Subcapsular sinus (where incoming lymph spreads out)');
  layer(0.95, 0.93, 0, 0x8f7ff0, 0.01, 'lymph-follicle', 'Cortex');
  layer(0.72, 0.62, -0.25, 0x6f60cf, 0.02, 'paracortex', 'Paracortex (T cell zone)');
  layer(0.42, 0.4, -1.1, 0xdcb9d9, 0.03, 'lymph-medulla', 'Medulla');

  // Trabeculae: partitions of capsule tissue running inward between follicles.
  const trabMat = M(0xd8cdee, { roughness: 0.5 });
  const trab = [];
  for (let i = 0; i < follicles.length - 1; i++) {
    const a = (follicles[i].a + follicles[i + 1].a) / 2;
    if (follicles[i + 1].deg - follicles[i].deg > 60) continue; // no partition across the hilum gap
    const [x0, y0] = beanPoint(a, 0.97, 0.96);
    const [x1, y1] = beanPoint(a, 0.62, 0.55, -0.4);
    trab.push(tubeThrough([[x0, y0, 0.05], [(x0 + x1) / 2 + 0.15, (y0 + y1) / 2, 0.06], [x1, y1, 0.05]], 0.05, trabMat, 16, 5));
  }
  for (const t of trab) root.add(pick(t, 'lymph-node', 'Trabecula (a partition of the capsule)'));

  // Medullary cords fanning toward the hilum.
  const cordMat = M(0xb97bb3, { roughness: 0.6 });
  for (let k = -3; k <= 3; k++) {
    const x0 = k * 0.75;
    root.add(pick(tubeThrough([[x0, -0.3, 0.05], [x0 * 0.7, -1.3, 0.06], [x0 * 0.3, -2.1, 0.06], [0, -2.55, 0.05]], 0.12, cordMat, 24, 6), 'lymph-medulla', 'Medullary cord'));
  }

  // Lymphocytes speckling the slice: B cells in the cortex, T cells in the paracortex.
  const cellGeo = new THREE.SphereGeometry(1, 8, 6);
  const cells = new THREE.InstancedMesh(cellGeo, M(0xffffff, { roughness: 0.5 }), 1600);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const color = new THREE.Color();
  let placed = 0;
  for (let tries = 0; tries < 20000 && placed < 1600; tries++) {
    const x = (rand() * 2 - 1) * RX;
    const y = (rand() * 2 - 1) * RY;
    if (!insideBean(x, y, 0.93, 0.9) || insideBean(x, y, 0.42, 0.4, -1.1)) continue;
    const inPara = insideBean(x, y, 0.72, 0.62, -0.25);
    const s = 0.05 + rand() * 0.02;
    m4.compose(new THREE.Vector3(x, y, 0.06), q, new THREE.Vector3(s, s, s * 0.5));
    cells.setMatrixAt(placed, m4);
    cells.setColorAt(placed, color.set(inPara ? 0x9fb4e8 : 0xc7bdf6).offsetHSL(0, 0, (rand() - 0.5) * 0.12));
    placed++;
  }
  cells.count = placed;
  cells.userData.pickPriority = -1;
  root.add(pick(cells, 'lymphocyte', 'Lymphocytes (drawn about 10 times too big)'));

  // Follicles with pale germinal centers around the cortex.
  const hemi = new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  hemi.rotateX(Math.PI / 2);
  const follicleMat = M(0x5b4bc4, { roughness: 0.55 });
  const gcMat = M(0xd9d0f5, { roughness: 0.5 });
  let focus = null;
  for (const f of follicles) {
    const m = new THREE.Mesh(hemi, follicleMat);
    m.position.set(f.x, f.y, 0.04);
    m.scale.set(f.r, f.r, f.r * 0.55);
    root.add(pick(m, 'lymph-follicle', 'Follicle (B cells)'));
    const gc = new THREE.Mesh(hemi, gcMat);
    gc.position.set(f.x - Math.cos(f.a) * f.r * 0.15, f.y - Math.sin(f.a) * f.r * 0.15, 0.06);
    gc.scale.set(f.r * 0.55, f.r * 0.55, f.r * 0.42);
    root.add(pick(gc, 'germinal-center', 'Germinal center'));
    if (f.deg === 90) focus = [f.x, f.y, 0.4];
  }

  // High endothelial venules in the paracortex, where lymphocytes leave the blood.
  const hev = M(0xc4566a, { roughness: 0.45 });
  for (const [x, y] of [[-3.2, 0.4], [2.6, 0.9], [-1.2, 1.4], [3.8, -0.6], [-4.2, -0.9]]) {
    root.add(pick(tubeThrough([[x - 0.4, y - 0.2, 0.08], [x, y + 0.15, 0.09], [x + 0.4, y - 0.1, 0.08]], 0.09, hev, 12, 6), 'paracortex', 'High endothelial venule (where lymphocytes enter from the blood)'));
  }

  // Afferent lymphatic vessels entering the convex side, each with a valve.
  const lymphMat = M(COLORS.lymph, { roughness: 0.4, transparent: true, opacity: 0.85 });
  for (const x of [-5.2, -2.2, 1.5, 4.6]) {
    const yIn = beanPoint(Math.acos(Math.max(-1, Math.min(1, x / RX))))[1] * 0.99;
    root.add(pick(tubeThrough([[x * 1.2, yIn + 4.5, -1.6], [x * 1.08, yIn + 2.2, -1.2], [x, yIn, -0.9]], 0.22, lymphMat, 24, 8), 'lymphatic-vessel', 'Afferent lymphatic vessel (lymph in)'));
    for (const t of [0.42, 0.7]) {
      const valve = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.07, 8, 16), lymphMat);
      valve.position.set(x * (1.08 + 0.12 * t), yIn + 2.2 * (1 + t), -1.2 - 0.4 * t);
      valve.rotation.x = Math.PI / 2;
      root.add(pick(valve, 'lymphatic-vessel', 'Valve (keeps lymph flowing one way)'));
    }
  }
  // Hilum: efferent lymphatic, artery and vein, cushioned in fat.
  const hilumY = beanPoint(-Math.PI / 2)[1];
  root.add(pick(tubeThrough([[0, hilumY, -0.6], [0.3, hilumY - 3, -0.8], [0.8, hilumY - 5.5, -1]], 0.34, lymphMat, 24, 8), 'lymphatic-vessel', 'Efferent lymphatic vessel (lymph out)'));
  root.add(pick(tubeThrough([[-0.9, hilumY, -0.9], [-1.3, hilumY - 3, -1.1], [-1.6, hilumY - 5.5, -1.3]], 0.26, M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' }), 24, 8), 'lymph-node', 'Artery'));
  root.add(pick(tubeThrough([[0.9, hilumY, -1.1], [1.4, hilumY - 3, -1.3], [1.9, hilumY - 5.5, -1.5]], 0.3, M(COLORS.vein, { roughness: 0.4, tissue: 'vein' }), 24, 8), 'lymph-node', 'Vein'));
  const fatMat = M(0xf0d58c, { roughness: 0.35, transparent: true, opacity: 0.85 });
  const fat = [];
  for (let i = 0; i < 14; i++) {
    const a = rand() * Math.PI * 2;
    fat.push(ellipsoid([Math.cos(a) * (1.6 + rand() * 1.2), hilumY - 1.2 - rand() * 2.4, -1.2 - Math.abs(Math.sin(a)) * 1.2], [0.5 + rand() * 0.4, 0.45 + rand() * 0.3, 0.45 + rand() * 0.3], fatMat, 12));
  }
  for (const f of fat) {
    f.userData.pickPriority = -1;
    root.add(pick(f, 'lymph-node', 'Fat around the hilum'));
  }

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    view: { target: [0, -0.8, -0.8], direction: [0.42, 0.38, 0.82] },
    focus,
    dispose() {
      hemi.dispose();
      cellGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
