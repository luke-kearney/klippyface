# Phase 4: ESP32 Config Fetcher — Implementation Notes

## Overview

Replaced the hardcoded animation config in `DisplayManager::buildHardcodedConfig()` (~250 lines) with a live config fetched from the companion server's REST API. The ESP32 now boots showing "Waiting for config...", then fetches its per-node config from the server and dynamically creates displays, sprites, groups, and trigger mappings.

## Files Created

| File | Purpose |
|------|---------|
| `src/comms/ConfigFetcher.h/.cpp` | HTTP GET `http://{host}:{port}/api/config/node?mac={mac}` using ESP32 built-in `HTTPClient.h`. 5s timeout. Returns body string or empty on failure. |
| `src/engine/ConfigDeserializer.h/.cpp` | Walks the server's JSON tree (ArduinoJson v7). Parses displays, assignments (merged into per-display triggers), library groups, sprites. Handles hex color strings, loop_count mapping. |

## Files Modified

| File | Changes |
|------|---------|
| `src/engine/Config.h` | Added `library_groups` field to `NodeConfig` struct |
| `src/config/Settings.h/.cpp` | Added `getServerHost()`/`getServerPort()` with NVS keys `sv_host`/`sv_port`. Defaults to Moonraker host + port 5000 (common Docker deployment). |
| `src/display/Sprite.h/.cpp` | Added `decodeSpriteFromInfo()` convenience overload |
| `src/display/DisplayManager.h/.cpp` | Major rewrite: removed `buildHardcodedConfig()`, added `applyConfig(const NodeConfig&)` which creates drivers via `DisplayFactory`, decodes sprites, and configures per-display `AnimationEngine`. Added `buildBootDisplay()` for "Waiting for config..." fallback. Added `_configVersion` tracking. |
| `src/main.cpp` | Added `configQueue` (FreeRTOS queue of `char*` pointers), `configFetcherTask` on Core 0 (pri 6, fetches every 5 min). Display task on Core 1 receives config from queue, deserializes, and applies. |

## Cross-Core Communication

Using heap-allocated `char*` buffers sent through FreeRTOS queue as pointers:

```
configFetcherTask (Core 0)
  │  new char[N] ← strcpy(json)
  │  xQueueSend(configQueue, &ptr, 0)
  ▼
displayTask (Core 1)
  │  xQueueReceive(configQueue, &ptr, 0)
  │  String json = ptr; delete[] ptr;
  │  ConfigDeserializer::deserialize(json, nodeCfg)
  │  displayManager.applyConfig(nodeCfg)
```

This is safe because both cores share the same ESP32 heap.

## Gotchas

1. **ArduinoJson v7 `JsonString` vs `const char*`**: ArduinoJson 7.4.x returns `JsonString` (not `const char*`) from `JsonPair::key()`. Arduino's `String` has no implicit constructor from `JsonString`. Must call `.c_str()` first: `String(kv.key().c_str())`.

2. **`StateEvent` include removed accidentally**: When stripping `buildHardcodedConfig()`, the `#include "comms/MoonrakerClient.h"` was removed since it wasn't needed for the hardcoded data. But `updateState()` still uses `StateEvent`. Had to add it back.

3. **Server URL strategy**: Default companion server is `moonraker_host:5000`. This avoids adding another field to the captive portal setup form for MVP. Override via NVS if needed.

4. **Queue type for strings**: FreeRTOS queues copy value bytes. Sending `String` by value only copies the Arduino String object (a pointer), not the actual char data. Must use `char*` heap allocation + pointer queue for cross-core safety.

## Build Results

| Variant | RAM | Flash | Status |
|---------|-----|-------|--------|
| `esp32dev` | 48,376 bytes (14.8%) | 1,079,285 bytes (82.3%) | ✅ SUCCESS |
| `esp32dev-mock` | 48,424 bytes (14.8%) | 1,062,549 bytes (81.1%) | ✅ SUCCESS |

Flash usage increased by ~106 KB (from Phase 3 baseline of 972K) due to HTTPClient library + new code.
