r"""Stars as blackbodies: Planck, Wien, Stefan-Boltzmann, colour and the HR diagram.

The physics in plain language
-----------------------------
A hot, dense, opaque object glows with a spectrum that depends *only* on its
temperature.  Max Planck (1900) found the formula by assuming light is emitted
in packets of energy E = h nu.  The spectral radiance per unit wavelength is

    B_lambda(T) = (2 h c^2 / lambda^5) * 1 / (exp(h c / (lambda k_B T)) - 1)      [W m^-3 sr^-1]

Two famous laws fall out of it:

* **Wien's displacement law** - the peak moves to shorter wavelength as T rises:

      lambda_peak = b / T,       b = 2.897 771 955e-3 m K

  The Sun (T_eff = 5772 K) peaks at about 502 nm, in the blue-green.

* **Stefan-Boltzmann law** - integrate B over all wavelengths and directions and
  the power per unit area is sigma T^4.  A spherical star of radius R therefore
  has luminosity

      L = 4 pi R^2 sigma T^4.

What colour is a blackbody?
---------------------------
Your eye has three kinds of cone cells.  The CIE 1931 "standard observer"
condenses human colour matching into three functions x(lambda), y(lambda),
z(lambda).  Weighting a spectrum by them gives tristimulus values

    X = integral B(lambda) x(lambda) dlambda   (similarly Y, Z)

which a fixed 3x3 matrix (IEC 61966-2-1) turns into linear sRGB for a screen
with a D65 white point; a gamma curve then encodes it.  Because the Sun's
spectrum is broad, its colour is almost white - slightly warm - not yellow.

The Hertzsprung-Russell diagram
-------------------------------
Plotting luminosity against surface temperature sorts stars by physics:

* **Main sequence** (hydrogen burning).  Mass sets everything.  The
  mass-luminosity relation is roughly L ~ M^3.5 (piecewise, below) and radius
  roughly R ~ M^0.8 (M < 1 Msun) or M^0.57 (M > 1 Msun).  Temperature follows
  from Stefan-Boltzmann: T = T_sun (L / R^2)^(1/4) in solar units.
* **Giants and supergiants** - evolved stars with swollen, cool envelopes.
* **White dwarfs** - Earth-sized stellar embers: hot but tiny, so faint.

Lines of constant radius are straight lines on a log L vs log T plot because
log L = 2 log R + 4 log T + const.

References
----------
* M. Planck (1901), Ann. Phys. 309, 553.
* CIE 1931 2-degree standard observer, 10 nm table (CIE 018:2019 / ISO 11664-1).
* IEC 61966-2-1:1999 (sRGB).
* Duric, "Advanced Astrophysics" (2004) for the piecewise mass-luminosity relation.
* Prsa et al. (2016), IAU 2015 Resolution B3 nominal solar values.
"""

from __future__ import annotations

if __package__ in (None, ""):  # allow `python simulations/cosmic/stellar.py`
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import numpy as np

from cosmic.constants import C, H, K_B, L_SUN, R_SUN, SIGMA_SB, T_SUN, WIEN_B

