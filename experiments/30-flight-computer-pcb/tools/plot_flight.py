#!/usr/bin/env python3
"""Plot a CC-FL1 flight log (LOGnnn.CSV from the microSD card, or a host-test replay).

    python3 plot_flight.py LOG000.CSV                        # -> LOG000.png + summary
    python3 plot_flight.py log.csv --truth sensors.csv       # overlay simulator truth
    python3 plot_flight.py log.csv --out flight.png --feet

Three stacked panels share the time axis (one quantity per axis, no dual scales):
altitude (raw barometric vs Kalman), vertical velocity, acceleration. Flight phases are
shaded and the detected events are marked. Needs numpy + matplotlib.
"""
from __future__ import annotations

import argparse
import csv
from pathlib import Path

import numpy as np

# reference palette (light surface) - validated categorical slots 1-3 + text/grid tokens
SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
PHASE_TINT = {"BOOST": "#fbe3d9", "COAST": "#e3eefa", "DESCENT": "#e2f4ec", "LANDED": "#efefec"}


def load(path):
    with open(path, newline="") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        raise SystemExit(f"{path}: empty log")
    cols = {k: [] for k in rows[0]}
    for r in rows:
        for k, v in r.items():
            cols[k].append(v)
    out = {}
    for k, v in cols.items():
        try:
            out[k] = np.array(v, dtype=float)
        except ValueError:
            out[k] = np.array(v)
    out["t"] = (out["t_ms"] - out["t_ms"][0]) / 1000.0
    return out


def summarise(d):
    st = d["state"]
    t, h, v = d["t"], d["kf_alt_m"], d["kf_vel_mps"]
    a = np.sqrt(d["ax_g"] ** 2 + d["ay_g"] ** 2 + d["az_g"] ** 2)

    def first(name):
        idx = np.where(st == name)[0]
        return float(t[idx[0]]) if len(idx) else None

    s = {"launch_s": first("BOOST"), "burnout_s": first("COAST"), "apogee_s": first("APOGEE") or first("DESCENT"),
         "landed_s": first("LANDED"), "apogee_m": float(h.max()), "max_vel_mps": float(v.max()),
         "max_acc_g": float(a.max())}
    if s["launch_s"] is not None and s["apogee_s"] is not None:
        s["time_to_apogee_s"] = s["apogee_s"] - s["launch_s"]
    if s["apogee_s"] is not None:
        # descent rates: median velocity in two windows of the descent (drogue, then main)
        desc = (st == "DESCENT")
        td, vd, hd = t[desc], v[desc], h[desc]
        if len(td) > 50:
            upper = (hd > 0.5 * s["apogee_m"]) & (td > s["apogee_s"] + 3)
            lower = (hd < 100) & (hd > 10)
            if upper.any():
                s["descent_upper_mps"] = float(-np.median(vd[upper]))
            if lower.any():
                s["descent_lower_mps"] = float(-np.median(vd[lower]))
    return s


