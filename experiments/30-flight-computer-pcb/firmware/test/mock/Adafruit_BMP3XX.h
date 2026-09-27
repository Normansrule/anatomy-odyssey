#pragma once
#include "Wire.h"
#define BMP3_NO_OVERSAMPLING 0
#define BMP3_OVERSAMPLING_2X 1
#define BMP3_OVERSAMPLING_4X 2
#define BMP3_IIR_FILTER_COEFF_3 2
#define BMP3_ODR_100_HZ 1
class Adafruit_BMP3XX {
public:
    bool begin_I2C(uint8_t, TwoWire*) { return true; }
    bool setTemperatureOversampling(uint8_t) { return true; }
    bool setPressureOversampling(uint8_t) { return true; }
    bool setIIRFilterCoeff(uint8_t) { return true; }
    bool setOutputDataRate(uint8_t) { return true; }
    bool performReading() { return true; }
    double temperature = 0, pressure = 0;
};
