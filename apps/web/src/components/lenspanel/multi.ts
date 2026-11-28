/**
 * The small-multiples lens's rows and words (VE-86): one row per seat, ranked by how close the race is. Pure, so the
 * ranking, the cut at the viewed tick (Rewind) and the "hide until ready" test are checked without a browser.
 * The lines are the count pulse the rail already draws (derive/pulse.ts): the 2022 holder's two-candidate lead in
 * points, above zero while they lead, so a line crossing zero is a seat changing hands.
 */
import type { Seat } from '../../derive/seats'
import type { PartyBucket } from '@vic26/schema'
import { partyName } from '../../derive/seats'
import { pairInDoubt } from '../../derive/colour'

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
  // VE-168 (finding 24): a shaded hex is a close race; say so, but only while there are shaded hexes to explain.
  const key = close > 0 ? ` Shaded: within ${CLOSE_PTS} points.` : ''
  if (final) return `${close} ${plural(close, 'race was', 'races were')} within ${CLOSE_PTS} points. The lead changed in ${swung} on the night.${key}`
  return `${close} ${plural(close, 'race is', 'races are')} within ${CLOSE_PTS} points. The lead changed in ${swung} tonight.${key}`
}

const points = (n: number): string => {
  const r = Math.round(n)
  // A sliver is never "0 points": that reads as a tie the seat does not have.
  if (r < 1) return 'under 1 point'
  return `${r} ${plural(r, 'point', 'points')}`
}

/**
 * VE-290: the one measure the heading, the trend line and its labels, the hex tooltip and the list row all speak from: the
 * latest figure of the line the hex draws (the VEC two-candidate margin). Its sign says which side leads, so the words can
 * never disagree with the line. With no line figure (no two-candidate count) it falls back to the seat's own leader.
 */
export interface SeatRead {
  leader: PartyBucket | null
  /** The other side of the measured pair; null when the read is not a pair (first preferences only). */
  other: PartyBucket | null
  lead: number | null
}
export function seatRead(r: MultiRow): SeatRead {
  // Only the latest tick: a seat whose pairing is withheld now has no pair to speak of, whatever the line showed earlier.
  const v = r.line.length > 0 ? r.line[r.line.length - 1]! : null
  if (v === null) return { leader: r.seat.leader, other: null, lead: r.lead }
  const { holder, other } = lineSides(r.seat)
  // ADR 0034: a declared seat is its Elected winner, not the sign of a line that can end a hair on the other side.
  const won = r.seat.state === 'won' ? r.seat.leader : null
  if (won) return { leader: won, other: won === holder ? other : won === other ? holder : null, lead: Math.abs(v) }
  return { leader: (v >= 0 ? holder : other) ?? r.seat.leader, other: v >= 0 ? other : holder, lead: Math.abs(v) }
}

