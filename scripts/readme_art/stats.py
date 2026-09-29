"""stats.svg (1000 x 170): seven counters that tick up, each with a tiny looping icon.

Every number is read from the repository when the art is built (facts.py), so the
card stays true as equations, photographs or builds are added. The counters are
odometer columns (all intermediate values stacked in a clipped window) moved with
CSS steps(); with reduced motion they sit on the final value.
"""
import math

from common import AURORA, FAINT, FLAME, ICE, MUTED, NEBULA, PLASMA, SERIF, SOL, TEXT, TEXT2, anim, f, kf, rrpath, stars, svg_doc, twinkle_css
from facts import counts

W, H = 1000, 170
T = 10.0


def icon(kind, col):
    """Tiny animated icon centred on (0, 0), about 40 x 34. Returns (css, svg)."""
    if kind == "pages":
        css = kf("pg", [(0, "transform:translate(0,0)"), (30, "transform:translate(10px,-6px)"), (60, "transform:translate(10px,-6px)"), (100, "transform:translate(0,0)")])
        css += anim(".pg", "pg", 3, "ease-in-out")
        svg = (f'<rect x="-18" y="-10" width="28" height="22" rx="3" fill="#0b1020" stroke="{col}" stroke-opacity=".5"/>'
               f'<g class="pg"><rect x="-14" y="-14" width="28" height="22" rx="3" fill="#10162c" stroke="{col}"/>'
               f'<path d="M-14 -9H14" stroke="{col}" stroke-opacity=".6"/><circle cx="-10" cy="-11.5" r="1" fill="{col}"/>'
               f'<circle cx="0" cy="0" r="4" fill="{col}" opacity=".7"/><ellipse rx="9" ry="2.6" fill="none" stroke="{col}" stroke-opacity=".7" transform="rotate(-20)"/></g>')
    elif kind == "equations":
        css = kf("eq", [(0, "transform:scaleX(0)"), (40, "transform:scaleX(1)"), (80, "transform:scaleX(1)"), (100, "transform:scaleX(0)")]) + anim(".eq", "eq", 2.6, "ease-in-out")
        svg = (f'<text x="0" y="5" text-anchor="middle" class="serif" font-style="italic" font-size="22" fill="{TEXT}">Δv</text>'
               f'<g transform="translate(-16 12)"><rect class="eq" width="32" height="2.4" rx="1.2" fill="{col}"/></g>')
    elif kind == "photographs":
        css = kf("fl", [(0, "opacity:0"), (84, "opacity:0"), (88, "opacity:1"), (96, "opacity:0"), (100, "opacity:0")]) + anim(".fl", "fl", 2.8)
        svg = (f'<rect x="-16" y="-9" width="32" height="21" rx="4" fill="#10162c" stroke="{col}"/><rect x="-7" y="-13" width="10" height="5" rx="1.5" fill="{col}"/>'
               f'<circle cy="1.5" r="6.5" fill="none" stroke="{col}" stroke-width="1.6"/><circle cy="1.5" r="2.6" fill="{col}" opacity=".6"/>'
               f'<g class="fl" style="opacity:0"><circle cx="10" cy="-5" r="9" fill="#fff" opacity=".35"/><circle cx="10" cy="-5" r="2.5" fill="#fff"/></g>')
    elif kind == "milestones":
        css = kf("ms", [(0, "transform:translateX(-16px)"), (100, "transform:translateX(16px)")]) + anim(".ms", "ms", 3, "ease-in-out", extra=" alternate")
        svg = (f'<path d="M-18 4H18" stroke="{col}" stroke-opacity=".5" stroke-width="1.6"/>'
               + "".join(f'<circle cx="{x}" cy="4" r="2" fill="{col}" opacity=".6"/>' for x in (-16, -5, 5, 16))
               + f'<g class="ms"><path d="M0 -12V1" stroke="{col}" stroke-width="1.4"/><circle cy="4" r="4.2" fill="#fff" stroke="{col}" stroke-width="2"/>'
               f'<path d="M0 -12H9L6 -9L9 -6H0" fill="{col}"/></g>')
    elif kind == "documents":
        css = "".join(kf(f"dl{k}", [(0, "transform:scaleX(0)"), (15 + k * 15, "transform:scaleX(0)"), (30 + k * 15, "transform:scaleX(1)"),
                                     (88, "transform:scaleX(1)"), (100, "transform:scaleX(0)")]) + anim(f".dl{k}", f"dl{k}", 3.4) for k in range(4))
        svg = (f'<path d="M-12 -15H6L13 -8V15H-12Z" fill="#10162c" stroke="{col}"/><path d="M6 -15V-8H13" fill="none" stroke="{col}"/>'
               + "".join(f'<g transform="translate(-8 {-6 + k * 5.5})"><rect class="dl{k}" width="{16 - (k % 2) * 5}" height="1.8" rx=".9" fill="{col}" opacity=".8"/></g>' for k in range(4)))
    elif kind == "builds":
        css = kf("gr", [(0, "transform:rotate(0)"), (100, "transform:rotate(360deg)")]) + anim(".gr", "gr", 6) + anim(".gr2", "gr", 4, extra=" reverse")
        teeth = lambda r, n: "".join(f'<rect x="-2" y="{-r - 3.5}" width="4" height="5" rx="1" transform="rotate({k * 360 / n})"/>' for k in range(n))
        svg = (f'<g transform="translate(-6 2)"><g class="gr" fill="{col}">{teeth(9, 8)}<circle r="9.5"/><circle r="3.5" fill="#0b1020"/></g></g>'
               f'<g transform="translate(11 -8)"><g class="gr2" fill="{col}" opacity=".7">{teeth(5, 6)}<circle r="5.5"/><circle r="2" fill="#0b1020"/></g></g>')
    else:  # simulations
        pts = " ".join(f"{f(-14 + 28 * i / 24)},{f(6 - 7 * math.sin(i / 24 * 2 * math.pi))}" for i in range(25))
        css = (kf("sw", [(0, "stroke-dashoffset:1"), (60, "stroke-dashoffset:0"), (90, "stroke-dashoffset:0"), (100, "stroke-dashoffset:1")]) + anim(".sw", "sw", 3)
               + kf("cu", [(0, "opacity:1"), (50, "opacity:0"), (100, "opacity:1")]) + anim(".cu", "cu", .9, "steps(1)"))
        svg = (f'<rect x="-19" y="-15" width="38" height="30" rx="4" fill="#060913" stroke="{col}" stroke-opacity=".7"/>'
               f'<text x="-15" y="-4" class="mono" font-size="8.5" fill="{col}">&gt;_</text><rect class="cu" x="-3" y="-11" width="4" height="8" fill="{col}"/>'
               f'<polyline class="sw" points="{pts}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="{SOL}" stroke-width="1.5"/>')
    return css, svg


