"""Shared helpers for the README motion graphics.

Everything is plain SVG + CSS @keyframes so GitHub can render it through <img>:
no JavaScript, no web fonts, no external resources. Every animated element has a
sensible static state (its SVG attributes), which is what viewers who ask for
reduced motion see.
"""
import math
import random

SANS = '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'
MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
SERIF = 'Georgia, "Times New Roman", Times, serif'

# Site palette (site/assets/css/codex.css)
BG, BG2, BG3 = "#04050a", "#080b16", "#0b1020"
ICE, FLAME, NEBULA, PLASMA, AURORA, SOL = "#7cc8ff", "#ff7a3d", "#b18cff", "#ff4f9a", "#4ef0b8", "#ffc24b"
TEXT, TEXT2, MUTED, FAINT = "#e9edff", "#c3cae6", "#8f98bd", "#5d6589"

REDUCED = "@media (prefers-reduced-motion:reduce){*{animation:none!important}.rm-hide{display:none}}"
BASE_CSS = ("*{transform-origin:0 0}"
            f".sans{{font-family:{SANS}}}.mono{{font-family:{MONO}}}.serif{{font-family:{SERIF}}}")


def f(v, nd=1):
    """Compact number formatting."""
    s = f"{v:.{nd}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def kf(name, stops):
    """@keyframes from [(percent, 'decl;decl'), ...]."""
    body = "".join(f"{f(p, 2)}%{{{d}}}" for p, d in stops)
    return f"@keyframes {name}{{{body}}}"


def anim(sel, name, dur, timing="linear", delay=0.0, extra=""):
    """CSS rule. Delays are always made negative so every element is mid-loop at t=0."""
    d = -((-delay) % dur) if delay else 0
    dl = f" {f(d, 2)}s" if d else ""
    return f"{sel}{{animation:{name} {f(dur, 2)}s {timing}{dl} infinite{extra}}}"


def neg(delay, dur):
    return -((-delay) % dur)


def tr(x, y, rot=None, sc=None):
    s = f"translate({f(x)}px,{f(y)}px)"
    if rot is not None:
        s += f" rotate({f(rot)}deg)"
    if sc is not None:
        s += f" scale({f(sc, 2)})"
    return s


def rrpath(x, y, w, h, r):
    return (f"M{f(x + r)} {f(y)}H{f(x + w - r)}A{f(r)} {f(r)} 0 0 1 {f(x + w)} {f(y + r)}"
            f"V{f(y + h - r)}A{f(r)} {f(r)} 0 0 1 {f(x + w - r)} {f(y + h)}H{f(x + r)}"
            f"A{f(r)} {f(r)} 0 0 1 {f(x)} {f(y + h - r)}V{f(y + r)}A{f(r)} {f(r)} 0 0 1 {f(x + r)} {f(y)}Z")


def stars(seed, n, w, h, x0=0, y0=0, rmin=0.4, rmax=1.2, groups=4, prefix="t", colors=None, avoid=None):
    """Seeded starfield split into twinkle groups (<g class="t0">…)."""
    rng = random.Random(seed)
    buckets = [[] for _ in range(groups)]
    colors = colors or ["#ffffff"] * 6 + ["#cfe8ff", "#ffe7c2", "#e2d4ff"]
    for _ in range(n):
        x, y = x0 + rng.random() * w, y0 + rng.random() * h
        if avoid and avoid(x, y):
            continue
        r = rmin + (rmax - rmin) * rng.random() ** 2.2
        c = rng.choice(colors)
        o = 0.35 + 0.65 * rng.random()
        fill = "" if c == "#ffffff" else f' fill="{c}"'
        buckets[rng.randrange(groups)].append(
            f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r, 2)}"{fill} opacity="{f(o, 2)}"/>')
    return "".join(f'<g class="{prefix}{i}" fill="#fff">{"".join(b)}</g>' for i, b in enumerate(buckets) if b)


def twinkle_css(prefix="t", groups=4, base=2.8, step=0.9, lo=0.25):
    css = [kf(f"{prefix}w", [(0, "opacity:1"), (50, f"opacity:{lo}"), (100, "opacity:1")])]
    for i in range(groups):
        d = base + i * step
        css.append(anim(f".{prefix}{i}", f"{prefix}w", d, "ease-in-out", delay=-(i * 0.73) % d))
    return "".join(css)


