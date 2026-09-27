// CC-FL1 flight DATA LOGGER - Raspberry Pi Pico (RP2040), Arduino-Pico core
// ===========================================================================
// Board:     "Raspberry Pi Pico" from Earle Philhower's arduino-pico core
//            (Boards Manager URL: https://github.com/earlephilhower/arduino-pico/releases/download/global/package_rp2040_index.json)
// Libraries: "Adafruit BMP3XX Library", "Adafruit LSM6DS" (Library Manager); SD is built into the core.
//            Optional telemetry: "LoRa" by Sandeep Mistry.
//
// Core 0: 100 Hz loop - read BMP390 + LSM6DSO32, Kalman filter, state machine, beeper, telemetry
// Core 1: drains a lock-free queue of records to a CSV file on the microSD card
//
// PAD -> BOOST -> COAST -> APOGEE -> DESCENT -> LANDED. On LANDED the file is closed and the
// beeper repeats the apogee (digit by digit) so you can hear it while walking up to the rocket.
//
// SAFETY: this firmware only measures, logs, beeps and transmits. It has no deployment or
// ignition outputs, and none should be added: use a certified commercial altimeter for recovery.
// License: MIT
#include <Arduino.h>
#include <SD.h>
#include <SPI.h>
#include <Wire.h>

#include <Adafruit_BMP3XX.h>
#include <Adafruit_LSM6DSO32.h>
#include <atomic>

#include "config.h"
#include "flight_core.h"
#include "nmea.h"
#include "telemetry_packet.h"

#if TELEMETRY_ENABLED
#include <LoRa.h>
#endif

using cc::FlightState;

// ------------------------------------------------------------------ log record + queue
struct LogRecord {
    uint32_t t_ms;
    uint8_t state;
    float baro_alt, kf_alt, kf_vel, kf_acc, pressure, temp;
    float ax, ay, az, gx, gy, gz;  // g and deg/s
    float vbat;
};

static LogRecord ring[RING_RECORDS];
static std::atomic<uint32_t> ring_head{0}, ring_tail{0};  // head written by core0, tail by core1
static std::atomic<bool> sd_ready{false}, close_request{false}, file_closed{false};
static std::atomic<uint32_t> dropped{0};

static bool ring_push(const LogRecord& r) {
    const uint32_t h = ring_head.load(std::memory_order_relaxed);
    if (h - ring_tail.load(std::memory_order_acquire) >= RING_RECORDS) {
        dropped.fetch_add(1);
        return false;
    }
    ring[h % RING_RECORDS] = r;
    ring_head.store(h + 1, std::memory_order_release);
    return true;
}

// ------------------------------------------------------------------ globals (core 0)
static Adafruit_BMP3XX bmp;
static Adafruit_LSM6DSO32 imu;
static cc::FlightComputer fc;
static cc::NmeaGga gps;
static bool baro_ok = false, imu_ok = false;
static LogRecord prelaunch[PRELAUNCH_SAMPLES];
static uint32_t prelaunch_n = 0, last_logged_t = 0, sample_n = 0, landed_at = 0;
static char log_name[16] = "NOFILE";

// ------------------------------------------------------------------ beeper (non-blocking)
static cc::Beep pattern[cc::BeepEncoder::MAX_BEEPS];
static size_t pattern_len = 0, pattern_i = 0;
static bool beep_on = false;
static uint32_t beep_t = 0;

static void play(const cc::Beep* p, size_t n) {
    memcpy(pattern, p, n * sizeof(cc::Beep));
    pattern_len = n;
    pattern_i = 0;
    beep_on = false;
    beep_t = millis();
}

static void beeper_task() {
    if (pattern_len == 0) return;
    const uint32_t now = millis();
    const cc::Beep& b = pattern[pattern_i];
    if (!beep_on && (int32_t)(now - beep_t) >= 0) {
        tone(PIN_BUZZER, BEEP_FREQ_HZ);
        digitalWrite(PIN_LED, HIGH);
        beep_on = true;
        beep_t = now;
    } else if (beep_on && (int32_t)(now - beep_t) >= (int32_t)b.on_ms) {
        noTone(PIN_BUZZER);
        digitalWrite(PIN_LED, LOW);
        beep_on = false;
        beep_t = now + b.off_ms;  // wait off_ms before the next beep
        pattern_i = (pattern_i + 1) % pattern_len;
    }
}

