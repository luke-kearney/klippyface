import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ChevronRight, Cloud, CloudUpload, Grid3x3, Layers2, Magnet, Pause, Play, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Toggle } from '@/components/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ErrorState, Loading } from '@/components/common'
import { DISPLAY_PROFILES, useFramePlayback } from '@/components/DisplayPreview'
import { EditorCanvas, SPRITE_MIME } from '@/components/editor/EditorCanvas'
import { Filmstrip } from '@/components/editor/Filmstrip'
import { ElementInspector, FrameInspector, TYPE_META } from '@/components/editor/Inspector'
import { SpriteThumb } from '@/components/SpriteThumb'
import { useSpriteBitmaps, useSprites } from '@/hooks/queries'
import { useSetDocument } from '@/hooks/useSetDocument'
import { DATA_KEYS } from '@/lib/render'
import { groupByFolder } from '@/lib/sprite'
import type { FrameElement } from '@/lib/types'
import { cn } from '@/lib/utils'

const PROFILE_KEY = 'klippyface.editor.profile'
const SNAP_KEY = 'klippyface.editor.snap'

function useStoredState<T extends string>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    try {
      return (localStorage.getItem(key) as T) || initial
    } catch {
      return initial
    }
  })
  const set = (x: T) => {
    setV(x)
    try {
      localStorage.setItem(key, x)
    } catch {
      // storage unavailable; keep in memory only
    }
  }
  return [v, set] as const
}

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))

