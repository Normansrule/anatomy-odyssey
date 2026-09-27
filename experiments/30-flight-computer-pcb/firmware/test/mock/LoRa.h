#pragma once
#include "SPI.h"
class LoRaClass : public Print {
public:
    void setSPI(SPIClass&) {}
    void setPins(int, int, int) {}
    int begin(long) { return 1; }
    void setSpreadingFactor(int) {}
    void setSignalBandwidth(long) {}
    void setCodingRate4(int) {}
    void setTxPower(int) {}
    void enableCrc() {}
    int beginPacket() { return 1; }
    int endPacket(bool = false) { return 1; }
    int parsePacket() { return 0; }
    int available() { return 0; }
    int read() { return -1; }
    int packetRssi() { return 0; }
    float packetSnr() { return 0; }
};
extern LoRaClass LoRa;
