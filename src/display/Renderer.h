#ifndef KLIPPYFACE_RENDERER_H
#define KLIPPYFACE_RENDERER_H

#include <Arduino.h>
#include <stdint.h>
#include <map>
#include "engine/Config.h"
#include "display/DisplayDriver.h"
#include "display/Sprite.h"

void renderFrame(const Frame& frame, DisplayDriver& display,
                 const std::map<String, Sprite>* sprites = nullptr,
                 const PrinterState* state = nullptr);

#endif
