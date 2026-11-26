import { describe, expect, it } from 'vitest'
import { readPalette } from '../theme/theme'
import { LIKELY_FROM_PCT, allDeclared, dimRgb, leadStep, leaderRgb, seatRgb, tintRgb } from './encoding'
import type { Seat } from '../derive/seats'

const pal = readPalette((n) => ({ '--party-alp': '#ff0000', '--map-tint-base': '#ffffff', '--map-tint-amount': '0.5', '--map-no-result': '#eeeeee', '--map-paper': '#000000' })[n] ?? '')
const seat = (over: Partial<Seat>) => ({ leader: 'ALP', state: 'leading', ...over }) as Seat

describe('seat encoding', () => {
  it('uses the full party colour for firm and won seats', () => {
    expect(seatRgb(seat({ state: 'firm' }), pal)).toEqual([255, 0, 0])
    expect(seatRgb(seat({ state: 'won' }), pal)).toEqual([255, 0, 0])
  })
  it('uses the tint for leading seats', () => {
    expect(seatRgb(seat({}), pal)).toEqual(tintRgb('ALP', pal))
    expect(tintRgb('ALP', pal)).toEqual([255, 128, 128])
  })
  it('uses the no-result colour when nothing is counted', () => {
    expect(seatRgb(seat({ leader: null, state: 'none' }), pal)).toEqual([238, 238, 238])
    expect(seatRgb(undefined, pal)).toEqual([238, 238, 238])
  })
  it('dims a colour most of the way towards the paper', () => {
    expect(dimRgb([200, 100, 0], pal)).toEqual([50, 25, 0])
  })
})

describe('the Leader steps (VE-127)', () => {
  it('early until the seat is Likely (ADR 0033: count, margin and preferences, not the count alone), solid once firm or won', () => {
    expect(LIKELY_FROM_PCT).toBe(30)
    expect(leadStep(seat({ pct: 0 }))).toBe(0)
    expect(leadStep(seat({ pct: 30 }))).toBe(0)
    expect(leadStep(seat({ pct: 95 }))).toBe(0)
    expect(leadStep(seat({ pct: 95, likely: true }))).toBe(1)
    expect(leadStep(seat({ pct: null }))).toBe(0)
    expect(leadStep(seat({ state: 'firm', pct: 5 }))).toBe(2)
    expect(leadStep(seat({ state: 'won', pct: 5 }))).toBe(2)
  })
  it('no figures has no step and the no-result colour', () => {
    expect(leadStep(seat({ leader: null, state: 'none' }))).toBeNull()
    expect(leadStep(undefined)).toBeNull()
    expect(leaderRgb(undefined, pal)).toEqual([238, 238, 238])
  })
  it('colours run tint, two thirds, full (LIKELY_MIX)', () => {
    expect(leaderRgb(seat({ pct: 10 }), pal)).toEqual([255, 128, 128])
    expect(leaderRgb(seat({ pct: 60, likely: true }), pal)).toEqual([255, 42, 42])
    expect(leaderRgb(seat({ state: 'won' }), pal)).toEqual([255, 0, 0])
  })
})

describe('allDeclared (VE-142: steps drop once every leading seat is declared)', () => {
  it('is true only when every leading seat is won', () => {
    expect(allDeclared([seat({ state: 'won' }), seat({ state: 'won', leader: 'LIB' })])).toBe(true)
    expect(allDeclared([seat({ state: 'won' }), seat({ state: 'firm' })])).toBe(false)
    expect(allDeclared([seat({ state: 'won' }), seat({ pct: 10 })])).toBe(false)
  })
  it('is false while any seat has no leader or no results (VE-254: Narracan with no results is not declared), and with nothing to show', () => {
    expect(allDeclared([seat({ state: 'won' }), seat({ leader: null, state: 'none' })])).toBe(false)
    expect(allDeclared([seat({ state: 'won' }), undefined])).toBe(false)
    expect(allDeclared([seat({ leader: null, state: 'none' })])).toBe(false)
    expect(allDeclared([])).toBe(false)
  })
})
