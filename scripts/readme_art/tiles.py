"""Mission-card tiles (400 x 250) — one per site page, plus the Python toolkit.

Each scene function returns dict(defs, css, body[, stars]) drawn inside the shared
card frame (background, stars, bottom scrim, group chip, title, description, "Open"
affordance, travelling border beam).
"""
import math
import random

from tiles_extra import s_solar_obs, s_surveys, s_telescopes
from tiles_extra2 import s_academy, s_dsn, s_mission, s_moon as s_moon_explorer
from tiles_extra3 import s_eyepiece
from common import (AURORA, BG, FLAME, FAINT, ICE, MUTED, NEBULA, PLASMA, SOL, TEXT, TEXT2, anim, arclen_sampler,
                    ellipse_arc, ellipse_pts, f, kf, neg, orbit_kf, pts_path, rrpath, stars, svg_doc, tr, twinkle_css,
                    window_kf)

W, H = 400, 250
GROUP_COL = {"Fly": FLAME, "Explore": ICE, "Learn": NEBULA, "Build": AURORA, "Compute": SOL}

# id, title, group, description, file label  (titles/descriptions from site/assets/js/codex.js PAGES)
PAGES = [
    ("launch", "Saturn V launch", "Fly", "Ride Apollo 11 from the pad to orbit", "launch.html"),
    ("booster", "Booster landing", "Fly", "Land a reusable first stage yourself", "booster.html"),
    ("moon-landing", "Moon landing", "Fly", "Fly the Apollo lunar module down", "moon-landing.html"),
    ("mars-landing", "Mars landing", "Fly", "Seven minutes of terror, step by step", "mars-landing.html"),
    ("shuttle", "Endeavour", "Fly", "The Space Shuttle in Los Angeles", "shuttle.html"),
    ("hangar", "Rocket hangar", "Fly", "Every major rocket, side by side to scale", "hangar.html"),
    ("builder", "Rocket builder", "Fly", "Design a rocket, then fly it to orbit", "builder.html"),
    ("mission-designer", "Mission designer", "Fly", "Plan a real interplanetary mission, end to end", "mission-designer.html"),
    ("earth", "Live Earth orbit", "Explore", "Real satellites, launches and news, live", "earth.html"),
    ("sky", "Night sky", "Explore", "A planetarium for your location, tonight", "sky.html"),
    ("solar-system", "Solar system", "Explore", "Every planet where it is today", "solar-system.html"),
    ("moon", "Moon explorer", "Explore", "Every landing site, phases and eclipses", "moon.html"),
    ("sun", "The Sun", "Explore", "Five wavelengths, flares, and the inside", "sun.html"),
    ("black-hole", "Black hole", "Explore", "Light bent through curved spacetime", "black-hole.html"),
    ("scale", "Cosmic scale", "Explore", "Zoom from a person to the whole universe", "scale.html"),
    ("space-weather", "Space weather", "Explore", "Solar wind, storms and aurora, live", "space-weather.html"),
    ("galaxies", "Galaxy collision", "Explore", "Milky Way meets Andromeda", "galaxies.html"),
    ("solar-observatory", "Solar observatory", "Explore", "Today's real Sun from SDO, SOHO and GOES", "solar-observatory.html"),
    ("surveys", "Sky surveys", "Explore", "Pan the real sky in a dozen wavelengths", "surveys.html"),
    ("dsn", "Deep Space Network", "Explore", "Which spacecraft are talking to Earth right now", "dsn.html"),
    ("orbits", "Orbit Lab", "Learn", "Newton, Kepler, Hohmann and Lagrange", "orbits.html"),
    ("equations", "Equations", "Learn", "94 equations with live calculators", "equations.html"),
    ("gallery", "Gallery", "Learn", "60+ photographs that changed us", "gallery.html"),
    ("timeline", "Timeline", "Learn", "1903 to today, every milestone", "timeline.html"),
    ("library", "Documents", "Learn", "Flight manuals, reports and user guides", "library.html"),
    ("telescopes", "Use a telescope", "Learn", "Free robotic telescopes, live feeds, simulators", "telescopes.html"),
    ("academy", "Space Academy", "Learn", "A guided course with quizzes and badges", "academy.html"),
    ("eyepiece", "Telescope simulator", "Learn", "See what a telescope would really show you", "eyepiece.html"),
    ("experiments", "Experiments", "Build", "20 builds from $0 to a custom circuit board", "experiments.html"),
    ("python", "Python toolkit", "Compute", "7 simulations and 52 physics tests", "simulations/"),
]
LIVE = {"earth", "space-weather", "solar-observatory", "dsn"}

FLICKER = (kf("fk", [(0, "transform:scale(1,1)"), (25, "transform:scale(.82,1.22)"), (50, "transform:scale(1.08,.86)"),
                     (75, "transform:scale(.9,1.14)"), (100, "transform:scale(1,1)")]) + anim(".fk", "fk", 0.16))

FLAME_GRAD = ('<linearGradient id="flm" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/>'
              '<stop offset=".3" stop-color="#ffc24b"/><stop offset=".7" stop-color="#ff7a3d"/>'
              '<stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></linearGradient>')
SMOKE_GRAD = ('<radialGradient id="smk"><stop offset="0" stop-color="#f3f5ff" stop-opacity=".95"/>'
              '<stop offset=".6" stop-color="#b9c1dc" stop-opacity=".55"/><stop offset="1" stop-color="#8f98bd" stop-opacity="0"/></radialGradient>')
SHADE = ('<radialGradient id="shd" cx=".35" cy=".32" r=".78"><stop offset="0" stop-color="#fff" stop-opacity=".45"/>'
         '<stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".6"/></radialGradient>')


def flame(x, y, w=6, h=26, cls="fk", core=True):
    """A flame pointing down from (x, y); flickers about its root."""
    c = f'<path d="M{f(-w / 2)} 0Q{f(-w * .45)} {f(h * .5)} 0 {f(h)}Q{f(w * .45)} {f(h * .5)} {f(w / 2)} 0Z" fill="#fff3d6"/>' if core else ""
    return (f'<g transform="translate({f(x)} {f(y)})"><g class="{cls}">'
            f'<path d="M{f(-w)} 0Q{f(-w * 1.25)} {f(h * .45)} 0 {f(h * 1.6)}Q{f(w * 1.25)} {f(h * .45)} {f(w)} 0Z" fill="url(#flm)"/>'
            f'{c}</g></g>')


# ----------------------------------------------------------------------------- FLY
def s_launch():
    T = 7
    x, gy = 262, 178
    body_parts = (
        f'<path d="M{x} 42V58" stroke="#dfe4f4" stroke-width="1.3"/>'
        f'<path d="M{x - 4.4} 66L{x} 56.5L{x + 4.4} 66Z" fill="#dfe4f4"/>'
        f'<rect x="{x - 4.5}" y="66" width="9" height="34" fill="url(#bd)"/>'
        f'<rect x="{x - 4.5}" y="84" width="9" height="3.5" fill="#141827"/>'
        f'<path d="M{x - 4.5} 100L{x - 7} 106H{x + 7}L{x + 4.5} 100Z" fill="url(#bd)"/>'
        f'<rect x="{x - 7}" y="106" width="14" height="69" fill="url(#bd)"/>'
        f'<rect x="{x - 7}" y="106" width="14" height="3" fill="#141827"/>'
        f'<rect x="{x - 7}" y="134" width="14" height="4" fill="#141827"/>'
        f'<rect x="{x - 7}" y="140" width="3.5" height="16" fill="#141827"/>'
        f'<rect x="{x + 3.5}" y="156" width="3.5" height="16" fill="#141827"/>'
        f'<path d="M{x - 7} 162L{x - 12} 176L{x - 7} 175ZM{x + 7} 162L{x + 12} 176L{x + 7} 175Z" fill="#dfe4f4"/>'
        f'<rect x="{x - 6}" y="175" width="12" height="3" fill="#3a3f52"/>'
    )
    tower = (f'<g stroke="#c9493c" stroke-opacity=".8" fill="none" stroke-width="1.1">'
             f'<path d="M236 52V178M246 52V178"/>'
             f'<path d="M236 60L246 70L236 80L246 90L236 100L246 110L236 120L246 130L236 140L246 150L236 160L246 170" stroke-width=".7"/>'
             f'<path d="M246 76H254M246 102H255M246 126H255" stroke-width="1.5"/></g>'
             f'<path d="M236 50H246V53H236Z" fill="#c9493c"/><circle cx="241" cy="48" r="1.4" fill="{FLAME}" class="bl"/>')
    css = [
        kf("rk", [(0, "transform:translateY(0);opacity:1;animation-timing-function:ease-in"), (12, "transform:translateY(0);animation-timing-function:cubic-bezier(.5,0,.9,.6)"),
                  (68, "transform:translateY(-250px);opacity:1"), (68.1, "transform:translateY(0);opacity:0"),
                  (84, "opacity:0"), (95, "opacity:1"), (100, "transform:translateY(0);opacity:1")]),
        anim(".rk", "rk", T),
        kf("fg", [(0, "transform:scale(.4,.1);opacity:0"), (4, "transform:scale(.8,.5);opacity:1"),
                  (12, "transform:scale(1,1)"), (60, "transform:scale(1.15,1.5);opacity:1"),
                  (68, "transform:scale(1.15,1.5);opacity:1"), (68.1, "opacity:0"), (100, "transform:scale(.4,.1);opacity:0")]),
        anim(".fg", "fg", T),
        kf("gw", [(0, "opacity:0"), (6, "opacity:.9"), (30, "opacity:.9"), (55, "opacity:0"), (100, "opacity:0")]),
        anim(".gw", "gw", T),
        kf("pf", [(0, "transform:scale(.2);opacity:0"), (5, "transform:scale(.5);opacity:.85"),
                  (40, "transform:scale(1.5);opacity:.5"), (72, "transform:scale(2.1);opacity:0"),
                  (100, "transform:scale(2.1);opacity:0")]),
        kf("blk", [(0, "opacity:1"), (50, "opacity:.15"), (100, "opacity:1")]) + anim(".bl", "blk", 1.2, "steps(1)"),
        FLICKER,
    ]
    rng = random.Random(4)
    puffs = []
    for k in range(14):
        dx = rng.uniform(-70, 70)
        r = rng.uniform(10, 18) * (1.25 - abs(dx) / 120)
        dy = rng.uniform(-8, 2) - (60 - abs(dx)) / 12
        cls = f"p{k}"
        css.append(anim(f".{cls}", "pf", T, "ease-out", delay=-(k * 0.09) - 0.05))
        puffs.append(f'<g transform="translate({f(x + dx)} {f(gy + dy)})"><circle class="{cls}" r="{f(r)}" fill="url(#smk)" opacity=".7"/></g>')
    defs = (FLAME_GRAD + SMOKE_GRAD +
            '<linearGradient id="bd" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffffff"/>'
            '<stop offset=".55" stop-color="#eef1fb"/><stop offset="1" stop-color="#aab3d4"/></linearGradient>'
            '<linearGradient id="hz" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a3d" stop-opacity="0"/>'
            '<stop offset="1" stop-color="#ff7a3d" stop-opacity=".22"/></linearGradient>'
            '<radialGradient id="fglow"><stop offset="0" stop-color="#ffc24b" stop-opacity=".85"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>')
    body = (
        '<rect y="110" width="400" height="68" fill="url(#hz)"/>'
        '<path d="M0 178Q70 170 140 176T290 174T400 177V250H0Z" fill="#06070d"/>'
        '<path d="M0 178Q70 170 140 176T290 174T400 177" fill="none" stroke="#ff9a5c" stroke-opacity=".35"/>'
        + tower +
        f'<ellipse class="gw" cx="{x}" cy="{gy + 2}" rx="70" ry="16" fill="url(#fglow)"/>'
        f'<rect x="228" y="{gy}" width="66" height="8" rx="1" fill="#1b2236" stroke="#2a3350"/>'
        f'<g class="rk"><g transform="translate({x} {gy})"><g class="fg">{flame(0, 0, 7, 30)}</g></g>{body_parts}</g>'
        + "".join(puffs)
    )
    body = f'<g transform="translate(0 -10)">{body}</g>'
    return dict(defs=defs, css="".join(css), body=body, stars=36)


def s_booster():
    T = 7
    x, bot = 255, 150
    leg = (lambda s: f'<g transform="translate({f(x + s * 5.5)} {bot - 3})"><g class="lg{"L" if s < 0 else "R"}" '
           f'style="transform:rotate({150 * s}deg)"><path d="M-1 0L1 0L0.6 -27L-0.6 -27Z" fill="#cfd5e8"/>'
           f'<rect x="-2.5" y="-29" width="5" height="2" rx="1" fill="#8f98bd"/></g></g>')
    booster = (
        f'<g class="bs">'
        f'<g class="fl">{flame(x, bot + 3, 4.5, 22)}</g>'
        + leg(-1) + leg(1) +
        f'<rect x="{x - 6}" y="{bot - 96}" width="12" height="96" fill="url(#bb)"/>'
        f'<rect x="{x - 6}" y="{bot - 96}" width="12" height="9" fill="#232838"/>'
        f'<rect x="{x - 11}" y="{bot - 85}" width="5" height="4" fill="#9aa3c0"/><rect x="{x + 6}" y="{bot - 85}" width="5" height="4" fill="#9aa3c0"/>'
        f'<rect x="{x - 4}" y="{bot}" width="8" height="3" fill="#2a3350"/>'
        '</g>')
    ship = (
        '<path d="M176 172H334L324 184H186Z" fill="#141a2b" stroke="#2a3350"/>'
        '<rect x="176" y="168" width="158" height="4" fill="#262f48"/>'
        '<rect x="176" y="159" width="9" height="9" fill="#1d2438"/><rect x="325" y="159" width="9" height="9" fill="#1d2438"/>'
        f'<ellipse cx="{x}" cy="169" rx="26" ry="2" fill="none" stroke="{SOL}" stroke-opacity=".55"/>'
        + "".join(f'<circle cx="{cx}" cy="170" r="1.1" fill="{c}" class="dl{i % 2}"/>' for i, (cx, c) in
                  enumerate([(188, SOL), (206, ICE), (304, ICE), (322, SOL)]))
    )
    waves = "".join(f'<path class="wv{i}" d="M0 {y}H400" stroke="{ICE}" stroke-opacity="{o}" stroke-dasharray="{d}"/>'
                    for i, (y, o, d) in enumerate([(190, .16, "14 22"), (201, .12, "22 30"), (215, .09, "30 40")]))
    css = [
        kf("bs", [(0, "transform:translateY(-175px);opacity:1;animation-timing-function:cubic-bezier(.15,.6,.35,1)"),
                  (52, "transform:translateY(0);animation-timing-function:ease-in"), (58, "transform:translateY(18px)"),
                  (86, "transform:translateY(18px);opacity:1"), (91, "transform:translateY(18px);opacity:0"),
                  (91.1, "transform:translateY(-175px);opacity:0"), (100, "transform:translateY(-175px);opacity:1")]),
        anim(".bs", "bs", T),
        kf("lgL", [(0, "transform:rotate(0)"), (30, "transform:rotate(0)"), (42, "transform:rotate(-150deg)"),
                   (91, "transform:rotate(-150deg)"), (91.1, "transform:rotate(0)"), (100, "transform:rotate(0)")]),
        kf("lgR", [(0, "transform:rotate(0)"), (30, "transform:rotate(0)"), (42, "transform:rotate(150deg)"),
                   (91, "transform:rotate(150deg)"), (91.1, "transform:rotate(0)"), (100, "transform:rotate(0)")]),
        anim(".lgL", "lgL", T, "ease-out"), anim(".lgR", "lgR", T, "ease-out"),
        kf("fl", [(0, "opacity:0"), (16, "opacity:0"), (19, "opacity:1"), (56, "opacity:1"), (58, "opacity:0"), (100, "opacity:0")]),
        anim(".fl", "fl", T),
        kf("dg", [(0, "opacity:0"), (30, "opacity:0"), (52, "opacity:.9"), (58, "opacity:0"), (100, "opacity:0")]),
        anim(".dg", "dg", T),
        kf("sp", [(0, "transform:scale(.3);opacity:0"), (50, "transform:scale(.3);opacity:0"), (54, "opacity:.7"),
                  (78, "transform:scale(1.8);opacity:0"), (100, "transform:scale(1.8);opacity:0")]),
        kf("wv", [(0, "stroke-dashoffset:0"), (100, "stroke-dashoffset:-72")]),
        anim(".wv0", "wv", 6), anim(".wv1", "wv", 9), anim(".wv2", "wv", 12),
        kf("dl", [(0, "opacity:1"), (50, "opacity:.2"), (100, "opacity:1")]),
        anim(".dl0", "dl", 1.4, "steps(1)"), anim(".dl1", "dl", 1.4, "steps(1)", -0.7),
        FLICKER,
    ]
    puffs = []
    for k, dx in enumerate([-30, -16, 16, 30]):
        css.append(anim(f".sp{k}", "sp", T, "ease-out", delay=-k * 0.05))
        puffs.append(f'<g transform="translate({x + dx} 166)"><ellipse class="sp{k}" rx="14" ry="6" fill="url(#smk)" opacity=".5"/></g>')
    defs = (FLAME_GRAD + SMOKE_GRAD +
            '<linearGradient id="bb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#f4f6ff"/><stop offset=".6" stop-color="#e2e6f5"/>'
            '<stop offset="1" stop-color="#9aa3c0"/></linearGradient>'
            '<linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0c1d3a"/><stop offset="1" stop-color="#04050a"/></linearGradient>'
            '<radialGradient id="dglow"><stop offset="0" stop-color="#ffc24b" stop-opacity=".9"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>')
    body = ('<rect y="176" width="400" height="74" fill="url(#sea)"/>' + waves + ship +
            f'<ellipse class="dg" cx="{x}" cy="168" rx="56" ry="9" fill="url(#dglow)"/>' + booster + "".join(puffs))
    return dict(defs=defs, css="".join(css), body=body, stars=40)


