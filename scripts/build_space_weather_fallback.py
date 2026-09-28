#!/usr/bin/env python3
"""Build site/data/space-weather-fallback.json, the offline sample for space-weather.html.

It is a RECONSTRUCTION of the 10-11 May 2024 "Gannon" G5 geomagnetic storm, not a
measured record. The curves are synthetic but pinned to published values:
  - shock at the L1 monitors ~16:40 UTC on 10 May 2024 (sudden commencement ~17:05 UTC)
  - solar wind speed 750-950 km/s on 11-12 May; IMF magnitude up to 73 nT, Bz down to -50 nT
  - Kp reached 9 (G5); Dst minimum -412 nT at 03:00 UTC on 11 May (not drawn)
  - flares from active region 13664: X1.0 (8 May 05:09), X2.2 (9 May 09:13), X1.1 (9 May 17:44),
    X3.9 (10 May 06:54), X5.8 (11 May 01:23), times and peaks approximate
  Sources: NOAA SWPC event summaries; Wikipedia "May 2024 solar storms" (retrieved 2026-09-28).
The Kp series is an approximate reconstruction. Deterministic (fixed random seed).

    python3 scripts/build_space_weather_fallback.py
"""
import json, math, os, random
from datetime import datetime, timedelta, timezone

random.seed(20240510)
UTC = timezone.utc
START = datetime(2024, 5, 4, 2, 0, tzinfo=UTC)
NOW = datetime(2024, 5, 11, 2, 0, tzinfo=UTC)
STEP = 10  # minutes
N = int((NOW - START).total_seconds() // (STEP * 60)) + 1
T = [START + timedelta(minutes=STEP * i) for i in range(N)]
H = lambda d: (d - datetime(2024, 5, 10, 16, 40, tzinfo=UTC)).total_seconds() / 3600  # hours after the shock


def smooth_noise(n, scale, corr=6):
    out, x = [], 0.0
    a = math.exp(-1 / corr)
    for _ in range(n):
        x = a * x + math.sqrt(1 - a * a) * random.gauss(0, 1)
        out.append(x * scale)
    return out


nv, nn, nb, ny, nt = (smooth_noise(N, s, c) for s, c in ((18, 18), (0.35, 8), (2.2, 5), (2.5, 5), (0.2, 10)))
wind, mag = [], []
for i, d in enumerate(T):
    h = H(d)
    days = (d - START).total_seconds() / 86400
    # quiet slow wind, a mild high-speed stream on 6-7 May, a glancing CME late on 9 May
    v = 370 + 60 * math.exp(-((days - 2.6) / 0.7) ** 2) + 45 * math.exp(-((days - 5.95) / 0.25) ** 2) + nv[i]
    n = max(0.8, 5.5 * math.exp(nn[i]) * (1 + 0.8 * math.exp(-((days - 2.2) / 0.3) ** 2)))
    temp = 7e4 * math.exp(nt[i]) * (1 + 0.8 * math.exp(-((days - 2.6) / 0.7) ** 2))
    bt = 5.5 + abs(nb[i]) * 0.6
    bz = nb[i] * 1.4
    by = ny[i]
    if h >= 0:  # CME sheath then magnetic ejecta
        if h < 2.9:        # turbulent, dense, hot sheath
            v = 690 + 25 * h + nv[i] * 1.5
            n = 28 + 12 * math.sin(h * 3.1) + 6 * nn[i] * 8
            temp = 5.5e5 * math.exp(nt[i])
            bt = 30 + 6 * h + abs(nb[i]) * 2
            bz = -12 + 18 * math.sin(h * 4.3) + nb[i] * 4
            by = 20 * math.cos(h * 2.7) + ny[i] * 3
        elif h < 6.4:      # first ejecta: strongly southward, peak |B| 73 nT
            k = (h - 2.9) / 3.5
            v = 740 + 30 * k + nv[i]
            n = 12 - 6 * k + abs(nn[i]) * 6
            temp = 1.4e5 * math.exp(nt[i])
            bt = 52 + 21 * math.sin(math.pi * min(1, k * 1.15)) + nb[i]
            bz = -(bt * (0.62 + 0.3 * math.sin(math.pi * k))) + nb[i]
            by = 18 * math.sin(k * 5) + ny[i] * 2
        elif h < 7.3:      # brief northward turning
            v = 770 + nv[i]; n = 9 + nn[i] * 5; temp = 1.6e5
            bt = 38 + nb[i]; bz = 22 + nb[i] * 3; by = -10 + ny[i]
        else:              # next CME arrives: southward again, speed climbing towards 800+
            k = (h - 7.3) / 2.2
            v = 780 + 25 * k + nv[i]
            n = 9 + 5 * math.exp(-k * 2) + abs(nn[i]) * 3
            temp = 2.2e5 * math.exp(nt[i])
            bt = 40 + 6 * math.sin(k * 2) + nb[i]
            bz = -24 - 10 * math.sin(k * 2.4) + nb[i] * 2
            by = 12 * math.cos(k * 3) + ny[i]
        bt = max(bt, abs(bz) + 1)
    wind.append([round(v), round(max(0.5, n), 1), int(round(temp, -3))])
    bz = max(-50.0, bz)  # published minimum about -50 nT
    mag.append([round(bz, 1), round(min(bt, 73.0), 1), round(by, 1)])

# GOES 0.1-0.8 nm flux, 10-minute maxima
bg = [1.1e-6 * (1 + 3.2 * min(1, max(0, ((d - START).total_seconds() / 86400 - 1.5) / 3.5))) * math.exp(0.25 * x) for d, x in zip(T, smooth_noise(N, 1, 20))]
flares = [("2024-05-08 05:09", 1.0e-4), ("2024-05-08 21:40", 1.0e-4), ("2024-05-09 09:13", 2.2e-4), ("2024-05-09 17:44", 1.1e-4),
          ("2024-05-10 06:54", 3.9e-4), ("2024-05-11 01:23", 5.8e-4)]
for _ in range(38):  # M-class flares from the same regions
    t = START + timedelta(hours=random.uniform(40, 166))
    flares.append((t.strftime("%Y-%m-%d %H:%M"), 10 ** random.uniform(-5, -4.25)))
for _ in range(60):
    t = START + timedelta(hours=random.uniform(0, 168))
    flares.append((t.strftime("%Y-%m-%d %H:%M"), 10 ** random.uniform(-5.9, -5.05)))
xr = list(bg)
for ts, pk in flares:
    tp = datetime.strptime(ts, "%Y-%m-%d %H:%M").replace(tzinfo=UTC)
    tau = 18 + 30 * (math.log10(pk) + 6) / 2   # minutes; bigger flares decay slower
    for i, d in enumerate(T):
        dt = (d - tp).total_seconds() / 60
        if -40 < dt < 600:
            f = pk * (math.exp(-((dt / 9) ** 2)) if dt < 0 else math.exp(-dt / tau))
            xr[i] = max(xr[i], f + bg[i] * 0.3)
for ts, pk in flares:  # make sure each 10-minute maximum holds the flare's peak
    tp = datetime.strptime(ts, "%Y-%m-%d %H:%M").replace(tzinfo=UTC)
    i = int((tp - START).total_seconds() // (STEP * 60))
    if 0 <= i < N:
        xr[i] = max(xr[i], pk)
xray = [float(f"{f:.3g}") for f in xr]
xray[-1] = 1.9e-4  # 02:00 UTC 11 May: decaying X5.8 flare, still above X1

KP_START = datetime(2024, 5, 4, 0, 0, tzinfo=UTC)
kp = [2, 2, 1.67, 1.33, 2, 2.33, 2, 1.67,   2, 1.67, 1.33, 1.67, 2, 2.33, 2.67, 2,
      2.33, 2, 1.67, 2, 2.67, 3, 2.33, 2,   2, 2.33, 2, 1.67, 2, 2.33, 2.67, 3,
      3, 2.67, 2.33, 2, 2.33, 2.67, 3, 3.33,  3.67, 3, 2.67, 2.33, 2.67, 3, 3.33, 3.67,
      3, 2.67, 2.33, 2.67, 3.33, 5.33, 8.67, 9,   9]
kp = kp[:int((NOW - KP_START).total_seconds() // (3 * 3600)) + 1]
kp[-1] = 9
kpf = [8.67, 8.33, 7.67, 7, 6.67, 7.33, 7.67, 6.67, 6, 5.67, 5, 4.67, 5, 5.33, 4.67, 4.33, 4, 3.67, 3.33, 3.67, 4, 3.33, 3, 3]

def alert(t, code, lines):
    return {"t": t, "code": code, "msg": "\r\n".join([f"Space Weather Message Code: {code}", "Serial Number: (sample)", f"Issue Time: {t} UTC", ""] + lines)}

alerts = [
    alert("2024-05-11T01:47:00Z", "SUMX01", ["SUMMARY: X-ray Event exceeded X1", "Begin Time: 2024 May 11 0110 UTC", "Maximum Time: 2024 May 11 0123 UTC", "X-ray Class at Maximum: X5.8", "NOAA Scale: R3 - Strong", "", "Potential Impacts: Area of impact consists of large portions of the sunlit side of Earth, strongest at the sub-solar point. Radio - Wide area blackout of HF (high frequency) radio communication for about an hour."]),
    alert("2024-05-11T01:31:00Z", "ALTTP2", ["ALERT: Type II Radio Emission", "Begin Time: 2024 May 11 0123 UTC", "", "Description: Type II emissions occur in association with eruptions on the sun and typically indicate a coronal mass ejection is associated with a flare event."]),
    alert("2024-05-10T22:54:00Z", "ALTK09", ["ALERT: Geomagnetic K-index of 9", "Threshold Reached: 2024 May 10 2254 UTC", "Synoptic Period: 2100-2400 UTC", "Active Warning: Yes", "NOAA Scale: G5 - Extreme", "", "Potential Impacts: Area of impact primarily poleward of 45 degrees Geomagnetic Latitude. Aurora - Aurora may be seen as low as Alabama and northern California."]),
    alert("2024-05-10T18:00:00Z", "ALTK08", ["ALERT: Geomagnetic K-index of 8", "Threshold Reached: 2024 May 10 1800 UTC", "Synoptic Period: 1800-2100 UTC", "Active Warning: Yes", "NOAA Scale: G4 - Severe"]),
    alert("2024-05-10T17:10:00Z", "SUMSUD", ["SUMMARY: Geomagnetic Sudden Impulse", "Observed: 2024 May 10 1705 UTC", "", "Comment: Coronal mass ejection arrival."]),
    alert("2024-05-10T16:45:00Z", "WARSUD", ["WARNING: Geomagnetic Sudden Impulse expected", "Valid From: 2024 May 10 1650 UTC", "IP Shock Passage Observed: 2024 May 10 1636 UTC at DSCOVR"]),
    alert("2024-05-10T13:50:00Z", "ALTPX1", ["ALERT: Proton 10MeV Integral Flux exceeded 10pfu", "Begin Time: 2024 May 10 1335 UTC", "NOAA Scale: S1 - Minor"]),
    alert("2024-05-09T20:05:00Z", "WATA50", ["WATCH: Geomagnetic Storm Category G4 Predicted", "", "Highest Storm Level Predicted by Day:", "May 10:  G4 (Severe)   May 11:  G4 (Severe)   May 12:  G3 (Strong)"]),
]

out = {
    "meta": {
        "label": "Sample: the May 2024 \"Gannon\" G5 storm",
        "note": "Offline sample. A reconstruction of 4-11 May 2024 built to match published values (shock at L1 about 16:40 UTC on 10 May; Kp 9; IMF magnitude 73 nT with Bz down to -50 nT; speeds 750-950 km/s; X5.8 flare at 01:23 UTC on 11 May). Curves between those points are synthetic. Built by scripts/build_space_weather_fallback.py.",
        "start": START.isoformat().replace("+00:00", "Z"), "stepMin": STEP, "now": NOW.isoformat().replace("+00:00", "Z"),
        "kpStart": KP_START.isoformat().replace("+00:00", "Z"), "source": "sample"
    },
    "wind": wind, "mag": mag, "xray": xray, "kp": kp, "kpForecast": kpf,
    "scales": {
        "cur": {"R": {"s": 3}, "S": {"s": 1}, "G": {"s": 5}},
        "max24": {"R": {"s": 3}, "S": {"s": 1}, "G": {"s": 5}},
        "fc": [{"R": {"s": None, "minor": 75, "major": 40}, "S": {"s": None, "p": 30}, "G": {"s": 4}},
               {"R": {"s": None, "minor": 75, "major": 40}, "S": {"s": None, "p": 25}, "G": {"s": 3}},
               {"R": {"s": None, "minor": 70, "major": 35}, "S": {"s": None, "p": 20}, "G": {"s": 1}}]
    },
    "alerts": alerts,
}
path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "site", "data", "space-weather-fallback.json")
with open(path, "w") as f:
    json.dump(out, f, separators=(",", ":"))
print("wrote", os.path.normpath(path), os.path.getsize(path), "bytes;", N, "steps")
