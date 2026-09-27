#pragma once
#include "Arduino.h"
class SPIClassRP2040 {
public:
    bool setRX(int) { return true; }
    bool setTX(int) { return true; }
    bool setSCK(int) { return true; }
    bool setCS(int) { return true; }
};
typedef SPIClassRP2040 SPIClass;
extern SPIClassRP2040 SPI;
extern SPIClassRP2040 SPI1;
