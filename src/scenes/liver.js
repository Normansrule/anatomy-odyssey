// Tier 3: the liver, seen from the front. 1 scene unit = 1 mm.
// The body's largest gland, about 1.4 kg (three pounds): a large right lobe
// and a smaller left lobe split by the falciform ligament, the gallbladder
// (8–10 cm) beneath. At the porta hepatis the hepatic portal vein (nutrient-
// rich blood from the gut) and the hepatic artery enter, and bile ducts
// leave; hepatic veins drain into the inferior vena cava (OpenStax 23.6).
// The front of the right lobe is cut away to show its lobules, drawn about
// six times larger than life (real ones are about a millimeter across).
// The stage control follows blood in, blood out and bile out.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, ellipsoid, seeded, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const LIVER_KG = 1.4;
export const GALLBLADDER_MM = 90;
const RIGHT = { at: [-58, 0, 0], r: [82, 78, 72] };
const CUT_Z = 34; // the front of the right lobe is cut away at this depth
export const LOBULE_DRAWN_MM = 6;

export const LIVER_STAGES = [
  { label: 'Blood in', text: 'Blood in. The hepatic portal vein brings blood from the stomach and intestines, full of absorbed nutrients; the smaller hepatic artery brings oxygen-rich blood from the heart. Both enter at the porta hepatis.' },
  { label: 'Through the lobules', text: 'Through the lobules. Inside, both bloods mix and trickle through the lobules past the liver cells, which take up nutrients, store glucose as glycogen and break down toxins and old blood cells.' },
  { label: 'Blood out', text: 'Blood out. Cleaned blood collects in the central veins of the lobules and leaves through the hepatic veins into the inferior vena cava, back to the heart.' },
  { label: 'Bile out', text: 'Bile out. Liver cells make about a liter of bile a day. It drains through the bile ducts; between meals much of it is stored and concentrated in the gallbladder, then squeezed into the duodenum to help digest fat.' },
];

