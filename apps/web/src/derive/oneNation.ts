import type { OneNationAsset, PartySharesSeat, ShareParty } from '@vic26/schema'
import type { PartyBucket } from '@vic26/schema'
import type { Rgb } from '../theme/theme'

/** Pure helpers for the party-strength lens (VE-101, VE-101e): validation, the party toggle, colour ramps, bands, keys. */

export const EXPECTED_SEATS = 88

const isPct = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100)
const isNum = (v: unknown): boolean => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)
const PCT_FIELDS = ['on_2022_pct', 'on_2025_pct', 'pct_year12', 'pct_trades_labour', 'pct_trade_cert', 'pct_unemployed', 'pct_own_home', 'pct_detached_house'] as const
const FLAG_FIELDS = ['on_2022_low', 'on_2025_low', 'on_2022_partial', 'on_2025_partial'] as const
/** Every party the file carries; the toggle offers five of them. */
export const SHARE_KEYS: readonly ShareParty[] = ['ALP', 'COA', 'LIB', 'NAT', 'GRN', 'ONP', 'IND', 'OTH']

function validPartyShares(raw: unknown, ids: ReadonlySet<number>): raw is PartySharesSeat[] {
  if (!Array.isArray(raw) || raw.length !== EXPECTED_SEATS) return false
  const seen = new Set<number>()
  for (const row of raw as unknown[]) {
    if (typeof row !== 'object' || row === null) return false
    const r = row as Record<string, unknown>
    const id = r.district_id
    if (typeof id !== 'number' || !ids.has(id) || seen.has(id)) return false
    seen.add(id)
    const share = r.share_2025 as Record<string, unknown> | null
    const stood = r.stood_2025 as Record<string, unknown> | null
    if (typeof share !== 'object' || share === null || typeof stood !== 'object' || stood === null) return false
    // Shares are real per cents for every party; "stood" is a fraction where given.
    if (!SHARE_KEYS.every((k) => typeof share[k] === 'number' && Number.isFinite(share[k]) && (share[k] as number) >= 0 && (share[k] as number) <= 100)) return false
    if (!Object.values(stood).every((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1)) return false
    if (typeof r.low_votes !== 'boolean') return false
  }
  return true
}

/**
 * Hold last good (rule 5): the asset is used only if it has exactly 88 rows, each id is a district the statics know,
 * no id repeats and every figure has the right type and a sane range, for both the Census rows and the party shares.
 * Anything else returns null and the lens shows one plain line and no marks.
 */
export function validateAsset(raw: unknown, ids: ReadonlySet<number>): OneNationAsset | null {
  if (typeof raw !== 'object' || raw === null) return null
  const a = raw as { source?: unknown; districts?: unknown; party_shares?: unknown }
  if (typeof a.source !== 'string' || !Array.isArray(a.districts) || a.districts.length !== EXPECTED_SEATS) return null
  if (!validPartyShares(a.party_shares, ids)) return null
  const seen = new Set<number>()
  for (const row of a.districts as unknown[]) {
    if (typeof row !== 'object' || row === null) return null
    const r = row as Record<string, unknown>
    const id = r.district_id
    if (typeof id !== 'number' || !ids.has(id) || seen.has(id)) return null
    seen.add(id)
    if (!PCT_FIELDS.every((k) => isPct(r[k])) || !isNum(r.people_per_km2)) return null
    if (!FLAG_FIELDS.every((k) => typeof r[k] === 'boolean')) return null
  }
  return raw as OneNationAsset
}

// ---------- the party toggle ----------
/**
 * A choice on the toggle: an asset party, or Victorian Socialists (VE-320). They sit in our Others bucket, so the app builds
 * their figure from the candidates layer instead; the schema's ShareParty (the asset's keys) is unchanged.
 */
export type LensParty = ShareParty | 'VS'
export interface PartyOption {
  id: LensParty
  /** Plain name, the same grammar for every party. */
  label: string
  /** The button's words where the name is long. */
  short?: string
  /** Whose colour the ramp wears (the Coalition wears the Liberal blue). */
  bucket: PartyBucket
  /** Its own colour where the bucket's would mislead (Victorian Socialists are not the grey of Others). */
  rgb?: Rgb
}
/**
 * VE-320: no party colour of ours fits Victorian Socialists, and their own red would read as Labor, so a plum (#8e2c78):
 * apart from every other party hue on the map, and dark enough to read against the pale paper and the "did not stand" hatching.
 */
export const VS_RGB: Rgb = [142, 44, 120]
/** The toggle, in the order it is drawn. One Nation is where the lens opens (FB-162). */
export const PARTY_OPTIONS: readonly PartyOption[] = [
  { id: 'ALP', label: 'Labor', bucket: 'ALP' },
  { id: 'COA', label: 'Coalition', bucket: 'LIB' },
  { id: 'GRN', label: 'Greens', bucket: 'GRN' },
  { id: 'ONP', label: 'One Nation', bucket: 'ONP' },
  { id: 'IND', label: 'Independents', bucket: 'IND' },
  { id: 'VS', label: 'Victorian Socialists', short: 'Vic Socialists', bucket: 'OTH', rgb: VS_RGB },
]
export const DEFAULT_PARTY: LensParty = 'ONP'
export const partyLabel = (p: LensParty): string => PARTY_OPTIONS.find((o) => o.id === p)?.label ?? p
/** The colour a choice's ramp is built on. */
export const partyBase = (o: PartyOption, pal: { party: Record<PartyBucket, Rgb> }): Rgb => o.rgb ?? pal.party[o.bucket]

/** Below this fraction of the seat's area, a party "stood in part of the seat" and the share is only partly comparable. */
export const PARTIAL_BELOW = 0.95
/** One seat's coverage for a party: 'full', 'partial' or 'none' (the party did not stand in any of the seat's area). */
export function coverage(stood: number | undefined): 'full' | 'partial' | 'none' {
  if (stood === undefined) return 'full' // the file lists only parties with a gap; absent means it stood throughout
  if (stood <= 0) return 'none'
  return stood < PARTIAL_BELOW ? 'partial' : 'full'
}

// ---------- colour ----------
export const SHARE_MAX = 16
const SHARE_PALE: Rgb = [253, 241, 221]
const DEEP: Rgb = [122, 54, 0]
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => Math.round(a[i]! + (b[i]! - a[i]!) * t)) as Rgb
const clamp01 = (t: number) => Math.max(0, Math.min(1, t))

