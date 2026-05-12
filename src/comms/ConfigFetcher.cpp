#include "ConfigFetcher.h"
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>

static const char* TAG = "CONFIG";

String ConfigFetcher::fetchConfig(const String& host, uint16_t port,
                                   bool useTls, bool tlsVerify,
                                   const String& mac) {
    if (!WiFi.isConnected()) {
        Serial.printf("[%s] WiFi not connected — skipping fetch\n", TAG);
        return "";
    }

    String scheme = useTls ? "https" : "http";
    String url = scheme + "://" + host + ":" + String(port)
               + "/api/config/node?mac=" + mac;

    Serial.printf("[%s] Fetching config from %s://%s:%u ...\n",
                  TAG, scheme.c_str(), host.c_str(), port);

    HTTPClient http;
    http.setTimeout(HTTP_TIMEOUT_MS);

    if (useTls) {
        WiFiClientSecure* client = new WiFiClientSecure();
        if (!tlsVerify) {
            client->setInsecure();
            Serial.printf("[%s] HTTPS without cert verification\n", TAG);
        } else {
            Serial.printf("[%s] HTTPS with cert verification (built-in CA bundle)\n", TAG);
        }
        http.begin(*client, url);

        int httpCode = http.GET();
        delete client;

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
