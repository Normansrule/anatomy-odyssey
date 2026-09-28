#!/usr/bin/env python3
"""Cosmic Library LoRa ground station: serial -> live plots + map, with a simulated input mode.

    python3 ground_station.py --simulate                      # no hardware: a simulated flight, live
    python3 ground_station.py --simulate --speed 5            # 5x real time
    python3 ground_station.py --port /dev/ttyACM0             # real receiver (COM5 on Windows)
    python3 ground_station.py --replay session.log            # re-watch a recorded session
    python3 ground_station.py --simulate --headless --out run # no window: writes run.png/.csv/.geojson/.kml

Every received line is written to session_<date>.log so a flight can be replayed later.
The station position (for distance / bearing / elevation to the rocket) comes from --station LAT,LON;
by default it is taken as the first GPS fix received (i.e. you are standing at the pad).
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import queue
import sys
import threading
import time
from pathlib import Path

import telemetry as T

EARTH_R = 6_371_000.0


# ------------------------------------------------------------------ geometry
def enu(lat0, lon0, lat, lon):
    """Local east/north metres (equirectangular - accurate to < 0.1 % over a few km)."""
    e = math.radians(lon - lon0) * EARTH_R * math.cos(math.radians(lat0))
    n = math.radians(lat - lat0) * EARTH_R
    return e, n


def bearing_deg(e, n):
    return (math.degrees(math.atan2(e, n)) + 360) % 360


COMPASS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]


# ------------------------------------------------------------------ sources
class LineSource(threading.Thread):
    """Base: a thread that puts (host_time, line) into a queue."""

    def __init__(self):
        super().__init__(daemon=True)
        self.q: queue.Queue = queue.Queue()
        self.done = threading.Event()


class SerialSource(LineSource):
    def __init__(self, port, baud):
        super().__init__()
        import serial  # pip install pyserial
        self.ser = serial.Serial(port, baud, timeout=0.5)

    def run(self):
        while not self.done.is_set():
            raw = self.ser.readline()
            if raw:
                self.q.put((time.time(), raw.decode("ascii", "replace").strip()))


class SimSource(LineSource):
    def __init__(self, speed=1.0, realtime=True, seed=1):
        super().__init__()
        self.speed, self.realtime, self.seed = speed, realtime, seed

    def run(self):
        import sim
        t_start = time.time()
        for t, line in sim.lines(seed=self.seed):
            if self.done.is_set():
                return
            if self.realtime:
                wait = t_start + t / self.speed - time.time()
                if wait > 0:
                    time.sleep(wait)
            self.q.put((t_start + t / self.speed if self.realtime else t, line))
        self.done.set()


class ReplaySource(LineSource):
    def __init__(self, path, speed=1.0, realtime=True):
        super().__init__()
        self.path, self.speed, self.realtime = path, speed, realtime

    def run(self):
        entries = []
        for row in Path(self.path).read_text().splitlines():
            if "\t" in row:
                ts, line = row.split("\t", 1)
                entries.append((float(ts), line))
        if not entries:
            self.done.set()
            return
        t0, wall0 = entries[0][0], time.time()
        for ts, line in entries:
            if self.realtime:
                wait = wall0 + (ts - t0) / self.speed - time.time()
                if wait > 0:
                    time.sleep(wait)
            self.q.put((ts, line))
        self.done.set()


# ------------------------------------------------------------------ model
class Station:
    def __init__(self, station=None, log_path=None):
        self.frames: list[T.Frame] = []
        self.rx_time: list[float] = []
        self.bad = 0
        self.other = 0
        self.station = station      # (lat, lon) of the ground station
        self.site = None            # launch site = first fix while on the pad
        self.log = open(log_path, "a") if log_path else None
        self.last_rx = None

    def ingest(self, host_t, line):
        if self.log:
            self.log.write(f"{host_t:.3f}\t{line}\n")
        if not line.startswith("RX,"):
            self.other += 1
            return None
        f = T.parse_line(line)
        if f is None:
            self.bad += 1
            return None
        self.frames.append(f)
        self.rx_time.append(host_t)
        self.last_rx = host_t
        if f.gps_fix:
            if self.site is None and f.state == 0:
                self.site = (f.lat, f.lon)
            if self.station is None:
                self.station = (f.lat, f.lon)
        return f

    # --- statistics
    def lost(self):
        """Packets missing, from gaps in the 16-bit sequence counter."""
        if len(self.frames) < 2:
            return 0
        lost = 0
        for a, b in zip(self.frames, self.frames[1:]):
            gap = (b.seq - a.seq) & 0xFFFF
            if 0 < gap < 1000:
                lost += gap - 1
        return lost

    def summary(self):
        f = self.frames[-1] if self.frames else None
        s = {"packets": len(self.frames), "crc_errors": self.bad, "lost": self.lost()}
        total = s["packets"] + s["lost"]
        s["loss_pct"] = 100.0 * s["lost"] / total if total else 0.0
        if f:
            s.update(state=f.state_name, alt_m=f.alt_m, vel_mps=f.vel_mps, max_alt_m=max(x.max_alt_m for x in self.frames),
                     vbat_v=f.vbat_v, sats=f.sats, rssi=f.rssi, snr=f.snr, t_s=f.t_ms / 1000)
            fix = next((x for x in reversed(self.frames) if x.gps_fix), None)
            if fix and self.station:
                e, n = enu(*self.station, fix.lat, fix.lon)
                d = math.hypot(e, n)
                s.update(lat=fix.lat, lon=fix.lon, dist_m=d, bearing=bearing_deg(e, n),
                         elev_deg=math.degrees(math.atan2(fix.alt_m, max(d, 1.0))))
        return s

    # --- exports
    def write_csv(self, path):
        with open(path, "w", newline="") as fh:
            w = csv.writer(fh)
            w.writerow(["t_s", "seq", "state", "alt_m", "vel_mps", "acc_g", "lat", "lon", "max_alt_m", "vbat_v", "sats",
                        "rssi_dbm", "snr_db"])
            for f in self.frames:
                w.writerow([f.t_ms / 1000, f.seq, f.state_name, f.alt_m, f.vel_mps, f.acc_g, f.lat, f.lon, f.max_alt_m,
                            f.vbat_v, f.sats, f.rssi, f.snr])

    def track(self):
        return [(f.lon, f.lat, f.alt_m) for f in self.frames if f.gps_fix]

    def write_geojson(self, path):
        feats = [{"type": "Feature", "properties": {"name": "rocket track"},
                  "geometry": {"type": "LineString", "coordinates": [list(p) for p in self.track()]}}]
        last = self.track()[-1] if self.track() else None
        if last:
            feats.append({"type": "Feature", "properties": {"name": "last position"},
                          "geometry": {"type": "Point", "coordinates": list(last)}})
        Path(path).write_text(json.dumps({"type": "FeatureCollection", "features": feats}, indent=1))

    def write_kml(self, path):
        coords = " ".join(f"{lo:.7f},{la:.7f},{h:.1f}" for lo, la, h in self.track())
        last = self.track()[-1] if self.track() else (0, 0, 0)
        # altitudes are above the pad; "relativeToGround" is the closest KML altitude mode
        Path(path).write_text(f"""<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Cosmic Library flight</name>
