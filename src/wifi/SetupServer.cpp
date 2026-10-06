#include "SetupServer.h"
#include "config/Settings.h"

static const char* TAG = "SETUP";

bool SetupServer::saveConfig(const String& ssid, const String& password,
                              const String& svHost, uint16_t svPort, bool svUseTls,
                              bool svTlsVerify, const String& friendlyName) {
    Serial.printf("[%s] Saving config: SSID=\"%s\" server=%s://%s:%u\n",
                  TAG, ssid.c_str(), svUseTls ? "https" : "http", svHost.c_str(), svPort);

    Settings::setWifiCredentials(ssid, password);
    Settings::setServerHost(svHost, svPort);
    Settings::setServerUseTls(svUseTls);
    Settings::setServerTlsVerify(svTlsVerify);

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