def window_kf(name, start, end, fade=3.0, lo=0.0, hi=1.0, extra_in="", extra_out=""):
    """Opacity window: visible between start% and end% of the loop, faded over `fade`%."""
    stops = []
    if start - fade > 0:
        stops.append((0, f"opacity:{lo}{extra_in}"))
        stops.append((start - fade, f"opacity:{lo}{extra_in}"))
    else:
        stops.append((0, f"opacity:{lo}{extra_in}"))
    stops.append((start, f"opacity:{hi}"))
    stops.append((end, f"opacity:{hi}"))
    stops.append((min(end + fade, 100), f"opacity:{lo}{extra_out}"))
    if end + fade < 100:
        stops.append((100, f"opacity:{lo}{extra_out}"))
    return kf(name, stops)


def ellipse_pts(cx, cy, rx, ry, rot_deg, n, phase=0.0, direction=1):
    """Points on a rotated ellipse. Returns list of (x, y, depth) where depth>0 means near side."""
    a = math.radians(rot_deg)
    out = []
    for i in range(n + 1):
        t = phase + direction * 2 * math.pi * i / n
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        x = cx + ex * math.cos(a) - ey * math.sin(a)
        y = cy + ex * math.sin(a) + ey * math.cos(a)
        out.append((x, y, math.sin(t)))
    return out


def orbit_kf(name, pts, occl=None, size=(1.0, 1.0), extra=None):
    """Keyframes moving an element (drawn at 0,0) through pts; hides it behind an occluder.

    occl: (cx, cy, r) — points on the far side (depth<0) inside r are hidden.
    size: (far_scale, near_scale) for a cheap depth cue.
    """
    n = len(pts) - 1
    stops = []
    for i, (x, y, d) in enumerate(pts):
        sc = size[0] + (size[1] - size[0]) * (d + 1) / 2
        o = 1
        if occl:
            cx, cy, r = occl
            if d < 0 and math.hypot(x - cx, y - cy) < r:
                o = 0
        decl = f"transform:{tr(x, y, sc=sc)}"
        if occl:
            decl += f";opacity:{o}"
        stops.append((100 * i / n, decl))
    return kf(name, stops)


def ellipse_arc(cx, cy, rx, ry, rot_deg, t0, t1, n=40):
    """Polyline path along part of a rotated ellipse (angles in radians)."""
    a = math.radians(rot_deg)
    pts = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        ex, ey = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + ex * math.cos(a) - ey * math.sin(a), cy + ex * math.sin(a) + ey * math.cos(a)))
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts)


def bezier(p0, p1, p2, p3, t):
    u = 1 - t
    x = u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0]
    y = u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1]
    return x, y


def poly_len(pts):
    return sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(pts, pts[1:]))


def arclen_sampler(pts):
    """Return (L, fn(s)->(x, y, angle_deg)) for a polyline, s in [0,1] by arc length."""
    cum = [0.0]
    for a, b in zip(pts, pts[1:]):
        cum.append(cum[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    L = cum[-1]

    def at(s):
        d = max(0.0, min(1.0, s)) * L
        for i in range(1, len(cum)):
            if cum[i] >= d:
                seg = cum[i] - cum[i - 1] or 1e-9
                k = (d - cum[i - 1]) / seg
                a, b = pts[i - 1], pts[i]
                ang = math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
                return a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, ang
        a, b = pts[-2], pts[-1]
        return b[0], b[1], math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))
    return L, at


def pts_path(pts, close=False):
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts) + ("Z" if close else "")


def svg_doc(w, h, title, desc, defs, css, body, uid="a"):
    css_all = BASE_CSS + css + REDUCED
    return (f'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            f'viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" aria-labelledby="{uid}t {uid}d">'
            f'<title id="{uid}t">{title}</title><desc id="{uid}d">{desc}</desc>'
            f'<style>{css_all}</style><defs>{defs}</defs>{body}</svg>\n')
