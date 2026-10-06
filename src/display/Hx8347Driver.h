#ifndef KLIPPYFACE_HX8347_DRIVER_H
#define KLIPPYFACE_HX8347_DRIVER_H

#include "DisplayDriver.h"
#include <Arduino_GFX.h>
#include <ArduinoJson.h>

class Hx8347Driver : public DisplayDriver {
public:
    Hx8347Driver(int16_t width, int16_t height, const JsonObject& busConfig, uint8_t rotation);
    ~Hx8347Driver() override;

    bool init() override;
    void powerSave(bool enable) override;

    int16_t  width() const override;
    int16_t  height() const override;
    bool     isColor() const override;
    uint8_t  bitDepth() const override;

    void clear(uint32_t color = 0) override;
    void drawPixel(int16_t x, int16_t y, uint32_t color) override;
    void drawBitmap(int16_t x, int16_t y,
                    const uint8_t* data, size_t dataSize,
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

    static uint16_t rgb888to565(uint32_t rgb);

private:
    Arduino_GFX* _gfx;
    // Arduino_GFX doesn't own its bus, so the driver frees it.
    Arduino_DataBus* _bus;
    int16_t  _width;
    int16_t  _height;
    uint8_t  _rotation;
    int8_t   _blPin;
    bool     _ips;
    String   _busType;

    int8_t _dc;
    int8_t _cs;
    int8_t _wr;
    int8_t _rd;
    int8_t _rst;
    int8_t _d0, _d1, _d2, _d3, _d4, _d5, _d6, _d7;
    int8_t _mosi, _miso, _sclk;
};

#endif
