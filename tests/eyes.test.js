import { describe, it, expect } from 'vitest';
import { IRIS_RADIUS, PUPIL, pupilTarget, pupilStep, ringRow } from '../src/scenes/bodyEyes.js';

describe('the eyes', () => {
  it('draws an iris about 12 mm across', () => {
    expect(2 * IRIS_RADIUS * 1000).toBeGreaterThan(11);
    expect(2 * IRIS_RADIUS * 1000).toBeLessThan(13);
  });

  it('narrows the pupil in a lit room and widens it in a dim one, within 2 to 8 mm', () => {
    expect(pupilTarget(false)).toBe(PUPIL.bright);
    expect(pupilTarget(true)).toBe(PUPIL.dim);
    expect(PUPIL.bright).toBeGreaterThanOrEqual(0.002);
    expect(PUPIL.dim).toBeLessThanOrEqual(0.008);
    expect(PUPIL.dim).toBeLessThan(2 * IRIS_RADIUS);
  });

  it('narrows faster than it widens', () => {
    const narrowed = pupilStep(PUPIL.dim, PUPIL.bright, 0.5);
    const widened = pupilStep(PUPIL.bright, PUPIL.dim, 0.5);
    const shut = (PUPIL.dim - narrowed) / (PUPIL.dim - PUPIL.bright);
    const opened = (widened - PUPIL.bright) / (PUPIL.dim - PUPIL.bright);
    expect(shut).toBeGreaterThan(0.7);
    expect(opened).toBeLessThan(0.35);
    // and settles without overshooting
    let d = PUPIL.dim;
    for (let i = 0; i < 300; i++) d = pupilStep(d, PUPIL.bright, 1 / 60);
    expect(d).toBeGreaterThanOrEqual(PUPIL.bright);
    expect(d - PUPIL.bright).toBeLessThan(1e-5);
  });

  it('lays the iris out on the front half of its dome, pupil at the top row', () => {
    expect(ringRow(0)).toBe(0);
    expect(ringRow(1)).toBeCloseTo(0.5);
    expect(ringRow(0.5)).toBeGreaterThan(0);
    expect(ringRow(0.5)).toBeLessThan(ringRow(0.9));
  });
});
