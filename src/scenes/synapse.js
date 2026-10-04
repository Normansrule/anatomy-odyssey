// Tier 6: a chemical synapse. 1 scene unit = 10 nm.
// Above: the presynaptic terminal (bouton) full of vesicles, cut open.
// Below: a dendritic spine with its postsynaptic density and receptors.
// Between them: the synaptic cleft, about 20 nm (2 units) wide.
// The stage control steps through one release: calcium enters, a vesicle
// fuses, glutamate crosses the cleft, receptors open, the cleft clears.
// Molecules are drawn larger than life so they can be seen.
import * as THREE from 'three/webgpu';
import { materialBank, pick, capsuleBetween, seeded, disposeTree } from './kit.js';
import { diffusionTime, D_GLUTAMATE, SYNAPTIC_CLEFT_M } from '../science/equations.js';

const CUT_CENTER = Math.atan2(0.45, 0.88); // lathe phi facing the default camera (x = r·sin φ, z = r·cos φ)
const CUT_HALF = Math.PI / 3.4;
const VESICLE_R = 2; // 40 nm diameter

const PRE = [[0, 1], [24, 1], [33, 6], [41, 20], [43, 38], [39, 58], [30, 74], [17, 86], [10, 96], [9, 130]];
const POST = [[0, -1], [24, -1], [32, -6], [36, -18], [33, -32], [22, -44], [10, -52], [7, -60], [7, -84]];

const STAGES = [
  { label: 'Resting', text: 'Resting. Vesicles packed with glutamate wait at the active zone, docked and primed.' },
  { label: 'Spike arrives', text: 'A spike arrives. Voltage-gated channels open and calcium ions rush into the terminal.' },
  { label: 'Vesicle fuses', text: 'Calcium triggers fusion: the vesicle merges with the membrane and empties several thousand glutamate molecules into the cleft.' },
  { label: 'Receptors open', text: '' },
  { label: 'Cleared', text: 'Transporters pull glutamate away within milliseconds, the receptors close, and the vesicle membrane is recycled.' },
];

function radiusAt(profile, y) {
  for (let i = 0; i < profile.length - 1; i++) {
    const [r0, y0] = profile[i];
    const [r1, y1] = profile[i + 1];
    if ((y >= y0 && y <= y1) || (y <= y0 && y >= y1)) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
  }
  return 0;
}

