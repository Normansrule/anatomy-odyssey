// Tier 3: the brain, measured. The gyri, cerebellum, brainstem and corpus
// callosum of one real adult brain (BodyParts3D, the same meshes as the whole
// body; see bodyMeshes.js), shown at organ scale: 1 scene unit = 1 cm, the
// front of the head toward +z, the body's left toward +x.
//
// A control colors the lobes, or makes the outer cortex see-through to show
// the structures deep in the middle: the corpus callosum joining the two
// hemispheres, the cingulate gyrus above it, the insula folded inside the
// side of each hemisphere, and the brainstem. Lobe boundaries follow OpenStax
// Anatomy and Physiology 13.2.
import * as THREE from 'three/webgpu';
import { materialBank, pick, disposeTree } from './kit.js';
import LANDMARKS from '../data/bodyLandmarks.json';

/** Each measured cortex part: its lobe and what it is known for. Labels are the bundle's. */
export const GYRI = {
  'Superior frontal gyrus': ['frontal', 'planning and self-control'],
  'Middle frontal gyrus': ['frontal', 'planning, attention and working memory'],
  'Orbital gyri straight gyrus': ['frontal', 'weighing rewards and decisions'],
  'Precentral gyrus': ['frontal', 'starting voluntary movement (the primary motor cortex)'],
  'Postcentral gyrus': ['parietal', 'touch, pain and body position (the primary somatosensory cortex)'],
  'Supramarginal gyrus': ['parietal', 'language and the sense of where things are'],
  'Angular gyrus': ['parietal', 'reading and language'],
  'Superior parietal lobule precuneus': ['parietal', 'where things are in space'],
  'Anterior part of superior temporal gyrus': ['temporal', 'hearing (the primary auditory cortex)'],
  'Posterior part of superior temporal gyrus': ['temporal', 'understanding speech'],
  'Middle temporal gyrus': ['temporal', 'the meaning of words and seeing motion'],
  'Inferior temporal gyrus': ['temporal', 'recognizing objects'],
  'Fusiform gyrus': ['temporal', 'recognizing faces and words'],
  'Occipital lobe': ['occipital', 'vision (the primary visual cortex)'],
  Insula: ['insula', 'taste and feelings from inside the body'],
  // In this atlas the part sits on the outside, over the insula: the lower frontal folds (the frontal operculum).
  'Accessory short gyrus': ['frontal', 'covering the insula; on the left, producing speech (Broca’s area)'],
  'Cingulate gyrus': ['limbic', 'emotion, attention and noticing mistakes'],
  'Parahippocampal gyrus': ['limbic', 'forming memories of places and events'],
};

export const LOBES = {
  frontal: { name: 'Frontal lobe', color: 0x6f9be8 },
  parietal: { name: 'Parietal lobe', color: 0xf2c75c },
  temporal: { name: 'Temporal lobe', color: 0x6cc4a1 },
  occipital: { name: 'Occipital lobe', color: 0xf08baf },
  insula: { name: 'Insula', color: 0xf2a65a },
  limbic: { name: 'Limbic lobe', color: 0xb08ae0 },
};

// Deep structures that stay solid when the outer cortex turns see-through.
const DEEP = new Set(['insula', 'limbic']);
const VIEWS = ['Natural', 'Lobes', 'Inside'];

/** The brain's parts from the body bundle, or null if they are not there. */
export function brainParts(parts) {
  const out = parts?.filter((p) => p.extras.system === 'nervous' && p.extras.tissue === 'brain') ?? [];
  return out.length >= 10 ? out : null;
}

/**
 * Build the measured brain scene from the body bundle's parts.
 * Returns null when the bundle has no brain (the caller falls back).
 */
