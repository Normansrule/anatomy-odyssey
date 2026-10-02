// Small-molecule helpers shared by the glutamate and gas scenes.
// Geometry is built from idealized bond lengths and angles, in ångströms.
import * as THREE from 'three/webgpu';
import { pick, cylinderBetween } from '../scenes/kit.js';

/** CPK-style colors; ball radii for ball-and-stick; van der Waals radii for space-filling (Bondi, 1964). */
export const ELEMENTS = {
  H: { color: 0xf2f0fa, ball: 0.22, vdw: 1.2 },
  C: { color: 0x8f86b8, ball: 0.36, vdw: 1.7 },
  N: { color: 0x5a8deb, ball: 0.36, vdw: 1.55 },
  O: { color: 0xff5a5a, ball: 0.38, vdw: 1.52 },
};

const TETRA = Math.acos(-1 / 3); // 109.47°

function anyPerpendicular(v) {
  const a = Math.abs(v.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3().crossVectors(v, a).normalize();
}

/**
 * Unit directions for the bonds an sp3 atom still needs, given the unit
 * directions of the bonds it already has (1 to 3 of them).
 * `twist` rotates the free bonds around the existing one (1-bond case).
 */
export function tetrahedralRest(existing, twist = 0) {
  if (existing.length === 1) {
    const b = existing[0];
    const u = anyPerpendicular(b);
    const w = new THREE.Vector3().crossVectors(b, u);
    return [0, 1, 2].map((k) => {
      const t = twist + (k * 2 * Math.PI) / 3;
      return b.clone().multiplyScalar(Math.cos(TETRA)).add(u.clone().multiplyScalar(Math.sin(TETRA) * Math.cos(t))).add(w.clone().multiplyScalar(Math.sin(TETRA) * Math.sin(t))).normalize();
    });
  }
  if (existing.length === 2) {
    const [b1, b2] = existing;
    const m = b1.clone().add(b2).multiplyScalar(-1).normalize();
    const n = new THREE.Vector3().crossVectors(b1, b2).normalize();
    const half = TETRA / 2;
    return [1, -1].map((s) => m.clone().multiplyScalar(Math.cos(half)).add(n.clone().multiplyScalar(s * Math.sin(half))).normalize());
  }
  if (existing.length === 3) return [existing.reduce((a, b) => a.add(b.clone()), new THREE.Vector3()).multiplyScalar(-1).normalize()];
  return [];
}

/** The two remaining 120° directions of a trigonal (sp2) atom, in the plane with normal `n`. */
export function trigonalRest(b, n) {
  const w = new THREE.Vector3().crossVectors(n, b).normalize();
  return [1, -1].map((s) => b.clone().multiplyScalar(-0.5).add(w.clone().multiplyScalar(s * Math.sqrt(3) / 2)).normalize());
}

/**
 * Build meshes for atoms and bonds.
 * atoms: [{ el, p: Vector3, card, label }]; bonds: [[i, j, order]]
 * Returns { group, setStyle(f) } where f = 0 is ball-and-stick and 1 is space-filling.
 */
export function buildMolecule(atoms, bonds, M, { defaultCard }) {
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 24, 18);
  const balls = atoms.map((a) => {
    const e = ELEMENTS[a.el];
    const m = new THREE.Mesh(sphere, M(e.color, { roughness: 0.32 }));
    m.position.copy(a.p);
    m.scale.setScalar(e.ball);
    group.add(pick(m, a.card ?? defaultCard, a.label ?? a.el));
    return { mesh: m, e };
  });
  const sticks = new THREE.Group();
  const stickMat = M(0xd6d0ea, { roughness: 0.4 });
  for (const [i, j, order = 1] of bonds) {
    const a = atoms[i].p;
    const b = atoms[j].p;
    const dir = b.clone().sub(a).normalize();
    const side = anyPerpendicular(dir).multiplyScalar(0.11);
    const offsets = order === 1 ? [0] : order === 2 ? [-1, 1] : [-1.4, 0, 1.4];
    for (const k of offsets) {
      const o = side.clone().multiplyScalar(k);
      const r = order === 1 ? 0.1 : 0.065;
      sticks.add(pick(cylinderBetween(a.clone().add(o).toArray(), b.clone().add(o).toArray(), r, r, stickMat, 10), atoms[i].card ?? defaultCard, 'Bond'));
    }
  }
  group.add(sticks);
  return {
    group,
    sphere,
    setStyle(f) {
      for (const { mesh, e } of balls) mesh.scale.setScalar(THREE.MathUtils.lerp(e.ball, e.vdw * 0.92, f));
      sticks.visible = f < 0.6;
    },
  };
}

/** Controls for switching a molecule between ball-and-stick and space-filling views. */
export function styleControls(mols, readouts) {
  const controls = {
    label: 'Atom size',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0,
    format: (v) => (v < 0.5 ? 'Ball and stick' : 'Space filling'),
    presets: [
      { label: 'Ball and stick', value: 0 },
      { label: 'Space filling', value: 1 },
    ],
    set(v) {
      controls.value = v;
      for (const m of mols) m.setStyle(v);
      return v < 0.5 ? readouts[0] : readouts[1];
    },
  };
  return controls;
}
