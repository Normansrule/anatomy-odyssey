// Tier 6: the filter itself, where blood becomes filtrate. 1 scene unit = 10 nm.
// A slab of the glomerular capillary wall, cut so its three layers show from
// the side: the capillary lining (endothelium), full of pores (fenestrations);
// the basement membrane, a mesh of protein fibers; and the interlocking foot
// processes of podocytes, with narrow filtration slits between them, bridged
// by the slit diaphragm. Blood is above, Bowman's space below.
// Molecules are drawn far larger than life, and far fewer: at this scale
// water, glucose and urea (all under 1 nm) would be specks. Substances under
// about 4 nm cross readily and most pass up to 8 nm (OpenStax 25.4).
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, ellipsoid, seeded, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

const W = 90; // half-width of the slab (x)
const D = 45; // half-depth (z)
export const LAYERS = { endothelium: [22, 26], basement: [-2, 22], feet: [-20, -2] }; // y ranges
export const SLIT = 4; // 40 nm between foot processes
export const FOOT_PITCH = 26;
export const PASS_NM = { readily: 4, most: 8 };

export const FILTER_STAGES = [
  { label: 'Blood', text: 'Blood presses down on the filter. It carries water, salts, glucose, urea and proteins such as albumin (orange), plus blood cells wider than this whole view.' },
  { label: 'Through the pores', text: 'Through the pores. The capillary lining is riddled with openings (fenestrations). Blood cells cannot fit through them; water and small molecules can.' },
  { label: 'Through the slits', text: 'Through the slits. Small molecules cross the basement membrane and slip between the podocytes’ foot processes into Bowman’s space. Under about 4 nm, things cross readily.' },
  { label: 'Held back', text: 'Held back. The basement membrane stops medium-to-large proteins, so albumin stays in the blood. What passes, the filtrate, is like plasma without its proteins.' },
];

