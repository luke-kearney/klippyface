---
title: Design Decision Log
type: log
append-only: true
---

# Design Decision Log

This is the consolidated, append-only record of significant design decisions. Entries are chronological. Each entry follows the ADR (Architecture Decision Record) format: Context, Decision, Rationale, Consequences.

---

## 2026-05-09: Sh1106Driver — heap-allocated Adafruit_SH1106G

**Context:** Adafruit_SH1106G does not have a default constructor (requires width/height in ctor). The driver instance must be created in `init()`, not the outer constructor.

**Decision:** Store `Adafruit_SH1106G*` as a pointer, `new` it in `init()`, `delete` in destructor. The Sh1106Driver constructor is lightweight (stores config only).

**Color mapping:** `uint32_t color → uint8_t`: any non-zero → 1 (white), zero → 0 (black). Simple and matches the DisplayDriver contract (RGB888 → 1-bit).

---

## 2026-05-09: WifiManager — EventGroup + static event handler

**Context:** WiFi events arrive via static callback. Need to route to a class instance.

**Options:**
- Singleton pattern with `getInstance()` — more boilerplate
- Global `gInstance` pointer — simple, works because there's only one WifiManager

**Chosen:** Global `gInstance` pointer.

**Rationale:** There will never be multiple WifiManager instances (one WiFi radio). The global pointer is trivially correct and avoids singleton ceremony. EventGroup lets other tasks block until WiFi is ready without busy-waiting.

---

## 2026-05-09: Settings — standalone class with static methods

**Context:** NVS access is needed by WiFi, MoonrakerClient, and ConfigFetcher before any objects are constructed (in `setup()`). A singleton/static approach avoids ordering issues.

**Chosen:** Static methods on a class (no instance).

**Rationale:** NVS is effectively global state anyway. Static methods map directly to the underlying NVS key-value API. No reason to add instance indirection.

---

## 2026-05-11: Queue-based cross-core command dispatch

**Context:** `onStateChange()` is called from `moonrakerTask` (Core 0), but `AnimationEngine` state is read/written from `displayTask` (Core 1). Sharing mutable data without synchronization violates FreeRTOS conventions.

**Chosen:** Queue-based dispatch — `onStateChange()` enqueues a `CmdMessage`, `tickAll()` drains it on Core 1.

**Rationale:** Zero contention on the hot path (tickAll), no locks needed. Follows established FreeRTOS queue pattern. CmdMessage uses fixed-size char arrays to avoid heap allocation across core boundary.

---

## 2026-05-11: WebSocket library — links2004/WebSockets

**Context:** Need a WebSocket client for Moonraker communication.

**Decision:** Use `links2004/WebSockets@^2.4.2` (resolved to 2.7.3). Provides `WebSocketsClient` with built-in reconnect, WS/WSS support.

**Gotcha:** `WebSocketsClient` does NOT have a `sendPong()` method. PING frames are handled automatically by the library's internal `loop()` — we don't need to manually respond.

---

## 2026-05-11: gInstance pattern for WebSocket callback

**Context:** `WebSocketsClient::onEvent()` takes a static function pointer, same as `WiFi.onEvent()`.

**Chosen:** Same pattern as WifiManager — static `_instance` pointer + static `onWSEvent()` wrapper.

**Rationale:** Consistent with existing code pattern. Avoids singleton boilerplate.

---

## 2026-05-11: ArduinoJson 7 — JsonVariantConst instead of JsonObject

**Context:** Initial code used `const JsonObject& params0 = doc["params"][0];` but ArduinoJson 7 doesn't allow implicit conversion from `JsonVariantConst` to `JsonObject`.

**Decision:** Use `JsonVariantConst` for all intermediate access in ArduinoJson 7.

**Lesson:** In ArduinoJson 7, `JsonVariantConst` supports `.isNull()`, `.as<>()`, and bracket-access chaining for sub-properties. Don't use `JsonObject`/`JsonArray` for intermediate results.

---

## 2026-05-11: Frame data model — element composition (Tangent 2A)

**Context:** Original `Frame` was a single atomic renderable (one type, one value, one position). This couldn't express dashboards with multiple positioned elements on one canvas.

