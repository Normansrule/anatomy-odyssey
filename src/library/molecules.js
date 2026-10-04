// Generated small-molecule geometry (tools/gen_molecules.py: RDKit ETKDG v3
// + MMFF94, from SMILES charged as at body pH) and helpers that split a
// molecule into its named parts: an amino acid's backbone and side chain, a
// nucleotide's phosphate, sugar and base, a phospholipid's head and tails.
// All functions here are pure (no rendering) so they can be unit-tested.
import * as THREE from 'three/webgpu';
import DATA from './data/molecules.json';

export const MOLECULES = DATA.molecules;

export const AMINO_ACID_IDS = Object.keys(MOLECULES).filter((k) => MOLECULES[k].kind === 'amino-acid');
export const NUCLEOTIDE_IDS = Object.keys(MOLECULES).filter((k) => MOLECULES[k].kind === 'nucleotide');

/** Atoms as { el, p: Vector3, charge } and bonds as [i, j, order]. */
export function moleculeGraph(id) {
  const m = MOLECULES[id];
  if (!m) throw new Error(`unknown molecule "${id}"`);
  const atoms = m.atoms.map(([el, x, y, z, charge]) => ({ el, p: new THREE.Vector3(x, y, z), charge }));
  return { atoms, bonds: m.bonds.map((b) => [...b]) };
}

function adjacency(n, bonds, skip = () => false) {
  const adj = Array.from({ length: n }, () => []);
  for (const [i, j] of bonds) {
    if (skip(i, j)) continue;
    adj[i].push(j);
    adj[j].push(i);
  }
  return adj;
}

/** Atoms reachable from `start` without crossing a skipped bond. */
function component(start, adj) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    for (const k of adj[stack.pop()]) {
      if (!seen.has(k)) {
        seen.add(k);
        stack.push(k);
      }
    }
  }
  return seen;
}

const isBond = (a, b) => (i, j) => (i === a && j === b) || (i === b && j === a);

/** Hydrogens take the part of the heavy atom they are bonded to. */
function hydrogensFollow(atoms, adj, parts) {
  atoms.forEach((a, i) => {
    if (a.el === 'H') parts[i] = parts[adj[i][0]];
  });
  return parts;
}

/** Index of an amino acid's alpha carbon: bonded to the charged nitrogen and to the carboxylate carbon. */
export function alphaCarbon(atoms, bonds) {
  const adj = adjacency(atoms.length, bonds);
  const isCarboxylate = (k) => atoms[k].el === 'C' && adj[k].filter((o) => atoms[o].el === 'O').length === 2;
  return atoms.findIndex((a, i) => a.el === 'C' && adj[i].some((k) => atoms[k].el === 'N' && atoms[k].charge === 1) && adj[i].some(isCarboxylate));
}

/** 'backbone' or 'side' for every atom of an amino acid. Proline's ring counts as its side chain. */
export function aminoAcidParts(id) {
  const { atoms, bonds } = moleculeGraph(id);
  const adj = adjacency(atoms.length, bonds);
  const ca = alphaCarbon(atoms, bonds);
  const n = adj[ca].find((k) => atoms[k].el === 'N');
  const c = adj[ca].find((k) => atoms[k].el === 'C' && adj[k].filter((o) => atoms[o].el === 'O').length === 2);
  const backbone = new Set([ca, n, c, ...adj[c]]);
  const parts = atoms.map((a, i) => (backbone.has(i) ? 'backbone' : 'side'));
  // The single hydrogen on the alpha carbon belongs to the backbone; glycine's second one is its side chain.
  const caH = adj[ca].filter((k) => atoms[k].el === 'H');
  hydrogensFollow(atoms, adj, parts);
  if (caH.length === 2) parts[caH[1]] = 'side';
  return { atoms, bonds, parts };
}

/**
 * 'phosphate', 'sugar' or 'base' for every atom of a nucleotide (or ATP/ADP).
 * The base is cut off at the glycosidic bond (ring nitrogen to the sugar's C1′);
 * each phosphate group is a phosphorus with its oxygens. For ATP and ADP the
 * phosphates are numbered alpha, beta, gamma outward from the sugar.
 */
