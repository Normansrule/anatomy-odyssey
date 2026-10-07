// Tier 4: a block of thyroid tissue. 1 scene unit = 10 µm.
// Follicles of many sizes, each a hollow ball of follicle cells around a
// store of colloid, wrapped in capillaries; parafollicular (C) cells sit in
// the gaps between them. The front follicle is cut in half, so its wall
// shows as a ring of cells around the colloid, as in a microscope slide.
// The control is the pituitary's thyroid-stimulating hormone (TSH): with
// little of it the cells are flat and the colloid full; with a lot they grow
// tall, take colloid back in (pale droplets at its edge) and release hormone.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, ellipsoid, seeded, fibonacciSphere, disposeTree, COLORS } from './kit.js';

export const CELL_WIDTH = 1.15; // about 12 µm
export const CELL_HEIGHT = { resting: 0.6, active: 1.6 }; // flat (6 µm) to tall (16 µm)
export const HERO = { center: [0, 0, 0], radius: 13 };

/** Cell height for a TSH level from 0 (low) to 1 (high). */
export const cellHeight = (tsh) => CELL_HEIGHT.resting + (CELL_HEIGHT.active - CELL_HEIGHT.resting) * tsh;

const TEXT = [
  'Low TSH. The follicle cells are flat and the colloid is full: hormone is being stored, still attached to the protein thyroglobulin.',
  'High TSH. The pituitary’s thyroid-stimulating hormone makes the cells grow tall, take up more iodide and engulf colloid (pale droplets at its edge), freeing T4 and T3 into the capillaries.',
];

