import { ArrowDown, ArrowUp, Copy, Gauge, Image, Trash2, Type } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Field } from '@/components/common'
import { DATA_KEYS, isMono } from '@/lib/render'
import { groupByFolder } from '@/lib/sprite'
import type { Frame, FrameElement, Set, Sprite } from '@/lib/types'
import { cn } from '@/lib/utils'

export const TYPE_META = {
  text: { label: 'Text', icon: Type },
  sprite: { label: 'Sprite', icon: Image },
  datavalue: { label: 'Data value', icon: Gauge },
} as const

const SWATCHES = ['#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#00C7BE', '#007AFF', '#AF52DE']

function ColorField({ value, onChange, mono }: { value: string; onChange: (v: string) => void; mono: boolean }) {
  return (
    <Field label="Colour" hint={mono ? 'Monochrome panel: any non-black colour lights the pixel.' : undefined}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="size-9 shrink-0 cursor-pointer rounded-md border bg-transparent p-1"
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} className="font-mono" />
      </div>
      {!mono && (
        <div className="flex gap-1">
          {SWATCHES.map((c) => (
            <button
              key={c}
              onClick={() => onChange(c)}
              className={cn('size-5 rounded-full border', value.toUpperCase() === c && 'ring-2 ring-ring ring-offset-1 ring-offset-background')}
              style={{ background: c }}
              aria-label={c}
            />
          ))}
        </div>
      )}
    </Field>
  )
}

const NumberInput = ({ value, onChange }: { value: number; onChange: (v: number) => void }) => (
  <Input type="number" value={value} onChange={(e) => onChange(parseInt(e.target.value) || 0)} className="font-mono" />
)

export function ElementInspector({
  element,
  index,
  count,
  spriteList,
  driverType,
  onChange,
  onMove,
  onDuplicate,
  onDelete,
}: {
  element: FrameElement
  index: number
  count: number
  spriteList: Sprite[]
  driverType: string
  onChange: (patch: Partial<FrameElement>) => void
  onMove: (dir: -1 | 1) => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const meta = TYPE_META[element.type] ?? TYPE_META.text
  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <Badge variant="secondary" className="gap-1">
          <meta.icon className="size-3" /> {meta.label}
        </Badge>
        <div className="flex">
          <Button variant="ghost" size="icon" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Bring forward">
            <ArrowUp />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Send backward">
            <ArrowDown />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDuplicate} aria-label="Duplicate element">
            <Copy />
          </Button>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="Delete element" className="hover:text-destructive">
            <Trash2 />
          </Button>
        </div>
      </div>

      {element.type === 'text' && (
        <Field label="Text" hint="5×7 font, 6px per character. Centred on X/Y.">
          <Input value={element.value} onChange={(e) => onChange({ value: e.target.value })} />
        </Field>
      )}
      {element.type === 'sprite' && (
        <Field label="Sprite">
          <Select value={element.value} onValueChange={(v) => onChange({ value: v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose sprite" />
            </SelectTrigger>
            <SelectContent>
              {groupByFolder(spriteList).map(([folder, list]) => (
                <SelectGroup key={folder}>
                  <SelectLabel>{folder || 'Unfiled'}</SelectLabel>
                  {list.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.label || s.id} <span className="text-muted-foreground">{s.width}×{s.height}</span>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {element.type === 'datavalue' && (
        <Field label="Printer value" hint="Preview shows sample data. Centred on X/Y.">
          <Select value={element.value} onValueChange={(v) => onChange({ value: v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose value" />
            </SelectTrigger>
            <SelectContent>
              {DATA_KEYS.map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  {d.label} <span className="font-mono text-xs text-muted-foreground">{d.sample}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}

      <Field
        label="Size"
        hint={element.type === 'sprite' ? 'Each sprite pixel drawn as a size×size block.' : `Font scale: ${6 * (element.size || 1)}×${8 * (element.size || 1)}px per character.`}
      >
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          value={String(element.size || 1)}
          onValueChange={(v) => v && onChange({ size: +v })}
          className="w-full"
        >
          {[1, 2, 3, 4].map((n) => (
            <ToggleGroupItem key={n} value={String(n)} className="flex-1 font-mono text-xs">
              {n}×
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="X">
          <NumberInput value={element.x} onChange={(x) => onChange({ x })} />
        </Field>
        <Field label="Y">
          <NumberInput value={element.y} onChange={(y) => onChange({ y })} />
        </Field>
      </div>
      <ColorField value={element.color || '#FFFFFF'} onChange={(color) => onChange({ color })} mono={isMono(driverType)} />
      <p className="text-xs text-muted-foreground">
        Drag on the canvas, or use arrow keys to nudge (Shift = 8px). Delete removes, Ctrl+D duplicates.
      </p>
    </div>
  )
}

export function FrameInspector({
  frame,
  index,
  set,
  driverType,
  onFrameChange,
  onSetChange,
}: {
  frame: Frame
  index: number
  set: Set
  driverType: string
  onFrameChange: (patch: Partial<Pick<Frame, 'durationMs' | 'bgColor'>>) => void
  onSetChange: (patch: Partial<Pick<Set, 'label' | 'description' | 'loopCount' | 'frameTime'>>) => void
}) {
  return (
    <div className="grid gap-4">
      <h3 className="text-sm font-semibold">Frame {index + 1}</h3>
      <Field label={`Duration · ${frame.durationMs} ms`}>
        <div className="flex items-center gap-3">
          <Slider
            min={50}
            max={5000}
            step={50}
            value={[frame.durationMs]}
            onValueChange={([v]) => onFrameChange({ durationMs: v })}
          />
          <Input
            type="number"
            min={30}
            max={60000}
            value={frame.durationMs}
            onChange={(e) => onFrameChange({ durationMs: Math.max(30, parseInt(e.target.value) || 0) })}
            className="w-24 font-mono"
          />
        </div>
      </Field>
      <ColorField
        value={frame.bgColor || '#000000'}
        onChange={(bgColor) => onFrameChange({ bgColor })}
        mono={isMono(driverType)}
      />
      <Separator />
      <h3 className="text-sm font-semibold">Set</h3>
      <Field label="Label">
        <Input value={set.label} onChange={(e) => onSetChange({ label: e.target.value })} />
      </Field>
      <Field label="Description">
        <Textarea
          value={set.description}
          onChange={(e) => onSetChange({ description: e.target.value })}
          placeholder="What this animation is for"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Loops" hint="0 = forever">
          <NumberInput value={set.loopCount} onChange={(loopCount) => onSetChange({ loopCount: Math.max(0, loopCount) })} />
        </Field>
        <Field label="Default ms" hint="For new frames">
          <NumberInput value={set.frameTime} onChange={(frameTime) => onSetChange({ frameTime })} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">Click an element on the canvas to edit it.</p>
    </div>
  )
}
