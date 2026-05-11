# Klippyface Display System

A multi-node ESP32 display system driven by live Moonraker/Klipper printer data. Replace your static 3D printer status display with animated faces, progress bars, temperature readouts, and custom notifications — all configurable from a web UI.

## How It Works

```
┌────────────────┐    WebSocket     ┌──────────────────┐   HTTP/Config  ┌────────────────┐
│   Moonraker    │ ←──────────────→ │  ESP32 (Node)    │ ←───────────── │  Companion     │
│  (Klipper API) │                  │  SH1106 OLED(s)  │                │  Server (.NET) │
└────────────────┘                  └──────────────────┘                └────────────────┘
                                                                               │
                                                                         ┌─────┴──────┐
                                                                         │  Web UI    │
                                                                         │ (Browser)  │
                                                                         └────────────┘
```

1. **ESP32** boots, fetches its per-node config from the Companion Server (display type, animations, triggers)
2. **Moonraker WebSocket** streams real-time printer state to the ESP32
3. **Display engine** selects the right animation group based on printer state: `printing`, `idle`, `paused`, `error`, `complete`
4. **Klipper macros** can push commands directly: `DISPLAY_FACE GROUP=celebration SET=party`
5. **Web UI** provides full visual management — node registry, sprite pixel editor, animation preview, preset scheduling

## Features (Target)

| Feature | Status |
|---------|--------|
| ESP32 firmware with FreeRTOS multitasking | 🟡 In Progress |
| Display driver abstraction (SH1106, SSD1306, ST7789, ILI9341) | 🟡 In Progress — SH1106 implemented |
| Real-time Moonraker WebSocket integration | ⬜ Planned |
| Configurable animations (Groups → Sets → Frames) | 🟡 In Progress — Config structs + AnimationEngine built |
| Klipper GCODE macro integration | ⬜ Planned |
| .NET 10 companion server with SQLite | ⬜ Planned |
| Web UI — node/display management | ⬜ Planned |
| Web UI — pixel sprite editor | ⬜ Planned |
| Web UI — animation preview canvas | ⬜ Planned |
| Captive portal first-boot setup | ⬜ Planned |
| Multi-node support | ⬜ Planned |

## Current Status

**Phase 1 (ESP32 Core Framework) in progress.** PlatformIO build system working, FreeRTOS task skeleton running. Settings (NVS), WiFi manager, DisplayDriver abstraction, and SH1106 driver implemented and hardware-verified (OLED shows text). Config data model structs (Frame, Set, Group, NodeConfig) and hex color parser added. AnimationEngine (per-display state machine with looping, trigger-to-group mapping, and frame timing) implemented. Sprite decoder (base64 → monochrome bitmap with size validation) implemented. Renderer (stateless Frame→display drawing: text, sprite, clear) implemented.

## Phase Tracking

| Phase | Description | Status | Task List |
|-------|-------------|--------|-----------|
| 1 | ESP32 Core Framework + Single Display | 🟡 In Progress | [TODO](agents/docs/phase-1/TODO.md) |
| 2 | Moonraker WebSocket Client | ⬜ Not Started | [TODO](agents/docs/phase-2/TODO.md) |
| 3 | Companion Server — Data Layer | ⬜ Not Started | [TODO](agents/docs/phase-3/TODO.md) |
| 4 | ESP32 Config Fetcher | ⬜ Not Started | [TODO](agents/docs/phase-4/TODO.md) |
| 5 | Web UI | ⬜ Not Started | [TODO](agents/docs/phase-5/TODO.md) |
| 6 | GCODE Macro Integration | ⬜ Not Started | [TODO](agents/docs/phase-6/TODO.md) |
| 7 | Captive Portal Setup | ⬜ Not Started | [TODO](agents/docs/phase-7/TODO.md) |
| 8 | Multi-Node & Polish | ⬜ Not Started | [TODO](agents/docs/phase-8/TODO.md) |

## Project Structure

```
klippyface/
├── platformio.ini           # ESP32 build config
├── src/                     # ESP32 firmware (C++)
│   ├── main.cpp             # FreeRTOS task orchestration
│   ├── display/             # Display drivers, renderer, sprite engine
│   ├── engine/              # Animation engine, config, data bindings
│   ├── comms/               # Moonraker WebSocket, config fetcher, GCODE handler
│   ├── wifi/                # WiFi manager, captive portal
│   └── config/              # NVS settings storage
├── server/                  # .NET 10 companion server (future)
├── agents/                  # Development plan + phase tracking
│   ├── PLAN.md              # Full architecture, API, tasks
│   ├── CONVENTIONS.md       # Coding conventions (firmware)
│   └── docs/                # Phase tracking, design decisions, notes
├── docker/                  # Docker deployment (future)
└── scripts/                 # Utility scripts
```

See [`agents/PLAN.md`](agents/PLAN.md) for the full architecture, data model, API reference, and implementation plan.
See [`agents/CONVENTIONS.md`](agents/CONVENTIONS.md) for firmware coding conventions.

## Getting Started

### Hardware

- ESP32-WROOM-32 dev board
- SH1106 128×64 OLED display (I2C)
- Micro-USB cable for flashing

### Prerequisites

- [PlatformIO](https://platformio.org/) (CLion plugin or VS Code extension or CLI)
- Or: [CLion](https://www.jetbrains.com/clion/) with PlatformIO plugin

### Build & Flash

```bash
# Install dependencies
pio pkg install

# Build
pio run -e esp32dev

# Flash to ESP32
pio run -e esp32dev -t upload

# Monitor serial output
pio device monitor -b 115200
```

## Architecture

The system has three major components:

| Component | Stack | Purpose |
|-----------|-------|---------|
| **ESP32 firmware** | PlatformIO, Arduino, FreeRTOS | Drives displays, connects to Moonraker, runs animations |
| **Companion server** | .NET 10, EF Core, SQLite | REST API, node config, sprite/group library |
| **Web UI** | Vanilla JS | Full visual editor for all content |

For the detailed data model, API contracts, and task architecture, see [`agents/PLAN.md`](agents/PLAN.md).

## License

MIT — see [LICENSE](LICENSE)
