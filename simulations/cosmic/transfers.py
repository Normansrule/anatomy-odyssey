r"""Orbit transfers: Hohmann, bi-elliptic, Lambert's problem and porkchop plots.

The physics in plain language
-----------------------------
**Hohmann transfer (1925).**  To move between two circular orbits of radii
r1 < r2 with two short burns, fly half of an ellipse that touches both.
Using the vis-viva equation v^2 = mu (2/r - 1/a) with a_t = (r1 + r2)/2:

    dv1 = sqrt(mu/r1) * (sqrt(2 r2 / (r1 + r2)) - 1)
    dv2 = sqrt(mu/r2) * (1 - sqrt(2 r1 / (r1 + r2)))
    t   = pi * sqrt(a_t^3 / mu)        (half an orbit)

From a 300 km Low Earth Orbit (LEO) to Geostationary Orbit (GEO, r = 42,164 km)
this costs about 2.43 + 1.47 = 3.89 km/s (ignoring the plane change).

**Bi-elliptic transfer.**  Go *beyond* the target to r_b, then drop back.
Three burns, much longer, but cheaper than Hohmann when r2/r1 > 11.94 (and
for every r_b when r2/r1 > 15.58).

**Lambert's problem.**  Given two positions r1, r2 and a flight time dt, find
the orbit that connects them.  We use the *universal-variable* method
(Bate, Mueller & White; Curtis Algorithm 5.2).  With the Stumpff functions
C(z), S(z) and

    A    = sin(dtheta) * sqrt(r1 r2 / (1 - cos dtheta))
    y(z) = r1 + r2 + A (z S(z) - 1) / sqrt(C(z))
    F(z) = (y / C)^(3/2) S + A sqrt(y) - sqrt(mu) dt = 0

we solve F(z) = 0 for z (z > 0 ellipse, z < 0 hyperbola).  Time of flight
grows monotonically with z, so a bracketing bisection is bullet-proof and
vectorises over a whole porkchop grid at once.  Then the Lagrange
coefficients f = 1 - y/r1, g = A sqrt(y/mu), gdot = 1 - y/r2 give

    v1 = (r2 - f r1) / g,     v2 = (gdot r2 - r1) / g.

**Porkchop plot.**  For every (departure date, arrival date) pair we solve
Lambert between Earth-then and Mars-then.  The launch energy is
C3 = |v1 - v_Earth|^2 (km^2/s^2; what the rocket must supply) and the arrival
excess speed is v_inf = |v2 - v_Mars|.  Contours look like a pork chop.
Earth-Mars windows repeat every synodic period, 1 / (1/T_E - 1/T_M) ~ 780 days.

Planet positions use the Keplerian elements and rates of E. M. Standish,
"Keplerian Elements for Approximate Positions of the Major Planets"
(JPL Solar System Dynamics, Table 1, valid 1800-2050 AD), in the J2000
ecliptic frame.  Accuracy is a few arc-minutes - fine for mission design
sketches, not for navigation.

References
----------
* W. Hohmann, *Die Erreichbarkeit der Himmelskorper* (1925).
* H. Curtis, *Orbital Mechanics for Engineering Students*, Algorithms 5.2, Examples 5.2, 6.1.
* R. Bate, D. Mueller, J. White, *Fundamentals of Astrodynamics* (1971), ch. 5.
* E. M. Standish, JPL, https://ssd.jpl.nasa.gov/planets/approx_pos.html (Table 1).
"""

from __future__ import annotations

if __package__ in (None, ""):  # allow `python simulations/cosmic/transfers.py`
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

import datetime as _dt

import numpy as np

from cosmic.constants import AU, MU_EARTH_KM, MU_SUN_KM, R_EARTH_KM
from cosmic.orbital_elements import coe2rv, julian_date, solve_kepler, true_from_eccentric

AU_KM = AU / 1e3

# ---------------------------------------------------------------------------
# Standish Table 1: a [au], e, I [deg], L [deg], long.peri [deg], long.node [deg]
# and their rates per Julian century.  J2000 ecliptic and equinox.
# ---------------------------------------------------------------------------
STANDISH = {
    "mercury": ((0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593),
                (0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081)),
    "venus": ((0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255),
              (0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418)),
    "earth": ((1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0),
              (0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0)),
    "mars": ((1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891),
             (0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343)),
    "jupiter": ((5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909),
                (-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106)),
    "saturn": ((9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448),
               (-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794)),
    "uranus": ((19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503),
               (-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589)),
    "neptune": ((30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574),
                (0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664)),
}
# ("earth" is really the Earth-Moon barycentre in Standish's table.)


