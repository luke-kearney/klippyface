#ifndef KLIPPYFACE_DISPLAY_DRIVER_H
#define KLIPPYFACE_DISPLAY_DRIVER_H

#include <Arduino.h>
#include <stdint.h>

class DisplayDriver {
public:
    virtual ~DisplayDriver() = default;

    // -- Lifecycle --------------------------------------------------------
    virtual bool init() = 0;
    virtual void powerSave(bool enable) = 0;

    // -- Info -------------------------------------------------------------
    virtual int16_t  width() const = 0;
    virtual int16_t  height() const = 0;
    virtual bool     isColor() const = 0;
    virtual uint8_t  bitDepth() const = 0;

    // -- Drawing ----------------------------------------------------------
    virtual void clear(uint32_t color = 0) = 0;
    virtual void drawPixel(int16_t x, int16_t y, uint32_t color) = 0;
    virtual void drawBitmap(int16_t x, int16_t y,
                            const uint8_t* data, size_t dataSize,
                            int16_t w, int16_t h,
                            uint32_t color) = 0;
    virtual void fillRect(int16_t x, int16_t y,
                          int16_t w, int16_t h,
                          uint32_t color) = 0;

    // -- Text -------------------------------------------------------------
    virtual void setCursor(int16_t x, int16_t y) = 0;
    virtual void setTextSize(uint8_t size) = 0;
    virtual void setTextColor(uint32_t color) = 0;
    virtual void print(const char* text) = 0;

    // -- Frame buffer -----------------------------------------------------
    virtual void show() = 0;
};

#endif
