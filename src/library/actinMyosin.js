// Shared library scene: actin and myosin, the cross-bridge cycle.
// 1 scene unit = 1 nm. A thin filament (F-actin: 5.5 nm subunits, 2.75 nm
// rise, −166° twist, with tropomyosin in the grooves) runs above a thick
// filament. One myosin head works through the cycle: bind, release
// phosphate, power stroke, ATP binds, release, re-cock. Each stroke moves
// actin by a quarter of the 35.75 nm helical repeat (about 9 nm), so the
// animation loops seamlessly. Timing is slowed about 100× for viewing.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, tubeThrough, cylinderBetween, disposeTree } from '../scenes/kit.js';
import { ACTIN_RISE_NM, ACTIN_REPEAT_SUBUNITS } from '../science/equations.js';

const TWIST = THREE.MathUtils.degToRad(-166.15);
const REPEAT = ACTIN_RISE_NM * ACTIN_REPEAT_SUBUNITS; // 35.75 nm
export const STROKE_NM = REPEAT / 4; // ≈ 8.94 nm per cycle
const PHI_PRE = THREE.MathUtils.degToRad(125);
const PHI_POST = THREE.MathUtils.degToRad(55);
export const LEVER_NM = STROKE_NM / (Math.cos(PHI_POST) - Math.cos(PHI_PRE));
const ACTIN_Y = 8;
const PIVOT = new THREE.Vector3(0, -10, 0);

export const PHASES = [
  { until: 0.12, text: '1. Binding. The head, holding ADP and phosphate, grabs the actin filament.' },
  { until: 0.2, text: '2. Phosphate leaves the head, which triggers the power stroke.' },
  { until: 0.5, text: '3. Power stroke. The lever swings about 70° and pulls actin about 9 nm. ADP leaves at the end.' },
  { until: 0.6, text: '4. ATP binds in the empty pocket. Without ATP the head would stay stuck (this is rigor mortis).' },
  { until: 0.68, text: '5. Release. With ATP bound, the head lets go of actin.' },
  { until: 0.9, text: '6. Re-cocking. The head splits ATP into ADP and phosphate and swings back.' },
  { until: 1.0, text: '6. Re-cocking. The head splits ATP into ADP and phosphate and swings back.' },
];

const smooth = (a, b, t) => {
  const x = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return x * x * (3 - 2 * x);
};

/** Head pose for a cycle position t ∈ [0, 1): lever angle, how far the motor sits from actin, and stroke progress. */
export function headPose(t) {
  const stroke = smooth(0.2, 0.5, t);
  const recock = smooth(0.68, 0.9, t);
  const phi = t < 0.68 ? PHI_PRE + (PHI_POST - PHI_PRE) * stroke : PHI_POST + (PHI_PRE - PHI_POST) * recock;
  const attached = t < 0.6 ? smooth(0, 0.1, t) : 1 - smooth(0.6, 0.68, t);
  return { phi, drop: 3 * (1 - attached), stroke: t < 0.68 ? stroke : 1 };
}

