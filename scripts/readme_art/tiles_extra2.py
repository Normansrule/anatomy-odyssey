"""Scenes for the Mission designer, Moon explorer, Deep Space Network and Space Academy tiles.

Same contract as tiles.py scenes: dict(defs, css, body[, stars]) drawn inside the 400 x 250 card
(title and description sit on a scrim below y = 150, so scenes live in about y 44-175).
Parts animated with SMIL (path shapes CSS cannot animate everywhere) live in <g class="smil">
with a static twin in <g class="still"> for viewers who ask for reduced motion.
"""
import math
import random

from common import AURORA, FAINT, FLAME, ICE, MUTED, NEBULA, PLASMA, SOL, TEXT, TEXT2, anim, f, kf, tr

SMIL_CSS = ".still{display:none}@media (prefers-reduced-motion:reduce){.smil{display:none}.still{display:inline}}"


def win(name, a, b, fade, lo=0, hi=1):
    st = [(0, f"opacity:{lo}")]
    if a - fade > 0:
        st.append((a - fade, f"opacity:{lo}"))
    st += [(a, f"opacity:{hi}"), (b, f"opacity:{hi}"), (min(100, b + fade), f"opacity:{lo}")]
    if b + fade < 100:
        st.append((100, f"opacity:{lo}"))
    return kf(name, st)


# ------------------------------------------------------------------------ Mission designer
MU_SUN = 1.32712440018e11        # km^3/s^2
MU_EARTH = 398600.4418
AU = 1.495978707e8
R_E, R_M = 1.0 * AU, 1.523679 * AU


def hohmann():
    """Earth -> Mars Hohmann transfer between circular, coplanar orbits."""
    a = (R_E + R_M) / 2
    v_e = math.sqrt(MU_SUN / R_E)
    v_p = math.sqrt(MU_SUN * (2 / R_E - 1 / a))
    vinf = v_p - v_e
    c3 = vinf ** 2
    tof = math.pi * math.sqrt(a ** 3 / MU_SUN) / 86400
    r_leo = 6378.137 + 300
    dv_leo = math.sqrt(vinf ** 2 + 2 * MU_EARTH / r_leo) - math.sqrt(MU_EARTH / r_leo)
    return c3, dv_leo, tof


