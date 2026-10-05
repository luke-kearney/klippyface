import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useBlocker } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronRight,
  Contrast,
  Eraser,
  FlipHorizontal2,
  FlipVertical2,
  Grid3x3,
  ImageUp,
  PaintBucket,
  Pencil,
  Redo2,
  Save,
  Slash,
  Square,
  SquareSplitHorizontal,
  Trash2,
  Type,
  Undo2,
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
import { Separator } from '@/components/ui/separator'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Toggle } from '@/components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDelete, ErrorState, Field, Loading } from '@/components/common'
import { FrameCanvas } from '@/components/DisplayPreview'
import { PixelEditor, type Tool } from '@/components/PixelEditor'
import { SpriteThumb } from '@/components/SpriteThumb'
import { keys, useApiMutation, useSprites } from '@/hooks/queries'
import { api } from '@/lib/api'
import { bitmapFromImage, decodeSprite, encodeSprite, resizeBitmap, type Bitmap } from '@/lib/sprite'
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
  return <SpriteEditor key={sprite.id} sprite={sprite} />
}

function SpriteEditor({ sprite }: { sprite: Sprite }) {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const initial = useMemo(() => decodeSprite(sprite.dataBase64, sprite.width, sprite.height), [sprite])
  const [history, setHistory] = useState<{ stack: Bitmap[]; i: number }>({ stack: [initial], i: 0 })
  const bitmap = history.stack[history.i]
  const [savedB64, setSavedB64] = useState(() => encodeSprite(initial))
  const [label, setLabel] = useState(sprite.label)
  const [tool, setTool] = useState<Tool>('pencil')
  const [brushSize, setBrushSize] = useState(1)
  const [textScale, setTextScale] = useState(1)
  const [mirror, setMirror] = useState(false)
  const [grid, setGrid] = useState(true)
  const [importFile, setImportFile] = useState<HTMLImageElement | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const dirty =
    label !== sprite.label ||
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
      await api.updateSprite(sprite.id, { label: label.trim() || sprite.id, width: bitmap.width, height: bitmap.height, dataBase64 })
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

  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && currentLocation.pathname !== nextLocation.pathname)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
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
        if (k === 'm') setMirror((m) => !m)
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
          <code className="text-xs text-muted-foreground">{sprite.id}</code>
        </div>
        <div className="ml-auto flex items-center gap-1">
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
              <Toggle pressed={mirror} onPressedChange={setMirror} className="size-9" aria-label="Mirror">
                <SquareSplitHorizontal />
              </Toggle>
            </TooltipTrigger>
            <TooltipContent side="right">Mirror drawing left↔right (M)</TooltipContent>
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
          <PixelEditor bitmap={bitmap} tool={tool} brushSize={brushSize} textScale={textScale} mirror={mirror} showGrid={grid} onCommit={commit} />
        </main>

        {/* Side panel */}
        <aside className="hidden w-72 shrink-0 flex-col gap-5 overflow-y-auto border-l p-4 md:flex">
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
