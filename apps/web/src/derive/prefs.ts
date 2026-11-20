/**
 * The Preferences lens (VE-99): each seat's first-preference leader and share, grouped by region, and a simple
 * deterministic dot packing. A leader under 50% has not won on first preferences, so preferences decide the seat.
 */
import type { DistrictStatic, PartyBucket } from '@vic26/schema'
import type { Seat } from './seats'

export const OUTRIGHT_PCT = 50
/** The shared x range of every row. The replay's largest leader share is 83.9% (one tiny booth at 6:30 pm); 74% once 1,000 votes are in. */
export const X_LO = 20
export const X_HI = 85

export interface PrefsPoint {
  id: number
  name: string
  region: string
  party: PartyBucket
  pct: number
  /** Under 50%: nobody has won outright, so preferences decide. */
  decided: boolean
}

export interface PrefsResult {
  points: PrefsPoint[]
  /** Seats with no first-preference figures yet. */
  missing: number
  /** Seats left of the 50% line. */
  decidedCount: number
}

/**
 * Seat.fp is sorted largest first, so the first entry is the first-preference leader. Its pct is already a share of
 * formal votes (the sum of the party votes), as ingest's lead_fp_pct is.
 */
export function prefsPoints(seats: ReadonlyMap<number, Seat>, statics: ReadonlyMap<number, DistrictStatic>): PrefsResult {
  const points: PrefsPoint[] = []
  let missing = 0
  for (const s of seats.values()) {
    const lead = s.fp[0]
    if (!lead) {
      missing++
      continue
    }
    points.push({ id: s.id, name: s.name, region: statics.get(s.id)?.region_name ?? 'Other', party: lead.party, pct: lead.pct, decided: lead.pct < OUTRIGHT_PCT })
  }
  return { points, missing, decidedCount: points.filter((p) => p.decided).length }
}

const isMelbourne = (region: string) => region.includes('Metropolitan')
export const shortRegion = (region: string) => region.replace(/ Region$/, '')

export interface RegionRow {
  region: string
  points: PrefsPoint[]
}

/** Melbourne regions first, then the country, each alphabetical. */
export function regionRows(points: readonly PrefsPoint[]): RegionRow[] {
  const by = new Map<string, PrefsPoint[]>()
  for (const p of points) by.set(p.region, [...(by.get(p.region) ?? []), p])
  return [...by.entries()]
    .sort(([a], [b]) => Number(isMelbourne(b)) - Number(isMelbourne(a)) || a.localeCompare(b))
    .map(([region, pts]) => ({ region, points: pts }))
}

/** Share to pixel x within a plot of this width, clamped to the range. */
export function xFor(pct: number, width: number, padL: number, padR: number): number {
  const t = (Math.min(Math.max(pct, X_LO), X_HI) - X_LO) / (X_HI - X_LO)
  return padL + t * (width - padL - padR)
}

/**
 * Vertical offsets that keep dots from overlapping: dots go in order of x (then id, so the result never depends on
 * input order), each takes the smallest offset from the row's line that clears every dot already placed.
 */
export function packRow(items: readonly { id: number; x: number }[], r: number, gap = 1): Map<number, number> {
  const placed: { x: number; y: number }[] = []
  const out = new Map<number, number>()
  const min2 = (2 * r + gap) ** 2
  const step = r * 0.35
  for (const it of [...items].sort((a, b) => a.x - b.x || a.id - b.id)) {
    for (let k = 0; k < 2000; k++) {
      const y = k === 0 ? 0 : step * Math.ceil(k / 2) * (k % 2 ? 1 : -1)
      if (placed.every((p) => (p.x - it.x) ** 2 + (p.y - y) ** 2 >= min2)) {
        placed.push({ x: it.x, y })
        out.set(it.id, y)
        break
      }
    }
  }
  return out
}
