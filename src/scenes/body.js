// Tier 1 (whole body) and tier 2 (skeleton) scenes.
// A stylized adult figure built from primitives, 1 scene unit = 1 m, standing
// on y = 0 and facing +z. It is a generalized teaching model, not a scan.
// Milestone 2 replaces these primitives with Z-Anatomy meshes (see tools/).
import * as THREE from 'three/webgpu';
import {
  COLORS, materialBank, pick, capsuleBetween, tubeThrough, ellipsoid, disposeTree, latheBetween, longBone, softShadowTexture, mergedMesh, taperedTube,
} from './kit.js';

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

const SIDES = [-1, 1];

/** The spine's centre line, skull base to sacrum: neck and lower back curve forward, the chest back. */
export const SPINE_CURVE = new THREE.CatmullRomCurve3([
  [0, 1.555, -0.022], [0, 1.49, -0.014], [0, 1.43, -0.03], [0, 1.3, -0.058], [0, 1.17, -0.05],
  [0, 1.08, -0.03], [0, 0.995, -0.036],
].map((p) => new THREE.Vector3(...p)));

/** The 24 movable vertebrae, top to bottom: region, position along the curve, and body radius. */
export function vertebraLayout() {
  const regions = [['Cervical', 7, 0.0085, 0.011], ['Thoracic', 12, 0.012, 0.0165], ['Lumbar', 5, 0.019, 0.022]];
  // Share of the column's length taken by each region (neck, chest, lower back).
  const share = { Cervical: 0.22, Thoracic: 0.5, Lumbar: 0.28 };
  const out = [];
  let start = 0;
  for (const [name, n, r0, r1] of regions) {
    for (let i = 0; i < n; i++) {
      const t = start + share[name] * ((i + 0.5) / n);
      out.push({ region: name, index: i + 1, t, radius: r0 + (r1 - r0) * (n > 1 ? i / (n - 1) : 0), spacing: share[name] / n });
    }
    start += share[name];
  }
  return out;
}

/** Pelvic bowl profile, [radius, height] from the hip sockets up to the iliac crest (meters). */
const PELVIS_PROFILE = [[0.052, 0.925], [0.06, 0.95], [0.078, 0.985], [0.104, 1.02], [0.124, 1.045]];
const PELVIS_DEPTH = 0.62; // the bowl is shallower front to back than it is wide
const PELVIS_BASE = 0.925;
/** The iliac crest rises highest at the sides and dips toward the front and back points of the hip. */
const pelvisLift = (y, phi) => PELVIS_BASE + (y - PELVIS_BASE) * (0.72 + 0.28 * Math.abs(Math.sin(phi)));

