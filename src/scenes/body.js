// Tier 1 (whole body) and tier 2 (skeleton) scenes.
// A stylized adult figure built from primitives, 1 scene unit = 1 m, standing
// on y = 0 and facing +z. It is a generalized teaching model, not a scan.
// Milestone 2 replaces these primitives with Z-Anatomy meshes (see tools/).
import * as THREE from 'three/webgpu';
import {
  COLORS, materialBank, pick, capsuleBetween, tubeThrough, ellipsoid, disposeTree,
} from './kit.js';

export const SYSTEMS = [
  { id: 'skin', label: 'Skin', card: 'body' },
  { id: 'skeletal', label: 'Skeletal', card: 'skeletal-system' },
  { id: 'muscular', label: 'Muscular', card: 'muscular-system' },
  { id: 'circulatory', label: 'Circulatory', card: 'circulatory-system' },
  { id: 'nervous', label: 'Nervous', card: 'nervous-system' },
  { id: 'respiratory', label: 'Respiratory', card: 'respiratory-system' },
  { id: 'immune', label: 'Immune', card: 'immune-system' },
];

export const DEFAULT_SYSTEMS = ['skin', 'skeletal', 'circulatory', 'nervous', 'respiratory', 'immune'];

const SIDES = [-1, 1];

function buildSkeleton(M, highlightFemur) {
  const g = new THREE.Group();
  const bone = M(COLORS.bone, { roughness: 0.55, tissue: 'bone', repeat: [1, 6] });
  const glow = M(COLORS.bone, { roughness: 0.45, emissive: COLORS.eosin, emissiveIntensity: 0.55, tissue: 'bone', repeat: [1, 6] });
  const dim = highlightFemur ? M(COLORS.boneShade, { roughness: 0.7, transparent: true, opacity: 0.55, tissue: 'bone', repeat: [1, 6] }) : bone;
  const add = (mesh, card, label) => g.add(pick(mesh, card, label));

  // Skull and jaw
  add(ellipsoid([0, 1.63, 0], [0.085, 0.105, 0.1], dim), 'skull', 'Skull');
  add(ellipsoid([0, 1.545, 0.035], [0.058, 0.03, 0.05], dim), 'skull', 'Skull');

  // Vertebral column: 24 vertebrae along a gentle S-curve, then the sacrum.
  for (let i = 0; i < 24; i++) {
    const t = i / 23;
    const y = 1.5 - t * 0.53;
    const z = -0.035 + 0.02 * Math.sin(t * Math.PI * 2.2 + 0.4);
    const r = 0.014 + t * 0.012;
    const v = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.016, 12), dim);
    v.position.set(0, y, z);
    add(v, 'vertebral-column', 'Vertebra');
    const spine = capsuleBetween([0, y, z - r], [0, y - 0.006, z - r - 0.02], 0.004, dim, 6);
    add(spine, 'vertebral-column', 'Vertebra');
  }
  add(ellipsoid([0, 0.955, -0.06], [0.042, 0.06, 0.022], dim), 'pelvis', 'Sacrum');

  // Rib cage: 12 pairs of arcs sloping down toward the front, plus the sternum.
  for (let k = 0; k < 12; k++) {
    const y = 1.39 - k * 0.029;
    const w = 0.085 + 0.055 * Math.sin((Math.PI * (k + 2)) / 15);
    const floating = k >= 10;
    for (const s of SIDES) {
      const pts = [
        [s * 0.02, y, -0.05],
        [s * (w * 0.8), y + 0.005, -0.055],
        [s * w, y - 0.02, 0.0],
        [s * (w * 0.85), y - 0.045, floating ? 0.04 : 0.07],
      ];
      if (!floating) pts.push([s * 0.035, y - 0.07, 0.11]);
      add(tubeThrough(pts, 0.0055, dim, 24, 6), 'rib-cage', 'Rib');
    }
  }
  const sternum = capsuleBetween([0, 1.385, 0.105], [0, 1.2, 0.118], 0.012, dim);
  sternum.scale.x = 1.6;
  add(sternum, 'rib-cage', 'Sternum');

  for (const s of SIDES) {
    // Shoulder girdle and arm
    add(capsuleBetween([s * 0.02, 1.43, 0.08], [s * 0.17, 1.45, 0.0], 0.008, dim), 'skeletal-system', 'Clavicle');
    const scap = ellipsoid([s * 0.11, 1.33, -0.08], [0.055, 0.075, 0.01], dim);
    scap.rotation.y = s * 0.35;
    add(scap, 'skeletal-system', 'Scapula');
    add(ellipsoid([s * 0.185, 1.42, 0], [0.024, 0.024, 0.024], dim), 'skeletal-system', 'Humerus');
    add(capsuleBetween([s * 0.19, 1.42, 0], [s * 0.25, 1.12, -0.01], 0.013, dim), 'skeletal-system', 'Humerus');
    add(capsuleBetween([s * 0.25, 1.11, 0.012], [s * 0.29, 0.86, 0.012], 0.008, dim), 'skeletal-system', 'Radius');
    add(capsuleBetween([s * 0.255, 1.12, -0.012], [s * 0.295, 0.86, -0.008], 0.008, dim), 'skeletal-system', 'Ulna');
    add(ellipsoid([s * 0.3, 0.8, 0.0], [0.02, 0.045, 0.012], dim), 'skeletal-system', 'Hand');

    // Pelvis: iliac wings and pubic ring
    const ilium = ellipsoid([s * 0.095, 1.0, -0.015], [0.075, 0.065, 0.012], dim);
    ilium.rotation.set(0, s * 0.95, s * -0.25);
    add(ilium, 'pelvis', 'Hip bone');
    add(capsuleBetween([s * 0.07, 0.94, 0.0], [s * 0.02, 0.9, 0.06], 0.012, dim), 'pelvis', 'Hip bone');

    // Femur (the dive's entry point): head, neck, trochanter, shaft, condyles
    // In the skeleton tier only the femur the dive enters (viewer's right) glows.
    const femurMat = highlightFemur ? (s === 1 ? glow : dim) : bone;
    const femur = new THREE.Group();
    femur.add(ellipsoid([s * 0.088, 0.935, 0], [0.022, 0.022, 0.022], femurMat));
    femur.add(capsuleBetween([s * 0.088, 0.935, 0], [s * 0.125, 0.905, 0], 0.012, femurMat));
    femur.add(ellipsoid([s * 0.138, 0.9, -0.005], [0.018, 0.022, 0.018], femurMat));
    femur.add(capsuleBetween([s * 0.125, 0.9, 0], [s * 0.1, 0.52, 0.01], 0.014, femurMat));
    femur.add(ellipsoid([s * 0.085, 0.505, 0.0], [0.02, 0.022, 0.024], femurMat));
    femur.add(ellipsoid([s * 0.118, 0.505, 0.0], [0.02, 0.022, 0.024], femurMat));
    femur.traverse((o) => pick(o, 'femur', 'Femur'));
    g.add(femur);

    add(ellipsoid([s * 0.1, 0.5, 0.035], [0.018, 0.022, 0.01], dim), 'skeletal-system', 'Patella');
    add(capsuleBetween([s * 0.098, 0.485, 0], [s * 0.092, 0.08, 0], 0.015, dim), 'skeletal-system', 'Tibia');
    add(capsuleBetween([s * 0.125, 0.465, -0.012], [s * 0.118, 0.08, -0.01], 0.007, dim), 'skeletal-system', 'Fibula');
    add(ellipsoid([s * 0.095, 0.03, 0.055], [0.032, 0.022, 0.1], dim), 'skeletal-system', 'Foot');
  }
  return g;
}

