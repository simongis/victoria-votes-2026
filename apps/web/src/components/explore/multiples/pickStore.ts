import { useSyncExternalStore } from 'react'

/**
 * The seat picked on the Multiples grid (VE-276). The lens owns the pick (a tap on a hex, a row in the list, a card); the
 * side panel lives in the rail, outside the lens, so it reads the pick from here. Same tiny-store pattern as nightStore.
 * `open` sends the seat to the main map, as the lens's old tap did: the lens registers it while it is mounted.
 */
interface Pick {
  id: number | null
  open: ((id: number) => void) | null
}
let state: Pick = { id: null, open: null }
const listeners = new Set<() => void>()
const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const set = (next: Pick) => {
  if (next.id === state.id && next.open === state.open) return
  state = next
  listeners.forEach((fn) => fn())
}

export const setPicked = (id: number | null): void => set({ ...state, id })
export const setOpener = (open: Pick['open']): void => set({ ...state, open })
const get = (): Pick => state
export const usePick = (): Pick => useSyncExternalStore(subscribe, get, get)
