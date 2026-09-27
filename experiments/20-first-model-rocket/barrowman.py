#!/usr/bin/env python3
"""Barrowman centre-of-pressure calculator + static-stability check.

    python3 barrowman.py                      # runs the two built-in examples
    python3 barrowman.py --cg 262             # your measured CG (mm from the nose tip)
    python3 barrowman.py --json myrocket.json # your own rocket (same keys as EXAMPLES below)

Method: J. S. Barrowman & J. A. Barrowman, "The Theoretical Prediction of the Center of
Pressure", NARAM-8 R&D report (1966); summarised in Estes TIR-33 and every OpenRocket
technical document. Subsonic, small angle of attack, body lift neglected (so it is
slightly conservative: the real CP is a little further aft).

All lengths in millimetres, measured from the nose tip.
    nose:  CN_alpha = 2,  X = L - V/A_base  (slender-body theory; = 2/3 L for a cone,
           0.466 L for a tangent ogive, ≈ 0.5 L for von Kármán)
    transition (shoulder or boat-tail) from diameter du to df, length L, starting at Xp:
           CN = 2 [ (df/d)^2 - (du/d)^2 ]
           X  = Xp + L/3 [ 1 + (1 - du/df) / (1 - (du/df)^2) ]
    fins (N fins, root Cr, tip Ct, semi-span S, sweep Xr = root LE → tip LE, root LE at Xb,
          body radius R at the fins, reference diameter d = nose base):
           CN = (1 + R/(S + R)) · 4 N (S/d)^2 / (1 + sqrt(1 + (2 Lf/(Cr + Ct))^2)),
                Lf = sqrt(S^2 + (Xr + Ct/2 - Cr/2)^2)      (mid-chord line length)
           X  = Xb + Xr (Cr + 2 Ct) / (3 (Cr + Ct)) + (1/6) [ (Cr + Ct) - Cr Ct / (Cr + Ct) ]
    total: X_cp = Σ CN_i X_i / Σ CN_i        stability margin = (X_cp - X_cg) / d   [calibers]
"""
import argparse, json, math

import numpy as np


def nose_profile(shape, x, L, R):
    t = np.clip(x / L, 0, 1)
    if shape == "conical":
        return R * t
    if shape == "ogive":
        rho = (R * R + L * L) / (2 * R)
        return np.sqrt(np.maximum(0, rho * rho - (L - x) ** 2)) + R - rho
    if shape == "elliptical":
        return R * np.sqrt(np.maximum(0, 1 - (1 - t) ** 2))
    if shape == "parabolic":
        return R * (2 * t - t * t)
    C = 1 / 3 if shape == "lvhaack" else 0.0          # von Kármán: C = 0
    th = np.arccos(1 - 2 * t)
    return R / math.sqrt(math.pi) * np.sqrt(np.maximum(0, th - np.sin(2 * th) / 2 + C * np.sin(th) ** 3))


def nose_cp(shape, L, d):
    """X_cp of a nose cone from slender-body theory: X = L - V / A_base."""
    x = np.linspace(0, L, 4001)
    r = nose_profile(shape, x, L, d / 2)
    V = np.trapezoid(np.pi * r * r, x) if hasattr(np, "trapezoid") else np.trapz(np.pi * r * r, x)
    return 2.0, L - V / (np.pi * (d / 2) ** 2)


def transition_cp(du, df, L, xp, d):
    cn = 2 * ((df / d) ** 2 - (du / d) ** 2)
    r = du / df
    x = xp + L / 3 * (1 + (1 - r) / (1 - r * r)) if abs(1 - r) > 1e-9 else xp + L / 2
    return cn, x


def fins_cp(n, cr, ct, s, xr, xb, R, d):
    lf = math.sqrt(s * s + (xr + ct / 2 - cr / 2) ** 2)
    cn = (1 + R / (s + R)) * (4 * n * (s / d) ** 2) / (1 + math.sqrt(1 + (2 * lf / (cr + ct)) ** 2))
    x = xb + xr * (cr + 2 * ct) / (3 * (cr + ct)) + (1 / 6) * ((cr + ct) - cr * ct / (cr + ct))
    return cn, x


