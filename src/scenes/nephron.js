// Tier 4: one nephron, the kidney's filtering unit. 1 scene unit = 10 µm.
// The renal corpuscle (a knot of capillaries, the glomerulus, inside
// Bowman's capsule) sits in the cortex; the tubule winds near it (proximal
// convoluted tubule), dips into the medulla and back (the loop of Henle),
// winds again (distal convoluted tubule), touches its own corpuscle (the
// juxtaglomerular apparatus) and drains into a collecting duct shared with
// other nephrons. The loop is drawn shorter than many real loops, and the
// tubes are drawn see-through so the fluid inside shows.
// The stage control follows the filtrate: of about 180 liters filtered a day,
// 1 to 2 liters leave as urine (OpenStax 25.5, 25.6).
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, taperedTube, seeded, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const CORPUSCLE = { center: [-50, 70, 0], radius: 10 }; // about 0.2 mm across
export const FILTERED_L_PER_DAY = 180;
export const URINE_L_PER_DAY = [1, 2];
export const PCT_REABSORBS = 0.67;

export const FILTRATE_STAGES = [
  { label: 'Filter', text: 'Filter. Blood pressure in the glomerulus pushes water and small molecules out of the capillaries into Bowman’s capsule. Both kidneys together make about 180 liters of this filtrate a day (adult male average).' },
  { label: 'Proximal tubule', text: 'Proximal tubule. Its brush-bordered cells take back about two thirds of the water, sodium and potassium, and almost all the glucose and amino acids, into the capillaries around it.' },
  { label: 'Loop of Henle', text: 'Loop of Henle. Water leaves the descending limb; the ascending limb, which water cannot cross, pumps salt out. This makes the deep medulla salty, which later lets the kidney make concentrated urine.' },
  { label: 'Distal tubule', text: 'Distal tubule. Fine tuning: the hormone aldosterone (from the adrenal gland) makes these cells take back more sodium, and water follows.' },
  { label: 'Collecting duct', text: 'Collecting duct. Antidiuretic hormone (ADH) opens water channels here, drawing water back into the salty medulla. About 99 percent of the filtrate is returned to the blood; only 1 to 2 liters a day leave as urine.' },
];

// The tubule, as a chain of segments (scene units). Each ends where the next begins.
const C = new THREE.Vector3(...CORPUSCLE.center);
const SEGMENTS = [
  { id: 'proximal-tubule', label: 'Proximal convoluted tubule (brush border; reclaims most)', r: () => 2.6, pts: [[-50, 61, 0], [-46, 52, 4], [-58, 46, 8], [-70, 50, 2], [-75, 40, -6], [-63, 33, -10], [-48, 38, -4], [-36, 47, 4], [-27, 38, 10], [-33, 28, 4], [-21, 23, -4], [-11, 16, 0]] },
  { id: 'loop-of-henle', label: 'Loop of Henle (dips into the medulla and back)', r: (t) => (t < 0.12 ? 2.2 - t * 8 : t > 0.78 ? 1.2 + ramp(t, 0.78, 0.86) * 0.7 : 1.2), pts: [[-11, 16, 0], [-10, 0, 0], [-10, -90, 0], [-10, -146, 0], [-6, -156, 0], [2, -156, 0], [6, -146, 0], [6, -90, 0], [6, -20, 0], [5, 20, 0], [-6, 46, -4], [-24, 66, -6], [-38, 80, -6]] },
  { id: 'distal-tubule', label: 'Distal convoluted tubule (fine tuning)', r: () => 2.1, pts: [[-38, 80, -6], [-30, 90, -4], [-20, 97, 6], [-8, 90, 10], [0, 99, 2], [10, 92, -6], [19, 100, -2], [29, 93, 4], [39, 99, 0], [49, 96, 0], [56, 104, 0]] },
  { id: 'collecting-duct', label: 'Collecting duct (shared by several nephrons)', r: (t) => 3 + t * 1.6, pts: [[56, 104, 0], [57, 60, 0], [57, 0, 0], [57, -90, 0], [57, -170, 0]] },
];
// How much of the filtrate is still in the tubule at the end of each segment
// (drawn with a floor so the last stretch is not empty: really about 1%).
const LEFT = [1 - PCT_REABSORBS, 0.2, 0.15, 0.07];

