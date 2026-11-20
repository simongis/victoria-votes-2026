import { describe, expect, it } from 'vitest'
import {
  boothAt,
  boothInFocus,
  boothSummary,
  dotRadius,
  formalOf,
  leaderOf,
  parseBoothHistory,
  parseBoothStatics,
  zoomScale,
  type BoothRow,
} from './model'

const row = (at: number, fp: Partial<BoothRow['fp']>): BoothRow => ({
  at,
  fp: { ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0, ...fp },
})

describe('leaderOf and formalOf', () => {
  it('takes the party with the most first preferences and sums every party for the formal vote', () => {
    const r = row(1, { ALP: 40, LIB: 25, GRN: 20, ONP: 5 })
    expect(leaderOf(r.fp)).toBe('ALP')
    expect(formalOf(r.fp)).toBe(90)
  })

  it('has no leader before any votes', () => {
    expect(leaderOf(row(1, {}).fp)).toBeNull()
  })

  it('breaks a tie by the fixed party order, so a dot never flickers between two parties', () => {
    expect(leaderOf(row(1, { LIB: 10, ALP: 10 }).fp)).toBe('ALP')
  })

  it('counts One Nation as its own party, never Others', () => {
    expect(leaderOf(row(1, { ONP: 30, OTH: 20, ALP: 10 }).fp)).toBe('ONP')
  })
})

describe('dotRadius', () => {
  it('keeps area, not radius, proportional to votes (4 times the votes is twice the radius)', () => {
    const small = dotRadius(400, 1600, 8, 0)
    const big = dotRadius(1600, 1600, 8, 0)
    expect(big).toBeCloseTo(8)
    expect(big / small).toBeCloseTo(2)
  })

  it('never goes below the floor, so the smallest booth is still a visible dot', () => {
    expect(dotRadius(1, 2000, 8, 1.4)).toBeCloseTo(1.4, 1) // VE-153: area runs from the floor's up, so one vote sits just above it
    expect(dotRadius(0, 2000, 8, 1.4)).toBe(1.4)
  })
})

describe('zoomScale', () => {
  it('is 1 at the whole-state fit and grows, gently and to a cap, as the map zooms in', () => {
    expect(zoomScale(1000, 1000)).toBe(1)
    const k4 = zoomScale(1000, 250)
    expect(k4).toBeGreaterThan(1)
    expect(k4).toBeLessThan(4)
    expect(zoomScale(1000, 1)).toBeLessThanOrEqual(3.5)
  })

  it('never shrinks below 1 (a coarser view than the fit does not happen)', () => {
    expect(zoomScale(1000, 2000)).toBe(1)
  })
})

describe('boothAt', () => {
  const rows = [row(100, { ALP: 5 }), row(200, { ALP: 9 }), row(300, { ALP: 12 })]

  it('is null before the booth first reports', () => {
    expect(boothAt(rows, 99)).toBeNull()
  })

  it('is the latest row at or before the time shown', () => {
    expect(boothAt(rows, 100)?.fp.ALP).toBe(5)
    expect(boothAt(rows, 250)?.fp.ALP).toBe(9)
    expect(boothAt(rows, 10_000)?.fp.ALP).toBe(12)
  })

  it('is null for a booth with no history', () => {
    expect(boothAt(undefined, 500)).toBeNull()
    expect(boothAt([], 500)).toBeNull()
  })
})

describe('boothSummary', () => {
  it('is waiting until the booth has figures', () => {
    expect(boothSummary(null)).toEqual({ state: 'waiting' })
  })

  it('gives the leader, the formal vote and the leader share as a whole percentage', () => {
    const s = boothSummary(row(1, { ALP: 50, LIB: 30, GRN: 20 }))
    expect(s).toEqual({ state: 'counted', leader: 'ALP', formal: 100, share: 50 })
  })

  it('is waiting when a row carries no votes yet', () => {
    expect(boothSummary(row(1, {}))).toEqual({ state: 'waiting' })
  })
})

