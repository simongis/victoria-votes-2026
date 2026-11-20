import { describe, expect, it } from 'vitest'
import { HALO_MS, haloAt } from './halo'

describe('haloAt', () => {
  it('starts as a full-strength ring at its resting size and ends invisible and wider', () => {
    const a = haloAt(0)
    expect(a.scale).toBe(1)
    expect(a.alpha).toBeCloseTo(0.9)
    const z = haloAt(HALO_MS)
    expect(z.alpha).toBe(0)
    expect(z.scale).toBeGreaterThan(2)
  })
  it('only ever grows and fades', () => {
    let prev = haloAt(0)
    for (let ms = 50; ms <= HALO_MS; ms += 50) {
      const h = haloAt(ms)
      expect(h.scale).toBeGreaterThanOrEqual(prev.scale)
      expect(h.alpha).toBeLessThanOrEqual(prev.alpha)
      prev = h
    }
  })
})
