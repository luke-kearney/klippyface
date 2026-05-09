# Klippyface Coding Conventions

> **Scope:** ESP32 firmware (C++). Server (.NET) and Web UI (JS) conventions to be added in future phases.

---

## 1. General C++ Style

### Header Guards

Use `#ifndef` / `#define` / `#endif` (not `#pragma once`). Format:

```cpp
#ifndef KLIPPYFACE_COMPONENT_NAME_H
#define KLIPPYFACE_COMPONENT_NAME_H

// ...

#endif
```

### Include Order

1. Own header (in .cpp files)
2. Arduino / ESP32 SDK headers (`<Arduino.h>`, `<WiFi.h>`, `<nvs.h>`, etc.)
3. Standard library headers (`<vector>`, `<map>`, etc.)
4. Project headers (`"config/Settings.h"`, `"display/DisplayDriver.h"`, etc.)

Each group separated by a blank line. Within each group, alphabetical order.

### Naming

| Thing | Convention | Example |
|-------|-----------|---------|
| Classes | `PascalCase` | `WifiManager`, `Sh1106Driver` |
| Methods (public) | `camelCase` | `begin()`, `tick()`, `isConnected()` |
| Methods (private) | `camelCase` | `readString()`, `onWiFiEvent()` |
| Member vars | `_camelCase` with leading underscore | `_handle`, `_ready`, `_eventGroup` |
| Constants | `UPPER_SNAKE` | `EVENT_CONNECTED`, `KEY_WIFI_SSID` |
| Local vars | `camelCase` | `ssid`, `len`, `result` |
| File-scope statics | `UPPER_SNAKE` | `static const char* TAG`, `static const char* NVS_NS` |

### Braces

Allman style — opening brace on its own line:

```cpp
class Settings {
public:
    static bool begin();

private:
    static nvs_handle_t _handle;
};

void Settings::begin() {
    // ...
}
```

No braces around single-line if/for/while bodies, unless the line wraps.

### Comments

Minimal. Use `//` for inline comments. No `/* */` block comments unless citing external spec text. No javadoc-style comment blocks.

---

## 2. Memory & Allocation

- **Static/stack allocation** preferred over heap where possible.
- **`new` only for objects with deferred construction** — e.g. `Adafruit_SH1106G*` stored as pointer and `new`'d in `init()`. The owning class manages the lifetime.
- **No `malloc`/`free`** — use `new`/`delete` or standard containers.
- **Arduino `String`** is acceptable for:
  - Config data structures (IDs, labels, values)
  - Short-lived formatting buffers
  - NVS read/write
- **`const char*` preferred** for:
  - Log messages and tag constants
  - Function parameters where the string is not mutated or stored
  - PROGMEM string literals
- **Standard containers** (`std::vector`, `std::map`) are safe on ESP32 Arduino core. Use them instead of hand-rolled dynamic arrays.
- **No global `new`/`delete` overloads** — keep the default allocator.

---

## 3. FreeRTOS Patterns

### Task Creation

```cpp
xTaskCreatePinnedToCore(
    taskFunction,   // void (*)(void*)
    "taskName",     // name for debugging
    stackSizeWords, // e.g. 4096
    nullptr,        // pvParameters
    priority,       // 1-24, higher = more important
    &taskHandle,    // TaskHandle_t*
    coreId          // 0 = protocol, 1 = display
);
```

### Priority Guidelines

| Priority | Used By |
|----------|---------|
| 10 | `displayTask` (highest — display timing is critical) |
| 9 | `moonrakerTask` (WebSocket needs timely reads) |
| 8 | `wifiTask` (keep connection alive) |
| 7 | `gcodeHandlerTask` (responsiveness matters) |
| 6 | `configFetcherTask` (background, can wait) |
| 5 | `captivePortalTask` (idle, only active on first boot) |

### Core Assignment

- **Core 0:** Protocol, networking, background I/O (WiFi, Moonraker, config fetch, GCODE handler)
- **Core 1:** Display rendering (timing-critical, ~30fps tick)

### Inter-Task Communication

- **Event Groups** for signalling state changes (WiFi connected/disconnected, config ready).
  - Multiple tasks can block on the same event group.
  - Use bits `BIT0` through `BIT7` — document the bit assignment per component.
- **Queues** for structured data transfer (state updates, config payloads, commands).
  - Carry small structs by value (e.g. `StateEvent`, `ConfigUpdate`, `DisplayCommand`).
  - Queue depth: 5-10 items typical.
- **Never** share mutable data between tasks without a queue or mutex. No shared pointers.
- **Never** call `delay()` inside a task — use `vTaskDelay(pdMS_TO_TICKS(N))`.

### Timer Accuracy

- Use `millis()` for `tick()` comparisons (AnimationEngine frame timing).
- `vTaskDelayUntil()` for fixed-rate tasks (displayTask at ~33ms = ~30fps).
- Do not rely on `vTaskDelay()` for precise timing — it guarantees minimum delay only.

---

## 4. Serial Logging Convention

### Format

```
[TAG] Message
```

