/**
 * The Gains colour (VE-156, FB-188 to FB-192): which seats changed hands, the net change per party, and the cards that
 * explain each change. A seat has changed hands when `Seat.changing` (a leader that is not the baseline holder: the 2022
 * winner, or the by-election or supplementary winner for Prahran and Narracan). It is a shown gain (`gainShown`) only once
 * it is firm, won or counted far enough that its lead is no longer a first-hour guess (VE-166, FB-193). The stage, the Hex
 * and Map marks, the cards, the net chips and the panel count all use that one predicate, so they cannot disagree with each
 * other. So do the rail's "Changing hands" chip and the district panel's flag (VE-168, FB-198), so neither can count a seat
 * earlier than Gains shows it; `Seat.changing` itself is unchanged. Pure, so the rules are tested without a browser.
 */
import { PARTY_BUCKETS, type PartyBucket } from '@vic26/schema'
import { PARTY_NAMES, agree } from '../parties'
import { gainShown, marginPts } from './list'
import type { Seat } from './seats'
import { byVotes } from './marginWords'

/**
 * Statewide share of enrolment counted below which the Gains chip is off (VE-166, FB-193). Earlier than this the few seats
 * that have "changed hands" are small-count noise that gives the eventual winner away.
 */
export const GAINS_FROM_COUNTED_PCT = 20

/** Why the Gains chip is off: its tooltip and the message when it is tapped. Not a standing line (words at rest). */
export const GAINS_WAIT = 'Gains shows once about 20% is counted'

/**
 * How much of an unchanged seat's party colour is kept over the paper (VE-156, FB-189): a quiet, even background that still says who holds
 * each seat, well behind the changed seats' Likely or full colour. 0.2 left Liberal and Nationals 10 apart (Delta E 76); 0.32 is the
 * least that gives 15 apart and 12 from the no-result grey (VE-168, measured in colour.test.ts).
 */
export const GAINS_KEEP = 0.32

/**
 * The one predicate for "this seat is a gain on show" is `gainShown` (defined in list.ts so the rail can use it without an
 * import cycle). Below its bar a seat is drawn as its holder's tint like any unchanged seat, so the colour does not give an
 * early leader away.
 */
export { gainShown }

/** Seats that changed hands and pass the bar; every count, card and mark below starts from these. */
export const shownGains = (seats: Iterable<Seat>): Seat[] => [...seats].filter(gainShown)

/** The chip is offered once 20% of enrolment is counted statewide and at least one seat qualifies. */
export const gainsAvailable = (seats: Iterable<Seat>, countedPct: number): boolean => countedPct >= GAINS_FROM_COUNTED_PCT && shownGains(seats).length > 0

export interface PartyNet {
  party: PartyBucket
  gains: number
  losses: number
  net: number
}

/**
 * Gains, losses and net per party over the changed seats, biggest net first, then the fixed party order. A party that
 * only lost still appears (it is in the net line); one with equal gains and losses appears with 0 so it can be tapped.
 */
export function netChange(seats: Iterable<Seat>): PartyNet[] {
  const by = new Map<PartyBucket, PartyNet>()
  const of = (p: PartyBucket): PartyNet => {
    let n = by.get(p)
    if (!n) by.set(p, (n = { party: p, gains: 0, losses: 0, net: 0 }))
    return n
  }
  for (const s of shownGains(seats)) {
    of(s.leader!).gains += 1
    of(s.base!).losses += 1
  }
  for (const n of by.values()) n.net = n.gains - n.losses
  const order = (p: PartyBucket) => PARTY_BUCKETS.indexOf(p)
  return [...by.values()].sort((a, b) => b.net - a.net || order(a.party) - order(b.party))
}

/** "+6", "−3" (the minus sign, U+2212, not a hyphen) or "0". */
export const signedNet = (n: number): string => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0')

/** Is this seat shown as a gain on the stage and in the cards: a shown gain and, with a party tapped, won by that party. */
export const keptGain = (s: Seat, party: PartyBucket | null): boolean => gainShown(s) && (party === null || s.leader === party)

export interface GainCard {
  id: number
  name: string
  from: PartyBucket
  to: PartyBucket
  margin: number | null
  /** "won by about 3,100 votes" for a declared seat, "leads by ..." before that; no figure where the lead in votes is unknown. */
  words: string
  seat: Seat
}

/** Won only when the VEC has declared the seat; a lead is never called as a win (CLAUDE.md: provisional until declared). */
export function cardWords(s: Seat): string {
  const verb = s.state === 'won' ? 'won' : 'leads'
  const by = byVotes(s.marginVotes)
  return by === null ? verb : `${verb} ${by}`
}

/**
 * The card's visible line (VE-168, finding 23): the swatches already say from and to, so the text names the party now ahead and
 * the lead in votes, "Liberal leads by about 200 votes" (FB-226). "won" only once declared, as in cardWords.
 */
export function cardLine(c: GainCard): string {
  const name = PARTY_NAMES[c.to]
  const verb = c.seat.state === 'won' ? 'won' : agree(name, 'leads', 'lead')
  const by = byVotes(c.seat.marginVotes)
  return by === null ? `${name} ${verb}` : `${name} ${verb} ${by}`
}

/** One card per kept gain, closest result first so the seats most likely to flip back come first; no margin goes last. */
export function gainCards(seats: Iterable<Seat>, party: PartyBucket | null): GainCard[] {
  return [...seats]
    .filter((s) => keptGain(s, party))
    .map((s) => ({ id: s.id, name: s.name, from: s.base!, to: s.leader!, margin: marginPts(s), words: cardWords(s), seat: s }))
    .sort((a, b) => (a.margin ?? Infinity) - (b.margin ?? Infinity) || a.name.localeCompare(b.name))
}
