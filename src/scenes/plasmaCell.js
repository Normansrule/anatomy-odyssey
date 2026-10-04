// Tier 5: a plasma cell, cut open. 1 scene unit = 1 µm.
// About 14 µm long. An off-center nucleus with "clock-face" chromatin, a
// pale Golgi zone beside it, and stacked sheets of rough endoplasmic
// reticulum (ER) studded with ribosomes filling the rest. Antibodies drift
// away from the surface, drawn about 30 times too large so they show.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, capsuleBetween, seeded, disposeTree } from './kit.js';

const CUT_CENTER = 1.45; // sphere phi of the opening (faces the camera, toward the nucleus)
const CUT_HALF = Math.PI / 4;
const CELL = [7, 5.2, 5.2];
const NUC = [-2.4, 0.1, 0.9];
const NUC_R = 2.7;

function outsideCut(phi) {
  const d = Math.abs(((phi - CUT_CENTER + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
  return d > CUT_HALF + 0.03;
}

export function buildPlasmaCell({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(79);
  const phiStart = CUT_CENTER + CUT_HALF;
  const phiLength = Math.PI * 2 - 2 * CUT_HALF;

  const cellGeo = new THREE.SphereGeometry(1, 64, 44, phiStart, phiLength);
  const cell = new THREE.Mesh(cellGeo, M(0xf08baf, { roughness: 0.5, side: THREE.DoubleSide }));
  cell.scale.set(...CELL);
  root.add(pick(cell, 'plasma-cell', 'Plasma cell membrane'));
  // Cytoplasm backdrop inside the cut.
  const inner = new THREE.Mesh(cellGeo, M(0xb35d86, { roughness: 0.8, side: THREE.BackSide }));
  inner.scale.set(CELL[0] * 0.985, CELL[1] * 0.985, CELL[2] * 0.985);
  root.add(pick(inner, 'plasma-cell', 'Cytoplasm'));

  // Nucleus with clock-face chromatin patches.
  const nucleus = ellipsoid(NUC, [NUC_R, NUC_R, NUC_R], M(0x8a78e8, { roughness: 0.45 }), 36);
  nucleus.userData.pickPriority = 1;
  root.add(pick(nucleus, 'plasma-nucleus', 'Nucleus'));
  const patchMat = M(0x2a1f66, { roughness: 0.6 });
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0.62).normalize();
    const p = new THREE.Vector3(...NUC).addScaledVector(dir, NUC_R * 0.97);
    const patch = ellipsoid(p.toArray(), [0.62, 0.62, 0.22], patchMat, 12);
    patch.lookAt(new THREE.Vector3(...NUC));
    patch.userData.pickPriority = 1;
    root.add(pick(patch, 'plasma-nucleus', 'Heterochromatin (clock-face pattern)'));
  }

  // Golgi: a stack of flattened, slightly curved sacs beside the nucleus.
  const golgiMat = M(0xe8c45a, { roughness: 0.4 });
  for (let k = 0; k < 5; k++) {
    const g = ellipsoid([NUC[0] + NUC_R + 0.6 + k * 0.34, NUC[1] + 0.3 + (k - 2) ** 2 * 0.08, NUC[2] + 0.5], [0.14, 1.35 - Math.abs(k - 2) * 0.12, 1.05], golgiMat, 18);
    root.add(pick(g, 'golgi', 'Golgi apparatus'));
  }

  // Rough ER: nested curved sheets with ribosomes.
  const erMat = M(0xd45a86, { roughness: 0.6, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const ribo = [];
  for (let k = 0; k < 6; k++) {
    const s = 0.5 + k * 0.075;
    const sheet = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24, phiStart + 0.1, phiLength - 0.2, 0.35, Math.PI - 0.7), erMat);
    sheet.scale.set(CELL[0] * s, CELL[1] * s, CELL[2] * s);
    sheet.position.set(1.2 * (1 - s), 0, 0);
    root.add(pick(sheet, 'rough-er', 'Rough endoplasmic reticulum'));
    for (let i = 0; i < 520; i++) {
      const phi = phiStart + 0.1 + rand() * (phiLength - 0.2);
      const theta = 0.35 + rand() * (Math.PI - 0.7);
      const x = -Math.cos(phi) * Math.sin(theta) * CELL[0] * s + 1.2 * (1 - s);
      const y = Math.cos(theta) * CELL[1] * s;
      const z = Math.sin(phi) * Math.sin(theta) * CELL[2] * s;
      if (Math.hypot(x - NUC[0], y - NUC[1], z - NUC[2]) < NUC_R + 0.25) continue;
      ribo.push([x * 1.012, y * 1.012, z * 1.012]);
    }
  }
  const riboGeo = new THREE.SphereGeometry(0.075, 6, 4);
  const riboMesh = new THREE.InstancedMesh(riboGeo, M(0x3d2f8c, { roughness: 0.5 }), ribo.length);
  const m4 = new THREE.Matrix4();
  ribo.forEach((p, i) => riboMesh.setMatrixAt(i, m4.makeTranslation(...p)));
  root.add(pick(riboMesh, 'rough-er', 'Ribosome'));

  // Secreted antibodies (enlarged): little Y shapes drifting outward.
  const abMat = M(0xe8c45a, { roughness: 0.4, emissive: 0xe8c45a, emissiveIntensity: 0.2 });
  const antibodies = [];
  for (let i = 0; i < 26; i++) {
    let phi;
    do phi = rand() * Math.PI * 2;
    while (!outsideCut(phi));
    const theta = 0.5 + rand() * (Math.PI - 1);
    const dir = new THREE.Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta));
    if (dir.x < -0.2) continue; // they leave from the side away from the nucleus
    const y = new THREE.Group();
    y.add(capsuleBetween([0, -0.35, 0], [0, 0, 0], 0.07, abMat, 6));
    y.add(capsuleBetween([0, 0, 0], [-0.3, 0.32, 0], 0.07, abMat, 6));
    y.add(capsuleBetween([0, 0, 0], [0.3, 0.32, 0], 0.07, abMat, 6));
    y.traverse((o) => pick(o, 'antibody', 'Antibody (enlarged)'));
    const surface = new THREE.Vector3(dir.x * CELL[0], dir.y * CELL[1], dir.z * CELL[2]);
    const dist = 0.6 + rand() * 4;
    y.position.copy(surface).addScaledVector(dir, dist);
    y.rotation.set(rand() * 6, rand() * 6, rand() * 6);
    root.add(y);
    antibodies.push({ obj: y, dir, surface, dist, speed: 0.4 + rand() * 0.4, spin: rand() - 0.5 });
  }

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    view: { target: [0.6, 0, 0], direction: [0.3, 0.35, 0.9] },
    focus: (antibodies[0]?.obj.position ?? new THREE.Vector3(CELL[0] + 1, 0, 0)).toArray(),
    branchFocus: NUC,
    update(dt, env = {}) {
      if (env.reducedMotion ?? reducedMotion) return;
      for (const a of antibodies) {
        a.dist += a.speed * dt;
        if (a.dist > 5.5) a.dist = 0.4;
        a.obj.position.copy(a.surface).addScaledVector(a.dir, a.dist);
        a.obj.rotation.z += a.spin * dt;
      }
    },
    dispose() {
      cellGeo.dispose();
      riboGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
