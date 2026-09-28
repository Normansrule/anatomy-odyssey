"""7. black-hole-anatomy.svg — Schwarzschild black hole to scale in units of r_s."""
import math
from _lib import *

W, H = 800, 360
CX, CY = 262, 196
RS = 36.0                      # px per Schwarzschild radius
T_PH = 3.0                     # s per lap at the photon sphere (animation)
T_ISCO = T_PH * (3.0 / 1.5) ** 1.5   # Ω = √(GM/r³) in coordinate time → 2.83× longer at 3 r_s
B_BENT, B_CAPT = 3.0, 2.35     # impact parameters (units of r_s)
B_CRIT = 1.5 * math.sqrt(3)    # 2.598 r_s


def ray(b, x0=-60.0, ds=0.002, rmax=16.0):
    """Null geodesic in the equatorial plane (units r_s = 1). The orbit equation u'' + u = (3/2)u²
    is exactly the path of a Newtonian test body with acceleration −(3/2)·b²·r̂/r⁴ and unit speed."""
    x, y, vx, vy = x0, b, 1.0, 0.0
    k = 1.5 * b * b

    def acc(x, y):
        r = math.hypot(x, y)
        return -k * x / r ** 5, -k * y / r ** 5
    pts = []
    for i in range(400000):
        ax, ay = acc(x, y)
        k1 = (vx, vy, ax, ay)
        a2 = acc(x + k1[0] * ds / 2, y + k1[1] * ds / 2); k2 = (vx + k1[2] * ds / 2, vy + k1[3] * ds / 2, *a2)
        a3 = acc(x + k2[0] * ds / 2, y + k2[1] * ds / 2); k3 = (vx + k2[2] * ds / 2, vy + k2[3] * ds / 2, *a3)
        a4 = acc(x + k3[0] * ds, y + k3[1] * ds); k4 = (vx + k3[2] * ds, vy + k3[3] * ds, *a4)
        x += ds * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]) / 6
        y += ds * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]) / 6
        vx += ds * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]) / 6
        vy += ds * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]) / 6
        r = math.hypot(x, y)
        if r < 1.0:
            pts.append((x, y))
            return pts, None
        if r > rmax and x * vx + y * vy > 0 and x > -rmax:
            break
        if i % 20 == 0 and x > -7.4:
            pts.append((x, y))
    return pts, math.degrees(math.atan2(-vy, vx))


def to_px(p):
    return CX + p[0] * RS, CY - p[1] * RS


def resample(pts, step):
    out = [pts[0]]
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        acc += math.dist(a, b)
        if acc >= step:
            out.append(b)
            acc = 0.0
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    return out


