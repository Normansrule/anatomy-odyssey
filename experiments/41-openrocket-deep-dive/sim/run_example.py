#!/usr/bin/env python3
"""Run every study of experiment 41 on the CC-38 Pathfinder and write the charts to ../images/.

    python3 run_example.py            # all studies (about 2-4 minutes, most of it Monte Carlo)
    python3 run_example.py --quick    # fewer Monte Carlo runs

Studies
  1. flight profile (1-DOF)                         images/profiles.png
  2. 2-DOF point mass vs 3-DOF with pitch, in wind  images/model-comparison.png
  3. one-at-a-time sensitivity of apogee            images/sensitivity.png
  4. Monte Carlo landing dispersion                  images/monte-carlo.png
  5. validation: fit Cd to a logged flight          images/validation.png
"""
from __future__ import annotations

import argparse
import csv
import math
from pathlib import Path

import numpy as np

import example_rocket as E
import rocketsim as R
import sim3dof as S

HERE = Path(__file__).resolve().parent
IMG = HERE.parent / "images"
LOG30 = HERE.parents[1] / "30-flight-computer-pcb" / "data" / "synthetic_flight_log.csv"

SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
BLUE, ORANGE, AQUA, YELLOW = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"


def style(ax, title=None):
    ax.set_facecolor(SURFACE)
    ax.grid(True, color=GRID, lw=0.6)
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    ax.tick_params(colors=INK2)
    ax.xaxis.label.set_color(INK2)
    ax.yaxis.label.set_color(INK2)
    if title:
        ax.set_title(title, loc="left", color=INK, fontsize=10.5)


def fig_axes(plt, *a, **k):
    fig, ax = plt.subplots(*a, facecolor=SURFACE, **k)
    return fig, ax


def profiles(plt):
    rk, m = E.rocket(), E.motor()
    res = R.simulate_1dof(rk, m)
    s = res.summary()
    fig, axes = fig_axes(plt, 3, 1, figsize=(9, 7.5), sharex=True)
    tmask = res.t < s["apogee_s"] + 25
    t = res.t[tmask]
    axes[0].plot(t, res.z[tmask], color=BLUE, lw=2)
    axes[0].plot(s["apogee_s"], s["apogee_m"], "o", color=ORANGE, ms=8, mec=SURFACE, mew=2)
    axes[0].annotate(f"apogee {s['apogee_m']:.0f} m at {s['apogee_s']:.1f} s", (s["apogee_s"], s["apogee_m"]),
                     xytext=(10, -14), textcoords="offset points", color=INK)
    axes[1].plot(t, np.hypot(res.vx, res.vz)[tmask], color=BLUE, lw=2)
    axes[1].annotate(f"max {s['max_speed_mps']:.0f} m/s (Mach {s['max_mach']:.2f})",
                     (res.t[np.argmax(np.hypot(res.vx, res.vz))], s["max_speed_mps"]), xytext=(10, -4),
                     textcoords="offset points", color=INK)
    axes[2].plot(t, res.a[tmask] / R.G0, color=BLUE, lw=1.5)
    axes[2].set_xlabel("time (s)")
    for ax, lab in zip(axes, ("altitude (m)", "speed (m/s)", "acceleration (g)")):
        style(ax)
        ax.set_ylabel(lab)
        ax.axvspan(0, m.burn_time, color="#fbe3d9", lw=0, zorder=0)
    axes[0].set_title(f"CC-38 Pathfinder on the illustrative {m.name} (1-DOF, no wind)", loc="left", color=INK)
    fig.tight_layout()
    fig.savefig(IMG / "profiles.png", dpi=140, facecolor=SURFACE)
    return s


def model_comparison(plt):
    rk, m, af = E.rocket(), E.motor(), E.airframe()
    fig, ax = fig_axes(plt, figsize=(9, 5.6))
    style(ax, "Boost + coast in wind (blowing towards +x): 2-DOF point mass vs 3-DOF with pitch")
    rows = []
    for w, col in ((0.0, INK2), (3.0, BLUE), (6.0, ORANGE)):
        r2 = R.simulate_2dof(rk, m, wind=w, descend=False)
        r3 = S.simulate_3dof(rk, m, af, wind=w, dt_descent=0.2)
        k3 = r3.t <= r3.events["apogee_s"]
        ax.plot(r2.x, r2.z, color=col, lw=1.4, ls=(0, (4, 3)))
        ax.plot(r3.x[k3], r3.z[k3], color=col, lw=2.2, label=f"wind {w:.0f} m/s")
        rows.append((w, r2.apogee, r2.events["apogee_x_m"], r3.apogee, r3.events["apogee_x_m"], r3.events["landing_x_m"]))
    ax.plot([], [], color=INK2, lw=2.2, label="3-DOF (solid)")
    ax.plot([], [], color=INK2, lw=1.4, ls=(0, (4, 3)), label="2-DOF point mass (dashed)")
    ax.set_xlabel("downwind distance (m)  - negative = upwind")
    ax.set_ylabel("altitude (m)")
    ax.legend(frameon=False, loc="lower left", fontsize=8.5)
    ax.text(0.99, 0.02, "axes not to scale", transform=ax.transAxes, ha="right", color=INK2, fontsize=8)
    fig.tight_layout()
    fig.savefig(IMG / "model-comparison.png", dpi=140, facecolor=SURFACE)
    return rows


