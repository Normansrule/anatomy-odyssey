"""11. scale-ladder.svg — a log ruler from 10⁻¹⁵ m to 10²⁷ m sliding past a fixed cursor."""
import math
from _lib import *

W, H = 1000, 220
PD = 110.0                    # px per decade
E0, E1 = -15, 27
CUR = 500                     # cursor x
YR = 176                      # ruler baseline
T_HOLD0, T_FWD, T_HOLD1, T_BACK, T_HOLD2 = 1.2, 15.0, 1.6, 5.0, 0.4
DUR = T_HOLD0 + T_FWD + T_HOLD1 + T_BACK + T_HOLD2
SUP = str.maketrans("-0123456789", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹")

# (label, size in m, size text, icon kind) — sizes from site/data/scale.json
OBJ = [
    ("proton", 1.681e-15, "1.7 fm", "proton"),
    ("hydrogen atom", 1.058e-10, "0.1 nm", "atom"),
    ("red blood cell", 7.8e-6, "7.8 µm", "cell"),
    ("you", 1.7, "1.7 m", "human"),
    ("Saturn V", 110.6, "111 m", "rocket"),
    ("Earth", 1.2742e7, "12,742 km", "earth"),
    ("the Sun", 1.3914e9, "1.39 million km", "sun"),
    ("1 AU", 1.495978707e11, "Earth–Sun, 150 million km", "au"),
    ("1 light-year", 9.4607304725808e15, "9.46 trillion km", "ly"),
    ("Milky Way", 9.46e20, "100,000 light-years", "galaxy"),
    ("observable universe", 8.8e26, "93 billion light-years", "universe"),
]


def X(e):
    return (e - E0) * PD


def icon(kind):
    if kind == "proton":
        return (f'<circle r="13" fill="{PLASMA}" fill-opacity=".25" stroke="{PLASMA}"/>'
                f'<circle cx="-4" cy="-3" r="3" fill="{PLASMA}"/><circle cx="4" cy="-3" r="3" fill="{ICE}"/><circle cx="0" cy="4" r="3" fill="{SOL}"/>')
    if kind == "atom":
        return (f'<ellipse rx="16" ry="6" fill="none" stroke="{ICE}" transform="rotate(30)"/>'
                f'<ellipse rx="16" ry="6" fill="none" stroke="{ICE}" transform="rotate(-30)"/><circle r="3" fill="{PLASMA}"/>')
    if kind == "cell":
        return '<ellipse rx="16" ry="12" fill="#c0392b"/><ellipse rx="8" ry="5.5" fill="#e0675a"/>'
    if kind == "human":
        return (f'<circle cy="-13" r="4" fill="{SOL}"/><path d="M0 -8V5M0 5l-5 11M0 5l5 11M-7 -3H7" stroke="{SOL}" stroke-width="2.6" stroke-linecap="round" fill="none"/>')
    if kind == "rocket":
        return ('<rect x="-3.5" y="-14" width="7" height="26" fill="#eef1fb"/><path d="M-3.5 -14L0 -20L3.5 -14Z" fill="#c9cfe6"/>'
                '<rect x="-3.5" y="-2" width="7" height="2" fill="#141826"/><path d="M-3.5 12l-3 5h13l-3-5z" fill="#9aa4c8"/>')
    if kind == "earth":
        return ('<circle r="15" fill="#2f6fc2"/><path d="M-9 -6q5 -6 10 -2t3 7q-6 3 -9 -1t-4 -4zM4 5q6 -1 7 4t-6 3z" fill="#4caf6a"/>'
                '<circle r="15" fill="none" stroke="#9fd0ff" stroke-opacity=".6"/>')
    if kind == "sun":
        return f'<circle r="20" fill="{FLAME}" opacity=".25"/><circle r="14" fill="{SOL}"/>'
    if kind == "au":
        return (f'<circle cx="-16" r="6" fill="{SOL}"/><circle cx="16" r="2.5" fill="#6fb4ff"/>'
                f'<path d="M-9 0H13" stroke="{TEXT2}" stroke-dasharray="2 2"/>')
    if kind == "ly":
        return (f'<path d="M-18 0H14" stroke="#fff3c4" stroke-width="2.5"/><path d="M10 -5L18 0L10 5" fill="none" stroke="#fff3c4" stroke-width="2"/>'
                f'<circle cx="-18" r="3" fill="#fff"/>')
    if kind == "galaxy":
        return (f'<ellipse rx="18" ry="7" fill="{NEBULA}" opacity=".25"/><path d="M0 0c6 -1 10 3 6 6s-16 1 -16 -5s12 -9 19 -3" fill="none" stroke="{NEBULA}" stroke-width="2"/>'
                '<circle r="2.5" fill="#fff4d6"/>')
    if kind == "universe":
        import random
        rng = random.Random(3)
        dots = "".join(f'<circle cx="{f((rng.random() - .5) * 26)}" cy="{f((rng.random() - .5) * 26)}" r=".9" fill="{ICE}"/>' for _ in range(22))
        return f'<circle r="16" fill="#1b1540" stroke="{NEBULA}"/>{dots}'
    return ""


def build():
    css, body = [], []
    body.append(card(W, H, seed=111, nstars=50))

    # ---------- the sliding ruler ----------
    g = [f'<line x1="{f(X(E0) - 40)}" y1="{YR}" x2="{f(X(E1) + 40)}" y2="{YR}" stroke="#46507a" stroke-width="1.5"/>']
    for e in range(E0, E1 + 1):
        x = X(e)
        g.append(f'<line x1="{f(x)}" y1="{YR - 9}" x2="{f(x)}" y2="{YR + 5}" stroke="{TEXT2}" stroke-width="1.3"/>')
        g.append(text(x, YR + 20, f"10{str(e).translate(SUP)}", 12, MUTED, "m", "middle"))
        if e < E1:
            for k in range(2, 10):
                xm = x + math.log10(k) * PD
                g.append(f'<line x1="{f(xm)}" y1="{YR - 4}" x2="{f(xm)}" y2="{YR}" stroke="{FAINT}"/>')
    for name, size, stext, kind in OBJ:
        x = X(math.log10(size))
        col = SOL if kind == "human" else TEXT
        g.append(f'<line x1="{f(x)}" y1="{YR - 30}" x2="{f(x)}" y2="{YR - 1}" stroke="{col}" stroke-opacity=".35" stroke-dasharray="1 3"/>')
        g.append(f'<circle cx="{f(x)}" cy="{YR}" r="3" fill="{col}"/>')
        g.append(f'<g transform="translate({f(x)} 104)">{icon(kind)}</g>')
        g.append(text(x, 140, name, 12.5, col, anchor="middle", weight=700))
        g.append(text(x, 154, stext, 11, TEXT2, anchor="middle"))
    xh = X(math.log10(1.7))
    g.append(f'<g transform="translate({f(xh)} 72)"><rect x="-38" y="-10" width="76" height="17" rx="8.5" fill="{SOL}"/>'
             + text(0, 3, "YOU ARE HERE", 9.5, "#1a1200", "m", "middle", 800) + f'<path d="M-4 7L0 12L4 7Z" fill="{SOL}"/></g>')
    body.append(f'<defs><clipPath id="rc"><rect x="1" y="60" width="{W - 2}" height="{H - 61}"/></clipPath>'
                f'<linearGradient id="edge" x1="0" x2="1"><stop offset="0" stop-color="#070a14"/><stop offset=".1" stop-color="#070a14" stop-opacity="0"/>'
                f'<stop offset=".9" stop-color="#070a14" stop-opacity="0"/><stop offset="1" stop-color="#070a14"/></linearGradient></defs>')
    body.append(f'<g clip-path="url(#rc)"><g class="ruler">{"".join(g)}</g></g>')
    body.append(f'<rect x="1" y="1" width="{W - 2}" height="{H - 2}" fill="url(#edge)" clip-path="url(#cclip)"/>')
    body.append(header(28, 28, "COSMIC SCALE · 42 POWERS OF TEN", "From a proton to the observable universe", size=18))

    fr = lambda s: s / DUR
    ta, tb = T_HOLD0, T_HOLD0 + T_FWD
    tc, td = tb + T_HOLD1, tb + T_HOLD1 + T_BACK
    off = lambda e: CUR - X(e)
    st = [(0, off(E0)), (fr(ta), off(E0)), (fr(tb), off(E1)), (fr(tc), off(E1)), (fr(td), off(E0)), (1, off(E0))]
    css.append(".ruler{transform:translateX(" + f(off(math.log10(1.7)), 1) + "px)}"
               + kf("ruler", [(t, f"transform:translateX({f(o, 1)}px)") for t, o in st]) + anim(".ruler", "ruler", DUR))

    # ---------- fixed cursor + power-of-ten counter ----------
    body.append(f'<line x1="{CUR}" y1="66" x2="{CUR}" y2="{YR + 26}" stroke="{ICE}" stroke-width="1.5" stroke-opacity=".8"/>')
    body.append(f'<path d="M{CUR - 6} {YR + 30}L{CUR} {YR + 24}L{CUR + 6} {YR + 30}Z" fill="{ICE}"/>')
    RX, RY = CUR, 30
    body.append(text(RX + 64, RY + 12, "← at the cursor", 11, MUTED, "s"))
    dh = 26
    vals, kts = [], []
    for e in range(E0, E1 + 1):
        t = ta if e == E0 else ta + (e - 0.5 - E0) / (E1 - E0) * T_FWD
        vals.append(e); kts.append(0 if e == E0 else fr(t))
    for e in range(E1 - 1, E0 - 1, -1):
        t = tc + (E1 - (e + 0.5)) / (E1 - E0) * T_BACK
        vals.append(e); kts.append(fr(t))
    strip = "".join(text(RX, RY + 17 + (e - E0) * dh, f"10{str(e).translate(SUP)} m", 22, TEXT, "m", "middle", 700) for e in range(E0, E1 + 1))
    body.append(f'<defs><clipPath id="cc"><rect x="{RX - 60}" y="{RY - 2}" width="120" height="{dh}"/></clipPath></defs>')
    body.append(f'<g class="smil" clip-path="url(#cc)"><g>{strip}<animateTransform attributeName="transform" type="translate" calcMode="discrete" '
                f'values="{";".join(f"0 {-(v - E0) * dh}" for v in vals)}" keyTimes="{keytimes(kts)}" dur="{f(DUR, 3)}s" repeatCount="indefinite"/></g></g>')
    body.append('<g class="still">' + text(RX, RY + 17, "10⁰ m", 22, TEXT, "m", "middle", 700) + "</g>")

    desc = (
        "Animated logarithmic ruler from 10⁻¹⁵ m to 10²⁷ m (42 powers of ten, 110 px per decade) sliding past a fixed "
        "cursor, with a counter showing the power of ten at the cursor; it zooms out over 15 s and back in over 5 s. "
        "Objects sit at the logarithm of their size (site/data/scale.json): proton 1.681 × 10⁻¹⁵ m, hydrogen atom "
        "1.058 × 10⁻¹⁰ m, red blood cell 7.8 µm, a person 1.7 m (marked 'you are here'), Saturn V 110.6 m, Earth "
        "12,742 km, the Sun 1.3914 × 10⁹ m, 1 AU 1.496 × 10¹¹ m, 1 light-year 9.461 × 10¹⁵ m, the Milky Way "
        "9.46 × 10²⁰ m (100,000 light-years), the observable universe 8.8 × 10²⁶ m (93 billion light-years)."
    )
    svg(W, H, "Cosmic scale: 42 powers of ten", desc, "".join(body), "".join(css), name="scale-ladder.svg")


if __name__ == "__main__":
    build()
