r"""Finding planets by the shadows they cast: a Box Least Squares transit search.

The physics in plain language
-----------------------------
When a planet crosses the face of its star, it blocks a fraction of the light

    depth  delta ~ (R_p / R_*)^2

so an Earth crossing the Sun dims it by 84 parts per million (ppm) and a
Jupiter by 1 %.  The dip repeats every orbital period P and lasts

    T_dur ~ (P / pi) * asin( sqrt((1 + k)^2 - b^2) / (a / R_*) ),   k = R_p/R_*

where b is the impact parameter (how far from the star's centre the planet
crosses) and a comes from Kepler's third law, a^3 = G M_* P^2 / (4 pi^2).
Stars are darker near the edge (limb darkening), modelled here with the
quadratic law I(mu) = 1 - u1 (1 - mu) - u2 (1 - mu)^2, which rounds the
bottom of the dip.

**Box Least Squares (BLS)** (Kovacs, Zucker & Mazeh 2002) asks, for every
trial period P, duration D and phase: "how much better does a box-shaped dip
fit than a flat line?"  With weights w_i = 1/sigma_i^2 and the light curve
shifted to zero weighted mean, if the in-transit points have total weight r
and weighted flux sum s, the chi-squared improvement is

    delta_chi2 = s^2 W / (r (W - r)),          W = total weight

and the fitted depth is  delta = -s W / (r (W - r)).
We fold the data at every trial period into phase bins with ``np.bincount``,
take running sums with a cumulative sum (so every box position is O(1)), and
vectorise over blocks of periods - no loops over data points.

Before searching we remove the star's own slow variability (spots rotating
into view) with a running median much longer than a transit.

The synthetic light curve mimics one 27.4-day sector of the Transiting Exoplanet
Survey Satellite (TESS): 2-minute cadence, a mid-sector data gap for the
downlink, star-spot modulation and white noise.  With ``--target`` (and the
optional ``lightkurve`` package plus internet) a real TESS light curve from the
Mikulski Archive for Space Telescopes (MAST) is used instead.

References
----------
* G. Kovacs, S. Zucker, T. Mazeh (2002), A&A 391, 369 - the BLS algorithm.
* K. Mandel & E. Agol (2002), ApJ 580, L171 - transit light curves (small-planet approximation used).
* S. Seager & G. Mallen-Ornelas (2003), ApJ 585, 1038 - transit duration.
* G. Ricker et al. (2015), JATIS 1, 014003 - the TESS mission.
"""

from __future__ import annotations

if __package__ in (None, ""):  # allow `python simulations/cosmic/exoplanet_transit.py`
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from dataclasses import dataclass

import numpy as np

from cosmic.constants import DAY, G, M_SUN, R_EARTH_OVER_R_SUN, R_SUN


# ---------------------------------------------------------------------------
# transit model
# ---------------------------------------------------------------------------
def overlap_area(p, z):
    """Area of overlap between the unit disk and a disk of radius p at centre distance z."""
    z = np.asarray(z, dtype=float)
    out = np.zeros_like(z)
    full = z <= 1 - p
    out[full] = np.pi * p**2
    part = (z > 1 - p) & (z < 1 + p)
    zz = z[part]
    k0 = np.arccos(np.clip((p**2 + zz**2 - 1) / (2 * p * zz), -1, 1))
    k1 = np.arccos(np.clip((1 - p**2 + zz**2) / (2 * zz), -1, 1))
    out[part] = p**2 * k0 + k1 - 0.5 * np.sqrt(np.clip(4 * zz**2 - (1 + zz**2 - p**2) ** 2, 0, None))
    return out


def transit_model(t, period, t0, rp_over_rs, a_over_rs, b=0.0, u1=0.45, u2=0.20):
    """Relative flux for a circular orbit (small-planet quadratic limb-darkening approximation)."""
    phase = 2 * np.pi * (((t - t0) / period + 0.5) % 1.0 - 0.5)
    x = a_over_rs * np.sin(phase)
    y = b * np.cos(phase)
    z = np.hypot(x, y)
    front = np.cos(phase) > 0
    r = np.clip(z, 0, 1)
    mu = np.sqrt(1 - r**2)
    I = 1 - u1 * (1 - mu) - u2 * (1 - mu) ** 2
    norm = np.pi * (1 - u1 / 3 - u2 / 6)
    deficit = I * overlap_area(rp_over_rs, z) / norm
    return 1.0 - np.where(front, deficit, 0.0)


