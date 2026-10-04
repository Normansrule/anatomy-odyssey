// Gene-to-protein module scene. 1 scene unit = 1 nm.
// Left of the nuclear envelope is the nucleus, right is the cytoplasm.
// One stage control runs the whole story for the start of the human
// β-globin gene (HBB): RNA polymerase copies the gene into messenger RNA,
// the mRNA leaves through a nuclear pore, a ribosome reads it one codon at a
// time while tRNAs bring amino acids, and the chain folds.
// Sizes of the molecular machines are roughly real (pore ~100 nm, ribosome
// ~25 nm, polymerase ~15 nm, DNA 2 nm). The mRNA's nucleotides are spaced out
// about 3× for visibility, only 11 of the 147 codons are drawn, and every
// step is slowed down enormously.
import * as THREE from 'three/webgpu';
import { COLORS, materialBank, pick, ellipsoid, capsuleBetween, seeded, disposeTree } from './kit.js';
import { BASE_COLORS } from '../library/nucleotides.js';
import { GENETIC_CODE, AMINO_NAMES, transcribe, HBB_START_DNA } from '../science/equations.js';
import { MOLECULES } from '../library/molecules.js';

const BEAD = 1.9; // drawn spacing of mRNA nucleotides (real: about 0.6 nm)
const AA_STEP = 3.2;
const DNA_Y = -42;
const GENE_X = [-128, -50];
const ENV_X = 0;
const LANE_Y = 18; // mRNA lane in the cytoplasm
const LANE_X0 = 20;

export const MRNA_PARTS = (() => {
  const coding = transcribe(HBB_START_DNA);
  const beads = [];
  for (const b of 'ACACC') beads.push({ base: b, kind: 'utr' });
  for (let i = 0; i < coding.length; i++) beads.push({ base: coding[i], kind: 'codon', codon: Math.floor(i / 3) });
  const gapAt = beads.length;
  for (const b of 'UAA') beads.push({ base: b, kind: 'stop' });
  for (let i = 0; i < 8; i++) beads.push({ base: 'A', kind: 'polyA' });
  return { beads, gapAt, coding, codons: coding.length / 3 };
})();

const STAGES = ['Gene', 'Transcribe', 'Export', 'Translate', 'Fold'];
const GROUP_COLOR = { nonpolar: 0xf1e2b8, polar: 0x7cc49a, acidic: 0xe35d6a, basic: 0x5a8deb };
const ONE_TO_ID = Object.fromEntries(Object.entries(MOLECULES).filter(([, m]) => m.kind === 'amino-acid').map(([k, m]) => [m.code1, k]));

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};

