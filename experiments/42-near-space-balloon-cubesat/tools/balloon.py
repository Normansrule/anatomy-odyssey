#!/usr/bin/env python3
"""High-altitude balloon flight planner: FAA Part 101 exemption check, ascent / burst / descent,
and a landing prediction from a wind profile.

    python3 balloon.py                                   # example flight with the built-in wind profile
    python3 balloon.py --payload 1.2 --balloon 0.6 --burst-d 6.0 --free-lift 1.3 --winds my_sounding.csv
    python3 balloon.py --check-only --package 1.4:200x200x200 --package 0.4:120x80x60

Physics (all SI)
  * ISA atmosphere to 47 km (troposphere, tropopause, two stratosphere layers)
  * helium volume follows pressure and temperature: rho_gas(h) = rho_gas0 * rho_air(h)/rho_air0,
    so V(h) = V0 * rho_air0 / rho_air(h); the balloon bursts when V reaches (pi/6) D_burst^3
  * ascent rate from free lift: v = sqrt(2 g m_free / (rho_air Cd pi r^2)), Cd = 0.3 (spherical balloon)
  * descent: v = sqrt(2 m g / (rho Cd A)) of the parachute (fast in thin air, slow near the ground)
  * the payload drifts with the wind at every altitude (a balloon has no aerodynamics of its own)
A wind CSV has columns: altitude_m, speed_mps, direction_deg (meteorological: direction the wind
blows FROM, degrees from north) - e.g. from a radiosonde sounding or a weather model.
Real flights use forecast models (e.g. the SondeHub / Tawhiri predictor); this tool is for
understanding and for sanity-checking those predictions.
License: MIT
"""
from __future__ import annotations

import argparse
import csv
import math
from dataclasses import dataclass
from pathlib import Path

import numpy as np

G0 = 9.80665
R_AIR = 287.053
M_HE_OVER_AIR = 4.0026 / 28.9647     # helium / air molar-mass ratio
EARTH_R = 6_371_000.0
LB, OZ, IN2 = 0.45359237, 0.028349523, 0.00064516   # kg, kg, m^2

# ------------------------------------------------------------------ atmosphere
LAYERS = [(0, 288.15, -0.0065, 101325.0), (11000, 216.65, 0.0, 22632.06), (20000, 216.65, 0.001, 5474.889),
          (32000, 228.65, 0.0028, 868.0187), (47000, 270.65, 0.0, 110.9063)]


def isa(h):
    h = min(max(h, -500.0), 50000.0)
    for i in range(len(LAYERS) - 1, -1, -1):
        hb, Tb, L, pb = LAYERS[i]
        if h >= hb:
            break
    T = Tb + L * (h - hb)
    p = pb * (Tb / T) ** (G0 / (R_AIR * L)) if L != 0 else pb * math.exp(-G0 * (h - hb) / (R_AIR * Tb))
    return p, T, p / (R_AIR * T)


def altitude_for_density(rho):
    lo, hi = -500.0, 50000.0
    for _ in range(80):
        mid = (lo + hi) / 2
        if isa(mid)[2] > rho:
            lo = mid
        else:
            hi = mid
    return (lo + hi) / 2


# ------------------------------------------------------------------ FAA 14 CFR 101.1(a)(4)
@dataclass
class Package:
    mass_kg: float
    dims_mm: tuple

    @property
    def smallest_face_in2(self):
        a, b, c = sorted(self.dims_mm)
        return a * b / 645.16

    @property
    def ratio_oz_per_in2(self):
        return (self.mass_kg / OZ) / self.smallest_face_in2


def part101_check(packages, line_break_lbf=50.0):
    """Return (exempt?, list of reasons). Exempt = none of the 101.1(a)(4) conditions applies, so the
    Subpart D rules (cut-downs, radar reflector, ATC notice, position reports) do not apply - but 101.7
    (no hazardous operation, nothing dropped that creates a hazard) always does."""
    reasons = []
    for i, p in enumerate(packages, 1):
        lb = p.mass_kg / LB
        if lb > 4 and p.ratio_oz_per_in2 > 3:
            reasons.append(f"package {i}: {lb:.2f} lb > 4 lb AND {p.ratio_oz_per_in2:.2f} oz/in^2 > 3 on its smallest face")
        if lb > 6:
            reasons.append(f"package {i}: {lb:.2f} lb > 6 lb")
    total = sum(p.mass_kg for p in packages) / LB
    if total > 12:
        reasons.append(f"total payload {total:.2f} lb > 12 lb")
    if line_break_lbf > 50:
        reasons.append(f"suspension line/device needs {line_break_lbf:.0f} lbf > 50 lbf of impact force to separate")
    return not reasons, reasons


