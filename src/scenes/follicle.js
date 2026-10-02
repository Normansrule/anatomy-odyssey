// Tier 4: a secondary lymphoid follicle, cut in half. 1 scene unit = 10 µm.
// About 200 µm across. A mantle of small resting B cells surrounds the
// germinal center, which has a dark zone (dividing cells) and a light zone
// (selection on follicular dendritic cells). T cells crowd the area outside.
// Plasma cells leave toward the medulla.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, tubeThrough, seeded, disposeTree } from './kit.js';

const MANTLE = 10;
const GC = 6.5;

export function buildFollicle() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(71);
  const m4 = new THREE.Matrix4();
  const cellGeo = new THREE.IcosahedronGeometry(1, 1); // low-poly: there are thousands of cells

  // Jittered-grid packing inside a region, keeping only the back half (z ≤ 0.3).
  const pack = (spacing, keep) => {
    const pts = [];
    const L = MANTLE + 6;
    for (let x = -L; x <= L; x += spacing) {
      for (let y = -L; y <= L; y += spacing) {
        for (let z = -L; z <= 0.3; z += spacing) {
          const p = [x + (rand() - 0.5) * spacing * 0.5, y + (rand() - 0.5) * spacing * 0.5, Math.min(0.3, z + (rand() - 0.5) * spacing * 0.5)];
          if (keep(p)) pts.push(p);
        }
      }
    }
    return pts;
  };
  const instanced = (pts, radius, color, card, label) => {
    const mesh = new THREE.InstancedMesh(cellGeo, M(color, { roughness: 0.5 }), pts.length);
    pts.forEach((p, i) => mesh.setMatrixAt(i, m4.compose(new THREE.Vector3(...p), new THREE.Quaternion(), new THREE.Vector3(radius, radius, radius))));
    root.add(pick(mesh, card, label));
    return mesh;
  };
  const r = (p) => Math.hypot(p[0], p[1], p[2]);

  instanced(pack(0.78, (p) => r(p) > GC + 0.4 && r(p) < MANTLE), 0.36, 0x6d5bd0, 'lymph-follicle', 'Resting B cell (mantle zone)');
  instanced(pack(1.0, (p) => r(p) < GC && p[1] < -0.8), 0.48, 0x8f7ff0, 'germinal-center', 'Dividing B cell (dark zone)');
  instanced(pack(1.15, (p) => r(p) < GC && p[1] >= -0.8), 0.46, 0xd4c9ff, 'germinal-center', 'Selected B cell (light zone)');
  instanced(pack(1.3, (p) => r(p) > MANTLE + 0.8 && r(p) < MANTLE + 5 && Math.abs(p[0]) < 15 && rand() < 0.7), 0.36, 0x7cc49a, 'paracortex', 'T cell');

  // Follicular dendritic cells: star-shaped, holding antigen in the light zone.
  const fdcMat = M(0xe8c45a, { roughness: 0.45, emissive: 0xe8c45a, emissiveIntensity: 0.15 });
  for (let i = 0; i < 6; i++) {
    const c = [(rand() - 0.5) * 7, 1 + rand() * 3.5, -0.4 - rand() * 2];
    root.add(pick(ellipsoid(c, [0.55, 0.55, 0.55], fdcMat, 12), 'germinal-center', 'Follicular dendritic cell'));
    for (let k = 0; k < 6; k++) {
      const a = rand() * Math.PI * 2;
      const b = rand() * Math.PI - Math.PI / 2;
      const d = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b)];
      const len = 1.5 + rand() * 1.5;
      const tip = [c[0] + d[0] * len, c[1] + d[1] * len, Math.min(0.3, c[2] + d[2] * len)];
      const mid = [(c[0] + tip[0]) / 2 + (rand() - 0.5) * 0.4, (c[1] + tip[1]) / 2, (c[2] + tip[2]) / 2];
      root.add(pick(tubeThrough([c, mid, tip], 0.08, fdcMat, 10, 5), 'germinal-center', 'Follicular dendritic cell'));
    }
  }

  // Plasma cells leaving the follicle.
  const plasmaMat = M(0xf08baf, { roughness: 0.45 });
  const nucMat = M(0x3d2f8c, { roughness: 0.5 });
  const plasma = [[11.6, -5.2, 0.2], [13.4, -7.4, -0.4], [12.2, -9.6, 0.1], [14.8, -4.6, -0.8]];
  for (const p of plasma) {
    root.add(pick(ellipsoid(p, [0.95, 0.72, 0.72], plasmaMat, 18), 'plasma-cell', 'Plasma cell'));
    root.add(pick(ellipsoid([p[0] - 0.42, p[1], p[2] + 0.35], [0.38, 0.38, 0.38], nucMat, 12), 'plasma-cell', 'Plasma cell nucleus'));
  }
  // A faint reticular fiber network around the follicle.
  const fibers = [];
  for (let i = 0; i < 70; i++) {
    const a = rand() * Math.PI * 2;
    const b = rand() * Math.PI - Math.PI / 2;
    const rr = MANTLE + 0.3 + rand() * 0.6;
    const p = new THREE.Vector3(Math.cos(a) * Math.cos(b) * rr, Math.sin(b) * rr, -Math.abs(Math.sin(a) * Math.cos(b) * rr));
    fibers.push(p, p.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(4)));
  }
  root.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(fibers), M.line(0xe9dfc8, { transparent: true, opacity: 0.4 })));

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-5,
    view: { target: [2, -1.2, 0], direction: [0.14, 0.12, 1] },
    focus: plasma[0],
    dispose() {
      cellGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
