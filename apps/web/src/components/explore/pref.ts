export const PEEK_KEY = 'vic26.explore'

/** The Explore peek card: open, minimised to a small chip, or dismissed. Remembered per viewer (ADR 0022). */
export type PeekState = 'open' | 'min' | 'gone'

/** Storage can be blocked or empty (private windows), so every access is guarded. */
export function readPeek(): PeekState {
  try {
    const v = localStorage.getItem(PEEK_KEY)
    return v === 'min' || v === 'gone' ? v : 'open'
  } catch {
    return 'open'
  }
}

export function writePeek(s: PeekState): void {
  try {
    if (s === 'open') localStorage.removeItem(PEEK_KEY)
    else localStorage.setItem(PEEK_KEY, s)
  } catch {
    /* the choice just won't be remembered */
  }
}

export const PEEK_SEEN_KEY = 'vic26.explore.seen'

/**
 * VE-210: the card's one gentle highlight plays on a first visit only. Reads as seen when storage is blocked, so a private
 * window never pulses on every load. Reading and marking are separate so a double render (StrictMode) cannot eat the first.
 */
export function peekIntroDue(): boolean {
  try {
    return !localStorage.getItem(PEEK_SEEN_KEY)
  } catch {
    return false
  }
}

export function markPeekIntroSeen(): void {
  try {
    localStorage.setItem(PEEK_SEEN_KEY, '1')
  } catch {
    /* not remembered: peekIntroDue already reads false when storage is blocked */
  }
}
