import { describe, expect, it } from 'vitest';
import { numberParts, leaderEnd, spread, rim, layoutCallouts, calloutRoom, chartRoom, MAX_MARKS, MAX_CALLOUTS } from '../src/ui/key.js';

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

  it('hands parts across when a column is full, nearest the middle first', () => {
    const pts = Array.from({ length: 6 }, (_, i) => ({ id: `l${i}`, x: 100 + i * 10, y: 100 + i * 50 }));
    const out = layoutCallouts(pts, { mid: 500, top: 0, bottom: 120, row: 30 }); // 5 rows a side
    expect(out.filter((o) => o.side === 'left').length).toBe(5);
    expect(out.find((o) => o.side === 'right').id).toBe('l5');
  });

  it('keeps a part beside the headline figure on the left when the right column is longer', () => {
    const right = [100, 200, 300, 400].map((y, i) => ({ id: `r${i}`, x: 500, y }));
    const out = layoutCallouts([...right, { id: 'arm', x: 400, y: 250 }], { mid: 450, top: 0, topLeft: 300, bottom: 1000, row: 30 });
    expect(out.find((o) => o.id === 'arm').side).toBe('left');
  });

  it('labels a part beside the heading on the right', () => {
    const out = layoutCallouts([{ id: 'skull', x: 400, y: 50 }, { id: 'hip', x: 400, y: 500 }], { mid: 450, top: 0, topLeft: 300, bottom: 1000, row: 30 });
    expect(out.find((o) => o.id === 'skull').side).toBe('right');
    expect(out.find((o) => o.id === 'hip').side).toBe('left');
  });

  it('labels as many parts as fit down both edges, a row apart', () => {
    expect(calloutRoom({ top: 0, bottom: 332 }, 30)).toBe(22); // 11 rows a side
    expect(calloutRoom({ top: 0, bottom: 2000 }, 30)).toBe(MAX_CALLOUTS);
    expect(calloutRoom({ top: 0, bottom: 100 }, 30)).toBe(MAX_MARKS); // never fewer than the marks
    expect(calloutRoom({ top: 0, topLeft: 300, bottom: 632 }, 30)).toBe(22); // the shorter column decides
  });

  it("labels a dive's own parts and only a few neighbors", () => {
    const tall = { top: 0, bottom: 2000 };
    expect(chartRoom(tall)).toBe(MAX_CALLOUTS); // the whole body fills the chart
    expect(chartRoom(tall, 5)).toBe(MAX_MARKS); // five organs, topped up with landmarks
    expect(chartRoom(tall, 18)).toBe(18);
    expect(chartRoom(tall, 200)).toBe(MAX_CALLOUTS); // never more than fit
  });

  it('keeps catch-all cards in the key but off the plate', () => {
    const [muscles, deltoid] = numberParts(['muscular-system', 'deltoid']);
    expect(muscles.chart).toBe(false);
    expect(deltoid.chart).toBe(true);
  });

  it("starts the left column below the plate's headline figure, the right one at the top", () => {
    const out = layoutCallouts([{ id: 'a', x: 0, y: 290 }, { id: 'b', x: 900, y: 100 }], { ...frame, topLeft: 300 });
    expect(out).toEqual([{ id: 'a', side: 'left', y: 300 }, { id: 'b', side: 'right', y: 100 }]);
  });
});
