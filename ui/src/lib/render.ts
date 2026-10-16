// Software renderer that mirrors the firmware (src/display/Renderer.cpp + Adafruit GFX)
// so previews match what the panel shows, pixel for pixel.

import { FONT_5X7 } from './font5x7'
import type { Bitmap } from './sprite'
import type { DataKey, FrameElement } from './types'

export const CHAR_W = 6
export const CHAR_H = 8

/** Drivers whose panels are 1-bit: any non-black colour lights the pixel. */
const MONO_DRIVERS = new Set(['sh1106', 'ssd1306'])
export const isMono = (driverType?: string) => !driverType || MONO_DRIVERS.has(driverType)

/** Round panels only show the circle inscribed in their square; corners are invisible. */
export const isRound = (driverType?: string) => driverType === 'gc9a01'

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

/** Offered when the server's list (GET /api/moonraker/data-keys) isn't available. */
export const COMMON_DATA_KEYS: DataKey[] = [
  { key: 'print_stats.progress', label: 'Print progress', group: 'Print' },
  { key: 'klippyface.state', label: 'Printer state', group: 'Print' },
  { key: 'klippyface.nozzle.temperature', label: 'Nozzle temp', group: 'Nozzle' },
  { key: 'klippyface.nozzle.target', label: 'Nozzle target', group: 'Nozzle' },
  { key: 'heater_bed.temperature', label: 'Bed temp', group: 'Bed' },
  { key: 'heater_bed.target', label: 'Bed target', group: 'Bed' },
  { key: 'moonraker.connected', label: 'Moonraker status', group: 'Status' },
]

const SAMPLES = new Map<string, string>([
  ['klippyface.state', 'printing'],
  ['klippyface.tool', 'T0'],
  ['moonraker.connected', 'Online'],
])

/** Sample filament for "spool.<field>" (and per-tool "spool.toolN.<field>") keys. */
const SPOOL_SAMPLES: Record<string, string> = {
  name: 'Sunset Orange',
  material: 'PLA',
  vendor: 'eSun',
  color: '#FF6A13',
  remaining_weight: '742g',
  id: '3',
}

/** Preview value for a data key, formatted like PrinterState::resolve. */
export function sampleValue(key: string): string {
  const known = SAMPLES.get(key)
  if (known) return known
  if (key.startsWith('spool.')) {
    const sample = SPOOL_SAMPLES[key.slice(key.lastIndexOf('.') + 1)]
    if (sample) return sample
  }  if (key.endsWith('.temperature') || key.endsWith('.target')) return key.startsWith('heater_bed') ? '60°C' : '215°C'
  if (key.endsWith('_weight')) return '742g'
  if (key.endsWith('progress')) return '42.0%'
  return '?'
}

/** Non-ASCII characters in the CP437 5x7 font → glyph; keep in step with GLYPHS in src/display/FontText.cpp. */
// prettier-ignore
const CP437_GLYPHS = new Map<number, number>([
  [0x00a1, 0xad], [0x00a2, 0x9b], [0x00a3, 0x9c], [0x00a5, 0x9d], [0x00aa, 0xa6], [0x00ab, 0xae],
  [0x00ac, 0xaa], [0x00b0, 0xf8], [0x00b1, 0xf1], [0x00b2, 0xfd], [0x00b5, 0xe6], [0x00b7, 0xfa],
  [0x00ba, 0xa7], [0x00bb, 0xaf], [0x00bc, 0xac], [0x00bd, 0xab], [0x00bf, 0xa8], [0x00c4, 0x8e],
  [0x00c5, 0x8f], [0x00c6, 0x92], [0x00c7, 0x80], [0x00c9, 0x90], [0x00d1, 0xa5], [0x00d6, 0x99],
  [0x00dc, 0x9a], [0x00df, 0xe1], [0x00e0, 0x85], [0x00e1, 0xa0], [0x00e2, 0x83], [0x00e4, 0x84],
  [0x00e5, 0x86], [0x00e6, 0x91], [0x00e7, 0x87], [0x00e8, 0x8a], [0x00e9, 0x82], [0x00ea, 0x88],
  [0x00eb, 0x89], [0x00ec, 0x8d], [0x00ed, 0xa1], [0x00ee, 0x8c], [0x00ef, 0x8b], [0x00f1, 0xa4],
  [0x00f2, 0x95], [0x00f3, 0xa2], [0x00f4, 0x93], [0x00f6, 0x94], [0x00f7, 0xf6], [0x00f9, 0x97],
  [0x00fa, 0xa3], [0x00fb, 0x96], [0x00fc, 0x81], [0x00ff, 0x98], [0x2022, 0x07], [0x2190, 0x1b],
  [0x2191, 0x18], [0x2192, 0x1a], [0x2193, 0x19], [0x2248, 0xf7], [0x2264, 0xf3], [0x2265, 0xf2],
  [0x2588, 0xdb], [0x2591, 0xb0], [0x2592, 0xb1], [0x2593, 0xb2], [0x25b2, 0x1e], [0x25ba, 0x10],
  [0x25bc, 0x1f], [0x25c4, 0x11], [0x263a, 0x01], [0x2665, 0x03],
])

