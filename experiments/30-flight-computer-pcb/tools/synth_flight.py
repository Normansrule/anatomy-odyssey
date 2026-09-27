#!/usr/bin/env python3
"""Synthetic rocket flight generator for testing the CC-FL1 flight logic without flying.

It integrates a 1-D vertical flight (thrust, gravity, quadratic drag, recovery descent) at
1 kHz and samples *simulated sensors* at 100 Hz exactly like the flight logger does:

  * BMP390-like barometer: ISA pressure at the launch-site elevation + white noise
  * LSM6DSO32-like accelerometer: specific force (what an accelerometer really measures),
    +-32 g clipping, noise and bias; gyroscope with a slow boost roll
  * optional nasties: a pad "bump" (someone knocks the rail), an ejection-event pressure and
    shock spike near apogee, extra noise

The motor is an ILLUSTRATIVE thrust curve (roughly H-class, ~280 N s). It is not a real motor.
Recovery is modelled only as a change of drag area (drogue at apogee + 1 s, main at 150 m) -
how a certified commercial altimeter deploys it is outside the scope of this repo.

    python3 synth_flight.py -o ../data/synthetic_flight.csv            # nominal
    python3 synth_flight.py -o bump.csv --pad-bump --ejection-spike --seed 7

Writes <out>.csv (sensor samples) and <out>.truth.json (true event times / apogee).
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path

import numpy as np

G0 = 9.80665
RHO0 = 1.225


def isa(h_msl):
    """ISA troposphere: (pressure Pa, density kg/m^3, temperature K)."""
    T = 288.15 - 0.0065 * h_msl
    p = 101325.0 * (T / 288.15) ** 5.25588
    return p, p / (287.053 * T), T


def thrust(t):
    """Illustrative 3-phase thrust curve (N): ignition spike, 1.6 s sustain, tail-off. Not a real motor."""
    if t < 0:
        return 0.0
    if t < 0.05:
        return 230.0 * t / 0.05
    if t < 0.25:
        return 230.0 - 60.0 * (t - 0.05) / 0.20
    if t < 1.65:
        return 170.0 - 15.0 * (t - 0.25) / 1.40
    if t < 1.90:
        return 155.0 * (1.90 - t) / 0.25
    return 0.0


def simulate(args):
    rng = np.random.default_rng(args.seed)
    dt = 0.001
    t_launch = args.pad_time
    m_dry, m_prop = 1.55, 0.14
    tburn = 1.90
    thr = np.array([thrust(i * dt) for i in range(int(tburn / dt) + 2)])
    cum = np.concatenate([[0.0], np.cumsum(thr) * dt])      # impulse delivered so far
    impulse = float(cum[-1])
    area = math.pi * (0.041 / 2) ** 2
    cd_body = 0.55
    cda_drogue = 2 * G0 * m_dry / (RHO0 * 22.0 ** 2)   # ~22 m/s under drogue
    cda_main = 2 * G0 * m_dry / (RHO0 * 6.0 ** 2)      # ~6 m/s under main
    h = v = 0.0
    t = 0.0
    phase = "pad"
    truth = {"impulse_Ns": round(impulse, 1), "site_elevation_m": args.elevation}
    t_apogee = None
    drogue_t = None
    main_out = False
    rows = []
    next_sample = 0.0
    gyro_bias = rng.normal(0, 0.5, 3)
    acc_bias = rng.normal(0, 0.01, 3)
    while True:
        tf = t - t_launch
        burnt = cum[min(int(tf / dt), len(cum) - 1)] / impulse if tf > 0 else 0.0
        m = m_dry + m_prop * (1.0 - burnt)   # propellant mass burns in proportion to impulse
        _, rho, _ = isa(args.elevation + h)
        F = thrust(tf) if phase in ("pad", "boost") else 0.0
        cda = cd_body * area
        if drogue_t is not None and t >= drogue_t:
            cda = cda_drogue
        if main_out:
            cda = cda_main
        drag = 0.5 * rho * v * abs(v) * cda
        if phase == "pad":
            a = 0.0
            if F > m * G0 * 1.05:
                phase = "boost"
                truth["launch_s"] = round(t, 3)
        if phase != "pad" and phase != "landed":
            a = (F - drag) / m - G0
        if phase == "landed":
            a = 0.0
        # specific force along the body axis (what the accelerometer reads)
        f_axial = (F - drag) / m / G0 if phase not in ("pad", "landed") else 1.0
        # --- 100 Hz sensor sample
        if t >= next_sample - 1e-9:
            next_sample += 0.01
            p, _, _ = isa(args.elevation + h)
            p += rng.normal(0, args.baro_noise)
            ax, ay, az = f_axial, 0.0, 0.0
            if drogue_t is not None and t >= drogue_t:        # hanging sideways under the canopy
                fd = drag / m / G0
                ax, ay, az = 0.2 * fd, 0.95 * fd, 0.2 * fd
            if phase == "landed":
                ax, ay, az = 0.05, 0.99, 0.1                  # lying on its side
            if args.pad_bump and abs(t - args.pad_time * 0.5) < 0.03:
                ax += 4.0                                   # someone knocks the launch rail
            if args.ejection_spike and drogue_t is not None and 0 <= t - drogue_t < 0.03:
                ax += rng.normal(0, 12.0); ay += rng.normal(0, 12.0)
            if args.ejection_spike and drogue_t is not None and 0 <= t - drogue_t < 0.12:
                p += 180.0                                  # bay pressure pulse at deployment
            acc = np.array([ax, ay, az]) + acc_bias + rng.normal(0, args.acc_noise, 3)
            acc = np.clip(acc, -32.0, 32.0)
            roll = 720.0 if phase == "boost" else (200.0 * math.exp(-(tf - tburn)) if phase == "coast" else 0.0)
            gyro = np.array([roll, 0.0, 0.0]) + gyro_bias + rng.normal(0, 0.3, 3)
            rows.append((int(round(t * 1000)), p, 25.0 - 0.0065 * h, *acc, *gyro, h, v, a))
        # --- integrate (semi-implicit Euler)
        if phase in ("boost", "coast", "descent"):
            v += a * dt
            h += v * dt
        if phase == "boost" and tf > tburn:
            phase = "coast"
            truth["burnout_s"] = round(t, 3)
        if phase == "coast" and v <= 0:
            phase = "descent"
            t_apogee = t
            truth["apogee_s"] = round(t, 3)
            truth["apogee_m"] = round(float(h), 2)
            drogue_t = t + 1.0
        if phase == "descent" and not main_out and drogue_t is not None and t > drogue_t and h < 150.0:
            main_out = True
            truth["main_s"] = round(t, 3)
        if phase == "descent" and h <= 0.0:
            h, v = 0.0, 0.0
            phase = "landed"
            truth["landed_s"] = round(t, 3)
        if phase == "boost" and v < 0 and h <= 0:
            h, v = 0.0, 0.0
        t += dt
        if phase == "landed" and t > truth["landed_s"] + args.post_land:
            break
        if t > 600:
            raise RuntimeError("simulation did not land")
    truth["max_velocity_mps"] = round(float(max(r[-2] for r in rows)), 2)
    truth["max_accel_g"] = round(float(max(r[-1] for r in rows)) / G0 + 1, 2)
    return rows, truth


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("-o", "--out", default="synthetic_flight.csv")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--elevation", type=float, default=600.0, help="launch site elevation, m MSL")
    ap.add_argument("--pad-time", type=float, default=5.0, help="seconds of pad data before ignition")
    ap.add_argument("--post-land", type=float, default=15.0)
    ap.add_argument("--baro-noise", type=float, default=2.5, help="Pa, 1-sigma")
    ap.add_argument("--acc-noise", type=float, default=0.02, help="g, 1-sigma")
    ap.add_argument("--pad-bump", action="store_true")
    ap.add_argument("--ejection-spike", action="store_true")
    args = ap.parse_args()
    rows, truth = simulate(args)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w") as f:
        f.write("t_ms,pressure_pa,temp_c,ax_g,ay_g,az_g,gx_dps,gy_dps,gz_dps,true_alt_m,true_vel_mps,true_acc_mps2\n")
        for r in rows:
            f.write("%d,%.2f,%.2f,%.4f,%.4f,%.4f,%.2f,%.2f,%.2f,%.3f,%.3f,%.3f\n" % r)
    truth["samples"] = len(rows)
    out.with_suffix(".truth.json").write_text(json.dumps(truth, indent=2) + "\n")
    print(f"wrote {out} ({len(rows)} samples)  truth: {truth}")


if __name__ == "__main__":
    main()
