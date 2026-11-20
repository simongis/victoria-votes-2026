/**
 * VE-68 district profile: which handful of facts make this seat stand out from the other 87, and how to say them.
 * Pure, so it is tested alone. Inputs are the two static AGOL tables (district_demographics, district_change); the
 * field names are the schema's, nothing is invented.
 */

/** The district_change fields this module reads (a subset of the schema's layer 9). */
export interface ChangeRow {
  district_id: number
  pop_2021: number | null
  pop_2025: number | null
  pop_change_pct: number | null
  net_overseas_share: number | null
  median_age_2025: number | null
  approvals_per_1000: number | null
  income_median_2223_approx: number | null
  pct_rent_stress: number | null
  pct_mortgage_stress: number | null
  modelled: boolean
  method: string
  vintages: string
  erp_series: string
}

/** The district_demographics fields this module reads (a subset of the schema's layer 8). */
export interface DemoRow {
  district_id: number
  pct_born_overseas: number | null
  pct_renting: number | null
  pct_bachelor_plus: number | null
  seifa_irsad: number | null
  data_source: string
}

export type IconName = 'globe' | 'age' | 'income' | 'key' | 'house' | 'crane' | 'cap' | 'flag' | 'scale'

interface Measure {
  /** A field name in district_change or district_demographics. */
  key: string
  /** Plain words after "Top 5 for". */
  label: string
  icon: IconName
  /** Measures in one group tell the same story, so only the most extreme of a group is shown. */
  group: string
  /** Modelled or apportioned (not a straight count), so the figure carries a subtle mark. */
  approx: boolean
  format: (v: number) => string
}

const pct = (v: number) => `${v.toFixed(1)}%`
const int = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 0 })

/** The curated list. Population growth is the headline, so it is not repeated here. */
export const MEASURES: readonly Measure[] = [
  { key: 'net_overseas_share', label: 'overseas arrivals', icon: 'globe', group: 'diversity', approx: true, format: pct },
  { key: 'pct_born_overseas', label: 'people born overseas', icon: 'flag', group: 'diversity', approx: false, format: pct },
  { key: 'median_age_2025', label: 'median age', icon: 'age', group: 'age', approx: true, format: (v) => `${v.toFixed(1)} yrs` },
  { key: 'income_median_2223_approx', label: 'median income', icon: 'income', group: 'wealth', approx: true, format: (v) => `$${int.format(Math.round(v / 100) * 100)}` },
  { key: 'seifa_irsad', label: 'advantage (SEIFA)', icon: 'scale', group: 'wealth', approx: false, format: (v) => int.format(v) },
  { key: 'pct_bachelor_plus', label: 'degree holders', icon: 'cap', group: 'education', approx: false, format: pct },
  { key: 'pct_renting', label: 'renting households', icon: 'key', group: 'housing', approx: false, format: pct },
  { key: 'pct_rent_stress', label: 'rent stress', icon: 'key', group: 'housing', approx: true, format: pct },
  { key: 'pct_mortgage_stress', label: 'mortgage stress', icon: 'house', group: 'housing', approx: true, format: pct },
  { key: 'approvals_per_1000', label: 'new homes approved', icon: 'crane', group: 'building', approx: true, format: (v) => `${int.format(v)} per 1,000` },
]

export function formatFigure(key: string, v: number): string {
  const m = MEASURES.find((x) => x.key === key)
  return m ? m.format(v) : String(v)
}

/** 1 for the highest value; ties share the better rank. */
export function rankHigh(values: readonly number[], v: number): number {
  return 1 + values.filter((x) => x > v).length
}

/** 0..1 along a strip from min to max, clamped; a flat strip puts everything in the middle. */
export function stripPosition(v: number, min: number, max: number): number {
  if (max <= min) return 0.5
  return Math.min(1, Math.max(0, (v - min) / (max - min)))
}

/** erp_series and proj_series are JSON arrays held in a string field. */
export function parseSeries(s: string): number[] {
  try {
    const a: unknown = JSON.parse(s)
    return Array.isArray(a) ? a.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []
  } catch {
    return []
  }
}