def s_moon():
    T = 7
    lm = (
        '<g class="lm" style="transform:translate(200px,135px)">'
        '<g class="pl"><g transform="translate(0 14)"><g class="fk"><path d="M-5 0Q-9 16 0 30Q9 16 5 0Z" fill="#dff1ff" opacity=".45"/></g></g></g>'
        '<g stroke="#cfd3de" stroke-width="1.4" fill="none"><path d="M-15 3L-27 20M15 3L27 20M-10 7L-24 20M10 7L24 20"/></g>'
        '<ellipse cx="-27" cy="20.5" rx="4" ry="1.3" fill="#cfd3de"/><ellipse cx="27" cy="20.5" rx="4" ry="1.3" fill="#cfd3de"/>'
        '<path d="M-4 8H4L6 14H-6Z" fill="#5d6589"/>'
        '<path d="M-16-7H16L18-3V5L16 8H-16L-18 5V-3Z" fill="url(#gold)"/>'
        '<path d="M-8-7V8M0-7V8M8-7V8" stroke="#8a5d1c" stroke-width=".6" opacity=".6"/>'
        '<path d="M-13-7L-15-16L-9-27H8L14-18L13-7Z" fill="#c9cdd8"/>'
        '<path d="M-9-27L-5-18H8V-27Z" fill="#a3aabd"/><path d="M8-27L14-18L8-18Z" fill="#8b92a8"/>'
        '<path d="M-12.5-17L-7-21.5V-15Z" fill="#10131f"/>'
        '<rect x="-3" y="-31" width="6" height="4" fill="#a3aabd"/>'
        '<path d="M9-27L14-35" stroke="#cfd3de"/><circle cx="14.5" cy="-36" r="2.2" fill="none" stroke="#cfd3de"/>'
        '<rect x="-18" y="-12" width="3" height="3" fill="#8b92a8"/><rect x="13" y="-12" width="3" height="3" fill="#8b92a8"/>'
        '</g>')
    css = [
        kf("lm", [(0, "transform:translate(200px,-40px);opacity:1;animation-timing-function:cubic-bezier(.2,.6,.35,1)"),
                  (52, "transform:translate(200px,135px)"), (60, "transform:translate(200px,143px)"),
                  (86, "transform:translate(200px,143px);opacity:1"), (90, "transform:translate(200px,143px);opacity:0"),
                  (90.1, "transform:translate(200px,-40px);opacity:0"), (100, "transform:translate(200px,-40px);opacity:1")]),
        anim(".lm", "lm", T),
        kf("pl", [(0, "opacity:1"), (58, "opacity:1"), (60, "opacity:0"), (98, "opacity:0"), (100, "opacity:1")]),
        anim(".pl", "pl", T),
        kf("sh", [(0, "transform:scale(.3);opacity:0"), (52, "transform:scale(1);opacity:.55"), (60, "transform:scale(1.05);opacity:.7"),
                  (86, "opacity:.7"), (90, "opacity:0"), (100, "transform:scale(.3);opacity:0")]),
        anim(".sh", "sh", T),
        kf("du", [(0, "transform:scale(.25);opacity:0"), (30, "transform:scale(.25);opacity:0"), (34, "opacity:.75"),
                  (52, "transform:scale(2.3);opacity:0"), (100, "transform:scale(2.3);opacity:0")]),
        kf("ds", [(0, "opacity:0"), (32, "opacity:0"), (42, "opacity:.6"), (60, "opacity:.5"), (70, "opacity:0"), (100, "opacity:0")]),
        anim(".ds", "ds", T),
        FLICKER,
    ]
    rings = []
    for k in range(3):
        css.append(anim(f".du{k}", "du", T, "ease-out", delay=-k * 0.42))
        rings.append(f'<ellipse class="du{k}" rx="30" ry="4.5" fill="none" stroke="#d9dce8" stroke-width="1.6" opacity=".4"/>')
    streaks = "".join(f'<path d="M{f(22 * math.cos(a))} {f(3 * math.sin(a))}L{f(62 * math.cos(a))} {f(7 * math.sin(a))}"/>'
                      for a in [i * math.pi / 7 + 0.2 for i in range(14)])
    defs = ('<linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/>'
            '<stop offset=".5" stop-color="#d9a441"/><stop offset="1" stop-color="#8a5d1c"/></linearGradient>'
            '<linearGradient id="reg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7084"/><stop offset="1" stop-color="#1b1e2a"/></linearGradient>'
            + SHADE)
    earth = ('<g transform="translate(338 64)"><circle r="16" fill="#7cc8ff" opacity=".12"/><circle r="11" fill="#2f7fd6"/>'
             '<path d="M-6-6Q-1-9 3-5Q-1-2-6-3ZM-8 3Q-3 1 1 5Q-4 7-8 3Z" fill="#e9f3ff" opacity=".8"/>'
             '<path d="M2-10.8A11 11 0 0 1 2 10.8A7 11 0 0 0 2-10.8Z" fill="#04050a" opacity=".8" transform="rotate(20)"/>'
             '<circle r="11" fill="url(#shd)"/></g>')
    body = (earth +
            '<path d="M0 152Q80 138 150 148T300 142T400 150V180H0Z" fill="#2c3040"/>'
            '<path d="M0 166Q60 158 120 164T240 162T400 166V250H0Z" fill="url(#reg)"/>'
            '<g fill="#262a37" stroke="#8a90a6" stroke-opacity=".5" stroke-width=".8">'
            '<ellipse cx="70" cy="180" rx="18" ry="3.5"/><ellipse cx="330" cy="176" rx="12" ry="2.5"/><ellipse cx="290" cy="196" rx="22" ry="4"/></g>'
            '<g transform="translate(206 164)"><ellipse class="sh" rx="24" ry="3" fill="#000" opacity=".55"/></g>'
            f'<g transform="translate(200 164)">{"".join(rings)}<g class="ds" stroke="#d9dce8" stroke-width="1" stroke-opacity=".7" opacity=".5">{streaks}</g></g>'
            + lm)
    return dict(defs=defs, css="".join(css), body=body, stars=44)


def s_mars():
    T = 9
    # Phase A: entry (0–33 %), B: parachute (33–66 %), C: sky crane (66–100 %)
    css = [
        kf("wa", [(0, "opacity:1"), (29, "opacity:1"), (33, "opacity:0"), (97, "opacity:0"), (100, "opacity:1")]),
        kf("wb", [(0, "opacity:0"), (30, "opacity:0"), (34, "opacity:1"), (63, "opacity:1"), (67, "opacity:0"), (100, "opacity:0")]),
        kf("wc", [(0, "opacity:0"), (63, "opacity:0"), (67, "opacity:1"), (96, "opacity:1"), (100, "opacity:0")]),
        anim(".wa", "wa", T), anim(".wb", "wb", T), anim(".wc", "wc", T),
        kf("ma", [(0, "transform:translate(292px,58px)"), (33, "transform:translate(206px,112px)"), (100, "transform:translate(292px,58px)")]),
        anim(".ma", "ma", T),
        kf("mb", [(0, "transform:translate(214px,48px) scale(.3)"), (31, "transform:translate(214px,48px) scale(.3)"),
                  (36, "transform:translate(214px,50px) scale(1)"), (66, "transform:translate(214px,82px) scale(1)"),
                  (100, "transform:translate(214px,82px) scale(1)")]),
        anim(".mb", "mb", T, "ease-out"),
        kf("sw", [(0, "transform:rotate(-5deg)"), (50, "transform:rotate(5deg)"), (100, "transform:rotate(-5deg)")]),
        anim(".sw", "sw", 1.6, "ease-in-out"),
        kf("mc", [(0, "transform:translate(214px,50px) scale(1.3)"), (64, "transform:translate(214px,50px) scale(1.3)"),
                  (80, "transform:translate(214px,72px) scale(1.3)"), (100, "transform:translate(214px,72px) scale(1.3)")]),
        anim(".mc", "mc", T, "ease-out"),
        kf("br", [(0, "transform:scaleY(1)"), (74, "transform:scaleY(1)"), (92, "transform:scaleY(2.6)"), (100, "transform:scaleY(2.6)")]),
        kf("rv", [(0, "transform:translateY(0)"), (74, "transform:translateY(0)"), (92, "transform:translateY(26px)"), (100, "transform:translateY(26px)")]),
        anim(".br", "br", T, "ease-in-out"), anim(".rv", "rv", T, "ease-in-out"),
        kf("gl", [(0, "opacity:.7;transform:scale(.9)"), (50, "opacity:1;transform:scale(1.12)"), (100, "opacity:.7;transform:scale(.9)")]),
        anim(".gl", "gl", 0.3),
        kf("st", [(0, "stroke-dashoffset:0"), (100, "stroke-dashoffset:40")]), anim(".stk", "st", 0.5),
        kf("dz", [(0, "opacity:0"), (78, "opacity:0"), (90, "opacity:.6"), (100, "opacity:.2")]), anim(".dz", "dz", T),
        FLICKER,
    ]
    entry = (
        '<g class="wa" opacity="0"><g class="ma" style="transform:translate(214px,100px)">'
        '<path class="stk" d="M8-8L120-78M14 0L128-66M0-12L100-86" stroke="url(#plt)" stroke-width="2" stroke-dasharray="26 14"/>'
        '<g class="gl"><circle r="28" fill="url(#hot)"/></g>'
        '<g transform="rotate(35)"><path d="M-20 0L-9-14H9L20 0Z" fill="#c9ccd8"/><path d="M-9-14H9L7-17H-7Z" fill="#9aa1b6"/>'
        '<path d="M-21 0Q0 10 21 0Q0 4-21 0Z" fill="#fff1c9"/></g></g></g>')
    gores = "".join(f'<rect x="{-32 + i * 8}" y="-30" width="8" height="30" fill="{FLAME if i % 2 else "#f4f1ea"}"/>' for i in range(8))
    chute = (
        '<g class="wb"><g class="mb" style="transform:translate(214px,66px)"><g class="sw">'
        f'<g clip-path="url(#dome)">{gores}<rect x="-32" y="-11" width="64" height="2.2" fill="#3a160c" opacity=".7"/></g>'
        '<g stroke="#e9edff" stroke-opacity=".55" stroke-width=".6"><path d="M-30-1L-2 42M-15-4L-1 42M15-4L1 42M30-1L2 42"/></g>'
        '<path d="M-4 42H4L12 54H-12Z" fill="#d7dbe7"/><path d="M-12 54H12L10 57H-10Z" fill="#9aa1b6"/></g></g></g>')
    thr = "".join(f'<g transform="translate({dx} 5) rotate({r})"><rect x="-2" y="-2" width="4" height="4" fill="#6b7288"/>{flame(0, 2, 2.4, 10)}</g>'
                  for dx, r in [(-22, 18), (-12, 6), (12, -6), (22, -18)])
    crane = (
        '<g class="wc" opacity="0"><g class="mc" style="transform:translate(214px,72px) scale(1.3)">'
        + thr +
        '<path d="M-22-6H22L18 5H-18Z" fill="#b9c0d6"/><path d="M-22-6H22V-3H-22Z" fill="#8f98bd"/>'
        '<g transform="translate(0 5)"><g class="br" style="transform:scaleY(2.6)">'
        '<path d="M-7 0L-9 16M0 0V16M7 0L9 16" stroke="#e9edff" stroke-opacity=".7" stroke-width=".7"/></g></g>'
        '<g class="rv" style="transform:translateY(26px)"><g transform="translate(0 21)">'
        '<rect x="-15" y="0" width="30" height="7" rx="1" fill="#e9edff"/><rect x="9" y="-9" width="2" height="9" fill="#cfd5e8"/>'
        '<rect x="7" y="-12" width="8" height="4" rx="1" fill="#cfd5e8"/><path d="M-15 1L-20-4L-17-6L-13 0Z" fill="#9aa1b6"/>'
        '<g fill="#232838" stroke="#8f98bd" stroke-width=".8"><circle cx="-11" cy="11" r="3.2"/><circle cx="0" cy="11" r="3.2"/><circle cx="11" cy="11" r="3.2"/></g>'
        '</g></g></g>'
        '<g class="dz" opacity=".2"><ellipse cx="214" cy="170" rx="46" ry="6" fill="url(#smk)"/></g></g>')
    labels = [("ENTRY · 10 g PEAK", "wa", 0), ("PARACHUTE · MACH 1.8", "wb", 1), ("SKY CRANE · TOUCHDOWN", "wc", 0)]
    lab = "".join(f'<text class="{c} mono" x="18" y="62" font-size="11" letter-spacing="1.2" fill="{SOL}" opacity="{o}">{t}</text>'
                  for t, c, o in labels)
    defs = (FLAME_GRAD + SMOKE_GRAD +
            '<linearGradient id="msky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0710" stop-opacity="0"/>'
            '<stop offset=".55" stop-color="#3b1a16" stop-opacity=".7"/><stop offset="1" stop-color="#b4643a" stop-opacity=".85"/></linearGradient>'
            '<radialGradient id="hot" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4d0"/><stop offset=".3" stop-color="#ffc24b" stop-opacity=".85"/>'
            '<stop offset=".65" stop-color="#ff4f9a" stop-opacity=".35"/><stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="plt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffc24b"/><stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></linearGradient>'
            '<clipPath id="dome"><path d="M-32 0Q-32-28 0-30Q32-28 32 0Q16-6 0-6Q-16-6-32 0Z"/></clipPath>')
    body = ('<rect y="40" width="400" height="136" fill="url(#msky)"/>'
            '<path d="M0 158Q70 138 140 150Q220 164 290 144Q350 134 400 148V250H0Z" fill="#6a2e18"/>'
            '<path d="M0 158Q70 138 140 150Q220 164 290 144Q350 134 400 148" fill="none" stroke="#e08a55" stroke-opacity=".45"/>'
            '<path d="M0 172Q100 164 200 170T400 168V250H0Z" fill="#3a160c"/>'
            '<g fill="#260d06"><ellipse cx="80" cy="184" rx="9" ry="2.5"/><ellipse cx="330" cy="180" rx="6" ry="2"/></g>'
            + entry + chute + crane + lab)
    return dict(defs=defs, css="".join(css), body=body, stars=34, star_h=130)


