// Tier 4: villi on the lining of the small intestine. 1 scene unit = 10 µm.
// A block of the lining about 1.6 mm across. Finger-like villi, each about
// 0.5 to 0.8 mm tall, stand on the surface; between their bases, crypts dip
// down into the tissue. One villus in the front row is cut in half to show
// its core: a blind-ended lymph vessel (the lacteal) in the middle and a net
// of capillaries just under the surface, arteriole in, venule out. The block's
// front face shows the layers below: the crypts, a thin muscle sheet
// (muscularis mucosae), the submucosa with its vessels, and the start of the
// muscle wall. Cells on the surface are suggested by the texture; goblet
// cells are drawn as pale dots.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, seeded, disposeTree, COLORS, ellipsoid } from './kit.js';

const W = 160; // block width (x), 1.6 mm
const D = 100; // block depth (z), 1.0 mm
const LAYERS = [
  // [top, bottom, color, card, label]
  [0, -26, 0xe8b3b6, 'intestinal-crypt', 'Mucosa with crypts'],
  [-26, -30, 0xb04a60, 'gut-wall', 'Muscularis mucosae (a thin muscle sheet)'],
  [-30, -58, 0xf1d2c4, 'gut-wall', 'Submucosa'],
  [-58, -70, 0xc4566a, 'gut-wall', 'Muscle wall (circular layer)'],
];

/** Villus outline [radius, height] in scene units: a rounded finger, slightly wider at its base. */
export function villusProfile(height, width) {
  const r = width / 2;
  const pts = [[r * 1.25, 0], [r * 1.05, height * 0.08], [r, height * 0.5], [r * 0.96, height * 0.85]];
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([r * 0.96 * Math.cos(a), height * 0.85 + r * Math.sin(a)]);
  }
  return pts;
}

