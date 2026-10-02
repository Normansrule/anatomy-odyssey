# Anatomy Odyssey

**A guided journey through the human body, from whole body to molecule.**

Anatomy Odyssey is an open-source web app for exploring the human body across scales. You start at a whole-body 3D model, then take a *guided dive*: a short, authored descent through the tiers that matter for one part of you, ending at the smallest building block that well-understood biology supports on that path. A depth gauge shows how big the view is at every moment, so size relationships stay honest across about nine orders of magnitude.

![The skeletal dive: whole body → skeleton → femur → bone tissue → osteocyte → nucleus → DNA, with the depth gauge sweeping down](docs/media/hero-dive.gif)

> Teaching model, not medical advice. Every scene is labeled for what it is: a generalized teaching model, drawn to scale except where a card says otherwise.

## Six dives and one module

| Dive | Path | Ends at (shared) | Interactive control |
|---|---|---|---|
| **Skeletal** | body → skeleton → femur → bone tissue → osteocyte → nucleus | DNA | — |
| **Circulatory** | body → heart → blood → red blood cell | hemoglobin → heme | Oxygen pressure slider (Hill curve) |
| **Muscular** | body → biceps → fascicle → muscle fiber → sarcomere | actin and myosin | Sarcomere length; cross-bridge cycle |
| **Immune** | body → lymph node → follicle → plasma cell | antibody | — |
| **Nervous** | body → brain → neuron → synapse | glutamate | Axon diameter (conduction speed); release stages |
| **Respiratory** | body → lungs → alveoli → air–blood barrier → hemoglobin | O₂ and CO₂ | Breathing; capillary transit time |
| **Inflammatory response** (module) | a splinter wound, from the first alarm to healing | — | Five-stage animation |

Side trips branch off the main path into shared scenes: from a muscle fiber, a plasma cell or a neuron into the shared **nucleus → DNA**, and from a red blood cell or a synapse into the shared **lipid bilayer**.

<table>
<tr>
<td><img src="docs/screenshots/neuron.webp" alt="A cortical pyramidal neuron with dendrites, spines, a myelinated axon and terminal boutons, with the axon diameter control" /></td>
<td><img src="docs/screenshots/synapse.webp" alt="A synapse cut open: vesicles in the presynaptic terminal, the 20 nm cleft, and receptors on a dendritic spine" /></td>
<td><img src="docs/screenshots/lungs.webp" alt="Translucent lungs with the trachea, bronchial tree and diaphragm, with the breathing control" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/gas-exchange.webp" alt="The air–blood barrier in section over a capillary, with a red blood cell loading oxygen" /></td>
<td><img src="docs/screenshots/lipid-bilayer.webp" alt="A lipid bilayer patch with phospholipids, cholesterol, water and an ion channel" /></td>
<td><img src="docs/screenshots/glutamate.webp" alt="Glutamate as a ball-and-stick model" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/heart.webp" alt="The heart opened from the front, showing four chambers" /></td>
<td><img src="docs/screenshots/sarcomere.webp" alt="A sarcomere with thick and thin filaments and the contraction control" /></td>
<td><img src="docs/screenshots/inflammation.webp" alt="The inflammatory response module: a splinter, a leaky venule and arriving neutrophils" /></td>
</tr>
<tr>
<td><img src="docs/screenshots/femur.webp" alt="Femur cutaway showing compact bone, yellow marrow and spongy ends" /></td>
<td><img src="docs/screenshots/hemoglobin.webp" alt="Hemoglobin's four chains with the oxygen pressure slider" /></td>
<td><img src="docs/screenshots/dna.webp" alt="The shared DNA scene: a B-form double helix" /></td>
</tr>
</table>

| Nervous dive | Respiratory dive |
|---|---|
| ![Nervous dive animation](docs/media/nervous-dive.gif) | ![Respiratory dive animation](docs/media/respiratory-dive.gif) |

## Features

- **Tier-transition engine.** Each dive is a chain of scenes authored at their own scale (1 unit = 1 m for the body, 1 cm for organs, 1 µm for cells, 1 nm or 1 Å for molecules). The engine frames each by its real size and flies between them while the gauge sweeps on a log scale.
- **Click-to-learn cards** for every part: what it does, why it matters, an *Expert detail* switch, size, honesty labels, cited sources, and "In this view" links for keyboard users.
- **Shared library.** Nucleus, DNA, hemoglobin, heme, actin and myosin, antibody, glutamate, lipid bilayer, and O₂/CO₂ are each built once. Their cards list every dive that reaches them, computed from the dive graph.
- **Scene controls** that run real equations: the Hill curve on hemoglobin, sliding filaments in the sarcomere, Hursh's conduction rule on the axon, first-order oxygen loading in the lung capillary, and ball-and-stick versus space-filling molecules.
- **Guided tour** with narration captions on every step, optionally read aloud.
- **Check yourself** quizzes (four questions per dive) and a **glossary** of every term, with fly-to buttons.
- **Search and jump** to any part, including planned building blocks.
- **Settings**: reduced motion, picture quality, and read-aloud captions.
- **Local-first and private.** No accounts, analytics or network calls; progress stays in your browser.
- **Accessible.** Keyboard navigation (→ deeper, ← out, / search, G glossary, T tour, Esc close), screen-reader announcements, `prefers-reduced-motion`, and a phone layout.

