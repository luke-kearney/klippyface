#include "comms/GcodeHandler.h"

static const char* TAG = "GCODE";

GcodeHandler::GcodeHandler() {}

bool GcodeHandler::parseDisplayCommand(const String& message, DisplayCommand& cmd) {
    int idx = message.indexOf("display:");
    if (idx < 0) return false;

    String cmdStr = message.substring(idx + 8);
    cmdStr.trim();

    int pos = 0;
    while (pos < (int)cmdStr.length()) {
        int space = cmdStr.indexOf(' ', pos);
        String pair = (space > 0) ? cmdStr.substring(pos, space) : cmdStr.substring(pos);

        int eq = pair.indexOf('=');
        if (eq > 0) {
            String key = pair.substring(0, eq);
            String value = pair.substring(eq + 1);
            key.toLowerCase();

            if (key == "group") {
                cmd.group = value;
            } else if (key == "set") {
                cmd.set = value;
            } else if (key == "loop") {
                cmd.loop = (int16_t)value.toInt();
            } else if (key == "speed") {
                cmd.speed = value.toFloat();
            }
        }

        pos = (space > 0) ? space + 1 : cmdStr.length();
    }

    Serial.printf("[%s] Parsed: group=%s set=%s loop=%d speed=%.1f\n",
                  TAG, cmd.group.c_str(), cmd.set.c_str(), cmd.loop, cmd.speed);

    return true;
}
