import { describe, expect, it } from 'vitest'
import { artFor, hexPoints, svgId } from './legendArt'

describe('artFor (VE-303): which illustration heads the "i"', () => {
  it('follows the colour mode', () => {
    expect(artFor('leader', false, false)).toBe('leader')
    expect(artFor('trust', false, false)).toBe('swing')
    expect(artFor('lvc', false, false)).toBe('lvc')
    expect(artFor('gains', false, false)).toBe('gains')
  })
  it('Polling places wins over the colour underneath', () => {
    expect(artFor('trust', true, false)).toBe('places')
    expect(artFor('leader', true, true)).toBe('places')
  })
  it('Leader at Final has no steps to explain, so no art', () => {
    expect(artFor('leader', false, true)).toBeNull()
  })
  it('the folded How sure colour has none', () => {
    expect(artFor('certainty', false, false)).toBeNull()
  })
})

describe('hexPoints', () => {
  it('draws a pointy-top hexagon of six corners at the given radius', () => {
    const pts = hexPoints(50, 40, 10).split(' ').map((p) => p.split(',').map(Number) as [number, number])
    expect(pts).toHaveLength(6)
    for (const [x, y] of pts) expect(Math.hypot(x - 50, y - 40)).toBeCloseTo(10, 0)
    // Pointy top: one corner straight above the centre.
    expect(pts.some(([x, y]) => Math.abs(x - 50) < 0.1 && Math.abs(y - 30) < 0.1)).toBe(true)
  })
})

describe('svgId', () => {
  it("makes React's useId safe inside url(#...)", () => {
    expect(svgId(':r1:', 'hatch')).toBe('r1-hatch')
    expect(svgId('«r2»', 'x')).toBe('r2-x')
  })
})
