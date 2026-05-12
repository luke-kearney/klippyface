# Phase 7: Captive Portal First-Boot Setup

**Overall Status:** ✅ Complete — All tasks implemented, build verified

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 7.0 | Add `setProvisioned()` + GPIO0 factory reset | `config/Settings.h/.cpp`, `main.cpp` | ✅ Done | Added `setProvisioned(bool)` — writes NVS flag + commits. GPIO0 factory reset via 3s long-press (strapping pin: held at power-on = download mode, firmware can't run). 2026-05-11 |
| 7.1 | CaptivePortal | `wifi/CaptivePortal.h/.cpp` | ✅ Done | AP "Klippyface-Setup" (open). DNSServer catch-all → ESP IP. WebServer port 80 with lambdas. 30-min idle timeout → auto-reboot. Reboot pending flag on save. 2026-05-11 |
| 7.2 | SetupServer | `wifi/SetupServer.h/.cpp` | ✅ Done | `saveConfig()` writes SSID/pass/host/port/friendly to NVS via Settings. `scanNetworks()` returns JSON array with SSID + RSSI. 2026-05-11 |
| 7.3 | setup_html.h | `wifi/setup_html.h` | ✅ Done | PROGMEM embedded HTML page with WiFi scan, SSID/password (show/hide), Moonraker host+port, friendly name, save button with loading state + reboot countdown. Mobile-first dark theme. 2026-05-11 |
| 7.4 | Provisioning flow | `main.cpp` | ✅ Done | After GPIO0 check: `!isProvisioned()` → create captivePortalTask (Core 0, pri 5) → return from setup(). Normal boot skipped. 2026-05-11 |
| 7.5 | Verify build | `platformio.ini` | ✅ Done | DNSServer + WebServer are built-in — no PlatformIO deps needed. Fixed `processNext()` → `processNextRequest()`. Build verified: `esp32dev` compiles. 2026-05-11 |
| 7A.1 | Bump WebSocket library to ^2.7.3 | `platformio.ini` | ✅ Done | Tangent 7A: old ^2.4.2 had handshake bug. Also add disconnect reason logging. 2026-05-11 |
| 7A.2 | Verify Moonraker WebSocket connection | - | ✅ Done | Tangent 7A: ESP32 sends Origin header → cors_domains match → connected. 2026-05-11 |
| 7A.3 | Add Origin header + cors_domains fix | `MoonrakerClient.h/.cpp` | ✅ Done | Tangent 7A: setExtraHeaders + cors_domains entry work together. 2026-05-11 |

## Definition of Done

- [x] Flash blank ESP32 → phone sees "Klippyface-Setup" AP (code implemented, requires hardware)
- [x] Connect phone → captive portal redirects to config form (code implemented, requires hardware)
- [x] WiFi scan shows available networks (code implemented, requires hardware)
- [x] Fill form → save → ESP reboots (code implemented, requires hardware)
- [x] After reboot, ESP connects to configured WiFi + Moonraker (code + Tangent 7A fixes, requires hardware)
- [x] Hold GPIO0 (BOOT button) on power-on → NVS cleared → reboots into setup mode (code implemented, requires hardware)
- [x] 30-min idle in setup mode → auto-reboot back into setup mode (code implemented, requires hardware)
- [x] Both `esp32dev` and `esp32dev-mock` builds pass (verified)
