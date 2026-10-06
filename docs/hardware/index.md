# Hardware Compatibility

This section documents the physical hardware that has been tested and confirmed
working with Klippyface — including wiring, bus configuration, performance notes,
and known quirks.

Known board + display combinations are available as **board presets** in the Web UI's display dialog (`ui/src/lib/boards.ts`). Nodes report their firmware board in the WebSocket `hello`, so a new display on a Waveshare S3 board starts from its preset automatically.

| Category | Index | Verified |
|----------|-------|----------|
| **Display drivers** | [`display.md`](display.md) | SH1106, HX8347D, ST7789, GC9A01 |
| **MCU / dev boards** | [`mcu.md`](mcu.md) | ESP-WROOM-32 (ESP32 DevKit V1) |

> This is a community-maintained reference. If you've tested a display or board
> not listed here, open a PR or issue with your wiring details and we'll add it.
