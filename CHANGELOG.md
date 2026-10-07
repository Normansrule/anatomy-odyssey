# Changelog

## 0.12.0

- **Urinary dive, down to the molecule.** An eighth dive follows blood through the kidney: the whole body with a new Urinary button (kidneys, the right a little lower, adrenal glands, renal vessels, ureters, bladder and urethra) → a kidney cut in half, 12 × 6 × 4 cm, with its pale cortex, eight striped pyramids, calyces cupping each papilla, the renal pelvis and ureter, and arteries arching along the pyramid bases → one nephron, see-through, from the glomerulus in Bowman's capsule through the proximal tubule, the loop of Henle dipping into the medulla, the distal tubule touching its own corpuscle (the juxtaglomerular apparatus), to a collecting duct shared with other nephrons, wrapped in capillaries and vasa recta → the filtration barrier in section, its pored capillary lining, basement membrane and interlocking podocyte feet with 40 nm slits → urea.
- **Two stage controls.** On the nephron, follow the filtrate: about 180 liters filtered a day, two thirds reclaimed in the proximal tubule, salt pumped out in the loop, hormone fine tuning, and ADH deciding the last of the water, leaving 1 to 2 liters of urine. On the filter, watch water, glucose and urea pass while albumin is held back.
- **A new shared molecule**, urea (CH₄N₂O), generated with RDKit like the others; every other molecule's geometry is unchanged.
- 23 new cards, 5 references (OpenStax chapter 25 and sections 25.3 to 25.6) and four quiz questions.
- 334 tests (from 320).

## 0.11.0

- **Every path now ends at a molecule.** All seven dives and all six modules finish at tier 7, and a test keeps it that way.
- **Inflammatory response, deeper.** After the wound, the module zooms into a mast cell beside a small vein: hundreds of histamine granules, IgE antibodies in its surface, and a four-stage control (resting, triggered by damage or by an allergen linking two IgE, granules released, the vein widening and leaking). Then histamine itself, generated with RDKit as it is at body pH (C₅H₁₀N₃⁺).
- **Immune response and memory** continues from the second infection to the antibody and on to its amino acids.
- **Immune dive and T cells module:** the amino acids, until now a side trip, are the final main step.
- 2 new cards (mast cell granules, IgE); the mast cell and histamine cards move to their new steps and say more.
- 320 tests (from 316).

## 0.10.0

- **Digestive dive, down to the molecule.** A seventh dive follows a meal into you: the whole body with the digestive organs → 7 cm of small intestine cut open (circular folds, a velvet of villi, the four wall layers stepping back at the cut, the mesentery with its arching vessels and fat) → villi on a block of the lining, one cut open to show its lacteal and capillary net, with crypts and goblet cells → five absorbing cells with their brush border, tight junctions, nucleus and mitochondria → glucose. A five-stage control on the absorbing cell follows one glucose molecule: brush border, in with two sodium ions through SGLT1, across the cell, out through GLUT2 to the capillary, and the sodium–potassium pump that keeps it all going. Four quiz questions.
- **The reflex arc reaches the molecule.** After the spinal cord, the module follows the motor command to the quadriceps: the neuromuscular junction (nerve terminal and Schwann cell, vesicles at release sites over the mouths of the junctional folds, receptors on the crests, acetylcholinesterase in a 50 nm gap) with a five-stage release control, then acetylcholine itself, which the enzyme can be shown cutting into acetate and choline. One quiz question now asks about acetylcholine.
- **Two new shared molecules**, generated with RDKit by `tools/gen_molecules.py` with formula, charge and stereocenter checks: β-D-glucose and acetylcholine. Every other molecule's geometry is unchanged.
- 20 new cards and 4 references (OpenStax sections 23.5 and 23.7, StatPearls and Wikipedia on the neuromuscular junction).
- 316 tests (from 298).

## 0.9.4

