/**
 * Is a polling place inside the district it reports for (VE-301)? The VEC places some early voting centres outside the
 * district they serve, so the panel and hover say so rather than leave the viewer thinking the map is wrong. Pure
 * point-in-polygon on the district shapes the app already holds (WGS 84). Nothing is moved: this only reads.
 */
import type { GeoCollection, Geometry, Position } from '../data/types'

type Ring = Position[]

/** Ray casting. A point exactly on an edge may fall either way, which is fine for a polling place a few metres wide. */
function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** GeoJSON order: the first ring is the outer edge, the rest are holes. */
const inPolygon = (x: number, y: number, rings: Ring[]): boolean => rings.length > 0 && inRing(x, y, rings[0]!) && !rings.slice(1).some((h) => inRing(x, y, h))

export function pointInGeometry(lng: number, lat: number, g: Geometry): boolean {
  return g.type === 'Polygon' ? inPolygon(lng, lat, g.coordinates) : g.coordinates.some((p) => inPolygon(lng, lat, p))
}

export interface LocatedPlace {
  id: number
  districtId: number
  lng?: number
  lat?: number
}

/**
 * Ids of the places whose point lies outside their own district's shape. A place with no coordinates, or whose district
 * has no shape in the file, is left out: we cannot say, so we say nothing.
 */
export function outsideOwnDistrict(places: readonly LocatedPlace[], districts: GeoCollection<{ district_id: number }>): Set<number> {
  const shape = new Map<number, Geometry>()
  for (const f of districts.features) if (f.geometry) shape.set(f.properties.district_id, f.geometry)
  const out = new Set<number>()
  for (const p of places) {
    const g = shape.get(p.districtId)
    if (!g || p.lng === undefined || p.lat === undefined || !Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue
    if (!pointInGeometry(p.lng, p.lat, g)) out.add(p.id)
  }
  return out
}
