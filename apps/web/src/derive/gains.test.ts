import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import { GAINS_FROM_COUNTED_PCT, GAINS_WAIT, cardLine, cardWords, gainCards, gainShown, gainsAvailable, keptGain, netChange, shownGains, signedNet } from './gains'
import { LIKELY_FROM_PCT } from '../views/encoding'
import type { Seat } from './seats'

const seat = (id: number, name: string, leader: PartyBucket | null, base: PartyBucket | null, o: Partial<Seat> = {}): Seat =>
  ({
    id,
    name,
    leader,
    base,
    baseNote: '2022',
    state: 'leading',
    changing: leader !== null && base !== null && leader !== base,
    tcp: leader ? { a: leader, b: 'LIB', pctA: 52 } : null,
    inDoubt: false,
    pct: 50,
    // The fixtures read "past the bar" as Likely (ADR 0033 moved the bar off the count alone; seats.test.ts tests the rule).
    likely: o.pct === undefined || (o.pct !== null && o.pct >= 30),
    ...o,
  }) as Seat

const night = [
  seat(1, 'Hawthorn', 'ALP', 'LIB', { tcp: { a: 'ALP', b: 'LIB', pctA: 54.2 }, state: 'won', marginVotes: 3_140 }),
  seat(2, 'Richmond', 'GRN', 'ALP', { tcp: { a: 'GRN', b: 'ALP', pctA: 51 }, marginVotes: 40 }),
  seat(3, 'Brighton', 'IND', 'LIB', { tcp: { a: 'IND', b: 'LIB', pctA: 60 } }),
  seat(4, 'Melton', 'ALP', 'ALP'),
  seat(5, 'Sandringham', 'LIB', null),
  seat(6, 'Albert Park', 'GRN', 'ALP', { tcp: null }),
  seat(7, 'Bass', null, 'LIB'),
]

describe('gainShown (the one predicate, VE-166)', () => {
  const changed = (o: Partial<Seat>) => seat(9, 'X', 'ALP', 'LIB', { likely: false, ...o })
  it('hides a changed seat until its new leader is Likely (ADR 0033), whatever the count', () => {
    expect(LIKELY_FROM_PCT).toBe(30)
    expect(gainShown(changed({ pct: LIKELY_FROM_PCT - 0.1 }))).toBe(false)
    expect(gainShown(changed({ pct: 90 }))).toBe(false)
    expect(gainShown(changed({ pct: LIKELY_FROM_PCT, likely: true }))).toBe(true)
  })
  it('never shows a withheld seat as changing hands until it is declared (finding 3)', () => {
    expect(gainShown(changed({ pct: 90, tcp: null, tcpWithheld: true }))).toBe(false)
    expect(gainShown(changed({ pct: 90, tcp: null, tcpWithheld: true, state: 'won' }))).toBe(true)
  })
  it('lets a firm or won seat through below the bar', () => {
    expect(gainShown(changed({ pct: 12, state: 'firm' }))).toBe(true)
    expect(gainShown(changed({ pct: 12, state: 'won' }))).toBe(true)
    expect(gainShown(changed({ pct: 12, state: 'leading' }))).toBe(false)
  })
  it('never shows a seat that did not change hands', () => {
    expect(gainShown(seat(9, 'X', 'ALP', 'ALP', { pct: 90, state: 'won' }))).toBe(false)
  })
  it('treats a seat with no count as below the bar', () => {
    expect(gainShown(changed({ pct: null }))).toBe(false)
  })
})

describe('shownGains', () => {
  it('keeps the changed seats that pass the bar, and nothing else', () => {
    expect(shownGains(night).map((s) => s.name)).toEqual(['Hawthorn', 'Richmond', 'Brighton', 'Albert Park'])
    const early = [...night, seat(10, 'Early', 'ALP', 'LIB', { pct: 10 })]
    expect(shownGains(early).map((s) => s.name)).not.toContain('Early')
  })
})

describe('gainsAvailable', () => {
  it('is off below 20% of enrolment counted, on at 20%, given a seat that qualifies', () => {
    expect(GAINS_FROM_COUNTED_PCT).toBe(20)
    expect(gainsAvailable(night, 19.9)).toBe(false)
    expect(gainsAvailable(night, 20)).toBe(true)
  })
  it('is off while no seat qualifies, however much is counted', () => {
    expect(gainsAvailable([night[3]!, night[4]!], 60)).toBe(false)
    expect(gainsAvailable([seat(1, 'E', 'ALP', 'LIB', { pct: 29.9 })], 60)).toBe(false)
    expect(gainsAvailable([], 60)).toBe(false)
  })
  it('has a plain reason when off', () => {
    expect(GAINS_WAIT).toBe('Gains shows once about 20% is counted')
  })
})

