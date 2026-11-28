import type { PartyBucket } from '@vic26/schema'
import { HEADLINE_MIN_PCT, type HeadlinePart } from './headline'
import { agree } from '../parties'
import { MAJORITY, SIDES, sideTotals, type Tally } from './seats'

/** The small-party bucket the tally key groups as "Others". One Nation is not in it (VE-131). */
export const OTHERS_KEY: PartyBucket[] = ['IND', 'OTH']

/**
 * What the tally key shows beyond Labor, Greens and the Coalition. One Nation always has its own chip: every 2026
 * Victorian poll since February has it well ahead of the Greens (docs/research/one-nation-polling-2026.md), so a key
 * without it would hide the party people expect to see, even at zero seats. Independents and the small parties join the
 * Others group only once they lead a seat.
 */
export function keyOthers(seatsOf: (q: PartyBucket) => number): { onp: true; others: PartyBucket[] } {
  return { onp: true, others: OTHERS_KEY.filter((q) => seatsOf(q) > 0) }
}

// VE-269 (ADR 0023, race to 45): two lanes to one shared 45 line, then chips for everyone else.

/** The parties that can take a lane. Independents and the small parties are blocs of many people, not one contender. */
export type Contender = 'ALP' | 'COA' | 'ONP' | 'GRN'
const CONTENDERS: readonly Contender[] = ['ALP', 'COA', 'ONP', 'GRN']

const seatsOfSide = (t: Tally, c: Contender): number => sideTotals(t)[c].all

/** A third party needs this many seats (won plus leading) before it can take a lane: one early seat must not throw Labor or the Coalition off. */
export const LANE_MIN_SEATS = 5

/**
 * Coalition and Labor have the lanes. One Nation or the Greens take the second lane only when they have more seats than
 * the smaller of the two and at least LANE_MIN_SEATS; the bigger lane stays. Biggest first; a tie keeps Labor first.
 */
export function raceLanes(t: Tally): [Contender, Contender] {
  const n = (c: Contender) => seatsOfSide(t, c)
  const big = (a: Contender, b: Contender) => (n(b) > n(a) ? [b, a] : [a, b]) as [Contender, Contender]
  const [first, second] = big('ALP', 'COA')
  const challenger = (['ONP', 'GRN'] as const).filter((c) => n(c) >= LANE_MIN_SEATS && n(c) > n(second)).sort((a, b) => n(b) - n(a))[0]
  return challenger ? big(first, challenger) : [first, second]
}

/** Who gets a chip under the lanes: Greens once they hold a seat, One Nation always (VE-131), and the others that lead a seat. A party with a lane has no chip. */
export function raceChips(seatsOf: (q: PartyBucket) => number, lanes: readonly Contender[]): { greens: boolean; onp: boolean; others: PartyBucket[] } {
  return {
    greens: !lanes.includes('GRN') && seatsOf('GRN') > 0,
    onp: !lanes.includes('ONP'),
    others: keyOthers(seatsOf).others,
  }
}

export interface RaceStatus {
  kind: 'open' | 'ahead' | 'on-track' | 'majority'
  /** The contender whose colour the 45 line takes; null while no one has reached it. */
  who: Contender | null
  /** The words on the 45 line. */
  label: string
}

const NAMES: Record<Contender, string> = { ALP: 'Labor', COA: 'Coalition', ONP: 'One Nation', GRN: 'Greens' }
export const contenderName = (c: Contender): string => NAMES[c]

const declaredOfSide = (c: Contender, d: Record<PartyBucket, number>): number => (c === 'COA' ? d.LIB + d.NAT : d[c])

/**
 * The 45 moment. Won, firm or likely seats at 45 or more is "on track" (VE-285: early leads alone are not, the same rule
 * as the "on track" headline); 45 the VEC has declared (VE-257: a firm seat that is not declared never counts) is a
 * majority. 45 of 88 can only be reached by one party, so the first found is the one. `sure` is the seats at likely or
 * better by party.
 */
export function raceStatus(t: Tally, declared: Record<PartyBucket, number>, sure: Record<PartyBucket, number>, countedPct: number | null = null): RaceStatus {
  // VE-289: below the headline threshold the headline names no one ("too early to call"), so the 45 line stays neutral too.
  if (countedPct !== null && countedPct < HEADLINE_MIN_PCT) return { kind: 'open', who: null, label: `${MAJORITY} to win` }
  const top = [...CONTENDERS].sort((a, b) => seatsOfSide(t, b) - seatsOfSide(t, a))[0]!
  if (declaredOfSide(top, declared) >= MAJORITY) return { kind: 'majority', who: top, label: `${NAMES[top]} has ${MAJORITY}` }
  if (declaredOfSide(top, sure) >= MAJORITY) return { kind: 'on-track', who: top, label: `${NAMES[top]} past ${MAJORITY}` }
  // VE-285 (option A): early leads that reach 45 colour the line but say only "ahead": a lead is not a result.
  const lead = seatsOfSide(t, top)
  if (lead >= MAJORITY) return { kind: 'ahead', who: top, label: `${NAMES[top]} ahead in ${lead}` }
  return { kind: 'open', who: null, label: `${MAJORITY} to win` }
}

/**
 * "No one on track for 45" means something only once nearly every seat has figures: earlier, a leader on 40 with 30
 * seats still blank is simply ahead. The mockup Simon approved used 80 of 88.
 */
export const NO_ONE_MIN_SEATS = 80

/**
 * The race's headline, or null to leave it to headlineParts (before the headline names anyone, at "has a majority" with
 * 45 declared, and at Final, where headlineParts already says it right).
 */
/**
 * `sure` is the seats at likely or better (won, firm or likely) by party. "On track" needs 45 of those: 45 early leads are
 * not (at 5% counted a Labor lead of 50 early seats is just a lead), so before that the existing wording stands.
 */
export function raceHeadline(a: { tally: Tally; declared: Record<PartyBucket, number>; countedPct: number; allDeclared: boolean; sure: Record<PartyBucket, number> }): HeadlinePart[] | null {
  if (a.allDeclared || a.countedPct < HEADLINE_MIN_PCT) return null
  const withFigures = SIDES.reduce((n, s) => n + sideTotals(a.tally)[s].all, 0)
  if (withFigures === 0) return null
  const st = raceStatus(a.tally, a.declared, a.sure)
  if (st.kind === 'majority') return null
  if (st.kind === 'on-track') {
    const sure = declaredOfSide(st.who!, a.sure)
    return sure >= MAJORITY ? [{ text: NAMES[st.who!], side: st.who! }, { text: ' on track for a majority' }] : null
  }
  // VE-285: won plus leading reach 45 on early leads: a lead, and what wins, not "more than the 45 it needs".
  const top = [...CONTENDERS].sort((x, y) => seatsOfSide(a.tally, y) - seatsOfSide(a.tally, x))[0]!
  const topSeats = seatsOfSide(a.tally, top)
  if (topSeats >= MAJORITY) return [{ text: NAMES[top], side: top }, { text: ` ${agree(NAMES[top], 'leads', 'lead')} in ${topSeats} seats. ${MAJORITY} wins a majority.` }]
  if (withFigures >= NO_ONE_MIN_SEATS) return [{ text: `No one on track for ${MAJORITY}` }]
  return null
}
