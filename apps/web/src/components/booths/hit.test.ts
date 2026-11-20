import { describe, expect, it } from 'vitest'
import { nearestDot, type ScreenDot } from './hit'

const dots: ScreenDot[] = [
  { key: 1, x: 100, y: 100, r: 4 },
  { key: 2, x: 110, y: 100, r: 2 },
  { key: 3, x: 300, y: 300, r: 6 },
]

describe('nearestDot', () => {
  it('finds the dot under the pointer', () => {
    expect(nearestDot(dots, 100, 100, 9)?.key).toBe(1)
  })

  it('measures from the dot edge, so a big dot is easy to hit and a speck still within reach', () => {
    // 12 px from dot 3's centre is 6 px from its edge.
    expect(nearestDot(dots, 312, 300, 9)?.key).toBe(3)
  })

  it('picks the closer edge when two dots are near', () => {
    expect(nearestDot(dots, 107, 100, 9)?.key).toBe(2)
  })

  it('finds nothing outside the reach', () => {
    expect(nearestDot(dots, 200, 200, 9)).toBeNull()
  })

  it('reaches a little further for a finger', () => {
    expect(nearestDot(dots, 100, 120, 9)).toBeNull()
    expect(nearestDot(dots, 100, 120, 18)?.key).toBe(1)
  })

  it('skips dots that are not offered (dropped from the list by the caller)', () => {
    expect(nearestDot([], 0, 0, 9)).toBeNull()
  })
})
