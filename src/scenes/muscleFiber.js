// Tier 5: one skeletal muscle fiber (a single cell). 1 scene unit = 1 µm.
// 50 µm wide, opened along part of its length. Inside: myofibrils (1–2 µm),
// striped in register every 2.5 µm (one sarcomere), mitochondria between
// them, and many nuclei pressed against the cell membrane.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, seeded, disposeTree } from './kit.js';

const R = 25;
const LENGTH = 150;
const SARCOMERE = 2.5;
const CUT_CENTER = 0.6;
const CUT_HALF = 0.85;

/** A 1 × 20 stripe texture for one sarcomere: Z line, I band, A band, H zone, M line. */
export function sarcomereStripes(THREERef = THREE) {
  const bands = [
    // [fraction of the sarcomere, rgb]
    [0.04, [70, 40, 80]], // Z line
    [0.14, [246, 205, 216]], // I band (light)
    [0.2, [176, 62, 92]], // A band (dark, overlap)
    [0.08, [212, 104, 128]], // H zone (lighter)
    [0.04, [140, 40, 70]], // M line
    [0.08, [212, 104, 128]],
    [0.2, [176, 62, 92]],
    [0.22, [246, 205, 216]],
  ];
  const H = 50;
  const data = new Uint8Array(H * 4);
  let row = 0;
  for (const [frac, rgb] of bands) {
    const rows = Math.round(frac * H);
    for (let k = 0; k < rows && row < H; k++, row++) data.set([...rgb, 255], row * 4);
  }
  while (row < H) data.set([246, 205, 216, 255], row++ * 4);
  const tex = new THREERef.DataTexture(data, 1, H);
  tex.wrapS = THREERef.RepeatWrapping;
  tex.wrapT = THREERef.RepeatWrapping;
  tex.colorSpace = THREERef.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function buildMuscleFiber() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(67);
  const stripes = sarcomereStripes();
  stripes.repeat.set(1, LENGTH / SARCOMERE);

  // Membrane (sarcolemma): a closed tube on the left, opened on the right.
  const openLen = LENGTH * 0.6;
  const closedLen = LENGTH - openLen;
  const shellMat = M(0xffffff, { map: stripes, roughness: 0.55, side: THREE.DoubleSide });
  const closedGeo = new THREE.CylinderGeometry(R, R, closedLen, 72, 1, true);
  closedGeo.rotateZ(Math.PI / 2);
  const closed = new THREE.Mesh(closedGeo, shellMat);
  closed.position.x = -LENGTH / 2 + closedLen / 2;
  root.add(pick(closed, 'sarcolemma', 'Sarcolemma (cell membrane)'));
  const openGeo = new THREE.CylinderGeometry(R, R, openLen, 72, 1, true, CUT_CENTER + CUT_HALF, Math.PI * 2 - 2 * CUT_HALF);
  openGeo.rotateZ(Math.PI / 2);
  const open = new THREE.Mesh(openGeo, shellMat);
  open.position.x = LENGTH / 2 - openLen / 2;
  root.add(pick(open, 'sarcolemma', 'Sarcolemma (cell membrane)'));

  // Myofibrils, striped in register.
  const fibrils = [];
  for (let tries = 0; tries < 30000 && fibrils.length < 480; tries++) {
    const r = Math.sqrt(rand()) * (R - 2.4);
    const a = rand() * Math.PI * 2;
    const p = [Math.sin(a) * r, Math.cos(a) * r];
    if (fibrils.every((f) => Math.hypot(f[0] - p[0], f[1] - p[1]) > 1.95)) fibrils.push(p);
  }
  const fibGeo = new THREE.CylinderGeometry(0.85, 0.85, LENGTH - 0.5, 10, 1);
  fibGeo.rotateZ(Math.PI / 2);
  const fibMat = M(0xffffff, { map: stripes, roughness: 0.5 });
  const fibMesh = new THREE.InstancedMesh(fibGeo, fibMat, fibrils.length);
  const m4 = new THREE.Matrix4();
  fibrils.forEach(([y, z], i) => fibMesh.setMatrixAt(i, m4.makeTranslation(0, y, z)));
  root.add(pick(fibMesh, 'myofibril', 'Myofibril'));

  // Mitochondria between myofibrils.
  const mitoGeo = new THREE.CapsuleGeometry(0.5, 1.6, 4, 8);
  mitoGeo.rotateZ(Math.PI / 2);
  const mito = new THREE.InstancedMesh(mitoGeo, M(0xf2a65a, { roughness: 0.45 }), 160);
  for (let i = 0; i < 160; i++) {
    const r = Math.sqrt(rand()) * (R - 2);
    const a = rand() * Math.PI * 2;
    m4.makeTranslation(-LENGTH / 2 + rand() * LENGTH, Math.sin(a) * r, Math.cos(a) * r);
    mito.setMatrixAt(i, m4);
  }
  root.add(pick(mito, 'mitochondrion', 'Mitochondrion'));

  // Nuclei: flattened, just under the membrane, spread along the fiber.
  const nucMat = M(0x6d5bd0, { roughness: 0.4, emissive: 0x3d2f8c, emissiveIntensity: 0.3 });
  let branchFocus = null;
  // Nuclei in the opened section sit in the gap, just under where the
  // membrane was, so they show; the rest lie under the closed membrane.
  const openStart = LENGTH / 2 - openLen;
  for (let i = 0; i < 12; i++) {
    const inOpen = i < 7;
    const x = inOpen ? openStart + 6 + (i / 6) * (openLen - 12) : -LENGTH / 2 + 6 + ((i - 7) / 4) * (closedLen - 12);
    const a = inOpen ? CUT_CENTER + (rand() * 2 - 1) * CUT_HALF * 0.7 : rand() * Math.PI * 2;
    const pos = [x + (rand() - 0.5) * 4, Math.sin(a) * (R - 1.3), Math.cos(a) * (R - 1.3)];
    const n = ellipsoid(pos, [5, 1.2, 2.2], nucMat, 18);
    n.rotation.x = Math.PI / 2 - a; // thin axis points outward
    n.userData.pickPriority = 1;
    root.add(pick(n, 'muscle-nucleus', 'Nucleus'));
    if (!branchFocus && inOpen && x > 5) branchFocus = pos;
  }

  const fx = fibrils.reduce((best, f) => (Math.hypot(f[0] - Math.sin(CUT_CENTER) * 18, f[1] - Math.cos(CUT_CENTER) * 18) < Math.hypot(best[0] - Math.sin(CUT_CENTER) * 18, best[1] - Math.cos(CUT_CENTER) * 18) ? f : best), fibrils[0]);
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    view: { target: [12, 2, 0], direction: [0.3, 0.42, 0.86] },
    focus: [30, fx[0], fx[1]],
    branchFocus,
    dispose() {
      stripes.dispose();
      mitoGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
