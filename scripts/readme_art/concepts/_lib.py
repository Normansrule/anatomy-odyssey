"""Shared helpers for the README concept animations (media/readme/concepts/).

Each figure is a self-contained SVG that GitHub can show through <img>:
no JavaScript, no web fonts, no external resources, no <foreignObject>.
Motion is CSS @keyframes (preferred: `animation:none` leaves the element in its
static attribute state, which is the reduced-motion frame) or SMIL where CSS
cannot animate an attribute (polygon points, line end points, discrete digit
counters). SMIL cannot be switched off by a media query, so SMIL-driven parts
live in <g class="smil"> and have a static twin in <g class="still">.
"""
import math
import os
import random
import xml.dom.minidom

SANS = '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif'
MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

BG0, BG1 = "#04050a", "#0b1020"
ICE, FLAME, NEBULA, PLASMA, AURORA, SOL = "#7cc8ff", "#ff7a3d", "#b18cff", "#ff4f9a", "#4ef0b8", "#ffc24b"
TEXT, TEXT2, MUTED, FAINT = "#e9edff", "#c3cae6", "#8f98bd", "#5d6589"
LINE, GRID = "#232b4d", "#161d36"

OUT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                    "..", "..", "..", "media", "readme", "concepts"))

BASE_CSS = (
    f".s{{font-family:{SANS}}}.m{{font-family:{MONO}}}"
    ".smil,.still{}.still{display:none}"
    "@media (prefers-reduced-motion:reduce){*{animation:none!important}"
    ".smil{display:none}.still{display:inline}}"
)


def f(v, nd=1):
    s = f"{v:.{nd}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def kf(name, stops):
    """@keyframes from [(fraction 0..1, 'decl;decl'), ...]."""
    body = "".join(f"{f(p * 100, 3)}%{{{d}}}" for p, d in stops)
    return f"@keyframes {name}{{{body}}}"


def anim(sel, name, dur, timing="linear", delay=0.0, extra=""):
    d = f" {f(delay, 3)}s" if delay else ""
    return f"{sel}{{animation:{name} {f(dur, 3)}s {timing}{d} infinite{extra}}}"


def tr(x, y, rot=None, sc=None):
    s = f"translate({f(x, 2)}px,{f(y, 2)}px)"
    if rot is not None:
        s += f" rotate({f(rot, 2)}deg)"
    if sc is not None:
        s += f" scale({f(sc, 3)})"
    return s


def fade_stops(t_in0, t_in1, t_out0, t_out1, lo=0.0, hi=1.0):
    """Opacity stops for a fade-in / hold / fade-out window (all loop fractions)."""
    st = [(0, f"opacity:{f(lo, 2)}")]
    for t, o in ((t_in0, lo), (t_in1, hi), (t_out0, hi), (t_out1, lo)):
        if 0 < t < 1:
            st.append((t, f"opacity:{f(o, 2)}"))
    st.append((1, f"opacity:{f(lo if t_out1 < 1 else hi, 2)}"))
    return st


def stars(seed, n, w, h, x0=0, y0=0, avoid=None, rmax=1.1):
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        x, y = x0 + rng.random() * w, y0 + rng.random() * h
        if avoid and avoid(x, y):
            continue
        r = 0.35 + (rmax - 0.35) * rng.random() ** 2.4
        o = 0.25 + 0.55 * rng.random()
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r, 2)}" opacity="{f(o, 2)}"/>')
    return f'<g fill="#dfe8ff">{"".join(out)}</g>'


def card(w, h, seed=1, nstars=60, avoid=None):
    """Dark rounded card with a subtle border, glow and a seeded starfield."""
    return (
        '<defs><linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0" stop-color="{BG1}"/><stop offset="1" stop-color="{BG0}"/></linearGradient>'
        f'<radialGradient id="cglow" cx=".15" cy="0" r=".9"><stop offset="0" stop-color="{NEBULA}" stop-opacity=".10"/>'
        f'<stop offset="1" stop-color="{NEBULA}" stop-opacity="0"/></radialGradient>'
        f'<clipPath id="cclip"><rect x="1" y="1" width="{w - 2}" height="{h - 2}" rx="15"/></clipPath></defs>'
        f'<rect x=".5" y=".5" width="{w - 1}" height="{h - 1}" rx="16" fill="url(#cbg)"/>'
        f'<rect x=".5" y=".5" width="{w - 1}" height="{h - 1}" rx="16" fill="url(#cglow)"/>'
        f'<g clip-path="url(#cclip)">{stars(seed, nstars, w, h, avoid=avoid)}</g>'
        f'<rect x=".5" y=".5" width="{w - 1}" height="{h - 1}" rx="16" fill="none" stroke="#2a3358" stroke-opacity=".9"/>'
    )


def header(x, y, eyebrow, title, color=ICE, size=19):
    return (f'<text x="{x}" y="{y}" class="m" font-size="11" letter-spacing="1.6" fill="{color}">{esc(eyebrow)}</text>'
            f'<text x="{x}" y="{y + 23}" class="s" font-size="{size}" font-weight="700" fill="{TEXT}">{esc(title)}</text>')


def text(x, y, s, size=12, fill=TEXT, cls="s", anchor="start", weight=None, extra=""):
    a = f' text-anchor="{anchor}"' if anchor != "start" else ""
    wt = f' font-weight="{weight}"' if weight else ""
    return f'<text x="{f(x)}" y="{f(y)}" class="{cls}" font-size="{size}" fill="{fill}"{a}{wt}{extra}>{esc(s)}</text>'


def svg(w, h, title, desc, body, css="", name=None):
    doc = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'role="img" aria-labelledby="ttl dsc">'
        f'<title id="ttl">{esc(title)}</title><desc id="dsc">{esc(desc)}</desc>'
        f'<style>{BASE_CSS}{css}</style>{body}</svg>'
    )
    if name:
        write(name, doc)
    return doc


def write(name, doc):
    xml.dom.minidom.parseString(doc.encode("utf-8"))  # well-formedness check
    os.makedirs(OUT, exist_ok=True)
    p = os.path.join(OUT, name)
    with open(p, "w", encoding="utf-8") as fh:
        fh.write(doc)
    kb = len(doc.encode("utf-8")) / 1024
    assert kb <= 60, f"{name} is {kb:.1f} KB (> 60 KB)"
    print(f"  {name:24s} {kb:5.1f} KB")
    return p


def smil_values(vals):
    return ";".join(vals)


def keytimes(ts):
    return ";".join(f(t, 4) for t in ts)


def kepler_E(M, e):
    E = M if e < 0.8 else math.pi
    for _ in range(50):
        E -= (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
    return E


def with_fade(stops, fade):
    """Merge an opacity envelope [(t, op), ...] into keyframe stops [(t, decl), ...].

    Each property is interpolated linearly by the browser, so both lists are
    resampled onto the union of their times (the decl part is held from the
    previous stop, which is exact when stops are dense)."""
    def op(t):
        for (t0, o0), (t1, o1) in zip(fade, fade[1:]):
            if t0 <= t <= t1:
                return o0 + (o1 - o0) * (0 if t1 == t0 else (t - t0) / (t1 - t0))
        return fade[-1][1]
    times = sorted(set([t for t, _ in stops] + [t for t, _ in fade]))
    out = []
    j = 0
    for t in times:
        while j + 1 < len(stops) and stops[j + 1][0] <= t:
            j += 1
        out.append((t, f"{stops[j][1]};opacity:{f(op(t), 3)}"))
    return out