export function buildActinMyosin({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();

  // Thin filament (moves).
  const thin = new THREE.Group();
  root.add(thin);
  const actinGeo = new THREE.SphereGeometry(2.7, 16, 12);
  const strands = [M(0x8a78e8, { roughness: 0.45 }), M(0xa596f2, { roughness: 0.45 })];
  const N = 44;
  for (let i = -N; i <= N; i++) {
    const a = i * TWIST;
    const mesh = new THREE.Mesh(actinGeo, strands[((i % 2) + 2) % 2]);
    mesh.position.set(i * ACTIN_RISE_NM, ACTIN_Y + Math.cos(a) * 2.5, Math.sin(a) * 2.5);
    thin.add(pick(mesh, 'actin-myosin', 'Actin subunit (G-actin)'));
  }
  const tropoMat = M(0xe8c45a, { roughness: 0.4 });
  for (const off of [0, Math.PI]) {
    const pts = [];
    for (let x = -N * ACTIN_RISE_NM; x <= N * ACTIN_RISE_NM; x += 2) {
      // The long-pitch grooves turn slowly: +27.7° per two subunits.
      const a = (x / (2 * ACTIN_RISE_NM)) * (2 * TWIST + 2 * Math.PI) + off + Math.PI / 2;
      pts.push([x, ACTIN_Y + Math.cos(a) * 4.6, Math.sin(a) * 4.6]);
    }
    thin.add(pick(tubeThrough(pts, 0.55, tropoMat, 400, 6), 'tropomyosin', 'Tropomyosin'));
  }

  // Thick filament backbone.
  const myoMat = M(0xf08baf, { roughness: 0.45 });
  root.add(pick(cylinderBetween([-80, -17, 0], [80, -17, 0], 3.2, 3.2, myoMat, 20), 'thick-filament', 'Thick filament backbone'));
  // Resting heads along the backbone for context.
  const restMat = M(0xf5a3c1, { roughness: 0.5, transparent: true, opacity: 0.55 });
  for (const x of [-48, -30, 30, 48]) {
    root.add(pick(cylinderBetween([x - 4, -14.5, 0], [x - 1, -10, -1.5], 0.8, 0.8, restMat, 8), 'thick-filament', 'Myosin head (resting)'));
    root.add(pick(ellipsoid([x + 2, -6.5, -2], [4.4, 2.6, 2.8], restMat, 16), 'thick-filament', 'Myosin head (resting)'));
  }

  // The working head.
  const headMat = M(0xf08baf, { roughness: 0.35, emissive: 0xf08baf, emissiveIntensity: 0.12 });
  root.add(pick(cylinderBetween([-7, -14.2, 0], PIVOT.toArray(), 0.9, 0.9, headMat, 10), 'myosin-head', 'Myosin tail (S2)'));
  const leverGeo = new THREE.CylinderGeometry(0.9, 0.9, 1, 12);
  const lever = new THREE.Mesh(leverGeo, M(0xe8c45a, { roughness: 0.4 }));
  root.add(pick(lever, 'myosin-head', 'Lever arm with light chains'));
  const motor = ellipsoid([0, 0, 0], [5, 3, 3.2], headMat, 28);
  root.add(pick(motor, 'myosin-head', 'Myosin motor domain'));

  // Nucleotides: adenosine plus a chain of phosphates.
  const adenMat = M(0x5a8deb, { roughness: 0.4 });
  const phosMat = M(0xf2a65a, { roughness: 0.35, emissive: 0xf2a65a, emissiveIntensity: 0.2 });
  const nucleotide = new THREE.Group();
  nucleotide.add(pick(ellipsoid([0, 0, 0], [1.1, 0.8, 0.8], adenMat, 12), 'atp-cycle', 'Adenosine'));
  const phosGeo = new THREE.SphereGeometry(0.55, 12, 8);
  const p1 = new THREE.Mesh(phosGeo, phosMat);
  const p2 = new THREE.Mesh(phosGeo, phosMat);
  const p3 = new THREE.Mesh(phosGeo, phosMat);
  [p1, p2, p3].forEach((p, i) => {
    p.position.set(1.4 + i * 1.1, 0, 0);
    nucleotide.add(pick(p, 'atp-cycle', 'Phosphate'));
  });
  root.add(nucleotide);

  const tmp = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  let t = reducedMotion ? 0.35 : 0;
  let cycles = 0;

  function apply(tt) {
    const { phi, drop, stroke } = headPose(tt);
    const C = PIVOT.clone().add(new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0).multiplyScalar(LEVER_NM));
    const mid = PIVOT.clone().add(C).multiplyScalar(0.5);
    lever.position.copy(mid);
    lever.quaternion.setFromUnitVectors(up, tmp.copy(C).sub(PIVOT).normalize());
    lever.scale.set(1, LEVER_NM, 1);
    motor.position.set(C.x + 1.5, C.y + 3.4 - drop, 0);
    // Actin rides along with the power stroke.
    thin.position.x = ((cycles + stroke) * STROKE_NM) % REPEAT;

    // Nucleotide state.
    const pocket = motor.position.clone().add(new THREE.Vector3(-1.2, -0.6, 3.3));
    nucleotide.position.copy(pocket);
    nucleotide.visible = true;
    p1.visible = p2.visible = p3.visible = true;
    p3.position.set(3.6, 0, 0);
    if (tt < 0.12) {
      p3.position.set(4.6, 0.6, 0); // ADP + Pi, phosphate split off
    } else if (tt < 0.2) {
      const k = smooth(0.12, 0.2, tt);
      p3.position.set(4.6 + 10 * k, 0.6 + 6 * k, 2 * k); // phosphate leaves
      p3.visible = k < 0.98;
    } else if (tt < 0.5) {
      p3.visible = false;
      const k = smooth(0.44, 0.5, tt);
      nucleotide.position.add(new THREE.Vector3(-8 * k, -5 * k, 3 * k)); // ADP leaves at the end
      nucleotide.visible = k < 0.98;
    } else if (tt < 0.6) {
      const k = smooth(0.5, 0.58, tt);
      nucleotide.position.add(new THREE.Vector3(12 * (1 - k), 8 * (1 - k), 4 * (1 - k))); // ATP arrives
    } else if (tt < 0.68) {
      // ATP bound; phosphates in a chain.
    } else {
      const k = smooth(0.7, 0.85, tt);
      p3.position.set(3.6 + 1.0 * k, 0.6 * k, 0); // hydrolysis: the last phosphate separates
    }
    const phase = PHASES.find((p) => tt < p.until) ?? PHASES[PHASES.length - 1];
    controls.readout = phase.text;
  }

  const controls = {
    label: 'Cycle position',
    unit: '%',
    min: 0,
    max: 99,
    step: 1,
    value: Math.round(t * 100),
    presets: [{ label: 'Play or pause', action: 'play' }],
    playing: !reducedMotion,
    readout: '',
    set(v) {
      t = v / 100;
      controls.value = v;
      apply(t);
      return controls.readout;
    },
  };
  apply(t);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-9,
    view: { target: [0, -2, 0], direction: [0.2, 0.18, 1] },
    focus: [0, ACTIN_Y, 0],
    controls,
    update(dt) {
      if (!controls.playing) return;
      t += dt / 5; // one cycle every 5 seconds
      if (t >= 1) {
        t -= 1;
        cycles = (cycles + 1) % 4;
      }
      controls.value = Math.round(t * 100);
      apply(t);
    },
    dispose() {
      actinGeo.dispose();
      leverGeo.dispose();
      phosGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
