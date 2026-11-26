/**
 * Seat state, tally and headline from district history rows (ported from the VE-42c/VE-45b live-night mockup).
 * History is what scrubbing reads, so every tick derives from it alone; no full snapshot is needed.
 * The rules (firm lead, never call a seat) live here so they read in one place.
 */
import {
  IN_DOUBT_TCP_PCT,
  PARTY_BUCKETS,
  type DistrictHistoryRow,
  type DistrictStatic,
  type PartyBucket,
} from '@vic26/schema'
import { PARTY_NAMES } from '../parties'
import { votesRounded } from './panel'
import { enrolmentOf } from './enrolment'

export const SEATS = 88
export const MAJORITY = 45
/**
 * Turnout ceiling for "votes still to count". Deliberately a little above 2022's statewide turnout
 * (about 88% of enrolment, UNVERIFIED), because guessing turnout low would call leads firm too early.
 */
const TURNOUT_CEILING = 0.9
/** History rows carry only fp_total, so formal votes are estimated at this share of ballots. */
const FORMAL_RATE = 0.95

/**
 * ADR 0033 (VE-226): the middle colour step, "Likely", needs all three of these. The count floor is VE-127's 30% of
 * enrolment; 57% after preferences is the floor that made no wrong "Likely" call on the 2022 replay (one election, so a
 * floor, not a law); and preferences must cover at least half the counted votes, so a share from one or two booths is not
 * read as the seat's.
 */
export const LIKELY_FROM_PCT = 30
export const LIKELY_MIN_TCP_PCT = 57
export const PREFS_MIN_SHARE = 0.5

/** VE-226 (finding 3): a seat whose two-candidate count the VEC withholds. Its leader is a first-preference leader only. */
export const WITHHELD_LINE = 'Ahead on first preferences. The VEC is still working out the final two.'

export type SeatState = 'none' | 'leading' | 'firm' | 'won'

export interface FpShare {
  party: PartyBucket
  votes: number
  pct: number
}

export interface Seat {
  id: number
  name: string
  leader: PartyBucket | null
  state: SeatState
  /** Two-candidate-preferred pair; `a` is the leader (ingest orders it so). Null when withheld or not in. */
  tcp: { a: PartyBucket; b: PartyBucket | null; pctA: number } | null
  marginVotes: number | null
  /**
   * True when `marginVotes` is the actual gap counted after preferences (preferences cover under half the counted votes, so
   * a projection would overstate it, ADR 0033); false when it is the share applied to every counted vote.
   */
  marginCounted: boolean
  /** Share of the counted formal votes that preferences have been counted for, 0 to 1; null when the source cannot say. */
  prefsShare: number | null
  /** The middle colour step (ADR 0033): leading, not certain, and past the count, margin and preference floors. */
  likely: boolean
  /** Our estimate of formal votes not yet counted (see FIRM_RULE). */
  stillToCount: number | null
  tcpWithheld: boolean
  pct: number | null
  /** Could still change: close, or counted with no count after preferences yet. The same set as ingest's seats_in_doubt. */
  inDoubt: boolean
  /** VE-226 (finding 7): close on a real count (under IN_DOUBT_TCP_PCT after preferences) or withheld; what "N close" counts. */
  close: boolean
  /** Counted, but no count after preferences yet: unknown rather than close. */
  noPrefs: boolean
  changing: boolean
  base: PartyBucket | null
  baseNote: string
  /** First preferences by party bucket, largest first; parties with no votes left out. */
  fp: FpShare[]
}

/** Prahran and Narracan are measured against later contests, so "2022" would be wrong for them. */
const BASE_NOTE: Record<DistrictStatic['base_source'], string> = {
  SE2022: '2022',
  PRAHRAN_BY_2025: '2025 by-election',
  NARRACAN_SUPP_2023: '2023 supplementary',
}

export const seatName = (st: DistrictStatic): string => st.district_name.replace(/ District$/, '')
export const partyName = (p: PartyBucket | null): string => (p ? PARTY_NAMES[p] : 'No one')

export function blankSeat(st: DistrictStatic): Seat {
  return {
    id: st.district_id,
    name: seatName(st),
    leader: null,
    state: 'none',
    tcp: null,
    marginVotes: null,
    marginCounted: false,
    prefsShare: null,
    likely: false,
    stillToCount: null,
    tcpWithheld: false,
    pct: null,
    inDoubt: false,
    close: false,
    noPrefs: false,
    changing: false,
    base: st.base_winner_party,
    baseNote: BASE_NOTE[st.base_source] ?? '2022',
    fp: [],
  }
}

