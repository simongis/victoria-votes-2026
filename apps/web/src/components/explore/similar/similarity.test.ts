import { describe, expect, it } from 'vitest'
import { FEATURED, NEAREST, SIMILAR_CREDIT, bandOf, kmBetween, loadOrder, nearest, rankOf, awayLine, rowLabel, validateOrder } from './similarity'

// 2022 district ids: Ripon and the four seats its place ranks put first (checked against the source page, VE-205).
const RIPON = 15987
const RIPON_TOP4 = [15969 /* Gippsland South */, 16001 /* Euroa */, 15976 /* Ovens Valley */, 15917 /* Gippsland East */]

describe('the shipped ranks', () => {
  const order = loadOrder()
  it('hold 88 seats, each ranking the other 87 exactly once', () => {
    const ids = Object.keys(order).map(Number)
    expect(ids).toHaveLength(88)
    expect(validateOrder(order)).toBeNull()
  })
  it('put Ripon\'s first four as Gippsland South, Euroa, Ovens Valley, Gippsland East', () => {
    expect(nearest(RIPON, 4)).toEqual(RIPON_TOP4)
    expect(nearest(RIPON)).toHaveLength(NEAREST)
  })
  it('give an unknown seat no matches', () => {
    expect(nearest(1)).toEqual([])
    expect(rankOf(1, RIPON)).toBeNull()
  })
  it('rank a seat from 1, and never rank a seat against itself', () => {
    expect(rankOf(RIPON, RIPON_TOP4[0]!)).toBe(1)
    expect(rankOf(RIPON, RIPON_TOP4[3]!)).toBe(4)
    expect(rankOf(RIPON, RIPON)).toBeNull()
  })
})

describe('the featured seat', () => {
  it('is Lowan, a real seat with five matches, and its matches are far off', () => {
    expect(FEATURED).toBe(15915) // Lowan, checked by hand in scripts/build-similarity.mjs output: mean 350 km
    expect(Object.keys(loadOrder()).map(Number)).toContain(FEATURED)
    expect(nearest(FEATURED)).toHaveLength(NEAREST)
  })
})

describe('validateOrder', () => {
  it('names the first fault', () => {
    expect(validateOrder({ 1: [2], 2: [1, 1] })).toMatch(/seat 2/)
    expect(validateOrder({ 1: [1], 2: [1] })).toMatch(/seat 1/)
    expect(validateOrder({ 1: [3], 2: [1] })).toMatch(/seat 1/)
  })
  it('accepts a complete small set', () => {
    expect(validateOrder({ 1: [2, 3], 2: [1, 3], 3: [2, 1] })).toBeNull()
  })
})

describe('bandOf', () => {
  it('splits the 87 ranks 5, 15, 25 and 42', () => {
    expect([1, 5, 6, 20, 21, 45, 46, 87].map(bandOf)).toEqual([1, 1, 2, 2, 3, 3, 4, 4])
  })
})

describe('kmBetween', () => {
  it('turns tick distance into kilometres to the nearest 5, never under 5', () => {
    expect(kmBetween({ x: 0, y: 0 }, { x: 12600, y: 0 }, 25)).toBe(315)
    expect(kmBetween({ x: 0, y: 0 }, { x: 3, y: 4 }, 25)).toBe(5)
  })
})

describe('row text', () => {
  it('shows the distance, and the vote line in the spoken name', () => {
    expect(awayLine(315)).toBe('315 km away')
    expect(awayLine(null)).toBeNull()
    expect(rowLabel(1, 'Gippsland South', awayLine(315), 'Nationals leading, 62%')).toBe('1. Gippsland South, 315 km away, Nationals leading, 62%. Make it the picked seat')
    expect(rowLabel(2, 'Euroa', null, 'Not counted yet')).toBe('2. Euroa, Not counted yet. Make it the picked seat')
  })
})

describe('credit', () => {
  it('is the agreed wording', () => {
    expect(SIMILAR_CREDIT).toBe('Place similarity:')
  })
})
