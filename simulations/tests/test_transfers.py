import numpy as np
import pytest

from cosmic import transfers as tr
from cosmic.constants import AU, MU_EARTH_KM, R_EARTH_KM


def test_hohmann_leo_to_geo():
    dv1, dv2, dv, t = tr.hohmann(R_EARTH_KM + 300.0, 42_164.0)
    assert dv == pytest.approx(3.89, abs=0.01)
    assert dv1 == pytest.approx(2.426, abs=2e-3)
    assert t / 3600 == pytest.approx(5.28, abs=0.02)


def test_bielliptic_beats_hohmann_only_for_large_ratios():
    r1 = 7000.0
    assert tr.bielliptic(r1, 5 * r1, 1e6 * r1)[3] > tr.hohmann(r1, 5 * r1)[2]
    assert tr.bielliptic(r1, 20 * r1, 60 * r1)[3] < tr.hohmann(r1, 20 * r1)[2]


def test_lambert_curtis_example_5_2():
    v1, v2 = tr.lambert(np.array([5000.0, 10000.0, 2100.0]), np.array([-14600.0, 2500.0, 7000.0]), 3600.0,
                        mu=MU_EARTH_KM)
    assert np.allclose(v1, [-5.9925, 1.9254, 3.2456], atol=1e-3)
    assert np.allclose(v2, [-3.3125, -4.1966, -0.38529], atol=1e-3)


def test_lambert_recovers_a_propagated_orbit():
    from cosmic.orbital_elements import coe2rv, propagate, Elements

    el = Elements(9000.0, 0.2, 0.4, 0.3, 1.1, 0.2)
    t = 2400.0
    r, v = propagate(el, np.array([0.0, t]), mu=MU_EARTH_KM, j2=False)
    v1, v2 = tr.lambert(r[0], r[1], t, mu=MU_EARTH_KM)
    assert np.allclose(v1, v[0], atol=1e-6)
    assert np.allclose(v2, v[1], atol=1e-6)


def test_standish_earth_distance_at_j2000():
    r, v = tr.planet_state("earth", 2451545.0)
    assert np.linalg.norm(r) * 1e3 / AU == pytest.approx(0.9833, abs=2e-3)   # early January: near perihelion
    assert np.linalg.norm(v) == pytest.approx(30.29, abs=0.05)


def test_2026_mars_window_c3():
    jd0 = tr.date_to_jd("2026-09-15")
    jdd, jda, c3, vinf = tr.porkchop_grid(jd0, jd0 + 120, jd0 + 200, jd0 + 500, 60, 60)
    assert 7.0 < np.nanmin(c3) < 12.0