# ---------------------------------------------------------------------------
# CIE 1931 2-degree colour matching functions, 380-780 nm at 10 nm.
# Columns: x_bar, y_bar, z_bar.  (CIE 018:2019 / ISO 11664-1 tabulation.)
# ---------------------------------------------------------------------------
CIE_LAMBDA_NM = np.arange(380, 781, 10, dtype=float)
CIE_XYZ = np.array([
    [0.001368, 0.000039, 0.006450], [0.004243, 0.000120, 0.020050],
    [0.014310, 0.000396, 0.067850], [0.043510, 0.001210, 0.207400],
    [0.134380, 0.004000, 0.645600], [0.283900, 0.011600, 1.385600],
    [0.348280, 0.023000, 1.747060], [0.336200, 0.038000, 1.772110],
    [0.290800, 0.060000, 1.669200], [0.195360, 0.090980, 1.287640],
    [0.095640, 0.139020, 0.812950], [0.032010, 0.208020, 0.465180],
    [0.004900, 0.323000, 0.272000], [0.009300, 0.503000, 0.158200],
    [0.063270, 0.710000, 0.078250], [0.165500, 0.862000, 0.042160],
    [0.290400, 0.954000, 0.020300], [0.433450, 0.994950, 0.008750],
    [0.594500, 0.995000, 0.003900], [0.762100, 0.952000, 0.002100],
    [0.916300, 0.870000, 0.001650], [1.026300, 0.757000, 0.001100],
    [1.062200, 0.631000, 0.000800], [1.002600, 0.503000, 0.000340],
    [0.854450, 0.381000, 0.000190], [0.642400, 0.265000, 0.000050],
    [0.447900, 0.175000, 0.000020], [0.283500, 0.107000, 0.000000],
    [0.164900, 0.061000, 0.000000], [0.087400, 0.032000, 0.000000],
    [0.046770, 0.017000, 0.000000], [0.022700, 0.008210, 0.000000],
    [0.011359, 0.004102, 0.000000], [0.005790, 0.002091, 0.000000],
    [0.002899, 0.001047, 0.000000], [0.001440, 0.000520, 0.000000],
    [0.000690, 0.000249, 0.000000], [0.000332, 0.000120, 0.000000],
    [0.000166, 0.000060, 0.000000], [0.000083, 0.000030, 0.000000],
    [0.000042, 0.000015, 0.000000],
])

# XYZ (D65) -> linear sRGB, IEC 61966-2-1
XYZ_TO_SRGB = np.array([
    [3.2404542, -1.5371385, -0.4985314],
    [-0.9692660, 1.8760108, 0.0415560],
    [0.0556434, -0.2040259, 1.0572252],
])

SPECTRAL_CLASSES = [  # (class, T_min, T_max) - approximate main-sequence boundaries
    ("O", 30000, 60000), ("B", 10000, 30000), ("A", 7500, 10000), ("F", 6000, 7500),
    ("G", 5200, 6000), ("K", 3700, 5200), ("M", 2400, 3700),
]


# ---------------------------------------------------------------------------
# radiation laws
# ---------------------------------------------------------------------------
def planck_lambda(wavelength_m, T):
    """Spectral radiance B_lambda(T) [W m^-3 sr^-1].  Broadcasts over inputs."""
    lam = np.asarray(wavelength_m, dtype=float)
    T = np.asarray(T, dtype=float)
    x = H * C / (lam * K_B * T)
    with np.errstate(over="ignore"):
        return 2.0 * H * C**2 / lam**5 / np.expm1(x)


def wien_peak(T):
    """Wavelength of peak B_lambda [m] - Wien's displacement law."""
    return WIEN_B / np.asarray(T, dtype=float)


def stefan_boltzmann_flux(T):
    """Emitted power per unit area sigma T^4 [W/m^2]."""
    return SIGMA_SB * np.asarray(T, dtype=float) ** 4


def luminosity(radius_m, T):
    """L = 4 pi R^2 sigma T^4 [W]."""
    return 4.0 * np.pi * np.asarray(radius_m) ** 2 * stefan_boltzmann_flux(T)


def radius_from_LT(L_solar, T):
    """Radius in solar radii from luminosity (solar units) and temperature [K]."""
    return np.sqrt(np.asarray(L_solar)) * (T_SUN / np.asarray(T, dtype=float)) ** 2


# ---------------------------------------------------------------------------
# colour
# ---------------------------------------------------------------------------
def blackbody_xyz(T):
    """CIE XYZ of a blackbody (arbitrary scale), shape (..., 3)."""
    T = np.atleast_1d(np.asarray(T, dtype=float))
    lam = CIE_LAMBDA_NM * 1e-9
    B = planck_lambda(lam[None, :], T.reshape(-1, 1))            # (n, 41)
    xyz = B @ CIE_XYZ * 10e-9                                     # rectangle rule, 10 nm
    return xyz.reshape(T.shape + (3,))


