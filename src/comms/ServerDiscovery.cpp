#include "comms/ServerDiscovery.h"

#include <ESPmDNS.h>
#include <WiFi.h>

#include "config/Settings.h"

static const char* TAG = "DISC";

// klippyface-ddeeff from the last three MAC bytes, so nodes don't clash on .local
static String nodeHostname() {
    String mac = Settings::getNodeMac();
    mac.replace(":", "");
    mac.toLowerCase();
    return "klippyface-" + mac.substring(mac.length() > 6 ? mac.length() - 6 : 0);
}

bool ServerDiscovery::ensureStarted() {
    static bool started = false;
    if (started) return true;

    String hostname = nodeHostname();
    started = MDNS.begin(hostname.c_str());
    if (started) {
        Serial.printf("[%s] mDNS up as %s.local\n", TAG, hostname.c_str());
    } else {
        Serial.printf("[%s] mDNS failed to start\n", TAG);
    }
    return started;
}

bool ServerDiscovery::find(DiscoveredServer& out) {
    if (!WiFi.isConnected() || !ensureStarted()) return false;

    int count = MDNS.queryService("klippyface", "tcp");
    for (int i = 0; i < count; i++) {
        IPAddress ip = MDNS.IP(i);
        if (ip == IPAddress()) continue;

        out.host = ip.toString();
        out.port = MDNS.port(i);
        out.useTls = MDNS.hasTxt(i, "tls") && MDNS.txt(i, "tls") == "1";
        out.name = MDNS.hostname(i);
        Serial.printf("[%s] Found server %s at %s://%s:%u%s\n",
                      TAG, out.name.c_str(), out.useTls ? "wss" : "ws", out.host.c_str(), out.port,
                      count > 1 ? " (first of several)" : "");
        return true;
    }

    Serial.printf("[%s] No server found\n", TAG);
    return false;
}
