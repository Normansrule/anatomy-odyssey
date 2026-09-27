r"""Gravitational N-body dynamics with symplectic integrators.

The physics in plain language
-----------------------------
Every body pulls on every other with Newton's inverse-square law:

    a_i = sum_{j != i}  G m_j (r_j - r_i) / |r_j - r_i|^3

Total energy E = sum 1/2 m_i v_i^2 - sum_{i<j} G m_i m_j / r_ij is conserved,
and so is total momentum and angular momentum.  A good integrator should
respect that for millions of steps.

**Why "symplectic"?**  Ordinary high-order methods (e.g. classic Runge-Kutta 4,
RK4) have tiny errors per step that *accumulate*: the energy drifts and planets
slowly spiral in or out.  A symplectic method exactly solves a slightly
perturbed ("shadow") Hamiltonian, so the energy error stays *bounded* and just
oscillates - even over billions of years.

* **Leapfrog / velocity Verlet** (2nd order), kick-drift-kick:

      v += a(x) dt/2 ;  x += v dt ;  v += a(x) dt/2

* **Yoshida (1990) 4th order**: three leapfrog steps with weights

      w1 = 1 / (2 - 2^(1/3)),   w0 = -2^(1/3) / (2 - 2^(1/3))   (sequence w1, w0, w1)

  Note the negative middle step - it steps *backwards* in time to cancel the
  leading error term.  Error ~ dt^4 instead of dt^2.

Scenarios
---------
* ``figure8``   - the Chenciner-Montgomery (2000) choreography: three equal
  masses chase each other around one figure-eight.  Initial conditions from
  C. Simo / Chenciner & Montgomery, Annals of Mathematics 152, 881 (2000):
  x1 = -x2 = (0.97000436, -0.24308753), x3 = 0,
  v3 = (-0.93240737, -0.86473146), v1 = v2 = -v3/2, with G = m = 1;
  period T = 6.32591398.
* ``solar``     - Sun, Mercury, Venus, Earth-Moon, Mars and Jupiter started from the
  JPL Standish elements at J2000 (units: au, years, G M_sun = 4 pi^2).
* ``circumbinary`` - a Kepler-16-like system (Doyle et al. 2011, Science 333, 1602):
  0.690 + 0.203 M_sun stars on a 41-day, e = 0.16 orbit, and a Saturn-mass planet
  at 0.705 au - a real "Tatooine".
"""

from __future__ import annotations

if __package__ in (None, ""):  # allow `python simulations/cosmic/nbody.py`
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from dataclasses import dataclass, field

import numpy as np

YOSHIDA_W1 = 1.0 / (2.0 - 2.0 ** (1.0 / 3.0))
YOSHIDA_W0 = -(2.0 ** (1.0 / 3.0)) / (2.0 - 2.0 ** (1.0 / 3.0))
FIGURE8_PERIOD = 6.32591398


# ---------------------------------------------------------------------------
# core physics
# ---------------------------------------------------------------------------
def accelerations(x, m, G=1.0, soft=0.0):
    """Pairwise Newtonian accelerations, vectorised.  x: (N, d), m: (N,)."""
    d = x[None, :, :] - x[:, None, :]                 # r_j - r_i
    r2 = np.sum(d * d, axis=-1) + soft**2
    np.fill_diagonal(r2, 1.0)
    inv3 = r2 ** -1.5
    np.fill_diagonal(inv3, 0.0)
    return G * np.einsum("ij,ijk->ik", inv3 * m[None, :], d)


def energy(x, v, m, G=1.0, soft=0.0):
    kin = 0.5 * np.sum(m * np.sum(v * v, axis=-1))
    iu = np.triu_indices(len(m), 1)
    d = x[iu[0]] - x[iu[1]]
    r = np.sqrt(np.sum(d * d, axis=-1) + soft**2)
    pot = -G * np.sum(m[iu[0]] * m[iu[1]] / r)
    return kin + pot


