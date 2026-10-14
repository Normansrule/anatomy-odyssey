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

/**
 * Where a plane cuts a closed part: the outlines of the cut, as loops of
 * [x, y, z] points (largest first). Pairs with cutAway() to cap the cut.
 */
export function sectionLoops(geometry, point, normal) {
  const pos = geometry.attributes.position.array;
  const idx = geometry.index.array;
  const d = new Float64Array(pos.length / 3);
  for (let i = 0; i < d.length; i++) {
    // Nudge vertices lying exactly on the plane, so every crossing is on an edge.
    d[i] = (pos[i * 3] - point[0]) * normal[0] + (pos[i * 3 + 1] - point[1]) * normal[1] + (pos[i * 3 + 2] - point[2]) * normal[2] || 1e-12;
  }
  const key = (a, b) => (a < b ? `${a},${b}` : `${b},${a}`);
  const at = (a, b) => {
    const t = d[a] / (d[a] - d[b]);
    return [0, 1, 2].map((k) => pos[a * 3 + k] + (pos[b * 3 + k] - pos[a * 3 + k]) * t);
  };
  // Each crossed triangle joins the two crossed edges; chain them edge to edge.
  const next = new Map();
  const where = new Map();
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    const crossed = [];
    for (let k = 0; k < 3; k++) {
      const [a, b] = [tri[k], tri[(k + 1) % 3]];
      if (d[a] > 0 !== d[b] > 0) crossed.push([a, b]);
    }
    if (crossed.length !== 2) continue;
    const [e0, e1] = crossed.map(([a, b]) => key(a, b));
    for (const [e, [a, b]] of [[e0, crossed[0]], [e1, crossed[1]]]) if (!where.has(e)) where.set(e, at(a, b));
    if (!next.has(e0)) next.set(e0, []);
    if (!next.has(e1)) next.set(e1, []);
    next.get(e0).push(e1);
    next.get(e1).push(e0);
  }
  const seen = new Set();
  const loops = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue;
    const loop = [];
    let prev = null;
    let cur = start;
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      loop.push(where.get(cur));
      const n = next.get(cur).find((e) => e !== prev && !seen.has(e));
      prev = cur;
      cur = n;
    }
    if (loop.length > 2) loops.push(loop);
  }
  return loops.sort((a, b) => b.length - a.length);
}

/**
 * A part's own axes from its vertices: its center, its long axis (pointing
 * up), its broad face's normal (pointing to the front) and the axis across
 * it (lateral × long = normal; toward the body's left for upright parts).
 */
export function partAxes(geometry) {
  const a = geometry.attributes.position.array;
  const n = a.length / 3;
  const c = [0, 0, 0];
  for (let i = 0; i < a.length; i++) c[i % 3] += a[i] / n;
  const cov = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let i = 0; i < a.length; i += 3) {
    const d = [a[i] - c[0], a[i + 1] - c[1], a[i + 2] - c[2]];
    for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) cov[r][k] += (d[r] * d[k]) / n;
  }
  // Power iteration for the longest axis, then for the longest axis across it.
  const largest = (m, not) => {
    let v = [0.3, 1, 0.2];
    for (let it = 0; it < 60; it++) {
      v = [0, 1, 2].map((r) => m[r][0] * v[0] + m[r][1] * v[1] + m[r][2] * v[2]);
      if (not) {
        const k = v[0] * not[0] + v[1] * not[1] + v[2] * not[2];
        v = v.map((x, i) => x - k * not[i]);
      }
      const len = Math.hypot(...v);
      v = v.map((x) => x / len);
    }
    return v;
  };
  let long = largest(cov);
  if (long[1] < 0) long = long.map((x) => -x);
  const wide = largest(cov, long);
  let normal = new THREE.Vector3(...long).cross(new THREE.Vector3(...wide)).normalize().toArray();
  if (normal[2] < 0) normal = normal.map((x) => -x);
  const lateral = new THREE.Vector3(...long).cross(new THREE.Vector3(...normal)).toArray(); // so lateral × long = normal
  return { center: c, long, lateral, normal };
}
