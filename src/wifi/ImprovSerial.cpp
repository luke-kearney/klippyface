#include "wifi/ImprovSerial.h"

#include <WiFi.h>

#include "config/Settings.h"
#include "KlippyfaceVersion.h"

static const char* TAG = "IMPROV";

// Packet: "IMPROV" | version | type | length | data... | checksum (sum of all before it)
static const uint8_t HEADER[] = {'I', 'M', 'P', 'R', 'O', 'V'};
static const uint8_t HEADER_LEN = sizeof(HEADER);
static const uint8_t VERSION = 1;

static const uint8_t TYPE_STATE = 0x01;
static const uint8_t TYPE_ERROR = 0x02;
static const uint8_t TYPE_RPC = 0x03;
static const uint8_t TYPE_RESULT = 0x04;

static const uint8_t STATE_READY = 0x02;
static const uint8_t STATE_PROVISIONING = 0x03;
static const uint8_t STATE_PROVISIONED = 0x04;

static const uint8_t ERROR_NONE = 0x00;
static const uint8_t ERROR_INVALID_RPC = 0x01;
static const uint8_t ERROR_UNKNOWN_RPC = 0x02;
static const uint8_t ERROR_UNABLE_TO_CONNECT = 0x03;

static const uint8_t RPC_WIFI_SETTINGS = 0x01;
static const uint8_t RPC_CURRENT_STATE = 0x02;
static const uint8_t RPC_DEVICE_INFO = 0x03;
static const uint8_t RPC_SCAN = 0x04;

static const unsigned long CONNECT_TIMEOUT_MS = 15000;
static const unsigned long PARTIAL_PACKET_TIMEOUT_MS = 1000;
static const uint8_t MAX_SCAN_RESULTS = 20;

static uint8_t rxBuf[HEADER_LEN + 3 + 255 + 1];
static uint16_t rxLen = 0;
static unsigned long lastByteAt = 0;

#if CONFIG_IDF_TARGET_ESP32S3
static const char* CHIP_FAMILY = "ESP32-S3";
#else
static const char* CHIP_FAMILY = "ESP32";
#endif

void ImprovSerial::start() {
    xTaskCreatePinnedToCore(task, "improvTask", 4096, nullptr, 2, nullptr, 0);
}

void ImprovSerial::task(void* pvParameters) {
    for (;;) {
        while (Serial.available() > 0) {
            onByte((uint8_t)Serial.read());
        }
        if (rxLen > 0 && millis() - lastByteAt > PARTIAL_PACKET_TIMEOUT_MS) rxLen = 0;
        vTaskDelay(pdMS_TO_TICKS(20));
    }
}

void ImprovSerial::onByte(uint8_t b) {
    lastByteAt = millis();

    if (rxLen < HEADER_LEN) {
        if (b == HEADER[rxLen]) {
            rxBuf[rxLen++] = b;
        } else {
            rxLen = 0;
            if (b == HEADER[0]) rxBuf[rxLen++] = b;
        }
        return;
    }

    rxBuf[rxLen++] = b;
    if (rxLen == HEADER_LEN + 1 && rxBuf[HEADER_LEN] != VERSION) {
        rxLen = 0;
        return;
    }
    if (rxLen < HEADER_LEN + 3) return;

    uint8_t dataLen = rxBuf[HEADER_LEN + 2];
    uint16_t total = HEADER_LEN + 3 + dataLen + 1;
    if (rxLen < total) return;

    uint8_t sum = 0;
    for (uint16_t i = 0; i < total - 1; i++) sum += rxBuf[i];
    uint8_t type = rxBuf[HEADER_LEN + 1];
    rxLen = 0;

    if (sum != rxBuf[total - 1]) {
        Serial.printf("[%s] Bad checksum, ignoring packet\n", TAG);
        return;
    }
    handlePacket(type, rxBuf + HEADER_LEN + 3, dataLen);
}

void ImprovSerial::handlePacket(uint8_t type, const uint8_t* data, uint8_t len) {
    if (type != TYPE_RPC) return;
    // RPC: command | data length | data...
    if (len < 2 || data[1] + 2 > len) {
        sendError(ERROR_INVALID_RPC);
        return;
    }
    handleRpc(data[0], data + 2, data[1]);
}

void ImprovSerial::handleRpc(uint8_t command, const uint8_t* data, uint8_t len) {
    switch (command) {
        case RPC_CURRENT_STATE:
            if (Settings::isProvisioned() && WiFi.isConnected()) {
                sendState(STATE_PROVISIONED);
                sendResult(RPC_CURRENT_STATE, nullptr, 0);
            } else {
                sendState(STATE_READY);
            }
            break;
        case RPC_DEVICE_INFO:
            sendDeviceInfo();
            break;
        case RPC_SCAN:
            sendScan();
            break;
        case RPC_WIFI_SETTINGS:
            handleWifiSettings(data, len);
            break;
        default:
            sendError(ERROR_UNKNOWN_RPC);
            break;
    }
}

