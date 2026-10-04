// Module scene: the bicarbonate buffer that holds blood near pH 7.4.
// 1 scene unit = 1 Å. Molecules are generated with RDKit (carbonic acid,
// bicarbonate, water, hydronium) or use the experimental CO₂ geometry.
//
//   CO₂ + H₂O  ⇌  H₂CO₃  ⇌  H⁺ + HCO₃⁻      (the H⁺ rides on a water as H₃O⁺)
//
// The control is the CO₂ pressure in the blood, which your breathing sets.
// More CO₂ pushes the reaction to the right, making more H⁺ and lowering pH.
// The number of CO₂ and H₃O⁺ drawn tracks the model; real counts differ
// hugely (there are about 600,000 bicarbonate ions for every free H⁺).
import * as THREE from 'three/webgpu';
import { materialBank, pick, disposeTree, cylinderBetween } from './kit.js';
import { smallMolecule, carbonDioxide } from './chem.js';
import { bloodPH, hydrogenNanomolar, CO2_SOLUBILITY, NORMAL_HCO3_MM } from '../science/chemistry.js';

export const BUFFER_SPECIES = [
  { id: 'co2', card: 'carbon-dioxide', label: 'Carbon dioxide (CO₂)' },
  { id: 'water', card: 'water-molecule', label: 'Water (H₂O)' },
  { id: 'h2co3', card: 'carbonic-acid', label: 'Carbonic acid (H₂CO₃)' },
  { id: 'hco3', card: 'bicarbonate', label: 'Bicarbonate (HCO₃⁻)' },
  { id: 'h3o', card: 'hydronium', label: 'Hydronium (H₃O⁺), a proton on a water' },
];

export function bufferReadout(pco2) {
  const ph = bloodPH(NORMAL_HCO3_MM, pco2);
  const dissolved = CO2_SOLUBILITY * pco2;
  const ratio = NORMAL_HCO3_MM / dissolved;
  const h = hydrogenNanomolar(ph);
  const verdict = ph < 7.35
    ? 'Below 7.35 is acidosis: breathing faster would blow off the extra CO₂.'
    : ph > 7.45
      ? 'Above 7.45 is alkalosis: this is what over-breathing does.'
      : 'The normal range is 7.35–7.45.';
  return `CO₂ ${Math.round(pco2)} mmHg → ${dissolved.toFixed(2)} mM dissolved CO₂ against ${NORMAL_HCO3_MM} mM bicarbonate (${ratio.toFixed(0)} to 1) → pH ${ph.toFixed(2)}, free H⁺ about ${Math.round(h)} nM. ${verdict}`;
}

/** How many CO₂ and H₃O⁺ to draw for a CO₂ pressure (1 to 4 each). */
export function bufferCounts(pco2) {
  const ph = bloodPH(NORMAL_HCO3_MM, pco2);
  const clamp = (x) => Math.max(1, Math.min(4, Math.round(x)));
  return { co2: clamp(pco2 / 20), h3o: clamp(hydrogenNanomolar(ph) / 20) };
}

const STATION = { left: -13, mid: -1, right: 10.5 };

function arrow(from, to, M, card) {
  const g = new THREE.Group();
  const mat = M(0xb8b0dc, { roughness: 0.5 });
  const dir = to.clone().sub(from).normalize();
  const tip = to.clone().addScaledVector(dir, -0.7);
  g.add(pick(cylinderBetween(from.toArray(), tip.toArray(), 0.09, 0.09, mat, 8), card, 'Reaction arrow'));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.7, 12), mat);
  cone.position.copy(tip).addScaledVector(dir, 0.35);
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.add(pick(cone, card, 'Reaction arrow'));
  return g;
}