function fpShares(r: DistrictHistoryRow): FpShare[] {
  const parties = PARTY_BUCKETS.map((party) => ({ party, votes: r[`fp_${party}`] ?? 0 })).filter((f) => f.votes > 0)
  // Formal votes (the party sum), not fp_total: that counts informal ballots too and reads about 5 points low against VEC.
  const formal = parties.reduce((n, f) => n + f.votes, 0)
  if (formal <= 0) return []
  return parties.sort((a, b) => b.votes - a.votes).map((f) => ({ ...f, pct: (100 * f.votes) / formal }))
}

/**
 * The seat's leader at one tick: the 2CP leader, else the first-preference leader, as ingest does, so the tally agrees
 * with the status table. A declared seat prefers the VEC's Elected winner (ADR 0034), which the two-candidate pair can
 * miss; when the row has none (the districts layer's flag is merged in by winners.ts, ADR 0036) it falls back to that
 * same leader, so a declared seat is never left without a party just because a field is missing.
 */
function leaderOf(r: DistrictHistoryRow): PartyBucket | null {
  if (r.status === 'declared' && r.elected_party) return r.elected_party
  const withheld = r.tcp_withheld === true
  return !withheld && r.tcp_party_a !== null ? r.tcp_party_a : r.lead_party
}

/**
 * Votes counted after preferences in the seat at this tick. VE-226 seam: the district history in the contract carries the
 * 2CP share but not the votes it is built on, so this is null (unknown) until the schema adds them; the rules below then
 * fall back to the count and margin floors alone.
 */
function tcpVotesOf(r: DistrictHistoryRow): number | null {
  void r
  return null
}

/**
 * One seat at one tick. "Firm" (shown as certain) is an estimate: counted ballots stand in for the 2CP total, which runs a
 * little ahead of the real 2CP count (VE-45b found agreement with exact figures on 946 of 968 seat-ticks, misses mostly
 * firm a tick early). "Won" is VEC's declared status and nothing else. `tcpVotes` is the votes counted after
 * preferences when the source has them (ADR 0033): under half the counted votes, the lead is the actual gap and the seat is
 * neither Likely nor certain.
 */
export function seatFromHistory(
  r: DistrictHistoryRow,
  st: DistrictStatic,
  tcpVotes: number | null = tcpVotesOf(r),
  // VE-247: never st.enrolment (the 2022 baseline on the live layer). Null leaves the estimate unknown rather than wrong.
  enrolment: number | null = enrolmentOf(r),
): Seat {
  const blank = blankSeat(st)
  const withheld = r.tcp_withheld === true
  const declared = r.status === 'declared'
  const leader = leaderOf(r)
  const counted = (r.fp_total ?? 0) > 0
  const tcp = !withheld && r.tcp_party_a !== null && r.tcp_pct_a !== null ? { a: r.tcp_party_a, b: r.tcp_party_b, pctA: r.tcp_pct_a } : null

  let marginVotes: number | null = null
  let marginCounted = false
  // VE-215 A1: every seat with an enrolment carries an estimate, including seats with nothing counted yet, so the statewide
  // total can only fall as ballots are counted. It used to count only seats with a two-candidate figure, so it rose as seats reported.
  const formalCounted = (r.fp_total ?? 0) * FORMAL_RATE
  let stillToCount: number | null = enrolment ? Math.max(0, Math.round(enrolment * TURNOUT_CEILING * FORMAL_RATE - formalCounted)) : null
  const prefsShare = tcp && tcpVotes !== null && formalCounted > 0 ? Math.min(1, tcpVotes / formalCounted) : null
  // Unknown coverage does not block: the count and margin floors still apply (see tcpVotesOf).
  const prefsEnough = prefsShare === null || prefsShare >= PREFS_MIN_SHARE
  let firm = false
  if (tcp && counted && enrolment) {
    const gap = Math.abs(2 * tcp.pctA - 100) / 100
    if (prefsEnough) {
      marginVotes = Math.round(gap * formalCounted)
      // Only a seat with a two-candidate count can be firm.
      firm = marginVotes > (stillToCount ?? 0)
    } else {
      // Finding 4: a share from a sliver of the count is not applied to every counted vote; say the gap actually counted.
      marginVotes = Math.round(gap * (tcpVotes ?? 0))
      marginCounted = true
    }
  }
  // VE-153: a declared seat is finished, whatever the turnout estimate says, so the band never claims votes to come once every seat is declared.
  if (declared) stillToCount = 0
  const close = !declared && (withheld || (r.tcp_pct_a !== null && r.tcp_pct_a < IN_DOUBT_TCP_PCT))
  const noPrefs = !declared && !withheld && r.tcp_pct_a === null && counted
  // A declared seat is Won; its party comes from the Elected flag or the 2CP fallback (ADR 0036).
  const state: SeatState = declared ? 'won' : leader === null ? 'none' : firm ? 'firm' : 'leading'
  const likely = state === 'leading' && tcp !== null && (r.pct_counted ?? 0) >= LIKELY_FROM_PCT && tcp.pctA >= LIKELY_MIN_TCP_PCT && prefsEnough

  return {
    ...blank,
    leader,
    state,
    tcp,
    marginVotes,
    marginCounted,
    prefsShare,
    likely,
    stillToCount,
    tcpWithheld: withheld,
    pct: r.pct_counted,
    // Same set as ingest's deriveStatus, so the count matches status.seats_in_doubt.
    inDoubt: close || noPrefs,
    close,
    noPrefs,
    changing: leader !== null && blank.base !== null && leader !== blank.base,
    fp: fpShares(r),
  }
}

