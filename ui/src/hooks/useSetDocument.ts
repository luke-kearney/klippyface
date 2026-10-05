import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { keys, useGroup } from '@/hooks/queries'
import { api, type ElementInput, type SetInput } from '@/lib/api'
import type { Frame, FrameElement, Set } from '@/lib/types'

const SAVE_DELAY = 350

const elementBody = (e: FrameElement): ElementInput => ({
  type: e.type,
  value: e.value,
  label: e.label,
  color: e.color,
  x: e.x,
  y: e.y,
  sortOrder: e.sortOrder,
})

/**
 * Local, optimistic copy of one set (frames + elements) for the editor.
 * Edits apply instantly; field edits are debounced per entity and saved in the
 * background. Each save bumps affected nodes' config, so devices update live.
 */
export function useSetDocument(groupId: string, setId: string) {
  const qc = useQueryClient()
  const query = useGroup(groupId)
  const [set, setSet] = useState<Set | null>(null)
  const [frames, setFrames] = useState<Frame[]>([])
  const [pending, setPending] = useState(0)
  const framesRef = useRef(frames)
  framesRef.current = frames
  const setRef = useRef(set)
  setRef.current = set
  const timers = useRef(new Map<string, { t: ReturnType<typeof setTimeout>; run: () => Promise<unknown> }>())
  const loadedFor = useRef<string | null>(null)

  useEffect(() => {
    if (!query.data || loadedFor.current === setId) return
    const s = query.data.sets?.find((x) => x.id === setId) ?? null
    loadedFor.current = setId
    setSet(s)
    setFrames(
      (s?.frames ?? []).map((f) => ({ ...f, elements: [...(f.elements ?? [])].sort((a, b) => a.sortOrder - b.sortOrder) })),
    )
  }, [query.data, setId])

  const track = useCallback(
    async <T>(p: Promise<T>): Promise<T | undefined> => {
      setPending((n) => n + 1)
      try {
        return await p
      } catch (e) {
        toast.error(`Save failed: ${(e as Error).message}`)
        return undefined
      } finally {
        setPending((n) => n - 1)
        qc.invalidateQueries({ queryKey: keys.group(groupId) })
      }
    },
    [qc, groupId],
  )

  const schedule = useCallback(
    (key: string, run: () => Promise<unknown>) => {
      const prev = timers.current.get(key)
      if (prev) clearTimeout(prev.t)
      const t = setTimeout(() => {
        timers.current.delete(key)
        track(run())
      }, SAVE_DELAY)
      timers.current.set(key, { t, run })
    },
    [track],
  )

  // Flush pending debounced saves when leaving the editor.
  useEffect(() => {
    const map = timers.current
    return () => {
      for (const { t, run } of map.values()) {
        clearTimeout(t)
        run().catch(() => {})
      }
      map.clear()
    }
  }, [])

  const findElement = (id: string) => {
    for (const f of framesRef.current) {
      const e = f.elements?.find((x) => x.id === id)
      if (e) return e
    }
  }

  const mapElements = (frameId: string, fn: (els: FrameElement[]) => FrameElement[]) =>
    setFrames((fs) => fs.map((f) => (f.id === frameId ? { ...f, elements: fn(f.elements ?? []) } : f)))

  /** Update an element locally; `save: false` defers persistence (e.g. mid-drag). */
  const updateElement = useCallback(
    (frameId: string, id: string, patch: Partial<FrameElement>, save = true) => {
      mapElements(frameId, (els) => els.map((e) => (e.id === id ? { ...e, ...patch } : e)))
      if (save)
        schedule(`el:${id}`, async () => {
          const e = findElement(id)
          if (e) await api.updateElement(id, elementBody(e))
        })
    },
    [schedule],
  )

  const addElement = useCallback(
    async (frameId: string, el: Omit<ElementInput, 'sortOrder'>) => {
      const frame = framesRef.current.find((f) => f.id === frameId)
      const sortOrder = Math.max(-1, ...(frame?.elements ?? []).map((e) => e.sortOrder)) + 1
      const created = await track(api.createElement(frameId, { ...el, sortOrder }))
      if (created) mapElements(frameId, (els) => [...els, created])
      return created
    },
    [track],
  )

  const deleteElement = useCallback(
    (frameId: string, id: string) => {
      const pendingSave = timers.current.get(`el:${id}`)
      if (pendingSave) {
        clearTimeout(pendingSave.t)
        timers.current.delete(`el:${id}`)
      }
      mapElements(frameId, (els) => els.filter((e) => e.id !== id))
      track(api.deleteElement(id))
    },
    [track],
  )

  const reorderElements = useCallback(
    (frameId: string, ids: string[]) => {
      mapElements(frameId, (els) =>
        ids.map((id, i) => ({ ...els.find((e) => e.id === id)!, sortOrder: i })).filter((e) => e.id),
      )
      track(api.reorderElements(frameId, ids))
    },
    [track],
  )

  const updateFrame = useCallback(
    (id: string, patch: Partial<Pick<Frame, 'durationMs' | 'bgColor'>>) => {
      setFrames((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)))
      schedule(`fr:${id}`, async () => {
        const f = framesRef.current.find((x) => x.id === id)
        if (f) await api.updateFrame(id, { durationMs: f.durationMs, bgColor: f.bgColor, sortOrder: f.sortOrder })
      })
    },
    [schedule],
  )

  const reorderFrames = useCallback(
    (ids: string[]) => {
      setFrames((fs) => ids.map((id, i) => ({ ...fs.find((f) => f.id === id)!, sortOrder: i })))
      track(api.reorderFrames(setId, ids))
    },
    [track, setId],
  )

  /** Insert a new frame after `index`, optionally copying another frame's contents. */
  const addFrame = useCallback(
    async (index: number, copyOf?: Frame) => {
      const base = copyOf ?? framesRef.current[index]
      const created = await track(
        api.createFrame(setId, {
          durationMs: base?.durationMs ?? set?.frameTime ?? 1000,
          bgColor: copyOf?.bgColor ?? '#000000',
          sortOrder: framesRef.current.length,
        }),
      )
      if (!created) return
      const elements: FrameElement[] = []
      for (const e of copyOf?.elements ?? []) {
        const c = await track(api.createElement(created.id, elementBody(e)))
        if (c) elements.push(c)
      }
      const frame = { ...created, elements }
      const next = [...framesRef.current]
      next.splice(index + 1, 0, frame)
      setFrames(next.map((f, i) => ({ ...f, sortOrder: i })))
      if (index + 1 !== next.length - 1) track(api.reorderFrames(setId, next.map((f) => f.id)))
      return frame
    },
    [track, setId, set?.frameTime],
  )

  const deleteFrame = useCallback(
    (id: string) => {
      setFrames((fs) => fs.filter((f) => f.id !== id))
      track(api.deleteFrame(id))
    },
    [track],
  )

  const updateSet = useCallback(
    (patch: Partial<SetInput>) => {
      setSet((s) => (s ? { ...s, ...patch } : s))
      schedule('set', async () => {
        const s = setRef.current
        if (s) await api.updateSet(s.id, { label: s.label, loopCount: s.loopCount, frameTime: s.frameTime, sortOrder: s.sortOrder })
      })
    },
    [schedule],
  )

  return {
    loading: query.isLoading || (!!query.data && loadedFor.current !== setId),
    error: query.error ?? (query.data && loadedFor.current === setId && !set ? new Error('Set not found') : null),
    group: query.data,
    set,
    frames,
    saving: pending > 0,
    updateElement,
    addElement,
    deleteElement,
    reorderElements,
    updateFrame,
    reorderFrames,
    addFrame,
    deleteFrame,
    updateSet,
  }
}

export type SetDocument = ReturnType<typeof useSetDocument>
