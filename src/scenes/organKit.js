// Shared helpers for the organ close-ups built from the measured body bundle
// (brainMeasured.js, lungsMeasured.js, pancreasMeasured.js, liverMeasured.js):
// finding parts, moving them from body meters into an organ scene's units,
// and asking whether a point is inside a part.
import * as THREE from 'three/webgpu';

/** The bundle's parts that match fn, or [] when the bundle is not loaded. */
export const partsWhere = (parts, fn) => parts?.filter(fn) ?? [];
/** The first part with this card (and label, if given). */
export const partOf = (parts, card, label) => partsWhere(parts, (p) => p.extras.card === card && (!label || (label instanceof RegExp ? label.test(p.extras.label) : p.extras.label === label)))[0];

/**
 * A frame for one organ scene: a group that holds measured parts (in body
 * meters) and shows them in scene units around `center`, plus toScene() for
 * turning other body points into scene coordinates.
 */
export function organFrame(center, unitsPerMeter) {
  const c = new THREE.Vector3(...center);
  const group = new THREE.Group();
  group.scale.setScalar(unitsPerMeter);
  group.position.copy(c).multiplyScalar(-unitsPerMeter);
  const toScene = (p) => (p.isVector3 ? p.clone() : new THREE.Vector3(...p)).sub(c).multiplyScalar(unitsPerMeter).toArray();
  return { group, toScene, unitsPerMeter };
}

const solid = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const ray = new THREE.Raycaster();
const across = new THREE.Vector3(1, 0.0007, 0.0003).normalize();

/** A mesh for inside tests on a part's geometry (body meters). */
export function insideTester(geometry) {
  const mesh = new THREE.Mesh(geometry, solid);
  mesh.updateMatrixWorld();
  return (p) => {
    ray.set(p, across);
    return ray.intersectObject(mesh, false).length % 2 === 1;
  };
}

/** n random points inside a part (body meters), from a seeded rand(). */
export function pointsInside(geometry, n, rand) {
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  const inside = insideTester(geometry);
  const out = [];
  for (let tries = 0; out.length < n && tries < n * 40; tries++) {
    const p = new THREE.Vector3(
      box.min.x + rand() * (box.max.x - box.min.x),
      box.min.y + rand() * (box.max.y - box.min.y),
      box.min.z + rand() * (box.max.z - box.min.z),
    );
    if (inside(p)) out.push(p);
  }
  return out;
}

/** The vertex of a part nearest a point (both body meters), as [x, y, z]. */
export function nearestVertex(geometry, p) {
  const a = geometry.attributes.position.array;
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < a.length; i += 3) {
    const d = (a[i] - p[0]) ** 2 + (a[i + 1] - p[1]) ** 2 + (a[i + 2] - p[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return [a[best], a[best + 1], a[best + 2]];
}

/**
 * A copy of an indexed part geometry with everything in front of a plane cut
 * away: triangles are kept where (p − point)·normal ≤ 0, and triangles the
 * plane crosses are trimmed along it. Position, normal and uv carry over.
 */
export function cutAway(geometry, point, normal) {
  const names = ['position', 'normal', 'uv'].filter((n) => geometry.attributes[n]);
  const src = names.map((n) => geometry.attributes[n]);
  const idx = geometry.index ? geometry.index.array : Array.from({ length: geometry.attributes.position.count }, (_, i) => i);
  const pos = geometry.attributes.position.array;
  const side = (i) => (pos[i * 3] - point[0]) * normal[0] + (pos[i * 3 + 1] - point[1]) * normal[1] + (pos[i * 3 + 2] - point[2]) * normal[2];
  const out = names.map(() => []);
  // A vertex is [index a, index b, t]: the point a + t(b − a).
  const emit = (v) => src.forEach((attr, k) => {
    for (let c = 0; c < attr.itemSize; c++) {
      const a = attr.array[v[0] * attr.itemSize + c];
      out[k].push(a + (attr.array[v[1] * attr.itemSize + c] - a) * v[2]);
    }
  });
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    const d = tri.map(side);
    if (d.every((x) => x <= 0)) {
      tri.forEach((i) => emit([i, i, 0]));
      continue;
    }
    if (d.every((x) => x > 0)) continue;
    // Clip the triangle to the kept side (Sutherland–Hodgman against one plane).
    const poly = [];
    for (let k = 0; k < 3; k++) {
      const [i, j] = [tri[k], tri[(k + 1) % 3]];
      const [di, dj] = [d[k], d[(k + 1) % 3]];
      if (di <= 0) poly.push([i, i, 0]);
      if ((di <= 0) !== (dj <= 0)) poly.push([i, j, di / (di - dj)]);
    }
    for (let k = 1; k + 1 < poly.length; k++) [poly[0], poly[k], poly[k + 1]].forEach(emit);
  }
  const g = new THREE.BufferGeometry();
  names.forEach((n, k) => g.setAttribute(n, new THREE.Float32BufferAttribute(out[k], src[k].itemSize)));
  g.computeBoundingBox();
  return g;
}

/** A copy of an indexed part geometry keeping only the triangles within radius of center. */
export function keepNear(geometry, center, radius) {
  const pos = geometry.attributes.position.array;
  const idx = geometry.index.array;
  const r2 = radius * radius;
  const near = (i) => (pos[i * 3] - center[0]) ** 2 + (pos[i * 3 + 1] - center[1]) ** 2 + (pos[i * 3 + 2] - center[2]) ** 2 <= r2;
  const kept = [];
  for (let t = 0; t < idx.length; t += 3) if (near(idx[t]) && near(idx[t + 1]) && near(idx[t + 2])) kept.push(idx[t], idx[t + 1], idx[t + 2]);
  const g = new THREE.BufferGeometry();
  for (const [n, a] of Object.entries(geometry.attributes)) g.setAttribute(n, a.clone()); // copied: the part's own are shared
  g.setIndex(kept);
  g.computeBoundingBox();
  return g;
}