function buildSkeleton(M, highlightFemur) {
  const g = new THREE.Group();
  const bone = M(COLORS.bone, { roughness: 0.55, tissue: 'bone', repeat: [1, 6] });
  const glow = M(COLORS.bone, { roughness: 0.45, emissive: COLORS.eosin, emissiveIntensity: 0.55, tissue: 'bone', repeat: [1, 6] });
  // In the skeleton step every bone but the femur is a shade darker, so the femur stands out.
  const dim = highlightFemur ? M(COLORS.boneShade, { roughness: 0.68, tissue: 'bone', repeat: [1, 6] }) : bone;
  // Thin curved plates (the iliac wings) are seen from both sides.
  const dimTwoSided = M(highlightFemur ? COLORS.boneShade : COLORS.bone, { roughness: 0.6, tissue: 'bone', repeat: [2, 2], side: THREE.DoubleSide });
  const cartilage = M(COLORS.cartilage, { roughness: 0.35, tissue: 'cartilage' });
  const enamel = M(0xf6f1e6, { roughness: 0.22 });
  const shadow = M(0x2e2630, { roughness: 1 }); // the dark of a hollow (eye socket, nose), not a structure
  const add = (mesh, card, label) => g.add(pick(mesh, card, label));
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  // ── Skull: cranium, face, cheekbones, jaw and teeth ──────────────────
  add(ellipsoid([0, 1.648, -0.008], [0.078, 0.09, 0.096], dim, 40), 'skull', 'Skull (cranium)');
  add(ellipsoid([0, 1.597, 0.046], [0.05, 0.05, 0.04], dim, 28), 'skull', 'Skull (face)');
  for (const s of SIDES) {
    add(ellipsoid([s * 0.046, 1.596, 0.052], [0.016, 0.013, 0.014], dim, 14), 'skull', 'Cheekbone (zygomatic bone)');
    add(capsuleBetween([s * 0.05, 1.594, 0.045], [s * 0.071, 1.598, -0.005], 0.0045, dim, 6), 'skull', 'Cheekbone arch (zygomatic arch)');
    add(ellipsoid([s * 0.064, 1.585, -0.03], [0.008, 0.013, 0.009], dim, 10), 'skull', 'Mastoid process (behind the ear)');
    add(ellipsoid([s * 0.026, 1.612, 0.074], [0.017, 0.015, 0.008], shadow, 16), 'skull', 'Eye socket (orbit)');
  }
  add(ellipsoid([0, 1.588, 0.084], [0.009, 0.013, 0.006], shadow, 12), 'skull', 'Nasal opening');
  // Lower jaw: chin, body and the two rami that rise to the joint in front of each ear.
  const jaw = [];
  for (const s of SIDES) {
    jaw.push(tubeThrough([[s * 0.05, 1.592, -0.004], [s * 0.049, 1.565, -0.002], [s * 0.046, 1.543, 0.01], [s * 0.032, 1.536, 0.048], [s * 0.012, 1.533, 0.064], [0, 1.533, 0.067]], 0.0062, dim, 24, 8));
  }
  jaw.push(ellipsoid([0, 1.532, 0.066], [0.016, 0.011, 0.008], dim, 14));
  add(mergedMesh(jaw, dim), 'skull', 'Lower jaw (mandible)');
  const teeth = [];
  for (const [y, rr] of [[1.556, 1], [1.549, 0.96]]) {
    for (let i = 0; i < 16; i++) {
      const a = Math.PI * (0.06 + 0.88 * (i / 15)); // around the dental arch, side to side
      const t = new THREE.Mesh(new THREE.BoxGeometry(i > 4 && i < 11 ? 0.0045 : 0.0055, 0.0072, 0.005), enamel);
      t.position.set(-Math.cos(a) * 0.026 * rr, y, 0.036 + Math.sin(a) * 0.03 * rr);
      t.rotation.y = -a + Math.PI / 2;
      teeth.push(t);
    }
  }
  add(mergedMesh(teeth, enamel), 'skull', 'Teeth (32 in an adult)');

  // ── Vertebral column: 7 neck, 12 chest and 5 lower-back vertebrae with discs between ──
  const vertebrae = [];
  const discs = [];
  const layout = vertebraLayout();
  for (const v of layout) {
    const p = SPINE_CURVE.getPointAt(v.t);
    const tan = SPINE_CURVE.getTangentAt(v.t);
    const len = 0.53 * v.spacing; // column length × this vertebra's share
    const body = new THREE.Mesh(new THREE.CylinderGeometry(v.radius, v.radius * 1.04, len * 0.72, 14), dim);
    body.position.copy(p);
    body.quaternion.setFromUnitVectors(V(0, 1, 0), tan);
    vertebrae.push(body);
    // The arch behind: a spinous process pointing back and down (steepest in the chest)
    // and two transverse processes to the sides (where the ribs rest in the chest).
    const back = p.clone().add(V(0, 0, -v.radius * 1.15));
    const droop = v.region === 'Thoracic' ? 0.02 : 0.006;
    const reach = v.region === 'Lumbar' ? 0.026 : v.region === 'Thoracic' ? 0.022 : 0.014;
    vertebrae.push(capsuleBetween(back.toArray(), [0, back.y - droop, back.z - reach], v.region === 'Lumbar' ? 0.0055 : 0.0035, dim, 6));
    for (const s of SIDES) {
      const side = v.region === 'Lumbar' ? 0.03 : v.region === 'Thoracic' ? 0.026 : 0.02;
      vertebrae.push(capsuleBetween(back.toArray(), [s * side, back.y + 0.002, back.z - 0.004], 0.003, dim, 6));
    }
    if (v.index < (v.region === 'Lumbar' ? 6 : 99)) {
      const below = Math.min(1, v.t + v.spacing / 2);
      const d = new THREE.Mesh(new THREE.CylinderGeometry(v.radius * 1.02, v.radius * 1.02, len * 0.24, 14), cartilage);
      d.position.copy(SPINE_CURVE.getPointAt(below));
      d.quaternion.setFromUnitVectors(V(0, 1, 0), SPINE_CURVE.getTangentAt(below));
      discs.push(d);
    }
  }
  add(mergedMesh(vertebrae, dim), 'vertebral-column', 'Vertebrae (7 neck, 12 chest, 5 lower back)');
  add(mergedMesh(discs, cartilage), 'intervertebral-disc', 'Intervertebral discs');
  // Sacrum (five fused vertebrae) and the small tailbone below it.
  const sacrum = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 18), dim);
  sacrum.scale.z = 0.42;
  sacrum.rotation.set(Math.PI - 0.45, 0, 0);
  sacrum.position.set(0, 0.945, -0.05);
  add(sacrum, 'pelvis', 'Sacrum (five fused vertebrae)');
  const coccyx = [];
  for (let i = 0; i < 4; i++) coccyx.push(ellipsoid([0, 0.888 - i * 0.008, -0.03 + i * 0.006], [0.007 - i * 0.0012, 0.004, 0.004], dim, 8));
  add(mergedMesh(coccyx, dim), 'pelvis', 'Tailbone (coccyx)');

  // ── Rib cage: 12 pairs; 1–7 reach the breastbone through cartilage, 8–10 join the cartilage above, 11–12 float ──
  const ribs = [];
  const costal = [];
  const sternumY = (k) => 1.38 - Math.min(k, 6) * 0.026; // where rib k+1's cartilage meets the breastbone
  const lastCartilage = {}; // per side: the cartilage curve of the rib above
  for (let k = 0; k < 12; k++) {
    const v = layout[7 + k];
    const back = SPINE_CURVE.getPointAt(v.t);
    const y = back.y;
    const w = 0.085 + 0.055 * Math.sin((Math.PI * (k + 2)) / 15);
    const floating = k >= 10;
    for (const s of SIDES) {
      const pts = [
        [s * 0.022, y, back.z - 0.012],
        [s * (w * 0.72), y + 0.004, back.z - 0.02],
        [s * w, y - 0.022, 0.0],
        [s * (w * 0.86), y - 0.05, floating ? 0.035 : 0.068],
      ];
      if (!floating) pts.push([s * (w * 0.55), y - 0.072, 0.098]);
      ribs.push(tubeThrough(pts, k === 0 ? 0.0065 : 0.0052, dim, 28, 6));
      const end = pts[pts.length - 1];
      if (!floating) {
        // Ribs 1–7 run to the breastbone; 8–10 join the cartilage of the rib above.
        const target = k < 7 ? new THREE.Vector3(s * 0.016, sternumY(k), 0.114) : lastCartilage[s].getPointAt(0.35);
        const a = new THREE.Vector3(...end);
        const mid = a.clone().lerp(target, 0.5).add(V(0, k < 7 ? 0.004 : 0.006, 0.006));
        const curve = new THREE.CatmullRomCurve3([a, mid, target]);
        costal.push(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, k < 7 ? 0.0045 : 0.004, 6, false), cartilage));
        lastCartilage[s] = curve;
      }
    }
  }
  add(mergedMesh(ribs, dim), 'rib-cage', 'Ribs (12 pairs)');
  add(mergedMesh(costal, cartilage), 'rib-cage', 'Rib cartilage (costal cartilage)');
  // Breastbone: handle (manubrium), body and the small tip (xiphoid process).
  const manubrium = ellipsoid([0, 1.378, 0.112], [0.024, 0.02, 0.007], dim, 16);
  const sternumBody = capsuleBetween([0, 1.355, 0.115], [0, 1.215, 0.118], 0.01, dim, 10);
  sternumBody.scale.x = 1.55;
  const xiphoid = capsuleBetween([0, 1.205, 0.117], [0, 1.18, 0.112], 0.0045, dim, 8);
  add(mergedMesh([manubrium, sternumBody, xiphoid], dim), 'rib-cage', 'Breastbone (sternum)');

  for (const s of SIDES) {
    // ── Shoulder girdle: collarbone and shoulder blade ──
    add(tubeThrough([[s * 0.018, 1.432, 0.104], [s * 0.06, 1.44, 0.088], [s * 0.115, 1.447, 0.035], [s * 0.168, 1.455, -0.005]], 0.0065, dim, 24, 8), 'shoulder-girdle', 'Collarbone (clavicle)');
    const blade = new THREE.Shape();
    const bx = (x) => s * x;
    blade.moveTo(bx(-0.038), 0.05);
    blade.quadraticCurveTo(bx(0.01), 0.058, bx(0.05), 0.03); // top edge to the shoulder socket
    blade.quadraticCurveTo(bx(0.02), -0.03, bx(-0.022), -0.095); // outer edge down to the lower tip
    blade.quadraticCurveTo(bx(-0.045), -0.02, bx(-0.038), 0.05); // inner edge, along the spine
    const scap = new THREE.Mesh(new THREE.ExtrudeGeometry(blade, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 10 }), dim);
    scap.position.set(s * 0.1, 1.355, -0.088);
    scap.rotation.y = s * 0.42;
    add(scap, 'shoulder-girdle', 'Shoulder blade (scapula)');
    add(capsuleBetween([s * 0.07, 1.39, -0.1], [s * 0.165, 1.44, -0.03], 0.005, dim, 6), 'shoulder-girdle', 'Spine of the scapula');
    add(ellipsoid([s * 0.172, 1.448, -0.012], [0.016, 0.006, 0.014], dim, 12), 'shoulder-girdle', 'Acromion (tip of the shoulder)');

    // ── Arm ──
    add(ellipsoid([s * 0.185, 1.42, 0], [0.024, 0.024, 0.024], dim), 'skeletal-system', 'Humerus (head)');
    add(longBone([s * 0.188, 1.435, 0], [s * 0.25, 1.11, -0.01], 0.0105, 0.022, dim), 'skeletal-system', 'Humerus');
    add(longBone([s * 0.25, 1.115, 0.012], [s * 0.29, 0.855, 0.012], 0.0065, 0.011, dim), 'skeletal-system', 'Radius');
    add(longBone([s * 0.255, 1.125, -0.012], [s * 0.295, 0.858, -0.008], 0.0062, 0.012, dim), 'skeletal-system', 'Ulna');

    // ── Hand: 8 wrist bones, 5 palm bones, 14 finger bones ──
    const carpals = [];
    for (let r = 0; r < 2; r++) {
      for (let i = 0; i < 4; i++) carpals.push(ellipsoid([s * (0.284 + i * 0.0085), 0.846 - r * 0.013, 0.002], [0.0048, 0.0058, 0.0055], dim, 10));
    }
    add(mergedMesh(carpals, dim), 'hand-bones', 'Wrist bones (8 carpals)');
    const metacarpals = [];
    const phalanges = [];
    const fingerLen = [0.9, 1, 0.95, 0.78]; // index, middle, ring, little
    for (let f = 0; f < 4; f++) {
      const x0 = s * (0.285 + f * 0.0083);
      const x1 = s * (0.284 + f * 0.0098);
      const top = [x0, 0.832, 0.003];
      const knuckle = [x1, 0.775, 0.004];
      metacarpals.push(longBone(top, knuckle, 0.0022, 0.0038, dim, 8));
      let at = knuckle;
      for (const [seg, r] of [[0.026, 0.0026], [0.017, 0.0022], [0.012, 0.0019]]) {
        const next = [at[0] + s * 0.0006 * (f - 1.5), at[1] - seg * fingerLen[f], at[2] + 0.0015];
        phalanges.push(longBone(at, next, r * 0.75, r * 1.25, dim, 8));
        at = next;
      }
    }
    const thumbBase = [s * 0.279, 0.83, 0.008];
    const thumbKnuckle = [s * 0.27, 0.8, 0.02];
    metacarpals.push(longBone(thumbBase, thumbKnuckle, 0.0026, 0.004, dim, 8));
    const thumbMid = [s * 0.264, 0.778, 0.027];
    phalanges.push(longBone(thumbKnuckle, thumbMid, 0.0021, 0.0032, dim, 8));
    phalanges.push(longBone(thumbMid, [s * 0.261, 0.762, 0.031], 0.0018, 0.0027, dim, 8));
    add(mergedMesh(metacarpals, dim), 'hand-bones', 'Palm bones (5 metacarpals)');
    add(mergedMesh(phalanges, dim), 'hand-bones', 'Finger bones (14 phalanges)');

    // ── Pelvis: each hip bone's wing (ilium) is part of a bowl open at the front;
    // below it, the pubis and ischium ring the obturator foramen around the hip socket.
    const wingStart = s === 1 ? 0.62 : Math.PI * 2 - 2.92;
    const wingGeo = new THREE.LatheGeometry(PELVIS_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 24, wingStart, 2.3);
    const wp = wingGeo.attributes.position;
    for (let i = 0; i < wp.count; i++) wp.setY(i, pelvisLift(wp.getY(i), Math.atan2(wp.getX(i), wp.getZ(i))));
    wingGeo.computeVertexNormals();
    const wing = new THREE.Mesh(wingGeo, dimTwoSided);
    wing.scale.z = PELVIS_DEPTH;
    wing.position.z = -0.012;
    add(wing, 'pelvis', 'Hip bone (ilium, the wing)');
    const [rTop, yTop] = PELVIS_PROFILE[PELVIS_PROFILE.length - 1];
    const crest = [];
    for (let i = 0; i <= 8; i++) {
      const phi = wingStart + (2.3 * i) / 8;
      crest.push([rTop * Math.sin(phi), pelvisLift(yTop, phi) + 0.003, rTop * Math.cos(phi) * PELVIS_DEPTH - 0.012]);
    }
    add(tubeThrough(crest, 0.0055, dim, 28, 8), 'pelvis', 'Iliac crest (the top of the hip)');
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0072, 10, 28), dim);
    ring.position.set(s * 0.056, 0.892, 0.022);
    ring.rotation.set(0.1, s * 0.85, 0);
    ring.scale.set(1, 1.25, 1);
    add(ring, 'pelvis', 'Pubis and ischium, around the obturator foramen');
    add(capsuleBetween([s * 0.045, 0.905, 0.042], [s * 0.006, 0.9, 0.054], 0.0085, dim, 8), 'pelvis', 'Pubic bone (meets its partner at the pubic symphysis)');
    add(capsuleBetween([s * 0.05, 0.94, -0.022], [s * 0.06, 0.872, -0.002], 0.009, dim, 8), 'pelvis', 'Ischium');
    add(ellipsoid([s * 0.062, 0.866, -0.002], [0.014, 0.011, 0.016], dim, 12), 'pelvis', 'Sitting bone (ischial tuberosity)');
    const socket = new THREE.Mesh(new THREE.TorusGeometry(0.023, 0.0055, 8, 24), dim);
    socket.position.set(s * 0.083, 0.935, 0.002);
    socket.rotation.y = s * Math.PI * 0.42;
    add(socket, 'pelvis', 'Hip socket rim (acetabulum)');

    // ── Femur (the dive's entry point): head, neck, trochanter, shaft, condyles ──
    // In the skeleton step only the femur the dive enters (viewer's right) glows.
    const femurMat = highlightFemur ? (s === 1 ? glow : dim) : bone;
    const femur = new THREE.Group();
    femur.add(ellipsoid([s * 0.088, 0.935, 0], [0.022, 0.022, 0.022], femurMat));
    femur.add(capsuleBetween([s * 0.088, 0.935, 0], [s * 0.125, 0.905, 0], 0.012, femurMat));
    femur.add(ellipsoid([s * 0.138, 0.9, -0.005], [0.018, 0.022, 0.018], femurMat));
    femur.add(longBone([s * 0.126, 0.915, 0], [s * 0.1, 0.515, 0.008], 0.0125, 0.02, femurMat));
    femur.add(ellipsoid([s * 0.085, 0.505, 0.0], [0.02, 0.022, 0.024], femurMat));
    femur.add(ellipsoid([s * 0.118, 0.505, 0.0], [0.02, 0.022, 0.024], femurMat));
    femur.traverse((o) => pick(o, 'femur', 'Femur'));
    g.add(femur);

    // ── Knee and lower leg ──
    add(ellipsoid([s * 0.1, 0.5, 0.035], [0.018, 0.022, 0.01], dim), 'skeletal-system', 'Kneecap (patella)');
    add(ellipsoid([s * 0.1, 0.478, 0.002], [0.034, 0.011, 0.028], dim, 18), 'skeletal-system', 'Tibia (top, the tibial plateau)');
    add(longBone([s * 0.099, 0.49, 0], [s * 0.092, 0.07, 0], 0.012, 0.028, dim), 'skeletal-system', 'Tibia (shin bone)');
    add(ellipsoid([s * 0.078, 0.068, 0.004], [0.008, 0.016, 0.01], dim, 10), 'skeletal-system', 'Inner ankle bone (medial malleolus)');
    add(longBone([s * 0.126, 0.47, -0.014], [s * 0.118, 0.07, -0.01], 0.0055, 0.01, dim), 'skeletal-system', 'Fibula');
    add(ellipsoid([s * 0.12, 0.062, -0.008], [0.007, 0.017, 0.009], dim, 10), 'skeletal-system', 'Outer ankle bone (lateral malleolus)');

    // ── Foot: 7 ankle bones, 5 long bones, 14 toe bones ──
    const tarsals = [
      ellipsoid([s * 0.099, 0.027, -0.022], [0.016, 0.019, 0.036], dim, 16), // heel (calcaneus)
      ellipsoid([s * 0.095, 0.056, 0.004], [0.018, 0.013, 0.022], dim, 14), // talus
      ellipsoid([s * 0.086, 0.045, 0.03], [0.012, 0.01, 0.009], dim, 10), // navicular
      ellipsoid([s * 0.112, 0.03, 0.028], [0.011, 0.012, 0.014], dim, 10), // cuboid
    ];
    for (let i = 0; i < 3; i++) tarsals.push(ellipsoid([s * (0.08 + i * 0.011), 0.038 - i * 0.003, 0.046], [0.0055, 0.009, 0.009], dim, 8)); // cuneiforms
    add(mergedMesh(tarsals, dim), 'foot-bones', 'Ankle and heel bones (7 tarsals)');
    const metatarsals = [];
    const toes = [];
    for (let i = 0; i < 5; i++) {
      const x0 = s * (0.079 + i * 0.0105);
      const x1 = s * (0.074 + i * 0.0135);
      const base = [x0, 0.032 - i * 0.002, 0.054];
      const ball = [x1, 0.011, 0.118 - i * 0.008];
      metatarsals.push(longBone(base, ball, i === 0 ? 0.0055 : 0.0034, i === 0 ? 0.0085 : 0.0052, dim, 8));
      let at = ball;
      const segs = i === 0 ? [[0.02, 0.0045], [0.015, 0.0038]] : [[0.014, 0.0025], [0.008, 0.0021], [0.006, 0.0019]];
      for (const [len, r] of segs) {
        const next = [at[0], Math.max(0.006, at[1] - 0.002), at[2] + len * (1 - i * 0.07)];
        toes.push(longBone(at, next, r * 0.75, r * 1.2, dim, 8));
        at = next;
      }
    }
    add(mergedMesh(metatarsals, dim), 'foot-bones', 'Foot bones (5 metatarsals)');
    add(mergedMesh(toes, dim), 'foot-bones', 'Toe bones (14 phalanges)');
  }
  return g;
}

