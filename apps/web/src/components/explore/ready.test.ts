import { describe, expect, it } from 'vitest'
import { SWING_MIN_PCT } from '../../derive/colour'
import { lensReady, readyLenses } from './ready'

const seats = (n: number, pct: number) => new Map(Array.from({ length: n }, (_, i) => [i, { pct }]))
const ids = ['arrows', 'counted', 'prefs', 'one-nation']

describe('lensReady (VE-129, FB-148)', () => {
  it('offers swing arrows only once 10 seats are past the swing threshold', () => {
    expect(lensReady('arrows', seats(88, 0))).toBe(false)
    expect(lensReady('arrows', new Map([...seats(9, 80), ...[[100, { pct: SWING_MIN_PCT - 1 }]] as const]))).toBe(false)
    expect(lensReady('arrows', seats(10, SWING_MIN_PCT))).toBe(true)
  })
  it('always offers Counted, Preferences and One Nation', () => {
    for (const id of ['counted', 'prefs', 'one-nation']) expect(lensReady(id, seats(0, 0))).toBe(true)
  })
  it('readyLenses keeps order and drops the swing card at 7 pm', () => {
    expect(readyLenses(ids.map((id) => ({ id })), seats(88, 0)).map((l) => l.id)).toEqual(['counted', 'prefs', 'one-nation'])
    expect(readyLenses(ids.map((id) => ({ id })), seats(88, 90)).map((l) => l.id)).toEqual(ids)
  })
})
