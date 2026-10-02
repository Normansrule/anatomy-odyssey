// Worked-example equations used in cards and docs/EQUATIONS.md.
// Each function is tested in tests/equations.test.js against hand-worked values.

/** Rise per base pair in B-form DNA, in meters (0.34 nm). */
export const DNA_RISE_M = 0.34e-9;
/** Base pairs per helical turn in B-form DNA (in solution). */
export const DNA_BP_PER_TURN = 10.5;
/** B-DNA diameter, in meters (about 2 nm). */
export const DNA_DIAMETER_M = 2e-9;

/** Contour length of a stretch of B-DNA: L = N_bp × rise. */
export function dnaLength(basePairs, riseMeters = DNA_RISE_M) {
  return basePairs * riseMeters;
}

/** Number of helical turns: turns = N_bp / (bp per turn). */
export function helixTurns(basePairs, bpPerTurn = DNA_BP_PER_TURN) {
  return basePairs / bpPerTurn;
}

/**
 * Characteristic one-dimensional diffusion time: t ≈ x² / (2D).
 * x in meters, D in m²/s, result in seconds.
 */
export function diffusionTime(distanceMeters, diffusivity) {
  if (!(diffusivity > 0)) throw new RangeError('diffusivity must be positive');
  return (distanceMeters * distanceMeters) / (2 * diffusivity);
}

/** Diffusion coefficient of oxygen in water near body temperature, m²/s (order of 2 × 10⁻⁹). */
export const D_O2_WATER = 2.1e-9;

/** Watson–Crick complement of a DNA sequence, read on the same (antiparallel) positions. */
export function complement(seq) {
  const map = { A: 'T', T: 'A', G: 'C', C: 'G' };
  return [...seq.toUpperCase()].map((b) => {
    if (!(b in map)) throw new Error(`not a DNA base: ${b}`);
    return map[b];
  }).join('');
}

/** Hydrogen bonds in a duplex: 2 per A–T pair, 3 per G–C pair. */
export function hydrogenBonds(seq) {
  let n = 0;
  for (const b of seq.toUpperCase()) n += b === 'A' || b === 'T' ? 2 : 3;
  return n;
}

// ── Circulatory ─────────────────────────────────────────────────────

/** Adult human hemoglobin: half-saturation pressure (mmHg) and Hill coefficient. */
export const HB_P50_MMHG = 26.8;
export const HB_HILL_N = 2.7;

/**
 * Hill equation for oxygen saturation of hemoglobin:
 * S = pO2^n / (P50^n + pO2^n). pO2 in mmHg, result in [0, 1].
 */
export function hillSaturation(pO2, p50 = HB_P50_MMHG, n = HB_HILL_N) {
  if (pO2 <= 0) return 0;
  const a = pO2 ** n;
  return a / (p50 ** n + a);
}

/** Red blood cell shape constants (Evans and Fung, 1972), in micrometers. */
export const RBC = { R: 3.91, C0: 0.81, C1: 7.83, C2: -4.39 };

/**
 * Thickness of a resting red blood cell at radius r (µm), Evans–Fung fit:
 * T(r) = sqrt(1 − u) · (C0 + C1·u + C2·u²), u = (r/R)².
 */
export function rbcThickness(r, { R, C0, C1, C2 } = RBC) {
  const u = (r / R) ** 2;
  if (u >= 1) return 0;
  return Math.sqrt(1 - u) * (C0 + C1 * u + C2 * u * u);
}

/**
 * Volume of that shape, V = π R² ∫₀¹ sqrt(1 − u)(C0 + C1 u + C2 u²) du
 * = π R² (2/3 · C0 + 4/15 · C1 + 16/105 · C2), in µm³ (= femtoliters).
 */
export function rbcVolume({ R, C0, C1, C2 } = RBC) {
  return Math.PI * R * R * ((2 / 3) * C0 + (4 / 15) * C1 + (16 / 105) * C2);
}

// ── Muscular ────────────────────────────────────────────────────────

/**
 * Filament lengths in a vertebrate sarcomere, micrometers: the classic frog
 * values (Gordon et al., 1966). Human thin filaments are about 1.2–1.3 µm.
 */
