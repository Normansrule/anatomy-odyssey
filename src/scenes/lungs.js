// Tier 3: the lungs and airways. 1 scene unit = 1 cm; the body faces +z.
// The trachea (with its C-shaped cartilage rings) splits at the carina into
// two main bronchi, which keep splitting into a tree of airways inside two
// translucent lungs. The body's right lung (viewer's left, −x) has three
// lobes and is larger; the left lung is narrower to make room for the heart.
// Real airways branch about 23 times; this tree shows the first seven.
// The breath control expands the lungs and lowers the diaphragm.
import * as THREE from 'three/webgpu';
import { materialBank, pick, cylinderBetween, seeded, disposeTree, tubeThrough, ellipsoid } from './kit.js';
import { minuteVentilation } from '../science/equations.js';

const LUNG = {
  right: { c: new THREE.Vector3(-6.4, -4.2, 0), r: [5.6, 10.8, 7.2] },
  left: { c: new THREE.Vector3(6.2, -4.6, 0), r: [5.0, 10.3, 6.9] },
};
const CARINA = new THREE.Vector3(0, 3, 0.3);
const MEDIAL = 0.58; // each lung is flatter on the side facing the heart
/** Lung outline as [radius share, height share] from the concave base to the apex. */
const PROFILE = [[0, -0.7], [0.35, -0.82], [0.8, -1.0], [0.97, -0.72], [1.02, -0.3], [0.95, 0.15], [0.8, 0.48], [0.56, 0.74], [0.28, 0.93], [0, 1.0]];
const medialSign = (key) => (key === 'right' ? 1 : -1); // toward the midline, in each lung's own frame

function profileRadius(yShare) {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r0, y0] = PROFILE[i - 1];
    const [r1, y1] = PROFILE[i];
    if (yShare >= Math.min(y0, y1) && yShare <= Math.max(y0, y1)) return r0 + ((yShare - y0) / (y1 - y0 || 1)) * (r1 - r0);
  }
  return 0;
}

/** A point on a lung's outer (rib) side: angle a from the front (0) round to the back (π). */
function lungSurfacePoint(key, lung, yShare, a) {
  const r = profileRadius(yShare) * 1.01;
  const x = -medialSign(key) * r * Math.sin(a);
  return new THREE.Vector3(x * lung.r[0], yShare * lung.r[1], r * Math.cos(a) * lung.r[2]).add(lung.c);
}
const GENERATIONS = 7;

/** Is point p inside a lung's ellipsoid (with a small margin)? */
function inside(lung, p, margin = 0.85) {
  const d = p.clone().sub(lung.c);
  const towardHeart = Math.sign(d.x) === Math.sign(-lung.c.x);
  const sx = towardHeart ? lung.r[0] * MEDIAL : lung.r[0];
  return (d.x / sx) ** 2 + (d.y / lung.r[1]) ** 2 + (d.z / lung.r[2]) ** 2 < margin * margin;
}

