import { describe, it, expect } from 'vitest';
import { simulateImmune, responseSummary, IMMUNE_PARAMS, stateAt } from '../src/science/immuneModel.js';
import { PRIMARY, SECONDARY, memoryReadout, stripCounts, IMMUNE_SIM } from '../src/scenes/immuneMemory.js';
import { LINEUP, lineupLayout } from '../src/scenes/immuneCells.js';

const T2 = IMMUNE_PARAMS.t2;

describe('first and second exposure (illustrative model)', () => {
  it('the first response is slow: antibody appears after about a week and peaks around three weeks', () => {
    expect(PRIMARY.detectDay).toBeGreaterThan(4);
    expect(PRIMARY.detectDay).toBeLessThan(10);
    expect(PRIMARY.peakADay).toBeGreaterThan(14);
    expect(PRIMARY.peakADay).toBeLessThan(28);
    expect(PRIMARY.clearedDay).toBeLessThan(16);
  });
  it('the second response is fast and big: antibody rises within 2 days and peaks at least 4 times higher', () => {
    expect(SECONDARY.detectDay).toBeLessThan(2);
    expect(SECONDARY.peakA / PRIMARY.peakA).toBeGreaterThan(4);
    expect(SECONDARY.clearedDay).toBeLessThan(3);
  });
  it('the second time, the germ never gets going: its peak is more than 100 times lower', () => {
    expect(PRIMARY.peakP / SECONDARY.peakP).toBeGreaterThan(100);
  });
  it('memory B cells form only after the first infection, over weeks, and persist', () => {
    expect(stateAt(IMMUNE_SIM, 10).R).toBeLessThan(0.2 * stateAt(IMMUNE_SIM, 60).R);
    expect(stateAt(IMMUNE_SIM, 89).R).toBeGreaterThan(5);
    expect(stateAt(IMMUNE_SIM, 89).P).toBe(0);
  });
  it('innate defenses alone slow the germ but cannot clear it', () => {
    const noAdaptive = simulateImmune({ e: 0, eM: 0, m: 0, t2: null, days: 30 });
    expect(Math.max(...noAdaptive.P)).toBeGreaterThan(1e6);
    expect(noAdaptive.P.at(-1)).toBeGreaterThan(1e6);
    const noInnate = simulateImmune({ aI: 0, t2: null, days: 30 });
    expect(Math.max(...noInnate.P)).toBeGreaterThan(PRIMARY.peakP);
  });
  it('the integration has converged: halving the time step changes nothing that matters', () => {
    const fine = simulateImmune({ dt: 0.005 });
    const a = responseSummary(fine, 0, T2);
    expect(a.peakA).toBeCloseTo(PRIMARY.peakA, 2);
    expect(Math.abs(a.peakADay - PRIMARY.peakADay)).toBeLessThan(0.1);
  });
  it('the readout and the tissue strip follow the model', () => {
    expect(memoryReadout(0)).toContain('Day 0');
    expect(memoryReadout(T2 + 30)).toContain('times higher');
    const busy = stripCounts(stateAt(IMMUNE_SIM, 6));
    const quiet = stripCounts(stateAt(IMMUNE_SIM, 60));
    expect(busy.bacteria).toBeGreaterThan(15);
    expect(quiet.bacteria).toBe(0);
    expect(quiet.memory).toBeGreaterThan(0);
  });
});

describe('immune cell lineup', () => {
  it('uses textbook diameters: the virus is a hundred times smaller than a red blood cell', () => {
    const d = Object.fromEntries(LINEUP.map((c) => [c.id, c.d]));
    expect(d.neutrophil).toBeGreaterThanOrEqual(10);
    expect(d.neutrophil).toBeLessThanOrEqual(12);
    expect(d.macrophage).toBeGreaterThan(d.monocyte);
    expect(d.lymphocyte).toBeLessThan(d.neutrophil);
    expect(d['red-blood-cell'] / d.virus).toBeGreaterThan(50);
  });
  it('lays the cells out without overlaps', () => {
    const at = lineupLayout();
    for (const row of [0, 1]) {
      const items = LINEUP.filter((c) => c.row === row).map((c) => ({ x: at.get(c.id)[0], w: c.reach ?? c.d }));
      for (let i = 1; i < items.length; i++) expect(items[i].x - items[i].w / 2).toBeGreaterThan(items[i - 1].x + items[i - 1].w / 2);
    }
  });
});
