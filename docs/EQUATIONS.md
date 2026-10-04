# Equations

Each equation follows the same pattern: intuition, equation, symbols with units, a worked example, where you see it, and the test that checks the numbers. Functions live in `src/science/`; tests in `tests/`.

## 1. Powers of ten

**Intuition.** Each dive step shrinks the view by one or more factors of ten. Counting those factors shows how far you have traveled.

**Equation.** orders = log₁₀(a / b)

| Symbol | Meaning | Unit |
|---|---|---|
| a, b | Two lengths | m |
| orders | Orders of magnitude between them | — |

**Worked example.** Body height 1.75 m against DNA width 2 nm: log₁₀(1.75 / 2 × 10⁻⁹) = log₁₀(8.75 × 10⁸) ≈ 8.94. The body is almost a billion times wider than the DNA helix.

**Where you see it.** The depth gauge, which maps log₁₀ of the view height from 10 m (top) to 0.1 nm (bottom).

**Test.** `tests/scale.test.js` → "whole body to DNA width is about a billion-fold".

## 2. Framing the camera

**Intuition.** To make the view a given height, back the camera away until that height fills the field of view.

**Equation.** h = 2 · d · tan(θ / 2) · s, so d = h / (2 · s · tan(θ / 2))

| Symbol | Meaning | Unit |
|---|---|---|
| h | View height at the target | m |
| d | Camera distance | scene units |
| θ | Vertical field of view (40°) | degrees |
| s | Meters per scene unit (1 for the body, 10⁻⁹ for DNA) | m / unit |

**Test.** `tests/scale.test.js` → "distanceForFrame inverts visibleHeightMeters".

## 3. DNA length

**Intuition.** Every base pair adds the same small step to the helix, so length is proportional to the number of base pairs.

**Equation.** L = N × r;  turns = N / p

| Symbol | Meaning | Unit |
|---|---|---|
| L | Contour length | m |
| N | Number of base pairs | bp |
| r | Rise per base pair (0.34 nm in B-DNA) | m / bp |
| p | Base pairs per turn (≈10.5 in B-DNA) | bp / turn |

**Worked examples.**
- The 24 base pairs in the DNA scene: 24 × 0.34 nm = 8.16 nm, and 24 / 10.5 ≈ 2.3 turns.
- A human cell's two genome copies, about 6.4 × 10⁹ bp: 6.4 × 10⁹ × 0.34 × 10⁻⁹ m ≈ 2.2 m, packed into a nucleus about 6 µm across.

**Where you see it.** The DNA card's expert detail.

**Tests.** `tests/equations.test.js` → "24 base pairs span 8.16 nm", "a diploid human genome … is about 2.2 m long", "21 base pairs make exactly two turns".

## 4. Base pairing and hydrogen bonds

**Intuition.** A pairs with T using two hydrogen bonds; G pairs with C using three.

**Equation.** H = 2 · n(A–T) + 3 · n(G–C)

**Worked example.** CGCGAATTCGCG has 8 G–C and 4 A–T pairs: 8 × 3 + 4 × 2 = 32 hydrogen bonds. The sequence is its own reverse complement (a palindrome), which is why it crystallizes as a self-paired duplex.

**Tests.** `tests/equations.test.js` → "counts hydrogen bonds", "the Dickerson dodecamer pairs with itself".

## 5. Diffusion time

**Intuition.** Molecules spread by random motion. Going twice as far takes four times as long, which is why every bone cell needs a blood vessel nearby.

**Equation.** t ≈ x² / (2D)

| Symbol | Meaning | Unit |
|---|---|---|
| t | Characteristic time to diffuse | s |
| x | Distance | m |
| D | Diffusion coefficient (oxygen in water near body temperature ≈ 2.1 × 10⁻⁹) | m² / s |

**Worked example.** Across 0.1 mm: (10⁻⁴)² / (2 × 2.1 × 10⁻⁹) ≈ 2.4 s. Across 1 mm: ≈ 238 s, about 4 minutes. Ten times the distance costs a hundred times the time.

**Where you see it.** The central canal card's expert detail, explaining why osteons are small.

**Tests.** `tests/equations.test.js` → "oxygen crosses 0.1 mm of water in about 2.4 s", "but 1 mm takes about 4 minutes".

## 6. Cardiac output (card text)

**Equation.** Q = HR × SV. At 70 beats/min × 70 mL per beat, Q ≈ 4.9 L/min.

