// Tier 3: a lymph node, sliced through the middle. 1 scene unit = 1 mm.
// About 15 mm long. The front half is removed, so the slice shows the
// layers the way a histology section does: capsule, subcapsular sinus,
// cortex with follicles (B cells), paracortex (T cells) and medulla.
// Lymph enters through several afferent vessels and leaves at the hilum.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, tubeThrough, disposeTree } from './kit.js';

const RX = 7.5;
const RY = 4.0;
const RZ = 3.2;

export function buildLymphNode() {
  const M = materialBank();
  const root = new THREE.Group();

  // Capsule: back half of an ellipsoid.
  const shellGeo = new THREE.SphereGeometry(1, 72, 48, Math.PI, Math.PI);
  const shell = new THREE.Mesh(shellGeo, M(0xb9aee0, { roughness: 0.5, side: THREE.DoubleSide }));
  shell.scale.set(RX, RY, RZ);
  root.add(pick(shell, 'lymph-node', 'Capsule'));

  // The slice face, drawn in layers from the outside in.
  const disc = (scaleX, scaleY, color, z, card, label, cx = 0, cy = 0) => {
    const m = new THREE.Mesh(new THREE.CircleGeometry(1, 96), M(color, { roughness: 0.75 }));
    m.scale.set(scaleX, scaleY, 1);
    m.position.set(cx, cy, z);
    root.add(pick(m, card, label));
    return m;
  };
  disc(RX, RY, 0xe6ddf6, 0.0, 'lymph-node', 'Subcapsular sinus');
  disc(RX * 0.95, RY * 0.93, 0x8f7ff0, 0.01, 'lymph-follicle', 'Cortex');
  disc(RX * 0.72, RY * 0.62, 0x7465d4, 0.02, 'paracortex', 'Paracortex (T cell zone)', 0, -0.25);
  disc(RX * 0.42, RY * 0.36, 0xd8b4d6, 0.03, 'lymph-medulla', 'Medulla', 0, -1.3);

  // Medullary cords fanning toward the hilum.
  const cordMat = M(0xb97bb3, { roughness: 0.6 });
  for (let k = -3; k <= 3; k++) {
    const x0 = k * 0.75;
    root.add(pick(tubeThrough([[x0, -0.2, 0.05], [x0 * 0.7, -1.4, 0.06], [x0 * 0.25, -2.6, 0.06], [0, -3.3, 0.05]], 0.13, cordMat, 24, 6), 'lymph-medulla', 'Medullary cord'));
  }

  // Follicles with pale germinal centers around the cortex.
  const hemi = new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2);
  hemi.rotateX(Math.PI / 2);
  const follicleMat = M(0x5b4bc4, { roughness: 0.55 });
  const gcMat = M(0xd9d0f5, { roughness: 0.5 });
  let focus = null;
  const angles = [20, 42, 64, 90, 116, 138, 160, 198, 225, 315, 342];
  for (const deg of angles) {
    const a = THREE.MathUtils.degToRad(deg);
    const r = deg === 90 ? 1.05 : 0.8 + (deg % 3) * 0.08;
    const x = RX * 0.82 * Math.cos(a);
    const y = RY * 0.8 * Math.sin(a);
    const f = new THREE.Mesh(hemi, follicleMat);
    f.position.set(x, y, 0.04);
    f.scale.set(r, r, r * 0.55);
    root.add(pick(f, 'lymph-follicle', 'Follicle (B cells)'));
    const gc = new THREE.Mesh(hemi, gcMat);
    gc.position.set(x - Math.cos(a) * r * 0.15, y - Math.sin(a) * r * 0.15, 0.06);
    gc.scale.set(r * 0.55, r * 0.55, r * 0.42);
    root.add(pick(gc, 'lymph-follicle', 'Germinal center'));
    if (deg === 90) focus = [x, y, 0.4];
  }

  // Afferent lymphatic vessels entering the convex side, each with a valve.
  const lymphMat = M(COLORS.lymph, { roughness: 0.4, transparent: true, opacity: 0.85 });
  for (const x of [-5.2, -2.2, 1.5, 4.6]) {
    const yIn = RY * Math.sqrt(1 - (x / RX) ** 2) * 0.99;
    root.add(pick(tubeThrough([[x * 1.2, yIn + 4.5, -1.6], [x * 1.08, yIn + 2.2, -1.2], [x, yIn, -0.9]], 0.22, lymphMat, 24, 8), 'lymphatic-vessel', 'Afferent lymphatic vessel'));
    const valve = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 8, 16), lymphMat);
    valve.position.set(x * 1.1, yIn + 2.6, -1.3);
    valve.rotation.x = Math.PI / 2;
    root.add(pick(valve, 'lymphatic-vessel', 'Valve (keeps lymph flowing one way)'));
  }
  // Hilum: efferent lymphatic, artery and vein.
  root.add(pick(tubeThrough([[0, -RY * 0.97, -0.6], [0.3, -6, -0.8], [0.8, -8.5, -1]], 0.34, lymphMat, 24, 8), 'lymphatic-vessel', 'Efferent lymphatic vessel'));
  root.add(pick(tubeThrough([[-0.9, -RY * 0.95, -0.9], [-1.3, -6, -1.1], [-1.6, -8.5, -1.3]], 0.26, M(COLORS.artery, { roughness: 0.4 }), 24, 8), 'lymph-node', 'Artery'));
  root.add(pick(tubeThrough([[0.9, -RY * 0.95, -1.1], [1.4, -6, -1.3], [1.9, -8.5, -1.5]], 0.3, M(COLORS.vein, { roughness: 0.4 }), 24, 8), 'lymph-node', 'Vein'));

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    view: { target: [0, -0.6, -0.8], direction: [0.42, 0.38, 0.82] },
    focus,
    dispose() {
      hemi.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
