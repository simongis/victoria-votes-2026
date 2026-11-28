/**
 * The closest seats under the phone Hex (VE-177, FB-205, FB-206): the seats with the smallest two-candidate margin, as
 * cards. Ordered by margin in points, not by the rail's Close order (lead against votes left), so a block headed
 * "Closest seats" reads smallest first. Pure, so the rules are tested without a browser.
 */
import type { PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../parties'
import { cardLine, gainCards, gainsAvailable } from './gains'
import { marginPts } from './list'
import { aheadCardLine, aheadLine } from './marginWords'
import { votesRounded } from './panel'
import type { Seat } from './seats'

/** Statewide share counted below which there is no block: earlier margins are first-hour noise (same bar as the headline). */
export const CLOSEST_FROM_PCT = 5
/** Most cards ever offered; the layout shows as many whole rows of two as fit. */
export const CLOSEST_MAX = 6

export interface ClosestCard {
  id: number
  name: string
  leader: PartyBucket
  /** The leader's two-candidate lead, in points. */
  margin: number
  /** "About 1,200 votes ahead" (the rail's Lead, short enough for a phone card; the party is the stripe's colour and the label's name): never "won" while the count is live (VE-166). */
  line: string
  /** The accessible name of the card button. */
  label: string
}

export interface Closest {
  heading: 'Closest seats' | 'Closest results' | 'Seats changing hands since 2022' | 'Seats that changed hands since 2022'
  cards: ClosestCard[]
}

/** The margin in words, one decimal; `long` spells points out for the accessible name. */
export const marginWords = (pts: number): { short: string; long: string } => ({ short: `${pts.toFixed(1)} pts`, long: `${pts.toFixed(1)} points` })

/** Up to six cards, or null before 5% is counted or when no seat has a margin yet. `final`: every seat declared. */
export function closestSeats(seats: Iterable<Seat>, countedPct: number, final: boolean): Closest | null {
  if (countedPct < CLOSEST_FROM_PCT) return null
  const cards: ClosestCard[] = []
  const votesShown = new Map<number, number>()
  for (const s of seats) {
    const margin = marginPts(s)
    if (margin === null || s.leader === null) continue
    if (s.marginVotes !== null && s.marginVotes !== undefined) votesShown.set(s.id, votesRounded(s.marginVotes))
    const w = marginWords(margin)
    const party = PARTY_NAMES[s.leader]
    const ahead = aheadLine(s.marginVotes)
    cards.push({ id: s.id, name: s.name, leader: s.leader, margin, line: aheadCardLine(s.marginVotes) ?? `${party} by ${w.short}`, label: `${s.name}, ${party}, ${ahead ? ahead.toLowerCase() : `by ${w.long}`}, show on the map` })
  }
  if (cards.length === 0) return null
  // The cards show votes when known, so order by that rounded figure (else "~400" can sit above "~300"); points break ties.
  const shown = new Map(cards.map((c) => [c.id, votesShown.get(c.id) ?? Infinity]))
  cards.sort((a, b) => shown.get(a.id)! - shown.get(b.id)! || a.margin - b.margin || a.name.localeCompare(b.name))
  return { heading: final ? 'Closest results' : 'Closest seats', cards: cards.slice(0, CLOSEST_MAX) }
}

/**
 * The same block under Gains (VE-189, FB-222): the seats that changed hands, closest first, so the cards agree with the
 * handle's "6 seats changing hands since 2022". The rule, order and words are the Gains cards' (gains.ts), so the phone and
 * the desktop rail cannot disagree. `party` is the party tapped in the Gains key (null for all). Null before the Gains bar (20% counted) or when no seat has changed yet.
 */
export function changingSeats(all: Iterable<Seat>, countedPct: number, final: boolean, party: PartyBucket | null = null): Closest | null {
  const seats = [...all] // read twice below, and an iterator can be read once
  if (!gainsAvailable(seats, countedPct)) return null
  const gains = gainCards(seats, party)
  if (gains.length === 0) return null
  const cards = gains.slice(0, CLOSEST_MAX).map((g): ClosestCard => {
    const from = PARTY_NAMES[g.from]
    const to = PARTY_NAMES[g.to]
    return { id: g.id, name: g.name, leader: g.to, margin: g.margin ?? Infinity, line: cardLine(g), label: `${g.name}, ${from} to ${to}, ${g.words}, show on the map` }
  })
  return { heading: final ? 'Seats that changed hands since 2022' : 'Seats changing hands since 2022', cards }
}

/**
 * VE-254 (F5): no seat has a count after preferences, so none can be called close. "0 close" then reads as a fact, so the
 * band and the rail say nothing, and the phone map says why in one line. (The first-preference gap between buckets is not a
 * margin: the seat's leader is one candidate and the bars are party totals, so no honest first-preference card exists.)
 */
export const noPreferencesYet = (seats: Iterable<Seat>): boolean => {
  for (const s of seats) if (s.tcp !== null || s.tcpWithheld) return false
  return true
}
export const CLOSE_WAIT_NOTE = 'Close seats show once preferences are counted'