def planet_elements(name, jd):
    """Osculating-ish elements (a [km], e, i, raan, argp, M) [rad] at Julian date(s) ``jd``."""
    el0, rate = STANDISH[name.lower()]
    T = (np.asarray(jd, dtype=float) - 2451545.0) / 36525.0
    a, e, I, L, varpi, Om = (x0 + dx * T for x0, dx in zip(el0, rate))
    argp = varpi - Om
    M = L - varpi
    return a * AU_KM, e, np.radians(I), np.radians(Om), np.radians(argp), np.radians(M)


def planet_state(name, jd, mu=MU_SUN_KM):
    """Heliocentric position [km] and velocity [km/s] (J2000 ecliptic)."""
    a, e, i, raan, argp, M = planet_elements(name, jd)
    E = solve_kepler(M, e)
    nu = true_from_eccentric(E, e)
    return coe2rv(a, e, i, raan, argp, nu, mu)


# ---------------------------------------------------------------------------
# impulsive transfers between circular orbits
# ---------------------------------------------------------------------------
def hohmann(r1, r2, mu=MU_EARTH_KM):
    """Return (dv1, dv2, dv_total, transfer_time) for a Hohmann transfer r1 -> r2."""
    at = 0.5 * (r1 + r2)
    dv1 = abs(np.sqrt(mu / r1) * (np.sqrt(2 * r2 / (r1 + r2)) - 1))
    dv2 = abs(np.sqrt(mu / r2) * (1 - np.sqrt(2 * r1 / (r1 + r2))))
    return dv1, dv2, dv1 + dv2, np.pi * np.sqrt(at**3 / mu)


def bielliptic(r1, r2, rb, mu=MU_EARTH_KM):
    """Return (dv1, dv2, dv3, dv_total, transfer_time) for a bi-elliptic transfer via apoapsis rb."""
    a1, a2 = 0.5 * (r1 + rb), 0.5 * (rb + r2)
    dv1 = np.sqrt(2 * mu / r1 - mu / a1) - np.sqrt(mu / r1)
    dv2 = np.sqrt(2 * mu / rb - mu / a2) - np.sqrt(2 * mu / rb - mu / a1)
    dv3 = np.sqrt(2 * mu / r2 - mu / a2) - np.sqrt(mu / r2)
    dv1, dv2, dv3 = abs(dv1), abs(dv2), abs(dv3)
    t = np.pi * (np.sqrt(a1**3 / mu) + np.sqrt(a2**3 / mu))
    return dv1, dv2, dv3, dv1 + dv2 + dv3, t


# ---------------------------------------------------------------------------
# Lambert's problem (universal variables, vectorised bisection)
# ---------------------------------------------------------------------------
def stumpff_C(z):
    z = np.asarray(z, dtype=float)
    out = np.full_like(z, 0.5)
    p, n = z > 1e-8, z < -1e-8
    sp, sn = np.sqrt(z[p]), np.sqrt(-z[n])
    out[p] = (1 - np.cos(sp)) / z[p]
    out[n] = (np.cosh(sn) - 1) / (-z[n])
    s = ~(p | n)
    out[s] = 0.5 - z[s] / 24
    return out


def stumpff_S(z):
    z = np.asarray(z, dtype=float)
    out = np.full_like(z, 1 / 6)
    p, n = z > 1e-8, z < -1e-8
    sp, sn = np.sqrt(z[p]), np.sqrt(-z[n])
    out[p] = (sp - np.sin(sp)) / sp**3
    out[n] = (np.sinh(sn) - sn) / sn**3
    s = ~(p | n)
    out[s] = 1 / 6 - z[s] / 120
    return out


