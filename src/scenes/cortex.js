// Tier 4: a block of cerebral cortex, its six layers and the white matter
// under it. 1 scene unit = 10 µm.
// A generalized 2.5 mm thick cortex (the human average; it ranges from about
// 1 to 4.5 mm). Layer thicknesses are typical proportions; real ones vary by
// region (thick layer IV in sensory areas, thick layer V in motor areas).
// Roughly 1 neuron in 100 is drawn; cell bodies are to scale, dendrites are
// drawn as thin lines and only for some pyramidal cells.
import * as THREE from 'three/webgpu';
import { materialBank, pick, seeded, disposeTree, capsuleBetween } from './kit.js';

export const CORTEX_THICKNESS_UM = 2500;
const T = CORTEX_THICKNESS_UM / 10; // scene units
const W = 300; // block width: 3 mm
const D = 80; // block depth: 0.8 mm
const WHITE = 70; // white matter shown below: 0.7 mm

/** The six layers, top (pia) to bottom, with typical share of thickness and drawn neurons. */
export const LAYERS = [
  { n: 'I', name: 'Layer I: molecular layer', card: 'cortex-layer-i', share: 0.1, cells: 30, kind: 'small', text: 'Layer I, the molecular layer: almost no cell bodies, just a dense mat of dendrite tips and axons running sideways. The tops of pyramidal cells’ dendrites reach up into it.' },
  { n: 'II', name: 'Layer II: external granular layer', card: 'cortex-layer-ii', share: 0.08, cells: 520, kind: 'granule', text: 'Layer II, the external granular layer: small, densely packed neurons that mostly talk to other parts of the cortex.' },
  { n: 'III', name: 'Layer III: external pyramidal layer', card: 'cortex-layer-iii', share: 0.28, cells: 620, kind: 'pyramid', text: 'Layer III, the external pyramidal layer: medium-sized pyramidal neurons whose axons connect one cortical area to another, including across to the other hemisphere.' },
  { n: 'IV', name: 'Layer IV: internal granular layer', card: 'cortex-layer-iv', share: 0.1, cells: 560, kind: 'granule', text: 'Layer IV, the internal granular layer: small star-shaped neurons that receive most of the input from the thalamus. Thick in sensory areas, almost missing in motor cortex.' },
  { n: 'V', name: 'Layer V: internal pyramidal layer', card: 'cortex-layer-v', share: 0.22, cells: 380, kind: 'pyramid', big: true, text: 'Layer V, the internal pyramidal layer: the largest pyramidal neurons, whose axons leave the cortex for the brainstem and spinal cord. In motor cortex the giant Betz cells live here.' },
  { n: 'VI', name: 'Layer VI: multiform layer', card: 'cortex-layer-vi', share: 0.22, cells: 420, kind: 'mixed', text: 'Layer VI, the multiform layer: mixed shapes of neurons, many of which send feedback to the thalamus.' },
];

/** Top and bottom of each layer, in µm below the surface (pia). */
export function layerBounds(thickness = CORTEX_THICKNESS_UM) {
  let top = 0;
  return LAYERS.map((l) => {
    const b = { n: l.n, top, bottom: top + l.share * thickness };
    top = b.bottom;
    return b;
  });
}

