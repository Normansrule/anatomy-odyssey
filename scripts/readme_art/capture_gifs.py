#!/usr/bin/env python3
"""Record animated GIF previews of the interactive pages for the README.

    python scripts/readme_art/capture_gifs.py              # every page below
    python scripts/readme_art/capture_gifs.py launch sky   # just these
    python scripts/readme_art/capture_gifs.py --screens    # the 3 still screenshots instead
    python scripts/readme_art/capture_gifs.py --keep ...   # keep the PNG frames (for checking)
    python scripts/readme_art/capture_gifs.py --list       # show the page ids

Output: media/gifs/<page>.gif (720x450, 12-15 fps, 3-6 s, looping; the encoder ladder
drops colours, then width, until a GIF is about 2.5 MB — see LADDER).

How it works
------------
Headless Chromium renders WebGL in software (SwiftShader), so a heavy page
draws at one frame every few seconds. Recording in real time would give a
slide show, so every page is driven by a *virtual clock* instead:

* An init script (VCLOCK_JS) replaces requestAnimationFrame, performance.now,
  Date.now and ``new Date()``. While the page loads, time runs normally.
  ``__vc.freeze()`` stops it; from then on the page only advances when the
  script calls ``__vc.step(ms)``, which moves the clock forward by exactly
  ``ms`` and runs every queued animation-frame callback once — i.e. one
  rendered frame per captured frame, whatever the render cost.
  (Playwright's own ``page.clock`` works too, but it fires a callback every
  16 ms of fake time, so a 67 ms frame step would render 4 times.)
* Every page caps its per-frame dt (0.05-0.1 s); steps stay under the cap
  or are split with ``sub`` so simulated time is exact.
* Pages are then positioned with their own test hooks (``window.__sim``,
  ``OrbitLab``, URL options such as ``?q=`` and ``?still``) — see RECIPES.
* Frames are screenshotted at 1440x900 and encoded with ffmpeg
  (lanczos scale to 720x450 or a 16:9 crop, palettegen stats_mode=diff +
  paletteuse), optionally ping-ponged so the loop is seamless.

Needs: Playwright + Chromium, ffmpeg, Pillow. No network (external requests are
blocked, like scripts/shot.py). A full run takes a long time on CPU rendering.
"""
import argparse, functools, http.server, os, shutil, subprocess, sys, tempfile, threading, time
from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
SITE = os.path.join(REPO, "site")
OUT = os.path.join(REPO, "media", "gifs")
W, H = 1440, 900

