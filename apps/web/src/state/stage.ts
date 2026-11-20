import { useSyncExternalStore } from 'react'

/**
 * What the transition overlay tells the shell, held outside React state so a 60 fps stream of count-ups
 * re-renders only the components that read it (the Tally pane), not the whole app.
 */
export interface StageState {
  active: boolean
  /** Count-up numerals (only past the Seats view); null otherwise. */
  counts: { alp: number; coalition: number; settle: number } | null
}

export interface StageStore {
  get(): StageState
  set(next: StageState): void
  subscribe(fn: () => void): () => void
}

const IDLE: StageState = { active: false, counts: null }

export function createStageStore(): StageStore {
  let state = IDLE
  const subs = new Set<() => void>()
  return {
    get: () => state,
    set(next) {
      const same =
        next.active === state.active &&
        (next.counts === state.counts ||
          (next.counts !== null &&
            state.counts !== null &&
            next.counts.alp === state.counts.alp &&
            next.counts.coalition === state.counts.coalition &&
            next.counts.settle === state.counts.settle))
      if (same) return
      state = next
      subs.forEach((f) => f())
    },
    subscribe(fn) {
      subs.add(fn)
      return () => subs.delete(fn)
    },
  }
}

export const useStage = (store: StageStore): StageState => useSyncExternalStore(store.subscribe, store.get, store.get)