def s_mission():
    T = 11
    c3, dv, tof = hohmann()
    # porkchop panel (stylised C3 contours: two lobes, short "type I" and long "type II" transfers)
    px, py, pw, ph = 24, 50, 124, 96
    css, body = [], []
    lobes = [(px + 44, py + 60, 1.0, -28), (px + 88, py + 30, .8, -28)]
    cols = ["#4ef0b8", "#7cc8ff", "#b18cff", "#ff7a9a", "#ff7a3d"]
    k = 0
    for (cx, cy, s, rot) in lobes:
        for j, c in enumerate(cols):
            rx, ry = (8 + 9 * j) * s, (5 + 5.5 * j) * s
            cls = f"pc{k}"
            k += 1
            css.append(anim(f".{cls}", "pcs", 3.2, "ease-in-out", delay=-(j * .35 + (0 if s == 1 else 1.6))))
            body.append(f'<ellipse class="{cls}" cx="{f(cx)}" cy="{f(cy)}" rx="{f(rx)}" ry="{f(ry)}" transform="rotate({rot} {f(cx)} {f(cy)})" '
                        f'fill="none" stroke="{c}" stroke-width="1.3" opacity=".8"/>')
    css.append(kf("pcs", [(0, "opacity:.45"), (50, "opacity:1"), (100, "opacity:.45")]))
    clip = f'<clipPath id="pk"><rect x="{px}" y="{py}" width="{pw}" height="{ph}"/></clipPath>'
    body = [clip, f'<rect x="{px}" y="{py}" width="{pw}" height="{ph}" fill="#060913" stroke="#96aaff" stroke-opacity=".3"/>',
            f'<g clip-path="url(#pk)">'] + body + ['</g>']
    ox, oy = lobes[0][0], lobes[0][1]
    body.append(f'<g class="pm" style="opacity:1"><path d="M{ox - 7} {oy}H{ox + 7}M{ox} {oy - 7}V{oy + 7}" stroke="#fff" stroke-width="1.5"/>'
                f'<circle cx="{ox}" cy="{oy}" r="3" fill="#fff"/></g>')
    css.append(kf("pm", [(0, "opacity:0;transform:scale(1)"), (5, "opacity:0"), (9, "opacity:1"), (92, "opacity:1"), (97, "opacity:0"), (100, "opacity:0")])
               + anim(".pm", "pm", T))
    body.append(f'<text class="mono" x="{px}" y="{py + ph + 13}" font-size="10" fill="{FAINT}">launch date →</text>')
    body.append(f'<text class="mono" x="{px - 4}" y="{py + ph}" font-size="10" fill="{FAINT}" transform="rotate(-90 {px - 4} {py + ph})">arrival →</text>')

    # the transfer, to scale (1 AU = 34 px)
    sx, sy, s = 220, 98, 34
    rE, rM = s, s * R_M / R_E
    th0 = math.radians(205)
    e = (R_M - R_E) / (R_M + R_E)
    a_px = (rE + rM) / 2
    n = 40
    t0, t1 = 14, 66                              # loop percent: launch, arrival
    craft, earth, mars, arc = [], [], [], []
    for i in range(n + 1):
        u = i / n
        M = math.pi * u
        E = M
        for _ in range(40):
            E -= (E - e * math.sin(E) - M) / (1 - e * math.cos(E))
        nu = 2 * math.atan2(math.sqrt(1 + e) * math.sin(E / 2), math.sqrt(1 - e) * math.cos(E / 2))
        r = a_px * (1 - e * math.cos(E))
        x, y = sx + r * math.cos(th0 + nu), sy - r * math.sin(th0 + nu)
        arc.append((x, y))
        pct = t0 + (t1 - t0) * u
        days = tof * u
        craft.append((pct, f"transform:translate({f(x)}px,{f(y)}px);opacity:1"))
        ae = th0 + math.radians(360 / 365.256 * days)
        am = th0 + math.pi - math.radians(360 / 686.98 * (tof - days))
        earth.append((pct, f"transform:translate({f(sx + rE * math.cos(ae))}px,{f(sy - rE * math.sin(ae))}px)"))
        mars.append((pct, f"transform:translate({f(sx + rM * math.cos(am))}px,{f(sy - rM * math.sin(am))}px)"))
    e0, m0 = earth[0][1], mars[0][1]
    e1, m1 = earth[-1][1], mars[-1][1]
    css.append(kf("ea", [(0, e0)] + earth + [(92, e1), (100, e0)]) + anim(".ea", "ea", T))
    css.append(kf("ma", [(0, m0)] + mars + [(92, m1), (100, m0)]) + anim(".ma", "ma", T))
    c0 = craft[0][1].replace("opacity:1", "opacity:0")
    css.append(kf("cr", [(0, c0), (t0 - 1, c0)] + craft + [(t1 + 3, craft[-1][1].replace("opacity:1", "opacity:0")), (100, c0)]) + anim(".cr", "cr", T))
    css.append(kf("tr", [(0, "stroke-dashoffset:1;opacity:1"), (t0, "stroke-dashoffset:1"), (t1, "stroke-dashoffset:0;opacity:1"),
                         (90, "stroke-dashoffset:0;opacity:1"), (96, "stroke-dashoffset:0;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")])
               + anim(".trn", "tr", T, "linear"))
    arc_d = "M" + "L".join(f"{f(x)} {f(y)}" for x, y in arc)
    body.append(f'<circle cx="{sx}" cy="{sy}" r="{f(rE)}" fill="none" stroke="{ICE}" stroke-opacity=".3"/>'
                f'<circle cx="{sx}" cy="{sy}" r="{f(rM)}" fill="none" stroke="{FLAME}" stroke-opacity=".3"/>'
                f'<circle cx="{sx}" cy="{sy}" r="11" fill="{SOL}" opacity=".2"/><circle cx="{sx}" cy="{sy}" r="5.5" fill="#ffe08a"/>'
                f'<path class="trn" d="{arc_d}" pathLength="1" stroke-dasharray="1 1" fill="none" stroke="{SOL}" stroke-width="1.8"/>'
                f'<g class="ea" style="{e1.replace("transform:", "transform:")}"><circle r="4.2" fill="#4f9dff"/></g>'
                f'<g class="ma" style="{m1}"><circle r="3.4" fill="#ff6a3d"/></g>'
                f'<g class="cr" style="opacity:0"><circle r="2.4" fill="#fff"/></g>')
    # readout
    rx = 384
    ro = (f'<text class="mono" x="{rx}" y="62" text-anchor="end" font-size="10" fill="{FAINT}">EARTH → MARS</text>'
          f'<text class="mono" x="{rx}" y="80" text-anchor="end" font-size="12" fill="{TEXT}">C3 {c3:.1f} km²/s²</text>'
          f'<text class="mono" x="{rx}" y="96" text-anchor="end" font-size="12" fill="{TEXT}">Δv {dv:.2f} km/s</text>'
          f'<text class="mono" x="{rx}" y="112" text-anchor="end" font-size="12" fill="{SOL}">{tof:.0f} days</text>')
    body.append(ro)
    return dict(defs="", css="".join(css), body="".join(body), stars=34)


