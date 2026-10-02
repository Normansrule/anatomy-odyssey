// Shared library scene: an IgG antibody. 1 scene unit = 1 nm.
// About 15 nm across the arms. Twelve immunoglobulin domains (each about
// 4 × 2.5 nm): two heavy chains (four domains each) and two light chains
// (two each). The arms (Fab) hold antigen-binding loops at their tips; the
// stem (Fc) carries a sugar chain and signals other immune cells.
// A generalized teaching model, not coordinates from a crystal structure.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, tubeThrough, cylinderBetween, seeded, disposeTree } from '../scenes/kit.js';

const DOMAIN = [1.3, 2.0, 1.2];

export function buildAntibody({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const molecule = new THREE.Group();
  root.add(molecule);
  const rand = seeded(83);
  const heavy = [M(0x8a78e8, { roughness: 0.42 }), M(0xa596f2, { roughness: 0.42 })];
  const light = [M(0xf08baf, { roughness: 0.42 }), M(0xf5a3c1, { roughness: 0.42 })];
  const cdrMat = M(0xe8c45a, { roughness: 0.35, emissive: 0xe8c45a, emissiveIntensity: 0.25 });
  const ssMat = M(0xf2d27a, { roughness: 0.3 });

  const domain = (parent, at, dirVec, mat, card, label) => {
    const d = ellipsoid(at, DOMAIN, mat, 22);
    d.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirVec.clone().normalize());
    parent.add(pick(d, card, label));
    return d;
  };

  // Fc stem: CH2 and CH3 domains of both heavy chains.
  const down = new THREE.Vector3(0, -1, 0);
  for (const [i, sx] of [[0, -1], [1, 1]]) {
    domain(molecule, [sx * 1.55, -3.4, 0], down, heavy[i], 'antibody-fc', 'CH2 domain (heavy chain)');
    domain(molecule, [sx * 1.35, -7.6, 0], down, heavy[i], 'antibody-fc', 'CH3 domain (heavy chain)');
  }
  // Sugar chains tucked between the CH2 domains.
  for (let k = 0; k < 7; k++) {
    molecule.add(pick(ellipsoid([(rand() - 0.5) * 1.2, -2.6 - k * 0.45, 0.4 + (rand() - 0.5) * 0.8], [0.35, 0.35, 0.35], M(0xe8c45a, { roughness: 0.5 }), 10), 'antibody-fc', 'Sugar chain (glycan)'));
  }

  // Fab arms, each on its own group so it can flex at the hinge.
  const arms = [];
  for (const [i, sx] of [[0, -1], [1, 1]]) {
    const arm = new THREE.Group();
    molecule.add(arm);
    const dir = new THREE.Vector3(0, 1, 0);
    domain(arm, [0, 3.6, 0], dir, heavy[i], 'antibody-fab', 'CH1 domain (heavy chain)');
    domain(arm, [sx * 2.7, 3.6, 0], dir, light[i], 'antibody-fab', 'CL domain (light chain)');
    domain(arm, [0, 7.8, 0], dir, heavy[i], 'antigen-binding-site', 'VH domain (heavy chain, variable)');
    domain(arm, [sx * 2.6, 7.8, 0], dir, light[i], 'antigen-binding-site', 'VL domain (light chain, variable)');
    // Antigen-binding loops (CDRs) at the tip.
    for (let k = 0; k < 6; k++) {
      const x = (k < 3 ? 0 : sx * 2.6) + (k % 3 - 1) * 0.55;
      arm.add(pick(tubeThrough([[x, 9.5, -0.5], [x + 0.2, 10.4, 0], [x, 9.6, 0.6]], 0.16, cdrMat, 12, 6), 'antigen-binding-site', 'Antigen-binding loop (CDR)'));
    }
    arm.userData = { sx };
    arms.push(arm);
  }
  // A bound antigen at the tip of the first arm (for example, part of a virus spike).
  const antigen = new THREE.Group();
  const agMat = M(0x7cc49a, { roughness: 0.55 });
  for (let k = 0; k < 9; k++) antigen.add(pick(ellipsoid([(rand() - 0.5) * 2.4, 11.4 + rand() * 2.2, (rand() - 0.5) * 2], [1.0, 1.0, 1.0], agMat, 14), 'antigen', 'Antigen'));
  arms[0].add(antigen);

  // Hinge: flexible strands joining the arms to the stem, with disulfide bonds.
  const hinge = new THREE.Group();
  molecule.add(hinge);
  for (const sx of [-1, 1]) hinge.add(pick(tubeThrough([[sx * 1.6, 2.2, 0], [sx * 0.9, 0.4, 0.2], [sx * 1.5, -1.4, 0]], 0.28, heavy[sx < 0 ? 0 : 1], 16, 8), 'antibody', 'Hinge'));
  for (const y of [-0.1, 0.5]) hinge.add(pick(cylinderBetween([-0.85, y, 0.2], [0.85, y, 0.2], 0.14, 0.14, ssMat, 8), 'antibody', 'Disulfide bond'));

  const setArms = (deg) => {
    for (const arm of arms) {
      const { sx } = arm.userData;
      arm.rotation.z = -sx * THREE.MathUtils.degToRad(deg);
      arm.position.set(sx * 0.4, 1.4, 0);
    }
  };
  setArms(55);

  let t = 0;
  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-9,
    view: { target: [0, 1.5, 0], direction: [0.35, 0.2, 1] },
    focus: [0, 0, 0],
    update(dt, env = {}) {
      if (env.reducedMotion ?? reducedMotion) return;
      t += dt;
      // The hinge is flexible: the arms swing a little.
      setArms(55 + 7 * Math.sin(t * 0.9));
      molecule.rotation.y = 0.35 * Math.sin(t * 0.3);
    },
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