describe('boothInFocus', () => {
  it('lights every booth when nothing is picked', () => {
    expect(boothInFocus(null, 'ALP', undefined)).toBe(true)
    expect(boothInFocus(null, null, undefined)).toBe(true)
  })

  it('lights only booths the picked party leads', () => {
    expect(boothInFocus('ALP', 'ALP', undefined)).toBe(true)
    expect(boothInFocus('ALP', 'LIB', undefined)).toBe(false)
  })

  it('the Coalition pick covers Liberal and Nationals, Others the independents and small parties, One Nation stands alone', () => {
    expect(boothInFocus('COA', 'NAT', undefined)).toBe(true)
    expect(boothInFocus('COA', 'GRN', undefined)).toBe(false)
    expect(boothInFocus('XB', 'IND', undefined)).toBe(true)
    expect(boothInFocus('XB', 'ONP', undefined)).toBe(false)
    expect(boothInFocus('ONP', 'ONP', undefined)).toBe(true)
  })

  it('the close-seats pick lights the places in close seats only, not seats waiting for preferences (VE-226, finding 7)', () => {
    expect(boothInFocus('DOUBT', 'ALP', { close: true })).toBe(true)
    expect(boothInFocus('DOUBT', 'ALP', { close: false })).toBe(false)
    expect(boothInFocus('DOUBT', 'ALP', undefined)).toBe(false)
  })

  it('a strong or pale part still counts only the party, since a booth has no state', () => {
    expect(boothInFocus('ALP:strong', 'ALP', undefined)).toBe(true)
    expect(boothInFocus('ALP:pale', 'LIB', undefined)).toBe(false)
  })

  it('a booth that has not reported is faded under any party pick', () => {
    expect(boothInFocus('ALP', null, undefined)).toBe(false)
  })

  it('the in-doubt pick follows the booth’s seat', () => {
    expect(boothInFocus('DOUBT', 'ALP', { close: true })).toBe(true)
    expect(boothInFocus('DOUBT', 'ALP', { close: false })).toBe(false)
    expect(boothInFocus('DOUBT', 'ALP', undefined)).toBe(false)
  })
})

describe('parseBoothStatics', () => {
  const gj = {
    features: [
      { properties: { booth_id: 1, booth_name: 'Alpha', district_id: 10, booth_type: 'election_day' }, geometry: { type: 'Point', coordinates: [144.96, -37.81] } },
      { properties: { booth_id: 2, booth_name: 'Beta', district_id: 10, booth_type: 'evc' }, geometry: { type: 'Point', coordinates: [144.97, -37.82] } },
      { properties: { booth_id: 3, booth_name: 'Nowhere', district_id: 11, booth_type: 'election_day' }, geometry: null },
      { properties: { booth_id: 4, booth_name: 'OffTheMap', district_id: 11, booth_type: 'election_day' }, geometry: { type: 'Point', coordinates: [0, 0] } },
    ],
  }

  it('projects election-day booths to VicGrid metres in the Melbourne area', () => {
    const { booths } = parseBoothStatics(gj)
    const a = booths.find((b) => b.id === 1)!
    // Melbourne CBD on VicGrid is about E 2.5 million, N 2.4 million (false origin 2.5 M, 2.5 M at -37, 145).
    expect(a.e).toBeGreaterThan(2_480_000)
    expect(a.e).toBeLessThan(2_520_000)
    expect(a.n).toBeGreaterThan(2_380_000)
    expect(a.n).toBeLessThan(2_420_000)
    expect(a.name).toBe('Alpha')
    expect(a.districtId).toBe(10)
  })

  it('keeps early voting centres apart: no election-day dot for them (the hook for 2026 centres)', () => {
    const { booths, evc } = parseBoothStatics(gj)
    expect(booths.map((b) => b.id)).not.toContain(2)
    expect(evc.map((b) => b.id)).toEqual([2])
  })

  it('keeps the previous election’s result at the place for the panel’s swing (VE-208), and none when the layer gave none', () => {
    const withBase = parseBoothStatics({
      features: [
        { properties: { booth_id: 1, booth_name: 'A', district_id: 10, booth_type: 'election_day', base_match: 'id', base_tcp_party_a: 'ALP', base_tcp_party_b: 'LIB', base_tcp_pct_a: 55.5 }, geometry: { type: 'Point', coordinates: [144.96, -37.81] } },
        { properties: { booth_id: 2, booth_name: 'B', district_id: 10, booth_type: 'election_day', base_match: 'none', base_tcp_party_a: null, base_tcp_party_b: null, base_tcp_pct_a: null }, geometry: { type: 'Point', coordinates: [144.97, -37.81] } },
        { properties: { booth_id: 3, booth_name: 'C', district_id: 10, booth_type: 'election_day' }, geometry: { type: 'Point', coordinates: [144.98, -37.81] } },
      ],
    }).booths
    expect(withBase[0]!.base).toEqual({ match: 'id', a: 'ALP', b: 'LIB', pctA: 55.5 })
    expect(withBase[1]!.base).toEqual({ match: 'none', a: null, b: null, pctA: null })
    expect(withBase[2]!.base).toBeUndefined()
  })

  it('accounts for every feature: a missing or implausible location is counted, not silently drawn at 0,0', () => {
    const r = parseBoothStatics(gj)
    expect(r.booths.length + r.evc.length + r.skipped).toBe(gj.features.length)
    expect(r.skipped).toBe(2)
  })
})

