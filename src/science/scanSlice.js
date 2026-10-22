// Heart scan geometry: where an ultrasound beam cuts the heart, and what the
// picture on the scanner shows. Pure (no three.js, no DOM) so it is tested in
// Node; src/scenes/heartScan.js draws it.
//
// An echocardiogram is a slice: the probe sends a flat fan of sound into the
// chest, and the screen shows the tissue that fan passes through. Trainees
// learn the standard views by matching that flat picture to the 3D heart, the
// idea behind teaching tools such as the University of Toronto's Virtual TEE.
// Here the views are built from the measured heart's own landmarks.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => scale(a, 1 / (Math.hypot(...a) || 1));
const lerp = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);

/** Rotate vector v about unit axis k by angle a (Rodrigues). */
export function rotateAbout(v, k, a) {
  const c = Math.cos(a);
  const s = Math.sin(a);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/** Signed angle from a to b about axis k (all perpendicular to k). */
function angleAbout(a, b, k) {
  return Math.atan2(dot(cross(a, b), k), dot(a, b));
}

/**
 * The standard views, in order along the probe's sweep:
 *   0  apical four-chamber: through the apex and both inflow valves;
 *   1  apical two-chamber: turned about the heart's long axis, halfway to the next;
 *   2  apical long axis: turned further, through the aortic valve;
 *   3  short axis: across the ventricles, like slicing a loaf.
 * `H` holds apex, tricuspid and mitral points (meters); `aortic` is the
 * aortic valve. Each view has a probe point, the plane's normal, and the
 * direction the sound travels (the picture's "down").
 */
export function scanViews(H, aortic) {
  const axis = unit(sub(H.mitral, H.apex)); // the long axis, apex to base
  const flat = (v) => unit(sub(v, scale(axis, dot(v, axis))));
  // A plane through the long axis is fixed by its normal's angle about it.
  const n4 = flat(cross(sub(H.tricuspid, H.apex), axis));
  const n3 = flat(cross(sub(aortic, H.apex), axis));
  let a3 = angleAbout(n4, n3, axis);
  // Planes repeat every half turn: take the long-axis plane the short way round.
  if (a3 > Math.PI / 2) a3 -= Math.PI;
  if (a3 < -Math.PI / 2) a3 += Math.PI;
  const length = Math.hypot(...sub(H.mitral, H.apex));
  const probe = sub(H.apex, scale(axis, length * 0.12)); // on the chest wall, just past the apex
  const apical = (angle) => ({ probe, normal: rotateAbout(n4, axis, angle), down: axis });
  // The probe turns one way from four chambers through two to the long axis
  // (about 60 then 120 degrees in a textbook heart): the long way round to a3.
  const turn = a3 - Math.sign(a3) * Math.PI;
  // Short axis: across the ventricles at the level of the papillary muscles,
  // looked at from in front of the heart.
  const mid = lerp(H.apex, H.mitral, 0.42);
  const front = flat([0, 0, 1]);
  return [
    { id: 'a4c', name: 'Four-chamber', ...apical(0) },
    { id: 'a2c', name: 'Two-chamber', ...apical(turn * 0.5) },
    { id: 'alax', name: 'Long axis', ...apical(a3) },
    { id: 'sax', name: 'Short axis', probe: add(mid, scale(front, length * 0.75)), normal: axis, down: scale(front, -1) },
  ];
}

/**
 * The view part way along the sweep: `s` from 0 (four-chamber) to 3 (short
 * axis). Between views the probe turns smoothly, as a sonographer's hand does.
 */
export function viewAt(views, s) {
  const i = Math.max(0, Math.min(views.length - 2, Math.floor(s)));
  const t = Math.max(0, Math.min(1, s - i));
  const a = views[i];
  const b = views[i + 1];
  const normal = slerpDir(a.normal, b.normal, t);
  const down = slerpDir(a.down, b.down, t);
  return { probe: lerp(a.probe, b.probe, t), normal, down: unit(sub(down, scale(normal, dot(down, normal)))), near: views[Math.round(Math.min(views.length - 1, Math.max(0, s)))] };
}

/** Turn direction a toward b by fraction t (normals may be flipped to take the short way). */
function slerpDir(a, b, t) {
  let bb = b;
  if (dot(a, b) < 0) bb = scale(b, -1);
  const angle = Math.acos(Math.max(-1, Math.min(1, dot(a, bb))));
  if (angle < 1e-6) return a;
  const k = unit(cross(a, bb));
  return unit(rotateAbout(a, k, angle * t));
}

/**
 * Flatten points onto the scan picture: x across the fan, y the depth from
 * the probe (meters). `right` picks which way across is positive.
 */
export function toImage(p, view, right) {
  const r = sub(p, view.probe);
  return [dot(r, right), dot(r, view.down)];
}

/** The across-the-fan direction, signed so that `toward` (say, the left ventricle) lands on the right of the picture. */
export function imageRight(view, toward) {
  const right = unit(cross(view.down, view.normal));
  return dot(sub(toward, view.probe), right) >= 0 ? right : scale(right, -1);
}

/**
 * A textbook ECG trace, one beat long: the height of the line at `phase`
 * (0 to 1 through the beat, 0 at the start of the atria's squeeze). P wave as
 * the atria contract, the tall QRS spike as the ventricles fire (just before
 * they squeeze, at phase 0.18 in heartbeatScale), then the T wave as they
 * relax. Heights are in millivolts, roughly.
 */
export function ecgTrace(phase) {
  const g = (mu, sigma, h) => h * Math.exp(-(((phase - mu) / sigma) ** 2));
  return g(0.02, 0.025, 0.15) + g(0.115, 0.008, -0.12) + g(0.13, 0.009, 1.1) + g(0.147, 0.01, -0.25) + g(0.36, 0.05, 0.3);
}
