// Tier 3: the heart, measured and opened. The heart wall, valves, coronary
// vessels and great vessels of one real adult (BodyParts3D, from the
// whole-body bundle): 1 scene unit = 1 cm.
//
// The heart is cut along the plane through its apex and its two
// atrioventricular valves (the "four-chamber view" of a heart scan), and the
// front part is taken away, so the four real chambers show. The chambers were
// found as the hollows inside the measured wall (tools/build_body_meshes.py,
// landmarks "heartChambers"), and the blood in them is drawn there: blue,
// oxygen-poor on the right, red, oxygen-rich on the left. The heart beats; the
// rate control changes how fast, and how much blood it pumps a minute.
import * as THREE from 'three/webgpu';
import { materialBank, pick, disposeTree, seeded, COLORS } from './kit.js';
import { heartbeatScale } from './body.js';
import { arterialSurge } from './bloodFlow.js';
import { cardiacOutput } from '../science/equations.js';
import { organFrame, partOf, partsWhere, cutAway, keepNear } from './organKit.js';
import LANDMARKS from '../data/bodyLandmarks.json';

export const STROKE_ML = 70; // pumped by each ventricle with each beat, at rest
export const RESTING_BPM = 72;

const CHAMBERS = [
  { key: 'rightAtrium', name: 'Right atrium', side: 'right', atrium: true, card: 'heart', text: 'collects oxygen-poor blood from the body' },
  { key: 'rightVentricle', name: 'Right ventricle', side: 'right', card: 'heart', text: 'pumps it to the lungs' },
  { key: 'leftAtrium', name: 'Left atrium', side: 'left', atrium: true, card: 'heart', text: 'collects oxygen-rich blood from the lungs' },
  { key: 'leftVentricle', name: 'Left ventricle', side: 'left', card: 'blood', text: 'pumps it out to the whole body' },
];

const sub = (a, b) => a.map((x, i) => x - b[i]);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => a.map((x) => x / Math.hypot(...a));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** The four-chamber plane: through the apex and the tricuspid and mitral valves, its normal toward the front. */
export function fourChamberPlane(H = LANDMARKS.heartChambers) {
  let n = unit(cross(sub(H.tricuspid, H.apex), sub(H.mitral, H.apex)));
  if (n[2] < 0) n = n.map((x) => -x);
  return { point: H.apex, normal: n };
}

/** The aortic valve: the middle of the lowest rim of the measured ascending aorta (meters). */
export function aorticRootOf(parts, H = LANDMARKS.heartChambers) {
  const aortaPart = partOf(parts, 'aorta', 'Aorta: Ascending aorta');
  if (!aortaPart) return H.chambers.leftVentricle.center;
  const a = aortaPart.geometry.attributes.position.array;
  let low = Infinity;
  for (let i = 1; i < a.length; i += 3) low = Math.min(low, a[i]);
  const near = [];
  for (let i = 0; i < a.length; i += 3) if (a[i + 1] < low + 0.004) near.push([a[i], a[i + 1], a[i + 2]]);
  return [0, 1, 2].map((k) => near.reduce((s, p) => s + p[k], 0) / near.length);
}

