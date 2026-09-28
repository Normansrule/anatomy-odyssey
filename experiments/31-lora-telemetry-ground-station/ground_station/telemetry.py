"""Cosmic Library telemetry frame v1 - Python side of firmware/common/telemetry_packet.h.

34 bytes, little-endian:
    magic 'CC' | version u8 | state u8 | seq u16 | t_ms u32 | alt_dm i32 | vel_dms i16 | acc_cg i16 |
    lat_e7 i32 | lon_e7 i32 | max_alt_m u16 | vbat_mv u16 | sats u8 | flags u8 | crc16 u16
The CRC is CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) over the first 32 bytes.

The ground receiver prints one line per received LoRa packet:
    RX,<rssi dBm>,<snr dB>,<hex payload>
which `parse_line()` turns into a `Frame`.
"""
from __future__ import annotations

import struct
from dataclasses import asdict, dataclass

FMT = "<2sBBHIihhiiHHBBH"
LEN = struct.calcsize(FMT)
assert LEN == 34, LEN
VERSION = 1
STATES = ["PAD", "BOOST", "COAST", "APOGEE", "DESCENT", "LANDED"]
FLAG_GPS, FLAG_SD, FLAG_BARO, FLAG_IMU = 1, 2, 4, 8


def crc16(data: bytes) -> int:
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


@dataclass
class Frame:
    state: int
    seq: int
    t_ms: int
    alt_m: float
    vel_mps: float
    acc_g: float
    lat: float | None
    lon: float | None
    max_alt_m: int
    vbat_v: float
    sats: int
    flags: int
    rssi: float | None = None
    snr: float | None = None

    @property
    def state_name(self) -> str:
        return STATES[self.state] if 0 <= self.state < len(STATES) else f"?{self.state}"

    @property
    def gps_fix(self) -> bool:
        return bool(self.flags & FLAG_GPS)

    def as_dict(self):
        d = asdict(self)
        d["state_name"] = self.state_name
        return d


def encode(state, seq, t_ms, alt_m, vel_mps, acc_g, lat=None, lon=None, max_alt_m=0, vbat_v=3.9, sats=0,
           flags=FLAG_SD | FLAG_BARO | FLAG_IMU) -> bytes:
    if lat is not None and lon is not None:
        flags |= FLAG_GPS
    clamp = lambda x, lo, hi: max(lo, min(hi, int(round(x))))
    body = struct.pack(FMT[:-1], b"CC", VERSION, state, seq & 0xFFFF, t_ms & 0xFFFFFFFF,
                       clamp(alt_m * 10, -2**31, 2**31 - 1), clamp(vel_mps * 10, -32767, 32767),
                       clamp(acc_g * 100, 0, 32767),
                       clamp((lat or 0) * 1e7, -2**31, 2**31 - 1), clamp((lon or 0) * 1e7, -2**31, 2**31 - 1),
                       clamp(max_alt_m, 0, 65535), clamp(vbat_v * 1000, 0, 65535), clamp(sats, 0, 255), flags)
    return body + struct.pack("<H", crc16(body))


def decode(buf: bytes, rssi=None, snr=None) -> Frame | None:
    """Return a Frame, or None if the length, magic, version or CRC is wrong."""
    if len(buf) != LEN:
        return None
    (magic, ver, state, seq, t_ms, alt_dm, vel_dms, acc_cg, lat_e7, lon_e7, max_alt, vbat_mv, sats, flags,
     crc) = struct.unpack(FMT, buf)
    if magic != b"CC" or ver != VERSION or crc != crc16(buf[:-2]):
        return None
    fix = bool(flags & FLAG_GPS)
    return Frame(state, seq, t_ms, alt_dm / 10, vel_dms / 10, acc_cg / 100, lat_e7 / 1e7 if fix else None,
                 lon_e7 / 1e7 if fix else None, max_alt, vbat_mv / 1000, sats, flags, rssi, snr)


def parse_line(line: str) -> Frame | None:
    """Parse one 'RX,rssi,snr,hex' line from the ground receiver; anything else -> None."""
    line = line.strip()
    if not line.startswith("RX,"):
        return None
    parts = line.split(",")
    if len(parts) != 4:
        return None
    try:
        rssi, snr = float(parts[1]), float(parts[2])
        payload = bytes.fromhex(parts[3])
    except ValueError:
        return None
    return decode(payload, rssi, snr)


def format_line(payload: bytes, rssi: float, snr: float) -> str:
    return f"RX,{rssi:.0f},{snr:.1f},{payload.hex().upper()}"
