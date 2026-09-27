r"""Two-dimensional multistage rocket ascent: gravity turn, drag and staging.

The physics in plain language
-----------------------------
We fly a rocket in the plane of its trajectory, in an Earth-centred inertial
frame, and add up the forces every 0.1 s:

    m dv/dt = T u_thrust  -  (1/2) rho |v_rel| v_rel C_D(M) A  -  G M_E m r / |r|^3
    dm/dt   = -T_vac / (g0 Isp_vac)

* **Thrust changes with altitude.**  An engine nozzle has exit area A_e; the
  outside air pushes back on it, so  T(p) = T_vac - p A_e.  That is why the
  same engine gives more thrust (and higher specific impulse, Isp) in vacuum.
* **Tsiolkovsky's rocket equation** is what the integration reproduces:
  dv = g0 Isp ln(m0 / m1) minus gravity and drag losses.
* **Drag** uses the air-relative velocity v_rel = v - omega x r (the atmosphere
  turns with Earth), air density rho(h) and speed of sound a(h) from the
  US Standard Atmosphere 1976 (seven layers up to 86 km, tabulated above), and
  a Mach-dependent drag coefficient C_D(M) that peaks in the transonic region.
* **Dynamic pressure** q = (1/2) rho v_rel^2 measures aerodynamic load; it rises
  as the rocket speeds up and falls as the air thins: "Max-Q" is its peak.
* **Gravity turn.**  After a short vertical rise the rocket is tipped a few
  degrees east ("pitch kick") and then thrust is kept aligned with the
  air-relative velocity (zero angle of attack).  Gravity itself bends the path
  over - no side loads on a thin structure in thick air.
* **Upper-stage guidance.**  Above the atmosphere we use a simple closed-loop
  law (a stand-in for Apollo's Iterative Guidance Mode and Falcon's Powered
  Explicit Guidance): choose the thrust pitch so that the radial acceleration
  brings altitude to the target and vertical speed to zero exactly when the
  horizontal speed reaches orbital speed.  The engine cuts off when the
  orbit's semi-major axis reaches the target.
* **Earth's rotation** gives a free ~408 m/s eastward from Cape Canaveral
  (latitude 28.5 deg).  The model works in the trajectory plane; the launch
  site speed is omega_E R_E cos(latitude).

Vehicle data (rounded; see comments in ``saturn_v`` / ``falcon9``)
-------------------------------------------------------------------
* Saturn V, Apollo 11 (AS-506): *Saturn V Flight Evaluation Report AS-506
  Apollo 11 Mission*, NASA Marshall Space Flight Center MPR-SAT-FE-69-9 (1969);
  R. Orloff, *Apollo by the Numbers*, NASA SP-2000-4029.
* Falcon 9 Block 5: *Falcon User's Guide*, Space Exploration Technologies Corp.
  (2021, 2025 revisions) and spacex.com/vehicles/falcon-9 (thrust, dimensions,
  total mass).  Stage dry/propellant masses are not published by SpaceX; the
  values used are widely quoted estimates and are marked as such.
* Atmosphere: *U.S. Standard Atmosphere, 1976*, NOAA/NASA/USAF, NOAA-S/T 76-1562.

What this model leaves out: 3-D steering and the launch azimuth, engine
throttling details, winds, the booster's landing burns, and real vehicle drag
data (C_D(M) here is a generic slender-body curve).  Expect the right shape and
magnitude, within ~10-20 % of flight data - not a reconstruction.
"""

from __future__ import annotations

if __package__ in (None, ""):  # allow `python simulations/cosmic/rocket_ascent.py`
    import pathlib
    import sys

    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from dataclasses import dataclass, field

import numpy as np

from cosmic.constants import G0, GM_EARTH, OMEGA_EARTH, R_EARTH