def xyz_to_chromaticity(xyz):
    s = xyz.sum(axis=-1, keepdims=True)
    return xyz[..., :2] / s


def srgb_gamma(linear):
    """Linear -> sRGB transfer function (IEC 61966-2-1)."""
    a = np.clip(linear, 0.0, None)
    return np.where(a <= 0.0031308, 12.92 * a, 1.055 * np.power(a, 1 / 2.4) - 0.055)


def blackbody_rgb(T, normalize: str = "max", gamma: bool = True):
    """sRGB colour of a blackbody at temperature ``T`` (scalar or array).

    ``normalize='max'`` scales so the brightest channel is 1 (pure chromaticity,
    the usual "star colour").  ``normalize='Y'`` keeps luminance Y = 1 in linear
    light, useful for renderers that apply their own brightness.  Out-of-gamut
    negatives (very hot/cool stars) are desaturated towards grey.
    """
    xyz = blackbody_xyz(T)
    xyz = xyz / xyz[..., 1:2]                       # Y = 1
    rgb = xyz @ XYZ_TO_SRGB.T
    # desaturate out-of-gamut colours: add just enough white to kill negatives
    neg = np.minimum(rgb.min(axis=-1, keepdims=True), 0.0)
    rgb = (rgb - neg) / (1.0 - neg)
    if normalize == "max":
        rgb = rgb / rgb.max(axis=-1, keepdims=True)
    if gamma:
        rgb = srgb_gamma(np.clip(rgb, 0.0, 1.0) if normalize == "max" else rgb)
    out = np.clip(rgb, 0.0, None)
    return out[0] if np.ndim(T) == 0 else out


def blackbody_rgb_table(T_min=1000.0, T_max=60000.0, n=512):
    """Log-spaced lookup table (T, linear RGB with Y=1) for fast rendering."""
    T = np.geomspace(T_min, T_max, n)
    return T, blackbody_rgb(T, normalize="Y", gamma=False)


def spectral_class(T):
    for name, lo, hi in SPECTRAL_CLASSES:
        if lo <= T < hi:
            return name
    return "O" if T >= 60000 else "M"


# ---------------------------------------------------------------------------
# a synthetic stellar population for the HR diagram
# ---------------------------------------------------------------------------
def mass_luminosity(M):
    """Piecewise main-sequence mass-luminosity relation (solar units)."""
    M = np.asarray(M, dtype=float)
    return np.select(
        [M < 0.43, M < 2.0, M < 55.0],
        [0.23 * M**2.3, M**4.0, 1.4 * M**3.5],
        default=32000.0 * M,
    )


def mass_radius(M):
    """Approximate main-sequence mass-radius relation (solar units)."""
    M = np.asarray(M, dtype=float)
    return np.where(M < 1.0, M**0.8, M**0.57)