def s_shuttle():
    T = 8
    doors = (
        # top door hinged at y=-13, bottom door at y=+13 (orbiter frame: nose → +x)
        '<g transform="translate(0 -13)">'
        '<g class="rA" style="transform:scaleY(1)"><rect x="-50" y="-13" width="92" height="13" fill="url(#rad)"/>'
        '<path d="M-50-6.5H42M-27-13V0M-4-13V0M19-13V0" stroke="#5aa9e6" stroke-opacity=".5" stroke-width=".6"/></g>'
        '<g class="dA" style="transform:scaleY(0)"><rect x="-50" y="0" width="92" height="13" fill="#e9edff"/>'
        '<path d="M-27 0V13M-4 0V13M19 0V13" stroke="#aab3d4" stroke-width=".6"/></g></g>'
        '<g transform="translate(0 13)">'
        '<g class="rA" style="transform:scaleY(1)"><rect x="-50" y="0" width="92" height="13" fill="url(#rad)"/>'
        '<path d="M-50 6.5H42M-27 0V13M-4 0V13M19 0V13" stroke="#5aa9e6" stroke-opacity=".5" stroke-width=".6"/></g>'
        '<g class="dA" style="transform:scaleY(0)"><rect x="-50" y="-13" width="92" height="13" fill="#dfe4f2"/>'
        '<path d="M-27-13V0M-4-13V0M19-13V0" stroke="#aab3d4" stroke-width=".6"/></g></g>')
    orbiter = (
        '<g transform="translate(250 92) rotate(-12)"><g class="flt">'
        '<path d="M30-14L-38-56L-60-56L-66-16V16L-60 56L-38 56L30 14Z" fill="#dfe4f2"/>'
        '<path d="M30-14L-38-56M30 14L-38 56" stroke="#2a2f40" stroke-width="2.2"/>'
        '<path d="M-62-56V-16M-62 56V16" stroke="#aab3d4" stroke-width="1"/>'
        '<path d="M-74-15H60Q88-12 97 0Q88 12 60 15H-74Z" fill="#f2f4fb"/>'
        '<path d="M86-6Q97 0 86 6Q90 0 86-6Z" fill="#2a2f40"/>'
        '<path d="M66-7L76-5V5L66 7Z" fill="#1b2236"/>'
        '<rect x="-84" y="-14" width="10" height="7" rx="2" fill="#cfd5e8"/><rect x="-84" y="7" width="10" height="7" rx="2" fill="#cfd5e8"/>'
        '<path d="M-86-4H-74V4H-86Z" fill="#3a3f52"/>'
        '<path d="M-72 0H-40" stroke="#b9c0d6" stroke-width="3" stroke-linecap="round"/>'
        '<rect x="-50" y="-13" width="92" height="26" fill="#1b2236"/>'
        '<path d="M-40-13V13M-24-13V13M-8-13V13M8-13V13M24-13V13" stroke="#2c3550" stroke-width="1"/>'
        '<rect x="-20" y="-7" width="34" height="14" rx="3" fill="url(#gold2)"/>'
        '<rect x="-17" y="-12" width="10" height="5" fill="#2d4f9e" stroke="#7cc8ff" stroke-width=".4"/>'
        '<rect x="-17" y="7" width="10" height="5" fill="#2d4f9e" stroke="#7cc8ff" stroke-width=".4"/>'
        + doors + '</g></g>')
    css = [
        kf("dA", [(0, "transform:scaleY(1)"), (12, "transform:scaleY(1);animation-timing-function:ease-in"), (24, "transform:scaleY(0)"),
                  (76, "transform:scaleY(0);animation-timing-function:ease-out"), (88, "transform:scaleY(1)"), (100, "transform:scaleY(1)")]),
        kf("rA", [(0, "transform:scaleY(0)"), (24, "transform:scaleY(0);animation-timing-function:ease-out"), (36, "transform:scaleY(1)"),
                  (64, "transform:scaleY(1);animation-timing-function:ease-in"), (76, "transform:scaleY(0)"), (100, "transform:scaleY(0)")]),
        anim(".dA", "dA", T), anim(".rA", "rA", T),
        kf("flt", [(0, "transform:translate(0,0) rotate(0)"), (50, "transform:translate(4px,-3px) rotate(1.5deg)"), (100, "transform:translate(0,0) rotate(0)")]),
        anim(".flt", "flt", T, "ease-in-out"),
        kf("cl", [(0, "transform:translateX(0)"), (100, "transform:translateX(-200px)")]), anim(".cl", "cl", 40),
    ]
    rng = random.Random(9)
    clouds = "".join(f'<ellipse cx="{f(rng.uniform(0, 200))}" cy="{f(rng.uniform(140, 250))}" rx="{f(rng.uniform(10, 26))}" ry="{f(rng.uniform(2, 4))}"/>'
                     for _ in range(16))
    defs = ('<radialGradient id="ea" gradientUnits="userSpaceOnUse" cx="60" cy="300" r="320"><stop offset=".55" stop-color="#1d5fb0"/>'
            '<stop offset=".88" stop-color="#0d3570"/><stop offset="1" stop-color="#07183a"/></radialGradient>'
            '<radialGradient id="atm" gradientUnits="userSpaceOnUse" cx="110" cy="430" r="316"><stop offset=".94" stop-color="#7cc8ff" stop-opacity="0"/>'
            '<stop offset=".95" stop-color="#9bd6ff" stop-opacity=".55"/><stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></radialGradient>'
            '<clipPath id="ec"><circle cx="110" cy="430" r="300"/></clipPath>'
            '<linearGradient id="rad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cbe9ff"/><stop offset="1" stop-color="#8fc6f0"/></linearGradient>'
            '<linearGradient id="gold2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#b9822a"/></linearGradient>')
    body = ('<circle cx="110" cy="430" r="316" fill="url(#atm)"/><circle cx="110" cy="430" r="300" fill="url(#ea)"/>'
            f'<g clip-path="url(#ec)"><g class="cl" fill="#fff" opacity=".22"><g>{clouds}</g><g transform="translate(200 0)">{clouds}</g></g></g>'
            + orbiter)
    return dict(defs=defs, css="".join(css), body=body, stars=40)


def s_hangar():
    T = 8
    k = 1.05  # px per metre
    base = 174
    rockets = []
    # V-2 (14 m)
    rockets.append((118, 14, 2, '<path d="M-1.6 0V-11Q-1.6-14 0-15Q1.6-14 1.6-11V0Z" fill="#e9edff"/><path d="M-1.6-5H0V0H-1.6ZM0-10H1.6V-5H0Z" fill="#141827"/>'
                             '<path d="M-1.6-3L-4 0H-1.6ZM1.6-3L4 0H1.6Z" fill="#141827"/>', None))
    # Falcon 9-class two-stage kerosene rocket (70 m), unbranded
    h = 70 * k
    rockets.append((160, 70, 2, f'<rect x="-2.1" y="{-h + 6}" width="4.2" height="{h - 6}" fill="#eef1fb"/><path d="M-2.1 {-h + 6}Q-2.1 {-h} 0 {-h}Q2.1 {-h} 2.1 {-h + 6}Z" fill="#eef1fb"/>'
                             f'<rect x="-2.1" y="{-h * .58}" width="4.2" height="3" fill="#232838"/><rect x="-2.1" y="-3" width="4.2" height="3" fill="#8f98bd"/>', None))
    # N1 (105 m)
    h = 105 * k
    rockets.append((206, 105, 3, f'<path d="M-9 0L-6 {-h * .45}L-4 {-h * .62}L-3 {-h * .82}Q-3 {-h * .95} 0 {-h}Q3 {-h * .95} 3 {-h * .82}L4 {-h * .62}L6 {-h * .45}L9 0Z" fill="#dfe3ee"/>'
                              f'<path d="M-9 0L-6 {-h * .45}H6L9 0Z" fill="#cfd5e3"/><path d="M-6.6 {-h * .38}H6.6M-5.2 {-h * .5}H5.2" stroke="#3a3f52" stroke-width="1.4"/>', "105 m"))
    # Saturn V (110.6 m)
    h = 110.6 * k
    sv = (f'<path d="M0 {-h}V{-h + 8}" stroke="#dfe4f4" stroke-width="1"/><path d="M-3.5 {-h + 15}L0 {-h + 8}L3.5 {-h + 15}Z" fill="#dfe4f4"/>'
          f'<rect x="-3.5" y="{-h + 15}" width="7" height="{h * .3}" fill="#f2f4fb"/>'
          f'<path d="M-3.5 {-h + 15 + h * .3}L-5.3 {-h + 20 + h * .3}H5.3L3.5 {-h + 15 + h * .3}Z" fill="#f2f4fb"/>'
          f'<rect x="-5.3" y="{-h + 20 + h * .3}" width="10.6" height="{h * .7 - 20}" fill="#f2f4fb"/>'
          f'<rect x="-5.3" y="{-h * .39}" width="10.6" height="3" fill="#141827"/><rect x="-5.3" y="-22" width="2.6" height="12" fill="#141827"/>'
          f'<rect x="2.7" y="-34" width="2.6" height="12" fill="#141827"/><rect x="-3.5" y="{-h + 30}" width="7" height="3" fill="#141827"/>'
          '<path d="M-5.3-9L-8.5 0H-5.3ZM5.3-9L8.5 0H5.3Z" fill="#dfe4f4"/>')
    rockets.append((258, 110.6, 3.5, sv, "111 m"))
    # Starship (124 m)
    h = 124 * k
    ss = (f'<path d="M-4.7 0V{-h + 12}Q-4.7 {-h + 2} 0 {-h}Q4.7 {-h + 2} 4.7 {-h + 12}V0Z" fill="url(#steel)"/>'
          f'<path d="M-4.7 {-h * .4}V{-h + 12}Q-4.7 {-h + 2} 0 {-h}V{-h * .4}Z" fill="#1d2130"/>'
          f'<path d="M-4.7 {-h * .4}H4.7" stroke="#6b7288" stroke-width=".8"/>'
          f'<path d="M-4.7 {-h + 14}L-8 {-h + 20}V{-h + 24}H-4.7ZM4.7 {-h + 14}L8 {-h + 20}V{-h + 24}H4.7Z" fill="#8f98bd"/>'
          f'<path d="M-4.7 {-h * .45}L-8 {-h * .41}H-4.7ZM4.7 {-h * .45}L8 {-h * .41}H4.7Z" fill="#8f98bd"/>'
          f'<rect x="-6.5" y="{-h * .38}" width="1.8" height="2.5" fill="#6b7288"/><rect x="4.7" y="{-h * .38}" width="1.8" height="2.5" fill="#6b7288"/>')
    rockets.append((320, 124, 4.7, ss, "124 m"))
    css = [kf("hz", [(0, "opacity:.25"), (50, "opacity:.5"), (100, "opacity:.25")]), anim(".hz", "hz", 6, "ease-in-out")]
    rk_svg = []
    for i, (x, m, hw, art, label) in enumerate(rockets):
        s0 = 6 + i * 8
        css.append(kf(f"g{i}", [(0, "transform:scaleY(0)"), (s0, "transform:scaleY(0);animation-timing-function:cubic-bezier(.3,1.35,.5,1)"),
                                (s0 + 14, "transform:scaleY(1)"), (88, "transform:scaleY(1);animation-timing-function:ease-in"),
                                (95, "transform:scaleY(0)"), (100, "transform:scaleY(0)")]))
        css.append(anim(f".g{i}", f"g{i}", T))
        lab = ""
        if label:
            css.append(kf(f"l{i}", [(0, "opacity:0"), (s0 + 12, "opacity:0"), (s0 + 18, "opacity:1"), (86, "opacity:1"), (90, "opacity:0"), (100, "opacity:0")]))
            css.append(anim(f".l{i}", f"l{i}", T))
            lab = (f'<text class="l{i} mono" x="{f(x + hw + 5)}" y="{f(base - m * k + 12)}" font-size="10.5" fill="{TEXT2}">{label}</text>')
        rk_svg.append(f'<g transform="translate({x} {base})"><g class="g{i}">{art}</g></g>{lab}')
    statue = (
        f'<g transform="translate(62 {base})">'
        '<path d="M-22 0H22L18-7H-18Z" fill="#8c7b61"/>'
        '<path d="M-13-7H13L10.5-30L12-32L9-47H-9L-12-32L-10.5-30Z" fill="#a8977a"/>'
        '<path d="M-9-47H9V-45H-9Z" fill="#7d6d55"/>'
        '<g fill="#6fc2a8"><path d="M-7-47H7L6-60L4.6-72L3-78H-3L-4.6-72L-6-60Z"/><circle cy="-81" r="3"/>'
        '<path d="M-3.2-75L-7-91H-4.6L-1.2-76Z"/><path d="M3-66L7-64L6.2-60L2.6-61Z"/>'
        '<path d="M-8.4-92H-3.4L-4.2-95H-7.6Z"/></g>'
        '<path d="M0-84L0-88M-2.6-83.4L-4.6-87M2.6-83.4L4.6-87M-3.8-81.5L-6.6-83M3.8-81.5L6.6-83" stroke="#6fc2a8" stroke-width=".9"/>'
        f'<ellipse cx="-5.9" cy="-97.5" rx="1.8" ry="2.6" fill="{SOL}"/><ellipse class="hz" cx="-5.9" cy="-97.5" rx="6" ry="6" fill="{SOL}" opacity=".3"/>'
        '</g>')
    ref_y = base - 93 * k
    floor = (f'<rect y="{base}" width="400" height="{250 - base}" fill="#070913"/><path d="M0 {base}H400" stroke="#96aaff" stroke-opacity=".3"/>'
             '<g stroke="#96aaff" stroke-opacity=".08">' + "".join(f'<path d="M{f(200 + (i - 6) * 20)} {base}L{f(200 + (i - 6) * 70)} 250"/>' for i in range(13)) +
             f'<path d="M0 {base + 9}H400M0 {base + 22}H400M0 {base + 42}H400"/></g>')
    body = (f'<rect y="110" width="400" height="{base - 110}" fill="url(#dawn)"/>' + floor +
            f'<path d="M84 {f(ref_y)}H392" stroke="{SOL}" stroke-opacity=".38" stroke-dasharray="3 4"/>'
            f'<text class="mono" x="86" y="{f(ref_y - 5)}" font-size="10.5" fill="{SOL}" opacity=".85">93 m</text>'
            + statue + "".join(rk_svg))
    defs = ('<linearGradient id="dawn" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc24b" stop-opacity="0"/>'
            '<stop offset="1" stop-color="#ff9a5c" stop-opacity=".16"/></linearGradient>'
            '<linearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#e6e9f2"/><stop offset=".6" stop-color="#b9bfd0"/>'
            '<stop offset="1" stop-color="#7d8499"/></linearGradient>')
    return dict(defs=defs, css="".join(css), body=body, stars=32, star_h=110)


def s_builder():
    T = 9
    x, b = 112, 176
    parts = [
        ("s1", ICE, "S1", f'<path d="M-15 0V-48H15V0Z"/><path d="M-15-12L-22 0H-15ZM15-12L22 0H15Z"/>', -24, "y", -220),
        ("s2", NEBULA, "S2", '<path d="M-15-48L-12-54V-84H12V-54L15-48Z"/>', -69, "y", -190),
        ("s3", AURORA, "S3", '<path d="M-12-84L-10-88V-108H10V-88L12-84Z"/>', -96, "y", -160),
        ("fr", SOL, "", '<path d="M-10-108V-120Q-10-136 0-146Q10-136 10-120V-108Z"/>', -126, "y", -120),
    ]
    css, svg = [], []
    for i, (cls, col, lab, d, ly, axis, off) in enumerate(parts):
        s0 = 4 + i * 10
        move = f"translate{'X' if axis == 'x' else 'Y'}"
        css.append(kf(cls, [(0, f"transform:{move}({off}px);opacity:0"), (s0 - 1, f"transform:{move}({off}px);opacity:1;animation-timing-function:cubic-bezier(.25,1.4,.5,1)"),
                            (s0 + 9, f"transform:{move}(0)"), (92, f"transform:{move}(0);opacity:1"), (97, f"transform:{move}(0);opacity:0"),
                            (100, f"transform:{move}({off}px);opacity:0")]))
        css.append(anim(f".{cls}", cls, T))
        t = f'<text class="mono" x="0" y="{ly + 3.5}" text-anchor="middle" font-size="10" fill="{col}">{lab}</text>' if lab else ""
        svg.append(f'<g class="{cls}"><g fill="{col}" fill-opacity=".14" stroke="{col}" stroke-width="1.4" stroke-linejoin="round">{d}</g>{t}</g>')
        if i:
            css.append(kf(f"k{i}", [(0, "transform:scale(.3);opacity:0"), (s0 + 8, "transform:scale(.3);opacity:0"), (s0 + 9, "opacity:.9"),
                                    (s0 + 16, "transform:scale(1.6);opacity:0"), (100, "transform:scale(1.6);opacity:0")]))
            css.append(anim(f".k{i}", f"k{i}", T, "ease-out"))
            jy = [0, -48, -84, -108][i]
            svg.append(f'<g transform="translate(0 {jy})"><ellipse class="k{i} rm-hide" rx="22" ry="4" fill="none" stroke="#fff" stroke-width="1.2" style="opacity:0"/></g>')
    engines = '<path d="M-10 0L-12 5H-6L-8 0ZM-2 0L-4 5H4L2 0ZM6 0L4 5H10L8 0Z" fill="#5d6589"/>'
    stack = f'<g transform="translate({x} {b})">{engines}{"".join(svg)}</g>'
    # Δv bar
    bx, by, bw = 196, 86, 178
    scale = bw / 11.0
    segs = [(3.9, ICE), (3.8, NEBULA), (2.3, AURORA)]
    seg_svg, cx = [], bx
    for i, (dv, col) in enumerate(segs):
        w = dv * scale
        s0 = 48 + i * 8
        css.append(kf(f"b{i}", [(0, "transform:scaleX(0);opacity:1"), (s0, "transform:scaleX(0)"), (s0 + 8, "transform:scaleX(1)"),
                                (92, "transform:scaleX(1);opacity:1"), (97, "opacity:0"), (100, "transform:scaleX(0);opacity:0")]))
        css.append(anim(f".b{i}", f"b{i}", T, "ease-out"))
        seg_svg.append(f'<g transform="translate({f(cx)} {by})"><rect class="b{i}" width="{f(w)}" height="14" fill="{col}" fill-opacity=".85"/></g>')
        cx += w
    ox = bx + 9.4 * scale
    css.append(window_kf("ro", 72, 92, fade=4))
    css.append(anim(".ro", "ro", T))
    css.append(kf("gd", [(0, "stroke-dashoffset:0"), (100, "stroke-dashoffset:-16")]) + anim(".gd", "gd", 2))
    legend = "".join(f'<rect x="{bx + i * 58}" y="112" width="8" height="8" rx="2" fill="{c}"/>'
                     f'<text class="mono" x="{bx + 12 + i * 58}" y="119.5" font-size="10" fill="{MUTED}">S{i + 1} {dv}</text>'
                     for i, (dv, c) in enumerate(segs))
    panel = (
        f'<text class="mono" x="{bx}" y="{by - 12}" font-size="10.5" letter-spacing="1.6" fill="{MUTED}">Δv BUDGET</text>'
        f'<clipPath id="bar"><rect x="{bx}" y="{by}" width="{bw}" height="14" rx="7"/></clipPath>'
        f'<rect x="{bx}" y="{by}" width="{bw}" height="14" rx="7" fill="#0f1528" stroke="#96aaff" stroke-opacity=".25"/>'
        f'<g clip-path="url(#bar)">{"".join(seg_svg)}</g>'
        f'<path class="gd" d="M{f(ox)} {by - 6}V{by + 20}" stroke="{SOL}" stroke-width="1.3" stroke-dasharray="3 5"/>'
        f'<text class="mono" x="{f(ox)}" y="{by - 11}" text-anchor="middle" font-size="10" fill="{SOL}">orbit 9.4 km/s</text>'
        + legend +
        f'<g class="ro"><text class="sans" x="{bx}" y="150" font-size="24" font-weight="700" fill="{AURORA}">10.0 km/s</text>'
        f'<path d="M{bx + 124} 142l4 4 8-9" fill="none" stroke="{AURORA}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<text class="sans" x="{bx + 142}" y="147" font-size="12" fill="{TEXT2}">to orbit</text></g>'
    )
    defs = ('<pattern id="grid" width="16" height="16" patternUnits="userSpaceOnUse"><path d="M16 0H0V16" fill="none" stroke="#7cc8ff" stroke-opacity=".07"/></pattern>')
    body = '<rect width="400" height="250" fill="url(#grid)"/>' + stack + panel
    return dict(defs=defs, css="".join(css), body=body, stars=0)


