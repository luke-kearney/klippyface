# Phase 3: Companion Server — Data Layer + Config API

**Overall Status:** NOT STARTED

| # | Task | Files | Status | Notes |
|---|------|-------|--------|-------|
| 3.0 | Scaffold .NET project | `server/Klippyface.Server.csproj`, `Program.cs` | ⬜ Not Started | Minimal API + EF Core SQLite. |
| 3.1 | EF models | `server/Models/*.cs` | ⬜ Not Started | All 8 entities with navigation properties. |
| 3.2 | DbContext | `server/Data/AppDbContext.cs` | ⬜ Not Started | Auto-migrate at startup. Seed default node + data. |
| 3.3 | Nodes API | `server/Api/NodesApi.cs` | ⬜ Not Started | CRUD. Register node by MAC. |
| 3.4 | Displays API | within NodesApi or separate | ⬜ Not Started | CRUD node_displays within a node. |
| 3.5 | Assignments API | within NodesApi or separate | ⬜ Not Started | CRUD assignments per display per node. |
| 3.6 | Library API | `server/Api/LibraryApi.cs` | ⬜ Not Started | CRUD groups/sets/frames. |
| 3.7 | Sprites API | `server/Api/SpritesApi.cs` | ⬜ Not Started | CRUD. PNG upload endpoint that converts to native format. |
| 3.8 | Presets API | `server/Api/PresetsApi.cs` | ⬜ Not Started | CRUD. |
| 3.9 | Config export | `server/Api/ConfigApi.cs` | ⬜ Not Started | `GET /api/config/node?mac=...` — the endpoint ESP32 calls. |
| 3.10 | ConfigExportService | `server/Services/ConfigExportService.cs` | ⬜ Not Started | Walks EF entities, constructs filtered JSON. |
