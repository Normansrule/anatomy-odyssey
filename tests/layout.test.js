import { describe, it, expect } from 'vitest';
import { DIVES } from '../src/data/dives.js';
import { isDesktopApp, WEB_URL, RELEASES_URL } from '../src/ui/about.js';

const step = (dive, id) => DIVES.find((d) => d.id === dive).steps.find((s) => s.id === id);
const FIGURE_HEIGHT_M = 1.75; // the whole-body model, head to feet

describe('whole-body framing', () => {
  it('the whole body and the whole skeleton fit in view, with a margin', () => {
    for (const s of [step('skeletal', 'body'), step('skeletal', 'skeleton')]) {
      expect(s.frameMeters, s.id).toBeGreaterThan(FIGURE_HEIGHT_M * 1.05);
      expect(s.frameMeters, s.id).toBeLessThan(FIGURE_HEIGHT_M * 1.3); // not shrunk to a speck either
    }
  });
});

describe('web and desktop versions', () => {
  it('recognizes the desktop app and the web', () => {
    expect(isDesktopApp({ __TAURI_INTERNALS__: {}, location: { protocol: 'https:', hostname: 'x' } })).toBe(true);
    expect(isDesktopApp({ location: { protocol: 'tauri:', hostname: 'localhost' } })).toBe(true);
    expect(isDesktopApp({ location: { protocol: 'http:', hostname: 'tauri.localhost' } })).toBe(true);
    expect(isDesktopApp({ location: { protocol: 'https:', hostname: 'normansrule.github.io' } })).toBe(false);
    expect(isDesktopApp(undefined)).toBe(false);
  });
  it('links to the live site and the latest release over HTTPS', () => {
    expect(WEB_URL).toBe('https://normansrule.github.io/anatomy-odyssey/');
    expect(RELEASES_URL).toMatch(/^https:\/\/github\.com\/Normansrule\/anatomy-odyssey\/releases\/latest$/);
  });
});
