"""Render the guide's body picture and measure where each dive starts on it.

Usage:
    npm run build && npx vite preview --port 4173 &
    python3 tools/shoot-guide-body.py [--url http://localhost:4173/]

Opens the whole body (the skeletal dive's first plate, default body systems)
with every control hidden and a see-through page, so the figure comes out on
a transparent background. Each dive's starting point (the same anchors the
zoom guide steers to) is projected through the same camera, so the numbers on
the guide's landing page sit exactly where the app would take you. Writes
guide/body.webp and guide/body-marks.json ({ dive: [left %, top %] }), which
tools/build-guide.mjs reads.
"""
import argparse
import io
import json
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://localhost:4173/")
ap.add_argument("--browser", default=None, help="path to a Chromium executable, if Playwright's own is not installed")
args = ap.parse_args()

VIEW = (440, 960)  # CSS pixels; drawn at three times that
SCALE = 3
PAD = 24  # device pixels kept around the figure
HIDE_UI = """
  html, body, .app, .stage { background: transparent !important; }
  body * { visibility: hidden !important; }
  canvas, canvas * { visibility: visible !important; }
"""

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=args.browser,
        args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    )
    page = browser.new_page(viewport={"width": VIEW[0], "height": VIEW[1]}, device_scale_factor=SCALE, reduced_motion="reduce", bypass_csp=True)
    errors = []
    page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
    # env=0 skips the studio reflections, which only slow software rendering.
    page.goto(args.url + "?dive=skeletal&step=body&env=0")
    page.wait_for_function("document.getElementById('app').dataset.ready === 'true'", timeout=120000)
    page.wait_for_timeout(4000)
    page.add_style_tag(content=HIDE_UI)
    page.wait_for_timeout(500)
    anchors = page.evaluate("window.__anatomyOdyssey.bodyAnchors()")
    shot = Image.open(io.BytesIO(page.screenshot(omit_background=True))).convert("RGBA")
    browser.close()

if errors:
    raise SystemExit("page errors:\n" + "\n".join(errors))

# Crop to the figure (anything not fully see-through), plus a margin.
left, top, right, bottom = shot.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox()
left, top = max(0, left - PAD), max(0, top - PAD)
right, bottom = min(shot.width, right + PAD), min(shot.height, bottom + PAD)
body = shot.crop((left, top, right, bottom))

marks = {}
for a in anchors:
    if a["diveId"] in marks or a.get("x") is None:
        continue  # the first anchor per dive is where it starts
    x = (a["x"] * SCALE - left) / body.width * 100
    y = (a["y"] * SCALE - top) / body.height * 100
    if not (0 <= x <= 100 and 0 <= y <= 100):
        raise SystemExit(f"the {a['diveId']} dive starts outside the picture ({x:.1f}%, {y:.1f}%)")
    marks[a["diveId"]] = [round(x, 1), round(y, 1)]

out = Path("guide")
body.save(out / "body.webp", "WEBP", quality=82, method=6)
(out / "body-marks.json").write_text(json.dumps({"size": [body.width, body.height], "marks": marks}, indent=2) + "\n")
print(f"guide/body.webp {body.width}x{body.height}, {len(marks)} dives placed")
