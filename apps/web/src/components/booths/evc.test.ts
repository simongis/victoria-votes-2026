import { describe, expect, it } from 'vitest'
import { evcRing, groupEvcs, hasEvcResults } from './evc'
import type { BoothRow, BoothStatic } from './model'

const c = (id: number, name: string, e: number, n: number, districtId = 10): BoothStatic => ({ id, name, districtId, e, n })
const fp = (o: Partial<BoothRow['fp']>): BoothRow['fp'] => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0, ...o })

describe('groupEvcs', () => {
  it('makes one dot per physical centre: the same name and place across seats is one group', () => {
    const g = groupEvcs([c(1, 'Town Hall', 1000, 2000, 10), c(2, 'Town Hall', 1000.4, 1999.6, 11), c(3, 'Library', 5000, 5000)])
    expect(g).toHaveLength(2)
    const hall = g.find((x) => x.name === 'Town Hall')!
    expect(hall.ids.sort()).toEqual([1, 2])
    expect(hall.districtIds.sort()).toEqual([10, 11])
  })

  it('keeps two centres of the same name in different places apart', () => {
    expect(groupEvcs([c(1, 'Library', 0, 0), c(2, 'Library', 20000, 0)])).toHaveLength(2)
  })

  it('hides centres with no usable coordinates until the live set-up', () => {
    expect(groupEvcs([c(1, 'No place', NaN, NaN), c(2, 'Ok', 1, 1)]).map((x) => x.name)).toEqual(['Ok'])
  })
})

describe('hasEvcResults', () => {
  it('is false on the 2022 replay (no history rows for any centre)', () => {
    expect(hasEvcResults([c(1, 'A', 0, 0)], new Map())).toBe(false)
  })
  it('is true once a centre has figures', () => {
    expect(hasEvcResults([c(1, 'A', 0, 0)], new Map([[1, [{ at: 1, fp: fp({ ALP: 3 }) }]]]))).toBe(true)
  })
})

describe('evcRing', () => {
  it('is a ringed dot: a heavier outline than a booth, and a lighter fill so the ring reads', () => {
    const r = evcRing(4)
    expect(r.strokeWidth).toBeGreaterThan(1.6)
    expect(r.fillOpacity).toBeLessThan(0.9)
    expect(r.radius).toBeGreaterThan(4)
  })
})
