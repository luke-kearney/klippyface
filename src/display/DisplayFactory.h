#ifndef KLIPPYFACE_DISPLAY_FACTORY_H
#define KLIPPYFACE_DISPLAY_FACTORY_H

#include "DisplayDriver.h"
#include <ArduinoJson.h>

DisplayDriver* createDriver(const char* type, const JsonObject& busConfig,
                            int16_t width, int16_t height, uint8_t rotation);

#endif
