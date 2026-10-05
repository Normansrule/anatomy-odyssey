// Convention: fibers and grain run along v, the length of lathe, cylinder and
// capsule shapes (most organs here). Tubes run along u, so tube-shaped
// vessels show their stripes as faint rings, like the muscle rings in a real
// artery wall.
//
// Tissue surface recipes: procedural, tileable texture sets for the organ and
// tissue tiers. Each recipe describes one kind of tissue:
//
//   natural   base color as it looks in life (or in a fresh specimen)
//   accent    a second color mixed in where the pattern says (fat streaks,
//             small vessels, redness, yellowing)
//   field     (u, v) → { h: height 0–1, t: brightness ~0.7–1.2,
//                         c: accent amount 0–1, r: roughness offset −1–1 }
//   roughness [base, spread]; normal strength; clearcoat (a wet film)
//
// Everything is generated in code from seeded noise: no image downloads,
// nothing to license, and the same pixels on every machine. The patterns
// are generalized (they imitate what the tissue looks like at that scale),
// not photographs of a specimen.

import { fbm, worley, smoothstep, clamp01 } from './noise.js';

const TAU = Math.PI * 2;

export const TISSUES = {
  skin: {
    label: 'Skin',
    natural: 0xcbb2a2,
    accent: 0xc27a70,
    roughness: [0.52, 0.12],
    normal: 0.9,
    clearcoat: 0.15,
    clearcoatRoughness: 0.55,
    repeat: [3, 3],
    field(u, v) {
      const pores = worley(u, v, 46, 3).f1;
      const pit = smoothstep(0.04, 0.2, pores);
      const lines = 0.5 + 0.5 * Math.cos(TAU * (v * 18 + 2.2 * fbm(u, v, { period: 3, seed: 5 })));
      const mottle = fbm(u, v, { period: 4, seed: 9 });
      return {
        h: 0.55 * pit + 0.2 * lines + 0.25 * fbm(u, v, { period: 16, octaves: 3, seed: 2 }),
        t: 0.9 + 0.16 * mottle - 0.08 * (1 - pit),
        c: clamp01(fbm(u, v, { period: 3, seed: 13 }) * 2.2 - 1.1),
        r: 0.6 * (1 - pit) - 0.3,
      };
    },
  },
  bone: {
    label: 'Compact bone surface',
    natural: 0xe4d6ba,
    accent: 0xc8a96e,
    roughness: [0.62, 0.14],
    normal: 1.1,
    clearcoat: 0.05,
    clearcoatRoughness: 0.6,
    repeat: [2, 4],
    field(u, v) {
      const grain = fbm(u, v, { period: 20, octaves: 4, seed: 21 });
      const pores = worley(u, v, 28, 22).f1;
      const pit = smoothstep(0.03, 0.12, pores);
      const streak = 0.5 + 0.5 * Math.cos(TAU * (u * 9 + 1.5 * fbm(u, v, { period: 2, seed: 23 })));
      return {
        h: 0.45 * grain + 0.4 * pit + 0.15 * streak,
        t: 0.9 + 0.14 * fbm(u, v, { period: 3, seed: 24 }) - 0.22 * (1 - pit),
        c: clamp01(fbm(u, v, { period: 2, seed: 25 }) * 1.8 - 0.75),
        r: grain - 0.5,
      };
    },
  },
  muscle: {
    label: 'Skeletal muscle',
    natural: 0x8f2b2f,
    accent: 0xe6d3b4,
    roughness: [0.42, 0.14],
    normal: 1.3,
    clearcoat: 0.55,
    clearcoatRoughness: 0.28,
    repeat: [2, 2],
    field(u, v) {
      // Fibers run along v (the length of a lathe, cylinder or capsule); bundles (fascicles) group them.
      const warp = 1.4 * fbm(u, v, { period: 3, seed: 31 });
      const fiber = 0.5 + 0.5 * Math.cos(TAU * (u * 64 + warp));
      const bundle = 0.5 + 0.5 * Math.cos(TAU * (u * 8 + 0.6 * warp));
      // A thin, faint film of connective tissue (perimysium) between bundles.
      const fat = smoothstep(0.88, 0.98, bundle) * smoothstep(0.55, 0.8, fbm(u, v, { period: 2, seed: 33 }));
      return {
        h: 0.45 * fiber + 0.55 * bundle,
        t: 0.82 + 0.14 * fiber + 0.12 * fbm(u, v, { period: 6, seed: 34 }),
        c: fat * 0.35,
        r: 0.5 * fat - 0.25 * fiber,
      };
    },
  },
  myocardium: {
    label: 'Heart muscle',
    natural: 0x8a2c33,
    accent: 0xd9b45e,
    roughness: [0.4, 0.12],
    normal: 0.9,
    clearcoat: 0.8,
    clearcoatRoughness: 0.18,
    repeat: [2, 2],
    field(u, v) {
      const mottle = fbm(u, v, { period: 5, seed: 41 });
      const fibers = 0.5 + 0.5 * Math.cos(TAU * ((u + v) * 30 + 2 * fbm(u, v, { period: 3, seed: 42 })));
      // Epicardial fat gathers along the grooves where the coronary vessels run.
      const fat = 0.7 * smoothstep(0.7, 0.86, fbm(u, v, { period: 2, octaves: 3, seed: 43 }));
      return { h: 0.6 * mottle + 0.4 * fibers, t: 0.85 + 0.25 * mottle, c: fat, r: 0.4 * fat - 0.2 };
    },
  },
  organ: {
    label: 'Organ surface',
    natural: 0x7d3a35,
    accent: 0x5e231f,
    roughness: [0.38, 0.12],
    normal: 0.7,
    clearcoat: 0.7,
    clearcoatRoughness: 0.2,
    repeat: [2, 2],
    field(u, v) {
      const m = fbm(u, v, { period: 6, seed: 51 });
      const lob = worley(u, v, 12, 52);
      const edge = 1 - smoothstep(0, 0.08, lob.f2 - lob.f1);
      return { h: 0.7 * m + 0.3 * (1 - edge), t: 0.88 + 0.2 * m, c: 0.5 * edge, r: m - 0.5 };
    },
  },
  vessel: {
    label: 'Artery wall',
    natural: 0xa8323a,
    accent: 0xd89a9a,
    roughness: [0.3, 0.08],
    normal: 0.5,
    clearcoat: 0.9,
    clearcoatRoughness: 0.14,
    repeat: [1, 4],
    field(u, v) {
      const s = 0.5 + 0.5 * Math.cos(TAU * (u * 24 + 0.8 * fbm(u, v, { period: 2, seed: 61 })));
      const m = fbm(u, v, { period: 4, seed: 62 });
      return { h: 0.4 * s + 0.6 * m, t: 0.9 + 0.15 * m, c: 0.25 * s, r: m - 0.5 };
    },
  },
  vein: {
    label: 'Vein wall',
    natural: 0x4c4472,
    accent: 0x7b6f9e,
    roughness: [0.32, 0.08],
    normal: 0.5,
    clearcoat: 0.85,
    clearcoatRoughness: 0.16,
    repeat: [1, 4],
    field(u, v) {
      const m = fbm(u, v, { period: 4, seed: 71 });
      return { h: m, t: 0.88 + 0.18 * m, c: 0.3 * fbm(u, v, { period: 8, seed: 72 }), r: m - 0.5 };
    },
  },
  lung: {
    label: 'Lung surface (pleura)',
    natural: 0xd99a9a,
    accent: 0x5a4a55,
    roughness: [0.46, 0.12],
    normal: 1.0,
    clearcoat: 0.5,
    clearcoatRoughness: 0.3,
    repeat: [2, 2],
    field(u, v) {
      const lob = worley(u, v, 9, 81);
      const septa = 1 - smoothstep(0, 0.07, lob.f2 - lob.f1);
      const alv = smoothstep(0.05, 0.35, worley(u, v, 64, 82).f1);
      const specks = smoothstep(0.86, 0.95, fbm(u, v, { period: 24, octaves: 2, seed: 83 }));
      return { h: 0.6 * alv + 0.4 * (1 - septa), t: 0.9 + 0.12 * alv - 0.12 * septa, c: Math.max(0.55 * septa, specks), r: 0.3 * septa };
    },
  },
  brain: {
    label: 'Brain surface (gray matter)',
    natural: 0xc6a097,
    accent: 0xa3383c,
    roughness: [0.4, 0.1],
    normal: 0.7,
    clearcoat: 0.65,
    clearcoatRoughness: 0.2,
    repeat: [3, 3],
    field(u, v) {
      // Fine surface vessels: thin lines along cellular borders.
      const w = worley(u, v, 7, 91);
      const vessel = 1 - smoothstep(0, 0.035, w.f2 - w.f1);
      const m = fbm(u, v, { period: 8, seed: 92 });
      return { h: 0.8 * m + 0.2 * vessel, t: 0.9 + 0.16 * m, c: 0.85 * vessel, r: -0.2 * vessel };
    },
  },
  whiteMatter: {
    label: 'White matter',
    natural: 0xece3d6,
    accent: 0xd9c9b6,
    roughness: [0.5, 0.1],
    normal: 0.4,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
    repeat: [2, 2],
    field(u, v) {
      const m = fbm(u, v, { period: 6, seed: 101 });
      const tracts = 0.5 + 0.5 * Math.cos(TAU * (u * 30 + 2 * m));
      return { h: 0.5 * m + 0.5 * tracts, t: 0.94 + 0.08 * m, c: 0.3 * tracts, r: 0 };
    },
  },
  cartilage: {
    label: 'Articular cartilage',
    natural: 0xd5dfe3,
    accent: 0xb7c7cf,
    roughness: [0.24, 0.06],
    normal: 0.25,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    repeat: [2, 2],
    field(u, v) {
      const m = fbm(u, v, { period: 4, seed: 111 });
      return { h: m, t: 0.95 + 0.08 * m, c: 0.4 * m, r: m - 0.5 };
    },
  },
  marrowRed: {
    label: 'Red marrow',
    natural: 0x8c2a2d,
    accent: 0xe0bf6c,
    roughness: [0.55, 0.12],
    normal: 0.9,
    clearcoat: 0.3,
    clearcoatRoughness: 0.4,
    repeat: [3, 3],
    field(u, v) {
      const cells = worley(u, v, 22, 121);
      const fat = 1 - smoothstep(0.15, 0.4, cells.f1);
      const m = fbm(u, v, { period: 6, seed: 122 });
      return { h: 0.6 * (1 - fat) + 0.4 * m, t: 0.85 + 0.2 * m, c: 0.45 * fat, r: m - 0.5 };
    },
  },
  marrowYellow: {
    label: 'Yellow marrow (fat)',
    natural: 0xdbb65f,
    accent: 0xb5533f,
    roughness: [0.45, 0.1],
    normal: 0.9,
    clearcoat: 0.4,
    clearcoatRoughness: 0.3,
    repeat: [3, 3],
    field(u, v) {
      const cells = worley(u, v, 18, 131);
      const lobule = smoothstep(0.1, 0.6, cells.f1);
      const vessels = 1 - smoothstep(0, 0.05, cells.f2 - cells.f1);
      return { h: 1 - lobule, t: 0.92 + 0.1 * (1 - lobule), c: 0.4 * vessels, r: -0.3 * (1 - lobule) };
    },
  },
  tendon: {
    label: 'Tendon',
    natural: 0xe8e1d4,
    accent: 0xcfc4b0,
    roughness: [0.36, 0.08],
    normal: 0.9,
    clearcoat: 0.45,
    clearcoatRoughness: 0.2,
    repeat: [1, 3],
    field(u, v) {
      const crimp = 0.15 * Math.sin(TAU * v * 20);
      const fib = 0.5 + 0.5 * Math.cos(TAU * (u * 70 + crimp + 0.5 * fbm(u, v, { period: 3, seed: 141 })));
      return { h: fib, t: 0.9 + 0.12 * fib, c: 0.3 * (1 - fib), r: -0.3 * fib };
    },
  },
  nerve: {
    label: 'Nerve',
    natural: 0xe8d9ad,
    accent: 0xcdb97f,
    roughness: [0.4, 0.08],
    normal: 0.7,
    clearcoat: 0.5,
    clearcoatRoughness: 0.25,
    repeat: [1, 3],
    field(u, v) {
      const fasc = 0.5 + 0.5 * Math.cos(TAU * (u * 12 + 0.7 * fbm(u, v, { period: 2, seed: 151 })));
      return { h: fasc, t: 0.9 + 0.12 * fasc, c: 0.5 * (1 - fasc), r: 0 };
    },
  },
  fascia: {
    label: 'Fascia and connective tissue',
    natural: 0xe3d6cf,
    accent: 0xc7b3aa,
    roughness: [0.35, 0.1],
    normal: 0.6,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    repeat: [2, 2],
    field(u, v) {
      const a = 0.5 + 0.5 * Math.cos(TAU * ((u * 0.8 + v) * 26 + 1.2 * fbm(u, v, { period: 3, seed: 161 })));
      const b = 0.5 + 0.5 * Math.cos(TAU * ((u - v * 0.7) * 22 + fbm(u, v, { period: 3, seed: 162 })));
      return { h: 0.5 * a + 0.5 * b, t: 0.93 + 0.08 * a * b, c: 0.4 * a * b, r: 0 };
    },
  },
};

