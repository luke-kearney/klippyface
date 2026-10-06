---
title: Firmware Architecture
type: reference
stable: true
---

# ESP32 Firmware Architecture

## FreeRTOS Task Layout

```
main.cpp: setup()
  ├── I2C/SPI init
  ├── NVS config load
  └── xTaskCreatePinnedToCore() × N

┌────────────────────────────────────────────────────────────────┐
│ CORE 0 (protocol / background)     CORE 1 (display / timing)   │
│                                    │                            │
│  wifiTask         (pri 8)          │  displayTask    (pri 10)   │
│  moonrakerTask    (pri 9)          │    ticks all engines       │
│  serverClientTask (pri 6)          │    renders all displays    │
│  gcodeHandlerTask (pri 7)          │    ~30fps                 │
│  captivePortalTask(pri 5, idle)    │                            │
└────────────────────────────────────────────────────────────────┘
```

### Inter-Task Communication (FreeRTOS Queues)

```
moonrakerTask  ──→ [stateQueue]   ──→ displayTask
serverClientTask ──→ [configQueue] ──→ displayTask  (on-demand via WS refresh)
gcodeHandlerTask ──→ [commandQueue] ──→ displayTask
displayTask ──→ [DisplaySlot*] array (internal, no queue needed)
captivePortalTask ──→ [wifiConfigQueue] ──→ (saves to NVS, reboots)
```

Each queue carries a small struct (`StateEvent`, `ConfigUpdate`, `DisplayCommand`).

## Render Optimization

`DisplayManager::tickAll()` skips redundant redraws by tracking the last rendered frame pointer per slot:

```
tick(now_ms) → const Frame*  (from AnimationEngine)
  └── if frame != slot.lastRenderedFrame:
        renderFrame(frame, driver, sprites, state)
        driver->show()
        slot.lastRenderedFrame = frame
```

This prevents flicker on static content (boot screen, idle frames) while still rendering immediately when the engine advances to a new frame.

### Priority Guidelines

| Priority | Task |
|----------|------|
| 10 | `displayTask` (highest — display timing is critical) |
| 9 | `moonrakerTask` (WebSocket needs timely reads) |
| 8 | `wifiTask` (keep connection alive) |
| 7 | `gcodeHandlerTask` (responsiveness matters) |
| 6 | `serverClientTask` (background WS, config fetch on demand) |
| 5 | `captivePortalTask` (idle, only active on first boot) |

## Display Driver Abstraction

All rendering code talks to a pure virtual interface. Swapping displays = changing one concrete class.

```cpp
// display/DisplayDriver.h
class DisplayDriver {
public:
    virtual ~DisplayDriver() = default;
    virtual bool init() = 0;
    virtual void powerSave(bool enable) = 0;
    virtual int16_t width() const = 0;
    virtual int16_t height() const = 0;
    virtual bool isColor() const = 0;
    virtual uint8_t bitDepth() const = 0;
    virtual void clear(uint32_t color = 0) = 0;
    virtual void drawPixel(int16_t x, int16_t y, uint32_t color) = 0;
    virtual void drawBitmap(int16_t x, int16_t y,
                            const uint8_t* data, size_t dataSize,
                            int16_t w, int16_t h,
                            uint32_t color) = 0;
    virtual void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint32_t color) = 0;
    virtual void setCursor(int16_t x, int16_t y) = 0;
    virtual void setTextSize(uint8_t size) = 0;
    virtual void setTextColor(uint32_t color) = 0;
    virtual void print(const char* text) = 0;
    virtual void show() = 0;
};
```

**Color convention:** `uint32_t` is always RGB888 (8-8-8). Monochrome drivers map any non-zero → white (1), zero → black (0). Color drivers use the full value.

**`drawBitmap` auto-detect:** The `dataSize` parameter allows color drivers to distinguish between RGB565 sprites (`dataSize == w*h*2`) and 1-bit mask sprites (any other size). The renderer passes `sprite.byteSize()` from the source data.

