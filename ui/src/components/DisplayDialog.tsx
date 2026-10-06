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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Field } from '@/components/common'
import { keys, useApiMutation } from '@/hooks/queries'
import { api } from '@/lib/api'
import { BOARD_PRESETS, defaultPresetFor, type BoardPreset } from '@/lib/boards'
import type { NodeDisplay } from '@/lib/types'

const DRIVERS = [
  { value: 'sh1106', label: 'SH1106 OLED', bus: 'i2c', w: 128, h: 64 },
  { value: 'ssd1306', label: 'SSD1306 OLED', bus: 'i2c', w: 128, h: 64 },
  { value: 'st7789', label: 'ST7789 TFT', bus: 'spi', w: 240, h: 240 },
  { value: 'gc9a01', label: 'GC9A01 round TFT', bus: 'spi', w: 240, h: 240 },
  { value: 'ili9341', label: 'ILI9341 TFT', bus: 'spi', w: 320, h: 240 },
  { value: 'hx8347', label: 'HX8347D TFT', bus: 'parallel8', w: 320, h: 240 },
]

const BUSES = [
  { value: 'i2c', label: 'I²C' },
  { value: 'spi', label: 'SPI' },
  { value: 'parallel8', label: '8-bit parallel' },
]

type Pins = Record<string, number | string | boolean | undefined>

// Field order and defaults match what the firmware's DisplayFactory reads.
// `hint` is the label commonly printed on the module (e.g. Uno-style TFT shields).
const PIN_FIELDS: Record<string, { key: string; label: string; def: number | ''; optional?: boolean; hint?: string }[]> = {
  i2c: [
    { key: 'sda', label: 'SDA', def: 21 },
    { key: 'scl', label: 'SCL', def: 22 },
  ],
  spi: [
    { key: 'sclk', label: 'SCLK', def: 18 },
    { key: 'mosi', label: 'MOSI', def: 23 },
    { key: 'dc', label: 'DC', def: 2 },
    { key: 'cs', label: 'CS', def: 5 },
    { key: 'rst', label: 'RST', def: 4 },
    { key: 'bl', label: 'Backlight', def: '', optional: true },
    { key: 'miso', label: 'MISO', def: '', optional: true },
  ],
  parallel8: [
    { key: 'dc', label: 'DC', def: 32, hint: 'LCD_RS' },
    { key: 'cs', label: 'CS', def: 5, hint: 'LCD_CS' },
    { key: 'wr', label: 'WR', def: 26, hint: 'LCD_WR' },
    { key: 'rd', label: 'RD', def: -1, hint: '-1: tie LCD_RD to 3.3V' },
    { key: 'rst', label: 'RST', def: 33, hint: 'LCD_RST' },
    { key: 'bl', label: 'Backlight', def: '', optional: true },
    { key: 'd0', label: 'D0', def: 4 },
    { key: 'd1', label: 'D1', def: 13 },
    { key: 'd2', label: 'D2', def: 18 },
    { key: 'd3', label: 'D3', def: 19 },
    { key: 'd4', label: 'D4', def: 14 },
    { key: 'd5', label: 'D5', def: 12 },
    { key: 'd6', label: 'D6', def: 23 },
    { key: 'd7', label: 'D7', def: 25 },
  ],
}

function parseBus(json: string): Pins {
  try {
    return JSON.parse(json || '{}')
  } catch {
    return {}
  }
}

export function busSummary(d: NodeDisplay): string {
  const bc = parseBus(d.busConfig)
  if (d.busType === 'i2c') return `I²C ${bc.address ?? '0x3C'} (SDA ${bc.sda ?? 21}, SCL ${bc.scl ?? 22})`
  if (d.busType === 'spi') return `SPI (CS ${bc.cs ?? '?'}, DC ${bc.dc ?? '?'})`
  return '8-bit parallel'
}

