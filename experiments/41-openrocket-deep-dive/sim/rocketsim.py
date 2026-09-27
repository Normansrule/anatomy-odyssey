"""A small, readable rocket flight simulator for cross-checking OpenRocket.

* ``Atmosphere``  - ISA troposphere + lower stratosphere (to 20 km)
* ``Motor``       - reads a RASP ``.eng`` thrust curve; mass falls in proportion to impulse delivered
* ``Rocket``      - mass, diameter, drag coefficient vs Mach, recovery
* ``simulate_1dof``  - vertical flight: z, vz
* ``simulate_2dof``  - planar point-mass flight: x (downwind), z; launch rail, wind profile,
                       instant weathercocking (the body axis follows the air-relative velocity)

Everything is SI. Integration is classical 4th-order Runge-Kutta with a fixed step.
It is deliberately simpler than OpenRocket (no rotational dynamics, no fin flutter, no
roll) - use the differences to learn what each modelling choice is worth.
License: MIT
"""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

G0 = 9.80665
_trapz = getattr(np, "trapezoid", None) or getattr(np, "trapz")  # NumPy 2 renamed trapz
R_AIR = 287.053
GAMMA = 1.4


# ------------------------------------------------------------------ atmosphere
@dataclass
class Atmosphere:
    """ISA with an optional sea-level temperature offset. ``const_rho`` freezes density (for tests)."""
    site_elevation: float = 0.0
    dT: float = 0.0
    const_rho: float | None = None

    def __call__(self, h_agl: float):
        h = self.site_elevation + max(h_agl, -self.site_elevation)
        if h <= 11_000:
            T = 288.15 + self.dT - 0.0065 * h
            p = 101_325.0 * ((288.15 - 0.0065 * h) / 288.15) ** 5.25588
        else:
            T = 216.65 + self.dT
            p = 22_632.06 * math.exp(-G0 * (h - 11_000) / (R_AIR * 216.65))
        rho = self.const_rho if self.const_rho is not None else p / (R_AIR * T)
        a = math.sqrt(GAMMA * R_AIR * T)
        return rho, a, p, T


# ------------------------------------------------------------------ motor
@dataclass
class Motor:
    name: str
    diameter_mm: float
    length_mm: float
    prop_mass: float
    total_mass: float
    t: np.ndarray
    F: np.ndarray
    scale: float = 1.0  # thrust multiplier for sensitivity studies

    @classmethod
    def from_eng(cls, path: str | Path, scale: float = 1.0) -> "Motor":
        rows = [l.strip() for l in Path(path).read_text().splitlines()]
        rows = [l for l in rows if l and not l.startswith(";")]
        h = rows[0].split()
        pts = [(0.0, 0.0)] + [tuple(map(float, l.split()[:2])) for l in rows[1:] if len(l.split()) >= 2]
        t, F = map(np.array, zip(*pts))
        if F[-1] != 0:
            raise ValueError("a RASP curve must end with zero thrust")
        return cls(h[0], float(h[1]), float(h[2]), float(h[4]), float(h[5]), t, F, scale)

    @property
    def burn_time(self) -> float:
        return float(self.t[-1])

    def __post_init__(self):
        # cumulative impulse at every curve point (trapezoids), for fast mass lookup
        seg = np.diff(self.t) * (self.F[1:] + self.F[:-1]) / 2
        self._cum = np.concatenate([[0.0], np.cumsum(seg)])

    @property
    def total_impulse(self) -> float:
        return float(self._cum[-1]) * self.scale

    def thrust(self, t: float) -> float:
        if t < 0 or t > self.t[-1]:
            return 0.0
        j = int(np.searchsorted(self.t, t, side="right")) - 1
        if j >= len(self.t) - 1:
            return 0.0
        return float(self.F[j] + (self.F[j + 1] - self.F[j]) * (t - self.t[j]) / (self.t[j + 1] - self.t[j])) * self.scale

    def impulse_to(self, t: float) -> float:
        if t <= 0:
            return 0.0
        if t >= self.t[-1]:
            return float(self._cum[-1]) * self.scale
        j = int(np.searchsorted(self.t, t, side="right")) - 1
        f_t = self.F[j] + (self.F[j + 1] - self.F[j]) * (t - self.t[j]) / (self.t[j + 1] - self.t[j])
        return float(self._cum[j] + (t - self.t[j]) * (self.F[j] + f_t) / 2) * self.scale

    def mass(self, t: float) -> float:
        burnt = self.impulse_to(t) / self.total_impulse if self.total_impulse > 0 else 0.0
        return self.total_mass - self.prop_mass * min(burnt, 1.0)


