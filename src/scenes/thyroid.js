// Tier 3: the thyroid gland in the neck, seen from the front. 1 scene unit = 1 mm.
// Two lobes hug the windpipe just below the larynx, joined by an isthmus
// across the 2nd and 3rd tracheal rings (StatPearls). The viewer's right
// lobe (the body's left) is cut open from the front to show the follicles
// that fill it, drawn larger than life. Parathyroid glands sit on the back
// of the lobes; the superior and inferior thyroid arteries feed them; the
// common carotid arteries and internal jugular veins run alongside.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, capsuleBetween, ellipsoid, seeded, disposeTree, COLORS } from './kit.js';

export const LOBE = { height: 50, rx: 9, rz: 10, x: 17, z: 3, yCenter: 8 }; // upper poles beside the thyroid cartilage
export const TRACHEA_R = 9;
export const RING_PITCH = 4.2;
/** y of the centre of tracheal ring n (1 = the top ring, just below the cricoid). */
export const ringY = (n) => 6 - (n - 1) * RING_PITCH;

/** A lobe's centre line and half-widths at t (−1 = lower pole, +1 = upper pole), for side s (±1). */
export function lobeAt(t, s) {
  const taper = 1 - 0.22 * t; // the lower pole is fuller than the upper
  const round = Math.sqrt(Math.max(0, 1 - t * t));
  return {
    x: s * (LOBE.x + 2.2 * -t), // lower poles splay outward a little
    y: LOBE.yCenter + (t * LOBE.height) / 2,
    z: LOBE.z,
    hx: LOBE.rx * taper * round,
    hz: LOBE.rz * taper * round,
  };
}

function lobeGeometry(s, backHalfOnly) {
  const geo = backHalfOnly ? new THREE.SphereGeometry(1, 48, 40, Math.PI, Math.PI) : new THREE.SphereGeometry(1, 48, 40);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i);
    const r = Math.sqrt(Math.max(1e-9, 1 - t * t));
    const L = lobeAt(t, s);
    p.setXYZ(i, L.x + (p.getX(i) / r) * L.hx, L.y, L.z + (p.getZ(i) / r) * L.hz);
  }
  geo.computeVertexNormals();
  return geo;
}

