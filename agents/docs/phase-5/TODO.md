# Phase 5: Web UI

**Overall Status:** 🟡 In Progress — tasks 5.0a–5.7 complete (2026-05-12)

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 5.0a | Init Vite project | `ui/package.json`, `ui/vite.config.js` | ✅ Done | Vite 6.x vanilla JS template. outDir → `../server/wwwroot`, API proxy → `localhost:5000`. Verified build: `npm run build` → 3 production assets. |
| 5.0 | Scaffold HTML + CSS | `ui/index.html`, `ui/css/style.css` | ✅ Done | Dark theme with CSS vars. Sidebar (240px) + main panel layout. Base components: cards, forms, buttons, dialog overlays, loading/error states. ~280 lines CSS. |
| 5.1 | API client | `ui/js/api.js` | ✅ Done | Fetch wrapper with error handling. 30+ exported functions covering all 36 server endpoints. Handles 204 → null, throws with .status property. |
| 5.2 | Node list | `ui/js/components/node-list.js` | ✅ Done | Node cards with MAC/name/description. Inline add-node form. Delete with confirmation dialog. Empty state + loading + error states. Refresh button. |
| 5.3 | Node editor | `ui/js/components/node-editor.js` | ✅ Done | Edit name/description with dirty tracking. Display list with inline add/edit/delete forms. Conditional bus config fields (i2c address vs SPI pins). Driver type dropdown. |
| 5.4 | Display editor | within node-editor (done) | ✅ Done | Completed as part of 5.3 — display add/edit form with driver dropdown, bus type toggle, conditional fields, resolution, rotation. |
| 5.13 | App controller | `ui/js/app.js`, `ui/js/store.js`, `ui/js/utils.js` | ✅ Done | Full app controller built upfront (not just minimal). Store with pub/sub, hash-based router, dirty-form tracking with sidebar indicator, navigation guard. |
| 5.5 | Assignment editor | `ui/js/components/assignment-editor.js` | ⬜ Not Started | Per-display: map triggers → groups. Default group picker. |
| 5.6 | Group list | `ui/js/components/group-list.js` | ✅ Done | Library section. List of groups with CRUD, inline add form, confirmation deletes. Loading/error/empty states. |
| 5.7 | Group editor | `ui/js/components/group-editor.js` | ✅ Done | Edit label with dirty tracking. Sets list with inline add/edit/delete forms. Reorder up/down. Loading/error/empty states. |
| 5.8 | Set editor | `ui/js/components/set-editor.js` | ⬜ Not Started | Frame list. Loop count, frame time. Add/reorder/delete frames. |
| 5.9 | Frame editor | `ui/js/components/frame-editor.js` | ⬜ Not Started | Type dropdown, value input, color picker, duration slider, x/y offset. |
| 5.10 | Sprite editor | `ui/js/components/sprite-editor.js` | ⬜ Not Started | Pixel grid canvas. Click to toggle. Grid size (16/32/64/128). Import PNG. Export. |
| 5.11 | Preview canvas | `ui/js/components/preview-canvas.js` | ⬜ Not Started | 128×64 OLED simulation. Play/pause, speed control. |
| 5.12 | Preset editor | `ui/js/components/preset-editor.js` | ⬜ Not Started | Create presets. Conditions (time, manual). Overrides (dim, group swaps). |

## Completed

| Date | Task | Details |
|------|------|---------|
| 2026-05-12 | 5.0a | Vite scaffold with package.json + vite.config.js. Dependencies installed. |
| 2026-05-12 | 5.0 | Dark theme CSS with custom properties, flexbox layout, card system, form controls, dialog overlays. |
| 2026-05-12 | 5.1 | Full API client covering all 36 server endpoints across 7 domains. |
| 2026-05-12 | 5.2 | Node list with CRUD, loading/error/empty states, confirmation dialogs. |
| 2026-05-12 | 5.3 | Node editor with dirty-tracked form, display CRUD with conditional bus config. |
| 2026-05-12 | 5.13 | Complete app controller with Store (pub/sub), router (hash-based), dirty-form guard. |
| 2026-05-12 | 5.6 | Group list with CRUD, inline add form, confirmation deletes, loading/error/empty states. |
| 2026-05-12 | 5.7 | Group editor with dirty-tracked label edit, sets list with inline add/edit/delete forms, reorder up/down. |

## Build Output (verified 2026-05-12)

```
server/wwwroot/
├── index.html                   1.18 kB
└── assets/
    ├── index-D7Lndj_a.css       7.24 kB
    └── index-Bn3cYneO.js       18.84 kB
```
