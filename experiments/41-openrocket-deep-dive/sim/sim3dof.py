"""Planar 3-DOF flight: x, z and pitch - the smallest model that weathercocks realistically.

The body axis is no longer glued to the relative wind (as in the point-mass 2-DOF model). Instead
the fins' normal force, acting at the centre of pressure behind the centre of gravity, creates a
restoring moment, and aerodynamic + jet damping slow the oscillation (Barrowman dynamic stability):

    corrective moment   M_c = q A C_Na (X_cp - X_cg) sin(alpha)
    aerodynamic damping C2A = (rho V A / 2) * sum_i C_Na_i (X_i - X_cg)^2
    jet damping         C2R = mdot (X_nozzle - X_cg)^2
    I theta'' = -M_c - (C2A + C2R) theta'

Normal force F_N = q A C_Na sin(alpha), perpendicular to the body, at the CP. Axial drag uses the
same Cd(M) as the 1-/2-DOF models. Under the parachute the rocket is treated as a point mass.
License: MIT
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from rocketsim import G0, Atmosphere, Motor, Result, Rocket, wind_at


@dataclass
class Airframe:
    """Everything the pitch dynamics needs, derived from the geometry (see example_rocket.py)."""
    cn_alpha: float           # total normal-force slope (1/rad)
    x_cp: float               # m from the nose tip
    cn_parts: list            # [(C_Na_i, X_i)] for aerodynamic damping
    x_cg_dry: float           # CG without motor
    dry_mass: float
    i_dry: float              # pitch moment of inertia about x_cg_dry, without motor (kg m^2)
    motor_x: float            # motor centre position
    motor_len: float
    x_nozzle: float           # nozzle exit position


def mass_props(af: Airframe, motor: Motor, t: float):
    """Total mass, CG and pitch inertia at time t (motor modelled as a uniform cylinder)."""
    mm = motor.mass(t)
    m = af.dry_mass + mm
    x_cg = (af.dry_mass * af.x_cg_dry + mm * af.motor_x) / m
    i_motor = mm * af.motor_len ** 2 / 12
    I = (af.i_dry + af.dry_mass * (af.x_cg_dry - x_cg) ** 2 + i_motor + mm * (af.motor_x - x_cg) ** 2)
    return m, x_cg, I


def simulate_3dof(rocket: Rocket, motor: Motor, af: Airframe, atmos: Atmosphere | None = None, wind: float = 0.0,
                  rail_length: float = 1.8, rail_angle_deg: float = 0.0, dt_boost: float = 0.002,
                  dt_coast: float = 0.005, dt_descent: float = 0.1, t_max: float = 600.0) -> Result:
    atmos = atmos or Atmosphere()
    th0 = math.radians(rail_angle_deg)
    s = np.array([0.0, 0.0, 0.0, 0.0, th0, 0.0])  # x, z, vx, vz, theta (from vertical, + towards +x), q
    t = 0.0
    on_rail, deployed, burnout_seen = True, False, False
    ev: dict = {}
    T, X, Z, VX, VZ, A, M, TH = [], [], [], [], [], [], [], []
    mdot_scale = motor.prop_mass / motor.total_impulse if motor.total_impulse else 0.0

    def deriv(t, s):
        x, z, vx, vz, th, q = s
        rho, a_snd, _, _ = atmos(z)
        w = wind_at(z, wind)
        rvx, rvz = vx - w, vz
        V = math.hypot(rvx, rvz)
        m, x_cg, I = mass_props(af, motor, t)
        F = motor.thrust(t) if not deployed else 0.0
        bx, bz = math.sin(th), math.cos(th)            # body axis
        px, pz = math.cos(th), -math.sin(th)           # d(body)/d(theta)
        qd = 0.5 * rho * V * V
        if deployed:
            D = qd * (rocket.chute_cd_area + rocket.cd(V / a_snd) * rocket.area)
            ax = -D * rvx / V / m if V > 1e-6 else 0.0
            az = (-D * rvz / V / m if V > 1e-6 else 0.0) - G0
            return np.array([vx, vz, ax, az, 0.0, 0.0]), math.hypot(ax, az + G0)
        if on_rail:
            v_al = vx * bx + vz * bz
            acc = (F - 0.5 * rho * v_al * abs(v_al) * rocket.cd(abs(v_al) / a_snd) * rocket.area) / m - G0 * bz
            if v_al <= 0 and acc < 0:
                acc = 0.0
            return np.array([vx, vz, acc * bx, acc * bz, 0.0, 0.0]), acc
        fx, fz = F * bx, F * bz
        if V > 1e-6:
            D = qd * rocket.cd(V / a_snd) * rocket.area
            fx -= D * rvx / V
            fz -= D * rvz / V
            # normal force from the perpendicular part of the relative velocity: F_N = -q A C_Na v_perp / V
            along = rvx * bx + rvz * bz
            perp_x, perp_z = rvx - along * bx, rvz - along * bz
            k = qd * rocket.area * af.cn_alpha / V
            nx, nz = -k * perp_x, -k * perp_z
            fx += nx
            fz += nz
            l = af.x_cp - x_cg                         # CP behind CG (> 0 when stable)
            tau = -l * (nx * px + nz * pz)             # virtual work: tau = F . dr/dtheta at the CP
            c2a = 0.5 * rho * V * rocket.area * sum(c * (xi - x_cg) ** 2 for c, xi in af.cn_parts)
            c2r = mdot_scale * motor.thrust(t) * (af.x_nozzle - x_cg) ** 2
            qdot = (tau - (c2a + c2r) * q) / I
        else:
            qdot = 0.0
        ax, az = fx / m, fz / m - G0
        return np.array([vx, vz, ax, az, q, qdot]), math.hypot(ax, az + G0)

    while t < t_max:
        dt = dt_boost if (t < motor.burn_time + 0.3 or on_rail) else (dt_descent if deployed else dt_coast)
        k1, acc = deriv(t, s)
        k2, _ = deriv(t + dt / 2, s + dt / 2 * k1)
        k3, _ = deriv(t + dt / 2, s + dt / 2 * k2)
        k4, _ = deriv(t + dt, s + dt * k3)
        s_new = s + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        rho, a_snd, _, _ = atmos(s[1])
        T.append(t); X.append(s[0]); Z.append(s[1]); VX.append(s[2]); VZ.append(s[3]); A.append(acc); TH.append(s[4])
        M.append(math.hypot(s[2] - wind_at(s[1], wind), s[3]) / a_snd)
        t_new = t + dt
        if on_rail and math.hypot(s_new[0], s_new[1]) >= rail_length:
            on_rail = False
            ev["rail_exit_s"] = t_new
            ev["rail_exit_mps"] = float(math.hypot(s_new[2], s_new[3]))
        if not burnout_seen and t_new >= motor.burn_time:
            burnout_seen = True
            ev["burnout_s"] = t_new
            ev["burnout_mps"] = float(math.hypot(s_new[2], s_new[3]))
        if not on_rail and "apogee_s" not in ev and s_new[3] < 0 <= s[3]:
            ev["apogee_s"] = t_new
            ev["apogee_x_m"] = float(s_new[0])
            ev["optimal_delay_s"] = t_new - motor.burn_time
        if not deployed and rocket.chute_cd_area > 0 and "apogee_s" in ev:
            deployed = True
            ev["deploy_s"] = t_new
        s, t = s_new, t_new
        if s[1] < 0 and not on_rail and t > 1.0:
            ev["landing_s"] = t
            ev["landing_x_m"] = float(s[0])
            ev["landing_mps"] = float(math.hypot(s[2], s[3]))
            break
    r = Result(np.array(T), np.array(X), np.array(Z), np.array(VX), np.array(VZ), np.array(A), np.array(M), ev)
    r.theta = np.array(TH)
    return r
