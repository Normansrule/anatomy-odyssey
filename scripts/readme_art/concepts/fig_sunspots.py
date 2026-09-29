"""sunspot-rotation.svg — the Sun rotates faster at its equator than near its poles.

Sidereal rotation rate ω(φ) = A + B sin²φ + C sin⁴φ (degrees/day), with the magnetic-feature fit of
Snodgrass & Ulrich (1990, ApJ 351, 309): A = 14.713, B = −2.396, C = −1.787. A chain of markers starts
on one meridian and is sheared as the days pass (viewed with the solar equator edge-on, B₀ = 0)."""
import math
from _lib import *

W, H = 800, 360
A_, B_, C_ = 14.713, -2.396, -1.787
LATS = [75, 60, 45, 30, 15, 0, -15, -30, -45, -60, -75]
DAYS = 9
LON0 = -70.0                     # start meridian (degrees from the central meridian; east limb = -90)
DUR = 13.0
T0, T1 = 0.10, 0.80              # loop fractions: day 0 ... day DAYS


def omega(lat):
    s = math.sin(math.radians(lat)) ** 2
    return A_ + B_ * s + C_ * s * s


def period(lat):
    return 360 / omega(lat)


def build():
    css, body = [], []
    body.append(card(W, H, seed=113, nstars=60))
    body.append(header(28, 34, "DIFFERENTIAL ROTATION", "The Sun's equator outruns its poles", size=21))
    CX, CY, R = 190, 206, 124
    body.append(f'<defs><radialGradient id="sd" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4d0"/><stop offset=".72" stop-color="#ffc24b"/>'
                f'<stop offset=".95" stop-color="#f08a2c"/><stop offset="1" stop-color="#d9651c"/></radialGradient>'
                f'<radialGradient id="sg"><stop offset=".6" stop-color="{SOL}" stop-opacity=".3"/><stop offset="1" stop-color="{SOL}" stop-opacity="0"/></radialGradient>'
                f'<clipPath id="disc"><circle cx="{CX}" cy="{CY}" r="{R}"/></clipPath></defs>')
    body.append(f'<circle cx="{CX}" cy="{CY}" r="{R * 1.25}" fill="url(#sg)"/><circle cx="{CX}" cy="{CY}" r="{R}" fill="url(#sd)"/>')
    # latitude lines
    grid = "".join(f'<path d="M{f(CX - R * math.cos(math.radians(l)))} {f(CY - R * math.sin(math.radians(l)))}H{f(CX + R * math.cos(math.radians(l)))}"/>'
                   for l in (-60, -30, 0, 30, 60))
    body.append(f'<g stroke="#8a3a10" stroke-opacity=".25" clip-path="url(#disc)">{grid}</g>')
    body.append(text(CX - R - 8, CY + 4, "E", 12, FAINT, "m", "end") + text(CX + R + 8, CY + 4, "W", 12, FAINT, "m"))
    body.append(text(CX, CY - R - 8, "N", 12, FAINT, "m", "middle"))

    def xy(lat, lon):
        la, lo = math.radians(lat), math.radians(lon)
        return CX + R * math.cos(la) * math.sin(lo), CY - R * math.sin(la), math.cos(la) * math.cos(lo)

    # starting meridian (dashed)
    mer = [xy(l, LON0) for l in range(-88, 89, 4)]
    body.append(f'<path d="M{"L".join(f"{f(x)} {f(y)}" for x, y, _ in mer)}" fill="none" stroke="#6b2a08" stroke-opacity=".6" stroke-dasharray="3 3"/>')

    nstep = DAYS * 2
    frames = []
    for j in range(nstep + 1):
        day = DAYS * j / nstep
        frames.append([xy(l, LON0 + omega(l) * day) for l in LATS])
    for i, lat in enumerate(LATS):
        st = [(0, f"transform:translate({f(frames[0][i][0])}px,{f(frames[0][i][1])}px);opacity:0"),
              (T0 - .04, f"transform:translate({f(frames[0][i][0])}px,{f(frames[0][i][1])}px);opacity:1")]
        for j in range(nstep + 1):
            st.append((T0 + (T1 - T0) * j / nstep, f"transform:translate({f(frames[j][i][0])}px,{f(frames[j][i][1])}px);opacity:1"))
        st += [(.93, f"transform:translate({f(frames[-1][i][0])}px,{f(frames[-1][i][1])}px);opacity:1"),
               (.98, f"transform:translate({f(frames[-1][i][0])}px,{f(frames[-1][i][1])}px);opacity:0"),
               (1, f"transform:translate({f(frames[0][i][0])}px,{f(frames[0][i][1])}px);opacity:0")]
        css.append(kf(f"m{i}", st) + anim(f".m{i}", f"m{i}", DUR))
        if abs(lat) <= 30:     # sunspot belt
            mark = ('<ellipse rx="7" ry="5.5" fill="#8a3a10" opacity=".75"/><ellipse rx="3.4" ry="2.8" fill="#2a0c02"/>')
        else:                  # higher latitudes: tracked with magnetic features, not spots
            mark = f'<circle r="4.2" fill="#fff" stroke="{PLASMA}" stroke-width="2"/>'
        x, y, _ = frames[-1][i]
        body.append(f'<g class="m{i}" style="transform:translate({f(x)}px,{f(y)}px)">{mark}</g>')
    # connecting curve (SMIL points) + still twin
    pts = lambda fr: " ".join(f"{f(x)},{f(y)}" for x, y, _ in fr)
    vals = [pts(frames[0])] * 2 + [pts(fr) for fr in frames] + [pts(frames[-1])] * 2 + [pts(frames[0])]
    kts = [0, T0] + [T0 + (T1 - T0) * j / nstep for j in range(nstep + 1)] + [.93, .999, 1]
    vals = vals[:len(kts)]
    line = f'fill="none" stroke="{PLASMA}" stroke-width="1.6" stroke-opacity=".8"'
    body.append(f'<g class="smil"><polyline points="{pts(frames[-1])}" {line}><animate attributeName="points" values="{";".join(vals)}" '
                f'keyTimes="{keytimes(kts)}" dur="{f(DUR)}s" repeatCount="indefinite"/>'
                f'<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;{f(T0 - .04, 3)};{f(T0, 3)};.93;.98;1" dur="{f(DUR)}s" repeatCount="indefinite"/></polyline></g>')
    body.append(f'<g class="still"><polyline points="{pts(frames[-1])}" {line}/></g>')
    # day counter
    for d in range(DAYS + 1):
        a = T0 + (T1 - T0) * d / DAYS
        b = T0 + (T1 - T0) * (d + 1) / DAYS if d < DAYS else .95
        cls = f"dy{d}"
        if d == 0:
            stp = [(0, "opacity:1"), (b, "opacity:1"), (b + .001, "opacity:0"), (.985, "opacity:0"), (1, "opacity:1")]
        else:
            stp = [(0, "opacity:0"), (a - .001, "opacity:0"), (a, "opacity:1"), (b, "opacity:1"), (b + .001, "opacity:0"), (1, "opacity:0")]
        css.append(f".{cls}{{opacity:{1 if d == DAYS else 0}}}" + kf(cls, stp) + anim("." + cls, cls, DUR))
        body.append(f'<g class="{cls}">' + text(28, 94, f"day {d}", 22, TEXT, "m", weight=700) + "</g>")

    # right: a map of the surface — how far each latitude has turned since day 0
    GX0, GX1, GY0, GY1 = 392, 690, 104, 284
    XMAX = 140.0
    gx = lambda deg: GX0 + deg / XMAX * (GX1 - GX0)
    gy = lambda lat: GY0 + (75 - lat) / 150 * (GY1 - GY0)
    body.append(text(GX0 - 34, 84, "Degrees turned since day 0", 14, TEXT, weight=700))
    body.append(f'<path d="M{GX0} {GY0 - 8}V{GY1 + 8}H{GX1 + 6}" fill="none" stroke="#39436e"/>')
    for d in (0, 45, 90, 135):
        body.append(f'<path d="M{f(gx(d))} {GY1 + 8}v4" stroke="{FAINT}"/>' + text(gx(d), GY1 + 25, f"{d}°", 11.5, FAINT, "m", "middle"))
    for l in (60, 30, 0, -30, -60):
        body.append(text(GX0 - 8, gy(l) + 4, f"{l:+d}°".replace("+0", "0"), 11.5, FAINT, "m", "end")
                    + f'<path d="M{GX0} {f(gy(l))}H{GX1}" stroke="{FAINT}" stroke-opacity=".12"/>')
    body.append(f'<rect x="{GX0}" y="{f(gy(35))}" width="{GX1 - GX0}" height="{f(gy(-35) - gy(35))}" fill="{SOL}" opacity=".06"/>')
    body.append(f'<path d="M{GX0} {GY0}V{GY1}" stroke="#6b2a08" stroke-opacity=".8" stroke-dasharray="3 3"/>')
    ends = [(gx(omega(l) * DAYS), gy(l)) for l in LATS]
    starts = [(gx(0), gy(l)) for l in LATS]
    for i, lat in enumerate(LATS):
        xe, ye = ends[i]
        dx = f(xe - GX0)
        stp = [(0, "transform:translateX(0);opacity:0"), (T0 - .04, "transform:translateX(0);opacity:1"), (T0, "transform:translateX(0);opacity:1"),
               (T1, f"transform:translateX({dx}px);opacity:1"), (.93, f"transform:translateX({dx}px);opacity:1"),
               (.98, f"transform:translateX({dx}px);opacity:0"), (1, "transform:translateX(0);opacity:0")]
        css.append(kf(f"g{i}", stp) + anim(f".g{i}", f"g{i}", DUR))
        mark = ('<ellipse rx="5" ry="4" fill="#8a3a10"/><ellipse rx="2.4" ry="2" fill="#2a0c02"/>' if abs(lat) <= 30
                else f'<circle r="3.6" fill="#fff" stroke="{PLASMA}" stroke-width="1.8"/>')
        body.append(f'<g transform="translate({GX0} {f(ye)})"><g class="g{i}" style="transform:translateX({dx}px)">{mark}</g></g>')
        if lat >= 0 and lat % 30 == 0 or lat == 75:
            body.append(text(GX1 + 12, ye + 4, f"{period(lat):.1f} d", 12, TEXT2, "m"))
    body.append(text(GX1 + 12, GY0 - 14, "period", 11.5, FAINT, "m"))
    p2 = lambda arr: " ".join(f"{f(x)},{f(y)}" for x, y in arr)
    line2 = f'fill="none" stroke="{PLASMA}" stroke-width="1.6" stroke-opacity=".8"'
    body.append(f'<g class="smil"><polyline points="{p2(ends)}" {line2}><animate attributeName="points" values="{p2(starts)};{p2(starts)};{p2(ends)};{p2(ends)};{p2(starts)}" '
                f'keyTimes="0;{f(T0, 3)};{f(T1, 3)};.999;1" dur="{f(DUR)}s" repeatCount="indefinite"/>'
                f'<animate attributeName="opacity" values="0;0;1;1;0;0" keyTimes="0;{f(T0 - .04, 3)};{f(T0, 3)};.93;.98;1" dur="{f(DUR)}s" repeatCount="indefinite"/></polyline></g>')
    body.append(f'<g class="still"><polyline points="{p2(ends)}" {line2}/></g>')
    body.append(text(772, 330, "shaded: sunspot belt · ● sunspot  ○ magnetic tracer · Snodgrass & Ulrich 1990", 11.5, FAINT, anchor="end"))
    body.append(text(772, 346, f"seen from the moving Earth, the equator takes {1 / (1 / period(0) - 1 / 365.256):.1f} d (synodic)", 11.5, FAINT, anchor="end"))

    desc = ("Animated diagram of the Sun's differential rotation. A chain of markers starts on one meridian of the solar disc; over "
            f"{DAYS} days (sped up, day counter shown) the equator carries its markers farthest, so the chain shears into a curve. Rates are "
            "the sidereal fit ω = 14.713 − 2.396 sin²φ − 1.787 sin⁴φ degrees per day (Snodgrass & Ulrich 1990): period "
            + ", ".join(f"{period(l):.1f} days at {l}°" for l in (0, 15, 30, 45, 60, 75, 90))
            + ". So the equator turns in about 25 days and the poles in about 34–35. Sunspots (drawn at 0°, ±15°, ±30°) only appear within "
              "about ±35°; higher latitudes are measured from magnetic features and helioseismology. Seen from the orbiting Earth the "
              f"equatorial (synodic) period is {1 / (1 / period(0) - 1 / 365.256):.1f} days. The solar equator is drawn edge-on (B₀ = 0).")
    svg(W, H, "Differential rotation of the Sun", desc, "".join(body), "".join(css), name="sunspot-rotation.svg")


if __name__ == "__main__":
    build()
