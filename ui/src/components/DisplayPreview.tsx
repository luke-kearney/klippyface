import { useEffect, useRef, useState } from 'react'
import { blit, createCanvas, isMono, renderFrame } from '@/lib/render'
import type { Bitmap } from '@/lib/sprite'
import type { Frame } from '@/lib/types'
import { cn } from '@/lib/utils'

export interface DisplayProfile {
  id: string
  label: string
  width: number
  height: number
  driverType: string
}

export const DISPLAY_PROFILES: DisplayProfile[] = [
  { id: 'oled128x64', label: 'OLED 128×64', width: 128, height: 64, driverType: 'sh1106' },
  { id: 'oled128x32', label: 'OLED 128×32', width: 128, height: 32, driverType: 'ssd1306' },
  { id: 'tft240x240', label: 'TFT 240×240 colour', width: 240, height: 240, driverType: 'st7789' },
  { id: 'tft320x240', label: 'TFT 320×240 colour', width: 320, height: 240, driverType: 'hx8347' },
]

type FrameLike = Pick<Frame, 'bgColor' | 'elements'>

/** Static render of one frame. Scales to fill its box at integer-crisp pixels. */
export function FrameCanvas({
  frame,
  sprites,
  profile,
  className,
}: {
  frame: FrameLike | undefined
  sprites: Map<string, Bitmap>
  profile: Pick<DisplayProfile, 'width' | 'height' | 'driverType'>
  className?: string
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const c = createCanvas(profile.width, profile.height)
    renderFrame(c, frame ?? { bgColor: '#000000', elements: [] }, sprites, profile.driverType)
    blit(el.getContext('2d')!, c, 1)
  }, [frame, sprites, profile.width, profile.height, profile.driverType])

  return (
    <canvas
      ref={ref}
      width={profile.width}
      height={profile.height}
      className={cn('pixelated block w-full rounded-sm bg-black', isMono(profile.driverType) && 'oled-glow', className)}
      style={{ aspectRatio: `${profile.width} / ${profile.height}` }}
    />
  )
}

/** Loops through frames using each frame's duration, like the firmware's AnimationEngine. */
export function useFramePlayback(frames: Frame[] | undefined, playing: boolean, speed = 1) {
  const [index, setIndex] = useState(0)
  const count = frames?.length ?? 0
  const safe = count ? index % count : 0

  useEffect(() => {
    if (!playing || count < 2) return
    const ms = Math.max(30, (frames![safe]?.durationMs || 1000) / speed)
    const t = setTimeout(() => setIndex((i) => (i + 1) % count), ms)
    return () => clearTimeout(t)
  }, [playing, safe, count, frames, speed])

  return [safe, setIndex] as const
}

/** Self-playing thumbnail of a set. Plays on hover unless `autoPlay`. */
export function SetPlayer({
  frames,
  sprites,
  profile = DISPLAY_PROFILES[0],
  autoPlay = false,
  className,
}: {
  frames: Frame[] | undefined
  sprites: Map<string, Bitmap>
  profile?: Pick<DisplayProfile, 'width' | 'height' | 'driverType'>
  autoPlay?: boolean
  className?: string
}) {
  const [hover, setHover] = useState(false)
  const [index] = useFramePlayback(frames, autoPlay || hover)
  return (
    <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} className={className}>
      <FrameCanvas frame={frames?.[index]} sprites={sprites} profile={profile} />
    </div>
  )
}
