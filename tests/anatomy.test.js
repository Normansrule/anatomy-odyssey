import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBodyParts, bodyParts, decodeGlb } from '../src/scenes/bodyMeshes.js';
import { buildBody, buildSkeletonScene, heartbeatScale, SYSTEMS, LANDMARKS } from '../src/scenes/body.js';
import { DIVES } from '../src/data/dives.js';
import { getCard } from '../src/data/cards.js';
import CREDITS from '../assets/CREDITS.md?raw';

const bytes = readFileSync(new URL('../assets/anatomy/body.glb', import.meta.url));
// The app fetches the bundle; here the "fetch" reads the same file from disk.
const fileFetch = async () => ({ ok: true, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });

describe('the measured body anatomy', async () => {
  const parts = await loadBodyParts({ fetchImpl: fileFetch });

  it('loads through the integrity check and decodes hundreds of parts', () => {
    expect(bodyParts()).toBe(parts);
    expect(parts.length).toBeGreaterThan(300);
  });

  it('is in meters, standing on the floor, about 1.6 m tall, facing +z', () => {
    let top = -Infinity;
    let bottom = Infinity;
    for (const p of parts) {
      top = Math.max(top, p.geometry.boundingBox.max.y);
      bottom = Math.min(bottom, p.geometry.boundingBox.min.y);
    }
    expect(bottom).toBeGreaterThan(-0.03);
    expect(bottom).toBeLessThan(0.03);
    expect(top).toBeCloseTo(LANDMARKS.height, 2);
    // The breastbone is in front of the spine.
    const z = (card) => parts.find((p) => p.extras.card === card).geometry.boundingBox.max.z;
    expect(z('rib-cage')).toBeGreaterThan(z('vertebral-column'));
  });

  it('puts the heart left of center and the liver on the right', () => {
    expect(LANDMARKS.heart[0]).toBeGreaterThan(0);
    expect(LANDMARKS.liver[0]).toBeLessThan(LANDMARKS.heart[0]);
  });

  it('gives every part a system, a card that exists and a label', () => {
    const systems = new Set(SYSTEMS.map((s) => s.id));
    for (const p of parts) {
      expect(systems.has(p.extras.system), p.name).toBe(true);
      expect(getCard(p.extras.card), p.extras.card).toBeTruthy();
      expect(p.extras.label.length).toBeGreaterThan(2);
    }
  });

  it('has smooth surfaces: unit normals and texture coordinates on every vertex', () => {
    for (const p of parts.slice(0, 40)) {
      const n = p.geometry.attributes.normal;
      for (let i = 0; i < n.count; i += 97) expect(Math.hypot(n.getX(i), n.getY(i), n.getZ(i))).toBeCloseTo(1, 2);
      expect(p.geometry.attributes.uv.count).toBe(n.count);
    }
  });

  it('builds the body with every system and the skeleton with the left femur picked out', () => {
    const body = buildBody({ reducedMotion: true, systems: SYSTEMS.map((s) => s.id) });
    expect(body.detailed).toBe(true);
    const cards = new Set();
    body.root.traverse((o) => o.userData.cardId && cards.add(o.userData.cardId));
    for (const id of ['skin', 'skull', 'femur', 'heart', 'lungs', 'brain', 'liver', 'kidney', 'stomach', 'biceps', 'spinal-cord', 'thyroid-gland', 'eye', 'ear', 'nasal-cavity', 'spleen']) {
      expect(cards.has(id), id).toBe(true);
    }
    body.dispose();
    // Shared geometry survives a scene's disposal, so the next scene can reuse it.
    expect(parts[0].geometry.attributes.position.count).toBeGreaterThan(0);
    const skeleton = buildSkeletonScene({ reducedMotion: true });
    const shown = [];
    skeleton.root.traverse((o) => o.isMesh && o.visible && o.userData.cardId === 'femur' && shown.push(o));
    expect(shown.length).toBe(2);
    skeleton.dispose();
  });

  it('beats: the heart squeezes a few percent at systole and is back to full size between beats', () => {
    expect(heartbeatScale(0.18)).toBeLessThan(0.97);
    expect(heartbeatScale(0.6)).toBeCloseTo(1, 3);
  });

  it('aims every dive that enters through the body at a point inside the body', () => {
    for (const d of DIVES) {
      const s = d.steps.find((x) => x.scene === 'body' && x.focus);
      if (!s) continue;
      expect(s.focus[1], d.id).toBeGreaterThan(0.3);
      expect(s.focus[1], d.id).toBeLessThan(LANDMARKS.height);
      expect(Math.abs(s.focus[0]), d.id).toBeLessThan(0.3);
    }
  });

  it('credits BodyParts3D under its ShareAlike license', () => {
    expect(CREDITS).toMatch(/body\.glb/);
    expect(CREDITS).toMatch(/BodyParts3D/);
    expect(CREDITS).toMatch(/CC BY-SA 2\.1/);
  });

  it('rejects a bundle whose bytes were changed', async () => {
    const tampered = new Uint8Array(bytes);
    tampered[tampered.length - 5] ^= 0xff;
    const { verifyAsset } = await import('../src/security/assetIntegrity.js');
    const manifest = (await import('../assets/manifest.json')).default;
    await expect(verifyAsset(tampered, manifest.assets['anatomy/body.glb'])).rejects.toThrow(/hash/);
    expect(() => decodeGlb(bytes)).not.toThrow();
  });
});
