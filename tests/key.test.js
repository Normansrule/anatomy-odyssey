import { describe, expect, it } from 'vitest';
import { numberParts, leaderEnd, spread, rim, layoutCallouts } from '../src/ui/key.js';

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

describe('chart labels', () => {
  const frame = { mid: 500, top: 0, bottom: 1000, row: 30 };

  it("puts each label on its part's side, level with it when there is room", () => {
    const out = layoutCallouts([{ id: 'a', x: 100, y: 200 }, { id: 'b', x: 900, y: 400 }], frame);
    expect(out).toEqual([{ id: 'a', side: 'left', y: 200 }, { id: 'b', side: 'right', y: 400 }]);
  });

  it("stacks crowded labels a row apart, centered on their parts, in their parts' order", () => {
    const out = layoutCallouts([{ id: 'b', x: 0, y: 310 }, { id: 'a', x: 0, y: 300 }, { id: 'c', x: 0, y: 320 }], frame);
    expect(out.map((o) => o.id)).toEqual(['a', 'b', 'c']);
    expect(out.map((o) => o.y)).toEqual([280, 310, 340]);
  });

  it('keeps labels inside the plate', () => {
    const out = layoutCallouts([{ id: 'a', x: 0, y: 995 }, { id: 'b', x: 0, y: 999 }, { id: 'c', x: 0, y: -50 }], frame);
    const ys = out.map((o) => o.y);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(1000);
    expect(ys).toEqual([0, 970, 1000]);
  });
});