**Old model:** `Frame{type, value, duration_ms, color, bg_color, x_offset, y_offset}` — one type per frame

**New model:** `Frame{duration_ms, bg_color, elements: [FrameElement{type, value, label, color, x, y}]}` — N elements per frame

**FrameElement types:** `Text`, `Sprite`, `DataValue` (live Moonraker binding via `PrinterState::resolve()`)

**Rationale:** The canvas model is more flexible, matches Web UI frame builder, and requires only mechanical conversion of existing content.

---

## 2026-05-11: Cross-core PrinterState — direct struct store (no mutex)

**Context:** `PrinterState` is written by `moonrakerTask` (Core 0) and read by `displayTask` (Core 1).

**Chosen:** Direct struct store — individual float writes are atomic on Xtensa LX6.

**Rationale:** The risk of reading mixed old/new values across fields is visually imperceptible at display timescales. No locks, no queue pressure, minimal code.

---

## 2026-05-11: Continuous Moonraker event forwarding

**Context:** Previously `StateEvent` was only sent on printer state *transitions*. Progress/temp data was never forwarded during a print.

**Decision:** Always send `StateEvent` on every `notify_status_update`, regardless of state change. `trigger` field is empty for data-only updates.

**Rationale:** Queue depth 5 + drain at 30fps >> send rate at ~5fps. Queue drops are silent and non-destructive.

---

## 2026-05-11: Mock mode — #ifdef inside MoonrakerClient.cpp

**Context:** Need to test the full pipeline without a real Moonraker instance.

**Chosen:** `#ifdef MOONRAKER_MOCK` inside `MoonrakerClient.cpp` rather than a separate mock class.

**Rationale:** The mock only replaces `begin()`, `tick()`, and `disconnect()`. All the rest is the same. Single `#ifndef`/`#else`/`#endif` block avoids an interface abstraction layer.

---

## 2026-05-11: Connection status handling + screen sleep (Tangent 2B)

**Context:** When Moonraker disconnected, the display stayed frozen with no user feedback. No screen saver or power saving.

**Decision:** Three dedicated groups (`wifi_offline`, `moonraker_offline`, `screen_sleep`) with priority-based state machine in `main.cpp`. Screen powers off after 30s idle, wakes on any activity.

**Key detail:** `MoonrakerClient::tick()` guarded behind `WiFi.isConnected()` — calling `_ws.loop()` on a dead TCP/IP stack causes a `tcpip_send_msg_wait_sem` assert.

---

## 2026-05-12: Vite as build tool (was: vanilla JS)

**Context:** Initial plan was pure vanilla JS with no build step. Development iteration was slow without HMR.

**Decision:** Use Vite 6.x with vanilla JS runtime. Minimal config (~20 lines). Production builds automatically bundled + minified.

---

## 2026-05-12: Hash-based routing

**Context:** Need client-side routing for 8 views.

**Chosen:** Hash-based (`#nodes`, `#nodes/{id}`, etc.).

**Rationale:** No server-side configuration needed. Works with any static file server. Simpler than History API (which would require a fallback-to-index.html handler on the .NET server).

---

## 2026-05-12: Custom pub/sub store vs. framework

**Chosen:** Build a minimal (~40 line) pub/sub state store.

**Rationale:** Fits the scope — this is a CRUD config tool, not a complex app. Preact/Svelte are overkill. Redux/Zustand is way too heavy. No framework lock-in.

---

## 2026-05-12: Source in `ui/`, build output to `server/wwwroot/`

**Decision:** Vite source lives in `ui/` at project root; build outputs to `server/wwwroot/`.

**Rationale:** Clean separation. .NET server already has `UseDefaultFiles()` + `UseStaticFiles()` pointed at `wwwroot/`. No changes needed to `Program.cs`.

---

## 2026-05-12: Full app.js built upfront

**Decision:** Rather than a minimal router now and full app controller later, build the complete app.js with store + router + dirty-form tracking from the start (<200 lines).

**Rationale:** Avoids refactoring. Dirty-form tracking is immediately useful. The pattern won't change when adding remaining components.

---

