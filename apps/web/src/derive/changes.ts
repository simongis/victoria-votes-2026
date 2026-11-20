import { flippedIds } from './flips'
import type { Seat } from './seats'

/**
 * What changed in a seat between two snapshots (VE-60), derived from the two snapshots alone: no schema change, and
 * the same answer live, in Rewind and when scrubbing. The update effects (components/Effects.tsx) read this.
 */
export interface SeatChange {
  /** More of the seat has been counted (a higher share, or more first-preference votes). */
  counted: boolean
  /** The leader changed from one party to another. A first leader, or a firmer lead, is not a flip. */
  flipped: boolean
  /** VEC declared the seat on this step. */
  declared: boolean
  /** Rise in the counted share, in percentage points (0 when only the votes moved). */
  countedDelta: number
}

/** The fresh dot's life live, in ms of data time. VEC publishes about every 5 minutes (UNVERIFIED), so this is one update. */
export const FRESH_LIVE_MS = 5 * 60_000
/** In Rewind a dot lasts this many playback steps, so it scales with the speed (a step is 1200 ms divided by the speed). */
export const FRESH_REWIND_TICKS = 3

const votesOf = (s: Seat): number => s.fp.reduce((a, f) => a + f.votes, 0)

/** Seats that changed from `prev` to `next`; seats with nothing new are left out, so an empty map means "animate nothing". */
export function changesBetween(prev: ReadonlyMap<number, Seat>, next: ReadonlyMap<number, Seat>): Map<number, SeatChange> {
  const flips = new Set(flippedIds(prev, next))
  const out = new Map<number, SeatChange>()
  for (const [id, s] of next) {
    const was = prev.get(id)
    if (!was) continue
    const delta = (s.pct ?? 0) - (was.pct ?? 0)
    const counted = delta > 0 || votesOf(s) > votesOf(was)
    const declared = s.state === 'won' && was.state !== 'won'
    const flipped = flips.has(id)
    if (!counted && !declared && !flipped) continue
    out.set(id, { counted, flipped, declared, countedDelta: Math.max(0, delta) })
  }
  return out
}

/**
 * How fresh each seat's last count is at tick `idx`, 1 (just now) down to 0 (gone); only seats still above 0 are in
 * the map. Live, age is data time against a 5 minute window. In Rewind it is playback steps, so the dot always
 * lasts the same few steps whatever the speed.
 */
export function freshness(
  seatsAt: readonly ReadonlyMap<number, Seat>[],
  ticks: readonly { snapshotAt: number }[],
  idx: number,
  mode: 'live' | 'rewind',
): Map<number, number> {
  const out = new Map<number, number>()
  const here = ticks[idx]
  if (!here) return out
  const window = mode === 'live' ? FRESH_LIVE_MS : FRESH_REWIND_TICKS
  for (let j = idx; j >= 1; j--) {
    const age = mode === 'live' ? here.snapshotAt - (ticks[j]?.snapshotAt ?? here.snapshotAt) : idx - j
    if (age >= window) break
    const now = seatsAt[j]
    const was = seatsAt[j - 1]
    if (!now || !was) continue
    for (const [id, c] of changesBetween(was, now)) {
      if (c.counted && !out.has(id)) out.set(id, 1 - age / window)
    }
  }
  return out
}
