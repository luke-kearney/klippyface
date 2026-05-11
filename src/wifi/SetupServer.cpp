#include "SetupServer.h"
#include "config/Settings.h"

static const char* TAG = "SETUP";

bool SetupServer::saveConfig(const String& ssid, const String& password,
                              const String& mkHost, uint16_t mkPort,
                              const String& friendlyName) {
    Serial.printf("[%s] Saving config: SSID=\"%s\" MK=%s:%u\n",
                  TAG, ssid.c_str(), mkHost.c_str(), mkPort);

    Settings::setWifiCredentials(ssid, password);
    Settings::setMoonrakerHost(mkHost, mkPort);
    if (friendlyName.length() > 0) {
        Settings::setFriendlyName(friendlyName);
    }
    Settings::setProvisioned(true);
    return true;
}

String SetupServer::scanNetworks() {
    int n = WiFi.scanComplete();

    if (n == WIFI_SCAN_FAILED) {
        WiFi.scanNetworks(true);
        return "[]";
    }

    if (n == WIFI_SCAN_RUNNING) {
        return "[]";
    }

    String json = "[";
    for (int i = 0; i < n; i++) {
        if (i > 0) json += ",";
        String ssid = WiFi.SSID(i);
        ssid.replace("\\", "\\\\");
        ssid.replace("\"", "\\\"");
        json += "{\"ssid\":\"" + ssid + "\",\"rssi\":" + String(WiFi.RSSI(i)) + "}";
    }
    json += "]";

    WiFi.scanDelete();
    return json;
}
