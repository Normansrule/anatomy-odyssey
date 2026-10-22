import { describe, expect, it } from 'vitest';
import { atlasLayout, placeLabels } from '../src/ui/atlas.js';

describe('atlas labels', () => {
  const byRow = (n, nodes) => (nodes.indexOf(n) % 2 ? [18, -12] : [-12, 18]);

  it('moves a label to the other side when its preferred side is taken', () => {
    const nodes = [
      { x: 100, y: 50, title: 'Whole body' },
      { x: 400, y: 50, title: 'Skeleton' },
      { x: 140, y: 50, title: 'Femur' },
    ];
    const dy = placeLabels(nodes, (n) => byRow(n, nodes));
    expect(dy.get(nodes[0])).toBe(-12);
    // "Femur" prefers above, but that is where "Whole body" sits, so it drops below.
    expect(dy.get(nodes[2])).toBe(18);
  });

  it('keeps the usual alternation when labels are far apart', () => {
    const nodes = [0, 1, 2, 3].map((i) => ({ x: i * 200, y: 0, title: 'Bone' }));
    const dy = placeLabels(nodes, (n) => byRow(n, nodes));
    expect(nodes.map((n) => dy.get(n))).toEqual([-12, 18, -12, 18]);
  });

  it('gives every node on the real map a side', () => {
    for (const row of atlasLayout().rows) {
      const all = [...row.nodes, ...row.trips.flatMap((t) => t.nodes)];
      const dy = placeLabels(all, () => [-12, 18, -25]);
      for (const n of all) expect([-12, 18, -25]).toContain(dy.get(n));
    }
  });
});
