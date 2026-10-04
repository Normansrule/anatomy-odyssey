// Shared library scene: oxygen, carbon dioxide and (for scale) nitrogen.
// 1 scene unit = 1 Å. Bond lengths: O=O 1.21 Å, C=O 1.16 Å (CO₂ is
// linear), N≡N 1.10 Å. The control switches ball-and-stick to space-filling
// (van der Waals radii), which is closer to how big each molecule "is".
import * as THREE from 'three/webgpu';
import { materialBank, disposeTree } from '../scenes/kit.js';
import { buildMolecule, styleControls } from './molecule.js';

export const BONDS_A = { OO: 1.21, CO: 1.16, NN: 1.1 };

export function buildGases({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const v = (x, y, z = 0) => new THREE.Vector3(x, y, z);

  const o2 = buildMolecule(
    [
      { el: 'O', p: v(-BONDS_A.OO / 2, 0), card: 'oxygen-molecule', label: 'Oxygen atom' },
      { el: 'O', p: v(BONDS_A.OO / 2, 0), card: 'oxygen-molecule', label: 'Oxygen atom' },
    ],
    [[0, 1, 2]],
    M,
    { defaultCard: 'oxygen-molecule' },
  );
  const co2 = buildMolecule(
    [
      { el: 'C', p: v(0, 0), card: 'carbon-dioxide', label: 'Carbon atom' },
      { el: 'O', p: v(-BONDS_A.CO, 0), card: 'carbon-dioxide', label: 'Oxygen atom' },
      { el: 'O', p: v(BONDS_A.CO, 0), card: 'carbon-dioxide', label: 'Oxygen atom' },
    ],
    [[0, 1, 2], [0, 2, 2]],
    M,
    { defaultCard: 'carbon-dioxide' },
  );
  const n2 = buildMolecule(
    [
      { el: 'N', p: v(-BONDS_A.NN / 2, 0), card: 'nitrogen-molecule', label: 'Nitrogen atom' },
      { el: 'N', p: v(BONDS_A.NN / 2, 0), card: 'nitrogen-molecule', label: 'Nitrogen atom' },
    ],
    [[0, 1, 3]],
    M,
    { defaultCard: 'nitrogen-molecule' },
  );

  const place = (mol, x, y, tilt) => {
    const g = new THREE.Group();
    g.position.set(x, y, 0);
    g.rotation.z = tilt;
    g.add(mol.group);
    root.add(g);
    return g;
  };
  const spinners = [place(o2, -2.7, 0.9, 0.3), place(co2, 2.6, 0.9, -0.25), place(n2, 0, -3.1, 0.1)];

  const controls = styleControls([o2, co2, n2], [
    'Oxygen (red pair, top left) is what your cells use. Carbon dioxide (top right) is what they make. Nitrogen (blue, below) is 78% of air and your body ignores it.',
    'Space filling: each molecule is only about 0.3–0.5 nm across. About 25 billion billion of them fit in one cubic centimeter of air.',
  ]);
  controls.set(0);

  let t = 0;
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-10,
    view: { target: [0, -0.2, 0], direction: [0.15, 0.25, 1] },
    focus: [-2.7, 0.9, 0],
    controls,
    update(dt) {
      if (reducedMotion) return;
      t += dt;
      spinners.forEach((g, i) => (g.rotation.y = t * (0.35 + i * 0.1)));
    },
    dispose() {
      for (const m of [o2, co2, n2]) m.sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
