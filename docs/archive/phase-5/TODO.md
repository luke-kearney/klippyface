# Phase 5: Web UI

**Overall Status:** ✅ Complete — All 14 tasks finished (2026-05-12)

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 5.0a | Init Vite project | `ui/package.json`, `ui/vite.config.js` | ✅ Done | Vite 6.x vanilla JS template. outDir → `../server/wwwroot`, API proxy → `localhost:5000`. Verified build: `npm run build` → 3 production assets. |
| 5.0 | Scaffold HTML + CSS | `ui/index.html`, `ui/css/style.css` | ✅ Done | Dark theme with CSS vars. Sidebar (240px) + main panel layout. Base components: cards, forms, buttons, dialog overlays, loading/error states. ~280 lines CSS. |
| 5.1 | API client | `ui/js/api.js` | ✅ Done | Fetch wrapper with error handling. 30+ exported functions covering all 36 server endpoints. Handles 204 → null, throws with .status property. |
| 5.2 | Node list | `ui/js/components/node-list.js` | ✅ Done | Node cards with MAC/name/description. Inline add-node form. Delete with confirmation dialog. Empty state + loading + error states. Refresh button. |
| 5.3 | Node editor | `ui/js/components/node-editor.js` | ✅ Done | Edit name/description with dirty tracking. Display list with inline add/edit/delete forms. Conditional bus config fields (i2c address vs SPI pins). Driver type dropdown. |
| 5.4 | Display editor | within node-editor (done) | ✅ Done | Completed as part of 5.3 — display add/edit form with driver dropdown, bus type toggle, conditional fields, resolution, rotation. |
| 5.5 | Assignment editor | within node-editor (integrated) | ✅ Done | Per-display "Assignment" button opens dialog. Default group dropdown, trigger-to-group mapping for 5 printer states. Fetches existing assignment on open. Integrated into `node-editor.js`. |
| 5.6 | Group list | `ui/js/components/group-list.js` | ✅ Done | Library section. List of groups with CRUD, inline add form, confirmation deletes. Loading/error/empty states. |
| 5.7 | Group editor | `ui/js/components/group-editor.js` | ✅ Done | Edit label with dirty tracking. Sets list with inline add/edit/delete forms. Reorder up/down. Loading/error/empty states. |
| 5.8 | Set editor | `ui/js/components/set-editor.js` | ✅ Done | Full view — edit label/loopCount/frameTime with dirty tracking. Frame list with add/reorder/delete. Inline frame editor panels via frame-editor.js. Preview canvas dialog overlay (128×64, 4x scale, play/pause/stop/speed). Loading/error/empty states. Route: `#groups/{gid}/sets/{sid}`. |
| 5.9 | Frame editor | `ui/js/components/frame-editor.js` | ✅ Done | Inline panel within set editor. Duration range slider (100-10000ms) with debounced save. BG color picker. Element CRUD with type dropdown, value/label/color/x/y fields. Element type badges, reorder, delete with confirmation. |
| 5.10 | Sprite editor | `ui/js/components/sprite-editor.js` | ✅ Done | Pixel grid canvas with click/drag painting. Grid sizes: 16/32/64/128. 1bpp base64 encoding. Grid lines every 8px. Import PNG (scaled to grid). Clear/invert. Actual-size preview. List with rendered thumbnails. |
| 5.11 | Preview canvas | integrated into set-editor.js | ✅ Done | 128×64 (×4 scale) dialog overlay in set-editor. Renders current set's frames in sequence with text/sprite/datavalue elements. Play/Pause, Stop, speed control slider. |
| 5.12 | Preset editor | `ui/js/components/preset-editor.js` | ✅ Done | List view with inline edit forms. Condition types: Manual/Time Range with start/end time. Overrides: dim brightness, group swaps (add/remove rows). |
| 5.13 | App controller | `ui/js/app.js`, `ui/js/store.js`, `ui/js/utils.js` | ✅ Done | Full app controller built upfront (not just minimal). Store with pub/sub, hash-based router, dirty-form tracking with sidebar indicator, navigation guard. Routes: `#nodes`, `#nodes/{id}`, `#groups`, `#groups/{id}`, `#groups/{gid}/sets/{sid}`, `#sprites`, `#sprites/{id}`, `#presets`, `#presets/{id}`. |

## Completed

| Date | Task | Details |
|------|------|---------|
| 2026-05-12 | 5.0a | Vite scaffold with package.json + vite.config.js. Dependencies installed. |
| 2026-05-12 | 5.0 | Dark theme CSS with custom properties, flexbox layout, card system, form controls, dialog overlays. |
| 2026-05-12 | 5.1 | Full API client covering all 36 server endpoints across 7 domains. |
| 2026-05-12 | 5.2 | Node list with CRUD, loading/error/empty states, confirmation dialogs. |
| 2026-05-12 | 5.3 | Node editor with dirty-tracked form, display CRUD with conditional bus config. |
| 2026-05-12 | 5.5 | Assignment editor integrated into node-editor.js — default group dropdown, trigger-to-group mapping for 5 printer states. |
| 2026-05-12 | 5.6 | Group list with CRUD, inline add form, confirmation deletes, loading/error/empty states. |
| 2026-05-12 | 5.7 | Group editor with dirty-tracked label edit, sets list with inline add/edit/delete forms, reorder up/down. |
| 2026-05-12 | 5.8 | Set editor view with dirty-tracked metadata form, frame list CRUD (add/reorder/delete), inline frame editor panels. Route `#groups/{gid}/sets/{sid}`. |
| 2026-05-12 | 5.9 | Inline frame editor panel. Duration slider (100-10000ms), bg color picker, element CRUD with type/text/color/x/y fields, type badges, reorder, debounced frame save. |
| 2026-05-12 | 5.10 | Sprite editor with pixel grid canvas, click/drag painting, PNG import, 1bpp encoding, grid sizes 16/32/64/128. |
| 2026-05-12 | 5.11 | OLED preview canvas integrated into set-editor — 128×64 (×4 scale), play/pause/stop/speed, renders all element types. |
| 2026-05-12 | 5.12 | Preset editor with list view, inline edit, condition types (Manual/Time Range), overrides (dim, group swaps). |
| 2026-05-12 | 5.13 | Complete app controller with Store (pub/sub), router (hash-based, 8 routes), dirty-form guard. |

## Build Output (verified 2026-05-12)

```
server/wwwroot/
├── index.html                   1.18 kB
└── assets/
    ├── index-vRlzt11w.css      12.06 kB
    └── index-CaR7yWXw.js       56.14 kB
```
