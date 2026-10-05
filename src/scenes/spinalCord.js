// Tier 3: a slice of the spinal cord at the third lumbar segment (L3), where
// the knee-jerk reflex is wired. 1 scene unit = 1 mm.
// A generalized lumbar cord about 9.6 mm wide and 7.6 mm front to back, with
// its butterfly of gray matter, the roots on each side and the dorsal root
// ganglion. The three neurons of the reflex are drawn on the cut face; their
// cell bodies are drawn several times larger than life so they can be seen.
// Dorsal (back) is up, ventral (front) is down, as in most textbook drawings.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, disposeTree, capsuleBetween, seeded } from './kit.js';
import { stagedControls, ramp } from './stages.js';
import { reflexLatency } from '../science/reflex.js';

export const CORD_WIDTH_MM = 9.6;
export const CORD_DEPTH_MM = 7.6;
const RX = CORD_WIDTH_MM / 2;
const RY = CORD_DEPTH_MM / 2;
const SLAB = 5; // length of cord shown along its axis, mm
const FACE = SLAB / 2 + 0.06; // drawing plane just in front of the cut face

const T = reflexLatency();

export const CORD_STAGES = [
  { label: 'Tap', text: 'Tap. Nothing has reached the cord yet. The stretch sensor in the quadriceps is firing, and its signal is on the way up the nerve.' },
  { label: 'Sense', text: 'Sense. The signal comes in through the dorsal root. Its cell body sits outside the cord in the dorsal root ganglion; the fiber runs straight on into the gray matter.' },
  { label: 'Switch', text: `Switch. The sensory fiber reaches all the way to the ventral horn and synapses directly on a motor neuron: one synapse, about ${T.synapseMs.toFixed(1)} ms. A branch excites a small inhibitory neuron.` },
  { label: 'Command', text: 'Command. The motor neuron fires out through the ventral root to the quadriceps. The inhibitory neuron quiets the hamstring motor neurons, which lie a few segments lower (L5 to S2).' },
  { label: 'Kick', text: `Kick. The quadriceps contracts and the hamstrings stay relaxed, so the leg swings freely. The cord did all of this on its own in about ${Math.round(T.totalMs)} ms; the brain hears about it afterwards.` },
];

/** Half of the gray-matter butterfly (x ≥ 0), dorsal horn at the top, ventral horn at the bottom. */
export const GRAY_HALF = [
  [0, 0.55], [0.55, 0.65], [1.05, 1.1], [1.6, 1.95], [2.05, 2.75], [2.35, 3.1], [2.62, 2.95], [2.45, 2.2],
  [2.2, 1.35], [2.35, 0.65], [2.95, 0.05], [3.45, -0.85], [3.55, -1.75], [3.15, -2.45], [2.45, -2.7],
  [1.75, -2.45], [1.15, -1.75], [0.6, -0.95], [0, -0.75],
];

function butterfly() {
  const right = GRAY_HALF;
  const left = [...right].reverse().map(([x, y]) => [-x, y]).filter(([x]) => x < 0);
  return [...right, ...left];
}

/** Outline of the whole cord: an ellipse with the ventral median fissure cut into it. */
function cordOutline(n = 96) {
  const FISSURE_TIP = -1.6;
  const pts = [[0, FISSURE_TIP]]; // ventral median fissure: a deep narrow notch
  const gap = 0.025;
  for (let i = 0; i <= n; i++) {
    const a = -Math.PI / 2 + gap + (i / n) * (Math.PI * 2 - 2 * gap);
    const x = RX * Math.cos(a);
    let y = RY * Math.sin(a);
    const dTop = Math.abs(a - Math.PI / 2); // shallow dorsal median sulcus
    if (dTop < 0.08) y -= 0.25 * (1 - dTop / 0.08);
    pts.push([x, y]);
  }
  return pts;
}

const shapeOf = (pts) => new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));

/** Area of the gray matter as a share of the cross-section (a check against anatomy). */
export function grayShare() {
  const area = (pts) => Math.abs(pts.reduce((s, [x, y], i) => {
    const [x2, y2] = pts[(i + 1) % pts.length];
    return s + x * y2 - x2 * y;
  }, 0)) / 2;
  return area(butterfly()) / (Math.PI * RX * RY);
}

