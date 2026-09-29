"""Animated banners (1000 x 220) for the top of the sub-READMEs.

    media/readme/sub/experiments.svg   experiments/README.md
    media/readme/sub/simulations.svg   simulations/README.md
    media/readme/sub/engineering.svg   docs/engineering/README.md
    media/readme/sub/equations.svg     docs/EQUATIONS.md (via scripts/build_equations_md.mjs)
"""
import math
import os
import random
import re

from common import (AURORA, FAINT, FLAME, ICE, MUTED, NEBULA, PLASMA, SOL, TEXT, TEXT2, anim, ellipse_pts, f, kf, orbit_kf, tr)
from facts import ROOT, counts
from metrics import text_w
from sections import esc, fig8_scene, frame, rocket_parts, sub_f, win, x0_for

W, H = 1000, 220
TS = 52


def level_counts():
    out = [0] * 5
    for d in os.listdir(os.path.join(ROOT, "experiments")):
        m = re.match(r"(\d)\d-", d)
        if m and int(m.group(1)) < 5:
            out[int(m.group(1))] += 1
    return out


def sc_experiments(x0):
    T = 12
    lv = [("Kitchen table", "under $10"), ("Garage & backyard", "$10–50"), ("First real rockets", "$50–150"),
          ("Avionics", "$100–300"), ("Research grade", "$150+")]
    cols = [AURORA, ICE, NEBULA, SOL, FLAME]
    nb = level_counts()
    css, rows = [], []
    rw, rh, gap = 300, 30, 9
    base = 196
    for k in range(5):
        y = base - (k + 1) * rh - k * gap
        x = x0 + 20 + k * 10
        w = rw - k * 20
        a = 8 + k * 14
        css.append(kf(f"lv{k}", [(0, "opacity:.25"), (a, "opacity:.25"), (a + 3, "opacity:1"), (88, "opacity:1"), (96, "opacity:.25"), (100, "opacity:.25")])
                   + anim(f".lv{k}", f"lv{k}", T))
        c = cols[k]
        rows.append(f'<g class="lv{k}" style="opacity:1"><rect x="{x}" y="{y}" width="{w}" height="{rh}" rx="8" fill="{c}" fill-opacity=".12" stroke="{c}" stroke-opacity=".7"/>'
                    f'<text x="{x + 12}" y="{y + 20}" class="mono" font-size="14" font-weight="700" fill="{c}">{k}</text>'
                    f'<text x="{x + 30}" y="{y + 20}" class="sans" font-size="14" fill="{TEXT}">{esc(lv[k][0])}</text>'
                    f'<text x="{x + w - 12}" y="{y + 20}" class="mono" font-size="12" fill="{TEXT2}" text-anchor="end">{esc(lv[k][1])} · {nb[k]}</text></g>')
    # rocket climbs beside the ladder, pausing at each rung
    rx = x0 + rw + 60
    st = [(0, f"transform:{tr(rx, base + 10, -90)};opacity:0"), (4, f"transform:{tr(rx, base - 4, -90)};opacity:1")]
    for k in range(5):
        y = base - (k + .5) * (rh + gap) - 4
        a = 8 + k * 14
        st += [(a, f"transform:{tr(rx, y, -90)};opacity:1"), (a + 8, f"transform:{tr(rx, y, -90)};opacity:1")]
    st += [(86, f"transform:{tr(rx, -40, -90)};opacity:1"), (87, f"transform:{tr(rx, -40, -90)};opacity:0"), (100, f"transform:{tr(rx, base + 10, -90)};opacity:0")]
    css.append(kf("cl", st) + anim(".cl", "cl", T, "ease-in-out"))
    css.append(kf("fk", [(0, "transform:scale(1,1)"), (50, "transform:scale(.8,1.25)"), (100, "transform:scale(1,1)")]) + anim(".fk", "fk", .18))
    bflame, booster, upper = rocket_parts()
    upper = upper.replace('class="uf" style="opacity:0"', 'style="opacity:0"')
    rocket = f'<g class="cl" style="transform:{tr(rx, base - 3.5 * (rh + gap), -90)}"><g transform="scale(1.3)">{bflame}{booster}{upper}</g></g>'
    body = "".join(rows) + f'<path d="M{rx} 20V{base}" stroke="#96aaff" stroke-opacity=".15" stroke-dasharray="3 5"/>' + rocket
    return dict(css="".join(css), body=body, x0=x0, defs=FLM)


