import { describe, it, expect } from 'vitest';
import { ZOOM, zoomAnchors, nearestAnchor, nearestToRay, zoomIntent } from '../src/ui/zoomGuide.js';
import { DIVES, AT } from '../src/data/dives.js';

const anchors = zoomAnchors(DIVES, [{ diveId: 'reflex', point: AT.knee, title: 'Knee-jerk reflex' }]);
const near = (p) => nearestAnchor(anchors, p);

describe('zoom guide', () => {
  it('offers every built dive that starts on the whole body, entered at its next step', () => {
    const ids = anchors.map((a) => a.diveId);
    for (const id of ['skeletal', 'circulatory', 'muscular', 'nervous', 'respiratory', 'digestive', 'urinary', 'eye', 'ear', 'liver', 'reflex']) {
      expect(ids, id).toContain(id);
    }
    const heart = anchors.find((a) => a.diveId === 'circulatory');
    expect(heart.stepId).toBe('heart-scan'); // the circulatory dive's first plate after the body
    for (const a of anchors) expect(DIVES.find((d) => d.id === a.diveId).steps.some((s) => s.id === a.stepId)).toBe(true);
  });

  it('steers a zoom toward the part under it: chest to heart, head parts to their own dives, knee to the reflex', () => {
    expect(near(AT.heart).diveId).toBe('circulatory');
    expect(near([AT.heart[0] + 0.01, AT.heart[1] + 0.01, AT.heart[2]]).diveId).toBe('circulatory');
    expect(near(AT.eye).diveId).toBe('eye');
    expect(near(AT.ear).diveId).toBe('ear');
    expect(near(AT.kidney).diveId).toBe('urinary');
    expect(near([AT.knee[0], AT.knee[1] - 0.02, AT.knee[2]]).diveId).toBe('reflex');
    // Anywhere at all still finds somewhere to go: a foot leads to the nearest dive up the leg.
    expect(near([0.08, 0.02, 0.1])).toBeTruthy();
  });

  it('picks the part under the pointer along the line of sight, at whatever depth it sits', () => {
    const from = (p) => {
      const o = [p[0] + 0.1, p[1] + 0.05, 1.5]; // a viewer in front of the body, a little to the side
      const d = p.map((x, i) => x - o[i]);
      const n = Math.hypot(...d);
      return nearestToRay(anchors, o, d.map((x) => x / n));
    };
    expect(from(AT.heart).diveId).toBe('circulatory');
    expect(from(AT.eye).diveId).toBe('eye');
    expect(from(AT.kidney).diveId).toBe('urinary'); // behind the gut, still found along the line
    expect(from(AT.knee).diveId).toBe('reflex');
    // Nothing behind the viewer counts.
    expect(nearestToRay(anchors, [0, 1, 5], [0, 0, 1])).toBe(null);
  });

  it('hints first, then moves on, in both directions, and only where there is somewhere to go', () => {
    expect(zoomIntent(1)).toBe(null);
    expect(zoomIntent(0.4)).toBe('hint-in');
    expect(zoomIntent(ZOOM.goIn)).toBe('go-in');
    expect(zoomIntent(0.1, { canIn: false })).toBe(null);
    expect(zoomIntent(2.5)).toBe('hint-out');
    expect(zoomIntent(3.1)).toBe('go-out');
    expect(zoomIntent(3.1, { canOut: false })).toBe(null);
  });

  it('the camera can actually reach both triggers (its limits are 0.1 and 3.2 times the arrival distance)', () => {
    expect(ZOOM.goIn).toBeGreaterThan(0.1);
    expect(ZOOM.goOut).toBeLessThan(3.2);
    expect(ZOOM.hintIn).toBeGreaterThan(ZOOM.goIn);
    expect(ZOOM.hintOut).toBeLessThan(ZOOM.goOut);
  });

});
