// Tier 6: inside a rod's outer segment, where light becomes a signal. 1 scene unit = 1 nm.
// Three of the stacked discs (each a flattened sac of membrane) and, on the
// right, the rod's outer membrane with sodium channels. Rhodopsin sits in
// the disc membranes with retinal tucked inside; transducin and
// phosphodiesterase wait on the disc surface; cGMP fills the cytoplasm.
// The stage control follows OpenStax (A&P 14.1, Biology 36.5): retinal flips
// from 11-cis to all-trans, rhodopsin switches on transducin, which activates
// phosphodiesterase; cGMP is broken down; the sodium channels close and the
// rod hyperpolarizes. Proteins are simplified shapes; spacings approximate.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, cylinderBetween, ellipsoid, seeded, disposeTree } from './kit.js';
import { stagedControls, ramp } from './stages.js';

const DISC_X = [-62, 36];
const DISC_Y = [-30, 0, 30]; // centre of each disc
export const MEMBRANE_NM = 4;
export const DISC_LUMEN_NM = 4;
const PM_X = 46; // the outer (plasma) membrane, centre
const Z = 22;

export const CASCADE_STAGES = [
  { label: 'Dark', text: 'In the dark, the messenger cGMP (green) holds sodium channels in the rod’s outer membrane open. Sodium ions (blue) flow in, and the rod steadily releases neurotransmitter.' },
  { label: 'Photon', text: 'A photon is absorbed by retinal inside rhodopsin. Retinal flips from its bent 11-cis form to straight all-trans, and rhodopsin changes shape: it is now switched on.' },
  { label: 'Transducin', text: 'Switched-on rhodopsin activates the G protein transducin; one rhodopsin can activate many. Transducin’s α part (orange) moves off and switches on phosphodiesterase.' },
  { label: 'cGMP falls', text: 'Phosphodiesterase converts cGMP to GMP, so the cGMP level in the cytoplasm drops fast.' },
  { label: 'Channels close', text: 'Without cGMP the sodium channels close. The rod hyperpolarizes and releases less neurotransmitter: that drop is the signal the bipolar cell reads. Later, retinal must return to 11-cis before this rhodopsin can respond again.' },
];

