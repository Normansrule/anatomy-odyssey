r"""Keplerian orbital elements, state vectors, J2 precession and ground tracks.

The physics in plain language
-----------------------------
Two bodies attracting by gravity move on a conic section (Kepler / Newton).
Six numbers - the *classical orbital elements* - pin the orbit down:

    a      semi-major axis           size of the ellipse
    e      eccentricity              shape (0 = circle, <1 ellipse)
    i      inclination               tilt against the equator / ecliptic
    RAAN   right ascension of the ascending node (Omega) - where it crosses going north
    argp   argument of periapsis (omega) - where the closest point sits in the plane
    nu     true anomaly              where the body is right now

Elements -> position and velocity (the *perifocal* frame first):

    p = a (1 - e^2),     r = p / (1 + e cos nu)
    r_pf = r [cos nu, sin nu, 0]
    v_pf = sqrt(mu/p) [-sin nu, e + cos nu, 0]

then three rotations R3(-Omega) R1(-i) R3(-omega) carry them into the inertial
frame.  The inverse uses the angular-momentum vector h = r x v, the node
vector n = k x h and the eccentricity vector

    e_vec = ((v^2 - mu/r) r - (r . v) v) / mu.

Time enters through Kepler's equation, M = E - e sin E, with mean anomaly
M = M0 + n t and mean motion n = sqrt(mu / a^3) (Kepler's third law:
T = 2 pi sqrt(a^3 / mu)).

Earth is not a perfect sphere: its equatorial bulge (the J2 term) makes the
orbit plane precess.  Averaged over one orbit,

    dOmega/dt = -(3/2) n J2 (R/p)^2 cos i
    domega/dt =  (3/4) n J2 (R/p)^2 (5 cos^2 i - 1)

For the International Space Station (ISS) (i = 51.64 deg, ~420 km) the node
slides west by about 5 degrees per day.

A *ground track* is the point directly beneath the spacecraft.  We rotate the
inertial position into the Earth-fixed frame by the Greenwich sidereal angle
theta_G(t) and take latitude/longitude.  Because Earth turns ~22.5 deg under
the ISS during each 92-minute orbit, successive passes march westward.

References
----------
* H. Curtis, *Orbital Mechanics for Engineering Students*, 4th ed., Algorithms 4.2 & 4.5.
* D. Vallado, *Fundamentals of Astrodynamics and Applications*, 4th ed., Sec. 9.6 (J2).
* Greenwich Mean Sidereal Time (GMST): IAU 1982 model, Aoki et al. (1982).
* Land mask: Natural Earth 1:110m admin-0 polygons (public domain), rasterised at 0.25 deg.
"""

from __future__ import annotations

if __package__ in (None, ""):  # allow `python simulations/cosmic/orbital_elements.py`
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from dataclasses import dataclass
from pathlib import Path

import numpy as np

from cosmic.constants import GM_EARTH, J2_EARTH, OMEGA_EARTH, R_EARTH

TWO_PI = 2.0 * np.pi


# ---------------------------------------------------------------------------
# Kepler's equation
# ---------------------------------------------------------------------------
def solve_kepler(M, e, tol=1e-13, maxiter=50):
    """Solve M = E - e sin E for the eccentric anomaly E (vectorised, e < 1)."""
    M = np.asarray(M, dtype=float)
    e = np.asarray(e, dtype=float)
    M = np.remainder(M + np.pi, TWO_PI) - np.pi
    E = np.where(e < 0.8, M, np.pi * np.sign(M) + 0.0 * M)
    for _ in range(maxiter):
        f = E - e * np.sin(E) - M
        dE = -f / (1.0 - e * np.cos(E))
        E = E + dE
        if np.all(np.abs(dE) < tol):
            break
    return E


def true_from_eccentric(E, e):
    return 2.0 * np.arctan2(np.sqrt(1 + e) * np.sin(E / 2), np.sqrt(1 - e) * np.cos(E / 2))


def eccentric_from_true(nu, e):
    return 2.0 * np.arctan2(np.sqrt(1 - e) * np.sin(nu / 2), np.sqrt(1 + e) * np.cos(nu / 2))


def period(a, mu=GM_EARTH):
    """Kepler's third law, T = 2 pi sqrt(a^3/mu)."""
    return TWO_PI * np.sqrt(np.asarray(a, dtype=float) ** 3 / mu)


def circular_velocity(r, mu=GM_EARTH):
    return np.sqrt(mu / np.asarray(r, dtype=float))


