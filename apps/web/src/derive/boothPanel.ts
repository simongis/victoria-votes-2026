/**
 * The polling place panel's numbers (VE-208), ported from the VE-206 prototype. Every figure is arithmetic on the booth
 * history rows, the booth statics and the seat at the time shown; nothing is typed in. Kept free of React so each state
 * (not reported, first preferences only, both counts, an early voting centre with no result, no 2022 match, the replay's
 * same-election swing, a lone place, a rewind) can be tested, and so the panel reads the same `at` as the stage.
 */
import { PARTY_BUCKETS, type PartyBucket } from '@vic26/schema'
import { boothAt, formalOf, type BoothRow, type BoothStatic } from '../components/booths/model'

/** What the panel needs of a seat at the time shown. `Seat` satisfies it. */
export interface SeatNow {
  id: number
  name: string
  /** The seat's final two; party A is the seat's leader. The booths layer's pair follows it. */
  tcp: { a: PartyBucket; b: PartyBucket | null; pctA: number } | null
  /** First preferences by party, formal votes. */
  fp: readonly { party: PartyBucket; votes: number; pct: number }[]
}

export interface PlaceMate {
  place: BoothStatic
  /** An early voting centre: when any has a result, "not cast at a polling place" no longer includes early votes. */
  isEvc?: boolean
  rows: readonly BoothRow[] | undefined
}

export interface PlaceInput {
  place: BoothStatic
  isEvc: boolean
  /** This place's history, oldest first. */
  rows: readonly BoothRow[] | undefined
  /** The time shown, epoch ms: the stage's tick, in Rewind or live. */
  at: number
  seat: SeatNow
  /** Every other place in the seat (election day and early voting). */
  mates: readonly PlaceMate[]
  /** The baseline is the same election as the count (the replay compares 2022 with 2022): swing means nothing and is left out. */
  sameElection: boolean
  /** Snapshot times of the night so far, oldest first, for the count over the night. */
  ticks: readonly number[]
}

export type PanelState = 'waiting' | 'first-preferences' | 'counted' | 'evc-no-result'

export type Swing = { kind: 'none' } | { kind: 'moved'; party: PartyBucket; points: number } | { kind: 'different-pair'; a: PartyBucket; b: PartyBucket }

export interface TwoCp {
  a: PartyBucket
  b: PartyBucket
  /** The seat leader's share, 0 to 100. */
  pctA: number
}

export interface PlacePanel {
  state: PanelState
  /** When the first place in the seat reported, up to the time shown. For the waiting state. */
  firstSeatAt: number | null
  /** When this place first reported, if by the time shown. */
  firstReportedAt: number | null
  /** Ballots counted here, informal included. */
  votes: number | null
  informalPct: number | null
  /** First preferences here, largest first. */
  fp: { party: PartyBucket; votes: number; pct: number }[]
  twoCp: TwoCp | null
  /** Under MIN_COMPARE_FORMAL formal votes here: the basics show, but no comparison, rank or swing. */
  tooFew: boolean
  swing: Swing
  /** An early voting centre with no result of its own: the seat's final two stands in, labelled as the seat's. */
  seatFallback: TwoCp | null
  vsSeat: { party: PartyBucket; here: number; seat: number; points: number } | null
  rank: { party: PartyBucket; rank: number; of: number; dots: { id: number; pct: number; formal: number; here: boolean }[] } | null
  share: { pctOfSeat: number; /** Null until votes not cast at a place have been counted: nothing counted is not zero. */ offPlacePct: number | null; party: PartyBucket; placesPct: number; otherPct: number | null; hasEvc: boolean } | null
  /** Ballots counted here at each tick up to the time shown. */
  series: number[]
}

/**
 * Fewest formal votes a place needs before it is compared with the seat or with other places (VE-208c, FB-249).
 * A handful of votes swings by many points on one ballot ("20 points stronger here" on 19 votes), which reads as news and is noise.
 */
export const MIN_COMPARE_FORMAL = 50

const round2 = (n: number): number => Math.round(n * 100) / 100

/** Party A's share of the seat's pair from a place's row, whichever way round the row counted it. Null when the row is on a different pair. */
function shareOfA(r: BoothRow, a: PartyBucket, b: PartyBucket): number | null {
  if (r.tcpPctA === null || r.tcpPctA === undefined || !r.tcpA) return null
  if (r.tcpA === a) return r.tcpPctA
  if (r.tcpA === b) return 100 - r.tcpPctA
  return null
}

const swingOf = (i: PlaceInput, pair: TwoCp): Swing => {
  const base = i.place.base
  if (i.sameElection || !base || base.match === 'none' || !base.a || !base.b || base.pctA === null) return { kind: 'none' }
  const same = (base.a === pair.a && base.b === pair.b) || (base.a === pair.b && base.b === pair.a)
  if (!same) return { kind: 'different-pair', a: base.a, b: base.b }
  const before = base.a === pair.a ? base.pctA : 100 - base.pctA
  return { kind: 'moved', party: pair.a, points: round2(pair.pctA - before) }
}

