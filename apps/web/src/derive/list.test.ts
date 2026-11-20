import { describe, expect, it } from 'vitest'
import type { DistrictStatic, PartyBucket } from '@vic26/schema'
import { LIKELY_FROM_PCT } from '../views/encoding'
import { filterRows, gainShown, latestFirst, listRow, marginPts, railCounts, resultWords, sortRows, swingOf, type ListRow } from './list'
import type { Seat } from './seats'

const seat = (id: number, name: string, leader: PartyBucket | null, state: Seat['state'], pctA: number | null, pct: number | null = 50, b: PartyBucket | null = 'LIB'): Seat =>
  ({ id, name, leader, state, tcp: pctA === null || !leader ? null : { a: leader, b, pctA }, pct, inDoubt: false, base: 'ALP', marginVotes: pctA === null || !leader ? null : Math.round(Math.abs(2 * pctA - 100) * 100) }) as Seat
const st = (a: PartyBucket | null, b: PartyBucket | null, pct: number | null): DistrictStatic => ({ base_tcp_party_a: a, base_tcp_party_b: b, base_tcp_pct_a: pct }) as DistrictStatic

describe('marginPts', () => {
  it('is the two-candidate gap in points, null without a 2CP figure', () => {
    expect(marginPts(seat(1, 'A', 'ALP', 'leading', 55))).toBeCloseTo(10)
    expect(marginPts(seat(1, 'A', 'ALP', 'leading', null))).toBeNull()
  })
})

describe('swingOf', () => {
  it("is the leader's 2CP now minus the same party in 2022, in points", () => {
    expect(swingOf(seat(1, 'A', 'ALP', 'leading', 55), st('ALP', 'LIB', 52))).toEqual({ party: 'ALP', pts: 3 })
    // 2022's second party now leads: its 2022 share is 100 minus party A's
    const s = swingOf(seat(1, 'A', 'LIB', 'leading', 54, 50, 'ALP'), st('ALP', 'LIB', 52))
    expect(s?.party).toBe('LIB')
    expect(s?.pts).toBeCloseTo(6)
  })
  it('is null when the pairing changed or either side has no figure', () => {
    expect(swingOf(seat(1, 'A', 'ALP', 'leading', 55, 50, 'GRN'), st('ALP', 'LIB', 52))).toBeNull()
    expect(swingOf(seat(1, 'A', 'ALP', 'leading', null), st('ALP', 'LIB', 52))).toBeNull()
    expect(swingOf(seat(1, 'A', 'ALP', 'leading', 55), st(null, null, null))).toBeNull()
    expect(swingOf(seat(1, 'A', 'ALP', 'leading', 55), undefined)).toBeNull()
  })
})

describe('listRow status', () => {
  const s = (seatv: Seat) => listRow(seatv, undefined).status
  it('names declared, firm, close, leading and too early', () => {
    expect(s(seat(1, 'A', 'ALP', 'won', 60))).toBe('Declared')
    expect(s(seat(1, 'A', 'ALP', 'firm', 70))).toBe('Certain')
    expect(s(seat(1, 'A', 'ALP', 'leading', 52))).toBe('Within 10 points')
    expect(s(seat(1, 'A', 'ALP', 'leading', 70))).toBe('Leading')
    expect(s(seat(1, 'A', null, 'none', null))).toBe('Too early')
  })
})

describe('sortRows', () => {
  const rows: ListRow[] = [
    listRow(seat(1, 'Bass', 'ALP', 'leading', 70, 30), undefined),
    listRow(seat(2, 'Albert Park', 'LIB', 'leading', 52, 80), undefined),
    listRow(seat(3, 'Corio', null, 'none', null, null), undefined),
    listRow(seat(4, 'Dandenong', 'ALP', 'won', 60, 100), undefined),
  ]
  const names = (r: ListRow[]) => r.map((x) => x.name)
  it('sorts by name both ways', () => {
    expect(names(sortRows(rows, 'name', 'asc'))).toEqual(['Albert Park', 'Bass', 'Corio', 'Dandenong'])
    expect(names(sortRows(rows, 'name', 'desc'))).toEqual(['Dandenong', 'Corio', 'Bass', 'Albert Park'])
  })
  it('sorts by margin with missing figures last in either direction', () => {
    expect(names(sortRows(rows, 'margin', 'asc'))).toEqual(['Albert Park', 'Dandenong', 'Bass', 'Corio'])
    expect(names(sortRows(rows, 'margin', 'desc'))).toEqual(['Bass', 'Dandenong', 'Albert Park', 'Corio'])
  })
  it('orders the Lead column by votes, which is what the column shows', () => {
    // A bigger point gap in a small seat can be fewer votes than a smaller gap in a big one.
    const small = { ...seat(1, 'Small', 'ALP', 'leading', 60), marginVotes: 900 } as Seat
    const big = { ...seat(2, 'Big', 'ALP', 'leading', 52), marginVotes: 2500 } as Seat
    expect(names(sortRows([listRow(big, undefined), listRow(small, undefined)], 'margin', 'asc'))).toEqual(['Small', 'Big'])
  })
  it('sorts by counted and by status order, never mutating the input', () => {
    expect(names(sortRows(rows, 'pct', 'desc'))).toEqual(['Dandenong', 'Albert Park', 'Bass', 'Corio'])
    expect(names(sortRows(rows, 'status', 'asc'))).toEqual(['Dandenong', 'Albert Park', 'Bass', 'Corio'])
    expect(names(rows)).toEqual(['Bass', 'Albert Park', 'Corio', 'Dandenong'])
  })
  it('breaks ties by name so the order is stable between ticks', () => {
    const tie = [listRow(seat(1, 'Zed', 'ALP', 'leading', 60), undefined), listRow(seat(2, 'Abe', 'ALP', 'leading', 60), undefined)]
    expect(names(sortRows(tie, 'margin', 'asc'))).toEqual(['Abe', 'Zed'])
  })
})

