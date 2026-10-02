# State of the model

Last updated for v0.3.0. The About dialog in the app shows the same information, generated from `src/data/dives.js` and `src/data/library.js`.

All geometry is procedural (built from simple shapes in code) and labeled as a generalized teaching model. Where a view is not to scale, its card says so.

## Dives

Frame is the height of the view on arrival, which the depth gauge shows.

### Skeletal dive
| Tier | Step | Frame | Honest stopping point and simplifications |
|---|---|---|---|
| 1 | Whole body | 2.5 m | Stylized adult figure with seven toggleable systems |
| 2 | Skeleton | 1.2 m | The femur the dive enters glows |
| 3 | Femur | 55 cm | Lathed cutaway; 125° neck angle |
| 4 | Bone tissue | 1.6 mm | Osteons 0.2 mm, central canals 50 µm |
| 5 | Osteocyte | 45 µm | Collagen fibrils drawn thicker than life |
| 6 | Nucleus (shared) | 9 µm | Pore count reduced; chromatin thickened |
| 7 | DNA (shared) | 11 nm | Stops here. Standard B-DNA dimensions, not atom positions |

### Circulatory dive
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.5 m | Circulatory system on |
| 3 | Heart | 20 cm | Frontal cutaway, beats at 70 per minute |
| 4 | Blood | 60 µm | Cells in plasma inside a small vessel |
| 5 | Red blood cell | 12.5 µm | Measured shape (Evans and Fung, 1972). Side trip into the shared lipid bilayer |
| 6 | Hemoglobin (shared) | 11 nm | Four chains as tubes; oxygen pressure slider on the Hill curve |
| 7 | Heme (shared) | 1.9 nm | Stops here. Porphyrin core; side groups and hydrogens omitted |

### Muscular dive
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.5 m | Muscular system on |
| 3 | Biceps | 42 cm | Cross-section of bundles within bundles |
| 4 | Fascicle | 2.2 mm | Fibers and capillaries |
| 5 | Muscle fiber | 190 µm | Side trip into the shared nucleus and DNA |
| 6 | Sarcomere | 2.4 µm | Sliding-filament control; frog filament lengths |
| 7 | Actin and myosin (shared) | 65 nm | Stops here. Cross-bridge cycle animation |

### Immune dive
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.5 m | Immune system on |
| 3 | Lymph node | 2.6 cm | Cortex, paracortex, medulla |
| 4 | Follicle | 300 µm | Germinal center |
| 5 | Plasma cell | 24 µm | Side trip into the shared nucleus and DNA |
| 6 | Antibody (shared) | 34 nm | Stops here. IgG domains as ellipsoids |

### Nervous dive (new in v0.3.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.5 m | Nervous system on |
| 3 | Brain | 21 cm | Folds are a generated pattern; left hemisphere cut open to show gray and white matter |
| 5 | Neuron | 390 µm | Cortical pyramidal neuron. Myelin segments drawn much shorter than life. Axon diameter control (Hursh's rule). Side trip into the shared nucleus and DNA |
| 6 | Synapse | 2.1 µm | Five-stage release control. Molecules enlarged. Side trip into the shared lipid bilayer |
| 7 | Glutamate (shared) | 1.5 nm | Stops here. Idealized bond lengths, fully extended chain, charged as at body pH |

### Respiratory dive (new in v0.3.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.5 m | Respiratory system on |
| 3 | Lungs | 37 cm | Seven of about 23 airway generations shown; breathing control |
| 4 | Alveoli | 1.15 mm | Alveoli translucent; capillary net simplified to arcs |
| 5 | Gas exchange | 22 µm | Air–blood barrier in section; capillary transit control (first-order loading, Hill saturation) |
| 6 | Hemoglobin (shared) | 11 nm | The same scene the circulatory dive reaches |
| 7 | O₂ and CO₂ (shared) | 1.05 nm | Stops here. Experimental bond lengths; ball-and-stick or space-filling |

### Inflammatory response (module)
A single animated scene of a splinter wound at about 100 µm scale: injury, alarm, leaky vessel, neutrophils arriving, resolution.

## Shared library

| Building block | Reached by |
|---|---|
| Cell nucleus, DNA | Skeletal (main path); muscular, immune, nervous (side trips) |
| Hemoglobin | Circulatory and respiratory (main path) |
| Heme | Circulatory (main path) |
| Actin and myosin | Muscular (main path) |
| Antibody | Immune (main path) |
| Glutamate (neurotransmitter) | Nervous (main path) |
| Lipid bilayer | Circulatory and nervous (side trips) |
| Oxygen and carbon dioxide | Respiratory (main path) |
| Planned: RNA, nucleotides, histones, amino acids, ATP, phospholipids | Listed for search and "made of" links |

## Not built yet

- Real anatomical meshes (Milestone 4 swaps organ tiers for Z-Anatomy meshes through `tools/zanatomy_export_blender.py`).
- Real molecular structures from the Protein Data Bank, loaded through Mol*.
- The desktop app (Tauri) and a first-launch hardware benchmark.
- Tissue-tier scenes for the nervous dive (cortical layers) and a spinal-cord branch.

## Known simplifications

- The whole-body figure is stylized; organ positions are approximate.
- Arteries are red and veins blue by convention, including in the lungs, where it means oxygen-poor (blue) and oxygen-rich (red) rather than artery and vein.
- Animations are slowed down, and each says by how much where it matters (the neuron's spike by hundreds of thousands of times; the capillary transit by 8 times).
