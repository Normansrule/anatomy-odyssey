// Tier 1 (whole body) and tier 2 (skeleton) scenes: 1 scene unit = 1 m,
// standing on y = 0 and facing +z, the body's left toward +x.
//
// The organs, bones, muscles and skin are real shapes measured from one adult
// male body (BodyParts3D, see bodyMeshes.js). Structures that atlas does not
// segment (nerves, the limb vessels, lymph nodes, the thyroid, the inner ear)
// are drawn here, routed along landmarks measured from the same meshes
// (src/data/bodyLandmarks.json). Until the anatomy bundle has loaded, the
// simplified figure from bodySimple.js stands in.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, tubeThrough, ellipsoid, disposeTree, softShadowTexture } from './kit.js';
import { bodyParts } from './bodyMeshes.js';
import { buildSimpleSystems, SIMPLE_FIGURE } from './bodySimple.js';
import { buildBloodFlow } from './bloodFlow.js';
import { buildInfection, skinPointNear } from './bodyInfection.js';
import LANDMARKS from '../data/bodyLandmarks.json';

export const SYSTEMS = [
  { id: 'skin', label: 'Skin', card: 'skin' },
  { id: 'skeletal', label: 'Skeletal', card: 'skeletal-system' },
  { id: 'muscular', label: 'Muscular', card: 'muscular-system' },
  { id: 'circulatory', label: 'Circulatory', card: 'circulatory-system' },
  { id: 'nervous', label: 'Nervous', card: 'nervous-system' },
  { id: 'respiratory', label: 'Respiratory', card: 'respiratory-system' },
  { id: 'immune', label: 'Immune', card: 'immune-system' },
  { id: 'digestive', label: 'Digestive', card: 'digestive-system' },
  { id: 'urinary', label: 'Urinary', card: 'urinary-system' },
  { id: 'endocrine', label: 'Endocrine', card: 'endocrine-system' },
];

export const DEFAULT_SYSTEMS = ['skin', 'skeletal', 'circulatory', 'nervous', 'respiratory', 'immune'];

/**
 * Taken apart, the systems stand in a row like a set of anatomy plates, from the outside in:
 * skin, muscle, bone, then the systems they hold. Each stands this far (meters) from the next.
 */
export const APART_ORDER = ['skin', 'muscular', 'skeletal', 'nervous', 'circulatory', 'respiratory', 'digestive', 'urinary', 'endocrine', 'immune'];
export const APART_SPACING = 0.54;
/** How far (meters) a system rises off the floor while the pointer is on it, and how briskly. */
export const APART_LIFT = 0.06;
/** How opaque the skin becomes standing alone in the row. */
export const SKIN_ALONE = 0.94;
/** Nerves on the whole body take the atlas's yellow. */
export const ATLAS_NERVE = 0xe0b83a;
const SKIN_TONE = 0xcfb29f;
export const LIFT_SPRING = { stiffness: 160, damping: 20 };

/** Where each shown system stands when taken apart: x offsets, centred on the body's own place. */
export function apartSlots(shown) {
  const row = APART_ORDER.filter((id) => shown.includes(id));
  return Object.fromEntries(row.map((id, i) => [id, (i - (row.length - 1) / 2) * APART_SPACING]));
}

/**
 * One step of a damped spring toward `to` (each system springs to its place a beat after the
 * one before, like the parts of an exploded drawing). Slightly underdamped, so it settles with
 * a small overshoot; returns the new [x, v].
 */
export function springStep(x, v, to, dt, { stiffness = 70, damping = 13 } = {}) {
  const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
  const h = dt / steps;
  for (let i = 0; i < steps; i++) {
    v += (stiffness * (to - x) - damping * v) * h;
    x += v * h;
  }
  return [x, v];
}

export { LANDMARKS };
/** Eye centres, in their sockets. */
export const EYES = LANDMARKS.eyes;
/** The olfactory patch, in the roof of the nasal cavity between the eyes. */
export const NOSE = LANDMARKS.nose;
/** Inner ears: deep in the temporal bones, level with the ear canals. */
export const INNER_EARS = LANDMARKS.innerEars;
/** Thyroid lobes on either side of the windpipe, below the voice box. */
export const THYROID = LANDMARKS.thyroid;
/** Kidney centres: beside the spine, the left one a little higher (the liver sits above the right). */
export const KIDNEYS = LANDMARKS.kidneys;

