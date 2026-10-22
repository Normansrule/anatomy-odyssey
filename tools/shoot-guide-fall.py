"""Render the plates for the guide's "fall through the body" scroll story.

Usage:
    npm run build && npx vite preview --port 4173 &
    python3 tools/shoot-guide-fall.py [--url http://localhost:4173/] [--dive skeletal]

Opens each plate of a dive with every control hidden and a see-through page,
so each model comes out cut out on a transparent background, like a specimen
on paper. Each is cropped to the model, centered on a 4:5 card and written
to guide/fall/<step>.webp, which tools/build-guide.mjs places on the landing
page.
"""
import argparse
import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://localhost:4173/")
ap.add_argument("--dive", default="skeletal")
ap.add_argument("--browser", default=None, help="path to a Chromium executable, if Playwright's own is not installed")
args = ap.parse_args()

VIEW = (800, 1000)  # CSS pixels; narrow enough that no card opens beside the model
SCALE = 1.25
OUT = (800, 1000)  # each plate, 4:5
FILL = 0.86  # share of the card the model may fill
HIDE_UI = """
  html, body, .app { background: transparent !important; }
  .app::before { display: none !important; }
  body * { visibility: hidden !important; }
  canvas, canvas * { visibility: visible !important; }
"""

out = Path("guide/fall")
out.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=args.browser,
        args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    )
    page = browser.new_page(viewport={"width": VIEW[0], "height": VIEW[1]}, device_scale_factor=SCALE, reduced_motion="reduce", bypass_csp=True)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    page.goto(args.url + f"?dive={args.dive}&env=0")
    page.wait_for_function("document.getElementById('app').dataset.ready === 'true'", timeout=180000)
    steps = page.evaluate("window.__anatomyOdyssey.state.path.filter((s) => !s.sideTrip).map((s) => s.id)")
    page.add_style_tag(content=HIDE_UI)
    for i, step in enumerate(steps):
        page.evaluate(f"window.__anatomyOdyssey.goTo({i}, {{ quick: true }})")
        page.wait_for_function("!window.__anatomyOdyssey.engine.busy", timeout=180000)
        page.wait_for_timeout(2500)
        shot = Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert("RGBA")
        box = shot.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
        if not box:
            raise SystemExit(f"{step}: nothing drawn")
        model = shot.crop(box)
        k = min(OUT[0] * FILL / model.width, OUT[1] * FILL / model.height)
        model = model.resize((max(1, round(model.width * k)), max(1, round(model.height * k))), Image.LANCZOS)
        card = Image.new("RGBA", OUT, (0, 0, 0, 0))
        card.alpha_composite(model, ((OUT[0] - model.width) // 2, (OUT[1] - model.height) // 2))
        card.save(out / f"{step}.webp", "WEBP", quality=82, method=6)
        print(f"guide/fall/{step}.webp")
    browser.close()

if errors:
    raise SystemExit("page errors:\n" + "\n".join(errors))
