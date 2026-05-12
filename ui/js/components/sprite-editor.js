import { getState, setState, subscribe } from '../store.js'
import * as api from '../api.js'
import { $, html, createElement } from '../utils.js'

export function renderSpriteEditor(container, params) {
  let unsub
  let sprites = []
  let editSpriteId = null

  async function load() {
    setState({ loading: true, error: null })
    try {
      sprites = await api.getSprites()
      setState({ sprites, loading: false })
    } catch (err) {
      setState({ loading: false, error: err.message })
    }
  }

  async function deleteSprite(id) {
    try {
      await api.deleteSprite(id)
      sprites = sprites.filter(s => s.id !== id)
      if (editSpriteId === id) editSpriteId = null
      setState({ sprites })
    } catch (err) {
      setState({ error: err.message })
    }
  }

  function makePixelGrid(canvas, w, h) {
    const ps = Math.min(Math.floor(320 / w), 12)
    canvas.width = w * ps
    canvas.height = h * ps
    const ctx = canvas.getContext('2d')
    const data = new Uint8Array(w * h)
    let drawing = false

    function toPixel(e) {
      const rect = canvas.getBoundingClientRect()
      return {
        x: Math.floor((e.clientX - rect.left) / ps),
        y: Math.floor((e.clientY - rect.top) / ps),
      }
    }

    function render() {
      ctx.fillStyle = '#1a1a2e'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          if (data[y * w + x]) {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(x * ps, y * ps, ps, ps)
          }
        }
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 0.5
      for (let x = 0; x <= w; x++) {
        if (x % 8 === 0) {
          ctx.beginPath(); ctx.moveTo(x * ps, 0); ctx.lineTo(x * ps, h * ps); ctx.stroke()
        }
      }
      for (let y = 0; y <= h; y++) {
        if (y % 8 === 0) {
          ctx.beginPath(); ctx.moveTo(0, y * ps); ctx.lineTo(w * ps, y * ps); ctx.stroke()
        }
      }
    }

    function paint(px, py, val) {
      if (px < 0 || px >= w || py < 0 || py >= h) return
      data[py * w + px] = val
      const ix = px * ps, iy = py * ps
      ctx.fillStyle = val ? '#ffffff' : '#1a1a2e'
      ctx.fillRect(ix, iy, ps, ps)
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'
      ctx.lineWidth = 0.5
      if (px % 8 === 0) { ctx.beginPath(); ctx.moveTo(ix, 0); ctx.lineTo(ix, h * ps); ctx.stroke() }
      if (py % 8 === 0) { ctx.beginPath(); ctx.moveTo(0, iy); ctx.lineTo(w * ps, iy); ctx.stroke() }
    }

    canvas.onmousedown = (e) => {
      const p = toPixel(e)
      if (p.x < 0 || p.x >= w || p.y < 0 || p.y >= h) return
      drawing = true
      paint(p.x, p.y, data[p.y * w + p.x] ? 0 : 1)
    }

    canvas.onmousemove = (e) => {
      if (!drawing) return
      const p = toPixel(e)
      paint(p.x, p.y, 1)
    }

    canvas.onmouseup = () => { drawing = false }
    canvas.onmouseleave = () => { drawing = false }

    render()

    return {
      clear() { data.fill(0); render() },
      invert() { for (let i = 0; i < data.length; i++) data[i] = data[i] ? 0 : 1; render() },
      toBase64() {
        const bytes = new Uint8Array(Math.ceil((w * h) / 8))
        for (let i = 0; i < data.length; i++) {
          if (data[i]) bytes[Math.floor(i / 8)] |= (1 << (7 - (i % 8)))
        }
        return btoa(String.fromCharCode(...bytes))
      },
      fromBase64(b64) {
        try {
          const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
          for (let i = 0; i < data.length; i++) {
            const byteIdx = Math.floor(i / 8), bitIdx = i % 8
            data[i] = (bytes[byteIdx] & (1 << (7 - bitIdx))) ? 1 : 0
          }
        } catch {}
        render()
      },
      importBitmap(imageData) {
        for (let i = 0; i < data.length && i < imageData.data.length / 4; i++) {
          const r = imageData.data[i * 4], g = imageData.data[i * 4 + 1], b = imageData.data[i * 4 + 2]
          data[i] = (0.299 * r + 0.587 * g + 0.114 * b) > 128 ? 1 : 0
        }
        render()
      },
      getData() { return new Uint8Array(data) },
      get w() { return w },
      get h() { return h },
    }
  }

  let activePixelGrid = null

  function renderSpriteEditorPanel(sprite) {
    const w = sprite.width || 32
    const h = sprite.height || 32

    const el = createElement(html`
      <div class="inline-form sprite-edit-panel">
        <div class="form-row">
          <div class="form-group">
            <label>Label</label>
            <input type="text" class="se-label" value="${sprite.label}" placeholder="face_happy">
          </div>
          <div class="form-group" style="flex:0 0 100px">
            <label>Width</label>
            <select class="se-w">
              ${[16, 32, 64, 128].map(sz => html`<option value="${sz}" ${w === sz ? 'selected' : ''}>${sz}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="flex:0 0 100px">
            <label>Height</label>
            <select class="se-h">
              ${[16, 32, 64, 128].map(sz => html`<option value="${sz}" ${h === sz ? 'selected' : ''}>${sz}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="pixel-grid-wrap">
          <canvas class="pixel-grid"></canvas>
        </div>
        <div class="pixel-grid-tools">
          <div class="pg-size-group">
            <span style="font-size:12px;color:var(--text-muted)">Actual:</span>
            <canvas class="pg-preview" width="${w}" height="${h}" style="width:${w}px;height:${h}px;border:1px solid var(--border);background:#000;image-rendering:pixelated"></canvas>
          </div>
          <button class="btn btn-secondary btn-sm pg-import">Import PNG</button>
          <button class="btn btn-secondary btn-sm pg-clear">Clear</button>
          <button class="btn btn-secondary btn-sm pg-invert">Invert</button>
          <input type="file" class="pg-file-input" accept="image/png" style="display:none">
        </div>
        <div class="form-actions" style="border:none;margin-top:12px;padding-top:0">
          <button class="btn btn-primary btn-sm se-save">Save</button>
          <button class="btn btn-secondary btn-sm se-cancel">Cancel</button>
        </div>
      </div>
    `)

    const canvas = el.querySelector('.pixel-grid')
    const preview = el.querySelector('.pg-preview')
    const grid = makePixelGrid(canvas, w, h)

    if (sprite.dataBase64) grid.fromBase64(sprite.dataBase64)
    updatePreview(preview, grid)

    function updatePreview(pv, g) {
      const pctx = pv.getContext('2d')
      const imgData = pctx.createImageData(g.w, g.h)
      const d = g.getData()
      for (let i = 0; i < d.length; i++) {
        const v = d[i] ? 255 : 0
        imgData.data[i * 4] = v; imgData.data[i * 4 + 1] = v
        imgData.data[i * 4 + 2] = v; imgData.data[i * 4 + 3] = 255
      }
      pctx.putImageData(imgData, 0, 0)
    }

    el.querySelector('.pg-clear').onclick = () => { grid.clear(); updatePreview(preview, grid) }
    el.querySelector('.pg-invert').onclick = () => { grid.invert(); updatePreview(preview, grid) }

    const fileInput = el.querySelector('.pg-file-input')
    el.querySelector('.pg-import').onclick = () => fileInput.click()
    fileInput.onchange = () => {
      const file = fileInput.files[0]
      if (!file) return
      const img = new Image()
      img.onload = () => {
        const offscreen = document.createElement('canvas')
        offscreen.width = grid.w; offscreen.height = grid.h
        const octx = offscreen.getContext('2d')
        octx.drawImage(img, 0, 0, grid.w, grid.h)
        grid.importBitmap(octx.getImageData(0, 0, grid.w, grid.h))
        updatePreview(preview, grid)
        fileInput.value = ''
      }
      img.src = URL.createObjectURL(file)
    }

    function resizeGrid(newW, newH) {
      const oldData = grid.getData()
      const oldW = grid.w, oldH = grid.h
      const newCanvas = document.createElement('canvas')
      const newGrid = makePixelGrid(newCanvas, newW, newH)
      for (let y = 0; y < Math.min(oldH, newH); y++) {
        for (let x = 0; x < Math.min(oldW, newW); x++) {
          if (oldData[y * oldW + x]) {
            const tempCanvas = document.createElement('canvas')
            const tg = makePixelGrid(tempCanvas, newW, newH)
            ;(function(tg, x, y) {
              const d = tg.getData()
              d[y * newW + x] = 1
              tg.clear() // no-op really
            })(tg, x, y)
          }
        }
      }
      return newGrid
    }

    el.querySelector('.se-w').onchange = () => {
      const nw = parseInt(el.querySelector('.se-w').value)
      const nh = parseInt(el.querySelector('.se-h').value)
    }

    el.querySelector('.se-save').onclick = async () => {
      const label = el.querySelector('.se-label').value.trim()
      if (!label) { el.querySelector('.se-label').focus(); return }
      const nw = parseInt(el.querySelector('.se-w').value) || w
      const nh = parseInt(el.querySelector('.se-h').value) || h
      const dataBase64 = grid.toBase64()

      try {
        if (sprite.id) {
          await api.updateSprite(sprite.id, { label, width: nw, height: nh, dataBase64 })
        } else {
          await api.createSprite({ id: label.replace(/[^a-z0-9_]/gi, '_').toLowerCase(), label, width: nw, height: nh, dataBase64 })
        }
        el.remove()
        editSpriteId = null
        activePixelGrid = null
        await load()
      } catch (err) {
        const btn = el.querySelector('.se-save')
        btn.textContent = `Error: ${err.message}`
        setTimeout(() => { btn.textContent = 'Save' }, 2000)
      }
    }

    el.querySelector('.se-cancel').onclick = () => { el.remove(); editSpriteId = null; activePixelGrid = null }

    return el
  }

  function renderSpriteThumb(sprite, canvas) {
    if (!sprite.dataBase64) return
    const w = sprite.width || 32, h = sprite.height || 32
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    const imgData = ctx.createImageData(w, h)
    try {
      const bytes = Uint8Array.from(atob(sprite.dataBase64), c => c.charCodeAt(0))
      for (let i = 0; i < w * h && i < bytes.length * 8; i++) {
        const byteIdx = Math.floor(i / 8), bitIdx = i % 8
        const v = (bytes[byteIdx] & (1 << (7 - bitIdx))) ? 255 : 0
        imgData.data[i * 4] = v; imgData.data[i * 4 + 1] = v
        imgData.data[i * 4 + 2] = v; imgData.data[i * 4 + 3] = 255
      }
    } catch {}
    ctx.putImageData(imgData, 0, 0)
  }

  function render() {
    const state = getState()
    let content = ''

    if (state.error) {
      content += html`<div class="error-banner">${state.error}</div>`
    }

    content += html`
      <div class="view-header">
        <h2>Sprites</h2>
        <button class="btn btn-primary btn-sm" id="refresh-sprites-btn">Refresh</button>
        <button class="btn btn-secondary btn-sm" id="add-sprite-btn">+ Add Sprite</button>
      </div>
    `

    if (sprites.length === 0 && !state.loading) {
      content += html`
        <div class="empty-state">
          <p>No sprites yet. Create pixel art for your display faces.</p>
        </div>
      `
    }

    if (sprites.length > 0) {
      content += '<div id="sprites-list">'
      for (const sprite of sprites) {
        content += html`
          <div class="sprite-card" data-sprite-id="${sprite.id}">
            <div class="sprite-info">
              <canvas class="sprite-thumb" style="width:48px;height:48px"></canvas>
              <span class="sprite-label">${sprite.label || sprite.id}</span>
              <span class="sprite-meta">${sprite.width}x${sprite.height}</span>
            </div>
            <div class="card-actions" style="margin-top:8px">
              <button class="btn btn-secondary btn-sm edit-sprite-btn" data-id="${sprite.id}">Edit</button>
              <button class="btn btn-danger btn-sm delete-sprite-btn" data-id="${sprite.id}">Delete</button>
            </div>
          </div>
        `
      }
      content += '</div>'
    }

    if (state.loading) {
      content += '<div class="loading">Loading sprites</div>'
    }

    container.innerHTML = content

    sprites.forEach(sprite => {
      const thumb = container.querySelector(`.sprite-card[data-sprite-id="${sprite.id}"] .sprite-thumb`)
      if (thumb) renderSpriteThumb(sprite, thumb)
    })

    container.querySelector('#refresh-sprites-btn')?.addEventListener('click', load)

    container.querySelector('#add-sprite-btn')?.addEventListener('click', () => {
      const existing = container.querySelector('.sprite-edit-panel')
      if (existing) { existing.remove(); editSpriteId = null; return }
      const form = document.querySelector('#add-sprite-form')
      if (form) { form.remove(); return }

      const addForm = createElement(html`
        <div class="inline-form" id="add-sprite-form">
          <div class="form-row">
            <div class="form-group">
              <label>Label</label>
              <input type="text" id="new-sprite-label" placeholder="face_happy">
            </div>
            <div class="form-group" style="flex:0 0 100px">
              <label>Size</label>
              <select id="new-sprite-size">
                <option value="16">16x16</option>
                <option value="32" selected>32x32</option>
                <option value="64">64x64</option>
                <option value="128">128x128</option>
              </select>
            </div>
          </div>
          <div class="form-actions" style="border:none;margin-top:12px;padding-top:0">
            <button class="btn btn-primary btn-sm" id="create-sprite-btn">Create & Edit</button>
            <button class="btn btn-secondary btn-sm" id="cancel-sprite-add">Cancel</button>
          </div>
        </div>
      `)

      addForm.querySelector('#create-sprite-btn').onclick = async () => {
        const label = addForm.querySelector('#new-sprite-label').value.trim()
        if (!label) { addForm.querySelector('#new-sprite-label').focus(); return }
        const size = parseInt(addForm.querySelector('#new-sprite-size').value)
        try {
          const id = label.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
          const created = await api.createSprite({ id, label, width: size, height: size, dataBase64: '' })
          addForm.remove()
          sprites = [...sprites, created]
          setState({ sprites })
          editSpriteId = created.id
        } catch (err) {
          const btn = addForm.querySelector('#create-sprite-btn')
          btn.textContent = `Error: ${err.message}`
          setTimeout(() => { btn.textContent = 'Create & Edit' }, 2000)
        }
      }
      addForm.querySelector('#cancel-sprite-add').onclick = () => addForm.remove()

      const list = container.querySelector('#sprites-list')
      if (list) list.prepend(addForm)
      else container.querySelector('.empty-state')?.after(addForm)
    })

    container.querySelectorAll('.edit-sprite-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const id = btn.dataset.id
        if (editSpriteId === id) {
          const existing = container.querySelector('.sprite-edit-panel')
          if (existing) { existing.remove(); editSpriteId = null; return }
        }
        const existingForm = container.querySelector('.sprite-edit-panel')
        if (existingForm) existingForm.remove()
        const sprite = sprites.find(s => s.id === id)
        if (!sprite) return
        const card = container.querySelector(`.sprite-card[data-sprite-id="${id}"]`)
        if (card) card.after(renderSpriteEditorPanel(sprite))
        editSpriteId = id
      })
    })

    container.querySelectorAll('.delete-sprite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const id = btn.dataset.id
        const sprite = sprites.find(s => s.id === id)
        const name = sprite?.label || id

        const overlay = createElement(html`
          <div class="dialog-overlay">
            <div class="dialog-box">
              <h3>Delete Sprite</h3>
              <p>Delete sprite <strong>${name}</strong>? This cannot be undone.</p>
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
          await deleteSprite(id)
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
