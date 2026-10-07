// Tier 3: the biceps on the upper arm, cut across. 1 scene unit = 1 cm.
// The muscle belly is split at mid-length and the halves pulled apart, so
// the cut face shows bundles (fascicles) wrapped in connective tissue.
// Around it, for context: the humerus and the shoulder blade it hangs from,
// the two forearm bones it pulls on, the brachialis underneath and the
// triceps behind, inside a faint outline of the arm. The arm hangs straight,
// front (+z) toward the viewer, shoulder at the top.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, tubeThrough, seeded, disposeTree, ellipsoid, longBone, latheBetween } from './kit.js';

// Belly profile [radius, height] along y, about 24 cm long.
const PROFILE = [[0.0, -12], [0.9, -11], [1.9, -8], [2.9, -4], [3.2, 0], [3.0, 4], [2.2, 8], [1.1, 11], [0.0, 12]];
const CUT_Y = 0.6;
const TILT = 0.6; // radians: shoulder up and to the left, elbow down and to the right
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

  // ── Bones: humerus with its head in the shoulder socket, the shoulder blade's
  // socket and coracoid process, and the radius and ulna below the elbow. ──
  const boneMat = M(0xe9dfc8, { roughness: 0.55, tissue: 'bone', repeat: [1, 4] });
  const H = (y) => [0.2, y, -4.6]; // humerus axis, behind the biceps and brachialis
  root.add(pick(ellipsoid([0.9, 24.6, -4.6], [2.4, 2.4, 2.4], boneMat, 32), 'skeletal-system', 'Humerus (head, in the shoulder joint)'));
  root.add(pick(ellipsoid([2.3, 23.6, -2.9], [1.1, 1.3, 1.1], boneMat, 16), 'skeletal-system', 'Humerus (lesser tubercle)'));
  root.add(pick(longBone(H(23.5), H(-17.4), 1.05, 1.9, boneMat, 20), 'skeletal-system', 'Humerus (upper arm bone)'));
  const condyles = ellipsoid([0.2, -18.2, -4.4], [2.9, 1.3, 1.5], boneMat, 20);
  root.add(pick(condyles, 'skeletal-system', 'Humerus (elbow end, with the epicondyles)'));
  const scap = M(0xd9ceb5, { roughness: 0.6, tissue: 'bone', repeat: [2, 2] });
  root.add(pick(ellipsoid([-0.6, 25.4, -7.8], [2.6, 3.6, 0.9], scap, 24), 'shoulder-girdle', 'Shoulder blade (around the shoulder socket)'));
  const coracoid = [[-1.2, 27.4, -6.6], [0.8, 27.6, -4.4], [2.2, 26.4, -2.2]];
  root.add(pick(tubeThrough(coracoid, 0.75, scap, 16, 10), 'shoulder-girdle', 'Coracoid process (where the short head attaches)'));
  root.add(pick(ellipsoid([0.2, 27.6, -6.4], [1.0, 0.7, 0.8], scap, 12), 'shoulder-girdle', 'Supraglenoid tubercle (where the long head attaches)'));
  root.add(pick(longBone([1.6, -19.4, -2.4], [2.6, -34, -1.4], 0.7, 1.2, boneMat, 16), 'skeletal-system', 'Radius (the forearm bone the biceps pulls)'));
  root.add(pick(longBone([-1.6, -17.2, -5.2], [-1.0, -34, -3.2], 0.75, 1.5, boneMat, 16), 'skeletal-system', 'Ulna'));
  root.add(pick(ellipsoid([1.5, -21.6, -1.9], [0.8, 0.9, 0.7], boneMat, 12), 'skeletal-system', 'Radial tuberosity (where the biceps tendon attaches)'));

  // ── Tendons: the long head runs up the groove on the front of the humerus
  // and over its head to the top of the socket; the short head goes to the
  // coracoid; the distal tendon goes to the radius, with a flat sheet
  // (bicipital aponeurosis) fanning toward the inner forearm. ──
  upperGroup.add(pick(tubeThrough([[-0.9, 11.2, 0], [-0.5, 15.5, -0.9], [0.6, 18.6, -1.6], [1.2, 20.4, -2.2], [0.9, 23.8, -3.8], [0.2, 24.2, -6.2]], 0.32, tendonMat, 48, 10), 'tendon', 'Long head tendon (over the top of the humerus)'));
  upperGroup.add(pick(tubeThrough([[0.9, 11.2, 0], [1.6, 15.5, -0.4], [2.2, 20.0, -1.4], [2.2, 23.1, -2.3]], 0.4, tendonMat, 32, 10), 'tendon', 'Short head tendon (to the coracoid process)'));
  root.add(pick(tubeThrough([[0, -11.4, 0], [0.4, -15.5, -0.3], [1.0, -19, -1.1], [1.5, -21.3, -1.7]], 0.5, tendonMat, 32, 10), 'tendon', 'Distal tendon (to the radius)'));
  const fan = new THREE.Shape();
  fan.moveTo(0, 0);
  fan.lineTo(-4.2, -3.6);
  fan.quadraticCurveTo(-3.2, -5.0, -1.8, -5.2);
  fan.lineTo(0.4, -0.6);
  const aponeurosis = new THREE.Mesh(new THREE.ShapeGeometry(fan, 8), M(0xefe6d6, { roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
  aponeurosis.position.set(0.3, -16.2, 0.2);
  aponeurosis.rotation.y = -0.35;
  root.add(pick(aponeurosis, 'tendon', 'Bicipital aponeurosis (a flat tendon sheet to the forearm)'));

  // ── Neighbouring muscles: brachialis under the lower biceps, triceps behind,
  // and a faint outline of the arm. ──
  const deepMat = M(0xa83e52, { roughness: 0.6, tissue: 'muscle', repeat: [1, 3] });
  root.add(pick(latheBetween([0.4, 4.0, -2.0], [-0.6, -19.6, -3.0], [[0, 0.3], [0.2, 1.8], [0.55, 2.4], [0.85, 1.6], [1, 0.4]], deepMat, { segments: 28, squash: [1.2, 0.7] }), 'biceps', 'Brachialis (under the biceps, also bends the elbow)'));
  root.add(pick(latheBetween([0.2, 24.0, -8.4], [-0.6, -18.6, -7.8], [[0, 0.5], [0.15, 2.1], [0.45, 2.9], [0.8, 2.2], [1, 0.7]], deepMat, { segments: 28, squash: [1.3, 0.75] }), 'biceps', 'Triceps (behind the humerus, straightens the elbow)'));
  const skin = M(0xb9b1e6, { roughness: 0.4, transparent: true, opacity: 0.07, depthWrite: false, tissue: 'skin', repeat: [3, 6] });
  const arm = latheBetween([0.4, 30, -3.8], [1.0, -34, -2.8], [[0, 5.2], [0.08, 6.6], [0.3, 6.0], [0.6, 5.4], [0.72, 4.6], [0.86, 4.0], [1, 3.3]], skin, { segments: 40, squash: [1, 1.25] });
  arm.userData.pickPriority = -2;
  root.add(pick(arm, 'biceps', 'Outline of the arm'));

  // Artery and nerve entering the muscle.
  root.add(pick(tubeThrough([[-6, -3, 1.5], [-4, -2.5, 1.8], [-2.4, -2.2, 1.9], [-1.2, -2.4, 2.8]], 0.18, M(0xd9434f, { roughness: 0.4, tissue: 'vessel' }), 32, 8), 'biceps', 'Artery'));
  root.add(pick(tubeThrough([[-6, -1.5, 0.6], [-4, -1.3, 1.4], [-2.6, -1, 2.3], [-1.6, -1.2, 2.8]], 0.12, M(0xe8c45a, { roughness: 0.4, tissue: 'nerve' }), 32, 8), 'biceps', 'Nerve (musculocutaneous)'));

  // Tilt the whole arm so it runs corner to corner and fills a wide screen.
  root.rotation.z = TILT;
  root.updateMatrixWorld(true);
  const world = (p) => new THREE.Vector3(...p).applyMatrix4(root.matrixWorld).toArray();
  const focus = world([centers[0][0], CUT_Y, centers[0][1]]);
  return {
    root,
    fit: 'both',
    metersPerUnit: 0.01,
    view: { target: world([0.6, 1.5, -2.5]), direction: [-0.02, 0.45, 0.9] }, // from the front and a little above, so the cut face shows
    focus,
    dispose() {
      fascicleGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