# ------------------------------------------------------------------------------- Moon
R_MOON_KM = 1737.4
# near-side maria: name, lat, lon (east +), radius km (IAU Gazetteer of Planetary Nomenclature, diameters / 2)
MARIA = [("Procellarum", 18.4, -57.4, 1100), ("Imbrium", 32.8, -15.6, 573), ("Serenitatis", 28.0, 17.5, 354),
         ("Tranquillitatis", 8.5, 31.4, 437), ("Crisium", 17.0, 59.1, 278), ("Fecunditatis", -7.8, 51.3, 455),
         ("Nectaris", -15.2, 35.5, 167), ("Nubium", -21.3, -16.6, 357), ("Humorum", -24.4, -38.6, 195),
         ("Frigoris", 56.0, 1.4, 300), ("Frigoris", 57.0, -25.0, 250), ("Vaporum", 13.3, 3.6, 121), ("Cognitum", -10.0, -23.1, 188),
         ("Insularum", 7.5, -30.9, 256)]
SITES = [("Apollo 11", "1969", 0.674, 23.473), ("Apollo 12", "1969", -3.01, -23.42), ("Apollo 15", "1971", 26.13, 3.63),
         ("Apollo 17", "1972", 20.19, 30.77), ("Luna 9", "1966", 7.08, -64.37), ("Chang'e 3", "2013", 44.12, -19.51),
         ("Chandrayaan-3", "2023", -69.37, 32.32)]