function buildSkin(M) {
  const g = new THREE.Group();
  const skin = M(COLORS.skin, { transparent: true, opacity: 0.16, depthWrite: false, roughness: 0.4, tissue: 'skin', repeat: [6, 6] });
  const add = (m) => {
    pick(m, 'skin', 'Skin');
    m.userData.pickPriority = -1; // skin never blocks a click on what is inside
    g.add(m);
  };
  // Head and neck
  add(ellipsoid([0, 1.64, -0.004], [0.09, 0.105, 0.104], skin, 40));
  add(ellipsoid([0, 1.575, 0.03], [0.068, 0.07, 0.074], skin, 32));
  add(ellipsoid([0, 1.604, 0.104], [0.011, 0.02, 0.014], skin, 12));
  for (const s of SIDES) add(ellipsoid([s * 0.09, 1.615, -0.005], [0.012, 0.026, 0.018], skin, 12));
  add(latheBetween([0, 1.43, -0.008], [0, 1.56, 0.0], [[0, 0.064], [0.4, 0.05], [1, 0.054]], skin, { segments: 28 }));
  // Torso: shoulders, chest, waist and hips, flattened front to back.
  const profile = [
    [0.0, 0.84], [0.1, 0.845], [0.15, 0.88], [0.172, 0.94], [0.165, 1.0], [0.14, 1.08], [0.136, 1.13],
    [0.152, 1.22], [0.168, 1.3], [0.176, 1.36], [0.18, 1.41], [0.15, 1.45], [0.08, 1.47], [0.0, 1.475],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 56), skin);
  torso.scale.z = 0.6;
  add(torso);
  for (const s of SIDES) {
    add(ellipsoid([s * 0.185, 1.41, -0.005], [0.06, 0.055, 0.058], skin, 24)); // shoulder
    add(latheBetween([s * 0.19, 1.425, 0], [s * 0.25, 1.115, -0.01], [[0, 0.046], [0.15, 0.05], [0.4, 0.047], [0.75, 0.038], [1, 0.034]], skin)); // upper arm
    add(latheBetween([s * 0.25, 1.115, 0], [s * 0.29, 0.855, 0.004], [[0, 0.035], [0.22, 0.038], [0.55, 0.031], [0.9, 0.022], [1, 0.021]], skin, { squash: [1, 0.8] })); // forearm
    // Hand: palm, four fingers and a thumb.
    add(ellipsoid([s * 0.298, 0.81, 0.002], [0.026, 0.045, 0.013], skin, 20));
    for (let f = 0; f < 4; f++) {
      const fx = s * (0.285 + f * 0.0085);
      add(capsuleBetween([fx, 0.785, 0.003], [fx + s * 0.002 * (f - 1.5), 0.73 + Math.abs(f - 1.4) * 0.009, 0.005], 0.0068, skin, 8));
    }
    add(capsuleBetween([s * 0.283, 0.812, 0.01], [s * 0.268, 0.772, 0.024], 0.0075, skin, 8));
    add(ellipsoid([s * 0.078, 0.89, -0.055], [0.085, 0.085, 0.07], skin, 24)); // buttock
    add(latheBetween([s * 0.1, 0.93, 0.0], [s * 0.1, 0.5, 0.01], [[0, 0.08], [0.18, 0.086], [0.5, 0.073], [0.85, 0.054], [1, 0.048]], skin, { segments: 28, squash: [1, 0.95] })); // thigh
    add(latheBetween([s * 0.1, 0.5, 0.008], [s * 0.094, 0.075, 0.0], [[0, 0.048], [0.12, 0.05], [0.3, 0.054], [0.62, 0.039], [0.9, 0.027], [1, 0.026]], skin, { segments: 28 })); // lower leg
    add(ellipsoid([s * 0.095, 0.035, 0.055], [0.042, 0.032, 0.115], skin, 24)); // foot
  }
  return g;
}

