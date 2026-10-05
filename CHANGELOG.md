# Changelog

## 0.9.0

- **Reflex arc module (knee jerk).** Two steps. A seated figure with the spine, spinal cord, thigh muscles and a reflex hammer: the tap stretches the quadriceps, a signal runs up a sensory fiber to the cord, crosses one synapse, runs back down a motor fiber, and the leg kicks, with a clock that adds up to about 18 ms (the measured value) while the hamstrings are told to relax. Then a slice of the cord at L3, about a centimeter wide: the butterfly of gray matter, white matter, roots, the dorsal root ganglion and the three neurons of the reflex, on the same stage control.
- **Tested reflex timing.** Latency = path ÷ speed for each nerve plus the synapse and nerve–muscle delays (equation 29); the drawn nerve paths are checked against the half meter the model assumes.
- **A more lifelike body.** The whole-body figure has a sculpted head with a jaw and eye sockets, a neck, shaped limbs, hands with fingers, feet, and bones that swell at the joints; a soft contact shadow replaces the floor ring.
- **Redesigned dive menu.** Dives and modules in two columns, each with its color, its scale range (for example "2.5 m to 1.9 nm") and dots for the steps you have seen; the current one is marked.
- **Friendlier first screen.** Start any dive straight from the intro, or look around the whole body first.
- 16 new cards, 4 quiz questions and 4 references; 290 tests (from 280).

## 0.8.0

- **Realistic tissue surfaces.** A new surface framework (`src/engine/textures/`) generates tileable color, normal and roughness maps in code for 17 tissues (skin, bone, muscle, heart muscle, organ, artery, vein, lung, gray and white matter, cartilage, red and yellow marrow, tendon, nerve, fascia) and builds physically based materials with a wet clearcoat where tissue is wet. The organ and tissue steps of every dive use them.
- **Studio lighting.** Soft image-based reflections from a studio built in code (no downloads), so wet and glossy surfaces read as real.
- **Natural or stain colors.** About → Look switches organs and tissues between the colors they have in life and the stained-slide palette. Cells and molecules keep stain colors.
- **Scales with the device.** Texture size and reflections follow picture quality and the first-launch device check: none on slow devices, 256 px by default, 512 px on Sharp.
- **New README**: shorter, scannable, with screenshots and details folded away.
- **Contributors**: Aleksander Norman and Claude are both listed (README, `CITATION.cff`, package metadata), and commits carry both names.
- 280 tests (from 265), including tileable-noise, normal-map and material tests.

## 0.7.0

- **Cortex step in the nervous dive.** A new tissue-tier step between the brain and the neuron: a 2.5 mm block of cerebral cortex with its six layers, about 2,500 neurons (cell bodies to scale), apical dendrites reaching layer I, three large layer V pyramidal neurons drawn in full, a 0.5 mm cortical column and the white matter below. A layer control highlights each layer and explains what lives there.
- 9 new cards (one per layer, pyramidal neuron, cortical column) and 3 references.
- Fix: short reference links on cards sat too close together for touch (found by the accessibility audit); they now have WCAG 2.2 target spacing.
- Fix: the old repository mix-up is cleaned up (the stray telescope branch is gone from this repository; the telescope work is in cosmic-library).
- 265 tests (from 263).

## 0.6.0

- **Repository fixed.** The GitHub repository had been filled with a copy of Cosmic Library; it now holds only Anatomy Odyssey. The telescope eyepiece work that was in it moved to cosmic-library (pull request #1 there).
- **T cells module.** Three steps: antigen presentation and clonal expansion (a dendritic cell, passing T cells that do not fit, and a helper T cell that docks and divides to 16); a killer T cell destroying a virus-infected cell (recognize, aim, strike, apoptosis); and a T-cell receptor reading a nine-amino-acid peptide on MHC class I with CD8 and CD3, with a self-versus-viral peptide control and a side trip into the amino acids.
- **New tested science.** Clonal expansion (N = 2ⁿ, t = t_d · log₂ N), the 15 nm receptor gap against the 36–45 nm adhesion ring, and peptide length (equations 26–27).
- A shared stage-by-stage animation control for step-through scenes; the antigen card now covers T cells as well as antibodies.
- 15 new cards, 4 quiz questions and 6 references; 263 tests (from 250).

## 0.5.0

- **Chemistry of life module.** Your body as about 2,300 cubes sorted by element, switchable between mass and number of atoms (hydrogen goes from 9.5% to 61%); carbonic anhydrase as a bead model with its zinc site, histidines and proton shuttle, running its catalytic cycle under a "barrier lowered" control (41.6 kJ/mol gives the real ten-million-fold speed-up); and the bicarbonate buffer with a blood CO₂ control that sets pH through the Henderson–Hasselbalch equation.
- **Immune response and memory module.** Thirteen immune cells and particles at true relative size, from a 0.1 µm virus to a 21 µm macrophage, then a 140-day illustrative model of a first and second infection with a chart and a tissue strip that follow it.
- **New tested science.** Mass-to-atom conversion, atoms in a body, enzyme barrier and speed-up, Henderson–Hasselbalch, hydrogen-ion concentration, and a seven-population immune model solved with fourth-order Runge–Kutta (equations 19–25 in docs/EQUATIONS.md).
- **New generated molecules.** Water, carbonic acid, bicarbonate and hydronium from RDKit, with formula and charge checks.
- **First-launch benchmark.** The app times a few seconds of frames and tunes the "Balanced" picture setting: fewer pixels on slow devices, more on fast high-refresh screens. About shows the result and can measure again.
- **Accessibility audit.** `tools/a11y-audit.py` runs axe-core (WCAG 2.2 A and AA rules) over 18 states. It found one issue, fixed: the search box is now a proper combobox.
- **Publishing guide.** docs/PUBLISHING.md has the terminal commands for the first push and for updates.
- 30 new cards, 8 quiz questions and 9 references; 250 tests (from 208).

## 0.4.0

- **Complete shared library.** New shared scenes for RNA, nucleotides, the nucleosome, the 20 amino acids, ATP (with hydrolysis) and a phospholipid. Every building block is now built.
- **Generated molecule geometry.** Amino acids, nucleotides, ATP, ADP and POPC come from RDKit (ETKDG v3 + MMFF94), with formula, charge and handedness checked by the generator and the tests.
- **From gene to protein module.** The start of the human β-globin gene is transcribed, exported through a nuclear pore, translated codon by codon and folded, then the dive continues into RNA and the amino acids. Includes the genetic code, tested, and the sickle-cell example.
- **Zoom anywhere.** Shared-block cards link up to what they are part of and down to what they are made of; the app routes you there from where you are. Search reaches every shared scene. New side trips into nucleotides, the nucleosome, ATP, amino acids and phospholipids.
- **Map by scale.** A map of every dive, side trip and shared building block on one log scale (press M).
- **Desktop app.** Tauri 2 shell with no system permissions; CI builds Windows, macOS and Linux installers on version tags.
- **Phones.** Two-row top bar; scenes lift above the controls panel; very wide scenes stay in frame.
- 208 tests (from 109).

## 0.3.0

- Nervous and respiratory dives; shared glutamate, lipid bilayer and gas scenes; circulatory, muscular and immune dives; the inflammatory response module; guided tour, quizzes, glossary and settings.

## 0.1.0

- First version: whole-body model with system toggles, click-to-learn cards, the tier-transition engine and the skeletal dive down to DNA.
