#ifndef KLIPPYFACE_SPRITE_H
#define KLIPPYFACE_SPRITE_H

#include <Arduino.h>
#include <stdint.h>
#include <vector>
#include "engine/Config.h"

struct Sprite {
    uint16_t width = 0;
    uint16_t height = 0;
    std::vector<uint8_t> data;

    bool isValid() const { return !data.empty(); }
    const uint8_t* rawData() const { return data.data(); }
    size_t byteSize() const { return data.size(); }
};

Sprite decodeBase64Sprite(const String& base64, uint16_t width, uint16_t height);
Sprite decodeSpriteFromInfo(const SpriteInfo& info);

#endif
