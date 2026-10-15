import { NavLink, Outlet } from 'react-router'
import { Cpu, Image, Layers, Moon, Printer } from 'lucide-react'
import { useNodes } from '@/hooks/queries'
import { cn } from '@/lib/utils'
import { StatusDot } from '@/components/common'
import { KlippyfaceMark, KlippyfaceWordmark } from '@/components/Logo'

const NAV = [
  { to: '/nodes', label: 'Nodes', icon: Cpu },
  { to: '/printer', label: 'Printer', icon: Printer },
  { section: 'Library' },
  { to: '/groups', label: 'Groups', icon: Layers },
  { to: '/sprites', label: 'Sprites', icon: Image },
  { section: 'Behaviour' },
  { to: '/presets', label: 'Presets', icon: Moon },
] as const

export function AppLayout() {
  const { data: nodes } = useNodes()
  const online = nodes?.filter((n) => n.isOnline).length ?? 0

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <KlippyfaceMark className="size-9 shrink-0" />
          <div className="grid gap-1 leading-tight">
            <KlippyfaceWordmark className="h-[18px] text-sidebar-foreground" />
            <div className="text-xs text-muted-foreground">
              {nodes ? `${online}/${nodes.length} nodes online` : 'Display manager'}
            </div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {NAV.map((item, i) =>
            'section' in item ? (
              <div key={i} className="px-3 pt-4 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
                {item.section}
              </div>
            ) : (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    isActive && 'bg-sidebar-accent font-medium text-sidebar-accent-foreground',
                  )
                }
              >
                <item.icon className="size-4" />
                {item.label}
              </NavLink>
            ),
          )}
        </nav>
        {nodes && nodes.length > 0 && (
          <div className="mt-6 flex flex-col gap-0.5 px-2">
            <div className="px-3 pb-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">Devices</div>
            {nodes.map((n) => (
              <NavLink
                key={n.id}
                to={`/nodes/${n.id}`}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 truncate rounded-md px-3 py-1.5 text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent',
                    isActive && 'bg-sidebar-accent text-sidebar-accent-foreground',
                  )
                }
              >
                <StatusDot online={n.isOnline} />
                <span className="truncate">{n.friendlyName || n.macAddress}</span>
              </NavLink>
            ))}
          </div>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile nav */}
        <nav className="flex items-center gap-1 overflow-x-auto border-b px-2 py-2 md:hidden">
          <KlippyfaceMark className="mx-1 size-7 shrink-0" />
          {NAV.filter((i) => 'to' in i).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn('flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm', isActive && 'bg-accent font-medium')
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
