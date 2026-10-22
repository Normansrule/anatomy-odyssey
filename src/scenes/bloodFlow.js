// Blood moving through the large vessels of the whole body: red cells (drawn
// far larger than real ones, which are 7.5 µm across) streaming down the
// center line of each vessel, away from the heart in the arteries and back
// toward it in the veins. Arterial blood surges with each beat; venous blood
// returns at a steadier pace. The center lines of the measured vessels come
// from tools/build_body_meshes.py (bodyLandmarks.json, "flow"); the limb
// vessels drawn in body.js pass their own routes.
import * as THREE from 'three/webgpu';
import { seeded } from './kit.js';

export const FLOW = {
  arterySpeed: 0.3, // m/s, mean over a beat (the aorta's is about 0.2 to 0.4)
  veinSpeed: 0.12, // m/s, steady
  spacing: 0.012, // m between cells along a vessel
  sample: 0.002, // m between precomputed points along each route
};

const SURGE_WIDTH = 0.09;
const SURGE_AT = 0.22;
// Chosen so the speed averages 1 over a beat (a Gaussian's area is width·√π).
const SURGE_GAIN = 0.65 / (SURGE_WIDTH * Math.sqrt(Math.PI));

/**
 * Arterial blood speed through one beat (phase 0–1, as in heartbeatScale),
 * relative to its mean: slow while the heart refills, a surge while the
 * ventricles squeeze.
 */
export function arterialSurge(phase) {
  return 0.35 + SURGE_GAIN * Math.exp(-(((phase - SURGE_AT) / SURGE_WIDTH) ** 2));
}

/**
 * A route sampled evenly by length, with the vessel's radius and two
 * directions across it at every sample.
 * points: [[x, y, z], …] in the direction blood flows; radius: a number or one per point.
 */
export function flowRoute(points, radius) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const length = curve.getLength();
  const n = Math.max(2, Math.ceil(length / FLOW.sample) + 1);
  const pos = new Float32Array(n * 3);
  const across = new Float32Array(n * 6);
  const rad = new Float32Array(n);
  const up = new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3(1, 0, 0);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const p = curve.getPointAt(u);
    const t = curve.getTangentAt(u);
    a.crossVectors(t, Math.abs(t.y) < 0.9 ? up : side).normalize();
    b.crossVectors(t, a).normalize();
    pos.set([p.x, p.y, p.z], i * 3);
    across.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    if (typeof radius === 'number') rad[i] = radius;
    else {
      // The radii are given per input point, which are close to evenly spaced.
      const x = u * (radius.length - 1);
      const k = Math.min(Math.floor(x), radius.length - 2);
      rad[i] = radius[k] + (radius[k + 1] - radius[k]) * (x - k);
    }
  }
  return { length, n, pos, across, rad };
}

/**
 * The blood cells for a set of routes ({ kind: 'artery' | 'vein', points, radius }).
 * Returns { group, cells, update(dt, beatPhase, still) }.
 */
export function buildBloodFlow(M, routes) {
  const group = new THREE.Group();
  group.name = 'blood-flow';
  const rand = seeded(72);
  const geometry = new THREE.SphereGeometry(1, 10, 6);
  const kinds = { artery: [], vein: [] };
  for (const r of routes) {
    const route = flowRoute(r.points, r.radius);
    const count = Math.max(2, Math.round(route.length / FLOW.spacing));
    for (let i = 0; i < count; i++) {
      kinds[r.kind].push({
        route,
        s: ((i + rand() * 0.6) / count) * route.length,
        angle: rand() * Math.PI * 2,
        reach: Math.sqrt(rand()) * 0.55, // share of the radius off the center line
        spin: new THREE.Quaternion().setFromEuler(new THREE.Euler(rand() * 6.3, rand() * 6.3, rand() * 6.3)),
      });
    }
  }
  const colors = { artery: 0xff4d55, vein: 0x6f7dff };
  const meshes = {};
  for (const [kind, cells] of Object.entries(kinds)) {
    if (!cells.length) continue;
    const material = M(colors[kind], { roughness: 0.35, emissive: colors[kind], emissiveIntensity: 0.35 });
    const mesh = new THREE.InstancedMesh(geometry, material, cells.length);
    mesh.name = `blood-flow-${kind}`;
    mesh.frustumCulled = false; // the cells move; their bounds are the whole body
    mesh.raycast = () => {}; // look-through: they never block a click on the vessel
    meshes[kind] = { mesh, cells };
    group.add(mesh);
  }

  const m = new THREE.Matrix4();
  const p = new THREE.Vector3();
  const scale = new THREE.Vector3();
  function place() {
    for (const { mesh, cells } of Object.values(meshes)) {
      cells.forEach((c, i) => {
        const { route } = c;
        const x = (c.s / route.length) * (route.n - 1);
        const k = Math.min(Math.floor(x), route.n - 2);
        const f = x - k;
        const r = route.rad[k] + (route.rad[k + 1] - route.rad[k]) * f;
        const ca = Math.cos(c.angle) * c.reach * r;
        const sa = Math.sin(c.angle) * c.reach * r;
        for (let d = 0; d < 3; d++) {
          const at = route.pos[k * 3 + d] + (route.pos[(k + 1) * 3 + d] - route.pos[k * 3 + d]) * f;
          p.setComponent(d, at + route.across[k * 6 + d] * ca + route.across[k * 6 + 3 + d] * sa);
        }
        // A red cell is a disc about a third as thick as it is wide; it fits the vessel.
        const size = Math.min(0.0026, Math.max(0.0011, r * 0.35));
        scale.set(size, size, size * 0.4);
        mesh.setMatrixAt(i, m.compose(p, c.spin, scale));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }
  place();

  return {
    group,
    cells: Object.values(meshes).reduce((n, x) => n + x.cells.length, 0),
    /** Move the cells on by dt seconds, at the speed for this point in the beat (phase 0–1). */
    update(dt, beatPhase, still = false) {
      if (still) return;
      const speed = { artery: FLOW.arterySpeed * arterialSurge(beatPhase), vein: FLOW.veinSpeed };
      for (const [kind, { cells }] of Object.entries(meshes)) {
        for (const c of cells) c.s = (c.s + speed[kind] * dt) % c.route.length;
      }
      place();
    },
  };
}
