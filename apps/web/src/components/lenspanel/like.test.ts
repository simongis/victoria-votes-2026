import { describe, expect, it } from 'vitest'
import type { Seat } from '../../derive/seats'
import { LIKE_MEASURES, MIN_SHARED, buildTable, distanceBetween, likeRows, likeSummary, nearestIds, sameLeader, standardise, voteLine, type LikeTable } from './like'

const KEYS = LIKE_MEASURES.map((m) => m.key)
/** A table row with every measure set to the same value, then overrides. */
const row = (v: number, over: Record<string, number | null> = {}) => Object.fromEntries(KEYS.map((k) => [k, over[k] === undefined ? v : over[k]]))
const table = (rows: Record<number, Record<string, number | null>>): LikeTable => new Map(Object.entries(rows).map(([id, r]) => [Number(id), r]))

const seat = (id: number, name: string, over: Partial<Seat> = {}): Seat =>
  ({ id, name, leader: null, state: 'none', tcp: null, marginVotes: null, stillToCount: null, tcpWithheld: false, pct: null, inDoubt: false, changing: false, base: 'ALP', baseNote: '2022', fp: [], ...over }) as Seat

describe('standardise', () => {
  it('turns each measure into z-scores across the seats (mean 0, spread 1)', () => {
    const z = standardise(table({ 1: row(10), 2: row(20), 3: row(30) }))
    const first = KEYS.map((_k, i) => z.get(1)![i]!).filter((_v, i) => !LIKE_MEASURES[i]!.log)
    expect(first.every((v) => Math.abs(v + 1.2247) < 1e-3)).toBe(true) // population sd
    expect(z.get(2)![0]).toBeCloseTo(0, 9)
  })
  it('gives 0 to every seat on a measure that does not vary', () => {
    const z = standardise(table({ 1: row(5), 2: row(5) }))
    expect(z.get(1)!.every((v) => v === 0)).toBe(true)
  })
  it('keeps a missing value missing and leaves it out of the mean and spread', () => {
    const z = standardise(table({ 1: row(10, { pct_renting: null }), 2: row(20), 3: row(30) }))
    const i = KEYS.indexOf('pct_renting')
    expect(z.get(1)![i]).toBeNull()
    expect(z.get(2)![i]).toBeCloseTo(-1, 9) // only 20 and 30 count: mean 25, sd 5
    expect(z.get(3)![i]).toBeCloseTo(1, 9)
  })
  it('uses the log of density so a few crowded inner seats do not squash the rest', () => {
    const z = standardise(table({ 1: row(1, { people_per_km2: 10 }), 2: row(1, { people_per_km2: 100 }), 3: row(1, { people_per_km2: 1000 }) }))
    const i = KEYS.indexOf('people_per_km2')
    expect(z.get(2)![i]).toBeCloseTo(0, 9)
    expect(z.get(1)![i]).toBeCloseTo(-z.get(3)![i]!, 9)
  })
})

describe('distanceBetween', () => {
  it('is zero for the same profile and grows with the gap', () => {
    const a = [0, 0, 0, 0, 0, 0]
    expect(distanceBetween(a, a)).toBe(0)
    expect(distanceBetween(a, [1, 1, 1, 1, 1, 1])).toBeCloseTo(1, 9)
  })
  it('averages over the measures both seats have, so a gap in the data does not make a seat look closer', () => {
    expect(distanceBetween([0, 0, 0, 0, 0, null], [2, 2, 2, 2, 2, 2])).toBeCloseTo(2, 9)
  })
  it('is null when the seats share fewer than the minimum measures', () => {
    const a = [0, 0, null, null, null, null]
    expect(MIN_SHARED).toBeGreaterThan(2)
    expect(distanceBetween(a, [0, 0, 0, 0, 0, 0])).toBeNull()
  })
})

describe('nearestIds', () => {
  const z = standardise(table({ 1: row(10), 2: row(11), 3: row(13), 4: row(20), 5: row(30), 6: row(31), 7: row(50) }))
  it('lists the nearest first and never the seat itself', () => {
    expect(nearestIds(1, z, 3)).toEqual([2, 3, 4])
  })
  it('breaks ties by seat id so the order is the same every time', () => {
    const flat = { people_per_km2: 100 }
    const t = standardise(table({ 1: row(10, flat), 2: row(20, flat), 3: row(0, flat), 4: row(30, flat), 5: row(40, flat) }))
    expect(nearestIds(2, t, 2)).toEqual([1, 4]) // 1 and 4 are both 10 away: the lower id first
  })
  it('skips seats it cannot compare and returns fewer than asked if it must', () => {
    const t = standardise(table({ 1: row(10), 2: row(12), 3: row(0, Object.fromEntries(KEYS.map((k) => [k, null]))) }))
    expect(nearestIds(1, t, 5)).toEqual([2])
  })
  it('is empty for a seat that is not in the table or has no measures', () => {
    expect(nearestIds(99, z, 5)).toEqual([])
  })
})

