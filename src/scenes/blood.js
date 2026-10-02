// Tier 4: blood flowing through a small vessel. 1 scene unit = 1 µm.
// The vessel (an arteriole about 24 µm across) is cut open lengthwise.
// Red blood cells (Evans–Fung shape, 7.8 µm across), two white blood cells
// and a few platelets drift through plasma. Flow is slowed down for viewing.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, seeded, disposeTree } from './kit.js';
import { rbcGeometry } from './rbcShape.js';

const LENGTH = 90;
const RADIUS = 12;

export function buildBlood({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(31);

  // Vessel wall: the back half of a tube along x, plus a thin outer layer.
  const wallGeo = new THREE.CylinderGeometry(RADIUS, RADIUS, LENGTH, 64, 1, true, Math.PI / 2, Math.PI);
  const wall = new THREE.Mesh(wallGeo, M(0xe9a7b8, { roughness: 0.7, side: THREE.DoubleSide }));
  wall.rotation.z = Math.PI / 2;
  root.add(pick(wall, 'vessel-wall', 'Vessel wall (endothelium)'));
  const outerGeo = new THREE.CylinderGeometry(RADIUS + 1.6, RADIUS + 1.6, LENGTH, 64, 1, true, Math.PI / 2, Math.PI);
  const outer = new THREE.Mesh(outerGeo, M(0xc97a95, { roughness: 0.8, side: THREE.DoubleSide }));
  outer.rotation.z = Math.PI / 2;
  root.add(pick(outer, 'vessel-wall', 'Smooth muscle layer'));
  // Flattened endothelial cell nuclei on the inner surface.
  for (let i = 0; i < 14; i++) {
    const x = -LENGTH / 2 + 4 + rand() * (LENGTH - 8);
    const a = Math.PI * (0.58 + rand() * 0.84);
    const n = ellipsoid([x, Math.sin(a) * (RADIUS - 0.4), Math.cos(a) * (RADIUS - 0.4)], [3.2, 0.7, 1.2], M(COLORS.hematoxylin, { roughness: 0.5 }), 14);
    n.lookAt(0, 0, 0);
    root.add(pick(n, 'vessel-wall', 'Endothelial cell nucleus'));
  }

  // Plasma: a faint volume so the fluid reads as present.
  const plasma = new THREE.Mesh(
    new THREE.CylinderGeometry(RADIUS - 0.2, RADIUS - 0.2, LENGTH, 48, 1, true, Math.PI / 2, Math.PI),
    M(0xf2d27a, { transparent: true, opacity: 0.1, depthWrite: false, side: THREE.DoubleSide }),
  );
  plasma.rotation.z = Math.PI / 2;
  plasma.scale.set(1, 1, 1);
  root.add(pick(plasma, 'plasma', 'Plasma'));

  // Red blood cells (instanced). Each keeps a position, spin axis and speed.
  const rbcGeo = rbcGeometry(1, { segments: 36 });
  const rbcMat = M(COLORS.artery, { roughness: 0.38 });
  const COUNT = 46;
  const cells = [];
  for (let i = 0; i < COUNT; i++) {
    let y;
    let z;
    do {
      y = (rand() * 2 - 1) * (RADIUS - 4.2);
      z = (rand() * 2 - 1) * (RADIUS - 4.2);
    } while (y * y + z * z > (RADIUS - 4.2) ** 2);
    cells.push({
      x: -LENGTH / 2 + rand() * LENGTH,
      y,
      z,
      // Faster in the middle of the vessel than near the wall (parabolic flow).
      speed: 6 * (1 - (y * y + z * z) / RADIUS ** 2) + 0.8,
      axis: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
      angle: rand() * Math.PI * 2,
      spin: (rand() - 0.5) * 1.2,
    });
  }
  const rbcs = new THREE.InstancedMesh(rbcGeo, rbcMat, COUNT);
  root.add(pick(rbcs, 'red-blood-cell', 'Red blood cell'));

  // White blood cells: a neutrophil (lobed nucleus) and a lymphocyte (round nucleus).
  const wbcMat = M(0xf1eef8, { roughness: 0.5, transparent: true, opacity: 0.62, depthWrite: false });
  const nucMat = M(COLORS.hematoxylin, { roughness: 0.4 });
  const wbcs = [];
  const neutrophil = new THREE.Group();
  neutrophil.add(pick(ellipsoid([0, 0, 0], [6, 6, 6], wbcMat, 28), 'white-blood-cell', 'Neutrophil (white blood cell)'));
  for (const [dx, dy, dz] of [[-1.6, 0.8, 0], [0.4, 1.6, 0.6], [1.8, 0, -0.4], [0.2, -1.4, 0.3]]) {
    neutrophil.add(pick(ellipsoid([dx, dy, dz], [1.5, 1.2, 1.3], nucMat, 14), 'white-blood-cell', 'Lobed nucleus'));
  }
  neutrophil.position.set(-15, -3.5, -2);
  root.add(neutrophil);
  wbcs.push({ obj: neutrophil, speed: 1.4 });
  const lymphocyte = new THREE.Group();
  lymphocyte.add(pick(ellipsoid([0, 0, 0], [3.6, 3.6, 3.6], wbcMat, 24), 'white-blood-cell', 'Lymphocyte (white blood cell)'));
  lymphocyte.add(pick(ellipsoid([0.3, 0, 0], [3.0, 3.0, 3.0], nucMat, 20), 'white-blood-cell', 'Lymphocyte nucleus'));
  lymphocyte.position.set(22, 4.5, -4);
  root.add(lymphocyte);
  wbcs.push({ obj: lymphocyte, speed: 2.2 });

  // Platelets: small discs, 2–3 µm across.
  const plateletGeo = new THREE.SphereGeometry(1, 12, 8);
  const plateletMat = M(0xd8a6e8, { roughness: 0.5 });
  const platelets = [];
  const plateletMesh = new THREE.InstancedMesh(plateletGeo, plateletMat, 9);
  for (let i = 0; i < 9; i++) {
    const a = rand() * Math.PI * 2;
    const r = RADIUS - 2 - rand() * 3;
    platelets.push({ x: -LENGTH / 2 + rand() * LENGTH, y: Math.sin(a) * r * 0.9, z: -Math.abs(Math.cos(a) * r), speed: 1.2 + rand() });
  }
  root.add(pick(plateletMesh, 'platelet', 'Platelet'));

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const flat = new THREE.Vector3(1.3, 0.45, 1.3);
  const wrap = (x) => ((((x + LENGTH / 2) % LENGTH) + LENGTH) % LENGTH) - LENGTH / 2;
  const place = () => {
    cells.forEach((c, i) => {
      q.setFromAxisAngle(c.axis, c.angle);
      m4.compose(new THREE.Vector3(c.x, c.y, c.z), q, one);
      rbcs.setMatrixAt(i, m4);
    });
    rbcs.instanceMatrix.needsUpdate = true;
    platelets.forEach((p, i) => {
      m4.compose(new THREE.Vector3(p.x, p.y, p.z), q.set(0, 0, 0, 1), flat);
      plateletMesh.setMatrixAt(i, m4);
    });
    plateletMesh.instanceMatrix.needsUpdate = true;
  };
  place();

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    view: { target: [2, -1, -2], direction: [0.18, 0.28, 1] },
    focus: [cells[0].x, cells[0].y, cells[0].z],
    update(dt, env = {}) {
      if (env.reducedMotion ?? reducedMotion) return;
      for (const c of cells) {
        c.x = wrap(c.x + c.speed * dt);
        c.angle += c.spin * dt;
      }
      for (const p of platelets) p.x = wrap(p.x + p.speed * dt);
      for (const w of wbcs) w.obj.position.x = wrap(w.obj.position.x + w.speed * dt);
      place();
    },
    dispose() {
      rbcGeo.dispose();
      plateletGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
