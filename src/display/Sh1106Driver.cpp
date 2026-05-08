#include "Sh1106Driver.h"

static const char* TAG = "SH1106";

Sh1106Driver::Sh1106Driver(int16_t width, int16_t height, uint8_t i2cAddr, uint8_t rotation)
    : _display(nullptr)
    , _width(width)
    , _height(height)
    , _i2cAddr(i2cAddr)
    , _rotation(rotation) {
}

Sh1106Driver::~Sh1106Driver() {
    delete _display;
}

bool Sh1106Driver::init() {
    _display = new Adafruit_SH1106G(_width, _height, &Wire, -1);

    if (!_display->begin(_i2cAddr, true)) {
        Serial.printf("[%s] Failed to initialize at 0x%02X\n", TAG, _i2cAddr);
        delete _display;
        _display = nullptr;
        return false;
    }

    _display->setRotation(_rotation);
    _display->clearDisplay();
    _display->display();

    Serial.printf("[%s] Initialized at 0x%02X, %dx%d, rotation %d\n",
                  TAG, _i2cAddr, _width, _height, _rotation);
    return true;
}

void Sh1106Driver::powerSave(bool enable) {
    if (!_display) return;
    _display->displayOff();
}

int16_t Sh1106Driver::width() const {
    return _display ? _display->width() : _width;
}

int16_t Sh1106Driver::height() const {
    return _display ? _display->height() : _height;
}

bool Sh1106Driver::isColor() const {
    return false;
}

uint8_t Sh1106Driver::bitDepth() const {
    return 1;
}

void Sh1106Driver::clear(uint32_t color) {
    if (!_display) return;
    _display->clearDisplay();
}

void Sh1106Driver::drawPixel(int16_t x, int16_t y, uint32_t color) {
    if (!_display) return;
    _display->drawPixel(x, y, color ? 1 : 0);
}

void Sh1106Driver::drawBitmap(int16_t x, int16_t y,
                               const uint8_t* data,
                               int16_t w, int16_t h,
                               uint32_t color) {
    if (!_display) return;
    _display->drawBitmap(x, y, data, w, h, color ? 1 : 0);
}

void Sh1106Driver::fillRect(int16_t x, int16_t y,
                             int16_t w, int16_t h,
                             uint32_t color) {
    if (!_display) return;
    _display->fillRect(x, y, w, h, color ? 1 : 0);
}

void Sh1106Driver::setCursor(int16_t x, int16_t y) {
    if (!_display) return;
    _display->setCursor(x, y);
}

void Sh1106Driver::setTextSize(uint8_t size) {
    if (!_display) return;
    _display->setTextSize(size);
}

void Sh1106Driver::setTextColor(uint32_t color) {
    if (!_display) return;
    _display->setTextColor(color ? 1 : 0);
}

void Sh1106Driver::print(const char* text) {
    if (!_display) return;
    _display->print(text);
}

void Sh1106Driver::show() {
    if (!_display) return;
    _display->display();
}
