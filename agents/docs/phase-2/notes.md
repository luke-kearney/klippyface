# Phase 2: Implementation Notes

## 2026-05-11: Build verification — both variants pass

**esp32dev (real Moonraker):** RAM 14.3%, Flash 74.2% — well within ESP32 budget
**esp32dev-mock (mock mode):** RAM 13.6%, Flash 61.5% — smaller because WebSocket code excluded

## 2026-05-11: Key compilation fixes

1. **`WebSocketsClient::sendPong()` doesn't exist** — the WebSockets library handles PING→PONG response internally. Removed the call, left the `WStype_PING` case empty.

2. **ArduinoJson 7 `JsonVariantConst` vs `JsonObject`** — `doc["params"][0]` returns `JsonVariantConst`, not `JsonObject`. Cannot use `const JsonObject&` to capture it. Fixed by using `JsonVariantConst params0 = doc["params"][0];` which supports the same access patterns.

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
