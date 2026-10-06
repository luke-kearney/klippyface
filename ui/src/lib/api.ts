import type {
  Assignment,
  Frame,
  FrameElement,
  Group,
  Node,
  NodeDisplay,
  Preset,
  Set,
  Sprite,
} from './types'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const toSnake = (s: string) => s.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase())
const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())

function convertKeys(v: unknown, fn: (k: string) => string): unknown {
  if (v === null || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map((x) => convertKeys(x, fn))
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).map(([k, val]) => [fn(k), convertKeys(val, fn)]),
  )
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(convertKeys(body, toSnake)),
  })
  if (!res.ok) {
    let text = ''
    try {
      text = await res.text()
    } catch {
      // body unreadable; status alone is enough
    }
    throw new ApiError(res.status, text ? `${res.status} ${res.statusText}: ${text}` : `${res.status} ${res.statusText}`)
  }
  if (res.status === 204) return null as T
  return convertKeys(await res.json(), toCamel) as T
}

const get = <T>(p: string) => request<T>('GET', p)
const post = <T>(p: string, b: unknown) => request<T>('POST', p, b)
const put = <T>(p: string, b: unknown) => request<T>('PUT', p, b)
const del = (p: string) => request<null>('DELETE', p)

export type NodeInput = Pick<Node, 'macAddress' | 'friendlyName' | 'description'>
export type DisplayInput = Omit<NodeDisplay, 'id' | 'nodeId'>
export type AssignmentInput = Pick<Assignment, 'defaultGroup' | 'triggersJson'> & { activePreset?: string | null }
export type SetInput = Pick<Set, 'label' | 'description' | 'loopCount' | 'frameTime' | 'sortOrder'>
export type FrameInput = Pick<Frame, 'durationMs' | 'bgColor' | 'sortOrder'>
export type ElementInput = Omit<FrameElement, 'id' | 'frameId'>
export type SpriteInput = Pick<Sprite, 'id' | 'label' | 'folder' | 'description' | 'width' | 'height' | 'dataBase64'>
export type PresetInput = Pick<Preset, 'id' | 'label' | 'conditionsJson' | 'overridesJson'>

export type MoonrakerState = 'NotConfigured' | 'Connecting' | 'KlippyNotReady' | 'Ready' | 'Disconnected'

/** The server's Moonraker connection: saved settings plus live status. */
export interface MoonrakerInfo {
  host: string
  port: number
  useTls: boolean
  hasApiKey: boolean
  status: { state: MoonrakerState; detail?: string; connected: boolean; objects: string[] }
}

/** `apiKey`: undefined keeps the saved key, '' clears it. */
export type MoonrakerInput = Pick<MoonrakerInfo, 'host' | 'port' | 'useTls'> & { apiKey?: string }

