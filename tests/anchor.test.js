import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pairedSide, anchorPoint } from '../src/engine/tierEngine.js';
import { pick } from '../src/scenes/kit.js';
import { CARDS } from '../src/data/cards.js';

const pair = [0.2, 0.25, 0.3, -0.2, -0.25, -0.3];

describe('chart anchors', () => {
  it('labels a mirrored pair on one side, and different cards on different sides', () => {
    const sides = ['hand-muscles', 'foot-muscles', 'rotator-cuff', 'forearm-flexors', 'facial-muscles'].map((id) => pairedSide(pair, id));
    for (const s of sides) expect(Math.abs(s)).toBe(1);
    expect(new Set(sides).size).toBe(2);
  });

  it('keeps every piece of a part that crosses the midline or is not a mirrored pair', () => {
    expect(pairedSide([-0.1, 0, 0.1], 'x')).toBe(0); // crosses the midline
    expect(pairedSide([0.02, 0.04, -0.3, -0.4], 'x')).toBe(0); // lopsided
    expect(pairedSide([0.2, 0.3], 'x')).toBe(0); // one side only
  });

  it('puts the number on one hand of a pair drawn as one mesh, not between them', () => {
    const root = new THREE.Group();
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0.3, 0, 0, 0.32, 0.1, 0, -0.3, 0, 0, -0.32, 0.1, 0], 3));
    root.add(pick(new THREE.Mesh(geo), 'hand-muscles'));
    root.updateMatrixWorld(true);
    expect(Math.abs(anchorPoint(root, 'hand-muscles').x)).toBeGreaterThan(0.25);
  });

  it('puts the number on the surface that faces the camera, front or back', () => {
    // A hollow box, like a rib cage: points on its front (+z) and back (-z) faces.
    const pts = [];
    for (const z of [-0.1, 0.1]) for (const x of [-0.05, 0, 0.05]) for (const y of [-0.05, 0, 0.05]) pts.push(x, y, z);
    const root = new THREE.Group();
    root.add(pick(new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts, 3))), 'rib-cage'));
    root.updateMatrixWorld(true);
    const front = anchorPoint(root, 'rib-cage', new THREE.Vector3(0, 0, 1));
    const back = anchorPoint(root, 'rib-cage', new THREE.Vector3(0, 0, -1));
    expect([front.x, front.y, front.z]).toEqual([0, 0, expect.closeTo(0.1)]);
    expect(back.z).toBeCloseTo(-0.1);
  });

  it('marks cards seen from one side only as front or back', () => {
    const sided = CARDS.filter((c) => c.seen);
    expect(sided.length).toBeGreaterThan(10);
    for (const c of sided) expect(['front', 'back'], c.id).toContain(c.seen);
    expect(sided.filter((c) => c.seen === 'back').map((c) => c.id)).toEqual(expect.arrayContaining(['trapezius', 'gluteus-maximus', 'hamstrings', 'back-muscles']));
  });
});
