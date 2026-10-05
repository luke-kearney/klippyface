import { useState } from 'react'
import { Link } from 'react-router'
import { Cpu, Plus } from 'lucide-react'
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
import { EmptyState, ErrorState, Field, Loading, Page, PageHeader, OnlineBadge, relativeTime } from '@/components/common'
import { keys, useApiMutation, useNodes } from '@/hooks/queries'
import { api } from '@/lib/api'

const MAC_RE = /^([0-9A-F]{2}:){5}[0-9A-F]{2}$/

export function NodesPage() {
  const { data: nodes, isLoading, error } = useNodes()

  return (
    <Page>
      <PageHeader
        title="Nodes"
        description="ESP32 display nodes. A node appears online once it connects to this server."
        actions={<AddNodeDialog />}
      />
      {error && <ErrorState error={error} />}
      {isLoading && <Loading />}
      {nodes?.length === 0 && (
        <EmptyState icon={<Cpu />} title="No nodes yet">
          Flash a board, join it to Wi-Fi, then add it here by its MAC address (printed on the serial console and the
          setup portal).
        </EmptyState>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {nodes?.map((n) => (
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
