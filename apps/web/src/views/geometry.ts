/**
 * Geometry for both views addressed by district_id, in WGS 84 rings. A future transition layer (map to hex
 * morph) can pair a district's outline with its hex by id without either view knowing about it.
 */
import type { GeoCollection, Position } from '../data/types'

export type Rings = Position[][]

export function ringsById<P extends { district_id: number }>(col: GeoCollection<P>): Map<number, Rings> {
  const out = new Map<number, Rings>()
  for (const f of col.features) {
    if (!f.geometry) continue
    out.set(f.properties.district_id, f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat())
  }
  return out
}

/** Web Mercator y in degrees-equivalent: the seat hexes are regular in Web Mercator (width/height 0.866 there). */
export const mercY = (lat: number): number => (Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * 180) / Math.PI

/** Screen-space projection for SVG views (y down). */
export const projectSvg = ([lon, lat]: Position, scale = 100): [number, number] => [lon * scale, -mercY(lat) * scale]
