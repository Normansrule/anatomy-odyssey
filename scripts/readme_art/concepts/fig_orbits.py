"""5. orbit-race.svg — the eight planets with true relative periods; radii ∝ √a; year counter."""
import math
from _lib import *

W = H = 600
CX, CY = 300, 326
TY = 4.0                         # s of animation per Earth year
# (name, a in AU, sidereal period in years, colour, mean longitude at J2000 in deg, size px)
# a and T: NASA NSSDCA fact sheets; L0: Standish (1992) / JPL "Approximate positions of the planets", J2000.
PL = [
    ("Mercury", 0.38710, 0.2408467, "#b8b0a6", 252.25, 3.0),
    ("Venus", 0.72333, 0.6151973, "#e8c889", 181.98, 4.2),
    ("Earth", 1.00000, 1.0000174, "#6fb4ff", 100.46, 4.4),
    ("Mars", 1.52368, 1.8808476, "#ff7a4d", 355.45, 3.6),
    ("Jupiter", 5.20260, 11.862615, "#e3b98b", 34.40, 8.0),
    ("Saturn", 9.55491, 29.447498, "#f0d7a1", 49.94, 7.0),
    ("Uranus", 19.21845, 84.016846, "#9fe3ea", 313.23, 5.6),
    ("Neptune", 30.11039, 164.79132, "#5b8cff", 304.88, 5.6),
]
K = 248 / math.sqrt(30.11039)


