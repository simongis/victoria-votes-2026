import type { GeoCollection, Geometry, Position } from '../data/types'

/**
 * Shape morph core for the Map to Seats transition (ported from prototypes/shared/morph.ts, VE-47a). Pure
 * geometry, no map or DOM. Inputs are WGS 84 collections; they are projected to Web Mercator metres here so a
 * straight lerp between a district and its hex matches the way the hexes were built (regular in Web Mercator).
 *
 * Per seat: the largest outer ring of each shape is resampled to N points spaced by arc length, wound the same
 * way, and the hex start is rotated to the offset that moves the vertices least. Each extra outer ring
 * (islands: Bass, Hastings) collapses toward the nearest point on the hex edge while fading by 60% of the
 * morph, so nothing pops in or out and the island reads as being absorbed into its seat.
 */

export interface Island {
  /** Open ring, ISLAND_N points. */
  ring: Position[]
  /** Where it collapses to: the point on the hex edge nearest the island's own centroid. */
  target: Position
}

export interface MorphShape {
  id: number
  /** Open ring, N points: the main body in real geography. */
  geo: Position[]
  /** Open ring, N points: the hex, rotated to pair with geo. */
  hex: Position[]
  islands: Island[]
  /** Mean of the hex vertices. */
  hexCentre: Position
}

export const ISLAND_N = 24
export const DEFAULT_N = 96

const MERC = 6378137
export const merc = ([lon, lat]: Position): Position => [
  (lon * Math.PI * MERC) / 180,
  MERC * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
]

export const open = (r: Position[]): Position[] => {
  const a = r[0]
  const b = r[r.length - 1]
  return a && b && r.length > 1 && a[0] === b[0] && a[1] === b[1] ? r.slice(0, -1) : r
}

export const signedArea = (r: Position[]): number => {
  let s = 0
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!
    const q = r[(i + 1) % r.length]!
    s += p[0] * q[1] - q[0] * p[1]
  }
  return s / 2
}

/** N points equally spaced along the ring's perimeter, starting at vertex 0. Orientation is preserved. */
export function resample(ringIn: Position[], n: number): Position[] {
  const ring = open(ringIn)
  const len: number[] = [0]
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!
    const q = ring[(i + 1) % ring.length]!
    len.push(len[i]! + Math.hypot(q[0] - p[0], q[1] - p[1]))
  }
  const total = len[ring.length]!
  const out: Position[] = []
  let seg = 0
  for (let k = 0; k < n; k++) {
    const d = (k / n) * total
    while (seg < ring.length - 1 && len[seg + 1]! < d) seg++
    const p = ring[seg]!
    const q = ring[(seg + 1) % ring.length]!
    const span = len[seg + 1]! - len[seg]! || 1
    const f = (d - len[seg]!) / span
    out.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f])
  }
  return out
}

export const mean = (r: Position[]): Position => {
  let x = 0
  let y = 0
  for (const p of r) {
    x += p[0]
    y += p[1]
  }
  return [x / r.length, y / r.length]
}

/** Rotate b's start so that the sum of squared distances to a is least. */
export function bestShift(a: Position[], b: Position[]): Position[] {
  const n = a.length
  let bestK = 0
  let bestC = Infinity
  for (let k = 0; k < n; k++) {
    let c = 0
    for (let i = 0; i < n; i++) {
      const p = a[i]!
      const q = b[(i + k) % n]!
      c += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2
    }
    if (c < bestC) {
      bestC = c
      bestK = k
    }
  }
  return b.map((_, i) => b[(i + bestK) % n]!)
}

/** Outer rings (first ring of each polygon), largest area first. */
export function outerRings(g: Geometry): Position[][] {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
  return polys
    .map((p) => p[0]!)
    .filter((r) => r.length >= 3)
    .sort((a, b) => Math.abs(signedArea(open(b))) - Math.abs(signedArea(open(a))))
}