export function placePanel(i: PlaceInput): PlacePanel {
  const { seat, at } = i
  const pair = seat.tcp && seat.tcp.b ? { a: seat.tcp.a, b: seat.tcp.b, pctA: seat.tcp.pctA } : null
  const mine = boothAt(i.rows as BoothRow[] | undefined, at)
  const firstAts = [i.rows?.[0]?.at, ...i.mates.map((m) => m.rows?.[0]?.at)].filter((t): t is number => t !== undefined && t <= at)
  const firstSeatAt = firstAts.length ? Math.min(...firstAts) : null
  const empty: PlacePanel = { state: 'waiting', firstSeatAt, firstReportedAt: null, votes: null, informalPct: null, fp: [], twoCp: null, tooFew: false, swing: { kind: 'none' }, seatFallback: null, vsSeat: null, rank: null, share: null, series: [] }

  // A centre the source gives no results for (the 2022 replay): the seat stands in, and says so.
  if (i.isEvc && (i.rows?.length ?? 0) === 0) return { ...empty, state: 'evc-no-result', seatFallback: pair }
  const formal = mine ? formalOf(mine.fp) : 0
  if (!mine || formal <= 0) return empty

  const total = mine.total ?? formal
  const here = pair ? shareOfA(mine, pair.a, pair.b) : null
  const twoCp: TwoCp | null = pair && here !== null ? { ...pair, pctA: here } : null
  const fp = PARTY_BUCKETS.map((party) => ({ party, votes: mine.fp[party], pct: (100 * mine.fp[party]) / formal }))
    .filter((f) => f.votes > 0)
    .sort((x, y) => y.votes - x.votes)

  const out: PlacePanel = {
    ...empty,
    state: twoCp ? 'counted' : 'first-preferences',
    tooFew: formal < MIN_COMPARE_FORMAL,
    firstReportedAt: i.rows![0]!.at <= at ? i.rows![0]!.at : null,
    votes: total,
    informalPct: total > 0 && total >= formal ? (100 * (total - formal)) / total : null,
    fp,
    series: i.ticks.filter((t) => t <= at).map((t) => boothAt(i.rows as BoothRow[], t)?.total ?? 0),
  }
  if (!twoCp || !pair) return out
  out.twoCp = twoCp
  if (out.tooFew) return out
  out.swing = swingOf(i, twoCp)
  out.vsSeat = { party: pair.a, here: twoCp.pctA, seat: pair.pctA, points: round2(twoCp.pctA - pair.pctA) }

  // Rank and strip: the seat's places that have a result on the seat pair at this time, this one included.
  const dots: { id: number; pct: number; formal: number; here: boolean }[] = [{ id: i.place.id, pct: twoCp.pctA, formal, here: true }]
  for (const m of i.mates) {
    const r = boothAt(m.rows as BoothRow[] | undefined, at)
    const s = r ? shareOfA(r, pair.a, pair.b) : null
    if (r && s !== null && formalOf(r.fp) >= MIN_COMPARE_FORMAL) dots.push({ id: m.place.id, pct: s, formal: formalOf(r.fp), here: false })
  }
  // Places under the minimum stay out of the rank and the strip. Under three places a rank and a strip say nothing a bar does not.
  if (dots.length >= 3) out.rank = { party: pair.a, rank: 1 + dots.filter((d) => d.pct > twoCp.pctA).length, of: dots.length, dots }

  out.share = shareOf(i, formal, mine)
  return out
}

/** This place's share of the seat's formal votes, and what was not cast at any of the seat's places. Null when the places add up to more than the seat. */
function shareOf(i: PlaceInput, formal: number, mine: BoothRow): PlacePanel['share'] {
  const seatFormal = i.seat.fp.reduce((n, f) => n + f.votes, 0)
  if (seatFormal <= 0) return null
  const party = Object.fromEntries(PARTY_BUCKETS.map((p) => [p, mine.fp[p]])) as Record<PartyBucket, number>
  let places = formal
  let hasEvc = i.isEvc
  for (const m of i.mates) {
    const r = boothAt(m.rows as BoothRow[] | undefined, i.at)
    if (!r) continue
    places += formalOf(r.fp)
    for (const p of PARTY_BUCKETS) party[p] += r.fp[p]
    if (m.isEvc) hasEvc = true
  }
  if (places > seatFormal) return null
  const lead = i.seat.fp[0]!
  if (party[lead.party] > lead.votes) return null
  const rest = seatFormal - places
  return {
    pctOfSeat: (100 * formal) / seatFormal,
    offPlacePct: rest > 0 ? (100 * rest) / seatFormal : null,
    party: lead.party,
    placesPct: (100 * party[lead.party]) / places,
    otherPct: rest > 0 ? (100 * (lead.votes - party[lead.party])) / rest : null,
    hasEvc,
  }
}

// ---- words (kept here so they are tested with the numbers) ----

const ORDINAL: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }
export function ordinal(n: number): string {
  const r100 = n % 100
  if (r100 >= 11 && r100 <= 13) return `${n}th`
  return `${n}${ORDINAL[n % 10] ?? 'th'}`
}

export function rankWords(r: { rank: number; of: number }, party: string, seat: string): string {
  if (r.rank === 1) return `Best place in ${seat} for ${party}`
  if (r.rank === r.of) return `${party}'s weakest place in ${seat}`
  return `${ordinal(r.rank)} best for ${party} of ${r.of} places in ${seat}`
}

export function vsSeatWords(v: NonNullable<PlacePanel['vsSeat']>, party: string, seat: string): string {
  const pts = Math.abs(v.points).toFixed(1)
  if (pts === '0.0') return `${party} level with ${seat} here`
  return `${party} ${pts} points ${v.points > 0 ? 'stronger' : 'weaker'} here than across ${seat}`
}

/** The swing line, or null for no line at all (no match, or the replay's same-election baseline). A swing that rounds to nothing is "No change", never "0.0 pts". */
export function swingWords(s: Swing, partyName: (p: PartyBucket) => string, since: string): string | null {
  if (s.kind === 'none') return null
  if (s.kind === 'different-pair') return `Not comparable: ${since} counted ${partyName(s.a)} against ${partyName(s.b)}`
  const pts = Math.abs(s.points).toFixed(1)
  if (pts === '0.0') return `No change since ${since}`
  return `${pts} points ${s.points > 0 ? 'to' : 'away from'} ${partyName(s.party)} since ${since}`
}