// fatal error: beep `code` long beeps forever (2 = barometer, 3 = IMU, 4 = SD card)
static void fail(int code, const char* why) {
    Serial.printf("FATAL: %s\n", why);
    cc::Beep p[8];
    for (int i = 0; i < code; ++i) p[i] = {600, (uint16_t)(i == code - 1 ? 3000 : 400)};
    play(p, code);
    for (;;) {
        beeper_task();
        delay(5);
    }
}

// ------------------------------------------------------------------ sensors
static float read_vbat() { return analogRead(PIN_VBAT_ADC) * (3.3f / 4095.0f) * 2.0f; }

static bool read_sensors(LogRecord& r, cc::Sample& s) {
    r.t_ms = s.t_ms = millis();
    s.baro_ok = baro_ok && bmp.performReading();  // forced-mode conversion, ~5 ms with the settings below
    r.pressure = s.pressure_pa = s.baro_ok ? (float)bmp.pressure : 0.0f;
    r.temp = s.temp_c = s.baro_ok ? (float)bmp.temperature : 0.0f;
    sensors_event_t a, g, t;
    s.imu_ok = imu_ok && imu.getEvent(&a, &g, &t);
    const float k = 1.0f / cc::G0;
    r.ax = a.acceleration.x * k;
    r.ay = a.acceleration.y * k;
    r.az = a.acceleration.z * k;
    r.gx = g.gyro.x * 57.2958f;
    r.gy = g.gyro.y * 57.2958f;
    r.gz = g.gyro.z * 57.2958f;
    const float axes[3] = {r.ax, r.ay, r.az};
    s.acc_axial_g = AXIAL_SIGN * axes[AXIAL_AXIS];
    s.acc_mag_g = sqrtf(r.ax * r.ax + r.ay * r.ay + r.az * r.az);
    return s.baro_ok || s.imu_ok;
}

// ------------------------------------------------------------------ telemetry
#if TELEMETRY_ENABLED
static uint16_t tlm_seq = 0;
static uint32_t tlm_last = 0, id_last = 0;
static bool radio_ok = false;

static void telemetry_task(const LogRecord& r) {
    if (!radio_ok) return;
    const uint32_t period = fc.state() == FlightState::LANDED ? BEACON_PERIOD_MS : TELEMETRY_PERIOD_MS;
    if (r.t_ms - tlm_last < period) return;
    tlm_last = r.t_ms;
    cc_tlm_t p;
    memset(&p, 0, sizeof(p));
    p.state = (uint8_t)fc.state();
    p.seq = tlm_seq++;
    p.t_ms = r.t_ms;
    p.alt_dm = (int32_t)lroundf(fc.kf().h() * 10.0f);
    p.vel_dms = (int16_t)constrain(lroundf(fc.kf().v() * 10.0f), -32767, 32767);
    p.acc_cg = (int16_t)constrain(lroundf(sqrtf(r.ax * r.ax + r.ay * r.ay + r.az * r.az) * 100.0f), 0, 32767);
    p.lat_e7 = gps.fix() ? gps.lat_e7() : 0;
    p.lon_e7 = gps.fix() ? gps.lon_e7() : 0;
    p.max_alt_m = (uint16_t)constrain(lroundf(fc.events().max_alt_m), 0, 65535);
    p.vbat_mv = (uint16_t)(r.vbat * 1000.0f);
    p.sats = gps.sats();
    p.flags = (gps.fix() ? 1 : 0) | (sd_ready.load() && !file_closed.load() ? 2 : 0) | (baro_ok ? 4 : 0) | (imu_ok ? 8 : 0);
    cc_tlm_seal(&p);
    LoRa.beginPacket();
    LoRa.write((const uint8_t*)&p, CC_TLM_LEN);
    LoRa.endPacket(true);  // async: returns immediately, the SX1276 finishes on its own
    // Amateur (Part 97) operation only: identify with the callsign at least every 10 minutes.
    if (sizeof(CALLSIGN) > 1 && r.t_ms - id_last > 9UL * 60UL * 1000UL) {
        id_last = r.t_ms;
        delay(80);  // let the previous frame finish (time on air ~ 62 ms at SF9 / 500 kHz)
        LoRa.beginPacket();
        LoRa.print("DE ");
        LoRa.print(CALLSIGN);
        LoRa.endPacket();
    }
}
#endif

