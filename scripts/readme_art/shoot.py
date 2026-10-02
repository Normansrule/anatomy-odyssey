#!/usr/bin/env python3
"""Screenshot preview.html (hero + tiles on GitHub light/dark) at several animation times.

    python scripts/readme_art/shoot.py OUT_DIR [--times 800,2600,5200] [--scale 1] [--reduced]
        [--only hero|tile-id] [--size 400] [--page preview_more.html]

--page preview_more.html shows the section banners, dividers, stats, sub-README banners,
new tiles and new concept animations on GitHub light and dark; --page "preview_more.html#new"
shows only the v6 art (buttons, how-to strips, start / observe-first banners, eyepiece tile).

--only renders a single SVG at native size (x --scale) for close inspection.
"""
import argparse, functools, http.server, os, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("--times", default="800,2600,5200")
    ap.add_argument("--scale", type=float, default=1)
    ap.add_argument("--reduced", action="store_true")
    ap.add_argument("--only", default="")
    ap.add_argument("--dark", action="store_true")
    ap.add_argument("--grid", default="")
    ap.add_argument("--page", default="preview.html", help="preview page in scripts/readme_art/ (e.g. preview_more.html)")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    srv = serve()
    base = f"http://127.0.0.1:{srv.server_address[1]}"
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={"width": 960, "height": 900}, device_scale_factor=a.scale,
                            reduced_motion="reduce" if a.reduced else "no-preference")
        pg = ctx.new_page()
        if a.grid:
            import sys
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            from tiles import PAGES
            ids = [q for q in a.grid.split(",") if q] if a.grid != "all" else [q[0] for q in PAGES]
            cells = "".join(f'<img src="{base}/media/readme/tiles/{i}.svg" width="400" height="250" style="margin:8px">' for i in ids)
            rows = (len(ids) + 3) // 4
            pg.set_viewport_size({"width": 4 * 416 + 16, "height": rows * 266 + 16})
            pg.set_content(f'<body style="margin:0;padding:8px;background:#0d1117;line-height:0">{cells}</body>')
        elif a.only:
            src = "media/readme/hero.svg" if a.only == "hero" else f"media/readme/tiles/{a.only}.svg"
            w = 1280 if a.only == "hero" else 400
            h = 560 if a.only == "hero" else 250
            bg = "#0d1117" if a.dark else "#ffffff"
            pg.set_viewport_size({"width": w + 40, "height": h + 40})
            pg.set_content(f'<body style="margin:0;padding:20px;background:{bg}"><img src="{base}/{src}" width="{w}"></body>')
            target = None
        else:
            pg.goto(f"{base}/scripts/readme_art/{a.page}", wait_until="load")
            # offscreen <img> SVGs do not animate: make the viewport as tall as the page, then reload
            wid = 960 if a.page == "preview.html" else 1840
            pg.set_viewport_size({"width": wid, "height": 900})
            hgt = pg.evaluate("document.documentElement.scrollHeight")
            pg.set_viewport_size({"width": wid, "height": hgt})
            pg.reload(wait_until="load")
        last = 0
        for t in [int(x) for x in a.times.split(",")]:
            pg.wait_for_timeout(max(0, t - last))
            last = t
            stem = a.page.split("#")[0][:-5] + ("-" + a.page.split("#")[1] if "#" in a.page else "")
            name = f"{('grid' if a.grid else '') or a.only or stem}{'-reduced' if a.reduced else ''}{'-dark' if a.dark else ''}-{t}.png"
            pg.screenshot(path=os.path.join(a.out, name), full_page=True)
            print("saved", name)
        b.close()


if __name__ == "__main__":
    main()
