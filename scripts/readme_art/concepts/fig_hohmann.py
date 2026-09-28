"""2. hohmann.svg — LEO (300 km) → GEO Hohmann transfer, radii to scale, Kepler timing."""
import math
from _lib import *

W, H = 800, 360
MU = 398600.4418            # km³/s², Earth (WGS-84)
RE = 6371.0
R1 = 6678.0                 # docs/EQUATIONS.md §1.9 (equatorial radius 6,378 km + 300 km)
R2 = 42164.0                # geostationary radius
A = (R1 + R2) / 2
E = (R2 - R1) / (R2 + R1)
V1 = math.sqrt(MU / R1)
VP = math.sqrt(MU * (2 / R1 - 1 / A))
VA = math.sqrt(MU * (2 / R2 - 1 / A))
V2 = math.sqrt(MU / R2)
DV1, DV2 = VP - V1, V2 - VA
TH = math.pi * math.sqrt(A ** 3 / MU)            # s, half the transfer period
T1 = 2 * math.pi * math.sqrt(R1 ** 3 / MU)       # s, LEO period
T2 = 2 * math.pi * math.sqrt(R2 ** 3 / MU)       # s, GEO period

K = 45 * 60                 # 1 s of animation = 45 min
GEO_FRAC = 0.125            # show 1/8 of a GEO orbit after arrival
T_IN, T_BURN, T_OUT = 0.6, 0.5, 1.4
D_LEO, D_TR, D_GEO = T1 / K, TH / K, GEO_FRAC * T2 / K
DUR = T_IN + D_LEO + T_BURN + D_TR + T_BURN + D_GEO + T_OUT

CX, CY, PX = 214, 199, 127 / R2      # Earth centre and px per km (GEO radius 132 px)


def P(r, th):
    return CX + r * PX * math.cos(th), CY - r * PX * math.sin(th)


def ell(Ea):
    b = A * math.sqrt(1 - E * E)
    x, y = A * (math.cos(Ea) - E), b * math.sin(Ea)
    return CX + x * PX, CY - y * PX