describe('netChange', () => {
  it('counts gains and losses per party, biggest net first', () => {
    expect(netChange(night)).toEqual([
      { party: 'GRN', gains: 2, losses: 0, net: 2 },
      { party: 'IND', gains: 1, losses: 0, net: 1 },
      { party: 'ALP', gains: 1, losses: 2, net: -1 },
      { party: 'LIB', gains: 0, losses: 2, net: -2 },
    ])
  })
  it('lists a party whose gains and losses are level, with 0, so it can still be tapped', () => {
    const rows = netChange([seat(1, 'A', 'ALP', 'LIB'), seat(2, 'B', 'LIB', 'ALP')])
    expect(rows.map((r) => [r.party, r.net])).toEqual([['ALP', 0], ['LIB', 0]])
  })
  it('is empty with no change', () => {
    expect(netChange([night[3]!])).toEqual([])
  })
})

describe('signedNet', () => {
  it('uses a real minus sign, never a hyphen or dash', () => {
    expect(signedNet(6)).toBe('+6')
    expect(signedNet(-3)).toBe('−3')
    expect(signedNet(0)).toBe('0')
  })
})

describe('keptGain', () => {
  it('keeps every changed seat with no party tapped, and only that party gains with one', () => {
    expect(keptGain(night[1]!, null)).toBe(true)
    expect(keptGain(night[1]!, 'GRN')).toBe(true)
    expect(keptGain(night[1]!, 'ALP')).toBe(false)
    expect(keptGain(night[3]!, null)).toBe(false)
  })
  it('does not keep a changed seat below the bar', () => {
    expect(keptGain(seat(9, 'X', 'ALP', 'LIB', { pct: 29.9 }), null)).toBe(false)
    expect(keptGain(seat(9, 'X', 'ALP', 'LIB', { pct: 30 }), null)).toBe(true)
  })
})

describe('cards and net use the same predicate as the stage', () => {
  const early = seat(10, 'Early', 'GRN', 'ALP', { pct: 10 })
  const firmEarly = seat(11, 'FirmEarly', 'GRN', 'ALP', { pct: 10, state: 'firm' })
  const all = [...night, early, firmEarly]
  it('drops a below-bar seat from the cards and the net, and keeps a firm one', () => {
    expect(gainCards(all, null).map((c) => c.name)).toContain('FirmEarly')
    expect(gainCards(all, null).map((c) => c.name)).not.toContain('Early')
    expect(netChange(all).find((n) => n.party === 'GRN')!.gains).toBe(3)
    expect(gainCards(all, null).length).toBe(shownGains(all).length)
  })
})

describe('gainCards', () => {
  it('lists the changed seats, closest first, seats with no margin last', () => {
    expect(gainCards(night, null).map((c) => c.name)).toEqual(['Richmond', 'Hawthorn', 'Brighton', 'Albert Park'])
  })
  it('narrows to a tapped party gains', () => {
    expect(gainCards(night, 'GRN').map((c) => c.name)).toEqual(['Richmond', 'Albert Park'])
    expect(gainCards(night, 'NAT')).toEqual([])
  })
  it('says won only for a declared seat, and leads otherwise', () => {
    const cards = gainCards(night, null)
    expect(cards.find((c) => c.name === 'Hawthorn')!.words).toBe('won by about 3,100 votes')
    expect(cards.find((c) => c.name === 'Richmond')!.words).toBe('leads by under 100 votes')
    expect(cards.find((c) => c.name === 'Albert Park')!.words).toBe('leads')
    expect(cardWords(night[0]!)).toBe('won by about 3,100 votes')
  })
  it('card line names the party now ahead and never calls a lead a win (VE-168)', () => {
    const cards = gainCards(night, null)
    const line = (n: string) => cardLine(cards.find((c) => c.name === n)!)
    expect(line('Hawthorn')).toBe('Labor won by about 3,100 votes')
    // VE-226 (finding 17): plural party names take a plural verb.
    expect(line('Richmond')).toBe('Greens lead by under 100 votes')
    expect(line('Albert Park')).toBe('Greens lead')
  })
  it('names the old and new holder', () => {
    const c = gainCards(night, null).find((x) => x.name === 'Hawthorn')!
    expect([c.from, c.to]).toEqual(['LIB', 'ALP'])
  })
})
