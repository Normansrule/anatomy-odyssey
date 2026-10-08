// Tier 5: sunlight on a basal keratinocyte. 1 scene unit = 1 µm.
// The cell (drawn see-through, about 11 µm wide) sits on the basement
// membrane among its neighbors, with a capillary in the dermis below. A
// melanocyte beside it hands over melanin, which gathers over the nucleus.
// The stage control (OpenStax 5.1, 5.3): ultraviolet (UV) light arrives;
// melanin absorbs it before it reaches the DNA; in the membrane, UV turns a
// cholesterol derivative into vitamin D3; vitamin D3 leaves for the blood.
// UV rays, melanin granules and molecules are drawn far larger than life.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, cylinderBetween, ellipsoid, seeded, fibonacciSphere, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

export const CELL = { radii: [5.5, 7, 5], center: [0, 7.4, 0] }; // about 11 µm wide, 14 µm tall
const NUC = { radii: [3, 3.2, 3], center: [0, 6.2, 0] };
const CAP_Y = -10;

export const SUN_STAGES = [
  { label: 'Sunlight', text: 'Sunlight. Ultraviolet (UV) light from the sun passes through the dead outer layers into the living cells of the epidermis, where it can damage DNA.' },
  { label: 'Melanin shields', text: 'Melanin shields. Melanocytes make the pigment melanin and hand it to keratinocytes in vesicles called melanosomes. It gathers over the nucleus like a parasol and absorbs UV before it reaches the DNA.' },
  { label: 'Vitamin D', text: 'Vitamin D made. In the cell membranes, UV light breaks open a ring of a cholesterol derivative (7-dehydrocholesterol), which then rearranges into vitamin D3, cholecalciferol (yellow).' },
  { label: 'Into the blood', text: 'Into the blood. Vitamin D3 leaves for the capillaries of the dermis. The liver converts it to calcidiol and the kidneys to calcitriol, the active form, which lets the gut absorb calcium and phosphorus. Without enough sun, the body can run short of it.' },
];

