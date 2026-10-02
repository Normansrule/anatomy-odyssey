"""Scene for the Telescope simulator tile (eyepiece.html).

Same contract as tiles.py scenes: dict(defs, css, body[, stars]) inside the 400 x 250 card.
A round eyepiece view cycles through four targets, each held for a quarter of the loop:
the Moon's craters along the terminator, Jupiter with its four Galilean moons, Saturn and
its rings, and a close double star that splits as the aperture grows.

The double star is drawn to the diffraction limit: separation 1.5 arcsec, star cores sized
from the Airy disc (1.22 lambda / D at 550 nm) for 60, 100 and 200 mm apertures, so it is
blended at 60 mm (Dawes limit 1.9"), just split at 100 mm (1.2") and clean at 200 mm (0.6").
"""
import math
import random

from common import AURORA, FAINT, ICE, MUTED, NEBULA, SOL, TEXT, TEXT2, anim, f, kf


def win(name, a, b, fade, lo=0, hi=1):
    st = [(0, f"opacity:{lo}")]
    if a - fade > 0:
        st.append((a - fade, f"opacity:{lo}"))
    st += [(a, f"opacity:{hi}"), (b, f"opacity:{hi}"), (min(100, b + fade), f"opacity:{lo}")]
    if b + fade < 100:
        st.append((100, f"opacity:{lo}"))
    return kf(name, st)


def airy_px(d_mm, px_per_arcsec, lam=550e-9):
    theta = 1.22 * lam / (d_mm / 1000) * 206265          # arcsec, first dark ring
    return theta * px_per_arcsec


