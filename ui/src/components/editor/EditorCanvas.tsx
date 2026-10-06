import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { blit, createCanvas, elementBox, isMono, isRound, renderFrame } from '@/lib/render'
import type { Bitmap } from '@/lib/sprite'
import type { Frame, FrameElement } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { DisplayProfile } from '@/components/DisplayPreview'

export const SPRITE_MIME = 'application/x-klippyface-sprite'

type Box = ReturnType<typeof elementBox>

/** How close (in screen pixels) an edge must come to a target before it snaps. */
const SNAP_SCREEN_PX = 10

/**
 * Snap a box's left/centre/right (and top/middle/bottom) to the panel's edges and
 * centre lines and to the same lines of other elements. Returns the whole-pixel
 * shift to apply and the guide line positions (panel pixels, may be fractional).
 */
function snapBox(box: Box, others: Box[], W: number, H: number, threshold: number) {
  const axis = (start: number, size: number, panel: number, pick: (b: Box) => [number, number]) => {
    const targets = [
      0,
      panel / 2,
      panel,
      ...others.flatMap((b) => {
        const [s, z] = pick(b)
        return [s, s + z / 2, s + z]
      }),
    ]
    let best: { d: number; at: number } | null = null
    for (const t of targets)
      for (const edge of [start, start + size / 2, start + size]) {
        const d = t - edge
        if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, at: t }
      }
    return best ? { shift: Math.round(best.d), guide: best.at } : { shift: 0, guide: undefined }
  }
  const x = axis(box.x, box.w, W, (b) => [b.x, b.w])
  const y = axis(box.y, box.h, H, (b) => [b.y, b.h])
  return { dx: x.shift, dy: y.shift, guides: { x: x.guide, y: y.guide } }
}

type Guides = { x?: number; y?: number }

interface Props {
  frame: Frame | undefined
  /** Faintly overlaid when onion skinning. */
  onionFrame?: Frame
  sprites: Map<string, Bitmap>
  profile: DisplayProfile
  selectedId: string | null
  interactive: boolean
  showGrid: boolean
  /** Snap dragged and dropped elements to the panel centre and other elements. Alt bypasses. */
  snap: boolean
  onSelect: (id: string | null) => void
  onMove: (el: FrameElement, x: number, y: number, done: boolean) => void
  onDropSprite: (spriteId: string, x: number, y: number) => void
}

