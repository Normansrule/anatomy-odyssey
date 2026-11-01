// Captions under the row of systems when the body is taken apart.
// Given each figure's screen x (null when off screen), decide how the
// captions fit: one row, two staggered rows, or none at all.

export const CAPTION_ROOM = 104; // px a caption needs to sit on one row
export const CAPTION_MIN = 52; // below this even two rows collide
export const CAPTION_DROP = 22; // px the second row sits below the first

export function captionRows(xs) {
  const seen = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < seen.length; i++) step = Math.min(step, seen[i] - seen[i - 1]);
  if (step >= CAPTION_ROOM) return { gap: 'one', drop: 0 };
  if (step >= CAPTION_MIN) return { gap: 'two', drop: CAPTION_DROP };
  return { gap: 'none', drop: 0 };
}