This appears in the heart card's expert layer as an illustrative resting value.

## 7. Hemoglobin oxygen saturation (Hill equation)

**Intuition.** Hemoglobin grabs oxygen where it is plentiful (lungs) and lets go where it is scarce (working tissue). Its four sites cooperate, which makes the curve S-shaped.

**Equation.** S = pO₂ⁿ / (P₅₀ⁿ + pO₂ⁿ)

| Symbol | Meaning | Unit |
|---|---|---|
| S | Fraction of heme sites carrying oxygen | — |
| pO₂ | Oxygen partial pressure | mmHg |
| P₅₀ | Pressure at half saturation (26.8 for adult hemoglobin) | mmHg |
| n | Hill coefficient (about 2.7) | — |

**Worked example.** Lungs, 100 mmHg: about 97%. Resting tissue, 40 mmHg: about 75%. At P₅₀ exactly 50%.

**Where you see it.** The hemoglobin scene's oxygen pressure slider; the gas-exchange scene's readout.

**Tests.** "is half saturated at P50", "is about 97% saturated in the lungs and 75% in resting tissue".

## 8. Red blood cell shape (Evans–Fung)

**Equation.** T(r) = √(1 − u) · (C₀ + C₁u + C₂u²), with u = (r/R)², R = 3.91 µm, C₀ = 0.81, C₁ = 7.83, C₂ = −4.39 µm. Volume V = πR²(⅔C₀ + ⁴⁄₁₅C₁ + ¹⁶⁄₁₀₅C₂).

**Worked example.** 0.81 µm thick at the center, about 2.6 µm near the rim, volume about 94 fL.

**Tests.** "is 0.81 µm thick at the center and zero at the rim", "has a volume of about 94 femtoliters".

## 9. Sliding filaments

**Equation.** A band = thick filament length (1.6 µm); I band = L − A; H zone = max(0, L − 2 × thin filament length).

**Worked example.** At rest (L = 2.5 µm): A 1.6, I 0.9, H 0.5. Contracted (2.0 µm): H closes, A unchanged.

**Tests.** "at rest (2.5 µm)", "contracted (2.0 µm)".

## 10. Nerve conduction speed (Hursh)

**Intuition.** Thicker myelinated axons conduct faster, almost in proportion to their width.

**Equation.** v ≈ k · d, so t = distance / v

| Symbol | Meaning | Unit |
|---|---|---|
| v | Conduction velocity | m/s |
| k | About 6 | (m/s) per µm |
| d | Outer fiber diameter | µm |

**Worked example.** d = 10 µm: v ≈ 60 m/s, and 1 m (toe to spinal cord) takes about 17 ms. d = 1 µm: about 170 ms.

**Where you see it.** The neuron scene's axon diameter control.

**Tests.** "Hursh: a 10 µm myelinated fiber conducts at 60 m/s and crosses 1 m in about 17 ms".

## 11. Equilibrium potential (Nernst)

**Intuition.** An ion that is more concentrated on one side pulls the membrane voltage toward the value that exactly balances its concentration difference.

**Equation.** E = (RT / zF) · ln([ion]out / [ion]in)

| Symbol | Meaning | Unit |
|---|---|---|
| E | Equilibrium potential | V (shown in mV) |
| R | Gas constant, 8.314 | J/(mol·K) |
| T | Temperature, 310.15 (37 °C) | K |
| z | Ion charge | — |
| F | Faraday constant, 96,485 | C/mol |

**Worked example.** RT/F ≈ 26.7 mV at body temperature. Potassium, 5 mM out and 140 mM in: E ≈ 26.7 × ln(5/140) ≈ −89 mV. Sodium, 145 out and 15 in: ≈ +61 mV.

**Where you see it.** The neuron card's expert detail.

**Tests.** "Nernst: E(K⁺) ≈ −89 mV and E(Na⁺) ≈ +61 mV at 37 °C".

## 12. Crossing the synaptic cleft

Diffusion time (section 5) with glutamate's free-solution diffusion coefficient, D ≈ 7.6 × 10⁻¹⁰ m²/s, over a 20 nm cleft: t ≈ (2 × 10⁻⁸)² / (2 × 7.6 × 10⁻¹⁰) ≈ 0.26 µs.

**Tests.** "glutamate crosses a 20 nm cleft in about a quarter of a microsecond".

## 13. Alveolar surface area (sphere estimate)

**Equation.** A ≈ N · π d² (the surface of N spheres of diameter d)

