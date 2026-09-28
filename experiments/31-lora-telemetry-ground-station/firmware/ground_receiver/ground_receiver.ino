// Cosmic Library LoRa ground receiver - Raspberry Pi Pico + RFM95W (SX1276), arduino-pico core.
// Prints one line per packet on USB serial (115200 baud) for ground_station.py:
//     RX,<rssi dBm>,<snr dB>,<hex payload>      a telemetry frame that passed the CRC
//     BAD,<rssi>,<snr>,<length>                 wrong length / magic / CRC
//     ID,<text>                                 station identification text (amateur operation)
//     # ...                                     comments
// Libraries: "LoRa" by Sandeep Mistry.  The headers in this folder are copies of ../common/
// (Arduino only compiles files inside the sketch folder); `make -C .. check` verifies they match.
// License: MIT
#include <Arduino.h>
#include <LoRa.h>
#include <SPI.h>

#include "radio_config.h"
#include "telemetry_packet.h"

static uint32_t good = 0, bad = 0;

void setup() {
    Serial.begin(115200);
    pinMode(PIN_LED, OUTPUT);
    const uint32_t t0 = millis();
    while (!Serial && millis() - t0 < 3000) delay(10);  // wait briefly for the USB serial port

    SPI1.setRX(PIN_RADIO_MISO);
    SPI1.setTX(PIN_RADIO_MOSI);
    SPI1.setSCK(PIN_RADIO_SCK);
    LoRa.setSPI(SPI1);
    LoRa.setPins(PIN_RADIO_CS, PIN_RADIO_RST, PIN_RADIO_DIO0);
    if (!LoRa.begin(RADIO_FREQ_HZ)) {
        for (;;) {
            Serial.println("# ERROR: SX1276 not found - check wiring");
            digitalWrite(PIN_LED, !digitalRead(PIN_LED));
            delay(500);
        }
    }
    LoRa.setSpreadingFactor(LORA_SF);
    LoRa.setSignalBandwidth(LORA_BW_HZ);
    LoRa.setCodingRate4(LORA_CR_DENOM);
    LoRa.enableCrc();
    Serial.printf("# CC ground receiver ready: %.3f MHz SF%d BW%ld kHz\n", RADIO_FREQ_HZ / 1e6, LORA_SF,
                  LORA_BW_HZ / 1000);
}

void loop() {
    const int n = LoRa.parsePacket();
    if (n <= 0) return;
    uint8_t buf[64];
    int len = 0;
    while (LoRa.available() && len < (int)sizeof(buf)) buf[len++] = (uint8_t)LoRa.read();
    const int rssi = LoRa.packetRssi();
    const float snr = LoRa.packetSnr();
    digitalWrite(PIN_LED, HIGH);
    if (len == CC_TLM_LEN && cc_tlm_valid(buf, (size_t)len)) {
        ++good;
        Serial.printf("RX,%d,%.1f,", rssi, snr);
        for (int i = 0; i < len; ++i) Serial.printf("%02X", buf[i]);
        Serial.println("");
    } else if (len > 3 && buf[0] == 'D' && buf[1] == 'E' && buf[2] == ' ') {
        buf[len < (int)sizeof(buf) ? len : (int)sizeof(buf) - 1] = 0;
        Serial.printf("ID,%s\n", (const char*)buf);
    } else {
        ++bad;
        Serial.printf("BAD,%d,%.1f,%d\n", rssi, snr, len);
    }
    digitalWrite(PIN_LED, LOW);
}
