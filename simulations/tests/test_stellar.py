import numpy as np
import pytest

from cosmic import stellar
from cosmic.constants import L_SUN, R_SUN, T_SUN


def test_wien_peak_of_the_sun():
    assert stellar.wien_peak(T_SUN) * 1e9 == pytest.approx(502.0, abs=0.5)


def test_wien_peak_matches_planck_maximum():
    lam = np.linspace(300e-9, 900e-9, 60001)
    B = stellar.planck_lambda(lam, T_SUN)
    assert lam[np.argmax(B)] == pytest.approx(stellar.wien_peak(T_SUN), rel=1e-4)


def test_stefan_boltzmann_solar_luminosity():
    assert stellar.luminosity(R_SUN, T_SUN) == pytest.approx(L_SUN, rel=2e-3)


def test_planck_integral_equals_sigma_T4_over_pi():
    lam = np.geomspace(50e-9, 1e-3, 200000)
    total = np.trapezoid(stellar.planck_lambda(lam, 5000.0), lam) if hasattr(np, "trapezoid") else \
        np.trapz(stellar.planck_lambda(lam, 5000.0), lam)
    assert total * np.pi == pytest.approx(stellar.stefan_boltzmann_flux(5000.0), rel=1e-3)


def test_sun_blackbody_colour_is_near_white():
    rgb = stellar.blackbody_rgb(T_SUN)
    assert rgb.min() > 0.85 and rgb.max() == pytest.approx(1.0)
    assert rgb[0] >= rgb[2]          # slightly warm, never blue


def test_colour_trend_red_to_blue():
    cool, hot = stellar.blackbody_rgb(3000.0), stellar.blackbody_rgb(20000.0)
    assert cool[0] > cool[2] and hot[2] > hot[0]


def test_cie_table_is_equal_energy_balanced():
    s = stellar.CIE_XYZ.sum(axis=0)
    assert np.allclose(s / s.mean(), 1.0, atol=0.002)


def test_hr_population_main_sequence_sun():
    assert stellar.mass_luminosity(1.0) == pytest.approx(1.0)
    pop = stellar.synthetic_population()
    assert pop["T"].size == pop["L"].size > 3000