const SIDES = [-1, 1];
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const add = (a, d) => a.map((x, i) => x + d[i]);

// ── Materials for the measured parts, by tissue ─────────────────────────
const SEE_THROUGH = { transparent: true, opacity: 0.5 };
const CARTILAGE_LIFE = 0xe2e0d2;
function materialFor(M, extras, { skeletonOnly, shaded }) {
  const { tissue, natural, card, side } = extras;
  // Parts with baked shade (the bones) multiply their color by it.
  const shade = shaded ? { vertexColors: true } : {};
  switch (tissue) {
    case 'skin':
      return M(COLORS.skin, { transparent: true, opacity: 0.2, depthWrite: false, roughness: 0.42, tissue: 'skin', repeat: [1, 1] });
    case 'bone':
      if (skeletonOnly && card === 'femur' && side === 'left') return M(COLORS.bone, { roughness: 0.45, emissive: COLORS.eosin, emissiveIntensity: 0.55, tissue: 'bone', repeat: [1, 1], ...shade });
      return M(skeletonOnly ? COLORS.boneShade : COLORS.bone, { roughness: 0.55, tissue: 'bone', repeat: [1, 1], ...shade });
    case 'enamel':
      return M(0xf6f1e6, { roughness: 0.22, ...shade });
    case 'cartilage':
      // Rib and joint cartilage in life is a pearly gray-white, not the diagram blue.
      return M(COLORS.cartilage, { roughness: 0.35, tissue: 'cartilage', natural: CARTILAGE_LIFE, repeat: [1, 1], ...shade });
    case 'muscle':
      return M(COLORS.muscle, { roughness: 0.5, tissue: 'muscle', repeat: [1, 1] });
    case 'tendon':
      return M(0xefe6d6, { roughness: 0.35, tissue: 'tendon', repeat: [1, 1] });
    case 'myocardium':
      return M(COLORS.artery, { roughness: 0.4, tissue: 'myocardium', repeat: [1, 1] });
    // The vessels are see-through, so the blood moving inside them shows (bloodFlow.js).
    case 'vessel':
      return M(COLORS.artery, { roughness: 0.4, tissue: 'vessel', repeat: [1, 1], ...SEE_THROUGH });
    case 'vein':
      return M(COLORS.vein, { roughness: 0.4, tissue: 'vein', repeat: [1, 1], ...SEE_THROUGH });
    case 'lung':
      return M(COLORS.lung, { roughness: 0.7, transparent: true, opacity: 0.82, tissue: 'lung', repeat: [1, 1] });
    case 'brain':
      return M(0xf0d68a, { roughness: 0.6, tissue: 'brain', repeat: [1, 1] });
    case 'sclera':
      return M(0xf2eee6, { roughness: 0.25 });
    case 'nerve':
      return M(COLORS.nerve, { roughness: 0.45, emissive: COLORS.nerve, emissiveIntensity: 0.12, tissue: 'nerve', repeat: [1, 1] });
    default:
      return M(natural ?? 0xd99088, { roughness: 0.42, tissue: 'organ', natural, repeat: [1, 1] });
  }
}

/** The measured parts, one mesh each, sorted into system groups. */
function measuredSystems(M, parts, opts) {
  const groups = Object.fromEntries(SYSTEMS.map((s) => [s.id, new THREE.Group()]));
  for (const { geometry, extras } of parts) {
    const mesh = new THREE.Mesh(geometry, materialFor(M, extras, { ...opts, shaded: Boolean(geometry.attributes.color) }));
    pick(mesh, extras.card, extras.label);
    // The skin never blocks a click on what is inside it.
    if (extras.tissue === 'skin' && extras.card === 'skin') mesh.userData.pickPriority = -1;
    if (extras.tissue === 'skin') mesh.renderOrder = 2; // drawn after what it covers
    mesh.userData.fma = extras.fma;
    groups[extras.system]?.add(mesh);
  }
  return groups;
}

// ── Structures the atlas does not segment, routed along its landmarks ──
const L = LANDMARKS;
const bone = (name) => L.bones[name];
/** A point a fraction t down a long bone (0 = top), nudged by [dx, dy, dz]; dx points away from the midline. */
function along(name, t, [dx, dy, dz] = [0, 0, 0]) {
  const [a, b] = bone(name);
  const p = lerp(a, b, t);
  const s = Math.sign(p[0]) || 1;
  return [p[0] + s * dx, p[1] + dy, p[2] + dz];
}

