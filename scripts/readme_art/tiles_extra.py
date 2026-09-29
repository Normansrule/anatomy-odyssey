"""Scenes for the three newer page tiles: Solar observatory, Sky surveys, Use a telescope.

Same contract as the scenes in tiles.py: each returns dict(defs, css, body[, stars]) that
tiles.frame() places inside the shared 400 x 250 card.
"""
import math
import random

import orion
from common import AURORA, FAINT, ICE, MUTED, NEBULA, PLASMA, SOL, TEXT, TEXT2, anim, f, kf

# --------------------------------------------------------------------- Solar observatory
# Solar Dynamics Observatory (SDO) channels and the plasma temperature each one images:
# Lemen et al. 2012, Solar Physics 275, 17 (AIA), Table 1; HMI continuum near 6173 A.
CHANNELS = [
    # label, temperature, disc centre, disc edge, loop colour, swatch
    ("AIA 171 Å", "600,000 K", "#f4cf62", "#5c3d08", "#ffe9a0", "#f0c24a"),
    ("AIA 193 Å", "1.6 million K", "#d49a55", "#4a2a0c", "#f6d3a2", "#c98a3a"),
    ("AIA 304 Å", "50,000 K", "#ff6a3a", "#5a0c02", "#ffb08a", "#ff5a2a"),
    ("AIA 131 Å", "10 million K", "#48c4c8", "#062e33", "#b6fbff", "#2fb3b8"),
    ("HMI 6173 Å", "5,800 K", "#e9e6df", "#6d6a64", None, "#bdbab3"),
]


