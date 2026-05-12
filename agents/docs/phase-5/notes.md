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
- Navigation properties were originally `[JsonIgnore]` — removed from forward (parent→child) nav props so `.Include()` results serialize. Back-references (child→parent) keep `[JsonIgnore]` to avoid circular refs.

## Fixes Applied During Testing

### 1. "+ Add Node" button does nothing
- **File:** `ui/js/components/node-list.js`
- **Root cause:** `#node-list` div was only rendered inside `if (state.nodes.length > 0)`. When no nodes exist, `container.querySelector('#node-list')?.prepend(...)` short-circuits because the element is absent.
- **Fix:** Always render `<div id="node-list">` (empty when no nodes), so the inline add form always has a DOM target.

### 2. POST/PUT data not persisted (camelCase / snake_case mismatch)
- **Files:** `ui/js/api.js` (frontend) and `server/Program.cs` (server)
- **Root cause:** Server uses `JsonNamingPolicy.SnakeCaseLower` for both serialization and deserialization. Frontend sent camelCase property names (e.g. `macAddress`) which didn't match the server's expected snake_case (`mac_address`). Properties silently deserialized to default values.
- **Fix:** Added `convertReqKeys()` in `api.js` that transforms all request body keys from camelCase to snake_case before `JSON.stringify()`. Also added `convertResKeys()` that transforms response keys from snake_case back to camelCase so frontend code can use JS conventions throughout.

### 3. Displays/Sets/Frames/Elements not showing in editors
- **Files:** `server/Models/Node.cs`, `server/Models/Group.cs`, `server/Models/Set.cs`, `server/Models/Frame.cs`
- **Root cause:** Forward navigation properties (`Node.Displays`, `Node.Assignments`, `Group.Sets`, `Set.Frames`, `Frame.Elements`) were marked `[JsonIgnore]`. Even though the detail endpoints loaded them via `.Include()`, `[JsonIgnore]` prevented serialization.
- **Fix:** Removed `[JsonIgnore]` from forward navigation properties. Back-references (child→parent: `Set.Group`, `Frame.Set`, `FrameElement.Frame`, etc.) retain `[JsonIgnore]` to prevent circular reference issues.

### 4. Edit button navigates to wrong view
- **File:** `ui/js/app.js`
- **Root cause:** `parseRoute()` returned `{ view: 'nodes' }` for both `#nodes` (list) and `#nodes/{id}` (editor). The `VIEWS` map had no `'node-editor'` entry.
- **Fix:** Route `#nodes/{id}` now returns `{ view: 'node-editor' }`. Added `'node-editor'` key to `VIEWS` mapping to `renderNodeEditor`. Updated nav-link activation to highlight Nodes sidebar entry when on the node-editor view.

### 5. Sprites lose pixel data after save
- **File:** `server/Api/SpritesApi.cs`
- **Root cause:** `GET /api/sprites` used `.Select()` that excluded `DataBase64` from the response. After saving and reloading the list, sprites came back with empty pixel data, so the editor opened with a blank grid.
- **Fix:** Removed the `.Select()` projection — the list endpoint now returns the full `Sprite` model including `DataBase64`.

### 6. Sprite editor limited to fixed sizes (16/32/64/128)
- **File:** `ui/js/components/sprite-editor.js`
- **Change:** Replaced width/height `<select>` dropdowns with `<input type="number">` allowing any size 1–256. Added proper resize handler that rebuilds the pixel grid and preview canvas on dimension change.

### 7. Preview canvas showed placeholder rectangles instead of sprite pixels
- **File:** `ui/js/components/set-editor.js`
- **Change:** Preview now loads the full sprite library via `api.getSprites()`, decodes 1bpp pixel data, and renders sprites at their true dimensions with element color. Falls back to a placeholder if sprite data is unavailable.
