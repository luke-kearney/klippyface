# SH1106 — 128×64 OLED (I2C)

## Wiring / Pinout

| ESP32 Pin | Display Pin |
|-----------|-------------|
| GPIO 21   | SDA         |
| GPIO 22   | SCL         |
| 3.3V      | VCC         |
| GND       | GND         |

Some SH1106 modules lack onboard pull-up resistors on SDA and SCL.
If the display is glitchy or doesn't initialise, add external 4.7kΩ–10kΩ
pull-ups to 3.3V on both lines.

### Dual Display Wiring

Klippyface supports two SH1106 displays on the same I2C bus at different
addresses (0x3C and 0x3D). Wire both displays in parallel:

```
ESP32 SDA ──┬── Display #1 SDA
            └── Display #2 SDA

ESP32 SCL ──┬── Display #1 SCL
            └── Display #2 SCL
```

## Bus Config (for Web UI)

For the default address (0x3C):

```json
{ "address": "0x3C", "sda": 21, "scl": 22 }
```

For the secondary address (0x3D) on a second display:

```json
{ "address": "0x3D", "sda": 21, "scl": 22 }
```

> The driver accepts any valid I2C address. Some modules let you change
> the address by bridging the RESET pin or a solder jumper.

## Photos

*(Wiring photos to be added — open a PR if you have a clear photo of your setup)*

## Performance Notes

| Metric | Value |
|--------|-------|
| Framebuffer | 1 KB (internal) |
| Max ~fps (single display) | ~30 fps |
| Max ~fps (dual display, same bus) | ~20 fps |
| I2C speed | 400 kHz (default), up to ~800 kHz with `Wire.setClock()` |
| PSRAM required | No |
| Power draw | ~20 mA (typical) |

## Known Issues / Errata

- **Pull-up resistors:** Many cheap SH1106 modules (HiLetgo, AZDelivery) do not
  include I2C pull-ups. Without them, initialisation may fail or the display may
  show random pixels at boot. Add 4.7kΩ–10kΩ resistors on SDA and SCL to 3.3V.
- **Address confusion:** Some modules labelled "SH1106" use an SSD1306
  controller instead. The SH1106 driver in Klippyface also works with SSD1306 —
  if your display doesn't respond at 0x3C or 0x3D, try both addresses.
- **Ghosting:** Frame durations below ~100 ms can produce visible ghosting on
  older SH1106 modules. Keep animations above 200 ms per frame for best results.
- **Reset pin:** Some modules require the RESET pin to be held high (connect to
  3.3V through a 10kΩ resistor) for reliable power-on.

## Verified Hardware

| Device | Tested By | Date | Notes |
|--------|-----------|------|-------|
| HiLetgo 1.3" 128×64 I2C OLED | @user | 2026-04 | Default wiring, no pull-ups needed on this batch |
| AZDelivery 0.96" 128×64 I2C OLED | @user | 2026-04 | Needed external 4.7kΩ pull-ups |