/** Font glyphs for a string, as the firmware's toFontText(): ASCII as is, known characters to their glyph, else '?'. */
export function toFontText(s: string): Uint8Array {
  const out: number[] = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)!
    out.push(cp < 0x80 ? cp : (CP437_GLYPHS.get(cp) ?? 0x3f))
  }
  return Uint8Array.from(out)
}

/** The glyphs the firmware would print for an element. */
export function elementText(el: Pick<FrameElement, 'type' | 'value'>): Uint8Array {
  const s = el.type === 'datavalue' ? sampleValue(el.value) : el.value
  return toFontText(s ?? '')
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

function fillBlock(c: Canvas, x: number, y: number, s: number, rgb: RGB) {
  for (let dy = 0; dy < s; dy++) for (let dx = 0; dx < s; dx++) setPixel(c, x + dx, y + dy, rgb)
}

/** Adafruit_GFX::write() + drawChar() (CP437 glyphs) at text size `s`, wrap enabled, transparent bg. */
function drawText(c: Canvas, bytes: Uint8Array, x0: number, y0: number, rgb: RGB, s = 1) {
  let cx = x0
  let cy = y0
  for (const ch of bytes) {
    if (ch === 10) {
      cx = 0
      cy += CHAR_H * s
      continue
    }
    if (ch === 13) continue
    if (cx + CHAR_W * s > c.width) {
      cx = 0
      cy += CHAR_H * s
    }
    for (let i = 0; i < 5; i++) {
      let line = FONT_5X7[(ch & 255) * 5 + i] ?? 0
      for (let j = 0; j < 8; j++, line >>= 1) if (line & 1) fillBlock(c, cx + i * s, cy + j * s, s, rgb)
    }
    cx += CHAR_W * s
  }
}

const sizeOf = (el: Pick<FrameElement, 'size'>) => Math.min(8, Math.max(1, el.size || 1))

/** Bounding box of an element on the panel (text is centred on x,y; sprites top-left). */
export function elementBox(el: FrameElement, sprites: Map<string, Bitmap>): Box {
  const k = sizeOf(el)
  if (el.type === 'sprite') {
    const s = sprites.get(el.value)
    return { x: el.x, y: el.y, w: (s?.width ?? 16) * k, h: (s?.height ?? 16) * k }
  }
  const textW = elementText(el).length * CHAR_W * k
  const textH = CHAR_H * k
  return { x: el.x - Math.trunc(textW / 2), y: el.y - Math.trunc(textH / 2), w: Math.max(textW, CHAR_W * k), h: textH }
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
    const k = sizeOf(el)
    if (el.type === 'sprite') {
      const s = sprites.get(el.value)
      if (!s) continue
      for (let y = 0; y < s.height; y++)
        for (let x = 0; x < s.width; x++) if (s.pixels[y * s.width + x]) fillBlock(c, el.x + x * k, el.y + y * k, k, rgb)
    } else {
      const bytes = elementText(el)
      // Renderer.cpp: cx = x - len*6*size/2, cy = y - 8*size/2 (int16 truncation)
      drawText(c, bytes, el.x - Math.trunc((bytes.length * CHAR_W * k) / 2), el.y - Math.trunc((CHAR_H * k) / 2), rgb, k)
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