export function buildGeneExpression({ reducedMotion = false } = {}) {
  const M = materialBank();
  const root = new THREE.Group();
  const rand = seeded(61);
  const { beads, gapAt, coding, codons } = MRNA_PARTS;
  const N = beads.length;
  const protein = Array.from({ length: codons }, (_, c) => GENETIC_CODE[coding.slice(c * 3, c * 3 + 3)]);

  // ── Nuclear envelope with one pore ─────────────────────────────────
  const envMat = M(0x9383e6, { roughness: 0.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
  const envShape = new THREE.Shape();
  // A thin slice through the envelope (like a section in a micrograph), not the whole sphere.
  envShape.moveTo(-22, -80);
  envShape.lineTo(22, -80);
  envShape.lineTo(22, 80);
  envShape.lineTo(-22, 80);
  envShape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, 38, 0, Math.PI * 2, true);
  envShape.holes.push(hole);
  const envGeo = new THREE.ShapeGeometry(envShape, 32);
  for (const dx of [-7, 7]) {
    const sheet = new THREE.Mesh(envGeo, envMat);
    sheet.rotation.y = Math.PI / 2;
    sheet.position.x = ENV_X + dx;
    root.add(pick(sheet, 'nuclear-envelope', 'Nuclear envelope (two membranes)'));
  }
  for (const dx of [-8, 8]) {
    // The pore complex: a ring on each face of the envelope.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(38, 2.5, 12, 48), M(COLORS.eosinPale, { roughness: 0.4 }));
    ring.rotation.y = Math.PI / 2;
    ring.position.x = ENV_X + dx;
    root.add(pick(ring, 'nuclear-pore', 'Nuclear pore complex'));
  }
  for (let k = 0; k < 8; k++) {
    // Eight spokes and the filaments of the pore's basket.
    const a = (k / 8) * Math.PI * 2;
    root.add(pick(capsuleBetween([ENV_X - 8, Math.cos(a) * 36, Math.sin(a) * 36], [ENV_X - 30, Math.cos(a) * 14, Math.sin(a) * 14], 1.2, M(COLORS.eosinPale, { roughness: 0.4 }), 6), 'nuclear-pore', 'Nuclear basket filament'));
  }

  // ── DNA: a long double helix along the bottom of the nucleus ──────
  const dnaPts = [[], []];
  for (let x = -160; x <= -22; x += 0.5) {
    const th = (x / 3.4) * Math.PI * 2;
    dnaPts[0].push(new THREE.Vector3(x, DNA_Y + Math.cos(th), Math.sin(th)));
    dnaPts[1].push(new THREE.Vector3(x, DNA_Y + Math.cos(th + 2.6), Math.sin(th + 2.6)));
  }
  const dnaMat = [M(0x8f7ff0, { roughness: 0.4 }), M(0xd2c9ff, { roughness: 0.4 })];
  const dnaCurves = dnaPts.map((pts) => new THREE.CatmullRomCurve3(pts));
  dnaCurves.forEach((c, s) => root.add(pick(new THREE.Mesh(new THREE.TubeGeometry(c, 600, 0.35, 5, false), dnaMat[s]), 'gene', 'DNA (the β-globin gene)')));
  // The gene itself: a faint band marking where it starts and ends.
  const geneBand = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, GENE_X[1] - GENE_X[0], 24, 1, true), M(0xf0b23e, { transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide }));
  geneBand.rotation.z = Math.PI / 2;
  geneBand.position.set((GENE_X[0] + GENE_X[1]) / 2, DNA_Y, 0);
  root.add(pick(geneBand, 'gene', 'The β-globin gene (HBB)'));

  // ── RNA polymerase ─────────────────────────────────────────────────
  const pol = new THREE.Group();
  pol.add(pick(ellipsoid([0, 2, 0], [8.5, 7, 7.5], M(0x7cc49a, { roughness: 0.5 }), 28), 'rna-polymerase', 'RNA polymerase II'));
  pol.add(pick(ellipsoid([-4, 6, 3], [4, 3.5, 3.5], M(0x5fae84, { roughness: 0.5 }), 18), 'rna-polymerase', 'RNA polymerase II'));
  root.add(pol);

  // ── mRNA nucleotides (beads) ──────────────────────────────────────
  const beadGeo = new THREE.SphereGeometry(0.95, 12, 9);
  const beadMeshes = beads.map((b, i) => {
    const m = new THREE.Mesh(beadGeo, M(BASE_COLORS[b.base], { roughness: 0.4 }));
    const card = b.kind === 'codon' || b.kind === 'stop' ? 'codon' : 'mrna';
    const label = b.kind === 'codon'
      ? `${b.base} in codon ${b.codon + 1} (${coding.slice(b.codon * 3, b.codon * 3 + 3)} → ${AMINO_NAMES[protein[b.codon]][0]})`
      : b.kind === 'stop' ? `${b.base} in the stop codon UAA` : b.kind === 'utr' ? `${b.base}, untranslated region` : 'Poly(A) tail';
    root.add(pick(m, card, label));
    m.userData.index = i;
    return m;
  });
  const cap = new THREE.Mesh(beadGeo, M(0xffffff, { roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.3 }));
  cap.scale.setScalar(1.35);
  root.add(pick(cap, 'mrna', '5′ cap'));
  const strand = new THREE.Mesh(new THREE.BufferGeometry(), M(0xc77dff, { roughness: 0.4 }));
  root.add(pick(strand, 'mrna', 'mRNA backbone'));
  const gapMark = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.35, 6, 20), M(0xffffff, { transparent: true, opacity: 0.6 }));
  root.add(pick(gapMark, 'mrna', 'Codons 12–147 skipped in this view'));

  // ── Ribosome, tRNA and the growing chain ──────────────────────────
  const ribo = new THREE.Group();
  const large = pick(ellipsoid([0, 9, 0], [13, 10, 11], M(0xe0b07a, { roughness: 0.55 }), 32), 'ribosome', 'Ribosome, large subunit');
  const small = pick(ellipsoid([0, -4, 0], [11, 5.5, 9], M(0xf0d2a0, { roughness: 0.55 }), 28), 'ribosome', 'Ribosome, small subunit');
  ribo.add(large, small);
  root.add(ribo);
  const trna = new THREE.Group();
  const trnaMat = M(0xe35d6a, { roughness: 0.45 });
  trna.add(capsuleBetween([0, 0, 0], [0, 8, 0], 1.2, trnaMat, 10), capsuleBetween([0, 8, 0], [5, 9.5, 0], 1.2, trnaMat, 10));
  const trnaAA = new THREE.Mesh(beadGeo, M(0xffffff, { roughness: 0.35 }));
  trnaAA.scale.setScalar(1.6);
  trnaAA.position.set(5.5, 11.5, 0);
  trna.add(trnaAA);
  trna.traverse((o) => pick(o, 'trna', 'Transfer RNA (tRNA) carrying an amino acid'));
  root.add(trna);
  const aaMeshes = protein.map((aa) => {
    const group = MOLECULES[ONE_TO_ID[aa]]?.group ?? 'nonpolar';
    const m = new THREE.Mesh(beadGeo, M(GROUP_COLOR[group], { roughness: 0.4, emissive: GROUP_COLOR[group], emissiveIntensity: 0.15 }));
    m.scale.setScalar(1.6);
    root.add(pick(m, 'polypeptide', `${AMINO_NAMES[aa][1][0].toUpperCase()}${AMINO_NAMES[aa][1].slice(1)} (${AMINO_NAMES[aa][0]})`));
    return m;
  });
  const chainGap = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.35, 6, 20), M(0xffffff, { transparent: true, opacity: 0.6 }));
  root.add(pick(chainGap, 'polypeptide', 'Amino acids 12–147 skipped in this view'));

  // ── Layouts ───────────────────────────────────────────────────────
  // Where each bead sits once transcribed (in a loose coil above the polymerase's path).
  const transcribed = beads.map((_, i) => {
    const j = i / (N - 1);
    return new THREE.Vector3(-118 + j * 70 + Math.sin(i * 0.6) * 4, -12 + Math.sin(j * Math.PI) * 30 + Math.cos(i * 0.9) * 3, Math.sin(i * 0.45) * 6);
  });
  // Final lane in the cytoplasm, read left to right; the gap marker sits between codon 11 and the stop codon.
  const lane = beads.map((_, i) => new THREE.Vector3(LANE_X0 + i * BEAD + (i >= gapAt ? 6 : 0), LANE_Y, 0));
  const gapLanePos = new THREE.Vector3(LANE_X0 + gapAt * BEAD + 2, LANE_Y, 0);
  const pore = new THREE.Vector3(ENV_X, 0, 0);
  const codonCenter = (c) => lane[5 + c * 3 + 1].clone();
  const stopCenter = lane[gapAt + 1].clone();
  // Folded chain: a compact random walk.
  const folded = [];
  const fc = new THREE.Vector3(68, 60, 0);
  const walk = new THREE.Vector3();
  for (let k = 0; k < codons; k++) {
    walk.add(new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize().multiplyScalar(2.6));
    if (walk.length() > 4.5) walk.setLength(4.5);
    folded.push(fc.clone().add(walk));
  }

  const v3 = new THREE.Vector3();
  const bezier = (a, c, b, t) => v3.copy(a).multiplyScalar((1 - t) ** 2).addScaledVector(c, 2 * (1 - t) * t).addScaledVector(b, t * t).clone();

  function apply(v) {
    const fT = clamp01(v - 1); // transcription
    const fE = clamp01(v - 2); // export
    const fR = clamp01(v - 3); // translation
    const fF = clamp01(v - 4); // folding

    // Polymerase runs along the gene, then lets go.
    const polX = THREE.MathUtils.lerp(GENE_X[0] - 12, GENE_X[1], fT);
    pol.position.set(polX, DNA_Y + 1, 0);
    pol.visible = v < 2.4;
    pol.scale.setScalar(v < 2 ? 1 : 1 - smooth((v - 2) / 0.4) * 0.999);

    // mRNA bead positions.
    const emitted = v < 1 ? 0 : v >= 2 ? N : Math.floor(fT * N);
    const exit = new THREE.Vector3(polX + 4, DNA_Y + 9, 0);
    const pos = beads.map((_, i) => {
      if (i >= emitted) return null;
      if (v < 2) {
        // Newest bead at the polymerase's exit; older ones relax toward their coil positions.
        const age = (emitted - i) / N;
        return exit.clone().lerp(transcribed[i], smooth(age * 3.2));
      }
      // Export: the 5′ end leads through the pore, then lays out along the lane.
      const t = smooth(fE * 1.9 - (i / N) * 0.9);
      return bezier(transcribed[i], pore, lane[i], t);
    });
    beads.forEach((_, i) => {
      beadMeshes[i].visible = pos[i] !== null;
      if (pos[i]) beadMeshes[i].position.copy(pos[i]);
    });
    cap.visible = emitted > 0;
    if (emitted > 0) cap.position.copy(pos[0]).add(new THREE.Vector3(-2.2, 0, 0));
    gapMark.visible = v >= 2.95;
    gapMark.position.copy(gapLanePos);
    gapMark.rotation.y = Math.PI / 2;

    // Backbone through the visible beads.
    const pts = pos.filter(Boolean);
    strand.geometry.dispose();
    strand.geometry = pts.length >= 2 ? new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), Math.max(8, pts.length * 4), 0.4, 6, false) : new THREE.BufferGeometry();

    // Ribosome: assembles on the start codon, steps codon by codon, skips to the stop, lets go.
    let riboX = codonCenter(0).x;
    let codonNow = -1;
    let within = 0;
    if (fR > 0.1 && fR <= 0.85) {
      const x = ((fR - 0.1) / 0.75) * codons;
      codonNow = Math.min(codons - 1, Math.floor(x));
      within = x - codonNow;
      const from = codonCenter(codonNow).x;
      const to = codonNow + 1 < codons ? codonCenter(codonNow + 1).x : stopCenter.x - 0.01;
      riboX = THREE.MathUtils.lerp(from, codonNow + 1 < codons ? to : from, smooth((within - 0.7) / 0.3));
    } else if (fR > 0.85) {
      riboX = THREE.MathUtils.lerp(codonCenter(codons - 1).x, stopCenter.x, smooth((fR - 0.85) / 0.08));
    }
    const assembled = smooth(fR / 0.1);
    const released = v >= 4 ? smooth(fF / 0.4) : smooth((fR - 0.95) / 0.05);
    ribo.visible = v >= 3;
    ribo.position.set(riboX, LANE_Y + 1, 0);
    large.position.y = (1 - assembled) * 22 + released * 18;
    small.position.y = -(1 - assembled) * 10 - released * 12;
    large.position.x = released * 10;
    // tRNA delivers each amino acid.
    trna.visible = codonNow >= 0 && within < 0.75;
    if (trna.visible) {
      trna.position.set(riboX + 2, LANE_Y + 34 - smooth(within / 0.6) * 26, 0);
      trnaAA.material = aaMeshes[codonNow].material;
    }

    // The growing chain leaves the large subunit's exit tunnel.
    const made = v >= 4 ? codons : codonNow < 0 ? (fR > 0.85 ? codons : 0) : codonNow + (within > 0.6 ? 1 : 0);
    const exitPt = new THREE.Vector3(riboX + 4, LANE_Y + 21, 0);
    aaMeshes.forEach((m, k) => {
      m.visible = k < made;
      if (!m.visible) return;
      // Oldest (Met) is farthest from the ribosome.
      const back = made - 1 - k;
      const extended = exitPt.clone().add(new THREE.Vector3(-back * AA_STEP * 0.75 + Math.sin(back) * 0.8, back * AA_STEP * 0.55, Math.cos(back * 1.3) * 1.2));
      m.position.copy(extended.lerp(folded[k], smooth(fF)));
    });
    chainGap.visible = v >= 3.85 && v < 4.4;
    if (chainGap.visible) chainGap.position.copy(exitPt).add(new THREE.Vector3(1.5, -2.5, 0));

    // Readout.
    const stage = Math.min(4, Math.floor(v + 1e-6));
    if (stage === 0) controls.readout = 'A gene: the start of the human β-globin gene (HBB). Its DNA spells out one of the two kinds of chain in hemoglobin, the oxygen carrier from the circulatory dive.';
    else if (stage === 1) controls.readout = `Transcription. RNA polymerase unzips the DNA and copies one strand into messenger RNA (mRNA), roughly 20 to 70 nucleotides per second. ${emitted} of ${N} nucleotides shown so far.`;
    else if (stage === 2) controls.readout = 'Export. The mRNA has been capped at its 5′ end, spliced (HBB loses two introns) and given a poly(A) tail. It leaves the nucleus through a nuclear pore.';
    else if (stage === 3) {
      if (codonNow >= 0) {
        const c = coding.slice(codonNow * 3, codonNow * 3 + 3);
        const [three, name] = AMINO_NAMES[protein[codonNow]];
        controls.readout = `Translation. Codon ${codonNow + 1}: ${c} → ${three} (${name}). A tRNA with the matching anticodon brings it, and the ribosome links it to the chain, about 5 to 6 amino acids per second.`;
      } else {
        controls.readout = fR <= 0.1 ? 'Translation begins: the small ribosome subunit scans from the 5′ cap to the start codon, AUG, and the large subunit then joins.' : 'The ribosome reaches the stop codon UAA. No tRNA matches it, so a release factor frees the finished chain.';
      }
    } else controls.readout = 'Folding. The chain folds into its working shape: for β-globin, eight helices around a pocket that will hold one heme. The starting methionine is trimmed off.';
  }

  const controls = {
    label: 'Stage',
    unit: '',
    min: 0,
    max: 5,
    step: 0.01,
    value: reducedMotion ? 3.5 : 0,
    format: (v) => STAGES[Math.min(4, Math.floor(v + 1e-6))],
    presets: [
      ...STAGES.map((label, i) => ({ label, value: [0, 1.6, 2.7, 3.5, 5][i] })),
      { label: 'Play or pause', action: 'play' },
    ],
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
    frameWidth: 3.1e-7, // nucleus, envelope and cytoplasm side by side
    metersPerUnit: 1e-9,
    view: { target: [0, 6, 0], direction: [0.04, 0.1, 1] },
    focus: lane[12].toArray(),
    controls,
    update(dt) {
      if (!controls.playing) {
        phase = controls.value;
        return;
      }
      // Translation is the slowest stage to watch, so it gets more time.
      const rate = phase >= 3 && phase < 4 ? 0.09 : 0.22;
      phase = (phase + dt * rate) % 5.6; // hold on the folded chain before repeating
      controls.set(Math.min(5, phase));
    },
    dispose() {
      envGeo.dispose();
      beadGeo.dispose();
      strand.geometry.dispose();
      disposeTree(root);
      M.dispose();
    },
  };
}

