"""Animated section banners (1000 x 150) that stand in for the README's "## headings".

Each banner is a dark card: eyebrow + big shimmering title + one-line subtitle on the
left, a small looping scene on the right. `frame()` is shared with sub.py (the taller
banners at the top of the sub-READMEs).

    python scripts/readme_art/build.py sections      # just these
"""
import math
import random

from common import (AURORA, FAINT, FLAME, ICE, MUTED, NEBULA, PLASMA, SERIF, SOL, TEXT, TEXT2, anim, arclen_sampler,
                    f, kf, pts_path, rrpath, stars, svg_doc, tr, twinkle_css)
from facts import counts
from metrics import text_w

W, H = 1000, 150


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ----------------------------------------------------------------------------- frame
def frame(key, eyebrow, title, sub, c1, c2, scene, alt, w=W, h=H, title_size=46, uid=None):
    """Card + text block + scene. scene = dict(defs, css, body, x0) drawn in card coordinates."""
    uid = uid or key[:3]
    tx = 44
    ey, ty, sy = (h / 2 - 25, h / 2 + 25, h / 2 + 53) if h <= 160 else (h / 2 - 36, h / 2 + 22, h / 2 + 56)
    tw = text_w(title, title_size, True)
    seed = sum((i + 1) * ord(c) for i, c in enumerate(key))
    css = (twinkle_css("t", 3, base=2.6, step=1.1)
           + kf("shm", [(0, "transform:translateX(0)"), (100, "transform:translateX(-1200px)")]) + anim(".shm", "shm", 12)
           + kf("ebl", [(0, "transform:scaleX(.2)"), (50, "transform:scaleX(1)"), (100, "transform:scaleX(.2)")])
           + anim(".ebl", "ebl", 6, "ease-in-out")
           + kf("beam", [(0, "stroke-dashoffset:100"), (100, "stroke-dashoffset:0")]) + anim(".beam", "beam", 12)
           + scene.get("css", ""))
    defs = (
        f'<clipPath id="card"><rect width="{w}" height="{h}" rx="18"/></clipPath>'
        '<linearGradient id="cbg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#04050a"/></linearGradient>'
        f'<radialGradient id="acc" cx=".82" cy=".2" r=".7"><stop offset="0" stop-color="{c1}" stop-opacity=".15"/>'
        f'<stop offset=".7" stop-color="{c1}" stop-opacity="0"/></radialGradient>'
        f'<radialGradient id="acc2" cx=".05" cy="1" r=".5"><stop offset="0" stop-color="{c2}" stop-opacity=".10"/>'
        f'<stop offset="1" stop-color="{c2}" stop-opacity="0"/></radialGradient>'
        f'<clipPath id="ttl"><text x="{tx - 2}" y="{f(ty)}" class="sans" font-size="{title_size}" font-weight="800" letter-spacing="-1">{esc(title)}</text></clipPath>'
        '<linearGradient id="shim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="1200" y2="0" spreadMethod="repeat">'
        f'<stop offset="0" stop-color="#ffffff"/><stop offset=".2" stop-color="{c1}"/><stop offset=".42" stop-color="{c2}"/>'
        f'<stop offset=".6" stop-color="{c1}"/><stop offset=".8" stop-color="#ffffff"/><stop offset="1" stop-color="#ffffff"/></linearGradient>'
        f'<linearGradient id="sfade" gradientUnits="userSpaceOnUse" x1="{f(scene["x0"] - 30)}" y1="0" x2="{f(scene["x0"] + 50)}" y2="0">'
        '<stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient>'
        f'<mask id="smask" maskUnits="userSpaceOnUse" x="0" y="0" width="{w}" height="{h}"><rect width="{w}" height="{h}" fill="url(#sfade)"/></mask>'
        + scene.get("defs", ""))
    body = (
        f'<g clip-path="url(#card)"><rect width="{w}" height="{h}" fill="url(#cbg)"/><rect width="{w}" height="{h}" fill="url(#acc)"/>'
        f'<rect width="{w}" height="{h}" fill="url(#acc2)"/>'
        + stars(seed, int(w * h / 2400), w, h, rmin=.35, rmax=1.15, groups=3)
        + f'<g mask="url(#smask)">{scene["body"]}</g>'
        # text block
        f'<g transform="translate({tx} {f(ey - 5)})"><path class="ebl" d="M0 0H26" stroke="{c1}" stroke-width="1.6" style="transform:scaleX(1)"/></g>'
        f'<text x="{tx + 36}" y="{f(ey)}" class="mono" font-size="13" font-weight="600" letter-spacing="2.6" fill="{c1}">{esc(eyebrow)}</text>'
        f'<text x="{tx}" y="{f(ty + 3)}" class="sans" font-size="{title_size}" font-weight="800" letter-spacing="-1" fill="#000" opacity=".5">{esc(title)}</text>'
        f'<g clip-path="url(#ttl)"><rect class="shm" x="0" y="{f(ty - title_size)}" width="2400" height="{title_size + 14}" fill="url(#shim)"/></g>'
        f'<text x="{tx}" y="{f(sy)}" class="sans" font-size="16" fill="{MUTED}">{esc(sub)}</text>'
        '</g>'
        f'<rect x=".75" y=".75" width="{w - 1.5}" height="{h - 1.5}" rx="17.25" fill="none" stroke="#96aaff" stroke-opacity=".2" stroke-width="1.5"/>'
        f'<path class="beam rm-hide" d="{rrpath(.75, .75, w - 1.5, h - 1.5, 17.25)}" pathLength="100" fill="none" stroke="{c1}" '
        f'stroke-width="1.5" stroke-dasharray="7 93" stroke-linecap="round" opacity=".8"/>'
    )
    assert tw + tx < scene["x0"] - 10, (key, tw, scene["x0"])
    assert text_w(sub, 16) + tx < scene.get("sub_limit", scene["x0"] - 10), (key, "subtitle too long")
    return svg_doc(w, h, f"{esc(title)} · Cosmic Library", esc(alt), defs, css, body, uid=uid)


def x0_for(title, size=46, lo=560):
    return max(lo, 44 + text_w(title, size, True) + 40)


def win(name, a, b, fade, lo=0, hi=1):
    """Opacity window a..b (percent) with fades; loops cleanly."""
    st = [(0, f"opacity:{lo}")]
    if a - fade > 0:
        st.append((a - fade, f"opacity:{lo}"))
    st += [(a, f"opacity:{hi}"), (b, f"opacity:{hi}"), (min(100, b + fade), f"opacity:{lo}")]
    if b + fade < 100:
        st.append((100, f"opacity:{lo}"))
    return kf(name, st)


