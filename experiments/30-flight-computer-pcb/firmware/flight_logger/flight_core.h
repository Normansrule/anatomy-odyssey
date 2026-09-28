// flight_core.h - portable flight logic for the Cosmic Library CC-FL1 data logger
// ---------------------------------------------------------------------------------
// Everything in this file is plain C++17 with no Arduino dependency, so the exact
// same code runs on the RP2040 and in the host-side test harness (firmware/test).
//
//   * pressure -> altitude (International Standard Atmosphere, troposphere)
//   * 3-state Kalman filter [altitude, velocity, acceleration] fusing barometer + accelerometer
//   * flight state machine  PAD -> BOOST -> COAST -> APOGEE -> DESCENT -> LANDED
//   * beep encoder that turns the apogee into a sequence of beeps
//
// This is a DATA LOGGER. It detects flight events so it can change logging rate and report
// apogee. It has no outputs that fire anything - recovery deployment belongs to a certified
// commercial altimeter (see experiment 40).
// License: MIT
#pragma once

#include <cstddef>
#include <cstdint>

namespace cc {

// ------------------------------------------------------------------ physics helpers
constexpr float G0 = 9.80665f;          // standard gravity, m/s^2
constexpr float P0_STD = 101325.0f;     // ISA sea-level pressure, Pa

// ISA "pressure altitude" (m above the 101325 Pa level):
//   h = T0/L * (1 - (p/p0)^(R*L/(g*M)))   T0 = 288.15 K, L = 0.0065 K/m, exponent 0.190263
// Valid in the troposphere (to 11 km), which covers every flight in this repo.
float pressure_altitude(float p_pa);
// Altitude above the pad = pressure_altitude(p) - pressure_altitude(p_ground).
float pressure_to_altitude(float p_pa, float p_ref_pa);

// ------------------------------------------------------------------ Kalman filter
// State x = [h, v, a]^T, constant-acceleration model driven by white jerk noise.
//   x_k+1 = F x_k + w,   F = [[1, dt, dt^2/2], [0, 1, dt], [0, 0, 1]]
//   z_baro = h + n_b,    z_acc = a + n_a
// Two scalar updates per step (sequential processing) keep the maths 3x3 and readable.
struct KalmanConfig {
    float sigma_jerk = 80.0f;     // process noise (m/s^3): how fast acceleration may change
    float sigma_baro = 0.6f;      // barometric altitude noise (m, 1-sigma)
    float sigma_acc = 0.8f;       // accelerometer noise after gravity removal (m/s^2)
    float mach_lockout_v = 150.0f;// above this speed baro is distrusted (shock waves on ports)
    float mach_baro_scale = 30.0f;// sigma_baro multiplier while locked out
};

class AltitudeKalman {
public:
    explicit AltitudeKalman(const KalmanConfig& c = KalmanConfig()) : cfg_(c) { reset(0.0f); }
    void reset(float h0);
    void predict(float dt);
    void update_baro(float h_meas);
    void update_accel(float a_meas);
    float h() const { return x_[0]; }
    float v() const { return x_[1]; }
    float a() const { return x_[2]; }
    float var_h() const { return P_[0][0]; }

private:
    void scalar_update(int idx, float z, float r);
    KalmanConfig cfg_;
    float x_[3];
    float P_[3][3];
};

// ------------------------------------------------------------------ state machine
enum class FlightState : uint8_t { PAD = 0, BOOST, COAST, APOGEE, DESCENT, LANDED };
const char* state_name(FlightState s);

struct Sample {
    uint32_t t_ms;       // time since power-up
    float pressure_pa;   // barometer
    float temp_c;
    float acc_axial_g;   // accelerometer along the rocket axis, +1 g when standing on the pad
    float acc_mag_g;     // |a| of all three axes
    bool baro_ok = true;
    bool imu_ok = true;
};

struct DetectorConfig {
    float launch_acc_g = 2.5f;        // |a| above this ...
    uint16_t launch_acc_samples = 10; // ... for this many consecutive samples (100 ms at 100 Hz)
    float launch_alt_m = 30.0f;       // backup: altitude AND
    float launch_vel_mps = 15.0f;     //         velocity above these
    uint16_t burnout_samples = 5;     // kf acceleration < 0 this many samples -> COAST
    uint32_t max_boost_ms = 8000;
    uint16_t apogee_samples = 5;      // kf velocity <= 0 this many samples -> APOGEE
    float apogee_drop_m = 10.0f;      // backup: this far below the maximum -> APOGEE
    uint32_t min_coast_ms = 500;      // ignore apogee just after burnout (transonic noise)
    float landed_vel_mps = 1.0f;
    float landed_window_m = 2.0f;     // altitude span over the window
    uint32_t landed_window_ms = 5000;
    float pad_ref_tau_s = 30.0f;      // on the pad the ground reference tracks slow weather drift
};

struct FlightEvents {
    uint32_t launch_ms = 0, burnout_ms = 0, apogee_ms = 0, landed_ms = 0;
    float max_alt_m = 0.0f;           // filtered
    float max_vel_mps = 0.0f;
    float max_acc_g = 0.0f;
};

class FlightComputer {
public:
    FlightComputer(const DetectorConfig& d = DetectorConfig(), const KalmanConfig& k = KalmanConfig());

    // Call once with ~1-2 s of pad samples averaged into a ground pressure.
    void calibrate(float ground_pressure_pa, uint32_t t_ms);

    // Feed one sample (100 Hz). Returns true if the state changed on this sample.
    bool update(const Sample& s);

    FlightState state() const { return state_; }
    const FlightEvents& events() const { return ev_; }
    const AltitudeKalman& kf() const { return kf_; }
    float baro_alt() const { return baro_alt_; }
    float ground_pressure() const { return p_ground_; }
    bool calibrated() const { return calibrated_; }

private:
    void enter(FlightState s, uint32_t t);
    DetectorConfig dc_;
    AltitudeKalman kf_;
    FlightState state_ = FlightState::PAD;
    FlightEvents ev_;
    bool calibrated_ = false;
    float p_ground_ = P0_STD;
    float baro_alt_ = 0.0f;
    uint32_t last_t_ = 0;
    uint32_t state_t_ = 0;
    uint16_t count_ = 0;
    // landed detector: min/max over a sliding window, restarted when violated
    uint32_t win_start_ = 0;
    float win_min_ = 0.0f, win_max_ = 0.0f;
};

// ------------------------------------------------------------------ beeper
// Encodes a number as beeps, digit by digit: digit n>0 -> n short beeps, 0 -> one long beep.
// Example 1234 m: "."  pause  ".."  pause  "..."  pause  "...."  long pause.
struct Beep {
    uint16_t on_ms;
    uint16_t off_ms;
};

class BeepEncoder {
public:
    static constexpr std::size_t MAX_BEEPS = 64;
    // Returns number of beeps written to out (<= MAX_BEEPS). value is rounded, negative -> 0.
    static std::size_t encode(float value, Beep* out, std::size_t max = MAX_BEEPS);
    static constexpr uint16_t SHORT_ON = 150, SHORT_OFF = 250, LONG_ON = 700;
    static constexpr uint16_t DIGIT_GAP = 1000, END_GAP = 4000;
};

}  // namespace cc
