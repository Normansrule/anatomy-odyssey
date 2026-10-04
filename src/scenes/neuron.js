// Tier 5: a pyramidal neuron from the cerebral cortex. 1 scene unit = 1 µm.
// Dendrites (with spines) collect signals; the axon leaves from the axon
// hillock, is wrapped in myelin between nodes of Ranvier, and ends in
// terminal boutons. The control sets the axon's diameter: the drawn axon
// thickens and the spike runs faster, following Hursh's rule v ≈ 6 m/s per µm.
// Myelin segments are drawn far shorter than life so several fit in view.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, tubeThrough, cylinderBetween, capsuleBetween, seeded, disposeTree } from './kit.js';
import { conductionVelocity, conductionTime } from '../science/equations.js';

const SOMA_Y = 60;
const AXON_TOP = 44; // bottom of the axon hillock
const MYELIN_TOP = 30;
const AXON_BOTTOM = -112;
const INTERNODE = 22;
const NODE_GAP = 2;
const G_RATIO = 0.65; // axon diameter ÷ fiber diameter
const DRAWN_AXON_M = (SOMA_Y - AXON_BOTTOM + 30) * 1e-6;

export function buildNeuron({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(41);
  const membrane = M(0xf0a8c4, { roughness: 0.5 });
  const dendriteMat = M(0xe59ab8, { roughness: 0.55 });
  const spinePoints = [];

  // Soma: a pyramid-shaped cell body, translucent so the nucleus shows.
  const profile = [[0, 51], [7, 51.5], [10, 54], [9.5, 58], [7, 64], [4.2, 70], [2.2, 74], [0, 75]].map(([r, y]) => new THREE.Vector2(r, y));
  const somaGeo = new THREE.LatheGeometry(profile, 40);
  const soma = new THREE.Mesh(somaGeo, M(0xf0a8c4, { roughness: 0.4, transparent: true, opacity: 0.5, depthWrite: false }));
  root.add(pick(soma, 'neuron', 'Cell body (soma)'));
  const nucleus = ellipsoid([0, SOMA_Y - 1, 0], [4.6, 5.2, 4.6], M(COLORS.hematoxylin, { roughness: 0.4, emissive: COLORS.hemaDeep, emissiveIntensity: 0.35 }), 32);
  nucleus.userData.pickPriority = 1;
  root.add(pick(nucleus, 'neuron-nucleus', 'Nucleus'));
  root.add(pick(ellipsoid([1.2, SOMA_Y + 0.5, 1.4], [1.2, 1.2, 1.2], M(0x2a1f66, { roughness: 0.7 }), 16), 'neuron-nucleus', 'Nucleolus'));

  /** Grow a dendrite as a wandering tube, branching `depth` more times. Records spine sites. */
  const grow = (start, dir, length, radius, depth) => {
    const pts = [start.clone()];
    const p = start.clone();
    const d = dir.clone().normalize();
    const n = 6;
    for (let k = 1; k <= n; k++) {
      d.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.28)).normalize();
      p.addScaledVector(d, length / n);
      pts.push(p.clone());
    }
    const tube = tubeThrough(pts.map((v) => v.toArray()), radius, dendriteMat, 30, 7);
    root.add(pick(tube, 'neuron-dendrites', 'Dendrite'));
    const curve = new THREE.CatmullRomCurve3(pts);
    const count = Math.floor(length / 2.6);
    for (let i = 1; i < count; i++) {
      const at = curve.getPointAt(i / count);
      const tan = curve.getTangentAt(i / count);
      const side = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(tan).normalize();
      spinePoints.push({ at: at.addScaledVector(side, radius + 0.55), side });
    }
    if (depth > 0) {
      for (let b = 0; b < 2; b++) {
        const nd = d.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(1.3)).normalize();
        grow(p, nd, length * (0.6 + rand() * 0.2), Math.max(0.45, radius * 0.7), depth - 1);
      }
    }
  };

  // Apical dendrite: straight up toward the brain's surface, with side branches and a tuft.
  const apical = [[0, 74, 0], [1, 100, 0.5], [-1, 126, -0.5], [0.5, 150, 0]].map((a) => new THREE.Vector3(...a));
  root.add(pick(tubeThrough(apical.map((v) => v.toArray()), 1.7, dendriteMat, 40, 9), 'neuron-dendrites', 'Apical dendrite'));
  for (let i = 0; i < 4; i++) {
    const at = new THREE.Vector3(0, 86 + i * 15, 0);
    const a = rand() * Math.PI * 2;
    grow(at, new THREE.Vector3(Math.cos(a), 0.35, Math.sin(a)), 24, 0.8, 1);
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rand();
    grow(apical[3], new THREE.Vector3(Math.cos(a) * 0.7, 1, Math.sin(a) * 0.7), 20, 0.7, 1);
  }
  // Basal dendrites: spreading sideways and down from the base of the soma.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rand() * 0.5;
    const start = new THREE.Vector3(Math.cos(a) * 8, 53, Math.sin(a) * 8);
    grow(start, new THREE.Vector3(Math.cos(a), -0.45 - rand() * 0.3, Math.sin(a)), 34, 1.1, 1);
  }

  // Dendritic spines: tiny knobs where other neurons' axons make synapses.
  const spineGeo = new THREE.SphereGeometry(1, 8, 6);
  const spines = new THREE.InstancedMesh(spineGeo, M(0xffc2d8, { roughness: 0.4 }), spinePoints.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  spinePoints.forEach((s, i) => {
    q.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.side);
    spines.setMatrixAt(i, m4.compose(s.at, q, new THREE.Vector3(0.5, 0.75, 0.5)));
  });
  root.add(pick(spines, 'dendritic-spine', 'Dendritic spine'));

  // Axon hillock and initial segment (no myelin): where the spike starts.
  const hillock = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 1, SOMA_Y - 9 - AXON_TOP, 20), membrane);
  hillock.position.y = (SOMA_Y - 9 + AXON_TOP) / 2;
  root.add(pick(hillock, 'axon-hillock', 'Axon hillock'));

  // Axon core (unit radius, scaled by the diameter control).
  const axonCore = cylinderBetween([0, AXON_TOP, 0], [0, AXON_BOTTOM, 0], 1, 1, membrane, 16);
  root.add(pick(axonCore, 'axon', 'Axon'));

  // Myelin internodes and the nodes of Ranvier between them.
  const myelinMat = M(0xf4f0e6, { roughness: 0.35 });
  const nodeMat = M(0xe8c45a, { roughness: 0.4, emissive: 0xe8c45a, emissiveIntensity: 0.25 });
  const myelin = [];
  const nodes = [new THREE.Vector3(0, (AXON_TOP + MYELIN_TOP) / 2, 0)]; // initial segment
  for (let y = MYELIN_TOP; y - INTERNODE > AXON_BOTTOM + 4; y -= INTERNODE + NODE_GAP) {
    const seg = capsuleBetween([0, y, 0], [0, y - INTERNODE, 0], 1, myelinMat, 18);
    root.add(pick(seg, 'myelin', 'Myelin sheath'));
    myelin.push(seg);
    const ny = y - INTERNODE - NODE_GAP / 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.28, 8, 20), nodeMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = ny;
    root.add(pick(ring, 'node-of-ranvier', 'Node of Ranvier'));
    nodes.push(new THREE.Vector3(0, ny, 0));
  }
  const nodeRings = root.children.filter((c) => c.userData.cardId === 'node-of-ranvier');

  // Axon terminals: the axon splits and ends in boutons that touch other cells.
  const boutons = [];
  const terminalMat = M(0xf0a8c4, { roughness: 0.45 });
  const boutonMat = M(0xff9cc0, { roughness: 0.35, emissive: COLORS.eosin, emissiveIntensity: 0.12 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 0.4;
    const end = new THREE.Vector3(Math.cos(a) * (14 + rand() * 12), AXON_BOTTOM - 22 - rand() * 12, Math.sin(a) * (10 + rand() * 8));
    const mid = new THREE.Vector3(end.x * 0.4, AXON_BOTTOM - 10, end.z * 0.4);
    root.add(pick(tubeThrough([[0, AXON_BOTTOM + 1, 0], mid.toArray(), end.toArray()], 0.55, terminalMat, 20, 6), 'axon-terminal', 'Axon terminal branch'));
    const b = ellipsoid(end.toArray(), [2.3, 2.3, 2.3], boutonMat, 18);
    root.add(pick(b, 'axon-terminal', 'Terminal bouton (synapse)'));
    boutons.push(end);
  }

  // The spike: a glowing marker that jumps from node to node.
  const spike = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), M.basic(0xfff1a8, { transparent: true, opacity: 0.9, depthWrite: false }));
  root.add(spike);
  const path = [new THREE.Vector3(0, SOMA_Y - 10, 0), ...nodes, new THREE.Vector3(0, AXON_BOTTOM, 0), boutons[0]];

  let diameter = 4;
  let phase = 0;
  const period = () => Math.min(8, Math.max(0.9, (60 / conductionVelocity(diameter)) * 1.4));
  const controls = {
    label: 'Axon diameter',
    unit: 'µm',
    min: 1,
    max: 15,
    step: 0.5,
    value: diameter,
    format: (v) => v.toFixed(1),
    presets: [
      { label: 'Thin, 1 µm', value: 1 },
      { label: 'Medium, 5 µm', value: 5 },
      { label: 'Thick, 12 µm', value: 12 },
      { label: 'Play or pause', action: 'play' },
    ],
    playing: !reducedMotion,
    readout: '',
    set(v) {
      diameter = v;
      controls.value = v;
      const axonR = v / 2;
      axonCore.scale.set(axonR, 1, axonR);
      for (const seg of myelin) seg.scale.set(axonR / G_RATIO, 1, axonR / G_RATIO);
      for (const r of nodeRings) r.scale.set(axonR + 0.3, axonR + 0.3, 1);
      const vel = conductionVelocity(v);
      const ms = conductionTime(1, v) * 1000;
      const slow = period() / (DRAWN_AXON_M / vel);
      controls.readout = `About ${Math.round(vel)} m/s. A signal crosses 1 m (toe to spinal cord) in ${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms. Shown about ${Number(slow.toPrecision(2)).toLocaleString('en-US')} times slower.`;
      return controls.readout;
    },
  };
  controls.set(diameter);

  const placeSpike = (u) => {
    const n = path.length - 1;
    const x = Math.min(n - 1e-6, u * n);
    const k = Math.floor(x);
    const f = x - k;
    // Continuous in the initial segment and terminal; jumps between nodes on the myelinated stretch.
    const saltatory = k >= 1 && k < n - 2;
    const t = saltatory ? (f < 0.8 ? 0 : (f - 0.8) / 0.2) : f;
    spike.position.lerpVectors(path[k], path[k + 1], t);
    spike.scale.setScalar(Math.max(2.2, diameter * 0.6) * (saltatory ? 1 + 0.35 * Math.sin(f * Math.PI) : 1));
  };
  placeSpike(reducedMotion ? 0.45 : 0);

  return {
    root,
    metersPerUnit: 1e-6,
    view: { target: [0, 8, 0], direction: [0.55, 0.12, 0.83] },
    focus: boutons[0].toArray(),
    branchFocus: [0, SOMA_Y - 1, 0],
    controls,
    update(dt) {
      if (!controls.playing) return;
      phase = (phase + dt / period()) % 1.15; // a short pause after each spike
      spike.visible = phase < 1;
      if (phase < 1) placeSpike(phase);
    },
    dispose() {
      spineGeo.dispose();
      somaGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