function buildSkin(M) {
  const g = new THREE.Group();
  const skin = M(COLORS.skin, { transparent: true, opacity: 0.14, depthWrite: false, roughness: 0.4, tissue: 'skin', repeat: [8, 12] });
  const add = (m) => {
    pick(m, 'body', 'Body');
    m.userData.pickPriority = -1; // skin never blocks a click on what is inside
    g.add(m);
  };
  add(ellipsoid([0, 1.625, 0.01], [0.098, 0.122, 0.112], skin, 32));
  add(capsuleBetween([0, 1.44, 0], [0, 1.54, 0.005], 0.05, skin));
  const profile = [
    [0.0, 0.86], [0.13, 0.88], [0.175, 0.96], [0.15, 1.06], [0.14, 1.12],
    [0.165, 1.26], [0.18, 1.36], [0.19, 1.42], [0.12, 1.47], [0.0, 1.49],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const torso = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), skin);
  torso.scale.z = 0.62;
  add(torso);
  for (const s of SIDES) {
    add(capsuleBetween([s * 0.195, 1.41, 0], [s * 0.25, 1.12, -0.01], 0.045, skin));
    add(capsuleBetween([s * 0.25, 1.12, 0], [s * 0.29, 0.86, 0.005], 0.036, skin));
    add(ellipsoid([s * 0.3, 0.79, 0.0], [0.028, 0.06, 0.018], skin));
    add(capsuleBetween([s * 0.1, 0.9, 0.0], [s * 0.1, 0.5, 0.01], 0.075, skin));
    add(capsuleBetween([s * 0.1, 0.5, 0.0], [s * 0.094, 0.09, 0.0], 0.052, skin));
    add(ellipsoid([s * 0.095, 0.035, 0.055], [0.042, 0.035, 0.11], skin));
  }
  return g;
}