// ================================================================== core 0
void setup() {
    Serial.begin(115200);
    pinMode(PIN_LED, OUTPUT);
    pinMode(PIN_BUZZER, OUTPUT);
    pinMode(PIN_LDO_EN, OUTPUT);
    pinMode(PIN_SD_DET, INPUT_PULLUP);
    analogReadResolution(12);
    digitalWrite(PIN_LDO_EN, HIGH);  // power the sensor/SD rail
    delay(20);

    Serial1.setTX(PIN_GPS_TX_TO_GPS);
    Serial1.setRX(PIN_GPS_RX_FROM_GPS);
    Serial1.begin(9600);

    Wire.setSDA(PIN_I2C_SDA);
    Wire.setSCL(PIN_I2C_SCL);
    Wire.begin();
    Wire.setClock(400000);

    baro_ok = bmp.begin_I2C(BMP390_I2C_ADDR, &Wire);
    if (!baro_ok) fail(2, "BMP390 not found");
    bmp.setPressureOversampling(BMP3_OVERSAMPLING_4X);
    bmp.setTemperatureOversampling(BMP3_NO_OVERSAMPLING);
    bmp.setIIRFilterCoeff(BMP3_IIR_FILTER_COEFF_3);
    bmp.setOutputDataRate(BMP3_ODR_100_HZ);

    imu_ok = imu.begin_I2C(LSM6DSO32_I2C_ADDR, &Wire);
    if (!imu_ok) fail(3, "LSM6DSO32 not found");
    imu.setAccelRange(LSM6DSO32_ACCEL_RANGE_32_G);
    imu.setGyroRange(LSM6DS_GYRO_RANGE_2000_DPS);
    imu.setAccelDataRate(LSM6DS_RATE_416_HZ);
    imu.setGyroDataRate(LSM6DS_RATE_416_HZ);

#if TELEMETRY_ENABLED
    SPI1.setRX(PIN_RADIO_MISO);
    SPI1.setTX(PIN_RADIO_MOSI);
    SPI1.setSCK(PIN_RADIO_SCK);
    LoRa.setSPI(SPI1);
    LoRa.setPins(PIN_RADIO_CS, PIN_RADIO_RST, PIN_RADIO_DIO0);
    radio_ok = LoRa.begin(RADIO_FREQ_HZ);
    if (radio_ok) {
        LoRa.setSpreadingFactor(LORA_SF);
        LoRa.setSignalBandwidth(LORA_BW_HZ);
        LoRa.setCodingRate4(5);
        LoRa.setTxPower(LORA_TX_DBM);
        LoRa.enableCrc();
    }
#endif

    // ground reference: average 1 s of pressure while the rocket sits still
    float psum = 0;
    int n = 0;
    for (int i = 0; i < 100; ++i) {
        if (bmp.performReading()) {
            psum += (float)bmp.pressure;
            ++n;
        }
        delay(10);
    }
    fc.calibrate(n ? psum / n : cc::P0_STD, millis());

    // wait (max 3 s) for core 1 to open the log file
    const uint32_t t0 = millis();
    while (!sd_ready.load() && millis() - t0 < 3000) delay(10);
    if (!sd_ready.load()) fail(4, "microSD not ready");

    Serial.printf("CC-FL1 ready. ground %.1f Pa, logging to %s\n", fc.ground_pressure(), log_name);
    static const cc::Beep ready[] = {{80, 80}, {80, 2920}};  // double chirp every 3 s = armed & happy
    play(ready, 2);
}

