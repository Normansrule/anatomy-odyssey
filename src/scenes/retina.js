// Tier 4: a block of retina away from the fovea. 1 scene unit = 1 µm.
// Light arrives from the top (the vitreous side) and crosses the whole
// retina before reaching the photoreceptors at the back (OpenStax 14.1).
// From the top: nerve fibers heading for the optic disc, ganglion cells,
// the inner synaptic layer, bipolar, horizontal and amacrine cells, the outer
// synaptic layer, photoreceptor nuclei, and the rods (many) and cones (few)
// with their outer segments against the pigment epithelium; the choroid's
// capillaries below. Layer thicknesses are approximate.
// The stage control follows one signal from a rod to the optic nerve.
import * as THREE from 'three/webgpu';
import { materialBank, pick, tubeThrough, ellipsoid, seeded, disposeTree, COLORS } from './kit.js';
import { stagedControls, ramp } from './stages.js';

const W = 100;
const D = 30;
export const RETINA_LAYERS = {
  nerveFibers: [-14, 0],
  ganglion: [-32, -14],
  innerSynaptic: [-60, -32],
  innerNuclear: [-96, -60],
  outerSynaptic: [-110, -96],
  outerNuclear: [-150, -110],
  innerSegments: [-170, -150],
  outerSegments: [-198, -170],
  pigment: [-210, -198],
};
export const ROD = { width: 2, outerSegment: 28 };
export const CONE_EVERY = 5; // one cone per this many positions in each direction: rods far outnumber cones here

export const SIGNAL_STAGES = [
  { label: 'Light in', text: 'Light in. Light enters from the vitreous side and passes through the nerve fibers, ganglion cells and bipolar cells before it reaches the rods and cones at the back.' },
  { label: 'Rod responds', text: 'A rod responds. Rhodopsin in its outer segment absorbs the light. The rod’s membrane potential changes, and it releases less neurotransmitter onto its bipolar cell. Rods work in dim light; a single photon can be enough.' },
  { label: 'Bipolar cell', text: 'Bipolar cell. The change passes to a bipolar cell, which links photoreceptors to a ganglion cell. Away from the fovea, many photoreceptors (up to about 50) feed one ganglion cell.' },
  { label: 'Ganglion cell', text: 'Ganglion cell. The ganglion cell fires action potentials, the first true nerve impulses on the path to the brain.' },
  { label: 'To the brain', text: 'To the brain. Ganglion cell axons run across the inner surface to the optic disc and leave as the optic nerve, about 1.2 to 1.5 million axons from each eye.' },
];

