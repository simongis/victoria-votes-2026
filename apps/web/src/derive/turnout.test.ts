import { describe, expect, it } from 'vitest'
import type { Seat } from './seats'
import { COUNTED_LENS_FINAL_TITLE, countedShare, countedWord, isFinal } from './turnout'

const seat = (o: Partial<Seat>): Seat => ({ leader: 'ALP', state: 'won', pct: 87, ...o }) as Seat

describe('isFinal (VE-165: the same state as allDeclared, in one place)', () => {
  it('is true only when every leading seat is declared', () => {
    expect(isFinal([seat({}), seat({ leader: 'LIB' })])).toBe(true)
    expect(isFinal([seat({}), seat({ state: 'firm' })])).toBe(false)
    expect(isFinal([])).toBe(false)
  })
})

describe('countedWord', () => {
  it('says turnout at Final, counted otherwise (a finished seat never reaches 100%, so "counted" misleads)', () => {
    expect(countedWord(true)).toBe('turnout')
    expect(countedWord(false)).toBe('counted')
  })
  it('has a turnout title for the Counted lens at Final', () => {
    expect(COUNTED_LENS_FINAL_TITLE).toBe('Where was turnout highest?')
  })
})

describe('countedShare (VE-227, finding 14: 0% beside "First figures in 26 seats" read as a contradiction)', () => {
  it('says "Under 1%" when something is counted but it rounds to 0', () => {
    expect(countedShare(0.3)).toBe('Under 1%')
    expect(countedShare(0.49)).toBe('Under 1%')
  })
  it('keeps "0%" for nothing counted and rounds otherwise', () => {
    expect(countedShare(0)).toBe('0%')
    expect(countedShare(0.5)).toBe('1%')
    expect(countedShare(29.6)).toBe('30%')
    expect(countedShare(100)).toBe('100%')
  })
})
