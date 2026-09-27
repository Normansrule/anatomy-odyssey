#!/usr/bin/env python3
"""Synthetic model-rocket flight → barometer samples, for testing the logger without flying.

    python3 synth_flight.py                        # writes ../data/synthetic_flight.csv
    python3 synth_flight.py --noise 5 --seed 3 -o my.csv

Physics (1-D, vertical):  m dv/dt = T(t) − m g − ½ ρ(h) v|v| Cd A
  * thrust: a D-class-like curve (≈ 17 N·s, 1.7 s burn) — illustrative, NOT a real motor file;
    use a real curve from thrustcurve.org for real predictions
  * ejection at burnout + delay; then a parachute (Cd·A chosen for ≈ 4.5 m/s descent)
  * pressure from the International Standard Atmosphere, plus Gaussian sensor noise,
    a small ejection-charge pressure spike and ±2 ms sample jitter
The output uses the SAME columns as the flight logger (it runs the real firmware
flightlogic.FlightDetector on the samples), so plot_flight.py treats it like a real flight.
"""
import argparse, math, os, sys
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "firmware"))
from flightlogic import FlightDetector, STATE_NAMES, PAD, T0, LAPSE, EXPONENT  # noqa: E402

G = 9.80665
# (time s, thrust N): peaky start then a sustain phase, like most black-powder motors
THRUST = [(0.0, 0.0), (0.05, 6.0), (0.25, 26.0), (0.38, 29.0), (0.50, 16.0), (0.70, 10.5),
          (1.50, 9.8), (1.65, 4.0), (1.72, 0.0)]


def thrust(t):
    if t <= 0 or t >= THRUST[-1][0]:
        return 0.0
    for (t0, f0), (t1, f1) in zip(THRUST, THRUST[1:]):
        if t0 <= t <= t1:
            return f0 + (f1 - f0) * (t - t0) / (t1 - t0)
    return 0.0


def pressure(h, p0=101325.0):
    return p0 * (1 - LAPSE * h / T0) ** (1 / EXPONENT)


def rho(h):
    T = T0 - LAPSE * h
    return pressure(h) / (287.05 * T)


def simulate(m_wet=0.170, m_prop=0.0125, dia=0.0416, cd=0.55, delay=5.0, chute_cda=0.13,
             pad_s=12.0, hz=50.0, noise_pa=3.0, seed=1, p0=101325.0):
    """Return dict of arrays: t, p (sensor), h_true, and the true event times."""
    rng = np.random.default_rng(seed)
    A = math.pi * dia ** 2 / 4
    burn = THRUST[-1][0]
    dt = 0.001
    t, h, v = 0.0, 0.0, 0.0
    traj_t, traj_h = [], []
    t_eject = burn + delay
    t_apogee, h_max = None, 0.0
    landed_t = None
    while True:
        m = m_wet - m_prop * min(t, burn) / burn
        F = thrust(t)
        drag_area = cd * A if t < t_eject else chute_cda
        D = 0.5 * rho(h) * v * abs(v) * drag_area
        a = (F - D) / m - G
        if h <= 0 and a < 0 and t < 0.5:          # still on the pad until thrust > weight
            a, v = 0.0, 0.0
        v += a * dt
        h += v * dt
        if h > h_max:
            h_max, t_apogee = h, t
        if h < 0 and t > 1.0:
            h, landed_t = 0.0, t
            break
        traj_t.append(t); traj_h.append(h)
        t += dt
    traj_t, traj_h = np.array(traj_t), np.array(traj_h)
    # sample: pad_s of pad time, the flight, then 8 s on the ground
    ts = np.arange(-pad_s, landed_t + 8.0, 1 / hz)
    ts = ts + rng.uniform(-0.002, 0.002, size=ts.size)
    hs = np.interp(ts, traj_t, traj_h, left=0.0, right=0.0)
    ps = pressure(hs, p0) + rng.normal(0, noise_pa, size=ts.size)
    # ejection-charge spike: brief over-pressure inside the airframe (≈ +60 Pa for 80 ms)
    spike = (ts > t_eject) & (ts < t_eject + 0.08)
    ps[spike] += 60.0
    liftoff = traj_t[np.argmax(traj_h > 0.01)]
    return dict(t=ts, p=ps, h_true=hs, t_liftoff=liftoff, t_apogee=t_apogee, h_apogee=h_max,
                t_eject=t_eject, t_landed=landed_t)


def run_detector(sim, **kw):
    """Run the real firmware logic over the samples; return (detector, rows, event log)."""
    det = FlightDetector(**kw)
    rows, log = [], []
    t_offset = 100.0                       # the Pico's clock is not zero at ignition
    for t, p in zip(sim["t"], sim["p"]):
        ev = det.update(t + t_offset, p)
        for e in ev:
            log.append((e, t))
        rows.append((t + t_offset, p, det.alt, det.alt_f, det.vel, det.state))
    return det, rows, log


def write_logger_csv(path, det, rows, pre_s=2.0):
    """Write exactly what main.py would write: 2 s of pad history + the flight."""
    t_l = det.t_launch
    with open(path, "w") as f:
        f.write("t_s,pressure_pa,temp_c,alt_m,alt_filt_m,vel_mps,state\n")
        for t, p, alt, alt_f, vel, st in rows:
            if t - t_l < -pre_s:
                continue
            if det.t_landed is not None and t > det.t_landed + det.land_time + 0.05:
                break
            f.write("%.3f,%.1f,%.2f,%.2f,%.2f,%.2f,%s\n" % (t - t_l, p, 21.5, alt, alt_f, vel, STATE_NAMES[st]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-o", "--out", default=os.path.join(HERE, "..", "data", "synthetic_flight.csv"))
    ap.add_argument("--noise", type=float, default=3.0, help="sensor noise, Pa (BMP390 ≈ 2–3, BMP280 ≈ 5)")
    ap.add_argument("--seed", type=int, default=1)
    a = ap.parse_args()
    sim = simulate(noise_pa=a.noise, seed=a.seed)
    det, rows, log = run_detector(sim)
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    write_logger_csv(a.out, det, rows)
    print(f"true: liftoff {sim['t_liftoff']:.2f} s, apogee {sim['h_apogee']:.1f} m at {sim['t_apogee']:.2f} s, "
          f"ejection {sim['t_eject']:.2f} s, landed {sim['t_landed']:.1f} s")
    print("detector:", ", ".join(f"{e}@{t:.2f}s" for e, t in log),
          f"| launch est. {det.t_launch - 100:.2f} s, apogee {det.apogee_alt:.1f} m at {det.t_apogee - 100:.2f} s")
    print("wrote", os.path.relpath(a.out))


if __name__ == "__main__":
    main()
