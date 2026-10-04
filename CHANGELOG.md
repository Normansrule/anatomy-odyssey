# Changelog

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