def sensitivity(plt):
    """One-at-a-time: change one input, keep the others nominal, record apogee (1-DOF)."""
    base = R.simulate_1dof(E.rocket(), E.motor(), descend=False).apogee
    cases = [
        ("drag coefficient -10 % / +10 %", dict(cd=0.9), dict(cd=1.1)),
        ("dry mass -10 % / +10 %", dict(mass=0.9), dict(mass=1.1)),
        ("motor impulse +5 % / -5 %", dict(imp=1.05), dict(imp=0.95)),
        ("site elevation 1500 m / 0 m", dict(elev=1500), dict(elev=0)),
        ("air temperature -15 K / +15 K", dict(dT=-15), dict(dT=15)),
        ("wind 0 / 6 m/s (3-DOF)", dict(wind=0.0), dict(wind=6.0)),
    ]

    def run(cd=1.0, mass=1.0, imp=1.0, elev=0.0, dT=0.0, rail=1.8, wind=None):
        rk = E.rocket(cd0=0.5 * cd)
        rk.dry_mass *= mass
        if wind is not None:
            return S.simulate_3dof(rk, E.motor(), E.airframe(), wind=wind, dt_descent=0.25).apogee
        return R.simulate_1dof(rk, E.motor(scale=imp), R.Atmosphere(site_elevation=elev, dT=dT), rail_length=rail,
                               descend=False).apogee

    res = []
    for name, hi_kw, lo_kw in cases:
        res.append((name, run(**lo_kw) - base, run(**hi_kw) - base))
    res.sort(key=lambda r: abs(r[2] - r[1]))
    fig, ax = fig_axes(plt, figsize=(9, 4.4))
    style(ax, f"Apogee sensitivity (1-DOF), nominal {base:.0f} m")
    for i, (name, lo, hi) in enumerate(res):
        ax.barh(i, hi, color=BLUE, height=0.55)
        ax.barh(i, lo, color=ORANGE, height=0.55)
        ax.text(hi + (6 if hi >= 0 else -6), i, f"{hi:+.0f}", va="center", ha="left" if hi >= 0 else "right", fontsize=8, color=INK)
        ax.text(lo + (6 if lo >= 0 else -6), i, f"{lo:+.0f}", va="center", ha="left" if lo >= 0 else "right", fontsize=8, color=INK)
    ax.set_yticks(range(len(res)))
    ax.set_yticklabels([r[0] for r in res], color=INK)
    ax.axvline(0, color=INK2, lw=1)
    ax.set_xlabel("change in apogee (m)   blue = first value of the pair, orange = second")
    lim = max(max(abs(l), abs(h)) for _, l, h in res) * 1.25
    ax.set_xlim(-lim, lim)
    fig.tight_layout()
    fig.savefig(IMG / "sensitivity.png", dpi=140, facecolor=SURFACE)
    return base, res


def monte_carlo(plt, n):
    rng = np.random.default_rng(41)
    rk0, af = E.rocket(), E.airframe()
    pts, apogees = [], []
    for _ in range(n):
        w = rng.uniform(0, 6)
        wdir = rng.uniform(0, 2 * math.pi)
        rk = E.rocket(cd0=rng.normal(0.50, 0.035))
        rk.dry_mass = rng.normal(rk0.dry_mass, 0.02)
        mot = E.motor(scale=rng.normal(1.0, 0.03))
        r = S.simulate_3dof(rk, mot, af, wind=w, rail_angle_deg=rng.normal(0, 1.0), dt_descent=0.25)
        d = r.events["landing_x_m"]
        pts.append((d * math.cos(wdir), d * math.sin(wdir)))
        apogees.append(r.apogee)
    pts = np.array(pts)
    apogees = np.array(apogees)
    r95 = np.percentile(np.hypot(pts[:, 0], pts[:, 1]), 95)
    fig, (a1, a2) = fig_axes(plt, 1, 2, figsize=(11, 5.2), gridspec_kw={"width_ratios": [1.2, 1]})
    style(a1, f"Landing points, {n} runs (wind 0-6 m/s from any direction)")
    a1.scatter(pts[:, 0], pts[:, 1], s=14, color=BLUE, alpha=0.7, edgecolor="none")
    a1.add_patch(plt.Circle((0, 0), r95, fill=False, color=ORANGE, lw=1.6))
    a1.text(0, r95 * 1.03, f"95 % within {r95:.0f} m", ha="center", color=INK, fontsize=9)
    a1.plot(0, 0, "^", color=INK, ms=8)
    a1.set_aspect("equal")
    a1.set_xlabel("east (m)")
    a1.set_ylabel("north (m)")
    style(a2, "Apogee distribution")
    a2.hist(apogees, bins=20, color=BLUE, edgecolor=SURFACE)
    a2.set_xlabel("apogee (m)")
    a2.set_ylabel("runs")
    a2.axvline(apogees.mean(), color=ORANGE, lw=1.5)
    a2.text(apogees.mean(), a2.get_ylim()[1] * 0.95, f" mean {apogees.mean():.0f} m\n sd {apogees.std():.0f} m",
            color=INK, va="top", fontsize=9)
    fig.tight_layout()
    fig.savefig(IMG / "monte-carlo.png", dpi=140, facecolor=SURFACE)
    return r95, apogees.mean(), apogees.std()