def s_eyepiece():
    T = 20.0
    cx, cy, R = 266, 98, 60
    seg = 25.0
    fade = 2.2
    css = []
    # ---- view windows (first one wraps round the loop so the static frame shows Saturn)
    for i in range(4):
        a, b = i * seg + fade, (i + 1) * seg - fade
        if i == 0:
            st = [(0, "opacity:1"), (b, "opacity:1"), (b + fade, "opacity:0"), (100 - fade, "opacity:0"), (100, "opacity:1")]
            css.append(kf(f"v{i}", st))
        else:
            css.append(win(f"v{i}", a, b, fade))
        css.append(anim(f".v{i}", f"v{i}", T))

    rng = random.Random(7)
    field = "".join(f'<circle cx="{f(cx + (rng.random() - .5) * 2 * R)}" cy="{f(cy + (rng.random() - .5) * 2 * R)}" '
                    f'r="{f(.4 + rng.random() * .6, 2)}" fill="#fff" opacity="{f(.25 + rng.random() * .5, 2)}"/>' for _ in range(16))

    # ---- 0: Moon, craters along the terminator (drifts slowly, as an undriven telescope would)
    craters = [(-38, -30, 11), (-14, -40, 6), (-30, 4, 15), (-4, -14, 8), (10, 18, 12), (-18, 34, 7), (18, -34, 5),
               (-50, 26, 6), (4, 44, 5), (22, -6, 6), (-44, -6, 4), (-56, -24, 4)]
    cr = ""
    for x, y, r in craters:
        cr += (f'<ellipse cx="{x}" cy="{y}" rx="{r}" ry="{f(r * .92)}" fill="#6f6c68" opacity=".55"/>'
               f'<path d="M{x - r} {y}A{r} {f(r * .92)} 0 0 1 {x + r} {y}" fill="none" stroke="#fbf7ee" stroke-opacity=".55" stroke-width="1.4" '
               f'transform="rotate(-70 {x} {y})"/>'
               f'<ellipse cx="{f(x - r * .25)}" cy="{f(y + r * .1)}" rx="{f(r * .45)}" ry="{f(r * .5)}" fill="#3e3c39" opacity=".45"/>')
    moon = (f'<g transform="translate({cx} {cy})"><g class="dr">'
            f'<rect x="-110" y="-90" width="200" height="180" fill="url(#lun)"/>{cr}'
            '<path d="M34 -90Q24 -40 30 0T38 90H120V-90Z" fill="#040406"/>'
            '<path d="M34 -90Q24 -40 30 0T38 90" fill="none" stroke="#8a867d" stroke-opacity=".35" stroke-width="5"/></g></g>')
    css.append(kf("dr", [(0, "transform:translate(-6px,3px)"), (100, "transform:translate(6px,-3px)")]) + anim(".dr", "dr", T / 4, "ease-in-out"))

    # ---- 1: Jupiter and the Galilean moons
    jb = "".join(f'<rect x="-17" y="{y}" width="34" height="{hh}" fill="{c}" opacity="{o}"/>'
                 for y, hh, c, o in ((-11, 4, "#a8713f", .7), (-5, 3.5, "#8a5a33", .8), (3, 4, "#a8713f", .75), (9, 3, "#c79a6a", .7)))
    moons = [(-44, 1.7, "#e8e2d0"), (-27, 1.5, "#d9cfb6"), (31, 1.9, "#c9c2b0"), (52, 1.6, "#bdb6a8")]
    jmoons = ""
    for k, (x, r, c) in enumerate(moons):
        jmoons += f'<g class="jm{k}"><circle cx="{x}" cy="{f(x * -.04)}" r="{r}" fill="{c}"/></g>'
        dx = [2.5, -3, 2, -1.5][k]
        css.append(kf(f"jm{k}", [(0, "transform:translateX(0)"), (100, f"transform:translateX({dx}px)")]) + anim(f".jm{k}", f"jm{k}", T / 4, "ease-in-out"))
    jup = (f'<g transform="translate({cx} {cy}) rotate(-3)"><clipPath id="jc"><circle r="17"/></clipPath>'
           f'<circle r="17" fill="#e6cfa6"/><g clip-path="url(#jc)">{jb}<ellipse cx="6" cy="6" rx="3.2" ry="1.9" fill="#c4583a" opacity=".85"/></g>'
           f'<circle r="17" fill="url(#lmb)"/>{jmoons}</g>')

    # ---- 2: Saturn with its rings and the Cassini division
    sat = (f'<g transform="translate({cx} {cy}) rotate(-12)">'
           '<ellipse rx="38" ry="11" fill="none" stroke="#d9c79a" stroke-width="6" opacity=".9"/>'
           '<ellipse rx="38" ry="11" fill="none" stroke="#04050a" stroke-width="1" opacity=".9"/>'
           '<ellipse rx="31" ry="8.8" fill="none" stroke="#b9a57a" stroke-width="3" opacity=".7"/>'
           '<circle r="16" fill="url(#sg)"/>'
           '<path d="M-16 -3H16M-15 3H15" stroke="#b08a52" stroke-opacity=".45" stroke-width="2"/>'
           '<circle r="16" fill="url(#lmb)"/>'
           '<path d="M-38 0A38 11 0 0 0 38 0" fill="none" stroke="#d9c79a" stroke-width="6" opacity=".95"/>'
           '<path d="M-38 0A38 11 0 0 0 38 0" fill="none" stroke="#04050a" stroke-width="1"/>'
           '<path d="M-31 0A31 8.8 0 0 0 31 0" fill="none" stroke="#b9a57a" stroke-width="3" opacity=".75"/>'
           '<ellipse rx="16" ry="4.6" cy="5" fill="#04050a" opacity=".35" transform="translate(0 7)"/>'
           '<circle cx="58" cy="-6" r="1.6" fill="#e9dfc6"/></g>')

    # ---- 3: double star, 1.5" apart, cores shrinking with aperture 60 -> 100 -> 200 mm
    pxs = 9.5                                   # px per arcsec in the view
    sep = 1.5 * pxs
    core = {d: .42 * airy_px(d, pxs) for d in (60, 100, 200)}
    ring = {d: airy_px(d, pxs) * 1.64 / 1.22 for d in (60, 100, 200)}   # first bright ring ~1.64 lambda/D
    a0, a1 = 3 * seg, 4 * seg
    stops = [(0, 60), (a0, 60), (a0 + 6, 60), (a0 + 12, 100), (a0 + 17, 200), (100, 200)]
    sc = [(p, core[d] / core[60]) for p, d in stops]
    css.append(kf("ds", [(p, f"transform:scale({f(s, 3)})") for p, s in sc]) + anim(".ds", "ds", T, "ease-in-out"))
    rsc = [(p, ring[d] / ring[60]) for p, d in stops]
    css.append(kf("dr2", [(p, f"transform:scale({f(s, 3)})") for p, s in rsc]) + anim(".dsr", "dr2", T, "ease-in-out"))
    star = (lambda x, col, big: f'<g transform="translate({f(x)} 0)"><g class="dsr"><circle r="{f(ring[60])}" fill="none" stroke="{col}" '
            f'stroke-opacity=".13" stroke-width="{f(ring[60] * .16)}"/></g>'
            f'<g class="ds"><circle r="{f(core[60] * 1.6)}" fill="{col}" opacity=".28"/><circle r="{f(core[60] * (1 if big else .85))}" fill="#fff"/></g></g>')
    dbl = (f'<g class="sn"><g transform="translate({cx} {cy}) rotate(-28)">{star(-sep / 2, "#ffe2b0", True)}{star(sep / 2, "#bcd6ff", False)}</g></g>')
    # aperture readout in the view
    ap = ""
    for k, (d, p0, p1) in enumerate(((60, a0, a0 + 8), (100, a0 + 9, a0 + 14), (200, a0 + 15, a1 - fade))):
        css.append(win(f"ap{k}", p0 + 1, p1, 1) + anim(f".ap{k}", f"ap{k}", T))
        split = ("blended", "just split", "split")[k]
        ap += (f'<g class="ap{k}" style="opacity:0"><text class="mono" x="24" y="110" font-size="11.5" fill="{TEXT2}">aperture {d} mm</text>'
               f'<text class="mono" x="24" y="126" font-size="11.5" fill="{AURORA if k else MUTED}">{split}</text></g>')

    views = [("Saturn", "rings, Cassini gap", sat, 0), ("Moon", "craters at sunrise", moon, 1),
             ("Jupiter", "4 moons in a row", jup, 2), ("Double star", None, dbl, 3)]
    # order in the loop: Saturn first (so the reduced-motion frame shows Saturn), then Moon, Jupiter, double star
    inview, labels = "", ""
    for name, detail, g, i in views:
        extra = field if name != "Moon" else ""
        inview += f'<g class="v{i}" style="opacity:{1 if i == 0 else 0}">{extra}{g}</g>'
        labels += (f'<g class="v{i}" style="opacity:{1 if i == 0 else 0}"><text class="sans" x="24" y="92" font-size="18" font-weight="700" fill="{TEXT}">{name}</text>'
                   + (f'<text class="mono" x="24" y="110" font-size="11.5" fill="{TEXT2}">{detail}</text>' if detail else "") + '</g>')
    labels += ap
    # stars in the double-star view shimmer a touch (seeing)
    css.append(kf("sn", [(0, "opacity:1"), (30, "opacity:.8"), (55, "opacity:1"), (80, "opacity:.85"), (100, "opacity:1")]) + anim(".sn", "sn", .9))

    # small telescope pointing at the eyepiece
    scope = ('<g transform="translate(364 150) scale(.82)">'
             '<g stroke="#8f98bd" stroke-width="2" stroke-linecap="round"><path d="M0 -8L-10 14M0 -8L10 14M0 -8V15"/></g>'
             '<g transform="translate(0 -9) rotate(-35)"><rect x="-6" y="-40" width="12" height="46" rx="2" fill="#dfe4f4"/>'
             f'<rect x="-7.5" y="-45" width="15" height="8" rx="2" fill="{NEBULA}"/><rect x="-3" y="6" width="6" height="7" rx="1" fill="#8f98bd"/>'
             '<rect x="-6" y="-14" width="12" height="3" fill="#8f98bd"/></g>'
             '<circle cy="-9" r="3" fill="#5d6589"/></g>')

    # eyepiece
    defs = (f'<clipPath id="ev"><circle cx="{cx}" cy="{cy}" r="{R}"/></clipPath>'
            '<radialGradient id="vig" cx=".5" cy=".5" r=".5"><stop offset=".72" stop-color="#000" stop-opacity="0"/>'
            '<stop offset="1" stop-color="#000" stop-opacity=".85"/></radialGradient>'
            '<radialGradient id="lun" cx=".3" cy=".4" r=".8"><stop offset="0" stop-color="#d6d2c8"/><stop offset="1" stop-color="#8f8b83"/></radialGradient>'
            '<radialGradient id="lmb" cx=".42" cy=".4" r=".62"><stop offset=".6" stop-color="#000" stop-opacity="0"/>'
            '<stop offset="1" stop-color="#000" stop-opacity=".45"/></radialGradient>'
            '<radialGradient id="sg" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff1cf"/><stop offset=".6" stop-color="#e3c27f"/>'
            '<stop offset="1" stop-color="#8a6a33"/></radialGradient>'
            '<linearGradient id="brl" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5d6589"/><stop offset=".5" stop-color="#1b2236"/>'
            '<stop offset="1" stop-color="#3a4262"/></linearGradient>')
    grip = "".join(f'<path d="M{f(cx + (R + 5) * math.cos(a))} {f(cy + (R + 5) * math.sin(a))}L{f(cx + (R + 11) * math.cos(a))} {f(cy + (R + 11) * math.sin(a))}"/>'
                   for a in [k * math.pi / 18 for k in range(36)])
    body = (f'<circle cx="{cx}" cy="{cy}" r="{R + 13}" fill="url(#brl)"/>'
            f'<g stroke="#04050a" stroke-opacity=".5" stroke-width="1.6">{grip}</g>'
            f'<circle cx="{cx}" cy="{cy}" r="{R + 3}" fill="#04050a" stroke="{NEBULA}" stroke-opacity=".6" stroke-width="1.4"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="#020306"/>'
            f'<g clip-path="url(#ev)">{inview}<circle cx="{cx}" cy="{cy}" r="{R}" fill="url(#vig)"/></g>'
            f'<text class="mono" x="24" y="66" font-size="10" letter-spacing="1.2" fill="{FAINT}">IN THE EYEPIECE</text>'
            + labels + scope)
    return dict(defs=defs, css="".join(css), body=body, stars=30, star_h=150)
