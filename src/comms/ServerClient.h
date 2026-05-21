#ifndef KLIPPYFACE_SERVER_CLIENT_H
#define KLIPPYFACE_SERVER_CLIENT_H

#include <Arduino.h>
#include <stdint.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

class ServerClient {
public:
    ServerClient();
    ~ServerClient();

    bool begin(const String& host, uint16_t port, bool useTls = false);
    void tick();
    void disconnect();

    void setConfigQueue(QueueHandle_t q) { _configQueue = q; }
    void setConfigVersion(uint32_t version) { _configVersion = version; }
    void reannounce();
    bool isConnected() const { return _connected; }

private:
    WebSocketsClient _ws;
    String _host;
    uint16_t _port;
    bool _useTls = false;
    QueueHandle_t _configQueue = nullptr;
    bool _connected = false;

    unsigned long _lastHeartbeat = 0;
    static const unsigned long HEARTBEAT_INTERVAL = 30000;

    String _nodeId;
    String _friendlyName;
    uint32_t _configVersion = 0;

    static ServerClient* _instance;
    static void onWSEvent(WStype_t type, uint8_t* payload, size_t length);

    void handleWSEvent(WStype_t type, uint8_t* payload, size_t length);
    void sendHello();
    void sendHeartbeat();
    void handleTextMessage(uint8_t* payload, size_t length);
    void triggerConfigFetch();
};

#endif
