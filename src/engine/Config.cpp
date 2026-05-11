#include "Config.h"
#include <string.h>

static const char* TAG = "CONFIG";

// -------------------------------------------------------------------
// Hex color parser "#RRGGBB" → 0xRRGGBB
// -------------------------------------------------------------------
uint32_t hexColorToUint32(const char* hex) {
    if (!hex || *hex == '\0') {
        return 0x000000;
    }

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

// -------------------------------------------------------------------
// PrinterState::resolve — maps Moonraker keys to formatted display strings
// -------------------------------------------------------------------
String PrinterState::resolve(const String& key) const {
    if (key == "print_stats.progress") {
        char buf[16];
        snprintf(buf, sizeof(buf), "%.1f%%", progress);
        return String(buf);
    }

    if (key == "extruder.temperature") {
        char buf[16];
        snprintf(buf, sizeof(buf), "%.0f°C", nozzleTemp);
        return String(buf);
    }

    if (key == "heater_bed.temperature") {
        char buf[16];
        snprintf(buf, sizeof(buf), "%.0f°C", bedTemp);
        return String(buf);
    }

    if (key == "extruder.target") {
        char buf[16];
        snprintf(buf, sizeof(buf), "%.0f°C", nozzleTarget);
        return String(buf);
    }

    if (key == "heater_bed.target") {
        char buf[16];
        snprintf(buf, sizeof(buf), "%.0f°C", bedTarget);
        return String(buf);
    }

    if (key == "moonraker.connected") {
        return moonrakerConnected ? "Online" : "Offline";
    }

    Serial.printf("[%s] Unknown binding key: %s\n", TAG, key.c_str());
    return "?";
}