def escape_velocity(r, mu=GM_EARTH):
    return np.sqrt(2.0 * mu / np.asarray(r, dtype=float))


def vis_viva(r, a, mu=GM_EARTH):
    """Speed on an orbit of semi-major axis a at radius r: v^2 = mu (2/r - 1/a)."""
    return np.sqrt(mu * (2.0 / np.asarray(r) - 1.0 / np.asarray(a)))


# ---------------------------------------------------------------------------
# elements <-> state vectors
# ---------------------------------------------------------------------------
@dataclass
class Elements:
    a: float      # semi-major axis [m] (or km if mu in km^3/s^2)
    e: float      # eccentricity
    i: float      # inclination [rad]
    raan: float   # right ascension of ascending node [rad]
    argp: float   # argument of periapsis [rad]
    nu: float     # true anomaly [rad]

    def degrees(self):
        d = np.degrees
        return dict(a=self.a, e=self.e, i=d(self.i), raan=d(self.raan) % 360,
                    argp=d(self.argp) % 360, nu=d(self.nu) % 360)


def _rot_pqw_to_ijk(raan, i, argp):
    """Rotation matrix perifocal -> inertial, Q = R3(-Omega) R1(-i) R3(-omega). Broadcasts."""
    cO, sO = np.cos(raan), np.sin(raan)
    ci, si = np.cos(i), np.sin(i)
    cw, sw = np.cos(argp), np.sin(argp)
    return np.array([
        [cO * cw - sO * sw * ci, -cO * sw - sO * cw * ci, sO * si],
        [sO * cw + cO * sw * ci, -sO * sw + cO * cw * ci, -cO * si],
        [sw * si, cw * si, ci * np.ones_like(cw)],
    ])


def coe2rv(a, e, i, raan, argp, nu, mu=GM_EARTH):
    """Classical elements -> (r, v).  Vectorised: returns arrays shaped (..., 3)."""
    a, e, i, raan, argp, nu = np.broadcast_arrays(*(np.asarray(x, dtype=float) for x in (a, e, i, raan, argp, nu)))
    p = a * (1.0 - e**2)
    r = p / (1.0 + e * np.cos(nu))
    r_pf = np.stack([r * np.cos(nu), r * np.sin(nu), np.zeros_like(r)])
    v_pf = np.sqrt(mu / p) * np.stack([-np.sin(nu), e + np.cos(nu), np.zeros_like(r)])
    Q = _rot_pqw_to_ijk(raan, i, argp)
    rv = np.einsum("ij...,j...->...i", Q, r_pf)
    vv = np.einsum("ij...,j...->...i", Q, v_pf)
    return rv, vv


def rv2coe(r, v, mu=GM_EARTH) -> Elements:
    """State vector -> classical elements (Curtis Algorithm 4.2).  Scalar version."""
    r = np.asarray(r, dtype=float)
    v = np.asarray(v, dtype=float)
    rn, vn = np.linalg.norm(r), np.linalg.norm(v)
    vr = np.dot(r, v) / rn
    h = np.cross(r, v)
    hn = np.linalg.norm(h)
    i = np.arccos(np.clip(h[2] / hn, -1, 1))
    n = np.cross([0.0, 0.0, 1.0], h)
    nn = np.linalg.norm(n)
    ev = ((vn**2 - mu / rn) * r - rn * vr * v) / mu
    e = np.linalg.norm(ev)
    eps = 1e-11
    raan = 0.0 if nn < eps else (np.arccos(np.clip(n[0] / nn, -1, 1)) if n[1] >= 0 else TWO_PI - np.arccos(np.clip(n[0] / nn, -1, 1)))
    if nn < eps or e < eps:
        # equatorial and/or circular: fall back to longitude/argument-of-latitude conventions
        argp = 0.0
        if e < eps:
            ref = n / nn if nn >= eps else np.array([1.0, 0.0, 0.0])
            nu = np.arccos(np.clip(np.dot(ref, r) / rn, -1, 1))
            if (np.cross(ref, r)[2] if nn < eps else r[2]) < 0:
                nu = TWO_PI - nu
        else:
            argp = np.arctan2(ev[1], ev[0]) % TWO_PI
            nu = np.arccos(np.clip(np.dot(ev, r) / (e * rn), -1, 1))
            if vr < 0:
                nu = TWO_PI - nu
    else:
        argp = np.arccos(np.clip(np.dot(n, ev) / (nn * e), -1, 1))
        if ev[2] < 0:
            argp = TWO_PI - argp
        nu = np.arccos(np.clip(np.dot(ev, r) / (e * rn), -1, 1))
        if vr < 0:
            nu = TWO_PI - nu
    a = hn**2 / mu / (1 - e**2)
    return Elements(a, e, i, raan, argp, nu)


