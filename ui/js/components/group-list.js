import { getState, setState, subscribe } from '../store.js'
import * as api from '../api.js'
import { $, html, createElement } from '../utils.js'

export function renderGroupList(container, params) {
  let unsub

  async function load() {
    setState({ loading: true, error: null })
    try {
      const groups = await api.getGroups()
      setState({ groups, loading: false })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }

  function renderForm() {
    const el = createElement(html`
      <div class="inline-form" id="add-group-form">
        <div class="form-row">
          <div class="form-group">
            <label>Group ID</label>
            <input type="text" id="add-group-id" placeholder="idle, printing_faces, celebration" required>
          </div>
          <div class="form-group">
            <label>Label</label>
            <input type="text" id="add-group-label" placeholder="Idle Faces">
          </div>
        </div>
        <div class="form-actions" style="border:none;margin-top:12px;padding-top:0">
          <button class="btn btn-primary btn-sm" id="save-group-btn">Save</button>
          <button class="btn btn-secondary btn-sm" id="cancel-add-btn">Cancel</button>
        </div>
      </div>
    `)

    el.querySelector('#save-group-btn').onclick = async () => {
      const id = el.querySelector('#add-group-id').value.trim()
      if (!id) { el.querySelector('#add-group-id').focus(); return }
      const label = el.querySelector('#add-group-label').value.trim()
      try {
        await api.createGroup({ id, label, sortOrder: 0 })
        setState({ dirtyForms: {} })
        await load()
      } catch (err) {
        const btn = el.querySelector('#save-group-btn')
        btn.textContent = `Error: ${err.message}`
        setTimeout(() => { btn.textContent = 'Save' }, 2000)
      }
    }
    el.querySelector('#cancel-add-btn').onclick = () => {
      const form = $('#add-group-form')
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
        <h2>Groups</h2>
        <button class="btn btn-primary btn-sm" id="refresh-groups-btn">Refresh</button>
        <button class="btn btn-secondary btn-sm" id="add-group-btn">+ Add Group</button>
      </div>
    `

    if (state.groups.length === 0 && !state.loading) {
      content += html`
        <div class="empty-state">
          <p>No groups yet. Groups are collections of animation sets that can be assigned to displays.</p>
        </div>
      `
    }

    if (state.groups.length > 0) {
      content += '<div id="groups-list">'
      for (const group of state.groups) {
        content += html`
          <div class="group-card" data-group-id="${group.id}">
            <div class="group-info">
              <span class="group-label">${group.label || group.id}</span>
              <span class="group-meta">${group.sets ? group.sets.length : 0} sets</span>
            </div>
            <div class="card-actions" style="margin-top:8px;margin-bottom:0">
              <button class="btn btn-secondary btn-sm edit-group-btn" data-id="${group.id}">Edit</button>
              <button class="btn btn-danger btn-sm delete-group-btn" data-id="${group.id}">Delete</button>
            </div>
          </div>
        `
      }
      content += '</div>'
    }

    if (state.loading) {
      content += '<div class="loading">Loading groups</div>'
    }

    container.innerHTML = content

    container.querySelector('#refresh-groups-btn')?.addEventListener('click', load)

    container.querySelector('#add-group-btn')?.addEventListener('click', () => {
      const existing = $('#add-group-form')
      if (existing) { existing.remove(); return }
      const list = $('#groups-list')
      if (list) {
        list.prepend(renderForm())
      } else {
        const empty = container.querySelector('.empty-state')
        if (empty) {
          empty.after(renderForm())
        }
      }
    })

    container.querySelectorAll('.edit-group-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        location.hash = `#groups/${btn.dataset.id}`
      })
    })

    container.querySelectorAll('.delete-group-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.dataset.id
        const group = state.groups.find(g => g.id === id)
        const name = group?.label || group?.id || 'this group'

        const overlay = createElement(html`
          <div class="dialog-overlay">
            <div class="dialog-box">
              <h3>Delete Group</h3>
              <p>Are you sure you want to delete <strong>${name}</strong>? This will also remove all its sets, frames, and elements. This cannot be undone.</p>
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
            await api.deleteGroup(id)
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
