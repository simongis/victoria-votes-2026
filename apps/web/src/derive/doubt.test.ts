import { describe, expect, it } from 'vitest'
import { barScale, barWidths, doubtWords } from './doubt'

describe('barScale', () => {
  it('is the largest lead or votes-left figure across the rows', () => {
    expect(barScale([{ lead: 1200, left: 9000 }, { lead: 15000, left: 4000 }])).toBe(15000)
    expect(barScale([{ lead: 300, left: 9000 }])).toBe(9000)
  })
  it('skips rows with a missing figure, and is 0 when none have both', () => {
    expect(barScale([{ lead: null, left: 50000 }, { lead: 100, left: 200 }])).toBe(200)
    expect(barScale([{ lead: null, left: null }])).toBe(0)
    expect(barScale([])).toBe(0)
  })
})

describe('barWidths', () => {
  it('gives each bar as a percentage of the shared scale, with the tick at the votes left', () => {
    expect(barWidths(1200, 9000, 12000)).toEqual({ lead: 10, left: 75, tick: 75 })
    expect(barWidths(12000, 12000, 12000)).toEqual({ lead: 100, left: 100, tick: 100 })
  })
  it('is null with a missing figure or no scale', () => {
    expect(barWidths(null, 9000, 12000)).toBeNull()
    expect(barWidths(100, null, 12000)).toBeNull()
    expect(barWidths(100, 100, 0)).toBeNull()
  })
})

describe('doubtWords', () => {
  it('reads the rounded figures for a screen reader', () => {
    expect(doubtWords(1234, 9020)).toBe('Lead about 1,200 votes, about 9,000 still to count')
    expect(doubtWords(15400, 26400)).toBe('Lead about 15,000 votes, about 26,000 still to count')
  })
  it('handles a lead under 100 and nothing left', () => {
    expect(doubtWords(40, 500)).toBe('Lead under 100 votes, about 500 still to count')
    expect(doubtWords(300, 0)).toBe('Lead about 300 votes, nothing left to count')
  })
  it('says there are no figures when either is missing', () => {
    expect(doubtWords(null, 500)).toBe('No vote figures yet')
  })
})
