"""hero.svg — the README banner (1280 x 560)."""
import math
import random

from common import (AURORA, BG, FLAME, ICE, MUTED, NEBULA, PLASMA, SOL, TEXT, TEXT2, anim, arclen_sampler,
                    bezier, ellipse_arc, ellipse_pts, f, kf, orbit_kf, rrpath, stars, svg_doc, tr, twinkle_css)

W, H = 1280, 560


def starfield():
    """Three parallax layers; each layer is drawn once and repeated with <use> so the drift loops."""
    defs, body, css = [], [], []
    text_zone = lambda x, y: 60 < x < 760 and 90 < y < 350 and random.random() < 0.55  # thinner behind text
    layers = [  # (id, count, rmin, rmax, drift seconds)
        ("sf", 230, 0.35, 0.95, 260),
        ("sm", 110, 0.6, 1.35, 150),
        ("sn", 34, 1.0, 1.9, 90),
    ]
    random.seed(7)
    for i, (lid, n, rmin, rmax, dur) in enumerate(layers):
        g = stars(100 + i, n, W, H, rmin=rmin, rmax=rmax, groups=4, prefix=f"{lid}t", avoid=text_zone)
        defs.append(f'<g id="{lid}">{g}</g>')
        body.append(f'<g class="{lid}"><use href="#{lid}" xlink:href="#{lid}"/>'
                    f'<use href="#{lid}" xlink:href="#{lid}" x="{W}"/></g>')
        css.append(kf(f"{lid}d", [(0, "transform:translateX(0)"), (100, f"transform:translateX(-{W}px)")]))
        css.append(anim(f".{lid}", f"{lid}d", dur))
        css.append(twinkle_css(f"{lid}t", 4, base=2.4 + i * 0.8, step=1.1, lo=0.15 + 0.1 * i))
    # a few bright glinting stars with cross flares
    rng = random.Random(3)
    glints = []
    for k, (x, y) in enumerate([(612, 64), (1188, 92), (842, 470), (330, 470), (1236, 500), (70, 60)]):
        c = [ICE, "#fff", SOL, NEBULA, "#fff", ICE][k]
        glints.append(f'<g transform="translate({x} {y})"><g class="gl gl{k % 3}">'
                      f'<circle r="5" fill="url(#glow)" opacity=".7"/>'
                      f'<path d="M-7 0H7M0-7V7" stroke="{c}" stroke-width=".7" opacity=".8"/>'
                      f'<circle r="1.3" fill="{c}"/></g></g>')
    css.append(kf("glp", [(0, "transform:scale(.6);opacity:.5"), (50, "transform:scale(1.15);opacity:1"),
                          (100, "transform:scale(.6);opacity:.5")]))
    for k in range(3):
        css.append(anim(f".gl{k}", "glp", 3.6 + k * 1.3, "ease-in-out", delay=-k * 1.1))
    body.append("".join(glints))
    return "".join(defs), "".join(css), "".join(body)


def nebula():
    defs = (
        '<radialGradient id="nb1" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#6d4bd8" stop-opacity=".55"/>'
        '<stop offset=".45" stop-color="#3b2a8f" stop-opacity=".22"/><stop offset="1" stop-color="#3b2a8f" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="nb2" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ff4f9a" stop-opacity=".30"/>'
        '<stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="nb3" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#7cc8ff" stop-opacity=".22"/>'
        '<stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="nb4" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ff7a3d" stop-opacity=".16"/>'
        '<stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>'
    )
    body = (
        '<g transform="translate(990 250)"><g class="nbA"><ellipse rx="420" ry="250" fill="url(#nb1)" transform="rotate(-18)"/></g></g>'
        '<g transform="translate(1180 470)"><g class="nbB"><ellipse rx="300" ry="170" fill="url(#nb2)" transform="rotate(-25)"/></g></g>'
        '<g transform="translate(700 40)"><g class="nbC"><ellipse rx="380" ry="160" fill="url(#nb3)"/></g></g>'
        '<g transform="translate(250 560)"><g class="nbD"><ellipse rx="420" ry="150" fill="url(#nb4)"/></g></g>'
    )
    css = (kf("nbr", [(0, "transform:scale(1);opacity:.85"), (50, "transform:scale(1.08) rotate(3deg);opacity:1"),
                      (100, "transform:scale(1);opacity:.85")])
           + anim(".nbA", "nbr", 16, "ease-in-out") + anim(".nbB", "nbr", 12, "ease-in-out", -4)
           + anim(".nbC", "nbr", 19, "ease-in-out", -9) + anim(".nbD", "nbr", 14, "ease-in-out", -2))
    return defs, css, body


