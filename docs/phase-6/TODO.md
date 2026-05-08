# Phase 6: GCODE Macro Integration

**Overall Status:** NOT STARTED

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 6.0 | GcodeHandler (enhance) | `comms/GcodeHandler.cpp` | ⬜ Not Started | Parse `display:...` command format. Support set-and-forget and duration-limited overrides. |
| 6.1 | Command format | - | ⬜ Not Started | `RESPOND MSG="display:node=printer_face display=face_oled group=celebration set=party loop=3"` |
| 6.2 | Klipper macro examples | `docs/macros.cfg` | ⬜ Not Started | `DISPLAY_FACE`, `DISPLAY_ALERT`, `DISPLAY_CLEAR`, `PRINT_END` with celebration. |
| 6.3 | `_KLIPPYFACE_STATUS` macro | docs | ⬜ Not Started | Similar to KNOMI's `_KNOMI_STATUS`. Set homing/probing/qgling/heating flags. |
| 6.4 | Data bindings | `engine/DataBinding.h/.cpp` | ⬜ Not Started | Frames can reference Moonraker data: `{type:"temp", value:"hotend"}`, `{type:"progress"}` |
