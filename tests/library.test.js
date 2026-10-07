import { describe, it, expect } from 'vitest';
import { LIBRARY } from '../src/data/library.js';
import { getDive, builtDives } from '../src/data/dives.js';
import { CARDS } from '../src/data/cards.js';
import { SCENE_IDS } from '../src/scenes/registry.js';
import { routeTo, chainFrom, validateDive } from '../src/science/graph.js';
import {
  MOLECULES, AMINO_ACID_IDS, NUCLEOTIDE_IDS, moleculeGraph, aminoAcidParts, nucleotideParts, phospholipidParts, hillFormula,
} from '../src/library/molecules.js';
import { GENETIC_CODE, AMINO_NAMES, translate, transcribe, HBB_START_DNA } from '../src/science/equations.js';
import { RNA_SEQUENCE, STEM, rnaPair, rnaLayout } from '../src/library/rna.js';
import { NUCLEOSOME, nucleosomePath } from '../src/library/nucleosome.js';
import { MRNA_PARTS } from '../src/scenes/geneExpression.js';

const cardIds = CARDS.map((c) => c.id);

describe('the shared library is complete and reachable', () => {
  it('has no planned entries left', () => {
    expect(LIBRARY.filter((e) => e.status !== 'built').map((e) => e.id)).toEqual([]);
  });
  it.each(LIBRARY.map((e) => e.id))('%s can be reached from some dive, and the route obeys every invariant', (id) => {
    const route = routeTo(id);
    expect(route, id).toBeTruthy();
    expect(route.path[route.index].id).toBe(id);
    const asDive = { id: `route-to-${id}`, status: 'built', steps: route.path.slice(0, route.index + 1) };
    expect(validateDive(asDive, { sceneIds: SCENE_IDS, cardIds })).toEqual([]);
  });
  it('prefers a detour from where you are: from DNA in the skeletal dive, nucleotides are one step down', () => {
    const d = getDive('skeletal');
    const route = routeTo('nucleotides', { diveId: 'skeletal', path: d.steps, index: d.steps.length - 1 });
    expect(route.path.map((s) => s.id)).toEqual([...d.steps.map((s) => s.id), 'nucleotides']);
    expect(route.path.at(-1).sideTrip).toBe(true);
  });
  it('goes back up the current path when the target is above you', () => {
    const d = getDive('skeletal');
    const route = routeTo('nucleus', { diveId: 'skeletal', path: d.steps, index: d.steps.length - 1 });
    expect(route.path).toBe(d.steps);
    expect(route.path[route.index].id).toBe('nucleus');
  });
  it('follows "made of" chains: nucleus → nucleosome → amino acids', () => {
    expect(chainFrom('nucleus', 'amino-acids')).toEqual(['nuclear-proteins', 'amino-acids']);
    expect(chainFrom('heme', 'dna')).toBeNull();
  });
  it('every dive and module still validates with the new side trips', () => {
    for (const d of builtDives()) expect(validateDive(d, { sceneIds: SCENE_IDS, cardIds }), d.id).toEqual([]);
  });
});

describe('generated molecules (RDKit)', () => {
  it.each(Object.keys(MOLECULES))('%s matches its recorded formula and has sane bond lengths', (id) => {
    const { atoms, bonds } = moleculeGraph(id);
    expect(hillFormula(atoms)).toBe(MOLECULES[id].formula);
    expect(atoms.reduce((s, a) => s + a.charge, 0)).toBe(MOLECULES[id].charge);
    for (const [i, j] of bonds) {
      const d = atoms[i].p.distanceTo(atoms[j].p);
      const pair = [atoms[i].el, atoms[j].el].sort().join('');
      // Ranges from typical bond lengths: X–H 0.96–1.11 Å (S–H 1.34), C–C/C–N/C–O 1.20–1.58, P–O and C–S 1.48–1.84, aryl C–I about 2.10.
      const [lo, hi] = pair === 'HS' ? [1.3, 1.38] : pair === 'CI' ? [2.04, 2.16] : pair.includes('H') ? [0.95, 1.12] : pair.includes('P') || pair.includes('S') ? [1.45, 1.86] : [1.19, 1.58];
      expect(d, `${id} ${pair}`).toBeGreaterThan(lo);
      expect(d, `${id} ${pair}`).toBeLessThan(hi);
    }
  });
  it('has all twenty amino acids, one per one-letter code in the genetic code', () => {
    const codes = AMINO_ACID_IDS.map((k) => MOLECULES[k].code1).sort();
    expect(codes).toEqual(Object.keys(AMINO_NAMES).sort());
    const coded = new Set(Object.values(GENETIC_CODE).filter((a) => a !== '*'));
    expect([...coded].sort()).toEqual(codes);
  });
  it.each(AMINO_ACID_IDS)('%s splits into a five-heavy-atom backbone and a side chain', (id) => {
    const { atoms, parts } = aminoAcidParts(id);
    const heavyBackbone = atoms.filter((a, i) => parts[i] === 'backbone' && a.el !== 'H').map((a) => a.el).sort();
    expect(heavyBackbone).toEqual(['C', 'C', 'N', 'O', 'O']);
    const side = atoms.filter((a, i) => parts[i] === 'side');
    if (id === 'gly') expect(side.map((a) => a.el)).toEqual(['H']);
    else expect(side.some((a) => a.el === 'C')).toBe(true);
  });
  it.each(NUCLEOTIDE_IDS)('%s splits into one phosphate, a five-carbon sugar and a base', (id) => {
    const { atoms, parts } = nucleotideParts(id);
    const of = (p, el) => atoms.filter((a, i) => parts[i] === p && a.el === el).length;
    expect(of('phosphate', 'P')).toBe(1);
    expect(of('phosphate', 'O')).toBe(4);
    expect(of('sugar', 'C')).toBe(5);
    expect(of('sugar', 'O')).toBe(MOLECULES[id].polymer === 'DNA' ? 2 : 3); // ring O, 3′-OH (+ 2′-OH in ribose)
    expect(of('base', 'N')).toBeGreaterThanOrEqual(2);
  });
  it('ATP has alpha, beta and gamma phosphates; the gamma group is a P with three oxygens', () => {
    const { atoms, parts, phosphates } = nucleotideParts('atp');
    expect(phosphates.length).toBe(3);
    expect(atoms.filter((a, i) => parts[i] === 'gamma').map((a) => a.el).sort()).toEqual(['O', 'O', 'O', 'P']);
  });
  it('POPC splits into choline, phosphate, glycerol and two tails, and only the oleoyl tail has a C=C', () => {
    const { atoms, bonds, parts } = phospholipidParts('popc');
    const count = (p) => atoms.filter((a, i) => parts[i] === p && a.el === 'C').length;
    expect(count('choline')).toBe(5);
    expect(count('glycerol')).toBe(3);
    expect(count('saturated')).toBe(16);
    expect(count('unsaturated')).toBe(18);
    const cc2 = bonds.filter(([i, j, o]) => o === 2 && atoms[i].el === 'C' && atoms[j].el === 'C');
    expect(cc2.length).toBe(1);
    expect(parts[cc2[0][0]]).toBe('unsaturated');
  });
});

