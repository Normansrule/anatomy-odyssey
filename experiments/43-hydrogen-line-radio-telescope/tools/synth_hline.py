#!/usr/bin/env python3
"""Synthetic hydrogen-line observations: a model Milky Way seen through a model receiver.

For each galactic longitude it writes two RTL-SDR-format IQ files (ON = pointing at the Galactic
plane, OFF = a cold reference) and a JSON describing them, so process_hline.py can be tested end to
end with nothing but a computer.

Model galaxy:  rotation curve of Brand & Blitz (1993), V/V0 = 1.00767 (R/R0)^0.0394 + 0.00712;
               HI in a flat disc between ~3 and ~16 kpc, velocity dispersion 7 km/s, optically thin,
               scaled so the brightest profiles peak near 80 K.
Model receiver: T_sys = 100 K, a rippled bandpass with RTL-SDR-like band edges, 8-bit quantisation,
               a DC spike, a 1 % gain drift between ON and OFF, and a known LSR offset.

    python3 synth_hline.py --out /tmp/hline_synth         # writes obs.json + *.cu8
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

import hline as H

FS = 2.4e6
FC = H.F_HI - 0.1e6          # tune 100 kHz low: band covers about -175..+215 km/s; DC spike at +21 km/s is masked
T_SYS = 100.0
SIGMA_V = 7.0


def v_model(R):
    return H.V0_KMS * (1.00767 * (R / H.R0_KPC) ** 0.0394 + 0.00712)


def n_hi(R):
    """Relative HI density: a plateau from ~4 to ~16 kpc and a thinner inner disc (the real Galaxy has an
    HI 'hole' partly filled by molecular gas inside ~3-4 kpc)."""
    inner = 0.35 + 0.65 / (1 + np.exp(-(R - 3.5) / 0.6))
    return inner / (1 + np.exp((R - 15.5) / 1.2))


def brightness(l_deg, v_axis):
    """Brightness temperature (K) vs LSR velocity along the line of sight at longitude l, b = 0."""
    l = np.radians(l_deg)
    s = np.linspace(0.05, 30, 3000)                     # kpc along the line of sight
    R = np.sqrt(H.R0_KPC ** 2 + s ** 2 - 2 * H.R0_KPC * s * np.cos(l))
    v_r = (v_model(R) * H.R0_KPC / R - v_model(H.R0_KPC)) * np.sin(l)
    w = n_hi(R) * (s[1] - s[0])
    prof = np.exp(-0.5 * ((v_axis[:, None] - v_r[None, :]) / SIGMA_V) ** 2) / (np.sqrt(2 * np.pi) * SIGMA_V)
    return 300.0 * (prof * w[None, :]).sum(axis=1)      # scale -> peaks of ~50-100 K


def bandpass(f_if):
    x = f_if / (FS / 2)
    edge = 1 / (1 + np.exp((np.abs(x) - 0.9) / 0.025))    # RTL-SDR decimation-filter roll-off
    ripple = 1 + 0.04 * np.sin(2 * np.pi * f_if / 0.37e6 + 0.4) + 0.06 * x   # SAW + cable ripple, tilt
    return edge * ripple


def make_iq(psd, n, rng, gain=1.0):
    """Complex Gaussian noise with the given power spectral density (on an n-point grid), 8-bit quantised."""
    white = (rng.standard_normal(n) + 1j * rng.standard_normal(n)).astype(np.complex64)
    X = np.fft.fft(white) * np.sqrt(np.fft.ifftshift(psd)).astype(np.float32)
    iq = np.fft.ifft(X) * np.sqrt(gain)
    iq += 0.02 * np.std(iq)                          # DC offset -> the familiar centre spike
    scale = 35.0 / np.std(iq.real)                  # the SDR's gain puts the noise at ~35 counts rms
    I = np.clip(np.round(iq.real * scale + 127.5), 0, 255).astype(np.uint8)
    Q = np.clip(np.round(iq.imag * scale + 127.5), 0, 255).astype(np.uint8)
    out = np.empty(2 * n, np.uint8)
    out[0::2], out[1::2] = I, Q
    return out


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="hline_synth")
    ap.add_argument("--longitudes", default="20,30,40,50,60,70,80")
    ap.add_argument("--log2n", type=int, default=22, help="samples per capture = 2^n (22 -> 1.75 s)")
    ap.add_argument("--seed", type=int, default=21)
    ap.add_argument("--v-lsr-offset", type=float, default=-14.2,
                    help="km/s: observed = LSR - offset, as if the Earth's motion were -offset along the line of sight")
    args = ap.parse_args(argv)
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(args.seed)
    n = 2 ** args.log2n
    f_if = np.fft.fftshift(np.fft.fftfreq(n, 1 / FS))
    f_rf = FC + f_if
    v_topo = H.velocity_axis(f_rf)
    obs = {"fc_hz": FC, "fs_hz": FS, "t_sys_k": T_SYS, "files": [], "model": "Brand & Blitz 1993 rotation curve"}
    G = bandpass(f_if)
    for l in [float(x) for x in args.longitudes.split(",")]:
        v_lsr = v_topo + args.v_lsr_offset      # what each topocentric channel corresponds to in the LSR
        v_grid = np.arange(-400.0, 400.0, 0.25)
        Tb = np.interp(v_lsr, v_grid, brightness(l, v_grid))
        on = make_iq(G * (T_SYS + 0.85 * Tb), n, rng)              # 0.85 = main-beam efficiency
        off = make_iq(G * T_SYS, n, rng, gain=1.01)                # 1 % gain drift
        fo, ff = out / f"on_l{int(l):03d}.cu8", out / f"off_l{int(l):03d}.cu8"
        on.tofile(fo)
        off.tofile(ff)
        R = H.R0_KPC * np.sin(np.radians(l))
        obs["files"].append({"l_deg": l, "b_deg": 0.0, "on": fo.name, "off": ff.name, "v_corr_kms": args.v_lsr_offset,
                             "true_R_kpc": R, "true_V_kms": float(v_model(R))})
        print(f"l = {l:4.0f}  peak Tb {Tb.max():5.1f} K  -> {fo.name}, {ff.name}")
    (out / "obs.json").write_text(json.dumps(obs, indent=1))
    print("wrote", out / "obs.json")


if __name__ == "__main__":
    main()
