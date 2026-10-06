// Known board + display combinations for the display dialog. `board` matches the
// firmware build env a node reports in its hello (src/config/Board.h), so a new
// display on that node can start from the right preset. Pins mirror
// docs/hardware/.

export interface BoardPreset {
  id: string
  label: string
  /** Firmware build env this preset is for. */
  board: string
  driverType: string
  busType: 'i2c' | 'spi' | 'parallel8'
  width: number
  height: number
  rotation: number
  busConfig: Record<string, number | string | boolean>
}

export const BOARD_PRESETS: BoardPreset[] = [
  {
    id: 'esp32dev-sh1106',
    label: 'ESP32 DevKit + SH1106 OLED 128×64',
    board: 'esp32dev',
    driverType: 'sh1106',
    busType: 'i2c',
    width: 128,
    height: 64,
    rotation: 0,
    busConfig: { address: '0x3C', sda: 21, scl: 22 },
  },
  {
    id: 'esp32dev-hx8347d',
    label: 'ESP32 DevKit + 2.8" HX8347D shield (parallel)',
    board: 'esp32dev',
    driverType: 'hx8347',
    busType: 'parallel8',
    width: 320,
    height: 240,
    rotation: 0,
    busConfig: {
      dc: 32, cs: 5, wr: 26, rd: -1, rst: 33,
      d0: 4, d1: 13, d2: 18, d3: 19, d4: 14, d5: 12, d6: 23, d7: 25,
      ips: true,
    },
  },
  {
    id: 'esp32s3-ws-lcd169',
    label: 'Waveshare ESP32-S3-Touch-LCD-1.69 (ST7789V2 240×280)',
    board: 'esp32s3-ws-lcd169',
    driverType: 'st7789',
    busType: 'spi',
    width: 240,
    height: 280,
    rotation: 0,
    busConfig: { sclk: 6, mosi: 7, dc: 4, cs: 5, rst: 8, bl: 15, row_offset: 20, ips: true },
  },
  {
    id: 'esp32s3-ws-lcd128',
    label: 'Waveshare ESP32-S3-LCD-1.28 (GC9A01 240×240 round)',
    board: 'esp32s3-ws-lcd128',
    driverType: 'gc9a01',
    busType: 'spi',
    width: 240,
    height: 240,
    rotation: 0,
    busConfig: { sclk: 10, mosi: 11, dc: 8, cs: 9, rst: 12, bl: 40, ips: true },
  },
]

/** The preset to start from for a node, when its board has exactly one. */
export function defaultPresetFor(board: string | undefined): BoardPreset | undefined {
  const matches = BOARD_PRESETS.filter((p) => p.board === board)
  return matches.length === 1 ? matches[0] : undefined
}
