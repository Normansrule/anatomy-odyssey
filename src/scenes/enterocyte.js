// Tier 5: absorbing cells (enterocytes) lining a villus. 1 scene unit = 1 µm.
// Five tall cells stand side by side, about 8 µm wide and 26 µm tall, sealed
// together near the top by tight junctions. Each wears a brush border of
// microvilli about 1 µm long. The middle cell is drawn see-through so its
// nucleus, mitochondria and the path of a glucose molecule show. Below the
// cells: the basement membrane and a capillary.
// The stage control follows glucose: carried in from the gut with sodium by
// SGLT1, across the cell, out into the blood through GLUT2, while the
// sodium–potassium pump keeps sodium low inside. Molecules and transporters
// are drawn hundreds of times larger than life, and far fewer.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, ellipsoid, seeded, disposeTree, tubeThrough, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const CELL = { width: 8, height: 26, depth: 8, microvillusLength: 1.0 };
const N_CELLS = 5;
const TOP = CELL.height / 2;
const BOTTOM = -CELL.height / 2;

export const GLUCOSE_STAGES = [
  { label: 'In the gut', text: 'In the gut. Enzymes on the brush border have just split double sugars, such as those left from starch, into single sugars like glucose, right at the cell surface.' },
  { label: 'Into the cell', text: 'Into the cell. A carrier in the brush border (SGLT1) takes two sodium ions and one glucose in together. Sodium flowing in, down its gradient, drags the glucose in even though glucose is already more concentrated inside.' },
  { label: 'Across', text: 'Across the cell. Glucose collects in the cell and drifts toward its base. The tight junctions near the top stop it slipping back out between cells.' },
  { label: 'Into the blood', text: 'Into the blood. A different carrier at the base (GLUT2) lets glucose out, downhill, into the fluid around the capillary. The blood carries it first to the liver.' },
  { label: 'Pump', text: 'The pump. On the sides and base, the sodium–potassium pump spends ATP to push 3 sodium ions out and bring 2 potassium ions in, keeping sodium low inside so the next glucose can be carried in.' },
];

