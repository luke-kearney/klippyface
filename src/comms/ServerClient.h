#ifndef KLIPPYFACE_SERVER_CLIENT_H
#define KLIPPYFACE_SERVER_CLIENT_H

#include <Arduino.h>
#include <stdint.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>

class DisplayManager;

// WebSocket to the companion server: config refreshes, plus the printer state,
// Moonraker connection status and display commands the server relays.
class ServerClient {
public:
    ServerClient();
    ~ServerClient();

    bool begin(const String& host, uint16_t port, bool useTls = false);
    void tick();
    void disconnect();

    void setConfigQueue(QueueHandle_t q) { _configQueue = q; }
    void setConfigVersion(uint32_t version) { _configVersion = version; }
    void setDisplayManager(DisplayManager* dm) { _display = dm; }
    void reannounce();
    bool isConnected() const { return _connected; }
    // As last reported by the server (Moonraker up and Klipper ready)
    bool isMoonrakerConnected() const { return _connected && _moonrakerConnected; }

private:
    WebSocketsClient _ws;
    String _host;
    uint16_t _port;
    bool _useTls = false;
    QueueHandle_t _configQueue = nullptr;
    DisplayManager* _display = nullptr;
    bool _connected = false;
    bool _moonrakerConnected = false;
    String _printState;   // last print_stats.state, to fire state:* triggers on change
    // Set by refresh_config / stale config_status; tick() runs one fetch for any
    // number of requests, outside the WebSocket callback.
    bool _fetchPending = false;

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
    void handleState(JsonObjectConst values, bool full);
    void handleDisplayCommand(const JsonDocument& doc);
    void fetchAndQueueConfig();
};

#endif