def s_solar_obs():
    T = 12.5
    n = len(CHANNELS)
    cx, cy, r = 294, 104, 60
    seg = 100 / n
    css, discs, rows = [], [], []
    # active regions: same places in every channel (loops in the ultraviolet, spots in HMI)
    ars = [(-22, -16, 1.0), (18, 12, .8), (-6, 26, .6), (34, -24, .5)]
    loops = []
    for (dx, dy, k) in ars:
        w = 14 * k
        loops.append(f'M{f(cx + dx - w)} {f(cy + dy)}Q{f(cx + dx)} {f(cy + dy - 16 * k)} {f(cx + dx + w)} {f(cy + dy)}'
                     f'M{f(cx + dx - w * .6)} {f(cy + dy + 2)}Q{f(cx + dx)} {f(cy + dy - 10 * k)} {f(cx + dx + w * .6)} {f(cy + dy + 2)}')
    loop_d = "".join(loops)
    for i, (lab, temp, c0, c1, lc, sw) in enumerate(CHANNELS):
        a, b = i * seg, (i + 1) * seg
        fade = 2.2
        if i == 0:
            st = [(0, "opacity:1"), (b - fade, "opacity:1"), (b, "opacity:0"), (100 - fade, "opacity:0"), (100, "opacity:1")]
        else:
            st = [(0, "opacity:0"), (a - fade, "opacity:0"), (a, "opacity:1"), (b - fade, "opacity:1"), (b, "opacity:0"), (100, "opacity:0")]
            if b >= 100:
                st = [(0, "opacity:0"), (a - fade, "opacity:0"), (a, "opacity:1"), (100 - fade, "opacity:1"), (100, "opacity:0")]
        css.append(kf(f"ch{i}", st) + anim(f".ch{i}", f"ch{i}", T))
        grad = (f'<radialGradient id="sd{i}" cx=".46" cy=".44" r=".62"><stop offset="0" stop-color="{c0}"/>'
                f'<stop offset=".78" stop-color="{c0}" stop-opacity=".9"/><stop offset="1" stop-color="{c1}"/></radialGradient>')
        if lc:   # extreme-ultraviolet channel: limb brightening, off-limb corona, bright loops
            inner = (f'<circle cx="{cx}" cy="{cy}" r="{r * 1.55}" fill="url(#cr{i})"/>'
                     f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#sd{i})"/>'
                     f'<g clip-path="url(#sdc)"><rect x="{cx - r}" y="{cy - r}" width="{2 * r}" height="{2 * r}" filter="url(#tex)" opacity=".5"/></g>'
                     f'<path d="{loop_d}" fill="none" stroke="{lc}" stroke-width="2.2" stroke-linecap="round" opacity=".9"/>'
                     f'<circle cx="{cx}" cy="{cy}" r="{r - 1}" fill="none" stroke="{lc}" stroke-opacity=".45" stroke-width="2"/>')
            grad += (f'<radialGradient id="cr{i}"><stop offset=".6" stop-color="{c0}" stop-opacity=".55"/>'
                     f'<stop offset=".8" stop-color="{c0}" stop-opacity=".12"/><stop offset="1" stop-color="{c0}" stop-opacity="0"/></radialGradient>')
            if i == 2:   # 304: prominence on the limb
                inner += (f'<path d="M{cx - r + 4} {cy - 26}C{cx - r - 26} {cy - 44} {cx - r - 22} {cy - 4} {cx - r + 1} {cy - 8}" '
                          f'fill="none" stroke="{lc}" stroke-width="3.5" stroke-linecap="round" opacity=".85"/>')
        else:    # visible continuum: limb darkening and sunspots where the loops were
            spots = "".join(f'<g transform="translate({f(cx + dx)} {f(cy + dy + 1)})"><ellipse rx="{f(5 * k)}" ry="{f(3.8 * k)}" fill="#6d6a64"/>'
                            f'<ellipse rx="{f(2.4 * k)}" ry="{f(1.9 * k)}" fill="#1f1d1a"/></g>' for dx, dy, k in ars)
            inner = f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#sd{i})"/>' + spots
        discs.append((grad, f'<g class="ch{i}" style="opacity:{1 if i == 0 else 0}">{inner}</g>'))
        # channel list, left column
        y = 70 + i * 19
        rows.append(f'<circle cx="31" cy="{y - 4}" r="4.2" fill="{sw}"/>'
                    f'<text class="mono" x="42" y="{y}" font-size="11.5" fill="{TEXT2}">{lab}</text>'
                    f'<text class="sans" x="186" y="{y}" font-size="11.5" fill="{MUTED}" text-anchor="end">{temp}</text>')
    # highlight bar steps through the list
    hl = [(0, "transform:translateY(0)")]
    for i in range(1, n):
        hl += [(i * seg - 2.2, f"transform:translateY({(i - 1) * 19}px)"), (i * seg, f"transform:translateY({i * 19}px)")]
    hl += [(100 - 2.2, f"transform:translateY({(n - 1) * 19}px)"), (100, "transform:translateY(0)")]
    css.append(kf("hl", hl) + anim(".hl", "hl", T, "ease-in-out"))
    css.append(kf("rot", [(0, "transform:rotate(0)"), (100, "transform:rotate(360deg)")]))
    defs = ("".join(g for g, _ in discs)
            + f'<clipPath id="sdc"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>'
            '<filter id="tex" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency=".09" numOctaves="3" seed="8"/>'
            '<feColorMatrix values="0 0 0 0 1 0 0 0 0 1 0 0 0 0 1 0 0 0 1.6 -.72"/></filter>')
    body = (f'<g class="hl"><rect x="20" y="55" width="174" height="20" rx="10" fill="#fff" fill-opacity=".07" stroke="#fff" stroke-opacity=".2"/></g>'
            + "".join(rows)
            + "".join(d for _, d in discs))
    return dict(defs=defs, css="".join(css), body=body, stars=30)


# --------------------------------------------------------------------------- Sky surveys
BANDS = [
    # key, name, colour, two short lines, marker position on the bar (0..1, radio -> gamma)
    ("radio", "Radio", "#ff9a52", ("Ionised gas and cold", "molecular clouds"), 0.04),
    ("infrared", "Infrared", "#ff6aa8", ("Warm dust around", "newborn stars"), 0.32),
    ("visible", "Visible", "#e9edff", ("Stars and the glowing", "Orion Nebula"), 0.5),
    ("ultraviolet", "Ultraviolet", "#a9c4ff", ("Only the hottest,", "bluest stars"), 0.62),
    ("xray", "X-ray", "#7af5ff", ("Million-degree gas and", "flaring young stars"), 0.8),
    ("gamma", "Gamma ray", "#e46bff", ("Cosmic rays striking", "the gas clouds"), 0.96),
]


