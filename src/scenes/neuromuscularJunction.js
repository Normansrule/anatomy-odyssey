// Tier 6: the neuromuscular junction, where the reflex's motor neuron meets
// the quadriceps. 1 scene unit = 10 nm.
// Above: the nerve ending (terminal), cut open, full of vesicles and
// mitochondria, capped by a Schwann cell. Below: the muscle fiber's membrane
// at the end plate, pleated into deep junctional folds. Between them: a gap
// drawn about 50 nm wide, holding a mesh (basal lamina) studded with the enzyme
// acetylcholinesterase. Acetylcholine receptors crowd the crests of the folds.
// The stage control steps through one signal. Molecules and receptors are
// drawn several times larger than life so they can be seen.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, seeded, disposeTree, ellipsoid } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const NMJ_CLEFT_NM = 50;
const GAP = NMJ_CLEFT_NM / 10; // scene units
const VESICLE_R = 2.5; // 50 nm diameter
const FOLD_SPACING = 46;
const FOLD_DEPTH = 55;
const FOLD_HALF_WIDTH = 4;
const SPAN_X = 300;
const SPAN_Z = 170;
const CUT_CENTER = Math.atan2(0.4, 0.9);
const CUT_HALF = Math.PI / 3.2;
const PRE = [[0, GAP], [98, GAP], [112, GAP + 8], [118, GAP + 30], [110, GAP + 62], [88, GAP + 90], [56, GAP + 110], [24, GAP + 120], [0, GAP + 122]];

export const NMJ_STAGES = [
  { label: 'Resting', text: 'Resting. Vesicles, each holding thousands of acetylcholine molecules, wait at active zones lined up with the mouths of the folds below.' },
  { label: 'Spike arrives', text: 'The motor neuron’s impulse reaches the terminal. Voltage-gated channels open and calcium ions rush in.' },
  { label: 'Release', text: 'Calcium makes vesicles fuse with the membrane and spill their acetylcholine into the gap.' },
  { label: 'Receptors open', text: 'Acetylcholine binds receptors on the crests of the folds. They open, sodium ions flood into the muscle fiber, and an impulse spreads along it: the quadriceps contracts.' },
  { label: 'Cleared', text: 'Acetylcholinesterase in the gap cuts acetylcholine into acetate and choline almost at once, so each impulse gives one brief twitch. The terminal takes the choline back to make new acetylcholine.' },
];

/** Height of the muscle membrane at x: flat crests, deep narrow folds. */
export function endPlateHeight(x) {
  const phase = ((x % FOLD_SPACING) + FOLD_SPACING) % FOLD_SPACING - FOLD_SPACING / 2;
  const t = Math.min(1, Math.max(0, (Math.abs(phase) - FOLD_HALF_WIDTH) / 3));
  return -FOLD_DEPTH * (1 - t * t * (3 - 2 * t));
}

