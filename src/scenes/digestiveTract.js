// Tier 2: the digestive tract, measured. The esophagus, stomach, duodenum,
// small and large intestines of one real adult (BodyParts3D, from the
// whole-body bundle), with the liver, gallbladder and pancreas that pour
// juices into it: 1 scene unit = 1 cm, seen from the front.
//
// A mouthful of food travels the route measured by tools/build_body_meshes.py
// (landmarks "gut"): along the center lines of the esophagus, stomach,
// duodenum, colon and rectum. The atlas models the jejunum and ileum as two
// packed masses, not one coiled tube, so the route through them is a drawn
// winding path. The stage control follows the meal, with how long each part
// takes; the organ it is in glows. Until the bundle loads, the whole body
// with its digestive system stands in.
import * as THREE from 'three/webgpu';
import { materialBank, pick, disposeTree, tubeThrough } from './kit.js';
import { stagedControls, ramp } from './stages.js';
import { bodyParts } from './bodyMeshes.js';
import { buildBody } from './body.js';
import { organFrame, partsWhere } from './organKit.js';
import LANDMARKS from '../data/bodyLandmarks.json';

export const GUT_STAGES = [
  {
    key: 'esophagus',
    label: 'Swallowing',
    parts: (p) => /Esophagus/.test(p.extras.label),
    text: 'Swallowing. Each mouthful is pushed down the esophagus, about 25 cm, in under ten seconds, squeezed along by waves of muscle (peristalsis).',
  },
  {
    key: 'stomach',
    label: 'Stomach',
    parts: (p) => p.extras.card === 'stomach',
    text: 'The stomach. For two to four hours it churns the food with acid and enzymes into a soupy chyme, then lets it out a little at a time through the pyloric sphincter.',
  },
  {
    key: 'duodenum',
    label: 'Duodenum',
    parts: (p) => ['duodenum', 'liver', 'gallbladder', 'pancreas'].includes(p.extras.card),
    text: 'The duodenum, the first 25 cm of the small intestine. Bile from the liver and gallbladder and juice from the pancreas pour in and break the fats, proteins and carbohydrates down.',
  },
  {
    key: 'smallIntestine',
    label: 'Small intestine',
    parts: (p) => p.extras.card === 'small-intestine',
    text: 'The jejunum and ileum, about 3 m long in a living person and folded into loops, absorb almost all the nutrients into the blood over three to five hours. (The path through the loops is drawn.)',
  },
  {
    key: 'largeIntestine',
    label: 'Large intestine',
    parts: (p) => p.extras.card === 'large-intestine',
    text: 'The large intestine. Over a day or more the colon takes back water and salts, and its bacteria ferment what is left; the rectum stores the waste until it leaves the body.',
  },
];

/** The last stop of the stage control: the meal has gone all the way through. */
export const TRIP = 'The whole trip, from mouth to the end of the rectum, usually takes one to three days, and most of that is in the large intestine.';

const ORGAN_CARDS = ['digestive-system', 'stomach', 'duodenum', 'small-intestine', 'large-intestine', 'liver', 'gallbladder', 'pancreas'];

/** Build the measured digestive tract, or the whole body's digestive system until the bundle has loaded. */
export function buildDigestiveTract({ reducedMotion = false } = {}) {
  const parts = bodyParts();
  const G = LANDMARKS.gut;
  const organs = partsWhere(parts, (p) => ORGAN_CARDS.includes(p.extras.card) && (p.extras.card !== 'digestive-system' || /Esophagus/.test(p.extras.label)));
  if (!G || organs.length < 6) return buildBody({ systems: ['digestive'], reducedMotion });
  const M = materialBank();
  const root = new THREE.Group();
  const box = new THREE.Box3();
  for (const p of organs) box.union(p.geometry.boundingBox);
  const { group, toScene } = organFrame(box.getCenter(new THREE.Vector3()).toArray(), 100);
  root.add(group);

  // Each organ is see-through, so the meal shows inside; the one it is in glows
  // and the others fade.
  const glows = GUT_STAGES.map(() => []);
  for (const p of organs) {
    const stage = GUT_STAGES.findIndex((s) => s.parts(p));
    const color = p.extras.natural ?? 0xd99088;
    const mat = M(color, {
      roughness: 0.45,
      tissue: 'organ',
      natural: color,
      transparent: true,
      opacity: stage >= 0 ? 0.55 : 0.35,
      depthWrite: false,
      emissive: 0xffb070,
      emissiveIntensity: 0,
      repeat: [1, 1],
      name: `gut-${stage}-${p.extras.card}`,
    });
    group.add(pick(new THREE.Mesh(p.geometry, mat), p.extras.card, p.extras.label));
    if (stage >= 0 && !glows[stage].includes(mat)) glows[stage].push(mat);
  }

  // The route, faintly drawn, and the mouthful moving along it.
  const curves = GUT_STAGES.map((s) => new THREE.CatmullRomCurve3(G[s.key].map((p) => new THREE.Vector3(...toScene(p))), false, 'centripetal'));
  const trail = M(0xfff0c8, { roughness: 0.5, transparent: true, opacity: 0.35, depthWrite: false });
  GUT_STAGES.forEach((s) => root.add(pick(tubeThrough(G[s.key].map(toScene), 0.18, trail, G[s.key].length * 6, 6), 'digestive-system', `The way food goes: ${s.label.toLowerCase()}`)));
  const food = pick(new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 14), M(0xffe2a0, { roughness: 0.4, emissive: 0xffc860, emissiveIntensity: 0.9 })), 'digestive-system', 'A mouthful of food on its way through');
  root.add(food);

  function apply(v) {
    const k = Math.min(GUT_STAGES.length - 1, Math.floor(v));
    curves[k].getPointAt(Math.min(1, Math.max(0, v - k)), food.position);
    glows.forEach((mats, i) => {
      const on = ramp(v, i - 0.15, i + 0.1) * (1 - ramp(v, i + 1, i + 1.2));
      for (const m of mats) {
        m.emissiveIntensity = 0.35 * on;
        m.opacity = 0.3 + 0.35 * on; // the others fade, so the meal shows behind them
      }
    });
  }
  const stages = [
    ...GUT_STAGES.map(({ label, text }) => ({ label, text })),
    { label: 'The whole trip', text: TRIP },
  ];
  const { controls, update } = stagedControls({ stages, label: 'The meal', apply, reducedMotion, rate: 0.12, still: 3.5 });

  // Focus: the small intestine, where the dive goes on.
  const si = G.smallIntestine;
  const focus = toScene(si[Math.floor(si.length / 2)]);
  return {
    root,
    fit: 'both',
    metersPerUnit: 0.01,
    frameWidth: 0.72,
    detailed: true,
    view: { target: [0, 0, 0], direction: [0.12, 0.08, 1] },
    focus,
    controls,
    update,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
