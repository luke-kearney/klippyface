---
title: API Reference
type: reference
stable: true
---

# API Reference

## Config Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/config/node?mac={mac}` | **Main endpoint ESP32 calls.** Returns per-node config JSON. |
| GET | `/api/config/library` | Returns full library (for web UI preview/edit) |

## Node Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/nodes` | List all nodes |
| POST | `/api/nodes` | Register new node |
| GET | `/api/nodes/{id}` | Get node + displays + assignments |
| PUT | `/api/nodes/{id}` | Update node |
| DELETE | `/api/nodes/{id}` | Delete node + displays + assignments |
| GET | `/api/nodes/{id}/displays` | List displays on node |
| POST | `/api/nodes/{id}/displays` | Add display to node |
| PUT | `/api/nodes/{id}/displays/{did}` | Update display config |
| DELETE | `/api/nodes/{id}/displays/{did}` | Remove display |
| PUT | `/api/nodes/{id}/displays/{did}/assignment` | Set assignment (triggers + default group) |

## Library Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/groups` | List all groups |
| POST | `/api/groups` | Create group |
| GET | `/api/groups/{id}` | Get group with sets |
| PUT | `/api/groups/{id}` | Update group |
| DELETE | `/api/groups/{id}` | Delete group + cascade |
| GET | `/api/groups/{gid}/sets` | List sets in group |
| POST | `/api/groups/{gid}/sets` | Create set |
| PUT | `/api/sets/{sid}` | Update set |
| DELETE | `/api/sets/{sid}` | Delete set + frames |
| GET | `/api/sets/{sid}/frames` | List frames |
| POST | `/api/sets/{sid}/frames` | Create frame (with optional elements) |
| PUT | `/api/frames/{fid}` | Update frame (duration_ms, bg_color) |
| DELETE | `/api/frames/{fid}` | Delete frame |
| PUT | `/api/sets/{sid}/frames/reorder` | Reorder frames (send array of IDs) |
| GET | `/api/frames/{fid}/elements` | List frame elements |
| POST | `/api/frames/{fid}/elements` | Create frame element |
| PUT | `/api/elements/{eid}` | Update frame element |
| DELETE | `/api/elements/{eid}` | Delete frame element |
| PUT | `/api/frames/{fid}/elements/reorder` | Reorder elements |

## Sprite Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sprites` | List all sprites |
| POST | `/api/sprites` | Create (JSON + base64, or multipart PNG upload) |
| GET | `/api/sprites/{id}` | Get sprite with base64 data |
| PUT | `/api/sprites/{id}` | Update sprite |
| DELETE | `/api/sprites/{id}` | Delete sprite |
| GET | `/api/sprites/{id}/preview` | Render as PNG for browser preview |

## Preset Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/presets` | List presets |
| POST | `/api/presets` | Create preset |
| GET | `/api/presets/{id}` | Get preset |
| PUT | `/api/presets/{id}` | Update preset |
| DELETE | `/api/presets/{id}` | Delete preset |

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
        "bus": { "type": "i2c", "address": "0x3C" },
        "width": 128, "height": 64, "rotation": 0
      },
      {
        "id": "info_oled",
        "label": "Info Panel",
        "driver_type": "sh1106",
        "bus": { "type": "i2c", "address": "0x3D" },
        "width": 128, "height": 64, "rotation": 0
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
      }
    ]
  },
  "library": {
    "groups": {
      "idle_faces": {
        "label": "Idle Faces",
        "sets": [
          {
            "id": "sleepy", "label": "Sleepy",
            "loop_count": 0, "loop_forever": true, "frame_time": 0,
            "frames": [
              {
                "duration_ms": 3000, "bg_color": "#000000",
                "elements": [
                  { "type": "text", "value": "zzz", "x": 64, "y": 32, "color": "#FFFFFF" }
                ]
              }
            ]
          }
        ]
      }
    },
    "sprites": {
      "blink": { "width": 16, "height": 16, "data": "base64..." },
      "face_happy": { "width": 64, "height": 64, "data": "base64..." }
    }
  }
}
```

## FrameElement Types

| Type | `value` behavior |
|------|-----------------|
| `text` | Draws static text string. Color from `color` field. |
| `sprite` | Draws a named sprite from `sprites` dict at `(x, y)`. |
| `datavalue` | Resolves a Moonraker data binding key, formats the value, and draws `label: value` at `(x, y)`. |

### Data Binding Keys

| Key | Source | Example output |
|-----|--------|----------------|
| `print_stats.progress` | Moonraker progress | `"73.0%"` |
| `extruder.temperature` | Nozzle temp | `"210°C"` |
| `extruder.target` | Nozzle target | `"220°C"` |
| `heater_bed.temperature` | Bed temp | `"60°C"` |
| `heater_bed.target` | Bed target | `"65°C"` |
| `moonraker.connected` | Connection state | `"Online"` / `"Offline"` |
