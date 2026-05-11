# Phase 1: ESP32 Core Framework + Single Display

**Overall Status:** IN PROGRESS

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 1.0 | Create PlatformIO project | `platformio.ini` | ✅ Done | Board: esp32dev, framework: arduino. Lib deps: Adafruit SH110X, ArduinoJson. Removed bad deps (AsyncTCP-esphome, WebSockets, AsyncWebServer). Removed 16MB partition table (4MB board!), removed PSRAM flags. 2026-05-09 |
| 1.1 | Settings + NVS | `config/Settings.h/.cpp` | ✅ Done | Static class, NVS key-value, factory reset, commit. Verified compile. 2026-05-09 |
| 1.2 | WifiManager | `wifi/WifiManager.h/.cpp` | ✅ Done | EventGroup signalling, auto-reconnect, RSSI. Wired into wifiTask. 2026-05-09 |
| 1.3 | DisplayDriver interface | `display/DisplayDriver.h` | ✅ Done | Pure virtual. Color convention: uint32_t = RGB888 everywhere. 2026-05-09 |
| 1.4 | Sh1106Driver | `display/Sh1106Driver.h/.cpp` | ✅ Done | Wraps Adafruit_SH1106G. I2C, 128×64, 1-bit mono. 2026-05-09 |
| 1.5 | DisplayFactory | `display/DisplayFactory.h/.cpp` | ✅ Done | `createDriver("sh1106", ...)` returns `Sh1106Driver*`. Parses I2C addr from JSON. 2026-05-09 |
| 1.6 | Config data structs | `engine/Config.h/.cpp` | ✅ Done | `Frame`, `Set`, `Group`, `NodeConfig`, `DisplaySlotConfig` structs, `FrameType` enum, hex color parser. 2026-05-09 |
| 1.7 | AnimationEngine | `engine/AnimationEngine.h/.cpp` | ✅ Done | `tick(now)` → `const Frame*`. `configure()`, `onTrigger()`, `switchToGroup()`, `resetToDefault()`. Handles looping (loop_forever, loop_count 0=inf, 1=play-once, N=play-N). Set-level frame_time override. 2026-05-11 |
| 1.8 | Renderer | `display/Renderer.h/.cpp` | ⬜ Not Started | `renderFrame(Frame*, DisplayDriver*)`. Handles text + sprite frame types. |
| 1.9 | Sprite decode | `display/Sprite.h/.cpp` | ✅ Done | `Sprite` struct (width, height, data vector). `decodeBase64Sprite()` — decodes base64 to monochrome bitmap with size validation. 2026-05-11 |
| 1.10 | DisplayManager | `display/DisplayManager.h/.cpp` | ⬜ Not Started | Owns `vector<DisplaySlot>`. Each slot = driver + engine. `onStateChange()` fans out. `tickAll()` renders all. |
| 1.11 | main.cpp | `main.cpp` | ⬜ Not Started | Init hardware. Create tasks: wifi, displayManager. Hardcoded config (1 display, 1 group, 2 frames). |
| 1.12 | Verify | - | ⬜ Not Started | Flash to ESP32. Confirm OLED shows hardcoded animation. |
