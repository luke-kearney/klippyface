#include "comms/ServerClient.h"

#include <WiFi.h>

#include <new>

#include "comms/ConfigFetcher.h"
#include "display/DisplayManager.h"
#include "config/Board.h"
#include "config/Settings.h"
#include "KlippyfaceVersion.h"

static const char* TAG = "SRVCLIENT";

ServerClient* ServerClient::_instance = nullptr;

ServerClient::ServerClient() {
    _instance = this;
}

ServerClient::~ServerClient() {
    disconnect();
    if (_instance == this) _instance = nullptr;
}

bool ServerClient::begin(const String& host, uint16_t port, bool useTls) {
    _host = host;
    _port = port;
    _useTls = useTls;

    _nodeId = Settings::getNodeMac();
    _friendlyName = Settings::getFriendlyName();

    String wsScheme = useTls ? "wss" : "ws";
    String path = "/api/ws/node/" + _nodeId;

    Serial.printf("[%s] Connecting to %s://%s:%u%s\n",
                  TAG, wsScheme.c_str(), host.c_str(), port, path.c_str());

    if (useTls) {
        _ws.beginSSL(host, port, path);
    } else {
        _ws.begin(host, port, path);
    }

    _ws.onEvent(onWSEvent);
    _ws.setReconnectInterval(5000);

    return true;
}

void ServerClient::tick() {
    if (WiFi.isConnected()) {
        _ws.loop();
    }

    if (_fetchPending) {
        _fetchPending = false;
        fetchAndQueueConfig();
    }

    if (_connected && millis() - _lastHeartbeat > HEARTBEAT_INTERVAL) {
        sendHeartbeat();
        _lastHeartbeat = millis();
    }
}

void ServerClient::disconnect() {
    _ws.disconnect();
    _connected = false;
}

void ServerClient::onWSEvent(WStype_t type, uint8_t* payload, size_t length) {
    if (_instance) {
        _instance->handleWSEvent(type, payload, length);
    }
}

void ServerClient::handleWSEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            _connected = false;
            _moonrakerConnected = false;
            if (payload && length > 0) {
                Serial.printf("[%s] Disconnected: %s\n", TAG, (const char*)payload);
            } else {
                Serial.printf("[%s] Disconnected\n", TAG);
            }
            break;

        case WStype_CONNECTED:
            _connected = true;
            Serial.printf("[%s] Connected to server\n", TAG);
            sendHello();
            break;

        case WStype_TEXT:
            handleTextMessage(payload, length);
            break;

        case WStype_BIN:
            break;

        case WStype_ERROR:
            Serial.printf("[%s] WebSocket error\n", TAG);
            break;

        case WStype_PING:
            break;

        case WStype_PONG:
            break;

        default:
            break;
    }
}

void ServerClient::reannounce() {
    if (_connected) {
        sendHello();
    }
}

void ServerClient::sendHello() {
    JsonDocument doc;
    doc["type"] = "hello";
    doc["node_id"] = _nodeId;
    doc["friendly_name"] = _friendlyName;
    doc["config_version"] = _configVersion;
    doc["fw_version"] = KLIPPYFACE_VERSION;
    doc["board"] = BOARD_NAME;

    String output;
    serializeJson(doc, output);
    _ws.sendTXT(output);
    Serial.printf("[%s] Sent hello (fw %s, board %s, config_version: %u)\n",
                  TAG, KLIPPYFACE_VERSION, BOARD_NAME, _configVersion);
}

void ServerClient::sendHeartbeat() {
    JsonDocument doc;
    doc["type"] = "heartbeat";
    doc["heap_free"] = ESP.getFreeHeap();
    doc["uptime_s"] = millis() / 1000;
    doc["rssi"] = WiFi.RSSI();
    doc["display_count"] = 2;

    String output;
    serializeJson(doc, output);
    _ws.sendTXT(output);
}

