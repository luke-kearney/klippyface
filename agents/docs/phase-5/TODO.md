# Phase 5: Web UI

**Overall Status:** 🟡 In Progress — scaffolding (2026-05-12)

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 5.0a | Init Vite project | `ui/package.json`, `ui/vite.config.js` | 🟡 In Progress | Vite vanilla JS template. outDir → `../server/wwwroot`, API proxy → `localhost:5000`. |
| 5.0 | Scaffold HTML + CSS | `ui/index.html`, `ui/css/style.css` | ⬜ Not Started | Dark theme. Sidebar + main panel layout. |
| 5.1 | API client | `ui/js/api.js` | ⬜ Not Started | Fetch wrapper. All endpoints. Error handling. |
| 5.2 | Node list | `ui/js/components/node-list.js` | ⬜ Not Started | Cards showing MAC, name, online/offline, description. |
| 5.3 | Node editor | `ui/js/components/node-editor.js` | ⬜ Not Started | Edit name, description. Add/configure displays. |
| 5.4 | Display editor | within node-editor | ⬜ Not Started | Per-display: driver type dropdown, bus config, resolution, rotation. |
| 5.5 | Assignment editor | `ui/js/components/assignment-editor.js` | ⬜ Not Started | Per-display: map triggers → groups. Default group picker. |
| 5.6 | Group list | `ui/js/components/group-list.js` | ⬜ Not Started | Library section. List of groups. |
| 5.7 | Group editor | `ui/js/components/group-editor.js` | ⬜ Not Started | Sets list. Add/reorder/delete sets. |
| 5.8 | Set editor | `ui/js/components/set-editor.js` | ⬜ Not Started | Frame list. Loop count, frame time. Add/reorder/delete frames. |
| 5.9 | Frame editor | `ui/js/components/frame-editor.js` | ⬜ Not Started | Type dropdown, value input, color picker, duration slider, x/y offset. |
| 5.10 | Sprite editor | `ui/js/components/sprite-editor.js` | ⬜ Not Started | Pixel grid canvas. Click to toggle. Grid size (16/32/64/128). Import PNG. Export. |
| 5.11 | Preview canvas | `ui/js/components/preview-canvas.js` | ⬜ Not Started | 128×64 OLED simulation. Play/pause, speed control. |
| 5.12 | Preset editor | `ui/js/components/preset-editor.js` | ⬜ Not Started | Create presets. Conditions (time, manual). Overrides (dim, group swaps). |
| 5.13 | App controller | `ui/js/app.js` | ⬜ Not Started | Client-side routing. State management. Unsaved changes indicator. |
