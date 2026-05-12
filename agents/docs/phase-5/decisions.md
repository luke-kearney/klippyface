# Phase 5: Web UI — Design Decisions

## Decision Log

### 2026-05-12: Switch from vanilla JS to Vite

**Decision:** Use Vite 6.x as the build tool for the Web UI, with vanilla JS as the runtime language.

**Rationale:**
- Hot module replacement (HMR) during development dramatically speeds up iteration
- Native ES module imports without bundling in dev
- Production builds are automatically bundled + minified
- Low overhead — no framework lock-in, just a build tool

**Tradeoffs considered:**
- Adds npm dependency and a build step
- Vanilla JS is still the runtime — no React/Vue/Svelte complexity
- Vite config is minimal (20 lines)

**Files affected:**
- `ui/package.json` (new)
- `ui/vite.config.js` (new)
- `.gitignore` (node_modules, ui/dist, server/wwwroot)

---

### 2026-05-12: Hash-based routing

**Decision:** Use hash-based routing (`#nodes`, `#nodes/{id}`)

**Rationale:**
- No server-side configuration needed (works with any static file server)
- Simple to implement — just a `hashchange` listener
- The existing .NET server uses `UseDefaultFiles()` + `UseStaticFiles()` — adding hash routing support would require a fallback-to-index.html handler

**Alternatives considered:**
- History API (pushState) — cleaner URLs but requires server fallback
- No router (single page with show/hide) — doesn't scale to 10+ views

---

### 2026-05-12: Custom pub/sub store vs. lightweight framework

**Decision:** Build a minimal (~40 line) pub/sub state store.

**Rationale:**
- No external dependency
- Fits the scope — this is a config tool, not a complex app
- Components are simple enough that fine-grained reactivity isn't needed
- The store just needs: `getState()`, `setState(partial)`, `subscribe(fn)`

**Alternatives considered:**
- Preact or Svelte — overkill for a CRUD config UI
- Redux/Zustand — way too heavy
- No state management — leads to inconsistent UI

---

### 2026-05-12: Component pattern — mount/unmount with subscribe

**Decision:** Each component exposes `mount(container, store)` and `unmount()`.

**Rationale:**
- Clean lifecycle — DOM is created on mount, destroyed on unmount
- Store subscription is set up in mount, torn down in unmount
- No memory leaks from orphaned listeners

**Alternatives considered:**
- Render functions (pure, stateless) — simpler but requires parent to manage subscriptions
- Class-based components — unnecessary OOP for this scale

---

### 2026-05-12: Source directory as `ui/`, build output to `server/wwwroot/`

**Decision:** Vite source lives in `ui/` at project root; build outputs to `server/wwwroot/`.

**Rationale:**
- Clean separation — source code and build artifacts don't mix
- .NET server already has `UseDefaultFiles()` + `UseStaticFiles()` pointed at `wwwroot/`
- No changes needed to `Program.cs` — built files are served automatically
- `wwwroot/` is gitignored (build artifact)

**See also:** `agents/docs/phase-5/notes.md` for dev workflow details.

---

### 2026-05-12: Build full app.js (with state + dirty tracking) upfront

**Decision:** Rather than a minimal router now and full app controller later (task 5.13), build the complete app.js now.

**Rationale:**
- Avoids refactoring — the full store/router/dirty pattern is <200 lines
- Dirty-form tracking is immediately useful for node-editor (task 5.3)
- Components can subscribe to the store from the start
- The pattern won't change when adding remaining components

**Components of app.js:**
- Hash router with param extraction
- Store with pub/sub
- Dirty-form registration + navigation guard
- Sidebar state (active view highlighting)
