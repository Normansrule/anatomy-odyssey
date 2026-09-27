#pragma once
#include "Arduino.h"
#define FILE_WRITE 1
class File : public Print {
public:
    explicit operator bool() const { return true; }
    void flush() {}
    void close() {}
};
class SDClass {
public:
    bool begin(int) { return true; }
    bool exists(const char*) { return false; }
    File open(const char*, int) { return File(); }
};
extern SDClass SD;
