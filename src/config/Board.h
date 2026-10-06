#ifndef KLIPPYFACE_BOARD_H
#define KLIPPYFACE_BOARD_H

#include <stdint.h>

// Per-board constants, selected by the build env (platformio.ini). Pins here are
// only fallbacks: a display's bus config from the server always wins.

#if defined(KLIPPYFACE_BOARD_WS_LCD169)
// Waveshare ESP32-S3-Touch-LCD-1.69: LCD on SPI, touch/IMU/RTC on I2C
static const char* const BOARD_NAME = "esp32s3-ws-lcd169";
static const int8_t DEFAULT_I2C_SDA = 11;
static const int8_t DEFAULT_I2C_SCL = 10;
static const int8_t DEFAULT_SPI_MOSI = 7;
static const int8_t DEFAULT_SPI_MISO = -1;
static const int8_t DEFAULT_SPI_SCLK = 6;
// SYS_EN: must be held high or the board powers off on battery once PWR is released
static const int8_t POWER_HOLD_PIN = 41;

#elif defined(KLIPPYFACE_BOARD_WS_LCD128)
// Waveshare ESP32-S3-LCD-1.28: LCD on SPI, IMU on I2C
static const char* const BOARD_NAME = "esp32s3-ws-lcd128";
static const int8_t DEFAULT_I2C_SDA = 6;
static const int8_t DEFAULT_I2C_SCL = 7;
static const int8_t DEFAULT_SPI_MOSI = 11;
static const int8_t DEFAULT_SPI_MISO = -1;
static const int8_t DEFAULT_SPI_SCLK = 10;
static const int8_t POWER_HOLD_PIN = -1;

#else
// Classic ESP32 dev board (VSPI and the Arduino default I2C pins)
static const char* const BOARD_NAME = "esp32dev";
static const int8_t DEFAULT_I2C_SDA = 21;
static const int8_t DEFAULT_I2C_SCL = 22;
static const int8_t DEFAULT_SPI_MOSI = 23;
static const int8_t DEFAULT_SPI_MISO = 19;
static const int8_t DEFAULT_SPI_SCLK = 18;
static const int8_t POWER_HOLD_PIN = -1;
#endif

// BOOT button on every supported board (factory reset on 3 s hold)
static const int8_t BOOT_BUTTON_PIN = 0;

#endif
