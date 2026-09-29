#!/usr/bin/env python3
"""Regenerate every README concept animation into media/readme/concepts/.

    python3 scripts/readme_art/concepts/build.py

Each fig_*.py is deterministic (fixed random seeds), writes one SVG, checks
that it is well-formed XML and at most 60 KB. See _lib.py for the conventions.
"""
import importlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
FIGS = ["fig_rocket", "fig_hohmann", "fig_kepler", "fig_light", "fig_orbits", "fig_hoverslam",
        "fig_blackhole", "fig_staging", "fig_mars", "fig_metro", "fig_scale",
        "fig_resolution", "fig_transit", "fig_redshift", "fig_wavelengths", "fig_sunspots", "fig_linkbudget"]

if __name__ == "__main__":
    for name in FIGS:
        importlib.import_module(name).build()