/** Sequential: pale, One Nation's own orange at the middle, deep brown at the top. `onp` is the party colour from the theme. */
export function shareRgb(pct: number, onp: Rgb): Rgb {
  const t = clamp01(pct / SHARE_MAX)
  return t < 0.5 ? mix(SHARE_PALE, onp, t / 0.5) : mix(onp, DEEP, (t - 0.5) / 0.5)
}

/**
 * The same ramp logic for every party: a pale tint of the party's colour at 0, the colour itself halfway up the party's
 * own scale and a darkened version of it at the top. Only the colour and the top of the scale (`max`) change per party.
 */
export function partyRgb(pct: number, base: Rgb, max: number): Rgb {
  const pale = mix([252, 251, 247], base, 0.14)
  const deep = mix(base, [18, 18, 24], 0.55)
  const t = clamp01(pct / max)
  return t < 0.5 ? mix(pale, base, t / 0.5) : mix(base, deep, (t - 0.5) / 0.5)
}

/**
 * The top of a party's scale: its highest seat share rounded up to a tidy step (2 points up to 20, then 5), never under 6.
 * The same rule for every party, so each ramp is read against that party's own range.
 */
export function rampMax(values: readonly number[]): number {
  const top = Math.max(0, ...values.filter((v) => Number.isFinite(v)))
  const step = top <= 20 ? 2 : 5
  return Math.max(6, Math.ceil(top / step) * step)
}