# ----------------------------------------------------------------- virtual clock
VCLOCK_JS = r"""
(() => {
  const P = performance, realNow = P.now.bind(P), RD = Date, realDateNow = RD.now.bind(RD);
  const realRAF = window.requestAnimationFrame.bind(window), realCAF = window.cancelAnimationFrame.bind(window);
  let frozen = false, vt = 0, dateOff = 0, nextId = 1, queue = new Map();
  const now = () => frozen ? vt : realNow();
  P.now = now;
  class VDate extends RD {
    constructor(...a) { if (a.length === 0) super(VDate.now()); else super(...a); }
    static now() { return frozen ? vt + dateOff : realDateNow(); }
  }
  window.Date = VDate;
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    queue.set(id, cb);
    if (!frozen) realRAF(() => { if (frozen || !queue.has(id)) return; queue.delete(id); cb(now()); });
    return id;
  };
  window.cancelAnimationFrame = (id) => { queue.delete(id); };
  // timers: real until freeze(); afterwards they fire inside step() at their virtual time
  const rST = window.setTimeout.bind(window), rCT = window.clearTimeout.bind(window);
  const rSI = window.setInterval.bind(window), rCI = window.clearInterval.bind(window);
  let tid = 1e9; const timers = new Map();
  const vset = (fn, d, rep, args) => { const id = tid++; timers.set(id, { fn, at: vt + Math.max(0, +d || 0), d: Math.max(1, +d || 0), rep, args }); return id; };
  window.setTimeout = (fn, d, ...a) => frozen ? vset(fn, d, false, a) : rST(fn, d, ...a);
  window.setInterval = (fn, d, ...a) => frozen ? vset(fn, d, true, a) : rSI(fn, d, ...a);
  window.clearTimeout = (id) => { if (id >= 1e9) timers.delete(id); else rCT(id); };
  window.clearInterval = (id) => { if (id >= 1e9) timers.delete(id); else rCI(id); };
  const runTimers = () => {
    for (let guard = 0; guard < 1000; guard++) {
      let best = null;
      for (const [id, t] of timers) if (t.at <= vt && (!best || t.at < best[1].at)) best = [id, t];
      if (!best) return;
      const [id, t] = best;
      if (t.rep) t.at += t.d; else timers.delete(id);
      try { typeof t.fn === 'function' ? t.fn(...t.args) : eval(t.fn); } catch (e) { console.error('timer error', e); }
    }
  };
  window.__vc = {
    freeze() { if (!frozen) { vt = realNow(); dateOff = realDateNow() - vt; frozen = true; } return vt; },
    // setDate(ms since epoch): change what Date.now() reports (sim pages that use wall-clock time)
    setDate(ms) { dateOff = ms - (frozen ? vt : realNow()); },
    step(ms = 1000 / 15, sub = 1) {
      for (let i = 0; i < sub; i++) {
        vt += ms / sub;
        runTimers();
        const cbs = [...queue.values()]; queue.clear();
        for (const cb of cbs) { try { cb(vt); } catch (e) { console.error('frame error', e); } }
      }
      return vt;
    },
    pending: () => queue.size,
    get frozen() { return frozen; }
  };
})();
"""


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=SITE))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# ----------------------------------------------------------------- recipes
# Each recipe: url (with query), setup(page) run after load (freezes the clock), frames,
# step (ms of page time per frame), sub (rAF calls per frame), per(page, i) optional
# per-frame hook, counter (JS frame counter to wait on), fps, crop (x, y, w, h in the
# 1440x900 shot) or None, loop: 'pingpong' | 'none', hold (repeat the last frame n times),
# select(n) -> frame indices to keep, settle: steps to run before recording.
# NB: page.evaluate() tries to serialise what an expression returns — end expressions that
# return big live objects (GSAP timelines, THREE objects) with "; 0" or it can hang.

def wait_ready(p, js, timeout=240):
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            if p.evaluate(js):
                return True
        except Exception:
            pass
        time.sleep(1)
    print("  ! ready-check timed out:", js)
    return False


def hide_loading(p):
    p.add_style_tag(content=".loading{display:none!important}")


def uncheck(p, el_id):
    """Turn off a page switch (e.g. camera shake: it changes every pixel, which bloats a GIF)."""
    p.evaluate("id => { const e = document.getElementById(id); if (e && e.checked) { e.checked = false; e.dispatchEvent(new Event('change')); } }", el_id)


RECIPES = {}


def recipe(name, **kw):
    def deco(fn):
        RECIPES[name] = dict(setup=fn, **kw)
        return fn
    return deco


# Launch: Saturn V countdown -> ignition -> liftoff clearing the tower (director camera,
# wide then pad camera). Sim at 2.5x (0.25 s per frame): T-1.5 s to T+12 s.
@recipe("launch", url="launch.html", frames=54, step=100, fps=12, loop="none", hold=4)
def _launch(p):
    wait_ready(p, "document.getElementById('loading').classList.contains('done')")
    p.evaluate("__vc.freeze()")
    uncheck(p, "shake")
    p.evaluate("__sim.jump(-1.5); __sim.cam('auto'); __sim.warp(2.5)")
    hide_loading(p)


# Booster: the last ~130 m of the hoverslam onto the drone ship, to touchdown. Chase
# camera raised a little so the deck is in frame; 0.1 s of sim per frame (1.2x; the first
# 2.4 s are thinned to every other frame to keep the file small).
@recipe("booster", url="booster.html", frames=60, step=100, fps=12, loop="none", wait=8000, hold=4,
        select=lambda n: list(range(0, 24, 2)) + list(range(24, n - 1)))   # last frame: outcome card
def _booster(p):
    p.evaluate("__vc.freeze()")
    uncheck(p, "shake")
    p.evaluate("__sim.phase('landing', 8.8); __sim.cam('chase'); __sim.orbit(0, 0.3, 1.45)")
    hide_loading(p)


