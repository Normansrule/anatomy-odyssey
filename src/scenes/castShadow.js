// The shadow the figure casts on its plinth. A museum lights a figure on its stand from above
// and in front, so its shadow falls back across the stand: darkest and sharpest at the feet,
// paler and softer as it reaches away. The silhouette is projected once, when the scene is
// built, onto the plinth's top along the light, and painted into a texture, so drawing it
// costs one quad a frame however detailed the body is.

import * as THREE from 'three/webgpu';

/**
 * Toward the light: above, a little to the right and in front, like the studio key. The studio
 * lights ride with the camera, so seen from behind the light comes from behind (SPOT_BEHIND)
 * and the shadow falls toward the front.
 */
export const SPOT = normalize([0.42, 1.6, 0.36]);
export const SPOT_BEHIND = [-SPOT[0], SPOT[1], -SPOT[2]];

/** Where a point (x, y, z) lands on the floor (y = 0) along the light: returns [x, z]. */
export function projectToFloor([x, y, z], dir = SPOT) {
  const k = y / dir[1];
  return [x - dir[0] * k, z - dir[2] * k];
}

/** How dark the shadow is at distance `d` (m) from the feet: full at the feet, about half at 0.4 m. */
export function shadowFalloff(d) {
  return 1 / (1 + (d / 0.4) ** 2);
}

/**
 * Paint the silhouette of `meshes` (already placed in the world), lit from `dir`, on a canvas
 * covering a square of side 2 × `radius` centered under the figure, clipped to the plinth's
 * disc. Returns a texture, or null where there is no canvas (tests in Node).
 */
export function castShadowTexture(meshes, radius, { dir = SPOT, size = 1024 } = {}) {
  if (typeof document === 'undefined') return null;
  const sharp = document.createElement('canvas');
  sharp.width = sharp.height = size;
  const g = sharp.getContext('2d');
  const toPx = (u) => ((u + radius) / (2 * radius)) * size;
  g.fillStyle = '#000';
  const v = new THREE.Vector3();
  const pts = [[0, 0], [0, 0], [0, 0]];
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    const index = mesh.geometry.index;
    const count = index ? index.count : pos.count;
    g.beginPath();
    for (let i = 0; i < count; i += 3) {
      for (let j = 0; j < 3; j++) {
        const n = index ? index.getX(i + j) : i + j;
        v.fromBufferAttribute(pos, n).applyMatrix4(mesh.matrixWorld);
        const [x, z] = projectToFloor([v.x, v.y, v.z], dir);
        pts[j][0] = toPx(x);
        pts[j][1] = toPx(z);
      }
      // Wind every triangle the same way so the non-zero fill unites them without holes.
      const area = (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]);
      const [a, b, c] = area >= 0 ? [pts[0], pts[1], pts[2]] : [pts[0], pts[2], pts[1]];
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.lineTo(c[0], c[1]);
      g.closePath();
      if (i % 3000 === 0) {
        g.fill('nonzero');
        g.beginPath();
      }
    }
    g.fill('nonzero');
  }

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const out = canvas.getContext('2d');
  // Clip to the plinth's top, soften the edge, then fade it with distance from the feet.
  out.save();
  out.beginPath();
  out.arc(size / 2, size / 2, (size / 2) * 0.985, 0, Math.PI * 2);
  out.clip();
  out.filter = `blur(${Math.round(size / 220)}px)`;
  out.drawImage(sharp, 0, 0);
  out.filter = 'none';
  out.restore();
  const fade = out.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (let s = 0; s <= 1.0001; s += 0.125) fade.addColorStop(Math.min(1, s), `rgba(0,0,0,${shadowFalloff(s * radius).toFixed(3)})`);
  out.globalCompositeOperation = 'destination-in';
  out.fillStyle = fade;
  out.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * How much of the front-lit shadow to show (the rest is the back-lit one), from where the camera
 * stands relative to the figure: `z` its distance in front (negative behind), `x` to the side.
 * Full in front, none behind, crossing over smoothly as the view comes round the side.
 */
export function frontShare(x, z) {
  const c = z / (Math.hypot(x, z) || 1);
  return Math.min(1, Math.max(0, 0.5 + 1.5 * c));
}

function normalize([x, y, z]) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
