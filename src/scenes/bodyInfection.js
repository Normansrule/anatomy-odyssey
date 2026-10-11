// An infection fought by the whole body, staged on the left forearm and armpit
// for the immune dive's first step. Every cell and molecule is drawn hugely
// enlarged (a bacterium is about 2 µm long, an antibody about 10 nm), so the
// sequence can be followed on a body-sized model; the order of events and
// their timing follow OpenStax Anatomy and Physiology 21.2 to 21.4.
//
// Stages: a cut lets bacteria in → inflammation draws neutrophils out of the
// blood → dendritic cells carry pieces of the germ up a lymph vessel to the
// armpit nodes → the nodes swell as matching B and T cells multiply →
// antibodies reach the wound in the blood and the bacteria are cleared →
// the nodes shrink back and memory cells remain.
import * as THREE from 'three/webgpu';
import { pick, seeded, tubeThrough, ellipsoid, cylinderBetween, mergedMesh } from './kit.js';
import { stagedControls, ramp, clamp01 } from './stages.js';

export const INFECTION_STAGES = [
  { label: 'The cut', text: 'Minute 0: a cut on the forearm lets bacteria (green) in past the skin, the body’s first barrier.' },
  { label: 'Inflammation', text: 'Minutes to hours: the area turns red, warm and swollen as nearby vessels widen and leak. Neutrophils (white) squeeze out of the blood and start eating bacteria.' },
  { label: 'To the node', text: 'Days 1 to 2: dendritic cells (gold) pick up pieces of the bacteria and carry them up a lymph vessel to the lymph nodes in the armpit.' },
  { label: 'Nodes swell', text: 'Days 3 to 7: in the armpit nodes, the few B and T cells that recognize this germ multiply. The nodes swell; these are the “swollen glands” you can feel.' },
  { label: 'Antibodies', text: 'Days 7 to 14: plasma cells in the node pour out antibodies (yellow). They reach the wound in the blood, coat the bacteria and mark them for destruction.' },
  { label: 'Cleared', text: 'Weeks later: the bacteria are gone, the cut has healed and the nodes have shrunk back. Memory cells stay behind, ready if the same germ returns.' },
];

const COUNT = { bacteria: 36, neutrophils: 22, dendritic: 6, antibodies: 64, memory: 4 };

/** A point on route `pts` (an array of Vector3) a fraction t of the way along it. */
function curveOf(points) {
  return new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p))));
}

