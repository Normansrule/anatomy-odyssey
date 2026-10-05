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

describe('skeleton detail', async () => {
  const { vertebraLayout, SPINE_CURVE } = await import('../src/scenes/body.js');
  const { buildSkeletonScene } = await import('../src/scenes/body.js');
  it('has 7 neck, 12 chest and 5 lower-back vertebrae, top to bottom, with bodies widening downward', () => {
    const v = vertebraLayout();
    const count = (r) => v.filter((x) => x.region === r).length;
    expect([count('Cervical'), count('Thoracic'), count('Lumbar')]).toEqual([7, 12, 5]);
    for (let i = 1; i < v.length; i++) {
      expect(v[i].t).toBeGreaterThan(v[i - 1].t);
      expect(v[i].radius).toBeGreaterThanOrEqual(v[i - 1].radius);
    }
  });
  it('the spine curves like an adult’s: neck and lower back forward, chest back', () => {
    const v = vertebraLayout();
    const z = (region) => {
      const mid = v.filter((x) => x.region === region);
      return SPINE_CURVE.getPointAt(mid[Math.floor(mid.length / 2)].t).z;
    };
    expect(z('Cervical')).toBeGreaterThan(z('Thoracic'));
    expect(z('Lumbar')).toBeGreaterThan(z('Thoracic'));
  });
  it('labels the hand, foot, shoulder and disc parts so each opens its own card', () => {
    const built = buildSkeletonScene({ reducedMotion: true });
    const cards = new Set();
    built.root.traverse((o) => o.userData.cardId && cards.add(o.userData.cardId));
    for (const id of ['hand-bones', 'foot-bones', 'shoulder-girdle', 'intervertebral-disc', 'skull', 'rib-cage', 'pelvis', 'femur']) expect(cards.has(id), id).toBe(true);
    built.dispose();
  });
});
