// Cosmic Codex barn-door star tracker - Arduino Nano/Uno (or any Arduino-compatible board)
// 28BYJ-48 stepper + ULN2003 driver board, M6 x 1.0 threaded rod, tangent-corrected sidereal rate.
//
// Controls
//   START/STOP button (D2 to GND)  : start tracking from the closed position / pause / resume
//                                    (while paused the clock keeps running; resuming catches up)
//   REWIND button     (D3 to GND)  : run back to the start (closed boards) at full speed
//   HOME switch       (D4 to GND)  : optional end-stop that closes when the boards are shut
//   Hold START while powering up   : UNCORRECTED mode (constant rod speed) - for the experiment in the README
// LED (D13): slow blink = tracking, fast blink = rewinding, off = idle.
//
// Before the first night measure R (hinge axis to rod axis) to 0.5 mm and set GEOM below.
// License: MIT
#include <Arduino.h>

#include "tracker_core.h"

// ---------------- configuration
static const uint8_t PIN_IN[4] = {8, 9, 10, 11};  // ULN2003 IN1..IN4
static const uint8_t PIN_START = 2, PIN_REWIND = 3, PIN_HOME = 4, PIN_LED = 13;
static const int8_t DIRECTION = +1;               // flip to -1 if the rod turns the wrong way
static const float MAX_ANGLE_DEG = 15.0f;         // stop after 15 degrees (= 60 min of tracking)
static const float REWIND_STEPS_PER_S = 700.0f;   // 28BYJ-48 half-stepping tops out near 800/s

// 28BYJ-48: 64 half-steps per rotor turn x 63.68395:1 gearbox = 4075.77 half-steps per output turn.
// (Many sellers say "2048 steps" - that is full-steps with the rounded ratio 64:1.)
static const tracker::Geometry<float> GEOM = {228.6f, 1.0f, 64.0f * 63.68395f};

// ---------------- state
enum Mode : uint8_t { IDLE, TRACKING, PAUSED, REWINDING };
static Mode mode = IDLE;
static bool corrected = true;
static int32_t pos = 0;             // half-steps from the closed position
static uint8_t phase = 0;
static uint32_t last_us = 0;
static uint64_t track_us = 0;       // tracking time accumulated (64-bit: micros() wraps every 71 min)
static uint32_t last_rewind_us = 0;

static void coils(uint8_t pattern) {
    for (uint8_t i = 0; i < 4; ++i) digitalWrite(PIN_IN[i], (pattern >> (3 - i)) & 1);
}

static void step(int8_t dir) {
    phase = (uint8_t)((phase + (dir * DIRECTION > 0 ? 1 : 7)) & 7);
    coils(tracker::HALF_STEP[phase]);
    pos += dir;
}

static bool pressed(uint8_t pin) {
    static uint32_t last[5] = {0};
    if (digitalRead(pin) == LOW && millis() - last[pin] > 300) {
        last[pin] = millis();
        return true;
    }
    return false;
}

void setup() {
    Serial.begin(115200);
    for (uint8_t i = 0; i < 4; ++i) pinMode(PIN_IN[i], OUTPUT);
    pinMode(PIN_START, INPUT_PULLUP);
    pinMode(PIN_REWIND, INPUT_PULLUP);
    pinMode(PIN_HOME, INPUT_PULLUP);
    pinMode(PIN_LED, OUTPUT);
    coils(0);
    delay(50);
    if (digitalRead(PIN_START) == LOW) corrected = false;
    Serial.print(F("Barn-door tracker ready. R = "));
    Serial.print(GEOM.R_mm);
    Serial.print(F(" mm, lead = "));
    Serial.print(GEOM.lead_mm);
    Serial.print(F(" mm, mode = "));
    Serial.println(corrected ? F("tangent-corrected") : F("UNCORRECTED (constant speed)"));
    while (digitalRead(PIN_START) == LOW) delay(10);  // wait for release
}

void loop() {
    const uint32_t now = micros();
    const uint32_t dt = now - last_us;  // unsigned subtraction is wrap-safe
    last_us = now;

    if (pressed(PIN_START)) {
        if (mode == TRACKING) mode = PAUSED;
        else if (mode == PAUSED) mode = TRACKING;
        else if (mode == IDLE) { mode = TRACKING; track_us = 0; pos = 0; }
    }
    if (pressed(PIN_REWIND)) mode = REWINDING;

    switch (mode) {
        case TRACKING: {
            track_us += dt;
            const float t = (float)(track_us / 1000ULL) * 1e-3f;
            if (t > tracker::max_track_seconds<float>(MAX_ANGLE_DEG * 0.0174533f)) {
                mode = IDLE;
                coils(0);
                Serial.println(F("end of travel - rewind"));
                break;
            }
            const int32_t target = tracker::target_steps<float>(t, GEOM, corrected);
            if (pos < target) step(+1);  // at most one step per loop: max rate >> the ~70 steps/s needed
            digitalWrite(PIN_LED, (millis() / 500) & 1);
            break;
        }
        case REWINDING:
            if (digitalRead(PIN_HOME) == LOW || pos <= 0) {
                mode = IDLE;
                pos = 0;
                coils(0);
                Serial.println(F("home"));
            } else if (now - last_rewind_us >= (uint32_t)(1e6f / REWIND_STEPS_PER_S)) {
                last_rewind_us = now;
                step(-1);
            }
            digitalWrite(PIN_LED, (millis() / 100) & 1);
            break;
        case PAUSED:
            track_us += dt;  // the sky keeps turning: on resume the drive catches up, framing is kept
            coils(0);
            digitalWrite(PIN_LED, HIGH);
            break;
        case IDLE:
            coils(0);  // de-energise: the thread is self-locking, and the motor stays cool
            digitalWrite(PIN_LED, LOW);
            break;
    }
}
