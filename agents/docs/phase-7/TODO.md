# Phase 7: Captive Portal First-Boot Setup

**Overall Status:** 🟡 IN PROGRESS — Design complete, ready to implement

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 7.0 | Add `setProvisioned()` + GPIO0 factory reset | `config/Settings.h/.cpp`, `main.cpp` | ✅ Done | Added `setProvisioned(bool)` — writes NVS flag + commits. GPIO0 factory reset check runs after `Settings::begin()`: erases NVS + `ESP.restart()`. 2026-05-11 |
| 7.1 | CaptivePortal | `wifi/CaptivePortal.h/.cpp` | ⬜ Not Started | WiFi AP "Klippyface-Setup" (open). DNSServer catch-all → ESP IP. Owns HTTP server. `begin()`, `tick()`, `stop()`. 30-min idle timeout → auto-reboot. |
| 7.2 | SetupServer | `wifi/SetupServer.h/.cpp` | ⬜ Not Started | HTTP routes: `GET /` (config form), `POST /save` (validate + save NVS + reboot), `GET /scan` (WiFi scan JSON). Server-side validation. |
| 7.3 | setup_html.h | `wifi/setup_html.h` | ⬜ Not Started | PROGMEM embedded HTML. WiFi scan button, SSID dropdown/text, password (show/hide), Moonraker host+port, friendly name, save button. JS: fetch scan, POST form, countdown on success. Mobile-first dark theme CSS. |
| 7.4 | Provisioning flow | `main.cpp` | ⬜ Not Started | If `!Settings.isProvisioned()` → start captive portal as a task (Core 0, pri 5) instead of normal boot. |
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
