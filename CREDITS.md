# Credits & licences

Cosmic Library stands on the work of many people and institutions. This file lists every library, dataset, image source and reference used. Each page's source code also cites its numbers inline.

> Cosmic Library is an independent educational project. It is **not affiliated with or endorsed by** NASA, the Jet Propulsion Laboratory (JPL), SpaceX, the European Space Agency (ESA), the California Science Center or any other organisation named here. No agency insignia or company logos are used anywhere in this repository.

## Libraries (vendored in `site/vendor/`)

| Library | Version | Licence | Used for |
|---|---|---|---|
| [three.js](https://threejs.org) | r186 | MIT | Every 3D scene; add-ons: OrbitControls, EffectComposer, UnrealBloomPass, OutputPass, FXAAPass, Sky, Line2, CSS2DRenderer, STLLoader, RoomEnvironment, RoundedBoxGeometry, BufferGeometryUtils |
| [GSAP](https://gsap.com) | 3.15 | GSAP Standard "no charge" licence | Camera moves, ScrollTrigger, Flip, ScrambleText |
| [KaTeX](https://katex.org) | 0.18 | MIT | Equation rendering |
| [satellite.js](https://github.com/shashwatak/satellite-js) | 7.1 | MIT | SGP4 orbit propagation on the Live Earth Orbit page |
| [d3-celestial](https://github.com/ofrohn/d3-celestial) data | 0.7 | BSD-3-Clause (Olaf Frohn) | Stars, star names, constellation figures and boundaries, Milky Way, Messier objects (`site/data/sky/`) |

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

**Booster landing.** Wikipedia: "Falcon 9 Block 5", "SpaceX Merlin", "Falcon 9", "Falcon 9 flight 20" · ElonX.net · Orbital Radar staging glossary · U.S. Standard Atmosphere 1976 · Jorgensen, NASA TR R-474 · Sutton & Graves, NASA TR R-376 · Hoerner, *Fluid-Dynamic Drag* · Washington & Miller, AIAA 93-0035. Vehicle masses and aerodynamics are published estimates, flagged in `site/data/booster.json`.

**Moon landing.** *Apollo 11 Mission Report* (MSC-00171) and Press Kit · Apollo Lunar Surface Journal (E. M. Jones), public-domain transcripts · NASA TN D-6846 (Bennett), TN D-7143 (descent engine), TN D-6850 (landing gear) · NASA NTRS 20260001760 (touchdown dynamics) · A. R. Klumpp, R-695 (lunar descent guidance) · hashes after C. Wellons and M. O'Neill (PCG); regolith lighting after Hapke.

**Mars landing.** NASA/JPL *Mars 2020 Perseverance Landing Press Kit* (2021) · "Assessment of the Mars 2020 EDL Simulation" (NTRS 20210024480) · MEDLI2 MEADS reconstruction (NTRS 20210024320) · McGrew et al., Mars 2020 entry guidance (NTRS 20240015538) · MSL parachute reconstruction (NTRS 20130012763) · Braun & Manning (2006) · NASA Glenn Mars atmosphere model · NASA Mars Fact Sheet.

**Rocket hangar.** English Wikipedia infoboxes for all 26 vehicles (read 27 Sep 2026) · NASA MSFC AS-506 Flight Evaluation Report · NASA SLS Reference Guide · SpaceX *Falcon User's Guide* · JAXA H3 · This Day in Aviation · Space.com (Starship V3). Unverified figures are flagged in `site/data/rockets.json`.

**Live Earth orbit.** [CelesTrak](https://celestrak.org) General Perturbations data (T. S. Kelso) · [The Space Devs](https://thespacedevs.com) Launch Library 2 and Spaceflight News API · Natural Earth land mask (public domain) · ESA Space Environment Report 2025 and ESA Space Debris Office statistics · gps.gov, ESA/EUSPA orbit parameters · SpaceX FCC filings (Starlink shells) · NASA (ISS dimensions). News thumbnails belong to their publishers and are shown as links.

**Night sky.** d3-celestial (Olaf Frohn) · J. Meeus, *Astronomical Algorithms* · IERS Conventions 2010 · Ballesteros (2012), colour to temperature · Griffith Observatory / U.S. Naval Observatory 2026 sunrise and sunset table (test reference).

**Cosmic scale.** Natural Earth 1:50m and 1:10m land polygons (public domain) via `world-atlas` and `topojson-client` (ISC) · Planck Collaboration (2020), *A&A* 641, A6 · Wittkowski et al. (2012), VY Canis Majoris · Evans & Fung (1972), red blood cell shape · every object's own source in `site/data/scale.json`.

**Rocket builder.** English Wikipedia articles for each engine, booster and payload (listed in `site/data/builder-parts.json`) and "Delta-v budget" · NASA MSFC *Saturn V Flight Evaluation Report AS-506* · Cal Poly *CubeSat Design Specification*. Estimated figures are flagged in the data file.

**Space weather.** NOAA Space Weather Prediction Center (SWPC) real-time data (public domain) and Service Change Notice 26-21 · Shue et al. (1998) · Farris & Russell (1994) · Farris, Petrinec & Russell (1991) · Newell et al. (2007) · OVATION Prime (NOAA SWPC) · Dungey (1961) · Siscoe et al. (2006) and Tsurutani et al. (2003) on the Carrington event.

**Galaxy collision.** Toomre & Toomre (1972) · Toomre (1977) · van der Marel et al. (2012, 2019) · Sawala et al. (2025) and ESA/Hubble release heic2508 · Chandrasekhar (1943) · Hernquist (1990) · Binney & Tremaine (2008) · Bland-Hawthorn & Gerhard (2016) · GRAVITY Collaboration (2019) · Courteau et al. (2011) · Lin & Shu (1964) · Lupton et al. (2004) · Dubinski, Mihos & Hernquist (1996) · Barnes & Hernquist (1992) · Cox & Loeb (2008) · mulberry32 PRNG (public domain).

**README artwork.** All animated SVGs in `media/readme/` are original, generated by `scripts/readme_art/`; GIFs in `media/gifs/` are recordings of this site's own pages.

**Python toolkit.** Natural Earth 1:110m land polygons (public domain) · CIE 1931 2° colour-matching functions (CIE 018:2019) · Chenciner & Montgomery (2000) · Doyle et al. (2011), Kepler-16 · Kovács, Zucker & Mazeh (2002), BLS · SpaceX *Falcon User's Guide*.
