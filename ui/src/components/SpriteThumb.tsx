import { useEffect, useRef } from 'react'
import type { Bitmap } from '@/lib/sprite'
import { cn } from '@/lib/utils'

/** Crisp 1:1 sprite render, scaled up by CSS to fit its box. */
export function SpriteThumb({
  bitmap,
  className,
  color = '#EBF0FF',
  emptyLabel,
}: {
  bitmap?: Bitmap
  className?: string
  color?: string
  /** Shown instead of a black square when the sprite has no lit pixels. */
  emptyLabel?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    if (!c || !bitmap) return
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.fillStyle = color
    for (let y = 0; y < bitmap.height; y++)
      for (let x = 0; x < bitmap.width; x++) if (bitmap.pixels[y * bitmap.width + x]) ctx.fillRect(x, y, 1, 1)
  }, [bitmap, color])
  if (!bitmap) return null
  if (emptyLabel !== undefined && !bitmap.pixels.some(Boolean))
    return <span className="truncate px-1 text-[10px] text-muted-foreground">{emptyLabel}</span>
  return (
    <canvas
      ref={ref}
      width={bitmap.width}
      height={bitmap.height}
      className={cn('pixelated max-h-full max-w-full', className)}
      style={{ aspectRatio: `${bitmap.width} / ${bitmap.height}`, width: '100%' }}
    />
  )
}