export function buildFiltrationBarrier({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2527);

  // Endothelium: a thin sheet with round pores.
  const holes = [];
  for (let gx = -W + 12; gx < W - 6; gx += 17) {
    for (let gz = -D + 9; gz < D - 4; gz += 16) holes.push([gx + (rand() - 0.5) * 5, gz + (rand() - 0.5) * 5, 3.2 + rand() * 1.2]);
  }
  const sheet = new THREE.Shape();
  sheet.moveTo(-W, -D);
  sheet.lineTo(W, -D);
  sheet.lineTo(W, D);
  sheet.lineTo(-W, D);
  sheet.closePath();
  for (const [hx, hz, r] of holes) {
    const h = new THREE.Path();
    h.absarc(hx, -hz, r, 0, Math.PI * 2, true);
    sheet.holes.push(h);
  }
  const [e0, e1] = LAYERS.endothelium;
  const endo = new THREE.Mesh(new THREE.ExtrudeGeometry(sheet, { depth: e1 - e0, bevelEnabled: false, curveSegments: 14 }), M(0xf0b4c4, { roughness: 0.5 }));
  endo.rotation.x = -Math.PI / 2;
  endo.position.y = e0;
  root.add(pick(endo, 'fenestrated-endothelium', 'Capillary lining with pores (fenestrations)'));

  // Basement membrane: a translucent slab with a mesh of fibers inside.
  const [b0, b1] = LAYERS.basement;
  const gbm = new THREE.Mesh(new THREE.BoxGeometry(2 * W, b1 - b0, 2 * D), M(0x9fb4e8, { roughness: 0.8, transparent: true, opacity: 0.5, depthWrite: false }));
  gbm.position.y = (b0 + b1) / 2;
  root.add(pick(gbm, 'glomerular-basement-membrane', 'Basement membrane (a mesh of protein fibers)'));
  const fiberMat = M(0x7c8fd0, { roughness: 0.6 });
  for (let i = 0; i < 70; i++) {
    const a = [(rand() * 2 - 1) * W, b0 + 1 + rand() * (b1 - b0 - 2), (rand() * 2 - 1) * D];
    const dir = new THREE.Vector3(rand() - 0.5, (rand() - 0.5) * 0.3, rand() - 0.5).normalize().multiplyScalar(14 + rand() * 18);
    const b = [Math.max(-W, Math.min(W, a[0] + dir.x)), Math.max(b0 + 0.5, Math.min(b1 - 0.5, a[1] + dir.y)), Math.max(-D, Math.min(D, a[2] + dir.z))];
    root.add(pick(capsuleBetween(a, b, 0.35, fiberMat, 5), 'glomerular-basement-membrane', 'Collagen fiber in the basement membrane'));
  }

  // Podocyte foot processes, alternating between two cells, running front to back.
  const [f0, f1] = LAYERS.feet;
  const footA = M(0xc79be0, { roughness: 0.45 });
  const footB = M(0xa98ad8, { roughness: 0.45 });
  const slits = [];
  const feetX = [];
  for (let x = -W + 13; x <= W - 13; x += FOOT_PITCH) feetX.push(x);
  const halfW = (FOOT_PITCH - SLIT) / 2;
  const footH = f1 - f0;
  feetX.forEach((x, k) => {
    const foot = capsuleBetween([x, (f0 + f1) / 2, -D + halfW * 0.5], [x, (f0 + f1) / 2, D - halfW * 0.5], footH / 2, k % 2 ? footB : footA, 16);
    foot.scale.x = halfW / (footH / 2); // capsule local x stays world x: the axis runs along z
    root.add(pick(foot, 'podocyte', k % 2 ? 'Foot process of a second podocyte' : 'Foot process of a podocyte'));
    if (k < feetX.length - 1) slits.push(x + FOOT_PITCH / 2);
  });
  const diaMat = M(0xffe9a0, { roughness: 0.4, transparent: true, opacity: 0.55, emissive: 0xffe9a0, emissiveIntensity: 0.25, depthWrite: false });
  for (const sx of slits) {
    const dia = new THREE.Mesh(new THREE.BoxGeometry(SLIT, 0.6, 2 * D - 4), diaMat);
    dia.position.set(sx, f1 - 3, 0);
    root.add(pick(dia, 'podocyte', 'Slit diaphragm (bridges each filtration slit)'));
  }
  // The two podocytes' cell bodies and main arms, hanging in Bowman's space.
  [[-46, -24, footA, 0], [40, 16, footB, 1]].forEach(([cx, cz, mat, parity]) => {
    root.add(pick(ellipsoid([cx, -52, cz], [17, 13, 14], mat, 28), 'podocyte', 'Podocyte cell body'));
    root.add(pick(capsuleBetween([-W + 6, -27, cz], [W - 6, -27, cz], 3.4, mat, 10), 'podocyte', 'Main arm of a podocyte'));
    root.add(pick(capsuleBetween([cx, -40, cz], [cx, -27, cz], 4, mat, 10), 'podocyte', 'Podocyte'));
    feetX.forEach((x, k) => k % 2 === parity && root.add(pick(capsuleBetween([x, -27, cz], [x, f0 + 2, cz], 2.2, mat, 8), 'podocyte', 'Stalk joining a foot process to its arm')));
  });

  // A red blood cell above, in the capillary, drawn smaller than life to fit.
  const rbc = ellipsoid([-8, 66, -40], [170, 28, 75], M(COLORS.artery, { roughness: 0.42 }), 48);
  root.add(pick(rbc, 'red-blood-cell', 'Red blood cell, drawn smaller (a real one, about 7.8 µm across, is four times wider than this view)'));

  // Molecules, drawn far larger than life.
  const kinds = [
    { card: 'water-molecule', label: 'Water (drawn far larger)', color: 0x9fd4ff, r: 0.9, n: 70, passes: true },
    { card: 'glucose', label: 'Glucose (drawn far larger)', color: 0xffd36a, r: 1.2, n: 22, passes: true },
    { card: 'urea', label: 'Urea (drawn far larger): waste the kidney exists to remove', color: 0x9be37c, r: 1.15, n: 26, passes: true },
    { card: 'albumin', label: 'Albumin, the main blood protein (held back)', color: 0xf2a65a, r: 2.6, n: 12, passes: false },
  ];
  const movers = [];
  for (const k of kinds) {
    const mat = M(k.color, { roughness: 0.35, emissive: k.color, emissiveIntensity: 0.45 });
    for (let i = 0; i < k.n; i++) {
      const hole = holes[Math.floor(rand() * holes.length)];
      const slit = slits.reduce((best, s) => (Math.abs(s - hole[0]) < Math.abs(best - hole[0]) ? s : best), slits[0]);
      const z = hole[1] + (rand() - 0.5) * 2;
      const start = new THREE.Vector3(hole[0] + (rand() - 0.5) * 30, 29 + rand() * 12, Math.max(-D + 3, Math.min(D - 3, hole[1] + (rand() - 0.5) * 30)));
      const mesh = ellipsoid(start.toArray(), k.passes ? [k.r, k.r, k.r] : [k.r * 1.6, k.r * 0.7, k.r * 0.7], mat, 12);
      root.add(pick(mesh, k.card, k.label));
      movers.push({
        mesh,
        passes: k.passes,
        pts: [
          start,
          new THREE.Vector3(hole[0], e1 + 1.5, hole[1]),
          new THREE.Vector3(hole[0], b1 - 1.5, hole[1]),
          new THREE.Vector3(slit, f1, z),
          new THREE.Vector3(slit + (rand() - 0.5) * 2, f0 - 6 - rand() * 14, z + (rand() - 0.5) * 14),
        ],
        delay: rand() * 0.25,
      });
    }
  }
  const tmp = new THREE.Vector3();
  function apply(v) {
    for (const m of movers) {
      const p = m.pts;
      const d = m.delay;
      const t1 = ramp(v, 0.15 + d, 0.75 + d);
      const t2 = ramp(v, 0.8 + d, 1.25 + d);
      tmp.copy(p[0]).lerp(p[1], t1).lerp(p[2], t2);
      if (m.passes) {
        tmp.lerp(p[3], ramp(v, 1.3 + d, 1.95 + d));
        tmp.lerp(p[4], ramp(v, 2 + d * 0.5, 2.55 + d * 0.5));
      } else {
        // Albumin gets into a pore, meets the basement membrane, and is pushed back out.
        tmp.lerp(p[0], ramp(v, 2.15 + d, 2.85 + d));
      }
      m.mesh.position.copy(tmp);
    }
    diaMat.emissiveIntensity = 0.25 + 0.5 * ramp(v, 1.4, 2) * (1 - ramp(v, 2.6, 3));
  }
  const { controls, update } = stagedControls({ stages: FILTER_STAGES, apply, reducedMotion, rate: 0.26, still: 2.6 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-8,
    frameWidth: 1.9e-6,
    view: { target: [0, 2, 0], direction: [0.32, 0.26, 1] },
    focus: [slits[2], f1, 0],
    controls,
    update,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
