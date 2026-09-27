"""Tiny helpers shared by the module command-line interfaces."""

from __future__ import annotations

import argparse
import time


def parser(doc: str, prog: str) -> argparse.ArgumentParser:
    first = (doc or "").strip().splitlines()[0] if doc else prog
    p = argparse.ArgumentParser(
        prog=prog,
        description=first,
        epilog="Figures are written to outputs/ (git-ignored). Add --showcase to also refresh media/sims/.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    return p


def add_common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--outdir", default=None, help="output directory (default: <repo>/outputs)")
    p.add_argument("--showcase", action="store_true", help="also write the README gallery image into media/sims/")


class Timer:
    def __init__(self, label: str):
        self.label = label

    def __enter__(self):
        self.t0 = time.perf_counter()
        return self

    def __exit__(self, *exc):
        print(f"  {self.label}: {time.perf_counter() - self.t0:.2f} s")
