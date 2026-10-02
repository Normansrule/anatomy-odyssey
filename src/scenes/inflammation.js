// Module: acute inflammation after a splinter wound. 1 scene unit = 1 µm.
// A generalized teaching model of the five stages, driven by one control:
//   0 injury → 1 alarm → 2 vessel response → 3 neutrophils arrive → 4 cleanup.
// Cells are to scale with each other (neutrophil 12 µm, mast cell 14 µm);
// bacteria are drawn about twice their size, and timing is compressed from
// hours into seconds.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, tubeThrough, capsuleBetween, seeded, disposeTree } from './kit.js';
import { rbcGeometry } from './rbcShape.js';

export const STAGES = [
  { label: 'Injury', text: 'Injury. A splinter breaks the skin and carries bacteria into the tissue.' },
  { label: 'Alarm', text: 'Alarm. Mast cells release histamine, and resident macrophages sense the bacteria and send out signaling molecules (cytokines).' },
  { label: 'Vessels', text: 'Vessel response. Nearby small vessels widen (redness and heat) and leak fluid into the tissue (swelling and pain).' },
  { label: 'Neutrophils', text: 'Neutrophils arrive. They roll along the vessel wall, squeeze between its cells, and crawl toward the bacteria.' },
  { label: 'Resolution', text: 'Cleanup and resolution. Neutrophils and macrophages swallow the bacteria, the signals fade, and repair begins.' },
];

const VESSEL_Y = -16;
const VESSEL_R = 7;
const LEN = 130;
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const ramp = (v, a, b) => {
  const x = clamp01((v - a) / (b - a));
  return x * x * (3 - 2 * x);
};

