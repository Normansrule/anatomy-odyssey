// Module scene: the cells of the immune system side by side, at their true
// relative sizes. 1 scene unit = 1 µm.
// Diameters are mid-range textbook values (OpenStax Anatomy and Physiology,
// section 18.4; alveolar macrophage from Krombach et al., 1997). Internal
// details (nucleus shapes, granules) are simplified; granules are drawn larger
// and fewer than life. The virus is drawn to scale, so it is a speck: the
// faint ring around it only marks where it is.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, capsuleBetween, seeded, disposeTree, fibonacciSphere } from './kit.js';
import { rbcGeometry } from './rbcShape.js';

/** The lineup, with diameters in µm. Row 1 then row 2, left to right. */
export const LINEUP = [
  { id: 'neutrophil', name: 'Neutrophil', d: 11, row: 0, text: 'Neutrophil, about 10–12 µm: the most common white blood cell and the first to reach an infection. Lives about a day once it is in the tissue.' },
  { id: 'eosinophil', name: 'Eosinophil', d: 11, row: 0, text: 'Eosinophil, about 10–12 µm: two-lobed nucleus and orange-pink granules. Fights parasites, and is involved in allergies and asthma.' },
  { id: 'basophil', name: 'Basophil', d: 9, row: 0, text: 'Basophil, about 8–10 µm: the rarest white blood cell, packed with dark granules of histamine, like a mast cell that travels in the blood.' },
  { id: 'monocyte', name: 'Monocyte', d: 16, row: 0, text: 'Monocyte, about 12–20 µm: the largest white cell in blood, with a kidney-shaped nucleus. It leaves the blood and becomes a macrophage or a dendritic cell.' },
  { id: 'macrophage', name: 'Macrophage', d: 21, row: 0, text: 'Macrophage, about 21 µm (lung macrophages measured): a big eater that lives in tissues, swallows germs and debris, and raises the alarm.' },
  { id: 'red-blood-cell', name: 'Red blood cell', d: 7.8, row: 1, text: 'Red blood cell, 7.8 µm across (for scale; it is not an immune cell). The immune cells around it are mostly bigger.' },
  { id: 'platelet', name: 'Platelet', d: 3, row: 1, text: 'Platelet, about 2–4 µm: a cell fragment that plugs leaks. It also releases signals that help start inflammation.' },
  { id: 'lymphocyte', name: 'Small lymphocyte (B or T cell)', d: 7.5, row: 1, text: 'Small lymphocyte, about 6–9 µm: a B or T cell, almost all nucleus. B and T cells look the same under a light microscope; each carries receptors for one particular target.' },
  { id: 'nk-cell', name: 'Natural killer cell', d: 12, row: 1, text: 'Natural killer cell, about 10–14 µm: a large lymphocyte with granules of cell-killing proteins. It destroys virus-infected and cancerous cells without needing to have met them before.' },
  { id: 'plasma-cell', name: 'Plasma cell', d: 12, row: 1, text: 'Plasma cell, about 10–14 µm: an antibody factory, made from a B cell. Its nucleus sits off to one side; the rest is protein-making machinery.' },
  { id: 'dendritic-cell', name: 'Dendritic cell', d: 11, reach: 25, row: 1, text: 'Dendritic cell, a body about 10–12 µm with long arms: it samples the tissue, carries what it finds to a lymph node, and shows it to T cells.' },
  { id: 'bacteria', name: 'Bacterium', d: 2, row: 1, text: 'Bacterium (E. coli), about 2 µm long and 1 µm wide, to scale. A neutrophil can swallow several.' },
  { id: 'virus', name: 'Virus', d: 0.1, row: 1, text: 'Influenza virus, about 0.1 µm, to scale: a speck next to the cells that fight it. The faint ring only marks where it is. Viruses are fought mostly by antibodies, killer T cells and natural killer cells.' },
];

const GAP = 3.6;
const ROW_Y = [11, -13];

/** x centers for each lineup member, rows centered on x = 0. */
export function lineupLayout(list = LINEUP) {
  const out = new Map();
  for (const row of [0, 1]) {
    const items = list.filter((c) => c.row === row);
    const width = items.reduce((s, c) => s + (c.reach ?? c.d), 0) + GAP * (items.length - 1);
    let x = -width / 2;
    for (const c of items) {
      const w = c.reach ?? c.d;
      out.set(c.id, [x + w / 2, ROW_Y[row], 0]);
      x += w + GAP;
    }
  }
  return out;
}

