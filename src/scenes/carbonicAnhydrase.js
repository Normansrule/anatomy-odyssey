// Module scene: carbonic anhydrase II, one of the fastest enzymes known.
// 1 scene unit = 1 Å.
//
// The protein is drawn as 260 beads, one per amino acid, packed inside its
// real outline (about 40 × 42 × 55 Å) around a cone-shaped cleft 15 Å deep,
// with the zinc ion at the bottom held by three histidines (94, 96 and 119).
// The bead positions are not the real fold; the zinc site, the cleft depth
// and the proton shuttle (histidine 64) follow the crystal structures.
//
// The animation runs the catalytic cycle:
//   Zn–OH⁻ + CO₂ → Zn–HCO₃⁻ → (water swaps in) Zn–H₂O → (H⁺ leaves via His64) Zn–OH⁻
// and the control sets how far the enzyme lowers the reaction's energy barrier.
import * as THREE from 'three/webgpu';
import { materialBank, pick, seeded, disposeTree, cylinderBetween } from './kit.js';
import { buildMolecule, ELEMENTS } from '../library/molecule.js';
import { smallMolecule, carbonDioxide, imidazole } from './chem.js';
import { barrierDrop, speedupFromBarrier, CA2_KCAT, CO2_HYDRATION_K, meanWait } from '../science/chemistry.js';

export const CA2 = {
  residues: 260,
  radii: [27.5, 20, 21], // Å; long axis along x
  cleftDepth: 15, // Å, mouth to zinc
  cleftMouth: 13, // Å radius at the surface (widened about 1.5 times so the zinc site can be seen)
  cleftFloor: 4.5, // Å radius at the level of the zinc
  znN: 2.05, // Å, zinc–nitrogen
  znO: 2.0, // Å, zinc–oxygen
};
/** The barrier drop that gives carbonic anhydrase's speed-up (kcat / k_uncat). */
export const CA2_BARRIER_DROP_KJ = barrierDrop(CA2_KCAT / CO2_HYDRATION_K) / 1000;

const UP = new THREE.Vector3(0, 0, 1);
const ZN = new THREE.Vector3(0, 0, CA2.radii[2] - CA2.cleftDepth);

/** Is point p inside the cleft (a cone opening along +z from just below the zinc)? */
function inCleft(p, margin) {
  const h = p.z - ZN.z;
  if (h < 0) return Math.hypot(p.x, p.y, h) < CA2.cleftFloor + margin;
  const r = CA2.cleftFloor + ((CA2.cleftMouth - CA2.cleftFloor) * h) / CA2.cleftDepth;
  return Math.hypot(p.x, p.y) < r + margin;
}

/** Bead centers: best-candidate sampling inside the ellipsoid, outside the cleft. */
export function enzymeBeads(n = CA2.residues, seed = 64) {
  const rand = seeded(seed);
  const [a, b, c] = CA2.radii.map((r) => r - 2.6);
  const candidate = () => {
    for (;;) {
      const p = new THREE.Vector3((rand() * 2 - 1) * a, (rand() * 2 - 1) * b, (rand() * 2 - 1) * c);
      if ((p.x / a) ** 2 + (p.y / b) ** 2 + (p.z / c) ** 2 <= 1 && !inCleft(p, 3.4)) return p;
    }
  };
  const beads = [];
  for (let i = 0; i < n; i++) {
    let best = null;
    let bestD = -1;
    for (let k = 0; k < 14; k++) {
      const p = candidate();
      let d = Infinity;
      for (const q of beads) d = Math.min(d, p.distanceToSquared(q));
      if (d > bestD) {
        bestD = d;
        best = p;
      }
    }
    beads.push(best);
  }
  return beads;
}

