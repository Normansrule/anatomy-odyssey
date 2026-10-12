import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three/webgpu';
import { loadBodyParts } from '../src/scenes/bodyMeshes.js';
import { buildBrain } from '../src/scenes/brain.js';
import { buildLungs } from '../src/scenes/lungs.js';
import { buildMeasuredBrain, brainParts, GYRI, LOBES } from '../src/scenes/brainMeasured.js';
import { buildMeasuredLungs } from '../src/scenes/lungsMeasured.js';
import { getCard } from '../src/data/cards.js';

const bytes = readFileSync(new URL('../assets/anatomy/body.glb', import.meta.url));
const fileFetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

const cardsIn = (built) => {
  const ids = new Set();
  built.root.traverse((o) => o.userData.cardId && ids.add(o.userData.cardId));
  return ids;
};
const boundsCm = (built) => new THREE.Box3().setFromObject(built.root);

describe('the measured organ close-ups', async () => {
  const parts = await loadBodyParts({ fetchImpl: fileFetch });

  it('fall back to the drawn scenes until the anatomy bundle loads', () => {
    expect(buildMeasuredBrain(null)).toBeNull();
    expect(buildMeasuredLungs(null)).toBeNull();
  });

  describe('brain', () => {
    it('is the measured brain once the bundle has loaded, at its real size', () => {
      const built = buildBrain();
      expect(built.detailed).toBe(true);
      expect(built.root.position.length()).toBe(0);
      const size = boundsCm(built).getSize(new THREE.Vector3());
      // About 17 cm front to back (the brain card), a little narrower side to side.
      expect(size.z).toBeGreaterThan(14);
      expect(size.z).toBeLessThan(19);
      expect(size.x).toBeGreaterThan(11);
      expect(size.x).toBeLessThan(size.z);
      built.dispose();
    });

    it('knows the lobe of every measured fold, and opens a real card from every part', () => {
      for (const p of brainParts(parts)) {
        if (['cerebellum', 'brainstem', 'corpus-callosum'].includes(p.extras.card)) continue;
        expect(GYRI[p.extras.label], p.extras.label).toBeTruthy();
        expect(LOBES[GYRI[p.extras.label][0]]).toBeTruthy();
      }
      const built = buildBrain();
      const ids = cardsIn(built);
      expect([...ids].sort()).toEqual(['brainstem', 'cerebellum', 'cerebral-cortex', 'corpus-callosum']);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      built.dispose();
    });

    it('colors the lobes, and turns the outer cortex see-through to show the middle', () => {
      const built = buildBrain();
      const cortex = [];
      built.root.traverse((o) => o.userData.lobe && cortex.push(o));
      const colors = () => new Set(cortex.map((m) => m.material.color.getHex()));
      built.controls.set(0);
      expect(colors().size).toBe(1);
      built.controls.set(1);
      expect(colors().size).toBe(new Set(cortex.map((m) => m.userData.lobe)).size); // one color per lobe
      const text = built.controls.set(2);
      expect(text).toMatch(/corpus callosum/);
      const frontal = cortex.find((m) => m.userData.lobe === 'frontal');
      const limbic = cortex.find((m) => m.userData.lobe === 'limbic');
      expect(frontal.material.transparent).toBe(true);
      expect(frontal.userData.pickPriority).toBe(-1);
      expect(limbic.material.transparent).toBe(false);
      built.dispose();
    });

    it('enters the cortex dive from the top of the left hemisphere', () => {
      const built = buildBrain();
      const [x, y] = built.focus;
      expect(x).toBeGreaterThan(0);
      expect(y).toBeGreaterThan(boundsCm(built).max.y - 3);
      built.dispose();
    });
  });

  describe('lungs', () => {
    it('are the measured lungs: five lobes, the airways, the pulmonary vessels and the diaphragm', () => {
      const built = buildLungs({ reducedMotion: true });
      expect(built.detailed).toBe(true);
      expect(built.root.position.length()).toBe(0);
      const lobes = [];
      built.root.traverse((o) => o.userData.cardId === 'lungs' && lobes.push(o.userData.label));
      expect(lobes.sort()).toEqual(['Lower lobe of left lung', 'Lower lobe of right lung', 'Middle lobe of right lung', 'Upper lobe of left lung', 'Upper lobe of right lung']);
      const ids = cardsIn(built);
      for (const id of ['trachea', 'bronchi', 'bronchiole', 'alveolus', 'great-vessels', 'heart', 'diaphragm']) expect(ids.has(id), id).toBe(true);
      for (const id of ids) expect(getCard(id), id).toBeTruthy();
      built.dispose();
    });

    it('draws bronchioles that end inside the lobes, and enters the alveoli from the right lung', () => {
      const built = buildLungs({ reducedMotion: true });
      let twigs = 0;
      built.root.traverse((o) => o.userData.cardId === 'bronchiole' && twigs++);
      expect(twigs).toBeGreaterThan(50);
      expect(built.focus[0]).toBeLessThan(0);
      const box = boundsCm(built);
      expect(box.containsPoint(new THREE.Vector3(...built.focus))).toBe(true);
      built.dispose();
    });

    it('breathes: the diaphragm moves down and the lungs expand about their roots', () => {
      const built = buildLungs({ reducedMotion: true });
      let dome = null;
      built.root.traverse((o) => o.userData.cardId === 'diaphragm' && (dome = o));
      built.controls.set(0);
      const y0 = dome.position.y;
      const out = boundsCm(built).getSize(new THREE.Vector3());
      built.controls.set(1);
      expect(dome.position.y).toBeLessThan(y0 - 1);
      const inn = boundsCm(built).getSize(new THREE.Vector3());
      expect(inn.x).toBeGreaterThan(out.x);
      expect(built.controls.readout).toMatch(/500 mL/);
      built.dispose();
      const playing = buildLungs();
      playing.controls.set(0);
      playing.update(1.25);
      expect(playing.controls.value).toBeCloseTo(0.5, 1);
      playing.dispose();
    });
  });
});