- **The biceps on a real arm.** The muscular dive's organ step now shows the biceps where it lives: the humerus with its head in the shoulder socket, the coracoid process and the top of the socket where its two heads attach, the long head tendon running up the front of the humerus and over its head, the distal tendon reaching the radius with its flat sheet (bicipital aponeurosis) to the forearm, the brachialis underneath, the triceps behind, and a faint outline of the arm. The arm runs corner to corner so it fills the screen, and the cut face with its fascicles still faces you.
- **A 3D lymph node.** The node is now bean-shaped, dented at the hilum, its back bulging where follicles lie under the capsule, with a solid cut edge, trabeculae between the follicles, high endothelial venules in the T cell zone, lymphocytes speckling the slice, valves along the incoming vessels and fat around the hilum.
- **Lungs close-up.** The lungs flatten where they face the heart, the left one has its cardiac notch, both show the fissures between lobes, and the pulmonary arteries and veins enter at their roots, with the heart drawn faintly between them.
- 298 tests (from 297).

## 0.9.3

- **Digestive system on the body.** A new Digestive button shows the esophagus passing through the diaphragm, the J-shaped stomach, the liver (right and left lobes) with the gallbladder, the pancreas behind the stomach, the duodenum, loops of small intestine, and the large intestine framing them with its pouches (haustra), S-bend, rectum and appendix. Each organ has its own color in life and its own card.
- **A real heart shape.** The heart is a rounded cone pointing down and to the left, with both atria, the coronary arteries in their groove and down the front, and the pulmonary trunk splitting to the lungs.
- **Lungs and diaphragm.** The lungs taper to their tips, flatten where they face the heart, show the fissures between their lobes (three on the right, two on the left) and the left lung's cardiac notch, and sit on a dome-shaped diaphragm. The windpipe has its C-shaped cartilage rings.
- Organs share one generated surface but each gets its own natural color (a new `natural` option for tissue materials).
- 6 new cards (digestive system, stomach, liver and gallbladder, pancreas, small intestine, large intestine), 1 new reference (OpenStax chapter 23); 297 tests (from 296).

## 0.9.2

- **A detailed skeleton.** The spine now has 7 neck, 12 chest and 5 lower-back vertebrae on an adult S-curve, each with its spinous and transverse processes and a disc below it, then the sacrum and tailbone. The 12 rib pairs follow the vertebrae, with costal cartilage: ribs 1–7 run to the breastbone (now manubrium, body and xiphoid), 8–10 join the cartilage above and 11–12 float. The shoulder blades are triangular plates with their spine and acromion, the collarbones S-curved. The pelvis is a bowl of two iliac wings with a crest that rises at the sides, around the hip sockets, pubis and ischium. Every hand has 8 wrist bones, 5 palm bones and 14 finger bones; every foot has 7 ankle bones, 5 metatarsals and 14 toe bones. The skull gains cheekbones, a jaw with rami and 32 teeth.
- **Shaped muscles.** The body's muscles are spindle-shaped bellies tapering to their tendons instead of eggs, and there are more of them: chest, the segmented rectus abdominis, obliques, neck, trapezius, latissimus dorsi, deltoid, biceps and triceps, forearm flexors and extensors, gluteals, quadriceps with vastus medialis, sartorius, adductors, hamstrings, the two heads of the calf with the Achilles tendon, and tibialis anterior.
- **Hover glow.** Pointing at a structure lights it up (parts drawn in several pieces, like the femur, glow together) along with its name.
- 4 new cards (shoulder girdle, hand bones, foot bones, intervertebral discs) and 2 references (OpenStax chapters 7 and 8).
- Small parts that share a name (vertebrae, ribs, hand and foot bones, teeth) are merged into single meshes, so the whole figure is now 228 meshes, down from 245, despite the extra detail.
- 296 tests (from 293).

## 0.9.1

- **Taller views.** Every scene is now framed into the band of screen between the top bar and the step track, so nothing hides behind them. The whole body and the skeleton step show the entire figure, head to feet (the skeleton step used to crop to the hips and knees). On phones, the body-system buttons are one row that scrolls sideways instead of a column over the legs.
- **Web and desktop versions.** The About dialog links to the desktop download from the web version, and names the web address in the desktop app. Version tags now publish the installers as a regular GitHub release (it was a draft), with notes on which file to pick and how to open an unsigned app.
- **GitHub Pages.** The deploy workflow has the read permission it needs, and says how to switch Pages on; `docs/PUBLISHING.md` is rewritten around reviewing a patch, pushing it yourself, turning on the website and publishing the desktop apps.
- README: the contributors section is gone; a short table shows where to get the web and desktop versions.
- 293 tests (from 290).

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
