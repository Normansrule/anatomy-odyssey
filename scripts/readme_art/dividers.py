"""Thin animated separators (1000 x 40) to put between README sections.

The dark strip fades to transparent at both ends (an SVG mask), so it sits well on
GitHub's white and dark backgrounds alike.
"""
import math
import random

from common import FAINT, ICE, NEBULA, SOL, anim, f, kf, stars, svg_doc, tr, twinkle_css

W, H = 1000, 40


def shell(key, title, desc, defs, css, body, seed):
    defs = ('<linearGradient id="fd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/>'
            '<stop offset=".22" stop-color="#fff"/><stop offset=".78" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
            f'<mask id="fm" maskUnits="userSpaceOnUse" x="0" y="0" width="{W}" height="{H}"><rect width="{W}" height="{H}" fill="url(#fd)"/></mask>'
            f'<clipPath id="cl"><rect width="{W}" height="{H}" rx="20"/></clipPath>' + defs)
    body = (f'<g mask="url(#fm)"><g clip-path="url(#cl)"><rect width="{W}" height="{H}" fill="#070a16"/>'
            + stars(seed, 70, W, H, rmin=.3, rmax=1.1, groups=3) + body + '</g></g>')
    return key, svg_doc(W, H, title, desc, defs, twinkle_css("t", 3, 2.4, 1.1) + css, body, uid=key[:2])


def d_orbit():
    T = 16
    sag = 26.0                             # circle through (0, 36), apex (500, 10)
    R = (500 ** 2 + sag ** 2) / (2 * sag)
    cy = 10 + R
    pts = []
    for i in range(41):
        x = -60 + 1120 * i / 40
        y = cy - math.sqrt(R * R - (x - 500) ** 2)
        a = math.degrees(math.atan((x - 500) / math.sqrt(R * R - (x - 500) ** 2)))
        pts.append((x, y, a))
    st = [(100 * i / 40, f"transform:{tr(x, y, a)}") for i, (x, y, a) in enumerate(pts)]
    arc = "M" + "L".join(f"{f(x)} {f(y)}" for x, y, _ in pts)
    css = (kf("sat", st) + anim(".sat", "sat", T)
           + kf("bk", [(0, "opacity:1"), (50, "opacity:.1"), (100, "opacity:1")]) + anim(".bk", "bk", 1.1, "steps(1)")
           + kf("dash", [(0, "stroke-dashoffset:0"), (100, "stroke-dashoffset:-60")]) + anim(".arc", "dash", 6))
    mid = pts[20]
    sat = (f'<g class="sat" style="transform:{tr(mid[0], mid[1], mid[2])}">'
           f'<rect x="-15" y="-3" width="10" height="6" fill="#3b5bd6" stroke="{ICE}" stroke-width=".6"/>'
           f'<rect x="5" y="-3" width="10" height="6" fill="#3b5bd6" stroke="{ICE}" stroke-width=".6"/>'
           '<path d="M-5 0H5" stroke="#cfd5e8"/><rect x="-3.5" y="-3.5" width="7" height="7" rx="1" fill="#e2c26a"/>'
           f'<circle class="bk" cx="0" cy="-5.5" r="1.2" fill="{SOL}"/></g>')
    body = (f'<path d="M-20 44Q500 26 1020 44" fill="none" stroke="{ICE}" stroke-opacity=".35" stroke-width="1.2"/>'
            f'<path d="M-20 46Q500 28 1020 46" fill="none" stroke="{ICE}" stroke-opacity=".1" stroke-width="6"/>'
            f'<path class="arc" d="{arc}" fill="none" stroke="{ICE}" stroke-opacity=".6" stroke-width="1.2" stroke-dasharray="6 6"/>' + sat)
    return shell("orbit", "Orbit divider", "A small satellite with blue solar panels glides along a dashed orbit arc above the curve of a planet.",
                 "", css, body, 11)


def d_comet():
    T = 13
    y0, y1 = 16, 24
    css = (kf("cm", [(0, "transform:translate(-160px,16px)"), (100, "transform:translate(1180px,24px)")]) + anim(".cm", "cm", T)
           + kf("fl", [(0, "opacity:.75"), (50, "opacity:1"), (100, "opacity:.75")]) + anim(".ion", "fl", .8, "ease-in-out"))
    comet = ('<g class="cm" style="transform:translate(560px,20px)">'
             '<path d="M0 0L-150 -5L-150 3Z" fill="url(#ion)" class="ion"/>'
             '<path d="M0 0Q-60 6 -120 14L-118 6Q-60 2 0 -1Z" fill="url(#dust)"/>'
             '<circle r="7" fill="#bfe3ff" opacity=".25"/><circle r="3" fill="#fff"/></g>')
    defs = ('<linearGradient id="ion" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#bfe3ff" stop-opacity=".9"/>'
            '<stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></linearGradient>'
            '<linearGradient id="dust" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#fff3c4" stop-opacity=".8"/>'
            '<stop offset="1" stop-color="#ffc24b" stop-opacity="0"/></linearGradient>'
            '<radialGradient id="sun" cx="1" cy=".5" r="1"><stop offset="0" stop-color="#ffc24b" stop-opacity=".35"/>'
            '<stop offset="1" stop-color="#ffc24b" stop-opacity="0"/></radialGradient>')
    body = f'<rect x="760" width="240" height="{H}" fill="url(#sun)"/>' + comet
    return shell("comet", "Comet divider",
                 "A comet crosses the strip heading toward the Sun's glow at the right, its straight blue ion tail and curved yellow dust tail "
                 "pointing away from the Sun.", defs, css, body, 23)


def d_starfield():
    rng = random.Random(9)
    big = []
    for i in range(14):
        x, y = rng.uniform(120, 880), rng.uniform(8, 32)
        c = rng.choice([ICE, "#ffffff", SOL, NEBULA])
        big.append(f'<g transform="translate({f(x)} {f(y)})"><g class="sp{i % 4}"><path d="M0 -4.5L.9 -.9L4.5 0L.9 .9L0 4.5L-.9 .9L-4.5 0L-.9 -.9Z" fill="{c}"/></g></g>')
    css = kf("sp", [(0, "transform:scale(.3);opacity:.2"), (50, "transform:scale(1);opacity:1"), (100, "transform:scale(.3);opacity:.2")])
    css += "".join(anim(f".sp{k}", "sp", 2.2 + k * .7, "ease-in-out", delay=k * .55) for k in range(4))
    css += (kf("ms", [(0, "transform:translate(300px,4px);opacity:0"), (70, "transform:translate(300px,4px);opacity:0"),
                      (72, "transform:translate(320px,8px);opacity:1"), (80, "transform:translate(480px,30px);opacity:0"),
                      (100, "transform:translate(480px,30px);opacity:0")]) + anim(".ms", "ms", 7, "ease-out"))
    meteor = ('<g class="ms rm-hide" style="opacity:0"><path d="M0 0L-40 -6" stroke="url(#mt)" stroke-width="1.4" stroke-linecap="round"/>'
              '<circle r="1.4" fill="#fff"/></g>')
    defs = ('<linearGradient id="mt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></linearGradient>')
    body = stars(91, 80, 1000, 40, rmin=.4, rmax=1.3, groups=3, prefix="t") + "".join(big) + meteor
    return shell("starfield", "Starfield divider", "A strip of twinkling stars with a few four-pointed sparkles and an occasional shooting star.",
                 defs, css, body, 31)


def build_all():
    for fn in (d_orbit, d_comet, d_starfield):
        yield fn()
