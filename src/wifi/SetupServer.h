#ifndef KLIPPYFACE_SETUP_SERVER_H
#define KLIPPYFACE_SETUP_SERVER_H

#include <Arduino.h>
#include <WiFi.h>
#include <vector>

class SetupServer {
public:
    bool saveConfig(const String& ssid, const String& password,
                    const String& svHost, uint16_t svPort, bool svUseTls,
                    bool svTlsVerify, const String& friendlyName);

    // Start a background WiFi scan unless one is running
    void startScan();
    // Collect a finished scan into the network list; call from the portal loop
    void pollScan();
    // {"scanning": bool, "networks": [{"ssid", "rssi", "secure"}]}, strongest first
    String scanJson() const;

private:
    struct Network {
        String  ssid;
        int32_t rssi;
        bool    secure;
    };

    std::vector<Network> _networks;
    bool _scanning = false;
};

#endif
