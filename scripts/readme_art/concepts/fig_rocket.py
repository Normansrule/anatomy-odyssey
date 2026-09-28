"""1. rocket-equation.svg — Tsiolkovsky's equation with Saturn V S-IC numbers."""
import math
from _lib import *

W, H = 800, 360
G0 = 9.80665
ISP = 304.0                      # F-1 vacuum specific impulse, s (launch-physics.js [WF1])
VE = ISP * G0 / 1000             # 2.981 km/s
M0 = 2941.221                    # t, AS-506 ignition mass (launch-physics.js MASS.ignition [FER])
PROP = 2147.547                  # t, S-IC propellant = ignition − upper stack − S-IC dry (launch-physics.js)
MF = M0 - PROP                   # 793.7 t
R_SV = M0 / MF                   # 3.706
DV_SV = VE * math.log(R_SV)      # 3.904 km/s
DUR = 13.0

# chart frame
X0, X1, RMIN, RMAX = 352, 772, 1.0, 9.0
Y0, Y1, VMAX = 300, 96, 7.0


def cx(R):
    return X0 + (R - RMIN) / (RMAX - RMIN) * (X1 - X0)


def cy(dv):
    return Y0 - dv / VMAX * (Y0 - Y1)


def curve(r0, r1, n=90):
    pts = []
    for i in range(n + 1):
        R = r0 + (r1 - r0) * (i / n) ** 1.6
        pts.append((cx(R), cy(VE * math.log(R))))
    return pts


def plen(pts):
    return sum(math.dist(pts[i], pts[i + 1]) for i in range(len(pts) - 1))


