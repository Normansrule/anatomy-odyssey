"""9. mars-edl.svg — Perseverance's seven minutes, and Earth hearing each event 11 min 22 s later."""
import json
import os
from _lib import *

W, H = 1000, 320
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = json.load(open(os.path.join(HERE, "..", "..", "..", "site", "data", "mars2020-edl.json"), encoding="utf-8"))
LT = DATA["light_time_s"]                    # 682 s
FL = DATA["flown"]
EV = {e["id"]: e["t"] for e in DATA["events"]}
V_EI = 5320                                  # m/s: entry interface "5.32 km/s" (events.ei.real)
K = 70.0                                     # real seconds per animation second
PRE, POST = 0.5, 2.6
T_END = FL["td_t"] + LT                      # Earth hears touchdown
DUR = PRE + T_END / K + POST
XA, XB, TSPAN = 170, 948, 420.0
YM, YE = 162, 266                            # Mars and Earth tracks


def x(t):
    return XA + t / TSPAN * (XB - XA)


def fr(t):
    return (PRE + t / K) / DUR


def mmss(t):
    m, s = divmod(int(round(t)), 60)
    return f"{m}:{s:02d}"


# (id, t, name, value line, row)
EVENTS = [
    ("ei", EV["ei"], "Entry", f"{V_EI:,} m/s · 128 km", 0),
    ("heat", EV["peakHeat"], "Plasma, 10.7 g", "≈1,300 °C shield", 1),
    ("chute", FL["chute_t"], "Parachute", f"{FL['chute_v']} m/s · Mach {FL['chute_mach']} · 12 km", 0),
    ("hs", FL["hs_t"], "Heat shield off", f"{FL['hs_v']} m/s", 1),
    ("pd", FL["bs_t"], "Powered descent", f"{FL['bs_v']} m/s · 2.1 km", 0),
    ("sky", EV["skyCrane"], "Sky crane", "0.75 m/s · 20 m", 1),
    ("td", FL["td_t"], "Touchdown", f"{FL['td_vz']} m/s", 0),
]


def glyph(kind):
    """Small spacecraft drawings centred on (0, 0), about 34 px tall."""
    cap = ('<path d="M-11 4Q0 11 11 4L6 -7H-6Z" fill="#d9dcea"/>'
           '<path d="M-12 4Q0 12 12 4" fill="none" stroke="#6b5a4a" stroke-width="3"/>')
    if kind == "ei":
        return cap
    if kind == "heat":
        return (f'<ellipse cx="0" cy="9" rx="17" ry="9" fill="{FLAME}" opacity=".45"/>'
                f'<ellipse cx="0" cy="8" rx="12" ry="5" fill="{SOL}" opacity=".7"/>' + cap)
    chute = ('<path d="M-16 -14Q0 -34 16 -14Z" fill="#f2f2f7" opacity=".92"/>'
             '<path d="M-16 -14Q0 -22 16 -14" fill="none" stroke="#c0392b" stroke-width="2"/>'
             '<path d="M-15 -14L-5 -2M15 -14L5 -2M0 -14V-2" stroke="#aab" stroke-width=".7"/>')
    back = '<path d="M-9 4L-5 -4H5L9 4Z" fill="#d9dcea"/>'
    if kind == "chute":
        return chute + '<g transform="translate(0 2)">' + cap + "</g>"
    if kind == "hs":
        return (chute + back + '<rect x="-5" y="4" width="10" height="4" fill="#9aa"/>'
                '<path d="M-10 18Q0 23 10 18" fill="none" stroke="#6b5a4a" stroke-width="3" opacity=".8"/>')
    ds = ('<rect x="-12" y="-6" width="24" height="6" rx="1.5" fill="#c9cfe6"/>'
          f'<path d="M-10 0l-2 8M10 0l2 8M-4 0l-1 7M4 0l1 7" stroke="{SOL}" stroke-width="2.4" opacity=".9"/>')
    rover = ('<rect x="-7" y="-4" width="14" height="5" rx="1" fill="#e4e7f2"/>'
             '<circle cx="-5" cy="3" r="2" fill="#555c7a"/><circle cx="0" cy="3" r="2" fill="#555c7a"/><circle cx="5" cy="3" r="2" fill="#555c7a"/>')
    if kind == "pd":
        return ds + f'<g transform="translate(0 6)">{rover}</g>'
    if kind == "sky":
        return ('<g transform="translate(0 -8)">' + ds + "</g>"
                '<path d="M-6 -8L-5 10M6 -8L5 10M0 -8V10" stroke="#aab" stroke-width=".8"/>'
                f'<g transform="translate(0 13)">{rover}</g>')
    if kind == "td":
        return (f'<g transform="translate(0 8)">{rover}</g>'
                '<path d="M-18 13H18" stroke="#b8643c" stroke-width="2"/>')
    return ""


