// Tier 5: an inner hair cell. 1 scene unit = 1 µm.
// A flask-shaped cell held by supporting cells, its bundle of stereocilia in
// three rows graded from shortest to tallest, neighbors tied tip to side by
// thin protein links (OpenStax A&P 14.1: "protein fibers tether adjacent
// hairs"). At its base, a nerve ending of a spiral ganglion neuron waits
// below a synaptic ribbon ringed with vesicles. Proportions are drawn, not
// measured; links, channels, ions and vesicles are drawn far larger.
// The stage control follows one deflection of the bundle to a nerve impulse.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, cylinderBetween, ellipsoid, tubeThrough, seeded, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const BUNDLE_ROWS = [2.2, 3.6, 5.2]; // stereocilia heights by row, shortest to tallest
const PER_ROW = 7;
const TOP = 12; // apical surface of the cell
const BASE = -14;

export const HAIR_CELL_STAGES = [
  { label: 'At rest', text: 'At rest. The stereocilia stand in rows from shortest to tallest, each tied to its taller neighbor by a fine protein link at its tip.' },
  { label: 'Bundle bends', text: 'The bundle bends. Sound rocks the basilar membrane, and the stereocilia, pressed against the tectorial membrane, tip toward the tallest row.' },
  { label: 'Channels open', text: 'Channels open. The links tighten and pull open ion channels at the stereocilia tips. Positive ions, mostly potassium from the fluid above, rush in and depolarize the cell.' },
  { label: 'Glutamate out', text: 'Glutamate out. Depolarized, the cell releases vesicles of glutamate, an excitatory neurotransmitter, from the ribbon at its base onto the nerve ending.' },
  { label: 'Nerve fires', text: 'The nerve fires. The spiral ganglion neuron fires an action potential toward the brainstem. Bending the other way closes the channels, so the signal follows the sound wave.' },
];