describe('genetic code', () => {
  it('has 64 codons: 61 for amino acids and 3 stops', () => {
    expect(Object.keys(GENETIC_CODE).length).toBe(64);
    expect(Object.values(GENETIC_CODE).filter((a) => a === '*').length).toBe(3);
    expect(['UAA', 'UAG', 'UGA'].every((c) => GENETIC_CODE[c] === '*')).toBe(true);
    expect(GENETIC_CODE.AUG).toBe('M');
    expect(GENETIC_CODE.UUU).toBe('F'); // Nirenberg and Matthaei, 1961
  });
  it('translates the start of β-globin, and the sickle-cell change swaps one glutamate for valine', () => {
    expect(translate(transcribe(HBB_START_DNA))).toBe('MVHLTPEEKSA');
    expect(translate(transcribe(HBB_START_DNA.replace('GAGGAG', 'GTGGAG')))).toBe('MVHLTPVEKSA');
  });
  it('stops at a stop codon', () => {
    expect(translate('GGAUGUUUUAAGGG')).toBe('MF');
  });
});

describe('RNA, nucleosome and gene-to-protein scenes', () => {
  it('the hairpin stem pairs perfectly and the tail starts with the β-globin codons', () => {
    const s5 = RNA_SEQUENCE.slice(0, STEM);
    const s3 = RNA_SEQUENCE.slice(STEM + 4, STEM * 2 + 4);
    expect([...s5].map(rnaPair).join('')).toBe([...s3].reverse().join(''));
    expect(RNA_SEQUENCE.slice(STEM + 1, STEM + 4 + 1).length).toBe(4);
    expect(RNA_SEQUENCE.slice(STEM * 2 + 4)).toBe(transcribe(HBB_START_DNA).slice(0, 9));
    expect(rnaLayout().length).toBe(RNA_SEQUENCE.length);
  });
  it('the nucleosome wraps 1.65 turns at a 4.2 nm radius', () => {
    expect(NUCLEOSOME.turns).toBe(1.65);
    const path = nucleosomePath();
    const r = Math.hypot(path.getPointAt(0.5).x, path.getPointAt(0.5).z);
    expect(r).toBeCloseTo(4.2, 1);
  });
  it('the module’s mRNA carries the 11 HBB codons, then a stop codon and a poly(A) tail', () => {
    expect(MRNA_PARTS.codons).toBe(11);
    expect(MRNA_PARTS.beads.filter((b) => b.kind === 'stop').map((b) => b.base).join('')).toBe('UAA');
    expect(MRNA_PARTS.beads.at(-1).kind).toBe('polyA');
  });
});

describe('atlas map', () => {
  it('places every dive step and library entry left to right by size, inside the drawing', async () => {
    const { atlasLayout, xOf } = await import('../src/ui/atlas.js');
    const L = atlasLayout();
    expect(xOf(1)).toBeLessThan(xOf(1e-9));
    for (const row of L.rows) {
      for (let i = 1; i < row.nodes.length; i++) expect(row.nodes[i].x).toBeGreaterThan(row.nodes[i - 1].x);
      for (const n of [...row.nodes, ...row.trips.flatMap((t) => t.nodes)]) {
        expect(n.x).toBeGreaterThan(150);
        expect(n.x).toBeLessThan(L.width - 40);
      }
    }
    expect(L.libNodes.length).toBe(LIBRARY.length);
    expect(L.rows.length).toBe(builtDives().length);
  });
});

describe('atlas library band', () => {
  it('never lets two library labels overlap in the same lane', async () => {
    const { atlasLayout } = await import('../src/ui/atlas.js');
    const { libNodes } = atlasLayout();
    const byLane = {};
    for (const n of libNodes) (byLane[n.lane] ??= []).push(n);
    for (const lane of Object.values(byLane)) {
      lane.sort((a, b) => a.x - b.x);
      for (let i = 1; i < lane.length; i++) {
        const gap = lane[i].x - lane[i - 1].x;
        expect(gap).toBeGreaterThan((lane[i].title.length * 6 + 12) / 2 + (lane[i - 1].title.length * 6 + 12) / 2);
      }
    }
  });
});
