// Shared library scene: glutamate, the main excitatory neurotransmitter.
// 1 scene unit = 1 Å. Drawn as it exists at body pH: both carboxyl groups
// have lost a proton (COO⁻) and the amine has gained one (NH₃⁺), so the
// molecule carries a net charge of −1 (formula C₅H₈NO₄⁻).
// Built from idealized bond lengths and a fully extended (zigzag) chain.
import * as THREE from 'three/webgpu';
import { materialBank, disposeTree } from '../scenes/kit.js';
import { buildMolecule, tetrahedralRest, trigonalRest, styleControls } from './molecule.js';

const CC = 1.53;
const CN = 1.49;
const CO = 1.26; // carboxylate: the charge is shared, so both C–O bonds are equal
const CH = 1.09;
const NH = 1.03;

/** Atoms and bonds of glutamate(1−). Exported for tests. */
export function glutamateModel() {
  const th = THREE.MathUtils.degToRad((180 - 109.47) / 2);
  const down = new THREE.Vector3(Math.cos(th), -Math.sin(th), 0);
  const up = new THREE.Vector3(Math.cos(th), Math.sin(th), 0);
  const atoms = [];
  const bonds = [];
  const add = (el, p, card, label) => atoms.push({ el, p, card, label }) - 1;
  const bond = (i, j, order = 1) => bonds.push([i, j, order]);
  const dir = (i, j) => atoms[j].p.clone().sub(atoms[i].p).normalize();

  const ca = add('C', new THREE.Vector3(0, 0, 0), 'neurotransmitter', 'Alpha carbon');
  const cb = add('C', atoms[ca].p.clone().addScaledVector(down, CC), 'neurotransmitter', 'Side-chain carbon');
  const cg = add('C', atoms[cb].p.clone().addScaledVector(up, CC), 'neurotransmitter', 'Side-chain carbon');
  const cd = add('C', atoms[cg].p.clone().addScaledVector(down, 1.52), 'carboxylate-group', 'Side-chain carboxylate carbon');
  bond(ca, cb);
  bond(cb, cg);
  bond(cg, cd);

  // Alpha carbon: carboxylate, amine and one hydrogen fill its other three bonds.
  const back = new THREE.Vector3(-Math.cos(th), -Math.sin(th), 0);
  const rest = tetrahedralRest([dir(ca, cb)], 0).sort((a, b) => b.dot(back) - a.dot(back));
  const c1 = add('C', rest[0].clone().multiplyScalar(CC), 'carboxylate-group', 'Carboxylate carbon');
  const n = add('N', rest[1].clone().multiplyScalar(CN), 'amine-group', 'Nitrogen (amine)');
  add('H', rest[2].clone().multiplyScalar(CH), 'neurotransmitter', 'Hydrogen');
  bond(ca, c1);
  bond(ca, n);
  bond(ca, atoms.length - 1);

  // Two carboxylate groups: planar, O–C–O about 125°.
  for (const [c, nb] of [[c1, ca], [cd, cg]]) {
    const b = dir(c, nb);
    const normal = new THREE.Vector3(0, 0, 1).sub(b.clone().multiplyScalar(b.z)).normalize();
    for (const d of trigonalRest(b, normal)) {
      const o = add('O', atoms[c].p.clone().addScaledVector(d, CO), 'carboxylate-group', 'Oxygen (carboxylate, shares −1 charge)');
      bond(c, o, 1);
    }
  }

  // Amine (NH₃⁺): three hydrogens, staggered.
  for (const d of tetrahedralRest([dir(n, ca)], 0.5)) {
    const h = add('H', atoms[n].p.clone().addScaledVector(d, NH), 'amine-group', 'Hydrogen (amine, carries +1 charge)');
    bond(n, h);
  }
  // Two hydrogens on each CH₂ of the side chain.
  for (const [c, a, b] of [[cb, ca, cg], [cg, cb, cd]]) {
    for (const d of tetrahedralRest([dir(c, a), dir(c, b)])) {
      const h = add('H', atoms[c].p.clone().addScaledVector(d, CH), 'neurotransmitter', 'Hydrogen');
      bond(c, h);
    }
  }

  // Center on the heavy-atom centroid.
  const heavy = atoms.filter((a) => a.el !== 'H');
  const center = heavy.reduce((s, a) => s.add(a.p), new THREE.Vector3()).multiplyScalar(1 / heavy.length);
  for (const a of atoms) a.p.sub(center);
  return { atoms, bonds };
}

export function buildNeurotransmitter({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  const { atoms, bonds } = glutamateModel();
  const mol = buildMolecule(atoms, bonds, M, { defaultCard: 'neurotransmitter' });
  spin.add(mol.group);
  const controls = styleControls([mol], [
    'Ball and stick shows every bond: 5 carbons, 1 nitrogen, 4 oxygens and 8 hydrogens.',
    'Space filling shows the room each atom takes up: the whole molecule is under 1 nm long.',
  ]);
  controls.set(0);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-10,
    view: { target: [0, 0, 0], direction: [0.2, 0.35, 1] },
    focus: [0, 0, 0],
    controls,
    update(dt) {
      if (!reducedMotion) spin.rotation.y += dt * 0.3;
    },
    dispose() {
      mol.sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
