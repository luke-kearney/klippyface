# Phase 4: ESP32 Config Fetcher

**Overall Status:** ✅ Complete — built and verified 2026-05-12

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 4.0 | Server URL in Settings | `config/Settings.h/.cpp` | ✅ Done | `getServerHost()`, `getServerPort()` added. Defaults to Moonraker host + port 5000. NVS keys `sv_host`, `sv_port` for override. |
| 4.1 | ConfigFetcher | `comms/ConfigFetcher.h/.cpp` | ✅ Done | HTTP GET to `http://{host}:{port}/api/config/node?mac=...`. Uses ESP32 built-in HTTPClient. 5s timeout. Returns body string or empty on failure. |
| 4.2 | ConfigDeserializer | `engine/ConfigDeserializer.h/.cpp` | ✅ Done | Walks full server JSON tree. Parses displays, assignments (merged into triggers), library groups, sprites. Handles hex colors, loop_count→loop_forever mapping. ArduinoJson v7. |
| 4.3 | Sprite decode expansion | `display/Sprite.h/.cpp` | ✅ Done | Added `decodeSpriteFromInfo()` convenience function. |
| 4.4 | Dynamic DisplayManager init | `display/DisplayManager.h/.cpp` | ✅ Done | Replaced `buildHardcodedConfig()` with `applyConfig(const NodeConfig&)`. Removed ~250 lines of hardcoded data. Boot display shows "Waiting for config..." until server config arrives. Uses DisplayFactory for driver creation. |
| 4.5 | Config fetcher task | `main.cpp` | ✅ Done | `configFetcherTask` on Core 0 (pri 6), fetches every 5 minutes. Sends heap-allocated JSON buffer via `configQueue` (char* pointer, cross-core safe). `displayTask` on Core 1 receives and calls `ConfigDeserializer::deserialize()` + `displayManager.applyConfig()`. |
| 4.6 | Fallback | DisplayManager.cpp | ✅ Done | `buildBootDisplay()` provides a minimal "Waiting for config..." screen on first boot. If server is unreachable, existing config keeps running. Empty server config is rejected (keeps current display). |