FLM = ('<linearGradient id="flm" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="#fff3c4"/><stop offset=".35" stop-color="#ffc24b"/>'
       '<stop offset=".75" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></linearGradient>')


def black_hole(cx, cy, s=1.0):
    """Small edge-on black hole: lensed disc arc, shadow, photon ring, streaming disc."""
    rng = random.Random(4)
    css = [kf("bhr", [(0, "stroke-dashoffset:0"), (100, "stroke-dashoffset:100")])]
    streaks = []
    for i in range(7):
        rx = 30 + i * 6
        css.append(anim(f".bh{i}", "bhr", 1.6 + i * .35, delay=-rng.uniform(0, 2)))
        streaks.append(f'<ellipse class="bh{i}" rx="{rx}" ry="{f(rx * .17)}" pathLength="100" stroke-dasharray="{rng.choice(["8 17", "5 20", "12 13"])}" '
                       f'stroke-width="{f(rng.uniform(1, 2))}" opacity="{f(rng.uniform(.5, .95), 2)}"/>')
    svg = (f'<g transform="translate({cx} {cy}) scale({s})">'
           '<circle r="72" fill="url(#bhh)"/>'
           '<path d="M-44 0C-44 -52 44 -52 44 0L28 0C28 -34 -28 -34 -28 0Z" fill="url(#bht)" opacity=".85"/>'
           '<g clip-path="url(#bhb)" fill="none" stroke="#ffcf7a">' + "".join(streaks) + '</g>'
           '<circle r="22" fill="#000"/><circle r="23.5" fill="none" stroke="#ffe6b0" stroke-width="1.4" opacity=".9"/>'
           '<g clip-path="url(#bhf)" fill="none" stroke="#ffe0a0">' + "".join(streaks).replace('class="bh', 'class="bh') + '</g></g>')
    defs = ('<radialGradient id="bhh"><stop offset=".3" stop-color="#ff9a3d" stop-opacity=".2"/><stop offset="1" stop-color="#b18cff" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="bht" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="46"><stop offset=".55" stop-color="#ffe9bf"/>'
            '<stop offset=".8" stop-color="#ffb04a" stop-opacity=".7"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>'
            '<clipPath id="bhb"><rect x="-80" y="-40" width="160" height="40"/></clipPath><clipPath id="bhf"><rect x="-80" y="0" width="160" height="40"/></clipPath>')
    return "".join(css), svg, defs


def sc_simulations(x0):
    T = 11
    cmd = "python run.py blackhole"
    n, cw = len(cmd), 7.8
    tx, ty, tw, th = x0, 28, 250, 150
    cx0 = tx + 26
    css = [kf("ty", [(0, "transform:translateX(0)"), (6, "transform:translateX(0)"), (34, f"transform:translateX({f(n * cw)}px)"), (100, f"transform:translateX({f(n * cw)}px)")]),
           f".ty{{animation:ty {T}s steps({n}) infinite}}",
           kf("cb", [(0, "opacity:1"), (50, "opacity:0"), (100, "opacity:1")]) + anim(".cb", "cb", .9, "steps(1)"),
           win("o1", 38, 94, 2) + anim(".o1", "o1", T), win("o2", 46, 94, 2) + anim(".o2", "o2", T), win("o3", 56, 94, 2) + anim(".o3", "o3", T)]
    bcss, bsvg, bdefs = black_hole(x0 + 332, 72, 1.0)
    fcss, fbody = fig8_scene(x0 + 336, 170, 48, 48, 6.0, prefix="f8")
    css += [bcss, fcss]
    body = (
        f'<rect x="{tx}" y="{ty}" width="{tw}" height="{th}" rx="10" fill="#060913" stroke="#96aaff" stroke-opacity=".28"/>'
        f'<path d="M{tx} {ty + 22}H{tx + tw}" stroke="#96aaff" stroke-opacity=".18"/>'
        + "".join(f'<circle cx="{tx + 14 + 12 * k}" cy="{ty + 11}" r="3.5" fill="{c}" opacity=".8"/>' for k, c in enumerate((PLASMA, SOL, AURORA)))
        + f'<text class="mono" x="{tx + 12}" y="{ty + 46}" font-size="13" fill="{AURORA}">$</text>'
        f'<text class="mono" x="{cx0}" y="{ty + 46}" font-size="13" fill="{TEXT}" textLength="{f(n * cw)}" lengthAdjust="spacingAndGlyphs">{cmd}</text>'
        f'<clipPath id="ln"><rect x="{cx0 - 1}" y="{ty + 31}" width="{f(n * cw + 10)}" height="20"/></clipPath>'
        f'<g clip-path="url(#ln)"><g class="ty" style="transform:translateX({f(n * cw)}px)"><rect x="{cx0}" y="{ty + 33}" width="{f(n * cw + 4)}" height="17" fill="#060913"/>'
        f'<rect class="cb" x="{cx0}" y="{ty + 34}" width="7.5" height="15" fill="{ICE}" opacity=".85"/></g></g>'
        f'<g class="o1"><text class="mono" x="{tx + 12}" y="{ty + 72}" font-size="12.5" fill="{MUTED}">Schwarzschild geodesics</text></g>'
        f'<g class="o2"><text class="mono" x="{tx + 12}" y="{ty + 94}" font-size="12.5" fill="{MUTED}">photon sphere 1.5 rₛ</text></g>'
        f'<g class="o3"><text class="mono" x="{tx + 12}" y="{ty + 116}" font-size="12.5" fill="{MUTED}">inner stable orbit 3 rₛ</text>'
        f'<text class="mono" x="{tx + 12}" y="{ty + 138}" font-size="12.5" fill="{AURORA}">✓ saved outputs/</text></g>'
        + bsvg
        + f'<text class="mono" x="{x0 + 420}" y="202" font-size="11.5" fill="{FAINT}" text-anchor="end">figure-eight, 3 bodies</text>'
        + fbody
    )
    return dict(css="".join(css), body=body, x0=x0, defs=bdefs)


