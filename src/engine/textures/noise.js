// Deterministic, tileable noise for procedural tissue textures.
// Every function is periodic: with coordinates in [0, period), the left edge
// matches the right edge, so textures tile without seams. Pure functions,
// tested in tests/textures.test.js.

/** Integer hash of a lattice point to [0, 1). */
export function hash2(ix, iy, seed = 0) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iy | 0, 668265263) ^ Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const wrap = (i, p) => ((i % p) + p) % p;
const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10); // quintic smoothstep

/** Value noise in [0, 1], periodic with the given integer period. */
export function valueNoise(x, y, period, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = fade(x - xi);
  const fy = fade(y - yi);
  const x0 = wrap(xi, period);
  const y0 = wrap(yi, period);
  const x1 = wrap(xi + 1, period);
  const y1 = wrap(yi + 1, period);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Fractal sum of value noise (fBm) in [0, 1] over u, v in [0, 1).
 * `period` is the lattice size of the first octave; each octave doubles it,
 * so the sum stays tileable.
 */
export function fbm(u, v, { period = 4, octaves = 5, gain = 0.5, seed = 0 } = {}) {
  let amp = 0.5;
  let p = period;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * valueNoise(u * p, v * p, p, seed + o * 101);
    norm += amp;
    amp *= gain;
    p *= 2;
  }
  return sum / norm;
}

/**
 * Cellular (Worley) noise over u, v in [0, 1) with `period` cells per side:
 * distances to the nearest and second-nearest feature points, in cell units.
 * f1 is small near cell centers; f2 − f1 is small along cell borders.
 */
export function worley(u, v, period, seed = 0) {
  const x = u * period;
  const y = v * period;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let f1 = 9;
  let f2 = 9;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = xi + dx;
      const cy = yi + dy;
      const wx = wrap(cx, period);
      const wy = wrap(cy, period);
      const px = cx + hash2(wx, wy, seed);
      const py = cy + hash2(wx, wy, seed + 17);
      const d = Math.hypot(px - x, py - y);
      if (d < f1) {
        f2 = f1;
        f1 = d;
      } else if (d < f2) {
        f2 = d;
      }
    }
  }
  return { f1, f2 };
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp01 = (x) => Math.min(1, Math.max(0, x));
