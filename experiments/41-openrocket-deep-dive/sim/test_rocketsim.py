#!/usr/bin/env python3
"""Tests: the simulators against closed-form physics.  python3 test_rocketsim.py  (or pytest)

1. .eng parsing: impulse = trapezoid area by hand; curve must end at zero thrust
2. Boost with no drag and no gravity losses removed analytically: the rocket equation
3. Coast with quadratic drag in constant density: exact closed-form apogee gain
4. Barrowman: cone CP at 2/3 L, ogive at 0.466 L, fin normal force by hand
5. 1-DOF == 2-DOF == 3-DOF when the rail is vertical and there is no wind
6. Wind: the 3-DOF model weathercocks less than the point-mass 2-DOF model
7. Chute descent rate = sqrt(2 m g / (rho Cd A))
"""
from __future__ import annotations

import math
import sys
import tempfile
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import barrowman as B  # noqa: E402
import example_rocket as E  # noqa: E402
import rocketsim as R  # noqa: E402
import sim3dof as S  # noqa: E402


def write_eng(text):
    f = tempfile.NamedTemporaryFile("w", suffix=".eng", delete=False)
    f.write(text)
    f.close()
    return f.name


def test_eng_parsing():
    m = E.motor()
    # trapezoids of the 13 tabulated points (values rounded to 0.01 N in the file): 292.6245 N*s
    pts = [(0, 0), (0.02, 92), (0.05, 230), (0.1, 215), (0.25, 170), (0.5, 167.32), (0.75, 164.64), (1.0, 161.96),
           (1.25, 159.29), (1.5, 156.61), (1.65, 155), (1.75, 93), (1.85, 31), (1.9, 0)]
    by_hand = sum((t2 - t1) * (f1 + f2) / 2 for (t1, f1), (t2, f2) in zip(pts, pts[1:]))
    assert abs(m.total_impulse - by_hand) < 1e-9 and abs(by_hand - 292.6245) < 1e-6
    assert abs(m.burn_time - 1.9) < 1e-12
    assert abs(m.mass(0) - 0.290) < 1e-12 and abs(m.mass(5) - 0.150) < 1e-12
    assert abs(m.impulse_to(0.05) - 0.5 * 0.02 * 92 - 0.03 * (92 + 230) / 2) < 1e-9
    try:
        R.Motor.from_eng(write_eng("BAD 38 250 0 0.1 0.2 X\n 0.5 100\n 1.0 50\n"))
        raise AssertionError("a curve without a final zero must be rejected")
    except ValueError:
        pass


def test_rocket_equation():
    """Constant thrust, no drag: v_b = v_e ln(m0/m1) - g t_b, with v_e = I / m_prop."""
    F, tb, mp, mt = 100.0, 2.0, 0.1, 0.25
    m = R.Motor.from_eng(write_eng(f"TEST 38 200 0 {mp} {mt} X\n 0.0001 {F}\n {tb} {F}\n {tb + 1e-4} 0\n"))
    rk = R.Rocket(dry_mass=0.75, diameter=0.04, cd0=0.0, mach_drag=False)
    res = R.simulate_1dof(rk, m, rail_length=0.0, dt=0.0005, descend=False)
    ve = m.total_impulse / mp
    m0, m1 = 0.75 + mt, 0.75 + mt - mp
    t_b = m.burn_time
    v_theory = ve * math.log(m0 / m1) - R.G0 * t_b
    v_sim = np.interp(t_b, res.t, res.vz)
    assert abs(v_sim - v_theory) / v_theory < 2e-3, (v_sim, v_theory)


