#include "Hx8347Driver.h"
#include <databus/Arduino_ESP32PAR8.h>
#include <display/Arduino_HX8347D.h>

static const char* TAG = "HX8347";

static int8_t parsePin(const JsonObject& obj, const char* key) {
    if (!obj[key].is<int>()) return -1;
    return (int8_t)obj[key].as<int>();
}

uint16_t Hx8347Driver::rgb888to565(uint32_t rgb) {
    uint8_t r = (rgb >> 16) & 0xFF;
    uint8_t g = (rgb >> 8) & 0xFF;
    uint8_t b = rgb & 0xFF;
    return ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
}

Hx8347Driver::Hx8347Driver(int16_t width, int16_t height, const JsonObject& busConfig, uint8_t rotation)
    : _gfx(nullptr)
    , _bus(nullptr)
    , _width(width)
    , _height(height)
    , _rotation(rotation)
    , _blPin(-1)
    , _ips(false)
    , _busType("parallel8")
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
}

Hx8347Driver::~Hx8347Driver() {
    delete _gfx;
    delete _bus;
}

bool Hx8347Driver::init() {
    if (_busType == "parallel8") {
        _bus = new Arduino_ESP32PAR8(_dc, _cs, _wr, _rd, _d0, _d1, _d2, _d3, _d4, _d5, _d6, _d7);
    }

    if (!_bus) {
        Serial.printf("[%s] Unknown bus type: %s\n", TAG, _busType.c_str());
        return false;
    }

    _gfx = new Arduino_HX8347D(_bus, _rst, _rotation, _ips);

    if (!_gfx->begin()) {
        Serial.printf("[%s] Failed to initialize\n", TAG);
        delete _gfx;
        _gfx = nullptr;
        delete _bus;
        _bus = nullptr;
        return false;
    }

    Serial.printf("[%s] Initialized, %dx%d, rotation %d, bus %s%s\n",
                  TAG, _width, _height, _rotation, _busType.c_str(),
                  _ips ? ", ips" : "");
    return true;
}

void Hx8347Driver::powerSave(bool enable) {
    if (!_gfx) return;

    if (enable) {
        _gfx->displayOff();
        if (_blPin >= 0) {
            digitalWrite(_blPin, LOW);
        }
    } else {
        _gfx->displayOn();
        if (_blPin >= 0) {
            digitalWrite(_blPin, HIGH);
        }
    }
}

int16_t Hx8347Driver::width() const {
    return _gfx ? _gfx->width() : _width;
}

int16_t Hx8347Driver::height() const {
    return _gfx ? _gfx->height() : _height;
}

bool Hx8347Driver::isColor() const {
    return true;
}

uint8_t Hx8347Driver::bitDepth() const {
    return 16;
}

void Hx8347Driver::clear(uint32_t color) {
    if (!_gfx) return;
    _gfx->fillScreen(rgb888to565(color));
}

void Hx8347Driver::drawPixel(int16_t x, int16_t y, uint32_t color) {
    if (!_gfx) return;
    _gfx->drawPixel(x, y, rgb888to565(color));
}

void Hx8347Driver::drawBitmap(int16_t x, int16_t y,
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

void Hx8347Driver::fillRect(int16_t x, int16_t y,
                             int16_t w, int16_t h,
                             uint32_t color) {
    if (!_gfx) return;
    _gfx->fillRect(x, y, w, h, rgb888to565(color));
}

void Hx8347Driver::setCursor(int16_t x, int16_t y) {
    if (!_gfx) return;
    _gfx->setCursor(x, y);
}

void Hx8347Driver::setTextSize(uint8_t size) {
    if (!_gfx) return;
    _gfx->setTextSize(size);
}

void Hx8347Driver::setTextColor(uint32_t color) {
    if (!_gfx) return;
    _gfx->setTextColor(rgb888to565(color));
}

void Hx8347Driver::print(const char* text) {
    if (!_gfx) return;
    _gfx->print(text);
}

void Hx8347Driver::show() {
}