describe('filterRows', () => {
  const rows = [
    listRow(seat(1, 'Bass', 'ALP', 'leading', 70), undefined),
    listRow(seat(2, 'Albert Park', 'LIB', 'leading', 52), undefined),
    listRow(seat(3, 'Mornington', 'NAT', 'leading', 60), undefined),
    listRow(seat(4, 'Corio', null, 'none', null), undefined),
  ]
  it('keeps every row with no focus and no query', () => {
    expect(filterRows(rows, null, '')).toHaveLength(4)
  })
  it('filters by party focus, the Coalition covering Liberal and Nationals', () => {
    expect(filterRows(rows, 'ALP', '').map((r) => r.id)).toEqual([1])
    expect(filterRows(rows, 'COA', '').map((r) => r.id)).toEqual([2, 3])
  })
  it('searches names case-insensitively, ignoring surrounding space', () => {
    expect(filterRows(rows, null, '  PARK ').map((r) => r.id)).toEqual([2])
    expect(filterRows(rows, 'COA', 'orn').map((r) => r.id)).toEqual([3])
    expect(filterRows(rows, null, 'zzz')).toEqual([])
  })
})

describe('latestFirst', () => {
  const rows = [
    listRow(seat(1, 'Bass', 'ALP', 'leading', 70), undefined),
    listRow(seat(2, 'Albert Park', 'LIB', 'leading', 52), undefined),
    listRow(seat(3, 'Mornington', 'NAT', 'leading', 60), undefined),
    listRow(seat(4, 'Corio', null, 'none', null), undefined),
  ]
  it('puts the most recently counted seats first and keeps the rest in their order', () => {
    const fresh = new Map([[3, 1], [1, 0.4]])
    expect(latestFirst(rows, fresh).map((r) => r.id)).toEqual([3, 1, 2, 4])
  })
  it('breaks equal freshness by the incoming order, and does nothing with nothing fresh', () => {
    expect(latestFirst(rows, new Map([[4, 1], [2, 1]])).map((r) => r.id)).toEqual([2, 4, 1, 3])
    expect(latestFirst(rows, new Map()).map((r) => r.id)).toEqual([1, 2, 3, 4])
  })
})

describe('rail status filters (VE-96)', () => {
  const mk = (id: number, over: Partial<Seat>): ListRow => listRow({ ...seat(id, `S${id}`, 'ALP', 'leading', 60), changing: false, ...over } as Seat, undefined)
  const rows = [
    mk(1, { inDoubt: true, close: true }),
    mk(2, { changing: true, likely: true }),
    mk(3, { state: 'won' }),
    mk(4, { state: 'won', changing: true }),
    mk(5, {}),
    mk(6, { inDoubt: true, noPrefs: true }),
  ]
  it('keeps in doubt, changing hands or won seats', () => {
    // VE-226 (finding 7): the Close seats list keeps the seats waiting for preferences (after the close ones, SeatsRail)...
    expect(filterRows(rows, null, '', 'doubt').map((r) => r.id)).toEqual([1, 6])
    // VE-168 (FB-198): "changing" follows Gains' gainShown, so seat 2 (leading, 60% counted, past the bar) and seat 4 (won) both pass
    expect(filterRows(rows, null, '', 'changing').map((r) => r.id)).toEqual([2, 4])
    expect(filterRows(rows, null, '', 'won').map((r) => r.id)).toEqual([3, 4])
    expect(filterRows(rows, null, '', null)).toHaveLength(6)
  })
  it('combines with search and party focus', () => {
    expect(filterRows(rows, null, 's4', 'won').map((r) => r.id)).toEqual([4])
    expect(filterRows(rows, null, 's1', 'won')).toEqual([])
  })
  it('counts each filter', () => {
    // ...but its count is close seats only, as the band's "N close" is.
    expect(railCounts(rows)).toEqual({ doubt: 1, changing: 2, won: 2 })
  })
})

