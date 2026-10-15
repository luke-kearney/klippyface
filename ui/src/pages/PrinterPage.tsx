import { useEffect, useState } from 'react'
import { Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { ErrorState, Field, Loading, Page, PageHeader, StatusDot } from '@/components/common'
import { keys, useApiMutation, useMoonraker, usePrinterState } from '@/hooks/queries'
import { api, type MoonrakerInfo, type MoonrakerState } from '@/lib/api'
import { cn } from '@/lib/utils'

const STATE_TEXT: Record<MoonrakerState, string> = {
  NotConfigured: 'Not set up',
  Connecting: 'Connecting…',
  KlippyNotReady: 'Klipper not ready',
  Ready: 'Connected',
  Disconnected: 'Disconnected',
}

export function PrinterPage() {
  const { data, isLoading, error } = useMoonraker()

  return (
    <Page>
      <PageHeader
        title="Printer"
        description="The server keeps one connection to Moonraker and passes printer state on to every node."
      />
      {error && <ErrorState error={error} />}
      {isLoading && <Loading />}
      {data && (
        <div className="grid gap-6 lg:grid-cols-2">
          <ConnectionCard info={data} />
          <StatusCard info={data} />
          <ValuesCard connected={data.status.connected} />
        </div>
      )}
    </Page>
  )
}

function ConnectionCard({ info }: { info: MoonrakerInfo }) {
  const [host, setHost] = useState(info.host)
  const [port, setPort] = useState(String(info.port))
  const [useTls, setUseTls] = useState(info.useTls)
  const [apiKey, setApiKey] = useState('')
  useEffect(() => {
    setHost(info.host)
    setPort(String(info.port))
    setUseTls(info.useTls)
  }, [info.host, info.port, info.useTls])

  const portNumber = Number(port)
  const valid = host.trim().length > 0 && Number.isInteger(portNumber) && portNumber >= 1 && portNumber <= 65535
  const dirty = host !== info.host || portNumber !== info.port || useTls !== info.useTls || apiKey !== ''

  const save = useApiMutation(api.updateMoonraker, {
    invalidate: [keys.moonraker],
    success: 'Moonraker settings saved',
    onSuccess: () => setApiKey(''),
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Moonraker</CardTitle>
        <CardDescription>Usually the machine running Klipper, port 7125.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            if (valid)
              save.mutate({ host: host.trim(), port: portNumber, useTls, apiKey: apiKey === '' ? undefined : apiKey })
          }}
        >
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <Field label="Host">
              <Input value={host} onChange={(e) => setHost(e.target.value)} placeholder="192.168.1.50 or printer.local" />
            </Field>
            <Field label="Port">
              <Input value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={useTls} onCheckedChange={setUseTls} /> Secure WebSocket (wss://)
          </label>
          <Field
            label="API key"
            hint={
              info.hasApiKey
                ? 'A key is saved. Type a new one to replace it.'
                : 'Only needed if Moonraker doesn’t list this server under trusted_clients.'
            }
          >
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={info.hasApiKey ? '••••••••' : 'Optional'}
              autoComplete="off"
            />
          </Field>
          <div className="flex justify-end gap-2">
            {info.hasApiKey && (
              <Button
                type="button"
                variant="outline"
                disabled={save.isPending}
                onClick={() => save.mutate({ host: info.host, port: info.port, useTls: info.useTls, apiKey: '' })}
              >
                Remove key
              </Button>
            )}
            <Button type="submit" disabled={!valid || !dirty || save.isPending}>
              <Save /> Save
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function StatusCard({ info }: { info: MoonrakerInfo }) {
  const { state, detail, connected, objects } = info.status
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <StatusDot online={connected} />
          {STATE_TEXT[state]}
        </CardTitle>
        <CardDescription>
          {state === 'NotConfigured' && 'Enter Moonraker’s address to start getting printer data.'}
          {state === 'KlippyNotReady' && 'Moonraker is up but Klipper isn’t ready. Nodes show their offline face until it is.'}
          {state === 'Disconnected' && 'Retrying automatically.'}
          {state === 'Ready' && `${info.host}:${info.port}`}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {detail && <code className="rounded bg-muted px-2 py-1 text-xs break-all">{detail}</code>}
        {objects.length > 0 && (
          <div className="grid gap-1.5">
            <span className="text-muted-foreground">Subscribed objects</span>
            <div className="flex flex-wrap gap-1.5">
              {objects.map((o) => (
                <code key={o} className="rounded border px-1.5 py-0.5 text-xs">
                  {o}
                </code>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ValuesCard({ connected }: { connected: boolean }) {
  const { data } = usePrinterState(connected)
  const entries = Object.entries(data ?? {})

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>Live values</CardTitle>
        <CardDescription>Every data key the server has. A Printer value element shows one of these.</CardDescription>
      </CardHeader>
      <CardContent>
        {!connected && <p className="text-sm text-muted-foreground">Not connected.</p>}
        {connected && entries.length > 0 && (
          <div className="grid gap-x-6 sm:grid-cols-2">
            {entries.map(([key, value]) => (
              <div key={key} className="flex items-baseline justify-between gap-3 border-b py-1 text-sm">
                <code className="truncate text-xs text-muted-foreground">{key}</code>
                <span className={cn('shrink-0 font-mono text-xs', value === null && 'text-muted-foreground')}>
                  {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
