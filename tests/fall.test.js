import { describe, expect, it } from 'vitest';
import { easeInOut, fallFrame } from '../guide/fall.js';

const M = [1.95, 1.85, 0.55, 1.6e-3, 4.5e-5];

describe('the guide fall', () => {
  it('starts on the first plate and ends on the last', () => {
    expect(fallFrame(0, M)).toMatchObject({ from: 0, to: 1, w: 0, meters: 1.95, active: 0 });
    expect(fallFrame(1, M)).toMatchObject({ from: 4, to: 4, w: 0, meters: 4.5e-5, active: 4 });
  });

  it('holds each plate still before handing over', () => {
    // A quarter of the way into the second stretch: still inside the hold.
    expect(fallFrame(1.25 / 4, M)).toMatchObject({ from: 1, w: 0, meters: 1.85 });
  });

  it('moves the view height on a log scale, like the camera', () => {
    // Halfway through the femur to bone tissue hand-over: the geometric mean.
    const t = (2 + 0.4 + 0.6 / 2) / 4;
    const f = fallFrame(t, M);
    expect(f.w).toBeCloseTo(0.5, 6);
    expect(f.meters).toBeCloseTo(Math.sqrt(0.55 * 1.6e-3), 9);
  });

  it('shows the arriving plate once the hand-over is past halfway', () => {
    expect(fallFrame((2 + 0.75) / 4, M).active).toBe(3);
    expect(fallFrame((2 + 0.6) / 4, M).active).toBe(2);
  });

  it('clamps scroll past either end', () => {
    expect(fallFrame(-0.3, M).from).toBe(0);
    expect(fallFrame(1.7, M).from).toBe(4);
  });

  it('eases smoothly from 0 to 1', () => {
    expect(easeInOut(0)).toBe(0);
    expect(easeInOut(1)).toBe(1);
    expect(easeInOut(0.5)).toBe(0.5);
  });
});
