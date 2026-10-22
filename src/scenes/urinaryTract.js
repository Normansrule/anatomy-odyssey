// Tier 2: the urinary tract, measured. Both kidneys, the ureters, the
// bladder, the adrenal glands and the vessels that feed the kidneys, of one
// real adult (BodyParts3D, from the whole-body bundle), with the pelvis
// faintly behind: 1 scene unit = 1 cm, seen from the front.
//
// The routes are read from the meshes when the scene is built: blood comes
// down the aorta and out along each renal artery to the kidney's hilum;
// urine gathers in each renal pelvis and runs down the center line of each
// ureter (the mesh, cut into 1 cm slices) into the back of the bladder. The
// atlas has no urethra, so a short one is drawn from the bladder's neck. The
// stage control follows one batch of urine; the part it is in glows, and the
// urine in the bladder rises as it fills and drains as it empties. Until the
// bundle loads, the whole body with its urinary system stands in.
import * as THREE from 'three/webgpu';
import { materialBank, pick, disposeTree, tubeThrough, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';
import { bodyParts } from './bodyMeshes.js';
import { buildBody } from './body.js';
import { organFrame, partOf, partsWhere, cutAway } from './organKit.js';

export const URINE_STAGES = [
  { key: 'blood', label: 'Into the kidneys', text: 'Blood in. A renal artery branches off the aorta to each kidney; together they take about 1.2 L of blood a minute, a fifth of everything the heart pumps.' },
  { key: 'filter', label: 'Filtering', text: 'Filtering. A million tiny filters in each kidney squeeze about 180 L of fluid a day out of the blood, then take back 99% of it, with the sugar and salts the body needs. What is left, water with urea and other wastes, is urine.' },
  { key: 'ureter', label: 'Down the ureters', text: 'Down the ureters. Urine collects in each renal pelvis and is pushed down the ureters, about 25 cm long, by waves of muscle a few times a minute, so it gets there even lying down.' },
  { key: 'fill', label: 'Filling the bladder', text: 'Filling. The bladder’s muscular wall stretches as urine arrives. It holds about 400 to 600 mL; nerves in the wall send the first urge to go at about 200 to 300 mL.' },
  { key: 'empty', label: 'Emptying', text: 'Emptying. The ring muscles at the bladder’s neck relax, the wall squeezes, and the urine leaves through the urethra (drawn here; the atlas has none), about 4 cm long in women and 20 cm in men.' },
];

/** The last stop of the stage control. */
export const DAY = 'In a day the kidneys make about 1 to 2 L of urine, emptied four to seven times. Drink less and they keep more water back, so the urine is darker; drink more and it is paler.';

const SLICE = 0.01; // m: the ureter is cut into slices this thick to find its center line
const mean = (pts) => [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / pts.length);
const vertices = (geometry) => {
  const a = geometry.attributes.position.array;
  const out = [];
  for (let i = 0; i < a.length; i += 3) out.push([a[i], a[i + 1], a[i + 2]]);
  return out;
};

/**
 * The urine's way down one side of the measured ureter mesh (which also holds
 * the renal pelvis): the pelvis's middle, then the middle of each 1 cm slice of
 * the ureter, top to bottom. side: -1 for the body's right, +1 for its left.
 */
export function ureterRoute(ureter, side) {
  const vs = vertices(ureter).filter((p) => Math.sign(p[0]) === side);
  // The pelvis is the wide part at the top: slices more than 1.5 cm across.
  const slices = new Map();
  for (const p of vs) {
    const k = Math.round(p[1] / SLICE);
    if (!slices.has(k)) slices.set(k, []);
    slices.get(k).push(p);
  }
  const keys = [...slices.keys()].sort((a, b) => b - a);
  const wide = (k) => {
    const xs = slices.get(k).map((p) => p[0]);
    return Math.max(...xs) - Math.min(...xs) > 0.015;
  };
  const tube = keys.filter((k) => !wide(k) && k < Math.min(...keys.filter(wide)));
  const pelvis = mean(keys.filter(wide).flatMap((k) => slices.get(k)));
  return [pelvis, ...tube.map((k) => mean(slices.get(k)))];
}

/** Build the measured urinary tract, or the whole body's urinary system until the bundle has loaded. */
export function buildUrinaryTract({ reducedMotion = false } = {}) {
  const parts = bodyParts();
  const kidneys = partsWhere(parts, (p) => p.extras.card === 'kidney' && /kidney/.test(p.extras.label));
  const ureter = partOf(parts, 'urinary-system', /Ureter/);
  const bladder = partOf(parts, 'urinary-system', 'Bladder');
  if (kidneys.length < 2 || !ureter || !bladder) return buildBody({ systems: ['urinary'], reducedMotion });
  const M = materialBank();
  const root = new THREE.Group();
  const box = new THREE.Box3();
  for (const p of [...kidneys, ureter, bladder]) box.union(p.geometry.boundingBox);
  const top = box.max.y + 0.01; // the aorta and vena cava are shown up to here
  const { group, toScene } = organFrame(box.getCenter(new THREE.Vector3()).toArray(), 100);
  root.add(group);
  const add = (geometry, material, card, label) => {
    const m = pick(new THREE.Mesh(geometry, material), card, label);
    group.add(m);
    return m;
  };
  const glowing = (color, stage, opacity) =>
    M(color, { roughness: 0.45, tissue: 'organ', natural: color, transparent: true, opacity, depthWrite: false, emissive: 0xffd070, emissiveIntensity: 0, repeat: [1, 1], name: `urine-${stage}` });

  // The organs: the kidneys see-through, so the pelvis and urine show inside.
  const glows = { kidney: glowing(0x9c4a4a, 'kidney', 0.5), ureter: glowing(0xe8d48a, 'ureter', 0.9), bladder: glowing(0xd9a08a, 'bladder', 0.4) };
  for (const k of kidneys) add(k.geometry, glows.kidney, 'kidney', `${k.extras.label} (cleans the blood and makes urine)`);
  add(ureter.geometry, glows.ureter, 'urinary-system', 'Ureter (carries urine to the bladder), with the renal pelvis that gathers it in the kidney');
  add(bladder.geometry, glows.bladder, 'urinary-system', 'Bladder (stores urine)');
  const adrenal = partOf(parts, 'adrenal-gland', /Adrenal/);
  if (adrenal) add(adrenal.geometry, M(0xe0b25a, { roughness: 0.55, tissue: 'organ', natural: 0xd9a64e, repeat: [1, 1] }), 'adrenal-gland', 'Adrenal glands (on top of each kidney)');

  // The vessels: the renal arteries and veins whole, the aorta and vena cava up to just above the kidneys.
  const artery = M(COLORS.artery, { roughness: 0.4, side: THREE.DoubleSide, tissue: 'vessel', repeat: [1, 1] });
  const vein = M(COLORS.vein, { roughness: 0.4, side: THREE.DoubleSide, tissue: 'vein', repeat: [1, 1] });
  const below = (g) => cutAway(g, [0, top, 0], [0, 1, 0]);
  const renalArtery = partOf(parts, 'kidney', 'Renal artery');
  const aorta = partOf(parts, 'aorta', /Descending/);
  for (const [card, label, mat, text, trim] of [
    ['kidney', 'Renal artery', artery, 'Renal arteries (blood to the kidneys)'],
    ['kidney', 'Renal vein', vein, 'Renal veins (cleaned blood back to the vena cava)'],
    ['aorta', /Descending/, artery, 'Aorta (the body’s main artery)', true],
    ['great-vessels', 'Inferior vena cava', vein, 'Inferior vena cava (blood back to the heart)', true],
    ['circulatory-system', 'Common iliac artery', artery, 'Common iliac arteries (to the legs and pelvis)'],
    ['circulatory-system', 'Common iliac vein', vein, 'Common iliac veins (from the legs and pelvis)'],
  ]) {
    const p = partOf(parts, card, label);
    if (p) add(trim ? below(p.geometry) : p.geometry, mat, card, text);
  }
  // The pelvis behind, faintly, to show where everything sits.
  const ghost = M(COLORS.bone, { roughness: 0.6, transparent: true, opacity: 0.18, depthWrite: false });
  for (const p of partsWhere(parts, (q) => q.extras.card === 'pelvis')) add(p.geometry, ghost, 'pelvis', p.extras.label);

  // The urine in the bladder: the bladder's own shape, shrunk toward its neck by how full it is.
  const bv = vertices(bladder.geometry);
  const lowest = Math.min(...bv.map((p) => p[1]));
  const neck = mean(bv.filter((p) => p[1] < lowest + 0.004));
  const urineMat = M(0xf2d24a, { roughness: 0.25, transparent: true, opacity: 0.7, depthWrite: false, emissive: 0xc8a020, emissiveIntensity: 0.25 });
  const pool = new THREE.Group();
  pool.position.set(...neck);
  const urine = pick(new THREE.Mesh(bladder.geometry, urineMat), 'urinary-system', 'Urine in the bladder');
  urine.position.set(...neck.map((x) => -x));
  urine.renderOrder = -1;
  pool.add(urine);
  group.add(pool);
  const urethra = [neck, [neck[0], neck[1] - 0.02, neck[2] + 0.004], [neck[0], neck[1] - 0.04, neck[2] + 0.012]];
  const urethraMat = M(0xe8b8a0, { roughness: 0.45, transparent: true, opacity: 0.6, depthWrite: false });
  root.add(pick(tubeThrough(urethra.map(toScene), 0.3, urethraMat, 16, 10), 'urinary-system', 'Urethra (drawn: carries urine out of the body)'));

  // The routes.
  const curve = (pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...toScene(p))), false, 'centripetal');
  const bladderMiddle = bladder.geometry.boundingBox.getCenter(new THREE.Vector3()).toArray();
  const sides = [-1, 1];
  const ureters = sides.map((s) => ureterRoute(ureter.geometry, s));
  const routes = { blood: [], ureter: ureters.map(curve), fill: ureters.map((r) => curve([r.at(-1), bladderMiddle])), empty: [curve([bladderMiddle, ...urethra])] };
  if (renalArtery && aorta) {
    const av = vertices(aorta.geometry);
    const slice = (y) => mean(av.filter((p) => Math.abs(p[1] - y) < 0.004));
    const rv = vertices(renalArtery.geometry);
    const level = mean(rv)[1];
    const ax = slice(level)[0];
    for (const s of sides) {
      const mine = rv.filter((p) => Math.sign(p[0] - ax) === s);
      const reach = mine.map((p) => Math.abs(p[0] - ax));
      const far = Math.max(...reach);
      const near = Math.min(...reach);
      const start = mean(mine.filter((p, i) => reach[i] < near + 0.006));
      routes.blood.push(curve([slice(top - 0.005), slice(level + 0.008), start, mean(mine), mean(mine.filter((p, i) => reach[i] > far - 0.006))]));
    }
  }
  // Pale outlines of the urine's way down, as in the digestive tract.
  const trail = M(0xfff0b0, { roughness: 0.5, transparent: true, opacity: 0.3, depthWrite: false });
  ureters.forEach((r) => root.add(pick(tubeThrough(r.map(toScene), 0.12, trail, r.length * 6, 6), 'urinary-system', 'The way urine goes: down the ureter')));

  // Drops: red blood cells on the way in, yellow urine on the way down and out.
  const drop = new THREE.SphereGeometry(0.32, 14, 10);
  // Blood runs inside the vessel walls, so its drops are drawn on top of them.
  const blood = M(0xff5050, { roughness: 0.3, emissive: 0xff3030, emissiveIntensity: 0.9, depthTest: false });
  const pee = M(0xffe060, { roughness: 0.3, emissive: 0xffc830, emissiveIntensity: 0.8 });
  const TRAIN = 5;
  const movers = [];
  URINE_STAGES.forEach((s, k) => {
    for (const c of routes[s.key] ?? []) {
      for (let i = 0; i < TRAIN; i++) {
        const label = s.key === 'blood' ? 'Blood on its way into a kidney' : 'Urine on its way out';
        const m = pick(new THREE.Mesh(drop, s.key === 'blood' ? blood : pee), s.key === 'blood' ? 'blood' : 'urinary-system', label);
        m.visible = false;
        if (s.key === 'blood') m.renderOrder = 2;
        root.add(m);
        movers.push({ k, c, i, m });
      }
    }
  });
  // In the kidneys, urine gathering in each pelvis while they filter.
  const gathered = ureters.map((r) => {
    const m = pick(new THREE.Mesh(drop, pee), 'renal-pelvis', 'Urine gathering in the renal pelvis');
    m.position.set(...toScene(r[0]));
    root.add(m);
    return m;
  });

  const fullness = (v) => 0.12 + 0.88 * ramp(v, 2.6, 4) - 0.95 * ramp(v, 4.1, 4.9);
  function apply(v) {
    for (const { k, c, i, m } of movers) {
      const u = (v - k) * 1.5 - i * 0.12;
      m.visible = u > 0 && u < 1;
      if (m.visible) c.getPointAt(u, m.position);
    }
    const g = ramp(v, 0.9, 1.4) * (1 - ramp(v, 2.2, 2.5));
    for (const m of gathered) m.scale.setScalar(0.2 + 1.3 * g);
    const on = (a, b) => ramp(v, a - 0.15, a + 0.1) * (1 - ramp(v, b, b + 0.2));
    const glow = { kidney: on(0, 2), ureter: on(2, 3), bladder: on(3, 5) };
    for (const [key, m] of Object.entries(glows)) {
      m.emissiveIntensity = 0.35 * glow[key];
    }
    glows.kidney.opacity = 0.35 + 0.3 * glow.kidney;
    const f = Math.max(0.03, fullness(v));
    pool.scale.setScalar(0.94 * Math.cbrt(f));
    pool.visible = f > 0.04;
  }
  const stages = [...URINE_STAGES.map(({ label, text }) => ({ label, text })), { label: 'A whole day', text: DAY }];
  const readout = (v, k) => {
    const text = stages[k].text;
    return k === 3 || k === 4 ? `${text} The bladder is now holding about ${Math.round(Math.max(0, fullness(v)) * 500 / 10) * 10} mL.` : text;
  };
  const { controls, update } = stagedControls({ stages, label: 'Urine', apply, readout, reducedMotion, rate: 0.15, still: 3.5 });

  // Focus: the left kidney, where the dive goes on.
  const left = kidneys.find((k) => /Left/.test(k.extras.label)) ?? kidneys[0];
  return {
    root,
    fit: 'both',
    metersPerUnit: 0.01,
    frameWidth: 0.42,
    detailed: true,
    view: { target: [0, 0, 0], direction: [0, 0.05, 1] },
    focus: toScene(left.geometry.boundingBox.getCenter(new THREE.Vector3())),
    controls,
    update,
    dispose() {
      drop.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
