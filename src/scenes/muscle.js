// Tier 3: the biceps, cut across. 1 scene unit = 1 cm.
// The muscle belly is split at mid-length and the halves pulled apart, so
// the cut face shows bundles (fascicles) wrapped in connective tissue.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, tubeThrough, seeded, disposeTree } from './kit.js';

// Belly profile [radius, height] along y, about 24 cm long.
const PROFILE = [[0.0, -12], [0.9, -11], [1.9, -8], [2.9, -4], [3.2, 0], [3.0, 4], [2.2, 8], [1.1, 11], [0.0, 12]];
const CUT_Y = 0.6;
const GAP = 3.2;

function radiusAt(y) {
  for (let i = 0; i < PROFILE.length - 1; i++) {
    const [r0, y0] = PROFILE[i];
    const [r1, y1] = PROFILE[i + 1];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

export function buildMuscle() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(59);
  const muscleMat = M(0xc9485d, { roughness: 0.55, tissue: 'muscle', repeat: [1, 3] });
  const sheath = M(0xe8d7e4, { roughness: 0.4, transparent: true, opacity: 0.35, depthWrite: false, tissue: 'fascia' });
  const tendonMat = M(0xefe6d6, { roughness: 0.35, tissue: 'tendon' });

  const half = (y0, y1) => {
    const pts = [];
    for (let y = y0; y <= y1 + 1e-6; y += 0.25) pts.push(new THREE.Vector2(radiusAt(y), y));
    if (y0 === CUT_Y) pts.unshift(new THREE.Vector2(0, CUT_Y));
    if (y1 === CUT_Y) pts.push(new THREE.Vector2(0, CUT_Y));
    return pts;
  };
  const lower = new THREE.Mesh(new THREE.LatheGeometry(half(-12, CUT_Y), 64), muscleMat);
  root.add(pick(lower, 'biceps', 'Biceps belly'));
  const upperGroup = new THREE.Group();
  upperGroup.position.y = GAP;
  upperGroup.add(pick(new THREE.Mesh(new THREE.LatheGeometry(half(CUT_Y, 12), 64), muscleMat), 'biceps', 'Biceps belly'));
  root.add(upperGroup);

  // Epimysium: a thin translucent sheath around the whole muscle.
  const sheathPts = [];
  for (let y = -11.6; y <= 11.6; y += 0.4) sheathPts.push(new THREE.Vector2(radiusAt(y) + 0.08, y));
  const sheathLower = new THREE.Mesh(new THREE.LatheGeometry(sheathPts.filter((p) => p.y <= CUT_Y), 64), sheath);
  root.add(pick(sheathLower, 'epimysium', 'Epimysium'));

  // Cut face: fascicles packed in a disc, each outlined by perimysium.
  const R = radiusAt(CUT_Y);
  const face = new THREE.Group();
  face.position.y = CUT_Y + 0.01;
  face.add(pick(new THREE.Mesh(new THREE.CircleGeometry(R, 64), M(0xe8d7e4, { roughness: 0.7, tissue: 'fascia', repeat: [0.3, 0.3] })).rotateX(-Math.PI / 2), 'perimysium', 'Perimysium'));
  const fascicleGeo = new THREE.CylinderGeometry(1, 1, 0.12, 20);
  const fascMat = M(0xd65a6e, { roughness: 0.6, tissue: 'muscle', repeat: [0.25, 0.25] });
  const centers = [];
  for (let tries = 0; tries < 4000 && centers.length < 60; tries++) {
    const r = Math.sqrt(rand()) * (R - 0.35);
    const a = rand() * Math.PI * 2;
    const p = [Math.cos(a) * r, Math.sin(a) * r];
    const size = 0.28 + rand() * 0.22;
    if (centers.every((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) > c[2] + size + 0.06)) centers.push([p[0], p[1], size]);
  }
  const fascicles = new THREE.InstancedMesh(fascicleGeo, fascMat, centers.length);
  const m4 = new THREE.Matrix4();
  centers.forEach(([x, z, s], i) => fascicles.setMatrixAt(i, m4.compose(new THREE.Vector3(x, 0.06, z), new THREE.Quaternion(), new THREE.Vector3(s, 1, s))));
  face.add(pick(fascicles, 'fascicle', 'Fascicle'));
  root.add(face);

  // Tendons: two heads at the shoulder end, one at the elbow end.
  upperGroup.add(pick(capsuleBetween([-0.9, 11.2, 0], [-1.6, 19, -0.5], 0.35, tendonMat, 12), 'tendon', 'Long head tendon'));
  upperGroup.add(pick(capsuleBetween([0.9, 11.2, 0], [1.8, 18, 0.6], 0.42, tendonMat, 12), 'tendon', 'Short head tendon'));
  root.add(pick(capsuleBetween([0, -11.4, 0], [0.3, -17.5, 0.5], 0.5, tendonMat, 12), 'tendon', 'Distal tendon (to the radius)'));

  // Artery and nerve entering the muscle.
  root.add(pick(tubeThrough([[-6, -3, 1.5], [-4, -2.5, 1.8], [-2.4, -2.2, 1.9], [-1.2, -2.4, 2.8]], 0.18, M(0xd9434f, { roughness: 0.4, tissue: 'vessel' }), 32, 8), 'biceps', 'Artery'));
  root.add(pick(tubeThrough([[-6, -1.5, 0.6], [-4, -1.3, 1.4], [-2.6, -1, 2.3], [-1.6, -1.2, 2.8]], 0.12, M(0xe8c45a, { roughness: 0.4, tissue: 'nerve' }), 32, 8), 'biceps', 'Nerve (musculocutaneous)'));

  const focus = [centers[0][0], CUT_Y, centers[0][1]];
  return {
    root,
    fit: 'both',
    metersPerUnit: 0.01,
    view: { target: [0, 1.5, 0], direction: [0.55, 0.55, 0.8] },
    focus,
    dispose() {
      fascicleGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
