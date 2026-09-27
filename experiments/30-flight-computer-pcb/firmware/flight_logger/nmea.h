// nmea.h - tiny GGA sentence parser (position, fix, satellites) for the optional GPS header.
// Feed it characters one at a time; poll fix()/lat_e7()/lon_e7(). Portable C++ (host-testable).
// License: MIT
#pragma once
#include <cstdint>
#include <cstdlib>
#include <cstring>

namespace cc {

class NmeaGga {
public:
    // Returns true when a complete, checksum-valid GGA sentence has just been parsed.
    bool feed(char c) {
        if (c == '$') { n_ = 0; }
        if (n_ < sizeof(buf_) - 1) buf_[n_++] = c;
        if (c != '\n') return false;
        buf_[n_] = 0;
        const bool ok = parse(buf_);
        n_ = 0;
        return ok;
    }
    bool fix() const { return fix_; }
    int32_t lat_e7() const { return lat_e7_; }
    int32_t lon_e7() const { return lon_e7_; }
    uint8_t sats() const { return sats_; }
    float alt_msl() const { return alt_; }

    // "ddmm.mmmm" + hemisphere -> degrees * 1e7
    static int32_t to_e7(const char* f, char hemi, int deg_digits) {
        if (!f || !*f) return 0;
        char d[4] = {0};
        std::memcpy(d, f, deg_digits);
        const double deg = std::atoi(d) + std::atof(f + deg_digits) / 60.0;
        const double v = (hemi == 'S' || hemi == 'W') ? -deg : deg;
        return static_cast<int32_t>(v * 1e7 + (v >= 0 ? 0.5 : -0.5));
    }

private:
    static int hexval(char c) { return (c >= '0' && c <= '9') ? c - '0' : (c >= 'A' && c <= 'F') ? c - 'A' + 10 : -1; }

    bool parse(char* s) {
        // checksum: XOR of chars between '$' and '*'
        char* star = std::strchr(s, '*');
        if (s[0] != '$' || !star || hexval(star[1]) < 0 || hexval(star[2]) < 0) return false;
        uint8_t x = 0;
        for (char* p = s + 1; p < star; ++p) x ^= static_cast<uint8_t>(*p);
        if (x != hexval(star[1]) * 16 + hexval(star[2])) return false;
        if (std::strncmp(s + 3, "GGA", 3) != 0) return false;
        *star = 0;
        // split on commas (empty fields preserved)
        char* f[16] = {nullptr};
        int nf = 0;
        char* p = s;
        f[nf++] = p;
        while (*p && nf < 16) {
            if (*p == ',') { *p = 0; f[nf++] = p + 1; }
            ++p;
        }
        if (nf < 10) return false;
        const int quality = std::atoi(f[6]);
        fix_ = quality > 0;
        sats_ = static_cast<uint8_t>(std::atoi(f[7]));
        if (fix_) {
            lat_e7_ = to_e7(f[2], f[3][0], 2);
            lon_e7_ = to_e7(f[4], f[5][0], 3);
            alt_ = static_cast<float>(std::atof(f[9]));
        }
        return true;
    }

    char buf_[100] = {0};
    std::size_t n_ = 0;
    bool fix_ = false;
    int32_t lat_e7_ = 0, lon_e7_ = 0;
    uint8_t sats_ = 0;
    float alt_ = 0.0f;
};

}  // namespace cc
