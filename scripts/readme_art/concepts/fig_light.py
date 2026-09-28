"""4. light-speed.svg — how long sunlight takes to reach each planet (log axis), plus Earth–Moon in real time."""
import math
from _lib import *

W, H = 1000, 300
C = 299792.458                    # km/s
# mean distance from the Sun = semi-major axis, 10⁶ km (NASA NSSDCA planetary fact sheet)
PLANETS = [
    ("Mercury", 57.9, "#b8b0a6"), ("Venus", 108.2, "#e8c889"), ("Earth", 149.598, "#6fb4ff"),
    ("Mars", 228.0, "#ff7a4d"), ("Jupiter", 778.5, "#e3b98b"), ("Saturn", 1432.0, "#f0d7a1"),
    ("Uranus", 2867.0, "#9fe3ea"), ("Neptune", 4515.0, "#5b8cff"),
]
AU = 149.5978707
MOON_KM = 384400.0
DUR = 12.0
XS, X1 = 118, 948
LMIN, LMAX = math.log10(0.25), math.log10(40)
Y = 142
T0, T1 = 0.05, 0.80               # pulse leaves the Sun … reaches the right edge


def xau(au):
    return XS + (math.log10(au) - LMIN) / (LMAX - LMIN) * (X1 - XS)


def fmt_t(s):
    if s < 60:
        return f"{s:.1f} s"
    if s < 3600:
        m, r = divmod(round(s), 60)
        return f"{m} min {r:02d} s"
    h, r = divmod(round(s / 60), 60)
    return f"{h} h {r:02d} min"


