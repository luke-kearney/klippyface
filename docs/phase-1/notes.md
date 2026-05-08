# Phase 1: Implementation Notes

## 2026-05-09: Bootloop fix — partition table + PSRAM flags + vTaskDelete

**Cause of bootloop:**
- `board_build.partitions = default_16MB.csv` — ESP32-WROOM-32 is 4MB, not 16MB. Bootloader panics trying to access non-existent flash.
- `-DBOARD_HAS_PSRAM` and `-mfix-esp32-psram-cache-issue` — WROOM-32 has no PSRAM, these flags can cause instability.
- `vTaskDelete(nullptr)` in setup() — deleting the Arduino loop task can cause unpredictable behaviour.

**Fixes:**
- Removed `board_build.partitions` line (PlatformIO auto-selects correct 4MB table for esp32dev)
- Removed both PSRAM build flags
- Kept `vTaskDelay(portMAX_DELAY)` in loop() instead of vTaskDelete

## 2026-05-09: COM port config (1.0)

Set `upload_port = COM9` and `monitor_port = COM9` for Silicon Labs CP210x USB-UART bridge.

## 2026-05-09: PlatformIO deps fix (1.0)

Removed `ottowinter/AsyncTCP-esphome`, `me-no-dev/ESP Async WebServer`, `links2004/WebSockets` from `platformio.ini`:
- `ottowinter/AsyncTCP-esphome` doesn't exist in PIO registry — likely wrong package name
- Async WebServer and WebSockets aren't needed until Phase 2
- Add back in Phase 2 with verified package names

## 2026-05-09: DisplayDriver interface (1.3)

Color convention for all drivers:
- `uint32_t` is **always RGB888** (8-8-8) in API calls
- Monochrome drivers: any non-zero → white (1), zero → black (0)
- Color drivers: use full 24-bit value (upper 8 bits ignored by 16-bit drivers)

## 2026-05-09: WifiManager (1.2)

Serial log format:
```
[WIFI] Connecting to MyNetwork...
[WIFI] Connected, IP: 192.168.2.100
[WIFI] Disconnected
[WIFI] Reconnecting to MyNetwork...
```

### Design
- WifiManager uses a static instance pointer + Arduino WiFi event handler pattern
- EventGroup (EVENT_CONNECTED / EVENT_DISCONNECTED) allows other tasks to block on WiFi readiness
- Auto-reconnect tick() called every 1s from wifiTask, retries every 10s on disconnect

### Gotchas
- `WiFi.onEvent()` requires a static function — used gInstance pattern to route to instance
- `EVENT_CONNECTED` and `EVENT_DISCONNECTED` must not collide with bits used by other event groups
- WiFi events fire from the WiFi task context, so EventGroup operations are safe (no critical section needed for bits)
- Must call `WiFi.mode(WIFI_STA)` before `WiFi.begin()` or behaviour is undefined

## 2026-05-09: Settings + NVS module (1.1)

Serial log format used:
```
[SETTINGS] Initialized — NVS namespace "klippyface"
[SETTINGS] Provisioned: yes
[SETTINGS] WiFi: MyNetwork (********)
[SETTINGS] Moonraker: 192.168.2.21:7125
[SETTINGS] Node MAC: AA:BB:CC:DD:EE:01
```

### Gotchas
- NVS `open` with `NVS_READWRITE` must happen *after* `nvs_flash_init()` or it silently fails
- Strings in NVS have a max size of ~4000 bytes (way more than we need, but good to know)
- `nvs_commit()` is not automatic — must call explicitly after writes
- If `nvs_flash_init()` returns `ESP_ERR_NVS_NO_FREE_PAGES` or `ESP_ERR_NVS_NEW_VERSION_FOUND`, need to call `nvs_flash_erase()` then retry
