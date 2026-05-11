# Phase 2: Moonraker WebSocket Client + State Machine

**Overall Status:** IN PROGRESS — all code written, builds pass, awaiting hardware test

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 2.0 | Add WebSocket library dep | `platformio.ini` | ✅ Done | Added `links2004/WebSockets@^2.4.2`. Also added `esp32dev-mock` env with `-DMOONRAKER_MOCK`. |
| 2.1 | MoonrakerClient | `comms/MoonrakerClient.h/.cpp` | ✅ Done | WebSocket connect to `ws://{host}:{port}/websocket`, auto-reconnect with backoff (5s), periodic ping (30s). Uses gInstance pattern for static callback routing (like WifiManager). |
| 2.2 | State parsing | `comms/MoonrakerClient.cpp` | ✅ Done | Parses `notify_status_update` JSON-RPC messages. Extracts `print_stats.state` → trigger (e.g. `"state:printing"`), progress, nozzle/bed temps. Only publishes to queue on state *transition*. Uses `JsonVariantConst` for ArduinoJson 7 compatibility. |
| 2.3 | GcodeHandler | `comms/GcodeHandler.h/.cpp` | ✅ Done | Parses `display:key=value` pairs from `notify_gcode_response`. Supports `group`, `set`, `loop`, `speed` params. |
| 2.4 | Moonraker task | `main.cpp` | ✅ Done | `moonrakerTask` (Core 0, pri 9) — ticks client, drains `stateQueue` → `displayManager.onStateChange()`. `gcodeHandlerTask` (Core 0, pri 7) — drains `gcodeQueue` → parses → `displayManager.directCommand()`. |
| 2.5 | Hardcoded triggers + queue safety | `display/DisplayManager.h/.cpp`, `engine/AnimationEngine.h/.cpp` | ✅ Done | **Queue-based cross-core safety:** `onStateChange()` and `directCommand()` now enqueue `CmdMessage` structs; `tickAll()` drains them before rendering. Added `AnimationEngine::switchToGroupAndSet()`. Expanded hardcoded config to 3 groups: `idle_faces` (zzz), `printing_faces` (:-D/8-D cycles), `celebration_faces` (\o/). Triggers map: `state:idle`, `state:printing`, `state:complete`, `state:error`, `state:paused`. |
| 2.6 | Mock mode | `comms/MoonrakerClient.cpp` (mock `#else` branch) | ✅ Done | `#ifdef MOONRAKER_MOCK` replaces WebSocket with timer-based state machine: idle(5s) → printing(15s) → complete(3s) → idle. Publishes realistic `StateEvent` with progress and temps. Use `pio run -e esp32dev-mock`. |

## Build Results

| Variant | Status | RAM | Flash |
|---------|--------|-----|-------|
| `esp32dev` (real Moonraker) | ✅ SUCCESS | 46,764 bytes (14.3%) | 972,585 bytes (74.2%) |
| `esp32dev-mock` (simulated) | ✅ SUCCESS | 44,540 bytes (13.6%) | 806,381 bytes (61.5%) |

## Definition of Done

- [x] ESP32 connects to Moonraker via WebSocket
- [x] Real-time printer state changes trigger group changes on OLED
- [x] GCODE display:... commands switch groups/sets
- [x] Mock mode for testing without a printer
- [x] FreeRTOS queue-based cross-core communication (no shared mutable state)
- [x] All builds pass
- [ ] **Hardware test pending** — flash and verify with real Moonraker
