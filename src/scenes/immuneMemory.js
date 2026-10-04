// Module scene: the first and second time you meet the same germ.
// 1 scene unit = 1 µm for the tissue strip; the chart above it is a chart.
//
// Top: a chart of an illustrative model (src/science/immuneModel.js) over
// 140 days, on log scales: germs (green), antibody (violet) and memory B
// cells (gold). The second exposure is on day 90.
// Bottom: a strip of tissue whose contents follow the model at the chosen
// day. Cells and bacteria are to scale; antibodies (about 0.01 µm) are drawn
// as dots about 40 times too big, and their numbers are a log-scale cue.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, capsuleBetween, seeded, disposeTree, tubeThrough } from './kit.js';
import { simulateImmune, stateAt, responseSummary, IMMUNE_PARAMS, ANTIBODY_DETECTABLE } from '../science/immuneModel.js';

export const IMMUNE_SIM = simulateImmune();
const T2 = IMMUNE_PARAMS.t2;
const DAYS = IMMUNE_PARAMS.days;
export const PRIMARY = responseSummary(IMMUNE_SIM, 0, T2);
export const SECONDARY = responseSummary(IMMUNE_SIM, T2, DAYS);

const CHART = { x0: -30, x1: 30, y0: 3, y1: 21 };
const STRIP = { x0: -30, x1: 30, y0: -21, y1: -3 };
const xOfDay = (d) => CHART.x0 + ((CHART.x1 - CHART.x0) * d) / DAYS;
const logScale = (v, floor, top) => Math.max(0, Math.min(1, Math.log10(Math.max(v, floor) / floor) / Math.log10(top / floor)));
const maxOf = (a) => a.reduce((m, v) => Math.max(m, v), 0);
const SCALES = {
  P: [1, maxOf(IMMUNE_SIM.P) * 1.3],
  A: [ANTIBODY_DETECTABLE, maxOf(IMMUNE_SIM.A) * 1.3], // flat until antibody is detectable
  R: [1, maxOf(IMMUNE_SIM.R) * 1.3],
};
const yOf = (key, v) => CHART.y0 + (CHART.y1 - CHART.y0) * logScale(v, ...SCALES[key]);

const sci = (v) => {
  if (v < 1) return 'none';
  if (v < 1000) return `about ${Math.round(v)}`;
  const e = Math.floor(Math.log10(v));
  return `about ${Math.round(v / 10 ** e)} × 10${String(e).replace(/\d/g, (d) => '⁰¹²³⁴⁵⁶⁷⁸⁹'[d])}`;
};

/** How many of each thing the tissue strip shows on a given day. */
export function stripCounts(s) {
  return {
    bacteria: Math.min(28, Math.round(5 * Math.log10(1 + s.P))),
    neutrophils: Math.min(3, Math.round(s.I * 2)),
    plasma: Math.min(3, Math.round(Math.log10(1 + s.E * 30) * 1.6)),
    memory: Math.min(3, Math.round(Math.log10(1 + s.R) * 1.2)),
    antibodies: Math.min(110, Math.round(32 * Math.log10(1 + s.A * 10))),
  };
}

export function memoryReadout(day) {
  const s = stateAt(IMMUNE_SIM, day);
  const second = day >= T2;
  const since = second ? day - T2 : day;
  const nums = `Germs: ${sci(s.P)}. Antibody: ${s.A.toFixed(s.A < 1 ? 2 : 1)} (relative). Memory B cells: ${s.R.toFixed(0)} (relative).`;
  const ratio = Math.round(SECONDARY.peakA / PRIMARY.peakA);
  let story;
  if (!second && since < 1.5) story = 'The germ gets in and multiplies. Neutrophils and macrophages (innate defenses) start within hours, but they only slow it down.';
  else if (!second && s.P > 0) story = 'First infection: the few B cells that fit this germ are multiplying, which takes days. Antibody is only starting to appear.';
  else if (!second) story = 'Antibody has cleared the germ. Most responding cells die off; memory B cells keep maturing for weeks and then stay.';
  else if (since < 0.6) story = 'The same germ again.';
  else if (s.P > 0) story = 'Memory B cells recognize it at once and turn into plasma cells, so antibody climbs within a day or two and the germ never gets going.';
  else story = `The second response peaks about ${ratio} times higher than the first, and the germ never made you ill. Vaccines work by giving you the first response safely.`;
  return `Day ${Math.round(day)}${second ? ` (day ${Math.round(since)} after the second exposure)` : ''}. ${story} ${nums}`;
}

