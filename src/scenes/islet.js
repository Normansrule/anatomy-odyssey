// Tier 4: one islet of Langerhans among the acini. 1 scene unit = 1 µm.
// A ball of hormone cells, cut in half, threaded with capillaries, set in
// exocrine tissue: grape-like acini of acinar cells around tiny ducts.
// Islet cells in OpenStax 17.9's proportions: beta cells about 75 percent
// (insulin), alpha about 20 (glucagon), delta about 4 (somatostatin) and PP
// cells about 1 (pancreatic polypeptide), mixed together as in human islets.
// The control is blood glucose: low calls out glucagon, high calls out insulin.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, ellipsoid, seeded, disposeTree, COLORS } from './kit.js';
import { ramp } from './stages.js';

export const ISLET = { radius: 75, cell: 4.6 };
export const CELL_SHARES = { beta: 0.75, alpha: 0.2, delta: 0.04, pp: 0.01 };

const TYPES = [
  { key: 'beta', card: 'beta-cell', label: 'Beta cell (makes insulin)', color: 0x7cc49a },
  { key: 'alpha', card: 'alpha-cell', label: 'Alpha cell (makes glucagon)', color: 0xf2a65a },
  { key: 'delta', card: 'delta-cell', label: 'Delta cell (makes somatostatin)', color: 0x8f7ff0 },
  { key: 'pp', card: 'delta-cell', label: 'PP cell (makes pancreatic polypeptide)', color: 0xe8c45a },
];

/** Assign a type to the i-th of n cells so the shares come out exactly (rounded). */
export function cellTypes(n) {
  const counts = TYPES.map((t) => Math.round(n * CELL_SHARES[t.key]));
  counts[0] = n - counts.slice(1).reduce((a, b) => a + b, 0);
  return counts;
}