export function buildLiver({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2323);
  const liverMat = M(0x8a3a32, { roughness: 0.4, tissue: 'organ', natural: 0x7e342c });

  // Right lobe: an ellipsoid with its front flattened onto the cut plane.
  const rg = new THREE.SphereGeometry(1, 64, 48);
  const rp = rg.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const x = rp.getX(i) * RIGHT.r[0];
    const y = rp.getY(i) * RIGHT.r[1] * (1 - 0.25 * Math.max(0, -rp.getY(i))); // flatter underneath
    const z = Math.min(CUT_Z, rp.getZ(i) * RIGHT.r[2]);
    rp.setXYZ(i, RIGHT.at[0] + x, RIGHT.at[1] + y - Math.max(0, rp.getX(i)) * 18, RIGHT.at[2] + z);
  }
  rg.computeVertexNormals();
  root.add(pick(new THREE.Mesh(rg, liverMat), 'liver', 'Right lobe of the liver'));
  const left = ellipsoid([52, 12, 10], [78, 34, 38], liverMat, 40);
  left.rotation.z = -0.18;
  root.add(pick(left, 'liver', 'Left lobe of the liver'));
  root.add(pick(tubeThrough([[16, 52, 30], [18, 30, 46], [14, 0, 48], [8, -30, 40]], 1.8, M(0xe8d0c0, { roughness: 0.5 }), 24, 8), 'liver', 'Falciform ligament (divides right and left lobes)'));

  // Cut face with lobules (hexagons, drawn larger), each with a central vein and portal triads at its corners.
  const t = CUT_Z / RIGHT.r[2];
  const ax = RIGHT.r[0] * Math.sqrt(1 - t * t);
  const ay = RIGHT.r[1] * Math.sqrt(1 - t * t);
  const face = new THREE.Shape();
  face.absellipse(RIGHT.at[0], RIGHT.at[1], ax * 0.985, ay * 0.985, 0, Math.PI * 2);
  const faceMesh = new THREE.Mesh(new THREE.ShapeGeometry(face, 48), M(0x9c4a3e, { roughness: 0.6, tissue: 'organ', natural: 0x8e4238, repeat: [0.04, 0.04] }));
  faceMesh.position.z = CUT_Z + 0.1;
  root.add(pick(faceMesh, 'liver', 'Cut surface of the liver'));
  const L = LOBULE_DRAWN_MM;
  const hexRing = new THREE.RingGeometry(L - 0.35, L, 6);
  const dot = new THREE.CircleGeometry(1, 12);
  const centers = [];
  for (let row = -12; row <= 12; row++) {
    for (let col = -18; col <= 18; col++) {
      const x = RIGHT.at[0] + col * L * 1.5;
      const y = RIGHT.at[1] + row * L * Math.sqrt(3) + (col % 2 ? (L * Math.sqrt(3)) / 2 : 0);
      if (((x - RIGHT.at[0]) / (ax - L)) ** 2 + ((y - RIGHT.at[1]) / (ay - L)) ** 2 < 1) centers.push([x, y]);
    }
  }
  const hexes = new THREE.InstancedMesh(hexRing, M(0xd8a090, { roughness: 0.6 }), centers.length);
  const veins = new THREE.InstancedMesh(dot, M(COLORS.vein, { roughness: 0.5 }), centers.length);
  const triads = new THREE.InstancedMesh(dot, M(0x7cb07a, { roughness: 0.5 }), centers.length * 2);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  centers.forEach(([x, y], i) => {
    hexes.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, CUT_Z + 0.2), q, new THREE.Vector3(1, 1, 1)));
    veins.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, CUT_Z + 0.25), q, new THREE.Vector3(0.9, 0.9, 1)));
    for (const [k, a] of [[0, 0], [1, Math.PI / 3]]) triads.setMatrixAt(i * 2 + k, m4.compose(new THREE.Vector3(x + Math.cos(a) * L, y + Math.sin(a) * L, CUT_Z + 0.25), q, new THREE.Vector3(0.75, 0.75, 1)));
  });
  root.add(pick(hexes, 'hepatic-lobule', 'Hepatic lobule (drawn about six times larger)'));
  root.add(pick(veins, 'hepatic-lobule', 'Central vein of a lobule'));
  root.add(pick(triads, 'hepatic-lobule', 'Portal triad at a lobule corner'));

  // Gallbladder and bile ducts; vessels at the porta hepatis; inferior vena cava and hepatic veins behind.
  const gb = ellipsoid([-30, -78, 30], [17, 45, 17], M(0x6f9a3f, { roughness: 0.3, transparent: true, opacity: 0.9 }), 28);
  gb.rotation.z = -0.35;
  root.add(pick(gb, 'gallbladder', 'Gallbladder (stores and concentrates bile)'));
  const bileMat = M(0x7cb07a, { roughness: 0.4 });
  const bilePts = {
    hepatic: [[-12, -30, 12], [0, -48, 16], [6, -62, 18]],
    cystic: [[-22, -46, 26], [-6, -56, 22], [6, -62, 18]],
    common: [[6, -62, 18], [12, -100, 16], [16, -140, 12]],
  };
  root.add(pick(tubeThrough(bilePts.hepatic, 3, bileMat, 24, 8), 'gallbladder', 'Common hepatic duct (bile leaving the liver)'));
  root.add(pick(tubeThrough(bilePts.cystic, 2.4, bileMat, 24, 8), 'gallbladder', 'Cystic duct (to and from the gallbladder)'));
  root.add(pick(tubeThrough(bilePts.common, 3.4, bileMat, 24, 8), 'gallbladder', 'Common bile duct (to the duodenum)'));
  const portal = [[30, -150, -6], [22, -90, 0], [8, -40, 4], [-8, -18, 4]];
  root.add(pick(tubeThrough(portal, 7, M(0x7a5aa8, { roughness: 0.4, tissue: 'vein' }), 32, 12), 'liver-vessels', 'Hepatic portal vein (blood from the gut)'));
  const artery = [[60, -150, 8], [40, -90, 10], [16, -42, 12], [-4, -20, 14]];
  root.add(pick(tubeThrough(artery, 2.6, M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' }), 32, 10), 'liver-vessels', 'Hepatic artery (oxygen-rich blood from the heart)'));
  const ivc = [[24, -160, -60], [22, -40, -60], [20, 60, -58], [18, 160, -56]];
  root.add(pick(tubeThrough(ivc, 12, M(COLORS.vein, { roughness: 0.45, tissue: 'vein' }), 32, 16), 'liver-vessels', 'Inferior vena cava'));
  const hv = [
    [[-60, 30, -30], [-20, 50, -50], [16, 60, -58]],
    [[0, 40, -25], [12, 54, -50], [19, 62, -58]],
    [[50, 25, -20], [32, 50, -48], [21, 62, -58]],
  ];
  for (const p of hv) root.add(pick(tubeThrough(p, 5, M(COLORS.vein, { roughness: 0.45, tissue: 'vein' }), 24, 10), 'liver-vessels', 'Hepatic vein (to the inferior vena cava)'));

  // Flowing dots for each stage.
  const flows = [
    { pts: portal, color: 0xb08ad8, from: 0, card: 'liver-vessels', label: 'Blood from the gut' },
    { pts: artery, color: 0xff6a6a, from: 0, card: 'liver-vessels', label: 'Blood from the heart' },
    ...hv.map((p) => ({ pts: p, color: 0x7a9ae8, from: 2, card: 'liver-vessels', label: 'Blood leaving the liver' })),
    { pts: [...bilePts.hepatic, ...bilePts.common.slice(1)], color: 0xb0e07a, from: 3, card: 'gallbladder', label: 'Bile' },
    { pts: bilePts.cystic.slice().reverse(), color: 0xb0e07a, from: 3, card: 'gallbladder', label: 'Bile stored in the gallbladder' },
  ].map((f) => ({ ...f, curve: new THREE.CatmullRomCurve3(f.pts.map((p) => new THREE.Vector3(...p))) }));
  const ball = new THREE.SphereGeometry(1, 10, 8);
  const movers = flows.flatMap((f) => Array.from({ length: 10 }, (_, i) => {
    const m = pick(new THREE.Mesh(ball, M(f.color, { roughness: 0.3, emissive: f.color, emissiveIntensity: 0.7 })), f.card, f.label);
    m.scale.setScalar(2.2);
    root.add(m);
    return { m, f, u: i / 10 + rand() * 0.05 };
  }));
  const faceGlow = M(0xd8a090, { roughness: 0.6, emissive: 0xffb090, emissiveIntensity: 0 });
  hexes.material = faceGlow;
  let flow = 0;
  let stage = 0;
  function apply(v) {
    stage = v;
    faceGlow.emissiveIntensity = 0.5 * ramp(v, 0.7, 1.2) * (1 - ramp(v, 1.8, 2.3));
    for (const { m, f, u } of movers) {
      const on = f.from === 0 ? v < 1.9 : v >= f.from - 0.3;
      m.visible = on;
      f.curve.getPointAt((u + flow) % 1, m.position);
    }
  }
  const { controls, update } = stagedControls({ stages: LIVER_STAGES, apply, reducedMotion, rate: 0.2, still: 3 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-3,
    frameWidth: 0.3,
    view: { target: [0, -20, 0], direction: [0.1, 0.12, 1] },
    focus: [centers[Math.floor(centers.length / 2)][0], centers[Math.floor(centers.length / 2)][1], CUT_Z + 0.3],
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