export function buildBicarbonateBuffer({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const spinners = [];
  const disposables = [];
  const place = (mol, x, y, z = 0) => {
    const g = new THREE.Group().add(mol.group);
    g.position.set(x, y, z);
    root.add(g);
    disposables.push(mol);
    spinners.push({ g, w: 0.2 + spinners.length * 0.07, tilt: spinners.length * 0.9 });
    return g;
  };
  const spec = Object.fromEntries(BUFFER_SPECIES.map((s) => [s.id, s]));
  const mol = (id) => (id === 'co2' ? carbonDioxide(M) : smallMolecule(id, M, { card: spec[id].card, label: spec[id].label }));

  // Left: CO₂ molecules (1–4, set by the control) beside a water.
  const co2s = [0, 1, 2, 3].map((k) => place(mol('co2'), STATION.left - 2 + (k % 2) * 4, 2.4 + Math.floor(k / 2) * 3, -k * 0.5));
  place(mol('water'), STATION.left, -2);
  // Middle: carbonic acid. Right: bicarbonate, plus hydronium ions (1–4).
  place(mol('h2co3'), STATION.mid, 0.2);
  place(mol('hco3'), STATION.right - 1, 1.6);
  const h3os = [0, 1, 2, 3].map((k) => place(mol('h3o'), STATION.right - 1.5 + (k % 2) * 3.4, -2.4 - Math.floor(k / 2) * 2.8, -k * 0.5));

  // Equilibrium arrows: forward above, back below.
  for (const [a, b] of [[STATION.left + 3.4, STATION.mid - 2.4], [STATION.mid + 2.4, STATION.right - 4]]) {
    root.add(arrow(new THREE.Vector3(a, 0.6, 0), new THREE.Vector3(b, 0.6, 0), M, 'bicarbonate-buffer'));
    root.add(arrow(new THREE.Vector3(b, -0.4, 0), new THREE.Vector3(a, -0.4, 0), M, 'bicarbonate-buffer'));
  }

  // A backdrop that shifts from violet (basic) to pink (acidic) with pH.
  const backdrop = new THREE.Mesh(new THREE.PlaneGeometry(240, 160), M.basic(0xffffff, { transparent: true, opacity: 0.12, depthWrite: false }));
  backdrop.position.set(-1, 0, -6);
  root.add(pick(backdrop, 'bicarbonate-buffer', 'Blood plasma (color shows pH)'));
  const acid = new THREE.Color(0xf08baf);
  const base = new THREE.Color(0x6d5bd0);

  const controls = {
    label: 'Blood CO₂',
    unit: 'mmHg',
    min: 20,
    max: 80,
    step: 1,
    value: 40,
    format: (v) => `${Math.round(v)}`,
    presets: [
      { label: 'Over-breathing', value: 25 },
      { label: 'Normal', value: 40 },
      { label: 'Under-breathing', value: 60 },
    ],
    readout: '',
    set(v) {
      controls.value = v;
      const n = bufferCounts(v);
      co2s.forEach((g, k) => (g.visible = k < n.co2));
      h3os.forEach((g, k) => (g.visible = k < n.h3o));
      const ph = bloodPH(NORMAL_HCO3_MM, v);
      backdrop.material.color.copy(base).lerp(acid, Math.min(1, Math.max(0, (7.7 - ph) / 0.6)));
      controls.readout = bufferReadout(v);
      return controls.readout;
    },
  };
  controls.set(40);

  let t = 0;
  return {
    root,
    fit: 'both',
    frameWidth: 5e-9, // wide enough to stay clear of the side panel
    metersPerUnit: 1e-10,
    view: { target: [-1, 0.6, 0], direction: [0.08, 0.22, 1] },
    focus: [STATION.right - 1.2, 0.2, 0],
    controls,
    update(dt, env = {}) {
      if (env.reducedMotion ?? reducedMotion) return;
      t += dt;
      for (const s of spinners) s.g.rotation.set(Math.sin(t * s.w + s.tilt) * 0.5, t * s.w + s.tilt, 0);
    },
    dispose() {
      for (const m of disposables) m.sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
