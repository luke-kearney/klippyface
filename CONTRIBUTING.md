# Contributing to Klippyface

Thanks for your interest! This is a multi-node ESP32 display system driven by Moonraker/Klipper printer data. All contributions — bug fixes, features, docs, tests — are welcome.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [How to Contribute](#how-to-contribute)
- [Coding Conventions](#coding-conventions)
- [Git Commit Conventions](#git-commit-conventions)
- [Versioning & Releases](#versioning--releases)
- [Code Review Checklist](#code-review-checklist)

---

## Prerequisites

- **ESP32 firmware:** [PlatformIO](https://platformio.org/) (VS Code extension or CLI)
- **Companion server:** .NET 10 SDK (`dotnet --version` should show `10.x`)
- **Web UI:** Node.js 20+ and npm
- **Hardware (optional):** ESP32 dev board + SH1106 OLED (I2C) for physical testing

---

## Quick Start

### Firmware (ESP32)

```bash
# Build the mock variant (no printer needed)
pio run -e esp32dev-mock

# Flash to device
pio run -e esp32dev -t upload

# View serial console
pio device monitor
```

### Server (.NET)

```bash
cd server
dotnet run
# → http://localhost:5000
```

### Web UI

```bash
cd ui
npm install
npm run dev
# → http://localhost:5173 (proxies /api to :5000)

# Production build
npm run build
# → outputs to server/wwwroot/
```

---

## How to Contribute

1. **Open an issue first** for significant changes — lets us discuss design before you write code.
2. **Branch from `develop`**. Name your branch something descriptive: `fix/oled-init-timing`, `feat/progress-bar-style`.
3. **One logical change per commit** — don't bundle unrelated work.
4. **Open a PR** against `develop`. Include a summary of what changed and why. Reference any related issues.
5. **Pass the review checklist** (see below) before requesting review.

---

## Coding Conventions

### C++ Style (Firmware)

**Header guards:** Use `#ifndef` / `#define` / `#endif` (not `#pragma once`).

```cpp
#ifndef KLIPPYFACE_COMPONENT_NAME_H
#define KLIPPYFACE_COMPONENT_NAME_H
// ...
#endif
```

**Include order** (separate groups by blank line, alphabetical within):

1. Own header (in `.cpp` files)
2. Arduino / ESP32 SDK headers (`<Arduino.h>`, `<WiFi.h>`, `<nvs.h>`)
3. Standard library headers (`<vector>`, `<map>`)
4. Project headers (`"config/Settings.h"`, `"display/DisplayDriver.h"`)

**Naming:**

| Thing | Convention | Example |
|-------|-----------|---------|
| Classes | `PascalCase` | `WifiManager`, `Sh1106Driver` |
| Public methods | `camelCase` | `begin()`, `tick()`, `isConnected()` |
| Private methods | `camelCase` | `readString()`, `onWiFiEvent()` |
| Member variables | `_camelCase` (leading underscore) | `_handle`, `_ready` |
| Constants | `UPPER_SNAKE` | `EVENT_CONNECTED`, `KEY_WIFI_SSID` |
| Local variables | `camelCase` | `ssid`, `len`, `result` |

**Braces:** Allman style (opening brace on its own line). No braces around single-line `if`/`for`/`while` unless the line wraps.

**Comments:** Minimal. Use `//` for inline. No `/* */` block comments. No javadoc.

### Memory & Allocation

- Prefer static/stack allocation over heap.
- Use `new` only for objects with deferred construction (e.g. display driver created in `init()`). The owning class manages lifetime.
- No `malloc`/`free` — use `new`/`delete` or standard containers.
- Arduino `String` is acceptable for config data, short formatting buffers, and NVS read/write.
- `const char*` preferred for log messages, function params (when not mutated/stored), and PROGMEM literals.
- Standard containers (`std::vector`, `std::map`) are safe on ESP32 Arduino core.
- No global `new`/`delete` overloads.

### FreeRTOS Patterns

**Task creation:**

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

**Core assignment:**
- Core 0: Protocol, networking, background I/O (WiFi, Moonraker, config fetch, GCODE)
- Core 1: Display rendering (timing-critical, ~30fps tick)

**Priority guidelines:**

| Priority | Task |
|----------|------|
| 10 | `displayTask` |
| 9 | `moonrakerTask` |
| 8 | `wifiTask` |
| 7 | `gcodeHandlerTask` |
| 6 | `serverClientTask` |
| 5 | `captivePortalTask` |

**Inter-task communication:**
- Use **Event Groups** for signalling state changes (WiFi up/down, config ready). Document bit assignments.
- Use **Queues** for structured data transfer. Carry small structs by value (`StateEvent`, `ConfigUpdate`, `DisplayCommand`). Queue depth 5-10.
- Never share mutable data between tasks without a queue or mutex. No shared pointers.
- Never call `delay()` inside a task — use `vTaskDelay(pdMS_TO_TICKS(N))`.

**Timer accuracy:**
- Use `millis()` for `tick()` comparisons (AnimationEngine frame timing).
- Use `vTaskDelayUntil()` for fixed-rate tasks (displayTask at ~33ms for ~30fps).
- `vTaskDelay()` guarantees minimum delay only — don't rely on it for precise timing.

### Serial Logging

**Format:** `[TAG] Message`

**Tag table:**

| Tag | Component |
|-----|-----------|
| `[BOOT]` | `main.cpp` — startup |
| `[SETTINGS]]` | `Settings` — NVS operations |
| `[WIFI]` | `WifiManager` |
| `[FACTORY]` | `DisplayFactory` |
| `[DISPLAY]` | `DisplayManager` |
| `[RENDER]` | `Renderer` |
| `[SH1106]` | `Sh1106Driver` |
| `[HX8347]` | `Hx8347Driver` |
| `[CONFIG]` | `ConfigFetcher`, `ConfigDeserializer` |
| `[SRVCLIENT]` | `ServerClient` |
| `[MOONRAKER]` | `MoonrakerClient` |
| `[GCODE]` | `GcodeHandler` |
| `[ENGINE]` | `AnimationEngine` |
| `[PORTAL]` | `CaptivePortal` |

Declare the tag at the top of each `.cpp` file:

```cpp
static const char* TAG = "DISPLAY";
```

Always end with `\n`. No `Serial.println` without a tag. No logging in headers unless it's a small inline function.

### Color Convention

All `uint32_t` color parameters are **RGB888** (8-8-8): `0xRRGGBB`.

| Driver type | Mapping |
|-------------|---------|
| Monochrome (SH1106, SSD1306) | Non-zero → 1 (white), zero → 0 (black) |
| 16-bit color (ST7789, ILI9341) | RGB888 → RGB565 (R upper 5, G upper 6, B upper 5) |

### File Organization

```
src/
├── main.cpp              # setup() + xTaskCreatePinnedToCore()
├── config/               # Persistent settings (NVS)
├── wifi/                 # WiFi management
├── display/              # DisplayDriver abstraction + implementations
├── engine/               # Animation engine, config structs, data binding
└── comms/                # Moonraker, HTTP, GCODE handling
```

One `.h`/`.cpp` pair per class. Free functions may share a pair when closely related.

All code is in the global namespace. The `KLIPPYFACE_` prefix in header guards is sufficient for disambiguation.

### Error Handling

- **Constructor failures:** Use `init()` pattern (return `bool`). Never throw exceptions.
- **Resource allocation failure:** Check `nullptr` after `new`. Log and degrade gracefully.
- **Communication failures:** Log at `[TAG]` level, retry with backoff, never crash.
- **Configuration errors:** Log the invalid field, use defaults for missing fields, never halt.
- **Watchdog:** Don't feed the task watchdog in long operations — use `vTaskDelay()` or yield periodically.

---

## Git Commit Conventions

**Format:**

```
<subject line — ≤50 chars, imperative mood, capitalised, no trailing period>

<body — wrap at 72 chars, explain what changed and why>
```

**Example:**

```
Add progress bar rendering with colour gradient

- Render print_stats.progress as a horizontal bar with border
- Colour transitions from red→yellow→green based on percentage
- Support configurable bar height and label prefix
```

**Guidelines:**
- Subject verb: `Add`, `Fix`, `Update`, `Remove`, `Refactor`, `Sync` — imperative, no past tense
- Body: bullet points starting with `-`, each describing one logical change
- Include context if the reason isn't obvious from the diff
- Reference GitHub Issues where relevant (e.g. `Closes #12`)

---

## Versioning & Releases

Firmware, server and Web UI share one version, following [semver](https://semver.org/) (0.x while the JSON contract is still unstable).

**Source of truth:** the `VERSION` file at the repo root.

| Component | How it picks up the version |
|-----------|-----------------------------|
| Firmware | `scripts/version.py` generates `KlippyfaceVersion.h` → `KLIPPYFACE_VERSION`. Logged at `[BOOT]` and sent as `fw_version` in the WebSocket `hello` |
| Server | `Klippyface.Server.csproj` reads `../VERSION` into `<Version>` |
| Web UI | `ui/package.json` `version` — keep in sync manually |

Firmware builds from the matching `v<VERSION>` tag report the plain version (`0.2.0`). Any other build appends the commit (`0.2.0+g1a2b3c4`, plus `.dirty` for uncommitted changes), so test builds can be identified from serial logs.

**Branches:**

| Branch | Purpose |
|--------|---------|
| `develop` | Integration branch — all feature/fix PRs target this |
| `master` | Released code only — every commit on `master` is a tagged release |

**Cutting a release:**

1. Bump `VERSION` and `ui/package.json` in a PR into `develop` (`Bump version to X.Y.Z`)
2. Open a PR from `develop` into `master` and merge it
3. Tag the merge commit on `master` and push: `git tag vX.Y.Z && git push origin vX.Y.Z`

---

## Code Review Checklist

Before submitting a firmware change, verify:

- [ ] Header guard uses `KLIPPYFACE_` prefix
- [ ] Include order follows convention (own → SDK → std → project)
- [ ] All `Serial` output uses `[TAG]` prefix
- [ ] `TAG` is declared `static const char*` in `.cpp`
- [ ] No `delay()` calls in task functions
- [ ] No `malloc`/`free` calls
- [ ] No global mutable state shared across tasks without queue/mutex
- [ ] Member variables use `_` prefix
- [ ] Color values use `uint32_t` RGB888 format in public API
- [ ] `new` has matching `delete` in destructor or cleanup