function buildNerves(M) {
  const g = new THREE.Group();
  // In life a nerve is a creamy white cord, nearly the color of bone; atlases print nerves yellow so
  // they stand out from the bones and vessels beside them, and so does the whole-body plate.
  const n = M(COLORS.nerve, { roughness: 0.45, emissive: COLORS.nerve, emissiveIntensity: 0.22, tissue: 'nerve', natural: ATLAS_NERVE });
  const nerve = (pts, r, card, label) => g.add(pick(tubeThrough(pts, r, n, 64, 8), card, label));
  const spine = L.spine; // atlas, T3, T8, L1, L5, sacrum (vertebra centres)
  // The cord runs in the canal behind the vertebral bodies and ends near L1; below it, the nerve roots (cauda equina).
  const canal = (p, dy = 0) => [p[0], p[1] + dy, p[2] - 0.004];
  nerve([[0, spine[0][1] + 0.035, spine[0][2] + 0.004], canal(spine[0]), canal(spine[1]), canal(spine[2]), canal(spine[3])], 0.0055, 'spinal-cord', 'Spinal cord');
  nerve([canal(spine[3]), canal(spine[4]), canal(spine[5], 0.02)], 0.003, 'spinal-cord', 'Nerve roots below the cord (cauda equina)');
  // The vagus nerve (cranial nerve X), each side: from the brainstem out through the skull's base,
  // down the neck in the sheath beside the carotid artery, behind the heart along the gullet, and
  // through the diaphragm to the stomach.
  for (const s of [1, -1]) {
    nerve([
      [s * 0.01, spine[0][1] + 0.02, spine[0][2] + 0.006],
      [s * 0.024, spine[0][1] - 0.01, spine[0][2] + 0.012],
      [s * 0.028, THYROID.center[1] + 0.02, THYROID.center[2] - 0.016],
      [s * 0.024, THYROID.center[1] - 0.035, THYROID.center[2] - 0.018],
      [s * 0.014, spine[2][1] + 0.04, spine[2][2] + 0.036],
      [s * 0.012, spine[3][1] + 0.05, spine[3][2] + 0.034],
      [s * 0.02 + 0.018, spine[3][1] + 0.01, spine[3][2] + 0.05],
    ], 0.0018, 'vagus-nerve', s > 0 ? 'Left vagus nerve' : 'Right vagus nerve');
  }
  for (const side of ['left', 'right']) {
    const s = side === 'left' ? 1 : -1;
    const femur = `${side} femur`;
    const tibia = `${side} tibia`;
    const humerus = `${side} humerus`;
    const radius = `${side} radius`;
    // Leg. The sciatic nerve leaves the pelvis behind the hip, runs down the back of the thigh and
    // splits above the knee: the tibial nerve goes on behind the knee and the shin to the sole, and
    // the common fibular nerve winds round the neck of the fibula to the front of the leg.
    const split = along(femur, 0.84, [0, 0, -0.034]);
    nerve([[s * 0.03, spine[5][1] + 0.01, spine[5][2] - 0.005], along(femur, 0.08, [-0.01, 0, -0.05]), along(femur, 0.5, [0, 0, -0.036]), split], 0.0045, 'sciatic-nerve', 'Sciatic nerve (the longest nerve)');
    nerve([split, along(femur, 0.97, [-0.004, 0, -0.036]), along(tibia, 0.5, [0, 0, -0.034]), along(tibia, 0.97, [-0.022, 0, -0.02])], 0.0032, 'sciatic-nerve', 'Tibial nerve');
    nerve([split, along(femur, 0.97, [0.024, 0, -0.03]), along(tibia, 0.1, [0.04, 0, -0.006]), along(tibia, 0.22, [0.034, 0, 0.02]), along(tibia, 0.6, [0.02, 0, 0.03]), along(tibia, 0.98, [0.008, 0, 0.034])], 0.0024, 'sciatic-nerve', 'Common fibular nerve');
    // The femoral nerve comes down beside the psoas, under the groin crease just outside the femoral
    // artery, into the front of the thigh; its saphenous branch carries on down the inside of the leg.
    nerve([
      [s * 0.045, spine[4][1], spine[4][2] + 0.01],
      add(L.vessels.externalIliacArtery[side], [s * 0.014, -0.012, 0.004]),
      along(femur, 0.18, [-0.012, -0.01, 0.046]),
      along(femur, 0.45, [-0.022, 0, 0.04]),
      along(femur, 0.95, [-0.042, 0, -0.004]),
      along(tibia, 0.5, [-0.034, 0, 0.002]),
      along(tibia, 0.98, [-0.03, 0, 0.012]),
    ], 0.003, 'femoral-nerve', 'Femoral nerve and its saphenous branch');
    // Arm. The brachial plexus gathers the roots C5 to T1 in the neck, passes over the first rib
    // behind the collarbone and splits in the armpit into the arm's nerves.
    const armpit = along(humerus, 0.1, [-0.026, 0, 0.008]);
    nerve([[s * 0.03, spine[0][1] - 0.06, spine[0][2]], add(L.vessels.subclavianArtery[side], [s * 0.01, 0.006, -0.012]), armpit], 0.0042, 'brachial-plexus', 'Brachial plexus');
    // Median: down the inside of the arm beside the artery, through the crook of the elbow and the
    // middle of the forearm, into the palm through the carpal tunnel.
    nerve([armpit, along(humerus, 0.5, [-0.02, 0, 0.018]), along(humerus, 0.95, [-0.008, 0, 0.026]), along(radius, 0.5, [-0.016, 0, 0.012]), along(radius, 1, [-0.016, -0.026, 0.014])], 0.0028, 'median-nerve', 'Median nerve');
    // Ulnar: down the inside of the arm, behind the inner knob of the elbow (the funny bone), and
    // along the little-finger side of the forearm.
    nerve([armpit, along(humerus, 0.5, [-0.028, 0, -0.004]), along(humerus, 1, [-0.04, 0, -0.018]), along(radius, 0.5, [-0.035, 0, 0]), along(radius, 1, [-0.034, -0.022, 0.006])], 0.0024, 'ulnar-nerve', 'Ulnar nerve');
    // Radial: round the back of the humerus in its spiral groove, out to the outer side of the elbow
    // and down the thumb side of the forearm.
    nerve([armpit, along(humerus, 0.3, [-0.006, 0, -0.026]), along(humerus, 0.55, [0.012, 0, -0.022]), along(humerus, 0.85, [0.02, 0, 0.004]), along(humerus, 1, [0.014, 0, 0.016]), along(radius, 0.4, [0.01, 0, 0.008]), along(radius, 0.95, [0.008, -0.01, 0.006])], 0.0024, 'radial-nerve', 'Radial nerve');
  }
  // Smell: the olfactory patch in the roof of the nasal cavity, and the bulbs above it.
  g.add(pick(ellipsoid([0, NOSE.y, NOSE.z], [0.008, 0.0035, 0.011], M(0xe8c45a, { roughness: 0.45 }), 14), 'nasal-cavity', 'Roof of the nasal cavity (olfactory epithelium)'));
  for (const x of [-0.006, 0.006]) g.add(pick(ellipsoid([x, NOSE.y + 0.0072, NOSE.z - 0.002], [0.0025, 0.0018, 0.008], M(0xf0d050, { roughness: 0.45 }), 10), 'olfactory-bulb', 'Olfactory bulb'));
  // Inner ears, with their nerves to the brainstem.
  for (const x of INNER_EARS.x) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.0035, 0.0014, 8, 20), M(0xf2e4c0, { roughness: 0.4 }));
    coil.position.set(x, INNER_EARS.y, INNER_EARS.z);
    coil.rotation.y = Math.PI / 2;
    g.add(pick(coil, 'ear', 'Inner ear (cochlea)'));
    nerve([[x, INNER_EARS.y, INNER_EARS.z], [x * 0.5, INNER_EARS.y - 0.004, INNER_EARS.z - 0.008], [0, INNER_EARS.y - 0.014, INNER_EARS.z - 0.014]], 0.0012, 'vestibulocochlear-nerve', 'Vestibulocochlear nerve');
  }
  // The iris and pupil, a domed disc just proud of the front of each eye.
  for (const x of EYES.x) g.add(pick(ellipsoid([x, EYES.y, EYES.front - 0.0013], [0.0058, 0.0058, 0.0016], M(0x3f5f80, { roughness: 0.2 }), 18), 'eye', 'Iris and pupil'));
  return g;
}

