#!/usr/bin/env python3
"""Run any Cosmic Library simulation from the repository root.

    python simulations/run.py <simulation> [options]
    python simulations/run.py blackhole --gif
    python simulations/run.py showcase          # regenerate every README image into media/sims/

Simulations: blackhole, nbody, rocket, transfers, transit, stellar, orbits, showcase.
Each accepts --help.
"""

import importlib
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))

ALIASES = {
    "blackhole": "cosmic.black_hole_raytracer", "black_hole_raytracer": "cosmic.black_hole_raytracer",
    "nbody": "cosmic.nbody",
    "rocket": "cosmic.rocket_ascent", "rocket_ascent": "cosmic.rocket_ascent",
    "transfers": "cosmic.transfers", "porkchop": "cosmic.transfers",
    "transit": "cosmic.exoplanet_transit", "exoplanet_transit": "cosmic.exoplanet_transit",
    "stellar": "cosmic.stellar", "hr": "cosmic.stellar",
    "orbits": "cosmic.orbital_elements", "orbital_elements": "cosmic.orbital_elements",
    "showcase": "make_showcase",
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] in ("-h", "--help"):
        print(__doc__)
        return
    name = sys.argv[1]
    if name not in ALIASES:
        sys.exit(f"unknown simulation {name!r}; choose from {', '.join(sorted(set(ALIASES)))}")
    mod = importlib.import_module(ALIASES[name])
    mod.main(sys.argv[2:])


if __name__ == "__main__":
    main()
