/**
 * The seats that moved most tonight (VE-182), for the cards under the portrait phone Multiples grid. Pure, so the
 * ordering rules are tested without a browser.
 * The line is the 2022 holder's signed lead in points (derive/pulse.ts): above zero while the holder leads, below it while
 * the other side does. So the current leader is the side of the last non-zero point, and "the leader's lead" is the line
 * read from that side.
 */
import type { PartyBucket } from '@vic26/schema'
import { PARTY_NAMES } from '../parties'

/** Most cards ever offered; the layout shows as many whole rows of two as fit. */
export const BIGGEST_MAX = 6

export interface MoveInput {
  id: number
  name: string
  /** The holder-signed lead at each tick up to the one on show; null where the seat had no figure. */
  line: readonly (number | null)[]
  /** The side a positive value belongs to (the 2022 holder, or the pairing's first party when there is none). */
  holder: PartyBucket | null
  /** The side a negative value belongs to. */
  other: PartyBucket | null
}

export interface MoveCard {
  id: number
  name: string
  /** Who leads now. */
  leader: PartyBucket
  /** The side that led first, when the lead changed. */
  from: PartyBucket | null
  changed: boolean
  /** How far the current leader's lead moved over the night, in points (always positive). */
  size: number
  /** "Lead changed: Labor to Greens" or "Labor lead up 6 pts": never "won" while the count is live (VE-166). */
  line: string
  /** The accessible name of the card button. */
  label: string
}

export interface BiggestMoves {
  heading: 'Biggest moves tonight' | 'Biggest moves of the night'
  cards: MoveCard[]
}

const name = (p: PartyBucket | null): string => PARTY_NAMES[p ?? 'OTH']

/** Up to six cards, or null when no seat has moved. `final`: every seat declared. */
export function biggestMoves(seats: Iterable<MoveInput>, final: boolean): BiggestMoves | null {
  const cards: MoveCard[] = []
  for (const s of seats) {
    const pts = s.line.filter((v): v is number => v !== null)
    if (pts.length < 2) continue
    const first = pts[0]!
    const last = pts[pts.length - 1]!
    // A tick exactly on zero is a tie, not a side (as swingCount): sides come from the first and last non-zero points.
    const nz = pts.filter((v) => v !== 0)
    if (nz.length === 0) continue
    const sideOf = (v: number): PartyBucket | null => (v > 0 ? s.holder : s.other)
    const sign = nz[nz.length - 1]! > 0 ? 1 : -1
    const leader = sideOf(sign)
    if (leader === null) continue
    const changed = Math.sign(nz[0]!) !== sign
    // The current leader's lead then and now: positive is ahead, so the difference is the move in their lead.
    const move = sign * (last - first)
    const size = Math.abs(move)
    // A move that rounds to nothing is no story (it would only pad the block with flat seats).
    if (!changed && Math.round(size) === 0) continue
    const pointsShort = `${Math.round(size)} ${Math.round(size) === 1 ? 'pt' : 'pts'}`
    const pointsLong = `${Math.round(size)} ${Math.round(size) === 1 ? 'point' : 'points'}`
    let text: string
    let said: string
    let from: PartyBucket | null = null
    if (changed) {
      from = sideOf(-sign)
      text = `Lead changed: ${name(from)} to ${name(leader)}`
      said = `lead changed from ${name(from)} to ${name(leader)}`
    } else {
      const dir = move >= 0 ? 'up' : 'down'
      text = `${name(leader)} lead ${dir} ${pointsShort}`
      said = `${name(leader)} lead ${dir} ${pointsLong}`
    }
    cards.push({ id: s.id, name: s.name, leader, from, changed, size, line: text, label: `${s.name}, ${said}, show on the grid` })
  }
  if (cards.length === 0) return null
  cards.sort((a, b) => Number(b.changed) - Number(a.changed) || b.size - a.size || a.name.localeCompare(b.name))
  return { heading: final ? 'Biggest moves of the night' : 'Biggest moves tonight', cards: cards.slice(0, BIGGEST_MAX) }
}
