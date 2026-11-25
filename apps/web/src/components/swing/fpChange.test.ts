import { describe, expect, it } from 'vitest'
import type { Seat } from '../../derive/seats'
import { fpChangeItems, fpChangeText } from './fpChange'

const seat = (fp: Seat['fp'], over: Partial<Seat> = {}): Seat => ({ id: 1, name: 'Melton', pct: 80, baseNote: '2022', fp, ...over }) as Seat
const fp = (o: Record<string, number>): Seat['fp'] => Object.entries(o).map(([party, pct]) => ({ party, pct, votes: Math.round(pct * 100) }) as Seat['fp'][number])

describe('fpChangeItems', () => {
  it('orders the movers biggest first, whichever way they moved', () => {
    const items = fpChangeItems(seat(fp({ ALP: 30, LIB: 27, GRN: 12, ONP: 20 })), { ALP: 44, LIB: 30, GRN: 10, ONP: 20 })
    expect(items.map((i) => i.party)).toEqual(['ALP', 'LIB', 'GRN'])
    expect(items[0]!.change).toBeCloseTo(-14)
  })
  it('shows a party that did not stand in 2022 as new, ranked by its share, never as a change', () => {
    const items = fpChangeItems(seat(fp({ ALP: 30, ONP: 21, LIB: 30 })), { ALP: 44, LIB: 30, OTH: 5 })
    expect(items[0]).toMatchObject({ party: 'ONP', fresh: true, change: null, share: 21 })
    expect(items.map((i) => i.party)).toEqual(['ONP', 'ALP', null])
  })
  it('keeps three parties and folds the rest, with the Other bucket, into others', () => {
    const items = fpChangeItems(seat(fp({ ALP: 40, LIB: 30, GRN: 15, NAT: 4, OTH: 11 })), { ALP: 44, LIB: 20, GRN: 10, NAT: 1, OTH: 25 })
    expect(items.map((i) => i.party)).toEqual(['LIB', 'GRN', 'ALP', null])
    // NAT +3 and OTH -14 are not shown by name.
    expect(items[3]).toMatchObject({ party: null, change: -11 })
  })
  it('drops movers under a rounded 0.1 and gives nothing when too early or without a baseline', () => {
    expect(fpChangeItems(seat(fp({ ALP: 40.04, LIB: 59.96 })), { ALP: 40, LIB: 60 })).toEqual([])
    expect(fpChangeItems(seat(fp({ ALP: 30 }), { pct: 10 }), { ALP: 44 })).toEqual([])
    expect(fpChangeItems(seat(fp({ ALP: 30 })), undefined)).toEqual([])
  })
})

describe('fpChangeText', () => {
  it('writes signed one-decimal points in party words, then others', () => {
    const items = fpChangeItems(seat(fp({ ALP: 30, ONP: 21, LIB: 30, GRN: 12, OTH: 7 })), { ALP: 44.04, LIB: 30, GRN: 10, OTH: 16 })
    expect(fpChangeText(items, '2022')).toBe('First preferences since 2022: One Nation new (21.0%), Labor -14.0, Greens +2.0, Others -9.0')
  })
  it('rounds to one decimal and signs gains with a plus', () => {
    const items = fpChangeItems(seat(fp({ GRN: 12.26, ALP: 47.5 })), { GRN: 10, ALP: 50 })
    expect(fpChangeText(items, '2025 by-election')).toBe('First preferences since 2025 by-election: Labor -2.5, Greens +2.3')
  })
  it('is null with nothing to say', () => {
    expect(fpChangeText([], '2022')).toBeNull()
  })
})
