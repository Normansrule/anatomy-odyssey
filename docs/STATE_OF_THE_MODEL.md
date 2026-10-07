# State of the model

Last updated for v0.8.0. The About dialog in the app shows the same information, generated from `src/data/dives.js` and `src/data/library.js`.

All geometry is procedural (built from simple shapes in code) and labeled as a generalized teaching model. Where a view is not to scale, its card says so.

Surfaces (new in v0.8.0): organ and tissue steps use physically based materials whose color, bump and roughness patterns are generated in code to imitate each tissue at that scale (muscle fibers, bone pores, lung lobules, surface vessels on the brain). They are generalized patterns, not photographs of a specimen. In the Natural look, colors are those of fresh tissue; in the Stain look, the stained-slide palette. Cells and molecules always use stain colors, since real ones are nearly colorless.

## Dives

Frame is the height of the view on arrival, which the depth gauge shows.

### Skeletal dive
| Tier | Step | Frame | Honest stopping point and simplifications |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Stylized adult figure with eight toggleable systems (Digestive is off until you switch it on). Heart: a rounded cone with both atria, the coronary arteries and the pulmonary trunk. Lungs: tapered, flatter toward the heart, with lobe fissures and the left lung's cardiac notch, on a diaphragm dome. Digestive organs: esophagus, stomach, liver and gallbladder, pancreas, duodenum, small-intestine loops (far shorter than the real 3 m) and the large intestine with its pouches and appendix |
| 2 | Skeleton | 1.9 m | The whole skeleton, head to feet; the femur the dive enters glows. Built from simple shapes: 24 vertebrae on an S-curve with discs, 12 rib pairs with costal cartilage, breastbone, shoulder blades and collarbones, a pelvic bowl, and every bone of the hands (27) and feet (26), simplified in shape |
| 3 | Femur | 55 cm | Lathed cutaway; 125° neck angle |
| 4 | Bone tissue | 1.6 mm | Osteons 0.2 mm, central canals 50 µm |
| 5 | Osteocyte | 45 µm | Collagen fibrils drawn thicker than life |
| 6 | Nucleus (shared) | 9 µm | Pore count reduced; chromatin thickened |
| 7 | DNA (shared) | 11 nm | Stops here. Standard B-DNA dimensions, not atom positions |

### Circulatory dive
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Circulatory system on |
| 3 | Heart | 20 cm | Frontal cutaway, beats at 70 per minute |
| 4 | Blood | 60 µm | Cells in plasma inside a small vessel |
| 5 | Red blood cell | 12.5 µm | Measured shape (Evans and Fung, 1972). Side trip into the shared lipid bilayer |
| 6 | Hemoglobin (shared) | 11 nm | Four chains as tubes; oxygen pressure slider on the Hill curve |
| 7 | Heme (shared) | 1.9 nm | Stops here. Porphyrin core; side groups and hydrogens omitted |

### Muscular dive
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Muscular system on |
| 3 | Biceps | 46 cm | Cross-section of bundles within bundles, on an upper arm tilted corner to corner: humerus in the shoulder socket, coracoid process, radius and ulna, brachialis and triceps, with the long head tendon running over the humeral head. Bone and muscle shapes are simplified |
| 4 | Fascicle | 2.2 mm | Fibers and capillaries |
| 5 | Muscle fiber | 190 µm | Side trip into the shared nucleus and DNA |
| 6 | Sarcomere | 2.4 µm | Sliding-filament control; frog filament lengths |
| 7 | Actin and myosin (shared) | 65 nm | Stops here. Cross-bridge cycle animation |

### Immune dive
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Immune system on |
| 3 | Lymph node | 2.6 cm | Bean-shaped, dented at the hilum; cortex, paracortex, medulla, trabeculae, high endothelial venules, fat at the hilum. Lymphocytes drawn about 10 times too big and far fewer than real |
| 4 | Follicle | 300 µm | Germinal center |
| 5 | Plasma cell | 24 µm | Side trip into the shared nucleus and DNA |
| 6 | Antibody (shared) | 34 nm | Stops here. IgG domains as ellipsoids |