/** The limb vessels, and the routes blood takes through them (for bloodFlow.js). */
function buildLimbVessels(M) {
  const g = new THREE.Group();
  const routes = [];
  const art = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel', ...SEE_THROUGH });
  const vein = M(COLORS.vein, { roughness: 0.4, tissue: 'vein', ...SEE_THROUGH });
  // Every route below starts at the trunk: blood runs down an artery and back up a vein.
  const vessel = (pts, r, material, label) => {
    g.add(pick(tubeThrough(pts, r, material, 64, 8), 'limb-vessels', label));
    const kind = material === art ? 'artery' : 'vein';
    routes.push({ kind, points: kind === 'artery' ? pts : [...pts].reverse(), radius: r });
  };
  for (const side of ['left', 'right']) {
    const s = side === 'left' ? 1 : -1;
    const femur = `${side} femur`;
    const tibia = `${side} tibia`;
    const humerus = `${side} humerus`;
    const radius = `${side} radius`;
    // Leg: from the groin down the front of the thigh, behind the knee, and down the leg.
    const legPath = (start, inset) => [
      start,
      along(femur, 0.18, [-0.03 - inset, -0.01, 0.035]),
      along(femur, 0.6, [-0.022 - inset, 0, 0.012]),
      along(femur, 0.97, [-0.004 - inset, 0, -0.028]),
      along(tibia, 0.45, [0.004 - inset, 0, -0.022]),
      along(tibia, 0.98, [0.006 - inset, 0, 0.012]),
    ];
    vessel(legPath(L.vessels.externalIliacArtery[side], 0), 0.0045, art, 'Femoral artery');
    vessel(legPath(L.vessels.externalIliacVein[side], 0.009), 0.0052, vein, 'Femoral vein');
    // Arm: from the end of the subclavian vessels down the inside of the arm to the wrist.
    const armPath = (start, inset) => [
      start,
      along(humerus, 0.15, [-0.02 - inset, 0, 0.004]),
      along(humerus, 0.92, [-0.012 - inset, 0, 0.022]),
      along(radius, 0.5, [-0.002 - inset, 0, 0.014]),
      along(radius, 1, [-0.002 - inset, -0.02, 0.012]),
    ];
    vessel(armPath(L.vessels.subclavianArtery[side], 0), 0.0035, art, 'Arm artery (brachial and radial)');
    vessel(armPath(L.vessels.subclavianVein[side], 0.008), 0.0038, vein, 'Arm vein');
  }
  return { group: g, routes };
}

