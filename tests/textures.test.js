import { describe, it, expect } from 'vitest';
import { hash2, valueNoise, fbm, worley } from '../src/engine/textures/noise.js';
import { TISSUES, TISSUE_KINDS, generateTissueMaps, normalFromHeight } from '../src/engine/textures/tissues.js';
import { tissueMaterial, setSurfaceOptions, detailFor } from '../src/engine/textures/surfaces.js';
import { materialBank } from '../src/scenes/kit.js';

describe('tileable noise', () => {
  it('is deterministic and stays in [0, 1]', () => {
    expect(hash2(3, 7, 1)).toBe(hash2(3, 7, 1));
    expect(hash2(3, 7, 1)).not.toBe(hash2(7, 3, 1));
    for (let i = 0; i < 500; i++) {
      const u = (i * 0.618) % 1;
      const v = (i * 0.414) % 1;
      const n = fbm(u, v, { period: 4, seed: 2 });
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
  it('tiles: the left edge matches the right and the top matches the bottom', () => {
    for (const v of [0.1, 0.37, 0.8]) {
      expect(valueNoise(0, v * 8, 8, 3)).toBeCloseTo(valueNoise(8, v * 8, 8, 3), 12);
      expect(fbm(0, v, { period: 4 })).toBeCloseTo(fbm(1, v, { period: 4 }), 12);
      expect(fbm(v, 0, { period: 4 })).toBeCloseTo(fbm(v, 1, { period: 4 }), 12);
      const a = worley(0, v, 10, 5);
      const b = worley(1, v, 10, 5);
      expect(a.f1).toBeCloseTo(b.f1, 9);
    }
  });
  it('cellular noise: f1 ≤ f2, and f1 is zero at a feature point', () => {
    const w = worley(0.33, 0.71, 12, 9);
    expect(w.f1).toBeLessThanOrEqual(w.f2);
    const fx = (4 + hash2(4, 6, 9)) / 12;
    const fy = (6 + hash2(4, 6, 26)) / 12;
    expect(worley(fx, fy, 12, 9).f1).toBeCloseTo(0, 9);
  });
});

describe('tissue texture sets', () => {
  it('every tissue generates color, normal and roughness maps of the right size', () => {
    for (const kind of TISSUE_KINDS) {
      const m = generateTissueMaps(kind, 16, 'natural');
      expect(m.color.length, kind).toBe(16 * 16 * 4);
      expect(m.normal.length, kind).toBe(16 * 16 * 4);
      expect(m.rough.length, kind).toBe(16 * 16 * 4);
      expect(TISSUES[kind].roughness[0]).toBeGreaterThan(0);
    }
  });
  it('the stain look is gray detail; the natural look carries the tissue’s own color', () => {
    const stain = generateTissueMaps('muscle', 8, 'stain');
    for (let i = 0; i < stain.color.length; i += 4) {
      expect(stain.color[i]).toBe(stain.color[i + 1]);
      expect(stain.color[i + 1]).toBe(stain.color[i + 2]);
    }
    const natural = generateTissueMaps('muscle', 8, 'natural');
    let red = 0;
    let green = 0;
    for (let i = 0; i < natural.color.length; i += 4) {
      red += natural.color[i];
      green += natural.color[i + 1];
    }
    expect(red).toBeGreaterThan(green * 1.8); // muscle is red
  });
  it('normal maps point outward with unit length; a flat field gives a flat normal', () => {
    const flat = normalFromHeight(new Float32Array(64).fill(0.5), 8, 1);
    expect([flat[0], flat[1], flat[2]]).toEqual([128, 128, 255]);
    const m = generateTissueMaps('skin', 16, 'natural');
    for (let i = 0; i < m.normal.length; i += 4) {
      const [x, y, z] = [m.normal[i], m.normal[i + 1], m.normal[i + 2]].map((c) => c / 127.5 - 1);
      expect(z).toBeGreaterThan(0);
      expect(Math.hypot(x, y, z)).toBeCloseTo(1, 1);
    }
  });
});

describe('surface materials', () => {
  it('texture detail follows picture quality and the measured device', () => {
    expect(detailFor('low', 'high')).toBe(0);
    expect(detailFor('auto', 'low')).toBe(0);
    expect(detailFor('auto', 'balanced')).toBe(256);
    expect(detailFor('auto', 'high')).toBe(512);
    expect(detailFor('high', 'low')).toBe(512);
  });
  it('a tagged material is physically based with maps and a wet clearcoat; untagged ones are unchanged', () => {
    setSurfaceOptions({ look: 'natural', detail: 16 });
    // 16 is not an allowed size, so detail stays at its previous valid value.
    setSurfaceOptions({ detail: 256 });
    const M = materialBank();
    const muscle = M(0xc9485d, { tissue: 'muscle' });
    expect(muscle.isMeshPhysicalMaterial).toBe(true);
    expect(muscle.map).toBeTruthy();
    expect(muscle.normalMap).toBeTruthy();
    expect(muscle.roughnessMap).toBeTruthy();
    expect(muscle.clearcoat).toBeGreaterThan(0.3);
    expect(muscle.color.getHex()).toBe(0xffffff); // natural look: color comes from the map
    const plain = M(0x6d5bd0, { roughness: 0.5 });
    expect(plain.isMeshStandardMaterial && !plain.isMeshPhysicalMaterial).toBe(true);
    M.dispose();
  });
  it('the stain look keeps the scene color; detail 0 gives a plain material', () => {
    setSurfaceOptions({ look: 'stain', detail: 256 });
    expect(tissueMaterial(0xc9485d, { tissue: 'muscle' }).color.getHex()).toBe(0xc9485d);
    setSurfaceOptions({ look: 'natural', detail: 0 });
    const plain = tissueMaterial(0xc9485d, { tissue: 'muscle', opacity: 0.5, transparent: true });
    expect(plain.isMeshPhysicalMaterial).toBeFalsy();
    expect(plain.map).toBeFalsy();
    expect(plain.color.getHex()).toBe(TISSUES.muscle.natural);
    expect(plain.opacity).toBe(0.5);
    setSurfaceOptions({ look: 'natural', detail: 256 });
  });
});

describe('surfaces used by the scenes', () => {
  it('every tissue a scene asks for exists', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const dir = new URL('../src/scenes/', import.meta.url);
    const used = new Set();
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.js'))) {
      for (const m of readFileSync(new URL(f, dir), 'utf8').matchAll(/tissue: '([a-zA-Z]+)'/g)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(10);
    for (const t of used) expect(TISSUE_KINDS, t).toContain(t);
  });
  it('natural colors are plausible: bone and cartilage are pale, muscle and heart are red, veins darker than arteries', () => {
    const rgb = (hex) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
    const luma = (hex) => rgb(hex).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    expect(luma(TISSUES.bone.natural)).toBeGreaterThan(180);
    expect(luma(TISSUES.cartilage.natural)).toBeGreaterThan(180);
    for (const k of ['muscle', 'myocardium', 'vessel']) {
      const [r, g, b] = rgb(TISSUES[k].natural);
      expect(r, k).toBeGreaterThan(2 * g);
      expect(r, k).toBeGreaterThan(2 * b);
    }
    expect(luma(TISSUES.vein.natural)).toBeLessThan(luma(TISSUES.vessel.natural));
  });
  it('wet tissues have a clearcoat and dry ones barely do', () => {
    for (const k of ['myocardium', 'organ', 'vessel', 'cartilage', 'brain']) expect(TISSUES[k].clearcoat, k).toBeGreaterThanOrEqual(0.6);
    expect(TISSUES.bone.clearcoat).toBeLessThan(0.1);
    expect(TISSUES.skin.clearcoat).toBeLessThan(0.3);
  });
  it('generation is deterministic: the same tissue gives the same pixels every time', () => {
    const a = generateTissueMaps('lung', 16, 'natural');
    const b = generateTissueMaps('lung', 16, 'natural');
    expect(Buffer.from(a.color).equals(Buffer.from(b.color))).toBe(true);
    expect(Buffer.from(a.normal).equals(Buffer.from(b.normal))).toBe(true);
  });
  it('the studio for reflections has a bright key softbox, a fill, a rim and a dark room', async () => {
    const { buildStudio } = await import('../src/engine/environment.js');
    const studio = buildStudio();
    const meshes = [];
    studio.traverse((o) => o.isMesh && meshes.push(o));
    expect(meshes).toHaveLength(5);
    const brightest = Math.max(...meshes.map((m) => m.material.color.r + m.material.color.g + m.material.color.b));
    expect(brightest).toBeGreaterThan(10); // the key softbox is far brighter than white
  });
  it('an unknown tissue is an error, not a silent plain material', () => {
    expect(() => generateTissueMaps('kidney-ish', 8)).toThrow();
    expect(() => tissueMaterial(0xffffff, { tissue: 'nope' })).toThrow();
  });
});

describe('organ colors in the natural look', async () => {
  const { naturalTint } = await import('../src/engine/textures/surfaces.js');
  it('a tint turns the shared organ map into each organ’s own color, and is neutral when not asked for', () => {
    const t = naturalTint(0x7d3a35, 0xd99088);
    expect(t.r).toBeGreaterThan(1); // lighter than the shared map
    const same = naturalTint(0x7d3a35);
    expect([same.r, same.g, same.b]).toEqual([1, 1, 1]);
  });
});
