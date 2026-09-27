"""Simulated telemetry source: a rocket flight + GPS + a LoRa link model.

Produces exactly the lines the real ground receiver prints ("RX,rssi,snr,hex"), so the ground
station app, its parser and its plots are exercised end to end without any radio hardware.

Physics: 1-D vertical flight (illustrative ~H-class thrust curve, quadratic drag), then drift with
the wind under a drogue and a main parachute. Link: free-space loss while airborne, two-ray loss
when the rocket is on the ground, log-normal shadowing, a random attitude null of the rocket's
antenna, and packet success decided by the SNR margin over the LoRa demodulation floor.
"""
from __future__ import annotations

import math
import random

import telemetry as T
from linkbudget import fspl_db, noise_floor_dbm, plane_earth_db, SNR_MIN

EARTH_R = 6_371_000.0
LAUNCH = (35.0, -117.0)              # a generic desert launch site
STATION_OFFSET = (-900.0, -600.0)    # ground station 1.1 km south-west of the pad (east, north metres)


def offset_latlon(lat0, lon0, east_m, north_m):
    dlat = north_m / EARTH_R
    dlon = east_m / (EARTH_R * math.cos(math.radians(lat0)))
    return lat0 + math.degrees(dlat), lon0 + math.degrees(dlon)


def thrust(t):
    """Illustrative thrust curve (N), not a real motor."""
    if t < 0:
        return 0.0
    if t < 0.05:
        return 230.0 * t / 0.05
    if t < 0.25:
        return 230.0 - 60.0 * (t - 0.05) / 0.2
    if t < 1.65:
        return 170.0 - 15.0 * (t - 0.25) / 1.4
    if t < 1.9:
        return 155.0 * (1.9 - t) / 0.25
    return 0.0


class Flight:
    """Integrates the flight at 10 ms and yields (t, state, h, v, a_g, east, north)."""

    def __init__(self, pad_s=10.0, wind_e=6.0, wind_n=2.5, seed=0):
        self.pad_s, self.wind_e, self.wind_n = pad_s, wind_e, wind_n
        self.rng = random.Random(seed)

    def run(self):
        dt, t = 0.01, 0.0
        h = v = 0.0
        e = n = 0.0
        m_dry, m_prop, burn = 1.55, 0.14, 1.9
        area, cd = math.pi * 0.0205 ** 2, 0.55
        state, max_h = 0, 0.0
        drogue_cda = 2 * 9.81 * m_dry / (1.225 * 22 ** 2)
        main_cda = 2 * 9.81 * m_dry / (1.225 * 6 ** 2)
        t_apo = t_land = None
        while True:
            tf = t - self.pad_s
            m = m_dry + m_prop * max(0.0, 1 - tf / burn) if tf > 0 else m_dry + m_prop
            rho = 1.225 * math.exp(-h / 8500)
            cda = cd * area
            if state >= 4:
                cda = main_cda if h < 150 else drogue_cda
            F = thrust(tf) if state <= 1 else 0.0
            a = (F - 0.5 * rho * v * abs(v) * cda) / m - 9.81 if state not in (0, 5) else 0.0
            if state == 0 and F > m * 9.81:
                state = 1
            if state in (1, 2, 3, 4):
                v += a * dt
                h += v * dt
                # weathercock + wind: gentle downrange drift in the air, full wind drift under canopy
                k = 0.15 if state <= 2 else 1.0
                e += self.wind_e * k * dt
                n += self.wind_n * k * dt
            if state == 1 and tf > burn:
                state = 2
            if state == 2 and v <= 0:
                state, t_apo = 3, t
            elif state == 3:
                state = 4
            if state == 4 and h <= 0:
                h, v, state, t_land = 0.0, 0.0, 5, t
            max_h = max(max_h, h)
            f_mag = abs(a / 9.81 + 1) if state not in (0, 5) else 1.0
            yield t, state, h, v, f_mag, e, n, max_h
            t += dt
            if t_land is not None and t > t_land + 30:
                return


def lines(launch=LAUNCH, station_offset=STATION_OFFSET, tx_dbm=14.0, tx_gain=-3.0, rx_gain=6.0,
          sf=9, bw_hz=500e3, period_s=0.25, beacon_s=2.0, seed=1, loss_extra=0.0):
    """Yield (t_seconds, line) pairs as the receiver would print them."""
    rng = random.Random(seed)
    lat0, lon0 = launch
    se, sn = station_offset
    floor = noise_floor_dbm(bw_hz)
    seq, next_tx = 0, 0.0
    for t, state, h, v, a_g, e, n, max_h in Flight(seed=seed).run():
        period = beacon_s if state == 5 else period_s
        if t + 1e-9 < next_tx:
            continue
        next_tx = t + period
        lat, lon = offset_latlon(lat0, lon0, e, n)
        gps_ok = state != 1 and rng.random() > 0.02  # many GPS modules drop out briefly under thrust
        payload = T.encode(state, seq, int(t * 1000), h, v, a_g, lat if gps_ok else None, lon if gps_ok else None,
                           int(max_h), 4.05 - t / 3600 * 0.2, 9 if gps_ok else 0)
        seq += 1
        # ---- link
        dx, dy = e - se, n - sn
        ground = math.hypot(dx, dy)
        dist = math.hypot(ground, h - 1.5)
        loss = plane_earth_db(ground, 0.3, 2.0, 915e6) if state in (0, 5) else fspl_db(dist, 915e6)
        attitude_null = 12.0 if (state in (2, 4) and rng.random() < 0.08) else 0.0
        rssi = tx_dbm + tx_gain + rx_gain - 2.0 - loss - attitude_null + rng.gauss(0, 3.0) - loss_extra
        snr = rssi - floor
        p_ok = 1 / (1 + math.exp(-(snr - SNR_MIN[sf]) / 1.0))
        if rng.random() > p_ok:
            continue
        yield t, T.format_line(payload, max(rssi, -140), max(min(snr, 12.0), -20.0))
