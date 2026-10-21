<div align="center">

# Anatomy Odyssey

**A wall chart of the human body that you can fall into, from two meters down to a single molecule.**

[![CI](https://github.com/Normansrule/anatomy-odyssey/actions/workflows/ci.yml/badge.svg)](https://github.com/Normansrule/anatomy-odyssey/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/code-MIT-1b2120)](LICENSE)
![Version](https://img.shields.io/badge/version-0.20.0-a3242f)
![Tests](https://img.shields.io/badge/tests-504%20passing-276a40)

[**Open the web app**](https://normansrule.github.io/anatomy-odyssey/) ·
[Download the desktop app](https://github.com/Normansrule/anatomy-odyssey/releases/latest) ·
[Read the guide](https://normansrule.github.io/anatomy-odyssey/guide/) ·
[Features](#key-features) ·
[Setup](#setup-and-usage) ·
[Design](#design)

<img src="docs/media/scale-slider.gif" alt="One drag down the scale slider on the left: the view flies from the whole body to the skeleton, the femur, bone tissue, a bone cell, its nucleus and DNA, while the plates along the bottom and the key on the right follow" width="860" />

</div>

## What it is

Anatomy Odyssey is a three-dimensional (3D) model of the human body, drawn like the anatomy charts that hung in every biology classroom, except this one zooms. Grab the scale on the left and drag: the view falls from the whole body (measured from a real person) into an organ, its tissue, one of its cells and finally the molecule that does the work, every plate at its real size. It's made for curious people, students and teachers who want to *see* how the body fits together across scales, not memorize a diagram. It runs in any current browser (phones included) or as a desktop app, with no accounts and no tracking.

> [!NOTE]
> It's a teaching model, not medical advice. Every scene says what it is (a generalized model, drawn to scale unless its card says otherwise) and cites its sources.

## Key features

- **Fifteen dives and six modules.** Skeletal, circulatory, muscular, immune, nervous, respiratory, digestive, urinary, endocrine, skin, eye, ear, pancreas, liver and smell, plus modules on inflammation, gene to protein, body chemistry, immune memory, T cells and the knee-jerk reflex. Every one ends at a molecule.
- **A body measured from a real one.** 411 meshes from BodyParts3D, an open anatomy atlas: every bone, muscle and organ in its true place. The heart beats, blood flows through the vessels, and the organ close-ups are the real organs cut open.
- **One slider from 10 m to 0.1 nm.** The scale on the left is a slider. Drag it (or use the arrow keys) and the view zooms continuously, flying on to the next plate whenever you get close to its size, so a single drag can take you from your whole body to DNA.
- **A living key.** Every part in view gets a number on the model and the same number in the card's key. Point at either one and a red leader line draws itself between them, following the part as the model turns.
- **Zoom in anywhere.** Scroll or pinch toward any part of the body; a guide names the nearest part that has a dive and takes you there.
- **Point, click, learn.** Hover to name a part, click to open its card: what it does, why it matters, its real size, an *Expert detail* switch and a source you can check.
- **Light sheet or slate.** It follows your device's light or dark setting, or pick one in About.
- **Science you can play with.** Sliders run real, tested equations (oxygen binding, nerve speed, blood acidity, how fast an enzyme works, how much blood the heart pumps).
- **A map by scale, a tour, quizzes and a glossary.** The map (press M) lays out every dive on one size axis; the tour narrates a dive with captions you can have read aloud.
- **A guide website.** A landing page drawn as the same chart, plus the docs as a printed booklet, at [/guide/](https://normansrule.github.io/anatomy-odyssey/guide/).
- **Private and accessible.** No network calls after loading, full keyboard control, screen-reader announcements, a reduced-motion mode, and an automated Web Content Accessibility Guidelines (WCAG) 2.2 audit with zero violations in 47 states, light and dark.

## See it

<table>
<tr>
<td align="center" colspan="2"><img src="docs/media/living-key.gif" alt="The heart plate: pointing at each entry in the key draws a red leader line from its number to the matching number on the heart" width="860" /><br /><sub><b>The living key.</b> Point at an entry and its leader line draws to the part.</sub></td>
</tr>
<tr>
<td align="center" width="50%"><img src="docs/media/heartbeat.gif" alt="The real heart cut open to its four chambers, beating at 72 a minute, with oxygen-poor blood (blue) and oxygen-rich blood (red) moving through the chambers and valves" width="360" /><br /><sub><b>Heartbeat.</b> The measured heart opened to its four chambers; set the rate from asleep to running.</sub></td>
<td align="center" width="50%"><img src="docs/media/guide.webp" alt="The guide website's landing page: the body as a chart plate with fifteen numbered dives and a key, a leader line drawn to the heart" width="400" /><br /><sub><b>The guide.</b> The same chart as a website, with the docs as its booklet.</sub></td>
</tr>
<tr>
<td align="center"><img src="docs/media/digestive-tract.gif" alt="The real digestive tract from the esophagus to the rectum, a glowing mouthful moving through it while the organ it is in lights up" width="360" /><br /><sub><b>Digestion.</b> One meal through the real gut, with how long each part takes.</sub></td>
<td align="center"><img src="docs/media/urinary-tract.gif" alt="Both real kidneys, the ureters and the bladder: blood flows into the kidneys, urine runs down the ureters and the bladder fills and empties" width="360" /><br /><sub><b>Urine.</b> From the blood, down the ureters, into the bladder and out.</sub></td>
</tr>
</table>

<table>
<tr>
<td><img src="docs/screenshots/body.webp" alt="The whole measured body: the skeleton with the organs inside and see-through skin" /><br /><sub>Whole body</sub></td>
<td><img src="docs/screenshots/heart.webp" alt="The real heart cut open to its four chambers, with its card and the heart rate control" /><br /><sub>Heart</sub></td>
<td><img src="docs/screenshots/brain.webp" alt="The real brain, every fold where it was in that person" /><br /><sub>Brain</sub></td>
<td><img src="docs/screenshots/lungs.webp" alt="The real lungs, five lobes around the bronchial tree" /><br /><sub>Lungs</sub></td>
</tr>
<tr>
<td><img src="docs/screenshots/liver.webp" alt="The real liver, see-through, with its veins and bile ducts and a lobule magnifier" /><br /><sub>Liver</sub></td>
<td><img src="docs/screenshots/kidney.webp" alt="The real left kidney cut in half, the drawn inside fitted to its outline" /><br /><sub>Kidney</sub></td>
<td><img src="docs/screenshots/femur.webp" alt="The real femur cut lengthwise: compact bone, marrow and spongy bone" /><br /><sub>Femur</sub></td>
<td><img src="docs/screenshots/atlas.webp" alt="The map: every dive laid out by scale, from a meter down to a nanometer" /><br /><sub>Map by scale</sub></td>
</tr>
</table>

### Progress

<p align="center"><img src="docs/media/progress.svg" alt="Progress: the real, measured organ is up close in 8 of 15 dives (skeletal, circulatory, respiratory, nervous, digestive, urinary, pancreas, liver); immune, muscular, skin and smell have the measured body with a drawn close-up; endocrine, eye and ear wait on better atlas meshes" width="820" /></p>

| Dive | Organ step | What moves | State |
|---|---|---|---|
| Skeletal | measured femur, cut open | | Done |
| Circulatory | measured heart, four chambers | heartbeat, blood flow, heart rate | Done |
| Respiratory | measured lungs and bronchial tree | breathing | Done |
| Nervous | measured brain, lobes and inside | | Done |
| Digestive | measured tract, esophagus to rectum | a meal moving through | Done |
| Urinary | measured kidneys, ureters and bladder; kidney cut open | urine flow, bladder filling | Done |
| Pancreas | measured pancreas with duct and islets | | Done |
| Liver | measured liver with veins and bile ducts | blood and bile flow | Done |
| Immune | lymph node, drawn | an infection from a cut to the armpit nodes | Body done, close-up drawn |
| Muscular | biceps, drawn and cut across | | Next candidate |
| Skin | skin block, drawn | heat and cold | Drawn close-up |
| Smell | nasal cavity, drawn | a sniff | Drawn close-up |
| Endocrine | thyroid, drawn | | The atlas has no thyroid |
| Eye | eye, drawn | light focusing | The atlas eye is too coarse |
| Ear | ear, drawn | sound | The atlas has the outer ear only |

<details>
<summary><b>More screenshots</b>: every organ, cell and molecule step</summary>

<table>
<tr>
<td><img src="docs/screenshots/femur.webp" alt="A femur cut open: compact bone, yellow marrow and spongy bone at the ends, in natural colors" /></td>
<td><img src="docs/screenshots/heart.webp" alt="The heart opened from the front, showing its four chambers, in natural colors" /></td>
<td><img src="docs/screenshots/brain.webp" alt="The real brain from the side, its folds measured, with controls to color the lobes or see inside" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/cortex.webp" alt="A block of cerebral cortex with six layers and pyramidal neurons" /></td>
<td><img src="docs/screenshots/neuron.webp" alt="A cortical pyramidal neuron with dendrites, spines and a myelinated axon" /></td>
<td><img src="docs/screenshots/synapse.webp" alt="A synapse with vesicles, the 20 nm cleft and receptors" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/carbonic-anhydrase.webp" alt="Carbonic anhydrase as beads around a cleft, with its zinc ion" /></td>
<td><img src="docs/screenshots/immune-cells.webp" alt="Immune cells side by side at true size, with a virus for scale" /></td>
<td><img src="docs/screenshots/tcr-mhc.webp" alt="A T-cell receptor docked on a peptide held by MHC class I" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/knee-jerk.webp" alt="A seated figure mid knee jerk: the quadriceps contracts and the shin swings forward, with the nerve paths to the spinal cord" /></td>
<td><img src="docs/screenshots/spinal-cord.webp" alt="A slice of the spinal cord: the butterfly of gray matter, roots, a ganglion and the three neurons of the reflex" /></td>
<td><img src="docs/screenshots/skeleton.webp" alt="The whole skeleton, head to feet: curved spine with discs, ribs with cartilage, pelvis, and every hand and foot bone, with the femur glowing" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/small-intestine.webp" alt="Seven centimeters of small intestine cut open: circular folds covered in villi, the wall layers and the mesentery" /></td>
<td><img src="docs/screenshots/villi.webp" alt="Villi on the intestinal lining, one cut open to show its lacteal and capillaries" /></td>
<td><img src="docs/screenshots/enterocyte.webp" alt="Absorbing cells with their brush border; the middle one see-through, with glucose on its way from the gut to the blood" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/kidney.webp" alt="A kidney cut in half: pale cortex, striped pyramids, calyces gathering into the renal pelvis and ureter, arteries arching between them, the adrenal gland on top" /></td>
<td><img src="docs/screenshots/nephron.webp" alt="One nephron: the glomerulus in its capsule, the winding proximal tubule, the loop of Henle dipping into the medulla, and the collecting duct, with filtrate dots thinning out as it is reclaimed" /></td>
<td><img src="docs/screenshots/filtration-barrier.webp" alt="The kidney's filter in section: a capillary lining full of pores, the basement membrane, and interlocking podocyte feet, with small molecules passing and albumin held back" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/thyroid.webp" alt="The thyroid gland on the windpipe below the larynx, one lobe cut open to show its follicles, with the carotid arteries, jugular veins and thyroid arteries" /></td>
<td><img src="docs/screenshots/thyroid-follicles.webp" alt="Thyroid follicles: hollow balls of cells wrapped in capillaries, the front one cut across to show a ring of cells around pink colloid" /></td>
<td><img src="docs/screenshots/follicle-cell.webp" alt="Follicle cells between a capillary and the colloid, one see-through with its nucleus, endoplasmic reticulum and Golgi, making thyroglobulin" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/skin-block.webp" alt="A block of skin in the heat: epidermis, dermis with hair follicles, sebaceous and sweat glands and widened vessels, fat below, sweat beading on the surface" /></td>
<td><img src="docs/screenshots/epidermis.webp" alt="The epidermis layer by layer, from the wavy basal layer through the spinosum and granulosum to the flat dead cells of the stratum corneum" /></td>
<td><img src="docs/screenshots/sun-and-skin.webp" alt="Ultraviolet rays reaching a basal skin cell: melanin caps its nucleus while vitamin D3 forms in its membrane" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/eye.webp" alt="The eye cut in half and seen from above: cornea, iris, lens, retina and optic nerve, with light rays focused on the fovea" /></td>
<td><img src="docs/screenshots/retina.webp" alt="A slice of retina: ganglion cells on top, bipolar cells, photoreceptor nuclei, rods and cones, and the dark pigment epithelium, with one signal path lit up" /></td>
<td><img src="docs/screenshots/phototransduction.webp" alt="Inside a rod: stacked disc membranes with rhodopsin, transducin and phosphodiesterase, cGMP in the cytoplasm and sodium channels in the outer membrane" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/ear.webp" alt="The ear cut open from the front: auricle, ear canal, eardrum, the three ossicles, the cochlea with the place a 20 kHz tone is sensed glowing at its base, the semicircular canals and the Eustachian tube" /></td>
<td><img src="docs/screenshots/cochlear-duct.webp" alt="One turn of the cochlea cut across: scala vestibuli, cochlear duct and scala tympani, with the organ of Corti on the basilar membrane under the tectorial membrane" /></td>
<td><img src="docs/screenshots/hair-cell.webp" alt="An inner hair cell between supporting cells, its stereocilia in three graded rows tied by tip links, potassium entering, and a nerve ending at its base" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/pancreas.webp" alt="The pancreas, see-through, its head in the curve of the duodenum and its tail at the spleen, with the pancreatic duct, the common bile duct, and islets drawn larger" /></td>
<td><img src="docs/screenshots/islet.webp" alt="An islet of Langerhans cut in half, mostly green beta cells with orange alpha cells, threaded by capillaries and ringed by acini" /></td>
<td><img src="docs/screenshots/beta-cell.webp" alt="A beta cell beside a capillary, cut open: nucleus, mitochondria and insulin granules, with glucose transporters, potassium and calcium channels in its membrane" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/liver.webp" alt="The real liver from the front, see-through, with a magnifier on its hexagonal lobules, the gallbladder, bile ducts and inferior vena cava" /></td>
<td><img src="docs/screenshots/lobule.webp" alt="A hepatic lobule: plates of liver cells radiating from the central vein, with portal triads at the corners and blood flowing inward" /></td>
<td><img src="docs/screenshots/hepatocyte.webp" alt="Two liver cells beside a sinusoid with a Kupffer cell, bilirubin riding on albumin, and a bile canaliculus between the cells" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/nasal-cavity.webp" alt="The nasal cavity cut down the middle: three conchae, the yellow olfactory patch in the roof under the cribriform plate, the olfactory bulb beneath the frontal lobe, and a sniff of air swirling upward" /></td>
<td><img src="docs/screenshots/olfactory-epithelium.webp" alt="Olfactory epithelium: tall supporting cells, yellow olfactory neurons reaching cilia into the mucus, basal cells, a gland, and axons gathering toward the cribriform plate" /></td>
<td><img src="docs/screenshots/olfactory-cilium.webp" alt="The knob of an olfactory neuron, its cilia spreading through mucus, with seven-helix odor receptors, a carrier protein bringing an odor molecule, and ions flowing in" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/hemoglobin.webp" alt="Hemoglobin's four chains with the oxygen pressure slider" /></td>
<td><img src="docs/screenshots/nucleosome.webp" alt="A nucleosome: DNA wrapped around eight histones" /></td>
<td><img src="docs/screenshots/atlas.webp" alt="The map: every dive laid out by scale" /></td>
</tr>
</table>

| Nervous dive | Respiratory dive |
|---|---|
| ![Nervous dive animation](docs/media/nervous-dive.gif) | ![Respiratory dive animation](docs/media/respiratory-dive.gif) |

</details>

## Setup and usage

### Just use it

| Version | Where | Notes |
|---|---|---|
| **Web** | [normansrule.github.io/anatomy-odyssey](https://normansrule.github.io/anatomy-odyssey/) | Any current browser, phones included. Nothing to install. |
| **Desktop** | [Latest release](https://github.com/Normansrule/anatomy-odyssey/releases/latest) | Windows `.exe`/`.msi`, macOS `.dmg`, Linux `.AppImage`/`.deb`. Not code-signed yet, so the first launch shows a warning. |

Pick a dive from the menu at the top (or a part of you on the first screen). Then either drag the scale on the left, or use **Dive deeper** and **Zoom out** on the row of plates at the bottom. Scroll or pinch to zoom, drag the view to turn it, and point at a number in the key to see where that part is. Press **M** for the map, and try **Play tour** for a narrated run-through.

| Key | What it does |
|---|---|
| Arrow keys or Page Up and Page Down on the scale | Zoom by a quarter (or a whole) power of ten |
| Home and End on the scale | Jump to 10 m or to 0.1 nm |
| Left and right arrows elsewhere | The previous or next plate |
| `/` | Search |
| `M`, `G`, `T` | The map, the glossary, the tour |

### Run it yourself

You'll need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/Normansrule/anatomy-odyssey.git
cd anatomy-odyssey
npm ci
npm run dev          # then open http://localhost:5173
```

<details>
<summary><b>More commands</b>: tests, builds, desktop app, screenshots</summary>

```bash
npm test               # 504 unit tests, plus the asset manifest check
npm run build          # production build in dist/ (what GitHub Pages serves), with the guide in dist/guide/
npm run build:preview  # one self-contained HTML (HyperText Markup Language) file in dist-preview/
npm run molecules      # regenerate molecule geometry (needs: pip install rdkit)
python3 tools/record-hero.py --dive skeletal --slide 1e-8 --width 860 --out docs/media/scale-slider.gif
                       # record a README animation (see the file for the other modes; needs Playwright)
python3 tools/build_body_meshes.py --fetch && python3 tools/build_body_meshes.py && npm run manifest
                       # rebuild the body anatomy from BodyParts3D (needs: pip install numpy fast-simplification)
```

**Desktop app** (needs [Rust](https://rustup.rs); on Linux also `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`):

```bash
npm run desktop:dev      # native window with live reload
npm run desktop:build    # installers in src-tauri/target/release/bundle/
```

Pushing a version tag (`git tag v0.20.0 && git push origin v0.20.0`) builds Windows, macOS and Linux installers and publishes them as a GitHub release. They aren't code-signed yet.

**Headless checks** (software rendering, no graphics card needed):

```bash
npm run build && npx vite preview --port 4173 &
pip install playwright pillow && python3 -m playwright install chromium
python3 tools/screenshots.py --mobile    # every step; fails on console errors or a blank view
python3 tools/a11y-audit.py              # axe-core accessibility audit, WCAG 2.2 A and AA, app and guide, light and dark
python3 tools/shoot-guide-body.py        # redraw the guide's body picture and measure where each dive starts on it
```

**Web address options**: `?dive=nervous&step=synapse` opens a step, `&trip=1` opens a side trip, `?renderer=webgl` forces the WebGL 2 fallback, `?env=0` turns off studio reflections.

**Publishing**: [docs/PUBLISHING.md](docs/PUBLISHING.md) has the exact terminal commands to apply a change, push it, turn on GitHub Pages and publish the desktop apps.

</details>

## Project structure

```
src/
  main.js      app start-up: wires the engine, the scenes and the interface together
  engine/      renderer (WebGPU, with a WebGL 2 fallback), tier engine, lighting, device check
    textures/  tissue surfaces generated in code: tileable noise, tissue recipes, materials
  scenes/      one builder per step (body, femur, heart, neuron, lungs, …) plus the registry
  library/     shared building blocks (nucleus, DNA, hemoglobin, ATP, …) and molecule data
  data/        dives, library graph, cards, quizzes, references: all the content lives here
  science/     pure, tested math: scale, equations, chemistry, immune model, T cells, reflexes
  ui/          scale slider, living key, cards, search, controls, tour, quiz, glossary, map, about
  styles/      app.css, the whole visual system (tokens at the top)
guide/         the guide website's stylesheet, script and body picture
src-tauri/     desktop shell (Tauri 2)
assets/        the measured body and molecule files, with credits
tests/         Vitest suites
tools/         guide builder, its Markdown converter and body picture, screenshots, accessibility audit,
               animation recorder, mesh and molecule builders
docs/          state of the model, equations, security model, publishing, media
```

Each dive is a **chain of scenes**, each built at its own scale (1 unit = 1 m for the body, 1 cm for organs, 1 µm for cells, 1 nm or 1 Å for molecules), because the gap from body to molecule is about a billion-fold. The engine frames each scene by its real size and flies between them while the scale slider sweeps on a log scale.

<p align="center"><img src="docs/media/powers-of-ten.svg" alt="Powers of ten across the skeletal dive" width="720" /></p>

<details>
<summary><b>Adding a dive</b></summary>

1. Write scene builders in `src/scenes/` (return `root`, `metersPerUnit`, `view`, `focus`, `dispose`; optionally `controls`, `update`, `branchFocus`).
2. Register them in `src/scenes/registry.js` and add the dive to `src/data/dives.js`.
3. Tag tissue materials for realistic surfaces: `M(color, { tissue: 'muscle' })` (the kinds are in `src/engine/textures/tissues.js`).
4. Write cards with sources, narration for each step, and four quiz questions.
5. `npm test` checks that frames shrink and tiers rise, every clickable part has a card, and shared steps reuse the library.

</details>

## Design

**The idea: a classroom wall chart.** You know the ones: a pull-down anatomy chart with heavy rules, numbered leader lines running to a key, and the parts colored by a code every textbook shares. Anatomy Odyssey is that chart, with two things paper can't do: the specimen is a live 3D model, and the chart zooms.

- **The sheet is ruled into cells.** The scale column on the left, the plate in the middle, the key on the right, and the plates of the dive along the bottom, all divided by 2-pixel rules like a printed chart. No floating cards, no frosted glass, no drop shadows.
- **Every color means something anatomical.** Artery red, vein blue, nerve yellow, lymph green and bone ivory, the code anatomy charts have always used. Red also means "you are here": the scale's marker, the current plate, the one main action and the leader line you're tracing. Vein blue marks focus and links. Nothing gets a color just to decorate.
- **Light sheet or slate.** Light mode is the printed sheet (a cool grey-green paper); dark mode is the same chart on slate. Every text color is at least 4.5 to 1 against its background in both.
- **Two typefaces, each with one job.** Archivo, condensed and heavy, for plate titles and numbers, like the lettering on a chart; Atkinson Hyperlegible Next, designed for low-vision readers, for everything you read. Nothing is smaller than 12 pixels, and numbers are tabular so they don't jitter while the slider moves.
- **One spacing rhythm.** Every gap is a multiple of 4 pixels, and every target you can press is at least 24 pixels (44 for the main controls).

**The hero moment is the scale slider.** Drag it and the view follows your finger seamlessly: inside a plate the camera zooms on a spring (on a log scale, so every power of ten takes the same time), and when the size you're asking for is closer to the next plate's, the view flies on and keeps going. The flight speeds up out of one plate and slows into the next, so there's no stop in the middle where the model swaps.

**The second is the living key.** The numbers on the model are projected from the 3D parts every frame and kept clear of each other, and the leader line springs out from the key to the part and follows it as you turn the model.

**Motion has a job or it doesn't happen.** Buttons answer a press with a slight 0.97 scale in 140 milliseconds, easing out so they feel immediate. Hover effects only switch on for a real mouse, so taps never leave a stuck highlight. With reduced motion on, flights become a short crossfade, the slider and leader lines jump instead of springing, and nothing slides or scales, but color and fade feedback stay so you still see what happened.

**States are designed too.** Loading shows a ruled "Drawing the plate" title card while the 11 megabyte body loads; if the measured body can't load, a notice says the simplified figure is showing; a browser without 3D graphics gets a plain explanation instead of a blank page; and an empty search suggests what to try.

The whole visual system is the token block at the top of [`src/styles/app.css`](src/styles/app.css), and the guide website reads its tokens from the same file.

## Documentation

All of these are also on the [guide website](https://normansrule.github.io/anatomy-odyssey/guide/), set as the chart's booklet.

| Document | What's inside |
|---|---|
| [State of the model](docs/STATE_OF_THE_MODEL.md) | Every step, where it honestly stops, and what is simplified |
| [Equations](docs/EQUATIONS.md) | 29 worked examples, each with symbols, units and its test |
| [Security model](docs/SECURITY_MODEL.md) | Trust boundaries, privacy (a strict Content Security Policy, no analytics), supply chain |
| [Publishing](docs/PUBLISHING.md) | Apply a change, push it, turn on the website, publish the desktop apps |
| [Changelog](CHANGELOG.md) | What changed in each version |
| [Asset credits](assets/CREDITS.md) | Sources and licenses |

## Roadmap

- [x] Fifteen dives, six modules and a complete shared library; every dive and every module ends at a molecule
- [x] Desktop app, device check, accessibility audit
- [x] Realistic tissue surfaces with natural and stain looks
- [x] A body measured from a real one, and real organs for the heart, brain, lungs, liver, pancreas, kidney, femur and the digestive and urinary tracts
- [x] A wall chart redesign: the scale slider, the living key, light and dark sheets, and a guide website
- [ ] Measured thyroid, eye and ear
- [ ] Real atomic structures from the Protein Data Bank for the large molecules
- [ ] Code-signed desktop releases

## License

- **Code**: [MIT License](LICENSE).
- **Anatomy assets** in `assets/anatomy/`: derived from BodyParts3D, Creative Commons Attribution-ShareAlike 2.1 Japan (CC BY-SA 2.1 JP); see [assets/CREDITS.md](assets/CREDITS.md). ShareAlike covers those files only.
- **Molecular assets**: each file's own license, listed in [assets/CREDITS.md](assets/CREDITS.md).
- **Fonts**: Archivo and Atkinson Hyperlegible Next, SIL Open Font License 1.1, served from the app itself.
- Tissue textures are generated in code and covered by the MIT License.
