#ifndef KLIPPYFACE_CAPTIVE_PORTAL_H
#define KLIPPYFACE_CAPTIVE_PORTAL_H

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <DNSServer.h>
#include "SetupServer.h"

class CaptivePortal {
public:
    CaptivePortal();
    bool begin();
    void tick();
    void stop();
    bool isRunning() const;

private:
    WebServer _server;
    DNSServer _dns;
    SetupServer _setup;
    unsigned long _lastActivity;
    bool _running;
    bool _rebootPending;

    static const unsigned long IDLE_TIMEOUT_MS = 30 * 60 * 1000;

    void touchActivity();
    void handleRoot();
    void handleSave();
    void handleScan();
};

#endif