/** A spindle-shaped muscle belly from a to b: thin tendon ends, widest a little above the middle. */
function belly(a, b, r, material, { squash = [1, 1], peak = 0.45 } = {}) {
  const profile = [[0, 0.12], [0.1, 0.42], [peak, 1], [Math.min(0.9, peak + 0.33), 0.72], [0.93, 0.3], [1, 0.1]].map(([t, k]) => [t, k * r]);
  return latheBetween(a, b, profile, material, { segments: 20, squash });
}

function buildMuscles(M) {
  const g = new THREE.Group();
  const m = M(COLORS.muscle, { roughness: 0.5, tissue: 'muscle', repeat: [1, 3] });
  const deep = M(0xb8475c, { roughness: 0.55, tissue: 'muscle', repeat: [1, 3] }); // muscles seen from behind
  const tendon = M(0xefe6d6, { roughness: 0.35, tissue: 'tendon' });
  const add = (mesh, label, card = 'muscular-system') => g.add(pick(mesh, card, label));
  const flat = (at, radii, rot, mat = m) => {
    const e = ellipsoid(at, radii, mat, 20);
    e.rotation.set(...rot);
    return e;
  };

  // Trunk, front: chest, the segmented "six-pack" and the obliques at the sides.
  const abs = [];
  for (let r = 0; r < 4; r++) for (const s of SIDES) abs.push(ellipsoid([s * 0.021, 1.18 - r * 0.052, 0.098 - r * 0.002], [0.019, 0.024, 0.0065], m, 14));
  add(mergedMesh(abs, m), 'Abdominal muscles (rectus abdominis)');
  for (const s of SIDES) {
    add(belly([s * 0.02, 1.33, 0.108], [s * 0.175, 1.38, 0.03], 0.05, m, { squash: [1, 0.32], peak: 0.35 }), 'Chest muscle (pectoralis major)');
    add(flat([s * 0.105, 1.09, 0.055], [0.04, 0.085, 0.03], [0, s * 0.5, s * 0.15]), 'Side abdominal muscle (external oblique)');
    add(belly([s * 0.048, 1.595, -0.012], [s * 0.012, 1.44, 0.08], 0.011, m), 'Neck muscle (sternocleidomastoid)');
  }
  // Trunk, back: trapezius over the shoulders and latissimus dorsi down the sides.
  add(flat([0, 1.4, -0.088], [0.12, 0.085, 0.018], [0.25, 0, 0], deep), 'Upper back muscle (trapezius)');
  add(flat([0, 1.25, -0.085], [0.045, 0.11, 0.015], [-0.15, 0, 0], deep), 'Upper back muscle (trapezius)');
  for (const s of SIDES) add(flat([s * 0.1, 1.16, -0.07], [0.055, 0.12, 0.018], [0, s * -0.5, s * -0.2], deep), 'Back muscle (latissimus dorsi)');

  for (const s of SIDES) {
    // Shoulder and arm.
    add(belly([s * 0.17, 1.46, 0.0], [s * 0.225, 1.3, 0.005], 0.045, m, { peak: 0.35 }), 'Shoulder muscle (deltoid)');
    add(belly([s * 0.205, 1.38, 0.025], [s * 0.252, 1.12, 0.02], 0.026, m, { peak: 0.55 }), 'Biceps', 'biceps');
    add(belly([s * 0.2, 1.4, -0.03], [s * 0.252, 1.12, -0.025], 0.03, deep), 'Triceps');
    add(belly([s * 0.255, 1.11, 0.014], [s * 0.288, 0.87, 0.01], 0.023, m, { peak: 0.3 }), 'Forearm muscles (flexors)');
    add(belly([s * 0.262, 1.11, -0.012], [s * 0.293, 0.87, -0.008], 0.02, deep, { peak: 0.3 }), 'Forearm muscles (extensors)');
    // Hip and thigh.
    add(flat([s * 0.082, 0.925, -0.075], [0.07, 0.08, 0.045], [0.1, 0, 0], deep), 'Buttock muscle (gluteus maximus)');
    add(flat([s * 0.125, 0.98, -0.03], [0.035, 0.045, 0.03], [0, 0, s * -0.2]), 'Hip muscle (gluteus medius)');
    add(belly([s * 0.115, 0.92, 0.04], [s * 0.1, 0.515, 0.045], 0.05, m, { peak: 0.4 }), 'Quadriceps');
    add(ellipsoid([s * 0.074, 0.58, 0.035], [0.024, 0.045, 0.025], m, 14), 'Quadriceps (vastus medialis, the teardrop above the knee)');
    add(tubeThrough([[s * 0.118, 0.995, 0.055], [s * 0.1, 0.85, 0.06], [s * 0.065, 0.66, 0.045], [s * 0.068, 0.5, 0.005], [s * 0.085, 0.44, 0.02]], 0.0075, m, 32, 8), 'Sartorius (the body’s longest muscle)');
    add(belly([s * 0.03, 0.89, 0.025], [s * 0.078, 0.56, 0.0], 0.036, m, { peak: 0.3 }), 'Inner thigh muscles (adductors)');
    add(belly([s * 0.085, 0.88, -0.045], [s * 0.1, 0.52, -0.035], 0.042, deep), 'Hamstrings');
    // Lower leg: the two-headed calf muscle and its Achilles tendon, and the shin muscle.
    for (const dx of [-0.016, 0.014]) add(belly([s * (0.098 + dx), 0.47, -0.03], [s * (0.096 + dx * 0.4), 0.22, -0.035], 0.026, deep, { peak: 0.35 }), 'Calf muscle (gastrocnemius)');
    add(tubeThrough([[s * 0.096, 0.24, -0.036], [s * 0.096, 0.12, -0.036], [s * 0.097, 0.04, -0.05]], 0.005, tendon, 16, 8), 'Achilles tendon (the strongest tendon)');
    add(belly([s * 0.108, 0.46, 0.028], [s * 0.093, 0.1, 0.03], 0.016, m, { peak: 0.3 }), 'Shin muscle (tibialis anterior)');
  }
  return g;
}

