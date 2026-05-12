#include "ConfigFetcher.h"
#include <WiFi.h>
#include <HTTPClient.h>

static const char* TAG = "CONFIG";

String ConfigFetcher::fetchConfig(const String& host, uint16_t port, const String& mac) {
    if (!WiFi.isConnected()) {
        Serial.printf("[%s] WiFi not connected — skipping fetch\n", TAG);
        return "";
    }

    String url = "http://" + host + ":" + String(port)
               + "/api/config/node?mac=" + mac;

    Serial.printf("[%s] Fetching config from %s:%u ...\n", TAG, host.c_str(), port);

    HTTPClient http;
    http.setTimeout(HTTP_TIMEOUT_MS);
    http.begin(url);

    int httpCode = http.GET();
    if (httpCode <= 0) {
        Serial.printf("[%s] HTTP GET failed: %s\n", TAG, http.errorToString(httpCode).c_str());
        http.end();
        return "";
    }

    if (httpCode != 200) {
        Serial.printf("[%s] HTTP %d — unexpected status\n", TAG, httpCode);
        http.end();
        return "";
    }

    String body = http.getString();
    Serial.printf("[%s] HTTP 200 (%u bytes)\n", TAG, (unsigned)body.length());
    http.end();
    return body;
}