## 2026-05-12: Captive portal — built-in WebServer (not AsyncWebServer)

**Context:** Original plan specified AsyncWebServer.

**Decision:** Use built-in ESP32 `WebServer` + `DNSServer`.

**Rationale:** Zero additional PlatformIO deps. Serves one user at a time; synchronous handling is sufficient. Avoids AsyncTCP compatibility issues.

---

## 2026-05-12: Captive portal — open AP, no password

**Rationale:** AP only exists during first-boot setup (a few minutes). Password creates friction. ESP32 has no display to show a dynamically-generated password. AP disappears after config.

---

## 2026-05-12: Captive portal — save without testing WiFi

**Rationale:** Testing would require switching from AP to STA and back, which is complex and error-prone. If credentials are wrong, the user can GPIO0-reset and reconfigure.

---

## 2026-05-12: Captive portal — 30-min idle timeout

**Rationale:** Prevents abandoned devices from sitting in AP mode indefinitely. Timer resets on any HTTP request. Reboot re-enters setup mode.

---

## 2026-05-12: Factory reset — long-press GPIO0 (revised from boot-time check)

**Context:** Original approach checked GPIO0 at boot. GPIO0 is a strapping pin — held LOW at power-on enters download mode; firmware never executes.

**Revised decision:** Long-press detection (3s hold after boot). Short press (<3s) continues normal boot. Uses dedicated FreeRTOS task (`gpioMonitorTask`, pri 1) that runs continuously in both provisioned and unprovisioned modes.

---

## 2026-05-12: Provisioned NVS flag — explicit commit before reboot

**Decision:** `Settings::setProvisioned(true)` + `commit()` before `ESP.restart()`.

**Rationale:** Uncommitted NVS writes are lost on restart. `Settings::clear()` erases all keys including `provisioned`, so factory reset correctly reverts to setup mode.

---

## 2026-05-12: Moonraker Origin header — send without trailing \r\n

**Context:** Moonraker's `cors_domains` config rejects WebSocket upgrades without a matching `Origin` header. Adding `Origin` caused Moonraker to enter CORS enforcement and reject. Sending no Origin worked with `cors_domains *` but not with specific domains.

**Final fix:** Send `Origin: http://<host>:<port>` via `WebSocketsClient::setExtraHeaders()`. Do NOT append `\r\n` — the library handles line endings internally. Double line-ending corrupts the HTTP upgrade request.

---

## 2026-05-12: HX8347D TFT driver — Arduino_GFX + 8-bit parallel

**Context:** Need TFT display support for 2.8" 320×240 color shields with the Himax HX8347D controller.

**Decision:** Use `moononournation/GFX Library for Arduino@1.3.5` (Arduino_GFX library). Driver class `Hx8347Driver : DisplayDriver` creates an `Arduino_ESP32PAR8` parallel bus and `Arduino_HX8347D` display instance.

**Rationale:** Library provides both parallel and SPI bus support with a single API. Actively maintained. HX8347D class is hardware-verified with real parallel-bus hardware.

**DrawBitmap auto-detect:** `dataSize == w*h*2` → `draw16bitRGBBitmap()` (RGB565), else 1-bit mask via `drawBitmap(fg, 0)`. The `dataSize` parameter was added to the `DisplayDriver::drawBitmap` interface, with the renderer passing `sprite.byteSize()`.

---

## 2026-05-12: Raw bus config JSON passthrough from server

**Context:** `DisplayManager::applyConfig()` reconstructed a bus JSON object from the limited `DisplayBusConfig` struct fields (`type`, `cs`, `dc`, `rst`), dropping all parallel bus pins (d0–d7, wr, rd, bl, ips) needed by the HX8347D driver.

**Decision:** Add `String rawBusJson` to `DisplaySlotConfig`. The config deserializer serializes the full `bus` JSON object from the server. `applyConfig()` uses `deserializeJson()` on `rawBusJson` when present, falling back to struct reconstruction for I2C-only displays.

**Consequences:**
- Parallel pin config flows through untouched from DB → server → ESP → factory → driver
- Server `node_displays.bus_config` column stores all pins as JSON and is passed verbatim
- No schema migration needed — existing I2C displays use the fallback path