def lambert(r1, r2, dt, mu=MU_SUN_KM, prograde=True, iters=64):
    """Solve Lambert's problem (zero revolutions).

    r1, r2 : (..., 3) position vectors;  dt : (...) time of flight (same time unit as mu).
    Returns v1, v2 of shape (..., 3).  Entries that fail (e.g. dt <= 0) are NaN.
    """
    r1 = np.asarray(r1, dtype=float)
    r2 = np.asarray(r2, dtype=float)
    r1, r2 = np.broadcast_arrays(r1, r2)
    dt = np.broadcast_to(np.asarray(dt, dtype=float), r1.shape[:-1])
    R1 = np.linalg.norm(r1, axis=-1)
    R2 = np.linalg.norm(r2, axis=-1)
    cz = np.cross(r1, r2)[..., 2]
    cos_dth = np.clip(np.sum(r1 * r2, axis=-1) / (R1 * R2), -1, 1)
    dth = np.arccos(cos_dth)
    long_way = (cz < 0) if prograde else (cz >= 0)
    dth = np.where(long_way, 2 * np.pi - dth, dth)
    A = np.sin(dth) * np.sqrt(R1 * R2 / (1 - cos_dth))

    sqmu_dt = np.sqrt(mu) * dt
    lo = np.full(dt.shape, -60.0)
    hi = np.full(dt.shape, 4 * np.pi**2 - 1e-9)

    def y_of(z):
        C, S = stumpff_C(z), stumpff_S(z)
        return R1 + R2 + A * (z * S - 1) / np.sqrt(C), C, S

    for _ in range(iters):
        z = 0.5 * (lo + hi)
        y, C, S = y_of(z)
        ypos = np.maximum(y, 0.0)
        F = (ypos / C) ** 1.5 * S + A * np.sqrt(ypos) - sqmu_dt
        too_short = (y < 0) | (F < 0)
        lo = np.where(too_short, z, lo)
        hi = np.where(too_short, hi, z)
    z = 0.5 * (lo + hi)
    y, C, S = y_of(z)
    f = 1 - y / R1
    g = A * np.sqrt(np.maximum(y, 0) / mu)
    gdot = 1 - y / R2
    with np.errstate(invalid="ignore", divide="ignore"):
        v1 = (r2 - f[..., None] * r1) / g[..., None]
        v2 = (gdot[..., None] * r2 - r1) / g[..., None]
    bad = (dt <= 0) | (y < 0) | ~np.isfinite(g) | (g == 0)
    v1[bad] = np.nan
    v2[bad] = np.nan
    return v1, v2


# ---------------------------------------------------------------------------
# porkchop
# ---------------------------------------------------------------------------
def jd_to_datetime(jd):
    return _dt.datetime(2000, 1, 1, 12) + _dt.timedelta(days=float(jd) - 2451545.0)


def date_to_jd(s):
    d = _dt.date.fromisoformat(s)
    return julian_date(d.year, d.month, d.day)


def porkchop_grid(dep_start, dep_end, arr_start, arr_end, n_dep=220, n_arr=220, origin="earth", target="mars"):
    """C3 [km^2/s^2] and arrival v_inf [km/s] on a (arrival x departure) grid of Julian dates."""
    jd_dep = np.linspace(dep_start, dep_end, n_dep)
    jd_arr = np.linspace(arr_start, arr_end, n_arr)
    r_e, v_e = planet_state(origin, jd_dep)
    r_m, v_m = planet_state(target, jd_arr)
    D, Aj = np.meshgrid(jd_dep, jd_arr)                       # (n_arr, n_dep)
    tof = (Aj - D) * 86400.0
    v1, v2 = lambert(r_e[None, :, :], r_m[:, None, :], tof)
    c3 = np.sum((v1 - v_e[None, :, :]) ** 2, axis=-1)
    vinf = np.linalg.norm(v2 - v_m[:, None, :], axis=-1)
    c3[tof <= 0] = np.nan
    vinf[tof <= 0] = np.nan
    return jd_dep, jd_arr, c3, vinf