@dataclass
class Planet:
    period: float = 3.8521        # days
    t0: float = 1.7130            # days (mid-transit)
    rp_earth: float = 2.9         # planet radius [Earth radii]
    b: float = 0.3                # impact parameter
    r_star: float = 0.85          # [R_sun]
    m_star: float = 0.85          # [M_sun]

    @property
    def k(self):
        return self.rp_earth * R_EARTH_OVER_R_SUN / self.r_star

    @property
    def a_over_rs(self):
        a = (G * self.m_star * M_SUN * (self.period * DAY) ** 2 / (4 * np.pi**2)) ** (1 / 3)
        return a / (self.r_star * R_SUN)

    @property
    def duration(self):  # days, T14
        arg = np.sqrt((1 + self.k) ** 2 - self.b**2) / self.a_over_rs
        return self.period / np.pi * np.arcsin(np.clip(arg, 0, 1))


def synthetic_light_curve(planet: Planet | None = None, days=27.4, cadence_min=2.0, noise_ppm=700.0,
                          spot_amp=0.003, p_rot=6.3, seed=11):
    """A TESS-like single-sector light curve: returns (t [d], flux, flux_err, true_model)."""
    planet = planet or Planet()
    rng = np.random.default_rng(seed)
    t = np.arange(0.0, days, cadence_min / 1440.0)
    gap = (t > days / 2 - 0.5) & (t < days / 2 + 0.5)       # downlink gap at perigee
    t = t[~gap]
    model = transit_model(t, planet.period, planet.t0, planet.k, planet.a_over_rs, planet.b)
    # star spots: two harmonics with slowly evolving amplitude, plus a gentle instrumental drift
    env = 1 + 0.35 * np.sin(2 * np.pi * t / 19.0 + 0.7)
    spots = spot_amp * env * (np.sin(2 * np.pi * t / p_rot) + 0.35 * np.sin(4 * np.pi * t / p_rot + 1.1))
    drift = 4e-4 * np.where(t < days / 2, np.exp(-t / 1.5), np.exp(-(t - days / 2 - 0.5) / 1.5))
    err = np.full_like(t, noise_ppm * 1e-6)
    flux = model * (1 + spots + drift) + rng.normal(0, err)
    return t, flux, err, model


def load_tess(target: str, sector=None):
    """Download a TESS 2-minute light curve with lightkurve (optional dependency, needs internet)."""
    import lightkurve as lk  # noqa: F401  (optional)

    sr = lk.search_lightcurve(target, mission="TESS", author="SPOC", exptime=120, sector=sector)
    if len(sr) == 0:
        raise RuntimeError(f"no TESS SPOC light curve found for {target!r}")
    lc = sr[0].download().remove_nans().normalize()
    q = lc.quality.value == 0 if hasattr(lc, "quality") else np.ones(len(lc), bool)
    return lc.time.value[q], np.asarray(lc.flux.value, float)[q], np.asarray(lc.flux_err.value, float)[q]


# ---------------------------------------------------------------------------
# detrending
# ---------------------------------------------------------------------------
def running_median(t, flux, window_days=0.5, mask=None):
    """Running median in time, computed segment by segment (segments split at gaps).

    ``mask`` marks points to ignore (e.g. known transits): the median is taken over the remaining
    points only and interpolated back, so a transit cannot drag the trend down with it.
    """
    from scipy.ndimage import median_filter

    keep = np.ones(len(t), bool) if mask is None else ~mask
    tk, fk = t[keep], flux[keep]
    trend_k = np.empty_like(fk)
    dt = np.median(np.diff(t))
    breaks = np.where(np.diff(tk) > 0.3)[0] + 1        # real data gaps (not the masked transits)
    for seg in np.split(np.arange(len(tk)), breaks):
        n = max(3, int(round(window_days / dt)) | 1)
        n = min(n, len(seg) - (1 - len(seg) % 2))
        trend_k[seg] = median_filter(fk[seg], size=n, mode="nearest")
    return np.interp(t, tk, trend_k)


