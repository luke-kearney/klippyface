#ifndef KLIPPYFACE_CONFIG_FETCHER_H
#define KLIPPYFACE_CONFIG_FETCHER_H

#include <Arduino.h>

class ConfigFetcher {
public:
    String fetchConfig(const String& host, uint16_t port, const String& mac);

private:
    static const int HTTP_TIMEOUT_MS = 5000;
};

#endif