export function buildSynapse({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(17);
  const phiStart = CUT_CENTER + CUT_HALF;
  const phiLength = Math.PI * 2 - 2 * CUT_HALF;
  const lathe = (profile) => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 64, phiStart, phiLength);

  // Presynaptic terminal (bouton).
  const preGeo = lathe(PRE);
  root.add(pick(new THREE.Mesh(preGeo, M(0xf0a8c4, { roughness: 0.45, side: THREE.FrontSide })), 'axon-terminal', 'Presynaptic terminal'));
  root.add(pick(new THREE.Mesh(preGeo, M(0x8e4f73, { roughness: 0.7, side: THREE.BackSide })), 'neuron-membrane', 'Presynaptic membrane (inside)'));
  // Postsynaptic dendritic spine, and the dendrite shaft it grows from.
  const postGeo = lathe(POST);
  root.add(pick(new THREE.Mesh(postGeo, M(0xb9a6ee, { roughness: 0.45, side: THREE.FrontSide })), 'dendritic-spine', 'Dendritic spine (postsynaptic)'));
  root.add(pick(new THREE.Mesh(postGeo, M(0x5b4a9a, { roughness: 0.7, side: THREE.BackSide })), 'neuron-membrane', 'Postsynaptic membrane (inside)'));
  const shaft = capsuleBetween([-70, -98, 0], [70, -98, 0], 16, M(0xb9a6ee, { roughness: 0.5 }), 24);
  root.add(pick(shaft, 'neuron-dendrites', 'Dendrite shaft'));

  // The cleft: a faint disc of extracellular space.
  const cleft = new THREE.Mesh(new THREE.CylinderGeometry(26, 26, 2, 48), M(0x9fd4ff, { transparent: true, opacity: 0.14, depthWrite: false }));
  root.add(pick(cleft, 'synaptic-cleft', 'Synaptic cleft'));

  // Postsynaptic density: a thick protein mat under the receptors.
  const psd = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 3, 40), M(0x3d2f8c, { roughness: 0.8 }));
  psd.position.y = -2.7;
  root.add(pick(psd, 'postsynaptic-density', 'Postsynaptic density'));

  // Glutamate receptors (AMPA-type) standing in the postsynaptic membrane.
  const receptorMat = M(0x7cc49a, { roughness: 0.4, emissive: 0x7cc49a, emissiveIntensity: 0 });
  const receptorGeo = new THREE.CylinderGeometry(0.75, 0.9, 1.9, 10);
  const recPos = [];
  for (let i = 0; i < 40 && recPos.length < 28; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 16;
    const p = new THREE.Vector3(Math.cos(a) * r, -0.9, Math.sin(a) * r);
    if (recPos.every((o) => o.distanceTo(p) > 2.6)) recPos.push(p);
  }
  const receptors = new THREE.InstancedMesh(receptorGeo, receptorMat, recPos.length);
  const m4 = new THREE.Matrix4();
  recPos.forEach((p, i) => receptors.setMatrixAt(i, m4.makeTranslation(p.x, p.y, p.z)));
  root.add(pick(receptors, 'glutamate-receptor', 'Glutamate receptor'));

  // Active zone: calcium channels at the release site.
  const caMat = M(0xe8c45a, { roughness: 0.4 });
  const caChannels = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const p = new THREE.Vector3(Math.cos(a) * 12, 1.2, Math.sin(a) * 12);
    const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 2.2, 10), caMat);
    ch.position.copy(p);
    root.add(pick(ch, 'calcium-signal', 'Calcium channel'));
    caChannels.push(p);
  }

  // Synaptic vesicles: a docked row at the membrane and a reserve pool above.
  const vesMat = M(0xfff0f6, { roughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false });
  const vesGeo = new THREE.SphereGeometry(VESICLE_R, 16, 12);
  const docked = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.2;
    docked.push(new THREE.Vector3(Math.cos(a) * 7, 3.3, Math.sin(a) * 7));
  }
  docked[0].set(4, 3.3, 7); // the one that will fuse, toward the camera
  const pool = [];
  while (pool.length < 55) {
    const y = 6 + rand() * 44;
    const rMax = radiusAt(PRE, y) - VESICLE_R - 2;
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * rMax;
    const p = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    if ([...pool, ...docked].every((o) => o.distanceTo(p) > VESICLE_R * 2.2)) pool.push(p);
  }
  for (const p of [...docked.slice(1), ...pool]) {
    const v = new THREE.Mesh(vesGeo, vesMat);
    v.position.copy(p);
    root.add(pick(v, 'synaptic-vesicle', 'Synaptic vesicle'));
  }
  const fusing = new THREE.Mesh(vesGeo, vesMat);
  root.add(pick(fusing, 'synaptic-vesicle', 'Synaptic vesicle (fusing)'));

  // Mitochondrion powering the terminal.
  root.add(pick(capsuleBetween([-24, 44, -12], [4, 52, -18], 6.5, M(0xe0955f, { roughness: 0.55 }), 18), 'mitochondrion', 'Mitochondrion'));

  // Glutamate molecules (enlarged) that start inside the fusing vesicle.
  const gluGeo = new THREE.SphereGeometry(0.42, 8, 6);
  const glu = new THREE.InstancedMesh(gluGeo, M(0xf2a65a, { roughness: 0.35, emissive: 0xf2a65a, emissiveIntensity: 0.3 }), 44);
  const gluDirs = Array.from({ length: glu.count }, () => {
    const a = rand() * Math.PI * 2;
    return { dir: new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), inner: new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(2.4), reach: 6 + rand() * 18, yJit: rand() * 1.4 - 0.7 };
  });
  root.add(pick(glu, 'neurotransmitter', 'Glutamate (enlarged)'));

  // Ions: calcium entering the terminal, sodium entering the spine.
  const ionGeo = new THREE.SphereGeometry(0.55, 8, 6);
  const ca = new THREE.InstancedMesh(ionGeo, M(0xe8c45a, { roughness: 0.3, emissive: 0xe8c45a, emissiveIntensity: 0.4 }), 18);
  const na = new THREE.InstancedMesh(ionGeo, M(0x5a8deb, { roughness: 0.3, emissive: 0x5a8deb, emissiveIntensity: 0.4 }), 24);
  root.add(pick(ca, 'calcium-signal', 'Calcium ion (Ca²⁺)'));
  root.add(pick(na, 'glutamate-receptor', 'Sodium ion (Na⁺) entering'));
  const caPaths = Array.from({ length: ca.count }, (_, i) => ({ from: caChannels[i % 6], lift: 3 + rand() * 7, spread: new THREE.Vector3(rand() - 0.5, 0, rand() - 0.5).multiplyScalar(5) }));
  const naPaths = Array.from({ length: na.count }, (_, i) => ({ at: recPos[i % recPos.length], depth: 4 + rand() * 9 }));

  const clamp01 = (x) => Math.min(1, Math.max(0, x));
  const hide = new THREE.Matrix4().makeScale(0, 0, 0);
  const tmp = new THREE.Vector3();
  const cleftMicros = (diffusionTime(SYNAPTIC_CLEFT_M, D_GLUTAMATE) * 1e6).toFixed(2);
  STAGES[3].text = `Glutamate crosses the 20 nm cleft in about ${cleftMicros} µs and opens receptors; sodium flows into the spine and the next cell is nudged toward firing.`;

  function apply(v) {
    // Calcium: stage 1 → 2.
    const fCa = clamp01(v - 1);
    const caOn = v >= 1 && v < 3.2;
    caPaths.forEach((p, i) => {
      if (!caOn) return ca.setMatrixAt(i, hide);
      tmp.copy(p.from).add(p.spread.clone().multiplyScalar(fCa));
      tmp.y = -1 + fCa * p.lift;
      ca.setMatrixAt(i, m4.makeTranslation(tmp.x, tmp.y, tmp.z));
    });
    ca.instanceMatrix.needsUpdate = true;

    // The fusing vesicle: drops onto the membrane and flattens into it.
    const fFuse = clamp01(v - 2);
    fusing.position.set(docked[0].x, 3.3 - fFuse * 2.3, docked[0].z);
    const s = v < 2 ? 1 : Math.max(0.001, 1 - fFuse);
    fusing.scale.set(1 + fFuse * 0.8, s, 1 + fFuse * 0.8);
    fusing.visible = v < 2.95 || v >= 3.9;
    if (v >= 3.9) {
      fusing.position.set(docked[0].x, 3.3, docked[0].z);
      fusing.scale.setScalar((v - 3.9) * 10);
    }

    // Glutamate: inside the vesicle, then spreading through the cleft, then cleared.
    const fOut = clamp01((v - 2.3) / 1.2);
    const fClear = clamp01(v - 3.5) / 0.5;
    gluDirs.forEach((g, i) => {
      if (v < 2.3) {
        tmp.copy(fusing.position).add(g.inner.clone().multiplyScalar(0.7 * fusing.scale.y + 0.1));
      } else {
        const r = g.reach * fOut + fClear * 14;
        tmp.set(docked[0].x + g.dir.x * r, THREE.MathUtils.lerp(1.6, g.yJit, clamp01(fOut * 3)), docked[0].z + g.dir.z * r);
      }
      const k = v >= 3.5 ? Math.max(0, 1 - fClear) : 1;
      glu.setMatrixAt(i, k > 0 ? m4.compose(tmp, new THREE.Quaternion(), new THREE.Vector3(k, k, k)) : hide);
    });
    glu.instanceMatrix.needsUpdate = true;

    // Receptors glow while bound; sodium flows in.
    const open = v >= 2.9 && v < 3.9 ? Math.sin(clamp01((v - 2.9) / 1.0) * Math.PI) : 0;
    receptorMat.emissiveIntensity = open * 1.1;
    naPaths.forEach((p, i) => {
      if (open < 0.05) return na.setMatrixAt(i, hide);
      const f = clamp01((v - 2.9) / 1.0);
      na.setMatrixAt(i, m4.makeTranslation(p.at.x, -1 - f * p.depth, p.at.z));
    });
    na.instanceMatrix.needsUpdate = true;

    const stage = STAGES[Math.min(4, Math.floor(v + 1e-6))];
    controls.readout = stage.text;
  }

  const controls = {
    label: 'Stage',
    unit: '',
    min: 0,
    max: 4,
    step: 0.01,
    value: reducedMotion ? 3.2 : 0,
    format: (v) => STAGES[Math.min(4, Math.floor(v + 1e-6))].label,
    presets: [...STAGES.map((s, i) => ({ label: s.label, value: i })), { label: 'Play or pause', action: 'play' }],
    playing: !reducedMotion,
    readout: '',
    set(v) {
      controls.value = v;
      apply(v);
      return controls.readout;
    },
  };
  apply(controls.value);
  let phase = controls.value;

  return {
    root,
    fit: 'both',
    metersPerUnit: 1e-8,
    view: { target: [0, 10, 0], direction: [0.45, 0.16, 0.88] },
    focus: docked[0].toArray(),
    branchFocus: [10, -1.5, 16],
    controls,
    update(dt) {
      if (!controls.playing) {
        phase = controls.value;
        return;
      }
      phase = (phase + dt * 0.6) % 4.6; // hold briefly at the end before repeating
      controls.value = Math.min(4, phase);
      apply(controls.value);
    },
    dispose() {
      preGeo.dispose();
      postGeo.dispose();
      receptorGeo.dispose();
      vesGeo.dispose();
      gluGeo.dispose();
      ionGeo.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}

