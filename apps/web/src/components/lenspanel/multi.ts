/**
 * The small-multiples lens's rows and words (VE-86): one row per seat, ranked by how close the race is. Pure, so the
 * ranking, the cut at the viewed tick (Rewind) and the "hide until ready" test are checked without a browser.
 * The lines are the count pulse the rail already draws (derive/pulse.ts): the 2022 holder's two-candidate lead in
 * points, above zero while they lead, so a line crossing zero is a seat changing hands.
 */
import type { Seat } from '../../derive/seats'
import { partyName } from '../../derive/seats'

/** Within this many points a leading seat is "close" (twice the distance from 50%, as on the rail). */
export const CLOSE_PTS = 10
/** FB-148: offer the lens once this many seats have this many figures. */
const READY_SEATS = 20
const READY_TICKS = 3

export type TileState = 'settled' | 'close' | 'open' | 'none'

export interface MultiRow {
  id: number
  name: string
  seat: Seat
  /** The leader's lead in points; null with nothing counted. */
  lead: number | null
  state: TileState
  /** The holder-signed margin at each tick up to the one on show; null where the seat had no figure. */
  line: readonly (number | null)[]
  /** Times the seat changed hands so far. */
  swings: number
}

/** Two-candidate lead (2 x pctA - 100; the leader is party A), else the first-preference lead, else null. */
export function leaderMargin(s: Seat): number | null {
  if (s.tcp) return Math.abs(2 * s.tcp.pctA - 100)
  if (s.fp.length >= 2) return s.fp[0]!.pct - s.fp[1]!.pct
  if (s.fp.length === 1) return s.fp[0]!.pct
  return null
}

/** Won and firm seats are muted whatever the margin; a leading seat inside the band is close. */
export function tileState(s: Seat, lead: number | null, final = false): TileState {
  if (s.leader === null || lead === null) return 'none'
  // VE-167: at Final every seat is won, so "settled" would grey the whole lens; the final margin sets the tile instead.
  if (!final && (s.state === 'won' || s.state === 'firm')) return 'settled'
  return lead < CLOSE_PTS ? 'close' : 'open'
}

/** Crossings of the zero line, skipping gaps. A tick exactly on zero is a tie, not a change of hands. */
export function swingCount(line: readonly (number | null)[]): number {
  let last = 0
  let n = 0
  for (const v of line) {
    if (v === null || v === 0) continue
    const sign = v > 0 ? 1 : -1
    if (last !== 0 && sign !== last) n++
    last = sign
  }
  return n
}

/** Closest race first; seats with no figure last; name breaks ties so the order holds from tick to tick. */
export function multiRows(seats: ReadonlyMap<number, Seat>, series: ReadonlyMap<number, readonly (number | null)[]>, shownIdx: number, final = false): MultiRow[] {
  return [...seats.values()]
    .map((seat): MultiRow => {
      const lead = leaderMargin(seat)
      const line = (series.get(seat.id) ?? []).slice(0, shownIdx + 1)
      return { id: seat.id, name: seat.name, seat, lead, state: tileState(seat, lead, final), line, swings: swingCount(line) }
    })
    .sort((a, b) => (a.lead === null ? 1 : 0) - (b.lead === null ? 1 : 0) || (a.lead ?? 0) - (b.lead ?? 0) || a.name.localeCompare(b.name))
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many)

/** "Lead changed", not "changed hands": Gains uses that for a different party from 2022 (VE-167, review finding 12). */
export function multiSummary(rows: readonly MultiRow[], final = false): string {
  if (rows.every((r) => r.lead === null)) return 'No race has a result yet.'
  const close = rows.filter((r) => r.state === 'close').length
  const swung = rows.filter((r) => r.swings > 0).length
  // VE-168 (finding 24): an outlined hex is a close race; say so, but only while there are outlined hexes to explain.
  const key = close > 0 ? ` Outlined: within ${CLOSE_PTS} points.` : ''
  if (final) return `${close} ${plural(close, 'race was', 'races were')} within ${CLOSE_PTS} points. The lead changed in ${swung} on the night.${key}`
  return `${close} ${plural(close, 'race is', 'races are')} within ${CLOSE_PTS} points. The lead changed in ${swung} tonight.${key}`
}

const points = (n: number): string => {
  const r = Math.round(n)
  return `${r} ${plural(r, 'point', 'points')}`
}

export function multiSentence(r: MultiRow): string {
  if (r.lead === null) return `${r.name}: nothing counted yet.`
  const parts = [`${partyName(r.seat.leader)} ahead by ${points(r.lead)}`]
  if (r.state === 'settled') parts.push(r.seat.state === 'won' ? 'declared' : 'certain')
  else if (r.state === 'close') parts.push(`within ${CLOSE_PTS} points`)
  if (r.swings > 0) parts.push('lead changed')
  return `${r.name}: ${parts.join(', ')}.`
}

/** Enough seats with several figures up to the tick on show, so the tiles say something. */
export function multiReady(series: ReadonlyMap<number, readonly (number | null)[]>, shownIdx: number): boolean {
  let seats = 0
  for (const line of series.values()) {
    let figures = 0
    for (let i = 0; i <= shownIdx && i < line.length; i++) if (line[i] !== null) figures++
    if (figures >= READY_TICKS) seats++
  }
  return seats >= READY_SEATS
}
