# HX8347D — 320×240 TFT (Parallel 8)

## Wiring / Pinout

The HX8347D uses an 8-bit parallel bus interface which requires many GPIO pins.

Verified wiring (ESP32 DevKit V1). These are also the Web UI defaults. Shield
labels in brackets: these 2.8" Uno-style shields call DC **LCD_RS**
(Register Select).

| ESP32 Pin | Display Pin | Notes |
|-----------|-------------|-------|
| GPIO 32   | DC (LCD_RS) | Data/Command (register select) |
| GPIO 5    | CS (LCD_CS) | Chip select (active low) |
| GPIO 26   | WR (LCD_WR) | Write strobe |
| —         | RD (LCD_RD) | Read strobe: not used by the firmware (`rd: -1`). Must be held **high**: tie to 3.3V unless the shield already pulls it up |
| GPIO 33   | RST (LCD_RST) | Reset (active low) |
| GPIO 4, 13, 18, 19, 14, 12, 23, 25 | D0–D7 (LCD_D0–D7) | 8-bit data bus, in that order |
| 3.3V / 5V | VCC         | Per the shield's regulator |
| GND       | GND         | — |
| —         | BL          | Usually always on; set `bl` only if your module exposes a backlight control pin |

> **Bus width note:** The HX8347D supports both 8-bit and 16-bit parallel modes.
> Klippyface uses 8-bit mode (`Arduino_ESP32PAR8`): 8 data pins plus DC, CS,
> WR and RST = 12 GPIOs (13 if RD is wired to a GPIO instead of 3.3V).

> **RD:** the firmware only writes to the panel. With `rd: -1` it leaves the pin
> alone, so it must be pulled high in hardware. If you wire it to a GPIO and set
> `rd`, the driver drives it high at start-up instead.

## Bus Config (for Web UI)

```json
{
  "dc": 32,
  "cs": 5,
  "wr": 26,
  "rd": -1,
  "rst": 33,
  "d0": 4, "d1": 13, "d2": 18, "d3": 19,
  "d4": 14, "d5": 12, "d6": 23, "d7": 25,
  "ips": true
}
```

| Field | Description |
|-------|-------------|
| `dc`  | Data/Command pin (shield: LCD_RS) |
| `cs`  | Chip select pin |
| `wr`  | Write strobe pin |
| `rd`  | Read strobe pin, `-1` if tied high in hardware |
| `rst` | Reset pin |
| `d0`–`d7` | Data bus pins |
| `bl`  | Backlight pin (omit if not used) |
| `ips` | `true` = IPS panel (invert colours) |

**Orientation:** the controller is natively 240×320 (portrait) at rotation 0.
For a 320×240 landscape display, set rotation to 90° or 270°.

## Photos

*(Wiring photos to be added — open a PR if you have a clear photo of your setup)*

## Performance Notes

| Metric | Value |
|--------|-------|
| Framebuffer | Banded: 10 × 240×32 bands through one 15 KB buffer (full canvas if the board has PSRAM) |
| Max ~fps | ~25 fps (bus-limited) |
| Write mode | Each band pushed in one write; ~51 ms per frame on a classic ESP32, no blank-then-redraw flash |
| PSRAM required | No |
| Power draw | ~80 mA (backlight dependent) |

The HX8347D uses `Arduino_GFX` (`moononournation/GFX Library for Arduino@1.3.5`)
with the `Arduino_HX8347D` + `Arduino_ESP32PAR8` classes. Colour conversion
from RGB888 to RGB565 is handled by a static `rgb888to565()` helper.

## Known Issues / Errata

- **GPIO 12 strapping pin (D5):** GPIO 12 selects the flash voltage at boot.
  If the shield holds that data line high while the ESP32 resets, it picks
  1.8 V flash and won't boot. If you see that, move D5 to another free GPIO.
- **Bus noise:** Long jumper wires (>15 cm) on the parallel data bus can cause
  display corruption. Keep wires as short as possible, or use a PCB.
- **Backlight:** The `bl` pin is optional. If omitted, the backlight defaults
  to full brightness. Some display modules have a hardware jumper for backlight
  control — check your module's documentation.
- **IPS vs non-IPS:** If colours appear inverted, toggle the `ips` field in
  bus config (`1` → `0` or `0` → `1`).

## Verified Hardware

| Device | Tested By | Date | Notes |
|--------|-----------|------|-------|
| 2.8" HX8347D Uno-style shield on ESP32 DevKit V1 | Luke Kearney | 2026-10-06 | Wiring as above, RD not connected to a GPIO, IPS on. Verified with `GfxDriver` (v0.5.0 dev) |
