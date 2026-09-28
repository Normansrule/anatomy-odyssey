"""6. hoverslam.svg — booster landing burn: altitude vs time, burn starts at h = v²/(2·a_net)."""
import math
from _lib import *

W, H = 800, 360
G = 9.80665
M = 26700.0            # kg: 22,200 kg dry + 4,500 kg propellant ("final approach", site/data/booster.json)
F_SL = 845e3           # N, one Merlin 1D at sea level (booster.json)
F_MIN = 482e3          # N, minimum throttle, one engine (booster.json)
TAU = 0.8              # planned landing-burn throttle (booster-physics.js AP_TAU)
V0 = 200.0             # m/s, terminal velocity near sea level (scripts/test_booster.mjs: ≈200 m/s)
H0 = 3000.0            # m, start of the final approach (booster.json scenario "final")
A_NET = TAU * F_SL / M - G
H_B = V0 ** 2 / (2 * A_NET)
T_COAST = (H0 - H_B) / V0
T_BURN = V0 / A_NET
T_TOT = T_COAST + T_BURN
TW_MIN = F_MIN / (M * G)
SPEED = 2.0            # animation runs at 2× real time
PRE, POST = 0.6, 2.6
DUR = PRE + T_TOT / SPEED + POST

X0, X1, TMAX = 312, 770, 24.0
Y0, Y1, HMAX = 296, 112, 3000.0
BX = 262               # booster column


def px(t):
    return X0 + t / TMAX * (X1 - X0)


def py(h):
    return Y0 - h / HMAX * (Y0 - Y1)


def h_of(t, h_ign=H_B):
    """Altitude for a burn lit at h_ign (same fall speed, same a_net)."""
    tc = (H0 - h_ign) / V0
    if t <= tc:
        return H0 - V0 * t
    tb = t - tc
    return h_ign - V0 * tb + 0.5 * A_NET * tb * tb


