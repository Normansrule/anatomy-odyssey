// The detailed whole-body anatomy: about 400 meshes measured from a real body
// (BodyParts3D, CC BY-SA 2.1 Japan; built by tools/build_body_meshes.py).
//
// The bundle is fetched once, checked against assets/manifest.json (size,
// SHA-256, GLB header; see src/security/assetIntegrity.js), decoded here into
// plain geometries in meters, and shared by every body scene built after it.
// Until it arrives, or if it cannot load, the body scenes fall back to the
// simplified figure drawn in code.
import * as THREE from 'three/webgpu';
import manifest from '../../assets/manifest.json';
import { verifyAsset, checkVertexBudget } from '../security/assetIntegrity.js';

const BUNDLE = 'anatomy/body.glb';
const bundleUrl = new URL('../../assets/anatomy/body.glb', import.meta.url).href;

let parts = null; // [{ name, geometry, extras }]
let loading = null;

/** The decoded parts, or null while they are not loaded. */
export function bodyParts() {
  return parts;
}

/** Fetch, verify and decode the bundle (once). Resolves to the parts. */
export function loadBodyParts({ fetchImpl = globalThis.fetch } = {}) {
  if (parts) return Promise.resolve(parts);
  if (!loading) {
    loading = (async () => {
      const res = await fetchImpl(bundleUrl);
      if (!res.ok) throw new Error(`body anatomy: HTTP ${res.status}`);
      const bytes = new Uint8Array(await res.arrayBuffer());
      await verifyAsset(bytes, manifest.assets[BUNDLE]);
      parts = decodeGlb(bytes);
      return parts;
    })();
    loading.catch(() => (loading = null)); // allow a retry
  }
  return loading;
}

const COMPONENTS = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };

/** Read an accessor into a Float32Array (de-normalizing integer data) or, for indices, an integer array. */
function readAccessor(doc, bin, index, asIndex = false) {
  const a = doc.accessors[index];
  const view = doc.bufferViews[a.bufferView];
  const Type = COMPONENTS[a.componentType];
  const width = WIDTH[a.type];
  const size = Type.BYTES_PER_ELEMENT;
  const stride = (view.byteStride ?? width * size) / size;
  const src = new Type(bin.buffer, bin.byteOffset + (view.byteOffset ?? 0) + (a.byteOffset ?? 0), (a.count - 1) * stride + width);
  if (asIndex) return Type === Uint32Array ? new Uint32Array(src) : new Uint16Array(src);
  const max = { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[a.componentType];
  const out = new Float32Array(a.count * width);
  for (let i = 0; i < a.count; i++) {
    for (let k = 0; k < width; k++) {
      const x = src[i * stride + k];
      out[i * width + k] = a.normalized && max ? Math.max(x / max, -1) : x;
    }
  }
  return out;
}

/**
 * Decode the bundle: one part per node, its geometry baked into the node's
 * position and scale (the quantization transform), so it is in meters.
 */
export function decodeGlb(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const jsonLength = view.getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const binStart = 20 + jsonLength + 8;
  const bin = bytes.subarray(binStart, binStart + view.getUint32(20 + jsonLength, true));
  let vertices = 0;
  const out = doc.nodes.map((node) => {
    const prim = doc.meshes[node.mesh].primitives[0];
    const t = node.translation ?? [0, 0, 0];
    const s = node.scale ?? [1, 1, 1];
    const pos = readAccessor(doc, bin, prim.attributes.POSITION);
    const nrm = readAccessor(doc, bin, prim.attributes.NORMAL);
    for (let i = 0; i < pos.length; i += 3) {
      for (let k = 0; k < 3; k++) pos[i + k] = pos[i + k] * s[k] + t[k];
      // A normal is carried through the scale by its inverse, then renormalized.
      const nx = nrm[i] / s[0];
      const ny = nrm[i + 1] / s[1];
      const nz = nrm[i + 2] / s[2];
      const len = Math.hypot(nx, ny, nz) || 1;
      nrm[i] = nx / len;
      nrm[i + 1] = ny / len;
      nrm[i + 2] = nz / len;
    }
    vertices += pos.length / 3;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
    geometry.setIndex(new THREE.BufferAttribute(readAccessor(doc, bin, prim.indices, true), 1));
    if (prim.attributes.COLOR_0 !== undefined) geometry.setAttribute('color', shadeAttribute(readAccessor(doc, bin, prim.attributes.COLOR_0)));
    addBoxUVs(geometry, node.extras?.tissue === 'skin' ? 0.09 : 0.045);
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometry.userData.shared = true;
    return { name: node.name, geometry, extras: node.extras ?? {} };
  });
  checkVertexBudget(vertices);
  return out;
}

/** How strongly the baked shade darkens a surface: 0 none, 1 down to black in the deepest hollows. */
export const SHADE_STRENGTH = 0.8;

/**
 * The bones carry baked ambient occlusion (tools/zanatomy_skeleton.py) as a
 * gray vertex color: how much open sky each point sees. Turn it into the
 * color the material multiplies by, so hollows darken but never go black.
 */
export function shadeAttribute(rgba) {
  const n = rgba.length / 4;
  const out = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) out.fill(1 - SHADE_STRENGTH * (1 - rgba[i * 4]), i * 3, i * 3 + 3);
  return new THREE.BufferAttribute(out, 3);
}

/**
 * Texture coordinates for the tissue maps: each vertex is projected onto the
 * plane its normal faces most (a box projection), one texture tile per
 * `tile` meters, so the surface detail has the same size everywhere.
 */
export function addBoxUVs(geometry, tile) {
  const p = geometry.attributes.position.array;
  const n = geometry.attributes.normal.array;
  const uv = new Float32Array((p.length / 3) * 2);
  for (let i = 0, j = 0; i < p.length; i += 3, j += 2) {
    const ax = Math.abs(n[i]);
    const ay = Math.abs(n[i + 1]);
    const az = Math.abs(n[i + 2]);
    if (ax >= ay && ax >= az) {
      uv[j] = p[i + 2] / tile;
      uv[j + 1] = p[i + 1] / tile;
    } else if (ay >= az) {
      uv[j] = p[i] / tile;
      uv[j + 1] = p[i + 2] / tile;
    } else {
      uv[j] = p[i] / tile;
      uv[j + 1] = p[i + 1] / tile;
    }
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}
