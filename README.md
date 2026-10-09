<div align="center">

# Anatomy Odyssey

**Zoom from your whole body down to a single molecule, one guided dive at a time.**

[![CI](https://github.com/Normansrule/anatomy-odyssey/actions/workflows/ci.yml/badge.svg)](https://github.com/Normansrule/anatomy-odyssey/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/code-MIT-6d5bd0)](LICENSE)
![Version](https://img.shields.io/badge/version-0.19.0-f08baf)
![Tests](https://img.shields.io/badge/tests-421%20passing-4fb38a)

[**Open the web app**](https://normansrule.github.io/anatomy-odyssey/) ·
[Download the desktop app](https://github.com/Normansrule/anatomy-odyssey/releases/latest) ·
[What's in it](#what-you-can-explore) ·
[Run it yourself](#run-it-yourself) ·
[How it works](#how-it-works)

<img src="docs/media/hero-dive.gif" alt="The skeletal dive: whole body → skeleton → femur → bone tissue → osteocyte → nucleus → DNA, with the depth gauge sweeping down" width="860" />

</div>

> [!NOTE]
> A teaching model, not medical advice. Every scene says what it is (a generalized model, drawn to scale unless its card says otherwise) and cites its sources.

## In one minute

- **Pick a dive** (skeletal, circulatory, muscular, immune, nervous, respiratory, digestive, urinary, endocrine, skin, eye, ear, pancreas, liver or smell) and fall through the body one scale at a time: organ → tissue → cell → molecule.
- **Point at anything** to light it up and see its name; **click** to open a card: what it is, why it matters, its real size, and a source you can check.
- **Watch the depth gauge**: it shows how big the view is, from about 2 m down to a fraction of a nanometer, so sizes stay honest.
- **Play with the science**: sliders run real, tested equations (oxygen binding, nerve speed, blood pH, enzyme speed-up and more).

No accounts, no tracking. Two ways to use it:

| Version | Where | Notes |
|---|---|---|
| **Web** | [normansrule.github.io/anatomy-odyssey](https://normansrule.github.io/anatomy-odyssey/) | Any current browser, phones included. Nothing to install. |
| **Desktop** | [Latest release](https://github.com/Normansrule/anatomy-odyssey/releases/latest) | Windows `.exe`/`.msi`, macOS `.dmg`, Linux `.AppImage`/`.deb`. Not code-signed yet, so the first launch shows a warning. |

## What you can explore

### Fifteen dives

| Dive | The path down | Ends at |
|---|---|---|
| 🦴 **Skeletal** | body → skeleton → femur → bone tissue → bone cell → nucleus | DNA |
| ❤️ **Circulatory** | body → heart → blood → red blood cell → hemoglobin | the iron atom in heme |
| 💪 **Muscular** | body → biceps → fascicle → muscle fiber → sarcomere | actin and myosin |
| 🛡️ **Immune** | body → lymph node → follicle → plasma cell → antibody | amino acids |
| 🧠 **Nervous** | body → brain → cortex → neuron → synapse | glutamate |
| 🫁 **Respiratory** | body → lungs → alveoli → air–blood barrier → hemoglobin | O₂ and CO₂ |
| 🍽️ **Digestive** | body → small intestine → villi → absorbing cell | glucose |
| 💧 **Urinary** | body → kidney → nephron → the filtration barrier | urea |
| 🦋 **Endocrine** | body → thyroid gland → follicles → hormone-making cell | thyroxine (T4) and T3 |
| ☀️ **Skin** | body → a block of skin → the epidermis → a skin cell in sunlight | vitamin D3 |
| 👁️ **Eye** | body → eye → retina → light becoming a signal in a rod | retinal (11-cis and all-trans) |
| 👂 **Ear** | body → ear → a turn of the cochlea → a hair cell | glutamate |
| 🍬 **Pancreas** | body → pancreas → an islet of Langerhans → a beta cell | ATP |
| 🟤 **Liver** | body → liver → a lobule → liver cells clearing an old red cell | bilirubin |
| 👃 **Smell** | body → nasal cavity → olfactory epithelium → a neuron's cilia | vanillin |

### Six modules

| Module | What happens |
|---|---|
| **Inflammatory response** | A splinter wound from the first alarm to healing, the mast cell that sounds it, and histamine |
| **From gene to protein** | The β-globin gene is transcribed, exported and translated into protein |
| **Chemistry of life** | Your body sorted by element, an enzyme ten million times faster than chemistry alone, and the blood's pH buffer |
| **Immune response and memory** | Immune cells side by side at true size, a first and a second infection, then the antibody and its amino acids |
| **T cells** | Antigen presentation, a killer T cell at work, a receptor reading one peptide, and its amino acids |
| **Reflex arc** | The knee jerk in about 18 ms, the wiring inside a slice of the spinal cord, the nerve–muscle junction, and acetylcholine |

Side trips branch into a **shared library** of building blocks (nucleus, nucleosome, DNA, RNA, nucleotides, amino acids, ATP, membranes and more). Each is built once and reused by every dive that reaches it, and each card links up to what it is part of and down to what it is made of.

<details>
<summary><b>Screenshots</b> (click to open)</summary>

<table>
<tr>
<td><img src="docs/screenshots/femur.webp" alt="A femur cut open: compact bone, yellow marrow and spongy bone at the ends, in natural colors" /></td>
<td><img src="docs/screenshots/heart.webp" alt="The heart opened from the front, showing its four chambers, in natural colors" /></td>
<td><img src="docs/screenshots/brain.webp" alt="The brain with one hemisphere cut open to show gray and white matter, in natural colors" /></td>
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
<td><img src="docs/screenshots/liver.webp" alt="The liver from the front, its right lobe cut to show hexagonal lobules, with the gallbladder, bile ducts, portal vein, hepatic artery and inferior vena cava" /></td>
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

## Highlights

**See it**
- **Realistic tissue surfaces.** Organs and tissues have physically based materials: color, bumps and roughness generated in code for bone, muscle, heart, brain, lung, cartilage, marrow, vessels and more, with a wet sheen where tissue is wet and soft studio reflections. Switch between **natural colors** and **stain colors** in About.
- **Real molecule shapes.** The 20 amino acids, nucleotides, ATP and lipids come from their chemical structures (RDKit), checked for formula, charge and handedness.
- **A map by scale** (press M) of every dive and building block on one log scale.

<p align="center"><img src="docs/media/looks.webp" alt="The femur and the heart, each shown in natural colors and then in stain colors" width="820" /><br /><sub>Femur and heart: natural colors, then stain colors.</sub></p>

**Learn from it**
- Cards with an *Expert detail* switch, cited sources and "made of / part of" links.
- A guided tour with captions (optionally read aloud), four-question quizzes per dive, and a glossary.
- Every equation has a worked example and a passing test: see [Equations](docs/EQUATIONS.md).

**Trust it**
- Honesty labels on every scene; simplifications listed in [State of the model](docs/STATE_OF_THE_MODEL.md).
- Private by design: no accounts, analytics or network calls; a strict Content Security Policy (CSP).
- Accessible: full keyboard control, screen-reader announcements, reduced-motion support, and an automated WCAG 2.2 audit with zero violations.
- Adapts to your device: a first-launch check tunes picture quality, and slow devices get lighter materials.

## Run it yourself

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
git clone https://github.com/Normansrule/anatomy-odyssey.git
cd anatomy-odyssey
npm ci
npm run dev          # then open http://localhost:5173
```

<details>
<summary><b>More commands</b>: tests, builds, desktop app, screenshots</summary>

```bash
npm test               # 421 unit tests
npm run build          # production build in dist/ (what GitHub Pages serves)
npm run build:preview  # one self-contained HTML file in dist-preview/
npm run molecules      # regenerate molecule geometry (needs: pip install rdkit)
npm run a11y           # accessibility audit against a running preview (needs Playwright)
```

**Desktop app** (needs [Rust](https://rustup.rs); on Linux also `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`):

```bash
npm run desktop:dev      # native window with live reload
npm run desktop:build    # installers in src-tauri/target/release/bundle/
```

Pushing a version tag (`git tag v0.19.0 && git push origin v0.19.0`) builds Windows, macOS and Linux installers and publishes them as a GitHub release, which the "Download the desktop app" links point to. They are not code-signed yet.

**Headless checks** (software rendering, no GPU needed):

```bash
npm run build && npx vite preview --port 4173 &
pip install playwright pillow && python3 -m playwright install chromium
python3 tools/screenshots.py --mobile    # every step; fails on console errors or a blank view
python3 tools/a11y-audit.py              # axe-core, WCAG 2.2 A and AA
```

**URL options**: `?dive=nervous&step=synapse` opens a step, `&trip=1` opens a side trip, `?renderer=webgl` forces the WebGL 2 fallback, `?env=0` turns off studio reflections.

**Publishing**: [docs/PUBLISHING.md](docs/PUBLISHING.md) has the exact terminal commands to apply a change, push it, turn on GitHub Pages and publish the desktop apps.

</details>

## How it works

The body-to-molecule gap is about a billion-fold, too big for one continuous model. So each dive is a **chain of scenes**, each built at its own scale (1 unit = 1 m for the body, 1 cm for organs, 1 µm for cells, 1 nm or 1 Å for molecules). The engine frames each scene by its real size and flies between them while the gauge sweeps on a log scale.

<p align="center"><img src="docs/media/powers-of-ten.svg" alt="Powers of ten across the skeletal dive" width="720" /></p>

<details>
<summary><b>Project layout and adding a dive</b></summary>

```
src/
  engine/      renderer (WebGPU, WebGL 2 fallback), tier engine, lighting, device check
    textures/  tissue surface framework: tileable noise, tissue recipes, materials
  scenes/      one builder per step (body, femur, heart, neuron, lungs, …) + registry
  library/     shared building blocks (nucleus, DNA, hemoglobin, ATP, …) and molecule data
  data/        dives, library graph, cards, quizzes, references (all content lives here)
  science/     pure, tested math: scale, equations, chemistry, immune model, T cells, reflexes
  ui/          gauge, cards, search, controls, tour, quiz, glossary, map, about
src-tauri/     desktop shell (Tauri 2)
tests/         Vitest suites
tools/         screenshots, accessibility audit, GIF recorder, molecule generator
docs/          state of the model, equations, security model, publishing
```

**Adding a dive:**
1. Write scene builders in `src/scenes/` (return `root`, `metersPerUnit`, `view`, `focus`, `dispose`; optionally `controls`, `update`, `branchFocus`).
2. Register them in `src/scenes/registry.js` and add the dive to `src/data/dives.js`.
3. Tag tissue materials for realistic surfaces: `M(color, { tissue: 'muscle' })` (kinds are in `src/engine/textures/tissues.js`).
4. Write cards with sources, narration for each step, and four quiz questions.
5. `npm test` checks that frames shrink and tiers rise, every clickable part has a card, and shared steps reuse the library.

</details>

## Documentation

| Document | What's inside |
|---|---|
| [State of the model](docs/STATE_OF_THE_MODEL.md) | Every step, where it honestly stops, and what is simplified |
| [Equations](docs/EQUATIONS.md) | 29 worked examples, each with symbols, units and its test |
| [Security model](docs/SECURITY_MODEL.md) | Trust boundaries, privacy, supply chain |
| [Publishing](docs/PUBLISHING.md) | Apply a change, push it, turn on the website, publish the desktop apps |
| [Changelog](CHANGELOG.md) | What changed in each version |
| [Asset credits](assets/CREDITS.md) | Sources and licenses |

## Roadmap

- [x] Fifteen dives, six modules and a complete shared library; every dive and every module ends at a molecule
- [x] Desktop app, device check, accessibility audit
- [x] Realistic tissue surfaces with natural and stain looks
- [x] The spinal cord, through the knee-jerk reflex
- [ ] Real anatomical meshes (Z-Anatomy, CC BY-SA) for the organ tiers
- [ ] Real atomic structures from the Protein Data Bank for the large molecules
- [ ] Code-signed desktop releases

## License

- **Code**: [MIT](LICENSE).
- **Anatomy assets** in `assets/anatomy/` (when added): CC BY-SA 4.0, as Z-Anatomy and BodyParts3D require. ShareAlike covers those files only.
- **Molecular assets**: each file's own license, listed in [assets/CREDITS.md](assets/CREDITS.md).
- **Fonts**: Atkinson Hyperlegible Next and Literata, SIL Open Font License 1.1.
- Tissue textures are generated in code and covered by the MIT license.
