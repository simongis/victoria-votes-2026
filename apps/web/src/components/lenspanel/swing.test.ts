import { describe, expect, it } from 'vitest'
import type { DistrictStatic, PartyBucket } from '@vic26/schema'
import type { Seat } from '../../derive/seats'
import { markSentence } from '../../derive/arrows'
import { challengerChange, challengerOf, didNotStand, shownMovers, filterSwing, fpMovers, moversSentence, moversText, rowSentence, swingCounts, swingRows, swingSummary, withBaseline } from './swing'
import type { FpBaseline } from './swing'

const st = (over: Partial<DistrictStatic> = {}) => ({ base_tcp_party_a: 'ALP', base_tcp_party_b: 'LIB', base_tcp_pct_a: 55, ...over }) as DistrictStatic
const seat = (over: Partial<Seat> = {}): Seat =>
  ({ id: 1, name: 'Albert Park', leader: 'ALP', state: 'firm', tcp: { a: 'ALP', b: 'LIB', pctA: 60 }, pct: 75, baseNote: '2022', fp: [], ...over }) as Seat

/** A Labor v Coalition seat with a chosen swing (toward Labor is positive) against a 55 per cent baseline. */
const lvc = (id: number, name: string, pts: number, over: Partial<Seat> = {}) => seat({ id, name, tcp: { a: 'ALP', b: 'LIB', pctA: 55 + pts }, ...over })
/** A Greens v Labor seat: not Labor v Coalition. */
const other = (id: number, name: string, over: Partial<Seat> = {}) =>
  seat({ id, name, leader: 'GRN', tcp: { a: 'GRN', b: 'ALP', pctA: 52 }, fp: [{ party: 'GRN', votes: 300, pct: 33 }, { party: 'ALP', votes: 250, pct: 30 }], ...over })

const statics = (...ids: number[]) => new Map(ids.map((id) => [id, st()]))

describe('swingRows', () => {
  it('ranks arrows by the size of the swing, biggest first, whichever way', () => {
    const rows = swingRows([lvc(1, 'A', 2), lvc(2, 'B', -6), lvc(3, 'C', 4)], statics(1, 2, 3))
    expect(rows.map((r) => r.name)).toEqual(['B', 'C', 'A'])
    expect(rows.map((r) => r.filter)).toEqual(['coalition', 'labor', 'labor'])
  })
  it('puts little change after the arrows, then too early, then the other contests, then seats with no count', () => {
    const rows = swingRows(
      [seat({ id: 9, name: 'Nil', tcp: null, pct: null }), other(8, 'Other'), lvc(7, 'Early', 3, { pct: 20 }), lvc(6, 'Flat', 0.2), lvc(5, 'Arrow', 3)],
      statics(5, 6, 7, 8, 9),
    )
    expect(rows.map((r) => r.name)).toEqual(['Arrow', 'Flat', 'Early', 'Other', 'Nil'])
  })
  it('VE-215 A15: a too-early other contest sits with the too-early seats, ahead of the other contests that have a change', () => {
    const base = new Map([[8, { GRN: 29.5 } as Partial<Record<PartyBucket, number>>]])
    const rows = swingRows([other(8, 'Known'), other(9, 'EarlyOther', { pct: 20 }), lvc(7, 'Early', 3, { pct: 20 }), lvc(5, 'Arrow', 3)], statics(5, 7, 8, 9), base)
    expect(rows.map((r) => r.name)).toEqual(['Arrow', 'Early', 'EarlyOther', 'Known'])
  })
  it('puts a flat seat and a too-early seat in no direction filter', () => {
    const rows = swingRows([lvc(1, 'Flat', 0.2), lvc(2, 'Early', 3, { pct: 20 })], statics(1, 2))
    expect(rows.map((r) => r.filter)).toEqual([null, null])
  })
  it('carries the size of the swing for the number column, unsigned (the arrow says which way)', () => {
    const [r] = swingRows([lvc(1, 'A', -3.25)], statics(1))
    expect(r!.size).toBeCloseTo(3.25)
  })
})

