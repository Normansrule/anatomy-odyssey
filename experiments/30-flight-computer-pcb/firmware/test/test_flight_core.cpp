// Host-side test harness for flight_core (the exact code that runs on the RP2040).
//
//   make -C firmware/test          # builds, generates synthetic flights, runs every scenario
//
// 1. unit tests: ISA altitude, beep encoder, Kalman convergence
// 2. replay: feeds a synthetic sensor CSV (tools/synth_flight.py) through FlightComputer
//    at 100 Hz, writes a log in the same CSV format as the real logger, and checks the
//    detected events against the simulator's ground truth (<file>.truth.json).
// License: MIT
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

#include "../flight_logger/flight_core.h"
#include "../flight_logger/nmea.h"
#include "../flight_logger/telemetry_packet.h"

using namespace cc;

static int failures = 0;
#define CHECK(cond, ...)                                  \
    do {                                                  \
        if (!(cond)) {                                    \
            std::printf("  FAIL %s:%d  ", __FILE__, __LINE__); \
            std::printf(__VA_ARGS__);                     \
            std::printf("\n");                            \
            ++failures;                                   \
        }                                                 \
    } while (0)

// ------------------------------------------------------------------ unit tests
static void unit_tests() {
    std::printf("unit tests\n");
    CHECK(std::fabs(pressure_to_altitude(101325.0f, 101325.0f)) < 1e-3f, "zero altitude at reference");
    // ISA: 1000 m -> 89874.6 Pa, 3000 m -> 70108.5 Pa
    CHECK(std::fabs(pressure_to_altitude(89874.6f, 101325.0f) - 1000.0f) < 1.0f, "1000 m, got %.2f",
          pressure_to_altitude(89874.6f, 101325.0f));
    CHECK(std::fabs(pressure_to_altitude(70108.5f, 101325.0f) - 3000.0f) < 2.0f, "3000 m, got %.2f",
          pressure_to_altitude(70108.5f, 101325.0f));

    Beep b[BeepEncoder::MAX_BEEPS];
    std::size_t n = BeepEncoder::encode(1234.4f, b);
    CHECK(n == 10, "1234 -> 10 beeps, got %zu", n);
    CHECK(b[0].off_ms == BeepEncoder::DIGIT_GAP, "digit gap after the single beep of '1'");
    CHECK(b[n - 1].off_ms == BeepEncoder::END_GAP, "end gap");
    n = BeepEncoder::encode(305.0f, b);
    CHECK(n == 3 + 1 + 5, "305 -> 9 beeps, got %zu", n);
    CHECK(b[3].on_ms == BeepEncoder::LONG_ON, "zero digit is one long beep");
    n = BeepEncoder::encode(-4.0f, b);
    CHECK(n == 1 && b[0].on_ms == BeepEncoder::LONG_ON, "negative -> 0 -> one long beep");

    // Kalman: a stationary sensor with noise converges to the true altitude, velocity ~0
    AltitudeKalman kf;
    kf.reset(0.0f);
    std::srand(3);
    for (int i = 0; i < 1000; ++i) {
        kf.predict(0.01f);
        float noise = ((std::rand() % 2001) - 1000) / 1000.0f * 0.8f;
        kf.update_baro(50.0f + noise);
        kf.update_accel(0.0f);
    }
    CHECK(std::fabs(kf.h() - 50.0f) < 0.5f, "KF altitude %.2f", kf.h());
    CHECK(std::fabs(kf.v()) < 0.5f, "KF velocity %.2f", kf.v());

    // NMEA GGA (the classic example sentence, checksum 0x47)
    NmeaGga gps;
    const char* gga = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47\r\n";
    bool got = false;
    for (const char* c = gga; *c; ++c) got |= gps.feed(*c);
    CHECK(got && gps.fix(), "GGA parsed with fix");
    CHECK(gps.lat_e7() == 481173000, "lat_e7 %d", gps.lat_e7());
    CHECK(gps.lon_e7() == 115166667, "lon_e7 %d", gps.lon_e7());
    CHECK(gps.sats() == 8, "sats %d", gps.sats());
    const char* bad = "$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*48\r\n";
    got = false;
    for (const char* c = bad; *c; ++c) got |= gps.feed(*c);
    CHECK(!got, "bad checksum rejected");

    // telemetry frame: CRC check value and round trip
    CHECK(cc_crc16(reinterpret_cast<const uint8_t*>("123456789"), 9) == 0x29B1, "CRC-16/CCITT-FALSE check value");
    cc_tlm_t p;
    std::memset(&p, 0, sizeof(p));
    p.alt_dm = 11355;
    p.state = 2;
    cc_tlm_seal(&p);
    CHECK(cc_tlm_valid(reinterpret_cast<const uint8_t*>(&p), CC_TLM_LEN), "sealed frame validates");
    reinterpret_cast<uint8_t*>(&p)[12] ^= 0x01;
    CHECK(!cc_tlm_valid(reinterpret_cast<const uint8_t*>(&p), CC_TLM_LEN), "corrupted frame rejected");
}

// ------------------------------------------------------------------ replay
struct Row {
    uint32_t t_ms;
    float p, temp, ax, ay, az, gx, gy, gz, true_alt;
};

