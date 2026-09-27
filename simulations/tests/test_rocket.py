import pytest

from cosmic import rocket_ascent as ra


def test_us_standard_atmosphere_1976():
    T, p, rho, a = ra.atmosphere(0.0)
    assert (T, p, rho) == (pytest.approx(288.15), pytest.approx(101325.0), pytest.approx(1.225, abs=1e-3))
    assert a == pytest.approx(340.29, abs=0.05)
    T, p, rho, a = ra.atmosphere(11_019.0)        # geopotential 11 km: tropopause
    assert T == pytest.approx(216.65, abs=0.05) and p == pytest.approx(22632, rel=1e-3)
    T, p, rho, a = ra.atmosphere(50_000.0)
    assert rho == pytest.approx(1.027e-3, rel=0.01)


def test_drag_coefficient_peaks_transonic():
    assert ra.drag_coefficient(1.1) > ra.drag_coefficient(0.3)
    assert ra.drag_coefficient(1.1) > ra.drag_coefficient(4.0)


def test_saturn_v_reaches_parking_orbit():
    data, events, orbit = ra.simulate(ra.saturn_v(), dt=0.2)
    assert orbit["perigee_km"] > 150 and orbit["apogee_km"] < 260
    labels = [lab for _, lab in events]
    assert "orbit insertion" in labels
    t_ins = [t for t, lab in events if lab == "orbit insertion"][0]
    assert t_ins == pytest.approx(709, abs=40)        # AS-506: insertion at T+709.3 s
    assert 25e3 < data["q"].max() < 45e3              # AS-506 Max-Q ~35 kPa