def sc_engineering(x0):
    T = 10
    cx, cy = x0 + 205, 112
    # (label, svg of the part drawn around its own origin, exploded offset, label anchor offset)
    parts = [
        ("Power", f'<rect x="-46" y="-14" width="40" height="28" fill="#23367a" stroke="{ICE}"/><path d="M-36 -14V14M-26 -14V14M-16 -14V14M-46 0H-6" stroke="{ICE}" stroke-opacity=".5"/>'
                  '<path d="M-6 0H0" stroke="#cfd5e8" stroke-width="2"/>', (-80, 0), (-70, -22, "middle")),
        ("", f'<rect x="6" y="-14" width="40" height="28" fill="#23367a" stroke="{ICE}"/><path d="M16 -14V14M26 -14V14M36 -14V14M6 0H46" stroke="{ICE}" stroke-opacity=".5"/>'
             '<path d="M0 0H6" stroke="#cfd5e8" stroke-width="2"/>', (80, 0), None),
        ("Communications", '<path d="M-20 -4Q0 12 20 -4Z" fill="#dfe4f4"/><path d="M0 0V-12" stroke="#cfd5e8" stroke-width="1.5"/><circle cy="-13" r="2.2" fill="' + AURORA + '"/>',
         (0, -52), (0, -24, "middle")),
        ("Propulsion", '<path d="M-7 0L-11 14H11L7 0Z" fill="#8f98bd"/><path d="M-11 14H11" stroke="' + FLAME + '" stroke-width="2"/>', (0, 44), (22, 12, "start")),
        ("Thermal", '<rect x="-3" y="-15" width="6" height="30" fill="#cfd5e8"/><path d="M-3 -9H3M-3 -3H3M-3 3H3M-3 9H3" stroke="#5d6589"/>', (0, 0), (0, 0, "start")),
        ("Attitude control", f'<circle r="6" fill="#141827" stroke="{SOL}" stroke-width="1.6"/><circle r="1.6" fill="{SOL}"/>', (0, 0), (0, 0, "start")),
        ("Command & data", f'<rect x="-9" y="-6" width="18" height="12" rx="1.5" fill="#0a241f" stroke="{AURORA}"/><path d="M-5 -6V-9M0 -6V-9M5 -6V-9" stroke="{AURORA}"/>', (0, 0), (0, 0, "start")),
    ]
    # placements (assembled position relative to bus centre) and exploded offsets
    place = {0: (-24, 0), 1: (24, 0), 2: (0, -22), 3: (0, 22), 4: (22, -6), 5: (-10, 8), 6: (6, 8)}
    explode = {0: (-72, 0), 1: (72, 0), 2: (0, -34), 3: (0, 30), 4: (86, -46), 5: (-96, 52), 6: (104, 48)}
    labels = {0: (-120, -26, "middle"), 2: (0, -92, "middle"), 3: (22, 70, "start"), 4: (126, -56, "start"),
              5: (-110, 78, "middle"), 6: (122, 78, "start")}
    css, body = [], []
    for i, (lab, svg, _, _) in enumerate(parts):
        px, py = place[i]
        ex, ey = explode[i]
        st = [(0, "transform:translate(0,0)"), (10, "transform:translate(0,0)"), (34, f"transform:translate({ex}px,{ey}px)"),
              (76, f"transform:translate({ex}px,{ey}px)"), (94, "transform:translate(0,0)"), (100, "transform:translate(0,0)")]
        css.append(kf(f"p{i}", st) + anim(f".p{i}", f"p{i}", T, "cubic-bezier(.5,0,.3,1)"))
        body.append(f'<g transform="translate({cx + px} {cy + py})"><g class="p{i}" style="transform:translate({ex}px,{ey}px)">{svg}</g></g>')
        if i in labels:
            lx, ly, anc = labels[i]
            tx_, ty_ = cx + px + ex, cy + py + ey
            lxa, lya = cx + lx, cy + ly
            css.append(win(f"q{i}", 36, 76, 4) + anim(f".q{i}", f"q{i}", T))
            body.append(f'<g class="q{i}" style="opacity:1"><path d="M{f(tx_)} {f(ty_)}L{f(lxa)} {f(lya + (4 if ly < 0 else -14))}" stroke="{MUTED}" stroke-opacity=".6" stroke-dasharray="2 3"/>'
                        f'<text x="{f(lxa)}" y="{f(lya)}" class="sans" font-size="13.5" font-weight="600" fill="{TEXT2}" text-anchor="{anc}">{esc(lab)}</text></g>')
    bus = (f'<rect x="{cx - 18}" y="{cy - 16}" width="36" height="32" rx="3" fill="url(#gold)" stroke="#8a5d1c"/>'
           f'<path d="M{cx - 18} {cy - 6}H{cx + 18}M{cx - 18} {cy + 6}H{cx + 18}" stroke="#8a5d1c" stroke-opacity=".5"/>')
    body.insert(0, bus)
    defs = ('<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/>'
            '<stop offset=".5" stop-color="#d9a441"/><stop offset="1" stop-color="#8a5d1c"/></linearGradient>')
    return dict(css="".join(css), body="".join(body), x0=x0, defs=defs)


