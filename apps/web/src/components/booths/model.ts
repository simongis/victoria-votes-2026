/**
 * Polling places (VE-77c): what a booth dot means, kept pure so it can be tested without a browser.
 *
 * A dot is one election-day polling place. Its colour is the party with the most first preferences there, its area is
 * the formal votes counted there, and it stays faint until the booth has reported. Early voting centres are parsed apart
 * (`evc`) so 2026's centres can later be drawn as ringed dots; the 2022 replay has none (no results by centre).
 */
import { PARTY_BUCKETS, type PartyBucket } from '@vic26/schema'
import { vicgrid } from '../map/vicgrid'
import { focusParties, DOUBT, type Focus } from '../../derive/focus'

export type BoothFp = Record<PartyBucket, number>

/** The same place at the previous election, as the booths layer carries it (VE-208). */
export interface BoothBase {
  match: 'id' | 'name_location' | 'none'
  a: PartyBucket | null
  b: PartyBucket | null
  /** Party A's share of the final two there, 0 to 100. */
  pctA: number | null
}

export interface BoothStatic {
  id: number
  name: string
  districtId: number
  /** The previous election's result at this place, for the panel's swing. Absent when the source gave none. */
  base?: BoothBase
  /** VicGrid metres, the same grid as the map's outlines. */
  e: number
  n: number
}

/** One row of a booth's history: its first preferences as at a snapshot time (epoch ms). */
export interface BoothRow {
  at: number
  fp: BoothFp
  /** All ballots counted here, informal included (the layer's fp_total). Only the booth panel reads it. */
  total?: number | null
  /** The final two as the layer states them: party A and A's share. B is the seat's other side (the layer has no column for it). */
  tcpA?: PartyBucket | null
  tcpPctA?: number | null
}

export type BoothSummary = { state: 'waiting' } | { state: 'counted'; leader: PartyBucket; formal: number; share: number }

const zero = (): BoothFp => ({ ALP: 0, LIB: 0, NAT: 0, GRN: 0, ONP: 0, IND: 0, OTH: 0 })

/** Formal votes: the sum of the party columns. The feed's own total also holds informal votes, so it is not used for size. */
export const formalOf = (fp: BoothFp): number => PARTY_BUCKETS.reduce((a, p) => a + fp[p], 0)

/** The party with the most first preferences, or null before any votes. A tie goes to the earlier party in the fixed order so a dot never flickers. */
export function leaderOf(fp: BoothFp): PartyBucket | null {
  let best: PartyBucket | null = null
  for (const p of PARTY_BUCKETS) if (fp[p] > 0 && (best === null || fp[p] > fp[best])) best = p
  return best
}

/**
 * Dot radius in pixels at the whole-state zoom. Area, not radius, follows votes, but only between the floor's area and
 * the biggest dot's area (VE-153: a modest range, so big booths do not swamp small ones). With a floor of 0 the area is
 * simply proportional to votes.
 */
export function dotRadius(votes: number, maxVotes: number, rMax: number, floor: number): number {
  if (maxVotes <= 0 || votes <= 0) return floor
  const t = Math.min(1, votes / maxVotes)
  return Math.sqrt(floor * floor + (rMax * rMax - floor * floor) * t)
}

const ZOOM_GAIN = 0.4
const ZOOM_CAP = 3.5
/**
 * Dots grow gently as the map zooms in (they are placed in screen pixels, not scaled with the map): a quarter of the
 * metres per pixel gives about 1.7 times the size. Never smaller than at the whole-state fit, and capped.
 */
export function zoomScale(fitRes: number, res: number): number {
  if (!(res > 0) || !(fitRes > 0)) return 1
  return Math.min(ZOOM_CAP, Math.max(1, (fitRes / res) ** ZOOM_GAIN))
}

/** The booth's state at a time: the latest history row at or before it. Rows are sorted oldest first. */
export function boothAt(rows: readonly BoothRow[] | undefined, at: number): BoothRow | null {
  if (!rows || rows.length === 0 || rows[0]!.at > at) return null
  let lo = 0
  let hi = rows.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (rows[mid]!.at <= at) lo = mid
    else hi = mid - 1
  }
  return rows[lo]!
}

export function boothSummary(row: BoothRow | null): BoothSummary {
  if (!row) return { state: 'waiting' }
  const leader = leaderOf(row.fp)
  const formal = formalOf(row.fp)
  if (leader === null || formal <= 0) return { state: 'waiting' }
  return { state: 'counted', leader, formal, share: Math.round((100 * row.fp[leader]) / formal) }
}

/**
 * The tally pick, applied to a booth: lit when its leader is one of the picked parties. A booth has no firm or likely
 * state, so a strong or pale part counts the party only. The in-doubt pick follows the booth's seat. A booth with no
 * figures yet is never lit by a pick.
 */
