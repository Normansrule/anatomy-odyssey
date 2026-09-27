# Credits & licences

Cosmic Codex stands on the work of many people and institutions. This file lists every library, dataset, image source and reference used. Each page's source code also cites its numbers inline.

> Cosmic Codex is an independent educational project. It is **not affiliated with or endorsed by** NASA, the Jet Propulsion Laboratory (JPL), SpaceX, the European Space Agency (ESA), the California Science Center or any other organisation named here. No agency insignia or company logos are used anywhere in this repository.

## Libraries (vendored in `site/vendor/`)

| Library | Version | Licence | Used for |
|---|---|---|---|
| [three.js](https://threejs.org) | r186 | MIT | Every 3D scene; add-ons: OrbitControls, EffectComposer, UnrealBloomPass, OutputPass, FXAAPass, Sky, Line2, CSS2DRenderer, STLLoader, RoomEnvironment, RoundedBoxGeometry, BufferGeometryUtils |
| [GSAP](https://gsap.com) | 3.15 | GSAP Standard "no charge" licence | Camera moves, ScrollTrigger, Flip, ScrambleText |
| [KaTeX](https://katex.org) | 0.18 | MIT | Equation rendering |

Python toolkit: NumPy, SciPy, Matplotlib, Pillow, imageio, pytest (BSD / MIT-style licences). Optional: lightkurve, astropy.

## Shader and algorithm snippets

- Simplex noise (GLSL): Ian McEwan and Stefan Gustavson, Ashima Arts, *webgl-noise* (MIT)
- "Hash without Sine": Dave Hoskins (MIT)
- Hash / value noise: Inigo Quilez (MIT)
- ACES filmic tone-mapping fit: Krzysztof Narkowicz (2015)
- Analytic fit to the CIE colour-matching functions: Wyman, Sloan & Shirley, *JCGT* 2 (2), 2013
- Atmospheric scattering: Nishita et al. (1993); Bruneton & Neyret (2008); Schüler, *GPU Pro 3* (2012)
- Wavelength to RGB: Dan Bruton

## Design references (ideas re-implemented, no code copied)

[Magic UI](https://github.com/magicuidesign/magicui) (MagicCard spotlight, BorderBeam, Meteors, NumberTicker, Marquee) ·
[React Bits](https://github.com/DavidHDev/react-bits) (Aurora, ShinyText, BlurText) ·
[Animate UI](https://animate-ui.com/) ·
[Motion Primitives](https://github.com/ibelick/motion-primitives) ·
[Bruno Simon's folio-2019](https://github.com/brunosimon/folio-2019) ·
[WebGL Fluid Simulation](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation) ·
[llm-viz](https://github.com/bbycroft/llm-viz) ·
[Transformer Explainer](https://github.com/poloclub/transformer-explainer) ·
[God's Eye View](https://github.com/bilawalsidhu/gods-eye-view) ·
[World Monitor](https://github.com/koala73/worldmonitor) ·
[Remotion](https://github.com/remotion-dev/remotion)

## Images

- **NASA** imagery (NASA Image and Video Library, JPL Photojournal, APOD API): generally not subject to copyright in the United States. See the [NASA media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/).
- **ESA/Webb** and **ESA/Hubble** images: [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), credit as given on each image (e.g. "NASA, ESA, CSA, STScI").
- **ESO / Event Horizon Telescope Collaboration** images: CC BY 4.0.
- **ESA/Rosetta/NAVCAM** images: CC BY-SA 3.0 IGO.
- **Wikimedia Commons** files: licence per file page (linked from each gallery entry).
- Gallery images are **hotlinked, not redistributed**; `scripts/fetch_gallery.py` makes a local copy for personal offline use.
- All 3D models, diagrams, textures and renders in this repository are original and procedurally generated.

## Data sources by page

**Saturn V launch.** NASA Marshall Space Flight Center, *Saturn V Launch Vehicle Flight Evaluation Report AS-506, Apollo 11 Mission* (MPR-SAT-FE-69-9, 1969), [archive.org](https://archive.org/details/nasa_techdoc_19900066485) · R. W. Orloff, *Apollo by the Numbers* (NASA SP-2000-4029) · U.S. Standard Atmosphere 1976 (NOAA/NASA/USAF) · This Day in Aviation, "AS-506" · Wikipedia: Saturn V, Apollo 11, Rocketdyne F-1.

**Endeavour.** NASA "Flights of Endeavour (OV-105)" and orbiter reference pages · California Science Center press releases (31 Jan 2024; 24 Jun 2026) · Office of the Governor of California (24 Jun 2026) · NASASpaceFlight.com · Phys.org/AP (ET-94, 2016) · Space.com (Oct 2012) · LAPD "Mission 26" · Exposition Park. Full list with URLs: `site/data/endeavour.json`.

**Black hole.** Luminet (1979), *A&A* 75, 228 · James, von Tunzelmann, Franklin & Thorne (2015), *CQG* 32, 065001 · Shakura & Sunyaev (1973) · Novikov & Thorne (1973) · Page & Thorne (1974) · Synge (1966) · R. Antonelli, "Starless" · EHT Collaboration (2019) Papers I & VI; (2022) Paper I · GRAVITY Collaboration (2022) · Ge et al. (2019), TON 618 · CODATA 2018 · IAU 2015 Resolution B3.

**The Sun.** NASA Sun and Planetary Fact Sheets (NSSDCA) · IAU 2015 Resolution B3 (Prša et al. 2016) · Snodgrass & Ulrich (1990) · Lemen et al. (2012), SDO/AIA · Mitalas & Sills (1992) · Cox (ed.), *Allen's Astrophysical Quantities* (2000) · Baumbach (1937) · Christensen-Dalsgaard et al. (1991) · Asplund et al. (2009) · Bouvier & Wadhwa (2010) · SILSO/SIDC · NOAA Space Weather Prediction Center.

**Solar system.** E. M. Standish, JPL, [*Keplerian Elements for Approximate Positions of the Major Planets*](https://ssd.jpl.nasa.gov/planets/approx_pos.html) · NASA Planetary Fact Sheet (NSSDCA) · *Astronomical Almanac* low-precision Moon · J. Meeus, *Astronomical Algorithms* · Archinal et al. (2018), IAU WGCCRE · Hipparcos galactic rotation matrix (ESA 1997) · JPL Small-Body Database · NASA/JPL Voyager and NASA/JHUAPL New Horizons status pages.

**Orbit Lab.** IERS Conventions 2010 (μ⊕) · IAU 2012 Resolution B2 (AU) · JPL DE430 Earth/Moon mass ratio · Newton, *A Treatise of the System of the World* (1728) · Kepler, *Astronomia Nova* (1609), *Harmonices Mundi* (1619) · Hohmann (1925) · Sternfeld (1934) · Curtis, *Orbital Mechanics for Engineering Students* · Vallado, *Fundamentals of Astrodynamics and Applications* · Szebehely, *Theory of Orbits* · Murray & Dermott, *Solar System Dynamics*.

**Equation Atlas.** NIST CODATA 2018 · IAU 2015 Resolution B3 · Planck 2018 results VI · Fixsen (2009) · Ashby (2003), *Living Reviews in Relativity* · Sutton & Graves (1971), NASA TR R-376 · NASA Glenn *Beginner's Guide to Aeronautics* · NASA Science · JPL *Basics of Space Flight* · ESA Gaia · OpenStax *Astronomy 2e* and *University Physics III* · R. A. Braeunig · A. Hamilton (JILA).

**Gallery & timeline.** NASA Image and Video Library and API · NASA APOD API · JPL Photojournal · ESA/Hubble · ESA/Webb · ESO · Wikimedia Commons · Wikipedia (timeline links).

**Library.** Links out to documents from NASA, JPL, STScI, ESA, MIT OpenCourseWare, SpaceX, ULA, Rocket Lab, Blue Origin, Arianespace, JAXA, the FAA, Tripoli, NAR, Cal Poly, CelesTrak, Jonathan McDowell (GCAT), Robert Braeunig, and the publishers of the textbooks listed. Nothing is copied or hosted. Systems-engineering definitions follow NASA SP-2016-6105 Rev 2 and NASA's Technology Readiness Level definitions.

**Experiments.** NAR Model Rocket Safety Code · Tripoli Rocketry Association · FAA 14 CFR Part 101 · 47 CFR Parts 15 and 97 (eCFR) · NFPA 1122 · NASA Glenn water-rocket pages · Barrowman (1966/67) · Crowell (1996), nose-cone profiles · Uehara et al. (2003), crater scaling · Rayleigh (1891), pinhole optics · Kuglin & Hines (1975), phase correlation · NIST Atomic Spectra Database · Bosch BMP280/BMP390 datasheets · Balanis, *Antenna Theory* · Brand & Blitz (1993) · Seager & Mallén-Ornelas (2003) · Young (1967) · NASA Exoplanet Watch · AAVSO · OpenRocket · KiCad libraries (CC BY-SA 4.0 with the KiCad library exception) · arduino-pico (Earle Philhower) · Adafruit BMP3XX and LSM6DS libraries · Sandeep Mistry's arduino-LoRa · OpenSCAD · trimesh · MicroPython.

**Python toolkit.** Natural Earth 1:110m land polygons (public domain) · CIE 1931 2° colour-matching functions (CIE 018:2019) · Chenciner & Montgomery (2000) · Doyle et al. (2011), Kepler-16 · Kovács, Zucker & Mazeh (2002), BLS · SpaceX *Falcon User's Guide*.
