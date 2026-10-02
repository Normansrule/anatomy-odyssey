// Tier 3: the femur, opened with a cutaway wedge. 1 scene unit = 10 cm.
// The shaft is a lathe (rotated profile) with a quarter removed so the
// compact outer wall, the marrow cavity and the spongy ends are visible.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, cylinderBetween, seeded, disposeTree } from './kit.js';

// Outer profile [radius, height] from the knee end (y≈0) to the hip end.
const OUTER = [
  [0.0, 0.05], [0.26, 0.07], [0.37, 0.25], [0.35, 0.5], [0.24, 0.85], [0.17, 1.2],
  [0.145, 1.8], [0.14, 2.5], [0.15, 3.1], [0.19, 3.5], [0.25, 3.78], [0.22, 3.95], [0.0, 4.02],
];
const SHAFT_LO = 1.15;
const SHAFT_HI = 3.25;

/** Cortex thickness at height y: thick along the shaft, thin over the spongy ends. */
function cortex(y) {
  if (y > SHAFT_LO && y < SHAFT_HI) return 0.062;
  const d = y <= SHAFT_LO ? SHAFT_LO - y : y - SHAFT_HI;
  return Math.max(0.022, 0.062 - d * 0.18);
}

function radiusAt(y) {
  for (let i = 0; i < OUTER.length - 1; i++) {
    const [r0, y0] = OUTER[i];
    const [r1, y1] = OUTER[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

export function buildFemur() {
  const M = materialBank();
  const root = new THREE.Group();
  const bone = M(COLORS.bone, { roughness: 0.5, side: THREE.DoubleSide });
  const cut = M(0xf4ecd9, { roughness: 0.8, side: THREE.DoubleSide });
  const inner = M(COLORS.boneShade, { roughness: 0.8, side: THREE.BackSide });

  // Densify the profile so the inner surface follows the cortex function.
  const ys = [];
  for (let y = 0.05; y <= 4.02; y += 0.05) ys.push(y);
  const outerPts = ys.map((y) => new THREE.Vector2(radiusAt(y), y));
  const innerPts = ys.map((y) => new THREE.Vector2(Math.max(0.0, radiusAt(y) - cortex(y)), y));

  // The removed wedge faces the default camera direction.
  const phiStart = 1.43;
  const phiLength = Math.PI * 1.5;

  const outerShell = new THREE.Mesh(new THREE.LatheGeometry(outerPts, 72, phiStart, phiLength), bone);
  root.add(pick(outerShell, 'compact-bone', 'Compact bone'));
  const innerShell = new THREE.Mesh(new THREE.LatheGeometry(innerPts, 72, phiStart, phiLength), inner);
  root.add(pick(innerShell, 'compact-bone', 'Compact bone'));

  // Cut faces: the ring of cortex seen edge-on at each side of the wedge.
  const shape = new THREE.Shape();
  outerPts.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  [...innerPts].reverse().forEach((p) => shape.lineTo(p.x, p.y));
  const faceGeo = new THREE.ShapeGeometry(shape);
  for (const phi of [phiStart, phiStart + phiLength]) {
    const face = new THREE.Mesh(faceGeo, cut);
    face.rotation.y = phi - Math.PI / 2;
    root.add(pick(face, 'compact-bone', 'Compact bone (cut face)'));
  }

  // Marrow cavity along the shaft (yellow marrow in adults).
  const cavity = cylinderBetween([0, SHAFT_LO + 0.05, 0], [0, SHAFT_HI - 0.05, 0], 0.074, 0.08, M(COLORS.marrowYellow, { roughness: 0.9 }), 32);
  root.add(pick(cavity, 'bone-marrow', 'Yellow marrow'));

  // Spongy ends: red marrow filling a lattice of short struts (trabeculae).
  const rand = seeded(7);
  const strut = new THREE.CylinderGeometry(0.012, 0.012, 1, 5);
  const strutMat = M(COLORS.bone, { roughness: 0.7 });
  const struts = new THREE.InstancedMesh(strut, strutMat, 520);
  const up = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4();
  let n = 0;
  const addEnd = (y0, y1, count) => {
    for (let i = 0; i < count; i++) {
      const y = y0 + rand() * (y1 - y0);
      const rMax = Math.max(0.03, radiusAt(y) - cortex(y) - 0.02);
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * rMax;
      const p = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r);
      const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.2, rand() - 0.5).normalize();
      const len = 0.08 + rand() * 0.1;
      const q = new THREE.Quaternion().setFromUnitVectors(up, dir);
      m4.compose(p, q, new THREE.Vector3(1, len, 1));
      struts.setMatrixAt(n++, m4);
    }
  };
  addEnd(0.12, SHAFT_LO, 260);
  addEnd(SHAFT_HI, 3.92, 260);
  struts.count = n;
  root.add(pick(struts, 'spongy-bone', 'Spongy bone'));

  const endProfile = (y0, y1) => {
    const pts = [];
    for (let y = y0; y <= y1 + 1e-6; y += 0.05) pts.push(new THREE.Vector2(Math.max(0.0, radiusAt(y) - cortex(y) - 0.012), y));
    return pts;
  };
  for (const [y0, y1] of [[0.1, SHAFT_LO + 0.05], [SHAFT_HI - 0.05, 3.96]]) {
    const pts = endProfile(y0, y1);
    const mesh = new THREE.Mesh(new THREE.LatheGeometry(pts, 48, phiStart + 0.05, phiLength - 0.1), M(COLORS.marrowRed, { roughness: 0.85, side: THREE.DoubleSide }));
    root.add(pick(mesh, 'bone-marrow', 'Red marrow'));
  }

  // Neck and head. The neck leaves the shaft at the adult angle of ~125°.
  const neckAngle = THREE.MathUtils.degToRad(180 - 125);
  const neckDir = new THREE.Vector3(-Math.sin(neckAngle), Math.cos(neckAngle), 0);
  const neckBase = new THREE.Vector3(0, 3.72, 0);
  const headCenter = neckBase.clone().addScaledVector(neckDir, 0.62);
  root.add(pick(cylinderBetween(neckBase.toArray(), headCenter.toArray(), 0.13, 0.16, bone, 32), 'femur', 'Femoral neck'));
  root.add(pick(ellipsoid(headCenter.toArray(), [0.23, 0.23, 0.23], bone, 40), 'femoral-head', 'Femoral head'));
  const capGeo = new THREE.SphereGeometry(0.238, 40, 20, 0, Math.PI * 2, 0, 1.15);
  const cartilage = M(COLORS.cartilage, { roughness: 0.25, transparent: true, opacity: 0.7 });
  const headCap = new THREE.Mesh(capGeo, cartilage);
  headCap.position.copy(headCenter);
  headCap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), neckDir.clone().add(new THREE.Vector3(0, 0.35, 0)).normalize());
  root.add(pick(headCap, 'articular-cartilage', 'Articular cartilage'));

  root.add(pick(ellipsoid([0.2, 3.76, 0.0], [0.13, 0.2, 0.14], bone, 32), 'femur', 'Greater trochanter'));
  root.add(pick(ellipsoid([-0.12, 3.33, -0.07], [0.06, 0.07, 0.06], bone, 20), 'femur', 'Lesser trochanter'));

  // Knee end: two condyles with cartilage caps.
  for (const s of [-1, 1]) {
    root.add(pick(ellipsoid([s * 0.19, 0.2, -0.04], [0.15, 0.19, 0.2], bone, 32), 'femur', s < 0 ? 'Medial condyle' : 'Lateral condyle'));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.205, 32, 16, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), cartilage);
    cap.position.set(s * 0.19, 0.2, -0.04);
    cap.scale.set(0.76, 0.95, 1);
    root.add(pick(cap, 'articular-cartilage', 'Articular cartilage'));
  }

  // Focus: the middle of the cortex on the cut face, halfway up the shaft.
  const yF = 2.2;
  const rF = radiusAt(yF) - cortex(yF) / 2;
  const focus = [rF * Math.sin(phiStart), yF, rF * Math.cos(phiStart)];

  return {
    root,
    metersPerUnit: 0.1,
    view: { target: [-0.05, 2.12, 0], direction: [0.62, 0.08, 0.78] },
    focus,
    dispose() {
      faceGeo.dispose();
      strut.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
