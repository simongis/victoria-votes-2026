import { describe, expect, it } from 'vitest'
import type { OneNationSeat, PartySharesSeat } from '@vic26/schema'
import { PARTIAL_BELOW, PARTY_OPTIONS, SHARE_MAX, coverage, partyLabel, partyRgb, quintileBands, rampMax, shareRgb, stepFocus, swarm, validateAsset } from './oneNation'

const ONP: [number, number, number] = [242, 142, 28]
const seat = (id: number, over: Partial<OneNationSeat> = {}): OneNationSeat => ({
  district_id: id,
  on_2022_pct: 2,
  on_2025_pct: 4,
  on_2022_low: false,
  on_2025_low: false,
  on_2022_partial: false,
  on_2025_partial: false,
  pct_year12: 50,
  pct_trades_labour: 20,
  pct_trade_cert: 15,
  pct_unemployed: 4,
  pct_own_home: 60,
  pct_detached_house: 70,
  people_per_km2: 100,
  ...over,
})
const shares = (id: number, over: Partial<PartySharesSeat> = {}): PartySharesSeat => ({
  district_id: id,
  share_2025: { ALP: 30, COA: 35, LIB: 35, NAT: 0, GRN: 10, ONP: 5, IND: 15, OTH: 5 },
  stood_2025: { ALP: 1, COA: 1, LIB: 1, NAT: 0, GRN: 1, ONP: 1, IND: 0.5, OTH: 1 },
  low_votes: false,
  ...over,
})
const ids = new Set(Array.from({ length: 88 }, (_, i) => 100 + i))
const goodAsset = () => ({ source: 'x', districts: [...ids].map((id) => seat(id)), party_shares: [...ids].map((id) => shares(id)) })

describe('validateAsset (hold last good: nothing is shown rather than something wrong)', () => {
  it('accepts 88 rows that match the statics', () => {
    const a = validateAsset(goodAsset(), ids)
    expect(a?.districts).toHaveLength(88)
    expect(a?.party_shares).toHaveLength(88)
  })
  it('rejects the wrong row count', () => {
    const a = goodAsset()
    a.districts.pop()
    expect(validateAsset(a, ids)).toBeNull()
    expect(validateAsset({ source: 'x', districts: [] }, ids)).toBeNull()
  })
  it('rejects an id the statics do not have, and a repeated id', () => {
    const a = goodAsset()
    a.districts[3] = seat(999)
    expect(validateAsset(a, ids)).toBeNull()
    const b = goodAsset()
    b.districts[3] = seat(b.districts[2]!.district_id)
    expect(validateAsset(b, ids)).toBeNull()
  })
  it('rejects a Census figure of the wrong type or out of range, but allows null', () => {
    const a = goodAsset()
    a.districts[0] = seat(100, { on_2025_pct: null })
    expect(validateAsset(a, ids)).not.toBeNull()
    const b = goodAsset()
    ;(b.districts[0] as unknown as Record<string, unknown>).on_2025_pct = '4'
    expect(validateAsset(b, ids)).toBeNull()
    const c = goodAsset()
    c.districts[0] = seat(100, { on_2025_pct: 140 })
    expect(validateAsset(c, ids)).toBeNull()
  })
  it('needs the party shares: missing, short, wrong ids, a missing party or a share out of range all fail', () => {
    const none = goodAsset() as Record<string, unknown>
    delete none.party_shares
    expect(validateAsset(none, ids)).toBeNull()
    const short = goodAsset()
    short.party_shares.pop()
    expect(validateAsset(short, ids)).toBeNull()
    const wrongId = goodAsset()
    wrongId.party_shares[5] = shares(999)
    expect(validateAsset(wrongId, ids)).toBeNull()
    const dup = goodAsset()
    dup.party_shares[5] = shares(dup.party_shares[4]!.district_id)
    expect(validateAsset(dup, ids)).toBeNull()
    const noGreens = goodAsset()
    delete (noGreens.party_shares[0]!.share_2025 as Partial<Record<string, number>>).GRN
    expect(validateAsset(noGreens, ids)).toBeNull()
    const big = goodAsset()
    big.party_shares[0]!.share_2025.ALP = 140
    expect(validateAsset(big, ids)).toBeNull()
    const stood = goodAsset()
    stood.party_shares[0]!.stood_2025.IND = 1.5
    expect(validateAsset(stood, ids)).toBeNull()
  })
  it('rejects things that are not an asset at all', () => {
    expect(validateAsset(null, ids)).toBeNull()
    expect(validateAsset('nope', ids)).toBeNull()
    expect(validateAsset({ districts: 5 }, ids)).toBeNull()
  })
})

describe('the party toggle', () => {
  it('offers Labor, Coalition, Greens, One Nation, Independents and Victorian Socialists (VE-320), each named alike', () => {
    expect(PARTY_OPTIONS.map((o) => o.label)).toEqual(['Labor', 'Coalition', 'Greens', 'One Nation', 'Independents', 'Victorian Socialists'])
    expect(PARTY_OPTIONS.find((o) => o.id === 'VS')?.short).toBe('Vic Socialists')
    expect(partyLabel('COA')).toBe('Coalition')
  })
  it('the Coalition wears the Liberal colour', () => {
    expect(PARTY_OPTIONS.find((o) => o.id === 'COA')!.bucket).toBe('LIB')
  })
})

