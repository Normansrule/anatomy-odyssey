import { describe, it, expect } from 'vitest';
import {
  formatLength, ordersOfMagnitude, lerpLog, gaugeFraction, niceScaleBar, visibleHeightMeters, distanceForFrame,
} from '../src/science/scale.js';

describe('formatLength', () => {
  it.each([
    [1.75, '1.8 m'],
    [0.45, '45 cm'],
    [0.0014, '1.4 mm'],
    [4.2e-4, '420 µm'],
    [6e-6, '6 µm'],
    [2e-9, '2 nm'],
    [1e-10, '0.1 nm'],
  ])('%f m → %s', (m, text) => {
    expect(formatLength(m).text).toBe(text);
  });
  it('rejects zero and negatives', () => {
    expect(() => formatLength(0)).toThrow();
    expect(() => formatLength(-1)).toThrow();
  });
});

describe('powers of ten', () => {
  it('whole body to DNA width is about a billion-fold', () => {
    // 1.75 m body height vs 2 nm helix width: 8.75 × 10^8
    const orders = ordersOfMagnitude(1.75, 2e-9);
    expect(orders).toBeCloseTo(8.94, 2);
  });
  it('lerpLog hits both ends and the geometric mean', () => {
    expect(lerpLog(1, 1e-9, 0)).toBeCloseTo(1, 12);
    expect(lerpLog(1, 1e-9, 1)).toBeCloseTo(1e-9, 20);
    expect(lerpLog(1, 1e-8, 0.5)).toBeCloseTo(1e-4, 12);
  });
  it('gauge fraction runs from 10 m (0) to 0.1 nm (1) and clamps', () => {
    expect(gaugeFraction(10)).toBe(0);
    expect(gaugeFraction(1e-10)).toBe(1);
    expect(gaugeFraction(1e-3)).toBeCloseTo(4 / 11, 12);
    expect(gaugeFraction(1000)).toBe(0);
    expect(gaugeFraction(1e-15)).toBe(1);
  });
});

describe('scale bar', () => {
  it('picks 1, 2 or 5 × 10^n no longer than the limit', () => {
    // 1 px = 1 mm, 120 px max → 100 mm = 10 cm
    const bar = niceScaleBar(1e-3, 120);
    expect(bar.meters).toBeCloseTo(0.1, 12);
    expect(bar.pixels).toBeCloseTo(100, 6);
    expect(bar.label).toBe('10 cm');
    const bar2 = niceScaleBar(2e-9, 140); // 280 nm max → 200 nm
    expect(bar2.label).toBe('200 nm');
  });
});

describe('camera framing', () => {
  it('distanceForFrame inverts visibleHeightMeters', () => {
    const d = distanceForFrame(1.4e-3, 40, 1e-4);
    expect(visibleHeightMeters(d, 40, 1e-4)).toBeCloseTo(1.4e-3, 15);
  });
});
