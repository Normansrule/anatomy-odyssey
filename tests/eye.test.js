import { describe, it, expect } from 'vitest';
import * as THREE from 'three/webgpu';
import { retinalParts } from '../src/library/smallMolecules.js';
import { MOLECULES } from '../src/library/molecules.js';
import { EYE_MM, PUPIL_MM, pupilDiameter, buildEye } from '../src/scenes/eye.js';
import { RETINA_LAYERS, CONE_EVERY, SIGNAL_STAGES } from '../src/scenes/retina.js';
import { CASCADE_STAGES } from '../src/scenes/phototransduction.js';
import { EYES } from '../src/scenes/body.js';
import { getDive } from '../src/data/dives.js';
import { SCENES, SCENE_IDS } from '../src/scenes/registry.js';

const count = (atoms, el) => atoms.filter((a) => a.el === el).length;
/** Dihedral angle (degrees) a–b–c–d. */
function dihedral(a, b, c, d) {
  const b0 = a.clone().sub(b);
  const b1 = c.clone().sub(b).normalize();
  const b2 = d.clone().sub(c);
  const v = b0.sub(b1.clone().multiplyScalar(b0.dot(b1)));
  const w = b2.sub(b1.clone().multiplyScalar(b2.dot(b1)));
  return THREE.MathUtils.radToDeg(Math.atan2(b1.clone().cross(v).dot(w), v.dot(w)));
}
const chainDihedral = (id) => {
  const { atoms, bonds, c11, c12, c13 } = retinalParts(id);
  const nb = (i) => bonds.filter(([a, b]) => a === i || b === i).map(([a, b]) => (a === i ? b : a));
  const c10 = nb(c11).find((k) => atoms[k].el === 'C' && k !== c12);
  return Math.abs(dihedral(atoms[c10].p, atoms[c11].p, atoms[c12].p, atoms[c13].p));
};

describe('retinal', () => {
  it('both forms are C20H28O with a six-carbon ring and an aldehyde', () => {
    for (const id of ['retinal-11-cis', 'retinal-all-trans']) {
      const { atoms, ring, oxygen, c11, c12, bonds } = retinalParts(id);
      expect([count(atoms, 'C'), count(atoms, 'H'), count(atoms, 'O')]).toEqual([20, 28, 1]);
      expect(ring.size).toBe(6);
      expect(atoms[oxygen].el).toBe('O');
      expect(bonds.find(([a, b]) => (a === c11 && b === c12) || (a === c12 && b === c11))[2]).toBe(2);
      expect(MOLECULES[id].charge).toBe(0);
    }
  });
  it('is bent (cis) at C11=C12 before light and straight (trans) after', () => {
    expect(chainDihedral('retinal-11-cis')).toBeLessThan(30);
    expect(chainDihedral('retinal-all-trans')).toBeGreaterThan(150);
  });
});

describe('the eye', () => {
  it('is drawn 24 mm long with EyeWiki’s cornea, chamber and pupil sizes', () => {
    expect(EYE_MM.axial).toBeGreaterThanOrEqual(23);
    expect(EYE_MM.axial).toBeLessThanOrEqual(25);
    expect(EYE_MM.cornea).toBe(12);
    expect(EYE_MM.chamber).toBe(3);
    expect(pupilDiameter(1)).toBe(PUPIL_MM.bright);
    expect(pupilDiameter(0)).toBe(PUPIL_MM.dark);
    expect(PUPIL_MM.bright).toBeGreaterThanOrEqual(2);
    expect(PUPIL_MM.bright).toBeLessThanOrEqual(4);
    expect(PUPIL_MM.dark).toBeGreaterThanOrEqual(4);
    expect(PUPIL_MM.dark).toBeLessThanOrEqual(8);
  });
  it('leaves the scene root at the origin and fits the globe between 0 and 25 mm along its axis', () => {
    const b = buildEye();
    b.root.updateMatrixWorld(true);
    expect(b.root.position.length()).toBe(0);
    let lo = Infinity;
    let hi = -Infinity;
    b.root.traverse((o) => {
      if (o.isMesh && o.userData.cardId === 'sclera') {
        const bb = new THREE.Box3().setFromObject(o);
        lo = Math.min(lo, bb.min.x);
        hi = Math.max(hi, bb.max.x);
      }
    });
    expect(lo).toBeGreaterThan(0);
    expect(hi).toBeCloseTo(EYE_MM.axial, 0);
    b.dispose();
  });
  it('the body’s eyes sit in front of the brain at eye level', () => {
    expect(EYES.x).toEqual([-0.032, 0.032]);
    expect(EYES.y).toBeGreaterThan(1.6);
    expect(EYES.z).toBeGreaterThan(0.06);
  });
});

describe('retina and phototransduction', () => {
  it('stacks the layers from the vitreous side to the pigment epithelium, with rods far outnumbering cones', () => {
    const order = Object.values(RETINA_LAYERS);
    for (let i = 1; i < order.length; i++) expect(order[i][1]).toBe(order[i - 1][0]);
    expect(CONE_EVERY ** 2).toBeGreaterThan(10);
  });
  it('follows the signal out and the cascade in', () => {
    expect(SIGNAL_STAGES.map((s) => s.label)).toEqual(['Light in', 'Rod responds', 'Bipolar cell', 'Ganglion cell', 'To the brain']);
    expect(CASCADE_STAGES.map((s) => s.label)).toEqual(['Dark', 'Photon', 'Transducin', 'cGMP falls', 'Channels close']);
  });
  it('the eye dive runs body → eye → retina → phototransduction → retinal', () => {
    expect(getDive('eye').steps.map((s) => s.id)).toEqual(['body', 'eye', 'retina', 'phototransduction', 'retinal']);
  });
});

describe('every scene', () => {
  it('keeps its root at the origin, except the RNA scene, which centres itself on purpose', () => {
    for (const id of SCENE_IDS.filter((x) => x !== 'rna')) {
      const b = SCENES[id]({ reducedMotion: true });
      expect(b.root.position.length(), id).toBe(0);
      b.dispose();
    }
  });
});