export function buildCortex({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2500);
  const bounds = layerBounds();
  const yOf = (um) => T - um / 10; // scene y from depth below the surface

  // Layer bands: translucent slabs, slightly different tints of gray matter.
  const tints = [0xd9cfee, 0xcfc2ea, 0xc6b7e6, 0xd2c4ea, 0xbfaee2, 0xc9bbe6];
  const bands = LAYERS.map((l, i) => {
    const h = (bounds[i].bottom - bounds[i].top) / 10;
    const mat = M(tints[i], { roughness: 0.85, transparent: true, opacity: 0.16, depthWrite: false });
    const box = new THREE.Mesh(new THREE.BoxGeometry(W, h, D), mat);
    box.position.set(0, yOf(bounds[i].top) - h / 2, 0);
    root.add(pick(box, l.card, l.name));
    return { box, mat };
  });

  // Pia mater on top and the white matter below.
  const pia = new THREE.Mesh(new THREE.BoxGeometry(W + 2, 1.5, D + 2), M(0xf08baf, { roughness: 0.6, transparent: true, opacity: 0.5 }));
  pia.position.y = T + 0.75;
  root.add(pick(pia, 'cerebral-cortex', 'Pia mater (the brain’s innermost covering)'));
  const white = new THREE.Mesh(new THREE.BoxGeometry(W, WHITE, D), M(0xf1ece0, { roughness: 0.8, transparent: true, opacity: 0.35, depthWrite: false }));
  white.position.y = -WHITE / 2;
  root.add(pick(white, 'white-matter', 'White matter (myelinated axons)'));
  const axonMat = M.line(0xe8dcc0, { transparent: true, opacity: 0.55 });
  const axonPts = [];
  for (let i = 0; i < 70; i++) {
    const x = (rand() - 0.5) * W;
    const z = (rand() - 0.5) * D;
    axonPts.push(x, 0, z, x + (rand() - 0.5) * 60, -WHITE, z + (rand() - 0.5) * 20);
  }
  const axonGeo = new THREE.BufferGeometry();
  axonGeo.setAttribute('position', new THREE.Float32BufferAttribute(axonPts, 3));
  root.add(pick(new THREE.LineSegments(axonGeo, axonMat), 'white-matter', 'Axons leaving and entering the cortex'));

  // Neurons: instanced cell bodies per layer; apical dendrites as lines for some pyramids.
  const pyramidGeo = new THREE.ConeGeometry(1, 2.2, 6);
  const roundGeo = new THREE.SphereGeometry(1, 8, 6);
  const dendrites = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const cellMeshes = LAYERS.map((l, i) => {
    const pyramid = l.kind === 'pyramid' || (l.kind === 'mixed');
    const mesh = new THREE.InstancedMesh(pyramid ? pyramidGeo : roundGeo, M(i === 4 ? 0x6d5bd0 : 0x7d6bd8, { roughness: 0.5 }), l.cells);
    const top = yOf(bounds[i].top);
    const bottom = yOf(bounds[i].bottom);
    for (let k = 0; k < l.cells; k++) {
      p.set((rand() - 0.5) * (W - 6), bottom + 1.5 + rand() * (top - bottom - 3), (rand() - 0.5) * (D - 6));
      // Soma diameters: granule cells about 10 µm, pyramids 20–30 µm (layer V up to about 50 µm here).
      const r = l.kind === 'granule' ? 0.5 : l.kind === 'small' ? 0.45 : l.big ? 1.2 + rand() * 0.8 : 0.9 + rand() * 0.5;
      q.identity();
      if (l.kind === 'mixed') q.setFromEuler(new THREE.Euler(0, 0, (rand() - 0.5) * 1.2));
      m4.compose(p, q, s.set(r, r, r));
      mesh.setMatrixAt(k, m4);
      if (pyramid && l.kind !== 'mixed' && k % 6 === 0) dendrites.push(p.x, p.y + r, p.z, p.x + (rand() - 0.5) * 4, T - 2, p.z + (rand() - 0.5) * 4);
    }
    root.add(pick(mesh, l.card, `${l.name}: neuron cell bodies`));
    return mesh;
  });
  const dendGeo = new THREE.BufferGeometry();
  dendGeo.setAttribute('position', new THREE.Float32BufferAttribute(dendrites, 3));
  const dendMat = M.line(0xa69cc8, { transparent: true, opacity: 0.45 });
  root.add(pick(new THREE.LineSegments(dendGeo, dendMat), 'pyramidal-neuron', 'Apical dendrites of pyramidal neurons, reaching up to layer I'));

  // Three large layer V pyramidal neurons drawn in full, one leading to the next step.
  const bigMat = M(0xf2a65a, { roughness: 0.45, emissive: 0xf2a65a, emissiveIntensity: 0.35 });
  const vMid = yOf((bounds[4].top + bounds[4].bottom) / 2);
  const featured = [];
  for (const [x, z] of [[-60, 10], [10, -6], [80, 14]]) {
    const g = new THREE.Group();
    const soma = new THREE.Mesh(pyramidGeo, bigMat);
    soma.scale.setScalar(2.4);
    g.add(pick(soma, 'pyramidal-neuron', 'Large layer V pyramidal neuron'));
    g.add(pick(capsuleBetween([0, 2.6, 0], [0, T - vMid - 2, 0], 0.5, bigMat, 6), 'pyramidal-neuron', 'Apical dendrite (to layer I)'));
    for (const a of [-0.7, 0.7]) g.add(pick(capsuleBetween([0, T - vMid - 14, 0], [a * 14, T - vMid - 3, a * 4], 0.3, bigMat, 6), 'pyramidal-neuron', 'Dendrite tuft in layer I'));
    for (const a of [-1, 1]) g.add(pick(capsuleBetween([a * 1.5, -1, 0], [a * 14, -6, a * 3], 0.35, bigMat, 6), 'pyramidal-neuron', 'Basal dendrite'));
    g.add(pick(capsuleBetween([0, -2.4, 0], [3, -vMid - WHITE + 6, 0], 0.25, M(0xe8c45a, { roughness: 0.4 }), 6), 'axon', 'Axon, heading out through the white matter'));
    g.position.set(x, vMid, z);
    root.add(g);
    featured.push(g);
  }

  // A cortical column outline, 0.5 mm across.
  const column = new THREE.Mesh(new THREE.CylinderGeometry(25, 25, T, 40, 1, true), M(0x8fb4f0, { transparent: true, opacity: 0.08, side: THREE.DoubleSide, depthWrite: false }));
  column.position.set(10, T / 2, -6);
  root.add(pick(column, 'cortical-column', 'A cortical column (about 0.5 mm across)'));

  const controls = {
    label: 'Layer',
    unit: '',
    min: 0,
    max: 6,
    step: 1,
    value: 0,
    format: (v) => (Math.round(v) === 0 ? 'All six' : `Layer ${LAYERS[Math.round(v) - 1].n}`),
    presets: [{ label: 'All', value: 0 }, ...LAYERS.map((l, i) => ({ label: l.n, value: i + 1 }))],
    readout: '',
    set(v) {
      const k = Math.round(v);
      controls.value = k;
      bands.forEach((b, i) => {
        const on = k === i + 1;
        b.mat.opacity = k === 0 ? 0.16 : on ? 0.42 : 0.06;
        cellMeshes[i].visible = k === 0 || on || i === 4;
      });
      controls.readout = k === 0
        ? `The cortex is about ${CORTEX_THICKNESS_UM / 1000} mm thick, folded over the whole brain, with six layers numbered from the surface down. Pick a layer to see what lives there. Roughly 1 neuron in 100 is drawn.`
        : LAYERS[k - 1].text;
      return controls.readout;
    },
  };
  controls.set(0);

  return {
    root,
    fit: 'both',
    frameWidth: 5.2e-3,
    metersPerUnit: 1e-5,
    view: { target: [0, T / 2 - 22, 0], direction: [0.32, 0.12, 1] },
    focus: featured[1].position.toArray(),
    controls,
    dispose() {
      pyramidGeo.dispose();
      roundGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
