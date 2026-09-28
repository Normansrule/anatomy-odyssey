# flightlogic.py — hardware-free flight logic for the barometric altimeter.
# Runs unchanged on MicroPython (the Pico) and on desktop CPython (the unit tests),
# so the exact code that flies is the code that is tested with synthetic flights.
# Cosmic Library · experiments/22-barometric-altimeter-payload · MIT licence

# International Standard Atmosphere, troposphere (ICAO Doc 7488 / US Standard Atmosphere 1976):
#   h = (T0 / L) * (1 - (p / p0) ** (R * L / (g0 * M)))
T0 = 288.15          # K, sea-level standard temperature
LAPSE = 0.0065       # K/m, temperature lapse rate
EXPONENT = 0.190263  # R*L/(g0*M) = 8.31446 * 0.0065 / (9.80665 * 0.0289644)

PAD, ASCENT, DESCENT, LANDED = 0, 1, 2, 3
STATE_NAMES = ("PAD", "ASCENT", "DESCENT", "LANDED")


def altitude_m(p_pa, p0_pa, t0_k=T0):
    """Height above the reference pressure p0 (the launch pad), in metres."""
    return (t0_k / LAPSE) * (1.0 - (p_pa / p0_pa) ** EXPONENT)


class AlphaBeta:
    """Alpha–beta filter: a fixed-gain Kalman filter for position + velocity.
    Smooths sensor noise and estimates vertical speed without a second sensor."""

    def __init__(self, alpha=0.35, beta=0.06):
        self.a, self.b = alpha, beta
        self.x = 0.0
        self.v = 0.0
        self.started = False

    def reset(self, x):
        self.x, self.v, self.started = x, 0.0, True

    def update(self, z, dt):
        if not self.started:
            self.reset(z)
            return self.x, self.v
        if dt <= 0:
            dt = 1e-3
        xp = self.x + self.v * dt          # predict
        r = z - xp                         # residual
        self.x = xp + self.a * r           # correct
        self.v = self.v + (self.b / dt) * r
        return self.x, self.v


class FlightDetector:
    """Feed it (time, pressure) samples; it tracks the pad pressure, detects launch,
    apogee and landing, and returns event names as they happen.

    Launch  : filtered altitude > launch_alt AND vertical speed > launch_vel for n_confirm samples
    Apogee  : after the lockout, speed < 0 continuously for apogee_confirm seconds and altitude
              has dropped apogee_drop below the running maximum; the apogee is the time of the
              maximum (a short ejection-charge pressure spike does not fool it)
    Landing : filtered altitude stays within ±land_band metres for land_time seconds (at any
              altitude — you might land on a hill), or the flight timer runs out
    """

    def __init__(self, launch_alt=8.0, launch_vel=5.0, n_confirm=4, apogee_confirm=0.3,
                 apogee_lockout=1.0, apogee_drop=1.0, land_band=1.5, land_time=3.0,
                 max_flight=150.0, pad_tau=20.0):
        self.launch_alt, self.launch_vel = launch_alt, launch_vel
        self.n_confirm = n_confirm
        self.apogee_confirm = apogee_confirm  # s of continuous descent (rides out ejection spikes)
        self.t_desc = None
        self.apogee_lockout, self.apogee_drop = apogee_lockout, apogee_drop
        self.land_band, self.land_time = land_band, land_time
        self.still_alt = 0.0
        self.max_flight = max_flight
        self.pad_tau = pad_tau               # s, time constant of the pad-pressure tracker
        self.state = PAD
        self.p0 = None                       # reference (pad) pressure, Pa
        self.filter = AlphaBeta()
        self.t_prev = None
        self.count = 0
        self.t_launch = None
        self.max_alt, self.t_max = -1e9, None
        self.apogee_alt, self.t_apogee = None, None
        self.max_vel = 0.0
        self.t_still = None
        self.t_landed = None
        self.alt = 0.0
        self.alt_f = 0.0
        self.vel = 0.0

    def update(self, t, p):
        """t: seconds (any origin, monotonic); p: pressure in Pa. Returns a list of events."""
        events = []
        dt = 0.02 if self.t_prev is None else t - self.t_prev
        self.t_prev = t
        if self.p0 is None:
            self.p0 = p
        if self.state == PAD:
            # follow slow weather drift on the pad; frozen from launch onwards
            k = min(1.0, dt / self.pad_tau)
            self.p0 += (p - self.p0) * k
        self.alt = altitude_m(p, self.p0)
        self.alt_f, self.vel = self.filter.update(self.alt, dt)

        if self.state == PAD:
            if self.alt_f > self.launch_alt and self.vel > self.launch_vel:
                self.count += 1
                if self.count >= self.n_confirm:
                    self.state = ASCENT
                    # back-date the launch assuming constant acceleration since lift-off:
                    # h = v t / 2  →  t = 2 h / v   (capped at 1 s)
                    self.t_launch = t - min(1.0, 2.0 * self.alt_f / max(self.vel, 1.0))
                    self.count = 0
                    events.append("LAUNCH")
            else:
                self.count = 0

        elif self.state == ASCENT:
            if self.vel > self.max_vel:
                self.max_vel = self.vel
            if self.alt_f > self.max_alt:
                self.max_alt, self.t_max = self.alt_f, t
            if t - self.t_launch > self.apogee_lockout:
                if self.vel < 0 and self.alt_f < self.max_alt - self.apogee_drop:
                    if self.t_desc is None:
                        self.t_desc = t
                    elif t - self.t_desc >= self.apogee_confirm:
                        self.state = DESCENT
                        self.apogee_alt, self.t_apogee = self.max_alt, self.t_max
                        events.append("APOGEE")
                else:
                    self.t_desc = None

        elif self.state == DESCENT:
            # landed = the filtered altitude has stayed inside a ±land_band window for land_time
            if self.t_still is None or abs(self.alt_f - self.still_alt) > self.land_band:
                self.t_still, self.still_alt = t, self.alt_f
            elif t - self.t_still >= self.land_time:
                self.state = LANDED
                self.t_landed = self.t_still
                events.append("LANDED")

        if self.state in (ASCENT, DESCENT) and t - self.t_launch > self.max_flight:
            self.state = LANDED
            self.t_landed = t
            events.append("TIMEOUT")
        return events


def blink_digits(value):
    """Split a whole number of metres into digits for LED/buzzer read-out; 0 is sent as 10 blinks.
    e.g. 187 -> [1, 8, 7]"""
    s = str(int(round(max(0, value))))
    return [10 if c == "0" else int(c) for c in s]
