import { $, html, createElement } from '../utils.js'

export function renderFrameEditor(frame, initialElements, callbacks) {
  const { onUpdateFrame, addElement, updateElement, deleteElement, reorderElements } = callbacks
  let elements = [...initialElements]
  let editElementId = null

  function renderElementRow(el, index, total) {
    const first = index === 0
    const last = index === total - 1
    const typeColors = { text: '#4caf50', sprite: '#2196f3', datavalue: '#ff9800' }

    const row = createElement(html`
      <div class="element-row" data-id="${el.id}">
        <div style="display:flex;gap:4px">
          <button class="btn btn-secondary btn-sm btn-up el-move-up" ${first ? 'disabled style="opacity:0.3"' : ''}>&uarr;</button>
          <button class="btn btn-secondary btn-sm btn-down el-move-down" ${last ? 'disabled style="opacity:0.3"' : ''}>&darr;</button>
        </div>
        <span class="element-type-badge" style="color:${typeColors[el.type] || '#ccc'}">${el.type}</span>
        <span class="element-value">${el.value || '\u2014'}</span>
        ${el.label ? html`<span class="element-label">${el.label}</span>` : ''}
        <span class="element-color-swatch" style="background:${el.color || '#FFFFFF'}"></span>
        <span class="element-pos">${el.x},${el.y}</span>
        <button class="btn btn-secondary btn-sm el-edit">Edit</button>
        <button class="btn btn-danger btn-sm el-delete">Del</button>
      </div>
    `)

    row.querySelector('.el-move-up').onclick = async () => {
      const arr = [...elements]
      const [removed] = arr.splice(index, 1)
      arr.splice(index - 1, 0, removed)
      try {
        const reordered = await reorderElements(frame.id, arr.map(e => e.id))
        elements = reordered || arr
        renderElementsList()
      } catch {}
    }

    row.querySelector('.el-move-down').onclick = async () => {
      const arr = [...elements]
      const [removed] = arr.splice(index, 1)
      arr.splice(index + 1, 0, removed)
      try {
        const reordered = await reorderElements(frame.id, arr.map(e => e.id))
        elements = reordered || arr
        renderElementsList()
      } catch {}
    }

    row.querySelector('.el-delete').onclick = () => {
      const overlay = createElement(html`
        <div class="dialog-overlay">
          <div class="dialog-box">
            <h3>Delete Element</h3>
            <p>Remove this ${el.type} element?</p>
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
        try {
          await deleteElement(el.id)
          elements = elements.filter(e => e.id !== el.id)
          overlay.remove()
          renderElementsList()
        } catch {
          overlay.remove()
        }
      }
    }

    row.querySelector('.el-edit').onclick = () => {
      const existing = row.nextElementSibling
      if (existing && existing.classList.contains('element-form')) {
        existing.remove()
        editElementId = null
        return
      }
      const existingForm = panel.querySelector('.element-form')
      if (existingForm) existingForm.remove()
      row.after(renderElementForm(el))
      editElementId = el.id
    }

    return row
  }

  function renderElementForm(editData) {
    const d = editData || { type: 'text', value: '', label: '', color: '#FFFFFF', x: 0, y: 0, sortOrder: 0 }

    const el = createElement(html`
      <div class="element-form">
        <div class="form-row">
          <div class="form-group" style="flex:0 0 110px">
            <label>Type</label>
            <select class="ef-type">
              <option value="text" ${d.type === 'text' ? 'selected' : ''}>Text</option>
              <option value="sprite" ${d.type === 'sprite' ? 'selected' : ''}>Sprite</option>
              <option value="datavalue" ${d.type === 'datavalue' ? 'selected' : ''}>Data Value</option>
            </select>
          </div>
          <div class="form-group">
            <label>Value</label>
            <input type="text" class="ef-value" value="${d.value}" placeholder="Hello / sprite_id / print_stats.state">
          </div>
          <div class="form-group" style="flex:0 0 100px">
            <label>Label</label>
            <input type="text" class="ef-label" value="${d.label}" placeholder="Ext:">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group" style="flex:0 0 60px">
            <label>Color</label>
            <input type="color" class="ef-color" value="${d.color}">
          </div>
          <div class="form-group" style="flex:0 0 60px">
            <label>X</label>
            <input type="number" class="ef-x" value="${d.x}" min="0" max="127">
          </div>
          <div class="form-group" style="flex:0 0 60px">
            <label>Y</label>
            <input type="number" class="ef-y" value="${d.y}" min="0" max="63">
          </div>
          <div class="form-group" style="flex:0 0 60px">
            <label>Order</label>
            <input type="number" class="ef-order" value="${d.sortOrder}" min="0" max="999">
          </div>
        </div>
        <div class="form-actions" style="border:none;margin-top:8px;padding-top:8px">
          <button class="btn btn-primary btn-sm ef-save">${editData ? 'Update' : 'Add'} Element</button>
          <button class="btn btn-secondary btn-sm ef-cancel">Cancel</button>
        </div>
      </div>
    `)

    el.querySelector('.ef-save').onclick = async () => {
      const type = el.querySelector('.ef-type').value
      const value = el.querySelector('.ef-value').value.trim()
      const label = el.querySelector('.ef-label').value.trim()
      const color = el.querySelector('.ef-color').value
      const x = parseInt(el.querySelector('.ef-x').value) || 0
      const y = parseInt(el.querySelector('.ef-y').value) || 0
      const sortOrder = parseInt(el.querySelector('.ef-order').value) || 0

      const data = { type, value, label, color, x, y, sortOrder }

      try {
        if (editData) {
          const updated = await updateElement(editData.id, data)
          elements = elements.map(e => e.id === editData.id ? updated : e)
        } else {
          const created = await addElement(frame.id, data)
          elements = [...elements, created]
        }
        el.remove()
        editElementId = null
        renderElementsList()
      } catch (err) {
        const btn = el.querySelector('.ef-save')
        btn.textContent = `Error: ${err.message}`
        setTimeout(() => { btn.textContent = editData ? 'Update Element' : 'Add Element' }, 2000)
      }
    }

    el.querySelector('.ef-cancel').onclick = () => { el.remove(); editElementId = null }
    return el
  }

  const panel = createElement(html`
    <div class="frame-editor-panel" data-frame-id="${frame.id}">
      <div class="fe-section">
        <div class="fe-section-title">Frame Settings</div>
        <div class="form-row">
          <div class="form-group" style="flex:1">
            <label>Duration (ms)</label>
            <input type="range" class="fe-duration-range" min="100" max="10000" step="100" value="${frame.durationMs || 1000}">
            <div class="range-value" id="fe-duration-display">${frame.durationMs || 1000} ms</div>
          </div>
          <div class="form-group" style="flex:0 0 80px">
            <label>Bg Color</label>
            <input type="color" class="fe-bgcolor" value="${frame.bgColor || '#000000'}">
          </div>
        </div>
      </div>

      <div class="fe-section">
        <div class="fe-section-title">
          Elements
          <button class="btn btn-secondary btn-sm" id="add-element-btn" style="float:right">+ Add Element</button>
        </div>
        <div id="elements-list"></div>
      </div>
    </div>
  `)

  const elementsContainer = panel.querySelector('#elements-list')

  function renderElementsList() {
    elementsContainer.innerHTML = ''
    for (let i = 0; i < elements.length; i++) {
      elementsContainer.appendChild(renderElementRow(elements[i], i, elements.length))
    }
  }
  renderElementsList()

  const durationRange = panel.querySelector('.fe-duration-range')
  const durationDisplay = panel.querySelector('#fe-duration-display')
  const bgColorInput = panel.querySelector('.fe-bgcolor')

  let frameSaveTimer = null
  function scheduleFrameSave() {
    if (frameSaveTimer) clearTimeout(frameSaveTimer)
    frameSaveTimer = setTimeout(() => {
      onUpdateFrame(frame.id, {
        durationMs: parseInt(durationRange.value),
        bgColor: bgColorInput.value,
      })
    }, 400)
  }

  durationRange.oninput = () => {
    durationDisplay.textContent = `${durationRange.value} ms`
    scheduleFrameSave()
  }

  bgColorInput.oninput = () => scheduleFrameSave()

  panel.querySelector('#add-element-btn').onclick = () => {
    const existing = panel.querySelector('.element-form')
    if (existing) { existing.remove(); editElementId = null; return }
    elementsContainer.appendChild(renderElementForm(null))
    editElementId = null
  }

  return panel
}
