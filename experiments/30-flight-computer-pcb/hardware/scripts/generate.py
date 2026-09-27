"""Generate the KiCad project for the Cosmic Codex flight logger from design.py.

Outputs (in ../kicad/):
    cc-flight-logger.kicad_sch   schematic (KiCad 7 file format; opens in KiCad 7, 8 and 9)
    cc-flight-logger.kicad_pcb   board: outline, placed footprints, nets, GND pours
    cc-flight-logger.kicad_pro   project file with net classes
and ../BOM.csv

Requires: Python 3.9+, and for the board the `pcbnew` module that ships with KiCad
(Linux: `sudo apt install kicad`; on Windows/macOS run it with KiCad's bundled Python).

    python3 make_library.py && python3 generate.py && python3 check.py
"""

from __future__ import annotations

import csv
import json
import math
import sys
import uuid
from collections import defaultdict
from pathlib import Path

import design as D
from kicadlib import load_symbol, symbol_pins
from sexp import QStr as Q
from sexp import dumps, find

HERE = Path(__file__).resolve().parent
KICAD = HERE.parent / "kicad"
NS = uuid.UUID("8f0c7d43-5c52-4a3e-9d7e-1b5a2c9e0f11")


def uid(*parts) -> str:
    """Deterministic UUID so re-running the generator gives identical files."""
    return str(uuid.uuid5(NS, "/".join(str(p) for p in parts)))


def snap(v: float) -> float:
    return round(round(v / 1.27) * 1.27, 4)


FONT = ["effects", ["font", ["size", 1.27, 1.27]]]
ROOT_UUID = uid("root-sheet")

# direction vectors on screen (Y down)
DIRS = {"right": (1, 0), "left": (-1, 0), "up": (0, -1), "down": (0, 1)}


def pin_screen(part_xy, rot, px, py, angle):
    """Symbol pin (Y up) -> absolute schematic position and outward direction (screen)."""
    r = math.radians(rot)
    rx = px * math.cos(r) - py * math.sin(r)
    ry = px * math.sin(r) + py * math.cos(r)
    x, y = part_xy[0] + rx, part_xy[1] - ry
    out_angle = (angle + 180 + rot) % 360  # outward direction, CCW degrees, Y up
    out = {0: "right", 90: "up", 180: "left", 270: "down"}[int(round(out_angle)) % 360]
    return snap(x), snap(y), out


