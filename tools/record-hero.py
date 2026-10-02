"""Record README GIFs.

    npm run build && npx vite preview --port 4173 &
    python3 tools/record-hero.py                          # skeletal dive → docs/media/hero-dive.gif
    python3 tools/record-hero.py --dive circulatory --out docs/media/circulatory-dive.gif
    python3 tools/record-hero.py --dive inflammation --sweep --out docs/media/inflammation.gif

A dive recording clicks "Dive deeper" through every step. With --sweep, the
recording stays on the first step and sweeps the scene's control from its
minimum to its maximum (used for the inflammation module).
"""
import argparse
import io

from PIL import Image
from playwright.sync_api import sync_playwright

ap = argparse.ArgumentParser()
ap.add_argument("--url", default="http://localhost:4173/")
ap.add_argument("--dive", default="skeletal")
ap.add_argument("--out", default="docs/media/hero-dive.gif")
ap.add_argument("--sweep", action="store_true")
ap.add_argument("--width", type=int, default=640)
args = ap.parse_args()

W, H = 1200, 750
size = (args.width, round(args.width * H / W))
frames = []

with sync_playwright() as p:
    browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
    page = browser.new_page(viewport={"width": W, "height": H}, bypass_csp=True)
    page.goto(f"{args.url}?dive={args.dive}")
    page.wait_for_function("document.getElementById('app').dataset.ready === 'true'")
    page.evaluate("document.getElementById('intro').hidden = true")
    page.wait_for_timeout(1200)

    def grab(n=1):
        for _ in range(n):
            img = Image.open(io.BytesIO(page.screenshot())).convert("RGB").resize(size, Image.LANCZOS)
            frames.append(img)

    if args.sweep:
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
quantized = [f.quantize(colors=160, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE) for f in frames]
quantized[0].save(args.out, save_all=True, append_images=quantized[1:], duration=110, loop=0, optimize=False)
print(f"{len(frames)} frames written to {args.out}")
