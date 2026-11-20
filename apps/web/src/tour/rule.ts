// VE-89 (FB-74): when the guided tour shows by itself. Pure rules; the browser bits are passed in so they can be tested.

/** The one localStorage key. 'seen' = shown once or skipped; 'never' is kept for a later "don't show again". */
export const TOUR_KEY = 'vic26.tour'

export type TourMark = 'seen' | 'never'
export interface StorageLike {
  getItem(k: string): string | null
  setItem(k: string, v: string): void
}

const browserStorage = (): StorageLike | null => {
  try {
    return localStorage
  } catch {
    return null
  }
}

/** What was stored, or null (nothing yet, or storage is blocked). */
export function readMark(storage: StorageLike | null = browserStorage()): TourMark | null {
  try {
    const v = storage?.getItem(TOUR_KEY)
    return v === 'seen' || v === 'never' ? v : null
  } catch {
    return null
  }
}

/** A blocked or full store is ignored: the in-memory session flag still stops a second showing. */
export function writeMark(mark: TourMark, storage: StorageLike | null = browserStorage()): void {
  try {
    storage?.setItem(TOUR_KEY, mark)
  } catch {
    /* storage blocked: shown at most once per page load instead */
  }
}

/** Remembers the tour was shown, without undoing an earlier 'never'. */
export function markSeen(storage: StorageLike | null = browserStorage()): void {
  if (readMark(storage) !== 'never') writeMark('seen', storage)
}

export interface ShowContext {
  mark: TourMark | null
  /** Already shown in this page load (covers blocked storage). */
  shownThisSession: boolean
  /** Rewind is open or a past moment is on show. */
  rewinding: boolean
  /** A seat panel is open. */
  seatOpen: boolean
  /** An Explore lens is open on the stage. */
  exploreOpen: boolean
  /** Automated browsers skip it unless a test sets `window.__VIC26_TOUR__ = true`. */
  automated: boolean
  optedIn: boolean
}

/** Whether the tour opens by itself. "Show me around" ignores this and always opens it. */
export function shouldAutoShow(c: ShowContext): boolean {
  if (c.shownThisSession || c.rewinding || c.seatOpen || c.exploreOpen) return false
  if (c.automated && !c.optedIn) return false
  return c.mark === null
}