# ---------------------------------------------------------------------------
# US Standard Atmosphere 1976
# ---------------------------------------------------------------------------
R_AIR = 287.0531      # J/(kg K)  (R* / M0 = 8314.32 / 28.9644)
GAMMA = 1.4
R0_GEOP = 6_356_766.0  # effective Earth radius for geopotential altitude [m]
# base geopotential altitude [m], base temperature [K], lapse rate [K/m], base pressure [Pa]
_LAYERS = np.array([
    [0.0, 288.15, -0.0065, 101325.0],
    [11000.0, 216.65, 0.0, 22632.06],
    [20000.0, 216.65, 0.0010, 5474.889],
    [32000.0, 228.65, 0.0028, 868.0187],
    [47000.0, 270.65, 0.0, 110.9063],
    [51000.0, 270.65, -0.0028, 66.93887],
    [71000.0, 214.65, -0.0020, 3.956420],
])
# above 86 km: tabulated density (US 1976 Table 1) for log-interpolation
_HI_Z = np.array([86e3, 90e3, 100e3, 110e3, 120e3, 150e3, 200e3, 300e3, 500e3, 1000e3])
_HI_RHO = np.array([6.958e-6, 3.416e-6, 5.604e-7, 9.708e-8, 2.222e-8, 2.076e-9, 2.541e-10, 1.916e-11,
                    5.215e-13, 3.561e-15])
_HI_T = np.array([186.87, 186.87, 195.08, 240.0, 360.0, 634.39, 854.56, 976.01, 999.24, 1000.0])


def atmosphere(h):
    """US Standard Atmosphere 1976: (T [K], p [Pa], rho [kg/m^3], a [m/s]) at geometric altitude h [m]."""
    h = np.asarray(h, dtype=float)
    z = np.clip(h, -5000, None)
    H = R0_GEOP * z / (R0_GEOP + z)
    idx = np.clip(np.searchsorted(_LAYERS[:, 0], H, side="right") - 1, 0, len(_LAYERS) - 1)
    Hb, Tb, L, Pb = (_LAYERS[idx, k] for k in range(4))
    T = Tb + L * (H - Hb)
    with np.errstate(divide="ignore", invalid="ignore"):
        p_grad = Pb * (Tb / T) ** (G0 / (R_AIR * L))
        p_iso = Pb * np.exp(-G0 * (H - Hb) / (R_AIR * Tb))
    p = np.where(L == 0.0, p_iso, p_grad)
    rho = p / (R_AIR * T)
    hi = h > 86e3
    if np.any(hi):
        rho_hi = np.exp(np.interp(h, _HI_Z, np.log(_HI_RHO)))
        T_hi = np.interp(h, _HI_Z, _HI_T)
        rho = np.where(hi, rho_hi, rho)
        T = np.where(hi, T_hi, T)
        p = np.where(hi, rho * R_AIR * T, p)
    a = np.sqrt(GAMMA * R_AIR * T)
    return T, p, rho, a


# generic slender launch-vehicle drag curve (shape after e.g. NASA TN D-2566 / Saturn wind-tunnel summaries)
_CD_MACH = np.array([0.0, 0.5, 0.8, 0.9, 1.0, 1.1, 1.2, 1.5, 2.0, 3.0, 4.0, 5.0, 10.0])
_CD_VAL = np.array([0.30, 0.30, 0.33, 0.40, 0.50, 0.55, 0.55, 0.48, 0.40, 0.32, 0.28, 0.26, 0.25])


def drag_coefficient(mach):
    return np.interp(mach, _CD_MACH, _CD_VAL)


# ---------------------------------------------------------------------------
# vehicle description
# ---------------------------------------------------------------------------
@dataclass
class Stage:
    name: str
    dry_mass: float            # kg, dropped at separation (includes interstage/residuals)
    propellant: float          # kg usable
    n_engines: int
    thrust_vac: float          # N per engine
    thrust_sl: float           # N per engine
    isp_vac: float             # s
    max_burn: float = 1e9      # s, scheduled cutoff after ignition
    reserve: float = 0.0       # kg of propellant kept (e.g. booster landing)
    engine_out: list = field(default_factory=list)   # [(t_after_ignition, engines_remaining, label)]
    coast_after: float = 1.0   # s between cutoff and next-stage ignition

    @property
    def mdot(self):  # per engine
        return self.thrust_vac / (self.isp_vac * G0)

    @property
    def exit_area(self):  # per engine
        return (self.thrust_vac - self.thrust_sl) / 101325.0


