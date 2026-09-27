// Host simulation of the barn-door drive: runs the firmware's stepping rule for 60 minutes at
// 100 us resolution and writes the pointing error (arcsec) once per second to stdout as CSV.
//   g++ -O2 -std=c++17 -I../barn_door_tracker sim_tracker.cpp -o sim_tracker && ./sim_tracker > sim.csv
#include <cstdio>
#include "tracker_core.h"

using namespace tracker;

template <typename real>
struct Drive {
    Geometry<real> g;
    bool corrected;
    int32_t pos = 0;
    void tick(double t) {
        if (pos < target_steps<real>((real)t, g, corrected)) ++pos;  // same rule as the sketch
    }
    double error_arcsec(double t) const {
        return ((double)angle_from_steps<real>(pos, g) - OMEGA * t) * 206264.806;
    }
};

int main() {
    const double spr = 64.0 * 63.68395;
    Drive<float> cf{{228.6f, 1.0f, (float)spr}, true};
    Drive<double> cd{{228.6, 1.0, spr}, true};
    Drive<double> un{{228.6, 1.0, spr}, false};
    std::printf("t_s,err_corrected_float_arcsec,err_corrected_double_arcsec,err_uncorrected_arcsec,steps\n");
    const long ticks = 3600L * 10000L;  // 100 us
    for (long k = 0; k <= ticks; ++k) {
        const double t = k * 1e-4;
        cf.tick(t);
        cd.tick(t);
        un.tick(t);
        if (k % 10000 == 0)
            std::printf("%.0f,%.3f,%.3f,%.3f,%d\n", t, cf.error_arcsec(t), cd.error_arcsec(t), un.error_arcsec(t), cd.pos);
    }
    return 0;
}
