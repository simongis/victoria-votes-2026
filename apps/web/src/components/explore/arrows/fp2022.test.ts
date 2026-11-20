import { describe, expect, it } from 'vitest'
import type { FirstPrefs2022Asset } from '@vic26/schema'
import asset from './fp-2022.json'
import { toBaseline, validateFp2022 } from './fp2022'

const ids = (n: number) => Array.from({ length: n }, (_, i) => 100 + i)
const make = (n: number, over: Partial<FirstPrefs2022Asset['districts'][number]> = {}): FirstPrefs2022Asset => ({
  source: 's',
  districts: ids(n).map((id) => ({ district_id: id, fp_2022_pct: { ALP: 60, LIB: 40 }, fp_2022_formal: 1000, ...over })),
})

describe('validateFp2022', () => {
  it('accepts 88 rows that match the statics and sum to 100', () => {
    expect(validateFp2022(make(88), new Set(ids(88)))).not.toBeNull()
  })
  it('rejects a wrong count, an unknown id or a duplicate', () => {
    expect(validateFp2022(make(87), new Set(ids(88)))).toBeNull()
    expect(validateFp2022(make(88), new Set(ids(87).concat(999)))).toBeNull()
    const dup = make(88)
    dup.districts[1] = { ...dup.districts[1]!, district_id: 100 }
    expect(validateFp2022(dup, new Set(ids(88)))).toBeNull()
  })
  it('rejects shares that do not sum to 100 within 0.2, or a share outside 0 to 100', () => {
    expect(validateFp2022(make(88, { fp_2022_pct: { ALP: 60, LIB: 39.7 } }), new Set(ids(88)))).toBeNull()
    expect(validateFp2022(make(88, { fp_2022_pct: { ALP: 120, LIB: -20 } }), new Set(ids(88)))).toBeNull()
    expect(validateFp2022(make(88, { fp_2022_pct: { ALP: 60, LIB: 39.9 } }), new Set(ids(88)))).not.toBeNull()
  })
  it('rejects anything that is not the asset shape', () => {
    expect(validateFp2022(null, new Set())).toBeNull()
    expect(validateFp2022({ districts: 3 }, new Set())).toBeNull()
  })
})

describe('the shipped asset', () => {
  it('has 88 rows that pass their own checks against their own ids', () => {
    const a = asset as FirstPrefs2022Asset
    expect(a.districts).toHaveLength(88)
    expect(validateFp2022(a, new Set(a.districts.map((d) => d.district_id)))).not.toBeNull()
  })
  it('turns into a lookup by district id', () => {
    const a = asset as FirstPrefs2022Asset
    const m = toBaseline(a)
    expect(m.size).toBe(88)
    expect(m.get(a.districts[0]!.district_id)).toBe(a.districts[0]!.fp_2022_pct)
  })
})