/** The ramps as a CSS gradient for the key, drawn with the same functions as the marks. */
export function rampCss(fn: (v: number) => Rgb, from: number, to: number, steps = 8): string {
  const stops = Array.from({ length: steps + 1 }, (_, i) => {
    const [r, g, b] = fn(from + ((to - from) * i) / steps)
    return `rgb(${r}, ${g}, ${b})`
  })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}

// ---------- seats in fifths ----------
export interface BandInput {
  id: number
  /** The measure for the seat (Year 12 %, trade jobs % or people per km2). */
  x: number
  /** The chosen party's share in the seat. */
  share: number
}
export interface Band {
  /** 0 is the top fifth of seats for the measure, 4 the bottom fifth. */
  index: number
  ids: number[]
  /** The measure's range within the band. */
  lo: number
  hi: number
  /** The party's average share across the band's seats. */
  mean: number
}
/** Plain names for the five bands, top first. */
export const BAND_NAMES = ['Top fifth', 'Second fifth', 'Middle fifth', 'Fourth fifth', 'Bottom fifth'] as const

/**
 * Seats ranked by the measure, highest first, cut into five bands of 17 or 18 seats (ties break by id so the cut is stable).
 * Each band carries the party's average share. It describes seats, not the people in them.
 */
export function quintileBands(rows: readonly BandInput[]): Band[] {
  const sorted = [...rows].sort((a, b) => b.x - a.x || a.id - b.id)
  const n = sorted.length
  return Array.from({ length: 5 }, (_, index) => {
    const part = sorted.slice(Math.floor((index * n) / 5), Math.floor(((index + 1) * n) / 5))
    const xs = part.map((r) => r.x)
    return {
      index,
      ids: part.map((r) => r.id),
      lo: part.length ? Math.min(...xs) : 0,
      hi: part.length ? Math.max(...xs) : 0,
      mean: part.length ? part.reduce((s, r) => s + r.share, 0) / part.length : 0,
    }
  })
}

/**
 * Dot offsets for a row of points that would overlap: each point, left to right, takes the smallest sideways step (0, then
 * 1 up, 1 down, 2 up ...) that clears the points already placed, measured in whole dot spans. Returns steps in input order.
 */
export function swarm(xs: readonly number[], span: number): number[] {
  const order = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const placed: { x: number; k: number }[] = []
  const out = new Array<number>(xs.length).fill(0)
  for (const [x, i] of order) {
    let k = 0
    for (let tries = 0; tries < 200; tries++) {
      const cand = k
      if (!placed.some((p) => Math.abs(p.x - x) < span && Math.abs(p.k - cand) < 1)) break
      k = k <= 0 ? 1 - k : -k // 0, 1, -1, 2, -2 ...
    }
    placed.push({ x, k })
    out[i] = k
  }
  return out
}

// ---------- keyboard ----------
/**
 * Arrow-key movement between marks: from `from`, the nearest mark that lies in the pressed direction (dx or dy is +1 or -1).
 * "In the direction" means more along that axis than across it, so Right from a hex goes to the next hex on its row.
 */
export function stepFocus(points: readonly { id: number; x: number; y: number }[], from: number, dx: number, dy: number): number {
  const me = points.find((p) => p.id === from)
  if (!me) return from
  let best = from
  let bestScore = Infinity
  for (const p of points) {
    if (p.id === from) continue
    const along = (p.x - me.x) * dx + (p.y - me.y) * dy
    const across = Math.abs((p.x - me.x) * dy) + Math.abs((p.y - me.y) * dx)
    if (along <= 0 || across > along * 2) continue
    const score = along + across * 2
    if (score < bestScore) {
      bestScore = score
      best = p.id
    }
  }
  return best
}