describe('the other contests', () => {
  it('are the seats whose top two are not Labor v Coalition', () => {
    const [r] = swingRows([other(1, 'Brunswick')], statics(1))
    expect(r!.filter).toBe('other')
    expect(r!.detail?.party).toBe('GRN')
  })
  it('say too early under the swing threshold, never a figure', () => {
    const [r] = swingRows([other(1, 'Brunswick', { pct: 30 })], statics(1))
    expect(r!.detail?.early).toBe(true)
    expect(r!.detail?.change).toBeNull()
  })
  it('show the change in the challenger first preferences when a 2022 baseline is given', () => {
    const base = new Map([[1, { GRN: 29.5 } as Partial<Record<PartyBucket, number>>]])
    const [r] = swingRows([other(1, 'Brunswick')], statics(1), base)
    expect(r!.detail?.change).toBeCloseTo(3.5)
    expect(r!.detail?.share).toBeCloseTo(33)
  })
  it('show only the current share without a baseline, so no change is invented', () => {
    const [r] = swingRows([other(1, 'Brunswick')], statics(1))
    expect(r!.detail?.change).toBeNull()
    expect(r!.detail?.share).toBeCloseTo(33)
  })
  it('rank by the size of the change, ahead of seats with no change to show', () => {
    const base = new Map([[2, { GRN: 20 } as Partial<Record<PartyBucket, number>>]])
    const rows = swingRows([other(1, 'Albert'), other(2, 'Zed')], statics(1, 2), base)
    expect(rows.map((r) => r.name)).toEqual(['Zed', 'Albert'])
  })
})

describe('challengerOf and challengerChange', () => {
  it('is the finalist that is neither Labor nor a Coalition party', () => {
    expect(challengerOf(other(1, 'x'))).toBe('GRN')
    expect(challengerOf(seat({ tcp: { a: 'LIB', b: 'IND', pctA: 52 } }))).toBe('IND')
  })
  it('is null for Labor v Coalition and with no pair yet', () => {
    expect(challengerOf(seat())).toBeNull()
    expect(challengerOf(seat({ tcp: null }))).toBeNull()
    expect(challengerOf(seat({ tcp: { a: 'ALP', b: null, pctA: 50 } }))).toBeNull()
  })
  it('is null when the party has no first preferences now or no baseline', () => {
    expect(challengerChange(other(1, 'x', { fp: [] }), { GRN: 20 })).toBeNull()
    expect(challengerChange(other(1, 'x'), undefined)).toBeNull()
    expect(challengerChange(other(1, 'x'), {})).toBeNull()
  })
})

// VE-224: the average is over the seats it names, never a bare average (the seats where Labor fell furthest leave the pairing).
describe('swingSummary', () => {
  it('counts the ready Labor v Coalition seats and gives the average swing and its direction', () => {
    const rows = swingRows([lvc(1, 'A', 2), lvc(2, 'B', 4), lvc(3, 'C', 1, { pct: 10 }), other(4, 'D')], statics(1, 2, 3, 4))
    expect(swingSummary(rows)).toBe('2 of 3 Labor v Coalition seats ready; average swing in these 2 seats 3.0 points to Labor.')
  })
  it('says toward the Coalition when the average is negative', () => {
    const rows = swingRows([lvc(1, 'A', -2), lvc(2, 'B', -1)], statics(1, 2))
    expect(swingSummary(rows)).toBe('2 of 2 Labor v Coalition seats ready; average swing in these 2 seats 1.5 points to the Coalition.')
  })
  it('says no average when it rounds to nothing', () => {
    const rows = swingRows([lvc(1, 'A', 2), lvc(2, 'B', -2)], statics(1, 2))
    expect(swingSummary(rows)).toBe('2 of 2 Labor v Coalition seats ready; no average swing in these 2 seats.')
  })
  it('gives no average while every Labor v Coalition seat is too early, and says so when there are none', () => {
    expect(swingSummary(swingRows([lvc(1, 'A', 2, { pct: 5 })], statics(1)))).toBe('0 of 1 Labor v Coalition seats ready.')
    expect(swingSummary([])).toBe('No seat ready to compare yet.')
  })
  it('at Final says compared, not ready (VE-167)', () => {
    const rows = swingRows([lvc(1, 'A', 2), lvc(2, 'B', 4)], statics(1, 2))
    expect(swingSummary(rows, true)).toBe('2 of 2 Labor v Coalition seats compared; average swing in these 2 seats 3.0 points to Labor.')
    expect(swingSummary([], true)).toBe('No seat to compare.')
  })
})