def build():
    css, body = [], []
    body.append(card(W, H, seed=11, nstars=55))
    body.append(header(28, 36, "TSIOLKOVSKY, 1903 · THE TYRANNY OF THE ROCKET EQUATION",
                       "Every extra km/s costs more fuel than the last"))

    # timeline (loop fractions)
    B0, B1 = 0.06, 0.50           # burn window
    S = [0.56, 0.64, 0.72]        # doubling steps appear
    FO0, FO1 = 0.93, 0.975        # fade out

    # ---------- the rocket / mass bar ----------
    bx, bw = 118, 56
    top, bot = 92, 300
    hpx = (bot - top) / M0
    h_prop, h_mf = PROP * hpx, MF * hpx
    y_mf0 = top                    # upper stages block on top
    y_prop0 = top + h_mf
    body.append(f'<path d="M{bx} {top - 2}Q{bx + bw / 2} {top - 40} {bx + bw} {top - 2}Z" fill="#dfe6ff" opacity=".92"/>')
    body.append(f'<rect x="{bx}" y="{top}" width="{bw}" height="{f(bot - top)}" rx="3" fill="#0a0f1f" stroke="#3a4570"/>')
    # propellant: static state = burned (empty); animation drains it
    body.append(f'<rect class="prop" x="{bx + 3}" y="{f(y_prop0 + 1)}" width="{bw - 6}" height="{f(h_prop - 4)}" rx="2" fill="url(#pg)"/>')
    body.append(f'<rect class="ghost" x="{bx + 3}" y="{f(y_prop0 + 1)}" width="{bw - 6}" height="{f(h_prop - 4)}" rx="2" fill="none" stroke="{FLAME}" stroke-dasharray="3 3" opacity=".55"/>')
    body.append(f'<rect x="{bx + 3}" y="{f(y_mf0 + 3)}" width="{bw - 6}" height="{f(h_mf - 5)}" rx="2" fill="{ICE}" opacity=".85"/>')
    body.append(text(bx + bw / 2, y_mf0 + h_mf / 2 + 4, "m_f", 12, "#04121f", "m", "middle", 700))
    # engine + flame
    body.append(f'<path d="M{bx + 12} {bot}L{bx + 6} {bot + 12}H{bx + bw - 6}L{bx + bw - 12} {bot}Z" fill="#9aa4c8"/>')
    body.append(f'<g class="flame"><path d="M{bx + 8} {bot + 12}Q{bx + bw / 2} {bot + 58} {bx + bw - 8} {bot + 12}Z" fill="url(#fg)"/></g>')
    css.append(".prop{transform-box:fill-box;transform-origin:50% 100%;transform:scaleY(0)}")
    css.append(kf("prop", [(0, "transform:scaleY(1)"), (B0, "transform:scaleY(1)"), (B1, "transform:scaleY(0)"),
                           (FO1, "transform:scaleY(0)"), (0.985, "transform:scaleY(1)"), (1, "transform:scaleY(1)")]))
    css.append(anim(".prop", "prop", DUR))
    css.append(".flame{transform-box:fill-box;transform-origin:50% 0;opacity:0}")
    fl = [(0, "opacity:0;transform:scaleY(.2)"), (B0, "opacity:0;transform:scaleY(.2)"), (B0 + .01, "opacity:1;transform:scaleY(1)")]
    k = 0
    t = B0 + 0.02
    while t < B1 - 0.01:
        fl.append((t, f"opacity:1;transform:scaleY({0.82 if k % 2 else 1.08})"))
        k += 1
        t += 0.012
    fl += [(B1, "opacity:1;transform:scaleY(.9)"), (B1 + 0.012, "opacity:0;transform:scaleY(.3)"), (1, "opacity:0;transform:scaleY(.2)")]
    css.append(kf("flame", fl))
    css.append(anim(".flame", "flame", DUR))

    # labels next to the bar
    lx = bx + bw + 12
    body.append(f'<path d="M{lx} {top}h6M{lx + 3} {top}V{bot}M{lx} {bot}h6" stroke="{TEXT2}" fill="none" opacity=".6"/>')
    body.append(text(lx + 12, top + 10, "m₀ = 2,941 t", 12.5, TEXT, "m", weight=600))
    body.append(text(lx + 12, top + 26, "full stack at", 11, MUTED))
    body.append(text(lx + 12, top + 40, "ignition", 11, MUTED))
    body.append(text(lx + 12, y_prop0 + 70, "2,148 t", 12.5, FLAME, "m", weight=600))
    body.append(text(lx + 12, y_prop0 + 85, "S-IC propellant", 11, MUTED))
    body.append(text(lx + 12, y_prop0 + 99, "(kerosene + LOX)", 11, MUTED))
    body.append(text(lx + 12, bot - 22, "m_f = 794 t", 12.5, ICE, "m", weight=600))
    body.append(text(lx + 12, bot - 8, "left at cutoff", 11, MUTED))
    body.append(text(28, 344, "Saturn V (Apollo 11) first stage · ideal, no gravity or drag", 11, MUTED))

    # ---------- chart ----------
    g = []
    for R in range(1, 10):
        g.append(f'<line x1="{f(cx(R))}" y1="{Y1}" x2="{f(cx(R))}" y2="{Y0}" stroke="{GRID}"/>')
        g.append(text(cx(R), Y0 + 16, f"{R}", 11, MUTED, "m", "middle"))
    for v in range(0, 8):
        g.append(f'<line x1="{X0}" y1="{f(cy(v))}" x2="{X1}" y2="{f(cy(v))}" stroke="{GRID}"/>')
        g.append(text(X0 - 8, cy(v) + 4, f"{v}", 11, MUTED, "m", "end"))
    body.append("".join(g))
    body.append(f'<path d="M{X0} {Y1 - 6}V{Y0}H{X1 + 6}" stroke="#46507a" fill="none"/>')
    body.append(text(X1, Y0 + 32, "mass ratio  m₀ / m_f  →", 11.5, TEXT2, "s", "end"))
    body.append(text(X0 - 30, Y1 - 12, "Δv (km/s)", 11.5, TEXT2, "s"))

    ghost = curve(1, RMAX)
    body.append('<path d="M' + "L".join(f"{f(x, 1)} {f(y, 1)}" for x, y in ghost) + f'" fill="none" stroke="{NEBULA}" stroke-width="2" stroke-dasharray="5 5" opacity=".45"/>')

    # bright part (1 → R_SV) that draws itself in step with the draining tank
    live = curve(1, R_SV, 120)
    L = plen(live)
    body.append('<path class="live" d="M' + "L".join(f"{f(x, 1)} {f(y, 1)}" for x, y in live)
                + f'" fill="none" stroke="{FLAME}" stroke-width="3.2" stroke-linecap="round" stroke-dasharray="{f(L, 1)} {f(L + 10, 1)}"/>')
    # sample burn → arc length and dot position
    cum = [0.0]
    for i in range(len(live) - 1):
        cum.append(cum[-1] + math.dist(live[i], live[i + 1]))

    def arc_at(R):
        x = cx(R)
        for i in range(len(live) - 1):
            if live[i + 1][0] >= x:
                u = (x - live[i][0]) / max(1e-9, live[i + 1][0] - live[i][0])
                return cum[i] + u * (cum[i + 1] - cum[i])
        return L
    dash, dot = [(0, f"stroke-dashoffset:{f(L, 1)}"), (B0, f"stroke-dashoffset:{f(L, 1)}")], [(0, tr(cx(1), cy(0))), (B0, tr(cx(1), cy(0)))]
    n = 36
    for i in range(1, n + 1):
        u = i / n
        m = M0 - u * PROP
        R = M0 / m
        t = B0 + u * (B1 - B0)
        dash.append((t, f"stroke-dashoffset:{f(L - arc_at(R), 1)}"))
        dot.append((t, f"transform:{tr(cx(R), cy(VE * math.log(R)))}"))
    dot[0] = (0, f"transform:{tr(cx(1), cy(0))}")
    dot[1] = (B0, f"transform:{tr(cx(1), cy(0))}")
    dash += [(0.985, "stroke-dashoffset:0"), (0.99, f"stroke-dashoffset:{f(L, 1)}"), (1, f"stroke-dashoffset:{f(L, 1)}")]
    dot += [(0.985, f"transform:{tr(cx(R_SV), cy(DV_SV))}"), (0.99, f"transform:{tr(cx(1), cy(0))}"), (1, f"transform:{tr(cx(1), cy(0))}")]
    css.append(".live{stroke-dashoffset:0}")
    css.append(kf("live", dash))
    css.append(anim(".live", "live", DUR))
    body.append(f'<g class="dot" transform="translate({f(cx(R_SV), 2)} {f(cy(DV_SV), 2)})"><circle r="9" fill="{FLAME}" opacity=".25"/><circle r="4.5" fill="#fff"/></g>')
    css.append(".dot{transform:" + tr(cx(R_SV), cy(DV_SV)) + "}")
    css.append(kf("dot", dot))
    css.append(anim(".dot", "dot", DUR))

    # Saturn V callout
    sx, sy = cx(R_SV), cy(DV_SV)
    call = (f'<g class="call"><line x1="{f(sx)}" y1="{f(sy + 8)}" x2="{f(sx)}" y2="{Y0}" stroke="{FLAME}" stroke-dasharray="2 3" opacity=".7"/>'
            + text(sx - 14, sy - 30, "Saturn V S-IC", 12, FLAME, "s", "end", 700)
            + text(sx - 14, sy - 16, f"m₀/m_f = {R_SV:.2f}", 12, FLAME, "m", "end", 600)
            + text(sx - 14, sy - 2, f"Δv = {DV_SV:.2f} km/s", 12, FLAME, "m", "end", 600) + '</g>')
    body.append(call)
    css.append(kf("call", fade_stops(B1 - 0.01, B1 + 0.03, FO0, FO1)))
    css.append(anim(".call", "call", DUR))

    # equation block (top right, level with the title)
    body.append(text(X1, 42, "Δv = vₑ · ln(m₀ / m_f)", 20, TEXT, "s", "end", 700))
    body.append(text(X1, 62, "vₑ = Iₛₚ·g₀ = 304 s × 9.81 m/s² = 2.98 km/s", 12, TEXT2, "s", "end"))

    # doubling steps: ×2 mass ratio → the same +2.07 km/s
    step = VE * math.log(2)
    cols = [AURORA, SOL, PLASMA]
    labels = ["+794 t", "+1,587 t", "+3,175 t"]
    for i, (Ra, Rb) in enumerate([(1, 2), (2, 4), (4, 8)]):
        xa, xb = cx(Ra), cx(Rb)
        ya, yb = cy(VE * math.log(Ra)), cy(VE * math.log(Rb))
        c = cols[i]
        cls = f"st{i}"
        g = (f'<g class="{cls}">'
             f'<path d="M{f(xa)} {f(ya)}H{f(xb)}V{f(yb)}" fill="none" stroke="{c}" stroke-width="2"/>'
             f'<circle cx="{f(xb)}" cy="{f(yb)}" r="3.5" fill="{c}"/>'
             + text(xb + 6, (ya + yb) / 2 + 4, "+2.07", 11.5, c, "m", weight=700)
             + text((xa + xb) / 2 + (8 if i == 0 else 0), ya + (-7 if i == 0 else 15), labels[i], 11, c, "m", "middle")
             + "</g>")
        body.append(g)
        css.append(kf(cls, fade_stops(S[i], S[i] + 0.03, FO0, FO1)))
        css.append(anim("." + cls, cls, DUR))
    msg = ('<g class="msg">' + text(X1 - 4, 238, "Double the mass ratio: +2.07 km/s.", 12, TEXT, anchor="end", weight=600)
           + text(X1 - 4, 255, "Double it again: the same +2.07 km/s,", 11.5, TEXT2, anchor="end")
           + text(X1 - 4, 270, "but twice the extra propellant.", 11.5, TEXT2, anchor="end")
           + text(X1 - 4, 288, "Each kg of fuel must also lift the fuel above it.", 11, MUTED, anchor="end") + "</g>")
    body.append(msg)
    css.append(kf("msg", fade_stops(S[2] + 0.03, S[2] + 0.07, FO0, FO1)))
    css.append(anim(".msg", "msg", DUR))
    body.append(text(W - 28, 344, "Propellant added on top of m_f = 794 t", 11, MUTED, anchor="end"))

    defs = ('<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb070"/>'
            f'<stop offset="1" stop-color="{FLAME}"/></linearGradient>'
            '<linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff4c2"/>'
            f'<stop offset=".35" stop-color="{SOL}"/><stop offset="1" stop-color="{FLAME}" stop-opacity="0"/></linearGradient></defs>')
    body.insert(1, defs)

    desc = (
        "Animated diagram of the Tsiolkovsky rocket equation, Δv = vₑ·ln(m₀/m_f). A tank drains from m₀ = 2,941 t "
        "to m_f = 794 t while the Δv curve draws itself up to Δv = 3.91 km/s; then three steps show that each "
        "doubling of the mass ratio adds the same 2.07 km/s but needs twice as much extra propellant. "
        "Numbers: m₀ = 2,941,221 kg is Apollo 11's ignition mass (AS-506 Flight Evaluation Report, "
        "site/assets/js/launch-physics.js MASS.ignition). S-IC propellant 2,147,547 kg = ignition mass − upper stack "
        "(662,674 kg) − S-IC dry (131,000 kg), as in launch-physics.js; m_f = 793,674 kg; m₀/m_f = 3.706. "
        "vₑ = Iₛₚ·g₀ = 304 s × 9.80665 m/s² = 2.981 km/s (F-1 vacuum Iₛₚ, Wikipedia 'Rocketdyne F-1'). "
        "Ideal Δv = 2.981 × ln 3.706 = 3.905 km/s (no gravity, drag or back-pressure losses; at the 263 s sea-level "
        "Iₛₚ it would be 3.38 km/s). vₑ·ln 2 = 2.066 km/s. Extra propellant per doubling with m_f fixed: "
        "794, 1,587 and 3,175 t. Source: docs/EQUATIONS.md §2.1."
    )
    svg(W, H, "The rocket equation: why every extra km/s costs more fuel", desc, "".join(body), "".join(css),
        name="rocket-equation.svg")


if __name__ == "__main__":
    build()
