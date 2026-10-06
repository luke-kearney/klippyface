#include "CaptivePortal.h"
#include "setup_html.h"

#include <ArduinoJson.h>

static const char* TAG = "PORTAL";
static const char* AP_SSID = "Klippyface-Setup";

CaptivePortal::CaptivePortal()
    : _server(80)
    , _lastActivity(0)
    , _running(false)
    , _rebootPending(false) {
}

bool CaptivePortal::begin() {
    WiFi.mode(WIFI_AP);
    if (!WiFi.softAP(AP_SSID)) {
        Serial.printf("[%s] Failed to start AP\n", TAG);
        return false;
    }

    IPAddress apIP = WiFi.softAPIP();
    Serial.printf("[%s] AP started: %s (%d.%d.%d.%d)\n",
                  TAG, AP_SSID, apIP[0], apIP[1], apIP[2], apIP[3]);

    _dns.start(53, "*", apIP);

    _server.on("/", HTTP_GET, [this]() { handleRoot(); });
    _server.on("/save", HTTP_POST, [this]() { handleSave(); });
    _server.on("/scan", HTTP_GET, [this]() { handleScan(); });
    _server.begin();

    _running = true;
    _lastActivity = millis();
    Serial.printf("[%s] HTTP server started on port 80\n", TAG);
    return true;
}

void CaptivePortal::tick() {
    if (_rebootPending) {
        vTaskDelay(pdMS_TO_TICKS(200));
        ESP.restart();
    }

    _dns.processNextRequest();
    _server.handleClient();

    if (millis() - _lastActivity > IDLE_TIMEOUT_MS) {
        Serial.printf("[%s] Idle 30min — rebooting\n", TAG);
        vTaskDelay(pdMS_TO_TICKS(200));
        _rebootPending = false;
        _running = false;
        ESP.restart();
    }
}

void CaptivePortal::stop() {
    _server.stop();
    _dns.stop();
    WiFi.softAPdisconnect(true);
    _running = false;
    Serial.printf("[%s] Captive portal stopped\n", TAG);
}

bool CaptivePortal::isRunning() const {
    return _running;
}

void CaptivePortal::touchActivity() {
    _lastActivity = millis();
}

void CaptivePortal::handleRoot() {
    touchActivity();
    _server.send(200, "text/html", SETUP_HTML);
}

void CaptivePortal::handleSave() {
    touchActivity();

    String body = _server.arg("plain");
    if (body.length() == 0) {
        _server.send(400, "text/plain", "Empty request body");
        return;
    }

    JsonDocument doc;
    DeserializationError err = deserializeJson(doc, body);
    if (err) {
        _server.send(400, "text/plain", "Invalid JSON");
        return;
    }

    String ssid = doc["ssid"] | "";
    String password = doc["password"] | "";
    String svHost = doc["sv_host"] | "";
    uint16_t svPort = doc["sv_port"] | 5000;
    bool svUseTls = doc["sv_tls"] | false;
    bool svTlsVerify = doc["sv_tls_verify"] | false;
    String friendlyName = doc["friendly_name"] | "";

    if (ssid.length() == 0) {
        _server.send(400, "text/plain", "WiFi SSID is required");
        return;
    }
    if (svHost.length() == 0) {
        _server.send(400, "text/plain", "Klippyface server host is required");
        return;
    }

    if (!_setup.saveConfig(ssid, password, svHost, svPort, svUseTls, svTlsVerify, friendlyName)) {
        _server.send(500, "text/plain", "Failed to save configuration");
        return;
    }

    _server.send(200, "text/plain", "OK");
    Serial.printf("[%s] Config saved — rebooting\n", TAG);
    _rebootPending = true;
}

void CaptivePortal::handleScan() {
    touchActivity();
    String json = _setup.scanNetworks();
    _server.send(200, "application/json", json);
}
