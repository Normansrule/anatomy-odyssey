"""A stylised Orion region drawn in several wavelength bands (false colour).

Shared by the "Sky surveys" tile and the concepts/wavelengths.svg figure, so both
show the same patch of sky. Positions are real J2000 coordinates (SIMBAD); the
emission drawn in each band follows what the classic all-sky surveys show:

  radio      ionised gas in the Orion Nebula (M42) and NGC 2024 (free-free emission),
             and the Orion A / Orion B molecular clouds (carbon monoxide at 2.6 mm);
             stars are essentially invisible.
  infrared   warm dust (IRAS 100 um): the Orion A and B clouds and the dust ring around
             lambda Orionis (Meissa); cool, dusty Betelgeuse is the brightest star.
  visible    the stars in their real colours (sized by V magnitude), the pink Orion
             Nebula, and the faint hydrogen-alpha arcs of Barnard's Loop and the
             lambda Orionis ring.
  ultraviolet  only hot O/B stars shine (Rigel, the belt, Bellatrix, Saiph, Meissa, the
             Trapezium); 3,600 K Betelgeuse almost vanishes.
  x-ray      million-degree plasma: hundreds of flaring young stars in the Orion Nebula
             Cluster (Chandra COUP, Getman et al. 2005), the O-star belt (zeta Ori) and the
             hot Orion-Eridanus superbubble to the west (ROSAT, Burrows et al. 1993).
  gamma      cosmic rays striking the Orion A and B clouds (Fermi-LAT, Ackermann et al. 2012).
"""
import math
import random

# name, RA deg, Dec deg, V mag, colour (J2000, SIMBAD)
STARS = [
    ("Betelgeuse", 88.793, 7.407, 0.45, "#ffb26b"), ("Rigel", 78.634, -8.202, 0.13, "#cfe3ff"),
    ("Bellatrix", 81.283, 6.350, 1.64, "#d8e6ff"), ("Saiph", 86.939, -9.670, 2.06, "#d6e4ff"),
    ("Alnitak", 85.190, -1.943, 1.77, "#d0e0ff"), ("Alnilam", 84.053, -1.202, 1.69, "#d6e4ff"),
    ("Mintaka", 83.002, -0.299, 2.23, "#d6e4ff"), ("Meissa", 83.784, 9.934, 3.39, "#d6e4ff"),
    ("Hatysa", 83.858, -5.910, 2.77, "#dbe6ff"),
]
HOT = {"Rigel": 1.0, "Bellatrix": .75, "Saiph": .8, "Alnitak": 1.0, "Alnilam": .95, "Mintaka": .8, "Meissa": .7,
       "Hatysa": .7, "Betelgeuse": .05}
M42 = (83.822, -5.391)
NGC2024 = (85.42, -1.90)
RA0, DEC0 = 84.3, -0.2
FIG = [("Betelgeuse", "Alnitak"), ("Alnitak", "Alnilam"), ("Alnilam", "Mintaka"), ("Mintaka", "Bellatrix"),
       ("Bellatrix", "Meissa"), ("Meissa", "Betelgeuse"), ("Alnitak", "Saiph"), ("Mintaka", "Rigel"),
       ("Betelgeuse", "Bellatrix")]


def f(v, nd=1):
    s = f"{v:.{nd}f}"
    if "." in s:
        s = s.rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


class Sky:
    """Maps RA/Dec (deg) to SVG x/y: east to the left, north up, `s` px per degree."""

    def __init__(self, cx, cy, s):
        self.cx, self.cy, self.s = cx, cy, s

    def xy(self, ra, dec):
        return (self.cx - (ra - RA0) * math.cos(math.radians(DEC0)) * self.s, self.cy - (dec - DEC0) * self.s)

    def star(self, name):
        for n, ra, dec, v, c in STARS:
            if n == name:
                return self.xy(ra, dec)
        raise KeyError(name)


def defs(u):
    """Gradients and blur filters (ids prefixed with `u`)."""
    g = lambda i, c, a: (f'<radialGradient id="{u}{i}"><stop offset="0" stop-color="{c}" stop-opacity="{a}"/>'
                         f'<stop offset=".45" stop-color="{c}" stop-opacity="{f(a * .45, 2)}"/><stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>')
    return (g("rad", "#ffb347", .95) + g("radc", "#ff5a3d", .6) + g("ir", "#ff6aa8", .75) + g("irh", "#ffd08a", .9)
            + g("neb", "#ff7fb0", .8) + g("uv", "#a9c4ff", .95) + g("uvd", "#8a78ff", .35) + g("xr", "#7af5ff", .9)
            + g("xb", "#b18cff", .35) + g("gm", "#e46bff", .55)
            + f'<filter id="{u}bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>')


def _arc(sky, ra, dec, r_deg, a0, a1, n=40):
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        pts.append(sky.xy(ra + r_deg * math.cos(a) / math.cos(math.radians(dec)), dec + r_deg * math.sin(a)))
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts)


def _blob(sky, ra, dec, rx_deg, ry_deg, grad, rot=0, op=1.0):
    x, y = sky.xy(ra, dec)
    return (f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(rx_deg * sky.s)}" ry="{f(ry_deg * sky.s)}" fill="url(#{grad})" '
            f'opacity="{f(op, 2)}" transform="rotate({rot} {f(x)} {f(y)})"/>')


def _clouds(sky, u, grad, op=1.0):
    """Orion A (M42 southward) and Orion B (NGC 2024 northward) molecular clouds."""
    return (_blob(sky, 84.6, -7.2, 1.3, 3.2, f"{u}{grad}", rot=-22, op=op)
            + _blob(sky, 85.9, 0.3, 1.0, 2.6, f"{u}{grad}", rot=-18, op=op * .8))