export function buildLungs({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const breathing = new THREE.Group(); // everything below the trachea expands together
  root.add(breathing);
  const rand = seeded(13);
  const airway = M(0xf6d2dc, { roughness: 0.5, tissue: 'fascia' });
  const cartilage = M(0xdfe9f2, { roughness: 0.45, tissue: 'cartilage' });

  // Trachea with C-shaped cartilage rings (open at the back).
  root.add(pick(cylinderBetween([0, 14, 0.3], [0, 3, 0.3], 1.0, 1.0, airway, 24), 'trachea', 'Trachea (windpipe)'));
  for (let i = 0; i < 16; i++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.08, 0.17, 8, 28, Math.PI * 1.6), cartilage);
    ring.rotation.set(Math.PI / 2, 0, Math.PI * 1.7);
    ring.position.set(0, 13.4 - i * 0.66, 0.3);
    root.add(pick(ring, 'trachea', 'Cartilage ring'));
  }

  // The bronchial tree.
  const leaves = [];
  const branch = (start, dir, length, radius, gen, lung) => {
    let len = length;
    let end = start.clone().addScaledVector(dir, len);
    // The main bronchi enter the lungs at the hilum; deeper branches must stay inside.
    for (let k = 0; k < 6 && gen > 1 && !inside(lung, end); k++) {
      len *= 0.7;
      end = start.clone().addScaledVector(dir, len);
    }
    const card = gen <= 1 ? 'bronchi' : gen >= 4 ? 'bronchiole' : 'bronchi';
    const label = gen <= 1 ? 'Main bronchus' : gen >= 4 ? 'Bronchiole' : 'Bronchus';
    breathing.add(pick(cylinderBetween(start.toArray(), end.toArray(), radius * 0.85, radius, gen <= 2 ? airway : M(0xf0b8c8, { roughness: 0.5 }), gen <= 2 ? 14 : 7), card, label));
    if (gen >= GENERATIONS) {
      leaves.push(end);
      return;
    }
    const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(dir).normalize();
    for (const sgn of [1, -1]) {
      const ang = (0.42 + rand() * 0.25) * sgn;
      const nd = dir.clone().applyAxisAngle(axis, ang);
      // Pull branches gently toward the middle of their lung so the tree fills it.
      nd.add(lung.c.clone().sub(end).normalize().multiplyScalar(0.18)).normalize();
      branch(end, nd, length * 0.84, radius * 0.7, gen + 1, lung);
    }
  };
  // The right main bronchus is wider, shorter and steeper than the left.
  branch(CARINA, new THREE.Vector3(-0.55, -0.83, 0).normalize(), 3.6, 0.75, 1, LUNG.right);
  branch(CARINA, new THREE.Vector3(0.72, -0.69, 0).normalize(), 4.8, 0.62, 1, LUNG.left);

  // Terminal clusters: stand-ins for the alveoli the next tier shows.
  const leafGeo = new THREE.SphereGeometry(0.28, 8, 6);
  const leafMesh = new THREE.InstancedMesh(leafGeo, M(0xff9cc0, { roughness: 0.4, emissive: 0xf08baf, emissiveIntensity: 0.15 }), leaves.length);
  const m4 = new THREE.Matrix4();
  leaves.forEach((p, i) => leafMesh.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  breathing.add(pick(leafMesh, 'alveolus', 'Alveoli (enlarged)'));

  // The lungs themselves: a narrow apex at the top, a broad concave base
  // resting on the diaphragm. Translucent so the tree shows.
  const lungMat = M(0xe9a0b4, { roughness: 0.75, transparent: true, opacity: 0.24, depthWrite: false, tissue: 'lung', repeat: [3, 4] });
  const lungGeos = [];
  const fissureMat = M(0x9c4f6b, { roughness: 0.7 });
  for (const [key, lung] of Object.entries(LUNG)) {
    const [rx, ry, rz] = lung.r;
    const prof = PROFILE.map(([r, y]) => new THREE.Vector2(r, y * ry));
    const geo = new THREE.LatheGeometry(prof, 64);
    // Flatten the side facing the heart; carve the left lung's cardiac notch.
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      const y = pos.getY(i) / ry;
      const z = pos.getZ(i);
      if (x * medialSign(key) > 0) x *= MEDIAL;
      if (key === 'left' && x < 0 && z > 0 && y < 0.1) {
        const notch = Math.max(0, 1 - Math.abs(y + 0.35) / 0.42) * Math.min(1, z / 0.35);
        x += 0.42 * notch;
      }
      pos.setX(i, x);
    }
    geo.computeVertexNormals();
    lungGeos.push(geo);
    // Fissures between lobes: oblique on both lungs, horizontal on the right only.
    const oblique = [];
    for (let i = 0; i <= 14; i++) oblique.push(lungSurfacePoint(key, lung, 0.5 - 1.2 * (i / 14), Math.PI * 0.96 * (1 - i / 14)));
    breathing.add(pick(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(oblique), 48, 0.09, 6, false), fissureMat), 'lungs', 'Oblique fissure (between lobes)'));
    if (key === 'right') {
      const horiz = [];
      for (let i = 0; i <= 8; i++) horiz.push(lungSurfacePoint(key, lung, 0.12, (Math.PI / 2) * 1.05 * (1 - i / 8)));
      breathing.add(pick(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(horiz), 32, 0.09, 6, false), fissureMat), 'lungs', 'Horizontal fissure (the right lung’s third lobe)'));
    }
    const mesh = new THREE.Mesh(geo, lungMat);
    mesh.position.copy(lung.c);
    mesh.scale.set(rx, 1, rz);
    breathing.add(pick(mesh, 'lungs', key === 'right' ? 'Right lung (three lobes)' : 'Left lung (two lobes)'));
  }

  // Blood at the roots of the lungs: pulmonary arteries bring oxygen-poor blood
  // from the heart (blue by convention), pulmonary veins return it oxygen-rich (red).
  const pa = M(0x5c6bd6, { roughness: 0.4, tissue: 'vein' });
  const pv = M(0xd9434f, { roughness: 0.4, tissue: 'vessel' });
  breathing.add(pick(tubeThrough([[1.8, -2.5, 2.6], [1.6, 1.2, 2.0], [0.6, 2.4, 1.4]], 1.05, pa, 24, 12), 'lungs', 'Pulmonary trunk (from the heart)'));
  breathing.add(pick(tubeThrough([[0.6, 2.4, 1.4], [-1.6, 1.8, 1.3], [-3.4, 0.6, 0.9], [-4.8, -0.4, 0.6]], 0.62, pa, 24, 10), 'lungs', 'Right pulmonary artery'));
  breathing.add(pick(tubeThrough([[0.6, 2.4, 1.4], [2.4, 2.6, 0.9], [3.8, 1.4, 0.5], [4.8, 0.4, 0.2]], 0.6, pa, 24, 10), 'lungs', 'Left pulmonary artery'));
  for (const [x0, y0, x1, y1] of [[-4.6, -2.2, -1.4, -4.6], [-4.4, -4.4, -1.2, -5.6], [4.4, -1.8, 1.8, -4.4], [4.2, -3.8, 1.9, -5.4]]) {
    breathing.add(pick(tubeThrough([[x0, y0, -0.6], [(x0 + x1) / 2, (y0 + y1) / 2 + 0.3, -1.2], [x1, y1, -1.8]], 0.45, pv, 16, 8), 'lungs', 'Pulmonary vein (oxygen-rich blood back to the heart)'));
  }
  const heart = ellipsoid([1.6, -6.0, 1.4], [4.6, 5.4, 4.0], M(0xb83a4e, { roughness: 0.5, transparent: true, opacity: 0.22, depthWrite: false, tissue: 'myocardium' }), 32);
  heart.rotation.z = -0.55;
  heart.userData.pickPriority = -1;
  breathing.add(pick(heart, 'heart', 'Heart (outline; it sits between the lungs)'));

  // Diaphragm: a dome of muscle under the lungs.
  const dome = new THREE.Mesh(new THREE.SphereGeometry(13, 48, 16, 0, Math.PI * 2, 0, 0.9), M(0xc4566a, { roughness: 0.55, side: THREE.DoubleSide, tissue: 'muscle', repeat: [4, 1] }));
  dome.scale.set(1, 0.42, 0.62);
  const DOME_Y = -19.4;
  dome.position.y = DOME_Y;
  root.add(pick(dome, 'diaphragm', 'Diaphragm'));

  const TIDAL_ML = 500;
  const RATE = 12;
  const controls = {
    label: 'Breath',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: reducedMotion ? 0.6 : 0,
    format: (v) => (v < 0.15 ? 'Breathed out' : v > 0.85 ? 'Breathed in' : 'Mid-breath'),
    presets: [
      { label: 'Breathe out', value: 0 },
      { label: 'Breathe in', value: 1 },
      { label: 'Play or pause', action: 'play' },
    ],
    playing: !reducedMotion,
    readout: '',
    set(v) {
      controls.value = v;
      // The diaphragm contracts and flattens, pulling the lungs down and out.
      dome.position.y = DOME_Y - 1.6 * v;
      dome.scale.y = 0.42 - 0.08 * v;
      breathing.scale.set(1 + 0.05 * v, 1 + 0.08 * v, 1 + 0.06 * v);
      breathing.position.y = -0.8 * v;
      const ml = Math.round(TIDAL_ML * v);
      controls.readout = `About ${ml} mL of air drawn in so far. A quiet breath moves about ${TIDAL_ML} mL; at ${RATE} breaths a minute that is ${minuteVentilation(TIDAL_ML, RATE)} L of air every minute.`;
      return controls.readout;
    },
  };
  controls.set(controls.value);

  // Focus: a deep bronchiole in the right lung.
  const focus = leaves.reduce((best, p) => (p.distanceTo(LUNG.right.c) < best.distanceTo(LUNG.right.c) ? p : best), leaves[0]);

  let t = 0;
  return {
    root,
    metersPerUnit: 0.01,
    view: { target: [0, -3, 0], direction: [0.35, 0.18, 1] },
    focus: focus.toArray(),
    controls,
    update(dt) {
      if (!controls.playing) return;
      t += dt;
      // 12 breaths a minute: one every 5 seconds.
      controls.set(0.5 - 0.5 * Math.cos((t / 5) * Math.PI * 2));
    },
    dispose() {
      leafGeo.dispose();
      for (const g of lungGeos) g.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
