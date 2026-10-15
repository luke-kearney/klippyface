#include "SetupServer.h"
#include "config/Settings.h"

#include <ArduinoJson.h>
#include <algorithm>

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

void SetupServer::startScan() {
    if (_scanning) return;
    _scanning = WiFi.scanNetworks(true) == WIFI_SCAN_RUNNING;
    if (!_scanning) Serial.printf("[%s] WiFi scan failed to start\n", TAG);
}

void SetupServer::pollScan() {
    if (!_scanning) return;
    int n = WiFi.scanComplete();
    if (n == WIFI_SCAN_RUNNING) return;
    _scanning = false;
    if (n < 0) {
        Serial.printf("[%s] WiFi scan failed\n", TAG);
        return;
    }

    // One entry per name (several access points can share one), hidden networks left out
    _networks.clear();
    for (int i = 0; i < n; i++) {
        String ssid = WiFi.SSID(i);
        if (ssid.isEmpty()) continue;
        int32_t rssi = WiFi.RSSI(i);
        bool secure = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
        auto same = std::find_if(_networks.begin(), _networks.end(),
                                 [&](const Network& net) { return net.ssid == ssid; });
        if (same == _networks.end()) {
            _networks.push_back({ssid, rssi, secure});
        } else if (rssi > same->rssi) {
            same->rssi = rssi;
            same->secure = secure;
        }
    }
    std::sort(_networks.begin(), _networks.end(),
              [](const Network& a, const Network& b) { return a.rssi > b.rssi; });
    WiFi.scanDelete();
    Serial.printf("[%s] WiFi scan: %u networks\n", TAG, (unsigned)_networks.size());
}

String SetupServer::scanJson() const {
    JsonDocument doc;
    doc["scanning"] = _scanning;
    JsonArray list = doc["networks"].to<JsonArray>();
    for (const Network& net : _networks) {
        JsonObject o = list.add<JsonObject>();
        o["ssid"] = net.ssid;
        o["rssi"] = net.rssi;
        o["secure"] = net.secure;
    }
    String json;
    serializeJson(doc, json);
    return json;
}