def build():
    css, body = [], []
    body.append(card(W, H, seed=22, nstars=70))
    body.append(header(28, 36, "ORBIT LAB · HOHMANN TRANSFER, 1925", "Two burns from low orbit to geostationary"))

    # timeline in seconds → fractions
    t0 = T_IN
    tb1 = t0 + D_LEO                  # burn 1 starts
    tt0 = tb1 + T_BURN                # transfer starts
    tb2 = tt0 + D_TR                  # burn 2 starts
    tg0 = tb2 + T_BURN
    tg1 = tg0 + D_GEO
    fr = lambda s: s / DUR

    # ---------- orbits ----------
    b = A * math.sqrt(1 - E * E)
    ecx = CX - A * E * PX
    body.append(f'<circle cx="{CX}" cy="{CY}" r="{f(R2 * PX, 2)}" fill="none" stroke="{SOL}" stroke-width="1.4" stroke-dasharray="3 4" opacity=".75"/>')
    body.append(f'<ellipse cx="{f(ecx, 2)}" cy="{CY}" rx="{f(A * PX, 2)}" ry="{f(b * PX, 2)}" fill="none" stroke="{NEBULA}" stroke-width="1.2" stroke-dasharray="2 5" opacity=".55"/>')
    body.append(f'<defs><radialGradient id="earth" cx=".38" cy=".35" r=".75"><stop offset="0" stop-color="#bfe6ff"/>'
                f'<stop offset=".45" stop-color="#3f8fe0"/><stop offset="1" stop-color="#0d2a5c"/></radialGradient>'
                f'<radialGradient id="flash"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="{SOL}"/>'
                f'<stop offset="1" stop-color="{FLAME}" stop-opacity="0"/></radialGradient></defs>')
    body.append(f'<circle cx="{CX}" cy="{CY}" r="{f(RE * PX, 2)}" fill="url(#earth)"/>')
    body.append(f'<circle cx="{CX}" cy="{CY}" r="{f(R1 * PX, 2)}" fill="none" stroke="{ICE}" stroke-width="1.2"/>')

    # highlighted transfer half (draws as the craft flies)
    pts = [ell(math.pi * i / 160) for i in range(161)]
    cum = [0.0]
    for i in range(160):
        cum.append(cum[-1] + math.dist(pts[i], pts[i + 1]))
    L = cum[-1]
    body.append('<path class="trl" d="M' + "L".join(f"{f(x, 1)} {f(y, 1)}" for x, y in pts)
                + f'" fill="none" stroke="{NEBULA}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="{f(L, 1)} {f(L + 10, 1)}"/>')
    # GEO arc highlight
    gpts = [P(R2, math.pi + 2 * math.pi * GEO_FRAC * i / 40) for i in range(41)]
    GL = sum(math.dist(gpts[i], gpts[i + 1]) for i in range(40))
    body.append('<path class="gl" d="M' + "L".join(f"{f(x, 1)} {f(y, 1)}" for x, y in gpts)
                + f'" fill="none" stroke="{SOL}" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="{f(GL, 1)} {f(GL + 10, 1)}"/>')

    # ---------- craft motion (uniform time samples; Kepler's equation on the ellipse) ----------
    craft = []
    def add(ts, x, y):
        craft.append((fr(ts), f"transform:{tr(x, y)}"))
    n = 24
    for i in range(n + 1):
        add(t0 + D_LEO * i / n, *P(R1, 2 * math.pi * i / n))
    add(tt0, *P(R1, 0))
    trl = [(0, f"stroke-dashoffset:{f(L, 1)}"), (fr(tt0), f"stroke-dashoffset:{f(L, 1)}")]
    n = 90
    for i in range(1, n + 1):
        M = math.pi * i / n
        Ea = kepler_E(M, E)
        ts = tt0 + D_TR * i / n
        add(ts, *ell(Ea))
        # arc length at Ea
        k = min(159, int(Ea / math.pi * 160))
        u = Ea / math.pi * 160 - k
        s = cum[k] + u * (cum[k + 1] - cum[k])
        trl.append((fr(ts), f"stroke-dashoffset:{f(L - s, 1)}"))
    add(tg0, *P(R2, math.pi))
    gl = [(0, f"stroke-dashoffset:{f(GL, 1)}"), (fr(tg0), f"stroke-dashoffset:{f(GL, 1)}")]
    n = 16
    for i in range(1, n + 1):
        ts = tg0 + D_GEO * i / n
        add(ts, *P(R2, math.pi + 2 * math.pi * GEO_FRAC * i / n))
        gl.append((fr(ts), f"stroke-dashoffset:{f(GL * (1 - i / n), 1)}"))
    craft.insert(0, (0, craft[0][1]))
    craft.append((1, craft[-1][1]))
    trl += [(fr(DUR - 0.35), "stroke-dashoffset:0"), (1, "stroke-dashoffset:0")]
    gl += [(fr(DUR - 0.35), "stroke-dashoffset:0"), (1, "stroke-dashoffset:0")]
    fx, fy = P(R2, math.pi + 2 * math.pi * GEO_FRAC)
    body.append(f'<g class="craft" transform="translate({f(fx, 2)} {f(fy, 2)})"><circle r="7" fill="{ICE}" opacity=".25"/>'
                f'<circle r="3.4" fill="#fff"/></g>')
    css.append(".craft{transform:" + tr(fx, fy) + "}")
    seam = [(0, 0), (fr(T_IN * .8), 1), (fr(DUR - 0.5), 1), (fr(DUR - 0.1), 0), (1, 0)]
    css.append(kf("craft", with_fade(craft, seam)) + anim(".craft", "craft", DUR))
    css.append(kf("trl", with_fade(trl, seam)) + anim(".trl", "trl", DUR))
    css.append(kf("gl", with_fade(gl, seam)) + anim(".gl", "gl", DUR))
    # burn flashes
    for i, (ts, (x, y)) in enumerate([(tb1, P(R1, 0)), (tb2, P(R2, math.pi))]):
        cls = f"fl{i}"
        body.append(f'<circle class="{cls}" cx="{f(x, 1)}" cy="{f(y, 1)}" r="16" fill="url(#flash)"/>')
        css.append(f".{cls}{{opacity:0;transform-box:fill-box;transform-origin:50% 50%}}")
        css.append(kf(cls, [(0, "opacity:0;transform:scale(.2)"), (fr(ts), "opacity:0;transform:scale(.2)"),
                            (fr(ts + 0.12), "opacity:1;transform:scale(1.3)"), (fr(ts + T_BURN), "opacity:.9;transform:scale(1)"),
                            (fr(ts + T_BURN + 0.45), "opacity:0;transform:scale(1.8)"), (1, "opacity:0;transform:scale(.2)")]))
        css.append(anim("." + cls, cls, DUR))

    # orbit labels (static)
    lx, ly = P(R1, -0.9)
    body.append(text(CX + 30, CY + 40, "LEO 300 km", 11, ICE, "s"))
    body.append(f'<path d="M{CX + 28} {CY + 36}L{f(lx + 2)} {f(ly)}" stroke="{ICE}" opacity=".6"/>')
    gx, gy = P(R2, 0.62)
    body.append(text(gx + 8, gy - 4, "GEO 35,786 km", 11, SOL, "s"))
    body.append(text(CX - 40, CY - 60, "transfer ellipse", 11, NEBULA, "s", "middle"))
    px_, py_ = P(R1, 0)
    body.append(text(px_ + 10, py_ + 4, "perigee", 10.5, MUTED))
    ax_, ay_ = P(R2, math.pi)
    body.append(text(ax_ + 8, ay_ + 4, "apogee", 10.5, MUTED))

    # ---------- right-hand panel ----------
    X = 392
    rows = [
        (tb1, FLAME, "①", f"Δv₁ = {DV1:.2f} km/s", f"burn prograde in LEO: {V1:.2f} → {VP:.2f} km/s"),
        (tt0, NEBULA, "②", f"coast {TH / 3600:.1f} h", f"half an ellipse; Kepler slows it to {VA:.2f} km/s"),
        (tb2, PLASMA, "③", f"Δv₂ = {DV2:.2f} km/s", f"burn at apogee: {VA:.2f} → {V2:.2f} km/s, circular"),
    ]
    y = 102
    for i, (ts, c, num, big, small) in enumerate(rows):
        cls = f"r{i}"
        body.append(f'<g class="{cls}"><circle cx="{X + 11}" cy="{y - 5}" r="11" fill="none" stroke="{c}" stroke-width="1.5"/>'
                    + text(X + 11, y, num[0] if False else str(i + 1), 12, c, "m", "middle", 700)
                    + text(X + 32, y, big, 17, c, "m", weight=700)
                    + text(X + 32, y + 19, small, 12, TEXT2) + "</g>")
        css.append(f".{cls}{{opacity:1}}")
        css.append(kf(cls, [(0, "opacity:.28"), (fr(ts), "opacity:.28"), (fr(ts + 0.25), "opacity:1"),
                            (fr(DUR - 0.5), "opacity:1"), (fr(DUR - 0.1), "opacity:.28"), (1, "opacity:.28")]))
        css.append(anim("." + cls, cls, DUR))
        y += 56
    # Δv budget bar
    by, bx0, bx1 = 286, X, 772
    tot = DV1 + DV2
    sc = (bx1 - bx0) / 4.0
    body.append(f'<rect x="{bx0}" y="{by}" width="{bx1 - bx0}" height="12" rx="6" fill="#0e1430" stroke="#252e55"/>')
    for v in (1, 2, 3):
        body.append(f'<line x1="{f(bx0 + v * sc)}" y1="{by + 14}" x2="{f(bx0 + v * sc)}" y2="{by + 18}" stroke="{MUTED}"/>')
        body.append(text(bx0 + v * sc, by + 29, f"{v}", 10, MUTED, "m", "middle"))
    body.append(text(bx0, by + 29, "0", 10, MUTED, "m", "middle"))
    body.append(text(bx1, by + 29, "4 km/s", 10, MUTED, "m", "end"))
    body.append(f'<rect class="b1" x="{bx0}" y="{by}" width="{f(DV1 * sc, 1)}" height="12" rx="6" fill="{FLAME}"/>')
    body.append(f'<rect class="b2" x="{f(bx0 + DV1 * sc, 1)}" y="{by}" width="{f(DV2 * sc, 1)}" height="12" rx="6" fill="{PLASMA}"/>')
    for cls, ts in (("b1", tb1), ("b2", tb2)):
        css.append(f".{cls}{{transform-box:fill-box;transform-origin:0 50%}}")
        css.append(kf(cls, [(0, "transform:scaleX(0)"), (fr(ts), "transform:scaleX(0)"), (fr(ts + T_BURN), "transform:scaleX(1)"),
                            (fr(DUR - 0.3), "transform:scaleX(1)"), (fr(DUR - 0.05), "transform:scaleX(0)"), (1, "transform:scaleX(0)")]))
        css.append(anim("." + cls, cls, DUR))
    body.append(text(X, by - 10, "Δv budget", 12, TEXT2, weight=600))
    body.append(text(bx1, by - 9, f"total {tot:.2f} km/s", 14, TEXT, "m", "end", 700))
    body.append(text(28, 344, f"Radii to scale: {R1:,.0f} km vs {R2:,.0f} km (×{R2 / R1:.2f}). Timing is Kepler-true; 1 s of animation ≈ 45 min.", 11, MUTED))

    desc = (
        "Animated Hohmann transfer from a 300 km low Earth orbit (LEO) to geostationary orbit (GEO). "
        "Orbit radii and Earth are drawn to the true scale (r₁ = 6,678 km, r₂ = 42,164 km, ratio 6.31; Earth 6,371 km). "
        f"μ = 398,600.4418 km³/s². Circular LEO speed √(μ/r₁) = {V1:.3f} km/s; transfer ellipse a = {A:,.0f} km, e = {E:.4f}; "
        f"perigee speed {VP:.3f} km/s so Δv₁ = {DV1:.3f} km/s; apogee speed {VA:.3f} km/s, GEO speed {V2:.3f} km/s so "
        f"Δv₂ = {DV2:.3f} km/s; total {DV1 + DV2:.3f} km/s. Transfer time π√(a³/μ) = {TH:,.0f} s = {TH / 3600:.2f} h. "
        f"LEO period {T1 / 60:.1f} min, GEO period {T2 / 3600:.2f} h. The craft's position on the ellipse is sampled at equal "
        "time steps from Kepler's equation M = E − e·sin E, so it visibly slows towards apogee; 1 s of animation = 45 min. "
        "Source: docs/EQUATIONS.md §1.9 (result 3.893 km/s = 2.43 + 1.47 km/s, 5.3 h coast). Plane change ignored."
    )
    svg(W, H, "Hohmann transfer: low Earth orbit to geostationary orbit", desc, "".join(body), "".join(css), name="hohmann.svg")
    print(f"    dv1 {DV1:.4f} dv2 {DV2:.4f} tot {DV1 + DV2:.4f} TH {TH / 3600:.3f} h, loop {DUR:.1f} s")


if __name__ == "__main__":
    build()
