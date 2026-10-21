# Changelog

## 0.20.0

- **A body measured from a real one.** The blocky whole body and skeleton are replaced by 411 meshes built from BodyParts3D (the Database Center for Life Science's model of a real adult male, CC BY-SA 2.1 Japan): every bone, muscle and organ in its measured shape, smoothed and reduced by `tools/build_body_meshes.py` into one 10.9 MB bundle that is checked against the asset manifest before it is used. The simplified figure stays as the fallback while it loads or if it cannot.
- **The heart beats and the blood flows.** The heart beats 72 times a minute on the whole body, and red cells stream through 33 measured vessels and the vessels of the arms and legs: out through the arteries in a surge with each beat (drawn red), back through the veins at a steadier pace (drawn blue). The vessels are see-through so the blood shows. Each vessel's center line is traced from its mesh by `tools/build_body_meshes.py`.
- **The body fights an infection.** The immune dive now opens on the left arm with a cut on the forearm and a stage control: bacteria get in, the skin around the cut turns red and swollen as neutrophils leave the blood, dendritic cells carry pieces of the germ up a lymph vessel to the armpit, the armpit nodes swell, antibodies stream back in the blood and coat the bacteria, and the cut heals with memory cells left in the node. Every cell and antibody is drawn hugely enlarged and opens its card.
- **Measured brain and lungs up close.** The brain and lungs steps now show the real organs from the same measured body instead of drawn stand-ins. The brain shows every fold, the cerebellum and the brainstem; point at a fold to see what it does, and a control colors the lobes or makes the outer cortex see-through to show the corpus callosum, cingulate gyrus and insula. The lungs show five see-through lobes around the real bronchial tree, the pulmonary arteries and veins, the heart and the diaphragm, with drawn bronchioles and alveolar sacs, and they still breathe.
- **Measured pancreas and liver up close.** The pancreas step shows the real gland, see-through, in the curve of the measured duodenum with the spleen at its tail and the splenic vessels behind it; the main duct follows the gland's own center line from tail to head and empties at the ampulla beside the common bile duct, and the islets are scattered inside the real gland. The liver step shows the real liver, see-through over its hepatic veins, portal vein and bile ducts, with the gallbladder, inferior vena cava and hepatic artery, and a magnifier on the right lobe that shows its lobules. The ducts and veins are routed through points measured from the meshes by `tools/build_body_meshes.py`.
- **The real heart, opened.** The heart step now shows the measured heart, cut along the plane through its tip and its tricuspid and mitral valves (the four-chamber view of a heart scan), so its four real chambers, the septum between them, the valves with their cords, the coronary vessels and the great vessels show. The chambers were found as the hollows inside the measured wall by `tools/build_body_meshes.py` (about 70 to 95 mL each in this heart). Blood fills them, blue on the right and red on the left; it beats, the chambers squeeze in turn, and blood streams in from the veins and out through the pulmonary valve and the aorta. A heart rate control (asleep, resting, walking, running) shows how much blood it pumps a minute.
- **The real kidney, cut in half.** The kidney step now shows the measured left kidney with its adrenal gland and renal vessels, cut along its own broad plane (found from the mesh) so the cut face has the real outline. The atlas has only the kidney's outside, so the cortex, pyramids, calyces, pelvis and arteries on the cut face are the drawn ones, stretched to fit that outline.
- **The real thigh bone, cut open.** The femur step now shows the measured left femur, cut lengthwise through its shaft and head so the cut face has its real outline: head, neck, trochanter, shaft and condyles, with cartilage over the hip and knee ends. On that face are the compact wall (about 6 mm thick along the shaft, thin over the ends), yellow marrow in the shaft and spongy bone with red marrow in the ends.
- **Follow a meal through the real digestive tract.** The digestive dive has a new step between the whole body and the small intestine: the measured esophagus, stomach, duodenum, small and large intestines, with the liver, gallbladder and pancreas. A stage control follows one mouthful along the route traced through them by `tools/build_body_meshes.py` (the atlas packs the jejunum and ileum as two masses, so the path through their loops is drawn), with how long each part takes; the organ it is in glows while the others fade.
- **Follow urine through the real urinary tract.** The urinary dive has a new step between the whole body and the kidney: both measured kidneys, the ureters with their renal pelves, the bladder, the adrenal glands and the renal arteries and veins, with the aorta, vena cava and pelvis behind. The routes are read from the meshes (the ureters' center lines from 1 cm slices); a stage control follows blood in along the renal arteries, urine gathering in each pelvis, down the ureters, and into the bladder, whose urine rises as it fills and drains as it empties through a drawn urethra (the atlas has none).
- **The README shows the progress.** A new Progress section near the top: animations of the beating heart, zooming into the body, a meal through the digestive tract and urine through the urinary tract, stills of the measured body and every real organ close-up, and a progress tracker: each dive's state (measured, drawn, next) with an overall bar, and the main features. The skeletal, respiratory and nervous dive animations and the organ screenshots are re-recorded from the measured body. `tools/record-hero.py` gains `--step`, `--live` and `--zoom` (records a step animating by itself, stepping the page's clock so software rendering still plays at real speed), `--clean` and `--crop`; it and `tools/screenshots.py` take `--browser` for a Chromium that Playwright did not install, and the screenshot list includes the two new tract steps.
- **A wall chart redesign.** The app is redrawn as a classroom anatomy wall chart: a ruled sheet with the scale column on the left, the plate in the middle, the card as a numbered key on the right and the dive's plates along the bottom. Color follows the anatomical code (artery red, vein blue, nerve yellow, lymph green, bone ivory), and red marks "you are here". Archivo (condensed) sets the titles and Atkinson Hyperlegible Next everything you read; Literata is gone. There is a light sheet and a dark slate, following the device or chosen in About. Nothing is smaller than 12 px, everything sits on a 4 px spacing rhythm, presses answer with a slight scale on one ease-out curve, hover only applies with a real mouse, and reduced motion keeps color and fade feedback. Loading shows a "Drawing the plate" title card, a body that fails to load shows a notice over the simplified figure, and the map places each label on whichever side of its point is clear.
- **The scale slider.** The scale column is now a slider from 10 m to 0.1 nm (drag it, or use the arrow, Page, Home and End keys). Inside a plate the camera zooms on a log-scale spring; when the size asked for is nearer the next plate's, the view flies on and keeps going, so one drag goes from the whole body to DNA. Flights now speed up out of one plate and slow into the next with no pause at the model swap, and flights during a drag are quicker.
- **The living key.** The card lists everything in view as a numbered key, and the same numbers sit on the model (projected from each part every frame, set on the part's surface and kept clear of each other). Point at a number in the key and a red leader line draws to the part and follows it as the model turns; point at a part and its number lights in the key. Parts cut away entirely (the aorta in the opened heart) are left out.
- **A guide website.** `npm run build` also builds a small website into `dist/guide/` (`tools/build-guide.mjs`): a landing page drawn as the same chart (the body with its fifteen dives numbered, a key whose leader lines draw to where each dive starts, and the skeletal dive's plates pinned to a ruler from 10 m to 0.1 nm), and the docs and changelog as booklet pages with a contents column. It uses the app's own color tokens, self-hosted fonts and the same strict Content Security Policy, and its Markdown converter (`tools/markdown.mjs`) escapes everything it reads. About links to it.
- **A new README.** An overview, key features, animations of the scale slider and the living key, stills of the new look, setup and usage with the keyboard keys, the project structure, and a Design section on the wall chart concept and its principles. `tools/record-hero.py` gains `--slide` and `--key`, and the accessibility audit now covers the slider, the key, dark mode and the guide (47 states, no violations).
- **More room for the model on phones and tablets.** Below the wide layout the card is a sheet along the bottom (tablets used to get a column that covered half the model). It opens low, showing the title and first lines, and the handle on top raises it to the whole card or lowers it again (tap, swipe or keyboard; tabbing into the hidden part raises it). The model is framed in the space above the sheet; it used to be lifted out of view when a step with a control box was open.
- **The guide's dive numbers are measured.** `tools/shoot-guide-body.py` renders the guide's body picture and projects each dive's starting point (the same points the zoom guide steers to) through the same camera, replacing positions placed by eye; the skeletal dive's number now sits on the left femur, where the dive goes. Crowded numbers in the head and chest are set clear of each other as in the app's key.
- **Labeled like a printed chart.** On wide screens every part in view is named in a column at the plate's edge, with a hairline from the name to a dot on the part, the way a wall chart is labeled; the numbered marks stay on phones. Labels are stacked a row apart and centered on their parts, point at one to light its part (and its key entry), and click it to open its card.
- **A chart heading and printed paper.** Each plate gets a heading: a red rubric with the plate number and tier, the subject in huge condensed capitals, and the dive, with the scale bar under it. The light sheet is now warm paper with a fine grain, and the plate sits in a double-ruled frame.
- **Fall through the body.** The guide's landing page has a new scroll story: a stage pins to the screen and scrolling drives the skeletal dive, each plate growing past the viewer and fading as the next, smaller one rises out of it, with its title rising into place, the view height counting down on a log scale and a needle falling down a ruler from 10 m to 0.1 nm. The plates are cut-out renders from the app (`tools/shoot-guide-fall.py`); without the script or with reduced motion they are a plain row of specimens.
- **The plate sets itself.** After every flight the heading rises out of its baseline and each callout draws out from its part to its label, one after another, with the label reading in where its line arrives; the neatline rules itself on the first visit and follows the card as it opens. The guide's heading and body settle in the same way. All of it follows the app's reduced-motion setting as well as the device's.
- **Light that follows the pointer.** The key and rim lights now ride with the camera, so a part is lit the same way from every side, and the key light leans toward the mouse pointer, easing after it, so highlights slide across the model (`src/engine/studioLight.js`). The rim light now aims at the subject instead of the scene's origin.
- `tools/record-motion.py` records the README's two new animations (the guide's fall, and a plate setting itself, stepped frame by frame through the page's animations); the accessibility audit covers the fall on desktop and phone (52 states, no violations).
- The dive menu and first-screen colors are set through the style object, since the Content Security Policy was blocking them as style attributes.
- **Zoom in anywhere.** Scroll or pinch zooms toward whatever is under the pointer. Zoom far enough into the whole body and a guide names the nearest part that has a dive ("Keep zooming in to reach: the heart"), draws the view toward it and then carries you in; a "Go" button does it in one tap. Zooming out far enough goes back a step.
- Every dive now starts from the measured position of its organ, and the model's height (1.64 m) is the measured one.
- 1 new reference (Mitsuhashi and others 2009, the BodyParts3D paper).
- 518 tests (from 421).

## 0.19.0

- **Smell dive, from a sniff to vanillin.** A fifteenth dive: the whole body, now with an olfactory patch and olfactory bulbs → the nasal cavity cut down the middle, with the conchae, the olfactory patch in its roof, the cribriform plate and the olfactory bulb under the frontal lobe, and a breath control that compares quiet breathing with a sniff → the olfactory epithelium, its neurons reaching cilia into the mucus, following odor molecules from the air to an action potential headed for the bulb → the knob and cilia of one olfactory neuron, following one odor molecule from its carrier protein to a seven-helix receptor, the G protein relay, open channels and a signal → vanillin.
- **A new shared molecule**, vanillin, generated with RDKit; the molecule view can highlight its aldehyde, methoxy and hydroxyl groups.
- 7 new cards (nasal cavity, olfactory epithelium, cribriform plate, olfactory bulb, olfactory neuron, odor receptor, vanillin), 2 references (OpenStax A&P 14.1 on smell, OpenStax Biology 36.3) and four quiz questions.
- 421 tests (from 409).

## 0.18.0

- **Liver dive, from an old red blood cell to bilirubin.** A fourteenth dive: the liver from the front, its right lobe cut open to show lobules, with the gallbladder, bile ducts and the vessels at its gate, stepping through blood in, blood out and bile out → a hepatic lobule, its plates of liver cells radiating from the central vein, blood flowing in from the portal triads and bile flowing out → two liver cells beside a sinusoid, following bilirubin from a Kupffer cell breaking down a worn-out red cell, on albumin through the blood, into the liver cell and out into bile → bilirubin itself, folded by its own hydrogen bonds.
- **A new shared molecule**, bilirubin IXα, generated with RDKit with both double bonds checked as Z.
- 11 new cards (gallbladder and bile ducts, liver blood supply, lobule, central vein, portal triad, hepatocyte, sinusoid, Kupffer cell, bile canaliculus, glycogen, bilirubin), 1 reference (OpenStax 18.3) and four quiz questions. The liver and gallbladder on the body now open their own cards.
- 409 tests (from 397).

## 0.17.0

- **Pancreas dive, from a meal to the insulin signal.** A thirteenth dive: the whole body with the digestive and endocrine systems → the pancreas, see-through, with its ducts, the duodenum and spleen, and islets drawn larger, and a meal control that sends pancreatic juice to the duodenum → an islet of Langerhans cut in half, its cells in OpenStax's proportions, with a blood glucose control (glucagon from alpha cells when low, insulin from beta cells when high) → a beta cell stepping through glucose-stimulated insulin secretion: GLUT2, ATP, ATP-sensitive potassium channels closing, calcium in, insulin out → ATP, the shared molecule.
- 11 new cards (duodenum, spleen, ducts, acinar, islet, alpha, beta, delta and PP cells, insulin, potassium and calcium channels), 3 references (OpenStax 17.9 and 23.6, Demirbilek and others 2019) and four quiz questions. The pancreas card now opens the new dive.
- 397 tests (from 389).

## 0.16.0

- **Ear dive, from a sound wave to glutamate.** A twelfth dive: the whole body, now with inner ears and their nerves → the ear cut open from the front, with the ossicles, the semicircular canals and a cochlea of two and a half turns, and a pitch control from 20 Hz to 20 kHz that lights where each note is sensed (high at the base, low at the apex) → one turn of the cochlea cut across, its three fluid channels and the organ of Corti with one row of inner and three of outer hair cells, stepping from pressure wave to nerve signal → an inner hair cell, its stereocilia tied by tip links, stepping from a bent bundle to open channels, glutamate release and a nerve impulse → glutamate, the shared molecule the nervous dive also reaches.
- 16 new cards, 3 references (OpenStax A&P 14.1 on hearing, OpenStax Biology 36.4, Britannica on the cochlea) and four quiz questions.
- 389 tests (from 379).

## 0.15.0

- **Eye dive, down to the molecule a photon flips.** An eleventh dive: the whole body, now with eyes and optic nerves → the eye cut in half and seen from above (EyeWiki sizes: 24 mm long, 12 mm cornea, 3 mm front chamber), with light rays focused on the fovea and a light control that opens and closes the pupil → a slice of retina, from the ganglion cells light must pass first to the rods, cones and pigment epithelium at the back, following one signal from a rod to the optic nerve → inside a rod's outer segment, where rhodopsin, transducin and phosphodiesterase turn one photon into closed sodium channels → retinal.
- **Two new shared molecules**, 11-cis and all-trans retinal, generated with RDKit with their double-bond geometry checked; the molecule view switches between them.
- 20 new cards, 3 references (OpenStax A&P 14.1, OpenStax Biology 36.5, EyeWiki "Eye in Numbers") and four quiz questions.
- 379 tests (from 362), including one that keeps every scene's root at the origin.

## 0.14.0

- **Skin dive, down to vitamin D.** A tenth dive: a block of forearm skin cut on two faces, with its epidermis, dermis and fatty hypodermis, hair follicles with sebaceous glands and arrector pili, coiled sweat glands, two networks of blood vessels and touch receptors, and a temperature control (cold: vessels narrow and hairs stand up; hot: vessels widen and sweat beads on the surface) → the epidermis layer by layer, following one keratinocyte from the basal layer to being shed → a basal cell in sunlight, where melanin shields the nucleus and ultraviolet light turns a cholesterol derivative in the membrane into vitamin D3 → vitamin D3 itself.
- **A new shared molecule**, vitamin D3 (cholecalciferol), generated with RDKit with its five stereocentres and 5Z,7E double bonds checked.
- The skin on the whole body now opens its own card.
- 20 new cards, 4 references (OpenStax chapter 5 and sections 5.1 to 5.3) and four quiz questions.
- 362 tests (from 349).

## 0.13.0

- **Endocrine dive, down to the hormone.** A ninth dive: the whole body with a new Endocrine button (pituitary, thyroid, parathyroids, adrenal glands, which moved here from Urinary) → the thyroid gland on the windpipe, its isthmus across tracheal rings 2 and 3, one lobe cut open to show its follicles, with the larynx, parathyroids and the arteries and veins of the neck → thyroid follicles wrapped in capillaries, the front one cut across like a slide, with a TSH control that makes the cells grow tall and take colloid back in → a follicle cell with a five-stage control: iodide pumped in, thyroglobulin made, iodine attached by peroxidase, colloid taken back, and T4 and T3 released into the blood → thyroxine.
- **Two new shared molecules**, T4 (thyroxine) and T3, generated with RDKit and checked for formula, charge and the natural L form. A control switches between them: T3 is T4 with one outer-ring iodine removed. Iodine joins the element table.
- 14 new cards, 4 references (OpenStax 17, 17.4 and 17.5, StatPearls on the thyroid) and four quiz questions.
- The kidney filter's water molecules now open the existing water card, and the duplicate card is gone.
- 349 tests (from 334).

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
