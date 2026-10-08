// Tier 5: a beta cell beside a capillary, deciding to release insulin.
// 1 scene unit = 1 µm. The cell is cut open: nucleus, mitochondria and
// many insulin granules. In its membrane facing the capillary: glucose
// transporters (GLUT2), ATP-sensitive potassium channels and voltage-gated
// calcium channels, drawn far larger than life, as are the molecules.
// The stage control follows glucose-stimulated insulin secretion as
// described by Demirbilek and others (2019): glucose enters through GLUT2,
// its breakdown raises ATP, ATP closes the potassium channels, the membrane
// depolarizes, calcium channels open, and calcium triggers granule release.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, cylinderBetween, ellipsoid, seeded, fibonacciSphere, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

const C = new THREE.Vector3(2, 0, 0);
export const BETA_CELL_UM = { radii: [7, 6.5, 5.5] };
const CAP_X = -9.5;

export const SECRETION_STAGES = [
  { label: 'Glucose in', text: 'Glucose in. After a meal, blood glucose rises, and glucose (white) enters the beta cell through the transporter GLUT2.' },
  { label: 'ATP rises', text: 'ATP rises. The cell breaks glucose down, and its mitochondria turn out more ATP (yellow): the ratio of ATP to ADP climbs.' },
  { label: 'K⁺ channels close', text: 'Potassium channels close. ATP shuts the ATP-sensitive potassium channels, so potassium (purple) stops leaking out and the membrane depolarizes.' },
  { label: 'Ca²⁺ in', text: 'Calcium in. The depolarization opens voltage-gated calcium channels, and calcium (green) flows into the cell.' },
  { label: 'Insulin out', text: 'Insulin out. Calcium triggers insulin granules to fuse with the membrane and empty into the blood (exocytosis). Insulin then helps cells all over the body take up glucose.' },
];

