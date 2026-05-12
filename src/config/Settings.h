#ifndef KLIPPYFACE_SETTINGS_H
#define KLIPPYFACE_SETTINGS_H

#include <Arduino.h>
#include <nvs_flash.h>
#include <nvs.h>

class Settings {
public:
    static bool begin();
    static bool isProvisioned();
    static void setProvisioned(bool provisioned);

    // WiFi
    static String getWifiSsid();
    static String getWifiPassword();
    static void setWifiCredentials(const String& ssid, const String& password);

    // Moonraker
    static String getMoonrakerHost();
    static uint16_t getMoonrakerPort();
    static bool getMoonrakerUseTls();
    static bool getMoonrakerTlsVerify();
    static void setMoonrakerHost(const String& host, uint16_t port);
    static void setMoonrakerUseTls(bool useTls);
    static void setMoonrakerTlsVerify(bool verify);

    // Companion server
    static String getServerHost();
    static uint16_t getServerPort();
    static bool getServerUseTls();
    static bool getServerTlsVerify();
    static void setServerHost(const String& host, uint16_t port);
    static void setServerUseTls(bool useTls);
    static void setServerTlsVerify(bool verify);

    // Node identity
    static String getNodeMac();
    static void setNodeMac(const String& mac);
    static String getFriendlyName();
    static void setFriendlyName(const String& name);

    // Lifecycle
    static void clear();
    static void commit();

private:
    static nvs_handle_t _handle;
    static bool _ready;

    static String readString(const char* key, const String& fallback);
    static void writeString(const char* key, const String& value);
};

#endif
