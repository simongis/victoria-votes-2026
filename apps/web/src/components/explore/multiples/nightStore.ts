import { useSyncExternalStore } from 'react'

/**
 * The night so far, as the rail's count pulse already holds it (derive/pulse.ts): each seat's margin at every tick, the
 * tick on show (so Rewind applies) and the length of the night. App.tsx owns these and sets them; the lens, the side
 * panel and the "ready" test read them. A tiny module store, the same pattern as likeStore, because LensProps carries
 * only the seats at one moment and a lens cannot otherwise see the past.
 */
export interface Night {
  series: ReadonlyMap<number, readonly (number | null)[]>
  /** Index of the tick on show; lines are cut here. */
  shownIdx: number
  /** Ticks in the night so far: the width every line is spread over. */
  total: number
}

const EMPTY: Night = { series: new Map(), shownIdx: -1, total: 0 }
let night: Night = EMPTY
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function setNight(n: Night): void {
  if (n.series === night.series && n.shownIdx === night.shownIdx && n.total === night.total) return
  night = n
  listeners.forEach((fn) => fn())
}
export const getNight = (): Night => night
export const useNight = (): Night => useSyncExternalStore(subscribe, getNight, () => EMPTY)