export function buildBetaCell({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2121);
  const dot = new THREE.SphereGeometry(1, 10, 8);
  const R = new THREE.Vector3(...BETA_CELL_UM.radii);
  const surf = (d, k = 1) => new THREE.Vector3(C.x + d.x * R.x * k, C.y + d.y * R.y * k, C.z + d.z * R.z * k);

  // Capillary on the left, with red cells.
  const capWall = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 30, 28, 1, true), M(0xf0b4c4, { roughness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.5, depthWrite: false }));
  capWall.position.set(CAP_X, 0, 0);
  root.add(pick(capWall, 'islet', 'Capillary through the islet'));
  for (const y of [-9, 4]) {
    const rbc = new THREE.Mesh(new THREE.TorusGeometry(2.4, 1, 10, 20), M(COLORS.artery, { roughness: 0.4 }));
    rbc.position.set(CAP_X, y, -0.5);
    rbc.rotation.set(1.2, 0.3, 0);
    root.add(pick(rbc, 'red-blood-cell', 'Red blood cell'));
  }
  // Neighbor beta cells.
  for (const [x, y, z] of [[9, 11, -3], [12, -9, -3], [-1, -13, -4], [14, 2, -6]]) root.add(pick(ellipsoid([x, y, z], [6, 5.5, 5], M(0x7cc49a, { roughness: 0.55 }), 20), 'beta-cell', 'Neighboring beta cell'));

  // The cell, cut open toward the viewer, and its contents.
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 36, Math.PI, Math.PI), M(0x9fdcb0, { roughness: 0.45, side: THREE.DoubleSide, emissive: 0x7cc49a, emissiveIntensity: 0 }));
  shell.scale.copy(R);
  shell.position.copy(C);
  const shellMat = shell.material;
  root.add(pick(shell, 'beta-cell', 'Beta cell (cut open)'));
  root.add(pick(ellipsoid([C.x + 2, C.y + 0.5, -1.5], [2.6, 2.4, 2.2], M(COLORS.hematoxylin, { roughness: 0.5 }), 20), 'beta-cell', 'Nucleus'));
  const mitoMat = M(0xd98a6a, { roughness: 0.5, emissive: 0xffb060, emissiveIntensity: 0 });
  const mitos = [[-1, 2.5, -2], [0.5, -3, -1.5], [4.5, -2.5, -2.5], [-2, -0.5, -3.2]].map(([x, y, z]) => {
    const m = capsuleBetween([C.x + x - 1, C.y + y, z], [C.x + x + 1, C.y + y + 0.4, z], 0.5, mitoMat, 8);
    root.add(pick(m, 'mitochondrion', 'Mitochondrion (makes ATP)'));
    return m.position.clone();
  });
  // Insulin granules: a dense core in a pale halo.
  const coreMat = M(0x3a3048, { roughness: 0.4 });
  const haloMat = M(0xe8f0e0, { roughness: 0.4, transparent: true, opacity: 0.7 });
  const granules = [];
  for (let i = 0; i < 90; i++) {
    const p = new THREE.Vector3((rand() * 2 - 1) * R.x, (rand() * 2 - 1) * R.y, -rand() * R.z).add(C);
    if (p.clone().sub(C).divide(R).length() > 0.88) continue;
    if (p.distanceTo(new THREE.Vector3(C.x + 2, C.y + 0.5, -1.5)) < 3.4) continue;
    const g = new THREE.Group();
    g.position.copy(p);
    const core = pick(new THREE.Mesh(dot, coreMat), 'insulin', 'Insulin granule (drawn larger; insulin crystallized in its core)');
    core.scale.setScalar(0.28);
    const halo = pick(new THREE.Mesh(dot, haloMat), 'insulin', 'Insulin granule');
    halo.scale.setScalar(0.5);
    g.add(core, halo);
    root.add(g);
    granules.push({ g, home: p.clone() });
  }
  // The granules nearest the capillary side are the ones released.
  granules.sort((a, b) => a.home.x - b.home.x);
  const releasing = granules.slice(0, 8);

  // Membrane machinery on the capillary side (−x), drawn far larger.
  const dirs = fibonacciSphere(80).filter((d) => d.x < -0.55 && d.z > -0.2);
  const put = (d, k) => surf(d, k);
  const glut = [];
  const katp = [];
  const cav = [];
  dirs.forEach((d, i) => {
    const p = put(d, 1);
    const kind = i % 3;
    if (kind === 0) {
      root.add(pick(cylinderBetween(put(d, 0.9).toArray(), put(d, 1.1).toArray(), 0.38, 0.38, M(0x5a8deb, { roughness: 0.4 }), 10), 'glut2', 'GLUT2 (lets glucose in)'));
      glut.push(p);
    } else if (kind === 1) {
      const m = pick(cylinderBetween(put(d, 0.9).toArray(), put(d, 1.1).toArray(), 0.45, 0.45, M(0xb07ae8, { roughness: 0.4, emissive: 0xb07ae8, emissiveIntensity: 0.3 }), 10), 'katp-channel', 'ATP-sensitive potassium channel');
      root.add(m);
      katp.push({ p, m });
    } else {
      const m = pick(cylinderBetween(put(d, 0.9).toArray(), put(d, 1.1).toArray(), 0.42, 0.42, M(0x7cc49a, { roughness: 0.4, emissive: 0x7cc49a, emissiveIntensity: 0 }), 10), 'calcium-channel', 'Voltage-gated calcium channel');
      root.add(m);
      cav.push({ p, m });
    }
  });

  // Moving molecules.
  const mk = (color, card, label, size) => {
    const m = pick(new THREE.Mesh(dot, M(color, { roughness: 0.3, emissive: color, emissiveIntensity: 0.6 })), card, label);
    m.scale.setScalar(size);
    root.add(m);
    return m;
  };
  const glucose = Array.from({ length: 14 }, (_, i) => ({ m: mk(0xf4f4f4, 'glucose', 'Glucose (drawn far larger)', 0.32), via: glut[i % glut.length], to: mitos[i % mitos.length], start: new THREE.Vector3(CAP_X + (rand() - 0.5) * 3, (rand() - 0.5) * 20, (rand() - 0.5) * 3), d: rand() * 0.25 }));
  const atp = Array.from({ length: 22 }, (_, i) => ({ m: mk(0xffd36a, 'atp', 'ATP (drawn far larger)', 0.26), from: mitos[i % mitos.length], to: katp[i % katp.length].p.clone().lerp(C, 0.12), d: rand() * 0.3 }));
  const potassium = Array.from({ length: 14 }, (_, i) => ({ m: mk(0xb07ae8, 'katp-channel', 'Potassium ion leaving (drawn far larger)', 0.22), ch: katp[i % katp.length].p, ph: rand() }));
  const calcium = Array.from({ length: 14 }, (_, i) => ({ m: mk(0x7cf0a0, 'calcium-channel', 'Calcium ion entering (drawn far larger)', 0.22), ch: cav[i % cav.length].p, ph: rand() }));
  const insulin = Array.from({ length: 24 }, (_, i) => ({ m: mk(0x7cc49a, 'insulin', 'Insulin released into the blood (drawn far larger)', 0.18), from: releasing[i % releasing.length], to: new THREE.Vector3(CAP_X + (rand() - 0.5) * 4, (rand() - 0.5) * 22, (rand() - 0.5) * 4) }));

  let flow = 0;
  let stage = 0;
  const tmp = new THREE.Vector3();
  function apply(v) {
    stage = v;
    for (const g of glucose) {
      const a = ramp(v, 0.05 + g.d, 0.5 + g.d);
      const b = ramp(v, 0.55 + g.d, 0.95 + g.d);
      g.m.visible = v < 1.6;
      g.m.position.copy(g.start).lerp(g.via, a).lerp(g.to, b);
    }
    mitoMat.emissiveIntensity = 0.7 * ramp(v, 0.9, 1.3);
    for (const a of atp) {
      const t = ramp(v, 1 + a.d, 1.7 + a.d);
      a.m.visible = v > 0.95;
      a.m.position.copy(a.from).lerp(a.to, t);
    }
    const shut = ramp(v, 1.9, 2.3);
    for (const { m } of katp) m.material.emissiveIntensity = 0.3 * (1 - shut);
    for (const k of potassium) {
      const t = (k.ph + flow) % 1;
      k.m.visible = shut < 0.95;
      k.m.position.copy(k.ch).lerp(C, -0.25 - t * 0.6);
      k.m.scale.setScalar(0.22 * (1 - shut) + 0.001);
    }
    shellMat.emissiveIntensity = 0.35 * ramp(v, 2.2, 2.7);
    const open = ramp(v, 2.8, 3.2);
    for (const { m } of cav) m.material.emissiveIntensity = 0.8 * open;
    for (const c of calcium) {
      const t = (c.ph + flow) % 1;
      c.m.visible = open > 0.05;
      c.m.position.copy(c.ch).lerp(C, -0.5 + t * 0.9);
    }
    const out = ramp(v, 3.7, 4.2);
    releasing.forEach(({ g, home }) => {
      const target = home.clone();
      target.x = C.x - R.x * 0.92;
      g.position.copy(home).lerp(target, ramp(v, 3.5, 3.9));
      g.visible = out < 0.9;
    });
    for (const s of insulin) {
      s.m.visible = out > 0.05;
      tmp.copy(s.from.g.position).lerp(s.to, ramp(v, 3.8, 4.3));
      s.m.position.copy(tmp);
    }
  }
  const { controls, update } = stagedControls({ stages: SECRETION_STAGES, apply, reducedMotion, rate: 0.24, still: 4 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 3.4e-5,
    view: { target: [-1, 0, 0], direction: [0.25, 0.18, 1] },
    focus: mitos[0].toArray(),
    controls,
    update(dt) {
      update(dt);
      if (!reducedMotion) {
        flow = (flow + dt * 0.4) % 1;
        apply(stage);
      }
    },
    dispose() {
      dot.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
