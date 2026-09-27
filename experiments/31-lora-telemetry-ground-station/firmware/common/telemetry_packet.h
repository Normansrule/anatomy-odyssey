// telemetry_packet.h - Cosmic Codex telemetry frame v1 (34 bytes, little-endian)
// ---------------------------------------------------------------------------------
// Shared by the flight logger (experiment 30) and the LoRa ground station (experiment 31).
// The canonical copy lives in experiments/31-lora-telemetry-ground-station/firmware/common/;
// experiment 31's `make check-sync` verifies this copy is identical.
//
//  off size field        unit / meaning
//   0   2  magic         'C','C'
//   2   1  version       1
//   3   1  state         0 PAD 1 BOOST 2 COAST 3 APOGEE 4 DESCENT 5 LANDED
//   4   2  seq           packet counter (wraps)
//   6   4  t_ms          ms since power-up
//  10   4  alt_dm        Kalman altitude above pad, decimetres
//  14   2  vel_dms       Kalman vertical velocity, decimetres/s
//  16   2  acc_cg        |acceleration|, centi-g
//  18   4  lat_e7        GPS latitude, degrees * 1e7 (0 = no fix)
//  22   4  lon_e7        GPS longitude, degrees * 1e7
//  26   2  max_alt_m     highest altitude so far, metres
//  28   2  vbat_mv       battery, millivolts
//  30   1  sats          GPS satellites used
//  31   1  flags         bit0 GPS fix, bit1 SD logging, bit2 baro ok, bit3 IMU ok
//  32   2  crc16         CRC-16/CCITT-FALSE of bytes 0..31
// License: MIT
#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

#define CC_TLM_VERSION 1
#define CC_TLM_LEN 34

#pragma pack(push, 1)
typedef struct {
    uint8_t magic[2];
    uint8_t version;
    uint8_t state;
    uint16_t seq;
    uint32_t t_ms;
    int32_t alt_dm;
    int16_t vel_dms;
    int16_t acc_cg;
    int32_t lat_e7;
    int32_t lon_e7;
    uint16_t max_alt_m;
    uint16_t vbat_mv;
    uint8_t sats;
    uint8_t flags;
    uint16_t crc16;
} cc_tlm_t;
#pragma pack(pop)

#ifdef __cplusplus
static_assert(sizeof(cc_tlm_t) == CC_TLM_LEN, "telemetry frame must be 34 bytes");
#endif

// CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, no reflection, no final XOR. check("123456789") = 0x29B1
static inline uint16_t cc_crc16(const uint8_t* data, size_t len) {
    uint16_t crc = 0xFFFF;
    for (size_t i = 0; i < len; ++i) {
        crc ^= (uint16_t)data[i] << 8;
        for (int b = 0; b < 8; ++b) crc = (crc & 0x8000) ? (uint16_t)((crc << 1) ^ 0x1021) : (uint16_t)(crc << 1);
    }
    return crc;
}

static inline void cc_tlm_seal(cc_tlm_t* p) {
    p->magic[0] = 'C';
    p->magic[1] = 'C';
    p->version = CC_TLM_VERSION;
    p->crc16 = cc_crc16((const uint8_t*)p, CC_TLM_LEN - 2);
}

static inline int cc_tlm_valid(const uint8_t* buf, size_t len) {
    if (len != CC_TLM_LEN || buf[0] != 'C' || buf[1] != 'C' || buf[2] != CC_TLM_VERSION) return 0;
    uint16_t crc;
    memcpy(&crc, buf + CC_TLM_LEN - 2, 2);
    return crc == cc_crc16(buf, CC_TLM_LEN - 2);
}
