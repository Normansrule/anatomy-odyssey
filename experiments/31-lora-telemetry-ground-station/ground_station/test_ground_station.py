#!/usr/bin/env python3
"""Tests for the ground station. Run:  python3 test_ground_station.py   (or: pytest)

Covers: the packet codec against the C header (field offsets parsed from telemetry_packet.h),
the CRC check value, the link-budget maths against hand calculations, the parser's handling of
garbage, sequence-gap loss counting, and a full simulated flight through the headless app.
"""
from __future__ import annotations

import math
import os
import re
import struct
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import linkbudget as LB  # noqa: E402
import sim  # noqa: E402
import telemetry as T  # noqa: E402

HEADER = HERE.parent / "firmware" / "common" / "telemetry_packet.h"
HEADER_30 = HERE.parents[1] / "30-flight-computer-pcb" / "firmware" / "flight_logger" / "telemetry_packet.h"


def test_crc_check_value():
    assert T.crc16(b"123456789") == 0x29B1  # CRC-16/CCITT-FALSE catalogue check value


def test_struct_matches_c_header():
    """The offset table in the C header comment must match the Python struct format."""
    rows = re.findall(r"//\s+(\d+)\s+(\d)\s+(\w+)", HEADER.read_text())
    assert len(rows) == 15, rows
    fmt_sizes = [struct.calcsize("<" + c) for c in ["2s", "B", "B", "H", "I", "i", "h", "h", "i", "i", "H", "H", "B", "B", "H"]]
    off = 0
    for (o, size, name), s in zip(rows, fmt_sizes):
        assert int(o) == off, (name, o, off)
        assert int(size) == s, (name, size, s)
        off += s
    assert off == T.LEN == 34


def test_header_copies_identical():
    """Experiment 30 carries a copy of the header; it must not drift."""
    if HEADER_30.exists():
        assert HEADER.read_bytes() == HEADER_30.read_bytes(), "run: cp firmware/common/telemetry_packet.h ../30-*/firmware/flight_logger/"


def test_roundtrip_and_corruption():
    p = T.encode(2, 513, 20_450, 1135.4, -0.4, 1.02, 35.0012345, -116.9987654, 1135, 3.97, 9)
    f = T.decode(p, -97, 7.5)
    assert f and f.state_name == "COAST" and f.seq == 513 and f.gps_fix
    assert abs(f.alt_m - 1135.4) < 0.051 and abs(f.lat - 35.0012345) < 1e-7 and abs(f.lon + 116.9987654) < 1e-7
    bad = bytearray(p)
    bad[10] ^= 0x40
    assert T.decode(bytes(bad)) is None
    assert T.decode(p[:-1]) is None
    no_fix = T.decode(T.encode(0, 1, 0, 0, 0, 1))
    assert no_fix.lat is None and not no_fix.gps_fix


def test_parse_line_rejects_garbage():
    good = T.format_line(T.encode(1, 7, 1000, 12.3, 45.6, 9.8), -80, 9.5)
    assert T.parse_line(good).state_name == "BOOST"
    for junk in ["", "# receiver ready", "RX,-80,9", "RX,-80,x,00", "RX,-80,9.5,ZZ", "RX,-80,9.5,00ff"]:
        assert T.parse_line(junk) is None


def test_link_budget_numbers():
    # sensitivity SF9 / 500 kHz / NF 6: -174 + 56.99 + 6 - 12.5 = -123.51 dBm
    assert abs(LB.sensitivity_dbm(9, 500e3) - (-123.51)) < 0.01
    # FSPL 10 km at 915 MHz = 111.7 dB
    assert abs(LB.fspl_db(10_000, 915e6) - 111.68) < 0.05
    # Semtech time on air, SF9 / 500 kHz / CR 4/5 / 34 bytes: 8.25+4 symbols preamble + 48 payload symbols
    assert abs(LB.time_on_air_s(34, 9, 500e3) - (12.25 + 48) * 512 / 500e3) < 1e-9
    # low-data-rate optimisation kicks in at SF11/125 kHz (16.4 ms symbols)
    assert abs(LB.time_on_air_s(34, 11, 125e3) - 0.987136) < 1e-6
    # PSD for 14 dBm over 500 kHz is far below the 8 dBm / 3 kHz DTS limit
    assert 14 - 10 * math.log10(500e3 / 3e3) < 8


def test_simulated_flight_end_to_end():
    import ground_station as GS
    with tempfile.TemporaryDirectory() as td:
        base = os.path.join(td, "run")
        st = GS.main(["--simulate", "--headless", "--out", base])
        for ext in (".png", ".csv", ".geojson", ".kml"):
            assert os.path.getsize(base + ext) > 200, ext
    s = st.summary()
    assert s["state"] == "LANDED"
    assert 1000 < s["max_alt_m"] < 1250
    states = {f.state_name for f in st.frames}
    assert {"PAD", "BOOST", "COAST", "DESCENT", "LANDED"} <= states
    assert s["crc_errors"] == 0


def test_loss_counting_with_a_bad_link():
    st_lines = list(sim.lines(seed=5, loss_extra=32.0))  # 32 dB extra loss: many packets drop
    import ground_station as GS
    st = GS.Station(station=sim.offset_latlon(*sim.LAUNCH, *sim.STATION_OFFSET))
    for t, line in st_lines:
        st.ingest(t, line)
    s = st.summary()
    sent = max(f.seq for f in st.frames) - min(f.seq for f in st.frames) + 1
    assert s["packets"] + s["lost"] == sent
    assert s["loss_pct"] > 1.0


if __name__ == "__main__":
    tests = [v for k, v in dict(globals()).items() if k.startswith("test_")]
    failed = 0
    for t in tests:
        try:
            t()
            print(f"PASS {t.__name__}")
        except Exception as e:  # noqa: BLE001
            failed += 1
            print(f"FAIL {t.__name__}: {e!r}")
    print(f"{len(tests) - failed}/{len(tests)} passed")
    sys.exit(1 if failed else 0)