/** The skin vertex nearest `target` on the side facing `toward` from `axisPoint` (the wound's place on the skin). */
export function skinPointNear(skinPositions, target, axisPoint) {
  if (!skinPositions) return target.slice();
  let best = null;
  let bestD = Infinity;
  const out = [target[0] - axisPoint[0], target[1] - axisPoint[1], target[2] - axisPoint[2]];
  for (let i = 0; i < skinPositions.length; i += 3) {
    const x = skinPositions[i];
    const y = skinPositions[i + 1];
    const z = skinPositions[i + 2];
    // Only the surface on the wound's side of the bone.
    if ((x - axisPoint[0]) * out[0] + (y - axisPoint[1]) * out[1] + (z - axisPoint[2]) * out[2] <= 0) continue;
    const d = (x - target[0]) ** 2 + (y - target[1]) ** 2 + (z - target[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = [x, y, z];
    }
  }
  return best ?? target.slice();
}

/** A Y-shaped antibody, 1 unit tall, as one geometry. */
function antibodyGeometry() {
  const parts = [
    cylinderBetween([0, -0.5, 0], [0, 0, 0], 0.13, 0.13, null, 6),
    cylinderBetween([0, 0, 0], [-0.32, 0.45, 0], 0.13, 0.13, null, 6),
    cylinderBetween([0, 0, 0], [0.32, 0.45, 0], 0.13, 0.13, null, 6),
  ];
  return mergedMesh(parts, null).geometry;
}

/**
 * The infection, posed by the stage value v (0 to the last stage).
 * where: { wound, woundIn (a point just under the skin), artery (a point on the arm
 * artery near the wound), lymphRoute, bloodRoute (from the armpit node to the wound),
 * node (the armpit nodes' center), nodes (the armpit node meshes) }.
 */
export function buildInfection(M, where, { reducedMotion = false } = {}) {
  const group = new THREE.Group();
  group.name = 'infection';
  const rand = seeded(21);
  const wound = new THREE.Vector3(...where.wound);
  const inward = new THREE.Vector3(...where.woundIn).sub(wound).normalize();
  const node = new THREE.Vector3(...where.node);
  const around = (center, r) => {
    // A random point in a flattened ball under the skin around center.
    const p = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(r * Math.cbrt(rand()));
    return p.addScaledVector(inward, -p.dot(inward) * 0.6).add(center).addScaledVector(inward, r * 0.25);
  };

  // The cut and the inflamed patch around it.
  const cut = pick(ellipsoid(where.wound, [0.011, 0.0022, 0.0022], M(0x7a1622, { roughness: 0.5 }), 16), 'inflammation', 'The cut');
  cut.lookAt(wound.clone().add(inward));
  cut.rotateZ(0.4);
  group.add(cut);
  const redness = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    M(0xff3b3b, { transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.6, emissive: 0xff2020, emissiveIntensity: 0.5 }),
  );
  redness.position.copy(wound).addScaledVector(inward, 0.004);
  pick(redness, 'inflammation', 'Inflamed skin: red, warm and swollen');
  redness.userData.pickPriority = -1;
  group.add(redness);

  const instanced = (geometry, material, count, card, label) => {
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.frustumCulled = false;
    pick(mesh, card, label);
    group.add(mesh);
    return mesh;
  };
  const bacteria = instanced(new THREE.CapsuleGeometry(0.0011, 0.003, 3, 8), M(0x5fd068, { roughness: 0.45, emissive: 0x2a8a30, emissiveIntensity: 0.25 }), COUNT.bacteria, 'bacteria', 'Bacteria (enlarged about 2,500 times)');
  const neutrophils = instanced(new THREE.SphereGeometry(0.0026, 14, 10), M(0xf1ecf7, { roughness: 0.5, emissive: 0x8d7fb0, emissiveIntensity: 0.15 }), COUNT.neutrophils, 'neutrophil', 'Neutrophil (enlarged)');
  const dendritic = instanced(new THREE.IcosahedronGeometry(0.005, 0), M(0xf2b84b, { roughness: 0.4, emissive: 0xc07a10, emissiveIntensity: 0.3, flatShading: true }), COUNT.dendritic, 'dendritic-cell', 'Dendritic cell carrying pieces of the germ (enlarged)');
  const antibodies = instanced(antibodyGeometry(), M(0xffe066, { roughness: 0.35, emissive: 0xffc400, emissiveIntensity: 0.45 }), COUNT.antibodies, 'antibody', 'Antibody (enlarged about a million times)');
  const memory = instanced(new THREE.SphereGeometry(0.0024, 12, 8), M(0x9fb4e8, { roughness: 0.4, emissive: 0x5f7fd8, emissiveIntensity: 0.6 }), COUNT.memory, 'memory-b-cell', 'Memory cell');

  // The lymph vessel the dendritic cells travel up, and a glow over the working nodes.
  const lymphCurve = curveOf(where.lymphRoute);
  const lymph = pick(tubeThrough(where.lymphRoute, 0.0022, M(0x7cc49a, { transparent: true, opacity: 0.7, roughness: 0.5 }), 64, 6), 'lymphatic-vessel', 'Lymph vessel from the forearm to the armpit');
  group.add(lymph);
  const nodeGlow = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), M(0x7cc49a, { transparent: true, opacity: 0.3, depthWrite: false, emissive: 0x7cc49a, emissiveIntensity: 0.8 }));
  nodeGlow.position.copy(node);
  nodeGlow.raycast = () => {};
  group.add(nodeGlow);

  const bloodCurve = curveOf(where.bloodRoute);
  const artery = new THREE.Vector3(...where.artery);

  // Fixed per-cell choices.
  const bugs = Array.from({ length: COUNT.bacteria }, () => ({ at: around(wound, 0.012), spin: new THREE.Quaternion().random() }));
  const eaters = Array.from({ length: COUNT.neutrophils }, (_, i) => ({ from: artery.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.01)), to: around(wound, 0.014), delay: i / COUNT.neutrophils }));
  const carriers = Array.from({ length: COUNT.dendritic }, (_, i) => ({ delay: i / COUNT.dendritic, spin: new THREE.Quaternion().random(), rest: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.012) }));
  const abs = Array.from({ length: COUNT.antibodies }, (_, i) => ({ phase: i / COUNT.antibodies, off: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.006), spin: new THREE.Quaternion().random(), on: bugs[i % bugs.length] }));
  const memories = Array.from({ length: COUNT.memory }, () => node.clone().add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.014)));
  const nodeScale = where.nodes.map((n) => n.scale.clone());

  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const none = new THREE.Vector3(0, 0, 0);
  const still = new THREE.Quaternion();

  /** Pose everything for stage value v. Returns the counts on view (for tests). */
  function apply(v) {
    // Stage k plays out between v = k and k + 1; the last stage is the end state at v = 5.
    const inflamed = ramp(v, 0.5, 1.3) * (1 - ramp(v, 4.3, 4.95));
    const alive = (0.55 + 0.45 * ramp(v, 0, 0.9)) * (1 - ramp(v, 4.35, 4.8));
    const swell = ramp(v, 3, 3.7) * (1 - ramp(v, 4.5, 4.95) * 0.75);

    cut.scale.setScalar(1 - ramp(v, 4.5, 4.95) * 0.999);
    cut.visible = v < 4.95;
    redness.scale.setScalar(0.012 + 0.012 * inflamed);
    redness.visible = inflamed > 0.02;

    const shown = { bacteria: 0, neutrophils: 0, dendritic: 0, antibodies: 0, memory: 0 };
    bugs.forEach((b, i) => {
      const on = i < Math.round(alive * COUNT.bacteria);
      if (on) shown.bacteria++;
      bacteria.setMatrixAt(i, m.compose(b.at, b.spin, on ? one : none));
    });
    eaters.forEach((e, i) => {
      const t = ramp(v, 1 + e.delay * 0.4, 1.6 + e.delay * 0.4);
      const on = t > 0 && inflamed > 0.05;
      if (on) shown.neutrophils++;
      p.lerpVectors(e.from, e.to, t);
      neutrophils.setMatrixAt(i, m.compose(p, still, on ? one.clone().multiplyScalar(0.4 + 0.6 * inflamed) : none));
    });
    carriers.forEach((c, i) => {
      const t = ramp(v, 2 + c.delay * 0.3, 2.7 + c.delay * 0.3);
      const on = t > 0 && v < 3.8;
      if (on) shown.dendritic++;
      lymphCurve.getPointAt(clamp01(t), p);
      if (t >= 1) p.add(c.rest);
      dendritic.setMatrixAt(i, m.compose(p, c.spin, on ? one : none));
    });
    const stream = ramp(v, 3.9, 4.1) * (1 - ramp(v, 4.75, 4.95));
    abs.forEach((a, i) => {
      // Antibodies stream from the node down the arm in the blood, then gather on the bacteria.
      const u = (v * 1.6 + a.phase) % 1;
      const arrived = v > 4.25 && i % 2 === 0;
      const on = stream > 0.02 && (arrived ? a.on && alive > 0.02 : true);
      if (on) shown.antibodies++;
      if (arrived) p.copy(a.on.at).add(a.off.clone().multiplyScalar(0.5));
      else bloodCurve.getPointAt(u, p).add(a.off);
      antibodies.setMatrixAt(i, m.compose(p, a.spin, on ? one.clone().multiplyScalar(0.011 * stream) : none));
    });
    memories.forEach((q, i) => {
      const on = v > 4.7;
      if (on) shown.memory++;
      memory.setMatrixAt(i, m.compose(q, still, on ? one.clone().multiplyScalar(ramp(v, 4.7, 4.95)) : none));
    });
    for (const mesh of [bacteria, neutrophils, dendritic, antibodies, memory]) mesh.instanceMatrix.needsUpdate = true;

    where.nodes.forEach((n, i) => n.scale.copy(nodeScale[i]).multiplyScalar(1 + 0.75 * swell));
    nodeGlow.scale.setScalar(0.03 * (0.6 + swell));
    nodeGlow.visible = swell > 0.05;
    lymph.material.opacity = 0.35 + 0.45 * ramp(v, 1.8, 2.2) * (1 - ramp(v, 3.5, 4));
    return shown;
  }

  let shown = null;
  const staged = stagedControls({
    stages: INFECTION_STAGES,
    label: 'Infection',
    apply: (v) => (shown = apply(v)),
    reducedMotion,
    still: 4.5, // antibodies arriving at the wound
    rate: 0.22,
  });

  return {
    group,
    controls: staged.controls,
    update: staged.update,
    /** What is on view at the current stage (for tests). */
    shown: () => shown,
  };
}