/**
 * The heart as a rounded cone pointing down, forward and to the body's left,
 * with both atria at its base and the coronary arteries on its surface.
 */
function buildHeartShape(M) {
  const art = M(COLORS.artery, { roughness: 0.4, tissue: 'myocardium' });
  const atrium = M(0xb63f5e, { roughness: 0.45, tissue: 'myocardium' });
  const coronary = M(0xf06a5a, { roughness: 0.3, emissive: 0x5a0d10, emissiveIntensity: 0.4 });
  const fat = M(0xe9cf8a, { roughness: 0.5 });
  const heart = new THREE.Group();
  const apex = new THREE.Vector3(0.068, 1.195, 0.075);
  const base = new THREE.Vector3(-0.005, 1.29, 0.035);
  const axis = base.clone().sub(apex);
  const L = axis.length();
  heart.position.copy(apex);
  heart.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  // Radius of the ventricles along the axis, apex (0) to base (1), as a share of the length.
  const profile = [[0, 0], [0.06, 0.16], [0.2, 0.3], [0.45, 0.4], [0.7, 0.42], [0.88, 0.36], [1, 0.22]];
  const rAt = (t) => {
    for (let i = 1; i < profile.length; i++) {
      if (t <= profile[i][0]) {
        const [t0, r0] = profile[i - 1];
        const [t1, r1] = profile[i];
        return (r0 + ((t - t0) / (t1 - t0)) * (r1 - r0)) * L;
      }
    }
    return profile[profile.length - 1][1] * L;
  };
  const ventricles = new THREE.Mesh(new THREE.LatheGeometry(profile.map(([t, r]) => new THREE.Vector2(r * L, t * L)), 40), art);
  ventricles.scale.z = 0.82; // flatter front to back
  ventricles.userData.label = 'Heart (ventricles)';
  heart.add(ventricles);
  for (const [x, z, label] of [[-0.42, 0.05, 'Right atrium'], [0.36, -0.12, 'Left atrium']]) {
    const a = ellipsoid([x * L, 0.98 * L, z * L], [0.24 * L, 0.2 * L, 0.22 * L], atrium, 20);
    a.userData.label = label;
    heart.add(a);
  }
  // Coronary arteries: a ring in the groove between atria and ventricles and a
  // branch down the front (anterior interventricular), with fat along it.
  const ring = [];
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    ring.push(new THREE.Vector3(Math.sin(a) * rAt(0.86) * 1.04, 0.86 * L, Math.cos(a) * rAt(0.86) * 0.82 * 1.04));
  }
  const crown = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true), 48, 0.0022, 6, true), coronary);
  const front = [0.86, 0.65, 0.42, 0.2, 0.06].map((t, i) => new THREE.Vector3(0.12 * L * (i / 4), t * L, rAt(t) * 0.82 * 1.04));
  const branch = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(front), 32, 0.0018, 6, false), coronary);
  for (const m of [crown, branch]) {
    m.userData.label = 'Coronary arteries (the heart’s own blood supply)';
    heart.add(m);
  }
  const fatMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(front.slice(0, 3).map((p) => p.clone().multiplyScalar(1.01))), 16, 0.0038, 6, false), fat);
  fatMesh.userData.label = 'Fat along the coronary arteries';
  heart.add(fatMesh);
  heart.traverse((o) => o.isMesh && pick(o, 'heart', o.userData.label));
  return heart;
}

