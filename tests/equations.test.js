import { describe, it, expect } from 'vitest';
import {
  conductionVelocity, conductionTime, nernst, IONS, D_GLUTAMATE, SYNAPTIC_CLEFT_M, alveolarAreaEstimate,
  capillaryPO2, minuteVentilation, AIR_BLOOD_BARRIER_M,
} from '../src/science/equations.js';
import { dnaLength, helixTurns, diffusionTime, D_O2_WATER, complement, hydrogenBonds } from '../src/science/equations.js';
import { DNA_SEQUENCE } from '../src/library/dna.js';

describe('DNA worked examples', () => {
  it('24 base pairs span 8.16 nm', () => {
    expect(dnaLength(24)).toBeCloseTo(8.16e-9, 20);
  });
  it('a diploid human genome (6.4 × 10^9 bp) is about 2.2 m long', () => {
    expect(dnaLength(6.4e9)).toBeCloseTo(2.176, 3);
  });
  it('21 base pairs make exactly two turns at 10.5 bp per turn', () => {
    expect(helixTurns(21)).toBe(2);
  });
  it('the Dickerson dodecamer pairs with itself (it is palindromic)', () => {
    const dodecamer = 'CGCGAATTCGCG';
    const reverseComplement = [...complement(dodecamer)].reverse().join('');
    expect(reverseComplement).toBe(dodecamer);
  });
  it('counts hydrogen bonds: 3 per G–C, 2 per A–T', () => {
    // CGCGAATTCGCG: 8 G/C and 4 A/T → 8×3 + 4×2 = 32
    expect(hydrogenBonds('CGCGAATTCGCG')).toBe(32);
    expect(hydrogenBonds(DNA_SEQUENCE)).toBe(64);
  });
  it('rejects anything that is not A, T, G or C', () => {
    expect(() => complement('ATGU')).toThrow();
  });
});

describe('diffusion time t ≈ x² / 2D', () => {
  it('oxygen crosses 0.1 mm of water in about 2.4 s', () => {
    expect(diffusionTime(1e-4, D_O2_WATER)).toBeCloseTo(2.38, 2);
  });
  it('but 1 mm takes about 4 minutes (100× longer for 10× the distance)', () => {
    expect(diffusionTime(1e-3, D_O2_WATER)).toBeCloseTo(238.1, 1);
    expect(diffusionTime(1e-3, D_O2_WATER) / diffusionTime(1e-4, D_O2_WATER)).toBeCloseTo(100, 9);
  });
});

import { hillSaturation, rbcThickness, rbcVolume, RBC, sarcomereBands, ACTIN_RISE_NM, ACTIN_REPEAT_SUBUNITS } from '../src/science/equations.js';
import { STROKE_NM, LEVER_NM, headPose, PHASES } from '../src/library/actinMyosin.js';
import { hemeModel } from '../src/library/heme.js';

