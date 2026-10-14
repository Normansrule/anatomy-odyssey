// Tier 3: the left kidney, measured and cut in half lengthwise. The kidney,
// adrenal gland, renal artery and vein and ureter of one real adult
// (BodyParts3D, from the whole-body bundle): 1 scene unit = 1 mm, seen from
// the front.
//
// The kidney is cut along its own broad plane (the plane through its length
// and width, found from the mesh) and the front half taken away; the cut
// face is the real outline. The atlas has the kidney's outside only, so the
// inside of the cut face (cortex, pyramids, calyces, pelvis, the arteries
// between the pyramids) is kidney.js's drawing, stretched to fit the real
// outline.
import * as THREE from 'three/webgpu';
import { materialBank, pick, disposeTree, COLORS } from './kit.js';
import { drawKidneyInside, kidneyPoint, KIDNEY_MM, CORTEX } from './kidney.js';
import { organFrame, partOf, cutAway, keepNear, sectionLoops, partAxes } from './organKit.js';

/** Build the measured kidney scene, or null when the bundle is not loaded. */
export function buildMeasuredKidney(parts) {
  const kidney = partOf(parts, 'kidney', 'Left kidney');
  if (!kidney) return null;
  const M = materialBank();
  const root = new THREE.Group();
  const { center, long, lateral, normal } = partAxes(kidney.geometry);
  const { group } = organFrame(center, 1000);
  root.add(group);
  const cut = (geometry) => cutAway(geometry, center, normal);
  const add = (geometry, material, card, label) => group.add(pick(new THREE.Mesh(geometry, material), card, label));

  // The back half of the kidney, its capsule.
  add(cut(kidney.geometry), M(0x9c4a4a, { roughness: 0.38, tissue: 'organ', natural: 0x8e3f3a, side: THREE.DoubleSide, repeat: [1, 1] }), 'kidney', 'Left kidney (its smooth capsule)');
  // Its neighbors, near this kidney.
  const near = (card, label, r) => {
    const p = partOf(parts, card, label);
    return p && keepNear(p.geometry, center, r);
  };
  const adrenal = near('adrenal-gland', 'Adrenal gland (on top of the kidney)', 0.07);
  if (adrenal) add(cut(adrenal), M(0xe0b25a, { roughness: 0.55, tissue: 'organ', natural: 0xd9a64e, side: THREE.DoubleSide, repeat: [1, 1] }), 'adrenal-gland', 'Adrenal gland');
  const artery = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel', side: THREE.DoubleSide, repeat: [1, 1] });
  const vein = M(COLORS.vein, { roughness: 0.4, tissue: 'vein', side: THREE.DoubleSide, repeat: [1, 1] });
  for (const [card, label, r, mat, text] of [
    ['kidney', 'Renal artery', 0.075, artery, 'Renal artery (from the aorta)'],
    ['kidney', 'Renal vein', 0.075, vein, 'Renal vein (to the inferior vena cava)'],
    ['urinary-system', 'Ureter (carries urine to the bladder)', 0.075, M(0xf0e2b8, { roughness: 0.45, side: THREE.DoubleSide }), 'Ureter (to the bladder)'],
  ]) {
    const g = near(card, label, r);
    if (g) add(cut(g), mat, card === 'urinary-system' ? 'renal-pelvis' : 'kidney', text);
  }

  // The cut face: the real outline, in the plane's own coordinates (mm, lateral and up).
  const along = (p) => {
    const d = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
    return [1000 * (d[0] * lateral[0] + d[1] * lateral[1] + d[2] * lateral[2]), 1000 * (d[0] * long[0] + d[1] * long[1] + d[2] * long[2])];
  };
  const outline = sectionLoops(kidney.geometry, center, normal)[0].map(along);
  const us = outline.map((p) => p[0]);
  const vs = outline.map((p) => p[1]);
  const mid = [(Math.min(...us) + Math.max(...us)) / 2, (Math.min(...vs) + Math.max(...vs)) / 2];
  const half = [(Math.max(...us) - Math.min(...us)) / 2, (Math.max(...vs) - Math.min(...vs)) / 2];
  const toFace = (u, v, z = 0) => [0, 1, 2].map((k) => u * lateral[k] + v * long[k] + z * normal[k]);

  const shape = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
  const faceGeo = new THREE.ShapeGeometry(shape);
  bake(faceGeo, (x, y, z) => toFace(x, y, z));
  root.add(pick(new THREE.Mesh(faceGeo, M(...CORTEX)), 'renal-cortex', 'Renal cortex (where the filters are)'));

  // How far the real outline reaches from the middle in a direction (both in units of the half-sizes).
  const ring = outline.map(([u, v]) => [(u - mid[0]) / half[0], (v - mid[1]) / half[1]]);
  const reach = (dx, dy) => {
    let best = Infinity;
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i];
      const [bx, by] = ring[(i + 1) % ring.length];
      const ex = bx - ax;
      const ey = by - ay;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (ax * ey - ay * ex) / den; // along the ray
      const s = (ax * dy - ay * dx) / den; // along the edge
      if (t > 0 && s >= 0 && s <= 1) best = Math.min(best, t);
    }
    return Number.isFinite(best) ? best : 1;
  };
  // kidney.js's drawn frame → the real face: the same direction from the middle,
  // the same share of the way out to the edge. (Sizes are read here, not at
  // load, because kidney.js and this file import each other.)
  const RX = KIDNEY_MM.width / 2;
  const RY = KIDNEY_MM.length / 2;
  const warp = (x, y, z) => {
    const nx = x / RX;
    const ny = y / RY;
    const r = Math.hypot(nx, ny);
    // Near the middle (the pelvis and calyces, out through the hilum) a plain
    // stretch; toward the edge (cortex, pyramid bases, arcuate arteries) the
    // share of the way to the real edge, blended between the two.
    let out = r;
    if (r > 1e-9) {
      const a = Math.atan2(ny, nx);
      const [ex, ey] = kidneyPoint(a);
      const share = r / Math.hypot(ex / RX, ey / RY);
      const k = Math.min(1, Math.max(0, (share - 0.6) / 0.25));
      out = r + k * (share * reach(nx / r, ny / r) - r);
    }
    const [dx, dy] = r > 1e-9 ? [nx / r, ny / r] : [0, 0];
    return toFace(mid[0] + dx * out * half[0], mid[1] + dy * out * half[1], z + 0.3);
  };
  const { group: inside, pyramids } = drawKidneyInside(M);
  inside.updateMatrixWorld(true);
  inside.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
    o.geometry.dispose();
    bake(g, warp);
    o.geometry = g;
    o.position.set(0, 0, 0);
    o.quaternion.identity();
    o.scale.set(1, 1, 1);
  });
  for (const o of [...inside.children]) root.add(o);

  const f = pyramids[3].base[0];
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    frameWidth: 0.16,
    detailed: true,
    view: { target: toFace(mid[0], mid[1]), direction: normal },
    focus: warp(f.x * 0.98, f.y * 0.98, 0.3),
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}

/** Move every vertex of a geometry through fn(x, y, z) → [x, y, z], then refresh its normals. */
function bake(geometry, fn) {
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, ...fn(p.getX(i), p.getY(i), p.getZ(i)));
  p.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
}
