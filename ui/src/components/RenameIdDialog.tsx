import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
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
import { Field } from '@/components/common'
import { sanitizeId } from '@/lib/api'

/** Asks for a new id; `taken` holds ids already in use (the current one is allowed). */
export function RenameIdDialog({
  title,
  currentId,
  taken,
  description,
  warning,
  onRename,
  children,
}: {
  title: string
  currentId: string
  taken: Iterable<string>
  description: ReactNode
  warning?: ReactNode
  onRename: (newId: string) => Promise<unknown>
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [id, setId] = useState(currentId)
  const [busy, setBusy] = useState(false)
  const clean = id.replace(/^_+|_+$/g, '')
  const clash = clean !== currentId && new Set(taken).has(clean)
  const unchanged = clean === currentId

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (o) setId(currentId)
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            try {
              await onRename(clean)
              setOpen(false)
            } catch {
              // the mutation already toasted; keep the dialog open to fix the id
            } finally {
              setBusy(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>
          <Field label="ID" hint={clash ? 'That ID is already taken.' : 'Lowercase letters, digits and underscores.'}>
            <Input
              value={id}
              onChange={(e) => setId(sanitizeId(e.target.value))}
              className="font-mono"
              aria-invalid={clash}
              autoFocus
            />
          </Field>
          {warning && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">{warning}</div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!clean || unchanged || clash || busy}>
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
