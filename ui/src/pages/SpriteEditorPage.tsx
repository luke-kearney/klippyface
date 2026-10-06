import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useBlocker } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Copy,
  Crosshair,
  Contrast,
  Eraser,
  Eye,
  EyeOff,
  FlipHorizontal2,
  FlipVertical2,
  Grid3x3,
  Folder,
  ImageUp,
  PaintBucket,
  Pencil,
  Redo2,
  Save,
  Slash,
  SquarePen,
  Square,
  SquareSplitHorizontal,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDelete, ErrorState, Field, Loading } from '@/components/common'
import { FrameCanvas } from '@/components/DisplayPreview'
import { PixelEditor, type Axis, type MirrorAxes, type ReferenceOverlay, type Tool } from '@/components/PixelEditor'
import { RenameIdDialog } from '@/components/RenameIdDialog'
import { SpriteThumb } from '@/components/SpriteThumb'
import { keys, useApiMutation, useDuplicateSprite, useSprites } from '@/hooks/queries'
import { api } from '@/lib/api'
import { bitmapFromImage, decodeSprite, encodeSprite, groupByFolder, resizeBitmap, type Bitmap } from '@/lib/sprite'
import type { Sprite } from '@/lib/types'

const TOOLS: { id: Tool; label: string; key: string; icon: typeof Pencil }[] = [
  { id: 'pencil', label: 'Pencil', key: 'b', icon: Pencil },
  { id: 'eraser', label: 'Eraser', key: 'e', icon: Eraser },
  { id: 'fill', label: 'Fill', key: 'g', icon: PaintBucket },
  { id: 'line', label: 'Line', key: 'l', icon: Slash },
  { id: 'rect', label: 'Rectangle', key: 'r', icon: Square },
  { id: 'text', label: 'Text', key: 't', icon: Type },
]

const BRUSH_SIZES = [1, 2, 3, 4, 6, 8]
const TEXT_SCALES = [1, 2, 3, 4]

function transform(b: Bitmap, fn: (x: number, y: number) => [number, number] | null): Bitmap {
  const out = new Uint8Array(b.pixels.length)
  for (let y = 0; y < b.height; y++)
    for (let x = 0; x < b.width; x++) {
      const src = fn(x, y)
      if (src && src[0] >= 0 && src[1] >= 0 && src[0] < b.width && src[1] < b.height)
        out[y * b.width + x] = b.pixels[src[1] * b.width + src[0]]
    }
  return { ...b, pixels: out }
}

export function SpriteEditorPage() {
  const { spriteId = '' } = useParams()
  const { data: sprites, isLoading, error } = useSprites()
  const sprite = sprites?.find((s) => s.id === spriteId)

  if (isLoading) return <Loading />
  if (error || !sprite)
    return (
      <div className="p-8">
        <ErrorState error={error ?? new Error('Sprite not found')} />
      </div>
    )
  return <SpriteEditor key={sprite.id} sprite={sprite} sprites={sprites!} />
}

