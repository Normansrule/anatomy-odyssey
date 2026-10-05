// Tier 3: the brain. 1 scene unit = 1 cm; the front of the head faces +z.
// Two folded cerebral hemispheres, the cerebellum and the brainstem. The
// right hemisphere (viewer's left is the body's right, so it sits at −x)
// stays whole; the left hemisphere has a wedge removed toward the camera,
// showing the thin gray-matter cortex over the white-matter core.
// Folds (gyri and sulci) are a smooth random field with grooves where it
// crosses zero: a generalized pattern, not a real person's folding.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, tubeThrough, seeded, disposeTree } from './kit.js';

// Half-sizes of one hemisphere (cm): width, height, front-to-back length.
const HEMI = [3.3, 4.6, 8.2];
const GAP = 0.18; // longitudinal fissure half-width
const CORTEX = 0.3; // gray matter about 2.5–3 mm thick
const CUT_CENTER = 2.5; // sphere phi facing the default view direction
const CUT_HALF = Math.PI / 4.2;

/** A smooth random field on the unit sphere; grooves (sulci) sit where it is near zero. */
function foldField(seed) {
  const rand = seeded(seed);
  const waves = Array.from({ length: 6 }, () => ({
    d: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
    f: 5 + rand() * 4,
    p: rand() * Math.PI * 2,
  }));
  return (dir) => {
    let n = 0;
    for (const w of waves) n += Math.sin(w.f * dir.dot(w.d) + w.p);
    return n / waves.length;
  };
}

/** Radial displacement (cm, negative = groove) for a direction on the hemisphere. */
function foldDepth(field, dir) {
  const n = field(dir);
  return -0.42 * Math.exp(-((n / 0.11) ** 2)) + 0.06;
}

function surfacePoint(field, dir, inset = 0) {
  const d = foldDepth(field, dir);
  const k = 1 + (d - inset) / HEMI[1];
  return new THREE.Vector3(dir.x * HEMI[0] * k, dir.y * HEMI[1] * k, dir.z * HEMI[2] * k);
}

function hemisphereGeometry(field, phiStart = 0, phiLength = Math.PI * 2, inset = 0) {
  const geo = new THREE.SphereGeometry(1, 150, 110, phiStart, phiLength);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    // Flatten the underside a little, as the real brain rests on the skull base.
    const p = surfacePoint(field, v, inset);
    if (p.y < -2.2) p.y = -2.2 + (p.y + 2.2) * 0.45;
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  geo.computeVertexNormals();
  return geo;
}

/** The outline of the hemisphere in the half-plane at sphere angle phi, as 2D points (s, y). */
function meridian(field, phi, inset, steps = 180) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const th = (i / steps) * Math.PI;
    const dir = new THREE.Vector3(-Math.cos(phi) * Math.sin(th), Math.cos(th), Math.sin(phi) * Math.sin(th));
    const p = surfacePoint(field, dir, inset);
    if (p.y < -2.2) p.y = -2.2 + (p.y + 2.2) * 0.45;
    pts.push(new THREE.Vector2(Math.hypot(p.x, p.z), p.y));
  }
  return pts;
}