export interface StandOutRow {
  key: string
  label: string
  icon: IconName
  figure: string
  approx: boolean
  side: 'top' | 'bottom'
  /** Rank from the end named by `side` (1 = highest for top, lowest for bottom). */
  n: number
  /** "Top 5" or "Bottom 3". */
  phrase: string
  /** 0..1 along the strip. */
  position: number
  median: number
  /** Every district's position, for the faint strip ticks. */
  ticks: number[]
  z: number
}

export interface Profile {
  headline: { changePct: number; pop2025: number | null; series: number[] } | null
  rows: StandOutRow[]
  modelled: boolean
  method: string
  vintages: Record<string, string>
  dataSource: string
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const h = s.length >> 1
  return s.length % 2 ? s[h]! : (s[h - 1]! + s[h]!) / 2
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** How many "stands out" rows to show. */
const SHOWN = 3
/** The sparkline covers the last 15 years of the 2001 to 2025 ERP series. */
const SPARK_YEARS = 15

/** Plain words for a rank among 88: an exact rank only near the ends, where it means something. */
export function rankPhrase(side: 'top' | 'bottom', n: number): string {
  const end = side === 'top' ? 'Top' : 'Bottom'
  if (n <= 10) return `${end} ${n}`
  if (n <= 22) return `${end} quarter`
  return side === 'top' ? 'Above middle' : 'Below middle'
}

export function buildProfile(
  districtId: number,
  changes: readonly ChangeRow[],
  demos: readonly DemoRow[],
  shown = SHOWN,
): Profile | null {
  const byChange = new Map(changes.map((r) => [r.district_id, r as unknown as Record<string, unknown>]))
  const byDemo = new Map(demos.map((r) => [r.district_id, r as unknown as Record<string, unknown>]))
  const c = changes.find((r) => r.district_id === districtId) ?? null
  const d = demos.find((r) => r.district_id === districtId) ?? null
  if (!c && !d) return null

  const valueOf = (key: string, id: number): number | null => num(byChange.get(id)?.[key]) ?? num(byDemo.get(id)?.[key])
  const allIds = [...new Set([...byChange.keys(), ...byDemo.keys()])]

  const candidates: StandOutRow[] = []
  for (const m of MEASURES) {
    const mine = valueOf(m.key, districtId)
    if (mine === null) continue
    const vals = allIds.map((id) => valueOf(m.key, id)).filter((x): x is number => x !== null)
    if (vals.length < 2) continue
    const mean = vals.reduce((a, b) => a + b, 0) / vals.length
    const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / vals.length)
    const z = sd > 0 ? (mine - mean) / sd : 0
    const min = Math.min(...vals)
    const max = Math.max(...vals)
    const side = z >= 0 ? 'top' : 'bottom'
    const n = side === 'top' ? rankHigh(vals, mine) : 1 + vals.filter((x) => x < mine).length
    candidates.push({
      key: m.key,
      label: m.label,
      icon: m.icon,
      figure: m.format(mine),
      approx: m.approx,
      side,
      n,
      phrase: rankPhrase(side, n),
      position: stripPosition(mine, min, max),
      median: stripPosition(median(vals), min, max),
      ticks: vals.map((v) => stripPosition(v, min, max)),
      z,
    })
  }
  candidates.sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
  const rows: StandOutRow[] = []
  const used = new Set<string>()
  for (const r of candidates) {
    const g = MEASURES.find((m) => m.key === r.key)!.group
    if (used.has(g)) continue
    used.add(g)
    rows.push(r)
    if (rows.length === shown) break
  }

  const pc = num(c?.pop_change_pct)
  let vintages: Record<string, string> = {}
  try {
    const v: unknown = JSON.parse(c?.vintages ?? '{}')
    if (v && typeof v === 'object') vintages = v as Record<string, string>
  } catch {
    /* keep empty */
  }
  return {
    headline: c && pc !== null ? { changePct: pc, pop2025: num(c.pop_2025), series: parseSeries(c.erp_series).slice(-SPARK_YEARS) } : null,
    rows,
    modelled: c?.modelled ?? false,
    method: c?.method ?? '',
    vintages,
    dataSource: d?.data_source ?? '',
  }
}
