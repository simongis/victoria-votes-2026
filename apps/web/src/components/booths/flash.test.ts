import { describe, expect, it } from 'vitest'
import { changedBoothIds } from './flash'
import type { BoothFp, BoothRow } from './model'

const fp = (o: Partial<BoothFp>): BoothFp => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0, ...o })
const row = (at: number, o: Partial<BoothFp>): BoothRow => ({ at, fp: fp(o) })

describe('changedBoothIds (VE-288)', () => {
  const byBooth = new Map<number, BoothRow[]>([
    [1, [row(100, { ALP: 10 }), row(200, { ALP: 12, LIB: 5 })]], // grew this tick
    [2, [row(100, { ALP: 10 })]], // nothing new
    [3, [row(200, { GRN: 4 })]], // reported for the first time
    [4, [row(100, { ALP: 10 }), row(200, { ALP: 10 })]], // a row, but the same figures
    [5, [row(300, { ALP: 9 })]], // a later tick: not yet
  ])
  it('lists booths whose figures differ between the two ticks, first reports included', () => {
    expect([...changedBoothIds(byBooth, 100, 200)].sort()).toEqual([1, 3])
  })
  it('is empty when nothing moved', () => {
    expect(changedBoothIds(byBooth, 200, 200).size).toBe(0)
  })
  it('names an early voting centre by its first id when any of its ids changed', () => {
    const evc = [{ key: 'k', name: 'EVC', e: 0, n: 0, ids: [8, 9], districtIds: [1, 2] }]
    const m = new Map<number, BoothRow[]>([[9, [row(200, { ALP: 3 })]]])
    expect(changedBoothIds(m, 100, 200, evc).has(8)).toBe(true)
  })
})