export function buildRetina({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(1515);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3();
  const ball = new THREE.SphereGeometry(1, 12, 9);
  const rodGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
  const coneGeo = new THREE.ConeGeometry(1, 1, 10);
  const L = RETINA_LAYERS;
  const mid = ([a, b]) => (a + b) / 2;

  // Faint layer bands on the back wall and the cut front, so the layers read like a slide.
  const bands = [
    ['nerveFibers', 0xf3e2b0, 'ganglion-cell', 'Nerve fiber layer (ganglion cell axons)'],
    ['ganglion', 0xe9c8d8, 'ganglion-cell', 'Ganglion cell layer'],
    ['innerSynaptic', 0xf1dce6, 'bipolar-cell', 'Inner synaptic layer'],
    ['innerNuclear', 0xe2b8d0, 'bipolar-cell', 'Inner nuclear layer (bipolar, horizontal and amacrine cells)'],
    ['outerSynaptic', 0xf1dce6, 'bipolar-cell', 'Outer synaptic layer'],
    ['outerNuclear', 0xd8b0c8, 'rod-cell', 'Outer nuclear layer (photoreceptor nuclei)'],
    ['innerSegments', 0xeed6c0, 'rod-cell', 'Inner segments of rods and cones'],
    ['outerSegments', 0xf0c8a8, 'rod-cell', 'Outer segments (where light is absorbed)'],
    ['pigment', 0x3a2420, 'pigment-epithelium', 'Pigment epithelium'],
  ];
  for (const [key, color, card, label] of bands) {
    const [y0, y1] = L[key];
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * W, y1 - y0), M(color, { roughness: 0.8, transparent: key !== 'pigment', opacity: 0.5 }));
    back.position.set(0, mid(L[key]), -D - 1);
    back.userData.pickPriority = -1;
    root.add(pick(back, card, label));
  }
  // Pigment epithelium: a row of dark cells, and the choroid's capillaries below.
  const rpe = new THREE.Mesh(new THREE.BoxGeometry(2 * W, 12, 2 * D), M(0x3a2420, { roughness: 0.6 }));
  rpe.position.y = mid(L.pigment);
  root.add(pick(rpe, 'pigment-epithelium', 'Pigment epithelium (absorbs stray light, renews the outer segments)'));
  const capMat = M(COLORS.artery, { roughness: 0.45 });
  for (const z of [-20, -4, 12, 26]) {
    root.add(pick(tubeThrough([[-W, -218, z], [-40, -217, z + 3], [20, -219, z - 2], [W, -218, z]], 4, capMat, 40, 10), 'pigment-epithelium', 'Capillary of the choroid (feeds the photoreceptors)'));
  }

  // Photoreceptors on a grid: mostly rods, a cone at every CONE_EVERY-th spot.
  const pitch = 2.5;
  const spots = [];
  for (let x = -W + 1.5; x < W - 1; x += pitch) for (let z = -D + 1.5; z < D - 1; z += pitch) spots.push([x, z]);
  const isCone = ([x, z]) => Math.round((x + W) / pitch) % CONE_EVERY === 2 && Math.round((z + D) / pitch) % CONE_EVERY === 2;
  const rods = spots.filter((s) => !isCone(s));
  const cones = spots.filter(isCone);
  const rodOS = new THREE.InstancedMesh(rodGeo, M(0xd88a6a, { roughness: 0.45 }), rods.length);
  const rodIS = new THREE.InstancedMesh(rodGeo, M(0xe8b8a0, { roughness: 0.5 }), rods.length);
  const rodNuc = new THREE.InstancedMesh(ball, M(COLORS.hematoxylin, { roughness: 0.5 }), rods.length);
  rods.forEach(([x, z], i) => {
    const os = L.outerSegments;
    rodOS.setMatrixAt(i, m4.compose(new THREE.Vector3(x, mid(os), z), q, new THREE.Vector3(ROD.width / 2, os[1] - os[0], ROD.width / 2)));
    rodIS.setMatrixAt(i, m4.compose(new THREE.Vector3(x, mid(L.innerSegments), z), q, new THREE.Vector3(1.1, L.innerSegments[1] - L.innerSegments[0], 1.1)));
    rodNuc.setMatrixAt(i, m4.compose(new THREE.Vector3(x, L.outerNuclear[0] + 6 + rand() * 30, z), q, new THREE.Vector3(1.6, 2.2, 1.6)));
  });
  root.add(pick(rodOS, 'rod-cell', 'Rod outer segment (stacked discs full of rhodopsin)'));
  root.add(pick(rodIS, 'rod-cell', 'Rod inner segment (mitochondria)'));
  root.add(pick(rodNuc, 'rod-cell', 'Photoreceptor nucleus'));
  const coneOS = new THREE.InstancedMesh(coneGeo, M(0xe8a03a, { roughness: 0.45 }), cones.length);
  const coneIS = new THREE.InstancedMesh(ball, M(0xf0c890, { roughness: 0.5 }), cones.length);
  const flip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI);
  cones.forEach(([x, z], i) => {
    coneOS.setMatrixAt(i, m4.compose(new THREE.Vector3(x, -181, z), flip, new THREE.Vector3(1.9, 16, 1.9)));
    coneIS.setMatrixAt(i, m4.compose(new THREE.Vector3(x, -162, z), q, new THREE.Vector3(2.6, 9, 2.6)));
  });
  root.add(pick(coneOS, 'cone-cell', 'Cone outer segment (color vision, bright light)'));
  root.add(pick(coneIS, 'cone-cell', 'Cone inner segment'));

  // Bipolar cells (spindles with a process each way), horizontal and amacrine cells.
  const bip = [];
  for (let x = -W + 6; x < W - 4; x += 9) for (const z of [-20, 0, 20]) bip.push([x + (rand() - 0.5) * 3, -78 + (rand() - 0.5) * 16, z + (rand() - 0.5) * 6]);
  const bipolar = new THREE.InstancedMesh(ball, M(0xb88ad0, { roughness: 0.5 }), bip.length);
  const bipProc = new THREE.InstancedMesh(rodGeo, M(0xc8a0e0, { roughness: 0.5 }), bip.length);
  bip.forEach(([x, y, z], i) => {
    bipolar.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(3, 5, 3)));
    bipProc.setMatrixAt(i, m4.compose(new THREE.Vector3(x, (L.innerSynaptic[0] + L.outerSynaptic[0]) / 2 + 2, z), q, new THREE.Vector3(0.5, L.innerSynaptic[1] - L.outerSynaptic[0] - 6, 0.5)));
  });
  root.add(pick(bipolar, 'bipolar-cell', 'Bipolar cell'));
  root.add(pick(bipProc, 'bipolar-cell', 'Bipolar cell process'));
  const hz = M(0x9fb4e8, { roughness: 0.5 });
  for (let x = -W + 15; x < W; x += 40) root.add(pick(ellipsoid([x, -93, (rand() - 0.5) * 30], [12, 2.5, 6], hz, 14), 'bipolar-cell', 'Horizontal cell (links photoreceptors side to side)'));
  for (let x = -W + 30; x < W; x += 45) root.add(pick(ellipsoid([x, -63, (rand() - 0.5) * 30], [5, 3.5, 5], hz, 14), 'bipolar-cell', 'Amacrine cell (links bipolar and ganglion cells side to side)'));

  // Ganglion cells, their dendrites down and axons bending into the nerve fiber layer.
  const gMat = M(0xe8c45a, { roughness: 0.45 });
  const axonMat = M(0xf3d98a, { roughness: 0.45, tissue: 'nerve' });
  const ganglia = [];
  for (let x = -W + 12; x < W - 8; x += 22) {
    for (const z of [-16, 4, 22]) {
      const p = [x + (rand() - 0.5) * 6, -23, z];
      ganglia.push(p);
      root.add(pick(ellipsoid(p, [6.5, 6, 6.5], gMat, 16), 'ganglion-cell', 'Ganglion cell'));
      root.add(pick(tubeThrough([p, [p[0] + 2, -10, p[2]], [p[0] + 14, -6, p[2]], [W + 2, -5 + (rand() - 0.5) * 6, p[2]]], 0.9, axonMat, 32, 5), 'ganglion-cell', 'Ganglion cell axon, heading for the optic disc'));
      root.add(pick(tubeThrough([[p[0], p[1] - 5, p[2]], [p[0] - 4, -40, p[2] + 2], [p[0] - 6, -52, p[2] + 3]], 0.45, gMat, 12, 4), 'ganglion-cell', 'Ganglion cell dendrite'));
    }
  }

  // The highlighted pathway: one rod, its bipolar cell, one ganglion cell and its axon.
  const glow = (color) => M(color, { roughness: 0.35, emissive: color, emissiveIntensity: 0 });
  const front = [0.5, 25.5];
  const gPath = ganglia.reduce((b, p) => (Math.hypot(p[0] - front[0], p[2] - front[1]) < Math.hypot(b[0] - front[0], b[2] - front[1]) ? p : b), ganglia[0]);
  const heroRodMat = glow(0xff9a6a);
  const heroRod = pick(new THREE.Mesh(rodGeo, heroRodMat), 'rod-cell', 'This rod (its outer segment absorbs the light)');
  heroRod.scale.set(1.3, L.outerSegments[1] - L.outerSegments[0], 1.3);
  heroRod.position.set(front[0], mid(L.outerSegments), front[1]);
  root.add(heroRod);
  const heroBipMat = glow(0xd0a0ff);
  root.add(pick(ellipsoid([front[0] + 2, -80, front[1]], [3.4, 5.6, 3.4], heroBipMat, 16), 'bipolar-cell', 'This rod’s bipolar cell'));
  root.add(pick(tubeThrough([[front[0], L.outerNuclear[1] - 4, front[1]], [front[0] + 2, -100, front[1]], [front[0] + 2, -84, front[1]]], 0.7, heroBipMat, 16, 5), 'bipolar-cell', 'Contact between rod and bipolar cell'));
  root.add(pick(tubeThrough([[front[0] + 2, -75, front[1]], [front[0] + 3, -55, front[1]], [gPath[0], -38, gPath[2]], [gPath[0], gPath[1] - 6, gPath[2]]], 0.7, heroBipMat, 24, 5), 'bipolar-cell', 'Contact between bipolar and ganglion cell'));
  const heroGangMat = glow(0xffe28a);
  root.add(pick(ellipsoid([gPath[0], gPath[1], gPath[2] + 0.2], [6.8, 6.3, 6.8], heroGangMat, 18), 'ganglion-cell', 'This ganglion cell'));
  const axonCurve = new THREE.CatmullRomCurve3([gPath, [gPath[0] + 2, -10, gPath[2]], [gPath[0] + 14, -6, gPath[2]], [W + 2, -5, gPath[2]]].map((p) => new THREE.Vector3(...p)));
  const spikes = Array.from({ length: 4 }, (_, k) => {
    const s = pick(new THREE.Mesh(ball, M(0xffffff, { roughness: 0.2, emissive: 0xffe28a, emissiveIntensity: 1 })), 'ganglion-cell', 'Action potential traveling along the axon');
    s.scale.setScalar(1.8);
    s.userData.k = k;
    root.add(s);
    return s;
  });
  const ray = pick(new THREE.Mesh(rodGeo, M(0xfff2b0, { roughness: 0.2, emissive: 0xffe28a, emissiveIntensity: 1, transparent: true, opacity: 0.9 })), 'rod-cell', 'Light');
  root.add(ray);
  const photonTop = 40;
  const photonEnd = L.outerSegments[1] - 4;

  let t = 0;
  function apply(v) {
    const reach = ramp(v, 0.05, 0.85);
    const yEnd = photonTop + (photonEnd - photonTop) * reach;
    ray.visible = v < 1.6;
    ray.scale.set(0.6, Math.max(0.01, photonTop - yEnd), 0.6);
    ray.position.set(front[0], (photonTop + yEnd) / 2, front[1]);
    heroRodMat.emissiveIntensity = 0.9 * ramp(v, 0.85, 1.3) * (1 - 0.5 * ramp(v, 2.5, 3));
    heroBipMat.emissiveIntensity = 0.9 * ramp(v, 1.6, 2.2) * (1 - 0.5 * ramp(v, 3.5, 4));
    heroGangMat.emissiveIntensity = 0.9 * ramp(v, 2.6, 3.1);
    const go = ramp(v, 2.9, 4);
    spikes.forEach((s) => {
      s.visible = v > 2.9;
      axonCurve.getPointAt(Math.min(1, (go * 0.85 + s.userData.k * 0.12 + t) % 1), s.position);
    });
  }
  const { controls, update } = stagedControls({ stages: SIGNAL_STAGES, apply, reducedMotion, rate: 0.22, still: 3.2 });

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-6,
    frameWidth: 3e-4,
    view: { target: [0, -105, 0], direction: [0.3, 0.12, 1] },
    focus: [front[0], mid(L.outerSegments), front[1]],
    controls,
    update(dt) {
      update(dt);
      if (!reducedMotion && controls.value > 2.9) {
        t = (t + dt * 0.25) % 1;
        apply(controls.value);
      }
    },
    dispose() {
      ball.dispose();
      rodGeo.dispose();
      coneGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