def angular_momentum(x, v, m):
    if x.shape[1] == 2:
        return np.sum(m * (x[:, 0] * v[:, 1] - x[:, 1] * v[:, 0]))
    return np.sum(m[:, None] * np.cross(x, v), axis=0)


# ---------------------------------------------------------------------------
# integrators (each returns new x, v)
# ---------------------------------------------------------------------------
def leapfrog_step(x, v, m, dt, G=1.0, soft=0.0):
    v = v + 0.5 * dt * accelerations(x, m, G, soft)
    x = x + dt * v
    v = v + 0.5 * dt * accelerations(x, m, G, soft)
    return x, v


def yoshida4_step(x, v, m, dt, G=1.0, soft=0.0):
    for w in (YOSHIDA_W1, YOSHIDA_W0, YOSHIDA_W1):
        x, v = leapfrog_step(x, v, m, w * dt, G, soft)
    return x, v


def rk4_step(x, v, m, dt, G=1.0, soft=0.0):
    """Classic 4th-order Runge-Kutta - accurate per step, but *not* symplectic."""
    def f(xx, vv):
        return vv, accelerations(xx, m, G, soft)
    k1x, k1v = f(x, v)
    k2x, k2v = f(x + 0.5 * dt * k1x, v + 0.5 * dt * k1v)
    k3x, k3v = f(x + 0.5 * dt * k2x, v + 0.5 * dt * k2v)
    k4x, k4v = f(x + dt * k3x, v + dt * k3v)
    return (x + dt / 6 * (k1x + 2 * k2x + 2 * k3x + k4x),
            v + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v))


STEPPERS = {"leapfrog": leapfrog_step, "yoshida4": yoshida4_step, "rk4": rk4_step}


@dataclass
class System:
    x: np.ndarray
    v: np.ndarray
    m: np.ndarray
    G: float = 1.0
    names: list = field(default_factory=list)
    colors: list = field(default_factory=list)
    soft: float = 0.0

    def copy(self):
        return System(self.x.copy(), self.v.copy(), self.m.copy(), self.G, list(self.names), list(self.colors),
                      self.soft)


def integrate(sys_: System, dt, n_steps, method="yoshida4", save_every=1):
    """Integrate and return (t, X, V, E) sampled every ``save_every`` steps."""
    step = STEPPERS[method]
    x, v, m = sys_.x.copy(), sys_.v.copy(), sys_.m
    n_out = n_steps // save_every + 1
    X = np.empty((n_out,) + x.shape)
    V = np.empty_like(X)
    E = np.empty(n_out)
    X[0], V[0], E[0] = x, v, energy(x, v, m, sys_.G, sys_.soft)
    k = 1
    for s in range(1, n_steps + 1):
        x, v = step(x, v, m, dt, sys_.G, sys_.soft)
        if s % save_every == 0:
            X[k], V[k], E[k] = x, v, energy(x, v, m, sys_.G, sys_.soft)
            k += 1
    t = np.arange(n_out) * dt * save_every
    return t, X, V, E


# ---------------------------------------------------------------------------
# scenarios
# ---------------------------------------------------------------------------
def figure8() -> System:
    from cosmic import style

    x1 = np.array([0.97000436, -0.24308753])
    v3 = np.array([-0.93240737, -0.86473146])
    x = np.array([x1, -x1, [0.0, 0.0]])
    v = np.array([-v3 / 2, -v3 / 2, v3])
    return System(x, v, np.ones(3), 1.0, ["body 1", "body 2", "body 3"], [style.ICE, style.FLAME, style.NEBULA])


def _to_com(s: System) -> System:
    M = s.m.sum()
    s.x = s.x - (s.m[:, None] * s.x).sum(0) / M
    s.v = s.v - (s.m[:, None] * s.v).sum(0) / M
    return s


