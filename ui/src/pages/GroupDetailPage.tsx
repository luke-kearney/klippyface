import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, Film, Plus, Repeat, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
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
import { ConfirmDelete, EmptyState, ErrorState, Field, Loading, Page, PageHeader } from '@/components/common'
import { SetPlayer } from '@/components/DisplayPreview'
import { keys, useApiMutation, useGroup, useSpriteBitmaps } from '@/hooks/queries'
import { api } from '@/lib/api'
import type { Group, Set } from '@/lib/types'

export function GroupDetailPage() {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: group, isLoading, error } = useGroup(groupId)
  const sprites = useSpriteBitmaps()

  const remove = useApiMutation(() => api.deleteGroup(groupId), {
    invalidate: [keys.groups],
    success: 'Group deleted',
    onSuccess: () => navigate('/groups'),
  })

  async function move(sets: Set[], index: number, dir: -1 | 1) {
    const next = [...sets]
    const [s] = next.splice(index, 1)
    next.splice(index + dir, 0, s)
    qc.setQueryData<Group>(keys.group(groupId), (g) => g && { ...g, sets: next })
    try {
      await Promise.all(
        next.map((s, i) =>
          s.sortOrder === i
            ? null
            : api.updateSet(s.id, { label: s.label, loopCount: s.loopCount, frameTime: s.frameTime, sortOrder: i }),
        ),
      )
    } catch (e) {
      toast.error((e as Error).message)
    }
    qc.invalidateQueries({ queryKey: keys.group(groupId) })
  }

  if (isLoading) return <Loading />
  if (error || !group)
    return (
      <Page>
        <ErrorState error={error ?? new Error('Group not found')} />
      </Page>
    )

  const sets = group.sets ?? []

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Groups', to: '/groups' }]}
        title={<GroupTitle group={group} />}
        description={
          <>
            ID <code>{group.id}</code> · {sets.length} set{sets.length === 1 ? '' : 's'}
          </>
        }
        actions={
          <>
            <ConfirmDelete
              title="Delete group?"
              description="All sets and frames in this group are deleted. Assignments using it will show nothing."
              onConfirm={() => remove.mutateAsync(undefined)}
            >
              <Button variant="outline" size="sm">
                <Trash2 /> Delete
              </Button>
            </ConfirmDelete>
            <AddSetDialog groupId={group.id} nextOrder={sets.length} />
          </>
        }
      />

      {sets.length === 0 && (
        <EmptyState icon={<Film />} title="No sets yet">
          A set is one animation: a sequence of frames. Add one to start drawing.
        </EmptyState>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((s, i) => (
          <Card key={s.id} className="group/card gap-0 overflow-hidden p-0">
            <Link to={`/groups/${group.id}/sets/${s.id}`} className="block bg-black p-3">
              <SetPlayer frames={s.frames} frameTime={s.frameTime} sprites={sprites} />
            </Link>
            <div className="flex items-center gap-2 px-4 py-3">
              <Link to={`/groups/${group.id}/sets/${s.id}`} className="min-w-0 flex-1">
                <div className="truncate font-medium hover:underline">{s.label || 'Untitled set'}</div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>
                    {s.frames?.length ?? 0} frame{s.frames?.length === 1 ? '' : 's'}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <Repeat className="size-3" />
                    {s.loopCount === 0 ? '∞' : `×${s.loopCount}`}
                  </span>
                </div>
              </Link>
              <div className="flex opacity-60 transition-opacity group-hover/card:opacity-100">
                <Button variant="ghost" size="icon" disabled={i === 0} onClick={() => move(sets, i, -1)} aria-label="Move left">
                  <ArrowLeft />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={i === sets.length - 1}
                  onClick={() => move(sets, i, 1)}
                  aria-label="Move right"
                >
                  <ArrowRight />
                </Button>
                <DeleteSetButton groupId={group.id} set={s} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </Page>
  )
}

function GroupTitle({ group }: { group: Group }) {
  const [label, setLabel] = useState(group.label)
  useEffect(() => setLabel(group.label), [group.label])
  const save = useApiMutation(() => api.updateGroup(group.id, { label: label.trim(), sortOrder: group.sortOrder }), {
    invalidate: [keys.groups, keys.group(group.id)],
  })
  const dirty = label.trim() !== group.label && label.trim() !== ''
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty) save.mutate(undefined)
      }}
    >
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => dirty && save.mutate(undefined)}
        className="-mx-1 min-w-0 rounded-md bg-transparent px-1 outline-none hover:bg-accent/50 focus:bg-accent/50"
        aria-label="Group label"
      />
      {dirty && (
        <Button type="submit" size="icon" variant="ghost" aria-label="Save label">
          <Check />
        </Button>
      )}
    </form>
  )
}

function DeleteSetButton({ groupId, set }: { groupId: string; set: Set }) {
  const remove = useApiMutation(() => api.deleteSet(set.id), {
    invalidate: [keys.group(groupId)],
    success: 'Set deleted',
  })
  return (
    <ConfirmDelete
      title="Delete set?"
      description={`“${set.label}” and all of its frames will be deleted.`}
      onConfirm={() => remove.mutateAsync(undefined)}
    >
      <Button variant="ghost" size="icon" aria-label="Delete set">
        <Trash2 />
      </Button>
    </ConfirmDelete>
  )
}

function AddSetDialog({ groupId, nextOrder }: { groupId: string; nextOrder: number }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [loopCount, setLoopCount] = useState(0)

  const create = useApiMutation(
    async () => {
      const set = await api.createSet(groupId, { label: label.trim(), loopCount, frameTime: 1000, sortOrder: nextOrder })
      await api.createFrame(set.id, { durationMs: 1000, bgColor: '#000000', sortOrder: 0 })
      return set
    },
    {
      invalidate: [keys.group(groupId)],
      onSuccess: (s) => {
        setOpen(false)
        navigate(`/groups/${groupId}/sets/${s.id}`)
      },
    },
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) {
          setLabel('')
          setLoopCount(0)
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New set
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            create.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>New set</DialogTitle>
            <DialogDescription>Starts with one blank frame and opens the editor.</DialogDescription>
          </DialogHeader>
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Happy blink" autoFocus />
          </Field>
          <Field label="Loop count" hint="0 loops forever.">
            <Input type="number" min={0} max={999} value={loopCount} onChange={(e) => setLoopCount(+e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!label.trim() || create.isPending}>
              Create &amp; edit
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
