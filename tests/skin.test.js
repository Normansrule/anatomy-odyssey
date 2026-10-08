import { describe, it, expect } from 'vitest';
import { vitaminD3Parts } from '../src/library/smallMolecules.js';
import { MOLECULES } from '../src/library/molecules.js';
import { LAYERS, junctionY, buildSkinBlock } from '../src/scenes/skinBlock.js';
import { STRATA, KERATINOCYTE_STAGES, SURFACE_Y } from '../src/scenes/epidermis.js';
import { SUN_STAGES, CELL } from '../src/scenes/sunAndSkin.js';
import { getDive } from '../src/data/dives.js';

const count = (atoms, el) => atoms.filter((a) => a.el === el).length;

describe('vitamin D3', () => {
  it('is C27H44O with one –OH and three C=C double bonds, about 2 nm long', () => {
    const { atoms, doubleBonds, triene, hydroxylO } = vitaminD3Parts();
    expect([count(atoms, 'C'), count(atoms, 'H'), count(atoms, 'O')]).toEqual([27, 44, 1]);
    expect(atoms[hydroxylO].el).toBe('O');
    expect(doubleBonds.length).toBe(3);
    expect(triene.size).toBe(6);
    expect(MOLECULES['vitamin-d3'].charge).toBe(0);
    const heavy = MOLECULES['vitamin-d3'].atoms.filter((a) => a[0] !== 'H');
    let max = 0;
    for (const a of heavy) for (const b of heavy) max = Math.max(max, Math.hypot(a[1] - b[1], a[2] - b[2], a[3] - b[3]));
    expect(max / 10).toBeGreaterThan(1.4);
    expect(max / 10).toBeLessThan(2);
  });
});

describe('skin', () => {
  it('stacks epidermis, dermis and hypodermis in order', () => {
    const order = [LAYERS.epidermis, LAYERS.papillary, LAYERS.reticular, LAYERS.hypodermis];
    for (let i = 1; i < order.length; i++) expect(order[i][1]).toBe(order[i - 1][0]);
    expect(Math.max(...Array.from({ length: 100 }, (_, i) => junctionY(-25 + i / 2, 14)))).toBeLessThan(0);
  });
  it('keeps every blood vessel out of the epidermis', () => {
    const built = buildSkinBlock();
    built.root.updateMatrixWorld(true);
    built.root.traverse((o) => {
      if (o.userData.cardId !== 'skin-vessels') return;
      o.geometry.computeBoundingBox();
      expect(o.geometry.boundingBox.max.y, o.userData.label).toBeLessThan(LAYERS.epidermis[1]);
    });
    built.dispose();
  });
  it('draws the strata within OpenStax’s counts', () => {
    expect(STRATA.basale).toBe(1);
    expect(STRATA.spinosum).toBeGreaterThanOrEqual(8);
    expect(STRATA.spinosum).toBeLessThanOrEqual(10);
    expect(STRATA.granulosum).toBeGreaterThanOrEqual(3);
    expect(STRATA.granulosum).toBeLessThanOrEqual(5);
    expect(STRATA.corneum).toBeGreaterThanOrEqual(15);
    expect(STRATA.corneum).toBeLessThanOrEqual(30);
    expect(SURFACE_Y).toBeGreaterThan(80);
    expect(SURFACE_Y).toBeLessThan(160);
  });
  it('follows a keratinocyte up, and sunlight to vitamin D', () => {
    expect(KERATINOCYTE_STAGES.map((s) => s.label)).toEqual(['Born', 'Spinosum', 'Granulosum', 'Corneum', 'Shed']);
    expect(SUN_STAGES.map((s) => s.label)).toEqual(['Sunlight', 'Melanin shields', 'Vitamin D', 'Into the blood']);
    expect(CELL.radii[0] * 2).toBeCloseTo(11, 0);
  });
  it('the skin dive runs body → skin → epidermis → sunlight → vitamin D3', () => {
    expect(getDive('skin').steps.map((s) => s.id)).toEqual(['body', 'skin-block', 'epidermis', 'sun-and-skin', 'vitamin-d3']);
  });
});
