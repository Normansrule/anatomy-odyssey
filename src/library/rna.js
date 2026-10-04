// Shared library scene: a strand of RNA. 1 scene unit = 1 nm.
// Unlike DNA, RNA is usually single-stranded, and it folds back on itself
// wherever its bases can pair. This strand forms a hairpin: a five-pair stem
// in the A-form helix RNA prefers (0.28 nm rise, 11 pairs per turn), capped by
// a tight UUCG loop, followed by an unpaired tail that begins AUG GUG CAU,
// the first three codons of the β-globin message from the gene-to-protein
// module. Built from standard dimensions, not atomic coordinates.
import * as THREE from 'three/webgpu';
import { materialBank, pick, cylinderBetween, tubeThrough, disposeTree } from '../scenes/kit.js';
import { BASE_COLORS } from './nucleotides.js';

export const RNA_SEQUENCE = 'GGCAC' + 'UUCG' + 'GUGCC' + 'AUGGUGCAU';
export const STEM = 5;
const RISE = 0.28;
const STEP = (Math.PI * 2) / 11;
const P_R = 0.9;
const OFFSET = THREE.MathUtils.degToRad(150);

/** Watson–Crick partner in RNA. */
export function rnaPair(b) {
  return { A: 'U', U: 'A', G: 'C', C: 'G' }[b];
}

/** Positions of every nucleotide's phosphate, in order 5′ → 3′, and its role. */
export function rnaLayout() {
  const out = [];
  // 5′ arm of the stem, going up.
  for (let i = 0; i < STEM; i++) {
    const a = i * STEP;
    out.push({ role: 'stem5', pair: i, a, p: new THREE.Vector3(Math.cos(a) * P_R, i * RISE, Math.sin(a) * P_R) });
  }
  // Loop: four nucleotides arching over the top pair.
  const top = (STEM - 1) * RISE;
  const aStart = (STEM - 1) * STEP;
  const p0 = out[STEM - 1].p;
  const p1 = new THREE.Vector3(Math.cos(aStart + OFFSET) * P_R, top, Math.sin(aStart + OFFSET) * P_R);
  for (let k = 1; k <= 4; k++) {
    const t = k / 5;
    const p = p0.clone().lerp(p1, t);
    p.y = top + Math.sin(t * Math.PI) * 1.1;
    p.x *= 1.35; // bulge the loop outward a little
    p.z *= 1.35;
    out.push({ role: 'loop', p });
  }
  // 3′ arm of the stem, coming down, paired with the 5′ arm.
  for (let i = STEM - 1; i >= 0; i--) {
    const a = i * STEP + OFFSET;
    out.push({ role: 'stem3', pair: i, a, p: new THREE.Vector3(Math.cos(a) * P_R, i * RISE, Math.sin(a) * P_R) });
  }
  // Unpaired 3′ tail, drifting down and away.
  const last = out[out.length - 1].p.clone();
  for (let k = 1; k <= RNA_SEQUENCE.length - STEM * 2 - 4; k++) {
    out.push({ role: 'tail', p: new THREE.Vector3(last.x + Math.sin(k * 0.7) * 0.5 + k * 0.12, last.y - k * 0.58, last.z + Math.cos(k * 0.5) * 0.35) });
  }
  return out;
}

export function buildRna({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const layout = rnaLayout();
  const backboneMat = M(0xc77dff, { roughness: 0.35 });
  const phosMat = M(0xf2a65a, { roughness: 0.3 });
  const sphere = new THREE.SphereGeometry(1, 14, 10);

  root.add(pick(tubeThrough(layout.map((n) => n.p.toArray()), 0.11, backboneMat, layout.length * 10, 10), 'rna', 'Sugar-phosphate backbone (ribose)'));

  layout.forEach((n, i) => {
    const base = RNA_SEQUENCE[i];
    const ph = new THREE.Mesh(sphere, phosMat);
    ph.position.copy(n.p);
    ph.scale.setScalar(0.17);
    root.add(pick(ph, 'rna', 'Phosphate'));
    const mat = M(BASE_COLORS[base], { roughness: 0.4 });
    if (n.role === 'stem5' || n.role === 'stem3') {
      // Half of a rung toward the partner, meeting near the helix axis.
      const partner = layout.find((m) => m.pair === n.pair && m.role !== n.role);
      const mid = n.p.clone().add(partner.p).multiplyScalar(0.5);
      const from = n.p.clone().lerp(mid, 0.18);
      root.add(pick(cylinderBetween(from.toArray(), mid.toArray(), 0.1, 0.1, mat, 10), 'rna-hairpin', `${base}–${rnaPair(base)} pair in the stem`));
    } else {
      // Unpaired bases stick out from the strand.
      const prev = layout[Math.max(0, i - 1)].p;
      const next = layout[Math.min(layout.length - 1, i + 1)].p;
      const tan = next.clone().sub(prev).normalize();
      const out = n.role === 'loop'
        ? new THREE.Vector3(0, 1, 0).cross(tan).normalize().add(new THREE.Vector3(0, 0.4, 0)).normalize()
        : new THREE.Vector3(i % 2 ? 1 : -1, 0.15, 0.6).cross(tan).normalize();
      const end = n.p.clone().addScaledVector(out, 0.62);
      const stick = pick(cylinderBetween(n.p.toArray(), end.toArray(), 0.1, 0.1, mat, 10), n.role === 'loop' ? 'rna-hairpin' : 'codon', n.role === 'loop' ? `${base} in the loop (unpaired)` : `${base}, codon ${Math.floor((i - STEM * 2 - 4) / 3) + 1}`);
      root.add(stick);
    }
  });

  // Faint brackets around the three tail codons.
  const codonMat = M(0xffffff, { transparent: true, opacity: 0.12, depthWrite: false });
  const tailStart = STEM * 2 + 4;
  for (let c = 0; c < 3; c++) {
    const pts = layout.slice(tailStart + c * 3, tailStart + c * 3 + 3).map((n) => n.p);
    const center = pts.reduce((s, p) => s.add(p), new THREE.Vector3()).multiplyScalar(1 / 3);
    const halo = new THREE.Mesh(sphere, codonMat);
    halo.position.copy(center);
    halo.scale.set(0.75, 1.05, 0.75);
    root.add(pick(halo, 'codon', `Codon ${c + 1}: ${RNA_SEQUENCE.slice(tailStart + c * 3, tailStart + c * 3 + 3)}`));
  }

  const center = new THREE.Vector3(0.6, -1.4, 0);
  root.position.sub(center);
  let t = 0;
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-9,
    view: { target: [0, 0, 0], direction: [0.55, 0.15, 1] },
    focus: layout[tailStart].p.clone().sub(center).toArray(),
    update(dt) {
      if (reducedMotion) return;
      t += dt;
      root.rotation.y = Math.sin(t * 0.3) * 0.35;
    },
    dispose() {
      sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