function buildLymphatics(M) {
  const g = new THREE.Group();
  const node = M(COLORS.lymph, { roughness: 0.4, emissive: COLORS.lymph, emissiveIntensity: 0.15 });
  const duct = M(COLORS.lymph, { roughness: 0.5, transparent: true, opacity: 0.75 });
  const addNode = (mesh, label) => g.add(pick(mesh, 'immune-system', label));
  const spine = L.spine;
  const front = (p, dz) => [p[0], p[1], p[2] + dz];
  const clusters = [];
  for (const side of ['left', 'right']) {
    const s = side === 'left' ? 1 : -1;
    const top = bone(`${side} humerus`)[0];
    clusters.push(['Lymph node (neck)', [s * 0.042, THYROID.center[1] + 0.03, THYROID.center[2] - 0.022]]);
    clusters.push(['Lymph node (armpit)', [top[0] - s * 0.05, top[1] - 0.05, top[2] - 0.004]]);
    clusters.push(['Lymph node (groin)', add(L.vessels.externalIliacArtery[side], [s * 0.012, -0.02, 0.006])]);
    clusters.push(['Lymph node (beside the aorta)', [s * 0.026, spine[3][1] - 0.02, spine[3][2] + 0.036]]);
  }
  for (const [label, [x, y, z]] of clusters) {
    const s = Math.sign(x);
    for (let i = 0; i < 3; i++) addNode(ellipsoid([x + s * i * 0.007, y - i * 0.013, z + (i % 2) * 0.008], [0.0075, 0.0065, 0.0065], node, 12), label);
  }
  // The thoracic duct climbs in front of the spine and empties into the veins at the base of the left side of the neck.
  const junction = add(L.vessels.subclavianVein.left, [-0.035, 0.012, -0.01]);
  g.add(pick(tubeThrough([front(spine[3], 0.03), front(spine[2], 0.03), front(spine[1], 0.03), [0.02, spine[0][1] - 0.07, spine[0][2] + 0.02], junction], 0.0024, duct, 48, 6), 'lymphatic-vessel', 'Thoracic duct'));
  for (const side of ['left', 'right']) {
    const s = side === 'left' ? 1 : -1;
    g.add(pick(tubeThrough([add(L.vessels.externalIliacArtery[side], [s * 0.012, -0.02, 0.006]), [s * 0.035, spine[4][1], spine[4][2] + 0.04], front(spine[3], 0.03)], 0.002, duct, 24, 6), 'lymphatic-vessel', 'Lymphatic vessel'));
  }
  return g;
}

