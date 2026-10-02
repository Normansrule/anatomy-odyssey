""""How to use it" strips for general readers.

    media/readme/howto/gestures.svg   1000 x 260   drag / scroll-pinch / click-tap / press ?
    media/readme/howto/devices.svg    1000 x 200   laptop, tablet and phone showing the same page

Same dark card as the section banners, so they sit on GitHub light and dark alike.

    python3 scripts/readme_art/build.py howto
"""
import math
import random

from common import AURORA, FAINT, ICE, MUTED, NEBULA, PLASMA, SOL, TEXT, TEXT2, anim, f, kf, rrpath, stars, svg_doc, twinkle_css
from metrics import text_w
from pointers import arrow, finger, hand, keycap


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def win(name, a, b, fade, lo=0, hi=1):
    st = [(0, f"opacity:{lo}")]
    if a - fade > 0:
        st.append((a - fade, f"opacity:{lo}"))
    st += [(a, f"opacity:{hi}"), (b, f"opacity:{hi}"), (min(100, b + fade), f"opacity:{lo}")]
    if b + fade < 100:
        st.append((100, f"opacity:{lo}"))
    return kf(name, st)


def card(w, h, c1, c2, seed, defs, css, body, title, desc, uid):
    css = (twinkle_css("t", 3, base=2.6, step=1.1)
           + kf("beam", [(0, "stroke-dashoffset:100"), (100, "stroke-dashoffset:0")]) + anim(".beam", "beam", 12) + css)
    defs = (f'<clipPath id="card"><rect width="{w}" height="{h}" rx="18"/></clipPath>'
            '<linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#04050a"/></linearGradient>'
            f'<radialGradient id="acc" cx=".85" cy=".1" r=".7"><stop offset="0" stop-color="{c1}" stop-opacity=".13"/>'
            f'<stop offset=".7" stop-color="{c1}" stop-opacity="0"/></radialGradient>'
            f'<radialGradient id="acc2" cx=".05" cy="1" r=".5"><stop offset="0" stop-color="{c2}" stop-opacity=".10"/>'
            f'<stop offset="1" stop-color="{c2}" stop-opacity="0"/></radialGradient>' + defs)
    body = (f'<g clip-path="url(#card)"><rect width="{w}" height="{h}" fill="url(#cbg)"/><rect width="{w}" height="{h}" fill="url(#acc)"/>'
            f'<rect width="{w}" height="{h}" fill="url(#acc2)"/>' + stars(seed, int(w * h / 3000), w, h, rmin=.35, rmax=1.1, groups=3)
            + body + '</g>'
            f'<rect x=".75" y=".75" width="{w - 1.5}" height="{h - 1.5}" rx="17.25" fill="none" stroke="#96aaff" stroke-opacity=".2" stroke-width="1.5"/>'
            f'<path class="beam rm-hide" d="{rrpath(.75, .75, w - 1.5, h - 1.5, 17.25)}" pathLength="100" fill="none" stroke="{c1}" '
            'stroke-width="1.5" stroke-dasharray="7 93" stroke-linecap="round" opacity=".8"/>')
    return svg_doc(w, h, title, desc, defs, css, body, uid=uid)


# ============================================================================ gestures
GW, GH = 1000, 260
PW, PH, PY, GAP = 231, 198, 48, 12
SHADE = ('<radialGradient id="shd" cx=".36" cy=".32" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".35"/>'
         '<stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".65"/></radialGradient>')