function SpriteEditor({ sprite, sprites }: { sprite: Sprite; sprites: Sprite[] }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const initial = useMemo(() => decodeSprite(sprite.dataBase64, sprite.width, sprite.height), [sprite])
  const [history, setHistory] = useState<{ stack: Bitmap[]; i: number }>({ stack: [initial], i: 0 })
  const bitmap = history.stack[history.i]
  const [savedB64, setSavedB64] = useState(() => encodeSprite(initial))
  const [label, setLabel] = useState(sprite.label)
  const [folder, setFolder] = useState(sprite.folder)
  const [description, setDescription] = useState(sprite.description)
  const folders = useMemo(() => [...new Set(sprites.map((s) => s.folder).filter(Boolean))].sort(), [sprites])
  const [tool, setTool] = useState<Tool>('pencil')
  const [brushSize, setBrushSize] = useState(1)
  const [textScale, setTextScale] = useState(1)
  const [axes, setAxes] = useState<MirrorAxes>({})
  const [mirrorOn, setMirrorOn] = useState(false)
  const [placing, setPlacing] = useState<Axis | null>(null)
  const hasAxes = axes.x2 !== undefined || axes.y2 !== undefined
  const mirror = mirrorOn && hasAxes ? axes : null
  // M / the toolbar button: cancel placing, else place a first line, else toggle.
  const toggleMirror = () => {
    if (placing) setPlacing(null)
    else if (!hasAxes) setPlacing('x')
    else setMirrorOn((m) => !m)
  }
  const placeAxis = (axis: Axis, pos2: number) => {
    setAxes((a) => ({ ...a, [`${axis}2`]: pos2 }))
    setMirrorOn(true)
    setPlacing(null)
  }
  const [reference, setReference] = useReferenceSettings(sprite.id)
  const referenceOverlay = useMemo((): ReferenceOverlay | undefined => {
    const r = reference.visible && sprites.find((s) => s.id === reference.id)
    if (!r) return undefined
    return { bitmap: decodeSprite(r.dataBase64, r.width, r.height), opacity: reference.opacity, align: reference.align }
  }, [reference, sprites])
  const [grid, setGrid] = useState(true)
  const [importFile, setImportFile] = useState<HTMLImageElement | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty =
    label !== sprite.label ||
    folder.trim() !== sprite.folder ||
    description.trim() !== sprite.description ||
    bitmap.width !== sprite.width ||
    bitmap.height !== sprite.height ||
    encodeSprite(bitmap) !== savedB64

  const commit = (b: Bitmap) =>
    setHistory((h) => {
      const stack = h.stack.slice(0, h.i + 1)
      stack.push(b)
      if (stack.length > 100) stack.shift()
      return { stack, i: stack.length - 1 }
    })
  const undo = () => setHistory((h) => ({ ...h, i: Math.max(0, h.i - 1) }))
  const redo = () => setHistory((h) => ({ ...h, i: Math.min(h.stack.length - 1, h.i + 1) }))

  const save = useApiMutation(
    async () => {
      const dataBase64 = encodeSprite(bitmap)
      await api.updateSprite(sprite.id, {
        label: label.trim() || sprite.id,
        folder: folder.trim(),
        description: description.trim(),
        width: bitmap.width,
        height: bitmap.height,
        dataBase64,
      })
      return dataBase64
    },
    {
      invalidate: [keys.sprites, keys.groups],
      success: 'Sprite saved',
      onSuccess: (b64) => setSavedB64(b64),
    },
  )
  const remove = useApiMutation(() => api.deleteSprite(sprite.id), {
    success: 'Sprite deleted',
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.sprites })
      navigate('/sprites')
    },
  })

  // Set when leaving on purpose (e.g. after duplicating, where the edits live on in the copy).
  const skipBlock = useRef(false)
  const duplicate = useDuplicateSprite((copy) => {
    skipBlock.current = true
    navigate(`/sprites/${copy.id}`)
  })

  const rename = useApiMutation(
    async (newId: string) => {
      // Save first so pending edits move to the new id instead of being dropped.
      if (dirty) await save.mutateAsync(undefined)
      return api.renameSprite(sprite.id, newId)
    },
    {
      // Frame elements that used the old id were repointed.
      invalidate: [keys.sprites, keys.groups],
      onSuccess: ({ sprite: renamed, elementsUpdated }) => {
        qc.setQueryData<Sprite[]>(keys.sprites, (old) => old?.map((s) => (s.id === sprite.id ? renamed : s)))
        toast.success(
          elementsUpdated
            ? `Sprite ID changed; ${elementsUpdated} frame element${elementsUpdated === 1 ? '' : 's'} updated`
            : 'Sprite ID changed',
        )
        skipBlock.current = true
        navigate(`/sprites/${renamed.id}`, { replace: true })
      },
    },
  )

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !skipBlock.current && currentLocation.pathname !== nextLocation.pathname,
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      } else if (mod && k === 'y') {
        e.preventDefault()
        redo()
      } else if (mod && k === 's') {
        e.preventDefault()
        if (dirty) save.mutate(undefined)
      } else if (!mod) {
        const t = TOOLS.find((t) => t.key === k)
        if (t) setTool(t.id)
        if (k === 'm') toggleMirror()
        if (k === 'o' && reference.id) setReference({ visible: !reference.visible })
        if (k === 'escape') setPlacing(null)
        const [sizes, size, setSize] =
          tool === 'text' ? [TEXT_SCALES, textScale, setTextScale] : [BRUSH_SIZES, brushSize, setBrushSize]
        const si = sizes.indexOf(size)
        if (k === '[') setSize(sizes[Math.max(0, si - 1)])
        if (k === ']') setSize(sizes[Math.min(sizes.length - 1, si + 1)])
      }
    }
    window.addEventListener('keydown', onKey)
    const unload = (e: BeforeUnloadEvent) => dirty && e.preventDefault()
    window.addEventListener('beforeunload', unload)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('beforeunload', unload)
    }
  })

  const { width: w, height: h } = bitmap
  const actions: { label: string; icon: typeof Pencil; run: () => void }[] = [
    { label: 'Flip horizontal', icon: FlipHorizontal2, run: () => commit(transform(bitmap, (x, y) => [w - 1 - x, y])) },
    { label: 'Flip vertical', icon: FlipVertical2, run: () => commit(transform(bitmap, (x, y) => [x, h - 1 - y])) },
    { label: 'Invert', icon: Contrast, run: () => commit({ ...bitmap, pixels: bitmap.pixels.map((p) => (p ? 0 : 1)) }) },
    { label: 'Shift left', icon: ArrowLeft, run: () => commit(transform(bitmap, (x, y) => [x + 1, y])) },
    { label: 'Shift right', icon: ArrowRight, run: () => commit(transform(bitmap, (x, y) => [x - 1, y])) },
    { label: 'Shift up', icon: ArrowUp, run: () => commit(transform(bitmap, (x, y) => [x, y + 1])) },
    { label: 'Shift down', icon: ArrowDown, run: () => commit(transform(bitmap, (x, y) => [x, y - 1])) },
    { label: 'Clear', icon: Trash2, run: () => commit({ ...bitmap, pixels: new Uint8Array(w * h) }) },
  ]

  // Sprite centred on a 128×64 OLED for context.
  const displayFrame = useMemo(
    () => ({
      bgColor: '#000000',
      elements: [
        {
          id: 'p',
          frameId: '',
          sortOrder: 0,
          type: 'sprite' as const,
          value: 'p',
          label: '',
          color: '#FFFFFF',
          x: Math.floor((128 - w) / 2),
          y: Math.floor((64 - h) / 2),
        },
      ],
    }),
    [w, h],
  )
  const previewSprites = useMemo(() => new Map([['p', bitmap]]), [bitmap])

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-2 border-b px-4 py-2">
        <div className="flex min-w-0 items-center gap-1 text-sm">
          <Link to="/sprites" className="text-muted-foreground hover:text-foreground">
            Sprites
          </Link>
          <ChevronRight className="size-3.5 text-muted-foreground" />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="min-w-0 rounded bg-transparent px-1 font-medium outline-none hover:bg-accent/50 focus:bg-accent/50"
            aria-label="Sprite label"
          />
          <RenameIdDialog
            title="Change sprite ID"
            currentId={sprite.id}
            taken={sprites.map((s) => s.id)}
            description={
              dirty
                ? 'Frame elements that use this sprite are updated to the new ID. Your unsaved edits are saved first.'
                : 'Frame elements that use this sprite are updated to the new ID.'
            }
            onRename={(id) => rename.mutateAsync(id)}
          >
            <button
              type="button"
              className="group/id flex items-center gap-1 rounded px-1 font-mono text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              title="Change ID"
            >
              {sprite.id}
              <SquarePen className="size-3 opacity-0 transition-opacity group-hover/id:opacity-100" />
            </button>
          </RenameIdDialog>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                disabled={duplicate.isPending}
                onClick={() =>
                  duplicate.mutate({
                    id: sprite.id,
                    label: label.trim() || sprite.label,
                    folder: folder.trim(),
                    description: description.trim(),
                    width: bitmap.width,
                    height: bitmap.height,
                    dataBase64: encodeSprite(bitmap),
                  })
                }
              >
                <Copy /> Duplicate
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {dirty ? 'Copy includes your unsaved edits; this sprite stays as last saved' : 'Make a copy and open it'}
            </TooltipContent>
          </Tooltip>
          <ConfirmDelete
            title="Delete sprite?"
            description="Frame elements that use it will draw nothing."
            onConfirm={() => remove.mutateAsync(undefined)}
          >
            <Button variant="ghost" size="sm">
              <Trash2 /> Delete
            </Button>
          </ConfirmDelete>
          <Button size="sm" variant={dirty ? 'default' : 'secondary'} onClick={() => save.mutate(undefined)} disabled={!dirty || save.isPending}>
            <Save /> {dirty ? 'Save' : 'Saved'}
          </Button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Tools */}
        <aside className="flex w-14 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r py-3">
          <ToggleGroup
            type="single"
            orientation="vertical"
            value={tool}
            onValueChange={(v) => v && setTool(v as Tool)}
            className="flex-col"
          >
            {TOOLS.map((t) => (
              <Tooltip key={t.id}>
                <TooltipTrigger asChild>
                  <ToggleGroupItem value={t.id} aria-label={t.label} className="size-9">
                    <t.icon />
                  </ToggleGroupItem>
                </TooltipTrigger>
                <TooltipContent side="right">
                  {t.label} ({t.key.toUpperCase()}) · right-click {t.id === 'text' ? 'erases text' : 'erases'}
                </TooltipContent>
              </Tooltip>
            ))}
          </ToggleGroup>
          <Separator className="my-1 w-8" />
          {tool === 'text' ? (
            <ToggleGroup
              type="single"
              orientation="vertical"
              value={String(textScale)}
              onValueChange={(v) => v && setTextScale(+v)}
              className="flex-col"
            >
              {TEXT_SCALES.map((n) => (
                <Tooltip key={n}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value={String(n)} aria-label={`Text size ${n}`} className="size-9 font-mono text-xs">
                      {n}×
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    Text size {n} ({5 * n}×{7 * n}px glyphs, [ / ] to change)
                  </TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
          ) : (
            <ToggleGroup
              type="single"
              orientation="vertical"
              value={String(brushSize)}
              onValueChange={(v) => v && setBrushSize(+v)}
              className="flex-col"
              disabled={tool === 'fill'}
            >
              {BRUSH_SIZES.map((n) => (
                <Tooltip key={n}>
                  <TooltipTrigger asChild>
                    <ToggleGroupItem value={String(n)} aria-label={`Brush ${n}px`} className="size-9">
                      <span
                        className="rounded-[1px] bg-current"
                        style={{ width: 2 + n * 1.5, height: 2 + n * 1.5 }}
                      />
                    </ToggleGroupItem>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    Brush {n}×{n}px ([ / ] to change)
                  </TooltipContent>
                </Tooltip>
              ))}
            </ToggleGroup>
          )}
          <Separator className="my-1 w-8" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle pressed={!!mirror || !!placing} onPressedChange={toggleMirror} className="size-9" aria-label="Mirror">
                <SquareSplitHorizontal />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="right">
              {placing
                ? 'Placing mirror line (Esc cancels)'
                : hasAxes
                  ? `Mirror ${mirror ? 'on' : 'off'} (M) · move lines in the side panel`
                  : 'Mirror: click to place a mirror line (M)'}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle pressed={grid} onPressedChange={setGrid} className="size-9" aria-label="Grid">
                <Grid3x3 />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="right">Pixel grid</TooltipContent>
          </Tooltip>
          <Separator className="my-1 w-8" />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={undo} disabled={history.i === 0} aria-label="Undo">
                <Undo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Undo (Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={redo}
                disabled={history.i === history.stack.length - 1}
                aria-label="Redo"
              >
                <Redo2 />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Redo (Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
        </aside>

        <main className="min-w-0 flex-1 p-4">
          <PixelEditor bitmap={bitmap} tool={tool} brushSize={brushSize} textScale={textScale} mirror={mirror}
            placing={placing}
            onPlaceAxis={placeAxis}
            reference={referenceOverlay}
            showGrid={grid}
            onCommit={commit}
          />
        </main>

        {/* Side panel */}
        <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l p-4 md:flex">
          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Details</span>
            <Field label="Folder">
              <div className="relative">
                <Folder className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                  placeholder="Unfiled"
                  list="sprite-folders"
                  className="pl-8"
                />
              </div>
              <datalist id="sprite-folders">
                {folders.map((f) => (
                  <option key={f} value={f} />
                ))}
              </datalist>
            </Field>
            <Field label="Description">
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Where it's used, how it animates…"
              />
            </Field>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Preview</span>
            <div className="flex items-end gap-3 rounded-lg border bg-black p-3">
              <SpriteThumb bitmap={bitmap} className="!w-auto" />
              <div style={{ width: w * 2 }}>
                <SpriteThumb bitmap={bitmap} />
              </div>
            </div>
            <div className="rounded-lg border bg-black p-2">
              <FrameCanvas frame={displayFrame} sprites={previewSprites} profile={{ width: 128, height: 64, driverType: 'sh1106' }} />
            </div>
            <span className="text-xs text-muted-foreground">1×, 2× and centred on a 128×64 OLED.</span>
          </div>

          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Transform</span>
            <div className="grid grid-cols-4 gap-1">
              {actions.map((a) => (
                <Tooltip key={a.label}>
                  <TooltipTrigger asChild>
                    <Button variant="outline" size="icon" onClick={a.run} aria-label={a.label}>
                      <a.icon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{a.label}</TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>

          <MirrorControls
            axes={axes}
            on={!!mirror}
            placing={placing}
            width={w}
            height={h}
            onToggle={() => setMirrorOn((m) => !m)}
            onPlace={(a) => setPlacing((p) => (p === a ? null : a))}
            onSet={placeAxis}
            onRemove={(a) => setAxes(({ [`${a}2` as const]: _, ...rest }) => rest)}
          />

          <ReferenceControls sprites={sprites} currentId={sprite.id} value={reference} onChange={setReference} />

          <ResizeControls bitmap={bitmap} onResize={(nw, nh) => commit(resizeBitmap(bitmap, nw, nh))} />

          <div className="grid gap-2">
            <span className="text-xs font-medium text-muted-foreground uppercase">Import</span>
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <ImageUp /> Import image…
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                if (!file) return
                const img = new Image()
                img.onload = () => setImportFile(img)
                img.onerror = () => toast.error('Could not read that image')
                img.src = URL.createObjectURL(file)
              }}
            />
          </div>
        </aside>
      </div>

      <ImportDialog
        image={importFile}
        width={w}
        height={h}
        onClose={() => setImportFile(null)}
        onApply={(b) => {
          commit(b)
          setImportFile(null)
        }}
      />

      <AlertDialog open={blocker.state === 'blocked'}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>Your edits to this sprite haven't been saved.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Keep editing</AlertDialogCancel>
            <AlertDialogAction onClick={() => blocker.proceed?.()}>Discard</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

interface ReferenceSettings {
  id: string
  visible: boolean
  opacity: number
  align: 'topleft' | 'centre'
}

const REFERENCE_DEFAULTS: ReferenceSettings = { id: '', visible: true, opacity: 0.35, align: 'centre' }

/** Reference overlay choice, remembered per sprite in this browser. */
function useReferenceSettings(spriteId: string) {
  const key = `klippyface.sprite-reference.${spriteId}`
  const [value, setValue] = useState<ReferenceSettings>(() => {
    try {
      return { ...REFERENCE_DEFAULTS, ...JSON.parse(localStorage.getItem(key) ?? '{}') }
    } catch {
      return REFERENCE_DEFAULTS
    }
  })
  const update = (patch: Partial<ReferenceSettings>) =>
    setValue((v) => {
      const next = { ...v, ...patch }
      try {
        localStorage.setItem(key, JSON.stringify(next))
      } catch {
        // per-browser nicety only
      }
      return next
    })
  return [value, update] as const
}

function ReferenceControls({
  sprites,
  currentId,
  value,
  onChange,
}: {
  sprites: Sprite[]
  currentId: string
  value: ReferenceSettings
  onChange: (patch: Partial<ReferenceSettings>) => void
}) {
  const others = sprites.filter((s) => s.id !== currentId)
  const selected = others.some((s) => s.id === value.id) ? value.id : ''
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase">Reference</span>
        {selected && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={() => onChange({ visible: !value.visible })}
                aria-label={value.visible ? 'Hide reference' : 'Show reference'}
              >
                {value.visible ? <Eye /> : <EyeOff />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{value.visible ? 'Hide' : 'Show'} reference (O)</TooltipContent>
          </Tooltip>
        )}
      </div>
      <Select value={selected || '__none'} onValueChange={(id) => onChange({ id: id === '__none' ? '' : id, visible: true })}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">None</SelectItem>
          {groupByFolder(others).map(([folder, list]) => (
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
      {selected && (
        <>
          <Field label={`Opacity · ${Math.round(value.opacity * 100)}%`}>
            <Slider min={5} max={90} step={5} value={[value.opacity * 100]} onValueChange={([v]) => onChange({ opacity: v / 100 })} />
          </Field>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={value.align}
            onValueChange={(v) => v && onChange({ align: v as ReferenceSettings['align'] })}
          >
            <ToggleGroupItem value="centre" className="flex-1">
              Centred
            </ToggleGroupItem>
            <ToggleGroupItem value="topleft" className="flex-1">
              Top-left
            </ToggleGroupItem>
          </ToggleGroup>
        </>
      )}
      <span className="text-xs text-muted-foreground">Shown faintly under the canvas to trace over. Not saved.</span>
    </div>
  )
}

function MirrorControls({
  axes,
  on,
  placing,
  width,
  height,
  onToggle,
  onPlace,
  onSet,
  onRemove,
}: {
  axes: MirrorAxes
  on: boolean
  placing: Axis | null
  width: number
  height: number
  onToggle: () => void
  onPlace: (a: Axis) => void
  onSet: (a: Axis, pos2: number) => void
  onRemove: (a: Axis) => void
}) {
  const rows: { axis: Axis; label: string; pos2?: number; size: number }[] = [
    { axis: 'x', label: 'Vertical', pos2: axes.x2, size: width },
    { axis: 'y', label: 'Horizontal', pos2: axes.y2, size: height },
  ]
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase">Mirror</span>
        {(axes.x2 !== undefined || axes.y2 !== undefined) && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            {on ? 'On' : 'Off'} <Switch checked={on} onCheckedChange={onToggle} />
          </label>
        )}
      </div>
      {rows.map((r) => (
        <div key={r.axis} className="flex items-center gap-1 text-sm">
          <span className="w-20">{r.label}</span>
          <span className="flex-1 font-mono text-xs text-muted-foreground">
            {r.pos2 === undefined ? '—' : `${r.axis} = ${r.pos2 / 2}`}
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Toggle
                size="sm"
                pressed={placing === r.axis}
                onPressedChange={() => onPlace(r.axis)}
                className="size-7 min-w-7"
                aria-label={`Place ${r.label.toLowerCase()} line`}
              >
                <Crosshair />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent>Click on the canvas to place</TooltipContent>
          </Tooltip>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onSet(r.axis, r.size)}>
            Centre
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            disabled={r.pos2 === undefined}
            onClick={() => onRemove(r.axis)}
            aria-label={`Remove ${r.label.toLowerCase()} line`}
          >
            <X />
          </Button>
        </div>
      ))}
      <span className="text-xs text-muted-foreground">
        Every tool except text draws mirrored across the lines. Use both for 4-way symmetry.
      </span>
    </div>
  )
}

function ResizeControls({ bitmap, onResize }: { bitmap: Bitmap; onResize: (w: number, h: number) => void }) {
  const [w, setW] = useState(bitmap.width)
  const [h, setH] = useState(bitmap.height)
  useEffect(() => {
    setW(bitmap.width)
    setH(bitmap.height)
  }, [bitmap.width, bitmap.height])
  const changed = w !== bitmap.width || h !== bitmap.height
  return (
    <div className="grid gap-2">
      <span className="text-xs font-medium text-muted-foreground uppercase">Canvas size</span>
      <div className="flex items-end gap-2">
        <Field label="W">
          <Input type="number" min={1} max={320} value={w} onChange={(e) => setW(+e.target.value)} />
        </Field>
        <Field label="H">
          <Input type="number" min={1} max={240} value={h} onChange={(e) => setH(+e.target.value)} />
        </Field>
        <Button variant="outline" disabled={!changed || w < 1 || h < 1} onClick={() => onResize(w, h)}>
          Apply
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">Crops or pads from the top-left corner.</span>
    </div>
  )
}

function ImportDialog({
  image,
  width,
  height,
  onClose,
  onApply,
}: {
  image: HTMLImageElement | null
  width: number
  height: number
  onClose: () => void
  onApply: (b: Bitmap) => void
}) {
  const [threshold, setThreshold] = useState(128)
  const [invert, setInvert] = useState(false)
  const result = useMemo(() => {
    if (!image) return null
    const b = bitmapFromImage(image, width, height, threshold)
    return invert ? { ...b, pixels: b.pixels.map((p) => (p ? 0 : 1)) } : b
  }, [image, width, height, threshold, invert])

  return (
    <Dialog open={!!image} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import image</DialogTitle>
          <DialogDescription>
            Scaled to {width}×{height} and converted to 1-bit. Replaces the current drawing (undo restores it).
          </DialogDescription>
        </DialogHeader>
        <div className="grid place-items-center rounded-lg border bg-black p-4">
          <div className="w-full max-w-64">{result && <SpriteThumb bitmap={result} />}</div>
        </div>
        <Field label={`Threshold · ${threshold}`}>
          <Slider min={1} max={254} value={[threshold]} onValueChange={([v]) => setThreshold(v)} />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <Switch checked={invert} onCheckedChange={setInvert} /> Invert
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => result && onApply(result)}>Import</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