export function DisplayDialog({
  nodeId,
  board,
  display,
  sortOrder,
  children,
}: {
  nodeId: string
  /** The node's reported firmware board, used to suggest a preset. */
  board?: string
  display?: NodeDisplay
  sortOrder: number
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState('')
  const [driverType, setDriverType] = useState('sh1106')
  const [busType, setBusType] = useState('i2c')
  const [pins, setPins] = useState<Pins>({})
  const [width, setWidth] = useState(128)
  const [height, setHeight] = useState(64)
  const [rotation, setRotation] = useState(0)
  const [presetId, setPresetId] = useState('custom')

  function applyPreset(p: BoardPreset) {
    setPresetId(p.id)
    setDriverType(p.driverType)
    setBusType(p.busType)
    setWidth(p.width)
    setHeight(p.height)
    setRotation(p.rotation)
    setPins({ ...p.busConfig })
    setLabel((l) => l || (p.driverType === 'gc9a01' ? 'Round face' : 'Face'))
  }

  function reset() {
    setLabel(display?.label ?? '')
    setDriverType(display?.driverType ?? 'sh1106')
    setBusType(display?.busType ?? 'i2c')
    setPins(display ? parseBus(display.busConfig) : {})
    setWidth(display?.width ?? 128)
    setHeight(display?.height ?? 64)
    setRotation(display?.rotation ?? 0)
    setPresetId('custom')
    // New display on a node whose board we know: start from its preset
    const suggested = !display ? defaultPresetFor(board) : undefined
    if (suggested) applyPreset(suggested)
  }

  const save = useApiMutation(
    () => {
      const bc: Pins = {}
      if (busType === 'i2c') bc.address = (pins.address as string) || '0x3C'
      for (const f of PIN_FIELDS[busType] ?? []) {
        const raw = pins[f.key] ?? f.def
        const n = typeof raw === 'number' ? raw : parseInt(String(raw))
        if (!isNaN(n)) bc[f.key] = n
      }
      if (busType === 'parallel8') bc.ips = !!pins.ips
      if (busType === 'spi') {
        // SPI panels (ST7789, GC9A01) are IPS unless switched off
        bc.ips = pins.ips !== false
        for (const k of ['col_offset', 'row_offset']) {
          const n = parseInt(String(pins[k] ?? ''))
          if (!isNaN(n) && n > 0) bc[k] = n
        }
      }
      const body = { label: label.trim(), driverType, busType, busConfig: JSON.stringify(bc), width, height, rotation, sortOrder }
      return display ? api.updateDisplay(nodeId, display.id, body) : api.createDisplay(nodeId, body)
    },
    {
      invalidate: [keys.node(nodeId), keys.nodes],
      success: display ? 'Display updated' : 'Display added',
      onSuccess: () => setOpen(false),
    },
  )

  function pickDriver(v: string) {
    setDriverType(v)
    const d = DRIVERS.find((x) => x.value === v)
    if (d && !display) {
      setBusType(d.bus)
      setWidth(d.w)
      setHeight(d.h)
      setPins({})
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset()
        setOpen(o)
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate(undefined)
          }}
        >
          <DialogHeader>
            <DialogTitle>{display ? 'Edit display' : 'Add display'}</DialogTitle>
            <DialogDescription>Wiring and panel settings. Saving pushes new config to the node.</DialogDescription>
          </DialogHeader>
          <Field
            label="Board preset"
            hint={
              board
                ? `This node reports board ${board}. Picking a preset fills in the fields below; you can still edit them.`
                : 'Fills in driver, size and pins; you can still edit them.'
            }
          >
            <Select
              value={presetId}
              onValueChange={(v) => {
                const p = BOARD_PRESETS.find((x) => x.id === v)
                if (p) applyPreset(p)
                else setPresetId('custom')
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="custom">Custom</SelectItem>
                {BOARD_PRESETS.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.label}
                    {p.board === board && <span className="text-muted-foreground"> · this board</span>}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Label">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Front face" required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Driver">
              <Select value={driverType} onValueChange={pickDriver}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DRIVERS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Bus">
              <Select value={busType} onValueChange={setBusType}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BUSES.map((b) => (
                    <SelectItem key={b.value} value={b.value}>
                      {b.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Width">
              <Input type="number" min={32} max={480} value={width} onChange={(e) => setWidth(+e.target.value)} />
            </Field>
            <Field label="Height">
              <Input type="number" min={16} max={480} value={height} onChange={(e) => setHeight(+e.target.value)} />
            </Field>
            <Field label="Rotation">
              <Select value={String(rotation)} onValueChange={(v) => setRotation(+v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[0, 1, 2, 3].map((r) => (
                    <SelectItem key={r} value={String(r)}>
                      {r * 90}°
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <fieldset className="grid gap-3 rounded-lg border p-3">
            <legend className="px-1 text-sm font-medium">Pins</legend>
            {busType === 'i2c' && (
              <Field label="I²C address">
                <Input
                  value={(pins.address as string) ?? '0x3C'}
                  onChange={(e) => setPins((p) => ({ ...p, address: e.target.value }))}
                  placeholder="0x3C"
                />
              </Field>
            )}
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {(PIN_FIELDS[busType] ?? []).map((f) => (
                <Field key={f.key} label={f.label} hint={f.hint}>
                  <Input
                    type="number"
                    min={-1}
                    max={48}
                    value={(pins[f.key] as number | undefined) ?? f.def}
                    placeholder={f.optional ? 'default' : undefined}
                    onChange={(e) =>
                      setPins((p) => ({ ...p, [f.key]: e.target.value === '' ? '' : +e.target.value }))
                    }
                  />
                </Field>
              ))}
            </div>
            {busType === 'parallel8' && (
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={!!pins.ips} onCheckedChange={(v) => setPins((p) => ({ ...p, ips: v }))} />
                IPS panel (inverted colours)
              </label>
            )}
            {busType === 'spi' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'col_offset', label: 'Column offset' },
                    { key: 'row_offset', label: 'Row offset' },
                  ].map((f) => (
                    <Field key={f.key} label={f.label} hint={f.key === 'row_offset' ? 'e.g. 20 for 240×280 ST7789' : undefined}>
                      <Input
                        type="number"
                        min={0}
                        max={80}
                        value={(pins[f.key] as number | undefined) ?? ''}
                        placeholder="0"
                        onChange={(e) =>
                          setPins((p) => ({ ...p, [f.key]: e.target.value === '' ? '' : +e.target.value }))
                        }
                      />
                    </Field>
                  ))}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={pins.ips !== false} onCheckedChange={(v) => setPins((p) => ({ ...p, ips: v }))} />
                  IPS panel (inverted colours)
                </label>
              </>
            )}
          </fieldset>

          <DialogFooter>
            <Button type="submit" disabled={!label.trim() || save.isPending}>
              {display ? 'Save' : 'Add display'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