# ------------------------------------------------------------------ rocket
@dataclass
class Rocket:
    dry_mass: float                   # kg, everything except the loaded motor
    diameter: float                   # m, reference diameter
    cd0: float = 0.5                  # subsonic drag coefficient (power-off)
    mach_drag: bool = True            # add a simple transonic rise
    chute_cd_area: float = 0.0        # Cd*A of the recovery system (m^2); 0 = none
    deploy: str = "apogee"            # "apogee" or "delay"
    delay: float = 6.0                # s after burnout when deploy == "delay"
    cd_scale: float = 1.0             # for sensitivity studies

    @property
    def area(self) -> float:
        return math.pi * self.diameter ** 2 / 4

    def cd(self, mach: float) -> float:
        """Subsonic constant, rising through the transonic region (a teaching model, not a CFD fit)."""
        c = self.cd0
        if self.mach_drag:
            if mach > 0.8:
                c *= 1 + 0.8 * min((mach - 0.8) / 0.25, 1.0)          # up to 1.8x at M 1.05
            if mach > 1.05:
                c = self.cd0 * (1.8 - 0.4 * min((mach - 1.05) / 0.95, 1.0))  # easing to 1.4x at M 2
        return c * self.cd_scale


@dataclass
class Result:
    t: np.ndarray
    x: np.ndarray
    z: np.ndarray
    vx: np.ndarray
    vz: np.ndarray
    a: np.ndarray
    mach: np.ndarray
    events: dict = field(default_factory=dict)

    @property
    def apogee(self) -> float:
        return float(self.z.max())

    @property
    def max_speed(self) -> float:
        return float(np.hypot(self.vx, self.vz).max())

    def summary(self) -> dict:
        s = {"apogee_m": self.apogee, "max_speed_mps": self.max_speed, "max_mach": float(self.mach.max()),
             "max_accel_g": float(self.a.max() / G0)}
        s.update(self.events)
        return s


def wind_at(z: float, w_ref: float, z_ref: float = 10.0) -> float:
    """1/7 power-law wind profile (neutral atmosphere boundary layer)."""
    return w_ref * (max(z, 0.1) / z_ref) ** (1 / 7) if w_ref else 0.0


