#include "DisplayFactory.h"
#include "Sh1106Driver.h"
#include "Hx8347Driver.h"

static const char* TAG = "FACTORY";

DisplayDriver* createDriver(const char* type, const JsonObject& busConfig,
                            int16_t width, int16_t height, uint8_t rotation) {

    if (strcmp(type, "sh1106") == 0) {
        uint8_t addr = 0x3C;
        if (busConfig["address"].is<const char*>()) {
            const char* addrStr = busConfig["address"];
            addr = (uint8_t)strtol(addrStr, nullptr, 16);
        }
        Serial.printf("[%s] Creating sh1106 at 0x%02X (%dx%d, rot %d)\n",
                      TAG, addr, width, height, rotation);
        return new Sh1106Driver(width, height, addr, rotation);
    }

    if (strcmp(type, "hx8347") == 0) {
        Serial.printf("[%s] Creating hx8347 (%dx%d, rot %d)\n",
                      TAG, width, height, rotation);
        return new Hx8347Driver(width, height, busConfig, rotation);
    }

    Serial.printf("[%s] Unknown driver type: %s\n", TAG, type);
    return nullptr;
}
