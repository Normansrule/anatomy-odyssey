#!/usr/bin/env python3
"""Overlay an OpenRocket simulation export on our 1-DOF and 3-DOF simulations.

In OpenRocket: run the simulation -> "Export data" (or Plot -> Export) -> CSV, with at least
"Time", "Altitude" and "Vertical velocity" selected, comments ON, field separator ",".
Then:

    python3 compare_openrocket.py my_export.csv [--wind 0] [--out ../images/openrocket-vs-python.png]

OpenRocket writes comment lines starting with '#'; the last comment line before the data holds the
column names, e.g. "# Time (s),Altitude (m),Vertical velocity (m/s),...". Units must be SI
(Preferences -> Units -> "Metric (SI)").
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "sim"))


def read_openrocket_csv(text: str):
    header, rows = None, []
    for line in text.splitlines():
        s = line.strip()
        if not s:
            continue
        if s.startswith("#"):
            body = s.lstrip("#").strip()
            if "Time" in body and "," in body:
                header = [h.strip() for h in body.split(",")]
            continue
        try:
            rows.append([float(x) if x.strip() not in ("", "NaN") else np.nan for x in s.split(",")])
        except ValueError:
            continue
    if header is None or not rows:
        raise ValueError("no '# Time ...' header or no data rows found - export with comments enabled")
    data = np.array(rows)

    def col(prefix):
        for i, h in enumerate(header):
            if h.lower().startswith(prefix.lower()):
                return data[:, i]
        raise KeyError(f"column starting with '{prefix}' not in {header}")

    return {"t": col("Time"), "h": col("Altitude"), "vz": col("Vertical velocity")}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("csv")
    ap.add_argument("--wind", type=float, default=0.0)
    ap.add_argument("--out", default=str(HERE.parent / "images" / "openrocket-vs-python.png"))
    args = ap.parse_args()

    import example_rocket as E
    import rocketsim as R
    import sim3dof as S
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    orc = read_openrocket_csv(Path(args.csv).read_text())
    rk, m, af = E.rocket(), E.motor(), E.airframe()
    r1 = R.simulate_1dof(rk, m)
    r3 = S.simulate_3dof(rk, m, af, wind=args.wind)
    ap_or = np.nanmax(orc["h"])
    print(f"apogee: OpenRocket {ap_or:.1f} m | 1-DOF {r1.apogee:.1f} m ({(r1.apogee / ap_or - 1) * 100:+.1f} %) | "
          f"3-DOF {r3.apogee:.1f} m ({(r3.apogee / ap_or - 1) * 100:+.1f} %)")
    fig, ax = plt.subplots(figsize=(9, 5), facecolor="#fcfcfb")
    ax.set_facecolor("#fcfcfb")
    tmax = r1.events.get("apogee_s", 20) + 10
    k = orc["t"] < tmax
    ax.plot(orc["t"][k], orc["h"][k], color="#52514e", lw=3, alpha=0.6, label=f"OpenRocket ({ap_or:.0f} m)")
    ax.plot(r1.t[r1.t < tmax], r1.z[r1.t < tmax], color="#2a78d6", lw=1.8, label=f"1-DOF ({r1.apogee:.0f} m)")
    ax.plot(r3.t[r3.t < tmax], r3.z[r3.t < tmax], color="#eb6834", lw=1.4, ls=(0, (4, 3)), label=f"3-DOF ({r3.apogee:.0f} m)")
    ax.set_xlabel("time (s)")
    ax.set_ylabel("altitude (m)")
    ax.grid(True, color="#e4e3df")
    ax.legend(frameon=False)
    fig.tight_layout()
    fig.savefig(args.out, dpi=140)
    print("wrote", args.out)


if __name__ == "__main__":
    main()
