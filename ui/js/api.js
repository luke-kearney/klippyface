const BASE = ''

function toSnake(s) {
  return s.replace(/[A-Z]/g, c => '_' + c.toLowerCase())
}

function toCamel(s) {
  return s.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

function convertReqKeys(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(convertReqKeys)
  return Object.fromEntries(
    Object.entries(v).map(([k, val]) => [toSnake(k), convertReqKeys(val)])
  )
}

function convertResKeys(v) {
  if (v === null || v === undefined || typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map(convertResKeys)
  return Object.fromEntries(
    Object.entries(v).map(([k, val]) => [toCamel(k), convertResKeys(val)])
  )
}

async function request(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } }
  if (body !== undefined) opts.body = JSON.stringify(convertReqKeys(body))
  const res = await fetch(`${BASE}${path}`, opts)
  if (!res.ok) {
    const err = new Error(`${res.status} ${res.statusText}`)
    err.status = res.status
    let text
    try { text = await res.text() } catch { text = '' }
    if (text) err.message += `: ${text}`
    throw err
  }
  const data = res.status === 204 ? null : await res.json()
  return data ? convertResKeys(data) : null
}

// ── Nodes ──
export const getNodes = () => request('GET', '/api/nodes')
export const getNode = (id) => request('GET', `/api/nodes/${id}`)
export const createNode = (data) => request('POST', '/api/nodes', data)
export const updateNode = (id, data) => request('PUT', `/api/nodes/${id}`, data)
export const deleteNode = (id) => request('DELETE', `/api/nodes/${id}`)

// ── Displays ──
export const getDisplays = (nodeId) => request('GET', `/api/nodes/${nodeId}/displays`)
export const createDisplay = (nodeId, data) => request('POST', `/api/nodes/${nodeId}/displays`, data)
export const updateDisplay = (nodeId, displayId, data) => request('PUT', `/api/nodes/${nodeId}/displays/${displayId}`, data)
export const deleteDisplay = (nodeId, displayId) => request('DELETE', `/api/nodes/${nodeId}/displays/${displayId}`)

// ── Assignments ──
export const getAssignment = (nodeId, displayId) => request('GET', `/api/nodes/${nodeId}/displays/${displayId}/assignment`)
export const upsertAssignment = (nodeId, displayId, data) => request('PUT', `/api/nodes/${nodeId}/displays/${displayId}/assignment`, data)

// ── Groups ──
export const getGroups = () => request('GET', '/api/groups')
export const getGroup = (id) => request('GET', `/api/groups/${id}`)
export const createGroup = (data) => request('POST', '/api/groups', data)
export const updateGroup = (id, data) => request('PUT', `/api/groups/${id}`, data)
export const deleteGroup = (id) => request('DELETE', `/api/groups/${id}`)

// ── Sets ──
export const getSets = (groupId) => request('GET', `/api/groups/${groupId}/sets`)
export const createSet = (groupId, data) => request('POST', `/api/groups/${groupId}/sets`, data)
export const updateSet = (id, data) => request('PUT', `/api/sets/${id}`, data)
export const deleteSet = (id) => request('DELETE', `/api/sets/${id}`)
export const reorderFrames = (setId, frameIds) => request('PUT', `/api/sets/${setId}/frames/reorder`, frameIds)

// ── Frames ──
export const getFrames = (setId) => request('GET', `/api/sets/${setId}/frames`)
export const createFrame = (setId, data) => request('POST', `/api/sets/${setId}/frames`, data)
export const updateFrame = (id, data) => request('PUT', `/api/frames/${id}`, data)
export const deleteFrame = (id) => request('DELETE', `/api/frames/${id}`)

// ── Elements ──
export const getElements = (frameId) => request('GET', `/api/frames/${frameId}/elements`)
export const createElement = (frameId, data) => request('POST', `/api/frames/${frameId}/elements`, data)
export const updateElement = (id, data) => request('PUT', `/api/elements/${id}`, data)
export const deleteElement = (id) => request('DELETE', `/api/elements/${id}`)
export const reorderElements = (frameId, elementIds) => request('PUT', `/api/frames/${frameId}/elements/reorder`, elementIds)

// ── Sprites ──
export const getSprites = () => request('GET', '/api/sprites')
export const getSprite = (id) => request('GET', `/api/sprites/${id}`)
export const createSprite = (data) => request('POST', '/api/sprites', data)
export const updateSprite = (id, data) => request('PUT', `/api/sprites/${id}`, data)
export const deleteSprite = (id) => request('DELETE', `/api/sprites/${id}`)

// ── Presets ──
export const getPresets = () => request('GET', '/api/presets')
export const getPreset = (id) => request('GET', `/api/presets/${id}`)
export const createPreset = (data) => request('POST', '/api/presets', data)
export const updatePreset = (id, data) => request('PUT', `/api/presets/${id}`, data)
export const deletePreset = (id) => request('DELETE', `/api/presets/${id}`)

// ── Config ──
export const getNodeConfig = (mac) => request('GET', `/api/config/node?mac=${encodeURIComponent(mac)}`)
export const getLibraryConfig = () => request('GET', '/api/config/library')
