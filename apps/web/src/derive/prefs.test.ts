import { describe, expect, it } from 'vitest'
import type { DistrictStatic } from '@vic26/schema'
import type { Seat } from './seats'
import { OUTRIGHT_PCT, packRow, prefsPoints, regionRows, shortRegion, xFor } from './prefs'

const seat = (id: number, fp: Seat['fp']): Seat => ({ id, name: `Seat ${id}`, fp }) as Seat
const statics = (rows: [number, string][]) => new Map(rows.map(([id, region]) => [id, { district_id: id, region_name: region }])) as unknown as Map<number, DistrictStatic>

describe('prefsPoints', () => {
  it('uses the first-preference leader pct as is (Seat.fp already divides by formal votes)', () => {
    // 52 + 43 = 95 formal: the share of formal votes is 54.7, which seatFromHistory puts in pct.
    const seats = new Map([[1, seat(1, [{ party: 'LIB', votes: 52, pct: 54.7 }, { party: 'ALP', votes: 43, pct: 45.3 }])]])
    const p = prefsPoints(seats, statics([[1, 'A']])).points[0]!
    expect(p.pct).toBeCloseTo(54.7, 1)
    expect(p.decided).toBe(false)
  })
  it('takes the first-preference leader and share, and marks the seats under 50%', () => {
    const seats = new Map([
      [1, seat(1, [{ party: 'LIB', votes: 44, pct: 44 }, { party: 'ALP', votes: 30, pct: 30 }, { party: 'GRN', votes: 26, pct: 26 }])],
      [2, seat(2, [{ party: 'ALP', votes: 52, pct: 52 }, { party: 'LIB', votes: 48, pct: 48 }])],
    ])
    const { points } = prefsPoints(seats, statics([[1, 'Eastern Metropolitan Region'], [2, 'Eastern Metropolitan Region']]))
    expect(points.map((p) => [p.id, p.party, p.pct, p.decided])).toEqual([[1, 'LIB', 44, true], [2, 'ALP', 52, false]])
    expect(OUTRIGHT_PCT).toBe(50)
  })
  it('leaves seats with no figures off the line and counts them', () => {
    const seats = new Map([[1, seat(1, [])], [2, seat(2, [{ party: 'GRN', votes: 40, pct: 40 }, { party: 'ALP', votes: 35, pct: 35 }, { party: 'LIB', votes: 25, pct: 25 }])]])
    const r = prefsPoints(seats, statics([[1, 'A'], [2, 'A']]))
    expect(r.points).toHaveLength(1)
    expect(r.missing).toBe(1)
    expect(r.decidedCount).toBe(1)
  })
})

describe('regionRows', () => {
  it('puts Melbourne regions first, then the country, each sorted by name', () => {
    const seats = new Map([1, 2, 3].map((i) => [i, seat(i, [{ party: 'ALP', votes: 1, pct: 40 }])] as const))
    const rows = regionRows(prefsPoints(seats, statics([[1, 'Western Victoria Region'], [2, 'Northern Metropolitan Region'], [3, 'Eastern Metropolitan Region']])).points)
    expect(rows.map((r) => r.region)).toEqual(['Eastern Metropolitan Region', 'Northern Metropolitan Region', 'Western Victoria Region'])
  })
  it('shortens the region name', () => {
    expect(shortRegion('Eastern Metropolitan Region')).toBe('Eastern Metropolitan')
  })
})

describe('xFor', () => {
  it('maps the share onto the width and clamps to the ends', () => {
    expect(xFor(50, 100, 0, 0)).toBeCloseTo((100 * 30) / 65)
    expect(xFor(5, 100, 10, 10)).toBe(10)
    expect(xFor(99, 100, 10, 10)).toBe(90)
  })
})

describe('packRow', () => {
  it('leaves no two dots overlapping, even when they share a share', () => {
    const items = Array.from({ length: 14 }, (_, i) => ({ id: i, x: 100 + (i % 3) * 2 }))
    const r = 5
    const offs = packRow(items, r)
    expect(offs.size).toBe(14)
    for (const a of items) for (const b of items) {
      if (a.id >= b.id) continue
      const d = Math.hypot(a.x - b.x, offs.get(a.id)! - offs.get(b.id)!)
      expect(d).toBeGreaterThanOrEqual(2 * r)
    }
  })
  it('keeps a lone dot on the line and is deterministic', () => {
    expect(packRow([{ id: 1, x: 10 }], 5).get(1)).toBe(0)
    const items = [{ id: 2, x: 10 }, { id: 1, x: 10 }, { id: 3, x: 11 }]
    expect([...packRow(items, 5)]).toEqual([...packRow([...items].reverse(), 5)])
  })
})
