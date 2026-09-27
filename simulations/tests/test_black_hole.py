import numpy as np
import pytest

from cosmic import black_hole_raytracer as bh


def test_photon_sphere_is_circular_orbit_at_3M():
    # u = 1/3 makes u'' = 3u^2 - u vanish: a circular photon orbit at r = 3M
    u = 1 / bh.R_PHOTON
    assert 3 * u**2 - u == pytest.approx(0.0, abs=1e-15)
    # a ray aimed just outside the critical impact parameter grazes r = 3M
    r_min = bh.closest_approach(bh.B_CRIT * (1 + 1e-6))
    assert r_min == pytest.approx(3.0, abs=0.02)


def test_critical_impact_parameter_is_3_sqrt_3():
    assert bh.critical_impact_parameter() == pytest.approx(3 * np.sqrt(3), abs=1e-4)


def test_weak_field_deflection_is_4M_over_b():
    d = bh.deflection_angle(np.array([200.0, 2000.0]), dphi=5e-4)
    assert d[0] == pytest.approx(4 / 200, rel=0.03)
    assert d[1] == pytest.approx(4 / 2000, rel=0.01)


def test_novikov_thorne_flux_profile():
    r = np.array([5.0, 6.0, 6.01, 10.0, 100.0])
    F = bh.novikov_thorne_flux(r)
    assert F[0] == 0 and F[1] == 0 and F[2] >= 0
    assert F[3] > F[4] > 0
    # far from the hole: Newtonian F ~ 3/(8 pi r^3) (1 - sqrt(6/r))
    rr = 1e4
    assert bh.novikov_thorne_flux(rr) == pytest.approx(3 / (8 * np.pi * rr**3) * (1 - np.sqrt(6 / rr)), rel=2e-3)
    assert 9.0 < bh.R_FMAX < 10.0


def test_doppler_beaming_sign():
    # photon angular momentum along the disk rotation -> blueshift (g > 1)
    assert bh.redshift_factor(10.0, +9.0, 1e9) > 1 > bh.redshift_factor(10.0, -9.0, 1e9)
    assert bh.redshift_factor(10.0, +5.0, 1e9) > bh.redshift_factor(10.0, 0.0, 1e9)
    # pure gravitational + transverse Doppler for lambda = 0: sqrt(1 - 3M/r)
    assert bh.redshift_factor(10.0, 0.0, 1e12) == pytest.approx(np.sqrt(0.7))


def test_tiny_render_runs():
    sc = bh.Scene(width=64, height=36, supersample=1, stars=False)
    img = bh.Tracer(sc).render()
    assert img.shape == (36, 64, 3) and img.dtype == np.uint8
    assert img[18, 32].sum() < 30          # centre of the image is the shadow
    assert img.max() > 150                 # the disk is bright