export function buildNeuromuscularJunction({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1951);

  // The nerve terminal: a dome cut open toward the viewer.
  const phiStart = CUT_CENTER + CUT_HALF;
  const phiLength = Math.PI * 2 - 2 * CUT_HALF;
  const preGeo = new THREE.LatheGeometry(PRE.map(([r, y]) => new THREE.Vector2(r, y)), 72, phiStart, phiLength);
  root.add(pick(new THREE.Mesh(preGeo, M(0xf0a8c4, { roughness: 0.45, side: THREE.FrontSide })), 'axon-terminal', 'Motor nerve terminal'));
  root.add(pick(new THREE.Mesh(preGeo, M(0x8e4f73, { roughness: 0.7, side: THREE.BackSide })), 'axon-terminal', 'Inside of the nerve terminal'));
  // Schwann cell capping the terminal, and the axon arriving from the spinal cord.
  const capGeo = new THREE.LatheGeometry(PRE.slice(3).map(([r, y]) => new THREE.Vector2(r + 10, y + 8)), 64, phiStart, phiLength);
  const cap = new THREE.Mesh(capGeo, M(0xe9dfc8, { roughness: 0.5, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide }));
  cap.userData.pickPriority = -1;
  root.add(pick(cap, 'neuromuscular-junction', 'Schwann cell (covers the terminal)'));
  root.add(pick(capsuleBetween([-60, GAP + 112, -10], [-260, GAP + 170, -40], 16, M(0xf0a8c4, { roughness: 0.45 }), 20), 'motor-neuron', 'Motor axon (from the spinal cord, about half a meter away)'));

  // Mitochondria and vesicles in the terminal (behind the cut).
  const mito = M(0xf2a65a, { roughness: 0.45 });
  for (let k = 0; k < 6; k++) {
    const a = phiStart + 0.6 + rand() * (phiLength - 1.2);
    const r = 40 + rand() * 40;
    const y = GAP + 55 + rand() * 40;
    root.add(pick(capsuleBetween([Math.sin(a) * r, y, Math.cos(a) * r], [Math.sin(a + 0.25) * (r + 10), y + 6, Math.cos(a + 0.25) * (r + 10)], 7, mito, 10), 'mitochondrion', 'Mitochondrion (powers vesicle recycling)'));
  }
  const vesMat = M(0xffd9e8, { roughness: 0.3, transparent: true, opacity: 0.9 });
  const vGeo = new THREE.SphereGeometry(VESICLE_R, 14, 10);
  const docked = [];
  const zones = [];
  for (let k = -2; k <= 1; k++) zones.push((k + 0.5) * FOLD_SPACING); // active zones over the fold mouths (folds sit at odd half-spacings)
  for (let k = 0; k < 90; k++) {
    const nearZone = k < zones.length * 3;
    let p;
    if (nearZone) {
      const zx = zones[k % zones.length];
      p = new THREE.Vector3(zx + (rand() - 0.5) * 10, GAP + VESICLE_R + 1 + Math.floor(k / zones.length) * 5.2, -12 - rand() * 30);
    } else {
      const a = phiStart + rand() * phiLength;
      const r = rand() * 90;
      p = new THREE.Vector3(Math.sin(a) * r, GAP + 10 + rand() * 50, Math.cos(a) * r);
      if (Math.cos(a - CUT_CENTER) > Math.cos(CUT_HALF)) continue;
    }
    const v = new THREE.Mesh(vGeo, vesMat);
    v.position.copy(p);
    root.add(pick(v, 'synaptic-vesicle', 'Synaptic vesicle (full of acetylcholine)'));
    if (nearZone && p.y < GAP + VESICLE_R + 2) docked.push({ mesh: v, home: p.clone() });
  }

  // The muscle fiber below: its membrane pleated into junctional folds.
  const plateGeo = new THREE.PlaneGeometry(SPAN_X, SPAN_Z, 600, 1).rotateX(-Math.PI / 2);
  const pp = plateGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) pp.setY(i, endPlateHeight(pp.getX(i)));
  plateGeo.computeVertexNormals();
  root.add(pick(new THREE.Mesh(plateGeo, M(0xd65a6e, { roughness: 0.5, side: THREE.DoubleSide })), 'motor-end-plate', 'Muscle fiber membrane at the end plate, with junctional folds'));
  const fiber = new THREE.Mesh(new THREE.BoxGeometry(SPAN_X, 70, SPAN_Z), M(0xb84a5e, { roughness: 0.55, tissue: 'muscle', repeat: [1, 1] }));
  fiber.position.y = -FOLD_DEPTH - 36;
  root.add(pick(fiber, 'muscle-fiber', 'Muscle fiber (of the quadriceps)'));
  // Front face of the folds, so the pleats read in section.
  const shape = new THREE.Shape();
  shape.moveTo(-SPAN_X / 2, -FOLD_DEPTH - 2);
  for (let x = -SPAN_X / 2; x <= SPAN_X / 2; x += 0.5) shape.lineTo(x, endPlateHeight(x));
  shape.lineTo(SPAN_X / 2, -FOLD_DEPTH - 2);
  const face = new THREE.Mesh(new THREE.ShapeGeometry(shape), M(0xc04f63, { roughness: 0.6 }));
  face.position.z = SPAN_Z / 2 + 0.05;
  root.add(pick(face, 'motor-end-plate', 'Junctional folds, cut across'));

  // Basal lamina in the gap, with acetylcholinesterase.
  const lamina = new THREE.Mesh(new THREE.PlaneGeometry(SPAN_X * 0.8, SPAN_Z * 0.9).rotateX(-Math.PI / 2), M(0x9fd4ff, { transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
  lamina.position.y = GAP * 0.5;
  lamina.userData.pickPriority = -1;
  root.add(pick(lamina, 'neuromuscular-junction', 'The gap (synaptic cleft) with its basal lamina'));
  const aceMat = M(0xf0dc96, { roughness: 0.4, emissive: 0xf0dc96, emissiveIntensity: 0.25 });
  for (let k = 0; k < 70; k++) {
    const x = (rand() - 0.5) * SPAN_X * 0.75;
    const z = (rand() - 0.5) * SPAN_Z * 0.8;
    root.add(pick(ellipsoid([x, GAP * 0.5, z], [1.2, 0.8, 1.2], aceMat, 8), 'acetylcholinesterase', 'Acetylcholinesterase (enlarged)'));
  }
  // Acetylcholine receptors on the fold crests.
  const recGeo = new THREE.CylinderGeometry(1.1, 1.1, 2.4, 10).translate(0, 1.2, 0);
  const recMat = M(0x7cc49a, { roughness: 0.4, emissive: 0x7cc49a, emissiveIntensity: 0.2 });
  const recs = new THREE.InstancedMesh(recGeo, recMat, 900);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let tries = 0; tries < 4000 && n < 900; tries++) {
    const x = (rand() - 0.5) * SPAN_X * 0.9;
    const z = (rand() - 0.5) * SPAN_Z * 0.9;
    if (endPlateHeight(x) < -1) continue;
    m4.makeTranslation(x, 0, z);
    recs.setMatrixAt(n++, m4);
  }
  recs.count = n;
  root.add(pick(recs, 'acetylcholine-receptor', 'Acetylcholine receptors (enlarged)'));

  // Signals: calcium in, acetylcholine across, sodium into the muscle.
  const dotGeo = new THREE.SphereGeometry(1, 8, 6);
  const swarm = (count, mat, card, label) => {
    const mesh = new THREE.InstancedMesh(dotGeo, mat, count);
    mesh.userData.seeds = Array.from({ length: count }, () => [rand(), rand(), rand(), rand()]);
    root.add(pick(mesh, card, label));
    return mesh;
  };
  const ca = swarm(60, M(0x8fd8f0, { roughness: 0.3, emissive: 0x8fd8f0, emissiveIntensity: 0.6 }), 'calcium-signal', 'Calcium ions entering');
  const ach = swarm(240, M(0xffe9a0, { roughness: 0.3, emissive: 0xffe9a0, emissiveIntensity: 0.7 }), 'acetylcholine', 'Acetylcholine (enlarged)');
  const na = swarm(120, M(0x5a8deb, { roughness: 0.3, emissive: 0x5a8deb, emissiveIntensity: 0.6 }), 'acetylcholine-receptor', 'Sodium ions flowing into the muscle');
  const place = (mesh, fn, show) => {
    mesh.visible = show;
    if (!show) return;
    mesh.userData.seeds.forEach((s, i) => {
      const [p, size] = fn(s);
      m4.compose(p, new THREE.Quaternion(), new THREE.Vector3(size, size, size));
      mesh.setMatrixAt(i, m4);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };

  function apply(v) {
    const caIn = ramp(v, 0.8, 1.8);
    place(ca, ([a, b, c]) => {
      const x = zones[Math.floor(a * zones.length)] + (b - 0.5) * 16;
      const z = -10 - c * 30;
      return [new THREE.Vector3(x, GAP + 2 + 40 * (1 - caIn) * (0.3 + b), z), 0.9];
    }, v > 0.7 && v < 3.2);
    // Docked vesicles fuse: they flatten into the membrane.
    const fuse = ramp(v, 1.8, 2.5);
    for (const d of docked) {
      d.mesh.scale.set(1 + 0.6 * fuse, 1 - 0.85 * fuse, 1 + 0.6 * fuse);
      d.mesh.position.y = d.home.y - VESICLE_R * 0.8 * fuse;
      d.mesh.visible = v < 4.2;
    }
    // Acetylcholine spreads through the gap and dips into the folds, then is cut up and fades.
    const spread = ramp(v, 2.0, 3.0);
    const fade = ramp(v, 3.6, 4.0);
    place(ach, ([a, b, c, d]) => {
      const zx = zones[Math.floor(a * zones.length)];
      const x = zx + (b - 0.5) * (8 + 70 * spread);
      const y = GAP * (0.2 + 0.7 * c) - (d < 0.3 ? 25 * spread * d : 0);
      return [new THREE.Vector3(x, y, -12 - (c - 0.5) * 40 * spread - 10), 0.7 * (1 - fade) + 0.01];
    }, v > 1.9 && v < 4);
    // Sodium flows in through the opened receptors.
    const flow = ramp(v, 2.8, 3.6);
    place(na, ([a, b, c]) => [new THREE.Vector3((a - 0.5) * SPAN_X * 0.7, 6 - (12 + 30 * b) * flow, (c - 0.5) * SPAN_Z * 0.6), 0.8], v > 2.8 && v < 3.9);
    recMat.emissiveIntensity = 0.2 + 1.2 * Math.sin(Math.PI * ramp(v, 2.7, 3.8));
    aceMat.emissiveIntensity = 0.25 + 1.0 * Math.sin(Math.PI * ramp(v, 3.5, 4));
  }
  const { controls, update } = stagedControls({ stages: NMJ_STAGES, apply, reducedMotion, rate: 0.3, still: 3 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-8,
    frameWidth: 4.6e-6,
    view: { target: [0, 10, 0], direction: [0.4, 0.42, 0.9] },
    focus: [zones[2], GAP * 0.5, -12], // over a fold mouth
    controls,
    update,
    dispose() {
      vGeo.dispose();
      recGeo.dispose();
      dotGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
