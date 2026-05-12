import { getState, setState, subscribe, markDirty, markClean } from '../store.js'
import * as api from '../api.js'
import { $, html, createElement } from '../utils.js'

export function renderGroupEditor(container, params) {
  const groupId = params.groupId
  let unsub
  let currentGroup = null
  let sets = []
  let saving = false

  async function load() {
    setState({ loading: true, error: null, currentGroup: null })
    try {
      const group = await api.getGroup(groupId)
      currentGroup = group
      sets = group.sets || []
      setState({ currentGroup: group, loading: false })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }

  async function saveGroup(label) {
    saving = true
    setState({ error: null })
    try {
      const updated = await api.updateGroup(groupId, { label, sortOrder: currentGroup.sortOrder })
      currentGroup = updated
      markClean('group-form')
      setState({ currentGroup: updated })
    } catch (err) {
      setState({ error: err.message })
    }
    saving = false
  }

  async function deleteSet(setId) {
    try {
      await api.deleteSet(setId)
      sets = sets.filter(s => s.id !== setId)
      setState({ currentGroup: { ...currentGroup, sets } })
    } catch (err) {
      setState({ error: err.message })
    }
  }

  async function saveSet(data, editId) {
    if (editId) {
      const updated = await api.updateSet(editId, data)
      sets = sets.map(s => s.id === editId ? updated : s)
    } else {
      const created = await api.createSet(groupId, data)
      sets = [...sets, created]
    }
    setState({ currentGroup: { ...currentGroup, sets } })
  }

  async function moveSet(index, direction) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= sets.length) return
    const reordered = [...sets]
    const [removed] = reordered.splice(index, 1)
    reordered.splice(newIndex, 0, removed)
    sets = reordered
    setState({ currentGroup: { ...currentGroup, sets } })
    for (let i = 0; i < sets.length; i++) {
      if (sets[i].sortOrder !== i) {
        await api.updateSet(sets[i].id, { ...sets[i], sortOrder: i }).catch(() => {})
      }
    }
  }

  let editSetId = null

  function renderSetForm(editData) {
    const d = editData || { label: '', loopCount: 1, frameTime: 1000 }

    const el = createElement(html`
      <div class="inline-form set-form">
        <div class="form-row">
          <div class="form-group">
            <label>Label</label>
            <input type="text" class="sf-label" value="${d.label}" placeholder="Happy Face">
          </div>
          <div class="form-group" style="flex:0 0 100px">
            <label>Loop Count</label>
            <input type="number" class="sf-loop" value="${d.loopCount}" min="0" max="999">
          </div>
          <div class="form-group" style="flex:0 0 100px">
            <label>Frame Time (ms)</label>
            <input type="number" class="sf-ftime" value="${d.frameTime}" min="100" max="30000" step="100">
          </div>
        </div>
        <div class="form-actions" style="border:none;margin-top:12px;padding-top:0">
          <button class="btn btn-primary btn-sm sf-save">${editData ? 'Update' : 'Add'} Set</button>
          <button class="btn btn-secondary btn-sm sf-cancel">Cancel</button>
        </div>
      </div>
    `)

    el.querySelector('.sf-save').onclick = async () => {
      const label = el.querySelector('.sf-label').value.trim()
      if (!label) { el.querySelector('.sf-label').focus(); return }
      const loopCount = parseInt(el.querySelector('.sf-loop').value) || 1
      const frameTime = parseInt(el.querySelector('.sf-ftime').value) || 1000

      try {
        await saveSet({ label, loopCount, frameTime, sortOrder: editData ? editData.sortOrder : sets.length }, editData?.id)
        el.remove()
        editSetId = null
      } catch (err) {
        setState({ error: err.message })
      }
    }

    el.querySelector('.sf-cancel').onclick = () => { el.remove(); editSetId = null }
    return el
  }

  function render() {
    const state = getState()
    let content = ''

    content += html`
      <a href="#groups" class="back-link" style="display:inline-block;margin-bottom:16px;color:var(--text-secondary)">&larr; Groups</a>
    `

    if (state.error && !state.loading) {
      content += html`<div class="error-banner">${state.error}</div>`
    }

    if (state.loading) {
      content += '<div class="loading">Loading group</div>'
      container.innerHTML = content
      return
    }

    if (!currentGroup) {
      content += '<div class="error-banner">Group not found</div>'
      container.innerHTML = content
      return
    }

    const cg = currentGroup

    content += html`
      <div class="view-header">
        <h2>${cg.label || cg.id}</h2>
      </div>

      <div id="unsaved-bar" class="unsaved-bar">You have unsaved changes</div>

      <div class="card">
        <div class="form-group">
          <label>Group ID</label>
          <input type="text" value="${cg.id}" disabled style="opacity:0.6">
          <div class="hint">Group ID cannot be changed after creation</div>
        </div>
        <div class="form-group">
          <label>Label</label>
          <input type="text" id="edit-group-label" value="${cg.label || ''}" placeholder="Idle Faces">
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="save-group-btn" disabled>Saved</button>
        </div>
      </div>

      <div class="section-header">
        <h3>Sets</h3>
        <button class="btn btn-secondary btn-sm" id="add-set-btn">+ Add Set</button>
      </div>
      <div id="sets-list"></div>
    `

    container.innerHTML = content

    const labelInput = container.querySelector('#edit-group-label')
    const saveBtn = container.querySelector('#save-group-btn')

    function checkDirty() {
      const dirty = labelInput.value !== (cg.label || '')
      if (dirty) {
        markDirty('group-form')
        saveBtn.textContent = 'Save'
        saveBtn.disabled = false
      } else {
        markClean('group-form')
        saveBtn.textContent = 'Saved'
        saveBtn.disabled = true
      }
    }

    labelInput.addEventListener('input', checkDirty)

    saveBtn.addEventListener('click', async () => {
      saveBtn.textContent = 'Saving...'
      saveBtn.disabled = true
      await saveGroup(labelInput.value.trim())
      saveBtn.textContent = 'Saved'
    })

    const setsList = container.querySelector('#sets-list')
    const addSetBtn = container.querySelector('#add-set-btn')

    for (let i = 0; i < sets.length; i++) {
      const s = sets[i]
      const frameCount = s.frames ? s.frames.length : 0
      const first = i === 0
      const last = i === sets.length - 1

      const card = createElement(html`
        <div class="set-card" data-id="${s.id}">
          <div class="set-info">
            <div class="set-label">${s.label}</div>
            <div class="set-detail">${frameCount} frames &middot; loop ${s.loopCount} &middot; ${s.frameTime}ms per frame</div>
          </div>
          <div style="display:flex;gap:4px">
            <button class="btn btn-secondary btn-sm btn-up set-move-up" data-index="${i}" ${first ? 'disabled style="opacity:0.3"' : ''}>&uarr;</button>
            <button class="btn btn-secondary btn-sm btn-down set-move-down" data-index="${i}" ${last ? 'disabled style="opacity:0.3"' : ''}>&darr;</button>
          </div>
          <button class="btn btn-secondary btn-sm edit-set-btn" data-id="${s.id}">Edit</button>
          <button class="btn btn-secondary btn-sm frames-set-btn" data-id="${s.id}">Frames</button>
          <button class="btn btn-danger btn-sm delete-set-btn" data-id="${s.id}">Delete</button>
        </div>
      `)

      card.querySelector('.set-move-up').onclick = () => moveSet(i, -1)
      card.querySelector('.set-move-down').onclick = () => moveSet(i, 1)

      card.querySelector('.frames-set-btn').onclick = (e) => {
        e.stopPropagation()
        location.hash = `#groups/${groupId}/sets/${s.id}`
      }

      card.querySelector('.delete-set-btn').onclick = async () => {
        const overlay = createElement(html`
          <div class="dialog-overlay">
            <div class="dialog-box">
              <h3>Delete Set</h3>
              <p>Remove set <strong>${s.label}</strong>? This will also delete all its frames and elements.</p>
              <div class="dialog-actions">
                <button class="btn btn-secondary btn-sm dc">Cancel</button>
                <button class="btn btn-danger btn-sm dd">Delete</button>
              </div>
            </div>
          </div>
        `)
        document.body.appendChild(overlay)
        overlay.querySelector('.dc').onclick = () => overlay.remove()
        overlay.querySelector('.dd').onclick = async () => {
          await deleteSet(s.id)
          overlay.remove()
        }
      }

      card.querySelector('.edit-set-btn').onclick = () => {
        if (editSetId === s.id) {
          const existing = card.nextElementSibling
          if (existing && existing.classList.contains('set-form')) {
            existing.remove()
            editSetId = null
            return
          }
        }
        const existing = document.querySelector('.set-form')
        if (existing) existing.remove()
        const form = renderSetForm(s)
        card.after(form)
        editSetId = s.id
      }

      setsList.appendChild(card)
    }

    addSetBtn.onclick = () => {
      const existing = document.querySelector('.set-form')
      if (existing) { existing.remove(); editSetId = null; return }
      setsList.appendChild(renderSetForm(null))
      editSetId = null
    }
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