export function buildVilli({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2305);
  const surfaceMat = M(0xe39aa0, { roughness: 0.48, tissue: 'organ', natural: 0xe8a09a, repeat: [2, 6] });

  // The block of wall under the villi, one slab per layer.
  for (const [top, bottom, color, card, label] of LAYERS) {
    const tissue = card === 'gut-wall' && color !== 0xf1d2c4 ? 'muscle' : 'organ';
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W, top - bottom, D), M(color, { roughness: 0.6, tissue, repeat: [3, 1] }));
    slab.position.set(0, (top + bottom) / 2, 0);
    root.add(pick(slab, card, label));
  }

  // Villi in staggered rows; the middle one of the front row is cut open.
  const villi = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 6; col++) {
      const x = -W / 2 + 14 + col * 26 + (row % 2) * 13 + (rand() - 0.5) * 5;
      const z = D / 2 - 14 - row * 24 + (rand() - 0.5) * 5;
      if (x > W / 2 - 8) continue;
      villi.push({ x, z, h: 52 + rand() * 24, w: 11 + rand() * 3, cut: row === 0 && col === 2 });
    }
  }
  const gobletMat = M(0xf8f1ff, { roughness: 0.3 });
  let cutVillus = null;
  for (const v of villi) {
    const prof = villusProfile(v.h, v.w).map(([r, y]) => new THREE.Vector2(r, y));
    // The cut villus keeps only its back half, so its core faces the viewer.
    const geo = v.cut ? new THREE.LatheGeometry(prof, 40, Math.PI / 2, Math.PI) : new THREE.LatheGeometry(prof, 28);
    const mesh = new THREE.Mesh(geo, v.cut ? M(0xe39aa0, { roughness: 0.48, tissue: 'organ', natural: 0xe8a09a, repeat: [2, 6], side: THREE.DoubleSide }) : surfaceMat);
    mesh.position.set(v.x, 0, v.z);
    root.add(pick(mesh, 'intestinal-villus', 'Villus'));
    if (v.cut) cutVillus = v;
    // Goblet cells: a scatter of pale dots up the villus.
    for (let k = 0; k < 9; k++) {
      const a = v.cut ? Math.PI / 2 + rand() * Math.PI : rand() * Math.PI * 2;
      const y = 6 + rand() * (v.h * 0.8);
      const r = v.w / 2 + 0.2;
      const g = ellipsoid([v.x + Math.sin(a) * r, y, v.z + Math.cos(a) * r], [0.9, 1.6, 0.9], gobletMat, 8);
      root.add(pick(g, 'goblet-cell', 'Goblet cell (makes mucus)'));
    }
  }

  // Crypts: pits between villus bases, drawn as dark openings on top and as tubes on the front face.
  const cryptMat = M(0x8a3e55, { roughness: 0.8 });
  for (let i = 0; i < 26; i++) {
    const x = -W / 2 + 6 + rand() * (W - 12);
    const z = -D / 2 + 6 + rand() * (D - 12);
    if (villi.some((v) => Math.hypot(v.x - x, v.z - z) < v.w * 0.8)) continue;
    const pit = new THREE.Mesh(new THREE.CircleGeometry(2.2, 14), cryptMat);
    pit.rotation.x = -Math.PI / 2;
    pit.position.set(x, 0.05, z);
    root.add(pick(pit, 'intestinal-crypt', 'Opening of a crypt'));
  }
  for (let i = 0; i < 9; i++) {
    const x = -W / 2 + 10 + i * 17.5;
    const crypt = new THREE.Mesh(new THREE.CapsuleGeometry(2.2, 18, 4, 10), cryptMat);
    crypt.position.set(x, -12, D / 2 + 0.05);
    crypt.scale.z = 0.15;
    root.add(pick(crypt, 'intestinal-crypt', 'Crypt (where new lining cells are made)'));
  }

  // Submucosal vessels on the front face.
  const art = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' });
  const vein = M(COLORS.vein, { roughness: 0.4, tissue: 'vein' });
  const lymph = M(COLORS.lymph, { roughness: 0.4, transparent: true, opacity: 0.9 });
  for (const [mat, y, r, card, label] of [[art, -40, 2.4, 'capillary', 'Small artery'], [vein, -47, 3.0, 'capillary', 'Small vein'], [lymph, -52, 1.8, 'lacteal', 'Lymph vessel']]) {
    root.add(pick(tubeThrough([[-W / 2, y, D / 2 - 4], [0, y + 1.5, D / 2 - 4], [W / 2, y, D / 2 - 4]], r, mat, 32, 8), card, label));
  }

  // Inside the cut villus: the lacteal up the middle and a capillary net under the surface.
  const v = cutVillus;
  const core = (dx, dy, dz) => [v.x + dx, dy, v.z + dz];
  root.add(pick(tubeThrough([core(0, -24, -2), core(0, 0, -1.5), core(0, v.h * 0.5, -1), core(0, v.h * 0.82, -1)], 1.4, lymph, 32, 10), 'lacteal', 'Lacteal (absorbs fat into lymph)'));
  const capR = v.w / 2 - 1.2;
  const up = [];
  const down = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const y = t * v.h * 0.86;
    up.push(core(-capR * Math.cos(t * 1.2), y, -capR * Math.sin(t * 1.2) * 0.6));
    down.push(core(capR * Math.cos(t * 1.2), y, -capR * Math.sin(t * 1.2) * 0.6));
  }
  const tip = core(0, v.h * 0.9, -capR * 0.7);
  root.add(pick(tubeThrough([core(-capR, -36, -2), ...up, tip], 0.9, art, 48, 8), 'capillary', 'Arteriole and capillaries (bring blood up the villus)'));
  root.add(pick(tubeThrough([tip, ...down.reverse(), core(capR, -44, -2)], 1.0, vein, 48, 8), 'capillary', 'Capillaries and venule (carry absorbed sugar away)'));
  for (let k = 1; k < 8; k++) {
    const y = (k / 8) * v.h * 0.8;
    const ring = [];
    for (let j = 0; j <= 8; j++) {
      const a = Math.PI / 2 + (j / 8) * Math.PI;
      ring.push(core(Math.sin(a) * capR, y + Math.sin(j) * 1.2, Math.cos(a) * capR));
    }
    root.add(pick(tubeThrough(ring, 0.45, art, 16, 5), 'capillary', 'Capillary net under the villus surface'));
  }
  // The cut edge: the single layer of absorbing cells that covers every villus.
  const edge = [];
  for (const [r, y] of villusProfile(v.h, v.w)) edge.push([v.x - r, y, v.z]);
  for (const [r, y] of villusProfile(v.h, v.w).reverse()) edge.push([v.x + r, y, v.z]);
  root.add(pick(tubeThrough(edge, 0.9, M(0xf4c5c8, { roughness: 0.35 }), 80, 6), 'enterocyte', 'Absorbing cells (enterocytes), one layer thick'));

  const focus = [v.x - v.w / 2, v.h * 0.6, v.z];
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-5,
    frameWidth: 2.6e-3,
    view: { target: [0, 6, 0], direction: [0.32, 0.5, 1] },
    focus,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