Every component logs with a consistent uppercase tag:

| Tag | Component |
|-----|-----------|
| `[BOOT]` | `main.cpp` — startup |
| `[SETTINGS]` | `Settings` — NVS operations |
| `[WIFI]` | `WifiManager` — connection lifecycle |
| `[FACTORY]` | `DisplayFactory` — driver creation |
| `[DISPLAY]` | `DisplayManager` — display lifecycle and state changes |
| `[RENDER]` | `Renderer` — per-frame operations |
| `[SH1106]` | `Sh1106Driver` — low-level driver ops |
| `[CONFIG]` | `ConfigFetcher`, `ConfigDeserializer` |
| `[MOONRAKER]` | `MoonrakerClient` — WebSocket |
| `[GCODE]` | `GcodeHandler` — command processing |
| `[ENGINE]` | `AnimationEngine` — tick/state logic |
| `[PORTAL]` | `CaptivePortal` — setup AP mode |

### Tag Declaration

```cpp
// At top of .cpp file, after includes:
static const char* TAG = "DISPLAY";
```

### Logging Calls

```cpp
Serial.printf("[%s] Message: %s\n", TAG, value.c_str());
Serial.printf("[%s] State: %s (progress: %.1f%%)\n", TAG, state, progress);
```

- Always end with `\n`.
- No `Serial.println` without a tag.
- No logging in headers unless it's a small inline function.

---

## 5. Color Convention

### API Standard

All `uint32_t` color parameters across the codebase are **RGB888** (8-8-8):

```
0xRRGGBB
  RR = red   (0x00–0xFF)
  GG = green (0x00–0xFF)
  BB = blue  (0x00–0xFF)
```

### Driver Mapping

| Driver Type | Mapping |
|-------------|---------|
| Monochrome (SH1106, SSD1306) | Any non-zero → **1** (white), zero → **0** (black) |
| 16-bit color (ST7789, ILI9341) | Down-convert: `RGB888 → RGB565`: R upper 5, G upper 6, B upper 5 |
| 24-bit color (rare) | Pass through unchanged |

### Storage in Config Structs

Colors are stored pre-parsed as `uint32_t` in `Frame` structs. Hex string `"#FFFFFF"` → `0xFFFFFF` conversion happens once in `ConfigDeserializer` (Phase 4).

### Common Color Constants

```cpp
static const uint32_t COLOR_BLACK  = 0x000000;
static const uint32_t COLOR_WHITE  = 0xFFFFFF;
static const uint32_t COLOR_RED    = 0xFF0000;
static const uint32_t COLOR_GREEN  = 0x00FF00;
static const uint32_t COLOR_BLUE   = 0x0000FF;
static const uint32_t COLOR_YELLOW = 0xFFFF00;
```

---

## 6. File Organization

### Structure

```
src/
├── main.cpp                          # setup() + xTaskCreatePinnedToCore()
├── config/                           # Persistent settings (NVS)
├── wifi/                             # WiFi management
├── display/                          # DisplayDriver abstraction + implementations
├── engine/                           # Animation engine, config structs, data binding
└── comms/                            # Moonraker, HTTP, GCODE handling
```

### File Pairing

- One `.h` / `.cpp` pair per class.
- Header: declarations, brief documentation, inline trivial getters/setters.
- Source: implementations, `TAG` constant, private helpers.
- Free functions (factories, converters, utilities) may share a `.h`/`.cpp` pair when they're closely related (e.g. `DisplayFactory.h/.cpp`).

### Namespace

- All code is in the **global namespace**. No `namespace klippyface` or similar.
- The `KLIPPYFACE_` prefix in header guards is sufficient for disambiguation.

### What Goes in Headers

- Class declarations
- Public method signatures with parameter names
- Pure virtual interfaces
- Struct definitions
- Free function declarations
- `#include` directives for types used in the public API

### What Goes in Source Files

- All implementation code
- `static const char* TAG` declaration
- `static` file-scope helpers
- `#include` directives for types only needed in implementation

---

## 7. Error Handling

- **Constructor failures:** use `init()` pattern (return `bool`). Never throw exceptions.
- **Resource allocation failure:** check `nullptr` after `new`. Log and degrade gracefully.
- **Communication failures:** log at `[TAG]` level, retry with backoff, never crash.
- **Configuration errors:** log the invalid field, use defaults for missing fields, never halt.
- **Watchdog:** Don't feed the task watchdog in long operations — use `vTaskDelay()` or yield periodically.

---

## 8. Code Review Checklist

Before submitting any firmware change, verify:

- [ ] Header guard uses `KLIPPYFACE_` prefix
- [ ] Include order follows convention
- [ ] All `Serial` output uses `[TAG]` prefix
- [ ] `TAG` is declared `static const char*` in .cpp
- [ ] No `delay()` calls in task functions
- [ ] No `malloc`/`free` calls
- [ ] No global mutable state shared across tasks without queue/mutex
- [ ] Member variables use `_` prefix
- [ ] Color values use `uint32_t` RGB888 format in public API
- [ ] `new` has matching `delete` in destructor or cleanup
