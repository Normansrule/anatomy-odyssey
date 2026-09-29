"""telescope-resolution.svg — two stars 1.0″ apart through telescopes of growing aperture D.

The image of a point source through a circular aperture is an Airy pattern,
I(θ) = [2 J₁(v)/v]², v = π D sin θ / λ; its first dark ring is at θ = 1.22 λ/D
(Airy 1835; Rayleigh criterion 1879). λ = 550 nm (green light, peak eye sensitivity).
"""
import math
from _lib import *

W, H = 800, 360
LAM = 550e-9
RAD2AS = 206264.806
SEP = 1.0                                         # arcsec between the two stars
STATES = [                                        # D (m), what it is, verdict
    (0.05, "50 mm binoculars", "blended", PLASMA),
    (0.10, "10 cm backyard telescope", "blended", PLASMA),
    (1.22 * LAM * RAD2AS / SEP, "13.8 cm: the Rayleigh limit", "just split", SOL),
    (0.25, "25 cm amateur telescope", "resolved", AURORA),
    (2.4, "Hubble, 2.4 m mirror", "resolved", AURORA),
]
HOLD, MOVE = 2.3, 0.9
SEG = HOLD + MOVE
DUR = SEG * len(STATES)
STILL = 2                                         # reduced-motion frame: the Rayleigh limit


def theta_as(D):
    return 1.22 * LAM / D * RAD2AS


def j1(x):
    if x == 0:
        return 0.0
    n = max(400, int(abs(x) * 10))
    n += n % 2
    h = math.pi / n
    s = 0.0
    for i in range(n + 1):
        t = i * h
        w = 1 if i in (0, n) else (4 if i % 2 else 2)
        s += w * math.cos(t - x * math.sin(t))
    return s * h / 3 / math.pi


def airy(r_as, th):
    v = 3.8317 * r_as / th
    if abs(v) < 1e-9:
        return 1.0
    return (2 * j1(v) / v) ** 2


# plot geometry
PX0, PX1, PY0, PY1 = 346, 772, 96, 262           # intensity plot box
XR = 2.2                                          # arcsec either side
YMAX = 2.1


def px(x):
    return PX0 + (x + XR) / (2 * XR) * (PX1 - PX0)


def py(y):
    return PY1 - y / YMAX * (PY1 - PY0)


def samples():
    xs = set(round(-XR + 2 * XR * i / 90, 4) for i in range(91))
    for c in (-SEP / 2, SEP / 2):
        for i in range(-14, 15):
            xs.add(round(c + i * 0.012, 4))
    return sorted(x for x in xs if -XR <= x <= XR)


def profile(D, xs):
    th = theta_as(D)
    pts = [(px(x), py(airy(x + SEP / 2, th) + airy(x - SEP / 2, th))) for x in xs]
    return "M" + "L".join(f"{f(a)} {f(b)}" for a, b in pts)