def counter(i, final, label, x, y, col):
    """Odometer: stacked values in a clip window, moved by steps()."""
    n_final = int("".join(ch for ch in final if ch.isdigit()))
    K = min(14, n_final)
    vals = [str(round(n_final * (1 - (1 - k / K) ** 2.2))) for k in range(K)] + [final]
    step = 42
    t0, t1 = 6 + i * 2.5, 30 + i * 2.5
    css = kf(f"c{i}", [(0, "transform:translateY(0);opacity:1"), (t0, f"transform:translateY(0);animation-timing-function:steps({K},end)"),
                       (t1, f"transform:translateY({-K * step}px)"), (90, f"transform:translateY({-K * step}px);opacity:1"),
                       (95, f"transform:translateY({-K * step}px);opacity:0"), (95.1, "transform:translateY(0);opacity:0"),
                       (100, "transform:translateY(0);opacity:1")]) + anim(f".c{i}", f"c{i}", T)
    css += kf(f"g{i}", [(0, "transform:scaleX(0);opacity:0"), (t1 - 1, "transform:scaleX(0);opacity:0"), (t1 + 2, "transform:scaleX(1);opacity:1"),
                        (90, "transform:scaleX(1);opacity:1"), (95, "transform:scaleX(1);opacity:0"), (100, "transform:scaleX(0);opacity:0")]) + anim(f".g{i}", f"g{i}", T, "ease-out")
    col_txt = "".join(f'<text x="0" y="{k * step}" text-anchor="middle" class="sans" font-size="34" font-weight="800" fill="{TEXT}">{v}</text>'
                      for k, v in enumerate(vals))
    svg = (f'<clipPath id="w{i}"><rect x="{f(x - 70)}" y="{y - 32}" width="140" height="42"/></clipPath>'
           f'<g transform="translate({f(x - 18)} {y + 7})"><rect class="g{i}" width="36" height="2.5" rx="1.25" fill="{col}"/></g>'
           f'<g clip-path="url(#w{i})"><g transform="translate({f(x)} {y})"><g class="c{i}" style="transform:translateY({-K * step}px)">{col_txt}</g></g></g>'
           f'<text x="{f(x)}" y="{y + 28}" text-anchor="middle" class="sans" font-size="14" fill="{TEXT2}">{label}</text>')
    return css, svg


