#!/usr/bin/env python3
"""Unit tests for the altimeter firmware, run on a desktop:  python3 test_flightlogic.py

  * altitude formula against the International Standard Atmosphere table
  * the BMP280 driver against the worked example in the Bosch datasheet (fake I2C bus)
  * the BMP390 driver's register parsing and scaling against the datasheet formula (fake I2C bus)
  * launch / apogee / landing detection on 40 synthetic flights with noise, jitter and an
    ejection-charge spike
  * no false launch on a noisy pad with slow weather drift and a door-slam pressure step
"""
import os, struct, sys, types, unittest
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "firmware"))
sys.path.insert(0, HERE)

# MicroPython's time.sleep_ms does not exist on CPython: give the drivers a stand-in
import time as _time
if not hasattr(_time, "sleep_ms"):
    _time.sleep_ms = lambda ms: None

import flightlogic as fl  # noqa: E402
import bmp  # noqa: E402
from synth_flight import simulate, run_detector  # noqa: E402


class FakeI2C:
    """Pretends to be an I2C bus with one sensor whose registers we fill in."""

    def __init__(self, addr, regs):
        self.addr, self.regs, self.writes = addr, dict(regs), []

    def scan(self):
        return [self.addr]

    def readfrom_mem(self, addr, reg, n):
        return bytes(self.regs.get(reg + i, 0) for i in range(n))

    def writeto_mem(self, addr, reg, data):
        self.writes.append((reg, data[0]))


class TestAltitude(unittest.TestCase):
    def test_isa_table(self):
        # ISA pressures (Pa) at 500 / 1000 / 2000 m
        for h, p in [(500, 95460.8), (1000, 89874.6), (2000, 79495.2)]:
            self.assertAlmostEqual(fl.altitude_m(p, 101325.0), h, delta=0.6)

    def test_zero(self):
        self.assertEqual(fl.altitude_m(100000.0, 100000.0), 0.0)

    def test_blink_digits(self):
        self.assertEqual(fl.blink_digits(187.4), [1, 8, 7])
        self.assertEqual(fl.blink_digits(305), [3, 10, 5])


class TestBMP280(unittest.TestCase):
    def test_datasheet_example(self):
        # Bosch BMP280 datasheet, section 3.12 (worked example): T = 25.08 °C, p = 100653.27 Pa
        cal = struct.pack("<HhhHhhhhhhhh", 27504, 26435, -1000, 36477, -10685, 3024, 2855, 140, -7, 15500, -14600, 6000)
        regs = {0xD0: 0x58}
        regs.update({0x88 + i: b for i, b in enumerate(cal)})
        adc_p, adc_t = 415148, 519888
        data = [adc_p >> 12, (adc_p >> 4) & 0xFF, (adc_p & 0xF) << 4, adc_t >> 12, (adc_t >> 4) & 0xFF, (adc_t & 0xF) << 4]
        regs.update({0xF7 + i: b for i, b in enumerate(data)})
        s = bmp.detect(FakeI2C(0x76, regs))
        self.assertEqual(s.name, "BMP280")
        p, t = s.read()
        self.assertAlmostEqual(t, 25.08, delta=0.01)
        self.assertAlmostEqual(p, 100653.27, delta=0.5)