export function buildNephron({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2526);

  // Background: cortex above, medulla below (the boundary at y = 0).
  const panel = (y0, y1, color, card, label) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(320, y1 - y0), M(color, { roughness: 0.9 }));
    m.position.set(0, (y0 + y1) / 2, -30);
    m.userData.pickPriority = -1;
    root.add(pick(m, card, label));
  };
  panel(0, 132, 0x5a2a2c, 'renal-cortex', 'Renal cortex (corpuscles and the winding tubules)');
  panel(-182, 0, 0x45202a, 'renal-pyramid', 'Renal medulla (the loops and ducts, in a pyramid)');

  // Renal corpuscle: Bowman's capsule, opened toward the viewer, around the glomerulus.
  const capsule = new THREE.Mesh(
    new THREE.SphereGeometry(CORPUSCLE.radius, 40, 30, Math.PI / 2 + 1, Math.PI * 2 - 2),
    M(0xe7c9b8, { roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  capsule.position.copy(C);
  root.add(pick(capsule, 'glomerular-capsule', 'Bowman’s capsule (catches the filtrate)'));
  const glomMat = M(COLORS.artery, { roughness: 0.4, emissive: 0xc0303a, emissiveIntensity: 0 });
  const glom = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const pts = [[-1.2, 9, 0]];
    let p = new THREE.Vector3(-1, 6, 0);
    for (let k = 0; k < 6; k++) {
      p = p.add(new THREE.Vector3((rand() - 0.5) * 7, (rand() - 0.62) * 5, (rand() - 0.5) * 7)).clampLength(0, 7);
      pts.push(p.toArray());
    }
    pts.push([1.2, 9, 0]);
    const loop = tubeThrough(pts, 0.75, glomMat, 40, 6);
    glom.add(pick(loop, 'glomerulus', 'Glomerulus (a knot of filtering capillaries)'));
  }
  glom.position.copy(C);
  root.add(glom);

  // Arterioles at the vascular pole, and the juxtaglomerular apparatus where the distal tubule touches them.
  const art = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' });
  const vein = M(COLORS.vein, { roughness: 0.45 });
  root.add(pick(tubeThrough([[-110, 0, -8], [-110, 60, -8], [-108, 112, -8]], 3, art, 24, 10), 'kidney', 'Small artery climbing from the arcuate arch'));
  root.add(pick(tubeThrough([[-108, 92, -8], [-80, 92, -5], [-60, 86, -2], [-52, 79, -1]], 1.9, art, 32, 8), 'afferent-arteriole', 'Afferent arteriole (blood in)'));
  root.add(pick(tubeThrough([[-48, 79, 1], [-44, 90, 4], [-36, 104, 6], [-26, 110, 4]], 1.4, art, 32, 8), 'afferent-arteriole', 'Efferent arteriole (blood out, narrower)'));
  const jga = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), M(0xe8c45a, { roughness: 0.5, emissive: 0xe8c45a, emissiveIntensity: 0.25 }));
  jga.position.set(-42, 82, -5);
  root.add(pick(jga, 'juxtaglomerular-apparatus', 'Juxtaglomerular apparatus (the tubule checks its own filtrate)'));

  // Capillaries around the tubules (from the efferent arteriole), and the vasa recta beside the loop.
  const capMat = M(0xc44a55, { roughness: 0.5 });
  for (let i = 0; i < 9; i++) {
    const pts = [];
    let p = new THREE.Vector3(-26 + (rand() - 0.5) * 20, 108 - rand() * 6, 6);
    for (let k = 0; k < 7; k++) {
      pts.push(p.toArray());
      p = p.clone().add(new THREE.Vector3((rand() - 0.6) * 26, -6 - rand() * 12, (rand() - 0.5) * 14));
      p.x = Math.max(-82, Math.min(46, p.x));
      p.y = Math.max(14, p.y);
      p.z = Math.max(-14, Math.min(14, p.z));
    }
    root.add(pick(tubeThrough(pts, 0.55, capMat, 40, 5), 'peritubular-capillaries', 'Capillary around the tubules (takes back what is reclaimed)'));
  }
  for (const [x, depth] of [[-18, -130], [-2, -118], [14, -136], [30, -124]]) {
    const pts = [[x - 2, 30, -6], [x - 2, 0, -6], [x - 2, depth, -6], [x, depth - 6, -6], [x + 2, depth, -6], [x + 2, 0, -6], [x + 2, 30, -6]];
    root.add(pick(tubeThrough(pts, 0.6, x < 6 ? capMat : M(COLORS.vein, { roughness: 0.5 }), 60, 5), 'peritubular-capillaries', 'Vasa recta (straight capillaries beside the loop)'));
  }
  root.add(pick(tubeThrough([[-26, 110, 4], [20, 112, -4], [80, 112, -10], [112, 100, -12], [112, 0, -12]], 2.6, vein, 32, 8), 'kidney', 'Small vein draining back toward the renal vein'));

  // The tubule itself, see-through, segment by segment.
  const path = new THREE.CurvePath();
  const segMeshes = [];
  for (const seg of SEGMENTS) {
    const mat = M(seg.id === 'collecting-duct' ? 0xd9c27a : 0xe8d8a8, { roughness: 0.5, transparent: true, opacity: 0.5, depthWrite: false, emissive: 0xffe9a0, emissiveIntensity: 0 });
    const mesh = taperedTube(seg.pts, seg.r, mat, seg.pts.length * 14, 12);
    root.add(pick(mesh, seg.id, seg.label));
    segMeshes.push(mesh);
    path.add(new THREE.CatmullRomCurve3(seg.pts.map((p) => new THREE.Vector3(...p))));
  }
  // Other nephrons' tubules joining the same collecting duct.
  for (const y of [70, 30, -10]) {
    root.add(pick(tubeThrough([[90, y + 18, 6], [72, y + 6, 4], [59, y, 0]], 1.9, M(0xe8d8a8, { roughness: 0.5, transparent: true, opacity: 0.45, depthWrite: false }), 16, 8), 'collecting-duct', 'Another nephron draining into the same duct'));
  }
  const lengths = path.getCurveLengths();
  const total = lengths.at(-1);
  const ends = lengths.map((l) => l / total); // where each segment ends, 0 to 1 along the path

  // Filtrate: dots flowing through the tubule. Each has a keep threshold, so
  // fewer and fewer remain as water and salt are reclaimed along the way.
  const N = 520;
  const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), M(0xffe28a, { roughness: 0.3, emissive: 0xffd36a, emissiveIntensity: 0.8 }), N);
  root.add(pick(dots, 'nephron', 'Filtrate (fewer dots = less fluid left in the tubule)'));
  const seeds = Array.from({ length: N }, () => ({ u: rand(), keep: rand(), off: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(1.4) }));
  const left = (s) => {
    let prevEnd = 0;
    let prevLeft = 1;
    for (let k = 0; k < ends.length; k++) {
      if (s <= ends[k]) return prevLeft + (LEFT[k] - prevLeft) * ((s - prevEnd) / (ends[k] - prevEnd));
      prevEnd = ends[k];
      prevLeft = LEFT[k];
    }
    return LEFT.at(-1);
  };
  const frontAt = (v) => {
    const marks = [0.012, ...ends];
    const i = Math.min(marks.length - 2, Math.floor(v));
    return marks[i] + (marks[i + 1] - marks[i]) * Math.min(1, v - i);
  };
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3();
  const at = new THREE.Vector3();
  let flow = 0;
  let stageV = 0;
  function placeDots() {
    const front = frontAt(stageV);
    seeds.forEach((d, i) => {
      const s = (d.u + flow) % 1;
      const show = s <= front && d.keep < left(s);
      path.getPointAt(Math.min(0.9999, s), at).add(d.off);
      one.setScalar(show ? 0.85 : 0.0001);
      m4.compose(at, q, one);
      dots.setMatrixAt(i, m4);
    });
    dots.instanceMatrix.needsUpdate = true;
  }

  function apply(v) {
    stageV = v;
    glomMat.emissiveIntensity = 0.6 * (1 - ramp(v, 0.4, 1));
    segMeshes.forEach((m, k) => {
      const on = Math.max(0, 1 - Math.abs(v - (k + 1)));
      m.material.emissiveIntensity = 0.35 * on;
    });
    placeDots();
  }
  // Only the proximal tubule's share is a measured figure (OpenStax 25.6); the
  // dots after it thin out schematically.
  const readout = (v, stage) => FILTRATE_STAGES[stage].text + (stage === 1 ? ` About ${Math.round((1 - PCT_REABSORBS) * 100)} percent of the filtrate is left as it reaches the loop.` : '');
  const { controls, update: step } = stagedControls({ stages: FILTRATE_STAGES, apply, readout, reducedMotion, rate: 0.22, still: 4 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-5,
    frameWidth: 3e-3,
    view: { target: [-10, -24, 0], direction: [0.12, 0.08, 1] },
    focus: CORPUSCLE.center,
    controls,
    update(dt) {
      step(dt);
      if (!reducedMotion) {
        flow = (flow + dt * 0.03) % 1;
        placeDots();
      }
    },
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
