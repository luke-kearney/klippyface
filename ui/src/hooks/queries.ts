import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query'
import { toast } from 'sonner'
import { api, uniqueId, type SpriteInput } from '@/lib/api'
import { decodeSprite, type Bitmap } from '@/lib/sprite'
import type { Sprite } from '@/lib/types'

export const keys = {
  nodes: ['nodes'] as const,
  node: (id: string) => ['nodes', id] as const,
  groups: ['groups'] as const,
  group: (id: string) => ['groups', id] as const,
  sprites: ['sprites'] as const,
  presets: ['presets'] as const,
}

export const useNodes = () =>
  useQuery({ queryKey: keys.nodes, queryFn: api.getNodes, refetchInterval: 10_000 })

export const useNode = (id: string) =>
  useQuery({ queryKey: keys.node(id), queryFn: () => api.getNode(id), refetchInterval: 10_000 })

export const useGroups = () => useQuery({ queryKey: keys.groups, queryFn: api.getGroups })

export const useGroup = (id: string) => useQuery({ queryKey: keys.group(id), queryFn: () => api.getGroup(id) })

export const useSprites = () => useQuery({ queryKey: keys.sprites, queryFn: api.getSprites })

export const usePresets = () => useQuery({ queryKey: keys.presets, queryFn: api.getPresets })

/** All sprites decoded to bitmaps, keyed by sprite id. */
export function useSpriteBitmaps(): Map<string, Bitmap> {
  const { data } = useSprites()
  return useMemo(
    () => new Map((data ?? []).map((s) => [s.id, decodeSprite(s.dataBase64, s.width, s.height)])),
    [data],
  )
}

/** Mutation that toasts on failure and invalidates the given keys on success. */
export function useApiMutation<TArgs, TResult>(
  fn: (args: TArgs) => Promise<TResult>,
  opts: { invalidate?: QueryKey[]; success?: string; onSuccess?: (r: TResult, args: TArgs) => void } = {},
) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (r, args) => {
      opts.invalidate?.forEach((k) => qc.invalidateQueries({ queryKey: k }))
      if (opts.success) toast.success(opts.success)
      opts.onSuccess?.(r, args)
    },
    onError: (e: Error) => toast.error(e.message),
  })
}

/** Copy a sprite (or unsaved edits of one) under a fresh `<id>_copy[_N]` id. */
export function useDuplicateSprite(onDone?: (s: Sprite) => void) {
  const qc = useQueryClient()
  return useApiMutation(
    async (src: SpriteInput) => {
      const existing = (qc.getQueryData<Sprite[]>(keys.sprites) ?? (await api.getSprites())).map((s) => s.id)
      // Copying a copy numbers it ("x copy 2") instead of stacking "copy copy".
      const idBase = `${src.id.replace(/_copy(_\d+)?$/, '')}_copy`
      const id = uniqueId(idBase, existing)
      const n = id.slice(idBase.length + 1)
      const labelBase = (src.label || src.id).replace(/ copy( \d+)?$/, '')
      return api.createSprite({
        id,
        label: `${labelBase} copy${n ? ` ${n}` : ''}`,
        folder: src.folder,
        description: src.description,
        width: src.width,
        height: src.height,
        dataBase64: src.dataBase64,
      })
    },
    {
      invalidate: [keys.sprites],
      onSuccess: (s) => {
        // Seed the cache so the editor can open the copy before the list refetches.
        qc.setQueryData<Sprite[]>(keys.sprites, (old) => (old ? [...old, s] : [s]))
        toast.success(`Duplicated as “${s.label}”`)
        onDone?.(s)
      },
    },
  )
}
