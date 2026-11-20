/**
 * When to check for new results next (ADR 0016, VE-54). Pure: the hook supplies the clock, tab visibility and a
 * random source, so every rule is testable without timers.
 *
 * Why these numbers: the VEC refreshes the feed about every 5 minutes on election weekend (CONFIRMED), so checking
 * every 30 to 45 s finds a new snapshot within a minute at worst, while one status row per browser per 37 s average
 * stays far inside what the cached view and pointer can serve.
 */
import type { KillSwitchState } from '@vic26/schema'

export const BASE_MS = 30_000
export const JITTER_MS = 15_000
export const HIDDEN_MS = 5 * 60_000
export const BACKOFF_CAP_MS = 5 * 60_000
export const SLOW_STATE_MS = 2 * 60_000
/** VEC refresh cadence on election weekend. */
export const FEED_MS = 5 * 60_000
/** How long, from the expected update, to check every TIGHT_MS. */
export const TIGHT_WINDOW_MS = 60_000
export const TIGHT_MS = 15_000
/** Smaller jitter when aiming at the expected update, so a crowd does not land on the same second. */
const TIGHT_JITTER_MS = 5_000
/** A tab shown again after longer than this since its last check polls at once. */
export const CATCH_UP_MS = 30_000

export interface PollInput {
  /** Epoch ms. */
  now: number
  /** Snapshot time of the data held (epoch ms), or null before any. */
  snapshotAt: number | null
  visible: boolean
  /** Consecutive failed checks; 0 after a success. */
  errors: number
  /** Kill-switch state of the last status seen. */
  state: KillSwitchState | null | undefined
  /** In [0, 1). Injected so tests are seeded. */
  rand: () => number
}

/** Milliseconds to wait before the next check. */
export function nextDelay({ now, snapshotAt, visible, errors, state, rand }: PollInput): number {
  const quiet = BASE_MS + rand() * JITTER_MS
  let delay = quiet

  if (state === 'paused' || state === 'offline') delay = SLOW_STATE_MS
  else if (snapshotAt !== null) {
    // Aim just after the next expected VEC update, but only when that is sooner than the quiet wait.
    const due = snapshotAt + FEED_MS
    if (now >= due && now < due + TIGHT_WINDOW_MS) delay = TIGHT_MS + rand() * TIGHT_JITTER_MS
    else if (now < due && due - now < quiet) delay = due - now + rand() * TIGHT_JITTER_MS
  }

  // Slower conditions always win over the tight window.
  if (!visible) delay = Math.max(delay, HIDDEN_MS)
  if (errors > 0) delay = Math.max(delay, Math.min(BACKOFF_CAP_MS, BASE_MS * 2 ** errors))
  return Math.round(delay)
}

/** Whether a tab that has just become visible should check at once. */
export function shouldCatchUp({ now, lastCheckAt, visible }: { now: number; lastCheckAt: number | null; visible: boolean }): boolean {
  return visible && (lastCheckAt === null || now - lastCheckAt > CATCH_UP_MS)
}
