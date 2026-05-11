# Klippyface — Agent Bootstrap Instructions

## CRITICAL: First actions in every new session

Before any code generation, answers, or planning:

1. **Read `agents/PLAN.md`** — specifically the **"Agent Workflow Instructions"** section (lines 972–1067). Follow its process for determining project state. Use the "Determining Project State" sub-section to identify where work should continue.

2. **Read `agents/CONVENTIONS.md`** — understand the coding conventions before writing or modifying any source files.

3. **Scan phase TODO files** — check `agents/docs/phase-*/TODO.md` files to determine:
   - Which phases are `✅ Done`
   - Which phase is `🟡 In Progress` (that's where work continues)
   - What specific tasks remain

4. **Report project state** — before starting work, summarize the current phase and the next actionable task.

## Key references

| File | Purpose |
|------|---------|
| `agents/PLAN.md` | Full architecture, data model, API, phase tasks, agent workflow |
| `agents/CONVENTIONS.md` | C++ coding standards, FreeRTOS patterns, logging format, git conventions |
| `agents/docs/phase-*/TODO.md` | Per-phase task tracking with status indicators |
| `agents/docs/phase-*/notes.md` | Implementation notes and gotchas (if exists) |
| `agents/docs/phase-*/decisions.md` | Design decisions recorded during implementation (if exists) |

## Project identity

- **Project:** Klippyface — multi-node ESP32 display system driven by Moonraker/Klipper
- **Firmware:** PlatformIO + Arduino core + FreeRTOS (C++)
- **Server:** .NET 10 + SQLite (minimal API)
- **Web UI:** Vanilla JS
- **Build commands:** See `platformio.ini` for env targets (e.g., `esp32dev`, `esp32dev-mock`)
