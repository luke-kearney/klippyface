// 1bpp sprite bitmaps. Firmware (src/display/Sprite.cpp) expects Adafruit GFX
// drawBitmap layout: rows padded to whole bytes, stride = ceil(w / 8), MSB = leftmost.

export interface Bitmap {
  width: number
  height: number
  /** One byte per pixel, 0 or 1, row-major. */
  pixels: Uint8Array
}

export const stride = (w: number) => Math.ceil(w / 8)

export function emptyBitmap(width: number, height: number): Bitmap {
  return { width, height, pixels: new Uint8Array(width * height) }
}

export function decodeSprite(b64: string, width: number, height: number): Bitmap {
  const bmp = emptyBitmap(width, height)
  if (!b64) return bmp
  let bytes: Uint8Array
  try {
    bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
  } catch {
    return bmp
  }
  const s = stride(width)
  // The old editor packed bits contiguously with no row padding. Those sprites only
  // differ when width isn't a multiple of 8; read them as-is so a re-save fixes them.
  const legacy = bytes.length !== s * height && bytes.length === Math.ceil((width * height) / 8)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const bit = legacy ? y * width + x : y * s * 8 + x
      bmp.pixels[y * width + x] = (bytes[bit >> 3] >> (7 - (bit & 7))) & 1
    }
  }
  return bmp
}

export function encodeSprite(bmp: Bitmap): string {
  const s = stride(bmp.width)
  const bytes = new Uint8Array(s * bmp.height)
  for (let y = 0; y < bmp.height; y++) {
    for (let x = 0; x < bmp.width; x++) {
      if (bmp.pixels[y * bmp.width + x]) bytes[y * s + (x >> 3)] |= 0x80 >> (x & 7)
    }
  }
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Copy into a new size, anchored top-left. */
export function resizeBitmap(bmp: Bitmap, width: number, height: number): Bitmap {
  const out = emptyBitmap(width, height)
  for (let y = 0; y < Math.min(height, bmp.height); y++) {
    for (let x = 0; x < Math.min(width, bmp.width); x++) {
      out.pixels[y * width + x] = bmp.pixels[y * bmp.width + x]
    }
  }
  return out
}

/** Threshold an image (scaled to fit) into a bitmap. */
export function bitmapFromImage(img: CanvasImageSource, width: number, height: number, threshold = 128): Bitmap {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  const d = ctx.getImageData(0, 0, width, height).data
  const bmp = emptyBitmap(width, height)
  for (let i = 0; i < width * height; i++) {
    const a = d[i * 4 + 3] / 255
    const lum = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) * a
    bmp.pixels[i] = lum > threshold ? 1 : 0
  }
  return bmp
}

/** Sprites bucketed by folder: named folders A–Z, then unfiled (''), each sorted by label. */
export function groupByFolder<T extends { id: string; label: string; folder: string }>(sprites: T[]): [string, T[]][] {
  const folders = new Map<string, T[]>()
  for (const s of sprites) {
    const f = s.folder.trim()
    folders.set(f, [...(folders.get(f) ?? []), s])
  }
  const name = (s: T) => s.label || s.id
  return [...folders.entries()]
    .sort(([a], [b]) => (!a ? 1 : !b ? -1 : a.localeCompare(b)))
    .map(([f, list]) => [f, list.sort((a, b) => name(a).localeCompare(name(b)))])
}
