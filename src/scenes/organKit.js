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
