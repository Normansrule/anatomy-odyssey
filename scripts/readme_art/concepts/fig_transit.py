"""transit.svg — Jupiter, then Earth, crossing the Sun as a distant observer would see it,
with each light curve drawn live. Depth = (Rp/R*)^2 (uniform-disc overlap, exact geometry)."""
import math
from _lib import *

W, H = 800, 360
R_SUN, R_JUP, R_EARTH = 695_700.0, 69_911.0, 6_371.0          # km (IAU 2015 nominal; Jupiter equatorial)
# (name, radius, orbital period d, semi-major axis km)
PLANETS = [("Jupiter", R_JUP, 4332.59, 778.479e6, FLAME), ("Earth", R_EARTH, 365.256, 149.598e6, ICE)]
DUR = 16.0
PH = [(0.03, 0.45), (0.53, 0.95)]                                 # loop fractions for each crossing
DMAX = 1.3                                                         # planet centre from -1.3 to +1.3 stellar radii


def pts_path(pts):
    return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts)


def overlap(d, k):
    if d >= 1 + k:
        return 0.0
    if d <= 1 - k:
        return math.pi * k * k
    a = k * k * math.acos((d * d + k * k - 1) / (2 * d * k))
    b = math.acos((d * d + 1 - k * k) / (2 * d))
    c = 0.5 * math.sqrt(max(0.0, (-d + k + 1) * (d + k - 1) * (d - k + 1) * (d + k + 1)))
    return a + b - c


def flux(d, k):
    return 1 - overlap(abs(d), k) / math.pi


def t14_hours(rp, P, a):
    """Central-transit duration: (P / pi) asin((R* + Rp) / a)."""
    return P * 24 / math.pi * math.asin((R_SUN + rp) / a)


