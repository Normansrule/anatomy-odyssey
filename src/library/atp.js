// Shared library scene: ATP, the cell's energy carrier. 1 scene unit = 1 Å.
// Geometry for ATP⁴⁻ is generated with RDKit (tools/gen_molecules.py).
// The control runs hydrolysis: a water molecule approaches the outermost
// (gamma) phosphate, the bond to it breaks, and inorganic phosphate drifts
// away, leaving ADP:  ATP⁴⁻ + H₂O → ADP³⁻ + HPO₄²⁻ + H⁺.
import * as THREE from 'three/webgpu';
import { materialBank, pick, cylinderBetween, disposeTree } from '../scenes/kit.js';
import { buildMolecule, ELEMENTS } from './molecule.js';
import { nucleotideParts } from './molecules.js';
import { ATP_DELTA_G0 } from '../science/equations.js';

const TINT = { base: 0xf0b23e, sugar: 0x8f7ff0, alpha: 0xf2a65a, beta: 0xf2a65a, gamma: 0xff7a3d };
const LABEL = { base: 'Adenine', sugar: 'Ribose', alpha: 'Alpha phosphate', beta: 'Beta phosphate', gamma: 'Gamma phosphate (the one that leaves)' };
const CARD = { base: 'nucleobase', sugar: 'nucleotide-sugar', alpha: 'atp', beta: 'atp', gamma: 'phosphoanhydride-bond' };

