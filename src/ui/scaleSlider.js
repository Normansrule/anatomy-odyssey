// The scale slider. The scale column is one long slider from 10 m down to
// 0.1 nm on a log scale. Dragging it zooms the view continuously: inside a
// step the camera moves in or out, and when the size you are asking for is
// closer to the next (or previous) step's size than to this one's, the view
// flies on to that step and keeps going. So one drag can take you from the
// whole body to a molecule, plate after plate, without letting go.
import { GAUGE_TOP_EXP, GAUGE_BOTTOM_EXP } from '../science/scale.js';

/** How far the camera may zoom within a step: camera distance ÷ the distance on arrival (see TierEngine.placeCamera). */
export const RATIO = { min: 0.1, max: 3.2 };

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** The view size (meters) at a fraction of the slider, 0 at the top (10 m) to 1 at the bottom (0.1 nm). */
export function metersAtFraction(f) {
  const t = clamp(f, 0, 1);
  return 10 ** (GAUGE_TOP_EXP - t * (GAUGE_TOP_EXP - GAUGE_BOTTOM_EXP));
}

/**
 * What a slider position asks of the view, standing on step `index` of `path`
 * and asking for a view `meters` tall:
 *   { kind: 'step', index } to fly to a neighboring step, or
 *   { kind: 'zoom', ratio } to zoom within this one (clamped to its range).
 * It only moves one step at a time, and only when the neighbor's size is
 * closer to the target than this step's (on a log scale), so a target that
 * falls in the gap between two steps far apart never flips back and forth.
 */
export function planSlide(path, index, meters) {
  const here = path[index].frameMeters;
  const L = Math.log10(meters);
  const gap = (i) => Math.abs(L - Math.log10(path[i].frameMeters));
  if (meters < here && index < path.length - 1 && gap(index + 1) < gap(index)) return { kind: 'step', index: index + 1 };
  if (meters > here && index > 0 && gap(index - 1) < gap(index)) return { kind: 'step', index: index - 1 };
  return { kind: 'zoom', ratio: clamp(meters / here, RATIO.min, RATIO.max) };
}

/** Keyboard steps on the slider: a quarter of a power of ten, or a whole one with Page keys. */
export function keyStep(key) {
  return { ArrowUp: 0.25, ArrowRight: 0.25, ArrowDown: -0.25, ArrowLeft: -0.25, PageUp: 1, PageDown: -1 }[key] ?? 0;
}