# ---------------------------------------------------------------------------
# propagation with secular J2
# ---------------------------------------------------------------------------
def j2_rates(a, e, i, mu=GM_EARTH, R=R_EARTH, J2=J2_EARTH):
    """Secular drift rates (dRAAN/dt, dargp/dt, dM/dt extra) [rad/s] from Earth's oblateness."""
    n = np.sqrt(mu / a**3)
    p = a * (1 - e**2)
    k = n * J2 * (R / p) ** 2
    draan = -1.5 * k * np.cos(i)
    dargp = 0.75 * k * (5 * np.cos(i) ** 2 - 1)
    dM = 0.75 * k * np.sqrt(1 - e**2) * (3 * np.cos(i) ** 2 - 1)
    return draan, dargp, dM


def propagate(el: Elements, t, mu=GM_EARTH, j2=True):
    """Analytic two-body propagation (plus secular J2 drift) to times ``t`` [s].

    Returns (r, v) arrays of shape (len(t), 3) in the inertial frame.
    """
    t = np.asarray(t, dtype=float)
    n = np.sqrt(mu / el.a**3)
    E0 = eccentric_from_true(el.nu, el.e)
    M0 = E0 - el.e * np.sin(E0)
    draan = dargp = dM = 0.0
    if j2:
        draan, dargp, dM = j2_rates(el.a, el.e, el.i, mu)
    M = M0 + (n + dM) * t
    E = solve_kepler(M, el.e)
    nu = true_from_eccentric(E, el.e)
    return coe2rv(el.a, el.e, el.i, el.raan + draan * t, el.argp + dargp * t, nu, mu)


# ---------------------------------------------------------------------------
# Earth rotation and geodesy
# ---------------------------------------------------------------------------
def julian_date(year, month, day, hour=0, minute=0, second=0.0):
    """Julian date from a Gregorian calendar date (valid 1901-2099)."""
    return (367 * year - int(7 * (year + int((month + 9) / 12)) / 4) + int(275 * month / 9) + day + 1721013.5
            + (hour + minute / 60 + second / 3600) / 24)


def gmst(jd_ut1):
    """Greenwich mean sidereal angle [rad] (IAU 1982, adequate to ~0.1 s)."""
    d = np.asarray(jd_ut1) - 2451545.0
    return np.radians((280.46061837 + 360.98564736629 * d) % 360.0)


def eci_to_latlon(r, theta_g):
    """Inertial position(s) -> geocentric latitude, longitude [deg] given sidereal angle(s)."""
    r = np.atleast_2d(r)
    lon = np.degrees(np.arctan2(r[:, 1], r[:, 0]) - theta_g)
    lon = (lon + 180.0) % 360.0 - 180.0
    lat = np.degrees(np.arcsin(r[:, 2] / np.linalg.norm(r, axis=1)))
    return lat, lon


def subsolar_point(jd):
    """Approximate subsolar latitude/longitude [deg] (low-precision solar ephemeris, ~0.01 deg).

    Astronomical Almanac low-precision formulae for the Sun's ecliptic longitude.
    """
    n = jd - 2451545.0
    L = np.radians((280.460 + 0.9856474 * n) % 360)
    g = np.radians((357.528 + 0.9856003 * n) % 360)
    lam = L + np.radians(1.915) * np.sin(g) + np.radians(0.020) * np.sin(2 * g)
    eps = np.radians(23.439 - 4e-7 * n)
    ra = np.arctan2(np.cos(eps) * np.sin(lam), np.cos(lam))
    dec = np.arcsin(np.sin(eps) * np.sin(lam))
    lon = np.degrees(ra - gmst(jd))
    return np.degrees(dec), (lon + 180) % 360 - 180


def load_land_mask():
    """Boolean land mask (720 x 1440, 0.25 deg, row 0 = 90 N) from Natural Earth."""
    f = Path(__file__).resolve().parent / "data" / "land_mask_025deg.npz"
    d = np.load(f)
    shape = tuple(d["shape"])
    return np.unpackbits(d["bits"])[: shape[0] * shape[1]].reshape(shape).astype(bool)


def iss_elements(raan_deg=120.0, argp_deg=0.0, nu_deg=0.0):
    """An ISS-like orbit: 415 x 425 km, i = 51.64 deg (approximate, public TLE values)."""
    rp, ra = R_EARTH + 415e3, R_EARTH + 425e3
    a = 0.5 * (rp + ra)
    e = (ra - rp) / (ra + rp)
    return Elements(a, e, np.radians(51.64), np.radians(raan_deg), np.radians(argp_deg), np.radians(nu_deg))


