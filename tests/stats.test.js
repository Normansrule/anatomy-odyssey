import { describe, it, expect } from 'vitest';
import { STATS, statsFor, countTo } from '../src/data/stats.js';
import { getCard } from '../src/data/cards.js';
import { DIVES } from '../src/data/dives.js';

describe('by the numbers', () => {
  it('belongs to real cards, with one to three figures each', () => {
    for (const [id, stats] of Object.entries(STATS)) {
      expect(getCard(id), id).toBeTruthy();
      expect(stats.length, id).toBeGreaterThan(0);
      expect(stats.length, id).toBeLessThanOrEqual(3);
      for (const s of stats) {
        expect(s.value, id).toMatch(/^[\d][\d,.–]*(s)?$/);
        expect(s.value.length, `${id} ${s.value}: long figures shrink too far`).toBeLessThanOrEqual(10);
        expect(s.unit.length, id).toBeGreaterThan(0);
        expect(s.label.length, id).toBeGreaterThan(3);
      }
    }
  });

  it('covers every whole-body, system and organ plate', () => {
    for (const d of DIVES) for (const s of d.steps) if (s.tier <= 3 && !s.sideTrip) expect(statsFor(s.card).length, `${d.id}/${s.id}`).toBeGreaterThan(0);
  });

  it('counts up only to a single number', () => {
    expect(countTo('100,000')).toBe(100000);
    expect(countTo('0.25')).toBe(0.25);
    expect(countTo('12–20')).toBeNull();
    expect(countTo('1,000s')).toBeNull();
    expect(statsFor('no-such-card')).toEqual([]);
  });
});