# Moon landing: Apollo 11 from 150 m to contact light at 20x (the HUD shows the warp). The GIF
# keeps every other frame from ~120 m (so it runs ~40x), then real time for contact light and shutdown.
@recipe("moon-landing", url="moon-landing.html?mode=watch", frames=76, step=100, fps=12, loop="none", wait=10000,
        select=lambda n: list(range(8, 60, 2)) + list(range(60, n)),
        per=lambda p, i: p.evaluate("__sim.state().td && __sim.warp(1)"))
def _moon(p):
    p.evaluate("__vc.freeze()")
    p.evaluate("__sim.start('pdi', 'watch'); __sim.toAlt(150); __sim.cam('auto'); __sim.warp(20)")
    hide_loading(p)


# Mars 2020: the sky crane lowers Perseverance to touchdown, then the flyaway starts (3x).
@recipe("mars-landing", url="mars-landing.html", frames=52, step=100, fps=12, loop="none", wait=20000, hold=6)
def _mars(p):
    wait_ready(p, "(() => { try { return !!__sim.flight; } catch (e) { return false; } })()", 120)
    p.evaluate("__vc.freeze()")
    uncheck(p, "shake")
    p.evaluate("__sim.jump(404.2); __sim.speed(3); __sim.play(true); __sim.cam('auto')")
    hide_loading(p)


# Black hole: a slow 90-degree camera orbit around the disk with a gentle elevation swing
# (the swing loops seamlessly; the disk looks alike from every azimuth, so only the lensed
# background stars jump at the loop). Rendered at 60 % resolution with adaptive scaling off;
# the page skips a frame while the GPU is busy, so each step waits for its frame counter.
BH_N = 36
@recipe("black-hole", url="black-hole.html?adaptive=0&scale=0.6", frames=BH_N, step=83.33, fps=12, loop="none",
        counter="window.__framesDone || 0",
        per=lambda p, i: p.evaluate("""k => { const s = BH.state, a = -0.35 - (Math.PI / 2) * k;
            s.az = s.tAz = a; s.elev = s.tElev = 9 + 5 * Math.sin(2 * Math.PI * k); }""", i / BH_N))
def _bh(p):
    wait_ready(p, "document.getElementById('loading').classList.contains('done')")
    p.evaluate("__vc.freeze(); BH.state.autoOrbit = false")
    hide_loading(p)


# Sun (white light): slow rotation and cinematic orbit, then a flare and the coronal mass ejection
# (GSAP timeline sped up 1.5x so the eruption fits).
@recipe("sun", url="sun.html?q=1", frames=48, step=100, fps=12, loop="none", wait=6000,
        per=lambda p, i: i == 3 and p.evaluate("__sun.flare(); gsap.globalTimeline.timeScale(1.5); 0"))
def _sun(p):
    wait_ready(p, "document.getElementById('loading').classList.contains('done')")
    p.wait_for_timeout(2000)
    p.evaluate("__vc.freeze(); __sun.skipIntro(); __sun.setFilter(SUN_FILTER); 0".replace("SUN_FILTER", "0"))
    hide_loading(p)


# Solar System: time-lapse, 10 days per frame (~16 months), default view after the intro.
@recipe("solar-system", url="solar-system.html", frames=48, step=83.33, fps=12, loop="none", wait=4000,
        per=lambda p, i: p.evaluate("SolarSystem.state.ms += 10 * 86400e3"))
def _solar(p):
    wait_ready(p, "window.SolarSystem && !SolarSystem.state.intro", 300)
    p.evaluate("__vc.freeze(); SolarSystem.pause(); 0")
    hide_loading(p)


# Earth: offline illustrative mode, 3600x — the globe turns and the satellite shells stream.
@recipe("earth", url="earth.html?offline", frames=48, step=83.33, fps=12, loop="none", wait=4000)
def _earth(p):
    wait_ready(p, "window.__sim && __sim.ready && __sim.count > 0", 300)
    p.evaluate("__vc.freeze(); __sim.speed(6); 0")
    hide_loading(p)