def solar_system():
    cx, cy, tilt = 1036, 236, -14
    defs = (
        '<radialGradient id="sun" cx=".42" cy=".4" r=".6"><stop offset="0" stop-color="#fffbe8"/>'
        '<stop offset=".35" stop-color="#ffe29a"/><stop offset=".75" stop-color="#ffb13b"/><stop offset="1" stop-color="#ff7a3d"/></radialGradient>'
        '<radialGradient id="sunG" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffd27a" stop-opacity=".75"/>'
        '<stop offset=".3" stop-color="#ffb13b" stop-opacity=".25"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="pl" cx=".35" cy=".35" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".55"/>'
        '<stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient>'
        '<linearGradient id="jup" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c9a0"/><stop offset=".3" stop-color="#c98f5a"/>'
        '<stop offset=".45" stop-color="#f0dcc0"/><stop offset=".62" stop-color="#b87a4b"/><stop offset=".8" stop-color="#e9cfae"/><stop offset="1" stop-color="#a86d42"/></linearGradient>'
    )
    planets = [  # rx, period s, radius, fill, phase, extra
        (58, 6, 3.4, "#c9c2b6", 0.4, ""),
        (86, 10, 5.2, "#f1d49b", 2.4, ""),
        (116, 16, 5.8, "#4f9cff", 4.1, "earth"),
        (150, 25, 4.6, FLAME, 1.2, ""),
        (194, 42, 11, "url(#jup)", 3.3, ""),
    ]
    orbit_back, orbit_front, plan, css = [], [], [], []
    for i, (rx, T, r, fill, ph, extra) in enumerate(planets):
        ry = rx * 0.33
        # far half (behind the Sun) then near half
        orbit_back.append(f'<path d="{ellipse_arc(cx, cy, rx, ry, tilt, math.pi, 2 * math.pi, 48)}"/>')
        orbit_front.append(f'<path d="{ellipse_arc(cx, cy, rx, ry, tilt, 0, math.pi, 48)}"/>')
        pts = ellipse_pts(cx, cy, rx, ry, tilt, 48, phase=ph)
        css.append(orbit_kf(f"p{i}", pts, occl=(cx, cy, 30), size=(0.78, 1.12)))
        css.append(anim(f".p{i}", f"p{i}", T))
        x0, y0, d0 = pts[0]
        sc0 = 0.78 + 0.34 * (d0 + 1) / 2
        inner = f'<circle r="{r}" fill="{fill}"/><circle r="{r}" fill="url(#pl)"/>'
        if extra == "earth":
            inner = (f'<circle r="{r + 3}" fill="{ICE}" opacity=".18"/>' + inner +
                     f'<g class="moon"><circle cx="{r + 6}" r="1.4" fill="#d9dbe6"/></g>')
        plan.append(f'<g class="p{i}" style="transform:{tr(x0, y0, sc=sc0)}">{inner}</g>')
    css.append(kf("mo", [(0, "transform:rotate(0)"), (100, "transform:rotate(360deg)")]) + anim(".moon", "mo", 3.2))
    # Saturn on the outermost orbit, with ring
    rx, T = 234, 60
    ry = rx * 0.33
    orbit_back.append(f'<path d="{ellipse_arc(cx, cy, rx, ry, tilt, math.pi, 2 * math.pi, 60)}"/>')
    orbit_front.append(f'<path d="{ellipse_arc(cx, cy, rx, ry, tilt, 0, math.pi, 60)}"/>')
    pts = ellipse_pts(cx, cy, rx, ry, tilt, 60, phase=5.2)
    css.append(orbit_kf("p9", pts, occl=(cx, cy, 30), size=(0.8, 1.1)) + anim(".p9", "p9", T))
    x0, y0, d0 = pts[0]
    plan.append(f'<g class="p9" style="transform:{tr(x0, y0)}"><g transform="rotate(-18)">'
                '<ellipse rx="17" ry="5" fill="none" stroke="#d9c49a" stroke-width="2.2" opacity=".55"/>'
                '<circle r="8" fill="#e3cc98"/><circle r="8" fill="url(#pl)"/>'
                '<path d="M-17 0A17 5 0 0 0 17 0" fill="none" stroke="#f1e2bd" stroke-width="2.2" opacity=".9"/></g></g>')
    sun = (f'<g transform="translate({cx} {cy})"><g class="sunG"><circle r="120" fill="url(#sunG)"/></g>'
           '<circle r="27" fill="url(#sun)"/><circle r="27" fill="none" stroke="#fff3cf" stroke-opacity=".6"/></g>')
    css.append(kf("sg", [(0, "transform:scale(.92);opacity:.85"), (50, "transform:scale(1.06);opacity:1"),
                         (100, "transform:scale(.92);opacity:.85")]) + anim(".sunG", "sg", 5, "ease-in-out"))
    body = (f'<g fill="none" stroke="#9fb4ff" stroke-opacity=".22" stroke-width="1">{"".join(orbit_back)}</g>'
            + sun +
            f'<g fill="none" stroke="#b7c6ff" stroke-opacity=".32" stroke-width="1">{"".join(orbit_front)}</g>'
            + "".join(plan))
    return defs, "".join(css), body