### Driver Registry (Factory)

```cpp
DisplayDriver* createDriver(const char* type, const JsonObject& busConfig,
                            int16_t width, int16_t height, uint8_t rotation);
```

Adding a new display type = one class implementing `DisplayDriver` + one line in the factory.

**Bus config passthrough:** Drivers that need pin-level bus config (parallel, SPI) receive the raw `bus_config` JSON from the server database. The `DisplaySlotConfig::rawBusJson` field carries the full JSON blob, and `DisplayManager::applyConfig()` passes it directly to the factory, preserving all pins. If every display's driver type, size, rotation and bus config are unchanged from the running config, `applyConfig()` keeps the drivers and only swaps sprites and animation engines (no bus/panel re-init or flicker), keeping each display on the group it was showing. I2C drivers fall back to the struct-based `DisplayBusConfig` fields.

### Drivers

| Driver type | Class | Display | Bus | Color | Framebuffer |
|-------------|-------|---------|-----|-------|-------------|
| `sh1106` | `Sh1106Driver` | SH1106 128×64 | I2C | 1-bit mono | 1 KB (internal) |
| `hx8347` | `GfxDriver` | HX8347D 320×240 | 8-bit parallel | 16-bit RGB565 | Full canvas with PSRAM, else 10 bands of ~15 KB |
| `st7789` | `GfxDriver` | ST7789 / ST7789V2, any size (e.g. 240×240, 240×280) | SPI | 16-bit RGB565 | Full canvas w×h×2 (PSRAM if present), else bands |
| `gc9a01` | `GfxDriver` | GC9A01 240×240 round | SPI | 16-bit RGB565 | Full canvas 115 KB (PSRAM if present), else bands |

`ssd1306` and `ili9341` appear in the Web UI but have no firmware driver yet.

**`GfxDriver` (Arduino_GFX) notes:**
- Uses `moononournation/GFX Library for Arduino@1.3.5`: `Arduino_ESP32PAR8` + `Arduino_HX8347D`, or `Arduino_ESP32SPI` + `Arduino_ST7789` / `Arduino_GC9A01`. The driver owns and frees the bus, panel and canvas (the library frees none of them)
- Frames are drawn off-screen and pushed whole, so the panel never shows a cleared or half-drawn frame (drawing straight to the panel blanked it on every frame change). With PSRAM, or 48 KB of RAM to spare, that's one full-frame `Arduino_Canvas` flushed in `show()`. Otherwise the frame is rendered in equal horizontal **bands** of ~16 KB through one band-sized canvas: `DisplayManager` calls `beginBand(i)`, `renderFrame()` and `show()` once per band (`DisplayDriver::bandCount()`), drawing calls are offset to the band, and `Renderer` skips elements outside it (`rowsVisible()`). HX8347D on a classic ESP32: 10 bands of 240×32 (15 KB), ~51 ms per frame, dominated by the bus push. Direct drawing remains only as a fallback if even a band can't be allocated
- Bus config: SPI needs `sclk`, `mosi`, `dc`; `cs`, `rst`, `miso`, `bl` optional. `ips` (default on for SPI panels, off for HX8347D), `col_offset` / `row_offset` (e.g. `row_offset: 20` for 240×280 ST7789V2; `col_offset2` / `row_offset2` for the flipped rotations, default the same), `freq` (SPI Hz)
- Width/height for SPI panels are the panel's native size at rotation 0; HX8347D uses the controller's native 240×320 and `rotation` picks the orientation
- `DisplayManager` skips its shared `SPI.begin()` for these panels: Arduino_GFX sets up its own SPI host and pins
- Color conversion: `rgb888to565()` static helper (`0xRRGGBB` → `uint16_t RGB565`)
- Backlight: optional `bl` pin, switched on at init and toggled by `powerSave()`

## Animation Engine

Per-display state machine. Each `AnimationEngine` owns:
- A trigger→group mapping
- A current group pointer
- A current set + frame index
- Tick timing state

