// First-launch hardware check. While the first scene plays, time a couple of
// seconds of frames; if the device struggles, the "Balanced" picture setting
// drops to fewer pixels, and on fast high-refresh screens it allows more.
// Nothing leaves the browser: the result is kept with the other settings.

/** Device-pixel-ratio caps for each picture setting. */
export const PIXEL_CAPS = { low: 1, auto: 1.75, high: 2.5 };
/** What "Balanced" (auto) uses after a measurement. */
export const AUTO_CAPS = { low: 1, balanced: 1.75, high: 2.25 };

/** q-th quantile (0–1) of an ascending array, by linear interpolation. */
export function quantile(sorted, q) {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Pick a tier from frame times (milliseconds).
 * Slower than about 40 frames per second → 'low'. Steady at 90 or more
 * frames per second (a fast GPU on a high-refresh screen) → 'high'.
 * Everything else, including a steady 60 → 'balanced'.
 * (Browsers cap frames at the screen's refresh rate, so a 60 Hz screen can
 * never prove it has headroom; it stays balanced.)
 */
export function recommendTier({ medianMs, p90Ms }) {
  if (!(medianMs > 0)) return 'balanced';
  if (medianMs > 25 || p90Ms > 40) return 'low';
  if (medianMs <= 11.2 && p90Ms <= 14) return 'high';
  return 'balanced';
}

/** The pixel-ratio cap to use for a picture setting and an optional measured tier. */
export function pixelCap(quality, measuredTier) {
  if (quality === 'auto' && measuredTier in AUTO_CAPS) return AUTO_CAPS[measuredTier];
  return PIXEL_CAPS[quality] ?? PIXEL_CAPS.auto;
}

/**
 * Collects frame times. Ignores the first `warmup` frames or `warmupMs` of
 * time, whichever ends first (scene building, the first transition), and any gap over `maxGapMs` (a hidden tab, a
 * breakpoint). push() returns the result once `frames` samples are in, or
 * sooner on a slow device: after `budgetMs` of sampled time with at least
 * `minFrames` samples.
 */
export class FrameBenchmark {
  constructor({ warmup = 45, warmupMs = 2500, frames = 120, minFrames = 20, budgetMs = 4000, maxGapMs = 2000 } = {}) {
    Object.assign(this, { warmup, warmupMs, frames, minFrames, budgetMs, maxGapMs });
    this.seen = 0;
    this.warmTime = 0;
    this.samples = [];
    this.total = 0;
    this.result = null;
  }

  push(dtMs) {
    if (this.result) return this.result;
    this.seen += 1;
    if (this.seen <= this.warmup && this.warmTime < this.warmupMs) {
      this.warmTime += Math.max(0, Math.min(dtMs, this.maxGapMs));
      return null;
    }
    if (!(dtMs > 0) || dtMs > this.maxGapMs) return null;
    this.samples.push(dtMs);
    this.total += dtMs;
    const enough = this.samples.length >= this.frames || (this.samples.length >= this.minFrames && this.total >= this.budgetMs);
    if (!enough) return null;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const medianMs = quantile(sorted, 0.5);
    const p90Ms = quantile(sorted, 0.9);
    this.result = { medianMs: Math.round(medianMs * 10) / 10, p90Ms: Math.round(p90Ms * 10) / 10, tier: recommendTier({ medianMs, p90Ms }) };
    return this.result;
  }
}

/** A stored measurement is usable if it has the right shape. */
export function validMeasurement(m) {
  return Boolean(m && typeof m === 'object' && m.tier in AUTO_CAPS && Number.isFinite(m.medianMs));
}

/** Plain-language summary for the About dialog. */
export function describeMeasurement(m) {
  if (!validMeasurement(m)) return 'Balanced will tune itself to this device after a few seconds of use.';
  const fps = Math.round(1000 / m.medianMs);
  const verdict = { low: 'so Balanced uses fewer pixels to keep motion smooth', balanced: 'so Balanced keeps its normal sharpness', high: 'so Balanced allows extra sharpness' }[m.tier];
  return `Measured on first launch: about ${fps} frames per second (${m.medianMs} ms per frame), ${verdict}.`;
}
