// Shared library scene: hemoglobin. 1 scene unit = 1 Å (0.1 nm).
// Four globin chains (two α, two β) drawn as "cylinder cartoons": each
// α-helix is a rod. Each chain cradles one heme between its E and F helices.
// The oxygen control applies the Hill equation to decide how many hemes
// carry O₂, and turns one αβ pair against the other (T → R state).
// Helix placement is a generalized globin fold, not coordinates from PDB.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, tubeThrough, ellipsoid, disposeTree } from '../scenes/kit.js';
import { hillSaturation } from '../science/equations.js';

// Globin fold, local frame: heme at the origin, E helix above, F helix below.
// [name, center, direction, length in Å] (length = residues × 1.5 Å rise).
const HELICES = [
  ['A', [-8, 10, 8], [0.6, -0.2, -0.77], 24],
  ['B', [6, 4, 11], [-0.9, 0.3, 0.2], 24],
  ['C', [13, -2, 4], [0.1, -0.7, -0.7], 10.5],
  ['D', [12, 8, -4], [0.3, 0.2, -0.9], 10.5],
  ['E', [0, 7.5, -2], [1, 0.1, 0.1], 28.5],
  ['F', [2, -7.5, -3], [0.95, 0.2, -0.1], 13.5],
  ['G', [-6, -4, 10], [0.3, 0.9, -0.2], 28.5],
  ['H', [-12, -2, -2], [0.15, 0.95, 0.3], 39],
];

function buildChain(M, color, kind) {
  const g = new THREE.Group();
  const helixMat = M(color, { roughness: 0.42 });
  const loopMat = M(color, { roughness: 0.6 });
  const ends = [];
  for (const [name, c, d, len] of HELICES) {
    if (kind === 'alpha' && name === 'D') continue; // α chains lack the D helix
    const dir = new THREE.Vector3(...d).normalize();
    const center = new THREE.Vector3(...c);
    const a = center.clone().addScaledVector(dir, -len / 2);
    const b = center.clone().addScaledVector(dir, len / 2);
    g.add(pick(capsuleBetween(a.toArray(), b.toArray(), 1.9, helixMat, 14), 'globin', `${name} helix (${kind === 'alpha' ? 'α' : 'β'} chain)`));
    ends.push([a, b]);
  }
  // Loops joining each helix to the next, bowed outward.
  for (let i = 0; i < ends.length - 1; i++) {
    const p = ends[i][1];
    const q = ends[i + 1][0];
    const mid = p.clone().add(q).multiplyScalar(0.5);
    mid.addScaledVector(mid.clone().normalize(), 3.5);
    g.add(pick(tubeThrough([p.toArray(), mid.toArray(), q.toArray()], 0.7, loopMat, 16, 6), 'globin', 'Loop'));
  }
  // Heme: a flat ring with iron in the middle, plus a slot for bound O₂.
  const heme = new THREE.Group();
  heme.add(pick(new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 1.1, 28), M(0xc0283c, { roughness: 0.35, emissive: 0x7a1f2b, emissiveIntensity: 0.6 })), 'heme', 'Heme'));
  heme.position.set(1.5, 0, 3.5); // in the pocket, toward the outside of the chain
  heme.add(pick(ellipsoid([0, 0.2, 0], [1.2, 1.2, 1.2], M(0xf2a65a, { roughness: 0.3, metalness: 0.3, emissive: 0xf2a65a, emissiveIntensity: 0.3 }), 16), 'heme', 'Iron (Fe²⁺)'));
  const o2 = new THREE.Group();
  const oMat = M(0xff5a5a, { roughness: 0.3, emissive: 0xff5a5a, emissiveIntensity: 0.25 });
  o2.add(pick(ellipsoid([0, 2.0, 0], [0.95, 0.95, 0.95], oMat, 14), 'oxygen-binding', 'Bound oxygen (O₂)'));
  o2.add(pick(ellipsoid([0.9, 2.9, 0], [0.95, 0.95, 0.95], oMat, 14), 'oxygen-binding', 'Bound oxygen (O₂)'));
  heme.add(o2);
  g.add(heme);
  return { group: g, o2 };
}

export function buildHemoglobin() {
  const M = materialBank();
  const root = new THREE.Group();
  const tetramer = new THREE.Group();
  root.add(tetramer);

  // Two αβ dimers. Dimer 2 turns relative to dimer 1 between T and R states.
  const dimer1 = new THREE.Group();
  const dimer2 = new THREE.Group();
  tetramer.add(dimer1, dimer2);
  const ALPHA = 0xa596f2;
  const BETA = 0xf08baf;
  const layout = [
    { dimer: dimer1, kind: 'alpha', color: ALPHA, at: [-12, 12, 11] },
    { dimer: dimer1, kind: 'beta', color: BETA, at: [12, 12, -11] },
    { dimer: dimer2, kind: 'alpha', color: ALPHA, at: [12, -12, 11] },
    { dimer: dimer2, kind: 'beta', color: BETA, at: [-12, -12, -11] },
  ];
  const oxygens = [];
  for (const l of layout) {
    const chain = buildChain(M, l.color, l.kind);
    chain.group.position.set(...l.at);
    // Turn each chain so its heme pocket faces outward.
    chain.group.lookAt(new THREE.Vector3(...l.at).multiplyScalar(2));
    l.dimer.add(chain.group);
    oxygens.push(chain.o2);
  }

  let bound = 4;
  const setPressure = (p) => {
    const s = hillSaturation(p);
    bound = Math.round(4 * s);
    oxygens.forEach((o, i) => (o.visible = i < bound));
    // T state (few O₂) is rotated about 15° relative to R state (all O₂).
    dimer2.rotation.y = THREE.MathUtils.degToRad(15) * (1 - bound / 4);
    let where = '';
    if (p >= 90) where = ' Like blood leaving the lungs.';
    else if (p >= 35 && p <= 45) where = ' Like a resting tissue.';
    else if (p <= 25 && p > 0) where = ' Like a hard-working muscle.';
    const state = bound >= 3 ? 'relaxed (R) state' : 'tense (T) state';
    return `${Math.round(s * 100)}% saturated: about ${bound} of 4 hemes carry O₂, ${state}.${where}`;
  };

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-10,
    view: { target: [0, 0, 0], direction: [0.55, 0.35, 0.9] },
    focus: layout[0].at,
    controls: {
      label: 'Oxygen pressure (pO₂)',
      unit: 'mmHg',
      min: 0,
      max: 100,
      step: 1,
      value: 100,
      presets: [
        { label: 'Lungs', value: 100 },
        { label: 'Resting tissue', value: 40 },
        { label: 'Working muscle', value: 20 },
      ],
      set: setPressure,
    },
    update(dt, env = {}) {
      if (!env.reducedMotion) tetramer.rotation.y += dt * 0.12;
    },
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
