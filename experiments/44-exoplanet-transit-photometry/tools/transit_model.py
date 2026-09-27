"""Transit light-curve model: a dark planet crossing a limb-darkened star on a circular orbit.

Geometry: sky-projected separation (in stellar radii) z(t) = a/R* sqrt(sin^2 phi + cos^2 i cos^2 phi),
phi = 2 pi (t - t0) / P. Blocked flux = overlap area of two circles (exact, uniform disc) weighted by the
quadratic limb-darkening intensity at the planet's position, I(mu)/I0 = 1 - u1 (1 - mu) - u2 (1 - mu)^2,
normalised by the disc-averaged intensity (the "small-planet" approximation, accurate for Rp/R* <~ 0.15).
License: MIT
"""
from __future__ import annotations

import numpy as np


def overlap_area(z, p):
    """Area of overlap between a unit circle and a circle of radius p at centre distance z (vectorised)."""
    z = np.abs(np.asarray(z, float))
    area = np.zeros_like(z)
    full = z <= 1 - p
    area[full] = np.pi * p ** 2
    part = (z > 1 - p) & (z < 1 + p)
    zp = z[part]
    k0 = np.arccos(np.clip((p ** 2 + zp ** 2 - 1) / (2 * p * zp), -1, 1))
    k1 = np.arccos(np.clip((1 - p ** 2 + zp ** 2) / (2 * zp), -1, 1))
    area[part] = p ** 2 * k0 + k1 - 0.5 * np.sqrt(np.clip(4 * zp ** 2 - (1 + zp ** 2 - p ** 2) ** 2, 0, None))
    return area


def separation(t, t0, period, a_rs, inc_deg):
    phi = 2 * np.pi * (np.asarray(t, float) - t0) / period
    i = np.radians(inc_deg)
    z = a_rs * np.sqrt(np.sin(phi) ** 2 + (np.cos(i) * np.cos(phi)) ** 2)
    return np.where(np.cos(phi) > 0, z, 10.0)  # planet behind the star: no transit


def flux(t, t0, rp, a_rs, inc_deg, period, u1=0.45, u2=0.20):
    """Relative flux (1 out of transit)."""
    z = separation(t, t0, period, a_rs, inc_deg)
    r = np.clip(z, 0, 1)
    mu = np.sqrt(1 - r ** 2)
    intensity = 1 - u1 * (1 - mu) - u2 * (1 - mu) ** 2
    mean_intensity = 1 - u1 / 3 - u2 / 6                   # disc average of the quadratic law
    blocked = overlap_area(z, rp) / np.pi * intensity / mean_intensity
    return 1 - blocked


def duration_hours(period_days, a_rs, rp, inc_deg):
    """Total transit duration T14 (Seager & Mallen-Ornelas 2003)."""
    b = a_rs * np.cos(np.radians(inc_deg))
    arg = np.sqrt((1 + rp) ** 2 - b ** 2) / (a_rs * np.sin(np.radians(inc_deg)))
    return period_days * 24 / np.pi * np.arcsin(np.clip(arg, 0, 1))
