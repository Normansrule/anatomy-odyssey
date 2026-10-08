// Tier 3: the pancreas, seen from the front. 1 scene unit = 1 mm.
// Its head sits in the C-shaped curve of the duodenum and its body runs about
// 15 cm to the left, its tail reaching the spleen (OpenStax 23.6). Drawn
// see-through so the main pancreatic duct shows inside, joining the common
// bile duct at the duodenum, with the smaller accessory duct above it. The
// islets, scattered through the gland, are drawn far larger than life (real
// ones are a fraction of a millimeter) so they can be seen.
// The control compares fasting with after a meal: pancreatic juice flows down
// the duct into the duodenum, and the islets release insulin.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, taperedTube, ellipsoid, seeded, disposeTree, COLORS } from './kit.js';
import { ramp } from './stages.js';

export const PANCREAS_MM = { length: 152 };
const AXIS = [[-52, -6, 0], [-34, 8, 2], [-8, 16, 0], [30, 26, -4], [70, 36, -8], [100, 44, -12]];
const AMPULLA = new THREE.Vector3(-76, -10, 2);

export function buildPancreas({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1919);

  // Duodenum: a C around the head.
  const duo = M(0xe6a08a, { roughness: 0.5, tissue: 'organ', natural: 0xd89480 });
  root.add(pick(taperedTube([[-30, 46, 6], [-62, 44, 8], [-86, 18, 6], [-88, -18, 6], [-66, -46, 6], [-26, -52, 4], [6, -44, 0]], () => 12, duo, 96, 20), 'duodenum', 'Duodenum (first part of the small intestine)'));
  // Spleen at the tail.
  root.add(pick(ellipsoid([128, 54, -22], [26, 42, 16], M(0x8a3a4a, { roughness: 0.45, tissue: 'organ', natural: 0x7e3442 }), 32), 'spleen', 'Spleen'));

  // The gland, see-through, lobulated.
  const gland = M(0xe6bf86, { roughness: 0.55, tissue: 'organ', natural: 0xdcb377, transparent: true, opacity: 0.55, depthWrite: false });
  const body = taperedTube(AXIS, (t) => 15 - 7 * t, gland, 96, 24);
  body.scale.z = 0.65;
  root.add(pick(body, 'pancreas', 'Pancreas: body and tail'));
  const head = ellipsoid([-54, -8, 0], [22, 28, 13], gland, 32);
  root.add(pick(head, 'pancreas', 'Head of the pancreas (in the curve of the duodenum)'));

  // Ducts: main pancreatic duct along the gland to the ampulla; accessory duct; common bile duct.
  const ductMat = M(0xf2e2b8, { roughness: 0.4 });
  const mainDuct = [[98, 44, -8], [70, 36, -5], [30, 26, -2], [-8, 16, 0], [-34, 6, 1], [-52, -6, 2], [-66, -10, 2], AMPULLA.toArray()];
  root.add(pick(tubeThrough(mainDuct, 1.6, ductMat, 96, 10), 'pancreatic-duct', 'Main pancreatic duct'));
  root.add(pick(tubeThrough([[-40, 8, 1], [-58, 10, 3], [-76, 12, 3]], 1, ductMat, 24, 8), 'pancreatic-duct', 'Accessory pancreatic duct (straight to the duodenum)'));
  root.add(pick(tubeThrough([[-52, 80, 2], [-58, 40, 3], [-66, 10, 3], AMPULLA.toArray()], 2.4, M(0x7cb07a, { roughness: 0.4 }), 32, 10), 'pancreatic-duct', 'Common bile duct (from the liver and gallbladder)'));
  root.add(pick(ellipsoid(AMPULLA.toArray(), [3.2, 3.2, 3.2], M(0xd0a070, { roughness: 0.4 }), 14), 'pancreatic-duct', 'Hepatopancreatic ampulla (where both ducts empty into the duodenum)'));

  // Vessels along the back: splenic artery and vein.
  root.add(pick(tubeThrough([[-10, 36, -16], [30, 42, -18], [70, 50, -20], [106, 56, -22]], 2.2, M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' }), 40, 8), 'pancreas', 'Splenic artery (also feeds the pancreas)'));
  root.add(pick(tubeThrough([[-24, 18, -14], [30, 28, -16], [70, 36, -18], [106, 44, -20]], 3, M(COLORS.vein, { roughness: 0.45, tissue: 'vein' }), 40, 8), 'pancreas', 'Splenic vein'));

  // Islets: scattered through the gland, drawn far larger.
  const curve = new THREE.CatmullRomCurve3(AXIS.map((p) => new THREE.Vector3(...p)));
  const isletMat = M(0xf2a6c8, { roughness: 0.35, emissive: 0xff8ac0, emissiveIntensity: 0.2 });
  const islets = [];
  const dot = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 70; i++) {
    const t = rand();
    const p = curve.getPointAt(t);
    const r = (15 - 7 * t) * 0.8 * Math.sqrt(rand());
    const a = rand() * Math.PI * 2;
    p.add(new THREE.Vector3(Math.cos(a) * r * 0.5, Math.sin(a) * r, Math.sin(a * 1.7) * r * 0.5));
    const m = pick(new THREE.Mesh(dot, isletMat), 'islet', 'Islet of Langerhans (drawn far larger)');
    m.position.copy(p);
    m.scale.setScalar(1.2 + rand() * 0.6);
    root.add(m);
    islets.push(m);
  }
  for (let i = 0; i < 18; i++) {
    const m = pick(new THREE.Mesh(dot, isletMat), 'islet', 'Islet of Langerhans (drawn far larger)');
    m.position.set(-54 + (rand() - 0.5) * 34, -8 + (rand() - 0.5) * 44, (rand() - 0.5) * 18);
    m.scale.setScalar(1.2 + rand() * 0.6);
    root.add(m);
  }

  // Pancreatic juice flowing down the duct after a meal.
  const ductCurve = new THREE.CatmullRomCurve3(mainDuct.map((p) => new THREE.Vector3(...p)));
  const juiceMat = M(0x9fd4ff, { roughness: 0.3, emissive: 0x9fd4ff, emissiveIntensity: 0.6 });
  const juice = Array.from({ length: 30 }, (_, i) => {
    const m = pick(new THREE.Mesh(dot, juiceMat), 'pancreatic-duct', 'Pancreatic juice flowing to the duodenum');
    m.scale.setScalar(1.1);
    m.userData.u = i / 30;
    root.add(m);
    return m;
  });
  let flow = 0;
  let meal = 0;
  const placeJuice = () => {
    for (const m of juice) {
      m.visible = meal > 0.2;
      ductCurve.getPointAt((m.userData.u + flow) % 1, m.position);
    }
  };
  function pose(v) {
    meal = v;
    isletMat.emissiveIntensity = 0.2 + 0.9 * ramp(v, 0.3, 1);
    placeJuice();
  }
  const controls = {
    label: 'Meal',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: 1,
    format: (v) => (v < 0.5 ? 'Fasting' : 'After a meal'),
    presets: [
      { label: 'Fasting', value: 0 },
      { label: 'After a meal', value: 1 },
    ],
    set(v) {
      controls.value = v;
      pose(v);
      return v < 0.5
        ? 'Fasting. Little juice flows, and between meals the islets’ alpha cells release glucagon, which tells the liver to turn its glycogen back into glucose.'
        : 'After a meal. The acini pour out pancreatic juice, over a liter a day, with enzymes for carbohydrates, proteins and fats and bicarbonate to neutralize stomach acid (pH 7.1 to 8.2). It flows down the duct into the duodenum, while the islets release insulin into the blood.';
    },
  };
  controls.set(1);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    frameWidth: 0.24,
    view: { target: [20, 4, 0], direction: [0.1, 0.12, 1] },
    focus: curve.getPointAt(0.45).toArray(),
    controls,
    update(dt) {
      if (reducedMotion) return;
      flow = (flow + dt * 0.12) % 1;
      placeJuice();
    },
    dispose() {
      dot.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