class Schematic:
    def __init__(self):
        self.items = []
        self.wires = set()
        self.labels = set()
        self.nocon = set()
        self.pwr_count = 0
        self.lib_ids = set()

    # ---- primitives
    def wire(self, a, b):
        if a == b:
            return
        key = tuple(sorted([a, b]))
        if key in self.wires:
            return
        self.wires.add(key)
        self.items.append(["wire", ["pts", ["xy", a[0], a[1]], ["xy", b[0], b[1]]],
                           ["stroke", ["width", 0], ["type", "default"]], ["uuid", uid("w", key)]])

    def label(self, net, x, y, out):
        key = (net, x, y)
        if key in self.labels:
            return
        self.labels.add(key)
        ang, just = {"right": (0, "left"), "left": (180, "right"), "up": (90, "left"), "down": (270, "right")}[out]
        self.items.append(["label", Q(net), ["at", x, y, ang], ["fields_autoplaced"],
                           ["effects", ["font", ["size", 1.27, 1.27]], ["justify", just, "bottom"]],
                           ["uuid", uid("l", net, x, y)]])

    def power(self, net, x, y, out):
        key = ("pwr", net, x, y)
        if key in self.labels:
            return
        self.labels.add(key)
        lib_id = D.POWER_NETS[net]
        natural_down = net == "GND"
        rot = ({"down": 0, "right": 90, "up": 180, "left": 270} if natural_down
               else {"up": 0, "left": 90, "down": 180, "right": 270})[out]
        self.pwr_count += 1
        ref = f"#PWR{self.pwr_count:03d}"
        self.symbol(lib_id, ref, net, (x, y), rot, fp="", fields={}, hide_ref=True,
                    value_offset=(0, 3.81 if natural_down else -3.81))

    def no_connect(self, x, y):
        if (x, y) in self.nocon:
            return
        self.nocon.add((x, y))
        self.items.append(["no_connect", ["at", x, y], ["uuid", uid("nc", x, y)]])

    def text(self, x, y, size, s):
        self.items.append(["text", Q(s), ["at", x, y, 0],
                           ["effects", ["font", ["size", size, size], "bold"], ["justify", "left", "bottom"]],
                           ["uuid", uid("t", s)]])

    def symbol(self, lib_id, ref, value, xy, rot, fp, fields, hide_ref=False, value_offset=None,
               in_bom=True):
        self.lib_ids.add(lib_id)
        sym = load_symbol(lib_id)
        x, y = xy
        su = uid("sym", ref)
        node = ["symbol", ["lib_id", Q(lib_id)], ["at", x, y, rot], ["unit", 1],
                ["in_bom", "yes" if in_bom else "no"], ["on_board", "yes" if fp or not ref.startswith("#") else "no"],
                ["dnp", "no"], ["uuid", su]]
        is_two_pin = lib_id in ("Device:R", "Device:C")
        if is_two_pin and rot == 0:
            rpos, vpos = (x + 2.54, y - 1.27), (x + 2.54, y + 1.27)
        elif is_two_pin:
            rpos, vpos = (x, y - 3.81), (x, y + 3.81)
        else:
            rpos, vpos = self._lib_prop_pos(sym, "Reference", xy, rot), self._lib_prop_pos(sym, "Value", xy, rot)
        if value_offset is not None:
            vpos = (x + value_offset[0], y + value_offset[1])
        just_rv = ["justify", "left"] if is_two_pin and rot == 0 else None

        def p(name, val, pos, hidden, just=None):
            eff = ["effects", ["font", ["size", 1.27, 1.27]]]
            if just:
                eff.append(just)
            if hidden:
                eff.append("hide")
            return ["property", Q(name), Q(val), ["at", pos[0], pos[1], 0], eff]

        node.append(p("Reference", ref, rpos, hide_ref, just_rv))
        node.append(p("Value", value, vpos, False, just_rv))
        node.append(p("Footprint", fp, (x, y), True))
        ds = find(sym, "property")
        datasheet = "~"
        for pr in sym:
            if isinstance(pr, list) and pr[0] == "property" and pr[1] == "Datasheet":
                datasheet = str(pr[2]) or "~"
        node.append(p("Datasheet", datasheet, (x, y), True))
        for k, v in fields.items():
            node.append(p(k, v, (x, y), True))
        for pin in symbol_pins(sym):
            node.append(["pin", Q(pin["number"]), ["uuid", uid("pin", ref, pin["number"])]])
        node.append(["instances", ["project", Q(D.PROJECT),
                                   ["path", Q("/" + ROOT_UUID), ["reference", Q(ref)], ["unit", 1]]]])
        self.items.append(node)
        return sym

    @staticmethod
    def _lib_prop_pos(sym, name, xy, rot):
        for pr in sym:
            if isinstance(pr, list) and pr[0] == "property" and pr[1] == name:
                at = find(pr, "at")
                px, py = float(at[1]), float(at[2])
                r = math.radians(rot)
                rx = px * math.cos(r) - py * math.sin(r)
                ry = px * math.sin(r) + py * math.cos(r)
                return (round(xy[0] + rx, 3), round(xy[1] - ry, 3))
        return xy


