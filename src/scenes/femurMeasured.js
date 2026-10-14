// Tier 3: the left femur, measured and cut open lengthwise. The thigh bone of
// one real adult (BodyParts3D, from the whole-body bundle): 1 scene unit =
// 1 cm, seen from the front.
//
// The bone is cut along its own broad plane (through its length and its
// neck, found from the mesh) and the front half taken away, so the cut face
// has the real outline: head, neck, greater trochanter, shaft and condyles.
// The atlas has the bone's outside only, so the layers on the cut face are
// drawn inside that outline from textbook proportions: a compact wall about
// 6 mm thick along the shaft and thin over the ends, yellow marrow in the
// shaft's cavity, and spongy bone with red marrow in the ends.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, disposeTree, seeded } from './kit.js';
import { organFrame, partsWhere, cutAway, sectionLoops, partAxes } from './organKit.js';

export const CORTEX_MM = { shaft: 6, ends: 1.5 };
// The shaft (diaphysis) spans this share of the bone's length, from the knee end.
export const SHAFT = [0.27, 0.78];

/** Is the 2D point inside the polygon? (even–odd rule) */
function inPolygon(poly, [x, y]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Keep the part of a polygon where v lies between lo and hi (clipped edge by edge). */
function clipBand(poly, lo, hi) {
  const clip = (pts, keep, cross) => {
    const out = [];
    pts.forEach((p, i) => {
      const q = pts[(i + 1) % pts.length];
      if (keep(p)) out.push(p);
      if (keep(p) !== keep(q)) out.push(cross(p, q));
    });
    return out;
  };
  const at = (v) => (p, q) => [p[0] + ((q[0] - p[0]) * (v - p[1])) / (q[1] - p[1]), v];
  return clip(clip(poly, (p) => p[1] >= lo, at(lo)), (p) => p[1] <= hi, at(hi));
}

/** Move each point of a closed outline inward by depth(point) along its normal. */
function inset(poly, depth) {
  const area = poly.reduce((s, p, i) => s + p[0] * poly[(i + 1) % poly.length][1] - poly[(i + 1) % poly.length][0] * p[1], 0);
  const turn = area > 0 ? 1 : -1; // counterclockwise outlines have their inside to the left
  return poly.map((p, i) => {
    const a = poly[(i - 1 + poly.length) % poly.length];
    const b = poly[(i + 1) % poly.length];
    const tx = b[0] - a[0];
    const ty = b[1] - a[1];
    const len = Math.hypot(tx, ty) || 1;
    const d = depth(p);
    return [p[0] - (turn * ty * d) / len, p[1] + (turn * tx * d) / len];
  });
}

/** Build the measured femur scene, or null when the bundle is not loaded. */
export function buildMeasuredFemur(parts) {
  const femur = partsWhere(parts, (p) => p.extras.card === 'femur' && p.geometry.boundingBox.min.x > 0)[0]; // the left one
  if (!femur) return null;
  const M = materialBank();
  const root = new THREE.Group();
  const axes = partAxes(femur.geometry);
  const { long } = axes;
  const pos = femur.geometry.attributes.position.array;
  const nrm = femur.geometry.attributes.normal.array;
  const idx = femur.geometry.index.array;
  const vs = [];
  for (let i = 0; i < pos.length; i += 3) vs.push([pos[i], pos[i + 1], pos[i + 2]]);
  const dotFrom = (o) => (p, axis) => (p[0] - o[0]) * axis[0] + (p[1] - o[1]) * axis[1] + (p[2] - o[2]) * axis[2];
  const mean = (pts) => [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
  const ls = vs.map((p) => dotFrom(axes.center)(p, long));
  const [lMin, lMax] = [Math.min(...ls), Math.max(...ls)];
  // The head: the top end, on the side away from the greater trochanter (toward the body's middle).
  const top = vs.filter((p, i) => ls[i] > lMax - 0.07);
  const sideMin = Math.min(...top.map((p) => dotFrom(axes.center)(p, axes.lateral)));
  const head = mean(top.filter((p) => dotFrom(axes.center)(p, axes.lateral) < sideMin + 0.045));
  // The cut: through the middle of the shaft, containing the bone's length and its head
  // (the bow of the shaft puts the middle of all the vertices behind it).
  const mid = mean(vs.filter((p, i) => Math.abs(ls[i] - (lMin + lMax) / 2) < 0.02));
  const toHead = head.map((x, i) => x - mid[i]);
  let normal = new THREE.Vector3(...long).cross(new THREE.Vector3(...toHead)).normalize().toArray();
  if (normal[2] < 0) normal = normal.map((x) => -x);
  const lateral = new THREE.Vector3(...long).cross(new THREE.Vector3(...normal)).toArray();
  const off = dotFrom(mid)(axes.center, normal);
  const center = axes.center.map((x, i) => x - off * normal[i]); // on the cut plane
  const along = dotFrom(center);
  const { group } = organFrame(center, 100);
  root.add(group);
  const rand = seeded(24475);
  const cut = (g) => cutAway(g, center, normal);
  const bone = M(COLORS.bone, { roughness: 0.5, side: THREE.DoubleSide, tissue: 'bone', repeat: [1, 1] });

  // The back half of the bone.
  group.add(pick(new THREE.Mesh(cut(femur.geometry), bone), 'femur', 'Femur (thigh bone), the longest bone in the body'));

  // Cartilage over the joint surfaces: the head (at the hip) and the condyles (at the knee).
  const joint = (keep, lift) => {
    const out = [];
    const nv = [];
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      if (!tri.every(keep)) continue;
      for (const i of tri) {
        out.push(...[0, 1, 2].map((k) => pos[i * 3 + k] + nrm[i * 3 + k] * lift));
        nv.push(nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2]);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(out, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nv, 3));
    g.setIndex([...Array(out.length / 3).keys()]);
    return cut(g);
  };
  const cartilage = M(COLORS.cartilage, { roughness: 0.25, transparent: true, opacity: 0.75, side: THREE.DoubleSide });
  const nearHead = (i) => Math.hypot(pos[i * 3] - head[0], pos[i * 3 + 1] - head[1], pos[i * 3 + 2] - head[2]) < 0.026;
  group.add(pick(new THREE.Mesh(joint(nearHead, 0.0015), cartilage), 'articular-cartilage', 'Articular cartilage on the femoral head (the ball of the hip joint)'));
  group.add(pick(new THREE.Mesh(joint((i) => ls[i] < lMin + 0.03, 0.0015), cartilage), 'articular-cartilage', 'Articular cartilage on the condyles (the knee joint)'));

  // The cut face, in the plane's own coordinates (cm, lateral and up from the center).
  const [outline] = sectionLoops(femur.geometry, center, normal);
  const face2 = outline.map((p) => [along(p, lateral) * 100, along(p, long) * 100]);
  const toFace = ([u, v], z = 0) => [0, 1, 2].map((k) => u * lateral[k] + v * long[k] + z * normal[k]);
  const length = (lMax - lMin) * 100;
  const shaftLo = lMin * 100 + SHAFT[0] * length;
  const shaftHi = lMin * 100 + SHAFT[1] * length;
  // Cortex: thick along the shaft, tapering to a thin shell over the ends.
  const cortexCm = ([, v]) => {
    const out = v < shaftLo ? shaftLo - v : v > shaftHi ? v - shaftHi : 0;
    return Math.max(CORTEX_MM.ends, CORTEX_MM.shaft - out * 0.9) / 10;
  };
  const inner = inset(face2, cortexCm);
  const cavity = clipBand(inset(face2, (p) => cortexCm(p) + 0.05), shaftLo + 1.5, shaftHi - 1.5);
  const layer = (poly, z, material, card, label) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(poly.map(([u, v]) => new THREE.Vector2(u, v))));
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...toFace([p.getX(i), p.getY(i)], z));
    g.computeVertexNormals();
    const m = pick(new THREE.Mesh(g, material), card, label);
    root.add(m);
    return m;
  };
  layer(face2, 0, M(0xf4ecd9, { roughness: 0.8, side: THREE.DoubleSide, tissue: 'bone', repeat: [6, 6] }), 'compact-bone', 'Compact bone (the hard outer wall, cut)');
  layer(inner, 0.01, M(COLORS.marrowRed, { roughness: 0.85, side: THREE.DoubleSide, tissue: 'marrowRed', repeat: [3, 3] }), 'bone-marrow', 'Red marrow (makes blood cells), in the spongy bone of the ends');
  if (cavity.length > 2) layer(cavity, 0.02, M(COLORS.marrowYellow, { roughness: 0.9, side: THREE.DoubleSide, tissue: 'marrowYellow', repeat: [2, 8] }), 'bone-marrow', 'Yellow marrow (mostly fat), filling the shaft’s cavity');

  // Spongy bone: a lattice of struts (trabeculae) in the ends, drawn on the cut face.
  const strut = new THREE.CylinderGeometry(0.03, 0.03, 1, 5);
  const struts = new THREE.InstancedMesh(strut, M(COLORS.bone, { roughness: 0.7, tissue: 'bone' }), 900);
  const us = inner.map((p) => p[0]);
  const vsIn = inner.map((p) => p[1]);
  const box = [Math.min(...us), Math.max(...us), Math.min(...vsIn), Math.max(...vsIn)];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  let n = 0;
  for (let tries = 0; n < 900 && tries < 20000; tries++) {
    const p = [box[0] + rand() * (box[1] - box[0]), box[2] + rand() * (box[3] - box[2])];
    if ((p[1] > shaftLo && p[1] < shaftHi) || !inPolygon(inner, p)) continue;
    const a = rand() * Math.PI;
    const dir = new THREE.Vector3(...toFace([Math.cos(a), Math.sin(a)])).normalize();
    m4.compose(new THREE.Vector3(...toFace(p, 0.04)), q.setFromUnitVectors(up, dir), new THREE.Vector3(1, 0.3 + rand() * 0.4, 1));
    struts.setMatrixAt(n++, m4);
  }
  struts.count = n;
  root.add(pick(struts, 'spongy-bone', 'Spongy bone (a lattice of struts, with red marrow between)'));

  // Focus: the middle of the compact wall on the lateral side, halfway up the shaft.
  const vMid = (shaftLo + shaftHi) / 2;
  const edge = face2.filter(([u, v]) => Math.abs(v - vMid) < 1.5).reduce((best, p) => (p[0] > best[0] ? p : best), [-Infinity, vMid]);
  const focus = toFace([edge[0] - CORTEX_MM.shaft / 20, vMid], 0.05);

  return {
    root,
    fit: 'both',
    metersPerUnit: 0.01,
    frameWidth: 0.55,
    detailed: true,
    view: { target: [0, 0, 0], direction: normal.map((x, i) => x + lateral[i] * 0.15) },
    focus,
    dispose() {
      strut.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