@dataclass
class Vehicle:
    name: str
    stages: list
    payload: float
    diameter: float
    jettison: list = field(default_factory=list)    # [(mission time s, mass kg, label)]
    pitch_start: float = 12.0   # s
    kick_deg: float = 2.0
    kick_time: float = 10.0     # s over which the kick is applied
    target_alt: float = 185e3   # m
    latitude_deg: float = 28.5
    throttle: list = field(default_factory=list)    # [(t0, t1, fraction)] first-stage throttle bucket
    flight_events: list = field(default_factory=list)  # [(t, label)] actual flight times for comparison
    color: str = "#7cc8ff"

    @property
    def area(self):
        return np.pi * (self.diameter / 2) ** 2

    def liftoff_mass(self):
        return self.payload + sum(s.dry_mass + s.propellant for s in self.stages) + sum(m for _, m, _ in self.jettison)


def saturn_v() -> Vehicle:
    """Saturn V AS-506 (Apollo 11).

    Engine data: F-1 sea-level thrust 6.77 MN (1,522,000 lbf), vacuum ~7.77 MN, Isp 263 s SL / 304 s vac;
    J-2 ~1.03 MN (232,000 lbf) vacuum, Isp ~421 s.  Event times from the AS-506 Flight Evaluation
    Report: S-IC center engine cutoff (CECO) 135.2 s, outboard engine cutoff (OECO) 161.6 s,
    S-II ignition 164.0 s, launch escape tower jettison 197.9 s, S-II CECO 460.6 s, S-II OECO 548.2 s,
    S-IVB first cutoff 699.3 s, parking-orbit insertion 709.3 s (~186 x 183 km).
    Masses rounded from the same report / Apollo by the Numbers (liftoff ~2.94 million kg).
    """
    from cosmic import style

    return Vehicle(
        name="Saturn V (Apollo 11)",
        stages=[
            # S-IC: dry ~131 t (+ residuals ~40 t kept with the stage), usable propellant ~2,077 t
            Stage("S-IC", 171_000, 2_077_000, 5, 7.77e6, 6.77e6, 304.0, max_burn=161.6,
                  engine_out=[(135.2, 4, "S-IC CECO")], coast_after=2.4),
            # S-II: dry ~36 t + aft interstage ~4.5 t (jettisoned separately below), propellant ~453 t
            Stage("S-II", 40_500, 453_000, 5, 1.033e6, 0.5e6, 421.0, max_burn=384.2,
                  engine_out=[(296.6, 4, "S-II CECO")], coast_after=4.0),
            # S-IVB: dry ~11.3 t; ~108 t loaded, ~1/3 used for orbit insertion, rest for translunar injection
            Stage("S-IVB", 13_300, 108_000, 1, 1.00e6, 0.45e6, 421.0),
        ],
        payload=45_700 + 2_000,     # CSM + LM + SLA ~45.7 t, Instrument Unit ~2 t
        diameter=10.06,
        jettison=[(197.9, 4_200, "LES jettison")],   # Launch Escape System
        pitch_start=13.2, kick_deg=1.3, kick_time=12.0, target_alt=186e3,
        flight_events=[(83.0, "Max-Q"), (135.2, "CECO"), (161.6, "OECO"), (548.2, "S-II cutoff"),
                       (699.3, "S-IVB cutoff")],
        color=style.FLAME,
    )


def falcon9(payload=15_000.0) -> Vehicle:
    """Falcon 9 Block 5 (Falcon User's Guide; spacex.com).

    Published: first stage 9 Merlin 1D, 7,607 kN sea level / 8,227 kN vacuum total; second stage 1 Merlin
    Vacuum, 981 kN; diameter 3.7 m; height 70 m; total mass 549,054 kg (without payload).
    Estimates (not published): stage-1 propellant ~411 t, dry ~25.6 t; stage-2 propellant ~107.5 t,
    dry ~4 t; fairing ~1.9 t; Isp ~283 s SL / 312 s vac (M1D), ~348 s (MVac).  Booster keeps ~8 % of
    its propellant for the landing burns, so main engine cutoff (MECO) comes near T+2:30.
    """
    from cosmic import style

    return Vehicle(
        name="Falcon 9 Block 5",
        stages=[
            Stage("Stage 1", 25_600 + 33_000, 411_000 - 33_000, 9, 8.227e6 / 9, 7.607e6 / 9, 312.0,
                  coast_after=10.0),
            Stage("Stage 2", 4_000, 107_500, 1, 981e3, 0.0, 348.0),
        ],
        payload=payload,
        diameter=3.7,
        jettison=[(215.0, 1_900, "fairing sep")],
        pitch_start=10.0, kick_deg=3.0, kick_time=10.0, target_alt=220e3,
        # Falcon 9 throttles down briefly around Max-Q; the profile is not published, so it is left
        # out here (pass e.g. throttle=[(55, 75, 0.75)] to experiment).
        color=style.ICE,
    )