export function buildInflammation({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(97);

  // Skin surface and the tissue beneath it.
  const epidermis = new THREE.Mesh(new THREE.BoxGeometry(LEN, 6, 24), M(0xb9aee0, { roughness: 0.7 }));
  epidermis.position.set(0, 17, -12);
  root.add(pick(epidermis, 'inflammation', 'Epidermis (outer skin)'));
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(LEN, 50), M(0x3a2f5c, { roughness: 0.9 }));
  backWall.position.set(0, -4, -24);
  root.add(backWall);
  const collagenMat = M(0x8f86b8, { roughness: 0.8, transparent: true, opacity: 0.3, depthWrite: false });
  for (let i = 0; i < 26; i++) {
    const y = -26 + rand() * 38;
    const z = -23 + rand() * 6;
    root.add(tubeThrough([[-65, y, z], [-20, y + (rand() - 0.5) * 8, z], [20, y + (rand() - 0.5) * 8, z], [65, y + (rand() - 0.5) * 6, z]], 0.3, collagenMat, 32, 5));
  }

  // The splinter.
  const splinter = new THREE.Mesh(new THREE.ConeGeometry(3.2, 34, 6), M(0x9a6b3e, { roughness: 0.8 }));
  splinter.position.set(30, 13, -6);
  splinter.rotation.z = 0.45;
  root.add(pick(splinter, 'inflammation', 'Splinter'));
  const tip = new THREE.Vector3(24, 0, -6);

  // Bacteria around the splinter tip (drawn about 2× life size).
  const bacMat = M(0x7cc49a, { roughness: 0.35, emissive: 0x7cc49a, emissiveIntensity: 0.35 });
  const bacteria = [];
  for (let i = 0; i < 26; i++) {
    const p = tip.clone().add(new THREE.Vector3((rand() - 0.5) * 16, (rand() - 0.5) * 10, (rand() - 0.5) * 8));
    const b = capsuleBetween([0, -1.4, 0], [0, 1.4, 0], 0.9, bacMat, 8);
    b.position.copy(p);
    b.rotation.set(rand() * 3, rand() * 3, rand() * 3);
    root.add(pick(b, 'bacteria', 'Bacterium'));
    bacteria.push({ mesh: b, home: p.clone(), appear: i / 26, eatenBy: i % 6 });
  }

  // Venule: the back half of its wall, and blood inside.
  const wallGeo = new THREE.CylinderGeometry(1, 1, LEN, 64, 1, true, Math.PI / 2, Math.PI);
  wallGeo.rotateZ(Math.PI / 2);
  const wall = new THREE.Mesh(wallGeo, M(0xe9a7b8, { roughness: 0.6, side: THREE.DoubleSide }));
  wall.position.y = VESSEL_Y;
  root.add(pick(wall, 'venule', 'Venule wall'));
  const rbcGeo = rbcGeometry(1, { segments: 24 });
  const rbcs = new THREE.InstancedMesh(rbcGeo, M(COLORS.artery, { roughness: 0.4 }), 26);
  const rbcState = Array.from({ length: 26 }, () => ({ x: (rand() - 0.5) * LEN, y: (rand() - 0.5) * 8, z: -rand() * 5, a: rand() * 6 }));
  root.add(pick(rbcs, 'venule', 'Red blood cells'));

  // Fluid leaking into the tissue (swelling).
  const fluidMat = M(0x5a8deb, { roughness: 0.2, transparent: true, opacity: 0.25, depthWrite: false });
  const fluid = [];
  for (let i = 0; i < 18; i++) {
    const m = ellipsoid([0, 0, 0], [2.5, 2.5, 2.5], fluidMat, 12);
    root.add(pick(m, 'venule', 'Leaked fluid (plasma)'));
    fluid.push({ mesh: m, x: -40 + rand() * 80, z: -4 - rand() * 12, rise: 6 + rand() * 18, phase: rand() });
  }

  // Mast cell with granules.
  const mastAt = new THREE.Vector3(-18, -1, -8);
  root.add(pick(ellipsoid(mastAt.toArray(), [7, 6.5, 6.5], M(0xd8b4d6, { roughness: 0.5, transparent: true, opacity: 0.8 }), 28), 'mast-cell', 'Mast cell'));
  root.add(pick(ellipsoid(mastAt.toArray(), [2.2, 2.2, 2.2], M(COLORS.hematoxylin, { roughness: 0.5 }), 16), 'mast-cell', 'Mast cell nucleus'));
  const granules = [];
  const granMat = M(0x3d2f8c, { roughness: 0.4 });
  for (let i = 0; i < 40; i++) {
    const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
    const g = ellipsoid([0, 0, 0], [0.7, 0.7, 0.7], granMat, 8);
    root.add(pick(g, 'histamine', 'Granule (histamine)'));
    granules.push({ mesh: g, dir, r: 3.5 + rand() * 2.2 });
  }

  // Resident macrophage with pseudopods.
  const macAt = new THREE.Vector3(8, -3, -9);
  const macMat = M(0xe8c45a, { roughness: 0.5 });
  const macrophage = new THREE.Group();
  macrophage.position.copy(macAt);
  macrophage.add(pick(ellipsoid([0, 0, 0], [8, 6, 6], macMat, 26), 'macrophage', 'Macrophage'));
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    macrophage.add(pick(capsuleBetween([0, 0, 0], [Math.cos(a) * 11, Math.sin(a) * 8, (rand() - 0.5) * 4], 1.4, macMat, 8), 'macrophage', 'Macrophage pseudopod'));
  }
  root.add(macrophage);

  // Cytokine signal cloud around the wound.
  const cloud = ellipsoid(tip.toArray(), [22, 16, 12], M(0xf2a65a, { transparent: true, opacity: 0.12, depthWrite: false }), 24);
  root.add(pick(cloud, 'cytokines', 'Cytokine signals'));

  // Neutrophils: flow in the vessel, roll, squeeze out, crawl, engulf.
  const neuMat = M(0xf1eef8, { roughness: 0.5, transparent: true, opacity: 0.85 });
  const neuNuc = M(COLORS.hematoxylin, { roughness: 0.45 });
  const neutrophils = [];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    g.add(pick(ellipsoid([0, 0, 0], [6, 6, 6], neuMat, 22), 'neutrophil', 'Neutrophil'));
    for (const [dx, dy] of [[-1.6, 0.8], [0.4, 1.6], [1.8, 0], [0.2, -1.4]]) g.add(pick(ellipsoid([dx, dy, 1.5], [1.4, 1.1, 1.2], neuNuc, 10), 'neutrophil', 'Lobed nucleus'));
    root.add(g);
    const exitX = -6 + i * 5.5;
    const target = tip.clone().add(new THREE.Vector3((i - 2.5) * 3.2, -3 + (i % 2) * 5, 1));
    neutrophils.push({ g, startX: -60 - i * 12, exitX, target, delay: i * 0.06 });
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  let flow = 0;

  function apply(v) {
    // Vessel widens in stage 2 and relaxes in stage 4.
    const dilate = ramp(v, 1.6, 2.4) * (1 - ramp(v, 3.6, 4));
    const r = VESSEL_R * (1 + 0.35 * dilate);
    wall.scale.set(1, r, r);
    rbcState.forEach((c, i) => {
      const x = (((c.x + flow * 8 + LEN / 2) % LEN) + LEN) % LEN - LEN / 2;
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), c.a + flow);
      m4.compose(new THREE.Vector3(x, VESSEL_Y + c.y * (r / VESSEL_R) * 0.6, c.z), q, one);
      rbcs.setMatrixAt(i, m4);
    });
    rbcs.instanceMatrix.needsUpdate = true;

    // Bacteria appear and multiply in stage 0, get eaten late in stage 3–4.
    const eaten = ramp(v, 3.4, 4);
    bacteria.forEach((b, i) => {
      const shown = v >= b.appear * 0.9;
      const gone = eaten > (i + 1) / bacteria.length;
      b.mesh.visible = shown && !gone;
      b.mesh.position.copy(b.home);
    });

    // Mast cell degranulation in stage 1.
    const burst = ramp(v, 0.9, 1.7);
    granules.forEach((g) => {
      g.mesh.position.copy(mastAt).addScaledVector(g.dir, g.r + burst * 14);
      g.mesh.visible = burst < 0.98;
    });
    cloud.visible = v > 0.9 && v < 3.95;
    cloud.scale.setScalar(0.6 + 0.6 * ramp(v, 0.9, 2)).multiply(new THREE.Vector3(22, 16, 12));
    cloud.material.opacity = 0.14 * (1 - ramp(v, 3.5, 3.95));

    // Leaking fluid in stages 2–3.
    const leak = ramp(v, 1.9, 2.8) * (1 - ramp(v, 3.6, 4));
    fluid.forEach((f) => {
      f.mesh.visible = leak > 0.02;
      f.mesh.position.set(f.x, VESSEL_Y + r + leak * f.rise * (0.6 + 0.4 * f.phase), f.z);
      f.mesh.scale.setScalar(2.5 * leak);
    });

    // Neutrophils.
    neutrophils.forEach((n) => {
      const vv = v - n.delay;
      const roll = ramp(vv, 2.2, 2.75);
      const squeeze = ramp(vv, 2.75, 3.1);
      const crawl = ramp(vv, 3.1, 3.6);
      const fade = ramp(v, 3.85, 4);
      const inX = n.startX + (n.exitX - n.startX) * roll;
      const wallTop = VESSEL_Y + r;
      let pos;
      if (squeeze < 1) {
        const y = VESSEL_Y + (r - 6) * roll + squeeze * (wallTop + 6 - (VESSEL_Y + r - 6));
        pos = new THREE.Vector3(inX, y, -1.5);
        const s = 1 - 0.45 * Math.sin(squeeze * Math.PI);
        n.g.scale.set(1 / Math.sqrt(s), s, 1 / Math.sqrt(s));
      } else {
        const start = new THREE.Vector3(n.exitX, wallTop + 6, -1.5);
        pos = start.lerp(n.target, crawl);
        n.g.scale.setScalar(1);
      }
      n.g.position.copy(pos);
      n.g.visible = v > 1.8 && fade < 0.98;
      n.g.traverse((o) => {
        if (o.material && o.material.transparent) o.material.opacity = 0.85 * (1 - fade);
      });
    });
    // Macrophage reaches toward the bacteria while it eats.
    macrophage.position.copy(macAt).lerp(tip.clone().add(new THREE.Vector3(-8, -4, -4)), ramp(v, 3.2, 4));

    const stage = Math.max(0, Math.min(STAGES.length - 1, Math.floor(v + 1e-6)));
    controls.readout = STAGES[stage].text;
  }

  let hold = 0;
  const controls = {
    label: 'Stage',
    unit: '',
    min: 0,
    max: 4,
    step: 0.01,
    value: reducedMotion ? 3.3 : 0,
    format: (v) => STAGES[Math.max(0, Math.min(4, Math.floor(v + 1e-6)))].label,
    presets: [...STAGES.map((s, i) => ({ label: s.label, value: i })), { label: 'Play or pause', action: 'play' }],
    playing: !reducedMotion,
    readout: '',
    set(v) {
      controls.value = v;
      apply(v);
      return controls.readout;
    },
  };
  apply(controls.value);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    view: { target: [4, -1, -8], direction: [0.1, 0.14, 1] },
    focus: tip.toArray(),
    controls,
    update(dt, env = {}) {
      if (!(env.reducedMotion ?? reducedMotion)) flow += dt;
      if (controls.playing) {
        if (controls.value >= 4) {
          hold += dt;
          if (hold > 3) {
            hold = 0;
            controls.value = 0;
          }
        } else {
          controls.value = Math.min(4, controls.value + dt * 0.28);
        }
      }
      apply(controls.value);
    },
    dispose() {
      wallGeo.dispose();
      rbcGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