def build():
    css, body = [], []
    body.append(card(W, H, seed=44, nstars=90))
    body.append(header(28, 34, "SPEED OF LIGHT · c = 299,792 km/s", "How long light takes to get there", size=21))
    body.append(text(972, 277, "sped up · log scale", 12.5, MUTED, anchor="end"))

    # Sun at the left edge
    body.append(f'<defs><radialGradient id="sun" cx="0" cy=".5" r="1"><stop offset="0" stop-color="#fff7da"/>'
                f'<stop offset=".35" stop-color="{SOL}"/><stop offset=".7" stop-color="{FLAME}" stop-opacity=".35"/>'
                f'<stop offset="1" stop-color="{FLAME}" stop-opacity="0"/></radialGradient>'
                f'<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="{SOL}" stop-opacity="0"/>'
                f'<stop offset=".85" stop-color="#fff3c4" stop-opacity=".9"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>')
    body.append(f'<circle cx="18" cy="{Y}" r="92" fill="url(#sun)"/><circle cx="4" cy="{Y}" r="44" fill="#ffe9a8"/>')
    body.append(text(30, Y + 70, "Sun", 14, SOL, weight=700))

    # axis + decade ticks
    body.append(f'<line x1="{XS - 20}" y1="{Y}" x2="{X1 + 8}" y2="{Y}" stroke="#39436e" stroke-width="1.5"/>')
    for au, lab in ((0.3, "0.3 AU"), (1, "1 AU"), (3, "3 AU"), (10, "10 AU"), (30, "30 AU")):
        x = xau(au)
        body.append(f'<line x1="{f(x)}" y1="{Y - 4}" x2="{f(x)}" y2="{Y + 4}" stroke="{FAINT}"/>')
        body.append(text(x, Y + 82, lab, 11.5, FAINT, "m", "middle"))
        body.append(f'<line x1="{f(x)}" y1="{Y + 8}" x2="{f(x)}" y2="{Y + 70}" stroke="{FAINT}" stroke-opacity=".35" stroke-dasharray="1 4"/>')

    # the pulse
    stops = [(0, f"transform:translateX({XS - 60}px);opacity:0"), (T0, f"transform:translateX({XS - 20}px);opacity:1"),
             (T1, f"transform:translateX({X1 + 10}px);opacity:1"), (T1 + 0.02, f"transform:translateX({X1 + 30}px);opacity:0"),
             (1, f"transform:translateX({X1 + 30}px);opacity:0")]
    body.append(f'<g class="pulse"><rect x="-120" y="{Y - 2.5}" width="120" height="5" rx="2.5" fill="url(#beam)"/>'
                f'<circle cx="0" cy="{Y}" r="9" fill="#fff" opacity=".25"/><circle cx="0" cy="{Y}" r="4" fill="#fff"/></g>')
    css.append(".pulse{opacity:0}" + kf("pulse", stops) + anim(".pulse", "pulse", DUR))

    def arrive(x):
        return T0 + (x - (XS - 20)) / ((X1 + 10) - (XS - 20)) * (T1 - T0)

    arrivals = []
    for i, (name, dm, col) in enumerate(PLANETS):
        au = dm / AU
        x = xau(au)
        s = dm * 1e6 / C
        ta = arrive(x)
        arrivals.append((ta, name, s, col))
        up = i % 2 == 0
        r = 5.5 if name in ("Jupiter", "Saturn") else 4.5
        body.append(f'<circle cx="{f(x)}" cy="{Y}" r="{r}" fill="{col}"/>')
        body.append(text(x, Y - (16 if up else 36), name, 14, TEXT2, anchor="middle", weight=600))
        if not up:
            body.append(f'<line x1="{f(x)}" y1="{Y - 31}" x2="{f(x)}" y2="{Y - 9}" stroke="{col}" stroke-opacity=".35"/>')
        cls = f"p{i}"
        body.append(f'<g class="{cls}"><circle cx="{f(x)}" cy="{Y}" r="11" fill="none" stroke="{col}" stroke-width="2"/>'
                    + (f'<line x1="{f(x)}" y1="{Y + 12}" x2="{f(x)}" y2="{Y + 35}" stroke="{col}" stroke-opacity=".5"/>' if not up else "")
                    + text(x, Y + (27 if up else 50), fmt_t(s), 13.5, col, "m", "middle", 700) + "</g>")
        css.append(kf(cls, [(0, "opacity:0"), (ta, "opacity:0"), (ta + 0.01, "opacity:1"), (0.95, "opacity:1"), (0.985, "opacity:0"), (1, "opacity:0")])
                   + anim("." + cls, cls, DUR))
    # static (reduced-motion) frame: everything arrived
    css.append("".join(f".p{i}{{opacity:1}}" for i in range(len(PLANETS))))

    # a note beyond Neptune
    body.append(text(X1 + 20, Y + 104, "nearest star, Proxima Centauri: 4.2 years →", 12.5, TEXT2, anchor="end"))

    # Earth → Moon, real time
    bx, by = 150, 272
    span = 220
    body.append(text(28, by + 5, "Earth → Moon", 13, TEXT, weight=700))
    body.append(f'<circle cx="{bx}" cy="{by}" r="4.5" fill="#6fb4ff"/><circle cx="{bx + span}" cy="{by}" r="2.2" fill="#d9d6cf"/>')
    body.append(f'<line x1="{bx + 6}" y1="{by}" x2="{bx + span - 4}" y2="{by}" stroke="#2c3560" stroke-dasharray="2 4"/>')
    tm = MOON_KM / C
    body.append(f'<circle class="mp" cx="0" cy="{by}" r="3" fill="#fff"/>')
    css.append(".mp{transform:translateX(" + f"{bx + span - 3}px)" + "}"
               + kf("mp", [(0, f"transform:translateX({bx + 5}px)"), (0.5, f"transform:translateX({bx + span - 3}px)"), (1, f"transform:translateX({bx + 5}px)")])
               + anim(".mp", "mp", 2 * tm))
    body.append(text(bx + span + 14, by + 5, f"{tm:.2f} s one way · this dot moves in real time (there and back {2 * tm:.2f} s)", 13, TEXT2))

    # big readout (upper right), one text per leg
    RX, RY = 972, 42
    legs = [(0, "Sun", 0.0, SOL)] + arrivals
    for i, (ta, name, s, col) in enumerate(legs):
        t_end = legs[i + 1][0] if i + 1 < len(legs) else 0.95
        cls = f"rd{i}"
        lab = "light leaves the Sun" if i == 0 else f"reaches {name} after"
        body.append(f'<g class="{cls}">' + text(RX, RY, lab, 13, MUTED, anchor="end")
                    + (text(RX, RY + 24, fmt_t(s), 22, col, "m", "end", 700) if i else "") + "</g>")
        if i < len(legs) - 1:
            css.append(f".{cls}{{opacity:0}}")
            st = [(0, "opacity:0"), (ta, "opacity:0"), (ta + 0.003, "opacity:1"), (t_end, "opacity:1"), (t_end + 0.003, "opacity:0"), (1, "opacity:0")]
            if i == 0:
                st = [(0, "opacity:1"), (t_end, "opacity:1"), (t_end + 0.003, "opacity:0"), (1, "opacity:0")]
        else:
            st = [(0, "opacity:0"), (ta, "opacity:0"), (ta + 0.003, "opacity:1"), (0.95, "opacity:1"), (0.985, "opacity:0"), (1, "opacity:0")]
        css.append(kf(cls, st) + anim("." + cls, cls, DUR))

    rows = "; ".join(f"{n} {d:,.1f}×10⁶ km → {fmt_t(d * 1e6 / C)}" for n, d, _ in PLANETS)
    desc = (
        "Animated log-scale diagram: a pulse of light leaves the Sun and passes each planet; each planet's light-time "
        "appears as the pulse arrives. The animation is sped up and the distance axis is logarithmic. "
        "Light-time = mean distance (semi-major axis, NASA NSSDCA planetary fact sheets) ÷ c, c = 299,792.458 km/s: "
        + rows + ". Earth at 1 AU = 149,597,870.7 km → 499.0 s = 8 min 19 s; Mars 12.7 min on average. "
        "Proxima Centauri is 4.24 light-years away. Earth → Moon: 384,400 km ÷ c = 1.28 s (round trip 2.56 s, as timed by "
        "lunar laser ranging); that dot moves in real time."
    )
    svg(W, H, "How long light takes to reach the planets", desc, "".join(body), "".join(css), name="light-speed.svg")


if __name__ == "__main__":
    build()