export function buildMeasuredBrain(parts) {
  const pieces = brainParts(parts);
  if (!pieces) return null;
  const M = materialBank();
  const root = new THREE.Group();
  // The parts are in body meters; this group turns them into centimeters around the brain's center.
  const brain = new THREE.Group();
  const c = LANDMARKS.brain;
  brain.scale.setScalar(100);
  brain.position.set(-c[0] * 100, -c[1] * 100, -c[2] * 100);
  root.add(brain);

  const natural = M(0xd9a6b8, { roughness: 0.6, tissue: 'brain', repeat: [1, 1] });
  const stemMat = M(0xe0bfa0, { roughness: 0.62, tissue: 'whiteMatter', repeat: [1, 1] });
  const cerebellumMat = M(0xc98ea6, { roughness: 0.6, tissue: 'brain', repeat: [1, 1] });
  const callosumMat = M(0xf1e7ee, { roughness: 0.7, tissue: 'whiteMatter', repeat: [1, 1] });
  const lobeMat = Object.fromEntries(Object.entries(LOBES).map(([k, l]) => [k, M(l.color, { roughness: 0.55, tissue: 'brain', natural: l.color, repeat: [1, 1] })]));
  const ghost = M(0xd9a6b8, { roughness: 0.6, transparent: true, opacity: 0.16, depthWrite: false });

  const meshes = [];
  for (const { geometry, extras } of pieces) {
    const gyrus = GYRI[extras.label];
    let mesh;
    if (gyrus) {
      const [lobe, role] = gyrus;
      mesh = pick(new THREE.Mesh(geometry, natural), 'cerebral-cortex', `${extras.label} (${LOBES[lobe].name.toLowerCase()}): ${role}`);
      mesh.userData.lobe = lobe;
    } else if (extras.card === 'cerebellum') {
      mesh = pick(new THREE.Mesh(geometry, cerebellumMat), 'cerebellum', 'Cerebellum: balance and smooth, practiced movement');
    } else if (extras.card === 'corpus-callosum') {
      mesh = pick(new THREE.Mesh(geometry, callosumMat), 'corpus-callosum', 'Corpus callosum: the bridge of nerve fibers joining the two hemispheres');
    } else {
      mesh = pick(new THREE.Mesh(geometry, stemMat), 'brainstem', `${extras.label.replace(/^Brainstem: /, '')} (brainstem): breathing, heartbeat and wakefulness`);
    }
    mesh.userData.fma = extras.fma;
    brain.add(mesh);
    meshes.push(mesh);
  }

  function setView(view) {
    for (const mesh of meshes) {
      const lobe = mesh.userData.lobe;
      if (!lobe) continue;
      if (view === 'Lobes') mesh.material = lobeMat[lobe];
      else if (view === 'Inside') mesh.material = DEEP.has(lobe) ? lobeMat[lobe] : ghost;
      else mesh.material = natural;
      // See-through cortex never blocks a click on what is inside it.
      mesh.userData.pickPriority = view === 'Inside' && !DEEP.has(lobe) ? -1 : 0;
    }
  }
  const TEXT = {
    Natural: 'One real adult brain, measured. Each fold (a gyrus) and groove (a sulcus) is where it was in that person; everyone’s folding differs a little. Point at a fold to see what it does.',
    Lobes: 'The lobes: frontal (blue) plans and moves, parietal (yellow) feels and locates, temporal (green) hears and remembers, occipital (pink) sees. The insula (orange) is folded inside, and the limbic lobe (purple) lines the middle.',
    Inside: 'With the outer cortex see-through: the corpus callosum (white) joins the two hemispheres, the cingulate gyrus (purple) arches over it, the insula (orange) sits inside each side, and the brainstem runs down to the spinal cord.',
  };
  const controls = {
    label: 'Show',
    unit: '',
    min: 0,
    max: VIEWS.length - 1,
    step: 1,
    value: 0,
    format: (v) => VIEWS[Math.round(v)],
    presets: VIEWS.map((label, value) => ({ label, value })),
    set(v) {
      controls.value = Math.round(v);
      const view = VIEWS[controls.value];
      setView(view);
      return TEXT[view];
    },
  };
  controls.set(0);

  // Focus: the top of the left precentral gyrus, where the dive continues into the cortex.
  const pre = meshes.find((m) => m.userData.label?.startsWith('Precentral gyrus'));
  let focus = [0, 5, 0];
  if (pre) {
    const a = pre.geometry.attributes.position.array;
    let best = -Infinity;
    for (let i = 0; i < a.length; i += 3) {
      if (a[i] <= c[0] + 0.01 || a[i + 1] <= best) continue; // left hemisphere, highest point
      best = a[i + 1];
      focus = [(a[i] - c[0]) * 100, (a[i + 1] - c[1]) * 100, (a[i + 2] - c[2]) * 100];
    }
  }

  return {
    root,
    fit: 'both',
    metersPerUnit: 0.01,
    detailed: true,
    view: { target: [0, -0.8, 0], direction: [1, 0.32, 0.42] }, // the left side, a little from the front
    focus,
    controls,
    dispose() {
      disposeTree(root);
      M.dispose();
    },
  };
}