# ------------------------------------------------------------------ flight
def load_winds(path=None):
    if path:
        rows = [r for r in csv.DictReader(open(path))]
        h = np.array([float(r["altitude_m"]) for r in rows])
        s = np.array([float(r["speed_mps"]) for r in rows])
        d = np.array([float(r["direction_deg"]) for r in rows])
    else:
        # illustrative mid-latitude autumn profile: westerlies, jet stream near 11 km, easterlies above ~22 km
        h = np.array([0, 1000, 3000, 6000, 9000, 11000, 13000, 16000, 20000, 24000, 28000, 32000, 40000])
        s = np.array([3, 7, 12, 20, 32, 38, 30, 16, 6, 4, 8, 12, 15])
        d = np.array([250, 255, 260, 265, 270, 270, 270, 268, 260, 120, 95, 90, 90])
    return h, s, d


def wind_vector(h, winds):
    hs, ss, ds = winds
    spd = np.interp(h, hs, ss)
    frm = math.radians(np.interp(h, hs, ds))
    return -spd * math.sin(frm), -spd * math.cos(frm)   # (east, north) the air moves TOWARDS


def simulate(payload_kg=1.2, balloon_kg=0.6, burst_d=6.0, free_lift_kg=1.3, chute_d=1.2, chute_cd=1.5,
             launch=(35.0, -117.0), site_alt=700.0, winds=None, dt=2.0):
    winds = winds or load_winds()
    _, _, rho0 = isa(site_alt)
    rho_he0 = rho0 * M_HE_OVER_AIR
    lift_total = payload_kg + balloon_kg + free_lift_kg            # gross lift the helium must provide
    V0 = lift_total / (rho0 - rho_he0)
    Vb = math.pi / 6 * burst_d ** 3
    rho_burst = rho0 * V0 / Vb
    h_burst = altitude_for_density(rho_burst)
    t = 0.0
    h = site_alt
    e = n = 0.0
    track = []
    m_sys = payload_kg + balloon_kg
    while h < h_burst:
        _, _, rho = isa(h)
        V = V0 * rho0 / rho
        r = (3 * V / (4 * math.pi)) ** (1 / 3)
        v_up = math.sqrt(2 * G0 * free_lift_kg / (rho * 0.3 * math.pi * r * r))
        we, wn = wind_vector(h, winds)
        track.append((t, e, n, h, v_up))
        h += v_up * dt
        e += we * dt
        n += wn * dt
        t += dt
    t_burst = t
    area = math.pi * chute_d ** 2 / 4
    m_desc = payload_kg + 0.1 * balloon_kg                       # balloon shreds; some latex stays attached
    while h > site_alt:
        _, _, rho = isa(h)
        v_dn = math.sqrt(2 * m_desc * G0 / (rho * chute_cd * area))
        we, wn = wind_vector(h, winds)
        track.append((t, e, n, h, -v_dn))
        h -= v_dn * min(dt, max((h - site_alt) / v_dn, 0.05))
        e += we * dt
        n += wn * dt
        t += dt
    track.append((t, e, n, site_alt, 0.0))
    tr = np.array(track)
    lat = launch[0] + np.degrees(tr[:, 2] / EARTH_R)
    lon = launch[1] + np.degrees(tr[:, 1] / (EARTH_R * math.cos(math.radians(launch[0]))))
    _, _, rho_g = isa(site_alt)
    return dict(track=tr, lat=lat, lon=lon, burst_alt_m=h_burst, t_burst_s=t_burst, t_total_s=t,
                V0_m3=V0, ascent_mps_launch=tr[0, 4],
                landing_mps=math.sqrt(2 * m_desc * G0 / (rho_g * chute_cd * area)),
                landing=(lat[-1], lon[-1]), drift_km=math.hypot(tr[-1, 1], tr[-1, 2]) / 1000,
                helium_m3_stp=V0 * rho0 / 1.225 * (288.15 / 273.15))


def write_kml(res, path):
    coords = " ".join(f"{lo:.6f},{la:.6f},{h:.0f}" for la, lo, h in zip(res["lat"], res["lon"], res["track"][:, 3]))
    Path(path).write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Balloon prediction</name>
