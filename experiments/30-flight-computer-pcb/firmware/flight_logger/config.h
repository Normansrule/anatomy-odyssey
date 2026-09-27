// config.h - pins, rates and options for the CC-FL1 flight logger (Raspberry Pi Pico)
#pragma once

// ---------------- pins (see hardware/scripts/design.py for the full map)
#define PIN_GPS_TX_TO_GPS   0    // UART0 TX  -> GPS RX
#define PIN_GPS_RX_FROM_GPS 1    // UART0 RX  <- GPS TX
#define PIN_I2C_SDA         4    // I2C0
#define PIN_I2C_SCL         5
#define PIN_IMU_INT1        6
#define PIN_BARO_INT        7
#define PIN_SD_DET          8    // card-detect switch to GND (use INPUT_PULLUP): LOW = card present
#define PIN_RADIO_SCK       10   // SPI1
#define PIN_RADIO_MOSI      11
#define PIN_RADIO_MISO      12
#define PIN_RADIO_CS        13
#define PIN_LED             14
#define PIN_BUZZER          15   // drives Q1 -> piezo (and optional external beeper)
#define PIN_SD_MISO         16   // SPI0
#define PIN_SD_CS           17
#define PIN_SD_SCK          18
#define PIN_SD_MOSI         19
#define PIN_RADIO_DIO0      20
#define PIN_RADIO_RST       21
#define PIN_LDO_EN          22   // HIGH = sensor + SD rail on
#define PIN_VBAT_ADC        28   // VBAT_SW / 2

// ---------------- sensors
#define BMP390_I2C_ADDR     0x77 // SDO tied to VDDIO
#define LSM6DSO32_I2C_ADDR  0x6A // SA0 tied to GND
// Which accelerometer axis points to the nose, and its sign. Verify with the "pad test" in the
// README: stand the board nose-up, the log's ax/ay/az column on that axis must read about +1.00 g.
#define AXIAL_AXIS          0    // 0 = X, 1 = Y, 2 = Z
#define AXIAL_SIGN          (+1)

// ---------------- logging
#define SAMPLE_PERIOD_US    10000   // 100 Hz
#define PAD_LOG_DIVIDER     100     // on the pad log 1 sample in 100 (1 Hz) ...
#define PRELAUNCH_SAMPLES   100     // ... but keep the last 1 s in RAM and write it at liftoff
#define POST_LANDING_MS     10000   // keep logging this long after LANDED, then close the file
#define RING_RECORDS        512     // core0 -> core1 queue (5 s of flight data)
#define FLUSH_EVERY_MS      500

// ---------------- beeper
#define BEEP_FREQ_HZ        4000    // piezo resonance (Murata PKLCS1212E4001)
#define BEEP_APOGEE_FEET    0       // 1 = report apogee in feet (common at US launches), 0 = metres

// ---------------- telemetry (experiment 31). Requires the "LoRa" library by Sandeep Mistry.
// Regulatory: read experiment 31 before enabling. Default = Part 15 digital-modulation mode
// (500 kHz bandwidth, fixed channel). If you set a CALLSIGN you are operating as an amateur
// station under Part 97 and must follow its rules (station ID every 10 min, no encryption).
#ifndef TELEMETRY_ENABLED
#define TELEMETRY_ENABLED   0
#endif
#define RADIO_FREQ_HZ       915000000L
#define LORA_SF             9
#define LORA_BW_HZ          500000L
#define LORA_TX_DBM         14
#define TELEMETRY_PERIOD_MS 250     // 4 Hz in flight
#define BEACON_PERIOD_MS    2000    // after landing
#define CALLSIGN            ""      // e.g. "N0CALL" when operating under an amateur licence