def build():
    css, body = [], []
    body.append(card(W, H, seed=55, nstars=110))
    body.append(header(24, 34, "THE SOLAR SYSTEM · TRUE RELATIVE PERIODS", "The orbit race", size=20))

    body.append(f'<defs><radialGradient id="sun"><stop offset="0" stop-color="#fff6d8"/><stop offset=".45" stop-color="{SOL}"/>'
                f'<stop offset="1" stop-color="{FLAME}" stop-opacity="0"/></radialGradient></defs>')
    for name, a, T, col, L0, sz in PL:
        r = K * math.sqrt(a)
        body.append(f'<circle cx="{CX}" cy="{CY}" r="{f(r, 2)}" fill="none" stroke="{col}" stroke-opacity=".22"/>')
    body.append(f'<circle cx="{CX}" cy="{CY}" r="22" fill="url(#sun)"/><circle cx="{CX}" cy="{CY}" r="8" fill="#fff1c2"/>')

    for i, (name, a, T, col, L0, sz) in enumerate(PL):
        r = K * math.sqrt(a)
        # trail: short arcs behind the planet (motion is counter-clockwise on screen)
        trail = ""
        for j, (a0, a1, op) in enumerate(((0, 10, .55), (10, 22, .3), (22, 38, .14))):
            th0, th1 = math.radians(-a0), math.radians(-a1)
            x0, y0 = CX + r * math.cos(th0), CY - r * math.sin(th0)
            x1, y1 = CX + r * math.cos(th1), CY - r * math.sin(th1)
            trail += (f'<path d="M{f(x0, 2)} {f(y0, 2)}A{f(r, 2)} {f(r, 2)} 0 0 1 {f(x1, 2)} {f(y1, 2)}" fill="none" '
                      f'stroke="{col}" stroke-width="{f(min(sz, 4.5) * 0.9, 1)}" stroke-linecap="round" opacity="{op}"/>')
        ring = ""
        if name == "Saturn":
            ring = f'<ellipse cx="{f(CX + r, 2)}" cy="{CY}" rx="{f(sz * 1.9, 1)}" ry="{f(sz * .6, 1)}" fill="none" stroke="{col}" stroke-width="1.2" opacity=".85"/>'
        body.append(f'<g transform="rotate({f(-L0, 2)} {CX} {CY})"><g class="o{i}">{trail}'
                    f'<circle cx="{f(CX + r, 2)}" cy="{CY}" r="{sz}" fill="{col}"/>{ring}</g></g>')
        css.append(f".o{i}{{transform-origin:{CX}px {CY}px;animation:spin {f(T * TY, 4)}s linear infinite}}")
    css.append("@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}")

    # labels: outer four on their rings (lower right), inner four in a key
    for name, a, T, col, L0, sz in PL[4:]:
        r = K * math.sqrt(a)
        th = math.radians(-106)
        x, y = CX + r * math.cos(th), CY - r * math.sin(th)
        body.append(text(x + 6, y + 4, f"{name}", 12, col, weight=700))
        body.append(text(x + 6, y + 18, f"{T:.1f} y" if T < 100 else f"{T:.1f} y", 11, TEXT2, "m"))
    kx, ky = 24, 470
    body.append(text(kx, ky, "inner planets", 10.5, MUTED, "m"))
    for j, (name, a, T, col, L0, sz) in enumerate(PL[:4]):
        y = ky + 18 + j * 17
        body.append(f'<circle cx="{kx + 5}" cy="{y - 4}" r="4" fill="{col}"/>')
        body.append(text(kx + 15, y, name, 12, col, weight=700))
        body.append(text(kx + 118, y, f"{T:.3f} y" if T < 1 else f"{T:.2f} y", 11.5, TEXT2, "m", "end"))

    # year counter: three digit strips (SMIL, discrete)
    rx, ry = 576, 36
    body.append(text(rx, ry - 2, "EARTH YEARS", 10.5, MUTED, "m", "end"))
    dh = 30
    body.append(f'<defs><clipPath id="dig"><rect x="{rx - 3 * 20 - 4}" y="{ry + 4}" width="{3 * 20 + 6}" height="{dh}"/></clipPath></defs>')
    strips = []
    for d, period in enumerate((1000, 100, 10)):
        x = rx - (3 - d) * 20 + 10
        digits = "".join(text(x, ry + 28 + k * dh, str(k), 26, TEXT, "m", "middle", 700) for k in range(10))
        vals = ";".join(f"0 {-k * dh}" for k in range(10))
        kt = ";".join(f(k / 10, 3) for k in range(10))
        strips.append(f'<g>{digits}<animateTransform attributeName="transform" type="translate" calcMode="discrete" '
                      f'values="{vals}" keyTimes="{kt}" dur="{f(period * TY / 1, 3)}s" repeatCount="indefinite"/></g>')
    body.append(f'<g class="smil" clip-path="url(#dig)">{"".join(strips)}</g>')
    body.append('<g class="still">' + text(rx, ry + 28, "J2000", 24, TEXT, "m", "end", 700) + "</g>")
    body.append(text(rx, ry + 52, f"1 year = {f(TY)} s", 11, MUTED, "m", "end"))

    body.append(text(576, 566, "Periods true (T² ∝ a³).", 11.5, TEXT2, anchor="end"))
    body.append(text(576, 582, "Distances compressed: radius ∝ √a.", 11.5, TEXT2, anchor="end"))
    body.append(text(24, 582, "start: positions on 1 Jan 2000", 11, MUTED))

    rows = "; ".join(f"{n} a = {a} AU, T = {T} y" for n, a, T, *_ in PL)
    desc = (
        "Animated top view of the eight planets orbiting the Sun counter-clockwise. Orbital periods are true relative to "
        f"each other (1 Earth year = {TY:g} s of animation; each planet's rotation lasts T × {TY:g} s), so Mercury laps "
        "Earth about four times per year while Neptune barely moves. Distances are compressed: drawn radius ∝ √a, "
        "so Neptune's orbit (30.1 AU) is 5.5× Earth's instead of 30×. Planets start at their J2000 mean longitudes "
        "(252.25°, 181.98°, 100.46°, 355.45°, 34.40°, 49.94°, 313.23°, 304.88°; JPL 'Approximate Positions of the "
        "Planets'); orbits drawn circular. A three-digit counter ticks Earth years. Data (NASA NSSDCA fact sheets): "
        + rows + "."
    )
    svg(W, H, "The orbit race: planets with true relative periods", desc, "".join(body), "".join(css), name="orbit-race.svg")


if __name__ == "__main__":
    build()
