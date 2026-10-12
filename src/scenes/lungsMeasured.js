// Tier 3: the lungs, measured. The five lobes, windpipe, bronchi, diaphragm,
// pulmonary vessels and heart of one real adult (BodyParts3D, the same meshes
// as the whole body; see bodyMeshes.js), at organ scale: 1 scene unit = 1 cm,
// the body facing +z, its left toward +x.
//
// The lobes are see-through so the airways show. The atlas segments the
// airways down to the bronchi that enter each lobe; the finer bronchioles,
// and the alveolar sacs at their ends, are drawn here (enlarged) from those
// bronchi out into the lobe, as a generalized pattern. The breath control
// lowers the diaphragm and expands the lungs, as in lungs.js.
import * as THREE from 'three/webgpu';
import { materialBank, pick, disposeTree, seeded, tubeThrough } from './kit.js';
import { minuteVentilation } from '../science/equations.js';
import LANDMARKS from '../data/bodyLandmarks.json';

const LOBE_COLOR = {
  'Upper lobe of right lung': 0xeaa2b8,
  'Middle lobe of right lung': 0xf2b9a6,
  'Lower lobe of right lung': 0xe39ab4,
  'Upper lobe of left lung': 0xeaa2b8,
  'Lower lobe of left lung': 0xe39ab4,
};
const TWIGS_PER_LOBE = 14;

/** Is point p (a Vector3) inside a closed mesh? Counts crossings along +x. */
function insideMesh(mesh, p, ray) {
  ray.set(p, new THREE.Vector3(1, 0.0007, 0.0003).normalize());
  return ray.intersectObject(mesh, false).length % 2 === 1;
}

/**
 * Build the measured lungs scene from the body bundle's parts.
 * Returns null when the bundle has no lungs (the caller falls back).
 */
