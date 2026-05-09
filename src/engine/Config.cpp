#include "Config.h"
#include <string.h>

static const char* TAG = "CONFIG";

// -------------------------------------------------------------------
// FrameType <-> string conversion
// -------------------------------------------------------------------
const char* frameTypeToString(FrameType t) {
    switch (t) {
        case FrameType::Text:     return "text";
        case FrameType::Sprite:   return "sprite";
        case FrameType::Clear:    return "clear";
        case FrameType::Progress: return "progress";
        case FrameType::Temp:     return "temp";
    }
    return "text";
}

FrameType stringToFrameType(const char* s) {
    if (strcasecmp(s, "sprite") == 0)   return FrameType::Sprite;
    if (strcasecmp(s, "clear") == 0)    return FrameType::Clear;
    if (strcasecmp(s, "progress") == 0) return FrameType::Progress;
    if (strcasecmp(s, "temp") == 0)     return FrameType::Temp;
    return FrameType::Text;
}

// -------------------------------------------------------------------
// Hex color parser "#RRGGBB" → 0xRRGGBB
// -------------------------------------------------------------------
uint32_t hexColorToUint32(const char* hex) {
    if (!hex || *hex == '\0') {
        return 0x000000;
    }

    // Skip leading '#'
    if (*hex == '#') {
        hex++;
    }

    size_t len = strlen(hex);
    if (len != 6) {
        Serial.printf("[%s] Invalid hex color: %s\n", TAG, hex);
        return 0x000000;
    }

    uint32_t result = 0;
    for (size_t i = 0; i < 6; i++) {
        char c = hex[i];
        result <<= 4;
        if (c >= '0' && c <= '9') {
            result |= (c - '0');
        } else if (c >= 'a' && c <= 'f') {
            result |= (c - 'a' + 10);
        } else if (c >= 'A' && c <= 'F') {
            result |= (c - 'A' + 10);
        } else {
            Serial.printf("[%s] Invalid hex digit '%c' in %s\n", TAG, c, hex);
            return 0x000000;
        }
    }

    return result;
}