def test_coast_with_drag():
    """From v0 with constant rho: h = m/(2k) ln(1 + k v0^2 / (m g)),  k = rho Cd A / 2."""
    m = R.Motor.from_eng(write_eng("KICK 38 100 0 0.0001 0.0002 X\n 0.001 20000\n 0.002 20000\n 0.0021 0\n"))
    rk = R.Rocket(dry_mass=1.0, diameter=0.05, cd0=0.6, mach_drag=False)
    atm = R.Atmosphere(const_rho=1.2)
    res = R.simulate_1dof(rk, m, atm, rail_length=0.0, dt=0.0002, descend=False)
    i0 = np.searchsorted(res.t, 0.01)
    v0, h0, mass = res.vz[i0], res.z[i0], 1.0 + m.mass(1)
    k = 0.5 * 1.2 * 0.6 * rk.area
    h_theory = h0 + mass / (2 * k) * math.log(1 + k * v0 ** 2 / (mass * R.G0))
    assert abs(res.apogee - h_theory) < 0.05, (res.apogee, h_theory)


def test_barrowman():
    assert abs(B.nose("cone", 0.3)[1] - 0.2) < 1e-12
    assert abs(B.nose("ogive", 1.0)[1] - 0.466) < 1e-12
    # square-ish fins by hand: N=4, Cr=Ct=0.1, s=0.1, sweep 0, d=0.1: Lf = 0.1
    f = B.Fins(n=4, root=0.1, tip=0.1, span=0.1, sweep=0.0, x_le=1.0)
    cn, x = B.fins(f, 0.1)
    cn_hand = 4 * 4 * 1.0 / (1 + math.sqrt(1 + 1.0)) * (1 + 0.05 / 0.15)
    assert abs(cn - cn_hand) < 1e-12
    assert abs(x - (1.0 + (0.2 - 0.05) / 6)) < 1e-12  # rectangular fin: quarter-chord-like point
    tot, xcp = B.cp([(2.0, 0.2), (cn, x)])
    assert abs(tot - (2 + cn)) < 1e-12 and 0.2 < xcp < x


def test_models_agree_without_wind():
    rk, m, af = E.rocket(), E.motor(), E.airframe()
    a1 = R.simulate_1dof(rk, m, descend=False).apogee
    a2 = R.simulate_2dof(rk, m, wind=0, descend=False).apogee
    a3 = S.simulate_3dof(rk, m, af, wind=0, dt_descent=0.2).apogee
    assert abs(a1 - a2) < 0.01 and abs(a1 - a3) / a1 < 0.002, (a1, a2, a3)


def test_weathercocking_ordering():
    rk, m, af = E.rocket(), E.motor(), E.airframe()
    x2 = R.simulate_2dof(rk, m, wind=5.0).events["apogee_x_m"]
    x3 = S.simulate_3dof(rk, m, af, wind=5.0, dt_descent=0.2).events["apogee_x_m"]
    assert x2 < x3 < 0, (x2, x3)  # both drift upwind, the point-mass model much more


def test_descent_rate():
    rk, m = E.rocket(), E.motor()
    res = R.simulate_1dof(rk, m)
    mass = rk.dry_mass + m.mass(10)
    rho = R.Atmosphere()(0)[0]
    v_theory = math.sqrt(2 * mass * R.G0 / (rho * (rk.chute_cd_area + rk.cd0 * rk.area)))
    assert abs(res.events["landing_mps"] - v_theory) / v_theory < 0.02


def test_openrocket_csv_parser():
    sys.path.insert(0, str(HERE.parent / "openrocket"))
    import compare_openrocket as C
    fixture = """# Simulation: test fixture (hand-written, not a real export)
# Time (s),Altitude (m),Vertical velocity (m/s),Total acceleration (m/s^2)
0,0,0,0
0.5,10.2,40.1,90.0
1.0,40.0,79.0,85.0
# Event APOGEE occurred at t=1.5 seconds
1.5,60.5,0.0,9.8
"""
    d = C.read_openrocket_csv(fixture)
    assert list(d["t"]) == [0, 0.5, 1.0, 1.5] and d["h"][-1] == 60.5 and d["vz"][1] == 40.1


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"FAIL {t.__name__}: {e!r}")
    print(f"{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
