# Phase 7: Captive Portal — Design Decisions

## D1: HTTP Server Library

**Decision:** Use built-in ESP32 `WebServer` (not `ESPAsyncWebServer`)

**Rationale:**
- Zero additional PlatformIO dependencies
- The captive portal serves one user at a time; synchronous handling is sufficient
- Avoids known compatibility issues between `ESPAsyncWebServer`/`AsyncTCP` and newer ESP32 Arduino cores
- Simpler code, fewer failure modes

**Trade-off:** Would need to switch to AsyncWebServer if we ever needed to serve multiple simultaneous clients during setup (unlikely).

## D2: AP Security

**Decision:** Open AP, no password

**Rationale:**
- The AP only exists during first-boot setup (a few minutes)
- Adding a password creates friction: the user must find and enter a passphrase on their phone
- The ESP has no display to show a dynamically-generated password
- After configuration, the ESP reboots into STA mode and the AP disappears

## D3: WiFi Validation on Save

**Decision:** Save credentials without testing WiFi connection

**Rationale:**
- Testing the connection would require switching from AP to STA and back, which is complex and error-prone
- If credentials are wrong, the user can GPIO0-reset and reconfigure
- Simpler, more robust implementation

## D4: Idle Timeout

**Decision:** Auto-reboot after 30 minutes of inactivity in setup mode

**Rationale:**
- Prevents abandoned devices from sitting in AP mode indefinitely
- 30 minutes is generous enough for a careful setup
- Timer resets on any HTTP request
- Reboot re-enters setup mode (since NVS is still unprovisioned)

## D5: Provisioned NVS Flag

**Decision:** Explicit `setProvisioned(true)` call before reboot, persisted via `commit()`

**Rationale:**
- The `isProvisioned()` method already exists and reads this flag
- Must commit before reboot (uncommitted NVS writes are lost on restart)
- `Settings::clear()` erases all keys including `provisioned`, so factory reset correctly reverts to setup mode
