// Image-based lighting: a soft "photo studio" built in code and pre-filtered
// with PMREM, so wet tissue (clearcoat) and smooth surfaces pick up believable
// reflections. Nothing is downloaded. The studio is a dark room with a large
// warm softbox above, a cool fill to one side and a faint rim light behind,
// matching the scene's direct lights.
import * as THREE from 'three/webgpu';

export function buildStudio() {
  const studio = new THREE.Scene();
  const room = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 20), new THREE.MeshBasicMaterial({ color: 0x1b1630, side: THREE.BackSide }));
  studio.add(room);
  const panel = (w, h, color, intensity, pos, look) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    studio.add(m);
  };
  panel(8, 5, 0xfff1e0, 6, [2, 5.5, 3], [0, 0, 0]); // warm key softbox, above and in front
  panel(4, 6, 0xd8dcff, 2.2, [-9, 1, 1], [0, 0, 0]); // cool fill from the side
  panel(6, 2, 0xf3a8c4, 1.6, [-2, 2, -9], [0, 0, 0]); // pink rim from behind
  panel(20, 3, 0x3a3060, 1, [0, -5.9, 0], [0, 10, 0]); // dim floor bounce
  return studio;
}

/**
 * Prefilter the studio and return the environment texture, or null if the
 * renderer cannot (the app then falls back to its direct lights only).
 */
export function createEnvironment(renderer) {
  try {
    const pmrem = new THREE.PMREMGenerator(renderer);
    const studio = buildStudio();
    const target = pmrem.fromScene(studio, 0.04);
    studio.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    pmrem.dispose();
    return target.texture;
  } catch (err) {
    console.warn('Environment lighting unavailable:', err);
    return null;
  }
}
