// Free zoom with a guide. The scroll wheel or a pinch zooms toward the point
// under the pointer, anywhere in the view. Zoom far enough into the whole
// body and the guide names the nearest part that has a dive built for it,
// nudges the view toward it, and then carries you into that dive; deeper in,
// zooming in goes on to the next step and zooming out goes back a step.
//
// The thresholds compare the camera's distance with the distance the step was
// framed at on arrival (TierEngine.zoomRatio, 1 on arrival): below hintIn the
// guide appears, below goIn it moves on. The camera's limits (tierEngine.js)
// let that ratio run from 0.1 to 3.2.

export const ZOOM = {
  hintIn: 0.5, // show "keep zooming to …"
  goIn: 0.16, // go there
  hintOut: 2.2,
  goOut: 2.9,
  magnet: 0.12, // share of the way each zoom-in step draws the point under the pointer toward the nearest dive (whole body only)
};

/**
 * The places on the whole body where a dive can begin: every built dive that
 * starts on the body scene, entered at its next step, plus extra anchors for
 * dives that start lower down (the knee-jerk reflex starts at the knee).
 */
export function zoomAnchors(dives, extras = []) {
  const out = [];
  for (const dive of dives) {
    if (dive.status !== 'built') continue;
    const i = dive.steps.findIndex((s) => s.scene === 'body');
    if (i < 0 || i === dive.steps.length - 1 || !dive.steps[i].focus) continue;
    const next = dive.steps[i + 1];
    out.push({ diveId: dive.id, stepId: next.id, title: next.title, point: dive.steps[i].focus });
  }
  for (const e of extras) {
    const dive = dives.find((d) => d.id === e.diveId && d.status === 'built');
    const step = dive?.steps.find((s) => s.id === (e.stepId ?? dive.steps[0].id));
    if (step) out.push({ diveId: dive.id, stepId: step.id, title: e.title ?? step.title, point: e.point });
  }
  return out;
}

const dist2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** The anchor closest to point p ([x, y, z]), or null. */
export function nearestAnchor(anchors, p) {
  let best = null;
  let bestD = Infinity;
  for (const a of anchors) {
    const d = dist2(a.point, p);
    if (d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

/**
 * The anchor closest to a line of sight (origin and unit direction, both
 * [x, y, z]): the part "under the pointer", whatever depth it sits at.
 * Anchors behind the viewer are ignored.
 */
export function nearestToRay(anchors, origin, dir) {
  let best = null;
  let bestD = Infinity;
  for (const a of anchors) {
    const v = [a.point[0] - origin[0], a.point[1] - origin[1], a.point[2] - origin[2]];
    const t = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2];
    if (t <= 0) continue;
    const d = v[0] ** 2 + v[1] ** 2 + v[2] ** 2 - t * t;
    if (d < bestD) {
      best = a;
      bestD = d;
    }
  }
  return best;
}

/**
 * What the zoom level asks for: 'go-in' / 'hint-in' when zoomed well in,
 * 'go-out' / 'hint-out' when zoomed well out, otherwise null.
 * ratio = camera distance ÷ the distance on arrival.
 */
export function zoomIntent(ratio, { canIn = true, canOut = true } = {}) {
  if (canIn && ratio <= ZOOM.goIn) return 'go-in';
  if (canIn && ratio <= ZOOM.hintIn) return 'hint-in';
  if (canOut && ratio >= ZOOM.goOut) return 'go-out';
  if (canOut && ratio >= ZOOM.hintOut) return 'hint-out';
  return null;
}