/** Every district at one tick, blank where the tick has no row for it. */
export function seatsFromRows(
  rows: readonly DistrictHistoryRow[],
  statics: Iterable<DistrictStatic>,
  /** Enrolment per district (enrolment.ts); absent, each row's own is derived from its counted figures. */
  enrolment?: ReadonlyMap<number, number>,
): Map<number, Seat> {
  const byId = new Map(rows.map((r) => [r.district_id, r]))
  const out = new Map<number, Seat>()
  for (const st of statics) {
    const r = byId.get(st.district_id)
    out.set(st.district_id, r ? seatFromHistory(r, st, tcpVotesOf(r), enrolment ? (enrolment.get(st.district_id) ?? null) : enrolmentOf(r)) : blankSeat(st))
  }
  return out
}

export interface Tally {
  firm: Record<PartyBucket, number>
  leading: Record<PartyBucket, number>
}

const zero = (): Record<PartyBucket, number> => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0 })

export function tallyOf(seats: Map<number, Seat>): Tally {
  const t: Tally = { firm: zero(), leading: zero() }
  for (const s of seats.values()) {
    if (!s.leader) continue
    if (s.state === 'firm' || s.state === 'won') t.firm[s.leader] += 1
    else t.leading[s.leader] += 1
  }
  return t
}

/** Labor and the Coalition are the two sides people count; everyone else is crossbench. */
export type Side = 'ALP' | 'COA' | Exclude<PartyBucket, 'ALP' | 'LIB' | 'NAT'>
export const SIDES: readonly Side[] = ['ALP', 'COA', 'GRN', 'ONP', 'IND', 'OTH']
export const SIDE_NAMES: Record<Side, string> = {
  ALP: 'Labor',
  COA: 'Coalition',
  GRN: 'Greens',
  ONP: 'One Nation',
  IND: 'Independents',
  OTH: 'Other parties',
}

export function sideTotals(t: Tally): Record<Side, { firm: number; all: number }> {
  const of = (...ps: PartyBucket[]) => ({
    firm: ps.reduce((a, p) => a + t.firm[p], 0),
    all: ps.reduce((a, p) => a + t.firm[p] + t.leading[p], 0),
  })
  return { ALP: of('ALP'), COA: of('LIB', 'NAT'), GRN: of('GRN'), ONP: of('ONP'), IND: of('IND'), OTH: of('OTH') }
}

/** One plain line. It reports leads and never calls government: a lead, even a firm one, is not a VEC result. */
export function headlineOf(t: Tally): string {
  const sides = sideTotals(t)
  const ranked = [...SIDES].sort((a, b) => sides[b].all - sides[a].all)
  const first = ranked[0]!
  const second = ranked[1]!
  if (sides[first].all === 0) return 'Waiting for the first figures'
  if (sides[first].all === sides[second].all) return `${SIDE_NAMES[first]} and ${SIDE_NAMES[second]} level on ${sides[first].all}`
  return `${SIDE_NAMES[first]} ahead in ${sides[first].all} seats`
}

/** `inDoubt` matches ingest's seats_in_doubt; `close` is what the band's "N close" says (VE-226, finding 7). */
export function statsOf(seats: Map<number, Seat>): { inDoubt: number; close: number; changing: number; reporting: number } {
  let inDoubt = 0
  let close = 0
  let changing = 0
  let reporting = 0
  for (const s of seats.values()) {
    if (s.inDoubt) inDoubt += 1
    if (s.close) close += 1
    if (s.changing) changing += 1
    if (s.leader) reporting += 1
  }
  return { inDoubt, close, changing, reporting }
}

