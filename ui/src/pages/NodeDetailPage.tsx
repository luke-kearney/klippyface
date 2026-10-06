import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { useQuery } from '@tanstack/react-query'
import { Monitor, Pencil, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  ConfirmDelete,
  EmptyState,
  ErrorState,
  Field,
  Loading,
  Page,
  PageHeader,
  OnlineBadge,
  relativeTime,
} from '@/components/common'
import { DisplayDialog, busSummary } from '@/components/DisplayDialog'
import { SetPlayer } from '@/components/DisplayPreview'
import { keys, useApiMutation, useGroups, useNode, useSpriteBitmaps } from '@/hooks/queries'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'
import type { Assignment, Node, NodeDisplay } from '@/lib/types'

export function NodeDetailPage() {
  const { nodeId = '' } = useParams()
  const navigate = useNavigate()
  const { data: node, isLoading, error } = useNode(nodeId)

  const remove = useApiMutation(() => api.deleteNode(nodeId), {
    invalidate: [keys.nodes],
    success: 'Node deleted',
    onSuccess: () => navigate('/nodes'),
  })

  if (isLoading) return <Loading />
  if (error || !node)
    return (
      <Page>
        <ErrorState error={error ?? new Error('Node not found')} />
      </Page>
    )

  return (
    <Page>
      <PageHeader
        crumbs={[{ label: 'Nodes', to: '/nodes' }]}
        title={
          <span className="flex items-center gap-3">
            {node.friendlyName || 'Unnamed node'}
            <OnlineBadge online={node.isOnline} />
          </span>
        }
        description={
          <>
            <code>{node.macAddress}</code> · seen {relativeTime(node.lastSeen)} · config v{node.lastConfigVersion}
            {node.board && (
              <>
                {' '}· board <code>{node.board}</code>
              </>
            )}
            {node.firmwareVersion && <> · fw {node.firmwareVersion}</>}
          </>
        }
        actions={
          <ConfirmDelete
            title="Delete node?"
            description="Its displays and assignments are removed too. The device will be rejected until re-added."
            onConfirm={() => remove.mutateAsync(undefined)}
          >
            <Button variant="outline" size="sm">
              <Trash2 /> Delete
            </Button>
          </ConfirmDelete>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        <NodeDetailsCard node={node} />
        <div className="grid gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Displays</h2>
            <DisplayDialog nodeId={node.id} board={node.board} sortOrder={node.displays?.length ?? 0}>
              <Button size="sm">
                <Plus /> Add display
              </Button>
            </DisplayDialog>
          </div>
          {node.displays?.length === 0 && (
            <EmptyState icon={<Monitor />} title="No displays">
              Add the panels wired to this node, then choose what each one shows.
            </EmptyState>
          )}
          {node.displays?.map((d) => (
            <DisplayCard
              key={d.id}
              node={node}
              display={d}
              assignment={node.assignments?.find((a) => a.displayId === d.id)}
            />
          ))}
        </div>
      </div>
    </Page>
  )
}

function NodeDetailsCard({ node }: { node: Node }) {
  const [name, setName] = useState(node.friendlyName)
  const [description, setDescription] = useState(node.description)
  useEffect(() => {
    setName(node.friendlyName)
    setDescription(node.description)
  }, [node.friendlyName, node.description])
  const dirty = name !== node.friendlyName || description !== node.description

  const save = useApiMutation(() => api.updateNode(node.id, { friendlyName: name.trim(), description }), {
    invalidate: [keys.nodes],
    success: 'Saved',
  })

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(undefined)
          }}
        >
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Description">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </Field>
          <Button type="submit" variant={dirty ? "default" : "secondary"} disabled={!dirty || save.isPending} className="justify-self-start">
            <Save /> {dirty ? 'Save' : 'Saved'}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

/** Printer states the server works out (klippyface.state), in the order a print goes through them. */
const TRIGGERS: { key: string; label: string; dot: string }[] = [
  { key: 'state:idle', label: 'Idle', dot: 'bg-state-idle' },
  { key: 'state:busy', label: 'Busy (homing, macros)', dot: 'bg-state-busy' },
  { key: 'state:heating', label: 'Heating up', dot: 'bg-state-heating' },
  { key: 'state:printing', label: 'Printing', dot: 'bg-state-printing' },
  { key: 'state:paused', label: 'Paused', dot: 'bg-state-paused' },
  { key: 'state:complete', label: 'Complete', dot: 'bg-state-complete' },
  { key: 'state:cancelled', label: 'Cancelled', dot: 'bg-state-cancelled' },
  { key: 'state:error', label: 'Error', dot: 'bg-state-error' },
]
const NONE = '__none__'

function parseTriggers(json: string | undefined): Record<string, string | null> {
  try {
    const v = JSON.parse(json || '{}')
    return v && typeof v === 'object' ? v : {}
  } catch {
    return {}
  }
}

