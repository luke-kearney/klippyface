// Mirrors server/Models/*.cs. The server speaks snake_case JSON; api.ts converts keys
// to camelCase on the way in and back on the way out. Fields ending in `Json` hold
// JSON strings and are never key-converted.

export interface Node {
  id: string
  macAddress: string
  friendlyName: string
  description: string
  createdAt: string
  updatedAt: string
  lastSeen: string | null
  lastConfigVersion: number
  isOnline: boolean
  displays?: NodeDisplay[]
  assignments?: Assignment[]
}

export type DriverType = 'sh1106' | 'ssd1306' | 'st7789' | 'ili9341' | 'hx8347'
export type BusType = 'i2c' | 'spi' | 'parallel8'

export interface NodeDisplay {
  id: string
  nodeId: string
  label: string
  driverType: DriverType | string
  busType: BusType | string
  busConfig: string
  width: number
  height: number
  rotation: number
  sortOrder: number
}

export interface Assignment {
  id: string
  nodeId: string
  displayId: string
  defaultGroup: string
  triggersJson: string
  activePreset: string | null
}

export interface Group {
  id: string
  label: string
  sortOrder: number
  createdAt: string
  updatedAt: string
  sets?: Set[]
}

export interface Set {
  id: string
  groupId: string
  label: string
  sortOrder: number
  loopCount: number
  frameTime: number
  frames?: Frame[]
}

export interface Frame {
  id: string
  setId: string
  sortOrder: number
  durationMs: number
  bgColor: string
  elements?: FrameElement[]
}

export type ElementType = 'text' | 'sprite' | 'datavalue'

export interface FrameElement {
  id: string
  frameId: string
  sortOrder: number
  type: ElementType
  value: string
  label: string
  color: string
  x: number
  y: number
}

export interface Sprite {
  id: string
  label: string
  width: number
  height: number
  dataBase64: string
  createdAt: string
}

export interface Preset {
  id: string
  label: string
  conditionsJson: string
  overridesJson: string
  createdAt: string
}
