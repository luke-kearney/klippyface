#ifndef KLIPPYFACE_WIFI_MANAGER_H
#define KLIPPYFACE_WIFI_MANAGER_H

#include <Arduino.h>
#include <WiFi.h>
#include <freertos/event_groups.h>

class WifiManager {
public:
    WifiManager();
    ~WifiManager();

    void begin(const String& ssid, const String& password);
    void tick();

    bool isConnected() const;
    IPAddress getIP() const;
    String getSSID() const;
    int8_t getRSSI() const;

    EventGroupHandle_t getEventGroup() const;
    bool waitForConnection(TickType_t timeout = portMAX_DELAY);

    static const uint8_t EVENT_CONNECTED    = BIT0;
    static const uint8_t EVENT_DISCONNECTED = BIT1;

private:
    EventGroupHandle_t _eventGroup;
    String _ssid;
    String _password;
    bool _initialized;
    unsigned long _lastReconnectAttempt;

    static void onWiFiEvent(WiFiEvent_t event);
};

#endif
