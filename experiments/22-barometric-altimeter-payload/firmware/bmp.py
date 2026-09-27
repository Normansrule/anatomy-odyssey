# bmp.py — minimal MicroPython drivers for the Bosch BMP280 and BMP390 (also BMP388)
# barometric pressure sensors over I2C. No external libraries.
# Cosmic Codex · experiments/22-barometric-altimeter-payload · MIT licence
#
# Register maps and compensation formulas are from the Bosch datasheets:
#   BMP280: BST-BMP280-DS001, section 3.11.3 / 8.1 (floating-point compensation)
#   BMP390: BST-BMP390-DS002, section 8.4 / 9 (floating-point compensation)
#
#   from machine import I2C, Pin
#   import bmp
#   s = bmp.detect(I2C(0, sda=Pin(4), scl=Pin(5), freq=400_000))
#   p_pa, t_c = s.read()

import struct
import time

CHIP_BMP280 = 0x58
CHIP_BMP388 = 0x50
CHIP_BMP390 = 0x60


class BMP280:
    """BMP280 in normal mode: pressure x4 oversampling, temperature x1, IIR coefficient 4.
    One measurement takes about 13 ms, so it keeps up with 50 Hz sampling."""

    name = "BMP280"

    def __init__(self, i2c, addr):
        self.i2c, self.addr = i2c, addr
        self._w(0xE0, 0xB6)                      # soft reset
        time.sleep_ms(10)
        c = i2c.readfrom_mem(addr, 0x88, 24)     # calibration words dig_T1..dig_P9
        (self.T1, self.T2, self.T3, self.P1, self.P2, self.P3, self.P4,
         self.P5, self.P6, self.P7, self.P8, self.P9) = struct.unpack("<HhhHhhhhhhhh", c)
        self._w(0xF5, 0x08)                      # config: t_sb 0.5 ms, filter coefficient 4
        self._w(0xF4, 0x2F)                      # ctrl_meas: osrs_t x1, osrs_p x4, normal mode
        time.sleep_ms(50)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def read(self):
        """Return (pressure in Pa, temperature in °C)."""
        d = self.i2c.readfrom_mem(self.addr, 0xF7, 6)
        adc_p = (d[0] << 12) | (d[1] << 4) | (d[2] >> 4)
        adc_t = (d[3] << 12) | (d[4] << 4) | (d[5] >> 4)
        v1 = (adc_t / 16384.0 - self.T1 / 1024.0) * self.T2
        v2 = (adc_t / 131072.0 - self.T1 / 8192.0) ** 2 * self.T3
        t_fine = v1 + v2
        temp = t_fine / 5120.0
        v1 = t_fine / 2.0 - 64000.0
        v2 = v1 * v1 * self.P6 / 32768.0
        v2 = v2 + v1 * self.P5 * 2.0
        v2 = v2 / 4.0 + self.P4 * 65536.0
        v1 = (self.P3 * v1 * v1 / 524288.0 + self.P2 * v1) / 524288.0
        v1 = (1.0 + v1 / 32768.0) * self.P1
        if v1 == 0:
            return 0.0, temp
        p = 1048576.0 - adc_p
        p = (p - v2 / 4096.0) * 6250.0 / v1
        v1 = self.P9 * p * p / 2147483648.0
        v2 = p * self.P8 / 32768.0
        p = p + (v1 + v2 + self.P7) / 16.0
        return p, temp


class BMP390:
    """BMP390 / BMP388 in normal mode: pressure x4, temperature x1, 50 Hz output data rate,
    IIR coefficient 3. Relative accuracy ±3 Pa ≈ ±0.25 m (datasheet)."""

    name = "BMP390"

    def __init__(self, i2c, addr):
        self.i2c, self.addr = i2c, addr
        self._w(0x7E, 0xB6)                      # CMD: soft reset
        time.sleep_ms(10)
        c = i2c.readfrom_mem(addr, 0x31, 21)     # NVM_PAR_T1 .. NVM_PAR_P11
        t1, t2, t3, p1, p2, p3, p4, p5, p6, p7, p8, p9, p10, p11 = struct.unpack("<HHbhhbbHHbbhbb", c)
        # scale the integer coefficients to floating point (datasheet section 9.1)
        self.t1 = t1 * 2.0 ** 8
        self.t2 = t2 / 2.0 ** 30
        self.t3 = t3 / 2.0 ** 48
        self.p1 = (p1 - 2 ** 14) / 2.0 ** 20
        self.p2 = (p2 - 2 ** 14) / 2.0 ** 29
        self.p3 = p3 / 2.0 ** 32
        self.p4 = p4 / 2.0 ** 37
        self.p5 = p5 * 2.0 ** 3
        self.p6 = p6 / 2.0 ** 6
        self.p7 = p7 / 2.0 ** 8
        self.p8 = p8 / 2.0 ** 15
        self.p9 = p9 / 2.0 ** 48
        self.p10 = p10 / 2.0 ** 48
        self.p11 = p11 / 2.0 ** 65
        self._w(0x1C, 0x02)                      # OSR: osr_p x4, osr_t x1
        self._w(0x1D, 0x02)                      # ODR: 50 Hz
        self._w(0x1F, 0x04)                      # CONFIG: IIR coefficient 3
        self._w(0x1B, 0x33)                      # PWR_CTRL: press_en, temp_en, normal mode
        time.sleep_ms(50)

    def _w(self, reg, val):
        self.i2c.writeto_mem(self.addr, reg, bytes([val]))

    def read(self):
        """Return (pressure in Pa, temperature in °C)."""
        d = self.i2c.readfrom_mem(self.addr, 0x04, 6)
        up = d[0] | (d[1] << 8) | (d[2] << 16)
        ut = d[3] | (d[4] << 8) | (d[5] << 16)
        pd1 = ut - self.t1
        pd2 = pd1 * self.t2
        t = pd2 + pd1 * pd1 * self.t3            # temperature, °C
        o1 = self.p5 + self.p6 * t + self.p7 * t * t + self.p8 * t * t * t
        o2 = up * (self.p1 + self.p2 * t + self.p3 * t * t + self.p4 * t * t * t)
        pd4 = up * up * (self.p9 + self.p10 * t) + up * up * up * self.p11
        return o1 + o2 + pd4, t


def detect(i2c):
    """Scan 0x76 and 0x77, read the chip-ID register and return the right driver."""
    found = i2c.scan()
    for addr in (0x77, 0x76):
        if addr not in found:
            continue
        try:
            if i2c.readfrom_mem(addr, 0x00, 1)[0] in (CHIP_BMP390, CHIP_BMP388):
                return BMP390(i2c, addr)
        except OSError:
            pass
        try:
            if i2c.readfrom_mem(addr, 0xD0, 1)[0] == CHIP_BMP280:
                return BMP280(i2c, addr)
        except OSError:
            pass
    raise OSError("no BMP280/BMP390 found on I2C (saw %s)" % [hex(a) for a in found])