const fmtTime = (s) => {
  const units = [[1, 's'], [1e-3, 'ms'], [1e-6, 'µs'], [1e-9, 'ns']];
  const [u, name] = units.find(([x]) => s >= x * 0.9995) ?? units.at(-1);
  const v = s / u;
  return `${v >= 9.95 ? Math.round(v) : Math.round(v * 10) / 10} ${name}`;
};
const fmtTimes = (x) => {
  if (x < 1000) return `${Math.round(x)}`;
  const e = Math.floor(Math.log10(x));
  const words = { 3: 'thousand', 6: 'million', 9: 'billion' };
  const w = Math.floor(e / 3) * 3;
  return `${Math.round(x / 10 ** w)} ${words[w]}`;
};

export function caReadout(kj) {
  const speed = speedupFromBarrier(kj * 1000);
  const wait = meanWait(CO2_HYDRATION_K * speed);
  const head = kj < 0.5
    ? `No catalyst. On its own, a dissolved CO₂ molecule takes about ${fmtTime(wait)} on average to react with water.`
    : `Barrier lowered by ${kj.toFixed(1)} kJ/mol → about ${fmtTimes(speed)} times faster (every 5.9 kJ/mol is another factor of ten). A CO₂ in the pocket reacts in about ${fmtTime(wait)}.`;
  return Math.abs(kj - CA2_BARRIER_DROP_KJ) < 0.6
    ? `${head} That is carbonic anhydrase: about a million CO₂ per second per enzyme.`
    : head;
}

