import { describe, it, expect } from 'vitest';
import { APART_ORDER, APART_SPACING, apartSlots, springStep, SYSTEMS } from '../src/scenes/body.js';
import { captionRows, CAPTION_ROOM, CAPTION_DROP } from '../src/ui/layerCaptions.js';

describe('taking the body apart', () => {
  it('orders every system, outside in', () => {
    expect([...APART_ORDER].sort()).toEqual(SYSTEMS.map((s) => s.id).sort());
    expect(APART_ORDER[0]).toBe('skin');
    expect(APART_ORDER.indexOf('muscular')).toBeLessThan(APART_ORDER.indexOf('skeletal'));
  });

  it('spaces the shown systems evenly about the middle', () => {
    const xs = apartSlots(['nervous', 'skin', 'skeletal']);
    expect(Object.keys(xs)).toEqual(['skin', 'skeletal', 'nervous']);
    expect(xs.skin + xs.nervous).toBeCloseTo(0);
    expect(xs.skeletal - xs.skin).toBeCloseTo(APART_SPACING);
    expect(apartSlots(['muscular'])).toEqual({ muscular: 0 });
  });

  it('springs settle on the target without wild overshoot', () => {
    let x = 0, v = 0, peak = 0;
    for (let i = 0; i < 180; i++) {
      [x, v] = springStep(x, v, 1, 1 / 60);
      peak = Math.max(peak, x);
    }
    expect(x).toBeCloseTo(1, 3);
    expect(peak).toBeLessThan(1.15);
  });

  it('springs stay stable on a long frame', () => {
    const [x] = springStep(0, 0, 1, 0.5);
    expect(Number.isFinite(x)).toBe(true);
    expect(Math.abs(x)).toBeLessThan(2);
  });
});

describe('captions under the row', () => {
  it('uses one row when there is room', () => {
    expect(captionRows([100, 100 + CAPTION_ROOM, 100 + 2 * CAPTION_ROOM])).toEqual({ gap: 'one', drop: 0 });
  });
  it('staggers two rows when crowded', () => {
    expect(captionRows([0, 70, 140])).toEqual({ gap: 'two', drop: CAPTION_DROP });
  });
  it('drops captions on a phone-narrow row and ignores missing figures', () => {
    expect(captionRows([0, 38, 76]).gap).toBe('none');
    expect(captionRows([0, null, 200]).gap).toBe('one');
  });
});

describe('the row is interactive', () => {
  it('lifts a pointed-at system briskly and settles it back', async () => {
    const { APART_LIFT, LIFT_SPRING } = await import('../src/scenes/body.js');
    let y = 0, v = 0;
    for (let i = 0; i < 30; i++) [y, v] = springStep(y, v, APART_LIFT, 1 / 60, LIFT_SPRING);
    expect(y).toBeGreaterThan(APART_LIFT * 0.9); // within half a second
    expect(APART_LIFT).toBeLessThan(0.1); // a lift, not a jump
  });

  it('gives every system in the row a headline figure for its caption', async () => {
    const { statsFor } = await import('../src/data/stats.js');
    for (const s of SYSTEMS) expect(statsFor(s.card).length, s.id).toBeGreaterThan(0);
  });
});
