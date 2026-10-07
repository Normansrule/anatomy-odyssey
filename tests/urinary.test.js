import { describe, it, expect } from 'vitest';
import { ureaParts } from '../src/library/smallMolecules.js';
import { MOLECULES } from '../src/library/molecules.js';
import { KIDNEY_MM, PYRAMIDS, kidneyPoint, pyramidLayout } from '../src/scenes/kidney.js';
import { CORPUSCLE, FILTERED_L_PER_DAY, URINE_L_PER_DAY, PCT_REABSORBS, FILTRATE_STAGES } from '../src/scenes/nephron.js';
import { LAYERS, SLIT, PASS_NM, FILTER_STAGES } from '../src/scenes/filtrationBarrier.js';
import { KIDNEYS } from '../src/scenes/body.js';
import { getDive } from '../src/data/dives.js';

const count = (atoms, el) => atoms.filter((a) => a.el === el).length;

describe('urea', () => {
  it('is CH4N2O, uncharged, with two nitrogens on the carbon and a C=O double bond', () => {
    const { atoms, bonds, carbon, oxygen, nitrogens } = ureaParts();
    expect([count(atoms, 'C'), count(atoms, 'H'), count(atoms, 'N'), count(atoms, 'O')]).toEqual([1, 4, 2, 1]);
    expect(MOLECULES.urea.charge).toBe(0);
    const co = bonds.find(([a, b]) => (a === carbon && b === oxygen) || (b === carbon && a === oxygen));
    expect(co[2]).toBe(2);
    for (const n of nitrogens) expect(bonds.some(([a, b]) => (a === carbon && b === n) || (b === carbon && a === n))).toBe(true);
  });
});

describe('kidney', () => {
  it('is drawn 12 cm long, 6 cm wide and 4 cm thick (OpenStax: 11–14 × 6 × 4 cm)', () => {
    expect(KIDNEY_MM.length).toBeGreaterThanOrEqual(110);
    expect(KIDNEY_MM.length).toBeLessThanOrEqual(140);
    expect([KIDNEY_MM.width, KIDNEY_MM.thickness]).toEqual([60, 40]);
    const ys = Array.from({ length: 360 }, (_, i) => kidneyPoint((i / 360) * Math.PI * 2)[1]);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(KIDNEY_MM.length, 0);
  });
  it('has its hilum dented in on the medial side and eight pyramids pointing toward it', () => {
    const [xMid] = kidneyPoint(Math.PI);
    expect(xMid).toBeGreaterThan(-KIDNEY_MM.width / 2 + 5);
    const pyr = pyramidLayout();
    expect(pyr.length).toBe(PYRAMIDS);
    for (const p of pyr) {
      const baseX = (p.base[0].x + p.base[1].x) / 2;
      expect(p.tip.x).toBeLessThan(baseX + 1e-9);
    }
  });
  it('sits in the body with the left kidney a little higher than the right', () => {
    expect(KIDNEYS.left[1]).toBeGreaterThan(KIDNEYS.right[1]);
  });
});

describe('nephron and filter', () => {
  it('follows the filtrate from 180 L a day to 1–2 L of urine, two thirds reclaimed in the proximal tubule', () => {
    expect(FILTERED_L_PER_DAY).toBe(180);
    expect(URINE_L_PER_DAY).toEqual([1, 2]);
    expect(PCT_REABSORBS).toBeCloseTo(0.67, 2);
    expect(FILTRATE_STAGES.map((s) => s.label)).toEqual(['Filter', 'Proximal tubule', 'Loop of Henle', 'Distal tubule', 'Collecting duct']);
    expect(CORPUSCLE.radius * 2 * 10).toBe(200); // µm
  });
  it('stacks three layers in order, with 40 nm slits and the OpenStax size limits', () => {
    expect(LAYERS.endothelium[0]).toBeGreaterThanOrEqual(LAYERS.basement[1]);
    expect(LAYERS.basement[0]).toBeGreaterThanOrEqual(LAYERS.feet[1]);
    expect(SLIT * 10).toBe(40);
    expect(PASS_NM).toEqual({ readily: 4, most: 8 });
    expect(FILTER_STAGES.at(-1).label).toBe('Held back');
  });
  it('the urinary dive runs body → kidney → nephron → filter → urea', () => {
    expect(getDive('urinary').steps.map((s) => s.id)).toEqual(['body', 'kidney', 'nephron', 'filtration-barrier', 'urea']);
  });
});
