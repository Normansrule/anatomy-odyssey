import { describe, it, expect } from 'vitest';
import { clonalCells, divisionsToReach, timeToReach, SYNAPSE_GAP_NM, LFA1_SPAN_NM, MHC_I_PEPTIDE_LENGTH, peptideLength } from '../src/science/tcells.js';
import { generationsAt, presentationReadout, PRESENTATION_STAGES } from '../src/scenes/antigenPresentation.js';
import { KILLER_STAGES } from '../src/scenes/killerTCell.js';
import { TCR_GEOMETRY, PEPTIDE_RESIDUES, tcrReadout } from '../src/scenes/tcrMhc.js';
import { getDive } from '../src/data/dives.js';
import { validateDive } from '../src/science/graph.js';
import { SCENE_IDS } from '../src/scenes/registry.js';
import { CARDS } from '../src/data/cards.js';

describe('clonal expansion', () => {
  it('doubling n times gives 2ⁿ cells: 4 make 16, 10 make 1,024, 14 make 16,384', () => {
    expect(clonalCells(4)).toBe(16);
    expect(clonalCells(10)).toBe(1024);
    expect(clonalCells(14)).toBe(16384);
  });
  it('reaching 16,384 cells takes 14 divisions, 3.5 days at 6 hours each', () => {
    expect(divisionsToReach(16384)).toBe(14);
    expect(timeToReach(16384, 6) / 24).toBeCloseTo(3.5, 9);
  });
  it('rejects nonsense', () => {
    expect(() => clonalCells(-1)).toThrow();
    expect(() => divisionsToReach(0)).toThrow();
  });
  it('the scene shows 1, 2, 4, 8, then 16 cells, and the readout says so', () => {
    expect([4, 4.2, 4.4, 4.6, 4.8, 5].map(generationsAt)).toEqual([0, 0, 1, 2, 3, 4]);
    expect(presentationReadout(4.8, 4)).toContain('8 cells after 3 divisions, about 18 hours');
    expect(PRESENTATION_STAGES).toHaveLength(6);
    expect(KILLER_STAGES.map((s) => s.label)).toEqual(['Infected', 'Recognize', 'Aim', 'Strike', 'Die']);
  });
});

describe('the receptor–peptide contact', () => {
  it('spans a 15 nm gap, much narrower than the 36–45 nm adhesion ring', () => {
    expect(TCR_GEOMETRY.gap).toBe(SYNAPSE_GAP_NM);
    expect(SYNAPSE_GAP_NM * 2).toBeLessThan(LFA1_SPAN_NM[0]);
  });
  it('the receptor’s tips sit just above the MHC, and both fit between the membranes', () => {
    expect(TCR_GEOMETRY.tcrBottom).toBeGreaterThan(TCR_GEOMETRY.pmhcTop);
    expect(TCR_GEOMETRY.tcrBottom - TCR_GEOMETRY.pmhcTop).toBeLessThan(0.5);
  });
  it('the peptide is 9 amino acids, inside the 8–10 MHC class I holds, about 2.7 nm long', () => {
    expect(PEPTIDE_RESIDUES).toBeGreaterThanOrEqual(MHC_I_PEPTIDE_LENGTH[0]);
    expect(PEPTIDE_RESIDUES).toBeLessThanOrEqual(MHC_I_PEPTIDE_LENGTH[1]);
    expect(peptideLength(9)).toBeCloseTo(2.72, 9);
  });
  it('self and viral peptides read differently', () => {
    expect(tcrReadout(0)).toContain('does not fit');
    expect(tcrReadout(1)).toContain('diagonally');
  });
  it('the module validates: tiers rise, frames shrink, and it ends with a side trip into the amino acids', () => {
    const dive = getDive('t-cells');
    expect(validateDive(dive, { sceneIds: SCENE_IDS, cardIds: CARDS.map((c) => c.id) })).toEqual([]);
    expect(dive.steps.at(-1).shared).toBe('amino-acids'); // ends at the molecule level
  });
});

describe('cortex layers', () => {
  it('six layers fill the 2.5 mm cortex exactly, numbered from the surface down', async () => {
    const { LAYERS, layerBounds, CORTEX_THICKNESS_UM } = await import('../src/scenes/cortex.js');
    expect(LAYERS.map((l) => l.n)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
    expect(LAYERS.reduce((s, l) => s + l.share, 0)).toBeCloseTo(1, 9);
    const b = layerBounds();
    expect(b[0].top).toBe(0);
    expect(b.at(-1).bottom).toBeCloseTo(CORTEX_THICKNESS_UM, 6);
    for (let i = 1; i < b.length; i++) expect(b[i].top).toBeCloseTo(b[i - 1].bottom, 9);
  });
});
