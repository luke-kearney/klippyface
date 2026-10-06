# Display Drivers

| Driver | Display | Bus | Status | Details |
|--------|---------|-----|--------|---------|
| `Sh1106Driver` | SH1106 128×64 OLED | I2C | ✅ Verified | [sh1106/](display/sh1106/) |
| `GfxDriver` (`hx8347`) | HX8347D 320×240 TFT | Parallel 8 | ✅ Verified (also with `GfxDriver`) | [hx8347d/](display/hx8347d/) |
| `GfxDriver` (`st7789`) | ST7789 / ST7789V2 TFT, e.g. 240×280 on Waveshare ESP32-S3-Touch-LCD-1.69 | SPI | ⬜ Builds, untested | — |
| `GfxDriver` (`gc9a01`) | GC9A01 240×240 round TFT, e.g. Waveshare ESP32-S3-LCD-1.28 | SPI | ⬜ Builds, untested | — |
| — | SSD1306 128×64 OLED, ILI9341 320×240 TFT | — | ⬜ No driver yet | — |
