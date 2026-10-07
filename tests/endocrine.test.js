import { describe, it, expect } from 'vitest';
import { thyroidHormoneParts } from '../src/library/smallMolecules.js';
import { MOLECULES } from '../src/library/molecules.js';
import { LOBE, ringY, lobeAt, TRACHEA_R } from '../src/scenes/thyroid.js';
import { cellHeight, CELL_HEIGHT, CELL_WIDTH } from '../src/scenes/thyroidFollicles.js';
import { HORMONE_STAGES, CELL } from '../src/scenes/follicleCell.js';
import { THYROID } from '../src/scenes/body.js';
import { getDive } from '../src/data/dives.js';

const count = (atoms, el) => atoms.filter((a) => a.el === el).length;

describe('thyroid hormones', () => {
  it('T4 is C15H11I4NO4 with two iodines on each ring; T3 has one fewer on the outer ring', () => {
    const t4 = thyroidHormoneParts('thyroxine');
    expect([count(t4.atoms, 'C'), count(t4.atoms, 'H'), count(t4.atoms, 'I'), count(t4.atoms, 'N'), count(t4.atoms, 'O')]).toEqual([15, 11, 4, 1, 4]);
    expect([t4.innerIodines.length, t4.outerIodines.length]).toEqual([2, 2]);
    const t3 = thyroidHormoneParts('t3');
    expect([t3.innerIodines.length, t3.outerIodines.length]).toEqual([2, 1]);
    expect(MOLECULES.thyroxine.charge).toBe(0);
    expect(MOLECULES.t3.formula).toBe('C15H12I3NO4');
  });
  it('T4 is about 1.5 nm long (heavy-atom centres 1.2 to 1.6 nm apart at most)', () => {
    const heavy = MOLECULES.thyroxine.atoms.filter((a) => a[0] !== 'H');
    let max = 0;
    for (const a of heavy) for (const b of heavy) max = Math.max(max, Math.hypot(a[1] - b[1], a[2] - b[2], a[3] - b[3]));
    expect(max / 10).toBeGreaterThan(1.2);
    expect(max / 10).toBeLessThan(1.6);
  });
});

describe('thyroid geometry', () => {
  it('the isthmus crosses tracheal rings 2 and 3, and the lobes hug the windpipe', () => {
    const isthmusY = (ringY(2) + ringY(3)) / 2;
    expect(isthmusY).toBeLessThan(ringY(1));
    expect(isthmusY).toBeGreaterThan(ringY(4));
    const mid = lobeAt(0, 1);
    expect(mid.x - mid.hx).toBeLessThan(TRACHEA_R + 1);
    expect(LOBE.height).toBeGreaterThanOrEqual(40);
    expect(LOBE.height).toBeLessThanOrEqual(60);
  });
  it('the body thyroid sits on the neck below the brain, in front of the spine', () => {
    expect(THYROID.center[1]).toBeGreaterThan(1.4);
    expect(THYROID.center[1]).toBeLessThan(1.52);
    expect(THYROID.center[2]).toBeGreaterThan(0);
  });
  it('follicle cells grow from flat to tall as TSH rises', () => {
    expect(cellHeight(0)).toBe(CELL_HEIGHT.resting);
    expect(cellHeight(1)).toBe(CELL_HEIGHT.active);
    expect(cellHeight(1)).toBeGreaterThan(CELL_WIDTH);
    expect(cellHeight(0)).toBeLessThan(CELL_WIDTH);
    expect(CELL.width).toBe(12);
  });
  it('hormone making runs in five steps, from iodide to release', () => {
    expect(HORMONE_STAGES.map((s) => s.label)).toEqual(['Iodide in', 'Thyroglobulin', 'Iodination', 'Taken back', 'Release']);
  });
  it('the endocrine dive runs body → thyroid → follicles → follicle cell → thyroxine', () => {
    expect(getDive('endocrine').steps.map((s) => s.id)).toEqual(['body', 'thyroid', 'thyroid-follicles', 'follicle-cell', 'thyroxine']);
  });
});
