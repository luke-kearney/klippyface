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

#ifndef MOONRAKER_MOCK

bool MoonrakerClient::begin(const String& host, uint16_t port) {
    _host = host;
    _port = port;

    Serial.printf("[%s] Connecting to ws://%s:%u/websocket\n",
                  TAG, host.c_str(), port);

    _ws.begin(host, port, "/websocket");
    _ws.onEvent(onWSEvent);
    _ws.setReconnectInterval(5000);

    return true;
}

void MoonrakerClient::tick() {
    _ws.loop();

    if (!_connected && WiFi.isConnected()
        && millis() - _lastReconnectAttempt > _reconnectInterval) {
        _lastReconnectAttempt = millis();
        Serial.printf("[%s] Attempting reconnect...\n", TAG);
        _ws.begin(_host, _port, "/websocket");
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
            Serial.printf("[%s] Disconnected\n", TAG);
            break;

        case WStype_CONNECTED:
            _connected = true;
            _lastReconnectAttempt = millis();
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

    float progress    = params0["print_stats"]["progress"].as<float>();
    float nozzleTemp  = params0["extruder"]["temperature"].as<float>();
    float bedTemp     = params0["heater_bed"]["temperature"].as<float>();
    float nozzleTarget = params0["extruder"]["target"].as<float>();
    float bedTarget   = params0["heater_bed"]["target"].as<float>();

    if (trigger[0] != '\0' && _stateQueue) {
        StateEvent event;
        strncpy(event.trigger, trigger, sizeof(event.trigger) - 1);
        event.trigger[sizeof(event.trigger) - 1] = '\0';
        event.progress = progress;
        event.nozzleTemp = nozzleTemp;
        event.bedTemp = bedTemp;
        event.nozzleTarget = nozzleTarget;
        event.bedTarget = bedTarget;

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

#else  /* MOONRAKER_MOCK */

bool MoonrakerClient::begin(const String& host, uint16_t port) {
    Serial.printf("[%s] MOCK MODE — simulating Moonraker at %s:%u\n",
                  TAG, host.c_str(), port);
    _connected = true;
    strncpy(_lastState, "idle", sizeof(_lastState) - 1);
    _lastState[sizeof(_lastState) - 1] = '\0';
    return true;
}

void MoonrakerClient::tick() {
    static enum { MOCK_IDLE, MOCK_PRINTING, MOCK_COMPLETE } mockState = MOCK_IDLE;
    static unsigned long mockStartTime = millis();
    static float mockProgress = 0;

    unsigned long now = millis();
    unsigned long elapsed = now - mockStartTime;

    char newTrigger[24] = "";

    switch (mockState) {
        case MOCK_IDLE:
            if (elapsed > 5000) {
                mockState = MOCK_PRINTING;
                mockStartTime = now;
                mockProgress = 0;
                snprintf(newTrigger, sizeof(newTrigger), "state:printing");
            }
            break;

        case MOCK_PRINTING:
            mockProgress = ((float)(now - mockStartTime) / 15000.0f) * 100.0f;
            if (mockProgress >= 100.0f) {
                mockState = MOCK_COMPLETE;
                mockStartTime = now;
                snprintf(newTrigger, sizeof(newTrigger), "state:complete");
            }
            break;

        case MOCK_COMPLETE:
            if (elapsed > 3000) {
                mockState = MOCK_IDLE;
                mockStartTime = now;
                snprintf(newTrigger, sizeof(newTrigger), "state:idle");
            }
            break;
    }

    if (newTrigger[0] != '\0' && _stateQueue) {
        StateEvent event;
        strncpy(event.trigger, newTrigger, sizeof(event.trigger) - 1);
        event.trigger[sizeof(event.trigger) - 1] = '\0';
        event.progress = mockProgress;
        event.nozzleTemp = (mockState == MOCK_PRINTING) ? 210.0f : 25.0f;
        event.bedTemp = (mockState == MOCK_PRINTING) ? 60.0f : 25.0f;
        event.nozzleTarget = (mockState == MOCK_PRINTING) ? 220.0f : 0.0f;
        event.bedTarget = (mockState == MOCK_PRINTING) ? 65.0f : 0.0f;

        Serial.printf("[%s] MOCK state: %s (progress: %.1f%%)\n",
                      TAG, newTrigger, mockProgress);

        xQueueSend(_stateQueue, &event, 0);
    }
}

void MoonrakerClient::disconnect() {
    _connected = false;
}

#endif /* MOONRAKER_MOCK */
