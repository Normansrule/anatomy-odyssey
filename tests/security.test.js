import { describe, it, expect } from 'vitest';
import { normalizeQuery, buildIndex, search, MAX_QUERY } from '../src/ui/search.js';
import { verifyAsset, sha256Hex, checkGlbHeader, isAllowedUrl, checkVertexBudget, LIMITS } from '../src/security/assetIntegrity.js';

function fakeGlb(extra = 8) {
  const bytes = new Uint8Array(12 + extra);
  const v = new DataView(bytes.buffer);
  v.setUint32(0, 0x46546c67, true); // "glTF"
  v.setUint32(4, 2, true);
  v.setUint32(8, bytes.byteLength, true);
  return bytes;
}

describe('search input handling', () => {
  it('strips markup characters and caps length', () => {
    expect(normalizeQuery('<img src=x onerror=alert(1)>')).toBe('img src x onerror alert 1');
    expect(normalizeQuery('a'.repeat(500)).length).toBe(MAX_QUERY);
    expect(normalizeQuery('  DNA\u0000\n ')).toBe('dna');
  });
  it('ranks exact and prefix matches first', () => {
    const index = buildIndex();
    expect(search(index, 'fem')[0].id).toBe('femur');
    expect(search(index, 'dna')[0].id).toBe('dna');
    expect(search(index, 'thigh bone')[0].id).toBe('femur');
  });
  it('finds planned building blocks too', () => {
    const r = search(buildIndex(), 'adenosine');
    expect(r[0]).toMatchObject({ id: 'atp', planned: true });
  });
  it('finds parts in every dive by name or alias', () => {
    const index = buildIndex();
    expect(search(index, 'erythrocyte')[0].id).toBe('red-blood-cell');
    expect(search(index, 'igg')[0].id).toBe('antibody');
    expect(search(index, 'z line')[0].id).toBe('z-disc');
    expect(search(index, 'nerve cell')[0].id).toBe('neuron');
    expect(search(index, 'glutamate')[0].id).toBe('neurotransmitter');
    expect(search(index, 'windpipe')[0].id).toBe('trachea');
    expect(search(index, 'air sac')[0].id).toBe('alveolus');
    expect(search(index, 'co2')[0].id).toBe('carbon-dioxide');
  });
  it('returns nothing for empty queries', () => {
    expect(search(buildIndex(), '   ')).toEqual([]);
  });
});

describe('asset integrity', () => {
  it('accepts a GLB whose hash and size match the manifest', async () => {
    const glb = fakeGlb();
    const entry = { sha256: await sha256Hex(glb), bytes: glb.byteLength };
    await expect(verifyAsset(glb, entry)).resolves.toBe(glb);
  });
  it('rejects a tampered file', async () => {
    const glb = fakeGlb();
    const entry = { sha256: await sha256Hex(glb), bytes: glb.byteLength };
    glb[15] ^= 0xff;
    await expect(verifyAsset(glb, entry)).rejects.toThrow(/hash mismatch/);
  });
  it('rejects files missing from the manifest, oversized, or not GLB', async () => {
    await expect(verifyAsset(fakeGlb(), undefined)).rejects.toThrow(/manifest/);
    const notGlb = new Uint8Array(16);
    await expect(verifyAsset(notGlb, { sha256: await sha256Hex(notGlb) })).rejects.toThrow(/not a GLB/);
    const big = { byteLength: LIMITS.maxBytes + 1 };
    await expect(verifyAsset(big, { sha256: 'x' })).rejects.toThrow(/size cap/);
    expect(checkGlbHeader(new Uint8Array(4)).ok).toBe(false);
  });
  it('enforces the vertex budget', () => {
    expect(checkVertexBudget(1000)).toBe(true);
    expect(() => checkVertexBudget(LIMITS.maxVertices + 1)).toThrow();
  });
  it('only allows same-origin or allowlisted https hosts', () => {
    const opts = { origin: 'https://example.github.io', allowHosts: ['assets.example.org'] };
    expect(isAllowedUrl('./assets/femur.glb', opts)).toBe(true);
    expect(isAllowedUrl('https://assets.example.org/a.glb', opts)).toBe(true);
    expect(isAllowedUrl('http://assets.example.org/a.glb', opts)).toBe(false);
    expect(isAllowedUrl('https://evil.example.com/a.glb', opts)).toBe(false);
    expect(isAllowedUrl('javascript:alert(1)', opts)).toBe(false);
  });
});