export const THICK_FILAMENT_UM = 1.6;
export const THIN_FILAMENT_UM = 1.0;

/**
 * Band widths for a sarcomere of length L (µm), sliding-filament model:
 *   A band = thick filament length (constant)
 *   I band = L − A
 *   H zone = max(0, L − 2 · thin filament length)
 */
export function sarcomereBands(L, thick = THICK_FILAMENT_UM, thin = THIN_FILAMENT_UM) {
  return {
    A: thick,
    I: Math.max(0, L - thick),
    H: Math.min(thick, Math.max(0, L - 2 * thin)),
  };
}

/** F-actin geometry: rise per subunit (nm) and subunits per helical repeat (13 in 6 turns). */
export const ACTIN_RISE_NM = 2.75;
export const ACTIN_REPEAT_SUBUNITS = 13;

/** ATP hydrolysis under standard conditions, kJ/mol (ATP + H2O → ADP + Pi). */
export const ATP_DELTA_G0 = -30.5;

// ── Nervous ─────────────────────────────────────────────────────────

/** Hursh (1939): myelinated fiber conduction velocity ≈ 6 m/s per µm of outer diameter. */
export const HURSH_FACTOR = 6;

/** Conduction velocity of a myelinated axon, m/s, from its outer diameter in µm. */
export function conductionVelocity(diameterUm, factor = HURSH_FACTOR) {
  if (!(diameterUm > 0)) throw new RangeError('diameter must be positive');
  return factor * diameterUm;
}

/** Time for an action potential to travel `meters` along a myelinated axon of the given diameter, in seconds. */
export function conductionTime(meters, diameterUm) {
  return meters / conductionVelocity(diameterUm);
}

/** Physical constants for the Nernst equation. */
export const GAS_R = 8.314462618; // J/(mol·K)
export const FARADAY = 96485.33212; // C/mol
export const BODY_TEMP_K = 310.15; // 37 °C

/**
 * Nernst equilibrium potential, in millivolts:
 * E = (RT / zF) · ln([ion]out / [ion]in).
 */
export function nernst(cOut, cIn, z = 1, T = BODY_TEMP_K) {
  if (!(cOut > 0 && cIn > 0)) throw new RangeError('concentrations must be positive');
  return ((GAS_R * T) / (z * FARADAY)) * Math.log(cOut / cIn) * 1000;
}

/** Typical mammalian neuron ion concentrations, mM (outside, inside). */
export const IONS = {
  K: { out: 5, in: 140, z: 1 },
  Na: { out: 145, in: 15, z: 1 },
};

/** Diffusion coefficient of glutamate in free solution, m²/s (about 0.76 µm²/ms). */
export const D_GLUTAMATE = 7.6e-10;

/** Width of a typical chemical synaptic cleft, m. */
export const SYNAPTIC_CLEFT_M = 20e-9;

// ── Respiratory ─────────────────────────────────────────────────────

/** Surface area of N spheres of diameter d (m²): the "balloons" estimate of alveolar area. */
export function alveolarAreaEstimate(count, diameterM) {
  return count * Math.PI * diameterM * diameterM;
}

/** Harmonic-mean thickness of the human air–blood barrier (Gehr et al., 1978), m. The thinnest parts are about 0.2 µm. */
export const AIR_BLOOD_BARRIER_M = 0.62e-6;

/**
 * Oxygen pressure in blood moving along a pulmonary capillary, mmHg.
 * A first-order approach to the alveolar value:
 * pO2(t) = PA − (PA − Pv) · e^(−t / τ).
 * Defaults: alveolar 100 mmHg, mixed venous 40 mmHg, τ = 0.08 s, which
 * reaches equilibrium about a third of the way through a 0.75 s transit.
 */
export function capillaryPO2(t, { alveolar = 100, venous = 40, tau = 0.08 } = {}) {
  return alveolar - (alveolar - venous) * Math.exp(-Math.max(0, t) / tau);
}

/** Resting capillary transit time in the lung, s. */
export const LUNG_TRANSIT_S = 0.75;

/** Minute ventilation in L/min from tidal volume (mL) and breaths per minute. */
export function minuteVentilation(tidalMl, breathsPerMin) {
  return (tidalMl * breathsPerMin) / 1000;
}
