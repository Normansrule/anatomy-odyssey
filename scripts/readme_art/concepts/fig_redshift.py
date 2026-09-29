"""redshift.svg — absorption lines slide red as a galaxy recedes: λ_obs = λ_rest (1 + z), v ≈ cz, d ≈ v / H₀."""
from _lib import *

W, H = 800, 360
C = 299_792.458                      # km/s
H0 = 70.0                            # km/s/Mpc (round value; measurements span about 67-73)
LY_PER_MPC = 3.26156e6
# rest wavelengths in air, nm (NIST Atomic Spectra Database)
LINES = [("K", 393.37), ("H", 396.85), ("Hβ", 486.13), ("Mg", 517.27), ("Na", 589.29), ("Hα", 656.28)]
ZS = [0.0, 0.025, 0.05, 0.075, 0.10]
HOLD, MOVE = 1.8, 0.8
SEG = HOLD + MOVE
DUR = SEG * len(ZS)
STILL = 2
BX0, BX1, L0, L1 = 150, 770, 380.0, 750.0


def bx(lam):
    return BX0 + (lam - L0) / (L1 - L0) * (BX1 - BX0)


def rgb(lam):
    """Wavelength (nm) to an sRGB-ish colour (after Dan Bruton's approximation)."""
    if lam < 440:
        r, g, b = -(lam - 440) / 60, 0.0, 1.0
    elif lam < 490:
        r, g, b = 0.0, (lam - 440) / 50, 1.0
    elif lam < 510:
        r, g, b = 0.0, 1.0, -(lam - 510) / 20
    elif lam < 580:
        r, g, b = (lam - 510) / 70, 1.0, 0.0
    elif lam < 645:
        r, g, b = 1.0, -(lam - 645) / 65, 0.0
    else:
        r, g, b = 1.0, 0.0, 0.0
    fall = 0.35 + 0.65 * (lam - 380) / 40 if lam < 420 else (0.35 + 0.65 * (750 - lam) / 50 if lam > 700 else 1.0)
    return "#" + "".join(f"{int(255 * (max(0, c) * fall) ** 0.8):02x}" for c in (r, g, b))


def mpc(z):
    return C * z / H0


