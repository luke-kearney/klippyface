#include "GfxDriver.h"

#include <canvas/Arduino_Canvas.h>
#include <databus/Arduino_ESP32PAR8.h>
#include <databus/Arduino_ESP32SPI.h>
#include <display/Arduino_GC9A01.h>
#include <display/Arduino_HX8347D.h>
#include <display/Arduino_ST7789.h>

static const char* TAG = "GFX";

// Heap left free after a canvas when it has to come from internal RAM
static const size_t CANVAS_HEAP_MARGIN = 48 * 1024;

static const char* panelName(GfxDriver::Panel panel) {
    switch (panel) {
        case GfxDriver::Panel::Hx8347: return "hx8347";
        case GfxDriver::Panel::St7789: return "st7789";
        case GfxDriver::Panel::Gc9a01: return "gc9a01";
    }
    return "?";
}

static int8_t parsePin(const JsonObject& obj, const char* key) {
    if (!obj[key].is<int>()) return -1;
    return (int8_t)obj[key].as<int>();
}

static uint8_t parseOffset(const JsonObject& obj, const char* key, uint8_t fallback) {
    return obj[key].is<int>() ? (uint8_t)obj[key].as<int>() : fallback;
}

uint16_t GfxDriver::rgb888to565(uint32_t rgb) {
    uint8_t r = (rgb >> 16) & 0xFF;
    uint8_t g = (rgb >> 8) & 0xFF;
    uint8_t b = rgb & 0xFF;
    return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

GfxDriver::GfxDriver(Panel panel, int16_t width, int16_t height, const JsonObject& busConfig, uint8_t rotation)
    : _panel(panel)
    , _bus(nullptr)
    , _tft(nullptr)
    , _canvas(nullptr)
    , _gfx(nullptr)
    , _width(width)
    , _height(height)
    , _rotation(rotation)
    , _blPin(-1)
    // IPS is the norm for the SPI panels we support; the HX8347D shields are TN
    , _ips(panel != Panel::Hx8347)
    , _busType(panel == Panel::Hx8347 ? "parallel8" : "spi")
    , _freq(GFX_NOT_DEFINED)
    , _dc(-1), _cs(-1), _wr(-1), _rd(-1), _rst(-1)
    , _d0(-1), _d1(-1), _d2(-1), _d3(-1), _d4(-1), _d5(-1), _d6(-1), _d7(-1)
    , _mosi(-1), _miso(-1), _sclk(-1)
{
    if (busConfig["type"].is<const char*>()) {
        _busType = busConfig["type"].as<const char*>();
    }

    _dc   = parsePin(busConfig, "dc");
    _cs   = parsePin(busConfig, "cs");
    _wr   = parsePin(busConfig, "wr");
    _rd   = parsePin(busConfig, "rd");
    _rst  = parsePin(busConfig, "rst");
    _d0   = parsePin(busConfig, "d0");
    _d1   = parsePin(busConfig, "d1");
    _d2   = parsePin(busConfig, "d2");
    _d3   = parsePin(busConfig, "d3");
    _d4   = parsePin(busConfig, "d4");
    _d5   = parsePin(busConfig, "d5");
    _d6   = parsePin(busConfig, "d6");
    _d7   = parsePin(busConfig, "d7");

    _mosi  = parsePin(busConfig, "mosi");
    _miso  = parsePin(busConfig, "miso");
    _sclk  = parsePin(busConfig, "sclk");

    _blPin = parsePin(busConfig, "bl");

    if (busConfig["ips"].is<bool>()) {
        _ips = busConfig["ips"].as<bool>();
    }
    if (busConfig["freq"].is<int>()) {
        _freq = busConfig["freq"].as<int>();
    }

    // Panels smaller than the controller's RAM (e.g. 240x280 on a 240x320
    // ST7789) need offsets; *_offset2 apply in the flipped rotations and
    // default to the same values.
    _colOffset1 = parseOffset(busConfig, "col_offset", 0);
    _rowOffset1 = parseOffset(busConfig, "row_offset", 0);
    _colOffset2 = parseOffset(busConfig, "col_offset2", _colOffset1);
    _rowOffset2 = parseOffset(busConfig, "row_offset2", _rowOffset1);
}

GfxDriver::~GfxDriver() {
    delete _canvas;
    delete _tft;
    delete _bus;
}

Arduino_DataBus* GfxDriver::createBus() {
    if (_busType == "parallel8") {
        return new Arduino_ESP32PAR8(_dc, _cs, _wr, _rd, _d0, _d1, _d2, _d3, _d4, _d5, _d6, _d7);
    }
    if (_busType == "spi") {
        if (_sclk < 0 || _mosi < 0 || _dc < 0) {
            Serial.printf("[%s] SPI bus needs sclk, mosi and dc pins\n", TAG);
            return nullptr;
        }
        return new Arduino_ESP32SPI(_dc, _cs, _sclk, _mosi, _miso);
    }
    Serial.printf("[%s] Unknown bus type: %s\n", TAG, _busType.c_str());
    return nullptr;
}

Arduino_GFX* GfxDriver::createPanel() {
    switch (_panel) {
        case Panel::Hx8347:
            // Uses the controller's native 240x320; rotation sets the orientation
            return new Arduino_HX8347D(_bus, _rst, _rotation, _ips);
        case Panel::St7789:
            return new Arduino_ST7789(_bus, _rst, _rotation, _ips, _width, _height,
                                      _colOffset1, _rowOffset1, _colOffset2, _rowOffset2);
        case Panel::Gc9a01:
            return new Arduino_GC9A01(_bus, _rst, _rotation, _ips, _width, _height,
                                      _colOffset1, _rowOffset1, _colOffset2, _rowOffset2);
    }
    return nullptr;
}

// One full frame of RGB565. PSRAM if the board has it; otherwise only if
// internal RAM can spare it, else keep drawing straight to the panel.
void GfxDriver::setupCanvas() {
    if (_panel == Panel::Hx8347) return;

    int16_t w = _tft->width();
    int16_t h = _tft->height();
    size_t bytes = (size_t)w * h * 2;
    if (!psramFound() && heap_caps_get_largest_free_block(MALLOC_CAP_8BIT) < bytes + CANVAS_HEAP_MARGIN) {
        Serial.printf("[%s] No room for a %u byte canvas — drawing direct\n", TAG, (unsigned)bytes);
        return;
    }

    _canvas = new Arduino_Canvas(w, h, _tft);
    if (!_canvas->begin(GFX_SKIP_OUTPUT_BEGIN)) {
        Serial.printf("[%s] Canvas allocation failed — drawing direct\n", TAG);
        delete _canvas;
        _canvas = nullptr;
        return;
    }
    Serial.printf("[%s] Canvas %dx%d in %s\n", TAG, w, h, psramFound() ? "PSRAM" : "internal RAM");
}

bool GfxDriver::init() {
    _bus = createBus();
    if (!_bus) return false;

    _tft = createPanel();
    if (!_tft || !_tft->begin(_freq)) {
        Serial.printf("[%s] Failed to initialize %s\n", TAG, panelName(_panel));
        delete _tft;
        _tft = nullptr;
        delete _bus;
        _bus = nullptr;
        return false;
    }

    setupCanvas();
    _gfx = _canvas ? static_cast<Arduino_GFX*>(_canvas) : _tft;
    _gfx->fillScreen(0);
    show();

    if (_blPin >= 0) {
        pinMode(_blPin, OUTPUT);
        digitalWrite(_blPin, HIGH);
    }

    Serial.printf("[%s] %s initialized, %dx%d, rotation %d, bus %s%s\n",
                  TAG, panelName(_panel), _gfx->width(), _gfx->height(), _rotation,
                  _busType.c_str(), _ips ? ", ips" : "");
    return true;
}

void GfxDriver::powerSave(bool enable) {
    if (!_tft) return;

    if (enable) {
        _tft->displayOff();
        if (_blPin >= 0) {
            digitalWrite(_blPin, LOW);
        }
    } else {
        _tft->displayOn();
        if (_blPin >= 0) {
            digitalWrite(_blPin, HIGH);
        }
    }
}

int16_t GfxDriver::width() const {
    return _gfx ? _gfx->width() : _width;
}

int16_t GfxDriver::height() const {
    return _gfx ? _gfx->height() : _height;
}

bool GfxDriver::isColor() const {
    return true;
}

uint8_t GfxDriver::bitDepth() const {
    return 16;
}

void GfxDriver::clear(uint32_t color) {
    if (!_gfx) return;
    _gfx->fillScreen(rgb888to565(color));
}

void GfxDriver::drawPixel(int16_t x, int16_t y, uint32_t color) {
    if (!_gfx) return;
    _gfx->drawPixel(x, y, rgb888to565(color));
}

void GfxDriver::drawBitmap(int16_t x, int16_t y,
                           const uint8_t* data, size_t dataSize,
                           int16_t w, int16_t h,
                           uint32_t color) {
    if (!_gfx) return;

    if (dataSize == (size_t)(w * h * 2)) {
        _gfx->draw16bitRGBBitmap(x, y, (const uint16_t*)data, w, h);
    } else {
        uint16_t c = rgb888to565(color);
        _gfx->drawBitmap(x, y, data, w, h, c);
    }
}

void GfxDriver::fillRect(int16_t x, int16_t y,
                         int16_t w, int16_t h,
                         uint32_t color) {
    if (!_gfx) return;
    _gfx->fillRect(x, y, w, h, rgb888to565(color));
}

void GfxDriver::setCursor(int16_t x, int16_t y) {
    if (!_gfx) return;
    _gfx->setCursor(x, y);
}

void GfxDriver::setTextSize(uint8_t size) {
    if (!_gfx) return;
    _gfx->setTextSize(size);
}

void GfxDriver::setTextColor(uint32_t color) {
    if (!_gfx) return;
    _gfx->setTextColor(rgb888to565(color));
}

void GfxDriver::print(const char* text) {
    if (!_gfx) return;
    _gfx->print(text);
}

void GfxDriver::show() {
    if (_canvas) _canvas->flush();
}
