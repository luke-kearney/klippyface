// Software renderer that mirrors the firmware (src/display/Renderer.cpp + Adafruit GFX)
// so previews match what the panel shows, pixel for pixel.

import { FONT_5X7 } from './font5x7'
import type { Bitmap } from './sprite'
import type { FrameElement } from './types'

export const CHAR_W = 6
export const CHAR_H = 8

/** Drivers whose panels are 1-bit: any non-black colour lights the pixel. */
const MONO_DRIVERS = new Set(['sh1106', 'ssd1306'])
export const isMono = (driverType?: string) => !driverType || MONO_DRIVERS.has(driverType)

/** Colour of a lit pixel in the monochrome preview (white OLED). */
const MONO_ON: RGB = [235, 240, 255]
const MONO_OFF: RGB = [0, 0, 0]

type RGB = [number, number, number]

export function hexToRgb(hex: string): RGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? '')
  if (!m) return [255, 255, 255]
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Sample values for data bindings, formatted like PrinterState::resolve. */
export const DATA_KEYS: { key: string; label: string; sample: string }[] = [
  { key: 'print_stats.progress', label: 'Print progress', sample: '42.0%' },
  { key: 'extruder.temperature', label: 'Nozzle temp', sample: '215°C' },
  { key: 'extruder.target', label: 'Nozzle target', sample: '215°C' },
  { key: 'heater_bed.temperature', label: 'Bed temp', sample: '60°C' },
  { key: 'heater_bed.target', label: 'Bed target', sample: '60°C' },
  { key: 'moonraker.connected', label: 'Moonraker status', sample: 'Online' },
]
const SAMPLES = new Map(DATA_KEYS.map((d) => [d.key, d.sample]))

/** The string the firmware would print for an element (UTF-8 bytes, as GFX sees them). */
export function elementText(el: Pick<FrameElement, 'type' | 'value'>): Uint8Array {
  const s = el.type === 'datavalue' ? (SAMPLES.get(el.value) ?? '?') : el.value
  return new TextEncoder().encode(s ?? '')
}

export interface Canvas {
  width: number
  height: number
  rgba: Uint8ClampedArray
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function createCanvas(width: number, height: number): Canvas {
  return { width, height, rgba: new Uint8ClampedArray(width * height * 4) }
}

function setPixel(c: Canvas, x: number, y: number, rgb: RGB) {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return
  const i = (y * c.width + x) * 4
  c.rgba[i] = rgb[0]
  c.rgba[i + 1] = rgb[1]
  c.rgba[i + 2] = rgb[2]
  c.rgba[i + 3] = 255
}

function toPanel(hex: string, mono: boolean): RGB {
  const rgb = hexToRgb(hex)
  if (!mono) return rgb
  return rgb[0] || rgb[1] || rgb[2] ? MONO_ON : MONO_OFF
}

/** Adafruit_GFX::write() + drawChar() at text size 1, wrap enabled, transparent bg. */
function drawText(c: Canvas, bytes: Uint8Array, x0: number, y0: number, rgb: RGB) {
  let cx = x0
  let cy = y0
  for (let ch of bytes) {
    if (ch === 10) {
      cx = 0
      cy += CHAR_H
      continue
    }
    if (ch === 13) continue
    if (cx + CHAR_W > c.width) {
      cx = 0
      cy += CHAR_H
    }
    if (ch >= 176) ch++ // GFX default (non-CP437) glyph offset quirk
    for (let i = 0; i < 5; i++) {
      let line = FONT_5X7[(ch & 255) * 5 + i] ?? 0
      for (let j = 0; j < 8; j++, line >>= 1) if (line & 1) setPixel(c, cx + i, cy + j, rgb)
    }
    cx += CHAR_W
  }
}

/** Bounding box of an element on the panel (text is centred on x,y; sprites top-left). */
export function elementBox(el: FrameElement, sprites: Map<string, Bitmap>): Box {
  if (el.type === 'sprite') {
    const s = sprites.get(el.value)
    return { x: el.x, y: el.y, w: s?.width ?? 16, h: s?.height ?? 16 }
  }
  const textW = elementText(el).length * CHAR_W
  return { x: el.x - Math.trunc(textW / 2), y: el.y - CHAR_H / 2, w: Math.max(textW, CHAR_W), h: CHAR_H }
}

export function renderFrame(
  c: Canvas,
  frame: { bgColor: string; elements?: FrameElement[] },
  sprites: Map<string, Bitmap>,
  driverType?: string,
) {
  const mono = isMono(driverType)
  const bg = toPanel(frame.bgColor || '#000000', mono)
  for (let i = 0; i < c.width * c.height; i++) {
    c.rgba[i * 4] = bg[0]
    c.rgba[i * 4 + 1] = bg[1]
    c.rgba[i * 4 + 2] = bg[2]
    c.rgba[i * 4 + 3] = 255
  }
  for (const el of frame.elements ?? []) {
    const rgb = toPanel(el.color || '#FFFFFF', mono)
    if (el.type === 'sprite') {
      const s = sprites.get(el.value)
      if (!s) continue
      for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) if (s.pixels[y * s.width + x]) setPixel(c, el.x + x, el.y + y, rgb)
    } else {
      const bytes = elementText(el)
      // Renderer.cpp: cx = x - len*6/2, cy = y - 8/2 (int16 truncation)
      drawText(c, bytes, el.x - Math.trunc((bytes.length * CHAR_W) / 2), el.y - CHAR_H / 2, rgb)
    }
  }
}

/** Paint a rendered canvas onto a 2D context at integer scale. */
export function blit(ctx: CanvasRenderingContext2D, c: Canvas, scale: number) {
  const img = new ImageData(c.rgba as Uint8ClampedArray<ArrayBuffer>, c.width, c.height)
  if (scale === 1) {
    ctx.putImageData(img, 0, 0)
    return
  }
  const tmp = new OffscreenCanvas(c.width, c.height)
  tmp.getContext('2d')!.putImageData(img, 0, 0)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(tmp, 0, 0, c.width * scale, c.height * scale)
}