export const TISSUE_KINDS = Object.keys(TISSUES);

const unpack = (hex) => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];

/**
 * Generate one tissue's texture set at `size` × `size` pixels.
 * look 'natural' bakes the tissue's own colors into the color map;
 * look 'stain' bakes a gray detail map that multiplies the scene's own color.
 * Returns RGBA byte arrays: color, normal (tangent space), and roughness
 * (in the green channel, as three.js reads it).
 */
export function generateTissueMaps(kind, size = 256, look = 'natural') {
  const recipe = TISSUES[kind];
  if (!recipe) throw new Error(`unknown tissue "${kind}"`);
  const n = size * size;
  const height = new Float32Array(n);
  const color = new Uint8Array(n * 4);
  const rough = new Uint8Array(n * 4);
  const base = unpack(recipe.natural);
  const acc = unpack(recipe.accent);
  const [r0, rs] = recipe.roughness;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const f = recipe.field((x + 0.5) / size, (y + 0.5) / size);
      height[i] = f.h;
      const c = clamp01(f.c ?? 0);
      const t = f.t ?? 1;
      if (look === 'natural') {
        for (let k = 0; k < 3; k++) color[i * 4 + k] = Math.round(255 * clamp01((base[k] + (acc[k] - base[k]) * c) * t));
      } else {
        const g = Math.round(255 * clamp01(t * (1 - 0.22 * c)));
        color[i * 4] = color[i * 4 + 1] = color[i * 4 + 2] = g;
      }
      color[i * 4 + 3] = 255;
      const r = clamp01(r0 + rs * (f.r ?? 0));
      rough[i * 4] = rough[i * 4 + 1] = rough[i * 4 + 2] = Math.round(255 * r);
      rough[i * 4 + 3] = 255;
    }
  }
  const normal = normalFromHeight(height, size, recipe.normal);
  return { size, color, normal, rough, recipe };
}

/** Tangent-space normal map from a tileable height field (central differences, wrapping at the edges). */
export function normalFromHeight(height, size, strength = 1) {
  const out = new Uint8Array(size * size * 4);
  const at = (x, y) => height[((y + size) % size) * size + ((x + size) % size)];
  const k = strength * size / 64; // keeps bump depth similar across resolutions
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k;
      const dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out[i] = Math.round(255 * (0.5 - (0.5 * dx) / len));
      out[i + 1] = Math.round(255 * (0.5 - (0.5 * dy) / len));
      out[i + 2] = Math.round(255 * (0.5 + 0.5 / len));
      out[i + 3] = 255;
    }
  }
  return out;
}
