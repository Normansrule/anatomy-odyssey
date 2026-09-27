#pragma once
#include "Wire.h"
#include "Adafruit_Sensor.h"
enum lsm6dso32_accel_range_t { LSM6DSO32_ACCEL_RANGE_4_G, LSM6DSO32_ACCEL_RANGE_32_G };
enum lsm6ds_gyro_range_t { LSM6DS_GYRO_RANGE_2000_DPS };
enum lsm6ds_data_rate_t { LSM6DS_RATE_416_HZ };
class Adafruit_LSM6DSO32 {
public:
    bool begin_I2C(uint8_t, TwoWire*) { return true; }
    void setAccelRange(lsm6dso32_accel_range_t) {}
    void setGyroRange(lsm6ds_gyro_range_t) {}
    void setAccelDataRate(lsm6ds_data_rate_t) {}
    void setGyroDataRate(lsm6ds_data_rate_t) {}
    bool getEvent(sensors_event_t*, sensors_event_t*, sensors_event_t*) { return true; }
};
