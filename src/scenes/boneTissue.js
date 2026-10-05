// Tier 4: compact bone tissue. 1 scene unit = 0.1 mm (100 µm).
// A block of compact bone whose top face shows osteons in cross-section,
// with one osteon drawn "telescoped" upward so its layers are visible,
// the classic textbook view. A patch of spongy bone sits alongside.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, cylinderBetween, seeded, disposeTree } from './kit.js';

const LAMELLAE = 5;
const CANAL_R = 0.25; // 25 µm radius → 50 µm canal
const OSTEON_R = 1.0; // 100 µm radius → 0.2 mm osteon
const TOP = 2.5;

export function buildBoneTissue() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(11);
  const matrix = M(COLORS.matrix, { roughness: 0.8, tissue: 'bone', repeat: [3, 3] });
  const ringA = M(0xf1e8d6, { roughness: 0.7, side: THREE.DoubleSide });
  const ringB = M(0xd9c9a8, { roughness: 0.7, side: THREE.DoubleSide });
  const canalMat = M(COLORS.hemaDeep, { roughness: 0.9, side: THREE.DoubleSide });
  const artery = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' });
  const vein = M(COLORS.vein, { roughness: 0.4, tissue: 'vein' });
  const nerve = M(COLORS.nerve, { roughness: 0.4, tissue: 'nerve' });

  // The block of compact bone (interstitial matrix between osteons).
  const block = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 7), matrix);
  root.add(pick(block, 'compact-bone', 'Compact bone'));

  const lacunaGeo = new THREE.SphereGeometry(1, 10, 8);
  const lacunaMat = M(COLORS.hemaDeep, { roughness: 0.6, emissive: COLORS.hematoxylin, emissiveIntensity: 0.25 });
  const lacunae = [];
  const canaliculi = [];

  const addLacuna = (pos, tangent) => {
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent);
    lacunae.push(new THREE.Matrix4().compose(pos, q, new THREE.Vector3(0.09, 0.04, 0.05)));
    // Canaliculi: a few short radial hairs from each lacuna.
    for (let k = 0; k < 6; k++) {
      const a = rand() * Math.PI * 2;
      const d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.1 + rand() * 0.08);
      canaliculi.push(pos.clone(), pos.clone().add(d));
    }
  };

  /** One osteon at (x, z). `lift` telescopes the layers upward (0 = flush with the block). */
  const osteon = (x, z, lift, isFeatured) => {
    const g = new THREE.Group();
    const dr = (OSTEON_R - CANAL_R) / LAMELLAE;
    for (let k = 0; k < LAMELLAE; k++) {
      const r0 = CANAL_R + k * dr;
      const r1 = r0 + dr;
      const top = TOP + 0.004 + lift * (LAMELLAE - k) * 0.32;
      const mat = k % 2 ? ringB : ringA;
      const face = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48, 1), mat);
      face.rotation.x = -Math.PI / 2;
      face.position.set(x, top, z);
      g.add(pick(face, isFeatured ? 'lamellae' : 'osteon', isFeatured ? 'Lamella' : 'Osteon'));
      if (lift > 0) {
        const wall = new THREE.Mesh(new THREE.CylinderGeometry(r1, r1, top - TOP, 48, 1, true), mat);
        wall.position.set(x, TOP + (top - TOP) / 2, z);
        g.add(pick(wall, 'lamellae', 'Lamella'));
      }
      // Lacunae sit on the boundaries between lamellae.
      if (k > 0) {
        const count = 5 + k * 2;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + rand() * 0.3;
          const pos = new THREE.Vector3(x + Math.cos(a) * r0, top + 0.02, z + Math.sin(a) * r0);
          addLacuna(pos, new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)));
        }
      }
    }
    // Central canal and its contents.
    const canalTop = TOP + 0.006 + lift * LAMELLAE * 0.32;
    const canal = new THREE.Mesh(new THREE.CircleGeometry(CANAL_R, 32), canalMat);
    canal.rotation.x = -Math.PI / 2;
    canal.position.set(x, lift > 0 ? canalTop : TOP + 0.006, z);
    g.add(pick(canal, 'haversian-canal', 'Central canal'));
    const vTop = (lift > 0 ? canalTop : TOP) + (isFeatured ? 0.9 : 0.08);
    g.add(pick(cylinderBetween([x - 0.07, TOP - 0.2, z], [x - 0.07, vTop, z], 0.075, 0.075, artery, 16), 'haversian-canal', 'Arteriole'));
    g.add(pick(cylinderBetween([x + 0.08, TOP - 0.2, z + 0.02], [x + 0.08, vTop - 0.05, z + 0.02], 0.085, 0.085, vein, 16), 'haversian-canal', 'Venule'));
    if (isFeatured) g.add(pick(cylinderBetween([x, TOP - 0.2, z - 0.12], [x, vTop - 0.1, z - 0.12], 0.035, 0.035, nerve, 8), 'haversian-canal', 'Nerve'));
    root.add(g);
  };

  // Hexagonal packing of osteons across the top face.
  const spacing = 2.08;
  for (let row = -2; row <= 2; row++) {
    for (let col = -3; col <= 3; col++) {
      const x = col * spacing + (row % 2 ? spacing / 2 : 0);
      const z = row * spacing * 0.866;
      if (Math.abs(x) > 4.3 || Math.abs(z) > 2.8) continue;
      const featured = row === 0 && col === 0;
      osteon(x, z, featured ? 1 : 0, featured);
    }
  }

  const lacunaMesh = new THREE.InstancedMesh(lacunaGeo, lacunaMat, lacunae.length);
  lacunae.forEach((m, i) => lacunaMesh.setMatrixAt(i, m));
  root.add(pick(lacunaMesh, 'lacuna', 'Lacuna'));
  const hairs = new THREE.LineSegments(
    new THREE.BufferGeometry().setFromPoints(canaliculi),
    M.line(COLORS.hemaDeep, { transparent: true, opacity: 0.55 }),
  );
  root.add(hairs);

  // Spongy bone alongside: a lattice of struts (trabeculae) with red marrow
  // filling the spaces, drawn as a translucent volume so the struts show.
  const marrow = new THREE.Mesh(
    new THREE.BoxGeometry(4.6, 5, 7),
    M(COLORS.marrowRed, { roughness: 0.85, transparent: true, opacity: 0.45, depthWrite: false, tissue: 'marrowRed' }),
  );
  marrow.position.set(-7.6, 0, 0);
  root.add(pick(marrow, 'bone-marrow', 'Red marrow'));
  const nodes = [];
  for (let i = 0; i < 70; i++) nodes.push([-9.7 + rand() * 4.2, -2.3 + rand() * 4.6, -3.3 + rand() * 6.6]);
  const strutMat = M(COLORS.bone, { roughness: 0.55, tissue: 'bone' });
  const nodeGeo = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < nodes.length; i++) {
    let links = 0;
    for (let j = i + 1; j < nodes.length && links < 3; j++) {
      const a = new THREE.Vector3(...nodes[i]);
      const b = new THREE.Vector3(...nodes[j]);
      if (a.distanceTo(b) < 1.7) {
        root.add(pick(cylinderBetween(nodes[i], nodes[j], 0.16, 0.2, strutMat, 8), 'spongy-bone', 'Trabecula'));
        links++;
      }
    }
    const knot = new THREE.Mesh(nodeGeo, strutMat);
    knot.position.set(...nodes[i]);
    knot.scale.setScalar(0.24);
    root.add(pick(knot, 'spongy-bone', 'Trabecula'));
  }

  // Focus: one lacuna on the featured osteon's third ring boundary.
  const featuredTop = TOP + 0.004 + (LAMELLAE - 2) * 0.32;
  const r = CANAL_R + 2 * ((OSTEON_R - CANAL_R) / LAMELLAE);
  const focus = [r * Math.cos(0.4), featuredTop, r * Math.sin(0.4)];

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-4,
    view: { target: [-2.2, 1.0, 0.4], direction: [0.28, 0.95, 0.85] },
    focus,
    dispose() {
      lacunaGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