def inner_solar_system(with_jupiter=True) -> System:
    """Sun + planets from Standish J2000 elements; units au, yr, M_sun (G = 4 pi^2)."""
    from cosmic import style
    from cosmic.constants import AU
    from cosmic.transfers import planet_state

    au_km = AU / 1e3
    kms_to_auyr = 365.25 * 86400 / au_km
    # masses [M_sun] (IAU / JPL DE440 GM ratios)
    bodies = [("Mercury", "mercury", 1.6601e-7, style.MUTED), ("Venus", "venus", 2.4478e-6, style.SOL),
              ("Earth", "earth", 3.0404e-6, style.ICE), ("Mars", "mars", 3.2272e-7, style.FLAME)]
    if with_jupiter:
        bodies.append(("Jupiter", "jupiter", 9.5479e-4, style.NEBULA))
    x = [np.zeros(3)]
    v = [np.zeros(3)]
    for _, key, _, _ in bodies:
        r, vv = planet_state(key, 2451545.0)
        x.append(r / au_km)
        v.append(vv * kms_to_auyr)
    m = np.array([1.0] + [b[2] for b in bodies])
    s = System(np.array(x), np.array(v), m, 4 * np.pi**2, ["Sun"] + [b[0] for b in bodies],
               [style.SOL] + [b[3] for b in bodies])
    return _to_com(s)


def circumbinary() -> System:
    """Kepler-16-like circumbinary planet (Doyle et al. 2011).  Units au, yr, M_sun."""
    from cosmic import style

    G = 4 * np.pi**2
    mA, mB, mp = 0.6897, 0.20255, 3.18e-4
    a_b, e_b = 0.2243, 0.15944
    M = mA + mB
    # binary starts at periapsis, relative orbit along x
    r_rel = a_b * (1 - e_b)
    v_rel = np.sqrt(G * M * (1 + e_b) / (a_b * (1 - e_b)))
    xA = np.array([-mB / M * r_rel, 0.0])
    xB = np.array([mA / M * r_rel, 0.0])
    vA = np.array([0.0, -mB / M * v_rel])
    vB = np.array([0.0, mA / M * v_rel])
    a_p = 0.7048
    # circular speed about the binary including the quadrupole correction (~ (1 + 3/4 mu a_b^2/a^2 ...))
    q = mA * mB / M**2
    v_p = np.sqrt(G * M / a_p * (1 + 0.75 * q * (a_b / a_p) ** 2 * (1 + 1.5 * e_b**2)))
    xp = np.array([0.0, -a_p])
    vp = np.array([v_p, 0.0])
    s = System(np.array([xA, xB, xp]), np.array([vA, vB, vp]), np.array([mA, mB, mp]), G,
               ["Kepler-16 A", "Kepler-16 B", "planet b"], [style.SOL, style.FLAME, style.ICE])
    return _to_com(s)


# ---------------------------------------------------------------------------
# figures
# ---------------------------------------------------------------------------
def _trail(ax, xy, color, lw=1.6, glow=True, alpha=1.0, fade=True, zorder=3):
    from matplotlib.collections import LineCollection
    from matplotlib.colors import to_rgba

    segs = np.stack([xy[:-1], xy[1:]], axis=1)
    n = len(segs)
    base = np.array(to_rgba(color))
    a = np.linspace(0.08, 1.0, n) ** 1.5 if fade else np.ones(n)
    for w, al in ([(lw * 6, 0.05), (lw * 3, 0.1)] if glow else []):
        cols = np.tile(base, (n, 1))
        cols[:, 3] = a * al * alpha
        ax.add_collection(LineCollection(segs, colors=cols, linewidths=w, capstyle="round", zorder=zorder))
    cols = np.tile(base, (n, 1))
    cols[:, 3] = a * alpha
    ax.add_collection(LineCollection(segs, colors=cols, linewidths=lw, capstyle="round", zorder=zorder + 0.1))


