import { describe, expect, it } from 'vitest'
import { taperArrow } from './taper'

const dist = (p: readonly [number, number]) => Math.hypot(p[0], p[1])

describe('taperArrow (variant A, the ABC 2025 shape)', () => {
  it('puts the tail at the origin and the tip at the asked length', () => {
    const a = taperArrow(40, 1, false)
    expect(a.tip[0]).toBeCloseTo(40)
    expect(a.tip[1]).toBeCloseTo(0)
    expect(a.points[0]![0]).toBeCloseTo(0)
  })
  it('points left for Labor and right for the Coalition, tilted up 30 degrees when angled', () => {
    const l = taperArrow(40, -1, true)
    const c = taperArrow(40, 1, true)
    expect(l.tip[0]).toBeLessThan(0)
    expect(c.tip[0]).toBeGreaterThan(0)
    expect(l.tip[1]).toBeLessThan(0)
    expect(dist(l.tip)).toBeCloseTo(40)
    expect(Math.atan2(-c.tip[1], c.tip[0])).toBeCloseTo((30 * Math.PI) / 180)
  })
  it('is thin at the tail and bold at the head', () => {
    const a = taperArrow(40, 1, false)
    const [tailTop, shaftTop, headTop, , headBot, shaftBot, tailBot] = a.points
    const tailW = Math.abs(tailBot![1] - tailTop![1])
    const shaftW = Math.abs(shaftBot![1] - shaftTop![1])
    const headW = Math.abs(headBot![1] - headTop![1])
    expect(tailW).toBeLessThan(shaftW)
    expect(shaftW).toBeLessThan(headW)
  })
  it('keeps a short arrow readable: the head never swallows the whole length', () => {
    const a = taperArrow(4, 1, false)
    expect(a.tip[0]).toBeGreaterThan(a.points[1]![0])
  })
  it('scales the whole shape for the larger side-panel marks', () => {
    const small = taperArrow(40, 1, false)
    const big = taperArrow(40, 1, false, 1.5)
    expect(Math.abs(big.points[2]![1])).toBeCloseTo(Math.abs(small.points[2]![1]) * 1.5)
  })
})