def s_surveys():
    T = 13.2
    n = len(BANDS)
    seg = 100 / n
    fade = 2.4
    px, py, pw, ph = 214, 46, 170, 134           # sky viewport
    sky = orion.Sky(px + pw / 2 + 2, py + 64, 5.9)
    css, layers, labels = [], [], []
    for i, (key, name, col, lines, pos) in enumerate(BANDS):
        a, b = i * seg, (i + 1) * seg
        if i == 0:
            st = [(0, "opacity:1"), (b - fade, "opacity:1"), (b, "opacity:0"), (100 - fade, "opacity:0"), (100, "opacity:1")]
        elif b >= 100:
            st = [(0, "opacity:0"), (a - fade, "opacity:0"), (a, "opacity:1"), (100 - fade, "opacity:1"), (100, "opacity:0")]
        else:
            st = [(0, "opacity:0"), (a - fade, "opacity:0"), (a, "opacity:1"), (b - fade, "opacity:1"), (b, "opacity:0"), (100, "opacity:0")]
        css.append(kf(f"b{i}", st) + anim(f".b{i}", f"b{i}", T))
        vis = 1 if key == "visible" else 0
        layers.append(f'<g class="b{i}" style="opacity:{vis}">{orion.band(key, sky, "o")}</g>')
        labels.append(f'<g class="b{i}" style="opacity:{vis}">'
                      f'<text class="sans" x="24" y="86" font-size="19" font-weight="700" fill="{col}">{name}</text>'
                      f'<text class="sans" x="24" y="106" font-size="12.5" fill="{TEXT2}">{lines[0]}</text>'
                      f'<text class="sans" x="24" y="122" font-size="12.5" fill="{TEXT2}">{lines[1]}</text></g>')
    # marker on the spectrum bar
    bx, bw = 24, 180
    mk = []
    for i, (*_, pos) in enumerate(BANDS):
        a, b = i * seg, (i + 1) * seg
        x = bx + bw * pos
        mk += [(a, f"transform:translateX({f(x)}px)"), (b - fade, f"transform:translateX({f(x)}px)")]
    mk.append((100, f"transform:translateX({f(bx + bw * BANDS[0][4])}px)"))
    css.append(kf("mk", mk) + anim(".mk", "mk", T, "ease-in-out"))
    spec = ('<linearGradient id="spec" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8a2a12"/><stop offset=".25" stop-color="#ff5a3d"/>'
            '<stop offset=".44" stop-color="#ff3b3b"/><stop offset=".47" stop-color="#ffd23f"/><stop offset=".5" stop-color="#4ef07a"/>'
            '<stop offset=".53" stop-color="#3f7dff"/><stop offset=".56" stop-color="#8a4dff"/><stop offset=".75" stop-color="#6a5cff"/>'
            '<stop offset="1" stop-color="#e46bff"/></linearGradient>')
    vis_x = bx + bw * 0.5
    grid = []
    for k in range(1, 4):
        grid.append(f'M{px + k * pw / 4} {py}V{py + ph}M{px} {py + k * ph / 4}H{px + pw}')
    body = (
        f'<text class="mono" x="24" y="62" font-size="10" letter-spacing="1.2" fill="{FAINT}">ORION · FALSE COLOUR</text>'
        + "".join(labels) +
        f'<rect x="{bx}" y="138" width="{bw}" height="7" rx="3.5" fill="url(#spec)" opacity=".9"/>'
        f'<path d="M{f(vis_x)} 136V147" stroke="#fff" stroke-opacity=".5"/>'
        f'<g class="mk" style="transform:translateX({f(vis_x)}px)"><path d="M0 134L-5 127H5Z" fill="#fff"/><circle cy="141.5" r="5.5" fill="none" stroke="#fff" stroke-width="1.5"/></g>'
        f'<text class="mono" x="{bx}" y="160" font-size="10" fill="{FAINT}">long λ</text>'
        f'<text class="mono" x="{bx + bw}" y="160" font-size="10" fill="{FAINT}" text-anchor="end">short λ</text>'
        f'<clipPath id="vp"><rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="10"/></clipPath>'
        f'<g clip-path="url(#vp)"><rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="#03040a"/>'
        f'<path d="{"".join(grid)}" stroke="#96aaff" stroke-opacity=".08"/>'
        + "".join(layers) + orion.figure_lines(sky, op=.16) + '</g>'
        f'<rect x="{px + .5}" y="{py + .5}" width="{pw - 1}" height="{ph - 1}" rx="10" fill="none" stroke="#96aaff" stroke-opacity=".35"/>'
        f'<path d="M{px + pw / 2} {py + 6}V{py + 14}M{px + pw / 2} {py + ph - 14}V{py + ph - 6}M{px + 6} {py + ph / 2}H{px + 14}'
        f'M{px + pw - 14} {py + ph / 2}H{px + pw - 6}" stroke="{ICE}" stroke-opacity=".6"/>'
    )
    return dict(defs=orion.defs("o") + spec, css="".join(css), body=body, stars=18)