function buildCirculatory(M) {
  const g = new THREE.Group();
  const art = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' });
  const vein = M(COLORS.vein, { roughness: 0.4, tissue: 'vein' });
  g.add(buildHeartShape(M));
  // Pulmonary trunk: from the right ventricle up and splitting to both lungs (oxygen-poor, so blue).
  g.add(pick(tubeThrough([[0.012, 1.285, 0.075], [0.022, 1.315, 0.06], [0.02, 1.335, 0.035]], 0.0085, vein, 20, 10), 'heart', 'Pulmonary trunk (to the lungs)'));
  for (const s of SIDES) g.add(pick(tubeThrough([[0.02, 1.335, 0.035], [s * 0.035 + 0.01, 1.33, 0.02], [s * 0.06, 1.315, 0.005]], 0.0055, vein, 16, 8), 'heart', s < 0 ? 'Right pulmonary artery' : 'Left pulmonary artery'));
  const vessel = (pts, r, material, label) => g.add(pick(tubeThrough(pts, r, material, 64, 8), 'circulatory-system', label));
  vessel([[0.01, 1.28, 0.03], [0.02, 1.335, 0.02], [-0.005, 1.335, -0.02], [-0.01, 1.2, -0.035], [0, 1.0, -0.03], [0, 0.95, -0.02]], 0.011, art, 'Aorta');
  vessel([[0.035, 1.22, 0.02], [0.03, 1.1, -0.02], [0.012, 0.95, -0.01]], 0.01, vein, 'Vena cava');
  for (const s of SIDES) {
    vessel([[0, 0.95, -0.02], [s * 0.075, 0.88, 0.02], [s * 0.1, 0.62, 0.025], [s * 0.1, 0.3, -0.015], [s * 0.095, 0.08, 0.02]], 0.0055, art, 'Femoral artery');
    vessel([[0.012, 0.95, -0.005], [s * 0.088, 0.88, 0.035], [s * 0.112, 0.62, 0.035], [s * 0.112, 0.3, -0.005], [s * 0.105, 0.08, 0.03]], 0.0055, vein, 'Femoral vein');
    vessel([[s * 0.01, 1.335, 0.02], [s * 0.03, 1.5, 0.02], [s * 0.045, 1.6, 0.0]], 0.0045, art, 'Carotid artery');
    vessel([[s * 0.01, 1.335, 0.01], [s * 0.14, 1.39, 0.0], [s * 0.22, 1.25, 0.02], [s * 0.27, 1.0, 0.02], [s * 0.3, 0.82, 0.0]], 0.0045, art, 'Arm artery');
    vessel([[s * 0.04, 1.36, 0.0], [s * 0.15, 1.4, -0.012], [s * 0.232, 1.25, -0.005], [s * 0.28, 1.0, -0.005], [s * 0.305, 0.83, -0.01]], 0.0045, vein, 'Arm vein');
  }
  return g;
}

function buildNervous(M) {
  const g = new THREE.Group();
  const n = M(COLORS.nerve, { roughness: 0.45, emissive: COLORS.nerve, emissiveIntensity: 0.12, tissue: 'nerve' });
  g.add(pick(ellipsoid([0, 1.655, -0.005], [0.072, 0.058, 0.088], M(0xf0d68a, { roughness: 0.6, tissue: 'brain' })), 'brain', 'Brain'));
  const nerve = (pts, r, label) => g.add(pick(tubeThrough(pts, r, n, 64, 6), 'nervous-system', label));
  nerve([[0, 1.6, -0.02], [0, 1.5, -0.035], [0, 1.3, -0.055], [0, 1.1, -0.04], [0, 1.02, -0.035]], 0.006, 'Spinal cord');
  // Eyes (24 mm across) in their sockets, each sending an optic nerve back toward the brain.
  for (const x of EYES.x) {
    const eye = ellipsoid([x, EYES.y, EYES.z], [0.012, 0.012, 0.012], M(0xf2eee6, { roughness: 0.25 }), 24);
    g.add(pick(eye, 'eye', 'Eye'));
    g.add(pick(ellipsoid([x, EYES.y, EYES.z + 0.0105], [0.0055, 0.0055, 0.0022], M(0x4a6a8a, { roughness: 0.2 }), 16), 'eye', 'Iris and pupil'));
    g.add(pick(tubeThrough([[x, EYES.y, EYES.z - 0.011], [x * 0.6, EYES.y - 0.004, EYES.z - 0.035], [0, EYES.y - 0.012, 0.02]], 0.0018, n, 16, 6), 'optic-nerve', 'Optic nerve'));
  }
  for (const s of SIDES) {
    nerve([[0, 1.02, -0.045], [s * 0.06, 0.93, -0.065], [s * 0.1, 0.75, -0.05], [s * 0.1, 0.5, -0.035], [s * 0.1, 0.3, -0.03], [s * 0.095, 0.07, -0.01]], 0.0045, 'Sciatic nerve');
    nerve([[0, 1.45, -0.04], [s * 0.1, 1.4, -0.02], [s * 0.21, 1.27, 0.0], [s * 0.26, 1.02, 0.005], [s * 0.3, 0.8, 0.005]], 0.0035, 'Arm nerves');
    for (let k = 0; k < 6; k++) {
      const y = 1.34 - k * 0.045;
      nerve([[0, y, -0.05], [s * 0.1, y - 0.01, -0.03], [s * 0.13, y - 0.03, 0.04]], 0.0018, 'Intercostal nerve');
    }
  }
  return g;
}

/** Lung outline from base (on the diaphragm) to apex: [radius, height] in meters. */
const LUNG_PROFILE = [[0.004, 1.18], [0.045, 1.166], [0.074, 1.15], [0.078, 1.18], [0.074, 1.23], [0.066, 1.29], [0.053, 1.35], [0.037, 1.4], [0.019, 1.44], [0.003, 1.46]];
const LUNG_DEPTH = 0.88;
const LUNG_X = 0.074; // distance of each lung's axis from the midline

/** The lung's outer surface at height y, angle a (0 = front, π/2 = to the side away from the heart). */
function lungSurface(s, y, a) {
  let r = LUNG_PROFILE[0][0];
  for (let i = 1; i < LUNG_PROFILE.length; i++) {
    const [r0, y0] = LUNG_PROFILE[i - 1];
    const [r1, y1] = LUNG_PROFILE[i];
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1)) r = r0 + ((y - y0) / (y1 - y0)) * (r1 - r0);
  }
  return [s * LUNG_X + s * Math.sin(a) * r * 1.01, y, Math.cos(a) * r * LUNG_DEPTH * 1.01];
}

function buildRespiratory(M) {
  const g = new THREE.Group();
  const airway = M(0xf3c1cf, { roughness: 0.5 });
  const ringMat = M(COLORS.cartilage, { roughness: 0.35, tissue: 'cartilage' });
  const lung = M(COLORS.lung, { roughness: 0.7, transparent: true, opacity: 0.8, tissue: 'lung' });
  const fissure = M(0x8a4660, { roughness: 0.8 });
  const diaphragm = M(0xc95468, { roughness: 0.55, tissue: 'muscle', transparent: true, opacity: 0.7, side: THREE.DoubleSide });
  // Windpipe with its C-shaped cartilage rings (open at the back), then the two main bronchi.
  g.add(pick(tubeThrough([[0, 1.5, 0.035], [0, 1.42, 0.035], [0, 1.34, 0.03]], 0.009, airway, 24, 10), 'respiratory-system', 'Windpipe (trachea)'));
  const rings = [];
  for (let i = 0; i < 12; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.0098, 0.0016, 6, 18, Math.PI * 1.6), ringMat);
    r.rotation.set(Math.PI / 2, 0, Math.PI * 0.7);
    r.position.set(0, 1.49 - i * 0.012, 0.035 - i * 0.0004);
    rings.push(r);
  }
  g.add(pick(mergedMesh(rings, ringMat), 'respiratory-system', 'Cartilage rings of the windpipe'));
  for (const s of SIDES) {
    g.add(pick(tubeThrough([[0, 1.34, 0.03], [s * 0.035, 1.3, 0.02], [s * 0.06, 1.27, 0.01]], 0.0065, airway, 16, 8), 'respiratory-system', 'Main bronchus'));
    // Each lung: a rounded cone, flatter where it faces the heart; the left lung
    // has a notch for the heart (the cardiac notch).
    const geo = new THREE.LatheGeometry(LUNG_PROFILE.map(([r, y]) => new THREE.Vector2(r, y)), 36);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const z = pos.getZ(i) * LUNG_DEPTH;
      const y = pos.getY(i);
      if (x * s < 0) x *= 0.5;
      if (s === 1 && x < 0.02 && z > 0 && y < 1.3) {
        const notch = Math.max(0, 1 - Math.abs(y - 1.22) / 0.08) * Math.min(1, z / 0.04);
        x += 0.03 * notch;
      }
      pos.setXYZ(i, x + s * LUNG_X, y, z);
    }
    geo.computeVertexNormals();
    g.add(pick(new THREE.Mesh(geo, lung), 'lungs', s < 0 ? 'Right lung (three lobes)' : 'Left lung (two lobes)'));
    // Fissures between the lobes: an oblique one on both lungs, a horizontal one on the right.
    const oblique = [];
    for (let i = 0; i <= 10; i++) oblique.push(lungSurface(s, 1.37 - 0.2 * (i / 10), Math.PI * (1 - i / 10) * 0.95));
    g.add(pick(tubeThrough(oblique, 0.0014, fissure, 32, 5), 'lungs', 'Fissure between lung lobes'));
    if (s < 0) {
      const horiz = [];
      for (let i = 0; i <= 6; i++) horiz.push(lungSurface(s, 1.29, (Math.PI / 2) * 1.05 * (1 - i / 6)));
      g.add(pick(tubeThrough(horiz, 0.0014, fissure, 24, 5), 'lungs', 'Fissure between lung lobes'));
    }
  }
  // Diaphragm: the dome of muscle under the lungs, a little higher on the right (over the liver).
  const dome = new THREE.SphereGeometry(0.15, 40, 14, 0, Math.PI * 2, 0, 1.05);
  const dp = dome.attributes.position;
  for (let i = 0; i < dp.count; i++) {
    const x = dp.getX(i);
    const lift = x < 0 ? 0.01 * Math.min(1, -x / 0.08) : 0;
    dp.setXYZ(i, x, dp.getY(i) + lift, dp.getZ(i) * 0.68);
  }
  dome.computeVertexNormals();
  const dia = new THREE.Mesh(dome, diaphragm);
  dia.position.set(0, 1.0, -0.005);
  g.add(pick(dia, 'diaphragm', 'Diaphragm (the main breathing muscle)'));
  return g;
}

