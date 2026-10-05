import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { blit, createCanvas, elementBox, isMono, renderFrame } from '@/lib/render'
import type { Bitmap } from '@/lib/sprite'
import type { Frame, FrameElement } from '@/lib/types'
import { cn } from '@/lib/utils'
import type { DisplayProfile } from '@/components/DisplayPreview'

export const SPRITE_MIME = 'application/x-klippyface-sprite'

interface Props {
  frame: Frame | undefined
  /** Faintly overlaid when onion skinning. */
  onionFrame?: Frame
  sprites: Map<string, Bitmap>
  profile: DisplayProfile
  selectedId: string | null
  interactive: boolean
  showGrid: boolean
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
          const p = toPanel(e)
          const s = sprites.get(id)
          onDropSprite(id, p.x - Math.floor((s?.width ?? 0) / 2), p.y - Math.floor((s?.height ?? 0) / 2))
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
                    const dx = Math.round((e.clientX - d.startX) / zoom)
                    const dy = Math.round((e.clientY - d.startY) / zoom)
                    if (!d.moved && dx === 0 && dy === 0) return
                    d.moved = true
                    onMove(d.el, d.px + dx, d.py + dy, false)
                  }}
                  onPointerUp={(e) => {
                    const d = drag.current
                    drag.current = null
                    if (!d?.moved) return
                    onMove(
                      d.el,
                      d.px + Math.round((e.clientX - d.startX) / zoom),
                      d.py + Math.round((e.clientY - d.startY) / zoom),
                      true,
                    )
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
