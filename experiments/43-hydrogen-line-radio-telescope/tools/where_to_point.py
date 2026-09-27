#!/usr/bin/env python3
"""Where is the Galactic plane right now? Alt/az of points (l, b = 0) for your site and time.

    python3 where_to_point.py --lat 33.74 --lon -118.29 --time "2026-10-10T03:00:00"   # time in UTC
    python3 where_to_point.py --lat 51.5 --lon -0.1 --horn-alt 60 --horn-az 180 --hours 12

With --horn-alt/--horn-az (a fixed "drift-scan" horn) it lists, hour by hour, the galactic
coordinates the beam centre points at - plan when the plane drifts through the beam at l = 20-80 deg.
Needs astropy (offline is fine; it may warn about IERS tables).
"""
import argparse

import numpy as np
from astropy import units as u
from astropy.coordinates import AltAz, EarthLocation, SkyCoord
from astropy.time import Time
from astropy.utils import iers

iers.conf.auto_download = False


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--lat", type=float, required=True)
    ap.add_argument("--lon", type=float, required=True, help="east positive")
    ap.add_argument("--time", default=None, help="UTC ISO time (default: now)")
    ap.add_argument("--horn-alt", type=float)
    ap.add_argument("--horn-az", type=float)
    ap.add_argument("--hours", type=float, default=12)
    a = ap.parse_args()
    loc = EarthLocation(lat=a.lat * u.deg, lon=a.lon * u.deg)
    t0 = Time(a.time) if a.time else Time.now()
    if a.horn_alt is None:
        frame = AltAz(obstime=t0, location=loc)
        print(f"{t0.iso} UTC at {a.lat:.2f}, {a.lon:.2f}")
        print("   l     alt     az   (point the horn here; keep alt > 30 deg to stay clear of the ground)")
        for l in range(0, 360, 10):
            c = SkyCoord(l=l * u.deg, b=0 * u.deg, frame="galactic").transform_to(frame)
            mark = "  <- usable for the rotation curve" if 20 <= l <= 80 and c.alt.deg > 30 else ""
            print(f"{l:4d} {c.alt.deg:7.1f} {c.az.deg:6.1f}{mark}")
    else:
        print(f"fixed horn at alt {a.horn_alt:.1f}, az {a.horn_az:.1f}: galactic coordinates of the beam centre")
        for h in np.arange(0, a.hours + 1e-9, 0.5):
            t = t0 + h * u.hour
            c = SkyCoord(alt=a.horn_alt * u.deg, az=a.horn_az * u.deg, frame=AltAz(obstime=t, location=loc)).galactic
            mark = "  <- in the plane, 20 < l < 80" if abs(c.b.deg) < 5 and 20 <= c.l.deg <= 80 else ""
            print(f"{t.iso[:16]}  l = {c.l.deg:6.1f}  b = {c.b.deg:+6.1f}{mark}")


if __name__ == "__main__":
    main()
