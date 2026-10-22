"""Make the README's hero poster, in light and dark (docs/media/hero-light.webp, hero-dark.webp).

Usage:
    npm run build && npx vite preview --port 4173 &
    python3 tools/shoot-readme-hero.py [--browser /path/to/chrome]

Shoots a few plates from the app with everything but the model hidden, then
sets them in a grid of tiles with the chart's own type (Archivo, with its width
axis, from node_modules) and screenshots the result at twice the README's width.
GitHub picks the light or dark poster to match the reader's theme.
"""
import argparse
import base64
import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://localhost:4173/")
ap.add_argument("--browser", default=None, help="path to a Chromium executable, if Playwright's own is not installed")
args = ap.parse_args()
ROOT = Path(__file__).resolve().parent.parent

# tile id: (query, viewport, javascript to run once the plate is up)
TILES = {
    "skeleton": ("?dive=skeletal&step=skeleton&env=0", (720, 1200), None),
    "scan": ("?dive=circulatory&step=heart-scan&env=0", (1500, 700), None),
    "heart": ("?dive=circulatory&step=heart&env=0", (1100, 800), None),
    "brain": ("?dive=nervous&step=brain&env=0", (1100, 800), None),
}
# Only the 3D view: the chart's furniture is hidden, the view fills the window.
BARE = """
#app > *:not(#view), .app::before { visibility: hidden !important; }
#view { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 9999; }
"""


def shoot(name, scheme):
    query, (w, h), js = TILES[name]
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=args.browser, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        page = browser.new_page(viewport={"width": w, "height": h}, color_scheme=scheme, reduced_motion="reduce", bypass_csp=True)
        page.goto(args.url + query)
        page.wait_for_function("document.getElementById('app').dataset.ready === 'true'", timeout=300000)
        page.wait_for_function("!window.__anatomyOdyssey.engine.busy", timeout=300000)
        page.add_style_tag(content=BARE)
        page.evaluate("dispatchEvent(new Event('resize'))")
        if js:
            page.evaluate(js)
        page.wait_for_timeout(8000)
        shot = page.screenshot()
        browser.close()
    return name, scheme, shot


jobs = [(n, s) for n in TILES for s in ("light", "dark")]
with ThreadPoolExecutor(max_workers=4) as pool:
    shots = {(n, s): img for n, s, img in pool.map(lambda j: shoot(*j), jobs)}

font = base64.b64encode((ROOT / "node_modules/@fontsource-variable/archivo/files/archivo-latin-wdth-normal.woff2").read_bytes()).decode()


