// Module scene: what the body is made of, element by element. 1 scene unit = 1 m.
// A 1.75 m figure is cut into about 2,400 cubes, each 3 cm across, and the
// cubes are filled from the feet up like a stacked bar chart: by mass, or by
// number of atoms. The figure's outline is a generalized teaching shape.
import * as THREE from 'three/webgpu';
import { materialBank, pick, disposeTree } from './kit.js';
import { ELEMENTS } from '../library/molecule.js';
import { BODY_MASS_PERCENT, atomPercent, elementGroups, apportion } from '../science/chemistry.js';

export const VOXEL_M = 0.03;

const GROUP_STYLE = {
  O: { color: ELEMENTS.O.color, card: 'element-oxygen' },
  C: { color: ELEMENTS.C.color, card: 'element-carbon' },
  H: { color: ELEMENTS.H.color, card: 'element-hydrogen' },
  N: { color: ELEMENTS.N.color, card: 'element-nitrogen' },
  Ca: { color: 0x7cc49a, card: 'element-calcium' },
  P: { color: ELEMENTS.P.color, card: 'element-phosphorus' },
  other: { color: 0xe8c45a, card: 'trace-elements' },
};

// Inside tests for a generalized standing figure (feet at y = 0, crown at 1.75 m).
const ell = (c, r) => (p) => ((p.x - c[0]) / r[0]) ** 2 + ((p.y - c[1]) / r[1]) ** 2 + ((p.z - c[2]) / r[2]) ** 2 <= 1;
const seg = (a, b, r) => {
  const A = new THREE.Vector3(...a);
  const AB = new THREE.Vector3(...b).sub(A);
  const len2 = AB.lengthSq();
  const t = new THREE.Vector3();
  return (p) => {
    const k = Math.max(0, Math.min(1, t.copy(p).sub(A).dot(AB) / len2));
    return t.copy(A).addScaledVector(AB, k).distanceTo(p) <= r;
  };
};
const PARTS = [
  ell([0, 1.635, 0], [0.085, 0.11, 0.1]),
  seg([0, 1.46, 0], [0, 1.56, 0], 0.05),
  ell([0, 1.23, 0], [0.17, 0.27, 0.11]),
  ell([0, 0.95, 0], [0.165, 0.12, 0.11]),
];
for (const s of [-1, 1]) {
  PARTS.push(
    seg([0.19 * s, 1.42, 0], [0.25 * s, 1.12, 0], 0.045),
    seg([0.25 * s, 1.12, 0], [0.28 * s, 0.86, 0.03], 0.04),
    ell([0.29 * s, 0.77, 0.03], [0.03, 0.075, 0.045]),
    seg([0.09 * s, 0.9, 0], [0.1 * s, 0.5, 0.01], 0.07),
    seg([0.1 * s, 0.5, 0.01], [0.1 * s, 0.09, 0], 0.05),
    ell([0.1 * s, 0.035, 0.05], [0.045, 0.035, 0.11]),
  );
}

/** Cube centers inside the figure, sorted from the feet up. */
export function bodyVoxels(size = VOXEL_M) {
  const out = [];
  const p = new THREE.Vector3();
  for (let y = size / 2; y < 1.76; y += size) {
    for (let x = -0.36; x <= 0.36; x += size) {
      for (let z = -0.15; z <= 0.18; z += size) {
        p.set(x, y, z);
        if (PARTS.some((inside) => inside(p))) out.push([x, y, z]);
      }
    }
  }
  // Feet first; within a layer, outside in, so a thin band still reads as a ring.
  return out.sort((a, b) => a[1] - b[1] || Math.hypot(b[0], b[2]) - Math.hypot(a[0], a[2]));
}

// Largest first; the pooled "everything else" always goes on top.
const order = (a, b) => (a.key === 'other') - (b.key === 'other') || b.percent - a.percent;
export const BY_MASS = elementGroups(BODY_MASS_PERCENT).sort(order);
export const BY_ATOMS = elementGroups(atomPercent()).sort(order);

