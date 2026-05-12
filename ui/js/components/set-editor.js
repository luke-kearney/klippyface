import { getState, setState, subscribe, markDirty, markClean } from '../store.js'
import * as api from '../api.js'
import { $, html, createElement } from '../utils.js'
import { renderFrameEditor } from './frame-editor.js'

export function renderSetEditor(container, params) {
  const { groupId, setId } = params
  let unsub
  let currentSet = null
  let frames = []
  let saving = false
  let expandedFrameId = null

  async function load() {
    setState({ loading: true, error: null, currentSet: null, frames: [] })
    try {
      const group = await api.getGroup(groupId)
      const set = (group.sets || []).find(s => s.id === setId)
      if (!set) { setState({ loading: false, error: 'Set not found' }); return }
      currentSet = set
      frames = set.frames || []
      setState({ currentSet: set, frames, loading: false })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }

  async function saveSet(label, loopCount, frameTime) {
    saving = true
    setState({ error: null })
    try {
      const updated = await api.updateSet(setId, { label, loopCount, frameTime, sortOrder: currentSet.sortOrder })
      currentSet = { ...currentSet, ...updated }
      markClean('set-form')
      setState({ currentSet })
    } catch (err) {
      setState({ error: err.message })
    }
    saving = false
  }

  async function addFrame(data) {
    const created = await api.createFrame(setId, data)
    frames = [...frames, created]
    setState({ currentSet: { ...currentSet, frames } })
  }

  async function updateFrame(frameId, data) {
    const updated = await api.updateFrame(frameId, data)
    frames = frames.map(f => f.id === frameId ? { ...f, ...updated } : f)
    setState({ currentSet: { ...currentSet, frames } })
  }

  async function deleteFrame(frameId) {
    await api.deleteFrame(frameId)
    frames = frames.filter(f => f.id !== frameId)
    if (expandedFrameId === frameId) expandedFrameId = null
    setState({ currentSet: { ...currentSet, frames } })
  }

  async function moveFrame(index, direction) {
    const newIndex = index + direction
    if (newIndex < 0 || newIndex >= frames.length) return
    const reordered = [...frames]
    const [removed] = reordered.splice(index, 1)
    reordered.splice(newIndex, 0, removed)
    frames = reordered
    setState({ currentSet: { ...currentSet, frames } })
    try {
      await api.reorderFrames(setId, frames.map(f => f.id))
    } catch {}
  }

  async function addElement(frameId, data) {
    const created = await api.createElement(frameId, data)
    const frame = frames.find(f => f.id === frameId)
    if (frame) {
      frame.elements = [...(frame.elements || []), created]
      setState({ currentSet: { ...currentSet, frames } })
    }
    return created
  }

  async function updateElement(elementId, data) {
    const updated = await api.updateElement(elementId, data)
    for (const frame of frames) {
      if (frame.elements) {
        const idx = frame.elements.findIndex(e => e.id === elementId)
        if (idx !== -1) {
          frame.elements[idx] = { ...frame.elements[idx], ...updated }
          break
        }
      }
    }
    setState({ currentSet: { ...currentSet, frames } })
    return updated
  }

  async function deleteElement(elementId) {
    await api.deleteElement(elementId)
    for (const frame of frames) {
      if (frame.elements) {
        frame.elements = frame.elements.filter(e => e.id !== elementId)
        break
      }
    }
    setState({ currentSet: { ...currentSet, frames } })
  }

  async function reorderElements(frameId, elementIds) {
    const reordered = await api.reorderElements(frameId, elementIds)
    const frame = frames.find(f => f.id === frameId)
    if (frame) frame.elements = reordered
    setState({ currentSet: { ...currentSet, frames } })
    return reordered
  }

  function renderAddFrameForm() {
    const el = createElement(html`
      <div class="inline-form" id="add-frame-form">
        <div class="form-row">
          <div class="form-group" style="flex:0 0 120px">
            <label>Duration (ms)</label>
            <input type="number" class="af-duration" value="1000" min="100" max="30000" step="100">
          </div>
          <div class="form-group" style="flex:0 0 80px">
            <label>Bg Color</label>
            <input type="color" class="af-bgcolor" value="#000000">
          </div>
        </div>
        <div class="form-actions" style="border:none;margin-top:12px;padding-top:0">
          <button class="btn btn-primary btn-sm" id="save-frame-btn">Add Frame</button>
          <button class="btn btn-secondary btn-sm" id="cancel-frame-btn">Cancel</button>
        </div>
      </div>
    `)

    el.querySelector('#save-frame-btn').onclick = async () => {
      const durationMs = parseInt(el.querySelector('.af-duration').value) || 1000
      const bgColor = el.querySelector('.af-bgcolor').value
      try {
        await addFrame({ durationMs, bgColor, sortOrder: frames.length })
        el.remove()
      } catch (err) {
        const btn = el.querySelector('#save-frame-btn')
        btn.textContent = `Error: ${err.message}`
        setTimeout(() => { btn.textContent = 'Add Frame' }, 2000)
      }
    }

    el.querySelector('#cancel-frame-btn').onclick = () => el.remove()
    return el
  }

  function toggleFrameExpand(frameId) {
    if (expandedFrameId === frameId) {
      expandedFrameId = null
    } else {
      expandedFrameId = frameId
    }
    renderFramesList()
  }

  function renderFramesList() {
    const list = container.querySelector('#frames-list')
    if (!list) return
    list.innerHTML = ''

    for (let i = 0; i < frames.length; i++) {
      const f = frames[i]
      const first = i === 0
      const last = i === frames.length - 1
      const expanded = expandedFrameId === f.id
      const elementCount = f.elements ? f.elements.length : 0

      const card = createElement(html`
        <div>
          <div class="frame-card" data-id="${f.id}">
            <div class="frame-info">
              <span class="frame-swatch" style="background:${f.bgColor || '#000000'}"></span>
              <span class="frame-label">Frame ${i + 1} &middot; ${f.durationMs || 1000}ms &middot; ${elementCount} elements</span>
            </div>
            <div style="display:flex;gap:4px">
              <button class="btn btn-secondary btn-sm btn-up fr-move-up" ${first ? 'disabled style="opacity:0.3"' : ''}>&uarr;</button>
              <button class="btn btn-secondary btn-sm btn-down fr-move-down" ${last ? 'disabled style="opacity:0.3"' : ''}>&darr;</button>
            </div>
            <button class="btn btn-secondary btn-sm fr-edit">${expanded ? 'Close' : 'Edit'}</button>
            <button class="btn btn-danger btn-sm fr-delete">Delete</button>
          </div>
          ${expanded ? '' : ''}
        </div>
      `)

      const wrap = card.firstElementChild

      wrap.querySelector('.fr-move-up').onclick = () => moveFrame(i, -1)
      wrap.querySelector('.fr-move-down').onclick = () => moveFrame(i, 1)

      wrap.querySelector('.fr-delete').onclick = async () => {
        const overlay = createElement(html`
          <div class="dialog-overlay">
            <div class="dialog-box">
              <h3>Delete Frame</h3>
              <p>Remove Frame ${i + 1}? This will also delete all its elements.</p>
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
          await deleteFrame(f.id)
          overlay.remove()
        }
      }

      wrap.querySelector('.fr-edit').onclick = () => toggleFrameExpand(f.id)

      list.appendChild(card)

      if (expanded) {
        const panel = renderFrameEditor(f, f.elements || [], {
          onUpdateFrame: updateFrame,
          addElement,
          updateElement,
          deleteElement,
          reorderElements,
        })
        list.appendChild(panel)
      }
    }
  }

  function showPreview() {
    const SCALE = 4
    const W = 128, H = 64
    let playing = false
    let speed = 1
    let currentFrameIdx = 0
    let animId = null
    let lastTick = 0

    const overlay = createElement(html`
      <div class="dialog-overlay">
        <div class="dialog-box" style="max-width:560px">
          <h3>Preview: ${currentSet?.label || 'Set'}</h3>
          <div class="preview-canvas-wrap">
            <canvas id="preview-canvas" width="${W * SCALE}" height="${H * SCALE}" style="width:${W * SCALE}px;height:${H * SCALE}px"></canvas>
          </div>
          <div class="preview-controls">
            <button class="btn btn-secondary btn-sm" id="pv-play">&#9654; Play</button>
            <button class="btn btn-secondary btn-sm" id="pv-stop">&#9632; Stop</button>
            <span style="font-size:12px;color:var(--text-muted)">Speed:</span>
            <select id="pv-speed" style="width:auto;padding:4px 8px">
              <option value="0.25">0.25x</option>
              <option value="0.5">0.5x</option>
              <option value="1" selected>1x</option>
              <option value="2">2x</option>
            </select>
            <span class="preview-progress" id="pv-progress">0 / ${frames.length}</span>
            <button class="btn btn-secondary btn-sm" id="pv-close">Close</button>
          </div>
        </div>
      </div>
    `)

    document.body.appendChild(overlay)

    const canvas = overlay.querySelector('#preview-canvas')
    const ctx = canvas.getContext('2d')
    const ctxScale = SCALE

    function renderFrame(frameIdx) {
      const frame = frames[frameIdx]
      if (!frame) return

      ctx.fillStyle = (frame.bgColor || '#000000').toLowerCase() === '#000000' ? '#1a1a2e' : frame.bgColor || '#000000'
      ctx.fillRect(0, 0, W * ctxScale, H * ctxScale)

      const elements = frame.elements || []
      for (let i = 0; i < elements.length; i++) {
        const el = elements[i]
        const x = (el.x || 0) * ctxScale
        const y = (el.y || 0) * ctxScale

        if (el.type === 'text') {
          ctx.fillStyle = el.color || '#FFFFFF'
          ctx.font = `${Math.round(8 * ctxScale)}px monospace`
          ctx.fillText(el.value || '', x, y + 8 * ctxScale)
        } else if (el.type === 'sprite') {
          ctx.fillStyle = '#555'
          ctx.fillRect(x, y, 16 * ctxScale, 16 * ctxScale)
          ctx.fillStyle = '#999'
          ctx.font = `${Math.round(6 * ctxScale)}px monospace`
          ctx.fillText('sprite', x + 2, y + 10 * ctxScale)
        } else if (el.type === 'datavalue') {
          ctx.fillStyle = el.color || '#FFFFFF'
          ctx.font = `${Math.round(6 * ctxScale)}px monospace`
          const label = el.label || ''
          ctx.fillText(label + (el.value || '--'), x, y + 6 * ctxScale)
        }
      }

      overlay.querySelector('#pv-progress').textContent = `${frameIdx + 1} / ${frames.length}`
    }

    function tick() {
      if (!playing || frames.length === 0) return
      const now = performance.now()
      const elapsed = now - lastTick
      const frame = frames[currentFrameIdx]
      const duration = (frame ? frame.durationMs : 1000) / speed

      if (elapsed >= duration) {
        currentFrameIdx = (currentFrameIdx + 1) % frames.length
        lastTick = now
        renderFrame(currentFrameIdx)
      }

      animId = requestAnimationFrame(tick)
    }

    function startPlay() {
      if (frames.length === 0) return
      playing = true
      lastTick = performance.now()
      overlay.querySelector('#pv-play').textContent = '⏸ Pause'
      animId = requestAnimationFrame(tick)
    }

    function stopPlay() {
      playing = false
      if (animId) cancelAnimationFrame(animId)
      animId = null
      overlay.querySelector('#pv-play').textContent = '▶ Play'
    }

    overlay.querySelector('#pv-play').onclick = () => {
      if (playing) { stopPlay() } else { startPlay() }
    }

    overlay.querySelector('#pv-stop').onclick = () => {
      stopPlay()
      currentFrameIdx = 0
      if (frames.length > 0) renderFrame(0)
    }

    overlay.querySelector('#pv-speed').onchange = () => {
      speed = parseFloat(overlay.querySelector('#pv-speed').value)
    }

    overlay.querySelector('#pv-close').onclick = () => {
      stopPlay()
      overlay.remove()
    }

    if (frames.length > 0) renderFrame(0)
  }

  function render() {
    const state = getState()
    let content = ''

    content += html`
      <a href="#groups/${groupId}" class="back-link" style="display:inline-block;margin-bottom:16px;color:var(--text-secondary)">&larr; Group</a>
    `

    if (state.error && !state.loading) {
      content += html`<div class="error-banner">${state.error}</div>`
    }

    if (state.loading) {
      content += '<div class="loading">Loading set</div>'
      container.innerHTML = content
      return
    }

    if (!currentSet) {
      content += '<div class="error-banner">Set not found</div>'
      container.innerHTML = content
      return
    }

    const cs = currentSet

    content += html`
      <div class="view-header">
        <h2>${cs.label}</h2>
        <button class="btn btn-secondary btn-sm" id="preview-set-btn" style="margin-left:auto">Preview</button>
      </div>

      <div id="unsaved-bar" class="unsaved-bar">You have unsaved changes</div>

      <div class="card">
        <div class="form-row">
          <div class="form-group">
            <label>Label</label>
            <input type="text" id="edit-set-label" value="${cs.label || ''}" placeholder="Happy Face">
          </div>
          <div class="form-group" style="flex:0 0 100px">
            <label>Loop Count</label>
            <input type="number" id="edit-set-loop" value="${cs.loopCount}" min="0" max="999">
            <div class="hint">0 = loop forever</div>
          </div>
          <div class="form-group" style="flex:0 0 120px">
            <label>Default Frame Time (ms)</label>
            <input type="number" id="edit-set-ftime" value="${cs.frameTime}" min="100" max="30000" step="100">
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="save-set-btn" disabled>Saved</button>
        </div>
      </div>

      <div class="section-header">
        <h3>Frames (${frames.length})</h3>
        <button class="btn btn-secondary btn-sm" id="add-frame-btn">+ Add Frame</button>
      </div>
      <div id="frames-list"></div>
    `

    container.innerHTML = content

    const labelInput = container.querySelector('#edit-set-label')
    const loopInput = container.querySelector('#edit-set-loop')
    const ftimeInput = container.querySelector('#edit-set-ftime')
    const saveBtn = container.querySelector('#save-set-btn')

    function checkDirty() {
      const dirty = labelInput.value !== (cs.label || '') ||
        parseInt(loopInput.value) !== (cs.loopCount) ||
        parseInt(ftimeInput.value) !== (cs.frameTime)
      if (dirty) {
        markDirty('set-form')
        saveBtn.textContent = 'Save'
        saveBtn.disabled = false
      } else {
        markClean('set-form')
        saveBtn.textContent = 'Saved'
        saveBtn.disabled = true
      }
    }

    labelInput.addEventListener('input', checkDirty)
    loopInput.addEventListener('input', checkDirty)
    ftimeInput.addEventListener('input', checkDirty)

    saveBtn.addEventListener('click', async () => {
      saveBtn.textContent = 'Saving...'
      saveBtn.disabled = true
      await saveSet(
        labelInput.value.trim(),
        parseInt(loopInput.value) || 1,
        parseInt(ftimeInput.value) || 1000
      )
      saveBtn.textContent = 'Saved'
    })

    container.querySelector('#preview-set-btn').onclick = showPreview

    container.querySelector('#add-frame-btn').onclick = () => {
      const existing = document.querySelector('#add-frame-form')
      if (existing) { existing.remove(); return }
      const list = container.querySelector('#frames-list')
      list.prepend(renderAddFrameForm())
    }

    renderFramesList()
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
