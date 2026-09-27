// tracker_core.h - barn-door drive maths, shared by the Arduino sketch and the host simulation.
// Plain C++ (no Arduino headers). `real` is float on the Arduino, float or double on the host.
//
// Geometry ("type 1" barn door): a straight rod perpendicular to the base board, at distance R
// from the hinge axis, pushes the top board open. After the rod has advanced d:
//
//     tan(theta) = d / R            ->  the board angle is theta = atan(d / R)
//
// The sky turns at the sidereal rate  omega = 2 pi / 86164.0905 s.  To follow it we need
// theta(t) = omega t, i.e.   d(t) = R tan(omega t)   - NOT the constant speed R omega t.
// With the rod turned by a stepper through a thread of lead L (mm per turn) and S steps per turn:
//
//     steps(t) = S * R * tan(omega t) / L          (tangent-corrected target)
//     steps(t) = S * R * omega t / L               (uncorrected, constant speed)
//
// The drive steps whenever the step count is behind the target. License: MIT
#pragma once
#include <math.h>
#include <stdint.h>

namespace tracker {

constexpr double SIDEREAL_DAY_S = 86164.0905;
constexpr double OMEGA = 6.283185307179586 / SIDEREAL_DAY_S;  // rad/s, 7.2921e-5

template <typename real>
struct Geometry {
    real R_mm;            // hinge axis to rod axis, measured along the base board
    real lead_mm;         // rod advance per turn (M6 coarse = 1.0 mm, 1/4-20 = 1.27 mm)
    real steps_per_rev;   // motor steps per output-shaft turn, including gearbox and microstepping
};

// Target step count at time t (s) since the boards were closed.
template <typename real>
inline int32_t target_steps(real t_s, const Geometry<real>& g, bool corrected) {
    const real a = (real)OMEGA * t_s;
    const real d = corrected ? g.R_mm * (real)tan(a) : g.R_mm * a;
    return (int32_t)floor(d / g.lead_mm * g.steps_per_rev);
}

// Board angle (rad) produced by n steps - what the tracker actually points at.
template <typename real>
inline real angle_from_steps(int32_t n, const Geometry<real>& g) {
    return (real)atan((real)n * g.lead_mm / g.steps_per_rev / g.R_mm);
}

// Time (s) at which step n becomes due - handy to see the step rate rise as the board opens.
template <typename real>
inline real step_time(int32_t n, const Geometry<real>& g, bool corrected) {
    const real ratio = (real)n * g.lead_mm / g.steps_per_rev / g.R_mm;
    return (corrected ? (real)atan(ratio) : ratio) / (real)OMEGA;
}

// Rod length limit: stop before the carriage runs off the rod or the board opens too far.
template <typename real>
inline real max_track_seconds(real max_angle_rad) {
    return max_angle_rad / (real)OMEGA;
}

// 28BYJ-48 half-step sequence (IN1..IN4 of the ULN2003 board).
static const uint8_t HALF_STEP[8] = {0b1000, 0b1100, 0b0100, 0b0110, 0b0010, 0b0011, 0b0001, 0b1001};

}  // namespace tracker
