// Small-molecule building blocks for the chemistry module's scenes. 1 unit = 1 Å.
import * as THREE from 'three/webgpu';
import { buildMolecule } from '../library/molecule.js';
import { moleculeGraph } from '../library/molecules.js';
import { BONDS_A } from '../library/gases.js';

/** A generated molecule (tools/gen_molecules.py) as a mesh group, centered on its atoms. */
export function smallMolecule(id, M, { card, label }) {
  const { atoms, bonds } = moleculeGraph(id);
  const c = atoms.reduce((s, a) => s.add(a.p), new THREE.Vector3()).multiplyScalar(1 / atoms.length);
  for (const a of atoms) Object.assign(a, { p: a.p.sub(c), card, label: `${label}: ${a.el === 'H' ? 'hydrogen' : a.el === 'O' ? 'oxygen' : a.el === 'C' ? 'carbon' : a.el}` });
  return buildMolecule(atoms, bonds, M, { defaultCard: card });
}

/** Carbon dioxide with the experimental C=O length (1.16 Å), along x. */
export function carbonDioxide(M, card = 'carbon-dioxide') {
  const v = (x) => new THREE.Vector3(x, 0, 0);
  return buildMolecule(
    [
      { el: 'C', p: v(0), card, label: 'Carbon dioxide: carbon' },
      { el: 'O', p: v(-BONDS_A.CO), card, label: 'Carbon dioxide: oxygen' },
      { el: 'O', p: v(BONDS_A.CO), card, label: 'Carbon dioxide: oxygen' },
    ],
    [[0, 1, 2], [0, 2, 2]],
    M,
    { defaultCard: card },
  );
}

/**
 * A histidine side chain's imidazole ring, as atoms and bonds, with its Nε2
 * nitrogen at `at` and the ring extending along unit vector `dir` (in the
 * plane spanned by `dir` and `u`). Regular pentagon, 1.35 Å sides, plus the
 * beta carbon 1.50 Å out from Cγ.
 */
export function imidazole(at, dir, u, { card, label }) {
  const R = 1.35 / (2 * Math.sin(Math.PI / 5));
  const center = at.clone().addScaledVector(dir, R);
  const names = ['N', 'C', 'N', 'C', 'C']; // Nε2, Cε1, Nδ1, Cγ, Cδ2
  const ring = names.map((el, k) => {
    const t = (2 * Math.PI * k) / 5;
    const p = center.clone().addScaledVector(dir, -R * Math.cos(t)).addScaledVector(u, R * Math.sin(t));
    return { el, p, card, label };
  });
  const cg = ring[3].p;
  const cb = { el: 'C', p: cg.clone().addScaledVector(cg.clone().sub(center).normalize(), 1.5), card, label };
  return {
    atoms: [...ring, cb],
    bonds: [[0, 1, 2], [1, 2, 1], [2, 3, 1], [3, 4, 2], [4, 0, 1], [3, 5, 1]],
  };
}
