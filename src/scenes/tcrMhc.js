// Module scene: a T-cell receptor reading a peptide held by MHC class I.
// 1 scene unit = 1 nm.
// Protein domains are drawn as smooth shapes at roughly their real size
// (an immunoglobulin-like domain is about 4 nm long); the two membranes are
// 15 nm apart, the gap a T-cell receptor bound to a peptide–MHC spans. The
// receptor docks diagonally across the groove, as in the crystal structures.
// The 9-amino-acid peptide is drawn one bead per amino acid, end to end
// about 2.7 nm. Not atomic coordinates.
import * as THREE from 'three/webgpu';
import { materialBank, pick, ellipsoid, capsuleBetween, tubeThrough, disposeTree } from './kit.js';
import { SYNAPSE_GAP_NM, peptideLength } from '../science/tcells.js';

export const PEPTIDE_RESIDUES = 9;
export const TCR_GEOMETRY = {
  gap: SYNAPSE_GAP_NM,
  membrane: 4, // bilayer thickness, nm
  pmhcTop: 6.4, // top of the bulging peptide above the target membrane, nm
  tcrBottom: 6.6, // tip of the receptor's variable domains when bound, nm
};

export function tcrReadout(v) {
  return v < 0.5
    ? 'Self peptide: a piece of one of the cell’s own proteins. This receptor does not fit it, so it slides on; T cells that bind self peptides strongly are removed in the thymus before they mature.'
    : 'Viral peptide: the receptor’s tips settle diagonally across the groove and touch both the peptide and the MHC helices. CD8 grips the MHC’s lower domain, and CD3 passes the signal into the T cell.';
}

