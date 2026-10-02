// Scale math shared by the depth gauge, the scale bar, and the tests.
// Everything here is pure (no DOM, no three.js) so it can be unit-tested in Node.

/** Top and bottom of the depth gauge, as powers of ten in meters. */
export const GAUGE_TOP_EXP = 1; // 10 m
export const GAUGE_BOTTOM_EXP = -10; // 0.1 nm (1 ångström)

const UNITS = [
  { unit: 'm', factor: 1 },
  { unit: 'cm', factor: 1e-2 },
  { unit: 'mm', factor: 1e-3 },
  { unit: 'µm', factor: 1e-6 },
  { unit: 'nm', factor: 1e-9 },
];

/**
 * Pick the largest unit in which the value is at least 1, and format it.
 * formatLength(0.00042) -> { value: 420, unit: 'µm', text: '420 µm' }
 */
export function formatLength(meters, sig = 2) {
  if (!Number.isFinite(meters) || meters <= 0) throw new RangeError('length must be a positive number');
  let chosen = UNITS[UNITS.length - 1];
  for (const u of UNITS) {
    if (meters >= u.factor) {
      chosen = u;
      break;
    }
  }
  const raw = meters / chosen.factor;
  const value = Number(raw.toPrecision(sig));
  return { value, unit: chosen.unit, text: `${formatNumber(value)} ${chosen.unit}` };
}

function formatNumber(n) {
  if (Number.isInteger(n)) return n.toLocaleString('en-US');
  return String(n);
}

/** Orders of magnitude between two lengths: log10(a / b). */
export function ordersOfMagnitude(a, b) {
  return Math.log10(a / b);
}

/** Interpolate between two lengths on a log scale; t in [0, 1]. */
export function lerpLog(a, b, t) {
  const la = Math.log10(a);
  const lb = Math.log10(b);
  return 10 ** (la + (lb - la) * t);
}

/** Position of a length on the gauge: 0 at the top (10 m), 1 at the bottom (0.1 nm). Clamped. */
export function gaugeFraction(meters) {
  const f = (GAUGE_TOP_EXP - Math.log10(meters)) / (GAUGE_TOP_EXP - GAUGE_BOTTOM_EXP);
  return Math.min(1, Math.max(0, f));
}

/**
 * Choose a "nice" scale-bar length (1, 2 or 5 × 10^n meters) that is at most
 * maxPixels long, given how many meters one screen pixel covers.
 */
export function niceScaleBar(metersPerPixel, maxPixels = 120) {
  if (!(metersPerPixel > 0)) throw new RangeError('metersPerPixel must be positive');
  const maxMeters = metersPerPixel * maxPixels;
  const exp = Math.floor(Math.log10(maxMeters));
  const base = 10 ** exp;
  let meters = base;
  for (const m of [5, 2, 1]) {
    if (m * base <= maxMeters) {
      meters = m * base;
      break;
    }
  }
  return { meters, pixels: meters / metersPerPixel, label: formatLength(meters, 1).text };
}

/**
 * Height of the visible region (in meters) at the camera's target distance.
 * visibleHeight = 2 · d · tan(fov / 2), converted from scene units to meters.
 */
export function visibleHeightMeters(distanceUnits, fovDegrees, metersPerUnit) {
  const fov = (fovDegrees * Math.PI) / 180;
  return 2 * distanceUnits * Math.tan(fov / 2) * metersPerUnit;
}

/** Inverse of visibleHeightMeters: the camera distance (scene units) that frames `frameMeters`. */
export function distanceForFrame(frameMeters, fovDegrees, metersPerUnit) {
  const fov = (fovDegrees * Math.PI) / 180;
  return frameMeters / metersPerUnit / (2 * Math.tan(fov / 2));
}