def _body(ax, x, y, color, size=60, zorder=6):
    for s, a in [(size * 9, 0.06), (size * 4, 0.12), (size * 1.8, 0.3)]:
        ax.scatter([x], [y], s=s, color=color, alpha=a, lw=0, zorder=zorder)
    ax.scatter([x], [y], s=size, color="white", lw=0, zorder=zorder + 0.1)
    ax.scatter([x], [y], s=size * 0.55, color=color, alpha=0.35, lw=0, zorder=zorder + 0.2)


def plot_figure8(outdir=None, showcase=False, periods=50, dt=0.01):
    import matplotlib.pyplot as plt

    from cosmic import style

    s = figure8()
    n = int(round(periods * FIGURE8_PERIOD / dt))
    res = {}
    for meth in ("rk4", "leapfrog", "yoshida4"):
        t, X, V, E = integrate(s, dt, n, meth, save_every=5)
        res[meth] = (t, X, E)
    t, X, _ = res["yoshida4"]

    fig = plt.figure(figsize=(14, 7.6))
    ax = fig.add_axes([0.03, 0.1, 0.57, 0.76])
    ax.set_facecolor(style.BG)
    ax.grid(False)
    ax.set_aspect("equal")
    ax.set_xlim(-1.32, 1.32)
    ax.set_ylim(-0.62, 0.62)
    ax.axis("off")
    style.starfield(ax, 260, extent=(-1.32, 1.32, -0.62, 0.62), alpha=0.6)

    # the full orbit as a faint guide, then fading trails (last ~1/3 period) per body
    one = int(FIGURE8_PERIOD / (dt * 5)) + 1
    ax.plot(X[:one, 0, 0], X[:one, 0, 1], color="white", lw=0.6, alpha=0.12, zorder=2)
    k_now = int(0.37 * one)
    tail = int(one / 3)
    for b in range(3):
        _trail(ax, X[k_now - tail:k_now + 1, b], s.colors[b], lw=2.4)
        _body(ax, X[k_now, b, 0], X[k_now, b, 1], s.colors[b], size=70)
        vx, vy = res["yoshida4"][1][k_now + 1, b] - X[k_now, b]
        ax.annotate("", (X[k_now, b, 0] + vx * 4.5, X[k_now, b, 1] + vy * 4.5), (X[k_now, b, 0], X[k_now, b, 1]),
                    arrowprops=dict(arrowstyle="-|>", color=s.colors[b], lw=1.2, alpha=0.8), zorder=7)
    ax.text(0.0, -0.56, "three equal masses, one shared path  ·  period T = 6.3259 (G = m = 1)",
            ha="center", color=style.TEXT_2, fontsize=9.5)

    # energy error panel: envelope (running min/max over ~1/4 period) of |dE/E|
    ax2 = fig.add_axes([0.655, 0.13, 0.315, 0.66])
    labels = {"rk4": ("Runge–Kutta 4: grows every orbit", style.FLAME),
              "leapfrog": ("Leapfrog (2nd order): bounded", style.ICE),
              "yoshida4": ("Yoshida (4th order): bounded", style.AURORA)}
    win = max(1, int(FIGURE8_PERIOD / (dt * 5) / 4))
    for meth, (lab, c) in labels.items():
        tt, _, E = res[meth]
        err = np.abs((E - E[0]) / E[0]) + 1e-17
        m = len(err) // win
        hi = err[: m * win].reshape(m, win).max(1)
        tc = tt[: m * win].reshape(m, win).mean(1) / FIGURE8_PERIOD
        style.glow_line(ax2, tc, hi, c, lw=1.8, layers=3)
        ax2.text(periods * 0.98, hi[-1] * 2.2, lab, color=c, fontsize=9, ha="right", va="bottom",
                 fontweight="semibold")
    ax2.set_yscale("log")
    ax2.set_ylim(1e-10, 1e-2)
    ax2.set_xlim(0, periods)
    ax2.set_xlabel("time [orbital periods]")
    ax2.set_ylabel("relative energy error  |ΔE / E₀|")
    ax2.set_title(f"Energy conservation at the same step, dt = {dt}", fontsize=11)
    ax2.text(0.02, 0.975, "Each line is the largest error within each quarter-orbit.\n"
             "RK4 and Yoshida are both 4th order — only the symplectic\none keeps its error bounded, for any length of run.",
             transform=ax2.transAxes, va="top", fontsize=8.6, color=style.TEXT_2, linespacing=1.4)

    style.header(fig, "The figure-eight three-body choreography",
                 "Chenciner & Montgomery (2000): a periodic solution of the three-body problem, integrated here "
                 "with Yoshida's 4th-order symplectic scheme.")
    style.footer(fig, "simulations/cosmic/nbody.py", "Initial conditions: Chenciner & Montgomery, Ann. Math. 152 (2000)")
    return style.save(fig, "nbody_figure8.png", outdir=outdir, showcase=showcase)