def earth_limb():
    # A sliver of planet along the bottom edge, with an atmosphere rim.
    cx, cy, r = 360, 1760, 1250
    defs = ('<radialGradient id="limb" gradientUnits="userSpaceOnUse" cx="360" cy="1760" r="1250">'
            '<stop offset=".93" stop-color="#050a1a"/><stop offset=".985" stop-color="#0d2448"/>'
            '<stop offset="1" stop-color="#1f5a9e"/></radialGradient>'
            '<radialGradient id="atm" gradientUnits="userSpaceOnUse" cx="360" cy="1760" r="1290">'
            '<stop offset=".965" stop-color="#7cc8ff" stop-opacity="0"/><stop offset=".969" stop-color="#7cc8ff" stop-opacity=".35"/>'
            '<stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></radialGradient>')
    body = (f'<circle cx="{cx}" cy="{cy}" r="1290" fill="url(#atm)"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#limb)"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#9bd6ff" stroke-opacity=".55" stroke-width="1.2"/>')
    return defs, body, (cx, cy, r)


def rocket(limb):
    lcx, lcy, lr = limb
    x0 = 170
    y0 = lcy - math.sqrt(lr * lr - (x0 - lcx) ** 2)
    P0, P1, P2, P3 = (x0, y0), (x0 + 4, y0 - 120), (470, 372), (1340, 318)
    pts = [bezier(P0, P1, P2, P3, i / 200) for i in range(201)]
    L, at = arclen_sampler(pts)
    d = "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts[::4])
    T = 8.0
    t_ign, t_go, t_out = 0.0, 7.0, 72.0   # percent of loop
    rk, trail, core = [], [], []
    N = 34
    s_static = 0.34
    for i in range(N + 1):
        u = i / N
        s = u ** 1.75
        p = t_go + (t_out - t_go) * u
        x, y, ang = at(s)
        rk.append((p, f"transform:{tr(x, y, ang + 90)};opacity:1"))
        trail.append((p, f"stroke-dashoffset:{f(L * (1 - s))}"))
    x, y, ang = at(0)
    stops = [(0, f"transform:{tr(x, y, ang + 90)};opacity:0"), (2, f"transform:{tr(x, y, ang + 90)};opacity:1")] + rk
    stops += [(t_out + 0.1, f"transform:{tr(x, y, ang + 90)};opacity:0"), (100, f"transform:{tr(x, y, ang + 90)};opacity:0")]
    css = [kf("rk", stops), anim(".rk", "rk", T)]
    tstops = [(0, f"stroke-dashoffset:{f(L)};opacity:1")] + trail + [
        (80, "stroke-dashoffset:0;opacity:.9"), (96, "stroke-dashoffset:0;opacity:0"),
        (96.1, f"stroke-dashoffset:{f(L)};opacity:0"), (100, f"stroke-dashoffset:{f(L)};opacity:1")]
    css += [kf("tr", tstops), anim(".trl", "tr", T)]
    # bright short segment glued to the rocket (a hot exhaust core)
    seg = 120
    hs = [(0, f"stroke-dashoffset:{f(seg)};opacity:0")]
    for i in range(N + 1):
        u = i / N
        s = u ** 1.75
        p = t_go + (t_out - t_go) * u
        hs.append((p, f"stroke-dashoffset:{f(seg - s * L)};opacity:1"))
    hs += [(t_out + 0.1, "opacity:0"), (100, "opacity:0")]
    css += [kf("hs", hs), anim(".hot", "hs", T)]
    # flame flicker + launch puffs
    css.append(kf("fk", [(0, "transform:scale(1,1)"), (25, "transform:scale(.8,1.25)"), (50, "transform:scale(1.1,.85)"),
                         (75, "transform:scale(.9,1.15)"), (100, "transform:scale(1,1)")]))
    css.append(anim(".fk", "fk", 0.18))
    css.append(kf("pf", [(0, "transform:scale(.2);opacity:0"), (3, "transform:scale(.4);opacity:.75"),
                         (30, "transform:scale(1.5);opacity:.35"), (55, "transform:scale(2.1);opacity:0"),
                         (100, "transform:scale(2.1);opacity:0")]))
    puffs = []
    rng = random.Random(11)
    for k in range(7):
        dx = rng.uniform(-38, 38)
        dy = rng.uniform(-10, 4)
        r = rng.uniform(9, 16)
        cls = f"pf{k}"
        css.append(anim(f".{cls}", "pf", T, "ease-out", delay=-(T - 0.56 - k * 0.07) % T))
        puffs.append(f'<g transform="translate({f(x0 + dx)} {f(y0 + dy)})"><circle class="{cls}" r="{f(r)}" '
                     f'fill="url(#smk)" style="opacity:0"/></g>')
    xs, ys, angs = at(s_static)
    body = (
        f'<path class="trl" d="{d}" fill="none" stroke="url(#trG)" stroke-width="7" stroke-linecap="round" '
        f'stroke-dasharray="{f(L)} {f(L)}" stroke-dashoffset="{f(L * (1 - s_static))}" opacity=".9"/>'
        f'<path class="trl" d="{d}" fill="none" stroke="#fff3e6" stroke-opacity=".55" stroke-width="1.4" '
        f'stroke-dasharray="{f(L)} {f(L)}" stroke-dashoffset="{f(L * (1 - s_static))}"/>'
        f'<path class="hot rm-hide" d="{d}" fill="none" stroke="url(#hotG)" stroke-width="3" stroke-linecap="round" '
        f'stroke-dasharray="{seg} {f(L * 2)}" stroke-dashoffset="{f(seg - s_static * L)}" style="opacity:0"/>'
        + "".join(puffs) +
        f'<g class="rk" style="transform:{tr(xs, ys, angs + 90)}"><g transform="scale(1.3)">'
        # flame (pivot at the nozzle, y=13)
        '<g transform="translate(0 13)"><g class="fk">'
        '<path d="M-6 0Q-7 14 0 34Q7 14 6 0Z" fill="url(#flm)"/>'
        '<path d="M-3 0Q-3.5 8 0 18Q3.5 8 3 0Z" fill="#fff6d8"/></g></g>'
        '<circle cy="16" r="16" fill="url(#flmG)"/>'
        # body: pointing up, nose at y=-24
        '<path d="M-5 12L-5-12Q-5-20 0-26Q5-20 5-12L5 12Z" fill="#eef2ff"/>'
        '<path d="M0-26Q5-20 5-12L5 12L2 12L2-12Q2-20 0-26Z" fill="#b9c3e6"/>'
        '<rect x="-5" y="-6" width="10" height="2.4" fill="#1b2236"/>'
        '<path d="M-5 5L-10 14L-5 12Z M5 5L10 14L5 12Z" fill="#c8d2f5"/>'
        '<circle cy="-14" r="1.8" fill="#7cc8ff"/>'
        '</g></g>'
    )
    defs = (
        '<linearGradient id="trG" gradientUnits="userSpaceOnUse" x1="170" y1="520" x2="1300" y2="320">'
        '<stop offset="0" stop-color="#8f98bd" stop-opacity=".05"/><stop offset=".55" stop-color="#ffd2b0" stop-opacity=".18"/>'
        '<stop offset="1" stop-color="#ffe7cf" stop-opacity=".32"/></linearGradient>'
        '<linearGradient id="hotG" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0">'
        '<stop offset="0" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ffc24b"/></linearGradient>'
        '<linearGradient id="flm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe8a8"/>'
        '<stop offset=".35" stop-color="#ffc24b"/><stop offset=".7" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></linearGradient>'
        '<radialGradient id="flmG"><stop offset="0" stop-color="#ffb35c" stop-opacity=".7"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="smk"><stop offset="0" stop-color="#f3f5ff" stop-opacity=".9"/>'
        '<stop offset=".6" stop-color="#b9c1dc" stop-opacity=".5"/><stop offset="1" stop-color="#8f98bd" stop-opacity="0"/></radialGradient>'
        '<radialGradient id="glow"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>'
    )
    # hot core gradient must follow the path direction; approximate with a userSpace gradient along x
    defs = defs.replace('id="hotG" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1" y2="0"',
                        'id="hotG" gradientUnits="userSpaceOnUse" x1="170" y1="0" x2="1300" y2="0"')
    return defs, "".join(css), body


