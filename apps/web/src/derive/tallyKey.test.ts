import { describe, expect, it } from 'vitest'
import { bucketFor, type PartyBucket } from '@vic26/schema'
import { keyOthers, raceChips, raceHeadline, raceLanes, raceStatus } from './tallyKey'
import { headlineText } from './headline'
import type { Tally } from './seats'

describe('keyOthers (VE-131)', () => {
  it('keeps One Nation out of Others and always gives it a chip, even on no seats', () => {
    expect(keyOthers(() => 0)).toEqual({ onp: true, others: [] })
  })
  it('lists only the independents and small parties that lead a seat', () => {
    expect(keyOthers((q) => (q === 'IND' ? 2 : q === 'ONP' ? 1 : 0))).toEqual({ onp: true, others: ['IND'] })
    expect(keyOthers((q) => (q === 'IND' || q === 'OTH' ? 1 : 0)).others).toEqual(['IND', 'OTH'])
  })
})

// VE-269: the race to 45 (mockup D2). Two lanes, the 45 line, chips for the rest.
const zero = (): Record<PartyBucket, number> => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0 })
const tally = (firm: Partial<Record<PartyBucket, number>>, leading: Partial<Record<PartyBucket, number>> = {}): Tally => ({ firm: { ...zero(), ...firm }, leading: { ...zero(), ...leading } })
const won = (w: Partial<Record<PartyBucket, number>>) => ({ ...zero(), ...w })

describe('raceLanes', () => {
  it('gives the lanes to the two contenders with the most seats, biggest first', () => {
    expect(raceLanes(tally({ LIB: 20, NAT: 5 }, { LIB: 5, ALP: 20 }))).toEqual(['COA', 'ALP'])
    expect(raceLanes(tally({ ALP: 30 }, { LIB: 10, NAT: 2 }))).toEqual(['ALP', 'COA'])
  })
  it('Liberal and Nationals count together as the Coalition', () => {
    expect(raceLanes(tally({ ALP: 10, LIB: 6, NAT: 6 }, { ONP: 11 }))).toEqual(['COA', 'ONP'])
  })
  it('One Nation takes the lane when it passes Labor', () => {
    expect(raceLanes(tally({ LIB: 30, ONP: 12 }, { ALP: 9 }))).toEqual(['COA', 'ONP'])
  })
  it('one early seat does not throw Labor off a lane: a third party needs more seats than Labor and at least 5', () => {
    expect(raceLanes(tally({ LIB: 11 }, { ONP: 1 }))).toEqual(['COA', 'ALP'])
    expect(raceLanes(tally({ LIB: 11, ALP: 2 }, { ONP: 4 }))).toEqual(['COA', 'ALP'])
    expect(raceLanes(tally({ LIB: 11, ALP: 2 }, { ONP: 5 }))).toEqual(['COA', 'ONP'])
    expect(raceLanes(tally({ LIB: 11, ALP: 5 }, { ONP: 5 }))).toEqual(['COA', 'ALP'])
    expect(raceLanes(tally({ LIB: 11 }, { GRN: 6 }))).toEqual(['COA', 'GRN'])
  })
  it('a third party that passes both takes the smaller lane, never the bigger one', () => {
    expect(raceLanes(tally({ LIB: 11, ALP: 8, ONP: 20 }))).toEqual(['ONP', 'COA'])
  })
  it('before any figures, and on ties, Labor then Coalition', () => {
    expect(raceLanes(tally({}))).toEqual(['ALP', 'COA'])
    expect(raceLanes(tally({ LIB: 5, ALP: 5 }))).toEqual(['ALP', 'COA'])
  })
  it('independents and other parties are blocs, never a lane', () => {
    expect(raceLanes(tally({ IND: 40, OTH: 30 }, { ALP: 1, LIB: 1 }))).toEqual(['ALP', 'COA'])
  })
})

describe('raceChips', () => {
  const seats = (t: Tally) => (q: PartyBucket) => t.firm[q] + t.leading[q]
  it('lists every party with seats that has no lane, One Nation always', () => {
    const t = tally({ ALP: 20, LIB: 20, GRN: 2, IND: 1, OTH: 3 })
    expect(raceChips(seats(t), ['ALP', 'COA'])).toEqual({ greens: true, onp: true, others: ['IND', 'OTH'] })
  })
  it('leaves out Greens at zero, and any party that already has a lane', () => {
    const t = tally({ ALP: 20, LIB: 20, ONP: 25 })
    expect(raceChips(seats(t), ['COA', 'ONP'])).toEqual({ greens: false, onp: false, others: [] })
  })
  it('Victorian Socialists (any party the feed does not name) and independents each get a chip once they hold a seat', () => {
    // An affiliation id outside the known five lands in the Other parties bucket; an independent in Independents.
    expect(bucketFor(123, false)).toBe('OTH')
    expect(bucketFor(null, true)).toBe('IND')
    const t = tally({ ALP: 20, LIB: 20, OTH: 1 })
    expect(raceChips(seats(t), ['ALP', 'COA']).others).toEqual(['OTH'])
    expect(raceChips(seats(tally({ ALP: 20, LIB: 20, IND: 1 })), ['ALP', 'COA']).others).toEqual(['IND'])
  })
  it('a Greens lane drops the Greens chip', () => {
    const t = tally({ GRN: 30, ALP: 20 })
    expect(raceChips(seats(t), ['GRN', 'ALP']).greens).toBe(false)
  })
})

