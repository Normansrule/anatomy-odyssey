#!/usr/bin/env python3
"""Chart of motor impulse classes A-O on a log axis, coloured by the certification they need."""
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from pathlib import Path

SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
COL = {"none": "#b9b8b2", "L1": "#2a78d6", "L2": "#eb6834", "L3": "#1baf7a"}
LETTERS = "ABCDEFGHIJKLMNO"
fig, ax = plt.subplots(figsize=(10, 3.4), facecolor=SURFACE)
ax.set_facecolor(SURFACE)
for k, L in enumerate(LETTERS):
    lo, hi = 1.25 * 2 ** k, 2.5 * 2 ** k
    lvl = "none" if L <= "G" else "L1" if L in "HI" else "L2" if L in "JKL" else "L3"
    ax.barh(0, hi - lo, left=lo, height=0.6, color=COL[lvl], edgecolor=SURFACE, lw=2)
    ax.text((lo * hi) ** 0.5, 0, L, ha="center", va="center", color="white" if lvl != "none" else INK, weight="bold")
ax.set_xscale("log")
ax.set_xlim(1.2, 50000)
ax.set_yticks([])
ax.axvline(40960, color=INK, lw=1.2, ls="--")
ax.text(38000, -0.36, "FAA Class 2 limit 40 960 N·s →", ha="right", va="top", fontsize=8, color=INK2)
ax.set_ylim(-0.5, 0.35)
from matplotlib.patches import Patch
handles = [Patch(color=COL[lvl], label=lab) for lvl, lab in (
    ("none", "A–G: model rocket range (no certification*)"), ("L1", "Level 1: H, I"),
    ("L2", "Level 2: J, K, L (+ written exam)"), ("L3", "Level 3: M, N, O (+ reviewed project)"))]
ax.legend(handles=handles, frameon=False, loc="upper center", bbox_to_anchor=(0.5, -0.28), ncol=2, fontsize=9)
ax.set_xlabel("total impulse (N·s), log scale — each letter doubles", color=INK2)
for sp in ("top", "right", "left"):
    ax.spines[sp].set_visible(False)
ax.tick_params(colors=INK2)
ax.set_title("Motor impulse classes and the certification each one requires", loc="left", color=INK)
fig.tight_layout()
out = Path(__file__).resolve().parent.parent / "images" / "impulse-classes.png"
fig.savefig(out, dpi=140, facecolor=SURFACE)
print("wrote", out)
