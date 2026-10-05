import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { FONT_5X7 } from '@/lib/font5x7'
import type { Bitmap } from '@/lib/sprite'

export type Tool = 'pencil' | 'eraser' | 'fill' | 'line' | 'rect' | 'text'

type Pt = { x: number; y: number }

interface Brush {
  v: number
  size: number
  mirror: boolean
}

/** Top-left offset of a square brush so odd sizes centre on the cursor pixel. */
const brushOffset = (size: number) => Math.floor((size - 1) / 2)

/** Stamp a size×size square brush at (x, y). */
function plot(b: Bitmap, x: number, y: number, { v, size, mirror }: Brush) {
  const set = (px: number, py: number) => {
    if (px >= 0 && py >= 0 && px < b.width && py < b.height) b.pixels[py * b.width + px] = v
  }
  const o = brushOffset(size)
  for (let dy = 0; dy < size; dy++)
    for (let dx = 0; dx < size; dx++) {
      set(x - o + dx, y - o + dy)
      if (mirror) set(b.width - 1 - (x - o + dx), y - o + dy)
    }
}

function line(b: Bitmap, a: Pt, c: Pt, brush: Brush) {
  let { x, y } = a
  const dx = Math.abs(c.x - x)
  const dy = -Math.abs(c.y - y)
  const sx = x < c.x ? 1 : -1
  const sy = y < c.y ? 1 : -1
  let err = dx + dy
  for (;;) {
    plot(b, x, y, brush)
    if (x === c.x && y === c.y) break
    const e2 = 2 * err
    if (e2 >= dy) {
      err += dy
      x += sx
    }
    if (e2 <= dx) {
      err += dx
      y += sy
    }
  }
}

function rect(b: Bitmap, a: Pt, c: Pt, brush: Brush) {
  line(b, a, { x: c.x, y: a.y }, brush)
  line(b, { x: c.x, y: a.y }, c, brush)
  line(b, c, { x: a.x, y: c.y }, brush)
  line(b, { x: a.x, y: c.y }, a, brush)
}

function fill(b: Bitmap, p: Pt, v: number) {
  const target = b.pixels[p.y * b.width + p.x]
  if (target === v) return
  const stack = [p]
  while (stack.length) {
    const { x, y } = stack.pop()!
    if (x < 0 || y < 0 || x >= b.width || y >= b.height || b.pixels[y * b.width + x] !== target) continue
    b.pixels[y * b.width + x] = v
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 })
  }
}

const INPUT_W = 192
const INPUT_H = 32

/** Keep the text input inside the canvas (focusing it would otherwise scroll the view). */
function textInputPos(at: Pt, textH: number, zoom: number, b: Bitmap) {
  const W = b.width * zoom
  const H = b.height * zoom
  const below = (at.y + textH) * zoom + 6
  const above = at.y * zoom - INPUT_H - 6
  const top = below + INPUT_H <= H ? below : above >= 0 ? above : Math.max(0, H - INPUT_H)
  return { left: Math.max(0, Math.min(at.x * zoom, W - INPUT_W)), top, width: Math.min(INPUT_W, W), height: INPUT_H }
}

const clone = (b: Bitmap): Bitmap => ({ ...b, pixels: new Uint8Array(b.pixels) })

// The GFX font array is laid out as code page 437. Map the few non-ASCII
// characters people are likely to type; anything else becomes '?'.
const CP437: Record<string, number> = { '°': 248, '±': 241, '²': 253, '·': 250, '£': 156, '¥': 157, '÷': 246, 'µ': 230 }
const glyphIndex = (ch: string) => {
  const c = ch.charCodeAt(0)
  return c >= 32 && c < 127 ? c : (CP437[ch] ?? 63)
}

export const GLYPH_W = 6
export const GLYPH_H = 8

