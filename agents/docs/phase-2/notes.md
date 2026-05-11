# Phase 2: Implementation Notes

## 2026-05-11: Build verification — both variants pass

**esp32dev (real Moonraker):** RAM 14.3%, Flash 74.2% — well within ESP32 budget
**esp32dev-mock (mock mode):** RAM 13.6%, Flash 61.5% — smaller because WebSocket code excluded

## 2026-05-11: Key compilation fixes

1. **`WebSocketsClient::sendPong()` doesn't exist** — the WebSockets library handles PING→PONG response internally. Removed the call, left the `WStype_PING` case empty.

2. **ArduinoJson 7 `JsonVariantConst` vs `JsonObject`** — `doc["params"][0]` returns `JsonVariantConst`, not `JsonObject`. Cannot use `const JsonObject&` to capture it. Fixed by using `JsonVariantConst params0 = doc["params"][0];` which supports the same access patterns.

## 2026-05-11: Tangent 2A — Frame data model oversight

**The problem:** Original `Frame` struct was designed for face cycling (one type, one value, one position). Could not express "draw an icon at (0,0) and a temperature at (18,0) on the same canvas." The `Progress` and `Temp` frame types were stubs with no data plumbing.

**The fix:** Replace atomic Frame with element composition model:
- `Frame` becomes a container: `{duration_ms, bg_color, elements: [...]}`
- `FrameElement` has types: Text, Sprite, DataValue
- `DataValue` resolves Moonraker keys via `PrinterState::resolve()`
- `PrinterState` carries latest progress + temps, stored in DisplayManager
- MoonrakerClient sends on every `notify_status_update` (not just transitions)

**Pipeline change:** `main.cpp` now calls `displayManager.updateState(event)` on every event. `tickAll()` passes `PrinterState` to `renderFrame()`. DataValue elements use `state->resolve(key)`.

**Key insight:** The old `FrameType` enum (Text, Sprite, Clear, Progress, Temp) is replaced by `FrameElement::Type` (Text, Sprite, DataValue). Progress and Temp are now handled by DataValue with binding keys — no separate frame types needed. Clear is handled by `Frame::bg_color`.

## 2026-05-11: Architecture summary

```
moonrakerTask (Core 0, pri 9):
  ├── moonrakerClient.tick()       → processes WebSocket I/O
  ├── drains stateQueue            → displayManager.onStateChange(trigger)
  └── auto-reconnects on disconnect

gcodeHandlerTask (Core 0, pri 7):
  ├── blocks on gcodeQueue
  └── parses "display:..." → displayManager.directCommand(group, set, loop)

displayTask (Core 1, pri 10):
  ├── drains DisplayManager._cmdQueue (from onStateChange/directCommand)
  └── tickAll() → AnimationEngine.tick() → Renderer → driver.show()
```

## 2026-05-11: Moonraker JSON-RPC format reference

Subscribe:
```json
{"jsonrpc":"2.0","method":"printer.objects.subscribe","params":{"objects":{"print_stats":null,"extruder":null,"heater_bed":null}},"id":1}
```

Status update (received):
```json
{"jsonrpc":"2.0","method":"notify_status_update","params":[{"print_stats":{"state":"printing","progress":0.45},"extruder":{"temperature":210.5,"target":220.0}}, 12345.678]}
```

GCODE response (received):
```json
{"jsonrpc":"2.0","method":"notify_gcode_response","params":["display:group=celebration set=party loop=3"]}
```

## 2026-05-11: Tangent 2B — Connection status handling + screen sleep

### Problem
When Moonraker disconnected, the display stayed frozen on the last group with no user feedback. WiFi drops silently halted all Moonraker activity. No screen saver or power saving.

### Solution architecture

Three new dedicated display groups for connection states:

| Group | Content | Trigger |
|-------|---------|---------|
| `wifi_offline` | "WiFi Offline" + "Check network" | `wifi:disconnected` |
| `moonraker_offline` | "Moonraker Down" + "Reconnecting..." | `moonraker:disconnected` |
| `screen_sleep` | Blank (no elements) + OLED powerSave(true) | Internal timeout (30s) |

Priority-based connection state machine in main.cpp's moonrakerTask loop:

```
WiFi off          → WIFI_OFFLINE    → send "wifi:disconnected"
WiFi on, MR off   → MOONRAKER_OFFLINE → send "moonraker:disconnected"
WiFi on, MR on    → ONLINE          → no trigger (status update drives normal flow)
```

