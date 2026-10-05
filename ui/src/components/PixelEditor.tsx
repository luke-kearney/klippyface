import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Bitmap } from '@/lib/sprite'

export type Tool = 'pencil' | 'eraser' | 'fill' | 'line' | 'rect'

type Pt = { x: number; y: number }

function plot(b: Bitmap, x: number, y: number, v: number, mirror: boolean) {
  const set = (px: number) => {
    if (px >= 0 && y >= 0 && px < b.width && y < b.height) b.pixels[y * b.width + px] = v
  }
  set(x)
  if (mirror) set(b.width - 1 - x)
}

function line(b: Bitmap, a: Pt, c: Pt, v: number, mirror: boolean) {
  let { x, y } = a
  const dx = Math.abs(c.x - x)
  const dy = -Math.abs(c.y - y)
  const sx = x < c.x ? 1 : -1
  const sy = y < c.y ? 1 : -1
  let err = dx + dy
  for (;;) {
    plot(b, x, y, v, mirror)
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

function rect(b: Bitmap, a: Pt, c: Pt, v: number, mirror: boolean) {
  line(b, a, { x: c.x, y: a.y }, v, mirror)
  line(b, { x: c.x, y: a.y }, c, v, mirror)
  line(b, c, { x: a.x, y: c.y }, v, mirror)
  line(b, { x: a.x, y: c.y }, a, v, mirror)
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

const clone = (b: Bitmap): Bitmap => ({ ...b, pixels: new Uint8Array(b.pixels) })

/**
 * Zoomable 1-bit pixel canvas. Left button paints with the tool, right button erases.
 * `onCommit` fires once per stroke with the finished bitmap (for undo history).
 */
export function PixelEditor({
  bitmap,
  tool,
  mirror,
  showGrid,
  onCommit,
}: {
  bitmap: Bitmap
  tool: Tool
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

  const shown = draft ?? bitmap

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
      ;(tool === 'line' ? line : rect)(s.work, s.start, p, s.v, mirror)
    } else {
      line(s.work, s.last, p, s.v, mirror)
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
          style={{ cursor: tool === 'fill' ? 'cell' : 'crosshair' }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId)
            const p = toPt(e)
            const v = e.button === 2 || tool === 'eraser' ? 0 : 1
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
        {cursor && (
          <div
            className="pointer-events-none absolute outline-1 outline-primary"
            style={{ left: cursor.x * zoom, top: cursor.y * zoom, width: zoom, height: zoom }}
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
