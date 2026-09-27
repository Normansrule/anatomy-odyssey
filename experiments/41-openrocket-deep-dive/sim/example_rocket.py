"""The example rocket used throughout experiment 41: "CC-38 Pathfinder".

A 38 mm (1.64 in OD) minimum-fuss Level 1-style rocket that carries the CC-FL1 flight logger
of experiment 30. Build the same rocket in OpenRocket (component by component, same masses) and
compare - that is the core exercise of this experiment. Positions are metres from the nose tip.
"""
from __future__ import annotations

import math
from pathlib import Path

import barrowman as B
from rocketsim import Motor, Rocket
from sim3dof import Airframe

HERE = Path(__file__).resolve().parent
ENG = HERE.parent / "motors" / "CC-DEMO-H154.eng"

D = 0.0416            # body outer diameter (m)
NOSE_L = 0.20         # tangent ogive, 4.8 calibres
BODY_END = 1.15       # tail of the body tube
FINS = B.Fins(n=3, root=0.09, tip=0.035, span=0.032, sweep=0.050, x_le=BODY_END - 0.10)
MOTOR_LEN = 0.25
MOTOR_X = BODY_END - MOTOR_LEN / 2   # motor flush with the tail
CHUTE_D, CHUTE_CD = 0.61, 1.5        # 24 inch elliptical parachute

# (name, mass kg, CG position m, length m for the inertia of long parts / 0 for compact parts)
COMPONENTS = [
    ("nose cone (PETG, printed, with shoulder)", 0.120, 0.14, 0.0),
    ("body tube 38 mm, 0.95 m (phenolic)", 0.360, (NOSE_L + BODY_END) / 2, BODY_END - NOSE_L),
    ("av-bay: coupler, bulkheads, CC-FL1 + sled + Li-Po", 0.260, 0.40, 0.14),
    ("recovery: 24 in chute, 3 m harness, protector", 0.160, 0.62, 0.0),
    ("motor mount tube + centering rings + retainer", 0.080, 1.03, 0.25),
    ("3 fins, 1.6 mm G10", 0.070, FINS.x_le + 0.045, 0.0),
    ("epoxy, paint, rail buttons", 0.060, 0.80, 0.0),
]


def geometry():
    parts = [("nose (ogive)", *B.nose("ogive", NOSE_L)), ("3 fins + interference", *B.fins(FINS, D))]
    cn, x_cp = B.cp([(c, x) for _, c, x in parts])
    return parts, cn, x_cp


def airframe() -> Airframe:
    parts, cn, x_cp = geometry()
    dry, x_cg = B.cg([(m, x) for _, m, x, _ in COMPONENTS])
    i_dry = sum(m * (x - x_cg) ** 2 + m * L ** 2 / 12 for _, m, x, L in COMPONENTS)
    return Airframe(cn_alpha=cn, x_cp=x_cp, cn_parts=[(c, x) for _, c, x in parts], x_cg_dry=x_cg, dry_mass=dry,
                    i_dry=i_dry, motor_x=MOTOR_X, motor_len=MOTOR_LEN, x_nozzle=BODY_END)


def rocket(cd0=0.50, **kw) -> Rocket:
    dry = sum(m for _, m, _, _ in COMPONENTS)
    return Rocket(dry_mass=dry, diameter=D, cd0=cd0, chute_cd_area=CHUTE_CD * math.pi * CHUTE_D ** 2 / 4, **kw)


def motor(scale=1.0) -> Motor:
    return Motor.from_eng(ENG, scale=scale)


def stability_report():
    parts, cn, x_cp = geometry()
    m = motor()
    dry, x_cg_dry = B.cg([(mm, x) for _, mm, x, _ in COMPONENTS])
    tot, x_cg = B.cg([(dry, x_cg_dry), (m.total_mass, MOTOR_X)])
    _, x_cg_b = B.cg([(dry, x_cg_dry), (m.total_mass - m.prop_mass, MOTOR_X)])
    lines = ["Barrowman CP (subsonic):"]
    for name, c, x in parts:
        lines.append(f"  {name:24s} C_Na = {c:6.3f} /rad at X = {x * 1000:6.1f} mm")
    lines += [f"  total C_Na = {cn:.3f} /rad, X_cp = {x_cp * 1000:.1f} mm from the nose tip",
              f"mass: dry {dry * 1000:.0f} g + motor {m.total_mass * 1000:.0f} g = {tot * 1000:.0f} g at lift-off",
              f"CG at lift-off {x_cg * 1000:.1f} mm -> stability margin {(x_cp - x_cg) / D:.2f} calibres",
              f"CG at burnout  {x_cg_b * 1000:.1f} mm -> stability margin {(x_cp - x_cg_b) / D:.2f} calibres"]
    return "\n".join(lines), (x_cp - x_cg) / D


if __name__ == "__main__":
    print(stability_report()[0])
