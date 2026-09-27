#!/usr/bin/env python3
"""Tests for balloon.py:  python3 test_balloon.py  (or pytest)"""
import math
import sys

import balloon as B


def test_isa_layers():
    for h, p in ((0, 101325.0), (11000, 22632.06), (20000, 5474.889), (32000, 868.0187)):
        assert abs(B.isa(h)[0] - p) / p < 1e-4, (h, B.isa(h)[0])
    assert abs(B.isa(11000)[1] - 216.65) < 1e-6


def test_part101_rules():
    P = B.Package
    assert B.part101_check([P(1.2, (200, 200, 200))])[0]                       # light, big box
    assert not B.part101_check([P(2.0, (100, 100, 60))])[0]                    # > 4 lb and > 3 oz/in^2
    assert B.part101_check([P(2.5, (250, 250, 250))])[0]                       # 5.5 lb but only 1.4 oz/in^2
    assert not B.part101_check([P(2.8, (300, 300, 300))])[0]                   # > 6 lb
    assert not B.part101_check([P(2.5, (300,) * 3), P(2.5, (300,) * 3), P(0.6, (300,) * 3)])[0]  # > 12 lb total
    assert not B.part101_check([P(1.0, (200,) * 3)], line_break_lbf=80)[0]     # line too strong


def test_burst_altitude_physics():
    # bigger burst diameter -> higher burst; more free lift -> faster ascent, lower burst
    a = B.simulate(burst_d=5.0)
    b = B.simulate(burst_d=7.0)
    c = B.simulate(free_lift_kg=2.0)
    assert b["burst_alt_m"] > a["burst_alt_m"]
    assert c["ascent_mps_launch"] > a["ascent_mps_launch"] and c["burst_alt_m"] < B.simulate()["burst_alt_m"]
    # burst condition: V0 * rho0 / rho(h_burst) == pi/6 D^3
    r = B.simulate()
    rho0 = B.isa(700.0)[2]
    assert abs(r["V0_m3"] * rho0 / B.isa(r["burst_alt_m"])[2] - math.pi / 6 * 6.0 ** 3) < 0.01


def test_descent_rate():
    r = B.simulate()
    m = 1.2 + 0.06
    v = math.sqrt(2 * m * B.G0 / (B.isa(700.0)[2] * 1.5 * math.pi * 1.2 ** 2 / 4))
    assert abs(r["landing_mps"] - v) < 1e-9


if __name__ == "__main__":
    fails = 0
    for k, f in list(globals().items()):
        if k.startswith("test_"):
            try:
                f()
                print("PASS", k)
            except Exception as e:  # noqa: BLE001
                fails += 1
                print("FAIL", k, repr(e))
    sys.exit(1 if fails else 0)