function buildImmune(M) {
  const g = new THREE.Group();
  const node = M(COLORS.lymph, { roughness: 0.4, emissive: COLORS.lymph, emissiveIntensity: 0.15 });
  const duct = M(COLORS.lymph, { roughness: 0.5, transparent: true, opacity: 0.7 });
  const add = (mesh, label) => g.add(pick(mesh, 'immune-system', label));
  const clusters = [
    [0.045, 1.5, 0.03], [0.15, 1.33, 0.0], [0.08, 0.88, 0.05], [0.03, 1.05, 0.0],
  ];
  for (const [x, y, z] of clusters) {
    for (const s of SIDES) {
      for (let i = 0; i < 3; i++) {
        add(ellipsoid([s * (x + i * 0.008), y - i * 0.014, z + (i % 2) * 0.01], [0.008, 0.007, 0.007], node, 10), 'Lymph node');
      }
    }
  }
  add(ellipsoid([0, 1.36, 0.075], [0.025, 0.03, 0.012], node), 'Thymus');
  add(ellipsoid([0.085, 1.12, -0.04], [0.028, 0.05, 0.02], M(0x8a4f7d, { roughness: 0.6, tissue: 'organ' })), 'Spleen');
  add(tubeThrough([[0.0, 1.0, -0.02], [0.0, 1.2, -0.03], [-0.01, 1.4, -0.01], [-0.03, 1.46, 0.02]], 0.0025, duct, 32, 6), 'Thoracic duct');
  for (const s of SIDES) {
    add(tubeThrough([[s * 0.08, 0.88, 0.05], [s * 0.04, 0.96, 0.01], [0, 1.0, -0.02]], 0.002, duct, 16, 6), 'Lymphatic vessel');
  }
  return g;
}

/** Small-intestine loops (a centre line, meters): drawn far shorter than the real 3 m. */
export function smallIntestinePath() {
  const pts = [];
  for (let row = 0; row < 6; row++) {
    const y = 0.958 - row * 0.019;
    for (let k = 0; k <= 8; k++) {
      const u = row % 2 ? 1 - k / 8 : k / 8;
      pts.push([-0.06 + 0.12 * u, y + 0.006 * Math.sin(k * 1.9 + row), 0.03 + 0.022 * Math.sin(k * 1.3 + row * 0.7)]);
    }
  }
  return pts;
}

function buildDigestive(M) {
  const g = new THREE.Group();
  // Each organ keeps the shared organ surface but its own color in life.
  const gut = M(0xe39aa0, { roughness: 0.45, tissue: 'organ', natural: 0xd99088 });
  const colon = M(0xd9a184, { roughness: 0.5, tissue: 'organ', natural: 0xc79574 });
  const liverMat = M(0x8c3a3e, { roughness: 0.38, tissue: 'organ', natural: 0x7a2c28 });
  const add = (mesh, card, label) => g.add(pick(mesh, card, label));
  // Esophagus: behind the windpipe and heart, through the diaphragm into the stomach.
  add(tubeThrough([[0, 1.52, 0.012], [0.0, 1.4, 0.0], [0.005, 1.27, -0.012], [0.02, 1.15, 0.0], [0.035, 1.1, 0.018]], 0.0065, gut, 40, 8), 'digestive-system', 'Esophagus (food pipe)');
  // Stomach: a J-shaped bag, widest in its body, narrowing to the pylorus.
  add(taperedTube([[0.035, 1.1, 0.018], [0.07, 1.115, 0.0], [0.09, 1.07, 0.025], [0.07, 1.01, 0.05], [0.02, 0.995, 0.055], [-0.025, 1.01, 0.045]],
    (t) => 0.011 + 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.25)) * (1 - 0.35 * t), gut, 64, 16), 'stomach', 'Stomach');
  // Liver, the largest gland: a big right lobe and a thinner left lobe under the diaphragm; gallbladder below.
  const right = ellipsoid([-0.06, 1.095, 0.035], [0.088, 0.052, 0.066], liverMat, 32);
  right.rotation.z = 0.22;
  const left = ellipsoid([0.035, 1.115, 0.052], [0.055, 0.026, 0.04], liverMat, 24);
  left.rotation.z = -0.15;
  add(mergedMesh([right, left], liverMat), 'liver', 'Liver');
  add(ellipsoid([-0.045, 1.055, 0.085], [0.011, 0.022, 0.011], M(0x6f9a3f, { roughness: 0.3 }), 14), 'liver', 'Gallbladder (stores bile)');
  // Duodenum curving around the head of the pancreas, which runs left toward the spleen.
  add(tubeThrough([[-0.025, 1.01, 0.045], [-0.045, 0.99, 0.025], [-0.042, 0.958, 0.012], [-0.005, 0.952, 0.004], [0.02, 0.965, 0.0]], 0.0085, gut, 32, 8), 'small-intestine', 'Duodenum (first part of the small intestine)');
  add(taperedTube([[-0.025, 0.98, 0.012], [0.01, 0.995, 0.0], [0.05, 1.01, -0.012], [0.078, 1.03, -0.03]], (t) => 0.012 - 0.006 * t, M(0xe6bf86, { roughness: 0.55, tissue: 'organ', natural: 0xdcb377 }), 32, 10), 'pancreas', 'Pancreas');
  add(tubeThrough(smallIntestinePath(), 0.0085, gut, 300, 8), 'small-intestine', 'Small intestine (jejunum and ileum)');
  // Large intestine framing the small one: up the right side, across, down the left, then the S-bend and rectum.
  const frame = [[-0.075, 0.875, 0.03], [-0.082, 0.94, 0.03], [-0.078, 0.995, 0.035], [-0.03, 0.985, 0.066], [0.03, 0.98, 0.066], [0.082, 1.01, 0.03], [0.088, 0.95, 0.02], [0.084, 0.885, 0.025], [0.05, 0.86, 0.045], [0.015, 0.87, 0.02], [0.0, 0.858, -0.02], [0.0, 0.84, -0.03]];
  add(taperedTube(frame, (t) => 0.0155 * (1 + 0.14 * Math.abs(Math.sin(t * Math.PI * 38))) * (t > 0.85 ? 0.85 : 1), colon, 220, 12), 'large-intestine', 'Large intestine (colon)');
  add(tubeThrough([[-0.072, 0.868, 0.03], [-0.066, 0.852, 0.038], [-0.058, 0.846, 0.034]], 0.0035, colon, 12, 6), 'large-intestine', 'Appendix');
  return g;
}