```
tick(now_ms) → const Frame*
  ├── Advances frame once its duration elapses: frame duration_ms,
  │   else set frame_time (fallback for frames with none), else 1000ms
  ├── Handles loop_count (0=forever, 1=play-once, N=play-N)
  └── Returns current frame (or null between loops)
```

## Renderer

Stateless free function: `renderFrame(Frame, DisplayDriver, PrinterState)`

1. Clear canvas to `Frame::bg_color`
2. For each `FrameElement`:
   - `text` → draw static string centred on (x, y) at GFX text size `size`
   - `sprite` → blit named bitmap with its top-left at (x, y); `size` > 1 draws each 1-bit pixel as a `size`×`size` block
   - `datavalue` → resolve Moonraker key via `PrinterState::resolve()`, draw the value centred on (x, y) at text size `size`

## Sprite Format

### Monochrome (1-bit, for OLEDs)

- Raw bytes, MSB-first, row-major
- Each row = `ceil(width / 8)` bytes
- Pixel (x,y) is at row `y`, byte `floor(x/8)`, bit `7 - (x % 8)`
- Encoded as base64 in JSON
- 64×64 sprite = 512 bytes → ~700 chars base64
- 16×16 sprite = 32 bytes → ~44 chars base64

### Color (16-bit, for future TFTs)

- Raw bytes, RGB565 format, row-major
- Each pixel = 2 bytes (5R + 6G + 5B)
- Encoded as base64 in JSON
- 240×240 sprite = 115 KB

### Web UI Conversion

The pixel editor in the web UI draws on a `<canvas>` (in native color), converts to native bit depth on save, and previews as the target display would render it.

## Memory Budget (Single Display, 128×64)

| Component | Flash | RAM |
|-----------|-------|-----|
| WiFi stack + FreeRTOS | ~200 KB | ~30 KB |
| Arduino core | ~50 KB | ~10 KB |
| ArduinoJson | ~20 KB | ~4 KB (heap) |
| WebSocket client | ~30 KB | ~6 KB |
| Adafruit_SH110X + GFX | ~15 KB | ~2 KB |
| Display engine (structs) | ~20 KB | ~4 KB (PROGMEM) |
| AnimationEngine + Renderer | ~15 KB | ~1 KB |
| Config JSON (parsed) | - | ~8 KB (heap) |
| Sprites (10 × 32×32) | ~5 KB (PROGMEM) | ~2 KB (decoded) |
| OLED framebuffer | - | 1 KB |
| **Total (approx)** | **~355 KB** | **~68 KB** |

ESP32 has 4 MB flash and ~320 KB usable RAM.

## Connection State Machine

Priority-based state monitoring in `main.cpp`:

```
WiFi off          → WIFI_OFFLINE       → send "wifi:disconnected"
WiFi on, MR off   → MOONRAKER_OFFLINE  → send "moonraker:disconnected"
WiFi on, MR on    → ONLINE             → (normal flow, no trigger)

## Companion Server WebSocket (ServerClient)

The `ServerClient` class (in `src/comms/ServerClient.h/.cpp`) maintains a persistent WebSocket
to the companion server, replacing the old 5-minute HTTP polling:

- **Connect:** `ws://{host}:{port}/api/ws/node/{mac}`
- **On connect:** sends `hello` with identity and `config_version`
- **Heartbeat:** every 30s, carries `heap_free`, `uptime_s`, `rssi`, `display_count`
- **Commands:** handles `refresh_config` (fetches config on-demand), `config_status` (version check). Both only set a pending flag; `tick()` runs one fetch for any number of requests, outside the WS callback. The fetched JSON is queued for `displayTask` as a heap `char*` (newest wins: an older queued config is evicted and freed) and parsed in place (ArduinoJson zero-copy).
- **Reconnect:** auto-reconnect at 5s interval (WebSockets library manages this)
```

Three dedicated groups: `wifi_offline`, `moonraker_offline`, `screen_sleep` (powers off display after 5min idle).
