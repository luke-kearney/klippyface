#include "Settings.h"

nvs_handle_t Settings::_handle = 0;
bool Settings::_ready = false;

static const char* TAG = "SETTINGS";
static const char* NVS_NS = "klippyface";

// ---- Key names ----
static const char* KEY_PROVISIONED = "provisioned";
static const char* KEY_WIFI_SSID   = "wifi_ssid";
static const char* KEY_WIFI_PASS   = "wifi_pass";
static const char* KEY_MK_HOST     = "mk_host";
static const char* KEY_MK_PORT     = "mk_port";
static const char* KEY_SV_HOST     = "sv_host";
static const char* KEY_SV_PORT     = "sv_port";
static const char* KEY_NODE_MAC    = "node_mac";
static const char* KEY_FRIENDLY    = "friendly";

bool Settings::begin() {
    esp_err_t err = nvs_flash_init();
    if (err == ESP_ERR_NVS_NO_FREE_PAGES || err == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        // NVS partition was truncated or has a new version — erase and retry
        nvs_flash_erase();
        err = nvs_flash_init();
    }
    if (err != ESP_OK) {
        Serial.printf("[%s] NVS init failed: %s\n", TAG, esp_err_to_name(err));
        return false;
    }

    err = nvs_open(NVS_NS, NVS_READWRITE, &_handle);
    if (err != ESP_OK) {
        Serial.printf("[%s] NVS open failed: %s\n", TAG, esp_err_to_name(err));
        return false;
    }

    _ready = true;
    Serial.printf("[%s] Initialized — NVS namespace \"%s\"\n", TAG, NVS_NS);
    Serial.printf("[%s] Provisioned: %s\n", TAG, isProvisioned() ? "yes" : "no");
    return true;
}

bool Settings::isProvisioned() {
    if (!_ready) return false;
    uint8_t val = 0;
    nvs_get_u8(_handle, KEY_PROVISIONED, &val);
    return val == 1;
}

void Settings::setProvisioned(bool provisioned) {
    if (!_ready) return;
    nvs_set_u8(_handle, KEY_PROVISIONED, provisioned ? 1 : 0);
    commit();
    Serial.printf("[%s] Provisioned: %s\n", TAG, provisioned ? "yes" : "no");
}

// ---- WiFi ----

String Settings::getWifiSsid()       { return readString(KEY_WIFI_SSID, ""); }
String Settings::getWifiPassword()   { return readString(KEY_WIFI_PASS, ""); }

void Settings::setWifiCredentials(const String& ssid, const String& password) {
    writeString(KEY_WIFI_SSID, ssid);
    writeString(KEY_WIFI_PASS, password);
    Serial.printf("[%s] WiFi: %s (********)\n", TAG, ssid.c_str());
}

// ---- Moonraker ----

String Settings::getMoonrakerHost()  { return readString(KEY_MK_HOST, "192.168.2.21"); }
uint16_t Settings::getMoonrakerPort() {
    if (!_ready) return 7125;
    uint16_t port = 7125;
    nvs_get_u16(_handle, KEY_MK_PORT, &port);
    return port;
}

void Settings::setMoonrakerHost(const String& host, uint16_t port) {
    writeString(KEY_MK_HOST, host);
    if (_ready) {
        nvs_set_u16(_handle, KEY_MK_PORT, port);
    }
    Serial.printf("[%s] Moonraker: %s:%u\n", TAG, host.c_str(), port);
}

// ---- Companion server ----

String Settings::getServerHost() {
    String sv = readString(KEY_SV_HOST, "");
    if (sv.length() > 0) return sv;
    // Default to same host as Moonraker
    return getMoonrakerHost();
}

uint16_t Settings::getServerPort() {
    if (!_ready) return 5000;
    uint16_t port = 0;
    nvs_get_u16(_handle, KEY_SV_PORT, &port);
    if (port > 0) return port;
    return 5000;
}

void Settings::setServerHost(const String& host, uint16_t port) {
    writeString(KEY_SV_HOST, host);
    if (_ready) {
        nvs_set_u16(_handle, KEY_SV_PORT, port);
    }
    Serial.printf("[%s] Server: %s:%u\n", TAG, host.c_str(), port);
}

// ---- Node identity ----

String Settings::getNodeMac()        { return readString(KEY_NODE_MAC, ""); }
String Settings::getFriendlyName()   { return readString(KEY_FRIENDLY, ""); }

void Settings::setNodeMac(const String& mac)  { writeString(KEY_NODE_MAC, mac); }
void Settings::setFriendlyName(const String& name) { writeString(KEY_FRIENDLY, name); }

// ---- Lifecycle ----

void Settings::clear() {
    if (!_ready) return;
    nvs_erase_all(_handle);
    commit();
    Serial.printf("[%s] Factory reset — all NVS erased\n", TAG);
}

void Settings::commit() {
    if (!_ready) return;
    nvs_commit(_handle);
}

// ---- Private helpers ----

String Settings::readString(const char* key, const String& fallback) {
    if (!_ready) return fallback;
    size_t len = 0;
    if (nvs_get_str(_handle, key, nullptr, &len) != ESP_OK || len == 0) {
        return fallback;
    }
    char* buf = new char[len];
    nvs_get_str(_handle, key, buf, &len);
    String result = String(buf);
    delete[] buf;
    return result;
}

void Settings::writeString(const char* key, const String& value) {
    if (!_ready) return;
    nvs_set_str(_handle, key, value.c_str());
}
