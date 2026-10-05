# Klippyface — Agent Bootstrap Instructions

## First actions in every new session

1. **Read `docs/architecture/overview.md`** — system architecture, data flow, core concepts.
2. **Read `CONTRIBUTING.md`** — coding conventions before writing or modifying source files.
3. **Query GitHub Issues** — `gh issue list --state "open" --json number,title,labels` to see remaining tasks.
4. **Read relevant reference docs** — `docs/architecture/*.md`, `docs/reference/*.md` as needed.
5. **Report project state** — summarize open issues and the next actionable task.

## Key references

| File | Purpose |
|------|---------|
| `CONTRIBUTING.md` | Coding conventions, git conventions, review checklist |
| `docs/architecture/overview.md` | System diagram, data flow, core concepts |
| `docs/architecture/firmware.md` | FreeRTOS tasks, display driver, engine, sprites |
| `docs/architecture/server.md` | .NET project structure, EF models, services |
| `docs/architecture/frontend.md` | Web UI component tree, routing, preview |
| `docs/architecture/data-model.md` | SQLite schema, entity relationships |
| `docs/reference/api.md` | Full REST API reference + JSON contract |
| `docs/reference/gcode-macros.md` | GCODE macro reference |
| `docs/decisions/index.md` | Append-only design decision log |

## Task tracking

All tasks tracked as **GitHub Issues**. Labels: `area:firmware` `area:server` `area:webui` `area:infra` `area:docs`, `priority:p0-p3`, `status:*`, `type:*`.

Use `gh issue list`, `gh issue view <id>`, `gh issue create`, `gh issue close` to interact.

## Project identity

- **Project:** Klippyface — multi-node ESP32 display system driven by Moonraker/Klipper
- **Firmware:** PlatformIO + Arduino core + FreeRTOS (C++)
- **Server:** .NET 10 + SQLite (minimal API)
- **Web UI:** React + TypeScript + Vite (Tailwind, shadcn/ui)
- **Build commands:** See `platformio.ini` for env targets (`esp32dev`, `esp32dev-mock`)
