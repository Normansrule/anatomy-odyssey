import { describe, it, expect } from 'vitest';
import { bilirubinParts } from '../src/library/smallMolecules.js';
import { MOLECULES } from '../src/library/molecules.js';
import { LIVER_KG, GALLBLADDER_MM, LIVER_STAGES } from '../src/scenes/liver.js';
import { LOBULE, hexEdge, LOBULE_STAGES } from '../src/scenes/lobule.js';
import { BILIRUBIN_STAGES, HEPATOCYTE_UM } from '../src/scenes/hepatocyte.js';
import { getDive } from '../src/data/dives.js';

const count = (atoms, el) => atoms.filter((a) => a.el === el).length;

describe('bilirubin', () => {
  it('is C33H36N4O6 with two acid groups, folded by internal hydrogen bonds', () => {
    const { atoms, acidCarbons, hbonds } = bilirubinParts();
    expect([count(atoms, 'C'), count(atoms, 'H'), count(atoms, 'N'), count(atoms, 'O')]).toEqual([33, 36, 4, 6]);
    expect(acidCarbons.length).toBe(2);
    expect(hbonds.length).toBeGreaterThanOrEqual(4);
    expect(MOLECULES.bilirubin.charge).toBe(0);
  });
});

describe('the liver', () => {
  it('weighs about 1.4 kg and its gallbladder is drawn 8 to 10 cm long (OpenStax 23.6)', () => {
    expect(LIVER_KG).toBeCloseTo(1.4, 1);
    expect(GALLBLADDER_MM).toBeGreaterThanOrEqual(80);
    expect(GALLBLADDER_MM).toBeLessThanOrEqual(100);
  });
  it('draws a hexagonal lobule about a millimeter across', () => {
    expect(LOBULE.radius * 2 * 10).toBeGreaterThan(900); // µm
    expect(LOBULE.radius * 2 * 10).toBeLessThan(1500);
    expect(hexEdge(0)).toBeCloseTo(LOBULE.radius, 6); // a corner
    expect(hexEdge(Math.PI / 6)).toBeCloseTo(LOBULE.radius * Math.cos(Math.PI / 6), 6); // mid-edge
    expect(hexEdge(Math.PI / 3 + 1e-9)).toBeCloseTo(LOBULE.radius, 4);
  });
  it('follows blood and bile, and bilirubin from red cell to bile', () => {
    expect(LIVER_STAGES.map((s) => s.label)).toEqual(['Blood in', 'Through the lobules', 'Blood out', 'Bile out']);
    expect(LOBULE_STAGES.map((s) => s.label)).toEqual(['Portal triads', 'Sinusoids', 'Central vein', 'Bile']);
    expect(BILIRUBIN_STAGES.map((s) => s.label)).toEqual(['Old red cell', 'On albumin', 'Into the cell', 'Conjugated', 'Into bile']);
    expect(HEPATOCYTE_UM).toBeGreaterThan(15);
    expect(HEPATOCYTE_UM).toBeLessThan(35);
  });
  it('the liver dive runs body → liver → lobule → liver cells → bilirubin', () => {
    expect(getDive('liver').steps.map((s) => s.id)).toEqual(['body', 'liver', 'lobule', 'hepatocyte', 'bilirubin']);
  });
});
