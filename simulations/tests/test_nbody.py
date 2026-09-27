import numpy as np
import pytest

from cosmic import nbody


def test_yoshida_conserves_energy_on_figure_eight():
    s = nbody.figure8()
    t, X, V, E = nbody.integrate(s, 0.002, int(nbody.FIGURE8_PERIOD / 0.002), "yoshida4", save_every=10)
    assert np.max(np.abs((E - E[0]) / E[0])) < 1e-9


def test_leapfrog_error_bounded_rk4_drifts():
    s = nbody.figure8()
    n = int(4 * nbody.FIGURE8_PERIOD / 0.02)
    _, _, _, El = nbody.integrate(s, 0.02, n, "leapfrog", save_every=5)
    _, _, _, Er = nbody.integrate(s, 0.02, n, "rk4", save_every=5)
    el = np.abs((El - El[0]) / El[0])
    er = np.abs((Er - Er[0]) / Er[0])
    q = len(el) // 4
    # symplectic: the worst error in the last period is no worse than in the first
    assert el[-q:].max() < 1.5 * el[:q].max()
    # RK4: error keeps growing from period to period
    assert er[-q:].max() > 2.0 * er[:q].max()


def test_figure_eight_is_periodic():
    s = nbody.figure8()
    dt = 0.001
    n = int(round(nbody.FIGURE8_PERIOD / dt))
    t, X, V, E = nbody.integrate(s, dt, n, "yoshida4", save_every=n)
    assert np.max(np.abs(X[-1] - X[0])) < 5e-3
    # the three bodies really share one path: centre of mass stays at the origin
    assert np.allclose(X[-1].mean(axis=0), 0, atol=1e-9)


def test_momentum_and_angular_momentum_conserved():
    s = nbody.circumbinary()
    t, X, V, E = nbody.integrate(s, 0.2 / 365.25, 400, "yoshida4", save_every=400)
    p0 = (s.m[:, None] * V[0]).sum(0)
    p1 = (s.m[:, None] * V[-1]).sum(0)
    assert np.allclose(p0, p1, atol=1e-12)
    L0 = nbody.angular_momentum(X[0], V[0], s.m)
    L1 = nbody.angular_momentum(X[-1], V[-1], s.m)
    assert L1 == pytest.approx(L0, rel=1e-10)


def test_solar_system_earth_year():
    s = nbody.inner_solar_system(with_jupiter=False)
    dt = 0.5 / 365.25
    t, X, V, E = nbody.integrate(s, dt, 732, "yoshida4", save_every=1)
    rel = X[:, 3] - X[:, 0]                      # Earth relative to the Sun
    ang = np.unwrap(np.arctan2(rel[:, 1], rel[:, 0]))
    t_year = np.interp(ang[0] + 2 * np.pi, ang, t)
    assert t_year * 365.25 == pytest.approx(365.26, abs=0.6)
    assert np.max(np.abs((E - E[0]) / E[0])) < 1e-6
