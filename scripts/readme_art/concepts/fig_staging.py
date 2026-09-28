"""8. staging.svg — Saturn V / Apollo 11 staging: the stack comes apart while altitude and speed climb."""
import math
from _lib import *

W, H = 800, 360
# Apollo 11 range times (AS-506 Flight Evaluation Report, Table 2-2; site/assets/js/launch-physics.js SEQ)
OECO, SICSEP, SIIIGN, LES, SIIOECO, SIISEP, SIVBIGN, SIVBCUT = 161.63, 162.3, 163.0, 197.9, 548.22, 549.1, 552.2, 699.33
# Altitude (km) and inertial speed (km/s) every 10 s from the site's ascent model
# (node: AscentSim in site/assets/js/launch-physics.js, dt = 0.02 s).
MODEL = [[0,0,0.388],[10,0.1,0.388],[20,0.4,0.391],[30,1.1,0.4],[40,2.1,0.42],[50,3.5,0.459],[60,5.6,0.523],[70,8.2,0.613],[80,11.5,0.728],[90,15.5,0.871],[100,20.2,1.041],[110,25.6,1.241],[120,31.8,1.473],[130,38.6,1.739],[140,46.2,2.012],[150,54.3,2.281],[160,63,2.589],[170,71.8,2.667],[180,80,2.714],[190,87.7,2.764],[200,94.9,2.819],[210,101.6,2.87],[220,108,2.924],[230,114.1,2.985],[240,119.9,3.05],[250,125.3,3.118],[260,130.2,3.191],[270,134.9,3.266],[280,139.1,3.344],[290,143,3.426],[300,146.7,3.51],[310,150,3.597],[320,153,3.687],[330,155.8,3.78],[340,158.4,3.877],[350,160.7,3.977],[360,162.8,4.081],[370,164.8,4.189],[380,166.6,4.301],[390,168.3,4.418],[400,169.8,4.54],[410,171.1,4.666],[420,172.4,4.798],[430,173.6,4.936],[440,174.6,5.08],[450,175.6,5.23],[460,176.5,5.387],[470,177.3,5.519],[480,178,5.654],[490,178.7,5.794],[500,179.3,5.94],[510,179.9,6.092],[520,180.4,6.251],[530,180.9,6.418],[540,181.3,6.592],[550,181.7,6.745],[560,182,6.783],[570,182.2,6.841],[580,182.3,6.9],[590,182.4,6.96],[600,182.5,7.021],[610,182.5,7.083],[620,182.6,7.146],[630,182.6,7.211],[640,182.7,7.277],[650,182.7,7.345],[660,182.8,7.414],[670,182.8,7.484],[680,182.8,7.556],[690,182.9,7.629],[700,182.9,7.703],[710,183,7.779]]

K = 60.0                     # mission seconds per animation second
PRE, POST = 0.6, 2.8
TEND = 712.0
DUR = PRE + TEND / K + POST
X0, X1, TMAX = 268, 764, 720.0
Y0, Y1 = 298, 168            # chart bottom/top
HMAX, VMAX = 200.0, 8.0


def fr(t):
    return (PRE + t / K) / DUR


def px(t):
    return X0 + t / TMAX * (X1 - X0)


def interp(t, col):
    for a, b in zip(MODEL, MODEL[1:]):
        if a[0] <= t <= b[0]:
            u = (t - a[0]) / (b[0] - a[0])
            return a[col] + u * (b[col] - a[col])
    return MODEL[-1][col]


def mmss(t):
    m, s = divmod(t, 60)
    return f"T+{int(m)}:{s:04.1f}"