# ---------------------------------------------------------------------------
# figure
# ---------------------------------------------------------------------------
def plot_ground_track(orbits=3.0, epoch=(2026, 9, 26, 12, 0, 0), outdir=None, showcase=False, j2=True):
    import matplotlib.pyplot as plt
    from matplotlib.collections import LineCollection

    from cosmic import style

    el = iss_elements()
    T = period(el.a)
    t = np.linspace(0, orbits * T, int(orbits * 900))
    r, _ = propagate(el, t, j2=j2)
    jd0 = julian_date(*epoch)
    lat, lon = eci_to_latlon(r, gmst(jd0 + t / 86400.0))

    fig = plt.figure(figsize=(12, 7.1))
    ax = fig.add_axes([0.05, 0.12, 0.9, 0.7])
    ax.set_facecolor("#050914")
    ax.grid(False)

    # day/night shading at the epoch
    sd_lat, sd_lon = subsolar_point(jd0)
    LON, LAT = np.meshgrid(np.linspace(-180, 180, 721), np.linspace(-90, 90, 361))
    cosz = (np.sin(np.radians(LAT)) * np.sin(np.radians(sd_lat)) +
            np.cos(np.radians(LAT)) * np.cos(np.radians(sd_lat)) * np.cos(np.radians(LON - sd_lon)))
    night = np.clip(-cosz * 6, 0, 1)
    shade = np.zeros(night.shape + (4,))
    shade[..., 3] = 0.45 * night
    ax.imshow(np.tile([[[0.03, 0.05, 0.1]]], (2, 2, 1)), extent=[-180, 180, -90, 90], zorder=0)       # ocean (day)
    ax.imshow(shade, extent=[-180, 180, -90, 90], origin="lower", zorder=2.5)          # night side

    # dot-matrix continents, dimmed on the night side
    mask = load_land_mask()
    step = 6  # 1.5 deg dots
    m = mask[step // 2::step, step // 2::step]
    lats = 90 - (np.arange(mask.shape[0])[step // 2::step] + 0.5) * 0.25
    lons = -180 + (np.arange(mask.shape[1])[step // 2::step] + 0.5) * 0.25
    LO, LA = np.meshgrid(lons, lats)
    cz = (np.sin(np.radians(LA)) * np.sin(np.radians(sd_lat)) +
          np.cos(np.radians(LA)) * np.cos(np.radians(sd_lat)) * np.cos(np.radians(LO - sd_lon)))
    day = np.clip(cz * 4 + 0.5, 0, 1)[m]
    cols = np.zeros((m.sum(), 4))
    cols[:, :3] = np.array([0.36, 0.45, 0.62]) * (0.45 + 0.55 * day[:, None])
    cols[:, 3] = 0.55 + 0.45 * day
    ax.scatter(LO[m], LA[m], s=4.2, c=cols, lw=0, zorder=1)
    # terminator
    ax.contour(np.linspace(-180, 180, 721), np.linspace(-90, 90, 361), cosz, levels=[0], colors=[style.SOL],
               linewidths=0.8, alpha=0.45, zorder=2, linestyles="--")
    ax.scatter([sd_lon], [sd_lat], s=180, color=style.SOL, alpha=0.18, lw=0, zorder=2)
    ax.scatter([sd_lon], [sd_lat], s=30, color=style.SOL, lw=0, zorder=2)
    ax.text(sd_lon + 4, sd_lat + 3, "subsolar point", color=style.SOL, fontsize=8.5, alpha=0.9)

    # the track, broken at the date line, coloured by time (orbit number)
    jumps = np.where(np.abs(np.diff(lon)) > 180)[0]
    seg_pts = np.stack([lon, lat], axis=1)
    segs = np.stack([seg_pts[:-1], seg_pts[1:]], axis=1)
    keep = np.ones(len(segs), bool)
    keep[jumps] = False
    segs = segs[keep]
    tt = (t[:-1][keep]) / T
    cmap = plt.matplotlib.colors.LinearSegmentedColormap.from_list("trk", [style.ICE, style.NEBULA, style.FLAME])
    for w, a in [(9, 0.05), (5, 0.1)]:
        ax.add_collection(LineCollection(segs, colors=cmap(tt / orbits), linewidths=w, alpha=a, zorder=3,
                                         capstyle="round"))
    ax.add_collection(LineCollection(segs, colors=cmap(tt / orbits), linewidths=1.8, zorder=4, capstyle="round"))

    # orbit-number labels and start marker
    for k in range(int(orbits)):
        idx = np.argmin(np.abs(t - (k + 0.25) * T))
        ax.text(lon[idx], lat[idx] + 4.5, f"orbit {k + 1}", color=cmap(k / orbits), fontsize=9, ha="center",
                fontweight="semibold", zorder=6)
    ax.scatter([lon[0]], [lat[0]], s=70, color="white", zorder=7, edgecolor=style.ICE, lw=2)
    ax.text(lon[0] + 3, lat[0] - 6, "start", color=style.TEXT, fontsize=9, zorder=7)

    # inclination bounds
    for s in (+1, -1):
        ax.axhline(s * np.degrees(el.i), color=style.MUTED, lw=0.7, ls=(0, (2, 4)), zorder=1)
    ax.text(178, np.degrees(el.i) + 1.5, "latitude limit = inclination 51.6°", color=style.MUTED, fontsize=8.5,
            ha="right")

    ax.set_xlim(-180, 180)
    ax.set_ylim(-90, 90)
    ax.set_aspect("equal")
    ax.set_xticks(range(-180, 181, 60))
    ax.set_yticks(range(-90, 91, 30))
    ax.set_xticklabels([f"{abs(v)}°{'W' if v < 0 else ('E' if v > 0 else '')}" for v in range(-180, 181, 60)])
    ax.set_yticklabels([f"{abs(v)}°{'S' if v < 0 else ('N' if v > 0 else '')}" for v in range(-90, 91, 30)])
    for s_ in ax.spines.values():
        s_.set_visible(False)

    draan, dargp, _ = j2_rates(el.a, el.e, el.i)
    dlon = np.degrees(OMEGA_EARTH * T + (-draan * T))
    style.header(fig, "Ground track of an ISS-like orbit",
                 f"{(el.a*(1-el.e)-R_EARTH)/1e3:.0f} × {(el.a*(1+el.e)-R_EARTH)/1e3:.0f} km, i = 51.64°,  "
                 f"period {T/60:.1f} min.  Each pass lands {dlon:.1f}° further west: Earth's rotation plus "
                 f"J2 nodal regression of {np.degrees(draan)*86400:.2f}°/day.")
    style.footer(fig, "simulations/cosmic/orbital_elements.py",
                 "Coastlines: Natural Earth (public domain).  Day/night at 2026-09-26 12:00 UTC")
    return style.save(fig, "ground_track.png", outdir=outdir, showcase=showcase)


def main(argv=None):
    from cosmic import _cli

    p = _cli.parser(__doc__, "python -m cosmic.orbital_elements")
    sub = p.add_subparsers(dest="cmd")
    g = sub.add_parser("groundtrack", help="ISS-like ground track")
    g.add_argument("--orbits", type=float, default=3.0)
    g.add_argument("--no-j2", action="store_true")
    _cli.add_common(g)
    c = sub.add_parser("convert", help="elements -> state vector -> elements round trip")
    c.add_argument("--a-km", type=float, default=7000.0)
    c.add_argument("--e", type=float, default=0.1)
    c.add_argument("--i-deg", type=float, default=51.6)
    c.add_argument("--raan-deg", type=float, default=40.0)
    c.add_argument("--argp-deg", type=float, default=60.0)
    c.add_argument("--nu-deg", type=float, default=30.0)
    a = p.parse_args(argv)
    if a.cmd == "convert":
        r, v = coe2rv(a.a_km * 1e3, a.e, np.radians(a.i_deg), np.radians(a.raan_deg), np.radians(a.argp_deg),
                      np.radians(a.nu_deg))
        print("r [km]   =", np.round(r / 1e3, 4))
        print("v [km/s] =", np.round(v / 1e3, 6))
        el = rv2coe(r, v)
        print("back to elements:", {k: round(float(x), 6) for k, x in el.degrees().items()})
        print(f"period {period(el.a)/60:.2f} min, v_circ {circular_velocity(np.linalg.norm(r))/1e3:.3f} km/s, "
              f"v_esc {escape_velocity(np.linalg.norm(r))/1e3:.3f} km/s")
    else:
        if a.cmd is None:
            a = p.parse_args(["groundtrack"] + (argv or []))
        print("wrote", plot_ground_track(a.orbits, outdir=a.outdir, showcase=a.showcase, j2=not a.no_j2))


if __name__ == "__main__":
    main()
