#!/usr/bin/env python3
"""Water-rocket flight simulator: how high does it go for a given pressure and water fill?

    python3 water_rocket_sim.py                          # sweep → images/fill_fraction.png
    python3 water_rocket_sim.py --psi 45 --fill 0.33     # one flight, printed summary

Model (vertical, 1-D). Pressures are gauge unless noted. SAFE RANGE ONLY: this script refuses
anything above 60 psi — see ../SAFETY.md.

 1. Water phase. Air expands adiabatically:  P V^γ = P_i V_i^γ  (γ = 1.4, absolute pressure)
    Water leaves the nozzle at Bernoulli speed  v_e = sqrt(2 (P - P_a) / ρ_w)
    Thrust F = ṁ v_e = ρ_w A v_e² = 2 A (P - P_a) · C_d      (C_d ≈ 0.9 discharge coefficient)
 2. Air phase. The remaining compressed air blows down through the neck: choked flow while
    P/P_a > 1.893, isentropic sub-sonic flow after that (standard compressible-nozzle relations).
 3. Coast. m dv/dt = −m g − ½ ρ_air v|v| C_D A_body
Neglected: the launch-tube boost, the water "slug" at the air transition, bottle stretch.
Real flights reach roughly 60–80 % of this idealised altitude.
"""
import argparse, math, os
import numpy as np

G, RHO_W, P_A, GAMMA, R_AIR, T_AMB = 9.80665, 998.0, 101325.0, 1.4, 287.05, 293.0
PSI = 6894.757


def fly(psi=45.0, fill=0.33, v_bottle=2.0e-3, nozzle_d=0.0215, body_d=0.110, m_dry=0.200,
        cd_body=0.45, cd_nozzle=0.90, dt=2e-5):
    if psi > 60:
        raise ValueError("this project stops at 60 psi (≈ 414 kPa gauge) — see SAFETY.md")
    A = math.pi * nozzle_d ** 2 / 4
    Ab = math.pi * body_d ** 2 / 4
    p_i = psi * PSI + P_A                      # absolute
    v_air_i = v_bottle * (1 - fill)
    v_air = v_air_i
    m_water = RHO_W * v_bottle * fill
    m_air = p_i * v_air_i / (R_AIR * T_AMB)
    t = h = v = 0.0
    impulse = 0.0
    phase = "water"
    burnout_t = None
    t_max = 30
    while t < t_max:
        rho_air = 1.2 * math.exp(-h / 8400)
        drag = 0.5 * rho_air * v * abs(v) * cd_body * Ab
        F = 0.0
        if phase == "water":
            p = p_i * (v_air_i / v_air) ** GAMMA
            if m_water <= 0 or p <= P_A:
                phase = "air"
                continue
            ve = math.sqrt(2 * (p - P_A) / RHO_W)
            q = cd_nozzle * A * ve                          # m³/s of water leaving
            F = RHO_W * q * ve
            m_water = max(0.0, m_water - RHO_W * q * dt)
            v_air += q * dt
        elif phase == "air":
            rho_b = m_air / v_bottle
            p = p_i * (rho_b / (p_i * v_air_i / (R_AIR * T_AMB) / v_air_i)) ** GAMMA  # isentropic from the start
            T = p / (rho_b * R_AIR)
            if p / P_A > ((GAMMA + 1) / 2) ** (GAMMA / (GAMMA - 1)):        # choked (≈ 1.893)
                mdot = cd_nozzle * A * p * math.sqrt(GAMMA / (R_AIR * T)) * (2 / (GAMMA + 1)) ** ((GAMMA + 1) / (2 * (GAMMA - 1)))
                Te = T * 2 / (GAMMA + 1)
                pe = p * (2 / (GAMMA + 1)) ** (GAMMA / (GAMMA - 1))
                ve = math.sqrt(GAMMA * R_AIR * Te)
                F = mdot * ve + (pe - P_A) * A
            elif p > P_A * 1.0005:
                M = math.sqrt(2 / (GAMMA - 1) * ((p / P_A) ** ((GAMMA - 1) / GAMMA) - 1))
                Te = T / (1 + (GAMMA - 1) / 2 * M * M)
                ve = M * math.sqrt(GAMMA * R_AIR * Te)
                mdot = cd_nozzle * (P_A / (R_AIR * Te)) * A * ve
                F = mdot * ve
            else:
                phase, burnout_t = "coast", t
                continue
            m_air = max(1e-6, m_air - mdot * dt)
        m = m_dry + m_water + (m_air if phase != "coast" else 0)
        impulse += F * dt
        a = (F - drag) / m - G
        v += a * dt
        h += v * dt
        t += dt
        if phase == "coast" and v < 0:
            return dict(apogee=h, t_apogee=t, burnout=burnout_t, impulse=impulse)
        if phase == "coast" and dt < 1e-3:
            dt = 1e-3                                     # no need for tiny steps once coasting
    return dict(apogee=h, t_apogee=t, burnout=burnout_t, impulse=impulse)


def sweep(out):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    SURF, INK, INK2, MUTED, GRID = "#0b0f1c", "#e9edff", "#c3cae6", "#8f98bd", "#1b2238"
    colors = {30: "#7cc8ff", 45: "#b18cff", 60: "#ff7a3d"}
    fills = np.linspace(0.05, 0.7, 40)
    fig, ax = plt.subplots(figsize=(8.5, 5), dpi=130, facecolor=SURF)
    ax.set_facecolor(SURF)
    ax.grid(True, color=GRID, lw=0.8)
    for s in ax.spines.values():
        s.set_visible(False)
    ax.tick_params(colors=MUTED, length=0)
    for psi, c in colors.items():
        hs = np.array([fly(psi, f)["apogee"] for f in fills])
        i = int(np.argmax(hs))
        ax.plot(fills * 100, hs, color=c, lw=2, label=f"{psi} psi")
        ax.plot(fills[i] * 100, hs[i], "o", ms=8, color=c, mec=SURF, mew=2)
        ax.annotate(f"{psi} psi: best {fills[i]*100:.0f} % → {hs[i]:.0f} m", (fills[i] * 100, hs[i]),
                    xytext=(8, 6), textcoords="offset points", color=INK, fontsize=9.5)
        print(f"{psi} psi: optimum fill {fills[i]*100:.0f} % → {hs[i]:.1f} m (idealised)")
    ax.set_xlabel("water fill (% of bottle volume)", color=INK2)
    ax.set_ylabel("apogee (m), idealised", color=INK2)
    ax.set_title("2 L water rocket, 200 g dry: altitude vs water fill", color=INK, loc="left", fontsize=12)
    ax.legend(frameon=False, labelcolor=INK2, loc="upper right")
    fig.savefig(out, facecolor=SURF, bbox_inches="tight")
    print("wrote", out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--psi", type=float)
    ap.add_argument("--fill", type=float, default=0.33)
    ap.add_argument("--mass", type=float, default=0.200, help="dry mass, kg")
    a = ap.parse_args()
    if a.psi is None:
        sweep(os.path.join(os.path.dirname(os.path.abspath(__file__)), "images", "fill_fraction.png"))
    else:
        r = fly(a.psi, a.fill, m_dry=a.mass)
        print(f"{a.psi} psi, {a.fill*100:.0f} % water: impulse {r['impulse']:.1f} N·s, thrust ends at "
              f"{r['burnout']*1000:.0f} ms, apogee {r['apogee']:.1f} m at {r['t_apogee']:.2f} s (idealised)")


if __name__ == "__main__":
    main()
