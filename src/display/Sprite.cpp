#include "Sprite.h"

static const char* TAG = "SPRITE";

static uint8_t base64CharValue(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return 0xFF;
}

static std::vector<uint8_t> base64Decode(const String& input) {
    size_t len = input.length();
    if (len == 0) return {};

    size_t outputLen = (len / 4) * 3;
    if (len > 0 && input[len - 1] == '=') outputLen--;
    if (len > 1 && input[len - 2] == '=') outputLen--;

    std::vector<uint8_t> result;
    result.reserve(outputLen);

    uint8_t b64[4] = {0};
    size_t bi = 0;

    for (size_t i = 0; i < len; i++) {
        char c = input[i];

        if (c == '=') {
            while (bi < 4) b64[bi++] = 0;
        } else {
            uint8_t v = base64CharValue(c);
            if (v == 0xFF) {
                Serial.printf("[%s] Invalid base64 char '%c' at pos %u\n", TAG, c, (unsigned)i);
                return {};
            }
            b64[bi++] = v;
        }

        if (bi == 4) {
            uint32_t val = (b64[0] << 18) | (b64[1] << 12) | (b64[2] << 6) | b64[3];
            result.push_back((val >> 16) & 0xFF);
            if (result.size() < outputLen) result.push_back((val >> 8) & 0xFF);
            if (result.size() < outputLen) result.push_back(val & 0xFF);
            bi = 0;
        }
    }

    return result;
}

Sprite decodeBase64Sprite(const String& base64, uint16_t width, uint16_t height) {
    Sprite sprite;
    sprite.width = width;
    sprite.height = height;

    if (base64.length() == 0) {
        Serial.printf("[%s] Empty base64 data for %dx%d sprite\n", TAG, width, height);
        return sprite;
    }

    size_t stride = (width + 7) / 8;
    size_t expectedSize = stride * height;

    sprite.data = base64Decode(base64);

    if (sprite.data.size() != expectedSize) {
        Serial.printf("[%s] Size mismatch: expected %u bytes, got %u for %dx%d sprite\n",
                      TAG, (unsigned)expectedSize, (unsigned)sprite.data.size(), width, height);
        sprite.data.clear();
    }

    return sprite;
}
