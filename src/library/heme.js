// Shared library scene: heme with bound oxygen. 1 scene unit = 1 Å.
// Ball-and-stick model of the porphyrin core: four pyrrole rings joined by
// four bridging (meso) carbons, iron in the center held from below by the
// protein's proximal histidine, and O₂ bound end-on above at about 120°.
// Built from idealized bond lengths; hydrogens and the eight side groups of
// protoporphyrin IX are left out for clarity.
import * as THREE from 'three/webgpu';
import { materialBank, pick, cylinderBetween, disposeTree } from '../scenes/kit.js';

const ATOM = {
  C: { color: 0x8f86b8, r: 0.36 },
  N: { color: 0x5a8deb, r: 0.36 },
  O: { color: 0xff5a5a, r: 0.38 },
  Fe: { color: 0xf2a65a, r: 0.62 },
};
const FE_N = 2.0; // Å, iron to porphyrin nitrogen
const RING_BOND = 1.38; // Å, bonds in the aromatic ring

/** Atom positions and bonds of the model. Exported for tests. */
export function hemeModel() {
  const atoms = [{ el: 'Fe', p: new THREE.Vector3(0, 0, 0), role: 'iron' }];
  const bonds = [];
  const add = (el, p, role) => atoms.push({ el, p, role }) - 1;
  const pentR = RING_BOND / (2 * Math.sin(Math.PI / 5)); // circumradius of a regular pentagon
  const alphas = []; // per ring: [Cα on the clockwise side, Cα on the counter-clockwise side]
  for (let i = 0; i < 4; i++) {
    const th = (i * Math.PI) / 2;
    const out = new THREE.Vector3(Math.cos(th), 0, Math.sin(th));
    const center = out.clone().multiplyScalar(FE_N + pentR);
    const ring = [];
    for (let k = 0; k < 5; k++) {
      const a = th + Math.PI + (k * 2 * Math.PI) / 5; // k = 0 points at the iron
      const p = center.clone().add(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(pentR));
      ring.push(add(k === 0 ? 'N' : 'C', p, k === 0 ? 'pyrrole N' : k === 1 || k === 4 ? 'Cα' : 'Cβ'));
    }
    for (let k = 0; k < 5; k++) bonds.push([ring[k], ring[(k + 1) % 5]]);
    bonds.push([0, ring[0]]); // Fe–N
    alphas.push([ring[1], ring[4]]);
  }
  // Meso carbons bridge neighboring rings.
  for (let i = 0; i < 4; i++) {
    const ai = alphas[i][1]; // this ring's counter-clockwise Cα
    const bi = alphas[(i + 1) % 4][0]; // the next ring's clockwise Cα
    const mid = atoms[ai].p.clone().add(atoms[bi].p).multiplyScalar(0.5);
    const half = atoms[ai].p.distanceTo(atoms[bi].p) / 2;
    // Push outward until both C–C bonds are the ring bond length.
    const meso = mid.clone().setLength(mid.length() + Math.sqrt(Math.max(0, RING_BOND ** 2 - half ** 2)));
    const m = add('C', meso, 'meso C');
    bonds.push([ai, m], [m, bi]);
  }
  // Proximal histidine (imidazole ring) below the iron.
  const nHis = add('N', new THREE.Vector3(0, -2.1, 0), 'histidine N');
  bonds.push([0, nHis]);
  const imR = RING_BOND / (2 * Math.sin(Math.PI / 5));
  const imCenter = new THREE.Vector3(0, -2.1 - imR, 0);
  let prev = nHis;
  const imIdx = [nHis];
  for (let k = 1; k < 5; k++) {
    const a = Math.PI / 2 + (k * 2 * Math.PI) / 5;
    const p = imCenter.clone().add(new THREE.Vector3(Math.cos(a) * imR, Math.sin(a) * imR, 0));
    const idx = add(k === 3 ? 'N' : 'C', p, 'histidine ring');
    bonds.push([prev, idx]);
    prev = idx;
    imIdx.push(idx);
  }
  bonds.push([prev, nHis]);
  // O₂ bound end-on above the iron, bent at about 120°.
  const o1 = add('O', new THREE.Vector3(0, 1.8, 0), 'oxygen');
  const o2 = add('O', new THREE.Vector3(1.21 * Math.sin(Math.PI / 3), 1.8 + 1.21 * Math.cos(Math.PI / 3), 0), 'oxygen');
  bonds.push([0, o1], [o1, o2]);
  return { atoms, bonds };
}

export function buildHeme() {
  const M = materialBank();
  const root = new THREE.Group();
  const mol = new THREE.Group();
  root.add(mol);
  const { atoms, bonds } = hemeModel();
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const cardFor = (role) => {
    if (role === 'iron') return ['heme-iron', 'Iron (Fe²⁺)'];
    if (role === 'oxygen') return ['oxygen-binding', 'Oxygen (O₂)'];
    if (role.startsWith('histidine')) return ['proximal-histidine', 'Proximal histidine'];
    return ['porphyrin', role === 'pyrrole N' ? 'Porphyrin nitrogen' : 'Porphyrin carbon'];
  };
  for (const a of atoms) {
    const spec = ATOM[a.el];
    const mesh = new THREE.Mesh(sphere, M(spec.color, { roughness: 0.35, metalness: a.el === 'Fe' ? 0.3 : 0 }));
    mesh.position.copy(a.p);
    mesh.scale.setScalar(spec.r);
    const [card, label] = cardFor(a.role);
    mol.add(pick(mesh, card, label));
  }
  const bondMat = M(0xd8d2ee, { roughness: 0.5 });
  for (const [i, j] of bonds) {
    const [card, label] = cardFor(atoms[i].role === 'iron' ? atoms[j].role : atoms[i].role);
    mol.add(pick(cylinderBetween(atoms[i].p.toArray(), atoms[j].p.toArray(), 0.12, 0.12, bondMat, 10), card, `Bond (${label.toLowerCase()})`));
  }
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-10,
    view: { target: [0, -0.6, 0], direction: [0.55, 0.62, 0.9] },
    focus: [0, 0, 0],
    update(dt, env = {}) {
      if (!env.reducedMotion) mol.rotation.y += dt * 0.25;
    },
    dispose() {
      sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