# ------------------------------------------------------------------------- EXPLORE
CONTINENTS = [
    "M20-40L60-48L85-35L78-18L62-8L50 2L40-8L28-20Z", "M60 8L78 12L84 26L70 48L62 40L58 22Z",
    "M150-42L178-46L186-34L170-28L156-30Z", "M150-22L182-24L196-8L186 20L172 40L162 20L148 0Z",
    "M190-48L260-52L292-36L278-20L256-10L232-16L210-24L196-34Z", "M226-12L240-4L236 8Z", "M258-8L272 0L262 6Z",
    "M284 20L310 16L316 30L298 36L284 30Z", "M100-54L118-52L112-42L100-44Z",
]


def globe(cx, cy, r, cid, strip_speed=36, clouds=True):
    """Rotating globe: a continent strip scrolls behind a spherical shading overlay."""
    sc = r / 58
    cont = "".join(f'<path d="{d}"/>' for d in CONTINENTS)
    rng = random.Random(21)
    cl = "".join(f'<ellipse cx="{f(rng.uniform(0, 360))}" cy="{f(rng.uniform(-50, 50))}" rx="{f(rng.uniform(8, 22))}" ry="{f(rng.uniform(1.5, 3.5))}"/>'
                 for _ in range(18))
    defs = (f'<clipPath id="{cid}"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>'
            '<radialGradient id="oc" cx=".4" cy=".38" r=".7"><stop offset="0" stop-color="#3b8fe6"/><stop offset=".6" stop-color="#1a4f9c"/>'
            '<stop offset="1" stop-color="#0a2350"/></radialGradient>'
            '<radialGradient id="gsh" cx=".36" cy=".34" r=".75"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/>'
            '<stop offset=".78" stop-color="#01030a" stop-opacity=".35"/><stop offset="1" stop-color="#01030a" stop-opacity=".85"/></radialGradient>'
            '<radialGradient id="ag"><stop offset=".7" stop-color="#7cc8ff" stop-opacity=".35"/><stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></radialGradient>')
    css = (kf("gs", [(0, "transform:translateX(0)"), (100, f"transform:translateX({f(-360 * sc)}px)")]) + anim(".gs", "gs", strip_speed)
           + anim(".gc", "gs", strip_speed * 0.7))
    x0 = cx - r
    body = (f'<circle cx="{cx}" cy="{cy}" r="{f(r * 1.2)}" fill="url(#ag)"/><circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#oc)"/>'
            f'<g clip-path="url(#{cid})"><g transform="translate({f(x0)} {cy}) scale({f(sc, 3)})">'
            f'<g class="gs"><g fill="#3f9467" stroke="#3f9467" stroke-width="5" stroke-linejoin="round">{cont}</g>'
            f'<g transform="translate(360 0)" fill="#3f9467" stroke="#3f9467" stroke-width="5" stroke-linejoin="round">{cont}</g></g>'
            + (f'<g class="gc" fill="#fff" opacity=".4"><g>{cl}</g><g transform="translate(360 0)">{cl}</g></g>' if clouds else "")
            + f'</g></g><circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#gsh)"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="#9bd6ff" stroke-opacity=".55" stroke-width="1.2"/>')
    return defs, css, body


def s_earth():
    cx, cy, r = 232, 104, 54
    gd, gc, gb = globe(cx, cy, r, "gl")
    sats = [  # rx, ry, rot, period, colour, phase
        (78, 22, -20, 7, ICE, 0.6, "iss"),
        (72, 26, 62, 10, AURORA, 2.0, "dot"),
        (126, 30, -6, 20, SOL, 4.0, "dot"),
    ]
    back, front, sv, css = [], [], [], [gc]
    for i, (rx, ry, rot, T, col, ph, kind) in enumerate(sats):
        back.append(f'<path d="{ellipse_arc(cx, cy, rx, ry, rot, math.pi, 2 * math.pi, 40)}" stroke="{col}"/>')
        front.append(f'<path d="{ellipse_arc(cx, cy, rx, ry, rot, 0, math.pi, 40)}" stroke="{col}"/>')
        pts = ellipse_pts(cx, cy, rx, ry, rot, 48, phase=ph)
        css.append(orbit_kf(f"o{i}", pts, occl=(cx, cy, r + 1), size=(.8, 1.15)) + anim(f".o{i}", f"o{i}", T))
        x0, y0, _ = pts[0]
        if kind == "iss":
            g = ('<rect x="-7" y="-3" width="4" height="6" fill="#7cc8ff" opacity=".9"/><rect x="3" y="-3" width="4" height="6" fill="#7cc8ff" opacity=".9"/>'
                 '<path d="M-7 0H7" stroke="#e9edff" stroke-width="1"/><rect x="-2" y="-1.5" width="4" height="3" fill="#e9edff"/>')
        else:
            g = f'<circle r="5" fill="{col}" opacity=".2"/><circle r="2.2" fill="{col}"/>'
        sv.append(f'<g class="o{i}" style="transform:{tr(x0, y0)}">{g}</g>')
    body = (f'<g fill="none" stroke-width="1" stroke-opacity=".3">{"".join(back)}</g>' + gb +
            f'<g fill="none" stroke-width="1.1" stroke-opacity=".6">{"".join(front)}</g>' + "".join(sv))
    return dict(defs=gd, css="".join(css), body=body, stars=46)


