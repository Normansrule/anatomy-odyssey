import { describe, expect, it } from 'vitest';
import { dot, ecgTrace, imageRight, scanViews, toImage, viewAt } from '../src/science/scanSlice.js';
import LANDMARKS from '../src/data/bodyLandmarks.json';

const H = LANDMARKS.heartChambers;
const aortic = [H.mitral[0] - 0.012, H.mitral[1] + 0.006, H.mitral[2] + 0.012];
const close = (a, b, d = 6) => a.forEach((x, i) => expect(x).toBeCloseTo(b[i], d));

describe('the standard heart scan views', () => {
  const views = scanViews(H, aortic);

  it('has four views, each with a unit normal and a beam at right angles to it', () => {
    expect(views.map((v) => v.id)).toEqual(['a4c', 'a2c', 'alax', 'sax']);
    for (const v of views) {
      expect(Math.hypot(...v.normal)).toBeCloseTo(1, 9);
      expect(dot(v.normal, v.down)).toBeCloseTo(0, 9);
    }
  });

  it('cuts the four-chamber view through the apex and both inflow valves', () => {
    const a4c = views[0];
    for (const p of [H.apex, H.tricuspid, H.mitral]) expect(dot(p.map((x, i) => x - a4c.probe[i]), a4c.normal)).toBeCloseTo(0, 9);
  });

  it('turns the apical views about the long axis, through the aortic valve last', () => {
    const alax = views[2];
    for (const p of [H.apex, H.mitral, aortic]) expect(dot(p.map((x, i) => x - alax.probe[i]), alax.normal)).toBeCloseTo(0, 9);
  });

  it('cuts the short axis across the long axis', () => {
    const axis = H.mitral.map((x, i) => x - H.apex[i]);
    const n = Math.hypot(...axis);
    expect(Math.abs(dot(views[3].normal, axis.map((x) => x / n)))).toBeCloseTo(1, 9);
  });

  it('sweeps smoothly between views and lands on each one', () => {
    close(viewAt(views, 0).normal, views[0].normal);
    close(viewAt(views, 3).normal, views[3].normal);
    const half = viewAt(views, 0.5);
    expect(Math.hypot(...half.normal)).toBeCloseTo(1, 9);
    expect(dot(half.normal, half.down)).toBeCloseTo(0, 9);
    expect(viewAt(views, 1.6).near.id).toBe('alax');
  });

  it('puts a chosen point on the right of the picture, at its depth', () => {
    const v = views[0];
    const right = imageRight(v, H.chambers.leftVentricle.center);
    const [x, y] = toImage(H.chambers.leftVentricle.center, v, right);
    expect(x).toBeGreaterThan(0);
    expect(y).toBeGreaterThan(0); // below the probe
  });
});

describe('the ECG trace on the scanner', () => {
  it('peaks at the QRS spike, just before the ventricles squeeze', () => {
    let best = 0;
    for (let i = 0; i < 1000; i++) if (ecgTrace(i / 1000) > ecgTrace(best / 1000)) best = i;
    expect(best / 1000).toBeGreaterThan(0.12);
    expect(best / 1000).toBeLessThan(0.14);
  });

  it('rests on the baseline between beats', () => {
    expect(Math.abs(ecgTrace(0.7))).toBeLessThan(0.01);
  });
});
