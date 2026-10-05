// Module scene: the knee-jerk reflex in a seated person, seen from the side.
// 1 scene unit = 1 m. A generalized figure: thigh, knee and shin, the
// quadriceps and hamstrings, the lower spine with the spinal cord inside, and
// the two nerve paths of the reflex drawn as glowing lines. Timing follows the
// model in src/science/reflex.js, slowed about a thousand times.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, capsuleBetween, ellipsoid, disposeTree, latheBetween, longBone, softShadowTexture } from './kit.js';
import { stagedControls, ramp } from './stages.js';
import { reflexLatency } from '../science/reflex.js';

const T = reflexLatency();
const ms = (x) => `${x.toFixed(1)} ms`;
const at = {
  sensed: T.sensoryMs,
  switched: T.sensoryMs + T.synapseMs,
  arrived: T.sensoryMs + T.synapseMs + T.motorMs,
  total: T.totalMs,
};

export const REFLEX_STAGES = [
  { label: 'Tap', text: 'Tap. The hammer hits the tendon below the kneecap and stretches the quadriceps for an instant. Stretch sensors in the muscle (muscle spindles) fire.' },
  { label: 'Sense', text: `Sense. The signal races up a large sensory nerve fiber to the spinal cord, about half a meter in ${ms(T.sensoryMs)}.` },
  { label: 'Switch', text: `Switch. In the spinal cord it crosses a single synapse straight onto a motor neuron (${ms(T.synapseMs)}). A side branch switches on an inhibitory neuron for the hamstrings. The brain is not involved.` },
  { label: 'Command', text: `Command. The motor neuron’s signal runs back down to the quadriceps in ${ms(T.motorMs)}, while the hamstrings are told to relax.` },
  { label: 'Kick', text: `Kick. The quadriceps contracts and the leg kicks: about ${Math.round(T.totalMs)} ms after the tap, close to the 18 ms measured in people. Animation slowed about a thousand times.` },
];

// Key points (meters): the person sits with the hip at the origin side, thigh pointing +x.
const HIP = new THREE.Vector3(0.04, 0.52, 0);
const KNEE = new THREE.Vector3(0.48, 0.52, 0);
const ANKLE = new THREE.Vector3(0.49, 0.08, 0);
const CORD_L3 = new THREE.Vector3(-0.07, 0.86, 0);

/** The two reflex paths as curves, so their lengths can be checked against the model. */
export function reflexPaths() {
  const v = (x, y, z) => new THREE.Vector3(x, y, z);
  const sensory = new THREE.CatmullRomCurve3([
    v(0.27, 0.585, 0.02), v(0.16, 0.6, 0.035), v(0.06, 0.62, 0.05), v(-0.02, 0.66, 0.04), v(-0.06, 0.72, 0.02), v(-0.072, 0.8, 0.008), CORD_L3.clone().add(v(0, 0, -0.008)),
  ]);
  const motor = new THREE.CatmullRomCurve3([
    CORD_L3.clone().add(v(0, -0.005, 0.008)), v(-0.064, 0.79, 0.022), v(-0.05, 0.71, 0.036), v(-0.01, 0.645, 0.056), v(0.07, 0.61, 0.062), v(0.18, 0.59, 0.05), v(0.29, 0.575, 0.035),
  ]);
  const inhibit = new THREE.CatmullRomCurve3([
    CORD_L3.clone().add(v(0.004, -0.01, 0)), v(-0.07, 0.74, -0.01), v(-0.04, 0.6, -0.03), v(0.06, 0.49, -0.035), v(0.22, 0.465, -0.03),
  ]);
  return { sensory, motor, inhibit };
}

