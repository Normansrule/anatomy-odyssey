// Guided dives. Each built dive is an ordered list of tier steps.
// `scene` names a builder in src/scenes/registry.js; `shared` marks a step
// that routes into the reusable library (src/data/library.js), so several
// dives can end in the same scene.
//
// Step fields:
//   frameMeters  height of the view on arrival (what the depth gauge shows)
//   focusCard    the structure in this view that leads down to the next step
//   focus        [x, y, z] point to fly toward, overriding the scene's own focus
//                (the whole-body scene is shared, so each dive aims at its organ)
//   systems      body systems to switch on when this step is shown
//   branch       a side trip from this step into shared library scenes:
//                { label, card (the part you enter through), via: [library ids] }
//   narration    the caption the guided tour shows at this step

import { libStep } from './library.js';

export const TIERS = {
  1: 'Whole body',
  2: 'System',
  3: 'Organ',
  4: 'Tissue',
  5: 'Cell',
  6: 'Organelle or macromolecule',
  7: 'Molecule',
};

const BODY = { id: 'body', tier: 1, scene: 'body', title: 'Whole body', card: 'body', frameMeters: 2.5 };

export const DIVES = [
  {
    id: 'skeletal',
    kind: 'dive',
    title: 'Skeletal dive',
    status: 'built',
    summary: 'From your whole body down to the DNA inside a bone cell.',
    steps: [
      { ...BODY, focusCard: 'femur', systems: ['skeletal'], narration: 'This is you, drawn as a teaching model. We will follow the thigh bone all the way down to the molecule that tells its cells what to do.' },
      { id: 'skeleton', tier: 2, scene: 'skeleton', title: 'Skeleton', card: 'skeletal-system', frameMeters: 1.2, focusCard: 'femur', narration: 'Strip away everything else and 206 bones remain. The glowing one is the femur, the longest bone in your body.' },
      { id: 'femur', tier: 3, scene: 'femur', title: 'Femur', card: 'femur', frameMeters: 0.55, focusCard: 'compact-bone', narration: 'Cut open, the femur is a hard outer wall around yellow marrow, with spongy bone and red marrow at each end.' },
      { id: 'bone-tissue', tier: 4, scene: 'bone-tissue', title: 'Bone tissue', card: 'compact-bone', frameMeters: 1.6e-3, focusCard: 'lacuna', narration: 'Now at millimeter scale. The wall is built from osteons: rings of hard matrix around a canal carrying a blood vessel.' },
      { id: 'osteocyte', tier: 5, scene: 'osteocyte', title: 'Osteocyte', card: 'osteocyte', frameMeters: 4.5e-5, focusCard: 'osteocyte-nucleus', narration: 'Each tiny pocket holds a living bone cell. Its branches reach out to touch its neighbors and sense how the bone is loaded.' },
      libStep('nucleus', { narration: 'Inside the cell sits its nucleus. This scene is shared: every dive that reaches a nucleus arrives right here.' }),
      libStep('dna', { narration: 'Zoom into one chromatin fiber and you reach DNA, the double helix, about two nanometers wide. That is eight orders of magnitude from where we started.' }),
    ],
  },
  {
    id: 'circulatory',
    kind: 'dive',
    title: 'Circulatory dive',
    status: 'built',
    summary: 'Heart → blood → a red blood cell → hemoglobin → the iron that holds oxygen.',
    steps: [
      { ...BODY, focusCard: 'heart', focus: [0.02, 1.25, 0.04], systems: ['circulatory'], narration: 'Your heart sits just left of center in your chest. We will follow the blood it pumps down to a single oxygen molecule.' },
      { id: 'heart', tier: 3, scene: 'heart', title: 'Heart', card: 'heart', frameMeters: 0.2, focusCard: 'blood', narration: 'Opened from the front, the heart has four chambers. The thick-walled left ventricle pushes blood out to your whole body.' },
      { id: 'blood', tier: 4, scene: 'blood', title: 'Blood', card: 'blood', frameMeters: 6e-5, focusCard: 'red-blood-cell', narration: 'Blood is a tissue: cells carried in liquid plasma. Most of the cells are red blood cells, tumbling through a small vessel.' },
      { id: 'red-blood-cell', tier: 5, scene: 'red-blood-cell', title: 'Red blood cell', card: 'red-blood-cell', frameMeters: 1.25e-5, focusCard: 'hemoglobin', branch: { label: 'Side trip into its membrane', card: 'cell-membrane', via: ['lipid-bilayer'] }, narration: 'A red blood cell is a flexible disc with a dimple on each side. It has no nucleus; it is packed with hemoglobin instead.' },
      libStep('hemoglobin', { narration: 'Hemoglobin: four protein chains, each holding one heme group. Try the oxygen slider to see how it loads in the lungs and unloads in your tissues.' }),
      libStep('heme', { narration: 'At the heart of each chain is heme, a flat ring holding one iron atom. That iron is where oxygen binds.' }),
    ],
  },
  {
    id: 'muscular',
    kind: 'dive',
    title: 'Muscular dive',
    status: 'built',
    summary: 'Biceps → fascicle → muscle fiber → sarcomere → the actin and myosin that pull.',
    steps: [
      { ...BODY, focusCard: 'biceps', focus: [0.225, 1.27, 0.02], systems: ['muscular'], narration: 'Bend your elbow and your biceps shortens. We will follow that pull down to the molecules that make it.' },
      { id: 'muscle', tier: 3, scene: 'muscle', title: 'Biceps', card: 'biceps', frameMeters: 0.42, focusCard: 'fascicle', narration: 'Cut across, a muscle is bundles inside bundles. Each bundle is a fascicle, wrapped in its own connective tissue.' },
      { id: 'fascicle', tier: 4, scene: 'fascicle', title: 'Fascicle', card: 'fascicle', frameMeters: 2.2e-3, focusCard: 'muscle-fiber', narration: 'A fascicle holds dozens of muscle fibers, each one a single, very long cell, with capillaries threaded between them.' },
      { id: 'muscle-fiber', tier: 5, scene: 'muscle-fiber', title: 'Muscle fiber', card: 'muscle-fiber', frameMeters: 1.9e-4, focusCard: 'myofibril', branch: { label: 'Side trip into a muscle nucleus', card: 'muscle-nucleus', via: ['nucleus', 'dna'] }, narration: 'One fiber has many nuclei along its edge, and it is packed with striped rods called myofibrils.' },
      { id: 'sarcomere', tier: 6, scene: 'sarcomere', title: 'Sarcomere', card: 'sarcomere', frameMeters: 2.4e-6, focusCard: 'actin-myosin', narration: 'Each stripe repeats every few micrometers: that unit is a sarcomere. Slide the control to contract it and watch which bands shrink.' },
      libStep('actin-myosin', { narration: 'Myosin heads grab actin, swing, let go and reset, using one ATP each cycle. Millions of these strokes add up to lifting your arm.' }),
    ],
  },
  {
    id: 'immune',
    kind: 'dive',
    title: 'Immune dive',
    status: 'built',
    summary: 'Lymph node → follicle → plasma cell → the antibodies it makes.',
    steps: [
      { ...BODY, focusCard: 'immune-system', focus: [0.15, 1.33, 0.0], systems: ['immune'], narration: 'Hundreds of lymph nodes sit along your lymph vessels. We will enter one in the armpit and find where antibodies are made.' },
      { id: 'lymph-node', tier: 3, scene: 'lymph-node', title: 'Lymph node', card: 'lymph-node', frameMeters: 0.026, focusCard: 'lymph-follicle', narration: 'A lymph node is a filter about the size of a bean. Fluid flows in, past crowds of immune cells, and out again.' },
      { id: 'follicle', tier: 4, scene: 'follicle', title: 'Follicle', card: 'lymph-follicle', frameMeters: 3e-4, focusCard: 'plasma-cell', narration: 'In the outer layer, B cells gather in follicles. In the pale center they compete to make better and better antibodies.' },
      { id: 'plasma-cell', tier: 5, scene: 'plasma-cell', title: 'Plasma cell', card: 'plasma-cell', frameMeters: 2.4e-5, focusCard: 'antibody', branch: { label: 'Side trip into its nucleus', card: 'plasma-nucleus', via: ['nucleus', 'dna'] }, narration: 'A winning B cell becomes a plasma cell: an antibody factory, full of protein-building membranes.' },
      libStep('antibody', { narration: 'The product: a Y-shaped antibody. The tips of the Y grip one specific target; the stem signals other immune cells.' }),
    ],
  },
  {
    id: 'inflammation',
    kind: 'module',
    title: 'Inflammatory response',
    status: 'built',
    summary: 'An animated splinter wound, from the first alarm to healing.',
    steps: [
      { id: 'inflammation', tier: 4, scene: 'inflammation', title: 'Inflammation', card: 'inflammation', frameMeters: 1.05e-4, narration: 'Step through a splinter wound: the alarm, the leaky vessel, the arrival of neutrophils, and the cleanup. Use the stage control.' },
    ],
  },
  {
    id: 'nervous',
    kind: 'dive',
    title: 'Nervous dive',
    status: 'built',
    summary: 'Brain → a neuron → a synapse → the glutamate molecule that carries the signal.',
    steps: [
      { ...BODY, focusCard: 'brain', focus: [0, 1.655, -0.005], systems: ['nervous'], narration: 'Everything you are thinking right now runs on electrical and chemical signals. We will follow one from the brain down to a single molecule.' },
      { id: 'brain', tier: 3, scene: 'brain', title: 'Brain', card: 'brain', frameMeters: 0.21, focusCard: 'cerebral-cortex', narration: 'Sliced front to back, the brain has a thin folded rind of gray matter, the cortex, over a core of white matter wiring.' },
      { id: 'neuron', tier: 5, scene: 'neuron', title: 'Neuron', card: 'neuron', frameMeters: 3.9e-4, focusCard: 'axon-terminal', branch: { label: 'Side trip into its nucleus', card: 'neuron-nucleus', via: ['nucleus', 'dna'] }, narration: 'One neuron from the cortex. Dendrites collect signals, and a wrapped axon sends a spike out. Change the axon width to see how fast the spike travels.' },
      { id: 'synapse', tier: 6, scene: 'synapse', title: 'Synapse', card: 'synapse', frameMeters: 2.1e-6, focusCard: 'neurotransmitter', branch: { label: 'Side trip into the membrane', card: 'neuron-membrane', via: ['lipid-bilayer'] }, narration: 'Where the axon meets the next cell, a gap only twenty nanometers wide. Step through the stages to watch a vesicle release its cargo.' },
      libStep('neurotransmitter', { narration: 'The cargo: glutamate, the brain’s main excitatory messenger. It is also one of the twenty amino acids your proteins are built from.' }),
    ],
  },
  {
    id: 'respiratory',
    kind: 'dive',
    title: 'Respiratory dive',
    status: 'built',
    summary: 'Lungs → alveoli → the air–blood barrier → hemoglobin → oxygen itself.',
    steps: [
      { ...BODY, focusCard: 'respiratory-system', focus: [0, 1.3, 0.02], systems: ['respiratory'], narration: 'You take about twenty thousand breaths a day. We will follow one breath down to the oxygen molecule your cells burn.' },
      { id: 'lungs', tier: 3, scene: 'lungs', title: 'Lungs', card: 'lungs', frameMeters: 0.37, focusCard: 'bronchiole', narration: 'The windpipe splits again and again into a tree of airways inside two spongy lungs. Press play to breathe.' },
      { id: 'alveoli', tier: 4, scene: 'alveoli', title: 'Alveoli', card: 'alveolus', frameMeters: 1.15e-3, focusCard: 'alveolus', narration: 'Every airway ends in grape-like clusters of tiny air sacs, alveoli, each wrapped in a net of capillaries.' },
      { id: 'gas-exchange', tier: 5, scene: 'gas-exchange', title: 'Gas exchange', card: 'air-blood-barrier', frameMeters: 2.2e-5, focusCard: 'hemoglobin', narration: 'Here air and blood are less than a micrometer apart. Play the transit to watch a red blood cell load oxygen as it passes.' },
      libStep('hemoglobin', { focusCard: 'oxygen-binding', narration: 'Inside every red blood cell, hemoglobin grabs the oxygen. The same shared scene the circulatory dive reaches.' }),
      libStep('o2-co2', { narration: 'The two gases themselves: oxygen in, carbon dioxide out. Each is just two or three atoms.' }),
    ],
  },
];

export function builtDives() {
  return DIVES.filter((d) => d.status === 'built');
}

export function getDive(id) {
  return DIVES.find((d) => d.id === id);
}

/** Find where a step id lives: prefer `preferDiveId`, then any built dive. */
export function locateStep(stepId, preferDiveId) {
  const order = [getDive(preferDiveId), ...builtDives()].filter(Boolean);
  for (const dive of order) {
    if (dive.status !== 'built') continue;
    const index = dive.steps.findIndex((s) => s.id === stepId);
    if (index >= 0) return { dive, index };
  }
  return null;
}
