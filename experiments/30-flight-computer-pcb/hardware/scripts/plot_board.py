"""Render the board placement (top + bottom) with pads, courtyards and the ratsnest.

    python3 plot_board.py [out.png]

Uses KiCad's pcbnew module to read the board, matplotlib to draw it.
The dashed ratsnest lines are the connections you still have to route.
"""

from __future__ import annotations

import math
import sys
from collections import defaultdict
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, Rectangle

import design as D

HERE = Path(__file__).resolve().parent
OX, OY = 100.0, 100.0


def mst(points):
    """Prim's minimum spanning tree -> list of (i, j) edges (what KiCad's ratsnest shows)."""
    if len(points) < 2:
        return []
    inside, edges = {0}, []
    while len(inside) < len(points):
        best = None
        for i in inside:
            for j in range(len(points)):
                if j in inside:
                    continue
                d = math.dist(points[i], points[j])
                if best is None or d < best[0]:
                    best = (d, i, j)
        inside.add(best[2])
        edges.append(best[1:])
    return edges


def main(out):
    import pcbnew
    board = pcbnew.LoadBoard(str(HERE.parent / "kicad" / f"{D.PROJECT}.kicad_pcb"))
    to = lambda v: pcbnew.ToMM(v)
    fig, axes = plt.subplots(2, 1, figsize=(12, 9.6), facecolor="#0b0f1a")
    for ax, side, title in ((axes[0], pcbnew.F_Cu, "TOP (F.Cu) - components side"),
                            (axes[1], pcbnew.B_Cu, "BOTTOM (B.Cu) - viewed from the top, i.e. X-ray view")):
        ax.set_facecolor("#0b3d20")
        ax.add_patch(FancyBboxPatch((0, 0), D.BOARD_W, D.BOARD_H, boxstyle="round,pad=0,rounding_size=1.5",
                                    fc="#0f5a2e", ec="#e8e3c8", lw=1.5))
        net_pts = defaultdict(list)
        for fp in board.GetFootprints():
            on_side = fp.GetLayer() == side
            bb = fp.GetBoundingBox(False, False)
            x0, y0 = to(bb.GetX()) - OX, to(bb.GetY()) - OY
            w, h = to(bb.GetWidth()), to(bb.GetHeight())
            if on_side:
                ax.add_patch(Rectangle((x0, y0), w, h, fc="none", ec="#f5d76e", lw=0.8, ls="-"))
                ref = fp.GetReference()
                cx, cy = to(fp.GetPosition().x) - OX, to(fp.GetPosition().y) - OY
                size = 9 if ref == "U1" else 6.5
                ax.text(cx, cy, ref if ref != "U1" else "U1  Raspberry Pi Pico", color="white", fontsize=size,
                        ha="center", va="center", weight="bold", zorder=5)
            for pad in fp.Pads():
                layers = pad.GetLayerSet()
                if not layers.Contains(side):
                    continue
                pb = pad.GetBoundingBox()
                px, py = to(pb.GetX()) - OX, to(pb.GetY()) - OY
                pw, ph = to(pb.GetWidth()), to(pb.GetHeight())
                colour = "#d4a017" if pad.GetNetname() else "#8a8a8a"
                if pad.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH:
                    colour = "#222"
                ax.add_patch(Rectangle((px, py), pw, ph, fc=colour, ec="none", zorder=3))
                if pad.GetNetname() and pad.GetNetname() != "GND":
                    c = pad.GetPosition()
                    net_pts[pad.GetNetname()].append((to(c.x) - OX, to(c.y) - OY))
        for net, pts in net_pts.items():
            for i, j in mst(pts):
                (x1, y1), (x2, y2) = pts[i], pts[j]
                ax.plot([x1, x2], [y1, y2], color="#7fd3ff", lw=0.5, ls="--", alpha=0.8, zorder=4)
        ax.set_xlim(-2, D.BOARD_W + 2)
        ax.set_ylim(D.BOARD_H + 2, -2)
        ax.set_aspect("equal")
        ax.set_title(title, color="white", fontsize=11, loc="left")
        ax.tick_params(colors="#9aa4b2", labelsize=7)
        for s in ax.spines.values():
            s.set_color("#334")
        ax.set_xlabel("mm  (rocket axis ->, nose at the right)", color="#9aa4b2", fontsize=8)
    fig.suptitle("CC-FL1 flight logger - 80 x 30 mm, placement + ratsnest (GND pours not drawn)",
                 color="white", fontsize=12, x=0.02, ha="left")
    fig.tight_layout()
    fig.savefig(out, dpi=150, facecolor=fig.get_facecolor())
    print("wrote", out)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else str(HERE.parent.parent / "images" / "pcb-placement.png"))
