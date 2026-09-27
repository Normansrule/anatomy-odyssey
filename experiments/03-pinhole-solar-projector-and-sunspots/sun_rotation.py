#!/usr/bin/env python3
"""Measure the Sun's rotation period from your sunspot drawings.

    python3 sun_rotation.py data-sheet.csv
    python3 sun_rotation.py --example            # uses example-data-illustrative.csv

Data-sheet columns: date_utc (YYYY-MM-DD HH:MM), spot_id, x_mm, y_mm, disk_diameter_mm
  x_mm : spot position measured from the disk centre ALONG the direction the spots drift
         (east → west across the projected image), positive towards the limb they drift to
  y_mm : spot position measured perpendicular to that, from the centre (either sign)
Measure on your paper tracing; the units cancel because only x/R and y/R matter.

Geometry (ignoring the small tilt of the solar axis, B0 ≤ 7.25°):
    latitude   φ = asin(y / R)
    longitude  λ = asin( x / (R cos φ) )          (measured from the central meridian)
A spot's longitude grows linearly in time:  λ(t) = λ0 + ω t, so the slope ω (degrees/day)
gives the SYNODIC period P_syn = 360° / ω (as seen from the moving Earth). Correct for
Earth's orbital motion to get the SIDEREAL period:  1/P_sid = 1/P_syn + 1/365.256 d.
Near the solar equator P_sid ≈ 25.4 days (Carrington's 25.38 d); spots at higher latitude
rotate more slowly (differential rotation).
"""
import argparse, csv, math, os
from datetime import datetime
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("csv", nargs="?")
    ap.add_argument("--example", action="store_true")
    a = ap.parse_args()
    path = os.path.join(HERE, "example-data-illustrative.csv") if a.example else a.csv
    if not path:
        ap.error("give your data-sheet.csv or --example")
    spots = defaultdict(list)
    with open(path) as f:
        for r in csv.DictReader(f):
            try:
                t = datetime.strptime(r["date_utc"].strip(), "%Y-%m-%d %H:%M")
                R = float(r["disk_diameter_mm"]) / 2
                x, y = float(r["x_mm"]) / R, float(r["y_mm"]) / R
            except (ValueError, KeyError):
                continue
            lat = math.asin(max(-1, min(1, y)))
            lon = math.asin(max(-1, min(1, x / math.cos(lat))))
            spots[r["spot_id"].strip()].append((t, math.degrees(lon), math.degrees(lat)))
    if not spots:
        raise SystemExit("no complete rows found")
    periods = []
    for sid, obs in spots.items():
        if len(obs) < 2:
            continue
        obs.sort()
        t0 = obs[0][0]
        ts = [(o[0] - t0).total_seconds() / 86400 for o in obs]
        ls = [o[1] for o in obs]
        n = len(ts); mt, ml = sum(ts) / n, sum(ls) / n
        w = sum((t - mt) * (l - ml) for t, l in zip(ts, ls)) / sum((t - mt) ** 2 for t in ts)
        p_syn = 360 / w
        p_sid = 1 / (1 / p_syn + 1 / 365.256)
        lat = sum(o[2] for o in obs) / n
        periods.append(p_sid)
        print(f"spot {sid:>4}: {n} sightings over {ts[-1]:.1f} d, latitude ≈ {lat:+.0f}°, "
              f"ω = {w:.2f}°/day → synodic {p_syn:.1f} d, sidereal {p_sid:.1f} d")
    if periods:
        print(f"\nmean sidereal rotation period: {sum(periods) / len(periods):.1f} days "
              f"(Carrington: 25.38 d; equator ≈ 24.5 d, 30° latitude ≈ 26.5 d)")


if __name__ == "__main__":
    main()
