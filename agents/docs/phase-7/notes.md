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
