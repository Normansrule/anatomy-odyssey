// Tier 4: the epidermis of thin skin, layer by layer. 1 scene unit = 1 µm.
// Counted as in OpenStax 5.1: one layer of basal cells on a wavy junction
// with the dermis, 8 (of 8 to 10) layers of the stratum spinosum, 4 (of 3 to
// 5) of the stratum granulosum, and 18 (of 15 to 30) of flat, dead cells in
// the stratum corneum. Melanocytes sit among the basal cells and reach up with
// their branches; Langerhans cells patrol the spinosum; a Merkel cell touches
// a nerve ending. Below, capillary loops rise into the dermal papillae: the
// epidermis itself has no blood vessels.
// The stage control follows one keratinocyte from birth to being shed.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, capsuleBetween, ellipsoid, seeded, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

const W = 80;
const Z = [-20, -10, 0, 10, 20];
const FRONT_Z = 20;
export const STRATA = { basale: 1, spinosum: 8, granulosum: 4, corneum: 18 };
/** Height of the dermal–epidermal junction (dermal papillae are the crests). */
export const junction = (x) => 5 * Math.sin((2 * Math.PI * x) / 52);
const SPIN0 = 12; // centre of the first spinosum layer above the junction's mean
const SPIN_PITCH = 9;
const GRAN0 = SPIN0 + STRATA.spinosum * SPIN_PITCH - 2;
const GRAN_PITCH = 5.2;
const CORN0 = GRAN0 + STRATA.granulosum * GRAN_PITCH;
const CORN_PITCH = 0.95;
export const SURFACE_Y = CORN0 + STRATA.corneum * CORN_PITCH;

export const KERATINOCYTE_STAGES = [
  { label: 'Born', text: 'Born. Basal cells, a single layer on the wavy border with the dermis, keep dividing. One daughter stays as a stem cell; the other (glowing) starts its journey up as a keratinocyte.' },
  { label: 'Spinosum', text: 'Stratum spinosum: 8 to 10 layers. The cell makes the tough protein keratin and is tied to its neighbors by many anchoring junctions, which look like spines on a slide.' },
  { label: 'Granulosum', text: 'Stratum granulosum: 3 to 5 layers. The cell flattens, its membrane thickens, it fills with keratin and dark granules, and its nucleus and organelles break down.' },
  { label: 'Corneum', text: 'Stratum corneum: 15 to 30 layers of flat, dead cells, little more than keratin in a sealed envelope. Together they make a waterproof, protective outer layer.' },
  { label: 'Shed', text: 'Shed. Cells flake off the surface and are replaced from below: the whole stratum corneum is renewed about every 4 weeks.' },
];

