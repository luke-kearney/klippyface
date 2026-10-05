import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Layers, Plus, Sparkles } from 'lucide-react'
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
import { EmptyState, ErrorState, Field, Loading, Page, PageHeader } from '@/components/common'
import { SetPlayer } from '@/components/DisplayPreview'
import { keys, useApiMutation, useGroup, useGroups, useSpriteBitmaps } from '@/hooks/queries'
import { api, sanitizeId, slugify } from '@/lib/api'
import type { Group } from '@/lib/types'

export function GroupsPage() {
  const { data: groups, isLoading, error } = useGroups()
  const sprites = useSpriteBitmaps()

  return (
    <Page>
      <PageHeader
        title="Groups"
        description="A group is a pool of animated sets. Displays show a group, picking among its sets."
        actions={
          <>
            <StarterPackButton />
            <AddGroupDialog nextOrder={groups?.length ?? 0} />
          </>
        }
      />
      {error && <ErrorState error={error} />}
      {isLoading && <Loading />}
      {groups?.length === 0 && (
        <EmptyState icon={<Layers />} title="No groups yet">
          Create a group such as “Idle faces”, then add animated sets to it, or add the starter faces.
        </EmptyState>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups?.map((g) => <GroupCard key={g.id} group={g} sprites={sprites} />)}
      </div>
    </Page>
  )
}

function GroupCard({ group, sprites }: { group: Group; sprites: ReturnType<typeof useSpriteBitmaps> }) {
  const { data } = useGroup(group.id)
  const sets = data?.sets ?? []
  return (
    <Link to={`/groups/${group.id}`}>
      <Card className="gap-0 overflow-hidden p-0 transition-colors hover:border-primary/50">
        <div className="bg-black p-3">
          <SetPlayer frames={sets[0]?.frames} frameTime={sets[0]?.frameTime} sprites={sprites} />
        </div>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="min-w-0">
            <div className="truncate font-medium">{group.label || group.id}</div>
            <code className="text-xs text-muted-foreground">{group.id}</code>
          </div>
          <span className="shrink-0 text-xs text-muted-foreground">
            {data ? `${sets.length} set${sets.length === 1 ? '' : 's'}` : ''}
          </span>
        </div>
      </Card>
    </Link>
  )
}

function StarterPackButton() {
  const add = useApiMutation(api.importStarterPack, {
    invalidate: [keys.groups, keys.sprites],
    onSuccess: (r) =>
      r.groupsAdded || r.spritesAdded
        ? toast.success(`Added ${r.groupsAdded} groups and ${r.spritesAdded} sprites`)
        : toast.info('Starter faces are already in your library'),
  })
  return (
    <Button variant="outline" onClick={() => add.mutate(undefined)} disabled={add.isPending}>
      <Sparkles /> Starter faces
    </Button>
  )
}

function AddGroupDialog({ nextOrder }: { nextOrder: number }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [id, setId] = useState('')
  const [idTouched, setIdTouched] = useState(false)
  const effectiveId = idTouched ? id : slugify(label)

  const create = useApiMutation(api.createGroup, {
    invalidate: [keys.groups],
    success: 'Group created',
    onSuccess: (g) => {
      setOpen(false)
      navigate(`/groups/${g.id}`)
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
          <Plus /> New group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate({ id: effectiveId, label: label.trim(), sortOrder: nextOrder })
          }}
        >
          <DialogHeader>
            <DialogTitle>New group</DialogTitle>
            <DialogDescription>The ID is what node assignments and GCODE macros refer to.</DialogDescription>
          </DialogHeader>
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Idle faces" autoFocus />
          </Field>
          <Field label="ID">
            <Input
              value={effectiveId}
              onChange={(e) => {
                setIdTouched(true)
                setId(sanitizeId(e.target.value))
              }}
              placeholder="idle_faces"
              className="font-mono"
            />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!effectiveId || !label.trim() || create.isPending}>
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