class TestBMP390(unittest.TestCase):
    RAW = dict(T1=27758, T2=19014, T3=-7, P1=-3478, P2=-3386, P3=35, P4=0, P5=25418, P6=30779,
               P7=3, P8=-6, P9=16409, P10=5, P11=-60)

    @staticmethod
    def reference(raw, up, ut):
        """Datasheet section 9 compensation, written out directly from the raw NVM words."""
        r = raw
        t1 = r["T1"] / 2.0 ** -8; t2 = r["T2"] / 2.0 ** 30; t3 = r["T3"] / 2.0 ** 48
        t = (ut - t1) * t2 + (ut - t1) ** 2 * t3
        P = [None] + [
            (r["P1"] - 2 ** 14) / 2.0 ** 20, (r["P2"] - 2 ** 14) / 2.0 ** 29, r["P3"] / 2.0 ** 32,
            r["P4"] / 2.0 ** 37, r["P5"] / 2.0 ** -3, r["P6"] / 2.0 ** 6, r["P7"] / 2.0 ** 8,
            r["P8"] / 2.0 ** 15, r["P9"] / 2.0 ** 48, r["P10"] / 2.0 ** 48, r["P11"] / 2.0 ** 65]
        out1 = P[5] + P[6] * t + P[7] * t ** 2 + P[8] * t ** 3
        out2 = up * (P[1] + P[2] * t + P[3] * t ** 2 + P[4] * t ** 3)
        out3 = up ** 2 * (P[9] + P[10] * t) + up ** 3 * P[11]
        return out1 + out2 + out3, t

    def test_register_parsing_matches_datasheet_formula(self):
        r = self.RAW
        cal = struct.pack("<HHbhhbbHHbbhbb", r["T1"], r["T2"], r["T3"], r["P1"], r["P2"], r["P3"], r["P4"],
                          r["P5"], r["P6"], r["P7"], r["P8"], r["P9"], r["P10"], r["P11"])
        self.assertEqual(len(cal), 21)                      # 0x31 … 0x45
        regs = {0x00: 0x60}
        regs.update({0x31 + i: b for i, b in enumerate(cal)})
        bus = FakeI2C(0x77, regs)
        s = bmp.detect(bus)
        self.assertEqual(s.name, "BMP390")
        self.assertIn((0x1B, 0x33), bus.writes)             # normal mode, both sensors on
        self.assertIn((0x1D, 0x02), bus.writes)             # 50 Hz output data rate
        for up, ut in [(6_000_000, 8_300_000), (6_700_000, 8_500_000), (7_100_000, 8_100_000)]:
            d = [up & 0xFF, (up >> 8) & 0xFF, up >> 16, ut & 0xFF, (ut >> 8) & 0xFF, ut >> 16]
            bus.regs.update({0x04 + i: b for i, b in enumerate(d)})
            p, t = s.read()
            p_ref, t_ref = self.reference(r, up, ut)
            self.assertAlmostEqual(t, t_ref, places=6)
            self.assertAlmostEqual(p, p_ref, delta=abs(p_ref) * 1e-9 + 1e-6)


class TestFlights(unittest.TestCase):
    def test_many_synthetic_flights(self):
        worst = dict(launch=0, apogee_h=0, apogee_t=0)
        for seed in range(40):
            rng = np.random.default_rng(seed + 1000)
            sim = simulate(seed=seed, noise_pa=rng.uniform(1.5, 6.0), m_wet=rng.uniform(0.13, 0.22),
                           delay=rng.uniform(4.0, 7.0), cd=rng.uniform(0.45, 0.75))
            det, rows, log = run_detector(sim)
            names = [e for e, _ in log]
            self.assertEqual(names[:3], ["LAUNCH", "APOGEE", "LANDED"], (seed, log))
            dl = abs((det.t_launch - 100) - sim["t_liftoff"])
            dh = abs(det.apogee_alt - sim["h_apogee"])
            dta = abs((det.t_apogee - 100) - sim["t_apogee"])
            worst = dict(launch=max(worst["launch"], dl), apogee_h=max(worst["apogee_h"], dh),
                         apogee_t=max(worst["apogee_t"], dta))
            self.assertLess(dl, 0.3, seed)
            self.assertLess(dh, 2.5, seed)
            self.assertLess(dta, 1.0, seed)
            self.assertLess((det.t_landed - 100) - sim["t_landed"], 6.0, seed)
        print("\n  worst of 40 flights: launch time error %.2f s, apogee error %.2f m / %.2f s"
              % (worst["launch"], worst["apogee_h"], worst["apogee_t"]))

    def test_no_false_launch_on_pad(self):
        rng = np.random.default_rng(7)
        det = fl.FlightDetector()
        t = np.arange(0, 600, 0.02)
        p = 101325 - 0.05 * t + rng.normal(0, 6, t.size)   # weather drift + BMP280-level noise
        p[(t > 300) & (t < 301)] -= 25                      # door slam / gust ≈ 2 m blip
        for ti, pi in zip(t, p):
            self.assertEqual(det.update(ti, pi), [], "false event at %.2f s" % ti)
        self.assertEqual(det.state, fl.PAD)


if __name__ == "__main__":
    unittest.main(verbosity=2)
