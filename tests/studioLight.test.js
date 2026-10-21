import { describe, expect, it } from 'vitest';
import { followAim, lightDirections } from '../src/engine/studioLight.js';

const length = (v) => Math.hypot(...v);

describe('studio lights', () => {
  it('lights from the upper right, in front, with no pointer', () => {
    const { key, rim } = lightDirections();
    expect(key[0]).toBeGreaterThan(0);
    expect(key[1]).toBeGreaterThan(0);
    expect(key[2]).toBeGreaterThan(0);
    expect(rim[0]).toBeLessThan(0);
    expect(rim[2]).toBeLessThan(0);
  });

  it('returns unit directions', () => {
    for (const aim of [{ x: 0, y: 0 }, { x: 1, y: -1 }, { x: -1, y: 1 }]) {
      const { key, rim } = lightDirections(aim);
      expect(length(key)).toBeCloseTo(1, 9);
      expect(length(rim)).toBeCloseTo(1, 9);
    }
  });

  it('swings the key toward the pointer and keeps it in front', () => {
    const left = lightDirections({ x: -1, y: 0 }).key;
    const right = lightDirections({ x: 1, y: 0 }).key;
    const low = lightDirections({ x: 0, y: -1 }).key;
    expect(left[0]).toBeLessThan(0);
    expect(right[0]).toBeGreaterThan(lightDirections().key[0]);
    expect(low[1]).toBeLessThan(lightDirections().key[1]);
    for (const k of [left, right, low]) expect(k[2]).toBeGreaterThan(0);
  });

  it('ignores a pointer outside the view', () => {
    expect(lightDirections({ x: 5, y: -9 })).toEqual(lightDirections({ x: 1, y: -1 }));
  });

  it('eases toward the pointer, faster with more time', () => {
    const a = followAim({ x: 0, y: 0 }, { x: 1, y: 1 }, 0.016);
    const b = followAim({ x: 0, y: 0 }, { x: 1, y: 1 }, 0.1);
    expect(a.x).toBeGreaterThan(0);
    expect(a.x).toBeLessThan(b.x);
    expect(b.x).toBeLessThan(1);
    expect(followAim({ x: 0.3, y: 0.3 }, { x: 0.3, y: 0.3 }, 1)).toEqual({ x: 0.3, y: 0.3 });
  });
});
