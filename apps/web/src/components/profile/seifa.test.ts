import { describe, expect, it } from 'vitest'
import asset from './seifa.json'
import { seifaRows, validateSeifa } from './seifa'

const ids = (n: number) => new Set(Array.from({ length: n }, (_, i) => 100 + i))
const good = (n = 88) => ({
  source: 'test',
  districts: Array.from({ length: n }, (_, i) => ({ district_id: 100 + i, pct_irsd_q1: 20, pct_irsad_q5: 20 })),
})

describe('validateSeifa', () => {
  it('accepts 88 matching rows', () => {
    expect(validateSeifa(good(), ids(88))).not.toBeNull()
  })
  it('rejects a short list, an unknown id, a duplicate and an out of range share', () => {
    expect(validateSeifa(good(87), ids(88))).toBeNull()
    const unknown = good()
    unknown.districts[0]!.district_id = 5
    expect(validateSeifa(unknown, ids(88))).toBeNull()
    const dup = good()
    dup.districts[1]!.district_id = 100
    expect(validateSeifa(dup, ids(88))).toBeNull()
    const range = good()
    range.districts[2]!.pct_irsd_q1 = 101
    expect(validateSeifa(range, ids(88))).toBeNull()
    const nan = good()
    nan.districts[2]!.pct_irsad_q5 = Number.NaN
    expect(validateSeifa(nan, ids(88))).toBeNull()
    expect(validateSeifa(null, ids(88))).toBeNull()
  })
})

describe('seifaRows', () => {
  it('words each share plainly and keeps the 20 per cent reference', () => {
    const [low, high] = seifaRows({ district_id: 1, pct_irsd_q1: 36.4, pct_irsad_q5: 4.6 })
    expect(low!.text).toBe("36% live in Victoria's most disadvantaged fifth")
    expect(high!.text).toBe("5% live in Victoria's most advantaged fifth")
    expect(low!.pct).toBeCloseTo(36.4)
    expect(low!.reference).toBe(20)
  })
  it('never prints 0% for a small non-zero share', () => {
    expect(seifaRows({ district_id: 1, pct_irsd_q1: 0.2, pct_irsad_q5: 0 })[0]!.text).toBe("Under 1% live in Victoria's most disadvantaged fifth")
    expect(seifaRows({ district_id: 1, pct_irsd_q1: 0.2, pct_irsad_q5: 0 })[1]!.text).toBe("None live in Victoria's most advantaged fifth")
  })
})

describe('the shipped asset', () => {
  it('has 88 unique rows with shares from 0 to 100', () => {
    expect(asset.districts).toHaveLength(88)
    expect(new Set(asset.districts.map((d) => d.district_id)).size).toBe(88)
    for (const d of asset.districts) {
      expect(d.pct_irsd_q1).toBeGreaterThanOrEqual(0)
      expect(d.pct_irsd_q1).toBeLessThanOrEqual(100)
      expect(d.pct_irsad_q5).toBeGreaterThanOrEqual(0)
      expect(d.pct_irsad_q5).toBeLessThanOrEqual(100)
    }
  })
})