# Sky: a night over Los Angeles, looking north, 8 minutes per frame (19:30 to 01:30 PDT): stars wheel round Polaris.
SKY_T0 = "2026-10-10T02:30:00Z"      # 19:30 PDT, two days after new moon
@recipe("sky", url="sky.html?fps=120&loc=la&tz=site&az=0&alt=34&fov=118", frames=45, step=83.33, fps=12, loop="none", wait=3000,
        per=lambda p, i: p.evaluate("([t, i]) => __sim.setTime(Date.parse(t) + i * 8 * 60e3)", [SKY_T0, i]))
def _sky(p):
    wait_ready(p, "window.__sim && __sim.state && __sim.state()", 300)
    p.evaluate("__vc.freeze()")
    p.evaluate("t => __sim.setTime(t)", SKY_T0)
    hide_loading(p)


# Scale: powers-of-ten zoom from a person out to the Milky Way (eased), then a short hold.
def _scale_z(i, n=64, z0=0.23, z1=21.2):
    k = min(1.0, i / (n - 1))
    k = k * k * (3 - 2 * k)
    return z0 + (z1 - z0) * k


@recipe("scale", url="scale.html", frames=64, step=83.33, sub=3, fps=12, loop="none", wait=3000, hold=8,
        per=lambda p, i: p.evaluate("z => __sim.setScale(z)", _scale_z(i)))
def _scale(p):
    wait_ready(p, "!!(window.__sim && window.__sim.setScale)", 300)
    p.evaluate("__vc.freeze(); __sim.setScale(0.23)")
    hide_loading(p)


# Orbits: Newton's cannonball — the four preset shots (falls back, circular, ellipse,
# escape) fired one after another and traced at the page's own pace (real time).
ORBIT_SHOTS = {2: "6.2", 14: "circ", 26: "9.4", 38: "esc"}
@recipe("orbits", url="orbits.html#cannon", frames=84, step=66.67, sub=2, fps=15, loop="none", wait=300,
        per=lambda p, i: i in ORBIT_SHOTS and p.click(f'#cPresets [data-v="{ORBIT_SHOTS[i]}"]'))
def _orbits(p):
    p.evaluate("__vc.freeze()")
    p.click("#secondary")          # clear the automatic demo shots; the recipe fires its own
    hide_loading(p)


# Hangar: a slow dolly along the line-up (oldest first, V-2 to the Space Shuttle), camera kept
# square-on to the arc of rockets. __dolly(u) interpolates between the rockets' own positions.
HANGAR_JS = """
(() => {
  const T = __sim.three, rs = __sim.state().order.map(id => T.rockets.find(r => r.id === id)).filter(Boolean);
  const P = rs.map(r => r.holder.position.clone()), H = rs.map(r => r.h);
  const cam0 = T.camera.position.clone();
  const at = (arr, x) => { const i = Math.max(0, Math.min(arr.length - 2, Math.floor(x))), f = Math.min(1, Math.max(0, x - i));
    return arr[i].clone ? arr[i].clone().lerp(arr[i + 1], f) : arr[i] + (arr[i + 1] - arr[i]) * f; };
  window.__dolly = (u, i0, i1, dist, fovH) => {
    const x = i0 + (i1 - i0) * u, t = at(P, x);
    const a = at(P, Math.max(0, x - 0.5)), b = at(P, Math.min(P.length - 1, x + 0.5));
    const tan = b.sub(a); tan.y = 0; tan.normalize();
    const n = { x: -tan.z, z: tan.x };
    if (n.x * (cam0.x - t.x) + n.z * (cam0.z - t.z) < 0) { n.x = -n.x; n.z = -n.z; }
    const ty = fovH * 0.42;
    __sim.cam(t.x + n.x * dist, ty * 0.55, t.z + n.z * dist, t.x, ty, t.z);
    return 0;
  };
  return rs.map(r => r.id).join(',');
})()
"""
HANGAR = dict(i0=0.5, i1=8.5, dist=230.0, fovH=120.0)


def _hangar_u(i, n):
    k = i / (n - 1)
    return k * k * (3 - 2 * k)