def tile_style(png):
    """The model alone, cropped close, on a tile filled with the shot's own backdrop color so no seam shows."""
    img = Image.open(io.BytesIO(png)).convert("RGB")
    w, h = img.size
    img = img.crop((40, 40, w - 40, h - 40))  # off the window's edge rules
    color = img.getpixel((img.width // 2, 6))
    diff = ImageChops.difference(img, Image.new("RGB", img.size, color)).convert("L").point(lambda v: 255 if v > 26 else 0)
    box = diff.getbbox()
    if not box:
        raise SystemExit("a tile came out blank: is the preview server running the latest build?")
    pad = round(0.04 * max(img.size))
    img = img.crop((max(0, box[0] - pad), max(0, box[1] - pad), min(img.width, box[2] + pad), min(img.height, box[3] + pad)))
    # Fade the crop's edges into the backdrop, so the tile shows no frame.
    mask = Image.new("L", img.size, 255)
    edge = ImageDraw.Draw(mask)
    for i in range(pad):
        edge.rectangle((i, i, img.width - 1 - i, img.height - 1 - i), outline=round(255 * i / pad))
    img = Image.composite(img, Image.new("RGB", img.size, color), mask)
    bg = "#%02x%02x%02x" % color
    out = io.BytesIO()
    img.save(out, "WEBP", quality=90)
    return f"background-image:url(data:image/webp;base64,{base64.b64encode(out.getvalue()).decode()});--bg:{bg}"


PAGE = """<!doctype html><meta charset="utf-8"><style>
@font-face { font-family: Archivo; src: url(data:font/woff2;base64,{font}) format('woff2'); font-weight: 100 900; font-stretch: 62% 125%; }
:root { --paper: #e9e3d6; --tile: #f3efe6; --ink: #1b2120; --muted: #5d625c; --red: #a3242f; --rule: #1b2120; }
.dark { --paper: #15191b; --tile: #1e2427; --ink: #ece7dc; --muted: #9aa29d; --red: #e0535c; --rule: #ece7dc; }
* { box-sizing: border-box; margin: 0; }
body { width: 1720px; background: var(--paper); color: var(--ink); font-family: Archivo, sans-serif; padding: 64px 64px 72px; }
.kicker { font-weight: 700; letter-spacing: .18em; font-size: 22px; color: var(--red); text-transform: uppercase; }
h1 { font-weight: 900; font-stretch: 75%; font-size: 156px; line-height: .86; letter-spacing: -.01em; text-transform: uppercase; margin: 18px 0 8px; }
.lede { font-size: 30px; color: var(--muted); max-width: 1000px; line-height: 1.3; }
.head { display: flex; justify-content: space-between; align-items: end; border-bottom: 4px double var(--rule); padding-bottom: 36px; margin-bottom: 40px; }
.scale { text-align: right; font-weight: 800; font-stretch: 80%; font-size: 64px; line-height: 1; }
.scale small { white-space: nowrap; display: block; font-size: 20px; font-weight: 600; letter-spacing: .14em; color: var(--muted); text-transform: uppercase; margin-top: 10px; font-stretch: 100%; }
.grid { display: grid; grid-template-columns: 1fr 1fr 1fr; grid-template-rows: 520px 400px; gap: 22px; }
.tile { position: relative; border-radius: 28px; overflow: hidden; background: var(--bg) 50% 30% / auto 78% no-repeat; }
.tile::after { content: ''; position: absolute; inset: 0; background: linear-gradient(to top, var(--bg) 0, var(--bg) 18%, transparent 46%); }
.tile .t { position: absolute; left: 30px; bottom: 26px; right: 30px; z-index: 1; }
.tile b { display: block; font-weight: 800; font-size: 40px; font-stretch: 85%; line-height: 1.02; }
.tile span { display: block; font-size: 21px; color: var(--muted); margin-top: 8px; line-height: 1.3; }
.tile i { z-index: 1; position: absolute; left: 30px; top: 26px; font-style: normal; font-weight: 700; font-size: 17px; letter-spacing: .16em; color: var(--red); text-transform: uppercase; }
.skeleton { grid-row: span 2; background-size: auto 80%; background-position: center 64px; }
.scan { grid-column: span 2; background-size: auto 92%; background-position: 82% 50%; }
.scan::after { background: linear-gradient(to right, var(--bg) 0, var(--bg) 14%, transparent 36%); }
.scan .t { top: 74px; bottom: auto; max-width: 300px; }
</style><body class="{scheme}">
<div class="head"><div><div class="kicker">Anatomy Odyssey</div><h1>The human body,<br>to scale.</h1>
<p class="lede">A 3D wall chart you can fall into: measured from a real body, from two meters down to a single molecule.</p></div>
<div class="scale">10 m → 0.1 nm<small>One slider, eleven powers of ten</small></div></div>
<div class="grid">
<div class="tile skeleton" style="{skeleton}"><i>Skeletal</i><div class="t"><b>258 real bones</b><span>Z-Anatomy’s detailed skeleton, shaded with the shadow each bone casts on itself.</span></div></div>
<div class="tile scan" style="{scan}"><i>New · Heart scan</i><div class="t"><b>Read a heart scan</b><span>Turn the probe through the four standard echo views, the way trainee doctors learn them.</span></div></div>
<div class="tile" style="{heart}"><i>Circulatory</i><div class="t"><b>A beating heart</b></div></div>
<div class="tile" style="{brain}"><i>Nervous</i><div class="t"><b>Every real fold</b></div></div>
</div></body>"""

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser)
    for scheme in ("light", "dark"):
        html = PAGE.replace("{font}", font).replace("{scheme}", scheme)
        for n in TILES:
            html = html.replace("{" + n + "}", tile_style(shots[(n, scheme)]))
        page = browser.new_page(viewport={"width": 1720, "height": 800})
        page.set_content(html)
        page.wait_for_timeout(500)
        png = page.screenshot(full_page=True)
        out = ROOT / f"docs/media/hero-{scheme}.webp"
        Image.open(io.BytesIO(png)).convert("RGB").save(out, "WEBP", quality=86, method=6)
        print(out.relative_to(ROOT), out.stat().st_size // 1024, "KB")
    browser.close()