export const FIRM_RULE =
  "Certain means the lead is bigger than the votes still to come. Only the VEC calls a seat: Won."

/** Estimated formal votes still to count across the state; null until at least one seat has an estimate. */
export function stillToCountTotal(seats: Map<number, Seat>): number | null {
  let total = 0
  let any = false
  let withLeader = 0
  let allWon = true
  for (const s of seats.values()) {
    if (s.leader) {
      withLeader += 1
      if (s.state !== 'won') allWon = false
    }
    if (s.stillToCount === null) continue
    total += s.stillToCount
    any = true
  }
  // VE-215 A1: at the Final every seat with a result is declared, so nothing is left. A seat with no result at all (the 2022
  // Narracan postponement) would otherwise keep a full estimate and the band would never read "Nothing left to count".
  if (withLeader > 0 && allWon) return 0
  return any ? total : null
}

/** A vote count in words for an estimate: "about 1.2 million", "about 480,000". Never more precise than the estimate. */
export function aboutVotes(n: number): string {
  if (n <= 0) return 'none'
  if (n >= 950_000) return `about ${Number((n / 1_000_000).toFixed(1))} million`
  const step = n >= 100_000 ? 10_000 : 1_000
  return `about ${(Math.round(n / step) * step).toLocaleString('en-AU')}`
}

const au = new Intl.NumberFormat('en-AU')

/**
 * VE-139: the final-two (two-candidate) count only includes booths that have finished preferences, so it covers fewer
 * votes than first preferences do (Lara at 9 pm: 4,691 against 15,846). This line says so, so the two never read as one
 * count. Null when the feed gives no final-two votes, or when the count already covers everything counted.
 */
export function tcpBasisLine(tcpVotes: number, formalCounted: number): string | null {
  if (tcpVotes <= 0 || formalCounted <= 0 || tcpVotes >= formalCounted) return null
  return `Preferences counted for ${au.format(tcpVotes)} of ${au.format(formalCounted)} votes`
}

/**
 * VE-226 (finding 4): while preferences cover under half the counted votes, the lead is the gap actually counted after
 * preferences, with the votes it is out of. Exact figures: these are counts, not estimates.
 */
export function countedLeadLine(leader: string, gap: number, tcpVotes: number | null): string {
  const of = tcpVotes === null ? '' : ` of ${au.format(tcpVotes)}`
  if (gap <= 0) return tcpVotes === null ? `${leader} level on the votes counted after preferences.` : `${leader} level on ${au.format(tcpVotes)} votes counted after preferences.`
  return `${leader} ahead by ${au.format(gap)}${of} votes counted after preferences.`
}

/**
 * The seat panel's lead line (VE-226, finding 4). `pair` is the two candidates' votes after preferences and `formal` the
 * formal first-preference votes, when the source has candidates. While preferences cover under half the counted votes the
 * line is the gap actually counted; otherwise the VE-139 projection. Null for a declared seat or one with no count after
 * preferences (a withheld seat has its own line).
 */
export function panelLeadLine(s: Seat, pair: { a: number; b: number } | null, formal: number | null): string | null {
  if (s.state === 'won' || !s.tcp) return null
  const name = PARTY_NAMES[s.tcp.a]
  const total = pair ? pair.a + pair.b : 0
  if (pair && formal && total > 0 && total / formal < PREFS_MIN_SHARE) return countedLeadLine(name, Math.abs(pair.a - pair.b), total)
  if (s.marginCounted && s.marginVotes !== null) return countedLeadLine(name, s.marginVotes, null)
  if (s.marginVotes === null || s.stillToCount === null) return null
  return projectedLeadLine(s.marginVotes, s.stillToCount)
}

/**
 * VE-139: the seat's lead, named as a projection (the final-two share applied to every counted vote), beside the
 * estimate of votes to count. Both share that all-votes base; neither is the final-two vote gap, which is smaller.
 */
export function projectedLeadLine(margin: number, stillToCount: number): string {
  const m = votesRounded(margin)
  const lead = `If the rest of the vote splits the same way, the lead would be ${m === 0 ? 'under 100' : `about ${au.format(m)}`}.`
  const left = votesRounded(stillToCount)
  return `${lead} ${left === 0 ? 'Nothing left to count.' : `About ${au.format(left)} votes still to count.`}`
}
