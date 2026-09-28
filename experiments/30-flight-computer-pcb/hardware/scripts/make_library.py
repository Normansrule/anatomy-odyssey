"""Generate the project-specific KiCad library: 3 symbols + 2 footprints.

KiCad's stock libraries (7.x/8.x) do not ship a Raspberry Pi Pico module,
a BMP390 or an LSM6DSO32, so we author them here from the datasheets:

* Raspberry Pi Pico datasheet (pin-out, 51 x 21 mm, 2.54 mm pitch, rows 17.78 mm apart)
* Bosch BMP390 datasheet BST-BMP390-DS002 (pin table, 10-pin LGA 2.0 x 2.0 mm)
* ST LSM6DSO32 datasheet (pin table, LGA-14L 2.5 x 3.0 mm) -- pin-compatible with LSM6DSM,
  so the footprint is KiCad's stock `Package_LGA:LGA-14_3x2.5mm_P0.5mm_LayoutBorder3x4y`.

Run:  python3 make_library.py
"""

from __future__ import annotations

from pathlib import Path

from kicadlib import load_symbol
from sexp import QStr as Q
from sexp import dumps, find

KICAD = Path(__file__).resolve().parent.parent / "kicad"
FONT = ["effects", ["font", ["size", 1.27, 1.27]]]
HIDE = ["effects", ["font", ["size", 1.27, 1.27]], "hide"]


def prop(name, value, x, y, hidden=False, justify=None):
    eff = list(HIDE if hidden else FONT)
    if justify:
        eff = eff[:2] + [["justify", justify]] + eff[2:]
    return ["property", Q(name), Q(value), ["at", x, y, 0], eff]


def pin(ptype, x, y, angle, name, number, length=2.54):
    return ["pin", ptype, "line", ["at", x, y, angle], ["length", length],
            ["name", Q(name), FONT], ["number", Q(number), FONT]]


def rect(x1, y1, x2, y2):
    return ["rectangle", ["start", x1, y1], ["end", x2, y2],
            ["stroke", ["width", 0.254], ["type", "default"]], ["fill", ["type", "background"]]]


# ---------------------------------------------------------------- Pico
PICO_PINS = {
    1: ("GP0", "bidirectional"), 2: ("GP1", "bidirectional"), 3: ("GND", "power_in"),
    4: ("GP2", "bidirectional"), 5: ("GP3", "bidirectional"), 6: ("GP4", "bidirectional"),
    7: ("GP5", "bidirectional"), 8: ("GND", "passive"), 9: ("GP6", "bidirectional"),
    10: ("GP7", "bidirectional"), 11: ("GP8", "bidirectional"), 12: ("GP9", "bidirectional"),
    13: ("GND", "passive"), 14: ("GP10", "bidirectional"), 15: ("GP11", "bidirectional"),
    16: ("GP12", "bidirectional"), 17: ("GP13", "bidirectional"), 18: ("GND", "passive"),
    19: ("GP14", "bidirectional"), 20: ("GP15", "bidirectional"),
    21: ("GP16", "bidirectional"), 22: ("GP17", "bidirectional"), 23: ("GND", "passive"),
    24: ("GP18", "bidirectional"), 25: ("GP19", "bidirectional"), 26: ("GP20", "bidirectional"),
    27: ("GP21", "bidirectional"), 28: ("GND", "passive"), 29: ("GP22", "bidirectional"),
    30: ("RUN", "input"), 31: ("GP26_ADC0", "bidirectional"), 32: ("GP27_ADC1", "bidirectional"),
    33: ("AGND", "passive"), 34: ("GP28_ADC2", "bidirectional"), 35: ("ADC_VREF", "power_in"),
    36: ("3V3_OUT", "power_out"), 37: ("3V3_EN", "input"), 38: ("GND", "passive"),
    39: ("VSYS", "power_in"), 40: ("VBUS", "power_in"),
}