def launch_opportunities(start="2026-01-01", end="2031-12-31", step_days=3.0, tof=(90, 450)):
    """Minimum C3 over time of flight for each departure date (reveals the synodic rhythm)."""
    j0, j1 = date_to_jd(start), date_to_jd(end)
    jd = np.arange(j0, j1, step_days)
    tofs = np.arange(tof[0], tof[1], 3.0)
    r_e, v_e = planet_state("earth", jd)
    JA = jd[None, :] + tofs[:, None]
    r_m, _ = planet_state("mars", JA.ravel())
    r_m = r_m.reshape(JA.shape + (3,))
    v1, _ = lambert(np.broadcast_to(r_e[None], r_m.shape), r_m, tofs[:, None] * 86400.0 + 0 * JA)
    c3 = np.sum((v1 - v_e[None]) ** 2, axis=-1)
    return jd, np.nanmin(c3, axis=0), tofs[np.nanargmin(np.where(np.isfinite(c3), c3, np.inf), axis=0)]


WINDOWS = [  # (label, departure range, arrival range)
    ("2026 window", ("2026-08-15", "2027-02-15"), ("2027-03-01", "2028-03-01")),
    ("2028–29 window", ("2028-09-15", "2029-03-15"), ("2029-04-01", "2030-04-01")),
    ("2031 window", ("2030-11-15", "2031-05-15"), ("2031-05-01", "2032-05-01")),
]


