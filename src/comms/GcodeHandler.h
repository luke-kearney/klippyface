#ifndef KLIPPYFACE_GCODE_HANDLER_H
#define KLIPPYFACE_GCODE_HANDLER_H

#include <Arduino.h>
#include <stdint.h>

struct GcodeMessage {
    char text[128];
};

struct DisplayCommand {
    String group;
    String set;
    int16_t loop = -1;
    float speed = 1.0f;
    bool isAlert = false;
    String alertText;
    uint8_t alertDuration = 5;
};

class GcodeHandler {
public:
    GcodeHandler();

    bool parseDisplayCommand(const String& message, DisplayCommand& cmd);
};

#endif
