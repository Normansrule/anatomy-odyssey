// Tier 5: a mast cell beside a small vein (venule), in the tissue around a
// wound. 1 scene unit = 1 µm.
// The mast cell (14 µm across) is cut open to show its nucleus and the
// hundreds of granules packed with histamine; IgE antibodies sit in its
// surface. The venule (16 µm across) is lined by endothelial cells.
// The stage control: resting, triggered, granules released, and the vessel
// wall opening up as histamine reaches it. Antibodies and histamine are drawn
// far larger than life, and far fewer.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, seeded, disposeTree, capsuleBetween, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const MAST_CELL_UM = 14;
const R = MAST_CELL_UM / 2;
const VENULE_R = 8;
const VENULE_X = 19;

export const MAST_STAGES = [
  { label: 'Resting', text: 'Resting. The mast cell sits in the tissue near a small blood vessel, its cytoplasm packed with granules full of histamine. Antibodies called IgE stud its surface.' },
  { label: 'Triggered', text: 'Triggered. Signals from damaged tissue switch the cell on. In an allergy the trigger is different: an allergen, such as a pollen protein, links two IgE antibodies on its surface.' },
  { label: 'Release', text: 'Release. Within seconds, granules fuse with the cell membrane and pour out their contents: histamine and other signals spread into the tissue.' },
  { label: 'Vessel opens', text: 'The vessel opens. Histamine makes the venule widen (redness and warmth) and its lining cells pull apart, so fluid leaks out (swelling) and white cells can squeeze through.' },
];

