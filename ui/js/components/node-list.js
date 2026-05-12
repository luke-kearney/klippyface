import { getState, setState, subscribe } from '../store.js'
import * as api from '../api.js'
import { $, html, createElement } from '../utils.js'

export function renderNodeList(container, params) {
  let unsub

  async function load() {
    setState({ loading: true, error: null })
    try {
      const nodes = await api.getNodes()
      setState({ nodes, loading: false })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }

  function renderForm() {
    const el = createElement(html`
      <div class="inline-form" id="add-node-form">
        <div class="form-row">
          <div class="form-group" style="flex:0 0 160px">
            <label>MAC Address</label>
            <input type="text" id="add-mac" placeholder="AA:BB:CC:DD:EE:01" required>
          </div>
          <div class="form-group">
            <label>Friendly Name</label>
            <input type="text" id="add-name" placeholder="My Printer Face">
          </div>
          <div class="form-group">
            <label>Description</label>
            <input type="text" id="add-desc" placeholder="Main 3D printer display">
          </div>
        </div>
        <div class="form-actions" style="border:none;margin-top:12px;padding-top:0">
          <button class="btn btn-primary btn-sm" id="save-node-btn">Save</button>
          <button class="btn btn-secondary btn-sm" id="cancel-add-btn">Cancel</button>
        </div>
      </div>
    `)

    el.querySelector('#save-node-btn').onclick = async () => {
      const mac = el.querySelector('#add-mac').value.trim()
      if (!mac) { el.querySelector('#add-mac').focus(); return }
      const friendlyName = el.querySelector('#add-name').value.trim()
      const description = el.querySelector('#add-desc').value.trim()
      try {
        await api.createNode({ macAddress: mac, friendlyName, description })
        setState({ dirtyForms: {} })
        await load()
      } catch (err) {
        const btn = el.querySelector('#save-node-btn')
        btn.textContent = `Error: ${err.message}`
        setTimeout(() => { btn.textContent = 'Save' }, 2000)
      }
    }
    el.querySelector('#cancel-add-btn').onclick = () => {
      const form = $('#add-node-form')
      if (form) form.remove()
    }
    return el
  }

  function render() {
    const state = getState()
    let content = ''

    if (state.error) {
      content += html`<div class="error-banner">${state.error}</div>`
    }

    content += html`
      <div class="view-header">
        <h2>Nodes</h2>
        <button class="btn btn-primary btn-sm" id="refresh-nodes-btn">Refresh</button>
        <button class="btn btn-secondary btn-sm" id="add-node-btn">+ Add Node</button>
      </div>
    `

    if (state.nodes.length === 0 && !state.loading) {
      content += html`
        <div class="empty-state">
          <p>No nodes registered yet. Add one to get started.</p>
        </div>
      `
    }

    content += '<div id="node-list">'
    if (state.nodes.length > 0) {
      for (const node of state.nodes) {
        content += html`
          <div class="card" data-node-id="${node.id}">
            <div class="card-header">
              <span class="status-dot offline"></span>
              <span class="card-title">${node.friendlyName || 'Unnamed Node'}</span>
              <div class="card-actions">
                <button class="btn btn-secondary btn-sm edit-node-btn" data-id="${node.id}">Edit</button>
                <button class="btn btn-danger btn-sm delete-node-btn" data-id="${node.id}">Delete</button>
              </div>
            </div>
            <div class="card-body">
              <div><strong>MAC:</strong> <code>${node.macAddress}</code></div>
              ${node.description ? html`<div>${node.description}</div>` : ''}
            </div>
          </div>
        `
      }
    }
    content += '</div>'

    if (state.loading) {
      content += '<div class="loading">Loading nodes</div>'
    }

    container.innerHTML = content

    container.querySelector('#refresh-nodes-btn')?.addEventListener('click', load)

    container.querySelector('#add-node-btn')?.addEventListener('click', () => {
      const existing = $('#add-node-form')
      if (existing) existing.remove()
      container.querySelector('#node-list')?.prepend(renderForm())
    })

    container.querySelectorAll('.edit-node-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        location.hash = `#nodes/${btn.dataset.id}`
      })
    })

    container.querySelectorAll('.delete-node-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id
        const node = state.nodes.find(n => n.id === id)
        const name = node?.friendlyName || 'this node'

        const overlay = createElement(html`
          <div class="dialog-overlay">
            <div class="dialog-box">
              <h3>Delete Node</h3>
              <p>Are you sure you want to delete <strong>${name}</strong>? This will also remove all its displays and assignments. This cannot be undone.</p>
              <div class="dialog-actions">
                <button class="btn btn-secondary btn-sm" id="dialog-cancel">Cancel</button>
                <button class="btn btn-danger btn-sm" id="dialog-confirm">Delete</button>
              </div>
            </div>
          </div>
        `)
        document.body.appendChild(overlay)

        overlay.querySelector('#dialog-cancel').onclick = () => overlay.remove()
        overlay.querySelector('#dialog-confirm').onclick = async () => {
          try {
            await api.deleteNode(id)
            overlay.remove()
            await load()
          } catch (err) {
            alert(`Delete failed: ${err.message}`)
            overlay.remove()
          }
        }
      })
    })
  }

  return {
    mount() {
      unsub = subscribe(render)
      load()
    },
    unmount() {
      if (unsub) unsub()
    },
  }
}
