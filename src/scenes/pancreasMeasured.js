// Tier 3: the pancreas, measured. The pancreas, duodenum, spleen, gallbladder
// and splenic vessels of one real adult (BodyParts3D, from the whole-body
// bundle), seen from the front: 1 scene unit = 1 mm, the body's left toward +x.
//
// The gland is see-through. Drawn inside it: the main pancreatic duct, along
// the gland's measured center line from the tail to the head and on to the
// duodenum (tools/build_body_meshes.py, landmarks "digestive"), the accessory
// duct, the bile ducts from the liver and gallbladder, and the islets, drawn
// far larger than life (real ones are a fraction of a millimeter). The meal
// control works as in pancreas.js.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, ellipsoid, seeded, disposeTree } from './kit.js';
import { ramp } from './stages.js';
import { organFrame, partOf, pointsInside, nearestVertex } from './organKit.js';
import LANDMARKS from '../data/bodyLandmarks.json';

/** Build the measured pancreas scene, or null when the bundle is not loaded. */
export function buildMeasuredPancreas(parts, { reducedMotion = false } = {}) {
  const pancreas = partOf(parts, 'pancreas');
  const duodenum = partOf(parts, 'duodenum');
  const D = LANDMARKS.digestive;
  if (!pancreas || !duodenum || !D) return null;
  const M = materialBank();
  const root = new THREE.Group();
  const { group, toScene } = organFrame(LANDMARKS.pancreas, 1000);
  root.add(group);
  const rand = seeded(1919);

  const gland = M(0xe6bf86, { roughness: 0.55, tissue: 'organ', natural: 0xdcb377, transparent: true, opacity: 0.5, depthWrite: false, repeat: [1, 1] });
  group.add(pick(new THREE.Mesh(pancreas.geometry, gland), 'pancreas', 'Pancreas: head (in the curve of the duodenum), body and tail (at the spleen)'));
  group.add(pick(new THREE.Mesh(duodenum.geometry, M(0xe6a08a, { roughness: 0.5, tissue: 'organ', natural: 0xd89480, repeat: [1, 1] })), 'duodenum', 'Duodenum (first part of the small intestine)'));
  const spleen = partOf(parts, 'spleen');
  if (spleen) group.add(pick(new THREE.Mesh(spleen.geometry, M(0x8a3a4a, { roughness: 0.45, tissue: 'organ', natural: 0x7e3442, repeat: [1, 1] })), 'spleen', 'Spleen'));
  const gallbladder = partOf(parts, 'gallbladder');
  if (gallbladder) group.add(pick(new THREE.Mesh(gallbladder.geometry, M(0x6f9a3f, { roughness: 0.3, tissue: 'organ', natural: 0x6f9a3f, repeat: [1, 1] })), 'gallbladder', 'Gallbladder (stores bile)'));
  const vessel = (label, color, tissue, text) => {
    const v = partOf(parts, 'gut-vessels', label);
    if (v) group.add(pick(new THREE.Mesh(v.geometry, M(color, { roughness: 0.4, tissue, repeat: [1, 1] })), 'pancreas', text));
  };
  vessel('Splenic artery', 0xd9434f, 'vessel', 'Splenic artery (also feeds the pancreas)');
  vessel('Splenic vein', 0x5c6bd6, 'vein', 'Splenic vein');
  vessel('Superior mesenteric vein', 0x5c6bd6, 'vein', 'Superior mesenteric vein (joins the splenic vein behind the pancreas)');

  // Ducts, drawn: the main duct along the gland's center line into the duodenum; the accessory duct; the bile ducts.
  const ductMat = M(0xf2e2b8, { roughness: 0.4 });
  const ampulla = toScene(D.ampulla);
  const mainDuct = [...D.pancreaticDuct.map(toScene), ampulla];
  root.add(pick(tubeThrough(mainDuct, 1.6, ductMat, 96, 10), 'pancreatic-duct', 'Main pancreatic duct'));
  const accessoryFrom = D.pancreaticDuct[Math.floor(D.pancreaticDuct.length * 0.72)];
  const accessoryTo = nearestVertex(duodenum.geometry, [D.ampulla[0], D.ampulla[1] + 0.018, D.ampulla[2]]);
  root.add(pick(tubeThrough([toScene(accessoryFrom), toScene(accessoryTo)], 1, ductMat, 16, 8), 'pancreatic-duct', 'Accessory pancreatic duct (straight to the duodenum)'));
  const bile = M(0x7cb07a, { roughness: 0.4 });
  const junction = D.porta.map((x, i) => x + (D.ampulla[i] - x) * 0.35 + (D.gallbladderNeck[i] - x) * 0.25);
  root.add(pick(tubeThrough([toScene(D.porta), toScene(junction)], 2.2, bile, 16, 8), 'pancreatic-duct', 'Common hepatic duct (bile from the liver)'));
  root.add(pick(tubeThrough([toScene(D.gallbladderNeck), toScene(junction)], 1.8, bile, 16, 8), 'pancreatic-duct', 'Cystic duct (to and from the gallbladder)'));
  root.add(pick(tubeThrough([toScene(junction), toScene(junction.map((x, i) => (x + D.ampulla[i]) / 2)), ampulla], 2.4, bile, 32, 10), 'pancreatic-duct', 'Common bile duct (from the liver and gallbladder)'));
  root.add(pick(ellipsoid(ampulla, [3.2, 3.2, 3.2], M(0xd0a070, { roughness: 0.4 }), 14), 'pancreatic-duct', 'Hepatopancreatic ampulla (where both ducts empty into the duodenum)'));

  // Islets: scattered through the measured gland, drawn far larger.
  const isletMat = M(0xf2a6c8, { roughness: 0.35, emissive: 0xff8ac0, emissiveIntensity: 0.2 });
  const dot = new THREE.SphereGeometry(1, 10, 8);
  const islets = pointsInside(pancreas.geometry, 90, rand).map((p) => {
    const m = pick(new THREE.Mesh(dot, isletMat), 'islet', 'Islet of Langerhans (drawn far larger)');
    m.position.set(...toScene(p));
    m.scale.setScalar(1.2 + rand() * 0.6);
    root.add(m);
    return m;
  });

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
      meal = v;
      isletMat.emissiveIntensity = 0.2 + 0.9 * ramp(v, 0.3, 1);
      placeJuice();
      return v < 0.5
        ? 'Fasting. Little juice flows, and between meals the islets’ alpha cells release glucagon, which tells the liver to turn its glycogen back into glucose.'
        : 'After a meal. The acini pour out pancreatic juice, over a liter a day, with enzymes for carbohydrates, proteins and fats and bicarbonate to neutralize stomach acid (pH 7.1 to 8.2). It flows down the duct into the duodenum, while the islets release insulin into the blood.';
    },
  };
  controls.set(1);

  // Focus: the islet nearest the middle of the duct, where the dive continues into an islet.
  const mid = new THREE.Vector3(...mainDuct[Math.floor(mainDuct.length * 0.45)]);
  const focusIslet = islets.reduce((best, m) => (m.position.distanceTo(mid) < best.position.distanceTo(mid) ? m : best), islets[0]);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    frameWidth: 0.24,
    detailed: true,
    view: { target: [0, 4, 0], direction: [0.1, 0.12, 1] },
    focus: (focusIslet?.position ?? mid).toArray(),
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