export function multiSentence(r: MultiRow): string {
  const m = seatRead(r)
  if (m.lead === null) return `${r.name}: nothing counted yet.`
  const parts = [`${partyName(m.leader)} ahead by ${points(m.lead)}`]
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

/** The two sides of the holder-signed line: the 2022 holder (positive) and the other party in the pairing (negative). */
export function lineSides(s: Seat): { holder: PartyBucket | null; other: PartyBucket | null } {
  const t = s.tcp
  if (!t) return { holder: s.base, other: null }
  if (s.base === null) return { holder: t.a, other: t.b }
  return { holder: s.base, other: t.a === s.base ? t.b : t.a }
}

export interface SeatFacts {
  /** "Labor v Liberal", or null with no two-candidate pairing yet. */
  pair: string | null
  leader: PartyBucket | null
  leaderName: string | null
  lead: number | null
  /** "Labor ahead by 4 points". */
  leadLine: string
  /** "Lead changed twice", "Labor led all night"; null with no figures. */
  changes: string | null
  /** Who led at the first figure with a lead (not a tie), for the colour of the line's start. */
  firstLeader: PartyBucket | null
  /** Whole per cent of the vote counted, or null. */
  counted: number | null
  declared: boolean
  /** Set when the VEC's pair is not the real contest: the pair, and the party outside it (leading, or close behind, on first preferences). */
  wrongPair: { a: PartyBucket; b: PartyBucket; outsider: PartyBucket; leads: boolean } | null
}

/** The few facts the picked seat's panel shows (VE-276). Pure, so the words are checked without a browser. */
export function seatFacts(r: MultiRow, final: boolean): SeatFacts {
  const s = r.seat
  const { holder, other } = lineSides(s)
  const m = seatRead(r)
  const first = r.line.find((v): v is number => v !== null && v !== 0)
  const firstLeader = first === undefined ? null : first > 0 ? holder : other
  const leaderName = m.leader ? partyName(m.leader) : null
  const pair = s.tcp?.b ? `${partyName(s.tcp.a)} v ${partyName(s.tcp.b)}` : null
  let changes: string | null = null
  if (m.lead !== null && first !== undefined) {
    const led = leaderName ?? 'The leader'
    if (r.swings === 0) changes = `${led} led ${final ? 'throughout' : 'all night'}`
    else {
      const n = r.swings === 1 ? 'once' : r.swings === 2 ? 'twice' : `${r.swings} times`
      // An odd number of changes ends on the other side from where it began: say who led first.
      const aside = firstLeader && firstLeader !== m.leader ? ` (${partyName(firstLeader)} led first)` : ''
      changes = `Lead changed ${n}${aside}`
    }
  }
  const outside = pairOutsider(s)
  return {
    pair,
    leader: m.leader,
    leaderName,
    lead: m.lead,
    // A declared seat has a result, not a lead: "won", never the live-count "ahead".
    leadLine: m.lead === null
      ? 'Nothing counted yet'
      : s.state === 'won'
        ? `${leaderName ?? 'No one'} won${m.other ? ` (v ${partyName(m.other)})` : ''} by ${points(m.lead)}`
        : `${leaderName ?? 'No one'} ahead${m.other ? ` of ${partyName(m.other)}` : ''} by ${points(m.lead)}`,
    changes,
    firstLeader,
    counted: s.pct === null ? null : Math.round(s.pct),
    declared: s.state === 'won',
    wrongPair: outside && s.tcp?.b ? { a: s.tcp.a, b: s.tcp.b, outsider: outside.party, leads: outside.leads } : null,
  }
}

/**
 * VE-290: the party outside the VEC's pair that the pair is in doubt over: one that leads on first preferences (shown at any
 * count, since a sim seat can start wrong from the first figure), else the app's own pairInDoubt test.
 */
function pairOutsider(s: Seat): { party: PartyBucket; leads: boolean } | null {
  const t = s.tcp
  if (!t || !t.b || s.tcpWithheld) return null
  const fp = (s.fp ?? []).filter((f) => f.party !== 'OTH')
  const top = fp.reduce<(typeof fp)[number] | null>((m, f) => (m === null || f.pct > m.pct ? f : m), null)
  if (top && top.party !== t.a && top.party !== t.b) return { party: top.party, leads: true }
  if (pairInDoubt(s)) {
    const out = fp.filter((f) => f.party !== t.a && f.party !== t.b).reduce<(typeof fp)[number] | null>((m, f) => (m === null || f.pct > m.pct ? f : m), null)
    if (out) return { party: out.party, leads: false }
  }
  return null
}

/**
 * Hour marks for the trend's x axis: each whole hour inside the night, as a share (0 to 1) of the way along the line. The
 * line spaces ticks evenly (derive/pulse.ts sparkPath), so a time between two ticks is placed by interpolating between
 * them. A long night keeps every second hour so the labels never crowd.
 */
export function trendMarks(times: readonly number[], label: (t: number) => string): { x: number; label: string }[] {
  const n = times.length
  if (n < 2) return []
  const HOUR = 3_600_000
  const t0 = times[0]!
  const t1 = times[n - 1]!
  const out: { x: number; label: string; t: number }[] = []
  let i = 0
  for (let t = Math.ceil(t0 / HOUR) * HOUR; t <= t1; t += HOUR) {
    while (i < n - 2 && times[i + 1]! < t) i++
    const a = times[i]!
    const b = times[i + 1]!
    const frac = b > a ? (t - a) / (b - a) : 0
    out.push({ x: Math.round(((i + frac) / (n - 1)) * 1e4) / 1e4, label: label(t), t })
  }
  const kept = out.length > 6 ? out.filter((_, k) => k % 2 === 0) : out
  return kept.map(({ x, label: l }) => ({ x, label: l }))
}
