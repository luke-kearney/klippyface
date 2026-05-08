# Klippyface Display System — Development Plan

> **Project:** Multi-node ESP32 display system driven by Moonraker/Klipper printer data
> **Goal:** Replace hardcoded face sketch with a configurable, animated, multi-device display system
> **Approach:** ESP32 firmware (PlatformIO + Arduino core + FreeRTOS) + Companion server (.NET + SQLite) + Web UI (vanilla JS)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│                    Companion Server (.NET 10 + SQLite)                │
│                                                                      │
│  ┌─────────────────────┐   ┌──────────────────────────────────────┐  │
│  │     NODE REGISTRY    │   │         LIBRARY (shared assets)      │  │
│  │  printer_face        │   │  ┌──────┐  ┌─────┐  ┌──────────┐   │  │
│  │  desk_panel          │   │  │Groups│→│ Sets│→│ Frames   │   │  │
│  │  bedroom_display     │   │  └──────┘  └─────┘  └──────────┘   │  │
│  │  workshop_monitor    │   │  ┌───────────────────────────────┐  │  │
│  └─────────────────────┘   │  │          Sprites               │  │  │
│  ┌─────────────────────┐   │  └───────────────────────────────┘  │  │
│  │      PRESETS         │   └──────────────────────────────────────┘  │
│  │  night_mode          │                                            │
│  │  screensaver         │                                            │
│  └─────────────────────┘                                             │
└──────────────────────────────────┬───────────────────────────────────┘
                                   │ API
       ┌───────────────────────────┼─────────────────────────────┐
       │ per-node config fetch     │ per-node config fetch       │
       ▼                           ▼                             ▼
┌──────────────┐          ┌──────────────┐           ┌──────────────┐
│  Node:        │          │  Node:        │           │  Node:        │
│  printer_face │          │  desk_panel   │           │  bedroom     │
│  ESP32 #1     │          │  ESP32 #2     │           │  ESP32 #3     │
│               │          │               │           │               │
│  ┌──────────┐ │          │  ┌──────────┐ │           │  ┌──────────┐ │
│  │ SH1106   │ │          │  │ ST7789   │ │           │  │ SH1106   │ │
│  │ 128×64   │ │          │  │ 240×240  │ │           │  │ 128×64   │ │
│  │ I2C 0x3C │ │          │  │ SPI      │ │           │  │ I2C 0x3C │ │
│  └──────────┘ │          │  └──────────┘ │           │  └──────────┘ │
│  ┌──────────┐ │          │               │           │               │
│  │ SH1106   │ │          │               │           │               │
│  │ 128×64   │ │          │               │           │               │
│  │ I2C 0x3D │ │          │               │           │               │
│  └──────────┘ │          │               │           │               │
└──────────────┘          └──────────────┘           └──────────────┘
```

---

## Data Flow

```
1. ESP32 boots, reads NVS for saved config (WiFi, node identity)
2. If NOT configured → start Captive Portal AP mode (phone setup)
3. If configured → connect to WiFi
4. ESP32 calls:  GET /api/config/node?mac=AA:BB:CC:DD:EE:01
5. Server returns: node's display hardware config + assignments + required library groups/sprites
6. DisplayManager on ESP32 creates DisplayDriver instances for each physical display
7. DisplayManager creates AnimationEngine per display, each with its own trigger→group mapping
8. ESP32 connects to Moonraker WebSocket for real-time state
9. Moonraker sends: printer state, temperatures, progress, GCODE responses
10. DisplayManager fans out state changes to all AnimationEngines
11. Each engine selects the right group/set/frame based on its triggers
12. Renderer draws frames to each display's driver
13. Klipper macros can send: RESPOND MSG="display:node=printer_face group=celebration set=win"
14. ESP32 re-fetches config from server every 5 minutes (or on-demand via GCODE)
```

---

## Core Concepts

| Term | What it is | Example |
|------|-----------|---------|
| **Node** | One ESP32 device. Identified by MAC. Has friendly name + description. | `printer_face` |
| **Display** | A physical screen attached to a node. Has type, bus config, resolution. | `SH1106 @ 0x3C, 128×64` |
| **Assignment** | Links a display to content: which groups to show for which printer events. | `trigger:printing → group:printing_faces` |
| **Library** | Shared pool of all Groups, Sets, Frames, Sprites. Created once, used by many nodes. | |
| **Group** | A named collection of Sets. Represents a mood/state. | `"printing_faces"`, `"celebration"` |
| **Set** | A sequence of Frames with loop control. | `"blink_cycle"`: [":)", blink sprite]×3 |
| **Frame** | A single renderable element. Has type, value, duration, position. | `{type:"sprite", value:"blink", duration_ms:200}` |
| **Preset** | Named overrides that modify node behavior (time-based or manual). | `night_mode`: dim brightness, swap to quiet groups |

---

## FreeRTOS Task Architecture

Each ESP32 firmware runs multiple independent tasks:

```
main.cpp: setup()
  ├── I2C/SPI init
  ├── NVS config load
  └── xTaskCreatePinnedToCore() × N

