import { useMemo, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronRight, Copy, Folder, FolderInput, Image, Plus, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EmptyState, ErrorState, Field, Loading, Page, PageHeader } from '@/components/common'
import { SpriteThumb } from '@/components/SpriteThumb'
import { keys, useApiMutation, useDuplicateSprite, useSpriteBitmaps, useSprites } from '@/hooks/queries'
import { api, sanitizeId, slugify } from '@/lib/api'
import { groupByFolder, type Bitmap } from '@/lib/sprite'
import type { Sprite } from '@/lib/types'
import { cn } from '@/lib/utils'

const DRAG_TYPE = 'application/x-klippyface-sprite'
const COLLAPSED_KEY = 'klippyface.sprites.collapsed'

function loadCollapsed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLAPSED_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function SpritesPage() {
  const { data: sprites, isLoading, error } = useSprites()
  const bitmaps = useSpriteBitmaps()
  const duplicate = useDuplicateSprite()
  const [query, setQuery] = useState('')
  const [collapsed, setCollapsed] = useState(() => new Set(loadCollapsed()))
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const folders = useMemo(() => [...new Set((sprites ?? []).map((s) => s.folder).filter(Boolean))].sort(), [sprites])
  const sections = useMemo(() => {
    const q = query.trim().toLowerCase()
    const match = (s: Sprite) =>
      !q || [s.label, s.id, s.folder, s.description].some((f) => f.toLowerCase().includes(q))
    return groupByFolder((sprites ?? []).filter(match))
  }, [sprites, query])

  const move = useApiMutation(
    ({ sprite, folder }: { sprite: Sprite; folder: string }) =>
      api.updateSprite(sprite.id, {
        label: sprite.label,
        folder,
        description: sprite.description,
        width: sprite.width,
        height: sprite.height,
        dataBase64: sprite.dataBase64,
      }),
    { invalidate: [keys.sprites] },
  )

  function toggle(folder: string) {
    setCollapsed((c) => {
      const next = new Set(c)
      if (!next.delete(folder)) next.add(folder)
      try {
        localStorage.setItem(COLLAPSED_KEY, JSON.stringify([...next]))
      } catch {
        // per-browser nicety only
      }
      return next
    })
  }

  const dropProps = (folder: string) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      setDropTarget(folder)
    },
    onDragLeave: (e: DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropTarget(null)
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setDropTarget(null)
      const sprite = sprites?.find((s) => s.id === e.dataTransfer.getData(DRAG_TYPE))
      if (sprite && sprite.folder !== folder) move.mutate({ sprite, folder })
    },
  })

  // With no folders at all, skip the section chrome and show one flat grid.
  const flat = folders.length === 0

  return (
    <Page>
      <PageHeader
        title="Sprites"
        description="1-bit pixel art you can place on frames. Drag sprites between folders to organise them."
        actions={<NewSpriteDialog existing={new Set(sprites?.map((s) => s.id))} folders={folders} />}
      />
      {error && <ErrorState error={error} />}
      {isLoading && <Loading />}
      {sprites?.length === 0 && (
        <EmptyState icon={<Image />} title="No sprites yet">
          Draw eyes, mouths, icons — or import a PNG and threshold it to 1-bit.
        </EmptyState>
      )}
      {!!sprites?.length && (
        <div className="relative mb-6 max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search label, ID, folder or description"
            className="pl-8"
            aria-label="Search sprites"
          />
        </div>
      )}
      {!!sprites?.length && sections.length === 0 && (
        <p className="text-sm text-muted-foreground">No sprites match “{query.trim()}”.</p>
      )}
      <div className="grid gap-6">
        {sections.map(([folder, list]) => {
          const open = flat || !!query.trim() || !collapsed.has(folder)
          return (
            <section
              key={folder}
              {...dropProps(folder)}
              className={cn(
                '-m-2 rounded-xl p-2 transition-colors',
                dropTarget === folder && 'bg-primary/5 ring-2 ring-primary/40',
              )}
            >
              {!flat && (
                <button
                  type="button"
                  onClick={() => toggle(folder)}
                  className="mb-3 flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                  aria-expanded={open}
                >
                  <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
                  <Folder className="size-4" />
                  <span className={cn(!folder && 'italic')}>{folder || 'Unfiled'}</span>
                  <span className="text-xs font-normal">{list.length}</span>
                </button>
              )}
              {open && (
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {list.map((s) => (
                    <SpriteCard
                      key={s.id}
                      sprite={s}
                      bitmap={bitmaps.get(s.id)}
                      folders={folders}
                      duplicating={duplicate.isPending}
                      onDuplicate={() => duplicate.mutate(s)}
                      onMove={(f) => move.mutateAsync({ sprite: s, folder: f })}
                    />
                  ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
    </Page>
  )
}

function SpriteCard({
  sprite: s,
  bitmap,
  folders,
  duplicating,
  onDuplicate,
  onMove,
}: {
  sprite: Sprite
  bitmap: Bitmap | undefined
  folders: string[]
  duplicating: boolean
  onDuplicate: () => void
  onMove: (folder: string) => Promise<unknown>
}) {
  const hoverButton = 'size-7 opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100'
  // The buttons sit beside the <Link>, not inside it, so their clicks (and the
  // dialog's) never trigger navigation.
  return (
    <div className="group/card relative">
      <Link
        to={`/sprites/${s.id}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(DRAG_TYPE, s.id)
          e.dataTransfer.effectAllowed = 'move'
        }}
      >
        <Card className="h-full gap-0 overflow-hidden p-0 transition-colors group-hover/card:border-primary/50">
          <div className="grid aspect-square place-items-center bg-black p-4">
            <SpriteThumb bitmap={bitmap} emptyLabel="Empty" />
          </div>
          <div className="px-3 py-2" title={s.description || undefined}>
            <div className="truncate text-sm font-medium">{s.label || s.id}</div>
            <div className="text-xs text-muted-foreground">
              {s.width}×{s.height}
            </div>
            {s.description && <div className="mt-0.5 truncate text-xs text-muted-foreground">{s.description}</div>}
          </div>
        </Card>
      </Link>
      <div className="absolute top-2 right-2 flex gap-1">
        <MoveToFolderDialog sprite={s} folders={folders} onMove={onMove}>
          <Button
            variant="secondary"
            size="icon"
            className={hoverButton}
            aria-label={`Move ${s.label || s.id} to folder`}
            title="Move to folder"
          >
            <FolderInput />
          </Button>
        </MoveToFolderDialog>
        <Button
          variant="secondary"
          size="icon"
          className={hoverButton}
          aria-label={`Duplicate ${s.label || s.id}`}
          title="Duplicate"
          disabled={duplicating}
          onClick={onDuplicate}
        >
          <Copy />
        </Button>
      </div>
    </div>
  )
}

function MoveToFolderDialog({
  sprite,
  folders,
  onMove,
  children,
}: {
  sprite: Sprite
  folders: string[]
  onMove: (folder: string) => Promise<unknown>
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [folder, setFolder] = useState(sprite.folder)
  const [busy, setBusy] = useState(false)
  const submit = async (f: string) => {
    setBusy(true)
    try {
      await onMove(f.trim())
      setOpen(false)
    } catch {
      // toasted by the mutation
    } finally {
      setBusy(false)
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setFolder(sprite.folder)
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit(folder)
          }}
        >
          <DialogHeader>
            <DialogTitle>Move “{sprite.label || sprite.id}”</DialogTitle>
            <DialogDescription>Pick a folder or type a new name. Leave empty for Unfiled.</DialogDescription>
          </DialogHeader>
          <Field label="Folder">
            <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Unfiled" autoFocus />
          </Field>
          {folders.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {['', ...folders].map((f) => (
                <Button
                  key={f || '(unfiled)'}
                  type="button"
                  size="sm"
                  variant={f === folder.trim() ? 'default' : 'outline'}
                  disabled={busy}
                  onClick={() => submit(f)}
                >
                  <Folder /> {f || 'Unfiled'}
                </Button>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || folder.trim() === sprite.folder}>
              Move
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const SIZES = ['8', '16', '32', '64']

function NewSpriteDialog({ existing, folders }: { existing: globalThis.Set<string>; folders: string[] }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [folder, setFolder] = useState('')
  const [description, setDescription] = useState('')
  const [id, setId] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const [size, setSize] = useState('32')
  const [w, setW] = useState(32)
  const [h, setH] = useState(32)
  const effectiveId = idTouched ? id : slugify(label)
  const taken = existing.has(effectiveId)

  const create = useApiMutation(api.createSprite, {
    invalidate: [keys.sprites],
    onSuccess: (s) => {
      setOpen(false)
      navigate(`/sprites/${s.id}`)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setLabel('')
          setDescription('')
          setId('')
          setIdTouched(false)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <Plus /> New sprite
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate({
              id: effectiveId,
              label: label.trim(),
              folder: folder.trim(),
              description: description.trim(),
              width: w,
              height: h,
              dataBase64: '',
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>New sprite</DialogTitle>
            <DialogDescription>You can resize it later in the editor.</DialogDescription>
          </DialogHeader>
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Happy eyes" autoFocus />
          </Field>
          <Field label="ID" hint={taken ? 'A sprite with this ID already exists.' : 'Referenced by frame elements.'}>
            <Input
              value={effectiveId}
              onChange={(e) => {
                setIdTouched(true)
                setId(sanitizeId(e.target.value))
              }}
              className="font-mono"
            />
          </Field>
          <Field label="Folder" hint="Optional. Pick an existing one or type a new name.">
            <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Unfiled" list="new-sprite-folders" />
            <datalist id="new-sprite-folders">
              {folders.map((f) => (
                <option key={f} value={f} />
              ))}
            </datalist>
          </Field>
          <Field label="Description" hint="Optional.">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label="Size">
            <ToggleGroup
              type="single"
              variant="outline"
              value={size}
              onValueChange={(v) => {
                if (!v) return
                setSize(v)
                if (v !== 'custom') {
                  setW(+v)
                  setH(+v)
                }
              }}
            >
              {SIZES.map((s) => (
                <ToggleGroupItem key={s} value={s} className="px-3">
                  {s}²
                </ToggleGroupItem>
              ))}
              <ToggleGroupItem value="custom" className="px-3">
                Custom
              </ToggleGroupItem>
            </ToggleGroup>
          </Field>
          {size === 'custom' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Width">
                <Input type="number" min={1} max={320} value={w} onChange={(e) => setW(+e.target.value)} />
              </Field>
              <Field label="Height">
                <Input type="number" min={1} max={240} value={h} onChange={(e) => setH(+e.target.value)} />
              </Field>
            </div>
          )}
          <DialogFooter>
            <Button type="submit" disabled={!effectiveId || !label.trim() || taken || w < 1 || h < 1 || create.isPending}>
              Create &amp; draw
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
