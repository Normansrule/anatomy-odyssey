import numpy as np
import pytest

from cosmic import orbital_elements as oe
from cosmic.constants import AU, DAY, GM_EARTH, GM_SUN, R_EARTH


def test_keplers_third_law_earth_year():
    assert oe.period(AU, GM_SUN) / DAY == pytest.approx(365.2569, abs=1e-3)


def test_keplers_third_law_geo_is_one_sidereal_day():
    assert oe.period(42_164.17e3, GM_EARTH) == pytest.approx(86_164.1, abs=2.0)


def test_circular_and_escape_velocity():
    r = R_EARTH + 300e3
    assert oe.circular_velocity(r) / 1e3 == pytest.approx(7.726, abs=2e-3)
    assert oe.escape_velocity(R_EARTH) / 1e3 == pytest.approx(11.18, abs=1e-2)
    assert oe.escape_velocity(r) == pytest.approx(np.sqrt(2) * oe.circular_velocity(r))


def test_elements_state_round_trip():
    rng = np.random.default_rng(0)
    for _ in range(25):
        a = rng.uniform(7000e3, 40000e3)
        e = rng.uniform(0.01, 0.8)
        i, raan, argp, nu = rng.uniform(0.05, 3.0), rng.uniform(0, 6.2), rng.uniform(0, 6.2), rng.uniform(0, 6.2)
        r, v = oe.coe2rv(a, e, i, raan, argp, nu)
        el = oe.rv2coe(r, v)
        assert el.a == pytest.approx(a, rel=1e-9)
        assert el.e == pytest.approx(e, abs=1e-9)
        for x, y in [(el.i, i), (el.raan, raan), (el.argp, argp), (el.nu, nu)]:
            assert np.cos(x - y) == pytest.approx(1.0, abs=1e-9)


def test_vis_viva_energy_constant_along_orbit():
    el = oe.Elements(12000e3, 0.3, 0.5, 1.0, 2.0, 0.0)
    r, v = oe.propagate(el, np.linspace(0, oe.period(el.a), 50), j2=False)
    eps = 0.5 * np.sum(v**2, 1) - GM_EARTH / np.linalg.norm(r, axis=1)
    assert np.allclose(eps, -GM_EARTH / (2 * el.a), rtol=1e-9)


def test_iss_nodal_regression_about_minus_five_degrees_per_day():
    el = oe.iss_elements()
    draan, _, _ = oe.j2_rates(el.a, el.e, el.i)
    assert np.degrees(draan) * 86400 == pytest.approx(-5.0, abs=0.15)


def test_land_mask_loads():
    m = oe.load_land_mask()
    assert m.shape == (720, 1440)
    assert 0.25 < m.mean() < 0.4
