// The surface framework: turns a tissue name into a physically based
// material with color, normal and roughness maps, a wet clearcoat where the
// tissue is wet, and the right base color for the chosen look.
//
//   look 'natural'  tissue colors as in life (default)
//   look 'stain'    the app's histology-stain palette, with the same surface detail
//   detail          texture size in pixels: 0 (off, plain materials), 256 or 512
//
// Scenes ask for a tissue through the material bank:  M(color, { tissue: 'muscle' })
// Untagged materials (cells, molecules, diagrams) keep their stain colors.
import * as THREE from 'three/webgpu';
import { TISSUES, generateTissueMaps } from './tissues.js';

const options = { look: 'natural', detail: 256 };

/** Change the look or detail level. Scenes built afterwards use it. */
export function setSurfaceOptions(next) {
  if (next.look === 'natural' || next.look === 'stain') options.look = next.look;
  if ([0, 256, 512].includes(next.detail)) options.detail = next.detail;
  return { ...options };
}

export function surfaceOptions() {
  return { ...options };
}

/** Texture size for a picture-quality setting and a measured device tier. */
export function detailFor(quality, measuredTier) {
  if (quality === 'low' || (quality === 'auto' && measuredTier === 'low')) return 0;
  if (quality === 'high' || (quality === 'auto' && measuredTier === 'high')) return 512;
  return 256;
}

// Generated texture sets are shared by every scene: one per (tissue, look, size).
const sets = new Map();
function textureSet(kind, look, size) {
  const key = `${kind}|${look}|${size}`;
  if (!sets.has(key)) {
    const maps = generateTissueMaps(kind, size, look);
    const make = (data, srgb) => {
      const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.LinearFilter;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 4;
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    sets.set(key, { color: make(maps.color, true), normal: make(maps.normal, false), rough: make(maps.rough, false) });
  }
  return sets.get(key);
}

// Per-repeat copies share the same image data, so each set uploads once.
const repeated = new Map();
function withRepeat(tex, key, rx, ry) {
  const k = `${key}|${rx}|${ry}`;
  if (!repeated.has(k)) {
    const t = tex.clone();
    t.repeat.set(rx, ry);
    t.needsUpdate = true;
    repeated.set(k, t);
  }
  return repeated.get(k);
}

/**
 * Build the material for a tissue. `color` is the scene's stain color (used
 * in the stain look); other options (opacity, side, emissive, …) pass through.
 */
export function tissueMaterial(color, opts) {
  const { tissue, repeat, normalScale, ...rest } = opts;
  const recipe = TISSUES[tissue];
  if (!recipe) throw new Error(`unknown tissue "${tissue}"`);
  const look = options.look;
  const size = options.detail;
  const base = look === 'natural' ? recipe.natural : color;
  const params = {
    color: base,
    roughness: recipe.roughness[0],
    metalness: 0,
    clearcoat: recipe.clearcoat,
    clearcoatRoughness: recipe.clearcoatRoughness,
    ...rest,
  };
  if (size === 0) {
    // Plain material for slow devices: no maps, no clearcoat.
    const { clearcoat, clearcoatRoughness, ...plain } = params;
    return new THREE.MeshStandardMaterial(plain);
  }
  const set = textureSet(tissue, look, size);
  const [rx, ry] = repeat ?? recipe.repeat;
  const key = `${tissue}|${look}|${size}`;
  const mat = new THREE.MeshPhysicalMaterial({
    ...params,
    color: look === 'natural' ? 0xffffff : color,
    roughness: 1, // the roughness map carries the value
    map: withRepeat(set.color, `${key}|c`, rx, ry),
    normalMap: withRepeat(set.normal, `${key}|n`, rx, ry),
    roughnessMap: withRepeat(set.rough, `${key}|r`, rx, ry),
  });
  const s = normalScale ?? 1;
  mat.normalScale.set(s, s);
  mat.userData.tissue = tissue;
  return mat;
}