def build():
    css, body = [], []
    body.append(card(W, H, seed=61, nstars=70))
    body.append(header(28, 34, "DIFFRACTION LIMIT · θ = 1.22 λ / D", "Bigger mirrors split closer stars", size=21))

    # --- left: the image two stars make on the camera -----------------------------
    ix, iy, iw, ih = 28, 76, 256, 218
    cx, cy = ix + iw / 2, iy + ih / 2
    SCALE = 90                                    # px per arcsec on the image
    R0 = 100                                      # blob drawn with its first dark ring at 100 px
    stops = []
    for k in range(26):
        r = k / 25 * 2.3                          # in units of theta
        v = .88 * airy(r, 1.0) ** 0.55             # display brightness (gamma-compressed intensity)
        stops.append(f'<stop offset="{f(r / 2.3, 3)}" stop-color="#fff5d6" stop-opacity="{f(min(1, v), 3)}"/>')
    body.append(f'<defs><radialGradient id="ai" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="{f(R0 * 2.3)}">{"".join(stops)}</radialGradient>'
                f'<clipPath id="img"><rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" rx="10"/></clipPath></defs>')
    body.append(f'<rect x="{ix}" y="{iy}" width="{iw}" height="{ih}" rx="10" fill="#000" stroke="#2a3358"/>')
    blobs = []
    for s_i, sx in enumerate((-SEP / 2, SEP / 2)):
        blobs.append(f'<g transform="translate({f(cx + sx * SCALE)} {f(cy)})"><g class="bl" style="transform:scale({f(theta_as(STATES[STILL][0]) * SCALE / R0, 4)})">'
                     f'<circle r="{f(R0 * 2.3)}" fill="url(#ai)" style="mix-blend-mode:screen"/></g></g>')
    body.append(f'<g clip-path="url(#img)">{"".join(blobs)}</g>')
    st = []
    for k, (D, *_r) in enumerate(STATES):
        s = f(theta_as(D) * SCALE / R0, 4)
        st += [(k * SEG / DUR, f"transform:scale({s})"), ((k * SEG + HOLD) / DUR, f"transform:scale({s})")]
    st.append((1, f"transform:scale({f(theta_as(STATES[0][0]) * SCALE / R0, 4)})"))
    css.append(kf("bl", st) + anim(".bl", "bl", DUR, "ease-in-out"))
    # separation bracket
    bx0, bx1, by = cx - SEP / 2 * SCALE, cx + SEP / 2 * SCALE, iy + ih + 12
    body.append(f'<path d="M{f(bx0)} {by - 5}V{by}H{f(bx1)}V{by - 5}" fill="none" stroke="{ICE}" stroke-opacity=".8"/>')
    body.append(text(bx1 + 10, by + 4, "1.0″ apart", 12, ICE, "m"))
    body.append(text(ix, by + 4, "camera", 12.5, MUTED))

    # --- right: brightness across the pair --------------------------------------------
    body.append(f'<path d="M{PX0} {PY0 - 6}V{PY1}H{PX1}" fill="none" stroke="#39436e"/>')
    for a in (-2, -1, 0, 1, 2):
        body.append(f'<path d="M{f(px(a))} {PY1}v4" stroke="{FAINT}"/>' + text(px(a), PY1 + 17, f"{a:+d}″".replace("+0", "0"), 11.5, FAINT, "m", "middle"))
    body.append(f'<path d="M{PX0 - 4} {f(py(1))}H{PX1}" stroke="{FAINT}" stroke-opacity=".35" stroke-dasharray="2 4"/>')
    body.append(text(PX0 - 8, py(1) + 4, "1", 11.5, FAINT, "m", "end") + text(PX0 - 8, py(2) + 4, "2", 11.5, FAINT, "m", "end"))
    body.append(text(PX0 + 6, PY0 + 4, "brightness (one star's peak = 1)", 11.5, FAINT, "m"))
    for sx in (-SEP / 2, SEP / 2):
        body.append(f'<path d="M{f(px(sx))} {PY0 + 12}V{PY1}" stroke="{ICE}" stroke-opacity=".3" stroke-dasharray="3 3"/>')
    xs = samples()
    paths = [profile(D, xs) for D, *_ in STATES]
    vals, kts = [], []
    for k, p in enumerate(paths):
        vals += [p, p]
        kts += [k * SEG / DUR, (k * SEG + HOLD) / DUR]
    vals.append(paths[0])
    kts.append(1)
    common_attr = f'fill="none" stroke="{SOL}" stroke-width="2.4" stroke-linejoin="round"'
    body.append(f'<g class="smil"><path d="{paths[STILL]}" {common_attr}><animate attributeName="d" values="{";".join(vals)}" '
                f'keyTimes="{keytimes(kts)}" dur="{f(DUR)}s" repeatCount="indefinite"/></path></g>')
    body.append(f'<g class="still"><path d="{paths[STILL]}" {common_attr}/></g>')

    # --- readouts, one per state ---------------------------------------------------------
    for k, (D, what, verdict, col) in enumerate(STATES):
        th = theta_as(D)
        dtxt = (f"D = {D * 100:.0f} cm" if abs(D * 100 - round(D * 100)) < .05 else f"D = {D * 100:.1f} cm") if D < 1 else f"D = {D:.1f} m"
        ttxt = f"θ = {th:.2f}″" if th >= 0.1 else f"θ = {th:.3f}″"
        g = (text(PX0, 300, dtxt, 20, TEXT, "m", weight=700) + text(PX0 + 168, 300, ttxt, 20, col, "m", weight=700)
             + text(PX0, 324, what, 13.5, TEXT2)
             + f'<g transform="translate({PX1 - 96} 284)"><rect width="96" height="24" rx="12" fill="{col}" fill-opacity=".14" stroke="{col}" stroke-opacity=".6"/>'
             + text(48, 16.5, verdict, 12.5, col, "s", "middle", 700) + "</g>")
        cls = f"r{k}"
        a, b = k * SEG / DUR, (k * SEG + HOLD + MOVE * .5) / DUR
        t_in = a - MOVE * .5 / DUR
        if k == 0:
            stp = [(0, "opacity:1"), (b - .01, "opacity:1"), (b, "opacity:0"), (1 - MOVE * .5 / DUR - .005, "opacity:0"), (1 - MOVE * .5 / DUR, "opacity:1"), (1, "opacity:1")]
        else:
            stp = [(0, "opacity:0"), (t_in - .005, "opacity:0"), (t_in, "opacity:1"), (b - .005, "opacity:1"), (b, "opacity:0"), (1, "opacity:0")]
        css.append(f".{cls}{{opacity:{1 if k == STILL else 0}}}" + kf(cls, stp) + anim("." + cls, cls, DUR))
        body.append(f'<g class="{cls}">{g}</g>')
    body.append(text(PX1, 344, "λ = 550 nm · each profile scaled to one star's peak", 11.5, FAINT, anchor="end"))

    rows = "; ".join(f"{what}: D = {D:.3g} m → θ = 1.22 × 550 nm / D = {theta_as(D):.3f} arcsec ({verdict})" for D, what, verdict, _ in STATES)
    desc = ("Animated diagram of the diffraction limit. Two stars 1.0 arcsecond apart are imaged through telescopes of growing aperture D; "
            "each star becomes an Airy pattern whose first dark ring sits at θ = 1.22 λ/D (Airy 1835; Rayleigh criterion). Left: the camera "
            "image; right: the brightness profile across both stars, I = [2 J₁(v)/v]² summed for the two stars, computed at build time. "
            "λ = 550 nm. " + rows + ". The pair is 'just split' when θ equals the separation (Rayleigh criterion). Atmospheric seeing "
            "(typically 1–2 arcseconds) limits ground telescopes in practice; Hubble, above the atmosphere, reaches its diffraction limit.")
    svg(W, H, "Telescope resolution: the diffraction limit", desc, "".join(body), "".join(css), name="telescope-resolution.svg")


if __name__ == "__main__":
    build()
