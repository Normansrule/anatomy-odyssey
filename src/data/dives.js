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

const BODY = { id: 'body', tier: 1, scene: 'body', title: 'Whole body', card: 'body', frameMeters: 2.1 };

export const DIVES = [
  {
    id: 'skeletal',
    swatch: '#e9dfc8', // menu and intro color
    kind: 'dive',
    title: 'Skeletal dive',
    status: 'built',
    summary: 'From your whole body down to the DNA inside a bone cell.',
    steps: [
      { ...BODY, focusCard: 'femur', systems: ['skeletal'], narration: 'This is you, drawn as a teaching model. We will follow the thigh bone all the way down to the molecule that tells its cells what to do.' },
      { id: 'skeleton', tier: 2, scene: 'skeleton', title: 'Skeleton', card: 'skeletal-system', frameMeters: 1.9, focusCard: 'femur', narration: 'Strip away everything else and 206 bones remain. The glowing one is the femur, the longest bone in your body.' },
      { id: 'femur', tier: 3, scene: 'femur', title: 'Femur', card: 'femur', frameMeters: 0.55, focusCard: 'compact-bone', narration: 'Cut open, the femur is a hard outer wall around yellow marrow, with spongy bone and red marrow at each end.' },
      { id: 'bone-tissue', tier: 4, scene: 'bone-tissue', title: 'Bone tissue', card: 'compact-bone', frameMeters: 1.6e-3, focusCard: 'lacuna', narration: 'Now at millimeter scale. The wall is built from osteons: rings of hard matrix around a canal carrying a blood vessel.' },
      { id: 'osteocyte', tier: 5, scene: 'osteocyte', title: 'Osteocyte', card: 'osteocyte', frameMeters: 4.5e-5, focusCard: 'osteocyte-nucleus', narration: 'Each tiny pocket holds a living bone cell. Its branches reach out to touch its neighbors and sense how the bone is loaded.' },
      libStep('nucleus', { branch: { label: 'Side trip into a nucleosome', card: 'chromatin', via: ['nuclear-proteins'] }, narration: 'Inside the cell sits its nucleus. This scene is shared: every dive that reaches a nucleus arrives right here.' }),
      libStep('dna', { branch: { label: 'Side trip into a nucleotide', card: 'base-pair', via: ['nucleotides'] }, narration: 'Zoom into one chromatin fiber and you reach DNA, the double helix, about two nanometers wide. That is eight orders of magnitude from where we started.' }),
    ],
  },
  {
    id: 'circulatory',
    swatch: '#d9434f', // menu and intro color
    kind: 'dive',
    title: 'Circulatory dive',
    status: 'built',
    summary: 'Heart → blood → a red blood cell → hemoglobin → the iron that holds oxygen.',
    steps: [
      { ...BODY, focusCard: 'heart', focus: [0.02, 1.25, 0.04], systems: ['circulatory'], narration: 'Your heart sits just left of center in your chest. We will follow the blood it pumps down to a single oxygen molecule.' },
      { id: 'heart', tier: 3, scene: 'heart', title: 'Heart', card: 'heart', frameMeters: 0.2, focusCard: 'blood', narration: 'Opened from the front, the heart has four chambers. The thick-walled left ventricle pushes blood out to your whole body.' },
      { id: 'blood', tier: 4, scene: 'blood', title: 'Blood', card: 'blood', frameMeters: 6e-5, focusCard: 'red-blood-cell', narration: 'Blood is a tissue: cells carried in liquid plasma. Most of the cells are red blood cells, tumbling through a small vessel.' },
      { id: 'red-blood-cell', tier: 5, scene: 'red-blood-cell', title: 'Red blood cell', card: 'red-blood-cell', frameMeters: 1.25e-5, focusCard: 'hemoglobin', branch: { label: 'Side trip into its membrane', card: 'cell-membrane', via: ['lipid-bilayer', 'phospholipids'] }, narration: 'A red blood cell is a flexible disc with a dimple on each side. It has no nucleus; it is packed with hemoglobin instead.' },
      libStep('hemoglobin', { narration: 'Hemoglobin: four protein chains, each holding one heme group. Try the oxygen slider to see how it loads in the lungs and unloads in your tissues.' }),
      libStep('heme', { narration: 'At the heart of each chain is heme, a flat ring holding one iron atom. That iron is where oxygen binds.' }),
    ],
  },
  {
    id: 'muscular',
    swatch: '#d65a6e', // menu and intro color
    kind: 'dive',
    title: 'Muscular dive',
    status: 'built',
    summary: 'Biceps → fascicle → muscle fiber → sarcomere → the actin and myosin that pull.',
    steps: [
      { ...BODY, focusCard: 'biceps', focus: [0.229, 1.255, 0.022], systems: ['muscular'], narration: 'Bend your elbow and your biceps shortens. We will follow that pull down to the molecules that make it.' },
      { id: 'muscle', tier: 3, scene: 'muscle', title: 'Biceps', card: 'biceps', frameMeters: 0.46, focusCard: 'fascicle', narration: 'Cut across, a muscle is bundles inside bundles. Each bundle is a fascicle, wrapped in its own connective tissue.' },
      { id: 'fascicle', tier: 4, scene: 'fascicle', title: 'Fascicle', card: 'fascicle', frameMeters: 2.2e-3, focusCard: 'muscle-fiber', narration: 'A fascicle holds dozens of muscle fibers, each one a single, very long cell, with capillaries threaded between them.' },
      { id: 'muscle-fiber', tier: 5, scene: 'muscle-fiber', title: 'Muscle fiber', card: 'muscle-fiber', frameMeters: 1.9e-4, focusCard: 'myofibril', branch: { label: 'Side trip into a muscle nucleus', card: 'muscle-nucleus', via: ['nucleus', 'dna'] }, narration: 'One fiber has many nuclei along its edge, and it is packed with striped rods called myofibrils.' },
      { id: 'sarcomere', tier: 6, scene: 'sarcomere', title: 'Sarcomere', card: 'sarcomere', frameMeters: 2.4e-6, focusCard: 'actin-myosin', narration: 'Each stripe repeats every few micrometers: that unit is a sarcomere. Slide the control to contract it and watch which bands shrink.' },
      libStep('actin-myosin', { branch: { label: 'Side trip into ATP', card: 'atp-cycle', via: ['atp'] }, narration: 'Myosin heads grab actin, swing, let go and reset, using one ATP each cycle. Millions of these strokes add up to lifting your arm.' }),
    ],
  },
  {
    id: 'immune',
    swatch: '#7cc49a', // menu and intro color
    kind: 'dive',
    title: 'Immune dive',
    status: 'built',
    summary: 'Lymph node → follicle → plasma cell → the antibodies it makes.',
    steps: [
      { ...BODY, focusCard: 'immune-system', focus: [0.15, 1.33, 0.0], systems: ['immune'], narration: 'Hundreds of lymph nodes sit along your lymph vessels. We will enter one in the armpit and find where antibodies are made.' },
      { id: 'lymph-node', tier: 3, scene: 'lymph-node', title: 'Lymph node', card: 'lymph-node', frameMeters: 0.026, focusCard: 'lymph-follicle', narration: 'A lymph node is a filter about the size of a bean. Fluid flows in, past crowds of immune cells, and out again.' },
      { id: 'follicle', tier: 4, scene: 'follicle', title: 'Follicle', card: 'lymph-follicle', frameMeters: 3e-4, focusCard: 'plasma-cell', narration: 'In the outer layer, B cells gather in follicles. In the pale center they compete to make better and better antibodies.' },
      { id: 'plasma-cell', tier: 5, scene: 'plasma-cell', title: 'Plasma cell', card: 'plasma-cell', frameMeters: 2.4e-5, focusCard: 'antibody', branch: { label: 'Side trip into its nucleus', card: 'plasma-nucleus', via: ['nucleus', 'dna'] }, narration: 'A winning B cell becomes a plasma cell: an antibody factory, full of protein-building membranes.' },
      libStep('antibody', { branch: { label: 'Side trip into its amino acids', card: 'antibody', via: ['amino-acids'] }, narration: 'The product: a Y-shaped antibody. The tips of the Y grip one specific target; the stem signals other immune cells.' }),
    ],
  },
  {
    id: 'inflammation',
    swatch: '#f2a65a', // menu and intro color
    kind: 'module',
    title: 'Inflammatory response',
    status: 'built',
    summary: 'An animated splinter wound, from the first alarm to healing.',
    steps: [
      { id: 'inflammation', tier: 4, scene: 'inflammation', title: 'Inflammation', card: 'inflammation', frameMeters: 1.05e-4, narration: 'Step through a splinter wound: the alarm, the leaky vessel, the arrival of neutrophils, and the cleanup. Use the stage control.' },
    ],
  },
  {
    id: 'immune-response',
    swatch: '#9fb4e8', // menu and intro color
    kind: 'module',
    title: 'Immune response and memory',
    status: 'built',
    summary: 'Meet the immune cells at their true sizes, then watch a first and a second infection with the same germ.',
    steps: [
      { id: 'immune-cells', tier: 5, scene: 'immune-cells', title: 'Immune cells to scale', card: 'immune-cell-lineup', frameMeters: 5.5e-5, focusCard: 'lymphocyte', narration: 'The immune system’s cells side by side, at their true sizes, with a red blood cell, a bacterium and a virus for scale. Step through them with the control.' },
      { id: 'immune-memory', tier: 5, scene: 'immune-memory', title: 'First and second exposure', card: 'immune-memory', frameMeters: 5e-5, narration: 'Day 0: a germ you have never met. Watch how long the specific response takes, and then what happens when the same germ returns on day 90.' },
    ],
  },
  {
    id: 't-cells',
    swatch: '#f2a65a', // menu and intro color
    kind: 'module',
    title: 'T cells: presenting and killing',
    status: 'built',
    summary: 'A dendritic cell shows germ pieces to helper T cells, a killer T cell destroys an infected cell, and one receptor reads one peptide.',
    steps: [
      { id: 'antigen-presentation', tier: 5, scene: 'antigen-presentation', title: 'Antigen presentation', card: 'antigen-presentation', frameMeters: 3.6e-5, focusCard: 'helper-t-cell', narration: 'In a lymph node, a dendritic cell shows pieces of a germ. Thousands of T cells check them; the rare one that fits switches on and multiplies.' },
      { id: 'killer-t-cell', tier: 5, scene: 'killer-t-cell', title: 'A killer T cell at work', card: 'killer-t-cell', frameMeters: 2.8e-5, focusCard: 'immunological-synapse', narration: 'A killer T cell finds a virus-infected cell by the viral peptides on its surface, grips it, and makes it destroy itself.' },
      { id: 'tcr-mhc', tier: 6, scene: 'tcr-mhc', title: 'Receptor meets peptide', card: 'tcr-mhc', frameMeters: 2.4e-8, branch: { label: 'Side trip into the peptide’s amino acids', card: 'mhc-peptide', via: ['amino-acids'] }, narration: 'Zoom into the contact: a T-cell receptor reads a nine-amino-acid peptide held in the groove of an MHC molecule, across a 15 nanometer gap.' },
    ],
  },
  {
    id: 'reflex',
    swatch: '#f0dc96', // menu and intro color
    kind: 'module',
    title: 'Reflex arc (knee jerk)',
    status: 'built',
    summary: 'Tap the knee and the leg kicks in about 18 ms: follow the signal to the spinal cord, through its wiring, back to the muscle and down to the acetylcholine molecule.',
    steps: [
      { id: 'reflex-arc', tier: 2, scene: 'reflex-arc', title: 'The knee jerk', card: 'reflex-arc', frameMeters: 1.45, focusCard: 'spinal-cord', narration: 'A tap below the kneecap, and the leg kicks out before you decide anything. Press play to follow the signal up to the spinal cord and back down, slowed about a thousand times.' },
      { id: 'spinal-cord', tier: 3, scene: 'spinal-cord', title: 'Inside the spinal cord', card: 'spinal-cord-section', frameMeters: 1.6e-2, focusCard: 'motor-neuron', narration: 'A slice of the cord at the L3 segment, about a centimeter wide. The sensory fiber comes in at the back and synapses straight onto a motor neuron at the front. That single synapse is the whole decision.' },
      { id: 'neuromuscular-junction', tier: 6, scene: 'neuromuscular-junction', title: 'Nerve meets muscle', card: 'neuromuscular-junction', frameMeters: 3.2e-6, focusCard: 'acetylcholine', narration: 'Follow the motor neuron’s command half a meter down to the thigh. Where it ends on a quadriceps fiber, the signal has to cross a gap, carried by a chemical.' },
      libStep('acetylcholine', { narration: 'That chemical: acetylcholine. Every voluntary movement you make, and every reflex, ends with this small molecule crossing to a muscle.' }),
    ],
  },
  {
    id: 'gene-to-protein',
    swatch: '#8f7ff0', // menu and intro color
    kind: 'module',
    title: 'From gene to protein',
    status: 'built',
    summary: 'The start of the β-globin gene becomes a protein: transcription, export, translation, folding.',
    steps: [
      { id: 'gene-expression', tier: 6, scene: 'gene-expression', title: 'Gene to protein', card: 'gene-expression', frameMeters: 1.75e-7, focusCard: 'mrna', narration: 'On the left is the nucleus, on the right the cytoplasm. Press play to watch one gene, the start of β-globin, become a protein.' },
      libStep('rna', { narration: 'Zoom into the messenger: RNA is a single strand that folds back where its bases pair. Its last letters are the first three codons of the β-globin message.' }),
      libStep('amino-acids', { narration: 'Each codon picks one of these twenty amino acids. Step through them: they share a backbone and differ only in their side chains.' }),
    ],
  },
  {
    id: 'chemistry',
    swatch: '#8fb4f0', // menu and intro color
    kind: 'module',
    title: 'Chemistry of life',
    status: 'built',
    summary: 'What you are made of, how an enzyme speeds a reaction ten million times, and how blood holds its pH.',
    steps: [
      { id: 'body-elements', tier: 1, scene: 'body-elements', title: 'Elements of the body', card: 'body-elements', frameMeters: 2.2, focusCard: 'trace-elements', narration: 'You, cut into cubes and sorted by element. Switch between counting by mass and counting atoms, and watch hydrogen go from a thin band to most of you.' },
      { id: 'carbonic-anhydrase', tier: 6, scene: 'carbonic-anhydrase', title: 'An enzyme at work', card: 'carbonic-anhydrase', frameMeters: 6.4e-9, focusCard: 'bicarbonate', narration: 'Carbonic anhydrase, one of the fastest enzymes known. Carbon dioxide slips into the cleft, meets a zinc-bound hydroxide, and leaves as bicarbonate. Lower the barrier control to see what the enzyme is worth.' },
      { id: 'bicarbonate-buffer', tier: 7, scene: 'bicarbonate-buffer', title: 'Blood’s pH buffer', card: 'bicarbonate-buffer', frameMeters: 1.6e-9, narration: 'The bicarbonate that enzyme makes is half of your blood’s main buffer. Change the CO₂ your breathing leaves in your blood and watch the pH move.' },
    ],
  },
  {
    id: 'nervous',
    swatch: '#e8c45a', // menu and intro color
    kind: 'dive',
    title: 'Nervous dive',
    status: 'built',
    summary: 'Brain → the layered cortex → a neuron → a synapse → the glutamate molecule that carries the signal.',
    steps: [
      { ...BODY, focusCard: 'brain', focus: [0, 1.655, -0.005], systems: ['nervous'], narration: 'Everything you are thinking right now runs on electrical and chemical signals. We will follow one from the brain down to a single molecule.' },
      { id: 'brain', tier: 3, scene: 'brain', title: 'Brain', card: 'brain', frameMeters: 0.21, focusCard: 'cerebral-cortex', narration: 'Sliced front to back, the brain has a thin folded rind of gray matter, the cortex, over a core of white matter wiring.' },
      { id: 'cortex', tier: 4, scene: 'cortex', title: 'Cortex', card: 'cortex-layers', frameMeters: 4.2e-3, focusCard: 'pyramidal-neuron', narration: 'Cut a block out of that rind and it has six layers. Inputs arrive in the middle; the big pyramidal neurons in layer V send commands out. Pick a layer to see what lives there.' },
      { id: 'neuron', tier: 5, scene: 'neuron', title: 'Neuron', card: 'neuron', frameMeters: 3.9e-4, focusCard: 'axon-terminal', branch: { label: 'Side trip into its nucleus', card: 'neuron-nucleus', via: ['nucleus', 'dna'] }, narration: 'One neuron from the cortex. Dendrites collect signals, and a wrapped axon sends a spike out. Change the axon width to see how fast the spike travels.' },
      { id: 'synapse', tier: 6, scene: 'synapse', title: 'Synapse', card: 'synapse', frameMeters: 2.1e-6, focusCard: 'neurotransmitter', branch: { label: 'Side trip into the membrane', card: 'neuron-membrane', via: ['lipid-bilayer', 'phospholipids'] }, narration: 'Where the axon meets the next cell, a gap only twenty nanometers wide. Step through the stages to watch a vesicle release its cargo.' },
      libStep('neurotransmitter', { narration: 'The cargo: glutamate, the brain’s main excitatory messenger. It is also one of the twenty amino acids your proteins are built from.' }),
    ],
  },
  {
    id: 'respiratory',
    swatch: '#e9a0b4', // menu and intro color
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
  {
    id: 'digestive',
    swatch: '#e6a46e', // menu and intro color
    kind: 'dive',
    title: 'Digestive dive',
    status: 'built',
    summary: 'Small intestine → villi → an absorbing cell → the glucose molecule it takes in.',
    steps: [
      { ...BODY, focusCard: 'small-intestine', focus: [0, 0.92, 0.04], systems: ['digestive'], narration: 'Everything you eat ends up as molecules small enough to cross into your blood. We will follow one sugar molecule from the gut into you.' },
      { id: 'small-intestine', tier: 3, scene: 'small-intestine', title: 'Small intestine', card: 'small-intestine', frameMeters: 0.06, focusCard: 'intestinal-villus', narration: 'Cut open, the small intestine is not smooth: circular folds run around the inside, and every surface is velvet with villi.' },
      { id: 'villi', tier: 4, scene: 'villi', title: 'Villi', card: 'intestinal-villus', frameMeters: 1.6e-3, focusCard: 'enterocyte', narration: 'Each villus is a finger of tissue under a millimeter tall, with a net of capillaries and a lymph vessel inside. One is cut open in front.' },
      { id: 'enterocyte', tier: 5, scene: 'enterocyte', title: 'Absorbing cell', card: 'enterocyte', frameMeters: 4.2e-5, focusCard: 'glucose', narration: 'The villus is covered by a single layer of absorbing cells, each topped with a brush of microvilli. Step through how one glucose molecule gets from the gut into the blood.' },
      libStep('glucose', { narration: 'The prize: glucose, six carbons, twelve hydrogens and six oxygens. It fuels almost every cell in your body.' }),
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
