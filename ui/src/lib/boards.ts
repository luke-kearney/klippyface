import type { BoardPreset } from './types'

// Board presets come from the server (GET /api/boards/presets).

/** The preset to start from for a node, when its board has exactly one (same rule as the server). */
export function defaultPresetFor(presets: BoardPreset[] | undefined, board: string | undefined): BoardPreset | undefined {
  const matches = (presets ?? []).filter((p) => p.board === board)
  return matches.length === 1 ? matches[0] : undefined
}

/** The preset's pins and options, as the display dialog edits them. */
export function presetBusConfig(p: BoardPreset): Record<string, number | string | boolean> {
  try {
    return JSON.parse(p.busConfig)
  } catch {
    return {}
  }
}