static std::vector<Row> read_csv(const std::string& path) {
    std::ifstream f(path);
    if (!f) {
        std::fprintf(stderr, "cannot open %s\n", path.c_str());
        std::exit(2);
    }
    std::string line;
    std::getline(f, line);  // header
    std::vector<Row> rows;
    while (std::getline(f, line)) {
        Row r{};
        double v[12];
        std::stringstream ss(line);
        std::string cell;
        int i = 0;
        while (std::getline(ss, cell, ',') && i < 12) v[i++] = std::atof(cell.c_str());
        if (i < 10) continue;
        r.t_ms = static_cast<uint32_t>(v[0]);
        r.p = v[1]; r.temp = v[2]; r.ax = v[3]; r.ay = v[4]; r.az = v[5];
        r.gx = v[6]; r.gy = v[7]; r.gz = v[8]; r.true_alt = v[9];
        rows.push_back(r);
    }
    return rows;
}

static double json_number(const std::string& text, const std::string& key) {
    auto k = text.find("\"" + key + "\"");
    if (k == std::string::npos) return NAN;
    auto c = text.find(':', k);
    return std::atof(text.c_str() + c + 1);
}

static bool replay(const std::string& csv, const std::string& out_log) {
    std::ifstream tj(csv.substr(0, csv.size() - 4) + ".truth.json");
    std::stringstream buf;
    buf << tj.rdbuf();
    const std::string truth = buf.str();
    const double t_launch = json_number(truth, "launch_s"), t_burn = json_number(truth, "burnout_s"),
                 t_apo = json_number(truth, "apogee_s"), h_apo = json_number(truth, "apogee_m"),
                 t_land = json_number(truth, "landed_s");

    auto rows = read_csv(csv);
    FlightComputer fc;
    FILE* log = std::fopen(out_log.c_str(), "w");
    std::fprintf(log, "t_ms,state,baro_alt_m,kf_alt_m,kf_vel_mps,kf_acc_mps2,pressure_pa,temp_c,"
                      "ax_g,ay_g,az_g,gx_dps,gy_dps,gz_dps,vbat_v\n");
    // like the firmware: average the first second on the pad for the ground reference
    double psum = 0;
    const std::size_t ncal = 100;
    for (std::size_t i = 0; i < ncal && i < rows.size(); ++i) psum += rows[i].p;
    fc.calibrate(static_cast<float>(psum / ncal), rows[ncal - 1].t_ms);

    std::printf("replay %s\n", csv.c_str());
    for (std::size_t i = ncal; i < rows.size(); ++i) {
        const Row& r = rows[i];
        Sample s;
        s.t_ms = r.t_ms;
        s.pressure_pa = r.p;
        s.temp_c = r.temp;
        s.acc_axial_g = r.ax;
        s.acc_mag_g = std::sqrt(r.ax * r.ax + r.ay * r.ay + r.az * r.az);
        if (fc.update(s))
            std::printf("  %8.3f s  -> %-8s kf_alt %7.1f m  kf_vel %6.1f m/s\n", r.t_ms / 1000.0,
                        state_name(fc.state()), fc.kf().h(), fc.kf().v());
        std::fprintf(log, "%u,%s,%.2f,%.2f,%.2f,%.2f,%.1f,%.2f,%.3f,%.3f,%.3f,%.1f,%.1f,%.1f,%.2f\n", r.t_ms,
                     state_name(fc.state()), fc.baro_alt(), fc.kf().h(), fc.kf().v(), fc.kf().a(), r.p, r.temp,
                     r.ax, r.ay, r.az, r.gx, r.gy, r.gz, 3.9);
    }
    std::fclose(log);

    const FlightEvents& e = fc.events();
    const int before = failures;
    std::printf("  truth:    launch %.2f  burnout %.2f  apogee %.2f s @ %.1f m  landed %.2f\n", t_launch, t_burn,
                t_apo, h_apo, t_land);
    std::printf("  detected: launch %.2f  burnout %.2f  apogee %.2f s @ %.1f m  landed %.2f  (max %.1f m/s, %.1f g)\n",
                e.launch_ms / 1e3, e.burnout_ms / 1e3, e.apogee_ms / 1e3, e.max_alt_m, e.landed_ms / 1e3,
                e.max_vel_mps, e.max_acc_g);
    CHECK(fc.state() == FlightState::LANDED, "ended in %s, expected LANDED", state_name(fc.state()));
    CHECK(std::fabs(e.launch_ms / 1e3 - t_launch) < 0.15, "launch time error %.3f s", e.launch_ms / 1e3 - t_launch);
    CHECK(std::fabs(e.burnout_ms / 1e3 - t_burn) < 0.35, "burnout time error %.3f s", e.burnout_ms / 1e3 - t_burn);
    CHECK(e.apogee_ms / 1e3 - t_apo > -0.2 && e.apogee_ms / 1e3 - t_apo < 1.0, "apogee detected %.3f s from truth",
          e.apogee_ms / 1e3 - t_apo);
    CHECK(std::fabs(e.max_alt_m - h_apo) < 0.01 * h_apo + 3.0, "apogee altitude error %.2f m", e.max_alt_m - h_apo);
    CHECK(e.landed_ms / 1e3 > t_land && e.landed_ms / 1e3 - t_land < 10.0, "landing detected %.2f s after touchdown",
          e.landed_ms / 1e3 - t_land);
    std::printf("  %s\n", failures == before ? "PASS" : "FAIL");
    return failures == before;
}

int main(int argc, char** argv) {
    unit_tests();
    for (int i = 1; i + 1 < argc; i += 2) replay(argv[i], argv[i + 1]);
    std::printf("%s (%d failure%s)\n", failures ? "TESTS FAILED" : "ALL TESTS PASSED", failures,
                failures == 1 ? "" : "s");
    return failures ? 1 : 0;
}
