import { describe, expect, it } from 'vitest'
import type { PartyBucket } from '@vic26/schema'
import { pulseSeries, pulseValue, sparkPath } from './pulse'
import type { Seat } from './seats'

const seat = (id: number, base: PartyBucket | null, tcp: Seat['tcp'], leader: PartyBucket | null = tcp?.a ?? null): Seat =>
  ({ id, name: `S${id}`, leader, base, tcp }) as Seat

describe('pulseValue', () => {
  it("is the 2022 holder's signed 2CP margin in points: positive ahead, negative behind", () => {
    expect(pulseValue(seat(1, 'ALP', { a: 'ALP', b: 'LIB', pctA: 56 }))).toBeCloseTo(12)
    // The holder trails: the leader is LIB on 54, so ALP is on 46 and 8 points behind.
    expect(pulseValue(seat(1, 'ALP', { a: 'LIB', b: 'ALP', pctA: 54 }))).toBeCloseTo(-8)
  })
  it('falls back to the leader margin when there was no holder', () => {
    expect(pulseValue(seat(1, null, { a: 'GRN', b: 'ALP', pctA: 55 }))).toBeCloseTo(10)
  })
  it('is null with no 2CP, or when the holder is not in the pairing', () => {
    expect(pulseValue(seat(1, 'ALP', null))).toBeNull()
    expect(pulseValue(seat(1, 'ALP', { a: 'GRN', b: 'LIB', pctA: 60 }))).toBeNull()
    expect(pulseValue(seat(1, 'ALP', { a: 'ALP', b: null, pctA: 60 }))).toBeCloseTo(20)
  })
})

describe('pulseSeries', () => {
  it('gives each seat one value per tick, null where nothing was in', () => {
    const t0 = new Map([[1, seat(1, 'ALP', null)]])
    const t1 = new Map([[1, seat(1, 'ALP', { a: 'ALP', b: 'LIB', pctA: 55 })]])
    const t2 = new Map([[1, seat(1, 'ALP', { a: 'LIB', b: 'ALP', pctA: 51 })], [2, seat(2, 'LIB', { a: 'LIB', b: 'ALP', pctA: 60 })]])
    const s = pulseSeries([t0, t1, t2])
    expect(s.get(1)).toEqual([null, expect.closeTo(10), expect.closeTo(-2)])
    // Seat 2 first appears at tick 2: earlier ticks are null, so every series is as long as the night
    expect(s.get(2)).toEqual([null, null, expect.closeTo(20)])
  })
})

describe('sparkPath', () => {
  it('maps ticks across the width and points up the height, clamped to the range', () => {
    // 3 ticks of a 4-tick night over 40 x 20, range 10: the zero line is y = 10
    expect(sparkPath([0, 10, 40], 4, 40, 20, 10)).toBe('M0 10L13.33 0L26.67 0')
  })
  it('breaks the line at missing ticks and draws a lone point as a dot-length stroke', () => {
    expect(sparkPath([5, null, -5, -5], 4, 30, 20, 10)).toBe('M0 5L0 5M20 15L30 15')
  })
  it('is empty with no figures', () => {
    expect(sparkPath([null, null], 2, 40, 20, 10)).toBe('')
    expect(sparkPath([], 0, 40, 20, 10)).toBe('')
  })
})
