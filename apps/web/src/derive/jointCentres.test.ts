import { describe, expect, it } from 'vitest'
import { colocatedPlaces, jointCentres, normaliseName } from './jointCentres'

const b = (id: number, name: string, districtId: number, e: number, n: number) => ({ id, name, districtId, e, n })

describe('jointCentres (VE-292)', () => {
  it('groups a centre of 2 and a centre of 3 at the same spot, ordered by district', () => {
    const g = jointCentres([
      b(1, 'Eltham Hall', 20, 2500000, 2400000),
      b(2, 'Eltham Hall', 10, 2500000.4, 2400000.3),
      b(3, 'Bay Pavilion', 7, 2600000, 2300000),
      b(4, 'Bay Pavilion', 5, 2600000, 2300000),
      b(5, 'Bay Pavilion', 9, 2600001, 2300001),
    ])
    expect(g.get(1)!.map((m) => m.id)).toEqual([2, 1])
    expect(g.get(2)).toBe(g.get(1))
    expect(g.get(3)!.map((m) => m.districtId)).toEqual([5, 7, 9])
  })
  it('keeps a nearby booth with a different name apart, and leaves lone booths out', () => {
    const g = jointCentres([b(1, 'Hall A', 1, 100, 100), b(2, 'Hall B', 2, 100, 101), b(3, 'Lone', 3, 5000, 5000)])
    expect(g.size).toBe(0)
  })
  it('does not group same-named booths far apart, or two records in one district', () => {
    const g = jointCentres([b(1, 'Town Hall', 1, 0, 0), b(2, 'Town Hall', 2, 900, 0), b(3, 'Library', 4, 50, 50), b(4, 'Library', 4, 50, 50)])
    expect(g.size).toBe(0)
  })
  it('normalises case, punctuation and spacing', () => {
    expect(normaliseName("  St. Mary's  Hall ")).toBe(normaliseName('ST MARYS HALL'))
  })
})

describe('colocatedPlaces (VE-301)', () => {
  const p = (id: number, name: string, districtId: number, e: number, n: number, isEvc = false) => ({ id, name, districtId, e, n, isEvc })
  it('groups places at one spot even when their names differ, so one tap can switch between them', () => {
    const g = colocatedPlaces([p(1, 'Essendon - EVC 2', 5, 100, 100, true), p(2, 'Strathmore North', 5, 100, 100), p(3, 'Far', 5, 900, 900)])
    expect(g.get(1)!.map((m) => m.id)).toEqual([1, 2])
    expect(g.get(2)).toBe(g.get(1))
    expect(g.has(3)).toBe(false)
  })
  it('includes same-name records of different districts, ordered by district then name', () => {
    const g = colocatedPlaces([p(1, 'St Albans - EVC 1', 30, 0, 0, true), p(2, 'St Albans - EVC 1', 10, 0, 0.5, true), p(3, 'Other', 10, 3, 0)])
    expect(g.get(1)!.map((m) => m.id)).toEqual([3, 2, 1])
  })
  it('does not reach places further than the radius', () => {
    expect(colocatedPlaces([p(1, 'A', 1, 0, 0), p(2, 'B', 2, 11, 0)]).size).toBe(0)
  })
})
