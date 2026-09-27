#!/usr/bin/env python3
"""Plot and summarise a flight logged by the Pico altimeter.

    python3 plot_flight.py flight_001.csv                 # → flight_001.png + printed summary
    python3 plot_flight.py ../data/synthetic_flight.csv -o ../images/synthetic_flight.png

The script recomputes altitude from the raw pressure column (so you can change the
reference pressure or formula later), smooths it with a centred moving average, and
differentiates to get vertical velocity. It reports apogee, time to apogee, the
fastest ascent speed seen by the barometer, ejection time, and descent rate.

Requires: numpy, matplotlib.
"""
import argparse, csv, os
import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

# ISA troposphere constants (same as firmware/flightlogic.py)
T0, LAPSE, EXPONENT = 288.15, 0.0065, 0.190263

INK, INK2, MUTED, GRID, SURF = "#e9edff", "#c3cae6", "#8f98bd", "#1b2238", "#0b0f1c"
ICE, FLAME, AURORA, NEBULA = "#7cc8ff", "#ff7a3d", "#4ef0b8", "#b18cff"


def load(path):
    with open(path) as f:
        rows = list(csv.DictReader(f))
    t = np.array([float(r["t_s"]) for r in rows])
    p = np.array([float(r["pressure_pa"]) for r in rows])
    state = np.array([r.get("state", "") for r in rows])
    return t, p, state


def smooth(y, n):
    if n < 2:
        return y.copy()
    k = np.ones(n) / n
    pad = n // 2
    yp = np.concatenate([np.full(pad, y[0]), y, np.full(n - 1 - pad, y[-1])])
    return np.convolve(yp, k, mode="valid")


def analyse(t, p):
    p0 = np.median(p[t < -0.5]) if np.any(t < -0.5) else p[0]
    h = (T0 / LAPSE) * (1 - (p / p0) ** EXPONENT)
    dt = np.median(np.diff(t))
    hs = smooth(h, max(1, int(round(0.2 / dt))))          # 0.2 s window
    v = np.gradient(hs, t)
    vs = smooth(v, max(1, int(round(0.3 / dt))))
    i_ap = int(np.argmax(hs))
    i_vmax = int(np.argmax(vs[: i_ap + 1]))
    # descent rate: median speed from 3 s after apogee until 1 m above the landing level
    ground = np.median(hs[-max(5, int(2 / dt)):])
    desc = (t > t[i_ap] + 3) & (hs > ground + 1)
    rate = float(-np.median(vs[desc])) if desc.any() else float("nan")
    return dict(p0=p0, h=h, hs=hs, v=vs, i_ap=i_ap, i_vmax=i_vmax, descent=rate, ground=ground)


def plot(t, a, out, title):
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10})
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(9, 6.4), sharex=True, dpi=130,
                                   gridspec_kw=dict(height_ratios=[3, 2], hspace=0.08), facecolor=SURF)
    for ax in (ax1, ax2):
        ax.set_facecolor(SURF)
        ax.grid(True, color=GRID, lw=0.8)
        for s in ax.spines.values():
            s.set_visible(False)
        ax.tick_params(colors=MUTED, length=0)
    ax1.plot(t, a["h"], color=ICE, lw=0.8, alpha=0.35, label="raw (from pressure)")
    ax1.plot(t, a["hs"], color=ICE, lw=2, label="smoothed 0.2 s")
    ia, iv = a["i_ap"], a["i_vmax"]
    ax1.plot(t[ia], a["hs"][ia], "o", ms=8, color=FLAME, mec=SURF, mew=2)
    ax1.annotate(f"apogee {a['hs'][ia]:.1f} m\nat T+{t[ia]:.2f} s", (t[ia], a["hs"][ia]), xytext=(14, 2),
                 textcoords="offset points", color=INK, fontsize=10, va="bottom")
    ax1.set_ylim(top=a["hs"][ia] * 1.18 + 1)
    ax1.set_ylabel("altitude above pad (m)", color=INK2)
    ax1.legend(loc="upper right", frameon=False, labelcolor=INK2)
    ax1.set_title(title, color=INK, loc="left", fontsize=12, pad=10)

    ax2.axhline(0, color=MUTED, lw=0.8)
    ax2.plot(t, a["v"], color=AURORA, lw=2)
    ax2.plot(t[iv], a["v"][iv], "o", ms=8, color=FLAME, mec=SURF, mew=2)
    ax2.annotate(f"max {a['v'][iv]:.0f} m/s", (t[iv], a["v"][iv]), xytext=(10, -2), textcoords="offset points",
                 color=INK, fontsize=10, va="top")
    if np.isfinite(a["descent"]):
        ax2.annotate(f"descent ≈ {a['descent']:.1f} m/s under parachute", (t[ia] + 8, -a["descent"]),
                     xytext=(0, 10), textcoords="offset points", color=INK2, fontsize=9)
    ax2.set_ylabel("vertical speed (m/s)", color=INK2)
    ax2.set_xlabel("time since launch (s)", color=INK2)
    fig.align_ylabels((ax1, ax2))
    fig.savefig(out, facecolor=SURF, bbox_inches="tight")
    plt.close(fig)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv")
    ap.add_argument("-o", "--out")
    ap.add_argument("--title")
    a_ = ap.parse_args()
    t, p, _ = load(a_.csv)
    a = analyse(t, p)
    out = a_.out or os.path.splitext(a_.csv)[0] + ".png"
    title = a_.title or os.path.basename(a_.csv)
    plot(t, a, out, title)
    ia = a["i_ap"]
    print(f"pad pressure        {a['p0']:.1f} Pa")
    print(f"apogee              {a['hs'][ia]:.1f} m  ({a['hs'][ia] * 3.28084:.0f} ft) at T+{t[ia]:.2f} s")
    print(f"max ascent speed    {a['v'][a['i_vmax']]:.1f} m/s at T+{t[a['i_vmax']]:.2f} s (barometric — lags the truth)")
    print(f"descent rate        {a['descent']:.2f} m/s")
    print(f"landing level       {a['ground']:.1f} m relative to the pad")
    print("wrote", out)


if __name__ == "__main__":
    main()
