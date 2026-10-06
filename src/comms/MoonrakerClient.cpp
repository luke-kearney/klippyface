#include "comms/MoonrakerClient.h"
#include <WiFi.h>

static const char* TAG = "MOONRAKER";

MoonrakerClient* MoonrakerClient::_instance = nullptr;

MoonrakerClient::MoonrakerClient() {
    _instance = this;
    _lastState[0] = '\0';
}

MoonrakerClient::~MoonrakerClient() {
    disconnect();
    if (_instance == this) _instance = nullptr;
}

bool MoonrakerClient::begin(const String& host, uint16_t port, bool useTls) {
    _host = host;
    _port = port;
    _useTls = useTls;

    String wsScheme = useTls ? "wss" : "ws";
    String httpScheme = useTls ? "https" : "http";

    Serial.printf("[%s] ESP32 IP: %s\n",
                  TAG, WiFi.localIP().toString().c_str());
    Serial.printf("[%s] Gateway: %s\n",
                  TAG, WiFi.gatewayIP().toString().c_str());
    Serial.printf("[%s] Netmask: %s\n",
                  TAG, WiFi.subnetMask().toString().c_str());

    WiFiClient tcpTest;
    if (tcpTest.connect(host.c_str(), port, 3000)) {
        Serial.printf("[%s] Moonraker %s:%u — TCP reachable ✓\n",
                      TAG, host.c_str(), port);
        tcpTest.stop();
    } else {
        Serial.printf("[%s] Moonraker %s:%u — TCP unreachable ✗\n",
                      TAG, host.c_str(), port);
    }

    Serial.printf("[%s] Connecting to %s://%s:%u/websocket\n",
                  TAG, wsScheme.c_str(), host.c_str(), port);

    if (useTls) {
        _ws.beginSSL(host, port, "/websocket");
    } else {
        _ws.begin(host, port, "/websocket");
    }

    _originHeader = "Origin: " + httpScheme + "://" + host + ":" + String(port);
    _ws.setExtraHeaders(_originHeader.c_str());
    _ws.onEvent(onWSEvent);
    _ws.setReconnectInterval(5000);

    return true;
}

void MoonrakerClient::tick() {
    if (WiFi.isConnected()) {
        _ws.loop();
    }

    if (_connected && millis() - _lastPing > PING_INTERVAL) {
        _ws.sendPing();
        _lastPing = millis();
    }
}

void MoonrakerClient::disconnect() {
    _ws.disconnect();
    _connected = false;
}

void MoonrakerClient::onWSEvent(WStype_t type, uint8_t* payload, size_t length) {
    if (_instance) {
        _instance->handleWSEvent(type, payload, length);
    }
}

void MoonrakerClient::handleWSEvent(WStype_t type, uint8_t* payload, size_t length) {
    switch (type) {
        case WStype_DISCONNECTED:
            _connected = false;
            if (payload && length > 0) {
                Serial.printf("[%s] Disconnected: %s\n", TAG, (const char*)payload);
            } else {
                Serial.printf("[%s] Disconnected\n", TAG);
            }
            break;

        case WStype_CONNECTED:
            _connected = true;
            Serial.printf("[%s] Connected\n", TAG);
            sendSubscribe();
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
            // Library auto-responds with PONG
            break;

        case WStype_PONG:
            break;

        default:
            break;
    }
}

void MoonrakerClient::sendSubscribe() {
    JsonDocument doc;
    doc["jsonrpc"] = "2.0";
    doc["method"] = "printer.objects.subscribe";
    doc["id"] = 1;

    JsonObject params = doc["params"].to<JsonObject>();
    JsonObject objects = params["objects"].to<JsonObject>();
    objects["print_stats"] = nullptr;
    objects["extruder"] = nullptr;
    objects["heater_bed"] = nullptr;

    String output;
    serializeJson(doc, output);

    _ws.sendTXT(output);
    Serial.printf("[%s] Subscribed to printer objects\n", TAG);
}

void MoonrakerClient::handleTextMessage(uint8_t* payload, size_t length) {
    JsonDocument doc;
    DeserializationError error = deserializeJson(doc, (const char*)payload, length);

    if (error) {
        Serial.printf("[%s] JSON parse error: %s\n", TAG, error.c_str());
        return;
    }

    const char* method = doc["method"].as<const char*>();
    if (!method) return;

    if (strcmp(method, "notify_status_update") == 0) {
        handleStatusUpdate(doc);
    } else if (strcmp(method, "notify_gcode_response") == 0) {
        const char* message = doc["params"][0].as<const char*>();
        if (message) {
            handleGcodeResponse(String(message));
        }
    }
}

void MoonrakerClient::handleStatusUpdate(const JsonDocument& doc) {
    JsonVariantConst params0 = doc["params"][0];
    if (params0.isNull()) return;

    const char* newState = params0["print_stats"]["state"].as<const char*>();

    char trigger[24] = "";
    if (newState && strcmp(newState, _lastState) != 0) {
        strncpy(_lastState, newState, sizeof(_lastState) - 1);
        _lastState[sizeof(_lastState) - 1] = '\0';

        snprintf(trigger, sizeof(trigger), "state:%s", newState);
        Serial.printf("[%s] State: %s\n", TAG, newState);
    }

    float progress    = params0["print_stats"]["progress"].as<float>() * 100.0f;
    float nozzleTemp  = params0["extruder"]["temperature"].as<float>();
    float bedTemp     = params0["heater_bed"]["temperature"].as<float>();
    float nozzleTarget = params0["extruder"]["target"].as<float>();
    float bedTarget   = params0["heater_bed"]["target"].as<float>();

    if (_stateQueue) {
        StateEvent event;
        strncpy(event.trigger, trigger, sizeof(event.trigger) - 1);
        event.trigger[sizeof(event.trigger) - 1] = '\0';
        event.progress = progress;
        event.nozzleTemp = nozzleTemp;
        event.bedTemp = bedTemp;
        event.nozzleTarget = nozzleTarget;
        event.bedTarget = bedTarget;
        event.connected = _connected;

        if (xQueueSend(_stateQueue, &event, 0) != pdTRUE) {
            Serial.printf("[%s] State queue full — dropping event\n", TAG);
        }
    }
}

void MoonrakerClient::handleGcodeResponse(const String& message) {
    Serial.printf("[%s] GCODE: %s\n", TAG, message.c_str());

    if (!_gcodeQueue) return;

    struct GcodeMessage {
        char text[128];
    };

    GcodeMessage msg;
    strncpy(msg.text, message.c_str(), sizeof(msg.text) - 1);
    msg.text[sizeof(msg.text) - 1] = '\0';

    if (xQueueSend(_gcodeQueue, &msg, 0) != pdTRUE) {
        Serial.printf("[%s] Gcode queue full — dropping message\n", TAG);
    }
}
