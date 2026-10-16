import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Check, Cpu, Plus, X } from 'lucide-react'
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
import { keys, useApiMutation, useBoardPresets, useNodes } from '@/hooks/queries'
import { api } from '@/lib/api'
import { defaultPresetFor } from '@/lib/boards'
import type { Node } from '@/lib/types'

const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/

export function NodesPage() {
  const { data: nodes, isLoading, error } = useNodes()
  const pending = nodes?.filter((n) => n.status === 'pending') ?? []
  const accepted = nodes?.filter((n) => n.status !== 'pending')

  return (
    <Page>
      <PageHeader
        title="Nodes"
        description="ESP32 display nodes. A new board shows up under Pending when it first connects to this server."
        actions={<AddNodeDialog />}
      />
      {error && <ErrorState error={error} />}
      {isLoading && <Loading />}
      {pending.length > 0 && <PendingNodes nodes={pending} />}
      {accepted?.length === 0 && pending.length === 0 && (
        <EmptyState icon={<Cpu />} title="No nodes yet">
          Flash a board, join it to Wi-Fi and point it at this server. It shows up here within a few seconds for you to
          accept.
        </EmptyState>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {accepted?.map((n) => (
          <Link key={n.id} to={`/nodes/${n.id}`}>
            <Card className="gap-3 p-5 transition-colors hover:border-primary/50 hover:bg-accent/30">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-medium">{n.friendlyName || 'Unnamed node'}</div>
                  <code className="text-xs text-muted-foreground">{n.macAddress}</code>
                </div>
                <OnlineBadge online={n.isOnline} />
              </div>
              {n.description && <p className="line-clamp-2 text-sm text-muted-foreground">{n.description}</p>}
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Seen {relativeTime(n.lastSeen)}</span>
                <span className="ml-auto">config v{n.lastConfigVersion}</span>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Page>
  )
}

function PendingNodes({ nodes }: { nodes: Node[] }) {
  const clear = useApiMutation(api.clearPendingNodes, { invalidate: [keys.nodes], success: 'Pending nodes cleared' })

  return (
    <Card className="mb-6 gap-0 border-primary/40 p-0">
      <div className="flex items-center justify-between gap-2 border-b px-5 py-3">
        <div>
          <div className="font-medium">Pending ({nodes.length})</div>
          <p className="text-sm text-muted-foreground">
            New boards that connected to this server. They get no faces until you accept them.
          </p>
        </div>
        <ConfirmDelete
          title="Clear pending nodes?"
          description="Removes every pending node. Boards that are still on reconnect and show up here again."
          action="Clear"
          onConfirm={() => clear.mutateAsync(undefined)}
        >
          <Button variant="ghost" size="sm">
            Clear pending
          </Button>
        </ConfirmDelete>
      </div>
      <ul className="divide-y">
        {nodes.map((n) => (
          <PendingNodeRow key={n.id} node={n} />
        ))}
      </ul>
    </Card>
  )
}

function PendingNodeRow({ node }: { node: Node }) {
  const reject = useApiMutation(() => api.deleteNode(node.id), { invalidate: [keys.nodes], success: 'Node rejected' })

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <code className="text-sm">{node.macAddress}</code>
          <OnlineBadge online={node.isOnline} />
        </div>
        <div className="flex flex-wrap gap-x-3 text-xs text-muted-foreground">
          {node.friendlyName && <span>“{node.friendlyName}”</span>}
          <span>{node.board ? <>board <code>{node.board}</code></> : 'board unknown'}</span>
          {node.firmwareVersion && <span>firmware {node.firmwareVersion}</span>}
          <span>first seen {relativeTime(node.createdAt)}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <ConfirmDelete
          title="Reject this node?"
          description="It's removed from the list. If the board is still on, it reconnects and shows up here again."
          action="Reject"
          onConfirm={() => reject.mutateAsync(undefined)}
        >
          <Button variant="outline" size="sm">
            <X /> Reject
          </Button>
        </ConfirmDelete>
        <AcceptNodeDialog node={node} />
      </div>
    </li>
  )
}

const NO_DISPLAY = 'none'

function AcceptNodeDialog({ node }: { node: Node }) {
  const navigate = useNavigate()
  const { data: presets = [] } = useBoardPresets()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [presetId, setPresetId] = useState(NO_DISPLAY)
  // This board's presets first
  const sorted = [...presets].sort((a, b) => Number(b.board === node.board) - Number(a.board === node.board))

  const accept = useApiMutation(
    () => api.acceptNode(node.id, { friendlyName: name.trim(), presetId: presetId === NO_DISPLAY ? '' : presetId }),
    {
      invalidate: [keys.nodes],
      success: 'Node accepted',
      onSuccess: () => {
        setOpen(false)
        navigate(`/nodes/${node.id}`)
      },
    },
  )

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setName(node.friendlyName)
          setPresetId(defaultPresetFor(presets, node.board)?.id ?? NO_DISPLAY)
        }
        setOpen(o)
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Check /> Accept
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            accept.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>Accept node</DialogTitle>
            <DialogDescription>
              <code>{node.macAddress}</code> gets its config straight away; no reboot needed.
            </DialogDescription>
          </DialogHeader>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Printer face" autoFocus />
          </Field>
          <Field
            label="Display"
            hint={
              node.board
                ? `This node reports board ${node.board}. The display starts on the starter faces; you can edit it later.`
                : 'The display starts on the starter faces; you can edit it later.'
            }
          >
            <Select value={presetId} onValueChange={setPresetId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DISPLAY}>None, I'll add one later</SelectItem>
                {sorted.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                    {p.board === node.board && <span className="text-muted-foreground"> · this board</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={accept.isPending}>
              Accept
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddNodeDialog() {
  const [open, setOpen] = useState(false)
  const [mac, setMac] = useState('')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const normalised = mac.trim().toUpperCase().replace(/-/g, ':')
  const valid = MAC_RE.test(normalised)

  const create = useApiMutation(api.createNode, {
    invalidate: [keys.nodes],
    success: 'Node added',
    onSuccess: () => {
      setOpen(false)
      setMac('')
      setName('')
      setDescription('')
    },
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> Add node
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid) create.mutate({ macAddress: normalised, friendlyName: name.trim(), description: description.trim() })
          }}
        >
          <DialogHeader>
            <DialogTitle>Add node</DialogTitle>
            <DialogDescription>Register an ESP32 by its Wi-Fi MAC address.</DialogDescription>
          </DialogHeader>
          <Field label="MAC address" hint={mac && !valid ? 'Expected AA:BB:CC:DD:EE:FF' : undefined}>
            <Input value={mac} onChange={(e) => setMac(e.target.value)} placeholder="30:C9:22:32:5B:F4" autoFocus />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Printer face" />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </Field>
          <DialogFooter>
            <Button type="submit" disabled={!valid || create.isPending}>
              Add node
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