VEHICLES = {"saturn-v": saturn_v, "falcon9": falcon9}


# ---------------------------------------------------------------------------
# simulation
# ---------------------------------------------------------------------------
def simulate(veh: Vehicle, dt=0.1, t_max=1200.0, coast_after_insertion=20.0):
    """Fly ``veh`` to orbit.  Returns (dict of time series arrays, list of (t, label) events, final orbit)."""
    mu = GM_EARTH
    w = OMEGA_EARTH * np.cos(np.radians(veh.latitude_deg))  # effective in-plane rotation rate
    pos = np.array([0.0, R_EARTH])
    vel = np.array([w * R_EARTH, 0.0])                     # atmosphere/ground speed at the pad (eastward)
    stages = veh.stages
    si = 0
    st = stages[0]
    prop = st.propellant
    upper_mass = veh.payload + sum(s.dry_mass + s.propellant for s in stages[1:]) + sum(m for _, m, _ in veh.jettison)
    m = st.dry_mass + prop + upper_mass
    jett = list(veh.jettison)
    t = 0.0
    t_ign = 0.0
    engines = st.n_engines
    eo = list(st.engine_out)
    burning = True
    coast_until = -1.0
    inserted_at = None
    events = [(0.0, "Liftoff")]
    rec = {k: [] for k in ("t", "h", "downrange", "v", "v_rel", "q", "acc_g", "mach", "mass", "gamma", "stage",
                           "thrust")}
    theta0 = np.arctan2(pos[0], pos[1])
    passed_mach1 = False

    def throttle_at(tt):
        if si == 0:
            for t0, t1, f in veh.throttle:
                if t0 <= tt <= t1:
                    return f
        return 1.0

    def guidance_dir(tt, p, v, a_thrust, mm=None):
        r = np.linalg.norm(p)
        up = p / r
        east = np.array([up[1], -up[0]])                   # downrange direction (clockwise)
        if si == 0:
            if tt < veh.pitch_start:
                return up
            v_rel = v - w * np.array([p[1], -p[0]])
            if tt < veh.pitch_start + veh.kick_time:
                ang = np.radians(veh.kick_deg) * (tt - veh.pitch_start) / veh.kick_time
                return np.cos(ang) * up + np.sin(ang) * east
            vr = v_rel / np.linalg.norm(v_rel)
            # never pitch back toward vertical: keep at least the kick angle
            if np.dot(vr, east) < np.sin(np.radians(veh.kick_deg)):
                ang = np.radians(veh.kick_deg)
                return np.cos(ang) * up + np.sin(ang) * east
            return vr
        # closed-loop terminal guidance for upper stages
        hdot = np.dot(v, up)
        vh = np.dot(v, east)
        r_t = R_EARTH + veh.target_alt
        v_need = np.sqrt(mu / r_t)
        # time-to-go from the rocket equation (acceleration grows as propellant burns)
        ve = st.isp_vac * G0
        mdot_now = engines * st.mdot
        dv_go = max(v_need - vh, 1.0)
        t_go = mm / mdot_now * (1.0 - np.exp(-dv_go / ve)) if mm else dv_go / a_thrust
        t_go = max(t_go, 20.0)
        # radial acceleration varying linearly in time that reaches r_t with hdot = 0 at t_go:
        #   a(t) = A + B t,  A = (6 (r_t - r) - 4 hdot t_go) / t_go^2
        a_r_cmd = (6.0 * (r_t - r) - 4.0 * hdot * t_go) / t_go**2
        a_T_r = a_r_cmd + mu / r**2 - vh**2 / r
        s = np.clip(a_T_r / a_thrust, -0.5, 0.8)
        return s * up + np.sqrt(1 - s**2) * east

    def deriv(tt, p, v, mm, thrusting):
        r = np.linalg.norm(p)
        h = r - R_EARTH
        T_, pa, rho, a_snd = atmosphere(h)
        v_rel = v - w * np.array([p[1], -p[0]])
        vr = np.linalg.norm(v_rel)
        mach = vr / a_snd
        cd = drag_coefficient(mach)
        F_drag = -0.5 * rho * vr * v_rel * cd * veh.area
        thr = 0.0
        if thrusting:
            thr = engines * (st.thrust_vac - pa * st.exit_area) * throttle_at(tt)
        a_thr = thr / mm
        u = guidance_dir(tt, p, v, max(a_thr, 1e-6), mm) if thrusting else v / max(np.linalg.norm(v), 1)
        acc = a_thr * u + F_drag / mm - mu * p / r**3
        sensed = np.linalg.norm(a_thr * u + F_drag / mm) / G0
        return acc, dict(h=h, v_rel=vr, q=0.5 * rho * vr**2, mach=mach, sensed=sensed, thrust=thr)

    while t < t_max:
        thrusting = burning and t >= coast_until
        mdot = engines * st.mdot * throttle_at(t) if thrusting else 0.0
        # RK4 on position/velocity (mass is linear in time within a step)
        a1, info = deriv(t, pos, vel, m, thrusting)
        k1p, k1v = vel, a1
        a2, _ = deriv(t + dt / 2, pos + dt / 2 * k1p, vel + dt / 2 * k1v, m - mdot * dt / 2, thrusting)
        k2p, k2v = vel + dt / 2 * k1v, a2
        a3, _ = deriv(t + dt / 2, pos + dt / 2 * k2p, vel + dt / 2 * k2v, m - mdot * dt / 2, thrusting)
        k3p, k3v = vel + dt / 2 * k2v, a3
        a4, _ = deriv(t + dt, pos + dt * k3p, vel + dt * k3v, m - mdot * dt, thrusting)
        k4p, k4v = vel + dt * k3v, a4

        # record the state at the start of the step
        r = np.linalg.norm(pos)
        up = pos / r
        east = np.array([up[1], -up[0]])
        theta = np.arctan2(pos[0], pos[1])
        rec["t"].append(t)
        rec["h"].append(info["h"])
        rec["downrange"].append(R_EARTH * (theta - theta0 - w * t))
        rec["v"].append(np.linalg.norm(vel))
        rec["v_rel"].append(info["v_rel"])
        rec["q"].append(info["q"])
        rec["acc_g"].append(info["sensed"])
        rec["mach"].append(info["mach"])
        rec["mass"].append(m)
        rec["gamma"].append(np.degrees(np.arctan2(np.dot(vel, up), np.dot(vel, east))))
        rec["stage"].append(si)
        rec["thrust"].append(info["thrust"])
        if not passed_mach1 and info["mach"] >= 1.0:
            passed_mach1 = True
            events.append((t, "Mach 1"))

        pos = pos + dt / 6 * (k1p + 2 * k2p + 2 * k3p + k4p)
        vel = vel + dt / 6 * (k1v + 2 * k2v + 2 * k3v + k4v)
        t += dt
        if thrusting:
            m -= mdot * dt
            prop -= mdot * dt
        if np.linalg.norm(pos) < R_EARTH - 10:
            events.append((t, "impact"))
            break

        # jettisons
        for ev in list(jett):
            if t >= ev[0]:
                m -= ev[1]
                jett.remove(ev)
                events.append((t, ev[2]))
        # engine-out schedule
        for ev in list(eo):
            if thrusting and t - t_ign >= ev[0]:
                engines = ev[1]
                eo.remove(ev)
                events.append((t, ev[2]))
        if inserted_at is not None:
            if t - inserted_at >= coast_after_insertion:
                break
            continue
        # upper-stage cutoff at target energy
        if thrusting and si == len(stages) - 1:
            rr = np.linalg.norm(pos)
            a_orb = 1.0 / (2.0 / rr - np.dot(vel, vel) / mu)
            if a_orb >= R_EARTH + veh.target_alt:
                burning = False
                inserted_at = t
                events.append((t, "orbit insertion"))
                continue
        # stage burnout / scheduled cutoff
        if thrusting and (prop <= st.reserve + 1e-6 or t - t_ign >= st.max_burn):
            label = {"S-IC": "S-IC OECO", "S-II": "S-II cutoff", "Stage 1": "MECO"}.get(st.name, f"{st.name} cutoff")
            events.append((t, label))
            if si == len(stages) - 1:
                burning = False
                inserted_at = t
                events.append((t, "propellant depleted"))
                continue
            m -= st.dry_mass + prop                      # drop the spent stage (and any leftover propellant)
            si += 1
            st = stages[si]
            prop = st.propellant
            engines = st.n_engines
            eo = list(st.engine_out)
            coast_until = t + stages[si - 1].coast_after
            t_ign = coast_until
            events.append((t, "staging"))
            events.append((coast_until, f"{st.name} ignition"))

    out = {k: np.array(v) for k, v in rec.items()}
    iq = int(np.argmax(out["q"]))
    events.append((out["t"][iq], f"Max-Q {out['q'][iq]/1e3:.1f} kPa"))
    rr = np.linalg.norm(pos)
    energy = 0.5 * np.dot(vel, vel) - mu / rr
    hvec = pos[0] * vel[1] - pos[1] * vel[0]
    a_orb = -mu / (2 * energy)
    e_orb = np.sqrt(max(0.0, 1 + 2 * energy * hvec**2 / mu**2))
    orbit = dict(perigee_km=(a_orb * (1 - e_orb) - R_EARTH) / 1e3, apogee_km=(a_orb * (1 + e_orb) - R_EARTH) / 1e3,
                 v_kms=np.linalg.norm(vel) / 1e3, remaining_propellant_kg=max(prop, 0.0), stage=st.name,
                 mass_kg=m)
    return out, sorted(events), orbit


