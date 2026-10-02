"""Big call-to-action buttons for the README (560 x 120) and compact twins (380 x 90).

    media/readme/buttons/<name>.svg        embed at 420-560 px wide
    media/readme/buttons/small/<name>.svg  embed at 380 px wide (two per row)

Each button is a dark, raised card (a coloured lip under it reads as "press me"): an
animated icon in a ring on the left, a label and a small subtitle, and an arrow on the
right that nudges forward. One accent colour per button. The icon's micro-animation
loops seamlessly; with reduced motion everything rests in its default pose.

    python3 scripts/readme_art/build.py buttons
"""
import math

from common import AURORA, FLAME, ICE, MUTED, NEBULA, PLASMA, SOL, TEXT, TEXT2, anim, ellipse_pts, f, kf, orbit_kf, svg_doc
from metrics import text_w
from pointers import keycap

PERI, LIME = "#8fa8ff", "#b5e853"

# name, label, subtitle, accent, icon fn, alt
BUTTONS = [
    ("open-site", "Open Cosmic Library", "runs in your browser — no install", ICE,
     "a browser window with a ringed planet inside and a small moon circling it"),
    ("telescope", "Look through a real telescope", "free, from your laptop", NEBULA,
     "a small telescope on a tripod nods up toward a twinkling star"),
    ("sun", "See today's real Sun", "live from NASA", SOL,
     "a glowing Sun whose rays turn slowly while a prominence loops off its edge"),
    ("sky", "What's in the sky tonight?", "for your location", PERI,
     "a crescent Moon and a constellation drawing itself above a bobbing location pin"),
    ("fly", "Fly a mission", "Saturn V · booster · Moon · Mars", FLAME,
     "a rocket with a flickering flame streaks upward past speed lines"),
    ("learn", "Start the Space Academy", "20 short lessons", AURORA,
     "an open book whose page turns while a star pops out above it"),
    ("simulator", "Try the telescope simulator", "see what a telescope really shows", PLASMA,
     "an eyepiece view of Saturn that drifts in and out of focus"),
    ("help", "How to use the simulations", "controls, tips, fixes", LIME,
     "a question-mark key that presses down with a ripple"),
]


