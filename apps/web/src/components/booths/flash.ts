import { useEffect, useState } from 'react'
import { boothAt, formalOf, type BoothRow } from './model'
import type { EvcGroup } from './evc'

/** How long the rings stay on screen after a tick lands. */
export const FLASH_MS = 1800

const figures = (r: BoothRow | null): string => (r === null ? '' : JSON.stringify(r.fp))

/**
 * VE-288: the booths whose figures changed between two ticks (a first report counts). The booth history is append-only
 * and holds a row only when a booth's figures were published, so comparing the state at the two times is enough.
 * A centre drawn as one dot (an early voting centre) is named by its first id, the dot's `pick`.
 */
export function changedBoothIds(byBooth: ReadonlyMap<number, readonly BoothRow[]>, prevAt: number, at: number, evc: readonly EvcGroup[] = []): Set<number> {
  const out = new Set<number>()
  const moved = (id: number): boolean => {
    const rows = byBooth.get(id) as BoothRow[] | undefined
    const now = boothAt(rows, at)
    return now !== null && formalOf(now.fp) > 0 && figures(now) !== figures(boothAt(rows, prevAt))
  }
  for (const id of byBooth.keys()) if (moved(id)) out.add(id)
  for (const g of evc) if (g.ids.some((id) => out.has(id))) out.add(g.ids[0]!)
  return out
}

interface Args {
  /** The shown tick's index and time. */
  idx: number
  at: number
  /** Only in Polling places, with its data loaded; otherwise no rings. */
  data: { byBooth: ReadonlyMap<number, readonly BoothRow[]>; evcGroups: readonly EvcGroup[] } | null
  /** Reduced motion: the dot's new colour alone says it. */
  reduced: boolean
}

/**
 * The booth ids to ring for a moment after the clock moves forward one tick (never on a scrub, a jump or a step back,
 * as with the other update cues). The previous tick is kept in state and compared during render so the ids arrive in the same
 * commit as the new figures.
 */
export function useBoothFlash({ idx, at, data, reduced }: Args): ReadonlySet<number> | null {
  const [track, setTrack] = useState<{ idx: number; at: number; ids: ReadonlySet<number> | null }>({ idx, at, ids: null })
  let cur = track
  if (track.idx !== idx) {
    const forward = idx === track.idx + 1
    const ids = forward && data && !reduced ? changedBoothIds(data.byBooth, track.at, at, data.evcGroups) : null
    cur = { idx, at, ids: ids && ids.size > 0 ? ids : null }
    setTrack(cur)
  }
  const shown = cur.ids
  useEffect(() => {
    if (!shown) return
    const t = window.setTimeout(() => setTrack((s) => (s.ids === shown ? { ...s, ids: null } : s)), FLASH_MS)
    return () => window.clearTimeout(t)
  }, [shown])
  return shown
}
