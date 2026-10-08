// Tier 3: a block of thin skin from the forearm, cut on two sides. 1 scene unit = 0.1 mm.
// From the top: the epidermis (no blood vessels), the papillary dermis with
// its capillary loops and touch receptors, the dense reticular dermis, and
// the fatty hypodermis. Hair follicles with sebaceous glands and arrector
// pili muscles, coiled sweat glands with ducts to pores, two plexuses of
// blood vessels and a lamellated (Pacinian) corpuscle sit on the cut faces,
// half in and half out, as in a textbook block diagram.
// The control is temperature (OpenStax 5.2, 5.3): in the cold, dermal
// arterioles narrow and arrector pili pull the hairs upright; in the heat,
// arterioles widen and sweat glands pour sweat onto the surface.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, taperedTube, capsuleBetween, ellipsoid, seeded, disposeTree, COLORS } from './kit.js';
import { ramp } from './stages.js';

const W = 25; // half-width (x), 2.5 mm
const D = 14; // half-depth (z)
export const LAYERS = { epidermis: [-1, 0], papillary: [-3, -1], reticular: [-16, -3], hypodermis: [-30, -16] }; // y ranges, in 0.1 mm
const FRONT = D;
const SIDE = W;
/** The dermal–epidermal junction: dermal papillae push up into the epidermis. */
export const junctionY = (x, z = 0) => -1 + 0.35 * Math.sin(x * 2.1) * Math.cos(z * 1.7);

const TEXT = [
  'Cold. Arterioles in the dermis narrow, keeping warm blood away from the surface. The tiny arrector pili muscles contract and pull the hairs upright (goose bumps), trapping a layer of air.',
  'Comfortable. Blood flows through both networks of vessels, the hairs lie at a slant and the sweat glands make only the half liter or so of sweat a day that evaporates unnoticed.',
  'Hot. Arterioles in the dermis widen so blood can shed heat through the skin, and sweat glands pour sweat onto the surface, where it evaporates: as much as 0.7 to 1.5 liters an hour in an active person.',
];

