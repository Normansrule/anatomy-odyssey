import { describe, it, expect } from 'vitest';
import { TIER_TONES, scaleTone, createSound } from '../src/ui/sound.js';

describe('sound', () => {
  it('pitches each tier lower than the one above, so going deeper sounds deeper', () => {
    for (let t = 2; t <= 7; t++) expect(TIER_TONES[t]).toBeLessThan(TIER_TONES[t - 1]);
    expect(scaleTone(0)).toBe(TIER_TONES[1]);
    expect(scaleTone(9)).toBe(TIER_TONES[7]);
  });

  it('is off unless turned on, and stays silent without Web Audio', () => {
    const s = createSound();
    expect(s.enabled).toBe(false);
    s.enabled = true;
    expect(() => { s.tick(); s.pop(); s.whoosh(true); s.step(3, true); }).not.toThrow();
  });
});