describe('buildTable', () => {
  it('joins the three sources by district and leaves a seat missing from one source with nulls for it', () => {
    const t = buildTable(
      [{ district_id: 1, pct_born_overseas: 30, pct_renting: 40, pct_bachelor_plus: 50 }],
      [{ district_id: 1, pct_trades_labour: 20, people_per_km2: 500 }, { district_id: 2, pct_trades_labour: 25, people_per_km2: 5 }],
      [{ district_id: 1, pct_irsd_q1: 12 }],
    )
    expect(t.get(1)).toEqual({ pct_bachelor_plus: 50, pct_born_overseas: 30, pct_renting: 40, pct_trades_labour: 20, people_per_km2: 500, pct_irsd_q1: 12 })
    expect(t.get(2)).toMatchObject({ pct_trades_labour: 25, pct_bachelor_plus: null, pct_irsd_q1: null })
  })
})

describe('likeRows and likeSummary', () => {
  const seats = new Map([seat(1, 'Alpha', { base: 'ALP' }), seat(2, 'Beta', { base: 'ALP' }), seat(3, 'Gamma', { base: 'LIB' }), seat(4, 'Delta', { base: 'GRN' })].map((s) => [s.id, s]))
  const z = standardise(table({ 1: row(10), 2: row(12), 3: row(20), 4: row(40) }))

  it('with no seat picked lists every seat by name', () => {
    const rows = likeRows(seats.values(), z, null, 2)
    expect(rows.map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Delta', 'Gamma'])
    expect(rows.every((r) => r.distance === null && r.rank === null)).toBe(true)
    expect(likeSummary(rows, null)).toBe('Pick a seat to see the seats most like it.')
  })
  it('with a seat picked ranks the rest nearest first and numbers the nearest few', () => {
    const rows = likeRows(seats.values(), z, 1, 2)
    expect(rows.map((r) => r.name)).toEqual(['Alpha', 'Beta', 'Gamma', 'Delta'])
    expect(rows.map((r) => r.rank)).toEqual([null, 1, 2, null])
    expect(rows[0]!.isPicked).toBe(true)
  })
  it('summarises in one sentence that names the nearest and how many share the leader', () => {
    const rows = likeRows(seats.values(), z, 1, 2)
    expect(likeSummary(rows, 1)).toBe('Most like Alpha: Beta, Gamma. 1 of 2 has the same leader.')
  })
  it('says so when the picked seat cannot be compared', () => {
    const t = standardise(table({ 1: row(0, Object.fromEntries(KEYS.map((k) => [k, null]))), 2: row(12) }))
    const rows = likeRows(seats.values(), t, 1, 2)
    expect(likeSummary(rows, 1)).toBe('Not enough figures to compare Alpha.')
  })
})

describe('sameLeader', () => {
  it('compares tonight\'s leaders when there are results, else the 2022 holders', () => {
    expect(sameLeader(seat(1, 'a', { leader: 'LIB', base: 'ALP' }), seat(2, 'b', { leader: 'LIB', base: 'GRN' }))).toBe(true)
    expect(sameLeader(seat(1, 'a', { base: 'ALP' }), seat(2, 'b', { base: 'ALP' }))).toBe(true)
    expect(sameLeader(seat(1, 'a', { base: 'ALP' }), seat(2, 'b', { base: 'LIB' }))).toBe(false)
    expect(sameLeader(seat(1, 'a', { base: null }), seat(2, 'b', { base: null }))).toBe(false)
  })
})

describe('voteLine', () => {
  it('gives the two-candidate split when there is one', () => {
    const s = seat(1, 'a', { leader: 'ALP', tcp: { a: 'ALP', b: 'LIB', pctA: 56.4 } })
    expect(voteLine(s)).toBe('Labor 56% v Liberal 44%')
  })
  it('names the leader before a split exists', () => {
    expect(voteLine(seat(1, 'a', { leader: 'GRN' }))).toBe('Greens leading')
  })
  it('before any count names the holder from the last election, in the words of the seat\'s own baseline', () => {
    expect(voteLine(seat(1, 'a', { base: 'LIB', baseNote: '2022' }))).toBe('Held by Liberal in 2022')
    expect(voteLine(seat(1, 'a', { base: 'ALP', baseNote: '2025 by-election' }))).toBe('Held by Labor in 2025 by-election')
  })
  it('says there is nothing to show when there is no leader and no holder', () => {
    expect(voteLine(seat(1, 'a', { base: null }))).toBe('No result yet')
  })
  it('when the second candidate is unknown shows the leader alone', () => {
    expect(voteLine(seat(1, 'a', { leader: 'IND', tcp: { a: 'IND', b: null, pctA: 60 } }))).toBe('Independent leading')
  })
})
