import { describe, it, expect } from 'vitest';
import { dialTicks, rodMarks, plaqueLines, PLAQUE, PLINTH, ROD } from '../src/scenes/bodyStage.js';
import { breathFill, BREATH_SECONDS, swayAt, SWAY } from '../src/scenes/body.js';
import { frontShare, projectToFloor, shadowFalloff, SPOT, SPOT_BEHIND } from '../src/scenes/castShadow.js';

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

describe('the museum label', () => {
  it('names the specimen and gives its measured height', () => {
    const [title, facts] = plaqueLines(1.684);
    expect(title).toBe('Homo sapiens');
    expect(facts).toContain('168 cm');
    expect(facts).toContain('206 bones');
  });

  it('fits on the plinth, leaning back toward the viewer', () => {
    expect(PLAQUE.width).toBeLessThan(PLINTH.radius);
    expect(PLAQUE.tilt).toBeGreaterThan(0);
    expect(PLAQUE.tilt).toBeLessThan(Math.PI / 2);
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

describe('the cast shadow', () => {
  it('leaves the feet where they stand and throws the head back and to the left', () => {
    expect(projectToFloor([0.1, 0, -0.05])).toEqual([0.1, -0.05]);
    const [x, z] = projectToFloor([0, 1.64, 0]);
    expect(x).toBeLessThan(0);
    expect(z).toBeLessThan(0);
    expect(Math.hypot(x, z)).toBeLessThan(0.6);
  });

  it('lights from above, so the shadow is shorter than the figure', () => {
    expect(SPOT[1]).toBeGreaterThan(Math.hypot(SPOT[0], SPOT[2]));
    expect(Math.hypot(...SPOT)).toBeCloseTo(1);
  });

  it('falls forward when seen from behind, as the light comes round with the camera', () => {
    const [x, z] = projectToFloor([0, 1.64, 0], SPOT_BEHIND);
    expect(x).toBeGreaterThan(0);
    expect(z).toBeGreaterThan(0);
    expect(frontShare(0.3, 2)).toBe(1);
    expect(frontShare(-0.3, -2)).toBe(0);
    expect(frontShare(2, 0)).toBeCloseTo(0.5);
  });

  it('pales with distance from the feet', () => {
    expect(shadowFalloff(0)).toBe(1);
    expect(shadowFalloff(0.4)).toBeCloseTo(0.5);
    expect(shadowFalloff(0.3)).toBeGreaterThan(shadowFalloff(0.4));
  });
});

describe('standing sway', () => {
  it('never leans more than half a degree', () => {
    for (let t = 0; t < 60; t += 0.1) {
      const { pitch, roll } = swayAt(t);
      expect(Math.abs(pitch)).toBeLessThanOrEqual(SWAY.pitch);
      expect(Math.abs(roll)).toBeLessThanOrEqual(SWAY.roll);
    }
    expect(Math.max(SWAY.pitch, SWAY.roll)).toBeLessThan((0.5 * Math.PI) / 180);
  });

  it('keeps the head within a centimeter of upright', () => {
    for (let t = 0; t < 60; t += 0.25) {
      const { pitch, roll } = swayAt(t);
      expect(1.64 * Math.hypot(pitch, roll)).toBeLessThan(0.01);
    }
  });
});
