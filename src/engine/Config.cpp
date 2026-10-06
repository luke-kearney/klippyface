#include "Config.h"
#include <string.h>

static const char* TAG = "CONFIG";

// -------------------------------------------------------------------
// Hex color parser "#RRGGBB" → 0xRRGGBB
// -------------------------------------------------------------------
uint32_t hexColorToUint32(const char* hex) {
    if (!hex || *hex == '\0') {
        return 0x000000;
    }

    if (*hex == '#') {
        hex++;
    }

    size_t len = strlen(hex);
    if (len != 6) {
        Serial.printf("[%s] Invalid hex color: %s\n", TAG, hex);
        return 0x000000;
    }

    uint32_t result = 0;
    for (size_t i = 0; i < 6; i++) {
        char c = hex[i];
        result <<= 4;
        if (c >= '0' && c <= '9') {
            result |= (c - '0');
        } else if (c >= 'a' && c <= 'f') {
            result |= (c - 'a' + 10);
        } else if (c >= 'A' && c <= 'F') {
            result |= (c - 'A' + 10);
        } else {
            Serial.printf("[%s] Invalid hex digit '%c' in %s\n", TAG, c, hex);
            return 0x000000;
        }
    }

    return result;
}

// -------------------------------------------------------------------
// PrinterState — data key → value, as relayed by the server
// -------------------------------------------------------------------
PrinterState::PrinterState() {
    _mutex = xSemaphoreCreateMutex();
}

PrinterState::~PrinterState() {
    if (_mutex) vSemaphoreDelete(_mutex);
}

void PrinterState::apply(JsonObjectConst values, bool full) {
    // Convert outside the lock so the renderer waits as little as possible
    std::vector<std::pair<String, Value>> updates;
    std::vector<String> removals;
    for (JsonPairConst kv : values) {
        JsonVariantConst v = kv.value();
        Value value;
        if (v.isNull()) {
            removals.push_back(kv.key().c_str());
            continue;
        } else if (v.is<bool>()) {
            value.text = v.as<bool>() ? "Yes" : "No";
        } else if (v.is<float>()) {
            value.isNumber = true;
            value.number = v.as<float>();
        } else if (v.is<const char*>()) {
            value.text = v.as<const char*>();
        } else {
            continue;  // arrays/objects have no display form yet
        }
        updates.emplace_back(kv.key().c_str(), value);
    }

    if (!_mutex || xSemaphoreTake(_mutex, portMAX_DELAY) != pdTRUE) return;
    if (full) _values.clear();
    for (const auto& key : removals) _values.erase(key);
    for (auto& u : updates) _values[u.first] = std::move(u.second);
    xSemaphoreGive(_mutex);
    _version++;
}

static bool endsWith(const String& s, const char* suffix) {
    size_t n = strlen(suffix);
    return s.length() >= n && strcmp(s.c_str() + s.length() - n, suffix) == 0;
}

String PrinterState::resolve(const String& key) const {
    if (key == "moonraker.connected") {
        return _moonrakerConnected ? "Online" : "Offline";
    }

    Value value;
    bool found = false;
    if (_mutex && xSemaphoreTake(_mutex, portMAX_DELAY) == pdTRUE) {
        auto it = _values.find(key);
        if (it != _values.end()) {
            value = it->second;
            found = true;
        }
        xSemaphoreGive(_mutex);
    }

    if (!found) return "--";
    if (!value.isNumber) return value.text;

    char buf[24];
    if (endsWith(key, ".temperature") || endsWith(key, ".target")) {
        snprintf(buf, sizeof(buf), "%.0f°C", value.number);
    } else if (endsWith(key, "progress")) {
        // Klipper reports progress as 0–1
        snprintf(buf, sizeof(buf), "%.1f%%", value.number * 100.0f);
    } else if (value.number == (float)(long)value.number) {
        snprintf(buf, sizeof(buf), "%ld", (long)value.number);
    } else {
        snprintf(buf, sizeof(buf), "%.1f", value.number);
    }
    return String(buf);
}