# ------------------------------------------------------------------------ figure-eight
def figure8(n=72):
    """Chenciner-Montgomery figure-eight three-body choreography (G = m = 1), integrated with RK4.

    Initial conditions: Simo (2002) / Chenciner & Montgomery (2000); period T = 6.32591398.
    Returns n+1 positions of body 1 over one period (bodies 2, 3 trail it by T/3, 2T/3)."""
    P = 6.32591398
    x = [[0.97000436, -0.24308753], [-0.97000436, 0.24308753], [0.0, 0.0]]
    v3 = [-0.93240737, -0.86473146]
    v = [[-v3[0] / 2, -v3[1] / 2], [-v3[0] / 2, -v3[1] / 2], v3[:]]

    def acc(pos):
        a = [[0.0, 0.0] for _ in range(3)]
        for i in range(3):
            for j in range(3):
                if i != j:
                    dx, dy = pos[j][0] - pos[i][0], pos[j][1] - pos[i][1]
                    r3 = (dx * dx + dy * dy) ** 1.5
                    a[i][0] += dx / r3
                    a[i][1] += dy / r3
        return a

    steps_per = 40
    dt = P / (n * steps_per)
    out = [tuple(x[0])]
    for k in range(n * steps_per):
        def deriv(pp, vv):
            return vv, acc(pp)
        s = [(x, v)]
        k1x, k1v = deriv(x, v)
        x2 = [[x[i][d] + k1x[i][d] * dt / 2 for d in (0, 1)] for i in range(3)]
        v2 = [[v[i][d] + k1v[i][d] * dt / 2 for d in (0, 1)] for i in range(3)]
        k2x, k2v = deriv(x2, v2)
        x3 = [[x[i][d] + k2x[i][d] * dt / 2 for d in (0, 1)] for i in range(3)]
        v3_ = [[v[i][d] + k2v[i][d] * dt / 2 for d in (0, 1)] for i in range(3)]
        k3x, k3v = deriv(x3, v3_)
        x4 = [[x[i][d] + k3x[i][d] * dt for d in (0, 1)] for i in range(3)]
        v4 = [[v[i][d] + k3v[i][d] * dt for d in (0, 1)] for i in range(3)]
        k4x, k4v = deriv(x4, v4)
        x = [[x[i][d] + dt / 6 * (k1x[i][d] + 2 * k2x[i][d] + 2 * k3x[i][d] + k4x[i][d]) for d in (0, 1)] for i in range(3)]
        v = [[v[i][d] + dt / 6 * (k1v[i][d] + 2 * k2v[i][d] + 2 * k3v[i][d] + k4v[i][d]) for d in (0, 1)] for i in range(3)]
        del s
        if (k + 1) % steps_per == 0:
            out.append(tuple(x[0]))
    return out


def fig8_scene(cx, cy, sx, sy, period, prefix="fb", col=(SOL, ICE, PLASMA)):
    """Figure-eight orbit path + three bodies chasing each other along it."""
    pts = figure8()
    xy = [(cx + p[0] * sx, cy - p[1] * sy) for p in pts]
    css = [kf(f"{prefix}", [(100 * i / (len(xy) - 1), f"transform:translate({f(x)}px,{f(y)}px)") for i, (x, y) in enumerate(xy)])]
    body = [f'<path d="{pts_path(xy, True)}" fill="none" stroke="#96aaff" stroke-opacity=".22" stroke-width="1.2"/>']
    for k in range(3):
        css.append(anim(f".{prefix}{k}", prefix, period, delay=-k * period / 3))
        i0 = (k * (len(xy) - 1)) // 3
        x, y = xy[(len(xy) - 1 - i0) % (len(xy) - 1)]
        body.append(f'<g class="{prefix}{k}" style="transform:translate({f(x)}px,{f(y)}px)"><circle r="7" fill="{col[k]}" opacity=".22"/>'
                    f'<circle r="3.4" fill="{col[k]}"/></g>')
    return "".join(css), "".join(body)


# ---------------------------------------------------------------------------- scenes
def sc_start(x0):
    T = 9
    cx, cy, R = x0 + 90, 78, 46
    pole = (x0 + 330, 34)
    ang = math.degrees(math.atan2(pole[0] - cx, cy - pole[1]))
    swing = [(0, -80), (10, ang + 55), (18, ang - 32), (25, ang + 18), (31, ang - 9), (36, ang + 4), (41, ang)]
    st = [(p, f"transform:rotate({f(a)}deg)") for p, a in swing] + [(80, f"transform:rotate({f(ang)}deg)"), (100, "transform:rotate(-80deg)")]
    css = [kf("nd", st), anim(".nd", "nd", T, "ease-in-out"),
           kf("rt", [(0, "stroke-dashoffset:1"), (42, "stroke-dashoffset:1"), (58, "stroke-dashoffset:0"), (84, "stroke-dashoffset:0"),
                     (92, "stroke-dashoffset:-1"), (100, "stroke-dashoffset:-1")]),
           anim(".rt", "rt", T, "ease-in-out"),
           kf("pl", [(0, "transform:scale(.6);opacity:.3"), (55, "transform:scale(.6);opacity:.3"), (62, "transform:scale(1.5);opacity:1"),
                     (84, "transform:scale(1);opacity:.8"), (95, "transform:scale(.6);opacity:.3"), (100, "transform:scale(.6);opacity:.3")]),
           anim(".pl", "pl", T, "ease-out"),
           kf("rs", [(0, "transform:rotate(0)"), (100, "transform:rotate(360deg)")]), anim(".rs", "rs", 90)]
    # star chart: polar grid around the pole, plus two asterisms
    grid = []
    for r in (40, 80, 120, 160):
        grid.append(f'<circle cx="{pole[0]}" cy="{pole[1]}" r="{r}"/>')
    for k in range(12):
        a = math.radians(k * 30)
        grid.append(f'<path d="M{f(pole[0] + 14 * math.cos(a))} {f(pole[1] + 14 * math.sin(a))}L{f(pole[0] + 200 * math.cos(a))} {f(pole[1] + 200 * math.sin(a))}"/>')
    dipper = [(x0 + 190, 24), (x0 + 214, 30), (x0 + 236, 40), (x0 + 258, 44), (x0 + 262, 70), (x0 + 294, 76), (x0 + 298, 50), (x0 + 258, 44)]
    cas = [(x0 + 356, 92), (x0 + 372, 116), (x0 + 392, 100), (x0 + 410, 122), (x0 + 426, 104)]
    ast = (f'<path d="{pts_path(dipper)}" fill="none" stroke="{ICE}" stroke-opacity=".35"/>'
           f'<path d="{pts_path(cas)}" fill="none" stroke="{ICE}" stroke-opacity=".35"/>'
           + "".join(f'<circle cx="{f(x)}" cy="{f(y)}" r="1.8" fill="#eaf4ff"/>' for x, y in dipper[:7] + cas))
    ticks = []
    for k in range(36):
        a = math.radians(k * 10)
        r1 = R - (7 if k % 9 == 0 else 4)
        ticks.append(f'M{f(R * math.sin(a))} {f(-R * math.cos(a))}L{f(r1 * math.sin(a))} {f(-r1 * math.cos(a))}')
    lab = "".join(f'<text x="{f((R - 15) * math.sin(math.radians(a)))}" y="{f(-(R - 15) * math.cos(math.radians(a)) + 4)}" class="mono" '
                  f'font-size="11" font-weight="600" text-anchor="middle" fill="{c}">{t}</text>'
                  for a, t, c in ((0, "N", FLAME), (90, "E", MUTED), (180, "S", MUTED), (270, "W", MUTED)))
    compass = (f'<g transform="translate({cx} {cy})"><circle r="{R + 8}" fill="#0b1020" fill-opacity=".85" stroke="{ICE}" stroke-opacity=".35"/>'
               f'<g class="rs"><circle r="{R + 3}" fill="none" stroke="{ICE}" stroke-opacity=".25" stroke-dasharray="2 5"/></g>'
               f'<path d="{"".join(ticks)}" stroke="{TEXT2}" stroke-opacity=".6"/>{lab}'
               f'<g class="nd" style="transform:rotate({f(ang)}deg)"><path d="M0 -34L6 0L0 4L-6 0Z" fill="{FLAME}"/><path d="M0 34L6 0L0 -4L-6 0Z" fill="#dfe4f4"/></g>'
               '<circle r="3.2" fill="#0b1020" stroke="#dfe4f4"/></g>')
    ux, uy = (pole[0] - cx), (pole[1] - cy)
    L = math.hypot(ux, uy)
    route = (f'<path class="rt" d="M{f(cx + ux / L * (R + 12))} {f(cy + uy / L * (R + 12))}L{f(pole[0] - ux / L * 12)} {f(pole[1] - uy / L * 12)}" '
             f'pathLength="1" stroke-dasharray="1 1" stroke="{SOL}" stroke-width="1.6" stroke-linecap="round" fill="none"/>')
    polaris = (f'<g transform="translate({pole[0]} {pole[1]})"><g class="pl" style="transform:scale(1);opacity:.8"><circle r="11" fill="{SOL}" opacity=".3"/></g>'
               f'<path d="M0 -7L1.4 -1.4L7 0L1.4 1.4L0 7L-1.4 1.4L-7 0L-1.4 -1.4Z" fill="#fff6d8"/></g>'
               f'<text x="{pole[0] + 14}" y="{pole[1] + 18}" class="mono" font-size="11.5" fill="{SOL}">Polaris</text>')
    body = (f'<g fill="none" stroke="{ICE}" stroke-opacity=".08">{"".join(grid)}</g>' + ast + route + polaris + compass)
    return dict(css="".join(css), body=body, x0=x0)