def sc_equations(x0):
    T = 30
    cx, cy = x0 + 205, 112
    eqs = ["Δv = vₑ ln(m₀/m@f)", "v² = GM(2/r − 1/a)", "E = mc²", "F = GMm/r²", "T² ∝ a³", "θ = 1.22 λ/D"]
    cols = [FLAME, ICE, SOL, NEBULA, AURORA, PLASMA]
    RX, RY, ROT = 164, 70, -8                     # one shared orbit, equations evenly spaced: they never overlap
    css, front = [], []
    rings = (f'<ellipse cx="{cx}" cy="{cy}" rx="{RX}" ry="{RY}" transform="rotate({ROT} {cx} {cy})" fill="none" stroke="{ICE}" stroke-opacity=".3"/>'
             f'<ellipse cx="{cx}" cy="{cy}" rx="120" ry="34" transform="rotate(58 {cx} {cy})" fill="none" stroke="{NEBULA}" stroke-opacity=".22"/>'
             f'<ellipse cx="{cx}" cy="{cy}" rx="120" ry="34" transform="rotate(-62 {cx} {cy})" fill="none" stroke="{PLASMA}" stroke-opacity=".18"/>')
    # two electrons on the decorative orbits
    for k, rot in enumerate((58, -62)):
        pts = ellipse_pts(cx, cy, 120, 34, rot, 40, phase=k * 2)
        css.append(orbit_kf(f"el{k}", pts, occl=(cx, cy, 28)) + anim(f".el{k}", f"el{k}", 7 + k * 2))
        x, y, _ = pts[0]
        front.append(f'<g class="el{k}" style="transform:translate({f(x)}px,{f(y)}px)"><circle r="3" fill="{(NEBULA, PLASMA)[k]}"/></g>')
    for i, t in enumerate(eqs):
        phase = i * 2 * math.pi / len(eqs)
        pts = ellipse_pts(cx, cy, RX, RY, ROT, 60, phase=phase)
        css.append(orbit_kf(f"q{i}", pts, occl=(cx, cy, 40), size=(.78, 1.08)) + anim(f".q{i}", f"q{i}", T))
        x, y, d = pts[0]
        w = text_w(t.replace("@", ""), 17) * .9
        front.append(f'<g class="q{i}" style="transform:translate({f(x)}px,{f(y)}px)"><g transform="translate({f(-w / 2)} 6)">'
                     f'<text class="serif" font-style="italic" font-size="17" fill="{TEXT}">{sub_f(t)}</text>'
                     f'<rect y="6" width="{f(w)}" height="2" rx="1" fill="{cols[i]}" opacity=".85"/></g></g>')
    css.append(kf("nu", [(0, "transform:scale(.94)"), (50, "transform:scale(1.06)"), (100, "transform:scale(.94)")]) + anim(".nu", "nu", 3.2, "ease-in-out"))
    nucleus = (f'<g transform="translate({cx} {cy})"><circle r="60" fill="url(#nh)"/><g class="nu">'
               f'<circle r="26" fill="url(#ng)"/>'
               + "".join(f'<circle cx="{f(11 * math.cos(a))}" cy="{f(11 * math.sin(a))}" r="7" fill="{c}" opacity=".85"/>'
                         for a, c in zip([0, 2.1, 4.2, 1.05, 3.15, 5.25], [PLASMA, ICE, PLASMA, ICE, PLASMA, ICE]))
               + f'<text y="7" text-anchor="middle" class="serif" font-size="22" font-weight="700" fill="#fff">∑</text></g></g>')
    defs = (f'<radialGradient id="nh"><stop offset="0" stop-color="{NEBULA}" stop-opacity=".45"/><stop offset="1" stop-color="{NEBULA}" stop-opacity="0"/></radialGradient>'
            f'<radialGradient id="ng" cx=".35" cy=".35"><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="{NEBULA}"/><stop offset="1" stop-color="#3b2a8f"/></radialGradient>')
    return dict(css="".join(css), body=rings + nucleus + "".join(front), x0=x0, defs=defs)