**Worked example.** N = 480 million, d = 0.2 mm: A ≈ 60 m². Textbooks give 50–100 m²; electron-microscope morphometry gives about 140 m², because real alveolar walls are folded and shared.

**Tests.** "480 million 0.2 mm spheres have about 60 m² of surface".

## 14. Oxygen loading along a lung capillary

**Intuition.** Blood arriving low in oxygen loads fast at first, then more slowly as it approaches the air's oxygen pressure.

**Equation.** pO₂(t) = P_A − (P_A − P_v) · e^(−t/τ)

| Symbol | Meaning | Value |
|---|---|---|
| P_A | Alveolar oxygen pressure | 100 mmHg |
| P_v | Mixed venous (arriving) pressure | 40 mmHg |
| τ | Time constant (a teaching value) | 0.08 s |
| t | Time since entering the capillary (transit about 0.75 s at rest) | s |

**Worked example.** t = 0.25 s: pO₂ ≈ 97 mmHg, and the Hill equation gives about 97% saturation. Equilibrium within a third of the transit leaves a reserve for exercise, when blood moves through faster. Separately, the diffusion time across the 0.62 µm barrier is about 90 µs (section 5).

**Where you see it.** The gas-exchange scene's transit control.

**Tests.** "capillary blood starts at 40 mmHg and is near 100 mmHg a third of the way along", "oxygen crosses the 0.62 µm air–blood barrier in about 90 µs".

## 15. Minute ventilation

**Equation.** V̇ = tidal volume × breathing rate. At 500 mL × 12 breaths per minute: 6 L/min.

**Where you see it.** The lungs scene's breathing control.

**Tests.** "minute ventilation: 500 mL × 12 breaths = 6 L/min".

## 16. Molecule geometry

The glutamate, heme and gas models are built from bond lengths and angles, and the tests check them: glutamate has the formula C₅H₈NO₄⁻, bonds between 0.95 and 1.56 Å, a tetrahedral alpha carbon (109.5°) and no clashing atoms; the gases use O=O 1.21 Å, C=O 1.16 Å and N≡N 1.10 Å.

## 17. The genetic code

**Intuition.** mRNA is read three letters at a time. Each three-letter codon names one amino acid or says "stop".

**Rule.** 4 bases in groups of 3 give 4³ = 64 codons: 61 code for the 20 amino acids and 3 (UAA, UAG, UGA) are stops. AUG is both the start signal and methionine. The table in `src/science/equations.js` is the standard code (NCBI translation table 1).

**Worked example.** The first 11 codons of the human β-globin gene, ATG GTG CAT CTG ACT CCT GAG GAG AAG TCT GCC, transcribe to AUG GUG CAU CUG ACU CCU GAG GAG AAG UCU GCC and translate to M V H L T P E E K S A. Changing codon 7 from GAG to GTG (the sickle-cell mutation, called E6V because numbering starts after the removed methionine) gives M V H L T P **V** E K S A.

**Where you see it.** The gene-to-protein module's readout during translation, and the gene and codon cards.

**Tests.** `tests/library.test.js` → "has 64 codons: 61 for amino acids and 3 stops", "translates the start of β-globin, and the sickle-cell change swaps one glutamate for valine".

## 18. Generated molecule geometry

Small molecules are built from their chemical structure (SMILES) with RDKit: ETKDG v3 embeds 3D coordinates and the MMFF94 force field refines them. The generator (`tools/gen_molecules.py`) asserts each molecule's formula, net charge and stereocenters (all amino acids L; DNA and RNA sugars D; POPC's glycerol R). The tests then recheck every formula and every bond length against typical ranges, split each molecule into its named parts (backbone and side chain; phosphate, sugar and base; head and tails) and check the parts' atom counts.

## 19. From mass to atoms

**Intuition.** A light element needs many atoms to add up to its share of the mass, so ranking by atoms looks very different from ranking by kilograms.

**Equation.** nᵢ ∝ wᵢ / Mᵢ, then normalize: atom %ᵢ = 100 · (wᵢ / Mᵢ) / Σⱼ (wⱼ / Mⱼ)

| Symbol | Meaning | Unit |
|---|---|---|
| wᵢ | Element's percent of body mass (Campbell Biology, Table 2.1: O 65, C 18.5, H 9.5, N 3.3, Ca 1.5, P 1.0, K 0.4, S 0.3, Na 0.2, Cl 0.2, Mg 0.1) | % |
| Mᵢ | Atomic mass | g/mol |

