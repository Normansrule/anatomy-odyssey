// Tier 4: one hepatic lobule, cut across. 1 scene unit = 10 µm.
// A roughly hexagonal column about a millimeter across. Plates of liver
// cells (hepatic laminae) radiate from the central vein; between them run
// the sinusoids, where blood from the portal triads at the corners trickles
// toward the centre. Each triad holds a branch of the hepatic portal vein,
// a branch of the hepatic artery and a bile duct (OpenStax 23.6). Bile flows
// the other way, outward along the plates to the bile ducts.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, seeded, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const LOBULE = { radius: 55, depth: 36, cell: 2.4, plates: 24 };
const R = LOBULE.radius;
const H = LOBULE.depth / 2;
const corners = Array.from({ length: 6 }, (_, k) => new THREE.Vector3(Math.cos((k * Math.PI) / 3) * R, Math.sin((k * Math.PI) / 3) * R, 0));
/** Distance from the centre to the hexagon's edge in direction a. */
export const hexEdge = (a) => (R * Math.cos(Math.PI / 6)) / Math.cos(((a % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6);

export const LOBULE_STAGES = [
  { label: 'Portal triads', text: 'At each corner of the lobule, a portal triad: a branch of the hepatic portal vein (purple) and of the hepatic artery (red) bring blood in, and a bile duct (green) carries bile out.' },
  { label: 'Sinusoids', text: 'Blood from both vessels mixes in the sinusoids, porous capillaries between the plates of liver cells, and trickles toward the centre. Kupffer cells in the sinusoids remove old blood cells.' },
  { label: 'Central vein', text: 'The blood collects in the central vein and leaves the liver through the hepatic veins.' },
  { label: 'Bile', text: 'Bile flows the opposite way: liver cells secrete it into tiny canaliculi between them, and it runs outward to the bile ducts at the corners.' },
];

export function buildLobule({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2424);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const box = new THREE.BoxGeometry(1, 1, 1);
  const ball = new THREE.SphereGeometry(1, 10, 8);

  // Blood-filled core, so the gaps between plates read as sinusoids.
  const hex = new THREE.Shape();
  corners.forEach((c, i) => (i ? hex.lineTo(c.x, c.y) : hex.moveTo(c.x, c.y)));
  hex.closePath();
  const blood = new THREE.Mesh(new THREE.ExtrudeGeometry(hex, { depth: LOBULE.depth - 0.6, bevelEnabled: false }), M(0x8a2a34, { roughness: 0.6 }));
  blood.position.z = -H;
  root.add(pick(blood, 'sinusoid', 'Sinusoids (blood between the plates)'));

  // Plates of hepatocytes radiating from the centre.
  const cells = [];
  for (let p = 0; p < LOBULE.plates; p++) {
    const a = (p / LOBULE.plates) * Math.PI * 2 + (rand() - 0.5) * 0.05;
    const reach = hexEdge(a + Math.PI * 2) - 1.4;
    for (let r = 4.2; r < reach; r += LOBULE.cell * 1.02) {
      const wig = Math.sin(r * 0.35 + p) * 0.06;
      for (let z = -H + 1.2; z < H; z += LOBULE.cell * 1.02) cells.push({ x: Math.cos(a + wig) * r, y: Math.sin(a + wig) * r, z, a: a + wig });
    }
  }
  const hep = new THREE.InstancedMesh(box, M(0xc8806a, { roughness: 0.55, tissue: 'organ', natural: 0xb87262 }), cells.length);
  cells.forEach((c, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), c.a);
    hep.setMatrixAt(i, m4.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(LOBULE.cell * 0.98, LOBULE.cell * 0.98, LOBULE.cell * 0.98)));
  });
  root.add(pick(hep, 'hepatocyte', 'Hepatocyte (liver cell), in a plate one cell thick'));
  q.identity();

  // Central vein.
  const cv = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, LOBULE.depth + 1, 24, 1, true), M(COLORS.vein, { roughness: 0.45, side: THREE.DoubleSide }));
  cv.rotation.x = Math.PI / 2;
  root.add(pick(cv, 'central-vein', 'Central vein'));
  root.add(pick(ellipsoid([0, 0, H + 0.1], [3, 3, 0.1], M(0x2a2050, { roughness: 0.6 }), 20), 'central-vein', 'Central vein (blood leaves here)'));

  // Portal triads at the corners.
  const ct = M(0xe8dcc8, { roughness: 0.6 });
  const pv = M(0x7a5aa8, { roughness: 0.45 });
  const ha = M(COLORS.artery, { roughness: 0.45 });
  const bd = M(0x7cb07a, { roughness: 0.45 });
  const cyl = (r, mat) => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, LOBULE.depth + 1.4, 18), mat);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  corners.forEach((c) => {
    const pad = ellipsoid([c.x, c.y, 0], [6.5, 6.5, H + 0.3], ct, 20);
    root.add(pick(pad, 'portal-triad', 'Connective tissue of a portal triad'));
    const out = c.clone().normalize();
    const side = new THREE.Vector3(-out.y, out.x, 0);
    const v = cyl(2.6, pv);
    v.position.copy(c).addScaledVector(side, -1.8);
    root.add(pick(v, 'portal-triad', 'Branch of the hepatic portal vein'));
    const a = cyl(1, ha);
    a.position.copy(c).addScaledVector(side, 2).addScaledVector(out, 1.5);
    root.add(pick(a, 'portal-triad', 'Branch of the hepatic artery'));
    const b = cyl(1.2, bd);
    b.position.copy(c).addScaledVector(side, 2).addScaledVector(out, -1.8);
    root.add(pick(b, 'portal-triad', 'Bile duct'));
  });

  // Kupffer cells in the sinusoids.
  for (let i = 0; i < 26; i++) {
    const a = rand() * Math.PI * 2 + Math.PI / LOBULE.plates;
    const r = 8 + rand() * (hexEdge(a + Math.PI * 2) - 14);
    root.add(pick(ellipsoid([Math.cos(a) * r, Math.sin(a) * r, H - 0.3], [1, 1, 0.5], M(0x6a4a9a, { roughness: 0.4 }), 10), 'kupffer-cell', 'Kupffer cell (clears old blood cells)'));
  }

  // Neighboring lobules (outlines and central veins) for context.
  for (let k = 0; k < 6; k++) {
    const a = Math.PI / 6 + (k * Math.PI) / 3;
    const c = new THREE.Vector3(Math.cos(a), Math.sin(a), 0).multiplyScalar(2 * R * Math.cos(Math.PI / 6));
    const n = new THREE.Mesh(new THREE.ExtrudeGeometry(hex, { depth: LOBULE.depth - 2, bevelEnabled: false }), M(0xa86a5a, { roughness: 0.7, transparent: true, opacity: 0.35, depthWrite: false }));
    n.position.set(c.x, c.y, -H + 0.5);
    root.add(pick(n, 'hepatic-lobule', 'Neighboring lobule'));
  }

  // Flows: blood inward between the plates, bile outward along them.
  const flows = [];
  for (let i = 0; i < 70; i++) {
    const k = i % 6;
    const gapA = Math.floor(rand() * LOBULE.plates) / LOBULE.plates * Math.PI * 2 + Math.PI / LOBULE.plates;
    const start = corners[k].clone().lerp(new THREE.Vector3(Math.cos(gapA) * hexEdge(gapA + Math.PI * 2), Math.sin(gapA) * hexEdge(gapA + Math.PI * 2), 0), 0.75);
    const end = new THREE.Vector3(Math.cos(gapA) * 3.4, Math.sin(gapA) * 3.4, 0);
    const blood = i % 2 === 0;
    const m = pick(new THREE.Mesh(ball, M(blood ? 0xff6a6a : 0xb0e07a, { roughness: 0.3, emissive: blood ? 0xff6a6a : 0xb0e07a, emissiveIntensity: 0.7 })), blood ? 'sinusoid' : 'bile-canaliculus', blood ? 'Blood flowing toward the central vein' : 'Bile flowing outward to a bile duct');
    m.scale.setScalar(0.8);
    m.position.z = H + 0.8;
    root.add(m);
    if (!blood) {
      const plateA = Math.round((gapA / (Math.PI * 2)) * LOBULE.plates) / LOBULE.plates * Math.PI * 2;
      flows.push({ m, from: new THREE.Vector3(Math.cos(plateA) * 5, Math.sin(plateA) * 5, H + 0.8), to: corners[Math.round(plateA / (Math.PI / 3)) % 6].clone().setZ(H + 0.8), u: rand(), bile: true });
    } else flows.push({ m, from: start.setZ(H + 0.8), to: end.setZ(H + 0.8), u: rand(), bile: false });
  }

  let t = 0;
  let stage = 0;
  function apply(v) {
    stage = v;
    for (const f of flows) {
      f.m.visible = f.bile ? v > 2.7 : v > 0.7 && v < 2.9;
      const s = (f.u + t) % 1;
      f.m.position.copy(f.from).lerp(f.to, s);
    }
    pv.emissive?.set(0x7a5aa8);
    pv.emissiveIntensity = 0.5 * (1 - ramp(v, 0.6, 1));
    ha.emissive?.set(0xd9434f);
    ha.emissiveIntensity = 0.5 * (1 - ramp(v, 0.6, 1));
  }
  const { controls, update } = stagedControls({ stages: LOBULE_STAGES, apply, reducedMotion, rate: 0.2, still: 3 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-5,
    frameWidth: 1.9e-3,
    view: { target: [0, -4, 0], direction: [0.18, -0.35, 1] },
    focus: [Math.cos(0.2) * 20, Math.sin(0.2) * 20, H],
    controls,
    update(dt) {
      update(dt);
      if (!reducedMotion) {
        t = (t + dt * 0.08) % 1;
        apply(stage);
      }
    },
    dispose() {
      box.dispose();
      ball.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