def pico_symbol():
    name = "RaspberryPi_Pico"
    pins = []
    for n, (pname, ptype) in PICO_PINS.items():
        if n <= 20:
            pins.append(pin(ptype, -15.24, 24.13 - 2.54 * (n - 1), 0, pname, str(n)))
        else:
            pins.append(pin(ptype, 15.24, 24.13 - 2.54 * (40 - n), 180, pname, str(n)))
    return ["symbol", Q(name), ["in_bom", "yes"], ["on_board", "yes"],
            prop("Reference", "U", -12.7, 27.94, justify="left"),
            prop("Value", name, -12.7, -27.94, justify="left"),
            prop("Footprint", "cosmic_codex:RaspberryPi_Pico_Castellated_HandSolder", 0, -30.48, True),
            prop("Datasheet", "https://datasheets.raspberrypi.com/pico/pico-datasheet.pdf", 0, -33.02, True),
            prop("ki_description", "Raspberry Pi Pico (RP2040) module, soldered by its castellated edge", 0, 0, True),
            prop("ki_keywords", "RP2040 Pico module castellated", 0, 0, True),
            ["symbol", Q(name + "_0_1"), rect(-12.7, 26.67, 12.7, -26.67)],
            ["symbol", Q(name + "_1_1"), *pins]]


# ---------------------------------------------------------------- BMP390
def bmp390_symbol():
    name = "BMP390"
    pins = [
        pin("power_in", 0, 12.7, 270, "VDDIO", "1"),
        pin("power_in", 2.54, 12.7, 270, "VDD", "10"),
        pin("input", -12.7, 2.54, 0, "SCK", "2"),
        pin("bidirectional", -12.7, 0, 0, "SDI", "4"),
        pin("bidirectional", -12.7, -2.54, 0, "SDO", "5"),
        pin("input", -12.7, -5.08, 0, "CSB", "6"),
        pin("output", 12.7, 0, 180, "INT", "7"),
        pin("power_in", 0, -12.7, 90, "VSS", "3"),
        pin("passive", 2.54, -12.7, 90, "VSS", "8"),
        pin("passive", 5.08, -12.7, 90, "VSS", "9"),
    ]
    return ["symbol", Q(name), ["in_bom", "yes"], ["on_board", "yes"],
            prop("Reference", "U", -10.16, 11.43, justify="left"),
            prop("Value", name, 3.81, 11.43, justify="left"),
            prop("Footprint", "cosmic_codex:Bosch_LGA-10_2x2mm_P0.5mm_BMP390", 0, -15.24, True),
            prop("Datasheet", "https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmp390-ds002.pdf", 0, -17.78, True),
            prop("ki_description", "Barometric pressure sensor, 300-1250 hPa, I2C/SPI, LGA-10 2x2 mm", 0, 0, True),
            ["symbol", Q(name + "_0_1"), rect(-10.16, 10.16, 10.16, -10.16)],
            ["symbol", Q(name + "_1_1"), *pins]]


# ---------------------------------------------------------------- LSM6DSO32
def lsm6dso32_symbol():
    """Same pin-out as ST's LSM6DSM, so reuse KiCad's drawing and rename."""
    base = load_symbol("Sensor_Motion:LSM6DSM")
    name = "LSM6DSO32"
    out = [x for x in base if not (isinstance(x, list) and x[0] == "property")]
    out[1] = Q(name)
    props = [
        prop("Reference", "U", -11.43, 15.24, justify="left"),
        prop("Value", name, 2.54, 17.78, justify="left"),
        prop("Footprint", "Package_LGA:LGA-14_3x2.5mm_P0.5mm_LayoutBorder3x4y", 0, -20.32, True),
        prop("Datasheet", "https://www.st.com/resource/en/datasheet/lsm6dso32.pdf", 0, -22.86, True),
        prop("ki_description", "6-axis IMU, accelerometer up to +/-32 g, gyroscope up to +/-2000 dps, I2C/SPI", 0, 0, True),
    ]
    idx = next(i for i, x in enumerate(out) if isinstance(x, list) and x[0] == "symbol")
    out[idx:idx] = props
    for x in out:
        if isinstance(x, list) and x[0] == "symbol":
            x[1] = Q(str(x[1]).replace("Sensor_Motion:LSM6DSM", name).replace("LSM6DSM", name))
    return out


