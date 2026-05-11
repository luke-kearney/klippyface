# Phase 2: Moonraker WebSocket Client + State Machine

**Overall Status:** IN PROGRESS — Tangent 2A (Frame data model refactor) underway

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 2.0 | Add WebSocket library dep | `platformio.ini` | ✅ Done | Added `links2004/WebSockets@^2.4.2`. Also added `esp32dev-mock` env with `-DMOONRAKER_MOCK`. |
| 2.1 | MoonrakerClient | `comms/MoonrakerClient.h/.cpp` | ✅ Done | WebSocket connect to `ws://{host}:{port}/websocket`, auto-reconnect with backoff (5s), periodic ping (30s). Uses gInstance pattern for static callback routing (like WifiManager). |
| 2.2 | State parsing | `comms/MoonrakerClient.cpp` | ✅ Done | Tangent 2A: changed to send on every update (not just transitions) for continuous data binding. Normalizes progress to 0–100. Mock sends every tick for animated progress bar. |
| 2.3 | GcodeHandler | `comms/GcodeHandler.h/.cpp` | ✅ Done | Parses `display:key=value` pairs from `notify_gcode_response`. Supports `group`, `set`, `loop`, `speed` params. |
| 2.4 | Moonraker task | `main.cpp` | ✅ Done | `moonrakerTask` (Core 0, pri 9) — ticks client, drains `stateQueue` → `displayManager.onStateChange()`. `gcodeHandlerTask` (Core 0, pri 7) — drains `gcodeQueue` → parses → `displayManager.directCommand()`. |
| 2.5 | Hardcoded triggers + queue safety | `display/DisplayManager.h/.cpp`, `engine/AnimationEngine.h/.cpp` | ✅ Done | Tangent 2A: rewrote hardcoded config for element-based Frame model; added PrinterState plumbing, `PrinterState _printerState` member, `updateState()` method. |
| 2.6 | Mock mode | `comms/MoonrakerClient.cpp` (mock `#else` branch) | ✅ Done | `#ifdef MOONRAKER_MOCK` replaces WebSocket with timer-based state machine: idle(5s) → printing(15s) → complete(3s) → idle. Publishes realistic `StateEvent` with progress and temps. Use `pio run -e esp32dev-mock`. Tangent 2A: sends every tick for continuous progress animation. |
| 2A.1 | Define new FrameElement + Frame + PrinterState structs | `engine/Config.h/.cpp` | ✅ Done | Tangent 2A: Remove FrameType enum. FrameElement has type (Text/Sprite/DataValue), value, label, color, x, y. New Frame has duration_ms, bg_color, elements vector. PrinterState with resolve(). |
| 2A.2 | Update Renderer for element-based composition | `display/Renderer.h/.cpp` | ✅ Done | Tangent 2A: renderFrame() clears bg_color once, iterates elements, draws each at (x,y). DataValue uses PrinterState::resolve(). |
| 2A.3 | Add PrinterState plumbing through DisplayManager | `display/DisplayManager.h/.cpp` | ✅ Done | Tangent 2A: _printerState member, updateState(). tickAll() passes to renderFrame(). |
| 2A.4 | Send StateEvent on every Moonraker update | `comms/MoonrakerClient.cpp` | ✅ Done | Tangent 2A: Always send (not just transitions). Normalize progress 0-100. Mock sends continuously. |
| 2A.5 | Forward full PrinterState from main.cpp | `main.cpp` | ✅ Done | Tangent 2A: Call displayManager.updateState() on every event. |
| 2A.6 | Rewrite hardcoded config for new Frame model | `display/DisplayManager.cpp` | ⬜ Not Started | Tangent 2A: Convert all Frames to element-based. Add demo data frames (progress bar, temp readout) to printing group. |
| 2A.7 | Update PLAN.md + tracking docs for new data model | `agents/PLAN.md`, `agents/docs/phase-*/TODO.md` | ✅ Done | Tangent 2A: SQL schema, JSON contract, FrameElement Types table, Phase 2 tangents block, downstream phase refs. |
| 2A.8 | Build verification | - | ⬜ Not Started | Tangent 2A: Both esp32dev and esp32dev-mock must compile. |

## Build Results

| Variant | Status | RAM | Flash |
|---------|--------|-----|-------|
| `esp32dev` (real Moonraker) | ✅ SUCCESS | 46,764 bytes (14.3%) | 972,585 bytes (74.2%) |
| `esp32dev-mock` (simulated) | ✅ SUCCESS | 44,540 bytes (13.6%) | 806,381 bytes (61.5%) |

## Definition of Done

### Phase 2 (original)
- [x] ESP32 connects to Moonraker via WebSocket
- [x] Real-time printer state changes trigger group changes on OLED
- [x] GCODE display:... commands switch groups/sets
- [x] Mock mode for testing without a printer
- [x] FreeRTOS queue-based cross-core communication (no shared mutable state)
- [x] All builds pass
- [ ] **Hardware test pending** — flash and verify with real Moonraker

### Tangent 2A: Frame data model refactor
- [ ] `FrameElement` + new `Frame` + `PrinterState` structs defined and compiling
- [ ] All existing face animations render identically after migration
- [ ] `PrinterState::resolve()` returns formatted values for all 6 binding keys
- [ ] Mock mode shows animated progress bar and temperature readout during print cycle
- [ ] Both `esp32dev` and `esp32dev-mock` build clean