## How the zoom works

A single continuous render from body to molecule is not feasible; the scale gap is about a billion-fold. Instead, each dive is a chain of discrete scenes, and the project grows by adding dives rather than re-modeling DNA for every cell.

![Powers of ten across the skeletal dive](docs/media/powers-of-ten.svg)

![Several dives converging on the same shared nucleus and DNA scenes](docs/media/shared-library.svg)

## Run it

You need Node.js 20 or newer.

```bash
git clone https://github.com/<you>/anatomy-odyssey.git
cd anatomy-odyssey
npm ci
npm run dev          # http://localhost:5173
```

Other scripts:

```bash
npm test               # 109 unit tests: scale math, every worked equation, dive graph, scenes, molecules, security guards
npm run build          # production build in dist/ (what GitHub Pages serves)
npm run build:preview  # one self-contained HTML file in dist-preview/
npm run manifest       # rebuild assets/manifest.json after adding assets
```

Screenshot every tier headlessly (software WebGL, no GPU needed):

```bash
npm run build && npx vite preview --port 4173 &
pip install playwright pillow && python3 -m playwright install chromium
python3 tools/screenshots.py --mobile            # fails on console errors or a blank tier
python3 tools/screenshots.py --only nervous      # one dive
python3 tools/record-hero.py --dive respiratory --out docs/media/respiratory-dive.gif
```

URL parameters: `?dive=nervous&step=synapse` opens a step directly, `&trip=1` opens a side trip into a library step, and `?renderer=webgl` forces the WebGL 2 fallback.

### Deploy to GitHub Pages

Push to `main`, then in the repository settings set **Pages → Source** to **GitHub Actions**. The `Deploy to GitHub Pages` workflow tests, builds and publishes `dist/`.

## Project layout

```
src/
  engine/      renderer (WebGPU with WebGL 2 fallback), tier engine, fades
  scenes/      one builder per tier (body, femur, heart, neuron, lungs, …) + registry
  library/     shared scenes (nucleus, DNA, hemoglobin, heme, actin–myosin, antibody,
               glutamate, lipid bilayer, gases) and the small-molecule helper
  data/        dives, library graph, cards, quizzes, references (all content lives here)
  science/     pure, tested math: scale, equations, dive-graph invariants
  security/    asset integrity checks for the glTF pipeline
  ui/          gauge, cards, search, scene controls, tour, quiz, glossary, about
tests/         Vitest suites
tools/         screenshots, GIF recorder, Z-Anatomy export script, asset manifest
docs/          state of the model, equations, security model, media
assets/        anatomy/ (CC BY-SA) and molecular/ (per-file licenses), CREDITS.md
```

## Adding a dive

1. Write scene builders in `src/scenes/` (return `root`, `metersPerUnit`, `view`, `focus`, `dispose`, and optionally `controls`, `update` and `branchFocus`).
2. Register them in `src/scenes/registry.js`.
3. Add the dive to `src/data/dives.js`. Use `libStep('dna')` to route into a shared scene, or a step's `branch` for a side trip.
4. Write cards (with sources from `src/data/references.js`), narration for each step, and four quiz questions.
5. `npm test` checks the invariants: frames shrink and tiers rise at every step (side trips too), scenes and cards exist, the focus part is clickable, and shared steps use the library's scene.

## Documentation

- [State of the model](docs/STATE_OF_THE_MODEL.md): what exists, where each dive honestly stops, and what is next
- [Equations](docs/EQUATIONS.md): each worked example with symbols, units and its test
- [Security model](docs/SECURITY_MODEL.md): trust boundaries, malicious assets, decompression bombs, supply chain
- [Asset credits](assets/CREDITS.md): source, author and license for every asset

## Roadmap

1. ~~**MVP**: whole-body model, system toggles, cards, tier engine, the skeletal dive.~~
2. ~~**More dives on the shared library**: circulatory, muscular, immune, nervous and respiratory dives; side trips.~~
3. ~~**Modules and learning tools**: the inflammatory response, quizzes, glossary, guided tour.~~
4. **Real assets**: Z-Anatomy meshes for the organ tiers and Protein Data Bank structures via Mol* for the molecules (the export script and integrity checks are ready).
5. **Desktop app** (Tauri) with parity and a first-launch hardware benchmark; an accessibility audit.
6. **Hardening**: reviewer accuracy pass against cited sources, full asset-license audit, signed releases.

## License

- **Code**: [MIT](LICENSE).
- **Anatomy assets** in `assets/anatomy/` (when added): CC BY-SA 4.0, as required by Z-Anatomy and BodyParts3D. ShareAlike applies to those assets only; they live in their own folder so it does not extend to the code.
- **Molecular assets** in `assets/molecular/`: each file's own license, listed in `assets/CREDITS.md`.
- **Fonts**: Atkinson Hyperlegible Next and Literata, SIL Open Font License 1.1.
