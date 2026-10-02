// Asset integrity checks for the Milestone 2 glTF pipeline.
// The MVP renders procedural geometry, so nothing is fetched yet; these
// guards are in place (and tested) before the first real asset lands.
//
// Order of checks for every downloaded bundle:
//   1. the URL is on the allowlist (same origin or listed hosts)
//   2. the byte size is under the per-asset cap (decompression-bomb guard)
//   3. the SHA-256 digest matches assets/manifest.json
//   4. the bytes are a binary glTF (GLB) with a sane header
// Only then is the file handed to the parser. Nothing in an asset is executed.

export const LIMITS = {
  maxBytes: 40 * 1024 * 1024, // compressed download cap per asset
  maxVertices: 3_000_000, // checked after decode, before upload to the GPU
};

export function isAllowedUrl(url, { origin, allowHosts = [] }) {
  let u;
  try {
    u = new URL(url, origin);
  } catch {
    return false;
  }
  if (u.origin === origin) return true;
  return u.protocol === 'https:' && allowHosts.includes(u.host);
}

export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Parse the 12-byte GLB header: magic "glTF", version 2, declared length. */
export function checkGlbHeader(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 12) return { ok: false, reason: 'too short to be GLB' };
  if (view.getUint32(0, true) !== 0x46546c67) return { ok: false, reason: 'not a GLB file' };
  if (view.getUint32(4, true) !== 2) return { ok: false, reason: 'unsupported glTF version' };
  if (view.getUint32(8, true) !== bytes.byteLength) return { ok: false, reason: 'declared length mismatch' };
  return { ok: true };
}

/**
 * Verify downloaded bytes against a manifest entry { sha256, bytes }.
 * Throws with a specific reason; returns the bytes when everything passes.
 */
export async function verifyAsset(bytes, entry) {
  if (!entry || typeof entry.sha256 !== 'string') throw new Error('asset missing from manifest');
  if (bytes.byteLength > LIMITS.maxBytes) throw new Error('asset exceeds size cap');
  if (entry.bytes !== undefined && entry.bytes !== bytes.byteLength) throw new Error('asset size differs from manifest');
  const hex = await sha256Hex(bytes);
  if (hex !== entry.sha256.toLowerCase()) throw new Error('asset hash mismatch');
  const glb = checkGlbHeader(bytes);
  if (!glb.ok) throw new Error(`asset rejected: ${glb.reason}`);
  return bytes;
}

/** After decoding: refuse meshes that would blow the vertex budget. */
export function checkVertexBudget(vertexCount) {
  if (vertexCount > LIMITS.maxVertices) throw new Error('asset exceeds vertex budget');
  return true;
}