function buildThyroid(M) {
  const g = new THREE.Group();
  const thyroidMat = M(0xb8534e, { roughness: 0.45, tissue: 'organ', natural: 0xa94a46 });
  const [cx, cy, cz] = THYROID.center;
  for (const s of SIDES) {
    const lobe = ellipsoid([cx + s * THYROID.lobeX, cy, cz - 0.004], [0.009, 0.024, 0.01], thyroidMat, 24);
    lobe.rotation.z = -s * 0.12; // lower poles splay slightly outward
    g.add(pick(lobe, 'thyroid-gland', 'Thyroid gland (one lobe)'));
    for (const dy of [0.011, -0.012]) {
      g.add(pick(ellipsoid([cx + s * (THYROID.lobeX + 0.002), cy + dy, cz - 0.014], [0.0028, 0.0034, 0.0022], M(0xd9a35a, { roughness: 0.5 }), 10), 'parathyroid-gland', 'Parathyroid gland (on the back of the thyroid)'));
    }
  }
  const isthmus = new THREE.Mesh(new THREE.CapsuleGeometry(0.0045, 0.022, 6, 12), thyroidMat);
  isthmus.rotation.z = Math.PI / 2;
  isthmus.position.set(cx, cy - 0.01, cz + 0.004);
  g.add(pick(isthmus, 'thyroid-gland', 'Isthmus of the thyroid (crosses the windpipe)'));
  return g;
}

// ── The heartbeat ──────────────────────────────────────────────────────
const BEATS_PER_SECOND = 72 / 60;
/** Heart size through one beat (phase 0–1): the ventricles squeeze, then refill. */
export function heartbeatScale(phase) {
  const squeeze = Math.exp(-(((phase - 0.18) / 0.07) ** 2)); // ventricles contract
  const atria = Math.exp(-(((phase - 0.02) / 0.04) ** 2)) * 0.35; // atria contract just before
  return 1 - 0.045 * squeeze - 0.012 * atria;
}

/** Where the immune dive's infection happens: a cut on the left forearm, drained by the left armpit nodes. */
function infectionSite(parts, immune) {
  const [top, bottom] = bone('left radius');
  const axisPoint = lerp(top, bottom, 0.62);
  const skin = parts.find((p) => p.extras.tissue === 'skin' && p.extras.card === 'skin');
  const wound = skinPointNear(skin?.geometry.attributes.position.array, add(axisPoint, [0, 0, 0.05]), axisPoint);
  const toAxis = axisPoint.map((x, i) => x - wound[i]);
  const len = Math.hypot(...toAxis) || 1;
  const woundIn = wound.map((x, i) => x + (toAxis[i] / len) * 0.004);
  const nodes = [];
  immune.traverse((o) => o.isMesh && o.userData.label === 'Lymph node (armpit)' && o.position.x > 0 && nodes.push(o));
  const node = nodes.length ? [0, 1, 2].map((k) => nodes.reduce((t, n) => t + n.position.getComponent(k), 0) / nodes.length) : L.vessels.subclavianVein.left;
  const artery = along('left radius', 0.5, [-0.002, 0, 0.014]);
  return {
    wound,
    woundIn,
    artery,
    node,
    nodes,
    lymphRoute: [wound, along('left radius', 0.35, [-0.012, 0, 0.012]), along('left humerus', 0.95, [-0.022, 0, 0.018]), along('left humerus', 0.55, [-0.028, 0, 0.006]), along('left humerus', 0.2, [-0.035, -0.01, 0]), node],
    bloodRoute: [node, L.vessels.subclavianArtery.left, along('left humerus', 0.15, [-0.02, 0, 0.004]), along('left humerus', 0.92, [-0.012, 0, 0.022]), artery, wound],
  };
}