def band(name, sky, u, seed=7):
    """SVG for one band (no animation)."""
    s = sky.s
    out = []
    if name == "radio":
        out.append(_clouds(sky, u, "radc", .9))
        out.append(_blob(sky, *M42, 1.5, 1.5, f"{u}rad"))
        out.append(_blob(sky, *NGC2024, 0.9, 0.9, f"{u}rad", op=.8))
        out.append(_blob(sky, 83.78, 9.93, 1.6, 1.6, f"{u}radc", op=.35))
        # a few background radio galaxies / quasars (unresolved)
        rng = random.Random(seed)
        for _ in range(7):
            x, y = sky.xy(rng.uniform(78, 91), rng.uniform(-11, 12))
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(max(.8, s * .09), 2)}" fill="#ffc98a" opacity=".7"/>')
    elif name == "infrared":
        out.append(f'<path d="{_arc(sky, 83.8, 9.9, 4.2, 0, 360, 60)}" fill="none" stroke="#ff6aa8" stroke-opacity=".55" '
                   f'stroke-width="{f(s * .9)}" filter="url(#{u}bl)"/>')
        out.append(_clouds(sky, u, "ir", 1))
        out.append(f'<path d="{_arc(sky, 86.0, -3.5, 7.2, 100, 255)}" fill="none" stroke="#ff6aa8" stroke-opacity=".25" '
                   f'stroke-width="{f(s * .7)}" filter="url(#{u}bl)"/>')
        out.append(_blob(sky, *M42, .8, .8, f"{u}irh"))
        for n, r in (("Betelgeuse", 1.0), ("Rigel", .45), ("Bellatrix", .3)):
            x, y = sky.star(n)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(s * .9 * r)}" fill="url(#{u}irh)"/>'
                       f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(max(1.2, s * .2 * r), 2)}" fill="#fff4dc"/>')
    elif name == "visible":
        out.append(f'<path d="{_arc(sky, 86.0, -3.5, 7.2, 100, 255)}" fill="none" stroke="#ff5a7a" stroke-opacity=".22" '
                   f'stroke-width="{f(s * .45)}" filter="url(#{u}bl)"/>')
        out.append(f'<path d="{_arc(sky, 83.8, 9.9, 4.2, 0, 360, 60)}" fill="none" stroke="#ff5a7a" stroke-opacity=".12" '
                   f'stroke-width="{f(s * .5)}" filter="url(#{u}bl)"/>')
        out.append(_blob(sky, *M42, .7, .6, f"{u}neb"))
        for n, ra, dec, v, c in STARS:
            x, y = sky.xy(ra, dec)
            r = max(.9, s * .075 * (4.2 - v))
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 2.6)}" fill="{c}" opacity=".18"/>'
                       f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r)}" fill="{c}"/>')
    elif name == "ultraviolet":
        out.append(_blob(sky, 84.5, -1, 5, 8, f"{u}uvd", op=.8))
        for n, ra, dec, v, c in STARS:
            k = HOT[n]
            x, y = sky.xy(ra, dec)
            r = max(.7, s * .1 * (4.2 - v) * k)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * 3.2)}" fill="url(#{u}uv)" opacity="{f(.3 + .7 * k, 2)}"/>'
                       f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(r * .55)}" fill="#f2f5ff" opacity="{f(.25 + .75 * k, 2)}"/>')
        out.append(_blob(sky, *M42, .45, .45, f"{u}uv"))
    elif name == "xray":
        out.append(_blob(sky, 76.5, -6.5, 5.2, 7.5, f"{u}xb", rot=15))   # Orion-Eridanus superbubble
        rng = random.Random(seed + 3)
        mx, my = sky.xy(*M42)
        out.append(f'<circle cx="{f(mx)}" cy="{f(my)}" r="{f(s * .9)}" fill="url(#{u}xr)" opacity=".55"/>')
        dots = []
        for _ in range(26):
            a, rr = rng.uniform(0, 2 * math.pi), abs(rng.gauss(0, .35)) * s
            dots.append(f'<circle cx="{f(mx + rr * math.cos(a))}" cy="{f(my + rr * math.sin(a))}" r="{f(rng.uniform(.5, 1.2) * max(1, s * .1), 2)}"/>')
        out.append(f'<g fill="#dffcff">{"".join(dots)}</g>')
        for n in ("Alnitak", "Alnilam", "Mintaka", "Meissa"):
            x, y = sky.star(n)
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(s * .45)}" fill="url(#{u}xr)"/>')
    elif name == "gamma":
        out.append(_clouds(sky, u, "gm", 1))
        out.append(f'<rect x="{f(sky.cx - 30 * s)}" y="{f(sky.cy - 30 * s)}" width="{f(60 * s)}" height="{f(60 * s)}" fill="#e46bff" opacity=".05"/>')
        rng = random.Random(seed + 9)
        for _ in range(3):
            x, y = sky.xy(rng.uniform(78, 91), rng.uniform(-11, 12))
            out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(s * .5)}" fill="url(#{u}gm)"/>')
    return "".join(out)


def figure_lines(sky, color="#ffffff", op=.18, width=.8):
    segs = []
    for a, b in FIG:
        (x1, y1), (x2, y2) = sky.star(a), sky.star(b)
        segs.append(f"M{f(x1)} {f(y1)}L{f(x2)} {f(y2)}")
    return (f'<path d="{"".join(segs)}" fill="none" stroke="{color}" stroke-opacity="{op}" stroke-width="{width}" '
            f'stroke-dasharray="2 3"/>')
