"""Load symbols from KiCad's installed libraries (and our project library).

KiCad library symbols may `extends` a parent symbol (e.g. AP2112K-3.3 is
derived from AP2204K-1.5). A schematic must embed *flattened* copies of
every symbol it uses, so `load_symbol()` resolves the inheritance chain.
"""

from __future__ import annotations

import copy
import os
from functools import lru_cache
from pathlib import Path

from sexp import QStr, find, find_all, parse

HERE = Path(__file__).resolve().parent
PROJECT_LIB = HERE.parent / "kicad" / "cosmic_codex.kicad_sym"

SYMBOL_DIRS = [
    Path(os.environ.get("KICAD_SYMBOL_DIR", "/usr/share/kicad/symbols")),
    Path("/usr/share/kicad/symbols"),
    Path("/Applications/KiCad/KiCad.app/Contents/SharedSupport/symbols"),
    Path("C:/Program Files/KiCad/8.0/share/kicad/symbols"),
]


@lru_cache(maxsize=None)
def _lib(libname: str):
    if libname == "cosmic_codex":
        return parse(PROJECT_LIB.read_text())
    for d in SYMBOL_DIRS:
        p = d / f"{libname}.kicad_sym"
        if p.exists():
            return parse(p.read_text())
    raise FileNotFoundError(f"KiCad symbol library {libname} not found; set KICAD_SYMBOL_DIR")


def _raw(libname: str, name: str):
    for s in find_all(_lib(libname), "symbol"):
        if s[1] == name:
            return s
    raise KeyError(f"{libname}:{name}")


def load_symbol(lib_id: str):
    """Return a flattened symbol list named `lib_id` (e.g. "Device:R")."""
    libname, name = lib_id.split(":")
    sym = copy.deepcopy(_raw(libname, name))
    ext = find(sym, "extends")
    if ext is not None:
        parent = load_symbol(f"{libname}:{ext[1]}")
        pname = parent[1].split(":")[1]
        # start from parent, override properties with the child's
        out = [x for x in parent if not (isinstance(x, list) and x[0] == "property")]
        out[1] = QStr(name)
        child_props = find_all(sym, "property")
        # insert child's properties after the flags
        idx = next(i for i, x in enumerate(out) if isinstance(x, list) and x[0] == "symbol")
        out[idx:idx] = child_props
        # rename unit sub-symbols
        for x in out:
            if isinstance(x, list) and x[0] == "symbol":
                x[1] = QStr(str(x[1]).replace(pname + "_", name + "_", 1))
        sym = out
    sym[1] = QStr(lib_id)
    return sym


def symbol_pins(sym):
    """List of dicts: number, name, type, x, y (symbol coords, Y up), angle, length."""
    pins = []
    for unit in find_all(sym, "symbol"):
        for p in find_all(unit, "pin"):
            at = find(p, "at")
            pins.append({
                "type": p[1],
                "number": str(find(p, "number")[1]),
                "name": str(find(p, "name")[1]),
                "x": float(at[1]), "y": float(at[2]), "angle": int(float(at[3])),
                "length": float(find(p, "length")[1]),
            })
    return pins


if __name__ == "__main__":
    import sys
    for lid in sys.argv[1:]:
        s = load_symbol(lid)
        print("==", lid)
        for p in sorted(symbol_pins(s), key=lambda p: (len(p["number"]), p["number"])):
            print(f"   {p['number']:>4} {p['name']:<14} {p['type']:<14} ({p['x']:7.2f},{p['y']:7.2f}) a={p['angle']}")
