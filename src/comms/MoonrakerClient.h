#ifndef KLIPPYFACE_MOONRAKER_CLIENT_H
#define KLIPPYFACE_MOONRAKER_CLIENT_H

#include <Arduino.h>
#include <stdint.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

struct StateEvent {
    char trigger[24];
    float progress;
    float nozzleTemp;
    float bedTemp;
    float nozzleTarget;
    float bedTarget;
    bool  connected;
};

class MoonrakerClient {
public:
    MoonrakerClient();
    ~MoonrakerClient();

    bool begin(const String& host, uint16_t port, bool useTls = false);
    void tick();
    void disconnect();

    void setStateQueue(QueueHandle_t q) { _stateQueue = q; }
    void setGcodeQueue(QueueHandle_t q) { _gcodeQueue = q; }
    bool isConnected() const { return _connected; }

private:
    WebSocketsClient _ws;
    String _host;
    uint16_t _port;
    bool _useTls = false;
    String _originHeader;
    QueueHandle_t _stateQueue = nullptr;
    QueueHandle_t _gcodeQueue = nullptr;
    bool _connected = false;

    unsigned long _lastPing = 0;
    static const unsigned long PING_INTERVAL = 30000;

    char _lastState[24];

    static MoonrakerClient* _instance;
    static void onWSEvent(WStype_t type, uint8_t* payload, size_t length);

    void handleWSEvent(WStype_t type, uint8_t* payload, size_t length);
    void sendSubscribe();
    void handleTextMessage(uint8_t* payload, size_t length);
    void handleStatusUpdate(const JsonDocument& doc);
    void handleGcodeResponse(const String& message);
};

#endif