def validation(plt):
    """Fit the drag coefficient so the simulation reproduces a logged apogee (experiment 30's log)."""
    if not LOG30.exists():
        return None
    with LOG30.open() as f:
        rows = list(csv.DictReader(f))
    t = np.array([float(r["t_ms"]) for r in rows]) / 1000
    h = np.array([float(r["kf_alt_m"]) for r in rows])
    st = [r["state"] for r in rows]
    t0 = t[st.index("BOOST")] - 0.1  # launch is detected ~0.1 s after first motion
    logged_apogee = h.max()
    # the logged rocket: 1.55 kg without propellant, 41 mm, same illustrative motor, 600 m site
    atm = R.Atmosphere(site_elevation=600)

    def apogee(cd):
        rk = R.Rocket(dry_mass=1.55 - 0.15, diameter=0.041, cd0=cd, mach_drag=False)
        return R.simulate_1dof(rk, E.motor(), atm, rail_length=1.0, descend=False)

    lo, hi = 0.2, 1.2
    for _ in range(30):  # bisection: apogee decreases monotonically with Cd
        mid = (lo + hi) / 2
        if apogee(mid).apogee > logged_apogee:
            lo = mid
        else:
            hi = mid
    cd_fit = (lo + hi) / 2
    sim = apogee(cd_fit)
    first = apogee(0.45)
    fig, ax = fig_axes(plt, figsize=(9, 4.8))
    style(ax, "Validation: simulation vs a logged flight (experiment 30 log), Cd fitted by bisection")
    k = (t - t0) < sim.events["apogee_s"] + 6
    ax.plot(t[k] - t0, h[k], color=INK2, lw=3, alpha=0.6, label="logged (CC-FL1 Kalman altitude)")
    ax.plot(first.t, first.z, color=ORANGE, lw=1.6, ls=(0, (4, 3)), label=f"simulation, guessed Cd = 0.45 -> {first.apogee:.0f} m")
    ax.plot(sim.t, sim.z, color=BLUE, lw=2, label=f"simulation, fitted Cd = {cd_fit:.3f} -> {sim.apogee:.0f} m")
    ax.set_xlabel("time since launch (s)")
    ax.set_ylabel("altitude above pad (m)")
    ax.legend(frameon=False, loc="lower right")
    fig.tight_layout()
    fig.savefig(IMG / "validation.png", dpi=140, facecolor=SURFACE)
    return logged_apogee, cd_fit, first.apogee


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--quick", action="store_true")
    args = ap.parse_args()
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.size": 9})
    IMG.mkdir(exist_ok=True)

    print(E.stability_report()[0], "\n")
    s = profiles(plt)
    print("1-DOF: " + ", ".join(f"{k} {v:.1f}" for k, v in s.items()))
    print("\nwind  2-DOF apogee / x_apogee   3-DOF apogee / x_apogee / landing x")
    for w, a2, x2, a3, x3, l3 in model_comparison(plt):
        print(f"{w:4.0f}  {a2:7.0f} m / {x2:6.0f} m    {a3:7.0f} m / {x3:6.0f} m / {l3:6.0f} m")
    base, res = sensitivity(plt)
    print(f"\nsensitivity of apogee (nominal {base:.0f} m):")
    for name, lo, hi in reversed(res):
        print(f"  {name:28s} {hi:+7.1f} m / {lo:+7.1f} m")
    r95, mean, sd = monte_carlo(plt, 40 if args.quick else 200)
    print(f"\nMonte Carlo: apogee {mean:.0f} +/- {sd:.0f} m, 95 % of landings within {r95:.0f} m of the pad")
    v = validation(plt)
    if v:
        print(f"\nvalidation: logged apogee {v[0]:.1f} m; Cd guess 0.45 gives {v[2]:.0f} m; fitted Cd = {v[1]:.3f}")
    print(f"\ncharts written to {IMG}")


if __name__ == "__main__":
    main()
