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
| Real-time Moonraker WebSocket integration | ✅ Complete — Client + state parsing + mock mode + connection monitoring + screen sleep, see [Phase 2](agents/docs/phase-2/TODO.md) |
| Configurable animations (Groups → Sets → Frames) | ✅ Complete — Element composition model with DataValue bindings for live Moonraker data |
| Klipper GCODE macro integration | ⬜ Planned |
| .NET 10 companion server with SQLite | ⬜ Planned |
| Web UI — node/display management | ⬜ Planned |
| Web UI — pixel sprite editor | ⬜ Planned |
| Web UI — animation preview canvas | ⬜ Planned |
| Captive portal first-boot setup | ⬜ Planned |
| Multi-node support | ⬜ Planned |

## Current Status

**Phase 1 (ESP32 Core Framework) complete.** PlatformIO + FreeRTOS multitasking (wifiTask + displayTask). Settings (NVS), WiFi manager, DisplayDriver abstraction, SH1106 driver, animation engine, sprite decoder, renderer, and DisplayManager all implemented and hardware-verified. OLED shows animated face cycling at ~30fps.

**Phase 2 (Moonraker WebSocket Client) complete.** WebSocket client connects to Moonraker `notify_status_update`, parses printer state (printing/idle/complete/error/paused), and triggers group changes on the OLED. GCODE `display:...` commands parsed via `GcodeHandler`. Includes a **mock mode** (`esp32dev-mock` env) that simulates printer state transitions without a real Moonraker — idle(5s) → printing(15s) → complete(3s) → idle. Both build variants verified. Hardware-tested — a pre-existing crash in `_ws.loop()` (called without WiFi initialized) was found and fixed.

**Tangent 2A (Frame Data Model Refactor) complete.** The original `Frame` model has been refactored from a single atomic renderable to an element composition model (`FrameElement::Text/Sprite/DataValue`). This enables frames with multiple positioned elements (icons, labels, live Moonraker data bindings) on a single canvas. A `PrinterState` struct with `resolve()` provides data binding for progress bars, temperature readouts, and more.

**Tangent 2B (Connection Status Handling + Screen Sleep) complete.** Three new display groups (`wifi_offline`, `moonraker_offline`, `screen_sleep`) provide user feedback when WiFi or Moonraker disconnect. A priority-based connection state monitor in `main.cpp` tracks WiFi/Moonraker status and sends triggers on transitions. The OLED powers off after 30s of idle activity and wakes on any state change or direct command. Idle frames now show `moonraker.connected` DataValue ("Online"/"Offline") at the bottom.

## Phase Tracking

| Phase | Description | Status | Task List |
|-------|-------------|--------|-----------|
| 1 | ESP32 Core Framework + Single Display | ✅ Complete | [TODO](agents/docs/phase-1/TODO.md) |
| 2 | Moonraker WebSocket Client | 🟡 In Progress (Tangents 2A + 2B complete, build verification pending) | [TODO](agents/docs/phase-2/TODO.md) |
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