def build_schematic():
    sch = Schematic()
    for x, y, size, s in D.NOTES:
        sch.text(x, y, size, s)

    # ---- pass 1: place symbols, draw pin stubs, remember where every stub ends
    all_stubs = []          # (ref, net, out, end)
    pin_points = set()      # every pin tip and stub end (to keep direct wires from touching them)
    for part in D.PARTS:
        x, y, rot = part["sch"]
        x, y = snap(x), snap(y)
        b = part.get("bom") or {}
        fields = {}
        if b:
            fields = {"Manufacturer": b["mfr"], "MPN": b["mpn"], "LCSC": b["lcsc"], "DigiKey": b["digikey"]}
        sym = sch.symbol(part["lib"], part["ref"], part["value"], (x, y), rot, part["fp"], fields,
                         hide_ref=part["ref"].startswith("#"), in_bom=bool(b))
        for pin in symbol_pins(sym):
            net = part["pins"].get(pin["number"])
            if net is None:
                raise SystemExit(f"{part['ref']} pin {pin['number']} ({pin['name']}) has no net in design.py")
            px, py, out = pin_screen((x, y), rot, pin["x"], pin["y"], pin["angle"])
            pin_points.add((px, py))
            if net == "NC":
                sch.no_connect(px, py)
                continue
            dx, dy = DIRS[out]
            end = (snap(px + dx * 2.54), snap(py + dy * 2.54))
            sch.wire((px, py), end)
            pin_points.add(end)
            all_stubs.append((part["ref"], net, out, end))

    # ---- pass 2: short point-to-point nets get a real wire (easier to read than two labels)
    by_net = defaultdict(list)
    for st in all_stubs:
        by_net[st[1]].append(st)
    wired = set()

    def on_segment(p, a, b):
        return (min(a[0], b[0]) - 1e-6 <= p[0] <= max(a[0], b[0]) + 1e-6 and
                min(a[1], b[1]) - 1e-6 <= p[1] <= max(a[1], b[1]) + 1e-6 and
                (abs(a[0] - b[0]) < 1e-6 or abs(a[1] - b[1]) < 1e-6))

    for net, sts in by_net.items():
        if net in D.POWER_NETS or len(sts) != 2 or sts[0][0] == sts[1][0]:
            continue
        a, b = sts[0][3], sts[1][3]
        if math.dist(a, b) > 45:
            continue
        others = pin_points - {a, b}
        for corner in ((b[0], a[1]), (a[0], b[1])):
            segs = [(a, corner), (corner, b)]
            if not any(on_segment(p, s0, s1) for p in others for s0, s1 in segs):
                sch.wire(a, corner)
                sch.wire(corner, b)
                sch.label(net, a[0], a[1], sts[0][2])  # one label keeps the net name
                wired.add(net)
                break

    # ---- pass 3: labels / power symbols for everything else, merging neighbouring stubs
    groups = defaultdict(list)
    for ref, net, out, end in all_stubs:
        if net not in wired:
            groups[(ref, net, out)].append(end)
    for (ref, net, out), ends in groups.items():
        ends = sorted(set(ends))
        clusters, cur = [], [ends[0]]
        for e in ends[1:]:
            prev = cur[-1]
            colinear = (out in ("up", "down") and e[1] == prev[1]) or (out in ("left", "right") and e[0] == prev[0])
            if colinear and math.dist(e, prev) <= 5.09:
                cur.append(e)
            else:
                clusters.append(cur)
                cur = [e]
        clusters.append(cur)
        for cl in clusters:
            for a, bb in zip(cl, cl[1:]):
                sch.wire(a, bb)
            anchor = cl[-1] if out in ("left", "right") else cl[0]
            if net in D.POWER_NETS:
                sch.power(net, anchor[0], anchor[1], out)
            else:
                sch.label(net, anchor[0], anchor[1], out)
    print(f"schematic: {len(wired)} point-to-point nets drawn as wires, the rest as labels")

    lib_symbols = ["lib_symbols"] + [load_symbol(l) for l in sorted(sch.lib_ids)]
    root = ["kicad_sch", ["version", 20230121], ["generator", "eeschema"], ["uuid", ROOT_UUID],
            ["paper", Q("A3")],
            ["title_block", ["title", Q(D.TITLE)], ["date", Q(D.DATE)], ["rev", Q(D.REV)],
             ["company", Q("Cosmic Codex - github.com/Normansrule/cosmic-codex")],
             ["comment", 1, Q("Rocket flight DATA LOGGER: barometer + IMU + microSD + beeper + telemetry header")],
             ["comment", 2, Q("Generated by hardware/scripts/generate.py from design.py - edit design.py, not this file")],
             ["comment", 3, Q("License: CERN-OHL-P-2.0")]],
            lib_symbols, *sch.items,
            ["sheet_instances", ["path", Q("/"), ["page", Q("1")]]]]
    out = KICAD / f"{D.PROJECT}.kicad_sch"
    out.write_text(dumps(root) + "\n")
    return out