export function buildTcrMhc() {
  const M = materialBank();
  const root = new THREE.Group();
  const gap = TCR_GEOMETRY.gap;
  const mem = TCR_GEOMETRY.membrane;

  // Membranes: the target cell below, the T cell above.
  const memMat = M(0xb9aee0, { roughness: 0.75, transparent: true, opacity: 0.4, depthWrite: false });
  const lower = new THREE.Mesh(new THREE.BoxGeometry(34, mem, 9), memMat);
  lower.position.y = -mem / 2;
  root.add(pick(lower, 'tcr-mhc', 'Infected cell membrane'));
  const upper = new THREE.Mesh(new THREE.BoxGeometry(34, mem, 9), memMat);
  upper.position.y = gap + mem / 2;
  root.add(pick(upper, 'tcr-mhc', 'T cell membrane'));

  // MHC class I: heavy chain (alpha 3 and the alpha 1/alpha 2 platform) with beta-2 microglobulin.
  const heavy = M(0x8fb4f0, { roughness: 0.5 });
  const b2m = M(0x5a8deb, { roughness: 0.5 });
  root.add(pick(capsuleBetween([0, -mem + 0.6, 0], [0, 0.8, 0], 0.32, heavy, 8), 'mhc-class-i', 'MHC class I anchor in the membrane'));
  root.add(pick(ellipsoid([-0.4, 2.2, 0], [1.5, 1.9, 1.3], heavy, 22), 'mhc-class-i', 'MHC class I: alpha-3 domain'));
  root.add(pick(ellipsoid([1.9, 2.3, 0.3], [1.4, 1.7, 1.3], b2m, 22), 'mhc-class-i', 'β2-microglobulin (part of MHC class I)'));
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.7, 3.5), heavy);
  floor.position.set(0, 4.6, 0);
  root.add(pick(floor, 'mhc-class-i', 'MHC class I: floor of the groove (beta sheet)'));
  for (const z of [-1.3, 1.3]) {
    root.add(pick(tubeThrough([[-2.5, 5.4, z * 0.95], [0, 5.55, z * 1.05], [2.5, 5.4, z * 0.95]], 0.5, heavy, 24, 10), 'mhc-class-i', 'MHC class I: groove wall (alpha helix)'));
  }

  // The peptide in the groove: self (grey-violet) or viral (gold).
  const selfCol = new THREE.Color(0xa69cc8);
  const viralCol = new THREE.Color(0xe8c45a);
  const pepMat = M(0xe8c45a, { roughness: 0.35, emissive: 0xe8c45a, emissiveIntensity: 0.4 });
  const len = peptideLength(PEPTIDE_RESIDUES);
  const peptide = [];
  for (let i = 0; i < PEPTIDE_RESIDUES; i++) {
    const x = -len / 2 + (i * len) / (PEPTIDE_RESIDUES - 1);
    const bump = Math.sin((i / (PEPTIDE_RESIDUES - 1)) * Math.PI) * 0.45; // the middle bulges up toward the receptor
    const b = pick(ellipsoid([x, 5.6 + bump, 0], [0.34, 0.34, 0.34], pepMat, 12), 'mhc-peptide', `Peptide: amino acid ${i + 1} of ${PEPTIDE_RESIDUES}`);
    root.add(b);
    peptide.push(b);
  }

  // The T-cell receptor with CD3 and CD8, hanging from the T cell membrane.
  const tcr = new THREE.Group();
  const alpha = M(0xf2a65a, { roughness: 0.5 });
  const beta = M(0xf08baf, { roughness: 0.5 });
  const top = gap + 0.5;
  for (const [x, mat, chain] of [[-1.15, alpha, 'alpha'], [1.15, beta, 'beta']]) {
    tcr.add(pick(ellipsoid([x, 8.4, 0], [1.2, 1.8, 1.1], mat, 22), 't-cell-receptor', `T-cell receptor ${chain} chain: variable domain (reads the peptide)`));
    tcr.add(pick(ellipsoid([x, 11.9, 0], [1.15, 1.7, 1.05], mat, 22), 't-cell-receptor', `T-cell receptor ${chain} chain: constant domain`));
    tcr.add(pick(capsuleBetween([x * 0.8, 13.4, 0], [x * 0.6, top + 2, 0], 0.28, mat, 8), 't-cell-receptor', `T-cell receptor ${chain} chain: stalk into the membrane`));
  }
  const cd3 = M(0x7cc49a, { roughness: 0.5 });
  for (const [x, z] of [[-3.1, 0.9], [-3.2, -1], [3.1, 0.9], [3.2, -1]]) {
    tcr.add(pick(ellipsoid([x, 12.6, z], [0.75, 1.0, 0.75], cd3, 14), 'cd3-complex', 'CD3 (passes the signal into the T cell)'));
    tcr.add(pick(capsuleBetween([x, 13.4, z], [x * 0.9, top + 2, z], 0.18, cd3, 6), 'cd3-complex', 'CD3 stalk'));
  }
  tcr.rotation.y = 0.65; // diagonal docking across the groove
  root.add(tcr);
  const cd8 = new THREE.Group();
  const cd8Mat = M(0xe8c45a, { roughness: 0.5 });
  cd8.add(pick(ellipsoid([-2.7, 3.4, 1.6], [0.9, 1.2, 0.9], cd8Mat, 14), 'cd8-coreceptor', 'CD8 alpha head (grips the MHC alpha-3 domain)'));
  cd8.add(pick(ellipsoid([-3.6, 4.0, 2.4], [0.9, 1.2, 0.9], cd8Mat, 14), 'cd8-coreceptor', 'CD8 beta head'));
  cd8.add(pick(tubeThrough([[-3.3, 4.8, 2], [-4.8, 9, 2.6], [-5.4, 13, 2.4], [-5.4, top + 2, 2.2]], 0.22, cd8Mat, 24, 6), 'cd8-coreceptor', 'CD8 stalk'));
  root.add(cd8);

  const slide = new THREE.Vector3(10, 0.6, 0);
  const controls = {
    label: 'Peptide',
    unit: '',
    min: 0,
    max: 1,
    step: 0.01,
    value: 1,
    format: (v) => (v < 0.5 ? 'Self' : 'Viral'),
    presets: [
      { label: 'Self peptide', value: 0 },
      { label: 'Viral peptide', value: 1 },
    ],
    readout: '',
    set(v) {
      controls.value = v;
      const away = 1 - v;
      tcr.position.copy(slide).multiplyScalar(away);
      cd8.position.copy(slide).multiplyScalar(away);
      pepMat.color.copy(selfCol).lerp(viralCol, v);
      pepMat.emissive.copy(selfCol).lerp(viralCol, v);
      pepMat.emissiveIntensity = 0.1 + 0.3 * v;
      controls.readout = tcrReadout(v);
      return controls.readout;
    },
  };
  controls.set(1);

  return {
    root,
    fit: 'both',
    frameWidth: 4.2e-8,
    metersPerUnit: 1e-9,
    view: { target: [1.5, 6.5, 0], direction: [0.35, 0.3, 1] },
    focus: [0, 5.6, 0],
    branchFocus: [0, 5.6, 0],
    controls,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
