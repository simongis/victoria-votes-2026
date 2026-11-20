import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateAsset } from './oneNation'

// The build script is plain Node (.mjs). Its path is a variable so TypeScript does not need a declaration file for it.
const SCRIPT = '../../scripts/build-one-nation.mjs'
// apps/web/scripts/ is not in the public export, so the script tests skip there (the asset tests below still run).
const hasScript = fs.existsSync(new URL(SCRIPT, import.meta.url))
type Built = { source: string; districts: Record<string, unknown>[]; party_shares: { district_id: number; share_2025: Record<string, number>; stood_2025: Record<string, number>; low_votes: boolean }[] }
const load = async () => (await import(/* @vite-ignore */ SCRIPT)) as { toAsset: (on: unknown, extra: unknown[], shares: unknown) => Built; toPartyShares: (shares: unknown) => Built['party_shares'] }

const side = (share: number, over: Record<string, unknown> = {}) => ({ share_pct: share, places: 9, low_votes: false, partial_candidacy: false, divisions: ['X'], ...over })
const on = (ids: number[]) => ({ districts: ids.map((id) => ({ district_id: id, short_name: `S${id}`, on_2022: side(1.23456), on_2025: side(2.5, { partial_candidacy: id === 2 }), change_pts: 1.2, measures: { pct_bachelor_plus: 40 } })) })
const extra = (ids: number[]) => ids.map((id) => ({ district_id: id, pct_year12: 60.123456, pct_trades_labour: 20, pct_trade_cert: 12, pct_unemployed: 4, pct_own_home: 70, pct_detached_house: 80, people_per_km2: 123.456, data_source: 'x' }))
const party = (ids: number[]) => ({
  districts: ids.map((id) => ({
    district_id: id,
    short_name: `S${id}`,
    share_pct: { ALP: 40.12345, LIB: 20.5, NAT: 5.25, GRN: 10, ONP: 3.33333, IND: 15, OTH: 5.79 } as Record<string, number>,
    coalition_pct: 25.75,
    stood_fraction: { ALP: 1, LIB: 0.664, NAT: 0.336, GRN: 1, ONP: 1, IND: 0.52749, OTH: 1 } as Record<string, number>,
    low_votes: id === 2,
    formal_votes: 30000,
  })),
})

describe.skipIf(!hasScript)('build-one-nation toPartyShares (VE-101e)', () => {
  it('maps buckets to the schema parties, adds the Coalition and drops everything else', async () => {
    const { toPartyShares } = await load()
    const [a] = toPartyShares(party([7]))
    expect(Object.keys(a!).sort()).toEqual(['district_id', 'low_votes', 'share_2025', 'stood_2025'])
    expect(Object.keys(a!.share_2025).sort()).toEqual(['ALP', 'COA', 'GRN', 'IND', 'LIB', 'NAT', 'ONP', 'OTH'])
    expect(a!.share_2025.ALP).toBe(40.123)
    expect(a!.share_2025.COA).toBe(25.75)
    expect(a!.share_2025.ONP).toBe(3.333)
  })
  it('Coalition coverage is the Liberal and National coverage together, capped at 1', async () => {
    const { toPartyShares } = await load()
    const [a] = toPartyShares(party([7]))
    expect(a!.stood_2025.COA).toBe(1)
    expect(a!.stood_2025.IND).toBe(0.527)
    const p = party([7])
    p.districts[0]!.stood_fraction.LIB = 0.3
    p.districts[0]!.stood_fraction.NAT = 0.2
    expect(toPartyShares(p)[0]!.stood_2025.COA).toBe(0.5)
  })
  it('sorts by id and carries the thin-votes flag', async () => {
    const { toPartyShares } = await load()
    const rows = toPartyShares(party([2, 1]))
    expect(rows.map((r) => r.district_id)).toEqual([1, 2])
    expect(rows.map((r) => r.low_votes)).toEqual([false, true])
  })
  it('stops when a bucket is missing rather than writing a gap', async () => {
    const { toPartyShares } = await load()
    const p = party([1])
    delete p.districts[0]!.share_pct.GRN
    expect(() => toPartyShares(p)).toThrow(/GRN/)
  })
})

describe.skipIf(!hasScript)('build-one-nation toAsset', () => {
  it('maps VE-101a sides to the schema fields and drops everything else', async () => {
    const { toAsset } = await load()
    const a = toAsset(on([2, 1]), extra([1, 2]), party([1, 2]))
    expect(a.districts.map((d) => d.district_id)).toEqual([1, 2])
    expect(Object.keys(a.districts[0]!).sort()).toEqual(
      ['district_id', 'on_2022_low', 'on_2022_partial', 'on_2022_pct', 'on_2025_low', 'on_2025_partial', 'on_2025_pct', 'pct_detached_house', 'pct_own_home', 'pct_trade_cert', 'pct_trades_labour', 'pct_unemployed', 'pct_year12', 'people_per_km2'].sort(),
    )
    expect(a.districts[0]!.on_2022_pct).toBe(1.235)
    expect(a.districts[0]!.pct_year12).toBe(60.12)
    expect(a.districts[0]!.people_per_km2).toBe(123.5)
    expect(a.districts[1]!.on_2025_partial).toBe(true)
    expect(a.districts[0]!.on_2025_partial).toBe(false)
    expect(a.source).toContain('Australian Electoral Commission')
    expect(a.party_shares.map((p) => p.district_id)).toEqual([1, 2])
  })
  it('stops when a district has no Census extras rather than writing a gap', async () => {
    const { toAsset } = await load()
    expect(() => toAsset(on([1, 2]), extra([1]), party([1, 2]))).toThrow(/no Census extras/)
  })
  it('stops when the party file and the One Nation file cover different districts', async () => {
    const { toAsset } = await load()
    expect(() => toAsset(on([1, 2]), extra([1, 2]), party([1]))).toThrow(/party shares/)
    expect(() => toAsset(on([1, 2]), extra([1, 2]), party([1, 3]))).toThrow(/party shares/)
  })
  it('turns a missing figure into null', async () => {
    const { toAsset } = await load()
    const o = on([1])
    o.districts[0]!.on_2022 = side(NaN)
    expect(toAsset(o, extra([1]), party([1])).districts[0]!.on_2022_pct).toBeNull()
  })
})

describe('the checked-in asset', () => {
  it('passes the lens validation against its own ids, party shares included', async () => {
    const asset = (await import('../components/explore/one-nation/one-nation.json')).default
    const ids = new Set(asset.districts.map((d) => d.district_id))
    const ok = validateAsset(asset, ids)
    expect(ok?.districts).toHaveLength(88)
    expect(ok?.party_shares).toHaveLength(88)
  })
  it('every seat: the shares add to 100, the Coalition is Liberal plus National, and One Nation matches its own column', async () => {
    const asset = (await import('../components/explore/one-nation/one-nation.json')).default
    const by = new Map(asset.districts.map((d) => [d.district_id, d]))
    for (const p of asset.party_shares) {
      // VE-101d: the old One Nation figure and the new all-party figure agree (0 of 88 differ).
      const own = by.get(p.district_id)!.on_2025_pct
      if (own !== null) expect(Math.abs(p.share_2025.ONP - own)).toBeLessThan(0.002)
      const s = p.share_2025
      expect(Math.abs(s.ALP + s.LIB + s.NAT + s.GRN + s.ONP + s.IND + s.OTH - 100)).toBeLessThan(0.05)
      expect(Math.abs(s.COA - (s.LIB + s.NAT))).toBeLessThan(0.002)
    }
  })
})
