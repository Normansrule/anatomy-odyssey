#!/usr/bin/env python3
"""Regenerate every gallery image in media/sims/ (used by the READMEs).

    python simulations/make_showcase.py            # all figures (~3-5 minutes on a laptop)
    python simulations/make_showcase.py --only blackhole porkchop
    python simulations/make_showcase.py --no-gif

Images are also written to outputs/.  Showcase PNGs are kept under ~700 KB and GIFs under 4 MB.
"""

import argparse
import pathlib
import sys
import time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

JOBS = ["blackhole", "geodesics", "figure8", "porkchop", "ascent", "transit", "hr", "planck", "groundtrack"]


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    p.add_argument("--only", nargs="*", choices=JOBS, default=None)
    p.add_argument("--no-gif", action="store_true")
    a = p.parse_args(argv)
    jobs = a.only or JOBS

    from cosmic import black_hole_raytracer as bh
    from cosmic import exoplanet_transit, nbody, orbital_elements, rocket_ascent, stellar, transfers
    from cosmic.style import MEDIA

    t_all = time.perf_counter()
    for job in jobs:
        t0 = time.perf_counter()
        if job == "blackhole":
            bh.render_black_hole(bh.Scene(width=1200, height=675, supersample=2), showcase=True)
            if not a.no_gif:
                bh.render_gif(frames=30, showcase=True)
        elif job == "geodesics":
            bh.plot_geodesics(showcase=True)
        elif job == "figure8":
            nbody.plot_figure8(showcase=True)
            if not a.no_gif:
                nbody.figure8_gif(showcase=True)
        elif job == "porkchop":
            transfers.plot_porkchop(showcase=True)
        elif job == "ascent":
            rocket_ascent.plot_ascent(showcase=True)
        elif job == "transit":
            exoplanet_transit.run(showcase=True)
        elif job == "hr":
            stellar.plot_hr(showcase=True)
        elif job == "planck":
            stellar.plot_planck(showcase=True)
        elif job == "groundtrack":
            orbital_elements.plot_ground_track(showcase=True)
        print(f"[showcase] {job:12s} {time.perf_counter() - t0:6.1f} s")
    print(f"[showcase] done in {time.perf_counter() - t_all:.0f} s")
    for f in sorted(MEDIA.glob("*")):
        print(f"  {f.relative_to(MEDIA.parents[1])}  {f.stat().st_size / 1024:7.0f} KB")


if __name__ == "__main__":
    main()
