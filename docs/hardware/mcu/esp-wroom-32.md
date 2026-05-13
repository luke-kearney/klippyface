# ESP-WROOM-32 (ESP32 DevKit V1)

The standard ESP32 development board used for initial Klippyface development
and testing.

## Specifications

| Item | Value |
|------|-------|
| Chip | ESP32-D0WDQ6 (dual-core Xtensa LX6 @ 240 MHz) |
| Flash | 4 MB (SPI) |
| PSRAM | None |
| SRAM | 520 KB (~320 KB usable after FreeRTOS) |
| USB-UART | CP2102 or CH340C (board-dependent) |
| GPIO | 25 available (many strapping-constrained) |
| ADC | 2 × 12-bit SAR (pins 32–39) |

## Pinout Reference

```
                    ┌─────────────┐
     EN ────────────│ RST         │
     3V3 ───────────│ 3V3      D6 │── GPIO 12  (strapping: flash voltage)
     GND ───────────│ GND      D5 │── GPIO 13
     GPIO 23 ───────│ D7       D4 │── GPIO 14
     GPIO 22 ───────│ D8       D3 │── GPIO 15  (strapping: boot log)
     GPIO 1  ───────│ TX       D2 │── GPIO 16
     GPIO 3  ───────│ RX       D1 │── GPIO 17
     GPIO 21 ───────│ D9       D0 │── GPIO 18
     GND ───────────│ GND      D10│── GPIO 19
     GPIO 19 ───────│ D11      D11│── GPIO 21
     GPIO 18 ───────│ D12      D12│── GPIO 22
     GPIO 5  ───────│ D13      D13│── GPIO 23
     GPIO 17 ───────│ D14      D14│── GPIO 24
     GPIO 16 ───────│ D15      D15│── GPIO 25
                    └─────────────┘
```

> This is the commonly available pin layout. If your board has a different
> USB-UART chip or pin mapping, check the manufacturer's documentation.

## Strapping Pins

These pins have special functions at boot. Connecting them to certain
voltages can prevent the ESP32 from booting:

| Pin | Function | Notes |
|-----|----------|-------|
| GPIO 0 | Boot mode | LOW = flash mode, HIGH = normal boot |
| GPIO 2 | Boot log | Must be LOW or floating at boot |
| GPIO 5 | SDIO slave | Must be HIGH at boot for normal flash |
| GPIO 12 | Flash voltage | LOW = 3.3V flash, HIGH = 1.8V flash (brownout if floating) |
| GPIO 15 | Boot log | Must be LOW at boot |

## Known Issues / Errata

- **GPIO 12 (D6) strapping:** Many Klippyface pin assignments avoid GPIO 12
  for the HX8347D parallel data bus because of the strapping behaviour. If you
  must use it, add an external pull-down resistor (~10kΩ) to GND.
- **GPIO 1 (TX) and GPIO 3 (RX):** These are connected to the USB-UART bridge.
  Using them as GPIO will interfere with serial output. Avoid if possible, or
  disable Serial logging.
- **PSRAM:** The ESP-WROOM-32 module does not include PSRAM. The `St7789Driver`
  and `Ili9341Driver` require PSRAM for their framebuffers and will not work on
  this board without external PSRAM.

## Verified Hardware

| Board | Tested By | Date | Notes |
|-------|-----------|------|-------|
| ESP32 DevKit V1 (CP2102) | @user | 2026-04 | Dual SH1106 I2C, HX8347D parallel 8 — all working |
