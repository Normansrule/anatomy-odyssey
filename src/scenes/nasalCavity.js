// Tier 3: the nasal cavity in a midline (sagittal) cut, seen from the
// septum's side, face to the left. 1 scene unit = 1 mm.
// Air enters at the nostril and mostly flows along the lower passages past
// the three conchae to the throat; the olfactory epithelium is a small
// patch (about 5 cm² in all; OpenStax Biology 36.3) high in the roof, under
// the cribriform plate of the ethmoid bone, through which the olfactory
// axons reach the olfactory bulb under the frontal lobe (OpenStax A&P 14.1).
// The control compares quiet breathing with a sniff, which sends more air up
// to the olfactory patch. Shapes are simplified.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, ellipsoid, seeded, disposeTree } from './kit.js';

export const OLFACTORY_CM2 = 5;
const extrudeShape = (pts, depth) => {
  const s = new THREE.Shape();
  s.moveTo(...pts[0]);
  for (const p of pts.slice(1)) s.lineTo(...p);
  s.closePath();
  return new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false });
};

export function buildNasalCavity({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2727);
  const bone = M(0xe9dfc8, { roughness: 0.6, tissue: 'bone' });
  const addAt = (mesh, z) => {
    mesh.position.z = z;
    root.add(mesh);
  };
  const mucosa = M(0xe08a8a, { roughness: 0.45, tissue: 'organ', natural: 0xd88080 });

  // The lateral wall of the cavity, seen through the removed septum.
  const wall = [[-52, -18], [-40, -22], [12, -22], [24, -16], [30, 4], [14, 12], [2, 26], [-24, 30], [-40, 22], [-52, 4]];
  const wallMesh = new THREE.Mesh(extrudeShape(wall, 2), mucosa);
  wallMesh.position.z = -14;
  root.add(pick(wallMesh, 'nasal-cavity', 'Lateral wall of the nasal cavity (lined with moist mucosa)'));
  // Conchae: three scrolls of bone covered in mucosa, curling into the airway.
  for (const [x, y, rx, ry, label] of [[-16, -11, 25, 5.5, 'Inferior concha'], [-12, 3, 20, 5, 'Middle concha'], [-8, 15, 12, 3.6, 'Superior concha']]) {
    const c = ellipsoid([x, y, -8], [rx, ry, 5], mucosa, 28);
    root.add(pick(c, 'nasal-cavity', `${label} (swirls and warms the air)`));
  }
  // Olfactory epithelium: a yellowish patch in the roof.
  const patch = new THREE.Mesh(extrudeShape([[-26, 23], [-4, 24], [2, 20], [-6, 17], [-22, 19]], 0.8), M(0xe8c45a, { roughness: 0.45, emissive: 0xe8c45a, emissiveIntensity: 0.15 }));
  patch.position.z = -11.5;
  root.add(pick(patch, 'olfactory-epithelium', 'Olfactory epithelium (about 5 cm² in all)'));
  const patchMat = patch.material;
  // Roof bones and the cribriform plate, perforated by olfactory nerve bundles.
  addAt(pick(new THREE.Mesh(extrudeShape([[-26, 28.5], [-4, 28.5], [-4, 30.5], [-26, 30.5]], 14), bone), 'cribriform-plate', 'Cribriform plate of the ethmoid bone'), -14);
  for (let k = 0; k < 9; k++) {
    const x = -24 + k * 2.4;
    root.add(pick(tubeThrough([[x, 22, -10], [x + 0.3, 29.5, -6], [x - 0.5, 33, -3]], 0.25, M(0xf0d050, { roughness: 0.45 }), 8, 4), 'cribriform-plate', 'Olfactory nerve fibers passing through the cribriform plate'));
  }
  addAt(pick(new THREE.Mesh(extrudeShape([[-52, 4], [-40, 22], [-26, 30.5], [-26, 34], [-44, 30], [-58, 8]], 14), bone), 'nasal-cavity', 'Nasal and frontal bones'), -14);
  addAt(pick(new THREE.Mesh(extrudeShape([[-4, 30.5], [14, 28], [30, 14], [32, 4], [24, 6], [14, 14], [2, 28]], 14), bone), 'nasal-cavity', 'Sphenoid bone (behind the cavity)'), -14);
  addAt(pick(new THREE.Mesh(extrudeShape([[-46, -22], [12, -22], [12, -28], [-46, -28]], 14), bone), 'nasal-cavity', 'Hard palate (floor of the nose, roof of the mouth)'), -14);
  addAt(pick(new THREE.Mesh(extrudeShape([[12, -22], [26, -24], [32, -30], [14, -28]], 18), M(0xe0a0a0, { roughness: 0.5 })), 'nasal-cavity', 'Soft palate'), -12);
  // External nose.
  addAt(pick(new THREE.Mesh(extrudeShape([[-52, -18], [-60, -18], [-66, -10], [-62, -4], [-50, 16], [-44, 24], [-48, 8], [-52, 0]], 16), M(0xd8b29a, { roughness: 0.5, tissue: 'skin', natural: 0xcbb2a2 })), 'nasal-cavity', 'External nose'), -10);

  // Olfactory bulb and tract under the frontal lobe; the frontal lobe faint above.
  const bulbMat = M(0xf0d050, { roughness: 0.45, tissue: 'nerve', emissive: 0xffe28a, emissiveIntensity: 0 });
  root.add(pick(ellipsoid([-15, 33.5, -3], [12, 2.6, 3.5], bulbMat, 24), 'olfactory-bulb', 'Olfactory bulb'));
  root.add(pick(tubeThrough([[-4, 34, -3], [12, 35, -3], [30, 37, -3]], 1.4, bulbMat, 16, 8), 'olfactory-bulb', 'Olfactory tract (toward the limbic system and cortex)'));
  const brain = ellipsoid([4, 62, -6], [60, 26, 10], M(0xf0d68a, { roughness: 0.6, tissue: 'brain', transparent: true, opacity: 0.55, depthWrite: false }), 36);
  root.add(pick(brain, 'brain', 'Frontal lobe of the brain'));

  // Air: a main stream to the throat, and a sniff stream up to the roof.
  const ball = new THREE.SphereGeometry(1, 8, 6);
  const airMat = M(0x9fd4ff, { roughness: 0.3, emissive: 0x9fd4ff, emissiveIntensity: 0.6, transparent: true, opacity: 0.85 });
  const main = [[-70, -16, 0], [-52, -12, 0], [-30, -16, 2], [0, -14, 2], [20, -8, 2], [28, -20, 2], [26, -40, 2]];
  const sniff = [[-70, -14, 0], [-52, -10, 0], [-38, 8, 1], [-26, 20, 0], [-10, 22, 0], [4, 16, 1], [22, 2, 2], [28, -20, 2], [26, -40, 2]];
  const streams = [main, sniff].map((p) => new THREE.CatmullRomCurve3(p.map((q) => new THREE.Vector3(...q))));
  const dots = Array.from({ length: 50 }, (_, i) => {
    const m = pick(new THREE.Mesh(ball, airMat), 'nasal-cavity', 'Inhaled air');
    m.scale.setScalar(0.9);
    m.userData = { ...m.userData, s: i % 5 === 0 ? 1 : 0, u: rand() };
    root.add(m);
    return m;
  });
  let flow = 0;
  let sniffing = 0;
  const place = () => {
    for (const d of dots) {
      const onSniff = d.userData.s === 1 || (sniffing > 0.5 && d.userData.u < 0.35);
      streams[onSniff ? 1 : 0].getPointAt((d.userData.u + flow * (1 + sniffing)) % 1, d.position);
      d.position.z += (d.userData.u - 0.5) * 3;
    }
  };
  const controls = {
    label: 'Breath',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: 1,
    format: (v) => (v < 0.5 ? 'Quiet breathing' : 'Sniff'),
    presets: [
      { label: 'Quiet breathing', value: 0 },
      { label: 'Sniff', value: 1 },
    ],
    set(v) {
      controls.value = v;
      sniffing = v;
      patchMat.emissiveIntensity = 0.15 + 0.6 * v;
      bulbMat.emissiveIntensity = 0.6 * v;
      place();
      return v < 0.5
        ? 'Quiet breathing: most air flows along the lower passages, warmed and moistened by the conchae, to the throat. Only a little reaches the olfactory patch in the roof.'
        : 'A sniff: faster air swirls up to the olfactory epithelium in the roof. Odor molecules dissolve in its mucus, and the signal goes up through the cribriform plate to the olfactory bulb.';
    },
  };
  controls.set(1);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    frameWidth: 0.12,
    view: { target: [-12, 8, 0], direction: [0, 0.08, 1] },
    focus: [-14, 21, -10],
    controls,
    update(dt) {
      if (reducedMotion) return;
      flow = (flow + dt * 0.12) % 1;
      place();
    },
    dispose() {
      ball.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