export function nucleotideParts(id) {
  const { atoms, bonds } = moleculeGraph(id);
  const adj = adjacency(atoms.length, bonds);
  // C1′: a carbon bonded to the ring oxygen of the sugar (an O between two carbons) and to a nitrogen.
  const ringO = atoms.findIndex((a, i) => a.el === 'O' && adj[i].length === 2 && adj[i].every((k) => atoms[k].el === 'C'));
  const c1 = adj[ringO].find((k) => adj[k].some((m) => atoms[m].el === 'N'));
  const n9 = adj[c1].find((k) => atoms[k].el === 'N');
  const base = component(n9, adjacency(atoms.length, bonds, isBond(c1, n9)));
  const parts = atoms.map((_, i) => (base.has(i) ? 'base' : 'sugar'));
  // Phosphates in order from the sugar: start at the P bonded (through O5′) to a carbon.
  const ps = atoms.map((a, i) => (a.el === 'P' ? i : -1)).filter((i) => i >= 0);
  const nearSugar = (p) => adj[p].some((o) => adj[o].some((k) => atoms[k].el === 'C'));
  const ordered = [];
  let cur = ps.find(nearSugar);
  while (cur !== undefined && !ordered.includes(cur)) {
    ordered.push(cur);
    const prev = cur;
    cur = ps.find((q) => !ordered.includes(q) && adj[prev].some((o) => adj[o].includes(q)));
  }
  const names = ordered.length === 1 ? ['phosphate'] : ['alpha', 'beta', 'gamma'];
  ordered.forEach((p, k) => {
    parts[p] = names[k];
    for (const o of adj[p]) {
      // A bridging oxygen between two phosphates belongs to the inner one.
      const otherP = adj[o].find((q) => q !== p && atoms[q].el === 'P');
      if (otherP !== undefined && ordered.indexOf(otherP) < k) continue;
      parts[o] = names[k];
    }
  });
  hydrogensFollow(atoms, adj, parts);
  return { atoms, bonds, parts, phosphates: ordered };
}

/** Parts of a phosphatidylcholine: choline, phosphate, glycerol, saturated tail, unsaturated tail. */
export function phospholipidParts(id) {
  const { atoms, bonds } = moleculeGraph(id);
  const adj = adjacency(atoms.length, bonds);
  const p = atoms.findIndex((a) => a.el === 'P');
  const nPlus = atoms.findIndex((a) => a.el === 'N' && a.charge === 1);
  const parts = atoms.map(() => 'glycerol');
  // Choline: everything on the nitrogen's side of the phosphate's oxygens.
  const phosphate = new Set([p, ...adj[p]]);
  const choline = component(nPlus, adjacency(atoms.length, bonds, (i, j) => phosphate.has(i) || phosphate.has(j)));
  // Acyl tails: cut each ester bond between a carbonyl carbon and its single-bonded oxygen.
  const esterCuts = [];
  atoms.forEach((a, i) => {
    if (a.el !== 'C') return;
    const os = adj[i].filter((k) => atoms[k].el === 'O');
    const dbl = os.find((o) => bonds.some(([x, y, ord]) => ord === 2 && ((x === i && y === o) || (x === o && y === i))));
    const single = os.find((o) => o !== dbl && adj[o].length === 2);
    if (dbl !== undefined && single !== undefined) esterCuts.push([i, single]);
  });
  const cutAdj = adjacency(atoms.length, bonds, (i, j) => esterCuts.some(([a, b]) => isBond(a, b)(i, j)));
  for (const [carbonyl] of esterCuts) {
    const tail = component(carbonyl, cutAdj);
    const unsaturated = bonds.some(([x, y, ord]) => ord === 2 && atoms[x].el === 'C' && atoms[y].el === 'C' && tail.has(x));
    for (const k of tail) parts[k] = unsaturated ? 'unsaturated' : 'saturated';
  }
  for (const k of phosphate) parts[k] = 'phosphate';
  for (const k of choline) parts[k] = 'choline';
  hydrogensFollow(atoms, adj, parts);
  return { atoms, bonds, parts };
}

/** Rotate atoms in place so the line from `from` to `to` points along +y. */
export function alignAlongY(atoms, from, to) {
  const dir = to.clone().sub(from).normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(dir, new THREE.Vector3(0, 1, 0));
  for (const a of atoms) a.p.applyQuaternion(q);
}

/** Molecular formula in Hill order (C, H, then alphabetical), e.g. "C6H13NO2". */
export function hillFormula(atoms) {
  const count = {};
  for (const a of atoms) count[a.el] = (count[a.el] ?? 0) + 1;
  const order = ['C', 'H', ...Object.keys(count).filter((e) => e !== 'C' && e !== 'H').sort()];
  return order.filter((e) => count[e]).map((e) => `${e}${count[e] > 1 ? count[e] : ''}`).join('');
}
