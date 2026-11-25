/**
 * The seats rail's rows (VE-62, the seats rail since VE-64a): one row per seat built from the same Seat the views use, plus sort and filter.
 * Pure, so the rules are tested without a browser.
 */
import type { DistrictStatic, PartyBucket } from '@vic26/schema'
import { inFocus, type Focus } from './focus'
import { PARTY_NAMES, agree } from '../parties'
import type { Seat } from './seats'

/** Two-candidate gap (leader minus the rest, in points) under which a seat is "Within 10 points" (the seat's screen reader word; the band's "close" count is a different rule, IN_DOUBT_TCP_PCT). */
export const CLOSE_PTS = 10

/** Leader's 2CP lead over the field in points; null when no 2CP figure is in. */
export const marginPts = (s: Seat): number | null => (s.tcp ? Math.abs(2 * s.tcp.pctA - 100) : null)

export type ListStatus = 'Declared' | 'Certain' | 'Within 10 points' | 'Leading' | 'Too early'
const STATUS_ORDER: ListStatus[] = ['Declared', 'Certain', 'Within 10 points', 'Leading', 'Too early']

export interface ListRow {
  id: number
  name: string
  leader: PartyBucket | null
  /** Two-candidate gap in points, null with no 2CP figure. */
  margin: number | null
  /** The leader's 2CP against the same party in the baseline, in points; null when not comparable. */
  swing: { party: PartyBucket; pts: number } | null
  pct: number | null
  /** The lead as a share of the votes still to count (VE-111): small is close, over 1 cannot be overturned. Null when either figure is missing. */
  lead: number | null
  status: ListStatus
  seat: Seat
}

export type SortKey = 'name' | 'leader' | 'margin' | 'swing' | 'pct' | 'status' | 'lead'
export type SortDir = 'asc' | 'desc'

/**
 * Swing needs the same two parties in the baseline 2CP and now (a changed pairing has no comparable swing, per
 * CONTEXT.md). The baseline stores party A's share, so a leader who was party B is measured from 100 minus it.
 */
export function swingOf(s: Seat, st: DistrictStatic | undefined): ListRow['swing'] {
  if (!st || !s.tcp || !s.tcp.b || st.base_tcp_party_a === null || st.base_tcp_party_b === null || st.base_tcp_pct_a === null) return null
  const pair = new Set([s.tcp.a, s.tcp.b])
  if (pair.size !== 2 || !pair.has(st.base_tcp_party_a) || !pair.has(st.base_tcp_party_b)) return null
  const before = s.tcp.a === st.base_tcp_party_a ? st.base_tcp_pct_a : 100 - st.base_tcp_pct_a
  return { party: s.tcp.a, pts: s.tcp.pctA - before }
}

function statusOf(s: Seat, margin: number | null): ListStatus {
  if (s.state === 'won') return 'Declared'
  if (!s.leader) return 'Too early'
  if (s.state === 'firm') return 'Certain'
  return margin !== null && margin < CLOSE_PTS ? 'Within 10 points' : 'Leading'
}

/** Nothing left to count is a finite, huge share so it sorts last (and subtracts cleanly) rather than becoming Infinity. */
export function leadShare(s: Seat): number | null {
  if (s.marginVotes === null || s.stillToCount === null) return null
  return s.stillToCount === 0 ? 1e9 : s.marginVotes / s.stillToCount
}

export function listRow(s: Seat, st: DistrictStatic | undefined): ListRow {
  const margin = marginPts(s)
  return { id: s.id, name: s.name, leader: s.leader, margin, swing: swingOf(s, st), pct: s.pct, lead: leadShare(s), status: statusOf(s, margin), seat: s }
}

