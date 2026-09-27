#pragma once
#include "Arduino.h"
class TwoWire {
public:
    bool setSDA(int) { return true; }
    bool setSCL(int) { return true; }
    void begin() {}
    void setClock(unsigned long) {}
};
extern TwoWire Wire;