def s_sky():
    T = 10
    P = (254, 72)
    ang = math.radians(56)
    local = {k: (v[0] * 1.3, v[1] * 1.3) for k, v in {"Dubhe": (0, 0), "Merak": (0, 17), "Phecda": (-22, 22), "Megrez": (-20, 3),
                                                      "Alioth": (-39, 0), "Mizar": (-56, 2), "Alkaid": (-73, 11)}.items()}
    D = (P[0] - 78 * math.sin(ang), P[1] + 78 * math.cos(ang))

    def place(p):
        x, y = p
        return (D[0] + x * math.cos(ang) - y * math.sin(ang), D[1] + x * math.sin(ang) + y * math.cos(ang))
    S = {k: place(v) for k, v in local.items()}
    dip = [S[n] for n in ["Alkaid", "Mizar", "Alioth", "Megrez", "Dubhe", "Merak", "Phecda", "Megrez"]]
    cas = [(304, 104), (319, 120), (334, 107), (350, 123), (366, 101)]
    mer = S["Merak"]
    css = [
        kf("dr", [(0, "stroke-dashoffset:1;opacity:1"), (6, "stroke-dashoffset:1"), (30, "stroke-dashoffset:0"),
                  (88, "stroke-dashoffset:0;opacity:1"), (96, "stroke-dashoffset:0;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]),
        kf("dc", [(0, "stroke-dashoffset:1;opacity:1"), (30, "stroke-dashoffset:1"), (46, "stroke-dashoffset:0"),
                  (88, "stroke-dashoffset:0;opacity:1"), (96, "stroke-dashoffset:0;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]),
        kf("dp", [(0, "stroke-dashoffset:1;opacity:1"), (46, "stroke-dashoffset:1"), (60, "stroke-dashoffset:0"),
                  (88, "stroke-dashoffset:0;opacity:1"), (96, "stroke-dashoffset:0;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]),
        anim(".ldr", "dr", T, "ease-in-out"), anim(".ldc", "dc", T, "ease-in-out"), anim(".ldp", "dp", T, "ease-in-out"),
        window_kf("la", 30, 88, 4), window_kf("lb", 46, 88, 4), window_kf("lc", 60, 88, 4),
        anim(".la", "la", T), anim(".lb", "lb", T), anim(".lc", "lc", T),
        kf("bs", [(0, "transform:scale(1);opacity:1"), (50, "transform:scale(.6);opacity:.55"), (100, "transform:scale(1);opacity:1")]),
        kf("met", [(0, "transform:translate(0,0);opacity:0"), (70, "transform:translate(0,0);opacity:0"), (71, "opacity:1"),
                   (76, "transform:translate(-70px,34px);opacity:0"), (100, "transform:translate(-70px,34px);opacity:0")]),
        anim(".met", "met", 7.3, "ease-in"),
    ]
    bright = []
    for i, (x, y) in enumerate(list(S.values()) + cas + [P]):
        big = (x, y) == P
        css.append(anim(f".b{i}", "bs", 2.2 + (i % 5) * 0.55, "ease-in-out", delay=-i * 0.37))
        bright.append(f'<g transform="translate({f(x)} {f(y)})"><g class="b{i}"><circle r="{7 if big else 5}" fill="url(#sg)"/>'
                      f'<circle r="{2.3 if big else 1.7}" fill="#fff"/></g></g>')
    tree = lambda x, h: f'<path d="M{x} 176L{x - h * .35} 176L{x} {176 - h}L{x + h * .35} 176Z"/>'
    ground = ('<path d="M0 170Q40 160 80 166T160 162Q210 170 250 164T330 168T400 160V250H0Z" fill="#020309"/>'
              f'<g fill="#020309">{tree(60, 22)}{tree(72, 16)}{tree(356, 20)}{tree(368, 26)}{tree(380, 15)}'
              '<path d="M286 170V160H306V170Z"/><path d="M286 160A10 10 0 0 1 306 160Z"/></g>'
              '<path d="M296 150L310 142" stroke="#020309" stroke-width="2.5"/>')
    defs = ('<linearGradient id="ns" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#03050d"/>'
            '<stop offset=".7" stop-color="#0b1430"/><stop offset="1" stop-color="#1c2c58"/></linearGradient>'
            '<radialGradient id="mw"><stop offset="0" stop-color="#d9d0ff" stop-opacity=".14"/><stop offset="1" stop-color="#b18cff" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="sg"><stop offset="0" stop-color="#cfe8ff" stop-opacity=".8"/><stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="mt" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></linearGradient>')
    body = ('<rect width="400" height="180" fill="url(#ns)"/>'
            '<ellipse cx="220" cy="110" rx="240" ry="36" fill="url(#mw)" transform="rotate(-28 220 110)"/>'
            f'<g fill="none" stroke="{ICE}" stroke-width="1.1" stroke-opacity=".75" stroke-linejoin="round">'
            f'<path class="ldr" d="{pts_path(dip)}" pathLength="1" stroke-dasharray="1 1"/>'
            f'<path class="ldc" d="{pts_path(cas)}" pathLength="1" stroke-dasharray="1 1"/></g>'
            f'<path class="ldp" d="M{f(mer[0])} {f(mer[1])}L{P[0]} {P[1]}" pathLength="1" stroke-dasharray="1 1" stroke="{SOL}" stroke-opacity=".55" stroke-width=".9"/>'
            + "".join(bright) +
            f'<text class="la mono" x="{f(S["Alkaid"][0] - 14)}" y="{f(S["Merak"][1] + 24)}" font-size="10.5" letter-spacing="1.6" fill="{ICE}">URSA MAJOR</text>'
            f'<text class="lb mono" x="{cas[2][0]}" y="{cas[3][1] + 18}" text-anchor="middle" font-size="10.5" letter-spacing="1.6" fill="{ICE}">CASSIOPEIA</text>'
            f'<text class="lc mono" x="{P[0] + 10}" y="{P[1] - 7}" font-size="10.5" letter-spacing="1.6" fill="{SOL}">POLARIS</text>'
            '<g transform="translate(150 30)"><path class="met rm-hide" d="M0 0L36-17" stroke="url(#mt)" stroke-width="1.2" style="opacity:0"/></g>'
            + ground)
    return dict(defs=defs, css="".join(css), body=body, stars=70, star_h=170)


def s_solar():
    cx, cy, tilt = 206, 104, -6
    planets = [  # rx, period, r, fill, phase
        (30, 3, 2.2, "#c9c2b6", 0.5), (44, 5, 3.2, "#f1d49b", 2.1), (60, 8, 3.6, "#4f9cff", 3.9),
        (78, 13, 2.8, FLAME, 1.2), (118, 26, 7.2, "url(#jup)", 4.6), (160, 40, 5.4, "#e3cc98", 2.8),
    ]
    back, front, pv, css = [], [], [], []
    for i, (rx, T, r, fill, ph) in enumerate(planets):
        ry = rx * 0.4
        back.append(f'<path d="{ellipse_arc(cx, cy, rx, ry, tilt, math.pi, 2 * math.pi, 40)}"/>')
        front.append(f'<path d="{ellipse_arc(cx, cy, rx, ry, tilt, 0, math.pi, 40)}"/>')
        pts = ellipse_pts(cx, cy, rx, ry, tilt, 48, phase=ph)
        css.append(orbit_kf(f"p{i}", pts, occl=(cx, cy, 15), size=(.8, 1.18)) + anim(f".p{i}", f"p{i}", T))
        x0, y0, _ = pts[0]
        extra = ""
        if i == 5:
            extra = (f'<ellipse rx="{r * 2.2}" ry="{r * .7}" fill="none" stroke="#f1e2bd" stroke-width="1.6" opacity=".8" transform="rotate(-14)"/>')
        if i == 2:
            extra = '<g class="mn"><circle cx="7" r="1" fill="#d9dbe6"/></g>'
        pv.append(f'<g class="p{i}" style="transform:{tr(x0, y0)}"><circle r="{r}" fill="{fill}"/><circle r="{r}" fill="url(#shd)"/>{extra}</g>')
    css.append(kf("mn", [(0, "transform:rotate(0)"), (100, "transform:rotate(360deg)")]) + anim(".mn", "mn", 2))
    css.append(kf("ab", [(0, "stroke-dashoffset:0"), (100, "stroke-dashoffset:-100")]) + anim(".ab", "ab", 60))
    css.append(kf("sp", [(0, "transform:scale(.94)"), (50, "transform:scale(1.08)"), (100, "transform:scale(.94)")]) + anim(".sp", "sp", 4, "ease-in-out"))
    belt = f'<path class="ab" d="{ellipse_arc(cx, cy, 96, 38.4, tilt, 0, 2 * math.pi, 80)}" pathLength="100" fill="none" stroke="#b9b2a6" stroke-opacity=".55" stroke-width="1.3" stroke-linecap="round" stroke-dasharray=".05 .95"/>'
    defs = (SHADE +
            '<radialGradient id="sun" cx=".42" cy=".4" r=".6"><stop offset="0" stop-color="#fffbe8"/><stop offset=".4" stop-color="#ffe29a"/>'
            '<stop offset=".8" stop-color="#ffb13b"/><stop offset="1" stop-color="#ff7a3d"/></radialGradient>'
            '<radialGradient id="sgl"><stop offset="0" stop-color="#ffd27a" stop-opacity=".7"/><stop offset=".35" stop-color="#ffb13b" stop-opacity=".2"/>'
            '<stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="jup" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8c9a0"/><stop offset=".3" stop-color="#c98f5a"/>'
            '<stop offset=".5" stop-color="#f0dcc0"/><stop offset=".7" stop-color="#b87a4b"/><stop offset="1" stop-color="#e9cfae"/></linearGradient>')
    body = (f'<g fill="none" stroke="#9fb4ff" stroke-opacity=".2">{"".join(back)}</g>{belt}'
            f'<g transform="translate({cx} {cy})"><g class="sp"><circle r="58" fill="url(#sgl)"/></g><circle r="13" fill="url(#sun)"/></g>'
            f'<g fill="none" stroke="#b7c6ff" stroke-opacity=".34">{"".join(front)}</g>' + "".join(pv))
    return dict(defs=defs, css="".join(css), body=body, stars=50)


def s_sun():
    cx, cy, r = 236, 110, 64
    T = 8
    a1, a2 = math.radians(-58), math.radians(-22)
    A = (cx + r * math.cos(a1), cy + r * math.sin(a1))
    B = (cx + r * math.cos(a2), cy + r * math.sin(a2))
    am = (a1 + a2) / 2
    C1 = (cx + (r + 58) * math.cos(am - 0.25), cy + (r + 58) * math.sin(am - 0.25))
    C2 = (cx + (r + 52) * math.cos(am + 0.2), cy + (r + 52) * math.sin(am + 0.2))
    prom = f"M{f(A[0])} {f(A[1])}C{f(C1[0])} {f(C1[1])} {f(C2[0])} {f(C2[1])} {f(B[0])} {f(B[1])}"
    b1, b2 = math.radians(186), math.radians(204)
    A2 = (cx + r * math.cos(b1), cy + r * math.sin(b1))
    B2 = (cx + r * math.cos(b2), cy + r * math.sin(b2))
    D2 = (cx + (r + 30) * math.cos((b1 + b2) / 2), cy + (r + 30) * math.sin((b1 + b2) / 2))
    prom2 = f"M{f(A2[0])} {f(A2[1])}Q{f(D2[0])} {f(D2[1])} {f(B2[0])} {f(B2[1])}"
    pv = (cx + (r + 8) * math.cos(am), cy + (r + 8) * math.sin(am))
    css = [
        kf("gr", [(0, "opacity:0"), (50, "opacity:1"), (100, "opacity:0")]), anim(".gA", "gr", 4, "ease-in-out"),
        anim(".gB", "gr", 4, "ease-in-out", -2),
        kf("co", [(0, "transform:scale(.95);opacity:.8"), (50, "transform:scale(1.07);opacity:1"), (100, "transform:scale(.95);opacity:.8")]),
        anim(".co", "co", 5, "ease-in-out"),
        kf("pr", [(0, "stroke-dashoffset:1;opacity:1"), (40, "stroke-dashoffset:0;opacity:1"), (62, "stroke-dashoffset:0;opacity:1"),
                  (82, "stroke-dashoffset:-1;opacity:.2"), (86, "stroke-dashoffset:-1;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]),
        anim(".pr", "pr", T, "ease-in-out"), anim(".pr2", "pr", T * 0.75, "ease-in-out", -3),
        kf("ss", [(0, "transform:translateX(-90px)"), (100, "transform:translateX(90px)")]), anim(".ss", "ss", 30),
        kf("fx", [(0, "opacity:0;transform:scale(.4)"), (30, "opacity:0;transform:scale(.4)"), (36, "opacity:1;transform:scale(1)"),
                  (50, "opacity:0;transform:scale(1.4)"), (100, "opacity:0;transform:scale(1.4)")]), anim(".fx", "fx", T),
    ]
    turb = lambda i, seed: (f'<filter id="gf{i}" x="0" y="0" width="1" height="1"><feTurbulence type="fractalNoise" baseFrequency=".17" '
                            f'numOctaves="2" seed="{seed}"/><feColorMatrix values="0 0 0 0 .62 0 0 0 0 .24 0 0 0 0 .02 2.6 0 0 0 -1.05"/></filter>')
    defs = ('<radialGradient id="sd" cx=".45" cy=".42" r=".6"><stop offset="0" stop-color="#fff7da"/><stop offset=".45" stop-color="#ffd36b"/>'
            '<stop offset=".82" stop-color="#ffab3d"/><stop offset=".96" stop-color="#ff7a3d"/><stop offset="1" stop-color="#e2531f"/></radialGradient>'
            '<radialGradient id="ld"><stop offset=".6" stop-color="#b8400f" stop-opacity="0"/><stop offset="1" stop-color="#9c2f08" stop-opacity=".55"/></radialGradient>'
            '<radialGradient id="cor"><stop offset=".55" stop-color="#ffc24b" stop-opacity=".45"/><stop offset=".75" stop-color="#ff7a3d" stop-opacity=".12"/>'
            '<stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>'
            f'<clipPath id="sc"><circle cx="{cx}" cy="{cy}" r="{r}"/></clipPath>'
            '<linearGradient id="pg" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#ffc24b"/><stop offset=".5" stop-color="#ff7a3d"/>'
            '<stop offset="1" stop-color="#ff4f9a"/></linearGradient>'
            '<radialGradient id="fl"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff3c4" stop-opacity="0"/></radialGradient>'
            + turb(0, 3) + turb(1, 11))
    spot = lambda x, y, s: (f'<g transform="translate({x} {y}) scale({s})"><ellipse rx="7" ry="5" fill="#8a3a10" opacity=".6"/>'
                            '<ellipse rx="3.4" ry="2.6" fill="#3a1204"/></g>')
    body = (f'<g transform="translate({cx} {cy})"><g class="co"><circle r="{r * 1.75}" fill="url(#cor)"/></g></g>'
            f'<path class="pr2" d="{prom2}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="url(#pg)" stroke-width="4" stroke-linecap="round" opacity=".85"/>'
            f'<g><path class="pr" d="{prom}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="#ff7a3d" stroke-opacity=".3" stroke-width="12" stroke-linecap="round"/>'
            f'<path class="pr" d="{prom}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="url(#pg)" stroke-width="5" stroke-linecap="round"/></g>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#sd)"/>'
            f'<g clip-path="url(#sc)"><rect class="gA" x="{cx - r}" y="{cy - r}" width="{2 * r}" height="{2 * r}" filter="url(#gf0)" opacity=".42"/>'
            f'<rect class="gB" x="{cx - r}" y="{cy - r}" width="{2 * r}" height="{2 * r}" filter="url(#gf1)" opacity=".42"/>'
            f'<g class="ss">{spot(cx - 12, cy - 8, 1)}{spot(cx + 4, cy - 4, .6)}{spot(cx - 30, cy + 22, .8)}</g></g>'
            f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="url(#ld)"/>'
            f'<g transform="translate({f(pv[0])} {f(pv[1])})"><circle class="fx rm-hide" r="12" fill="url(#fl)" style="opacity:0"/></g>')
    return dict(defs=defs, css="".join(css), body=body, stars=40)


def s_blackhole():
    cx, cy = 214, 102
    streaks, css = [], []
    rng = random.Random(5)
    for i in range(16):
        rx = 42 + i * 5.6 + rng.uniform(-1.5, 1.5)
        ry = rx * 0.17
        dash = rng.choice(["7 18", "4 21", "10 15", "3 9.5", "12 38"])
        period = 2.2 + (rx / 42) ** 1.5 * 1.6
        css.append(anim(f".k{i}", "rot", period, delay=-rng.uniform(0, period)))
        w = rng.uniform(.8, 1.8)
        streaks.append(f'<ellipse class="k{i}" rx="{f(rx)}" ry="{f(ry)}" pathLength="100" stroke-dasharray="{dash}" stroke-width="{f(w)}" opacity="{f(rng.uniform(.45, .95), 2)}"/>')
    css.append(kf("rot", [(0, "stroke-dashoffset:0"), (100, "stroke-dashoffset:100")]))
    css.append(kf("ring", [(0, "opacity:.8"), (50, "opacity:1"), (100, "opacity:.8")]) + anim(".ring", "ring", 3, "ease-in-out"))
    css.append(kf("lt", [(0, "stroke-dashoffset:0"), (100, "stroke-dashoffset:-100")]) + anim(".lt", "lt", 6))
    disk_ring = 'M-132 0A132 22 0 1 0 132 0A132 22 0 1 0 -132 0ZM-40 0A40 7 0 1 1 40 0A40 7 0 1 1 -40 0Z'
    top_arc = 'M-78 0C-78-70 78-70 78 0L47 0C47-52-47-52-47 0Z'
    defs = ('<linearGradient id="dp" gradientUnits="userSpaceOnUse" x1="-132" y1="0" x2="132" y2="0">'
            '<stop offset="0" stop-color="#fff6de"/><stop offset=".35" stop-color="#ffcf7a"/><stop offset=".7" stop-color="#e3822f"/><stop offset="1" stop-color="#8a3a12"/></linearGradient>'
            '<radialGradient id="dg" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="132"><stop offset=".25" stop-color="#ffe6b0" stop-opacity=".95"/>'
            '<stop offset=".6" stop-color="#ff9a3d" stop-opacity=".55"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="ta" gradientUnits="userSpaceOnUse" cx="0" cy="-4" r="80"><stop offset=".5" stop-color="#ffe9bf"/>'
            '<stop offset=".72" stop-color="#ffb04a" stop-opacity=".75"/><stop offset="1" stop-color="#ff7a3d" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="hl"><stop offset=".3" stop-color="#ff9a3d" stop-opacity=".18"/><stop offset="1" stop-color="#b18cff" stop-opacity="0"/></radialGradient>'
            '<clipPath id="bk"><rect x="-150" y="-80" width="300" height="80"/></clipPath>'
            '<clipPath id="fr"><rect x="-150" y="0" width="300" height="80"/></clipPath>'
            f'<g id="st" fill="none" stroke="url(#dp)">{"".join(streaks)}</g>')
    body = (f'<g transform="translate({cx} {cy})">'
            '<circle r="150" fill="url(#hl)"/>'
            '<g clip-path="url(#bk)"><path d="' + disk_ring + '" fill="url(#dg)" fill-rule="evenodd" opacity=".75"/>'
            '<use href="#st" xlink:href="#st"/></g>'
            f'<path d="{top_arc}" fill="url(#ta)" opacity=".9"/>'
            '<path class="lt" d="M-72 0C-72-66 72-66 72 0" pathLength="100" fill="none" stroke="#fff3d6" stroke-width="1" stroke-dasharray="6 14" opacity=".7"/>'
            '<path class="lt" d="M-56 0C-56-56 56-56 56 0" pathLength="100" fill="none" stroke="#ffd58a" stroke-width="1.4" stroke-dasharray="10 15" opacity=".6"/>'
            '<circle r="33" fill="#000"/>'
            '<circle class="ring" r="35" fill="none" stroke="#fff3d6" stroke-width="1.6"/>'
            '<circle r="37.5" fill="none" stroke="#ffc24b" stroke-opacity=".35" stroke-width="3"/>'
            '<path d="M-38 3C-38 34 38 34 38 3" fill="none" stroke="#ffd58a" stroke-width="2" opacity=".6"/>'
            '<g clip-path="url(#fr)"><path d="' + disk_ring + '" fill="url(#dg)" fill-rule="evenodd"/>'
            '<use href="#st" xlink:href="#st"/></g>'
            '</g>')
    return dict(defs=defs, css="".join(css), body=body, stars=44)


def s_scale():
    T = 12
    cx, cy = 150, 106
    objs = [
        ("0", "Person", ICE, f'<g stroke="{ICE}" stroke-width="2.2" stroke-linecap="round" fill="none"><circle cy="-15" r="4.5"/>'
                             '<path d="M0-10V6M0 6L-6 18M0 6L6 18M-9-4L0-6L9-4"/></g>'),
        ("7", "Earth", "#4f9cff", '<circle r="26" fill="#2f7fd6"/><path d="M-14-12Q-4-18 4-10Q-2-2-12-4ZM-4 6Q8 2 14 10Q6 18-4 12Z" fill="#3f9467"/>'
                                  '<circle r="26" fill="url(#shd)"/>'),
        ("9", "The Sun", SOL, '<circle r="30" fill="url(#sn)"/>'),
        ("13", "Solar system", FLAME, '<circle r="4" fill="#ffc24b"/><g fill="none" stroke="#ffc24b" stroke-opacity=".5">'
                                      '<ellipse rx="14" ry="10"/><ellipse rx="24" ry="17"/><ellipse rx="34" ry="24"/></g>'
                                      '<circle cx="14" r="1.8" fill="#7cc8ff"/><circle cx="-17" cy="-17" r="2.4" fill="#e3cc98"/>'),
        ("21", "Milky Way", NEBULA, '<g fill="none" stroke="#d6c4ff" stroke-width="3" stroke-linecap="round" opacity=".8">'
                                    '<path d="M0 0C10-4 18 4 16 14C12 26-10 28-22 16"/><path d="M0 0C-10 4-18-4-16-14C-12-26 10-28 22-16"/></g>'
                                    '<circle r="6" fill="#fff4dc"/>'),
        ("27", "Observable universe", PLASMA, "".join(
            f'<circle cx="{f(22 * math.cos(a) * (0.5 + (i % 3) * .25))}" cy="{f(22 * math.sin(a) * (0.5 + (i % 3) * .25))}" r="1.6" fill="#ffb0d0"/>'
            for i, a in enumerate([k * 0.7 for k in range(18)])) +
            '<g fill="none" stroke="#ff4f9a" stroke-opacity=".5"><path d="M-20-8L-6-14L8-4L20-12M-6-14L-2 6L14 12M-2 6L-16 14"/></g>'),
    ]
    n = len(objs)
    step = T / n
    smax, smin = 5.0, 0.06
    p1 = math.log(smax) / math.log(smax / smin)  # fraction of the loop when scale == 1
    def op(p):
        if p < 0.16:
            return 0.0
        if p < 0.36:
            return (p - 0.16) / 0.2
        return 1.0 if p < 0.62 else max(0.0, 1 - (p - 0.62) / 0.22)
    stops = []
    for i in range(41):
        p = i / 40
        s = smax * (smin / smax) ** p
        o = op(p)
        stops.append((p * 100, f"transform:scale({f(s, 3)});opacity:{f(o, 2)}"))
    css = [kf("zm", stops)]
    rings, counters = [], []
    t_static = 1 * step
    for k, (pw, name, col, art) in enumerate(objs):
        d = neg(k * step - p1 * T, T)
        css.append(anim(f".z{k}", "zm", T, delay=d))
        ps = ((t_static - d) % T) / T
        s = smax * (smin / smax) ** ps
        o = op(ps)
        rings.append(f'<g class="z{k}" style="transform:scale({f(s, 3)});opacity:{f(o, 2)}">'
                     f'<circle r="44" fill="none" stroke="{col}" stroke-opacity=".55" stroke-width="1.2" vector-effect="non-scaling-stroke"/>{art}</g>')
        dd = neg(k * step - step / 2, T)
        css.append(anim(f".c{k}", "cw", T, delay=dd))
        vis = "1" if k == 1 else "0"
        counters.append(f'<g class="c{k}" opacity="{vis}"><text class="sans" x="318" y="112" text-anchor="middle" font-size="36" font-weight="700" fill="{TEXT}">10'
                        f'<tspan font-size="20" dy="-17">{pw}</tspan><tspan font-size="22" dy="17" fill="{MUTED}"> m</tspan></text>'
                        f'<text class="sans" x="318" y="134" text-anchor="middle" font-size="13" fill="{col}">{name}</text></g>')
    css.append(window_kf("cw", 2, 100 / n - 2, fade=2))
    body = (f'<g transform="translate({cx} {cy})">{"".join(rings)}</g>'
            f'<text class="mono" x="318" y="66" text-anchor="middle" font-size="10.5" letter-spacing="2" fill="{MUTED}">SIZE</text>'
            + "".join(counters) +
            '<g stroke="#96aaff" stroke-opacity=".35"><path d="M262 150H374"/>' +
            "".join(f'<path d="M{262 + i * 16} 147V153"/>' for i in range(8)) + '</g>')
    defs = (SHADE + '<radialGradient id="sn" cx=".45" cy=".42" r=".6"><stop offset="0" stop-color="#fff7da"/><stop offset=".5" stop-color="#ffd36b"/>'
            '<stop offset="1" stop-color="#ff7a3d"/></radialGradient>')
    return dict(defs=defs, css="".join(css), body=body, stars=44)


def s_spaceweather():
    T = 6
    ex, ey, er = 302, 104, 12
    k_bs, x_bs = 0.0152, 262
    css = [kf("wind", [(0, "stroke-dashoffset:0"), (100, "stroke-dashoffset:-48")])]
    lines = []
    rng = random.Random(8)
    for i, y0 in enumerate(range(52, 172, 10)):
        dy0 = y0 - ey
        sgn = 1 if dy0 >= 0 else -1
        pts = []
        for x in range(30, 420, 6):
            yy = abs(dy0)
            if x > x_bs - 30:
                yb = math.sqrt(max(0, (x - x_bs + 8) / k_bs)) + 6
                blend = min(1, (x - (x_bs - 30)) / 40)
                yy = max(yy, yy * (1 - blend) + yb * blend) if yb > yy * 0.6 else yy
            pts.append((x, ey + sgn * yy))
        lines.append(f'<path class="w{i % 4}" d="{pts_path(pts)}" stroke-dashoffset="{(i * 7) % 24}"/>')
    for j in range(4):
        css.append(anim(f".w{j}", "wind", 1.2 + j * 0.15, delay=-j * 0.37))
    bs = [(x_bs + k_bs * (y - ey) ** 2, y) for y in range(22, 188, 4)]
    mp = [(282 + 0.0275 * (y - ey) ** 2, y) for y in range(52, 158, 4)]
    field = []
    for L in (1.9, 2.6, 3.3):
        pts = []
        for i in range(41):
            lam = -1.2 + 2.4 * i / 40
            rr = L * er * math.cos(lam) ** 2
            pts.append((ex - rr * math.cos(lam) * 0.85, ey - rr * math.sin(lam)))
        field.append(f'<path d="{pts_path(pts)}"/>')
        for s in (-1, 1):
            field.append(f'<path d="M{ex} {ey + s * er * .7}C{ex + 18} {ey + s * (L * 9)} {ex + 60} {ey + s * (L * 8)} 410 {ey + s * (L * 6.5)}"/>')
    css += [
        kf("cme", [(0, "transform:translate(40px,0) scale(.4);opacity:0"), (6, "opacity:.9"),
                   (52, "transform:translate(240px,0) scale(1.35);opacity:.7"), (60, "transform:translate(262px,0) scale(1.45);opacity:0"),
                   (100, "transform:translate(262px,0) scale(1.45);opacity:0")]),
        anim(".cme", "cme", T, "ease-in"),
        kf("cmp", [(0, "transform:scaleX(1)"), (50, "transform:scaleX(1)"), (58, "transform:scaleX(.86)"), (78, "transform:scaleX(1)"), (100, "transform:scaleX(1)")]),
        anim(".cmp", "cmp", T, "ease-in-out"),
        kf("au", [(0, "opacity:.35"), (52, "opacity:.35"), (60, "opacity:1"), (64, "opacity:.7"), (70, "opacity:1"), (86, "opacity:.35"), (100, "opacity:.35")]),
        anim(".au", "au", T),
        kf("sg", [(0, "transform:scale(1)"), (50, "transform:scale(1.05)"), (100, "transform:scale(1)")]), anim(".sgl", "sg", 4, "ease-in-out"),
    ]
    earth = (f'<g transform="translate({ex} {ey})"><circle r="{er}" fill="url(#eo)"/>'
             f'<path d="M0-{er}A{er} {er} 0 0 1 0 {er}A{er * .45} {er} 0 0 0 0-{er}Z" fill="#02040c" opacity=".65"/>'
             f'<g class="au"><ellipse cy="-{er - 1}" rx="7" ry="2.4" fill="{AURORA}" opacity=".9"/><ellipse cy="-{er - 1}" rx="12" ry="5" fill="url(#aug)"/>'
             f'<ellipse cy="{er - 1}" rx="7" ry="2.4" fill="{AURORA}" opacity=".9"/><ellipse cy="{er - 1}" rx="12" ry="5" fill="url(#aug)"/></g></g>')
    defs = ('<radialGradient id="sun" cx="1" cy=".5" r="1"><stop offset="0" stop-color="#fff4d0"/><stop offset=".25" stop-color="#ffc24b"/>'
            '<stop offset=".6" stop-color="#ff7a3d"/><stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="wg" gradientUnits="userSpaceOnUse" x1="30" y1="0" x2="400" y2="0"><stop offset="0" stop-color="#ffc24b" stop-opacity=".9"/>'
            '<stop offset=".6" stop-color="#ff7a3d" stop-opacity=".55"/><stop offset="1" stop-color="#ff4f9a" stop-opacity=".15"/></linearGradient>'
            '<radialGradient id="eo" cx=".35" cy=".4" r=".7"><stop offset="0" stop-color="#5fb0ff"/><stop offset="1" stop-color="#16448f"/></radialGradient>'
            '<radialGradient id="aug"><stop offset="0" stop-color="#4ef0b8" stop-opacity=".8"/><stop offset="1" stop-color="#4ef0b8" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="cg"><stop offset=".4" stop-color="#ff4f9a" stop-opacity=".0"/><stop offset=".8" stop-color="#ff4f9a" stop-opacity=".5"/>'
            '<stop offset="1" stop-color="#ffc24b" stop-opacity="0"/></radialGradient>')
    body = ('<g transform="translate(-40 104)"><g class="sgl"><circle r="118" fill="url(#sun)" opacity=".55"/></g><circle r="68" fill="url(#sun)"/></g>'
            f'<g fill="none" stroke="url(#wg)" stroke-width="1.3" stroke-dasharray="6 18" stroke-linecap="round">{"".join(lines)}</g>'
            '<g transform="translate(0 104)"><g class="cme rm-hide" style="opacity:0"><path d="M0-46Q34 0 0 46Q22 0 0-46Z" fill="url(#cg)"/>'
            '<path d="M0-46Q30 0 0 46" fill="none" stroke="#ff9ac4" stroke-width="1.6" opacity=".8"/></g></g>'
            f'<g transform="translate({ex} {ey})"><g class="cmp"><g transform="translate({-ex} {-ey})">'
            f'<path d="{pts_path(bs)}" fill="none" stroke="{ICE}" stroke-width="5" stroke-opacity=".12"/>'
            f'<path d="{pts_path(bs)}" fill="none" stroke="{ICE}" stroke-width="1.4" stroke-opacity=".75"/>'
            f'<path d="{pts_path(mp)}" fill="none" stroke="{NEBULA}" stroke-width="1.1" stroke-opacity=".6"/>'
            f'<g fill="none" stroke="{NEBULA}" stroke-opacity=".38" stroke-width=".9">{"".join(field)}</g></g></g></g>'
            + earth)
    return dict(defs=defs, css="".join(css), body=body, stars=36)


def galaxy(seed, n, radius, cols, arms=2):
    rng = random.Random(seed)
    out = []
    for i in range(n):
        arm = i % arms
        t = rng.random() ** 0.8
        th = t * 3.4 + arm * 2 * math.pi / arms
        rr = 4 + t * radius
        x = rr * math.cos(th) + rng.gauss(0, 2.2 + t * 2.5)
        y = rr * math.sin(th) + rng.gauss(0, 2.2 + t * 2.5)
        c = cols[0] if t < 0.35 else rng.choice(cols)
        out.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="{f(0.5 + rng.random() * 0.9, 2)}" fill="{c}" opacity="{f(.45 + .55 * rng.random(), 2)}"/>')
    return "".join(out)


def s_galaxies():
    T = 12
    cx, cy = 206, 104
    A = galaxy(1, 190, 58, ["#fff4dc", "#bfe3ff", "#7cc8ff", "#e9edff"])
    B = galaxy(2, 170, 50, ["#ffe7f2", "#d6c4ff", "#b18cff", "#ff9ac4"])
    css = [
        kf("gA", [(0, "transform:translate(-100px,-18px);opacity:0"), (8, "opacity:1"), (48, "transform:translate(-62px,-10px) scale(1)"),
                  (64, "transform:translate(-16px,-3px) scale(.85)"), (74, "transform:translate(0,0) scale(.55);opacity:.7"),
                  (80, "transform:translate(0,0) scale(.45);opacity:0"), (100, "transform:translate(-100px,-18px);opacity:0")]),
        kf("gB", [(0, "transform:translate(100px,18px);opacity:0"), (8, "opacity:1"), (48, "transform:translate(62px,10px) scale(1)"),
                  (64, "transform:translate(16px,3px) scale(.85)"), (74, "transform:translate(0,0) scale(.55);opacity:.7"),
                  (80, "transform:translate(0,0) scale(.45);opacity:0"), (100, "transform:translate(100px,18px);opacity:0")]),
        anim(".gA", "gA", T, "ease-in-out"), anim(".gB", "gB", T, "ease-in-out"),
        kf("sa", [(0, "transform:rotate(0)"), (100, "transform:rotate(-360deg)")]), anim(".sa", "sa", 24),
        kf("sb", [(0, "transform:rotate(0)"), (100, "transform:rotate(360deg)")]), anim(".sb", "sb", 20),
        kf("mg", [(0, "transform:scale(.5);opacity:0"), (64, "transform:scale(.5);opacity:0"), (78, "transform:scale(1);opacity:1"),
                  (92, "transform:scale(1.1);opacity:.9"), (99, "transform:scale(1.1);opacity:0"), (100, "transform:scale(.5);opacity:0")]),
        anim(".mg", "mg", T, "ease-out"),
        kf("tt", [(0, "opacity:0"), (40, "opacity:0"), (58, "opacity:.8"), (80, "opacity:.5"), (95, "opacity:0"), (100, "opacity:0")]),
        anim(".tt", "tt", T),
    ]
    defs = ('<radialGradient id="cA"><stop offset="0" stop-color="#fff8e6"/><stop offset=".35" stop-color="#ffe2a8" stop-opacity=".6"/>'
            '<stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="cB"><stop offset="0" stop-color="#fff0f6"/><stop offset=".35" stop-color="#ffc4de" stop-opacity=".55"/>'
            '<stop offset="1" stop-color="#b18cff" stop-opacity="0"/></radialGradient>'
            '<radialGradient id="el"><stop offset="0" stop-color="#fff6e0"/><stop offset=".25" stop-color="#ffd9a8" stop-opacity=".7"/>'
            '<stop offset=".6" stop-color="#d6c4ff" stop-opacity=".25"/><stop offset="1" stop-color="#b18cff" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="tl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b18cff" stop-opacity="0"/>'
            '<stop offset=".5" stop-color="#d6c4ff" stop-opacity=".6"/><stop offset="1" stop-color="#7cc8ff" stop-opacity="0"/></linearGradient>')
    lab = lambda t, x, y: f'<text class="mono" x="{x}" y="{y}" text-anchor="middle" font-size="10" letter-spacing="1.4" fill="{MUTED}">{t}</text>'
    body = (f'<g transform="translate({cx} {cy})">'
            '<g class="tt" opacity=".45" fill="none" stroke="url(#tl)" stroke-width="3" stroke-linecap="round">'
            '<path d="M-60-10C-30-50 40-40 90-60"/><path d="M60 10C30 50-40 40-90 60"/></g>'
            '<g class="mg" style="opacity:0"><ellipse rx="62" ry="40" fill="url(#el)" transform="rotate(-12)"/></g>'
            '<g class="gA" style="transform:translate(-62px,-10px)"><g transform="rotate(-24) scale(1 .52)"><g class="sa">'
            f'<circle r="60" fill="url(#cA)" opacity=".45"/>{A}<circle r="12" fill="url(#cA)"/></g></g>{lab("MILKY WAY", 0, 44)}</g>'
            '<g class="gB" style="transform:translate(62px,10px)"><g transform="rotate(32) scale(1 .62)"><g class="sb">'
            f'<circle r="52" fill="url(#cB)" opacity=".45"/>{B}<circle r="10" fill="url(#cB)"/></g></g>{lab("ANDROMEDA", 0, -38)}</g>'
            '</g>')
    return dict(defs=defs, css="".join(css), body=body, stars=50)


# --------------------------------------------------------------------------- LEARN
def s_orbits():
    T = 10
    cx, cy, R, r0 = 214, 112, 50, 66
    ecc = [(0.6, FLAME), (0.3, SOL), (0.14, NEBULA), (0.0, AURORA)]
    windows = [(4, 11), (13, 23), (25, 40), (42, 66)]
    css, paths, balls = [], [], []
    for i, ((e, col), (s0, s1)) in enumerate(zip(ecc, windows)):
        pts = []
        th = 0.0
        while True:
            rr = r0 * (1 - e) / (1 - e * math.cos(th))
            pts.append((cx + rr * math.sin(th), cy - rr * math.cos(th)))
            if rr <= R + 0.5 or th >= 2 * math.pi:
                break
            th += 0.03
        L, at = arclen_sampler(pts)
        d = pts_path(pts)
        css.append(kf(f"t{i}", [(0, "stroke-dashoffset:1;opacity:1"), (s0, "stroke-dashoffset:1;animation-timing-function:linear"), (s1, "stroke-dashoffset:0"),
                                (90, "stroke-dashoffset:0;opacity:1"), (97, "stroke-dashoffset:0;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]))
        css.append(anim(f".t{i}", f"t{i}", T))
        paths.append(f'<path class="t{i}" d="{d}" pathLength="1" stroke-dasharray="1 1" stroke="{col}" stroke-width="{2.2 if e == 0 else 1.8}" '
                     f'stroke-opacity="{1 if e == 0 else .8}"/>')
        if e > 0:
            stops = [(0, f"transform:{tr(*at(0)[:2])};opacity:0"), (s0, f"transform:{tr(*at(0)[:2])};opacity:1")]
            for j in range(1, 13):
                stops.append((s0 + (s1 - s0) * j / 12, f"transform:{tr(*at(j / 12)[:2])};opacity:1"))
            stops += [(s1 + 3, f"transform:{tr(*at(1)[:2])};opacity:0"), (100, f"transform:{tr(*at(1)[:2])};opacity:0")]
            css.append(kf(f"bl{i}", stops) + anim(f".bl{i}", f"bl{i}", T))
            balls.append(f'<g class="bl{i} rm-hide" style="opacity:0"><circle r="2.4" fill="#fff"/></g>')
            hx, hy, _ = at(1)
            css.append(kf(f"im{i}", [(0, "transform:scale(0);opacity:0"), (s1 - .5, "transform:scale(0);opacity:0"), (s1, "opacity:1"),
                                     (s1 + 5, "transform:scale(1);opacity:0"), (100, "transform:scale(1);opacity:0")]) + anim(f".im{i}", f"im{i}", T, "ease-out"))
            balls.append(f'<g transform="translate({f(hx)} {f(hy)})"><circle class="im{i} rm-hide" r="7" fill="none" stroke="{col}" style="opacity:0"/></g>')
        else:
            # the orbiting ball keeps going round after the circle is drawn
            stops = [(0, f"transform:{tr(cx, cy - r0)};opacity:0"), (s0, f"transform:{tr(cx, cy - r0)};opacity:1")]
            n = 36
            t_end = 96
            for j in range(1, n + 1):
                p = s0 + (t_end - s0) * j / n
                a = 2 * math.pi * 1.9 * j / n * (1 if p > s1 else 1)
                stops.append((p, f"transform:{tr(cx + r0 * math.sin(a), cy - r0 * math.cos(a))};opacity:1"))
            stops.append((99, f"transform:{tr(cx + r0 * math.sin(2 * math.pi * 1.9), cy - r0 * math.cos(2 * math.pi * 1.9))};opacity:0"))
            stops.append((100, f"transform:{tr(cx, cy - r0)};opacity:0"))
            css.append(kf("orb", stops) + anim(".orb", "orb", T))
            a = math.radians(130)
            balls.append(f'<g class="orb" style="transform:{tr(cx + r0 * math.sin(a), cy - r0 * math.cos(a))}"><circle r="5" fill="{AURORA}" opacity=".25"/>'
                         f'<circle r="2.8" fill="#eafff7"/></g>')
    css.append(window_kf("lv", 60, 92, 4) + anim(".lv", "lv", T))
    mount = f'<path d="M{cx - 9} {cy - R + 1.5}L{cx - 1.5} {cy - r0 + 2}H{cx + 1.5}L{cx + 9} {cy - R + 1.5}Z" fill="#8f98bd"/>'
    cannon = f'<rect x="{cx - 1}" y="{cy - r0 - 2}" width="8" height="3.4" rx="1.2" fill="{TEXT}"/>'
    gd, gc, gb = globe(cx, cy, R, "gl", strip_speed=40, clouds=False)
    css.append(gc)
    body = (gb + mount + cannon +
            f'<g fill="none" stroke-linecap="round">{"".join(paths)}</g>' + "".join(balls) +
            f'<g class="lv"><text class="mono" x="{cx + r0 + 20}" y="{cy + 2}" font-size="12" fill="{AURORA}">v = 7.9 km/s</text>'
            f'<text class="mono" x="{cx + r0 + 20}" y="{cy + 18}" font-size="10.5" fill="{MUTED}">falls forever:</text>'
            f'<text class="mono" x="{cx + r0 + 20}" y="{cy + 32}" font-size="10.5" fill="{MUTED}">an orbit</text></g>')
    defs = gd
    return dict(defs=defs, css="".join(css), body=body, stars=40)


def s_equations():
    T = 12
    ox, oy, pw, ph = 238, 160, 138, 100
    sub = lambda t: f'<tspan font-size="14" dy="5">{t}</tspan><tspan dy="-5"> </tspan>'
    sup = lambda t: f'<tspan font-size="14" dy="-10">{t}</tspan><tspan dy="10"> </tspan>'
    it = lambda t: f'<tspan font-style="italic">{t}</tspan>'
    eqs = [
        ("ROCKET EQUATION", f'{it("Δv")} = {it("v")}{sub("e")} ln({it("m")}{sub("0")}/{it("m")}{sub("f")})', FLAME,
         'mass ratio 8 → Δv ≈ 2.08 v<tspan font-size="8" dy="3">e</tspan>', lambda u: (1 + 9 * u, math.log(1 + 9 * u) / math.log(10)), 7 / 9, 'm<tspan font-size="7.5" dy="2">0</tspan><tspan dy="-2">/m</tspan><tspan font-size="7.5" dy="2">f</tspan>', "Δv"),
        ("KEPLER'S THIRD LAW", f'{it("T")}{sup("2")} ∝ {it("a")}{sup("3")}', NEBULA,
         "Mars: a = 1.52 AU → T = 1.88 yr", lambda u: (u, (1.6 * u) ** 1.5 / 2.05), 1.524 / 1.6, "a", "T"),
        ("NEWTON'S GRAVITY", f'{it("F")} = {it("G")}{it("Mm")} / {it("r")}{sup("2")}', ICE,
         "double r → force ÷ 4", lambda u: (u, min(1, (1 / (0.3 + 1.7 * u) ** 2) / 11.2)), (1 - 0.3) / 1.7, "r", "F"),
    ]
    css = [kf("win", [(0, "opacity:0;transform:translateY(8px)"), (3, "opacity:1;transform:translateY(0)"), (30, "opacity:1;transform:translateY(0)"),
                      (33.3, "opacity:0;transform:translateY(-8px)"), (100, "opacity:0;transform:translateY(-8px)")]),
           kf("drw", [(0, "stroke-dashoffset:1"), (4, "stroke-dashoffset:1"), (24, "stroke-dashoffset:0"), (100, "stroke-dashoffset:0")])]
    groups = []
    for k, (name, eq, col, note, fn, umark, xl, yl) in enumerate(eqs):
        d = neg(k * 4, T)
        pts = []
        for i in range(41):
            u = i / 40
            _, v = fn(u)
            pts.append((ox + u * pw, oy - v * ph))
        L, at = arclen_sampler(pts)
        stops = [(0, f"transform:{tr(*pts[0])}"), (4, f"transform:{tr(*pts[0])}")]
        for j in range(1, 17):
            stops.append((4 + 20 * j / 16, f"transform:{tr(*at(j / 16)[:2])}"))
        stops.append((100, f"transform:{tr(*pts[-1])}"))
        css.append(kf(f"dot{k}", stops) + anim(f".dot{k}", f"dot{k}", T, delay=d))
        css.append(anim(f".w{k}", "win", T, delay=d) + anim(f".d{k}", "drw", T, "ease-in-out", delay=d))
        _, mv = fn(umark)
        mx, my = ox + umark * pw, oy - mv * ph
        vis = "" if k == 0 else ' opacity="0"'
        groups.append(
            f'<g class="w{k}"{vis}>'
            f'<text class="mono" x="22" y="78" font-size="10.5" letter-spacing="1.6" fill="{col}">{name}</text>'
            f'<text class="serif" x="22" y="112" font-size="25" fill="{TEXT}">{eq}</text>'
            f'<text class="mono" x="22" y="140" font-size="10.5" fill="{MUTED}">{note}</text>'
            f'<path class="d{k}" d="{pts_path(pts)}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="{col}" stroke-width="2" stroke-linecap="round"/>'
            f'<path d="M{f(mx)} {oy}V{f(my)}H{ox}" fill="none" stroke="{col}" stroke-opacity=".45" stroke-dasharray="2 3"/>'
            f'<circle cx="{f(mx)}" cy="{f(my)}" r="3" fill="none" stroke="{col}" stroke-width="1.4"/>'
            f'<g class="dot{k} rm-hide" style="transform:{tr(*pts[-1])}"><circle r="5" fill="{col}" opacity=".25"/><circle r="2.4" fill="#fff"/></g>'
            f'<text class="mono" x="{ox + pw}" y="{oy + 13}" text-anchor="end" font-size="10" fill="{MUTED}">{xl}</text>'
            f'<text class="mono" x="{ox + 5}" y="{oy - ph - 2}" font-size="10" fill="{MUTED}">{yl}</text></g>')
    grid = ('<g stroke="#96aaff" stroke-opacity=".07">' + "".join(f'<path d="M{ox} {oy - i * 25}H{ox + pw}"/>' for i in range(1, 5))
            + "".join(f'<path d="M{ox + i * 34.5} {oy}V{oy - ph}"/>' for i in range(1, 5)) + '</g>'
            f'<path d="M{ox} {oy - ph - 8}V{oy}H{ox + pw + 4}" fill="none" stroke="#96aaff" stroke-opacity=".45"/>')
    return dict(defs="", css="".join(css), body=grid + "".join(groups), stars=18)


def s_gallery():
    T = 12
    fx, fy, fw, fh = 122, 44, 188, 120
    imgs = [
        ("Earthrise · 1968",
         '<rect width="188" height="120" fill="#020308"/>'
         '<g transform="translate(118 46)"><circle r="21" fill="#2f7fd6"/><path d="M-12-8Q-2-14 8-8Q2-2-10-3ZM-4 6Q6 2 14 8Q4 14-4 6Z" fill="#f2f6ff" opacity=".85"/>'
         '<path d="M-3-20.8A21 21 0 0 0-3 20.8A13 21 0 0 1-3-20.8Z" fill="#020308" opacity=".9" transform="rotate(200)"/></g>'
         '<path d="M0 120V92Q94 70 188 88V120Z" fill="url(#mg)"/><g fill="#4a4e5c"><ellipse cx="40" cy="100" rx="10" ry="2"/><ellipse cx="140" cy="104" rx="14" ry="2.5"/></g>'),
        ("Pale Blue Dot · 1990",
         '<rect width="188" height="120" fill="#0c0806"/>'
         '<g opacity=".7"><path d="M-10 20L200 -10V14L-10 44Z" fill="#8a5a3a" opacity=".55"/><path d="M-10 60L200 34V52L-10 78Z" fill="#b07a4a" opacity=".6"/>'
         '<path d="M-10 92L200 70V80L-10 102Z" fill="#6a4c7a" opacity=".5"/></g>'
         '<circle cx="128" cy="47" r="1.5" fill="#cfe8ff"/><circle cx="128" cy="47" r="7" fill="none" stroke="#cfe8ff" stroke-opacity=".6"/>'),
        ("The Blue Marble · 1972",
         '<rect width="188" height="120" fill="#010206"/><g transform="translate(94 60)"><circle r="52" fill="#1d63c4"/>'
         '<path d="M-22-34Q-4-42 14-38L20-26L30-12L22-8Q16 10 8 30Q2 40-3 30Q-8 14-10 2Q-26-2-32-14Q-30-28-22-34Z" fill="#b99a64"/>'
         '<path d="M22-36L38-26L32-16L25-24Z" fill="#c9ab74"/><ellipse cx="22" cy="20" rx="2.5" ry="6" fill="#b99a64"/>'
         '<path d="M-46-6Q-36-20-26-8M28 4Q40-4 46 12M-40 22Q-30 32-16 28M-26 46Q0 54 26 46M30-40Q40-34 44-24" stroke="#fff" stroke-width="3.6" stroke-linecap="round" fill="none" opacity=".85"/>'
         '<circle r="52" fill="url(#shd)" opacity=".7"/></g>'),
        ("Pillars of Creation · 1995",
         '<rect width="188" height="120" fill="url(#neb)"/>'
         '<path d="M36 120L38 80Q34 60 44 44Q52 40 54 56Q58 80 60 120Z" fill="#3b2016"/><path d="M40 60Q44 42 54 50" stroke="#e5a060" stroke-width="2" fill="none"/>'
         '<path d="M86 120Q84 96 90 82Q96 76 100 86Q102 104 106 120Z" fill="#3b2016"/><path d="M88 86Q94 76 100 84" stroke="#e5a060" stroke-width="1.6" fill="none"/>'
         '<path d="M136 120Q132 100 140 90Q146 86 150 96L154 120Z" fill="#442619"/>'
         '<g fill="#fff"><circle cx="20" cy="20" r=".9"/><circle cx="160" cy="30" r="1.1"/><circle cx="120" cy="14" r=".8"/></g>'),
    ]
    n = len(imgs)
    css = [kf("im", [(0, "opacity:0;transform:scale(1.0)"), (3, "opacity:1"), (100 / n, "opacity:1"), (100 / n + 3, "opacity:0;transform:scale(1.07)"),
                     (100, "opacity:0;transform:scale(1.07)")])]
    frames = []
    for k, (cap, art) in enumerate(imgs):
        d = neg(k * T / n, T)
        css.append(anim(f".i{k}", "im", T, delay=d))
        vis = "" if k == 0 else ' opacity="0"'
        frames.append(f'<g class="i{k}"{vis}>{art}<rect y="100" width="188" height="20" fill="#000" opacity=".55"/>'
                      f'<text class="sans" x="9" y="114" font-size="11.5" fill="{TEXT}">{cap}</text></g>')
        css.append(kf("pd", [(0, "opacity:1"), (100 / n, "opacity:1"), (100 / n + .01, "opacity:.25"), (100, "opacity:.25")]) +
                   anim(f".pd{k}", "pd", T, "steps(1)", delay=d))
    dots = "".join(f'<circle class="pd{k}" cx="{fx + fw / 2 - 18 + k * 12}" cy="176" r="2.6" fill="{NEBULA}" opacity="{1 if k == 0 else .25}"/>' for k in range(n))
    back = (f'<g transform="rotate(-7 {fx + fw / 2} {fy + fh / 2})"><rect x="{fx}" y="{fy}" width="{fw}" height="{fh}" rx="5" fill="#141a2e" stroke="#96aaff" stroke-opacity=".2"/></g>'
            f'<g transform="rotate(5 {fx + fw / 2} {fy + fh / 2})"><rect x="{fx}" y="{fy}" width="{fw}" height="{fh}" rx="5" fill="#101628" stroke="#96aaff" stroke-opacity=".25"/></g>')
    defs = (SHADE + f'<clipPath id="ph"><rect width="{fw}" height="{fh}" rx="4"/></clipPath>'
            '<linearGradient id="mg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9a9eab"/><stop offset="1" stop-color="#34373f"/></linearGradient>'
            '<linearGradient id="neb" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0e3a44"/><stop offset=".55" stop-color="#4a6a5a"/>'
            '<stop offset="1" stop-color="#c47c3c"/></linearGradient>')
    css.append("[class^=i]{transform-origin:94px 60px}")
    body = (back + f'<rect x="{fx - 5}" y="{fy - 5}" width="{fw + 10}" height="{fh + 10}" rx="7" fill="#e9edff"/>'
            f'<g transform="translate({fx} {fy})"><g clip-path="url(#ph)">{"".join(frames)}</g></g>' + dots)
    return dict(defs=defs, css="".join(css), body=body, stars=30)


def s_timeline():
    T = 12
    y = 118
    ms = [("1903", "First powered flight"), ("1957", "Sputnik 1, first satellite"), ("1969", "Apollo 11 lands on the Moon"),
          ("1990", "Hubble Space Telescope launched"), ("2015", "First orbital booster landing"), ("2021", "Perseverance lands on Mars")]
    xs = [44 + i * 62.4 for i in range(len(ms))]
    n = len(ms)
    seg = 100 / n
    dwell = 0.62
    stops, pstops = [], []
    for i, x in enumerate(xs):
        a = i * seg
        stops.append((a, f"transform:translateX({f(x)}px);opacity:1"))
        pstops.append((a, f"transform:scaleX({f((x - xs[0]) / (xs[-1] - xs[0]), 3)})"))
        stops.append((a + seg * dwell, f"transform:translateX({f(x)}px);opacity:1"))
        pstops.append((a + seg * dwell, f"transform:scaleX({f((x - xs[0]) / (xs[-1] - xs[0]), 3)})"))
    stops[-1] = (100 - 3, f"transform:translateX({f(xs[-1])}px);opacity:1")
    stops.append((99.9, f"transform:translateX({f(xs[-1])}px);opacity:0"))
    stops.append((100, f"transform:translateX({f(xs[0])}px);opacity:0"))
    stops[0] = (0, f"transform:translateX({f(xs[0])}px);opacity:0")
    stops.insert(1, (2, f"transform:translateX({f(xs[0])}px);opacity:1"))
    pstops[-1] = (97, "transform:scaleX(1);opacity:1")
    pstops += [(99.9, "transform:scaleX(1);opacity:0"), (100, "transform:scaleX(0);opacity:0")]
    pstops[0] = (0, "transform:scaleX(0);opacity:0")
    pstops.insert(1, (2, "transform:scaleX(0);opacity:1"))
    css = [kf("mv", stops), anim(".mv", "mv", T, "ease-in-out"), kf("pg", pstops), anim(".pg", "pg", T, "ease-in-out"),
           window_kf("ev", 1.5, seg - 1.5, 1.5)]
    css.append(kf("pulse", [(0, "transform:scale(1);opacity:.6"), (100, "transform:scale(2.4);opacity:0")]) + anim(".pu", "pulse", 1.2, "ease-out"))
    ticks, labels = [], []
    for i, (x, (yr, ev)) in enumerate(zip(xs, ms)):
        d = neg(i * T / n, T)
        css.append(kf(f"tk{i}", [(0, "opacity:.35"), (i * seg, "opacity:.35"), (i * seg + .5, "opacity:1"), (98, "opacity:1"), (100, "opacity:.35")]) +
                   anim(f".tk{i}", f"tk{i}", T))
        on = 1 if i <= 2 else .35
        ticks.append(f'<g class="tk{i}" opacity="{on}"><circle cx="{f(x)}" cy="{y}" r="4" fill="#0b1020" stroke="{NEBULA}" stroke-width="1.6"/>'
                     f'<text class="mono" x="{f(x)}" y="{y + 22}" text-anchor="middle" font-size="11" fill="{TEXT2}">{yr}</text></g>')
        css.append(anim(f".e{i}", "ev", T, delay=d))
        vis = "" if i == 2 else ' opacity="0"'
        labels.append(f'<g class="e{i}"{vis}><text class="sans" x="200" y="78" text-anchor="middle" font-size="30" font-weight="700" fill="{SOL}">{yr}</text>'
                      f'<text class="sans" x="200" y="97" text-anchor="middle" font-size="13" fill="{TEXT2}">{ev}</text></g>')
    body = (f'<path d="M24 {y}H376" stroke="#96aaff" stroke-opacity=".25" stroke-width="2" stroke-linecap="round"/>'
            f'<g transform="translate({f(xs[0])} {y})"><path class="pg" d="M0 0H{f(xs[-1] - xs[0])}" stroke="url(#tlg)" stroke-width="2.4" stroke-linecap="round" '
            f'style="transform:scaleX(.4)"/></g>'
            + "".join(ticks) +
            f'<g class="mv" style="transform:translateX({f(xs[2])}px)"><g transform="translate(0 {y})">'
            f'<circle class="pu" r="7" fill="none" stroke="{SOL}"/><circle r="6.5" fill="{SOL}" opacity=".3"/><circle r="4" fill="#fff4d6"/></g></g>'
            + "".join(labels))
    defs = (f'<linearGradient id="tlg" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="{f(xs[-1] - xs[0])}" y2="0"><stop offset="0" stop-color="{ICE}"/>'
            f'<stop offset=".5" stop-color="{NEBULA}"/><stop offset="1" stop-color="{FLAME}"/></linearGradient>')
    return dict(defs=defs, css="".join(css), body=body, stars=30)


def s_library():
    T = 6
    sx, top, pw, ph = 200, 44, 106, 118

    def lines(x0, seed, diagram=None):
        rng = random.Random(seed)
        out = [f'<rect x="{x0 + 12}" y="{top + 14}" width="{pw * .5}" height="4" rx="2" fill="{NEBULA}" opacity=".8"/>']
        yy = top + 28
        while yy < top + ph - 12:
            if diagram and abs(yy - (top + 62)) < 18:
                out.append(diagram(x0))
                yy += 34
                continue
            w = pw - 24 - rng.uniform(0, 24)
            out.append(f'<rect x="{x0 + 12}" y="{yy}" width="{f(w)}" height="2.4" rx="1.2" fill="#5d6589" opacity=".55"/>')
            yy += 8
        return "".join(out)
    orbit = lambda x0: (f'<g transform="translate({x0 + pw / 2} {top + 62})"><ellipse rx="30" ry="12" fill="none" stroke="{ICE}" stroke-opacity=".7"/>'
                        f'<circle r="4" fill="{SOL}"/><circle cx="30" r="2" fill="{ICE}"/></g>')
    rocket = lambda x0: (f'<g transform="translate({x0 + pw / 2} {top + 62})" fill="none" stroke="{FLAME}" stroke-opacity=".8">'
                         '<path d="M-26 6H18Q28 0 18-6H-26Z"/><path d="M-26 6L-32 12M-26-6L-32-12M-6-6V6"/></g>')
    page = lambda x0, content, fill="#eceff8": (f'<rect x="{x0}" y="{top}" width="{pw}" height="{ph}" fill="{fill}"/>' + content)
    css = [kf("fa", [(0, "transform:scaleX(1)"), (10, "transform:scaleX(1);animation-timing-function:ease-in"), (22, "transform:scaleX(0)"), (100, "transform:scaleX(0)")]),
           kf("fb", [(0, "transform:scaleX(0);opacity:1"), (22, "transform:scaleX(0);animation-timing-function:ease-out"), (34, "transform:scaleX(1)"),
                     (96, "transform:scaleX(1);opacity:1"), (100, "transform:scaleX(1);opacity:0")]),
           kf("sh", [(0, "opacity:0"), (12, "opacity:0"), (22, "opacity:.5"), (32, "opacity:0"), (100, "opacity:0")])]
    flips = []
    for k in range(2):
        d = -k * T / 2
        css.append(anim(f".fa{k}", "fa", T, delay=d) + anim(f".fb{k}", "fb", T, delay=d) + anim(f".sh{k}", "sh", T, delay=d))
        flips.append(
            f'<g transform="translate({sx} 0)">'
            f'<g class="fa{k}" style="transform:scaleX(0)"><g transform="translate({-sx} 0)">{page(sx, lines(sx, 30 + k, orbit if k else rocket), "#f4f6fc")}'
            f'<rect class="sh{k}" x="{sx}" y="{top}" width="{pw}" height="{ph}" fill="#1b2236" opacity="0"/></g></g>'
            f'<g class="fb{k}" style="transform:scaleX(0)"><g transform="translate({-sx} 0)">{page(sx - pw, lines(sx - pw, 40 + k), "#e6e9f4")}</g></g></g>')
    book = (f'<rect x="{sx - pw - 10}" y="{top - 6}" width="{2 * pw + 20}" height="{ph + 14}" rx="6" fill="#2a1f4a" stroke="{NEBULA}" stroke-opacity=".5"/>'
            f'<path d="M{sx - pw - 3} {top + ph + 4}H{sx + pw + 3}" stroke="#cfd5e8" stroke-width="2" opacity=".5"/>'
            f'<path d="M{sx - pw - 1.5} {top + ph + 1.5}H{sx + pw + 1.5}" stroke="#dfe3ee" stroke-width="1.5" opacity=".7"/>'
            + page(sx - pw, lines(sx - pw, 1, orbit), "#e6e9f4") + page(sx, lines(sx, 2), "#f4f6fc") +
            f'<rect x="{sx - 7}" y="{top}" width="14" height="{ph}" fill="url(#gut)"/>')
    defs = ('<linearGradient id="gut" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/>'
            '<stop offset=".5" stop-color="#000" stop-opacity=".3"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>')
    body = (f'<ellipse cx="{sx}" cy="{top + ph + 12}" rx="150" ry="10" fill="#000" opacity=".5"/>' + book + "".join(flips))
    return dict(defs=defs, css="".join(css), body=body, stars=24)


# --------------------------------------------------------------------------- BUILD
def s_experiments():
    T = 10
    levels = [("0", "Kitchen table", "under $10", AURORA), ("1", "Garage & backyard", "$10–50", ICE),
              ("2", "First real rockets", "$50–150", NEBULA), ("3", "Avionics", "$100–300", PLASMA), ("4", "Research grade", "$150+", FLAME)]
    cx = 206
    css = []
    bars = []
    for i, (n, name, cost, col) in enumerate(levels):
        y = 150 - i * 25
        w = 276 - i * 26
        x = cx - w / 2
        s0 = 6 + i * 11
        css.append(kf(f"lv{i}", [(0, "opacity:0"), (s0, "opacity:0"), (s0 + 4, "opacity:1"), (88, "opacity:1"), (95, "opacity:0"), (100, "opacity:0")]))
        css.append(anim(f".lv{i}", f"lv{i}", T))
        bars.append(
            f'<rect x="{f(x)}" y="{y}" width="{f(w)}" height="21" rx="6" fill="{col}" fill-opacity=".05" stroke="{col}" stroke-opacity=".25"/>'
            f'<g class="lv{i}"><rect x="{f(x)}" y="{y}" width="{f(w)}" height="21" rx="6" fill="{col}" fill-opacity=".2" stroke="{col}" stroke-width="1.3"/>'
            f'<rect x="{f(x)}" y="{y}" width="{f(w)}" height="21" rx="6" fill="url(#shine)"/></g>'
            f'<text class="sans" x="{f(x + 10)}" y="{y + 14.5}" font-size="12" fill="{TEXT}"><tspan font-weight="700" fill="{col}">{n}</tspan>  {name.replace("&", "&amp;")}</text>'
            f'<text class="mono" x="{f(x + w - 9)}" y="{y + 14.5}" text-anchor="end" font-size="10.5" fill="{TEXT2}">{cost}</text>')
    # a small rocket that climbs level by level
    stops = []
    for i in range(5):
        s0 = 6 + i * 11
        stops.append((s0, f"transform:translateY({-i * 25}px)"))
        stops.append((s0 + 4, f"transform:translateY({-i * 25}px)"))
    stops = [(0, "transform:translateY(0);opacity:0"), (4, "transform:translateY(0);opacity:1")] + stops[1:] + [
        (84, "transform:translateY(-100px);opacity:1"), (92, "transform:translateY(-150px);opacity:0"), (100, "transform:translateY(0);opacity:0")]
    css.append(kf("cl", stops) + anim(".cl", "cl", T, "ease-in-out"))
    css.append(FLICKER)
    rk = (f'<g class="cl" style="transform:translateY(-100px)"><g transform="translate(24 160)">{flame(0, 9, 2.6, 8)}'
          '<path d="M-3 9V-4Q-3-9 0-12Q3-9 3-4V9Z" fill="#eef2ff"/><path d="M-3 4L-6 10H-3ZM3 4L6 10H3Z" fill="#cfd5e8"/></g></g>')
    rk = rk.replace('translate(24 160)', f'translate({cx + 162} 160)')
    defs = (FLAME_GRAD + '<linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".18"/>'
            '<stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>')
    body = "".join(bars) + rk
    return dict(defs=defs, css="".join(css), body=body, stars=26)


def s_python():
    T = 10
    tx, ty, tw, th = 24, 46, 352, 134
    cmd = "python simulations/run.py rocket"
    cw = 7.25
    n = len(cmd)
    x0 = tx + 26
    css = [
        kf("ty", [(0, "transform:translateX(0)"), (4, "transform:translateX(0)"), (26, f"transform:translateX({f(n * cw)}px)"), (100, f"transform:translateX({f(n * cw)}px)")]),
        f".ty{{animation:ty {T}s steps({n}) infinite}}",
        kf("cb", [(0, "opacity:1"), (50, "opacity:0"), (100, "opacity:1")]) + anim(".cb", "cb", 0.9, "steps(1)"),
        window_kf("o1", 30, 94, 2), anim(".o1", "o1", T),
        kf("cv", [(0, "stroke-dashoffset:1;opacity:1"), (34, "stroke-dashoffset:1"), (62, "stroke-dashoffset:0"), (94, "stroke-dashoffset:0;opacity:1"),
                  (97, "opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]),
        kf("cv2", [(0, "stroke-dashoffset:1;opacity:1"), (40, "stroke-dashoffset:1"), (66, "stroke-dashoffset:0"), (94, "stroke-dashoffset:0;opacity:1"),
                   (97, "opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]),
        anim(".cv", "cv", T, "ease-out"), anim(".cv2", "cv2", T, "ease-out"),
        window_kf("o2", 64, 94, 2), anim(".o2", "o2", T),
    ]
    px, py, pw, ph = tx + 22, ty + th - 12, 200, 48
    c1 = [(px + pw * u, py - ph * (1 - (1 - u) ** 2.2) * 0.95) for u in [i / 30 for i in range(31)]]
    c2 = [(px + pw * 0.62 * u, py - ph * 0.62 * (1 - (1 - u) ** 2.4)) for u in [i / 30 for i in range(31)]]
    body = (
        f'<rect x="{tx}" y="{ty}" width="{tw}" height="{th}" rx="10" fill="#060913" stroke="#96aaff" stroke-opacity=".28"/>'
        f'<path d="M{tx} {ty + 22}H{tx + tw}" stroke="#96aaff" stroke-opacity=".18"/>'
        f'<circle cx="{tx + 14}" cy="{ty + 11}" r="3.5" fill="{PLASMA}" opacity=".8"/><circle cx="{tx + 26}" cy="{ty + 11}" r="3.5" fill="{SOL}" opacity=".8"/>'
        f'<circle cx="{tx + 38}" cy="{ty + 11}" r="3.5" fill="{AURORA}" opacity=".8"/>'
        f'<text class="mono" x="{tx + tw / 2}" y="{ty + 15}" text-anchor="middle" font-size="10" fill="{FAINT}">cosmic-library — bash</text>'
        f'<text class="mono" x="{tx + 12}" y="{ty + 42}" font-size="12" fill="{AURORA}">$</text>'
        f'<text class="mono" x="{x0}" y="{ty + 42}" font-size="12" fill="{TEXT}" textLength="{f(n * cw)}" lengthAdjust="spacingAndGlyphs">{cmd}</text>'
        f'<clipPath id="ln"><rect x="{x0 - 1}" y="{ty + 28}" width="{f(n * cw + 12)}" height="20"/></clipPath>'
        f'<g clip-path="url(#ln)"><g class="ty" style="transform:translateX({f(n * cw)}px)"><rect x="{x0}" y="{ty + 30}" width="{f(n * cw + 4)}" height="16" fill="#060913"/>'
        f'<rect class="cb" x="{x0}" y="{ty + 31}" width="7" height="14" fill="{ICE}" opacity=".85"/></g></g>'
        f'<g class="o1"><text class="mono" x="{tx + 12}" y="{ty + 60}" font-size="11" fill="{MUTED}">2-D ascent · gravity turn · Mach-dependent drag</text></g>'
        f'<path d="M{px} {py - ph - 4}V{py}H{px + pw + 6}" fill="none" stroke="#96aaff" stroke-opacity=".4"/>'
        f'<path class="cv" d="{pts_path(c1)}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="{ICE}" stroke-width="2" stroke-linecap="round"/>'
        f'<path class="cv2" d="{pts_path(c2)}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="{FLAME}" stroke-width="2" stroke-linecap="round"/>'
        f'<g class="o2"><text class="mono" x="{px + pw + 12}" y="{py - ph + 6}" font-size="10.5" fill="{ICE}">Saturn V</text>'
        f'<text class="mono" x="{f(px + pw * .62 + 10)}" y="{f(py - ph * .62 + 12)}" font-size="10.5" fill="{FLAME}">Falcon 9</text>'
        f'<text class="mono" x="{px + pw + 12}" y="{py - 4}" font-size="10.5" fill="{AURORA}">✓ saved</text></g>'
    )
    return dict(defs="", css="".join(css), body=body, stars=16)


SCENES = {
    "launch": s_launch, "booster": s_booster, "moon-landing": s_moon, "mars-landing": s_mars, "shuttle": s_shuttle,
    "hangar": s_hangar, "builder": s_builder, "earth": s_earth, "sky": s_sky, "solar-system": s_solar, "sun": s_sun,
    "black-hole": s_blackhole, "scale": s_scale, "space-weather": s_spaceweather, "galaxies": s_galaxies,
    "orbits": s_orbits, "equations": s_equations, "gallery": s_gallery, "timeline": s_timeline, "library": s_library,
    "experiments": s_experiments, "python": s_python,
    "solar-observatory": s_solar_obs, "surveys": s_surveys, "telescopes": s_telescopes,
    "mission-designer": s_mission, "moon": s_moon_explorer, "dsn": s_dsn, "academy": s_academy,
    "eyepiece": s_eyepiece,
}

ALT = {
    "launch": "A Saturn V lifts off its pad beside the launch tower in a burst of flame and smoke, climbs out of frame, and the next one rolls out.",
    "booster": "A reusable first stage falls toward a drone ship at sea, lights its landing burn, unfolds its legs and touches down on the deck.",
    "moon-landing": "The Apollo lunar module descends over grey lunar ground with the Earth in the sky, kicking up a ring of dust as it touches down.",
    "mars-landing": "Entry, descent and landing at Mars in three steps: a glowing heat shield, the supersonic parachute, then the sky crane lowering the rover.",
    "shuttle": "The Space Shuttle orbiter, seen from above over the blue curve of the Earth, opens and closes its payload bay doors.",
    "hangar": "Rockets grow to true scale next to the Statue of Liberty: a V-2, a two-stage kerosene rocket, the N1, Saturn V at 111 m and Starship at 124 m.",
    "builder": "Rocket stages slide in and snap together on a blueprint grid, then a delta-v bar fills stage by stage past the 9.4 km/s needed for orbit.",
    "earth": "A rotating Earth with three satellites circling on tilted orbits and passing behind the globe.",
    "sky": "A night sky over a dark horizon: the Big Dipper and Cassiopeia draw themselves star by star, and the pointer stars lead to Polaris.",
    "solar-system": "Planets from Mercury to Saturn circle a glowing Sun at different speeds, with the asteroid belt drifting between Mars and Jupiter.",
    "sun": "A close-up of the Sun with boiling granulation, drifting sunspots and a looping prominence that rises from the limb and erupts.",
    "black-hole": "A black hole seen almost edge-on: a glowing accretion disk streams around a dark shadow, its far side lensed into an arc over the top.",
    "scale": "An endless zoom out through nested rings, from a person to the Earth, the Sun, the solar system, the Milky Way and the observable universe, with a 10-to-the-n metres counter.",
    "space-weather": "Solar wind streams from the Sun toward the Earth, bends around the magnetosphere, and a burst of plasma makes the aurora glow.",
    "galaxies": "Two spiral galaxies, the Milky Way and Andromeda, spin as they fall together, throw out tidal tails and merge into one elliptical glow.",
    "orbits": "Newton's cannon: shots fired faster and faster from a mountain top fall farther around the Earth until one never lands and stays in orbit.",
    "equations": "Equations take turns with their plots: the rocket equation, Kepler's third law and Newton's law of gravity, each curve drawing itself.",
    "gallery": "A stack of framed photographs cycling through Earthrise, the Pale Blue Dot, the Blue Marble and the Pillars of Creation.",
    "timeline": "A glowing marker travels along a timeline from 1903 to 2021, stopping at milestones from the first powered flight to Perseverance on Mars.",
    "library": "An open book whose pages flip, full of text lines and small diagrams.",
    "experiments": "Five stacked levels of builds light up from the bottom: kitchen table, garage and backyard, first real rockets, avionics and research grade.",
    "solar-observatory": "The real Sun as the Solar Dynamics Observatory sees it, cycling through its channels: gold AIA 171 Å (about 600,000 K), bronze 193 Å (1.6 million K), red 304 Å (50,000 K), teal 131 Å (10 million K, flares) and the grey visible-light HMI disc with sunspots, with the same active regions in every view.",
    "surveys": "The same patch of sky around Orion fades through six wavelengths, radio, infrared, visible, ultraviolet, X-ray and gamma ray, while a marker slides along the electromagnetic spectrum and a caption says what each band shows.",
    "telescopes": "An observatory dome opens its shutter, the telescope inside slews to the Orion Nebula and locks on at RA 05h 35m 17s, Dec −05° 23′ 28″, while a small radio dish nods beside it.",
    "mission-designer": "A porkchop plot of launch and arrival dates shimmers while an Earth-to-Mars transfer arc draws itself between the planets' orbits, to scale, with Earth and Mars moving along their orbits during the 259-day Hohmann transfer and a readout of C3 (8.7 km²/s²), delta-v from a 300 km orbit (3.59 km/s) and flight time.",
    "moon": "The near side of the Moon, maria in their real places, slowly librating while its phase cycles from new to full and back; landing sites from Luna 9 and Apollo 11 to Chandrayaan-3 blink in turn with their coordinates.",
    "dsn": "The Earth seen from above the North Pole turns with the Deep Space Network's three complexes, Goldstone, Madrid and Canberra, on its rim; the one facing Voyager 1 is named while a signal travels out and back and a round-trip light-time counter climbs to 46.3 hours.",
    "academy": "A star-map skill tree: lesson stars light up one by one and constellation lines join them, then a badge pops out with a shine.",
    "eyepiece": "A round telescope eyepiece view cycles through what a small telescope really shows: Saturn with its rings and the Cassini gap, "
                "craters along the Moon's terminator drifting past, Jupiter with its four Galilean moons in a row, and a close double star "
                "that is a blended blob at 60 mm aperture, just split at 100 mm and cleanly split at 200 mm. A small telescope sits beside it.",
    "python": "A terminal types python simulations/run.py rocket, then plots the ascent curves of Saturn V and Falcon 9.",
}


def frame(pid, title, group, desc, flabel, sc):
    col = GROUP_COL[group]
    live = pid in LIVE
    chip_txt = group.upper()
    chip_w = len(chip_txt) * 9.3 + 33
    n_stars = sc.get("stars", 36)
    sh = sc.get("star_h", 175)
    star_svg = stars(hash_seed(pid), n_stars, W, sh, rmin=0.35, rmax=1.25, groups=3) if n_stars else ""
    css = twinkle_css("t", 3, base=2.4, step=1.1) + sc["css"]
    css += kf("beam", [(0, "stroke-dashoffset:100"), (100, "stroke-dashoffset:0")]) + anim(".beam", "beam", 9)
    if live:
        css += kf("lv", [(0, "opacity:1"), (50, "opacity:.25"), (100, "opacity:1")]) + anim(".live", "lv", 1.6, "ease-in-out")
    defs = (f'<clipPath id="card"><rect width="{W}" height="{H}" rx="18"/></clipPath>'
            '<linearGradient id="cbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#04050a"/></linearGradient>'
            f'<radialGradient id="acc" cx="1" cy="0" r="1"><stop offset="0" stop-color="{col}" stop-opacity=".16"/><stop offset=".6" stop-color="{col}" stop-opacity="0"/></radialGradient>'
            '<linearGradient id="scr" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04050a" stop-opacity="0"/>'
            '<stop offset=".5" stop-color="#04050a" stop-opacity=".82"/><stop offset="1" stop-color="#04050a" stop-opacity=".94"/></linearGradient>'
            + sc["defs"])
    live_svg = ""
    if live:
        live_svg = (f'<g transform="translate({f(14 + chip_w + 7)} 14)"><rect width="58" height="25" rx="12.5" fill="#04050a" fill-opacity=".88"/>'
                    f'<rect width="58" height="25" rx="12.5" fill="{PLASMA}" fill-opacity=".12" stroke="{PLASMA}" stroke-opacity=".5"/>'
                    f'<circle class="live" cx="13" cy="12.5" r="3.4" fill="{PLASMA}"/>'
                    f'<text class="sans" x="22" y="17" font-size="12" font-weight="700" letter-spacing="1.2" fill="{PLASMA}">LIVE</text></g>')
    body = (
        f'<g clip-path="url(#card)"><rect width="{W}" height="{H}" fill="url(#cbg)"/><rect width="{W}" height="{H}" fill="url(#acc)"/>'
        f'{star_svg}{sc["body"]}<rect y="150" width="{W}" height="100" fill="url(#scr)"/></g>'
        # group chip
        f'<g transform="translate(14 14)"><rect width="{f(chip_w)}" height="25" rx="12.5" fill="#04050a" fill-opacity=".88"/>'
        f'<rect width="{f(chip_w)}" height="25" rx="12.5" fill="{col}" fill-opacity=".14" stroke="{col}" stroke-opacity=".6"/>'
        f'<circle cx="12.5" cy="12.5" r="3.4" fill="{col}"/>'
        f'<text class="sans" x="21.5" y="17" font-size="12" font-weight="700" letter-spacing="1.5" fill="{col}">{chip_txt}</text></g>'
        + live_svg +
        f'<text class="mono" x="384" y="31" text-anchor="end" font-size="11" fill="{FAINT}">{flabel}</text>'
        # title + description
        f'<text class="sans" x="20" y="212" font-size="24" font-weight="700" letter-spacing="-.2" fill="{TEXT}">{title}</text>'
        f'<text class="sans" x="20" y="236" font-size="15" fill="{MUTED}">{desc.replace("&", "&amp;")}</text>'
        # "Open" affordance
        f'<g transform="translate(312 192)"><rect width="72" height="27" rx="13.5" fill="#04050a" fill-opacity=".6" stroke="{col}" stroke-opacity=".55"/>'
        f'<text class="sans" x="13" y="18.5" font-size="13" font-weight="600" fill="{col}">Open</text>'
        f'<path d="M51 17.5L59 9.5M53.5 9.5H59V15" fill="none" stroke="{col}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></g>'
        # border + travelling beam
        f'<rect x=".5" y=".5" width="{W - 1}" height="{H - 1}" rx="17.5" fill="none" stroke="#96aaff" stroke-opacity=".2"/>'
        f'<path class="beam rm-hide" d="{rrpath(.75, .75, W - 1.5, H - 1.5, 17.25)}" pathLength="100" fill="none" stroke="{col}" '
        f'stroke-width="1.5" stroke-dasharray="9 91" stroke-linecap="round" opacity=".85"/>'
    )
    desc_long = f"{title} ({group}): {desc}. Animated card: {ALT[pid]}"
    return svg_doc(W, H, f"{title} · Cosmic Library", desc_long.replace("&", "&amp;"), defs, css, body, uid=pid[:2])


def hash_seed(s):
    return sum((i + 1) * ord(c) for i, c in enumerate(s))


def build_all(only=()):
    for pid, title, group, desc, flabel in PAGES:
        if only and pid not in only:
            continue
        yield pid, frame(pid, title, group, desc, flabel, SCENES[pid]())