export function buildImmuneMemory({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(90);

  // ── Chart ──
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(CHART.x1 - CHART.x0 + 6, CHART.y1 - CHART.y0 + 5), M(0x241d45, { roughness: 0.95 }));
  panel.position.set((CHART.x0 + CHART.x1) / 2, (CHART.y0 + CHART.y1) / 2, -1);
  root.add(pick(panel, 'immune-memory', 'Chart: 140 days, log scales'));
  const axisMat = M(0xb8b0dc, { roughness: 0.6 });
  root.add(pick(capsuleBetween([CHART.x0, CHART.y0, 0], [CHART.x1, CHART.y0, 0], 0.12, axisMat, 6), 'immune-memory', 'Days 0 to 140'));
  root.add(pick(capsuleBetween([CHART.x0, CHART.y0, 0], [CHART.x0, CHART.y1, 0], 0.12, axisMat, 6), 'immune-memory', 'Amount (log scale)'));
  for (let d = 0; d <= DAYS; d += 10) {
    const big = d % 30 === 0;
    root.add(pick(capsuleBetween([xOfDay(d), CHART.y0, 0], [xOfDay(d), CHART.y0 - (big ? 1 : 0.5), 0], 0.08, axisMat, 6), 'immune-memory', `Day ${d}`));
  }
  const curve = (key, color, card, label) => {
    const pts = [];
    for (let d = 0; d <= DAYS; d += 0.5) pts.push([xOfDay(d), yOf(key, stateAt(IMMUNE_SIM, d)[key]), 0.2]);
    const mesh = tubeThrough(pts, 0.28, M(color, { roughness: 0.4, emissive: color, emissiveIntensity: 0.35 }), pts.length * 2, 6);
    root.add(pick(mesh, card, label));
    const dot = ellipsoid([0, 0, 0.3], [0.8, 0.8, 0.8], M(color, { roughness: 0.3, emissive: color, emissiveIntensity: 0.8 }), 12);
    root.add(pick(dot, card, label));
    return { key, dot };
  };
  const curves = [
    curve('P', 0x7cc49a, 'bacteria', 'Germs (log scale)'),
    curve('A', 0x8f7ff0, 'antibody', 'Antibody (log scale)'),
    curve('R', 0xe8c45a, 'memory-b-cell', 'Memory B cells (log scale)'),
  ];
  for (const d of [0, T2]) root.add(pick(ellipsoid([xOfDay(d), CHART.y0 - 1.8, 0.2], [0.9, 0.9, 0.9], M(0x7cc49a, { emissive: 0x7cc49a, emissiveIntensity: 0.6 }), 12), d ? 'secondary-response' : 'primary-response', d ? 'Second exposure (day 90)' : 'First exposure (day 0)'));
  const cursor = capsuleBetween([0, CHART.y0, 0.1], [0, CHART.y1, 0.1], 0.1, M.basic(0xf2f0fa, { transparent: true, opacity: 0.6 }), 6);
  root.add(pick(cursor, 'immune-memory', 'Today'));

  // ── Tissue strip ──
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(STRIP.x1 - STRIP.x0 + 6, STRIP.y1 - STRIP.y0 + 4), M(0x3a2f5c, { roughness: 0.9 }));
  ground.position.set(0, (STRIP.y0 + STRIP.y1) / 2, -7);
  root.add(pick(ground, 'immune-memory', 'Tissue'));
  const inStrip = (margin = 0) => [STRIP.x0 + margin + rand() * (STRIP.x1 - STRIP.x0 - 2 * margin), STRIP.y0 + margin + rand() * (STRIP.y1 - STRIP.y0 - 2 * margin)];
  const pool = (n, makeOne) => Array.from({ length: n }, (_, i) => {
    const o = makeOne(i);
    root.add(o);
    return o;
  });
  const bacMat = M(0x7cc49a, { roughness: 0.35, emissive: 0x7cc49a, emissiveIntensity: 0.3 });
  const bacteria = pool(28, () => {
    const [x, y] = inStrip(2);
    const b = capsuleBetween([-0.55, 0, 0], [0.55, 0, 0], 0.45, bacMat, 8);
    b.position.set(x, y, 2 + rand() * 2);
    b.rotation.z = rand() * Math.PI;
    return pick(b, 'bacteria', 'Bacterium');
  });
  const cell = (r, color, nucColor, card, label, x, y, z) => {
    const g = new THREE.Group();
    g.add(pick(ellipsoid([0, 0, 0], [r, r, r], M(color, { roughness: 0.5, transparent: true, opacity: 0.6, depthWrite: false }), 22), card, label));
    g.add(pick(ellipsoid([r * 0.15, 0, 0.4], [r * 0.55, r * 0.5, r * 0.5], M(nucColor, { roughness: 0.45 }), 14), card, `${label}: nucleus`));
    g.position.set(x, y, z);
    root.add(g);
    return g;
  };
  const yMid = (STRIP.y0 + STRIP.y1) / 2;
  const neutrophils = [-22, -6, 10].map((x, i) => cell(5.5, 0xf1eef8, COLORS.hematoxylin, 'neutrophil', 'Neutrophil (innate)', x, yMid + (i % 2 ? 3 : -2), -3));
  const plasma = [-14, 2, 18].map((x, i) => cell(6, 0xc7b8f2, COLORS.hemaDeep, 'plasma-cell', 'Plasma cell (makes antibody)', x, yMid + (i % 2 ? -3 : 3), -4.5));
  const memory = [-26, -2, 24].map((x, i) => cell(3.75, 0xe8c45a, COLORS.hematoxylin, 'memory-b-cell', 'Memory B cell', x, yMid + (i % 2 ? 5 : -5), -2));
  const abGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const antibodies = new THREE.InstancedMesh(abGeo, M(0x8f7ff0, { roughness: 0.3, emissive: 0x8f7ff0, emissiveIntensity: 0.7 }), 110);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 110; i++) {
    const [x, y] = inStrip(1);
    m4.makeTranslation(x, y, 3 + rand() * 2);
    antibodies.setMatrixAt(i, m4);
  }
  antibodies.count = 0;
  antibodies.frustumCulled = false;
  root.add(pick(antibodies, 'antibody', 'Antibodies (dots, drawn about 40× too big)'));

  function apply(day) {
    const s = stateAt(IMMUNE_SIM, day);
    const x = xOfDay(day);
    cursor.position.x = x;
    for (const c of curves) c.dot.position.set(x, yOf(c.key, s[c.key]), 0.3);
    const n = stripCounts(s);
    bacteria.forEach((b, i) => (b.visible = i < n.bacteria));
    neutrophils.forEach((g, i) => (g.visible = i < n.neutrophils));
    plasma.forEach((g, i) => (g.visible = i < n.plasma));
    memory.forEach((g, i) => (g.visible = i < n.memory));
    antibodies.count = n.antibodies;
  }

  let hold = 0;
  const controls = {
    label: 'Day',
    unit: '',
    min: 0,
    max: DAYS,
    step: 0.5,
    value: reducedMotion ? 4 : 0,
    format: (v) => `Day ${Math.round(v)}`,
    presets: [
      { label: 'First infection', value: 0 },
      { label: 'Day 7', value: 7 },
      { label: 'Day 21', value: 21 },
      { label: 'Same germ again', value: T2 },
      { label: 'Day 94', value: T2 + 4 },
      { label: 'Play or pause', action: 'play' },
    ],
    playing: !reducedMotion,
    readout: '',
    set(v) {
      controls.value = v;
      apply(v);
      controls.readout = memoryReadout(v);
      return controls.readout;
    },
  };
  controls.set(controls.value);

  return {
    root,
    fit: 'both',
    frameWidth: 1.0e-4, // wide enough to stay clear of the side panel
    metersPerUnit: 1e-6,
    view: { target: [0, 0, 0], direction: [0, 0.05, 1] },
    focus: [xOfDay(T2), yMid, 0],
    controls,
    update(dt) {
      if (!controls.playing) return;
      if (controls.value >= DAYS) {
        hold += dt;
        if (hold > 2.5) {
          hold = 0;
          controls.set(0);
        }
        return;
      }
      // Slow down around each exposure, where the action is.
      const busy = controls.value < 25 || (controls.value > T2 - 1 && controls.value < T2 + 15);
      controls.set(Math.min(DAYS, controls.value + dt * (busy ? 3.5 : 12)));
    },
    dispose() {
      abGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
