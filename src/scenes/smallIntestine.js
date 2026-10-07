// Tier 3: a 7 cm length of small intestine (jejunum), cut open. 1 scene unit = 1 mm.
// The tube is about 2.5 cm across. A window is cut out of its front so the
// inside shows: circular folds (plicae circulares) covered in a velvet of
// villi. At the cut edge the wall's four layers step back one by one:
// mucosa, submucosa, muscle (circular, then longitudinal) and serosa. Behind,
// the mesentery carries arteries, veins and lymph vessels to the wall in
// arching loops (arcades). Villi are drawn a little larger and far fewer than
// the tens of thousands that would cover a piece this size.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, seeded, disposeTree, COLORS } from './kit.js';

export const INTESTINE_RADIUS_MM = 12.7; // 2.54 cm across
const HALF_LEN = 35;
const FOLD_SPACING = 6.5;
const FOLD_DEPTH = 4.2; // how far a circular fold reaches into the tube, mm
const MUCOSA_R = 10.6;
const WINDOW_CENTER = Math.atan2(0.78, 1); // faces the default camera (x = r·sin θ, z = r·cos θ)

/** Inner (mucosal) radius at position y along the tube: the wall minus the circular folds. */
export function mucosaRadius(y) {
  const phase = ((y % FOLD_SPACING) + FOLD_SPACING) % FOLD_SPACING - FOLD_SPACING / 2;
  const ridge = Math.exp(-((phase / 0.95) ** 2));
  return MUCOSA_R - FOLD_DEPTH * ridge;
}

/** A layer of the wall: a curved slab between two radii, missing a window of half-width `cut`. */
function wallLayer(rInner, rOuter, cut, material) {
  // Inset each face slightly so neighbouring layers never share a surface (no flicker).
  const rIn = rInner + 0.05;
  const rOut = rOuter - 0.05;
  const start = WINDOW_CENTER + cut;
  const len = Math.PI * 2 - 2 * cut;
  const group = new THREE.Group();
  const outer = new THREE.CylinderGeometry(rOut, rOut, HALF_LEN * 2, 72, 1, true, start, len);
  const inner = new THREE.CylinderGeometry(rIn, rIn, HALF_LEN * 2, 72, 1, true, start, len);
  group.add(new THREE.Mesh(outer, material), new THREE.Mesh(inner, material));
  // Faces at the two cut edges and the two ends show the layer's thickness.
  for (const th of [start, start + len]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(rOut - rIn, HALF_LEN * 2), material);
    const rMid = (rIn + rOut) / 2;
    edge.position.set(rMid * Math.sin(th), 0, rMid * Math.cos(th));
    edge.rotation.y = th + Math.PI / 2;
    group.add(edge);
  }
  for (const y of [-HALF_LEN, HALF_LEN]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 72, 1, start - Math.PI / 2, len), material);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = y;
    group.add(ring);
  }
  return group;
}

