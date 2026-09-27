#!/usr/bin/env python3
"""Fit a power law to your crater measurements:  D = k · E^b   (log–log least squares).

    python3 fit_craters.py data-sheet.csv                 # your measurements
    python3 fit_craters.py --example                      # illustrative data → images/crater_fit.png
    python3 fit_craters.py --make-example                 # regenerate example-data-illustrative.csv

Reads the data-sheet columns: ball, ball_mass_g, ball_diameter_mm, drop_height_cm,
crater_d1_mm, crater_d2_mm  (crater diameter = mean of the two perpendicular measurements).

Impact energy  E = m g H,  with H = drop height (release point to flour surface).
Taking logs turns the power law into a straight line:  log D = log k + b · log E,
so the slope of the log–log plot IS the exponent b. Experiments with granular targets
(Uehara et al., Phys. Rev. Lett. 90, 194301, 2003) find b ≈ 1/4.

Requires: numpy, matplotlib.
"""
import argparse, csv, math, os
import numpy as np

G = 9.81
HERE = os.path.dirname(os.path.abspath(__file__))


def read(path):
    rows = []
    with open(path) as f:
        for r in csv.DictReader(f):
            try:
                m = float(r["ball_mass_g"]) / 1000
                h = float(r["drop_height_cm"]) / 100
                d = (float(r["crater_d1_mm"]) + float(r["crater_d2_mm"])) / 2
            except (ValueError, KeyError, TypeError):
                continue                                  # skip blank template rows
            rows.append(dict(ball=r["ball"], m=m, h=h, D=d, E=m * G * h))
    return rows


def fit(E, D):
    x, y = np.log10(E), np.log10(D)
    A = np.column_stack([np.ones_like(x), x])
    coef, res, *_ = np.linalg.lstsq(A, y, rcond=None)
    a, b = coef
    yhat = A @ coef
    n = len(x)
    s2 = np.sum((y - yhat) ** 2) / max(n - 2, 1)
    se_b = math.sqrt(s2 / np.sum((x - x.mean()) ** 2))
    r2 = 1 - np.sum((y - yhat) ** 2) / np.sum((y - y.mean()) ** 2)
    return 10 ** a, b, se_b, r2


def make_example(path):
    """Illustrative numbers generated from the Uehara (2003) law with 4 % scatter — NOT real data."""
    rng = np.random.default_rng(42)
    balls = [("glass marble", 5.2, 16.0), ("wooden bead", 3.1, 20.0), ("golf ball", 45.9, 42.7), ("steel ball", 28.2, 19.0)]
    rho_g, mu = 550.0, 0.8           # flour bulk density kg/m³, friction coefficient (tan of repose angle)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["trial", "ball", "ball_mass_g", "ball_diameter_mm", "drop_height_cm",
                    "crater_d1_mm", "crater_d2_mm", "ray_length_mm", "notes"])
        k = 1
        for name, mg, dmm in balls:
            vol = math.pi / 6 * (dmm / 1000) ** 3
            rho_b = mg / 1000 / vol
            for h in (10, 20, 40, 80, 160):
                H = h / 100 + dmm / 1000
                D = 0.90 * (rho_b / (mu ** 2 * rho_g)) ** 0.25 * (dmm / 1000) ** 0.75 * H ** 0.25 * 1000
                d1, d2 = D * rng.normal(1, 0.04), D * rng.normal(1, 0.04)
                w.writerow([k, name, mg, dmm, h, round(d1), round(d2), round(D * rng.uniform(1.8, 3.2)), "illustrative"])
                k += 1
    print("wrote", path)


def plot(rows, k, b, se, r2, out, title):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    SURF, INK, INK2, MUTED, GRID = "#0b0f1c", "#e9edff", "#c3cae6", "#8f98bd", "#1b2238"
    pal = ["#7cc8ff", "#ff7a3d", "#4ef0b8", "#b18cff", "#ffc24b"]
    markers = ["o", "s", "^", "D", "v"]
    fig, ax = plt.subplots(figsize=(8, 5.4), dpi=130, facecolor=SURF)
    ax.set_facecolor(SURF); ax.grid(True, which="both", color=GRID, lw=0.7)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(colors=MUTED, length=0, which="both")
    names = list(dict.fromkeys(r["ball"] for r in rows))
    for i, n in enumerate(names):
        E = [r["E"] for r in rows if r["ball"] == n]; D = [r["D"] for r in rows if r["ball"] == n]
        ax.loglog(E, D, markers[i % 5], ms=8, color=pal[i % 5], mec=SURF, mew=1.5, label=n, ls="none")
    E_all = np.array([r["E"] for r in rows])
    xs = np.logspace(np.log10(E_all.min()) - 0.1, np.log10(E_all.max()) + 0.1, 50)
    ax.loglog(xs, k * xs ** b, color=INK, lw=2)
    ax.text(0.03, 0.95, f"fit: D = {k:.1f} mm · E^{b:.3f}\nb = {b:.3f} ± {se:.3f}   R² = {r2:.3f}\ntheory (granular target): b = 0.25",
            transform=ax.transAxes, va="top", color=INK, fontsize=10, family="monospace")
    from matplotlib.ticker import FuncFormatter
    fmt = FuncFormatter(lambda v, _: f"{v:g}")
    for axis in (ax.xaxis, ax.yaxis):
        axis.set_major_formatter(fmt); axis.set_minor_formatter(FuncFormatter(lambda v, _: f"{v:g}" if str(f"{v:g}")[0] in "25" else ""))
    ax.set_xlabel("impact energy E = m g H  (joules, log scale)", color=INK2)
    ax.set_ylabel("crater diameter D  (mm, log scale)", color=INK2)
    ax.set_title(title, color=INK, loc="left", fontsize=12)
    ax.legend(frameon=False, labelcolor=INK2, loc="lower right")
    fig.savefig(out, facecolor=SURF, bbox_inches="tight"); plt.close(fig)
    print("wrote", out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?")
    ap.add_argument("--example", action="store_true")
    ap.add_argument("--make-example", action="store_true")
    ap.add_argument("-o", "--out")
    a = ap.parse_args()
    ex = os.path.join(HERE, "example-data-illustrative.csv")
    if a.make_example:
        make_example(ex); return
    path = ex if a.example else a.csv
    if not path:
        ap.error("give your data-sheet.csv, or --example")
    rows = read(path)
    if len(rows) < 3:
        raise SystemExit("need at least 3 complete rows")
    k, b, se, r2 = fit(np.array([r["E"] for r in rows]), np.array([r["D"] for r in rows]))
    print(f"{len(rows)} craters:  D = {k:.2f} mm × (E / 1 J)^{b:.3f}   (b = {b:.3f} ± {se:.3f}, R² = {r2:.3f})")
    print("granular-target theory predicts b ≈ 0.25; energy doubling → crater grows by 2^b =", f"{2 ** b:.3f}×")
    out = a.out or (os.path.join(HERE, "images", "crater_fit.png") if a.example else os.path.splitext(path)[0] + "_fit.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    plot(rows, k, b, se, r2, out, "Crater diameter vs impact energy" + ("  (illustrative data)" if a.example else ""))


if __name__ == "__main__":
    main()