def build():
    css, body = [], []
    body.append(card(W, H, seed=88, nstars=0))
    body.append(header(28, 36, "APOLLO 11 · 16 JULY 1969 · SATURN V AS-506", "Three stages, eleven minutes, one orbit"))

    # ---------- rocket column ----------
    RX, RB = 120, 322          # centre x, bottom of S-IC
    s = 2.0                    # px per metre (stack ≈ 111 m)
    body.append(f'<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b3f7a"/>'
                f'<stop offset="1" stop-color="#5a9ad8"/></linearGradient>'
                f'<linearGradient id="fl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff7d6"/><stop offset=".3" stop-color="{SOL}"/>'
                f'<stop offset="1" stop-color="{FLAME}" stop-opacity="0"/></linearGradient>'
                f'<linearGradient id="flv" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8f3ff"/><stop offset=".35" stop-color="{ICE}" stop-opacity=".8"/>'
                f'<stop offset="1" stop-color="{ICE}" stop-opacity="0"/></linearGradient>'
                f'<clipPath id="col"><rect x="40" y="72" width="176" height="268" rx="10"/></clipPath></defs>')
    body.append('<g clip-path="url(#col)">')
    body.append(f'<rect class="sky" x="40" y="72" width="176" height="268" fill="url(#sky)" opacity="0"/>')
    css.append(kf("sky", [(0, "opacity:.75"), (fr(20), "opacity:.75"), (fr(120), "opacity:.12"), (fr(170), "opacity:0"), (1, "opacity:0")]) + anim(".sky", "sky", DUR))
    # streaming stars (ascent cue)
    import random
    rng = random.Random(8)
    st = "".join(f'<circle cx="{f(40 + rng.random() * 176)}" cy="{f(72 + rng.random() * 268)}" r="{f(.5 + rng.random() * .7, 2)}" opacity="{f(.3 + .5 * rng.random(), 2)}"/>' for _ in range(34))
    body.append(f'<g class="strm" fill="#dfe8ff">{st}<g transform="translate(0 -268)">{st}</g></g>')
    css.append(kf("strm", [(0, "transform:translateY(0px)"), (1, "transform:translateY(268px)")]) + anim(".strm", "strm", 2.4))
    body.append("</g>")
    body.append(f'<rect x="40" y="72" width="176" height="268" rx="10" fill="none" stroke="#2a3358"/>')

    def band(y0, h, w, fill, extra=""):
        return f'<rect x="{f(RX - w / 2, 2)}" y="{f(y0, 2)}" width="{f(w, 2)}" height="{f(h, 2)}" fill="{fill}"{extra}/>'
    D1, D3, DC = 10.1 * s, 6.6 * s, 3.9 * s
    y = RB
    # S-IC (42 m)
    h1 = 42 * s
    sic = [band(y - h1, h1, D1, "#eef1fb"), band(y - h1 + 2, 6, D1, "#141826"), band(y - 16, 7, D1, "#141826"),
           f'<path d="M{f(RX - D1 / 2)} {y - 8}l-5 8h5zM{f(RX + D1 / 2)} {y - 8}l5 8h-5z" fill="#c9cfe6"/>',
           band(y - h1 * .55, h1 * .22, D1 / 2, "#141826", f' transform="translate({f(D1 / 4, 2)} 0)"')]
    fl1 = f'<g class="f1"><path d="M{f(RX - D1 / 2 + 1)} {y}Q{RX} {y + 70} {f(RX + D1 / 2 - 1)} {y}Z" fill="url(#fl)"/></g>'
    y -= h1
    # S-II (24.9 m, with interstage)
    h2 = 24.9 * s
    s2 = [band(y - h2, h2, D1, "#eef1fb"), band(y - 5, 5, D1, "#b8bfd8"), band(y - h2 + 3, 3, D1, "#141826")]
    fl2 = f'<g class="f2"><path d="M{f(RX - D1 / 2 + 2)} {y}Q{RX} {y + 46} {f(RX + D1 / 2 - 2)} {y}Z" fill="url(#flv)"/></g>'
    y -= h2
    # S-IVB (17.8 m) + IU + SLA (9.4 m) + CSM (≈ 10.7 m) ; LES (10.2 m)
    h3 = 17.8 * s
    ytop3 = y - h3
    s4 = [f'<path d="M{f(RX - D1 / 2)} {y}L{f(RX - D3 / 2)} {f(y - 5)}V{f(ytop3)}H{f(RX + D3 / 2)}V{f(y - 5)}L{f(RX + D1 / 2)} {y}Z" fill="#eef1fb"/>',
          band(y - 12, 3, D3, "#141826"), band(ytop3 - 1.4, 1.4, D3, "#8e97b9")]
    fl4 = f'<g class="f4"><path d="M{f(RX - 3)} {f(y - 1)}Q{RX} {y + 30} {f(RX + 3)} {f(y - 1)}Z" fill="url(#flv)"/></g>'
    y = ytop3 - 1.4
    hs = 8.5 * s
    s4.append(f'<path d="M{f(RX - D3 / 2)} {f(y)}L{f(RX - DC / 2)} {f(y - hs)}H{f(RX + DC / 2)}L{f(RX + D3 / 2)} {f(y)}Z" fill="#dfe4f4"/>')
    y -= hs
    hsm = 7.5 * s
    s4.append(band(y - hsm, hsm, DC, "#eef1fb"))
    y -= hsm
    hcm = 3.2 * s
    s4.append(f'<path d="M{f(RX - DC / 2)} {f(y)}L{RX} {f(y - hcm - 2)}L{f(RX + DC / 2)} {f(y)}Z" fill="#c9cfe6"/>')
    ycm = y - hcm
    les = (f'<g class="les"><path d="M{RX} {f(ycm - 2)}v{f(-8.5 * s, 1)}" stroke="#dfe4f4" stroke-width="2.2"/>'
           f'<path d="M{f(RX - 1.8)} {f(ycm - 2 - 7 * s)}h3.6l-1.8 -{f(3 * s, 1)}z" fill="#ff6a5a"/></g>')
    lx = RX + D1 / 2 + 7
    body.append('<g clip-path="url(#col)">')
    body.append(f'<g class="sic">{fl1}{"".join(sic)}{text(lx, RB - h1 / 2, "S-IC", 11, FLAME, "m", weight=700)}</g>')
    body.append(f'<g class="s2">{fl2}{"".join(s2)}{text(lx, RB - h1 - h2 / 2 + 4, "S-II", 11, ICE, "m", weight=700)}</g>')
    body.append(f'<g class="s4">{fl4}{"".join(s4)}{text(lx - 3, ytop3 + h3 / 2 + 4, "S-IVB", 11, AURORA, "m", weight=700)}'
                f'{text(lx - 9, ycm + 12, "CSM", 10, TEXT2, "m")}</g>')
    body.append(les)
    body.append('</g>')

    def drop(cls, t, dy, rot=0):
        a = f"transform:translateY(0px) rotate(0deg);opacity:1"
        b = f"transform:translateY({dy}px) rotate({rot}deg);opacity:0"
        css.append(f".{cls}{{transform-box:fill-box;transform-origin:50% 50%}}")
        css.append(kf(cls, [(0, a), (fr(t), a), (fr(t) + 0.07, b), (1 - 0.03, b), (1 - 0.01, a), (1, a)]) + anim("." + cls, cls, DUR))
    drop("sic", SICSEP, 150, -12)
    drop("s2", SIISEP, 120, 10)
    drop("les", LES, -110, 25)
    # static (reduced-motion) frame = in orbit: S-IVB + spacecraft only
    css.append(".sic,.s2,.les{opacity:0}")

    def burn(cls, t0, t1):
        css.append(f".{cls}{{transform-box:fill-box;transform-origin:50% 0;opacity:0}}")
        st = [(0, "opacity:0"), (fr(t0) - 0.001, "opacity:0"), (fr(t0) + 0.004, "opacity:1")]
        tt, k = t0 + 4, 0
        while tt < t1 - 4:
            st.append((fr(tt), f"opacity:1;transform:scaleY({1.08 if k % 2 else .9})"))
            tt += 9
            k += 1
        st += [(fr(t1), "opacity:1"), (fr(t1) + 0.006, "opacity:0"), (1, "opacity:0")]
        css.append(kf(cls, st) + anim("." + cls, cls, DUR))
    burn("f1", -1, OECO)
    burn("f2", SIIIGN, SIIOECO)
    burn("f4", SIVBIGN, SIVBCUT)

    # ---------- chart: model altitude and inertial speed ----------
    g = []
    for m in range(0, 13):
        x = px(m * 60)
        g.append(f'<line x1="{f(x)}" y1="{Y1}" x2="{f(x)}" y2="{Y0}" stroke="{GRID}"/>')
        if m % 2 == 0:
            g.append(text(x, Y0 + 15, f"{m}", 11, MUTED, "m", "middle"))
    for hh in (0, 100, 200):
        y = Y0 - hh / HMAX * (Y0 - Y1)
        g.append(f'<line x1="{X0}" y1="{f(y)}" x2="{X1}" y2="{f(y)}" stroke="{GRID}"/>')
        g.append(text(X0 - 6, y + 4, f"{hh}", 10.5, ICE, "m", "end"))
    for vv in (4, 8):
        y = Y0 - vv / VMAX * (Y0 - Y1)
        g.append(text(X1 + 6, y + 4, f"{vv}", 10.5, FLAME, "m"))
    body.append("".join(g))
    body.append(f'<path d="M{X0} {Y1 - 4}V{Y0}H{X1 + 4}" stroke="#46507a" fill="none"/>')
    body.append(text(X0 - 6, Y1 - 5, "altitude km", 10.5, ICE, anchor="middle"))
    body.append(text(X1 + 8, Y1 - 5, "km/s", 10.5, FLAME, anchor="middle"))
    body.append(text(X1, Y0 + 30, "minutes after liftoff →", 11, TEXT2, anchor="end"))

    for col, colr, sc, cls in ((1, ICE, HMAX, "ch"), (2, FLAME, VMAX, "cv")):
        pts = [(px(r[0]), Y0 - r[col] / sc * (Y0 - Y1)) for r in MODEL]
        cum = [0.0]
        for a, b in zip(pts, pts[1:]):
            cum.append(cum[-1] + math.dist(a, b))
        L = cum[-1]
        body.append(f'<path class="{cls}" d="M' + "L".join(f"{f(x, 1)} {f(y, 1)}" for x, y in pts)
                    + f'" fill="none" stroke="{colr}" stroke-width="2.4" stroke-linejoin="round" stroke-dasharray="{f(L, 1)} {f(L + 10, 1)}"/>')
        st = [(0, f"stroke-dashoffset:{f(L, 1)}")] + [(fr(MODEL[i][0]), f"stroke-dashoffset:{f(L - cum[i], 1)}") for i in range(len(MODEL))]
        st += [(1 - 0.035, "stroke-dashoffset:0"), (1 - 0.01, f"stroke-dashoffset:{f(L, 1)}"), (1, f"stroke-dashoffset:{f(L, 1)}")]
        css.append(f".{cls}{{stroke-dashoffset:0}}" + kf(cls, st) + anim("." + cls, cls, DUR))

    # event markers
    ev = [(SICSEP, "S-IC off", FLAME), (LES, "tower off", MUTED), (SIISEP, "S-II off", ICE), (SIVBCUT, "orbit", AURORA)]
    for t, lab, c in ev:
        x = px(t)
        body.append(f'<line x1="{f(x)}" y1="{Y1 - 2}" x2="{f(x)}" y2="{Y0}" stroke="{c}" stroke-opacity=".55" stroke-dasharray="2 3"/>')
    body.append(text(px(SICSEP) - 3, Y1 - 5, "S-IC off", 10.5, FLAME, anchor="end"))
    body.append(text(px(LES) + 3, Y1 - 5, "tower off", 10.5, MUTED))
    body.append(text(px(SIISEP) - 3, Y1 - 5, "S-II off", 10.5, ICE, anchor="end"))
    body.append(text(px(SIVBCUT) - 3, Y1 - 5, "orbit", 10.5, AURORA, anchor="end"))

    # playhead
    body.append(f'<line class="ph" x1="0" y1="{Y1 - 4}" x2="0" y2="{Y0 + 4}" stroke="#fff" stroke-opacity=".7"/>')
    css.append(".ph{opacity:0}" + kf("ph", [(0, f"transform:translateX({X0}px);opacity:1"), (fr(0), f"transform:translateX({X0}px);opacity:1"),
                                             (fr(TEND), f"transform:translateX({f(px(TEND))}px);opacity:1"), (1 - 0.03, f"transform:translateX({f(px(TEND))}px);opacity:1"),
                                             (1 - 0.01, f"transform:translateX({f(px(TEND))}px);opacity:0"), (1, f"transform:translateX({X0}px);opacity:0")]) + anim(".ph", "ph", DUR))

    # ---------- event cards ----------
    cards = [
        (0, "Liftoff", "T+0 s", "5 F-1 engines · 2,941 t", FLAME),
        (OECO, "S-IC cutoff & staging", "T+2 min 42 s", f"{interp(OECO, 1):.0f} km · {interp(OECO, 2):.2f} km/s", FLAME),
        (LES, "S-II burning · escape tower off", "T+3 min 18 s", f"{interp(LES, 1):.0f} km · {interp(LES, 2):.2f} km/s", ICE),
        (SIIOECO, "S-II cutoff · S-IVB lights", "T+9 min 08 s", f"{interp(SIIOECO, 1):.0f} km · {interp(SIIOECO, 2):.2f} km/s", ICE),
        (SIVBCUT, "S-IVB cutoff: in orbit", "T+11 min 39 s", "186 × 183 km · 7.79 km/s", AURORA),
    ]
    CXr, CYr = 268, 94
    for i, (t, title, tt, stats, c) in enumerate(cards):
        t_end = cards[i + 1][0] if i + 1 < len(cards) else None
        cls = f"cd{i}"
        body.append(f'<g class="{cls}">' + text(CXr, CYr, tt, 13, c, "m", weight=700)
                    + text(CXr + 120, CYr, title, 15, TEXT, weight=700)
                    + text(CXr + 120, CYr + 20, stats, 13, TEXT2, "m") + "</g>")
        if t_end is None:
            st = [(0, "opacity:0"), (fr(t), "opacity:0"), (fr(t) + 0.004, "opacity:1"), (1 - 0.03, "opacity:1"), (1 - 0.012, "opacity:0"), (1, "opacity:0")]
        elif i == 0:
            st = [(0, "opacity:1"), (fr(t_end), "opacity:1"), (fr(t_end) + 0.004, "opacity:0"), (1 - 0.012, "opacity:0"), (1, "opacity:1")]
            css.append(f".{cls}{{opacity:0}}")
        else:
            st = [(0, "opacity:0"), (fr(t), "opacity:0"), (fr(t) + 0.004, "opacity:1"), (fr(t_end), "opacity:1"), (fr(t_end) + 0.004, "opacity:0"), (1, "opacity:0")]
            css.append(f".{cls}{{opacity:0}}")
        css.append(kf(cls, st) + anim("." + cls, cls, DUR))
    body.append(text(28, 348, "Times: AS-506 flight evaluation report · altitude & inertial speed: the site's ascent model", 10.5, MUTED))
    body.append(text(772, 348, "1 s = 1 min", 10.5, MUTED, anchor="end"))

    desc = (
        "Animated Saturn V (Apollo 11, AS-506) staging sequence: the stack sheds the S-IC first stage, the launch escape "
        "tower and the S-II second stage while a playhead draws altitude and inertial speed against mission time "
        "(1 s of animation = 1 min). Event times are Apollo 11 range times from the Saturn V Launch Vehicle Flight "
        "Evaluation Report AS-506 (Table 2-2), as used in site/assets/js/launch-physics.js: S-IC outboard engine cutoff "
        "T+161.63 s (2 min 42 s), S-IC/S-II separation 162.3 s, S-II ignition 163.0 s, launch escape tower jettison "
        "197.9 s, S-II cutoff 548.22 s (9 min 08 s), S-II/S-IVB separation 549.1 s, S-IVB ignition 552.2 s, S-IVB cutoff "
        "699.33 s (11 min 39 s). Altitude and inertial speed curves are the Cosmic Library ascent model (AscentSim, "
        f"sampled every 10 s): {interp(OECO, 1):.1f} km / {interp(OECO, 2):.2f} km/s at S-IC cutoff, {interp(LES, 1):.1f} km / "
        f"{interp(LES, 2):.2f} km/s at tower jettison, {interp(SIIOECO, 1):.1f} km / {interp(SIIOECO, 2):.2f} km/s at S-II cutoff; "
        "the model reaches orbit at T+712 s vs 699 s flown. Parking orbit 185.9 × 183.2 km (Apollo 11 mission report); "
        "7.79 km/s = √(μ/r) at 184.5 km altitude (Apollo 11 insertion: 25,567 ft/s = 7.79 km/s). Lift-off mass 2,941 t."
    )
    svg(W, H, "Saturn V staging, Apollo 11", desc, "".join(body), "".join(css), name="staging.svg")


if __name__ == "__main__":
    build()