export function nearestOnRing(ring: Position[], p: Position): Position {
  let best: Position = ring[0]!
  let bestD = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!
    const b = ring[(i + 1) % ring.length]!
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)))
    const q: Position = [a[0] + dx * t, a[1] + dy * t]
    const d = (q[0] - p[0]) ** 2 + (q[1] - p[1]) ** 2
    if (d < bestD) {
      bestD = d
      best = q
    }
  }
  return best
}

/**
 * Pairs every district with its hex, once per geometry load. Districts with no hex or no geometry are skipped
 * (they simply do not animate; the caller's real views still show them).
 */
export function buildMorphShapes(
  districts: GeoCollection<{ district_id: number }>,
  hexes: GeoCollection<{ district_id: number }>,
  n: number = DEFAULT_N,
): MorphShape[] {
  const proj = (r: Position[]): Position[] => r.map(merc)
  const hexById = new Map<number, Geometry>()
  for (const f of hexes.features) if (f.geometry) hexById.set(f.properties.district_id, f.geometry)
  const out: MorphShape[] = []
  for (const f of districts.features) {
    const hx = hexById.get(f.properties.district_id)
    if (!f.geometry || !hx) continue
    const g = outerRings(f.geometry).map(proj)
    const h = outerRings(hx).map(proj)
    if (!g[0] || !h[0]) continue
    const geo = resample(g[0], n)
    let hex = resample(h[0], n)
    // Same winding, or the shape turns inside out part-way.
    if (Math.sign(signedArea(geo)) !== Math.sign(signedArea(hex))) hex = [...hex].reverse()
    hex = bestShift(geo, hex)
    const hexOpen = open(h[0])
    out.push({
      id: f.properties.district_id,
      geo,
      hex,
      islands: g.slice(1).map((r) => ({
        ring: resample(r, ISLAND_N),
        target: nearestOnRing(hexOpen, mean(open(r))),
      })),
      hexCentre: mean(hexOpen),
    })
  }
  return out
}

/** Unit square ring (-0.5..0.5), n points, wound and started to pair with a hex ring with least travel. */
export function chipRingFor(hexRing: Position[], hexCentre: Position, n: number): Position[] {
  // Scale-free: normalise the hex by its largest extent, so the pairing does not depend on zoom.
  let m = 0
  for (const p of hexRing) m = Math.max(m, Math.abs(p[0] - hexCentre[0]), Math.abs(p[1] - hexCentre[1]))
  m = m || 1
  const rel = hexRing.map((p): Position => [(p[0] - hexCentre[0]) / (2 * m), (p[1] - hexCentre[1]) / (2 * m)])
  const sq = resample(
    [
      [-0.5, -0.5],
      [0.5, -0.5],
      [0.5, 0.5],
      [-0.5, 0.5],
    ],
    n,
  )
  const s = Math.sign(signedArea(sq)) !== Math.sign(signedArea(rel)) ? [...sq].reverse() : sq
  return bestShift(rel, s)
}

/** Point-by-point lerp of two equal-length rings. e=0 is exactly a, e=1 exactly b. */
export function lerpRing(a: Position[], b: Position[], e: number): Position[] {
  if (e <= 0) return a.map((p): Position => [p[0], p[1]])
  if (e >= 1) return b.map((p): Position => [p[0], p[1]])
  return a.map((p, i): Position => [p[0] + (b[i]![0] - p[0]) * e, p[1] + (b[i]![1] - p[1]) * e])
}

/** An island at morph progress e: its ring pulled toward its target; a single point (zero area) at e=1. */
export function islandRingAt(isl: Island, e: number): Position[] {
  const t = isl.target
  return lerpRing(
    isl.ring,
    isl.ring.map((): Position => [t[0], t[1]]),
    e,
  )
}

export function smoothstep(a: number, b: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Island opacity: fades out over the first 60% of the morph. */
export const islandAlpha = (e: number): number => 1 - smoothstep(0, 0.6, e)
