// Shared library scene: the 20 amino acids that proteins are built from.
// 1 scene unit = 1 Å. Geometry is generated (RDKit, see tools/gen_molecules.py)
// as each exists at body pH: a charged amine (NH₃⁺) and carboxylate (COO⁻).
// The shared backbone glows violet; the side chain, which makes each one
// different, glows pink. The control steps through all twenty.
import * as THREE from 'three/webgpu';
import { materialBank, disposeTree } from '../scenes/kit.js';
import { buildMolecule } from './molecule.js';
import { MOLECULES, AMINO_ACID_IDS, aminoAcidParts } from './molecules.js';

const TINT = { backbone: 0x6d5bd0, side: 0xf08baf };
const GROUP_TEXT = {
  nonpolar: 'Its side chain is nonpolar: it avoids water, so it tends to be buried inside a folded protein.',
  polar: 'Its side chain is polar: it mixes with water and often sits on a protein’s surface.',
  acidic: 'Its side chain carries a negative charge at body pH.',
  basic: 'Its side chain can carry a positive charge; at body pH histidine is usually neutral.',
};
const GROUP_LABEL = { nonpolar: 'Nonpolar', polar: 'Polar', acidic: 'Acidic', basic: 'Basic' };

/** Atoms with card, label and tint for one amino acid, oriented with the backbone on the left. */
export function aminoAcidAtoms(id) {
  const { atoms, bonds, parts } = aminoAcidParts(id);
  const name = MOLECULES[id].name;
  // Point the side chain up: from the backbone's center toward the side chain's center.
  const center = (want) => {
    const pts = atoms.filter((a, i) => parts[i] === want && a.el !== 'H').map((a) => a.p);
    return pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, pts.length));
  };
  const from = center('backbone');
  const to = center('side');
  if (to.distanceTo(from) > 0.1) {
    const q = new THREE.Quaternion().setFromUnitVectors(to.clone().sub(from).normalize(), new THREE.Vector3(0, 1, 0));
    for (const a of atoms) a.p.sub(from).applyQuaternion(q);
  }
  const mid = atoms.reduce((s, a) => s.add(a.p), new THREE.Vector3()).multiplyScalar(1 / atoms.length);
  for (const a of atoms) a.p.sub(mid);
  atoms.forEach((a, i) => {
    a.tint = TINT[parts[i]];
    a.card = parts[i] === 'backbone' ? 'amino-backbone' : 'side-chain';
    a.label = parts[i] === 'backbone' ? `Backbone (${name})` : `Side chain (${name})`;
  });
  return { atoms, bonds };
}

export function buildAminoAcids({ reducedMotion = false } = {}) {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  let M = materialBank();
  let current = null;

  const show = (index) => {
    const id = AMINO_ACID_IDS[index];
    if (current) {
      spin.remove(current.group);
      current.sphere.dispose();
      current.group.traverse((o) => o.geometry && o.geometry !== current.sphere && o.geometry.dispose());
      M.dispose();
      M = materialBank();
    }
    const { atoms, bonds } = aminoAcidAtoms(id);
    current = buildMolecule(atoms, bonds, M, { defaultCard: 'amino-acids' });
    spin.add(current.group);
  };

  const firstOf = (group) => AMINO_ACID_IDS.findIndex((k) => MOLECULES[k].group === group);
  const controls = {
    label: 'Amino acid',
    unit: '',
    min: 0,
    max: AMINO_ACID_IDS.length - 1,
    step: 1,
    value: AMINO_ACID_IDS.indexOf('leu'),
    format: (v) => MOLECULES[AMINO_ACID_IDS[Math.round(v)]].name,
    presets: Object.keys(GROUP_LABEL).map((g) => ({ label: GROUP_LABEL[g], value: firstOf(g) })),
    readout: '',
    set(v) {
      const index = Math.round(v);
      controls.value = index;
      show(index);
      const m = MOLECULES[AMINO_ACID_IDS[index]];
      controls.readout = `${m.name} (${m.code3}, ${m.code1}), ${index + 1} of 20. ${GROUP_TEXT[m.group]} Violet atoms are the backbone every amino acid shares; pink atoms are its side chain.`;
      return controls.readout;
    },
  };
  controls.set(controls.value);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-10,
    view: { target: [0, 0, 0], direction: [0.25, 0.2, 1] },
    focus: [0, 0, 0],
    controls,
    update(dt) {
      if (!reducedMotion) spin.rotation.y += dt * 0.35;
    },
    dispose() {
      if (current) current.sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