export function buildSunAndSkin({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(5353);
  const dot = new THREE.SphereGeometry(1, 10, 8);
  const c = new THREE.Vector3(...CELL.center);
  const R = new THREE.Vector3(...CELL.radii);

  // Dermis, basement membrane and a capillary.
  const derm = new THREE.Mesh(new THREE.BoxGeometry(60, 18, 26), M(0xe7a6a6, { roughness: 0.75, transparent: true, opacity: 0.55, depthWrite: false }));
  derm.position.set(0, -9.3, -2);
  root.add(pick(derm, 'dermis', 'Dermis'));
  const bm = new THREE.Mesh(new THREE.BoxGeometry(60, 0.4, 26), M(0x9fb4e8, { roughness: 0.7 }));
  bm.position.set(0, -0.2, -2);
  root.add(pick(bm, 'stratum-basale', 'Basement membrane (the epidermis rests on it)'));
  const capWall = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 60, 28, 1, true), M(0xf0b4c4, { roughness: 0.45, side: THREE.DoubleSide, transparent: true, opacity: 0.55, depthWrite: false }));
  capWall.rotation.z = Math.PI / 2;
  capWall.position.set(0, CAP_Y, 2);
  root.add(pick(capWall, 'capillary', 'Capillary in the dermis'));
  for (const x of [-18, 6, 22]) {
    const rbc = new THREE.Mesh(new THREE.TorusGeometry(2.4, 1, 10, 20), M(COLORS.artery, { roughness: 0.4 }));
    rbc.position.set(x, CAP_Y, 1.5);
    rbc.rotation.set(0.5, 1.2, 0);
    root.add(pick(rbc, 'red-blood-cell', 'Red blood cell'));
  }

  // Neighboring keratinocytes: the basal layer and two rows above.
  const kMat = M(0xc888a0, { roughness: 0.55 });
  for (const [x, y, z, rx, ry] of [[11.5, 7.4, 0, 5.5, 7], [23, 7.4, -1, 5.5, 7], [-23, 7.4, -1, 5.5, 7], [-6, 19, -1, 5.8, 5], [6.5, 19.4, -2, 5.8, 5], [18, 19, -2, 5.8, 5], [-17, 19.6, -2, 5.8, 5], [0, 29.5, -3, 6.5, 4], [13, 30, -3, 6.5, 4], [-13, 30, -3, 6.5, 4]]) {
    root.add(pick(ellipsoid([x, y, z], [rx, ry, 5], kMat, 20), 'keratinocyte', 'Keratinocyte'));
  }
  for (let k = 0; k < 4; k++) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(60, 0.8, 22), M(0xead8c8, { roughness: 0.6 }));
    slab.position.set(0, 35.5 + k * 1.2, -3);
    root.add(pick(slab, 'stratum-corneum', 'Dead cells of the stratum corneum (above the living layers)'));
  }

  // The see-through basal keratinocyte, its nucleus and its melanin cap.
  root.add(pick(ellipsoid(CELL.center, CELL.radii, M(0xe3a6c0, { roughness: 0.3, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }), 32), 'keratinocyte', 'Basal keratinocyte (drawn see-through)'));
  root.add(pick(ellipsoid(NUC.center, NUC.radii, M(COLORS.hematoxylin, { roughness: 0.5 }), 24), 'keratinocyte', 'Nucleus (its DNA is what UV damages)'));
  const capMat = M(0x5a3a28, { roughness: 0.45, emissive: 0xffa060, emissiveIntensity: 0 });
  const capDots = fibonacciSphere(140).filter((d) => d.y > 0.35);
  const cap = new THREE.InstancedMesh(dot, capMat, capDots.length);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  capDots.forEach((d, i) => cap.setMatrixAt(i, m4.compose(new THREE.Vector3(NUC.center[0] + d.x * 3.55, NUC.center[1] + d.y * 3.75, NUC.center[2] + d.z * 3.55), q, new THREE.Vector3(0.38, 0.38, 0.38))));
  root.add(pick(cap, 'melanocyte', 'Melanin cap over the nucleus'));

  // The melanocyte next door and its branch reaching the cell.
  const melMat = M(0x5a3a28, { roughness: 0.45 });
  root.add(pick(ellipsoid([-12, 4.5, 6], [3.8, 3.6, 3.6], melMat, 20), 'melanocyte', 'Melanocyte (makes melanin)'));
  const branch = [[-12, 7, 6], [-9, 12, 5], [-5, 14.6, 3.5], [-1.5, 13.6, 2.5]];
  root.add(pick(tubeThrough(branch, 0.7, melMat, 32, 6), 'melanocyte', 'Melanocyte branch handing over melanosomes'));
  const branchCurve = new THREE.CatmullRomCurve3(branch.map((p) => new THREE.Vector3(...p)));
  const melanosomes = Array.from({ length: 6 }, (_, i) => {
    const m = pick(new THREE.Mesh(dot, melMat), 'melanocyte', 'Melanosome (a vesicle of melanin)');
    m.scale.setScalar(0.55);
    m.userData.d = i * 0.08;
    root.add(m);
    return m;
  });

  // 7-dehydrocholesterol in the membrane: small marks on the cell surface.
  const surf = fibonacciSphere(90).filter((d) => d.y > 0.1 && Math.abs(d.x) > 0.25);
  const surfPts = surf.map((d) => new THREE.Vector3(c.x + d.x * R.x, c.y + d.y * R.y, c.z + d.z * R.z));
  const dhcMat = M(0xf2a65a, { roughness: 0.4 });
  const dhc = new THREE.InstancedMesh(dot, dhcMat, surfPts.length);
  surfPts.forEach((p, i) => dhc.setMatrixAt(i, m4.compose(p, q, new THREE.Vector3(0.32, 0.32, 0.32))));
  root.add(pick(dhc, 'vitamin-d3', '7-dehydrocholesterol in the membrane (the starting material)'));

  // UV rays: half aimed at the nucleus (stopped by the cap), half at the membrane.
  const rayMat = M(0xb68cff, { roughness: 0.2, emissive: 0x9a6aff, emissiveIntensity: 1, transparent: true, opacity: 0.85 });
  const rays = [];
  for (let i = 0; i < 16; i++) {
    const onCap = i % 2 === 0;
    let end;
    if (onCap) {
      const d = capDots[Math.floor(rand() * capDots.length)];
      end = new THREE.Vector3(NUC.center[0] + d.x * 3.8, NUC.center[1] + d.y * 4, NUC.center[2] + d.z * 3.8);
    } else {
      end = surfPts[Math.floor(rand() * surfPts.length)].clone();
    }
    const start = end.clone().add(new THREE.Vector3(-14 + rand() * 6, 52, (rand() - 0.5) * 6));
    const mesh = pick(cylinderBetween(start.toArray(), end.toArray(), 0.16, 0.16, rayMat, 6), 'ultraviolet', 'Ultraviolet light (drawn as rays)');
    mesh.userData = { ...mesh.userData, start, end, delay: rand() * 0.3 };
    root.add(mesh);
    rays.push(mesh);
  }

  // Vitamin D3 molecules: made at the membrane, then off to the capillary.
  const d3Mat = M(0xffe28a, { roughness: 0.3, emissive: 0xffd36a, emissiveIntensity: 0.8 });
  const d3 = surfPts.filter((_, i) => i % 3 === 0).slice(0, 18).map((p, i) => {
    const m = pick(new THREE.Mesh(dot, d3Mat), 'vitamin-d3', 'Vitamin D3, cholecalciferol (drawn far larger)');
    m.scale.setScalar(0.5);
    m.userData.keys = [p.clone(), new THREE.Vector3(p.x * 0.6, 0.4, p.z * 0.6 + 1), new THREE.Vector3(-26 + i * 3, CAP_Y + (rand() - 0.5) * 3, 2 + (rand() - 0.5) * 3)];
    m.userData.d = rand() * 0.25;
    root.add(m);
    return m;
  });

  const tmp = new THREE.Vector3();
  function apply(v) {
    for (const r of rays) {
      const { start, end, delay } = r.userData;
      const grow = ramp(v, 0.05 + delay, 0.75 + delay);
      tmp.copy(start).lerp(end, grow);
      const len = start.distanceTo(tmp);
      r.visible = grow > 0.01;
      r.position.copy(start).add(tmp).multiplyScalar(0.5);
      r.scale.set(1, Math.max(0.001, len / start.distanceTo(end)), 1);
    }
    capMat.emissiveIntensity = 0.7 * ramp(v, 0.7, 1.2) * (1 - 0.6 * ramp(v, 2.6, 3));
    for (const m of melanosomes) {
      const t = ramp(v, 1 + m.userData.d, 1.7 + m.userData.d);
      m.visible = v > 0.95 && t < 0.999;
      branchCurve.getPointAt(Math.min(1, t), m.position);
    }
    const made = ramp(v, 1.9, 2.5);
    dhc.visible = made < 0.98;
    dhc.scale.setScalar(1);
    for (const m of d3) {
      const [a, b, cc] = m.userData.keys;
      const d = m.userData.d;
      m.visible = made > 0.02;
      m.scale.setScalar(0.5 * Math.max(0.05, made));
      m.position.copy(a).lerp(b, ramp(v, 2.95 + d, 3.4 + d)).lerp(cc, ramp(v, 3.4 + d, 3.95));
    }
  }
  const { controls, update } = stagedControls({ stages: SUN_STAGES, apply, reducedMotion, rate: 0.24, still: 3 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 6.6e-5,
    view: { target: [0, 12, 0], direction: [0.25, 0.15, 1] },
    focus: [-8, CAP_Y + 1, 2],
    controls,
    update,
    dispose() {
      dot.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
