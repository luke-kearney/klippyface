import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { keys, useGroup } from '@/hooks/queries'
import { api, type ElementInput, type SetInput } from '@/lib/api'
import type { Frame, FrameElement, Set } from '@/lib/types'

const SAVE_DELAY = 350
/** Nodes are refreshed this long after the last saved edit (or on Sync now). */
export const SYNC_DELAY = 30_000

export type SyncStatus = 'synced' | 'pending' | 'syncing' | 'failed'

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
 * background. Saves don't reach nodes: the group is published (nodes refresh)
 * SYNC_DELAY after the last save, on `sync.now()`, or when leaving the editor.
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
  const inflight = useRef(new globalThis.Set<Promise<unknown>>())
  const loadedFor = useRef<string | null>(null)

  const [sync, setSync] = useState<{ status: SyncStatus; dueAt: number | null }>({ status: 'synced', dueAt: null })
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Bumped per saved edit, so a publish can tell whether edits landed while it ran.
  const editGen = useRef(0)
  const dirty = useRef(false)
  const syncNowRef = useRef<() => Promise<void>>(async () => {})

  const markDirty = useCallback(() => {
    editGen.current++
    dirty.current = true
    clearTimeout(syncTimer.current)
    syncTimer.current = setTimeout(() => syncNowRef.current(), SYNC_DELAY)
    setSync({ status: 'pending', dueAt: Date.now() + SYNC_DELAY })
  }, [])

  useEffect(() => {
    if (!query.data || loadedFor.current === setId) return
    const s = query.data.sets?.find((x) => x.id === setId) ?? null
    loadedFor.current = setId
    // Unsynced edits left by an earlier session: start the countdown for them too.
    if (query.data.pendingPublish) markDirty()
    setSet(s)
    setFrames(
      (s?.frames ?? []).map((f) => ({ ...f, elements: [...(f.elements ?? [])].sort((a, b) => a.sortOrder - b.sortOrder) })),
    )
  }, [query.data, setId, markDirty])

  const track = useCallback(
    async <T>(p: Promise<T>): Promise<T | undefined> => {
      setPending((n) => n + 1)
      inflight.current.add(p)
      try {
        const r = await p
        markDirty()
        return r
      } catch (e) {
        toast.error(`Save failed: ${(e as Error).message}`)
        return undefined
      } finally {
        inflight.current.delete(p)
        setPending((n) => n - 1)
        qc.invalidateQueries({ queryKey: keys.group(groupId) })
      }
    },
    [qc, groupId, markDirty],
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

  /** Run debounced saves now and wait for every save in flight. */
  const flush = useCallback(async () => {
    for (const [key, { t, run }] of timers.current) {
      clearTimeout(t)
      timers.current.delete(key)
      track(run())
    }
    while (inflight.current.size) await Promise.allSettled([...inflight.current])
  }, [track])

  /** Save everything, then refresh nodes showing the group. */
  const syncNow = useCallback(async () => {
    clearTimeout(syncTimer.current)
    await flush()
    if (!dirty.current) return
    const gen = editGen.current
    setSync({ status: 'syncing', dueAt: null })
    try {
      await api.publishGroup(groupId)
      qc.invalidateQueries({ queryKey: keys.groups })
      // Edits saved meanwhile re-armed the timer; leave their countdown running.
      if (editGen.current === gen) {
        dirty.current = false
        setSync({ status: 'synced', dueAt: null })
      }
    } catch (e) {
      // The server's idle publish still delivers these; the user can retry sooner.
      toast.error(`Sync failed: ${(e as Error).message}`)
      if (editGen.current === gen) setSync({ status: 'failed', dueAt: null })
    }
  }, [flush, groupId, qc])
  syncNowRef.current = syncNow

  // Leaving the editor: save debounced edits, then publish (fire and forget).
  // Closing the tab: publish via beacon if everything is saved, else warn.
  useEffect(() => {
    const map = timers.current
    const live = inflight.current
    const onUnload = (e: BeforeUnloadEvent) => {
      if (map.size || live.size) e.preventDefault()
      else if (dirty.current) navigator.sendBeacon(`/api/groups/${encodeURIComponent(groupId)}/publish`)
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      clearTimeout(syncTimer.current)
      const runs = [...map.values()].map(({ t, run }) => {
        clearTimeout(t)
        return run()
      })
      map.clear()
      if (!runs.length && !live.size && !dirty.current) return
      Promise.allSettled([...runs, ...live])
        .then(() => api.publishGroup(groupId))
        .then(() => qc.invalidateQueries({ queryKey: keys.groups }))
        .catch(() => {})
    }
  }, [groupId, qc])

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
      const created = await track(
        api.createFrame(setId, {
          // Duplicates keep their timing; blank frames start at the set's default.
          durationMs: copyOf?.durationMs || set?.frameTime || 1000,
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
        if (s) await api.updateSet(s.id, { label: s.label, description: s.description, loopCount: s.loopCount, frameTime: s.frameTime, sortOrder: s.sortOrder })
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
    sync: { ...sync, now: syncNow },
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