@recipe("hangar", url="hangar.html?q=medium", frames=44, step=83.33, fps=12, loop="none", wait=5000, hold=3,
        per=lambda p, i: p.evaluate("([u, a, b, d, h]) => __dolly(u, a, b, d, h)",
                                    [_hangar_u(i, 44), HANGAR["i0"], HANGAR["i1"], HANGAR["dist"], HANGAR["fovH"]]))
def _hangar(p):
    wait_ready(p, "!!(window.__sim && __sim.ready)", 600)
    p.wait_for_timeout(6000)                  # let the opening camera flight finish
    print("  line-up:", p.evaluate(HANGAR_JS))
    p.evaluate("__vc.freeze()")
    hide_loading(p)


# Galaxies: the Milky Way and Andromeda's first close pass (3.8 -> ~4.6 billion years from
# now, pericentre ~4.0), 24 leapfrog steps (~17 Myr) per frame via the page's own __sim.step.
@recipe("galaxies", url="galaxies.html?q=low", frames=48, step=83.33, fps=12, loop="none", wait=5000, hold=4,
        per=lambda p, i: p.evaluate("__sim.step(24); 0"))
def _galaxies(p):
    wait_ready(p, "!!(window.__sim && __sim.ready)", 300)
    p.evaluate("__vc.freeze(); __sim.pause(); __sim.seek(3.8); __sim.view('overview'); 0")
    hide_loading(p)


# Rocket Builder: the default Moon-rocket design in flight — first-stage burnout, separation
# and second-stage ignition (T+162 s to T+168 s, 1.25x), chase camera.
@recipe("builder", url="builder.html", frames=48, step=100, fps=12, loop="none", wait=5000, hold=4)
def _builder(p):
    wait_ready(p, "document.getElementById('loading').classList.contains('done')", 300)
    p.wait_for_timeout(3000)
    p.evaluate("__vc.freeze(); __sim.launch(); __sim.jump(162.4); __sim.cam('chase'); __sim.warp(1.25); 0")
    hide_loading(p)


# Space weather: the hero scene (offline sample of the May 2024 storm) — solar wind streaming
# past the bow shock and the compressed magnetosphere. The scene caps dt at 0.05 s.
@recipe("space-weather", url="space-weather.html?offline", frames=48, step=50, fps=12, loop="none", wait=5000)
def _space_weather(p):
    wait_ready(p, "!!(window.__sim && __sim.scene && document.getElementById('loading').classList.contains('done'))", 300)
    p.wait_for_timeout(3000)
    p.evaluate("__vc.freeze()")
    hide_loading(p)


def capture(p, name, r, frames_dir):
    os.makedirs(frames_dir, exist_ok=True)
    for i in range(r.get("settle", 3)):
        p.evaluate("([s,n]) => __vc.step(s,n)", [r["step"], r.get("sub", 1)])
    t0 = time.time()
    for i in range(r["frames"]):
        if r.get("per"):
            r["per"](p, i)
        c0 = p.evaluate(r["counter"]) if r.get("counter") else None
        p.evaluate("([s,n]) => __vc.step(s,n)", [r["step"], r.get("sub", 1)])
        if r.get("counter"):
            for _ in range(600):              # the page skipped the frame (GPU busy): run it again at dt = 0
                if p.evaluate(r["counter"]) != c0:
                    break
                time.sleep(0.2)
                p.evaluate("__vc.step(0)")
        p.screenshot(path=os.path.join(frames_dir, f"f{i:04d}.png"), timeout=600_000)
        if i % 10 == 0:
            print(f"  frame {i}/{r['frames']}  {time.time() - t0:.0f}s", flush=True)


# Encoder ladder: first setting under TARGET_MB wins; otherwise the first 720 px one under
# SOFT_MB; otherwise the smallest. (Hard cap CAP_MB: shorten the recipe if it is exceeded.)
TARGET_MB, SOFT_MB, CAP_MB = 2.5, 2.9, 4.0
LADDER = [(720, 192, "bayer:bayer_scale=5"), (720, 128, "bayer:bayer_scale=5"), (720, 128, "none"),
          (720, 96, "none"), (720, 64, "none"), (640, 64, "none")]


