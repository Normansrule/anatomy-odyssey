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