# ------------------------------------------------------------------ 2-DOF (1-DOF is the special case)
def simulate_2dof(rocket: Rocket, motor: Motor, atmos: Atmosphere | None = None, wind: float = 0.0,
                  rail_length: float = 1.8, rail_angle_deg: float = 0.0, dt: float = 0.002,
                  t_max: float = 600.0, descend: bool = True, dt_coast: float = 0.01,
                  dt_descent: float = 0.05) -> Result:
    """Planar flight. x is horizontal (positive downwind), z up. rail_angle_deg tilts the rail
    from vertical towards +x (downwind); use a negative angle to lean into the wind."""
    atmos = atmos or Atmosphere()
    th = math.radians(rail_angle_deg)
    rail_dir = (math.sin(th), math.cos(th))
    t, x, z, vx, vz = 0.0, 0.0, 0.0, 0.0, 0.0
    on_rail, deployed, burnout_seen = True, False, False
    ev: dict = {}
    T, X, Z, VX, VZ, A, M = [], [], [], [], [], [], []

    def deriv(t, s, on_rail, deployed):
        x, z, vx, vz = s
        rho, a_snd, _, _ = atmos(z)
        w = wind_at(z, wind)
        rvx, rvz = vx - w, vz            # air-relative velocity
        vr = math.hypot(rvx, rvz)
        m = rocket.dry_mass + motor.mass(t)
        F = motor.thrust(t)
        if deployed:
            D = 0.5 * rho * vr * vr * (rocket.chute_cd_area + rocket.cd(vr / a_snd) * rocket.area)
        else:
            D = 0.5 * rho * vr * vr * rocket.cd(vr / a_snd) * rocket.area
        if on_rail:
            # constrained along the rail: thrust - drag - gravity component; cannot slide back
            ux, uz = rail_dir
            vr_along = vx * ux + vz * uz
            acc = (F - 0.5 * rho * vr_along * abs(vr_along) * rocket.cd(abs(vr_along) / a_snd) * rocket.area) / m - G0 * uz
            if vr_along <= 0 and acc < 0:
                acc = 0.0
            return np.array([vx, vz, acc * ux, acc * uz]), acc
        if vr > 1e-6:
            ux, uz = rvx / vr, rvz / vr   # body axis follows the relative wind (instant weathercocking)
        else:
            ux, uz = rail_dir
        thrust_x, thrust_z = (F * ux, F * uz) if not deployed else (0.0, 0.0)
        drag_x, drag_z = (-D * rvx / vr, -D * rvz / vr) if vr > 1e-6 else (0.0, 0.0)
        ax = (thrust_x + drag_x) / m
        az = (thrust_z + drag_z) / m - G0
        return np.array([vx, vz, ax, az]), math.hypot(ax, az + G0)

    s = np.array([x, z, vx, vz])
    dt_boost = dt
    while t < t_max:
        # fine steps while the motor burns and near apogee/deployment, coarse steps under the chute
        dt = dt_boost if (t < motor.burn_time + 0.2 or on_rail) else (dt_descent if deployed else dt_coast)
        k1, acc = deriv(t, s, on_rail, deployed)
        k2, _ = deriv(t + dt / 2, s + dt / 2 * k1, on_rail, deployed)
        k3, _ = deriv(t + dt / 2, s + dt / 2 * k2, on_rail, deployed)
        k4, _ = deriv(t + dt, s + dt * k3, on_rail, deployed)
        s_new = s + dt / 6 * (k1 + 2 * k2 + 2 * k3 + k4)
        t_new = t + dt
        rho, a_snd, _, _ = atmos(s[1])
        T.append(t); X.append(s[0]); Z.append(s[1]); VX.append(s[2]); VZ.append(s[3]); A.append(acc)
        M.append(math.hypot(s[2] - wind_at(s[1], wind), s[3]) / a_snd)
        # events
        if on_rail and math.hypot(s_new[0], s_new[1]) >= rail_length:
            on_rail = False
            ev["rail_exit_s"] = t_new
            ev["rail_exit_mps"] = float(math.hypot(s_new[2], s_new[3]))
        if not burnout_seen and t_new >= motor.burn_time:
            burnout_seen = True
            ev["burnout_s"] = t_new
            ev["burnout_alt_m"] = float(s_new[1])
            ev["burnout_mps"] = float(math.hypot(s_new[2], s_new[3]))
        if not on_rail and "apogee_s" not in ev and s_new[3] < 0 <= s[3]:
            ev["apogee_s"] = t_new
            ev["apogee_x_m"] = float(s_new[0])
            ev["optimal_delay_s"] = t_new - motor.burn_time
        if not deployed and rocket.chute_cd_area > 0 and not on_rail:
            if (rocket.deploy == "apogee" and "apogee_s" in ev) or \
               (rocket.deploy == "delay" and burnout_seen and t_new >= motor.burn_time + rocket.delay):
                deployed = True
                ev["deploy_s"] = t_new
                ev["deploy_mps"] = float(math.hypot(s_new[2] - wind_at(s_new[1], wind), s_new[3]))
        s, t = s_new, t_new
        if s[1] < 0 and not on_rail and t > 1.0:
            ev["landing_s"] = t
            ev["landing_x_m"] = float(s[0])
            ev["landing_mps"] = float(math.hypot(s[2], s[3]))
            break
        if not descend and "apogee_s" in ev:
            break
    return Result(np.array(T), np.array(X), np.array(Z), np.array(VX), np.array(VZ), np.array(A), np.array(M), ev)


def simulate_1dof(rocket: Rocket, motor: Motor, atmos: Atmosphere | None = None, rail_length: float = 1.8,
                  dt: float = 0.002, descend: bool = True) -> Result:
    """Vertical flight, no wind: the 2-DOF model with the rail vertical and wind = 0."""
    return simulate_2dof(rocket, motor, atmos, wind=0.0, rail_length=rail_length, rail_angle_deg=0.0, dt=dt,
                         descend=descend)
