# main.py — barometric flight logger for Raspberry Pi Pico / Pico W + BMP280 or BMP390.
# Cosmic Library · experiments/22-barometric-altimeter-payload · MIT licence
#
# Copy bmp.py, flightlogic.py and main.py to the Pico (Thonny: File ▸ Save as ▸ Raspberry Pi Pico).
# On power-up it:
#   1. blinks 3×, finds the sensor, averages the pad pressure        (LED: 1 Hz heartbeat = armed)
#   2. keeps the last 2 s of samples in RAM while waiting on the pad
#   3. on LAUNCH writes those 2 s + every new sample to /flight_NNN.csv   (LED: solid on)
#   4. marks APOGEE and LANDED, closes the file, appends a line to /flights.txt
#   5. blinks the apogee in metres, digit by digit, forever (0 = ten blinks)
#
# SAFE MODE: jumper GP15 to GND before power-up and the logger does nothing — use this when you
# only want to copy files off the board over USB.
#
# Wiring (I2C0):  sensor VIN → 3V3(OUT) pin 36 · GND → pin 38 · SDA → GP4 pin 6 · SCL → GP5 pin 7

import os
import time
from machine import I2C, Pin

import bmp
from flightlogic import FlightDetector, STATE_NAMES, PAD, LANDED, blink_digits

SAMPLE_HZ = 50              # samples per second
PRE_SECONDS = 2.0           # pad history saved when launch is detected
FLUSH_EVERY = 50            # lines between file flushes (≈ 1 s)
MIN_FREE_KB = 64            # refuse to arm if flash is nearly full

led = Pin("LED", Pin.OUT)   # works on Pico and Pico W with current MicroPython
safe = Pin(15, Pin.IN, Pin.PULL_UP)


def blink(n, on=120, off=200):
    for _ in range(n):
        led.on(); time.sleep_ms(on); led.off(); time.sleep_ms(off)


def next_filename():
    names = os.listdir("/")
    i = 1
    while "flight_%03d.csv" % i in names:
        i += 1
    return "/flight_%03d.csv" % i


def free_kb():
    s = os.statvfs("/")
    return s[0] * s[3] // 1024


def fmt(t_rel, p, tc, det, state):
    return "%.3f,%.1f,%.2f,%.2f,%.2f,%.2f,%s\n" % (t_rel, p, tc, det.alt, det.alt_f, det.vel, STATE_NAMES[state])


def main():
    blink(3, 60, 60)
    if safe.value() == 0:
        print("safe mode (GP15 grounded): not logging")
        while True:
            blink(1, 30, 1970)

    i2c = I2C(0, sda=Pin(4), scl=Pin(5), freq=400000)
    sensor = bmp.detect(i2c)
    print("sensor:", sensor.name, "free flash: %d kB" % free_kb())
    if free_kb() < MIN_FREE_KB:
        print("flash nearly full — delete old flights")
        while True:
            blink(10, 40, 40); time.sleep_ms(1000)

    det = FlightDetector()
    period = 1000 // SAMPLE_HZ
    n_pre = int(PRE_SECONDS * SAMPLE_HZ)
    ring = [None] * n_pre                    # (t, p, T, alt, alt_f, vel) on the pad
    ri = 0

    # let the sensor's IIR filter settle and seed the pad pressure
    for _ in range(SAMPLE_HZ):
        det.update(time.ticks_ms() / 1000, sensor.read()[0])
        time.sleep_ms(period)

    f = None
    lines = 0
    t_start = time.ticks_ms()
    next_tick = t_start
    hb = 0
    while True:
        now = time.ticks_ms()
        t = time.ticks_diff(now, t_start) / 1000.0
        p, tc = sensor.read()
        events = det.update(t, p)

        if det.state == PAD:
            ring[ri] = (t, p, tc, det.alt, det.alt_f, det.vel)
            ri = (ri + 1) % n_pre
            hb += 1
            led.value(1 if hb % SAMPLE_HZ < 3 else 0)       # heartbeat

        if "LAUNCH" in events:
            led.on()
            name = next_filename()
            f = open(name, "w")
            f.write("t_s,pressure_pa,temp_c,alt_m,alt_filt_m,vel_mps,state\n")
            for k in range(n_pre):                         # oldest → newest pad samples
                s = ring[(ri + k) % n_pre]
                if s is not None:
                    f.write("%.3f,%.1f,%.2f,%.2f,%.2f,%.2f,PAD\n" % (s[0] - det.t_launch, s[1], s[2], s[3], s[4], s[5]))

        if f is not None:
            f.write(fmt(t - det.t_launch, p, tc, det, det.state))
            lines += 1
            if lines % FLUSH_EVERY == 0:
                f.flush()

        if det.state == LANDED and f is not None:
            f.close()
            f = None
            summary = "%s,%s,apogee_m=%.1f,t_apogee_s=%.2f,max_vel_mps=%.1f,p0_pa=%.1f\n" % (
                name, sensor.name, det.apogee_alt or det.max_alt,
                (det.t_apogee or 0) - det.t_launch, det.max_vel, det.p0)
            with open("/flights.txt", "a") as s:
                s.write(summary)
            print(summary)
            break

        next_tick = time.ticks_add(next_tick, period)
        wait = time.ticks_diff(next_tick, time.ticks_ms())
        if wait > 0:
            time.sleep_ms(wait)
        else:
            next_tick = time.ticks_ms()                    # fell behind (flash write) — resync

    # read-out: blink the apogee in metres, forever
    digits = blink_digits(det.apogee_alt or det.max_alt)
    while True:
        for d in digits:
            blink(d, 250, 250)
            time.sleep_ms(900)
        time.sleep_ms(2500)


main()