void ImprovSerial::handleWifiSettings(const uint8_t* data, uint8_t len) {
    // ssid length | ssid | password length | password
    if (len < 1 || data[0] + 2 > len || data[0] + 2 + data[data[0] + 1] > len) {
        sendError(ERROR_INVALID_RPC);
        return;
    }
    uint8_t ssidLen = data[0];
    uint8_t passLen = data[ssidLen + 1];
    String ssid((const char*)data + 1, ssidLen);
    String password((const char*)data + ssidLen + 2, passLen);

    Serial.printf("[%s] WiFi settings for \"%s\" — testing\n", TAG, ssid.c_str());
    sendError(ERROR_NONE);
    sendState(STATE_PROVISIONING);

    bool wasProvisioned = Settings::isProvisioned();
    String oldSsid = Settings::getWifiSsid();
    String oldPassword = Settings::getWifiPassword();

    if (!tryConnect(ssid, password)) {
        Serial.printf("[%s] Could not connect to \"%s\"\n", TAG, ssid.c_str());
        if (wasProvisioned && oldSsid.length() > 0) {
            WiFi.begin(oldSsid.c_str(), oldPassword.c_str());
        } else {
            WiFi.disconnect(false);  // keep the setup access point up
        }
        sendError(ERROR_UNABLE_TO_CONNECT);
        sendState(STATE_READY);
        return;
    }

    // Server address is left as it is: blank on a new board, so it discovers the server
    Settings::setWifiCredentials(ssid, password);
    Settings::setProvisioned(true);
    Serial.printf("[%s] Connected — saved, rebooting\n", TAG);

    sendState(STATE_PROVISIONED);
    sendResult(RPC_WIFI_SETTINGS, nullptr, 0);
    Serial.flush();
    vTaskDelay(pdMS_TO_TICKS(1500));
    ESP.restart();
}

bool ImprovSerial::tryConnect(const String& ssid, const String& password) {
    if (WiFi.getMode() == WIFI_MODE_NULL) WiFi.mode(WIFI_STA);
    WiFi.disconnect(false);
    vTaskDelay(pdMS_TO_TICKS(100));
    WiFi.begin(ssid.c_str(), password.c_str());

    unsigned long start = millis();
    while (millis() - start < CONNECT_TIMEOUT_MS) {
        if (WiFi.status() == WL_CONNECTED) return true;
        vTaskDelay(pdMS_TO_TICKS(250));
    }
    return false;
}

void ImprovSerial::sendDeviceInfo() {
    String name = Settings::getFriendlyName();
    if (name.length() == 0) {
        String mac = Settings::getNodeMac();
        mac.replace(":", "");
        name = "Klippyface-" + mac.substring(mac.length() > 6 ? mac.length() - 6 : 0);
    }
    String info[] = {"Klippyface", KLIPPYFACE_VERSION, CHIP_FAMILY, name};
    sendResult(RPC_DEVICE_INFO, info, 4);
}

void ImprovSerial::sendScan() {
    int16_t n = WiFi.scanNetworks(false, false);
    if (n == WIFI_SCAN_RUNNING) {
        // The setup portal may already be scanning; use its results
        unsigned long start = millis();
        while ((n = WiFi.scanComplete()) == WIFI_SCAN_RUNNING && millis() - start < 8000) {
            vTaskDelay(pdMS_TO_TICKS(100));
        }
    }

    uint8_t sent = 0;
    for (int16_t i = 0; i < n && sent < MAX_SCAN_RESULTS; i++) {
        String ssid = WiFi.SSID(i);
        if (ssid.length() == 0) continue;
        bool duplicate = false;
        for (int16_t j = 0; j < i; j++) {
            if (WiFi.SSID(j) == ssid) { duplicate = true; break; }
        }
        if (duplicate) continue;

        String entry[] = {ssid, String(WiFi.RSSI(i)), WiFi.encryptionType(i) == WIFI_AUTH_OPEN ? "NO" : "YES"};
        sendResult(RPC_SCAN, entry, 3);
        sent++;
    }
    // An empty result ends the list
    sendResult(RPC_SCAN, nullptr, 0);
}

void ImprovSerial::sendState(uint8_t state) {
    sendPacket(TYPE_STATE, &state, 1);
}

void ImprovSerial::sendError(uint8_t error) {
    sendPacket(TYPE_ERROR, &error, 1);
}

void ImprovSerial::sendResult(uint8_t command, const String* strings, uint8_t count) {
    // command | length of the rest | (string length | string)...
    uint8_t data[255];
    uint16_t len = 2;
    for (uint8_t i = 0; i < count; i++) {
        uint16_t sLen = strings[i].length();
        if (len + 1 + sLen > sizeof(data)) break;
        data[len++] = (uint8_t)sLen;
        memcpy(data + len, strings[i].c_str(), sLen);
        len += sLen;
    }
    data[0] = command;
    data[1] = (uint8_t)(len - 2);
    sendPacket(TYPE_RESULT, data, (uint8_t)len);
}

void ImprovSerial::sendPacket(uint8_t type, const uint8_t* data, uint8_t len) {
    uint8_t packet[HEADER_LEN + 3 + 255 + 2];
    uint16_t n = 0;
    memcpy(packet, HEADER, HEADER_LEN);
    n += HEADER_LEN;
    packet[n++] = VERSION;
    packet[n++] = type;
    packet[n++] = len;
    memcpy(packet + n, data, len);
    n += len;

    uint8_t sum = 0;
    for (uint16_t i = 0; i < n; i++) sum += packet[i];
    packet[n++] = sum;
    packet[n++] = '\n';  // keeps the surrounding log output on its own lines

    // One write, so log lines from other tasks can't land inside the packet
    Serial.write(packet, n);
}