export function buildMeasuredLungs(parts, { reducedMotion = false } = {}) {
  const find = (fn) => parts?.filter(fn) ?? [];
  const lobes = find((p) => p.extras.card === 'lungs');
  const bronchi = find((p) => p.extras.card === 'bronchi')[0];
  if (lobes.length < 5 || !bronchi) return null;
  const trachea = find((p) => p.extras.card === 'trachea')[0];
  const diaphragm = find((p) => p.extras.card === 'diaphragm')[0];
  const heart = find((p) => p.extras.card === 'heart' && p.extras.tissue === 'myocardium')[0];
  const pulmonary = find((p) => p.extras.card === 'great-vessels' && /^Pulmonary/.test(p.extras.label));

  const M = materialBank();
  const root = new THREE.Group();
  // The parts are in body meters; these groups turn them into centimeters around the lungs' center.
  const c = new THREE.Vector3(...LANDMARKS.lungs);
  const toScene = (g) => {
    g.scale.setScalar(100);
    g.position.copy(c).multiplyScalar(-100);
    return g;
  };
  const breathing = new THREE.Group(); // expands about the roots of the lungs
  root.add(breathing);
  const lungs = toScene(new THREE.Group());
  breathing.add(lungs);
  const fixed = toScene(new THREE.Group());
  root.add(fixed);

  // Airways: the measured windpipe and bronchi.
  const airway = M(0xdfe9f2, { roughness: 0.45, tissue: 'cartilage', repeat: [1, 1] });
  if (trachea) fixed.add(pick(new THREE.Mesh(trachea.geometry, airway), 'trachea', 'Trachea (windpipe), with its cartilage rings'));
  lungs.add(pick(new THREE.Mesh(bronchi.geometry, airway), 'bronchi', 'Bronchi: the main bronchi and their branches into each lobe'));

  // The lobes, see-through.
  const lobeMeshes = [];
  const ray = new THREE.Raycaster();
  const solid = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  for (const lobe of lobes) {
    const color = LOBE_COLOR[lobe.extras.label] ?? 0xe9a0b4;
    const mesh = new THREE.Mesh(lobe.geometry, M(color, { roughness: 0.75, transparent: true, opacity: 0.26, depthWrite: false, tissue: 'lung', natural: color, repeat: [1, 1] }));
    pick(mesh, 'lungs', lobe.extras.label);
    lungs.add(mesh);
    lobeMeshes.push({ mesh, test: new THREE.Mesh(lobe.geometry, solid), label: lobe.extras.label });
  }

  // Bronchioles: twigs from the measured bronchi out into each lobe, ending in alveolar sacs.
  const rand = seeded(23);
  const tips = bronchi.geometry.attributes.position;
  const twig = M(0xf0b8c8, { roughness: 0.5 });
  const leaves = [];
  for (const { test, label } of lobeMeshes) {
    test.updateMatrixWorld();
    const box = test.geometry.boundingBox ?? test.geometry.computeBoundingBox() ?? test.geometry.boundingBox;
    // The bronchus points inside (or nearest) this lobe are where its twigs start.
    const seeds = [];
    const p = new THREE.Vector3();
    for (let i = 0; i < tips.count; i += 3) {
      p.fromBufferAttribute(tips, i);
      if (box.distanceToPoint(p) < 0.004) seeds.push(p.clone());
    }
    if (!seeds.length) continue;
    let made = 0;
    for (let tries = 0; made < TWIGS_PER_LOBE && tries < TWIGS_PER_LOBE * 12; tries++) {
      const target = new THREE.Vector3(
        box.min.x + rand() * (box.max.x - box.min.x),
        box.min.y + rand() * (box.max.y - box.min.y),
        box.min.z + rand() * (box.max.z - box.min.z),
      );
      if (!insideMesh(test, target, ray)) continue;
      const start = seeds.reduce((best, s) => (s.distanceToSquared(target) < best.distanceToSquared(target) ? s : best), seeds[0]);
      if (start.distanceTo(target) < 0.015) continue;
      const mid = start.clone().lerp(target, 0.5).add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.012));
      const toCm = (v) => v.clone().sub(c).multiplyScalar(100).toArray();
      breathing.add(pick(tubeThrough([toCm(start), toCm(mid), toCm(target)], 0.11, twig, 12, 5), 'bronchiole', `Bronchiole (${label.toLowerCase()})`));
      leaves.push(new THREE.Vector3(...toCm(target)));
      made++;
    }
  }
  const leafGeo = new THREE.SphereGeometry(0.22, 8, 6);
  const leafMesh = new THREE.InstancedMesh(leafGeo, M(0xff9cc0, { roughness: 0.4, emissive: 0xf08baf, emissiveIntensity: 0.15 }), Math.max(1, leaves.length * 4));
  const m4 = new THREE.Matrix4();
  let n = 0;
  for (const leaf of leaves) {
    for (let k = 0; k < 4; k++) {
      const o = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.55);
      leafMesh.setMatrixAt(n++, m4.makeTranslation(leaf.x + o.x, leaf.y + o.y, leaf.z + o.z));
    }
  }
  leafMesh.count = n;
  breathing.add(pick(leafMesh, 'alveolus', 'Alveolar sacs (enlarged)'));

  // Blood vessels at the roots of the lungs and the heart between them.
  for (const v of pulmonary) {
    const artery = /artery/.test(v.extras.label);
    lungs.add(pick(new THREE.Mesh(v.geometry, M(artery ? 0x5c6bd6 : 0xd9434f, { roughness: 0.4, tissue: artery ? 'vein' : 'vessel', repeat: [1, 1] })), 'great-vessels', artery ? 'Pulmonary artery: oxygen-poor blood from the heart (blue by convention)' : 'Pulmonary veins: oxygen-rich blood back to the heart'));
  }
  if (heart) {
    const h = new THREE.Mesh(heart.geometry, M(0xb83a4e, { roughness: 0.5, transparent: true, opacity: 0.22, depthWrite: false }));
    h.userData.pickPriority = -1;
    fixed.add(pick(h, 'heart', 'Heart (it sits between the lungs)'));
  }
  let dome = null;
  if (diaphragm) {
    dome = new THREE.Mesh(diaphragm.geometry, M(0xc4566a, { roughness: 0.55, tissue: 'muscle', repeat: [1, 1] }));
    fixed.add(pick(dome, 'diaphragm', 'Diaphragm'));
  }

  // The lungs expand about their roots (the hilum, just below the carina).
  const hilum = bronchi.geometry.boundingBox ?? (bronchi.geometry.computeBoundingBox(), bronchi.geometry.boundingBox);
  const root0 = hilum.getCenter(new THREE.Vector3()).sub(c).multiplyScalar(100);
  const domeY = dome ? dome.position.y : 0;
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
      if (dome) dome.position.y = domeY - 1.5 * v;
      const s = new THREE.Vector3(1 + 0.05 * v, 1 + 0.08 * v, 1 + 0.06 * v);
      breathing.scale.copy(s);
      // Keep the roots of the lungs where they are while the rest expands.
      breathing.position.copy(root0).multiply(new THREE.Vector3(1 - s.x, 1 - s.y, 1 - s.z));
      const ml = Math.round(TIDAL_ML * v);
      controls.readout = `About ${ml} mL of air drawn in so far. A quiet breath moves about ${TIDAL_ML} mL; at ${RATE} breaths a minute that is ${minuteVentilation(TIDAL_ML, RATE)} L of air every minute.`;
      return controls.readout;
    },
  };
  controls.set(controls.value);

  // Focus: a bronchiole's end deep in the right lung (the body's right, −x).
  const right = leaves.filter((l) => l.x < 0);
  const mid = right.reduce((a, l) => a.add(l), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, right.length));
  const focus = (right.length ? right : leaves).reduce((best, l) => (l.distanceTo(mid) < best.distanceTo(mid) ? l : best), (right.length ? right : leaves)[0]);

  let t = 0;
  return {
    root,
    metersPerUnit: 0.01,
    detailed: true,
    view: { target: [0, -2, 0], direction: [0.35, 0.18, 1] },
    focus: focus ? focus.toArray() : [0, 0, 0],
    controls,
    update(dt) {
      if (!controls.playing) return;
      t += dt;
      // 12 breaths a minute: one every 5 seconds.
      controls.set(0.5 - 0.5 * Math.cos((t / 5) * Math.PI * 2));
    },
    dispose() {
      leafGeo.dispose();
      solid.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
