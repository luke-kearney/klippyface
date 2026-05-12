---
title: System Architecture Overview
type: reference
stable: true
---

# Klippyface — System Architecture Overview

> Multi-node ESP32 display system driven by Moonraker/Klipper printer data.
> Firmware: PlatformIO + Arduino core + FreeRTOS (C++)
> Server: .NET 10 + SQLite (minimal API)
> Web UI: Vanilla JS + Vite

## System Diagram

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

## Core Concepts

| Term | What it is | Example |
|------|-----------|---------|
| **Node** | One ESP32 device. Identified by MAC. Has friendly name + description. | `printer_face` |
| **Display** | A physical screen attached to a node. Has type, bus config, resolution. | `SH1106 @ 0x3C, 128×64` |
| **Assignment** | Links a display to content: which groups to show for which printer events. | `trigger:printing → group:printing_faces` |
| **Library** | Shared pool of all Groups, Sets, Frames, Sprites. Created once, used by many nodes. | |
| **Group** | A named collection of Sets. Represents a mood/state. | `"printing_faces"`, `"celebration"` |
| **Set** | A sequence of Frames with loop control. | `"blink_cycle"`: [":)", blink sprite]×3 |
| **Frame** | A container of positioned elements (text, sprites, data bindings). Has duration and background color. | `{duration_ms:2000, bg_color:"#000000", elements:[{type:"sprite", value:"blink", x:0, y:0}]}` |
| **FrameElement** | A single positioned element within a frame. Has type (text/sprite/datavalue), value, color, x/y position, and optional label. | `{type:"datavalue", value:"extruder.temperature", label:"Ext", x:18, y:0}` |
| **Preset** | Named overrides that modify node behavior (time-based or manual). | `night_mode`: dim brightness, swap to quiet groups |

## Project Structure

```
klippyface/
├── platformio.ini                    # Build config, lib deps, board
├── agents/                           # Agent bootstrap + coding conventions
│   ├── AGENTS.md                     # Bootstrap instructions for AI agents
│   └── CONVENTIONS.md                # Coding conventions (firmware, server, web UI)
├── docs/                             # Reference documentation
│   ├── architecture/                 # System architecture by domain
│   ├── reference/                    # API, GCODE macros
│   └── decisions/                    # Design decision log
├── src/                              # ESP32 firmware
│   ├── main.cpp                      # setup() + xTaskCreatePinnedToCore()
│   ├── display/                      # DisplayDriver, factory, drivers, renderer
│   ├── engine/                       # Animation engine, config structs, deserializer
│   ├── comms/                        # Moonraker WS, config fetcher, GCODE handler
│   ├── wifi/                         # WiFi manager, captive portal, setup server
│   └── config/                       # NVS settings
├── server/                           # .NET 10 Companion Server
│   ├── Program.cs                    # Minimal API, DI, CORS, static files
│   ├── Data/                         # EF Core + SQLite
│   ├── Models/                       # Entity models
│   ├── Api/                          # Endpoint groups
│   └── Services/                     # Business logic
├── ui/                               # Vite vanilla JS Web UI
│   ├── css/
│   ├── js/
│   │   ├── app.js, store.js, api.js, utils.js
│   │   └── components/               # 10 component files
│   └── public/
├── docker/
│   └── Dockerfile
└── scripts/
    └── xbm-convert.py
```
