"""Record the README's motion animations.

Usage:
    npm run build && npx vite preview --port 4173 &
    python3 tools/record-motion.py fall [--out docs/media/guide-fall.gif]
    python3 tools/record-motion.py plate [--out docs/media/plate-set.gif]
    python3 tools/record-motion.py scan [--out docs/media/heart-scan.gif]
    python3 tools/record-motion.py skeleton [--out docs/media/skeleton-turn.gif]

fall:  scrolls the guide's landing page down through "Fall through the body",
       a frame per step of scrolling.
plate: flies the app from the femur to bone tissue, then steps the page's own
       animations (the heading setting itself, the callouts drawing out from
       their parts) through time with the Web Animations API, so every frame
       is exact even where software 3D draws slowly.
scan:  the heart scan step, the probe control swept from the four-chamber
       view to the short axis and back, the scanner screen beating live.
skeleton: one slow turn round the skeleton, the camera stepped by hand so
       each frame is evenly spaced however slowly the bones draw.
"""
import argparse
import io

from PIL import Image
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("what", choices=["fall", "plate", "scan", "skeleton"])
ap.add_argument("--url", default="http://localhost:4173/")
ap.add_argument("--out", default=None)
ap.add_argument("--width", type=int, default=860)
ap.add_argument("--browser", default=None, help="path to a Chromium executable, if Playwright's own is not installed")
args = ap.parse_args()
out = args.out or f"docs/media/{ {'fall': 'guide-fall', 'plate': 'plate-set', 'scan': 'heart-scan', 'skeleton': 'skeleton-turn'}[args.what] }.gif"

frames, durations = [], []


def grab(page, ms, clip=None):
    shot = Image.open(io.BytesIO(page.screenshot(clip=clip))).convert("RGB")
    h = round(shot.height * args.width / shot.width)
    frames.append(shot.resize((args.width, h), Image.LANCZOS))
    durations.append(ms)


with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=args.browser,
        args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"],
    )
    if args.what == "fall":
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(args.url + "guide/", wait_until="load")
        top, span = page.evaluate("(() => { const t = document.querySelector('.fall__track'); return [t.getBoundingClientRect().top + scrollY, t.offsetHeight - innerHeight]; })()")
        steps = 150
        for i in range(steps + 1):
            page.evaluate(f"scrollTo(0, {top + span * i / steps})")
            page.wait_for_timeout(60)
            grab(page, 1400 if i in (0, steps) else 60)
    elif args.what == "scan":
        page = browser.new_page(viewport={"width": 1440, "height": 900}, bypass_csp=True)
        page.goto(args.url + "?dive=circulatory&step=heart-scan&env=0")
        page.wait_for_function("document.getElementById('app').dataset.ready === 'true'", timeout=240000)
        page.wait_for_function("!window.__anatomyOdyssey.engine.busy", timeout=240000)
        page.wait_for_timeout(3000)
        clip = {"x": 140, "y": 270, "width": 880, "height": 520}  # the heart, the beam and the screen
        sweep = [i / 40 * 3 for i in range(41)]
        for i, v in enumerate(sweep + sweep[::-1][1:]):
            page.evaluate(f"(() => {{ const r = document.getElementById('scene-range'); r.value = {v}; r.dispatchEvent(new Event('input', {{ bubbles: true }})); }})()")
            hold = v in (0, 1, 2, 3) and i
            page.wait_for_timeout(3500 if hold else 450)  # let the heart finish turning to face the new slice
            grab(page, 1600 if hold else 90, clip)
    elif args.what == "skeleton":
        page = browser.new_page(viewport={"width": 900, "height": 1100}, bypass_csp=True)
        page.goto(args.url + "?dive=skeletal&step=skeleton&env=0")
        page.wait_for_function("document.getElementById('app').dataset.ready === 'true'", timeout=240000)
        page.wait_for_function("!window.__anatomyOdyssey.engine.busy", timeout=240000)
        page.add_style_tag(content="#app > *:not(#view), .app::before { visibility: hidden !important; } #view { position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important; z-index: 9999; }")
        page.evaluate("dispatchEvent(new Event('resize'))")
        page.wait_for_timeout(4000)
        steps = 72
        for i in range(steps):
            page.evaluate(f"""(() => {{
              const {{ camera, controls }} = window.__anatomyOdyssey.engine;
              const t = controls.target, d = camera.position.clone().sub(t), a = {2 * 3.14159265 / steps};
              camera.position.set(t.x + d.x * Math.cos(a) + d.z * Math.sin(a), camera.position.y, t.z - d.x * Math.sin(a) + d.z * Math.cos(a));
              camera.lookAt(t);
            }})()""")
            page.wait_for_timeout(120)
            grab(page, 70, {"x": 20, "y": 40, "width": 560, "height": 1020})  # the step frames the skeleton left of center
    else:
        page = browser.new_page(viewport={"width": 1440, "height": 900}, bypass_csp=True)
        page.goto(args.url + "?dive=skeletal&step=femur&env=0")
        page.wait_for_function("document.getElementById('app').dataset.ready === 'true'", timeout=180000)
        page.wait_for_function("!window.__anatomyOdyssey.engine.busy", timeout=180000)
        page.wait_for_timeout(3000)
        page.evaluate("window.__anatomyOdyssey.goTo(3)")
        page.wait_for_function("!window.__anatomyOdyssey.engine.busy", timeout=180000, polling=30)
        page.wait_for_function("!document.getElementById('marks').hidden && document.querySelectorAll('#marks .mark:not([hidden])').length > 3", timeout=60000, polling=30)
        # The heading set itself during the flight; set it again so the clip starts bare.
        page.evaluate("(() => { const h = document.getElementById('plate-head'); h.classList.remove('is-set'); void h.offsetWidth; h.classList.add('is-set'); })()")
        clip = {"x": 124, "y": 56, "width": 924, "height": 578}  # the plate, between the scale and the card
        for t in range(0, 1501, 40):
            page.evaluate(f"document.getAnimations().forEach((a) => {{ a.pause(); a.currentTime = {t}; }})")
            grab(page, 2000 if t == 1500 else 40, clip)
    browser.close()

# One shared palette, drawn from a strip of frames across the whole clip, keeps
# the file small, every plate's colors true and the paper from shimmering.
sample = frames[:: max(1, len(frames) // 12)]
strip = Image.new("RGB", (frames[0].width, frames[0].height * len(sample)))
for i, f in enumerate(sample):
    strip.paste(f, (0, i * f.height))
palette = strip.quantize(colors=255, method=Image.Quantize.MEDIANCUT)
gif = [f.quantize(palette=palette, dither=Image.Dither.NONE) for f in frames]
gif[0].save(out, save_all=True, append_images=gif[1:], duration=durations, loop=0, optimize=True)
print(f"{out}: {len(gif)} frames")
