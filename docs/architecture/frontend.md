---
title: Web UI Architecture
type: reference
stable: true
---

# Web UI Architecture

Vanilla JS single-page app built with Vite.

## Stack

- **Build tool:** Vite 6.x (vanilla JS template, outDir → `../server/wwwroot`)
- **Language:** Vanilla JS (ES modules, no framework)
- **CSS:** Plain CSS with custom properties (dark theme)
- **State management:** Custom pub/sub store (~40 lines)
- **Routing:** Hash-based (`#nodes`, `#nodes/{id}`, `#groups`, etc.)

## Directory Layout

```
ui/
├── package.json
├── vite.config.js              # Build → ../server/wwwroot, proxy /api → :5000
├── index.html
├── css/
│   └── style.css               # Dark theme, flexbox layout, card system
├── js/
│   ├── app.js                  # Router, view mounting, dirty-form guard
│   ├── store.js                # Central state (pub/sub + dirty tracking)
│   ├── api.js                  # 36 API endpoint wrappers with snake_case conversion
│   ├── utils.js                # $, $$, html template tag
│   └── components/
│       ├── node-list.js        # Node cards, inline add, delete
│       ├── node-editor.js      # Edit name/description, display CRUD, assignment editor
│       ├── group-list.js       # Group cards, inline add, delete
│       ├── group-editor.js     # Edit label, sets list, reorder
│       ├── set-editor.js       # Edit metadata, frame list, preview canvas
│       ├── frame-editor.js     # Duration, bg color, element CRUD
│       ├── sprite-editor.js    # Pixel grid, PNG import, 1bpp encoding
│       └── preset-editor.js    # Conditions, overrides
└── public/
```

## Component Pattern

Each component exposes `mount(container, store)` and `unmount()`:
- `mount()` — creates DOM, subscribes to store
- `unmount()` — removes DOM, unsubscribes from store

## Routes

| Hash | View |
|------|------|
| `#nodes` | Node list |
| `#nodes/{id}` | Node editor |
| `#groups` | Group list |
| `#groups/{id}` | Group editor |
| `#groups/{gid}/sets/{sid}` | Set editor |
| `#sprites` | Sprite list |
| `#sprites/{id}` | Sprite editor |
| `#presets` | Preset list/editor |

## Dev Workflow

```bash
# Terminal 1: .NET server
cd server && dotnet run

# Terminal 2: Vite dev server (HMR)
cd ui && npm run dev

# Production build
cd ui && npm run build
# → outputs to server/wwwroot, served by dotnet run
```

## UI Layout

```
┌─────────────────────────────────────────────────────┐
│  Klippyface Display Manager                     [v] │
├──────────┬──────────────────────────────────────────┤
│ SIDEBAR  │  MAIN PANEL                              │
│          │                                          │
│  ○ Nodes │  [Content changes based on sidebar]      │
│    ├─ printer_face                                  │
│    ├─ desk_panel    ┌──────────────────────────┐    │
│    └─ bedroom       │  OLED Preview (128×64)   │    │
│          │          │  ┌──────────────────┐    │    │
│  ○ Library│         │  │  :D              │    │    │
│    ├─ Groups        │  │                  │    │    │
│    └─ Sprites       │  └──────────────────┘    │    │
│          │          │  ▶ Play  ⏹ Stop  ⏪ ⏩   │    │
│  ○ Presets          └──────────────────────────┘    │
│          │                                          │
└──────────┴──────────────────────────────────────────┘
```
