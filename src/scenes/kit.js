// Palette and geometry helpers shared by every scene builder.
// Colors borrow from histology stains: hematoxylin (violet, nuclei),
// eosin (pink, cytoplasm and matrix), plus ivory bone and conventional
// red/blue for arteries/veins.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tissueMaterial } from '../engine/textures/surfaces.js';

export const COLORS = {
  bone: 0xe9dfc8,
  boneShade: 0xcdbf9f,
  cartilage: 0xbfd6e8,
  marrowRed: 0xb8435a,
  marrowYellow: 0xe8c97a,
  muscle: 0xd65a6e,
  artery: 0xd9434f,
  vein: 0x5c6bd6,
  nerve: 0xe8c45a,
  lung: 0xe9a0b4,
  lymph: 0x7cc49a,
  skin: 0xb9b1e6,
  hematoxylin: 0x6d5bd0,
  hemaDeep: 0x3d2f8c,
  eosin: 0xf08baf,
  eosinPale: 0xf6c3d4,
  matrix: 0xe7dcc9,
  baseA: 0xf0b23e,
  baseT: 0xe35d6a,
  baseG: 0x4fb38a,
  baseC: 0x5a8deb,
};

/**
 * A per-scene material bank: mat(color, opts) returns one shared standard
 * material per unique option set; mat.dispose() frees them with the scene.
 * Each scene gets its own bank so fading one scene never touches another.
 */
export function materialBank() {
  const cache = new Map();
  // Textures are keyed by id; they are swapped out before JSON.stringify,
  // which would otherwise call Texture.toJSON and serialize the pixels.
  const keyOf = (parts) =>
    JSON.stringify(
      parts.map((p) =>
        p && typeof p === 'object'
          ? Object.fromEntries(Object.entries(p).map(([k, v]) => [k, v?.isTexture ? `texture:${v.uuid}` : v]))
          : p,
      ),
    );
  // opts.tissue (see src/engine/textures/tissues.js) asks for a textured,
  // physically based tissue surface; everything else is a plain standard material.
  const mat = (color, opts = {}) => {
    const key = keyOf([color, opts]);
    if (!cache.has(key)) {
      cache.set(key, opts.tissue ? tissueMaterial(color, opts) : new THREE.MeshStandardMaterial({ color, roughness: 0.62, metalness: 0.0, ...opts }));
    }
    return cache.get(key);
  };
  mat.basic = (color, opts = {}) => {
    const key = keyOf(['basic', color, opts]);
    if (!cache.has(key)) cache.set(key, new THREE.MeshBasicMaterial({ color, ...opts }));
    return cache.get(key);
  };
  mat.line = (color, opts = {}) => {
    const key = keyOf(['line', color, opts]);
    if (!cache.has(key)) cache.set(key, new THREE.LineBasicMaterial({ color, ...opts }));
    return cache.get(key);
  };
  mat.dispose = () => {
    for (const m of cache.values()) m.dispose();
    cache.clear();
  };
  return mat;
}

/** Mark a mesh as clickable, opening card `cardId`. */
export function pick(obj, cardId, label) {
  obj.userData.cardId = cardId;
  if (label) obj.userData.label = label;
  return obj;
}

const _up = new THREE.Vector3(0, 1, 0);
/** A capsule running from point a to point b. */
export function capsuleBetween(a, b, radius, material, radial = 12) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const geo = new THREE.CapsuleGeometry(radius, Math.max(0.0001, len - 2 * radius), 6, radial);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_up, dir.normalize());
  return mesh;
}

/** A cylinder running from a to b with separate end radii. */
export function cylinderBetween(a, b, rTop, rBottom, material, radial = 12, openEnded = false) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const geo = new THREE.CylinderGeometry(rTop, rBottom, dir.length(), radial, 1, openEnded);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(_up, dir.normalize());
  return mesh;
}

/** A smooth tube through a list of [x, y, z] points. */
export function tubeThrough(points, radius, material, segments = 64, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, radial, false), material);
}

/** An ellipsoid centred at `at` with radii [rx, ry, rz]. */
export function ellipsoid(at, radii, material, seg = 24) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)), material);
  mesh.position.set(...at);
  mesh.scale.set(...radii);
  return mesh;
}

/** Deterministic pseudo-random numbers so scenes look identical on every load. */
export function seeded(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Evenly spread n points on a unit sphere (Fibonacci lattice). */
export function fibonacciSphere(n) {
  const pts = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    pts.push(new THREE.Vector3(Math.cos(th) * r, y, Math.sin(th) * r));
  }
  return pts;
}

/** Dispose every geometry below `root`. Materials are shared and cleared separately. */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
  });
}

/**
 * A lathe (surface of revolution) running from point a to point b.
 * profile: [[t, r], …] with t from 0 (at a) to 1 (at b) and r the radius there;
 * squash scales the cross-section ([sideways, front-to-back]) for oval limbs.
 */
export function latheBetween(a, b, profile, material, { segments = 24, squash = [1, 1], twist = 0 } = {}) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const len = va.distanceTo(vb);
  const pts = profile.map(([t, r]) => new THREE.Vector2(Math.max(0.00001, r), t * len));
  const geo = new THREE.LatheGeometry(pts, segments);
  geo.scale(squash[0], 1, squash[1]);
  if (twist) geo.rotateY(twist);
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.copy(va);
  mesh.quaternion.setFromUnitVectors(_up, vb.clone().sub(va).normalize());
  return mesh;
}

/** A long bone: a slim shaft swelling to rounded ends (epiphyses). */
export function longBone(a, b, shaftR, endR, material, segments = 16) {
  return latheBetween(a, b, [
    [0, 0], [0.012, endR * 0.75], [0.04, endR], [0.09, endR * 0.9], [0.18, shaftR * 1.15], [0.3, shaftR],
    [0.7, shaftR], [0.82, shaftR * 1.15], [0.91, endR * 0.9], [0.96, endR], [0.988, endR * 0.75], [1, 0],
  ], material, { segments });
}

let shadowTex = null;
/** A soft round contact shadow (a radial alpha gradient), shared by all scenes. */
export function softShadowTexture(size = 128) {
  if (shadowTex) return shadowTex;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const a = Math.max(0, 1 - d) ** 1.8;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(255 * a);
    }
  }
  shadowTex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  shadowTex.magFilter = THREE.LinearFilter;
  shadowTex.minFilter = THREE.LinearFilter;
  shadowTex.needsUpdate = true;
  return shadowTex;
}

/**
 * Merge many small meshes (already posed with position, rotation and scale)
 * into one mesh with one material: one draw call and one pick target, for
 * parts that share a card and label (vertebrae, hand bones, teeth).
 */
export function mergedMesh(parts, material) {
  const geos = parts.map((m) => {
    m.updateMatrix();
    const g = m.geometry.clone().applyMatrix4(m.matrix);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    m.geometry.dispose();
    return g;
  });
  const indexed = geos.every((g) => g.index);
  const ready = indexed ? geos : geos.map((g) => (g.index ? g.toNonIndexed() : g));
  const merged = mergeGeometries(ready, false);
  for (const g of geos) g.dispose();
  return new THREE.Mesh(merged, material);
}
