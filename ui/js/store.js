const state = {
  nodes: [],
  currentNode: null,
  displays: [],
  loading: false,
  error: null,
  dirtyForms: {},
  currentView: null,

  groups: [],
  currentGroup: null,
  currentSet: null,
  frames: [],

  sprites: [],
  currentSprite: null,

  presets: [],
  currentPreset: null,
}

const listeners = []

export function getState() {
  return state
}

export function setState(partial) {
  Object.assign(state, partial)
  listeners.forEach(fn => fn(state))
}

export function subscribe(fn) {
  listeners.push(fn)
  return () => {
    const idx = listeners.indexOf(fn)
    if (idx !== -1) listeners.splice(idx, 1)
  }
}

export function markDirty(formId) {
  setState({ dirtyForms: { ...state.dirtyForms, [formId]: true } })
}

export function markClean(formId) {
  const next = { ...state.dirtyForms }
  delete next[formId]
  setState({ dirtyForms: next })
}

export function isDirty() {
  return Object.keys(state.dirtyForms).length > 0
}