function buildMuscles(M) {
  const g = new THREE.Group();
  const m = M(COLORS.muscle, { roughness: 0.5, tissue: 'muscle', repeat: [1, 3] });
  const add = (mesh, label, card = 'muscular-system') => g.add(pick(mesh, card, label));
  for (const s of SIDES) {
    add(ellipsoid([s * 0.1, 0.72, 0.03], [0.058, 0.17, 0.055], m), 'Quadriceps');
    add(ellipsoid([s * 0.1, 0.7, -0.035], [0.05, 0.16, 0.045], m), 'Hamstrings');
    add(ellipsoid([s * 0.096, 0.31, -0.03], [0.042, 0.12, 0.042], m), 'Calf');
    add(ellipsoid([s * 0.085, 0.93, -0.07], [0.07, 0.08, 0.05], m), 'Gluteal muscles');
    add(ellipsoid([s * 0.195, 1.4, 0], [0.05, 0.06, 0.05], m), 'Deltoid');
    add(ellipsoid([s * 0.225, 1.27, 0.02], [0.028, 0.09, 0.028], m), 'Biceps', 'biceps');
    add(ellipsoid([s * 0.225, 1.27, -0.025], [0.03, 0.09, 0.03], m), 'Triceps');
    add(ellipsoid([s * 0.27, 0.99, 0], [0.03, 0.1, 0.028], m), 'Forearm muscles');
    add(ellipsoid([s * 0.08, 1.32, 0.085], [0.08, 0.06, 0.028], m), 'Pectoralis');
  }
  add(ellipsoid([0, 1.1, 0.09], [0.07, 0.13, 0.025], m), 'Abdominal muscles');
  return g;
}