/** Kidney centers (meters): beside the spine at about T12 to L3, the right one a little lower (the liver is above it). */
export const KIDNEYS = { left: [0.066, 1.1, -0.045], right: [-0.066, 1.085, -0.045] };

/** A bean: an ellipsoid dented on the side that faces `medial` (+1 or −1 in x). */
export function beanGeometry(rx, ry, rz, medial, seg = 32) {
  const geo = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const toward = x * medial; // 1 at the medial edge
    if (toward > 0) x -= medial * 0.38 * toward * Math.exp(-((y / 0.38) ** 2)); // the hilum dent
    p.setXYZ(i, x * rx, y * ry, z * rz);
  }
  geo.computeVertexNormals();
  return geo;
}

function buildUrinary(M) {
  const g = new THREE.Group();
  const kidneyMat = M(0x9c4a4a, { roughness: 0.4, tissue: 'organ', natural: 0x8e3f3a });
  const tubeMat = M(0xf0d2a8, { roughness: 0.4, tissue: 'organ', natural: 0xe9c79a });
  const art = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' });
  const vein = M(COLORS.vein, { roughness: 0.4, tissue: 'vein' });
  const add = (mesh, card, label) => g.add(pick(mesh, card, label));
  for (const [side, c] of Object.entries(KIDNEYS)) {
    const s = side === 'left' ? 1 : -1;
    const kidney = new THREE.Mesh(beanGeometry(0.03, 0.06, 0.02, -s), kidneyMat);
    kidney.position.set(...c);
    kidney.rotation.z = s * 0.18; // upper poles lean toward the spine
    add(kidney, 'kidney', side === 'left' ? 'Left kidney' : 'Right kidney (a little lower)');
    const hilum = [c[0] - s * 0.024, c[1], c[2] + 0.004];
    add(tubeThrough([[s * 0.006, c[1] + 0.004, -0.03], [s * 0.02, c[1] + 0.003, -0.035], hilum], 0.0034, art, 16, 8), 'kidney', 'Renal artery (a quarter of the heart’s output at rest)');
    add(tubeThrough([[-0.012 + s * 0.004, c[1] - 0.004, -0.02], [s * 0.022 - 0.004, c[1] - 0.005, -0.03], [hilum[0], hilum[1] - 0.006, hilum[2] + 0.004]], 0.0038, vein, 16, 8), 'kidney', 'Renal vein');
    add(tubeThrough([[hilum[0], hilum[1] - 0.012, hilum[2]], [s * 0.04, c[1] - 0.07, -0.035], [s * 0.045, 0.95, -0.02], [s * 0.03, 0.9, 0.025], [s * 0.016, 0.888, 0.045]], 0.0022, tubeMat, 40, 6), 'urinary-system', 'Ureter (carries urine to the bladder)');
  }
  const bladder = ellipsoid([0, 0.885, 0.05], [0.032, 0.026, 0.028], M(0xe6b8a0, { roughness: 0.4, tissue: 'organ', natural: 0xdcae96 }), 24);
  add(bladder, 'urinary-system', 'Bladder');
  add(tubeThrough([[0, 0.862, 0.056], [0, 0.845, 0.06], [0, 0.83, 0.064]], 0.003, tubeMat, 8, 6), 'urinary-system', 'Urethra');
  return g;
}

/** Eye centres: in the sockets of the skull, below the brow. */
export const EYES = { x: [-0.032, 0.032], y: 1.632, z: 0.077 };

/** Thyroid lobes on either side of the windpipe, below the larynx. */
export const THYROID = { center: [0, 1.468, 0.04], lobeX: 0.018 };

function buildEndocrine(M) {
  const g = new THREE.Group();
  const add = (mesh, card, label) => g.add(pick(mesh, card, label));
  const thyroidMat = M(0xb8534e, { roughness: 0.45, tissue: 'organ', natural: 0xa94a46 });
  const [cx, cy, cz] = THYROID.center;
  for (const s of SIDES) {
    const lobe = ellipsoid([cx + s * THYROID.lobeX, cy, cz], [0.008, 0.024, 0.009], thyroidMat, 24);
    lobe.rotation.z = -s * 0.12; // lower poles splay slightly outward
    add(lobe, 'thyroid-gland', 'Thyroid gland (one lobe)');
    for (const dy of [0.011, -0.012]) {
      add(ellipsoid([cx + s * (THYROID.lobeX + 0.002), cy + dy, cz - 0.009], [0.0028, 0.0034, 0.0022], M(0xd9a35a, { roughness: 0.5 }), 10), 'parathyroid-gland', 'Parathyroid gland (on the back of the thyroid)');
    }
    // Adrenal glands: caps on the upper poles of the kidneys.
    const k = s === 1 ? KIDNEYS.left : KIDNEYS.right;
    const adrenal = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.022, 3), M(0xe0b25a, { roughness: 0.5, tissue: 'organ', natural: 0xd9a64e }));
    adrenal.position.set(k[0] - s * 0.006, k[1] + 0.066, k[2]);
    adrenal.scale.z = 0.5;
    add(adrenal, 'adrenal-gland', 'Adrenal gland (on top of the kidney)');
  }
  add(capsuleBetween([cx - 0.012, cy - 0.011, cz + 0.007], [cx + 0.012, cy - 0.011, cz + 0.007], 0.0045, thyroidMat, 12), 'thyroid-gland', 'Isthmus of the thyroid (crosses the windpipe)');
  add(ellipsoid([0, 1.592, 0.012], [0.006, 0.006, 0.006], M(0xe8a0b4, { roughness: 0.45 }), 16), 'endocrine-system', 'Pituitary gland (under the brain)');
  return g;
}

function build({ mode = 'body', systems = DEFAULT_SYSTEMS } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const skeletonOnly = mode === 'skeleton';
  const groups = {
    skin: buildSkin(M),
    skeletal: buildSkeleton(M, skeletonOnly),
    muscular: buildMuscles(M),
    circulatory: buildCirculatory(M),
    nervous: buildNervous(M),
    respiratory: buildRespiratory(M),
    immune: buildImmune(M),
    digestive: buildDigestive(M),
    urinary: buildUrinary(M),
    endocrine: buildEndocrine(M),
  };
  for (const [id, grp] of Object.entries(groups)) {
    grp.name = id;
    grp.visible = skeletonOnly ? id === 'skeletal' : systems.includes(id);
    root.add(grp);
  }

  // A soft contact shadow so the figure stands on something.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), M.basic(0x07051a, { map: softShadowTexture(), transparent: true, opacity: 0.75, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  root.add(floor);

  // Focus: the left femur (viewer's right), which the dive enters next.
  const femurCenter = [0.112, 0.71, 0.005];

  return {
    root,
    metersPerUnit: 1,
    view: skeletonOnly
      ? { target: [0.04, 0.875, 0], direction: [0.42, 0.12, 1] } // whole skeleton, head to feet
      : { target: [0, 0.875, 0], direction: [0.28, 0.08, 1] },
    focus: femurCenter,
    setSystems(list) {
      if (skeletonOnly) return;
      for (const [id, grp] of Object.entries(groups)) grp.visible = list.includes(id);
    },
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}

export const buildBody = (opts) => build({ ...opts, mode: 'body' });
export const buildSkeletonScene = (opts) => build({ ...opts, mode: 'skeleton' });
