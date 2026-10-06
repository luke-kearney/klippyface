import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, Cloud, Film, Pencil, Plus, Repeat, Trash2 } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { ConfirmDelete, EmptyState, ErrorState, Field, InlineDescription, Loading, Page, PageHeader } from '@/components/common'
import { RenameIdDialog } from '@/components/RenameIdDialog'
import { DISPLAY_PROFILES, SetPlayer, profileById } from '@/components/DisplayPreview'
import { keys, useApiMutation, useGroup, useGroups, useSpriteBitmaps } from '@/hooks/queries'
import { api } from '@/lib/api'
import type { Group, Set } from '@/lib/types'

export function GroupDetailPage() {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: group, isLoading, error } = useGroup(groupId)
  const { data: groups } = useGroups()
  const sprites = useSpriteBitmaps()

  const save = useApiMutation(
    (patch: { label?: string; description?: string; profile?: string }) =>
      api.updateGroup(groupId, {
        label: patch.label ?? group!.label,
        description: patch.description ?? group!.description,
        profile: patch.profile ?? group!.profile,
        sortOrder: group!.sortOrder,
      }),
    { invalidate: [keys.groups, keys.group(groupId)] },
  )
  const publish = useApiMutation(() => api.publishGroup(groupId), {
    invalidate: [keys.groups],
    onSuccess: ({ nodes }) =>
      toast.success(nodes ? `Synced to ${nodes} node${nodes === 1 ? '' : 's'}` : 'Synced (no nodes show this group)'),
  })
  const rename = useApiMutation((newId: string) => api.renameGroup(groupId, newId), {
    // Assignments and presets were repointed too.
    invalidate: [keys.groups, keys.nodes, keys.presets],
    onSuccess: (g) => {
      toast.success(`Group ID changed to ${g.id}`)
      navigate(`/groups/${g.id}`, { replace: true })
    },
  })

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
            : api.updateSet(s.id, { label: s.label, description: s.description, loopCount: s.loopCount, frameTime: s.frameTime, sortOrder: i }),
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
        title={<GroupTitle label={group.label} onSave={(label) => save.mutate({ label })} />}
        description={
          <span className="flex items-center gap-1">
            ID <code>{group.id}</code>
            <RenameIdDialog
              title="Change group ID"
              currentId={group.id}
              taken={(groups ?? []).map((g) => g.id)}
              description="Node assignments, triggers and preset swaps that use this group are updated to the new ID."
              warning={
                <>
                  GCODE macros on your printer that use <code>GROUP={group.id}</code> are not updated. Change them
                  by hand, or they'll stop switching to this group.
                </>
              }
              onRename={(id) => rename.mutateAsync(id)}
            >
              <Button variant="ghost" size="icon" className="size-6" aria-label="Change group ID">
                <Pencil className="size-3.5" />
              </Button>
            </RenameIdDialog>
            · {sets.length} set{sets.length === 1 ? '' : 's'}
          </span>
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

      {group.pendingPublish && (
        <div className="-mt-2 mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
          <Cloud className="size-4 shrink-0 text-amber-500" />
          <span className="flex-1">
            Saved changes haven't reached displays yet. They sync automatically about a minute after the last edit.
          </span>
          <Button size="sm" variant="outline" onClick={() => publish.mutate(undefined)} disabled={publish.isPending}>
            Sync now
          </Button>
        </div>
      )}

      <InlineDescription
        value={group.description}
        onSave={(description) => save.mutate({ description })}
        placeholder="Add a description for this group…"
        className="-mt-4 mb-4 max-w-2xl"
      />
      <div className="mb-6 flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Designed for</span>
        <Select
          value={profileById(group.profile).id}
          onValueChange={(v) => save.mutate({ profile: v === DISPLAY_PROFILES[0].id ? '' : v })}
        >
          <SelectTrigger size="sm" className="w-52">
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
        <span className="text-xs text-muted-foreground">Sets the preview size here and in the editor.</span>
      </div>

      {sets.length === 0 && (
        <EmptyState icon={<Film />} title="No sets yet">
          A set is one animation: a sequence of frames. Add one to start drawing.
        </EmptyState>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sets.map((s, i) => (
          <Card key={s.id} className="group/card gap-0 overflow-hidden p-0">
            <Link to={`/groups/${group.id}/sets/${s.id}`} className="block bg-black p-3">
              <SetPlayer
                frames={s.frames}
                frameTime={s.frameTime}
                sprites={sprites}
                profile={profileById(group.profile)}
                    fit
              />
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
                {s.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground" title={s.description}>
                    {s.description}
                  </p>
                )}
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

function GroupTitle({ label: saved, onSave }: { label: string; onSave: (label: string) => void }) {
  const [label, setLabel] = useState(saved)
  useEffect(() => setLabel(saved), [saved])
  const dirty = label.trim() !== saved && label.trim() !== ''
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        if (dirty) onSave(label.trim())
      }}
    >
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={() => dirty && onSave(label.trim())}
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
  const [description, setDescription] = useState('')
  const [loopCount, setLoopCount] = useState(0)

  const create = useApiMutation(
    async () => {
      const set = await api.createSet(groupId, { label: label.trim(), description: description.trim(), loopCount, frameTime: 1000, sortOrder: nextOrder })
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
          setDescription('')
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
          <Field label="Description" hint="Optional.">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
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