def esc(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


# ------------------------------------------------------------------------ icons
# Each returns (defs, css, body) drawn around (0, 0), within about +/-30 units.
def i_open(c):
    T = 6
    pts = ellipse_pts(0, 6, 17, 5, -12, 48)
    css = orbit_kf("mo", pts, occl=(0, 6, 8.5), size=(.7, 1.1)) + anim(".mo", "mo", T)
    css += kf("ic", [(0, "opacity:1"), (50, "opacity:.3"), (100, "opacity:1")]) + anim(".ic1", "ic", 2.2, "ease-in-out") + \
        anim(".ic2", "ic", 3.1, "ease-in-out", -1)
    body = (f'<rect x="-27" y="-21" width="54" height="42" rx="6" fill="#060913" stroke="{c}" stroke-width="1.8"/>'
            f'<path d="M-27 -12.5H27" stroke="{c}" stroke-opacity=".6" stroke-width="1.3"/>'
            f'<circle cx="-21.5" cy="-16.8" r="1.6" fill="{PLASMA}"/><circle cx="-16.5" cy="-16.8" r="1.6" fill="{SOL}"/>'
            f'<circle cx="-11.5" cy="-16.8" r="1.6" fill="{AURORA}"/>'
            '<circle class="ic1" cx="-18" cy="-4" r="1" fill="#fff"/><circle class="ic2" cx="19" cy="-6" r="1.1" fill="#fff"/>'
            '<circle class="ic2" cx="16" cy="15" r=".8" fill="#fff"/>'
            f'<ellipse cx="0" cy="6" rx="17" ry="5" transform="rotate(-12 0 6)" fill="none" stroke="{c}" stroke-opacity=".35" stroke-dasharray="2 2.5"/>'
            f'<circle cx="0" cy="6" r="8.5" fill="url(#bp)"/>'
            f'<path d="M-8.2 4.5Q0 2.5 8.2 3.8M-7.6 8.4Q0 7 7.8 8" stroke="#04050a" stroke-opacity=".25" stroke-width="1.3" fill="none"/>'
            f'<g class="mo" style="transform:translate(17px,6px)"><circle r="2.4" fill="#f1f4ff"/></g>')
    defs = (f'<radialGradient id="bp" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#e6f4ff"/><stop offset=".45" stop-color="{c}"/>'
            '<stop offset="1" stop-color="#1c3a66"/></radialGradient>')
    return defs, css, body


def i_telescope(c):
    T = 5
    css = (kf("tb", [(0, "transform:rotate(-38deg)"), (45, "transform:rotate(-26deg)"), (60, "transform:rotate(-26deg)"),
                     (100, "transform:rotate(-38deg)")]) + anim(".tb", "tb", T, "ease-in-out")
           + kf("ts", [(0, "transform:scale(.6);opacity:.5"), (40, "transform:scale(.6);opacity:.5"), (52, "transform:scale(1.35);opacity:1"),
                       (66, "transform:scale(1);opacity:.9"), (100, "transform:scale(.6);opacity:.5")]) + anim(".ts", "ts", T, "ease-out"))
    body = ('<g stroke="#c9d0ea" stroke-width="2.2" stroke-linecap="round"><path d="M-2 4L-13 26M-2 4L9 26M-2 4V27"/></g>'
            '<circle cx="-2" cy="4" r="3" fill="#8f98bd"/>'
            '<g transform="translate(-2 4)"><g class="tb" style="transform:rotate(-32deg)">'
            f'<rect x="-5" y="-27" width="10" height="34" rx="2" fill="#e6e9f7"/><rect x="-6.5" y="-31" width="13" height="7" rx="2" fill="{c}"/>'
            '<rect x="-5" y="-9" width="10" height="3" fill="#8f98bd"/><rect x="-2" y="7" width="4" height="5" rx="1" fill="#8f98bd"/></g></g>'
            '<g transform="translate(19 -22)"><g class="ts"><path d="M0 -7L1.5 -1.5L7 0L1.5 1.5L0 7L-1.5 1.5L-7 0L-1.5 -1.5Z" fill="#fff6d8"/>'
            f'<circle r="6" fill="{c}" opacity=".25"/></g></g>')
    return "", css, body


def i_sun(c):
    rays = "".join(f'<path d="M{f(20 * math.cos(a))} {f(20 * math.sin(a))}L{f(28 * math.cos(a + .1))} {f(28 * math.sin(a + .1))}'
                   f'L{f(28 * math.cos(a - .1))} {f(28 * math.sin(a - .1))}Z"/>'
                   for a in [k * math.pi / 6 for k in range(12)])
    css = (kf("sr", [(0, "transform:rotate(0)"), (100, "transform:rotate(30deg)")]) + anim(".sr", "sr", 6)
           + kf("sg", [(0, "transform:scale(1);opacity:.35"), (50, "transform:scale(1.18);opacity:.6"), (100, "transform:scale(1);opacity:.35")])
           + anim(".sg", "sg", 3, "ease-in-out")
           + kf("pr", [(0, "stroke-dashoffset:1;opacity:1"), (55, "stroke-dashoffset:0;opacity:1"), (85, "stroke-dashoffset:0;opacity:0"),
                       (100, "stroke-dashoffset:1;opacity:0")]) + anim(".pr", "pr", 6, "ease-out")
           + kf("sp", [(0, "transform:translateX(-3px)"), (50, "transform:translateX(3px)"), (100, "transform:translateX(-3px)")])
           + anim(".sp", "sp", 12, "ease-in-out"))
    body = (f'<g class="sg"><circle r="22" fill="{c}"/></g>'
            f'<g class="sr"><g fill="{c}">{rays}</g></g>'
            '<circle r="16" fill="url(#sd)"/>'
            '<clipPath id="sc"><circle r="16"/></clipPath><g clip-path="url(#sc)"><g class="sp">'
            '<circle cx="-7" cy="-3" r="2" fill="#7a3a0a" opacity=".7"/><circle cx="-4" cy="-4.5" r="1.1" fill="#7a3a0a" opacity=".6"/>'
            '<circle cx="1" cy="6" r="1.6" fill="#7a3a0a" opacity=".6"/></g></g>'
            '<path class="pr" d="M10 -12Q22 -24 15 -5" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="#ff7a3d" stroke-width="2.4" stroke-linecap="round"/>')
    defs = ('<radialGradient id="sd" cx=".4" cy=".38" r=".7"><stop offset="0" stop-color="#fff3c4"/><stop offset=".55" stop-color="#ffc24b"/>'
            '<stop offset="1" stop-color="#ff7a3d"/></radialGradient>')
    return defs, css, body


def i_sky(c):
    T = 6
    st = [(-20, 2), (-9, -7), (3, -3), (14, -13), (22, -5)]
    d = "M" + "L".join(f"{x} {y}" for x, y in st)
    css = (kf("cn", [(0, "stroke-dashoffset:1"), (10, "stroke-dashoffset:1"), (55, "stroke-dashoffset:0"), (85, "stroke-dashoffset:0"),
                     (95, "stroke-dashoffset:-1"), (100, "stroke-dashoffset:-1")]) + anim(".cn", "cn", T, "ease-in-out")
           + kf("pn", [(0, "transform:translateY(0)"), (50, "transform:translateY(-4px)"), (100, "transform:translateY(0)")])
           + anim(".pn", "pn", 2, "ease-in-out")
           + kf("ps", [(0, "transform:scale(1,1);opacity:.5"), (50, "transform:scale(.7,.7);opacity:.25"), (100, "transform:scale(1,1);opacity:.5")])
           + anim(".ps", "ps", 2, "ease-in-out")
           + kf("tw", [(0, "opacity:1"), (50, "opacity:.35"), (100, "opacity:1")]))
    stars_svg = ""
    for i, (x, y) in enumerate(st):
        css += anim(f".s{i}", "tw", 1.6 + i * .37, "ease-in-out", -i * .5)
        stars_svg += f'<circle class="s{i}" cx="{x}" cy="{y}" r="{1.9 if i in (1, 3) else 1.5}" fill="#fff"/>'
    body = ('<path d="M-17 -27A9 9 0 1 0 -8 -14A7 7 0 1 1 -17 -27Z" fill="#fff3c4"/>'
            f'<path class="cn" d="{d}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="{c}" stroke-width="1.3" stroke-opacity=".9"/>'
            + stars_svg +
            f'<path d="M-28 22Q0 14 28 22" fill="none" stroke="{c}" stroke-opacity=".45" stroke-width="1.5"/>'
            f'<g transform="translate(0 26)"><g class="ps"><ellipse rx="6" ry="2" fill="{c}" opacity=".5"/></g></g>'
            f'<g class="pn"><path d="M0 25C-2 19 -8 15 -8 9A8 8 0 0 1 8 9C8 15 2 19 0 25Z" fill="{c}"/><circle cy="9" r="3" fill="#060913"/></g>')
    return "", css, body


def i_fly(c):
    css = (kf("fk", [(0, "transform:scale(1,1)"), (25, "transform:scale(.8,1.25)"), (50, "transform:scale(1.1,.85)"),
                     (75, "transform:scale(.9,1.15)"), (100, "transform:scale(1,1)")]) + anim(".fk", "fk", .18)
           + kf("rb", [(0, "transform:translate(0,0)"), (50, "transform:translate(1.5px,-3px)"), (100, "transform:translate(0,0)")])
           + anim(".rb", "rb", 1.6, "ease-in-out")
           + kf("sl", [(0, "stroke-dashoffset:0"), (100, "stroke-dashoffset:-40")]))
    lines = ""
    for i, (x, y, L) in enumerate(((-16, -8, 16), (-6, 4, 22), (-22, 10, 12))):
        lines += (f'<path class="l{i}" d="M{x} {y}L{x - L * .7} {y + L * .7}" stroke="{c}" stroke-opacity=".7" stroke-width="1.6" '
                  f'stroke-linecap="round" stroke-dasharray="6 14"/>')
        css += anim(f".l{i}", "sl", .9 + i * .23, delay=-i * .3)
    body = (lines + '<g class="rb"><g transform="translate(2 -2) rotate(45)">'
            '<g transform="translate(0 16)"><g class="fk"><path d="M-4.5 0Q-5.5 7 0 15Q5.5 7 4.5 0Z" fill="url(#ff)"/>'
            '<path d="M-2 0Q-2 4 0 8Q2 4 2 0Z" fill="#fff3d6"/></g></g>'
            '<path d="M-5.5 14V-8Q-5.5 -17 0 -23Q5.5 -17 5.5 -8V14Z" fill="#eef2ff"/>'
            f'<circle cy="-6" r="2.6" fill="{c}" stroke="#04050a" stroke-opacity=".4"/>'
            f'<path d="M-5.5 5L-11 15H-5.5ZM5.5 5L11 15H5.5Z" fill="{c}"/><rect x="-5.5" y="12" width="11" height="3" fill="#9aa3c0"/></g></g>')
    defs = ('<linearGradient id="ff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3c4"/><stop offset=".4" stop-color="#ffc24b"/>'
            '<stop offset="1" stop-color="#ff4f9a" stop-opacity="0"/></linearGradient>')
    return defs, css, body


def i_learn(c):
    T = 5
    css = (kf("pg", [(0, "transform:scaleX(1)"), (15, "transform:scaleX(1)"), (45, "transform:scaleX(-1)"), (60, "transform:scaleX(-1)"),
                     (60.01, "transform:scaleX(1)"), (100, "transform:scaleX(1)")]) + anim(".pg", "pg", T, "ease-in-out")
           + kf("st", [(0, "transform:translateY(6px) scale(.2);opacity:0"), (40, "transform:translateY(6px) scale(.2);opacity:0"),
                       (55, "transform:translateY(-4px) scale(1.25);opacity:1"), (70, "transform:translateY(-2px) scale(1);opacity:1"),
                       (92, "transform:translateY(-2px) scale(1);opacity:0"), (100, "transform:translateY(6px) scale(.2);opacity:0")])
           + anim(".st", "st", T, "ease-out"))
    lines_l = "".join(f'<path d="M-21 {y}L-5 {y + 1.2}"/>' for y in (-2, 3, 8))
    lines_r = "".join(f'<path d="M5 {y + 1.2}L21 {y}"/>' for y in (-2, 3, 8))
    body = (f'<path d="M-27 -6L0 -1L27 -6V18L0 23L-27 18Z" fill="{c}" fill-opacity=".25"/>'
            '<path d="M-25 -8Q-12 -11 0 -4V20Q-12 13 -25 16Z" fill="#eef2ff"/>'
            '<path d="M25 -8Q12 -11 0 -4V20Q12 13 25 16Z" fill="#dfe4f4"/>'
            f'<g stroke="#8f98bd" stroke-width="1.1" stroke-linecap="round">{lines_l}{lines_r}</g>'
            '<g class="pg"><path d="M0 -4Q12 -11 25 -8V16Q12 13 0 20Z" fill="#f6f8ff" stroke="#b9c1dc" stroke-width=".6"/></g>'
            f'<path d="M0 -4V20" stroke="{c}" stroke-opacity=".6"/>'
            '<g transform="translate(0 -18)"><g class="st" style="transform:translateY(-2px) scale(1)">'
            f'<path d="M0 -8L2.3 -2.4L8.3 -2.4L3.5 1.2L5.2 7L0 3.6L-5.2 7L-3.5 1.2L-8.3 -2.4L-2.3 -2.4Z" fill="{SOL}"/></g></g>')
    return "", css, body


def i_simulator(c):
    T = 6
    css = (kf("sh", [(0, "opacity:0"), (30, "opacity:0"), (45, "opacity:1"), (80, "opacity:1"), (92, "opacity:0"), (100, "opacity:0")])
           + anim(".shp", "sh", T, "ease-in-out")
           + kf("kn", [(0, "transform:rotate(0)"), (30, "transform:rotate(0)"), (45, "transform:rotate(80deg)"), (80, "transform:rotate(80deg)"),
                       (92, "transform:rotate(0)"), (100, "transform:rotate(0)")]) + anim(".kn", "kn", T, "ease-in-out"))

    def saturn():
        return ('<ellipse rx="15" ry="4.6" transform="rotate(-16)" fill="none" stroke="#e8d7a8" stroke-width="2.4"/>'
                '<circle r="8" fill="url(#sat)"/>'
                '<path d="M-15 0A15 4.6 0 0 0 15 0" transform="rotate(-16)" fill="none" stroke="#e8d7a8" stroke-width="2.4"/>')
    body = ('<circle r="25" fill="#000"/>'
            '<clipPath id="ep"><circle r="23"/></clipPath>'
            f'<g clip-path="url(#ep)"><circle cx="-14" cy="-12" r=".8" fill="#fff" opacity=".6"/><circle cx="15" cy="13" r=".7" fill="#fff" opacity=".5"/>'
            f'<g filter="url(#bl)">{saturn()}</g><g class="shp" style="opacity:1">{saturn()}</g></g>'
            f'<circle r="24.5" fill="none" stroke="{c}" stroke-width="2.2"/>'
            f'<circle r="28.5" fill="none" stroke="{c}" stroke-opacity=".35" stroke-width="3"/>'
            f'<g transform="translate(21 21)"><circle r="6.5" fill="#1a2036" stroke="{c}" stroke-width="1.4"/>'
            f'<g class="kn"><path d="M0 -6.5V-2" stroke="{c}" stroke-width="1.6" stroke-linecap="round"/></g></g>')
    defs = ('<radialGradient id="sat" cx=".4" cy=".35" r=".75"><stop offset="0" stop-color="#fff1cf"/><stop offset=".6" stop-color="#e3c27f"/>'
            '<stop offset="1" stop-color="#8a6a33"/></radialGradient>'
            '<filter id="bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2"/></filter>')
    return defs, css, body


def i_help(c):
    T = 3
    css = (kf("ky", [(0, "transform:translateY(0)"), (40, "transform:translateY(0)"), (48, "transform:translateY(4px)"),
                     (60, "transform:translateY(4px)"), (70, "transform:translateY(0)"), (100, "transform:translateY(0)")])
           + anim(".ky", "ky", T, "ease-in-out")
           + kf("rp", [(0, "transform:scale(.6);opacity:0"), (46, "transform:scale(.6);opacity:0"), (50, "transform:scale(.7);opacity:.9"),
                       (85, "transform:scale(1.25);opacity:0"), (100, "transform:scale(1.25);opacity:0")]) + anim(".rp", "rp", T, "ease-out"))
    body = (f'<g class="rp" style="opacity:0"><rect x="-26" y="-24" width="52" height="52" rx="12" fill="none" stroke="{c}" stroke-width="1.6"/></g>'
            f'<g transform="translate(-19 -19)">{keycap("?", 38, 36, c, 24, cls="ky")}</g>')
    return "", css, body


ICONS = {"open-site": i_open, "telescope": i_telescope, "sun": i_sun, "sky": i_sky, "fly": i_fly, "learn": i_learn,
         "simulator": i_simulator, "help": i_help}


# ------------------------------------------------------------------------ frame
LARGE = dict(w=560, h=120, m=4, lip=6, rx=24, icx=66, ring=40, isc=1.1, tx=122, ly=51, ls=23.5, sy=79, ss=17.5, ar=20, arx=516)
SMALL = dict(w=380, h=90, m=3, lip=5, rx=18, icx=43, ring=28, isc=.74, tx=82, ly=39, ls=16.5, sy=61, ss=13, ar=12, arx=356)


def button(name, label, sub, c, alt, P):
    w, h, m, lip, rx = P["w"], P["h"], P["m"], P["lip"], P["rx"]
    ch = h - 2 * m - lip                      # card height
    cy = m + ch / 2
    icx, ring, isc = P["icx"], P["ring"], P["isc"]
    tx, arx, ar = P["tx"], P["arx"], P["ar"]
    # text must clear the arrow, even in the wider system fonts GitHub viewers see
    lim = arx - ar - 8
    assert tx + text_w(label, P["ls"], True) <= lim, (name, P["w"], "label", tx + text_w(label, P["ls"], True), lim)
    assert tx + text_w(sub, P["ss"]) <= lim, (name, P["w"], "subtitle")
    idefs, icss, ibody = ICONS[name](c)
    css = (icss
           + kf("sw", [(0, "transform:translateX(-160px)"), (62, "transform:translateX(-160px)"), (100, f"transform:translateX({w + 40}px)")])
           + anim(".sw", "sw", 6, "cubic-bezier(.5,0,.3,1)")
           + kf("nu", [(0, "transform:translateX(0)"), (50, "transform:translateX(4px)"), (100, "transform:translateX(0)")])
           + anim(".nu", "nu", 1.8, "ease-in-out")
           + kf("rg", [(0, "transform:rotate(0)"), (100, "transform:rotate(360deg)")]) + anim(".rg", "rg", 24))
    defs = (f'<clipPath id="cc"><rect x="{m}" y="{m}" width="{w - 2 * m}" height="{ch}" rx="{rx}"/></clipPath>'
            '<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101631"/><stop offset="1" stop-color="#060813"/></linearGradient>'
            f'<radialGradient id="gl" gradientUnits="userSpaceOnUse" cx="{icx}" cy="{f(cy)}" r="{f(w * .45)}"><stop offset="0" stop-color="{c}" stop-opacity=".24"/>'
            f'<stop offset="1" stop-color="{c}" stop-opacity="0"/></radialGradient>'
            f'<linearGradient id="bd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c}" stop-opacity=".95"/>'
            f'<stop offset=".55" stop-color="{c}" stop-opacity=".35"/><stop offset="1" stop-color="{c}" stop-opacity=".7"/></linearGradient>'
            '<linearGradient id="sh" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/>'
            '<stop offset=".5" stop-color="#fff" stop-opacity=".11"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
            + idefs)
    sk = ch * .45
    body = (
        # raised lip
        f'<rect x="{m}" y="{m + lip}" width="{w - 2 * m}" height="{ch}" rx="{rx}" fill="#04050a"/>'
        f'<rect x="{m}" y="{m + lip}" width="{w - 2 * m}" height="{ch}" rx="{rx}" fill="{c}" fill-opacity=".4"/>'
        # card
        f'<g clip-path="url(#cc)"><rect x="{m}" y="{m}" width="{w - 2 * m}" height="{ch}" fill="url(#bg)"/>'
        f'<rect x="{m}" y="{m}" width="{w - 2 * m}" height="{ch}" fill="url(#gl)"/>'
        f'<g class="sw rm-hide" style="transform:translateX(-160px)"><path d="M{f(sk)} {m}H{f(sk + 70)}L70 {m + ch}H0Z" fill="url(#sh)"/></g>'
        f'<path d="M{m + rx} {m + 1.2}H{w - m - rx}" stroke="#fff" stroke-opacity=".14"/></g>'
        f'<rect x="{m + .9}" y="{m + .9}" width="{w - 2 * m - 1.8}" height="{ch - 1.8}" rx="{rx - .9}" fill="none" stroke="url(#bd)" stroke-width="1.8"/>'
        # icon well
        f'<g transform="translate({icx} {f(cy)})"><circle r="{ring}" fill="#04050a" fill-opacity=".55"/>'
        f'<circle r="{ring}" fill="{c}" fill-opacity=".1" stroke="{c}" stroke-opacity=".45" stroke-width="1.4"/>'
        f'<g class="rg"><circle r="{ring + 4}" fill="none" stroke="{c}" stroke-opacity=".4" stroke-dasharray="2 7" stroke-width="1.2"/></g>'
        f'<g transform="scale({isc})">{ibody}</g></g>'
        # text
        f'<text x="{tx}" y="{P["ly"]}" class="sans" font-size="{P["ls"]}" font-weight="700" letter-spacing="-.2" fill="{TEXT}">{esc(label)}</text>'
        f'<text x="{tx}" y="{P["sy"]}" class="sans" font-size="{P["ss"]}" fill="{TEXT2}" fill-opacity=".85">{esc(sub)}</text>'
        # arrow
        f'<g transform="translate({arx} {f(cy)})"><circle r="{ar}" fill="{c}" fill-opacity=".16" stroke="{c}" stroke-opacity=".7" stroke-width="1.4"/>'
        f'<g class="nu"><path d="M{f(-ar * .38)} 0H{f(ar * .38)}M{f(ar * .08)} {f(-ar * .3)}L{f(ar * .4)} 0L{f(ar * .08)} {f(ar * .3)}" '
        f'fill="none" stroke="{c}" stroke-width="{2.2 if ar > 15 else 1.8}" stroke-linecap="round" stroke-linejoin="round"/></g></g>'
    )
    title = f"{esc(label)} · Cosmic Library"
    desc = f"Button: {esc(label)} ({esc(sub)}). The icon shows {alt}."
    return svg_doc(w, h, title, desc, defs, css, body, uid=name[:3])


def build_all(only=()):
    for name, label, sub, c, alt in BUTTONS:
        if only and name not in only:
            continue
        yield name, button(name, label, sub, c, alt, LARGE)
        yield f"small/{name}", button(name, label, sub, c, alt, SMALL)
