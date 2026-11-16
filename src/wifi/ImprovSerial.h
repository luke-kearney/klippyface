#ifndef KLIPPYFACE_IMPROV_SERIAL_H
#define KLIPPYFACE_IMPROV_SERIAL_H

#include <Arduino.h>
#include <stdint.h>

// Improv Wi-Fi over serial (https://www.improv-wifi.com/serial/): lets the
// browser flasher send WiFi credentials over USB right after flashing. Runs
// as its own task on every boot; non-Improv bytes on the port are ignored and
// log output carries on around it. On good credentials it saves them, leaves
// the server address alone (blank means discovery) and reboots.
class ImprovSerial {
public:
    static void start();

private:
    static void task(void* pvParameters);
    static void onByte(uint8_t b);
    static void handlePacket(uint8_t type, const uint8_t* data, uint8_t len);
    static void handleRpc(uint8_t command, const uint8_t* data, uint8_t len);
    static void handleWifiSettings(const uint8_t* data, uint8_t len);
    static void sendDeviceInfo();
    static void sendScan();

    static void sendState(uint8_t state);
    static void sendError(uint8_t error);
    static void sendResult(uint8_t command, const String* strings, uint8_t count);
    static void sendPacket(uint8_t type, const uint8_t* data, uint8_t len);

    static bool tryConnect(const String& ssid, const String& password);
};

#endif