describe('parseBoothHistory', () => {
  const cols = {
    fields: ['snapshot_id', 'snapshot_at', 'booth_id', 'district_id', 'fp_ALP', 'fp_LIB', 'fp_NAT', 'fp_GRN', 'fp_ONP', 'fp_IND', 'fp_OTH', 'fp_total', 'tcp_party_a', 'tcp_pct_a'],
    rows: [
      ['s2', 200, 7, 10, 9, 1, 0, 0, 0, 0, 0, 12, null, null],
      ['s1', 100, 7, 10, 5, 1, 0, 0, 0, 0, 0, 7, null, null],
      ['s1', 100, 8, 10, 2, 3, 0, 0, 0, 0, 0, 6, null, null],
    ],
  }

  it('groups rows by booth, oldest first, using only the party columns for the formal vote', () => {
    const { byBooth, maxFormal } = parseBoothHistory(cols)
    expect(byBooth.get(7)!.map((r) => r.at)).toEqual([100, 200])
    expect(byBooth.get(7)![1]!.fp.ALP).toBe(9)
    expect(byBooth.get(8)).toHaveLength(1)
    // fp_total includes informal votes (12 vs formal 10), so it is not used for size.
    expect(maxFormal).toBe(10)
  })
  it('keeps votes counted and the final two on each row for the panel (VE-208)', () => {
    const { byBooth } = parseBoothHistory({ ...cols, rows: [['s1', 100, 7, 10, 5, 1, 0, 0, 0, 0, 0, 7, 'ALP', 62.5], ['s2', 200, 7, 10, 5, 1, 0, 0, 0, 0, 0, null, null, null]] })
    expect(byBooth.get(7)![0]).toMatchObject({ total: 7, tcpA: 'ALP', tcpPctA: 62.5 })
    expect(byBooth.get(7)![1]).toMatchObject({ total: null, tcpA: null, tcpPctA: null })
  })
  it('scales dot size to the 95th percentile of the booths peaks, so one huge booth does not flatten every other dot (VE-153)', () => {
    const fields = cols.fields
    const row = (id: number, alp: number) => ['s1', 100, id, ...fields.slice(3).map((f) => (f === 'fp_ALP' ? alp : 0))]
    const rows = [...Array.from({ length: 19 }, (_, i) => row(i + 1, 100 + i)), row(20, 5000)]
    expect(parseBoothHistory({ fields, rows }).maxFormal).toBe(118)
  })
})
