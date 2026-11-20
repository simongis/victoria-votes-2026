import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadTier, pathBoxTicks, pathCentre, parseTier, tierFor } from './tiers'
import { vicgrid } from './vicgrid'

import phone from './geometry/districts-phone.json?raw'
import desktop from './geometry/districts-desktop.json?raw'
import detail from './geometry/districts-detail.json?raw'

const raw: Record<string, string> = { phone, desktop, detail }
const file = (n: string) => JSON.parse(raw[n]!)

describe('pathBoxTicks', () => {
  it('walks an absolute move then relative lines, across rings', () => {
    expect(pathBoxTicks('M10 20l5 0-3 8-2-8zM100 100l-4 4 8 0z')).toEqual({ x0: 10, y0: 20, x1: 104, y1: 104 })
  })
})

describe('tierFor', () => {
  it('takes the coarse tier on a phone-width fit, the middle one on a desktop fit, and the fine one zoomed in', () => {
    expect(tierFor(813000 / 390)).toBe(0)
    expect(tierFor(813000 / 1150)).toBe(1)
    expect(tierFor(200)).toBe(2)
  })
})

describe('built geometry', () => {
  // Victoria's own corners through VicGrid: the drawn state must have that shape, not a stretched one (FB-39).
  const lons = [140.96, 150.04]
  const lats = [-39.2, -33.98]
  const pts = lons.flatMap((lo) => lats.map((la) => vicgrid(lo, la)))
  const es = pts.map((p) => p[0])
  const ns = pts.map((p) => p[1])
  const corners = (Math.max(...es) - Math.min(...es)) / (Math.max(...ns) - Math.min(...ns))

  for (const name of ['phone', 'desktop', 'detail']) {
    it(`${name}: 88 districts, shape within 2% of the VicGrid ratio`, () => {
      const t = parseTier(file(name))
      expect(t.paths.size).toBe(88)
      expect(Math.abs(t.world.w / t.world.h / corners - 1)).toBeLessThan(0.02)
      // Every district's own box sits inside the state's.
      for (const b of t.boxes.values()) {
        expect(b.minE).toBeGreaterThanOrEqual(t.world.e0 - t.tick)
        expect(b.maxN).toBeLessThanOrEqual(t.world.n0 + t.tick)
      }
    })
  }

  it('Kew sits where VicGrid puts a point in Kew (145.04 E, -37.81 S, within 4 km)', () => {
    const t = parseTier(file('desktop'))
    const kew = t.boxes.get(15975)!
    const [e, n] = [(kew.minE + kew.maxE) / 2, (kew.minN + kew.maxN) / 2]
    const [he, hn] = vicgrid(145.04, -37.81)
    expect(Math.abs(e - he)).toBeLessThan(4000)
    expect(Math.abs(n - hn)).toBeLessThan(4000)
  })
})

describe('pathCentre', () => {
  it('is the centre of the biggest ring, so a seat with a small island is marked on its mainland', () => {
    // A 10 x 10 square from (0,0), and a 2 x 2 island far away.
    expect(pathCentre('M0 0l10 0 0 10-10 0zM100 100l2 0 0 2-2 0z')).toEqual({ x: 5, y: 5 })
  })
  it('falls back to the box centre for a ring with no area', () => {
    expect(pathCentre('M0 0l10 0-10 0z')).toEqual({ x: 5, y: 0 })
  })
})

describe('loadTier (VE-149)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('gives the request a deadline, fails plainly when it passes, and tries again next time', async () => {
    const seen: (AbortSignal | null | undefined)[] = []
    const f = vi.fn(async (_url: string, init?: RequestInit) => {
      seen.push(init?.signal)
      if (seen.length === 1) throw new DOMException('timed out', 'TimeoutError')
      return new Response(JSON.stringify(file('phone')))
    })
    vi.stubGlobal('fetch', f)
    await expect(loadTier(0)).rejects.toThrow(/timed out/)
    await expect(loadTier(0)).resolves.toBeDefined()
    expect(seen).toHaveLength(2)
    expect(seen.every((s) => s instanceof AbortSignal)).toBe(true)
  })
})
