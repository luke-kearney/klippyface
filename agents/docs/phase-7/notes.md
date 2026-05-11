# Phase 7: Captive Portal — Implementation Notes

## Library Choice: Built-in WebServer (not AsyncWebServer)

The original PLAN.md specified AsyncWebServer, but the built-in ESP32 `WebServer` + `DNSServer`
libraries are:
- Already included in the ESP32 Arduino core (zero PlatformIO deps)
- Perfectly adequate for a single-user, single-form captive portal
- Synchronous, but that's fine — there's only one client at a time during setup
- Avoids dependency issues with `me-no-dev/AsyncTCP` and newer ESP32 Arduino cores

## AP Configuration

- SSID: `"Klippyface-Setup"`
- Password: none (open AP)
- IP: `192.168.4.1` (ESP32 soft-AP default)
- Purpose: temporary — user connects, configures, reboots. Exists only when `isProvisioned() == false`.

## Idle Timeout

- 30-minute inactivity timer starts when AP comes up
- Reset on any HTTP request
- If no POST `/save` received within 30 min → auto-reboot (re-enters setup mode)
- This prevents the device sitting in AP mode indefinitely if the user abandons setup

## Provisioning Flow Detail

```
setup()
  ├── Serial.begin()
  ├── Settings::begin()
   ├── gpioMonitorTask created (pri 1, Core 0, runs continuously)
  ├── isProvisioned()?
  │     ├── NO  → startCaptivePortal() [creates captivePortalTask, then vTaskSuspend(NULL)]
  │     └── YES → normal boot (WiFi STA, Moonraker, etc.)
  ├── Wire.begin()
  ├── displayManager.begin()
  └── xTaskCreatePinnedToCore() × N
```

## Factory Reset (GPIO0 — Dedicated Monitor Task)