---

## 2026-05-12: No boot display — wait for server config

**Context:** The boot display created a hardcoded SH1106 (later HX8347T) during `begin()`, showing "Klippyface / Waiting for config..." until the server config arrived.

**Decision:** `buildBootDisplay()` is now a no-op. No display hardware is touched until `applyConfig()` creates displays from the server config.

**Rationale:** Eliminates boot flicker, avoids hardcoded driver/pin assumptions in boot path, and allows the server to fully define the display topology. The `_slots` vector is empty at boot; `tickAll()` skips rendering cleanly.

---

## 2026-05-12: Frame-based render skip to prevent flicker

**Context:** `AnimationEngine::tick()` returned the current frame on every call (~30fps), causing `renderFrame()` to `clear()` and redraw the entire display every 33ms. On TFTs, the clear + redraw cycle was visible as flicker.

**Decision:** `DisplayManager::tickAll()` tracks `slot.lastRenderedFrame` pointer and only calls `renderFrame()` when the engine returns a different frame pointer.

**Rationale:** Static content renders once. Animated content renders on frame transitions (governed by `duration_ms`). Zero additional overhead for data-bound values (those will use a separate force-render mechanism in future).

---

## 2026-10-05: Web UI rewritten in React + TypeScript

**Context:** The vanilla JS UI (~3.9k lines of hand-built DOM) had no shared components, so forms, lists and dialogs each behaved differently, and the editors were hard to extend. The set preview drew text top-left (firmware centres it) and the sprite editor packed bits without row padding (firmware expects `ceil(w/8)` byte rows).

**Decision:** Rewrite `ui/` in React 19 + TypeScript, Tailwind v4 and shadcn/ui, with TanStack Query for server state and a hash router (the server has no SPA fallback). Previews use a software renderer (`ui/src/lib/render.ts`) that mirrors `Renderer.cpp` and the Adafruit GFX 5×7 font.

**Rationale:** Shared, accessible components; typed API contract; the canvas editors (drag-to-place elements, pixel editor) need component state that vanilla DOM made awkward.

**Consequences:** Larger bundle (~700 KB, fine on a LAN). Set editor saves edits optimistically and debounced; every save bumps affected nodes' config so devices update live. Sprites decode legacy unpadded data and re-encode padded on save.

---

## 2026-10-05: Per-frame duration takes precedence over set frame_time

**Context:** `AnimationEngine::currentFrameDuration()` used the set's `frame_time` whenever it was non-zero, overriding every frame's `duration_ms`. The server defaults `frame_time` to 1000, so most sets played every frame for exactly 1s regardless of the durations set in the editor (a 5s frame showed for 1s).

**Decision:** Frame `duration_ms` wins. `frame_time` is only a fallback for frames without a duration (missing/0 in config), then 1000ms. The Web UI treats `frame_time` as the default duration for new frames and previews use the same rule.

**Consequences:** Requires a firmware reflash to take effect. Sets whose frames all match `frame_time` play the same as before.

---

## 2026-10-05: Brand identity in the Web UI

**Context:** The UI used shadcn defaults with an orange primary, system fonts, a placeholder Lucide icon as the logo and no favicon. A branding set was designed (mark, pixel wordmark, palette, type, favicons).

**Decision:** Adopt the brand palette (Nozzle orange on zinc) with ink text on primary, since white on `#F54900` fails AA contrast. Add `state-*` colour tokens for printer states that differ in lightness as well as hue. Self-host Geist, Geist Mono and Silkscreen via Fontsource rather than Google Fonts, because the server often runs on a LAN without reliable internet. Favicons are the hand-placed 16/32 px pixel marks as PNGs, not a scaled vector.

**Consequences:** Primary buttons now have dark text. Fonts add ~50 KB (latin subsets) to the bundle, loaded on demand.

---

## 2026-10-05: Starter pack replaces EF seed data

**Context:** `AppDbContext` seeded a demo node (placeholder MAC, two displays) and four sprites with empty bitmaps via `HasData`. Fresh installs started with a fake node and blank faces. Changing `HasData` makes EF generate `DeleteData`/`UpdateData` migrations that overwrite seeded rows in existing databases, which users may have edited.