describe('raceStatus', () => {
  it('shows the plain 45 line until someone passes it', () => {
    expect(raceStatus(tally({ ALP: 20 }, { LIB: 15 }), zero(), zero())).toEqual({ kind: 'open', who: null, label: '45 to win' })
  })
  it('the line takes the colour of the first contender whose won plus leading reaches 45', () => {
    expect(raceStatus(tally({ LIB: 28 }, { LIB: 15, NAT: 2 }), zero(), won({ LIB: 45 }))).toEqual({ kind: 'on-track', who: 'COA', label: 'Coalition past 45' })
    expect(raceStatus(tally({ ALP: 20 }, { ALP: 25 }), zero(), won({ ALP: 45 }))).toEqual({ kind: 'on-track', who: 'ALP', label: 'Labor past 45' })
  })
  it('exactly 45 counts', () => {
    expect(raceStatus(tally({ ALP: 45 }), zero(), won({ ALP: 45 })).kind).toBe('on-track')
    expect(raceStatus(tally({ ALP: 44 }), zero(), won({ ALP: 44 })).kind).toBe('open')
  })
  it('VE-285 (option A): early leads reaching 45 colour the line and say "ahead in N", never "past 45" or "on track"', () => {
    const early = tally({ ALP: 10 }, { ALP: 40 })
    expect(raceStatus(early, zero(), won({ ALP: 20 }))).toEqual({ kind: 'ahead', who: 'ALP', label: 'Labor ahead in 50' })
    expect(raceStatus(tally({ LIB: 5, NAT: 1 }, { LIB: 39 }), zero(), zero()).label).toBe('Coalition ahead in 45')
    expect(raceStatus(tally({ ALP: 10 }, { ALP: 34 }), zero(), won({ ALP: 20 })).label).toBe('45 to win')
    expect(raceStatus(early, zero(), won({ ALP: 45 })).label).toBe('Labor past 45')
  })
  it('45 declared (VE-257) is a majority, not just on track', () => {
    expect(raceStatus(tally({ LIB: 40, NAT: 6 }), won({ LIB: 39, NAT: 6 }), won({ LIB: 40, NAT: 6 }))).toEqual({ kind: 'majority', who: 'COA', label: 'Coalition has 45' })
    // A firm seat the VEC has not declared never counts as declared.
    expect(raceStatus(tally({ LIB: 46 }), won({ LIB: 44 }), won({ LIB: 46 })).kind).toBe('on-track')
  })
})

describe('raceHeadline', () => {
  // `sure` is the seats at likely or better (won, firm or likely), which early leads are not.
  const base = { declared: zero(), countedPct: 40, allDeclared: false, sure: won({ LIB: 43, NAT: 2, ALP: 30 }) }
  const text = (p: ReturnType<typeof raceHeadline>) => (p ? headlineText(p) : null)
  it('names the party on track for a majority, in its side colour', () => {
    const parts = raceHeadline({ ...base, tally: tally({ LIB: 28, NAT: 2 }, { LIB: 15 }) })
    expect(text(parts)).toBe('Coalition on track for a majority')
    expect(parts!.find((x) => x.side)?.side).toBe('COA')
  })
  it('waits for 45 seats that are won, firm or likely: early leads alone are not on track', () => {
    const lead = tally({ LIB: 28, NAT: 2 }, { LIB: 15 })
    expect(text(raceHeadline({ ...base, tally: lead, sure: won({ LIB: 20, NAT: 2 }) }))).toBe('Coalition leads in 45 seats. 45 wins a majority.')
    expect(text(raceHeadline({ ...base, tally: lead, sure: won({ LIB: 43, NAT: 2 }) }))).toBe('Coalition on track for a majority')
    expect(text(raceHeadline({ ...base, tally: lead, sure: won({ LIB: 43, NAT: 1 }) }))).toBe('Coalition leads in 45 seats. 45 wins a majority.')
  })
  it('VE-285: early leads past 45 say what is led and what wins, never "more than the 45 it needs"', () => {
    const early = tally({ ALP: 6 }, { ALP: 48 })
    expect(text(raceHeadline({ ...base, tally: early, sure: won({ ALP: 6 }) }))).toBe('Labor leads in 54 seats. 45 wins a majority.')
    expect(text(raceHeadline({ ...base, tally: tally({ GRN: 3 }, { GRN: 43 }), sure: zero() }))).toBe('Greens lead in 46 seats. 45 wins a majority.')
    expect(text(raceHeadline({ ...base, tally: early, sure: won({ ALP: 45 }) }))).toBe('Labor on track for a majority')
  })
  it('leaves has a majority (45 declared) and Final to the existing headline', () => {
    expect(raceHeadline({ ...base, tally: tally({ LIB: 46 }), declared: won({ LIB: 45 }) })).toBeNull()
    expect(raceHeadline({ ...base, tally: tally({ LIB: 46 }), allDeclared: true })).toBeNull()
  })
  it('says no one is on track once nearly every seat has figures and no one is near', () => {
    expect(text(raceHeadline({ ...base, tally: tally({ LIB: 25 }, { LIB: 5, ALP: 31, ONP: 12, GRN: 4, IND: 3 }) }))).toBe('No one on track for 45')
  })
  it('before that, and before the headline names anyone, the existing wording stands', () => {
    expect(raceHeadline({ ...base, sure: zero(), tally: tally({ LIB: 20 }, { ALP: 12 }) })).toBeNull()
    expect(raceHeadline({ ...base, countedPct: 2, tally: tally({ LIB: 50 }) })).toBeNull()
    expect(raceHeadline({ ...base, tally: tally({}) })).toBeNull()
  })
})

