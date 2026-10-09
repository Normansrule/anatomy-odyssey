// Tier 5: the dendritic knob of an olfactory neuron and its cilia, in mucus.
// 1 scene unit = 0.1 µm. The knob is about 2 µm across; cilia, a few tenths
// of a micrometer thick, spread through the mucus. Odor receptors (seven-
// helix, G protein–coupled; OpenStax A&P 14.1) sit in the cilia membranes,
// drawn far larger than life, as are the odor molecules and the carrier
// proteins (odorant-binding proteins) that bring them.
// The stage control follows one odor molecule from carrier to signal.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, cylinderBetween, ellipsoid, seeded, disposeTree } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const KNOB_UM = 2;
export const RECEPTOR_TYPES = 350;

export const RECEPTOR_STAGES = [
  { label: 'Carried', text: 'Carried. A carrier protein (orange) brings a dissolved odor molecule (yellow) through the mucus to a cilium.' },
  { label: 'Binds', text: 'Binds. The molecule fits the pocket of an odor receptor in the cilium membrane, a protein with seven helices crossing the membrane. Each neuron makes just one of about 350 receptor types, and each receptor responds to a range of molecules.' },
  { label: 'G protein', text: 'G protein. The receptor changes shape and switches on its G protein inside the cilium, which sets off a chemical relay.' },
  { label: 'Channels open', text: 'Channels open. The relay opens ion channels; positive ions (blue) flow in and the membrane potential rises, a graded potential that spreads to the cell body.' },
  { label: 'Signal', text: 'Signal. If it is large enough, the neuron fires action potentials to the olfactory bulb. The brain recognizes a smell from the pattern of receptor types that respond, which lets about 350 types tell apart thousands of odors.' },
];

