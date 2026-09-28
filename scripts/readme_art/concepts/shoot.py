#!/usr/bin/env python3
"""Screenshot README concept SVGs as GitHub shows them (<img>, ~800 px wide).

    python scripts/readme_art/concepts/shoot.py OUTDIR name[.svg] ... [--times 0.5,3,6]
        [--width 800] [--bg dark|light] [--reduced] [--preview]

--preview screenshots preview.html (all figures on white and #0d1117) instead.
"""
import argparse
import os
import pathlib
from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
MEDIA = (HERE / ".." / ".." / ".." / "media" / "readme" / "concepts").resolve()
ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("out")
    ap.add_argument("names", nargs="*")
    ap.add_argument("--times", default="1,4")
    ap.add_argument("--width", type=int, default=800)
    ap.add_argument("--bg", default="dark")
    ap.add_argument("--reduced", action="store_true")
    ap.add_argument("--preview", action="store_true")
    a = ap.parse_args()
    os.makedirs(a.out, exist_ok=True)
    times = [float(t) for t in a.times.split(",")]
    bg = "#0d1117" if a.bg == "dark" else "#ffffff"
    with sync_playwright() as p:
        b = p.chromium.launch(args=ARGS)
        ctx = b.new_context(viewport={"width": a.width + 40, "height": 900}, device_scale_factor=1,
                            reduced_motion="reduce" if a.reduced else "no-preference")
        if a.preview:
            pg = ctx.new_page()
            pg.set_viewport_size({"width": 1760, "height": 1000})
            pg.goto((HERE / "preview.html").as_uri())
            for t in times:
                pg.wait_for_timeout(int(t * 1000) if t == times[0] else int((t - times[times.index(t) - 1]) * 1000))
                pg.screenshot(path=os.path.join(a.out, f"preview-{t:g}s.png"), full_page=True)
            b.close()
            return
        for n in a.names:
            n = n if n.endswith(".svg") else n + ".svg"
            html = (f"<html><body style='margin:0;padding:20px;background:{bg}'>"
                    f"<img id='i' src='{(MEDIA / n).as_uri()}' width='{a.width}'></body></html>")
            tmp = pathlib.Path(a.out) / "_shot.html"
            tmp.write_text(html)
            pg = ctx.new_page()
            # emulated reduced motion does not reach SVG-as-image documents, so open the SVG itself
            pg.goto((MEDIA / n).as_uri() if a.reduced else tmp.as_uri())
            prev = 0.0
            for t in times:
                pg.wait_for_timeout(int((t - prev) * 1000))
                prev = t
                tag = "rm" if a.reduced else f"{t:g}s"
                (pg.locator("svg") if a.reduced else pg.locator("#i")).screenshot(path=os.path.join(a.out, f"{n[:-4]}-{a.bg}-{tag}.png"))
            pg.close()
        b.close()


if __name__ == "__main__":
    main()