export function buildImmuneCells({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(311);
  const at = lineupLayout();
  const nodes = new Map();
  const cyto = (color) => M(color, { roughness: 0.55, transparent: true, opacity: 0.55, depthWrite: false });
  const nucMat = M(COLORS.hematoxylin, { roughness: 0.45 });
  const deepNuc = M(COLORS.hemaDeep, { roughness: 0.45 });
  const granules = (g, n, r, rad, mat, id, label) => {
    for (const p of fibonacciSphere(n)) {
      const k = 0.35 + 0.6 * rand();
      g.add(pick(ellipsoid([p.x * r * k, p.y * r * k, p.z * r * k], [rad, rad, rad], mat, 8), id, label));
    }
  };

  const make = {
    neutrophil(g, r) {
      g.add(pick(ellipsoid([0, 0, 0], [r, r, r], cyto(0xf1eef8), 28), 'neutrophil', 'Neutrophil'));
      for (const [x, y] of [[-2, 1], [0.4, 2.1], [2.4, 0.2], [0.3, -1.9]]) g.add(pick(ellipsoid([x, y, 0.5], [1.6, 1.3, 1.4], nucMat, 12), 'neutrophil', 'Lobed nucleus'));
    },
    eosinophil(g, r) {
      g.add(pick(ellipsoid([0, 0, 0], [r, r, r], cyto(0xf6c3d4), 28), 'eosinophil', 'Eosinophil'));
      g.add(pick(ellipsoid([-1.8, 0.4, 0.5], [1.9, 1.5, 1.5], nucMat, 14), 'eosinophil', 'Two-lobed nucleus'));
      g.add(pick(ellipsoid([1.8, 0.4, 0.5], [1.9, 1.5, 1.5], nucMat, 14), 'eosinophil', 'Two-lobed nucleus'));
      granules(g, 46, r * 0.92, 0.45, M(0xf2a65a, { roughness: 0.4 }), 'eosinophil', 'Granule');
    },
    basophil(g, r) {
      g.add(pick(ellipsoid([0, 0, 0], [r, r, r], cyto(0xc9bfe6), 26), 'basophil', 'Basophil'));
      g.add(pick(ellipsoid([0, 0, 0], [2.4, 2.0, 2.0], nucMat, 14), 'basophil', 'Nucleus (hidden by granules)'));
      granules(g, 40, r * 0.9, 0.55, deepNuc, 'basophil', 'Histamine granule');
    },
    monocyte(g, r) {
      g.add(pick(ellipsoid([0, 0, 0], [r, r, r], cyto(0xd8d2ef), 30), 'monocyte', 'Monocyte'));
      const kidney = new THREE.Mesh(new THREE.TorusGeometry(3.0, 1.9, 14, 24, Math.PI * 1.25), nucMat);
      kidney.rotation.z = -0.4 * Math.PI;
      kidney.position.set(-0.6, 0, 0.5);
      g.add(pick(kidney, 'monocyte', 'Kidney-shaped nucleus'));
    },
    macrophage(g, r) {
      const mat = M(0xe8c45a, { roughness: 0.5, transparent: true, opacity: 0.7, depthWrite: false });
      g.add(pick(ellipsoid([0, 0, 0], [r * 0.85, r * 0.75, r * 0.6], mat, 30), 'macrophage', 'Macrophage'));
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + rand() * 0.4;
        g.add(pick(capsuleBetween([Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.5, 0], [Math.cos(a) * r * 1.0, Math.sin(a) * r * 0.95, (rand() - 0.5) * 3], 1.1, mat, 8), 'macrophage', 'Pseudopod (reaching arm)'));
      }
      g.add(pick(ellipsoid([-2, 1, 1], [3.4, 2.8, 2.6], nucMat, 16), 'macrophage', 'Nucleus'));
      for (let k = 0; k < 4; k++) g.add(pick(capsuleBetween([2 + k * 1.3, -2 - rand() * 2, 2], [2.6 + k * 1.3, -1 - rand() * 2, 2], 0.45, M(0x7cc49a, { roughness: 0.4 }), 8), 'macrophage', 'Swallowed bacterium'));
    },
    'red-blood-cell'(g) {
      const m = new THREE.Mesh(rbcGeometry(1, { segments: 40 }), M(COLORS.artery, { roughness: 0.4 }));
      m.rotation.x = Math.PI / 2 - 0.35;
      g.add(pick(m, 'red-blood-cell', 'Red blood cell (for scale)'));
    },
    platelet(g, r) {
      g.add(pick(ellipsoid([0, 0, 0], [r, r * 0.45, r], M(0xd9b8e8, { roughness: 0.5 }), 18), 'platelet', 'Platelet'));
    },
    lymphocyte(g, r) {
      g.add(pick(ellipsoid([0, 0, 0], [r, r, r], cyto(0x9fb4e8), 24), 'lymphocyte', 'Small lymphocyte'));
      g.add(pick(ellipsoid([0.3, 0, 0.3], [r * 0.82, r * 0.82, r * 0.82], nucMat, 20), 'lymphocyte', 'Large round nucleus'));
    },
    'nk-cell'(g, r) {
      g.add(pick(ellipsoid([0, 0, 0], [r, r, r], cyto(0xb9c6ef), 26), 'nk-cell', 'Natural killer cell'));
      g.add(pick(ellipsoid([0.9, 0.4, 0.4], [3.4, 3.2, 3.0], nucMat, 18), 'nk-cell', 'Nucleus'));
      granules(g, 12, r * 0.8, 0.5, M(0xe35d6a, { roughness: 0.4 }), 'nk-cell', 'Granule of cell-killing proteins');
    },
    'plasma-cell'(g, r) {
      g.add(pick(ellipsoid([0, 0, 0], [r * 1.1, r * 0.85, r * 0.85], cyto(0xc7b8f2), 28), 'plasma-cell', 'Plasma cell'));
      g.add(pick(ellipsoid([-r * 0.45, 0, 0.5], [2.6, 2.6, 2.4], nucMat, 16), 'plasma-cell', 'Off-center nucleus'));
      g.add(pick(ellipsoid([r * 0.15, 0, 0.6], [1.8, 1.6, 1.2], M(0xf6e7c8, { roughness: 0.6 }), 12), 'plasma-cell', 'Golgi (pale zone)'));
    },
    'dendritic-cell'(g, r, c) {
      const mat = M(0x7cc49a, { roughness: 0.5, transparent: true, opacity: 0.75, depthWrite: false });
      g.add(pick(ellipsoid([0, 0, 0], [r, r * 0.85, r * 0.8], mat, 24), 'dendritic-cell', 'Dendritic cell'));
      g.add(pick(ellipsoid([0, 0, 0.5], [2.6, 2.2, 2.2], nucMat, 14), 'dendritic-cell', 'Nucleus'));
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2 + 0.3;
        const len = c.reach / 2 - 0.6 - rand() * 2;
        g.add(pick(capsuleBetween([Math.cos(a) * r * 0.7, Math.sin(a) * r * 0.6, 0], [Math.cos(a) * len, Math.sin(a) * len * 0.85, (rand() - 0.5) * 4], 0.55, mat, 6), 'dendritic-cell', 'Long arm (dendrite)'));
      }
    },
    bacteria(g) {
      const b = capsuleBetween([-0.55, 0, 0], [0.55, 0, 0], 0.45, M(0x7cc49a, { roughness: 0.35, emissive: 0x7cc49a, emissiveIntensity: 0.3 }), 10);
      b.rotation.z += 0.5;
      g.add(pick(b, 'bacteria', 'Bacterium (to scale)'));
    },
    virus(g, r) {
      g.add(pick(ellipsoid([0, 0, 0], [r, r, r], M(0xe8c45a, { roughness: 0.3, emissive: 0xe8c45a, emissiveIntensity: 1 }), 12), 'virus', 'Virus (to scale)'));
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.06, 6, 40), M.basic(0xe8c45a, { transparent: true, opacity: 0.55 }));
      g.add(pick(ring, 'virus', 'Marker ring around the virus (not part of it)'));
    },
  };

  for (const c of LINEUP) {
    const g = new THREE.Group();
    g.position.set(...at.get(c.id));
    make[c.id](g, c.d / 2, c);
    root.add(g);
    nodes.set(c.id, g);
  }

  // A highlight ring under the chosen cell.
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.035, 8, 64), M.basic(0xf2f0fa, { transparent: true, opacity: 0.8 }));
  root.add(pick(ring, 'immune-cell-lineup', 'Selected cell'));

  const controls = {
    label: 'Cell',
    unit: '',
    min: 0,
    max: LINEUP.length - 1,
    step: 1,
    value: 0,
    format: (v) => LINEUP[Math.round(v)].name,
    presets: [
      { label: 'Neutrophil', value: 0 },
      { label: 'Macrophage', value: 4 },
      { label: 'Lymphocyte', value: 7 },
      { label: 'Virus', value: LINEUP.length - 1 },
    ],
    readout: '',
    set(v) {
      const i = Math.max(0, Math.min(LINEUP.length - 1, Math.round(v)));
      controls.value = i;
      const c = LINEUP[i];
      const size = Math.max(c.reach ?? c.d, 2) / 2 + 1.2;
      ring.position.copy(nodes.get(c.id).position);
      ring.scale.setScalar(size);
      controls.readout = c.text;
      return controls.readout;
    },
  };
  controls.set(0);

  let t = 0;
  return {
    root,
    fit: 'both',
    frameWidth: 1.4e-4, // wide enough to stay clear of the side panel
    metersPerUnit: 1e-6,
    view: { target: [6, -1, 0], direction: [0.06, 0.1, 1] },
    focus: at.get('lymphocyte'),
    controls,
    update(dt, env = {}) {
      if (env.reducedMotion ?? reducedMotion) return;
      t += dt;
      // A slow wobble so the shapes read as solid.
      nodes.forEach((g, id) => {
        if (id !== 'virus') g.rotation.y = Math.sin(t * 0.5 + g.position.x * 0.1) * 0.35;
      });
    },
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
