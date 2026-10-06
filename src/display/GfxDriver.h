#ifndef KLIPPYFACE_GFX_DRIVER_H
#define KLIPPYFACE_GFX_DRIVER_H

#include <Arduino_GFX.h>
#include <ArduinoJson.h>

#include "DisplayDriver.h"

class Arduino_Canvas;

// Colour TFTs driven through Arduino_GFX: HX8347D on an 8-bit parallel bus,
// ST7789 and GC9A01 on SPI. SPI panels draw into a full-frame canvas (PSRAM
// when present) that show() pushes in one go; panels without room for one,
// and the HX8347D, draw straight to the panel.
class GfxDriver : public DisplayDriver {
public:
    enum class Panel : uint8_t { Hx8347, St7789, Gc9a01 };

    GfxDriver(Panel panel, int16_t width, int16_t height, const JsonObject& busConfig, uint8_t rotation);
    ~GfxDriver() override;

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
    Panel    _panel;
    // Arduino_GFX objects don't own each other, so the driver frees all three.
    Arduino_DataBus* _bus;
    Arduino_GFX*     _tft;     // the panel itself
    Arduino_Canvas*  _canvas;  // off-screen frame, or nullptr when drawing direct
    Arduino_GFX*     _gfx;     // where drawing goes: _canvas if present, else _tft

    int16_t  _width;
    int16_t  _height;
    uint8_t  _rotation;
    int8_t   _blPin;
    bool     _ips;
    String   _busType;
    int32_t  _freq;
    uint8_t  _colOffset1, _rowOffset1, _colOffset2, _rowOffset2;

    int8_t _dc, _cs, _wr, _rd, _rst;
    int8_t _d0, _d1, _d2, _d3, _d4, _d5, _d6, _d7;
    int8_t _mosi, _miso, _sclk;

    Arduino_DataBus* createBus();
    Arduino_GFX* createPanel();
    void setupCanvas();
};

#endif