# =====================================================================  PCB
def build_pcb():
    try:
        import pcbnew
    except ImportError:
        print("pcbnew module not available - skipping board generation (install KiCad)")
        return None
    MM = pcbnew.FromMM
    OX, OY = 100.0, 100.0  # board origin on the KiCad canvas

    path = KICAD / f"{D.PROJECT}.kicad_pcb"
    board = pcbnew.NewBoard(str(path))
    ds = board.GetDesignSettings()
    ds.SetCopperLayerCount(2)
    ds.m_TrackMinWidth = MM(0.15)
    ds.m_ViasMinSize = MM(0.5)
    ds.m_MinThroughDrill = MM(0.3)
    ds.m_CopperEdgeClearance = MM(0.3)
    ds.m_HoleClearance = MM(0.25)

    # ---- outline with 1.5 mm corner radius
    W, H, r = D.BOARD_W, D.BOARD_H, 1.5

    def seg(x1, y1, x2, y2):
        s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_SEGMENT)
        s.SetStart(pcbnew.VECTOR2I(MM(OX + x1), MM(OY + y1)))
        s.SetEnd(pcbnew.VECTOR2I(MM(OX + x2), MM(OY + y2)))
        s.SetLayer(pcbnew.Edge_Cuts)
        s.SetWidth(MM(0.1))
        board.Add(s)

    def arc(cx, cy, a0):
        s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_ARC)
        pts = [(cx + r * math.cos(math.radians(a)), cy + r * math.sin(math.radians(a))) for a in (a0, a0 + 45, a0 + 90)]
        v = [pcbnew.VECTOR2I(MM(OX + px), MM(OY + py)) for px, py in pts]
        s.SetArcGeometry(v[0], v[1], v[2])
        s.SetLayer(pcbnew.Edge_Cuts)
        s.SetWidth(MM(0.1))
        board.Add(s)

    seg(r, 0, W - r, 0); seg(W, r, W, H - r); seg(W - r, H, r, H); seg(0, H - r, 0, r)
    arc(W - r, r, 270); arc(W - r, H - r, 0); arc(r, H - r, 90); arc(r, r, 180)

    # ---- nets
    nets = {}
    for part in D.PARTS:
        for n in part["pins"].values():
            if n != "NC" and n not in nets:
                ni = pcbnew.NETINFO_ITEM(board, n)
                board.Add(ni)
                nets[n] = ni

    # ---- footprints
    lib_dirs = [Path("/usr/share/kicad/footprints"), KICAD]
    placed = []
    for part in D.PARTS:
        if part["pcb"] is None:
            continue
        lib, name = part["fp"].split(":")
        libpath = KICAD / "cosmic_codex.pretty" if lib == "cosmic_codex" else Path("/usr/share/kicad/footprints") / f"{lib}.pretty"
        fp = pcbnew.FootprintLoad(str(libpath), name)
        if fp is None:
            raise SystemExit(f"footprint {part['fp']} not found")
        fp.SetFPID(pcbnew.LIB_ID(lib, name))
        fp.SetReference(part["ref"])
        fp.SetValue(part["value"])
        fp.SetPath(pcbnew.KIID_PATH("/" + uid("sym", part["ref"])))
        x, y, rot, side = part["pcb"]
        fp.SetPosition(pcbnew.VECTOR2I(MM(OX + x), MM(OY + y)))
        board.Add(fp)  # must belong to a board before Flip()
        if side == "B":
            fp.Flip(fp.GetPosition(), False)
        fp.SetOrientationDegrees(rot)
        for pad in fp.Pads():
            num = pad.GetNumber()
            if num == "":
                continue
            net = part["pins"].get(num)
            if net is None:
                raise SystemExit(f"{part['ref']} pad {num} not in design.py")
            if net != "NC":
                pad.SetNet(nets[net])
        if part["ref"].startswith("H"):
            fp.Reference().SetVisible(False)
        if part["ref"] in ("U3", "U4"):
            # fine-pitch LGA ground pads: solid (not thermal-relief) connection to the pour
            fp.SetZoneConnection(pcbnew.ZONE_CONNECTION_FULL)
        # keep reference text on the board: if it would hang over the edge, put it on the part
        tb = fp.Reference().GetBoundingBox()
        if (MM(OX + 0.4) > tb.GetX() or MM(OY + 0.4) > tb.GetY() or
                tb.GetRight() > MM(OX + D.BOARD_W - 0.4) or tb.GetBottom() > MM(OY + D.BOARD_H - 0.4)):
            fp.Reference().SetPosition(fp.GetPosition())
            fp.Reference().SetTextSize(pcbnew.VECTOR2I(MM(0.8), MM(0.8)))
            fp.Reference().SetTextThickness(MM(0.12))
        placed.append(fp)

    # ---- silkscreen
    def text(s, x, y, layer, size=1.0, mirror=False):
        t = pcbnew.PCB_TEXT(board)
        t.SetText(s)
        t.SetPosition(pcbnew.VECTOR2I(MM(OX + x), MM(OY + y)))
        t.SetLayer(layer)
        t.SetTextSize(pcbnew.VECTOR2I(MM(size), MM(size)))
        t.SetTextThickness(MM(size * 0.15))
        if mirror:
            t.SetMirrored(True)
        board.Add(t)

    text("CC-FL1 rev A", 66.5, 1.2, pcbnew.F_SilkS, 0.8)
    text("NOSE >", 71.5, 28.8, pcbnew.F_SilkS, 0.8)
    text("cosmic-codex  CC-FL1", 20.0, 28.9, pcbnew.B_SilkS, 0.8, mirror=True)
    text("DATA LOGGER ONLY", 20.0, 1.1, pcbnew.B_SilkS, 0.8, mirror=True)

    # ---- ground pours on both layers
    gnd = nets["GND"]
    for layer in (pcbnew.F_Cu, pcbnew.B_Cu):
        z = pcbnew.ZONE(board)
        z.SetLayer(layer)
        z.SetNet(gnd)
        z.SetLocalClearance(MM(0.3))
        z.SetMinThickness(MM(0.25))
        z.SetThermalReliefGap(MM(0.4))
        z.SetThermalReliefSpokeWidth(MM(0.4))
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL)
        z.SetZoneName("GND_" + ("TOP" if layer == pcbnew.F_Cu else "BOTTOM"))
        ol = z.Outline()
        ol.NewOutline()
        for px, py in [(0.4, 0.4), (W - 0.4, 0.4), (W - 0.4, H - 0.4), (0.4, H - 0.4)]:
            ol.Append(MM(OX + px), MM(OY + py))
        board.Add(z)
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())

    pcbnew.SaveBoard(str(path), board)
    return path