def ffmpeg_gif(seq, fps, crop, width, colors, dither, out_path):
    vf = []
    if crop:
        x, y, w, h = crop
        vf.append(f"crop={w}:{h}:{x}:{y}")
    vf.append(f"scale={width}:-2:flags=lanczos")
    graph = (",".join(vf) + f",split[a][b];[a]palettegen=max_colors={colors}:stats_mode=diff[p];"
             f"[b][p]paletteuse=dither={dither}:diff_mode=rectangle")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", str(fps), "-i", os.path.join(seq, "s%04d.png"),
                    "-filter_complex", graph, "-loop", "0", out_path], check=True)
    return os.path.getsize(out_path) / 1e6


def encode(name, r, frames_dir, out_path):
    files = sorted(f for f in os.listdir(frames_dir) if f.startswith("f") and f.endswith(".png"))
    files = files[r.get("skip", 0):]
    if r.get("select"):                                 # e.g. drop every other frame of a long stretch
        files = [files[i] for i in r["select"](len(files)) if i < len(files)]
    order = list(files)
    if r.get("loop") == "pingpong":
        order = files + files[-2:0:-1]
    order += [files[-1]] * r.get("hold", 0)          # linger on the last frame before looping
    seq = tempfile.mkdtemp(prefix="seq-", dir=frames_dir)
    for i, f in enumerate(order):
        os.symlink(os.path.join(frames_dir, f), os.path.join(seq, f"s{i:04d}.png"))
    ladder = r.get("ladder", LADDER)
    tries = []
    tmp = out_path + ".tmp.gif"
    for width, colors, dither in ladder:
        mb = ffmpeg_gif(seq, r["fps"], r.get("crop"), width, colors, dither, tmp)
        print(f"     {width}px {colors}c {dither}: {mb:.2f} MB")
        keep = tmp + f".{len(tries)}"
        os.replace(tmp, keep)
        tries.append((mb, width, colors, dither, keep))
        if mb <= TARGET_MB:
            break
    # first full-width (720 px) try under TARGET_MB, else the fewest-colour 720 px one if under SOFT_MB;
    # else any try under the target; else the smallest
    full = [t for t in tries if t[1] == ladder[0][0]]
    pick = next((t for t in full if t[0] <= TARGET_MB), None) \
        or next((t for t in full[-1:] if t[0] <= SOFT_MB), None) \
        or next((t for t in tries if t[0] <= TARGET_MB), None) or min(tries)
    os.replace(pick[4], out_path)
    for t in tries:
        if os.path.exists(t[4]):
            os.remove(t[4])
    best = pick[1:4]
    shutil.rmtree(seq)
    mb = os.path.getsize(out_path) / 1e6
    print(f"  -> {os.path.relpath(out_path, REPO)}  {mb:.2f} MB  {len(order)} frames  {len(order) / r['fps']:.1f} s  {best}")
    return mb


def open_page(b, base, url, wait):
    ctx = b.new_context(viewport={"width": W, "height": H}, device_scale_factor=1)
    ctx.set_default_timeout(600_000)
    ctx.add_init_script(VCLOCK_JS)
    p = ctx.new_page()
    p.route("**/*", lambda rt: rt.continue_() if rt.request.url.startswith(("http://127.0.0.1", "data:", "blob:")) else rt.abort())
    p.on("pageerror", lambda e: print("  [pageerror]", e))
    p.on("console", lambda m: m.type == "error" and print("  [console.error]", m.text[:200]))
    p.goto(base + url, wait_until="load", timeout=600_000)
    p.wait_for_timeout(wait)
    return ctx, p


def launch_browser(pw):
    return pw.chromium.launch(args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
                                    "--ignore-gpu-blocklist"])


def run(names, keep, frames_root):
    srv = serve()
    base = f"http://127.0.0.1:{srv.server_address[1]}/"
    os.makedirs(OUT, exist_ok=True)
    with sync_playwright() as pw:
        b = launch_browser(pw)
        for name in names:
            r = RECIPES[name]
            print(f"[{name}]", flush=True)
            ctx, p = open_page(b, base, r["url"], r.get("wait", 1500))
            r["setup"](p)
            fdir = os.path.join(frames_root, name)
            shutil.rmtree(fdir, ignore_errors=True)
            capture(p, name, r, fdir)
            encode(name, r, fdir, os.path.join(OUT, f"{name}.gif"))
            if not keep:
                shutil.rmtree(fdir, ignore_errors=True)
            ctx.close()
        b.close()


