// Tier 3: the heart, opened from the front. 1 scene unit = 1 cm.
// A frontal cutaway (the front half removed) shows four chambers, the
// septum between left and right, the valve plane, and the great vessels.
// By convention oxygen-poor blood is drawn blue and oxygen-rich blood red.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, tubeThrough, disposeTree } from './kit.js';

// Outer profile [radius, height], apex at the bottom.
const OUTER = [
  [0.0, -6.2], [1.1, -5.7], [2.5, -4.2], [3.7, -1.8], [4.3, 0.6], [4.2, 2.4],
  [3.4, 3.7], [2.0, 4.4], [0.0, 4.6],
];

function radiusAt(y) {
  for (let i = 0; i < OUTER.length - 1; i++) {
    const [r0, y0] = OUTER[i];
    const [r1, y1] = OUTER[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

export function buildHeart({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const heart = new THREE.Group();
  heart.rotation.z = 0.42; // apex points to the body's left (the viewer's right)
  root.add(heart);

  const myo = M(0xc4566a, { roughness: 0.55 });
  const myoInner = M(0x8e3346, { roughness: 0.7, side: THREE.BackSide });
  const cutMat = M(0xa8445a, { roughness: 0.8, side: THREE.DoubleSide });
  const fibrous = M(0xeadcc0, { roughness: 0.6, side: THREE.DoubleSide });
  const redBlood = M(COLORS.artery, { roughness: 0.35, transparent: true, opacity: 0.82 });
  const blueBlood = M(COLORS.vein, { roughness: 0.35, transparent: true, opacity: 0.82 });

  // Wall: the back half of a lathe (phi from π/2 to 3π/2 is z ≤ 0).
  const ys = [];
  for (let y = -6.2; y <= 4.6 + 1e-6; y += 0.2) ys.push(y);
  const outerPts = ys.map((y) => new THREE.Vector2(radiusAt(y), y));
  const wall = (y) => (y < 0.8 ? 1.0 : 0.45); // ventricles are thicker than atria
  const innerPts = ys.map((y) => new THREE.Vector2(Math.max(0, radiusAt(y) - wall(y)), y));
  heart.add(pick(new THREE.Mesh(new THREE.LatheGeometry(outerPts, 64, Math.PI / 2, Math.PI), myo), 'heart', 'Heart wall (myocardium)'));
  heart.add(pick(new THREE.Mesh(new THREE.LatheGeometry(innerPts, 64, Math.PI / 2, Math.PI), myoInner), 'heart', 'Inner wall'));

  // Cut faces where the front half was removed (the plane z = 0).
  const shape = new THREE.Shape();
  outerPts.forEach((p, i) => (i === 0 ? shape.moveTo(p.x, p.y) : shape.lineTo(p.x, p.y)));
  [...innerPts].reverse().forEach((p) => shape.lineTo(p.x, p.y));
  const faceGeo = new THREE.ShapeGeometry(shape);
  for (const rot of [0, Math.PI]) {
    const face = new THREE.Mesh(faceGeo, cutMat);
    face.rotation.y = rot;
    heart.add(pick(face, 'heart', 'Heart wall (cut)'));
  }
  // The left ventricle's wall is about three times thicker than the right's.
  const lvWall = new THREE.Mesh(
    new THREE.LatheGeometry(ys.filter((y) => y < 0.6 && y > -5.6).map((y) => new THREE.Vector2(Math.max(0, radiusAt(y) - 1.9), y)), 48, Math.PI / 2, Math.PI / 2),
    M(0x9c3a50, { roughness: 0.7, side: THREE.DoubleSide }),
  );
  heart.add(pick(lvWall, 'left-ventricle', 'Left ventricle wall'));

  // Interventricular and interatrial septum: an extruded half-profile in the plane x ≈ 0.
  const sShape = new THREE.Shape();
  const sys = ys.filter((y) => y > -5.6 && y < 4.2);
  sShape.moveTo(0, sys[0]);
  for (const y of sys) sShape.lineTo(-(radiusAt(y) - 0.3), y);
  sShape.lineTo(0, sys[sys.length - 1]);
  const septumGeo = new THREE.ExtrudeGeometry(sShape, { depth: 0.8, bevelEnabled: false });
  const septum = new THREE.Mesh(septumGeo, M(0xb34a60, { roughness: 0.7 }));
  septum.rotation.y = -Math.PI / 2; // shape x → world z (backward), extrude along world x
  septum.position.x = -0.4;
  heart.add(pick(septum, 'septum', 'Septum'));

  // Valve plane between atria and ventricles, with the two valve rings.
  const plane = new THREE.Mesh(new THREE.CircleGeometry(radiusAt(0.9) - 0.4, 48, Math.PI, Math.PI), fibrous);
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = 0.9;
  heart.add(pick(plane, 'heart-valves', 'Valve plane'));
  for (const [x, card, label] of [[-1.9, 'heart-valves', 'Tricuspid valve'], [1.9, 'heart-valves', 'Mitral valve']]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.16, 10, 32), fibrous);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, 0.92, -1.3);
    heart.add(pick(ring, card, label));
    for (let k = 0; k < 3; k++) {
      const leaflet = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.4, 12, 1, true), fibrous);
      leaflet.position.set(x + Math.cos((k * 2 * Math.PI) / 3) * 0.45, 0.25, -1.3 + Math.sin((k * 2 * Math.PI) / 3) * 0.45);
      leaflet.rotation.x = Math.PI;
      heart.add(pick(leaflet, card, label));
    }
  }

  // Blood in each chamber (right side oxygen-poor, left side oxygen-rich).
  const pools = [
    { at: [-1.9, 2.4, -1.4], r: [1.5, 1.2, 1.3], mat: blueBlood, card: 'heart', label: 'Right atrium' },
    { at: [1.9, 2.5, -1.4], r: [1.4, 1.2, 1.3], mat: redBlood, card: 'heart', label: 'Left atrium' },
    { at: [-1.9, -1.4, -1.3], r: [1.3, 2.5, 1.5], mat: blueBlood, card: 'heart', label: 'Right ventricle' },
    { at: [1.55, -1.8, -1.1], r: [0.95, 2.6, 1.1], mat: redBlood, card: 'blood', label: 'Blood in the left ventricle' },
  ];
  const beating = [];
  for (const p of pools) {
    const mesh = ellipsoid(p.at, p.r, p.mat, 28);
    heart.add(pick(mesh, p.card, p.label));
    if (p.at[1] < 0) beating.push({ mesh, base: mesh.scale.clone() });
  }

  // Great vessels.
  const vessel = (pts, r, mat, card, label) => heart.add(pick(tubeThrough(pts, r, mat, 48, 16), card, label));
  const art = M(COLORS.artery, { roughness: 0.4 });
  const vein = M(COLORS.vein, { roughness: 0.4 });
  vessel([[0.7, 3.6, -1.0], [0.6, 6.3, -1.0], [-0.8, 7.8, -2.0], [-2.2, 7.0, -3.0], [-2.3, 3.5, -3.6]], 0.95, art, 'aorta', 'Aorta');
  vessel([[-0.4, 3.7, -0.4], [-0.2, 6.0, -0.2], [1.6, 7.0, -1.4], [3.4, 6.6, -2.0]], 0.9, vein, 'great-vessels', 'Pulmonary trunk (to the lungs)');
  vessel([[-2.6, 9.0, -1.8], [-2.6, 5.6, -1.8], [-2.3, 3.3, -1.6]], 0.72, vein, 'great-vessels', 'Superior vena cava');
  vessel([[-2.3, -0.2, -2.4], [-2.6, -2.6, -2.6], [-2.8, -5.0, -2.6]], 0.75, vein, 'great-vessels', 'Inferior vena cava');
  for (const dz of [-0.8, -2.2]) vessel([[2.9, 2.7, dz], [4.6, 3.1, dz - 0.3], [6.0, 3.4, dz - 0.4]], 0.42, art, 'great-vessels', 'Pulmonary vein (from the lungs)');

  // Coronary arteries feeding the heart muscle itself, on the back surface.
  const coronary = M(0xe06470, { roughness: 0.4 });
  const cor = (pts) => heart.add(pick(tubeThrough(pts, 0.16, coronary, 48, 6), 'coronary-arteries', 'Coronary artery'));
  cor([[0.9, 3.2, -3.2], [2.8, 1.6, -3.0], [3.6, -1.2, -2.2], [2.6, -4.2, -1.6]]);
  cor([[-0.6, 3.0, -3.3], [-2.9, 1.2, -2.9], [-3.4, -1.6, -2.1], [-1.8, -4.8, -1.5]]);

  let t = 0;
  // Focus: the blood in the left ventricle, in world coordinates.
  heart.updateMatrixWorld(true);
  const focus = new THREE.Vector3(1.55, -1.8, -1.1).applyMatrix4(heart.matrixWorld).toArray();

  return {
    root,
    fit: 'both',
    metersPerUnit: 0.01,
    view: { target: [0.4, 0.9, -1], direction: [0.12, 0.1, 1] },
    focus,
    update(dt, env = {}) {
      if (env.reducedMotion ?? reducedMotion) return;
      // About 70 beats per minute: a quick squeeze of the ventricles each cycle.
      t += dt;
      const phase = (t * (70 / 60)) % 1;
      const squeeze = phase < 0.35 ? Math.sin((phase / 0.35) * Math.PI) : 0;
      for (const b of beating) b.mesh.scale.set(b.base.x * (1 - 0.12 * squeeze), b.base.y * (1 - 0.08 * squeeze), b.base.z * (1 - 0.12 * squeeze));
      heart.scale.setScalar(1 - 0.018 * squeeze);
    },
    dispose() {
      faceGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
