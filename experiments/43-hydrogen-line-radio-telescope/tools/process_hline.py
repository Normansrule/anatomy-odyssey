#!/usr/bin/env python3
"""Reduce hydrogen-line observations to spectra and a Milky Way rotation curve.

    python3 process_hline.py obs.json                 # real or synthetic observations
    python3 process_hline.py --selftest               # synthesise a galaxy, reduce it, check the answer

obs.json (written by synth_hline.py, or by hand for your own captures):
    {"fc_hz": 1420705751.8, "fs_hz": 2400000, "t_sys_k": 100,
     "files": [{"l_deg": 30, "b_deg": 0, "on": "on_l030.cu8", "off": "off_l030.cu8",
                "v_corr_kms": 12.3}, ...]}
v_corr_kms is the topocentric -> LSR correction; for real data compute it with
hline.lsr_correction(l, b, time, lat, lon) or leave it out and give "time", "lat", "lon".
Outputs images/hline-spectra.png, images/rotation-curve.png and a CSV of the rotation curve.
"""
from __future__ import annotations

import argparse
import json
import sys
import tempfile
from pathlib import Path

import numpy as np

import hline as H

HERE = Path(__file__).resolve().parent
IMG = HERE.parent / "images"
SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"


def reduce(obs_path: Path, nfft=2048):
    obs = json.loads(obs_path.read_text())
    base = obs_path.parent
    f = H.freq_axis(obs["fc_hz"], obs["fs_hz"], nfft)
    results = []
    for item in obs["files"]:
        on = H.mask_dc(H.average_spectrum(H.read_cu8(base / item["on"]), nfft))
        off = H.mask_dc(H.average_spectrum(H.read_cu8(base / item["off"]), nfft))
        t = H.calibrate(on, off, obs.get("t_sys_k", 100.0))
        vcorr = item.get("v_corr_kms")
        if vcorr is None:
            vcorr = H.lsr_correction(item["l_deg"], item.get("b_deg", 0.0), item["time"], item["lat"], item["lon"])
        v = H.velocity_axis(f) + vcorr                # LSR velocity of every channel
        order = np.argsort(v)
        v, t = v[order], t[order]
        t_bl, rms, used = H.baseline(v, t)
        ts = H.smooth(t_bl, 8)
        rms_s = float(np.std(ts[used]))
        vt = H.tangent_velocity(v, ts, rms_s, nsigma=5.0)
        results.append(dict(l=item["l_deg"], v=v, t=ts, rms=rms_s, v_t=vt, used=used,
                            true_R=item.get("true_R_kpc"), true_V=item.get("true_V_kms"),
                            N_HI=H.column_density(v[(v > -100) & (v < 200)], ts[(v > -100) & (v < 200)])))
    return results