<Placemark><name>predicted path</name><LineString><altitudeMode>absolute</altitudeMode>
<coordinates>{coords}</coordinates></LineString></Placemark>
<Placemark><name>predicted landing</name><Point><coordinates>{res['lon'][-1]:.6f},{res['lat'][-1]:.6f},0</coordinates></Point></Placemark>
</Document></kml>
""")


def plot(res, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
    BLUE, ORANGE = "#2a78d6", "#eb6834"
    tr = res["track"]
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(12, 5), facecolor=SURFACE, gridspec_kw={"width_ratios": [1, 1.1]})
    for ax in (a1, a2):
        ax.set_facecolor(SURFACE)
        ax.grid(True, color=GRID, lw=0.6)
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)
        ax.tick_params(colors=INK2)
    up = tr[:, 4] > 0
    a1.plot(tr[up, 0] / 60, tr[up, 3] / 1000, color=BLUE, lw=2, label="ascent")
    a1.plot(tr[~up, 0] / 60, tr[~up, 3] / 1000, color=ORANGE, lw=2, label="descent under parachute")
    a1.annotate(f"burst {res['burst_alt_m'] / 1000:.1f} km", (res["t_burst_s"] / 60, res["burst_alt_m"] / 1000),
                xytext=(8, -4), textcoords="offset points", color=INK)
    a1.set_xlabel("time since launch (min)", color=INK2)
    a1.set_ylabel("altitude (km)", color=INK2)
    a1.legend(frameon=False, loc="lower center")
    a1.set_title("Altitude profile", loc="left", color=INK)
    a2.plot(tr[up, 1] / 1000, tr[up, 2] / 1000, color=BLUE, lw=2)
    a2.plot(tr[~up, 1] / 1000, tr[~up, 2] / 1000, color=ORANGE, lw=2)
    a2.plot(0, 0, "^", color=INK, ms=9, label="launch")
    a2.plot(tr[-1, 1] / 1000, tr[-1, 2] / 1000, "X", color=ORANGE, ms=11, label=f"landing, {res['drift_km']:.0f} km away")
    k = np.argmax(tr[:, 3])
    a2.plot(tr[k, 1] / 1000, tr[k, 2] / 1000, "o", color=INK2, ms=6, label="burst point")
    a2.text(0.99, 0.02, "axes not to scale", transform=a2.transAxes, ha="right", color=INK2, fontsize=8)
    a2.set_xlabel("east (km)", color=INK2)
    a2.set_ylabel("north (km)", color=INK2)
    a2.legend(frameon=False, fontsize=8.5, loc="upper left")
    a2.set_title("Ground track (illustrative wind profile)", loc="left", color=INK)
    fig.tight_layout()
    fig.savefig(path, dpi=140, facecolor=SURFACE)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--payload", type=float, default=1.2, help="kg, everything under the balloon incl. parachute")
    ap.add_argument("--balloon", type=float, default=0.6, help="balloon mass, kg (e.g. a 600 g latex balloon)")
    ap.add_argument("--burst-d", type=float, default=6.0, help="burst diameter, m (manufacturer's datasheet)")
    ap.add_argument("--free-lift", type=float, default=1.3, help="kg of lift beyond the total weight (neck lift)")
    ap.add_argument("--chute-d", type=float, default=1.2)
    ap.add_argument("--chute-cd", type=float, default=1.5)
    ap.add_argument("--launch", default="35.0,-117.0")
    ap.add_argument("--site-alt", type=float, default=700.0)
    ap.add_argument("--winds", help="CSV: altitude_m,speed_mps,direction_deg")
    ap.add_argument("--package", action="append", help="mass_kg:LxWxH_mm (repeat per package)")
    ap.add_argument("--line-lbf", type=float, default=50.0, help="force (lbf) needed to break the suspension line")
    ap.add_argument("--check-only", action="store_true")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parent.parent / "images" / "flight-prediction.png"))
    a = ap.parse_args()

    pk = []
    for s in a.package or [f"{a.payload}:200x200x200"]:
        m, d = s.split(":")
        pk.append(Package(float(m), tuple(float(x) for x in d.split("x"))))
    ok, why = part101_check(pk, a.line_lbf)
    print("FAA 14 CFR 101.1(a)(4) check:")
    for i, p in enumerate(pk, 1):
        print(f"  package {i}: {p.mass_kg * 1000:.0f} g = {p.mass_kg / LB:.2f} lb, smallest face {p.smallest_face_in2:.1f} in^2, "
              f"{p.ratio_oz_per_in2:.2f} oz/in^2")
    print("  -> EXEMPT from Subpart D (101.7 still applies)" if ok else "  -> NOT exempt: " + "; ".join(why))
    if a.check_only:
        return
    la, lo = map(float, a.launch.split(","))
    res = simulate(a.payload, a.balloon, a.burst_d, a.free_lift, a.chute_d, a.chute_cd, (la, lo), a.site_alt,
                   load_winds(a.winds))
    print(f"helium needed ~{res['helium_m3_stp']:.2f} m^3 (at 15 C, 1 atm); launch volume {res['V0_m3']:.2f} m^3")
    print(f"ascent rate at launch {res['ascent_mps_launch']:.1f} m/s; burst at {res['burst_alt_m'] / 1000:.1f} km after "
          f"{res['t_burst_s'] / 60:.0f} min")
    print(f"landing speed {res['landing_mps']:.1f} m/s; total flight {res['t_total_s'] / 60:.0f} min")
    print(f"predicted landing {res['landing'][0]:.4f}, {res['landing'][1]:.4f}  ({res['drift_km']:.1f} km from launch)")
    plot(res, a.out)
    kml = Path(__file__).resolve().parent.parent / "data" / "flight-prediction.kml"
    write_kml(res, kml)
    print("wrote", a.out, "and", kml)


if __name__ == "__main__":
    main()
