// Tier 4: a block of olfactory epithelium. 1 scene unit = 1 µm.
// Tall supporting cells; bipolar olfactory sensory neurons whose dendrites
// reach the surface and spread cilia into the mucus; round basal cells at
// the bottom that replace the neurons; mucus glands; and below, the neurons'
// thin unmyelinated axons gathering into bundles headed through the
// cribriform plate to the olfactory bulb (OpenStax A&P 14.1, Biology 36.3).
// Thicknesses are approximate; odor molecules are drawn far larger.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, capsuleBetween, ellipsoid, seeded, disposeTree } from './kit.js';
import { stagedControls, ramp } from './stages.js';

const W = 60;
const D = 18;
export const EPITHELIUM = { top: 60, mucus: 12 };
const TOP = EPITHELIUM.top;

export const SMELL_STAGES = [
  { label: 'In the air', text: 'In the air. A sniff carries odor molecules (yellow) up to the olfactory epithelium in the roof of the nose.' },
  { label: 'Into the mucus', text: 'Into the mucus. The molecules dissolve in the mucus that covers the epithelium; carrier proteins (orange) keep them dissolved and bring them to the neurons’ cilia.' },
  { label: 'Bound', text: 'Bound. An odor molecule fits a receptor on a cilium. Each neuron carries one of about 350 receptor types; humans have about 12 million of these neurons.' },
  { label: 'Neuron fires', text: 'The neuron fires. The receptor, coupled to a G protein, changes the neuron’s membrane potential, and the neuron sends action potentials down its thin axon.' },
  { label: 'To the bulb', text: 'To the bulb. Axons bundle together, pass through the cribriform plate and reach the olfactory bulb. From there, signals go on to the cortex and to the limbic system, which is why smells stir memories and emotions.' },
];

