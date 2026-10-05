// Tier 4: one fascicle (a bundle of muscle fibers). 1 scene unit = 10 µm.
// About 1.2 mm across, cut at one end so each fiber's cross-section shows.
// Fibers are 50–80 µm wide; capillaries run between them.
import * as THREE from 'three/webgpu';
import { materialBank, pick, seeded, disposeTree } from './kit.js';

const R = 60;
const LENGTH = 170;

export function buildFascicle() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(61);

  // Pack fiber cross-sections in the disc (random sequential packing).
  const fibers = [];
  for (let tries = 0; tries < 20000 && fibers.length < 320; tries++) {
    const r = Math.sqrt(rand()) * (R - 2.5);
    const a = rand() * Math.PI * 2;
    const y = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const size = 2.5 + rand() * 1.5;
    if (Math.hypot(y, z) + size > R - 0.8) continue;
    if (fibers.every((f) => Math.hypot(f.y - y, f.z - z) > f.size + size + 0.35)) fibers.push({ y, z, size });
  }
  const fiberGeo = new THREE.CylinderGeometry(1, 1, 1, 18);
  fiberGeo.rotateZ(Math.PI / 2); // along x
  const fiberMat = M(0xd65a6e, { roughness: 0.55, tissue: 'muscle', repeat: [1, 0.5] });
  const mesh = new THREE.InstancedMesh(fiberGeo, fiberMat, fibers.length);
  const endGeo = new THREE.CircleGeometry(1, 18);
  endGeo.rotateY(Math.PI / 2);
  const ends = new THREE.InstancedMesh(endGeo, M(0xf08baf, { roughness: 0.7, tissue: 'muscle', repeat: [0.3, 0.3] }), fibers.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  fibers.forEach((f, i) => {
    // Stagger the cut ends a little so the bundle reads as separate fibers.
    const len = LENGTH - rand() * 10;
    f.endX = -LENGTH / 2 + len;
    m4.compose(new THREE.Vector3(-LENGTH / 2 + len / 2, f.y, f.z), q, new THREE.Vector3(len, f.size, f.size));
    mesh.setMatrixAt(i, m4);
    m4.compose(new THREE.Vector3(f.endX + 0.02, f.y, f.z), q, new THREE.Vector3(1, f.size, f.size));
    ends.setMatrixAt(i, m4);
  });
  root.add(pick(mesh, 'muscle-fiber', 'Muscle fiber'));
  root.add(pick(ends, 'muscle-fiber', 'Muscle fiber (cut end)'));

  // Perimysium: translucent sheath around the bundle (back half).
  const sheathGeo = new THREE.CylinderGeometry(R, R, LENGTH - 12, 64, 1, true, Math.PI / 2, Math.PI);
  sheathGeo.rotateZ(Math.PI / 2);
  const sheath = new THREE.Mesh(sheathGeo, M(0xe8d7e4, { roughness: 0.5, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, tissue: 'fascia' }));
  sheath.position.x = -6;
  root.add(pick(sheath, 'perimysium', 'Perimysium'));

  // Capillaries in the gaps between fibers.
  const capMat = M(0xd9434f, { roughness: 0.4, tissue: 'vessel' });
  const capGeo = new THREE.CylinderGeometry(0.45, 0.45, LENGTH - 8, 8);
  capGeo.rotateZ(Math.PI / 2);
  const caps = [];
  for (let tries = 0; tries < 6000 && caps.length < 70; tries++) {
    const r = Math.sqrt(rand()) * (R - 3);
    const a = rand() * Math.PI * 2;
    const y = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (fibers.every((f) => Math.hypot(f.y - y, f.z - z) > f.size + 0.5)) caps.push([y, z]);
  }
  const capMesh = new THREE.InstancedMesh(capGeo, capMat, caps.length);
  caps.forEach(([y, z], i) => capMesh.setMatrixAt(i, m4.makeTranslation(-4, y, z)));
  root.add(pick(capMesh, 'capillary', 'Capillary'));

  const f0 = fibers.reduce((best, f) => (Math.hypot(f.y, f.z) < Math.hypot(best.y, best.z) ? f : best), fibers[0]);
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-5,
    view: { target: [30, 0, 0], direction: [0.85, 0.35, 0.55] },
    focus: [f0.endX, f0.y, f0.z],
    dispose() {
      fiberGeo.dispose();
      endGeo.dispose();
      capGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
