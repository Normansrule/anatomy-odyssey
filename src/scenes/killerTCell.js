// Module scene: a killer (cytotoxic, CD8) T cell finds a virus-infected cell
// and destroys it. 1 scene unit = 1 µm.
// The cells are to scale (infected cell 15 µm, T cell 8 µm). MHC class I
// knobs are drawn more than 100 times too big, virus particles about 4 times too
// big, granules larger and fewer than life. Minutes are compressed into seconds.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, capsuleBetween, seeded, disposeTree, fibonacciSphere } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const KILLER_STAGES = [
  { label: 'Infected', text: 'Infected. A virus is copying itself inside this cell. The cell shows pieces of every protein it makes, viral ones included, on MHC class I molecules.' },
  { label: 'Recognize', text: 'Recognize. A killer T cell whose receptor fits a viral peptide on MHC class I stops and grips the cell. A ring of adhesion molecules seals the contact.' },
  { label: 'Aim', text: 'Aim. Its granules of perforin and granzymes move to the contact point, so only this cell is hit.' },
  { label: 'Strike', text: 'Strike. Perforin opens pores in the target’s membrane, and granzymes pass in.' },
  { label: 'Die', text: 'Die. Granzymes switch on the cell’s own self-destruct program (apoptosis): it shrinks and breaks into neat pieces that macrophages clear. The T cell lets go and moves on to the next target.' },
];

const TARGET = new THREE.Vector3(-6, 0, 0);
const TARGET_R = 7.5;
const KILLER_R = 4;

