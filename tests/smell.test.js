import { describe, it, expect } from 'vitest';
import { vanillinParts } from '../src/library/smallMolecules.js';
import { OLFACTORY_CM2 } from '../src/scenes/nasalCavity.js';
import { SMELL_STAGES, EPITHELIUM } from '../src/scenes/olfactoryEpithelium.js';
import { RECEPTOR_STAGES, RECEPTOR_TYPES, KNOB_UM } from '../src/scenes/olfactoryCilium.js';
import { NOSE } from '../src/scenes/body.js';
import { getDive } from '../src/data/dives.js';

const count = (atoms, el) => atoms.filter((a) => a.el === el).length;

describe('the smell dive', () => {
  it('vanillin is C8H8O3 with an aldehyde, a methoxy and a hydroxyl group', () => {
    const { atoms, groups } = vanillinParts();
    expect([count(atoms, 'C'), count(atoms, 'H'), count(atoms, 'O')]).toEqual([8, 8, 3]);
    const heavy = (g) => [...g].filter((i) => atoms[i].el !== 'H').map((i) => atoms[i].el).sort();
    expect(heavy(groups.aldehyde)).toEqual(['C', 'O']);
    expect(heavy(groups.methoxy)).toEqual(['C', 'O']);
    expect(heavy(groups.hydroxyl)).toEqual(['O']);
  });
  it('uses OpenStax Biology’s numbers: a 5 cm² epithelium and about 350 receptor types', () => {
    expect(OLFACTORY_CM2).toBe(5);
    expect(RECEPTOR_TYPES).toBe(350);
    expect(KNOB_UM).toBeGreaterThan(1);
    expect(EPITHELIUM.mucus).toBeLessThan(EPITHELIUM.top);
  });
  it('follows a scent from the air to the bulb, and a molecule from carrier to signal', () => {
    expect(SMELL_STAGES.map((s) => s.label)).toEqual(['In the air', 'Into the mucus', 'Bound', 'Neuron fires', 'To the bulb']);
    expect(RECEPTOR_STAGES.map((s) => s.label)).toEqual(['Carried', 'Binds', 'G protein', 'Channels open', 'Signal']);
  });
  it('puts the olfactory patch between the eyes, in front of the brain', () => {
    expect(NOSE.y).toBeGreaterThan(1.6);
    expect(NOSE.z).toBeGreaterThan(0.08);
  });
  it('runs body → nasal cavity → epithelium → cilia → vanillin', () => {
    expect(getDive('smell').steps.map((s) => s.id)).toEqual(['body', 'nasal-cavity', 'olfactory-epithelium', 'olfactory-cilium', 'vanillin']);
  });
});