export function buildSkinBlock() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(505);

  // Top surface, with a slight relief.
  const top = new THREE.PlaneGeometry(2 * W, 2 * D, 100, 56);
  top.rotateX(-Math.PI / 2);
  const tp = top.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, 0.06 * Math.sin(tp.getX(i) * 3.1 + tp.getZ(i) * 0.7) + 0.04 * Math.sin(tp.getZ(i) * 4.3));
  top.computeVertexNormals();
  const surface = new THREE.Mesh(top, M(0xd8b29a, { roughness: 0.5, tissue: 'skin', natural: 0xcbb2a2, repeat: [3, 2] }));
  root.add(pick(surface, 'skin', 'Skin surface'));

  // Cut faces: one band per layer on the front (z = +D) and the side (x = +W).
  const band = (y0, y1, color, card, label, opts = {}, wavyTop = false, wavyBottom = false) => {
    for (const face of ['front', 'side']) {
      const len = face === 'front' ? W : D;
      const s = new THREE.Shape();
      const n = 120;
      // The side face's shape x runs along world −z once it is turned to face +x.
      const yAt = (u) => (face === 'front' ? junctionY(u, FRONT) : junctionY(SIDE, -u));
      s.moveTo(-len, wavyBottom ? yAt(-len) : y0);
      for (let i = 1; i <= n; i++) {
        const u = -len + (2 * len * i) / n;
        s.lineTo(u, wavyBottom ? yAt(u) : y0);
      }
      for (let i = n; i >= 0; i--) {
        const u = -len + (2 * len * i) / n;
        s.lineTo(u, wavyTop ? yAt(u) : y1);
      }
      const m = new THREE.Mesh(new THREE.ShapeGeometry(s), M(color, { roughness: 0.65, ...opts }));
      if (face === 'front') m.position.z = FRONT;
      else {
        m.rotation.y = Math.PI / 2;
        m.position.x = SIDE;
      }
      root.add(pick(m, card, label));
    }
  };
  band(-1, 0, 0xe2b9a4, 'epidermis', 'Epidermis (no blood vessels)', {}, false, true);
  band(-3, -1, 0xe7a6a6, 'dermis', 'Papillary dermis (loose tissue, many small vessels)', {}, true, false);
  band(-16, -3, 0xd98e92, 'dermis', 'Reticular dermis (dense collagen and elastin)');
  band(-30, -16, 0xf0d58c, 'hypodermis', 'Hypodermis (fat and loose tissue)');
  // Wavy collagen bundles on the reticular dermis's cut face.
  const collagen = M(0xeab2b2, { roughness: 0.6 });
  for (let i = 0; i < 26; i++) {
    const y = -4 - rand() * 11.5;
    const x0 = -W + rand() * (2 * W - 14);
    const pts = Array.from({ length: 5 }, (_, k) => [x0 + k * 3.4, y + Math.sin(k * 1.7 + i) * 0.45, FRONT + 0.03]);
    root.add(pick(tubeThrough(pts, 0.12, collagen, 24, 4), 'dermis', 'Collagen bundles'));
  }
  // A thin dark line of melanin-rich basal cells along the junction (front face only).
  const basal = [];
  for (let i = 0; i <= 200; i++) {
    const x = -W + (2 * W * i) / 200;
    basal.push([x, junctionY(x, FRONT) + 0.12, FRONT + 0.02]);
  }
  root.add(pick(tubeThrough(basal, 0.09, M(0x9a6a52, { roughness: 0.6 }), 400, 4), 'epidermis', 'Stratum basale (the dividing layer, with melanocytes)'));

  // Fat cells along the cut faces of the hypodermis.
  const fatGeo = new THREE.SphereGeometry(1, 14, 10);
  const fatList = [];
  for (let tries = 0; tries < 9000 && fatList.length < 900; tries++) {
    const front = rand() < 0.62;
    const r = 0.55 + rand() * 0.35;
    const u = front ? -W + rand() * 2 * W : -D + rand() * 2 * D;
    const y = -16.6 - rand() * 12.8;
    const p = front ? new THREE.Vector3(u, y, FRONT - r * 0.55) : new THREE.Vector3(SIDE - r * 0.55, y, u);
    if (fatList.some((f) => f.p.distanceTo(p) < f.r + r)) continue;
    fatList.push({ p, r });
  }
  const fat = new THREE.InstancedMesh(fatGeo, M(0xf6df9c, { roughness: 0.35 }), fatList.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  fatList.forEach(({ p, r }, i) => fat.setMatrixAt(i, m4.compose(p, q, new THREE.Vector3(r, r, r))));
  root.add(pick(fat, 'hypodermis', 'Fat cells of the hypodermis'));

  // Blood vessels: deep and superficial plexuses (artery red, vein blue), joined by
  // arterioles, with capillary loops rising into the papillae.
  const artMat = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' });
  const veinMat = M(COLORS.vein, { roughness: 0.45, tissue: 'vein' });
  const vessels = [];
  const vessel = (pts, r, mat, label) => {
    const mesh = tubeThrough(pts, 1, mat, Math.max(16, pts.length * 10), 8);
    // Store the centre line so the radius can be changed (constriction and dilation).
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)));
    vessels.push({ mesh, r, curve, segs: Math.max(16, pts.length * 10) });
    root.add(pick(mesh, 'skin-vessels', label));
  };
  for (const [y, r, mat, label] of [
    [-15.5, 0.75, artMat, 'Artery of the deep plexus'],
    [-14.6, 0.95, veinMat, 'Vein of the deep plexus'],
    [-3.1, 0.38, artMat, 'Arteriole of the superficial plexus'],
    [-3.6, 0.45, veinMat, 'Venule of the superficial plexus'],
  ]) {
    const zOff = mat === artMat ? 0.3 : -0.9;
    vessel(Array.from({ length: 9 }, (_, i) => [-W + (2 * W * i) / 8, y + Math.sin(i * 1.3) * 0.3, FRONT + zOff]), r, mat, label);
  }
  for (const x of [-17, -2, 13]) {
    vessel([[x, -15.4, FRONT + 0.3], [x + 1.2, -9, FRONT + 0.3], [x + 0.4, -3.1, FRONT + 0.3]], 0.3, artMat, 'Arteriole linking the two networks');
  }
  for (let x = -W + 1.5; x < W - 1; x += 2.86) {
    const y0 = -3.1;
    const yTop = junctionY(x, FRONT) - 0.25;
    vessel([[x - 0.25, y0, FRONT + 0.2], [x - 0.2, yTop - 0.6, FRONT + 0.2], [x, yTop, FRONT + 0.2], [x + 0.2, yTop - 0.6, FRONT + 0.2], [x + 0.25, y0, FRONT + 0.2]], 0.1, M(0xd8505c, { roughness: 0.45 }), 'Capillary loop in a dermal papilla');
  }

  // Hair follicles, slanted, each with a sebaceous gland and an arrector pili muscle.
  const hairMat = M(0x3a2a22, { roughness: 0.45 });
  const follicleMat = M(0xe8c0aa, { roughness: 0.5 });
  const sebMat = M(0xf2e2a0, { roughness: 0.4 });
  const pili = M(0xc85a6a, { roughness: 0.5, tissue: 'muscle', repeat: [1, 2] });
  const hairs = [];
  for (const [hx, tilt] of [[-12, 0.62], [6, 0.55], [19, 0.6]]) {
    const g = new THREE.Group();
    g.position.set(hx, 0, FRONT);
    root.add(g);
    // Built upright along −y, then tilted about the exit point.
    const len = 19; // reaches the hypodermis
    g.add(pick(taperedTube([[0, 0.2, 0], [0, -len * 0.5, 0], [0, -len, 0]], (t) => 0.7 + 0.25 * t, follicleMat, 32, 14), 'hair-follicle', 'Hair follicle'));
    g.add(pick(ellipsoid([0, -len - 0.3, 0], [1.25, 1.5, 1.25], follicleMat, 20), 'hair-follicle', 'Hair bulb (where the hair grows)'));
    g.add(pick(ellipsoid([0, -len - 0.6, 0], [0.5, 0.75, 0.5], M(0xc0505a, { roughness: 0.45 }), 14), 'hair-follicle', 'Hair papilla (capillaries and nerve endings)'));
    const shaft = tubeThrough([[0, -len + 0.5, 0.3], [0, -6, 0.32], [0, 0, 0.32], [0.2, 6, 0.32], [1.6, 13, 0.3], [4, 18, 0.2]], 0.35, hairMat, 64, 8);
    g.add(pick(shaft, 'hair-follicle', 'Hair shaft (dead keratinized cells)'));
    for (const [dx, dy] of [[1.2, -5.2], [1.6, -6.4], [1.1, -7.3], [2, -5.6]]) {
      g.add(pick(ellipsoid([dx, dy, 0.2], [0.85, 0.8, 0.75], sebMat, 14), 'sebaceous-gland', 'Sebaceous gland (makes sebum)'));
    }
    g.rotation.z = tilt;
    hairs.push({ g, tilt, hx });
  }
  const piliMeshes = [];
  const updatePili = () => {
    for (const m of piliMeshes) {
      m.geometry.dispose();
      root.remove(m);
    }
    piliMeshes.length = 0;
    for (const { g, hx } of hairs) {
      // From the follicle below the gland up to the papillary dermis on the upper side.
      g.updateMatrixWorld(true);
      const a = new THREE.Vector3(1, -9.5, 0).applyMatrix4(g.matrixWorld);
      const b = new THREE.Vector3(hx + 6.2, -1.6, FRONT);
      const m = pick(capsuleBetween(a.toArray(), b.toArray(), 0.35, pili, 8), 'arrector-pili', 'Arrector pili muscle');
      root.add(m);
      piliMeshes.push(m);
    }
  };

  // Sweat glands: a coil deep in the dermis and a duct to a pore.
  const sweatMat = M(0x9fc8e8, { roughness: 0.4 });
  const drops = [];
  for (const sx of [-5, 12]) {
    const coil = [];
    for (let i = 0; i <= 80; i++) {
      const a = i * 0.55;
      coil.push([sx + Math.cos(a) * 1.3 + (i / 80) * 0.5, -14 + Math.sin(a * 0.5) * 0.9 + (i / 80) * 0.8, FRONT + Math.sin(a) * 1.0]);
    }
    const last = coil.at(-1);
    const duct = [last, [sx + 0.6, -9, FRONT + 0.2], [sx + 0.2, -4, FRONT + 0.2], [sx + 0.4, -1.2, FRONT + 0.2], [sx + 0.1, -0.6, FRONT + 0.2], [sx + 0.4, -0.2, FRONT + 0.2], [sx + 0.3, 0.05, FRONT + 0.2]];
    root.add(pick(tubeThrough(coil, 0.32, sweatMat, 400, 6), 'sweat-gland', 'Sweat gland (coiled deep in the dermis)'));
    root.add(pick(tubeThrough(duct, 0.2, sweatMat, 80, 6), 'sweat-gland', 'Sweat duct, rising to a pore'));
    const drop = ellipsoid([sx + 0.3, 0.3, FRONT + 0.2], [0.6, 0.45, 0.6], M(0xbfe6ff, { roughness: 0.05, transparent: true, opacity: 0.75 }), 16);
    root.add(pick(drop, 'sweat-gland', 'Sweat on the surface'));
    drops.push(drop);
  }
  // More pores and drops across the top surface.
  for (let i = 0; i < 14; i++) {
    const drop = ellipsoid([-W + 2 + rand() * (2 * W - 4), 0.25, -D + 2 + rand() * (2 * D - 5)], [0.5, 0.35, 0.5], M(0xbfe6ff, { roughness: 0.05, transparent: true, opacity: 0.75 }), 14);
    root.add(pick(drop, 'sweat-gland', 'Sweat on the surface'));
    drops.push(drop);
  }

  // Nerves and touch receptors.
  const nerveMat = M(0xf0d050, { roughness: 0.45, tissue: 'nerve' });
  root.add(pick(tubeThrough([[-W, -20, FRONT - 0.3], [-10, -19, FRONT - 0.3], [2, -19.5, FRONT - 0.3], [W, -18.5, FRONT - 0.3]], 0.45, nerveMat, 48, 8), 'touch-receptors', 'Nerve'));
  for (const x of [-20.6, -6.3, 8, 22.3]) {
    const y = junctionY(x, FRONT) - 0.75;
    root.add(pick(ellipsoid([x, y, FRONT + 0.15], [0.35, 0.6, 0.35], M(0xf5e6a8, { roughness: 0.45 }), 12), 'touch-receptors', 'Tactile (Meissner) corpuscle: light touch'));
    root.add(pick(tubeThrough([[x, y - 0.5, FRONT + 0.1], [x + 0.6, -8, FRONT], [x + 1, -19.2, FRONT - 0.3]], 0.1, nerveMat, 24, 4), 'touch-receptors', 'Sensory nerve fiber'));
  }
  const pac = new THREE.Group();
  pac.position.set(-1, -23, FRONT);
  for (let k = 0; k < 5; k++) {
    const s = 1 - k * 0.17;
    pac.add(pick(ellipsoid([0, 0, 0], [2.6 * s, 4.2 * s, 2.6 * s], M(0xf2ead8, { roughness: 0.35, transparent: true, opacity: 0.35 + k * 0.1, depthWrite: k === 4 }), 24), 'touch-receptors', 'Lamellated (Pacinian) corpuscle: vibration'));
  }
  pac.rotation.z = 0.4;
  root.add(pac);

  function pose(v) {
    const cold = 1 - ramp(v, 0, 0.5);
    const hot = ramp(v, 0.5, 1);
    for (const h of hairs) h.g.rotation.z = h.tilt * (1 - 0.55 * cold);
    updatePili();
    const scale = 1 - 0.4 * cold + 0.35 * hot;
    for (const vsl of vessels) {
      vsl.mesh.geometry.dispose();
      vsl.mesh.geometry = new THREE.TubeGeometry(vsl.curve, vsl.segs, vsl.r * scale, 8, false);
    }
    for (const d of drops) {
      d.visible = hot > 0.05;
      d.scale.setScalar(Math.max(0.001, hot));
    }
  }
  const controls = {
    label: 'Temperature',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0.5,
    format: (v) => (v < 0.25 ? 'Cold' : v > 0.75 ? 'Hot' : 'Comfortable'),
    presets: [
      { label: 'Cold', value: 0 },
      { label: 'Comfortable', value: 0.5 },
      { label: 'Hot', value: 1 },
    ],
    set(v) {
      controls.value = v;
      pose(v);
      return TEXT[v < 0.25 ? 0 : v > 0.75 ? 2 : 1];
    },
  };
  controls.set(0.5);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-4,
    frameWidth: 6e-3,
    view: { target: [1, -10, 2], direction: [0.55, 0.42, 1] },
    focus: [-9, junctionY(-9, FRONT) + 0.3, FRONT + 0.1],
    controls,
    dispose() {
      fatGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
