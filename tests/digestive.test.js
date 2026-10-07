import { describe, it, expect } from 'vitest';
import { glucoseParts, acetylcholineParts } from '../src/library/smallMolecules.js';
import { MOLECULES } from '../src/library/molecules.js';
import { mucosaRadius, INTESTINE_RADIUS_MM } from '../src/scenes/smallIntestine.js';
import { villusProfile } from '../src/scenes/villi.js';
import { CELL, GLUCOSE_STAGES } from '../src/scenes/enterocyte.js';
import { endPlateHeight, NMJ_CLEFT_NM } from '../src/scenes/neuromuscularJunction.js';
import { DIVES } from '../src/data/dives.js';

const count = (atoms, el) => atoms.filter((a) => a.el === el).length;

describe('the new molecules', () => {
  it('glucose is C6H12O6 with one ring oxygen, five –OH groups and a β anomeric carbon', () => {
    const { atoms, role, c1 } = glucoseParts();
    expect([count(atoms, 'C'), count(atoms, 'H'), count(atoms, 'O')]).toEqual([6, 12, 6]);
    expect(MOLECULES.glucose.charge).toBe(0);
    expect(role.filter(([p, label]) => p === 'oh' && label.startsWith('Oxygen')).length).toBe(5);
    expect(role[c1][1]).toMatch(/β/);
  });
  it('acetylcholine is C7H16NO2+ and splits at its ester bond into an acetyl part (6 atoms) and choline', () => {
    const { atoms, acetyl, nitrogen } = acetylcholineParts();
    expect([count(atoms, 'C'), count(atoms, 'H'), count(atoms, 'N'), count(atoms, 'O')]).toEqual([7, 16, 1, 2]);
    expect(MOLECULES.acetylcholine.charge).toBe(1);
    expect(acetyl.size).toBe(6); // C(=O)CH3
    expect(acetyl.has(nitrogen)).toBe(false);
  });
});

describe('digestive dive geometry', () => {
  it('the small intestine is about 2.5 cm across and its circular folds reach a few mm into it', () => {
    expect(INTESTINE_RADIUS_MM * 2).toBeCloseTo(25.4, 5);
    const radii = Array.from({ length: 200 }, (_, i) => mucosaRadius(-20 + i * 0.2));
    const depth = Math.max(...radii) - Math.min(...radii);
    expect(depth).toBeGreaterThan(2);
    expect(depth).toBeLessThan(8);
  });
  it('villi are drawn 0.5 to 1 mm tall and microvilli about 1 µm long', () => {
    const tip = Math.max(...villusProfile(52, 12).map(([, y]) => y)) * 10; // µm
    expect(tip).toBeGreaterThan(500);
    expect(Math.max(...villusProfile(76, 14).map(([, y]) => y)) * 10).toBeLessThan(1000);
    expect(CELL.microvillusLength).toBe(1);
  });
  it('the glucose path has five stages, ending with the pump', () => {
    expect(GLUCOSE_STAGES.map((s) => s.label)).toEqual(['In the gut', 'Into the cell', 'Across', 'Into the blood', 'Pump']);
  });
});

describe('the reflex reaches the molecule', () => {
  it('the junction gap is drawn 50 nm and the folds dip far below the crests', () => {
    expect(NMJ_CLEFT_NM).toBe(50);
    expect(endPlateHeight(23)).toBeLessThan(-40); // a fold mouth, where release sites face
    expect(endPlateHeight(0)).toBeCloseTo(0, 5); // a crest, where receptors sit
  });
  it('both new paths end at tier 7 (a molecule)', () => {
    for (const id of ['digestive', 'reflex']) {
      const steps = DIVES.find((d) => d.id === id).steps;
      expect(steps[steps.length - 1].tier, id).toBe(7);
    }
  });
});