export function buildThyroidFollicles({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1818);

  // Follicles packed around the cut one.
  const fol = [{ c: new THREE.Vector3(...HERO.center), r: HERO.radius, hero: true }];
  for (let tries = 0; tries < 6000 && fol.length < 20; tries++) {
    const r = 5 + rand() * 9;
    const c = new THREE.Vector3((rand() - 0.5) * 92, (rand() - 0.5) * 62, -4 - rand() * 30);
    if (fol.some((f) => f.c.distanceTo(c) < f.r + r + 1.1)) continue;
    fol.push({ c, r, hero: false });
  }

  // Cells: one instanced box per cell, standing on the follicle's outer surface.
  const box = new THREE.BoxGeometry(1, 1, 1);
  const cellsFor = (f) => {
    const n = Math.round((4 * Math.PI * f.r * f.r) / (CELL_WIDTH * CELL_WIDTH));
    return fibonacciSphere(n)
      .map((d) => new THREE.Vector3(...(Array.isArray(d) ? d : [d.x, d.y, d.z])))
      .filter((d) => !f.hero || d.z < 0.04);
  };
  const heroDirs = cellsFor(fol[0]);
  const otherDirs = fol.slice(1).flatMap((f) => cellsFor(f).map((d) => ({ f, d })));
  const heroCells = new THREE.InstancedMesh(box, M(0xc77b9a, { roughness: 0.55 }), heroDirs.length);
  const otherCells = new THREE.InstancedMesh(box, M(0xb86a8a, { roughness: 0.6 }), otherDirs.length);
  root.add(pick(heroCells, 'follicular-cell', 'Follicle cell (makes thyroid hormone)'));
  root.add(pick(otherCells, 'thyroid-follicle', 'Thyroid follicle (a ball of cells around colloid)'));
  const nucGeo = new THREE.SphereGeometry(1, 10, 8);
  const nuclei = new THREE.InstancedMesh(nucGeo, M(COLORS.hematoxylin, { roughness: 0.5 }), heroDirs.length);
  root.add(pick(nuclei, 'follicular-cell', 'Nucleus of a follicle cell'));

  // Colloid: a sphere inside each follicle; the cut one is a back half with a flat face.
  const colloidMat = M(0xf0a6b8, { roughness: 0.3, emissive: 0xf0a6b8, emissiveIntensity: 0.15 });
  const colloids = fol.map((f) => {
    const geo = f.hero ? new THREE.SphereGeometry(1, 48, 32, Math.PI, Math.PI) : new THREE.SphereGeometry(1, 24, 16);
    const m = new THREE.Mesh(geo, colloidMat);
    m.position.copy(f.c);
    if (!f.hero) m.visible = false; // hidden behind the cells; kept for the scale test
    root.add(pick(m, 'colloid', 'Colloid (stored thyroglobulin, rich in iodine)'));
    return m;
  });
  const cap = new THREE.Mesh(new THREE.CircleGeometry(1, 64), colloidMat);
  cap.position.set(HERO.center[0], HERO.center[1], HERO.center[2] + 0.02);
  root.add(pick(cap, 'colloid', 'Colloid, cut across'));
  // The cut wall: a ring of cells around the colloid, with cell borders and nuclei, as on a slide.
  const wallDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 96), M(0xc77b9a, { roughness: 0.55 }));
  wallDisc.position.set(HERO.center[0], HERO.center[1], HERO.center[2] + 0.01);
  wallDisc.scale.set(HERO.radius, HERO.radius, 1);
  root.add(pick(wallDisc, 'follicular-cell', 'Follicle cells, cut across'));
  const nWall = Math.round((2 * Math.PI * HERO.radius) / CELL_WIDTH);
  const borders = new THREE.InstancedMesh(box, M(0x7a3a5a, { roughness: 0.6 }), nWall);
  const wallNuclei = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 14), M(COLORS.hematoxylin, { roughness: 0.5 }), nWall);
  root.add(pick(borders, 'follicular-cell', 'Border between two follicle cells'));
  root.add(pick(wallNuclei, 'follicular-cell', 'Nucleus of a follicle cell'));
  // Droplets of colloid being taken back into the cells (resorption), around the edge of the cut face.
  const dropGeo = new THREE.CircleGeometry(1, 16);
  const drops = Array.from({ length: 26 }, (_, i) => {
    const a = (i / 26) * Math.PI * 2 + rand() * 0.15;
    const m = new THREE.Mesh(dropGeo, M(0xfbe8ee, { roughness: 0.3, emissive: 0xfbe8ee, emissiveIntensity: 0.2 }));
    m.userData.a = a;
    root.add(pick(m, 'colloid', 'Droplet of colloid being taken into a cell'));
    return m;
  });

  // Parafollicular (C) cells in the gaps between follicles.
  const cMat = M(0xe8e0c8, { roughness: 0.5 });
  let placed = 0;
  for (let tries = 0; tries < 3000 && placed < 22; tries++) {
    const p = new THREE.Vector3((rand() - 0.5) * 84, (rand() - 0.5) * 56, -rand() * 26);
    const gaps = fol.map((f) => p.distanceTo(f.c) - f.r);
    if (Math.min(...gaps) < 0.9 || Math.min(...gaps) > 2.4) continue;
    root.add(pick(ellipsoid(p.toArray(), [1.1, 0.9, 1], cMat, 12), 'parafollicular-cell', 'Parafollicular (C) cell (makes calcitonin)'));
    placed++;
  }

  // Capillaries hugging each follicle (only the back half of the cut one).
  const capMat = M(COLORS.artery, { roughness: 0.45 });
  for (const f of fol) {
    for (let k = 0; k < (f.hero ? 4 : 3); k++) {
      const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      const u = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0.3, 1, 0.2)).normalize();
      const v = new THREE.Vector3().crossVectors(axis, u);
      const pts = [];
      for (let i = 0; i <= 24; i++) {
        const a = (i / 24) * Math.PI * (f.hero ? 1 : 2);
        const d = u.clone().multiplyScalar(Math.cos(a)).add(v.clone().multiplyScalar(Math.sin(a)));
        if (f.hero && d.z > 0) d.z = -d.z;
        pts.push(f.c.clone().addScaledVector(d, f.r + 0.45).toArray());
      }
      root.add(pick(tubeThrough(pts, 0.32, capMat, 64, 6), 'capillary', 'Capillary (hormone leaves into it; iodide arrives from it)'));
    }
  }

  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3();
  const at = new THREE.Vector3();
  function pose(tsh) {
    const h = cellHeight(tsh);
    heroDirs.forEach((d, i) => {
      q.setFromUnitVectors(up, d);
      at.copy(fol[0].c).addScaledVector(d, fol[0].r - h / 2);
      s.set(CELL_WIDTH * 0.97, h, CELL_WIDTH * 0.97);
      heroCells.setMatrixAt(i, m4.compose(at, q, s));
      at.copy(fol[0].c).addScaledVector(d, fol[0].r - h * 0.42);
      s.set(0.38, Math.min(0.42, h * 0.3), 0.38);
      nuclei.setMatrixAt(i, m4.compose(at, q, s));
    });
    otherDirs.forEach(({ f, d }, i) => {
      q.setFromUnitVectors(up, d);
      at.copy(f.c).addScaledVector(d, f.r - h / 2);
      s.set(CELL_WIDTH * 0.97, h, CELL_WIDTH * 0.97);
      otherCells.setMatrixAt(i, m4.compose(at, q, s));
    });
    heroCells.instanceMatrix.needsUpdate = true;
    otherCells.instanceMatrix.needsUpdate = true;
    nuclei.instanceMatrix.needsUpdate = true;
    fol.forEach((f, i) => colloids[i].scale.setScalar(f.r - h));
    const cr = fol[0].r - h;
    cap.scale.set(cr, cr, 1);
    for (let i = 0; i < nWall; i++) {
      const a = (i / nWall) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
      q.setFromUnitVectors(up, dir);
      at.copy(fol[0].c).addScaledVector(dir, fol[0].r - h / 2).setZ(HERO.center[2] + 0.03);
      borders.setMatrixAt(i, m4.compose(at, q, s.set(0.07, h, 0.02)));
      const b = a + Math.PI / nWall;
      const nd = new THREE.Vector3(Math.cos(b), Math.sin(b), 0);
      q.setFromUnitVectors(up, nd);
      at.copy(fol[0].c).addScaledVector(nd, fol[0].r - h * 0.45).setZ(HERO.center[2] + 0.04);
      wallNuclei.setMatrixAt(i, m4.compose(at, q, s.set(0.34, Math.min(0.34, h * 0.28), 1)));
    }
    borders.instanceMatrix.needsUpdate = true;
    wallNuclei.instanceMatrix.needsUpdate = true;
    for (const d of drops) {
      const r = 0.25 + 0.35 * tsh;
      d.visible = tsh > 0.3;
      d.scale.set(r, r, 1);
      d.position.set(HERO.center[0] + Math.cos(d.userData.a) * (cr - r * 0.6), HERO.center[1] + Math.sin(d.userData.a) * (cr - r * 0.6), HERO.center[2] + 0.06);
    }
  }

  const controls = {
    label: 'TSH',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0,
    format: (v) => (v < 0.5 ? 'Low (resting)' : 'High (active)'),
    presets: [
      { label: 'Low TSH (resting)', value: 0 },
      { label: 'High TSH (active)', value: 1 },
    ],
    set(v) {
      controls.value = v;
      pose(v);
      return v < 0.5 ? TEXT[0] : TEXT[1];
    },
  };
  controls.set(1);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-5,
    frameWidth: 8e-4,
    view: { target: [0, 0, -6], direction: [0.12, 0.1, 1] },
    focus: [-HERO.radius + 0.6, 0, -0.3],
    controls,
    dispose() {
      box.dispose();
      nucGeo.dispose();
      dropGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