┌────────────────────────────────────────────────────────────────┐
│ CORE 0 (protocol / background)     CORE 1 (display / timing)   │
│                                    │                            │
│  wifiTask         (pri 8)          │  displayTask    (pri 10)   │
│  moonrakerTask    (pri 9)          │    ticks all engines       │
│  configFetcherTask(pri 6)          │    renders all displays    │
│  gcodeHandlerTask (pri 7)          │    ~30fps                 │
│  captivePortalTask(pri 5, idle)    │                            │
└────────────────────────────────────────────────────────────────┘
```

### Inter-Task Communication (FreeRTOS Queues)

```
moonrakerTask ──→ [stateQueue]  ──→ displayTask
configFetcherTask ──→ [configQueue] ──→ displayTask
gcodeHandlerTask ──→ [commandQueue] ──→ displayTask
displayTask ──→ [DisplaySlot*] array (internal, no queue needed)
captivePortalTask ──→ [wifiConfigQueue] ──→ (saves to NVS, reboots)
```

Each queue carries a small struct (`StateEvent`, `ConfigUpdate`, `DisplayCommand`).

---

## Data Model (SQLite Schema)

```sql
-- ===== NODES =====
CREATE TABLE nodes (
    id              TEXT PRIMARY KEY,           -- UUID
    mac_address     TEXT NOT NULL UNIQUE,       -- "AA:BB:CC:DD:EE:01"
    friendly_name   TEXT NOT NULL DEFAULT '',
    description     TEXT NOT NULL DEFAULT '',
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Physical displays attached to each node
CREATE TABLE node_displays (
    id              TEXT PRIMARY KEY,
    node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    label           TEXT NOT NULL DEFAULT '',
    driver_type     TEXT NOT NULL,               -- "sh1106", "ssd1306", "st7789", "ili9341"
    bus_type        TEXT NOT NULL DEFAULT 'i2c', -- "i2c" or "spi"
    bus_config      TEXT NOT NULL DEFAULT '{}',  -- {"address":"0x3C"} or {"cs":5,"dc":2,"rst":4}
    width           INTEGER NOT NULL DEFAULT 128,
    height          INTEGER NOT NULL DEFAULT 64,
    rotation        INTEGER NOT NULL DEFAULT 0,
    sort_order      INTEGER NOT NULL DEFAULT 0
);

-- Content assignments per display
CREATE TABLE assignments (
    id              TEXT PRIMARY KEY,
    node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    display_id      TEXT NOT NULL REFERENCES node_displays(id) ON DELETE CASCADE,
    default_group   TEXT NOT NULL DEFAULT 'idle',
    triggers_json   TEXT NOT NULL DEFAULT '{}',  -- {"state:printing":"printing_faces",...}
    active_preset   TEXT REFERENCES presets(id),
    UNIQUE(node_id, display_id)
);

-- ===== LIBRARY (global, shared across nodes) =====
CREATE TABLE groups (
    id          TEXT PRIMARY KEY,                -- "printing_faces", "celebration"
    label       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE sets (
    id          TEXT PRIMARY KEY,
    group_id    TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    loop_count  INTEGER NOT NULL DEFAULT 1,      -- 0 = loop forever
    frame_time  INTEGER NOT NULL DEFAULT 1000    -- default ms per frame
);

CREATE TABLE frames (
    id          TEXT PRIMARY KEY,
    set_id      TEXT NOT NULL REFERENCES sets(id) ON DELETE CASCADE,
    sort_order  INTEGER NOT NULL DEFAULT 0,
    type        TEXT NOT NULL CHECK(type IN ('text','sprite','clear','progress','temp')),
    value       TEXT NOT NULL DEFAULT '',         -- text content, sprite ID, or format string
    duration_ms INTEGER NOT NULL DEFAULT 1000,
    color       TEXT NOT NULL DEFAULT '#FFFFFF',
    bg_color    TEXT NOT NULL DEFAULT '#000000',
    x_offset    INTEGER NOT NULL DEFAULT 0,
    y_offset    INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE sprites (
    id          TEXT PRIMARY KEY,                -- "blink", "heart", "skull"
    label       TEXT NOT NULL,
    width       INTEGER NOT NULL,
    height      INTEGER NOT NULL,
    data_base64 TEXT NOT NULL,                   -- monochrome: 1bpp; color: 16bpp RGB565
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ===== PRESETS =====
CREATE TABLE presets (
    id          TEXT PRIMARY KEY,                -- "night_mode", "screensaver"
    label       TEXT NOT NULL,
    conditions_json TEXT NOT NULL DEFAULT '{}',  -- {"type":"time","start":"22:00","end":"07:00"}
    overrides_json  TEXT NOT NULL DEFAULT '{}',  -- {"dim_brightness":30,"override_groups":{...}}
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Node ↔ preset many-to-many
CREATE TABLE node_presets (
    node_id     TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
    preset_id   TEXT NOT NULL REFERENCES presets(id) ON DELETE CASCADE,
    enabled     INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (node_id, preset_id)
);
```

---

## JSON Contract (Per-Node Config Fetch)

The companion server serializes per-node config. The ESP32 fetches this at boot:

```
GET /api/config/node?mac=AA:BB:CC:DD:EE:01
```

```json
{
  "config_version": 1,
  "node": {
    "id": "printer_face",
    "friendly_name": "Printer Face",
    "displays": [
      {
        "id": "face_oled",
        "label": "Front Face",
        "driver_type": "sh1106",
        "bus": {
          "type": "i2c",
          "address": "0x3C"
        },
        "width": 128,
        "height": 64,
        "rotation": 0
      },
      {
        "id": "info_oled",
        "label": "Info Panel",
        "driver_type": "sh1106",
        "bus": {
          "type": "i2c",
          "address": "0x3D"
        },
        "width": 128,
        "height": 64,
        "rotation": 0
      }
    ],
    "assignments": [
      {
        "display_id": "face_oled",
        "default_group": "idle_faces",
        "triggers": {
          "state:printing":    "printing_faces",
          "state:complete":    "celebration_faces",
          "state:error":       "error_faces",
          "state:idle":        "idle_faces",
          "state:paused":      "paused_faces",
          "state:waiting":     "waiting_faces",
          "macro:print_start": "printing_faces",
          "macro:print_end":   "celebration_faces",
          "gcode:display:override": null
        }
      },
      {
        "display_id": "info_oled",
        "default_group": "stats_idle",
        "triggers": {
          "state:printing": "stats_progress",
          "state:complete": "stats_done",
          "state:idle":     "stats_idle"
        }
      }
    ]
  },
  "library": {
    "groups": {
      "idle_faces": {
        "label": "Idle Faces",
        "sets": [
          {
            "id": "sleepy",
            "label": "Sleepy",
            "loop_count": 0,
            "loop_forever": true,
            "frame_time": 0,
            "frames": [
              { "type": "text", "value": "zzz", "duration_ms": 3000 },
              { "type": "sprite", "value": "blink", "duration_ms": 200 }
            ]
          }
        ]
      },
      "printing_faces": {
        "label": "Printing Faces",
        "sets": [
          {
            "id": "excited",
            "label": "Excited",
            "loop_count": 0,
            "loop_forever": true,
            "frame_time": 600,
            "frames": [
              { "type": "sprite", "value": "face_happy", "duration_ms": 600 },
              { "type": "sprite", "value": "face_excited", "duration_ms": 600 },
              { "type": "sprite", "value": "face_wow", "duration_ms": 600 }
            ]
          }
        ]
      }
    },
    "sprites": {
      "blink": { "width": 16, "height": 16, "data": "base64..." },
      "face_happy": { "width": 64, "height": 64, "data": "base64..." },
      "face_excited": { "width": 64, "height": 64, "data": "base64..." },
      "face_wow": { "width": 64, "height": 64, "data": "base64..." }
    }
  }
}
```

### Frame Types

| Type | `value` behavior |
|------|-----------------|
| `text` | Renders text string. Color from `color` field. Centered on (x_offset, y_offset). |
| `sprite` | Renders named sprite from `sprites` dict at (x_offset, y_offset). |
| `clear` | Clears display (value ignored). |
| `progress` | Draws a progress bar using Moonraker `print_stats.progress`. |
| `temp` | Draws temperature text (nozzle/bed) at position. |

---

## Display Driver Abstraction

The firmware defines a pure virtual interface. **All rendering code talks to this interface.** Swapping displays = changing one concrete class.

```cpp
// display/DisplayDriver.h
class DisplayDriver {
public:
    virtual ~DisplayDriver() = default;

    // Lifecycle
    virtual bool init() = 0;
    virtual void powerSave(bool enable) = 0;

    // Info
    virtual int16_t  width() const = 0;
    virtual int16_t  height() const = 0;
    virtual bool     isColor() const = 0;
    virtual uint8_t  bitDepth() const = 0;

    // Drawing
    virtual void clear(uint32_t color = 0) = 0;
    virtual void drawPixel(int16_t x, int16_t y, uint32_t color) = 0;
    virtual void drawBitmap(int16_t x, int16_t y,
                            const uint8_t* data,
                            int16_t w, int16_t h,
                            uint32_t color) = 0;
    virtual void fillRect(int16_t x, int16_t y,
                          int16_t w, int16_t h,
                          uint32_t color) = 0;

    // Text
    virtual void setCursor(int16_t x, int16_t y) = 0;
    virtual void setTextSize(uint8_t size) = 0;
    virtual void setTextColor(uint32_t color) = 0;
    virtual void print(const char* text) = 0;

    // Flush framebuffer to display
    virtual void show() = 0;
};
```

**Color convention:** `uint32_t` is always RGB888 (8-8-8). Monochrome drivers map any non-zero → white (1), zero → black (0). Color drivers use the full value.

### Driver Registry (Factory)

```cpp
// display/DisplayFactory.h
DisplayDriver* createDriver(const char* type, const JsonObject& busConfig,
                            int16_t width, int16_t height, uint8_t rotation);
```

Adding a new display type = one class implementing `DisplayDriver` + one line in the factory.

### Drivers (initial)

| Driver | Display | Bus | Color | Framebuffer |
|--------|---------|-----|-------|-------------|
| `Sh1106Driver` | SH1106 128×64 | I2C | 1-bit mono | 1 KB (internal) |
| `Ssd1306Driver` | SSD1306 128×64 | I2C | 1-bit mono | 1 KB (internal) |
| `St7789Driver` | ST7789 240×240 (future) | SPI | 16-bit RGB565 | 115 KB (PSRAM) |
| `Ili9341Driver` | ILI9341 320×240 (future) | SPI | 16-bit RGB565 | 150 KB (PSRAM) |

---

## Bitmap Sprite Format

### Monochrome (1-bit, for OLEDs)

- Raw bytes, MSB-first, row-major
- Each row = `ceil(width / 8)` bytes
- Pixel (x,y) is at row `y`, byte `floor(x/8)`, bit `7 - (x % 8)`
- Encoded as **base64** in JSON
- 64×64 sprite = 512 bytes → ~700 chars base64
- 16×16 sprite = 32 bytes → ~44 chars base64

### Color (16-bit, for future TFTs)

- Raw bytes, RGB565 format, row-major
- Each pixel = 2 bytes (5R + 6G + 5B)
- Encoded as base64 in JSON
- 240×240 sprite = 115 KB → large, but acceptable over WiFi

### Web UI Conversion

The pixel editor in the web UI:
- Draw on a `<canvas>` (in native color)
- On save: convert to native bit depth via in-browser canvas API
- Preview rendered as the target display would show it (monochrome dithering, color quantize)

---

## Project Structure

```
klippyface/
├── platformio.ini                      # Build config, lib deps, board
├── PLAN.md                             # This file
│
├── src/                                # ESP32 firmware
│   ├── main.cpp                        # setup() + xTaskCreatePinnedToCore()
│   │
│   ├── display/
│   │   ├── DisplayDriver.h             # Pure virtual interface
│   │   ├── DisplayFactory.h/.cpp       # createDriver() registry
│   │   ├── Sh1106Driver.h/.cpp         # 128×64 monochrome I2C driver
│   │   ├── Ssd1306Driver.h/.cpp        # Alternative I2C driver
│   │   ├── DisplayManager.h/.cpp       # Owns all displays, fans out events
│   │   ├── Renderer.h/.cpp             # Stateless: Frame + DisplayDriver* → draw
│   │   └── Sprite.h/.cpp               # Base64 decode + blit to DisplayDriver
│   │
│   ├── engine/
│   │   ├── Config.h/.cpp               # Data structs: Frame, Set, Group, NodeConfig
│   │   ├── ConfigDeserializer.h/.cpp   # JSON → structs (ArduinoJson)
│   │   ├── AnimationEngine.h/.cpp      # Per-display state machine, tick(), looping
│   │   └── DataBinding.h/.cpp          # Moonraker data injection into frames
│   │
│   ├── comms/
│   │   ├── MoonrakerClient.h/.cpp      # WebSocket client (own task)
│   │   ├── ConfigFetcher.h/.cpp        # HTTP GET /api/config/node?mac=...
│   │   └── GcodeHandler.h/.cpp         # Parse "display:..." RESPOND messages
│   │
│   ├── wifi/
│   │   ├── WifiManager.h/.cpp          # STA mode connection + reconnect
│   │   ├── CaptivePortal.h/.cpp        # (Future) AP mode + DNS spoofing
│   │   └── SetupServer.h/.cpp          # (Future) Config web page on ESP
│   │
│   └── config/
│       └── Settings.h/.cpp             # NVS/EEPROM: WiFi creds, node ID, provisioned flag
│
├── server/                             # .NET 10 Companion Server
│   ├── Klippyface.Server.csproj
│   ├── Program.cs                      # Minimal API, DI, CORS, static files
│   ├── Data/
│   │   ├── AppDbContext.cs             # EF Core + SQLite
│   │   └── Migrations/
│   ├── Models/
│   │   ├── Node.cs
│   │   ├── NodeDisplay.cs
│   │   ├── Assignment.cs
│   │   ├── Group.cs
│   │   ├── Set.cs
│   │   ├── Frame.cs
│   │   ├── Sprite.cs
│   │   └── Preset.cs
│   ├── Api/
│   │   ├── ConfigApi.cs               # GET /api/config/node?mac=...
│   │   ├── NodesApi.cs                # CRUD nodes + displays + assignments
│   │   ├── LibraryApi.cs              # CRUD groups/sets/frames
│   │   ├── SpritesApi.cs              # CRUD sprites + PNG import
│   │   └── PresetsApi.cs              # CRUD presets
│   ├── Services/
│   │   ├── ConfigExportService.cs     # Assemble per-node config JSON
│   │   ├── SpriteConversionService.cs # PNG → XBM / PNG → RGB565
│   │   └── NodeStatusService.cs       # Track online/offline, last seen
│   └── wwwroot/                       # Web UI static files
│       ├── index.html
│       ├── css/style.css
│       └── js/
│           ├── app.js
│           ├── api.js
│           ├── components/
│           │   ├── node-list.js
│           │   ├── node-editor.js
│           │   ├── group-list.js
│           │   ├── group-editor.js
│           │   ├── set-editor.js
│           │   ├── frame-editor.js
│           │   ├── sprite-editor.js
│           │   ├── preview-canvas.js
│           │   ├── assignment-editor.js
│           │   └── preset-editor.js
│           └── utils.js
│
├── docker/
│   └── Dockerfile                     # Multi-stage .NET build
│
├── scripts/
│   └── xbm-convert.py                 # Image → XBM/base64 utility
│
└── docs/
    ├── phase-1/
    │   ├── TODO.md                    # Task-by-task status tracking
    │   ├── decisions.md               # Design decisions rationale
    │   └── notes.md                   # Implementation notes, gotchas, logs
    ├── phase-2/
    │   ├── TODO.md
    │   ├── decisions.md
    │   └── notes.md
    ├── phase-3/
    │   ├── TODO.md
    │   ├── decisions.md
    │   └── notes.md
    ├── phase-4/
    │   ├── TODO.md
    │   ├── decisions.md
    │   └── notes.md
    ├── phase-5/
    │   ├── TODO.md
    │   ├── decisions.md
    │   └── notes.md
    ├── phase-6/
    │   ├── TODO.md
    │   ├── decisions.md
    │   └── notes.md
    ├── phase-7/
    │   ├── TODO.md
    │   ├── decisions.md
    │   └── notes.md
    └── phase-8/
        ├── TODO.md
        ├── decisions.md
        └── notes.md
```

---

## Implementation Phases

---

### Phase 1: ESP32 Core Framework + Single Display

> **Goal:** PlatformIO project, DisplayDriver abstraction, DisplayManager, basic animation engine, single OLED working with hardcoded config.

| # | Task | Files | Key detail |
|---|------|-------|------------|
| 1.0 | Create PlatformIO project | `platformio.ini` | Board: esp32dev, framework: arduino. Add lib deps: Adafruit SH110X, ArduinoJson. CLion setup. |
| 1.1 | Settings + NVS | `config/Settings.h/.cpp` | Load/save WiFi creds, node identity. `isProvisioned()` flag. |
| 1.2 | WifiManager | `wifi/WifiManager.h/.cpp` | Connect to STA, auto-reconnect. Report status via FreeRTOS event group. |
| 1.3 | DisplayDriver interface | `display/DisplayDriver.h` | Pure virtual. All methods documented. |
| 1.4 | Sh1106Driver | `display/Sh1106Driver.h/.cpp` | Wraps Adafruit_SH1106G. Implements all DisplayDriver methods. |
| 1.5 | DisplayFactory | `display/DisplayFactory.h/.cpp` | `createDriver("sh1106", ...)` returns `Sh1106Driver*`. |
| 1.6 | Config data structs | `engine/Config.h/.cpp` | `Frame`, `Set`, `Group`, `NodeConfig`, `DisplaySlotConfig` structs. |
| 1.7 | AnimationEngine | `engine/AnimationEngine.h/.cpp` | `tick(now)` → returns current `Frame*`. Handles looping. Listens for state changes. |
| 1.8 | Renderer | `display/Renderer.h/.cpp` | `renderFrame(Frame*, DisplayDriver*)`. Handles text + sprite frame types. |
| 1.9 | Sprite decode | `display/Sprite.h/.cpp` | Base64 → raw bitmap. Store in map by ID. |
| 1.10 | DisplayManager | `display/DisplayManager.h/.cpp` | Owns `vector<DisplaySlot>`. Each slot = driver + engine. `onStateChange()` fans out. `tickAll()` renders all. |
| 1.11 | main.cpp | `main.cpp` | Init hardware. Create tasks: wifi, displayManager. Hardcoded config (1 display, 1 group, 2 frames). |
| 1.12 | Verify | - | Flash to ESP32. Confirm OLED shows hardcoded animation. |

**Definition of done:** ESP32 boots, connects to WiFi, single OLED shows a hardcoded animated face. DisplayDriver abstraction works — you could swap to a different driver with one line change.

**Agent tracking:** See `docs/phase-1/TODO.md` for task status.

---

### Phase 2: Moonraker WebSocket Client + State Machine

> **Goal:** ESP32 connects to Moonraker via WebSocket, receives real-time printer state, triggers group changes on displays.

| # | Task | Files | Key detail |
|---|------|-------|------------|
| 2.1 | MoonrakerClient | `comms/MoonrakerClient.h/.cpp` | WebSocket connect, auto-reconnect. Subscribe to `notify_status_update`. |
| 2.2 | State parsing | `comms/MoonrakerClient.cpp` | Parse print_stats, extruder, heater_bed. Publish `StateEvent` struct to stateQueue. |
| 2.3 | GcodeHandler | `comms/GcodeHandler.h/.cpp` | Parse `notify_gcode_response`. Look for `display:...` patterns. Publish to commandQueue. |
| 2.4 | Moonraker task | `main.cpp` | Create `moonrakerTask` on Core 0. Owns WebSocket lifecycle. |
| 2.5 | Hardcoded triggers | `engine/AnimationEngine.cpp` | Map `state:printing` → group_id, `state:complete` → group_id, etc. |
| 2.6 | Integration test | - | Flash. Change printer state. Confirm OLED face updates in real time. |

**Definition of done:** Printer starts printing → OLED shows printing face. Print completes → OLED switches to complete face. No polling — all WebSocket driven.

**Agent tracking:** See `docs/phase-2/TODO.md` for task status.

---

### Phase 3: Companion Server — Data Layer + Config API

> **Goal:** .NET 10 minimal API with EF Core + SQLite. Full CRUD for all entities. Per-node config export.

| # | Task | Files | Key detail |
|---|------|-------|------------|
| 3.0 | Scaffold .NET project | `server/Klippyface.Server.csproj`, `Program.cs` | Minimal API + EF Core SQLite. |
| 3.1 | EF models | `server/Models/*.cs` | All 8 entities with navigation properties. |
| 3.2 | DbContext | `server/Data/AppDbContext.cs` | Auto-migrate at startup. Seed default node + data. |
| 3.3 | Nodes API | `server/Api/NodesApi.cs` | CRUD. Register node by MAC. |
| 3.4 | Displays API | within NodesApi or separate | CRUD node_displays within a node. |
| 3.5 | Assignments API | within NodesApi or separate | CRUD assignments per display per node. |
| 3.6 | Library API | `server/Api/LibraryApi.cs` | CRUD groups/sets/frames. |
| 3.7 | Sprites API | `server/Api/SpritesApi.cs` | CRUD. PNG upload endpoint that converts to native format. |
| 3.8 | Presets API | `server/Api/PresetsApi.cs` | CRUD. |
| 3.9 | Config export | `server/Api/ConfigApi.cs` | `GET /api/config/node?mac=...` — the endpoint ESP32 calls. Assembles per-node JSON. |
| 3.10 | ConfigExportService | `server/Services/ConfigExportService.cs` | Walks EF entities, constructs filtered JSON. Only includes groups/sprites this node uses. |

**Definition of done:** `curl "http://localhost:5000/api/config/node?mac=AA:BB:CC:DD:EE:01"` returns valid per-node JSON. All CRUD works against SQLite.

**Agent tracking:** See `docs/phase-3/TODO.md` for task status.

---

### Phase 4: ESP32 Config Fetcher

> **Goal:** ESP32 fetches its config from the companion server instead of hardcoded data.

| # | Task | Files | Key detail |
|---|------|-------|------------|
| 4.1 | ConfigFetcher | `comms/ConfigFetcher.h/.cpp` | HTTP GET config endpoint. Parse JSON with ArduinoJson. |
| 4.2 | ConfigDeserializer | `engine/ConfigDeserializer.h/.cpp` | Walk JSON tree. Allocate structs. Create DisplayDriver instances via factory. |
| 4.3 | Sprite decode | `display/Sprite.cpp` (expand) | Decode base64 from config JSON. |
| 4.4 | Dynamic DisplayManager init | `display/DisplayManager.cpp` | Re-init on config update. Supports hot-reload. |
| 4.5 | Config fetcher task | `main.cpp` | Fetch at boot + every 5 minutes. Publish to configQueue. |
| 4.6 | Fallback | `engine/ConfigDeserializer.cpp` | If server is unreachable, keep last known config. On first boot without server → fallback to minimal hardcoded config. |

**Definition of done:** ESP32 boots, fetches its per-node config from server, creates the right displays with the right content. Changing config on the server updates the ESP32 within 5 minutes.

**Agent tracking:** See `docs/phase-4/TODO.md` for task status.

---

### Phase 5: Web UI

> **Goal:** Vanilla JS single-page app for managing nodes, library, and presets. Includes pixel editor + OLED preview.

| # | Task | Files | Key detail |
|---|------|-------|------------|
| 5.0 | Scaffold HTML + CSS | `wwwroot/index.html`, `wwwroot/css/style.css` | Dark theme. Sidebar + main panel layout. |
| 5.1 | API client | `wwwroot/js/api.js` | Fetch wrapper. All endpoints. Error handling. |
| 5.2 | Node list | `wwwroot/js/components/node-list.js` | Cards showing MAC, name, online/offline, description. |
| 5.3 | Node editor | `wwwroot/js/components/node-editor.js` | Edit name, description. Add/configure displays (type, bus, pins, resolution). |
| 5.4 | Display editor | within node-editor | Per-display: driver type dropdown, bus config (i2c address or SPI pins), resolution, rotation. |
| 5.5 | Assignment editor | `wwwroot/js/components/assignment-editor.js` | Per-display: map triggers → groups. Default group picker. |
| 5.6 | Group list | `wwwroot/js/components/group-list.js` | Library section. List of groups. |
| 5.7 | Group editor | `wwwroot/js/components/group-editor.js` | Sets list. Add/reorder/delete sets. |
| 5.8 | Set editor | `wwwroot/js/components/set-editor.js` | Frame list. Loop count, frame time. Add/reorder/delete frames. |
| 5.9 | Frame editor | `wwwroot/js/components/frame-editor.js` | Type dropdown, value input, color picker, duration slider, x/y offset. |
| 5.10 | Sprite editor | `wwwroot/js/components/sprite-editor.js` | Pixel grid canvas. Click to toggle. Grid size (16/32/64/128). Import PNG. Export. |
| 5.11 | Preview canvas | `wwwroot/js/components/preview-canvas.js` | **128×64 OLED simulation**. Renders current set's frames in sequence. Play/pause, speed control. |
| 5.12 | Preset editor | `wwwroot/js/components/preset-editor.js` | Create presets. Conditions (time, manual). Overrides (dim, group swaps). |
| 5.13 | App controller | `wwwroot/js/app.js` | Client-side routing. State management. Unsaved changes indicator. |

**Definition of done:** Full CRUD for everything. Create a face in the sprite editor, assign it to a set, preview the animation, assign the group to a node, save → ESP32 shows it.

**Agent tracking:** See `docs/phase-5/TODO.md` for task status.

---

### Phase 6: GCODE Macro Integration

> **Goal:** Klipper macros can command any display on any node in real-time.

| # | Task | Files | Key detail |
|---|------|-------|------------|
| 6.0 | GcodeHandler (already started in 2.3) | `comms/GcodeHandler.cpp` | Parse `display:...` command format. Support set-and-forget and duration-limited overrides. |
| 6.1 | Command format | - | `RESPOND MSG="display:node=printer_face display=face_oled group=celebration set=party loop=3"` |
| 6.2 | Klipper macro examples | `docs/macros.cfg` | `DISPLAY_FACE`, `DISPLAY_ALERT`, `DISPLAY_CLEAR`, `PRINT_END` with celebration. |
| 6.3 | `_KLIPPYFACE_STATUS` macro | docs | Similar to KNOMI's `_KNOMI_STATUS`. Set homing/probing/qgling/heating flags for display binding. |
| 6.4 | Data bindings | `engine/DataBinding.h/.cpp` | Frames can reference Moonraker data: `{type:"temp", value:"hotend"}`, `{type:"progress"}` |

**Definition of done:** A Klipper macro `DISPLAY_FACE GROUP=celebration SET=party` changes the face instantly. Progress bars render correctly during prints.

**Agent tracking:** See `docs/phase-6/TODO.md` for task status.

---

### Phase 7: Captive Portal First-Boot Setup (Low Priority)

> **Goal:** Flash a blank ESP32 → connect phone to "Klippyface-Setup" AP → configure WiFi + Moonraker IP → reboot into normal mode.

| # | Task | Files | Key detail |
|---|------|-------|------------|
| 7.1 | CaptivePortal | `wifi/CaptivePortal.h/.cpp` | DNSServer: intercept all DNS → redirect to ESP IP. AsyncWebServer on port 80. |
| 7.2 | SetupServer | `wifi/SetupServer.h/.cpp` | Serve HTML config form. Handle POST. Save to NVS. Reboot. |
| 7.3 | setup_html.h | `wifi/setup_html.h` | HTML + inline CSS/JS as PROGMEM C string. WiFi scan list, SSID input, password, Moonraker host. |
| 7.4 | Provisioning flow | `main.cpp` | On boot: if `!Settings.isProvisioned()` → start setup mode (skip everything else). |
| 7.5 | Factory reset | `config/Settings.cpp` | Hold GPIO0 on boot → clear NVS → reboot into setup mode. |

**Definition of done:** Flash blank ESP32. Phone connects to AP. Config page appears via captive portal. Fill form → reboot → ESP32 runs normally with Moonraker + Companion server.

**Agent tracking:** See `docs/phase-7/TODO.md` for task status.

---

### Phase 8: Multi-Node & Polish (Low Priority)

> **Goal:** Multiple ESP32s in the house. Polish, presets, edge case hardening.

| # | Task | Files | Key detail |
|---|------|-------|------------|
| 8.1 | Node online/offline tracking | `server/Services/NodeStatusService.cs` | Heartbeat endpoint. Show last seen on web UI. Alert on disconnect. |
| 8.2 | Preset engine | `engine/AnimationEngine.cpp` + server | Time-based presets. Web UI toggle. |
| 8.3 | Progress bar frame | `display/Renderer.cpp` | New frame type. Draws bar using Moonraker progress. |
| 8.4 | Temperature frame | `display/Renderer.cpp` | New frame type. Shows hotend/bed temp. |
| 8.5 | Error handling | All | WiFi disconnect, Moonraker down, server down, corrupt config — graceful fallbacks. |
| 8.6 | Performance | All | Heap profiling. Frame timing consistency. |

**Definition of done:** Multiple ESP32s deployed and managed from a single web UI. Time-based presets work. Progress bars and temperature frames render correctly. Graceful fallbacks for all disconnect scenarios.

**Agent tracking:** See `docs/phase-8/TODO.md` for task status.

---

## Companion Server API Reference

### Node Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/api/nodes` | List all nodes |
| POST   | `/api/nodes` | Register new node |
| GET    | `/api/nodes/{id}` | Get node + displays + assignments |
| PUT    | `/api/nodes/{id}` | Update node |
| DELETE | `/api/nodes/{id}` | Delete node + displays + assignments |
| GET    | `/api/nodes/{id}/displays` | List displays on node |
| POST   | `/api/nodes/{id}/displays` | Add display to node |
| PUT    | `/api/nodes/{id}/displays/{did}` | Update display config |
| DELETE | `/api/nodes/{id}/displays/{did}` | Remove display |
| PUT    | `/api/nodes/{id}/displays/{did}/assignment` | Set assignment (triggers + default group) |

### Config Endpoint

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/api/config/node?mac={mac}` | **Main endpoint ESP32 calls.** Returns per-node config JSON. |
| GET    | `/api/config/library` | Returns full library (for web UI preview/edit) |

### Library Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/api/groups` | List all groups |
| POST   | `/api/groups` | Create group |
| GET    | `/api/groups/{id}` | Get group with sets |
| PUT    | `/api/groups/{id}` | Update group |
| DELETE | `/api/groups/{id}` | Delete group + cascade |
| GET    | `/api/groups/{gid}/sets` | List sets in group |
| POST   | `/api/groups/{gid}/sets` | Create set |
| PUT    | `/api/sets/{sid}` | Update set |
| DELETE | `/api/sets/{sid}` | Delete set + frames |
| GET    | `/api/sets/{sid}/frames` | List frames |
| POST   | `/api/sets/{sid}/frames` | Create frame |
| PUT    | `/api/frames/{fid}` | Update frame |
| DELETE | `/api/frames/{fid}` | Delete frame |
| PUT    | `/api/sets/{sid}/frames/reorder` | Reorder frames (send array of IDs) |

### Sprite Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/api/sprites` | List all sprites |
| POST   | `/api/sprites` | Create (JSON + base64, or multipart PNG upload) |
| GET    | `/api/sprites/{id}` | Get sprite with base64 data |
| PUT    | `/api/sprites/{id}` | Update sprite |
| DELETE | `/api/sprites/{id}` | Delete sprite |
| GET    | `/api/sprites/{id}/preview` | Render as PNG for browser preview |

### Preset Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET    | `/api/presets` | List presets |
| POST   | `/api/presets` | Create preset |
| GET    | `/api/presets/{id}` | Get preset |
| PUT    | `/api/presets/{id}` | Update preset |
| DELETE | `/api/presets/{id}` | Delete preset |

---

## GCODE Macro Reference

Place these in your Klipper `printer.cfg`:

```gcode
[gcode_macro DISPLAY_FACE]
description: Set display face. Usage: DISPLAY_FACE GROUP=name SET=name
gcode:
  {% set group = params.GROUP|default('idle') %}
  {% set set_id = params.SET|default('default') %}
  {% set loop = params.LOOP|default('1') %}
  {% set speed = params.SPEED|default('1') %}
  RESPOND MSG="display:group={group} set={set_id} loop={loop} speed={speed}"

[gcode_macro DISPLAY_ALERT]
description: Show a temporary alert on the display
gcode:
  {% set text = params.TEXT|default('!') %}
  {% set duration = params.DURATION|default('5') %}
  RESPOND MSG="display:alert text={text} duration={duration}"

[gcode_macro PRINT_END]
description: Print end with display celebration
gcode:
  RESPOND MSG="display:group=celebration set=party loop=3"
  # ... rest of your PRINT_END ...

[gcode_macro _KLIPPYFACE_STATUS]
description: Status variables for display (like KNOMI's _KNOMI_STATUS)
gcode:
  # Set by other macros during homing, probing, heating, etc.
```

---

## Memory Budget (ESP32 — Single Display, 128×64)

| Component | Flash | RAM |
|-----------|-------|-----|
| WiFi stack + FreeRTOS | ~200 KB | ~30 KB |
| Arduino core | ~50 KB | ~10 KB |
| ArduinoJson | ~20 KB | ~4 KB (heap) |
| WebSocket client | ~30 KB | ~6 KB |
| Adafruit_SH110X + GFX | ~15 KB | ~2 KB |
| Display engine (structs) | ~20 KB | ~4 KB (PROGMEM) |
| AnimationEngine + Renderer | ~15 KB | ~1 KB |
| Config JSON (parsed) | - | ~8 KB (heap) |
| Sprites (10 × 32×32) | ~5 KB (PROGMEM) | ~2 KB (decoded) |
| OLED framebuffer | - | 1 KB |
| **Total (approx)** | **~355 KB** | **~68 KB** |

ESP32 has **4 MB flash** and **~320 KB usable RAM**. Well within budget.

---

## Web UI Blueprint

### Layout

```
┌─────────────────────────────────────────────────────┐
│  Klippyface Display Manager                     [v] │
├──────────┬──────────────────────────────────────────┤
│ SIDEBAR  │  MAIN PANEL                              │
│          │                                          │
│  ○ Nodes │  [Content changes based on sidebar]      │
│    ├─ printer_face                                  │
│    ├─ desk_panel    ┌──────────────────────────┐    │
│    └─ bedroom       │  OLED Preview (128×64)   │    │
│          │          │  ┌──────────────────┐    │    │
│  ○ Library│         │  │  :D              │    │    │
│    ├─ Groups        │  │                  │    │    │
│    └─ Sprites       │  └──────────────────┘    │    │
│          │          │  ▶ Play  ⏹ Stop  ⏪ ⏩   │    │
│  ○ Presets          └──────────────────────────┘    │
│          │                                          │
│  ○ Settings│                                        │
└──────────┴──────────────────────────────────────────┘
```

### Key UI Feature: Sprite Editor (Pixel Grid)

```
┌──────────────────────────────────────────────┐
│  Sprite: "face_happy"     Size: [32x32 ▼]   │
├──────────────────────────────────────────────┤
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │                                      │    │
│  │      Pixel grid (zoom: 4x)           │    │
│  │      Click to toggle black/white     │    │
│  │      Drag to paint                   │    │
│  │                                      │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  [Import PNG]  [Clear]  [Invert]  [Save]    │
│                                              │
│  Preview (actual size):  🙂                  │
└──────────────────────────────────────────────┘
```

---

## Docker Deployment

```dockerfile
# server/Dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY server/ ./
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
EXPOSE 5000
VOLUME /app/data  # SQLite database
ENTRYPOINT ["dotnet", "Klippyface.Server.dll"]
```

```bash
docker build -t klippyface-server -f server/Dockerfile .
docker run -d \
  --restart=always \
  -p 5000:5000 \
  -v klippyface-data:/app/data \
  --name klippyface \
  klippyface-server
```

---

## Development Workflow

### Recommended Build Order

```
Phase 1: ESP32 core (driver + engine + single display, hardcoded)
    ↓
Phase 2: Moonraker WebSocket (real-time state)
    ↓
Phase 3: Companion server (API + DB)
    ↓
Phase 4: Config fetcher (ESP32 + server connected)
    ↓
Phase 5: Web UI (full visual editor)
    ↓
Phase 6: GCODE macros + data bindings
    ↓
Phase 7: Captive portal first-boot
    ↓
Phase 8: Multi-node + polish
```

### Testing

| Phase | How to test |
|-------|-------------|
| 1 | Flash ESP32, watch OLED, read serial console |
| 2 | Change printer state, watch OLED react |
| 3 | `curl` API endpoints, check SQLite file |
| 4 | Change config on server, watch ESP32 update |
| 5 | Create/edit faces in browser, preview animation |
| 6 | Run Klipper macros, watch real-time response |
| 7 | Flash blank ESP32, connect phone, configure |
| 8 | Deploy multiple ESP32s, manage from one UI |

### Serial Console Logging

Every component logs key events:
```
[WIFI] Connecting to Voyager...
[WIFI] Connected, IP: 192.168.2.100
[CONFIG] Fetching from http://192.168.2.21:5000/api/config/node?mac=AA:BB:CC:DD:EE:01
[CONFIG] Loaded: 2 displays, 5 groups, 12 frames, 4 sprites
[MOONRAKER] WebSocket connected
[MOONRAKER] State: printing (progress: 45.2%)
[DISPLAY] face_oled: trigger "state:printing" → group "printing_faces"
[DISPLAY] Animation tick: set "excited" frame 2/3
```

---

## Agent Workflow Instructions

This section is for **future AI agents** working on this project. Follow these steps when picking up work.

### Before Starting Any Work

1. **Read PLAN.md** — understand the full architecture, data model, and API contract.
2. **Check `docs/`** — scan all `phase-*/TODO.md` files to determine what has been completed.
3. **Check the current phase's docs** — read `docs/phase-N/notes.md` and `docs/phase-N/decisions.md` for context from prior work.
4. **Verify file existence** — confirm expected source files from the project structure tree actually exist (missing files may indicate incomplete work).
5. **Infer context** — if `docs/` is sparsely populated, use `git log` (if available) and file inspection to gauge what's been done.

### Phase Folder Convention

Each implementation phase has a corresponding folder under `docs/`:

| Folder | Phase |
|--------|-------|
| `docs/phase-1/` | ESP32 Core Framework + Single Display |
| `docs/phase-2/` | Moonraker WebSocket Client + State Machine |
| `docs/phase-3/` | Companion Server — Data Layer + Config API |
| `docs/phase-4/` | ESP32 Config Fetcher |
| `docs/phase-5/` | Web UI |
| `docs/phase-6/` | GCODE Macro Integration |
| `docs/phase-7/` | Captive Portal First-Boot Setup |
| `docs/phase-8/` | Multi-Node & Polish |

### README.md Maintenance

The root `README.md` is the project's GitHub-facing introduction. Keep it in sync with the actual project state:

- When a phase is completed, update the **Features (Target)** table status column in README.md
- When the project structure or architecture significantly changes, reflect that in the overview sections
- README.md should be updated **at the end of each phase**, before marking the phase complete

### File Conventions

#### `TODO.md` (required per phase)

Tracks all tasks from the phase table in PLAN.md. Use this format:

```markdown
# Phase N: <Phase Name>

**Overall Status:** NOT STARTED | IN PROGRESS | COMPLETE

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| N.0 | Task description | `path/to/file` | ✅ Done | Completed on YYYY-MM-DD |
| N.1 | Task description | `path/to/file` | ⏳ In Progress | Working on X |
| N.2 | Task description | `path/to/file` | ❌ Blocked | Waiting on PR #... |
| N.3 | Task description | `path/to/file` | ⬜ Not Started | |
```

Status indicators:
- `✅ Done` — task verified complete
- `⏳ In Progress` — actively being worked on
- `❌ Blocked` — cannot proceed (note why)
- `⬜ Not Started` — not yet touched

#### `decisions.md` (recommended per phase)

Records design decisions made during implementation:

```markdown
# Phase N: Design Decisions

## YYYY-MM-DD: Why we chose X over Y
- **Context:** What prompted the decision
- **Option A:** ... (pros/cons)
- **Option B:** ... (pros/cons) ← **Chosen**
- **Rationale:** Why this was the right call
```

#### `notes.md` (optional)

Free-form implementation notes, serial console logs, edge cases discovered, gotchas, and anything useful for future agents.

### When Working on a Phase

1. **Update `TODO.md`** before and after each work session — change status, add notes.
2. **Log key decisions** to `decisions.md` as you make them.
3. **Document gotchas** in `notes.md` — anything that wasted time or surprised you.
4. **Mark the phase complete** only when the "Definition of done" from PLAN.md is verified.

### Determining Project State

To assess the current state of the project:

1. Check which `docs/phase-*/TODO.md` files exist.
2. For each existing TODO, check `Overall Status` at the top.
3. Look for the **highest-numbered phase marked IN PROGRESS** — that's where work should continue.
4. If no TODO exists for a phase but source files from that phase exist, the phase may have been worked on before this convention was adopted — verify by reading the code.

---

## Future Ideas (Post-v2)

- **Home Assistant integration** — MQTT discovery, trigger display from HA automations
- **Audio alerts** — piezo buzzer for print-complete
- **RGB status LED** — Neopixel integration
- **OTA firmware updates** — via companion server
- **Bluetooth proxy** — ESP32 as BLE sensor for Home Assistant
- **QR code frame type** — render QR codes with printer info
- **WebSocket command channel** — companion server can push commands to nodes
- **Node grouping** — assign the same content to multiple nodes at once
- **Config versioning** — history of config changes, rollback support

---

*This plan is a living document — update it as the project evolves.*