def s_moon():
    cx, cy, R = 292, 100, 58
    T_ph = 16.0                     # phase cycle
    T_pin = 14.0

    def proj(lat, lon):
        la, lo = math.radians(lat), math.radians(lon)
        return cx + R * math.cos(la) * math.sin(lo), cy - R * math.sin(la), math.cos(la) * math.cos(lo)

    def cap(lat, lon, rad_km, n=28):
        """Small circle on the sphere projected orthographically (points on the far side clamped to the limb)."""
        g = rad_km / R_MOON_KM
        la0, lo0 = math.radians(lat), math.radians(lon)
        pts = []
        for i in range(n):
            b = 2 * math.pi * i / n
            la = math.asin(math.sin(la0) * math.cos(g) + math.cos(la0) * math.sin(g) * math.cos(b))
            lo = lo0 + math.atan2(math.sin(b) * math.sin(g) * math.cos(la0), math.cos(g) - math.sin(la0) * math.sin(la))
            x, y, z = proj(math.degrees(la), math.degrees(lo))
            pts.append((x, y))
        return "M" + "L".join(f"{f(x)} {f(y)}" for x, y in pts) + "Z"

    maria = "".join(f'<path d="{cap(la, lo, r)}"/>' for _, la, lo, r in MARIA)
    craters = ""
    for lat, lon, r, ray in ((-43.3, -11.4, 3.2, True), (9.6, -20.1, 2.6, True), (8.1, -38.0, 1.8, False)):   # Tycho, Copernicus, Kepler
        x, y, _ = proj(lat, lon)
        craters += f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" fill="#f4f1ea" opacity=".85"/>'
        if ray:
            craters += "".join(f'<path d="M{f(x)} {f(y)}L{f(x + 16 * math.cos(a))} {f(y + 16 * math.sin(a))}" stroke="#f4f1ea" stroke-opacity=".18"/>'
                               for a in [i * math.pi / 5 + .3 for i in range(10)])
    css = [kf("lib", [(0, "transform:translate(-5px,3px)"), (25, "transform:translate(0,-5px)"), (50, "transform:translate(5px,-2px)"),
                      (75, "transform:translate(1px,5px)"), (100, "transform:translate(-5px,3px)")]) + anim(".lib", "lib", 20, "ease-in-out")]
    pins, labels = [], []
    n = len(SITES)
    seg = 100 / n
    for i, (name, yr, lat, lon) in enumerate(SITES):
        x, y, _ = proj(lat, lon)
        a, b = i * seg, (i + 1) * seg
        css.append(kf(f"pn{i}", [(0, "transform:scale(1);opacity:.55"), (a, "transform:scale(1);opacity:.55"), (a + 2, "transform:scale(1.9);opacity:1"),
                                 (b - 2, "transform:scale(1.4);opacity:1"), (b, "transform:scale(1);opacity:.55"), (100, "transform:scale(1);opacity:.55")])
                   + anim(f".pn{i}", f"pn{i}", T_pin))
        pins.append(f'<g transform="translate({f(x)} {f(y)})"><g class="pn{i}"><circle r="2.6" fill="{SOL}" stroke="#04050a" stroke-width=".8"/></g></g>')
        h = 1.2
        if i == 0:
            st = [(0, "opacity:1"), (b - h, "opacity:1"), (b - h / 2, "opacity:0"), (100 - h / 2, "opacity:0"), (100, "opacity:1")]
        else:
            st = [(0, "opacity:0"), (a - h / 2, "opacity:0"), (a, "opacity:1"), (b - h, "opacity:1"), (b - h / 2, "opacity:0"), (100, "opacity:0")]
        css.append(f".sl{i}{{opacity:{1 if i == 0 else 0}}}" + kf(f"sl{i}", st) + anim(f".sl{i}", f"sl{i}", T_pin))
        lat_s = f"{abs(lat):.1f}°{'N' if lat >= 0 else 'S'}"
        lon_s = f"{abs(lon):.1f}°{'E' if lon >= 0 else 'W'}"
        labels.append(f'<g class="sl{i}"><text class="sans" x="24" y="98" font-size="17" font-weight="700" fill="{SOL}">{name}</text>'
                      f'<text class="mono" x="24" y="116" font-size="11.5" fill="{TEXT2}">landed {yr}</text>'
                      f'<text class="mono" x="24" y="132" font-size="11.5" fill="{MUTED}">{lat_s} {lon_s}</text></g>')
    # phase shadow: limb half + terminator (cubic Béziers), SMIL-morphed; s = cos(phase angle)
    kq = .5523

    def shadow(L, s):
        top, bot = (cx, cy - R), (cx, cy + R)
        limb = (f"M{cx} {cy - R}C{f(cx + L * R * kq)} {cy - R} {f(cx + L * R)} {f(cy - R * kq)} {f(cx + L * R)} {cy}"
                f"C{f(cx + L * R)} {f(cy + R * kq)} {f(cx + L * R * kq)} {cy + R} {cx} {cy + R}")
        term = (f"C{f(cx + s * R * kq)} {cy + R} {f(cx + s * R)} {f(cy + R * kq)} {f(cx + s * R)} {cy}"
                f"C{f(cx + s * R)} {f(cy - R * kq)} {f(cx + s * R * kq)} {cy - R} {cx} {cy - R}Z")
        return limb + term
    vals, kts = [], []
    m = 10
    for j in range(m + 1):                      # waxing: dark limb on the left (west), terminator sweeps right to left
        ph = math.pi * j / m
        vals.append(shadow(-1, math.cos(ph)))
        kts.append(.5 * j / m)
    for j in range(m + 1):                      # waning: dark limb on the right
        ph = math.pi * j / m
        vals.append(shadow(1, math.cos(ph)))
        kts.append(.5 + .5 * j / m if j else .5001)
    still = shadow(-1, math.cos(math.pi * .62))
    phase = (f'<g class="smil"><path d="{still}" fill="#04050a" opacity=".82"><animate attributeName="d" values="{";".join(vals)}" '
             f'keyTimes="{";".join(f(k, 4) for k in kts)}" dur="{f(T_ph)}s" repeatCount="indefinite"/></path></g>'
             f'<g class="still"><path d="{still}" fill="#04050a" opacity=".82"/></g>')
    defs = ('<radialGradient id="mn" cx=".42" cy=".4" r=".65"><stop offset="0" stop-color="#e9e6de"/><stop offset=".7" stop-color="#bdb9b0"/>'
            '<stop offset="1" stop-color="#8f8b83"/></radialGradient>'
            f'<clipPath id="mc"><circle cx="{cx}" cy="{cy}" r="{R}"/></clipPath>')
    body = (f'<circle cx="{cx}" cy="{cy}" r="{R + 10}" fill="#dfe8ff" opacity=".05"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="url(#mn)"/>'
            f'<g clip-path="url(#mc)"><g class="lib"><g fill="#6f6c68" opacity=".75">{maria}</g>{craters}{"".join(pins)}</g>{phase}</g>'
            f'<circle cx="{cx}" cy="{cy}" r="{R}" fill="none" stroke="#fff" stroke-opacity=".15"/>'
            f'<text class="mono" x="24" y="66" font-size="10" letter-spacing="1.2" fill="{FAINT}">LANDING SITES</text>'
            + "".join(labels))
    return dict(defs=defs, css="".join(css) + SMIL_CSS, body=body, stars=40)