void ServerClient::handleTextMessage(uint8_t* payload, size_t length) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, (const char*)payload, length);

    if (error) {
        Serial.printf("[%s] JSON parse error: %s\n", TAG, error.c_str());
        return;
    }

    const char* type = doc["type"].as<const char*>();
    if (!type) return;

    if (strcmp(type, "refresh_config") == 0) {
        Serial.printf("[%s] Server requested config refresh\n", TAG);
        _fetchPending = true;
    } else if (strcmp(type, "refresh_library") == 0) {
        Serial.printf("[%s] Server requested library refresh (not yet implemented)\n", TAG);
    } else if (strcmp(type, "state") == 0) {
        handleState(doc["values"].as<JsonObjectConst>(), doc["full"] | false);
    } else if (strcmp(type, "moonraker_status") == 0) {
        _moonrakerConnected = doc["connected"] | false;
        Serial.printf("[%s] Moonraker %s\n", TAG, _moonrakerConnected ? "connected" : "disconnected");
    } else if (strcmp(type, "display_cmd") == 0) {
        handleDisplayCommand(doc);
    } else if (strcmp(type, "config_status") == 0) {
        bool upToDate = doc["up_to_date"].as<bool>();
        if (upToDate) {
            Serial.printf("[%s] Config is up to date — no fetch needed\n", TAG);
        } else {
            Serial.printf("[%s] Config is stale — fetching\n", TAG);
            _fetchPending = true;
        }
    }
}

void ServerClient::handleState(JsonObjectConst values, bool full) {
    if (!_display) return;
    _display->applyState(values, full);

    // klippyface.state (idle, busy, heating, printing, paused, complete, cancelled,
    // error — worked out by the server) drives the state:* triggers. A full
    // snapshot comes after every hello, including the one after a new config is
    // applied, so it fires the trigger again for the freshly configured engines.
    JsonVariantConst state = values["klippyface.state"];
    if (state.is<const char*>()) {
        String next = state.as<const char*>();
        if (full || next != _printerState) {
            _printerState = next;
            Serial.printf("[%s] Printer state: %s\n", TAG, next.c_str());
            _display->onStateChange("state:" + next);
        }
    }
}

void ServerClient::handleDisplayCommand(const JsonDocument& doc) {
    if (!_display) return;
    const char* group = doc["group"] | "";
    if (group[0] == '\0') return;

    const char* set = doc["set"] | "";
    int16_t loop = doc["loop"] | -1;
    Serial.printf("[%s] Display command: group=%s set=%s loop=%d\n", TAG, group, set, loop);
    _display->directCommand(group, set, loop);
}

void ServerClient::fetchAndQueueConfig() {
    if (!_configQueue) {
        Serial.printf("[%s] Config queue not set — skipping fetch\n", TAG);
        return;
    }

    ConfigFetcher fetcher;
    String mac = Settings::getNodeMac();
    String host = Settings::getServerHost();
    uint16_t port = Settings::getServerPort();
    bool svUseTls = Settings::getServerUseTls();
    bool svTlsVerify = Settings::getServerTlsVerify();

    String json = fetcher.fetchConfig(host, port, svUseTls, svTlsVerify, mac);

    if (json.length() == 0) {
        Serial.printf("[%s] Config fetch failed\n", TAG);
        return;
    }

    char* jsonBuf = new (std::nothrow) char[json.length() + 1];
    if (!jsonBuf) {
        Serial.printf("[%s] No memory for %u byte config\n", TAG, (unsigned)json.length());
        return;
    }
    memcpy(jsonBuf, json.c_str(), json.length() + 1);
    json = String();  // free the fetch copy before queueing

    // The newest config wins: evict anything older still waiting.
    while (xQueueSend(_configQueue, &jsonBuf, 0) != pdTRUE) {
        char* stale = nullptr;
        if (xQueueReceive(_configQueue, &stale, 0) == pdTRUE) {
            Serial.printf("[%s] Replacing queued config with newer one\n", TAG);
            delete[] stale;
        }
    }
}