export function buildSmallIntestine() {
  const M = materialBank();
  const root = new THREE.Group();
  const tube = new THREE.Group();
  tube.rotation.z = Math.PI / 2; // run the tube left to right
  root.add(tube);
  const rand = seeded(2304);
  const two = { side: THREE.DoubleSide };

  // Wall layers, outermost cut back furthest so each one shows at the edge.
  // The thin sheets are left untextured: fine fiber textures shimmer at grazing angles.
  const layers = [
    [12.4, INTESTINE_RADIUS_MM, 1.32, M(0xf2e3d8, { roughness: 0.35, ...two }), 'gut-wall', 'Serosa (smooth outer covering)'],
    [11.9, 12.4, 1.24, M(0xc4566a, { roughness: 0.55, tissue: 'muscle', repeat: [1, 6], ...two }), 'gut-wall', 'Muscle layer, running lengthwise'],
    [11.2, 11.9, 1.16, M(0xb04a60, { roughness: 0.55, tissue: 'muscle', repeat: [6, 1], ...two }), 'gut-wall', 'Muscle layer, running around'],
    [MUCOSA_R + 0.3, 11.2, 1.08, M(0xf1d2c4, { roughness: 0.6, ...two }), 'gut-wall', 'Submucosa (blood vessels and connective tissue)'],
  ];
  for (const [rIn, rOut, cut, mat, card, label] of layers) {
    const layer = wallLayer(rIn, rOut, cut, mat);
    layer.traverse((o) => o.isMesh && pick(o, card, label));
    tube.add(layer);
  }

  // Mucosa: one surface following the circular folds.
  const mucosaMat = M(0xe39aa0, { roughness: 0.5, tissue: 'organ', natural: 0xe0938e, repeat: [8, 4], ...two });
  const prof = [];
  for (let y = -HALF_LEN; y <= HALF_LEN + 1e-6; y += 0.25) prof.push(new THREE.Vector2(mucosaRadius(y), y));
  const start = WINDOW_CENTER + 1.0;
  const len = Math.PI * 2 - 2.0;
  const mucosa = new THREE.Mesh(new THREE.LatheGeometry(prof, 96, start, len), mucosaMat);
  tube.add(pick(mucosa, 'circular-folds', 'Circular fold (plica circularis)'));

  // Villi: a velvet of tiny fingers over every surface of the mucosa.
  const villusGeo = new THREE.CapsuleGeometry(0.16, 0.5, 3, 6).translate(0, 0.4, 0);
  const COUNT = 9000;
  const villi = new THREE.InstancedMesh(villusGeo, M(0xf0a9ad, { roughness: 0.5 }), COUNT);
  const m4 = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const q = new THREE.Quaternion();
  let placed = 0;
  for (let tries = 0; tries < COUNT * 3 && placed < COUNT; tries++) {
    const y = (rand() * 2 - 1) * (HALF_LEN - 0.5);
    const th = start + rand() * len;
    const r = mucosaRadius(y);
    // Surface normal of the lathe, pointing into the tube.
    const dr = (mucosaRadius(y + 0.05) - mucosaRadius(y - 0.05)) / 0.1;
    const radial = new THREE.Vector3(Math.sin(th), 0, Math.cos(th));
    const n = radial.clone().multiplyScalar(-1).add(new THREE.Vector3(0, dr, 0)).normalize();
    q.setFromUnitVectors(up, n);
    const s = 0.75 + rand() * 0.45;
    m4.compose(radial.multiplyScalar(r).setY(y), q, new THREE.Vector3(s, s, s));
    villi.setMatrixAt(placed++, m4);
  }
  villi.count = placed;
  tube.add(pick(villi, 'intestinal-villus', 'Villi (each about a millimeter tall)'));

  // Mesentery behind the tube, with vessels in arcades and straight branches to the wall.
  const mesMat = M(0xf3dfc0, { roughness: 0.4, transparent: true, opacity: 0.45, depthWrite: false, ...two });
  const mesentery = new THREE.Mesh(new THREE.PlaneGeometry(30, HALF_LEN * 2), mesMat);
  mesentery.rotation.y = Math.PI / 2;
  mesentery.position.set(0, 0, -INTESTINE_RADIUS_MM - 15);
  mesentery.userData.pickPriority = -1;
  tube.add(pick(mesentery, 'mesentery', 'Mesentery (the sheet that holds the intestine)'));
  const art = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' });
  const vein = M(COLORS.vein, { roughness: 0.4, tissue: 'vein' });
  const lymph = M(COLORS.lymph, { roughness: 0.4, transparent: true, opacity: 0.85 });
  const fat = M(0xf0d58c, { roughness: 0.35 });
  const arcadeZ = -INTESTINE_RADIUS_MM - 9;
  for (const [mat, dz, dy, r, label] of [[art, 0, 0, 0.55, 'Artery (arcades and straight branches)'], [vein, -1.3, 0.8, 0.65, 'Vein (carries absorbed sugar toward the liver)'], [lymph, 1.2, -0.7, 0.35, 'Lymph vessel (carries absorbed fat)']]) {
    const arches = [];
    for (let k = -3; k <= 3; k++) {
      const yc = k * 10 + dy;
      arches.push([0, yc - 5, arcadeZ - 6 + dz], [0, yc, arcadeZ + dz], [0, yc + 5, arcadeZ - 6 + dz]);
    }
    tube.add(pick(tubeThrough(arches, r, mat, 220, 8), mat === lymph ? 'lacteal' : 'mesentery', label));
    for (let k = -7; k <= 7; k++) {
      const y = k * 4.6 + dy * 0.6;
      tube.add(pick(tubeThrough([[0, y, arcadeZ + dz + 0.4], [0, y + 0.3, -INTESTINE_RADIUS_MM - 3], [0, y + 0.2, -INTESTINE_RADIUS_MM + 0.2]], r * 0.55, mat, 12, 6), mat === lymph ? 'lacteal' : 'mesentery', label));
    }
  }
  for (let i = 0; i < 40; i++) {
    const blob = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), fat);
    blob.position.set((rand() - 0.5) * 3, (rand() * 2 - 1) * HALF_LEN * 0.95, -INTESTINE_RADIUS_MM - 8 - rand() * 18);
    blob.scale.set(0.8 + rand() * 1.4, 0.8 + rand() * 1.6, 0.8 + rand() * 1.4);
    blob.userData.pickPriority = -1;
    tube.add(pick(blob, 'mesentery', 'Fat in the mesentery'));
  }

  // Focus: a fold crest near the middle of the window.
  const fr = mucosaRadius(0) + 0.6;
  const local = new THREE.Vector3(Math.sin(WINDOW_CENTER) * fr, 0, Math.cos(WINDOW_CENTER) * fr);
  root.updateMatrixWorld(true);
  const focus = local.applyMatrix4(tube.matrixWorld).toArray();
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    frameWidth: 0.1,
    view: { target: [0, 1, -6], direction: [0.18, 0.78, 1] },
    focus,
    dispose() {
      villusGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