def build():
    css, body = [], []
    body.append(card(W, H, seed=71, nstars=60))
    body.append(header(28, 34, "EXOPLANET TRANSITS · DEPTH = (Rₚ / R★)²", "A planet's shadow in starlight", size=21))

    SX, SY, SR = 168, 212, 112
    body.append('<defs><radialGradient id="sd" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff7da"/>'
                f'<stop offset=".7" stop-color="{SOL}"/><stop offset="1" stop-color="{FLAME}"/></radialGradient>'
                f'<radialGradient id="sg"><stop offset=".55" stop-color="{SOL}" stop-opacity=".35"/><stop offset="1" stop-color="{SOL}" stop-opacity="0"/></radialGradient></defs>')
    body.append(f'<circle cx="{SX}" cy="{SY}" r="{SR * 1.35}" fill="url(#sg)"/><circle cx="{SX}" cy="{SY}" r="{SR}" fill="url(#sd)"/>')
    body.append(text(SX, SY + SR + 26, "the Sun · planets to scale (ring = Earth)", 12.5, MUTED, anchor="middle"))

    PX0, PX1 = 350, 772
    boxes = [(90, 172), (222, 304)]                               # y top, bottom of each plot
    for p, (name, rp, P, a, col) in enumerate(PLANETS):
        k = rp / R_SUN
        depth = k * k
        T = t14_hours(rp, P, a)
        y0, y1 = boxes[p]
        lo = 1 - depth * 1.4
        hi = 1 + depth * .12

        def Y(v):
            return y1 - (v - lo) / (hi - lo) * (y1 - y0)
        tmax = DMAX / (1 + k) * T / 2

        def X(d):
            return PX0 + (d + DMAX) / (2 * DMAX) * (PX1 - PX0)
        # axes
        body.append(f'<path d="M{PX0} {y0}V{y1}H{PX1}" fill="none" stroke="#39436e"/>')
        body.append(f'<path d="M{PX0} {f(Y(1))}H{PX1}" stroke="{FAINT}" stroke-opacity=".4" stroke-dasharray="2 4"/>')
        body.append(f'<path d="M{PX0} {f(Y(1 - depth))}H{PX1}" stroke="{col}" stroke-opacity=".3" stroke-dasharray="2 4"/>')
        dep = f"{depth * 100:.2f}%" if depth > 1e-3 else f"{depth * 1e6:.0f} ppm"
        body.append(text(PX0 - 6, Y(1) + 4, "100%", 11, FAINT, "m", "end"))
        body.append(text(PX0 + 8, Y(1 - depth) + 16, f"−{dep}", 12, col, "m", weight=700))
        step = 12 if T > 20 else 6
        for h in (-step, 0, step):
            d = h / (T / 2) * (1 + k)
            body.append(f'<path d="M{f(X(d))} {y1}v4" stroke="{FAINT}"/>' + text(X(d), y1 + 15, "0 h" if h == 0 else f"{h:+d} h", 11, FAINT, "m", "middle"))
        title = (f"{name}: Rₚ/R★ = {k:.4f} → depth {dep}" if depth > 1e-3 else f"{name}: Rₚ/R★ = {k:.5f} → depth {dep}")
        body.append(text(PX0 + 6, y0 - 8, title, 13, TEXT, weight=700))
        body.append(text(PX1, y0 - 8, f"transit {T:.1f} h", 12, TEXT2, "m", "end"))
        # the light curve, drawn in step with the planet
        n = 140
        ds = [-DMAX + 2 * DMAX * i / n for i in range(n + 1)]
        pts = [(X(d), Y(flux(d, k))) for d in ds]
        cum = [0.0]
        for (x1, y1_), (x2, y2) in zip(pts, pts[1:]):
            cum.append(cum[-1] + math.hypot(x2 - x1, y2 - y1_))
        L = cum[-1]
        t0, t1 = PH[p]
        st, dot, pl = [(0, "stroke-dashoffset:1;opacity:1")], [], []
        for i in range(0, n + 1, 4):
            tt = t0 + (t1 - t0) * i / n
            st.append((tt, f"stroke-dashoffset:{f(1 - cum[i] / L, 4)};opacity:1"))
            dot.append((tt, f"transform:translate({f(pts[i][0])}px,{f(pts[i][1])}px);opacity:1"))
            pl.append((tt, f"transform:translateX({f(ds[i] * SR)}px);opacity:1"))
        end = t1 + .02
        st += [(0.985, "stroke-dashoffset:0;opacity:1"), (1, "stroke-dashoffset:0;opacity:0")]
        # hold the finished curve until the loop ends, then fade; the other plot keeps its curve too
        dot = [(0, dot[0][1].replace("opacity:1", "opacity:0")), (t0 - .005, dot[0][1].replace("opacity:1", "opacity:0"))] + dot + [(end, dot[-1][1].replace("opacity:1", "opacity:0")), (1, dot[-1][1].replace("opacity:1", "opacity:0"))]
        pl = [(0, pl[0][1].replace("opacity:1", "opacity:0")), (t0 - .005, pl[0][1].replace("opacity:1", "opacity:0"))] + pl + [(t1 + .005, pl[-1][1].replace("opacity:1", "opacity:0")), (1, pl[-1][1].replace("opacity:1", "opacity:0"))]
        cls = f"c{p}"
        css.append(kf(cls, st) + anim("." + cls, cls, DUR))
        css.append(kf(f"d{p}", dot) + anim(f".d{p}", f"d{p}", DUR))
        css.append(kf(f"p{p}", pl) + anim(f".p{p}", f"p{p}", DUR))
        body.append(f'<path class="{cls}" d="{pts_path(pts)}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="{col}" stroke-width="2.2" stroke-linejoin="round"/>')
        body.append(f'<g class="d{p}" style="opacity:0"><circle r="7" fill="{col}" opacity=".3"/><circle r="3.2" fill="#fff"/></g>')
        # the planet on the disc (true size relative to the Sun)
        pr = max(k * SR, 1.1)
        ring = (f'<circle r="7" fill="none" stroke="{col}" stroke-width="1.4"/>'
                ) if p == 1 else ""
        body.append(f'<g transform="translate({SX} {SY})"><g class="p{p}" style="opacity:0"><circle r="{f(pr, 2)}" fill="#0b0b12"/>{ring}</g></g>')
    body.append(text(PX1, 344, "lower plot zoomed ×120 · central transits · uniform disc · sped up", 11.5, FAINT, anchor="end"))

    kj, ke = R_JUP / R_SUN, R_EARTH / R_SUN
    desc = ("Animated transit diagram. Jupiter, then Earth, crosses the Sun's disc as a distant observer would see it, drawn to scale, and "
            "each light curve is traced as the planet moves. Transit depth = (Rp/R*)² with R_sun = 695,700 km, R_Jupiter = 69,911 km, "
            f"R_Earth = 6,371 km: Jupiter {kj:.4f}² = {kj * kj * 100:.2f}%; Earth {ke:.5f}² = {ke * ke * 1e6:.0f} parts per million "
            f"(0.0084%), about 120 times shallower, which is why the lower plot uses a zoomed axis. Central-transit durations "
            f"T = (P/π)·asin((R* + Rp)/a): Jupiter {t14_hours(R_JUP, 4332.59, 778.479e6):.1f} h, Earth {t14_hours(R_EARTH, 365.256, 149.598e6):.1f} h. "
            "Curve shapes use exact circle-overlap geometry for a uniform disc (limb darkening would round the bottoms). "
            "This is how the Kepler and TESS missions found thousands of exoplanets.")
    svg(W, H, "Exoplanet transits: Jupiter and Earth crossing the Sun", desc, "".join(body), "".join(css), name="transit.svg")


if __name__ == "__main__":
    build()
