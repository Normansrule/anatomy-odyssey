// Shared library scene: one phospholipid, POPC (1-palmitoyl-2-oleoyl-
// phosphatidylcholine), the commonest kind in animal cell membranes.
// 1 scene unit = 1 Å. Geometry is generated with RDKit (tools/gen_molecules.py);
// the conformer with the most extended tails was chosen so it looks the way
// it sits in a membrane. Parts glow: choline (blue), phosphate (orange),
// glycerol (violet), the straight saturated tail (cream) and the kinked
// unsaturated tail (gold). The control switches to space-filling.
import * as THREE from 'three/webgpu';
import { materialBank, disposeTree } from '../scenes/kit.js';
import { buildMolecule, styleControls } from './molecule.js';
import { phospholipidParts } from './molecules.js';

const PART = {
  choline: { tint: 0x5a8deb, card: 'choline-head', label: 'Choline (positive charge)' },
  phosphate: { tint: 0xf2a65a, card: 'phosphate-group', label: 'Phosphate (negative charge)' },
  glycerol: { tint: 0x8f7ff0, card: 'glycerol-backbone', label: 'Glycerol backbone' },
  saturated: { tint: 0xf1e2b8, card: 'fatty-acid-tail', label: 'Palmitoyl tail (saturated, straight)' },
  unsaturated: { tint: 0xe8c45a, card: 'fatty-acid-tail', label: 'Oleoyl tail (one cis double bond, kinked)' },
};

export function phospholipidAtoms() {
  const { atoms, bonds, parts } = phospholipidParts('popc');
  // Stand it up: head (phosphorus) at the top, tails hanging down.
  const p = atoms.find((a) => a.el === 'P').p.clone();
  const tails = atoms.filter((a, i) => (parts[i] === 'saturated' || parts[i] === 'unsaturated') && a.el === 'C').map((a) => a.p);
  const tailCenter = tails.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / tails.length);
  const q = new THREE.Quaternion().setFromUnitVectors(p.clone().sub(tailCenter).normalize(), new THREE.Vector3(0, 1, 0));
  const mid = p.clone().add(tailCenter).multiplyScalar(0.5);
  for (const a of atoms) a.p.sub(mid).applyQuaternion(q);
  atoms.forEach((a, i) => Object.assign(a, PART[parts[i]]));
  return { atoms, bonds, parts };
}

export function buildPhospholipid({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const { atoms, bonds } = phospholipidAtoms();
  const mol = buildMolecule(atoms, bonds, M, { defaultCard: 'phospholipids' });
  spin.add(mol.group);
  const controls = styleControls([mol], [
    'Head at the top: choline (blue) and phosphate (orange) carry opposite charges and love water. Below the glycerol (violet) hang two oily tails that avoid it.',
    'Space filling: the whole molecule is about 2.5 nm long, half the thickness of a membrane. Two of them tail to tail make the bilayer.',
  ]);
  controls.set(0);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-10,
    view: { target: [0, 0, 0], direction: [0.3, 0.1, 1] },
    focus: [0, 4, 0],
    controls,
    update(dt) {
      if (!reducedMotion) spin.rotation.y += dt * 0.25;
    },
    dispose() {
      mol.sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