**Decision:** Remove the seed from the model, snapshot and the `InitialCreate`/`AddNodeOnlineTracking` migrations (affects fresh databases only; existing ones have already applied them and keep their data). Ship faces as an embedded `starter-pack.json`, imported on first run when the library is empty, or on demand via `POST /api/starter-pack` / the Groups page button. Import only adds ids that don't exist. New displays get a default assignment mapping each printer state to its starter group. Expressions stay server-side as editable library content; the firmware only gets a built-in boot splash (#26).

**Consequences:** Existing databases keep the old demo rows until deleted by hand. The `°` in temperature values still renders as two glyphs (firmware prints UTF-8 byte by byte).

---

## 2026-10-06: Library edits publish to nodes in batches

**Context:** Every library write bumped the config version of affected nodes and sent `refresh_config`. A few seconds of editing meant dozens of full config downloads and driver re-inits on the ESP32, and nodes wedged until power-cycled (#25).

**Decision:** Split persisting from publishing. Group/set/frame/element writes (and sprite saves, for groups that draw the sprite) only set `groups.pending_publish`. `POST /api/groups/{id}/publish` bumps and refreshes nodes showing the group; the Web UI calls it from a Sync button and 30 s after the last edit, and `PendingPublishSweeper` publishes any group idle for 60 s so edits still land if the tab closes. Structural changes (group rename/delete, displays, assignments) still refresh immediately. `NodeStatusService` serialises sends per socket and coalesces `refresh_config` to one per node per 5 s. Version bumps are saved before the message is sent.

**Consequences:** Nodes lag edits by up to ~60 s unless synced. A node that fetches for another reason (boot, reconnect) gets the latest saved content, published or not.

---

## 2026-10-06: One firmware build per board for ESP32-S3

**Context:** #20 adds ESP32-S3 support for two Waveshare boards: ESP32-S3-Touch-LCD-1.69 (S3R8, 8 MB octal PSRAM, native USB) and ESP32-S3-LCD-1.28 (S3R2, 2 MB quad PSRAM, CH343P USB-UART). PSRAM type and USB serial mode are fixed at build time, and colour panels want a PSRAM frame buffer, so one generic S3 image can't serve both.

**Decision:** One PlatformIO env per board (`esp32s3-ws-lcd169`, `esp32s3-ws-lcd128`) on a shared `esp32s3_base` (16 MB flash, `default_16MB.csv`), with board pins and quirks in `src/config/Board.h`. Release binaries are named `klippyface-firmware-<version>-<env>[-full].bin`, including the classic `esp32dev`. CI builds every env; production releases publish every board, the rolling `dev` pre-release only `esp32dev`.

**Consequences:** The classic firmware's release file names gain an `-esp32dev` suffix. Adding a board means a new env, a `Board.h` block and a `FIRMWARE_TARGETS` entry in `release.yml`.

---

## 2026-10-06: One Arduino_GFX driver for colour TFTs

**Context:** The two Waveshare S3 boards need ST7789 (#21) and GC9A01 (#29) drivers. The existing `Hx8347Driver` already wrapped Arduino_GFX, which supports both panels on SPI. Drawing straight to an SPI panel shows clear-then-draw flicker.

**Decision:** Replace `Hx8347Driver` with one `GfxDriver` for `hx8347`, `st7789` and `gc9a01`, picking the bus (`Arduino_ESP32PAR8` / `Arduino_ESP32SPI`) and panel class from the driver type. SPI panels render into an `Arduino_Canvas` flushed in `show()`, in PSRAM when present, otherwise in internal RAM only if 48 KB stays free, else direct. Panel quirks (IPS, row/column offsets, SPI frequency) come from the bus config. The Web UI gains a `gc9a01` type, SPI offset/IPS fields, and a round preview mask.

**Consequences:** Adding another Arduino_GFX panel is a new `Panel` value plus one constructor line. The HX8347D path is unchanged apart from clearing the screen and switching on the backlight at init; re-verified on hardware after the change.

---

## 2026-10-06: Element size and generated starter packs per display

**Context:** The starter faces were drawn for a 128×64 OLED and text was always GFX size 1, so on 240–320px colour panels faces sat small in a corner and text was unreadable (#32).

**Decision:** Frame elements get a `size` (1–8): GFX text size for text/data values, pixel scale for 1-bit sprites, rendered identically by the firmware and the Web UI. `scripts/starter_pack.py` generates a copy of each base group per display profile (`tft320x240`, `tft240x320`, `tft240x280`, `round240`) using scaled faces in state colours and large centred labels, written into `starter-pack.json` with a `profiles` trigger map. Groups record the `profile` they're drawn for, used for previews. The server picks a profile from a display's driver and size (orientation-strict) and imports that pack on demand when a display is added or "Use starter faces" is clicked.

**Consequences:** No duplicated sprite art: the same sprites serve every size. The base groups stay the hand-edited source of truth; sized packs are regenerated, not edited. Libraries only get sized groups for displays they have.

---

## 2026-10-06: Fake Moonraker replaces the firmware mock build

**Context:** Testing without a printer relied on `esp32dev-mock`, which faked a fixed idle → printing → complete loop inside the firmware and skipped the real WebSocket and JSON parsing entirely. It couldn't show multi-extruder data, partial status updates, Klipper restarts or dropped connections (#35). Moonraker is also moving behind the server (#34), where an in-firmware mock is no help.

**Decision:** Add `tools/FakeMoonraker`, a standalone .NET app that speaks Moonraker's JSON-RPC over `/websocket`, following Klipper's `QueryStatusHelper` (change-only updates every 250 ms, unknown objects as `{}`/`null` rather than errors). Printers are JSON profiles, scripted runs are C# scenarios, and `/_sim/*` endpoints drive it by hand or from tests. Remove `esp32dev-mock` and the `MOONRAKER_MOCK` code (supersedes "Mock mode — #ifdef inside MoonrakerClient.cpp").

**Consequences:** Real nodes, and later the server, test against the real protocol path. Testing without a printer needs a PC on the LAN running the fake, rather than just flashing a mock build.

---

## 2026-10-06: The server relays Moonraker to nodes

**Context:** Every node opened its own WebSocket to Moonraker beside the one it already held to the server, and parsed Moonraker's JSON itself. That meant per-node Moonraker settings in the setup portal, a firmware release for every new data key, and per-node handling of Moonraker's change-only updates — which the firmware got wrong (missing fields read as 0, the subscribe reply's initial state ignored, and `print_stats.progress`, a field Klipper doesn't have, as the progress source) (#34).

**Decision:** The server holds the one Moonraker connection (settings in the database, Printer page in the Web UI), merges updates into a store keyed by data key, and sends each node only the keys its faces bind to plus `print_stats.state`, over the node WebSocket: a full `state` on every hello, then changes. Values are sent raw, and the node formats them by key ending, so number-based renderers (#3, #4) stay possible. `RESPOND MSG="display:…"` is parsed on the server and routed by `node=`. Nodes lose `MoonrakerClient`, `GcodeHandler` and their Moonraker settings, and gain a `server:disconnected` trigger. `print_stats.progress` stays as a key the server derives from `display_status.progress` / `virtual_sdcard.progress`, so existing faces keep working.

**Consequences:** No live printer data on a node while the server is down (it already needed the server to boot). New data keys need no firmware change. Nodes provisioned before this fall back to their saved Moonraker host as the server address, which matches the usual setup of the server running on the printer's host.

---

## Future Ideas (Post-v1.0)

- **Home Assistant integration** — MQTT discovery, trigger display from HA automations
- **Audio alerts** — piezo buzzer for print-complete
- **RGB status LED** — Neopixel integration
- **OTA firmware updates** — via companion server
- **Bluetooth proxy** — ESP32 as BLE sensor for Home Assistant
- **QR code frame type** — render QR codes with printer info
- **WebSocket command channel** — companion server can push commands to nodes
- **Node grouping** — assign the same content to multiple nodes at once
- **Config versioning** — history of config changes, rollback support
- **FQDN Moonraker host support** — extend captive portal to accept hostnames (not just IPs)
