// Module scene: a dendritic cell presents germ pieces, and the one helper T
// cell that fits them docks and multiplies. 1 scene unit = 1 µm.
// Cells are to scale with each other (dendritic cell body about 12 µm, T cells
// 7.5 µm). MHC molecules (about 7 nm) are drawn as knobs more than 100 times too
// big, and the germ pieces about 5 times too big. Timing is compressed from
// days into seconds; real clones keep dividing for days.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, capsuleBetween, seeded, disposeTree, fibonacciSphere } from './kit.js';
import { stagedControls, ramp } from './stages.js';
import { clonalCells, T_CELL_DIVISION_HOURS } from '../science/tcells.js';

export const PRESENTATION_STAGES = [
  { label: 'Capture', text: 'Capture. Out in the tissue, a dendritic cell swallows pieces of a germ (its antigens).' },
  { label: 'Display', text: 'Display. It chops them into short peptides and shows them on MHC class II molecules, then travels to a lymph node.' },
  { label: 'Search', text: 'Search. T cells stream past. Each carries one kind of receptor, and almost all of them do not fit, so they move on.' },
  { label: 'Match', text: 'Match. A helper T cell whose receptor fits the displayed peptide docks and holds on: an immunological synapse.' },
  { label: 'Divide', text: 'Divide. Switched on, the T cell copies itself again and again.' },
  { label: 'Clone', text: 'Clone. Sixteen identical helper T cells after four divisions. Real clones keep going for days, to thousands of cells, then leave to help B cells and killer T cells.' },
];

const DC = new THREE.Vector3(-16, 0, 0);
const DC_R = 6;
const T_R = 3.75;
const CLONE = new THREE.Vector3(4, 0, 0);

/** Generations of division shown at slider value v (0 to 4 between Divide and Clone). */
export function generationsAt(v) {
  return Math.floor(Math.min(1, Math.max(0, (v - 4.15) / 0.75)) * 4 + 1e-9);
}

export function presentationReadout(v, stage) {
  const base = PRESENTATION_STAGES[stage].text;
  if (stage !== 4) return base;
  const g = generationsAt(v);
  const n = clonalCells(g);
  return `${base} ${n} ${n === 1 ? 'cell' : 'cells'} after ${g} ${g === 1 ? 'division' : 'divisions'}, about ${g * T_CELL_DIVISION_HOURS} hours at ${T_CELL_DIVISION_HOURS} hours each.`;
}

