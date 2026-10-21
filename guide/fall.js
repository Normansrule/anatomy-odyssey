// The guide's "fall through the body": how far down the dive a scroll
// position is. Pure, so the tests can check it without a page.

/** Smooth start and stop for a value in [0, 1]. */
export const easeInOut = (x) => x * x * (3 - 2 * x);

/**
 * Where the fall is at `progress` (0 at the first plate, 1 at the last) through
 * plates whose view heights are `meters`. Each plate holds still for the first
 * `hold` share of its stretch of scrolling, then hands over to the next one.
 * Returns the plate being left (`from`), the one arriving (`to`), how far the
 * hand-over has gone (`w`, 0 to 1), the view height in between (log scale, as
 * the app's camera moves), and which plate's caption to show.
 */
export function fallFrame(progress, meters, hold = 0.4) {
  const last = meters.length - 1;
  const t = Math.min(1, Math.max(0, progress)) * last;
  const from = Math.min(last, Math.floor(t));
  const to = Math.min(last, from + 1);
  const w = from === last ? 0 : easeInOut(Math.min(1, Math.max(0, (t - from - hold) / (1 - hold))));
  const height = w === 0 ? meters[from] : Math.exp(Math.log(meters[from]) + (Math.log(meters[to]) - Math.log(meters[from])) * w);
  return { from, to, w, meters: height, active: w < 0.5 ? from : to };
}
