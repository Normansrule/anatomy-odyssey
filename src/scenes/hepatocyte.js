// Tier 5: two liver cells along a sinusoid, clearing bilirubin. 1 scene unit = 1 µm.
// The hepatocytes (one with two nuclei, which is common) face a sinusoid
// lined by porous endothelium, with a Kupffer cell on its wall; between the
// two cells runs a bile canaliculus. Inside: mitochondria and glycogen.
// The stage control follows the path of bilirubin (OpenStax 18.3 and 23.6):
// a macrophage breaks down an old red blood cell's heme to biliverdin and
// bilirubin; bilirubin rides on albumin to the liver; the liver cell takes it
// in, joins it to glucuronic acid, and secretes it into bile. Molecules and
// the red cell's breakdown are drawn far larger and simplified.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, ellipsoid, tubeThrough, seeded, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const HEPATOCYTE_UM = 24;
const S = HEPATOCYTE_UM / 2;
const SIN_Y = S + 5; // centre of the sinusoid above the cells
const CELLS = [-S - 0.4, S + 0.4]; // x centres of the two cells

export const BILIRUBIN_STAGES = [
  { label: 'Old red cell', text: 'An old red cell. Red blood cells live up to 120 days. A Kupffer cell, a macrophage on the sinusoid wall, swallows a worn-out one and breaks down its heme: first to green biliverdin, then to yellow bilirubin. The iron is kept and recycled.' },
  { label: 'On albumin', text: 'On albumin. Bilirubin does not dissolve well in water, so in the blood it rides bound to albumin, the main plasma protein, to the liver.' },
  { label: 'Into the cell', text: 'Into the liver cell. In the sinusoid, bilirubin leaves albumin and crosses through the pores of the lining into the hepatocyte.' },
  { label: 'Conjugated', text: 'Made soluble. Inside, the cell attaches glucuronic acid to bilirubin (conjugation), which lets it dissolve in water.' },
  { label: 'Into bile', text: 'Into bile. The cell pumps it into the bile canaliculus between the cells. It becomes the main pigment of bile; if the liver cannot clear it, bilirubin builds up and the skin turns yellow (jaundice).' },
];