export function buildThyroid() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1717);

  // Airway: thyroid cartilage (the Adam's apple), cricoid ring, and the windpipe's C-shaped rings.
  const cart = M(0xd9dcc8, { roughness: 0.5, tissue: 'cartilage' });
  for (const s of [-1, 1]) {
    const plate = new THREE.Shape();
    plate.moveTo(0, 0);
    plate.lineTo(24, 2);
    plate.lineTo(24, 30);
    plate.quadraticCurveTo(12, 26, 0, 33);
    plate.closePath();
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(plate, { depth: 1.6, bevelEnabled: false }), cart);
    m.position.set(0, 22, 12);
    m.rotation.y = s === 1 ? 0.85 : Math.PI - 0.85; // the two plates meet at the front at roughly a right angle
    root.add(pick(m, 'larynx', 'Thyroid cartilage (the Adam’s apple), part of the larynx'));
  }
  const cricoid = new THREE.Mesh(new THREE.CylinderGeometry(TRACHEA_R + 1.2, TRACHEA_R + 1.2, 7, 40, 1, true), cart);
  cricoid.position.y = 14;
  root.add(pick(cricoid, 'larynx', 'Cricoid cartilage (a full ring at the base of the larynx)'));
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(TRACHEA_R - 0.4, TRACHEA_R - 0.4, 70, 40, 1, true), M(0xe6b2a8, { roughness: 0.55, side: THREE.DoubleSide }));
  wall.position.y = -24;
  root.add(pick(wall, 'trachea', 'Windpipe (trachea)'));
  for (let n = 1; n <= 15; n++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(TRACHEA_R, 1.25, 8, 40, Math.PI * 1.65), cart);
    ring.rotation.x = Math.PI / 2;
    ring.rotation.z = -Math.PI * 0.325; // the open part of the C faces backward
    ring.position.y = ringY(n);
    root.add(pick(ring, 'trachea', n === 2 || n === 3 ? `Tracheal ring ${n} (the isthmus crosses here)` : 'Cartilage ring of the windpipe (open at the back)'));
  }
  const esophagus = ellipsoid([0, -25, -15], [8, 38, 4.5], M(0xd88a86, { roughness: 0.55, tissue: 'organ', natural: 0xc97d79 }), 28);
  root.add(pick(esophagus, 'trachea', 'Esophagus (behind the windpipe)'));

  // Thyroid lobes: the viewer's left one whole, the right one opened from the front.
  const thyroidMat = M(0xb8534e, { roughness: 0.42, tissue: 'organ', natural: 0xa94a46, side: THREE.DoubleSide });
  root.add(pick(new THREE.Mesh(lobeGeometry(-1, false), thyroidMat), 'thyroid-gland', 'Right lobe of the thyroid'));
  root.add(pick(new THREE.Mesh(lobeGeometry(1, true), thyroidMat), 'thyroid-gland', 'Left lobe of the thyroid (cut open)'));
  // Cut face: the lobe's outline at its centre plane, packed with follicles.
  const N = 90;
  const outline = new THREE.Shape();
  const right = [];
  const left = [];
  for (let i = 0; i <= N; i++) {
    const t = -1 + (2 * i) / N;
    const L = lobeAt(t, 1);
    right.push([L.x + L.hx, L.y]);
    left.push([L.x - L.hx, L.y]);
  }
  const ring = [...right, ...left.reverse()];
  outline.moveTo(...ring[0]);
  for (const q of ring.slice(1)) outline.lineTo(...q);
  const cutZ = LOBE.z;
  const face = new THREE.Mesh(new THREE.ShapeGeometry(outline, 4), M(0x9c3f42, { roughness: 0.6, tissue: 'organ', natural: 0x8f3a3d, repeat: [0.06, 0.06] }));
  face.position.z = cutZ + 0.05;
  root.add(pick(face, 'thyroid-gland', 'Cut surface of the thyroid'));
  const inside = (x, y) => {
    const t = (2 * (y - LOBE.yCenter)) / LOBE.height;
    if (Math.abs(t) > 0.97) return false;
    const L = lobeAt(t, 1);
    return Math.abs(x - L.x) < L.hx - 0.6;
  };
  const follicles = [];
  for (let tries = 0; tries < 6000 && follicles.length < 420; tries++) {
    const x = LOBE.x - LOBE.rx * 1.3 + rand() * LOBE.rx * 2.8;
    const y = LOBE.yCenter - LOBE.height / 2 + rand() * LOBE.height;
    const r = 0.35 + rand() ** 2 * 0.95;
    if (!inside(x, y)) continue;
    if (follicles.some((f) => Math.hypot(f[0] - x, f[1] - y) < f[2] + r + 0.12)) continue;
    follicles.push([x, y, r]);
  }
  const disc = new THREE.CircleGeometry(1, 20);
  const colloid = new THREE.InstancedMesh(disc, M(0xf0a6b8, { roughness: 0.35, emissive: 0xf0a6b8, emissiveIntensity: 0.12 }), follicles.length);
  const rim = new THREE.InstancedMesh(disc, M(0x7a2e3c, { roughness: 0.6 }), follicles.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  follicles.forEach(([x, y, r], i) => {
    m4.compose(new THREE.Vector3(x, y, cutZ + 0.12), q, new THREE.Vector3(r + 0.16, r + 0.16, 1));
    rim.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(x, y, cutZ + 0.16), q, new THREE.Vector3(r, r, 1));
    colloid.setMatrixAt(i, m4);
  });
  root.add(pick(rim, 'thyroid-follicle', 'Follicle wall (a ring of hormone-making cells)'));
  root.add(pick(colloid, 'thyroid-follicle', 'Thyroid follicle, full of colloid (drawn larger than life)'));

  // Isthmus across rings 2 and 3.
  const iy = (ringY(2) + ringY(3)) / 2;
  const R = TRACHEA_R + 2.6;
  const isth = tubeThrough(
    [[-14.5, iy, LOBE.z], ...[-9, -4.5, 0, 4.5, 9].map((x) => [x, iy, Math.sqrt(R * R - x * x)]), [14.5, iy, LOBE.z]],
    2.2,
    thyroidMat,
    40,
    12,
  );
  isth.scale.y = 2.3; // a flat band about 1 cm tall
  isth.position.y = iy * (1 - 2.3);
  root.add(pick(isth, 'thyroid-gland', 'Isthmus (joins the lobes across tracheal rings 2 and 3)'));

  // Parathyroid glands on the back of each lobe.
  const paraMat = M(0xd9a35a, { roughness: 0.5, tissue: 'organ', natural: 0xc99550 });
  for (const s of [-1, 1]) {
    for (const t of [0.5, -0.55]) {
      const L = lobeAt(t, s);
      root.add(pick(ellipsoid([L.x + s * 2, L.y, L.z - L.hz + 0.8], [2.6, 3.2, 2], paraMat, 14), 'parathyroid-gland', 'Parathyroid gland (on the back of the thyroid)'));
    }
  }

  // Vessels.
  const art = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' });
  const vein = M(COLORS.vein, { roughness: 0.45, tissue: 'vein' });
  for (const s of [-1, 1]) {
    root.add(pick(tubeThrough([[s * 30, -62, -6], [s * 30, 0, -5], [s * 31, 30, -4], [s * 32, 54, -3]], 3.6, art, 32, 12), 'carotid-artery', 'Common carotid artery'));
    root.add(pick(tubeThrough([[s * 40, -62, -1], [s * 40, 0, 0], [s * 41, 54, 1]], 5, vein, 24, 12), 'carotid-artery', 'Internal jugular vein'));
    const top = lobeAt(0.95, s);
    root.add(pick(tubeThrough([[s * 31, 54, -3], [s * 26, 48, 1], [s * 20, 40, 4], [top.x, top.y + 1, top.z]], 1.3, art, 32, 8), 'thyroid-gland', 'Superior thyroid artery (from the external carotid)'));
    const low = lobeAt(-0.55, s);
    root.add(pick(tubeThrough([[s * 36, -66, -8], [s * 38, -40, -10], [s * 33, -24, -9], [low.x + s * 3, low.y, low.z - low.hz + 1]], 1.3, art, 32, 8), 'thyroid-gland', 'Inferior thyroid artery (from the thyrocervical trunk)'));
    root.add(pick(tubeThrough([[top.x + s * 2, top.y - 3, top.z + 2], [s * 30, 34, 4], [s * 38, 30, 2]], 1.1, vein, 24, 6), 'thyroid-gland', 'Superior thyroid vein'));
    root.add(pick(tubeThrough([[s * 4, iy - 6, 12], [s * 3, -40, 11], [s * 2, -64, 9]], 1.2, vein, 24, 6), 'thyroid-gland', 'Inferior thyroid vein'));
  }

  const focusFollicle = follicles.reduce((best, f) => (Math.hypot(f[0] - LOBE.x, f[1] - LOBE.yCenter) < Math.hypot(best[0] - LOBE.x, best[1] - LOBE.yCenter) ? f : best), follicles[0]);
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    view: { target: [0, 2, 0], direction: [0.18, 0.06, 1] },
    focus: [focusFollicle[0], focusFollicle[1], cutZ + 0.2],
    dispose() {
      disc.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
