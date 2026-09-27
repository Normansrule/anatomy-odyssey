#!/usr/bin/env python3
"""LoRa (SX1276 / RFM95W) link budget and time-on-air calculator.

    python3 linkbudget.py                      # table for the default configuration
    python3 linkbudget.py --sf 10 --bw 125     # another configuration
    python3 linkbudget.py --plot ../images/link-budget.png

Formulas
--------
Receiver sensitivity (Semtech SX1276 datasheet / AN1200.22):
    S = -174 dBm/Hz + 10 log10(BW) + NF + SNR_min(SF)
Free-space path loss (Friis):
    FSPL = 20 log10(d) + 20 log10(f) - 147.55 dB      (d in m, f in Hz)
Two-ray "plane earth" loss (antennas low over flat ground, d beyond the breakpoint 4 h1 h2 / lambda):
    L = 40 log10(d) - 20 log10(h1 h2) dB
Time on air (Semtech AN1200.13):
    T_sym = 2^SF / BW
    n_payload = 8 + max(ceil((8 PL - 4 SF + 28 + 16 CRC - 20 IH) / (4 (SF - 2 DE))) (CR + 4), 0)
    T = (n_preamble + 4.25) T_sym + n_payload T_sym
"""
from __future__ import annotations

import argparse
import math

C = 299_792_458.0
SNR_MIN = {6: -5.0, 7: -7.5, 8: -10.0, 9: -12.5, 10: -15.0, 11: -17.5, 12: -20.0}  # dB, SX1276 demodulator


def sensitivity_dbm(sf: int, bw_hz: float, nf_db: float = 6.0) -> float:
    return -174.0 + 10 * math.log10(bw_hz) + nf_db + SNR_MIN[sf]


def noise_floor_dbm(bw_hz: float, nf_db: float = 6.0) -> float:
    return -174.0 + 10 * math.log10(bw_hz) + nf_db


def fspl_db(d_m: float, f_hz: float) -> float:
    return 20 * math.log10(max(d_m, 1.0)) + 20 * math.log10(f_hz) - 147.55


def plane_earth_db(d_m: float, h1: float, h2: float, f_hz: float) -> float:
    """Two-ray loss, never less than free space (inside the breakpoint the Friis term dominates)."""
    return max(fspl_db(d_m, f_hz), 40 * math.log10(max(d_m, 1.0)) - 20 * math.log10(h1 * h2))


def time_on_air_s(payload_len: int, sf: int, bw_hz: float, cr: int = 1, preamble: int = 8,
                  explicit_header: bool = True, crc: bool = True) -> float:
    t_sym = (2 ** sf) / bw_hz
    de = 1 if t_sym > 0.016 else 0  # low-data-rate optimisation, mandatory above 16 ms symbols
    ih = 0 if explicit_header else 1
    num = 8 * payload_len - 4 * sf + 28 + 16 * (1 if crc else 0) - 20 * ih
    n_payload = 8 + max(math.ceil(num / (4 * (sf - 2 * de))) * (cr + 4), 0)
    return (preamble + 4.25) * t_sym + n_payload * t_sym


def bit_rate(sf: int, bw_hz: float, cr: int = 1) -> float:
    return sf * bw_hz / 2 ** sf * 4 / (4 + cr)


def max_range_m(budget_db: float, f_hz: float) -> float:
    """Distance at which free-space loss equals the available budget."""
    return 10 ** ((budget_db - 20 * math.log10(f_hz) + 147.55) / 20)


def budget(args):
    f = args.freq_mhz * 1e6
    bw = args.bw_khz * 1e3
    s = sensitivity_dbm(args.sf, bw, args.nf)
    eirp = args.tx_dbm + args.tx_gain - args.tx_loss
    allowed = eirp + args.rx_gain - args.rx_loss - s - args.fade
    rows = [
        ("Frequency", f"{args.freq_mhz:.1f} MHz  (lambda = {C / f * 100:.1f} cm)"),
        ("Spreading factor / bandwidth / coding rate", f"SF{args.sf} / {args.bw_khz:.0f} kHz / 4/{4 + args.cr}"),
        ("Raw bit rate", f"{bit_rate(args.sf, bw, args.cr):,.0f} bit/s"),
        ("Time on air, 34-byte frame", f"{time_on_air_s(34, args.sf, bw, args.cr) * 1e3:.1f} ms"),
        ("Transmitter power", f"{args.tx_dbm:+.1f} dBm ({10 ** (args.tx_dbm / 10):.0f} mW)"),
        ("Rocket antenna gain - cable loss", f"{args.tx_gain:+.1f} - {args.tx_loss:.1f} dB"),
        ("EIRP", f"{eirp:+.1f} dBm"),
        ("Ground antenna gain - cable loss", f"{args.rx_gain:+.1f} - {args.rx_loss:.1f} dB"),
        ("Noise floor (kTB + NF)", f"{noise_floor_dbm(bw, args.nf):.1f} dBm"),
        ("Receiver sensitivity", f"{s:.1f} dBm  (SNR_min {SNR_MIN[args.sf]:+.1f} dB)"),
        ("Fade margin kept in reserve", f"{args.fade:.1f} dB"),
        ("Maximum allowed path loss", f"{allowed:.1f} dB"),
        ("Line-of-sight range (free space)", f"{max_range_m(allowed, f) / 1000:,.1f} km"),
    ]
    # ground-to-ground (rocket lying on the ground)
    lo, hi = 1.0, 1e6
    for _ in range(80):
        mid = math.sqrt(lo * hi)
        if plane_earth_db(mid, args.h_rocket, args.h_ground, f) < allowed:
            lo = mid
        else:
            hi = mid
    rows.append((f"Range with rocket on the ground (h = {args.h_rocket} m / {args.h_ground} m)", f"{lo / 1000:,.2f} km"))
    # FCC 15.247 power spectral density check for DTS operation
    psd = args.tx_dbm - 10 * math.log10(bw / 3e3)
    rows.append(("Power spectral density (15.247(e) limit 8 dBm / 3 kHz)", f"{psd:+.1f} dBm / 3 kHz"))
    return rows, allowed


