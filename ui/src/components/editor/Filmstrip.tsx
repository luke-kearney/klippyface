import { useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FrameCanvas, type DisplayProfile } from '@/components/DisplayPreview'
import type { Bitmap } from '@/lib/sprite'
import type { Frame } from '@/lib/types'
import { cn } from '@/lib/utils'

const FRAME_MIME = 'application/x-klippyface-frame'

export function Filmstrip({
  frames,
  current,
  playing,
  sprites,
  profile,
  onSelect,
  onReorder,
  onAdd,
  onDuplicate,
  onDelete,
}: {
  frames: Frame[]
  current: number
  playing: boolean
  sprites: Map<string, Bitmap>
  profile: DisplayProfile
  onSelect: (i: number) => void
  onReorder: (ids: string[]) => void
  onAdd: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const [dragOver, setDragOver] = useState<number | null>(null)
  const total = frames.reduce((n, f) => n + (f.durationMs || 0), 0)

  return (
    <div className="flex min-w-0 items-stretch gap-3 border-t bg-sidebar px-3 py-3">
      <div className="flex shrink-0 flex-col justify-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" onClick={onAdd} aria-label="Add frame">
              <Plus />
            </Button>
          </TooltipTrigger>
          <TooltipContent>New blank frame after this one</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button size="icon" variant="outline" onClick={onDuplicate} disabled={!frames.length} aria-label="Duplicate frame">
              <Copy />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Duplicate frame (Ctrl+Shift+D)</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
        {frames.map((f, i) => (
          <button
            key={f.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData(FRAME_MIME, String(i))}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(FRAME_MIME)) return
              e.preventDefault()
              setDragOver(i)
            }}
            onDragLeave={() => setDragOver(null)}
            onDrop={(e) => {
              setDragOver(null)
              const from = parseInt(e.dataTransfer.getData(FRAME_MIME))
              if (isNaN(from) || from === i) return
              const ids = frames.map((x) => x.id)
              const [m] = ids.splice(from, 1)
              ids.splice(i, 0, m)
              onReorder(ids)
              onSelect(i)
            }}
            onClick={() => onSelect(i)}
            className={cn(
              'group relative flex w-32 shrink-0 flex-col gap-1 rounded-lg border-2 p-1.5 text-left transition-colors',
              i === current ? 'border-primary bg-primary/10' : 'border-transparent hover:border-border hover:bg-accent/40',
              dragOver === i && 'border-dashed border-primary/60',
            )}
          >
            <FrameCanvas frame={f} sprites={sprites} profile={profile} className="rounded" />
            <div className="flex items-center justify-between px-0.5 text-[11px] text-muted-foreground">
              <span className={cn('font-medium', i === current && 'text-foreground')}>{i + 1}</span>
              <span className="font-mono">{f.durationMs}ms</span>
            </div>
            {i === current && playing && <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" />}
          </button>
        ))}
      </div>

      <div className="flex shrink-0 flex-col items-end justify-between">
        <span className="text-[11px] whitespace-nowrap text-muted-foreground">
          {frames.length} frames · {(total / 1000).toFixed(1)}s
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              onClick={onDelete}
              disabled={frames.length <= 1}
              aria-label="Delete frame"
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Delete this frame</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
