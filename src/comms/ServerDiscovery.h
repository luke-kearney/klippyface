#ifndef KLIPPYFACE_SERVER_DISCOVERY_H
#define KLIPPYFACE_SERVER_DISCOVERY_H

#include <Arduino.h>
#include <stdint.h>

struct DiscoveredServer {
    String host;     // IPv4 address as text
    uint16_t port = 0;
    bool useTls = false;
    String name;     // advertised host name, for logs
};

// Finds the companion server over mDNS (_klippyface._tcp, see the API
// reference's Discovery section). Blocks for up to ~3 s per lookup, so only
// call it from the server client task.
class ServerDiscovery {
public:
    static bool find(DiscoveredServer& out);

private:
    static bool ensureStarted();
};

#endif
