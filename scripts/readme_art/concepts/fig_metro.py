"""10. learning-path.svg — the site as a metro map (page labels from site/assets/js/codex.js PAGES)."""
import math
import os
import re
from _lib import *

W, H = 1000, 560
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "..", "..", "..", "site", "assets", "js", "codex.js"), encoding="utf-8").read()
PAGES = {m[0]: m[1] for m in re.findall(r'\["([\w-]+)",\s*"([^"]+)",\s*"[^"]+",\s*"(?:Fly|Explore|Learn|Build)"', SRC)}

A, B = -18, 28          # label above / below a station
# station positions (id → x, y) and label placement (dx, dy, anchor)
ST = {
    # FLY, y = 110
    "launch": (80, 110, 0, A, "middle"), "booster": (197, 110, 0, A, "middle"), "moon-landing": (314, 110, 0, A, "middle"),
    "mars-landing": (431, 110, 0, A, "middle"), "shuttle": (548, 110, 0, A, "middle"), "hangar": (665, 110, 0, A, "middle"),
    "mission-designer": (782, 110, 0, -20, "middle"), "builder": (900, 110, 0, -20, "middle"),
    # EXPLORE: down from Mission designer, left along y = 250, round the corner, right along y = 350
    "dsn": (782, 182, 14, 5, "start"),
    "earth": (700, 250, 0, A, "middle"), "space-weather": (605, 250, 0, B, "middle"), "solar-observatory": (510, 250, 0, A, "middle"),
    "sun": (415, 250, 0, B, "middle"), "solar-system": (320, 250, 0, A, "middle"), "sky": (225, 250, 0, B, "middle"),
    "moon": (130, 250, 0, A, "middle"),
    "telescopes": (140, 350, 0, -20, "middle"), "surveys": (250, 350, 0, B, "middle"), "black-hole": (360, 350, 0, A, "middle"),
    "galaxies": (470, 350, 0, B, "middle"), "scale": (580, 350, 0, A, "middle"),
    # LEARN: down from Use a telescope, right along y = 450
    "academy": (140, 450, 0, B, "middle"), "orbits": (250, 450, 0, B, "middle"), "equations": (360, 450, 14, -14, "start"),
    "timeline": (470, 450, 0, B, "middle"), "gallery": (580, 450, 0, B, "middle"), "library": (690, 450, 0, B, "middle"),
    # BUILD: bottom row
    "experiments": (640, 505, 0, B, "middle"),
}
LINES = [
    ("FLY", FLAME, "M80 110H900"),
    ("EXPLORE", ICE, "M782 110V238Q782 250 770 250H57Q45 250 45 262V338Q45 350 57 350H580"),
    ("LEARN", NEBULA, "M140 350V450H690"),
    ("BUILD", AURORA, "M900 110H943Q955 110 955 122V493Q955 505 943 505H372Q360 505 360 493V450"),
]
MEMBERS = {
    "FLY": ["launch", "booster", "moon-landing", "mars-landing", "shuttle", "hangar", "mission-designer", "builder"],
    "EXPLORE": ["mission-designer", "dsn", "earth", "space-weather", "solar-observatory", "sun", "solar-system", "sky", "moon",
                "telescopes", "surveys", "black-hole", "galaxies", "scale"],
    "LEARN": ["telescopes", "academy", "orbits", "equations", "timeline", "gallery", "library"],
    "BUILD": ["builder", "experiments", "equations"],
}
INTERCHANGE = {p for p in ST if sum(p in m for m in MEMBERS.values()) > 1}


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
    body.append(text(64, 114, "FLY", 11, FLAME, "m", "end", 700))
    body.append(text(598, 354, "EXPLORE", 11, ICE, "m", weight=700))
    body.append(text(943, 300, "BUILD", 11, AURORA, "m", "end", 700))
    body.append(text(708, 454, "LEARN", 11, NEBULA, "m", weight=700))

    # trains (SMIL along the line paths, there and back)
    trains = []
    for i, (name, col, d) in enumerate(LINES):
        dur = [22, 30, 16, 22][i]
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
        if pid in INTERCHANGE:
            body.append(f'<circle cx="{x}" cy="{y}" r="10" fill="#fff" stroke="#0b1020" stroke-width="3"/>'
                        f'<circle cx="{x}" cy="{y}" r="10" fill="none" stroke="#fff" stroke-width="1.5"/>')
        else:
            col = next(c for n, c, d in LINES if pid in MEMBERS[n])
            body.append(f'<circle cx="{x}" cy="{y}" r="6" fill="#fff" stroke="{col}" stroke-width="3"/>')
        wt = 700 if pid in INTERCHANGE else 600
        body.append(text(x + dx, y + dy, label, 13.5, TEXT, anchor=anc, weight=wt))

    # START HERE flags
    for pid, sub, (fx, fy) in (("launch", "for flying", (80, 164)), ("academy", "for learning", (62, 502))):
        x, y, *_ = ST[pid]
        lead = f"M{x} {y + 9}V{fy - 14}" if pid == "launch" else f"M{x - 9} {y}H{fx}V{fy - 14}"
        body.append(f'<g class="flag"><path d="{lead}" stroke="{SOL}" stroke-width="1.5" fill="none"/>'
                    f'<rect x="{fx - 44}" y="{fy - 14}" width="88" height="30" rx="6" fill="{SOL}"/>'
                    + text(fx, fy + 1, "START HERE", 11, "#1a1200", "m", "middle", 800)
                    + text(fx, fy + 12, sub, 9.5, "#3a2a00", "s", "middle") + "</g>")
    css.append(".flag{animation:bob 2.4s ease-in-out infinite}@keyframes bob{0%,100%{opacity:1}50%{opacity:.72}}")

    body.append(text(28, 548, "stations = pages on the site · big white dots = change lines here", 11.5, MUTED))

    names = {"FLY": "orange", "EXPLORE": "blue", "LEARN": "purple", "BUILD": "green"}
    lines_txt = " ".join(f"{n} ({names[n]}): " + ", ".join(PAGES[p] for p in MEMBERS[n]) + "." for n, _, _ in LINES)
    inter = ", ".join(f"{PAGES[p]} ({'/'.join(n for n in MEMBERS if p in MEMBERS[n])})" for p in ST if p in INTERCHANGE)
    desc = (
        f"A transit-style map of the Cosmic Library website: all {len(ST)} pages in the PAGES list of "
        "site/assets/js/codex.js, as stations on four lines. " + lines_txt + " Interchanges: " + inter + ". "
        "'Start here' flags mark the Saturn V launch (for flying) and the Space Academy (for learning). Small trains "
        "glide along each line."
    )
    svg(W, H, "Cosmic Library line map", desc, "".join(body), "".join(css), name="learning-path.svg")
    missing = [p for p in ST if p not in PAGES]
    unmapped = [p for p in PAGES if p not in ST]
    assert not missing and not unmapped, (missing, unmapped)
    print(f"    {len(ST)} stations = {len(PAGES)} pages; interchanges: {sorted(INTERCHANGE)}")


if __name__ == "__main__":
    build()
