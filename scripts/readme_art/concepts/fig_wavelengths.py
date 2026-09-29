"""wavelengths.svg (1000 x 300) — the same patch of sky (Orion) seen in six bands of the
electromagnetic spectrum, with a log-scale wavelength bar. Sky drawing: ../orion.py."""
import math
import os
import sys

from _lib import *

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
import orion  # noqa: E402
from metrics import text_w  # noqa: E402

W, H = 1000, 300
BAR_X, BAR_W, BAR_Y = 28, 640, 236
DEC_PX = 40                                   # px per decade of wavelength; bar runs 10 m -> 1 fm


def lx(lam_m):
    return BAR_X + (1 - math.log10(lam_m)) * DEC_PX


BANDS = [
    # key, name, colour, wavelength text, marker λ (m), two lines, seen by
    ("radio", "Radio", "#ff9a52", "λ ≈ 1 cm – 3 mm", 5e-3,
     ("Hot ionised gas in the Orion Nebula and cold molecular clouds", "(carbon monoxide at 2.6 mm). Stars are almost invisible."),
     "Seen by radio dishes and millimetre-wave telescopes"),
    ("infrared", "Infrared", "#ff6aa8", "λ ≈ 100 µm", 1e-4,
     ("Warm dust: the Orion A and B clouds and the ring around", "Meissa (λ Orionis). Cool Betelgeuse is the brightest star."),
     "Seen by the Infrared Astronomical Satellite (IRAS) and Planck"),
    ("visible", "Visible light", "#e9edff", "λ ≈ 400 – 700 nm", 5.5e-7,
     ("Stars in their true colours: red Betelgeuse, blue-white Rigel,", "the belt, and the pink glow of the Orion Nebula."),
     "Seen by your eyes and every camera"),
    ("ultraviolet", "Ultraviolet", "#a9c4ff", "λ ≈ 150 nm", 1.5e-7,
     ("Only hot O and B stars shine: Rigel, the belt, Bellatrix.", "Betelgeuse, at about 3,600 K, almost vanishes."),
     "Seen from space by the Galaxy Evolution Explorer (GALEX)"),
    ("xray", "X-ray", "#7af5ff", "λ ≈ 1 nm", 1e-9,
     ("Million-degree gas: flaring young stars in the Orion Nebula", "Cluster and the hot Orion–Eridanus superbubble."),
     "Seen by Chandra and the Röntgensatellit (ROSAT)"),
    ("gamma", "Gamma rays", "#e46bff", "λ ≈ 10⁻¹⁵ m (GeV photons)", 1e-15 * 1.3,
     ("Cosmic rays smashing into the gas of the Orion A and B", "molecular clouds make a faint gamma-ray glow."),
     "Seen by the Fermi Gamma-ray Space Telescope"),
]
SEGS = [("radio", 1e1, 1e-3, "#b8452a"), ("infrared", 1e-3, 7e-7, "#c2386e"), ("visible", 7e-7, 4e-7, None),
        ("ultraviolet", 4e-7, 1e-8, "#6a5cff"), ("X-ray", 1e-8, 1e-11, "#2fb3b8"), ("gamma ray", 1e-11, 1e-15, "#b04ad6")]
STEP = 3.0
DUR = STEP * len(BANDS)
FADE = 0.5 / DUR