def build():
    css, body = [], []
    body.append(card(W, H, seed=99, nstars=70))
    body.append(header(28, 34, "MARS 2020 · 18 FEBRUARY 2021 · JEZERO CRATER", "Perseverance's seven minutes", size=21))
    body.append(text(972, 34, f"one-way light time {mmss(LT)} (11 min 22 s)", 13, MUTED, anchor="end"))

    # tracks
    for y, lab, sub, col in ((YM, "MARS", "spacecraft", FLAME), (YE, "EARTH", "mission control", ICE)):
        body.append(f'<line x1="{XA - 8}" y1="{y}" x2="{XB + 8}" y2="{y}" stroke="#39436e" stroke-width="1.5"/>')
        body.append(text(28, y + 1, lab, 14, col, "m", weight=700))
        body.append(text(28, y + 17, sub, 11.5, MUTED))
    for t in range(0, 421, 60):
        body.append(f'<line x1="{f(x(t))}" y1="{YM - 3}" x2="{f(x(t))}" y2="{YM + 3}" stroke="{FAINT}"/>')
        body.append(f'<line x1="{f(x(t))}" y1="{YE - 3}" x2="{f(x(t))}" y2="{YE + 3}" stroke="{FAINT}"/>')
        body.append(text(x(t), YE + 20, f"E+{mmss(t + LT)}", 10.5, FAINT, "m", "middle"))
    body.append(text(28, YE + 38, "times after entry (E+), as seen on each world", 11, FAINT))
    body.append(text(28, (YM + YE) / 2 + 4, "radio ↓ 204 million km", 11.5, TEXT2))

    # event markers, labels, signals
    fade_end = [(1 - 0.04, None)]
    for i, (eid, t, name, val, row) in enumerate(EVENTS):
        xx = x(t)
        anc = {"td": "end", "sky": "end", "pd": "end", "ei": "start"}.get(eid, "middle")
        xl = {"td": 972, "sky": 972, "pd": xx + 6, "ei": xx - 6}.get(eid, xx)
        body.append(f'<circle cx="{f(xx)}" cy="{YM}" r="4" fill="#0b1020" stroke="{FLAME}" stroke-width="1.5"/>')
        body.append(f'<circle cx="{f(xx)}" cy="{YE}" r="4" fill="#0b1020" stroke="{ICE}" stroke-width="1.5"/>')
        cm, ce, sg = f"em{i}", f"ee{i}", f"sg{i}"
        yn = YM - (12 if row == 0 else 28)
        yv = YM + (20 if row == 0 else 36)
        body.append(f'<g class="{cm}"><circle cx="{f(xx)}" cy="{YM}" r="4.5" fill="{FLAME}"/>'
                    + (f'<line x1="{f(xx)}" y1="{YM - 22}" x2="{f(xx)}" y2="{YM - 6}" stroke="{FLAME}" stroke-opacity=".4"/>' if row else "")
                    + (f'<line x1="{f(xx)}" y1="{YM + 6}" x2="{f(xx)}" y2="{YM + 24}" stroke="{FLAME}" stroke-opacity=".4"/>' if row else "")
                    + text(xl, yn, name, 12.5, TEXT, anchor=anc, weight=700)
                    + text(xl, yv, val, 11.5, SOL, "m", anc) + "</g>")
        body.append(f'<g class="{ce}"><circle cx="{f(xx)}" cy="{YE}" r="4.5" fill="{ICE}"/><circle cx="{f(xx)}" cy="{YE}" r="9" fill="none" stroke="{ICE}" stroke-opacity=".5"/></g>')
        body.append(f'<g class="{sg}"><circle cx="{f(xx)}" cy="{YM + 46}" r="3" fill="#fff"/><circle cx="{f(xx)}" cy="{YM + 46}" r="6.5" fill="{ICE}" opacity=".3"/></g>')
        on = [(0, "opacity:0"), (fr(t), "opacity:0"), (fr(t) + 0.004, "opacity:1"), (1 - 0.03, "opacity:1"), (1 - 0.01, "opacity:0"), (1, "opacity:0")]
        css.append(kf(cm, on) + anim("." + cm, cm, DUR))
        on_e = [(0, "opacity:0"), (fr(t + LT), "opacity:0"), (fr(t + LT) + 0.004, "opacity:1"), (1 - 0.03, "opacity:1"), (1 - 0.01, "opacity:0"), (1, "opacity:0")]
        css.append(kf(ce, on_e) + anim("." + ce, ce, DUR))
        dy = YE - (YM + 46)   # signals start below the value labels
        sgk = [(0, "transform:translateY(0px);opacity:0"), (fr(t), "transform:translateY(0px);opacity:0"),
               (fr(t) + 0.003, "transform:translateY(0px);opacity:1"), (fr(t + LT), f"transform:translateY({dy}px);opacity:1"),
               (fr(t + LT) + 0.01, f"transform:translateY({dy}px);opacity:0"), (1, f"transform:translateY({dy}px);opacity:0")]
        css.append(f".{sg}{{opacity:0}}" + kf(sg, sgk) + anim("." + sg, sg, DUR))

    # playheads
    for cls, y, t0, col in (("pm", YM, 0, FLAME), ("pe", YE, LT, ICE)):
        body.append(f'<line class="{cls}" x1="0" y1="{y - 16}" x2="0" y2="{y + 16}" stroke="{col}" stroke-width="2"/>')
        st = [(0, f"transform:translateX({XA}px);opacity:0"), (fr(t0) - 0.002, f"transform:translateX({XA}px);opacity:0"),
              (fr(t0), f"transform:translateX({XA}px);opacity:1"), (fr(t0 + FL["td_t"]), f"transform:translateX({f(x(FL['td_t']))}px);opacity:1"),
              (fr(t0 + FL["td_t"]) + 0.02, f"transform:translateX({f(x(FL['td_t']))}px);opacity:0"), (1, f"transform:translateX({f(x(FL['td_t']))}px);opacity:0")]
        css.append(f".{cls}{{opacity:0}}" + kf(cls, st) + anim("." + cls, cls, DUR))

    # the moving spacecraft glyph above the Mars track
    GY = 100
    ph = [(e[0], e[1]) for e in EVENTS]
    inner = []
    for j, (eid, t) in enumerate(ph):
        t1 = ph[j + 1][1] if j + 1 < len(ph) else None
        cls = f"g{j}"
        inner.append(f'<g class="{cls}">{glyph(eid)}</g>')
        if t1 is None:
            st = [(0, "opacity:0"), (fr(t), "opacity:0"), (fr(t) + 0.003, "opacity:1"), (1 - 0.03, "opacity:1"), (1 - 0.01, "opacity:0"), (1, "opacity:0")]
        else:
            st = [(0, "opacity:0" if j else "opacity:1"), (fr(t), "opacity:0" if j else "opacity:1"), (fr(t) + 0.003, "opacity:1"), (fr(t1), "opacity:1"),
                  (fr(t1) + 0.003, "opacity:0"), (1 - 0.01, "opacity:0"), (1, "opacity:0" if j else "opacity:1")]
        css.append(f".{cls}{{opacity:0}}" + kf(cls, st) + anim("." + cls, cls, DUR))
    body.append(f'<g class="craft">{"".join(inner)}</g>')
    mv = [(0, f"transform:{tr(x(0), GY)}"), (fr(0), f"transform:{tr(x(0), GY)}")]
    for tt in range(10, int(FL["td_t"]) + 1, 10):
        mv.append((fr(tt), f"transform:{tr(x(tt), GY)}"))
    mv += [(fr(FL["td_t"]), f"transform:{tr(x(FL['td_t']), GY)}"), (1, f"transform:{tr(x(FL['td_t']), GY)}")]
    css.append(".craft{transform:" + tr(x(0), GY) + "}" + kf("craft", mv) + anim(".craft", "craft", DUR))
    # static strip for reduced motion
    strip = "".join(f'<g transform="translate({f(x(t))} {GY})">{glyph(eid)}</g>' for eid, t in ph if eid in ("ei", "heat", "chute", "sky"))
    body.append(f'<g class="still">{strip}</g>')

    # middle captions (between the tracks)
    CY = 58
    caps = [
        (0, FL["td_t"], "Radio waves need 11 min 22 s to cross 204 million km to Earth.", TEXT2),
        (FL["td_t"], LT, "Perseverance is already down, but Earth has not even heard it hit the air.", SOL),
        (LT, T_END + 60, "Earth watches all seven minutes, 11 min 22 s late. Nobody could help.", ICE),
    ]
    for i, (t0, t1, s, c) in enumerate(caps):
        cls = f"cap{i}"
        body.append(f'<g class="{cls}">' + text(972, CY, s, 13, c, anchor="end", weight=600) + "</g>")
        end1 = min(fr(t1), 1 - 0.03)
        st = [(0, "opacity:0"), (fr(t0) + 0.005, "opacity:0"), (fr(t0) + 0.02, "opacity:1"), (end1 - 0.012, "opacity:1"), (end1, "opacity:0"), (1, "opacity:0")]
        css.append(f".{cls}{{opacity:0}}" + kf(cls, st) + anim("." + cls, cls, DUR))
    css.append(".cap2{opacity:1}")
    for i in range(len(EVENTS)):
        css.append(f".em{i},.ee{i}{{opacity:1}}")

    desc = (
        "Animated timeline of Perseverance's entry, descent and landing (EDL) on 18 February 2021, from "
        "site/data/mars2020-edl.json. Top track: spacecraft time after entry interface (E+): entry at 5.32 km/s "
        "(≈128 km up), peak heating ≈E+75 s (≈1,300 °C press kit) and peak deceleration 10.7 g at E+83 s, parachute at "
        f"E+{FL['chute_t']} s ({FL['chute_v']} m/s, Mach {FL['chute_mach']}, 12.2 km), heat shield separation E+{FL['hs_t']} s "
        f"({FL['hs_v']} m/s), backshell separation and powered descent E+{FL['bs_t']} s ({FL['bs_v']} m/s, 2.1–2.2 km), sky crane "
        f"E+407 s (constant 0.75 m/s from ≈20 m), touchdown E+{FL['td_t']} s at {FL['td_vz']} m/s vertical. A glyph above the "
        "track changes with each phase. Bottom track: Earth receives each event one-way light time later, 682 s = 11 min 22 s "
        "(press kit), shown as radio pulses that all take the same time to fall from one track to the other; Earth hears "
        "'entry' 263 s after the rover has already landed. Time is compressed 70×."
    )
    svg(W, H, "Perseverance's seven minutes of terror", desc, "".join(body), "".join(css), name="mars-edl.svg")


if __name__ == "__main__":
    build()