def specs():
    c = counts()
    n_primers = len([p for p in os.listdir(os.path.join(ROOT, "docs", "engineering")) if p.endswith(".md") and p != "README.md"])
    return [
        ("experiments", f"THE BUILD LADDER · {c['builds']} BUILDS", "Experiments", "Five levels, kitchen table to research grade", AURORA, SOL,
         sc_experiments, "A five-rung ladder of build levels lights up from the bottom (kitchen table, garage and backyard, first real rockets, "
         "avionics, research grade, with budgets and the number of builds on each) while a small rocket climbs past each rung."),
        ("simulations", f"{c['simulations']} PYTHON SIMULATIONS · NUMPY", "Simulations", "Readable physics engines for the command line", SOL, NEBULA,
         sc_simulations, "A terminal types python run.py blackhole and prints facts about the Schwarzschild black hole (photon sphere at 1.5 "
         "Schwarzschild radii, innermost stable circular orbit at 3); beside it a small lensed black hole spins and three equal masses trace "
         "the figure-eight three-body orbit."),
        ("engineering", f"{n_primers} PRIMERS · ROCKETS TO RADIO LINKS", "Engineering", "How spacecraft and rockets really work", FLAME, ICE,
         sc_engineering, "A spacecraft pulls apart into its subsystems and reassembles: solar arrays (power), high-gain antenna (communications), "
         "engine (propulsion), radiator (thermal), reaction wheel (attitude control) and flight computer (command and data handling), each labelled."),
        ("equations", f"{c['equations']} EQUATIONS · LIVE CALCULATORS", "Equation Atlas", "Every symbol explained, every example checked", NEBULA, ICE,
         sc_equations, "Equations orbit a glowing nucleus like electrons on three tilted orbits, passing behind it and in front: the rocket equation, "
         "vis-viva, E = mc², Newton's gravity, Kepler's third law and the diffraction limit."),
    ]


def build_all():
    for key, eyebrow, title, subt, c1, c2, fn, alt in specs():
        x0 = x0_for(title, TS, 540)
        sc = fn(x0)
        yield key, frame(key, eyebrow, title, subt, c1, c2, sc, f"Banner: {title}. {eyebrow.title()}. {subt}. Animation: {alt}",
                         w=W, h=H, title_size=TS, uid="s" + key[:2])