def synthetic_population(n_ms=2600, n_giants=420, n_super=45, n_wd=160, seed=4):
    """Return dict of arrays (T [K], L [Lsun], R [Rsun], kind) for an HR diagram.

    Main-sequence masses follow a Salpeter-like initial mass function,
    dN/dM ~ M^-2.35, truncated to 0.1-40 Msun but re-weighted so the plot shows
    every class.  Giants, supergiants and white dwarfs are drawn from simple
    empirical boxes.  This is a teaching population, not a real star catalogue.
    """
    rng = np.random.default_rng(seed)
    # log-uniform mix with a Salpeter tail so bright rare stars are visible
    logM = np.concatenate([
        rng.uniform(np.log10(0.1), np.log10(40.0), n_ms // 2),
        np.log10(0.12) - np.log10(1 - rng.uniform(0, 0.9, n_ms - n_ms // 2)) / 1.35,
    ])
    M = 10 ** np.clip(logM, -1, np.log10(40))
    L = mass_luminosity(M) * 10 ** rng.normal(0, 0.08, M.size)        # age/metallicity spread
    R = mass_radius(M) * 10 ** rng.normal(0, 0.03, M.size)
    T = T_SUN * (L / R**2) ** 0.25
    kinds = [np.full(M.size, 0)]
    Ts, Ls = [T], [L]

    # red giant branch + red clump
    Tg = rng.uniform(3500, 5300, n_giants)
    frac = (5300 - Tg) / 1800
    Lg = 10 ** (0.9 + 2.3 * frac**1.6 + rng.normal(0, 0.18, n_giants))
    clump = rng.random(n_giants) < 0.25
    Tg[clump] = rng.normal(4800, 120, clump.sum())
    Lg[clump] = 10 ** rng.normal(1.75, 0.08, clump.sum())
    Ts.append(Tg), Ls.append(Lg), kinds.append(np.full(n_giants, 1))

    # supergiants (blue to red)
    Tsg = 10 ** rng.uniform(np.log10(3500), np.log10(25000), n_super)
    Lsg = 10 ** rng.uniform(4.2, 5.7, n_super)
    Ts.append(Tsg), Ls.append(Lsg), kinds.append(np.full(n_super, 2))

    # white dwarfs: R ~ 0.008-0.015 Rsun
    Twd = 10 ** rng.uniform(np.log10(4500), np.log10(40000), n_wd)
    Rwd = rng.uniform(0.008, 0.015, n_wd)
    Lwd = Rwd**2 * (Twd / T_SUN) ** 4
    Ts.append(Twd), Ls.append(Lwd), kinds.append(np.full(n_wd, 3))

    T = np.concatenate(Ts)
    L = np.concatenate(Ls)
    return {"T": T, "L": L, "R": radius_from_LT(L, T), "kind": np.concatenate(kinds)}


# ---------------------------------------------------------------------------
# figures
# ---------------------------------------------------------------------------
def plot_hr(outdir=None, showcase=False):
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FixedLocator, NullFormatter, NullLocator

    from cosmic import style

    pop = synthetic_population()
    T, L, R, kind = pop["T"], pop["L"], pop["R"], pop["kind"]
    rgb = blackbody_rgb(T)

    fig = plt.figure(figsize=(11, 8.2))
    ax = fig.add_axes([0.085, 0.09, 0.86, 0.72])
    ax.set_facecolor("#03040a")
    ax.grid(False)

    # lines of constant radius
    Tl = np.geomspace(2000, 60000, 50)
    for Rc, lab in [(0.01, "0.01 R$_\\odot$"), (0.1, "0.1 R$_\\odot$"), (1, "1 R$_\\odot$"),
                    (10, "10 R$_\\odot$"), (100, "100 R$_\\odot$"), (1000, "1000 R$_\\odot$")]:
        Ll = Rc**2 * (Tl / T_SUN) ** 4
        ax.plot(Tl, Ll, color=style.FAINT, lw=0.9, ls=(0, (4, 4)), zorder=1)
        # big radii are labelled at the cool (right) edge, small ones at the hot edge
        Tt = 2650.0 if Rc >= 10 else (30000.0 if Rc >= 0.1 else 12500.0)
        Lt = Rc**2 * (Tt / T_SUN) ** 4 * (1.5 if Rc >= 0.1 else 0.28)
        ax.text(Tt, Lt, lab, color=style.MUTED, fontsize=8.5, ha="center", zorder=2)

    # stars: halo + core, each coloured by its own blackbody colour
    size = 3 + 9 * np.clip(np.log10(R) + 2.2, 0, 6) ** 1.45
    order = np.argsort(-size)
    ax.scatter(T[order], L[order], s=size[order] * 4.0, c=rgb[order], alpha=0.045, lw=0, zorder=3)
    ax.scatter(T[order], L[order], s=np.maximum(size[order] * 0.35, 5.0), c=rgb[order], alpha=0.9, lw=0, zorder=4)

    # the Sun
    ax.scatter([T_SUN], [1.0], s=260, facecolor="none", edgecolor=style.SOL, lw=1.6, zorder=6)
    ax.annotate("the Sun\n5772 K, 1 L$_\\odot$", (T_SUN, 1.0), xytext=(11000, 0.04),
                color=style.SOL, fontsize=10, ha="center",
                arrowprops=dict(arrowstyle="-", color=style.SOL, lw=0.8, shrinkA=0, shrinkB=9))

    # region labels
    lab = dict(fontsize=11.5, fontweight="semibold", alpha=0.95)
    ax.text(26000, 1.5e-3, "WHITE DWARFS", color=style.ICE, ha="center", **lab)
    ax.text(4300, 6e3, "RED GIANTS", color=style.FLAME, ha="center", **lab)
    ax.text(9000, 5e5, "SUPERGIANTS", color=style.NEBULA, ha="center", **lab)
    ax.text(22000, 30, "MAIN SEQUENCE", color=style.TEXT, ha="center", rotation=-33, **lab)

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlim(45000, 2300)
    ax.set_ylim(1e-5, 3e6)
    ticks = [40000, 20000, 10000, 6000, 4000, 3000]
    ax.xaxis.set_major_locator(FixedLocator(ticks))
    ax.xaxis.set_minor_locator(NullLocator())
    ax.set_xticklabels([f"{t:,}" for t in ticks])
    ax.yaxis.set_minor_formatter(NullFormatter())
    ax.set_yticks([1e-4, 1e-2, 1, 1e2, 1e4, 1e6])
    ax.set_yticklabels(["10⁻⁴", "10⁻²", "1", "10²", "10⁴", "10⁶"])
    ax.set_xlabel("Surface temperature  T  [K]   (hot → cool)")
    ax.set_ylabel("Luminosity  L / L$_\\odot$")
    for s in ax.spines.values():
        s.set_visible(False)

    # spectral class strip on top (same quantity: temperature)
    top = ax.secondary_xaxis("top")
    top.set_xticks([np.sqrt(lo * hi) for _, lo, hi in SPECTRAL_CLASSES])
    top.set_xticklabels([n for n, _, _ in SPECTRAL_CLASSES], fontsize=11, fontweight="bold")
    top.tick_params(length=0, pad=6)
    for t, (_, lo, hi) in zip(top.get_xticklabels(), SPECTRAL_CLASSES):
        t.set_color(blackbody_rgb(np.sqrt(lo * hi)))
    top.spines["top"].set_visible(False)
    top.set_xlabel("Spectral class", color=style.MUTED, fontsize=9, labelpad=6)

    style.header(fig, "The Hertzsprung–Russell diagram",
                 "A synthetic population of 3,225 stars. Each dot is painted with the sRGB colour of its own blackbody spectrum,\n"
                 "computed with the Commission Internationale de l'Éclairage (CIE) 1931 colour-matching functions.")
    style.footer(fig, "simulations/cosmic/stellar.py",
                 "Main sequence: piecewise L ∝ M^a, R ∝ M^b;  dashed lines: constant radius, L = 4πR²σT⁴")
    return style.save(fig, "hr_diagram.png", outdir=outdir, showcase=showcase)


def plot_planck(outdir=None, showcase=False):
    import matplotlib.pyplot as plt

    from cosmic import style

    lam = np.geomspace(90e-9, 20000e-9, 1500)
    fig = plt.figure(figsize=(11, 6.6))
    ax = fig.add_axes([0.08, 0.12, 0.88, 0.7])
    temps = [2000, 3000, 4500, 5772, 8000, 12000, 25000]
    Bref = planck_lambda(wien_peak(5772), 5772)
    # visible spectrum ribbon
    vis = np.linspace(380, 750, 300)
    ribbon = np.array([_wavelength_rgb(v) for v in vis])[None, :, :]
    ax.imshow(ribbon, extent=[380, 750, 1e-5, 1e3], aspect="auto", alpha=0.22, zorder=0)
    ax.text(565, 5e2, "visible", color=style.TEXT_2, ha="center", fontsize=9)
    for T in temps:
        B = planck_lambda(lam, T) / Bref
        c = blackbody_rgb(T)
        style.glow_line(ax, lam * 1e9, B, c, lw=1.9, layers=3)
        pk = wien_peak(T)
        yp = planck_lambda(pk, T) / Bref
        ax.plot(pk * 1e9, yp, "o", color=c, ms=6, zorder=6, mec=style.BG, mew=1)
        ax.text(pk * 1e9 * 1.12, yp * 1.25, f"{T:,} K", color=c, fontsize=9.5, fontweight="semibold")
    # Wien locus
    Tw = np.geomspace(1500, 40000, 100)
    ax.plot(wien_peak(Tw) * 1e9, planck_lambda(wien_peak(Tw), Tw) / Bref, color=style.MUTED, lw=1, ls="--", zorder=2)
    ax.text(2100, 250, "dashed: Wien's law,  $\\lambda_{peak} = b\\,/\\,T$", color=style.TEXT_2, fontsize=10, ha="left")
    sun_pk = wien_peak(T_SUN) * 1e9
    ax.annotate(f"the Sun peaks at {sun_pk:.0f} nm", (sun_pk, 1.0), (1400, 8.0), color=style.SOL, fontsize=10,
                arrowprops=dict(arrowstyle="-", color=style.SOL, lw=0.8, shrinkB=6))
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlim(90, 20000)
    ax.set_ylim(1e-4, 2e3)
    ax.set_xticks([100, 200, 500, 1000, 2000, 5000, 10000, 20000])
    ax.set_xticklabels(["100", "200", "500", "1,000", "2,000", "5,000", "10,000", "20,000"])
    ax.set_xlabel("Wavelength  $\\lambda$  [nm]")
    ax.set_ylabel("Spectral radiance $B_\\lambda$  (Sun's peak = 1)")
    style.header(fig, "Planck's law: every temperature has a colour",
                 "Hotter bodies are brighter at every wavelength (Stefan–Boltzmann, L ∝ T⁴) and peak at shorter wavelengths (Wien).\n"
                 "Curves are drawn in their own blackbody colour.")
    style.footer(fig, "simulations/cosmic/stellar.py",
                 "$B_\\lambda = (2hc^2/\\lambda^5)\\,/\\,(e^{hc/\\lambda k_B T} - 1)$")
    return style.save(fig, "planck_curves.png", outdir=outdir, showcase=showcase)


def _wavelength_rgb(nm):
    """sRGB colour of monochromatic light (for decoration), via the CIE table."""
    xyz = np.array([np.interp(nm, CIE_LAMBDA_NM, CIE_XYZ[:, i]) for i in range(3)])
    rgb = XYZ_TO_SRGB @ xyz
    rgb = np.clip(rgb - min(rgb.min(), 0), 0, None)
    rgb = rgb / max(rgb.max(), 1e-9)
    return srgb_gamma(rgb)


def main(argv=None):
    from cosmic import _cli

    p = _cli.parser(__doc__, "python -m cosmic.stellar")
    p.add_argument("figure", nargs="?", default="all", choices=["all", "hr", "planck", "facts"])
    _cli.add_common(p)
    a = p.parse_args(argv)
    if a.figure in ("all", "facts"):
        print(f"Sun: Wien peak {wien_peak(T_SUN)*1e9:.1f} nm, "
              f"L = {luminosity(R_SUN, T_SUN):.4e} W (IAU nominal {L_SUN:.4e} W)")
        for T in (3000, 5772, 10000, 30000):
            r, g, b = blackbody_rgb(T)
            print(f"  {T:>6} K -> sRGB #{int(r*255):02x}{int(g*255):02x}{int(b*255):02x}  class {spectral_class(T)}")
    if a.figure in ("all", "hr"):
        print("wrote", plot_hr(a.outdir, a.showcase))
    if a.figure in ("all", "planck"):
        print("wrote", plot_planck(a.outdir, a.showcase))


if __name__ == "__main__":
    main()