function build({ mode = 'body', systems = DEFAULT_SYSTEMS, reducedMotion = false, infection: withInfection = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const skeletonOnly = mode === 'skeleton';
  const parts = bodyParts();
  let groups;
  let heart = null;
  let flow = null;
  let infection = null;
  let site = null;
  if (parts) {
    groups = measuredSystems(M, parts, { skeletonOnly });
    groups.nervous.add(buildNerves(M));
    const limbs = buildLimbVessels(M);
    groups.circulatory.add(limbs.group);
    if (!skeletonOnly) {
      flow = buildBloodFlow(M, [...L.flow, ...limbs.routes]);
      groups.circulatory.add(flow.group);
    }
    groups.immune.add(buildLymphatics(M));
    if (withInfection && !skeletonOnly) {
      site = infectionSite(parts, groups.immune);
      infection = buildInfection(M, site, { reducedMotion });
      groups.immune.add(infection.group);
    }
    groups.endocrine.add(buildThyroid(M));
    // The heart and its own vessels beat together, scaled about the heart's centre.
    const beating = groups.circulatory.children.filter((m) => ['heart', 'heart-valves', 'coronary-arteries'].includes(m.userData.cardId));
    if (beating.length) {
      heart = new THREE.Group();
      heart.position.set(...L.heart);
      for (const m of beating) {
        m.position.sub(heart.position);
        heart.add(m);
      }
      groups.circulatory.add(heart);
    }
  } else {
    groups = buildSimpleSystems(M, { skeletonOnly });
  }
  for (const [id, grp] of Object.entries(groups)) {
    grp.name = id;
    grp.visible = skeletonOnly ? id === 'skeletal' : systems.includes(id);
    root.add(grp);
  }

  // Taking the body apart: each system's group springs sideways to its place in the row, with
  // its own shadow under its feet that fades in as the shared one fades out.
  let apart = false;
  let shown = skeletonOnly ? ['skeletal'] : [...systems];
  const springs = Object.fromEntries(Object.keys(groups).map((id) => [id, { x: 0, v: 0, delay: 0, y: 0, vy: 0 }]));
  // Standing alone, the skin has nothing inside it to show through, so it fills in
  // to a solid figure, as an atlas draws the surface plate.
  const skinFades = [];
  groups.skin?.traverse((o) => {
    if (o.isMesh && o.material?.transparent && o.material.opacity < 0.6) skinFades.push({ mat: o.material, base: o.material.opacity, map: o.material.map, color: o.material.color.clone() });
  });
  let lifted = null; // the system the pointer is on, raised off the floor like a plate picked up
  const shadows = {};
  for (const [id, grp] of Object.entries(groups)) {
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.45), M.basic(0x07051a, { map: softShadowTexture(), transparent: true, opacity: 0, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.002;
    shadow.raycast = () => {}; // a shadow is never picked
    grp.add(shadow);
    shadows[id] = shadow;
  }
  const targets = () => (apart ? apartSlots(shown) : {});
  function place(stagger) {
    const to = targets();
    // Outermost first going apart, innermost first coming back together.
    const row = APART_ORDER.filter((id) => shown.includes(id));
    for (const [id, sp] of Object.entries(springs)) {
      sp.to = to[id] ?? 0;
      const i = row.indexOf(id);
      sp.delay = stagger && i >= 0 ? (apart ? i : row.length - 1 - i) * 0.07 : 0;
    }
  }
  function settle() {
    for (const [id, sp] of Object.entries(springs)) {
      sp.x = sp.to ?? 0;
      sp.v = 0;
      sp.delay = 0;
      groups[id].position.x = sp.x;
    }
  }
  const liftOf = (id) => (apart && id === lifted ? APART_LIFT : 0);
  const spread = () => {
    const xs = Object.values(springs).map((sp) => Math.abs(sp.x));
    return Math.min(1, Math.max(0, ...xs) / APART_SPACING);
  };

  // A soft contact shadow so the figure stands on something.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), M.basic(0x07051a, { map: softShadowTexture(), transparent: true, opacity: 0.75, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  root.add(floor);

  const height = parts ? L.height : SIMPLE_FIGURE.height;
  // Focus: the left femur (viewer's right), which the skeletal dive enters next.
  const femurCenter = parts ? lerp(...bone('left femur'), 0.5) : SIMPLE_FIGURE.femurCenter;
  let beat = 0;

  return {
    root,
    metersPerUnit: 1,
    detailed: !!parts,
    view: skeletonOnly
      ? { target: [0.03, height / 2, 0], direction: [0.42, 0.12, 1] } // whole skeleton, head to feet
      : site
        ? { target: lerp(site.wound, site.node, 0.5), direction: [0.45, 0.05, 1] } // the left arm, from the cut to the armpit
        : { target: [0, height / 2, 0], direction: [0.28, 0.08, 1] },
    focus: site ? site.wound : femurCenter,
    controls: infection?.controls,
    infection,
    setSystems(list) {
      if (skeletonOnly) return;
      shown = [...list];
      for (const [id, grp] of Object.entries(groups)) grp.visible = list.includes(id);
      place(false);
    },
    /** Take the systems apart into a row (true) or put them back together (false). */
    setApart(on, { instant = false } = {}) {
      if (skeletonOnly) return;
      apart = on;
      if (!on) lifted = null;
      place(true);
      if (instant) settle();
    },
    get apart() {
      return apart;
    },
    /** How wide the row is when apart, in meters, for framing it. */
    apartWidth() {
      const n = Object.keys(apartSlots(shown)).length;
      return apart ? (n - 1) * APART_SPACING + 0.7 : 0.7;
    },
    /** True while any system is still springing to its place. */
    moving() {
      return Object.values(springs).some((sp) => sp.delay > 0 || Math.abs(sp.x - (sp.to ?? 0)) > 0.0005 || Math.abs(sp.v) > 0.002);
    },
    settle,
    /** Which system a picked mesh belongs to (null for none). */
    systemOf(object) {
      let o = object;
      while (o && o.parent !== root) o = o.parent;
      return o && groups[o.name] === o ? o.name : null;
    },
    /** Raise one system off the floor while the body is apart (null lowers it again). */
    lift(id) {
      lifted = apart ? id : null;
    },
    get lifted() {
      return lifted;
    },
    /** Each system standing in the row, and the point under its feet, for its caption. */
    layers() {
      if (!apart) return [];
      return Object.entries(apartSlots(shown)).map(([id, x]) => {
        const sys = SYSTEMS.find((s) => s.id === id);
        return { id, label: sys?.label ?? id, card: sys?.card ?? null, at: [x, 0, 0.18] };
      });
    },
    update(dt, { reducedMotion: still = reducedMotion } = {}) {
      for (const [id, sp] of Object.entries(springs)) {
        if (sp.delay > 0) {
          sp.delay = Math.max(0, sp.delay - dt);
          continue;
        }
        if (still) {
          sp.x = sp.to ?? 0;
          sp.v = 0;
        } else [sp.x, sp.v] = springStep(sp.x, sp.v, sp.to ?? 0, Math.min(dt, 0.05));
        groups[id].position.x = sp.x;
      }
      for (const [id, sp] of Object.entries(springs)) {
        if (still) [sp.y, sp.vy] = [liftOf(id), 0];
        else [sp.y, sp.vy] = springStep(sp.y, sp.vy, liftOf(id), Math.min(dt, 0.05), LIFT_SPRING);
        groups[id].position.y = sp.y;
        // The shadow stays on the floor and spreads and pales as its figure rises.
        const k = sp.y / APART_LIFT;
        shadows[id].position.y = 0.002 - sp.y;
        shadows[id].scale.setScalar(1 + 0.35 * k);
        shadows[id].userData.lift = k;
      }
      const t = spread();
      floor.material.opacity = 0.75 * (1 - t);
      for (const f of skinFades) {
        const { mat, base } = f;
        mat.opacity = base + (SKIN_ALONE - base) * t;
        const solid = t > 0.5;
        if (mat.depthWrite !== solid) {
          // Solid, the skin's mottled color map (made to tint a see-through film) would read
          // as blotches; it keeps its pores and creases (the normal map) on an even skin tone.
          mat.depthWrite = solid;
          mat.map = solid ? null : f.map;
          if (solid) mat.color.set(SKIN_TONE);
          else mat.color.copy(f.color);
          mat.needsUpdate = true;
        }
      }
      for (const sh of Object.values(shadows)) sh.material.opacity = 0.75 * t * (1 - 0.45 * (sh.userData.lift ?? 0));
      beat = (beat + dt * BEATS_PER_SECOND) % 1;
      heart?.scale.setScalar(still ? 1 : heartbeatScale(beat));
      if (flow && groups.circulatory.visible) flow.update(dt, beat, still);
      infection?.update(dt);
    },
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}

export const buildBody = (opts) => build({ ...opts, mode: 'body' });
export const buildSkeletonScene = (opts) => build({ ...opts, mode: 'skeleton' });