<Style id="trk"><LineStyle><color>ff3478eb</color><width>3</width></LineStyle></Style>
<Placemark><name>track</name><styleUrl>#trk</styleUrl><LineString><extrude>1</extrude>
<altitudeMode>relativeToGround</altitudeMode><coordinates>{coords}</coordinates></LineString></Placemark>
<Placemark><name>last position</name><Point><coordinates>{last[0]:.7f},{last[1]:.7f},0</coordinates></Point></Placemark>
</Document></kml>
""")


# ------------------------------------------------------------------ dashboard
SURFACE, INK, INK2, GRID = "#fcfcfb", "#0b0b0b", "#52514e", "#e4e3df"
BLUE, ORANGE, AQUA = "#2a78d6", "#eb6834", "#1baf7a"


class Dashboard:
    def __init__(self, st: Station):
        import matplotlib.pyplot as plt
        self.plt, self.st = plt, st
        plt.rcParams.update({"font.size": 9, "axes.edgecolor": INK2, "axes.labelcolor": INK2, "xtick.color": INK2,
                             "ytick.color": INK2, "axes.titlecolor": INK})
        self.fig = plt.figure(figsize=(13, 7.6), facecolor=SURFACE)
        gs = self.fig.add_gridspec(3, 3, width_ratios=[1.5, 1.5, 1.2], hspace=0.45, wspace=0.28)
        self.ax_alt = self.fig.add_subplot(gs[0:2, 0])
        self.ax_vel = self.fig.add_subplot(gs[2, 0], sharex=self.ax_alt)
        self.ax_map = self.fig.add_subplot(gs[0:2, 1])
        self.ax_rf = self.fig.add_subplot(gs[2, 1])
        self.ax_txt = self.fig.add_subplot(gs[:, 2])
        self.fig.suptitle("Cosmic Library ground station", x=0.01, ha="left", color=INK, fontsize=13, weight="bold")

    def _style(self, ax, title):
        ax.set_facecolor(SURFACE)
        ax.grid(True, color=GRID, lw=0.6)
        for sp in ("top", "right"):
            ax.spines[sp].set_visible(False)
        ax.set_title(title, loc="left", fontsize=10)

    def draw(self):
        st = self.st
        for ax in (self.ax_alt, self.ax_vel, self.ax_map, self.ax_rf, self.ax_txt):
            ax.clear()
        fr = st.frames
        t = [f.t_ms / 1000 for f in fr]
        self._style(self.ax_alt, "altitude above pad (m)")
        self.ax_alt.plot(t, [f.alt_m for f in fr], color=BLUE, lw=2)
        apo = max(fr, key=lambda f: f.alt_m) if fr else None
        if apo and apo.alt_m > 5:
            self.ax_alt.plot([apo.t_ms / 1000], [apo.alt_m], "o", color=ORANGE, ms=8, mec=SURFACE, mew=2)
            self.ax_alt.annotate(f"{apo.alt_m:.0f} m", (apo.t_ms / 1000, apo.alt_m), xytext=(8, -12),
                                 textcoords="offset points", color=INK)
        self._style(self.ax_vel, "vertical velocity (m/s)")
        self.ax_vel.plot(t, [f.vel_mps for f in fr], color=BLUE, lw=1.6)
        self.ax_vel.axhline(0, color=INK2, lw=0.8)
        self.ax_vel.set_xlabel("flight computer time (s)")

        self._style(self.ax_rf, "link: RSSI of each received packet (dBm)")
        self.ax_rf.plot(t, [f.rssi for f in fr], ".", color=AQUA, ms=3)
        self.ax_rf.axhline(-123.5, color=ORANGE, lw=1.2, ls="--")
        self.ax_rf.text(0.01, 0.04, "SF9 / 500 kHz sensitivity  -123.5 dBm", color=INK2, fontsize=8,
                        transform=self.ax_rf.transAxes)
        self.ax_rf.set_xlabel("flight computer time (s)")
        self.ax_rf.set_ylim(-135, -40)

        # map in local metres around the station
        self._style(self.ax_map, "track (east / north metres from ground station)")
        if st.station:
            pts = [enu(*st.station, f.lat, f.lon) for f in fr if f.gps_fix]
            if pts:
                es, ns = zip(*pts)
                self.ax_map.plot(es, ns, color=BLUE, lw=1.5)
                self.ax_map.plot(es[-1], ns[-1], "o", color=ORANGE, ms=9, mec=SURFACE, mew=2, label="rocket (last fix)")
                span = max(150.0, max(max(map(abs, es)), max(map(abs, ns))) * 1.25)
            else:
                span = 300.0
            if st.site:
                se, sn = enu(*st.station, *st.site)
                self.ax_map.plot(se, sn, "^", color=INK2, ms=8, label="launch site")
            self.ax_map.plot(0, 0, "s", color=AQUA, ms=8, label="ground station")
            for r in (250, 500, 1000, 2000, 4000):
                if r < span * 1.4:
                    self.ax_map.add_patch(self.plt.Circle((0, 0), r, fill=False, color=GRID, lw=1))
                    self.ax_map.text(r * 0.707, r * 0.707, f"{r} m", color=INK2, fontsize=7)
            self.ax_map.set_xlim(-span, span)
            self.ax_map.set_ylim(-span, span)
            self.ax_map.set_aspect("equal")
            self.ax_map.legend(loc="lower left", frameon=False, fontsize=8)

        # status panel
        self.ax_txt.set_axis_off()
        s = st.summary()
        lines = [("STATE", s.get("state", "-")),
                 ("altitude", f"{s['alt_m']:.1f} m" if "alt_m" in s else "-"),
                 ("max altitude", f"{s['max_alt_m']} m" if "max_alt_m" in s else "-"),
                 ("velocity", f"{s['vel_mps']:+.1f} m/s" if "vel_mps" in s else "-"),
                 ("battery", f"{s['vbat_v']:.2f} V" if "vbat_v" in s else "-"),
                 ("GPS satellites", str(s.get("sats", "-"))),
                 ("", ""),
                 ("distance", f"{s['dist_m']:.0f} m" if "dist_m" in s else "-"),
                 ("bearing", f"{s['bearing']:.0f}° {COMPASS[int((s['bearing'] + 11.25) // 22.5) % 16]}" if "bearing" in s else "-"),
                 ("elevation", f"{s['elev_deg']:.1f}°" if "elev_deg" in s else "-"),
                 ("last fix", f"{s['lat']:.6f}, {s['lon']:.6f}" if "lat" in s else "-"),
                 ("", ""),
                 ("RSSI / SNR", f"{s['rssi']:.0f} dBm / {s['snr']:+.1f} dB" if s.get("rssi") is not None else "-"),
                 ("packets", f"{s['packets']}  (lost {s['lost']}, {s['loss_pct']:.1f} %)"),
                 ("CRC errors", str(s["crc_errors"]))]
        y = 0.98
        for k, v in lines:
            if k == "STATE":
                self.ax_txt.text(0.0, y, v, fontsize=22, weight="bold", color=ORANGE if v in ("BOOST", "COAST") else INK,
                                 va="top", transform=self.ax_txt.transAxes)
                y -= 0.1
                continue
            self.ax_txt.text(0.0, y, k, color=INK2, va="top", transform=self.ax_txt.transAxes)
            self.ax_txt.text(0.45, y, v, color=INK, va="top", weight="bold", transform=self.ax_txt.transAxes)
            y -= 0.055
        self.ax_txt.text(0.0, 0.02, "Walk the bearing; the elevation angle tells you how high to point a Yagi.",
                         color=INK2, fontsize=8, transform=self.ax_txt.transAxes, wrap=True)

    def save(self, path):
        self.draw()
        self.fig.savefig(path, dpi=120, facecolor=SURFACE)


# ------------------------------------------------------------------ main
def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--port", help="serial port of the ground receiver")
    src.add_argument("--simulate", action="store_true", help="simulated flight, no hardware")
    src.add_argument("--replay", help="session .log file to replay")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--speed", type=float, default=1.0, help="simulation / replay speed-up")
    ap.add_argument("--station", help="ground station LAT,LON (default: first GPS fix)")
    ap.add_argument("--headless", action="store_true", help="no window: run to the end and write files")
    ap.add_argument("--out", default=None, help="basename for .png/.csv/.geojson/.kml (headless or on exit)")
    ap.add_argument("--seed", type=int, default=1)
    args = ap.parse_args(argv)

    station = tuple(float(x) for x in args.station.split(",")) if args.station else None
    if args.simulate and station is None:
        import sim
        station = sim.offset_latlon(*sim.LAUNCH, *sim.STATION_OFFSET)
    log_path = None if args.headless else time.strftime("session_%Y%m%d_%H%M%S.log")
    st = Station(station, log_path)

    if args.port:
        source = SerialSource(args.port, args.baud)
    elif args.simulate:
        source = SimSource(args.speed, realtime=not args.headless, seed=args.seed)
    else:
        source = ReplaySource(args.replay, args.speed, realtime=not args.headless)
    source.start()

    if args.headless:
        while not (source.done.is_set() and source.q.empty()):
            try:
                st.ingest(*source.q.get(timeout=0.2))
            except queue.Empty:
                pass
        import matplotlib
        matplotlib.use("Agg")
        base = args.out or "ground_station"
        Dashboard(st).save(base + ".png")
        st.write_csv(base + ".csv")
        st.write_geojson(base + ".geojson")
        st.write_kml(base + ".kml")
        s = st.summary()
        print(json.dumps({k: (round(v, 3) if isinstance(v, float) else v) for k, v in s.items()}, indent=1))
        return st

    import matplotlib.pyplot as plt
    from matplotlib.animation import FuncAnimation
    dash = Dashboard(st)

    def update(_):
        n = 0
        while not source.q.empty() and n < 200:
            f = st.ingest(*source.q.get_nowait())
            n += 1
            if f is not None:
                print(f"{f.t_ms / 1000:8.2f}s {f.state_name:8s} alt {f.alt_m:7.1f} m  v {f.vel_mps:+6.1f}  "
                      f"rssi {f.rssi:.0f}  snr {f.snr:+.1f}", flush=True)
        dash.draw()

    anim = FuncAnimation(dash.fig, update, interval=250, cache_frame_data=False)  # noqa: F841 (keep a reference)
    plt.show()
    source.done.set()
    if args.out:
        dash.save(args.out + ".png")
        st.write_csv(args.out + ".csv")
        st.write_geojson(args.out + ".geojson")
        st.write_kml(args.out + ".kml")
    return st


if __name__ == "__main__":
    main()
