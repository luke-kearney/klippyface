import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Copy, Image, Plus } from 'lucide-react'
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { EmptyState, ErrorState, Field, Loading, Page, PageHeader } from '@/components/common'
import { SpriteThumb } from '@/components/SpriteThumb'
import { keys, useApiMutation, useDuplicateSprite, useSpriteBitmaps, useSprites } from '@/hooks/queries'
import { api, sanitizeId, slugify } from '@/lib/api'

export function SpritesPage() {
  const { data: sprites, isLoading, error } = useSprites()
  const bitmaps = useSpriteBitmaps()
  const duplicate = useDuplicateSprite()

  return (
    <Page>
      <PageHeader
        title="Sprites"
        description="1-bit pixel art you can place on frames."
        actions={<NewSpriteDialog existing={new Set(sprites?.map((s) => s.id))} />}
      />
      {error && <ErrorState error={error} />}
      {isLoading && <Loading />}
      {sprites?.length === 0 && (
        <EmptyState icon={<Image />} title="No sprites yet">
          Draw eyes, mouths, icons — or import a PNG and threshold it to 1-bit.
        </EmptyState>
      )}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {sprites?.map((s) => (
          <Link key={s.id} to={`/sprites/${s.id}`}>
            <Card className="group/card relative gap-0 overflow-hidden p-0 transition-colors hover:border-primary/50">
              <Button
                variant="secondary"
                size="icon"
                className="absolute top-2 right-2 z-10 size-7 opacity-0 transition-opacity group-hover/card:opacity-100 focus-visible:opacity-100"
                aria-label={`Duplicate ${s.label || s.id}`}
                title="Duplicate"
                disabled={duplicate.isPending}
                onClick={(e) => {
                  e.preventDefault()
                  duplicate.mutate(s)
                }}
              >
                <Copy />
              </Button>
              <div className="grid aspect-square place-items-center bg-black p-4">
                <SpriteThumb bitmap={bitmaps.get(s.id)} emptyLabel="Empty" />
              </div>
              <div className="px-3 py-2">
                <div className="truncate text-sm font-medium">{s.label || s.id}</div>
                <div className="text-xs text-muted-foreground">
                  {s.width}×{s.height}
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Page>
  )
}

const SIZES = ['8', '16', '32', '64']

function NewSpriteDialog({ existing }: { existing: globalThis.Set<string> }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
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
            create.mutate({ id: effectiveId, label: label.trim(), width: w, height: h, dataBase64: '' })
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