def plot_porkchop(outdir=None, showcase=False, n=240):
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt
    from matplotlib.colors import BoundaryNorm

    from cosmic import style

    fig = plt.figure(figsize=(15, 9.6))
    gs = fig.add_gridspec(2, 3, height_ratios=[1, 2.5], left=0.07, right=0.975, top=0.84, bottom=0.15,
                          hspace=0.3, wspace=0.3)

    # --- top: the synodic rhythm ---
    ax0 = fig.add_subplot(gs[0, :])
    jd, c3min, _ = launch_opportunities()
    dates = [jd_to_datetime(j) for j in jd]
    ax0.fill_between(dates, np.clip(c3min, 0, 60), 60, color=style.ICE, alpha=0.06, lw=0)
    style.glow_line(ax0, dates, np.clip(c3min, 0, 60), style.ICE, lw=1.8, layers=3)
    ax0.set_ylim(60, 0)
    ax0.set_ylabel("best C3 [km²/s²]")
    ax0.set_xlim(dates[0], dates[-1])
    ax0.xaxis.set_major_locator(mdates.YearLocator())
    ax0.xaxis.set_major_formatter(mdates.DateFormatter("%Y"))
    ax0.set_title("Minimum launch energy for Earth → Mars departures, 2026–2031  (lower = easier; "
                  "the dips recur every ~26-month synodic period)", fontsize=10.5, color=style.TEXT_2,
                  fontweight="normal")

    levels_c3 = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 25, 30, 40, 50]
    cmap = style.HEAT.reversed()
    norm = BoundaryNorm([7] + levels_c3 + [60], cmap.N, extend="neither")
    vinf_levels = [2.5, 3.0, 3.5, 4.0, 5.0, 6.0]
    for k, (label, dep, arr) in enumerate(WINDOWS):
        ax = fig.add_subplot(gs[1, k])
        jdd, jda, c3, vinf = porkchop_grid(date_to_jd(dep[0]), date_to_jd(dep[1]),
                                           date_to_jd(arr[0]), date_to_jd(arr[1]), n, n)
        X = mdates.date2num([jd_to_datetime(j) for j in jdd])
        Y = mdates.date2num([jd_to_datetime(j) for j in jda])
        c3p = np.where(np.isfinite(c3), np.clip(c3, 0, 59.9), 59.9)
        ax.set_facecolor("#0b0f1f")
        ax.contourf(X, Y, c3p, levels=[7] + levels_c3 + [60], cmap=cmap, norm=norm, zorder=1)
        cl = ax.contour(X, Y, c3p, levels=levels_c3[:7] + [16, 20, 30], colors=[style.BG], linewidths=0.5,
                        alpha=0.6, zorder=2)
        ax.clabel(cl, fmt="%g", fontsize=7, colors=style.BG, inline_spacing=2)
        cv = ax.contour(X, Y, np.where(np.isfinite(vinf), vinf, 99), levels=vinf_levels, colors=[style.ICE],
                        linewidths=1.0, zorder=3)
        ax.clabel(cv, fmt=lambda v: f"{v:g}", fontsize=7.5, colors=style.ICE, inline_spacing=2)
        # time-of-flight guides
        for tof in (150, 200, 250, 300, 350):
            ax.plot(X, X + tof, color="white", lw=0.5, alpha=0.18, ls=(0, (3, 4)), zorder=2)
        ax.set_xlim(X[0], X[-1])
        ax.set_ylim(Y[0], Y[-1])
        # best point
        c3m = np.where(np.isfinite(c3), c3, np.inf)
        j, i = np.unravel_index(np.argmin(c3m), c3.shape)
        ax.scatter([X[i]], [Y[j]], marker="*", s=220, color="white", edgecolor=style.BG, lw=0.8, zorder=5)
        d0, d1 = jd_to_datetime(jdd[i]), jd_to_datetime(jda[j])
        ax.text(0.03, 0.97,
                f"{label}\nbest C3 {c3[j, i]:.1f} km²/s²\ndepart {d0:%d %b %Y}\narrive {d1:%d %b %Y}\n"
                f"flight {jda[j]-jdd[i]:.0f} d,  v∞ {vinf[j, i]:.2f} km/s",
                transform=ax.transAxes, va="top", fontsize=8.8, color=style.TEXT, linespacing=1.45,
                bbox=dict(boxstyle="round,pad=0.5", fc=style.BG, ec=style.FAINT, alpha=0.85), zorder=6)
        ax.xaxis.set_major_locator(mdates.MonthLocator(bymonth=[1, 3, 5, 7, 9, 11]))
        ax.xaxis.set_major_formatter(mdates.DateFormatter("%b\n%Y"))
        ax.yaxis.set_major_locator(mdates.MonthLocator(bymonth=[1, 4, 7, 10]))
        ax.yaxis.set_major_formatter(mdates.DateFormatter("%b %Y"))
        ax.grid(False)
        ax.set_xlabel("Launch date (Earth departure)")
        if k == 0:
            ax.set_ylabel("Arrival date at Mars")
        for s in ax.spines.values():
            s.set_visible(False)
        ax0.axvspan(mdates.date2num(jd_to_datetime(jdd[0])), mdates.date2num(jd_to_datetime(jdd[-1])),
                    color=style.SOL, alpha=0.045, lw=0)
        ax0.text(mdates.date2num(jd_to_datetime(0.5 * (jdd[0] + jdd[-1]))), 56, label, ha="center",
                 color=style.SOL, fontsize=8.5)

    # colour bar
    cax = fig.add_axes([0.62, 0.035, 0.33, 0.014])
    sm = plt.cm.ScalarMappable(norm=norm, cmap=cmap)
    cb = fig.colorbar(sm, cax=cax, orientation="horizontal", ticks=[8, 10, 12, 14, 16, 20, 30, 40, 50])
    cb.outline.set_visible(False)
    cb.ax.tick_params(labelsize=8, colors=style.TEXT_2, length=0)
    cax.set_title("Launch energy C3 = v∞,departure² [km²/s²]", fontsize=8.5, color=style.TEXT_2, loc="left", pad=4)
    fig.text(0.055, 0.04, "Blue lines: Mars arrival v∞ [km/s].   Dashed white: time of flight 150–350 days.   "
             "★ = minimum C3.", fontsize=8.5, color=style.TEXT_2)

    style.header(fig, "Porkchop plots: Earth → Mars, 2026–2031",
                 "Every pixel is one solution of Lambert's problem between Earth on the launch date and Mars on the "
                 "arrival date (universal-variable solver, vectorised over 57,600 pairs per window).")
    style.footer(fig, "simulations/cosmic/transfers.py",
                 "Ephemeris: E. M. Standish, JPL 'Approximate Positions of the Major Planets', Table 1")
    fig.texts[-2].set_y(0.008)
    fig.texts[-1].set_y(0.008)
    return style.save(fig, "porkchop_earth_mars.png", outdir=outdir, showcase=showcase)


