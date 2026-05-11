# Phase 7: Captive Portal First-Boot Setup

**Overall Status:** 🟡 In Progress — Implementation complete, ready for build verification (7.5)

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 7.0 | Add `setProvisioned()` + GPIO0 factory reset | `config/Settings.h/.cpp`, `main.cpp` | ✅ Done | Added `setProvisioned(bool)` — writes NVS flag + commits. GPIO0 factory reset check runs after `Settings::begin()`: erases NVS + `ESP.restart()`. 2026-05-11 |
| 7.1 | CaptivePortal | `wifi/CaptivePortal.h/.cpp` | ✅ Done | AP "Klippyface-Setup" (open). DNSServer catch-all → ESP IP. WebServer port 80 with lambdas. 30-min idle timeout → auto-reboot. Reboot pending flag on save. 2026-05-11 |
| 7.2 | SetupServer | `wifi/SetupServer.h/.cpp` | ✅ Done | `saveConfig()` writes SSID/pass/host/port/friendly to NVS via Settings. `scanNetworks()` returns JSON array with SSID + RSSI. 2026-05-11 |
| 7.3 | setup_html.h | `wifi/setup_html.h` | ✅ Done | PROGMEM embedded HTML page with WiFi scan, SSID/password (show/hide), Moonraker host+port, friendly name, save button with loading state + reboot countdown. Mobile-first dark theme. 2026-05-11 |
| 7.4 | Provisioning flow | `main.cpp` | ✅ Done | After GPIO0 check: `!isProvisioned()` → create captivePortalTask (Core 0, pri 5) → return from setup(). Normal boot skipped. 2026-05-11 |
| 7.5 | Verify build | `platformio.ini` | ⬜ Not Started | DNSServer + WebServer are built into ESP32 Arduino core — no PlatformIO deps needed. Verify both `esp32dev` and `esp32dev-mock` builds compile. |

## Definition of Done

- [ ] Flash blank ESP32 → phone sees "Klippyface-Setup" AP
- [ ] Connect phone → captive portal redirects to config form
- [ ] WiFi scan shows available networks
- [ ] Fill form → save → ESP reboots
- [ ] After reboot, ESP connects to configured WiFi + Moonraker
- [ ] Hold GPIO0 (BOOT button) on power-on → NVS cleared → reboots into setup mode
- [ ] 30-min idle in setup mode → auto-reboot back into setup mode
- [ ] Both `esp32dev` and `esp32dev-mock` builds pass
