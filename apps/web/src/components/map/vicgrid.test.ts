import { describe, expect, it } from 'vitest'
import { vicgrid } from './vicgrid'

// EPSG 7899 (GDA2020 / Vicgrid): Lambert conic conformal 2SP on GRS80, false origin -37, 145, 2500000 E 2500000 N,
// standard parallels -36 and -38 (epsg.io/7899, CONFIRMED).
const A = 6378137
const E2 = 2 * (1 / 298.257222101) - (1 / 298.257222101) ** 2

describe('vicgrid', () => {
  it('puts the false origin at 2500000, 2500000', () => {
    const [x, y] = vicgrid(145, -37)
    expect(x).toBeCloseTo(2500000, 3)
    expect(y).toBeCloseTo(2500000, 3)
  })

  it('has unit scale along a standard parallel (1 degree of longitude at -36 is a cos(phi) / sqrt(1 - e2 sin2 phi) arc)', () => {
    for (const lat of [-36, -38]) {
      const phi = (lat * Math.PI) / 180
      const arc = ((A * Math.cos(phi)) / Math.sqrt(1 - E2 * Math.sin(phi) ** 2)) * (Math.PI / 180)
      const [x0, y0] = vicgrid(145, lat)
      const [x1, y1] = vicgrid(146, lat)
      // The parallel curves a little, so compare the chord; at 1 degree the chord is within a few mm of the arc.
      expect(Math.hypot(x1 - x0, y1 - y0)).toBeCloseTo(arc, 0)
    }
  })

  it('lands Melbourne GPO where a VicGrid map has it (hand check, about 2,496,700 E 2,409,700 N)', () => {
    const [x, y] = vicgrid(144.9631, -37.8136)
    expect(Math.abs(x - 2496750)).toBeLessThan(600)
    expect(Math.abs(y - 2409700)).toBeLessThan(600)
  })

  it('north is up and east is right', () => {
    const [x0, y0] = vicgrid(145, -37)
    expect(vicgrid(145, -36)[1]).toBeGreaterThan(y0)
    expect(vicgrid(146, -37)[0]).toBeGreaterThan(x0)
  })
})