def plot_solar(outdir=None, years=12.0, dt=0.5 / 365.25):
    import matplotlib.pyplot as plt

    from cosmic import style

    s = inner_solar_system(True)
    n = int(years / dt)
    t, X, V, E = integrate(s, dt, n, "yoshida4", save_every=2)
    fig = plt.figure(figsize=(12, 7))
    ax = fig.add_axes([0.02, 0.06, 0.55, 0.78])
    ax.set_aspect("equal")
    ax.axis("off")
    lim = 5.6
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)
    style.starfield(ax, 300, extent=(-lim, lim, -lim, lim), alpha=0.5)
    for b in range(1, len(s.m)):
        _trail(ax, X[:, b, :2], s.colors[b], lw=1.2, fade=False, alpha=0.7, glow=False)
        _body(ax, X[-1, b, 0], X[-1, b, 1], s.colors[b], size=18)
        u = X[-1, b, :2] / np.linalg.norm(X[-1, b, :2])
        ax.text(*(X[-1, b, :2] + 0.35 * u), s.names[b], color=s.colors[b], fontsize=8.5, ha="center", va="center")
    _body(ax, X[-1, 0, 0], X[-1, 0, 1], style.SOL, size=60)
    ax2 = fig.add_axes([0.64, 0.16, 0.33, 0.6])
    ax2.plot(t, (E - E[0]) / abs(E[0]), color=style.AURORA, lw=1)
    ax2.set_xlabel("time [years]")
    ax2.set_ylabel("ΔE / E₀")
    ax2.set_title("Energy error (Yoshida 4, dt = 0.5 day)", fontsize=11)
    style.header(fig, "The inner Solar System plus Jupiter",
                 f"Started from JPL Standish elements at J2000 and integrated for {years:g} years.")
    style.footer(fig, "simulations/cosmic/nbody.py")
    return style.save(fig, "nbody_solar_system.png", outdir=outdir)


def plot_circumbinary(outdir=None, years=4.0, dt=0.1 / 365.25):
    import matplotlib.pyplot as plt

    from cosmic import style

    s = circumbinary()
    n = int(years / dt)
    t, X, V, E = integrate(s, dt, n, "yoshida4", save_every=4)
    fig = plt.figure(figsize=(12, 7))
    ax = fig.add_axes([0.02, 0.06, 0.55, 0.78])
    ax.set_aspect("equal")
    ax.axis("off")
    lim = 0.85
    ax.set_xlim(-lim, lim)
    ax.set_ylim(-lim, lim)
    style.starfield(ax, 250, extent=(-lim, lim, -lim, lim), alpha=0.5)
    for b in (2, 1, 0):
        _trail(ax, X[:, b], s.colors[b], lw=1.0 if b < 2 else 1.4, fade=False, alpha=0.55, glow=b == 2)
        _body(ax, X[-1, b, 0], X[-1, b, 1], s.colors[b], size=[70, 35, 18][b])
        u = X[-1, b] / np.linalg.norm(X[-1, b])
        ax.text(*(X[-1, b] + [0.09, 0.075, 0.07][b] * u), s.names[b], color=s.colors[b], fontsize=9, ha="center",
                va="center")
    r_p = np.linalg.norm(X[:, 2] - (s.m[:2, None] * X[:, :2]).sum(1) / s.m[:2].sum(), axis=-1)
    ax2 = fig.add_axes([0.64, 0.16, 0.33, 0.6])
    ax2.plot(t * 365.25, r_p, color=style.ICE, lw=1)
    ax2.set_xlabel("time [days]")
    ax2.set_ylabel("planet distance from binary centre [au]")
    ax2.set_title("The two suns tug the planet every 41 days", fontsize=11)
    style.header(fig, "A planet with two suns: Kepler-16",
                 "0.69 + 0.20 solar-mass stars (41-day, e = 0.16 orbit) and a Saturn-mass planet at 0.70 au.")
    style.footer(fig, "simulations/cosmic/nbody.py", "Parameters: Doyle et al. (2011), Science 333, 1602")
    return style.save(fig, "nbody_circumbinary.png", outdir=outdir)


