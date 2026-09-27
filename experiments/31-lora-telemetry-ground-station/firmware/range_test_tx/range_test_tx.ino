// Cosmic Codex LoRa range-test beacon - Raspberry Pi Pico + RFM95W, arduino-pico core.
// Sends one telemetry frame per second (state PAD, a counter, battery voltage) so you can walk away
// from the ground station and measure RSSI, SNR and packet loss versus distance.
// Libraries: "LoRa" by Sandeep Mistry. License: MIT
#include <Arduino.h>
#include <LoRa.h>
#include <SPI.h>

#include "radio_config.h"
#include "telemetry_packet.h"

static uint16_t seq = 0;
static uint32_t last_id = 0;

void setup() {
    Serial.begin(115200);
    pinMode(PIN_LED, OUTPUT);
    SPI1.setRX(PIN_RADIO_MISO);
    SPI1.setTX(PIN_RADIO_MOSI);
    SPI1.setSCK(PIN_RADIO_SCK);
    LoRa.setSPI(SPI1);
    LoRa.setPins(PIN_RADIO_CS, PIN_RADIO_RST, PIN_RADIO_DIO0);
    while (!LoRa.begin(RADIO_FREQ_HZ)) {
        Serial.println("SX1276 not found");
        delay(1000);
    }
    LoRa.setSpreadingFactor(LORA_SF);
    LoRa.setSignalBandwidth(LORA_BW_HZ);
    LoRa.setCodingRate4(LORA_CR_DENOM);
    LoRa.setTxPower(LORA_TX_DBM);
    LoRa.enableCrc();
}

void loop() {
    cc_tlm_t p;
    memset(&p, 0, sizeof(p));
    p.state = 0;  // PAD
    p.seq = seq++;
    p.t_ms = millis();
    p.vbat_mv = 3300;
    p.flags = 0;
    cc_tlm_seal(&p);
    digitalWrite(PIN_LED, HIGH);
    LoRa.beginPacket();
    LoRa.write((const uint8_t*)&p, CC_TLM_LEN);
    LoRa.endPacket();  // blocking: ~62 ms at SF9 / 500 kHz
    digitalWrite(PIN_LED, LOW);
    if (sizeof(CALLSIGN) > 1 && millis() - last_id > 9UL * 60UL * 1000UL) {  // Part 97 station ID
        last_id = millis();
        LoRa.beginPacket();
        LoRa.print("DE ");
        LoRa.print(CALLSIGN);
        LoRa.endPacket();
    }
    delay(1000);
}
