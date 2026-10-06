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
| GET | `/api/ws/node/{mac}` | **WebSocket** — persistent channel for online tracking, heartbeat, config push |
| GET | `/api/nodes/{id}/displays` | List displays on node |
| POST | `/api/nodes/{id}/displays` | Add display to node (gets a default assignment mapping each printer state to its starter group, where those groups exist) |
| PUT | `/api/nodes/{id}/displays/{did}` | Update display config |
| DELETE | `/api/nodes/{id}/displays/{did}` | Remove display |
| GET | `/api/nodes/{id}/displays/{did}/assignment` | Get a display's assignment |
| PUT | `/api/nodes/{id}/displays/{did}/assignment` | Set assignment (triggers + default group) |

## Library Endpoints

Writes to groups, sets, frames and elements are saved immediately but **do not** reach nodes: they set the group's `pending_publish` flag. Nodes showing the group are refreshed by `POST /api/groups/{id}/publish` (the Web UI's Sync, or its 30 s idle auto-sync), or by the server once the group has had no edits for 60 s. Saving or deleting a sprite marks every group that draws it. Group rename/delete and node display/assignment changes still refresh nodes immediately. `refresh_config` messages to one node are coalesced to at most one per 5 s.

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/groups` | List all groups |
| POST | `/api/groups` | Create group |
| GET | `/api/groups/{id}` | Get group with sets |
| PUT | `/api/groups/{id}` | Update group |
| POST | `/api/groups/{id}/rename` | Change the group id (`{ id }`). Repoints sets, assignment `default_group`/triggers and preset `groupSwaps`, then bumps affected nodes. GCODE macros are not touched. `400` bad id, `409` taken |
| POST | `/api/groups/{id}/publish` | Push pending edits: clear `pending_publish`, bump and refresh nodes showing the group. Returns `{ nodes }` |
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
| POST | `/api/starter-pack` | Import the built-in starter faces; skips sprite/group ids that already exist. Returns `{ sprites_added, groups_added }` |

## Sprite Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/sprites` | List all sprites |
| POST | `/api/sprites` | Create (JSON: `id`, `label`, `folder`, `description`, `width`, `height`, `data_base64`). Image import and 1-bit thresholding happen in the Web UI |
| GET | `/api/sprites/{id}` | Get sprite with base64 data |
| PUT | `/api/sprites/{id}` | Update sprite (label, folder, description, size, pixels). Marks groups that draw it pending |
| POST | `/api/sprites/{id}/rename` | Change the sprite id (`{ id }`). Repoints `sprite` frame elements. Returns `{ sprite, elements_updated }`. `400` bad id, `409` taken |
| DELETE | `/api/sprites/{id}` | Delete sprite |

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
The companion server serializes per-node config. The ESP32 fetches this at boot. `config_version` is the node's `LastConfigVersion`, bumped on every admin edit:
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
        "bus": { "type": "i2c", "address": "0x3C", "sda": 21, "scl": 22 },
        "width": 128, "height": 64, "rotation": 0
      },
      {
        "id": "info_oled",
        "label": "Info Panel",
        "driver_type": "sh1106",
        "bus": { "type": "i2c", "address": "0x3D", "sda": 21, "scl": 22 },
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

## WebSocket Protocol (`/api/ws/node/{mac}`)

The ESP32 maintains a persistent WebSocket to the companion server for online tracking
and instant config push. Messages are JSON with a `type` field:

### Node → Server

| Type | Payload | Timing |
|------|---------|--------|
| `hello` | `{ node_id, friendly_name, config_version, fw_version, board }` | On connect/reconnect. `board` is the firmware build env (e.g. `esp32dev`, `esp32s3-ws-lcd169`); the server stores it and `fw_version` on the node |
| `heartbeat` | `{ heap_free, uptime_s, rssi, display_count }` | Every 30s |

### Server → Node

| Type | Payload | Trigger |
|------|---------|---------|
| `config_status` | `{ up_to_date: bool }` | Response to hello |
| `refresh_config` | `{}` | Admin-edited config (display/group/assignment changes) |
| `refresh_library` | `{}` | Admin-edited library (future) |

### Connection Lifecycle

1. ESP connects → sends `hello` with `config_version`
2. Server compares against DB `LastConfigVersion` — if stale, sends `refresh_config`
3. ESP fetches config via HTTP `GET /api/config/node?mac=...`, applies, re-announces with updated version
4. ESP sends `heartbeat` every 30s; server persists `LastSeen` and tracks `IsOnline`
5. On disconnect → auto-reconnect with 5s interval, repeat from step 1
6. No config redraw if version is unchanged from prior session

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