# ---------------------------------------------------------------------------
# figure
# ---------------------------------------------------------------------------
_KEY = ("Max-Q", "OECO", "MECO", "S-II cutoff", "orbit insertion")


def plot_ascent(names=("saturn-v", "falcon9"), outdir=None, showcase=False):
    import matplotlib.pyplot as plt

    from cosmic import style

    runs = []
    for n in names:
        veh = VEHICLES[n]()
        data, events, orbit = simulate(veh)
        runs.append((veh, data, events, orbit))
        print(f"{veh.name}: liftoff {veh.liftoff_mass()/1e3:,.0f} t, orbit {orbit['perigee_km']:.0f} x "
              f"{orbit['apogee_km']:.0f} km, {orbit['v_kms']:.3f} km/s, "
              f"{orbit['remaining_propellant_kg']/1e3:.1f} t propellant left in {orbit['stage']}")
        for t, lab in events:
            print(f"    T+{t:7.1f} s  {lab}")

    fig = plt.figure(figsize=(15, 9.4))
    gs = fig.add_gridspec(2, 3, left=0.055, right=0.985, top=0.8, bottom=0.08, hspace=0.38, wspace=0.22)
    panels = [
        ("Altitude", "km", lambda d: d["h"] / 1e3),
        ("Inertial speed", "km/s", lambda d: d["v"] / 1e3),
        ("Dynamic pressure  q = ½ρv²", "kPa", lambda d: d["q"] / 1e3),
        ("Sensed acceleration (thrust + drag)", "g", lambda d: d["acc_g"]),
        ("Mach number", "", lambda d: d["mach"]),
        ("Trajectory", "altitude km vs downrange km", None),
    ]
    for k, (title, unit, fn) in enumerate(panels):
        ax = fig.add_subplot(gs[k // 3, k % 3])
        ax.set_title(title + (f"  [{unit}]" if unit and fn else ""), fontsize=11)
        for veh, d, events, orbit in runs:
            c = veh.color
            if fn is None:
                x, y = d["downrange"] / 1e3, d["h"] / 1e3
                ax.set_xlabel("downrange [km]")
                ax.set_ylabel("altitude [km]")
            else:
                x, y = d["t"], fn(d)
                ax.set_xlabel("time after liftoff [s]")
            if title.startswith("Mach"):
                y = np.where(d["h"] < 90e3, y, np.nan)
            style.glow_line(ax, x, y, c, lw=1.8, layers=3)
            # event markers
            for te, lab in events:
                if not any(lab.startswith(kk) for kk in _KEY):
                    continue
                i = min(np.searchsorted(d["t"], te), len(d["t"]) - 1)
                if fn is None:
                    xe, ye = x[i], y[i]
                else:
                    xe, ye = d["t"][i], y[i]
                if not np.isfinite(ye):
                    continue
                ax.scatter([xe], [ye], s=34, color=style.BG, edgecolor=c, lw=1.6, zorder=6)
                if k == 2 or (k == 0 and not lab.startswith("Max-Q")):
                    short = lab.replace("orbit insertion", "orbit").replace("S-IC ", "").split(" ")[0] \
                        if not lab.startswith("Max-Q") else "Max-Q"
                    if lab.startswith("S-II"):
                        short = "S-II off"
                    dy = {0: 8, 2: 1.2}[k]
                    ax.text(xe, ye + dy, short, color=c, fontsize=7.8, ha="center", va="bottom", zorder=7)
        if title.startswith("Inertial"):
            sv = [r for r in runs if r[0].name.startswith("Saturn")]
            if sv:
                veh, d, events, orbit = sv[0]
                tq = [t for t, lab in events if lab.startswith("Max-Q")][0]
                qv = float(d["q"].max()) / 1e3
                ti = [t for t, lab in events if lab == "orbit insertion"]
                ti = ti[0] if ti else float("nan")
                ax.text(0.97, 0.04,
                        "Saturn V   model       AS-506 flight\n"
                        f"Max-Q      {tq:3.0f} s {qv:4.1f} kPa  83 s 35.1 kPa\n"
                        f"insertion  {ti:3.0f} s           709 s\n"
                        f"orbit      {orbit['perigee_km']:.0f}×{orbit['apogee_km']:.0f} km  183×186 km",
                        transform=ax.transAxes, ha="right", va="bottom", fontsize=7.6, family="monospace",
                        multialignment="left",
                        color=style.TEXT_2, linespacing=1.5,
                        bbox=dict(boxstyle="round,pad=0.6", fc=style.BG, ec=style.FAINT))
        if title.startswith("Mach"):
            ax.axhline(1, color=style.MUTED, lw=0.8, ls="--")
            ax.text(5, 1.4, "Mach 1", color=style.MUTED, fontsize=8)
            ax.set_xlim(0, 240)
        if title.startswith("Dynamic"):
            ax.set_xlim(0, 240)
        if fn is None:
            ax.set_aspect("auto")
    # legend
    for j, (veh, d, events, orbit) in enumerate(runs):
        fig.text(0.035 + 0.2 * j, 0.872, "━━  " + veh.name, color=veh.color, fontsize=11, fontweight="semibold")
        fig.text(0.035 + 0.2 * j, 0.85,
                 f"{veh.liftoff_mass()/1e3:,.0f} t at liftoff → {orbit['perigee_km']:.0f}×{orbit['apogee_km']:.0f} km",
                 color=style.TEXT_2, fontsize=8.5)
    style.header(fig, "Climbing to orbit: Saturn V vs Falcon 9",
                 "2-D multistage ascent with gravity turn, US Standard Atmosphere 1976 drag, Mach-dependent C_D and "
                 "closed-loop upper-stage guidance.")
    style.footer(fig, "simulations/cosmic/rocket_ascent.py",
                 "Data: Saturn V Flight Evaluation Report AS-506 (NASA MSFC, 1969); SpaceX Falcon User's Guide")
    return style.save(fig, "rocket_ascent.png", outdir=outdir, showcase=showcase)


def main(argv=None):
    from cosmic import _cli

    p = _cli.parser(__doc__, "python -m cosmic.rocket_ascent")
    p.add_argument("vehicle", nargs="?", default="both", choices=["both", "saturn-v", "falcon9"])
    _cli.add_common(p)
    a = p.parse_args(argv)
    names = ("saturn-v", "falcon9") if a.vehicle == "both" else (a.vehicle,)
    print("wrote", plot_ascent(names, a.outdir, a.showcase))


if __name__ == "__main__":
    main()
