"""3. kepler-areas.svg — Kepler's second law on an e = 0.5 orbit, Kepler-equation timing."""
import math
from _lib import *

W, H = 800, 360
E = 0.5
A = 140.0
B = A * math.sqrt(1 - E * E)
CXE, CYE = 232.0, 206.0            # ellipse centre
FX = CXE + A * E                   # Sun at the right-hand focus (perihelion on the right)
P = 16.0                           # s per orbit (the loop)
NW = 8                             # wedges per orbit
COLS = [ICE, NEBULA, PLASMA, FLAME, SOL, AURORA, "#7c9bff", "#ff9ecf"]


def pos(frac):
    """Planet position at orbit-time fraction frac (0 = perihelion), counter-clockwise."""
    M = 2 * math.pi * (frac % 1.0)
    Ea = kepler_E(M, E)
    x = A * (math.cos(Ea) - E)     # from the focus
    y = B * math.sin(Ea)
    return FX + x, CYE - y


def build():
    css, body = [], []
    body.append(card(W, H, seed=33, nstars=70))
    body.append(header(28, 36, "KEPLER'S SECOND LAW, 1609", "Equal areas in equal times"))

    body.append(f'<ellipse cx="{CXE}" cy="{CYE}" rx="{A}" ry="{f(B, 2)}" fill="none" stroke="#3a4577" stroke-width="1.3"/>')
    # empty focus + centre marks
    ox = CXE - A * E
    body.append(f'<path d="M{f(ox - 4)} {CYE - 4}l8 8M{f(ox + 4)} {CYE - 4}l-8 8" stroke="{FAINT}" stroke-width="1.3"/>')
    body.append(text(ox, CYE + 20, "empty focus", 10, FAINT, anchor="middle"))

    smil, still = [], []
    for k in range(NW):
        c = COLS[k]
        t0 = k / NW
        frames = []
        nf = 12
        npts = 16
        for j in range(nf + 1):
            u = j / nf
            pts = [(FX, CYE)] + [pos(t0 + u / NW * i / (npts - 1)) for i in range(npts)]
            frames.append(" ".join(f"{f(x, 1)},{f(y, 1)}" for x, y in pts))
        kt = [j / nf / NW for j in range(nf + 1)] + [1.0]
        vals = frames + [frames[-1]]
        begin = f"{f(k * P / NW - P, 3)}s" if k else "0s"   # negative: the previous orbit's wedges are already there
        smil.append(
            f'<polygon points="{frames[-1]}" fill="{c}" fill-opacity=".30" stroke="{c}" stroke-opacity=".9" stroke-width="1" opacity="0">'
            f'<animate attributeName="points" values="{";".join(vals)}" keyTimes="{keytimes(kt)}" dur="{f(P)}s" begin="{begin}" repeatCount="indefinite"/>'
            f'<animate attributeName="opacity" values="0;1;1;0;0" keyTimes="0;0.004;0.93;0.985;1" dur="{f(P)}s" begin="{begin}" repeatCount="indefinite"/>'
            '</polygon>')
        still.append(f'<polygon points="{frames[-1]}" fill="{c}" fill-opacity=".30" stroke="{c}" stroke-opacity=".9" stroke-width="1"/>')
    body.append('<g class="smil">' + "".join(smil) + "</g>")
    body.append('<g class="still">' + "".join(still) + "</g>")

    # Sun
    body.append(f'<defs><radialGradient id="sun"><stop offset="0" stop-color="#fff6d8"/><stop offset=".5" stop-color="{SOL}"/>'
                f'<stop offset="1" stop-color="{FLAME}" stop-opacity="0"/></radialGradient></defs>')
    body.append(f'<circle cx="{f(FX)}" cy="{CYE}" r="17" fill="url(#sun)"/><circle cx="{f(FX)}" cy="{CYE}" r="6.5" fill="#fff3c9"/>')

    # planet: CSS keyframes, equal time steps
    n = 160
    stops = [(i / n, f"transform:{tr(*pos(i / n))}") for i in range(n + 1)]
    px, py = pos(0.43)
    body.append(f'<g class="pl"><circle r="9" fill="{ICE}" opacity=".22"/><circle r="5" fill="#dff1ff"/></g>')
    css.append(".pl{transform:" + tr(px, py) + "}" + kf("pl", stops) + anim(".pl", "pl", P))

    # labels on the orbit
    body.append(text(CXE + A + 8, CYE - 8, "perihelion", 11, TEXT2))
    body.append(text(CXE + A + 8, CYE + 7, "fastest", 11, FLAME, weight=600))
    body.append(text(CXE - A - 8, CYE - 8, "aphelion", 11, TEXT2, anchor="end"))
    body.append(text(CXE - A - 8, CYE + 7, "slowest", 11, ICE, anchor="end", weight=600))
    body.append(text(FX, CYE + 34, "Sun (focus)", 10.5, SOL, anchor="middle"))

    # ---------- right panel ----------
    X = 452
    body.append(text(X, 100, "Each coloured wedge is swept in 1/8 of an orbit.", 13, TEXT, weight=600))
    body.append(text(X, 119, "Near the Sun they are short and fat, far away long", 12, TEXT2))
    body.append(text(X, 135, "and thin, but every one has the same area.", 12, TEXT2))
    # area bars: all the same length, growing linearly in time (area rate is constant)
    by = 158
    bw = 262
    body.append(text(X, by - 2, "area swept per 1/8 orbit", 10.5, MUTED, "m"))
    for k in range(NW):
        c = COLS[k]
        y = by + 8 + k * 13
        body.append(f'<rect x="{X}" y="{y}" width="{bw}" height="8" rx="4" fill="#10162f"/>')
        body.append(f'<rect class="ab{k}" x="{X}" y="{y}" width="{bw}" height="8" rx="4" fill="{c}" fill-opacity=".75"/>')
        css.append(f".ab{k}{{transform-box:fill-box;transform-origin:0 50%}}"
                   + anim(f".ab{k}", "ab", P, delay=(k * P / NW - P) if k else 0))
        body.append(text(X + bw + 8, y + 8, "12.5 %", 10, c, "m"))
    css.append(kf("ab", [(0, "transform:scaleX(0);opacity:1"), (1 / NW, "transform:scaleX(1);opacity:1"),
                         (0.93, "transform:scaleX(1);opacity:1"), (0.985, "transform:scaleX(1);opacity:0"),
                         (1, "transform:scaleX(0);opacity:0")]))
    vr = (1 + E) / (1 - E)
    body.append(text(X, 283, "e = 0.5, so the planet is 3× faster at perihelion:", 12, TEXT2))
    body.append(text(X, 302, "v_peri / v_aph = (1 + e) / (1 − e) = 3", 13, TEXT, "m", weight=600))
    body.append(text(X, 322, "The planet's motion follows Kepler's equation", 11, MUTED))
    body.append(text(X, 337, "M = E − e·sin E, sampled at equal time steps.", 11, MUTED))
    body.append(text(28, 344, "Earth's e is only 0.017; comet Halley's is 0.967.", 11, MUTED))

    desc = (
        "Animated diagram of Kepler's second law. A planet moves on an ellipse with eccentricity e = 0.5 around the "
        "Sun at one focus. Its position is computed from Kepler's equation M = E − e·sin E at equal time steps "
        "(x = a(cos E − e), y = b·sin E, b = a√(1 − e²)), so it speeds up near perihelion and slows near aphelion; "
        "the speed ratio is (1 + e)/(1 − e) = 3. Every 1/8 of the orbital period a coloured wedge (Sun → arc) is swept; "
        "by the second law each has the same area, 1/8 = 12.5 % of the ellipse, and the area bars grow linearly in "
        "time because dA/dt = h/2 is constant. One orbit = 16 s of animation. Eccentricities: Earth 0.0167, "
        "Halley's Comet 0.967 (NASA/JPL). Source: docs/EQUATIONS.md §1.3."
    )
    svg(W, H, "Kepler's second law: equal areas in equal times", desc, "".join(body), "".join(css), name="kepler-areas.svg")
    # self-check: wedge areas equal
    areas = []
    for k in range(NW):
        pts = [(FX, CYE)] + [pos(k / NW + i / (NW * 400)) for i in range(401)]
        s = 0
        for i in range(len(pts)):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % len(pts)]
            s += x1 * y2 - x2 * y1
        areas.append(abs(s) / 2)
    print("    wedge areas / (πab/8):", ", ".join(f"{a / (math.pi * A * B / NW):.4f}" for a in areas))


if __name__ == "__main__":
    build()
