#ifndef KLIPPYFACE_SH1106_DRIVER_H
#define KLIPPYFACE_SH1106_DRIVER_H

#include "DisplayDriver.h"
#include <Adafruit_SH110X.h>

class Sh1106Driver : public DisplayDriver {
public:
    Sh1106Driver(int16_t width, int16_t height, uint8_t i2cAddr, uint8_t rotation = 0);
    ~Sh1106Driver() override;

    bool init() override;
    void powerSave(bool enable) override;

    int16_t  width() const override;
    int16_t  height() const override;
    bool     isColor() const override;
    uint8_t  bitDepth() const override;

    void clear(uint32_t color = 0) override;
    void drawPixel(int16_t x, int16_t y, uint32_t color) override;
    void drawBitmap(int16_t x, int16_t y,
                    const uint8_t* data,
                    int16_t w, int16_t h,
                    uint32_t color) override;
    void fillRect(int16_t x, int16_t y,
                  int16_t w, int16_t h,
                  uint32_t color) override;

    void setCursor(int16_t x, int16_t y) override;
    void setTextSize(uint8_t size) override;
    void setTextColor(uint32_t color) override;
    void print(const char* text) override;

    void show() override;

private:
    Adafruit_SH1106G* _display;
    int16_t  _width;
    int16_t  _height;
    uint8_t  _i2cAddr;
    uint8_t  _rotation;
};

#endif