const valueOf = (r: ListRow, k: SortKey): string | number | null => {
  switch (k) {
    case 'name': return r.name
    case 'leader': return r.leader ? PARTY_NAMES[r.leader] : null
    // The rail's Lead column shows votes (marginWords.ts), so the order follows the numbers, not points.
    case 'margin': return r.seat.marginVotes
    case 'swing': return r.swing?.pts ?? null
    case 'pct': return r.pct
    case 'lead': return r.lead
    case 'status': return STATUS_ORDER.indexOf(r.status)
  }
}

/** Missing values go last whichever way the sort runs; name breaks ties so the order is stable between ticks. */
export function sortRows(rows: readonly ListRow[], key: SortKey, dir: SortDir): ListRow[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const va = valueOf(a, key)
    const vb = valueOf(b, key)
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1
    } else if (va !== vb) {
      return sign * (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb)))
    }
    return a.name.localeCompare(b.name)
  })
}

/** The rail's status chips: seats in doubt, seats changing hands, seats the VEC has declared. One at a time. */
export type RailFilter = 'doubt' | 'changing' | 'won'

/**
 * The one predicate for "this seat is a gain on show" (VE-166, FB-193): it changed hands and its new leader is Likely, certain
 * or declared (ADR 0033: a count alone is not enough; a withheld seat is never Likely, so it shows only once declared). It lives
 * here, not in gains.ts, because gains.ts imports from this file and the rail's "Changing hands" filter must use it too (VE-168,
 * FB-198); gains.ts re-exports it.
 */
export const gainShown = (s: Seat): boolean => s.changing && (s.state === 'firm' || s.state === 'won' || s.likely)

export const matchesRailFilter = (r: ListRow, f: RailFilter): boolean =>
  // VE-226 (finding 7): the close seats, plus the seats waiting for a count after preferences, which the rail lists apart
  // under their own heading; the chip counts the close ones only (railCounts).
  f === 'doubt' ? r.seat.inDoubt : f === 'changing' ? gainShown(r.seat) : r.seat.state === 'won'

/**
 * Live counts for the chips, over every row (not narrowed by search), so a chip says what it would show. VE-226 (finding 7):
 * the Close seats count is close seats only, as the band's "N close" is; the list also shows the seats still waiting for a
 * count after preferences, under their own heading.
 */
export function railCounts(rows: readonly ListRow[]): Record<RailFilter, number> {
  return {
    doubt: rows.filter((r) => r.seat.close).length,
    changing: rows.filter((r) => matchesRailFilter(r, 'changing')).length,
    won: rows.filter((r) => matchesRailFilter(r, 'won')).length,
  }
}

/** Party focus (from the top tally), a name search and a status chip, all optional. */
export function filterRows(rows: readonly ListRow[], focus: Focus | null, query: string, status: RailFilter | null = null): ListRow[] {
  const q = query.trim().toLowerCase()
  return rows.filter((r) => inFocus(focus, r.leader) && (q === '' || r.name.toLowerCase().includes(q)) && (status === null || matchesRailFilter(r, status)))
}

/**
 * Result words the way Australian results pages say them. Only for seats the VEC has declared: before that we never
 * call a seat, so there are no words (the row says "leads" elsewhere). No 2022 holder (a new seat) reads "win".
 */
export function resultWords(s: Seat): string | null {
  if (s.state !== 'won' || !s.leader) return null
  const name = PARTY_NAMES[s.leader]
  if (!s.base) return `${name} win`
  return s.base === s.leader ? `${name} ${agree(name, 'keeps', 'keep')} it` : `${name} ${agree(name, 'wins', 'win')} it from ${PARTY_NAMES[s.base]}`
}

/**
 * "Latest" order for the seats rail: seats counted most recently first (freshness is 1 just now, down to 0), the
 * rest after them in the order they came in. A stable sort, so equal freshness keeps the sort the viewer chose.
 */
export function latestFirst(rows: readonly ListRow[], fresh: ReadonlyMap<number, number>): ListRow[] {
  const f = (r: ListRow): number => fresh.get(r.id) ?? 0
  return [...rows].sort((a, b) => f(b) - f(a))
}
