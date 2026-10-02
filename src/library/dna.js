// Shared library scene: B-form DNA. 1 scene unit = 1 nm.
// Built from standard B-DNA dimensions (0.34 nm rise, 10.5 bp per turn,
// ~2 nm diameter), not from atomic coordinates. The sequence is the
// Dickerson dodecamer (PDB 1BNA), repeated twice.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, cylinderBetween, disposeTree } from '../scenes/kit.js';
import { complement, DNA_BP_PER_TURN } from '../science/equations.js';

export const DNA_SEQUENCE = 'CGCGAATTCGCG'.repeat(2);
const RISE = 0.34;
const PHOSPHATE_R = 0.89;
const SUGAR_R = 0.62;
// The strands are not opposite each other; the unequal angular gap makes
// the wide major groove and narrow minor groove.
const STRAND_OFFSET = THREE.MathUtils.degToRad(150);

const BASE_COLOR = { A: COLORS.baseA, T: COLORS.baseT, G: COLORS.baseG, C: COLORS.baseC };

class HelixCurve extends THREE.Curve {
  constructor(radius, turns, height, phase, y0) {
    super();
    Object.assign(this, { radius, turns, height, phase, y0 });
  }
  getPoint(t, target = new THREE.Vector3()) {
    const a = this.phase + t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.radius, this.y0 + t * this.height, Math.sin(a) * this.radius);
  }
}

export function buildDna({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const helix = new THREE.Group();
  root.add(helix);

  const n = DNA_SEQUENCE.length;
  const comp = complement(DNA_SEQUENCE);
  const step = (Math.PI * 2) / DNA_BP_PER_TURN;
  const height = (n - 1) * RISE;
  const y0 = -height / 2;
  const turns = ((n - 1) * step) / (Math.PI * 2);

  const backboneMats = [M(0x8f7ff0, { roughness: 0.35 }), M(0xd2c9ff, { roughness: 0.35 })];
  const phosphateMat = M(0xf2a65a, { roughness: 0.3 });
  const sugarMat = M(0xefe7ff, { roughness: 0.5 });
  const sphere = new THREE.SphereGeometry(1, 16, 12);

  for (let strand = 0; strand < 2; strand++) {
    const phase = strand === 0 ? 0 : STRAND_OFFSET;
    const curve = new HelixCurve(PHOSPHATE_R, turns, height, phase, y0);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, n * 12, 0.11, 10, false), backboneMats[strand]);
    helix.add(pick(tube, 'backbone', strand === 0 ? 'Backbone, strand 1 (5′→3′ upward)' : 'Backbone, strand 2 (5′→3′ downward)'));
  }

  for (let i = 0; i < n; i++) {
    const y = y0 + i * RISE;
    const a1 = i * step;
    const a2 = a1 + STRAND_OFFSET;
    const p1 = new THREE.Vector3(Math.cos(a1) * PHOSPHATE_R, y, Math.sin(a1) * PHOSPHATE_R);
    const p2 = new THREE.Vector3(Math.cos(a2) * PHOSPHATE_R, y, Math.sin(a2) * PHOSPHATE_R);
    const s1 = new THREE.Vector3(Math.cos(a1 + 0.22) * SUGAR_R, y, Math.sin(a1 + 0.22) * SUGAR_R);
    const s2 = new THREE.Vector3(Math.cos(a2 - 0.22) * SUGAR_R, y, Math.sin(a2 - 0.22) * SUGAR_R);
    for (const [p, s] of [[p1, s1], [p2, s2]]) {
      const ph = new THREE.Mesh(sphere, phosphateMat);
      ph.position.copy(p);
      ph.scale.setScalar(0.17);
      helix.add(pick(ph, 'backbone', 'Phosphate group'));
      const su = new THREE.Mesh(sphere, sugarMat);
      su.position.copy(s);
      su.scale.setScalar(0.12);
      helix.add(pick(su, 'backbone', 'Deoxyribose sugar'));
    }
    // The base pair: two half-rungs meeting near the axis.
    const mid = s1.clone().add(s2).multiplyScalar(0.5);
    const b1 = DNA_SEQUENCE[i];
    const b2 = comp[i];
    const label = `${b1}–${b2} base pair (${b1 === 'A' || b1 === 'T' ? 2 : 3} hydrogen bonds)`;
    helix.add(pick(cylinderBetween(s1.toArray(), mid.toArray(), 0.1, 0.1, M(BASE_COLOR[b1], { roughness: 0.4 }), 10), 'base-pair', label));
    helix.add(pick(cylinderBetween(mid.toArray(), s2.toArray(), 0.1, 0.1, M(BASE_COLOR[b2], { roughness: 0.4 }), 10), 'base-pair', label));
  }

  return {
    root,
    metersPerUnit: 1e-9,
    view: { target: [0, 0, 0], direction: [1, 0.12, 0.35] },
    focus: [0, 0, 0],
    update(dt, env = {}) {
      if (!(env.reducedMotion ?? reducedMotion)) helix.rotation.y += dt * 0.22;
    },
    dispose() {
      sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
