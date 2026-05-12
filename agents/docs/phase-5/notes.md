# Phase 5: Web UI — Implementation Notes

## Architecture

### Stack
- **Build tool:** Vite 6.x (vanilla JS template)
- **Language:** Vanilla JS (ES modules, no framework)
- **CSS:** Plain CSS with custom properties (dark theme)
- **State management:** Custom pub/sub store (~40 lines)
- **Routing:** Hash-based (`#nodes`, `#nodes/{id}`, `#groups`, `#groups/{id}`, `#groups/{gid}/sets/{sid}`, `#sprites`, `#sprites/{id}`, `#presets`, `#presets/{id}`)

### Directory Layout
```
ui/
├── package.json           # Vite project
├── vite.config.js         # Build → ../server/wwwroot, proxy /api → :5000
├── index.html             # Entry point (sidebar: Nodes, Library→Groups/Sprites, Presets)
├── css/
│   └── style.css          # All styles
├── js/
│   ├── app.js             # Router, view mounting, dirty-form guard
│   ├── store.js           # Central state (pub/sub + library fields)
│   ├── api.js             # 36 API endpoint wrappers
│   ├── utils.js           # $, $$, html template tag
│   └── components/
│       ├── node-list.js        # ✅ 5.2
│       ├── node-editor.js      # ✅ 5.3 (includes 5.4 display editor + 5.5 assignment editor)
│       ├── group-list.js       # ✅ 5.6
│       ├── group-editor.js     # ✅ 5.7
│       ├── set-editor.js       # ✅ 5.8 (includes 5.11 preview canvas)
│       ├── frame-editor.js     # ✅ 5.9
│       ├── sprite-editor.js    # ✅ 5.10
│       └── preset-editor.js    # ✅ 5.12
```

### Component Pattern
Each component is an object with:
- `mount(container)` — called once when view is entered. Sets up DOM + subscribes to store.
- `unmount()` — called when leaving view. Unsubscribes from store, cleans up DOM.
- Internal: `render()` — re-renders from current state (called by store subscription).

### State Shape (store.js)
```js
{
  nodes: [],              // Node[]
  currentNode: null,      // Node (with displays + assignments)
  displays: [],
  loading: false,
  error: null,
  dirtyForms: {},         // { [formId]: true/false }
  currentView: null,      // 'nodes' | 'node-editor' | 'groups' | 'group-editor' | 'set-editor' | 'sprites' | 'sprite-editor' | 'presets' | 'preset-editor'
  groups: [],             // Group[]
  currentGroup: null,     // Group (with sets, frames, elements)
  currentSet: null,
  frames: [],
  sprites: [],
  currentSprite: null,
  presets: [],
  currentPreset: null,
}
```

### API Client Pattern
- `request(method, path, body?)` base function
- Throws on non-2xx with `.status` property
- 204 → returns null
- ~30 exported named functions covering all endpoints

## Dev Workflow
```bash
# Terminal 1: .NET server
cd server && dotnet run

# Terminal 2: Vite dev server (HMR)
cd ui && npm run dev
# → http://localhost:5173 (proxies /api to :5000)

# Production build
cd ui && npm run build
# → outputs to server/wwwroot, served by dotnet run
```

## Constraints & Gotchas
- API returns snake_case JSON (configured in Program.cs)
- Group, Sprite, Preset use client-supplied string IDs (not GUIDs)
- BusConfig, TriggersJson, etc. are JSON strings in API but parsed to objects in config export
- Navigation properties are [JsonIgnore] — only appear on specific GET endpoints with .Include()
