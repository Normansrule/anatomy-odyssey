"""10. learning-path.svg — the site as a metro map (page labels from site/assets/js/codex.js PAGES)."""
import math
import os
import re
from _lib import *

W, H = 1000, 420
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "..", "..", "..", "site", "assets", "js", "codex.js"), encoding="utf-8").read()
PAGES = {m[0]: m[1] for m in re.findall(r'\["([\w-]+)",\s*"([^"]+)",\s*"[^"]+",\s*"(?:Fly|Explore|Learn|Build)"', SRC)}

# station positions (id → x, y) and label placement (dx, dy, anchor)
ST = {
    "launch": (92, 118, 0, -18, "middle"), "booster": (205, 118, 0, -18, "middle"), "moon-landing": (318, 118, 0, -18, "middle"),
    "mars-landing": (431, 118, 0, -18, "middle"), "shuttle": (544, 118, 0, -18, "middle"), "hangar": (657, 118, 0, -18, "middle"),
    "builder": (780, 118, 0, -20, "middle"),
    "earth": (92, 218, 0, 28, "middle"), "sky": (197, 218, 0, 28, "middle"), "solar-system": (302, 218, 14, -16, "start"),
    "sun": (407, 218, 0, 28, "middle"), "space-weather": (512, 218, 0, -16, "middle"), "black-hole": (617, 218, 0, 28, "middle"),
    "galaxies": (722, 218, 0, -16, "middle"), "scale": (827, 218, 0, 28, "middle"),
    "orbits": (207, 313, -16, 5, "end"), "equations": (397, 313, 14, -14, "start"), "timeline": (512, 313, 0, 26, "middle"),
    "gallery": (627, 313, 0, 26, "middle"), "library": (742, 313, 0, 26, "middle"),
    "experiments": (640, 383, 0, 26, "middle"),
}
LINES = [
    ("FLY", FLAME, "M92 118H780"),
    ("EXPLORE", ICE, "M92 218H827"),
    ("LEARN", NEBULA, "M207 313L302 218L397 313H742"),
    ("BUILD", AURORA, "M780 118H858Q870 118 878.5 126.5L901.5 149.5Q910 158 910 170V331Q910 343 901.5 351.5L878.5 374.5Q870 383 858 383H409Q397 383 397 371V313"),
]
INTERCHANGE = {"launch": [FLAME], "builder": [FLAME, AURORA], "solar-system": [ICE, NEBULA], "equations": [NEBULA, AURORA], "orbits": [NEBULA]}


