# Phase 3: Companion Server — Data Layer + Config API

**Overall Status:** ✅ COMPLETE — implemented 2026-05-11

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 3.0 | Scaffold .NET project | `server/Klippyface.Server.csproj`, `Program.cs` | ✅ Done | .NET 10 Minimal API + EF Core SQLite. CORS, static files, auto-migrate. Snake_case JSON. |
| 3.1 | EF models | `server/Models/Node.cs`, `NodeDisplay.cs`, `Assignment.cs`, `Group.cs`, `Set.cs`, `Frame.cs`, `FrameElement.cs`, `Sprite.cs`, `Preset.cs`, `NodePreset.cs` | ✅ Done | All 10 entities with navigation properties, [JsonIgnore] on parent refs. |
| 3.2 | DbContext | `server/Data/AppDbContext.cs`, `Data/Migrations/` | ✅ Done | Auto-migrate at startup. OnModelCreating with cascade deletes, unique indexes. Seed: 1 node, 2 displays, 2 groups, 2 sets, 5 frames, 5 elements, 4 sprites. |
| 3.3 | Nodes API | `server/Api/NodesApi.cs` | ✅ Done | CRUD. Unique MAC validation. |
| 3.4 | Displays API | within NodesApi.cs | ✅ Done | CRUD node_displays within a node. |
| 3.5 | Assignments API | within NodesApi.cs | ✅ Done | Upsert + GET per display. |
| 3.6 | Library API | `server/Api/LibraryApi.cs` | ✅ Done | CRUD groups/sets/frames/elements with cascade deletes and reorder endpoints. |
| 3.7 | Sprites API | `server/Api/SpritesApi.cs` | ✅ Done | CRUD. List excludes data_base64 for performance. |
| 3.8 | Presets API | `server/Api/PresetsApi.cs` | ✅ Done | CRUD. |
| 3.9 | Config export | `server/Api/ConfigApi.cs` | ✅ Done | `GET /api/config/node?mac=...` returns full per-node JSON matching PLAN.md contract. Verified via curl. |
| 3.10 | ConfigExportService | `server/Services/ConfigExportService.cs` | ✅ Done | Walks EF entities, constructs filtered JSON with `JsonObject`/`JsonArray`. Only includes referenced groups + sprites. |
