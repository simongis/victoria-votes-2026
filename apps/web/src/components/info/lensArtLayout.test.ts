import { describe, expect, it } from 'vitest'
import { SIM_CENTRE, SIM_FIVE, SIM_FIFTEEN, SIM_R, crossings, rampStops, strongestArtFor, threadPath } from './lensArtLayout'

describe('strongestArtFor (VE-313): which picture heads the Strongest key', () => {
  it('Vote share shows the strength ramp, Seat profile the fifths', () => {
    expect(strongestArtFor('vote')).toBe('strength')
    expect(strongestArtFor('share')).toBe('profile')
  })
  it('Other votes keeps its own words and no picture', () => {
    expect(strongestArtFor('flow')).toBeNull()
  })
})

describe('rampStops', () => {
  it('steps evenly from 0 to the top of the scale', () => {
    expect(rampStops(20, 5)).toEqual([0, 5, 10, 15, 20])
  })
  it('gives one stop at the top for a single step', () => {
    expect(rampStops(12, 1)).toEqual([12])
  })
})

describe('crossings', () => {
  it('finds where a line passes through the middle, by straight-line interpolation', () => {
    // Above the middle (smaller y) then below it: one crossing halfway along the second segment.
    const xs = crossings([[0, 10], [10, 15], [20, 25]], 20)
    expect(xs).toHaveLength(1)
    expect(xs[0]).toBeCloseTo(15, 5)
  })
  it('counts every crossing, either way', () => {
    expect(crossings([[0, 10], [10, 30], [20, 10]], 20)).toEqual([5, 15])
  })
  it('a line that only touches the middle and goes back does not count', () => {
    expect(crossings([[0, 10], [10, 20], [20, 10]], 20)).toEqual([])
  })
})

describe('the Similar picture layout', () => {
  const all = [SIM_CENTRE, ...SIM_FIVE, ...SIM_FIFTEEN]
  it('draws the 5 nearest and the next 15', () => {
    expect(SIM_FIVE).toHaveLength(5)
    expect(SIM_FIFTEEN).toHaveLength(15)
  })
  it('keeps every hexagon inside its half of the picture, clear of the labels', () => {
    for (const p of all) {
      expect(p.x - p.r).toBeGreaterThanOrEqual(0)
      expect(p.x + p.r).toBeLessThanOrEqual(214)
      expect(p.y - p.r).toBeGreaterThanOrEqual(0)
      expect(p.y + p.r).toBeLessThanOrEqual(124)
    }
  })
  it('no two hexagons overlap', () => {
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) {
        const a = all[i]!
        const b = all[j]!
        expect(Math.hypot(a.x - b.x, a.y - b.y), `${i} and ${j}`).toBeGreaterThan(a.r + b.r)
      }
  })
  it('the centre seat is the biggest mark', () => {
    expect(SIM_CENTRE.r).toBe(SIM_R.centre)
    for (const p of [...SIM_FIVE, ...SIM_FIFTEEN]) expect(p.r).toBeLessThan(SIM_CENTRE.r)
  })
  it('a thread is a gentle curve from the centre to its seat', () => {
    const d = threadPath(SIM_CENTRE, SIM_FIVE[0]!)
    expect(d.startsWith(`M${SIM_CENTRE.x} ${SIM_CENTRE.y}Q`)).toBe(true)
    expect(d.endsWith(`${SIM_FIVE[0]!.x} ${SIM_FIVE[0]!.y}`)).toBe(true)
  })
})
