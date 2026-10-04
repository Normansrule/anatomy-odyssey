import { describe, it, expect } from 'vitest';
import { quantile, recommendTier, pixelCap, FrameBenchmark, validMeasurement, describeMeasurement } from '../src/engine/benchmark.js';

describe('first-launch benchmark', () => {
  it('computes quantiles by linear interpolation', () => {
    expect(quantile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1, 9);
  });
  it('drops to low below about 40 frames per second, or with bad stutter', () => {
    expect(recommendTier({ medianMs: 33.3, p90Ms: 36 })).toBe('low');
    expect(recommendTier({ medianMs: 16.7, p90Ms: 50 })).toBe('low');
  });
  it('keeps a steady 60 Hz display balanced, and lets a steady 120 Hz one go high', () => {
    expect(recommendTier({ medianMs: 16.7, p90Ms: 17.2 })).toBe('balanced');
    expect(recommendTier({ medianMs: 8.3, p90Ms: 8.9 })).toBe('high');
    expect(recommendTier({ medianMs: 8.3, p90Ms: 20 })).toBe('balanced');
  });
  it('only changes what "Balanced" does; explicit choices win', () => {
    expect(pixelCap('auto', 'low')).toBe(1);
    expect(pixelCap('auto', 'high')).toBe(2.25);
    expect(pixelCap('auto', undefined)).toBe(1.75);
    expect(pixelCap('high', 'low')).toBe(2.5);
    expect(pixelCap('low', 'high')).toBe(1);
  });
  it('ignores warm-up frames and long gaps, then reports once', () => {
    const b = new FrameBenchmark({ warmup: 5, frames: 10 });
    for (let i = 0; i < 5; i++) expect(b.push(500)).toBeNull(); // warm-up, even if slow
    expect(b.push(5000)).toBeNull(); // a gap over two seconds (a hidden tab) is skipped
    let r = null;
    for (let i = 0; i < 10; i++) r = b.push(i < 9 ? 16.7 : 30);
    expect(r).toEqual({ medianMs: 16.7, p90Ms: 18.0, tier: 'balanced' });
    expect(b.push(100)).toBe(r);
  });
  it('finishes early on a very slow device instead of never reporting', () => {
    const b = new FrameBenchmark({ warmup: 2, minFrames: 20, budgetMs: 4000 });
    let r = null;
    let n = 0;
    while (!r && n < 200) {
      r = b.push(300); // about 3 frames per second
      n += 1;
    }
    expect(n).toBe(2 + 20);
    expect(r.tier).toBe('low');
  });
  it('validates stored results and explains them in plain words', () => {
    expect(validMeasurement({ tier: 'low', medianMs: 30 })).toBe(true);
    expect(validMeasurement({ tier: 'ultra', medianMs: 30 })).toBe(false);
    expect(validMeasurement('nonsense')).toBe(false);
    expect(describeMeasurement({ tier: 'low', medianMs: 33.3 })).toContain('about 30 frames per second');
    expect(describeMeasurement(null)).toContain('tune itself');
  });
});
