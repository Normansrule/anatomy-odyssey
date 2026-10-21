// The studio lights ride with the camera, like a photographer's, so a part is
// lit the same way whichever side you orbit to. The key light leans toward the
// pointer: move across the model and the highlights slide with you.
// Pure (no three.js), so the tests can check it in Node.

/** How far the pointer can swing the key light, in camera-space units. */
export const AIM_REACH = 0.55;

/**
 * Camera-space directions (x right, y up, z toward the viewer) for the key and
 * rim lights, given where the pointer is: `aim` x and y each from -1 (left,
 * bottom) to 1 (right, top) of the view. With no pointer (0, 0) the key comes
 * from the upper right and in front, the rim from behind on the left.
 */
export function lightDirections(aim = { x: 0, y: 0 }) {
  const ax = Math.min(1, Math.max(-1, aim.x));
  const ay = Math.min(1, Math.max(-1, aim.y));
  const key = normalize([0.45 + AIM_REACH * ax, 0.7 + AIM_REACH * ay, 1]);
  // The rim stays on the far side of the key, so the edge light never meets it.
  const rim = normalize([-0.8 - 0.3 * ax, 0.25, -0.7]);
  return { key, rim };
}

/** Ease the light toward the pointer: a fraction of the way each frame, by elapsed time. */
export function followAim(now, target, dt, rate = 4) {
  const k = 1 - Math.exp(-dt * rate);
  return { x: now.x + (target.x - now.x) * k, y: now.y + (target.y - now.y) * k };
}

function normalize([x, y, z]) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}
