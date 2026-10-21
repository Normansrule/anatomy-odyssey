import { describe, expect, it } from 'vitest';
import { numberParts, leaderEnd, spread, rim } from '../src/ui/key.js';

describe('living key', () => {
  it('numbers the structures in view from 1, in scene order', () => {
    const parts = numberParts(['heart', 'aorta']);
    expect(parts.map((p) => p.n)).toEqual([1, 2]);
    expect(parts[0].title).toBe('Heart');
  });

  it('draws the leader from the key entry toward the part', () => {
    expect(leaderEnd({ x: 0, y: 0 }, { x: 100, y: 50 }, 0)).toEqual({ x: 0, y: 0 });
    expect(leaderEnd({ x: 0, y: 0 }, { x: 100, y: 50 }, 0.5)).toEqual({ x: 50, y: 25 });
    expect(leaderEnd({ x: 0, y: 0 }, { x: 100, y: 50 }, 1)).toEqual({ x: 100, y: 50 });
  });

  it('sets overlapping marks clear of each other', () => {
    const marks = spread([{ x: 100, y: 100 }, { x: 104, y: 100 }, { x: 100, y: 100 }]);
    for (let i = 0; i < marks.length; i++) {
      for (let j = i + 1; j < marks.length; j++) {
        expect(Math.hypot(marks[i].x - marks[j].x, marks[i].y - marks[j].y)).toBeGreaterThan(20);
      }
    }
  });

  it('leaves marks that are already apart where they are', () => {
    expect(spread([{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
  });
});

describe('leader line ends', () => {
  it('starts and stops on the rim of each number, not over it', () => {
    expect(rim({ x: 0, y: 0 }, { x: 100, y: 0 }, 12)).toEqual({ x: 12, y: 0 });
    expect(rim({ x: 0, y: 0 }, { x: 0, y: -50 }, 12)).toEqual({ x: 0, y: -12 });
  });
});