def plot(args, out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import numpy as np
    SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
    BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"
    f = args.freq_mhz * 1e6
    d = np.logspace(1, 5, 400)
    eirp = args.tx_dbm + args.tx_gain - args.tx_loss
    rx_fs = eirp + args.rx_gain - args.rx_loss - np.array([fspl_db(x, f) for x in d])
    rx_ge = eirp + args.rx_gain - args.rx_loss - np.array([plane_earth_db(x, args.h_rocket, args.h_ground, f) for x in d])
    fig, ax = plt.subplots(figsize=(9, 5.2), facecolor=SURFACE)
    ax.set_facecolor(SURFACE)
    ax.semilogx(d / 1000, rx_fs, color=BLUE, lw=2, label="rocket in the air (free space)")
    ax.semilogx(d / 1000, rx_ge, color=ORANGE, lw=2, label=f"rocket on the ground (two-ray, {args.h_rocket} m / {args.h_ground} m)")
    for sf, ls in ((7, ":"), (9, "--"), (12, "-.")):
        s = sensitivity_dbm(sf, args.bw_khz * 1e3, args.nf)
        ax.axhline(s, color=INK2, lw=1, ls=ls)
        ax.text(0.011, s + 0.8, f"SF{sf} sensitivity {s:.0f} dBm", color=INK2, fontsize=8)
    ax.axhline(sensitivity_dbm(args.sf, args.bw_khz * 1e3, args.nf) + args.fade, color=AQUA, lw=1.5)
    ax.text(0.011, sensitivity_dbm(args.sf, args.bw_khz * 1e3, args.nf) + args.fade + 0.8,
            f"SF{args.sf} + {args.fade:.0f} dB fade margin", color=INK, fontsize=8)
    ax.set_xlabel("distance (km)", color=INK2)
    ax.set_ylabel("received power (dBm)", color=INK2)
    ax.grid(True, which="both", color=GRID, lw=0.6)
    for sp in ("top", "right"):
        ax.spines[sp].set_visible(False)
    ax.tick_params(colors=INK2)
    ax.legend(frameon=False, loc="upper right")
    ax.set_title(f"915 MHz LoRa link, {args.tx_dbm:.0f} dBm, BW {args.bw_khz:.0f} kHz, ground antenna {args.rx_gain:+.0f} dBi",
                 loc="left", color=INK, fontsize=11)
    ax.set_xlim(0.01, 100)
    fig.tight_layout()
    fig.savefig(out, dpi=140, facecolor=SURFACE)
    print("wrote", out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--freq-mhz", type=float, default=915.0)
    ap.add_argument("--sf", type=int, default=9, choices=sorted(SNR_MIN))
    ap.add_argument("--bw-khz", type=float, default=500.0)
    ap.add_argument("--cr", type=int, default=1, help="coding rate 4/(4+cr)")
    ap.add_argument("--tx-dbm", type=float, default=14.0)
    ap.add_argument("--tx-gain", type=float, default=-3.0, help="rocket antenna, dBi (a whip inside a tube, averaged over attitude)")
    ap.add_argument("--tx-loss", type=float, default=0.5)
    ap.add_argument("--rx-gain", type=float, default=6.0, help="ground antenna, dBi (small Yagi)")
    ap.add_argument("--rx-loss", type=float, default=1.5)
    ap.add_argument("--nf", type=float, default=6.0, help="receiver noise figure, dB")
    ap.add_argument("--fade", type=float, default=10.0)
    ap.add_argument("--h-rocket", type=float, default=0.3)
    ap.add_argument("--h-ground", type=float, default=2.0)
    ap.add_argument("--plot", help="write a received-power-vs-distance chart")
    args = ap.parse_args()
    rows, _ = budget(args)
    w = max(len(r[0]) for r in rows)
    for k, v in rows:
        print(f"{k:<{w}}  {v}")
    if args.plot:
        plot(args, args.plot)


if __name__ == "__main__":
    main()