export function buildEnterocyte({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2306);
  const W = CELL.width;
  const D = CELL.depth;

  // The cells: rounded columns. The middle one is see-through.
  const cellMat = M(0xf0b6bf, { roughness: 0.5, tissue: 'organ', natural: 0xeaa8a8, repeat: [1, 3] });
  const glassMat = M(0xf6c9d0, { roughness: 0.35, transparent: true, opacity: 0.22, depthWrite: false });
  const columnGeo = new THREE.CapsuleGeometry(W / 2 - 0.15, CELL.height - W + 0.3, 6, 20);
  const middle = Math.floor(N_CELLS / 2);
  for (let i = 0; i < N_CELLS; i++) {
    const x = (i - middle) * W;
    const col = new THREE.Mesh(columnGeo, i === middle ? glassMat : cellMat);
    col.scale.z = D / W;
    col.position.set(x, 0, 0);
    root.add(pick(col, 'enterocyte', i === middle ? 'Absorbing cell (enterocyte), drawn see-through' : 'Absorbing cell (enterocyte)'));
    // Tight junction: a dark band sealing each cell to its neighbors near the top.
    const band = new THREE.Mesh(new THREE.TorusGeometry(W / 2 - 0.05, 0.22, 6, 32), M(0x6d3a63, { roughness: 0.5 }));
    band.rotation.x = Math.PI / 2;
    band.scale.y = D / W;
    band.position.set(x, TOP - 2.2, 0);
    root.add(pick(band, 'tight-junction', 'Tight junction (seals the gaps between cells)'));
  }
  // Nucleus and mitochondria in the see-through cell, ghosts of them in the others.
  const nucleusMat = M(COLORS.hematoxylin, { roughness: 0.5 });
  root.add(pick(ellipsoid([0, BOTTOM + 7.5, 0], [2.4, 4.0, 2.4], nucleusMat, 24), 'nucleus', 'Nucleus (near the base)'));
  const mitoMat = M(0xf2a65a, { roughness: 0.45 });
  for (let k = 0; k < 9; k++) {
    const y = BOTTOM + 13 + rand() * 9;
    const x = (rand() - 0.5) * 4.6;
    const z = (rand() - 0.5) * 4.6;
    root.add(pick(capsuleBetween([x, y, z], [x + (rand() - 0.5) * 0.6, y + 1.6, z + (rand() - 0.5) * 0.6], 0.35, mitoMat, 8), 'mitochondrion', 'Mitochondrion (makes the ATP the pump uses)'));
  }

  // Brush border: microvilli on top of every cell.
  const mvGeo = new THREE.CylinderGeometry(0.06, 0.06, CELL.microvillusLength, 5).translate(0, CELL.microvillusLength / 2, 0);
  const perSide = 14;
  const mv = new THREE.InstancedMesh(mvGeo, M(0xf7d2d8, { roughness: 0.4 }), N_CELLS * perSide * perSide);
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (let i = 0; i < N_CELLS; i++) {
    for (let a = 0; a < perSide; a++) {
      for (let b = 0; b < perSide; b++) {
        const x = (i - middle) * W + (a / (perSide - 1) - 0.5) * (W - 1.4);
        const z = (b / (perSide - 1) - 0.5) * (D - 1.4);
        const crown = TOP + 0.05 - ((x - (i - middle) * W) ** 2 + z ** 2) * 0.008;
        m4.makeTranslation(x, crown, z);
        mv.setMatrixAt(n++, m4);
      }
    }
  }
  root.add(pick(mv, 'brush-border', 'Microvilli (the brush border), each about 1 µm long'));

  // Basement membrane and the capillary below.
  const bm = new THREE.Mesh(new THREE.BoxGeometry(W * N_CELLS + 2, 0.3, D + 2), M(0xd8cdee, { roughness: 0.6 }));
  bm.position.y = BOTTOM - 0.4;
  root.add(pick(bm, 'enterocyte', 'Basement membrane'));
  const capY = BOTTOM - 4.5;
  root.add(pick(tubeThrough([[-W * 3, capY, -1], [0, capY - 0.5, 0], [W * 3, capY, 1]], 2.6, M(COLORS.artery, { roughness: 0.4, transparent: true, opacity: 0.7, tissue: 'vessel' }), 40, 16), 'capillary', 'Capillary (glucose enters the blood here)'));

  // Transporters on the middle cell: SGLT1 at the top, GLUT2 at the base, pumps on the sides.
  const sglt = M(0x7cc49a, { roughness: 0.35, emissive: 0x7cc49a, emissiveIntensity: 0.4 });
  const glut = M(0x9fb4e8, { roughness: 0.35, emissive: 0x9fb4e8, emissiveIntensity: 0.4 });
  const pump = M(0xf2a65a, { roughness: 0.35, emissive: 0xf2a65a, emissiveIntensity: 0.4 });
  const SGLT_AT = new THREE.Vector3(0.6, TOP - 0.4, 1.0);
  const GLUT_AT = new THREE.Vector3(-0.8, BOTTOM + 0.6, 1.2);
  const PUMP_AT = new THREE.Vector3(W / 2 - 0.35, BOTTOM + 4, 1.0);
  root.add(pick(ellipsoid(SGLT_AT.toArray(), [0.55, 0.7, 0.55], sglt, 14), 'sglt1', 'SGLT1: carries 2 sodium ions and 1 glucose in together'));
  root.add(pick(ellipsoid(GLUT_AT.toArray(), [0.55, 0.7, 0.55], glut, 14), 'glut2', 'GLUT2: lets glucose out to the blood'));
  root.add(pick(ellipsoid(PUMP_AT.toArray(), [0.6, 0.75, 0.6], pump, 14), 'sodium-potassium-pump', 'Sodium–potassium pump (3 Na⁺ out, 2 K⁺ in, per ATP)'));
  for (const p of [[-W / 2 + 0.35, BOTTOM + 7, -1.2], [W / 2 - 0.35, BOTTOM + 11, -0.8]]) root.add(pick(ellipsoid(p, [0.5, 0.65, 0.5], pump, 12), 'sodium-potassium-pump', 'Sodium–potassium pump'));

  // Glucose (hexagonal tokens) and sodium / potassium ions (spheres), enlarged.
  const hex = new THREE.CylinderGeometry(0.42, 0.42, 0.18, 6);
  const gluMat = M(0xf0dc96, { roughness: 0.3, emissive: 0xf0dc96, emissiveIntensity: 0.35 });
  const naMat = M(0x5a8deb, { roughness: 0.3, emissive: 0x5a8deb, emissiveIntensity: 0.3 });
  const kMat = M(0xb48ce8, { roughness: 0.3, emissive: 0xb48ce8, emissiveIntensity: 0.3 });
  const glucose = new THREE.Mesh(hex, gluMat);
  glucose.rotation.x = Math.PI / 2;
  root.add(pick(glucose, 'glucose', 'Glucose (drawn about 1,000 times too big)'));
  const ion = (mat, card, label) => {
    const m = ellipsoid([0, 0, 0], [0.22, 0.22, 0.22], mat, 10);
    root.add(pick(m, card, label));
    return m;
  };
  const na = [ion(naMat, 'sglt1', 'Sodium ion (Na⁺)'), ion(naMat, 'sglt1', 'Sodium ion (Na⁺)')];
  const pumpNa = [0, 1, 2].map(() => ion(naMat, 'sodium-potassium-pump', 'Sodium ion pumped out'));
  const pumpK = [0, 1].map(() => ion(kMat, 'sodium-potassium-pump', 'Potassium ion pumped in'));
  // A few other glucose molecules waiting in the gut and inside the cell, for context.
  for (let k = 0; k < 10; k++) {
    const g = new THREE.Mesh(hex, gluMat);
    const inside = k >= 6;
    g.position.set((rand() - 0.5) * W * 3, inside ? BOTTOM + 3 + rand() * 18 : TOP + 2 + rand() * 4, (rand() - 0.5) * 6);
    if (inside) g.position.x = (rand() - 0.5) * 4.5;
    g.rotation.set(rand() * 3, rand() * 3, 0);
    root.add(pick(g, 'glucose', 'Glucose'));
  }

  const path = new THREE.CatmullRomCurve3([
    new THREE.Vector3(1.6, TOP + 4.5, 1.5), SGLT_AT.clone().add(new THREE.Vector3(0, 1.6, 0)), SGLT_AT.clone(),
    new THREE.Vector3(0.2, TOP - 5, 1.6), new THREE.Vector3(-0.6, 0, 2.2), new THREE.Vector3(-0.9, BOTTOM + 3, 1.6), GLUT_AT.clone(),
    new THREE.Vector3(-0.5, BOTTOM - 1.4, 1.2), new THREE.Vector3(0.4, capY + 1.4, 0.8),
  ]);
  const at = (t) => path.getPointAt(Math.min(1, Math.max(0, t)));
  const T_SGLT = 0.24;
  const T_GLUT = 0.74;
  function apply(v) {
    // Glucose: lumen to SGLT1 (0–1), through and across (1–2.5), out by GLUT2 to the capillary (2.5–3.6).
    const t = v < 1 ? T_SGLT * ramp(v, 0, 1) : v < 2.6 ? T_SGLT + (T_GLUT - T_SGLT) * ramp(v, 1, 2.6) : T_GLUT + (1 - T_GLUT) * ramp(v, 2.6, 3.5);
    glucose.position.copy(at(t));
    // Sodium rides in with it through SGLT1, then lingers inside.
    na.forEach((m, k) => {
      const lane = new THREE.Vector3(k ? 0.7 : -0.7, 0, 0.4);
      const into = ramp(v, 0.6, 1.6);
      const from = SGLT_AT.clone().add(new THREE.Vector3(0, 2.2, 0)).add(lane);
      const to = SGLT_AT.clone().add(new THREE.Vector3(0, -3.0 - k, 0)).add(lane);
      m.position.copy(from.lerp(to, into));
    });
    // The pump: 3 Na⁺ out, 2 K⁺ in, in the last stage.
    const p = ramp(v, 3.4, 4);
    pumpNa.forEach((m, k) => m.position.copy(PUMP_AT.clone().add(new THREE.Vector3(-1.4 + 2.8 * p, -0.6 + k * 0.6, 0.2))));
    pumpK.forEach((m, k) => m.position.copy(PUMP_AT.clone().add(new THREE.Vector3(1.4 - 2.8 * p, -0.3 + k * 0.6, -0.3))));
    sglt.emissiveIntensity = 0.4 + 1.2 * Math.sin(Math.PI * ramp(v, 0.7, 1.4));
    glut.emissiveIntensity = 0.4 + 1.2 * Math.sin(Math.PI * ramp(v, 2.6, 3.2));
    pump.emissiveIntensity = 0.4 + 1.2 * Math.sin(Math.PI * ramp(v, 3.4, 4));
  }
  const { controls, update } = stagedControls({ stages: GLUCOSE_STAGES, apply, reducedMotion, rate: 0.28, still: 1.5 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 6.6e-5,
    view: { target: [0, -1.5, 0], direction: [0.3, 0.32, 1] },
    focus: glucose.position.toArray(),
    controls,
    update,
    dispose() {
      columnGeo.dispose();
      mvGeo.dispose();
      hex.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
