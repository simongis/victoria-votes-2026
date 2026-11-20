/**
 * VE-221 (B14): which seat is the reader in? Only ever called from the "Use my location" button's click handler (never on
 * load), and the point is matched on the device against the district shapes the app has already loaded. Nothing is sent
 * or stored. A refusal, a failure or a point outside Victoria gives a reason, so the seat picker simply stays as it was.
 */
import type { GeoCollection, Geometry, Position } from '../../../data/types'

type Ring = Position[]

/** Ray casting: is the point inside this one ring (edges count as inside only by chance, which is fine for a GPS fix). */
function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!
    const [xj, yj] = ring[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

/** A polygon is its outer ring minus its holes (GeoJSON order: first ring outer, the rest holes). */
const inPolygon = (x: number, y: number, rings: Ring[]): boolean => rings.length > 0 && inRing(x, y, rings[0]!) && !rings.slice(1).some((h) => inRing(x, y, h))

function inGeometry(x: number, y: number, g: Geometry): boolean {
  return g.type === 'Polygon' ? inPolygon(x, y, g.coordinates) : g.coordinates.some((p) => inPolygon(x, y, p))
}

/** The district id whose shape holds the point (longitude, latitude in degrees), or null outside every seat. */
export function seatAtPoint(districts: GeoCollection<{ district_id: number }>, lon: number, lat: number): number | null {
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
  for (const f of districts.features) {
    if (f.geometry && inGeometry(lon, lat, f.geometry)) return f.properties.district_id
  }
  return null
}

/** The slice of `navigator.geolocation` this needs, so a test can stand in for the device. */
export interface GeoLike {
  getCurrentPosition: (ok: (p: { coords: { longitude: number; latitude: number } }) => void, fail?: (e: { code: number }) => void, opts?: { timeout?: number; maximumAge?: number }) => void
}

export type Located = { ok: true; id: number } | { ok: false; reason: 'denied' | 'unavailable' | 'outside' | 'unsupported' }

/** One fix from the device, matched to a seat. `geo` is `navigator.geolocation`; left undefined where the browser has none. */
export function locateSeat(districts: GeoCollection<{ district_id: number }>, geo: GeoLike | undefined): Promise<Located> {
  return new Promise((resolve) => {
    if (!geo) return resolve({ ok: false, reason: 'unsupported' })
    geo.getCurrentPosition(
      (p) => {
        const id = seatAtPoint(districts, p.coords.longitude, p.coords.latitude)
        resolve(id === null ? { ok: false, reason: 'outside' } : { ok: true, id })
      },
      // Code 1 is "permission denied"; 2 (cannot tell) and 3 (timed out) both mean the picker is the way.
      (e) => resolve({ ok: false, reason: e.code === 1 ? 'denied' : 'unavailable' }),
      // A rough fix is enough to name a seat, and a cached one saves asking the device to wake its radio.
      { timeout: 10_000, maximumAge: 300_000 },
    )
  })
}
