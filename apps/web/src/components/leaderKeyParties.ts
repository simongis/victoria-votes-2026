import type { PartyBucket } from '@vic26/schema'
import type { Tally } from '../derive/seats'
import { DOUBT, focusParties, type Focus } from '../derive/focus'

/** Tie-break order, fixed so two parties on equal seats never swap places between ticks. */
const ORDER: readonly PartyBucket[] = ['ALP', 'LIB', 'NAT', 'GRN', 'ONP', 'IND', 'OTH']

/** Seats a party has won or leads. */
const seatsOf = (t: Tally, p: PartyBucket) => t.firm[p] + t.leading[p]

/**
 * VE-273: which parties' ramps the Leader key shows, in order. A party pick (or hover preview) in the tally pins the
 * key to that party; otherwise it cycles through every party that leads a seat, biggest first, so the key does not
 * read as Labor-only. VE-287: the device's reduced-motion setting no longer collapses the key (the cycle is what shows
 * that saturation means certainty, not one party); only the app's own Animations switch being off gives the leader
 * alone. The Coalition and the crossbench picks are groups, so they show their biggest member. Before any seat leads,
 * Labor's ramp is shown as before.
 */
export function keyParties(t: Tally, pick: Focus | null, animationsOff: boolean): PartyBucket[] {
  const ranked = ORDER.filter((p) => seatsOf(t, p) > 0).sort((a, b) => seatsOf(t, b) - seatsOf(t, a))
  if (pick && pick !== DOUBT) {
    const members = focusParties(pick)
    const best = [...members].sort((a, b) => seatsOf(t, b) - seatsOf(t, a))[0]
    if (best) return [best]
  }
  if (ranked.length === 0) return ['ALP']
  return animationsOff ?[ranked[0]!] : ranked
}

/** The list can shrink between ticks, so the running step is wrapped into it rather than trusted. */
export const cycleIndex = (step: number, n: number): number => (n <= 0 ? 0 : step % n)