function buildCirculatory(M) {
  const g = new THREE.Group();
  const art = M(COLORS.artery, { roughness: 0.4, tissue: 'vessel' });
  const vein = M(COLORS.vein, { roughness: 0.4, tissue: 'vein' });
  const heart = ellipsoid([0.02, 1.25, 0.04], [0.048, 0.06, 0.042], art);
  heart.rotation.z = -0.4;
  g.add(pick(heart, 'heart', 'Heart'));
  const vessel = (pts, r, material, label) => g.add(pick(tubeThrough(pts, r, material, 64, 8), 'circulatory-system', label));
  vessel([[0.01, 1.28, 0.03], [0.02, 1.335, 0.02], [-0.005, 1.335, -0.02], [-0.01, 1.2, -0.035], [0, 1.0, -0.03], [0, 0.95, -0.02]], 0.011, art, 'Aorta');
  vessel([[0.035, 1.22, 0.02], [0.03, 1.1, -0.02], [0.012, 0.95, -0.01]], 0.01, vein, 'Vena cava');
  for (const s of SIDES) {
    vessel([[0, 0.95, -0.02], [s * 0.075, 0.88, 0.02], [s * 0.1, 0.62, 0.025], [s * 0.1, 0.3, -0.015], [s * 0.095, 0.08, 0.02]], 0.0055, art, 'Femoral artery');
    vessel([[0.012, 0.95, -0.005], [s * 0.088, 0.88, 0.035], [s * 0.112, 0.62, 0.035], [s * 0.112, 0.3, -0.005], [s * 0.105, 0.08, 0.03]], 0.0055, vein, 'Femoral vein');
    vessel([[s * 0.01, 1.335, 0.02], [s * 0.03, 1.5, 0.02], [s * 0.045, 1.6, 0.0]], 0.0045, art, 'Carotid artery');
    vessel([[s * 0.01, 1.335, 0.01], [s * 0.14, 1.39, 0.0], [s * 0.22, 1.25, 0.02], [s * 0.27, 1.0, 0.02], [s * 0.3, 0.82, 0.0]], 0.0045, art, 'Arm artery');
    vessel([[s * 0.04, 1.36, 0.0], [s * 0.15, 1.4, -0.012], [s * 0.232, 1.25, -0.005], [s * 0.28, 1.0, -0.005], [s * 0.305, 0.83, -0.01]], 0.0045, vein, 'Arm vein');
  }
  return g;
}

function buildNervous(M) {
  const g = new THREE.Group();
  const n = M(COLORS.nerve, { roughness: 0.45, emissive: COLORS.nerve, emissiveIntensity: 0.12, tissue: 'nerve' });
  g.add(pick(ellipsoid([0, 1.655, -0.005], [0.072, 0.058, 0.088], M(0xf0d68a, { roughness: 0.6, tissue: 'brain' })), 'brain', 'Brain'));
  const nerve = (pts, r, label) => g.add(pick(tubeThrough(pts, r, n, 64, 6), 'nervous-system', label));
  nerve([[0, 1.6, -0.02], [0, 1.5, -0.035], [0, 1.3, -0.055], [0, 1.1, -0.04], [0, 1.02, -0.035]], 0.006, 'Spinal cord');
  for (const s of SIDES) {
    nerve([[0, 1.02, -0.045], [s * 0.06, 0.93, -0.065], [s * 0.1, 0.75, -0.05], [s * 0.1, 0.5, -0.035], [s * 0.1, 0.3, -0.03], [s * 0.095, 0.07, -0.01]], 0.0045, 'Sciatic nerve');
    nerve([[0, 1.45, -0.04], [s * 0.1, 1.4, -0.02], [s * 0.21, 1.27, 0.0], [s * 0.26, 1.02, 0.005], [s * 0.3, 0.8, 0.005]], 0.0035, 'Arm nerves');
    for (let k = 0; k < 6; k++) {
      const y = 1.34 - k * 0.045;
      nerve([[0, y, -0.05], [s * 0.1, y - 0.01, -0.03], [s * 0.13, y - 0.03, 0.04]], 0.0018, 'Intercostal nerve');
    }
  }
  return g;
}