describe('filterSwing and swingCounts', () => {
  const rows = swingRows([lvc(1, 'Alpha', 4), lvc(2, 'Bravo', -5), other(3, 'Charlie'), lvc(4, 'Delta', 2)], statics(1, 2, 3, 4))
  it('counts each filter over every row, not narrowed by search', () => {
    expect(swingCounts(rows)).toEqual({ labor: 2, coalition: 1, other: 1 })
  })
  it('narrows by filter and by a name search together, keeping the order', () => {
    expect(filterSwing(rows, 'labor', '').map((r) => r.name)).toEqual(['Alpha', 'Delta'])
    expect(filterSwing(rows, null, 'ta').map((r) => r.name)).toEqual(['Delta'])
    expect(filterSwing(rows, 'labor', 'ALP').map((r) => r.name)).toEqual(['Alpha'])
    expect(filterSwing(rows, null, '').length).toBe(4)
  })
})

describe('rowSentence', () => {
  it('reuses the stage sentence for the two-candidate rows', () => {
    const [r] = swingRows([lvc(1, 'Albert Park', 5)], statics(1))
    expect(rowSentence(r!)).toBe(markSentence(r!.mark))
  })
  it('says too early for another contest under the threshold, without a figure', () => {
    const [r] = swingRows([other(1, 'Brunswick', { pct: 30 })], statics(1))
    expect(rowSentence(r!)).toBe('Brunswick: Greens are in the top two. Too early to compare first preferences (30.0% counted).')
  })
  it('gives the change in first preferences, up or down, with the baseline', () => {
    const up = swingRows([other(1, 'Brunswick')], statics(1), new Map([[1, { GRN: 29.5, ALP: 30 }]]))[0]!
    expect(rowSentence(up)).toBe('Brunswick: since 2022, first preferences changed most for Greens up 3.5 points. 75.0% counted.')
    const down = swingRows([other(1, 'Brunswick')], statics(1), new Map([[1, { GRN: 36, ALP: 30 }]]))[0]!
    expect(rowSentence(down)).toContain('Greens down 3.0 points')
  })
  it('gives only the current share, and says why, when there is no baseline', () => {
    const [r] = swingRows([other(1, 'Brunswick')], statics(1))
    expect(rowSentence(r!)).toBe('Brunswick: Greens first preferences 33.0% so far. No 2022 comparison for first preferences yet. 75.0% counted.')
  })
})

