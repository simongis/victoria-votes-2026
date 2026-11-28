import { describe, expect, it } from 'vitest'
import { outsideOwnDistrict, pointInGeometry } from './pointInDistrict'
import type { GeoCollection, Geometry } from '../data/types'

const square: Geometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]] }
const donut: Geometry = { type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] }
const two: Geometry = { type: 'MultiPolygon', coordinates: [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], [[[5, 5], [6, 5], [6, 6], [5, 6], [5, 5]]]] }

describe('pointInGeometry', () => {
  it('knows inside from outside, holes and multipolygons', () => {
    expect(pointInGeometry(5, 5, square)).toBe(true)
    expect(pointInGeometry(11, 5, square)).toBe(false)
    expect(pointInGeometry(5, 5, donut)).toBe(false)
    expect(pointInGeometry(2, 2, donut)).toBe(true)
    expect(pointInGeometry(5.5, 5.5, two)).toBe(true)
    expect(pointInGeometry(3, 3, two)).toBe(false)
  })
})

describe('outsideOwnDistrict', () => {
  const districts: GeoCollection<{ district_id: number }> = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { district_id: 1 }, geometry: square },
      { type: 'Feature', properties: { district_id: 2 }, geometry: { type: 'Polygon', coordinates: [[[20, 0], [30, 0], [30, 10], [20, 10], [20, 0]]] } },
      { type: 'Feature', properties: { district_id: 3 }, geometry: null },
    ],
  }
  const p = (id: number, districtId: number, lng?: number, lat?: number) => ({ id, districtId, lng, lat })
  it('lists places whose point is outside the district they report for', () => {
    const out = outsideOwnDistrict([p(1, 1, 5, 5), p(2, 1, 25, 5), p(3, 2, 25, 5)], districts)
    expect([...out]).toEqual([2])
  })
  it('leaves out places it cannot judge: no coordinates, unknown district, or a district with no shape', () => {
    expect(outsideOwnDistrict([p(1, 1), p(2, 99, 5, 5), p(3, 3, 5, 5)], districts).size).toBe(0)
  })
})