// VE-289: a hung night. The 45 line, the lanes and the headline never claim a result no one has.
describe('hung parliament (VE-289)', () => {
  const hung = tally({ LIB: 34, NAT: 8, ALP: 29, ONP: 13, GRN: 4 })
  const decl = won({ LIB: 34, NAT: 8, ALP: 29, ONP: 13, GRN: 4 })
  it('Final: the 45 line stays neutral and says 45 to win; lanes are Coalition and Labor; One Nation is a chip', () => {
    expect(raceStatus(hung, decl, decl)).toEqual({ kind: 'open', who: null, label: '45 to win' })
    expect(raceLanes(hung)).toEqual(['COA', 'ALP'])
    expect(raceChips((q) => (q === 'ONP' ? 13 : q === 'GRN' ? 4 : 0), ['COA', 'ALP'])).toEqual({ greens: true, onp: true, others: [] })
  })
  it('the line returns to neutral when an early 45-plus lead falls back below 45', () => {
    const early = tally({ LIB: 5 }, { LIB: 36, NAT: 5 })
    expect(raceStatus(early, zero(), zero()).label).toBe('Coalition ahead in 46')
    expect(raceStatus(tally({ LIB: 34, NAT: 8 }), zero(), won({ LIB: 34, NAT: 8 })).label).toBe('45 to win')
  })
  it('44 won is not 45, the Coalition on 45 only counts as Liberal plus Nationals', () => {
    expect(raceStatus(tally({ ALP: 44 }), won({ ALP: 44 }), won({ ALP: 44 })).label).toBe('45 to win')
    expect(raceStatus(tally({ LIB: 37, NAT: 8 }), won({ LIB: 37, NAT: 8 }), won({ LIB: 37, NAT: 8 }))).toEqual({ kind: 'majority', who: 'COA', label: 'Coalition has 45' })
  })
  it('a tie for most seats keeps Labor first and the line neutral', () => {
    const tie = tally({ LIB: 30, NAT: 4, ALP: 34, ONP: 16, GRN: 4 })
    expect(raceLanes(tie)).toEqual(['ALP', 'COA'])
    expect(raceStatus(tie, zero(), zero()).kind).toBe('open')
  })
  it('once 80 seats have figures and no one is near, "No one on track for 45"; at Final the headline is left to headlineParts', () => {
    const night = tally({}, { LIB: 40, ALP: 34, ONP: 10, GRN: 4 })
    expect(text(raceHeadline({ tally: night, declared: zero(), countedPct: 60, allDeclared: false, sure: zero() }))).toBe('No one on track for 45')
    expect(raceHeadline({ tally: hung, declared: decl, countedPct: 100, allDeclared: true, sure: decl })).toBeNull()
  })
})
function text(p: ReturnType<typeof raceHeadline>) { return p ? headlineText(p) : null }

describe('raceStatus under the headline threshold (VE-289)', () => {
  it('names no side on the 45 line before HEADLINE_MIN_PCT is counted (the headline says too early to call)', () => {
    const early = tally({ LIB: 5, NAT: 1 }, { LIB: 41 })
    expect(raceStatus(early, zero(), zero(), 4.2)).toEqual({ kind: 'open', who: null, label: '45 to win' })
    expect(raceStatus(early, zero(), zero(), 5).label).toBe('Coalition ahead in 47')
    expect(raceStatus(early, zero(), zero()).label).toBe('Coalition ahead in 47')
  })
})