void loop() {
    static uint32_t next_us = micros();
    beeper_task();
    while (Serial1.available()) gps.feed((char)Serial1.read());
    if ((int32_t)(micros() - next_us) < 0) return;
    next_us += SAMPLE_PERIOD_US;

    LogRecord r;
    cc::Sample s;
    read_sensors(r, s);
    r.vbat = read_vbat();
    const bool changed = fc.update(s);
    r.state = (uint8_t)fc.state();
    r.baro_alt = fc.baro_alt();
    r.kf_alt = fc.kf().h();
    r.kf_vel = fc.kf().v();
    r.kf_acc = fc.kf().a();
    ++sample_n;

    switch (fc.state()) {
        case FlightState::PAD:
            prelaunch[prelaunch_n++ % PRELAUNCH_SAMPLES] = r;
            if (sample_n % PAD_LOG_DIVIDER == 0 && ring_push(r)) last_logged_t = r.t_ms;
            break;
        case FlightState::LANDED:
            if (changed) {
                landed_at = r.t_ms;
                cc::Beep b[cc::BeepEncoder::MAX_BEEPS];
                const float apo = fc.events().max_alt_m * (BEEP_APOGEE_FEET ? 3.28084f : 1.0f);
                play(b, cc::BeepEncoder::encode(apo, b));
                Serial.printf("LANDED. apogee %.1f m, max %.1f m/s, %.1f g, dropped %lu records\n",
                              fc.events().max_alt_m, fc.events().max_vel_mps, fc.events().max_acc_g,
                              (unsigned long)dropped.load());
            }
            if (r.t_ms - landed_at < POST_LANDING_MS) ring_push(r);
            else close_request.store(true);
            break;
        default:  // BOOST, COAST, APOGEE, DESCENT: full rate
            if (changed && fc.state() == FlightState::BOOST) {
                // write the last second before liftoff first, oldest to newest
                const uint32_t n = prelaunch_n < PRELAUNCH_SAMPLES ? prelaunch_n : PRELAUNCH_SAMPLES;
                for (uint32_t i = prelaunch_n - n; i < prelaunch_n; ++i) {
                    const LogRecord& p = prelaunch[i % PRELAUNCH_SAMPLES];
                    if (p.t_ms > last_logged_t) ring_push(p);
                }
                pattern_len = 0;  // silence the pad chirp
                noTone(PIN_BUZZER);
            }
            ring_push(r);
            digitalWrite(PIN_LED, (sample_n / 10) & 1);  // 5 Hz blink in flight
            break;
    }
#if TELEMETRY_ENABLED
    telemetry_task(r);
#endif
}

// ================================================================== core 1: SD writer
static File log_file;

void setup1() {
    SPI.setRX(PIN_SD_MISO);
    SPI.setTX(PIN_SD_MOSI);
    SPI.setSCK(PIN_SD_SCK);
    SPI.setCS(PIN_SD_CS);
    delay(50);  // let core 0 switch the sensor/SD rail on
    if (!SD.begin(PIN_SD_CS)) return;
    for (int i = 0; i < 1000; ++i) {  // LOG000.CSV, LOG001.CSV ... never overwrite a flight
        snprintf(log_name, sizeof(log_name), "LOG%03d.CSV", i);
        if (!SD.exists(log_name)) break;
    }
    log_file = SD.open(log_name, FILE_WRITE);
    if (!log_file) return;
    log_file.println("t_ms,state,baro_alt_m,kf_alt_m,kf_vel_mps,kf_acc_mps2,pressure_pa,temp_c,"
                 "ax_g,ay_g,az_g,gx_dps,gy_dps,gz_dps,vbat_v");
    log_file.flush();
    sd_ready.store(true);
}

void loop1() {
    static uint32_t last_flush = 0;
    if (!sd_ready.load() || file_closed.load()) {
        delay(50);
        return;
    }
    char line[192];
    uint32_t t = ring_tail.load(std::memory_order_relaxed);
    while (t != ring_head.load(std::memory_order_acquire)) {
        const LogRecord& r = ring[t % RING_RECORDS];
        const int n = snprintf(line, sizeof(line),
                               "%lu,%s,%.2f,%.2f,%.2f,%.2f,%.1f,%.2f,%.3f,%.3f,%.3f,%.1f,%.1f,%.1f,%.2f\n",
                               (unsigned long)r.t_ms, cc::state_name((FlightState)r.state), r.baro_alt, r.kf_alt,
                               r.kf_vel, r.kf_acc, r.pressure, r.temp, r.ax, r.ay, r.az, r.gx, r.gy, r.gz, r.vbat);
        log_file.write((const uint8_t*)line, (size_t)n);
        ring_tail.store(++t, std::memory_order_release);
    }
    if (millis() - last_flush > FLUSH_EVERY_MS) {  // bound the data lost if power fails
        log_file.flush();
        last_flush = millis();
    }
    if (close_request.load() && ring_tail.load() == ring_head.load()) {
        log_file.close();
        file_closed.store(true);
    }
    delay(2);
}