export const api = {
  // Nodes
  getNodes: () => get<Node[]>('/api/nodes'),
  getNode: (id: string) => get<Node>(`/api/nodes/${id}`),
  createNode: (d: NodeInput) => post<Node>('/api/nodes', d),
  updateNode: (id: string, d: Pick<Node, 'friendlyName' | 'description'>) => put<Node>(`/api/nodes/${id}`, d),
  deleteNode: (id: string) => del(`/api/nodes/${id}`),

  // Displays
  createDisplay: (nodeId: string, d: DisplayInput) => post<NodeDisplay>(`/api/nodes/${nodeId}/displays`, d),
  updateDisplay: (nodeId: string, id: string, d: DisplayInput) =>
    put<NodeDisplay>(`/api/nodes/${nodeId}/displays/${id}`, d),
  deleteDisplay: (nodeId: string, id: string) => del(`/api/nodes/${nodeId}/displays/${id}`),

  // Assignments
  upsertAssignment: (nodeId: string, displayId: string, d: AssignmentInput) =>
    put<Assignment>(`/api/nodes/${nodeId}/displays/${displayId}/assignment`, d),
  /** Point the display at the starter faces sized for it, importing them if needed. */
  useStarterFaces: (nodeId: string, displayId: string) =>
    post<Assignment>(`/api/nodes/${nodeId}/displays/${displayId}/starter-faces`, {}),

  // Groups
  getGroups: () => get<Group[]>('/api/groups'),
  getGroup: (id: string) => get<Group>(`/api/groups/${id}`),
  createGroup: (d: Pick<Group, 'id' | 'label' | 'description' | 'sortOrder'>) => post<Group>('/api/groups', d),
  /** Adds the built-in faces; existing sprite/group ids are left alone. */
  importStarterPack: () => post<{ spritesAdded: number; groupsAdded: number }>('/api/starter-pack', {}),
  updateGroup: (id: string, d: Pick<Group, 'label' | 'description' | 'profile' | 'sortOrder'>) => put<Group>(`/api/groups/${id}`, d),
  /** Repoints sets, assignments and preset swaps; GCODE macros must be updated by hand. */
  renameGroup: (id: string, newId: string) => post<Group>(`/api/groups/${id}/rename`, { id: newId }),
  deleteGroup: (id: string) => del(`/api/groups/${id}`),
  /** Refresh nodes showing the group with its saved edits. */
  publishGroup: (id: string) => post<{ nodes: number }>(`/api/groups/${id}/publish`, {}),

  // Sets
  createSet: (groupId: string, d: SetInput) => post<Set>(`/api/groups/${groupId}/sets`, d),
  updateSet: (id: string, d: SetInput) => put<Set>(`/api/sets/${id}`, d),
  deleteSet: (id: string) => del(`/api/sets/${id}`),
  reorderFrames: (setId: string, frameIds: string[]) => put<Frame[]>(`/api/sets/${setId}/frames/reorder`, frameIds),

  // Frames
  createFrame: (setId: string, d: FrameInput) => post<Frame>(`/api/sets/${setId}/frames`, d),
  updateFrame: (id: string, d: FrameInput) => put<Frame>(`/api/frames/${id}`, d),
  deleteFrame: (id: string) => del(`/api/frames/${id}`),

  // Elements
  createElement: (frameId: string, d: ElementInput) => post<FrameElement>(`/api/frames/${frameId}/elements`, d),
  updateElement: (id: string, d: ElementInput) => put<FrameElement>(`/api/elements/${id}`, d),
  deleteElement: (id: string) => del(`/api/elements/${id}`),
  reorderElements: (frameId: string, ids: string[]) =>
    put<FrameElement[]>(`/api/frames/${frameId}/elements/reorder`, ids),

  // Sprites
  getSprites: () => get<Sprite[]>('/api/sprites'),
  createSprite: (d: SpriteInput) => post<Sprite>('/api/sprites', d),
  updateSprite: (id: string, d: Omit<SpriteInput, 'id'>) => put<Sprite>(`/api/sprites/${id}`, d),
  deleteSprite: (id: string) => del(`/api/sprites/${id}`),
  /** Changes the id and repoints frame elements that use it. */
  renameSprite: (id: string, newId: string) =>
    post<{ sprite: Sprite; elementsUpdated: number }>(`/api/sprites/${id}/rename`, { id: newId }),

  // Moonraker (the server's printer connection)
  getMoonraker: () => get<MoonrakerInfo>('/api/moonraker'),
  updateMoonraker: (d: MoonrakerInput) => put<MoonrakerInfo>('/api/moonraker', d),
  /** Current printer values by data key. Fetched raw: keys like "extruder.temperature" must not be camel-cased. */
  getPrinterState: async () => {
    const res = await fetch('/api/moonraker/state')
    if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`)
    return (await res.json()) as Record<string, unknown>
  },

  // Presets
  getPresets: () => get<Preset[]>('/api/presets'),
  createPreset: (d: PresetInput) => post<Preset>('/api/presets', d),
  updatePreset: (id: string, d: Omit<PresetInput, 'id'>) => put<Preset>(`/api/presets/${id}`, d),
  deletePreset: (id: string) => del(`/api/presets/${id}`),
}

/** Slug used for user-chosen string ids (groups, sprites, presets). */
export const slugify = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')

/** Per-keystroke id cleanup (keeps trailing underscores while typing). */
export const sanitizeId = (s: string) => s.toLowerCase().replace(/[^a-z0-9_]/g, '_')

/** `base` if unused, otherwise `base_2`, `base_3`… */
export function uniqueId(base: string, taken: Iterable<string>): string {
  const set = new Set(taken)
  if (!set.has(base)) return base
  let n = 2
  while (set.has(`${base}_${n}`)) n++
  return `${base}_${n}`
}