def meteors():
    css, body = [], []
    specs = [  # x, y, len, period, delay
        (560, 40, 140, 9.0, 2.2),
        (1180, 30, 110, 13.0, 6.5),
        (880, 130, 90, 11.0, 9.0),
        (380, 60, 80, 17.0, 13.0),
    ]
    for i, (x, y, ln, T, dl) in enumerate(specs):
        vis = 0.9 / T * 100
        css.append(kf(f"m{i}", [(0, "transform:translate(0,0);opacity:0"), (1, "opacity:1"),
                                (vis, f"transform:translate(-{ln * 1.6:.0f}px,{ln * 0.8:.0f}px);opacity:0"),
                                (100, f"transform:translate(-{ln * 1.6:.0f}px,{ln * 0.8:.0f}px);opacity:0")]))
        css.append(anim(f".m{i}", f"m{i}", T, "ease-in", delay=-dl))
        dx, dy = ln * 0.894, ln * 0.447
        body.append(f'<g transform="translate({x} {y})"><g class="m{i} rm-hide" style="opacity:0">'
                    f'<path d="M0 0L{f(dx)} {f(-dy)}" stroke="url(#met)" stroke-width="1.4" stroke-linecap="round"/>'
                    '<circle r="1.6" fill="#fff"/></g></g>')
    defs = ('<linearGradient id="met" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/>'
            '<stop offset=".3" stop-color="#bfe3ff" stop-opacity=".6"/><stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></linearGradient>')
    return defs, "".join(css), "".join(body)


