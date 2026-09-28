# The Equation Atlas

> 47 equations of space science and spaceflight, each with a symbol legend, a plain-language meaning and a worked example with real numbers. The [interactive edition](https://normansrule.github.io/cosmic-library/equations.html) adds a live calculator and plot for every one.
>
> *This file is generated from [`site/data/equations.json`](../site/data/equations.json) by [`scripts/build_equations_md.mjs`](../scripts/build_equations_md.mjs). Every worked-example result is recomputed and checked by [`scripts/check_equations.mjs`](../scripts/check_equations.mjs). Edit the JSON, not this file.*

Acronyms are written out in full the first time they appear on each card. Values of physical constants follow the Committee on Data of the International Science Council (CODATA) 2018 and the International Astronomical Union (IAU) 2015 nominal values — see [Constants](#constants).

## Contents

1. [Gravity & Orbits](#ch-gravity)
   - [1.1 Newton's law of universal gravitation](#newton-gravitation)
   - [1.2 Kepler's first law — orbits are ellipses](#kepler-first)
   - [1.3 Kepler's second law — equal areas in equal times](#kepler-second)
   - [1.4 Kepler's third law — the harmonic law](#kepler-third)
   - [1.5 Vis-viva equation](#vis-viva)
   - [1.6 Orbital period](#orbital-period)
   - [1.7 Circular orbital velocity](#circular-velocity)
   - [1.8 Escape velocity](#escape-velocity)
   - [1.9 Hohmann transfer Δv](#hohmann)
   - [1.10 Sphere of influence](#sphere-of-influence)
   - [1.11 Hill sphere](#hill-sphere)
   - [1.12 Roche limit](#roche-limit)
   - [1.13 L1 / L2 Lagrange-point distance](#l1-distance)
2. [Rockets](#ch-rockets)
   - [2.1 Tsiolkovsky rocket equation](#tsiolkovsky)
   - [2.2 Rocket thrust equation](#thrust-equation)
   - [2.3 Specific impulse and effective exhaust velocity](#specific-impulse)
   - [2.4 Mass ratio and propellant fraction](#mass-ratio)
   - [2.5 Multi-stage Δv](#multistage)
   - [2.6 Drag equation](#drag)
   - [2.7 Dynamic pressure and Max-Q](#dynamic-pressure)
   - [2.8 Gravity loss](#gravity-loss)
3. [Atmosphere & Re-entry](#ch-atmosphere)
   - [3.1 Barometric formula and scale height](#barometric)
   - [3.2 Speed of sound and Mach number](#speed-of-sound)
   - [3.3 Stagnation temperature](#stagnation-temperature)
   - [3.4 Sutton–Graves stagnation-point heat flux](#sutton-graves)
   - [3.5 Ballistic coefficient](#ballistic-coefficient)
4. [Light & Stars](#ch-light)
   - [4.1 Stefan–Boltzmann law](#stefan-boltzmann)
   - [4.2 Wien's displacement law](#wien)
   - [4.3 Planck's law](#planck)
   - [4.4 Inverse-square law of flux](#inverse-square)
   - [4.5 Apparent magnitude and distance modulus](#magnitude)
   - [4.6 Doppler shift](#doppler)
   - [4.7 Parallax distance](#parallax)
   - [4.8 Mass–luminosity relation](#mass-luminosity)
   - [4.9 Eddington luminosity](#eddington)
5. [Relativity & Black Holes](#ch-relativity)
   - [5.1 Lorentz factor](#lorentz-factor)
   - [5.2 Special-relativistic time dilation](#time-dilation)
   - [5.3 Mass–energy equivalence](#mass-energy)
   - [5.4 Schwarzschild radius](#schwarzschild)
   - [5.5 Gravitational time dilation and redshift](#gravitational-time-dilation)
   - [5.6 Hawking temperature](#hawking)
   - [5.7 GPS clock correction](#gps-clock)
6. [Cosmology](#ch-cosmology)
   - [6.1 Hubble–Lemaître law](#hubble-lemaitre)
   - [6.2 Cosmological redshift and scale factor](#redshift-scale-factor)
   - [6.3 Friedmann equation](#friedmann)
   - [6.4 Critical density](#critical-density)
   - [6.5 Temperature of the cosmic microwave background](#cmb-temperature)
7. [Constants](#constants)

---

<a id="ch-gravity"></a>

## 1. Gravity & Orbits

One inverse-square law, three laws of Kepler, and the handful of formulas every mission designer carries in their head: how fast, how long, how far, and how much velocity change (Δv) it costs to go somewhere else.

<a id="newton-gravitation"></a>

### 1.1 Newton's law of universal gravitation

*Inverse-square law of gravity*

$$
F = G\thinspace \frac{m_1\thinspace m_2}{r^2}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`F`$ | Attractive force between the two bodies | N |
| $`G`$ | Newtonian constant of gravitation | m³ kg⁻¹ s⁻² |
| $`m_1, m_2`$ | The two masses | kg |
| $`r`$ | Distance between their centres | m |

**What it means.** Every mass pulls on every other mass along the line joining them. Double either mass and the pull doubles; double the distance and it falls to a quarter. The same law drops an apple, holds the Moon in orbit and shapes galaxies. Isaac Newton published it in the Principia (1687).

**Worked example — How hard do the Earth and Moon pull on each other?** Earth $`m_1 = 5.972\times10^{24}`$ kg, Moon $`m_2 = 7.346\times10^{22}`$ kg, mean separation $`r = 384\thinspace 400`$ km.

$$
F = \frac{(6.674\times10^{-11})(5.972\times10^{24})(7.346\times10^{22})}{(3.844\times10^{8})^2}
$$

**Result: 1.982 × 10²⁰ N** — about 20 billion billion newtons — enough to raise tides of metres in the oceans.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#newton-gravitation) · Sources: [NASA/JPL — Basics of Space Flight, Chapter 3: Gravity & Mechanics](https://science.nasa.gov/learn/basics-of-space-flight/chapter3-3/) · [Wikipedia — Newton's law of universal gravitation](https://en.wikipedia.org/wiki/Newton%27s_law_of_universal_gravitation)

<a id="kepler-first"></a>

### 1.2 Kepler's first law — orbits are ellipses

*Orbit equation (conic section)*

$$
r(\theta) = \frac{a\thinspace (1-e^2)}{1 + e\cos\theta}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`r`$ | Distance from the focus (the Sun) to the planet | m |
| $`a`$ | Semi-major axis (half the long axis of the ellipse) | m |
| $`e`$ | Eccentricity: 0 is a circle, close to 1 is a long thin ellipse | — |
| $`\theta`$ | True anomaly: angle from the closest point (periapsis) | rad |

**What it means.** Planets do not move in circles. Johannes Kepler found in 1609, from Tycho Brahe's observations of Mars, that each orbit is an ellipse with the Sun at one focus — not at the centre. The closest point is $`r_p = a(1-e)`$ (perihelion) and the farthest is $`r_a = a(1+e)`$ (aphelion).

**Worked example — How close does Mars get to the Sun?** Mars: $`a = 1.5237`$ AU, $`e = 0.0934`$. Perihelion is at $`\theta = 0`$.

$$
r(0) = \frac{1.5237\thinspace (1 - 0.0934^2)}{1 + 0.0934} = 1.5237\thinspace (1-0.0934)
$$

**Result: 1.381 AU** — about 206.7 million km; at aphelion Mars is 1.666 AU away — a 21 % swing.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#kepler-first) · Sources: [NASA Science — Orbits and Kepler's Laws](https://science.nasa.gov/solar-system/orbits-and-keplers-laws/) · [Wikipedia — Kepler's laws of planetary motion](https://en.wikipedia.org/wiki/Kepler%27s_laws_of_planetary_motion)

<a id="kepler-second"></a>

### 1.3 Kepler's second law — equal areas in equal times

*Conservation of angular momentum*

$$
\frac{dA}{dt} = \tfrac12\thinspace r^2\dot\theta = \tfrac12\sqrt{\mu\thinspace a\thinspace (1-e^2)} = \text{constant}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`dA/dt`$ | Area swept per second by the Sun–planet line | m²/s |
| $`r`$ | Sun–planet distance | m |
| $`\dot\theta`$ | Angular speed around the Sun | rad/s |
| $`\mu = GM`$ | Gravitational parameter of the central body | m³/s² |
| $`a, e`$ | Semi-major axis and eccentricity | m, — |

**What it means.** A line from the Sun to a planet sweeps out equal areas in equal times. Close to the Sun the line is short, so the planet must move fast; far away it crawls. Physically this is conservation of angular momentum, and it gives the speed ratio $`v_p/v_a = (1+e)/(1-e)`$ between perihelion and aphelion.

**Worked example — How much faster is Earth in January than in July?** Earth: $`a = 1`$ AU, $`e = 0.0167`$, $`\mu_\odot = 1.327\times10^{20}`$ m³/s². Perihelion speed:

$$
v_p = \sqrt{\frac{\mu_\odot}{a}\thinspace \frac{1+e}{1-e}} = \sqrt{\frac{1.327\times10^{20}}{1.496\times10^{11}}\cdot\frac{1.0167}{0.9833}}
$$

**Result: 30.29 km/s** — at perihelion (early January) versus 29.29 km/s at aphelion (early July) — 3.4 % faster.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#kepler-second) · Sources: [NASA Science — Orbits and Kepler's Laws](https://science.nasa.gov/solar-system/orbits-and-keplers-laws/) · [Wikipedia — Kepler's laws of planetary motion](https://en.wikipedia.org/wiki/Kepler%27s_laws_of_planetary_motion)

<a id="kepler-third"></a>

### 1.4 Kepler's third law — the harmonic law

*Period–distance relation*

$$
T^2 = \frac{4\pi^2}{G\thinspace (M+m)}\thinspace a^3
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`T`$ | Orbital period | s |
| $`a`$ | Semi-major axis | m |
| $`M, m`$ | Central mass and orbiting mass (here $`m \ll M`$ is neglected) | kg |
| $`G`$ | Gravitational constant | m³ kg⁻¹ s⁻² |

**What it means.** The square of a planet's year is proportional to the cube of its orbit size. In units of years and astronomical units (AU) around the Sun it collapses to $`T^2 = a^3`$. Newton showed where the constant comes from, which turns the law into a scale: measure an orbit and you have weighed the central body.

**Worked example — How long is a year on Mars?** Mars orbits at $`a = 1.5237`$ AU around a Sun of $`1\thinspace M_\odot`$. In solar units $`T = a^{3/2}`$ years:

$$
T = 1.5237^{3/2}~\text{yr}
$$

**Result: 1.881 yr** — that is 687 Earth days.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#kepler-third) · Sources: [NASA Science — Orbits and Kepler's Laws](https://science.nasa.gov/solar-system/orbits-and-keplers-laws/) · [Wikipedia — Kepler's laws of planetary motion](https://en.wikipedia.org/wiki/Kepler%27s_laws_of_planetary_motion)

<a id="vis-viva"></a>

### 1.5 Vis-viva equation

*Orbital energy equation*

$$
v^2 = \mu\left(\frac{2}{r} - \frac{1}{a}\right)
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`v`$ | Orbital speed at distance $`r`$ | m/s |
| $`\mu = GM`$ | Standard gravitational parameter of the central body | m³/s² |
| $`r`$ | Current distance from the centre of the central body | m |
| $`a`$ | Semi-major axis of the orbit | m |

**What it means.** The single most useful equation in orbital mechanics. It is conservation of energy for an orbit: kinetic plus potential energy per kilogram is fixed by the orbit's size, $`-\mu/2a`$. Know where you are ($`r`$) and which orbit you are on ($`a`$) and you know your speed. A circle ($`r = a`$) and an escape trajectory ($`a \to \infty`$) are special cases.

**Worked example — Speed at the low point of a geostationary transfer orbit (GTO)** Perigee at 200 km altitude ($`r = 6\thinspace 578`$ km), apogee at geostationary radius (42 164 km), so $`a = 24\thinspace 371`$ km.

$$
v = \sqrt{3.986\times10^{14}\left(\frac{2}{6.578\times10^{6}} - \frac{1}{2.4371\times10^{7}}\right)}
$$

**Result: 10.24 km/s** — about 2.45 km/s faster than a circular orbit at the same height (7.78 km/s).

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#vis-viva) · Sources: [R. A. Braeunig — Rocket & Space Technology: Orbital Mechanics](http://www.braeunig.us/space/orbmech.htm) · [Wikipedia — Vis-viva equation](https://en.wikipedia.org/wiki/Vis-viva_equation)

<a id="orbital-period"></a>

### 1.6 Orbital period

*Period of an elliptical orbit*

$$
T = 2\pi\sqrt{\frac{a^3}{\mu}}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`T`$ | Time for one full orbit | s |
| $`a`$ | Semi-major axis (orbit radius for a circle) | m |
| $`\mu = GM`$ | Gravitational parameter of the central body | m³/s² |

**What it means.** Kepler's third law written for satellites. The period depends only on the size of the orbit, not on its shape or on the satellite's mass. That is why every satellite at 35 786 km altitude takes one sidereal day (23 h 56 min) and appears to hang still over the equator.

**Worked example — How long does the International Space Station (ISS) take to lap Earth?** The ISS flies about 420 km above Earth's mean radius of 6 371 km, so $`a \approx 6\thinspace 791`$ km.

$$
T = 2\pi\sqrt{\frac{(6.791\times10^{6})^3}{3.986\times10^{14}}}
$$

**Result: 92.82 min** — ≈ 92.8 minutes — about 15.5 orbits and 16 sunrises a day.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#orbital-period) · Sources: [NASA/JPL — Basics of Space Flight, Chapter 3: Gravity & Mechanics](https://science.nasa.gov/learn/basics-of-space-flight/chapter3-3/) · [Wikipedia — Orbital period](https://en.wikipedia.org/wiki/Orbital_period)

<a id="circular-velocity"></a>

### 1.7 Circular orbital velocity

*First cosmic velocity*

$$
v_c = \sqrt{\frac{\mu}{r}}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`v_c`$ | Speed needed for a circular orbit | m/s |
| $`\mu = GM`$ | Gravitational parameter | m³/s² |
| $`r`$ | Orbit radius from the body's centre | m |

**What it means.** In a circular orbit gravity supplies exactly the centripetal force: $`GMm/r^2 = mv^2/r`$. The spacecraft is always falling, but it moves sideways fast enough that the ground curves away beneath it just as fast. Higher orbits are slower.

**Worked example — How fast is the ISS moving?** Radius $`r = 6\thinspace 791`$ km around Earth.

$$
v_c = \sqrt{\frac{3.986\times10^{14}}{6.791\times10^{6}}}
$$

**Result: 7.661 km/s** — about 27 600 km/h — London to New York in 12 minutes.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#circular-velocity) · Sources: [NASA/JPL — Basics of Space Flight, Chapter 3: Gravity & Mechanics](https://science.nasa.gov/learn/basics-of-space-flight/chapter3-3/) · [Wikipedia — Circular orbit](https://en.wikipedia.org/wiki/Circular_orbit)

<a id="escape-velocity"></a>

### 1.8 Escape velocity

*Second cosmic velocity*

$$
v_{esc} = \sqrt{\frac{2\mu}{r}} = \sqrt{2}\thickspace v_c
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`v_{esc}`$ | Speed at which kinetic energy equals the depth of the gravity well | m/s |
| $`\mu = GM`$ | Gravitational parameter | m³/s² |
| $`r`$ | Starting distance from the centre | m |

**What it means.** Throw something at this speed (ignoring air) and it coasts away forever, slowing down but never quite stopping. Set kinetic energy $`\tfrac12 v^2`$ equal to the gravitational binding energy $`\mu/r`$. It is always exactly $`\sqrt2 \approx 1.414`$ times the circular speed at the same radius.

**Worked example — Escape velocity from Earth's surface** Mean radius $`r = 6\thinspace 371`$ km.

$$
v_{esc} = \sqrt{\frac{2\thinspace (3.986\times10^{14})}{6.371\times10^{6}}}
$$

**Result: 11.19 km/s** — roughly 40 000 km/h. From the Moon's surface it is only 2.38 km/s.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#escape-velocity) · Sources: [NASA/JPL — Basics of Space Flight, Chapter 3: Gravity & Mechanics](https://science.nasa.gov/learn/basics-of-space-flight/chapter3-3/) · [Wikipedia — Escape velocity](https://en.wikipedia.org/wiki/Escape_velocity)

<a id="hohmann"></a>

### 1.9 Hohmann transfer Δv

*Two-impulse transfer between circular orbits*

$$
\begin{aligned}\Delta v_1 &= \sqrt{\frac{\mu}{r_1}}\left(\sqrt{\frac{2r_2}{r_1+r_2}} - 1\right) \cr \Delta v_2 &= \sqrt{\frac{\mu}{r_2}}\left(1 - \sqrt{\frac{2r_1}{r_1+r_2}}\right) \cr t_H &= \pi\sqrt{\frac{(r_1+r_2)^3}{8\mu}}\end{aligned}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\Delta v_1, \Delta v_2`$ | Burn at departure (periapsis) and arrival (apoapsis) | m/s |
| $`r_1, r_2`$ | Radii of the starting and target circular orbits | m |
| $`\mu`$ | Gravitational parameter of the central body | m³/s² |
| $`t_H`$ | Transfer time (half the transfer ellipse's period) | s |

**What it means.** Walter Hohmann showed in 1925 that the cheapest two-burn route between circular orbits is half an ellipse that just touches both. Burn prograde to stretch the orbit, coast half an orbit, burn again to circularise. It is slow but fuel-efficient, and it is how most satellites reach geostationary orbit and how Mars missions are timed.

**Worked example — Low Earth orbit (LEO) to geostationary orbit (GEO)** From a 300 km circular orbit ($`r_1 = 6\thinspace 678`$ km) to GEO ($`r_2 = 42\thinspace 164`$ km).

$$
\Delta v_1 = 7.726\left(\sqrt{\tfrac{2(42\thinspace 164)}{48\thinspace 842}} - 1\right),\quad \Delta v_2 = 3.075\left(1 - \sqrt{\tfrac{2(6\thinspace 678)}{48\thinspace 842}}\right)~\text{km/s}
$$

**Result: 3.893 km/s** — 2.43 + 1.47 km/s, with a 5.3-hour coast. (A real GEO transfer also changes inclination, which costs more.)

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#hohmann) · Sources: [R. A. Braeunig — Rocket & Space Technology: Orbital Mechanics](http://www.braeunig.us/space/orbmech.htm) · [Wikipedia — Hohmann transfer orbit](https://en.wikipedia.org/wiki/Hohmann_transfer_orbit)

<a id="sphere-of-influence"></a>

### 1.10 Sphere of influence

*Laplace sphere; patched-conic boundary*

$$
r_{SOI} \approx a\left(\frac{m}{M}\right)^{2/5}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`r_{SOI}`$ | Radius of the planet's sphere of influence (SOI) | m |
| $`a`$ | Planet's orbital distance from the larger body | m |
| $`m, M`$ | Mass of the planet and of the body it orbits | kg |

**What it means.** Inside this radius it is more accurate to treat a spacecraft as orbiting the planet (with the Sun as a small disturbance); outside, as orbiting the Sun. Mission designers use it to stitch simple two-body orbits together — the 'patched conic' method used to plan the Apollo and Voyager trajectories.

**Worked example — Earth's sphere of influence** $`a = 1.496\times10^{8}`$ km, $`m = 5.972\times10^{24}`$ kg, $`M_\odot = 1.988\times10^{30}`$ kg.

$$
r_{SOI} = 1.496\times10^{8}~\text{km}\times\left(\frac{5.972\times10^{24}}{1.988\times10^{30}}\right)^{0.4}
$$

**Result: 924,649 km** — about 2.4 times the Moon's distance.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#sphere-of-influence) · Sources: [Wikipedia — Sphere of influence (astrodynamics)](https://en.wikipedia.org/wiki/Sphere_of_influence_(astrodynamics)) · [R. A. Braeunig — Rocket & Space Technology: Orbital Mechanics](http://www.braeunig.us/space/orbmech.htm)

<a id="hill-sphere"></a>

### 1.11 Hill sphere

*Roche sphere (of a planet)*

$$
r_H \approx a\thinspace (1-e)\thinspace \sqrt[3]{\frac{m}{3M}}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`r_H`$ | Hill radius: where the planet's gravity dominates the tidal pull of the star | m |
| $`a, e`$ | Planet's semi-major axis and eccentricity | m, — |
| $`m, M`$ | Planet mass and star mass | kg |

**What it means.** A moon must orbit well inside this radius to stay bound to its planet; in practice stable moons live within about a third to a half of $`r_H`$. It is set by the balance of the planet's gravity against the star's tidal stretching, which is why the cube root appears. The Sun–Earth L1 and L2 points sit almost exactly on it.

**Worked example — Earth's Hill sphere** $`a = 1`$ AU, $`e = 0.0167`$, $`m/M_\odot = 3.00\times10^{-6}`$.

$$
r_H = 1.496\times10^{8}~\text{km}\times(1-0.0167)\times\sqrt[3]{\frac{3.00\times10^{-6}}{3}}
$$

**Result: 1.472 × 10⁶ km** — about 1.47 million km; the Moon, at 0.38 million km, is comfortably inside.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#hill-sphere) · Sources: [Wikipedia — Hill sphere](https://en.wikipedia.org/wiki/Hill_sphere) · [NASA Science — What is a Lagrange Point?](https://science.nasa.gov/resource/what-is-a-lagrange-point/)

<a id="roche-limit"></a>

### 1.12 Roche limit

*Tidal disruption distance*

$$
d_{rigid} = R_M\left(2\thinspace \frac{\rho_M}{\rho_m}\right)^{1/3}\qquad d_{fluid} \approx 2.44\thinspace R_M\left(\frac{\rho_M}{\rho_m}\right)^{1/3}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`d`$ | Closest distance (centre to centre) a moon can orbit without being torn apart | m |
| $`R_M`$ | Radius of the primary (planet or star) | m |
| $`\rho_M, \rho_m`$ | Mean densities of the primary and the satellite | kg/m³ |

**What it means.** Closer than this, the difference in the planet's pull across a moon (the tide) beats the moon's own gravity, and a moon held together only by gravity comes apart. Édouard Roche computed it in 1848. A rigid body survives closer in; a fluid rubble pile breaks up farther out. Saturn's bright rings lie inside Saturn's Roche limit, and comet Shoemaker–Levy 9 was shredded passing inside Jupiter's in 1992.

**Worked example — How close could the Moon come to Earth?** $`R_\oplus = 6\thinspace 371`$ km, $`\rho_\oplus = 5\thinspace 513`$ kg/m³, $`\rho_{Moon} = 3\thinspace 344`$ kg/m³. Fluid (rubble-pile) limit:

$$
d_{fluid} = 2.44 \times 6\thinspace 371~\text{km}\times\left(\frac{5\thinspace 513}{3\thinspace 344}\right)^{1/3}
$$

**Result: 18,364 km** — about 18 400 km (rigid-body limit 9 490 km). Today the Moon is 21 times farther away.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#roche-limit) · Sources: [Wikipedia — Roche limit](https://en.wikipedia.org/wiki/Roche_limit)

<a id="l1-distance"></a>

### 1.13 L1 / L2 Lagrange-point distance

*Collinear Lagrange points (small mass ratio)*

$$
r_{L1} \approx r_{L2} \approx R\thinspace \sqrt[3]{\frac{m}{3M}}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`r_{L1}`$ | Distance of L1 (or L2) from the smaller body | m |
| $`R`$ | Separation of the two bodies | m |
| $`m, M`$ | Smaller and larger mass ($`m \ll M`$) | kg |

**What it means.** L1 and L2 are the two points on the line through a star and planet where a spacecraft can orbit the star in lock-step with the planet: gravity and the rotating frame's centrifugal effect balance. For a small mass ratio both sit about one Hill radius from the planet. The Solar and Heliospheric Observatory (SOHO) watches the Sun from Sun–Earth L1; the James Webb Space Telescope (JWST) hides from it at L2.

**Worked example — How far away is JWST's home, Sun–Earth L2?** $`R = 1`$ AU $`= 1.496\times10^{8}`$ km, $`m/M = 3.00\times10^{-6}`$.

$$
r_{L2} \approx 1.496\times10^{8}~\text{km}\times\sqrt[3]{\frac{3.00\times10^{-6}}{3}}
$$

**Result: 1.497 × 10⁶ km** — about 1.5 million km — four times farther than the Moon. (The approximation errs by about 1 % here.)

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#l1-distance) · Sources: [NASA Science — What is a Lagrange Point?](https://science.nasa.gov/resource/what-is-a-lagrange-point/) · [Wikipedia — Lagrange point](https://en.wikipedia.org/wiki/Lagrange_point)

---

<a id="ch-rockets"></a>

## 2. Rockets

A rocket is a machine for throwing mass backwards very fast. These equations say how much speed that buys, why we build rockets in stages, and what the atmosphere and gravity take back on the way up.

<a id="tsiolkovsky"></a>

### 2.1 Tsiolkovsky rocket equation

*Ideal rocket equation*

$$
\Delta v = I_{sp}\thinspace g_0\thinspace \ln\frac{m_0}{m_f} = v_e\ln\frac{m_0}{m_f}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\Delta v`$ | Change in velocity the rocket can achieve (no gravity or drag) | m/s |
| $`I_{sp}`$ | Specific impulse of the engine | s |
| $`g_0`$ | Standard gravity, 9.806 65 m/s² | m/s² |
| $`v_e`$ | Effective exhaust velocity, $`I_{sp}g_0`$ | m/s |
| $`m_0, m_f`$ | Initial (fuelled) and final (empty) mass | kg |

**What it means.** Konstantin Tsiolkovsky published this in 1903 and it rules all of rocketry. Because each kilogram of propellant must also accelerate the propellant still on board, Δv grows only with the logarithm of the mass ratio. Doubling Δv means squaring the mass ratio — the 'tyranny of the rocket equation'.

**Worked example — A hydrogen–oxygen stage with a mass ratio of 4** An RS-25-class engine in vacuum ($`I_{sp} = 452`$ s) on a stage that is 75 % propellant ($`m_0/m_f = 4`$).

$$
\Delta v = 452 \times 9.80665 \times \ln 4
$$

**Result: 6.145 km/s** — about two-thirds of what it takes to reach low Earth orbit (≈ 9.4 km/s including losses).

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#tsiolkovsky) · Sources: [NASA Glenn Research Center — Ideal Rocket Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/ideal-rocket-equation/) · [Wikipedia — Tsiolkovsky rocket equation](https://en.wikipedia.org/wiki/Tsiolkovsky_rocket_equation)

<a id="thrust-equation"></a>

### 2.2 Rocket thrust equation

*Momentum thrust + pressure thrust*

$$
F = \dot m\thinspace v_e + (p_e - p_a)\thinspace A_e
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`F`$ | Thrust | N |
| $`\dot m`$ | Propellant mass flow rate | kg/s |
| $`v_e`$ | Exhaust velocity at the nozzle exit | m/s |
| $`p_e, p_a`$ | Exhaust pressure at the nozzle exit, and ambient pressure | Pa |
| $`A_e`$ | Nozzle exit area | m² |

**What it means.** Thrust has two parts. The big one is momentum: mass thrown back each second times its speed. The second is a pressure imbalance across the nozzle exit. At sea level the air pushes back on an engine designed for altitude ($`p_a > p_e`$), so the same engine gains thrust as it climbs into thinner air.

**Worked example — An F-1-class engine at sea level (illustrative round numbers)** $`\dot m = 2\thinspace 580`$ kg/s, $`v_e = 2\thinspace 750`$ m/s, $`p_e = 70`$ kPa, $`p_a = 101.3`$ kPa, $`A_e = 10.8`$ m².

$$
F = 2\thinspace 580\times2\thinspace 750 + (70\thinspace 000 - 101\thinspace 325)\times10.8
$$

**Result: 6,757 kN** — about 6.76 MN; the pressure term costs 338 kN at sea level and becomes a bonus of 756 kN in vacuum. (The real F-1 made about 6.77 MN at sea level.)

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#thrust-equation) · Sources: [NASA Glenn Research Center — Rocket Thrust Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/rocket-thrust-equation/)

<a id="specific-impulse"></a>

### 2.3 Specific impulse and effective exhaust velocity

*Engine efficiency*

$$
I_{sp} = \frac{F}{\dot m\thinspace g_0},\qquad v_e = I_{sp}\thinspace g_0
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`I_{sp}`$ | Specific impulse: seconds a unit weight of propellant can produce thrust equal to its weight | s |
| $`F`$ | Thrust | N |
| $`\dot m`$ | Propellant mass flow rate | kg/s |
| $`g_0`$ | Standard gravity (a unit convention, not local gravity) | m/s² |
| $`v_e`$ | Effective exhaust velocity | m/s |

**What it means.** Specific impulse is the 'miles per gallon' of a rocket engine: thrust per unit of propellant flow. Multiply by $`g_0`$ and you get the effective exhaust velocity that goes straight into the rocket equation. Chemical engines top out near 450 s; electric thrusters reach thousands of seconds but with tiny thrust.

**Worked example — The Space Shuttle Main Engine (RS-25) in vacuum** Thrust about $`2\thinspace 279`$ kN with a propellant flow of about $`514`$ kg/s.

$$
I_{sp} = \frac{2.279\times10^{6}}{514\times9.80665}
$$

**Result: 452.1 s** — matching the published ≈ 452 s; exhaust velocity ≈ 4.43 km/s.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#specific-impulse) · Sources: [NASA Glenn Research Center — Specific Impulse](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/specific-impulse/) · [Wikipedia — Specific impulse](https://en.wikipedia.org/wiki/Specific_impulse)

<a id="mass-ratio"></a>

### 2.4 Mass ratio and propellant fraction

*How much of a rocket is fuel*

$$
R = \frac{m_0}{m_f},\qquad \zeta = \frac{m_p}{m_0} = 1 - \frac{1}{R}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`R`$ | Mass ratio | — |
| $`m_0`$ | Initial mass, $`m_p + m_f`$ | kg |
| $`m_f`$ | Final mass: structure, engines, upper stages and payload | kg |
| $`m_p`$ | Propellant burned | kg |
| $`\zeta`$ | Propellant (mass) fraction | — |

**What it means.** Two ways to say the same thing. The mass ratio goes into the logarithm of the rocket equation; the propellant fraction says how much of the vehicle is fuel. Orbital rockets are over 85 % propellant at liftoff — proportionally less 'container' than an egg's shell.

**Worked example — The Saturn V first-stage (S-IC) burn** S-IC propellant ≈ 2 077 t. Everything left at burnout — the empty S-IC (137 t) plus the fuelled upper stages and Apollo spacecraft — ≈ 771 t.

$$
R = \frac{2\thinspace 077 + 771}{771}
$$

**Result: 3.694 ** — so ζ ≈ 72.9 % of the whole stack was burned in the first 2½ minutes.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#mass-ratio) · Sources: [NASA Glenn Research Center — Mass Ratios](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/mass-ratios/) · [Wikipedia — S-IC](https://en.wikipedia.org/wiki/S-IC)

<a id="multistage"></a>

### 2.5 Multi-stage Δv

*Staging*

$$
\Delta v_{total} = \sum_{i=1}^{n} I_{sp,i}\thinspace g_0\thinspace \ln\frac{m_{0,i}}{m_{f,i}}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\Delta v_{total}`$ | Ideal velocity change of the whole vehicle | m/s |
| $`I_{sp,i}`$ | Specific impulse of stage $`i`$ | s |
| $`m_{0,i}`$ | Mass when stage $`i`$ ignites (it and everything above it) | kg |
| $`m_{f,i}`$ | Mass when stage $`i`$ burns out, $`m_{0,i} - m_{p,i}`$ | kg |

**What it means.** Staging beats the rocket equation by throwing away empty tanks and heavy engines as soon as they stop being useful. Each stage runs the rocket equation on a lighter vehicle, and the Δv values simply add. That is why every orbital launcher so far has used at least two stages.

**Worked example — Saturn V: pad to the Moon** Payload (Apollo spacecraft) 43.5 t. S-IC: 2 077 t propellant, 137 t dry, $`I_{sp}\approx 283`$ s averaged over the climb. S-II: 427 t / 43 t, 424 s. S-IVB: 105.3 t / 15.2 t, 424 s (rounded published figures).

$$
\Delta v = 283g_0\ln\tfrac{2848}{771} + 424g_0\ln\tfrac{634}{207} + 424g_0\ln\tfrac{164}{58.7}
$$

**Result: 12.55 km/s** — ideal (3.63 + 4.65 + 4.27 km/s): enough for ≈ 9.4 km/s to orbit including gravity and drag losses, plus ≈ 3.1 km/s for trans-lunar injection.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#multistage) · Sources: [Wikipedia — Saturn V](https://en.wikipedia.org/wiki/Saturn_V) · [Wikipedia — Multistage rocket](https://en.wikipedia.org/wiki/Multistage_rocket)

<a id="drag"></a>

### 2.6 Drag equation

*Aerodynamic drag force*

$$
D = \tfrac12\thinspace \rho\thinspace v^2\thinspace C_D\thinspace A
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`D`$ | Drag force opposing motion through the air | N |
| $`\rho`$ | Air density | kg/m³ |
| $`v`$ | Speed relative to the air | m/s |
| $`C_D`$ | Drag coefficient (shape; varies with Mach number) | — |
| $`A`$ | Reference (frontal) area | m² |

**What it means.** Drag grows with the square of speed and in direct proportion to air density. Launch vehicles are slim and pointed to keep $`C_D A`$ small and climb out of the dense lower air before going fast. Capsules do the opposite on the way home: blunt, high-drag shapes that shed speed high up.

**Worked example — A 3.66 m-diameter rocket at 10 km altitude** Air density at 10 km $`\rho = 0.4135`$ kg/m³ (U.S. Standard Atmosphere 1976), $`v = 500`$ m/s, $`C_D = 0.3`$ (illustrative), $`A = \pi(1.83)^2 = 10.52`$ m².

$$
D = \tfrac12\times0.4135\times500^2\times0.3\times10.52
$$

**Result: 163.1 kN** — about 16.6 tonnes-force pushing back on the vehicle.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#drag) · Sources: [NASA Glenn Research Center — Drag Equation](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/drag-equation/)

<a id="dynamic-pressure"></a>

### 2.7 Dynamic pressure and Max-Q

*Max Q*

$$
q = \tfrac12\thinspace \rho(h)\thinspace v^2,\qquad \rho(h) \approx \rho_0\thinspace e^{-h/H}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`q`$ | Dynamic pressure: the kinetic energy per unit volume of the oncoming air | Pa |
| $`\rho_0`$ | Sea-level air density, 1.225 kg/m³ | kg/m³ |
| $`H`$ | Density scale height, here 8.5 km (simple exponential model) | m |
| $`h, v`$ | Altitude and airspeed | m, m/s |

**What it means.** During launch the rocket speeds up while the air thins out, so $`q`$ rises, peaks and falls. That peak is 'Max-Q', the moment of greatest aerodynamic stress, typically about a minute after liftoff at 10–14 km. Many rockets throttle down through it — a 'throttle bucket'.

**Worked example — A typical Max-Q** Altitude $`h = 11`$ km, speed $`v = 420`$ m/s, exponential atmosphere.

$$
q = \tfrac12\times\left(1.225\thinspace e^{-11/8.5}\right)\times420^2
$$

**Result: 29.62 kPa** — about 30 kPa, the same order as the Space Shuttle's Max-Q of ≈ 35 kPa.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#dynamic-pressure) · Sources: [NASA Glenn Research Center — Dynamic Pressure](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/dynamic-pressure-2/) · [Wikipedia — Max q](https://en.wikipedia.org/wiki/Max_q)

<a id="gravity-loss"></a>

### 2.8 Gravity loss

*Gravity drag*

$$
\Delta v_g = \int_0^{t_b} g\thinspace \sin\gamma\thickspace dt \thickspace \approx\thickspace g\thinspace t_b\thinspace \overline{\sin\gamma}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\Delta v_g`$ | Velocity lost to gravity during the burn | m/s |
| $`g`$ | Local gravitational acceleration | m/s² |
| $`t_b`$ | Burn time | s |
| $`\gamma`$ | Flight-path angle above the horizon ($`90^\circ`$ = straight up) | rad |

**What it means.** Every second a rocket spends climbing, gravity steals $`g\sin\gamma`$ metres per second of the velocity its engines produce. Burning faster (a higher thrust-to-weight ratio) and pitching over towards horizontal sooner both cut the loss — but pitching over too early means more drag in dense air. Real launches lose roughly 1–1.5 km/s this way.

**Worked example — A first-stage burn** 150 s burn at $`g = 9.81`$ m/s² with an average flight-path angle of 50°.

$$
\Delta v_g \approx 9.80665\times150\times\sin 50^\circ
$$

**Result: 1,127 m/s** — over a kilometre per second that the engines had to supply but that never became speed.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#gravity-loss) · Sources: [Wikipedia — Gravity drag](https://en.wikipedia.org/wiki/Gravity_drag) · [R. A. Braeunig — Rocket & Space Technology: Orbital Mechanics](http://www.braeunig.us/space/orbmech.htm)

---

<a id="ch-atmosphere"></a>

## 3. Atmosphere & Re-entry

Air thins exponentially with height, sound has a speed limit, and a capsule coming home at 11 km/s turns its kinetic energy into a shock layer hotter than the surface of the Sun.

<a id="barometric"></a>

### 3.1 Barometric formula and scale height

*Isothermal atmosphere*

$$
p(h) = p_0\thinspace e^{-h/H},\qquad H = \frac{R\thinspace T}{\mathcal{M}\thinspace g}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`p, p_0`$ | Pressure at height $`h`$ and at the surface | Pa |
| $`H`$ | Scale height: climb by $`H`$ and pressure falls by a factor $`e \approx 2.718`$ | m |
| $`R`$ | Molar gas constant, 8.314 J mol⁻¹ K⁻¹ | J/(mol·K) |
| $`T`$ | Temperature (assumed constant with height) | K |
| $`\mathcal{M}`$ | Molar mass of the gas | kg/mol |
| $`g`$ | Surface gravity | m/s² |

**What it means.** Each layer of air is squashed by the weight of all the air above it, which makes pressure fall off exponentially. A warm atmosphere of light gas on a low-gravity world is puffy (large $`H`$); a cold, heavy one on a massive planet hugs the ground. Earth's scale height is about 8 km.

**Worked example — Air pressure on the summit of Everest** $`h = 8\thinspace 849`$ m, $`T = 288`$ K, dry air $`\mathcal M = 0.02896`$ kg/mol, $`p_0 = 101.3`$ kPa.

$$
H = \frac{8.314\times288.15}{0.02896\times9.807} = 8.43~\text{km},\quad p = 101.3\thinspace e^{-8.849/8.43}
$$

**Result: 35.49 kPa** — about a third of sea-level pressure (measured ≈ 34 kPa — the real atmosphere is colder aloft).

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#barometric) · Sources: [Wikipedia — Scale height](https://en.wikipedia.org/wiki/Scale_height) · [Wikipedia — Barometric formula](https://en.wikipedia.org/wiki/Barometric_formula)

<a id="speed-of-sound"></a>

### 3.2 Speed of sound and Mach number

*Acoustic speed in an ideal gas*

$$
a = \sqrt{\frac{\gamma\thinspace R\thinspace T}{\mathcal{M}}},\qquad M = \frac{v}{a}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`a`$ | Speed of sound | m/s |
| $`\gamma`$ | Ratio of specific heats (1.40 for air, ≈ 1.29 for CO₂) | — |
| $`R`$ | Molar gas constant | J/(mol·K) |
| $`T`$ | Absolute temperature | K |
| $`\mathcal{M}`$ | Molar mass | kg/mol |
| $`M`$ | Mach number, speed as a multiple of $`a`$ | — |

**What it means.** Sound is a pressure wave carried by molecules bumping into each other, so it travels at roughly the speed of those molecules — which depends only on temperature and molecular mass, not on pressure. Above Mach 1 the air ahead cannot 'hear' you coming, and shock waves form.

**Worked example — Concorde at cruise** In the stratosphere $`T = 216.65`$ K. Concorde cruised near $`v = 600`$ m/s.

$$
a = \sqrt{\frac{1.4\times8.314\times216.65}{0.02896}} = 295~\text{m/s},\qquad M = \frac{600}{295}
$$

**Result: 2.033 ** — Mach 2 — twice the local speed of sound.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#speed-of-sound) · Sources: [NASA Glenn Research Center — Speed of Sound](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/speed-of-sound-interactive/) · [NASA Glenn Research Center — Role of the Mach Number](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/role-of-the-mach-number/)

<a id="stagnation-temperature"></a>

### 3.3 Stagnation temperature

*Total temperature*

$$
T_0 = T\left(1 + \frac{\gamma-1}{2}\thinspace M^2\right)
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`T_0`$ | Stagnation (total) temperature: air brought to rest against the vehicle | K |
| $`T`$ | Static temperature of the free air | K |
| $`\gamma`$ | Ratio of specific heats | — |
| $`M`$ | Mach number | — |

**What it means.** When fast-moving air is slowed to a stop on a nose or leading edge, its kinetic energy turns back into heat. The temperature rise grows with the square of the Mach number, which is why supersonic aircraft need heat-resistant skins. For true re-entry speeds the formula over-predicts, because the air molecules break apart and absorb energy.

**Worked example — The SR-71 Blackbird at Mach 3.2** Stratospheric air $`T = 216.65`$ K, $`\gamma = 1.4`$.

$$
T_0 = 216.65\left(1 + 0.2\times3.2^2\right)
$$

**Result: 660.3 K** — about 387 °C — the aircraft's titanium skin got hot enough to stretch in flight.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#stagnation-temperature) · Sources: [NASA Glenn Research Center — Stagnation Temperature](https://www.grc.nasa.gov/www/BGH/stagtmp.html) · [NASA Glenn Research Center — Isentropic Flow Equations](https://www.grc.nasa.gov/www/k-12/airplane/isentrop.html)

<a id="sutton-graves"></a>

### 3.4 Sutton–Graves stagnation-point heat flux

*Convective heating correlation*

$$
\dot q_s = k\thinspace \sqrt{\frac{\rho}{R_n}}\thickspace v^3
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\dot q_s`$ | Convective heat flux at the stagnation point (the nose) | W/m² |
| $`k`$ | Atmosphere constant: $`1.7415\times10^{-4}`$ for Earth, $`1.9027\times10^{-4}`$ for Mars | kg^½ m⁻¹ |
| $`\rho`$ | Free-stream air density | kg/m³ |
| $`R_n`$ | Nose radius of the vehicle | m |
| $`v`$ | Entry speed | m/s |

**What it means.** Kenneth Sutton and Randolph Graves (NASA Langley, 1971) fitted this to detailed boundary-layer calculations. Heating grows with the cube of speed, so a lunar return at 11 km/s heats the nose about 3.4 times as hard as a return from orbit at 7.5 km/s. It also explains the blunt-body idea: a bigger nose radius means less heat flux, which is why capsules are wide and rounded, not pointed.

**Worked example — An Apollo-style lunar return** At about 60 km altitude $`\rho = 3.1\times10^{-4}`$ kg/m³, speed 11 km/s, heat-shield radius of curvature $`R_n = 4.69`$ m.

$$
\dot q_s = 1.7415\times10^{-4}\sqrt{\frac{3.1\times10^{-4}}{4.69}}\thickspace (11\thinspace 000)^3
$$

**Result: 188.4 W/cm²** — about 1.9 MW per square metre from convection alone (at lunar-return speeds, radiation from the hot shock layer adds more).

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#sutton-graves) · Sources: [Sutton & Graves (1971), NASA TR R-376 (NASA Technical Reports Server)](https://ntrs.nasa.gov/api/citations/19720003329/downloads/19720003329.pdf) · [Wikipedia — Planar reentry equations](https://en.wikipedia.org/wiki/Planar_reentry_equations)

<a id="ballistic-coefficient"></a>

### 3.5 Ballistic coefficient

*Mass per unit drag area*

$$
\beta = \frac{m}{C_D\thinspace A},\qquad a_{drag} = \frac{\rho\thinspace v^2}{2\thinspace \beta}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\beta`$ | Ballistic coefficient | kg/m² |
| $`m`$ | Vehicle mass | kg |
| $`C_D, A`$ | Drag coefficient and reference area | —, m² |
| $`a_{drag}`$ | Deceleration caused by drag | m/s² |
| $`\rho, v`$ | Air density and speed | kg/m³, m/s |

**What it means.** One number that says how easily the atmosphere slows a falling object. Low $`\beta`$ (light and draggy: a capsule, a parachute) decelerates high in thin air where heating is gentler; high $`\beta`$ (dense and slim: a meteorite, a warhead) punches deep before slowing. Entry, descent and landing designers juggle it against heat-shield mass.

**Worked example — The Apollo command module** Entry mass ≈ 5 560 kg, diameter 3.9 m ($`A = 11.95`$ m²), $`C_D \approx 1.3`$ (illustrative).

$$
\beta = \frac{5\thinspace 560}{1.3\times11.95}
$$

**Result: 358 kg/m²** — kg/m²; at 60 km and 11 km/s that means about 5.3 g of deceleration.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#ballistic-coefficient) · Sources: [Wikipedia — Ballistic coefficient](https://en.wikipedia.org/wiki/Ballistic_coefficient) · [Wikipedia — Planar reentry equations](https://en.wikipedia.org/wiki/Planar_reentry_equations)

---

<a id="ch-light"></a>

## 4. Light & Stars

Almost everything we know about stars arrives as light. Temperature sets the colour, size and temperature set the power, distance dims it, and motion shifts it.

<a id="stefan-boltzmann"></a>

### 4.1 Stefan–Boltzmann law

*Luminosity of a blackbody sphere*

$$
L = 4\pi R^2\thinspace \sigma\thinspace T^4
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`L`$ | Luminosity: total power radiated | W |
| $`R`$ | Radius of the star | m |
| $`\sigma`$ | Stefan–Boltzmann constant | W m⁻² K⁻⁴ |
| $`T`$ | Effective surface temperature | K |

**What it means.** Each square metre of a hot surface radiates $`\sigma T^4`$ watts, so doubling the temperature multiplies the power by sixteen. Multiply by the surface area of a sphere and you have a star's total output. This is how astronomers estimate the sizes of stars they can never resolve: measure $`L`$ and $`T`$, solve for $`R`$.

**Worked example — The Sun's power output** IAU nominal values: $`R_\odot = 6.957\times10^{8}`$ m, $`T_{eff} = 5\thinspace 772`$ K.

$$
L = 4\pi\thinspace (6.957\times10^{8})^2\thinspace (5.670\times10^{-8})\thinspace (5\thinspace 772)^4
$$

**Result: 3.828 × 10²⁶ W** — watts — the IAU nominal solar luminosity.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#stefan-boltzmann) · Sources: [OpenStax University Physics III §6.2 — Blackbody Radiation (LibreTexts)](https://phys.libretexts.org/Bookshelves/University_Physics/University_Physics_(OpenStax)/University_Physics_III_-_Optics_and_Modern_Physics_(OpenStax)/06:_Photons_and_Matter_Waves/6.02:_Blackbody_Radiation) · [Prša et al. — IAU 2015 Resolution B3 (nominal solar & planetary constants)](https://arxiv.org/abs/1510.07674)

<a id="wien"></a>

### 4.2 Wien's displacement law

*Peak wavelength of a blackbody*

$$
\lambda_{max} = \frac{b}{T}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\lambda_{max}`$ | Wavelength at which the blackbody spectrum peaks | m |
| $`b`$ | Wien's displacement constant, $`2.898\times10^{-3}`$ m·K | m·K |
| $`T`$ | Temperature | K |

**What it means.** Hotter objects glow at shorter wavelengths. A stove ring goes from dull red to orange as it heats; stars run from red (cool) through yellow and white to blue (hot). One division gives a star's temperature from its colour, a person's glow in the thermal infrared, or the microwave peak of the Big Bang's afterglow.

**Worked example — Where does sunlight peak?** Sun's effective temperature $`T = 5\thinspace 772`$ K.

$$
\lambda_{max} = \frac{2.8978\times10^{-3}}{5\thinspace 772}
$$

**Result: 502 nm** — nm — blue-green, right in the middle of the band our eyes evolved to see.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#wien) · Sources: [OpenStax University Physics III §6.2 — Blackbody Radiation (LibreTexts)](https://phys.libretexts.org/Bookshelves/University_Physics/University_Physics_(OpenStax)/University_Physics_III_-_Optics_and_Modern_Physics_(OpenStax)/06:_Photons_and_Matter_Waves/6.02:_Blackbody_Radiation) · [Wikipedia — Wien's displacement law](https://en.wikipedia.org/wiki/Wien%27s_displacement_law)

<a id="planck"></a>

### 4.3 Planck's law

*Blackbody spectral radiance*

$$
B_\lambda(\lambda, T) = \frac{2hc^2}{\lambda^5}\thickspace \frac{1}{e^{hc/(\lambda k_B T)} - 1}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`B_\lambda`$ | Spectral radiance: power per area, per solid angle, per wavelength | W sr⁻¹ m⁻³ |
| $`\lambda`$ | Wavelength | m |
| $`T`$ | Temperature | K |
| $`h, c, k_B`$ | Planck constant, speed of light, Boltzmann constant | — |

**What it means.** Max Planck's 1900 formula for the full spectrum of a hot object — the first equation of quantum physics. It assumes light is emitted in packets of energy $`hc/\lambda`$, which suppresses the short-wavelength end and cured the 'ultraviolet catastrophe'. Integrate it and you get the Stefan–Boltzmann law; find its peak and you get Wien's law.

**Worked example — The Sun's spectrum at 500 nm** $`T = 5\thinspace 772`$ K, $`\lambda = 500`$ nm. The exponent is $`hc/\lambda k_B T = 4.985`$.

$$
B_\lambda = \frac{2(6.626\times10^{-34})(2.998\times10^{8})^2}{(5\times10^{-7})^5}\cdot\frac{1}{e^{4.985}-1}
$$

**Result: 26.24 kW sr⁻¹ m⁻² nm⁻¹** — kW per square metre per steradian per nanometre, near the top of the curve.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#planck) · Sources: [OpenStax University Physics III §6.2 — Blackbody Radiation (LibreTexts)](https://phys.libretexts.org/Bookshelves/University_Physics/University_Physics_(OpenStax)/University_Physics_III_-_Optics_and_Modern_Physics_(OpenStax)/06:_Photons_and_Matter_Waves/6.02:_Blackbody_Radiation) · [Wikipedia — Planck's law](https://en.wikipedia.org/wiki/Planck%27s_law)

<a id="inverse-square"></a>

### 4.4 Inverse-square law of flux

*Solar constant; insolation*

$$
F = \frac{L}{4\pi d^2}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`F`$ | Flux: power per unit area arriving at distance $`d`$ | W/m² |
| $`L`$ | Luminosity of the source | W |
| $`d`$ | Distance from the source | m |

**What it means.** A star's light spreads over an ever-larger sphere, whose area grows as $`d^2`$. Twice as far, a quarter of the light. This sets the solar power available to spacecraft (why missions beyond Jupiter use nuclear power), the temperature of planets, and — with a known luminosity — the distance to a star.

**Worked example — The solar constant at Earth** $`L_\odot = 3.828\times10^{26}`$ W, $`d = 1`$ AU $`= 1.496\times10^{11}`$ m.

$$
F = \frac{3.828\times10^{26}}{4\pi\thinspace (1.496\times10^{11})^2}
$$

**Result: 1,361 W/m²** — W/m² — what satellites measure above the atmosphere (≈ 1 361 W/m²).

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#inverse-square) · Sources: [Wikipedia — Inverse-square law](https://en.wikipedia.org/wiki/Inverse-square_law) · [Prša et al. — IAU 2015 Resolution B3 (nominal solar & planetary constants)](https://arxiv.org/abs/1510.07674)

<a id="magnitude"></a>

### 4.5 Apparent magnitude and distance modulus

*Pogson's magnitude scale*

$$
m_1 - m_2 = -2.5\log_{10}\frac{F_1}{F_2},\qquad m - M = 5\log_{10}\frac{d}{10~\text{pc}}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`m`$ | Apparent magnitude (how bright it looks; smaller is brighter) | mag |
| $`M`$ | Absolute magnitude (how bright it would look from 10 parsecs) | mag |
| $`F_1/F_2`$ | Ratio of measured fluxes | — |
| $`d`$ | Distance | pc |

**What it means.** Astronomers still use the ancient Greek scale, made precise by Norman Pogson in 1856: 5 magnitudes is exactly a factor of 100 in brightness, and bigger numbers are fainter. The distance modulus $`m - M`$ is the inverse-square law in magnitude form: compare how bright a star looks with how bright it really is, and you get its distance.

**Worked example — How bright is the Sun in our sky?** Sun: $`M = 4.83`$. Distance 1 AU $`= 4.848\times10^{-6}`$ pc.

$$
m = 4.83 + 5\log_{10}\frac{4.848\times10^{-6}}{10}
$$

**Result: −26.74 mag** — about 13 billion times brighter than Sirius (m = −1.46).

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#magnitude) · Sources: [OpenStax Astronomy 2e §17.4 — Using spectra to measure stellar radius, composition, and motion](https://openstax.org/books/astronomy-2e/pages/17-4-using-spectra-to-measure-stellar-radius-composition-and-motion) · [Wikipedia — Distance modulus](https://en.wikipedia.org/wiki/Distance_modulus)

<a id="doppler"></a>

### 4.6 Doppler shift

*Relativistic Doppler effect (radial)*

$$
1 + z = \frac{\lambda_{obs}}{\lambda_{emit}} = \sqrt{\frac{1+\beta}{1-\beta}} \thickspace \approx\thickspace 1 + \frac{v}{c}\quad(v \ll c)
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`z`$ | Redshift (negative means blueshift) | — |
| $`\lambda_{obs}, \lambda_{emit}`$ | Observed and emitted wavelength | m |
| $`\beta = v/c`$ | Radial speed as a fraction of light speed (positive = receding) | — |

**What it means.** Light from a source moving away is stretched to longer, redder wavelengths; from one approaching, squeezed bluer. Measuring the shift of known spectral lines gives a star's speed towards or away from us. Tiny periodic shifts of a few metres per second revealed the first exoplanet around a Sun-like star, 51 Pegasi b, in 1995.

**Worked example — Hydrogen-alpha from a star receding at 30 km/s** Rest wavelength of the H-alpha line: 656.28 nm.

$$
\Delta\lambda \approx \lambda\thinspace \frac{v}{c} = 656.28~\text{nm}\times\frac{30}{299\thinspace 792}
$$

**Result: 0.06568 nm** — nm — a shift of one part in 10 000, easily measured by a spectrograph.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#doppler) · Sources: [OpenStax Astronomy 2e §5.6 — The Doppler Effect](https://openstax.org/books/astronomy-2e/pages/5-6-the-doppler-effect) · [Wikipedia — Relativistic Doppler effect](https://en.wikipedia.org/wiki/Relativistic_Doppler_effect)

<a id="parallax"></a>

### 4.7 Parallax distance

*Definition of the parsec*

$$
d~[\text{pc}] = \frac{1}{p~[\text{arcsec}]}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`d`$ | Distance to the star | pc |
| $`p`$ | Parallax angle: half the star's apparent shift over a year | arcsec |

**What it means.** As Earth circles the Sun, nearby stars appear to shift back and forth against distant ones. The bigger the wobble, the closer the star. A star with a parallax of one arcsecond is one parsec away (3.26 light-years) — that is the definition of the parsec. The European Space Agency's (ESA) Gaia mission has measured parallaxes of more than a billion stars.

**Worked example — Distance to Proxima Centauri, our nearest star** Gaia Data Release 3 (DR3) parallax: $`p = 768.07`$ milliarcseconds.

$$
d = \frac{1}{0.76807}~\text{pc}
$$

**Result: 1.302 pc** — pc = 4.25 light-years = 268 500 AU.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#parallax) · Sources: [ESA — Gaia: Parallax](https://www.esa.int/Science_Exploration/Space_Science/Gaia/Parallax) · [ESA Science & Technology — Measuring stellar distances by parallax](https://sci.esa.int/web/gaia/-/53278-measuring-stellar-distances-by-parallax)

<a id="mass-luminosity"></a>

### 4.8 Mass–luminosity relation

*Main-sequence scaling*

$$
\frac{L}{L_\odot} \approx \begin{cases} 0.23\thinspace (M/M_\odot)^{2.3} & M < 0.43\thinspace M_\odot \cr (M/M_\odot)^{4} & 0.43 \le M/M_\odot < 2 \cr 1.4\thinspace (M/M_\odot)^{3.5} & 2 \le M/M_\odot < 55 \cr 32\thinspace 000\thinspace (M/M_\odot) & M \ge 55\thinspace M_\odot\end{cases}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`L/L_\odot`$ | Luminosity in units of the Sun's | — |
| $`M/M_\odot`$ | Mass in units of the Sun's | — |
| $`t`$ | Main-sequence lifetime, $`t \approx 10^{10}\thinspace \text{yr}\times(M/M_\odot)/(L/L_\odot)`$ | yr |

**What it means.** For stars fusing hydrogen in their cores (the main sequence), luminosity climbs steeply with mass: a star twice the Sun's mass is about sixteen times brighter. Since fuel only grows in proportion to mass, massive stars burn out in a few million years while red dwarfs will shine for trillions. This is an empirical fit, good to tens of per cent.

**Worked example — Alpha Centauri A** Mass $`M = 1.1\thinspace M_\odot`$ (in the $`M^4`$ range).

$$
L \approx 1.1^{4}\thinspace L_\odot
$$

**Result: 1.464 L☉** — L☉, close to the measured ≈ 1.5 L☉, with a main-sequence life of about 7.5 billion years.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#mass-luminosity) · Sources: [OpenStax Astronomy 2e §18.2 — Measuring Stellar Masses](https://openstax.org/books/astronomy-2e/pages/18-2-measuring-stellar-masses) · [Wikipedia — Mass–luminosity relation](https://en.wikipedia.org/wiki/Mass%E2%80%93luminosity_relation)

<a id="eddington"></a>

### 4.9 Eddington luminosity

*Eddington limit*

$$
L_{Edd} = \frac{4\pi\thinspace G\thinspace M\thinspace m_p\thinspace c}{\sigma_T} \approx 1.26\times10^{31}\left(\frac{M}{M_\odot}\right)~\text{W}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`L_{Edd}`$ | Luminosity at which radiation pressure balances gravity | W |
| $`M`$ | Mass of the star or black hole | kg |
| $`m_p`$ | Proton mass | kg |
| $`\sigma_T`$ | Thomson cross-section of the electron | m² |

**What it means.** Light pushes. Shine too brightly and the outward push of photons on electrons (which drag protons with them) beats gravity's pull, blowing gas away. Arthur Eddington derived this ceiling in the 1920s. It caps how bright a star can be and how fast a black hole can swallow gas — the brightest quasars shine near it.

**Worked example — The Eddington limit of the Sun** $`M = 1\thinspace M_\odot`$.

$$
L_{Edd} = \frac{4\pi(1.327\times10^{20})(1.673\times10^{-27})(2.998\times10^{8})}{6.652\times10^{-29}}
$$

**Result: 1.257 × 10³¹ W** — W ≈ 33 000 L☉. The Sun shines at only 0.003 % of its limit.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#eddington) · Sources: [Wikipedia — Eddington luminosity](https://en.wikipedia.org/wiki/Eddington_luminosity) · [NIST — CODATA 2018 fundamental physical constants](https://physics.nist.gov/cuu/Constants/)

---

<a id="ch-relativity"></a>

## 5. Relativity & Black Holes

Moving clocks run slow, clocks deep in gravity run slower, and enough mass in a small enough space closes off a region of spacetime entirely. Satellite navigation depends on all of it.

<a id="lorentz-factor"></a>

### 5.1 Lorentz factor

*Gamma factor*

$$
\gamma = \frac{1}{\sqrt{1 - v^2/c^2}}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\gamma`$ | Lorentz factor (1 at rest, infinite at light speed) | — |
| $`v`$ | Relative speed | m/s |
| $`c`$ | Speed of light in vacuum, 299 792 458 m/s (exact) | m/s |

**What it means.** The one number behind special relativity: moving clocks tick slow by $`\gamma`$, moving rulers shrink by $`\gamma`$, and kinetic energy is $`(\gamma - 1)mc^2`$. It stays within a whisker of 1 at everyday and even spaceflight speeds, then shoots to infinity as $`v \to c`$ — which is why nothing with mass reaches light speed.

**Worked example — A spaceship at 90 % of light speed** $`v = 0.9\thinspace c`$.

$$
\gamma = \frac{1}{\sqrt{1 - 0.9^2}} = \frac{1}{\sqrt{0.19}}
$$

**Result: 2.294 ** — one year aboard is 2.29 years for the people back home.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#lorentz-factor) · Sources: [Wikipedia — Lorentz factor](https://en.wikipedia.org/wiki/Lorentz_factor)

<a id="time-dilation"></a>

### 5.2 Special-relativistic time dilation

*Moving clocks run slow*

$$
\Delta t = \gamma\thinspace \Delta\tau \quad\Rightarrow\quad \Delta t - \Delta\tau \approx \frac{v^2}{2c^2}\thinspace \Delta t\quad (v \ll c)
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\Delta t`$ | Time elapsed for the stay-at-home observer | s |
| $`\Delta\tau`$ | Proper time elapsed on the moving clock | s |
| $`\gamma`$ | Lorentz factor | — |
| $`v`$ | Speed of the moving clock | m/s |

**What it means.** A clock moving relative to you ticks slower, by the factor $`\gamma`$. At everyday speeds the effect is tiny but real: atomic clocks flown around the world (Hafele and Keating, 1971) and clocks in orbit confirm it. Astronauts come home very slightly younger than they would otherwise be.

**Worked example — Scott Kelly's Year in Space** 340 days aboard the ISS at $`v \approx 7.66`$ km/s (special-relativistic part only; the gravitational effect partly offsets it).

$$
\Delta t - \Delta\tau \approx \frac{(7\thinspace 660)^2}{2\thinspace (2.998\times10^{8})^2}\times340\times86\thinspace 400~\text{s}
$$

**Result: 9.589 ms** — about 9.6 milliseconds younger than his twin, from speed alone.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#time-dilation) · Sources: [Wikipedia — Time dilation](https://en.wikipedia.org/wiki/Time_dilation) · [Ashby (2003), Relativity in the Global Positioning System — Living Reviews in Relativity](https://link.springer.com/article/10.12942/lrr-2003-1)

<a id="mass-energy"></a>

### 5.3 Mass–energy equivalence

*E = mc²*

$$
E = m\thinspace c^2
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`E`$ | Rest energy | J |
| $`m`$ | Mass | kg |
| $`c`$ | Speed of light | m/s |

**What it means.** Albert Einstein's 1905 result: mass is a form of energy, and $`c^2`$ (about $`9\times10^{16}`$) is the exchange rate. Nuclear reactions release energy by converting a small fraction of mass — the Sun turns about 4 million tonnes of mass into sunlight every second, and a fusion reaction converts about 0.7 % of the hydrogen's mass.

**Worked example — The energy in one gram of matter** $`m = 1`$ g $`= 10^{-3}`$ kg.

$$
E = 10^{-3}\times(2.998\times10^{8})^2
$$

**Result: 8.988 × 10¹³ J** — joules ≈ 21.5 kilotons of TNT — more than the Hiroshima bomb (≈ 15 kt).

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#mass-energy) · Sources: [Wikipedia — Mass–energy equivalence](https://en.wikipedia.org/wiki/Mass%E2%80%93energy_equivalence) · [NIST — CODATA 2018 fundamental physical constants](https://physics.nist.gov/cuu/Constants/)

<a id="schwarzschild"></a>

### 5.4 Schwarzschild radius

*Event-horizon radius of a non-rotating black hole*

$$
r_s = \frac{2GM}{c^2}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`r_s`$ | Radius of the event horizon | m |
| $`M`$ | Mass of the black hole | kg |
| $`G, c`$ | Gravitational constant and speed of light | — |

**What it means.** Karl Schwarzschild found this in 1916, weeks after Einstein published general relativity. Squeeze any mass inside this radius and not even light can climb out. It is also the radius at which the Newtonian escape velocity would equal $`c`$. It scales linearly with mass: about 3 km per solar mass.

**Worked example — If the Sun were a black hole** $`GM_\odot = 1.327\times10^{20}`$ m³/s².

$$
r_s = \frac{2\times1.327\times10^{20}}{(2.998\times10^{8})^2}
$$

**Result: 2.953 km** — km — the whole Sun crushed to the size of a small town.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#schwarzschild) · Sources: [A. Hamilton (JILA, University of Colorado) — More about the Schwarzschild geometry](https://jila.colorado.edu/~ajsh/courses/bh/schwp.html) · [Wikipedia — Schwarzschild radius](https://en.wikipedia.org/wiki/Schwarzschild_radius)

<a id="gravitational-time-dilation"></a>

### 5.5 Gravitational time dilation and redshift

*Clocks run slow in a gravity well*

$$
\frac{d\tau}{dt} = \sqrt{1 - \frac{r_s}{r}},\qquad 1 + z = \left(1 - \frac{r_s}{r}\right)^{-1/2}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`d\tau/dt`$ | Rate of a clock at radius $`r`$ compared with one far away | — |
| $`r_s`$ | Schwarzschild radius of the mass, $`2GM/c^2`$ | m |
| $`r`$ | Distance from the centre ($`r > r_s`$) | m |
| $`z`$ | Gravitational redshift of light climbing out to infinity | — |

**What it means.** In general relativity, clocks deeper in a gravitational well tick more slowly, and light climbing out loses energy and reddens. On Earth's surface the effect is about 60 microseconds per day relative to deep space; at a neutron star's surface clocks run 20 % slow; at the event horizon of a black hole they appear to stop.

**Worked example — The surface of a neutron star** $`M = 1.4\thinspace M_\odot`$ ($`r_s = 4.13`$ km), radius $`r = 12`$ km.

$$
1+z = \left(1 - \frac{4.13}{12}\right)^{-1/2}
$$

**Result: 0.2352 ** — so surface clocks run at 81 % of the rate of distant clocks, and X-ray lines arrive 24 % redder.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#gravitational-time-dilation) · Sources: [Wikipedia — Gravitational redshift](https://en.wikipedia.org/wiki/Gravitational_redshift) · [Ashby (2003), Relativity in the Global Positioning System — Living Reviews in Relativity](https://link.springer.com/article/10.12942/lrr-2003-1)

<a id="hawking"></a>

### 5.6 Hawking temperature

*Black-hole evaporation*

$$
T_H = \frac{\hbar\thinspace c^3}{8\pi\thinspace G\thinspace M\thinspace k_B},\qquad t_{evap} \approx \frac{5120\thinspace \pi\thinspace G^2 M^3}{\hbar\thinspace c^4}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`T_H`$ | Temperature of the black hole's thermal radiation | K |
| $`M`$ | Black-hole mass | kg |
| $`\hbar`$ | Reduced Planck constant | J s |
| $`k_B`$ | Boltzmann constant | J/K |
| $`t_{evap}`$ | Time to evaporate completely (photons only, idealised) | s |

**What it means.** Stephen Hawking showed in 1974 that quantum effects make black holes glow faintly, like a blackbody. Bigger black holes are colder: a stellar-mass one is far colder than the 2.7 K cosmic background, so today it absorbs more than it emits. Only tiny black holes would be hot enough to evaporate within the age of the Universe.

**Worked example — A black hole with the mass of the Sun** $`M = 1.989\times10^{30}`$ kg.

$$
T_H = \frac{(1.055\times10^{-34})(2.998\times10^{8})^3}{8\pi\thinspace (6.674\times10^{-11})(1.989\times10^{30})(1.381\times10^{-23})}
$$

**Result: 6.17 × 10⁻⁸ K** — K — sixty billionths of a kelvin, with an evaporation time of about 10⁶⁷ years.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#hawking) · Sources: [Wikipedia — Hawking radiation](https://en.wikipedia.org/wiki/Hawking_radiation) · [NIST — CODATA 2018 fundamental physical constants](https://physics.nist.gov/cuu/Constants/)

<a id="gps-clock"></a>

### 5.7 GPS clock correction

*Why satellite navigation needs relativity*

$$
\begin{aligned}\frac{\Delta f}{f} &\approx \underbrace{\frac{GM_\oplus}{c^2}\left(\frac{1}{R_\oplus} - \frac{1}{r}\right)}_{\text{gravity: faster}} - \underbrace{\frac{v^2}{2c^2}}_{\text{speed: slower}} \cr v &= \sqrt{\frac{GM_\oplus}{r}}\end{aligned}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\Delta f/f`$ | Fractional rate difference, orbiting clock minus ground clock | — |
| $`GM_\oplus`$ | Earth's gravitational parameter | m³/s² |
| $`R_\oplus`$ | Earth's radius (ground clock) | m |
| $`r, v`$ | Orbit radius and orbital speed of the satellite | m, m/s |

**What it means.** Global Positioning System (GPS) clocks sit higher in Earth's gravity well, so general relativity makes them run fast by about 45.7 μs a day; their orbital speed makes them run slow by about 7.2 μs a day. The net is about +38 μs/day. Light travels 11 km in 38 μs, so without correction positions would drift by kilometres every day. The satellite clocks are deliberately tuned slightly slow before launch.

**Worked example — A GPS satellite** Orbit radius $`r = 26\thinspace 562`$ km, ground clock at $`R_\oplus = 6\thinspace 371`$ km.

$$
\begin{aligned}\Delta t_g &= \frac{3.986\times10^{14}}{c^2}\left(\frac{1}{6.371\times10^{6}} - \frac{1}{2.6562\times10^{7}}\right)\times86\thinspace 400~\text{s} \cr \Delta t_v &= -\frac{3.986\times10^{14}}{2c^2\thinspace (2.6562\times10^{7})}\times86\thinspace 400~\text{s}\end{aligned}
$$

**Result: 38.51 μs/day** — μs per day fast (45.72 from gravity − 7.21 from speed), ≈ 11.5 km of ranging error per day if ignored.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#gps-clock) · Sources: [Ashby (2003), Relativity in the Global Positioning System — Living Reviews in Relativity](https://link.springer.com/article/10.12942/lrr-2003-1)

---

<a id="ch-cosmology"></a>

## 6. Cosmology

The Universe is expanding. A few equations connect the redshift of distant galaxies to the size, age, density and temperature of the whole cosmos.

<a id="hubble-lemaitre"></a>

### 6.1 Hubble–Lemaître law

*Recession velocity and the Hubble time*

$$
v = H_0\thinspace d,\qquad t_H = \frac{1}{H_0}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`v`$ | Recession velocity of a galaxy | km/s |
| $`H_0`$ | Hubble constant (expansion rate today) | km s⁻¹ Mpc⁻¹ |
| $`d`$ | Proper distance to the galaxy | Mpc |
| $`t_H`$ | Hubble time: a rough age scale of the Universe | s |

**What it means.** Georges Lemaître (1927) and Edwin Hubble (1929) found that galaxies recede at speeds proportional to their distance — the signature of a uniformly expanding Universe. Early-Universe measurements (Planck: 67.4) and nearby supernova distances (SH0ES: ≈ 73) disagree slightly; that 'Hubble tension' is one of cosmology's open problems.

**Worked example — A galaxy 100 megaparsecs away** Roughly the distance of the Coma Cluster, with $`H_0 = 67.4`$ km/s/Mpc (Planck 2018).

$$
v = 67.4~\tfrac{\text{km/s}}{\text{Mpc}}\times100~\text{Mpc}
$$

**Result: 6,740 km/s** — km/s (z ≈ 0.022); the Hubble time is 14.5 billion years.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#hubble-lemaitre) · Sources: [NASA Science — Hubble Cosmological Redshift](https://science.nasa.gov/mission/hubble/science/science-behind-the-discoveries/hubble-cosmological-redshift/) · [Planck Collaboration (2018), Cosmological parameters](https://arxiv.org/abs/1807.06209)

<a id="redshift-scale-factor"></a>

### 6.2 Cosmological redshift and scale factor

*Stretching of light by expansion*

$$
1 + z = \frac{\lambda_{obs}}{\lambda_{emit}} = \frac{a(t_{obs})}{a(t_{emit})} = \frac{1}{a}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`z`$ | Cosmological redshift | — |
| $`a`$ | Scale factor: size of the Universe then, relative to today ($`a_0 = 1`$) | — |
| $`\lambda_{obs}, \lambda_{emit}`$ | Observed and emitted wavelengths | m |

**What it means.** Cosmological redshift is not a Doppler shift through space: the wavelength of light stretches in step with space itself while it travels. A galaxy at $`z = 10`$ sent its light when every distance in the Universe was 11 times smaller. This is why the James Webb Space Telescope observes in the infrared: the ultraviolet light of the first galaxies arrives stretched.

**Worked example — Galaxy GN-z11** Spectroscopic redshift $`z = 10.60`$. Its hydrogen Lyman-alpha line is emitted at 121.567 nm (ultraviolet).

$$
\lambda_{obs} = (1 + 10.60)\times121.567~\text{nm},\qquad a = \frac{1}{11.60}
$$

**Result: 1,410 nm** — nm (1.41 µm, near-infrared); the Universe was 8.6 % of its present size.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#redshift-scale-factor) · Sources: [NASA Science — What is Cosmological Redshift?](https://science.nasa.gov/asset/hubble/what-is-cosmological-redshift/) · [Wikipedia — Scale factor (cosmology)](https://en.wikipedia.org/wiki/Scale_factor_(cosmology))

<a id="friedmann"></a>

### 6.3 Friedmann equation

*Expansion rate of the Universe*

$$
\begin{aligned} H^2 &= \frac{8\pi G}{3}\rho - \frac{k c^2}{a^2} + \frac{\Lambda c^2}{3} \cr H(z) &= H_0\sqrt{\Omega_r(1+z)^4 + \Omega_m(1+z)^3 + \Omega_k(1+z)^2 + \Omega_\Lambda}\end{aligned}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`H`$ | Hubble parameter, $`\dot a/a`$ | s⁻¹ |
| $`\rho`$ | Density of matter and radiation | kg/m³ |
| $`k`$ | Spatial curvature (0 = flat) | — |
| $`\Lambda`$ | Cosmological constant (dark energy) | m⁻² |
| $`\Omega_r, \Omega_m, \Omega_\Lambda`$ | Today's radiation, matter and dark-energy densities as fractions of critical ($`\Omega_r \approx 9.2\times10^{-5}`$ fixed here) | — |
| $`\Omega_k`$ | Curvature term, $`1 - \Omega_r - \Omega_m - \Omega_\Lambda`$ | — |

**What it means.** Alexander Friedmann derived this from general relativity in 1922. It is the energy budget of the expanding Universe: the expansion rate is set by what the Universe contains. Because radiation dilutes as $`(1+z)^4`$, matter as $`(1+z)^3`$ and dark energy not at all, each dominated in turn — radiation first, then matter, and now dark energy, which is making the expansion speed up.

**Worked example — The expansion rate when the Universe was half its size** $`z = 1`$ with Planck 2018 values $`H_0 = 67.4`$, $`\Omega_m = 0.315`$, $`\Omega_\Lambda = 0.685`$.

$$
H(1) = 67.4\sqrt{9.2\times10^{-5}(2)^4 + 0.315\thinspace (2)^3 + \Omega_k(2)^2 + 0.685}
$$

**Result: 120.7 km/s/Mpc** — km/s/Mpc — the Universe was expanding almost twice as fast (in this sense) 7.9 billion years ago.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#friedmann) · Sources: [Wikipedia — Friedmann equations](https://en.wikipedia.org/wiki/Friedmann_equations) · [Planck Collaboration (2018), Cosmological parameters](https://arxiv.org/abs/1807.06209)

<a id="critical-density"></a>

### 6.4 Critical density

*Density of a flat Universe*

$$
\rho_c = \frac{3H^2}{8\pi G}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`\rho_c`$ | Density that makes the Universe spatially flat | kg/m³ |
| $`H`$ | Hubble parameter | s⁻¹ |
| $`G`$ | Gravitational constant | m³ kg⁻¹ s⁻² |

**What it means.** Set curvature and dark energy to zero in the Friedmann equation and solve for the density: that is the critical density, the dividing line between a Universe that would recollapse and one that expands forever. Cosmologists quote everything as a fraction of it ($`\Omega = \rho/\rho_c`$). Observations say the total is within a fraction of a per cent of 1: space is flat.

**Worked example — Critical density today** $`H_0 = 67.4`$ km/s/Mpc $`= 2.184\times10^{-18}`$ s⁻¹.

$$
\rho_c = \frac{3\thinspace (2.184\times10^{-18})^2}{8\pi\thinspace (6.674\times10^{-11})}
$$

**Result: 8.533 × 10⁻²⁷ kg/m³** — kg/m³ — about 5 hydrogen atoms per cubic metre, emptier than any laboratory vacuum.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#critical-density) · Sources: [Wikipedia — Friedmann equations](https://en.wikipedia.org/wiki/Friedmann_equations) · [Planck Collaboration (2018), Cosmological parameters](https://arxiv.org/abs/1807.06209)

<a id="cmb-temperature"></a>

### 6.5 Temperature of the cosmic microwave background

*CMB temperature scaling*

$$
T(z) = T_0\thinspace (1 + z),\qquad T_0 = 2.72548~\text{K}
$$

| Symbol | Meaning | Unit |
|:--|:--|:--|
| $`T(z)`$ | Temperature of the background radiation at redshift $`z`$ | K |
| $`T_0`$ | Temperature measured today (Fixsen 2009, from COBE/FIRAS) | K |
| $`z`$ | Redshift | — |

**What it means.** The cosmic microwave background (CMB) is light from when the Universe first became transparent. Expansion stretches each photon's wavelength by $`(1+z)`$, and a stretched blackbody stays a blackbody with its temperature divided by $`(1+z)`$. Run it backwards and at $`z \approx 1\thinspace 090`$ the Universe was about 3 000 K — hot enough to keep hydrogen ionised, which is exactly when it cleared.

**Worked example — Temperature at recombination** $`z = 1\thinspace 090`$ (the CMB's last-scattering surface).

$$
T = 2.72548~\text{K}\times(1 + 1\thinspace 090)
$$

**Result: 2,973 K** — K — the glow of a red dwarf's surface, filling all of space.

[Open the live calculator ↗](https://normansrule.github.io/cosmic-library/equations.html#cmb-temperature) · Sources: [Fixsen (2009), The Temperature of the Cosmic Microwave Background](https://arxiv.org/abs/0911.1955) · [Planck Collaboration (2018), Cosmological parameters](https://arxiv.org/abs/1807.06209)

---

<a id="constants"></a>

## Constants

Every calculator uses these values. “Exact” values are definitions of the International System of Units (SI) or of the IAU.

| Symbol | Quantity | Value | Unit | Source |
|:--|:--|--:|:--|:--|
| **Fundamental** | | | | |
| $`G`$ | Newtonian constant of gravitation | 6.674 30 × 10⁻¹¹ | m³ kg⁻¹ s⁻² | CODATA 2018 |
| $`c`$ | Speed of light in vacuum | 299 792 458 | m/s | SI (exact) |
| $`h`$ | Planck constant | 6.626 070 15 × 10⁻³⁴ | J s | SI (exact) |
| $`\hbar`$ | Reduced Planck constant | 1.054 571 817 × 10⁻³⁴ | J s | CODATA 2018 |
| $`k_B`$ | Boltzmann constant | 1.380 649 × 10⁻²³ | J/K | SI (exact) |
| $`\sigma`$ | Stefan–Boltzmann constant | 5.670 374 419 × 10⁻⁸ | W m⁻² K⁻⁴ | CODATA 2018 |
| $`b`$ | Wien wavelength displacement constant | 0.002 897 771 955 | m K | CODATA 2018 |
| $`m_p`$ | Proton mass | 1.672 621 923 69 × 10⁻²⁷ | kg | CODATA 2018 |
| $`\sigma_T`$ | Thomson cross-section | 6.652 458 732 1 × 10⁻²⁹ | m² | CODATA 2018 |
| $`R`$ | Molar gas constant | 8.314 462 618 | J mol⁻¹ K⁻¹ | CODATA 2018 |
| $`g_0`$ | Standard acceleration of gravity | 9.806 65 | m/s² | CGPM 1901 (exact) |
| **Astronomical** | | | | |
| $`\text{au}`$ | Astronomical unit | 149 597 870 700 | m | IAU 2012 B2 (exact) |
| $`\text{pc}`$ | Parsec | 3.085 677 581 491 367 × 10¹⁶ | m | IAU 2015 B2 (exact) |
| $`\text{Mpc}`$ | Megaparsec | 3.085 677 581 491 367 × 10²² | m | 10⁶ pc |
| $`\text{ly}`$ | Light-year | 9.460 730 472 580 8 × 10¹⁵ | m | IAU (Julian year × c) |
| $`\text{yr}`$ | Julian year | 31 557 600 | s | IAU (exact) |
| $`\text{d}`$ | Day | 86 400 | s | SI |
| **Sun & Earth** | | | | |
| $`R_\odot`$ | Nominal solar radius | 695 700 000 | m | IAU 2015 B3 |
| $`L_\odot`$ | Nominal solar luminosity | 3.828 × 10²⁶ | W | IAU 2015 B3 |
| $`T_{\odot}`$ | Nominal solar effective temperature | 5 772 | K | IAU 2015 B3 |
| $`\mu_\odot`$ | Nominal solar mass parameter GM☉ | 1.327 124 4 × 10²⁰ | m³/s² | IAU 2015 B3 |
| $`M_\odot`$ | Solar mass (GM☉ / G) | 1.988 41 × 10³⁰ | kg | derived from IAU 2015 B3 + CODATA 2018 |
| $`R_\oplus`$ | Mean radius of Earth | 6 371 000 | m | IUGG / NASA Earth fact sheet |
| $`R_{\oplus,eq}`$ | Nominal equatorial radius of Earth | 6 378 100 | m | IAU 2015 B3 |
| $`\mu_\oplus`$ | Nominal terrestrial mass parameter GM⊕ | 3.986 004 × 10¹⁴ | m³/s² | IAU 2015 B3 |
| $`M_\oplus`$ | Earth mass (GM⊕ / G) | 5.972 2 × 10²⁴ | kg | derived from IAU 2015 B3 + CODATA 2018 |
| $`M_{\mathrm{Moon}}`$ | Moon mass | 7.346 × 10²² | kg | NASA Moon fact sheet |
| $`a_{\mathrm{Moon}}`$ | Mean Earth–Moon distance | 384 400 000 | m | NASA Moon fact sheet |
| **Cosmology** | | | | |
| $`T_0`$ | CMB temperature today | 2.725 48 | K | Fixsen 2009 |
| $`H_0`$ | Hubble constant (Planck 2018) | 67.4 | km s⁻¹ Mpc⁻¹ | Planck 2018 VI |
| **Conversions** | | | | |
| $`E_{kt}`$ | Kiloton of TNT (conventional) | 4.184 × 10¹² | J | convention |
| $`\text{atm}`$ | Standard atmosphere | 101 325 | Pa | exact |

Sources: [NIST — CODATA 2018 fundamental physical constants](https://physics.nist.gov/cuu/Constants/) · [Prša et al. — IAU 2015 Resolution B3 (nominal solar & planetary constants)](https://arxiv.org/abs/1510.07674) · [Fixsen (2009), The Temperature of the Cosmic Microwave Background](https://arxiv.org/abs/0911.1955) · [Planck Collaboration (2018), Cosmological parameters](https://arxiv.org/abs/1807.06209) · [CODATA 2018 wall chart (NIST PDF)](https://physics.nist.gov/cuu/pdf/wall_2018.pdf)
