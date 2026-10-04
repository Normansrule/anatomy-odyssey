// Shared library scene: a nucleosome, the basic unit of chromatin.
// 1 scene unit = 1 nm. About 147 base pairs of DNA wrap 1.65 times, in a
// left-handed superhelix, around a core of eight histone proteins (two each
// of H2A, H2B, H3 and H4), making a disc about 11 nm across and 6 nm tall.
// Linker DNA runs on to the neighboring nucleosomes ("beads on a string").
// Dimensions follow the 2.8 Å crystal structure (Luger et al., 1997, PDB
// 1AOI); the proteins are drawn as smooth blobs, not atoms.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, tubeThrough, seeded, disposeTree } from '../scenes/kit.js';

export const NUCLEOSOME = { bp: 147, turns: 1.65, radius: 4.2, pitch: 2.4 };
const DNA_R = 1.0;
const BP_PER_TURN = 10.4;
const LINKER = 9; // nm of linker DNA drawn on each side
const HISTONES = [
  { name: 'H3', color: 0x6f9be8 },
  { name: 'H4', color: 0x62c29a },
  { name: 'H2A', color: 0xecc965 },
  { name: 'H2B', color: 0xe88296 },
];

/** The DNA axis as a curve: linker in, the superhelix, linker out. */
export function nucleosomePath() {
  const { turns, radius, pitch } = NUCLEOSOME;
  const pts = [];
  const n = 120;
  const h = pitch * turns;
  // Left-handed: the angle decreases as the DNA rises.
  const at = (t) => new THREE.Vector3(Math.cos(-t * turns * Math.PI * 2) * radius, -h / 2 + t * h, Math.sin(-t * turns * Math.PI * 2) * radius);
  const start = at(0);
  const end = at(1);
  const tanIn = at(0.001).sub(start).normalize();
  const tanOut = end.clone().sub(at(0.999)).normalize();
  pts.push(start.clone().addScaledVector(tanIn, -LINKER), start.clone().addScaledVector(tanIn, -LINKER / 2));
  for (let i = 0; i <= n; i++) pts.push(at(i / n));
  pts.push(end.clone().addScaledVector(tanOut, LINKER / 2), end.clone().addScaledVector(tanOut, LINKER));
  return new THREE.CatmullRomCurve3(pts);
}

export function buildNucleosome({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const turn = new THREE.Group();
  root.add(turn);
  const rand = seeded(53);

  // Histone octamer: two layers of four, the second turned by 45°.
  for (let layer = 0; layer < 2; layer++) {
    HISTONES.forEach((hist, k) => {
      const a = (k * Math.PI) / 2 + (layer ? Math.PI / 4 : 0);
      const blob = ellipsoid([Math.cos(a) * 1.75, layer ? -1.25 : 1.25, Math.sin(a) * 1.75], [1.55, 1.25, 1.35], M(hist.color, { roughness: 0.55 }), 24);
      blob.rotation.y = -a;
      turn.add(pick(blob, 'histone', `Histone ${hist.name}`));
      // Each histone's flexible tail reaches out between the DNA turns.
      const out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const pts = [];
      for (let s = 0; s <= 5; s++) {
        const r = 2.8 + s * 1.05;
        pts.push([out.x * r + (rand() - 0.5) * 0.7, (layer ? -1.25 : 1.25) + (layer ? -1 : 1) * s * 0.25 + (rand() - 0.5) * 0.6, out.z * r + (rand() - 0.5) * 0.7]);
      }
      turn.add(pick(tubeThrough(pts, 0.17, M(hist.color, { roughness: 0.5 }), 24, 6), 'histone-tail', `${hist.name} tail`));
    });
  }

  // DNA: two backbones twisting around the superhelical path, joined by base-pair rungs.
  const path = nucleosomePath();
  const length = path.getLength();
  const bpCount = Math.round(length / 0.335);
  const strands = [[], []];
  const rungs = [];
  const at = (i) => i / (bpCount * 2);
  for (let i = 0; i <= bpCount * 2; i++) {
    const c = path.getPointAt(at(i));
    const theta = ((i / 2) / BP_PER_TURN) * Math.PI * 2;
    // A frame that cannot flip: one axis points out from the superhelix axis, one along the DNA.
    const tan = path.getTangentAt(at(i));
    const nrm = new THREE.Vector3(c.x, 0, c.z).normalize();
    const bin = new THREE.Vector3().crossVectors(tan, nrm).normalize();
    nrm.crossVectors(bin, tan).normalize();
    for (let s = 0; s < 2; s++) {
      const th = theta + (s ? THREE.MathUtils.degToRad(150) : 0);
      strands[s].push(c.clone().addScaledVector(nrm, Math.cos(th) * DNA_R).addScaledVector(bin, Math.sin(th) * DNA_R));
    }
    if (i % 2 === 0) rungs.push([strands[0][i], strands[1][i]]);
  }
  const coreFrom = (LINKER * 0.98) / length;
  const coreTo = 1 - coreFrom;
  const backbone = [M(0x8f7ff0, { roughness: 0.35 }), M(0xd2c9ff, { roughness: 0.35 })];
  strands.forEach((pts, s) => {
    const curve = new THREE.CatmullRomCurve3(pts);
    turn.add(pick(new THREE.Mesh(new THREE.TubeGeometry(curve, pts.length * 2, 0.3, 8, false), backbone[s]), 'dna', 'DNA backbone'));
  });
  const rungGeo = new THREE.CylinderGeometry(0.13, 0.13, 1, 6);
  // Muted base colors: at this scale the base pairs are texture, the backbones carry the shape.
  const baseColors = [COLORS.baseA, COLORS.baseT, COLORS.baseG, COLORS.baseC].map((c) => new THREE.Color(c).lerp(new THREE.Color(0xd2c9ff), 0.55).getHex());
  const rungMeshes = baseColors.map((col) => new THREE.InstancedMesh(rungGeo, M(col, { roughness: 0.45 }), rungs.length));
  const counts = [0, 0, 0, 0];
  const up = new THREE.Vector3(0, 1, 0);
  const m4 = new THREE.Matrix4();
  rungs.forEach(([a, b]) => {
    const which = Math.floor(rand() * 4);
    const d = b.clone().sub(a);
    const q = new THREE.Quaternion().setFromUnitVectors(up, d.clone().normalize());
    rungMeshes[which].setMatrixAt(counts[which]++, m4.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, d.length(), 1)));
  });
  rungMeshes.forEach((mesh, i) => {
    mesh.count = counts[i];
    turn.add(pick(mesh, 'dna', 'Base pair'));
  });
  // Linker DNA ends: invisible pick targets over the straight stretches.
  for (const [t0, t1] of [[0, coreFrom], [coreTo, 1]]) {
    const pts = [];
    for (let k = 0; k <= 6; k++) pts.push(path.getPointAt(t0 + ((t1 - t0) * k) / 6).toArray());
    const halo = tubeThrough(pts, 1.25, M(0xffffff, { transparent: true, opacity: 0.0, depthWrite: false }), 16, 8);
    halo.userData.pickPriority = 1;
    turn.add(pick(halo, 'linker-dna', 'Linker DNA (to the next nucleosome)'));
  }

  let t = 0;
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-9,
    view: { target: [0, 0, 0], direction: [0.3, 1, 0.55] }, // looking down the superhelix axis
    focus: path.getPointAt(0.5).toArray(),
    update(dt) {
      if (reducedMotion) return;
      t += dt;
      turn.rotation.y = t * 0.15;
    },
    dispose() {
      rungGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
