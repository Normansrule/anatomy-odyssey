import { describe, expect, it } from 'vitest';
import { metersAtFraction, planSlide, keyStep, RATIO } from '../src/ui/scaleSlider.js';
import { gaugeFraction } from '../src/science/scale.js';
import { getDive } from '../src/data/dives.js';

describe('scale slider', () => {
  it('maps the slider ends to 10 m and 0.1 nm, and inverts the gauge', () => {
    expect(metersAtFraction(0)).toBeCloseTo(10);
    expect(metersAtFraction(1)).toBeCloseTo(1e-10);
    for (const m of [2, 0.2, 1e-3, 8e-6, 6e-9]) expect(metersAtFraction(gaugeFraction(m)) / m).toBeCloseTo(1, 6);
  });

  const path = [{ frameMeters: 0.2 }, { frameMeters: 1e-3 }, { frameMeters: 8e-6 }];

  it('zooms within a step while the target is nearer this step than its neighbors', () => {
    expect(planSlide(path, 0, 0.1)).toEqual({ kind: 'zoom', ratio: 0.5 });
    expect(planSlide(path, 0, 0.5)).toEqual({ kind: 'zoom', ratio: 2.5 });
  });

  it('clamps the zoom to the step range', () => {
    expect(planSlide(path, 0, 50).ratio).toBe(RATIO.max);
    expect(planSlide(path, 2, 1e-9).ratio).toBe(RATIO.min);
  });

  it('flies on one step at a time, in the direction of the target', () => {
    expect(planSlide(path, 0, 1e-9)).toEqual({ kind: 'step', index: 1 });
    expect(planSlide(path, 2, 1)).toEqual({ kind: 'step', index: 1 });
  });

  it('never flips back and forth in the gap between two far-apart steps', () => {
    // 200x apart: every target makes the walk settle on one step.
    for (let e = -4; e <= 0; e += 0.05) {
      const m = 10 ** e;
      let i = 0;
      for (let n = 0; n < 6; n++) {
        const p = planSlide(path, i, m);
        if (p.kind === 'zoom') break;
        i = p.index;
      }
      const p = planSlide(path, i, m);
      expect(p.kind).toBe('zoom');
    }
  });

  it('can carry a real dive from the whole body to its last step in one drag', () => {
    const steps = getDive('circulatory').steps;
    let i = 0;
    for (let n = 0; n < 20; n++) {
      const p = planSlide(steps, i, 1e-10);
      if (p.kind === 'zoom') break;
      i = p.index;
    }
    expect(i).toBe(steps.length - 1);
  });

  it('has keyboard steps for arrows and page keys', () => {
    expect(keyStep('ArrowDown')).toBe(-0.25);
    expect(keyStep('PageUp')).toBe(1);
    expect(keyStep('x')).toBe(0);
  });
});
