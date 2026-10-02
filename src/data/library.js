// The reusable component library: building blocks authored once and reused by
// every dive that reaches them. `madeOf` lists the next level down.
// status: 'built' has a scene; 'planned' is listed for cross-links and search.
//
// A built entry carries a `step` template. Dives either include it as a main
// step (via libStep) or reach it through a side trip (a step's `branch`),
// so every route into DNA lands in the exact same scene.

export const LIBRARY = [
  {
    id: 'nucleus',
    title: 'Cell nucleus',
    status: 'built',
    scene: 'nucleus',
    card: 'nucleus',
    madeOf: ['dna', 'nuclear-proteins'],
    step: { id: 'nucleus', tier: 6, scene: 'nucleus', title: 'Nucleus', card: 'nucleus', frameMeters: 9e-6, focusCard: 'chromatin' },
  },
  {
    id: 'dna',
    title: 'DNA (deoxyribonucleic acid)',
    status: 'built',
    scene: 'dna',
    card: 'dna',
    madeOf: ['nucleotides'],
    step: { id: 'dna', tier: 7, scene: 'dna', title: 'DNA', card: 'dna', frameMeters: 1.1e-8 },
  },
  {
    id: 'hemoglobin',
    title: 'Hemoglobin',
    status: 'built',
    scene: 'hemoglobin',
    card: 'hemoglobin',
    madeOf: ['heme', 'amino-acids'],
    step: { id: 'hemoglobin', tier: 6, scene: 'hemoglobin', title: 'Hemoglobin', card: 'hemoglobin', frameMeters: 1.1e-8, focusCard: 'heme' },
  },
  {
    id: 'heme',
    title: 'Heme',
    status: 'built',
    scene: 'heme',
    card: 'heme',
    madeOf: [],
    step: { id: 'heme', tier: 7, scene: 'heme', title: 'Heme', card: 'heme', frameMeters: 1.9e-9 },
  },
  {
    id: 'actin-myosin',
    title: 'Actin and myosin',
    status: 'built',
    scene: 'actin-myosin',
    card: 'actin-myosin',
    madeOf: ['amino-acids', 'atp'],
    step: { id: 'actin-myosin', tier: 7, scene: 'actin-myosin', title: 'Actin and myosin', card: 'actin-myosin', frameMeters: 6.5e-8 },
  },
  {
    id: 'antibody',
    title: 'Antibody',
    status: 'built',
    scene: 'antibody',
    card: 'antibody',
    madeOf: ['amino-acids'],
    step: { id: 'antibody', tier: 6, scene: 'antibody', title: 'Antibody', card: 'antibody', frameMeters: 3.4e-8 },
  },
  {
    id: 'lipid-bilayer',
    title: 'Lipid bilayer',
    status: 'built',
    scene: 'lipid-bilayer',
    card: 'lipid-bilayer',
    madeOf: ['phospholipids'],
    step: { id: 'lipid-bilayer', tier: 7, scene: 'lipid-bilayer', title: 'Lipid bilayer', card: 'lipid-bilayer', frameMeters: 1.8e-8 },
  },
  {
    id: 'neurotransmitter',
    title: 'Neurotransmitters',
    status: 'built',
    scene: 'neurotransmitter',
    card: 'neurotransmitter',
    madeOf: ['amino-acids'],
    step: { id: 'neurotransmitter', tier: 7, scene: 'neurotransmitter', title: 'Glutamate', card: 'neurotransmitter', frameMeters: 1.5e-9 },
  },
  {
    id: 'o2-co2',
    title: 'Oxygen and carbon dioxide',
    status: 'built',
    scene: 'gases',
    card: 'o2-co2',
    madeOf: [],
    step: { id: 'o2-co2', tier: 7, scene: 'gases', title: 'O₂ and CO₂', card: 'o2-co2', frameMeters: 1.05e-9 },
  },
  { id: 'rna', title: 'RNA (ribonucleic acid)', status: 'planned', madeOf: ['nucleotides'] },
  { id: 'nucleotides', title: 'Nucleotides', status: 'planned', madeOf: [] },
  { id: 'nuclear-proteins', title: 'Histones and nuclear proteins', status: 'planned', madeOf: ['amino-acids'] },
  { id: 'amino-acids', title: 'Amino acids', status: 'planned', madeOf: [] },
  { id: 'atp', title: 'ATP (adenosine triphosphate)', status: 'planned', madeOf: [] },
  { id: 'phospholipids', title: 'Phospholipids', status: 'planned', madeOf: [] },
];

export function getLibraryEntry(id) {
  return LIBRARY.find((e) => e.id === id);
}

/** A copy of a library entry's step, tagged as shared, with optional overrides. */
export function libStep(id, overrides = {}) {
  const entry = getLibraryEntry(id);
  if (!entry?.step) throw new Error(`library entry "${id}" has no step`);
  return { ...entry.step, shared: id, ...overrides };
}