function DisplayCard({ node, display, assignment }: { node: Node; display: NodeDisplay; assignment?: Assignment }) {
  const { data: groups } = useGroups()
  const sprites = useSpriteBitmaps()
  const [defaultGroup, setDefaultGroup] = useState(assignment?.defaultGroup ?? '')
  const [triggers, setTriggers] = useState(() => parseTriggers(assignment?.triggersJson))
  const [previewGroup, setPreviewGroup] = useState<string | null>(null)

  useEffect(() => {
    setDefaultGroup(assignment?.defaultGroup ?? '')
    setTriggers(parseTriggers(assignment?.triggersJson))
  }, [assignment?.defaultGroup, assignment?.triggersJson])

  const dirty =
    defaultGroup !== (assignment?.defaultGroup ?? '') ||
    JSON.stringify(triggers) !== JSON.stringify(parseTriggers(assignment?.triggersJson))

  const shownGroup = previewGroup ?? defaultGroup
  const { data: group } = useQuery({
    queryKey: keys.group(shownGroup),
    queryFn: () => api.getGroup(shownGroup),
    enabled: !!shownGroup,
  })

  const save = useApiMutation(
    () =>
      api.upsertAssignment(node.id, display.id, {
        defaultGroup,
        // Keep any trigger keys this UI doesn't edit (e.g. macro:*), drop cleared ones.
        triggersJson: JSON.stringify(Object.fromEntries(Object.entries(triggers).filter(([, v]) => v !== ''))),
        activePreset: assignment?.activePreset ?? null,
      }),
    { invalidate: [keys.node(node.id)], success: 'Assignment saved — node will refresh' },
  )
  const starterFaces = useApiMutation(() => api.useStarterFaces(node.id, display.id), {
    invalidate: [keys.node(node.id), keys.groups],
    success: 'Starter faces assigned — node will refresh',
  })
  const remove = useApiMutation(() => api.deleteDisplay(node.id, display.id), {
    invalidate: [keys.node(node.id), keys.nodes],
    success: 'Display removed',
  })

  const groupSelect = (value: string, onChange: (v: string) => void, placeholder: string) => (
    <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
      <SelectTrigger className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>
          <span className="text-muted-foreground">{placeholder}</span>
        </SelectItem>
        {groups?.map((g) => (
          <SelectItem key={g.id} value={g.id}>
            {g.label || g.id}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Monitor className="size-4" />
            {display.label || 'Display'}
          </CardTitle>
          <CardDescription className="mt-1">
            {display.driverType.toUpperCase()} · {display.width}×{display.height} · {busSummary(display)}
            {display.rotation ? ` · rot ${display.rotation * 90}°` : ''}
          </CardDescription>
        </div>
        <div className="flex gap-1">
          <ConfirmDelete
            title="Use starter faces?"
            description={`Maps each printer state on "${display.label}" to the starter faces sized for ${display.width}×${display.height}, adding them to your library if needed. This replaces its current default and triggers.`}
            action="Use starter faces"
            onConfirm={() => starterFaces.mutateAsync(undefined)}
          >
            <Button variant="ghost" size="icon" aria-label="Use starter faces" title="Use starter faces for this display">
              <Sparkles />
            </Button>
          </ConfirmDelete>
          <DisplayDialog nodeId={node.id} board={node.board} display={display} sortOrder={display.sortOrder}>
            <Button variant="ghost" size="icon" aria-label="Edit display">
              <Pencil />
            </Button>
          </DisplayDialog>
          <ConfirmDelete
            title="Remove display?"
            description={`"${display.label}" and its assignment will be removed.`}
            onConfirm={() => remove.mutateAsync(undefined)}
          >
            <Button variant="ghost" size="icon" aria-label="Remove display">
              <Trash2 />
            </Button>
          </ConfirmDelete>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-[1fr_260px]">
        <div className="grid gap-4">
          <Field label="Default animation" hint="Shown at start-up, and for any printer state below without a group of its own.">
            {groupSelect(defaultGroup, setDefaultGroup, 'None')}
          </Field>
          <div className="grid gap-2">
            <span className="text-sm font-medium">Printer state triggers</span>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {TRIGGERS.map((t) => (
                <div
                  key={t.key}
                  className="grid grid-cols-[84px_1fr] items-center gap-2"
                  onMouseEnter={() => triggers[t.key] && setPreviewGroup(triggers[t.key])}
                  onMouseLeave={() => setPreviewGroup(null)}
                >
                  <span className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className={cn('size-2 shrink-0 rounded-full', t.dot)} />
                    {t.label}
                  </span>
                  {groupSelect(triggers[t.key] ?? '', (v) => setTriggers((p) => ({ ...p, [t.key]: v })), 'Use default')}
                </div>
              ))}
            </div>
          </div>
          <Button
            onClick={() => save.mutate(undefined)}
            variant={dirty ? 'default' : 'secondary'}
            disabled={!dirty || save.isPending}
            className="justify-self-start"
          >
            <Save /> {dirty ? 'Save assignment' : 'Saved'}
          </Button>
        </div>
        <div className="grid content-start gap-2">
          <span className="text-xs text-muted-foreground">
            Preview{group ? ` · ${group.label || group.id}` : ''}
            {previewGroup ? ' (hovered trigger)' : ''}
          </span>
          <div className="relative rounded-lg border bg-black p-2">
            {!shownGroup && (
              <span className="absolute inset-0 grid place-items-center text-xs text-muted-foreground">
                Pick an animation to preview
              </span>
            )}
            <SetPlayer
              autoPlay
              frames={group?.sets?.[0]?.frames}
              frameTime={group?.sets?.[0]?.frameTime}
              sprites={sprites}
              profile={{ width: display.width, height: display.height, driverType: display.driverType }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
