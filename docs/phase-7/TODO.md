# Phase 7: Captive Portal First-Boot Setup (Low Priority)

**Overall Status:** NOT STARTED

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 7.1 | CaptivePortal | `wifi/CaptivePortal.h/.cpp` | ⬜ Not Started | DNSServer: intercept all DNS → redirect to ESP IP. AsyncWebServer on port 80. |
| 7.2 | SetupServer | `wifi/SetupServer.h/.cpp` | ⬜ Not Started | Serve HTML config form. Handle POST. Save to NVS. Reboot. |
| 7.3 | setup_html.h | `wifi/setup_html.h` | ⬜ Not Started | HTML + inline CSS/JS as PROGMEM C string. WiFi scan list, SSID input, password, Moonraker host. |
| 7.4 | Provisioning flow | `main.cpp` | ⬜ Not Started | On boot: if `!Settings.isProvisioned()` → start setup mode (skip everything else). |
| 7.5 | Factory reset | `config/Settings.cpp` | ⬜ Not Started | Hold GPIO0 on boot → clear NVS → reboot into setup mode. |
