---
title: Web UI Architecture
type: reference
stable: true
---

# Web UI Architecture

React + TypeScript single-page app built with Vite and served by the .NET server from `server/wwwroot`.

## Stack

- **Build tool:** Vite (outDir → `../server/wwwroot`, dev proxy `/api` → `:5000`)
- **Language:** TypeScript (strict), React 19
- **Styling:** Tailwind CSS v4 + shadcn/ui components (Radix primitives), dark theme
- **Branding:** Nozzle orange (`#F54900`, `#FF6900` in dark) on zinc, with ink (not white) text on primary. Printer-state colours as `state-*` tokens. Fonts are self-hosted via Fontsource: Geist (UI), Geist Mono (`font-mono`), Silkscreen (`font-pixel`). Logo mark and pixel wordmark in `components/Logo.tsx`; favicons in `ui/public/`
- **Server state:** TanStack Query (`src/hooks/queries.ts`)
- **Routing:** React Router, hash-based (`#/nodes`, …) — the server has no SPA fallback
- **Toasts:** sonner

## Directory Layout

```
ui/
├── index.html
├── vite.config.ts
├── components.json              # shadcn/ui config (`npx shadcn add <name>`)
└── src/
    ├── main.tsx                 # Providers: QueryClient, Router, Tooltip, Toaster
    ├── router.tsx               # Route table
    ├── index.css                # Tailwind + theme tokens, brand palette, fonts
    ├── lib/
    │   ├── api.ts               # Typed REST client; snake_case ↔ camelCase key conversion
    │   ├── types.ts             # Mirrors server/Models
    │   ├── render.ts            # Software renderer mirroring firmware Renderer.cpp
    │   ├── font5x7.ts           # Adafruit GFX classic font (same glyphs as the device)
    │   └── sprite.ts            # 1bpp encode/decode (row stride ceil(w/8), MSB-left)
    ├── hooks/
    │   ├── queries.ts           # Query hooks + useApiMutation (toast on error)
    │   └── useSetDocument.ts    # Optimistic, debounced-save model for the set editor
    ├── components/
    │   ├── ui/                  # shadcn/ui primitives (generated)
    │   ├── AppLayout.tsx        # Sidebar nav + device list
    │   ├── common.tsx           # PageHeader, EmptyState, ConfirmDelete, badges…
    │   ├── DisplayPreview.tsx   # FrameCanvas, SetPlayer, display profiles
    │   ├── DisplayDialog.tsx    # Display wiring editor (I²C / SPI / parallel pins)
    │   ├── PixelEditor.tsx      # Sprite drawing canvas (pencil/eraser/fill/line/rect/text, placeable mirror lines, reference overlay)
    │   ├── SpriteThumb.tsx
    │   └── editor/              # Set editor: EditorCanvas, Inspector, Filmstrip
    └── pages/                   # One component per route
```

## Rendering previews

`lib/render.ts` reproduces what the panel draws so previews are pixel-accurate:

- Text and data values use the GFX 5×7 font at size 1 (6×8 cells) and are **centred** on x/y, as in `Renderer.cpp`. UTF-8 is printed byte-by-byte, so e.g. `°` renders as two glyphs, just like on the device.
- Data values show sample readings (`DATA_KEYS`), matching `PrinterState::resolve` formats.
- Sprites are drawn top-left at x/y.
- SH1106/SSD1306 are treated as monochrome: any non-black colour lights the pixel.

## Set editor

`#/groups/:groupId/sets/:setId` is a canvas editor: drag elements to move them (snapping to the panel centre/edges and other elements' edges and centres; toggle with the magnet, hold Alt to bypass), drop sprites from the palette, arrow keys nudge (Shift = 8px), Delete removes, Ctrl+D duplicates, Space plays, `[`/`]` step frames. The filmstrip reorders frames by drag. Onion skin overlays the previous frame by default; its picker can switch to the next frame or pin any frame in the group (marked in the filmstrip).

Edits are applied locally first and saved in the background (`useSetDocument`, 350 ms debounce per entity). Each save bumps the config version of nodes using the group, so assigned devices refresh live.

## Routes

| Hash | View |
|------|------|
| `#/nodes` | Node list |
| `#/nodes/{id}` | Node details, displays, assignments (with live preview) |
| `#/groups` | Groups with animated thumbnails |
| `#/groups/{id}` | Sets in a group |
| `#/groups/{gid}/sets/{sid}` | Set editor |
| `#/sprites` | Sprite library: folder sections (drag cards between them), search |
| `#/sprites/{id}` | Pixel editor; folder, description and ID rename; mirror lines and a reference sprite overlay in the side panel |
| `#/presets` | Presets |

## Dev Workflow

```bash
# Terminal 1: .NET server
cd server && dotnet run

# Terminal 2: Vite dev server (HMR)
cd ui && npm run dev            # → http://localhost:5173

# Type-check / production build
cd ui && npm run typecheck
cd ui && npm run build          # → server/wwwroot, served by dotnet run
```