def write_project():
    """Minimal .kicad_pro with two net classes (signal 0.25 mm, power 0.5 mm)."""
    pro = KICAD / f"{D.PROJECT}.kicad_pro"
    data = {}
    if pro.exists():
        try:
            data = json.loads(pro.read_text())
        except json.JSONDecodeError:
            data = {}
    data.setdefault("meta", {"filename": pro.name, "version": 1})
    data["net_settings"] = {
        "classes": [
            {"name": "Default", "clearance": 0.15, "track_width": 0.25, "via_diameter": 0.6, "via_drill": 0.3,
             "diff_pair_width": 0.2, "diff_pair_gap": 0.25, "diff_pair_via_gap": 0.25,
             "microvia_diameter": 0.3, "microvia_drill": 0.1, "bus_width": 12, "wire_width": 6,
             "line_style": 0, "pcb_color": "rgba(0, 0, 0, 0.000)", "schematic_color": "rgba(0, 0, 0, 0.000)"},
            {"name": "Power", "clearance": 0.15, "track_width": 0.5, "via_diameter": 0.8, "via_drill": 0.4,
             "diff_pair_width": 0.2, "diff_pair_gap": 0.25, "diff_pair_via_gap": 0.25,
             "microvia_diameter": 0.3, "microvia_drill": 0.1, "bus_width": 12, "wire_width": 6,
             "line_style": 0, "pcb_color": "rgba(0, 0, 0, 0.000)", "schematic_color": "rgba(0, 0, 0, 0.000)"},
        ],
        "meta": {"version": 3},
        "net_colors": None,
        "netclass_assignments": None,
        "netclass_patterns": [{"netclass": "Power", "pattern": p}
                              for p in ["GND", "VBUS", "VBUS_C", "VSYS", "+BATT", "VBAT_SW", "+3V3"]],
    }
    data.setdefault("board", {}).setdefault("design_settings", {})
    data["text_variables"] = {"PROJECT_URL": "https://github.com/Normansrule/cosmic-codex"}
    pro.write_text(json.dumps(data, indent=2) + "\n")


def write_bom():
    rows = defaultdict(list)
    for part in D.PARTS:
        b = part.get("bom")
        if not b:
            continue
        key = (part["value"], b["mpn"], part["fp"])
        rows[key].append(part)
    out = HERE.parent / "BOM.csv"
    with out.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["References", "Qty", "Value", "Description", "Manufacturer", "MPN", "Footprint",
                    "LCSC", "DigiKey", "Side", "Notes"])
        for (value, mpn, fp), parts in sorted(rows.items(), key=lambda kv: _refkey(kv[1][0]["ref"])):
            b = parts[0]["bom"]
            refs = ",".join(p["ref"] for p in sorted(parts, key=lambda p: _refkey(p["ref"])))
            sides = sorted({p["pcb"][3] for p in parts if p["pcb"]})
            notes = "; ".join(sorted({p["bom"]["note"] for p in parts if p["bom"]["note"]}))
            w.writerow([refs, len(parts), value, b["desc"], b["mfr"], mpn, fp, b["lcsc"], b["digikey"],
                        "/".join("top" if s == "F" else "bottom" for s in sides), notes])
    return out


def _refkey(ref):
    import re
    m = re.match(r"([A-Z#]+)(\d+)", ref)
    return (m.group(1), int(m.group(2))) if m else (ref, 0)


if __name__ == "__main__":
    s = build_schematic()
    print("schematic:", s)
    write_project()
    b = build_pcb()
    print("board:", b)
    write_project()  # re-apply net classes if pcbnew rewrote the project file
    print("bom:", write_bom())
