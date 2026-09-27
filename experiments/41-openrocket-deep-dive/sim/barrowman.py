"""Barrowman's equations: subsonic centre of pressure (CP) of a finned rocket.

J. S. Barrowman & J. A. Barrowman, "The Theoretical Prediction of the Center of Pressure",
NARAM-8 R&D report (1966). Normal-force coefficient slopes C_N_alpha (per radian) and their
positions X (measured from the nose tip):

  nose cone      C_N = 2                     X = 0.666 L (cone), 0.466 L (tangent ogive), 0.5 L (parabolic / Haack)
  transition     C_N = 2 [(d_aft/d)^2 - (d_fwd/d)^2]
                 X = X_t + L_t/3 [1 + (1 - d_fwd/d_aft) / (1 - (d_fwd/d_aft)^2)]
  N fins         C_N = K_fb * 4 N (s/d)^2 / (1 + sqrt(1 + (2 L_f / (C_r + C_t))^2))
                 K_fb = 1 + R / (s + R)      (fin-body interference)
                 L_f = sqrt(s^2 + (X_R + C_t/2 - C_r/2)^2)   (mid-chord line length)
                 X = X_f + X_R (C_r + 2 C_t) / (3 (C_r + C_t)) + (C_r + C_t - C_r C_t / (C_r + C_t)) / 6
  body tube      contributes no normal force in Barrowman's small-angle theory

  X_CP = sum(C_N_i X_i) / sum(C_N_i);   stability margin = (X_CP - X_CG) / d   [calibres]
License: MIT
"""
from __future__ import annotations

import math
from dataclasses import dataclass

NOSE_CP_FRACTION = {"cone": 2 / 3, "ogive": 0.466, "parabolic": 0.5, "haack": 0.5, "vonkarman": 0.5}


@dataclass
class Fins:
    n: int              # number of fins
    root: float         # root chord C_r (m)
    tip: float          # tip chord C_t (m)
    span: float         # semi-span s (m), from body surface to tip
    sweep: float        # X_R: leading-edge sweep distance, root LE to tip LE (m)
    x_le: float         # root leading edge position from the nose tip (m)


def nose(shape: str, length: float):
    return 2.0, NOSE_CP_FRACTION[shape] * length


def transition(d_ref: float, d_fwd: float, d_aft: float, length: float, x_start: float):
    cn = 2.0 * ((d_aft / d_ref) ** 2 - (d_fwd / d_ref) ** 2)
    r = d_fwd / d_aft
    x = x_start + length / 3 * (1 + (1 - r) / (1 - r * r)) if r != 1 else x_start + length / 2
    return cn, x


def fins(f: Fins, d_body: float):
    R = d_body / 2
    s, cr, ct = f.span, f.root, f.tip
    lf = math.sqrt(s ** 2 + (f.sweep + ct / 2 - cr / 2) ** 2)
    cn = 4 * f.n * (s / d_body) ** 2 / (1 + math.sqrt(1 + (2 * lf / (cr + ct)) ** 2))
    k_fb = 1 + R / (s + R)
    x = f.x_le + f.sweep * (cr + 2 * ct) / (3 * (cr + ct)) + (cr + ct - cr * ct / (cr + ct)) / 6
    return cn * k_fb, x


def cp(components):
    """components: list of (C_N_alpha, X). Returns (total C_N_alpha, X_cp)."""
    total = sum(c for c, _ in components)
    return total, sum(c * x for c, x in components) / total


def cg(masses):
    """masses: list of (mass kg, position m). Returns (total mass, X_cg)."""
    m = sum(mi for mi, _ in masses)
    return m, sum(mi * xi for mi, xi in masses) / m
