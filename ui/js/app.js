import { $, $$ } from './utils.js'
import { getState, setState, subscribe, isDirty } from './store.js'
import { renderNodeList } from './components/node-list.js'
import { renderNodeEditor } from './components/node-editor.js'
import { renderGroupList } from './components/group-list.js'
import { renderGroupEditor } from './components/group-editor.js'
import { renderSetEditor } from './components/set-editor.js'
import { renderSpriteEditor } from './components/sprite-editor.js'
import { renderPresetEditor } from './components/preset-editor.js'

const VIEWS = {
  nodes: { render: renderNodeList, title: 'Nodes' },
  groups: { render: renderGroupList, title: 'Groups' },
  'group-editor': { render: renderGroupEditor, title: 'Group Editor' },
  'set-editor': { render: renderSetEditor, title: 'Set Editor' },
  sprites: { render: renderSpriteEditor, title: 'Sprites' },
  presets: { render: renderPresetEditor, title: 'Presets' },
}

function parseRoute(hash) {
  const h = hash.replace(/^#/, '') || 'nodes'
  let m

  m = h.match(/^nodes(?:\/(.+))?$/)
  if (m) return { view: 'nodes', params: { nodeId: m[1] || null } }

  m = h.match(/^groups\/([^/]+)\/sets\/(.+)$/)
  if (m) return { view: 'set-editor', params: { groupId: m[1], setId: m[2] } }

  m = h.match(/^groups\/(.+)$/)
  if (m) return { view: 'group-editor', params: { groupId: m[1] } }

  m = h.match(/^groups$/)
  if (m) return { view: 'groups', params: {} }

  m = h.match(/^sprites\/(.+)$/)
  if (m) return { view: 'sprites', params: { spriteId: m[1] } }

  m = h.match(/^sprites$/)
  if (m) return { view: 'sprites', params: {} }

  m = h.match(/^presets\/(.+)$/)
  if (m) return { view: 'presets', params: { presetId: m[1] } }

  m = h.match(/^presets$/)
  if (m) return { view: 'presets', params: {} }

  return { view: 'nodes', params: {} }
}

let currentComponent = null

async function handleRoute() {
  const route = parseRoute(location.hash)
  const viewDef = VIEWS[route.view]
  if (!viewDef) { location.hash = '#nodes'; return }

  if (isDirty() && !confirm('You have unsaved changes. Discard them?')) {
    return
  }

  setState({ currentView: route.view, error: null, dirtyForms: {} })

  document.title = `${viewDef.title} — Klippyface`

  const container = $('#view-container')
  if (currentComponent && currentComponent.unmount) {
    currentComponent.unmount()
  }

  $$('.nav-link').forEach(el => {
    const view = el.dataset.view
    const active = view === route.view ||
      (route.view === 'nodes' && view === 'nodes') ||
      (route.view === 'group-editor' && view === 'groups') ||
      (route.view === 'set-editor' && view === 'groups') ||
      (route.view === 'groups' && view === 'groups') ||
      (route.view === 'sprites' && view === 'sprites') ||
      (route.view === 'presets' && view === 'presets')
    el.classList.toggle('active', active)
  })

  container.innerHTML = '<div class="loading">Loading</div>'

  currentComponent = viewDef.render(container, route.params)
  if (currentComponent && currentComponent.mount) {
    currentComponent.mount()
  }
}

let prevDirty = false
function updateDirtyIndicator(state) {
  const el = $('#dirty-indicator')
  const bar = $('#unsaved-bar')
  const dirty = Object.keys(state.dirtyForms).length > 0
  if (dirty === prevDirty) return
  prevDirty = dirty
  if (el) el.classList.toggle('visible', dirty)
  if (bar) bar.classList.toggle('visible', dirty)
}

window.addEventListener('hashchange', handleRoute)
subscribe(updateDirtyIndicator)

if (!location.hash) {
  location.hash = '#nodes'
} else {
  handleRoute()
}
