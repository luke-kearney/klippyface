import { useState, type ReactNode } from 'react'
import { ArrowRight, Clock, Hand, Moon, Pencil, Plus, Sun, Trash2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { ConfirmDelete, EmptyState, ErrorState, Field, Loading, Page, PageHeader } from '@/components/common'
import { keys, useApiMutation, useGroups, usePresets } from '@/hooks/queries'
import { api, slugify } from '@/lib/api'
import type { Group, Preset } from '@/lib/types'

// Stored as JSON strings; keys are camelCase inside (not touched by api.ts key conversion).
interface Conditions {
  type: 'manual' | 'time'
  start?: string
  end?: string
}
interface Overrides {
  dimBrightness?: number
  groupSwaps?: Record<string, string>
}

function parse<T>(json: string, fallback: T): T {
  try {
    return { ...fallback, ...JSON.parse(json || '{}') }
  } catch {
    return fallback
  }
}

export function PresetsPage() {
  const { data: presets, isLoading, error } = usePresets()
  const { data: groups } = useGroups()

  return (
    <Page>
      <PageHeader
        title="Presets"
        description="Override what displays show — on a schedule (e.g. night mode) or when switched on manually."
        actions={
          <PresetDialog groups={groups ?? []}>
            <Button>
              <Plus /> New preset
            </Button>
          </PresetDialog>
        }
      />
      {error && <ErrorState error={error} />}
      {isLoading && <Loading />}
      {presets?.length === 0 && (
        <EmptyState icon={<Moon />} title="No presets yet">
          Try a “Night mode” preset that dims displays and swaps to sleepy faces from 22:00 to 07:00.
        </EmptyState>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {presets?.map((p) => <PresetCard key={p.id} preset={p} groups={groups ?? []} />)}
      </div>
    </Page>
  )
}

function PresetCard({ preset, groups }: { preset: Preset; groups: Group[] }) {
  const c = parse<Conditions>(preset.conditionsJson, { type: 'manual' })
  const o = parse<Overrides>(preset.overridesJson, {})
  const name = (id: string) => groups.find((g) => g.id === id)?.label || id
  const remove = useApiMutation(() => api.deletePreset(preset.id), { invalidate: [keys.presets], success: 'Preset deleted' })

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between">
        <div className="grid gap-1.5">
          <CardTitle>{preset.label || preset.id}</CardTitle>
          <Badge variant="secondary" className="gap-1">
            {c.type === 'time' ? <Clock className="size-3" /> : <Hand className="size-3" />}
            {c.type === 'time' ? `${c.start} – ${c.end}` : 'Manual'}
          </Badge>
        </div>
        <div className="flex">
          <PresetDialog preset={preset} groups={groups}>
            <Button variant="ghost" size="icon" aria-label="Edit preset">
              <Pencil />
            </Button>
          </PresetDialog>
          <ConfirmDelete
            title="Delete preset?"
            description={`“${preset.label}” will be removed.`}
            onConfirm={() => remove.mutateAsync(undefined)}
          >
            <Button variant="ghost" size="icon" aria-label="Delete preset">
              <Trash2 />
            </Button>
          </ConfirmDelete>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        {o.dimBrightness !== undefined && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Sun className="size-4" /> Brightness {o.dimBrightness}%
          </div>
        )}
        {Object.entries(o.groupSwaps ?? {}).map(([from, to]) => (
          <div key={from} className="flex items-center gap-2">
            <span className="truncate">{name(from)}</span>
            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
            <span className="truncate">{name(to)}</span>
          </div>
        ))}
        {o.dimBrightness === undefined && !Object.keys(o.groupSwaps ?? {}).length && (
          <span className="text-muted-foreground">No overrides</span>
        )}
      </CardContent>
    </Card>
  )
}

function GroupPicker({ value, onChange, groups }: { value: string; onChange: (v: string) => void; groups: Group[] }) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className="w-full min-w-0">
        <SelectValue placeholder="Group…" />
      </SelectTrigger>
      <SelectContent>
        {groups.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.label || g.id}
          </SelectItem>
        ))}
        {value && !groups.some((g) => g.id === value) && <SelectItem value={value}>{value} (missing)</SelectItem>}
      </SelectContent>
    </Select>
  )
}

