import type { PartyBucket } from '@vic26/schema'
import type { Tally } from '../derive/seats'
import { DOUBT, focusParties, type Focus } from '../derive/focus'

/** Tie-break order, fixed so two parties on equal seats never swap places between ticks. */
const ORDER: readonly PartyBucket[] = ['ALP', 'LIB', 'NAT', 'GRN', 'ONP', 'IND', 'OTH']

/** Seats a party has won or leads. */
const seatsOf = (t: Tally, p: PartyBucket) => t.firm[p] + t.leading[p]

/** The four rows the Leader matrix always draws, in a fixed order so rows never jump as the count moves. */
const MATRIX_BASE: readonly PartyBucket[] = ['ALP', 'LIB', 'NAT', 'GRN']

/**
 * VE-312 (Simon): the rows of the illustrated Leader key ("i"). Early in a night only Labor may lead, and a Labor-only
 * matrix read as a broken key, so the main four are always drawn; any other party leading a seat (One Nation, an
 * independent) is added below them, biggest first.
 */
export function matrixParties(t: Tally): PartyBucket[] {
  const extra = ORDER.filter((p) => !MATRIX_BASE.includes(p) && seatsOf(t, p) > 0).sort((a, b) => seatsOf(t, b) - seatsOf(t, a))
  return [...MATRIX_BASE, ...extra]
}

/**
 * VE-273, VE-312: which parties' ramps the Leader chips under the view buttons show, in order. A party pick (or hover
 * preview) in the tally pins the chips to that party; otherwise they cycle through the matrix's parties (the main four,
 * then any other party leading a seat), so the chips never read as Labor-only, even when only Labor leads. VE-312
 * (Simon): when motion is reduced (the device's setting or the app's Animations switch) the chips hold on Labor. The
 * Coalition and the crossbench picks are groups, so they show their biggest member.
 */
export function keyParties(t: Tally, pick: Focus | null, still: boolean): PartyBucket[] {
  if (pick && pick !== DOUBT) {
    const members = focusParties(pick)
    const best = [...members].sort((a, b) => seatsOf(t, b) - seatsOf(t, a))[0]
    if (best) return [best]
  }
  return still ? ['ALP'] : matrixParties(t)
}

/** VE-312: the cycle's step from the wall clock, so every key on screen (and one mounted later) changes at the same moment. */
export const cycleStep = (nowMs: number, periodMs: number): number => Math.floor(nowMs / periodMs)

/** How long until the clock reaches the next step. */
export const msToNextStep = (nowMs: number, periodMs: number): number => periodMs - (nowMs % periodMs)

/** The list can shrink between ticks, so the running step is wrapped into it rather than trusted. */
export const cycleIndex = (step: number, n: number): number => (n <= 0 ? 0 : step % n)