export function buildReflexArc({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();

  // Chair and floor shadow.
  const wood = M(0x3b3156, { roughness: 0.85 });
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.04, 0.44), wood);
  seat.position.set(0.12, 0.44, 0);
  root.add(pick(seat, 'reflex-arc', 'Chair'));
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.44), wood);
  back.position.set(-0.13, 0.7, 0);
  root.add(pick(back, 'reflex-arc', 'Chair'));
  for (const [x, z] of [[-0.09, -0.19], [-0.09, 0.19], [0.33, -0.19], [0.33, 0.19]]) {
    root.add(pick(capsuleBetween([x, 0.0, z], [x, 0.42, z], 0.014, wood, 8), 'reflex-arc', 'Chair'));
  }
  const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), M.basic(0x07051a, { map: softShadowTexture(), transparent: true, opacity: 0.6, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.set(0.2, 0.002, 0);
  root.add(shadow);

  // Skin (translucent) over the trunk and thigh.
  const skin = M(COLORS.skin, { transparent: true, opacity: 0.11, depthWrite: false, roughness: 0.4, tissue: 'skin', repeat: [2, 2] });
  const skinMesh = (m) => {
    m.userData.pickPriority = -1;
    return pick(m, 'reflex-arc', 'Body');
  };
  root.add(skinMesh(latheBetween([-0.04, 0.48, 0], [-0.03, 1.15, 0], [[0, 0.15], [0.2, 0.16], [0.55, 0.13], [0.85, 0.15], [1, 0.12]], skin, { squash: [0.65, 1], segments: 32 })));
  root.add(skinMesh(latheBetween(HIP.toArray(), KNEE.toArray(), [[0, 0.085], [0.2, 0.08], [0.6, 0.068], [0.92, 0.05], [1, 0.048]], skin, { segments: 28 })));

  // Spine: vertebrae from the sacrum up, with the cord ending near the first lumbar vertebra.
  const bone = M(COLORS.bone, { roughness: 0.55, tissue: 'bone', repeat: [1, 2] });
  for (let i = 0; i < 17; i++) {
    const y = 0.52 + i * 0.037;
    const v = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.026, 14), bone);
    v.position.set(-0.04, y, 0);
    root.add(pick(v, 'reflex-arc', i < 5 ? 'Lumbar vertebra' : 'Thoracic vertebra'));
    root.add(pick(capsuleBetween([-0.062, y, 0], [-0.088, y - 0.01, 0], 0.006, bone, 6), 'reflex-arc', 'Vertebra (spinous process)'));
  }
  const nerveMat = M(COLORS.nerve, { roughness: 0.45, tissue: 'nerve' });
  root.add(pick(capsuleBetween([-0.07, 1.15, 0], [-0.07, 0.8, 0], 0.0065, nerveMat, 10), 'spinal-cord', 'Spinal cord (its L2–L4 segments sit near the bottom of the rib cage)'));
  for (let k = -2; k <= 2; k++) root.add(pick(capsuleBetween([-0.07, 0.8, k * 0.002], [-0.066 + k * 0.002, 0.53, k * 0.003], 0.0018, nerveMat, 5), 'spinal-cord', 'Nerve roots below the cord (cauda equina)'));
  const segment = ellipsoid(CORD_L3.toArray(), [0.012, 0.03, 0.012], M(0xf2a65a, { roughness: 0.35, emissive: 0xf2a65a, emissiveIntensity: 0.5, transparent: true, opacity: 0.55 }), 16);
  root.add(pick(segment, 'spinal-cord', 'Spinal cord segments L2–L4'));

  // Thigh: femur, quadriceps on top, hamstrings underneath.
  root.add(pick(longBone([HIP.x, HIP.y, 0], [KNEE.x - 0.01, KNEE.y, 0], 0.013, 0.025, bone), 'reflex-arc', 'Femur'));
  const quadMat = M(0xd65a6e, { roughness: 0.5, tissue: 'muscle', repeat: [1, 2] });
  const quad = latheBetween([0.07, 0.565, 0.005], [0.44, 0.56, 0.005], [[0, 0.02], [0.2, 0.045], [0.55, 0.05], [0.85, 0.035], [1, 0.012]], quadMat, { segments: 24, squash: [1, 0.8] });
  root.add(pick(quad, 'quadriceps', 'Quadriceps (stretched by the tap)'));
  const hamMat = M(0xc4566a, { roughness: 0.5, tissue: 'muscle', repeat: [1, 2] });
  const ham = latheBetween([0.07, 0.48, -0.005], [0.43, 0.475, -0.005], [[0, 0.015], [0.25, 0.038], [0.6, 0.04], [1, 0.012]], hamMat, { segments: 24, squash: [1, 0.8] });
  root.add(pick(ham, 'hamstrings', 'Hamstrings (told to relax)'));
  const spindle = ellipsoid([0.27, 0.585, 0.02], [0.012, 0.005, 0.005], M(0xe8c45a, { roughness: 0.3, emissive: 0xe8c45a, emissiveIntensity: 0.9 }), 12);
  root.add(pick(spindle, 'muscle-spindle', 'Muscle spindle (stretch sensor, drawn much larger than life)'));

  // Knee: kneecap and the patellar tendon the hammer hits.
  root.add(pick(ellipsoid([KNEE.x + 0.025, KNEE.y + 0.02, 0], [0.018, 0.024, 0.02], bone, 16), 'patellar-tendon', 'Kneecap (patella)'));
  const tendonMat = M(0xefe6d6, { roughness: 0.35, tissue: 'tendon' });
  root.add(pick(capsuleBetween([KNEE.x + 0.036, KNEE.y - 0.005, 0], [KNEE.x + 0.03, KNEE.y - 0.075, 0], 0.008, tendonMat, 10), 'patellar-tendon', 'Patellar tendon (where the hammer taps)'));

  // Shin and foot hang from the knee and swing forward in the kick.
  const shin = new THREE.Group();
  shin.position.copy(KNEE);
  root.add(shin);
  const local = (p) => p.clone().sub(KNEE).toArray();
  shin.add(pick(longBone(local(new THREE.Vector3(KNEE.x, KNEE.y - 0.02, 0)), local(ANKLE), 0.012, 0.026, bone), 'reflex-arc', 'Tibia'));
  shin.add(skinMesh(latheBetween(local(new THREE.Vector3(KNEE.x + 0.005, KNEE.y + 0.01, 0)), local(ANKLE), [[0, 0.05], [0.25, 0.052], [0.6, 0.038], [1, 0.026]], skin, { segments: 24 })));
  shin.add(pick(ellipsoid(local(new THREE.Vector3(ANKLE.x + 0.06, 0.035, 0)), [0.11, 0.03, 0.04], skin, 16), 'reflex-arc', 'Foot'));
  const calfMat = M(0xc4566a, { roughness: 0.5, tissue: 'muscle', repeat: [1, 2] });
  shin.add(pick(latheBetween(local(new THREE.Vector3(KNEE.x - 0.025, KNEE.y - 0.05, 0)), local(new THREE.Vector3(ANKLE.x - 0.015, 0.2, 0)), [[0, 0.01], [0.3, 0.035], [1, 0.01]], calfMat, { segments: 16 }), 'reflex-arc', 'Calf muscles'));

  // Reflex hammer.
  const hammer = new THREE.Group();
  const rubber = M(0xd9434f, { roughness: 0.6 });
  const handle = M(0xb8b0dc, { roughness: 0.3, metalness: 0.6 });
  hammer.add(pick(capsuleBetween([0, 0, 0], [0.2, 0.12, 0], 0.005, handle, 8), 'reflex-arc', 'Reflex hammer'));
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 20), rubber);
  head.rotation.x = Math.PI / 2;
  hammer.add(pick(head, 'reflex-arc', 'Reflex hammer'));
  root.add(hammer);
  const strike = new THREE.Vector3(KNEE.x + 0.052, KNEE.y - 0.045, 0);

  // Nerve paths and the pulses that travel along them.
  const { sensory, motor, inhibit } = reflexPaths();
  const pathMat = (c, o = 0.6) => M(c, { roughness: 0.4, emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: o });
  const tube = (curve, r, mat) => new THREE.Mesh(new THREE.TubeGeometry(curve, 80, r, 6, false), mat);
  root.add(pick(tube(sensory, 0.0032, pathMat(0xe8c45a)), 'sensory-neuron', 'Sensory nerve fiber (from the muscle spindle)'));
  root.add(pick(tube(motor, 0.0032, pathMat(0xf2a65a)), 'motor-neuron', 'Motor nerve fiber (to the quadriceps)'));
  root.add(pick(tube(inhibit, 0.0022, pathMat(0x8f7ff0, 0.45)), 'reciprocal-inhibition', 'Path that relaxes the hamstrings'));
  const pulse = (c) => {
    const m = ellipsoid([0, 0, 0], [0.011, 0.011, 0.011], M(c, { roughness: 0.2, emissive: c, emissiveIntensity: 1.4 }), 12);
    root.add(pick(m, 'reflex-arc', 'Nerve signal'));
    return m;
  };
  const pS = pulse(0xffe9a0);
  const pM = pulse(0xffc38a);
  const pI = pulse(0xc6bcff);

  // Timeline (slider value v, one unit per stage): tap 0–1, sensory signal 1–1.9,
  // synapse 1.9–2.4, motor signal 2.4–3.5, kick 3.5–4.
  const spindleSize = spindle.scale.clone();
  function apply(v) {
    // Tap: the hammer swings in and back out.
    const swing = Math.sin(Math.PI * ramp(v, 0, 0.9));
    hammer.position.copy(strike).add(new THREE.Vector3(0.012, 0.004, 0)).add(new THREE.Vector3(0.06, 0.12, 0).multiplyScalar(1 - swing));
    hammer.rotation.z = -0.6 * (1 - swing);
    spindle.scale.copy(spindleSize).multiplyScalar(1 + 0.6 * Math.sin(Math.PI * ramp(v, 0.4, 1.1)));
    // Signals.
    pS.visible = v > 0.9 && v < 1.95;
    pS.position.copy(sensory.getPointAt(ramp(v, 1, 1.9)));
    segment.material.emissiveIntensity = 0.5 + 1.5 * Math.sin(Math.PI * ramp(v, 1.85, 2.45));
    pM.visible = v > 2.35 && v < 3.55;
    pM.position.copy(motor.getPointAt(ramp(v, 2.4, 3.5)));
    pI.visible = v > 2.4 && v < 3.5;
    pI.position.copy(inhibit.getPointAt(ramp(v, 2.45, 3.4)));
    // Kick: quadriceps shortens and thickens, the shin swings forward.
    const k = ramp(v, 3.5, 3.95);
    quad.scale.set(1 + 0.15 * k, 1 - 0.06 * k, 1 + 0.15 * k);
    shin.rotation.z = 0.5 * k;
  }

  const readout = (v, stage) => {
    const clock = v < 1 ? 0 : v < 1.9 ? at.sensed * ramp(v, 1, 1.9) : v < 2.4 ? at.switched : v < 3.5 ? at.switched + T.motorMs * ramp(v, 2.4, 3.5) : at.total;
    return `${REFLEX_STAGES[stage].text} Clock: ${clock.toFixed(1)} ms.`;
  };
  const { controls, update } = stagedControls({ stages: REFLEX_STAGES, apply, readout, reducedMotion, rate: 0.3, still: 3 });

  return {
    root,
    fit: 'both',
    frameWidth: 1.75,
    metersPerUnit: 1,
    view: { target: [0.22, 0.58, 0], direction: [0.12, 0.08, 1] },
    focus: CORD_L3.toArray(),
    controls,
    update,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