def plot(results, tag=""):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    IMG.mkdir(exist_ok=True)
    # --- spectra, offset vertically (one axis, same units)
    fig, ax = plt.subplots(figsize=(9, 8), facecolor=SURFACE)
    ax.set_facecolor(SURFACE)
    step = 60
    for i, r in enumerate(results):
        k = (r["v"] > -150) & (r["v"] < 200)
        ax.plot(r["v"][k], r["t"][k] + i * step, color=BLUE, lw=1.1)
        ax.text(-148, i * step + 8, f"l = {r['l']:.0f}°", color=INK, fontsize=9)
        if np.isfinite(r["v_t"]):
            ax.plot([r["v_t"]], [i * step + 5 * r["rms"]], "|", color=ORANGE, ms=14, mew=2)
    ax.plot([], [], "|", color=ORANGE, ms=10, mew=2, label="tangent-point velocity (5 σ edge)")
    ax.axvline(0, color=INK2, lw=0.8)
    ax.set_xlabel("velocity relative to the Local Standard of Rest (km/s)", color=INK2)
    ax.set_ylabel(f"antenna temperature (K), offset {step} K per spectrum", color=INK2)
    ax.grid(True, color=GRID, lw=0.6)
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    ax.legend(frameon=False, loc="upper right")
    ax.set_title(f"21 cm spectra along the Galactic plane{tag}", loc="left", color=INK)
    fig.tight_layout()
    fig.savefig(IMG / "hline-spectra.png", dpi=140, facecolor=SURFACE)
    # --- rotation curve
    l = np.array([r["l"] for r in results])
    vt = np.array([r["v_t"] for r in results])
    R, V = H.rotation_curve(l, vt)
    fig, ax = plt.subplots(figsize=(8.5, 5), facecolor=SURFACE)
    ax.set_facecolor(SURFACE)
    Rm = np.linspace(0.5, 12, 200)
    ax.plot(Rm, H.V0_KMS * (1.00767 * (Rm / H.R0_KPC) ** 0.0394 + 0.00712), color=INK2, lw=1.2, ls=(0, (4, 3)),
            label="Brand & Blitz (1993) fit")
    kep = H.V0_KMS * np.sqrt(H.R0_KPC / Rm)
    ax.plot(Rm, kep, color=AQUA, lw=1.2, label="if all mass were at the centre (Keplerian, V ∝ R^-1/2)")
    ax.plot(R, V, "o", color=ORANGE, ms=8, mec=SURFACE, mew=1.5, label="this pipeline (tangent-point method)")
    ax.set_xlim(0, 12)
    ax.set_ylim(0, 400)
    ax.set_xlabel("galactocentric radius R = R0 sin l (kpc)", color=INK2)
    ax.set_ylabel("orbital speed V (km/s)", color=INK2)
    ax.grid(True, color=GRID, lw=0.6)
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    ax.legend(frameon=False, loc="upper right", fontsize=8.5)
    ax.set_title(f"Milky Way rotation curve{tag} — flat, not Keplerian: dark matter", loc="left", color=INK)
    fig.tight_layout()
    fig.savefig(IMG / "rotation-curve.png", dpi=140, facecolor=SURFACE)
    return R, V


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("obs", nargs="?")
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--csv", default=str(HERE.parent / "data" / "rotation_curve.csv"))
    args = ap.parse_args(argv)
    if args.selftest:
        import synth_hline
        td = tempfile.mkdtemp()
        synth_hline.main(["--out", td])
        obs = Path(td) / "obs.json"
        tag = " (synthetic data)"
    else:
        obs = Path(args.obs)
        tag = ""
    res = reduce(obs)
    R, V = plot(res, tag)
    if args.selftest:
        import shutil
        shutil.rmtree(td, ignore_errors=True)  # ~100 MB of synthetic IQ
    ok = True
    print(f"{'l':>5} {'v_t km/s':>9} {'R kpc':>6} {'V km/s':>7} {'true V':>7} {'rms K':>6} {'N_HI cm^-2':>11}")
    with open(args.csv, "w") as fh:
        fh.write("l_deg,v_tangent_kms,R_kpc,V_kms,rms_K,N_HI_cm2\n")
        for r, Ri, Vi in zip(res, R, V):
            tv = r["true_V"]
            print(f"{r['l']:5.0f} {r['v_t']:9.1f} {Ri:6.2f} {Vi:7.1f} {tv if tv else float('nan'):7.1f} {r['rms']:6.2f} {r['N_HI']:11.2e}")
            fh.write(f"{r['l']},{r['v_t']:.2f},{Ri:.3f},{Vi:.2f},{r['rms']:.3f},{r['N_HI']:.3e}\n")
            if args.selftest and (not np.isfinite(Vi) or abs(Vi - tv) > 25):
                ok = False
    if args.selftest:
        err = np.array([Vi - r["true_V"] for r, Vi in zip(res, V)])
        print(f"selftest: recovered V - true V = {err.mean():+.1f} +/- {err.std():.1f} km/s "
              "(the 5-sigma edge sits about one velocity dispersion, ~7 km/s, beyond the tangent velocity)")
        print("PASS" if ok else "FAIL")
        sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