export function buildOlfactoryCilium({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2929);
  const ball = new THREE.SphereGeometry(1, 10, 8);
  const R = (KNOB_UM / 2) * 10;

  const mucus = new THREE.Mesh(new THREE.BoxGeometry(120, 60, 50), M(0xbfe0f0, { roughness: 0.2, transparent: true, opacity: 0.12, depthWrite: false }));
  mucus.position.y = 18;
  mucus.userData.pickPriority = -1;
  root.add(pick(mucus, 'olfactory-epithelium', 'Mucus'));
  const memMat = M(0xf0d050, { roughness: 0.45, transparent: true, opacity: 0.75, emissive: 0xffe28a, emissiveIntensity: 0 });
  root.add(pick(ellipsoid([0, 0, 0], [R, R * 0.8, R], memMat, 32), 'olfactory-neuron', 'Dendritic knob of an olfactory neuron'));
  root.add(pick(tubeThrough([[0, -R * 0.7, 0], [0, -20, 0], [1, -34, 0]], 3.2, memMat, 16, 10), 'olfactory-neuron', 'Dendrite, down to the cell body'));
  // Cilia spreading through the mucus.
  const cilia = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2 + 0.2;
    const pts = [[Math.cos(a) * 4, R * 0.7, Math.sin(a) * 4], [Math.cos(a) * 16, 12 + rand() * 4, Math.sin(a) * 12], [Math.cos(a) * 34, 18 + rand() * 6, Math.sin(a) * 22], [Math.cos(a) * 55, 22 + rand() * 6, Math.sin(a) * 30]];
    root.add(pick(tubeThrough(pts, 1.2, memMat, 40, 8), 'olfactory-neuron', 'Cilium (its membrane carries the odor receptors)'));
    cilia.push(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))));
  }
  // Receptors on the cilia (seven helices each), channels, G proteins.
  const helix = M(0x7c8fd0, { roughness: 0.4 });
  const receptors = [];
  cilia.forEach((c, i) => {
    for (const u of [0.35, 0.6, 0.85]) {
      const p = c.getPointAt(u);
      const tng = c.getTangentAt(u);
      const n = new THREE.Vector3(0, 1, 0).cross(tng).normalize();
      const g = new THREE.Group();
      g.position.copy(p).addScaledVector(n, 1.2);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
      for (let k = 0; k < 7; k++) {
        const b = (k / 7) * Math.PI * 2;
        g.add(pick(cylinderBetween([Math.cos(b) * 0.45, -0.7, Math.sin(b) * 0.45], [Math.cos(b) * 0.45, 0.7, Math.sin(b) * 0.45], 0.16, 0.16, helix, 6), 'odor-receptor', 'Odor receptor (seven helices; drawn far larger)'));
      }
      root.add(g);
      receptors.push({ g, p: g.position.clone(), n, ci: i, u });
    }
  });
  const target = receptors[4];
  const glowMat = M(0xffe28a, { roughness: 0.3, emissive: 0xffd36a, emissiveIntensity: 0 });
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.1, 6, 20), glowMat);
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.8;
  target.g.add(pick(halo, 'odor-receptor', 'Switched-on receptor'));
  const gp = pick(ellipsoid([0, 0, 0], [0.8, 0.6, 0.6], M(0x7cc49a, { roughness: 0.4, emissive: 0x7cc49a, emissiveIntensity: 0 }), 10), 'odor-receptor', 'G protein (inside the cilium)');
  root.add(gp);
  const chanMat = M(0xe86a8a, { roughness: 0.4, emissive: 0xe86a8a, emissiveIntensity: 0 });
  const chans = [0.42, 0.5, 0.58].map((u) => {
    const c = cilia[target.ci];
    const p = c.getPointAt(u);
    const n = new THREE.Vector3(0, 1, 0).cross(c.getTangentAt(u)).normalize();
    const m = pick(cylinderBetween(p.clone().addScaledVector(n, 0.7).toArray(), p.clone().addScaledVector(n, 1.7).toArray(), 0.35, 0.35, chanMat, 8), 'odor-receptor', 'Ion channel opened by the relay');
    root.add(m);
    return { p, n };
  });

  // Odor molecule, carrier, ions, signal.
  const odor = pick(new THREE.Mesh(ball, M(0xffe28a, { roughness: 0.3, emissive: 0xffd36a, emissiveIntensity: 0.8 })), 'vanillin', 'Odor molecule, vanillin (drawn far larger)');
  odor.scale.setScalar(0.4);
  root.add(odor);
  const obp = pick(ellipsoid([0, 0, 0], [1.1, 0.8, 0.8], M(0xf2a65a, { roughness: 0.4 }), 12), 'vanillin', 'Odorant-binding protein (carrier)');
  root.add(obp);
  const start = target.p.clone().add(new THREE.Vector3(-14, 14, 8));
  const pocket = target.p.clone().addScaledVector(target.n, 1.6);
  const ions = Array.from({ length: 14 }, (_, i) => {
    const m = pick(new THREE.Mesh(ball, M(0x9fd4ff, { roughness: 0.3, emissive: 0x9fd4ff, emissiveIntensity: 0.6 })), 'odor-receptor', 'Positive ion flowing in (drawn far larger)');
    m.scale.setScalar(0.22);
    m.userData = { ...m.userData, ch: chans[i % 3], ph: rand() };
    root.add(m);
    return m;
  });
  let flow = 0;
  let stage = 0;
  function apply(v) {
    stage = v;
    const t = ramp(v, 0.1, 0.9);
    obp.position.copy(start).lerp(pocket.clone().add(new THREE.Vector3(-1.2, 0.6, 0)), t);
    obp.visible = v < 1.6;
    odor.position.copy(obp.position).add(new THREE.Vector3(0.9, 0.2, 0)).lerp(pocket, ramp(v, 1, 1.4));
    glowMat.emissiveIntensity = 0.9 * ramp(v, 1.3, 1.6);
    gp.position.copy(target.p).addScaledVector(target.n, -0.6).add(new THREE.Vector3(1.5 * ramp(v, 2, 2.6), 0, 0));
    gp.material.emissiveIntensity = 0.8 * ramp(v, 2, 2.4);
    chanMat.emissiveIntensity = 0.8 * ramp(v, 2.8, 3.2);
    for (const m of ions) {
      const s = (m.userData.ph + flow) % 1;
      m.visible = v > 2.9;
      m.position.copy(m.userData.ch.p).addScaledVector(m.userData.ch.n, 4 - 5 * s);
    }
    memMat.emissiveIntensity = 0.5 * ramp(v, 3.6, 4);
  }
  const { controls, update } = stagedControls({ stages: RECEPTOR_STAGES, apply, reducedMotion, rate: 0.22, still: 3 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-7,
    frameWidth: 1e-5,
    view: { target: [4, 10, 0], direction: [0.15, 0.35, 1] },
    focus: pocket.toArray(),
    controls,
    update(dt) {
      update(dt);
      if (!reducedMotion) {
        flow = (flow + dt * 0.5) % 1;
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