def rocket_parts():
    """Rocket pointing +x, drawn at the origin. Returns (booster flame, booster body, upper stage) SVG."""
    bflame = ('<g transform="translate(-4 0)"><g class="fk"><path d="M0 -3.5Q-10 -4 -26 0Q-10 4 0 3.5Z" fill="url(#flm)"/>'
              '<path d="M0 -1.8Q-6 -2 -13 0Q-6 2 0 1.8Z" fill="#fff3d6"/></g></g>')
    booster = ('<rect x="-4" y="-4.5" width="21" height="9" rx="1" fill="#dfe4f4"/><rect x="2" y="-4.5" width="2.5" height="9" fill="#141827"/>'
               '<path d="M-4 -4.5L-9 -9L-2 -4.5ZM-4 4.5L-9 9L-2 4.5Z" fill="#cfd5e8"/>')
    upper = ('<g class="uf" style="opacity:0"><g transform="translate(17 0)"><g class="fk"><path d="M0 -2.5Q-7 -3 -18 0Q-7 3 0 2.5Z" fill="url(#flm)"/></g></g></g>'
             '<rect x="17" y="-3.8" width="15" height="7.6" rx="1" fill="#eef1fb"/><path d="M32 -3.8Q42 -2 46 0Q42 2 32 3.8Z" fill="#eef1fb"/>'
             '<rect x="25" y="-3.8" width="2" height="7.6" fill="#141827"/>')
    return bflame, booster, upper


