<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/banner-dark.png">
    <img src="docs/assets/banner-light.png" alt="Klippyface - give your 3D printer a face" width="100%">
  </picture>
</p>

A multi-node ESP32 display system driven by live Moonraker/Klipper printer data. Replace your static 3D printer status display with animated faces, progress bars, temperature readouts, and custom notifications — all configurable from a web UI.

> ⚠️ Work in Progress  
>
> This project is in a very early stage and is not production-ready yet.  
> Contributions, suggestions, and architectural discussions are welcome while the project is taking shape.


## How It Works

```
┌────────────────┐   WebSocket   ┌──────────────────────┐   WS (+HTTP)   ┌──────────────────┐
│   Moonraker    │ ←────────────→│  Companion Server    │ ←─────────────→│  ESP32 (Node)    │
│  (Klipper API) │  one per      │  (.NET 10 + SQLite)  │  state, config │  display(s)      │
└────────────────┘  server       └──────────┬───────────┘  display cmds  └──────────────────┘
                                            │                        (one per node)
                                      ┌─────┴──────┐
                                      │  Web UI    │
                                      │ (Browser)  │
                                      └────────────┘
```

1. **ESP32** boots, connects to Companion Server via WebSocket at `/api/ws/node/{mac}`, sends `hello` with its `config_version`
2. **Companion Server** checks version — if stale, pushes `refresh_config`; if up-to-date, responds `config_status { up_to_date: true }` — no unnecessary redraw
3. **The server** holds the one connection to Moonraker and relays printer state to each node: only the values that node's faces show, plus the print state that drives triggers
4. **Display engine** selects the right animation group based on printer state: `printing`, `idle`, `paused`, `error`, `complete`
5. **Klipper macros** can push commands directly: `DISPLAY_FACE GROUP=celebration SET=party`
6. **Web UI** provides full visual management — node registry, sprite pixel editor, animation preview, preset scheduling
7. **Admin edits** (displays, groups, animations) automatically bump `LastConfigVersion` and push `refresh_config` to all connected nodes in real-time

## Quick Start

### Firmware (ESP32)

```bash
# Flash to device (classic ESP32; see docs/hardware/mcu.md for S3 board envs)
pio run -e esp32dev -t upload

# View serial console
pio device monitor
```

### Companion Server

```bash
cd server
dotnet run
# → http://localhost:5000
```

### Web UI (Development)

```bash
cd ui
npm install
npm run dev
# → http://localhost:5173 (proxies /api to :5000)
```

### Web UI (Production Build)

```bash
cd ui
npm run build
# → outputs to server/wwwroot/, served by dotnet run
```

## Features

