import numpy as np
import pytest

from cosmic import exoplanet_transit as et


def test_bls_recovers_injected_period_within_one_percent():
    planet = et.Planet(period=2.7183, t0=0.9, rp_earth=3.5)
    t, f, e, _ = et.synthetic_light_curve(planet, seed=5)
    trend = et.running_median(t, f, 0.5)
    tb, yb, eb = et.bin_light_curve(t, f / trend, e, 15.0)
    res = et.bls(tb, yb, eb, p_min=1.0, p_max=8.0)
    assert res.best_period == pytest.approx(planet.period, rel=0.01)
    assert res.snr > 10
    rp = et.planet_radius(res.best_depth, planet.r_star)
    assert rp == pytest.approx(planet.rp_earth, rel=0.25)


def test_transit_depth_matches_radius_ratio():
    planet = et.Planet()
    t = np.linspace(planet.t0 - 0.2, planet.t0 + 0.2, 2001)
    f = et.transit_model(t, planet.period, planet.t0, planet.k, planet.a_over_rs, b=0.0, u1=0.0, u2=0.0)
    assert 1 - f.min() == pytest.approx(planet.k**2, rel=1e-6)
    # out of transit the flux is exactly 1
    assert f[0] == 1.0 and f[-1] == 1.0


def test_overlap_area_limits():
    assert et.overlap_area(0.1, np.array([0.0]))[0] == pytest.approx(np.pi * 0.01)
    assert et.overlap_area(0.1, np.array([1.2]))[0] == 0.0
    half = et.overlap_area(0.01, np.array([1.0]))[0]
    assert half == pytest.approx(0.5 * np.pi * 1e-4, rel=0.02)