# -------------------------------------------------------------------- Deep Space Network
# Complexes (longitude east +): Goldstone, California -116.89; Madrid (Robledo) -4.25; Canberra (Tidbinbilla) +148.98
STATIONS = [("Goldstone", -116.89, SOL), ("Madrid", -4.25, FLAME), ("Canberra", 148.98, AURORA)]
C_KMS = 299_792.458


def s_dsn():
    T_rot = 18.0
    ex, ey, er = 94, 106, 42
    scx, scy = 352, 72
    th_sc = math.degrees(math.atan2(-(scy - ey), scx - ex))
    css, body = [], []
    # the Earth seen from above the North Pole (it turns anticlockwise); graticule + Arctic ice
    grat = "".join(f'<circle cx="{ex}" cy="{ey}" r="{f(er * k)}"/>' for k in (.33, .66))
    grat += "".join(f'<path d="M{ex} {ey}L{f(ex + er * math.cos(math.radians(a)))} {f(ey - er * math.sin(math.radians(a)))}"/>' for a in range(0, 360, 30))
    # longitude 0 drawn at angle 0 (pointing right) at t = 0; rotation angle(t) = 360 t / T_rot (anticlockwise)
    dishes = []
    for name, lon, col in STATIONS:
        a = math.radians(lon)
        x, y = ex + er * math.cos(a), ey - er * math.sin(a)
        rot = -lon      # SVG rotation (clockwise positive) to point outward
        dishes.append(f'<g transform="translate({f(x)} {f(y)}) rotate({f(rot)})">'
                      f'<path d="M0 0L7 0" stroke="#cfd5e8" stroke-width="1.6"/><path d="M6 -7Q13 0 6 7" fill="none" stroke="{col}" stroke-width="2.2"/>'
                      f'<circle cx="11" r="1.2" fill="{col}"/></g>')
    css.append(kf("er", [(0, "transform:rotate(0)"), (100, "transform:rotate(-360deg)")]) + anim(".er", "er", T_rot))
    earth = (f'<circle cx="{ex}" cy="{ey}" r="{er}" fill="#1d4f9a"/>'
             f'<g transform="translate({ex} {ey})"><g class="er"><g transform="translate({-ex} {-ey})">'
             f'<g fill="none" stroke="#9fd4ff" stroke-opacity=".22">{grat}</g>'
             f'<circle cx="{ex}" cy="{ey}" r="{f(er * .26)}" fill="#eaf4ff" opacity=".85"/>{"".join(dishes)}</g></g></g>'
             f'<circle cx="{ex}" cy="{ey}" r="{er}" fill="none" stroke="#9fd4ff" stroke-opacity=".4"/>')
    # which complex faces the spacecraft: nearest in angle (build-time sampling of the rotation)
    N = 360
    act = []
    for i in range(N):
        rot = 360 * i / N
        best = min(range(3), key=lambda k: abs(((STATIONS[k][1] + rot - th_sc) + 180) % 360 - 180))
        act.append(best)
    labels = []
    for k, (name, lon, col) in enumerate(STATIONS):
        runs, i = [], 0
        while i < N:
            if act[i] == k:
                j = i
                while j < N and act[j] == k:
                    j += 1
                runs.append((100 * i / N, 100 * j / N))
                i = j
            else:
                i += 1
        st = [(0, "opacity:1" if act[0] == k else "opacity:0")]
        for a, b in runs:
            if a > 0:
                st += [(a - .6, "opacity:0"), (a, "opacity:1")]
            if b < 100:
                st += [(b - .6, "opacity:1"), (b, "opacity:0")]
        st.append((100, "opacity:1" if act[0] == k else "opacity:0"))
        st = sorted(dict(st).items())
        css.append(f".st{k}{{opacity:{1 if act[0] == k else 0}}}" + kf(f"st{k}", st) + anim(f".st{k}", f"st{k}", T_rot))
        labels.append(f'<g class="st{k}"><circle cx="154" cy="60" r="3.5" fill="{col}"/>'
                      f'<text class="sans" x="163" y="64" font-size="13" font-weight="700" fill="{TEXT}">{name}</text>'
                      f'<text class="mono" x="163" y="79" font-size="10.5" fill="{MUTED}">70 m dish in view</text></g>')
    # round trip: pulse out, reply back; counter steps in sync (sped up)
    T_rt = 6.0
    d_km = 25.0e9                                  # Voyager 1, about 25 billion km (2025)
    rtlt_h = 2 * d_km / C_KMS / 3600
    x0, y0 = ex + er + 4, ey - 6
    css.append(kf("po", [(0, f"transform:translate({x0}px,{y0}px);opacity:0"), (4, f"transform:translate({x0}px,{y0}px);opacity:1"),
                         (48, f"transform:translate({scx - 10}px,{scy + 2}px);opacity:1"), (50, f"transform:translate({scx - 10}px,{scy + 2}px);opacity:0"),
                         (100, f"transform:translate({scx - 10}px,{scy + 2}px);opacity:0")]) + anim(".po", "po", T_rt))
    css.append(kf("pb", [(0, f"transform:translate({scx - 10}px,{scy + 6}px);opacity:0"), (50, f"transform:translate({scx - 10}px,{scy + 6}px);opacity:0"),
                         (52, f"transform:translate({scx - 10}px,{scy + 6}px);opacity:1"), (96, f"transform:translate({x0}px,{y0 + 8}px);opacity:1"),
                         (100, f"transform:translate({x0}px,{y0 + 8}px);opacity:0")]) + anim(".pb", "pb", T_rt))
    K = 10
    step = 18
    vals = [f"{rtlt_h * k / K:.1f} h" for k in range(K + 1)]
    col_txt = "".join(f'<text x="0" y="{k * step}" class="mono" font-size="14" font-weight="700" fill="{TEXT}">{v}</text>' for k, v in enumerate(vals))
    css.append(kf("rt", [(0, "transform:translateY(0)"), (4, f"transform:translateY(0);animation-timing-function:steps({K},end)"),
                         (96, f"transform:translateY({-K * step}px)"), (100, f"transform:translateY({-K * step}px)")]) + anim(".rt", "rt", T_rt))
    counter = (f'<text class="mono" x="163" y="112" font-size="10" fill="{FAINT}">ROUND-TRIP LIGHT TIME</text>'
               f'<clipPath id="rc"><rect x="160" y="116" width="120" height="20"/></clipPath>'
               f'<g clip-path="url(#rc)"><g transform="translate(163 131)"><g class="rt" style="transform:translateY({-K * step}px)">{col_txt}</g></g></g>')
    craft = (f'<g transform="translate({scx} {scy})"><path d="M-2 -12V12" stroke="#8f98bd" stroke-width="3"/>'
             '<path d="M-6 -10Q-14 0 -6 10Q-9 0 -6 -10Z" fill="#f4f6ff"/><rect x="0" y="-3" width="7" height="6" fill="#d9a441"/>'
             f'<path d="M7 0H18M3 3L10 14" stroke="#cfd5e8"/></g>'
             f'<text class="mono" x="{scx + 8}" y="{scy + 30}" font-size="10.5" fill="{TEXT2}" text-anchor="middle">Voyager 1</text>')
    body = (f'<path d="M{x0} {y0}L{scx - 10} {scy + 2}" stroke="{ICE}" stroke-opacity=".18" stroke-dasharray="2 4"/>'
            + earth + "".join(labels) + counter + craft
            + f'<g class="po" style="opacity:0"><circle r="5" fill="{ICE}" opacity=".3"/><circle r="2.2" fill="#fff"/></g>'
            + f'<g class="pb" style="opacity:0"><circle r="5" fill="{AURORA}" opacity=".3"/><circle r="2.2" fill="#eafff6"/></g>')
    return dict(defs="", css="".join(css), body=body, stars=44)


