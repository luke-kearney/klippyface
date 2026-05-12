import { $, $$ } from './utils.js'
import { getState, setState, subscribe, isDirty } from './store.js'
import { renderNodeList } from './components/node-list.js'
import { renderNodeEditor } from './components/node-editor.js'

const VIEWS = {
  nodes: { render: renderNodeList, title: 'Nodes' },
}

function parseRoute(hash) {
  const h = hash.replace(/^#/, '') || 'nodes'
  const m = h.match(/^nodes(?:\/(.+))?$/)
  if (m) return { view: 'nodes', params: { nodeId: m[1] || null } }
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
    el.classList.toggle('active', el.dataset.view === route.view ||
      (route.view === 'nodes' && el.dataset.view === 'nodes'))
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
