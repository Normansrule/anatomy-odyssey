// Tier 5: one osteocyte in its lacuna. 1 scene unit = 1 µm.
// The cell body is opened with a cutaway wedge so its nucleus is visible; dendritic
// processes branch outward through canaliculi into mineralized matrix.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, tubeThrough, seeded, disposeTree } from './kit.js';

export function buildOsteocyte() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(23);

  const lacuna = ellipsoid([0, 0, 0], [12.5, 6.2, 8], M(COLORS.matrix, { transparent: true, opacity: 0.16, depthWrite: false, side: THREE.BackSide, roughness: 0.9 }), 40);
  root.add(pick(lacuna, 'lacuna', 'Lacuna wall'));

  // Cell body, opened with a cutaway wedge facing the camera so the nucleus shows.
  const CUT_CENTER = 1.905; // sphere phi facing the default view direction
  const CUT_HALF = Math.PI / 4;
  const bodyGeo = new THREE.SphereGeometry(1, 64, 40, CUT_CENTER + CUT_HALF, Math.PI * 2 - 2 * CUT_HALF);
  const body = new THREE.Mesh(bodyGeo, M(COLORS.eosin, { roughness: 0.45, side: THREE.FrontSide }));
  body.scale.set(10, 4.8, 6.6);
  root.add(pick(body, 'osteocyte', 'Osteocyte'));
  const bodyInside = new THREE.Mesh(bodyGeo, M(0xb35d86, { roughness: 0.7, side: THREE.BackSide }));
  bodyInside.scale.copy(body.scale);
  root.add(pick(bodyInside, 'osteocyte', 'Osteocyte (cytoplasm)'));

  const nucleus = ellipsoid([0.6, 0.2, 0.6], [4.4, 2.7, 3.3], M(COLORS.hematoxylin, { roughness: 0.4, emissive: COLORS.hemaDeep, emissiveIntensity: 0.35 }), 40);
  nucleus.userData.pickPriority = 1;
  root.add(pick(nucleus, 'osteocyte-nucleus', 'Nucleus'));

  // Dendritic processes: start on the cell surface, head outward, fork once.
  const procMat = M(COLORS.eosin, { roughness: 0.5 });
  for (let i = 0; i < 38; i++) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    // Keep processes out of the camera's face: flatten their pull toward +z.
    const dir = new THREE.Vector3(Math.cos(a) * s, u * 0.8, Math.sin(a) * s * (Math.sin(a) > 0 ? 0.35 : 1)).normalize();
    const start = new THREE.Vector3(dir.x * 9.2, dir.y * 4.3, dir.z * 6);
    const len = 9 + rand() * 11;
    const pts = [start.toArray()];
    const p = start.clone();
    const d = dir.clone();
    for (let k = 1; k <= 5; k++) {
      d.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.35)).normalize();
      p.addScaledVector(d, len / 5);
      pts.push(p.toArray());
    }
    root.add(pick(tubeThrough(pts, 0.2, procMat, 24, 6), 'dendrites', 'Dendritic process'));
    if (rand() < 0.6) {
      const fork = new THREE.Vector3(...pts[2]);
      const fd = d.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5)).normalize();
      const f1 = fork.clone().addScaledVector(fd, 5 + rand() * 4);
      const f2 = f1.clone().addScaledVector(fd, 5 + rand() * 4);
      root.add(pick(tubeThrough([fork.toArray(), f1.toArray(), f2.toArray()], 0.14, procMat, 12, 5), 'dendrites', 'Dendritic process'));
    }
  }

  // Collagen fibrils in two layers at different angles (plywood-like lamellae).
  // Drawn much thicker than life (real fibrils are ~0.1 µm) so they can be seen.
  const fibril = M(COLORS.matrix, { roughness: 0.8, transparent: true, opacity: 0.28, depthWrite: false });
  const fibril2 = M(0xd8c7a6, { roughness: 0.8, transparent: true, opacity: 0.22, depthWrite: false });
  for (let layer = 0; layer < 2; layer++) {
    const angle = layer === 0 ? 0 : Math.PI / 3;
    const zBase = layer === 0 ? -16 : -21;
    for (let i = -6; i <= 6; i++) {
      const off = i * 3.4;
      const cx = Math.cos(angle);
      const sx = Math.sin(angle);
      const a = [-40 * cx - off * sx, off * cx - 40 * sx, zBase + (rand() - 0.5)];
      const b = [40 * cx - off * sx, off * cx + 40 * sx, zBase + (rand() - 0.5)];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + (rand() - 0.5), zBase + (rand() - 0.5)];
      root.add(pick(tubeThrough([a, mid, b], 0.3, layer ? fibril2 : fibril, 16, 6), 'bone-matrix', 'Collagen fibril'));
    }
  }

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    view: { target: [0, 0, 0], direction: [0.35, 0.45, 1] },
    focus: [0.6, 0.2, 0.6],
    dispose() {
      bodyGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