def text_block():
    x = 80
    title_w = 640
    defs = (
        f'<clipPath id="ttl"><text x="{x - 4}" y="222" class="sans" font-size="96" font-weight="800" '
        f'letter-spacing="-2.5" textLength="{title_w}" lengthAdjust="spacingAndGlyphs">Cosmic Library</text></clipPath>'
        '<linearGradient id="shim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1400" y2="0" spreadMethod="repeat">'
        '<stop offset="0" stop-color="#ffffff"/><stop offset=".17" stop-color="#bfe3ff"/><stop offset=".34" stop-color="#b18cff"/>'
        '<stop offset=".5" stop-color="#ff7a3d"/><stop offset=".66" stop-color="#b18cff"/><stop offset=".83" stop-color="#bfe3ff"/>'
        '<stop offset="1" stop-color="#ffffff"/></linearGradient>'
        '<linearGradient id="spec" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/>'
        '<stop offset=".5" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
    )
    css = (kf("shm", [(0, "transform:translateX(0)"), (100, "transform:translateX(-1400px)")])
           + anim(".shm", "shm", 14)
           + kf("spc", [(0, "transform:translateX(-200px) skewX(-20deg)"), (22, "transform:translateX(820px) skewX(-20deg)"),
                        (100, "transform:translateX(820px) skewX(-20deg)")])
           + anim(".spc", "spc", 7, "ease-in-out", delay=-5.2)
           + kf("ebl", [(0, "transform:scaleX(0)"), (12, "transform:scaleX(1)"), (100, "transform:scaleX(1)")])
           )
    chips = [("22", "interactive pages", ICE), ("47", "equations", NEBULA), ("20", "hands-on builds", AURORA),
             ("7", "Python simulations", SOL)]
    cx = x
    chip_svg = []
    for i, (num, lab, col) in enumerate(chips):
        # width estimated from a mid-width sans; textLength keeps it deterministic across fonts
        tw = len(num) * 9.2 + 4 + len(lab) * 7.8
        w = tw + 42
        chip_svg.append(
            f'<g transform="translate({f(cx)} 304)"><rect width="{f(w)}" height="36" rx="18" fill="#04050a" fill-opacity=".7"/>'
            f'<rect width="{f(w)}" height="36" rx="18" fill="{col}" fill-opacity=".1" stroke="{col}" stroke-opacity=".5"/>'
            f'<circle cx="18" cy="18" r="3.4" fill="{col}"/><circle cx="18" cy="18" r="6.5" fill="{col}" opacity=".2"/>'
            f'<text x="31" y="23.5" class="sans" font-size="15" textLength="{f(tw)}" lengthAdjust="spacing">'
            f'<tspan font-weight="700" fill="{TEXT}">{num}</tspan><tspan fill="{TEXT2}"> {lab}</tspan></text></g>')
        cx += w + 9
    body = (
        f'<g transform="translate({x} 128)"><path d="M0 0H30" stroke="{ICE}" stroke-width="1.5" opacity=".8"/></g>'
        f'<text x="{x + 42}" y="133" class="mono" font-size="15" font-weight="600" letter-spacing="3.4" fill="{ICE}">'
        'AN OPEN ATLAS OF SPACE &amp; SPACEFLIGHT</text>'
        # soft shadow under the title for depth
        f'<text x="{x - 4}" y="226" class="sans" font-size="96" font-weight="800" letter-spacing="-2.5" '
        f'textLength="{title_w}" lengthAdjust="spacingAndGlyphs" fill="#000" opacity=".45">Cosmic Library</text>'
        '<g clip-path="url(#ttl)"><rect class="shm" x="0" y="120" width="2800" height="120" fill="url(#shim)"/>'
        '<rect class="spc rm-hide" x="0" y="120" width="90" height="120" fill="url(#spec)" style="transform:translateX(820px) skewX(-20deg)"/></g>'
        f'<text x="{x}" y="276" class="sans" font-size="27" font-weight="500" fill="{MUTED}">'
        f'<tspan fill="{FLAME}" font-weight="600">Fly it</tspan> · '
        f'<tspan fill="{ICE}" font-weight="600">Explore it</tspan> · '
        f'<tspan fill="{NEBULA}" font-weight="600">Learn it</tspan> · '
        f'<tspan fill="{AURORA}" font-weight="600">Build it</tspan></text>'
        + "".join(chip_svg)
    )
    return defs, css, body