def shade(ax, d):
    st, t = d["state"], d["t"]
    start = 0
    for i in range(1, len(st) + 1):
        if i == len(st) or st[i] != st[start]:
            c = PHASE_TINT.get(st[start])
            if c:
                ax.axvspan(t[start], t[min(i, len(t) - 1)], color=c, lw=0, zorder=0)
            start = i


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("log")
    ap.add_argument("--truth", help="synth_flight.py sensor CSV with true_* columns (same time base)")
    ap.add_argument("--out")
    ap.add_argument("--feet", action="store_true", help="altitude in feet")
    ap.add_argument("--title", default=None)
    args = ap.parse_args()

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    d = load(args.log)
    s = summarise(d)
    k = 3.28084 if args.feet else 1.0
    unit = "ft" if args.feet else "m"
    truth = None
    if args.truth:
        tr = load(args.truth)
        t0 = d["t_ms"][0]
        truth = {"t": (tr["t_ms"] - t0) / 1000.0, "h": tr["true_alt_m"], "v": tr["true_vel_mps"]}

    plt.rcParams.update({"font.size": 9, "axes.edgecolor": INK2, "axes.labelcolor": INK2, "xtick.color": INK2,
                         "ytick.color": INK2, "axes.titlecolor": INK, "font.family": "DejaVu Sans"})
    fig, axes = plt.subplots(3, 1, figsize=(10, 8.2), sharex=True, facecolor=SURFACE,
                             gridspec_kw={"height_ratios": [2.2, 1.3, 1.3]})
    for ax in axes:
        ax.set_facecolor(SURFACE)
        shade(ax, d)
        ax.grid(True, color=GRID, lw=0.6, zorder=1)
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)

    t = d["t"]
    ax = axes[0]
    ax.plot(t, d["baro_alt_m"] * k, color=AQUA, lw=1.0, alpha=0.8, label="barometric (raw)", zorder=2)
    if truth:
        ax.plot(truth["t"], truth["h"] * k, color=INK2, lw=1.2, ls=(0, (4, 3)), label="simulator truth", zorder=3)
    ax.plot(t, d["kf_alt_m"] * k, color=BLUE, lw=2.0, label="Kalman filter", zorder=4)
    if s["apogee_s"] is not None:
        ax.plot([s["apogee_s"]], [s["apogee_m"] * k], "o", ms=8, color=ORANGE, mec=SURFACE, mew=2, zorder=5)
        ax.annotate(f"apogee {s['apogee_m'] * k:.0f} {unit}\nat T+{s.get('time_to_apogee_s', 0):.1f} s",
                    (s["apogee_s"], s["apogee_m"] * k), xytext=(12, -6), textcoords="offset points",
                    color=INK, fontsize=9, va="top")
    ax.set_ylabel(f"altitude above pad ({unit})")
    ax.legend(loc="upper right", frameon=False)

    ax = axes[1]
    if truth:
        ax.plot(truth["t"], truth["v"], color=INK2, lw=1.2, ls=(0, (4, 3)), label="simulator truth", zorder=3)
    ax.plot(t, d["kf_vel_mps"], color=BLUE, lw=2.0, label="Kalman velocity", zorder=4)
    ax.axhline(0, color=INK2, lw=0.8)
    ax.set_ylabel("vertical velocity (m/s)")
    ax.legend(loc="upper right", frameon=False)

    ax = axes[2]
    amag = np.sqrt(d["ax_g"] ** 2 + d["ay_g"] ** 2 + d["az_g"] ** 2)
    ax.plot(t, d["kf_acc_mps2"] / 9.80665 + 1.0, color=BLUE, lw=2.0, label="Kalman vertical accel. + 1 g", zorder=3)
    ax.plot(t, amag, color=ORANGE, lw=0.9, label="|a| accelerometer (raw)", zorder=4)
    ax.set_ylabel("acceleration (g)")
    ax.set_xlabel("time since log start (s)")
    ax.legend(loc="upper right", frameon=False)

    # phase names along the top panel
    last_x = -1e9
    for name in ("BOOST", "COAST", "DESCENT", "LANDED"):
        idx = np.where(d["state"] == name)[0]
        if len(idx) and t[idx[0]] - last_x > 0.06 * (t[-1] - t[0]):
            last_x = t[idx[0]]
            axes[0].text(t[idx[0]], axes[0].get_ylim()[1], " " + name, color=INK2, fontsize=8, va="top", ha="left")

    title = args.title or f"Flight log {Path(args.log).name}"
    sub = (f"apogee {s['apogee_m'] * k:.1f} {unit} | max {s['max_vel_mps']:.0f} m/s | max {s['max_acc_g']:.1f} g")
    fig.suptitle(title, x=0.01, ha="left", color=INK, fontsize=12, weight="bold")
    fig.text(0.01, 0.945, sub, color=INK2, fontsize=9)
    fig.tight_layout(rect=(0, 0, 1, 0.94))
    out = args.out or str(Path(args.log).with_suffix(".png"))
    fig.savefig(out, dpi=140, facecolor=SURFACE)

    print(f"wrote {out}")
    for key, val in s.items():
        if val is not None:
            print(f"  {key:20s} {val:9.2f}")


if __name__ == "__main__":
    main()
