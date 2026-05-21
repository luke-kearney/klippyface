# HX8347D — 320×240 TFT (Parallel 8)

## Wiring / Pinout

The HX8347D uses an 8-bit parallel bus interface which requires many GPIO pins.

| ESP32 Pin | Display Pin | Notes |
|-----------|-------------|-------|
| GPIO 32   | DC          | Data/Command |
| GPIO 5    | CS          | Chip select (active low) |
| GPIO 26   | WR          | Write strobe |
| GPIO 27   | RD          | Read strobe (can tie to 3.3V if unused) |
| GPIO 33   | RST         | Reset (active low) |
| GPIO 12–19 | D0–D7      | 8-bit data bus (contiguous block) |
| 3.3V      | VCC         | — |
| GND       | GND         | — |
| GPIO 4    | BL          | Backlight PWM (optional, configurable) |

> **Bus width note:** The HX8347D supports both 8-bit and 16-bit parallel modes.
> Klippyface uses 8-bit mode (`Arduino_ESP32PAR8`). This requires 8 data pins
> plus 4 control pins = 12 GPIOs minimum.

### Recommended Pin Assignment

```
DC   = GPIO 32
CS   = GPIO 5
WR   = GPIO 26
RD   = GPIO 27
RST  = GPIO 33
BL   = GPIO 4      (optional, set in bus config)
D0   = GPIO 12
D1   = GPIO 13
D2   = GPIO 14
D3   = GPIO 15
D4   = GPIO 16
D5   = GPIO 17
D6   = GPIO 18
D7   = GPIO 19
```

> GPIO 12 is pulled up at boot on ESP32 — if strapping causes issues, shift
> the data bus to a different contiguous block (e.g. GPIO 2,4,12–17).

## Bus Config (for Web UI)

```json
{
  "dc": 32,
  "cs": 5,
  "wr": 26,
  "rd": 27,
  "rst": 33,
  "bl": 4,
  "ips": 1
}
```

| Field | Description |
|-------|-------------|
| `dc`  | Data/Command pin |
| `cs`  | Chip select pin |
| `wr`  | Write strobe pin |
| `rd`  | Read strobe pin |
| `rst` | Reset pin |
| `bl`  | Backlight PWM pin (omit if not used) |
| `ips` | `1` = IPS panel (invert colours), `0` = non-IPS |

## Photos

*(Wiring photos to be added — open a PR if you have a clear photo of your setup)*

## Performance Notes

| Metric | Value |
|--------|-------|
| Framebuffer | None (writes go directly to display GRAM) |
| Max ~fps | ~25 fps (bus-limited) |
| Write mode | Direct GRAM (`show()` is a no-op) |
| PSRAM required | No |
| Power draw | ~80 mA (backlight dependent) |

The HX8347D uses `Arduino_GFX` (`moononournation/GFX Library for Arduino@1.3.5`)
with the `Arduino_HX8347D` + `Arduino_ESP32PAR8` classes. Colour conversion
from RGB888 to RGB565 is handled by a static `rgb888to565()` helper.

## Known Issues / Errata

- **GPIO 12 strapping pin:** GPIO 12 is the strapping pin for flash voltage.
  If your board pulls it high at boot, the ESP32 may brown out. Use a different
  pin for D0, or add a pull-down resistor.
- **Bus noise:** Long jumper wires (>15 cm) on the parallel data bus can cause
  display corruption. Keep wires as short as possible, or use a PCB.
- **Backlight:** The `bl` pin is optional. If omitted, the backlight defaults
  to full brightness. Some display modules have a hardware jumper for backlight
  control — check your module's documentation.
- **IPS vs non-IPS:** If colours appear inverted, toggle the `ips` field in
  bus config (`1` → `0` or `0` → `1`).

## Verified Hardware

> Template — replace with your tested devices when confirmed.

| Device | Tested By | Date | Notes |
|--------|-----------|------|-------|
| _( add device here )_ | _your name_ | _date_ | _wiring notes_ |
