# Supported MCUs / Dev Boards

| Board | Build env | Chip | Flash | PSRAM | Status | Details |
|-------|-----------|------|-------|-------|--------|---------|
| ESP32 DevKit V1 | `esp32dev` | ESP-WROOM-32 | 4 MB | None | ✅ Verified | [esp-wroom-32.md](mcu/esp-wroom-32.md) |
| Waveshare ESP32-S3-Touch-LCD-1.69 | `esp32s3-ws-lcd169` | ESP32-S3R8 | 16 MB | 8 MB octal | ⬜ Builds, untested on hardware | ST7789V2 240×280 (DC 4, CS 5, CLK 6, MOSI 7, RST 8, BL 15); native USB serial (`/dev/ttyACM*`); GPIO41 held high at boot to keep battery power on |
| Waveshare ESP32-S3-LCD-1.28 | `esp32s3-ws-lcd128` | ESP32-S3R2 | 16 MB | 2 MB quad | ⬜ Builds, untested on hardware | GC9A01A 240×240 round (DC 8, CS 9, CLK 10, MOSI 11, RST 12, BL 40); CH343P USB-UART (`/dev/ttyUSB*`) |

PSRAM type and USB serial mode are fixed at build time, so each board has its own env. Per-board fallback pins and quirks live in `src/config/Board.h`. Panel drivers for the S3 boards are tracked in #21 (ST7789) and #29 (GC9A01).