function buildRespiratory(M) {
  const g = new THREE.Group();
  const airway = M(0xf3c1cf, { roughness: 0.5 });
  const lung = M(COLORS.lung, { roughness: 0.7, transparent: true, opacity: 0.82, tissue: 'lung' });
  g.add(pick(tubeThrough([[0, 1.5, 0.035], [0, 1.42, 0.035], [0, 1.34, 0.03]], 0.009, airway, 24, 10), 'respiratory-system', 'Trachea'));
  for (const s of SIDES) {
    g.add(pick(tubeThrough([[0, 1.34, 0.03], [s * 0.035, 1.3, 0.02], [s * 0.06, 1.27, 0.01]], 0.0065, airway, 16, 8), 'respiratory-system', 'Bronchus'));
    const l = ellipsoid([s * 0.078, 1.27, 0.0], [0.062, 0.12, 0.068], lung);
    g.add(pick(l, 'respiratory-system', s < 0 ? 'Right lung' : 'Left lung'));
  }
  return g;
}

function buildImmune(M) {
  const g = new THREE.Group();
  const node = M(COLORS.lymph, { roughness: 0.4, emissive: COLORS.lymph, emissiveIntensity: 0.15 });
  const duct = M(COLORS.lymph, { roughness: 0.5, transparent: true, opacity: 0.7 });
  const add = (mesh, label) => g.add(pick(mesh, 'immune-system', label));
  const clusters = [
    [0.045, 1.5, 0.03], [0.15, 1.33, 0.0], [0.08, 0.88, 0.05], [0.03, 1.05, 0.0],
  ];
  for (const [x, y, z] of clusters) {
    for (const s of SIDES) {
      for (let i = 0; i < 3; i++) {
        add(ellipsoid([s * (x + i * 0.008), y - i * 0.014, z + (i % 2) * 0.01], [0.008, 0.007, 0.007], node, 10), 'Lymph node');
      }
    }
  }
  add(ellipsoid([0, 1.36, 0.075], [0.025, 0.03, 0.012], node), 'Thymus');
  add(ellipsoid([0.085, 1.12, -0.04], [0.028, 0.05, 0.02], M(0x8a4f7d, { roughness: 0.6, tissue: 'organ' })), 'Spleen');
  add(tubeThrough([[0.0, 1.0, -0.02], [0.0, 1.2, -0.03], [-0.01, 1.4, -0.01], [-0.03, 1.46, 0.02]], 0.0025, duct, 32, 6), 'Thoracic duct');
  for (const s of SIDES) {
    add(tubeThrough([[s * 0.08, 0.88, 0.05], [s * 0.04, 0.96, 0.01], [0, 1.0, -0.02]], 0.002, duct, 16, 6), 'Lymphatic vessel');
  }
  return g;
}

function build({ mode = 'body', systems = DEFAULT_SYSTEMS } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const skeletonOnly = mode === 'skeleton';
  const groups = {
    skin: buildSkin(M),
    skeletal: buildSkeleton(M, skeletonOnly),
    muscular: buildMuscles(M),
    circulatory: buildCirculatory(M),
    nervous: buildNervous(M),
    respiratory: buildRespiratory(M),
    immune: buildImmune(M),
  };
  for (const [id, grp] of Object.entries(groups)) {
    grp.name = id;
    grp.visible = skeletonOnly ? id === 'skeletal' : systems.includes(id);
    root.add(grp);
  }

  // A faint stage disc so the figure reads as standing somewhere.
  const floor = new THREE.Mesh(
    new THREE.RingGeometry(0.0, 0.55, 64),
    M.basic(COLORS.hematoxylin, { transparent: true, opacity: 0.12, depthWrite: false }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.002;
  root.add(floor);

  // Focus: the left femur (viewer's right), which the dive enters next.
  const femurCenter = [0.112, 0.71, 0.005];

  return {
    root,
    metersPerUnit: 1,
    view: skeletonOnly
      ? { target: [0.1, 0.72, 0], direction: [0.42, 0.12, 1] }
      : { target: [0, 0.78, 0], direction: [0.28, 0.08, 1] },
    focus: femurCenter,
    setSystems(list) {
      if (skeletonOnly) return;
      for (const [id, grp] of Object.entries(groups)) grp.visible = list.includes(id);
    },
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}

export const buildBody = (opts) => build({ ...opts, mode: 'body' });
export const buildSkeletonScene = (opts) => build({ ...opts, mode: 'skeleton' });