export function buildMastCell({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1414);

  // The mast cell, cut open toward the viewer.
  const cut = 1.15;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(R, 56, 40, cut, Math.PI * 2 - 2 * cut), M(0xd8b4d6, { roughness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }));
  shell.rotation.y = Math.PI / 2 + 0.25; // the opening faces the viewer
  root.add(pick(shell, 'mast-cell', 'Mast cell (cut open)'));
  // Nucleus: oval, off center.
  root.add(pick(ellipsoid([-1.6, 0.4, -1.2], [2.8, 2.2, 2.3], M(COLORS.hematoxylin, { roughness: 0.5 }), 24), 'mast-cell', 'Mast cell nucleus'));
  // Granules filling the cytoplasm (only where the cut leaves cell behind them).
  const granMat = M(0x6b3f8a, { roughness: 0.35, emissive: 0x6b3f8a, emissiveIntensity: 0.15 });
  const granules = [];
  const gGeo = new THREE.SphereGeometry(1, 12, 8);
  for (let tries = 0; tries < 3000 && granules.length < 240; tries++) {
    const p = new THREE.Vector3((rand() * 2 - 1) * R, (rand() * 2 - 1) * R, (rand() * 2 - 1) * R);
    if (p.length() > R - 0.7) continue;
    if (p.clone().sub(new THREE.Vector3(-1.6, 0.4, -1.2)).divide(new THREE.Vector3(3.1, 2.5, 2.6)).length() < 1) continue;
    const g = new THREE.Mesh(gGeo, granMat);
    const size = 0.32 + rand() * 0.2;
    g.scale.setScalar(size);
    g.position.copy(p);
    root.add(pick(g, 'mast-cell-granule', 'Granule (full of histamine)'));
    // Granules on the venule side are the ones released.
    const out = p.x > 1.2 && rand() < 0.75;
    granules.push({ mesh: g, home: p.clone(), size, out, dir: p.clone().add(new THREE.Vector3(2, 0, 0)).normalize() });
  }

  // IgE antibodies in the surface: small Ys pointing outward (drawn far larger than life).
  const yMat = M(0x9fb4e8, { roughness: 0.4 });
  const yAt = [];
  for (let i = 0; i < 26; i++) {
    const u = rand() * Math.PI * 2;
    const v = Math.acos(rand() * 2 - 1);
    const n = new THREE.Vector3(Math.sin(v) * Math.cos(u), Math.cos(v), Math.sin(v) * Math.sin(u));
    if (n.z > 0.35 && Math.abs(n.x) < 0.6) continue; // keep them off the cut face
    const base = n.clone().multiplyScalar(R);
    const stem = n.clone().multiplyScalar(R + 0.7);
    const side = new THREE.Vector3().crossVectors(n, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(0.45);
    const group = new THREE.Group();
    group.add(capsuleBetween(base.toArray(), stem.toArray(), 0.1, yMat, 6));
    group.add(capsuleBetween(stem.toArray(), stem.clone().add(n.clone().multiplyScalar(0.5)).add(side).toArray(), 0.09, yMat, 6));
    group.add(capsuleBetween(stem.toArray(), stem.clone().add(n.clone().multiplyScalar(0.5)).sub(side).toArray(), 0.09, yMat, 6));
    group.traverse((o) => o.isMesh && pick(o, 'ige', 'IgE antibody (drawn far larger)'));
    root.add(group);
    yAt.push({ n, tip: stem.clone().add(n.clone().multiplyScalar(0.6)) });
  }
  // An allergen bridging two neighboring IgE, shown when triggered.
  const pair = yAt.slice(0, 2);
  const allergen = ellipsoid(pair[0].tip.clone().lerp(pair[1].tip, 0.5).toArray(), [0.55, 0.55, 0.55], M(0xf2a65a, { roughness: 0.4, emissive: 0xf2a65a, emissiveIntensity: 0.5 }), 14);
  root.add(pick(allergen, 'ige', 'Allergen linking two IgE (the allergy trigger)'));

  // The venule: a tube of endothelial cells, cut open along its front.
  const venule = new THREE.Group();
  venule.position.x = VENULE_X;
  root.add(venule);
  const endoMat = M(0xf0b4c4, { roughness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false });
  const tiles = [];
  for (let k = 0; k < 4; k++) {
    for (let a = 0; a < 5; a++) {
      const start = 0.6 + a * ((Math.PI * 2 - 1.2) / 5);
      const geo = new THREE.CylinderGeometry(VENULE_R, VENULE_R, 8.6, 12, 1, true, start, (Math.PI * 2 - 1.2) / 5 - 0.05);
      const tile = new THREE.Mesh(geo, endoMat);
      tile.position.y = -13 + k * 8.8;
      tile.userData.mid = start + ((Math.PI * 2 - 1.2) / 5) / 2;
      venule.add(pick(tile, 'venule', 'Endothelial cell lining the venule'));
      tiles.push(tile);
    }
  }
  // Red blood cells inside the venule.
  const rbcMat = M(COLORS.artery, { roughness: 0.4 });
  for (let i = 0; i < 7; i++) {
    const rbc = new THREE.Mesh(new THREE.TorusGeometry(2.4, 1.1, 10, 20), rbcMat);
    rbc.position.set((rand() - 0.5) * 6, -14 + i * 4.6, -2 - rand() * 3);
    rbc.rotation.set(rand() * 3, rand() * 3, 0);
    venule.add(pick(rbc, 'venule', 'Red blood cell in the venule'));
  }

  // Histamine (yellow) spreading toward the venule, and fluid (blue) leaking out of it.
  const dotGeo = new THREE.SphereGeometry(1, 8, 6);
  const hist = new THREE.InstancedMesh(dotGeo, M(0xffe9a0, { roughness: 0.3, emissive: 0xffe9a0, emissiveIntensity: 0.7 }), 260);
  const histSeeds = Array.from({ length: 260 }, () => [rand(), rand(), rand()]);
  root.add(pick(hist, 'histamine', 'Histamine (drawn far larger, and far fewer)'));
  const leak = new THREE.InstancedMesh(dotGeo, M(0x9fd4ff, { roughness: 0.3, transparent: true, opacity: 0.8 }), 140);
  const leakSeeds = Array.from({ length: 140 }, () => [rand(), rand(), rand()]);
  root.add(pick(leak, 'venule', 'Fluid leaking out (this is the swelling)'));
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  function apply(v) {
    allergen.visible = v > 0.6;
    allergen.scale.setScalar(0.55 * ramp(v, 0.6, 1.2) + 0.001);
    const go = ramp(v, 1.6, 2.6);
    for (const g of granules) {
      if (!g.out) continue;
      const surface = g.dir.clone().multiplyScalar(R);
      g.mesh.position.copy(g.home).lerp(surface, Math.min(1, go * 1.4));
      g.mesh.scale.setScalar(g.size * (1 - 0.85 * ramp(v, 2.2, 2.9)) + 0.001);
    }
    const spread = ramp(v, 2.0, 3.2);
    hist.visible = v > 1.9;
    histSeeds.forEach(([a, b, c], i) => {
      const p = new THREE.Vector3(R + 0.4 + spread * (2 + a * (VENULE_X - R - 3)), (b - 0.5) * (6 + 18 * spread), (c - 0.5) * (6 + 12 * spread));
      const s = 0.18 * (1 - 0.6 * ramp(v, 3.4, 3.95));
      m4.compose(p, q, new THREE.Vector3(s, s, s));
      hist.setMatrixAt(i, m4);
    });
    hist.instanceMatrix.needsUpdate = true;
    // The venule widens and its lining cells part.
    const open = ramp(v, 2.9, 3.7);
    venule.scale.set(1 + 0.12 * open, 1, 1 + 0.12 * open);
    for (const t of tiles) {
      const gap = 0.9 * open;
      t.position.x = Math.sin(t.userData.mid) * gap;
      t.position.z = Math.cos(t.userData.mid) * gap;
    }
    leak.visible = v > 3.0;
    leakSeeds.forEach(([a, b, c], i) => {
      const ang = Math.PI + (a - 0.5) * 2.2; // out of the side facing the mast cell
      const r = VENULE_R + 0.6 + open * (1 + c * 6);
      m4.compose(new THREE.Vector3(VENULE_X + Math.sin(ang) * r, (b - 0.5) * 30, Math.cos(ang) * r), q, new THREE.Vector3(0.22, 0.22, 0.22));
      leak.setMatrixAt(i, m4);
    });
    leak.instanceMatrix.needsUpdate = true;
  }
  const { controls, update } = stagedControls({ stages: MAST_STAGES, apply, reducedMotion, rate: 0.3, still: 2.6 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 5.2e-5,
    view: { target: [7, 0, 0], direction: [0.15, 0.3, 1] },
    focus: [R + 1.5, 0, 0],
    controls,
    update,
    dispose() {
      gGeo.dispose();
      dotGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
