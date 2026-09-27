// flight_core.cpp - see flight_core.h. Plain C++17, no Arduino dependency.
// License: MIT
#include "flight_core.h"

#include <cmath>

namespace cc {

float pressure_altitude(float p_pa) {
    if (p_pa <= 0.0f) return 0.0f;
    return 44330.77f * (1.0f - std::pow(p_pa / P0_STD, 0.190263f));  // 44330.77 m = T0/L
}

float pressure_to_altitude(float p_pa, float p_ref_pa) {
    // Difference of two *pressure altitudes*. Using p_ref in place of 101325 Pa in the formula
    // would silently assume the pad is at 15 C sea-level temperature: a 1.4 % error at a 600 m
    // site and 3.5 % at 1500 m (the host tests catch exactly this mistake).
    return pressure_altitude(p_pa) - pressure_altitude(p_ref_pa);
}

// ============================================================ Kalman filter
void AltitudeKalman::reset(float h0) {
    x_[0] = h0; x_[1] = 0.0f; x_[2] = 0.0f;
    for (int i = 0; i < 3; ++i)
        for (int j = 0; j < 3; ++j) P_[i][j] = 0.0f;
    P_[0][0] = 4.0f; P_[1][1] = 1.0f; P_[2][2] = 1.0f;
}

void AltitudeKalman::predict(float dt) {
    if (dt <= 0.0f) return;
    const float dt2 = dt * dt, dt3 = dt2 * dt, dt4 = dt3 * dt, dt5 = dt4 * dt;
    // x = F x
    x_[0] += x_[1] * dt + 0.5f * x_[2] * dt2;
    x_[1] += x_[2] * dt;
    // P = F P F^T + Q
    const float F[3][3] = {{1.0f, dt, 0.5f * dt2}, {0.0f, 1.0f, dt}, {0.0f, 0.0f, 1.0f}};
    float FP[3][3], N[3][3];
    for (int i = 0; i < 3; ++i)
        for (int j = 0; j < 3; ++j) {
            FP[i][j] = 0.0f;
            for (int k = 0; k < 3; ++k) FP[i][j] += F[i][k] * P_[k][j];
        }
    for (int i = 0; i < 3; ++i)
        for (int j = 0; j < 3; ++j) {
            N[i][j] = 0.0f;
            for (int k = 0; k < 3; ++k) N[i][j] += FP[i][k] * F[j][k];
        }
    // white-jerk process noise (continuous Wiener-process-acceleration model, discretised)
    const float q = cfg_.sigma_jerk * cfg_.sigma_jerk;
    const float Q[3][3] = {{dt5 / 20.0f, dt4 / 8.0f, dt3 / 6.0f},
                           {dt4 / 8.0f, dt3 / 3.0f, dt2 / 2.0f},
                           {dt3 / 6.0f, dt2 / 2.0f, dt}};
    for (int i = 0; i < 3; ++i)
        for (int j = 0; j < 3; ++j) P_[i][j] = N[i][j] + q * Q[i][j];
}

void AltitudeKalman::scalar_update(int idx, float z, float r) {
    const float S = P_[idx][idx] + r;
    if (S <= 0.0f) return;
    float K[3];
    for (int i = 0; i < 3; ++i) K[i] = P_[i][idx] / S;
    const float y = z - x_[idx];
    for (int i = 0; i < 3; ++i) x_[i] += K[i] * y;
    float row[3] = {P_[idx][0], P_[idx][1], P_[idx][2]};
    for (int i = 0; i < 3; ++i)
        for (int j = 0; j < 3; ++j) P_[i][j] -= K[i] * row[j];
    // keep P symmetric against float round-off
    for (int i = 0; i < 3; ++i)
        for (int j = i + 1; j < 3; ++j) P_[i][j] = P_[j][i] = 0.5f * (P_[i][j] + P_[j][i]);
}

void AltitudeKalman::update_baro(float h_meas) {
    float sb = cfg_.sigma_baro;
    if (std::fabs(x_[1]) > cfg_.mach_lockout_v) sb *= cfg_.mach_baro_scale;
    scalar_update(0, h_meas, sb * sb);
}

void AltitudeKalman::update_accel(float a_meas) { scalar_update(2, a_meas, cfg_.sigma_acc * cfg_.sigma_acc); }

// ============================================================ state machine
const char* state_name(FlightState s) {
    switch (s) {
        case FlightState::PAD: return "PAD";
        case FlightState::BOOST: return "BOOST";
        case FlightState::COAST: return "COAST";
        case FlightState::APOGEE: return "APOGEE";
        case FlightState::DESCENT: return "DESCENT";
        case FlightState::LANDED: return "LANDED";
    }
    return "?";
}

FlightComputer::FlightComputer(const DetectorConfig& d, const KalmanConfig& k) : dc_(d), kf_(k) {}

void FlightComputer::calibrate(float ground_pressure_pa, uint32_t t_ms) {
    p_ground_ = ground_pressure_pa;
    kf_.reset(0.0f);
    last_t_ = t_ms;
    state_t_ = t_ms;
    calibrated_ = true;
}

void FlightComputer::enter(FlightState s, uint32_t t) {
    state_ = s;
    state_t_ = t;
    count_ = 0;
    switch (s) {
        case FlightState::BOOST: break;
        case FlightState::COAST: ev_.burnout_ms = t; break;
        case FlightState::APOGEE: ev_.apogee_ms = t; break;
        case FlightState::DESCENT:
            win_start_ = t;
            win_min_ = win_max_ = kf_.h();
            break;
        case FlightState::LANDED: ev_.landed_ms = t; break;
        default: break;
    }
}

bool FlightComputer::update(const Sample& s) {
    if (!calibrated_) calibrate(s.pressure_pa, s.t_ms);
    const FlightState before = state_;
    const float dt = (s.t_ms - last_t_) * 1e-3f;
    last_t_ = s.t_ms;

    // ---- sensor fusion
    kf_.predict(dt);
    if (s.baro_ok) {
        baro_alt_ = pressure_to_altitude(s.pressure_pa, p_ground_);
        kf_.update_baro(baro_alt_);
    }
    if (s.imu_ok) {
        // Before apogee the rocket points up, so the axial specific force minus 1 g is the vertical
        // acceleration. Under a parachute the attitude is arbitrary: use |a| - 1 g instead.
        const bool upright = state_ == FlightState::PAD || state_ == FlightState::BOOST || state_ == FlightState::COAST;
        const float a = ((upright ? s.acc_axial_g : s.acc_mag_g) - 1.0f) * G0;
        kf_.update_accel(a);
    }
    const float h = kf_.h(), v = kf_.v();
    if (state_ != FlightState::PAD && state_ != FlightState::LANDED) {
        if (h > ev_.max_alt_m) ev_.max_alt_m = h;
        if (v > ev_.max_vel_mps) ev_.max_vel_mps = v;
        if (s.acc_mag_g > ev_.max_acc_g) ev_.max_acc_g = s.acc_mag_g;
    }

    // ---- state machine
    const uint32_t in_state = s.t_ms - state_t_;
    switch (state_) {
        case FlightState::PAD: {
            // let the ground reference follow slow weather drift while we wait
            if (s.baro_ok && dt > 0.0f && dt < 1.0f) {
                const float k = dt / dc_.pad_ref_tau_s;
                p_ground_ += (s.pressure_pa - p_ground_) * k;
            }
            count_ = (s.acc_mag_g > dc_.launch_acc_g) ? count_ + 1 : 0;
            const bool by_acc = count_ >= dc_.launch_acc_samples;
            const bool by_baro = h > dc_.launch_alt_m && v > dc_.launch_vel_mps;
            if (by_acc || by_baro) {
                ev_.launch_ms = by_acc ? s.t_ms - static_cast<uint32_t>(dt * 1000.0f * (count_ - 1)) : s.t_ms;
                enter(FlightState::BOOST, s.t_ms);
            }
            break;
        }
        case FlightState::BOOST:
            count_ = (kf_.a() < 0.0f) ? count_ + 1 : 0;
            if (count_ >= dc_.burnout_samples || in_state > dc_.max_boost_ms) enter(FlightState::COAST, s.t_ms);
            break;
        case FlightState::COAST:
            if (in_state < dc_.min_coast_ms) break;
            count_ = (v <= 0.0f) ? count_ + 1 : 0;
            if (count_ >= dc_.apogee_samples || (ev_.max_alt_m - h) > dc_.apogee_drop_m)
                enter(FlightState::APOGEE, s.t_ms);
            break;
        case FlightState::APOGEE:
            enter(FlightState::DESCENT, s.t_ms);  // APOGEE lasts exactly one sample: it is an event
            break;
        case FlightState::DESCENT:
            if (h < win_min_) win_min_ = h;
            if (h > win_max_) win_max_ = h;
            if (win_max_ - win_min_ > dc_.landed_window_m) {  // still moving: restart the window
                win_start_ = s.t_ms;
                win_min_ = win_max_ = h;
            } else if (s.t_ms - win_start_ >= dc_.landed_window_ms && std::fabs(v) < dc_.landed_vel_mps) {
                enter(FlightState::LANDED, s.t_ms);
            }
            break;
        case FlightState::LANDED:
            break;
    }
    return state_ != before;
}

// ============================================================ beeper
std::size_t BeepEncoder::encode(float value, Beep* out, std::size_t max) {
    long n = std::lround(value);
    if (n < 0) n = 0;
    char digits[12];
    int nd = 0;
    do {
        digits[nd++] = static_cast<char>(n % 10);
        n /= 10;
    } while (n > 0 && nd < 11);
    std::size_t k = 0;
    for (int i = nd - 1; i >= 0 && k < max; --i) {
        const int d = digits[i];
        if (d == 0) {
            out[k++] = {LONG_ON, DIGIT_GAP};
        } else {
            for (int b = 0; b < d && k < max; ++b) out[k++] = {SHORT_ON, (b == d - 1) ? DIGIT_GAP : SHORT_OFF};
        }
    }
    if (k > 0) out[k - 1].off_ms = END_GAP;
    return k;
}

}  // namespace cc