def build():
    c = counts()
    ph = c["photographs"]
    items = [
        ("pages", str(c["pages"]), "interactive pages", ICE),
        ("equations", str(c["equations"]), "equations", NEBULA),
        ("photographs", f"{ph // 10 * 10}+" if ph >= 20 else str(ph), "photographs", PLASMA),
        ("milestones", str(c["milestones"]), "milestones", FLAME),
        ("documents", str(c["documents"]), "documents", SOL),
        ("builds", str(c["builds"]), "hands-on builds", AURORA),
        ("simulations", str(c["simulations"]), "Python simulations", ICE),
    ]
    cw = (W - 24) / len(items)
    css = [twinkle_css("t", 3, 2.6, 1.1), kf("beam", [(0, "stroke-dashoffset:100"), (100, "stroke-dashoffset:0")]) + anim(".beam", "beam", 12)]
    body = [f'<g clip-path="url(#card)"><rect width="{W}" height="{H}" fill="url(#cbg)"/><rect width="{W}" height="{H}" fill="url(#acc)"/>'
            + stars(170, 60, W, H, rmin=.35, rmax=1.1, groups=3) + '</g>']
    for i, (kind, final, label, col) in enumerate(items):
        x = 12 + cw * (i + .5)
        ic, isvg = icon(kind, col)
        css.append(ic)
        body.append(f'<g transform="translate({f(x)} 44)"><circle r="25" fill="{col}" opacity=".08"/><circle r="25" fill="none" stroke="{col}" stroke-opacity=".25"/>{isvg}</g>')
        cc, csvg = counter(i, final, label, x, 116, col)
        css.append(cc)
        body.append(csvg)
        if i:
            body.append(f'<path d="M{f(12 + cw * i)} 30V140" stroke="#96aaff" stroke-opacity=".1"/>')
    body.append(f'<rect x=".75" y=".75" width="{W - 1.5}" height="{H - 1.5}" rx="17.25" fill="none" stroke="#96aaff" stroke-opacity=".2" stroke-width="1.5"/>'
                f'<path class="beam rm-hide" d="{rrpath(.75, .75, W - 1.5, H - 1.5, 17.25)}" pathLength="100" fill="none" stroke="{ICE}" '
                'stroke-width="1.5" stroke-dasharray="7 93" stroke-linecap="round" opacity=".8"/>')
    defs = (f'<clipPath id="card"><rect width="{W}" height="{H}" rx="18"/></clipPath>'
            '<linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#04050a"/></linearGradient>'
            f'<radialGradient id="acc" cx=".5" cy="0" r=".8"><stop offset="0" stop-color="{NEBULA}" stop-opacity=".12"/><stop offset="1" stop-color="{NEBULA}" stop-opacity="0"/></radialGradient>')
    desc = ("Cosmic Library in numbers, counted from the repository when this image was built: "
            + ", ".join(f"{fin} {lab}" for _, fin, lab, _ in items)
            + ". Sources: site/assets/js/codex.js (pages), site/data/equations.json, gallery.json, timeline.json and library.json, "
              "the experiments/ folders and simulations/cosmic/. Each counter ticks up from zero beside a small animated icon.")
    return svg_doc(W, H, "Cosmic Library in numbers", desc, defs, "".join(css), "".join(body), uid="st")