def g_drag(px, c):
    """Drag to look around: a cursor grabs a banded planet and spins it."""
    T = 6
    cx, cy, R = px + PW / 2, PY + 64, 40
    P = 84                                            # texture period
    base = [(8, -14, 11, 6.5, "#c4583a", .9), (46, 12, 6, 3.4, "#fff3e0", .7), (70, -26, 5, 2.6, "#fff3e0", .55),
            (30, 25, 8, 3, "#8a5a33", .7)]
    spots = ""
    for k in (-2, -1, 0):
        for x, y, rx, ry, col, o in base:
            spots += f'<ellipse cx="{f(cx - R + x + k * P)}" cy="{f(cy + y)}" rx="{rx}" ry="{ry}" fill="{col}" opacity="{o}"/>'
    bands = "".join(f'<rect x="{f(cx - R)}" y="{f(cy + y)}" width="{2 * R}" height="{hh}" fill="{col}" opacity="{o}"/>'
                    for y, hh, col, o in ((-30, 7, "#b98a5c", .8), (-18, 8, "#8a5a33", .75), (-4, 6, "#f3dcb5", .6), (6, 9, "#a8713f", .75),
                                          (20, 6, "#c79a6a", .7), (30, 8, "#7d5230", .7)))
    x0, x1, yy = cx - 30, cx + 30, cy + 12
    css = (kf("tx", [(0, "transform:translateX(0)"), (14, "transform:translateX(0)"), (56, f"transform:translateX({f(P * .72)}px)"),
                     (78, f"transform:translateX({P}px)"), (100, f"transform:translateX({P}px)")])
           + ".tx{animation:tx 6s infinite;animation-timing-function:ease-in-out}"
           + kf("cu", [(0, f"transform:translate({f(x0 - 26)}px,{f(yy + 34)}px);opacity:0"), (6, f"opacity:1"),
                       (13, f"transform:translate({f(x0)}px,{f(yy)}px)"), (56, f"transform:translate({f(x1)}px,{f(yy)}px)"),
                       (66, f"transform:translate({f(x1 + 8)}px,{f(yy + 12)}px);opacity:1"), (80, "opacity:0"),
                       (100, f"transform:translate({f(x0 - 26)}px,{f(yy + 34)}px);opacity:0")]) + anim(".cu", "cu", T, "ease-in-out")
           + win("pr", 14, 56, 2) + anim(".pr", "pr", T)
           + kf("tr", [(0, "stroke-dashoffset:1;opacity:0"), (14, "stroke-dashoffset:1;opacity:1"), (56, "stroke-dashoffset:0;opacity:1"),
                       (70, "stroke-dashoffset:0;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]) + anim(".trl", "tr", T, "ease-in-out"))
    body = (f'<clipPath id="pc"><circle cx="{f(cx)}" cy="{f(cy)}" r="{R}"/></clipPath>'
            f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{R + 6}" fill="none" stroke="{SOL}" stroke-opacity=".12" stroke-width="3"/>'
            f'<g clip-path="url(#pc)"><rect x="{f(cx - R)}" y="{f(cy - R)}" width="{2 * R}" height="{2 * R}" fill="#d9b58a"/>{bands}'
            f'<g class="tx">{spots}</g></g><circle cx="{f(cx)}" cy="{f(cy)}" r="{R}" fill="url(#shd)"/>'
            # rotation hint arcs
            f'<path d="M{f(cx - 52)} {f(cy - 20)}A56 22 0 0 1 {f(cx + 52)} {f(cy - 20)}" fill="none" stroke="{c}" stroke-opacity=".5" '
            'stroke-width="1.6" stroke-dasharray="3 4"/>'
            f'<path d="M{f(cx + 52)} {f(cy - 20)}l-7 -3.5M{f(cx + 52)} {f(cy - 20)}l-2.5 -7" stroke="{c}" stroke-opacity=".7" stroke-width="1.6" '
            'stroke-linecap="round" fill="none"/>'
            f'<path class="trl" d="M{f(x0)} {f(yy)}H{f(x1)}" pathLength="1" stroke-dasharray="1 1" stroke="{c}" stroke-width="2.4" '
            'stroke-linecap="round" opacity="0"/>'
            f'<g class="cu" style="transform:translate({f(x1)}px,{f(yy)}px)"><g class="pr" style="opacity:0"><circle r="9" fill="{c}" opacity=".35"/>'
            f'<circle r="4" fill="none" stroke="{c}" stroke-width="1.5"/></g>{arrow()}</g>')
    return "", css, body


def g_zoom(px, c):
    """Scroll or pinch to zoom: a mouse wheel zooms in, then two fingers pinch back out."""
    T = 8
    cx, cy = px + 140, PY + 64
    mx, my = px + 36, PY + 62
    craters = [(-10, -8, 5), (9, 6, 6.5), (12, -12, 3), (-8, 12, 3.5), (-16, 2, 2.4), (3, -2, 2)]
    moon = (f'<circle r="28" fill="url(#mg)"/>' + "".join(
        f'<circle cx="{x}" cy="{y}" r="{r}" fill="#8b8f9c" stroke="#e3e6ee" stroke-opacity=".35" stroke-width=".8"/>' for x, y, r in craters)
        + '<circle r="28" fill="url(#shd)"/>')
    d0, d1 = 40, 17
    fa, fb = [], []
    for p, d in ((0, d0), (48, d0), (54, d0), (84, d1), (100, d1)):
        o = d * .707
        fa.append((p, f"transform:translate({f(cx + o)}px,{f(cy - o)}px)"))
        fb.append((p, f"transform:translate({f(cx - o)}px,{f(cy + o)}px)"))
    css = (kf("zm", [(0, "transform:scale(1)"), (10, "transform:scale(1)"), (40, "transform:scale(1.45)"), (54, "transform:scale(1.45)"),
                     (84, "transform:scale(1)"), (100, "transform:scale(1)")]) + anim(".zm", "zm", T, "ease-in-out")
           + kf("wt", [(0, "transform:translateY(-4px)"), (100, "transform:translateY(4px)")]) + anim(".wt", "wt", .45)
           + win("ws", 10, 40, 3) + anim(".ws", "ws", T)
           + win("fg", 49, 86, 4) + anim(".fg", "fg", T)
           + kf("fa", fa) + anim(".fa", "fa", T, "ease-in-out") + kf("fb", fb) + anim(".fb", "fb", T, "ease-in-out")
           + win("pl", 12, 42, 3) + anim(".pl", "pl", T) + win("mi", 54, 86, 3) + anim(".mi", "mi", T))
    wheel_ticks = "".join(f'<path d="M-2 {y}H2"/>' for y in (-8, -4, 0, 4, 8, 12))
    body = (f'<g transform="translate({f(cx)} {f(cy)})"><g class="zm" style="transform:scale(1.2)">{moon}</g></g>'
            # mouse
            f'<g transform="translate({f(mx)} {f(my)})"><rect x="-14" y="-22" width="28" height="44" rx="14" fill="#1a2036" stroke="{c}" stroke-width="1.6"/>'
            f'<path d="M-14 -4H14M0 -22V-4" stroke="{c}" stroke-opacity=".45"/>'
            f'<clipPath id="wc"><rect x="-3" y="-17" width="6" height="11" rx="3"/></clipPath>'
            f'<rect x="-3" y="-17" width="6" height="11" rx="3" fill="#04050a" stroke="{c}" stroke-opacity=".8"/>'
            f'<g clip-path="url(#wc)"><g class="ws" style="opacity:0"><g transform="translate(0 -12)"><g class="wt" stroke="{TEXT}" stroke-width="1.2">{wheel_ticks}</g></g></g></g>'
            f'<g class="ws" style="opacity:0"><path d="M0 30l-4 -4M0 30l4 -4M0 36l-4 -4M0 36l4 -4" stroke="{c}" stroke-width="1.5" stroke-linecap="round"/></g></g>'
            f'<g class="pl" style="opacity:0"><text x="{f(mx + 20)}" y="{f(my - 20)}" class="sans" font-size="20" font-weight="700" fill="{c}">+</text></g>'
            # fingers
            f'<g class="fg" style="opacity:0"><g class="fa" style="transform:translate({f(cx + 28)}px,{f(cy - 28)}px)">{finger(7)}</g>'
            f'<g class="fb" style="transform:translate({f(cx - 28)}px,{f(cy + 28)}px)">{finger(7)}</g></g>'
            f'<g class="mi" style="opacity:0"><text x="{f(cx + 34)}" y="{f(cy + 40)}" class="sans" font-size="22" font-weight="700" fill="{c}">−</text></g>')
    defs = ('<radialGradient id="mg" cx=".4" cy=".38" r=".7"><stop offset="0" stop-color="#e9e8e4"/><stop offset="1" stop-color="#a7a8ad"/></radialGradient>')
    return defs, css, body


def g_click(px, c):
    """Click or tap a thing for info: a hand taps Saturn, a ripple spreads and an info card pops up."""
    T = 7
    sx, sy = px + 62, PY + 80
    home = (px + 196, PY + 132)
    kx, ky, kw, kh = px + 108, PY + 8, 112, 62
    css = (kf("hd", [(0, f"transform:translate({home[0]}px,{home[1]}px) scale(1);opacity:0"), (6, "opacity:1"),
                     (26, f"transform:translate({sx + 4}px,{sy + 6}px) scale(1)"), (31, f"transform:translate({sx + 4}px,{sy + 6}px) scale(.88)"),
                     (36, f"transform:translate({sx + 4}px,{sy + 6}px) scale(1)"), (74, f"transform:translate({sx + 12}px,{sy + 22}px) scale(1);opacity:1"),
                     (86, "opacity:0"), (100, f"transform:translate({home[0]}px,{home[1]}px) scale(1);opacity:0")]) + anim(".hd", "hd", T, "ease-in-out")
           + kf("rp", [(0, "transform:scale(.3);opacity:0"), (31, "transform:scale(.3);opacity:0"), (32, "transform:scale(.4);opacity:.9"),
                       (52, "transform:scale(1.6);opacity:0"), (100, "transform:scale(1.6);opacity:0")]) + anim(".rp", "rp", T, "ease-out")
           + anim(".rp2", "rp", T, "ease-out", -.25)
           + kf("ic", [(0, "transform:scale(0);opacity:0"), (34, "transform:scale(0);opacity:0"), (39, "transform:scale(1.07);opacity:1"),
                       (42, "transform:scale(1);opacity:1"), (86, "transform:scale(1);opacity:1"), (92, "transform:scale(.9);opacity:0"),
                       (100, "transform:scale(0);opacity:0")]) + anim(".ic", "ic", T, "ease-out")
           + win("ln", 38, 86, 3) + anim(".ln", "ln", T)
           + kf("sg", [(0, "opacity:.0"), (32, "opacity:0"), (36, "opacity:1"), (86, "opacity:1"), (92, "opacity:0"), (100, "opacity:0")])
           + anim(".sg", "sg", T))
    saturn = ('<ellipse rx="22" ry="6.5" transform="rotate(-18)" fill="none" stroke="#e8d7a8" stroke-width="3"/>'
              '<circle r="12" fill="url(#sat)"/>'
              '<path d="M-22 0A22 6.5 0 0 0 22 0" transform="rotate(-18)" fill="none" stroke="#e8d7a8" stroke-width="3"/>')
    body = (f'<g transform="translate({px + 30} {PY + 30})"><circle r="10" fill="#b9bcc6"/><circle cx="-3" cy="-2" r="2.4" fill="#8b8f9c"/>'
            f'<circle cx="3" cy="3" r="1.8" fill="#8b8f9c"/><circle r="10" fill="url(#shd)"/></g>'
            f'<g transform="translate({px + 172} {PY + 100})"><circle r="9" fill="#4a86d8"/><path d="M-6 -3Q-1 -6 3 -2T7 2" stroke="#6fcf97" stroke-width="3" fill="none"/>'
            f'<circle r="9" fill="url(#shd)"/></g>'
            f'<g transform="translate({sx} {sy})"><g class="sg" style="opacity:0"><circle r="30" fill="none" stroke="{c}" stroke-width="1.6" stroke-dasharray="4 3"/></g>'
            f'{saturn}<g class="rp" style="opacity:0"><circle r="26" fill="none" stroke="{c}" stroke-width="2"/></g>'
            f'<g class="rp2" style="opacity:0"><circle r="26" fill="none" stroke="{c}" stroke-width="1.2"/></g></g>'
            f'<g class="ln" style="opacity:1"><path d="M{sx + 20} {sy - 22}L{kx + 18} {ky + kh}" stroke="{c}" stroke-opacity=".7" stroke-width="1.3" stroke-dasharray="3 3"/></g>'
            f'<g transform="translate({kx + 18} {ky + kh})"><g class="ic" style="transform:scale(1);opacity:1"><g transform="translate({-18} {-kh})">'
            f'<rect width="{kw}" height="{kh}" rx="9" fill="#0b1020" stroke="{c}" stroke-width="1.4"/>'
            f'<rect width="{kw}" height="{kh}" rx="9" fill="{c}" fill-opacity=".08"/>'
            f'<text x="11" y="21" class="sans" font-size="15" font-weight="700" fill="{c}">Saturn</text>'
            f'<path d="M{kw - 15} 10l6 6M{kw - 9} 10l-6 6" stroke="{MUTED}" stroke-width="1.4" stroke-linecap="round"/>'
            f'<rect x="11" y="31" width="{kw - 30}" height="5" rx="2.5" fill="{TEXT2}" opacity=".45"/>'
            f'<rect x="11" y="42" width="{kw - 48}" height="5" rx="2.5" fill="{TEXT2}" opacity=".3"/></g></g></g>'
            f'<g class="hd" style="transform:translate({sx + 12}px,{sy + 22}px)">{hand()}</g>')
    defs = ('<radialGradient id="sat" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff1cf"/><stop offset=".6" stop-color="#e3c27f"/>'
            '<stop offset="1" stop-color="#8a6a33"/></radialGradient>')
    return defs, css, body


def g_help(px, c):
    """Press ? for help: a key presses and a help panel slides in, with a Low graphics switch."""
    T = 7
    kx, ky = px + 16, PY + 40
    hx, hy, hw, hh = px + 76, PY + 8, 146, 118
    css = (kf("ky", [(0, "transform:translateY(0)"), (10, "transform:translateY(0)"), (13, "transform:translateY(4px)"),
                     (18, "transform:translateY(4px)"), (22, "transform:translateY(0)"), (100, "transform:translateY(0)")]) + anim(".ky", "ky", T)
           + kf("kr", [(0, "transform:scale(.8);opacity:0"), (12, "transform:scale(.8);opacity:0"), (13, "transform:scale(.9);opacity:.9"),
                       (30, "transform:scale(1.35);opacity:0"), (100, "transform:scale(1.35);opacity:0")]) + anim(".kr", "kr", T, "ease-out")
           + kf("hp", [(0, "transform:translateX(160px)"), (14, "transform:translateX(160px)"), (26, "transform:translateX(0)"),
                       (86, "transform:translateX(0)"), (97, "transform:translateX(160px)"), (100, "transform:translateX(160px)")])
           + anim(".hp", "hp", T, "cubic-bezier(.3,.7,.3,1)")
           + kf("tg", [(0, "transform:translateX(0)"), (48, "transform:translateX(0)"), (54, "transform:translateX(12px)"),
                       (97, "transform:translateX(12px)"), (98, "transform:translateX(0)"), (100, "transform:translateX(0)")]) + anim(".tg", "tg", T, "ease-in-out")
           + win("ton", 51, 97, 3) + anim(".ton", "ton", T)
           + kf("rh", [(0, "opacity:0"), (40, "opacity:0"), (46, "opacity:1"), (60, "opacity:1"), (66, "opacity:0"), (100, "opacity:0")])
           + anim(".rh", "rh", T))
    rows = [("Controls", 44), ("Tips", 66), ("Low graphics", 88)]
    row_svg = "".join(f'<text x="14" y="{y + 4}" class="sans" font-size="13.5" fill="{TEXT}">{t}</text>' for t, y in rows)
    row_svg += (f'<rect class="rh" x="6" y="{88 - 12}" width="{hw - 12}" height="22" rx="6" fill="{c}" fill-opacity=".14" opacity="0"/>'
                f'<g transform="translate({hw - 38} {88 - 7})"><rect width="28" height="14" rx="7" fill="#2a3252"/>'
                f'<g class="ton" style="opacity:1"><rect width="28" height="14" rx="7" fill="{c}"/></g>'
                f'<g class="tg" style="transform:translateX(12px)"><circle cx="8" cy="7" r="5.2" fill="#fff"/></g></g>'
                f'<path d="M{hw - 22} 38l5 5l-5 5M{hw - 22} 60l5 5l-5 5" stroke="{MUTED}" stroke-width="1.5" fill="none" stroke-linecap="round"/>')
    body = (f'<g transform="translate({kx + 25} {ky + 22})"><g class="kr" style="opacity:0"><rect x="-32" y="-30" width="64" height="62" rx="14" fill="none" stroke="{c}" stroke-width="1.6"/></g></g>'
            f'<g transform="translate({kx} {ky})">{keycap("?", 50, 44, c, 28, cls="ky")}</g>'
            f'<clipPath id="hc"><rect x="{hx - 4}" y="{hy - 4}" width="{hw + 12}" height="{hh + 12}"/></clipPath>'
            f'<g clip-path="url(#hc)"><g class="hp"><g transform="translate({hx} {hy})">'
            f'<rect width="{hw}" height="{hh}" rx="10" fill="#0b1020" stroke="{c}" stroke-width="1.4"/>'
            f'<rect width="{hw}" height="26" rx="10" fill="{c}" fill-opacity=".16"/><path d="M0 26H{hw}" stroke="{c}" stroke-opacity=".4"/>'
            f'<text x="14" y="18" class="sans" font-size="14" font-weight="700" fill="{c}">Help</text>'
            f'<path d="M{hw - 20} 9l8 8M{hw - 12} 9l-8 8" stroke="{MUTED}" stroke-width="1.4" stroke-linecap="round"/>'
            f'{row_svg}</g></g></g>')
    return "", css, body


PANELS = [
    ("DRAG", "to look around", ICE, g_drag),
    ("SCROLL · PINCH", "to zoom in and out", NEBULA, g_zoom),
    ("CLICK · TAP", "anything for info", SOL, g_click),
    ("PRESS ?", "for help and settings", AURORA, g_help),
]


def gestures():
    defs, css, body = [SHADE], [], []
    body.append(f'<text x="28" y="31" class="mono" font-size="13" font-weight="600" letter-spacing="2.4" fill="{ICE}">HOW TO DRIVE THE SIMULATIONS</text>'
                f'<text x="{GW - 28}" y="31" class="mono" font-size="12.5" text-anchor="end" fill="{MUTED}">mouse · trackpad · touch</text>')
    for i, (verb, what, c, fn) in enumerate(PANELS):
        px = 20 + i * (PW + GAP)
        d, cs, b = fn(px, c)
        defs.append(d)
        css.append(cs)
        assert text_w(verb, 21, True) < PW - 28 and text_w(what, 15.5) < PW - 28, verb
        body.append(
            f'<rect x="{px}" y="{PY}" width="{PW}" height="{PH}" rx="14" fill="#060913" fill-opacity=".7" stroke="{c}" stroke-opacity=".3"/>'
            f'<clipPath id="pp{i}"><rect x="{px}" y="{PY}" width="{PW}" height="{PH}" rx="14"/></clipPath>'
            f'<g clip-path="url(#pp{i})">{b}</g>'
            f'<path d="M{px + 16} {PY + 144}H{px + PW - 16}" stroke="{c}" stroke-opacity=".18"/>'
            f'<text x="{px + 16}" y="{PY + 168}" class="sans" font-size="21" font-weight="800" letter-spacing=".4" fill="{c}">{esc(verb)}</text>'
            f'<text x="{px + 16}" y="{PY + 189}" class="sans" font-size="15.5" fill="{TEXT2}">{esc(what)}</text>')
    desc = ("How to drive the simulations, in four animated panels. Drag: a mouse cursor drags across a banded planet and spins it, to look around. "
            "Scroll or pinch: a mouse wheel zooms in on the Moon, then two fingertips pinch together and it shrinks back. "
            "Click or tap: a hand taps Saturn, a ripple spreads and an info card pops up with its name. "
            "Press the question-mark key: it presses down and a help panel slides in with Controls, Tips and a Low graphics switch that turns on.")
    return card(GW, GH, ICE, AURORA, 911, "".join(defs), "".join(css), "".join(body),
                "How to drive the simulations · Cosmic Library", desc, "ge")


# ============================================================================ devices
DW, DH = 1000, 200


def page(x, y, w, h, cols, s, uid, scroll=0.0):
    """A miniature Cosmic Library page laid out for a screen w x h: nav, hero with a rising rocket, card grid."""
    nav = 12 * s
    pad = 7 * s
    hero_h = max(46 * s, (h - nav) * .44)
    out = [f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}" fill="#04050a"/>']
    inner = []
    # nav
    inner.append(f'<rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(nav)}" fill="#0b1020"/>'
                 f'<circle cx="{f(x + pad + 2.5 * s)}" cy="{f(y + nav / 2)}" r="{f(2.6 * s)}" fill="{ICE}"/>'
                 f'<rect x="{f(x + pad + 8 * s)}" y="{f(y + nav / 2 - 1.6 * s)}" width="{f(30 * s)}" height="{f(3.2 * s)}" rx="{f(1.6 * s)}" fill="{TEXT}" opacity=".85"/>')
    if cols >= 2:
        for k in range(3 if cols == 3 else 2):
            inner.append(f'<rect x="{f(x + w - pad - (k + 1) * 20 * s)}" y="{f(y + nav / 2 - 1.2 * s)}" width="{f(14 * s)}" height="{f(2.4 * s)}" '
                         f'rx="{f(1.2 * s)}" fill="{MUTED}" opacity=".8"/>')
    else:
        inner.append(f'<path d="M{f(x + w - pad - 10 * s)} {f(y + nav / 2 - 3 * s)}h{f(10 * s)}M{f(x + w - pad - 10 * s)} {f(y + nav / 2)}h{f(10 * s)}'
                     f'M{f(x + w - pad - 10 * s)} {f(y + nav / 2 + 3 * s)}h{f(10 * s)}" stroke="{TEXT2}" stroke-width="{f(1.3 * s)}"/>')
    # hero
    hy = y + nav
    rng = random.Random(uid)
    inner.append(f'<rect x="{f(x)}" y="{f(hy)}" width="{f(w)}" height="{f(hero_h)}" fill="url(#hero)"/>')
    inner.append("".join(f'<circle cx="{f(x + rng.random() * w)}" cy="{f(hy + rng.random() * hero_h)}" r="{f(.5 + rng.random() * .7, 2)}" fill="#fff" '
                         f'opacity="{f(.3 + .6 * rng.random(), 2)}"/>' for _ in range(int(w * hero_h / 260))))
    pr = min(hero_h * .34, w * .16)
    pcx, pcy = x + w - pad - pr * 1.2, hy + hero_h * .5
    inner.append(f'<circle cx="{f(pcx)}" cy="{f(pcy)}" r="{f(pr)}" fill="url(#pl)"/>'
                 f'<ellipse cx="{f(pcx)}" cy="{f(pcy)}" rx="{f(pr * 1.7)}" ry="{f(pr * .42)}" transform="rotate(-14 {f(pcx)} {f(pcy)})" fill="none" '
                 f'stroke="{SOL}" stroke-opacity=".7" stroke-width="{f(1.2 * s)}"/>')
    tx = x + pad
    inner.append(f'<rect x="{f(tx)}" y="{f(hy + hero_h * .3)}" width="{f(min(w * .5, 110 * s))}" height="{f(6 * s)}" rx="{f(3 * s)}" fill="{TEXT}"/>'
                 f'<rect x="{f(tx)}" y="{f(hy + hero_h * .3 + 10 * s)}" width="{f(min(w * .38, 80 * s))}" height="{f(3 * s)}" rx="{f(1.5 * s)}" fill="{MUTED}"/>'
                 f'<rect x="{f(tx)}" y="{f(hy + hero_h * .3 + 18 * s)}" width="{f(30 * s)}" height="{f(9 * s)}" rx="{f(4.5 * s)}" fill="{ICE}"/>')
    # rocket rising in the hero (same timing on every screen)
    rx_ = x + w * (.62 if cols > 1 else .5) - (0 if cols > 1 else 0)
    if cols == 1:
        rx_ = x + w * .42
    inner.append(f'<g transform="translate({f(rx_)} {f(hy + hero_h - 2)}) scale({f(s, 2)})"><g class="rk">'
                 f'<path d="M-2 5Q0 13 2 5Z" fill="{SOL}"/><path d="M-2.4 6V-6Q-2.4 -10 0 -12Q2.4 -10 2.4 -6V6Z" fill="#eef2ff"/>'
                 f'<path d="M-2.4 2L-5 7H-2.4ZM2.4 2L5 7H2.4Z" fill="{PLASMA}"/></g></g>')
    # cards
    cy0 = hy + hero_h + pad
    gap = 5 * s
    cw = (w - 2 * pad - (cols - 1) * gap) / cols
    ch = 30 * s if cols > 1 else 26 * s
    cols_c = [PLASMA, ICE, NEBULA, AURORA, SOL, ICE, NEBULA, PLASMA, AURORA]
    n = cols * (2 if cols > 1 else 6)
    for k in range(n):
        r_, c_ = divmod(k, cols)
        cx_ = x + pad + c_ * (cw + gap)
        cy_ = cy0 + r_ * (ch + gap)
        col = cols_c[k % len(cols_c)]
        inner.append(f'<rect x="{f(cx_)}" y="{f(cy_)}" width="{f(cw)}" height="{f(ch)}" rx="{f(4 * s)}" fill="#0f1528" stroke="#96aaff" stroke-opacity=".22"/>'
                     f'<rect x="{f(cx_)}" y="{f(cy_)}" width="{f(cw)}" height="{f(ch * .45)}" rx="{f(4 * s)}" fill="{col}" fill-opacity=".28"/>'
                     f'<rect x="{f(cx_ + 5 * s)}" y="{f(cy_ + ch * .62)}" width="{f(cw * .55)}" height="{f(3 * s)}" rx="{f(1.5 * s)}" fill="{TEXT2}" opacity=".7"/>'
                     f'<g class="cg{k % 6}" style="opacity:0"><rect x="{f(cx_)}" y="{f(cy_)}" width="{f(cw)}" height="{f(ch)}" rx="{f(4 * s)}" '
                     f'fill="none" stroke="{col}" stroke-width="{f(1.4 * s)}"/></g>')
    body = "".join(inner)
    if scroll:
        body = f'<g class="scr">{body}</g>'
    out.append(f'<clipPath id="sc{uid}"><rect x="{f(x)}" y="{f(y)}" width="{f(w)}" height="{f(h)}"/></clipPath>'
               f'<g clip-path="url(#sc{uid})">{body}</g>')
    return "".join(out)


def devices():
    T = 6
    c1 = ICE
    css = [kf("rk", [(0, "transform:translateY(0);opacity:0"), (8, "transform:translateY(0);opacity:1"), (70, "transform:translateY(-40px);opacity:1"),
                     (80, "transform:translateY(-48px);opacity:0"), (100, "transform:translateY(0);opacity:0")]) + anim(".rk", "rk", T, "ease-in"),
           kf("scr", [(0, "transform:translateY(0)"), (30, "transform:translateY(0)"), (55, "transform:translateY(-58px)"), (80, "transform:translateY(-58px)"),
                      (100, "transform:translateY(0)")]) + anim(".scr", "scr", 2 * T, "ease-in-out")]
    for k in range(6):
        css.append(win(f"cg{k}", 10 + k * 13, 20 + k * 13, 4) + anim(f".cg{k}", f"cg{k}", T * 2))
    defs = ('<linearGradient id="hero" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1a1440"/><stop offset="1" stop-color="#07203a"/></linearGradient>'
            '<radialGradient id="pl" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#ffe6b0"/><stop offset=".6" stop-color="#d9a55a"/>'
            '<stop offset="1" stop-color="#6b4a1f"/></radialGradient>'
            '<linearGradient id="bz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a4262"/><stop offset="1" stop-color="#1b2138"/></linearGradient>')
    # laptop
    lx, ly, lw, lh = 392, 18, 240, 144
    laptop = (f'<rect x="{lx}" y="{ly}" width="{lw}" height="{lh}" rx="9" fill="url(#bz)" stroke="#96aaff" stroke-opacity=".45"/>'
              + page(lx + 7, ly + 8, lw - 14, lh - 16, 3, 1.0, "L") +
              f'<path d="M{lx - 22} {ly + lh + 1}H{lx + lw + 22}L{lx + lw + 10} {ly + lh + 12}H{lx - 10}Z" fill="#2a3150" stroke="#96aaff" stroke-opacity=".45"/>'
              f'<rect x="{lx + lw / 2 - 20}" y="{ly + lh + 1}" width="40" height="4" rx="2" fill="#141a2e"/>')
    # tablet
    tx, ty, tw, th = 684, 22, 120, 152
    tablet = (f'<rect x="{tx}" y="{ty}" width="{tw}" height="{th}" rx="11" fill="url(#bz)" stroke="#96aaff" stroke-opacity=".45"/>'
              + page(tx + 7, ty + 9, tw - 14, th - 18, 2, .8, "T") +
              f'<circle cx="{tx + tw / 2}" cy="{ty + 4.6}" r="1.4" fill="#5d6589"/>')
    # phone
    fx, fy, fw, fh = 856, 34, 78, 140
    phone = (f'<rect x="{fx}" y="{fy}" width="{fw}" height="{fh}" rx="13" fill="url(#bz)" stroke="#96aaff" stroke-opacity=".45"/>'
             + page(fx + 5, fy + 13, fw - 10, fh - 24, 1, .72, "P", scroll=1) +
             f'<rect x="{fx + fw / 2 - 10}" y="{fy + 5}" width="20" height="3.5" rx="1.75" fill="#0b0f1d"/>'
             f'<rect x="{fx + fw / 2 - 14}" y="{fy + fh - 7}" width="28" height="2.5" rx="1.25" fill="#5d6589"/>')
    labels = "".join(f'<text x="{f(x)}" y="190" class="mono" font-size="11.5" text-anchor="middle" fill="{FAINT}">{t}</text>'
                     for x, t in ((lx + lw / 2, "laptop"), (tx + tw / 2, "tablet"), (fx + fw / 2, "phone")))
    # text block
    t1, t2 = "Works on laptops,", "tablets and phones"
    assert 40 + text_w(t2, 31, True) < 360
    hint_x, hint_y = 40, 146
    kc = keycap("?", 22, 20, AURORA, 13)
    txt = (f'<text x="40" y="44" class="mono" font-size="13" font-weight="600" letter-spacing="2.4" fill="{c1}">ANY SCREEN · NO INSTALL</text>'
           f'<text x="40" y="82" class="sans" font-size="31" font-weight="800" letter-spacing="-.6" fill="{TEXT}">{t1}</text>'
           f'<text x="40" y="117" class="sans" font-size="31" font-weight="800" letter-spacing="-.6" fill="{TEXT}">{t2}</text>'
           f'<g transform="translate({hint_x} {hint_y})"><rect width="296" height="32" rx="16" fill="{AURORA}" fill-opacity=".1" stroke="{AURORA}" stroke-opacity=".5"/>'
           f'<text x="16" y="21" class="sans" font-size="14.5" fill="{TEXT2}">Slow? Press</text>'
           f'<g transform="translate(100 4)">{kc}</g>'
           f'<text x="132" y="21" class="sans" font-size="14.5" fill="{TEXT2}">→ <tspan font-weight="700" fill="{AURORA}">Low graphics</tspan></text></g>')
    assert 132 + text_w("→ Low graphics", 14.5, True) < 290
    body = txt + laptop + tablet + phone + labels
    desc = ("Works on laptops, tablets and phones: three device outlines show the same Cosmic Library page, laid out in three columns on the laptop, "
            "two on the tablet and one on the phone, which scrolls. A small rocket rises in each page's banner at the same moment. "
            "Hint: if it is slow, press the question-mark key and choose Low graphics.")
    return card(DW, DH, ICE, AURORA, 512, defs, "".join(css), body, "Works on laptops, tablets and phones · Cosmic Library", desc, "dv")


def build_all(only=()):
    for key, fn in (("gestures", gestures), ("devices", devices)):
        if only and key not in only:
            continue
        yield key, fn()