export function buildBrain() {
  const M = materialBank();
  const root = new THREE.Group();
  const gray = M(0xd9a6b8, { roughness: 0.62, tissue: 'brain', repeat: [6, 4] });
  const grayCut = M(0xb88aa6, { roughness: 0.8, side: THREE.DoubleSide, tissue: 'brain', repeat: [0.4, 0.4] });
  const white = M(0xf1e7ee, { roughness: 0.75, side: THREE.DoubleSide, tissue: 'whiteMatter', repeat: [0.4, 0.4] });
  const inner = M(0x8e6a86, { roughness: 0.8, side: THREE.BackSide, tissue: 'whiteMatter' });

  // Body's right hemisphere (whole) at −x.
  const fieldR = foldField(3);
  const right = new THREE.Mesh(hemisphereGeometry(fieldR), gray);
  right.position.x = -(HEMI[0] + GAP);
  root.add(pick(right, 'cerebral-cortex', 'Right cerebral hemisphere'));

  // Body's left hemisphere at +x, cut open toward the camera.
  const fieldL = foldField(8);
  const left = new THREE.Group();
  left.position.x = HEMI[0] + GAP;
  root.add(left);
  const phiStart = CUT_CENTER + CUT_HALF;
  const phiLength = Math.PI * 2 - 2 * CUT_HALF;
  left.add(pick(new THREE.Mesh(hemisphereGeometry(fieldL, phiStart, phiLength), gray), 'cerebral-cortex', 'Left cerebral hemisphere'));
  left.add(pick(new THREE.Mesh(hemisphereGeometry(fieldL, phiStart, phiLength, 0.02), inner), 'white-matter', 'Inside the hemisphere'));

  // Cut faces: a gray band (cortex) around a white core, on both sides of the wedge.
  const faceGeos = [];
  for (const phi of [phiStart, phiStart + phiLength]) {
    const outer = meridian(fieldL, phi, 0);
    const shape = new THREE.Shape();
    outer.forEach((p, i) => (i === 0 ? shape.moveTo(0, p.y) : shape.lineTo(p.x, p.y)));
    shape.lineTo(0, outer[outer.length - 1].y);
    const core = meridian(fieldL, phi, CORTEX + 0.12).map((p) => new THREE.Vector2(Math.max(0, p.x - 0.05), p.y));
    const coreShape = new THREE.Shape();
    coreShape.moveTo(0, core[6].y);
    for (let i = 6; i < core.length - 6; i++) coreShape.lineTo(core[i].x, core[i].y);
    coreShape.lineTo(0, core[core.length - 7].y);
    // The gray band is the outline with the white core cut out as a hole.
    shape.holes.push(new THREE.Path(coreShape.getPoints()));
    const outerGeo = new THREE.ShapeGeometry(shape);
    const coreGeo = new THREE.ShapeGeometry(coreShape);
    faceGeos.push(outerGeo, coreGeo);
    // Map the 2D (s, y) plane onto the 3D half-plane at angle phi.
    const u = new THREE.Vector3(-Math.cos(phi) * HEMI[0], 0, Math.sin(phi) * HEMI[2]).normalize();
    const alpha = Math.atan2(-u.z, u.x);
    const face = new THREE.Group();
    face.rotation.y = alpha;
    face.add(pick(new THREE.Mesh(outerGeo, grayCut), 'cerebral-cortex', 'Gray matter (cut)'));
    face.add(pick(new THREE.Mesh(coreGeo, white), 'white-matter', 'White matter (cut)'));
    left.add(face);
  }

  // Lateral ventricle, seen through the cut: a fluid-filled space.
  const ventricle = tubeThrough([[-1.9, 0.9, 3.6], [-1.6, 1.6, 1.2], [-1.6, 1.5, -1.8], [-1.9, 0.5, -3.5], [-2.3, -0.9, -2.2]], 0.32, M(0x7fb6e8, { roughness: 0.3, transparent: true, opacity: 0.85 }), 60, 10);
  left.add(pick(ventricle, 'white-matter', 'Lateral ventricle (fluid space)'));

  // Corpus callosum: the bridge of white matter between the hemispheres.
  const cc = tubeThrough([[0, 0.9, 3.9], [0, 1.9, 2.0], [0, 2.0, -1.0], [0, 1.4, -3.9]], 0.55, white, 48, 12);
  cc.scale.x = 2.2;
  root.add(pick(cc, 'corpus-callosum', 'Corpus callosum'));

  // Cerebellum: finely folded (folia), tucked under the back of the cerebrum.
  const cbGeo = new THREE.SphereGeometry(1, 96, 64);
  const cp = cbGeo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < cp.count; i++) {
    v.fromBufferAttribute(cp, i);
    const k = 1 + 0.035 * Math.sin(v.y * 34 + Math.sin(v.x * 3) * 1.2);
    cp.setXYZ(i, v.x * 5.0 * k, v.y * 2.5 * k, v.z * 3.3 * k);
  }
  cbGeo.computeVertexNormals();
  const cerebellum = new THREE.Mesh(cbGeo, M(0xcf97ad, { roughness: 0.6, tissue: 'brain', repeat: [8, 6] }));
  cerebellum.position.set(0, -3.1, -5.6);
  cerebellum.rotation.x = -0.25;
  root.add(pick(cerebellum, 'cerebellum', 'Cerebellum'));

  // Brainstem: midbrain, pons and medulla, continuing as the spinal cord.
  const stem = tubeThrough([[0, -0.6, -1.4], [0, -2.6, -2.4], [0, -4.8, -3.1], [0, -7.2, -3.4]], 1.0, M(0xe0bfa0, { roughness: 0.65, tissue: 'whiteMatter' }), 40, 16);
  root.add(pick(stem, 'brainstem', 'Brainstem'));
  const pons = ellipsoid([0, -3.3, -1.9], [1.5, 1.2, 1.2], M(0xe0bfa0, { roughness: 0.65, tissue: 'whiteMatter' }), 28);
  root.add(pick(pons, 'brainstem', 'Pons'));

  // Focus: a point on the cut gray band of the lower face, where the dive continues into the cortex.
  const fp = meridian(fieldL, phiStart, CORTEX / 2)[60];
  const u = new THREE.Vector3(-Math.cos(phiStart) * HEMI[0], 0, Math.sin(phiStart) * HEMI[2]).normalize();
  const focus = [HEMI[0] + GAP + u.x * fp.x, fp.y, u.z * fp.x];

  return {
    root,
    fit: 'both',
    metersPerUnit: 0.01,
    view: { target: [0.4, -0.8, 0], direction: [0.78, 0.3, 0.55] },
    focus,
    dispose() {
      for (const g of faceGeos) g.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