function PresetDialog({ preset, groups, children }: { preset?: Preset; groups: Group[]; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [cond, setCond] = useState<Conditions>({ type: 'manual' })
  const [dim, setDim] = useState<number | undefined>(undefined)
  const [swaps, setSwaps] = useState<[string, string][]>([])

  function reset() {
    const o = parse<Overrides>(preset?.overridesJson ?? '{}', {})
    setLabel(preset?.label ?? '')
    setCond(parse<Conditions>(preset?.conditionsJson ?? '{}', { type: 'manual' }))
    setDim(o.dimBrightness)
    setSwaps(Object.entries(o.groupSwaps ?? {}))
  }

  const save = useApiMutation(
    () => {
      const conditionsJson = JSON.stringify(
        cond.type === 'time' ? { type: 'time', start: cond.start || '22:00', end: cond.end || '07:00' } : { type: 'manual' },
      )
      const overrides: Overrides = {}
      if (dim !== undefined) overrides.dimBrightness = dim
      const gs = Object.fromEntries(swaps.filter(([a, b]) => a && b))
      if (Object.keys(gs).length) overrides.groupSwaps = gs
      const overridesJson = JSON.stringify(overrides)
      return preset
        ? api.updatePreset(preset.id, { label: label.trim(), conditionsJson, overridesJson })
        : api.createPreset({ id: slugify(label), label: label.trim(), conditionsJson, overridesJson })
    },
    { invalidate: [keys.presets], success: preset ? 'Preset saved' : 'Preset created', onSuccess: () => setOpen(false) },
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset()
        setOpen(o)
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>{preset ? 'Edit preset' : 'New preset'}</DialogTitle>
            <DialogDescription>When active, a preset changes brightness and swaps groups on displays.</DialogDescription>
          </DialogHeader>
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Night mode" />
          </Field>

          <Field label="Active">
            <ToggleGroup
              type="single"
              variant="outline"
              value={cond.type}
              onValueChange={(v) => v && setCond((c) => ({ ...c, type: v as Conditions['type'] }))}
              className="justify-start"
            >
              <ToggleGroupItem value="manual" className="px-3">
                <Hand /> Manually
              </ToggleGroupItem>
              <ToggleGroupItem value="time" className="px-3">
                <Clock /> On a schedule
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {cond.type === 'time' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <Input type="time" value={cond.start ?? '22:00'} onChange={(e) => setCond((c) => ({ ...c, start: e.target.value }))} />
              </Field>
              <Field label="Until">
                <Input type="time" value={cond.end ?? '07:00'} onChange={(e) => setCond((c) => ({ ...c, end: e.target.value }))} />
              </Field>
            </div>
          )}

          <div className="grid gap-2">
            <label className="flex items-center justify-between text-sm font-medium">
              Dim brightness
              <Switch checked={dim !== undefined} onCheckedChange={(v) => setDim(v ? 30 : undefined)} />
            </label>
            {dim !== undefined && (
              <div className="flex items-center gap-3">
                <Slider min={0} max={100} step={5} value={[dim]} onValueChange={([v]) => setDim(v)} />
                <span className="w-10 text-right font-mono text-sm">{dim}%</span>
              </div>
            )}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Group swaps</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setSwaps((s) => [...s, ['', '']])}>
                <Plus /> Add swap
              </Button>
            </div>
            {swaps.length === 0 && <span className="text-xs text-muted-foreground">Show a different group in place of another.</span>}
            {swaps.map(([from, to], i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_1fr_auto] items-center gap-2">
                <GroupPicker groups={groups} value={from} onChange={(v) => setSwaps((s) => s.map((x, j) => (j === i ? [v, x[1]] : x)))} />
                <ArrowRight className="size-4 text-muted-foreground" />
                <GroupPicker groups={groups} value={to} onChange={(v) => setSwaps((s) => s.map((x, j) => (j === i ? [x[0], v] : x)))} />
                <Button type="button" variant="ghost" size="icon" onClick={() => setSwaps((s) => s.filter((_, j) => j !== i))} aria-label="Remove swap">
                  <X />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!label.trim() || save.isPending}>
              {preset ? 'Save' : 'Create preset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
