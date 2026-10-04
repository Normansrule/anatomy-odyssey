// The chemistry of life: what the body is made of, how an enzyme speeds a
// reaction, and how blood holds its pH. Tested in tests/chemistry.test.js.
import { GAS_R, BODY_TEMP_K } from './equations.js';

/**
 * Percent of body mass, including water (Campbell Biology, Table 2.1). These
 * sum to 100; the trace elements (iron, iodine, zinc and about a dozen others)
 * are each under 0.01%.
 */
export const BODY_MASS_PERCENT = {
  O: 65.0, C: 18.5, H: 9.5, N: 3.3, Ca: 1.5, P: 1.0, K: 0.4, S: 0.3, Na: 0.2, Cl: 0.2, Mg: 0.1,
};

/** Standard atomic weights, g/mol (IUPAC, abridged). */
export const ATOMIC_MASS = {
  H: 1.008, C: 12.011, N: 14.007, O: 15.999, Na: 22.99, Mg: 24.305, P: 30.974, S: 32.06, Cl: 35.45, K: 39.098, Ca: 40.078,
};

export const ELEMENT_NAMES = {
  O: 'Oxygen', C: 'Carbon', H: 'Hydrogen', N: 'Nitrogen', Ca: 'Calcium', P: 'Phosphorus', K: 'Potassium', S: 'Sulfur', Na: 'Sodium', Cl: 'Chlorine', Mg: 'Magnesium',
};

/**
 * Convert mass percentages to percentages of atoms:
 * nᵢ ∝ wᵢ / Mᵢ, then normalize so the listed elements sum to 100.
 */
export function atomPercent(massPercent = BODY_MASS_PERCENT, atomicMass = ATOMIC_MASS) {
  const moles = Object.fromEntries(Object.entries(massPercent).map(([el, w]) => [el, w / atomicMass[el]]));
  const total = Object.values(moles).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(moles).map(([el, n]) => [el, (100 * n) / total]));
}

/**
 * Split percentages into the named groups the body-elements scene draws, with
 * everything else pooled. Returns [{ key, label, percent }] summing to 100.
 */
export function elementGroups(percent, named = ['O', 'C', 'H', 'N', 'Ca', 'P']) {
  const total = Object.values(percent).reduce((a, b) => a + b, 0);
  const groups = named.map((el) => ({ key: el, label: ELEMENT_NAMES[el], percent: (100 * (percent[el] ?? 0)) / total }));
  const rest = 100 - groups.reduce((a, g) => a + g.percent, 0);
  return [...groups, { key: 'other', label: 'Everything else', percent: rest }];
}

/**
 * Share n items among groups by the largest-remainder method, so the counts
 * add up exactly and each group gets its fair share of whole items.
 */
export function apportion(n, percents) {
  const exact = percents.map((p) => (p / 100) * n);
  const base = exact.map(Math.floor);
  let left = n - base.reduce((a, b) => a + b, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    base[i] += 1;
    left -= 1;
  }
  return base;
}

// ── Enzymes ────────────────────────────────────────────────────────────

/** Carbonic anhydrase II: turnover number for CO₂ hydration, per second (about 10⁶). */
export const CA2_KCAT = 1e6;
/** Uncatalyzed CO₂ hydration, first-order rate constant at body pH, per second (about 0.1). */
export const CO2_HYDRATION_K = 0.1;

/**
 * How much an enzyme lowers the activation barrier to speed a reaction up by a
 * given factor (transition-state theory): ΔΔG‡ = RT · ln(speed-up). Joules per mole.
 */
export function barrierDrop(speedup, T = BODY_TEMP_K) {
  if (!(speedup > 0)) throw new RangeError('speed-up must be positive');
  return GAS_R * T * Math.log(speedup);
}

/** The inverse: the speed-up from lowering the barrier by ΔΔG‡ (J/mol): exp(ΔΔG‡ / RT). */
export function speedupFromBarrier(deltaJPerMol, T = BODY_TEMP_K) {
  return Math.exp(deltaJPerMol / (GAS_R * T));
}

/** Mean waiting time of a first-order process: 1 / k. */
export function meanWait(k) {
  return 1 / k;
}

// ── The bicarbonate buffer ───────────────────────────────────────────

/** Apparent pKa of the CO₂/HCO₃⁻ system in plasma at 37 °C. */
export const BICARB_PKA = 6.1;
/** Solubility of CO₂ in plasma: mmol/L of dissolved CO₂ per mmHg of partial pressure. */
export const CO2_SOLUBILITY = 0.03;
/** Normal arterial values. */
export const NORMAL_HCO3_MM = 24;
export const NORMAL_PCO2_MMHG = 40;

/** Henderson–Hasselbalch for blood: pH = 6.1 + log₁₀([HCO₃⁻] / (0.03 × pCO₂)). */
export function bloodPH(hco3 = NORMAL_HCO3_MM, pco2 = NORMAL_PCO2_MMHG) {
  if (!(hco3 > 0) || !(pco2 > 0)) throw new RangeError('concentrations must be positive');
  return BICARB_PKA + Math.log10(hco3 / (CO2_SOLUBILITY * pco2));
}

/** Free hydrogen-ion concentration from pH, in nanomoles per liter: 10^(9 − pH). */
export function hydrogenNanomolar(pH) {
  return 10 ** (9 - pH);
}

/** Avogadro constant, per mole. */
export const AVOGADRO = 6.02214076e23;

/** Atoms in a body of a given mass, from the mass percentages: N = m · Σ(wᵢ / Mᵢ) · N_A. */
export function atomsInBody(massKg, massPercent = BODY_MASS_PERCENT, atomicMass = ATOMIC_MASS) {
  const molesPerGram = Object.entries(massPercent).reduce((s, [el, w]) => s + w / 100 / atomicMass[el], 0);
  return massKg * 1000 * molesPerGram * AVOGADRO;
}
