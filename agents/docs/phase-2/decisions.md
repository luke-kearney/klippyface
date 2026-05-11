# Phase 2: Design Decisions

## 2026-05-11: Queue-based cross-core command dispatch in DisplayManager

- **Context:** `onStateChange()` is called from `moonrakerTask` (Core 0), but `AnimationEngine` state is read/written from `displayTask` (Core 1). Sharing mutable data without synchronization violates FreeRTOS conventions.
- **Option A:** Add mutex to AnimationEngine — works but adds lock overhead on the hot tick path (30fps)
- **Option B:** Queue-based dispatch — `onStateChange()` enqueues a `CmdMessage`, `tickAll()` drains it on Core 1 ← **Chosen**
- **Rationale:** Zero contention on the hot path (tickAll), no locks needed. Follows the established FreeRTOS queue pattern. The CmdMessage struct uses fixed-size char arrays instead of String to avoid heap allocation across core boundary.

## 2026-05-11: WebSocket library choice — links2004/WebSockets

- **Context:** Phase 1 notes mentioned removing `links2004/WebSockets` because it wasn't needed until Phase 2, and the other package (`ottowinter/AsyncTCP-esphome`) didn't exist.
- **Verification:** `links2004/WebSockets@^2.4.2` resolved to 2.7.3, compiled without issues. Library provides `WebSocketsClient` with built-in reconnect interval, supports WS/WSS, and integrates with Arduino `WiFiClient`.
- **Gotcha:** `WebSocketsClient` does NOT have a `sendPong()` method. PING frames are handled automatically by the library's internal `loop()` — we don't need to manually respond. The `WStype_PING` case in the event handler can be empty.

## 2026-05-11: gInstance pattern for WebSocket callback

- **Context:** `WebSocketsClient::onEvent()` takes a static function pointer, same as `WiFi.onEvent()`. Need to route to a class instance.
- **Decision:** Same pattern as WifiManager — static `_instance` pointer + static `onWSEvent()` wrapper. Simple, works because there's only one MoonrakerClient.
- **Rationale:** Consistent with existing code pattern. Avoids singleton boilerplate.

## 2026-05-11: ArduinoJson 7 — JsonVariantConst instead of JsonObject

- **Context:** Initial code used `const JsonObject& params0 = doc["params"][0];` but ArduinoJson 7 doesn't allow implicit conversion from `JsonVariantConst` to `JsonObject`.
- **Fix:** Use `JsonVariantConst params0 = doc["params"][0];` — `JsonVariantConst` supports `.isNull()`, `.as<>()`, and bracket-access chaining for sub-properties.
- **Lesson:** In ArduinoJson 7, always use `JsonVariantConst` (or `JsonVariant`) for intermediate access, not `JsonObject`/`JsonArray`.

## 2026-05-11: Tangent 2A — Frame data model refactor (element composition)

- **Context:** Original `Frame` was a single atomic renderable (one type, one value, one position). This was designed for simple face cycling but fundamentally couldn't express dashboards with multiple positioned elements (icons + labels + live data) on one canvas. Changing this now avoids baking a wrong API into downstream phases (server schema, config deserializer, Web UI frame editor).
- **Old model:** `Frame{type, value, duration_ms, color, bg_color, x_offset, y_offset}` — one type per frame
- **New model:** `Frame{duration_ms, bg_color, elements: [FrameElement{type, value, label, color, x, y}]}` — N elements per frame
- **FrameElement types:** `Text` (static string), `Sprite` (named bitmap), `DataValue` (live Moonraker binding)
- **DataValue binding:** `PrinterState::resolve(key)` maps keys like `"extruder.temperature"` → `"210°C"`
- **Rationale:** The canvas model is more flexible, matches how the Web UI frame builder will work, and requires only a mechanical conversion of existing content (face frames become single-element frames). Downstream phases build on the right model from day one.

## 2026-05-11: Cross-core PrinterState passing — direct struct store (no mutex)

- **Context:** `PrinterState` is written by `moonrakerTask` (Core 0) and read by `displayTask` (Core 1) via `DisplayManager::tickAll()`.
- **Option A:** Mutex — correct but adds lock overhead on the 30fps tick path
- **Option B:** Queue — follows established pattern but adds queue pressure for 5Hz updates
- **Option C:** Direct struct store — each float is 32-bit aligned, write is atomic on Xtensa LX6 ← **Chosen**
- **Rationale:** Individual float writes are atomic. The risk of reading mixed old/new values across fields is visually imperceptible at display timescales. No locks, no queue pressure, minimal code.

## 2026-05-11: Continuous Moonraker event sending

- **Context:** Previously `StateEvent` was only sent on printer state *transitions*. This meant progress/temp data was never forwarded during a print, making data binding useless.
- **Decision:** Always send `StateEvent` on every `notify_status_update`, regardless of whether the printer state changed. The `trigger` field is empty for data-only updates; `main.cpp` skips `onStateChange()` when trigger is empty but always calls `updateState()`.
- **Rationale:** Simple. Queue depth 5 + drain at 30fps >> send rate at ~5fps. Queue drops are silent and non-destructive (just use previous value).

## 2026-05-11: Mock mode architecture

- **Context:** Need to test the full pipeline (state changes → triggers → group switching → rendering) without a real Moonraker instance.
- **Option A:** Separate mock class implementing the same interface — more OOP, more files
- **Option B:** `#ifdef MOONRAKER_MOCK` inside `MoonrakerClient.cpp` — simpler, one file ← **Chosen**
- **Rationale:** The mock only replaces `begin()`, `tick()`, and `disconnect()`. All the rest (state machine, queue publishing) is the same. A single `#ifndef`/`#else`/`#endif` block keeps it all in one file and avoids an interface abstraction layer. Mock state machine: idle(5s) → printing(15s) → complete(3s) → idle.