export function buildHairCell({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1717);
  const dot = new THREE.SphereGeometry(1, 10, 8);

  // Supporting cells and the cell's reticular surface around the top.
  const support = M(0xf0d0d8, { roughness: 0.6 });
  for (const [x, z] of [[-10, -2], [10, -1], [-6, -9], [6, -9]]) root.add(pick(ellipsoid([x, -2, z], [5.5, 13.5, 5.5], support, 22), 'organ-of-corti', 'Supporting cell'));
  const plate = new THREE.Mesh(new THREE.BoxGeometry(34, 0.6, 24), M(0xe6c0cc, { roughness: 0.6, transparent: true, opacity: 0.6, depthWrite: false }));
  plate.position.set(0, TOP + 0.2, -3);
  root.add(pick(plate, 'organ-of-corti', 'Surface of the organ of Corti (endolymph above, kept apart from the fluid below)'));

  // The hair cell: a flask, see-through, with its nucleus.
  const cellMat = M(0xe8a0c8, { roughness: 0.35, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, emissive: 0xff70b0, emissiveIntensity: 0 });
  const profile = [[0, BASE], [3.5, BASE + 0.6], [5.6, BASE + 5], [6, BASE + 12], [5, BASE + 19], [4, TOP - 2], [4.2, TOP]].map(([r, y]) => new THREE.Vector2(r, y));
  root.add(pick(new THREE.Mesh(new THREE.LatheGeometry(profile, 40), cellMat), 'inner-hair-cell', 'Inner hair cell (drawn see-through)'));
  root.add(pick(ellipsoid([0, BASE + 8, 0], [3.2, 3.6, 3.2], M(COLORS.hematoxylin, { roughness: 0.5 }), 20), 'inner-hair-cell', 'Nucleus'));
  root.add(pick(ellipsoid([0, TOP - 0.6, 0], [3.8, 0.6, 3.8], M(0xc87aa8, { roughness: 0.5 }), 20), 'stereocilia', 'Cuticular plate (anchors the stereocilia)'));

  // Stereocilia: three rows, shortest at the front (+z), tallest at the back.
  const ciliaMat = M(0xf5e6a8, { roughness: 0.4 });
  const linkMat = M(0x7cc49a, { roughness: 0.4, emissive: 0x7cc49a, emissiveIntensity: 0.2 });
  const chanMat = M(0xe86a8a, { roughness: 0.4, emissive: 0xe86a8a, emissiveIntensity: 0.1 });
  const bundle = new THREE.Group();
  bundle.position.y = TOP;
  root.add(bundle);
  const rowsZ = [1.4, 0, -1.4];
  BUNDLE_ROWS.forEach((h, r) => {
    for (let i = 0; i < PER_ROW; i++) {
      const x = (i - (PER_ROW - 1) / 2) * 0.95 * (1 - Math.abs(i - 3) * 0.02);
      const z = rowsZ[r] - Math.abs(x) * 0.12;
      const c = capsuleBetween([x, 0, z], [x, h, z], 0.22, ciliaMat, 6);
      bundle.add(pick(c, 'stereocilia', `Stereocilium (row ${r + 1} of 3)`));
      if (r < 2) {
        // Tip link from this tip up to the side of the taller neighbor behind it.
        const zb = rowsZ[r + 1] - Math.abs(x) * 0.12;
        bundle.add(pick(cylinderBetween([x, h, z], [x, h + 0.9, zb], 0.05, 0.05, linkMat, 4), 'stereocilia', 'Tip link (a protein tether)'));
        bundle.add(pick(ellipsoid([x, h + 0.05, z], [0.18, 0.12, 0.18], chanMat, 8), 'stereocilia', 'Ion channel at the tip (opened when the link pulls)'));
      }
    }
  });

  // Base: synaptic ribbon and vesicles; the nerve ending below.
  const ribbon = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.4, 0.4), M(0x3a2a40, { roughness: 0.5 }));
  ribbon.position.set(0.6, BASE + 1.6, 1.4);
  root.add(pick(ribbon, 'inner-hair-cell', 'Synaptic ribbon (holds vesicles ready)'));
  const vesMat = M(0xffe28a, { roughness: 0.3, emissive: 0xffd36a, emissiveIntensity: 0.4 });
  const vesicles = Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const m = pick(new THREE.Mesh(dot, vesMat), 'neurotransmitter', 'Vesicle of glutamate');
    m.scale.setScalar(0.28);
    m.userData.home = new THREE.Vector3(0.6 + Math.cos(a) * 0.55, BASE + 1.6 + Math.sin(a) * 0.9, 1.4 + Math.sin(a * 2) * 0.4);
    m.position.copy(m.userData.home);
    root.add(m);
    return m;
  });
  const nerveMat = M(COLORS.nerve, { roughness: 0.45, tissue: 'nerve', emissive: 0xffe28a, emissiveIntensity: 0 });
  const terminal = ellipsoid([0.6, BASE - 1.4, 1.6], [2.2, 1.3, 1.8], nerveMat, 18);
  root.add(pick(terminal, 'spiral-ganglion', 'Nerve ending of a spiral ganglion neuron'));
  const axonPts = [[0.6, BASE - 2.4, 1.6], [2, BASE - 6, 2], [6, BASE - 9, 1], [14, BASE - 11, -1]];
  root.add(pick(tubeThrough(axonPts, 0.45, nerveMat, 24, 6), 'spiral-ganglion', 'Nerve fiber, to the spiral ganglion'));
  const axon = new THREE.CatmullRomCurve3(axonPts.map((p) => new THREE.Vector3(...p)));
  const glu = Array.from({ length: 14 }, () => {
    const m = pick(new THREE.Mesh(dot, M(0xffe28a, { roughness: 0.3, emissive: 0xffe28a, emissiveIntensity: 0.9 })), 'neurotransmitter', 'Glutamate (drawn far larger)');
    m.scale.setScalar(0.12);
    m.userData.to = new THREE.Vector3(0.6 + (rand() - 0.5) * 2.4, BASE - 0.3 - rand() * 0.2, 1.6 + (rand() - 0.5) * 2);
    root.add(m);
    return m;
  });
  const ionMat = M(0xb07ae8, { roughness: 0.3, emissive: 0xb07ae8, emissiveIntensity: 0.6 });
  const ions = Array.from({ length: 16 }, (_, i) => {
    const m = pick(new THREE.Mesh(dot, ionMat), 'stereocilia', 'Potassium ion entering (drawn far larger)');
    m.scale.setScalar(0.16);
    m.userData.x = ((i % PER_ROW) - 3) * 0.95;
    m.userData.ph = rand();
    root.add(m);
    return m;
  });
  const spike = pick(new THREE.Mesh(dot, M(0xffffff, { roughness: 0.2, emissive: 0xffe28a, emissiveIntensity: 1 })), 'spiral-ganglion', 'Action potential');
  spike.scale.setScalar(0.7);
  root.add(spike);

  let flow = 0;
  let stage = 0;
  function apply(v) {
    stage = v;
    const bend = ramp(v, 0.9, 1.5);
    bundle.rotation.x = -0.32 * bend; // toward the tallest row (−z)
    const open = ramp(v, 1.8, 2.3);
    linkMat.emissiveIntensity = 0.2 + 0.8 * open;
    chanMat.emissiveIntensity = 0.1 + 0.9 * open;
    cellMat.emissiveIntensity = 0.35 * ramp(v, 2.2, 2.8);
    ions.forEach((m) => {
      const t = (m.userData.ph + flow) % 1;
      m.visible = open > 0.05 && v < 3.6;
      m.position.set(m.userData.x, TOP + 4.5 - t * 9, rowsZ[0] - 0.4 * t);
    });
    const out = ramp(v, 2.9, 3.4);
    vesicles.forEach((m, i) => {
      m.visible = !(out > 0.5 && i % 2 === 0);
      m.position.copy(m.userData.home).lerp(new THREE.Vector3(0.6, BASE + 0.25, 1.4), i % 2 === 0 ? out : 0);
    });
    glu.forEach((m) => {
      m.visible = out > 0.3;
      m.position.set(0.6, BASE + 0.2, 1.4).lerp(m.userData.to, ramp(v, 3, 3.5));
    });
    nerveMat.emissiveIntensity = 0.7 * ramp(v, 3.6, 4);
    spike.visible = v > 3.7;
    axon.getPointAt(Math.min(1, ramp(v, 3.7, 4) * 0.8 + flow * 0.2), spike.position);
  }
  const { controls, update } = stagedControls({ stages: HAIR_CELL_STAGES, apply, reducedMotion, rate: 0.22, still: 3.4 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 4.2e-5,
    view: { target: [1, -1, 0], direction: [0.35, 0.22, 1] },
    focus: [0.6, BASE + 0.2, 1.6],
    controls,
    update(dt) {
      update(dt);
      if (!reducedMotion) {
        flow = (flow + dt * 0.5) % 1;
        apply(stage);
      }
    },
    dispose() {
      dot.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
