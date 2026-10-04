// Tier 5: the air–blood barrier. 1 scene unit = 1 µm.
// Above: air in an alveolus. Below: a pulmonary capillary about 8 µm wide,
// cut open, with a red blood cell passing through. Between them: a barrier
// averaging about 0.6 µm, made of a flat type I alveolar cell, a shared
// basement membrane and the capillary's endothelial cell (the front edge
// shows the three layers in section). Oxygen diffuses down, carbon dioxide up.
// The control follows one red blood cell through its ~0.75 s transit.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, seeded, disposeTree } from './kit.js';
import { rbcGeometry } from './rbcShape.js';
import { capillaryPO2, hillSaturation, LUNG_TRANSIT_S } from '../science/equations.js';

const CAP_Y = -4.45; // capillary axis
const CAP_R = 4.15;
const LEN = 34;
const SLAB_Z = [-7, 2.5]; // back and front edges of the barrier sheet

export function buildGasExchange({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(31);

  // Capillary: back half of an open tube, running along x.
  const capGeo = new THREE.CylinderGeometry(CAP_R, CAP_R, LEN, 48, 1, true, Math.PI * 0.5, Math.PI * 1.15);
  const cap = new THREE.Mesh(capGeo, M(0xb9a6ee, { roughness: 0.55, side: THREE.DoubleSide }));
  cap.rotation.z = Math.PI / 2;
  cap.position.y = CAP_Y;
  root.add(pick(cap, 'pulmonary-capillary', 'Capillary wall (endothelium)'));
  const plasma = new THREE.Mesh(new THREE.CylinderGeometry(CAP_R - 0.2, CAP_R - 0.2, LEN, 32, 1, false), M(0xf2d98a, { transparent: true, opacity: 0.1, depthWrite: false }));
  plasma.rotation.z = Math.PI / 2;
  plasma.position.y = CAP_Y;
  root.add(pick(plasma, 'pulmonary-capillary', 'Plasma'));

  // The barrier: three thin layers laid over the top of the capillary.
  const depth = SLAB_Z[1] - SLAB_Z[0];
  const layer = (y0, y1, color, label) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(LEN, y1 - y0, depth), M(color, { roughness: 0.5 }));
    m.position.set(0, (y0 + y1) / 2, (SLAB_Z[0] + SLAB_Z[1]) / 2);
    root.add(pick(m, 'air-blood-barrier', label));
  };
  layer(-0.3, -0.06, 0xb9a6ee, 'Capillary endothelial cell');
  layer(-0.06, 0.08, 0xe8d9a8, 'Fused basement membrane');
  layer(0.08, 0.32, 0xf3b6c9, 'Type I alveolar cell');
  const film = new THREE.Mesh(new THREE.BoxGeometry(LEN, 0.06, depth), M(0xffe07a, { transparent: true, opacity: 0.55, depthWrite: false }));
  film.position.set(0, 0.36, (SLAB_Z[0] + SLAB_Z[1]) / 2);
  root.add(pick(film, 'surfactant', 'Surfactant film'));

  // A type II cell, which makes surfactant, bulging up from the wall.
  const t2 = ellipsoid([-11.5, 1.6, -2], [3.2, 1.9, 2.8], M(0xf0a8c4, { roughness: 0.45, transparent: true, opacity: 0.75 }), 28);
  root.add(pick(t2, 'type-ii-cell', 'Type II alveolar cell'));
  for (let i = 0; i < 7; i++) {
    const lb = ellipsoid([-11.5 + (rand() - 0.5) * 3.6, 1.9 + (rand() - 0.2) * 1.2, -2 + (rand() - 0.5) * 3], [0.45, 0.45, 0.45], M(0xffe07a, { roughness: 0.35 }), 10);
    lb.userData.pickPriority = 1;
    root.add(pick(lb, 'surfactant', 'Lamellar body (stored surfactant)'));
  }

  // An alveolar macrophage crawling over the surface.
  const mac = ellipsoid([11, 1.7, -3], [2.6, 1.3, 2.2], M(0x9b7bf0, { roughness: 0.5 }), 24);
  root.add(pick(mac, 'alveolar-macrophage', 'Alveolar macrophage'));

  // The red blood cell, traveling along the capillary; its color follows its oxygen load.
  const rbcGeo = rbcGeometry(1, { segments: 48 });
  const rbcMat = M(0x8a2440, { roughness: 0.45 });
  const rbc = new THREE.Mesh(rbcGeo, rbcMat);
  rbc.rotation.z = Math.PI / 2;
  rbc.position.y = CAP_Y;
  root.add(pick(rbc, 'hemoglobin', 'Red blood cell, packed with hemoglobin'));
  const trailing = new THREE.Mesh(rbcGeo, M(0x7a1f3d, { roughness: 0.45 }));
  trailing.rotation.z = Math.PI / 2;
  trailing.position.set(-15, CAP_Y, 0);
  root.add(pick(trailing, 'hemoglobin', 'Red blood cell, just arriving'));
  const venous = new THREE.Color(0x6e1c3a);
  const arterial = new THREE.Color(0xe8364f);

  // Gas molecules (hugely enlarged): O₂ drifting down, CO₂ drifting up.
  const gasGeo = new THREE.SphereGeometry(0.2, 8, 6);
  const N = 36;
  const o2 = new THREE.InstancedMesh(gasGeo, M(0xff5a5a, { roughness: 0.3, emissive: 0xff5a5a, emissiveIntensity: 0.35 }), N * 2);
  const co2 = new THREE.InstancedMesh(gasGeo, M(0x6b6480, { roughness: 0.4 }), N * 3);
  root.add(pick(o2, 'o2-co2', 'Oxygen (O₂), enlarged'));
  root.add(pick(co2, 'o2-co2', 'Carbon dioxide (CO₂), enlarged'));
  const gas = Array.from({ length: N }, () => ({ x: (rand() - 0.5) * LEN * 0.8, z: SLAB_Z[0] + rand() * (depth - 0.5), phase: rand(), wobble: rand() * 6 }));
  const m4 = new THREE.Matrix4();
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const p = new THREE.Vector3();

  let flow = 0;
  let clock = 0;
  function drawGas(strength) {
    gas.forEach((g, i) => {
      const f = (g.phase + clock * 0.35) % 1;
      const show = (i / N) < 0.25 + strength * 0.75;
      // O₂: from the air (y ≈ 6) down into the capillary (y ≈ −4).
      const yo = 6 - f * 10.5;
      p.set(g.x + Math.sin(f * 6 + g.wobble) * 0.5, yo, g.z);
      if (show) {
        o2.setMatrixAt(i * 2, m4.makeTranslation(p.x - 0.14, p.y, p.z));
        o2.setMatrixAt(i * 2 + 1, m4.makeTranslation(p.x + 0.14, p.y + 0.05, p.z));
      } else {
        o2.setMatrixAt(i * 2, hide);
        o2.setMatrixAt(i * 2 + 1, hide);
      }
      // CO₂: from the blood up into the air, a little offset.
      const yc = -4 + ((f + 0.5) % 1) * 10.5;
      p.set(-g.x * 0.9 + Math.cos(f * 5 + g.wobble) * 0.5, yc, g.z * 0.8);
      const showC = (i / N) < 0.25 + strength * 0.75;
      for (let k = 0; k < 3; k++) co2.setMatrixAt(i * 3 + k, showC ? m4.makeTranslation(p.x + (k - 1) * 0.3, p.y, p.z) : hide);
    });
    o2.instanceMatrix.needsUpdate = true;
    co2.instanceMatrix.needsUpdate = true;
  }

  const controls = {
    label: 'Time in the capillary',
    unit: 's',
    min: 0,
    max: LUNG_TRANSIT_S,
    step: 0.01,
    value: reducedMotion ? 0.25 : 0,
    format: (v) => v.toFixed(2),
    presets: [
      { label: 'Arrives', value: 0 },
      { label: 'A third of the way', value: 0.25 },
      { label: 'Leaves', value: LUNG_TRANSIT_S },
      { label: 'Play or pause', action: 'play' },
    ],
    playing: !reducedMotion,
    readout: '',
    set(v) {
      controls.value = v;
      const po2 = capillaryPO2(v);
      const sat = hillSaturation(po2);
      rbc.position.x = -LEN * 0.36 + (v / LUNG_TRANSIT_S) * LEN * 0.72;
      rbcMat.color.copy(venous).lerp(arterial, Math.min(1, Math.max(0, (sat - 0.72) / 0.26)));
      flow = Math.max(0, (100 - po2) / 60);
      controls.readout = `${v.toFixed(2)} s in: blood oxygen ${Math.round(po2)} mmHg, hemoglobin ${Math.round(sat * 100)}% loaded. ${v < 0.25 ? 'Oxygen is still pouring in.' : 'Already balanced with the air, with most of the trip to spare.'}`;
      return controls.readout;
    },
  };
  controls.set(controls.value);
  drawGas(flow);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    view: { target: [0, -1.2, 0], direction: [0.2, 0.3, 1] },
    focus: [rbc.position.x, CAP_Y, 0],
    controls,
    update(dt) {
      if (reducedMotion) return;
      clock += dt;
      if (controls.playing) {
        // Shown 8 times slower than life; a short pause before the next cell.
        const next = controls.value + dt / 8;
        controls.set(next > LUNG_TRANSIT_S + 0.1 ? 0 : Math.min(LUNG_TRANSIT_S, next));
        if (next > LUNG_TRANSIT_S) controls.value = next;
      }
      drawGas(flow);
    },
    dispose() {
      capGeo.dispose();
      rbcGeo.dispose();
      gasGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