export function buildSpinalCord({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(303);
  const extrude = (shape) => new THREE.ExtrudeGeometry(shape, { depth: SLAB, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -SLAB / 2);

  // White matter with the gray matter (and central canal) as holes.
  const outer = shapeOf(cordOutline());
  const grayPath = new THREE.Path(butterfly().map(([x, y]) => new THREE.Vector2(x, y)));
  outer.holes.push(grayPath);
  const whiteMat = M(0xf1ead9, { roughness: 0.55, tissue: 'whiteMatter', repeat: [0.25, 0.25], transparent: true, opacity: 0.72, depthWrite: false });
  const white = new THREE.Mesh(extrude(outer), whiteMat);
  white.userData.pickPriority = -1;
  root.add(pick(white, 'spinal-white-matter', 'White matter (bundles of nerve fibers running up and down)'));

  const grayShape = shapeOf(butterfly());
  const canal = new THREE.Path();
  canal.absarc(0, -0.05, 0.12, 0, Math.PI * 2, true);
  grayShape.holes.push(canal);
  const grayMat = M(0xb9a6c8, { roughness: 0.6, tissue: 'brain', repeat: [0.3, 0.3] });
  const gray = new THREE.Mesh(extrude(grayShape), grayMat);
  root.add(pick(gray, 'spinal-cord-section', 'Gray matter (nerve cell bodies and synapses)'));

  // Invisible pick zones for the horns, so a click names the right part.
  const zone = (x, y, r, card, label) => {
    const m = ellipsoid([x, y, FACE - 0.05], [r, r, 0.08], M.basic(0xffffff, { transparent: true, opacity: 0, depthWrite: false }), 12);
    root.add(pick(m, card, label));
  };
  for (const s of [1, -1]) {
    zone(s * 2.0, 2.2, 0.75, 'dorsal-horn', 'Dorsal horn (sensory side)');
    zone(s * 2.6, -1.7, 1.0, 'ventral-horn', 'Ventral horn (motor neurons)');
  }
  const canalMarker = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, SLAB, 16, 1, true), M(0x6e5a8a, { roughness: 0.3, side: THREE.DoubleSide }));
  canalMarker.rotation.x = Math.PI / 2;
  canalMarker.position.y = -0.05;
  root.add(pick(canalMarker, 'central-canal', 'Central canal (filled with cerebrospinal fluid)'));

  // Pia mater: a thin bright skin hugging the cord.
  const pia = new THREE.Mesh(extrude(shapeOf(cordOutline().map(([x, y]) => [x * 1.012, y * 1.012]))), M(0xf08baf, { roughness: 0.5, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.BackSide }));
  root.add(pick(pia, 'spinal-cord-section', 'Pia mater (the cord’s innermost covering)'));

  // Roots, ganglion and spinal nerve on both sides. Dorsal rootlets fan along the cord.
  const nerveMat = M(0xf3e6c4, { roughness: 0.45, tissue: 'nerve', repeat: [4, 1] });
  const ganglionMat = M(0xe8cf8f, { roughness: 0.5, transparent: true, opacity: 0.45, depthWrite: false });
  for (const s of [1, -1]) {
    const DRG = [s * 8.2, 2.0, 0];
    for (let k = -2; k <= 2; k++) {
      const z = k * 0.85;
      root.add(pick(capsuleBetween([s * 2.45, 3.05, z], [s * 6.6, 2.6, z * 0.3], 0.22, nerveMat, 8), 'dorsal-root-ganglion', 'Dorsal root (sensory fibers coming in)'));
      root.add(pick(capsuleBetween([s * 3.25, -2.55, z * 0.9], [s * 8.3, -0.5, z * 0.25], 0.24, nerveMat, 8), 'ventral-root', 'Ventral root (motor fibers going out)'));
    }
    root.add(pick(ellipsoid(DRG, [1.7, 1.05, 1.25], ganglionMat, 24), 'dorsal-root-ganglion', 'Dorsal root ganglion (the sensory cell bodies)'));
    root.add(pick(capsuleBetween([s * 9.6, 1.0, 0], [s * 13.5, -1.4, 0], 0.85, nerveMat, 14), 'reflex-arc', 'Spinal nerve (sensory and motor fibers together)'));
    // Blood vessels on the surface: anterior spinal artery and a few radicular branches.
    if (s === 1) {
      const art = M(0xd9434f, { roughness: 0.35, tissue: 'vessel' });
      root.add(pick(capsuleBetween([0, -RY - 0.25, -SLAB / 2], [0, -RY - 0.25, SLAB / 2], 0.22, art, 10), 'spinal-cord-section', 'Anterior spinal artery'));
      for (const z of [-1.6, 1.1]) root.add(pick(capsuleBetween([0, -RY - 0.25, z], [3.4, -RY + 0.7, z + 0.3], 0.08, art, 6), 'spinal-cord-section', 'Small artery feeding the cord'));
    }
  }

  // The reflex circuit, drawn on the cut face (right side).
  const v = (x, y, z = FACE) => new THREE.Vector3(x, y, z);
  const DRG_CELL = v(8.2, 2.0, 0.9);
  const MN_Q = v(2.85, -1.55); // quadriceps motor neuron, lateral ventral horn
  const IN = v(1.45, -0.55); // inhibitory interneuron
  const sensory = new THREE.CatmullRomCurve3([v(13.4, -1.2, 0.6), v(11.2, -0.1, 0.8), DRG_CELL, v(6.0, 2.75, 1.4), v(3.4, 3.05, FACE), v(2.35, 2.55), v(2.05, 1.4), v(2.35, 0.2), v(2.7, -0.9), MN_Q.clone().add(v(-0.18, 0.18, 0))]);
  const branch = new THREE.CatmullRomCurve3([v(2.2, 0.75), v(1.8, 0.1), IN.clone().add(v(0.12, 0.12, 0))]);
  const motor = new THREE.CatmullRomCurve3([MN_Q.clone(), v(3.15, -2.35), v(4.6, -2.25, 1.5), v(7.6, -0.75, 0.6), v(10.5, -0.3, 0.3), v(13.4, -1.5, 0.3)]);
  const inhibit = new THREE.CatmullRomCurve3([IN.clone(), v(1.75, -1.05), v(2.3, -1.25, FACE - 0.4), v(2.4, -1.3, 0), v(2.4, -1.3, -SLAB / 2 - 1.2)]);

  const glow = (c, o = 0.9) => M(c, { roughness: 0.35, emissive: c, emissiveIntensity: 0.55, transparent: true, opacity: o });
  const tube = (curve, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(curve, 120, r, 8, false), mat);
  root.add(pick(tube(sensory, 0.07, glow(0xe8c45a)), 'sensory-neuron', 'Sensory neuron (Ia fiber from the muscle spindle)'));
  root.add(pick(tube(branch, 0.05, glow(0xe8c45a)), 'reciprocal-inhibition', 'Branch of the sensory fiber to an inhibitory neuron'));
  root.add(pick(tube(motor, 0.08, glow(0xf2a65a)), 'motor-neuron', 'Motor neuron axon (to the quadriceps)'));
  root.add(pick(tube(inhibit, 0.045, glow(0x8f7ff0, 0.8)), 'reciprocal-inhibition', 'Inhibitory axon running down to the hamstring motor neurons (L5 to S2)'));

  const soma = (p, r, c, card, label) => {
    const m = ellipsoid(p.toArray(), [r, r * 0.85, r * 0.7], M(c, { roughness: 0.3, emissive: c, emissiveIntensity: 0.4 }), 18);
    root.add(pick(m, card, label));
    return m;
  };
  const drgSoma = soma(DRG_CELL, 0.32, 0xe8c45a, 'sensory-neuron', 'Sensory cell body in the ganglion (drawn about 10 times larger)');
  const mnSoma = soma(MN_Q, 0.3, 0xf2a65a, 'motor-neuron', 'Alpha motor neuron for the quadriceps (drawn about 10 times larger)');
  const inSoma = soma(IN, 0.18, 0x8f7ff0, 'reciprocal-inhibition', 'Inhibitory interneuron');
  // Dendrites on the motor neuron.
  const dendMat = glow(0xf2a65a, 0.7);
  for (let i = 0; i < 7; i++) {
    const a = rand() * Math.PI * 2;
    const len = 0.5 + rand() * 0.6;
    root.add(pick(capsuleBetween(MN_Q.toArray(), [MN_Q.x + Math.cos(a) * len, MN_Q.y + Math.sin(a) * len, FACE], 0.025, dendMat, 5), 'motor-neuron', 'Motor neuron dendrites'));
  }
  // Other motor neurons in the ventral horn, dim, so the one in the circuit stands out.
  const crowd = M(0xb48a9a, { roughness: 0.5 });
  for (const s of [1, -1]) {
    for (let i = 0; i < 26; i++) {
      const x = s * (1.9 + rand() * 1.4);
      const y = -0.9 - rand() * 1.5;
      if (s === 1 && Math.hypot(x - MN_Q.x, y - MN_Q.y) < 0.55) continue;
      const z = (rand() - 0.5) * (SLAB - 0.4);
      root.add(pick(ellipsoid([x, y, z], [0.09, 0.08, 0.08], crowd, 8), 'ventral-horn', 'Motor neuron'));
    }
  }
  // Fiber tracts: faint dots in the white matter, cut ends of axons.
  const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(0.035, 6), M.basic(0xcfc3a8, { transparent: true, opacity: 0.55 }), 900);
  const m4 = new THREE.Matrix4();
  let placed = 0;
  const inGray = (x, y) => {
    const poly = butterfly();
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i];
      const [xj, yj] = poly[j];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  };
  while (placed < 900) {
    const x = (rand() * 2 - 1) * RX * 0.97;
    const y = (rand() * 2 - 1) * RY * 0.97;
    if ((x / RX) ** 2 + (y / RY) ** 2 > 0.94 || inGray(x, y) || (Math.abs(x) < 0.2 && y < -1.6)) continue;
    m4.makeTranslation(x, y, SLAB / 2 + 0.01);
    dots.setMatrixAt(placed++, m4);
  }
  dots.userData.pickPriority = -2;
  root.add(pick(dots, 'spinal-white-matter', 'Cut ends of nerve fibers'));

  // Pulses and synapse flashes.
  const pulse = (c, r = 0.2) => {
    const m = ellipsoid([0, 0, 0], [r, r, r], M(c, { roughness: 0.2, emissive: c, emissiveIntensity: 1.5 }), 12);
    root.add(pick(m, 'reflex-arc', 'Nerve signal'));
    return m;
  };
  const pS = pulse(0xffe9a0);
  const pB = pulse(0xffe9a0, 0.14);
  const pM = pulse(0xffc38a);
  const pI = pulse(0xc6bcff, 0.15);

  function apply(x) {
    const up = ramp(x, 1, 1.95);
    pS.visible = x > 0.6 && x < 2.05;
    pS.position.copy(sensory.getPointAt(Math.min(1, x < 1 ? 0 : up)));
    pB.visible = x > 1.75 && x < 2.3;
    pB.position.copy(branch.getPointAt(ramp(x, 1.75, 2.2)));
    const flash = Math.sin(Math.PI * ramp(x, 1.9, 2.5));
    mnSoma.material.emissiveIntensity = 0.4 + 1.6 * flash;
    inSoma.material.emissiveIntensity = 0.4 + 1.6 * Math.sin(Math.PI * ramp(x, 2.1, 2.6));
    drgSoma.material.emissiveIntensity = 0.4 + 1.2 * Math.sin(Math.PI * ramp(x, 1.1, 1.5));
    pM.visible = x > 2.35 && x < 3.55;
    pM.position.copy(motor.getPointAt(ramp(x, 2.4, 3.5)));
    pI.visible = x > 2.5 && x < 3.5;
    pI.position.copy(inhibit.getPointAt(ramp(x, 2.55, 3.4)));
  }
  const { controls, update } = stagedControls({ stages: CORD_STAGES, apply, reducedMotion, rate: 0.3, still: 2.2 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    frameWidth: 3.2e-2,
    view: { target: [2.2, 0.2, 0], direction: [0.28, 0.22, 1] },
    focus: [MN_Q.x, MN_Q.y, MN_Q.z],
    controls,
    update,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