def build():
    sf_defs, sf_css, sf_body = starfield()
    nb_defs, nb_css, nb_body = nebula()
    ss_defs, ss_css, ss_body = solar_system()
    lb_defs, lb_body, limb = earth_limb()
    rk_defs, rk_css, rk_body = rocket(limb)
    mt_defs, mt_css, mt_body = meteors()
    tx_defs, tx_css, tx_body = text_block()
    defs = (
        f'<clipPath id="card"><rect width="{W}" height="{H}" rx="28"/></clipPath>'
        '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#070a18"/>'
        f'<stop offset="1" stop-color="{BG}"/></linearGradient>'
        + sf_defs + nb_defs + ss_defs + lb_defs + rk_defs + mt_defs + tx_defs)
    body = (
        f'<g clip-path="url(#card)"><rect width="{W}" height="{H}" fill="url(#bg)"/>'
        + nb_body + sf_body + mt_body + ss_body + lb_body + rk_body + tx_body +
        '</g>'
        f'<rect x=".75" y=".75" width="{W - 1.5}" height="{H - 1.5}" rx="27.5" fill="none" stroke="#96aaff" stroke-opacity=".2" stroke-width="1.5"/>'
    )
    css = sf_css + nb_css + ss_css + rk_css + mt_css + tx_css
    return svg_doc(W, H, "Cosmic Library: an open atlas of space and spaceflight",
                   "Animated banner. A twinkling starfield drifts behind a glowing nebula; planets circle a small Sun "
                   "on the right; a rocket lifts off from the curve of the Earth at lower left and arcs across the "
                   "sky. The title Cosmic Library shimmers from white to ice blue, violet and flame orange above the "
                   "tagline Fly it, Explore it, Learn it, Build it and four facts: 22 interactive pages, 47 "
                   "equations, 20 hands-on builds and 7 Python simulations.",
                   defs, css, body, uid="h")