def bin_light_curve(t, y, err, minutes=10.0):
    """Average into fixed time bins (speeds up BLS; transits last hours)."""
    width = minutes / 1440.0
    idx = np.floor((t - t[0]) / width).astype(int)
    w = 1.0 / err**2
    n = idx.max() + 1
    W = np.bincount(idx, w, n)
    good = W > 0
    tb = np.bincount(idx, w * t, n)[good] / W[good]
    yb = np.bincount(idx, w * y, n)[good] / W[good]
    eb = 1.0 / np.sqrt(W[good])
    return tb, yb, eb


# ---------------------------------------------------------------------------
# Box Least Squares
# ---------------------------------------------------------------------------
@dataclass
class BLSResult:
    periods: np.ndarray
    power: np.ndarray        # delta chi^2 of the best box at each period
    sde: np.ndarray          # signal detection efficiency (power standardised)
    best_period: float
    best_t0: float
    best_duration: float
    best_depth: float
    depth_err: float
    core_depth: float = float("nan")   # depth in the central half of the transit

    @property
    def snr(self):
        return self.best_depth / self.depth_err


def bls(t, y, err, periods=None, durations_h=(1.0, 1.5, 2.0, 3.0, 4.5, 6.0), p_min=0.6, p_max=None,
        oversample=2.0, bins_per_duration=3, chunk=128):
    """Vectorised Box Least Squares periodogram.

    Phase bins are ``min(duration) / bins_per_duration`` wide in time, so short trial periods
    (most of a frequency-uniform grid) use few bins and are cheap.
    Returns a :class:`BLSResult`.  ``y`` should be detrended relative flux (~1).
    """
    t = np.asarray(t, float)
    w = 1.0 / np.asarray(err, float) ** 2
    W = w.sum()
    y0 = y - np.sum(w * y) / W                       # zero weighted mean
    base = t.max() - t.min()
    p_max = p_max or base / 2
    durations = np.asarray(durations_h) / 24.0
    if periods is None:
        df = durations.min() / (oversample * base**2)
        freqs = np.arange(1 / p_max, 1 / p_min, df)
        periods = 1.0 / freqs[::-1]
    periods = np.asarray(periods, float)
    tref = t.min()
    dtt = t - tref
    nP = len(periods)
    best_pow = np.zeros(nP)
    best_dep = np.zeros(nP)
    best_k = np.zeros(nP, int)
    best_i = np.zeros(nP, int)
    wy = w * y0
    w_tiled = np.tile(w, chunk)
    wy_tiled = np.tile(wy, chunk)
    bin_width = durations.min() / bins_per_duration
    for c0 in range(0, nP, chunk):
        P = periods[c0:c0 + chunk]
        C = len(P)
        n_bins = int(np.ceil(P.max() / bin_width))
        kmax_all = int(np.ceil(durations.max() / P.min() * n_bins)) + 1
        ph = np.outer(1.0 / P, dtt)
        ph -= np.floor(ph)
        b = np.minimum((ph * n_bins).astype(np.int64), n_bins - 1)
        b += (np.arange(C) * n_bins)[:, None]
        flat = b.ravel()
        Wb = np.bincount(flat, w_tiled[: flat.size], C * n_bins).reshape(C, n_bins)
        Yb = np.bincount(flat, wy_tiled[: flat.size], C * n_bins).reshape(C, n_bins)
        kmax = min(kmax_all, n_bins)
        Wc = np.concatenate([np.zeros((C, 1)), np.cumsum(np.concatenate([Wb, Wb[:, :kmax]], 1), 1)], 1)
        Yc = np.concatenate([np.zeros((C, 1)), np.cumsum(np.concatenate([Yb, Yb[:, :kmax]], 1), 1)], 1)
        start = np.arange(n_bins)[None, :]
        pow_c = np.zeros(C)
        dep_c = np.zeros(C)
        k_c = np.zeros(C, int)
        i_c = np.zeros(C, int)
        for D in durations:
            k = np.clip(np.round(D / P * n_bins).astype(int), 1, kmax)
            end = start + k[:, None]
            r = np.take_along_axis(Wc, end, 1) - Wc[:, :n_bins]
            s = np.take_along_axis(Yc, end, 1) - Yc[:, :n_bins]
            with np.errstate(divide="ignore", invalid="ignore"):
                dchi = np.where((r > 0) & (r < W) & (s < 0), s**2 * W / (r * (W - r)), 0.0)
            j = np.argmax(dchi, axis=1)
            val = dchi[np.arange(C), j]
            better = val > pow_c
            pow_c = np.where(better, val, pow_c)
            rr = r[np.arange(C), j]
            ss = s[np.arange(C), j]
            with np.errstate(divide="ignore", invalid="ignore"):
                dep = -ss * W / (rr * (W - rr))
            dep_c = np.where(better, dep, dep_c)
            k_c = np.where(better, k, k_c)
            i_c = np.where(better, j, i_c)
        best_pow[c0:c0 + C] = pow_c
        best_dep[c0:c0 + C] = dep_c
        best_k[c0:c0 + C] = k_c
        best_i[c0:c0 + C] = i_c

    # standardise against a running median to flatten the rising noise floor at long periods
    from scipy.ndimage import median_filter

    floor = median_filter(best_pow, size=min(len(best_pow) // 20 * 2 + 1, 2001), mode="nearest")
    resid = best_pow - floor
    mad = np.median(np.abs(resid - np.median(resid))) * 1.4826 + 1e-12
    sde = resid / mad
    j = int(np.argmax(sde))
    P = periods[j]
    c0 = (j // chunk) * chunk
    nb_j = int(np.ceil(periods[c0:c0 + chunk].max() / bin_width))
    dur = best_k[j] / nb_j * P
    t0 = tref + (best_i[j] + best_k[j] / 2) / nb_j * P
    # refine depth directly from the folded data
    ph = ((t - t0) / P + 0.5) % 1.0 - 0.5
    inside = np.abs(ph * P) < dur / 2
    wi, wo = w[inside].sum(), w[~inside].sum()
    depth = np.sum(w[~inside] * y[~inside]) / wo - np.sum(w[inside] * y[inside]) / wi
    depth_err = np.sqrt(1 / wi + 1 / wo)
    # central half of the transit: avoids diluting the depth with ingress/egress when estimating R_p
    core = np.abs(ph * P) < dur / 4
    depth_core = np.sum(w[~inside] * y[~inside]) / wo - np.sum(w[core] * y[core]) / w[core].sum() if core.any() else depth
    return BLSResult(periods, best_pow, sde, P, t0 % P, dur, depth, depth_err, depth_core)


def planet_radius(depth, r_star_rsun):
    """R_p = R_* sqrt(depth), returned in Earth radii (ignores limb darkening)."""
    return np.sqrt(max(depth, 0)) * r_star_rsun / R_EARTH_OVER_R_SUN


# ---------------------------------------------------------------------------
# pipeline + figure
# ---------------------------------------------------------------------------
def run(target=None, sector=None, outdir=None, showcase=False, r_star=None, seed=11):
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FixedLocator

    from cosmic import style

    planet = Planet()
    truth = None
    source = "synthetic TESS-like sector (2-min cadence, 700 ppm noise)"
    if target:
        try:
            t, f, e = load_tess(target, sector)
            source = f"TESS SPOC light curve of {target}"
            r_star = r_star or 1.0
        except Exception as exc:  # pragma: no cover - network/optional dependency
            print(f"[transit] could not load TESS data for {target!r} ({exc}); using synthetic data instead")
            target = None
    if not target:
        t, f, e, truth = synthetic_light_curve(planet, seed=seed)
        r_star = planet.r_star

    # pass 1: detrend blindly and search
    trend = running_median(t, f, 0.5)
    tb, yb, eb = bin_light_curve(t, f / trend, e, 15.0)
    res = bls(tb, yb, eb)
    # pass 2: mask the candidate transits, re-detrend and search again (removes the median's bias)
    ph = ((t - res.best_t0) / res.best_period + 0.5) % 1.0 - 0.5
    in_tr = np.abs(ph * res.best_period) < res.best_duration
    trend = running_median(t, f, 0.5, mask=in_tr)
    flat = f / trend
    tb, yb, eb = bin_light_curve(t, flat, e, 15.0)
    res = bls(tb, yb, eb)
    # the mean in-transit depth ~ k^2: limb darkening deepens the centre and shallows the edges,
    # and the two roughly cancel along the transit chord
    rp = planet_radius(res.best_depth, r_star)
    print(f"BLS: P = {res.best_period:.5f} d, t0 = {res.best_t0:.4f} d, duration = {res.best_duration*24:.2f} h, "
          f"depth = {res.best_depth*1e6:.0f} +/- {res.depth_err*1e6:.0f} ppm (S/N {res.snr:.1f}), "
          f"R_p ~ {rp:.2f} R_earth")
    if truth is not None:
        print(f"     injected: P = {planet.period} d, R_p = {planet.rp_earth} R_earth, "
              f"k^2 = {planet.k**2*1e6:.0f} ppm, T14 = {planet.duration*24:.2f} h")

    # ---- figure ----
    fig = plt.figure(figsize=(14, 9.2))
    gs = fig.add_gridspec(2, 2, height_ratios=[1, 1.25], width_ratios=[1.15, 1], left=0.06, right=0.975,
                          top=0.84, bottom=0.08, hspace=0.36, wspace=0.18)
    ax0 = fig.add_subplot(gs[0, :])
    ppt = 1e3
    ax0.scatter(t, (f - 1) * ppt, s=1.2, color=style.ICE, alpha=0.35, lw=0, rasterized=True)
    brk = np.where(np.diff(t) > 0.1)[0] + 1
    for seg in np.split(np.arange(len(t)), brk):
        ax0.plot(t[seg], (trend[seg] - 1) * ppt, color=style.SOL, lw=1.4)
    n_tr = np.arange(np.ceil((t.min() - res.best_t0) / res.best_period), (t.max() - res.best_t0) / res.best_period + 1)
    tt = res.best_t0 + n_tr * res.best_period
    lo = np.percentile((f - 1) * ppt, 0.2)
    for x in tt:
        if np.min(np.abs(t - x)) < 0.02:
            ax0.plot([x], [lo - 0.6], marker="^", color=style.AURORA, ms=7)
    ax0.set_xlim(t.min() - 0.2, t.max() + 0.2)
    ax0.set_xlabel("time [days]")
    ax0.set_ylabel("flux − 1  [ppt]")
    ax0.set_title("1 · Raw light curve: star spots (gold = running-median trend) hide the transits "
                  "(▲ where BLS later finds them)", fontsize=11)

    ax1 = fig.add_subplot(gs[1, 0])
    ax1.plot(res.periods, res.sde, color=style.NEBULA, lw=0.8)
    ax1.set_xscale("log")
    P = res.best_period
    ax1.scatter([P], [res.sde.max()], color=style.AURORA, s=40, zorder=5)
    ax1.annotate(f"P = {P:.4f} d", (P, res.sde.max()), (P * 1.35, res.sde.max() * 0.93), color=style.AURORA,
                 fontsize=10, fontweight="semibold", arrowprops=dict(arrowstyle="-", color=style.AURORA, lw=0.8))
    for m, lab in [(0.5, "P/2"), (2.0, "2P"), (1 / 3, "P/3"), (3.0, "3P")]:
        if res.periods.min() < P * m < res.periods.max():
            j = np.argmin(np.abs(res.periods - P * m))
            ax1.text(P * m, res.sde[max(j - 20, 0):j + 20].max() + 1.5, lab, color=style.TEXT_2, fontsize=8.5,
                     ha="center")
    ax1.set_xlabel("trial period [days]")
    ax1.set_ylabel("signal detection efficiency (σ above noise)")
    ax1.set_title(f"2 · Box Least Squares periodogram ({len(res.periods):,} trial periods)", fontsize=11)
    ax1.xaxis.set_major_locator(FixedLocator([0.7, 1, 2, 3, 5, 7, 10]))
    ax1.set_xticklabels(["0.7", "1", "2", "3", "5", "7", "10"])
    ax1.set_ylim(bottom=min(-3, res.sde.min()))

    ax2 = fig.add_subplot(gs[1, 1])
    ph_h = (((t - res.best_t0) / P + 0.5) % 1.0 - 0.5) * P * 24
    sel = np.abs(ph_h) < 8
    ax2.scatter(ph_h[sel], (flat[sel] - 1) * 1e6, s=2, color=style.ICE, alpha=0.22, lw=0, rasterized=True)
    edges = np.arange(-8, 8.01, 0.25)
    idx = np.digitize(ph_h[sel], edges) - 1
    ybin = np.array([np.mean(flat[sel][idx == i]) if np.any(idx == i) else np.nan for i in range(len(edges) - 1)])
    ebin = np.array([np.std(flat[sel][idx == i]) / np.sqrt(max((idx == i).sum(), 1)) for i in range(len(edges) - 1)])
    xc = 0.5 * (edges[1:] + edges[:-1])
    if truth is not None:
        tm = np.linspace(-8, 8, 800)
        mod = transit_model(res.best_t0 + tm / 24, planet.period, planet.t0, planet.k, planet.a_over_rs, planet.b)
        ax2.plot(tm, (mod - 1) * 1e6, color=style.FLAME, lw=1.5, alpha=0.9, label="injected model")
    half = res.best_duration * 12
    ax2.plot([-8, -half, -half, half, half, 8], [0, 0, -res.best_depth * 1e6, -res.best_depth * 1e6, 0, 0],
             color=style.AURORA, lw=1.4, ls="--", label="best BLS box")
    ax2.errorbar(xc, (ybin - 1) * 1e6, yerr=ebin * 1e6, fmt="o", ms=4, color="white", ecolor=style.MUTED,
                 elinewidth=0.8, capsize=0, zorder=5, label="15-min bins")
    ax2.set_xlim(-8, 8)
    ax2.set_ylim(-2600, 1400)
    ax2.set_xlabel("hours from mid-transit")
    ax2.set_ylabel("relative flux [ppm]")
    ax2.set_title("3 · Detrended and phase-folded", fontsize=11)
    ax2.legend(loc="lower left", fontsize=8.5)
    txt = (f"period       {P:.4f} d\nduration     {res.best_duration*24:.2f} h\n"
           f"depth        {res.best_depth*1e6:,.0f} ± {res.depth_err*1e6:.0f} ppm\n"
           f"S/N          {res.snr:.0f}\nR_p ≈ R_*√δ  {rp:.2f} R⊕")
    if truth is not None:
        txt += f"\n(injected    {planet.period} d, {planet.rp_earth} R⊕)"
    ax2.text(0.97, 0.03, txt, transform=ax2.transAxes, ha="right", va="bottom", fontsize=8.6, family="monospace",
             multialignment="left",
             color=style.TEXT, linespacing=1.45, bbox=dict(boxstyle="round,pad=0.55", fc=style.BG, ec=style.FAINT))

    style.header(fig, "Hunting an exoplanet with Box Least Squares",
                 f"Input: {source}. A {planet.rp_earth} Earth-radius planet dims its K-dwarf host by only "
                 f"~{planet.k**2*1e6:,.0f} ppm — smaller than the noise on any single point.")
    style.footer(fig, "simulations/cosmic/exoplanet_transit.py", "BLS: Kovács, Zucker & Mazeh (2002), A&A 391, 369")
    path = style.save(fig, "exoplanet_transit.png", outdir=outdir, showcase=showcase)
    return res, path


def main(argv=None):
    from cosmic import _cli

    p = _cli.parser(__doc__, "python -m cosmic.exoplanet_transit")
    p.add_argument("--target", default=None, help="TESS target name, e.g. 'Pi Mensae' (needs lightkurve + internet)")
    p.add_argument("--sector", type=int, default=None)
    p.add_argument("--r-star", type=float, default=None, help="stellar radius [R_sun] for the radius estimate")
    p.add_argument("--seed", type=int, default=11)
    _cli.add_common(p)
    a = p.parse_args(argv)
    _, path = run(a.target, a.sector, a.outdir, a.showcase, a.r_star, a.seed)
    print("wrote", path)


if __name__ == "__main__":
    main()