def build():
    css, body = [], []
    body.append(card(W, H, seed=66, nstars=60))
    body.append(header(28, 36, "BOOSTER LANDING · THE HOVERSLAM", "It can't hover, so it has to time the burn"))
    body.append(text(772, 42, "h_burn = v² / (2·a_net)", 20, TEXT, "s", "end", 700))
    body.append(text(772, 62, f"a_net = T/m − g = {TAU * F_SL / 1e3:.0f} kN / {M / 1e3:.1f} t − 9.81 = {A_NET:.1f} m/s²", 12, TEXT2, "s", "end"))

    fr = lambda s: (PRE + s / SPEED) / DUR          # real flight second → loop fraction

    # ---------- plot ----------
    g = []
    for t in range(0, 25, 4):
        g.append(f'<line x1="{f(px(t))}" y1="{Y1}" x2="{f(px(t))}" y2="{Y0}" stroke="{GRID}"/>')
        g.append(text(px(t), Y0 + 15, f"{t}", 11, MUTED, "m", "middle"))
    for hh in range(0, 3001, 500):
        g.append(f'<line x1="{X0}" y1="{f(py(hh))}" x2="{X1}" y2="{f(py(hh))}" stroke="{GRID}"/>')
        g.append(text(X0 - 6, py(hh) + 4, f"{hh:,}", 10.5, MUTED, "m", "end"))
    body.append("".join(g))
    body.append(f'<path d="M{X0} {Y1 - 6}V{Y0}H{X1 + 6}" stroke="#46507a" fill="none"/>')
    body.append(text(X1, Y0 + 30, "time since 3 km (s) →", 11.5, TEXT2, anchor="end"))
    body.append(text(X0 - 40, Y1 - 12, "altitude (m)", 11.5, TEXT2))

    # ghosts: lit too early / too late
    def path_for(h_ign, t_end, n=120, climb=False):
        pts = []
        tc = (H0 - h_ign) / V0
        t_stop = tc + V0 / A_NET
        for i in range(n + 1):
            t = t_end * i / n
            if climb and t > t_stop:
                h = h_of(t_stop, h_ign) + 0.5 * (F_MIN / M - G) * (t - t_stop) ** 2
            else:
                h = h_of(min(t, t_stop), h_ign)
            if h < 0:
                pts.append((px(t), py(0)))
                break
            pts.append((px(t), py(h)))
        return pts
    early = path_for(2000, 23.5, climb=True)
    late = path_for(1000, 20)
    body.append('<path d="M' + "L".join(f"{f(x, 1)} {f(y, 1)}" for x, y in early) + f'" fill="none" stroke="{ICE}" stroke-width="1.5" stroke-dasharray="4 4" opacity=".6"/>')
    body.append('<path d="M' + "L".join(f"{f(x, 1)} {f(y, 1)}" for x, y in late) + f'" fill="none" stroke="{PLASMA}" stroke-width="1.5" stroke-dasharray="4 4" opacity=".7"/>')
    h_stop = 2000 - H_B
    t_stop_e = (H0 - 2000) / V0 + T_BURN
    ex, ey = px(t_stop_e), py(h_stop)

    v_imp = math.sqrt(V0 ** 2 - 2 * A_NET * 1000)
    lx, ly = late[-1]
    body.append(f'<path d="M{f(lx - 5)} {f(ly - 5)}l10 10M{f(lx + 5)} {f(ly - 5)}l-10 10" stroke="{PLASMA}" stroke-width="2"/>')
    lgx, lgy = 500, 108
    for j, (c, dashs, lab) in enumerate(((AURORA, "", f"lit at {H_B:,.0f} m: 0 m/s at 0 m"),
                                         (ICE, "4 4", f"lit at 2,000 m: stops {h_stop:,.0f} m up, then climbs"),
                                         (PLASMA, "4 4", f"lit at 1,000 m: hits the deck at {v_imp:.0f} m/s"))):
        yy = lgy + j * 17
        da = f' stroke-dasharray="{dashs}"' if dashs else ""
        body.append(f'<line x1="{lgx}" y1="{yy - 4}" x2="{lgx + 22}" y2="{yy - 4}" stroke="{c}" stroke-width="{2 if j else 3}"{da}/>')
        body.append(text(lgx + 30, yy, lab, 11.5, c if j else TEXT))

    # the right one, drawn live
    n = 160
    pts = [(px(T_TOT * i / n), py(max(0, h_of(T_TOT * i / n)))) for i in range(n + 1)]
    cum = [0.0]
    for i in range(n):
        cum.append(cum[-1] + math.dist(pts[i], pts[i + 1]))
    L = cum[-1]
    body.append('<path class="live" d="M' + "L".join(f"{f(x, 1)} {f(y, 1)}" for x, y in pts)
                + f'" fill="none" stroke="{AURORA}" stroke-width="3" stroke-linecap="round" stroke-dasharray="{f(L, 1)} {f(L + 10, 1)}"/>')
    dash = [(0, f"stroke-dashoffset:{f(L, 1)}")]
    dot = [(0, f"transform:{tr(pts[0][0], pts[0][1])}")]
    boost = [(0, f"transform:translateY({f(pts[0][1] - Y0, 2)}px)")]
    for i in range(0, n + 1, 4):
        t = fr(T_TOT * i / n)
        dash.append((t, f"stroke-dashoffset:{f(L - cum[i], 1)}"))
        dot.append((t, f"transform:{tr(*pts[i])}"))
        boost.append((t, f"transform:translateY({f(pts[i][1] - Y0, 2)}px)"))
    end = fr(T_TOT)
    for lst, v in ((dash, "stroke-dashoffset:0"), (dot, f"transform:{tr(*pts[-1])}"), (boost, "transform:translateY(0px)")):
        lst += [(1 - 0.02, v), (1, lst[0][1])]
    fade = [(0, 0), (fr(0) * 0.7, 1), (1 - 0.06, 1), (1 - 0.025, 0), (1, 0)]
    css.append(".live{stroke-dashoffset:0}" + kf("live", with_fade(dash, fade)) + anim(".live", "live", DUR))
    body.append(f'<g class="pdot"><circle r="8" fill="{AURORA}" opacity=".25"/><circle r="4" fill="#fff"/></g>')
    css.append(".pdot{transform:" + tr(*pts[-1]) + "}" + kf("pdot", with_fade(dot, fade)) + anim(".pdot", "pdot", DUR))

    # ignition marker
    ix, iy = px(T_COAST), py(H_B)
    body.append(f'<g class="ign"><line x1="{X0}" y1="{f(iy)}" x2="{f(ix)}" y2="{f(iy)}" stroke="{SOL}" stroke-dasharray="3 3"/>'
                f'<circle cx="{f(ix)}" cy="{f(iy)}" r="5" fill="none" stroke="{SOL}" stroke-width="2"/>'
                + text(ix + 10, iy - 8, f"ignite at {H_B:,.0f} m", 12.5, SOL, "m", weight=700)
                + text(ix + 10, iy + 8, f"= {V0:.0f}² / (2 × {A_NET:.1f})", 11, SOL, "m") + "</g>")
    css.append(kf("ign", [(0, "opacity:0"), (fr(T_COAST) - 0.01, "opacity:0"), (fr(T_COAST), "opacity:1"), (0.94, "opacity:1"), (0.975, "opacity:0"), (1, "opacity:0")]) + anim(".ign", "ign", DUR))
    body.append(f'<g class="td">' + text(px(T_TOT), Y0 - 14, f"touchdown {T_TOT:.1f} s", 11.5, AURORA, "m", "middle", 700) + "</g>")
    css.append(kf("td", [(0, "opacity:0"), (end - 0.005, "opacity:0"), (end + 0.01, "opacity:1"), (0.94, "opacity:1"), (0.975, "opacity:0"), (1, "opacity:0")]) + anim(".td", "td", DUR))

    # ---------- booster column (same altitude scale as the plot) ----------
    body.append(f'<rect x="{BX - 34}" y="{Y0 + 2}" width="68" height="6" rx="2" fill="#39436e"/>')
    body.append(f'<path d="M{BX - 40} {Y0 + 9}h80" stroke="{ICE}" stroke-opacity=".35" stroke-width="2"/>')
    body.append(text(BX, Y0 + 24, "drone ship", 10, MUTED, anchor="middle"))
    bh = 36
    flame = (f'<g class="bfl"><path d="M{BX - 4} {Y0 - 1}Q{BX} {Y0 + 34} {BX + 4} {Y0 - 1}Z" fill="url(#bfg)"/></g>')
    booster = (f'<g class="bst">{flame}<line x1="{BX + 10}" y1="{Y0}" x2="{X0 - 44}" y2="{Y0}" stroke="{AURORA}" stroke-opacity=".45" stroke-dasharray="2 4"/>'
               f'<rect x="{BX - 4.5}" y="{Y0 - bh}" width="9" height="{bh}" rx="1.5" fill="#e6ebff"/>'
               f'<rect x="{BX - 4.5}" y="{Y0 - bh + 8}" width="9" height="3" fill="#2a3358"/>'
               f'<path d="M{BX - 4.5} {Y0 - bh + 3}h-4M{BX + 4.5} {Y0 - bh + 3}h4" stroke="#c8cfe8" stroke-width="2.4"/>'
               f'<path d="M{BX - 4} {Y0 - 6}l-8 7M{BX + 4} {Y0 - 6}l8 7" stroke="#c8cfe8" stroke-width="1.6"/></g>')
    body.append(booster)
    css.append(".bst{transform:translateY(0px)}" + kf("bst", with_fade(boost, fade)) + anim(".bst", "bst", DUR))
    body.append(f'<defs><linearGradient id="bfg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6d0"/>'
                f'<stop offset=".4" stop-color="{SOL}"/><stop offset="1" stop-color="{FLAME}" stop-opacity="0"/></linearGradient></defs>')
    fl = [(0, "opacity:0"), (fr(T_COAST) - 0.002, "opacity:0"), (fr(T_COAST), "opacity:1"), (end, "opacity:1"), (end + 0.004, "opacity:0"), (1, "opacity:0")]
    css.append(".bfl{opacity:0}" + kf("bfl", fl) + anim(".bfl", "bfl", DUR))

    # ---------- left column: why it can't hover ----------
    X = 28
    body.append(text(X, 102, "Why not just hover?", 13.5, TEXT, weight=700))
    rows = [
        ("One engine at its", TEXT2), ("lowest throttle:", TEXT2),
        (f"T = {F_MIN / 1e3:.0f} kN", FLAME), (f"weight = {M * G / 1e3:.0f} kN", ICE),
        (f"T/W = {TW_MIN:.2f} > 1", SOL),
    ]
    y = 124
    for s, c in rows:
        big = c != TEXT2
        body.append(text(X, y, s, 13 if big else 12, c, "m" if big else "s", weight=700 if big else None))
        y += 19 if big else 16
    body.append(text(X, y + 6, "Even idling, it pushes up", 12, TEXT2))
    body.append(text(X, y + 22, "harder than gravity pulls,", 12, TEXT2))
    body.append(text(X, y + 38, "so speed and height must", 12, TEXT2))
    body.append(text(X, y + 54, "reach zero together.", 12, TEXT2))
    body.append(text(28, 344, f"Falcon 9-class stage, {M / 1e3:.1f} t, falling at {V0:.0f} m/s; one engine at {TAU * 100:.0f} % · 2× speed", 11, MUTED))

    desc = (
        "Animated altitude-versus-time plot of a reusable booster's landing burn (hoverslam), next to a booster icon "
        "that descends on the same altitude scale. Numbers from site/data/booster.json and booster-physics.js: "
        f"mass {M:,.0f} kg (22,200 kg dry + 4,500 kg propellant, the 'final approach' scenario), one Merlin 1D at "
        f"{TAU:.0%} of 845 kN sea-level thrust = {TAU * F_SL / 1e3:.0f} kN, falling at terminal velocity ≈ {V0:.0f} m/s "
        "(scripts/test_booster.mjs: ≈200 m/s at sea level) from 3,000 m. "
        f"a_net = T/m − g = {A_NET:.2f} m/s²; burn height h = v²/(2·a_net) = {H_B:,.0f} m; burn time v/a_net = {T_BURN:.1f} s; "
        f"coast {T_COAST:.1f} s; touchdown at {T_TOT:.1f} s. Minimum throttle 482 kN vs weight {M * G / 1e3:.0f} kN gives "
        f"T/W = {TW_MIN:.2f} > 1, so it cannot hover. Ghosts: lit at 2,000 m it stops {2000 - H_B:,.0f} m up and then "
        f"climbs even at minimum throttle; lit at 1,000 m it hits the deck at {v_imp:.0f} m/s. Idealised: constant mass "
        "and no drag during the burn (both would help: the stage gets lighter and air still brakes it)."
    )
    svg(W, H, "Booster landing: the hoverslam", desc, "".join(body), "".join(css), name="hoverslam.svg")
    print(f"    a_net {A_NET:.3f}, h_b {H_B:.1f}, t_b {T_BURN:.2f}, coast {T_COAST:.2f}, T/W min {TW_MIN:.3f}, v_imp {v_imp:.1f}, loop {DUR:.1f}")


if __name__ == "__main__":
    build()