/** Draw text with the 5×7 font, top-left at (x, y), each font pixel scale×scale. */
function stampText(b: Bitmap, text: string, x: number, y: number, scale: number, v: number) {
  let cx = x
  for (const ch of text) {
    const g = glyphIndex(ch)
    for (let col = 0; col < 5; col++) {
      let bits = FONT_5X7[g * 5 + col]
      for (let row = 0; row < 8; row++, bits >>= 1) {
        if (!(bits & 1)) continue
        for (let sy = 0; sy < scale; sy++)
          for (let sx = 0; sx < scale; sx++) {
            const px = cx + col * scale + sx
            const py = y + row * scale + sy
            if (px >= 0 && py >= 0 && px < b.width && py < b.height) b.pixels[py * b.width + px] = v
          }
      }
    }
    cx += GLYPH_W * scale
  }
}

/**
 * Zoomable 1-bit pixel canvas. Left button paints with the tool, right button erases.
 * `onCommit` fires once per stroke with the finished bitmap (for undo history).
 */
export function PixelEditor({
  bitmap,
  tool,
  brushSize,
  textScale,
  mirror,
  showGrid,
  onCommit,
}: {
  bitmap: Bitmap
  tool: Tool
  /** Square brush edge in pixels; applies to pencil, eraser, line and rectangle. */
  brushSize: number
  /** Font pixel scale for the text tool (like GFX setTextSize). */
  textScale: number
  mirror: boolean
  showGrid: boolean
  onCommit: (b: Bitmap) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(8)
  const [draft, setDraft] = useState<Bitmap | null>(null)
  const [cursor, setCursor] = useState<Pt | null>(null)
  const stroke = useRef<{ base: Bitmap; work: Bitmap; start: Pt; last: Pt; v: number } | null>(null)
  const [text, setText] = useState<{ at: Pt; value: string; v: number } | null>(null)

  const textDraft = useMemo(() => {
    if (!text?.value) return null
    const b = clone(bitmap)
    stampText(b, text.value, text.at.x, text.at.y, textScale, text.v)
    return b
  }, [text, bitmap, textScale])

  const commitText = () => {
    if (textDraft) onCommit(textDraft)
    setText(null)
  }

  // Switching tools finishes any text being typed.
  useEffect(() => {
    if (tool !== 'text') setText(null)
  }, [tool])

  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const z = Math.floor(Math.min((e.contentRect.width - 16) / bitmap.width, (e.contentRect.height - 16) / bitmap.height))
      setZoom(Math.max(2, Math.min(z, 32)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [bitmap.width, bitmap.height])

  const shown = draft ?? textDraft ?? bitmap

  useEffect(() => {
    const c = canvasRef.current!
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.fillStyle = '#EBF0FF'
    for (let y = 0; y < shown.height; y++)
      for (let x = 0; x < shown.width; x++) if (shown.pixels[y * shown.width + x]) ctx.fillRect(x, y, 1, 1)
  }, [shown])

  const toPt = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect()
    return {
      x: Math.min(bitmap.width - 1, Math.max(0, Math.floor((e.clientX - r.left) / zoom))),
      y: Math.min(bitmap.height - 1, Math.max(0, Math.floor((e.clientY - r.top) / zoom))),
    }
  }

  const apply = (s: NonNullable<typeof stroke.current>, p: Pt) => {
    if (tool === 'line' || tool === 'rect') {
      s.work = clone(s.base)
      ;(tool === 'line' ? line : rect)(s.work, s.start, p, { v: s.v, size: brushSize, mirror })
    } else {
      line(s.work, s.last, p, { v: s.v, size: brushSize, mirror })
    }
    s.last = p
    setDraft(clone(s.work))
  }

  return (
    <div ref={wrapRef} className="relative grid size-full place-items-center overflow-hidden">
      <div className="relative" style={{ width: bitmap.width * zoom, height: bitmap.height * zoom }}>
        <canvas
          ref={canvasRef}
          width={bitmap.width}
          height={bitmap.height}
          className="pixelated absolute inset-0 size-full touch-none rounded-sm shadow-[0_0_0_1px_var(--border)]"
          style={{ cursor: tool === 'fill' ? 'cell' : tool === 'text' ? 'text' : 'crosshair' }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            const p = toPt(e)
            const v = e.button === 2 || tool === 'eraser' ? 0 : 1
            if (tool === 'text') {
              // Stop the compat mousedown from stealing focus from the new input.
              // Any text already being typed is committed first.
              e.preventDefault()
              if (text) commitText()
              setText({ at: p, value: '', v })
              return
            }
            if (tool === 'fill') {
              const b = clone(bitmap)
              fill(b, p, v)
              if (mirror) fill(b, { x: b.width - 1 - p.x, y: p.y }, v)
              onCommit(b)
              return
            }
            const s = { base: bitmap, work: clone(bitmap), start: p, last: p, v }
            stroke.current = s
            apply(s, p)
          }}
          onPointerMove={(e) => {
            const p = toPt(e)
            setCursor(p)
            const s = stroke.current
            if (s && (p.x !== s.last.x || p.y !== s.last.y || tool === 'line' || tool === 'rect')) apply(s, p)
          }}
          onPointerUp={() => {
            const s = stroke.current
            stroke.current = null
            setDraft(null)
            if (s) onCommit(s.work)
          }}
          onPointerLeave={() => setCursor(null)}
        />
        {showGrid && zoom >= 6 && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgb(255 255 255 / 0.07) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.07) 1px, transparent 1px), linear-gradient(to right, rgb(255 255 255 / 0.16) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.16) 1px, transparent 1px)',
              backgroundSize: `${zoom}px ${zoom}px, ${zoom}px ${zoom}px, ${zoom * 8}px ${zoom * 8}px, ${zoom * 8}px ${zoom * 8}px`,
            }}
          />
        )}
        {mirror && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-primary/60"
            style={{ left: (bitmap.width / 2) * zoom }}
          />
        )}
        {text && (
          <input
            autoFocus
            value={text.value}
            onChange={(e) => setText({ ...text, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitText()
              else if (e.key === 'Escape') setText(null)
            }}
            onBlur={commitText}
            placeholder="Type, Enter to place"
            className="absolute z-10 rounded-md border border-primary bg-popover px-2 py-1 text-sm shadow-lg outline-none"
            style={textInputPos(text.at, GLYPH_H * textScale, zoom, bitmap)}
          />
        )}
        {text && (
          <div
            className="pointer-events-none absolute outline-1 outline-dashed outline-primary"
            style={{
              left: text.at.x * zoom,
              top: text.at.y * zoom,
              width: Math.max(1, text.value.length) * GLYPH_W * textScale * zoom,
              height: GLYPH_H * textScale * zoom,
            }}
          />
        )}
        {cursor && !text && tool === 'text' && (
          <div
            className="pointer-events-none absolute outline-1 outline-primary"
            style={{
              left: cursor.x * zoom,
              top: cursor.y * zoom,
              width: 5 * textScale * zoom,
              height: 7 * textScale * zoom,
            }}
          />
        )}
        {cursor && tool !== 'text' && (
          <div
            className="pointer-events-none absolute outline-1 outline-primary"
            style={{
              left: (cursor.x - (tool === 'fill' ? 0 : brushOffset(brushSize))) * zoom,
              top: (cursor.y - (tool === 'fill' ? 0 : brushOffset(brushSize))) * zoom,
              width: (tool === 'fill' ? 1 : brushSize) * zoom,
              height: (tool === 'fill' ? 1 : brushSize) * zoom,
            }}
          />
        )}
      </div>
      <div className="absolute right-3 bottom-2 font-mono text-[11px] text-muted-foreground">
        {cursor ? `${cursor.x},${cursor.y} · ` : ''}
        {bitmap.width}×{bitmap.height} · {zoom}×
      </div>
    </div>
  )
}
