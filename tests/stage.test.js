import { describe, it, expect } from 'vitest';
import { dialTicks, rodMarks, PLINTH, ROD } from '../src/scenes/bodyStage.js';
import { breathFill, BREATH_SECONDS } from '../src/scenes/body.js';

describe('the stage', () => {
  it('engraves a dial with a long tick every 30 degrees', () => {
    const t = dialTicks();
    expect(t).toHaveLength(72);
    expect(t.filter((x) => x.long).map((x) => x.deg)).toEqual([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]);
  });

  it('marks the rod in centimeters, numbered every 10', () => {
    const m = rodMarks(175);
    expect(m).toHaveLength(176);
    expect(m.filter((x) => x.size === 'ten')).toHaveLength(18);
    expect(m[165].size).toBe('five');
  });

  it('stands the rod on the plinth, taller than the figure', () => {
    expect(Math.abs(ROD.x)).toBeLessThan(PLINTH.radius);
    expect(ROD.height).toBeGreaterThan(1.64);
  });
});

describe('breathing', () => {
  it('runs about 14 breaths a minute, empty to full and back', () => {
    expect(60 / BREATH_SECONDS).toBeCloseTo(14);
    expect(breathFill(0)).toBeCloseTo(0);
    expect(breathFill(0.4)).toBeCloseTo(1);
    expect(breathFill(0.999)).toBeLessThan(0.01);
    for (let p = 0; p < 1; p += 0.05) {
      expect(breathFill(p)).toBeGreaterThanOrEqual(0);
      expect(breathFill(p)).toBeLessThanOrEqual(1);
    }
  });
});
