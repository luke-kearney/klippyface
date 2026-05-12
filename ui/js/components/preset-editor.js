import { getState, setState, subscribe } from '../store.js'
import * as api from '../api.js'
import { $, html, createElement } from '../utils.js'

export function renderPresetEditor(container, params) {
  let unsub
  let presets = []
  let editPresetId = null

  async function load() {
    setState({ loading: true, error: null })
    try {
      presets = await api.getPresets()
      setState({ presets, loading: false })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }

  async function deletePreset(id) {
    try {
      await api.deletePreset(id)
      presets = presets.filter(p => p.id !== id)
      if (editPresetId === id) editPresetId = null
      setState({ presets })
    } catch (err) {
      setState({ error: err.message })
    }
  }

  function renderPresetForm(editData) {
    const p = editData || { label: '', conditionsJson: '{}', overridesJson: '{}' }
    let conditions = { type: 'manual' }
    let overrides = {}
    try { conditions = JSON.parse(p.conditionsJson || '{}') } catch {}
    try { overrides = JSON.parse(p.overridesJson || '{}') } catch {}

    const condType = conditions.type || 'manual'
    const swaps = overrides.groupSwaps || {}
    const swapKeys = Object.keys(swaps)

    const el = createElement(html`
      <div class="inline-form preset-form">
        <div class="form-row">
          <div class="form-group">
            <label>Label</label>
            <input type="text" class="pf-label" value="${p.label}" placeholder="Night Mode">
          </div>
        </div>

        <div style="margin-top:12px">
          <div class="fe-section-title">Conditions</div>
          <div class="condition-fields">
            <div class="form-row">
              <div class="form-group" style="flex:0 0 120px">
                <label>Type</label>
                <select class="pf-cond-type">
                  <option value="manual" ${condType === 'manual' ? 'selected' : ''}>Manual</option>
                  <option value="time" ${condType === 'time' ? 'selected' : ''}>Time Range</option>
                </select>
              </div>
              <div class="form-group" style="flex:0 0 100px">
                <label>Start</label>
                <input type="time" class="pf-cond-start" value="${conditions.start || '22:00'}">
              </div>
              <div class="form-group" style="flex:0 0 100px">
                <label>End</label>
                <input type="time" class="pf-cond-end" value="${conditions.end || '07:00'}">
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top:12px">
          <div class="fe-section-title">Overrides
            <button class="btn btn-secondary btn-sm pf-add-swap" style="float:right">+ Add Swap</button>
          </div>
          <div id="swaps-list">
            ${swapKeys.length === 0 ? html`<div style="font-size:12px;color:var(--text-muted);padding:8px 0">No group swaps configured</div>` : ''}
          </div>
          <div class="form-row" style="margin-top:8px">
            <div class="form-group" style="flex:0 0 120px">
              <label>Dim Brightness</label>
              <input type="number" class="pf-dim" value="${overrides.dimBrightness || ''}" min="0" max="100" placeholder="(none)">
            </div>
          </div>
        </div>

        <div class="form-actions" style="margin-top:12px;padding-top:12px">
          <button class="btn btn-primary btn-sm pf-save">${editData ? 'Update' : 'Create'} Preset</button>
          <button class="btn btn-secondary btn-sm pf-cancel">Cancel</button>
        </div>
      </div>
    `)

    const swapsList = el.querySelector('#swaps-list')

    function renderSwapRow(fromGroup, toGroup) {
      const row = createElement(html`
        <div class="swap-row">
          <div class="form-group">
            <input type="text" class="swap-from" value="${fromGroup || ''}" placeholder="Original group ID">
          </div>
          <span style="color:var(--text-muted)">&rarr;</span>
          <div class="form-group">
            <input type="text" class="swap-to" value="${toGroup || ''}" placeholder="Replacement group ID">
          </div>
          <button class="btn btn-danger btn-sm swap-remove">X</button>
        </div>
      `)
      row.querySelector('.swap-remove').onclick = () => row.remove()
      return row
    }

    if (swapKeys.length > 0) {
      swapsList.innerHTML = ''
      swapKeys.forEach(k => swapsList.appendChild(renderSwapRow(k, swaps[k])))
    }

    el.querySelector('.pf-add-swap').onclick = () => {
      swapsList.appendChild(renderSwapRow('', ''))
      const emptyMsg = swapsList.querySelector('div[style*="padding"]')
      if (emptyMsg) emptyMsg.remove()
    }

    el.querySelector('.pf-save').onclick = async () => {
      const label = el.querySelector('.pf-label').value.trim()
      if (!label) { el.querySelector('.pf-label').focus(); return }

      const condTypeVal = el.querySelector('.pf-cond-type').value
      const conditionsJson = condTypeVal === 'time'
        ? JSON.stringify({ type: 'time', start: el.querySelector('.pf-cond-start').value, end: el.querySelector('.pf-cond-end').value })
        : JSON.stringify({ type: 'manual' })

      const swaps = {}
      el.querySelectorAll('.swap-row').forEach(row => {
        const from = row.querySelector('.swap-from').value.trim()
        const to = row.querySelector('.swap-to').value.trim()
        if (from && to) swaps[from] = to
      })

      const dimVal = el.querySelector('.pf-dim').value.trim()
      const overrides = {}
      if (dimVal) overrides.dimBrightness = parseInt(dimVal)
      if (Object.keys(swaps).length > 0) overrides.groupSwaps = swaps
      const overridesJson = JSON.stringify(overrides)

      try {
        if (editData) {
          const id = editData.id
          await api.updatePreset(id, { label, conditionsJson, overridesJson })
        } else {
          const id = label.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
          await api.createPreset({ id, label, conditionsJson, overridesJson })
        }
        el.remove()
        editPresetId = null
        await load()
      } catch (err) {
        const btn = el.querySelector('.pf-save')
        btn.textContent = `Error: ${err.message}`
        setTimeout(() => { btn.textContent = editData ? 'Update Preset' : 'Create Preset' }, 2000)
      }
    }

    el.querySelector('.pf-cancel').onclick = () => { el.remove(); editPresetId = null }

    const condTypeSelect = el.querySelector('.pf-cond-type')
    const condStart = el.querySelector('.pf-cond-start')
    const condEnd = el.querySelector('.pf-cond-end')

    function toggleTimeFields() {
      const isTime = condTypeSelect.value === 'time'
      condStart.disabled = !isTime
      condEnd.disabled = !isTime
      condStart.style.opacity = isTime ? '1' : '0.4'
      condEnd.style.opacity = isTime ? '1' : '0.4'
    }
    toggleTimeFields()
    condTypeSelect.onchange = toggleTimeFields

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
        <h2>Presets</h2>
        <button class="btn btn-primary btn-sm" id="refresh-presets-btn">Refresh</button>
        <button class="btn btn-secondary btn-sm" id="add-preset-btn">+ Add Preset</button>
      </div>
    `

    if (presets.length === 0 && !state.loading) {
      content += html`
        <div class="empty-state">
          <p>No presets yet. Create presets for time-based or manual display overrides.</p>
        </div>
      `
    }

    if (presets.length > 0) {
      for (const preset of presets) {
        let conditions = {}
        try { conditions = JSON.parse(preset.conditionsJson || '{}') } catch {}
        const condDesc = conditions.type === 'time'
          ? `${conditions.start}-${conditions.end}`
          : 'manual'

        content += html`
          <div class="preset-card" data-preset-id="${preset.id}">
            <div class="preset-info">
              <span class="preset-label">${preset.label || preset.id}</span>
              <span class="preset-meta">${condDesc}</span>
            </div>
            <div class="card-actions" style="margin-top:8px">
              <button class="btn btn-secondary btn-sm edit-preset-btn" data-id="${preset.id}">Edit</button>
              <button class="btn btn-danger btn-sm delete-preset-btn" data-id="${preset.id}">Delete</button>
            </div>
          </div>
        `
      }
    }

    if (state.loading) {
      content += '<div class="loading">Loading presets</div>'
    }

    container.innerHTML = content

    container.querySelector('#refresh-presets-btn')?.addEventListener('click', load)

    container.querySelector('#add-preset-btn')?.addEventListener('click', () => {
      const existing = container.querySelector('.preset-form')
      if (existing) { existing.remove(); editPresetId = null; return }
      container.querySelector('.view-header')?.after(renderPresetForm(null))
      editPresetId = '__new'
    })

    container.querySelectorAll('.edit-preset-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.dataset.id
        if (editPresetId === id) {
          const existing = container.querySelector('.preset-form')
          if (existing) { existing.remove(); editPresetId = null; return }
        }
        const existingForm = container.querySelector('.preset-form')
        if (existingForm) existingForm.remove()
        const preset = presets.find(p => p.id === id)
        if (!preset) return
        const card = container.querySelector(`.preset-card[data-preset-id="${id}"]`)
        if (card) card.after(renderPresetForm(preset))
        editPresetId = id
      })
    })

    container.querySelectorAll('.delete-preset-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.dataset.id
        const preset = presets.find(p => p.id === id)
        const name = preset?.label || id

        const overlay = createElement(html`
          <div class="dialog-overlay">
            <div class="dialog-box">
              <h3>Delete Preset</h3>
              <p>Delete preset <strong>${name}</strong>?</p>
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
          await deletePreset(id)
          overlay.remove()
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