export function buildOlfactoryEpithelium({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2828);
  const ball = new THREE.SphereGeometry(1, 10, 8);

  // Mucus on top, see-through.
  const mucus = new THREE.Mesh(new THREE.BoxGeometry(2 * W, EPITHELIUM.mucus, 2 * D), M(0xbfe0f0, { roughness: 0.2, transparent: true, opacity: 0.35, depthWrite: false }));
  mucus.position.y = TOP + EPITHELIUM.mucus / 2;
  root.add(pick(mucus, 'olfactory-epithelium', 'Mucus layer (odor molecules dissolve here)'));
  // Basement membrane and lamina propria.
  const lp = new THREE.Mesh(new THREE.BoxGeometry(2 * W, 40, 2 * D), M(0xe8c8c0, { roughness: 0.7, transparent: true, opacity: 0.5, depthWrite: false }));
  lp.position.y = -20;
  root.add(pick(lp, 'olfactory-epithelium', 'Connective tissue under the epithelium'));

  // Supporting cells: tall columns.
  const sup = M(0xe8b8c8, { roughness: 0.5 });
  const supNuc = M(0x7a5aa8, { roughness: 0.5 });
  for (let x = -W + 4; x < W; x += 8) {
    for (const z of [-10, 0, 10]) {
      root.add(pick(capsuleBetween([x, 4, z], [x, TOP - 2, z], 3.4, sup, 8), 'olfactory-epithelium', 'Supporting cell'));
      root.add(pick(ellipsoid([x, TOP - 10, z + 3.2], [1.6, 3, 1.2], supNuc, 10), 'olfactory-epithelium', 'Supporting cell nucleus'));
    }
  }
  // Basal cells (stem cells).
  for (let x = -W + 6; x < W; x += 9) root.add(pick(ellipsoid([x, 3, 12], [3, 2.5, 3], M(0xc8a0c0, { roughness: 0.5 }), 12), 'olfactory-neuron', 'Basal cell (replaces olfactory neurons)'));

  // Olfactory sensory neurons in front: cell body, dendrite, knob, cilia; axon below.
  const neuMat = M(0xf0d050, { roughness: 0.45, emissive: 0xffe28a, emissiveIntensity: 0 });
  const heroMat = M(0xf0d050, { roughness: 0.4, emissive: 0xffe28a, emissiveIntensity: 0 });
  const neurons = [];
  for (let k = 0; k < 7; k++) {
    const x = -W + 10 + k * 16 + (rand() - 0.5) * 3;
    const z = 13;
    const hero = k === 3;
    const mat = hero ? heroMat : neuMat;
    const body = [x, 18 + rand() * 12, z];
    root.add(pick(ellipsoid(body, [3.4, 4.4, 3], mat, 14), 'olfactory-neuron', hero ? 'This olfactory neuron' : 'Olfactory sensory neuron (bipolar)'));
    root.add(pick(tubeThrough([body, [x + 1, (body[1] + TOP) / 2, z], [x, TOP + 0.6, z]], 0.8, mat, 16, 6), 'olfactory-neuron', 'Dendrite, reaching the surface'));
    root.add(pick(ellipsoid([x, TOP + 1.4, z], [1.6, 1.4, 1.6], mat, 12), 'olfactory-neuron', 'Dendritic knob'));
    for (let c = 0; c < 8; c++) {
      const a = (c / 8) * Math.PI * 2;
      root.add(pick(tubeThrough([[x, TOP + 2.4, z], [x + Math.cos(a) * 6, TOP + 5 + rand() * 2, z + Math.sin(a) * 4], [x + Math.cos(a) * 13, TOP + 6 + rand() * 4, z + Math.sin(a) * 7]], 0.22, mat, 12, 4), 'olfactory-neuron', 'Cilium (carries the odor receptors)'));
    }
    const axon = [[x, body[1] - 4, z], [x + 2, 2, z], [x * 0.5 + 4, -24, z - 4], [8, -40, 4]];
    root.add(pick(tubeThrough(axon, 0.5, mat, 24, 5), 'olfactory-neuron', 'Axon (thin, unmyelinated), toward the cribriform plate'));
    neurons.push({ hero, axon: new THREE.CatmullRomCurve3(axon.map((p) => new THREE.Vector3(...p))), x, z });
  }
  root.add(pick(tubeThrough([[8, -40, 4], [6, -48, 2], [4, -56, 0]], 3, M(0xf0d050, { roughness: 0.45, tissue: 'nerve' }), 12, 10), 'olfactory-bulb', 'Bundle of olfactory axons (an olfactory nerve fiber bundle)'));
  // A mucus gland with its duct.
  root.add(pick(ellipsoid([-36, -14, -6], [8, 6, 6], M(0xd8c0e8, { roughness: 0.5 }), 16), 'olfactory-epithelium', 'Gland that makes the mucus'));
  root.add(pick(tubeThrough([[-36, -8, -6], [-38, 20, -4], [-38, TOP, -4]], 1, M(0xd8c0e8, { roughness: 0.5 }), 16, 6), 'olfactory-epithelium', 'Gland duct'));

  // Odor molecules and carrier proteins.
  const hero = neurons.find((n) => n.hero);
  const odorMat = M(0xffe28a, { roughness: 0.3, emissive: 0xffd36a, emissiveIntensity: 0.8 });
  const odors = Array.from({ length: 16 }, (_, i) => {
    const m = pick(new THREE.Mesh(ball, odorMat), 'vanillin', 'Odor molecule, vanillin (drawn far larger)');
    m.scale.setScalar(0.7);
    const target = i < 5 ? new THREE.Vector3(hero.x + (rand() - 0.5) * 16, TOP + 6, hero.z + (rand() - 0.5) * 6) : new THREE.Vector3((rand() - 0.5) * 2 * W, TOP + 4 + rand() * 6, (rand() - 0.5) * 2 * D);
    root.add(m);
    return { m, a: new THREE.Vector3((rand() - 0.5) * 2 * W, TOP + 30 + rand() * 20, (rand() - 0.5) * D), b: target, d: rand() * 0.3, bound: i < 5 };
  });
  const carrier = M(0xf2a65a, { roughness: 0.4 });
  const obps = odors.slice(0, 8).map((o) => {
    const m = pick(ellipsoid([0, 0, 0], [1.3, 1, 1], carrier, 10), 'vanillin', 'Odorant-binding protein carrying an odor molecule');
    root.add(m);
    return { m, o };
  });
  const spikes = Array.from({ length: 3 }, (_, k) => {
    const s = pick(new THREE.Mesh(ball, M(0xffffff, { roughness: 0.2, emissive: 0xffe28a, emissiveIntensity: 1 })), 'olfactory-neuron', 'Action potential');
    s.scale.setScalar(1.4);
    s.userData.k = k;
    root.add(s);
    return s;
  });

  let flow = 0;
  let stage = 0;
  function apply(v) {
    stage = v;
    for (const o of odors) {
      const t = ramp(v, 0.1 + o.d, 1.3 + o.d);
      o.m.position.copy(o.a).lerp(o.b, t);
      if (o.bound) o.m.position.lerp(new THREE.Vector3(hero.x, TOP + 3, hero.z), ramp(v, 1.6, 2.3));
    }
    for (const { m, o } of obps) {
      m.visible = v > 0.9 && v < 2.5;
      m.position.copy(o.m.position).add(new THREE.Vector3(1.2, 0.3, 0));
    }
    heroMat.emissiveIntensity = 0.8 * ramp(v, 2.2, 2.8);
    neuMat.emissiveIntensity = 0.3 * ramp(v, 3.6, 4);
    const go = ramp(v, 2.9, 4);
    spikes.forEach((s) => {
      s.visible = v > 2.9;
      hero.axon.getPointAt(Math.min(1, (go * 0.8 + s.userData.k * 0.15 + flow) % 1), s.position);
    });
  }
  const { controls, update } = stagedControls({ stages: SMELL_STAGES, apply, reducedMotion, rate: 0.22, still: 3 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 1.5e-4,
    view: { target: [0, 22, 0], direction: [0.25, 0.18, 1] },
    focus: [hero.x, TOP + 2, hero.z],
    controls,
    update(dt) {
      update(dt);
      if (!reducedMotion) {
        flow = (flow + dt * 0.2) % 1;
        apply(stage);
      }
    },
    dispose() {
      ball.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