### Nervous dive (new in v0.3.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Nervous system on |
| 3 | Brain | 21 cm | Folds are a generated pattern; left hemisphere cut open to show gray and white matter |
| 4 | Cortex (new in v0.7.0) | 4.2 mm | A 2.5 mm thick block with six layers in typical proportions (real ones vary by region); roughly 1 neuron in 100 drawn, cell bodies to scale; dendrites as thin lines for some pyramidal cells |
| 5 | Neuron | 390 µm | Cortical pyramidal neuron. Myelin segments drawn much shorter than life. Axon diameter control (Hursh's rule). Side trip into the shared nucleus and DNA |
| 6 | Synapse | 2.1 µm | Five-stage release control. Molecules enlarged. Side trip into the shared lipid bilayer |
| 7 | Glutamate (shared) | 1.5 nm | Stops here. Idealized bond lengths, fully extended chain, charged as at body pH |

### Respiratory dive (new in v0.3.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Respiratory system on |
| 3 | Lungs | 37 cm | Seven of about 23 airway generations shown; breathing control. Lungs flatter toward the heart, with lobe fissures and the cardiac notch; pulmonary arteries and veins at the roots; the heart as a faint outline |
| 4 | Alveoli | 1.15 mm | Alveoli translucent; capillary net simplified to arcs |
| 5 | Gas exchange | 22 µm | Air–blood barrier in section; capillary transit control (first-order loading, Hill saturation) |
| 6 | Hemoglobin (shared) | 11 nm | The same scene the circulatory dive reaches |
| 7 | O₂ and CO₂ (shared) | 1.05 nm | Stops here. Experimental bond lengths; ball-and-stick or space-filling |

### From gene to protein (module, new in v0.4.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 6 | Gene to protein | 175 nm | Nucleus, envelope with one pore, cytoplasm. Machines roughly to size (pore ~100 nm, ribosome ~25 nm, polymerase ~15 nm); mRNA nucleotides spaced ~3× wider than life; 11 of 147 β-globin codons drawn, then the stop codon; all timing slowed |
| 7 | RNA (shared) | 10 nm | A-form hairpin (UUCG loop) plus a tail carrying the first three β-globin codons. Built from standard dimensions |
| 7 | Amino acids (shared) | 1.4 nm | Stops here. All 20, generated with RDKit, charged as at body pH |

### Inflammatory response (module)
A single animated scene of a splinter wound at about 100 µm scale: injury, alarm, leaky vessel, neutrophils arriving, resolution.

### Chemistry of life (module, new in v0.5.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Elements of the body | 2.2 m | A generalized 1.75 m figure cut into about 2,300 cubes of 3 cm, filled from the feet up by mass or by atoms (Campbell Biology mass figures; atom shares computed from them) |
| 6 | An enzyme at work | 6.4 nm | Carbonic anhydrase II as 260 beads (one per amino acid) inside the real outline, not the real fold. Zinc site (His94, His96, His119), cleft depth (15 Å) and proton shuttle (His64) follow the literature; the cleft mouth is drawn about 1.5× wider so the zinc can be seen. Catalytic cycle animated, slowed about a million times |
| 7 | Blood’s pH buffer | 1.6 nm | CO₂ + H₂O ⇌ H₂CO₃ ⇌ H⁺ + HCO₃⁻ with RDKit-generated carbonic acid, bicarbonate, water and hydronium, and the experimental CO₂ geometry. The numbers of CO₂ and H₃O⁺ drawn are a cue only; the real ratio of bicarbonate to free H⁺ is about 600,000 to 1 |

### Immune response and memory (module, new in v0.5.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 5 | Immune cells to scale | 55 µm | Thirteen cells and particles at mid-range textbook diameters (OpenStax; macrophage from Krombach et al., 1997). Nuclei and granules simplified; granules larger and fewer than life. The virus is to scale, so a marker ring shows where it is |
| 5 | First and second exposure | 50 µm | A chart of an illustrative model (not fitted to data) over 140 days on log scales, above a tissue strip whose contents follow the model. Cells and bacteria to scale; antibodies drawn as dots about 40× too big |

### T cells: presenting and killing (module, new in v0.6.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 5 | Antigen presentation | 36 µm | Dendritic cell and T cells to scale; MHC class II knobs more than 100× too big; the clone stops at 16 cells (four divisions) |
| 5 | A killer T cell at work | 28 µm | Infected cell 15 µm, killer T cell 8 µm; virus particles about 4× too big; perforin pores and MHC knobs enlarged; minutes compressed into seconds |
| 6 | Receptor meets peptide | 24 nm | Domains as smooth shapes at roughly real size, not atomic coordinates; membranes 15 nm apart; diagonal docking as in Garboczi et al., 1996; 9-amino-acid peptide. Side trip into the shared amino acids |

### Reflex arc: the knee jerk (module, new in v0.9.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 2 | The knee jerk | 1.45 m | Generalized seated figure: lower spine, cord ending near L1–L2 with the cauda equina, femur, simplified quadriceps and hamstrings, kneecap and patellar tendon. Muscle spindle drawn much larger than life. Nerve paths about 0.5 m each, as in the model; animation slowed about a thousand times |
| 3 | Inside the spinal cord | 16 mm | L3 slice 9.6 × 7.6 mm with generalized gray-matter outline; roots, dorsal root ganglion and spinal nerve simplified; cell bodies drawn about 10 times larger; cut fiber ends shown as dots, far fewer than real |

## Shared library

Every entry is built. Main path means the dive passes through it; side trip means a branch from a step; "made of" means you reach it by zooming in from a card.

| Building block | Reached by | Geometry |
|---|---|---|
| Cell nucleus | Skeletal (main); muscular, immune, nervous (side trips) | Procedural cutaway |
| Nucleosome | Skeletal (side trip from the nucleus); made of → from the nucleus | 1.65 superhelical turns at 4.2 nm radius (Luger et al., 1997); histones as blobs |
| DNA | Skeletal (main); muscular, immune, nervous (side trips) | B-form from standard dimensions |
| Nucleotides | Skeletal (side trip from DNA); made of → from DNA and RNA | RDKit-generated, 8 molecules |
| RNA | Gene to protein (main) | A-form hairpin from standard dimensions |
| Hemoglobin | Circulatory and respiratory (main) | Four chains as tubes |
| Heme | Circulatory (main) | Idealized bond lengths |
| Actin and myosin | Muscular (main) | Procedural, real repeat lengths |
| ATP | Muscular (side trip from myosin) | RDKit-generated, with hydrolysis |
| Antibody | Immune (main) | IgG domains as ellipsoids |
| Amino acids | Gene to protein (main); immune and T cells (side trips); made of → from hemoglobin, myosin, antibody, nucleosome | RDKit-generated, all 20 |
| Glutamate | Nervous (main) | Idealized bond lengths |
| Lipid bilayer | Circulatory and nervous (side trips) | Procedural lattice snapshot |
| Phospholipid | Circulatory and nervous (side trips) | RDKit-generated POPC |
| Oxygen and carbon dioxide | Respiratory (main) | Experimental bond lengths |

## Not built yet

(The desktop app, the first-launch hardware benchmark and the accessibility audit are done; see the README.)

- Real anatomical meshes (Milestone 4 swaps organ tiers for Z-Anatomy meshes through `tools/zanatomy_export_blender.py`).
- Real atomic structures for the large molecules (hemoglobin, antibody, myosin, nucleosome) from the Protein Data Bank, loaded through Mol*. Small molecules already use generated 3D geometry.
- A direct path from the nervous dive into the spinal cord (it is reached through the reflex arc module for now).
- The real fold of carbonic anhydrase (PDB structures such as 3KS3) in place of the bead model.
- Real atomic structures for the T-cell receptor and MHC (for example PDB 1AO7) in place of the smooth domains.

## Known simplifications

- The whole-body figure is stylized; organ positions are approximate. Muscles are smooth spindle or plate shapes in roughly the right places, not their real attachments; the skull is three shapes plus jaw and teeth, not its 22 bones.
- Arteries are red and veins blue by convention, including in the lungs, where it means oxygen-poor (blue) and oxygen-rich (red) rather than artery and vein.
- Animations are slowed down, and each says by how much where it matters (the neuron's spike by hundreds of thousands of times; the capillary transit by 8 times).
