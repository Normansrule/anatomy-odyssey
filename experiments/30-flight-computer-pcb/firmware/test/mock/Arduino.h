// Minimal mock of the Arduino / arduino-pico API used by flight_logger.ino.
// Only declarations with the real signatures - enough for `g++ -fsyntax-only`.
// It proves the sketch is well-formed C++; it does not emulate hardware.
#pragma once
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>

#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT 0
#define INPUT_PULLUP 2

inline void pinMode(int, int) {}
inline void digitalWrite(int, int) {}
inline int digitalRead(int) { return 0; }
inline int analogRead(int) { return 0; }
inline void analogReadResolution(int) {}
inline unsigned long millis() { return 0; }
inline unsigned long micros() { return 0; }
inline void delay(unsigned long) {}
inline void tone(int, unsigned int) {}
inline void noTone(int) {}
template <class T, class L, class H>
inline T constrain(T x, L lo, H hi) { return x < lo ? lo : (x > hi ? hi : x); }

#define F(x) (x)
class Print {
public:
    size_t print(const char*) { return 0; }
    size_t print(double, int = 2) { return 0; }
    size_t print(long, int = 10) { return 0; }
    size_t println(const char*) { return 0; }
    size_t println() { return 0; }
    size_t write(const uint8_t*, size_t n) { return n; }
    int printf(const char*, ...) __attribute__((format(printf, 2, 3))) { return 0; }
};

class SerialUSB_ : public Print {
public:
    void begin(unsigned long) {}
    explicit operator bool() const { return true; }
};
class SerialUART_ : public Print {
public:
    void begin(unsigned long) {}
    bool setTX(int) { return true; }
    bool setRX(int) { return true; }
    int available() { return 0; }
    int read() { return -1; }
};
extern SerialUSB_ Serial;
extern SerialUART_ Serial1;
