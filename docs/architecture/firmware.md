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
│  configFetcherTask(pri 6)          │    renders all displays    │
│  gcodeHandlerTask (pri 7)          │    ~30fps                 │
│  captivePortalTask(pri 5, idle)    │                            │
└────────────────────────────────────────────────────────────────┘
```

### Inter-Task Communication (FreeRTOS Queues)

```
moonrakerTask ──→ [stateQueue]  ──→ displayTask
configFetcherTask ──→ [configQueue] ──→ displayTask
gcodeHandlerTask ──→ [commandQueue] ──→ displayTask
displayTask ──→ [DisplaySlot*] array (internal, no queue needed)
captivePortalTask ──→ [wifiConfigQueue] ──→ (saves to NVS, reboots)
```

Each queue carries a small struct (`StateEvent`, `ConfigUpdate`, `DisplayCommand`).

### Priority Guidelines

| Priority | Task |
|----------|------|
| 10 | `displayTask` (highest — display timing is critical) |
| 9 | `moonrakerTask` (WebSocket needs timely reads) |
| 8 | `wifiTask` (keep connection alive) |
| 7 | `gcodeHandlerTask` (responsiveness matters) |
| 6 | `configFetcherTask` (background, can wait) |
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
    virtual void drawBitmap(int16_t x, int16_t y, const uint8_t* data, int16_t w, int16_t h, uint32_t color) = 0;
    virtual void fillRect(int16_t x, int16_t y, int16_t w, int16_t h, uint32_t color) = 0;
    virtual void setCursor(int16_t x, int16_t y) = 0;
    virtual void setTextSize(uint8_t size) = 0;
    virtual void setTextColor(uint32_t color) = 0;
    virtual void print(const char* text) = 0;
    virtual void show() = 0;
};
```

**Color convention:** `uint32_t` is always RGB888 (8-8-8). Monochrome drivers map any non-zero → white (1), zero → black (0). Color drivers use the full value.

### Driver Registry (Factory)

```cpp
DisplayDriver* createDriver(const char* type, const JsonObject& busConfig,
                            int16_t width, int16_t height, uint8_t rotation);
```

Adding a new display type = one class implementing `DisplayDriver` + one line in the factory.

### Drivers

| Driver | Display | Bus | Color | Framebuffer |
|--------|---------|-----|-------|-------------|
| `Sh1106Driver` | SH1106 128×64 | I2C | 1-bit mono | 1 KB (internal) |
| `Ssd1306Driver` | SSD1306 128×64 | I2C | 1-bit mono | 1 KB (internal) |
| `St7789Driver` | ST7789 240×240 (future) | SPI | 16-bit RGB565 | 115 KB (PSRAM) |
| `Ili9341Driver` | ILI9341 320×240 (future) | SPI | 16-bit RGB565 | 150 KB (PSRAM) |

## Animation Engine

Per-display state machine. Each `AnimationEngine` owns:
- A trigger→group mapping
- A current group pointer
- A current set + frame index
- Tick timing state

```
tick(now_ms) → const Frame*
  ├── Advances frame if duration_ms elapsed
  ├── Handles loop_count (0=forever, 1=play-once, N=play-N)
  ├── Applies set-level frame_time override
  └── Returns current frame (or null between loops)
```

## Renderer

Stateless free function: `renderFrame(Frame, DisplayDriver, PrinterState)`

1. Clear canvas to `Frame::bg_color`
2. For each `FrameElement`:
   - `text` → draw static string at (x, y)
   - `sprite` → blit named bitmap at (x, y)
   - `datavalue` → resolve Moonraker key via `PrinterState::resolve()`, draw `label: value` at (x, y)

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
```

Three dedicated groups: `wifi_offline`, `moonraker_offline`, `screen_sleep` (powers off OLED after 30s idle).