def plot_hohmann_vs_bielliptic(outdir=None, showcase=False):
    import matplotlib.pyplot as plt

    from cosmic import style

    R = np.geomspace(1.01, 80, 600)
    dv_h = np.array([hohmann(1.0, r, 1.0)[2] for r in R])
    fig = plt.figure(figsize=(10, 6.2))
    ax = fig.add_axes([0.09, 0.12, 0.87, 0.68])
    style.glow_line(ax, R, dv_h, style.ICE, lw=2.2)
    ax.text(70, dv_h[-1] + 0.012, "Hohmann", color=style.ICE, ha="right", fontsize=10)
    for rb_ratio, c in [(2, style.NEBULA), (5, style.FLAME), (1e6, style.SOL)]:
        dv_b = np.array([bielliptic(1.0, r, max(rb_ratio * r, r), 1.0)[3] for r in R])
        style.glow_line(ax, R, dv_b, c, lw=1.8)
        lab = "bi-elliptic, r_b → ∞" if rb_ratio > 100 else f"bi-elliptic, r_b = {rb_ratio:g} r₂"
        ax.text(78, dv_b[-1] - 0.02, lab, color=c, ha="right", va="top", fontsize=9.5)
    for x, t in [(11.94, "11.94: bi-elliptic can win"), (15.58, "15.58: always wins")]:
        ax.axvline(x, color=style.MUTED, lw=0.8, ls="--")
        ax.text(x * 1.03, 0.21, t, color=style.TEXT_2, fontsize=9, rotation=90, va="bottom")
    ax.set_xscale("log")
    ax.set_xlabel("Radius ratio  r₂ / r₁")
    ax.set_ylabel("Total Δv  /  circular speed at r₁")
    ax.set_ylim(0.2, 0.6)
    style.header(fig, "Hohmann vs bi-elliptic transfers",
                 "Going further out first is cheaper once the target orbit is ~12–16 times larger — but takes far longer.")
    r1, r2 = R_EARTH_KM + 300, 42164.0
    h = hohmann(r1, r2)
    style.footer(fig, "simulations/cosmic/transfers.py",
                 f"LEO 300 km → GEO: Δv₁ {h[0]:.3f} + Δv₂ {h[1]:.3f} = {h[2]:.3f} km/s in {h[3]/3600:.2f} h")
    return style.save(fig, "hohmann_vs_bielliptic.png", outdir=outdir, showcase=showcase)


def main(argv=None):
    from cosmic import _cli

    p = _cli.parser(__doc__, "python -m cosmic.transfers")
    sub = p.add_subparsers(dest="cmd")
    h = sub.add_parser("hohmann", help="Hohmann / bi-elliptic between two circular Earth orbits")
    h.add_argument("--alt1-km", type=float, default=300.0)
    h.add_argument("--r2-km", type=float, default=42164.0, help="target orbit radius (GEO = 42164 km)")
    h.add_argument("--rb-km", type=float, default=None, help="bi-elliptic apoapsis radius")
    _cli.add_common(h)
    lp = sub.add_parser("lambert", help="solve Curtis Example 5.2 (or your own vectors)")
    lp.add_argument("--r1", type=float, nargs=3, default=[5000, 10000, 2100])
    lp.add_argument("--r2", type=float, nargs=3, default=[-14600, 2500, 7000])
    lp.add_argument("--dt", type=float, default=3600.0, help="seconds")
    pk = sub.add_parser("porkchop", help="Earth -> Mars porkchop plots for 2026-2031")
    pk.add_argument("--n", type=int, default=240, help="grid points per axis")
    _cli.add_common(pk)
    a = p.parse_args(argv)
    if a.cmd == "hohmann":
        r1 = R_EARTH_KM + a.alt1_km
        d1, d2, dv, t = hohmann(r1, a.r2_km)
        print(f"Hohmann {r1:.1f} -> {a.r2_km:.1f} km: dv1 {d1:.4f} + dv2 {d2:.4f} = {dv:.4f} km/s, {t/3600:.2f} h")
        if a.rb_km:
            b = bielliptic(r1, a.r2_km, a.rb_km)
            print(f"Bi-elliptic via {a.rb_km:.0f} km: total {b[3]:.4f} km/s, {b[4]/3600:.1f} h")
        print("wrote", plot_hohmann_vs_bielliptic(a.outdir, a.showcase))
    elif a.cmd == "lambert":
        v1, v2 = lambert(np.array(a.r1), np.array(a.r2), a.dt, mu=MU_EARTH_KM)
        print("v1 [km/s] =", np.round(v1, 4))
        print("v2 [km/s] =", np.round(v2, 4))
    else:
        n = getattr(a, "n", 240)
        print("wrote", plot_porkchop(getattr(a, "outdir", None), getattr(a, "showcase", False), n=n))


if __name__ == "__main__":
    main()
