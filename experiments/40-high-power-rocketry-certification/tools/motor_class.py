#!/usr/bin/env python3
"""Which letter class is a motor, and which certification / FAA class does a rocket need?

    python3 motor_class.py 285                    # total impulse in N*s
    python3 motor_class.py ../../41-openrocket-deep-dive/motors/CC-DEMO-H.eng
    python3 motor_class.py 285 --mass 1.7 --rail 1.8 --avg-thrust 150

Letter classes double at each step: A is 1.26-2.50 N*s, B up to 5, C up to 10 ... H 160.01-320,
I up to 640, J up to 1280 ... O up to 40 960 N*s.  Certification levels (NAR and Tripoli):
H-I = Level 1, J-L = Level 2, M-O = Level 3.  FAA 14 CFR 101.22: a rocket is Class 2 (high-power)
up to 40 960 N*s of combined impulse; above that it is Class 3.

This is an educational helper, not a substitute for the NAR / Tripoli codes or your RSO.
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

LETTERS = "ABCDEFGHIJKLMNO"


def letter_class(impulse_ns: float) -> str:
    if impulse_ns <= 0.3125:
        return "1/8A"
    if impulse_ns <= 0.625:
        return "1/4A"
    if impulse_ns <= 1.25:
        return "1/2A"
    k = math.ceil(math.log2(impulse_ns / 2.5))  # A: (1.25, 2.5] -> k = 0
    k = max(k, 0)
    return LETTERS[k] if k < len(LETTERS) else "beyond O"


def class_range(letter: str):
    k = LETTERS.index(letter)
    return 1.25 * 2 ** k, 2.5 * 2 ** k


def certification(letter: str) -> str:
    if letter in ("H", "I"):
        return "Level 1 (NAR or Tripoli)"
    if letter in ("J", "K", "L"):
        return "Level 2"
    if letter in ("M", "N", "O"):
        return "Level 3"
    if letter in ("G",) or letter < "G":
        return "no certification (model rocket motors; high-power rules can still apply by mass/propellant)"
    return "beyond hobby certification (research / FAA Class 3)"


def read_eng(path: Path):
    """Parse a RASP .eng file: returns (name, total impulse N*s, burn time s, average thrust N, prop mass kg, total mass kg)."""
    lines = [l.strip() for l in path.read_text().splitlines() if l.strip() and not l.strip().startswith(";")]
    head = lines[0].split()
    name, prop_kg, total_kg = head[0], float(head[4]), float(head[5])
    pts = [(0.0, 0.0)] + [tuple(map(float, l.split()[:2])) for l in lines[1:] if len(l.split()) >= 2]
    impulse = sum((t2 - t1) * (f1 + f2) / 2 for (t1, f1), (t2, f2) in zip(pts, pts[1:]))
    burn = pts[-1][0]
    return name, impulse, burn, impulse / burn, prop_kg, total_kg


def selftest():
    cases = [(1.26, "A"), (2.5, "A"), (2.51, "B"), (10, "C"), (80, "F"), (160, "G"), (160.01, "H"), (320, "H"),
             (320.01, "I"), (640, "I"), (640.01, "J"), (5120, "L"), (5120.1, "M"), (40960, "O")]
    for impulse, want in cases:
        got = letter_class(impulse)
        assert got == want, (impulse, got, want)
    print(f"selftest: {len(cases)} class boundaries OK")


def main():
    import sys
    if "--selftest" in sys.argv:
        return selftest()
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("motor", help="total impulse in N*s, or a RASP .eng file")
    ap.add_argument("--mass", type=float, help="rocket lift-off mass incl. motor, kg")
    ap.add_argument("--avg-thrust", type=float, help="average thrust, N (read from .eng if given)")
    ap.add_argument("--rail", type=float, help="launch rail/rod length, m")
    args = ap.parse_args()

    p = Path(args.motor)
    avg = args.avg_thrust
    if p.suffix.lower() == ".eng" and p.exists():
        name, impulse, burn, avg_eng, prop, total = read_eng(p)
        avg = avg or avg_eng
        print(f"{name}: total impulse {impulse:.1f} N*s, burn {burn:.2f} s, average thrust {avg_eng:.1f} N, "
              f"propellant {prop * 1000:.0f} g, loaded mass {total * 1000:.0f} g")
    else:
        impulse = float(args.motor)
    L = letter_class(impulse)
    if L in LETTERS:
        lo, hi = class_range(L)
        pct = (impulse - lo) / (hi - lo) * 100
        print(f"class {L}  ({lo:g}-{hi:g} N*s; this motor is {pct:.0f} % of the way through the class)")
    else:
        print(f"class {L}")
    print(f"certification needed to fly it: {certification(L)}")
    if impulse > 40960:
        faa = "Class 3 advanced high-power rocket"
    elif L in LETTERS and LETTERS.index(L) <= LETTERS.index("G"):
        faa = ("Class 1 model rocket IF it also meets 101.22(a): <= 125 g slow-burning propellant, <= 1500 g, "
               "no substantial metal parts; otherwise Class 2")
    else:
        faa = "Class 2 high-power rocket (flown under a club's FAA waiver/authorization; ATC notified)"
    print("FAA 14 CFR 101.22: " + faa)
    if args.mass and avg:
        tw = avg / (args.mass * 9.80665)
        print(f"average thrust-to-weight {tw:.1f} : 1" + ("  <- LOW: pick a stronger motor or lighten the rocket" if tw < 5 else ""))
        if args.rail:
            # rail-exit speed with constant average thrust, ignoring drag and rail friction (optimistic)
            a = avg / args.mass - 9.80665
            v = math.sqrt(max(2 * a * args.rail, 0))
            print(f"rail-exit speed about {v:.1f} m/s ({v * 3.281:.0f} ft/s) - clubs commonly want at least 15 m/s (~50 ft/s);"
                  " check with a real simulation (experiment 41)")


if __name__ == "__main__":
    main()
