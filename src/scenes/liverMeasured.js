// Tier 3: the liver, measured. The liver, gallbladder, inferior vena cava and
// hepatic artery of one real adult (BodyParts3D, from the whole-body bundle),
// seen from the front: 1 scene unit = 1 mm, the body's left toward +x.
//
// Drawn from measured landmarks (tools/build_body_meshes.py, "digestive"):
// the hepatic portal vein from where the splenic and superior mesenteric
// veins meet up to the liver's gate (the porta hepatis), the hepatic veins
// into the vena cava, and the bile ducts from the gate and the gallbladder
// down to the duodenum, all seen through the see-through liver. A magnifier on the right lobe shows its lobules,
// drawn about six times larger than life. The stage control works as in
// liver.js.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, seeded, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';
import { LIVER_STAGES, LOBULE_DRAWN_MM } from './liver.js';
import { organFrame, partOf, partsWhere } from './organKit.js';
import LANDMARKS from '../data/bodyLandmarks.json';

const WINDOW_MM = 30; // radius of the magnifier

/** Build the measured liver scene, or null when the bundle is not loaded. */
export function buildMeasuredLiver(parts, { reducedMotion = false } = {}) {
  const liver = partOf(parts, 'liver');
  const D = LANDMARKS.digestive;
  if (!liver || !D) return null;
  const M = materialBank();
  const root = new THREE.Group();
  const { group, toScene } = organFrame(LANDMARKS.liver, 1000);
  root.add(group);
  const rand = seeded(2323);

  group.add(pick(new THREE.Mesh(liver.geometry, M(0x8a3a32, { roughness: 0.4, tissue: 'organ', natural: 0x7e342c, transparent: true, opacity: 0.62, depthWrite: false, repeat: [1, 1] })), 'liver', 'Liver: the large right lobe and the smaller left lobe'));
  const gallbladder = partOf(parts, 'gallbladder');
  if (gallbladder) group.add(pick(new THREE.Mesh(gallbladder.geometry, M(0x6f9a3f, { roughness: 0.3, tissue: 'organ', natural: 0x6f9a3f, repeat: [1, 1] })), 'gallbladder', 'Gallbladder (stores and concentrates bile)'));
  const ivcPart = partOf(parts, 'great-vessels', 'Inferior vena cava');
  if (ivcPart) group.add(pick(new THREE.Mesh(ivcPart.geometry, M(COLORS.vein, { roughness: 0.45, tissue: 'vein', repeat: [1, 1] })), 'liver-vessels', 'Inferior vena cava'));
  const arteryPart = partOf(parts, 'circulatory-system', 'Common hepatic artery');
  if (arteryPart) group.add(pick(new THREE.Mesh(arteryPart.geometry, M(COLORS.artery, { roughness: 0.4, tissue: 'vessel', repeat: [1, 1] })), 'liver-vessels', 'Hepatic artery (oxygen-rich blood from the heart)'));
  for (const v of partsWhere(parts, (p) => p.extras.card === 'duodenum')) {
    group.add(pick(new THREE.Mesh(v.geometry, M(0xe6a08a, { roughness: 0.5, tissue: 'organ', natural: 0xd89480, repeat: [1, 1] })), 'duodenum', 'Duodenum (where bile enters the gut)'));
  }

  // Drawn vessels and ducts, routed through the measured landmarks.
  const porta = D.porta;
  const below = (p, dy) => [p[0], p[1] - dy, p[2]];
  const portal = [D.portalVeinStart, D.portalVeinStart.map((x, i) => (x + porta[i]) / 2 + (i === 2 ? 0.006 : 0)), porta].map(toScene);
  root.add(pick(tubeThrough(portal, 6, M(0x7a5aa8, { roughness: 0.4, tissue: 'vein' }), 32, 12), 'liver-vessels', 'Hepatic portal vein (blood from the gut)'));
  const ivcRoute = LANDMARKS.flow.find((r) => r.name === 'inferior vena cava').points;
  const ivcTop = ivcRoute.at(-1);
  if (!liver.geometry.boundingBox) liver.geometry.computeBoundingBox();
  const lb = liver.geometry.boundingBox;
  const lc = lb.getCenter(new THREE.Vector3());
  const hv = [-0.06, -0.015, 0.035].map((dx) => [[lc.x + dx, lc.y + 0.01, lc.z + 0.01], [lc.x + dx * 0.4, (lc.y + ivcTop[1]) / 2 + 0.01, (lc.z + ivcTop[2]) / 2], ivcTop].map(toScene));
  for (const p of hv) root.add(pick(tubeThrough(p, 4, M(COLORS.vein, { roughness: 0.45, tissue: 'vein' }), 24, 10), 'liver-vessels', 'Hepatic vein (to the inferior vena cava)'));
  const junction = porta.map((x, i) => x + (D.ampulla[i] - x) * 0.35 + (D.gallbladderNeck[i] - x) * 0.25);
  const bilePts = {
    hepatic: [porta, below(porta, 0.008), junction].map(toScene),
    cystic: [D.gallbladderNeck, junction].map(toScene),
    common: [junction, junction.map((x, i) => (x + D.ampulla[i]) / 2), D.ampulla].map(toScene),
  };
  const bileMat = M(0x7cb07a, { roughness: 0.4 });
  root.add(pick(tubeThrough(bilePts.hepatic, 3, bileMat, 24, 8), 'gallbladder', 'Common hepatic duct (bile leaving the liver)'));
  root.add(pick(tubeThrough(bilePts.cystic, 2.4, bileMat, 24, 8), 'gallbladder', 'Cystic duct (to and from the gallbladder)'));
  root.add(pick(tubeThrough(bilePts.common, 3.4, bileMat, 24, 8), 'gallbladder', 'Common bile duct (to the duodenum)'));

  // The magnifier: lobules on the front of the right lobe, drawn about six times larger.
  const a = liver.geometry.attributes.position.array;
  let front = null;
  for (let i = 0; i < a.length; i += 3) {
    // The front-most point of the right lobe (the body's right, −x), a little above the middle.
    if (a[i] > lc.x - 0.03 || Math.abs(a[i + 1] - (lc.y + 0.015)) > 0.02) continue;
    if (!front || a[i + 2] > front[2]) front = [a[i], a[i + 1], a[i + 2]];
  }
  const at = new THREE.Vector3(...toScene(front ?? [lc.x - 0.06, lc.y, lb.max.z])).add(new THREE.Vector3(0, 0, 12));
  const lens = new THREE.Group();
  lens.position.copy(at);
  root.add(lens);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(WINDOW_MM, 48), M(0x9c4a3e, { roughness: 0.6, tissue: 'organ', natural: 0x8e4238, repeat: [0.04, 0.04] }));
  lens.add(pick(disc, 'hepatic-lobule', 'Lobules, seen through a magnifier (drawn about six times larger)'));
  lens.add(pick(new THREE.Mesh(new THREE.TorusGeometry(WINDOW_MM + 1.2, 1.4, 10, 64), M(0xe8e2f0, { roughness: 0.3, metalness: 0.4 })), 'hepatic-lobule', 'Magnifier'));
  const L = LOBULE_DRAWN_MM;
  const centers = [];
  for (let row = -6; row <= 6; row++) {
    for (let col = -6; col <= 6; col++) {
      const x = col * L * 1.5;
      const y = row * L * Math.sqrt(3) + (col % 2 ? (L * Math.sqrt(3)) / 2 : 0);
      if (Math.hypot(x, y) < WINDOW_MM - L) centers.push([x, y]);
    }
  }
  const hexRing = new THREE.RingGeometry(L - 0.35, L, 6);
  const dot = new THREE.CircleGeometry(1, 12);
  const faceGlow = M(0xd8a090, { roughness: 0.6, emissive: 0xffb090, emissiveIntensity: 0 });
  const hexes = new THREE.InstancedMesh(hexRing, faceGlow, centers.length);
  const veins = new THREE.InstancedMesh(dot, M(COLORS.vein, { roughness: 0.5 }), centers.length);
  const triads = new THREE.InstancedMesh(dot, M(0x7cb07a, { roughness: 0.5 }), centers.length * 2);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  centers.forEach(([x, y], i) => {
    hexes.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, 0.2), q, new THREE.Vector3(1, 1, 1)));
    veins.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, 0.25), q, new THREE.Vector3(0.9, 0.9, 1)));
    for (const [k, ang] of [[0, 0], [1, Math.PI / 3]]) triads.setMatrixAt(i * 2 + k, m4.compose(new THREE.Vector3(x + Math.cos(ang) * L, y + Math.sin(ang) * L, 0.25), q, new THREE.Vector3(0.75, 0.75, 1)));
  });
  lens.add(pick(hexes, 'hepatic-lobule', 'Hepatic lobule (drawn about six times larger)'));
  lens.add(pick(veins, 'hepatic-lobule', 'Central vein of a lobule'));
  lens.add(pick(triads, 'hepatic-lobule', 'Portal triad at a lobule corner'));

  // Flowing dots for each stage.
  const arteryRoute = arteryPart ? [toScene(D.portalVeinStart.map((x, i) => x + (i === 0 ? 0.004 : i === 2 ? 0.008 : 0))), toScene(porta)] : portal;
  const flows = [
    { pts: portal, color: 0xb08ad8, from: 0, card: 'liver-vessels', label: 'Blood from the gut' },
    { pts: arteryRoute, color: 0xff6a6a, from: 0, card: 'liver-vessels', label: 'Blood from the heart' },
    ...hv.map((p) => ({ pts: p, color: 0x7a9ae8, from: 2, card: 'liver-vessels', label: 'Blood leaving the liver' })),
    { pts: [...bilePts.hepatic, ...bilePts.common.slice(1)], color: 0xb0e07a, from: 3, card: 'gallbladder', label: 'Bile' },
    { pts: bilePts.cystic.slice().reverse(), color: 0xb0e07a, from: 3, card: 'gallbladder', label: 'Bile stored in the gallbladder' },
  ].map((f) => ({ ...f, curve: new THREE.CatmullRomCurve3(f.pts.map((p) => new THREE.Vector3(...p))) }));
  const ball = new THREE.SphereGeometry(1, 10, 8);
  const movers = flows.flatMap((f) => Array.from({ length: 10 }, (_, i) => {
    const m = pick(new THREE.Mesh(ball, M(f.color, { roughness: 0.3, emissive: f.color, emissiveIntensity: 0.7 })), f.card, f.label);
    m.scale.setScalar(3.4);
    root.add(m);
    return { m, f, u: i / 10 + rand() * 0.05 };
  }));
  let flow = 0;
  let stage = 0;
  function apply(v) {
    stage = v;
    faceGlow.emissiveIntensity = 0.5 * ramp(v, 0.7, 1.2) * (1 - ramp(v, 1.8, 2.3));
    for (const { m, f, u } of movers) {
      m.visible = f.from === 0 ? v < 1.9 : v >= f.from - 0.3;
      f.curve.getPointAt((u + flow) % 1, m.position);
    }
  }
  const { controls, update } = stagedControls({ stages: LIVER_STAGES, apply, reducedMotion, rate: 0.2, still: 3 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    frameWidth: 0.3,
    detailed: true,
    view: { target: [0, -20, 0], direction: [0.1, 0.12, 1] },
    focus: [at.x, at.y, at.z + 0.3],
    controls,
    update(dt) {
      update(dt);
      if (!reducedMotion) {
        flow = (flow + dt * 0.15) % 1;
        apply(stage);
      }
    },
    dispose() {
      ball.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
