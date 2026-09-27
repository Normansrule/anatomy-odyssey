#!/usr/bin/env python3
"""Check the barn-door tangent correction.

1. Builds and runs the C++ host simulation (firmware/test/sim_tracker.cpp), which executes the
   firmware's own stepping rule from tracker_core.h for 60 minutes.
2. Compares it with the closed-form results:
     uncorrected error  e(t) = omega t - atan(omega t)         (~ (omega t)^3 / 3)
     corrected error    |e| <= one step = atan(L / (S R))
3. Prints when the uncorrected drive exceeds one pixel for several lenses, and plots both.

    python3 check_tangent.py            # asserts + images/tangent-error.png
Needs g++, numpy, matplotlib.
"""
from __future__ import annotations

import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
FW = HERE.parent / "firmware"
OMEGA = 2 * math.pi / 86164.0905
ARCSEC = 206264.806
R, LEAD, SPR = 228.6, 1.0, 64 * 63.68395


def run_sim() -> np.ndarray:
    with tempfile.TemporaryDirectory() as td:
        exe = Path(td) / "sim_tracker"
        subprocess.run(["g++", "-O2", "-std=c++17", "-Wall", "-Wextra", "-Werror", f"-I{FW / 'barn_door_tracker'}",
                        str(FW / "test" / "sim_tracker.cpp"), "-o", str(exe)], check=True)
        out = subprocess.run([str(exe)], check=True, capture_output=True, text=True).stdout
    rows = [list(map(float, l.split(","))) for l in out.strip().splitlines()[1:]]
    return np.array(rows)


def pixel_scale_arcsec(focal_mm, pixel_um=4.3):
    return ARCSEC * pixel_um * 1e-3 / focal_mm


def main():
    d = run_sim()
    t, e_cf, e_cd, e_un, steps = d.T
    analytic = -(OMEGA * t - np.arctan(OMEGA * t)) * ARCSEC
    one_step = math.atan(LEAD / SPR / R) * ARCSEC

    ok = True
    worst_c = max(np.abs(e_cf).max(), np.abs(e_cd).max())
    print(f"one half-step of the rod = {one_step:.3f} arcsec of board rotation")
    print(f"corrected drive, worst error over 60 min: float {np.abs(e_cf).max():.3f}\"  double {np.abs(e_cd).max():.3f}\"")
    if worst_c > one_step * 1.05:
        print("FAIL: corrected error exceeds one step")
        ok = False
    dev = np.abs(e_un - analytic).max()
    print(f"uncorrected drive: {e_un[-1]:.1f}\" after 60 min, analytic {analytic[-1]:.1f}\" (max deviation {dev:.3f}\")")
    if dev > one_step * 1.05:
        print("FAIL: uncorrected simulation disagrees with omega t - atan(omega t)")
        ok = False
    # small-angle check of the cubic approximation
    x = OMEGA * 3600
    print(f"cubic approximation (omega t)^3/3 at 60 min: {x ** 3 / 3 * ARCSEC:.1f}\"")
    rate0 = SPR * R * OMEGA / LEAD
    rate60 = rate0 / math.cos(OMEGA * 3600) ** 2
    print(f"step rate: {rate0:.2f} half-steps/s at the start, {rate60:.2f} after 60 min "
          f"(+{(rate60 / rate0 - 1) * 100:.1f} %; rod speed {rate0 / SPR * 60:.3f} rpm at the start)")
    print("\nuncorrected drive exceeds one pixel (4.3 um pixels) after:")
    for f in (24, 50, 135, 300):
        px = pixel_scale_arcsec(f)
        idx = np.argmax(np.abs(analytic) > px)
        print(f"  {f:4d} mm lens ({px:5.1f}\"/px): {t[idx] / 60:5.1f} min" if idx else f"  {f} mm: never within 60 min")

    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
    BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
    fig, (a1, a2) = plt.subplots(2, 1, figsize=(9, 7), sharex=True, facecolor=SURFACE,
                                 gridspec_kw={"height_ratios": [1.3, 1]})
    for ax in (a1, a2):
        ax.set_facecolor(SURFACE)
        ax.grid(True, color=GRID, lw=0.6)
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)
        ax.tick_params(colors=INK2)
    m = t / 60
    a1.plot(m, -analytic, color=INK2, lw=1.2, ls=(0, (4, 3)), label="closed form  ωt − atan(ωt)")
    a1.plot(m[::60], -e_un[::60], "o", color=ORANGE, ms=5, label="firmware stepping, constant speed")
    for f, ls, dy in ((50, ":", 22), (135, "-.", -30)):
        px = pixel_scale_arcsec(f)
        a1.axhline(px, color=BLUE, lw=1, ls=ls)
        a1.text(8, px + dy, f"1 pixel at {f} mm ({px:.0f}\")", color=INK2, fontsize=8)
    a1.set_ylabel("tracking lag (arcsec)", color=INK2)
    a1.set_title("Uncorrected barn door: the tangent error grows as t³", loc="left", color=INK, fontsize=11)
    a1.legend(frameon=False, loc="upper left")
    # the error is a sawtooth between 0 and -1 step; show its envelope per 30 s window
    w = 30
    n = len(m) // w * w
    mm = m[:n].reshape(-1, w).mean(1)
    for series, col, lab in ((e_cf, BLUE, "tangent-corrected, float maths (as on an Arduino Uno)"),
                             (e_cd, AQUA, "tangent-corrected, double maths")):
        lo, hi = series[:n].reshape(-1, w).min(1), series[:n].reshape(-1, w).max(1)
        a2.fill_between(mm, lo, hi, color=col, alpha=0.35, lw=0, label=lab + " (min-max per 30 s)")
    a2.axhline(-one_step, color=INK2, lw=1, ls="--")
    a2.text(1, -one_step - 0.03, "one half-step", color=INK2, fontsize=8, va="top")
    a2.set_ylim(-one_step * 1.6, one_step * 0.6)
    a2.set_ylabel("pointing error (arcsec)", color=INK2)
    a2.set_xlabel("minutes since the boards were closed", color=INK2)
    a2.set_title("Tangent-corrected: error stays within one step of the rod", loc="left", color=INK, fontsize=11)
    a2.legend(frameon=False, loc="lower right", fontsize=8)
    fig.tight_layout()
    out = HERE.parent / "images" / "tangent-error.png"
    fig.savefig(out, dpi=140, facecolor=SURFACE)
    print("\nwrote", out)
    print("PASS" if ok else "FAIL")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