/** Build the measured heart scene, or null when the bundle is not loaded. */
export function buildMeasuredHeart(parts, { reducedMotion = false } = {}) {
  const wall = partOf(parts, 'heart', 'Heart');
  const H = LANDMARKS.heartChambers;
  if (!wall || !H) return null;
  const M = materialBank();
  const root = new THREE.Group();
  const { group, toScene } = organFrame(LANDMARKS.heart, 100);
  const heart = new THREE.Group(); // beats about the heart's center
  heart.add(group);
  root.add(heart);
  const rand = seeded(7272);
  const { point, normal } = fourChamberPlane(H);
  const behind = (p) => dot(sub(p, point), normal) <= 0;
  const add = (geometry, material, card, label) => group.add(pick(new THREE.Mesh(geometry, material), card, label));
  const cut = (geometry) => cutAway(geometry, point, normal);

  // The wall: its outer surface and the chamber linings, and its cut edge seen from inside.
  const wallGeo = cut(wall.geometry);
  add(wallGeo, M(0xc4566a, { roughness: 0.5, tissue: 'organ', natural: 0xb24a5c, repeat: [1, 1] }), 'heart', 'Heart wall (myocardium)');
  add(wallGeo, M(0x7e2c40, { roughness: 0.75, side: THREE.BackSide }), 'heart', 'Heart wall (myocardium, cut)');
  for (const v of partsWhere(parts, (p) => p.extras.card === 'heart-valves')) {
    add(cut(v.geometry), M(0xeadcc0, { roughness: 0.45, side: THREE.DoubleSide, tissue: 'fascia', repeat: [1, 1] }), 'heart-valves', v.extras.label);
  }
  for (const v of partsWhere(parts, (p) => p.extras.card === 'coronary-arteries')) {
    const vein = /vein/i.test(v.extras.label);
    add(cut(v.geometry), M(vein ? 0x6a5fc4 : 0xe06470, { roughness: 0.4, side: THREE.DoubleSide, tissue: vein ? 'vein' : 'vessel', repeat: [1, 1] }), 'coronary-arteries', v.extras.label);
  }
  const art = M(COLORS.artery, { roughness: 0.4, side: THREE.DoubleSide, tissue: 'vessel', repeat: [1, 1] });
  const vein = M(COLORS.vein, { roughness: 0.4, side: THREE.DoubleSide, tissue: 'vein', repeat: [1, 1] });
  for (const v of partsWhere(parts, (p) => p.extras.card === 'aorta' && /Ascending|Arch/.test(p.extras.label))) add(cut(v.geometry), art, 'aorta', v.extras.label);
  for (const [label, mat, text] of [
    ['Superior vena cava', vein, 'Superior vena cava (blood from the head and arms)'],
    ['Inferior vena cava', vein, 'Inferior vena cava (blood from the lower body)'],
    ['Pulmonary artery', vein, 'Pulmonary artery (oxygen-poor blood to the lungs)'],
    ['Pulmonary vein', art, 'Pulmonary vein (oxygen-rich blood from the lungs)'],
  ]) {
    const v = partOf(parts, 'great-vessels', label);
    if (v) add(cut(keepNear(v.geometry, LANDMARKS.heart, 0.055)), mat, 'great-vessels', text);
  }

  // Blood in each chamber, behind the cut: blobs that squeeze toward the chamber's middle as it contracts.
  const blob = new THREE.SphereGeometry(1, 10, 8);
  const pools = CHAMBERS.map((c) => {
    const m = H.chambers[c.key];
    const pts = m.points.filter(behind).map(toScene);
    const center = new THREE.Vector3(...pts.reduce((s, p) => s.map((x, i) => x + p[i]), [0, 0, 0]).map((x) => x / pts.length));
    const color = c.side === 'right' ? COLORS.vein : COLORS.artery;
    const mesh = new THREE.InstancedMesh(blob, M(color, { roughness: 0.3, transparent: true, opacity: 0.45, emissive: color, emissiveIntensity: 0.15 }), pts.length);
    pick(mesh, c.card, `${c.name}: ${c.text} (about ${m.volumeMl} mL in this heart)`);
    root.add(mesh);
    const sizes = pts.map(() => 0.2 + rand() * 0.1);
    return { c, mesh, pts: pts.map((p) => new THREE.Vector3(...p)), sizes, center };
  });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s3 = new THREE.Vector3();
  const at = new THREE.Vector3();
  function placePools(phase) {
    const squeeze = Math.exp(-(((phase - 0.18) / 0.07) ** 2)); // ventricles contract (as heartbeatScale)
    const kick = Math.exp(-(((phase - 0.02) / 0.04) ** 2)); // atria contract just before
    for (const { c, mesh, pts, sizes, center } of pools) {
      const k = c.atrium ? 1 - 0.12 * kick + 0.06 * squeeze : 1 - 0.22 * squeeze;
      pts.forEach((p, i) => {
        at.copy(p).sub(center).multiplyScalar(k).add(center);
        mesh.setMatrixAt(i, m4.compose(at, q, s3.setScalar(sizes[i])));
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // Blood moving through: in from the veins, through each atrium and valve, out of each ventricle.
  const flow = (name) => LANDMARKS.flow.find((r) => r.name === name)?.points ?? [];
  const aorticRoot = aorticRootOf(parts, H);
  const ch = (k) => H.chambers[k].center;
  const outOf = (from, to, d) => to.map((x, i) => x + unit(sub(to, from))[i] * d);
  const routes = [
    { color: 0x7a9ae8, label: 'Oxygen-poor blood: body → right atrium → right ventricle → lungs', pts: [...flow('superior vena cava').slice(-2), ch('rightAtrium'), H.tricuspid, ch('rightVentricle'), H.pulmonaryValve, outOf(ch('rightVentricle'), H.pulmonaryValve, 0.02)] },
    { color: 0xff6a6a, label: 'Oxygen-rich blood: lungs → left atrium → left ventricle → body', pts: [outOf(ch('leftVentricle'), ch('leftAtrium'), 0.02), ch('leftAtrium'), H.mitral, ch('leftVentricle'), aorticRoot, ...flow('ascending aorta').slice(1)] },
  ].map((r) => ({ ...r, curve: new THREE.CatmullRomCurve3(r.pts.map((p) => new THREE.Vector3(...toScene(p)))) }));
  const dot3 = new THREE.SphereGeometry(0.16, 10, 8);
  const cells = routes.flatMap((r) => {
    const mat = M(r.color, { roughness: 0.3, emissive: r.color, emissiveIntensity: 0.8 });
    return Array.from({ length: 36 }, (_, i) => {
      const m = pick(new THREE.Mesh(dot3, mat), 'blood', r.label);
      root.add(m);
      return { m, r, u: i / 36 + rand() * 0.02 };
    });
  });
  const placeCells = () => cells.forEach(({ m, r, u }) => r.curve.getPointAt(u % 1, m.position));

  // The heart rate control.
  let rate = RESTING_BPM;
  let phase = 0.5;
  const controls = {
    label: 'Heart rate',
    unit: '',
    min: 40,
    max: 180,
    step: 1,
    value: RESTING_BPM,
    format: (v) => `${Math.round(v)} beats a minute`,
    presets: [
      { label: 'Asleep', value: 55 },
      { label: 'Resting', value: RESTING_BPM },
      { label: 'Walking', value: 100 },
      { label: 'Running', value: 150 },
    ],
    set(v) {
      controls.value = v;
      rate = v;
      const out = cardiacOutput(STROKE_ML, v).toFixed(1);
      const when = v < 64 ? 'Asleep, the heart slows.' : v < 90 ? 'At rest.' : 'Exercising muscles need more oxygen, so the heart speeds up.';
      return `${when} At ${Math.round(v)} beats a minute, each ventricle pushing out about ${STROKE_ML} mL a beat, the heart pumps about ${out} L of blood a minute${v >= 90 ? ' (in exercise each beat also pushes out more, so even more)' : ''}: the right side to the lungs, the left side to the whole body.`;
    },
  };
  controls.set(RESTING_BPM);

  // Center the beat on the heart: the group already sits around the measured center.
  placePools(phase);
  placeCells();
  const lv = pools.find((p) => p.c.key === 'leftVentricle');

  return {
    root,
    fit: 'both',
    metersPerUnit: 0.01,
    frameWidth: 0.16,
    detailed: true,
    view: { target: [0, 0, 0], direction: normal },
    focus: lv.center.toArray(),
    controls,
    update(dt) {
      if (reducedMotion) return;
      const beats = (dt * rate) / 60;
      phase = (phase + beats) % 1;
      heart.scale.setScalar(heartbeatScale(phase));
      placePools(phase);
      for (const c of cells) c.u = (c.u + beats * 0.12 * arterialSurge(phase)) % 1;
      placeCells();
    },
    dispose() {
      blob.dispose();
      dot3.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
