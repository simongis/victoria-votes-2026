import { describe, expect, it } from 'vitest'
import raw from './places.json'
import { findPlaces, placeWords, validatePlaces, type PlaceIndex } from './lookup'

const ids = new Set(Array.from({ length: 88 }, (_, i) => i + 1))
const names = new Map<number, string>([[1, 'Wendouree'], [2, 'Ripon'], [3, 'Eureka'], [4, 'Melbourne']])
const nameOf = (id: number): string => names.get(id) ?? `Seat ${id}`

const asset = {
  v: 1,
  source: 'test',
  suburbs: [
    ['Ballarat Central', 1, 100],
    ['Ballarat East', 3, 100],
    ['Carlton', 4, 100],
    ['Carlton North', 4, 100],
    ["O'Connor's Hill", 2, 100],
    ['Newtown (Banyule)', 4, 100],
    ['St Kilda', 4, 100],
    ['Splitville', 1, 52, 2, 48],
  ],
  postcodes: [['3350', 1, 70, 2, 30], ['3351', 1, 60, 2, 25, 3, 15], ['3000', 4, 100]],
}
const index = validatePlaces(asset, ids) as PlaceIndex

describe('validatePlaces', () => {
  it('accepts the shipped asset', () => {
    // District ids are the VEC's (about 15907 to 16001), so take the set the asset itself names and check it is 88.
    const used = new Set<number>()
    for (const r of [...raw.suburbs, ...raw.postcodes]) for (let i = 1; i < r.length; i += 2) used.add(r[i] as number)
    expect(used.size).toBeGreaterThan(80)
    expect(used.size).toBeLessThanOrEqual(88)
    const real = validatePlaces(raw, used)
    expect(real).not.toBeNull()
    expect(real!.places.length).toBeGreaterThan(3000)
  })

  it('refuses a district id that is not in the statics (hold last good)', () => {
    expect(validatePlaces(asset, new Set([1, 2, 3]))).toBeNull()
  })

  it('refuses shares that do not sum to 100, bad shapes and the wrong version', () => {
    expect(validatePlaces({ ...asset, suburbs: [['A', 1, 90]] }, ids)).toBeNull()
    expect(validatePlaces({ ...asset, suburbs: [['A', 1]] }, ids)).toBeNull()
    expect(validatePlaces({ ...asset, v: 2 }, ids)).toBeNull()
    expect(validatePlaces(null, ids)).toBeNull()
    expect(validatePlaces({ ...asset, postcodes: [[3350, 1, 100]] }, ids)).toBeNull()
  })
})

describe('findPlaces', () => {
  const found = (q: string) => findPlaces(index, q).map((p) => p.name)

  it('needs two letters or three digits before it answers', () => {
    expect(found('')).toEqual([])
    expect(found('c')).toEqual([])
    expect(found('33')).toEqual([])
    expect(found('335')).toEqual(['3350', '3351'])
  })

  it('ranks an exact name first, then names that start with the query, then later words', () => {
    expect(found('carlton')).toEqual(['Carlton', 'Carlton North'])
    expect(found('east')).toEqual(['Ballarat East'])
    expect(found('ballarat')).toEqual(['Ballarat Central', 'Ballarat East'])
  })

  it('ignores case, accents, punctuation and extra spaces', () => {
    expect(found('  ST  kilda ')).toEqual(['St Kilda'])
    expect(found('oconnors')).toEqual(["O'Connor's Hill"])
    expect(found('Café')).toEqual([])
    expect(found('newtown banyule')).toEqual(['Newtown (Banyule)'])
  })

  it('matches a whole postcode first', () => {
    expect(found('3350')).toEqual(['3350'])
    expect(found('3000')).toEqual(['3000'])
  })

  it('caps the list', () => {
    expect(findPlaces(index, 'ba', 1)).toHaveLength(1)
  })
})

describe('placeWords', () => {
  const word = (n: string) => placeWords(index.places.find((p) => p.name === n)!, nameOf)

  it('says a whole place plainly', () => {
    expect(word('Ballarat Central')).toBe('Ballarat Central is in Wendouree')
  })

  it('says a clear majority as mostly and part', () => {
    expect(word('3350')).toBe('3350 is mostly Wendouree (70%), part Ripon (30%)')
    expect(word('3351')).toBe('3351 is mostly Wendouree (60%), part Ripon (25%), part Eureka (15%)')
  })

  it('says a near even split as a split', () => {
    expect(word('Splitville')).toBe('Splitville is split between Wendouree (52%) and Ripon (48%)')
  })
})