export function buildIslet({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(2020);
  const ball = new THREE.SphereGeometry(1, 12, 9);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();

  // Islet cells: packed in a ball, back half only (cut toward the viewer).
  const pts = [];
  const step = ISLET.cell * 2.05;
  for (let x = -ISLET.radius; x <= ISLET.radius; x += step) {
    for (let y = -ISLET.radius; y <= ISLET.radius; y += step) {
      for (let z = -ISLET.radius; z <= 0; z += step) {
        const j = step * 0.7; // jitter, so the cells do not sit on a visible grid
        const p = new THREE.Vector3(x + (rand() - 0.5) * j, y + (rand() - 0.5) * j, Math.min(0, z + (rand() - 0.5) * j));
        if (p.length() < ISLET.radius) pts.push(p);
      }
    }
  }
  // Shuffle, then deal out types in proportion.
  for (let i = pts.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pts[i], pts[j]] = [pts[j], pts[i]];
  }
  const counts = cellTypes(pts.length);
  const mats = TYPES.map((t) => M(t.color, { roughness: 0.5, emissive: t.color, emissiveIntensity: 0 }));
  const meshes = [];
  let k = 0;
  TYPES.forEach((t, ti) => {
    const mesh = new THREE.InstancedMesh(ball, mats[ti], counts[ti]);
    for (let i = 0; i < counts[ti]; i++, k++) {
      const s = ISLET.cell * (0.9 + rand() * 0.2);
      mesh.setMatrixAt(i, m4.compose(pts[k], q, new THREE.Vector3(s, s, s)));
    }
    root.add(pick(mesh, t.card, t.label));
    meshes.push(mesh);
  });
  // A thin capsule of connective tissue.
  const capsule = new THREE.Mesh(new THREE.SphereGeometry(ISLET.radius + 3, 48, 32, Math.PI, Math.PI), M(0xe8d8c8, { roughness: 0.6, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false }));
  // phi from π to 2π keeps the back half (z ≤ 0).
  root.add(pick(capsule, 'islet', 'Islet of Langerhans (cut in half)'));

  // Capillaries threading through the islet (back half).
  const capMat = M(COLORS.artery, { roughness: 0.45 });
  const caps = [];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const p0 = new THREE.Vector3(Math.cos(a) * 100, Math.sin(a) * 100, -20 - rand() * 30);
    const p1 = new THREE.Vector3((rand() - 0.5) * 50, (rand() - 0.5) * 50, -10 - rand() * 30);
    const p2 = new THREE.Vector3(Math.cos(a + 2.4) * 100, Math.sin(a + 2.4) * 100, -20 - rand() * 30);
    const wig = () => new THREE.Vector3((rand() - 0.5) * 30, (rand() - 0.5) * 30, (rand() - 0.5) * 10);
    const pts3 = [p0, p0.clone().lerp(p1, 0.5).add(wig()), p1, p1.clone().lerp(p2, 0.5).add(wig()), p2].map((p) => p.toArray());
    root.add(pick(tubeThrough(pts3, 3, capMat, 48, 8), 'islet', 'Capillary (hormones enter the blood here)'));
    caps.push(new THREE.CatmullRomCurve3(pts3.map((p) => new THREE.Vector3(...p))));
  }

  // Acini around the islet: clusters of acinar cells around a tiny lumen.
  const acinarMat = M(0xd8a0b8, { roughness: 0.55 });
  const granuleMat = M(0xf2a65a, { roughness: 0.4 });
  const acinar = [];
  const gran = [];
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2 + rand() * 0.2;
    const r = 112 + rand() * 40;
    const c = new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r, -16 - rand() * 30);
    for (let j = 0; j < 9; j++) {
      const b = (j / 9) * Math.PI * 2;
      const p = c.clone().add(new THREE.Vector3(Math.cos(b) * 11, Math.sin(b) * 11, (rand() - 0.5) * 6));
      acinar.push(p);
      gran.push(p.clone().lerp(c, 0.45));
    }
  }
  const acini = new THREE.InstancedMesh(ball, acinarMat, acinar.length);
  acinar.forEach((p, i) => acini.setMatrixAt(i, m4.compose(p, q, new THREE.Vector3(6.5, 6.5, 6.5))));
  root.add(pick(acini, 'acinar-cell', 'Acinar cell (makes digestive enzymes)'));
  const granules = new THREE.InstancedMesh(ball, granuleMat, gran.length);
  gran.forEach((p, i) => granules.setMatrixAt(i, m4.compose(p, q, new THREE.Vector3(2, 2, 2))));
  root.add(pick(granules, 'acinar-cell', 'Enzyme granules, at the side facing the duct'));
  root.add(pick(tubeThrough([[150, -60, -30], [120, -95, -25], [70, -130, -30], [0, -150, -30]], 3.5, M(0xf2e2b8, { roughness: 0.4 }), 32, 8), 'pancreatic-duct', 'Small duct collecting pancreatic juice'));

  // Hormone dots leaving into the capillaries: glucagon (orange) or insulin (green).
  const hormones = Array.from({ length: 60 }, (_, i) => {
    const m = pick(new THREE.Mesh(ball, M(0xffffff, { roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.4 })), 'insulin', 'Insulin (green) or glucagon (orange) entering the blood (drawn far larger)');
    m.scale.setScalar(1.6);
    m.userData.curve = caps[i % caps.length];
    m.userData.u = (i * 0.137) % 1;
    root.add(m);
    return m;
  });
  const insulinColor = new THREE.Color(0x7cc49a);
  const glucagonColor = new THREE.Color(0xf2a65a);
  let flow = 0;
  let glucose = 1;
  const place = () => {
    const high = glucose > 0.5;
    for (const m of hormones) {
      m.visible = Math.abs(glucose - 0.5) > 0.15;
      m.material.color.copy(high ? insulinColor : glucagonColor);
      m.material.emissive.copy(high ? insulinColor : glucagonColor);
      m.userData.curve.getPointAt((m.userData.u + flow) % 1, m.position);
    }
  };
  function pose(v) {
    glucose = v;
    mats[0].emissiveIntensity = 0.7 * ramp(v, 0.55, 1);
    mats[1].emissiveIntensity = 0.7 * (1 - ramp(v, 0, 0.45));
    place();
  }
  const controls = {
    label: 'Blood glucose',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: 1,
    format: (v) => (v < 0.35 ? 'Low' : v > 0.65 ? 'High' : 'Normal'),
    presets: [
      { label: 'Low (fasting)', value: 0 },
      { label: 'Normal', value: 0.5 },
      { label: 'High (after a meal)', value: 1 },
    ],
    set(v) {
      controls.value = v;
      pose(v);
      return v < 0.35
        ? 'Low blood glucose: alpha cells (orange, about 20 percent of the islet) release glucagon, which tells the liver to turn glycogen back into glucose.'
        : v > 0.65
          ? 'High blood glucose: beta cells (green, about 75 percent) release insulin, which helps body cells take up glucose and the liver store it as glycogen.'
          : 'Normal: blood glucose is held at roughly 70 to 100 mg/dL by the balance of the two hormones. Delta cells (somatostatin) restrain both.';
    },
  };
  controls.set(1);

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 3.4e-4,
    view: { target: [0, 0, -20], direction: [0.08, 0.1, 1] },
    focus: [8, 6, -2],
    controls,
    update(dt) {
      if (reducedMotion) return;
      flow = (flow + dt * 0.08) % 1;
      place();
    },
    dispose() {
      ball.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
