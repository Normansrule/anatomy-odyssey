// Tier 4: the end of an airway. 1 scene unit = 10 µm.
// A terminal bronchiole leads into alveolar ducts lined with alveoli, the
// tiny air sacs (about 200 µm across) where gas exchange happens. A net of
// capillaries wraps every alveolus; a pulmonary arteriole brings
// oxygen-poor blood (blue) and a venule carries oxygen-rich blood away (red).
// Alveoli are drawn translucent so the ducts and one macrophage show.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, tubeThrough, capsuleBetween, seeded, disposeTree } from './kit.js';

const ALV_R = 10; // 100 µm radius

export function buildAlveoli() {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(19);
  const airway = M(0xf6d2dc, { roughness: 0.5 });

  const hub = new THREE.Vector3(-4, 4, 0);
  root.add(pick(tubeThrough([[-62, 42, -12], [-40, 28, -6], [-22, 14, -2], hub.toArray()], 8.5, airway, 40, 20), 'terminal-bronchiole', 'Terminal bronchiole'));

  const ductEnds = [new THREE.Vector3(26, 22, 4), new THREE.Vector3(28, -14, 10), new THREE.Vector3(-2, -30, -2)];
  const ductMat = M(0xf3c3d2, { roughness: 0.5 });
  for (const end of ductEnds) root.add(pick(capsuleBetween(hub.toArray(), end.toArray(), 6.5, ductMat, 16), 'alveolar-duct', 'Alveolar duct'));

  // Place alveoli along each duct and in a cluster (alveolar sac) at its end.
  const centers = [];
  const tryPlace = (p) => {
    if (centers.every((c) => c.distanceTo(p) > ALV_R * 1.55)) centers.push(p);
  };
  for (const end of ductEnds) {
    const axis = end.clone().sub(hub);
    const len = axis.length();
    axis.normalize();
    const u = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(axis).normalize();
    const w = new THREE.Vector3().crossVectors(axis, u);
    for (let k = 0; k < 40; k++) {
      const s = 0.35 + rand() * 0.75;
      const a = rand() * Math.PI * 2;
      const p = hub.clone().addScaledVector(axis, len * s).addScaledVector(u, Math.cos(a) * 14).addScaledVector(w, Math.sin(a) * 14);
      tryPlace(p);
    }
  }
  // A few alveoli bud straight from the last stretch of bronchiole (a respiratory bronchiole).
  for (let k = 0; k < 10; k++) tryPlace(new THREE.Vector3(-20 + rand() * 12, 12 + rand() * 6, (rand() - 0.5) * 30));

  const alvMat = M(0xf7d9e3, { roughness: 0.55, transparent: true, opacity: 0.62, depthWrite: false });
  const alvGeo = new THREE.SphereGeometry(ALV_R, 28, 20);
  for (const c of centers) {
    const m = new THREE.Mesh(alvGeo, alvMat);
    m.position.copy(c);
    root.add(pick(m, 'alveolus', 'Alveolus'));
  }

  // Capillary net: short arcs hugging each alveolus.
  const capRed = M(0xd9434f, { roughness: 0.45 });
  const capPurple = M(0xa0508c, { roughness: 0.45 });
  for (const c of centers) {
    for (let k = 0; k < 6; k++) {
      const axis = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      const start = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).cross(axis).normalize();
      const pts = [];
      const span = 1.4 + rand();
      for (let i = 0; i <= 10; i++) pts.push(start.clone().applyAxisAngle(axis, (i / 10) * span).multiplyScalar(ALV_R + 0.45).add(c).toArray());
      root.add(pick(tubeThrough(pts, 0.42, k % 3 === 0 ? capPurple : capRed, 24, 6), 'pulmonary-capillary', 'Capillary'));
    }
  }

  // Arteriole (oxygen-poor, blue) and venule (oxygen-rich, red) running with the airway.
  root.add(pick(tubeThrough([[-64, 22, -26], [-40, 12, -24], [-18, 0, -22], [4, -12, -20]], 3, M(0x5c6bd6, { roughness: 0.4 }), 40, 12), 'pulmonary-capillary', 'Pulmonary arteriole (oxygen-poor blood)'));
  root.add(pick(tubeThrough([[-64, 54, -28], [-42, 44, -28], [-16, 36, -26], [10, 36, -24]], 3.4, M(0xd9434f, { roughness: 0.4 }), 40, 12), 'pulmonary-capillary', 'Pulmonary venule (oxygen-rich blood)'));

  // An alveolar macrophage patrolling inside the first sac.
  const featured = centers.reduce((best, c) => (c.distanceTo(ductEnds[0]) < best.distanceTo(ductEnds[0]) ? c : best), centers[0]);
  const mac = ellipsoid(featured.clone().add(new THREE.Vector3(0, -ALV_R + 1.6, 2)).toArray(), [1.3, 0.9, 1.1], M(0x9b7bf0, { roughness: 0.5 }), 16);
  mac.userData.pickPriority = 1;
  root.add(pick(mac, 'alveolar-macrophage', 'Alveolar macrophage'));

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-5,
    view: { target: [-6, 2, 0], direction: [0.3, 0.3, 0.9] },
    focus: featured.toArray(),
    dispose() {
      alvGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