# ------------------------------------------------------------------------- Use a telescope
def s_telescopes():
    T = 11
    gx = 150                     # ground line
    dx, dr = 236, 44             # dome centre x, radius
    dy = gx - 30                 # dome springline
    tx, ty = 236, 128            # telescope pivot (inside the dome)
    target = (296, 58)           # the star it slews to
    park, aim = -4, math.degrees(math.atan2(target[0] - tx, ty - target[1]))
    css = [
        # shutter slides up and over the top (clipped to the dome) then closes again
        kf("sh", [(0, "transform:translateY(0)"), (6, "transform:translateY(0)"), (18, "transform:translateY(-70px)"),
                  (84, "transform:translateY(-70px)"), (96, "transform:translateY(0)"), (100, "transform:translateY(0)")]),
        anim(".sh", "sh", T, "ease-in-out"),
        kf("sl", [(0, f"transform:rotate({park}deg)"), (18, f"transform:rotate({park}deg)"), (42, f"transform:rotate({f(aim)}deg)"),
                  (76, f"transform:rotate({f(aim + 2.5)}deg)"), (90, f"transform:rotate({park}deg)"), (100, f"transform:rotate({park}deg)")]),
        anim(".sl", "sl", T, "ease-in-out"),
        kf("lk", [(0, "opacity:0"), (42, "opacity:0"), (45, "opacity:1"), (76, "opacity:1"), (79, "opacity:0"), (100, "opacity:0")]),
        anim(".lk", "lk", T),
        kf("sv", [(0, "opacity:0"), (18, "opacity:0"), (20, "opacity:1"), (42, "opacity:1"), (44, "opacity:0"), (100, "opacity:0")]),
        anim(".sv", "sv", T),
        kf("rt", [(0, "transform:scale(1.8);opacity:0"), (42, "transform:scale(1.8);opacity:0"), (47, "transform:scale(1);opacity:1"),
                  (76, "transform:scale(1);opacity:1"), (79, "opacity:0"), (100, "transform:scale(1.8);opacity:0")]),
        anim(".rt", "rt", T, "ease-out"),
        kf("ds", [(0, "transform:rotate(-38deg)"), (50, "transform:rotate(-12deg)"), (100, "transform:rotate(-38deg)")]),
        anim(".ds", "ds", T, "ease-in-out"),
        kf("tw", [(0, "opacity:1"), (50, "opacity:.55"), (100, "opacity:1")]) + anim(".tg", "tw", 2.2, "ease-in-out"),
    ]
    dome_path = f"M{dx - dr} {dy}A{dr} {dr} 0 0 1 {dx + dr} {dy}Z"
    tube = (f'<g transform="translate({tx} {ty})"><g class="sl" style="transform:rotate({f(aim)}deg)">'
            f'<rect x="-6" y="-58" width="12" height="52" rx="2" fill="#dfe4f4"/><rect x="-7" y="-60" width="14" height="6" rx="1.5" fill="#9aa3c0"/>'
            f'<rect x="-6" y="-26" width="12" height="4" fill="#8f98bd"/><circle r="5" fill="#5d6589"/></g></g>')
    beam = (f'<g class="lk" style="opacity:0"><path d="M{target[0]} {target[1]}L{f(tx + 50 * math.sin(math.radians(aim)))} {f(ty - 50 * math.cos(math.radians(aim)))}" '
            f'stroke="#ff9fc6" stroke-opacity=".6" stroke-width="1.4" stroke-dasharray="3 3"/></g>')
    dish_x, dish_y = 342, gx
    dish = (f'<path d="M{dish_x - 8} {dish_y}L{dish_x} {dish_y - 26}L{dish_x + 8} {dish_y}" fill="none" stroke="#8f98bd" stroke-width="2"/>'
            f'<g transform="translate({dish_x} {dish_y - 26})"><g class="ds" style="transform:rotate(-12deg)">'
            '<path d="M-22 -4Q0 16 22 -4" fill="#1b2236" stroke="#cfd5e8" stroke-width="2"/>'
            '<path d="M-14 1L0 -18L14 1" fill="none" stroke="#8f98bd" stroke-width="1"/><circle cy="-18" r="2.2" fill="' + AURORA + '"/></g></g>')
    body = (
        # target star
        f'<g class="tg"><ellipse cx="{target[0]}" cy="{target[1]}" rx="9" ry="7" fill="{PLASMA}" opacity=".22"/>'
        f'<ellipse cx="{target[0] - 1}" cy="{target[1] + 1}" rx="4.5" ry="3.5" fill="#ff9fc6" opacity=".45"/>'
        f'<circle cx="{target[0]}" cy="{target[1]}" r="1.6" fill="#fff"/><circle cx="{target[0] + 2}" cy="{target[1] - 1.5}" r="1" fill="#fff"/></g>'
        f'<g transform="translate({target[0]} {target[1]})"><g class="rt" style="opacity:0"><circle r="12" fill="none" stroke="{AURORA}" stroke-width="1.3"/>'
        f'<path d="M-17 0H-8M8 0H17M0 -17V-8M0 8V17" stroke="{AURORA}" stroke-width="1.3"/></g></g>'
        + beam +
        # ground
        f'<path d="M0 {gx}Q100 {gx - 8} 200 {gx - 2}T400 {gx - 4}V250H0Z" fill="#070912"/>'
        f'<path d="M0 {gx}Q100 {gx - 8} 200 {gx - 2}T400 {gx - 4}" fill="none" stroke="#96aaff" stroke-opacity=".25"/>'
        # building
        f'<rect x="{dx - dr}" y="{dy}" width="{2 * dr}" height="{gx - dy + 2}" fill="#10152a" stroke="#96aaff" stroke-opacity=".3"/>'
        f'<rect x="{dx - 7}" y="{gx - 16}" width="14" height="18" rx="1.5" fill="#1b2236"/>'
        # dome: translucent shell so the telescope shows through; slit + shutter
        f'<clipPath id="dm"><path d="{dome_path}"/></clipPath>'
        f'<path d="{dome_path}" fill="#1a2140" fill-opacity=".72"/>'
        f'<g clip-path="url(#dm)"><rect x="{dx - 11}" y="{dy - dr}" width="22" height="{dr}" fill="#04050a"/>'
        + tube +
        f'<g class="sh"><rect x="{dx - 11}" y="{dy - dr - 2}" width="22" height="{dr + 2}" fill="#2a335c"/>'
        f'<path d="M{dx - 11} {dy - dr}V{dy}M{dx + 11} {dy - dr}V{dy}" stroke="#96aaff" stroke-opacity=".35"/></g></g>'
        f'<path d="{dome_path}" fill="none" stroke="#cfd5e8" stroke-opacity=".7" stroke-width="1.5"/>'
        + dish +
        # readout
        f'<g class="sv" style="opacity:0"><text class="mono" x="24" y="64" font-size="11.5" fill="{SOL}">slewing …</text></g>'
        f'<g class="lk" style="opacity:0"><text class="mono" x="24" y="64" font-size="11.5" fill="{AURORA}">● tracking M42</text>'
        f'<text class="mono" x="24" y="82" font-size="11" fill="{TEXT2}">RA  05h 35m 17s</text>'
        f'<text class="mono" x="24" y="98" font-size="11" fill="{TEXT2}">Dec −05° 23′ 28″</text></g>'
    )
    return dict(defs="", css="".join(css), body=body, stars=46, star_h=150)