def figure8_gif(outdir=None, showcase=False, frames=90, size_px=480):
    """Animated GIF of the choreography with fading trails."""
    import imageio.v2 as imageio
    import matplotlib.pyplot as plt

    from cosmic import style

    s = figure8()
    dt = 0.002
    n = int(FIGURE8_PERIOD / dt)
    t, X, _, _ = integrate(s, dt, n, "yoshida4", save_every=1)
    idx = np.linspace(0, n, frames, endpoint=False).astype(int)
    tail = int(n * 0.3)
    images = []
    dpi = 100
    fig = plt.figure(figsize=(size_px / dpi, size_px * 0.5 / dpi), dpi=dpi)
    for k in idx:
        fig.clf()
        ax = fig.add_axes([0, 0, 1, 1])
        ax.set_facecolor(style.BG)
        ax.set_xlim(-1.25, 1.25)
        ax.set_ylim(-0.625, 0.625)
        ax.axis("off")
        ax.plot(X[:, 0, 0], X[:, 0, 1], color="white", lw=0.5, alpha=0.1)
        for b in range(3):
            j = np.arange(k - tail, k + 1) % n
            _trail(ax, X[j, b], s.colors[b], lw=1.8, glow=True)
            _body(ax, X[k, b, 0], X[k, b, 1], s.colors[b], size=30)
        fig.canvas.draw()
        img = np.asarray(fig.canvas.buffer_rgba())[..., :3].copy()
        images.append(img)
    plt.close(fig)
    from cosmic.style import MEDIA, outpath

    path = outpath("nbody_figure8.gif", outdir)
    imageio.mimsave(path, images, duration=1 / 30, loop=0)
    if showcase:
        MEDIA.mkdir(parents=True, exist_ok=True)
        (MEDIA / "nbody_figure8.gif").write_bytes(path.read_bytes())
    return path


def main(argv=None):
    from cosmic import _cli

    p = _cli.parser(__doc__, "python -m cosmic.nbody")
    p.add_argument("scenario", nargs="?", default="figure8", choices=["figure8", "solar", "circumbinary", "all"])
    p.add_argument("--gif", action="store_true", help="also render the figure-eight GIF")
    p.add_argument("--periods", type=float, default=50, help="figure-eight: periods to integrate")
    p.add_argument("--dt", type=float, default=0.01, help="figure-eight: time step")
    _cli.add_common(p)
    a = p.parse_args(argv)
    if a.scenario in ("figure8", "all"):
        print("wrote", plot_figure8(a.outdir, a.showcase, a.periods, a.dt))
    if a.gif:
        print("wrote", figure8_gif(a.outdir, a.showcase))
    if a.scenario in ("solar", "all"):
        print("wrote", plot_solar(a.outdir))
    if a.scenario in ("circumbinary", "all"):
        print("wrote", plot_circumbinary(a.outdir))


if __name__ == "__main__":
    main()
