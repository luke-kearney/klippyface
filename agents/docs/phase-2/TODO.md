# Phase 2: Moonraker WebSocket Client + State Machine

**Overall Status:** NOT STARTED

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 2.1 | MoonrakerClient | `comms/MoonrakerClient.h/.cpp` | ⬜ Not Started | WebSocket connect, auto-reconnect. Subscribe to `notify_status_update`. |
| 2.2 | State parsing | `comms/MoonrakerClient.cpp` | ⬜ Not Started | Parse print_stats, extruder, heater_bed. Publish `StateEvent` struct to stateQueue. |
| 2.3 | GcodeHandler | `comms/GcodeHandler.h/.cpp` | ⬜ Not Started | Parse `notify_gcode_response`. Look for `display:...` patterns. Publish to commandQueue. |
| 2.4 | Moonraker task | `main.cpp` | ⬜ Not Started | Create `moonrakerTask` on Core 0. Owns WebSocket lifecycle. |
| 2.5 | Hardcoded triggers | `engine/AnimationEngine.cpp` | ⬜ Not Started | Map `state:printing` → group_id, `state:complete` → group_id, etc. |
| 2.6 | Integration test | - | ⬜ Not Started | Flash. Change printer state. Confirm OLED face updates in real time. |
