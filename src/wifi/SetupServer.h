#ifndef KLIPPYFACE_SETUP_SERVER_H
#define KLIPPYFACE_SETUP_SERVER_H

#include <Arduino.h>
#include <WiFi.h>

class SetupServer {
public:
    bool saveConfig(const String& ssid, const String& password,
                    const String& mkHost, uint16_t mkPort,
                    const String& friendlyName);
    String scanNetworks();
};

#endif