# ---------------------------------------------------------------------------- Space Academy
def s_academy():
    T = 10
    nodes = [(40, 128), (84, 96), (70, 60), (128, 72), (150, 120), (196, 88), (182, 50), (238, 62), (250, 112)]
    edges = [(0, 1), (1, 2), (1, 3), (3, 4), (3, 5), (5, 6), (5, 7), (7, 8)]
    css, lines, stars = [], [], []
    order = [0, 1, 2, 3, 4, 5, 6, 7, 8]
    t_of = {n: 6 + i * 7 for i, n in enumerate(order)}
    for i, (x, y) in enumerate(nodes):
        a = t_of[i]
        css.append(kf(f"n{i}", [(0, "transform:scale(.6);opacity:.35"), (a, "transform:scale(.6);opacity:.35"), (a + 2, "transform:scale(1.6);opacity:1"),
                                (a + 5, "transform:scale(1);opacity:1"), (90, "transform:scale(1);opacity:1"), (97, "transform:scale(.6);opacity:.35"),
                                (100, "transform:scale(.6);opacity:.35")]) + anim(f".n{i}", f"n{i}", T, "ease-out"))
        big = i in (0, 3, 5, 8)
        stars.append(f'<g transform="translate({x} {y})"><g class="n{i}"><circle r="{8 if big else 6}" fill="{NEBULA}" opacity=".3"/>'
                     f'<circle r="{3 if big else 2.2}" fill="#fff"/></g></g>')
    for k, (a_, b_) in enumerate(edges):
        s = t_of[b_] - 5
        (x1, y1), (x2, y2) = nodes[a_], nodes[b_]
        css.append(kf(f"g{k}", [(0, "stroke-dashoffset:1;opacity:1"), (s, "stroke-dashoffset:1"), (s + 5, "stroke-dashoffset:0"), (90, "stroke-dashoffset:0;opacity:1"),
                                (97, "stroke-dashoffset:0;opacity:0"), (100, "stroke-dashoffset:1;opacity:0")]) + anim(f".g{k}", f"g{k}", T))
        lines.append(f'<path d="M{x1} {y1}L{x2} {y2}" stroke="#96aaff" stroke-opacity=".18"/>'
                     f'<path class="g{k}" d="M{x1} {y1}L{x2} {y2}" pathLength="1" stroke-dasharray="1 1" stroke="{ICE}" stroke-width="1.6"/>')
    # badge
    bx, by = 330, 92
    hexp = "M" + "L".join(f"{f(30 * math.cos(math.radians(60 * i - 90)))} {f(30 * math.sin(math.radians(60 * i - 90)))}" for i in range(6)) + "Z"
    star = "M" + "L".join(f"{f((12 if i % 2 == 0 else 5) * math.cos(math.radians(36 * i - 90)))} {f((12 if i % 2 == 0 else 5) * math.sin(math.radians(36 * i - 90)))}" for i in range(10)) + "Z"
    bt = t_of[8] + 5
    css.append(kf("bd", [(0, "transform:scale(0) rotate(-30deg)"), (bt, "transform:scale(0) rotate(-30deg)"), (bt + 5, "transform:scale(1.15) rotate(6deg)"),
                         (bt + 8, "transform:scale(1) rotate(0)"), (92, "transform:scale(1) rotate(0)"), (98, "transform:scale(0) rotate(0)"),
                         (100, "transform:scale(0) rotate(-30deg)")]) + anim(".bd", "bd", T, "ease-out"))
    css.append(win("bl", bt + 6, 92, 3) + anim(".bl", "bl", T))
    css.append(kf("sh", [(0, "transform:translateX(-40px)"), (70, "transform:translateX(-40px)"), (85, "transform:translateX(40px)"), (100, "transform:translateX(40px)")])
               + anim(".sh", "sh", T))
    badge = (f'<clipPath id="hx"><path d="{hexp}"/></clipPath>'
             f'<g transform="translate({bx} {by})"><g class="bd">'
             f'<path d="M-14 22L-20 46L-8 40L0 50L4 26ZM14 22L20 46L8 40L0 50L-4 26Z" fill="{PLASMA}" opacity=".85"/>'
             f'<path d="{hexp}" fill="url(#bdg)" stroke="#ffe08a" stroke-width="2"/>'
             f'<path d="{star}" fill="#fff6d8"/>'
             f'<g clip-path="url(#hx)"><rect class="sh" x="-8" y="-40" width="10" height="80" fill="#fff" opacity=".35" transform="skewX(-20)"/></g></g></g>'
             f'<g class="bl" style="opacity:1"><text class="mono" x="{bx}" y="{by - 40}" font-size="10.5" text-anchor="middle" fill="{SOL}">BADGE EARNED</text></g>')
    progress = ""
    defs = ('<linearGradient id="bdg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b18cff"/><stop offset="1" stop-color="#3b2a8f"/></linearGradient>')
    return dict(defs=defs, css="".join(css), body=progress + "".join(lines) + "".join(stars) + badge, stars=40)