- GPIO0 is the BOOT button on most ESP32 dev boards
- **Strapping pin caveat:** GPIO0 sampled at EN rising determines boot mode.
  Holding it during power-on enters download mode (firmware doesn't run).
- Factory reset uses a dedicated FreeRTOS task (`gpioMonitorTask`, pri 1) that:
  - Runs continuously, checking GPIO0 every 50ms
  - Detects button press **at any time** after boot (not just during `setup()`)
  - On 3s hold: logs event, calls `Settings::clear()`, calls `ESP.restart()`
- Task is created right after `Settings::begin()` — before the provisioning check —
  so it runs in **both** captive portal mode and normal mode
- Flow: power on normally → press and hold BOOT for 3s → NVS cleared → reboot → captive portal
- Short press or press-and-release (<3s): ignored, boot continues normally
- On reboot after reset: `isProvisioned()` returns false → captive portal starts

## Form Validation

- **Client-side (JS):** SSID required, Moonraker host required (non-empty, valid IP-like format), password shown/hidden via toggle
- **Server-side:** Same checks repeated on POST; returns 400 + error text if invalid
- No WiFi connection test during setup — user can GPIO0-reset if credentials are wrong
- After successful save: `Settings::setProvisioned(true)` + `Settings::commit()` + `ESP.restart()`

## Required Settings Methods

Add to `Settings.h/.cpp`:
```cpp
static void setProvisioned(bool provisioned);
```
Implementation writes `nvs_set_u8(KEY_PROVISIONED, provisioned ? 1 : 0)` and calls `commit()`.

## Serial Logging

| Tag | Component | Example |
|-----|-----------|---------|
| `[PORTAL]` | `CaptivePortal` | `[PORTAL] AP started: Klippyface-Setup (192.168.4.1)` |
| `[SETUP]` | `SetupServer` | `[SETUP] POST /save: SSID="MyNetwork" MK_HOST=192.168.2.21` |
| `[BOOT]` | `main.cpp` | `[BOOT] Not provisioned — starting captive portal` |

## Known Issues

### Moonraker WebSocket Connection Fails After Provisioning

**Symptoms (from real hardware log 2026-05-11):**

```
[MOONRAKER] Connecting to ws://192.168.2.21:7125/websocket
[MAIN] Connection: WIFI_OFFLINE                          ← WiFi not ready yet
...
[WIFI] Connecting to Voyager...
[WIFI] Connected, IP: 192.168.1.29
[MAIN] Connection: MOONRAKER_OFFLINE
...
[MOONRAKER] Attempting reconnect...
[MOONRAKER] Disconnected
[MOONRAKER] Attempting reconnect...    (repeats every 5s)
[MOONRAKER] Disconnected
```

**Environment:**
- ESP32 WiFi IP: `192.168.1.29` (subnet 192.168.1.x)
- Moonraker host: `192.168.2.21:7125` (subnet 192.168.2.x)
- Cross-subnet connectivity confirmed: `curl` from a 192.168.1.x machine reaches 192.168.2.21:7125 (TCP handshake succeeds)

**Observed issues:**

1. **`moonrakerClient.begin()` called before WiFi is ready** — The log shows `[MOONRAKER] Connecting to ws://...` at `59.076` but `[WIFI] Connected` at `59.273`. The `waitForConnection()` in `moonrakerTask` should block until WiFi connects, but either:
   - The `WifiManager._eventGroup` may be null (not yet created by `wifiTask`)
   - The WebSocket library's `begin()` starts an async TCP connection before WiFi is up

2. **WebSocket connects but immediately disconnects** — All reconnection attempts show `[MOONRAKER] Disconnected` with no error details. The 5s retry interval suggests the library detects connection failure rather than a timeout.

3. **No auth/API key** — The current `MoonrakerClient::begin()` likely connects without a `X-Api-Key` header or `?token=` query param. Newer Moonraker versions may require authentication.

**Suggested investigations:**
- Check `MoonrakerClient.cpp` for WebSocket header construction
- Add `[MOONRAKER]` log output with the WebSocket disconnect reason code
- Test with `websocat ws://192.168.2.21:7125/websocket` from the PC to verify raw WS connection
- Check if Moonraker requires `api_key` or `token` parameter
- Verify timing: ensure `wifiManager.begin()` runs _before_ `waitForConnection()` checks

### Fix: 2026-05-11 — Three Bugs Identified and Fixed

**Root cause analysis — routing ruled out:**

Netmask `255.255.224.0` (/19) means `192.168.1.x` and `192.168.2.x` are on the **same
subnet** (covers `192.168.0.0` – `192.168.31.255`). No routing needed — this is purely
a code bug.

**Bug 1 — `waitForConnection()` return value ignored:**

`main.cpp:58` — `moonrakerTask` calls `wifiManager.waitForConnection()` but discards
the return value. If `wifiTask` hasn't run yet, the event group is null and
`waitForConnection()` returns `false` immediately. The code proceeds to call
`_ws.begin()` before WiFi's TCP/IP stack is ready.

```
moonrakerTask runs first (race with wifiTask):
  ├── waitForConnection() → false     ← event group not yet created
  ├── (return value IGNORED)
  └── _ws.begin() called              ← async TCP connect on dead stack!

Later, WiFi connects:
  ├── _ws.loop() called — original async connect already abandoned
  └── Manual reconnect fires → _ws.begin() called AGAIN
```

**Fix A:** Replace the single-shot `waitForConnection()` with a retry loop.

**Bug 2 — Manual reconnect fights library's auto-reconnect:**

`MoonrakerClient.cpp:39-44` — `tick()` has manual reconnect logic that calls
`_ws.begin()` every 5 seconds. But `begin()` already calls
`_ws.setReconnectInterval(5000)`, which tells the WebSockets library to handle
reconnection internally. Two reconnect mechanisms call `_ws.begin()` in parallel,
corrupting the library's internal connection state machine.

**Fix B:** Remove the manual reconnect block in `tick()`. The library handles it.

**Bug 3 — No pre-flight diagnostics:**

`MoonrakerClient::begin()` logs the target URL but never logs the ESP32's own IP,
gateway, netmask, or whether the Moonraker host is even TCP-reachable before
starting the WebSocket handshake.

**Fix C:** Log network config + attempt a raw TCP connect test to Moonraker:port
before the WebSocket begins.

**Verification — expected serial output with all fixes:**

```
[WIFI] Connected, IP: 192.168.1.29
[MOONRAKER] ESP32 IP: 192.168.1.29
[MOONRAKER] Gateway: 192.168.1.1
[MOONRAKER] Netmask: 255.255.224.0
[MOONRAKER] Moonraker 192.168.2.21:7125 — TCP reachable ✓
[MOONRAKER] Connecting to ws://192.168.2.21:7125/websocket
[MOONRAKER] Connected
[MOONRAKER] Subscribed to printer objects
[MAIN] Connection: ONLINE
```

### Fix: 2026-05-11 — Round 2: HTTP 403 from Moonraker CORS check

**Discovery:** After Fixes A+B+C, the WebSocket handshake was still failing. The new
disconnect-reason logging revealed:

```
[MOONRAKER] Disconnected: WebSocket handshake failed - HTTP 403
```

**Root cause:** Moonraker's `cors_domains` config rejects WebSocket upgrade requests
that lack a matching `Origin` header. The ESP32's WebSocket library (links2004/WebSockets)
sends no `Origin` header by default.

Browser test confirmed Moonraker's WS endpoint works fine (browser sends proper Origin
from the page's domain). The ESP32 was sending a bare upgrade request → Moonraker 403.

**Fix:**
- Bump WebSockets library from `^2.4.2` to `^2.7.3` (needed newer API)
- Add dynamic `Origin` header via `_ws.setExtraHeaders(...)` set to
  `"Origin: http://<moonraker_host>:<moonraker_port>\r\n"`
- Store header string in `String _originHeader` member (library stores `const char*`
  pointer — must live as long as the client)

**Build issue:** `setExtraHeaders(const char*)` doesn't accept `String&`. Must call
with `.c_str()`:

```cpp
_originHeader = "Origin: http://" + host + ":" + String(port) + "\r\n";
_ws.setExtraHeaders(_originHeader.c_str());
```

**Status:** 🟡 In Progress — compile fixed, awaiting build + upload test.

### Fix: 2026-05-11 — Round 3: Origin header made things worse

**Finding:** Adding `Origin: http://192.168.2.21:7125` changed the error from
`HTTP 403` to `Connection lost`. Even with `*://192.168.2.21:*` added to
`cors_domains` and `192.168.1.29` explicitly listed in `trusted_clients`,
Moonraker still closed the connection.

**Root cause:** Adding an explicit `Origin` header to the WebSocket upgrade request
causes Moonraker to enter its CORS enforcement code path, which rejects the
connection before the `trusted_clients` authorization check is reached. Without
an `Origin` header, Moonraker skips CORS entirely and falls through to
`trusted_clients`, where `192.168.1.29` is allowed.

**Resolution:** Remove the `setExtraHeaders`/`_originHeader` code. Send no
Origin header. Moonraker's `trusted_clients` list handles authorization.

**Status:** ✅ Fix A/B/C (WiFi wait, remove manual reconnect, diagnostics) kept.
Origin header code removed. Awaiting build + upload test.

### Fix: 2026-05-11 — Round 3 retry: Origin header + cors_domains work together

**Finding from testing:**
- **No Origin header on ESP32 + cors_domains `*`** → connects ✓
- **No Origin header on ESP32 + cors_domains specific** → 403 ✗
- This confirms: Moonraker requires an Origin that matches cors_domains for
  WebSocket upgrades. With `trusted_clients` only, 403. With matching
  cors_domains + Origin header, connection accepted.

**Final fix:**
- Add Origin header back on ESP32: `Origin: http://<host>:<port>`
- **Critical: Do NOT append `\r\n` to the header value.** The `WebSocketsClient::setExtraHeaders()`
  function handles line endings internally. Including `\r\n` causes Moonraker to reject the
  connection with "Connection lost" (double line-end corrupts the HTTP upgrade request).
- Store the header string in a `String _originHeader` member so the underlying `const char*`
  pointer stays valid for the library's internal use.
- Keep `*://192.168.2.21:*` in moonraker.conf cors_domains
- Moonraker sees Origin matching cors_domains → allows upgrade → connected.

**Working code (MoonrakerClient.cpp:45-46):**
```cpp
_originHeader = "Origin: http://" + host + ":" + String(port);
_ws.setExtraHeaders(_originHeader.c_str());
```

**Status:** ✅ All Tangent 7A fixes applied. Ready for build + upload.
```