Screen sleep: DisplayManager tracks `_lastActivity` (updated on every CmdMessage from tickAll, Core 1 only — no cross-core access). After 30s, switches to `screen_sleep` group and calls `powerSave(true)`. Any CmdMessage wakes: `powerSave(false)` + reset to default group.

PrinterState adds `bool moonrakerConnected` flag + resolve key `moonraker.connected` → "Online"/"Offline". Idle frame 1 shows this DataValue.

### Tasks

| ID | Task | Files |
|----|------|-------|
| 2B.1 | Add moonrakerConnected field + resolve key | `Config.h/.cpp` |
| 2B.2 | Add connection status groups + screen sleep group + triggers to hardcoded config | `DisplayManager.cpp` |
| 2B.3 | Screen sleep timeout + wake logic | `DisplayManager.h/.cpp` |
| 2B.4 | Connection state monitoring in moonrakerTask | `main.cpp` |
| 2B.5 | Copy moonrakerConnected in updateState() + setMoonrakerConnected() + StateEvent.connected | `DisplayManager.cpp`, `MoonrakerClient.h/.cpp` |
| 2B.6 | Tracking docs | `PLAN.md`, `TODO.md` |
| 2B.7 | Build verification | — |

### 2026-05-11: Hardware test findings

Flashed `esp32dev` to real hardware (no credentials saved). Observed:

- **OLED initialized correctly**, showed `idle_faces` briefly
- **Connection monitor correctly detected WiFi offline** → switched to `wifi_offline` group ✓
- **CRASH: `tcpip_send_msg_wait_sem` assert** — `MoonrakerClient::tick()` called `_ws.loop()` when WiFi was never initialized (no credentials), causing WebSocket library to call `WiFiClient::connect()` on a dead TCP/IP stack.

**Fix:** Guarded `_ws.loop()` behind `WiFi.isConnected()` in `MoonrakerClient::tick()`. If WiFi isn't up, there's nothing for the WebSocket to do.

### 2026-05-11: Implementation notes

1. **StateEvent.connected field added** — The `StateEvent` struct in `MoonrakerClient.h` needed a `bool connected` field so `updateState()` can copy `event.connected` into `_printerState.moonrakerConnected`. Both the real and mock branches of `MoonrakerClient.cpp` set `event.connected = _connected`.

2. **setMoonrakerConnected() helper** — Added a separate public method `DisplayManager::setMoonrakerConnected(bool)` so the connection monitor in `main.cpp` can update the flag directly on WiFi/Moonraker transitions, even when no `StateEvent` is flowing (e.g. WiFi drops during a print — no Moonraker events arrive, but we need to update the DataValue).

3. **Screen sleep wake timing** — `_lastActivity` is updated only when a `CmdMessage` is received, not on every tick. This means during a long print with data-only updates (no state transitions), the screen will sleep 30s after the last trigger. This is intentional — during quiet prints the OLED doesn't need to stay on, and any new state change (e.g. print complete) wakes it. The idle cycles of the `idle_faces` animation don't generate `CmdMessage`s, so the 30s timer starts after the idle trigger has been processed.

### Behavior per scenario (correctness trace)

| Scenario | State transition | Trigger sent | Display |
|----------|-----------------|--------------|---------|
| Boot, WiFi connecting | ONLINE → WIFI_OFFLINE | `wifi:disconnected` | Shows "No WiFi" |
| WiFi connects, MR connecting | WIFI_OFFLINE → MOONRAKER_OFFLINE | `moonraker:disconnected` | Shows "Moonraker Down" |
| MR connects | MOONRAKER_OFFLINE → ONLINE | (none) | First status update drives correct group |
| WiFi drops during print | ONLINE → WIFI_OFFLINE | `wifi:disconnected` | Shows "No WiFi" |
| WiFi reconnects | WIFI_OFFLINE → MOONRAKER_OFFLINE | `moonraker:disconnected` | Shows "Moonraker Down" (WS reconnecting) |
| MR reconnects | MOONRAKER_OFFLINE → ONLINE | (none) | Status update restores correct group |
| 30s idle on idle_faces | — | (internal) | OLED powers off |
| State change (print starts) | — | `state:printing` via CmdMessage | OLED wakes, shows printing_faces |