export function buildHepatocyte({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2525);
  const dot = new THREE.SphereGeometry(1, 10, 8);

  // The two hepatocytes, cut open toward the viewer (z < 0 kept).
  const cellMat = M(0xe0a088, { roughness: 0.4, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false });
  CELLS.forEach((x, i) => {
    const g = new THREE.BoxGeometry(HEPATOCYTE_UM - 0.6, HEPATOCYTE_UM - 0.6, HEPATOCYTE_UM / 2, 1, 1, 1);
    const m = new THREE.Mesh(g, cellMat);
    m.position.set(x, 0, -HEPATOCYTE_UM / 4);
    root.add(pick(m, 'hepatocyte', i === 0 ? 'Hepatocyte (with two nuclei, common in the liver)' : 'Hepatocyte'));
    const nuclei = i === 0 ? [[x - 4, -1, -5], [x + 4, -2, -6]] : [[x, -1, -5]];
    for (const p of nuclei) root.add(pick(ellipsoid(p, [3.2, 3.2, 3], M(COLORS.hematoxylin, { roughness: 0.5 }), 20), 'hepatocyte', 'Nucleus'));
    for (let k = 0; k < 7; k++) {
      root.add(pick(capsuleBetween([x - 7 + rand() * 14, -9 + rand() * 18, -2 - rand() * 8], [x - 7 + rand() * 14, -9 + rand() * 18, -2 - rand() * 8], 0.5, M(0xd98a6a, { roughness: 0.5 }), 6), 'mitochondrion', 'Mitochondrion'));
    }
    // Glycogen: rosettes of dark granules (stored glucose).
    const gly = new THREE.InstancedMesh(dot, M(0x5a3a5a, { roughness: 0.5 }), 80);
    const m4 = new THREE.Matrix4();
    for (let k = 0; k < 80; k++) {
      const c = new THREE.Vector3(x - 8 + rand() * 16, -10 + rand() * 6, -2 - rand() * 9);
      gly.setMatrixAt(k, m4.compose(c, new THREE.Quaternion(), new THREE.Vector3(0.28, 0.28, 0.28)));
    }
    root.add(pick(gly, 'glycogen', 'Glycogen granules (stored glucose)'));
    // Microvilli into the space between cell and sinusoid lining.
    for (let k = 0; k < 14; k++) {
      const mx = x - S + 1.5 + k * 1.6;
      root.add(pick(capsuleBetween([mx, S - 0.4, -1.5], [mx, S + 1.2, -1.5], 0.25, M(0xe8b8a0, { roughness: 0.45 }), 5), 'sinusoid', 'Microvilli facing the space of Disse'));
    }
  });
  // Bile canaliculus between the cells.
  const canPts = [[0, -2, -14], [0, -2, -7], [0, -2, 0], [0, -2, 6]];
  root.add(pick(tubeThrough(canPts, 0.9, M(0x7cb07a, { roughness: 0.4, transparent: true, opacity: 0.85 }), 24, 10), 'bile-canaliculus', 'Bile canaliculus (bile collects here)'));

  // The sinusoid: a porous lining, red blood cells, a Kupffer cell.
  const lining = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.6, 52, 32, 1, true, Math.PI, Math.PI), M(0xf0b4c4, { roughness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.45, depthWrite: false }));
  lining.rotation.z = Math.PI / 2;
  lining.position.set(0, SIN_Y, -2);
  root.add(pick(lining, 'sinusoid', 'Sinusoid (a porous capillary)'));
  for (let k = 0; k < 24; k++) {
    const pore = ellipsoid([-24 + k * 2.1, SIN_Y - 4.6, -2 - (k % 3)], [0.4, 0.1, 0.4], M(0x5a2a34, { roughness: 0.6 }), 8);
    root.add(pick(pore, 'sinusoid', 'Pore (fenestration) in the lining'));
  }
  const rbcMat = M(COLORS.artery, { roughness: 0.4 });
  for (const x of [-18, 10]) {
    const rbc = new THREE.Mesh(new THREE.TorusGeometry(2.4, 1, 10, 20), rbcMat);
    rbc.position.set(x, SIN_Y, -2);
    rbc.rotation.set(0.3, 1.3, 0);
    root.add(pick(rbc, 'red-blood-cell', 'Red blood cell'));
  }
  const kupffer = ellipsoid([-8, SIN_Y + 2.4, -3], [4, 2.4, 3], M(0x6a4a9a, { roughness: 0.45 }), 20);
  root.add(pick(kupffer, 'kupffer-cell', 'Kupffer cell (a macrophage on the sinusoid wall)'));
  const oldRbc = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.9, 10, 20), M(0x9a3a40, { roughness: 0.6 }));
  oldRbc.rotation.set(0.6, 1, 0);
  root.add(pick(oldRbc, 'red-blood-cell', 'Worn-out red blood cell (up to 120 days old)'));

  // Pigments and albumin, drawn far larger.
  const albMat = M(0xf2a65a, { roughness: 0.4 });
  const yellow = new THREE.Color(0xf0d040);
  const green = new THREE.Color(0x5ab060);
  const conj = new THREE.Color(0xc8e060);
  // One material for all the pigment, recolored as it turns from biliverdin to bilirubin to its conjugate.
  const pigMat = M(0xf0d040, { roughness: 0.31, emissive: 0xf0d040, emissiveIntensity: 0.6 });
  const pigs = Array.from({ length: 12 }, (_, i) => {
    const m = pick(new THREE.Mesh(dot, pigMat), 'bilirubin', 'Bilirubin (drawn far larger)');
    m.scale.setScalar(0.45);
    const alb = pick(ellipsoid([0, 0, 0], [1.1, 0.7, 0.7], albMat, 10), 'albumin', 'Albumin carrying bilirubin');
    root.add(m, alb);
    const target = CELLS[i % 2];
    return {
      m,
      alb,
      d: rand() * 0.25,
      a: new THREE.Vector3(-8 + (rand() - 0.5) * 3, SIN_Y + 2.4 + (rand() - 0.5) * 2, -3),
      b: new THREE.Vector3(-22 + i * 3.4, SIN_Y + (rand() - 0.5) * 3, -2),
      c: new THREE.Vector3(target + (rand() - 0.5) * 10, S - 3 - rand() * 4, -2 - rand() * 4),
      e: new THREE.Vector3((rand() - 0.5) * 0.6, -2, -12 + rand() * 16),
    };
  });

  function apply(v) {
    // The old red cell is engulfed and broken down.
    const eat = ramp(v, 0.05, 0.6);
    oldRbc.position.set(-16 + 8 * eat, SIN_Y + 1 + 1.4 * eat, -3);
    oldRbc.scale.setScalar(1 - 0.9 * ramp(v, 0.5, 0.95) + 0.001);
    for (const p of pigs) {
      const t1 = ramp(v, 1 + p.d, 1.7);
      const t2 = ramp(v, 2 + p.d, 2.7);
      const t3 = ramp(v, 3.9 + p.d * 0.5, 4.5);
      p.m.visible = v > 0.55;
      p.m.position.copy(p.a).lerp(p.b, t1).lerp(p.c, t2).lerp(p.e, t3);
      p.alb.visible = v > 0.9 && v < 2.6;
      p.alb.position.copy(p.m.position).add(new THREE.Vector3(1, 0.4, 0));
    }
    const c = new THREE.Color().copy(green).lerp(yellow, ramp(v, 0.6, 0.95)).lerp(conj, ramp(v, 3, 3.5));
    pigMat.color.copy(c);
    pigMat.emissive.copy(c);
  }
  const { controls, update } = stagedControls({ stages: BILIRUBIN_STAGES, apply, reducedMotion, rate: 0.22, still: 4 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 5.6e-5,
    view: { target: [0, 3, 0], direction: [0.18, 0.15, 1] },
    focus: [-8, SIN_Y + 2.4, -2],
    controls,
    update,
    dispose() {
      dot.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