export function boothInFocus(focus: Focus | null, leader: PartyBucket | null, seat: { close?: boolean } | undefined): boolean {
  if (focus === null) return true
  // VE-226 (finding 7): close seats only, as the band's "N close" counts them.
  if (focus === DOUBT) return seat?.close === true
  return leader !== null && focusParties(focus).includes(leader)
}

// ---- parsing the replay's files (the shapes ingest writes: static/booths.geojson, history/booth_history.columns.json) ----

interface Feature {
  properties?: { booth_id?: number; booth_name?: string; district_id?: number; booth_type?: string; base_match?: string; base_tcp_party_a?: string | null; base_tcp_party_b?: string | null; base_tcp_pct_a?: number | null }
  geometry?: { type?: string; coordinates?: number[] } | null
}

/** Victoria's bounding box in degrees, with a margin: a booth outside it is a bad location, not a far-flung booth. */
const LNG = [140.5, 150.5] as const
const LAT = [-39.6, -33.5] as const

export interface ParsedStatics {
  booths: BoothStatic[]
  /** Early voting centres: parsed but not drawn on the 2022 replay (no results by centre). The hook for 2026. */
  evc: BoothStatic[]
  /** Features dropped for a missing or implausible location, so every feature is accounted for. */
  skipped: number
}

export function parseBoothStatics(gj: { features: Feature[] }): ParsedStatics {
  const booths: BoothStatic[] = []
  const evc: BoothStatic[] = []
  let skipped = 0
  for (const f of gj.features) {
    const p = f.properties
    const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : undefined
    const [lng, lat] = c ?? []
    if (!p || typeof p.booth_id !== 'number' || typeof p.district_id !== 'number' || lng === undefined || lat === undefined || !(lng >= LNG[0] && lng <= LNG[1] && lat >= LAT[0] && lat <= LAT[1])) {
      skipped++
      continue
    }
    const [e, n] = vicgrid(lng, lat)
    const b: BoothStatic = { id: p.booth_id, name: p.booth_name ?? `Polling place ${p.booth_id}`, districtId: p.district_id, e, n }
    const base = baseOf(p)
    if (base) b.base = base
    if (p.booth_type === 'election_day') booths.push(b)
    else if (p.booth_type === 'evc') evc.push(b)
    else skipped++
  }
  return { booths, evc, skipped }
}

const party = (v: unknown): PartyBucket | null => ((PARTY_BUCKETS as readonly string[]).includes(v as string) ? (v as PartyBucket) : null)

function baseOf(p: NonNullable<Feature['properties']>): BoothBase | null {
  if (p.base_match !== 'id' && p.base_match !== 'name_location' && p.base_match !== 'none') return null
  return { match: p.base_match, a: party(p.base_tcp_party_a), b: party(p.base_tcp_party_b), pctA: typeof p.base_tcp_pct_a === 'number' ? p.base_tcp_pct_a : null }
}

interface Columns {
  fields: string[]
  rows: unknown[][]
}

export interface ParsedHistory {
  byBooth: Map<number, BoothRow[]>
  /**
   * The scale for dot area through the night: the 95th percentile of the booths' peak formal votes (nearest rank), not the
   * biggest, so one huge booth does not squash every other dot to the floor (VE-153). Bigger booths are capped at the largest dot.
   */
  maxFormal: number
}

export function parseBoothHistory(cols: Columns): ParsedHistory {
  const at = cols.fields.indexOf('snapshot_at')
  const id = cols.fields.indexOf('booth_id')
  const idx = PARTY_BUCKETS.map((p) => cols.fields.indexOf(`fp_${p}`))
  const totalAt = cols.fields.indexOf('fp_total')
  const tcpAAt = cols.fields.indexOf('tcp_party_a')
  const tcpPctAt = cols.fields.indexOf('tcp_pct_a')
  const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v))
  const byBooth = new Map<number, BoothRow[]>()
  const peak = new Map<number, number>()
  for (const r of cols.rows) {
    const fp = zero()
    PARTY_BUCKETS.forEach((p, i) => {
      fp[p] = Number(r[idx[i]!]) || 0
    })
    const key = Number(r[id])
    peak.set(key, Math.max(peak.get(key) ?? 0, formalOf(fp)))
    const list = byBooth.get(Number(r[id]))
    const row: BoothRow = { at: Number(r[at]), fp }
    if (totalAt >= 0) row.total = numOrNull(r[totalAt])
    if (tcpAAt >= 0) row.tcpA = party(r[tcpAAt])
    if (tcpPctAt >= 0) row.tcpPctA = numOrNull(r[tcpPctAt])
    if (list) list.push(row)
    else byBooth.set(Number(r[id]), [row])
  }
  for (const list of byBooth.values()) list.sort((a, b) => a.at - b.at)
  const peaks = [...peak.values()].sort((a, b) => a - b)
  const maxFormal = peaks.length === 0 ? 0 : peaks[Math.ceil(0.95 * peaks.length) - 1]!
  return { byBooth, maxFormal }
}
