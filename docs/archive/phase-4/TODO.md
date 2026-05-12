# Phase 4: ESP32 Config Fetcher

**Overall Status:** ✅ Complete + Tangent 4A (built and verified 2026-05-12)

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 4.0 | Server URL in Settings | `config/Settings.h/.cpp` | ✅ Done | `getServerHost()`, `getServerPort()` added. Defaults to Moonraker host + port 5000. NVS keys `sv_host`, `sv_port` for override. |
| 4.1 | ConfigFetcher | `comms/ConfigFetcher.h/.cpp` | ✅ Done | HTTP GET to `http://{host}:{port}/api/config/node?mac=...`. Uses ESP32 built-in HTTPClient. 5s timeout. Returns body string or empty on failure. |
| 4.2 | ConfigDeserializer | `engine/ConfigDeserializer.h/.cpp` | ✅ Done | Walks full server JSON tree. Parses displays, assignments (merged into triggers), library groups, sprites. Handles hex colors, loop_count→loop_forever mapping. ArduinoJson v7. |
| 4.3 | Sprite decode expansion | `display/Sprite.h/.cpp` | ✅ Done | Added `decodeSpriteFromInfo()` convenience function. |
| 4.4 | Dynamic DisplayManager init | `display/DisplayManager.h/.cpp` | ✅ Done | Replaced `buildHardcodedConfig()` with `applyConfig(const NodeConfig&)`. Removed ~250 lines of hardcoded data. Boot display shows "Waiting for config..." until server config arrives. Uses DisplayFactory for driver creation. |
| 4.5 | Config fetcher task | `main.cpp` | ✅ Done | `configFetcherTask` on Core 0 (pri 6), fetches every 5 minutes. Sends heap-allocated JSON buffer via `configQueue` (char* pointer, cross-core safe). `displayTask` on Core 1 receives and calls `ConfigDeserializer::deserialize()` + `displayManager.applyConfig()`. |
| 4.6 | Fallback | DisplayManager.cpp | ✅ Done | `buildBootDisplay()` provides a minimal "Waiting for config..." screen on first boot. If server is unreachable, existing config keeps running. Empty server config is rejected (keeps current display). |
| 4A.1 | Add TLS NVS keys + accessors to Settings | `config/Settings.h/.cpp` | ✅ Done | Tangent 4A: `mk_tls`, `mk_tls_verify`, `sv_tls`, `sv_tls_verify`. |
| 4A.2 | Update ConfigFetcher for https | `comms/ConfigFetcher.h/.cpp` | ✅ Done | Tangent 4A: accept useTls/tlsVerify, build URL with scheme, WiFiClientSecure. |
| 4A.3 | Update MoonrakerClient for wss | `comms/MoonrakerClient.h/.cpp` | ✅ Done | Tangent 4A: beginSSL routing, Origin header scheme. |
| 4A.4 | Update SetupServer saveConfig | `wifi/SetupServer.h/.cpp` | ✅ Done | Tangent 4A: accept new TLS + server host fields. |
| 4A.5 | Update captive portal form + handler | `wifi/CaptivePortal.cpp`, `wifi/setup_html.h` | ✅ Done | Tangent 4A: WSS checkbox, collapsible server section, HTTPS/verify checkboxes. |
| 4A.6 | Update main.cpp task calls | `main.cpp` | ✅ Done | Tangent 4A: pass TLS flags to begin/fetch calls. |
| 4A.7 | Update tracking docs | `agents/PLAN.md`, `agents/docs/phase-4/TODO.md` | ✅ Done | Tangent 4A |
| 4A.8 | Build verification (TLS tangent) | - | ✅ Done | Tangent 4A: Both `esp32dev` and `esp32dev-mock` compile. 2026-05-12 |
| 4A.9 | Auto-detect MAC address at boot | `main.cpp` | ✅ Done | Tangent 4A: `getNodeMac()` was always empty — NVS key `node_mac` never written. Added auto-detect via `WiFi.macAddress()` in `setup()` after `Settings::begin()`. |
| 4A.10 | Configurable server URLs + CORS via appsettings.json | `server/appsettings.json`, `server/Program.cs` | ✅ Done | Tangent 4A: Created `appsettings.json` with `Urls` key (`0.0.0.0:5000`) and `Klippyface:Cors` section. CORS in Program.cs reads allowed origins/methods/headers from config — `"*"` wildcard maps to `AllowAny*()`. No recompile needed to change port or lock down CORS. |
| 4A.11 | Build verification (final) | - | ✅ Done | Tangent 4A: Both `esp32dev` and `esp32dev-mock` compile. Server `dotnet build` succeeds. 2026-05-12 |