export function buildKillerTCell({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(8);

  // The infected cell, its nucleus and virus particles.
  const target = new THREE.Group();
  target.position.copy(TARGET);
  const targetMat = M(0xf08baf, { roughness: 0.55, transparent: true, opacity: 0.5, depthWrite: false });
  const body = pick(ellipsoid([0, 0, 0], [TARGET_R, TARGET_R * 0.9, TARGET_R * 0.9], targetMat, 32), 'infected-cell', 'Virus-infected cell');
  target.add(body);
  const nucleus = pick(ellipsoid([-1.5, 0.5, 0], [3.2, 2.8, 2.8], M(COLORS.hematoxylin, { roughness: 0.45 }), 18), 'infected-cell', 'Nucleus');
  target.add(nucleus);
  const virusMat = M(0xe8c45a, { roughness: 0.3, emissive: 0xe8c45a, emissiveIntensity: 0.9 });
  for (let i = 0; i < 40; i++) {
    const p = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(2.5 + rand() * 3.5);
    target.add(pick(ellipsoid(p.toArray(), [0.2, 0.2, 0.2], virusMat, 8), 'virus', 'Virus particle (drawn about 4× too big)'));
  }
  // MHC class I on the surface, carrying viral peptides.
  const stem = M(0xb8b0dc, { roughness: 0.5 });
  const viralPep = M(0xe8c45a, { roughness: 0.35, emissive: 0xe8c45a, emissiveIntensity: 0.8 });
  for (const p of fibonacciSphere(36)) {
    const g = new THREE.Group();
    g.position.set(p.x * TARGET_R, p.y * TARGET_R * 0.9, p.z * TARGET_R * 0.9);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), p);
    g.add(pick(capsuleBetween([0, 0, 0], [0, 0.8, 0], 0.2, stem, 6), 'mhc-class-i', 'MHC class I (drawn more than 100× too big)'));
    g.add(pick(ellipsoid([0, 0.95, 0], [0.28, 0.2, 0.28], viralPep, 8), 'mhc-class-i', 'Viral peptide on MHC class I'));
    target.add(g);
  }
  // Blebs that bulge out as the cell dies.
  const blebs = fibonacciSphere(14).map((p) => {
    const b = pick(ellipsoid([p.x * TARGET_R * 0.85, p.y * TARGET_R * 0.78, p.z * TARGET_R * 0.78], [1.8, 1.8, 1.8], targetMat, 14), 'apoptosis', 'Bleb (the dying cell breaking into pieces)');
    target.add(b);
    return b;
  });
  // Perforin pores on the side facing the T cell.
  const poreMat = M(0xf2f0fa, { roughness: 0.3, emissive: 0xf2f0fa, emissiveIntensity: 0.7 });
  const pores = Array.from({ length: 7 }, (_, i) => {
    const ang = (i / 7) * Math.PI * 2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.08, 6, 16), poreMat);
    ring.position.set(TARGET_R - 0.05, Math.cos(ang) * 1.2, Math.sin(ang) * 1.2);
    ring.rotation.y = Math.PI / 2;
    target.add(pick(ring, 'cytotoxic-granules', 'Perforin pore (drawn more than 100× too big)'));
    return ring;
  });
  root.add(target);

  // The killer T cell.
  const killer = new THREE.Group();
  killer.add(pick(ellipsoid([0, 0, 0], [KILLER_R, KILLER_R, KILLER_R], M(0x9fb4e8, { roughness: 0.5, transparent: true, opacity: 0.72, depthWrite: false }), 24), 'killer-t-cell', 'Killer T cell (CD8)'));
  killer.add(pick(ellipsoid([1.2, 0.3, 0.2], [2.8, 2.6, 2.6], M(COLORS.hematoxylin, { roughness: 0.45 }), 16), 'killer-t-cell', 'Killer T cell nucleus'));
  const granMat = M(0xe35d6a, { roughness: 0.35, emissive: 0xe35d6a, emissiveIntensity: 0.5 });
  const granules = fibonacciSphere(12).map((p) => {
    const home = p.clone().multiplyScalar(2.6);
    const aimed = new THREE.Vector3(-3.1, (p.y) * 1.4, (p.z) * 1.4);
    const m = pick(ellipsoid([0, 0, 0], [0.42, 0.42, 0.42], granMat, 10), 'cytotoxic-granules', 'Granule of perforin and granzymes');
    killer.add(m);
    return { m, home, aimed };
  });
  root.add(killer);

  // The adhesion ring that seals the synapse.
  const ringMat = M(0x8fb4f0, { roughness: 0.3, emissive: 0x8fb4f0, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.22, 8, 40), ringMat);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(TARGET.x + TARGET_R + 0.1, 0, 0);
  root.add(pick(ring, 'immunological-synapse', 'Immunological synapse: adhesion ring (LFA-1 holding ICAM-1)'));

  const start = new THREE.Vector3(TARGET.x + TARGET_R + KILLER_R + 6, 6, 3);
  const docked = new THREE.Vector3(TARGET.x + TARGET_R + KILLER_R - 0.6, 0, 0);
  const leave = new THREE.Vector3(TARGET.x + TARGET_R + KILLER_R + 12, -8, -2);

  function apply(v) {
    const arrive = ramp(v, 0.6, 1.4);
    const go = ramp(v, 4.3, 4.95);
    killer.position.lerpVectors(start, docked, arrive).lerp(leave, go);
    const flat = ramp(v, 1.2, 1.5) * (1 - go);
    killer.scale.set(1 - 0.14 * flat, 1 + 0.05 * flat, 1 + 0.05 * flat);
    ring.visible = v > 1.3 && go < 0.3;
    ring.scale.setScalar(0.6 + 0.4 * ramp(v, 1.3, 1.7));
    // Granules polarize, then empty into the gap.
    const aim = ramp(v, 2, 2.8);
    const fire = ramp(v, 3, 3.5);
    for (const g of granules) {
      g.m.position.lerpVectors(g.home, g.aimed, aim);
      g.m.scale.setScalar(1 - fire * 0.95);
      g.m.visible = fire < 0.97;
    }
    pores.forEach((p, i) => (p.visible = ramp(v, 3.1, 3.7) > i / pores.length && v < 4.6));
    // Apoptosis: blebs, shrinking, fading.
    const die = ramp(v, 3.9, 4.8);
    blebs.forEach((b, i) => {
      b.visible = die > 0.05;
      b.scale.setScalar(Math.max(0.01, die * (0.8 + 0.4 * ((i * 37) % 10) / 10)));
    });
    target.scale.setScalar(1 - 0.3 * die);
    body.material.opacity = 0.5 - 0.15 * die;
    nucleus.scale.set(1 - 0.5 * die, 1 - 0.5 * die, 1 - 0.5 * die);
  }

  const { controls, update } = stagedControls({ stages: KILLER_STAGES, apply, reducedMotion, rate: 0.32, still: 3.5 });

  return {
    root,
    fit: 'both',
    frameWidth: 5e-5,
    metersPerUnit: 1e-6,
    view: { target: [1, 0, 0], direction: [0.1, 0.2, 1] },
    focus: ring.position.toArray(),
    controls,
    update,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
