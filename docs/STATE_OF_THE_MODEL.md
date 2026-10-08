# State of the model

Last updated for v0.14.0. The About dialog in the app shows the same information, generated from `src/data/dives.js` and `src/data/library.js`.

All geometry is procedural (built from simple shapes in code) and labeled as a generalized teaching model. Where a view is not to scale, its card says so.

Surfaces (new in v0.8.0): organ and tissue steps use physically based materials whose color, bump and roughness patterns are generated in code to imitate each tissue at that scale (muscle fibers, bone pores, lung lobules, surface vessels on the brain). They are generalized patterns, not photographs of a specimen. In the Natural look, colors are those of fresh tissue; in the Stain look, the stained-slide palette. Cells and molecules always use stain colors, since real ones are nearly colorless.

## Dives

Frame is the height of the view on arrival, which the depth gauge shows.

### Skeletal dive
| Tier | Step | Frame | Honest stopping point and simplifications |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Stylized adult figure with ten toggleable systems (Digestive, Urinary and Endocrine are off until you switch them on). Heart: a rounded cone with both atria, the coronary arteries and the pulmonary trunk. Lungs: tapered, flatter toward the heart, with lobe fissures and the left lung's cardiac notch, on a diaphragm dome. Digestive organs: esophagus, stomach, liver and gallbladder, pancreas, duodenum, small-intestine loops (far shorter than the real 3 m) and the large intestine with its pouches and appendix. Urinary organs: bean-shaped kidneys (the right a little lower), renal vessels, ureters, bladder and urethra. Endocrine glands: pituitary, thyroid with its isthmus, four parathyroids, and the adrenal glands on the kidneys |
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
| 6 | Antibody (shared) | 34 nm | IgG domains as ellipsoids |
| 7 | Amino acids (shared, main step since v0.11.0) | 1.4 nm | Stops here. The same RDKit-generated scene the gene-to-protein module reaches |

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

### Digestive dive (new in v0.10.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Digestive system on |
| 3 | Small intestine | 6 cm | 7 cm of jejunum, 2.54 cm across, cut open; circular folds drawn about 4 mm deep; about 9,000 villi drawn (a real piece this size has far more); stepped wall layers; mesentery with arcades and fat |
| 4 | Villi | 1.6 mm | Villi 0.52–0.76 mm tall on a block of wall; one cut open to show the lacteal and capillary net; crypts, goblet cells, muscularis mucosae, submucosa |
| 5 | Absorbing cell | 42 µm | Five cells 8 × 26 µm with microvilli 1 µm long; tight junctions, nucleus, mitochondria; SGLT1, GLUT2 and the sodium–potassium pump drawn hundreds of times larger; glucose about 1,000 times too big; five-stage control |
| 7 | Glucose (shared) | 1.3 nm | Stops here. RDKit-generated β-D-glucose (C₆H₁₂O₆), stereocenters checked |

### Urinary dive (new in v0.12.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Urinary system on |
| 3 | Kidney | 14 cm | Cut lengthwise, 12 × 6 × 4 cm (OpenStax: 11–14 × 6 × 4 cm); cortex, renal columns, eight pyramids with collecting-duct striations, minor and major calyces, pelvis and ureter; renal artery and vein, interlobar and arcuate arteries; adrenal gland on top. A real kidney has several to more than a dozen pyramids |
| 4 | Nephron | 3 mm | One nephron, see-through: corpuscle 0.2 mm, proximal and distal tubules, loop of Henle (drawn shorter than long real loops), collecting duct shared with other nephrons, afferent and efferent arterioles, juxtaglomerular apparatus, capillaries and vasa recta. Five-stage filtrate control: 180 L a day filtered, two thirds reclaimed in the proximal tubule (OpenStax 25.6), 1–2 L of urine; the dots thin out schematically after the proximal tubule |
| 6 | The filter | 1.9 µm | Fenestrated endothelium, a basement membrane of protein fibers, podocyte foot processes with 40 nm slits and slit diaphragms; layer thicknesses approximate. Water, glucose, urea and albumin drawn far larger than life, and far fewer; a red blood cell drawn at about half its real width. Four-stage control: pores, slits, albumin held back |
| 7 | Urea (shared, new) | 1 nm | Stops here. RDKit-generated (CH₄N₂O) |

### Endocrine dive (new in v0.13.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Endocrine system on |
| 3 | Thyroid gland | 13 cm | Lobes 5 cm tall hugging the windpipe, isthmus across tracheal rings 2 and 3 (StatPearls), upper poles beside the thyroid cartilage; four parathyroids on the back; superior and inferior thyroid arteries, thyroid veins, common carotid arteries and internal jugular veins. One lobe cut open, with about 300 follicles drawn larger than life. Lobe size is typical, not from a cited source |
| 4 | Follicles | 0.8 mm | Twenty follicles 0.1–0.28 mm across, each a ball of 12 µm cells around colloid, wrapped in capillaries; C cells between them; the front follicle cut across like a slide. TSH control: cells 6 µm tall at rest, 16 µm when active, colloid droplets taken back in |
| 5 | Follicle cell | 44 µm | Four cells 12 µm wide between colloid and a capillary, one see-through (nucleus, rough endoplasmic reticulum, Golgi, mitochondria, microvilli). Iodide carriers, peroxidase, thyroglobulin, lysosomes and hormone drawn far larger than life and far fewer. Five-stage control following OpenStax 17.4 |
| 7 | Thyroxine (shared, new in v0.13.0) | 2 nm | Stops here. RDKit-generated T4 (C₁₅H₁₁I₄NO₄) and T3, L form checked, amino-acid end charged as in water; a control switches between T4, T3 and space filling |

