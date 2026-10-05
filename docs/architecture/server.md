---
title: Server Architecture
type: reference
stable: true
---

# Companion Server Architecture

.NET 10 minimal API with EF Core + SQLite.

## Project Structure

```
server/
├── Klippyface.Server.csproj
├── Program.cs                    # Minimal API, DI, CORS, static files
├── appsettings.json              # URLs, CORS config
├── Data/
│   ├── AppDbContext.cs           # EF Core + SQLite
│   ├── starter-pack.json         # Built-in faces (embedded resource)
│   └── Migrations/
├── Models/
│   ├── Node.cs
│   ├── NodeDisplay.cs
│   ├── Assignment.cs
│   ├── Group.cs
│   ├── Set.cs
│   ├── Frame.cs
│   ├── FrameElement.cs
│   ├── Sprite.cs
│   ├── Preset.cs
│   └── NodePreset.cs
├── Api/
│   ├── ConfigApi.cs              # GET /api/config/node?mac=...
│   ├── NodesApi.cs               # CRUD nodes + displays + assignments
│   ├── LibraryApi.cs             # CRUD groups/sets/frames
│   ├── SpritesApi.cs             # CRUD sprites + PNG import
│   └── PresetsApi.cs             # CRUD presets
└── Services/
    ├── ConfigExportService.cs    # Assemble per-node config JSON
    ├── StarterPackService.cs     # Import starter faces, default display assignment
    ├── SpriteConversionService.cs # PNG → XBM / PNG → RGB565
    └── NodeStatusService.cs      # Track online/offline, last seen
```

## Key Config

- CORS: Read from `Klippyface:Cors` appsettings section. `"*"` maps to `AllowAny*()`.
- Static files: Serves `wwwroot/` for the built Web UI.
- Auto-migrates SQLite at startup, then imports the starter pack if the library (groups and sprites) is empty.
- Starter pack: one group per printer state (`idle`, `printing`, `paused`, `error`, `complete`) plus `sleep`, built from the branding set. Faces are sprites; the status strip uses text and `datavalue` elements so values update live. Existing ids are never overwritten, so re-importing is safe.
- Snake_case JSON serialization for API responses.

## Docker Deployment

```dockerfile
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY server/ ./
COPY VERSION /VERSION
RUN dotnet publish -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=build /app .
EXPOSE 5000
VOLUME /app/data
ENTRYPOINT ["dotnet", "Klippyface.Server.dll"]
```

```bash
docker build -t klippyface-server -f server/Dockerfile .
docker run -d --restart=always -p 5000:5000 -v klippyface-data:/app/data --name klippyface klippyface-server
```
