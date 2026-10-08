import { describe, it, expect } from 'vitest';
import { COCHLEA_MM, HEARING_HZ, pitchHz, placeOf, cochleaPoint } from '../src/scenes/ear.js';
import { OUTER_HAIR_CELL_ROWS, INNER_HAIR_CELL_ROWS, DUCT_STAGES } from '../src/scenes/cochlearDuct.js';
import { BUNDLE_ROWS, HAIR_CELL_STAGES } from '../src/scenes/hairCell.js';
import { INNER_EARS } from '../src/scenes/body.js';
import { getDive } from '../src/data/dives.js';

describe('the ear', () => {
  it('hears 20 Hz to 20 kHz, high notes at the base and low notes at the apex', () => {
    expect(HEARING_HZ).toEqual([20, 20000]);
    expect(pitchHz(0)).toBeCloseTo(20, 6);
    expect(pitchHz(1)).toBeCloseTo(20000, 3);
    expect(placeOf(20000)).toBeCloseTo(0, 6);
    expect(placeOf(20)).toBeCloseTo(1, 6);
    expect(placeOf(2000)).toBeLessThan(placeOf(200));
  });
  it('draws the cochlea 9 mm across, 5 mm tall and two and a half turns (Britannica)', () => {
    expect(COCHLEA_MM).toMatchObject({ base: 9, height: 5, turns: 2.5 });
    const p0 = cochleaPoint(0);
    const p1 = cochleaPoint(1);
    const axis = cochleaPoint(0).clone();
    const r0 = Math.hypot(p0.x - axis.x + Math.cos(-0.6) * 4.5, p0.y - axis.y + Math.sin(-0.6) * 4.5);
    expect(r0).toBeCloseTo(4.5, 6);
    expect(p1.z - p0.z).toBeCloseTo(COCHLEA_MM.height, 6);
  });
  it('has one row of inner and three of outer hair cells, and stereocilia graded shortest to tallest', () => {
    expect(INNER_HAIR_CELL_ROWS).toBe(1);
    expect(OUTER_HAIR_CELL_ROWS).toBe(3);
    expect([...BUNDLE_ROWS].sort((a, b) => a - b)).toEqual(BUNDLE_ROWS);
  });
  it('follows sound from fluid wave to nerve, and the hair cell from bending to firing', () => {
    expect(DUCT_STAGES.map((s) => s.label)).toEqual(['Pressure wave', 'Membrane moves', 'Bending', 'Nerve signal']);
    expect(HAIR_CELL_STAGES.map((s) => s.label)).toEqual(['At rest', 'Bundle bends', 'Channels open', 'Glutamate out', 'Nerve fires']);
  });
  it('the inner ears sit deep in the head, level with the eyes’ lower edge', () => {
    expect(INNER_EARS.x).toEqual([-0.062, 0.062]);
    expect(INNER_EARS.y).toBeGreaterThan(1.58);
    expect(INNER_EARS.y).toBeLessThan(1.64);
  });
  it('the ear dive runs body → ear → cochlea → hair cell → glutamate, reusing the shared molecule', () => {
    const d = getDive('ear');
    expect(d.steps.map((s) => s.id)).toEqual(['body', 'ear', 'cochlear-duct', 'hair-cell', 'neurotransmitter']);
    expect(d.steps.at(-1).scene).toBe(getDive('nervous').steps.at(-1).scene);
  });
});