def build():
    css, body = [], []
    body.append(card(W, H, seed=101, nstars=70))
    body.append(header(28, 36, "HOW TO FIND YOUR WAY", "The Cosmic Library line map", size=21))
    # legend
    lx = 560
    for i, (name, col, _) in enumerate(LINES):
        x = lx + i * 106
        body.append(f'<line x1="{x}" y1="44" x2="{x + 26}" y2="44" stroke="{col}" stroke-width="7" stroke-linecap="round"/>')
        body.append(text(x + 34, 49, name, 13, col, "m", weight=700))

    # lines
    for name, col, d in LINES:
        body.append(f'<path id="ln{name}" d="{d}" fill="none" stroke="{col}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>')
    # line name tags at the ends
    body.append(text(64, 122, "FLY", 11, FLAME, "m", "end", 700))
    body.append(text(64, 222, "EXPLORE", 11, ICE, "m", "end", 700))
    body.append(text(924, 254, "BUILD", 11, AURORA, "m", weight=700))
    body.append(text(760, 317, "LEARN", 11, NEBULA, "m", weight=700))

    # trains (SMIL along the line paths, there and back)
    trains = []
    for i, (name, col, d) in enumerate(LINES):
        dur = [22, 24, 18, 20][i]
        for j in range(2 if name in ("FLY", "EXPLORE") else 1):
            begin = f"{-dur * (0.5 * j + 0.13 * i):.2f}s"
            trains.append(f'<g><rect x="-11" y="-4.5" width="22" height="9" rx="4.5" fill="#fff" stroke="{col}" stroke-width="2"/>'
                          f'<rect x="-6" y="-2" width="4" height="3" rx="1" fill="{col}"/><rect x="1" y="-2" width="4" height="3" rx="1" fill="{col}"/>'
                          f'<animateMotion dur="{dur}s" begin="{begin}" repeatCount="indefinite" rotate="auto" keyPoints="0;1;0" keyTimes="0;.5;1" calcMode="linear">'
                          f'<mpath href="#ln{name}"/></animateMotion></g>')
    body.append('<g class="smil">' + "".join(trains) + "</g>")

    # stations
    for pid, (x, y, dx, dy, anc) in ST.items():
        label = PAGES.get(pid, pid)
        if pid in INTERCHANGE and len(INTERCHANGE[pid]) > 1:
            body.append(f'<circle cx="{x}" cy="{y}" r="10" fill="#fff" stroke="#0b1020" stroke-width="3"/>'
                        f'<circle cx="{x}" cy="{y}" r="10" fill="none" stroke="#fff" stroke-width="1.5"/>')
        else:
            col = next(c for n, c, d in LINES if pid in line_members(n))
            body.append(f'<circle cx="{x}" cy="{y}" r="6" fill="#fff" stroke="{col}" stroke-width="3"/>')
        wt = 700 if pid in INTERCHANGE else 600
        body.append(text(x + dx, y + dy, label, 13, TEXT, anchor=anc, weight=wt))

    # START HERE flags
    for pid, sub, (fx, fy), col in (("launch", "for flying", (92, 158), FLAME), ("orbits", "for learning", (207, 355), NEBULA)):
        x, y, *_ = ST[pid]
        body.append(f'<g class="flag"><path d="M{x} {y + 9}V{fy - 14}" stroke="{SOL}" stroke-width="1.5"/>'
                    f'<rect x="{fx - 44}" y="{fy - 14}" width="88" height="30" rx="6" fill="{SOL}"/>'
                    + text(fx, fy + 1, "START HERE", 11, "#1a1200", "m", "middle", 800)
                    + text(fx, fy + 12, sub, 9.5, "#3a2a00", "s", "middle") + "</g>")
    css.append(".flag{animation:bob 2.4s ease-in-out infinite}@keyframes bob{0%,100%{opacity:1}50%{opacity:.72}}")

    body.append(text(28, 408, "stations = pages on the site · big white dots = change lines here", 11.5, MUTED))

    desc = (
        "A transit-style map of the Cosmic Library website. Four lines: FLY (orange): Saturn V launch, Booster landing, "
        "Moon landing, Mars landing, Endeavour, Rocket hangar, Rocket builder. EXPLORE (blue): Live Earth orbit, Night sky, "
        "Solar system, The Sun, Space weather, Black hole, Galaxy collision, Cosmic scale. LEARN (purple): Orbit Lab, "
        "Solar system, Equations, Timeline, Gallery, Documents. BUILD (green): Rocket builder, Experiments, Equations. "
        "Interchanges: Rocket builder (FLY/BUILD), Solar system (EXPLORE/LEARN), Equations (LEARN/BUILD). 'Start here' flags "
        "mark the Saturn V launch and the Orbit Lab. Small trains glide along each line. Station names are the page labels "
        "from the PAGES list in site/assets/js/codex.js."
    )
    svg(W, H, "Cosmic Library line map", desc, "".join(body), "".join(css), name="learning-path.svg")
    missing = [p for p in ST if p not in PAGES]
    if missing:
        print("    WARNING: not in codex.js PAGES:", missing)


def line_members(name):
    return {
        "FLY": ["launch", "booster", "moon-landing", "mars-landing", "shuttle", "hangar", "builder"],
        "EXPLORE": ["earth", "sky", "solar-system", "sun", "space-weather", "black-hole", "galaxies", "scale"],
        "LEARN": ["orbits", "solar-system", "equations", "timeline", "gallery", "library"],
        "BUILD": ["builder", "experiments", "equations"],
    }[name]


if __name__ == "__main__":
    build()