export function buildAntigenPresentation({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(64);

  // Lymph node backdrop: a few reticular fibers.
  const fiberMat = M(0x8f86b8, { roughness: 0.8, transparent: true, opacity: 0.18, depthWrite: false });
  for (let i = 0; i < 7; i++) {
    const y = -20 + i * 6.5 + rand() * 3;
    root.add(pick(capsuleBetween([-34, y, -22], [30, y + (rand() - 0.5) * 14, -24], 0.18, fiberMat, 6), 'antigen-presentation', 'Lymph node fiber'));
  }

  // Dendritic cell.
  const dcMat = M(0x7cc49a, { roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false });
  root.add(pick(ellipsoid(DC.toArray(), [DC_R, DC_R * 0.88, DC_R * 0.85], dcMat, 30), 'dendritic-cell', 'Dendritic cell'));
  root.add(pick(ellipsoid([DC.x - 1.5, DC.y + 0.5, DC.z], [2.6, 2.2, 2.2], M(COLORS.hematoxylin, { roughness: 0.45 }), 16), 'dendritic-cell', 'Dendritic cell nucleus'));
  for (let k = 0; k < 8; k++) {
    const a = Math.PI * 0.55 + (k / 7) * Math.PI * 0.9 + (rand() - 0.5) * 0.2; // arms reach left, away from the T cells
    const len = 9 + rand() * 3;
    root.add(pick(capsuleBetween([DC.x + Math.cos(a) * DC_R * 0.7, DC.y + Math.sin(a) * DC_R * 0.6, 0], [DC.x + Math.cos(a) * len, DC.y + Math.sin(a) * len * 0.9, (rand() - 0.5) * 6], 0.6, dcMat, 6), 'dendritic-cell', 'Dendritic cell arm'));
  }

  // Germ pieces: drift in, then are cut into peptides.
  const germMat = M(0x9be37a, { roughness: 0.4, emissive: 0x9be37a, emissiveIntensity: 0.5 });
  const fragments = Array.from({ length: 10 }, (_, i) => {
    const m = pick(capsuleBetween([-0.6, 0, 0], [0.6, 0, 0], 0.35, germMat, 8), 'antigen', 'Germ piece (antigen)');
    m.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    root.add(m);
    const ang = (i / 10) * Math.PI * 2;
    const from = new THREE.Vector3(DC.x - 14 + Math.cos(ang) * 4, Math.sin(ang) * 14, (rand() - 0.5) * 6);
    const to = DC.clone().add(new THREE.Vector3((rand() - 0.5) * 5, (rand() - 0.5) * 5, (rand() - 0.5) * 4));
    return { m, from, to };
  });

  // MHC class II molecules on the side facing the T cells.
  const mhcStem = M(0xb8b0dc, { roughness: 0.5 });
  const pepMat = M(0x9be37a, { roughness: 0.35, emissive: 0x9be37a, emissiveIntensity: 0.8 });
  const knobs = fibonacciSphere(60).filter((p) => p.x > 0.25).slice(0, 18).map((p) => {
    const g = new THREE.Group();
    const base = DC.clone().add(new THREE.Vector3(p.x * DC_R, p.y * DC_R * 0.88, p.z * DC_R * 0.85));
    g.position.copy(base);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p.clone().normalize());
    g.add(pick(capsuleBetween([0, 0, 0], [0, 0.9, 0], 0.22, mhcStem, 6), 'mhc-class-ii', 'MHC class II (drawn more than 100× too big)'));
    g.add(pick(ellipsoid([0, 1.05, 0], [0.32, 0.22, 0.32], pepMat, 10), 'mhc-class-ii', 'Germ peptide on MHC class II'));
    root.add(g);
    return g;
  });

  // T cells.
  const tCell = (color, card, label) => {
    const g = new THREE.Group();
    g.add(pick(ellipsoid([0, 0, 0], [T_R, T_R, T_R], M(color, { roughness: 0.5, transparent: true, opacity: 0.7, depthWrite: false }), 22), card, label));
    g.add(pick(ellipsoid([0.3, 0, 0.3], [T_R * 0.8, T_R * 0.8, T_R * 0.8], M(COLORS.hematoxylin, { roughness: 0.45 }), 16), card, `${label}: nucleus`));
    root.add(g);
    return g;
  };
  const passers = [0, 1, 2].map((i) => ({
    g: tCell(0x9fb4e8, 'lymphocyte', 'T cell whose receptor does not fit'),
    from: new THREE.Vector3(9 + i * 3, 13 - i * 2, -4 + i * 3),
    near: DC.clone().add(new THREE.Vector3(DC_R + T_R + 0.6, 6 - i * 6, -2 + i * 2)),
    to: new THREE.Vector3(10 + i * 2, -15 + i * 1.5, -6 - i * 2),
    t0: 2 + i * 0.28,
  }));
  const dockAt = DC.clone().add(new THREE.Vector3(DC_R + T_R - 0.4, 0, 0));
  const helper = tCell(0xf2a65a, 'helper-t-cell', 'Helper T cell whose receptor fits');
  const clonePoints = [new THREE.Vector3(), ...fibonacciSphere(15).map((p) => p.multiplyScalar(7.4))].map((p) => p.add(CLONE));
  const clones = clonePoints.slice(1).map(() => tCell(0xf2a65a, 'clonal-expansion', 'Copy of the helper T cell'));
  const synapse = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.18, 8, 40), M(0xf2f0fa, { roughness: 0.3, emissive: 0xf2f0fa, emissiveIntensity: 0.6 }));
  synapse.rotation.y = Math.PI / 2;
  synapse.position.copy(DC).add(new THREE.Vector3(DC_R - 0.2, 0, 0));
  root.add(pick(synapse, 'immunological-synapse', 'Immunological synapse (contact ring)'));

  const tmp = new THREE.Vector3();
  function apply(v) {
    const captured = ramp(v, 0.05, 0.95);
    const cut = ramp(v, 1, 1.6);
    for (const f of fragments) {
      f.m.position.lerpVectors(f.from, f.to, captured);
      f.m.scale.setScalar(1 - 0.55 * cut);
    }
    const shown = ramp(v, 1.2, 1.9);
    knobs.forEach((k, i) => {
      k.visible = shown > i / knobs.length;
      k.scale.setScalar(Math.max(0.01, shown));
    });
    for (const p of passers) {
      const a = ramp(v, p.t0, p.t0 + 0.3);
      const b = ramp(v, p.t0 + 0.35, p.t0 + 0.7);
      tmp.lerpVectors(p.from, p.near, a).lerp(p.to, b);
      p.g.position.copy(tmp);
      p.g.visible = true; // T cells mill about the lymph node before and after their turn
    }
    // The helper arrives, docks, then moves to the middle of its growing clone.
    const arrive = ramp(v, 3, 3.8);
    const center = ramp(v, 4, 4.15);
    helper.position.lerpVectors(new THREE.Vector3(14, 2, 3), dockAt, arrive).lerp(clonePoints[0], center);
    helper.visible = true;
    helper.scale.set(1 - 0.12 * ramp(v, 3.6, 3.9) * (1 - center), 1, 1);
    synapse.visible = v > 3.65 && v < 4.1;
    const n = clonalCells(generationsAt(v));
    clones.forEach((g, i) => {
      const on = i + 1 < n;
      g.visible = on;
      if (on) g.position.copy(clonePoints[i + 1]);
    });
  }

  const { controls, update } = stagedControls({ stages: PRESENTATION_STAGES, apply, readout: presentationReadout, reducedMotion, rate: 0.3 });

  return {
    root,
    fit: 'both',
    frameWidth: 7.4e-5,
    metersPerUnit: 1e-6,
    view: { target: [-8, 0, 0], direction: [0.08, 0.16, 1] },
    focus: dockAt.toArray(),
    controls,
    update,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