def analyse(r, cg=None, verbose=True):
    d = r["diameter"]
    parts = []
    cn, x = nose_cp(r["nose"]["shape"], r["nose"]["length"], d)
    parts.append(("nose (%s)" % r["nose"]["shape"], cn, x))
    for t in r.get("transitions", []):
        cn, x = transition_cp(t["d_front"], t["d_rear"], t["length"], t["x"], d)
        parts.append(("transition @%g" % t["x"], cn, x))
    f = r["fins"]
    cn, x = fins_cp(f["count"], f["root"], f["tip"], f["span"], f["sweep"], f["x_root_le"], f.get("body_radius", d / 2), d)
    parts.append(("%d fins" % f["count"], cn, x))
    cn_tot = sum(p[1] for p in parts)
    xcp = sum(p[1] * p[2] for p in parts) / cn_tot
    cg = cg if cg is not None else r.get("cg")
    if verbose:
        print(f"\n{r['name']}  (d = {d} mm, length = {r['length']} mm)")
        for name, cn, x in parts:
            print(f"   {name:22s} CN_alpha = {cn:6.3f}   X = {x:7.1f} mm")
        print(f"   {'TOTAL':22s} CN_alpha = {cn_tot:6.3f}   X_cp = {xcp:7.1f} mm from the tip")
    if cg is None and "masses" in r:
        # CG from a mass budget: X_cg = Σ m_i x_i / Σ m_i
        mtot = sum(m for _, m, _ in r["masses"])
        cg = sum(m * x for _, m, x in r["masses"]) / mtot
        if verbose:
            print(f"   mass budget {mtot:.0f} g → CG ≈ {cg:.1f} mm from the tip (estimate — measure yours!)")
    if verbose:
        if cg is not None:
            m = (xcp - cg) / d
            verdict = ("UNSTABLE — add nose weight or bigger fins, do NOT fly" if m < 1.0 else
                       "stable (1–2 calibers is the sweet spot)" if m <= 2.0 else
                       "very stable — may weathercock into the wind; fine on calm days")
            print(f"   CG = {cg:.1f} mm  →  static margin = {m:.2f} calibers: {verdict}")
    return xcp, cn_tot


EXAMPLES = [
    {   # a BT-60, 18 mm-motor rocket built from the experiment-21 printed parts
        "name": "Cosmic Codex BT-60 (printed von Kármán nose + 3-fin can, 300 mm tube)",
        "diameter": 41.6, "length": 445.6,
        "nose": {"shape": "vonkarman", "length": 145.6},
        "fins": {"count": 3, "root": 85.2, "tip": 37.4, "span": 68.4, "sweep": 47.8,
                 "x_root_le": 445.6 - 85.2, "body_radius": 20.8},
        # [part, grams, x of that part's own CG in mm from the tip]; printed parts ≈ PLA/PETG
        "masses": [["nose cone", 25, 100], ["clay nose ballast", 15, 30], ["parachute + cord", 15, 200],
                   ["BT-60 tube 300 mm", 20, 295], ["printed fin can", 40, 400], ["printed motor mount", 12, 415],
                   ["D12 motor (loaded)", 44, 410]],
    },
    {   # a small BT-50 rocket with a printed ogive nose and fin can, 250 mm tube
        "name": "BT-50 sport rocket (printed ogive nose + 3-fin can, 250 mm tube)",
        "diameter": 24.8, "length": 336.8,
        "nose": {"shape": "ogive", "length": 86.8},
        "fins": {"count": 3, "root": 51.6, "tip": 22.3, "span": 41.3, "sweep": 29.3,
                 "x_root_le": 336.8 - 51.6, "body_radius": 12.4},
        "masses": [["nose cone", 7, 55], ["streamer + wadding", 8, 150], ["BT-50 tube 250 mm", 8, 212],
                   ["printed fin can", 14, 310], ["engine hook + block", 5, 300], ["C6 motor (loaded)", 24, 302]],
    },
]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", help="rocket description file (same keys as EXAMPLES)")
    ap.add_argument("--cg", type=float, help="measured CG, mm from the nose tip (loaded with motor)")
    a = ap.parse_args()
    rockets = [json.load(open(a.json))] if a.json else EXAMPLES
    # sanity check the nose integration against the textbook values
    for shape, expect in (("conical", 2 / 3), ("ogive", 0.466)):
        got = nose_cp(shape, 100.0, 25.0)[1] / 100
        assert abs(got - expect) < 0.005, (shape, got)
    for r in rockets:
        analyse(r, a.cg)


if __name__ == "__main__":
    main()