def write_symbol_lib():
    lib = ["kicad_symbol_lib", ["version", 20220914], ["generator", "cosmic_codex_make_library"],
           pico_symbol(), bmp390_symbol(), lsm6dso32_symbol()]
    (KICAD / "cosmic_codex.kicad_sym").write_text(dumps(lib) + "\n")


# ---------------------------------------------------------------- footprints
def fp_line(x1, y1, x2, y2, layer, w):
    return ["fp_line", ["start", x1, y1], ["end", x2, y2],
            ["stroke", ["width", w], ["type", "solid"]], ["layer", Q(layer)]]


def fp_rect(x1, y1, x2, y2, layer, w):
    return [fp_line(x1, y1, x2, y1, layer, w), fp_line(x2, y1, x2, y2, layer, w),
            fp_line(x2, y2, x1, y2, layer, w), fp_line(x1, y2, x1, y1, layer, w)]


def fp_text(kind, text, x, y, layer, hidden=False):
    t = ["fp_text", kind, Q(text), ["at", x, y], ["layer", Q(layer)]]
    if hidden:
        t.append("hide")
    t.append(["effects", ["font", ["size", 1, 1], ["thickness", 0.15]]])
    return t


def pico_footprint():
    """Castellated Pico with pads lengthened outward so a soldering iron can reach them."""
    name = "RaspberryPi_Pico_Castellated_HandSolder"
    items = ["footprint", Q(name), ["version", 20221018], ["generator", "cosmic_codex"],
             ["layer", Q("F.Cu")],
             ["descr", Q("Raspberry Pi Pico soldered flat by its castellated edge. Pads extended "
                         "1.4 mm beyond the module edge for hand soldering. 51 x 21 mm, 2.54 mm pitch.")],
             ["tags", Q("RP2040 Pico castellated module")], ["attr", "smd"],
             fp_text("reference", "REF**", 0, -28.2, "F.SilkS"),
             fp_text("value", name, 0, 28.2, "F.Fab")]
    # module outline 21 x 51 (origin at centre, USB end at -Y)
    items += fp_rect(-10.5, -25.5, 10.5, 25.5, "F.Fab", 0.1)
    items += fp_rect(-4.0, -26.8, 4.0, -24.0, "F.Fab", 0.1)  # micro-USB receptacle overhang
    items += fp_rect(-12.4, -27.1, 12.4, 25.9, "F.CrtYd", 0.05)
    items += [fp_line(-10.5, 25.5, 10.5, 25.5, "F.SilkS", 0.12),
              fp_text("user", "USB", 0, -22.5, "F.SilkS"),
              fp_text("user", "${REFERENCE}", 0, 0, "F.Fab")]
    # pin-1 marker
    items.append(["fp_circle", ["center", -12.0, -24.13], ["end", -11.8, -24.13],
                  ["stroke", ["width", 0.3], ["type", "solid"]], ["fill", "solid"], ["layer", Q("F.SilkS")]])
    for n in range(1, 41):
        if n <= 20:
            x, y = -9.8, -24.13 + 2.54 * (n - 1)
        else:
            x, y = 9.8, 24.13 - 2.54 * (n - 21)
        items.append(["pad", Q(str(n)), "smd", "rect", ["at", round(x, 3), round(y, 3)], ["size", 4.2, 1.6],
                      ["layers", Q("F.Cu"), Q("F.Paste"), Q("F.Mask")]])
    return name, items


