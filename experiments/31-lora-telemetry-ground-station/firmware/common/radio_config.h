// radio_config.h - shared by the ground receiver and the range-test transmitter.
// MUST match experiments/30-flight-computer-pcb/firmware/flight_logger/config.h.
#pragma once

// Raspberry Pi Pico + RFM95W breakout wired exactly like the CC-FL1's J5 header:
#define PIN_RADIO_SCK   10   // SPI1
#define PIN_RADIO_MOSI  11
#define PIN_RADIO_MISO  12
#define PIN_RADIO_CS    13
#define PIN_RADIO_DIO0  20   // "G0" on the Adafruit breakout
#define PIN_RADIO_RST   21
#define PIN_LED         25   // the Pico's on-board LED

// Part 15 digital-modulation (DTS) settings: 500 kHz bandwidth on a fixed channel. See README.
#define RADIO_FREQ_HZ   915000000L
#define LORA_SF         9
#define LORA_BW_HZ      500000L
#define LORA_CR_DENOM   5          // coding rate 4/5
#define LORA_TX_DBM     14
#define CALLSIGN        ""         // set e.g. "N0CALL" ONLY when operating as an amateur station (Part 97)
