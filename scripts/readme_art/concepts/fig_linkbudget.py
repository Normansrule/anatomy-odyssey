"""link-budget.svg — Voyager 1's radio signal spreads out as 1/r² on its way to a 70 m Deep Space Network dish.

Numbers (NASA JPL Voyager and DSN references; DSN Telecommunications Link Design Handbook 810-005):
  transmitter 22.4 W at X-band 8.4 GHz; 3.7 m high-gain antenna, gain ≈ 48 dBi (×63,000)
  flux at distance r:  S = P·G / (4π r²)
  DSN 70 m antenna: effective area ≈ 2,700 m² at X-band (≈ 70 % of its 3,850 m² aperture)
  example distance 25 × 10⁹ km (≈ 167 AU, Voyager 1 in 2025)."""
import math
from _lib import *

W, H = 800, 360
P, G = 22.4, 10 ** 4.8                   # W, linear gain (48 dBi)
EIRP = P * G
A_EFF = 2700.0                           # m²
R_END = 25e12                            # m
C = 299_792_458.0
AU = 1.495978707e11
DUR = 14.0
T0, T1 = 0.06, 0.78                      # pulse leaves ... arrives
VX, VY, EX = 70, 132, 730                # Voyager, lane y, Earth


def flux(r):
    return EIRP / (4 * math.pi * r * r)


