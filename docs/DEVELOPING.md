# Developing Cosmic Library

How the repository is put together, so every page looks and behaves like part of one product.

## Layout

```
cosmic-library/
├── site/                  ← the GitHub Pages website (static, no build step)
│   ├── index.html         ← landing page
│   ├── <page>.html        ← one file per page (see list below)
│   ├── assets/css/codex.css   ← THE design system (tokens + components) — shared, edit with care
│   ├── assets/css/<page>.css  ← optional page-specific styles
│   ├── assets/js/codex.js     ← nav, footer, starfield, meteors, reveal, tickers — shared
│   ├── assets/js/<page>.js    ← page logic (ES module)
│   ├── assets/img/            ← favicon, small original SVGs
│   ├── data/*.json            ← curated data (gallery, library, timeline …)
│   ├── data/sky/              ← star catalogue, constellations, Milky Way, Messier (d3-celestial, BSD-3)
│   └── vendor/                ← Three.js r186, GSAP 3.15, KaTeX 0.18, satellite.js 7.1 (vendored: no CDN needed)
├── simulations/           ← Python simulations (NumPy/Matplotlib) + tests
├── experiments/           ← hands-on builds, levels 0 → 4, with CAD / PCB / code
├── docs/                  ← long-form Markdown (engineering primers, references, videos)
├── media/                 ← screenshots used by the README
└── scripts/               ← setup, local server, screenshot tool
```

## Pages (the grouped nav — Fly / Explore / Learn / Build — is generated from the PAGES list in `codex.js`)

| id | file | archetype |
|---|---|---|
| index | index.html | atlas (long scroll) |
| launch | launch.html | sim (full-screen 3D) |
| shuttle | shuttle.html | sim |
| black-hole | black-hole.html | sim |
| sun | sun.html | sim |
| solar-system | solar-system.html | sim |
| orbits | orbits.html | sim |
| equations | equations.html | atlas |
| gallery | gallery.html | atlas |
| timeline | timeline.html | atlas |
| library | library.html | atlas |
| experiments | experiments.html | atlas |
| booster | booster.html | sim — reusable booster landing |
| moon-landing | moon-landing.html | sim — Apollo lunar module descent |
| mars-landing | mars-landing.html | sim — Mars 2020 entry, descent and landing |
| hangar | hangar.html | sim — rockets side by side to scale |
| earth | earth.html | sim — live satellites, launches, news |
| sky | sky.html | sim — planetarium |
| scale | scale.html | sim — powers-of-ten zoom |
| builder | builder.html | sim — design a rocket and fly it |
| space-weather | space-weather.html | sim — live solar wind, geomagnetic storms, aurora |
| galaxies | galaxies.html | sim — Milky Way–Andromeda collision (GPU N-body) |
| solar-observatory | solar-observatory.html | atlas — live SDO/SOHO/GOES imagery + great solar images |
| surveys | surveys.html | sim — Aladin Lite multi-wavelength sky atlas |
| telescopes | telescopes.html | atlas — remote telescopes, live feeds, simulators directory |
| mission-designer | mission-designer.html | sim — porkchop plot, launch vehicle, spacecraft budgets |
| moon | moon.html | sim — 3D Moon, landing sites, phases, libration, eclipses |
| dsn | dsn.html | sim — live Deep Space Network antennas and spacecraft |
| academy | academy.html | atlas — guided course: lessons, widgets, quizzes, badges |

## Page skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Launch · Cosmic Library</title>
<meta name="description" content="One sentence about the page.">
<meta property="og:title" content="Launch · Cosmic Library">
<meta property="og:description" content="Same sentence.">
<meta name="theme-color" content="#04050a">
<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/codex.css">
<script type="importmap">{"imports":{"three":"./vendor/three/three.module.js","three/addons/":"./vendor/three/addons/","satellite.js":"./vendor/satellite/index.js"}}</script>
</head>
<body class="sim" data-page="launch">   <!-- drop class="sim" for scrolling pages -->
  <div class="stage" id="stage"></div>
  <div class="hud hud-title"> … </div>
  <aside class="hud hud-panel"><button class="hud-collapse">▼ HIDE</button> … </aside>
  <script src="assets/js/codex.js"></script>          <!-- injects nav/footer/sky -->
  <script type="module" src="assets/js/launch.js"></script>
</body>
</html>
```

`codex.js` injects the navigation bar (and on scrolling pages the footer, starfield, aurora and meteors), so pages never hand-write them.

## Design system cheat-sheet (`codex.css`)

- Colours: `--ice` (primary), `--flame`, `--nebula`, `--plasma`, `--aurora`, `--sol`; text `--text`, `--text-2`, `--muted`, `--faint`; surfaces `--bg`, `--bg-2`, `--bg-3`, `--panel`; borders `--line`, `--line-hi`.
- Fonts: `--f-display` (Space Grotesk), `--f-body` (Inter), `--f-mono` (JetBrains Mono).
- Layout: `.shell` (centred column), `.page` (top padding under the nav), `section.block`, `.grid.grid-2/3/4`, `.row`.
- Type: `.eyebrow`, `.lede`, `.grad-text`, `.shiny`, `.prose`.
- Components: `.card` (+ `.spot` cursor spotlight, `.beam` travelling border light), `.btn` (+ `.primary`, `.flame`, `.small`, `aria-pressed`), `.chip` (+ `.ice/.flame/.nebula/.aurora/.sol`), `.stat`, `.marquee > .marquee-track`, `table.data` in `.table-wrap`, `.callout`, `.lightbox`.
- Controls: `.field` with `<label>` + `<input type=range>` (auto-filled track), `.switch`, `.seg` (segmented buttons), `select`.
- Full-screen sim pages: `body.sim`, `.stage` (canvas host), `.hud` + `.hud-title` / `.hud-panel` (`.left` variant) / `.hud-bottom`, `.readouts > .readout > .k + .v`, `.hint`, `.loading`. On phones the side panel becomes a bottom sheet, toggled by `.hud-collapse`.
- Motion: `.reveal` (blur-in on scroll, `data-delay` in ms), `[data-count]` number tickers.
- JS helpers: `Codex.fmt(value, digits)`, `Codex.webgl()`, `Codex.noGL(msg)`, `Codex.reducedMotion`.

## Rules

1. **No build step, no CDNs for code.** Import Three.js as `three` / `three/addons/…` through the import map; GSAP from `vendor/gsap/*.min.js`; KaTeX from `vendor/katex/`. Only Google Fonts and NASA/Wikimedia image hosts are fetched at runtime.
2. **Performance.** Cap `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`, pause the render loop when `document.hidden`, keep a phone at 30+ fps.
3. **Honesty in the physics.** Every number shown on screen comes from a real equation or a cited source. Comment the source in code.
4. **Accessibility.** Canvases get `aria-label`; every control is keyboard reachable; respect `prefers-reduced-motion`.
5. **Writing style.** Acronyms written out in full on first use with the acronym in parentheses, e.g. "Jet Propulsion Laboratory (JPL)". Recommended videos and resources are in English.
6. **Imagery and marks.** NASA photographs are public domain (credit them). Never draw the NASA insignia ("meatball"), NASA logotype ("worm"), SpaceX or other company logos on models. Real vehicles are modelled from public reference drawings.
7. **Test before committing.** `python scripts/shot.py <page>.html out.png` screenshots a page in headless Chromium with WebGL and fails on uncaught errors.

## Run locally

```bash
python3 -m http.server 8000 --directory site   # then open http://localhost:8000
```