export function buildAtp({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const { atoms, bonds, parts, phosphates } = nucleotideParts('atp');
  const [, pBeta, pGamma] = phosphates;

  // Lay the molecule out with the triphosphate tail pointing to +x.
  const adenineC = atoms.filter((a, i) => parts[i] === 'base' && a.el !== 'H').map((a) => a.p);
  const baseCenter = adenineC.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / adenineC.length);
  const tail = atoms[pGamma].p.clone();
  const q = new THREE.Quaternion().setFromUnitVectors(tail.clone().sub(baseCenter).normalize(), new THREE.Vector3(1, 0, 0));
  const mid = baseCenter.clone().add(tail).multiplyScalar(0.5);
  for (const a of atoms) a.p.sub(mid).applyQuaternion(q);
  atoms.forEach((a, i) => Object.assign(a, { tint: TINT[parts[i]], card: CARD[parts[i]], label: LABEL[parts[i]] }));

  // Split into ADP (everything else) and the leaving PO₃ group (gamma P and its three outer oxygens).
  const isGamma = (i) => parts[i] === 'gamma';
  const keepIdx = atoms.map((_, i) => i).filter((i) => !isGamma(i));
  const goIdx = atoms.map((_, i) => i).filter(isGamma);
  const remap = (idx) => new Map(idx.map((old, k) => [old, k]));
  const keepMap = remap(keepIdx);
  const goMap = remap(goIdx);
  const adp = buildMolecule(keepIdx.map((i) => atoms[i]), bonds.filter(([i, j]) => keepMap.has(i) && keepMap.has(j)).map(([i, j, o]) => [keepMap.get(i), keepMap.get(j), o]), M, { defaultCard: 'atp' });
  const po3 = buildMolecule(goIdx.map((i) => atoms[i]), bonds.filter(([i, j]) => goMap.has(i) && goMap.has(j)).map(([i, j, o]) => [goMap.get(i), goMap.get(j), o]), M, { defaultCard: 'phosphoanhydride-bond' });
  root.add(adp.group);
  const leaving = new THREE.Group();
  leaving.add(po3.group);
  root.add(leaving);

  // The breaking bond: from the beta–gamma bridging oxygen to the gamma phosphorus.
  const bridge = bonds.find(([i, j]) => (j === pGamma && !isGamma(i)) || (i === pGamma && !isGamma(j)));
  const bridgeO = bridge[0] === pGamma ? bridge[1] : bridge[0];
  const bondMat = M(0xff7a3d, { roughness: 0.4, emissive: 0xff7a3d, emissiveIntensity: 0.6 });
  const bond = pick(cylinderBetween(atoms[bridgeO].p.toArray(), atoms[pGamma].p.toArray(), 0.13, 0.13, bondMat, 10), 'phosphoanhydride-bond', 'Phosphoanhydride bond (breaks)');
  root.add(bond);

  // Water: approaches the gamma phosphorus from the side opposite the bridging oxygen.
  const away = atoms[pGamma].p.clone().sub(atoms[bridgeO].p).normalize();
  const attackAt = atoms[pGamma].p.clone().addScaledVector(away, 1.75);
  const startAt = atoms[pGamma].p.clone().addScaledVector(away, 7).add(new THREE.Vector3(0, 3, 0));
  const water = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const ow = new THREE.Mesh(sphere, M(ELEMENTS.O.color, { roughness: 0.3 }));
  ow.scale.setScalar(ELEMENTS.O.ball);
  const h1 = new THREE.Mesh(sphere, M(ELEMENTS.H.color, { roughness: 0.3 }));
  const h2 = new THREE.Mesh(sphere, M(ELEMENTS.H.color, { roughness: 0.3 }));
  for (const [h, ang] of [[h1, 0.91], [h2, -0.91]]) {
    h.scale.setScalar(ELEMENTS.H.ball);
    h.position.set(Math.sin(ang) * 0.96, Math.cos(ang) * 0.96, 0); // O–H 0.96 Å, H–O–H 104.5°
  }
  for (const m of [ow, h1, h2]) water.add(pick(m, 'atp-hydrolysis', 'Water (H₂O)'));
  root.add(water);

  const ease = (x) => x * x * (3 - 2 * x);
  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const controls = {
    label: 'Hydrolysis',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: reducedMotion ? 1 : 0,
    format: (v) => (v < 0.45 ? 'ATP' : v < 0.55 ? 'Bond breaking' : 'ADP + phosphate'),
    presets: [
      { label: 'ATP', value: 0 },
      { label: 'Water attacks', value: 0.45 },
      { label: 'ADP + phosphate', value: 1 },
      { label: 'Play or pause', action: 'play' },
    ],
    playing: !reducedMotion,
    readout: '',
    set(v) {
      controls.value = v;
      const a = ease(clamp01(v / 0.45));
      const b = ease(clamp01((v - 0.5) / 0.5));
      water.position.lerpVectors(startAt, attackAt, a);
      water.lookAt(atoms[pGamma].p);
      // After the bond breaks, the water's oxygen and one hydrogen travel with the phosphate;
      // the other hydrogen leaves as a proton (H⁺).
      leaving.position.copy(away).multiplyScalar(5.5 * b).add(new THREE.Vector3(0, -1.5 * b, 0));
      if (v >= 0.5) {
        water.position.copy(attackAt).add(leaving.position);
        h2.position.set(Math.sin(-0.91) * (0.96 + 4 * b), Math.cos(-0.91) * (0.96 + 4 * b), 0);
      } else {
        h2.position.set(Math.sin(-0.91) * 0.96, Math.cos(-0.91) * 0.96, 0);
      }
      bond.visible = v < 0.5;
      bond.scale.y = v < 0.45 ? 1 : 1 + (v - 0.45) * 12; // stretches just before it breaks
      controls.readout = v < 0.5
        ? `ATP carries three phosphates in a row. Their negative charges repel, and the bond to the outermost one (glowing) is about to break when water attacks.`
        : `ATP⁴⁻ + H₂O → ADP³⁻ + HPO₄²⁻ + H⁺. Under standard conditions this releases about ${-ATP_DELTA_G0} kJ/mol; at the concentrations inside a cell it is closer to 50–60 kJ/mol.`;
      return controls.readout;
    },
  };
  controls.set(controls.value);

  let phase = controls.value;
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-10,
    view: { target: [1.5, -0.5, 0], direction: [0.12, 0.3, 1] },
    focus: atoms[pBeta].p.toArray(),
    controls,
    update(dt) {
      if (!controls.playing) {
        phase = controls.value;
        return;
      }
      phase = (phase + dt * 0.18) % 1.35; // hold on ADP + phosphate before repeating
      controls.set(Math.min(1, phase));
    },
    dispose() {
      sphere.dispose();
      adp.sphere.dispose();
      po3.sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