export function buildPhototransduction({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1616);
  const dot = new THREE.SphereGeometry(1, 10, 8);

  // Discs: two membranes each, around a thin lumen, rounded at the rim.
  const memMat = M(0xd8c0e8, { roughness: 0.55 });
  const headMat = M(0xb89ad8, { roughness: 0.5 });
  const halfT = DISC_LUMEN_NM / 2 + MEMBRANE_NM / 2;
  for (const y of DISC_Y) {
    for (const s of [1, -1]) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(DISC_X[1] - DISC_X[0], MEMBRANE_NM, 2 * Z), memMat);
      slab.position.set((DISC_X[0] + DISC_X[1]) / 2, y + s * halfT, 0);
      root.add(pick(slab, 'rod-cell', 'Disc membrane (a lipid bilayer)'));
      const heads = new THREE.Mesh(new THREE.BoxGeometry(DISC_X[1] - DISC_X[0], 0.6, 2 * Z), headMat);
      heads.position.set((DISC_X[0] + DISC_X[1]) / 2, y + s * (halfT + MEMBRANE_NM / 2), 0);
      root.add(pick(heads, 'rod-cell', 'Disc membrane surface'));
    }
    const rim = new THREE.Mesh(new THREE.CylinderGeometry(halfT + MEMBRANE_NM / 2, halfT + MEMBRANE_NM / 2, 2 * Z, 24, 1, false, 0, Math.PI), memMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.set(DISC_X[1], y, 0);
    root.add(pick(rim, 'rod-cell', 'Rim of a disc'));
  }
  // The rod's outer (plasma) membrane.
  const pm = new THREE.Mesh(new THREE.BoxGeometry(MEMBRANE_NM, 96, 2 * Z), M(0xe8c8d8, { roughness: 0.55, transparent: true, opacity: 0.85 }));
  pm.position.set(PM_X, 0, 0);
  root.add(pick(pm, 'rod-cell', 'The rod’s outer membrane'));

  // Rhodopsin: seven helices around a pocket holding retinal.
  const helixMat = M(0x7c8fd0, { roughness: 0.4 });
  const rhodos = [];
  const topMem = DISC_Y[1] + halfT;
  for (const [x, z] of [[-48, -8], [-34, 10], [-18, -12], [-2, 8], [16, -6], [26, 14], [-52, 14]]) {
    const g = new THREE.Group();
    g.position.set(x, topMem, z);
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      g.add(pick(cylinderBetween([Math.cos(a) * 1.7, -2.8, Math.sin(a) * 1.7], [Math.cos(a) * 1.7 + 0.3, 2.8, Math.sin(a) * 1.7], 0.55, 0.55, helixMat, 8), 'rhodopsin', 'Rhodopsin (opsin protein with retinal inside)'));
    }
    root.add(g);
    rhodos.push(g);
  }
  // A few in the other discs too.
  for (const y of [DISC_Y[0], DISC_Y[2]]) {
    for (const x of [-40, -10, 20]) {
      const g = new THREE.Group();
      g.position.set(x + (rand() - 0.5) * 8, y + halfT, (rand() - 0.5) * 30);
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        g.add(pick(cylinderBetween([Math.cos(a) * 1.7, -2.8, Math.sin(a) * 1.7], [Math.cos(a) * 1.7, 2.8, Math.sin(a) * 1.7], 0.55, 0.55, helixMat, 8), 'rhodopsin', 'Rhodopsin'));
      }
      root.add(g);
    }
  }
  const hero = rhodos[1];
  const heroGlow = M(0xffe28a, { roughness: 0.3, emissive: 0xffd36a, emissiveIntensity: 0 });
  const halo = pick(new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.25, 8, 32), heroGlow), 'rhodopsin', 'Switched-on rhodopsin');
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 3.1;
  hero.add(halo);
  // Retinal: bent (11-cis) before light, straight (all-trans) after.
  const retMat = M(0xffb347, { roughness: 0.35, emissive: 0xffb347, emissiveIntensity: 0.35 });
  const retinalBent = new THREE.Group();
  retinalBent.add(pick(capsuleBetween([-1, -0.6, 0], [0.2, 0.4, 0], 0.32, retMat, 6), 'retinal', '11-cis-retinal (bent), inside rhodopsin'));
  retinalBent.add(pick(capsuleBetween([0.2, 0.4, 0], [-0.3, 1.6, 0], 0.32, retMat, 6), 'retinal', '11-cis-retinal (bent), inside rhodopsin'));
  const retinalStraight = pick(capsuleBetween([-1, -0.6, 0], [0.8, 1.7, 0], 0.32, retMat, 6), 'retinal', 'all-trans-retinal (straightened by light)');
  hero.add(retinalBent, retinalStraight);
  for (const g of rhodos.filter((r) => r !== hero)) {
    g.add(pick(capsuleBetween([-1, -0.6, 0], [0.2, 0.4, 0], 0.3, retMat, 6), 'retinal', '11-cis-retinal'));
    g.add(pick(capsuleBetween([0.2, 0.4, 0], [-0.3, 1.6, 0], 0.3, retMat, 6), 'retinal', '11-cis-retinal'));
  }
  const photon = pick(new THREE.Mesh(dot, M(0xffffff, { roughness: 0.2, emissive: 0xfff2b0, emissiveIntensity: 1 })), 'retinal', 'A photon');
  root.add(photon);

  // Transducin (α orange, β and γ blue) and phosphodiesterase on the disc surface.
  const surf = topMem + MEMBRANE_NM / 2 + 2.6;
  const alphaMat = M(0xf2a65a, { roughness: 0.4, emissive: 0xf2a65a, emissiveIntensity: 0.1 });
  const bgMat = M(0x5a8deb, { roughness: 0.45 });
  const transducins = [];
  for (const [x, z] of [[-28, 4], [-40, -14], [6, 16], [22, -14]]) {
    const a = pick(ellipsoid([x, surf, z], [2.4, 1.8, 2.2], alphaMat, 14), 'transducin', 'Transducin α subunit');
    root.add(a);
    root.add(pick(ellipsoid([x + 3.6, surf - 0.3, z], [2.2, 1.6, 2], bgMat, 14), 'transducin', 'Transducin β and γ subunits'));
    transducins.push({ a, home: a.position.clone() });
  }
  const pdeMat = M(0x7cc49a, { roughness: 0.4, emissive: 0x7cc49a, emissiveIntensity: 0 });
  const pdes = [[-12, -2], [12, 6]].map(([x, z]) => {
    const g = new THREE.Group();
    g.add(pick(ellipsoid([-1.8, 0, 0], [2.2, 2, 2], pdeMat, 14), 'phosphodiesterase', 'Phosphodiesterase (breaks down cGMP)'));
    g.add(pick(ellipsoid([1.8, 0, 0], [2.2, 2, 2], pdeMat, 14), 'phosphodiesterase', 'Phosphodiesterase (breaks down cGMP)'));
    g.position.set(x, surf + 0.2, z);
    root.add(g);
    return g;
  });

  // cGMP throughout the cytoplasm; sodium channels in the outer membrane.
  const cgmpMat = M(0x8fe08a, { roughness: 0.3, emissive: 0x6fd06a, emissiveIntensity: 0.5 });
  const gmpMat = M(0x8a8a8a, { roughness: 0.6 });
  const cg = Array.from({ length: 90 }, () => {
    const band = rand() < 0.5 ? 1 : -1;
    const p = new THREE.Vector3(DISC_X[0] + 6 + rand() * (PM_X - DISC_X[0] - 10), band * (8 + rand() * 14), (rand() - 0.5) * 2 * (Z - 2));
    const m = pick(new THREE.Mesh(dot, cgmpMat), 'cgmp', 'cGMP (drawn far larger)');
    m.position.copy(p);
    m.scale.setScalar(0.55);
    m.userData.p = p;
    m.userData.near = Math.min(...pdes.map((g) => g.position.distanceTo(p)));
    root.add(m);
    return m;
  });
  const chanMat = M(0xe86a8a, { roughness: 0.4 });
  const channels = [-30, -10, 14, 34].map((y, i) => {
    const g = new THREE.Group();
    g.position.set(PM_X, y, i % 2 ? 8 : -10);
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const sub = pick(cylinderBetween([-3, Math.cos(a) * 1.5, Math.sin(a) * 1.5], [3, Math.cos(a) * 1.5, Math.sin(a) * 1.5], 0.9, 0.9, chanMat, 8), 'cgmp-channel', 'cGMP-gated sodium channel');
      sub.userData.a = a;
      g.add(sub);
    }
    root.add(g);
    return g;
  });
  const naMat = M(0x9fd4ff, { roughness: 0.3, emissive: 0x9fd4ff, emissiveIntensity: 0.5 });
  const ions = Array.from({ length: 28 }, (_, i) => {
    const m = pick(new THREE.Mesh(dot, naMat), 'cgmp-channel', 'Sodium ion (Na⁺) flowing in');
    m.scale.setScalar(0.5);
    m.userData.ch = channels[i % channels.length];
    m.userData.ph = rand();
    root.add(m);
    return m;
  });

  let flow = 0;
  let stage = 0;
  const tmp = new THREE.Vector3();
  function apply(v) {
    stage = v;
    // Photon and retinal.
    const ph = ramp(v, 0.6, 1.1);
    photon.visible = v > 0.5 && v < 1.15;
    photon.position.copy(hero.position).add(new THREE.Vector3(-14 + 14 * ph, 30 - 29 * ph, 0));
    const flipped = v > 1.1;
    retinalBent.visible = !flipped;
    retinalStraight.visible = flipped;
    heroGlow.emissiveIntensity = 0.9 * ramp(v, 1.05, 1.4);
    // Transducin α to the nearest phosphodiesterase.
    transducins.forEach((t, i) => {
      const target = pdes[i % 2].position.clone().add(new THREE.Vector3(0, 2.6, 0));
      const f = ramp(v, 1.9 + i * 0.12, 2.6 + i * 0.12);
      t.a.position.copy(t.home).lerp(target, f);
      t.a.material.emissiveIntensity = 0.1 + 0.6 * ramp(v, 1.7, 2.1);
    });
    pdeMat.emissiveIntensity = 0.7 * ramp(v, 2.5, 2.9);
    // cGMP broken down, nearest first.
    for (const m of cg) {
      const order = Math.min(1, m.userData.near / 70);
      const gone = ramp(v, 2.9 + order * 0.6, 3.1 + order * 0.6);
      m.material = gone > 0.5 ? gmpMat : cgmpMat;
      m.scale.setScalar(0.55 * (1 - 0.5 * gone));
    }
    // Channels close.
    const shut = ramp(v, 3.6, 4.1);
    for (const ch of channels) {
      for (const sub of ch.children) {
        const r = 1.5 - 0.75 * shut;
        sub.position.set(0, Math.cos(sub.userData.a) * (r - 1.5), Math.sin(sub.userData.a) * (r - 1.5));
      }
    }
    placeIons();
  }
  function placeIons() {
    const open = 1 - ramp(stage, 3.6, 4.1);
    for (const m of ions) {
      const s = (m.userData.ph + flow) % 1;
      const ch = m.userData.ch.position;
      tmp.set(ch.x + 12 - 24 * s, ch.y + Math.sin(s * 9) * 0.5, ch.z);
      m.position.copy(tmp);
      m.visible = open > 0.05;
      m.scale.setScalar(0.5 * open + 0.001);
    }
  }
  const { controls, update } = stagedControls({ stages: CASCADE_STAGES, apply, reducedMotion, rate: 0.22, still: 4 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-9,
    frameWidth: 1.1e-7,
    view: { target: [-6, 4, 0], direction: [0.2, 0.42, 1] },
    focus: [hero.position.x, hero.position.y, hero.position.z],
    controls,
    update(dt) {
      update(dt);
      if (!reducedMotion) {
        flow = (flow + dt * 0.35) % 1;
        placeIons();
      }
    },
    dispose() {
      dot.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
