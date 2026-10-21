import { describe, expect, it } from 'vitest';
import { sheetAfter, SWIPE_PX } from '../src/ui/sheet.js';

describe('phone card sheet', () => {
  it('toggles on a tap', () => {
    expect(sheetAfter('peek', 0)).toBe('full');
    expect(sheetAfter('full', 3)).toBe('peek');
    expect(sheetAfter(undefined, 0)).toBe('full');
  });

  it('follows the direction of a swipe', () => {
    expect(sheetAfter('peek', -SWIPE_PX)).toBe('full');
    expect(sheetAfter('full', -80)).toBe('full');
    expect(sheetAfter('full', SWIPE_PX)).toBe('peek');
    expect(sheetAfter('peek', 120)).toBe('peek');
  });
});
