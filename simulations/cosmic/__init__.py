"""Cosmic Library simulation toolkit.

Small, readable, NumPy-first physics simulations that turn equations into
pictures.  Every module is importable *and* runnable from the command line:

    cd simulations
    python -m cosmic.black_hole_raytracer --help
    python -m cosmic.nbody figure8
    python -m cosmic.rocket_ascent saturn-v
    python -m cosmic.transfers porkchop
    python -m cosmic.exoplanet_transit
    python -m cosmic.stellar hr
    python -m cosmic.orbital_elements groundtrack

or, from the repository root, ``python simulations/run.py <module> [args]``.

Modules
-------
constants            physical constants (CODATA 2018, IAU 2015) in SI units
style                the shared dark plotting style and colour palette
stellar              Planck, Wien, Stefan-Boltzmann, blackbody colour, HR diagram
orbital_elements     Keplerian elements <-> state vectors, J2, ground tracks
transfers            Hohmann, bi-elliptic, Lambert solver, porkchop plots
nbody                symplectic N-body integrators (leapfrog, Yoshida 4th order)
rocket_ascent        2-D multistage ascent: gravity turn, drag, US Standard Atmosphere 1976
exoplanet_transit    Box Least Squares transit search on synthetic or TESS light curves
black_hole_raytracer Schwarzschild ray tracer with a Novikov-Thorne accretion disk
"""

__all__ = [
    "constants",
    "style",
    "stellar",
    "orbital_elements",
    "transfers",
    "nbody",
    "rocket_ascent",
    "exoplanet_transit",
    "black_hole_raytracer",
]

__version__ = "1.0.0"