export function buildEpidermis({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(5151);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const ball = new THREE.SphereGeometry(1, 16, 12);
  const poly = new THREE.IcosahedronGeometry(1, 1);
  const plate = new THREE.CylinderGeometry(1, 1, 1, 6);

  // Dermis: a block whose top follows the junction, cut on its front.
  const dermTop = new THREE.PlaneGeometry(2 * W, 48, 160, 8);
  dermTop.rotateX(-Math.PI / 2);
  const dp = dermTop.attributes.position;
  for (let i = 0; i < dp.count; i++) dp.setY(i, junction(dp.getX(i)) - 0.5);
  dermTop.computeVertexNormals();
  const dermMat = M(0xe7a6a6, { roughness: 0.7 });
  root.add(pick(new THREE.Mesh(dermTop, dermMat), 'dermis', 'Dermis (connective tissue under the epidermis)'));
  const face = new THREE.Shape();
  face.moveTo(-W, -45);
  face.lineTo(W, -45);
  for (let i = 160; i >= 0; i--) face.lineTo(-W + (2 * W * i) / 160, junction(-W + (2 * W * i) / 160) - 0.5);
  const dermFace = new THREE.Mesh(new THREE.ShapeGeometry(face), M(0xdc9696, { roughness: 0.7 }));
  dermFace.position.z = 24;
  root.add(pick(dermFace, 'dermis', 'Dermis, cut'));
  const fiberMat = M(0xf2c4c4, { roughness: 0.6 });
  for (let i = 0; i < 18; i++) {
    const y = -12 - rand() * 30;
    const x0 = -W + rand() * 60;
    root.add(pick(tubeThrough([[x0, y, 24.2], [x0 + 20, y + (rand() - 0.5) * 6, 24.2], [x0 + 45, y + (rand() - 0.5) * 6, 24.2], [x0 + 70, y, 24.2]], 0.9, fiberMat, 40, 5), 'dermis', 'Collagen fibers'));
  }
  // Capillary loops up into each papilla (the crests of the junction).
  const capMat = M(COLORS.artery, { roughness: 0.45 });
  for (const x of [-39, 13, 65]) {
    for (const z of [-12, 4, 18]) {
      const top = junction(x) - 3.5;
      root.add(pick(tubeThrough([[x - 3, -30, z], [x - 2.6, top - 6, z], [x, top, z], [x + 2.6, top - 6, z], [x + 3, -30, z]], 1.6, capMat, 40, 8), 'capillary', 'Capillary loop in a dermal papilla (the epidermis has none)'));
    }
  }

  // Keratinocytes, layer by layer (instanced).
  const basalPts = [];
  for (let x = -W + 4; x <= W - 4; x += 8.2) for (const z of Z) basalPts.push([x, junction(x) + 5.6, z]);
  const melanocyteAt = new Set([3, 37, 61, 92].map((i) => i % basalPts.length));
  const basalCells = basalPts.filter((_, i) => !melanocyteAt.has(i));
  const basal = new THREE.InstancedMesh(ball, M(0xb0708a, { roughness: 0.55 }), basalCells.length);
  basalCells.forEach((p, i) => basal.setMatrixAt(i, m4.compose(new THREE.Vector3(...p), q, new THREE.Vector3(3.9, 5.4, 3.9))));
  root.add(pick(basal, 'stratum-basale', 'Basal cell (stratum basale: the dividing layer)'));

  const spin = [];
  for (let k = 0; k < STRATA.spinosum; k++) {
    for (let x = -W + 5 + (k % 2) * 5; x <= W - 4; x += 10) {
      for (const z of Z) spin.push([x + (rand() - 0.5), SPIN0 + k * SPIN_PITCH + junction(x) * 0.7 * (1 - k / STRATA.spinosum), z + (k % 2) * 2]);
    }
  }
  const spinosum = new THREE.InstancedMesh(poly, M(0xc888a0, { roughness: 0.55 }), spin.length);
  spin.forEach((p, i) => {
    e.set(rand() * 3, rand() * 3, rand() * 3);
    spinosum.setMatrixAt(i, m4.compose(new THREE.Vector3(...p), q.clone().setFromEuler(e), new THREE.Vector3(5.1, 4.6, 5.1)));
  });
  root.add(pick(spinosum, 'stratum-spinosum', 'Keratinocyte of the stratum spinosum'));

  const gran = [];
  for (let k = 0; k < STRATA.granulosum; k++) {
    for (let x = -W + 6 + (k % 2) * 6; x <= W - 6; x += 12.5) for (const z of Z) gran.push([x, GRAN0 + k * GRAN_PITCH, z + (k % 2) * 3]);
  }
  const granulosum = new THREE.InstancedMesh(ball, M(0xb88aa8, { roughness: 0.5 }), gran.length);
  gran.forEach((p, i) => granulosum.setMatrixAt(i, m4.compose(new THREE.Vector3(...p), q.identity(), new THREE.Vector3(6.6, 2.5, 6.6))));
  root.add(pick(granulosum, 'stratum-granulosum', 'Keratinocyte of the stratum granulosum (flattening)'));
  const granules = new THREE.InstancedMesh(ball, M(0x5a3060, { roughness: 0.4 }), gran.length * 4);
  gran.forEach((p, i) => {
    for (let k = 0; k < 4; k++) {
      granules.setMatrixAt(i * 4 + k, m4.compose(new THREE.Vector3(p[0] + (rand() - 0.5) * 8, p[1] + 1.6, p[2] + (rand() - 0.5) * 8), q.identity(), new THREE.Vector3(0.7, 0.7, 0.7)));
    }
  });
  root.add(pick(granules, 'stratum-granulosum', 'Keratohyalin granule'));

  const corn = [];
  for (let k = 0; k < STRATA.corneum; k++) {
    for (let x = -W + 8 + (k % 3) * 5; x <= W - 7; x += 16) for (const z of [-16, 0, 16]) corn.push([x, CORN0 + k * CORN_PITCH, z + (k % 2) * 5]);
  }
  const corneum = new THREE.InstancedMesh(plate, M(0xead8c8, { roughness: 0.6 }), corn.length);
  corn.forEach((p, i) => {
    e.set(0, rand() * 3, 0);
    corneum.setMatrixAt(i, m4.compose(new THREE.Vector3(...p), q.clone().setFromEuler(e), new THREE.Vector3(9.5, 0.75, 9.5)));
  });
  root.add(pick(corneum, 'stratum-corneum', 'Dead, flattened cell of the stratum corneum'));

  // Nuclei in the front row, shrinking upward; melanin caps over the basal nuclei.
  const nuc = [];
  for (const p of basalCells) if (p[2] === FRONT_Z) nuc.push([p[0], p[1] - 0.8, p[2] + 1.8, 2.2, 2.6]);
  for (const p of spin) if (Math.abs(p[2] - FRONT_Z) < 3) nuc.push([p[0], p[1], p[2] + 2.4, 2.3, 2.1]);
  for (const p of gran) if (Math.abs(p[2] - FRONT_Z) < 4) nuc.push([p[0], p[1], p[2] + 3, 1.5, 0.9]);
  const nuclei = new THREE.InstancedMesh(ball, M(COLORS.hematoxylin, { roughness: 0.5 }), nuc.length);
  nuc.forEach(([x, y, z, r, h], i) => nuclei.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q.identity(), new THREE.Vector3(r, h, r))));
  root.add(pick(nuclei, 'keratinocyte', 'Nucleus of a keratinocyte'));
  const capPts = basalCells.filter((p) => p[2] === FRONT_Z).flatMap((p) => Array.from({ length: 7 }, () => [p[0] + (rand() - 0.5) * 3.6, p[1] + 2.2 + rand() * 0.8, p[2] + 2.6 + rand() * 1.2]));
  const caps = new THREE.InstancedMesh(ball, M(0x5a3a28, { roughness: 0.45 }), capPts.length);
  capPts.forEach((p, i) => caps.setMatrixAt(i, m4.compose(new THREE.Vector3(...p), q.identity(), new THREE.Vector3(0.45, 0.45, 0.45))));
  root.add(pick(caps, 'melanocyte', 'Melanin granules, capping the nucleus on the sunny side'));

  // Melanocytes with branches reaching up between keratinocytes.
  const melMat = M(0x5a3a28, { roughness: 0.45 });
  for (const i of melanocyteAt) {
    const [x, y, z] = basalPts[i];
    root.add(pick(ellipsoid([x, y - 1, z], [3.6, 3.4, 3.6], melMat, 18), 'melanocyte', 'Melanocyte (makes melanin)'));
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + rand();
      const tip = [x + Math.cos(a) * 12, y + 14 + rand() * 12, z + Math.sin(a) * 8];
      root.add(pick(capsuleBetween([x, y + 1, z], tip, 0.6, melMat, 6), 'melanocyte', 'Branch of a melanocyte, handing melanin to keratinocytes'));
    }
  }
  // Langerhans cells: star-shaped immune cells in the spinosum.
  const lgMat = M(0x9fd4a8, { roughness: 0.45, emissive: 0x7cc49a, emissiveIntensity: 0.15 });
  for (const [x, y, z] of [[-48, 44, 22], [22, 58, 22], [58, 36, 22]]) {
    root.add(pick(ellipsoid([x, y, z], [3, 3, 3], lgMat, 16), 'langerhans-cell', 'Langerhans cell (immune sentinel)'));
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + 0.3;
      root.add(pick(capsuleBetween([x, y, z], [x + Math.cos(a) * 11, y + Math.sin(a) * 9, z + (rand() - 0.5) * 3], 0.5, lgMat, 6), 'langerhans-cell', 'Branch of a Langerhans cell'));
    }
  }
  // A Merkel cell in the basal layer, on a nerve ending.
  const mx = -12;
  const my = junction(mx) + 4;
  root.add(pick(ellipsoid([mx, my, 23], [3.2, 2.6, 2.4], M(0xe8e0c8, { roughness: 0.45 }), 16), 'merkel-cell', 'Merkel cell (senses light touch)'));
  root.add(pick(tubeThrough([[mx - 1, my - 2.5, 23.5], [mx - 2, -14, 24.2], [mx + 8, -40, 24.2]], 0.7, M(0xf0d050, { roughness: 0.45 }), 24, 6), 'merkel-cell', 'Nerve ending under the Merkel cell'));

  // The glowing keratinocyte that makes the journey (drawn in front of the layers).
  const hx = 4;
  const startY = junction(hx) + 5.6;
  const glowMat = M(0xffb6d0, { roughness: 0.4, emissive: 0xff7aa8, emissiveIntensity: 0.55 });
  const hero = pick(new THREE.Mesh(ball, glowMat), 'keratinocyte', 'Keratinocyte on its way up (glowing)');
  const heroPlate = pick(new THREE.Mesh(plate, glowMat), 'keratinocyte', 'The same cell, now dead and flat');
  const heroNuc = pick(new THREE.Mesh(ball, M(COLORS.hematoxylin, { roughness: 0.5 })), 'keratinocyte', 'Its nucleus');
  root.add(hero, heroPlate, heroNuc);
  const keys = [
    [0, [hx, startY, 26], [3.9, 5.4, 3.9]],
    [1, [hx + 2, SPIN0 + 4 * SPIN_PITCH, 26], [5.1, 4.6, 5.1]],
    [2, [hx + 4, GRAN0 + 1.5 * GRAN_PITCH, 26], [6.6, 2.5, 6.6]],
    [3, [hx + 6, CORN0 + 10 * CORN_PITCH, 26], [9.5, 0.75, 9.5]],
    [4, [hx + 16, SURFACE_Y + 14, 30], [9.5, 0.75, 9.5]],
  ];
  const at = new THREE.Vector3();
  const sc = new THREE.Vector3();
  function apply(v) {
    const i = Math.min(3, Math.floor(v));
    const f = ramp(v, i + 0.15, i + 0.85);
    const [, p0, s0] = keys[i];
    const [, p1, s1] = keys[i + 1];
    at.set(...p0).lerp(new THREE.Vector3(...p1), f);
    sc.set(...s0).lerp(new THREE.Vector3(...s1), f);
    const flat = v > 2.6;
    hero.visible = !flat;
    heroPlate.visible = flat;
    hero.position.copy(at);
    hero.scale.copy(sc);
    heroPlate.position.copy(at);
    heroPlate.scale.set(sc.x, Math.max(0.75, sc.y), sc.z);
    heroPlate.rotation.set(0.5 * ramp(v, 3.2, 4), 0, 0.35 * ramp(v, 3.2, 4));
    const n = 1 - ramp(v, 1.6, 2.6);
    heroNuc.visible = n > 0.02;
    heroNuc.position.set(at.x, at.y, at.z + 2.5);
    heroNuc.scale.set(2.2 * n + 0.01, 2.4 * n * (1 - 0.4 * ramp(v, 1, 2)) + 0.01, 2.2 * n + 0.01);
  }
  const { controls, update } = stagedControls({ stages: KERATINOCYTE_STAGES, apply, reducedMotion, rate: 0.22, still: 2 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 2.2e-4,
    view: { target: [0, 40, 0], direction: [0.32, 0.18, 1] },
    focus: [hx, startY, 26],
    controls,
    update,
    dispose() {
      ball.dispose();
      poly.dispose();
      plate.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
