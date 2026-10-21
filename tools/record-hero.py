"""Record README GIFs.

    npm run build && npx vite preview --port 4173 &
    python3 tools/record-hero.py                          # skeletal dive → docs/media/hero-dive.gif
    python3 tools/record-hero.py --dive circulatory --out docs/media/circulatory-dive.gif
    python3 tools/record-hero.py --dive inflammation --sweep --out docs/media/inflammation.gif
    python3 tools/record-hero.py --dive circulatory --step heart --live 5 --out docs/media/heartbeat.gif
    python3 tools/record-hero.py --dive skeletal --slide 1e-8 --width 860 --out docs/media/scale-slider.gif
    python3 tools/record-hero.py --dive circulatory --step heart --key --out docs/media/living-key.gif

A dive recording clicks "Dive deeper" through every step. With --sweep, the
recording stays on the first step (or --step) and sweeps the scene's control
from its minimum to its maximum (used for the inflammation module and the
digestive and urinary tracts). With --live SECONDS, it records that step as it
animates by itself (the heartbeat, blood flow), at the real speed. With
--slide METERS, it drags the scale slider from the current view down to that
size in one movement, and with --key it points at each entry of the card's
key in turn, so the leader lines draw to the parts; both at the real speed.
"""
import argparse
import io
import math
import time

from PIL import Image
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://localhost:4173/")
ap.add_argument("--dive", default="skeletal")
ap.add_argument("--out", default="docs/media/hero-dive.gif")
ap.add_argument("--sweep", action="store_true")
ap.add_argument("--step", default="", help="start on this step instead of the dive's first")
ap.add_argument("--live", type=float, default=0, help="record this many seconds of the step animating by itself")
ap.add_argument("--colors", type=int, default=160)
ap.add_argument("--clean", action="store_true", help="hide the scene's control box and the key's numbers too, leaving just the view")
ap.add_argument("--zoom", default="", help="zoom in first, at x,y (fractions of the view), by this many wheel clicks: x,y,clicks")
ap.add_argument("--crop", default="", help="keep only this part of the view: left,top,right,bottom as fractions")
ap.add_argument("--slide", type=float, default=0, help="drag the scale slider down to a view this many meters tall")
ap.add_argument("--key", action="store_true", help="point at each key entry in turn")
ap.add_argument("--width", type=int, default=640)
ap.add_argument("--browser", default=None, help="path to a Chromium executable, if Playwright's own is not installed")
args = ap.parse_args()

W, H = 1200, 750
box = [float(x) for x in args.crop.split(",")] if args.crop else [0, 0, 1, 1]
box = (round(box[0] * W), round(box[1] * H), round(box[2] * W), round(box[3] * H))
size = (args.width, round(args.width * (box[3] - box[1]) / (box[2] - box[0])))
frames = []
duration = 110  # ms a frame

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=args.browser, args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": W, "height": H}, bypass_csp=True)
    page.goto(f"{args.url}?dive={args.dive}" + (f"&step={args.step}" if args.step else ""))
    page.wait_for_function("document.getElementById('app').dataset.ready === 'true'")
    page.evaluate("document.getElementById('intro').hidden = true")
    page.wait_for_timeout(1200)

    zoom_clicks = 0
    if args.zoom:
        zx, zy, clicks = (float(v) for v in args.zoom.split(","))
        page.mouse.move(zx * W, zy * H)
        zoom_clicks = int(clicks)
    if args.zoom and not args.live:  # with --live, the zoom is recorded as it happens
        for _ in range(zoom_clicks):
            page.mouse.wheel(0, -240)
            page.wait_for_timeout(250)
        page.wait_for_timeout(2500)
    if args.clean:
        page.add_style_tag(content="#scene-controls, #marks, #leader { visibility: hidden !important; }")

    def grab(n=1):
        for _ in range(n):
            img = Image.open(io.BytesIO(page.screenshot())).convert("RGB").crop(box).resize(size, Image.LANCZOS)
            frames.append(img)

    def stepped():
        # Software rendering is far slower than real time, so the page's clock is
        # stopped and stepped one frame at a time: the GIF plays at the real speed.
        page.clock.install()
        page.clock.pause_at(time.time() * 1000 + 1000)

    def tick(n=1):
        for _ in range(n):
            page.clock.run_for(duration)
            grab()

    if args.slide:
        rail = page.eval_on_selector("#gauge-rail", "e => { const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y, r.height]; }")
        frac = lambda m: (1 - math.log10(m)) / 11  # the slider runs from 10 m (0) to 0.1 nm (1)
        start = page.evaluate("window.__anatomyOdyssey.engine.viewMeters()")
        y = lambda f: rail[1] + rail[2] * f
        stepped()
        tick(6)
        page.mouse.move(rail[0], y(frac(start)))
        page.mouse.down()
        count = 70
        for i in range(1, count + 1):
            t = i / count
            ease = t * t * (3 - 2 * t)
            page.mouse.move(rail[0], y(frac(start) + (frac(args.slide) - frac(start)) * ease))
            tick()
        tick(30)
        page.mouse.up()
        tick(10)
    elif args.key:
        stepped()
        tick(4)
        items = page.locator(".key__item")
        for i in range(items.count()):
            items.nth(i).hover()
            tick(9)
        page.mouse.move(5, 5)
        tick(4)
    elif args.live:
        page.evaluate("document.getElementById('panel').hidden = true")
        page.wait_for_timeout(1500)
        # Software rendering is far slower than real time, so the page's clock is
        # stopped and stepped one frame at a time: the GIF plays at the real speed.
        page.clock.install()
        page.clock.pause_at(time.time() * 1000 + 1000)
        count = round(args.live * 1000 / duration)
        for i in range(count):
            if zoom_clicks and i % max(1, round(0.6 * count / zoom_clicks)) == 0 and i < 0.7 * count:
                page.mouse.wheel(0, -240)
            page.clock.run_for(duration)
            grab()
    elif args.sweep:
        page.evaluate("document.getElementById('panel').hidden = true")
        steps = 44
        for i in range(steps + 1):
            v = page.evaluate(
                f"(() => {{ const c = window.__anatomyOdyssey.engine.current.built.controls; c.playing = false;"
                f" const v = c.min + (c.max - c.min) * {i} / {steps}; c.set(v); c.value = v; return v; }})()"
            )
            page.wait_for_timeout(120)
            grab(3 if abs(v - round(v)) < 0.05 else 1)
        grab(6)
    else:
        grab(6)
        count = page.evaluate("window.__anatomyOdyssey.state.path.length")
        for _ in range(count - 1):
            page.click("#next-button")
            page.wait_for_timeout(60)
            while page.evaluate("document.getElementById('app').dataset.busy") == "true":
                grab()
            page.wait_for_timeout(300)
            grab(5)
        grab(8)
    browser.close()

# Each frame gets its own adaptive palette so small colored details survive.
quantized = [f.quantize(colors=args.colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
quantized[0].save(args.out, save_all=True, append_images=quantized[1:], duration=duration, loop=0, optimize=False)
print(f"{len(frames)} frames written to {args.out}")