| Feature | Status |
|---------|--------|
| ESP32 firmware with FreeRTOS multitasking | ✅ Done |
| Display drivers — SH1106 (I²C OLED), HX8347D (8-bit parallel TFT) | ✅ Done — hardware-verified, see [`docs/hardware/`](docs/hardware/) |
| Display drivers — ST7789 and GC9A01 round (SPI TFT, PSRAM frame buffer) | 🟨 Builds, awaiting hardware ([#21](https://github.com/luke-kearney/klippyface/issues/21), [#29](https://github.com/luke-kearney/klippyface/issues/29)) |
| ESP32-S3 support | 🟨 Build targets, release binaries and panel drivers for two Waveshare S3 boards; awaiting hardware ([#20](https://github.com/luke-kearney/klippyface/issues/20)) |
| Real-time Moonraker integration | ⚠️ Partial — relayed by the server: print state triggers, live progress/nozzle/bed values, connection monitoring, screen sleep. First extruder only in the editor ([#22](https://github.com/luke-kearney/klippyface/issues/22)) |
| Configurable animations (Groups → Sets → Frames → Elements) | ✅ Done — sprite, text and live data elements, per-frame durations, looping. Richer progress/temperature rendering planned ([#3](https://github.com/luke-kearney/klippyface/issues/3), [#4](https://github.com/luke-kearney/klippyface/issues/4)) |
| Starter faces for every printer state | ✅ Done — imported on first run, or from the Groups page; sized packs for 320×240, 240×320, 240×280 and round 240×240 colour displays ([#32](https://github.com/luke-kearney/klippyface/issues/32)) |
| Klipper GCODE macro integration | ⚠️ Partial — `DISPLAY_FACE` switches group/set, `node=` targets one node; alerts not yet |
| Presets (night mode, schedules) | ⚠️ Partial — editable in the Web UI, not yet applied to nodes ([#2](https://github.com/luke-kearney/klippyface/issues/2)) |
| .NET 10 companion server with SQLite | ✅ Done — full CRUD API + per-node config export |
| WebSocket channel — node online tracking, heartbeat, config push | ✅ Done — persistent WS at `/api/ws/node/{mac}`, hello/heartbeat/refresh protocol |
| Web UI — nodes, displays, state triggers, groups, sets, sprites, presets | ✅ Done — React + TypeScript, edits push to nodes live |
| Web UI — set editor | ✅ Done — drag-to-place elements, filmstrip, onion skin, playback |
| Web UI — pixel sprite editor | ✅ Done — pencil/line/rect/fill/text tools, brush sizes, mirror drawing, undo, image import |
| Web UI — live previews matching the device | ✅ Done |
| Captive portal first-boot setup | ✅ Done |
| Release builds (firmware `.bin`, self-contained server) | ✅ Done — [GitHub Releases](https://github.com/luke-kearney/klippyface/releases) |
| Browser-based firmware flasher | ⬜ Planned ([#24](https://github.com/luke-kearney/klippyface/issues/24)) |
| Multi-node support | ⚠️ Done, untested |

See [open GitHub Issues](https://github.com/luke-kearney/klippyface/issues) for upcoming work and current priorities.

## Architecture

The system has three major components:

| Component | Stack | Purpose |
|-----------|-------|---------|
| **ESP32 firmware** | PlatformIO, Arduino, FreeRTOS | Drives displays, gets printer state from the server, runs animations |
| **Companion server** | .NET 10, EF Core, SQLite | REST API, node config, sprite/group library |
| **Web UI** | React + TypeScript + Vite | Full visual editor for all content |

Hardware compatibility docs are in [`docs/hardware/`](docs/hardware/):
- [Display drivers](docs/hardware/display.md) — confirmed displays, wiring, pinouts, known issues
- [MCU / dev boards](docs/hardware/mcu.md) — tested ESP32 variants, strapping pins, limitations

Detailed architecture docs are in [`docs/architecture/`](docs/architecture/):
- [System overview](docs/architecture/overview.md) — diagrams, data flow, core concepts
- [Firmware](docs/architecture/firmware.md) — FreeRTOS tasks, display driver, animation engine, sprites
- [Server](docs/architecture/server.md) — .NET structure, models, services, Docker
- [Frontend](docs/architecture/frontend.md) — Vite, component tree, routing, preview canvas
- [Data model](docs/architecture/data-model.md) — SQLite schema, entity relationships

### Project Structure

```
klippyface/
├── platformio.ini           # ESP32 build config
├── CONTRIBUTING.md          # Coding conventions, PR workflow, checklist
├── AGENTS.md                # AI agent bootstrap instructions
├── docs/                    # Reference documentation
│   ├── architecture/        # System architecture by domain
│   ├── hardware/            # Confirmed displays, pinouts, bus configs
│   ├── reference/           # API reference, GCODE macros
│   └── decisions/           # Design decision log (ADRs)
├── src/                     # ESP32 firmware (C++)
│   ├── main.cpp             # FreeRTOS task orchestration
│   ├── display/             # Display drivers, renderer, sprite engine
│   ├── engine/              # Animation engine, config, data bindings
│   ├── comms/               # Server WebSocket, config fetcher
│   ├── wifi/                # WiFi manager, captive portal
│   └── config/              # NVS settings storage
├── server/                  # .NET 10 companion server
├── ui/                      # Web UI source (Vite project)
├── docker/
│   └── Dockerfile
└── scripts/
    └── xbm-convert.py
```

## Moonraker Connection

The companion server connects to [Moonraker](https://github.com/Arksine/moonraker) at `ws://{host}:{port}/websocket`. Set the address on the Web UI's **Printer** page (plus an API key if Moonraker doesn't list the server under `trusted_clients`). Nodes never talk to Moonraker; they only need the server's address.

### Connection Lifecycle

1. **Server connects** → `printer.objects.list`, then subscribes to `print_stats`, `virtual_sdcard`, `display_status`, `toolhead`, `heater_bed` and every `extruder*`
2. **Updates arrive** (only changed fields, ~4 per second) → merged into the server's copy of the printer state
3. **Node says hello** → server sends `moonraker_status` and a full `state` with just the keys that node's faces bind to (plus `print_stats.state`), then only changes
4. **Node** fires `state:<print_stats.state>` triggers and redraws data values
5. **`RESPOND MSG="display:…"`** → the server turns it into a `display_cmd` for the named node (or all nodes)
6. **Klipper restarts / Moonraker drops** → nodes get `moonraker_status {connected: false}`; the server resubscribes or reconnects with backoff

### Connection Status Handling

Nodes fire a trigger when a link goes down, highest priority first. Map them to a group on a display to show something:

| Trigger | When |
|---------|------|
| `wifi:disconnected` | Node lost Wi-Fi |
| `server:disconnected` | Node can't reach the companion server |
| `moonraker:disconnected` | Server can't reach Moonraker, or Klipper isn't ready |

The screen sleeps after 5 minutes without a trigger or command.

### Testing Without a Printer

Run the [fake Moonraker](tools/FakeMoonraker/README.md) on your PC and set it as the Moonraker host on the **Printer** page (port 7125):

```bash
dotnet run --project tools/FakeMoonraker -- --profile single --scenario print-loop
```

### Serial Log Output

```
[BOOT] Klippyface Display System v0.2
[WIFI] Connecting to MyNetwork...
[WIFI] Connected, IP: 192.168.2.100
[SRVCLIENT] Connecting to ws://192.168.1.57:5000/api/ws/node/AA:BB:CC:DD:EE:01
[SRVCLIENT] Connected to server
[SRVCLIENT] Sent hello (fw 0.6.0, board esp32dev, config_version: 1)
[SRVCLIENT] Config is up to date — no fetch needed
[SRVCLIENT] Moonraker connected
[SRVCLIENT] Print state: printing
[MAIN] Connection: ONLINE
[ENGINE] Trigger: state:printing → group: printing
```

## Hardware Compatibility

See [`docs/hardware/`](docs/hardware/) for wiring diagrams, bus configs, and
known issues for every display driver and MCU that has been tested with Klippyface.

| Category | Index | Verified |
|----------|-------|----------|
| Display drivers | [`docs/hardware/display.md`](docs/hardware/display.md) | SH1106 (I2C OLED), HX8347D (Parallel 8 TFT); ST7789, GC9A01 (SPI, untested) |
| MCU / dev boards | [`docs/hardware/mcu.md`](docs/hardware/mcu.md) | ESP-WROOM-32 (ESP32 DevKit V1); Waveshare ESP32-S3 LCD 1.69 / 1.28 (build only) |

If you've tested a display or board not listed here, open a PR or issue with
your wiring details and we'll add it.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for coding conventions, git style, and the PR review checklist. All work is tracked in [GitHub Issues](https://github.com/luke-kearney/klippyface/issues) with labels for area, priority, and type.

## License

MIT — see [LICENSE](LICENSE)
