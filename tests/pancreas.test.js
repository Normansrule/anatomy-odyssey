import { describe, it, expect } from 'vitest';
import { PANCREAS_MM } from '../src/scenes/pancreas.js';
import { CELL_SHARES, cellTypes } from '../src/scenes/islet.js';
import { SECRETION_STAGES } from '../src/scenes/betaCell.js';
import { getDive } from '../src/data/dives.js';
import { getCard } from '../src/data/cards.js';

describe('the pancreas', () => {
  it('is drawn about 15 cm long (OpenStax 23.6: about 15.2 cm)', () => {
    expect(PANCREAS_MM.length).toBeGreaterThan(140);
    expect(PANCREAS_MM.length).toBeLessThan(165);
  });
  it('builds islets in OpenStax 17.9’s proportions', () => {
    expect(Object.values(CELL_SHARES).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    const [beta, alpha, delta, pp] = cellTypes(1000);
    expect(beta + alpha + delta + pp).toBe(1000);
    expect([beta, alpha, delta, pp]).toEqual([750, 200, 40, 10]);
  });
  it('follows glucose-stimulated insulin secretion in order', () => {
    expect(SECRETION_STAGES.map((s) => s.label)).toEqual(['Glucose in', 'ATP rises', 'K⁺ channels close', 'Ca²⁺ in', 'Insulin out']);
  });
  it('the pancreas dive runs body → pancreas → islet → beta cell → ATP, reusing the shared ATP', () => {
    const d = getDive('pancreas');
    expect(d.steps.map((s) => s.id)).toEqual(['body', 'pancreas', 'islet', 'beta-cell', 'atp']);
    expect(getCard('pancreas').home).toBe('pancreas');
  });
});