### Skin dive (new in v0.14.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 1 | Whole body | 2.1 m | Skin on; clicking the skin now opens its own card |
| 3 | Skin | 6 mm | A 5 × 2.8 mm block of thin skin cut on two faces: epidermis 0.1 mm, papillary and reticular dermis, hypodermis with fat cells; three slanted hair follicles reaching the hypodermis with sebaceous glands and arrector pili, two coiled sweat glands with ducts to pores, deep and superficial vessel networks with capillary loops in the papillae, tactile and lamellated corpuscles. Layer thicknesses are typical for a forearm, not from a cited source. Temperature control: vessels narrow or widen, hairs stand up in the cold, sweat beads in the heat |
| 4 | Epidermis | 0.22 mm | Layer counts within OpenStax's ranges: 1 basal, 8 spinosum, 4 granulosum, 18 corneum; wavy junction with dermal papillae and capillary loops; melanocytes, Langerhans cells, a Merkel cell on a nerve ending. Cells are simplified shapes. Five-stage control following one keratinocyte from birth to being shed |
| 5 | Sunlight | 66 µm | A basal keratinocyte 11 µm wide, see-through, with its nucleus capped by melanin; a melanocyte handing over melanosomes; a dermal capillary below. UV rays, melanin granules and molecules drawn far larger than life. Four-stage control: UV arrives, melanin shields, vitamin D3 made in the membrane, vitamin D3 to the blood |
| 7 | Vitamin D3 (shared, new) | 2.4 nm | Stops here. RDKit-generated cholecalciferol (C₂₇H₄₄O), five stereocentres and the 5Z,7E double bonds checked; the three double bonds glow |

### From gene to protein (module, new in v0.4.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 6 | Gene to protein | 175 nm | Nucleus, envelope with one pore, cytoplasm. Machines roughly to size (pore ~100 nm, ribosome ~25 nm, polymerase ~15 nm); mRNA nucleotides spaced ~3× wider than life; 11 of 147 β-globin codons drawn, then the stop codon; all timing slowed |
| 7 | RNA (shared) | 10 nm | A-form hairpin (UUCG loop) plus a tail carrying the first three β-globin codons. Built from standard dimensions |
| 7 | Amino acids (shared) | 1.4 nm | Stops here. All 20, generated with RDKit, charged as at body pH |

### Inflammatory response (module)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 4 | Inflammation | 105 µm | A splinter wound, animated: injury, alarm, leaky vessel, neutrophils arriving, resolution |
| 5 | Mast cell (new in v0.11.0) | 32 µm | Mast cell 14 µm, cut open, about 240 granules; venule 16 µm with red blood cells to scale; IgE and histamine drawn far larger and fewer; four-stage control |
| 7 | Histamine (shared, new in v0.11.0) | 1.3 nm | Stops here. RDKit-generated, charged as at body pH (C₅H₁₀N₃⁺), N-tau tautomer |

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
| 6 | Antibody (shared, new in v0.11.0) | 34 nm | The immune dive's scene |
| 7 | Amino acids (shared, new in v0.11.0) | 1.4 nm | Stops here |

### T cells: presenting and killing (module, new in v0.6.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 5 | Antigen presentation | 36 µm | Dendritic cell and T cells to scale; MHC class II knobs more than 100× too big; the clone stops at 16 cells (four divisions) |
| 5 | A killer T cell at work | 28 µm | Infected cell 15 µm, killer T cell 8 µm; virus particles about 4× too big; perforin pores and MHC knobs enlarged; minutes compressed into seconds |
| 6 | Receptor meets peptide | 24 nm | Domains as smooth shapes at roughly real size, not atomic coordinates; membranes 15 nm apart; diagonal docking as in Garboczi et al., 1996; 9-amino-acid peptide |
| 7 | Amino acids (shared, main step since v0.11.0) | 1.4 nm | Stops here |

### Reflex arc: the knee jerk (module, new in v0.9.0)
| Tier | Step | Frame | Notes |
|---|---|---|---|
| 2 | The knee jerk | 1.45 m | Generalized seated figure: lower spine, cord ending near L1–L2 with the cauda equina, femur, simplified quadriceps and hamstrings, kneecap and patellar tendon. Muscle spindle drawn much larger than life. Nerve paths about 0.5 m each, as in the model; animation slowed about a thousand times |
| 3 | Inside the spinal cord | 16 mm | L3 slice 9.6 × 7.6 mm with generalized gray-matter outline; roots, dorsal root ganglion and spinal nerve simplified; cell bodies drawn about 10 times larger; cut fiber ends shown as dots, far fewer than real |
| 6 | Nerve meets muscle (new in v0.10.0) | 3.2 µm | Terminal over a folded end plate; gap drawn 50 nm; release sites over the fold mouths, receptors on the crests; vesicles 50 nm; receptors, enzyme and ions enlarged several times; five-stage control |
| 7 | Acetylcholine (shared, new in v0.10.0) | 1.5 nm | Stops here. RDKit-generated geometry (C₇H₁₆NO₂⁺); a control shows the enzyme cutting the ester bond |

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