/** Which group each cube belongs to, filling largest-first from the feet up. */
export function fillOrder(groups, n) {
  const counts = apportion(n, groups.map((g) => g.percent));
  const keys = [];
  groups.forEach((g, i) => {
    for (let k = 0; k < counts[i]; k++) keys.push(g.key);
  });
  return keys;
}

const fmt = (p) => (p >= 1 ? String(Math.round(p * 10) / 10) : p.toFixed(2));
const listOf = (groups) => groups.map((g) => `${g.key === 'other' ? 'everything else' : g.label.toLowerCase()} ${fmt(g.percent)}%`).join(', ');
export const READOUTS = {
  mass: `By mass: ${listOf(BY_MASS)}. Most of that oxygen is in water, which makes up more than half your weight.`,
  atoms: `By number of atoms: ${listOf(BY_ATOMS)}. Hydrogen is so light that it makes up under a tenth of your weight, yet more than six of every ten atoms in you.`,
};

export function buildBodyElements({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const voxels = bodyVoxels();
  const n = voxels.length;
  const massKeys = fillOrder(BY_MASS, n);
  const atomKeys = fillOrder(BY_ATOMS, n);

  const cube = new THREE.BoxGeometry(VOXEL_M * 0.86, VOXEL_M * 0.86, VOXEL_M * 0.86);
  const meshes = {};
  for (const [key, style] of Object.entries(GROUP_STYLE)) {
    const glow = key === 'other' || key === 'P' || key === 'Ca';
    const mat = M(style.color, glow ? { roughness: 0.4, emissive: style.color, emissiveIntensity: 0.55 } : { roughness: 0.5 });
    const mesh = new THREE.InstancedMesh(cube, mat, n);
    mesh.count = 0;
    mesh.frustumCulled = false;
    const label = key === 'other' ? 'Everything else (potassium, sulfur, sodium, chlorine, magnesium, trace elements)' : BY_MASS.find((g) => g.key === key).label;
    root.add(pick(mesh, style.card, label));
    meshes[key] = mesh;
  }

  // A floor disc so the figure stands on something.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(0.55, 48), M(0x2a2350, { roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.002;
  root.add(pick(floor, 'body-elements', 'Floor'));

  const m4 = new THREE.Matrix4();
  let shown = -1;
  function apply(v) {
    if (v === shown) return;
    shown = v;
    for (const mesh of Object.values(meshes)) mesh.count = 0;
    // The wipe: cubes below the line show the atom count, above it the mass.
    const line = v * n;
    for (let i = 0; i < n; i++) {
      const key = i < line ? atomKeys[i] : massKeys[i];
      const mesh = meshes[key];
      m4.makeTranslation(voxels[i][0], voxels[i][1], voxels[i][2]);
      mesh.setMatrixAt(mesh.count++, m4);
    }
    for (const mesh of Object.values(meshes)) {
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }

  const controls = {
    label: 'Count by',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0,
    format: (v) => (v < 0.5 ? 'Mass' : 'Atoms'),
    presets: [
      { label: 'By mass', value: 0 },
      { label: 'By atoms', value: 1 },
      { label: 'Play or pause', action: 'play' },
    ],
    playing: false,
    readout: READOUTS.mass,
    set(v) {
      controls.value = v;
      apply(v);
      controls.readout = v < 0.5 ? READOUTS.mass : READOUTS.atoms;
      return controls.readout;
    },
  };
  controls.set(0);

  let phase = 0;
  return {
    root,
    fit: 'both',
    metersPerUnit: 1,
    view: { target: [0, 0.88, 0], direction: [0.42, 0.14, 1] },
    focus: [0, 0.9, 0],
    controls,
    update(dt, env = {}) {
      if (!controls.playing || (env.reducedMotion ?? reducedMotion)) return;
      // Sweep up to atoms, hold, sweep back to mass, hold.
      phase = (phase + dt / 10) % 1;
      const ramp = (a, b) => Math.min(1, Math.max(0, (phase - a) / (b - a)));
      controls.set(Math.round((ramp(0.05, 0.35) - ramp(0.55, 0.85)) * 100) / 100);
    },
    dispose() {
      cube.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
