// Shared library scene: nucleotides, the units DNA and RNA are built from.
// 1 scene unit = 1 Å. Each is a nucleoside monophosphate as at body pH
// (phosphate 2−), generated with RDKit (tools/gen_molecules.py). Its three
// parts glow in different colors: phosphate (orange), sugar (violet) and
// base (the base's color in the DNA scene). The control steps through the
// four DNA nucleotides (deoxyribose) and the four RNA nucleotides (ribose).
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, disposeTree } from '../scenes/kit.js';
import { buildMolecule } from './molecule.js';
import { MOLECULES, NUCLEOTIDE_IDS, nucleotideParts } from './molecules.js';

export const BASE_COLORS = { A: COLORS.baseA, T: COLORS.baseT, G: COLORS.baseG, C: COLORS.baseC, U: 0xc77dff };
const BASE_NAMES = { A: 'adenine', T: 'thymine', G: 'guanine', C: 'cytosine', U: 'uracil' };
const PURINES = new Set(['A', 'G']);

/** Atoms with part cards and tints, oriented phosphate left, base right. */
export function nucleotideAtoms(id) {
  const { atoms, bonds, parts } = nucleotideParts(id);
  const m = MOLECULES[id];
  const center = (want) => {
    const pts = atoms.filter((a, i) => parts[i] === want && a.el !== 'H').map((a) => a.p);
    return pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
  };
  const from = center('phosphate');
  const to = center('base');
  const q = new THREE.Quaternion().setFromUnitVectors(to.clone().sub(from).normalize(), new THREE.Vector3(1, 0, 0));
  const mid = from.clone().add(to).multiplyScalar(0.5);
  for (const a of atoms) a.p.sub(mid).applyQuaternion(q);
  const sugar = m.polymer === 'DNA' ? 'Deoxyribose sugar' : 'Ribose sugar';
  atoms.forEach((a, i) => {
    const part = parts[i];
    if (part === 'phosphate') Object.assign(a, { tint: 0xf2a65a, card: 'phosphate-group', label: 'Phosphate group' });
    else if (part === 'sugar') Object.assign(a, { tint: 0x8f7ff0, card: 'nucleotide-sugar', label: sugar });
    else Object.assign(a, { tint: BASE_COLORS[m.base], card: 'nucleobase', label: `Base: ${BASE_NAMES[m.base]} (${m.base})` });
  });
  return { atoms, bonds };
}

export function buildNucleotides({ reducedMotion = false } = {}) {
  const root = new THREE.Group();
  const spin = new THREE.Group();
  root.add(spin);
  let M = materialBank();
  let current = null;

  const show = (index) => {
    if (current) {
      spin.remove(current.group);
      current.group.traverse((o) => o.geometry && o.geometry !== current.sphere && o.geometry.dispose());
      current.sphere.dispose();
      M.dispose();
      M = materialBank();
    }
    const { atoms, bonds } = nucleotideAtoms(NUCLEOTIDE_IDS[index]);
    current = buildMolecule(atoms, bonds, M, { defaultCard: 'nucleotides' });
    spin.add(current.group);
  };

  const controls = {
    label: 'Nucleotide',
    unit: '',
    min: 0,
    max: NUCLEOTIDE_IDS.length - 1,
    step: 1,
    value: 0,
    format: (v) => {
      const m = MOLECULES[NUCLEOTIDE_IDS[Math.round(v)]];
      return `${m.base} (${m.polymer})`;
    },
    presets: [
      { label: 'DNA letters', value: 0 },
      { label: 'RNA letters', value: 4 },
    ],
    readout: '',
    set(v) {
      const index = Math.round(v);
      controls.value = index;
      show(index);
      const m = MOLECULES[NUCLEOTIDE_IDS[index]];
      const ring = PURINES.has(m.base) ? 'a purine, with two fused rings' : 'a pyrimidine, with one ring';
      const sugar = m.polymer === 'DNA' ? 'deoxyribose, which lacks an oxygen at its 2′ carbon' : 'ribose, with an extra –OH at its 2′ carbon';
      controls.readout = `${m.name}. Base ${BASE_NAMES[m.base]} (${ring}); sugar ${sugar}; one phosphate. ${m.polymer === 'RNA' && m.base === 'U' ? 'RNA uses uracil where DNA uses thymine.' : ''}`.trim();
      return controls.readout;
    },
  };
  controls.set(controls.value);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-10,
    view: { target: [0, 0, 0], direction: [0.15, 0.35, 1] },
    focus: [0, 0, 0],
    controls,
    update(dt) {
      if (!reducedMotion) spin.rotation.x += dt * 0.3;
    },
    dispose() {
      if (current) current.sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