export function EditorCanvas({
  frame,
  onionFrame,
  sprites,
  profile,
  selectedId,
  interactive,
  showGrid,
  snap,
  onSelect,
  onMove,
  onDropSprite,
}: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const onionRef = useRef<HTMLCanvasElement>(null)
  const [zoom, setZoom] = useState(4)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ x: number; y: number } | null>(null)
  const [guides, setGuides] = useState<Guides | null>(null)
  const drag = useRef<{ el: FrameElement; startX: number; startY: number; px: number; py: number; moved: boolean } | null>(
    null,
  )

  // Fit the largest integer zoom that fits the available space.
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const z = Math.floor(Math.min((width - 16) / profile.width, (height - 16) / profile.height))
      setZoom(Math.max(1, Math.min(z, 12)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [profile.width, profile.height])

  useEffect(() => {
    const c = createCanvas(profile.width, profile.height)
    renderFrame(c, frame ?? { bgColor: '#000000' }, sprites, profile.driverType)
    blit(canvasRef.current!.getContext('2d')!, c, 1)
  }, [frame, sprites, profile])

  useEffect(() => {
    if (!onionRef.current) return
    const ctx = onionRef.current.getContext('2d')!
    ctx.clearRect(0, 0, profile.width, profile.height)
    if (!onionFrame) return
    const c = createCanvas(profile.width, profile.height)
    renderFrame(c, { ...onionFrame, bgColor: '#000000' }, sprites, profile.driverType)
    blit(ctx, c, 1)
  }, [onionFrame, sprites, profile])

  const toPanel = (e: { clientX: number; clientY: number }) => {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: Math.floor((e.clientX - r.left) / zoom), y: Math.floor((e.clientY - r.top) / zoom) }
  }

  const elements = frame?.elements ?? []
  const W = profile.width * zoom
  const H = profile.height * zoom

  /** Shift `box` onto nearby snap lines unless snapping is off or Alt is held. */
  const snapped = (box: Box, skipId: string | null, e: { altKey: boolean }) => {
    if (!snap || e.altKey) return { dx: 0, dy: 0, guides: null }
    const others = elements.filter((o) => o.id !== skipId).map((o) => elementBox(o, sprites))
    const r = snapBox(box, others, profile.width, profile.height, SNAP_SCREEN_PX / zoom)
    return { ...r, guides: r.guides.x === undefined && r.guides.y === undefined ? null : r.guides }
  }

  /** Dragged element position for the pointer event, snapped. */
  const dragTo = (d: NonNullable<typeof drag.current>, e: React.PointerEvent) => {
    const x = d.px + Math.round((e.clientX - d.startX) / zoom)
    const y = d.py + Math.round((e.clientY - d.startY) / zoom)
    const s = snapped(elementBox({ ...d.el, x, y }, sprites), d.el.id, e)
    return { x: x + s.dx, y: y + s.dy, guides: s.guides }
  }

  /** Top-left for a palette sprite dropped centred on the pointer, snapped. */
  const dropAt = (e: React.DragEvent, spriteId: string) => {
    const p = toPanel(e)
    const s = sprites.get(spriteId)
    const w = s?.width ?? 16
    const h = s?.height ?? 16
    const x = p.x - Math.floor(w / 2)
    const y = p.y - Math.floor(h / 2)
    const r = snapped({ x, y, w, h }, null, e)
    return { x: x + r.dx, y: y + r.dy, w, h, guides: r.guides }
  }

  return (
    <div ref={wrapRef} className="relative grid h-full w-full place-items-center overflow-hidden">
      <div
        className="relative rounded-sm shadow-[0_0_0_1px_var(--border),0_20px_60px_-20px_rgb(0_0_0/0.8)]"
        style={{ width: W, height: H }}
        onDragOver={(e) => {
          if (!interactive || !e.dataTransfer.types.includes(SPRITE_MIME)) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropHint(toPanel(e))
        }}
        onDragLeave={() => setDropHint(null)}
        onDrop={(e) => {
          const id = e.dataTransfer.getData(SPRITE_MIME)
          setDropHint(null)
          if (!id) return
          e.preventDefault()
          const p = dropAt(e, id)
          onDropSprite(id, p.x, p.y)
        }}
      >
        <canvas
          ref={canvasRef}
          width={profile.width}
          height={profile.height}
          className={cn('pixelated absolute inset-0 size-full', isMono(profile.driverType) && 'oled-glow')}
        />
        <canvas
          ref={onionRef}
          width={profile.width}
          height={profile.height}
          className="pixelated pointer-events-none absolute inset-0 size-full opacity-30 mix-blend-screen"
          style={{ filter: 'sepia(1) hue-rotate(160deg) saturate(4)' }}
        />
        {isRound(profile.driverType) && (
          // Corners exist in the frame buffer but the round panel doesn't show them
          <div
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(circle closest-side, transparent 99.5%, rgb(0 0 0 / 0.65) 100%)' }}
          />
        )}
        {showGrid && zoom >= 4 && (
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(to right, rgb(255 255 255 / 0.06) 1px, transparent 1px), linear-gradient(to bottom, rgb(255 255 255 / 0.06) 1px, transparent 1px)',
              backgroundSize: `${zoom}px ${zoom}px`,
            }}
          />
        )}

        {interactive && (
          <div
            className="absolute inset-0 touch-none"
            onPointerDown={(e) => {
              if (e.target === e.currentTarget) onSelect(null)
            }}
          >
            {elements.map((el) => {
              const b = elementBox(el, sprites)
              const selected = el.id === selectedId
              return (
                <div
                  key={el.id}
                  className={cn(
                    'absolute cursor-move rounded-[1px] outline-1 outline-offset-1 transition-[outline-color]',
                    selected
                      ? 'outline-2 outline-primary'
                      : hoverId === el.id
                        ? 'outline-primary/60 outline-dashed'
                        : 'outline-transparent',
                  )}
                  style={{ left: b.x * zoom, top: b.y * zoom, width: b.w * zoom, height: b.h * zoom }}
                  onPointerEnter={() => setHoverId(el.id)}
                  onPointerLeave={() => setHoverId(null)}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    e.currentTarget.setPointerCapture(e.pointerId)
                    onSelect(el.id)
                    drag.current = { el, startX: e.clientX, startY: e.clientY, px: el.x, py: el.y, moved: false }
                  }}
                  onPointerMove={(e) => {
                    const d = drag.current
                    if (!d) return
                    // A click without movement mustn't snap the element somewhere new.
                    const still =
                      Math.round((e.clientX - d.startX) / zoom) === 0 && Math.round((e.clientY - d.startY) / zoom) === 0
                    if (!d.moved && still) return
                    d.moved = true
                    const p = dragTo(d, e)
                    setGuides(p.guides)
                    onMove(d.el, p.x, p.y, false)
                  }}
                  onPointerUp={(e) => {
                    const d = drag.current
                    drag.current = null
                    setGuides(null)
                    if (!d?.moved) return
                    const p = dragTo(d, e)
                    onMove(d.el, p.x, p.y, true)
                  }}
                >
                  {selected && (
                    <span className="pointer-events-none absolute -top-5 left-0 rounded bg-primary px-1 font-mono text-[10px] whitespace-nowrap text-primary-foreground">
                      {el.x},{el.y}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {guides?.x !== undefined && (
          <div className="pointer-events-none absolute inset-y-0 w-px bg-fuchsia-500" style={{ left: guides.x * zoom }} />
        )}
        {guides?.y !== undefined && (
          <div className="pointer-events-none absolute inset-x-0 h-px bg-fuchsia-500" style={{ top: guides.y * zoom }} />
        )}

        {dropHint && (
          <div
            className="pointer-events-none absolute size-2 -translate-1/2 rounded-full bg-primary"
            style={{ left: dropHint.x * zoom, top: dropHint.y * zoom }}
          />
        )}
      </div>
      <div className="absolute right-3 bottom-2 font-mono text-[11px] text-muted-foreground">
        {profile.width}×{profile.height} · {zoom}×
      </div>
    </div>
  )
}