def sc_fly(x0):
    T = 9
    p0, p1, p2, p3 = (x0 + 40, 136), (x0 + 120, 136), (x0 + 250, 110), (x0 + 430, 18)
    from common import bezier
    pts = [bezier(p0, (x0 + 40, 60), (x0 + 170, 22), p3, i / 60) for i in range(61)]
    L, at = arclen_sampler(pts)
    tend, sep = 70, 0.44                  # percent of loop where the upper stage leaves; path fraction at staging
    ease = lambda u: u ** 1.7
    n = 30
    rk, bs = [(0, f"transform:{tr(p0[0], p0[1], -90)};opacity:0"), (4, f"transform:{tr(p0[0], p0[1], -90)};opacity:1")], []
    bs = list(rk)
    u_sep = sep ** (1 / 1.7)
    for i in range(n + 1):
        u = i / n
        x, y, a = at(ease(u))
        a = -90 + (a + 90) * min(1, u * 3) if u < .34 else a
        pct = 8 + (tend - 8) * u
        rk.append((pct, f"transform:{tr(x, y, a)};opacity:1"))
        if u <= u_sep + 1e-9:
            bs.append((pct, f"transform:{tr(x, y, a)};opacity:1"))
            sx, sy, sa, sp = x, y, a, pct
    rk.append((tend + 6, f"transform:{tr(*at(1)[:2], at(1)[2])};opacity:0"))
    rk.append((100, f"transform:{tr(p0[0], p0[1], -90)};opacity:0"))
    bs += [(sp + 14, f"transform:{tr(sx - 26, sy + 46, sa + 150)};opacity:0"), (100, f"transform:{tr(p0[0], p0[1], -90)};opacity:0")]
    css = [kf("rk", rk), anim(".rk", "rk", T), kf("bs", bs), anim(".bs", "bs", T),
           kf("uf", [(0, "opacity:0"), (sp + 1.5, "opacity:0"), (sp + 3, "opacity:1"), (tend, "opacity:1"), (tend + 2, "opacity:0"), (100, "opacity:0")]),
           anim(".uf", "uf", T),
           kf("bf", [(0, "opacity:1"), (sp, "opacity:1"), (sp + .5, "opacity:0"), (100, "opacity:0")]), anim(".bf", "bf", T),
           kf("tr", [(0, "stroke-dashoffset:1;opacity:.9"), (8, "stroke-dashoffset:1"), (tend, "stroke-dashoffset:0;opacity:.9"),
                     (90, "stroke-dashoffset:0;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]),
           anim(".trl", "tr", T, "cubic-bezier(.45,0,.9,.7)"),
           kf("fk", [(0, "transform:scale(1,1)"), (50, "transform:scale(.8,1.25)"), (100, "transform:scale(1,1)")]) + anim(".fk", "fk", .18),
           kf("sp", [(0, "transform:scale(.2);opacity:0"), (sp, "transform:scale(.2);opacity:0"), (sp + 1, "transform:scale(.5);opacity:1"),
                     (sp + 9, "transform:scale(2.4);opacity:0"), (100, "transform:scale(2.4);opacity:0")]), anim(".spk", "sp", T, "ease-out")]
    labels = [(.02, "LIFTOFF", 8), (.2, "MAX Q", 8 + (tend - 8) * .2 ** (1 / 1.7)), (sep, "STAGING", sp), (.97, "ORBIT", tend - 2)]
    lab_svg = []
    for i, (s, t, pct) in enumerate(labels):
        x, y, _ = at(s)
        dx, dy = ((14, -14), (12, 20), (10, 22), (-10, 26))[i]
        anchor = "start" if i < 3 else "end"
        css.append(win(f"lb{i}", pct, min(pct + 26, 86), 3) + anim(f".lb{i}", f"lb{i}", T))
        lab_svg.append(f'<g class="lb{i}" style="opacity:1"><circle cx="{f(x)}" cy="{f(y)}" r="2.6" fill="{SOL}"/>'
                       f'<text x="{f(x + dx)}" y="{f(y + dy)}" class="mono" font-size="11.5" font-weight="600" letter-spacing="1" '
                       f'text-anchor="{anchor}" fill="{SOL}">{t}</text></g>')
    bflame, booster, upper = rocket_parts()
    xs, ys, _ = at(sep)
    body = (
        f'<path d="M{x0 - 60} 150Q{x0 + 200} 128 {x0 + 460} 142V160H{x0 - 60}Z" fill="#0c1a36"/>'
        f'<path d="M{x0 - 60} 150Q{x0 + 200} 128 {x0 + 460} 142" fill="none" stroke="{ICE}" stroke-opacity=".5" stroke-width="1.5"/>'
        f'<path d="M{x0 - 60} 147Q{x0 + 200} 125 {x0 + 460} 139" fill="none" stroke="{ICE}" stroke-opacity=".12" stroke-width="6"/>'
        f'<path class="trl" d="{pts_path(pts)}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="url(#trg)" stroke-width="2" stroke-linecap="round"/>'
        + "".join(lab_svg) +
        f'<g transform="translate({f(xs)} {f(ys)})"><circle class="spk rm-hide" r="8" fill="none" stroke="#fff3c4" stroke-width="1.5" style="opacity:0"/></g>'
        f'<g class="bs" style="opacity:0"><g class="bf">{bflame}</g>{booster}</g>'
        f'<g class="rk" style="transform:{tr(*at(.6)[:2], at(.6)[2])}">{upper}</g>'
    )
    defs = ('<linearGradient id="flm" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#ffc24b"/>'
            '<stop offset=".75" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></linearGradient>'
            f'<linearGradient id="trg" gradientUnits="userSpaceOnUse" x1="{x0 + 40}" y1="0" x2="{x0 + 430}" y2="0"><stop offset="0" stop-color="#fff" stop-opacity=".15"/>'
            f'<stop offset="1" stop-color="{SOL}" stop-opacity=".85"/></linearGradient>')
    return dict(defs=defs, css="".join(css), body=body, x0=x0)


def sc_explore(x0):
    T = 10
    ox, oy = x0 + 70, 132
    css = [kf("bm", [(0, "transform:rotate(-68deg)"), (50, "transform:rotate(-22deg)"), (100, "transform:rotate(-68deg)")]),
           anim(".bm", "bm", T, "ease-in-out"),
           kf("pn", [(0, "transform:translateX(0)"), (100, "transform:translateX(-520px)")]), anim(".pn", "pn", 26),
           kf("rp", [(0, "transform:rotate(-8deg)"), (100, "transform:rotate(352deg)")]), anim(".gx", "rp", 40)]
    rng = random.Random(21)
    # stars that the beam passes over glint (cheap: bright twinkle groups)
    sts = "".join(f'<circle cx="{f(rng.uniform(x0 + 80, x0 + 430))}" cy="{f(rng.uniform(8, 120))}" r="{f(rng.uniform(.6, 1.6), 2)}" fill="#eaf4ff" opacity="{f(rng.uniform(.4, 1), 2)}"/>' for _ in range(40))
    beam = (f'<g transform="translate({ox} {oy - 30})"><g class="bm" style="transform:rotate(-45deg)">'
            '<path d="M0 -4L360 -46L360 46L0 4Z" fill="url(#bmg)"/></g></g>')
    scope = (f'<g transform="translate({ox} {oy - 30})"><g class="bm" style="transform:rotate(-45deg)">'
             '<rect x="-34" y="-7" width="46" height="14" rx="2" fill="#dfe4f4"/><rect x="8" y="-8.5" width="6" height="17" rx="1.5" fill="#9aa3c0"/>'
             '<rect x="-24" y="-10" width="12" height="4" fill="#8f98bd"/></g></g>'
             f'<path d="M{ox} {oy - 30}L{ox - 16} {oy + 8}M{ox} {oy - 30}L{ox + 14} {oy + 8}M{ox} {oy - 30}V{oy + 8}" stroke="#8f98bd" stroke-width="2"/>'
             f'<circle cx="{ox}" cy="{oy - 30}" r="4" fill="#5d6589"/>')
    planet = (f'<g transform="translate({x0 + 470} 42)"><g class="pn" style="transform:translateX(-120px)">'
              '<circle r="15" fill="url(#pg)"/><path d="M-15 -2Q0 3 15 -2" stroke="#b98d5c" stroke-opacity=".5" fill="none"/>'
              '<ellipse rx="30" ry="7" fill="none" stroke="#f0d7a1" stroke-opacity=".75" stroke-width="2.4" transform="rotate(-16)"/>'
              '<path d="M-14.5 3A15 15 0 0 0 14.5 -3" fill="url(#pg)" transform="rotate(-16)"/></g></g>')
    galaxy = (f'<g transform="translate({x0 + 330} 98)"><g class="gx"><ellipse rx="26" ry="9" fill="url(#gxg)"/>'
              '<path d="M-22 2Q-6 -10 6 -2Q14 6 24 -3M22 -2Q6 10 -6 2Q-14 -6 -24 3" fill="none" stroke="#cdb8ff" stroke-opacity=".5"/></g></g>')
    defs = ('<linearGradient id="bmg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#bfe3ff" stop-opacity=".55"/>'
            '<stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></linearGradient>'
            '<radialGradient id="pg" cx=".35" cy=".35" r=".8"><stop offset="0" stop-color="#fbe6bf"/><stop offset=".6" stop-color="#d9a86a"/><stop offset="1" stop-color="#6b4a24"/></radialGradient>'
            '<radialGradient id="gxg"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset=".3" stop-color="#cdb8ff" stop-opacity=".5"/>'
            '<stop offset="1" stop-color="#b18cff" stop-opacity="0"/></radialGradient>')
    body = sts + galaxy + planet + beam + f'<path d="M{x0 - 20} {oy + 8}H{x0 + 460}" stroke="#96aaff" stroke-opacity=".2"/>' + scope
    return dict(defs=defs, css="".join(css), body=body, x0=x0)


def sub_f(t):
    """'m@f' -> m with a subscript f (Unicode has no subscript f)."""
    if "@" not in t:
        return esc(t)
    a, b = t.split("@", 1)
    return f'{esc(a)}<tspan dy="5" font-size="15">{b[0]}</tspan><tspan dy="-5">{esc(b[1:])}</tspan>'


def sc_ideas(x0):
    T = 10
    eqs = [("Δv = vₑ ln(m₀/m@f)", 0, 0, FLAME), ("T² ∝ a³", 250, 0, ICE), ("E = mc²", 0, 44, SOL),
           ("F = GMm/r²", 130, 44, NEBULA), ("θ = 1.22 λ/D", 270, 44, AURORA), ("v = √(GM/r)", 60, 88, PLASMA), ("z = Δλ/λ", 230, 88, ICE)]
    css, body = [], []
    gx, gy = x0 + 20, 40
    ccx, ccy = gx + 180, gy + 40          # layout centre
    for i, (t, dx, dy, c) in enumerate(eqs):
        # in and out are pure dilations about the layout centre (same factor for every equation at every
        # moment), so the equations can never overlap while they gather or scatter
        w = text_w(t.replace("@", ""), 21) * .9
        vx, vy = gx + dx + w / 2 - ccx, gy + dy - 7 - ccy        # text centre relative to the layout centre
        mv = lambda s, sc: tr((s - 1) * vx + w / 2 * (1 - sc), (s - 1) * vy - 7 * (1 - sc), 0, sc)   # dilate by s, shrink about the centre
        st = [(0, f"transform:{mv(2.3, .7)};opacity:0"), (5, f"transform:{mv(2.3, .7)};opacity:0"),
              (12, f"transform:{mv(1.5, .85)};opacity:.85"),
              (26, "transform:translate(0,0) rotate(0) scale(1);opacity:1"), (74, "transform:translate(0,0) rotate(0) scale(1);opacity:1"),
              (92, f"transform:{mv(1.9, .75)};opacity:0"), (100, f"transform:{mv(2.3, .7)};opacity:0")]
        css.append(kf(f"e{i}", st) + anim(f".e{i}", f"e{i}", T, "cubic-bezier(.3,.7,.3,1)"))
        body.append(f'<g transform="translate({gx + dx} {gy + dy})"><g class="e{i}">'
                    f'<text class="serif" font-size="21" font-style="italic" fill="{TEXT}">{sub_f(t)}</text>'
                    f'<rect x="0" y="7" width="{f(text_w(t.replace("@", ""), 21) * .88)}" height="2" rx="1" fill="{c}" opacity=".8"/></g></g>')
    # connecting glints once assembled
    css.append(win("ln", 44, 74, 6, 0, .5) + anim(".ln", "ln", T))
    body.insert(0, f'<g class="ln" style="opacity:.5" stroke="#b18cff" stroke-opacity=".5" stroke-dasharray="2 4" fill="none">'
                   f'<path d="M{gx + 190} {gy - 6}L{gx + 245} {gy - 6}M{gx + 60} {gy + 14}L{gx + 40} {gy + 26}M{gx + 170} {gy + 58}L{gx + 150} {gy + 70}'
                   f'M{gx + 310} {gy + 14}L{gx + 320} {gy + 26}M{gx + 240} {gy + 58}L{gx + 270} {gy + 70}"/></g>')
    return dict(css="".join(css), body="".join(body), x0=x0)


def sc_learn(x0):
    T = 10
    bx, by = x0 + 100, 132            # spine bottom
    pw, ph = 86, 62
    page = lambda s: f'M0 0Q{s * pw * .5} 6 {s * pw} 0V{-ph}Q{s * pw * .5} {-ph + 6} 0 {-ph}Z'
    lines = lambda s: "".join(f'M{s * 10} {-ph + 12 + k * 8}H{s * (pw - 12 - (k % 3) * 8)}' for k in range(6))
    css = [kf("fl", [(0, "transform:scaleX(1)"), (8, "transform:scaleX(1)"), (24, "transform:scaleX(-1)"), (50, "transform:scaleX(-1)"),
                     (50.01, "transform:scaleX(1)"), (58, "transform:scaleX(1)"), (74, "transform:scaleX(-1)"), (100, "transform:scaleX(-1)")]),
           anim(".fl", "fl", T, "ease-in-out"),
           kf("fs", [(0, "opacity:0"), (8, "opacity:0"), (16, "opacity:.5"), (24, "opacity:0"), (58, "opacity:0"), (66, "opacity:.5"), (74, "opacity:0"), (100, "opacity:0")]),
           anim(".fs", "fs", T, "ease-in-out")]
    book = (f'<g transform="translate({bx} {by})">'
            f'<path d="M{-pw - 6} 6H{pw + 6}" stroke="#96aaff" stroke-opacity=".3" stroke-width="3" stroke-linecap="round"/>'
            f'<path d="{page(-1)}" fill="#e9edff"/><path d="{page(1)}" fill="#dfe4f4"/>'
            f'<path d="{lines(-1)}{lines(1)}" stroke="#8f98bd" stroke-opacity=".7" stroke-width="1.6"/>'
            f'<g class="fl"><path d="{page(1)}" fill="#f4f6ff"/><path d="{lines(1)}" stroke="#b18cff" stroke-opacity=".6" stroke-width="1.6"/>'
            f'<path class="fs" d="{page(1)}" fill="#5d6589" style="opacity:0"/></g>'
            f'<path d="M0 0V{-ph}" stroke="#8f98bd" stroke-width="1.2"/></g>')
    # stars rise out of the book and settle into a star map (Orion's figure, simplified)
    tgt = [(x0 + 250, 24), (x0 + 330, 30), (x0 + 282, 62), (x0 + 296, 66), (x0 + 310, 70), (x0 + 262, 108), (x0 + 346, 104), (x0 + 380, 50), (x0 + 404, 86)]
    edges = [(0, 2), (1, 4), (2, 3), (3, 4), (2, 5), (4, 6), (1, 7), (7, 8)]
    rng = random.Random(3)
    body_st, lines_svg = [], []
    for i, (x, y) in enumerate(tgt):
        sx, sy = bx + rng.uniform(-60, 60), by - rng.uniform(20, 50)
        d = i * 2.2
        st = [(0, f"transform:translate({f(sx - x)}px,{f(sy - y)}px) scale(.3);opacity:0"),
              (20 + d, f"transform:translate({f(sx - x)}px,{f(sy - y)}px) scale(.3);opacity:0"),
              (24 + d, f"transform:translate({f(sx - x)}px,{f(sy - y)}px) scale(.6);opacity:1"),
              (46 + d, "transform:translate(0,0) scale(1);opacity:1"), (88, "transform:translate(0,0) scale(1);opacity:1"),
              (96, "transform:translate(0,0) scale(1);opacity:0"), (100, f"transform:translate({f(sx - x)}px,{f(sy - y)}px) scale(.3);opacity:0")]
        css.append(kf(f"s{i}", st) + anim(f".s{i}", f"s{i}", T, "cubic-bezier(.3,.6,.3,1)"))
        big = i in (0, 5, 1)
        body_st.append(f'<g transform="translate({x} {y})"><g class="s{i}"><circle r="{5 if big else 3.5}" fill="{NEBULA if i % 2 else ICE}" opacity=".3"/>'
                       f'<circle r="{2.2 if big else 1.6}" fill="#fff"/></g></g>')
    for k, (a, b) in enumerate(edges):
        (x1, y1), (x2, y2) = tgt[a], tgt[b]
        s = 66 + k * 1.5
        css.append(kf(f"g{k}", [(0, "stroke-dashoffset:1;opacity:.6"), (s, "stroke-dashoffset:1;opacity:.6"), (s + 6, "stroke-dashoffset:0;opacity:.6"),
                                (88, "stroke-dashoffset:0;opacity:.6"), (96, "stroke-dashoffset:0;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")])
                   + anim(f".g{k}", f"g{k}", T))
        lines_svg.append(f'<path class="g{k}" d="M{x1} {y1}L{x2} {y2}" pathLength="1" stroke-dasharray="1 1" stroke="{ICE}" stroke-width="1.2"/>')
    body = f'<g fill="none">{"".join(lines_svg)}</g>' + book + "".join(body_st)
    return dict(css="".join(css), body=body, x0=x0)


def sc_build(x0):
    T = 10
    px, py, pw, ph = x0 + 10, 22, 250, 110
    rng = random.Random(8)
    pads = [(px + 40, py + 30), (px + 40, py + 80), (px + 210, py + 26), (px + 210, py + 84), (px + 125, py + 96)]
    chip = (px + 105, py + 34, 42, 42)
    traces = []
    for (x, y) in pads:
        cxm, cym = chip[0] + chip[2] / 2, chip[1] + chip[3] / 2
        mx = x + (cxm - x) * .5
        traces.append(f'M{x} {y}H{f(mx)}L{f(mx + (8 if y < cym else -8))} {f(cym + (y - cym) * .25)}H{f(cxm + (chip[2] / 2 if x > cxm else -chip[2] / 2) * .96)}')
    css = [kf("tc", [(0, "stroke-dashoffset:1"), (30, "stroke-dashoffset:0"), (86, "stroke-dashoffset:0"), (96, "stroke-dashoffset:1"), (100, "stroke-dashoffset:1")]),
           anim(".tc", "tc", T, "ease-in-out")]
    iron = [(0, pads[0])] + [(10 + k * 16, p) for k, p in enumerate(pads)] + [(100, pads[0])]
    ist = []
    for pct, (x, y) in iron:
        ist.append((pct, f"transform:translate({x}px,{y}px)"))
        if 0 < pct < 100:
            ist.append((pct + 7, f"transform:translate({x}px,{y}px)"))
    ist.sort(key=lambda s: s[0])
    css += [kf("ir", ist), anim(".ir", "ir", T, "ease-in-out"),
            kf("sk", [(0, "transform:scale(.2) rotate(0);opacity:0"), (4, "transform:scale(1.2) rotate(45deg);opacity:1"),
                      (10, "transform:scale(.4) rotate(90deg);opacity:0"), (100, "transform:scale(.4) rotate(90deg);opacity:0")])]
    sparks = []
    for k, (x, y) in enumerate(pads):
        css.append(anim(f".k{k}", "sk", T, "ease-out", delay=(10 + k * 16 + 2) / 100 * T))
        sparks.append(f'<g transform="translate({x} {y})"><g class="k{k} rm-hide" style="opacity:0"><path d="M-9 0H9M0 -9V9M-5 -5L5 5M-5 5L5 -5" stroke="#fff3c4" stroke-width="1.6" stroke-linecap="round"/>'
                      f'<circle r="3" fill="{SOL}"/></g></g>')
    board = (f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="8" fill="#0a241f" stroke="{AURORA}" stroke-opacity=".45"/>'
             + "".join(f'<circle cx="{px + 12 + 13 * k}" cy="{py + 10}" r="2" fill="none" stroke="{SOL}" stroke-opacity=".6"/>' for k in range(18))
             + f'<path d="{"".join(traces)}" stroke="{AURORA}" stroke-opacity=".18" stroke-width="2.4" fill="none"/>'
             + "".join(f'<path class="tc" d="{t}" pathLength="1" stroke-dasharray="1 1" stroke="{AURORA}" stroke-width="2.4" fill="none" stroke-linecap="round"/>' for t in traces)
             + "".join(f'<circle cx="{x}" cy="{y}" r="5" fill="#caa55a"/><circle cx="{x}" cy="{y}" r="1.8" fill="#0a241f"/>' for x, y in pads)
             + f'<rect x="{chip[0]}" y="{chip[1]}" width="{chip[2]}" height="{chip[3]}" rx="3" fill="#161a26" stroke="#5d6589"/>'
             + "".join(f'<rect x="{chip[0] - 4}" y="{chip[1] + 5 + 6 * k}" width="4" height="2.4" fill="#9aa3c0"/>'
                       f'<rect x="{chip[0] + chip[2]}" y="{chip[1] + 5 + 6 * k}" width="4" height="2.4" fill="#9aa3c0"/>' for k in range(6))
             + f'<text x="{chip[0] + chip[2] / 2}" y="{chip[1] + 25}" class="mono" font-size="8.5" fill="{MUTED}" text-anchor="middle">RP2040</text>')
    iron_svg = (f'<g class="ir" style="transform:translate({pads[2][0]}px,{pads[2][1]}px)"><path d="M0 0L16 -24" stroke="#cfd5e8" stroke-width="2.2" stroke-linecap="round"/>'
                '<path d="M16 -24L40 -60" stroke="#3a4260" stroke-width="7" stroke-linecap="round"/><circle r="2" fill="#ff9a5c"/></g>')
    # rocket assembling
    rx, base = x0 + 345, 138
    parts = [  # (svg drawn with bottom at 0, height)
        ('<path d="M-12 0L-9 -8H9L12 0Z" fill="#5d6589"/>', 8),
        ('<rect x="-10" y="-44" width="20" height="44" fill="#eef1fb"/><rect x="-10" y="-30" width="20" height="4" fill="#141827"/>'
         '<path d="M-10 -12L-20 2L-10 0ZM10 -12L20 2L10 0Z" fill="' + FLAME + '"/>', 44),
        ('<rect x="-8" y="-26" width="16" height="26" fill="#dfe4f4"/><rect x="-8" y="-26" width="16" height="3" fill="#141827"/>', 26),
        ('<path d="M-8 0Q-8 -16 0 -28Q8 -16 8 0Z" fill="#f4f6ff"/><path d="M-8 0H8" stroke="' + ICE + '" stroke-width="2"/>', 28),
    ]
    y = base
    rk = []
    for k, (svg, hgt) in enumerate(parts):
        a = 6 + k * 14
        side = -1 if k % 2 else 1
        st = [(0, f"transform:translate({side * 70}px,-70px);opacity:0"), (a, f"transform:translate({side * 70}px,-70px);opacity:0"),
              (a + 3, f"transform:translate({side * 40}px,-40px);opacity:1"), (a + 11, "transform:translate(0,0);opacity:1"),
              (88, "transform:translate(0,0);opacity:1"), (96, "transform:translate(0,0);opacity:0"), (100, f"transform:translate({side * 70}px,-70px);opacity:0")]
        css.append(kf(f"r{k}", st) + anim(f".r{k}", f"r{k}", T, "cubic-bezier(.3,.8,.35,1.15)"))
        rk.append(f'<g transform="translate({rx} {y})"><g class="r{k}">{svg}</g></g>')
        y -= hgt
    css.append(win("ok", 64, 88, 3) + anim(".ok", "ok", T))
    ok = (f'<g class="ok" style="opacity:1"><text x="{rx + 30}" y="{base - 60}" class="mono" font-size="12" fill="{AURORA}">✓ stack</text>'
          f'<text x="{rx + 30}" y="{base - 44}" class="mono" font-size="12" fill="{AURORA}">✓ solder</text></g>')
    body = board + "".join(sparks) + iron_svg + f'<path d="M{rx - 40} {base + 1}H{rx + 40}" stroke="#96aaff" stroke-opacity=".3" stroke-width="2"/>' + "".join(rk) + ok
    return dict(css="".join(css), body=body, x0=x0)


def sc_compute(x0):
    T = 11
    tx, ty, tw, th = x0, 20, 238, 112
    cmd = "python run.py nbody figure8"
    cw = 7.2
    n = len(cmd)
    cx0 = tx + 24
    css = [kf("ty", [(0, "transform:translateX(0)"), (6, "transform:translateX(0)"), (32, f"transform:translateX({f(n * cw)}px)"), (100, f"transform:translateX({f(n * cw)}px)")]),
           f".ty{{animation:ty {T}s steps({n}) infinite}}",
           kf("cb", [(0, "opacity:1"), (50, "opacity:0"), (100, "opacity:1")]) + anim(".cb", "cb", .9, "steps(1)"),
           win("o1", 36, 94, 2) + anim(".o1", "o1", T), win("o2", 42, 94, 2) + anim(".o2", "o2", T), win("o3", 50, 94, 2) + anim(".o3", "o3", T)]
    fcss, fbody = fig8_scene(x0 + 336, 78, 72, 72, 6.0)
    css.append(fcss)
    body = (
        f'<rect x="{tx}" y="{ty}" width="{tw}" height="{th}" rx="9" fill="#060913" stroke="#96aaff" stroke-opacity=".28"/>'
        f'<path d="M{tx} {ty + 20}H{tx + tw}" stroke="#96aaff" stroke-opacity=".18"/>'
        + "".join(f'<circle cx="{tx + 13 + 11 * k}" cy="{ty + 10}" r="3.2" fill="{c}" opacity=".8"/>' for k, c in enumerate((PLASMA, SOL, AURORA)))
        + f'<text class="mono" x="{tx + 12}" y="{ty + 40}" font-size="12" fill="{AURORA}">$</text>'
        f'<text class="mono" x="{cx0}" y="{ty + 40}" font-size="12" fill="{TEXT}" textLength="{f(n * cw)}" lengthAdjust="spacingAndGlyphs">{cmd}</text>'
        f'<clipPath id="ln"><rect x="{cx0 - 1}" y="{ty + 26}" width="{f(n * cw + 10)}" height="20"/></clipPath>'
        f'<g clip-path="url(#ln)"><g class="ty" style="transform:translateX({f(n * cw)}px)"><rect x="{cx0}" y="{ty + 28}" width="{f(n * cw + 4)}" height="16" fill="#060913"/>'
        f'<rect class="cb" x="{cx0}" y="{ty + 29}" width="7" height="14" fill="{ICE}" opacity=".85"/></g></g>'
        f'<g class="o1"><text class="mono" x="{tx + 12}" y="{ty + 62}" font-size="12.5" fill="{MUTED}">3 equal masses · G = m = 1</text></g>'
        f'<g class="o2"><text class="mono" x="{tx + 12}" y="{ty + 81}" font-size="12.5" fill="{MUTED}">symplectic integrator</text></g>'
        f'<g class="o3"><text class="mono" x="{tx + 12}" y="{ty + 100}" font-size="12.5" fill="{SOL}">period T = 6.326</text></g>'
        f'<rect x="{x0 + 252}" y="{ty}" width="170" height="{th}" rx="9" fill="#060913" fill-opacity=".6" stroke="#96aaff" stroke-opacity=".2"/>'
        f'<text class="mono" x="{x0 + 262}" y="{ty + 16}" font-size="11.5" fill="{FAINT}">figure-eight orbit</text>'
        + fbody
    )
    return dict(css="".join(css), body=body, x0=x0)


def sc_observe(x0):
    pole = (x0 + 250, 14)
    rng = random.Random(44)
    st = []
    for _ in range(90):
        r = rng.uniform(12, 330)
        a = rng.uniform(0, 2 * math.pi)
        st.append(f'<circle cx="{f(r * math.cos(a))}" cy="{f(r * math.sin(a))}" r="{f(rng.uniform(.5, 1.6), 2)}" opacity="{f(rng.uniform(.35, 1), 2)}"/>')
    trails = "".join(f'<circle r="{r}" stroke-dasharray="{f(r * .5)} {f(r * .9)}"/>' for r in (40, 75, 110, 150))
    gy = 136
    css = [kf("sky", [(0, "transform:rotate(0)"), (100, "transform:rotate(-360deg)")]), anim(".sky", "sky", 80),
           kf("ds", [(0, "transform:rotate(-40deg)"), (50, "transform:rotate(-8deg)"), (100, "transform:rotate(-40deg)")]),
           anim(".ds", "ds", 9, "ease-in-out"), anim(".ds2", "ds", 9, "ease-in-out", -3.5),
           kf("sl", [(0, "opacity:.35"), (50, "opacity:1"), (100, "opacity:.35")]), anim(".sl", "sl", 3.2, "ease-in-out")]
    dome_x, dr = x0 + 140, 30

    def dish(x, s, cls):
        return (f'<path d="M{x - 7 * s} {gy}L{x} {gy - 24 * s}L{x + 7 * s} {gy}" fill="none" stroke="#8f98bd" stroke-width="2"/>'
                f'<g transform="translate({x} {gy - 24 * s}) scale({s})"><g class="{cls}" style="transform:rotate(-20deg)">'
                '<path d="M-24 -4Q0 18 24 -4" fill="#1b2236" stroke="#cfd5e8" stroke-width="2"/>'
                f'<path d="M-15 1L0 -20L15 1" fill="none" stroke="#8f98bd"/><circle cy="-20" r="2.3" fill="{AURORA}"/></g></g>')
    body = (
        f'<g transform="translate({pole[0]} {pole[1]})"><g class="sky"><g fill="#eaf4ff">{"".join(st)}</g>'
        f'<g fill="none" stroke="{ICE}" stroke-opacity=".22" stroke-width="1.4">{trails}</g></g>'
        f'<path d="M0 -6L1.2 -1.2L6 0L1.2 1.2L0 6L-1.2 1.2L-6 0L-1.2 -1.2Z" fill="#fff6d8"/></g>'
        f'<path d="M{x0 - 40} {gy}Q{x0 + 120} {gy - 10} {x0 + 250} {gy - 3}T{x0 + 460} {gy - 4}V160H{x0 - 40}Z" fill="#070912"/>'
        f'<path d="M{x0 - 40} {gy}Q{x0 + 120} {gy - 10} {x0 + 250} {gy - 3}T{x0 + 460} {gy - 4}" fill="none" stroke="{AURORA}" stroke-opacity=".35"/>'
        f'<rect x="{dome_x - dr}" y="{gy - 24}" width="{2 * dr}" height="22" fill="#10152a" stroke="#96aaff" stroke-opacity=".3"/>'
        f'<path d="M{dome_x - dr} {gy - 24}A{dr} {dr} 0 0 1 {dome_x + dr} {gy - 24}Z" fill="#1a2140" stroke="#cfd5e8" stroke-opacity=".7" stroke-width="1.4"/>'
        f'<path class="sl" d="M{dome_x - 6} {gy - 24 - dr + 1}H{dome_x + 6}V{gy - 24}H{dome_x - 6}Z" fill="{SOL}" opacity=".6"/>'
        + dish(x0 + 280, 1.25, "ds") + dish(x0 + 350, .8, "ds2") + dish(x0 + 400, .8, "ds")
    )
    return dict(css="".join(css), body=body, x0=x0)


BOLD = ' font-weight="700"'


def sc_credits(x0):
    T = 12
    nodes = [("three.js", 30, 40), ("KaTeX", 110, 22), ("NASA", 150, 78), ("ESA/Webb", 232, 36), ("NOAA", 256, 104),
             ("CelesTrak", 330, 64), ("d3-celestial", 60, 110), ("you ✦", 404, 26)]
    offs = [(0, -12, "middle"), (11, 5, "start"), (9, 19, "start"), (0, -12, "middle"), (0, 22, "middle"),
            (9, 21, "start"), (0, 23, "middle"), (0, 32, "middle")]
    edges = [(0, 1), (1, 2), (0, 6), (6, 2), (2, 3), (2, 4), (3, 5), (4, 5), (5, 7)]
    css, dots, labs, ln = [], [], [], []
    for i, (lab, x, y) in enumerate(nodes):
        a = 4 + i * 7
        me = lab.startswith("you")
        css.append(kf(f"n{i}", [(0, "transform:scale(0)"), (a, "transform:scale(0)"), (a + 3, "transform:scale(1.5)"), (a + 6, "transform:scale(1)"),
                                (90, "transform:scale(1)"), (97, "transform:scale(0)"), (100, "transform:scale(0)")]) + anim(f".n{i}", f"n{i}", T, "ease-out"))
        css.append(win(f"l{i}", a + 3, 90, 4) + anim(f".l{i}", f"l{i}", T))
        c = PLASMA if me else ICE
        dots.append(f'<g transform="translate({x0 + x} {y})"><g class="n{i}"><circle r="{9 if me else 6}" fill="{c}" opacity=".25"/>'
                    f'<circle r="{3 if me else 2.3}" fill="#fff"/></g></g>')
        ox, oy, anc = offs[i]
        labs.append(f'<g class="l{i}" style="opacity:1"><text x="{x0 + x + ox}" y="{y + oy}" class="mono" font-size="12.5" text-anchor="{anc}" '
                    f'fill="{PLASMA if me else TEXT2}"{BOLD if me else ""}>{esc(lab)}</text></g>')
    for k, (a, b) in enumerate(edges):
        s = 4 + max(a, b) * 7 + 3
        css.append(kf(f"e{k}", [(0, "stroke-dashoffset:1;opacity:1"), (s, "stroke-dashoffset:1"), (s + 6, "stroke-dashoffset:0"), (90, "stroke-dashoffset:0;opacity:1"),
                                (97, "stroke-dashoffset:0;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]) + anim(f".e{k}", f"e{k}", T))
        (_, x1, y1), (_, x2, y2) = nodes[a], nodes[b]
        dash = ' stroke-dasharray="1 1"'
        col = PLASMA if b == 7 else ICE
        ln.append(f'<path class="e{k}" d="M{x0 + x1} {y1}L{x0 + x2} {y2}" pathLength="1"{dash} stroke="{col}" stroke-opacity=".6" stroke-width="1.3"/>')
    css.append(kf("yp", [(0, "opacity:.25"), (50, "opacity:.9"), (100, "opacity:.25")]) + anim(".yp", "yp", 1.8, "ease-in-out"))
    x, y = x0 + nodes[7][1], nodes[7][2]
    body = (f'<g fill="none">{"".join(ln)}</g>' + "".join(dots)
            + f'<circle class="yp" cx="{x}" cy="{y}" r="14" fill="none" stroke="{PLASMA}" stroke-width="1.2"/>' + "".join(labs))
    return dict(css="".join(css), body=body, x0=x0)


# ------------------------------------------------------------------------------ build
def specs():
    c = counts()
    g = c["groups"]
    return [
        ("start-here", "WHERE TO BEGIN", "Start here", "Pick a mood. Every link opens a live, interactive page.", ICE, AURORA, sc_start,
         "A compass needle swings and settles, pointing across a star chart to Polaris, and a dashed route draws from the compass to the star."),
        ("fly", f"{g.get('Fly', 7)} FLIGHT SIMULATORS", "Fly it", "Launch, land and design rockets, checked against real missions", SOL, FLAME, sc_fly,
         "A rocket lifts off above the curve of the Earth and arcs toward orbit; its first stage separates and tumbles away while the upper stage lights "
         "and flies on. Labels mark liftoff, max q, staging and orbit."),
        ("explore", f"{g.get('Explore', 10)} PAGES · LIVE DATA", "Explore it", "Satellites overhead, the Sun, black holes, the universe", ICE, NEBULA, sc_explore,
         "A telescope's beam sweeps back and forth across a starfield while a ringed planet drifts past and a small spiral galaxy turns."),
        ("ideas", "ANIMATED EXPLANATIONS", "Ideas in motion", "Every animation is drawn from real numbers", NEBULA, PLASMA, sc_ideas,
         "Equations drift in from all directions and assemble into a neat grid: the rocket equation, Kepler's third law T² ∝ a³, E = mc², "
         "Newton's gravity, the diffraction limit θ = 1.22 λ/D, circular orbital speed and redshift, then scatter again."),
        ("learn", f"{c['equations']} EQUATIONS · {c['documents']} DOCUMENTS", "Learn it",
         f"{c['milestones']} milestones, {c['photographs']} photographs and a reading path", NEBULA, ICE, sc_learn,
         "An open book turns its pages; stars rise out of it and settle into a star map, and constellation lines join them."),
        ("build", f"{c['builds']} HANDS-ON BUILDS", "Build it", "From a paper rocket to a flight-computer circuit board", AURORA, ICE, sc_build,
         "Copper traces draw themselves across a circuit board while a soldering iron hops from pad to pad with a spark at each joint; "
         "beside it a rocket assembles from engine, first stage, upper stage and nose cone."),
        ("compute", f"{c['simulations']} PYTHON SIMULATIONS", "Compute it", "Ray tracing, N-body orbits and launch windows in NumPy", SOL, AURORA, sc_compute,
         "A terminal types python run.py nbody figure8; beside it three equal masses chase each other around the figure-eight three-body orbit "
         "(Chenciner and Montgomery, 2000), integrated at build time."),
        ("observe", "REAL TELESCOPES · LIVE DATA", "Observe the real sky", "Today's Sun, every wavelength, real telescopes", AURORA, NEBULA, sc_observe,
         "The night sky wheels slowly around Polaris, with faint star trails, above an optical observatory dome whose slit glows and three radio dishes that nod."),
        ("credits", "CONTRIBUTING · CREDITS · LICENCE", "Credits", "Built on open data, open source and people like you", PLASMA, SOL, sc_credits,
         "Stars light up one by one and join into a constellation, each named after something this project builds on: three.js, KaTeX, NASA, "
         "ESA/Webb, NOAA, CelesTrak and d3-celestial; the last, brightest star is labelled you."),
    ]


def build_all(only=()):
    for key, eyebrow, title, sub, c1, c2, fn, alt in specs():
        x0 = x0_for(title)
        sc = fn(x0)
        yield key, frame(key, eyebrow, title, sub, c1, c2, sc, f"Section banner: {title}. {eyebrow.title()}. {sub}. Animation: {alt}")
