#!/usr/bin/env python3
"""Screenshot a Cosmic Library page in headless Chromium (WebGL via SwiftShader).

    python scripts/shot.py launch.html out.png [--wait 4000] [--w 1440 --h 900]
        [--click "#launchBtn"] [--eval "js code"] [--full]

Starts its own static server on the site/ folder, prints browser console
errors, and exits non-zero if the page threw an uncaught exception.
"""
import argparse, functools, http.server, os, sys, threading
from playwright.sync_api import sync_playwright

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site")

def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    h = functools.partial(Quiet, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), h)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("page"); ap.add_argument("out")
    ap.add_argument("--wait", type=int, default=3500)
    ap.add_argument("--w", type=int, default=1440); ap.add_argument("--h", type=int, default=900)
    ap.add_argument("--click", action="append", default=[])
    ap.add_argument("--eval", action="append", default=[])
    ap.add_argument("--full", action="store_true")
    ap.add_argument("--mobile", action="store_true")
    a = ap.parse_args()
    srv = serve()
    url = f"http://127.0.0.1:{srv.server_address[1]}/{a.page}"
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
        ctx = b.new_context(viewport={"width": 390 if a.mobile else a.w, "height": 844 if a.mobile else a.h},
                            device_scale_factor=1, is_mobile=a.mobile, has_touch=a.mobile)
        pg = ctx.new_page()
        # Offline sandbox: external requests (fonts, NASA images) fail fast instead of hanging.
        pg.route("**/*", lambda r: r.continue_() if r.request.url.startswith("http://127.0.0.1") or r.request.url.startswith("data:") else r.abort())
        pg.on("console", lambda m: m.type in ("error", "warning") and print(f"[console.{m.type}] {m.text}"))
        pg.on("pageerror", lambda e: (errors.append(str(e)), print(f"[pageerror] {e}")))
        pg.goto(url, wait_until="load")
        pg.wait_for_timeout(600)
        for sel in a.click:
            pg.click(sel); pg.wait_for_timeout(300)
        for js in a.eval:
            print("[eval]", pg.evaluate(js))
        pg.wait_for_timeout(a.wait)
        pg.screenshot(path=a.out, full_page=a.full)
        b.close()
    print("saved", a.out)
    sys.exit(1 if errors else 0)

if __name__ == "__main__":
    main()
