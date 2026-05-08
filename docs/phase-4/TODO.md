# Phase 4: ESP32 Config Fetcher

**Overall Status:** NOT STARTED

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 4.1 | ConfigFetcher | `comms/ConfigFetcher.h/.cpp` | ⬜ Not Started | HTTP GET config endpoint. Parse JSON with ArduinoJson. |
| 4.2 | ConfigDeserializer | `engine/ConfigDeserializer.h/.cpp` | ⬜ Not Started | Walk JSON tree. Allocate structs. Create DisplayDriver instances via factory. |
| 4.3 | Sprite decode | `display/Sprite.cpp` (expand) | ⬜ Not Started | Decode base64 from config JSON. |
| 4.4 | Dynamic DisplayManager init | `display/DisplayManager.cpp` | ⬜ Not Started | Re-init on config update. Supports hot-reload. |
| 4.5 | Config fetcher task | `main.cpp` | ⬜ Not Started | Fetch at boot + every 5 minutes. Publish to configQueue. |
| 4.6 | Fallback | `engine/ConfigDeserializer.cpp` | ⬜ Not Started | If server is unreachable, keep last known config. Fallback to minimal hardcoded config on first boot. |