def bmp390_footprint():
    """Bosch 10-pin LGA, 2.0 x 2.0 mm, 0.5 mm pitch.

    Pin order (top view, clockwise from pin 1 at the top-left): 1-3 along the top edge,
    4-5 down the right edge, 6-8 along the bottom edge (right to left), 9-10 up the left edge.
    Pad geometry is derived from KiCad's ST_HLGA-10_2x2mm_P0.5mm (same 3x2 border layout),
    with the pads shortened 25 um at the inner end so corner pads keep a 0.15 mm gap.
    ALWAYS verify against the land-pattern drawing in BST-BMP390-DS002 section 7 before ordering.
    """
    name = "Bosch_LGA-10_2x2mm_P0.5mm_BMP390"
    e = 0.775  # pad centre offset; pads 0.35 x 0.40 keep >= 0.15 mm corner gaps
    pads = {1: (-0.5, -e, "v"), 2: (0, -e, "v"), 3: (0.5, -e, "v"),
            4: (e, -0.25, "h"), 5: (e, 0.25, "h"),
            6: (0.5, e, "v"), 7: (0, e, "v"), 8: (-0.5, e, "v"),
            9: (-e, 0.25, "h"), 10: (-e, -0.25, "h")}
    items = ["footprint", Q(name), ["version", 20221018], ["generator", "cosmic_codex"],
             ["layer", Q("F.Cu")],
             ["descr", Q("Bosch BMP390 LGA-10 2.0x2.0 mm P0.5 mm (verify with BST-BMP390-DS002 land pattern)")],
             ["tags", Q("LGA-10 Bosch BMP390 BMP388 barometer")], ["attr", "smd"],
             fp_text("reference", "REF**", 0, -2.1, "F.SilkS"),
             fp_text("value", name, 0, 2.1, "F.Fab")]
    items += fp_rect(-1.0, -1.0, 1.0, 1.0, "F.Fab", 0.1)
    items += fp_rect(-1.45, -1.45, 1.45, 1.45, "F.CrtYd", 0.05)
    items += [fp_line(-1.11, -1.11, -0.85, -1.11, "F.SilkS", 0.12),
              fp_line(-1.11, -1.11, -1.11, -0.85, "F.SilkS", 0.12),
              fp_line(1.11, 1.11, 0.85, 1.11, "F.SilkS", 0.12),
              fp_line(1.11, 1.11, 1.11, 0.85, "F.SilkS", 0.12)]
    items.append(["fp_circle", ["center", -1.35, -1.35], ["end", -1.25, -1.35],
                  ["stroke", ["width", 0.2], ["type", "solid"]], ["fill", "solid"], ["layer", Q("F.SilkS")]])
    for n, (x, y, o) in pads.items():
        size = [0.35, 0.40] if o == "v" else [0.40, 0.35]
        items.append(["pad", Q(str(n)), "smd", "roundrect", ["at", x, y], ["size", *size],
                      ["layers", Q("F.Cu"), Q("F.Paste"), Q("F.Mask")], ["roundrect_rratio", 0.25]])
    return name, items


def write_footprints():
    d = KICAD / "cosmic_codex.pretty"
    d.mkdir(exist_ok=True)
    for fn in (pico_footprint, bmp390_footprint):
        name, items = fn()
        (d / f"{name}.kicad_mod").write_text(dumps(items) + "\n")


def write_lib_tables():
    (KICAD / "sym-lib-table").write_text(
        '(sym_lib_table\n  (version 7)\n  (lib (name "cosmic_codex")(type "KiCad")'
        '(uri "${KIPRJMOD}/cosmic_codex.kicad_sym")(options "")(descr "Cosmic Library parts"))\n)\n')
    (KICAD / "fp-lib-table").write_text(
        '(fp_lib_table\n  (version 7)\n  (lib (name "cosmic_codex")(type "KiCad")'
        '(uri "${KIPRJMOD}/cosmic_codex.pretty")(options "")(descr "Cosmic Library footprints"))\n)\n')


if __name__ == "__main__":
    write_symbol_lib()
    write_footprints()
    write_lib_tables()
    print("library written to", KICAD)
