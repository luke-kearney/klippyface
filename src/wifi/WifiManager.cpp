#include "WifiManager.h"

static WifiManager* gInstance = nullptr;

static const char* TAG = "WIFI";
static const unsigned long RECONNECT_INTERVAL_MS = 10000;

WifiManager::WifiManager()
    : _eventGroup(nullptr)
    , _initialized(false)
    , _lastReconnectAttempt(0) {
}

WifiManager::~WifiManager() {
    if (_eventGroup) {
        vEventGroupDelete(_eventGroup);
    }
    if (gInstance == this) {
        gInstance = nullptr;
    }
}

void WifiManager::begin(const String& ssid, const String& password) {
    _ssid = ssid;
    _password = password;

    _eventGroup = xEventGroupCreate();

    WiFi.onEvent(onWiFiEvent);

    gInstance = this;
    _initialized = true;

    WiFi.mode(WIFI_STA);
    WiFi.begin(_ssid.c_str(), _password.c_str());

    Serial.printf("[%s] Connecting to %s...\n", TAG, _ssid.c_str());
}

void WifiManager::tick() {
    if (!_initialized) return;

    if (WiFi.status() != WL_CONNECTED) {
        if (_lastReconnectAttempt == 0 ||
            millis() - _lastReconnectAttempt >= RECONNECT_INTERVAL_MS) {
            _lastReconnectAttempt = millis();
            Serial.printf("[%s] Reconnecting to %s...\n", TAG, _ssid.c_str());
            WiFi.reconnect();
        }
    }
}

bool WifiManager::isConnected() const {
    return WiFi.status() == WL_CONNECTED;
}

IPAddress WifiManager::getIP() const {
    return WiFi.localIP();
}

String WifiManager::getSSID() const {
    return WiFi.SSID();
}

int8_t WifiManager::getRSSI() const {
    return WiFi.RSSI();
}

EventGroupHandle_t WifiManager::getEventGroup() const {
    return _eventGroup;
}

bool WifiManager::waitForConnection(TickType_t timeout) {
    if (!_eventGroup) return false;
    EventBits_t bits = xEventGroupWaitBits(
        _eventGroup, EVENT_CONNECTED, pdFALSE, pdFALSE, timeout);
    return (bits & EVENT_CONNECTED) != 0;
}

void WifiManager::onWiFiEvent(WiFiEvent_t event) {
    if (!gInstance) return;

    switch (event) {
        case ARDUINO_EVENT_WIFI_STA_GOT_IP:
            Serial.printf("[%s] Connected, IP: %s\n", TAG,
                          WiFi.localIP().toString().c_str());
            xEventGroupClearBits(gInstance->_eventGroup, EVENT_DISCONNECTED);
            xEventGroupSetBits(gInstance->_eventGroup, EVENT_CONNECTED);
            break;

        case ARDUINO_EVENT_WIFI_STA_DISCONNECTED:
            Serial.printf("[%s] Disconnected\n", TAG);
            xEventGroupClearBits(gInstance->_eventGroup, EVENT_CONNECTED);
            xEventGroupSetBits(gInstance->_eventGroup, EVENT_DISCONNECTED);
            break;

        default:
            break;
    }
}