**Worked example.** Hydrogen: 9.5 / 1.008 = 9.42; oxygen: 65 / 16.00 = 4.06; carbon: 18.5 / 12.01 = 1.54. Over all eleven elements the sum is 15.37, so hydrogen is 9.42 / 15.37 ≈ 61.3% of atoms, oxygen 26.4% and carbon 10.0%. (The often-quoted 62 / 24 / 12 comes from a slightly different mass data set.)

**Where you see it.** The Chemistry of life module's first step: the cube figure refills from "by mass" to "by atoms". Its cubes are shared out by the largest-remainder method so the counts add up exactly.

**Tests.** `tests/chemistry.test.js` → "the mass percentages sum to 100, and O, C, H and N make up 96.3%", "counting atoms instead of mass, hydrogen is about 61%, oxygen 26% and carbon 10%", "shares whole cubes fairly".

## 20. Atoms in a body

**Equation.** N = m · Σᵢ (wᵢ / 100) / Mᵢ · N_A, with N_A = 6.022 × 10²³ per mole.

**Worked example.** 70 kg = 70,000 g × 0.1537 mol/g ≈ 10,760 mol, × 6.022 × 10²³ ≈ 6.5 × 10²⁷ atoms.

**Test.** "a 70 kg adult holds about 6.5 × 10²⁷ atoms".

## 21. How much an enzyme lowers the barrier

**Intuition.** Reaction rates depend exponentially on the height of the energy barrier, so a modest drop in the barrier gives an enormous speed-up. Every 5.9 kJ/mol at body temperature is another factor of ten.

**Equation.** speed-up = k_cat / k_uncat = e^(ΔΔG‡ / RT), so ΔΔG‡ = RT · ln(speed-up)

| Symbol | Meaning | Value |
|---|---|---|
| k_cat | Carbonic anhydrase II turnover for CO₂ hydration | about 10⁶ s⁻¹ |
| k_uncat | Uncatalyzed CO₂ hydration at body pH | about 0.1 s⁻¹ |
| R, T | Gas constant; body temperature | 8.314 J/(mol·K); 310.15 K |

**Worked example.** Speed-up 10⁷: ΔΔG‡ = 8.314 × 310.15 × ln(10⁷) ≈ 41.6 kJ/mol. A dissolved CO₂ on its own waits about 1 / 0.1 = 10 s on average to react; in the enzyme's pocket, about 1 µs.

**Where you see it.** The enzyme step's "Barrier lowered" control.

**Tests.** "a ten-million-fold speed-up needs the barrier lowered by about 41.6 kJ/mol at 37 °C", "every 5.9 kJ/mol is another factor of ten", "uncatalyzed, a CO₂ waits about 10 s; in the enzyme, about a microsecond".

## 22. Blood pH (Henderson–Hasselbalch)

**Intuition.** Blood pH depends on the ratio of base (bicarbonate, set by the kidneys) to acid (dissolved CO₂, set by your breathing), not on either alone.

**Equation.** pH = 6.1 + log₁₀([HCO₃⁻] / (0.03 × pCO₂))

| Symbol | Meaning | Unit |
|---|---|---|
| 6.1 | Apparent pKa of the CO₂ / bicarbonate system at 37 °C | — |
| [HCO₃⁻] | Plasma bicarbonate (normal about 24) | mmol/L |
| 0.03 | CO₂ solubility in plasma | mmol/L per mmHg |
| pCO₂ | CO₂ partial pressure (normal arterial about 40) | mmHg |

**Worked example.** 24 / (0.03 × 40) = 24 / 1.2 = 20, log₁₀ 20 = 1.30, pH = 7.40. Doubling CO₂ to 80 mmHg halves the ratio: pH = 7.40 − log₁₀ 2 = 7.10.

**Where you see it.** The buffer step's "Blood CO₂" control.

**Tests.** "normal blood: 24 mM bicarbonate and 40 mmHg CO₂ give pH 7.40", "the ratio is 20 to 1", "doubling CO₂ … drops pH by log₁₀ 2 ≈ 0.30".

## 23. Free hydrogen ions from pH

**Equation.** [H⁺] = 10^(−pH) mol/L = 10^(9 − pH) nmol/L

**Worked example.** pH 7.40 → 10^1.6 ≈ 40 nmol/L. A handy coincidence at normal bicarbonate: [H⁺] in nanomolar is close to pCO₂ in mmHg (40 → 40, 80 → 79).