def build():
    css, body = [], []
    body.append(card(W, H, seed=83, nstars=60))
    body.append(header(28, 34, "REDSHIFT · λ_seen = λ_rest × (1 + z) · v ≈ cz", "Receding galaxies look redder", size=21))
    stops = "".join(f'<stop offset="{f((l - L0) / (L1 - L0), 3)}" stop-color="{rgb(l)}"/>' for l in range(380, 751, 10))
    body.append(f'<defs><linearGradient id="spec" x1="0" y1="0" x2="1" y2="0">{stops}</linearGradient>'
                '<radialGradient id="gx"><stop offset="0" stop-color="#fff6e0"/><stop offset=".25" stop-color="#ffd9a0" stop-opacity=".8"/>'
                f'<stop offset=".6" stop-color="{NEBULA}" stop-opacity=".35"/><stop offset="1" stop-color="{NEBULA}" stop-opacity="0"/></radialGradient></defs>')

    # observer and galaxy
    oy = 138
    body.append(f'<circle cx="46" cy="{oy}" r="5" fill="{ICE}"/>' + text(46, oy + 24, "you", 12, ICE, anchor="middle"))
    gal = ('<ellipse rx="34" ry="14" fill="url(#gx)"/>'
           '<path d="M-28 3Q-8 -14 8 -3Q18 5 30 -4M28 -3Q8 14 -8 3Q-18 -5 -30 4" fill="none" stroke="#e8dcff" stroke-opacity=".55" stroke-width="1.4"/>'
           '<circle r="3" fill="#fff"/>')
    st = []
    gx = lambda k: 130 + 55 * k
    gs = lambda k: 1 - 0.14 * k
    for k in range(len(ZS)):
        st += [(k * SEG / DUR, f"transform:{tr(gx(k), oy, sc=gs(k))};opacity:1"), ((k * SEG + HOLD) / DUR, f"transform:{tr(gx(k), oy, sc=gs(k))};opacity:1")]
    st += [(1 - MOVE / DUR / 2, f"transform:{tr(gx(len(ZS)), oy, sc=gs(len(ZS)))};opacity:0"),
           (1 - MOVE / DUR / 2 + .001, f"transform:{tr(gx(0) - 20, oy, sc=1.05)};opacity:0"), (1, f"transform:{tr(gx(0), oy, sc=1)};opacity:1")]
    css.append(kf("gal", st) + anim(".gal", "gal", DUR, "ease-in-out"))
    body.append(f'<g class="gal" style="transform:{tr(gx(STILL), oy, sc=gs(STILL))}">{gal}</g>')
    body.append(f'<path d="M66 {oy - 30}H{BX0 + 250}" stroke="{PLASMA}" stroke-opacity=".7" stroke-width="1.6"/>'
                f'<path d="M{BX0 + 250} {oy - 30}l-7 -4v8Z" fill="{PLASMA}"/>' + text(66, oy - 38, "moving away: its light is stretched", 12.5, PLASMA))

    # spectra
    ry, oy2, bh = 204, 264, 26
    for y, lab in ((ry, "laboratory"), (oy2, "this galaxy")):
        body.append(f'<rect x="{BX0}" y="{y}" width="{BX1 - BX0}" height="{bh}" rx="3" fill="url(#spec)"/>')
        body.append(text(BX0 - 12, y + 18, lab, 13, TEXT2, anchor="end"))
    for lam in (400, 500, 600, 700):
        body.append(f'<path d="M{f(bx(lam))} {oy2 + bh}v5" stroke="{FAINT}"/>' + text(bx(lam), oy2 + bh + 18, f"{lam} nm", 11.5, FAINT, "m", "middle"))
    for name, lam in LINES:
        x = bx(lam)
        body.append(f'<rect x="{f(x - 1.4)}" y="{ry}" width="2.8" height="{bh}" fill="#05060c"/>')
        if name in ("K", "Hβ", "Mg", "Na", "Hα"):
            body.append(text(x + (5 if name == "K" else 0), ry - 6, name if name != "K" else "H+K", 11.5, TEXT2, anchor="middle"))
        cls = "l" + str(LINES.index((name, lam)))
        st = []
        for k, z in enumerate(ZS):
            dx = f(bx(lam * (1 + z)) - x, 2)
            st += [(k * SEG / DUR, f"transform:translateX({dx}px)"), ((k * SEG + HOLD) / DUR, f"transform:translateX({dx}px)")]
        st.append((1, "transform:translateX(0)"))
        css.append(kf(cls, st) + anim("." + cls, cls, DUR, "ease-in-out"))
        dxs = f(bx(lam * (1 + ZS[STILL])) - x, 2)
        body.append(f'<g class="{cls}" style="transform:translateX({dxs}px)"><rect x="{f(x - 1.4)}" y="{oy2}" width="2.8" height="{bh}" fill="#05060c"/>'
                    f'<path d="M{f(x)} {oy2 - 3}V{oy2 - 9}" stroke="{TEXT2}" stroke-opacity=".6"/></g>')
        body.append(f'<path d="M{f(x)} {ry + bh + 3}V{ry + bh + 9}" stroke="{TEXT2}" stroke-opacity=".6"/>')

    # readouts (one group per z)
    RX = 772
    for k, z in enumerate(ZS):
        if z == 0:
            g = (text(RX, 84, "z = 0", 22, TEXT, "m", "end", 700) + text(RX, 108, "at rest: lines where the lab puts them", 12.5, TEXT2, anchor="end"))
        else:
            d = mpc(z)
            ly = d * LY_PER_MPC
            lys = f"{ly / 1e9:.2f} billion" if ly >= 1e9 else f"{ly / 1e6:.0f} million"
            g = (text(RX, 84, f"z = {z:.3f}", 22, PLASMA, "m", "end", 700)
                 + text(RX, 108, f"v ≈ cz ≈ {C * z:,.0f} km/s", 13.5, TEXT, "m", "end")
                 + text(RX, 128, f"d ≈ v / H₀ ≈ {d:,.0f} Mpc ({lys} light-years)", 12.5, TEXT2, anchor="end")
                 + text(RX, 148, f"Hα: 656.3 → {656.28 * (1 + z):.1f} nm", 12.5, SOL, "m", "end"))
        cls = f"r{k}"
        a = k * SEG / DUR
        b = (k * SEG + HOLD) / DUR
        if k == 0:
            stp = [(0, "opacity:1"), (b, "opacity:1"), (b + .01, "opacity:0"), (1 - .012, "opacity:0"), (1, "opacity:1")]
        else:
            stp = [(0, "opacity:0"), (a - .012, "opacity:0"), (a, "opacity:1"), (b, "opacity:1"), (b + .01, "opacity:0"), (1, "opacity:0")]
        css.append(f".{cls}{{opacity:{1 if k == STILL else 0}}}" + kf(cls, stp) + anim("." + cls, cls, DUR))
        body.append(f'<g class="{cls}">{g}</g>')
    body.append(text(RX, 344, f"H₀ = {H0:.0f} km/s per megaparsec · v ≈ cz holds for small z", 11.5, FAINT, anchor="end"))

    rows = "; ".join(f"z = {z}: v ≈ {C * z:,.0f} km/s, d ≈ {mpc(z):,.0f} Mpc, Hα at {656.28 * (1 + z):.1f} nm" for z in ZS[1:])
    desc = ("Animated redshift diagram. A galaxy moves away from the observer and shrinks; its absorption lines (calcium H and K at "
            "393.37 and 396.85 nm, hydrogen beta 486.13 nm, magnesium 517.27 nm, sodium D 589.29 nm, hydrogen alpha 656.28 nm; NIST) slide "
            "toward the red end of the spectrum compared with a laboratory spectrum, each by λ_rest × z. " + rows + ". "
            "Speeds use v ≈ cz (c = 299,792.458 km/s) and distances Hubble's law d = v/H₀ with H₀ = 70 km/s/Mpc; both are good "
            "approximations only for small z (at z = 0.1 the errors are a few per cent). 1 Mpc = 3.26 million light-years.")
    svg(W, H, "Redshift: spectral lines sliding red", desc, "".join(body), "".join(css), name="redshift.svg")


if __name__ == "__main__":
    build()