export function buildCarbonicAnhydrase({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();

  // ── Protein beads: the body, and the two walls of the cleft. ──
  const beads = enzymeBeads();
  const sphere = new THREE.SphereGeometry(1, 16, 12);
  const groups = { body: [], hydrophobic: [], hydrophilic: [] };
  for (const p of beads) {
    const nearCleft = p.z > ZN.z - 1 && inCleft(p, 5.2);
    groups[nearCleft ? (p.x < 0 ? 'hydrophobic' : 'hydrophilic') : 'body'].push(p);
  }
  const beadSpec = {
    body: { color: 0xf08baf, card: 'carbonic-anhydrase', label: 'Carbonic anhydrase (one bead per amino acid)' },
    hydrophobic: { color: 0xe8c45a, card: 'enzyme-active-site', label: 'Active-site wall: water-avoiding side (holds CO₂)' },
    hydrophilic: { color: 0x8fb4f0, card: 'enzyme-active-site', label: 'Active-site wall: water-loving side (water network)' },
  };
  const m4 = new THREE.Matrix4();
  const rand = seeded(7);
  for (const [key, list] of Object.entries(groups)) {
    const spec = beadSpec[key];
    const mesh = new THREE.InstancedMesh(sphere, M(spec.color, { roughness: 0.55, transparent: key === 'body', opacity: key === 'body' ? 0.92 : 1 }), list.length);
    const col = new THREE.Color();
    list.forEach((p, i) => {
      m4.compose(p, new THREE.Quaternion(), new THREE.Vector3().setScalar(key === 'body' ? 3.2 + rand() * 0.4 : 2.6 + rand() * 0.3));
      mesh.setMatrixAt(i, m4);
      mesh.setColorAt(i, col.setHex(spec.color).offsetHSL(0, 0, (rand() - 0.5) * 0.08));
    });
    root.add(pick(mesh, spec.card, spec.label));
  }

  // ── Zinc and its three histidines. ──
  const zinc = new THREE.Mesh(sphere, M(0x9fb4d8, { roughness: 0.25, metalness: 0.3, emissive: 0x6f86c8, emissiveIntensity: 0.5 }));
  zinc.scale.setScalar(0.88);
  zinc.position.copy(ZN);
  root.add(pick(zinc, 'zinc-ion', 'Zinc ion (Zn²⁺)'));
  const tet = Math.acos(-1 / 3);
  const hisNames = ['Histidine 94', 'Histidine 96', 'Histidine 119'];
  const coordMat = M(0xbfd0f0, { roughness: 0.4, transparent: true, opacity: 0.7 });
  hisNames.forEach((name, k) => {
    const phi = (k * 2 * Math.PI) / 3 + 0.4;
    const d = new THREE.Vector3(Math.sin(tet) * Math.cos(phi), Math.sin(tet) * Math.sin(phi), Math.cos(tet));
    const u = new THREE.Vector3().crossVectors(d, UP).normalize();
    const nAt = ZN.clone().addScaledVector(d, CA2.znN);
    const ring = imidazole(nAt, d, u, { card: 'zinc-histidines', label: `${name} (holds the zinc)` });
    root.add(buildMolecule(ring.atoms, ring.bonds, M, { defaultCard: 'zinc-histidines' }).group);
    root.add(pick(cylinderBetween(ZN.toArray(), nAt.toArray(), 0.12, 0.12, coordMat, 8), 'zinc-histidines', `${name}: zinc–nitrogen bond`));
  });

  // Histidine 64 on the cleft wall: the proton shuttle.
  const his64N = new THREE.Vector3(5.2, 1.2, ZN.z + 6.5);
  const his64 = imidazole(his64N, new THREE.Vector3(1, 0.1, 0.25).normalize(), new THREE.Vector3(0, 1, 0), { card: 'proton-shuttle', label: 'Histidine 64 (proton shuttle)' });
  root.add(buildMolecule(his64.atoms, his64.bonds, M, { defaultCard: 'proton-shuttle' }).group);

  // ── The zinc-bound oxygen: hydroxide (one H) or water (two H). ──
  const ohO = ZN.clone().addScaledVector(UP, CA2.znO);
  const bound = buildMolecule(
    [
      { el: 'O', p: new THREE.Vector3(), card: 'zinc-ion', label: 'Zinc-bound hydroxide (OH⁻)' },
      { el: 'H', p: new THREE.Vector3(0.55, 0, 0.79), card: 'zinc-ion', label: 'Zinc-bound hydroxide (OH⁻)' },
      { el: 'H', p: new THREE.Vector3(-0.55, 0.2, 0.77), card: 'proton-shuttle', label: 'The proton that leaves' },
    ],
    [[0, 1, 1], [0, 2, 1]],
    M,
    { defaultCard: 'zinc-ion' },
  );
  const boundGroup = new THREE.Group();
  boundGroup.position.copy(ohO);
  boundGroup.add(bound.group);
  root.add(boundGroup);
  root.add(pick(cylinderBetween(ZN.toArray(), ohO.toArray(), 0.12, 0.12, coordMat, 8), 'zinc-ion', 'Zinc–oxygen bond'));
  const boundH2 = bound.group.children.filter((c) => c.isMesh)[2];
  const boundSticks = bound.group.children.find((c) => c.isGroup);
  const secondBond = boundSticks.children[1];

  // ── Moving molecules. ──
  const co2 = carbonDioxide(M);
  const co2Group = new THREE.Group().add(co2.group);
  const hco3 = smallMolecule('hco3', M, { card: 'bicarbonate', label: 'Bicarbonate (HCO₃⁻)' });
  const hco3Group = new THREE.Group().add(hco3.group);
  const water = smallMolecule('water', M, { card: 'water-molecule', label: 'Water (H₂O)' });
  const waterGroup = new THREE.Group().add(water.group);
  const proton = new THREE.Mesh(sphere, M(ELEMENTS.H.color, { roughness: 0.3, emissive: 0xf2a65a, emissiveIntensity: 0.9 }));
  proton.scale.setScalar(0.42);
  pick(proton, 'proton-shuttle', 'Proton (H⁺) on its way out');
  root.add(co2Group, hco3Group, waterGroup, proton);

  const P = {
    co2Start: new THREE.Vector3(-9, 7, 36),
    pocket: new THREE.Vector3(-2.2, 0.9, ohO.z + 2.1),
    hco3At: ohO.clone().add(new THREE.Vector3(-0.6, 0.3, 1.4)),
    hco3End: new THREE.Vector3(7, -8, 36),
    waterStart: new THREE.Vector3(10, 8, 36),
    protonOut: new THREE.Vector3(12, 5, 32),
  };
  const ease = (x) => x * x * (3 - 2 * x);
  const seg = (t, a, b) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
  let kj = CA2_BARRIER_DROP_KJ;
  let phase = reducedMotion ? 0.36 : 0;

  function pose(t) {
    const catalytic = kj >= 11.9; // below about a hundred-fold, nothing visibly happens while CO₂ visits
    // CO₂ in (0–0.3), then either reacts (0.3–0.38) or drifts back out (0.45–0.75).
    co2Group.position.lerpVectors(P.co2Start, P.pocket, seg(t, 0, 0.3));
    co2Group.rotation.set(t * 4, t * 3, 0.6);
    if (!catalytic) co2Group.position.lerp(P.co2Start, seg(t, 0.45, 0.75));
    const reacted = catalytic && t >= 0.38;
    co2Group.visible = !reacted;
    // Bicarbonate appears on the zinc and leaves up the cleft (0.45–0.7).
    hco3Group.visible = reacted && t < 0.72;
    hco3Group.position.lerpVectors(P.hco3At, P.hco3End, seg(t, 0.45, 0.7));
    hco3Group.rotation.set(0.4, t * 2, 0.2);
    // Water swaps in (0.45–0.7); the zinc-bound group is hidden while bicarbonate sits there.
    waterGroup.visible = catalytic && t >= 0.45 && t < 0.7;
    waterGroup.position.lerpVectors(P.waterStart, ohO, seg(t, 0.45, 0.7));
    boundGroup.visible = !(reacted && t < 0.7);
    const isWater = catalytic && t >= 0.7 && t < 0.74;
    boundH2.visible = isWater;
    secondBond.visible = isWater;
    // The proton hops to histidine 64 and out (0.74–0.92).
    proton.visible = catalytic && t >= 0.74 && t < 0.93;
    const h0 = ohO.clone().add(new THREE.Vector3(-0.55, 0.2, 0.77));
    const toHis = seg(t, 0.74, 0.82);
    const toOut = seg(t, 0.82, 0.92);
    proton.position.lerpVectors(h0, his64N, toHis).lerp(P.protonOut, toOut);
  }

  const controls = {
    label: 'Barrier lowered',
    unit: 'kJ/mol',
    min: 0,
    max: 45,
    step: 0.1,
    value: CA2_BARRIER_DROP_KJ,
    format: (v) => v.toFixed(1),
    presets: [
      { label: 'No catalyst', value: 0 },
      { label: 'Halfway', value: Math.round(CA2_BARRIER_DROP_KJ * 5) / 10 },
      { label: 'Carbonic anhydrase', value: Math.round(CA2_BARRIER_DROP_KJ * 10) / 10 },
      { label: 'Play or pause', action: 'play' },
    ],
    playing: !reducedMotion,
    readout: '',
    set(v) {
      controls.value = v;
      kj = v;
      pose(phase);
      controls.readout = caReadout(v);
      return controls.readout;
    },
  };
  controls.set(controls.value);

  return {
    root,
    fit: 'both',
    frameWidth: 7.4e-9, // keeps the whole enzyme in a portrait (phone) view
    metersPerUnit: 1e-10,
    view: { target: [0, 0, ZN.z + 3], direction: [0.16, 0.24, 1] },
    focus: ZN.toArray(),
    controls,
    update(dt, env = {}) {
      if (!controls.playing || (env.reducedMotion ?? reducedMotion)) return;
      // Faster visible cycling for a lower barrier (the real cycle is a microsecond).
      phase = (phase + dt * (0.07 + 0.16 * Math.min(1, kj / CA2_BARRIER_DROP_KJ))) % 1;
      pose(phase);
    },
    dispose() {
      sphere.dispose();
      for (const m of [co2, hco3, water, bound]) m.sphere.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}
