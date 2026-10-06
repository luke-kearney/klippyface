import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { ChevronRight, Loader2 } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { cn } from '@/lib/utils'

export function StatusDot({ online, className }: { online: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)}>
      {online && <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />}
      <span className={cn('relative inline-flex size-2 rounded-full', online ? 'bg-success' : 'bg-muted-foreground/40')} />
    </span>
  )
}

export interface Crumb {
  label: string
  to?: string
}

export function PageHeader({
  title,
  description,
  crumbs,
  actions,
  className,
}: {
  title: ReactNode
  description?: ReactNode
  crumbs?: Crumb[]
  actions?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 pb-6', className)}>
      <div className="min-w-0">
        {crumbs && (
          <div className="mb-1 flex items-center gap-1 text-sm text-muted-foreground">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1">
                {c.to ? (
                  <Link to={c.to} className="hover:text-foreground">
                    {c.label}
                  </Link>
                ) : (
                  c.label
                )}
                <ChevronRight className="size-3.5" />
              </span>
            ))}
          </div>
        )}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 py-6 md:px-8 md:py-8', className)}>{children}</div>
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center">
      <div className="mb-3 text-muted-foreground [&_svg]:size-10">{icon}</div>
      <h3 className="font-medium">{title}</h3>
      {children && <div className="mt-1 max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  )
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> {label}
    </div>
  )
}

export function ErrorState({ error }: { error: Error }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {error.message}
    </div>
  )
}

/** Wraps a trigger element; asks before running a destructive action. */
export function ConfirmDelete({
  title,
  description,
  onConfirm,
  children,
  action = 'Delete',
}: {
  title: string
  description: ReactNode
  onConfirm: () => unknown
  children: ReactNode
  action?: string
}) {
  const [busy, setBusy] = useState(false)
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onConfirm()
              } finally {
                setBusy(false)
              }
            }}
          >
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const s = Math.round((Date.now() - parseServerDate(iso).getTime()) / 1000)
  if (s < 10) return 'just now'
  if (s < 60) return `${s}s ago`
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return parseServerDate(iso).toLocaleDateString()
}

/** Server timestamps are UTC but EF/SQLite drops the zone suffix. */
export function parseServerDate(iso: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : iso + 'Z')
}

export function OnlineBadge({ online }: { online: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium',
        online ? 'border-success/30 bg-success/10 text-success' : 'border-border text-muted-foreground',
      )}
    >
      <StatusDot online={online} />
      {online ? 'Online' : 'Offline'}
    </span>
  )
}

export function Field({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-1.5', className)}>
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  )
}

/** Borderless multi-line text that saves on blur (Ctrl/Cmd+Enter commits, Esc reverts). */
export function InlineDescription({
  value,
  onSave,
  placeholder = 'Add a description…',
  className,
}: {
  value: string
  onSave: (v: string) => unknown
  placeholder?: string
  className?: string
}) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <textarea
      value={text}
      rows={1}
      placeholder={placeholder}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => text.trim() !== value && onSave(text.trim())}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) e.currentTarget.blur()
        if (e.key === 'Escape') setText(value)
      }}
      className={cn(
        '-mx-1 field-sizing-content w-full resize-none rounded-md bg-transparent px-1 text-sm text-muted-foreground outline-none placeholder:text-muted-foreground/60 hover:bg-accent/50 focus:bg-accent/50 focus:text-foreground',
        className,
      )}
      aria-label="Description"
    />
  )
}