**Test.** "free H⁺ is about 40 nM at pH 7.4, so in nM it roughly equals pCO₂ in mmHg".

## 24. First and second exposure (an illustrative model)

**Intuition.** The first time, only a few B cells fit the germ, so they must multiply for days before there is much antibody; memory cells left over make the second response fast and large.

**Equations** (time in days; populations relative; S = P / (P + h), S_M = P / (P + h_M)):

- Germs: P' = rP(1 − P/K) − k_I·I·P − k_A·A·P
- Innate defenders: I' = a_I·S − d_I·I
- Responding B cells: B' = g·S·B·(1 − B/B_max) − d_B·(B − 1)
- Memory in training (n stages, mean τ = 21 days): G₁' = m·S·B − (n/τ)·G₁, Gᵢ' = (n/τ)·(Gᵢ₋₁ − Gᵢ)
- Memory B cells: R' = (n/τ)·G_n + g_M·S_M·R·(1 − R/R_max)
- Plasma cells: E' = e·S·B + e_M·S_M·R − d_E·E
- Antibody: A' = p·E − d_A·A, with d_A = ln 2 / 21 days (IgG half-life)

Parameters are in `src/science/immuneModel.js`; the model is solved with fourth-order Runge–Kutta at a 0.01-day step. It is not fitted to data: the tests check the textbook shape, not exact numbers.

**What it shows.** First exposure: antibody detectable after about 6 days, peaking near day 21; the germ reaches about 2 × 10⁵ and is cleared by about day 13. Second exposure (day 90): antibody rises within a day and peaks about 5 times higher; the germ peaks more than 200 times lower and is gone in under two days. Without the adaptive response, innate defenses alone slow the germ but never clear it.

**Tests.** `tests/immune.test.js` → "the first response is slow", "the second response is fast and big", "the second time, the germ never gets going", "memory B cells form only after the first infection", "innate defenses alone slow the germ but cannot clear it", "the integration has converged".

## 25. Frame-time quantiles (first-launch benchmark)

Not biology, but it is tested the same way. The app times about 120 frames after a warm-up and takes the median and the 90th percentile by linear interpolation: q(p) = x⌊k⌋ + (x⌈k⌉ − x⌊k⌋)(k − ⌊k⌋), with k = (n − 1)p on the sorted times. Median over 25 ms (under about 40 frames per second) or a 90th percentile over 40 ms switches "Balanced" to fewer pixels; a steady 90 frames per second or more allows extra sharpness.

**Tests.** `tests/benchmark.test.js`.

## 26. Clonal expansion

**Intuition.** A T cell that fits a germ divides, and so does every daughter, so the clone doubles each generation.

**Equation.** N = N₀ · 2ⁿ, so n = log₂(N / N₀) and t = t_d · log₂(N / N₀)

| Symbol | Meaning | Unit |
|---|---|---|
| N₀, N | Cells at the start and after n divisions | cells |
| n | Number of divisions (generations) | — |
| t_d | Time per division (as short as about 2 hours, often about 6, in activated killer T cells; Yoon et al., 2010) | hours |

**Worked example.** 4 divisions make 16 cells (the scene's clone); 10 make 1,024; 14 make 16,384, which takes 14 × 6 = 84 hours = 3.5 days at 6 hours per division.

**Where you see it.** The antigen presentation step's Divide and Clone stages.

**Tests.** `tests/tcells.test.js` → "doubling n times gives 2ⁿ cells", "reaching 16,384 cells takes 14 divisions, 3.5 days at 6 hours each", "the scene shows 1, 2, 4, 8, then 16 cells".

## 27. The size of recognition

**Facts used.** A T-cell receptor bound to a peptide–MHC spans about 15 nm between the two membranes; the LFA-1–ICAM-1 adhesion pair that rings the synapse spans 36–45 nm (Al-Aghbar et al., 2022). MHC class I holds peptides of 8–10 amino acids; an extended chain adds about 0.34 nm per amino acid.

**Equation.** L = (n − 1) × 0.34 nm for a peptide of n amino acids, end to end.

**Worked example.** 9 amino acids: 8 × 0.34 = 2.72 nm, which fits the groove between the two MHC helices.

**Tests.** "spans a 15 nm gap, much narrower than the 36–45 nm adhesion ring", "the peptide is 9 amino acids, inside the 8–10 MHC class I holds, about 2.7 nm long".
