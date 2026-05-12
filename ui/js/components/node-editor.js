import { getState, setState, subscribe, markDirty, markClean } from '../store.js'
import * as api from '../api.js'
import { $, html, createElement } from '../utils.js'

export function renderNodeEditor(container, params) {
  const nodeId = params.nodeId
  let unsub
  let currentNode = null
  let displays = []
  let saving = false

  async function load() {
    setState({ loading: true, error: null, currentNode: null, displays: [] })
    try {
      const [node, groups] = await Promise.all([api.getNode(nodeId), api.getGroups()])
      currentNode = node
      displays = node.displays || []
      groupsCache = groups
      setState({ currentNode: node, displays, loading: false })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }

  async function saveNode(friendlyName, description) {
    saving = true
    setState({ error: null })
    try {
      const updated = await api.updateNode(nodeId, { friendlyName, description })
      currentNode = updated
      markClean('node-form')
      setState({ currentNode: updated })
    } catch (err) {
      setState({ error: err.message })
    }
    saving = false
  }

  async function deleteDisplay(displayId) {
    try {
      await api.deleteDisplay(nodeId, displayId)
      displays = displays.filter(d => d.id !== displayId)
      setState({ displays })
    } catch (err) {
      setState({ error: err.message })
    }
  }

  async function saveDisplay(data, editId) {
    if (editId) {
      const updated = await api.updateDisplay(nodeId, editId, data)
      displays = displays.map(d => d.id === editId ? updated : d)
    } else {
      const created = await api.createDisplay(nodeId, data)
      displays = [...displays, created]
    }
    setState({ displays })
  }

  function renderDisplayForm(editData) {
    const d = editData || { label: '', driverType: 'sh1106', busType: 'i2c', busConfig: '{}', width: 128, height: 64, rotation: 0 }
    let bc = { address: '0x3C' }
    try {
      if (d.busConfig && typeof d.busConfig === 'string') bc = JSON.parse(d.busConfig)
    } catch { bc = {} }

    const el = createElement(html`
      <div class="inline-form display-form">
        <div class="form-row">
          <div class="form-group">
            <label>Label</label>
            <input type="text" class="df-label" value="${d.label}" placeholder="Front Face">
          </div>
          <div class="form-group" style="flex:0 0 140px">
            <label>Driver</label>
            <select class="df-driver">
              <option value="sh1106" ${d.driverType === 'sh1106' ? 'selected' : ''}>SH1106</option>
              <option value="ssd1306" ${d.driverType === 'ssd1306' ? 'selected' : ''}>SSD1306</option>
              <option value="st7789" ${d.driverType === 'st7789' ? 'selected' : ''}>ST7789</option>
              <option value="ili9341" ${d.driverType === 'ili9341' ? 'selected' : ''}>ILI9341</option>
            </select>
          </div>
          <div class="form-group" style="flex:0 0 100px">
            <label>Bus</label>
            <select class="df-bus">
              <option value="i2c" ${d.busType === 'i2c' ? 'selected' : ''}>I2C</option>
              <option value="spi" ${d.busType === 'spi' ? 'selected' : ''}>SPI</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" id="df-bus-config">
            ${d.busType === 'i2c'
              ? html`<label>I2C Address</label><input type="text" class="df-bus-addr" value="${bc.address || '0x3C'}" placeholder="0x3C">`
              : html`
                <div class="form-row">
                  <div class="form-group"><label>CS Pin</label><input type="number" class="df-cs" value="${bc.cs || 5}"></div>
                  <div class="form-group"><label>DC Pin</label><input type="number" class="df-dc" value="${bc.dc || 2}"></div>
                  <div class="form-group"><label>RST Pin</label><input type="number" class="df-rst" value="${bc.rst || 4}"></div>
                </div>`
            }
          </div>
          <div class="form-group" style="flex:0 0 80px">
            <label>Width</label>
            <input type="number" class="df-w" value="${d.width}" min="64" max="480">
          </div>
          <div class="form-group" style="flex:0 0 80px">
            <label>Height</label>
            <input type="number" class="df-h" value="${d.height}" min="32" max="480">
          </div>
          <div class="form-group" style="flex:0 0 70px">
            <label>Rotation</label>
            <input type="number" class="df-rot" value="${d.rotation}" min="0" max="3">
          </div>
        </div>
        <div class="form-actions" style="border:none;margin-top:12px;padding-top:0">
          <button class="btn btn-primary btn-sm df-save">${editData ? 'Update' : 'Add'} Display</button>
          <button class="btn btn-secondary btn-sm df-cancel">Cancel</button>
        </div>
      </div>
    `)

    el.querySelector('.df-bus').onchange = () => {
      const isI2c = el.querySelector('.df-bus').value === 'i2c'
      const cfgEl = el.querySelector('#df-bus-config')
      if (isI2c) {
        cfgEl.innerHTML = '<label>I2C Address</label><input type="text" class="df-bus-addr" value="0x3C" placeholder="0x3C">'
      } else {
        cfgEl.innerHTML = `
          <div class="form-row">
            <div class="form-group"><label>CS Pin</label><input type="number" class="df-cs" value="5"></div>
            <div class="form-group"><label>DC Pin</label><input type="number" class="df-dc" value="2"></div>
            <div class="form-group"><label>RST Pin</label><input type="number" class="df-rst" value="4"></div>
          </div>`
      }
    }

    el.querySelector('.df-save').onclick = async () => {
      const label = el.querySelector('.df-label').value.trim()
      if (!label) { el.querySelector('.df-label').focus(); return }
      const driverType = el.querySelector('.df-driver').value
      const busType = el.querySelector('.df-bus').value
      let busConfig
      if (busType === 'i2c') {
        const addr = el.querySelector('.df-bus-addr')?.value?.trim() || '0x3C'
        busConfig = JSON.stringify({ address: addr })
      } else {
        const cs = parseInt(el.querySelector('.df-cs')?.value) || 5
        const dc = parseInt(el.querySelector('.df-dc')?.value) || 2
        const rst = parseInt(el.querySelector('.df-rst')?.value) || 4
        busConfig = JSON.stringify({ cs, dc, rst })
      }
      const width = parseInt(el.querySelector('.df-w').value) || 128
      const height = parseInt(el.querySelector('.df-h').value) || 64
      const rotation = parseInt(el.querySelector('.df-rot').value) || 0

      try {
        await saveDisplay({ label, driverType, busType, busConfig, width, height, rotation, sortOrder: displays.length }, editData?.id)
        el.remove()
      } catch (err) {
        setState({ error: err.message })
      }
    }

    el.querySelector('.df-cancel').onclick = () => el.remove()
    return el
  }

  let groupsCache = []
  let assignmentEditId = null

  async function loadGroups() {
    try { groupsCache = await api.getGroups() } catch {}
  }

  async function loadAssignment(displayId) {
    try {
      return await api.getAssignment(nodeId, displayId)
    } catch {
      return null
    }
  }

  function renderAssignmentForm(displayId) {
    const el = createElement(html`
      <div class="inline-form assignment-form" data-display-id="${displayId}">
        <div class="form-row">
          <div class="form-group">
            <label>Default Group</label>
            <select class="af-default-group">
              <option value="">— None —</option>
              ${groupsCache.map(g => html`<option value="${g.id}">${g.label || g.id}</option>`).join('')}
            </select>
            <div class="hint">Group shown when no trigger matches current printer state</div>
          </div>
        </div>
        <div style="margin-top:12px">
          <div class="fe-section-title">Triggers</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Map printer states to display groups:</div>
          ${['state:printing', 'state:paused', 'state:complete', 'state:error', 'state:idle'].map(trigger => html`
            <div class="form-row" style="margin-bottom:8px">
              <div class="form-group" style="flex:0 0 140px">
                <input type="text" class="af-trigger-key" value="${trigger}" style="font-size:11px;opacity:0.7" readonly>
              </div>
              <div class="form-group">
                <select class="af-trigger-group" data-trigger="${trigger}">
                  <option value="">— None —</option>
                  ${groupsCache.map(g => html`<option value="${g.id}">${g.label || g.id}</option>`).join('')}
                </select>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="form-actions" style="border:none;margin-top:12px;padding-top:0">
          <button class="btn btn-primary btn-sm af-save">Save Assignment</button>
          <button class="btn btn-secondary btn-sm af-cancel">Cancel</button>
        </div>
      </div>
    `)

    loadAssignment(displayId).then(assignment => {
      if (assignment) {
        if (assignment.defaultGroup) {
          el.querySelector('.af-default-group').value = assignment.defaultGroup
        }
        let triggers = {}
        try { triggers = JSON.parse(assignment.triggersJson || '{}') } catch {}
        el.querySelectorAll('.af-trigger-group').forEach(sel => {
          const trigger = sel.dataset.trigger
          if (triggers[trigger]) sel.value = triggers[trigger]
        })
      }
    })

    el.querySelector('.af-save').onclick = async () => {
      const defaultGroup = el.querySelector('.af-default-group').value
      const triggers = {}
      el.querySelectorAll('.af-trigger-group').forEach(sel => {
        if (sel.value) triggers[sel.dataset.trigger] = sel.value
      })
      try {
        await api.upsertAssignment(nodeId, displayId, { defaultGroup, triggersJson: JSON.stringify(triggers) })
        el.remove()
        assignmentEditId = null
      } catch (err) {
        const btn = el.querySelector('.af-save')
        btn.textContent = `Error: ${err.message}`
        setTimeout(() => { btn.textContent = 'Save Assignment' }, 2000)
      }
    }

    el.querySelector('.af-cancel').onclick = () => { el.remove(); assignmentEditId = null }
    return el
  }

  function render() {
    const state = getState()
    let content = ''

    content += html`
      <a href="#nodes" class="back-link" style="display:inline-block;margin-bottom:16px;color:var(--text-secondary)">&larr; Nodes</a>
    `

    if (state.error && !state.loading) {
      content += html`<div class="error-banner">${state.error}</div>`
    }

    if (state.loading) {
      content += '<div class="loading">Loading node</div>'
      container.innerHTML = content
      return
    }

    if (!currentNode) {
      content += '<div class="error-banner">Node not found</div>'
      container.innerHTML = content
      return
    }

    const cn = currentNode

    content += html`
      <div class="view-header">
        <h2>${cn.friendlyName || 'Unnamed Node'}</h2>
      </div>

      <div id="unsaved-bar" class="unsaved-bar">You have unsaved changes</div>

      <div class="card">
        <div class="form-group">
          <label>Friendly Name</label>
          <input type="text" id="edit-name" value="${cn.friendlyName || ''}" placeholder="My Printer Face">
        </div>
        <div class="form-group">
          <label>MAC Address</label>
          <input type="text" value="${cn.macAddress}" disabled style="opacity:0.6">
          <div class="hint">MAC address cannot be changed after creation</div>
        </div>
        <div class="form-group">
          <label>Description</label>
          <textarea id="edit-desc" placeholder="Main 3D printer display">${cn.description || ''}</textarea>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="save-node-btn" disabled>Saving...</button>
        </div>
      </div>

      <div class="section-header">
        <h3>Displays</h3>
        <button class="btn btn-secondary btn-sm" id="add-display-btn">+ Add Display</button>
      </div>
      <div id="displays-list"></div>
    `

    container.innerHTML = content

    const nameInput = container.querySelector('#edit-name')
    const descInput = container.querySelector('#edit-desc')
    const saveBtn = container.querySelector('#save-node-btn')

    function checkDirty() {
      const dirty = nameInput.value !== (cn.friendlyName || '') || descInput.value !== (cn.description || '')
      if (dirty) {
        markDirty('node-form')
        saveBtn.textContent = 'Save'
        saveBtn.disabled = false
      } else {
        markClean('node-form')
        saveBtn.textContent = 'Saved'
        saveBtn.disabled = true
      }
    }

    nameInput.addEventListener('input', checkDirty)
    descInput.addEventListener('input', checkDirty)

    saveBtn.addEventListener('click', async () => {
      saveBtn.textContent = 'Saving...'
      saveBtn.disabled = true
      await saveNode(nameInput.value.trim(), descInput.value.trim())
      saveBtn.textContent = 'Saved'
    })
    saveBtn.textContent = 'Saved'
    saveBtn.disabled = true

    const displaysList = container.querySelector('#displays-list')

    for (const d of displays) {
      let bc = {}
      try { if (d.busConfig && typeof d.busConfig === 'string') bc = JSON.parse(d.busConfig) } catch {}
      const busInfo = d.busType === 'i2c'
        ? `I2C ${bc.address || '?'}`
        : `SPI CS:${bc.cs || '?'} DC:${bc.dc || '?'} RST:${bc.rst || '?'}`

      const card = createElement(html`
        <div class="display-card" data-id="${d.id}">
          <div class="display-info">
            <div class="display-label">${d.label || 'Unlabeled'}</div>
            <div class="display-detail">${d.driverType} &middot; ${busInfo} &middot; ${d.width}x${d.height} &middot; rot ${d.rotation}</div>
          </div>
          <button class="btn btn-secondary btn-sm edit-display-btn" data-id="${d.id}">Edit</button>
          <button class="btn btn-secondary btn-sm assign-display-btn" data-id="${d.id}">Assignment</button>
          <button class="btn btn-danger btn-sm delete-display-btn" data-id="${d.id}">Delete</button>
        </div>
      `)

      card.querySelector('.delete-display-btn').onclick = async () => {
        const overlay = createElement(html`
          <div class="dialog-overlay">
            <div class="dialog-box">
              <h3>Delete Display</h3>
              <p>Remove display <strong>${d.label}</strong>?</p>
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
          await deleteDisplay(d.id)
          overlay.remove()
        }
      }

      card.querySelector('.edit-display-btn').onclick = () => {
        const existing = card.nextElementSibling
        if (existing && existing.classList.contains('display-form')) {
          existing.remove()
          return
        }
        const existingAssign = card.nextElementSibling
        if (existingAssign && existingAssign.classList.contains('assignment-form')) existingAssign.remove()
        const form = renderDisplayForm(d)
        card.after(form)
      }

      card.querySelector('.assign-display-btn').onclick = () => {
        if (assignmentEditId === d.id) {
          const existing = card.nextElementSibling
          if (existing && existing.classList.contains('assignment-form')) {
            existing.remove()
            assignmentEditId = null
            return
          }
        }
        const existingForm = card.parentElement.querySelector('.assignment-form')
        if (existingForm) existingForm.remove()
        const existingDisplay = card.nextElementSibling
        if (existingDisplay && existingDisplay.classList.contains('display-form')) existingDisplay.remove()
        card.after(renderAssignmentForm(d.id))
        assignmentEditId = d.id
      }

      displaysList.appendChild(card)
    }

    container.querySelector('#add-display-btn').onclick = () => {
      const existing = container.querySelector('.display-form')
      if (existing) { existing.remove(); return }
      displaysList.appendChild(renderDisplayForm(null))
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
