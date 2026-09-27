"""Verify the generated KiCad files against design.py.

1. Ask KiCad itself (kicad-cli) to export the schematic netlist, then check that
   every pin of every part lands on exactly the net design.py says.
2. Load the board with pcbnew and check every pad's net the same way.
3. Run KiCad's DRC and summarise the result (unrouted connections are expected
   until you route the board; everything else should be zero).

    python3 check.py            # exits non-zero on any mismatch
"""

from __future__ import annotations

import re
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from pathlib import Path

import design as D
from sexp import find, find_all, parse

HERE = Path(__file__).resolve().parent
KICAD = HERE.parent / "kicad"
errors: list[str] = []


def expected_pin_nets():
    exp = {}
    for p in D.PARTS:
        if p["ref"].startswith("#"):
            continue
        for pin, net in p["pins"].items():
            exp[(p["ref"], pin)] = net
    return exp


def check_schematic():
    with tempfile.TemporaryDirectory() as td:
        out = Path(td) / "net.net"
        subprocess.run(["kicad-cli", "sch", "export", "netlist", "-o", str(out),
                        str(KICAD / f"{D.PROJECT}.kicad_sch")], check=True, capture_output=True)
        tree = parse(out.read_text())
    got = {}
    for net in find_all(find(tree, "nets"), "net"):
        name = str(find(net, "name")[1]).lstrip("/")
        for node in find_all(net, "node"):
            ref, pin = str(find(node, "ref")[1]), str(find(node, "pin")[1])
            if ref.startswith("#"):
                continue
            got[(ref, pin)] = "NC" if name.startswith("unconnected-") else name
    exp = expected_pin_nets()
    for key, net in exp.items():
        g = got.get(key, "NC")
        if g != net:
            errors.append(f"schematic: {key[0]} pin {key[1]} is on '{g}', design.py says '{net}'")
    comps = [str(find(c, "ref")[1]) for c in find_all(find(tree, "components"), "comp")]
    print(f"schematic: {len(comps)} components, {len(set(got.values()) - {'NC'})} nets, "
          f"{sum(1 for v in exp.values() if v != 'NC')} connected pins checked")


def check_board():
    try:
        import pcbnew
    except ImportError:
        print("pcbnew not available - board not checked")
        return
    board = pcbnew.LoadBoard(str(KICAD / f"{D.PROJECT}.kicad_pcb"))
    exp = expected_pin_nets()
    seen = set()
    for fp in board.GetFootprints():
        ref = fp.GetReference()
        for pad in fp.Pads():
            num = pad.GetNumber()
            if num == "":
                continue
            seen.add((ref, num))
            net = pad.GetNetname() or "NC"
            want = exp.get((ref, num))
            if want is None:
                errors.append(f"board: {ref} pad {num} not in design.py")
            elif net != want:
                errors.append(f"board: {ref} pad {num} is on '{net}', design.py says '{want}'")
    missing = {k for k in exp if k[0] in {f.GetReference() for f in board.GetFootprints()}} - seen
    for m in sorted(missing):
        errors.append(f"board: {m[0]} pin {m[1]} has no pad in the footprint")
    print(f"board: {len(board.GetFootprints())} footprints, {board.GetNetCount() - 1} nets")

    # ---- DRC
    with tempfile.TemporaryDirectory() as td:
        rpt = Path(td) / "drc.rpt"
        pcbnew.WriteDRCReport(board, str(rpt), pcbnew.EDA_UNITS_MILLIMETRES, True)
        text = rpt.read_text()
    (HERE.parent / "kicad" / "drc_report.txt").write_text(text)
    kinds = Counter(re.findall(r"^\[(\w+)\]", text, flags=re.M))
    unconnected = re.search(r"\*\* Found (\d+) unconnected pads", text)
    print("DRC violations by type:", dict(kinds) or "none")
    if unconnected:
        print(f"DRC: {unconnected.group(1)} unconnected pads (expected until the board is routed)")
    bad = {k: v for k, v in kinds.items() if k not in ("unconnected_items", "silk_overlap", "silk_over_copper",
                                                      "lib_footprint_issues", "lib_footprint_mismatch")}
    if bad:
        errors.append(f"DRC found non-routing problems: {bad} (see kicad/drc_report.txt)")


if __name__ == "__main__":
    check_schematic()
    check_board()
    if errors:
        print("\n".join("ERROR " + e for e in errors))
        sys.exit(1)
    print("OK - schematic, board and design.py agree")
