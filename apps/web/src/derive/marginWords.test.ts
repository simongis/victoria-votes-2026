import { describe, expect, it } from 'vitest'
import { aheadCardLine, aheadLine, leadCell, LEAD_HEADER } from './marginWords'

describe('marginWords (VE-195)', () => {
  it('names the column by what it is: votes ahead', () => {
    expect(LEAD_HEADER).toBe('Lead')
  })
  it('rounds an estimate so it claims no more than it knows', () => {
    expect(leadCell(1234)).toBe('1,200')
    expect(leadCell(12_345)).toBe('12,000')
  })
  it('says under 100 for a near tie, and a dash with no figure', () => {
    expect(leadCell(30)).toBe('<100')
    expect(leadCell(null)).toBe('-')
  })
  it('reads as a plain sentence', () => {
    expect(aheadLine(4140)).toBe('Ahead by about 4,100 votes')
    expect(aheadLine(30)).toBe('Ahead by under 100 votes')
    expect(aheadLine(null)).toBeNull()
  })
  it('has a card form short enough for a phone card', () => {
    expect(aheadCardLine(12_345)).toBe('About 12,000 votes ahead')
    expect(aheadCardLine(30)).toBe('Under 100 votes ahead')
    expect(aheadCardLine(null)).toBeNull()
  })
})