# ----------------------------------------------------------------- still screenshots
# For the three newest pages: media/screens/<id>.jpg (1440x900 with the nav bar, quality 84)
# and the landing-page thumbnail site/assets/img/screens/<id>.jpg (crop y 60-870, 800x450, q80).
def _still_builder(p):
    wait_ready(p, "document.getElementById('loading').classList.contains('done')", 300)
    p.wait_for_timeout(4000)


def _still_space_weather(p):
    wait_ready(p, "!!(window.__sim && __sim.scene && document.getElementById('loading').classList.contains('done'))", 300)
    p.wait_for_timeout(5000)


def _still_galaxies(p):
    wait_ready(p, "!!(window.__sim && __sim.ready)", 300)
    p.evaluate("__vc.freeze(); __sim.pause(); __sim.seek(4.4); __sim.view('overview'); 0")
    for _ in range(4):
        p.evaluate("__vc.step(83)")


STILLS = {"builder": ("builder.html", _still_builder), "space-weather": ("space-weather.html?offline", _still_space_weather),
          "galaxies": ("galaxies.html?q=low", _still_galaxies)}


def stills(names):
    from PIL import Image
    srv = serve()
    base = f"http://127.0.0.1:{srv.server_address[1]}/"
    shots, thumbs = os.path.join(REPO, "media", "screens"), os.path.join(SITE, "assets", "img", "screens")
    os.makedirs(shots, exist_ok=True); os.makedirs(thumbs, exist_ok=True)
    with sync_playwright() as pw:
        b = launch_browser(pw)
        for name in names:
            url, setup = STILLS[name]
            print(f"[still {name}]", flush=True)
            ctx, p = open_page(b, base, url, 3000)
            setup(p)
            hide_loading(p)
            png = os.path.join(tempfile.gettempdir(), f"still-{name}.png")
            p.screenshot(path=png, timeout=600_000)
            ctx.close()
            im = Image.open(png).convert("RGB")
            im.save(os.path.join(shots, f"{name}.jpg"), quality=84, optimize=True, progressive=True)
            im.crop((0, 60, W, 870)).resize((800, 450), Image.LANCZOS).save(
                os.path.join(thumbs, f"{name}.jpg"), quality=80, optimize=True, progressive=True)
            print(f"  -> media/screens/{name}.jpg, site/assets/img/screens/{name}.jpg")
        b.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pages", nargs="*")
    ap.add_argument("--keep", action="store_true", help="keep the PNG frames")
    ap.add_argument("--frames", default=os.path.join(tempfile.gettempdir(), "cosmic-gif-frames"))
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--nframes", type=int, help="override the frame count (quick tests)")
    ap.add_argument("--encode-only", action="store_true", help="re-encode kept frames without recapturing")
    ap.add_argument("--skip", type=int, default=0, help="with --encode-only: drop the first N kept frames")
    ap.add_argument("--screens", action="store_true", help="only take the still screenshots (STILLS)")
    a = ap.parse_args()
    if a.list:
        print("gifs:", " ".join(RECIPES)); print("stills (--screens):", " ".join(STILLS)); return
    if a.screens:
        stills(a.pages or list(STILLS)); return
    names = a.pages or list(RECIPES)
    bad = [n for n in names if n not in RECIPES]
    if bad:
        sys.exit(f"unknown page(s): {bad}; choose from {list(RECIPES)}")
    if a.encode_only:
        for n in names:
            r = dict(RECIPES[n]); r["skip"] = a.skip or r.get("skip", 0)
            encode(n, r, os.path.join(a.frames, n), os.path.join(OUT, f"{n}.gif"))
        return
    if a.nframes:
        for n in names:
            RECIPES[n]["frames"] = a.nframes
    run(names, a.keep, a.frames)


if __name__ == "__main__":
    main()
