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
| ESP32 firmware with FreeRTOS multitasking | ✅ Complete |
| Display driver abstraction (SH1106, SSD1306, ST7789, ILI9341) | ✅ Complete — SH1106 implemented and hardware-verified |
| Real-time Moonraker WebSocket integration | ✅ Complete — Client + state parsing + mock mode + connection monitoring + screen sleep |
| Configurable animations (Groups → Sets → Frames) | ✅ Complete — Element composition model with DataValue bindings for live Moonraker data |
| Klipper GCODE macro integration | ⬜ Planned |
| .NET 10 companion server with SQLite | ✅ Complete — Full CRUD API + per-node config export, see [Phase 3](agents/docs/phase-3/TODO.md) |
| ESP32 server-driven config fetch | ✅ Complete — ESP32 fetches per-node config via HTTP, hot-reloads every 5 min, see [Phase 4](agents/docs/phase-4/TODO.md) |
| Web UI — node/display management | ⬜ Planned |
| Web UI — pixel sprite editor | ⬜ Planned |
| Web UI — animation preview canvas | ⬜ Planned |
| Captive portal first-boot setup | ✅ Complete |
| Multi-node support | ⬜ Planned |

## Current Status

**Phase 1 (ESP32 Core Framework) complete.** PlatformIO + FreeRTOS multitasking. Settings (NVS), WiFi manager, DisplayDriver abstraction, SH1106 driver, animation engine, sprite decoder, renderer, and DisplayManager all implemented and hardware-verified.

**Phase 2 (Moonraker WebSocket Client) complete.** WebSocket client connects to Moonraker `notify_status_update`, parses printer state, and triggers group changes. GCODE `display:...` commands parsed via `GcodeHandler`. Includes mock mode (`esp32dev-mock`) for testing without a printer. Connection monitoring + 30s screen sleep also implemented.

**Phase 3 (Companion Server) complete.** .NET 10 Minimal API with EF Core + SQLite. Full CRUD for all entities. Config export endpoint `GET /api/config/node?mac=...` returns per-node filtered JSON. Builds and curl-verified.

**Phase 4 (ESP32 Config Fetcher) complete.** The hardcoded display config has been replaced with a live config fetched from the companion server. The ESP32 boots showing "Waiting for config...", then calls `GET /api/config/node?mac=...` to retrieve its per-node configuration (displays, drivers, triggers, groups, sprites). Config is hot-reloaded every 5 minutes. Both `esp32dev` and `esp32dev-mock` builds verified.

## Phase Tracking

| Phase | Description | Status | Task List |
|-------|-------------|--------|-----------|
| 1 | ESP32 Core Framework + Single Display | ✅ Complete | [TODO](agents/docs/phase-1/TODO.md) |
| 2 | Moonraker WebSocket Client | ✅ Complete | [TODO](agents/docs/phase-2/TODO.md) |
| 3 | Companion Server — Data Layer | ✅ Complete | [TODO](agents/docs/phase-3/TODO.md) |
| 4 | ESP32 Config Fetcher | ✅ Complete | [TODO](agents/docs/phase-4/TODO.md) |
| 5 | Web UI | ⬜ Not Started | [TODO](agents/docs/phase-5/TODO.md) |
| 6 | GCODE Macro Integration | ⬜ Not Started | [TODO](agents/docs/phase-6/TODO.md) |
| 7 | Captive Portal Setup | ✅ Complete | [TODO](agents/docs/phase-7/TODO.md) |
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
├── server/                  # .NET 10 companion server
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

### Mock Mode (No Printer Required)

For testing without a physical Moonraker instance, use the mock environment. It simulates printer state transitions on a timer:

```bash
# Build with mock mode
pio run -e esp32dev-mock

# Flash
pio run -e esp32dev-mock -t upload

# Monitor — you'll see simulated state cycles
pio device monitor -b 115200
```

Mock state machine: **idle (5s) → printing (15s, rising progress) → complete (3s) → idle → ...**

The OLED will cycle through the corresponding face groups automatically.

## Moonraker Connection

The ESP32 connects to [Moonraker](https://github.com/Arksine/moonraker) via WebSocket at `ws://{host}:{port}/websocket` and subscribes to real-time printer state updates (`notify_status_update`).

### How It Works

```
ESP32 ──ws://host:7125/websocket──→ Moonraker (JSON-RPC)
  │                                    │
  │  Subscribe: printer.objects        │  {"jsonrpc":"2.0",
  │  .subscribe                        │   "method":"printer.objects.subscribe",
  │  (print_stats, extruder,           │   "params":{"objects":
  │   heater_bed)                      │     {"print_stats":null,
  │                                    │      "extruder":null,
  │  Receive: notify_status_update ────┤      "heater_bed":null}}}
  │  → parse print_stats.state         │
  │  → map to trigger string           │  {"jsonrpc":"2.0",
  │    "printing"  → "state:printing"  │   "method":"notify_status_update",
  │    "idle"      → "state:idle"      │   "params":[{"print_stats":
  │    "complete"  → "state:complete"  │     {"state":"printing",
  │    "error"     → "state:error"     │      "progress":0.45},...}]}
  │    "paused"    → "state:paused"    │
  │                                    │
  │  GCODE commands via DISPLAY_FACE ←─┤  RESPOND MSG="display:group=...
  │  → parsed by GcodeHandler          │
  │  → directCommand(group, set)       │
```

### Setting Connection Details

Moonraker host and port are stored in **NVS** (Non-Volatile Storage). The defaults are `192.168.2.21:7125`.

**Option 1: Edit defaults and reflash** (until captive portal is built in Phase 7):

Edit the defaults in `src/config/Settings.cpp`:

```cpp
// Line 62 — change the default IP
String Settings::getMoonrakerHost()  { return readString(KEY_MK_HOST, "192.168.2.21"); }
//                          change this ──────────────^
// Line 66 — change the default port
uint16_t Settings::getMoonrakerPort() {
    ...
    uint16_t port = 7125;  // <-- change here
    ...
}
```

Then rebuild and flash.

**Option 2: Via serial console** (adds a simple command parser — see `comms/GcodeHandler.cpp` for the `display:...` parsing pattern, which will be extended to a `set:host=...` serial command in Phase 7).

### Connection Lifecycle

1. **WiFi connects** → `moonrakerTask` waits for WiFi via `WifiManager::waitForConnection()`
2. **WebSocket connects** → sends `printer.objects.subscribe` JSON-RPC
3. **State updates arrive** → MoonrakerClient parses JSON, publishes `StateEvent` to FreeRTOS queue
4. **DisplayManager.onStateChange()** → fans out to all `AnimationEngine.onTrigger()` → group switch
5. **Disconnect** → auto-reconnect with 5s backoff, re-subscribes on reconnect
6. **Keep-alive** → WebSocket PING every 30s

### Serial Log Output

```
[BOOT] Klippyface Display System v0.2
[WIFI] Connecting to MyNetwork...
[WIFI] Connected, IP: 192.168.2.100
[MOONRAKER] Connecting to ws://192.168.2.21:7125/websocket
[MOONRAKER] Connected
[MOONRAKER] Subscribed to printer objects
[MOONRAKER] State: printing
[MAIN] State: state:printing (progress: 45.2%)
[DISPLAY] Engine triggered: state:printing → printing_faces
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