describe('coverage (partial seats)', () => {
  it('full from the threshold up, partial below it, none at zero', () => {
    expect(coverage(1)).toBe('full')
    expect(coverage(PARTIAL_BELOW)).toBe('full')
    expect(coverage(0.9)).toBe('partial')
    expect(coverage(0.01)).toBe('partial')
    expect(coverage(0)).toBe('none')
    expect(coverage(undefined)).toBe('full')
  })
})

describe('colour ramps', () => {
  it('shares: pale at 0, One Nation orange in the middle, deep at the top, clamped beyond', () => {
    const pale = shareRgb(0, ONP)
    expect(shareRgb(SHARE_MAX / 2, ONP)).toEqual(ONP)
    const deep = shareRgb(SHARE_MAX, ONP)
    expect(shareRgb(-3, ONP)).toEqual(pale)
    expect(shareRgb(SHARE_MAX * 3, ONP)).toEqual(deep)
    expect(pale[0] + pale[1] + pale[2]).toBeGreaterThan(deep[0] + deep[1] + deep[2])
  })
  it('party ramp: the same logic for any colour and any top of scale', () => {
    const cases: [[number, number, number], number][] = [[ONP, 16], [[230, 40, 40], 60], [[20, 120, 60], 44]]
    for (const [base, max] of cases) {
      const pale = partyRgb(0, base, max)
      const mid = partyRgb(max / 2, base, max)
      const deep = partyRgb(max, base, max)
      expect(mid).toEqual(base)
      expect(partyRgb(-5, base, max)).toEqual(pale)
      expect(partyRgb(max * 3, base, max)).toEqual(deep)
      const lum = (c: readonly number[]) => c[0]! + c[1]! + c[2]!
      expect(lum(pale)).toBeGreaterThan(lum(mid))
      expect(lum(mid)).toBeGreaterThan(lum(deep))
    }
  })
  it('rampMax: the top seat rounded up to a tidy step, the same rule for every party', () => {
    expect(rampMax([3, 16.008, 9])).toBe(18)
    expect(rampMax([54.831, 20])).toBe(55)
    expect(rampMax([42.469])).toBe(45)
    expect(rampMax([1.2, 2])).toBe(6)
    expect(rampMax([])).toBe(6)
  })
})

describe('quintileBands (seats, not people)', () => {
  const rows = Array.from({ length: 88 }, (_, i) => ({ id: i + 1, x: i + 1, share: (i + 1) / 10 }))
  it('cuts 88 seats into bands of 17 or 18 by rank, highest first', () => {
    const bands = quintileBands(rows)
    expect(bands.map((b) => b.ids.length).reduce((a, b) => a + b, 0)).toBe(88)
    expect(bands.every((b) => b.ids.length === 17 || b.ids.length === 18)).toBe(true)
    expect(bands[0]!.index).toBe(0)
    expect(bands[0]!.hi).toBe(88)
    expect(bands[4]!.lo).toBe(1)
    // Every seat lands in exactly one band.
    expect(new Set(bands.flatMap((b) => b.ids)).size).toBe(88)
  })
  it('averages the party share across the band', () => {
    const bands = quintileBands([1, 2, 3, 4, 5].map((i) => ({ id: i, x: i, share: i * 2 })))
    expect(bands.map((b) => b.mean)).toEqual([10, 8, 6, 4, 2])
    expect(bands.map((b) => b.ids)).toEqual([[5], [4], [3], [2], [1]])
  })
  it('breaks ties by id so the cut is the same every time', () => {
    const tied = [3, 1, 2, 5, 4].map((id) => ({ id, x: 7, share: id }))
    expect(quintileBands(tied).map((b) => b.ids[0])).toEqual([1, 2, 3, 4, 5])
  })
  it('copes with fewer than five seats', () => {
    const bands = quintileBands([{ id: 1, x: 1, share: 1 }])
    expect(bands).toHaveLength(5)
    expect(bands.flatMap((b) => b.ids)).toEqual([1])
  })
})

describe('swarm', () => {
  it('leaves well-spaced points on the line and steps apart overlapping ones', () => {
    expect(swarm([0, 10, 20], 3)).toEqual([0, 0, 0])
    const k = swarm([5, 5, 5, 5.5], 3)
    expect(new Set(k).size).toBe(4)
    expect(k[0]).toBe(0)
  })
  it('never puts two close points on the same step', () => {
    const xs = [1, 1.1, 1.2, 1.3, 4, 4.1]
    const k = swarm(xs, 1)
    for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (Math.abs(xs[i]! - xs[j]!) < 1) expect(k[i]).not.toBe(k[j])
  })
})

describe('stepFocus (arrow keys between marks)', () => {
  const pts = [
    { id: 1, x: 0, y: 0 },
    { id: 2, x: 10, y: 0 },
    { id: 3, x: 20, y: 1 },
    { id: 4, x: 10, y: 10 },
  ]
  it('goes to the nearest mark in that direction', () => {
    expect(stepFocus(pts, 1, 1, 0)).toBe(2)
    expect(stepFocus(pts, 2, 1, 0)).toBe(3)
    expect(stepFocus(pts, 2, -1, 0)).toBe(1)
    expect(stepFocus(pts, 2, 0, 1)).toBe(4)
    expect(stepFocus(pts, 4, 0, -1)).toBe(2)
  })
  it('stays put at an edge', () => {
    expect(stepFocus(pts, 1, -1, 0)).toBe(1)
    expect(stepFocus(pts, 3, 1, 0)).toBe(3)
  })
})
