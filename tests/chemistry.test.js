import { describe, it, expect } from 'vitest';
import {
  BODY_MASS_PERCENT, atomPercent, elementGroups, apportion, barrierDrop, speedupFromBarrier, CA2_KCAT, CO2_HYDRATION_K,
  meanWait, bloodPH, hydrogenNanomolar, atomsInBody,
} from '../src/science/chemistry.js';
import { bodyVoxels, fillOrder, BY_MASS, BY_ATOMS } from '../src/scenes/bodyElements.js';
import { CA2, CA2_BARRIER_DROP_KJ, enzymeBeads, caReadout } from '../src/scenes/carbonicAnhydrase.js';
import { BUFFER_SPECIES, bufferReadout } from '../src/scenes/bicarbonateBuffer.js';
import { MOLECULES } from '../src/library/molecules.js';

describe('what the body is made of', () => {
  it('the mass percentages sum to 100, and O, C, H and N make up 96.3%', () => {
    const total = Object.values(BODY_MASS_PERCENT).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(100, 6);
    const { O, C, H, N } = BODY_MASS_PERCENT;
    expect(O + C + H + N).toBeCloseTo(96.3, 6);
  });
  it('counting atoms instead of mass, hydrogen is about 61%, oxygen 26% and carbon 10%', () => {
    const a = atomPercent();
    expect(a.H).toBeCloseTo(61.3, 1);
    expect(a.O).toBeCloseTo(26.4, 1);
    expect(a.C).toBeCloseTo(10.0, 1);
    expect(Object.values(a).reduce((x, y) => x + y, 0)).toBeCloseTo(100, 9);
  });
  it('a 70 kg adult holds about 6.5 × 10²⁷ atoms', () => {
    expect(atomsInBody(70) / 1e27).toBeCloseTo(6.48, 1);
  });
  it('pools the small elements into "everything else" and still sums to 100', () => {
    const g = elementGroups(BODY_MASS_PERCENT);
    expect(g.at(-1).key).toBe('other');
    expect(g.at(-1).percent).toBeCloseTo(1.2, 6); // K 0.4 + S 0.3 + Na 0.2 + Cl 0.2 + Mg 0.1
    expect(g.reduce((s, x) => s + x.percent, 0)).toBeCloseTo(100, 9);
  });
  it('shares whole cubes fairly: counts add up and each is within one of its exact share', () => {
    const percents = BY_MASS.map((x) => x.percent);
    const counts = apportion(2296, percents);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2296);
    counts.forEach((c, i) => expect(Math.abs(c - (percents[i] / 100) * 2296)).toBeLessThan(1));
  });
  it('the cube figure stands 1.75 m tall, and every group gets at least a few cubes either way', () => {
    const v = bodyVoxels();
    expect(v.length).toBeGreaterThan(1800);
    expect(Math.max(...v.map((p) => p[1]))).toBeGreaterThan(1.7);
    for (const groups of [BY_MASS, BY_ATOMS]) {
      const keys = fillOrder(groups, v.length);
      expect(keys.length).toBe(v.length);
      for (const g of groups) expect(keys.filter((k) => k === g.key).length, g.key).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('enzymes: carbonic anhydrase', () => {
  it('a ten-million-fold speed-up needs the barrier lowered by about 41.6 kJ/mol at 37 °C', () => {
    expect(CA2_KCAT / CO2_HYDRATION_K).toBe(1e7);
    expect(barrierDrop(1e7) / 1000).toBeCloseTo(41.56, 2);
    expect(CA2_BARRIER_DROP_KJ).toBeCloseTo(41.56, 2);
  });
  it('every 5.9 kJ/mol is another factor of ten, and the two directions invert', () => {
    expect(barrierDrop(10) / 1000).toBeCloseTo(5.94, 2);
    expect(speedupFromBarrier(barrierDrop(12345))).toBeCloseTo(12345, 6);
  });
  it('uncatalyzed, a CO₂ waits about 10 s; in the enzyme, about a microsecond', () => {
    expect(meanWait(CO2_HYDRATION_K)).toBeCloseTo(10, 9);
    expect(meanWait(CA2_KCAT)).toBeCloseTo(1e-6, 12);
    expect(caReadout(0)).toContain('10 s');
    expect(caReadout(CA2_BARRIER_DROP_KJ)).toContain('1 µs');
    expect(caReadout(CA2_BARRIER_DROP_KJ)).toContain('10 million');
  });
  it('the bead protein has 260 residues, none inside the cleft, none overlapping', () => {
    const beads = enzymeBeads();
    expect(beads.length).toBe(CA2.residues);
    let min = Infinity;
    for (let i = 0; i < beads.length; i++) for (let j = 0; j < i; j++) min = Math.min(min, beads[i].distanceTo(beads[j]));
    expect(min).toBeGreaterThan(3.0);
    // The zinc sits 15 Å below the surface, with nothing between it and the mouth.
    const zn = CA2.radii[2] - CA2.cleftDepth;
    for (const b of beads) if (Math.hypot(b.x, b.y) < 2.5) expect(b.z < zn - 2 || b.z > CA2.radii[2]).toBe(true);
  });
});

describe('the bicarbonate buffer (Henderson–Hasselbalch)', () => {
  it('normal blood: 24 mM bicarbonate and 40 mmHg CO₂ give pH 7.40', () => {
    expect(bloodPH(24, 40)).toBeCloseTo(7.40, 2);
  });
  it('the ratio is 20 to 1, and log₁₀ 20 = 1.3 is what lifts pH from 6.1 to 7.4', () => {
    expect(24 / (0.03 * 40)).toBeCloseTo(20, 9);
    expect(bloodPH(24, 40) - 6.1).toBeCloseTo(Math.log10(20), 9);
  });
  it('doubling CO₂ (holding your breath, lung disease) drops pH by log₁₀ 2 ≈ 0.30', () => {
    expect(bloodPH(24, 80)).toBeCloseTo(7.10, 2);
    expect(bloodPH(24, 40) - bloodPH(24, 80)).toBeCloseTo(Math.log10(2), 9);
  });
  it('free H⁺ is about 40 nM at pH 7.4, so in nM it roughly equals pCO₂ in mmHg', () => {
    expect(hydrogenNanomolar(7.4)).toBeCloseTo(39.8, 1);
    for (const p of [20, 40, 80]) expect(hydrogenNanomolar(bloodPH(24, p))).toBeCloseTo(p, -0.5);
  });
  it('the scene’s molecules are the generated ones, with the right formulas and charges', () => {
    expect(MOLECULES.h2co3.formula).toBe('CH2O3');
    expect(MOLECULES.hco3.charge).toBe(-1);
    expect(MOLECULES.h3o.charge).toBe(1);
    expect(MOLECULES.water.atoms.length).toBe(3);
    expect(BUFFER_SPECIES.map((s) => s.id)).toEqual(['co2', 'water', 'h2co3', 'hco3', 'h3o']);
    expect(bufferReadout(40)).toContain('7.40');
  });
});