describe('hemoglobin oxygen binding (Hill equation)', () => {
  it('is half saturated at P50', () => {
    expect(hillSaturation(26.8)).toBeCloseTo(0.5, 10);
  });
  it('is about 97% saturated in the lungs and 75% in resting tissue', () => {
    expect(hillSaturation(100)).toBeCloseTo(0.972, 3);
    expect(hillSaturation(40)).toBeCloseTo(0.747, 3);
  });
  it('is zero with no oxygen and rises monotonically', () => {
    expect(hillSaturation(0)).toBe(0);
    let prev = 0;
    for (let p = 1; p <= 120; p++) {
      const s = hillSaturation(p);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });
});

describe('red blood cell shape (Evans–Fung)', () => {
  it('is 0.81 µm thick at the center and zero at the rim', () => {
    expect(rbcThickness(0)).toBeCloseTo(0.81, 10);
    expect(rbcThickness(RBC.R)).toBe(0);
  });
  it('is thickest (about 2.6 µm) partway out, which makes the dimple', () => {
    let max = 0;
    let at = 0;
    for (let r = 0; r < RBC.R; r += 0.001) {
      const t = rbcThickness(r);
      if (t > max) [max, at] = [t, r];
    }
    expect(max).toBeCloseTo(2.57, 1);
    expect(at / RBC.R).toBeGreaterThan(0.6);
    expect(at / RBC.R).toBeLessThan(0.8);
  });
  it('has a volume of about 94 femtoliters (closed form matches numeric integration)', () => {
    let v = 0;
    const dr = 1e-4;
    for (let r = dr / 2; r < RBC.R; r += dr) v += 2 * Math.PI * r * rbcThickness(r) * dr;
    expect(rbcVolume()).toBeCloseTo(94.1, 0);
    expect(v).toBeCloseTo(rbcVolume(), 1);
  });
});

describe('sliding filaments', () => {
  it('at rest (2.5 µm): A 1.6, I 0.9, H 0.5', () => {
    const b = sarcomereBands(2.5);
    expect(b.A).toBe(1.6);
    expect(b.I).toBeCloseTo(0.9, 10);
    expect(b.H).toBeCloseTo(0.5, 10);
  });
  it('contracted (2.0 µm): the H zone closes and the A band does not change', () => {
    const b = sarcomereBands(2.0);
    expect(b.A).toBe(1.6);
    expect(b.I).toBeCloseTo(0.4, 10);
    expect(b.H).toBe(0);
  });
});

describe('cross-bridge cycle', () => {
  it('four strokes make exactly one 35.75 nm actin repeat, so the animation loops', () => {
    expect(ACTIN_RISE_NM * ACTIN_REPEAT_SUBUNITS).toBeCloseTo(35.75, 10);
    expect(STROKE_NM * 4).toBeCloseTo(35.75, 10);
    expect(STROKE_NM).toBeGreaterThan(5);
    expect(STROKE_NM).toBeLessThan(10);
  });
  it('a 70° lever swing of the model lever length gives exactly one stroke', () => {
    const d = LEVER_NM * (Math.cos((55 * Math.PI) / 180) - Math.cos((125 * Math.PI) / 180));
    expect(d).toBeCloseTo(STROKE_NM, 10);
    expect(LEVER_NM).toBeGreaterThan(7);
    expect(LEVER_NM).toBeLessThan(11);
  });
  it('is attached during the stroke and detached while re-cocking', () => {
    expect(headPose(0.35).drop).toBe(0);
    expect(headPose(0.8).drop).toBeCloseTo(3, 5);
    expect(headPose(0.5).stroke).toBe(1);
    expect(PHASES.every((p, i) => i === 0 || p.until > PHASES[i - 1].until)).toBe(true);
  });
});

describe('heme model', () => {
  const { atoms, bonds } = hemeModel();
  it('has a C20N4 porphyrin core with iron, proximal histidine and O2', () => {
    const count = (el, role) => atoms.filter((a) => a.el === el && (!role || a.role.startsWith(role))).length;
    expect(count('Fe')).toBe(1);
    expect(atoms.filter((a) => ['pyrrole N', 'Cα', 'Cβ', 'meso C'].includes(a.role)).length).toBe(24);
    expect(count('N', 'pyrrole')).toBe(4);
    expect(count('O')).toBe(2);
  });
  it('has realistic bond lengths (1.2–2.2 Å)', () => {
    for (const [i, j] of bonds) {
      const d = atoms[i].p.distanceTo(atoms[j].p);
      expect(d).toBeGreaterThan(1.19);
      expect(d).toBeLessThan(2.2);
    }
  });
});

describe('nervous system worked examples', () => {
  it('Hursh: a 10 µm myelinated fiber conducts at 60 m/s and crosses 1 m in about 17 ms', () => {
    expect(conductionVelocity(10)).toBe(60);
    expect(conductionTime(1, 10) * 1000).toBeCloseTo(16.67, 2);
    expect(() => conductionVelocity(0)).toThrow();
  });
  it('Nernst: E(K⁺) ≈ −89 mV and E(Na⁺) ≈ +61 mV at 37 °C', () => {
    expect(nernst(IONS.K.out, IONS.K.in)).toBeCloseTo(-89.05, 1);
    expect(nernst(IONS.Na.out, IONS.Na.in)).toBeCloseTo(60.64, 1);
    // RT/F at body temperature is about 26.7 mV, so a tenfold gradient gives about 61.5 mV.
    expect(nernst(10, 1)).toBeCloseTo(61.54, 1);
    expect(nernst(10, 1, 2)).toBeCloseTo(30.77, 1);
  });
  it('glutamate crosses a 20 nm cleft in about a quarter of a microsecond', () => {
    expect(diffusionTime(SYNAPTIC_CLEFT_M, D_GLUTAMATE) * 1e6).toBeCloseTo(0.263, 3);
  });
});

describe('respiratory worked examples', () => {
  it('480 million 0.2 mm spheres have about 60 m² of surface', () => {
    expect(alveolarAreaEstimate(480e6, 200e-6)).toBeCloseTo(60.32, 1);
  });
  it('oxygen crosses the 0.62 µm air–blood barrier in about 90 µs', () => {
    expect(diffusionTime(AIR_BLOOD_BARRIER_M, D_O2_WATER) * 1e6).toBeCloseTo(91.5, 0);
  });
  it('capillary blood starts at 40 mmHg and is near 100 mmHg a third of the way along', () => {
    expect(capillaryPO2(0)).toBe(40);
    expect(capillaryPO2(0.25)).toBeCloseTo(97.37, 1);
    expect(capillaryPO2(0.75)).toBeGreaterThan(99.9);
    expect(hillSaturation(capillaryPO2(0))).toBeCloseTo(0.747, 2);
    expect(hillSaturation(capillaryPO2(0.25))).toBeCloseTo(0.97, 2);
  });
  it('minute ventilation: 500 mL × 12 breaths = 6 L/min', () => {
    expect(minuteVentilation(500, 12)).toBe(6);
  });
});

describe('glutamate model (shared neurotransmitter scene)', () => {
  it('has the formula of glutamate at body pH, C5H8NO4 (−1)', async () => {
    const { glutamateModel } = await import('../src/library/neurotransmitter.js');
    const { atoms } = glutamateModel();
    const count = (el) => atoms.filter((a) => a.el === el).length;
    expect([count('C'), count('H'), count('N'), count('O')]).toEqual([5, 8, 1, 4]);
  });
  it('has realistic bond lengths and a roughly tetrahedral alpha carbon', async () => {
    const { glutamateModel } = await import('../src/library/neurotransmitter.js');
    const { atoms, bonds } = glutamateModel();
    for (const [i, j] of bonds) {
      const d = atoms[i].p.distanceTo(atoms[j].p);
      const hasH = atoms[i].el === 'H' || atoms[j].el === 'H';
      if (hasH) expect(d).toBeGreaterThan(0.95), expect(d).toBeLessThan(1.12);
      else expect(d).toBeGreaterThan(1.2), expect(d).toBeLessThan(1.56);
    }
    // Every bond angle at the alpha carbon (atom 0) is close to 109.5°.
    const around = bonds.filter(([i, j]) => i === 0 || j === 0).map(([i, j]) => atoms[i === 0 ? j : i].p.clone().sub(atoms[0].p).normalize());
    expect(around.length).toBe(4);
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      expect((Math.acos(around[a].dot(around[b])) * 180) / Math.PI).toBeCloseTo(109.47, 0);
    }
  });
  it('keeps every atom at least 1.5 Å from any atom it is not bonded to (no clashes between heavy atoms)', async () => {
    const { glutamateModel } = await import('../src/library/neurotransmitter.js');
    const { atoms, bonds } = glutamateModel();
    const bonded = new Set(bonds.map(([i, j]) => `${Math.min(i, j)}-${Math.max(i, j)}`));
    for (let i = 0; i < atoms.length; i++) for (let j = i + 1; j < atoms.length; j++) {
      if (bonded.has(`${i}-${j}`) || atoms[i].el === 'H' || atoms[j].el === 'H') continue;
      expect(atoms[i].p.distanceTo(atoms[j].p), `${i}-${j}`).toBeGreaterThan(1.5);
    }
  });
});

describe('gas molecules', () => {
  it('uses experimental bond lengths: O=O 1.21 Å, C=O 1.16 Å, N≡N 1.10 Å', async () => {
    const { BONDS_A } = await import('../src/library/gases.js');
    expect(BONDS_A).toEqual({ OO: 1.21, CO: 1.16, NN: 1.1 });
  });
});