describe('rail "changing" follows Gains (VE-168, FB-198)', () => {
  const mk = (id: number, over: Partial<Seat>): ListRow => listRow({ ...seat(id, `S${id}`, 'ALP', 'leading', 60), changing: true, ...over } as Seat, undefined)
  const rows = [
    mk(1, { pct: LIKELY_FROM_PCT + 10 }), // changed but not Likely (ADR 0033): Gains tints it as its holder
    mk(2, { pct: LIKELY_FROM_PCT, likely: true }),
    mk(3, { pct: 5, state: 'firm' }),
    mk(4, { pct: 5, state: 'won' }),
    mk(5, { pct: 80, changing: false }),
  ]
  it('counts and filters exactly the seats gainShown passes', () => {
    expect(railCounts(rows).changing).toBe(3)
    expect(filterRows(rows, null, '', 'changing').map((r) => r.id)).toEqual([2, 3, 4])
    expect(rows.filter((r) => gainShown(r.seat)).length).toBe(railCounts(rows).changing)
  })
})

describe('resultWords (VE-96)', () => {
  const w = (over: Partial<Seat>) => resultWords({ ...seat(1, 'A', 'ALP', 'won', 60), ...over } as Seat)
  it('says keeps it when the declared winner is the 2022 holder', () => {
    expect(w({ leader: 'ALP', base: 'ALP' })).toBe('Labor keeps it')
  })
  it('says wins it from the old holder when a different party is declared', () => {
    expect(w({ leader: 'LIB', base: 'ALP' })).toBe('Liberal wins it from Labor')
  })
  it('says win when there is no 2022 holder', () => {
    expect(w({ leader: 'GRN', base: null })).toBe('Greens win')
    // VE-226 (finding 17): plural party names take a plural verb.
    expect(w({ leader: 'NAT', base: 'NAT' })).toBe('Nationals keep it')
    expect(w({ leader: 'GRN', base: 'ALP' })).toBe('Greens win it from Labor')
  })
  it('says nothing before the VEC declares, or with no leader', () => {
    expect(w({ state: 'firm', leader: 'ALP', base: 'ALP' })).toBeNull()
    expect(w({ state: 'leading', leader: 'LIB', base: 'ALP' })).toBeNull()
    expect(w({ state: 'none', leader: null })).toBeNull()
    expect(w({ state: 'won', leader: null })).toBeNull()
  })
})

describe('lead as a share of votes left (VE-111)', () => {
  const withVotes = (id: number, name: string, marginVotes: number | null, stillToCount: number | null): ListRow =>
    listRow({ ...seat(id, name, 'ALP', 'leading', 52), inDoubt: true, marginVotes, stillToCount } as Seat, undefined)
  it('is the lead over the votes left, null when either is missing', () => {
    expect(withVotes(1, 'A', 500, 1000).lead).toBeCloseTo(0.5)
    expect(withVotes(1, 'A', null, 1000).lead).toBeNull()
    expect(withVotes(1, 'A', 500, null).lead).toBeNull()
  })
  it('sorts closest first, with nothing left to count and missing figures last', () => {
    const rows = [withVotes(1, 'Far', 5000, 1000), withVotes(2, 'Gone', 5, 0), withVotes(3, 'None', null, null), withVotes(4, 'Near', 100, 2000), withVotes(5, 'Mid', 900, 1000)]
    expect(sortRows(rows, 'lead', 'asc').map((r) => r.name)).toEqual(['Near', 'Mid', 'Far', 'Gone', 'None'])
  })
})

describe('lead as a share of votes left (VE-111)', () => {
  const withVotes = (id: number, name: string, marginVotes: number | null, stillToCount: number | null): ListRow =>
    listRow({ ...seat(id, name, 'ALP', 'leading', 52), inDoubt: true, marginVotes, stillToCount } as Seat, undefined)
  it('is the lead over the votes left, null when either is missing', () => {
    expect(withVotes(1, 'A', 500, 1000).lead).toBeCloseTo(0.5)
    expect(withVotes(1, 'A', null, 1000).lead).toBeNull()
    expect(withVotes(1, 'A', 500, null).lead).toBeNull()
  })
  it('sorts closest first, with nothing left to count and missing figures last', () => {
    const rows = [withVotes(1, 'Far', 5000, 1000), withVotes(2, 'Gone', 5, 0), withVotes(3, 'None', null, null), withVotes(4, 'Near', 100, 2000), withVotes(5, 'Mid', 900, 1000)]
    expect(sortRows(rows, 'lead', 'asc').map((r) => r.name)).toEqual(['Near', 'Mid', 'Far', 'Gone', 'None'])
  })
})
