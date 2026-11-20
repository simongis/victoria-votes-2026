import { describe, expect, it } from 'vitest'
import { frameFor, type Frame } from './framing'

const FULL: Frame = [0, 0, 1000, 800]
const box = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 })

describe('frameFor', () => {
  it('frames six close places so they fill at most 70% of the stage', () => {
    const f = frameFor([box(500, 400, 520, 415), box(540, 420, 560, 440)], FULL, 1.25)!
    expect(f).not.toBeNull()
    expect(60 / f[2]).toBeLessThanOrEqual(0.7 + 1e-9)
    expect(40 / f[3]).toBeLessThanOrEqual(0.7 + 1e-9)
    expect(f[2] / f[3]).toBeCloseTo(1.25)
    // Centred on the six.
    expect(f[0] + f[2] / 2).toBeCloseTo(530)
    expect(f[1] + f[3] / 2).toBeCloseTo(420)
  })
  it('gives the whole state (null) when the six span most of it', () => {
    expect(frameFor([box(50, 50, 120, 100), box(900, 700, 960, 760)], FULL, 1.25)).toBeNull()
  })
  it('is null with nothing to frame', () => {
    expect(frameFor([], FULL, 1.25)).toBeNull()
  })
})