export function SetEditorPage() {
  const { groupId = '', setId = '' } = useParams()
  const doc = useSetDocument(groupId, setId)
  const { data: spriteList = [] } = useSprites()
  const sprites = useSpriteBitmaps()

  const [profileId, setProfileId] = useStoredState(PROFILE_KEY, DISPLAY_PROFILES[0].id)
  const profile = DISPLAY_PROFILES.find((p) => p.id === profileId) ?? DISPLAY_PROFILES[0]
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState('1')
  const [onion, setOnion] = useState(false)
  /** 'prev' | 'next' follow the current frame; 'frame:<id>' pins any frame in the group. */
  const [onionSource, setOnionSource] = useState('prev')
  const [grid, setGrid] = useState(true)
  const [snap, setSnap] = useStoredState<'on' | 'off'>(SNAP_KEY, 'on')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [current, setCurrent] = useFramePlayback(doc.frames, playing, parseFloat(speed), doc.set?.frameTime)

  const frame = doc.frames[current]

  // This set's frames come from the live document (unsaved edits included); other
  // sets in the group from the server copy.
  const otherSets = (doc.group?.sets ?? []).filter((s) => s.id !== setId && s.frames?.length)
  const onionFrame = (() => {
    if (!onion || playing) return undefined
    if (onionSource === 'prev') return doc.frames[current - 1]
    if (onionSource === 'next') return doc.frames[current + 1]
    const id = onionSource.slice('frame:'.length)
    return doc.frames.find((f) => f.id === id) ?? otherSets.flatMap((s) => s.frames ?? []).find((f) => f.id === id)
  })()
  const onionPinMissing =
    onionSource.startsWith('frame:') &&
    !doc.frames.concat(otherSets.flatMap((s) => s.frames ?? [])).some((f) => `frame:${f.id}` === onionSource)
  const elements = useMemo(() => frame?.elements ?? [], [frame])
  const selected = elements.find((e) => e.id === selectedId) ?? null

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null)
  }, [selectedId, selected])

  // A pinned frame that was deleted falls back to the previous frame.
  useEffect(() => {
    if (onionPinMissing && !doc.loading) setOnionSource('prev')
  }, [onionPinMissing, doc.loading])

  const addElement = useCallback(
    async (el: Pick<FrameElement, 'type' | 'value'> & Partial<FrameElement>) => {
      if (!frame) return
      const created = await doc.addElement(frame.id, {
        label: '',
        color: '#FFFFFF',
        x: Math.floor(profile.width / 2),
        y: Math.floor(profile.height / 2),
        ...el,
      })
      if (created) setSelectedId(created.id)
    },
    [frame, doc, profile.width, profile.height],
  )

  const addSprite = (id: string, x?: number, y?: number) => {
    const s = sprites.get(id)
    addElement({
      type: 'sprite',
      value: id,
      x: x ?? Math.floor((profile.width - (s?.width ?? 0)) / 2),
      y: y ?? Math.floor((profile.height - (s?.height ?? 0)) / 2),
    })
  }

  const duplicateElement = (el: FrameElement) =>
    addElement({ type: el.type, value: el.value, label: el.label, color: el.color, x: el.x + 4, y: el.y + 4 })

  const moveLayer = (el: FrameElement, dir: -1 | 1) => {
    if (!frame) return
    const ids = elements.map((e) => e.id)
    const i = ids.indexOf(el.id)
    const j = i + dir
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    doc.reorderElements(frame.id, ids)
  }

  const duplicateFrame = async () => {
    if (!frame) return
    const f = await doc.addFrame(current, frame)
    if (f) setCurrent(current + 1)
  }

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const mod = e.ctrlKey || e.metaKey
      if (e.key === ' ') {
        e.preventDefault()
        setPlaying((p) => !p)
        return
      }
      if (playing) return
      if (e.key === '[' || e.key === ',') setCurrent((c) => Math.max(0, c - 1))
      if (e.key === ']' || e.key === '.') setCurrent((c) => Math.min(doc.frames.length - 1, c + 1))
      if (mod && e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateFrame()
        return
      }
      if (!selected || !frame) return
      const step = e.shiftKey ? 8 : 1
      const nudge: Record<string, [number, number]> = {
        ArrowLeft: [-step, 0],
        ArrowRight: [step, 0],
        ArrowUp: [0, -step],
        ArrowDown: [0, step],
      }
      if (nudge[e.key]) {
        e.preventDefault()
        const [dx, dy] = nudge[e.key]
        doc.updateElement(frame.id, selected.id, { x: selected.x + dx, y: selected.y + dy })
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        doc.deleteElement(frame.id, selected.id)
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault()
        duplicateElement(selected)
      } else if (e.key === 'Escape') {
        setSelectedId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (doc.loading) return <Loading />
  if (doc.error || !doc.set)
    return (
      <div className="p-8">
        <ErrorState error={doc.error ?? new Error('Set not found')} />
      </div>
    )

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-1 text-sm">
          <Link to="/groups" className="text-muted-foreground hover:text-foreground">
            Groups
          </Link>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <Link to={`/groups/${groupId}`} className="truncate text-muted-foreground hover:text-foreground">
            {doc.group?.label || groupId}
          </Link>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <span className="truncate font-medium">{doc.set.label || 'Untitled set'}</span>
        </div>
        <span
          className={cn(
            'ml-2 flex items-center gap-1 text-xs',
            doc.saving ? 'text-muted-foreground' : 'text-muted-foreground/60',
          )}
        >
          {doc.saving ? <CloudUpload className="size-3.5 animate-pulse" /> : <Cloud className="size-3.5" />}
          {doc.saving ? 'Saving…' : 'All changes saved'}
        </span>

        <div className="ml-auto flex items-center gap-1">
          <Select value={profile.id} onValueChange={setProfileId}>
            <SelectTrigger size="sm" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISPLAY_PROFILES.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Separator orientation="vertical" className="mx-1 !h-6" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle size="sm" pressed={grid} onPressedChange={setGrid} aria-label="Pixel grid">
                <Grid3x3 />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Pixel grid</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle size="sm" pressed={onion} onPressedChange={setOnion} aria-label="Onion skin">
                <Layers2 />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Onion skin: overlay another frame</TooltipContent>
          </Tooltip>
          {onion && (
            <Select value={onionSource} onValueChange={setOnionSource}>
              <SelectTrigger size="sm" className="w-36" aria-label="Onion skin frame">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prev">Previous frame</SelectItem>
                <SelectItem value="next">Next frame</SelectItem>
                <SelectGroup>
                  <SelectLabel>This set</SelectLabel>
                  {doc.frames.map((f, i) => (
                    <SelectItem key={f.id} value={`frame:${f.id}`}>
                      Frame {i + 1}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {otherSets.map((s) => (
                  <SelectGroup key={s.id}>
                    <SelectLabel>{s.label || 'Untitled set'}</SelectLabel>
                    {s.frames!.map((f, i) => (
                      <SelectItem key={f.id} value={`frame:${f.id}`}>
                        {s.label || 'Untitled set'} · {i + 1}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle size="sm" pressed={snap === 'on'} onPressedChange={(p) => setSnap(p ? 'on' : 'off')} aria-label="Snap">
                <Magnet />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Snap to centre and other elements (hold Alt to bypass)</TooltipContent>
          </Tooltip>
          <Separator orientation="vertical" className="mx-1 !h-6" />
          <Select value={speed} onValueChange={setSpeed}>
            <SelectTrigger size="sm" className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {['0.25', '0.5', '1', '2'].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}×
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => setPlaying((p) => !p)} className="w-24">
            {playing ? <Pause /> : <Play />} {playing ? 'Pause' : 'Play'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Toolbox */}
        <aside className="hidden w-56 shrink-0 flex-col border-r lg:flex">
          <ScrollArea className="min-h-0 flex-1">
            <div className="grid gap-4 p-3">
              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground uppercase">Add</span>
                <Button variant="outline" size="sm" className="justify-start" onClick={() => addElement({ type: 'text', value: 'Hello' })} disabled={playing}>
                  <TYPE_META.text.icon /> Text
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="justify-start"
                  onClick={() => addElement({ type: 'datavalue', value: DATA_KEYS[0].key })}
                  disabled={playing}
                >
                  <TYPE_META.datavalue.icon /> Printer value
                </Button>
              </div>

              <div className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground uppercase">Sprites</span>
                  <Link to="/sprites" className="text-xs text-muted-foreground hover:text-foreground">
                    Manage
                  </Link>
                </div>
                {spriteList.length === 0 && (
                  <Link to="/sprites" className="rounded-md border border-dashed p-3 text-center text-xs text-muted-foreground">
                    <Plus className="mx-auto mb-1 size-4" />
                    Draw a sprite first
                  </Link>
                )}
                {groupByFolder(spriteList).map(([folder, list], _, all) => (
                  <div key={folder} className="grid gap-1">
                    {(all.length > 1 || folder) && (
                      <span className={cn('truncate text-[11px] text-muted-foreground', !folder && 'italic')}>
                        {folder || 'Unfiled'}
                      </span>
                    )}
                    <div className="grid grid-cols-3 gap-1.5">
                      {list.map((s) => (
                        <Tooltip key={s.id}>
                          <TooltipTrigger asChild>
                            <button
                              draggable={!playing}
                              onDragStart={(e) => {
                                e.dataTransfer.setData(SPRITE_MIME, s.id)
                                e.dataTransfer.effectAllowed = 'copy'
                              }}
                              onClick={() => !playing && addSprite(s.id)}
                              className="grid aspect-square cursor-grab place-items-center rounded-md border bg-black p-1 hover:border-primary active:cursor-grabbing"
                            >
                              <SpriteThumb bitmap={sprites.get(s.id)} emptyLabel={s.label || s.id} />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {s.label || s.id} · {s.width}×{s.height} — drag onto the canvas
                          </TooltipContent>
                        </Tooltip>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid gap-1.5">
                <span className="text-xs font-medium text-muted-foreground uppercase">Layers</span>
                {elements.length === 0 && <span className="text-xs text-muted-foreground">Empty frame</span>}
                {[...elements].reverse().map((el) => {
                  const M = TYPE_META[el.type] ?? TYPE_META.text
                  return (
                    <button
                      key={el.id}
                      onClick={() => setSelectedId(el.id)}
                      className={cn(
                        'flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent',
                        el.id === selectedId && 'bg-accent font-medium',
                      )}
                    >
                      <M.icon className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{el.value || '—'}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* Canvas */}
        <main className="min-w-0 flex-1 bg-[radial-gradient(circle_at_center,var(--color-muted)_0,transparent_70%)] p-4">
          <EditorCanvas
            frame={frame}
            onionFrame={onionFrame}
            sprites={sprites}
            profile={profile}
            selectedId={playing ? null : selectedId}
            interactive={!playing}
            showGrid={grid && !playing}
            snap={snap === 'on'}
            onSelect={setSelectedId}
            onMove={(el, x, y, done) => frame && doc.updateElement(frame.id, el.id, { x, y }, done)}
            onDropSprite={(id, x, y) => addSprite(id, x, y)}
          />
        </main>

        {/* Inspector */}
        <aside className="hidden w-72 shrink-0 border-l md:block">
          <ScrollArea className="h-full">
            <div className="p-4">
              {selected && frame ? (
                <ElementInspector
                  key={selected.id}
                  element={selected}
                  index={elements.indexOf(selected)}
                  count={elements.length}
                  spriteList={spriteList}
                  driverType={profile.driverType}
                  onChange={(patch) => doc.updateElement(frame.id, selected.id, patch)}
                  onMove={(dir) => moveLayer(selected, dir)}
                  onDuplicate={() => duplicateElement(selected)}
                  onDelete={() => doc.deleteElement(frame.id, selected.id)}
                />
              ) : frame ? (
                <FrameInspector
                  frame={frame}
                  index={current}
                  set={doc.set}
                  driverType={profile.driverType}
                  onFrameChange={(patch) => doc.updateFrame(frame.id, patch)}
                  onSetChange={doc.updateSet}
                />
              ) : (
                <p className="text-sm text-muted-foreground">This set has no frames yet. Add one below.</p>
              )}
            </div>
          </ScrollArea>
        </aside>
      </div>

      <Filmstrip
        frames={doc.frames}
        current={current}
        onionId={onionFrame?.id}
        playing={playing}
        sprites={sprites}
        profile={profile}
        onSelect={(i) => {
          setPlaying(false)
          setCurrent(i)
        }}
        onReorder={doc.reorderFrames}
        onAdd={async () => {
          const f = await doc.addFrame(doc.frames.length ? current : -1)
          if (f) setCurrent(doc.frames.length ? current + 1 : 0)
        }}
        onDuplicate={duplicateFrame}
        onDelete={() => {
          if (!frame) return
          doc.deleteFrame(frame.id)
          setCurrent(Math.max(0, current - 1))
        }}
      />
    </div>
  )
}