def sci(v, nd=1):
    e = math.floor(math.log10(v))
    m = v / 10 ** e
    sup = str(e).translate(str.maketrans("-0123456789", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"))
    return f"{m:.{nd}f} × 10{sup}"


def build():
    css, body = [], []
    body.append(card(W, H, seed=131, nstars=70))
    body.append(header(28, 34, "DEEP-SPACE RADIO LINK · FLUX ∝ 1 / r²", "Voyager's whisper from 25 billion km", size=21))
    L = EX - VX
    body.append(f'<defs><clipPath id="lane"><rect x="{VX - 10}" y="64" width="{L + 6}" height="156"/></clipPath>'
                f'<radialGradient id="eg" cx=".35" cy=".35"><stop offset="0" stop-color="#9fd4ff"/><stop offset="1" stop-color="#1d4f9a"/></radialGradient></defs>')

    # continuous faint wavefronts + the tagged pulse
    rings = []
    css.append(kf("wv", [(0, "transform:scale(.01);opacity:.9"), (1, f"transform:scale({L + 40});opacity:.15")]))
    for k in range(5):
        css.append(anim(f".w{k}", "wv", 5, delay=-k))
        rings.append(f'<g class="w{k}"><circle r="1" fill="none" stroke="{ICE}" stroke-opacity=".35" stroke-width="1.2" vector-effect="non-scaling-stroke"/></g>')
    st = [(0, "transform:scale(.01);opacity:0"), (T0, "transform:scale(.01);opacity:1"), (T1, f"transform:scale({L})"),
          (T1 + .03, f"transform:scale({L + 30});opacity:0"), (1, f"transform:scale({L + 30});opacity:0")]
    css.append(kf("pl", st) + anim(".pl", "pl", DUR))
    rings.append(f'<g class="pl" style="transform:scale({L})"><circle r="1" fill="none" stroke="{SOL}" stroke-width="2.4" vector-effect="non-scaling-stroke"/></g>')
    body.append(f'<g clip-path="url(#lane)"><g transform="translate({VX} {VY})">{"".join(rings)}</g></g>')

    # Voyager
    body.append(f'<g transform="translate({VX} {VY})"><path d="M-2 -18L2 -18L2 18L-2 18Z" fill="#8f98bd"/>'
                '<path d="M4 -16Q14 0 4 16Q8 0 4 -16Z" fill="#f4f6ff"/><rect x="-10" y="-5" width="10" height="10" fill="#d9a441"/>'
                '<path d="M-10 0H-32M-6 5L-18 26" stroke="#cfd5e8" stroke-width="1.4"/></g>')
    body.append(text(VX - 30, VY + 46, "Voyager 1", 13, TEXT, weight=700) + text(VX - 30, VY + 62, "22.4 W radio", 12, TEXT2)
                + text(VX - 30, VY + 77, "3.7 m dish", 12, TEXT2))
    # Earth + 70 m dish
    body.append(f'<circle cx="{EX + 22}" cy="{VY}" r="16" fill="url(#eg)"/>'
                f'<g transform="translate({EX} {VY})"><path d="M-3 16L0 4L3 16" stroke="#8f98bd" stroke-width="2" fill="none"/>'
                '<path d="M-8 -16Q10 0 -8 16Q-2 0 -8 -16Z" fill="#dfe4f4" transform="translate(4 -2)"/></g>')
    css.append(kf("hit", [(0, "opacity:0"), (T1 - .005, "opacity:0"), (T1, "opacity:1"), (T1 + .08, "opacity:0"), (1, "opacity:0")]) + anim(".hit", "hit", DUR))
    body.append(f'<circle class="hit" cx="{EX}" cy="{VY}" r="16" fill="{SOL}" opacity="0"/>')
    body.append(text(EX + 4, VY + 46, "Earth", 13, TEXT, weight=700) + text(EX + 4, VY + 62, "70 m dish", 12, TEXT2))

    # distance axis
    AY = 238
    xr = lambda r: VX + r / R_END * L
    body.append(f'<path d="M{VX} {AY}H{EX}" stroke="#39436e"/>')
    for bn in (0, 5, 10, 15, 20, 25):
        x = xr(bn * 1e12)
        lt = bn * 1e12 / C / 3600
        body.append(f'<path d="M{f(x)} {AY - 4}V{AY + 4}" stroke="{FAINT}"/>'
                    + text(x, AY + 18, f"{bn}" if bn else "0", 11.5, FAINT, "m", "middle")
                    + (text(x, AY - 8, f"{lt:.1f} h", 11, FAINT, "m", "middle") if bn else ""))
    body.append(text(14, AY + 18, "10⁹ km", 11.5, FAINT))
    body.append(text(14, AY - 8, "light", 11, FAINT))

    # stepped readouts
    n = 10
    RY = 290
    for k in range(n + 1):
        r = R_END * k / n
        a = T0 + (T1 - T0) * k / n
        b = T0 + (T1 - T0) * (k + 1) / n if k < n else .96
        if k == 0:
            g = text(28, RY, "signal leaves Voyager: 22.4 W × gain 63,000", 15, TEXT, weight=700) + text(28, RY + 22, "…spread over an ever-larger sphere", 13, TEXT2)
        elif k < n:
            g = (text(28, RY, f"r = {r / 1e12:.1f} billion km  ·  {r / C / 3600:.1f} h of travel", 15, TEXT, weight=700)
                 + text(28, RY + 22, f"flux {sci(flux(r))} W per m²", 13.5, SOL, "m"))
        else:
            pr = flux(r) * A_EFF
            g = (text(28, RY, f"arrives after {r / C / 3600:.1f} h: {sci(flux(r))} W per m²", 15, TEXT, weight=700)
                 + text(28, RY + 22, f"× 2,700 m² of dish = {sci(pr)} W  ({10 * math.log10(pr / 1e-3):.0f} dBm)", 13.5, AURORA, "m", weight=700))
        cls = f"r{k}"
        if k == 0:
            stp = [(0, "opacity:1"), (b, "opacity:1"), (b + .001, "opacity:0"), (.985, "opacity:0"), (1, "opacity:1")]
        else:
            stp = [(0, "opacity:0"), (a - .001, "opacity:0"), (a, "opacity:1"), (b, "opacity:1"), (b + .001, "opacity:0"), (1, "opacity:0")]
        css.append(f".{cls}{{opacity:{1 if k == n else 0}}}" + kf(cls, stp) + anim("." + cls, cls, DUR))
        body.append(f'<g class="{cls}">{g}</g>')

    # log flux bar (right)
    BX, BY, BW = 540, 280, 232
    LMAX, LMIN = -18.0, -22.0
    wv = lambda r: max(0.0, (math.log10(flux(r)) - LMIN) / (LMAX - LMIN))
    body.append(text(BX, BY - 8, "flux at the wavefront (log scale)", 11.5, FAINT))
    body.append(f'<rect x="{BX}" y="{BY}" width="{BW}" height="12" rx="6" fill="#161d36"/>')
    st = [(0, "transform:scaleX(1)"), (T0, "transform:scaleX(1)")]
    for j in range(1, 31):
        u = j / 30
        r = max(R_END * u, 0.5e12)
        st.append((T0 + (T1 - T0) * u, f"transform:scaleX({f(min(1, wv(r)), 4)})"))
    st += [(.97, f"transform:scaleX({f(wv(R_END), 4)})"), (1, "transform:scaleX(1)")]
    css.append(kf("fb", st) + anim(".fb", "fb", DUR))
    body.append(f'<g transform="translate({BX} {BY})"><rect class="fb" width="{BW}" height="12" rx="6" fill="{SOL}" style="transform:scaleX({f(wv(R_END), 4)})"/></g>')
    for e in (-18, -19, -20, -21, -22):
        x = BX + (e - LMIN) / (LMAX - LMIN) * BW
        sup = str(e).translate(str.maketrans("-0123456789", "⁻⁰¹²³⁴⁵⁶⁷⁸⁹"))
        body.append(f'<path d="M{f(x)} {BY + 12}v4" stroke="{FAINT}"/>' + text(x, BY + 29, f"10{sup}", 11, FAINT, "m", "middle"))
    body.append(text(772, 346, "double the distance → one quarter of the flux", 11.5, FAINT, anchor="end"))

    pr = flux(R_END) * A_EFF
    desc = ("Animated link-budget diagram. A radio pulse leaves Voyager 1 and spreads as a sphere; as it travels 25 billion km (about 167 "
            "astronomical units, Voyager 1's distance in 2025) the readout steps through distance, light time and flux, and a log-scale bar "
            "falls. Flux S = P·G / (4πr²) with P = 22.4 W and high-gain antenna gain 48 dBi (×63,000): "
            + "; ".join(f"{b} billion km: {flux(b * 1e12):.2e} W/m²" for b in (5, 10, 15, 20, 25))
            + f". Light time to 25 billion km = {R_END / C / 3600:.1f} hours. A 70 m Deep Space Network (DSN) antenna with about 2,700 m² "
              f"effective area at 8.4 GHz collects {pr:.1e} W ({10 * math.log10(pr / 1e-3):.0f} dBm), less than an attowatt, "
              "yet still decodes 160 bits per second. Sources: NASA JPL Voyager fact sheets; DSN Telecommunications Link Design Handbook (810-005).")
    svg(W, H, "Deep-space link budget: Voyager to Earth", desc, "".join(body), "".join(css), name="link-budget.svg")


if __name__ == "__main__":
    build()