def build():
    css, body = [], []
    body.append(card(W, H, seed=77, nstars=120, avoid=lambda x, y: math.hypot(x - CX, y - CY) < RS * 1.2))
    body.append(header(28, 36, "SCHWARZSCHILD BLACK HOLE · TO SCALE", "Anatomy of a black hole"))
    body.append(f'<defs><radialGradient id="glow"><stop offset=".55" stop-color="{FLAME}" stop-opacity="0"/>'
                f'<stop offset=".8" stop-color="{FLAME}" stop-opacity=".16"/><stop offset="1" stop-color="{FLAME}" stop-opacity="0"/></radialGradient>'
                f'<radialGradient id="blob"><stop offset="0" stop-color="#fff4d6"/><stop offset=".45" stop-color="{SOL}"/>'
                f'<stop offset="1" stop-color="{FLAME}" stop-opacity="0"/></radialGradient>'
                f'<clipPath id="bhclip"><rect x="1" y="1" width="{W - 2}" height="{H - 2}" rx="15"/></clipPath></defs>')

    # ISCO ring glow + ring
    body.append(f'<circle cx="{CX}" cy="{CY}" r="{3 * RS * 1.25}" fill="url(#glow)"/>')
    body.append(f'<circle cx="{CX}" cy="{CY}" r="{3 * RS}" fill="none" stroke="{FLAME}" stroke-width="1.4" stroke-opacity=".75"/>')
    body.append(f'<circle cx="{CX}" cy="{CY}" r="{1.5 * RS}" fill="none" stroke="{SOL}" stroke-width="1.3" stroke-dasharray="3 3"/>')
    body.append(f'<circle cx="{CX}" cy="{CY}" r="{RS}" fill="#000" stroke="#4a3a7a" stroke-width="1.2"/>')
    body.append(f'<circle cx="{CX}" cy="{CY}" r="{B_CRIT * RS}" fill="none" stroke="{PLASMA}" stroke-opacity=".35" stroke-dasharray="1 5"/>')

    # light rays
    bent, defl = ray(B_BENT)
    capt, _ = ray(B_CAPT)
    rays = []
    for pts, col, cls, dur in ((bent, ICE, "rb", 4.2), (capt, PLASMA, "rc", 3.6)):
        pp = [to_px(p) for p in pts]
        pp = [p for p in pp if -40 < p[0] < W + 40 and -40 < p[1] < H + 40]
        pp = resample(pp, 3.0)
        body.append('<path d="M' + "L".join(f"{f(x, 1)} {f(y, 1)}" for x, y in pp) + f'" fill="none" stroke="{col}" stroke-width="1.6" stroke-opacity=".7" clip-path="url(#bhclip)"/>')
        samp = resample(pp, 9.0)
        st = [(i / (len(samp) - 1) * 0.86, f"transform:{tr(*samp[i])}") for i in range(len(samp))]
        st.append((1, st[-1][1]))
        fade = [(0, 0), (0.04, 1), (0.8, 1), (0.86, 0), (1, 0)]
        body.append(f'<g class="{cls}" clip-path="url(#bhclip)"><g class="{cls}m"><circle r="7" fill="{col}" opacity=".3"/><circle r="3" fill="#fff"/></g></g>')
        css.append(f".{cls}m{{transform:{tr(*samp[len(samp) // 2])}}}" + kf(cls + "m", with_fade(st, fade)) + anim(f".{cls}m", cls + "m", dur))
    # a straight reference line: where the bent ray would go without gravity
    y_ref = CY - B_BENT * RS
    body.append(f'<line x1="{CX - 30}" y1="{f(y_ref)}" x2="{CX + 200}" y2="{f(y_ref)}" stroke="{ICE}" stroke-opacity=".3" stroke-dasharray="2 5"/>')

    # photons on the photon sphere
    for k in range(3):
        cls = "ph"
        body.append(f'<g transform="rotate({k * 120} {CX} {CY})"><g class="ph"><circle cx="{CX + 1.5 * RS}" cy="{CY}" r="2.6" fill="#fff"/>'
                    f'<circle cx="{CX + 1.5 * RS}" cy="{CY}" r="6" fill="{SOL}" opacity=".35"/></g></g>')
    css.append(f".ph{{transform-origin:{CX}px {CY}px;animation:spin {T_PH}s linear infinite}}")
    # hot blob at the ISCO
    body.append(f'<g class="isco"><circle cx="{CX + 3 * RS}" cy="{CY}" r="12" fill="url(#blob)"/></g>')
    css.append(f".isco{{transform-origin:{CX}px {CY}px;animation:spin {f(T_ISCO, 3)}s linear infinite}}")
    css.append("@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(-360deg)}}")

    # scale bar
    sx, sy = 30, 330
    body.append(f'<path d="M{sx} {sy - 4}v8M{sx + RS} {sy - 4}v8M{sx} {sy}h{RS}" stroke="{TEXT2}" fill="none"/>')
    body.append(text(sx + RS + 6, sy + 4, "1 r_s (everything to scale)", 11, TEXT2))

    # key
    X = 486
    rows = [
        ("#000", "#6a58a8", "", "Event horizon · 1 r_s", "r_s = 2GM/c². Inside, every path leads in."),
        ("none", SOL, "3 3", "Photon sphere · 1.5 r_s", "Light can orbit here, 2.8× faster than the ISCO."),
        ("none", FLAME, "", "ISCO · 3 r_s", "Innermost stable circular orbit: gas inside it plunges."),
        ("none", ICE, "", f"Light passing at b = {B_BENT:g} r_s", f"bent by {defl:.0f}° (weak-field 2r_s/b would give {math.degrees(2 / B_BENT):.0f}°)"),
        ("none", PLASMA, "1 3", f"b < {B_CRIT:.2f} r_s: captured", "any ray aimed inside this line falls in"),
    ]
    y = 92
    for fill, stroke, dash, big, small in rows:
        da = f' stroke-dasharray="{dash}"' if dash else ""
        body.append(f'<circle cx="{X + 8}" cy="{y - 5}" r="7" fill="{fill}" stroke="{stroke}" stroke-width="1.8"{da}/>')
        body.append(text(X + 24, y, big, 13, TEXT, weight=700))
        body.append(text(X + 24, y + 16, small, 11.5, TEXT2))
        y += 45
    body.append(text(X, 318, "Sun-mass black hole: r_s = 2.95 km", 11.5, MUTED))
    body.append(text(X, 334, "Sagittarius A* (4.3 million Suns): 12.7 million km", 11.5, MUTED))

    desc = (
        "Animated, to-scale diagram of a non-rotating (Schwarzschild) black hole in units of the Schwarzschild radius "
        "r_s = 2GM/c²: event horizon at 1 r_s, photon sphere at 1.5 r_s with photons circling it, innermost stable "
        "circular orbit (ISCO) at 3 r_s with a hot blob orbiting it. Circular-orbit angular speed in coordinate time is "
        "Ω = √(GM/r³) (exact for Schwarzschild), so photons lap (3/1.5)^1.5 = 2.83× faster than the blob. "
        f"Two light rays are integrated numerically from the photon orbit equation u'' + u = (3/2) r_s u²: impact parameter "
        f"b = {B_BENT:g} r_s is deflected by {defl:.0f}° (the weak-field formula 4GM/(c²b) = 2r_s/b would give "
        f"{math.degrees(2 / B_BENT):.0f}°), and b = {B_CAPT:g} r_s, below the critical b = (3√3/2) r_s = {B_CRIT:.3f} r_s, "
        "is captured. r_s of one solar mass = 2.953 km; Sagittarius A* (4.297 × 10⁶ M☉, GRAVITY Collaboration 2022, "
        "as in site/assets/js/black-hole.js) → 1.269 × 10¹⁰ m = 12.7 million km ≈ 0.085 AU. Source: docs/EQUATIONS.md §5.4."
    )
    svg(W, H, "Anatomy of a black hole, to scale", desc, "".join(body), "".join(css), name="black-hole-anatomy.svg")
    print(f"    deflection b={B_BENT}: {defl:.1f} deg; T_isco {T_ISCO:.2f} s")


if __name__ == "__main__":
    build()
