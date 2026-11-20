import { describe, expect, it } from 'vitest'
import type { GeoCollection, Position } from '../data/types'
import {
  buildMorphShapes,
  chipRingFor,
  islandAlpha,
  islandRingAt,
  lerpRing,
  nearestOnRing,
  open,
  resample,
  signedArea,
} from './morph'

// Counter-clockwise square, closed, 10 degrees wide near Victoria.
const square = (x: number, y: number, s: number): Position[] => [
  [x, y],
  [x + s, y],
  [x + s, y + s],
  [x, y + s],
  [x, y],
]
const hexRing = (cx: number, cy: number, r: number): Position[] => {
  const pts = Array.from({ length: 6 }, (_, i): Position => [cx + r * Math.cos((i * Math.PI) / 3), cy + r * Math.sin((i * Math.PI) / 3)])
  return [...pts, pts[0]!]
}

describe('resample', () => {
  it('returns exactly N points', () => {
    expect(resample(square(0, 0, 4), 96)).toHaveLength(96)
    expect(resample(square(0, 0, 4), 7)).toHaveLength(7)
  })
  it('preserves orientation', () => {
    const ccw = square(0, 0, 4)
    const cw = [...ccw].reverse()
    expect(signedArea(resample(ccw, 48))).toBeGreaterThan(0)
    expect(signedArea(resample(cw, 48))).toBeLessThan(0)
  })
  it('keeps points on the original outline and spaced evenly', () => {
    const r = resample(square(0, 0, 4), 16)
    for (const [x, y] of r) expect(Math.min(x, 4 - x, y, 4 - y)).toBeCloseTo(0, 9)
    expect(r[1]![0] - r[0]![0]).toBeCloseTo(1, 9)
  })
})

const fc = (rings: Record<number, Position[][]>): GeoCollection<{ district_id: number }> => ({
  type: 'FeatureCollection',
  features: Object.entries(rings).map(([id, polys]) => ({
    type: 'Feature',
    properties: { district_id: Number(id) },
    geometry: { type: 'MultiPolygon', coordinates: polys.map((r) => [r]) },
  })),
})

describe('buildMorphShapes', () => {
  // Seat 1: a mainland square plus a small island off the east side. Hex sits to the west.
  const districts = fc({ 1: [square(144, -38, 1), square(145.5, -37.8, 0.1)], 2: [square(146, -38, 1)] })
  const hexes = fc({ 1: [hexRing(143, -37.5, 0.4)], 2: [hexRing(144, -37.5, 0.4)] })
  const shapes = buildMorphShapes(districts, hexes, 48)

  it('pairs by district_id, N points each, skipping seats with no hex', () => {
    expect(shapes.map((s) => s.id)).toEqual([1, 2])
    for (const s of shapes) {
      expect(s.geo).toHaveLength(48)
      expect(s.hex).toHaveLength(48)
    }
    const only = buildMorphShapes(districts, fc({ 2: [hexRing(144, -37.5, 0.4)] }), 48)
    expect(only.map((s) => s.id)).toEqual([2])
  })
  it('winds geo and hex the same way even when the hex is wound the other way', () => {
    const cw = fc({ 1: [[...hexRing(143, -37.5, 0.4)].reverse()], 2: [hexRing(144, -37.5, 0.4)] })
    for (const s of buildMorphShapes(districts, cw, 48)) {
      expect(Math.sign(signedArea(s.geo))).toBe(Math.sign(signedArea(s.hex)))
    }
  })
  it('at e=0 and e=1 the morphed ring equals source and target', () => {
    const s = shapes[0]!
    expect(lerpRing(s.geo, s.hex, 0)).toEqual(s.geo)
    expect(lerpRing(s.geo, s.hex, 1)).toEqual(s.hex)
    const mid = lerpRing(s.geo, s.hex, 0.5)
    expect(mid[3]![0]).toBeCloseTo((s.geo[3]![0] + s.hex[3]![0]) / 2, 6)
  })
  it('turns extra outer rings into islands that collapse to zero area on the hex edge', () => {
    expect(shapes[0]!.islands).toHaveLength(1)
    expect(shapes[1]!.islands).toHaveLength(0)
    const isl = shapes[0]!.islands[0]!
    const start = Math.abs(signedArea(islandRingAt(isl, 0)))
    expect(start).toBeGreaterThan(0)
    expect(Math.abs(signedArea(islandRingAt(isl, 1)))).toBeCloseTo(0, 6)
    expect(Math.abs(signedArea(islandRingAt(isl, 0.5)))).toBeLessThan(start)
    // The target is on the hex outline (it is the nearest point on it).
    const hexOpen = open(shapes[0]!.hex)
    const onEdge = nearestOnRing(hexOpen, isl.target)
    expect(Math.hypot(onEdge[0] - isl.target[0], onEdge[1] - isl.target[1])).toBeLessThan(1)
    expect(islandAlpha(0)).toBe(1)
    expect(islandAlpha(0.6)).toBe(0)
    expect(islandAlpha(1)).toBe(0)
  })
  it('chip rings pair with the hex by index and have N points', () => {
    const s = shapes[0]!
    const chip = chipRingFor(s.hex, s.hexCentre, 48)
    expect(chip).toHaveLength(48)
    expect(Math.sign(signedArea(chip))).toBe(Math.sign(signedArea(s.hex)))
    for (const [x, y] of chip) expect(Math.max(Math.abs(x), Math.abs(y))).toBeCloseTo(0.5, 6)
  })
})