describe('fpMovers (VE-130: change in first preferences for every party)', () => {
  const s = other(1, 'Brunswick', { fp: [{ party: 'GRN', votes: 1, pct: 40 }, { party: 'ALP', votes: 1, pct: 26 }, { party: 'LIB', votes: 1, pct: 12 }, { party: 'OTH', votes: 1, pct: 22 }] })
  const base = { GRN: 33.9, ALP: 30, LIB: 12.1, OTH: 5 }
  it('lists each party that moved, biggest first, with its share now', () => {
    const m = fpMovers(s, base)
    expect(m.map((x) => x.party)).toEqual(['GRN', 'ALP'])
    expect(m[0]!.change).toBeCloseTo(6.1)
    expect(m[0]!.share).toBe(40)
    expect(m[1]!.change).toBeCloseTo(-4)
  })
  it('leaves out the catch-all Other bucket and moves under a tenth of a point', () => {
    expect(fpMovers(s, base).some((x) => x.party === 'OTH' || x.party === 'LIB')).toBe(false)
  })
  it('marks a party that did not stand last time as new, never a gain from nothing, after the parties that moved (VE-226, finding 8)', () => {
    const m = fpMovers(other(1, 'x', { fp: [{ party: 'ONP', votes: 1, pct: 9 }, { party: 'GRN', votes: 1, pct: 30 }] }), { GRN: 30, NAT: 4 })
    expect(m.map((x) => [x.party, x.fresh])).toEqual([['NAT', false], ['ONP', true]])
    expect(m[0]!.change).toBe(-4)
    expect(m[0]!.share).toBe(0)
    expect(m[1]!.share).toBe(9)
    expect(moversText(m)).toBe('Nationals -4.0, One Nation 9.0%, did not stand in 2022')
    expect(moversSentence(m, '2022')).toBe('First preferences: Nationals down 4.0 points since 2022; One Nation 9.0%, did not stand in 2022.')
    expect(moversSentence([m[1]!], '2022')).toBe('First preferences: One Nation 9.0%, did not stand in 2022.')
  })
  it('shows a party new to the seat in place of the second-biggest change, so a big newcomer is never hidden (VE-224)', () => {
    const m = fpMovers(other(1, 'Lara', { fp: [{ party: 'ALP', votes: 1, pct: 34 }, { party: 'ONP', votes: 1, pct: 30 }, { party: 'LIB', votes: 1, pct: 14 }] }), { ALP: 48, LIB: 21 })
    expect(shownMovers(m).map((x) => x.party)).toEqual(['ALP', 'ONP'])
    expect(moversText(m)).toBe('Labor -14.0, One Nation 30.0%, did not stand in 2022')
    expect(moversSentence(m, '2022')).toBe('First preferences: Labor down 14.0 points since 2022; One Nation 30.0%, did not stand in 2022.')
  })
  it('names the contest a party did not stand in', () => {
    expect(didNotStand('2022')).toBe('did not stand in 2022')
    expect(didNotStand('2025 by-election')).toBe('did not stand in the 2025 by-election')
  })
  it('is empty without a baseline or under the swing threshold', () => {
    expect(fpMovers(s, undefined)).toEqual([])
    expect(fpMovers({ ...s, pct: 30 }, base)).toEqual([])
  })
})

describe('the other contests with a baseline (VE-130)', () => {
  const fp = [{ party: 'GRN' as const, votes: 1, pct: 40 }, { party: 'ALP' as const, votes: 1, pct: 26 }]
  const base: FpBaseline = new Map([[1, { GRN: 33.9, ALP: 30 }]])
  it('carry the movers and rank by the biggest mover', () => {
    const rows = swingRows([other(2, 'Small', { fp: [{ party: 'GRN', votes: 1, pct: 31 }] }), other(1, 'Big', { fp })], statics(1, 2), new Map([...base, [2, { GRN: 30 }]]))
    expect(rows.map((r) => r.name)).toEqual(['Big', 'Small'])
    expect(rows[0]!.detail!.movers.map((m) => m.party)).toEqual(['GRN', 'ALP'])
  })
  it('say the two biggest changes in plain words', () => {
    const [r] = swingRows([other(1, 'Brunswick', { fp })], statics(1), base)
    expect(rowSentence(r!)).toBe('Brunswick: since 2022, first preferences changed most for Greens up 6.1 points and Labor down 4.0 points. 75.0% counted.')
  })
  it('show the two biggest changes in the row value', () => {
    const [r] = swingRows([other(1, 'Brunswick', { fp })], statics(1), base)
    expect(moversText(r!.detail!.movers)).toBe('Greens +6.1, Labor -4.0')
  })
  it('can be added to rows built without a baseline, and stay in rank order', () => {
    const plain = swingRows([other(2, 'Zed', { fp }), other(1, 'Albert', { fp }), lvc(3, 'Arrow', 3)], statics(1, 2, 3))
    const withBase = withBaseline(plain, new Map([[2, { GRN: 20, ALP: 26 }]]))
    expect(withBase.map((r) => r.name)).toEqual(['Arrow', 'Zed', 'Albert'])
    expect(withBase[1]!.detail!.movers[0]!.change).toBeCloseTo(20)
    expect(withBase[0]).toBe(plain.find((r) => r.name === 'Arrow'))
  })
})