def build():
    css, body = [], []
    body.append(card(W, H, seed=97, nstars=70, avoid=lambda x, y: x > 690))
    body.append(header(28, 34, "ONE PATCH OF SKY · SIX WAYS TO SEE IT", "Orion across the spectrum", size=21))

    # sky panel
    px, py, pw, ph = 692, 16, 280, 268
    sky = orion.Sky(px + pw / 2 - 8, py + ph / 2 - 4, 10)
    body.append(f'<defs>{orion.defs("o")}<clipPath id="vp"><rect x="{px}" y="{py}" width="{pw}" height="{ph}" rx="12"/></clipPath>'
                '<linearGradient id="vis" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ff3b3b"/><stop offset=".3" stop-color="#ffd23f"/>'
                '<stop offset=".5" stop-color="#4ef07a"/><stop offset=".75" stop-color="#3f7dff"/><stop offset="1" stop-color="#8a4dff"/></linearGradient></defs>')
    layers = []
    n = len(BANDS)
    for i, (key, name, col, lam_t, lam, lines, seen) in enumerate(BANDS):
        a, b = i / n, (i + 1) / n
        if i == 0:
            st = [(0, "opacity:1"), (b - FADE, "opacity:1"), (b, "opacity:0"), (1 - FADE, "opacity:0"), (1, "opacity:1")]
        elif i == n - 1:
            st = [(0, "opacity:0"), (a - FADE, "opacity:0"), (a, "opacity:1"), (1 - FADE, "opacity:1"), (1, "opacity:0")]
        else:
            st = [(0, "opacity:0"), (a - FADE, "opacity:0"), (a, "opacity:1"), (b - FADE, "opacity:1"), (b, "opacity:0"), (1, "opacity:0")]
        vis = 1 if key == "visible" else 0
        css.append(f".b{i}{{opacity:{vis}}}" + kf(f"b{i}", st) + anim(f".b{i}", f"b{i}", DUR))
        # captions swap without overlapping: the old one is gone before the new one appears
        h = FADE / 2
        if i == 0:
            tst = [(0, "opacity:1"), (b - FADE, "opacity:1"), (b - h, "opacity:0"), (1 - h, "opacity:0"), (1, "opacity:1")]
        elif i == n - 1:
            tst = [(0, "opacity:0"), (a - h, "opacity:0"), (a, "opacity:1"), (1 - FADE, "opacity:1"), (1 - h, "opacity:0"), (1, "opacity:0")]
        else:
            tst = [(0, "opacity:0"), (a - h, "opacity:0"), (a, "opacity:1"), (b - FADE, "opacity:1"), (b - h, "opacity:0"), (1, "opacity:0")]
        css.append(f".c{i}{{opacity:{vis}}}" + kf(f"c{i}", tst) + anim(f".c{i}", f"c{i}", DUR))
        layers.append(f'<g class="b{i}">{orion.band(key, sky, "o")}</g>')
        body.append(f'<g class="c{i}">' + text(28, 104, name, 30, col, weight=800) + text(28 + text_w(name, 30, True) + 18, 104, lam_t, 14, TEXT2, "m")
                    + text(28, 136, lines[0], 15, TEXT) + text(28, 157, lines[1], 15, TEXT) + text(28, 184, seen, 12.5, MUTED) + "</g>")
    grid = "".join(f'<path d="M{px + k * pw / 5} {py}V{py + ph}M{px} {py + k * ph / 5}H{px + pw}"/>' for k in range(1, 5))
    names = ""
    for nm, dx, dy, anc in (("Betelgeuse", -8, -8, "end"), ("Rigel", 8, 14, "start"), ("Bellatrix", 8, -8, "start")):
        x, y = sky.star(nm)
        names += text(x + dx, y + dy, nm, 11, TEXT2, anchor=anc, extra=' opacity=".75"')
    mx, my = sky.xy(*orion.M42)
    names += f'<path d="M{f(mx - 6)} {f(my)}H{f(mx - 26)}" stroke="{TEXT2}" stroke-opacity=".5"/>' + text(mx - 30, my + 4, "Orion Nebula", 11, TEXT2, anchor="end", extra=' opacity=".75"')
    body.append(f'<g clip-path="url(#vp)"><rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="#02030a"/>'
                f'<g stroke="#96aaff" stroke-opacity=".07">{grid}</g>' + "".join(layers) + orion.figure_lines(sky, op=.14) + names + '</g>')
    body.append(f'<rect x="{px + .5}" y="{py + .5}" width="{pw - 1}" height="{ph - 1}" rx="12" fill="none" stroke="#96aaff" stroke-opacity=".35"/>')
    body.append(text(px + pw - 10, py + ph - 10, "false colour", 11, FAINT, "m", "end"))

    # log wavelength bar
    for name, l0, l1, col in SEGS:
        x0, x1 = lx(l0), lx(l1)
        fill = col or "url(#vis)"
        body.append(f'<rect x="{f(x0)}" y="{BAR_Y}" width="{f(x1 - x0)}" height="12" fill="{fill}"/>')
        if name == "visible":
            body.append(f'<path d="M{f((x0 + x1) / 2)} {BAR_Y - 2}V{BAR_Y - 20}" stroke="{TEXT2}" stroke-opacity=".6"/>'
                        + text((x0 + x1) / 2, BAR_Y - 24, "visible", 11.5, TEXT2, anchor="middle"))
        else:
            body.append(text((x0 + x1) / 2 + (6 if name == "ultraviolet" else 0), BAR_Y - 6, name, 11.5, TEXT2, anchor="middle"))
    body.append(f'<rect x="{BAR_X}" y="{BAR_Y}" width="{BAR_W}" height="12" fill="none" stroke="#fff" stroke-opacity=".15"/>')
    for lam, lab in ((1, "1 m"), (1e-3, "1 mm"), (1e-6, "1 µm"), (1e-9, "1 nm"), (1e-12, "1 pm"), (1e-15, "1 fm")):
        x = lx(lam)
        body.append(f'<path d="M{f(x)} {BAR_Y + 12}v5" stroke="{FAINT}"/>' + text(x, BAR_Y + 30, lab, 11.5, FAINT, "m", "middle"))
    body.append(text(BAR_X, BAR_Y + 52, "wavelength, log scale: each tick is 1,000× shorter", 11.5, FAINT))
    mk = []
    for i, b in enumerate(BANDS):
        x = f(lx(b[4]))
        mk += [(i / n, f"transform:translateX({x}px)"), ((i + 1) / n - FADE, f"transform:translateX({x}px)")]
    mk.append((1, f"transform:translateX({f(lx(BANDS[0][4]))}px)"))
    css.append(kf("mk", mk) + anim(".mk", "mk", DUR, "ease-in-out"))
    body.append(f'<g class="mk" style="transform:translateX({f(lx(5.5e-7))}px)">'
                f'<rect x="-5" y="{BAR_Y - 3}" width="10" height="18" rx="3" fill="none" stroke="#fff" stroke-width="2"/></g>')

    desc = ("Animated comparison of one patch of sky, the constellation Orion, in six bands of the electromagnetic spectrum, with a marker "
            "moving along a logarithmic wavelength bar (10 m to 1 femtometre). Star positions are real (J2000); the emission in each band is "
            "stylised in false colour from the classic surveys. "
            + " ".join(f"{b[1]} ({b[3]}): {b[5][0]} {b[5][1]} {b[6]}." for b in BANDS)
            + " References: Getman et al. 2005 (Chandra Orion Ultradeep Project); Burrows et al. 1993 (ROSAT, Orion–Eridanus bubble); "
              "Ackermann et al. 2012 (Fermi-LAT, Orion molecular clouds).")
    svg(W, H, "Orion across the electromagnetic spectrum", desc, "".join(body), "".join(css), name="wavelengths.svg")


if __name__ == "__main__":
    build()
